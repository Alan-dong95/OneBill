import * as echarts from '../../components/ec-canvas/echarts';
import { request } from '../../utils/request';
import { categoryIcon } from '../../utils/categories';
import { buildPieOption } from '../../utils/charts';
import {
  dayKey,
  formatAmount,
  formatBillClockOrPeriod,
  formatDayTitle,
  toDateValue,
} from '../../utils/format';
import { getWindowWidth } from '../../utils/system';
import { MASCOT } from '../../utils/mascot';
import type { Bill, BillListResp } from '../../types/bill';
import type { StatsOverview } from '../../types/api';

interface BillRow {
  id: number;
  amountText: string;
  category: string;
  icon: string;
  description: string;
  time: string;
  /** movable-view 的 x（px），0 收起，-actionWidth 展开 */
  x: number;
  /** 原始金额，日合计用（避免从格式化字符串反算） */
  amount: number;
}

interface BillGroup {
  key: string;
  title: string;
  dayTotal: string;
  items: BillRow[];
}

/** 分类聚合结果 */
interface CategoryStat {
  name: string;
  value: number;
}

/** 编辑区 / 删除区 / 行高（设计稿 rpx） */
const ACTION_EDIT_RPX = 136;
const ACTION_DELETE_RPX = 136;
const ACTION_RPX = ACTION_EDIT_RPX + ACTION_DELETE_RPX;
const ROW_RPX = 128;
const PAGE_PAD_RPX = 32;
/** 主内容比可视区多出几个 px，盖住与操作区的接缝 */
const SEAM_PX = 3;
const PAGE_SIZE = 20;
/** 搜索输入防抖，避免每个字都打接口 */
const SEARCH_DEBOUNCE_MS = 300;

function layoutMetrics() {
  const windowWidth = getWindowWidth();
  const rpx = windowWidth / 750;
  const listWidth = Math.floor(windowWidth - PAGE_PAD_RPX * 2 * rpx);
  const actionWidth = Math.round(ACTION_RPX * rpx);
  return {
    listWidth,
    mainWidth: listWidth + SEAM_PX,
    actionWidth,
    openX: -(actionWidth + SEAM_PX),
    rowHeight: Math.round(ROW_RPX * rpx),
  };
}

/** 本地当前月 YYYY-MM（picker / 请求参数） */
function currentMonthValue(): string {
  return toDateValue().slice(0, 7);
}

/** YYYY-MM → 「2026年3月」 */
function monthLabelOf(month: string): string {
  const parts = month.split('-');
  const y = parts[0] || '';
  const m = Number(parts[1]) || 1;
  return `${y}年${m}月`;
}

/** 账单 → 行数据 */
function toBillRow(b: Bill): BillRow {
  return {
    id: b.id,
    amountText: formatAmount(b.amount),
    amount: Number(b.amount) || 0,
    category: b.category,
    icon: categoryIcon(b.category),
    description: b.description || '无备注',
    time: formatBillClockOrPeriod(b.bill_time, b.time_period),
    x: 0,
  };
}

/** 扁平账单按日分组（保持传入顺序：时间倒序） */
function groupBills(bills: Bill[]): BillGroup[] {
  const map = new Map<string, BillGroup>();
  const order: string[] = [];

  bills.forEach((b) => {
    const key = dayKey(b.bill_time);
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: formatDayTitle(b.bill_time),
        dayTotal: '0.00',
        items: [],
      });
      order.push(key);
    }
    map.get(key)!.items.push(toBillRow(b));
  });

  return order.map((k) => {
    const g = map.get(k)!;
    const sum = g.items.reduce((s, it) => s + it.amount, 0);
    return Object.assign({}, g, { dayTotal: formatAmount(sum) });
  });
}

/**
 * 追加分页：同日合并到已有组末尾；新日追加新组。
 * 日合计按已加载条目重算（跨页同日时会补全）。
 */
function appendBillsToGroups(groups: BillGroup[], bills: Bill[]): BillGroup[] {
  if (bills.length === 0) return groups;

  // 浅拷贝，避免直接改 data 引用
  const next = groups.map((g) =>
    Object.assign({}, g, { items: g.items.slice() }),
  );
  const indexByKey = new Map<string, number>();
  next.forEach((g, i) => indexByKey.set(g.key, i));

  bills.forEach((b) => {
    const key = dayKey(b.bill_time);
    const row = toBillRow(b);
    const idx = indexByKey.get(key);
    if (idx !== undefined) {
      next[idx].items.push(row);
    } else {
      indexByKey.set(key, next.length);
      next.push({
        key,
        title: formatDayTitle(b.bill_time),
        dayTotal: '0.00',
        items: [row],
      });
    }
  });

  return next.map((g) => {
    const sum = g.items.reduce((s, it) => s + it.amount, 0);
    return Object.assign({}, g, { dayTotal: formatAmount(sum) });
  });
}

Page({
  data: {
    mascotStand: MASCOT.stand,
    groups: [] as BillGroup[],
    loading: true,
    /** 触底加载更多中 */
    loadingMore: false,
    empty: false,
    loadError: false,
    totalCount: 0,
    /** 工具栏摘要：「共 N 笔」或「找到 N 笔相关账单」 */
    listSummary: '共 0 笔',
    hasMore: false,
    listWidth: 0,
    mainWidth: 0,
    actionWidth: 76,
    openX: -76,
    rowHeight: 64,
    /** 饼图无本月数据 */
    pieEmpty: true,
    /** lazyLoad：数据就绪后再 init；禁触摸避免和列表滚动冲突 */
    ecPie: { lazyLoad: true, disableTouch: true },
    /** 月份筛选：空字符串表示全部 */
    filterMonth: '',
    /** picker 展示值 YYYY-MM；未选时仍给个合法默认，避免 picker 异常 */
    monthPickerValue: '',
    monthPickerEnd: '',
    monthLabel: '全部',
    /** 搜索框内容（输入即时更新） */
    keyword: '',
    /** 是否处于搜索态（有非空关键词） */
    searching: false,
  },

  /** 拖动中的实时 x，避免高频 setData */
  _dragX: {} as Record<number, number>,
  _activeId: 0,
  /** 本次滑动是否移过阈值，抬手后点按不当成进编辑 */
  _swiped: false,
  /** id → 原始账单，进编辑页用 */
  _billMap: {} as Record<number, Bill>,
  /** 是否已完成过一次加载（用于区分首屏 / 刷新） */
  _hasLoaded: false,
  _page: 1,
  _loadingLock: false,
  /** 搜索防抖定时器 */
  _searchTimer: 0 as ReturnType<typeof setTimeout> | 0,
  _pieChart: null as { setOption: (o: unknown, notMerge?: boolean) => void; clear: () => void; dispose: () => void } | null,

  onLoad() {
    const month = currentMonthValue();
    this.setData(
      Object.assign({}, layoutMetrics(), {
        monthPickerValue: month,
        monthPickerEnd: month,
        filterMonth: '',
        monthLabel: '全部',
      }),
    );
  },

  onShow() {
    this.setData(layoutMetrics());
    // 从记一笔返回时重新从第 1 页拉
    this.reloadBills();
  },

  onUnload() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = 0;
    }
    // dispose 时 zrender 会调 removeEventListener；WxCanvas 已补空实现，再兜底防崩
    try {
      this._pieChart?.dispose();
    } catch (e) {
      /* ignore */
    }
    this._pieChart = null;
  },

  onPullDownRefresh() {
    // 下拉：按当前筛选条件从第 1 页重载
    this.reloadBills()
      .finally(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    this.reloadBills();
  },

  onReachBottom() {
    this.loadMore();
  },

  /** 选月份 */
  onMonthChange(e: WechatMiniprogram.PickerChange) {
    const value = String(e.detail.value || '');
    if (!value || value === this.data.filterMonth) return;
    this.setData({
      filterMonth: value,
      monthPickerValue: value,
      monthLabel: monthLabelOf(value),
    });
    this.reloadBills();
  },

  /** 清空月份 → 全部账单 */
  onClearMonth() {
    if (!this.data.filterMonth) return;
    const month = currentMonthValue();
    this.setData({
      filterMonth: '',
      monthPickerValue: month,
      monthLabel: '全部',
    });
    this.reloadBills();
  },

  /** 搜索输入：防抖后再请求，避免每个字都打接口 */
  onKeywordInput(e: WechatMiniprogram.Input) {
    const keyword = String(e.detail.value || '');
    this.setData({
      keyword,
      searching: !!keyword.trim(),
    });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._searchTimer = 0;
      // 搜索只刷新列表，饼图仍看本月，不必跟着刷
      this.reloadBills(false);
    }, SEARCH_DEBOUNCE_MS);
  },

  /** 清空搜索 → 回到当前月份筛选下的全部账单 */
  onClearKeyword() {
    if (!this.data.keyword && !this.data.searching) return;
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = 0;
    }
    this.setData({ keyword: '', searching: false });
    this.reloadBills(false);
  },

  /**
   * 从第 1 页重载列表；默认顺带刷新饼图。
   * @param refreshPie 搜索防抖场景传 false，避免打字时反复拉饼图
   */
  async reloadBills(refreshPie = true) {
    this._page = 1;
    this._dragX = {};
    this._activeId = 0;
    this._billMap = {};
    const tasks: Promise<unknown>[] = [this.fetchBills(false)];
    if (refreshPie) tasks.push(this.loadPie());
    await Promise.all(tasks);
  },

  /** 触底加载下一页 */
  async loadMore() {
    if (!this.data.hasMore || this._loadingLock || this.data.loadingMore) return;
    this._page += 1;
    await this.fetchBills(true);
  },

  /**
   * 拉取账单列表。
   * @param append true=追加分页；false=替换（首屏/筛选/下拉）
   */
  async fetchBills(append: boolean) {
    if (this._loadingLock) return;
    this._loadingLock = true;

    if (!append) {
      // 仅首屏整页 loading；刷新时保留图表，避免 canvas 被卸载
      if (!this._hasLoaded) {
        this._pieChart = null;
        this.setData({ loading: true });
      }
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const data: Record<string, string | number> = {
        page: this._page,
        page_size: PAGE_SIZE,
      };
      const kw = (this.data.keyword || '').trim();
      if (kw) {
        // 有关键词：跨全量搜备注/分类，不带月份
        data.keyword = kw;
      } else if (this.data.filterMonth) {
        data.month = this.data.filterMonth;
      }

      const res = await request<BillListResp>({
        url: '/api/v1/bills',
        data,
      });

      // 缓存原始账单，点进编辑时不用再请求
      if (!append) this._billMap = {};
      res.bills.forEach((b) => {
        this._billMap[b.id] = b;
      });

      const groups = append
        ? appendBillsToGroups(this.data.groups, res.bills)
        : groupBills(res.bills);

      this.setData({
        groups,
        totalCount: res.total,
        listSummary: kw
          ? `找到 ${res.total} 笔相关账单`
          : `共 ${res.total} 笔`,
        hasMore: res.has_more,
        empty: !append && res.bills.length === 0,
        loading: false,
        loadingMore: false,
        loadError: false,
      });
      this._hasLoaded = true;
    } catch (e) {
      // 追加失败回退页码，避免跳页空洞
      if (append && this._page > 1) this._page -= 1;
      // 首屏失败：错误态；追加失败仅 toast（request 已 toast）
      this.setData({
        loading: false,
        loadingMore: false,
        loadError: !append && !this._hasLoaded,
      });
    } finally {
      this._loadingLock = false;
    }
  },

  /**
   * 饼图始终看「日历本月」，与列表筛选解耦。
   * 走 stats/overview 服务端聚合，避免分页拉全量账单再前端凑。
   */
  async loadPie() {
    try {
      const month = currentMonthValue();
      const res = await request<StatsOverview>({
        url: '/api/v1/stats/overview',
        method: 'POST',
        data: { month, mode: 'month' },
      });
      const cats = res.by_category || [];
      const list: CategoryStat[] = [];
      for (let i = 0; i < cats.length; i++) {
        list.push({ name: cats[i].name, value: cats[i].amount });
      }
      const pie = { list, total: res.total };
      const pieEmpty = list.length === 0;
      if (pieEmpty !== this.data.pieEmpty) this._pieChart = null;

      this.setData({ pieEmpty }, () => {
        this.refreshCharts(pie);
      });
    } catch (e) {
      /* 饼图失败不影响列表 */
    }
  },

  /** 刷新 / 初始化饼图 */
  refreshCharts(pie: { list: CategoryStat[]; total: number }) {
    setTimeout(() => {
      if (pie.list.length > 0) {
        this.renderPie(pie.list, pie.total);
      } else {
        this._pieChart = null;
      }
    }, 50);
  },

  renderPie(list: CategoryStat[], total: number) {
    const option = buildPieOption(
      list.map((item) => ({ name: item.name, amount: item.value })),
      total,
      {
        subtext: '本月支出',
        labelFormatter: '{b}',
        labelWidth: 48,
        showTooltip: false,
      },
    );
    if (this._pieChart) {
      this._pieChart.setOption(option, true);
      return;
    }
    const comp = this.selectComponent('#chart-pie') as WechatMiniprogram.Component.TrivialInstance & {
      init: (cb: (canvas: unknown, w: number, h: number, dpr: number) => unknown) => void;
    };
    if (!comp) return;
    comp.init((canvas: any, width: number, height: number, dpr: number) => {
      const chart = echarts.init(canvas, null, {
        width,
        height,
        devicePixelRatio: dpr,
      });
      canvas.setChart(chart);
      chart.setOption(option);
      this._pieChart = chart;
      return chart;
    });
  },

  goAdd() {
    wx.switchTab({ url: '/pages/bill-add/bill-add' });
  },

  /** 跳转独立统计页 */
  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  /** 进入编辑页；eventChannel + storage 双保险回填 */
  goEdit(id: number) {
    const bill = this._billMap[id];
    if (!bill) {
      wx.showToast({ title: '账单不存在', icon: 'none' });
      return;
    }
    try {
      wx.setStorageSync('bill_edit', bill);
    } catch (e) {
      /* ignore */
    }
    wx.navigateTo({
      url: `/pages/bill-edit/bill-edit?id=${id}`,
      success: (res) => {
        try {
          res.eventChannel.emit('init', bill);
        } catch (e) {
          /* ignore */
        }
      },
    });
  },

  /** 点账单主体 → 进编辑（已展开则先收起） */
  onBillTap(e: WechatMiniprogram.BaseEvent) {
    if (this._swiped) {
      this._swiped = false;
      return;
    }
    const ds = e.currentTarget.dataset as { id?: number; gi?: number; ii?: number };
    const id = Number(ds.id) || 0;
    const gi = Number(ds.gi);
    const ii = Number(ds.ii);
    if (!id) return;

    const x = this.data.groups[gi]?.items[ii]?.x ?? 0;
    if (x !== 0) {
      this.closeAllExcept(0);
      return;
    }
    this.goEdit(id);
  },

  /** 长按 → 编辑 / 删除 */
  onBillLongPress(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    this.closeAllExcept(0);
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.goEdit(id);
        else if (res.tapIndex === 1) this.confirmDelete(id);
      },
    });
  },

  onSwipeStart(e: WechatMiniprogram.TouchEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    this._activeId = id;
    this._swiped = false;
    // 打开其它行时先全部收起
    this.closeAllExcept(id);
  },

  onSwipeChange(e: WechatMiniprogram.MovableViewChange) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    // 只记手指拖动，忽略 setData 回写
    if (e.detail.source === 'touch' || e.detail.source === 'touch-out-of-bounds') {
      this._dragX[id] = e.detail.x;
      // 滑开一点就算滑动，避免松手后误触进编辑
      if (Math.abs(e.detail.x) > 8) this._swiped = true;
    }
  },

  onSwipeEnd(e: WechatMiniprogram.TouchEvent) {
    const ds = e.currentTarget.dataset as { id?: number; gi?: number; ii?: number };
    const id = Number(ds.id) || 0;
    const gi = Number(ds.gi);
    const ii = Number(ds.ii);
    if (!id || Number.isNaN(gi) || Number.isNaN(ii)) return;

    const openX = this.data.openX;
    const cur =
      this._dragX[id] ??
      this.data.groups[gi]?.items[ii]?.x ??
      0;
    const open = cur < openX * 0.35;
    const target = open ? openX : 0;

    this._dragX[id] = target;
    this.setData({ [`groups[${gi}].items[${ii}].x`]: target });
    this._activeId = open ? id : 0;
  },

  closeAllExcept(exceptId: number) {
    const patch: Record<string, number> = {};
    this.data.groups.forEach((g, gi) => {
      g.items.forEach((it, ii) => {
        if (it.id !== exceptId && it.x !== 0) {
          patch[`groups[${gi}].items[${ii}].x`] = 0;
          this._dragX[it.id] = 0;
        }
      });
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  onEditTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    this.closeAllExcept(0);
    this.goEdit(id);
  },

  onDeleteTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    this.confirmDelete(id);
  },

  confirmDelete(id: number) {
    wx.showModal({
      title: '确定删除这笔账单吗？',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) {
          this.closeAllExcept(0);
          return;
        }
        try {
          await request({ url: `/api/v1/bills/${id}`, method: 'DELETE' });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.reloadBills();
        } catch (e) {
          this.closeAllExcept(0);
        }
      },
    });
  },
});

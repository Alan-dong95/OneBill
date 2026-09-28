import * as echarts from '../../components/ec-canvas/echarts';
import { request } from '../../utils/request';
import { formatAmount } from '../../utils/format';
import {
  buildBarOption,
  buildLineOption,
  buildPieOption,
  buildRankOption,
} from '../../utils/charts';
import { MASCOT } from '../../utils/mascot';
import { mdToHtml } from '../../utils/markdown';
import type { MonthlyReportResp, StatsOverview } from '../../types/api';
import { REPORT_FALLBACK_HINT } from '../../types/api';

/** 视图模式：月度 / 年度 */
type StatsMode = 'month' | 'year';

/** 点评卡片内 mp-html 标签样式（灰字正文，加粗深色） */
const COMMENT_TAG_STYLE = {
  p: 'margin:0;font-size:14px;line-height:1.7;color:#5a6b5e;',
  strong: 'font-weight:700;color:#1a2e1f;',
};

type ChartInst = {
  setOption: (o: unknown, notMerge?: boolean) => void;
  clear: () => void;
  dispose: () => void;
  resize: () => void;
};

/** 当前本地月份 YYYY-MM */
function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
}

/** YYYY-MM → 月度展示文案 */
function monthLabelOf(value: string): string {
  const [y, m] = value.split('-');
  return `${y}年${Number(m)}月`;
}

/** YYYY-MM → 年度展示文案 */
function yearLabelOf(value: string): string {
  const [y] = value.split('-');
  return `${y}年`;
}

/** 从 YYYY-MM 取年份字符串 */
function yearOf(value: string): string {
  return value.split('-')[0] || '';
}

/** 无 LLM 时根据统计拼一句点评 */
function composeLocalComment(data: StatsOverview, periodLabel: string): string {
  if (data.count === 0) {
    return `${periodLabel}一笔都没有。不是没被割，是账本还空着。`;
  }
  const cats = data.by_category || [];
  const top = cats[0];
  if (!top) {
    return `${periodLabel}花了 ¥${formatAmount(data.total)}，共 ${data.count} 笔。韭菜保护协会盯着你呢。`;
  }
  return (
    `${periodLabel}共花 ¥${formatAmount(data.total)}，${data.count} 笔。` +
    `「${top.name}」拿走 ¥${formatAmount(top.amount)}，占 ${top.percent}%，刀口在这。`
  );
}

/** 点评正文 + HTML，供 setData 一次性写入 */
function commentFields(text: string) {
  return {
    comment: text,
    commentHtml: mdToHtml(text),
    commentPlain: false,
  };
}

Page({
  data: {
    loading: true,
    empty: false,
    /** month | year */
    mode: 'month' as StatsMode,
    isYearMode: false,
    monthValue: '',
    /** picker 用的年份值 YYYY-01（fields=year 取前四位） */
    yearValue: '',
    monthEnd: '',
    yearEnd: '',
    /** 顶部选择器展示：2026年9月 / 2026年 */
    periodLabel: '',
    /** 大数字卡片主文案 */
    heroLabel: '',
    emptyHint: '',
    emptyDesc: '',
    trendTitle: '近 6 个月趋势',
    totalText: '0.00',
    count: 0,
    rankChartHeight: 280,
    comment: '',
    /** markdown 转好的 HTML，给 mp-html */
    commentHtml: '',
    /** 渲染失败时降级纯文本 */
    commentPlain: false,
    commentLoading: false,
    commentTagStyle: COMMENT_TAG_STYLE,
    commentContainerStyle: 'font-size:14px;line-height:1.7;color:#5a6b5e;',
    barEmpty: true,
    mascotSrc: MASCOT.reportLoading,
    ecPie: { lazyLoad: true, disableTouch: true },
    ecBar: { lazyLoad: true, disableTouch: true },
    ecLine: { lazyLoad: true, disableTouch: true },
    ecRank: { lazyLoad: true, disableTouch: true },
  },

  _pieChart: null as ChartInst | null,
  _barChart: null as ChartInst | null,
  _lineChart: null as ChartInst | null,
  _rankChart: null as ChartInst | null,
  _hasLoaded: false,
  /** 点评请求序号：切换周期后丢弃过期的复盘回包 */
  _commentSeq: 0,

  onLoad() {
    const month = currentMonthValue();
    const year = yearOf(month);
    this.setData({
      monthValue: month,
      yearValue: `${year}-01-01`,
      monthEnd: month,
      yearEnd: `${year}-12-31`,
      periodLabel: monthLabelOf(month),
      heroLabel: `${monthLabelOf(month)}支出`,
      emptyHint: '这个月还没记账',
      emptyDesc: '记一笔，分类占比才有刀口可看',
    });
    this.loadStats({ month, mode: 'month' });
  },

  onUnload() {
    // dispose 时 zrender 会调 removeEventListener；WxCanvas 已补空实现，再兜底防崩
    this.disposeAllCharts();
  },

  onPullDownRefresh() {
    this.loadStats({
      month: this.data.monthValue,
      mode: this.data.mode,
    }).finally(() => wx.stopPullDownRefresh());
  },

  /** 丢掉全部图表实例（切换模式/时间后重建） */
  disposeAllCharts() {
    const charts = [this._pieChart, this._barChart, this._lineChart, this._rankChart];
    charts.forEach((c) => {
      try {
        c?.dispose();
      } catch (e) {
        /* ignore */
      }
    });
    this._pieChart = null;
    this._barChart = null;
    this._lineChart = null;
    this._rankChart = null;
  },

  /** 根据 mode + 当前时间，刷新顶部文案 */
  syncLabels() {
    const { mode, monthValue } = this.data;
    if (mode === 'year') {
      const yl = yearLabelOf(monthValue);
      this.setData({
        isYearMode: true,
        periodLabel: yl,
        heroLabel: `${yl}共花了`,
        emptyHint: '这一年还没记账',
        emptyDesc: '记一笔，全年刀口才看得见',
        trendTitle: '年度趋势',
      });
    } else {
      const ml = monthLabelOf(monthValue);
      this.setData({
        isYearMode: false,
        periodLabel: ml,
        heroLabel: `${ml}支出`,
        emptyHint: '这个月还没记账',
        emptyDesc: '记一笔，分类占比才有刀口可看',
        trendTitle: '近 6 个月趋势',
      });
    }
  },

  /** 切换月度 / 年度 */
  onModeChange(e: WechatMiniprogram.TouchEvent) {
    const next = String((e.currentTarget.dataset as { mode?: string }).mode || '') as StatsMode;
    if (next !== 'month' && next !== 'year') return;
    if (next === this.data.mode) return;

    this.setData({ mode: next });
    this.syncLabels();
    this.disposeAllCharts();
    this.loadStats({ month: this.data.monthValue, mode: next });
  },

  onMonthChange(e: WechatMiniprogram.PickerChange) {
    const value = String(e.detail.value || '');
    if (!value || value === this.data.monthValue) return;
    // picker fields=month 返回 YYYY-MM
    this.setData({
      monthValue: value,
      yearValue: `${yearOf(value)}-01-01`,
    });
    this.syncLabels();
    this.disposeAllCharts();
    this.loadStats({ month: value, mode: 'month' });
  },

  onYearChange(e: WechatMiniprogram.PickerChange) {
    // fields=year 返回 YYYY；部分机型可能带 -01-01
    const raw = String(e.detail.value || '');
    const y = raw.slice(0, 4);
    if (!/^\d{4}$/.test(y)) return;
    const monthValue = `${y}-${this.data.monthValue.split('-')[1] || '01'}`;
    if (monthValue === this.data.monthValue && this.data.mode === 'year') return;
    this.setData({
      monthValue,
      yearValue: `${y}-01-01`,
    });
    this.syncLabels();
    this.disposeAllCharts();
    this.loadStats({ month: monthValue, mode: 'year' });
  },

  /** mp-html 出错：降级纯文字 */
  onCommentMdError() {
    this.setData({ commentPlain: true });
  },

  /**
   * 拉取统计。opts 显式传入周期，避免 setData 尚未同步时读到旧 month/mode。
   */
  async loadStats(opts?: { month?: string; mode?: StatsMode }) {
    const month = opts?.month || this.data.monthValue;
    const mode = opts?.mode || this.data.mode;
    const periodLabel = mode === 'year' ? yearLabelOf(month) : monthLabelOf(month);
    // 递增序号，作废上一轮点评请求
    const seq = ++this._commentSeq;

    if (!this._hasLoaded) {
      this.setData({ loading: true });
    }
    // 先清掉旧点评，避免切换瞬间仍显示上一周期文案
    this.setData({
      commentLoading: mode === 'month',
      comment: '',
      commentHtml: '',
      commentPlain: false,
    });

    try {
      const data = await request<StatsOverview>({
        url: '/api/v1/stats/overview',
        method: 'POST',
        data: { month, mode },
      });

      // 已切到更新的周期，丢弃本轮结果
      if (seq !== this._commentSeq) return;

      const empty = data.count === 0;
      const isYear = mode === 'year';
      const days = data.last_7_days || [];
      const topCategories = data.top_categories || [];
      // 年度视图不展示近 7 天
      const barEmpty = isYear || days.length === 0 || days.every((d) => d.amount <= 0);
      // 排行图高度随分类数自适应
      const rankH = Math.max(220, Math.min(520, 80 + topCategories.length * 56));

      // 空 ↔ 有数据切换时 canvas 会被卸载
      if (empty !== this.data.empty) {
        this._pieChart = null;
        this._rankChart = null;
      }
      if (barEmpty !== this.data.barEmpty) {
        this._barChart = null;
      }

      const localComment = composeLocalComment(data, periodLabel);
      const localFields = commentFields(localComment);

      this.setData(
        {
          loading: false,
          empty,
          barEmpty,
          totalText: formatAmount(data.total),
          count: data.count,
          rankChartHeight: rankH,
          // 本地先拼一句，保证切换后立刻对应当前周期
          comment: localFields.comment,
          commentHtml: localFields.commentHtml,
          commentPlain: localFields.commentPlain,
          commentLoading: !isYear && data.count > 0,
        },
        () => {
          this._hasLoaded = true;
          this.refreshCharts(data, mode);
        },
      );

      // 月度再拉复盘润色；年度只用本地点评
      if (!isYear) {
        this.fetchComment(data, month, periodLabel, seq);
      }
    } catch (e) {
      if (seq === this._commentSeq) {
        this.setData({ loading: false, commentLoading: false });
      }
    }
  },

  /** 复用月度复盘接口润色点评；失败/兜底则保留本地拼的句子 */
  async fetchComment(
    data: StatsOverview,
    month: string,
    periodLabel: string,
    seq: number,
  ) {
    // 已过期则直接退出
    if (seq !== this._commentSeq) return;

    if (data.count === 0) {
      this.setData(
        Object.assign(
          { commentLoading: false },
          commentFields(
            '这个月还没记账。韭菜保护协会提醒你：先记一笔，才知道刀从哪来。',
          ),
        ),
      );
      return;
    }

    try {
      const res = await request<MonthlyReportResp>({
        url: '/api/v1/report/monthly',
        method: 'POST',
        data: { month, force: false },
      });
      // 切换周期后忽略过期回包，防止旧点评盖住新周期
      if (seq !== this._commentSeq) return;

      const summary = (res.summary || '').trim();
      // LLM 挂了会返回「卡壳了」兜底；统计页没有「重新生成」，不能盖掉本地点评
      if (!summary || summary.includes(REPORT_FALLBACK_HINT)) {
        this.setData(
          Object.assign(
            { commentLoading: false },
            commentFields(composeLocalComment(data, periodLabel)),
          ),
        );
        return;
      }

      // 取首段作为「一句点评」，过长则截断
      let comment = summary.split(/\n+/)[0] || summary;
      if (comment.length > 120) {
        comment = `${comment.slice(0, 118)}…`;
      }
      this.setData(
        Object.assign(
          { commentLoading: false },
          commentFields(comment || composeLocalComment(data, periodLabel)),
        ),
      );
    } catch (e) {
      if (seq === this._commentSeq) {
        this.setData(
          Object.assign(
            { commentLoading: false },
            commentFields(composeLocalComment(data, periodLabel)),
          ),
        );
      }
    }
  },

  refreshCharts(data: StatsOverview, mode?: StatsMode) {
    const viewMode = mode || this.data.mode;
    setTimeout(() => {
      // 趋势图始终刷新；饼图/排行仅有数据时画
      this.renderLine(data.monthly_trend || []);
      const isYear = viewMode === 'year';
      const days = data.last_7_days || [];
      if (!isYear && days.some((d) => d.amount > 0)) {
        this.renderBar(days);
      } else {
        this._barChart = null;
      }
      if (data.count > 0) {
        const pieSub = isYear ? '本年支出' : '本月支出';
        this.renderPie(data.by_category || [], data.total, pieSub);
        this.renderRank(data.top_categories || []);
      } else {
        this._pieChart = null;
        this._rankChart = null;
      }
    }, 50);
  },

  /** 初始化或更新某张 ec-canvas */
  initOrUpdate(
    chartKey: '_pieChart' | '_barChart' | '_lineChart' | '_rankChart',
    selector: string,
    option: unknown,
  ) {
    const existing = this[chartKey];
    if (existing) {
      existing.setOption(option, true);
      return;
    }
    const comp = this.selectComponent(selector) as WechatMiniprogram.Component.TrivialInstance & {
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
      this[chartKey] = chart;
      return chart;
    });
  },

  renderPie(
    list: { name: string; amount: number; percent: number }[],
    total: number,
    subtext: string,
  ) {
    this.initOrUpdate(
      '_pieChart',
      '#chart-pie',
      buildPieOption(list, total, { subtext }),
    );
  },

  renderBar(days: { date: string; amount: number }[]) {
    this.initOrUpdate('_barChart', '#chart-bar', buildBarOption(days));
  },

  renderLine(trend: { month: string; amount: number }[]) {
    this.initOrUpdate('_lineChart', '#chart-line', buildLineOption(trend));
  },

  renderRank(list: { name: string; amount: number }[]) {
    this.initOrUpdate('_rankChart', '#chart-rank', buildRankOption(list));
  },

  goAdd() {
    wx.switchTab({ url: '/pages/bill-add/bill-add' });
  },
});

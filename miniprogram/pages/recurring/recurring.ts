import { request } from '../../utils/request';
import { categoryIcon } from '../../utils/categories';
import { formatAmount } from '../../utils/format';
import { getWindowWidth } from '../../utils/system';

interface RecurringItem {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  recurring_type: string;
  recurring_day: number;
  period_label: string;
  next_date: string;
}

interface RecurringListResp {
  items: RecurringItem[];
}

interface RecurringRow {
  id: number;
  amountText: string;
  category: string;
  icon: string;
  description: string;
  periodLabel: string;
  nextDateText: string;
  /** movable-view 的 x（px），0 收起，-actionWidth 展开 */
  x: number;
}

/** 仅删除按钮宽度 / 行高（设计稿 rpx） */
const ACTION_DELETE_RPX = 160;
const ROW_RPX = 168;
const PAGE_PAD_RPX = 32;
const SEAM_PX = 3;

function layoutMetrics() {
  const windowWidth = getWindowWidth();
  const rpx = windowWidth / 750;
  const listWidth = Math.floor(windowWidth - PAGE_PAD_RPX * 2 * rpx);
  const actionWidth = Math.round(ACTION_DELETE_RPX * rpx);
  return {
    listWidth,
    mainWidth: listWidth + SEAM_PX,
    actionWidth,
    openX: -(actionWidth + SEAM_PX),
    rowHeight: Math.round(ROW_RPX * rpx),
  };
}

/** next_date → 2026年3月24日 */
function formatNextDate(raw: string): string {
  const s = (raw || '').slice(0, 10);
  const parts = s.split('-');
  if (parts.length < 3) return s || '—';
  const y = parts[0];
  const m = Number(parts[1]) || 1;
  const d = Number(parts[2]) || 1;
  return `${y}年${m}月${d}日`;
}

function toRow(item: RecurringItem): RecurringRow {
  return {
    id: item.id,
    amountText: formatAmount(item.amount),
    category: item.category || '其他',
    icon: categoryIcon(item.category || '其他'),
    description: (item.description || '').trim() || '无备注',
    periodLabel: item.period_label || '',
    nextDateText: formatNextDate(item.next_date),
    x: 0,
  };
}

Page({
  data: {
    loading: true,
    empty: false,
    list: [] as RecurringRow[],
    listWidth: 0,
    mainWidth: 0,
    actionWidth: 0,
    openX: 0,
    rowHeight: 0,
  },

  _activeId: 0,
  _swiped: false,
  _dragX: {} as Record<number, number>,

  onLoad() {
    this.applyLayout();
  },

  onShow() {
    this.loadList();
  },

  applyLayout() {
    const m = layoutMetrics();
    this.setData({
      listWidth: m.listWidth,
      mainWidth: m.mainWidth,
      actionWidth: m.actionWidth,
      openX: m.openX,
      rowHeight: m.rowHeight,
    });
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await request<RecurringListResp>({
        url: '/api/v1/recurring',
        method: 'GET',
      });
      const items = (res && res.items) || [];
      const list: RecurringRow[] = [];
      for (let i = 0; i < items.length; i++) {
        list.push(toRow(items[i]));
      }
      this._dragX = {};
      this.setData({
        list,
        empty: list.length === 0,
        loading: false,
      });
    } catch (e) {
      console.error('[recurring] 加载失败', e);
      this.setData({ loading: false, empty: true, list: [] });
    }
  },

  onSwipeStart(e: WechatMiniprogram.TouchEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    this._activeId = id;
    this._swiped = false;
    this.closeAllExcept(id);
  },

  onSwipeChange(e: WechatMiniprogram.MovableViewChange) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    if (e.detail.source === 'touch' || e.detail.source === 'touch-out-of-bounds') {
      this._dragX[id] = e.detail.x;
      if (Math.abs(e.detail.x) > 8) this._swiped = true;
    }
  },

  onSwipeEnd(e: WechatMiniprogram.TouchEvent) {
    const ds = e.currentTarget.dataset as { id?: number; index?: number };
    const id = Number(ds.id) || 0;
    const index = Number(ds.index);
    if (!id || Number.isNaN(index)) return;

    const openX = this.data.openX;
    const cur = this._dragX[id] ?? this.data.list[index]?.x ?? 0;
    // 过半吸附展开，否则收起
    const nextX = cur < openX / 2 ? openX : 0;
    this._dragX[id] = nextX;
    this.setData({ [`list[${index}].x`]: nextX });
  },

  closeAllExcept(exceptId: number) {
    const patch: Record<string, number> = {};
    this.data.list.forEach((it, i) => {
      if (it.id !== exceptId && it.x !== 0) {
        patch[`list[${i}].x`] = 0;
        this._dragX[it.id] = 0;
      }
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  onDeleteTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id?: number }).id) || 0;
    if (!id) return;
    this.confirmDelete(id);
  },

  confirmDelete(id: number) {
    wx.showModal({
      title: '删除周期账单',
      content: '删掉后不会再自动记账，已生成的账单还在。',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) {
          this.closeAllExcept(0);
          return;
        }
        try {
          await request({ url: `/api/v1/recurring/${id}`, method: 'DELETE' });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadList();
        } catch (e) {
          this.closeAllExcept(0);
        }
      },
    });
  },
});

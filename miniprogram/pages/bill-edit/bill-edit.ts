import { request } from '../../utils/request';
import {
  CATEGORIES,
  categoryItem,
  loadRecentCategoryNames,
  pushRecentCategoryName,
  recentCategoriesFromBills,
} from '../../utils/categories';
import {
  formatAmount,
  sanitizeAmountInput,
  toDateValue,
} from '../../utils/format';
import type { Bill } from '../../types/bill';

/** 快捷金额（元），与手动记一致 */
const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

interface BillBrief {
  category: string;
}

interface BillUpdateResp {
  ok: boolean;
  bill: Bill;
}

Page({
  data: {
    billId: 0,
    amount: '',
    categories: CATEGORIES,
    recentCategories: [] as typeof CATEGORIES,
    selectedCategory: '餐饮',
    description: '',
    billDate: toDateValue(),
    submitting: false,
    canSubmit: false,
    quickAmounts: QUICK_AMOUNTS,
    /** 首屏回填中 */
    loading: true,
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id) || 0;
    if (!id) {
      wx.showToast({ title: '账单不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ billId: id });

    // 列表页经 eventChannel 传入完整账单，避免再拉接口
    try {
      const ec = this.getOpenerEventChannel();
      if (ec && typeof ec.on === 'function') {
        ec.on('init', (bill: Bill) => {
          this.fillFromBill(bill);
        });
      }
    } catch (e) {
      // 无 opener 时走本地缓存兜底
    }

    // 兜底：长按/异常跳转时从 storage 取
    const cached = wx.getStorageSync('bill_edit') as Bill | '';
    if (cached && typeof cached === 'object' && Number(cached.id) === id) {
      this.fillFromBill(cached);
      try {
        wx.removeStorageSync('bill_edit');
      } catch (e) {
        /* ignore */
      }
    }

    this.refreshRecentCategories();
  },

  onShow() {
    this.updateCanSubmit();
  },

  /** 用已有账单回填表单 */
  fillFromBill(bill: Bill) {
    if (!bill || Number(bill.id) !== this.data.billId) return;
    const amountNum = Number(bill.amount);
    const amount = !isNaN(amountNum) && amountNum > 0 ? formatAmount(amountNum) : '';
    let billDate = toDateValue();
    try {
      billDate = toDateValue(new Date(bill.bill_time));
    } catch (e) {
      /* 非法时间则留今天 */
    }
    this.setData(
      {
        amount,
        selectedCategory: bill.category || '餐饮',
        description: bill.description || '',
        billDate,
        loading: false,
      },
      () => this.updateCanSubmit(),
    );
  },

  /** 从历史账单刷新「最近使用」分类 */
  async refreshRecentCategories() {
    try {
      const res = await request<{ bills: BillBrief[] }>({
        url: '/api/v1/bills',
        method: 'GET',
        data: { page: 1, page_size: 50 },
      });
      let recent = recentCategoriesFromBills(res.bills || [], 3);
      if (!recent.length) {
        const names = loadRecentCategoryNames();
        recent = names
          .map((n) => categoryItem(n))
          .filter((x): x is NonNullable<typeof x> => !!x);
      }
      this.setData({ recentCategories: recent });
    } catch (e) {
      const names = loadRecentCategoryNames();
      const recent = names
        .map((n) => categoryItem(n))
        .filter((x): x is NonNullable<typeof x> => !!x);
      this.setData({ recentCategories: recent });
    }
  },

  bumpRecentCategory(name: string) {
    const names = pushRecentCategoryName(name, 3);
    const recent = names
      .map((n) => categoryItem(n))
      .filter((x): x is NonNullable<typeof x> => !!x);
    this.setData({ recentCategories: recent });
  },

  updateCanSubmit() {
    const num = Number(this.data.amount);
    const canSubmit =
      !!this.data.billId &&
      !!this.data.amount &&
      !isNaN(num) &&
      num > 0 &&
      !this.data.submitting;
    this.setData({ canSubmit });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    const amount = sanitizeAmountInput(e.detail.value);
    this.setData({ amount }, () => this.updateCanSubmit());
  },

  onQuickAmountTap(e: WechatMiniprogram.BaseEvent) {
    const raw = (e.currentTarget.dataset as { amount?: number | string }).amount;
    const num = Number(raw);
    if (!num || isNaN(num)) return;
    const amount = sanitizeAmountInput(String(num));
    this.setData({ amount }, () => this.updateCanSubmit());
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const cat = (e.currentTarget.dataset as { cat?: string }).cat;
    if (!cat) return;
    this.setData({ selectedCategory: cat });
  },

  onDescInput(e: WechatMiniprogram.Input) {
    this.setData({ description: e.detail.value });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ billDate: e.detail.value as string });
  },

  async submit() {
    const {
      billId,
      amount,
      selectedCategory,
      description,
      billDate,
      submitting,
      canSubmit,
    } = this.data;
    if (submitting || !canSubmit || !billId) return;

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    // 与手动记一致：当天中午本地时间，避免跨时区偏移
    const billTime = new Date(`${billDate}T12:00:00`);

    this.setData({ submitting: true, canSubmit: false });
    try {
      await request<BillUpdateResp>({
        url: `/api/v1/bills/${billId}`,
        method: 'PUT',
        data: {
          amount: numAmount,
          category: selectedCategory,
          description: description.trim() || null,
          bill_time: billTime.toISOString(),
        },
      });
      this.bumpRecentCategory(selectedCategory);
      wx.showToast({ title: '已更新', icon: 'success' });
      // 稍等 toast，再回列表；列表 onShow 会刷新
      setTimeout(() => {
        wx.navigateBack();
      }, 500);
    } catch (e) {
      // 错误已由 request toast
    } finally {
      this.setData({ submitting: false });
      this.updateCanSubmit();
    }
  },
});

import { request } from '../../utils/request';
import { formatAmount, sanitizeAmountInput } from '../../utils/format';

interface BudgetOut {
  monthly_budget: number;
  spent: number;
  remaining: number;
  percent: number;
}

/** 进度条颜色：<80 绿 / ≥80 黄 / ≥100 红 */
function calcBarColor(percent: number, hasBudget: boolean): string {
  if (!hasBudget) return '#27ae60';
  if (percent >= 100) return '#e74c3c';
  if (percent >= 80) return '#f39c12';
  return '#27ae60';
}

/** 进度条宽度百分比，封顶 100 避免溢出 */
function calcBarWidth(percent: number, hasBudget: boolean): number {
  if (!hasBudget) return 0;
  if (percent <= 0) return 0;
  return percent >= 100 ? 100 : Math.round(percent);
}

Page({
  data: {
    loading: true,
    saving: false,
    /** 输入框草稿 */
    draft: '',
    hasBudget: false,
    budgetText: '0.00',
    spentText: '0.00',
    remainingText: '0.00',
    percentText: '0',
    remainingNegative: false,
    progressWidth: 0,
    progressColor: '#27ae60',
  },

  onShow() {
    this.loadBudget();
  },

  async loadBudget() {
    this.setData({ loading: true });
    try {
      const data = await request<BudgetOut>({ url: '/api/v1/budget' });
      this.applyBudget(data);
    } catch (e) {
      console.error('[budget] 加载失败', e);
      this.setData({ loading: false });
    }
  },

  applyBudget(data: BudgetOut) {
    const budget = Number(data.monthly_budget) || 0;
    const spent = Number(data.spent) || 0;
    const remaining = Number(data.remaining) || 0;
    const percent = Number(data.percent) || 0;
    const hasBudget = budget > 0;

    this.setData({
      loading: false,
      draft: hasBudget ? formatAmount(budget) : '',
      hasBudget,
      budgetText: formatAmount(budget),
      spentText: formatAmount(spent),
      remainingText: formatAmount(Math.abs(remaining)),
      remainingNegative: hasBudget && remaining < 0,
      percentText: hasBudget ? String(Math.round(percent)) : '0',
      progressWidth: calcBarWidth(percent, hasBudget),
      progressColor: calcBarColor(percent, hasBudget),
    });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    this.setData({ draft: sanitizeAmountInput(e.detail.value) });
  },

  async onSave() {
    if (this.data.saving) return;
    const raw = (this.data.draft || '').trim();
    // 空串视为取消预算（设为 0）
    let amount = 0;
    if (raw) {
      amount = Number(raw);
      if (isNaN(amount) || amount < 0) {
        wx.showToast({ title: '金额不对劲', icon: 'none' });
        return;
      }
    }

    this.setData({ saving: true });
    try {
      const data = await request<BudgetOut>({
        url: '/api/v1/budget',
        method: 'POST',
        data: { monthly_budget: amount },
      });
      this.applyBudget(data);
      this.setData({ saving: false });
      wx.showToast({
        title: amount > 0 ? '预算已锁定' : '已取消预算',
        icon: 'success',
      });
    } catch (e) {
      console.error('[budget] 保存失败', e);
      this.setData({ saving: false });
    }
  },

  /** 一键清空预算 */
  onClear() {
    this.setData({ draft: '' });
  },
});

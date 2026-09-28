import { request } from '../../utils/request';
import { categoryIcon } from '../../utils/categories';
import {
  currentMonthRange,
  formatAmount,
  formatBillTime,
  toDateValue,
} from '../../utils/format';
import { MASCOT, MONTH_FLEECED_YUAN, MONTH_SAFE_YUAN } from '../../utils/mascot';
import type { BillListResp } from '../../types/bill';
import type { BudgetOut, StatsDailyItem, StatsOverview } from '../../types/api';

/** 今日未花钱时，深色卡片底部的随机小韭菜文案 */
const CARD_SAFE_TIPS = [
  '这个月还没花，稳住了~',
  '韭菜保护协会表示很欣慰',
  '今天还没花钱，继续保持',
  '账本安安静静，小韭菜给你点赞',
  '钱包今天没挨刀，好日子',
  '零支出日，协会发锦旗了',
  '别急着花，刀口在等你呢',
];

interface RecentBill {
  id: number;
  amountText: string;
  category: string;
  icon: string;
  description: string;
  time: string;
}

/** 从近 7 天里取今日支出（date 为 MM-DD） */
function todayAmountFromStats(days: StatsDailyItem[] | undefined): number {
  if (!days || !days.length) return 0;
  const now = new Date();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  const key = `${mm}-${dd}`;
  for (let i = 0; i < days.length; i++) {
    if (days[i].date === key) return Number(days[i].amount) || 0;
  }
  return 0;
}

/** 预算接口失败不挡首页；404/未迁移时静默 */
async function fetchBudgetSafe(): Promise<BudgetOut | null> {
  try {
    return await request<BudgetOut>({ url: '/api/v1/budget' });
  } catch (e) {
    console.warn('[index] 预算拉取失败', e);
    return null;
  }
}

Page({
  data: {
    loading: true,
    loadError: false,
    monthLabel: '',
    monthTotal: '0.00',
    monthCount: 0,
    recent: [] as RecentBill[],
    tip: '今天，又被谁割了？',
    mascotSrc: MASCOT.stand,
    /** 深色主卡片：今日金额 + 底部小韭菜文案 */
    todayTotal: '0.00',
    cardTip: CARD_SAFE_TIPS[0],
    mascotStand: MASCOT.stand,
    mascotReportLoading: MASCOT.reportLoading,
    /** 预算提醒：'' | 'warn' | 'danger' */
    budgetAlertLevel: '',
    budgetAlertText: '',
  },

  _hasLoaded: false,
  _loadSeq: 0,

  onShow() {
    this.loadOverview();
  },

  onPullDownRefresh() {
    this.loadOverview().finally(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    this.loadOverview();
  },

  async loadOverview() {
    const { label } = currentMonthRange();
    const seq = ++this._loadSeq;
    // 首次才整页 loading，避免 onShow 闪「加载中」
    if (!this._hasLoaded) {
      this.setData({ monthLabel: label, loading: true, loadError: false });
    } else {
      this.setData({ monthLabel: label, loadError: false });
    }

    try {
      const month = toDateValue().slice(0, 7);
      // 汇总走 SQL 聚合；最近 5 笔仍拉列表；预算用于超支提醒
      const [stats, recentRes, budget] = await Promise.all([
        request<StatsOverview>({
          url: '/api/v1/stats/overview',
          method: 'POST',
          data: { month, mode: 'month' },
        }),
        request<BillListResp>({
          url: '/api/v1/bills',
          data: { page: 1, page_size: 5 },
        }),
        fetchBudgetSafe(),
      ]);

      if (seq !== this._loadSeq) return;

      const total = Number(stats.total) || 0;
      const monthCount = stats.count || 0;
      const todaySum = todayAmountFromStats(stats.last_7_days);

      let cardTip: string;
      if (todaySum > 0) {
        cardTip = `今天又被割了${formatAmount(todaySum)}块...`;
      } else {
        const idx = Math.floor(Math.random() * CARD_SAFE_TIPS.length);
        cardTip = CARD_SAFE_TIPS[idx];
      }

      const recent = recentRes.bills.map((b) => ({
        id: b.id,
        amountText: formatAmount(b.amount),
        category: b.category,
        icon: categoryIcon(b.category),
        description: b.description || b.category,
        time: formatBillTime(b.bill_time, b.time_period),
      }));

      const fleeced = monthCount > 0 && total >= MONTH_FLEECED_YUAN;
      const celebrate = monthCount > 0 && total > 0 && total < MONTH_SAFE_YUAN;

      let tip = '记账护身，少做一棵韭菜';
      let mascotSrc = MASCOT.stand;
      if (monthCount === 0) {
        tip = '本月还没被割，记一笔护住钱包';
        mascotSrc = MASCOT.stand;
      } else if (fleeced) {
        tip = '本月刀口有点深，护好自己';
        mascotSrc = MASCOT.fleeced;
      } else if (celebrate) {
        tip = '本月花得克制，稳住了';
        mascotSrc = MASCOT.celebrate;
      }

      // 预算为 0 不提醒；≥100% 红，≥80% 黄
      let budgetAlertLevel = '';
      let budgetAlertText = '';
      if (budget) {
        const budgetAmt = Number(budget.monthly_budget) || 0;
        const percent = Number(budget.percent) || 0;
        if (budgetAmt > 0 && percent >= 100) {
          budgetAlertLevel = 'danger';
          budgetAlertText = '韭菜保护协会提醒：本月预算已超，收手吧';
        } else if (budgetAmt > 0 && percent >= 80) {
          budgetAlertLevel = 'warn';
          budgetAlertText = '韭菜警告：本月已花80%预算了';
        }
      }

      this._hasLoaded = true;
      this.setData({
        monthTotal: formatAmount(total),
        monthCount,
        todayTotal: formatAmount(todaySum),
        cardTip,
        recent,
        tip,
        mascotSrc,
        budgetAlertLevel,
        budgetAlertText,
        loading: false,
        loadError: false,
      });
    } catch (e) {
      if (seq !== this._loadSeq) return;
      this.setData({ loading: false, loadError: true });
    }
  },

  goReport() {
    wx.navigateTo({ url: '/pages/report/report' });
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  goAdd() {
    wx.switchTab({ url: '/pages/bill-add/bill-add' });
  },

  goList() {
    wx.switchTab({ url: '/pages/bill-list/bill-list' });
  },
});

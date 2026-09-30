import { API_BASE } from '../../config';
import { ensureLogin } from '../../utils/auth';
import { request } from '../../utils/request';
import { MASCOT } from '../../utils/mascot';
import type { BudgetOut, StatsOverview } from '../../types/api';

interface UserProfile {
  id: number;
  nickname: string | null;
  created_at: string | null;
}

interface BadgeInfo {
  badge: string;
  hint: string;
  /** 系统称号（头像下方第二行） */
  title: string;
  avatar: string;
}

const DEFAULT_NICK = '小韭菜';
const DEFAULT_TITLE = '韭菜保护协会会员';

/** 预算接口失败不挡「我的」页 */
async function fetchBudgetSafe(): Promise<BudgetOut | null> {
  try {
    return await request<BudgetOut>({ url: '/api/v1/budget' });
  } catch (e) {
    console.warn('[profile] 预算拉取失败', e);
    return null;
  }
}

/** 根据本月支出算出成就 / 称号 / 头像（按优先级命中第一条） */
function resolveBadge(total: number, foodPercent: number): BadgeInfo {
  if (total < 500) {
    return {
      badge: '本月节俭王',
      hint: '刀口浅，协会给你竖大拇指',
      title: '省钱小能手',
      avatar: MASCOT.celebrate,
    };
  }
  if (foodPercent > 60) {
    return {
      badge: '外卖战士',
      hint: '餐饮占比有点高，刀从碗里来',
      title: '外卖小王子',
      avatar: MASCOT.takeout,
    };
  }
  if (total > 3000) {
    return {
      badge: '月光族',
      hint: '本月超 3000，钱包喊疼了',
      title: '月光大使',
      avatar: MASCOT.fleeced,
    };
  }
  return {
    badge: '正在努力省钱',
    hint: '不骄不躁，继续记账护身',
    title: DEFAULT_TITLE,
    avatar: MASCOT.stand,
  };
}

/** 注册日起算会员天数，至少算 1 天 */
function calcMemberDays(createdAt: string | null): number {
  if (!createdAt) return 1;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 1;
  const diff = Date.now() - created;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
  return days > 0 ? days : 1;
}

/** 本月支出展示：整数不带小数，否则保留两位 */
function formatMoney(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v - Math.round(v)) < 1e-9) {
    return '¥' + Math.round(v);
  }
  return '¥' + v.toFixed(2);
}

Page({
  data: {
    mascotSrc: MASCOT.stand,
    nickname: DEFAULT_NICK,
    title: DEFAULT_TITLE,
    memberDays: 1,
    monthTotalText: '¥0',
    monthCount: 0,
    streakDays: 0,
    badge: '正在努力省钱',
    badgeHint: '',
    /** 功能列表右侧：未设 / ¥金额 */
    budgetLabel: '未设置',
    showNickModal: false,
    nickDraft: '',
    savingNick: false,
    exporting: false,
    deletingAccount: false,
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const [user, stats, budget] = await Promise.all([
        request<UserProfile>({ url: '/api/v1/auth/me' }),
        request<StatsOverview>({
          url: '/api/v1/stats/overview',
          method: 'POST',
          data: { mode: 'month' },
        }),
        fetchBudgetSafe(),
      ]);

      const nickname = (user.nickname && user.nickname.trim()) || DEFAULT_NICK;
      const memberDays = calcMemberDays(user.created_at);

      let foodPercent = 0;
      const cats = stats.by_category || [];
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].name === '餐饮') {
          foodPercent = cats[i].percent;
          break;
        }
      }
      const badgeInfo = resolveBadge(stats.total || 0, foodPercent);

      const budgetAmt = budget ? Number(budget.monthly_budget) || 0 : 0;
      const budgetLabel = budgetAmt > 0 ? formatMoney(budgetAmt) : '未设置';

      this.setData({
        nickname,
        title: badgeInfo.title,
        mascotSrc: badgeInfo.avatar,
        memberDays,
        monthTotalText: formatMoney(stats.total || 0),
        monthCount: stats.count || 0,
        streakDays: stats.streak_days || 0,
        badge: badgeInfo.badge,
        badgeHint: badgeInfo.hint,
        budgetLabel,
      });
    } catch (e) {
      console.error('[profile] 加载失败', e);
      // 失败时保留默认展示，不打断页面
    }
  },

  onEditNickname() {
    this.setData({
      showNickModal: true,
      nickDraft: this.data.nickname === DEFAULT_NICK ? '' : this.data.nickname,
    });
  },

  onCloseNickModal() {
    if (this.data.savingNick) return;
    this.setData({ showNickModal: false });
  },

  onNickInput(e: WechatMiniprogram.Input) {
    this.setData({ nickDraft: e.detail.value });
  },

  async onSaveNickname() {
    if (this.data.savingNick) return;
    const nick = (this.data.nickDraft || '').trim();
    if (!nick) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }

    this.setData({ savingNick: true });
    try {
      const user = await request<UserProfile>({
        url: '/api/v1/auth/me',
        method: 'PUT',
        data: { nickname: nick },
      });
      this.setData({
        nickname: (user.nickname && user.nickname.trim()) || nick,
        showNickModal: false,
        savingNick: false,
      });
      wx.showToast({ title: '改好了', icon: 'success' });
    } catch (e) {
      console.error('[profile] 保存昵称失败', e);
      this.setData({ savingNick: false });
    }
  },

  /** 导出 CSV：wx.downloadFile 带鉴权下载 */
  onExport() {
    if (this.data.exporting) return;
    this.downloadExportCsv();
  },

  /** 用 wx.downloadFile 拉 CSV（带鉴权头） */
  async downloadExportCsv() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      let token = await ensureLogin();
      let res = await this._downloadExportOnce(token);

      // token 过期：强制重登后再下一次
      if (res.statusCode === 401) {
        token = await ensureLogin(true);
        res = await this._downloadExportOnce(token);
      }

      wx.hideLoading();
      if (res.statusCode >= 400 || !res.tempFilePath) {
        wx.showToast({ title: '导出失败，稍后再试', icon: 'none' });
        return;
      }

      // 落到用户目录，文件名与后端 Content-Disposition 对齐
      const now = new Date();
      const month =
        now.getFullYear() +
        '-' +
        String(now.getMonth() + 1).padStart(2, '0');
      const dest = wx.env.USER_DATA_PATH + '/bills_' + month + '.csv';
      try {
        wx.getFileSystemManager().copyFileSync(res.tempFilePath, dest);
      } catch (copyErr) {
        // 落盘失败仍算下载成功，临时文件也能在开发者工具里看到
        console.warn('[profile] CSV 落盘失败', copyErr);
      }

      wx.showToast({
        title: '已导出，可在文件管理里查看',
        icon: 'none',
        duration: 2500,
      });
    } catch (e) {
      console.error('[profile] 导出失败', e);
      wx.hideLoading();
      wx.showToast({ title: '导出失败，稍后再试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  /** 单次 downloadFile，给 401 重试用 */
  _downloadExportOnce(
    token: string,
  ): Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: API_BASE + '/api/v1/bills/export',
        header: { Authorization: 'Bearer ' + token },
        success: resolve,
        fail: reject,
      });
    });
  },

  onBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' });
  },

  onRecurring() {
    wx.navigateTo({ url: '/pages/recurring/recurring' });
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定清掉本地登录态？下次用还得再登录。',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (!res.confirm) return;
        this.clearLocalSession();
        wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  /** 注销：二次确认 → 删服务端数据 → 清本地 */
  onDeleteAccount() {
    if (this.data.deletingAccount) return;
    wx.showModal({
      title: '注销账号',
      content: '账单、月报、周期账、反馈会全部删掉，且不可恢复。确定？',
      confirmText: '继续',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (!res.confirm) return;
        wx.showModal({
          title: '最后确认',
          content: '真的注销？协会账本要清空了。',
          confirmText: '注销',
          confirmColor: '#e74c3c',
          success: (res2) => {
            if (!res2.confirm) return;
            this.doDeleteAccount();
          },
        });
      },
    });
  },

  async doDeleteAccount() {
    if (this.data.deletingAccount) return;
    this.setData({ deletingAccount: true });
    wx.showLoading({ title: '注销中…', mask: true });
    try {
      await request<{ ok?: boolean }>({
        url: '/api/v1/auth/me',
        method: 'DELETE',
      });
      wx.hideLoading();
      this.clearLocalSession({ wipeChat: true });
      wx.showToast({ title: '账号已注销', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 500);
    } catch (e) {
      console.error('[profile] 注销失败', e);
      wx.hideLoading();
    } finally {
      this.setData({ deletingAccount: false });
    }
  },

  /** wipeChat：注销时清问答本地缓存；退出登录保留会话记录 */
  clearLocalSession(opts?: { wipeChat?: boolean }) {
    wx.removeStorageSync('token');
    if (opts?.wipeChat) {
      try {
        // 与 ask 页 CHAT_HISTORY_KEY 对齐
        wx.removeStorageSync('chat_history');
      } catch (e) {
        // storage 异常不挡注销收尾
      }
    }
    const app = getApp<IAppOption>();
    if (app?.globalData) {
      app.globalData.token = '';
    }
  },

  /** 挡住弹窗下层滚动 */
  noop() {},
});

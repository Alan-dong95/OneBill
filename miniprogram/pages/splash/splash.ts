import { ensureLogin } from '../../utils/auth';
import { MASCOT } from '../../utils/mascot';

/** 启动页最短展示，避免闪一下就切走 */
const MIN_SPLASH_MS = 800;

/** 隐私协议同意标记，同意后不再弹窗 */
const AGREE_KEY = 'has_agreed';

Page({
  data: {
    mascot: MASCOT.stand,
    /** 登录中 / 失败可重试 */
    loginFailed: false,
    entering: true,
    /** 首次进入：未同意协议时展示弹窗，挡住登录 */
    showAgreement: false,
  },

  onLoad() {
    const agreed = !!wx.getStorageSync(AGREE_KEY);
    if (!agreed) {
      // 未同意前不调 ensureLogin / wx.login
      this.setData({ showAgreement: true, entering: false });
      return;
    }
    this.enterApp();
  },

  async enterApp() {
    this.setData({ loginFailed: false, entering: true, showAgreement: false });
    const started = Date.now();

    try {
      await ensureLogin();
      const elapsed = Date.now() - started;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      wx.switchTab({ url: '/pages/index/index' });
    } catch (e) {
      console.error('[splash] 登录失败', e);
      this.setData({ loginFailed: true, entering: false });
    }
  },

  onRetryLogin() {
    this.enterApp();
  },

  /** 同意协议：落盘后才走微信登录 */
  onAgree() {
    wx.setStorageSync(AGREE_KEY, true);
    this.setData({ showAgreement: false });
    this.enterApp();
  },

  /** 拒绝：提示后退出小程序 */
  onRefuse() {
    wx.showToast({ title: '不同意协议无法使用', icon: 'none', duration: 1500 });
    setTimeout(() => {
      wx.exitMiniProgram({});
    }, 1500);
  },

  goUserAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' });
  },

  goPrivacyAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' });
  },

  /** 阻住遮罩层滚动穿透 */
  noop() {},
});

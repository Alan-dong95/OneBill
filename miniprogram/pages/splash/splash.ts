import { ensureLogin } from '../../utils/auth';
import { MASCOT } from '../../utils/mascot';

/** 启动页最短展示，避免闪一下就切走 */
const MIN_SPLASH_MS = 800;

Page({
  data: {
    mascot: MASCOT.stand,
    /** 登录中 / 失败可重试 */
    loginFailed: false,
    entering: true,
  },

  onLoad() {
    this.enterApp();
  },

  async enterApp() {
    this.setData({ loginFailed: false, entering: true });
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
});

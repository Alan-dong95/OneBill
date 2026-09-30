import { ensureLogin } from './utils/auth';

App<IAppOption>({
  globalData: {
    token: '',
  },

  async onLaunch() {
    // 未同意隐私协议前不触发微信登录，交给启动页弹窗
    if (!wx.getStorageSync('has_agreed')) return;

    try {
      const token = await ensureLogin();
      this.globalData.token = token;
      console.log('[app] 登录成功');
    } catch (e) {
      console.error('[app] 登录失败', e);
    }
  },
});

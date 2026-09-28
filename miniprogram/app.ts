import { ensureLogin } from './utils/auth';

App<IAppOption>({
  globalData: {
    token: '',
  },

  async onLaunch() {
    try {
      const token = await ensureLogin();
      this.globalData.token = token;
      console.log('[app] 登录成功');
    } catch (e) {
      console.error('[app] 登录失败', e);
    }
  },
});

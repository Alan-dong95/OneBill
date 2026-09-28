import { API_BASE } from '../config';
import { wxRequest } from './wx';

/** 进行中的登录 Promise，并发调用共用一次 wx.login */
let _loginPromise: Promise<string> | null = null;

/**
 * 微信登录：wx.login 拿 code → 后端换 openid → 存 JWT
 */
export async function login(): Promise<string> {
  const loginRes = await wx.login();
  if (!loginRes.code) {
    throw new Error(loginRes.errMsg || 'wx.login 失败');
  }

  const res = await wxRequest({
    url: API_BASE + '/api/v1/auth/login',
    method: 'POST',
    header: { 'content-type': 'application/json' },
    data: { code: loginRes.code },
  });

  if (res.statusCode >= 400) {
    const msg = (res.data as { detail?: unknown })?.detail || '登录失败';
    throw new Error(String(msg));
  }

  const data = res.data as { token?: string };
  if (!data?.token) {
    throw new Error('登录响应缺少 token');
  }

  wx.setStorageSync('token', data.token);
  const app = getApp<IAppOption>();
  if (app?.globalData) {
    app.globalData.token = data.token;
  }
  return data.token;
}

/**
 * 确保已登录：有 token 直接返回；否则单飞 login。
 * force=true 时清掉本地 token 并重新登录（401 重试用）。
 */
export function ensureLogin(force = false): Promise<string> {
  if (!force) {
    const existing = wx.getStorageSync('token') as string;
    if (existing) return Promise.resolve(existing);
  } else {
    wx.removeStorageSync('token');
    const app = getApp<IAppOption>();
    if (app?.globalData) {
      app.globalData.token = '';
    }
  }

  if (_loginPromise) return _loginPromise;

  _loginPromise = login().finally(() => {
    _loginPromise = null;
  });
  return _loginPromise;
}

import { API_BASE } from '../config';
import { ensureLogin } from './auth';
import { wxRequest } from './wx';

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  /** 是否需要登录，默认 true */
  auth?: boolean;
  /** 超时 ms；OCR 等长请求可拉长 */
  timeout?: number;
  /** 内部：401 后是否已重试过，防止死循环 */
  _retried?: boolean;
}

/** FastAPI 的 detail 可能是 string 或校验错误数组 */
function formatDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string };
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return fallback;
}

/**
 * 统一请求封装：自动 ensureLogin，401 强制重登并重试一次
 */
export async function request<T = unknown>(options: RequestOptions): Promise<T> {
  if (options.auth !== false) {
    await ensureLogin();
  }

  const token = wx.getStorageSync('token') as string;
  const header: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false && token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  const reqOpt: WechatMiniprogram.RequestOption = {
    url: API_BASE + options.url,
    method: options.method || 'GET',
    data: options.data,
    header,
  };
  if (typeof options.timeout === 'number' && options.timeout > 0) {
    reqOpt.timeout = options.timeout;
  }

  const res = await wxRequest(reqOpt);

  // 401：token 过期，强制重新登录后重试一次
  if (res.statusCode === 401 && options.auth !== false && !options._retried) {
    await ensureLogin(true);
    return request<T>(Object.assign({}, options, { auth: true, _retried: true }));
  }

  if (res.statusCode >= 400) {
    const raw = (res.data as { detail?: unknown })?.detail;
    const msg = formatDetail(raw, '请求失败');
    wx.showToast({ title: msg, icon: 'none' });
    throw new Error(msg);
  }

  return res.data as T;
}

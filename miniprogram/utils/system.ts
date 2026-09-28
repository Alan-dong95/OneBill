/**
 * 系统信息读取：优先用新 API，兼容旧基础库回退。
 * 避免 wx.getSystemInfoSync 弃用警告。
 */

function safeCall<T>(fn: (() => T) | undefined): T | null {
  if (typeof fn !== 'function') return null;
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

/** 是否可用新系统信息 API（基础库 >= 2.20.1） */
function canUseNewSystemApi(): boolean {
  return typeof wx.getWindowInfo === 'function' && typeof wx.getAppBaseInfo === 'function';
}

/** 仅旧基础库才回退；新环境宁可给默认值，也不触发弃用警告 */
function legacySystemInfo(): WechatMiniprogram.SystemInfo | null {
  if (canUseNewSystemApi()) return null;
  try {
    return wx.getSystemInfoSync();
  } catch (e) {
    return null;
  }
}

/** 基础库版本号，如 3.17.2 */
export function getSDKVersion(): string {
  const base = safeCall(() => wx.getAppBaseInfo());
  if (base?.SDKVersion) return base.SDKVersion;
  return legacySystemInfo()?.SDKVersion || '0.0.0';
}

/** 设备像素比 */
export function getPixelRatio(): number {
  const win = safeCall(() => wx.getWindowInfo());
  if (win?.pixelRatio) return win.pixelRatio;
  return legacySystemInfo()?.pixelRatio || 1;
}

/** 可使用窗口宽度（px） */
export function getWindowWidth(): number {
  const win = safeCall(() => wx.getWindowInfo());
  if (win?.windowWidth) return win.windowWidth;
  return legacySystemInfo()?.windowWidth || 375;
}

/** 状态栏高度（px），自定义导航栏用 */
export function getStatusBarHeight(): number {
  const win = safeCall(() => wx.getWindowInfo());
  if (win && typeof win.statusBarHeight === 'number') return win.statusBarHeight;
  return legacySystemInfo()?.statusBarHeight || 20;
}

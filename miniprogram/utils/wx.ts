/** wx.request 官方不支持 Promise，需自行封装 */
export function wxRequest(
  options: WechatMiniprogram.RequestOption,
): Promise<WechatMiniprogram.RequestSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    // 不用对象展开：devtools SWC 可能注入 @swc/runtime
    wx.request(
      Object.assign({}, options, {
        success: resolve,
        fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
          const msg = (err && err.errMsg) || 'request:fail';
          reject(new Error(msg));
        },
      }),
    );
  });
}

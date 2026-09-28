/**
 * 上传前图片压缩：单次缩边 + 压质量。
 * 多轮压缩在模拟器/部分机型上会拖很久甚至假死，OCR 场景一次压够即可。
 */

/** OCR 最长边；小票识字够用，也利于上传 */
const OCR_MAX_EDGE = 960;
/** 单次压缩质量（仅 jpg 有效） */
const OCR_QUALITY = 55;

function getImageInfo(src: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject,
    });
  });
}

/** 单次 compressImage；带超时兜底，避免一直挂起 */
function compressOnce(
  src: string,
  quality: number,
  maxEdge: number | null,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof wx.compressImage !== 'function') {
      resolve(src);
      return;
    }
    let done = false;
    const finish = (path: string) => {
      if (done) return;
      done = true;
      resolve(path);
    };
    // 压缩异常挂起时别卡死识票
    const timer = setTimeout(() => finish(src), 8000);

    const opt: WechatMiniprogram.CompressImageOption = {
      src,
      quality,
      success: (res) => {
        clearTimeout(timer);
        finish(res.tempFilePath || src);
      },
      fail: () => {
        clearTimeout(timer);
        finish(src);
      },
    };
    // 基础库 2.26+：等比缩到最长边
    if (maxEdge && maxEdge > 0 && (width > maxEdge || height > maxEdge)) {
      if (width >= height) {
        opt.compressedWidth = maxEdge;
      } else {
        opt.compressedHeight = maxEdge;
      }
    }
    try {
      wx.compressImage(opt);
    } catch (e) {
      clearTimeout(timer);
      finish(src);
    }
  });
}

/**
 * 为 OCR 上传准备本地图：只压一轮，尽快出结果。
 */
export async function prepareOcrImage(filePath: string): Promise<string> {
  let width = 0;
  let height = 0;
  try {
    const info = await getImageInfo(filePath);
    width = Number(info.width) || 0;
    height = Number(info.height) || 0;
  } catch (e) {
    // 拿不到尺寸仍尝试压质量
  }

  return compressOnce(filePath, OCR_QUALITY, OCR_MAX_EDGE, width, height);
}

/** 本地路径 → data URL */
export function readFileAsDataUrl(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        const lower = filePath.toLowerCase();
        let mime = 'image/jpeg';
        if (lower.indexOf('.png') >= 0) mime = 'image/png';
        else if (lower.indexOf('.webp') >= 0) mime = 'image/webp';
        resolve('data:' + mime + ';base64,' + res.data);
      },
      fail: reject,
    });
  });
}

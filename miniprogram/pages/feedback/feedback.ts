import { request } from '../../utils/request';

const MAX_IMAGES = 3;

interface FeedbackOk {
  ok: boolean;
}

/** 本地临时路径读成 data URL；后端落盘后 JSONB 只存 /uploads/... URL */
function readFileAsDataUrl(filePath: string): Promise<string> {
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
        else if (lower.indexOf('.gif') >= 0) mime = 'image/gif';
        resolve('data:' + mime + ';base64,' + res.data);
      },
      fail: reject,
    });
  });
}

Page({
  data: {
    content: '',
    contact: '',
    /** 预览用本地路径；提交时再转 base64 */
    images: [] as string[],
    submitting: false,
  },

  onContentInput(e: WechatMiniprogram.Input) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e: WechatMiniprogram.Input) {
    this.setData({ contact: e.detail.value });
  },

  onAddImage() {
    const remain = MAX_IMAGES - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多 3 张截图', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths: string[] = [];
        const files = res.tempFiles || [];
        for (let i = 0; i < files.length; i++) {
          if (files[i] && files[i].tempFilePath) {
            paths.push(files[i].tempFilePath);
          }
        }
        if (!paths.length) return;
        const next = this.data.images.slice();
        for (let i = 0; i < paths.length; i++) {
          if (next.length >= MAX_IMAGES) break;
          next.push(paths[i]);
        }
        this.setData({ images: next });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        // 用户取消选图不打扰
        if (msg.indexOf('cancel') >= 0) return;
        console.error('[feedback] 选图失败', err);
        wx.showToast({ title: '选图失败，换一张试试', icon: 'none' });
      },
    });
  },

  onRemoveImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index < 0) return;
    const next = this.data.images.slice();
    next.splice(index, 1);
    this.setData({ images: next });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const content = (this.data.content || '').trim();
    if (!content) {
      wx.showToast({ title: '先写两句反馈呗', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中…', mask: true });
    try {
      const imagesBase64: string[] = [];
      const locals = this.data.images;
      for (let i = 0; i < locals.length; i++) {
        imagesBase64.push(await readFileAsDataUrl(locals[i]));
      }

      await request<FeedbackOk>({
        url: '/api/v1/feedback',
        method: 'POST',
        data: {
          content,
          contact: (this.data.contact || '').trim(),
          images: imagesBase64,
        },
      });

      wx.hideLoading();
      this.setData({
        content: '',
        contact: '',
        images: [],
        submitting: false,
      });
      wx.showToast({ title: '谢谢韭菜保护，我们会看的', icon: 'none', duration: 2000 });
      // 等 toast 露一眼再返回，别立刻闪掉
      setTimeout(() => {
        wx.navigateBack({ fail: () => {} });
      }, 600);
    } catch (e) {
      console.error('[feedback] 提交失败', e);
      wx.hideLoading();
      this.setData({ submitting: false });
      // request 已 toast 业务错误
    }
  },
});

import WxCanvas from './wx-canvas';
import * as echarts from './echarts';

let ctx;

function compareVersion(v1, v2) {
  v1 = v1.split('.');
  v2 = v2.split('.');
  const len = Math.max(v1.length, v2.length);

  while (v1.length < len) {
    v1.push('0');
  }
  while (v2.length < len) {
    v2.push('0');
  }

  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i], 10);
    const num2 = parseInt(v2[i], 10);

    if (num1 > num2) {
      return 1;
    } else if (num1 < num2) {
      return -1;
    }
  }
  return 0;
}

/** 基础库版本：优先 getAppBaseInfo，避免 getSystemInfoSync 弃用警告 */
function getSDKVersion() {
  try {
    if (typeof wx.getAppBaseInfo === 'function') {
      const info = wx.getAppBaseInfo();
      if (info && info.SDKVersion) return info.SDKVersion;
    }
  } catch (e) {
    /* ignore */
  }
  // 新 API 已存在时不再回退，避免控制台弃用警告
  if (typeof wx.getAppBaseInfo === 'function') return '0.0.0';
  try {
    return wx.getSystemInfoSync().SDKVersion || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

/** 像素比：优先 getWindowInfo */
function getPixelRatio() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo();
      if (info && info.pixelRatio) return info.pixelRatio;
    }
  } catch (e) {
    /* ignore */
  }
  if (typeof wx.getWindowInfo === 'function') return 1;
  try {
    return wx.getSystemInfoSync().pixelRatio || 1;
  } catch (e) {
    return 1;
  }
}

/** 基础库是否支持 Canvas 2D（>= 2.9.0） */
function canUseCanvas2d() {
  return compareVersion(getSDKVersion(), '2.9.0') >= 0;
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas',
    },

    ec: {
      type: Object,
    },

    forceUseOldCanvas: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    // 默认按新版渲染，避免 lazyLoad 首帧先挂旧 canvas 触发同层渲染警告
    isUseNewCanvas: true,
  },

  lifetimes: {
    attached() {
      // 首屏前就定好用哪套 canvas，lazyLoad 时也不会先画旧版
      const isUseNewCanvas = canUseCanvas2d() && !this.data.forceUseOldCanvas;
      if (this.data.isUseNewCanvas !== isUseNewCanvas) {
        this.setData({ isUseNewCanvas });
      }
    },
  },

  ready: function () {
    // Disable progressive because drawImage doesn't support DOM as parameter
    echarts.registerPreprocessor((option) => {
      if (option && option.series) {
        if (option.series.length > 0) {
          option.series.forEach((series) => {
            series.progressive = 0;
          });
        } else if (typeof option.series === 'object') {
          option.series.progressive = 0;
        }
      }
    });

    if (!this.data.ec) {
      console.warn(
        '组件需绑定 ec 变量，例：<ec-canvas id="mychart-dom-bar" '
          + 'canvas-id="mychart-bar" ec="{{ ec }}"></ec-canvas>',
      );
      return;
    }

    if (!this.data.ec.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init: function (callback) {
      const version = getSDKVersion();
      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      const forceUseOldCanvas = this.data.forceUseOldCanvas;
      const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;

      if (forceUseOldCanvas && canUseNewCanvas) {
        console.warn('开发者强制使用旧canvas,建议关闭');
      }

      // 若首屏已是目标模式，直接初始化；否则等 setData 完成再查节点
      const runInit = () => {
        if (isUseNewCanvas) {
          this.initByNewWay(callback);
        } else {
          const isValid = compareVersion(version, '1.9.91') >= 0;
          if (!isValid) {
            console.error(
              '微信基础库版本过低，需大于等于 1.9.91。'
                + '参见：https://github.com/ecomfe/echarts-for-weixin'
                + '#%E5%BE%AE%E4%BF%A1%E7%89%88%E6%9C%AC%E8%A6%81%E6%B1%82',
            );
            return;
          }
          console.warn('建议将微信基础库调整大于等于2.9.0版本。升级后绘图将有更好性能');
          this.initByOldWay(callback);
        }
      };

      if (this.data.isUseNewCanvas === isUseNewCanvas) {
        runInit();
      } else {
        this.setData({ isUseNewCanvas }, runInit);
      }
    },

    initByOldWay(callback) {
      // 1.9.91 <= version < 2.9.0：原来的方式初始化
      ctx = wx.createCanvasContext(this.data.canvasId, this);
      const canvas = new WxCanvas(ctx, this.data.canvasId, false);

      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({
          createCanvas: () => canvas,
        });
      } else {
        echarts.setCanvasCreator(() => canvas);
      }
      const canvasDpr = 1;
      var query = wx.createSelectorQuery().in(this);
      query
        .select('.ec-canvas')
        .boundingClientRect((res) => {
          if (!res) return;
          if (typeof callback === 'function') {
            this.chart = callback(canvas, res.width, res.height, canvasDpr);
          } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
            this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
          } else {
            this.triggerEvent('init', {
              canvas: canvas,
              width: res.width,
              height: res.height,
              canvasDpr: canvasDpr,
            });
          }
        })
        .exec();
    },

    initByNewWay(callback) {
      // version >= 2.9.0：使用 Canvas 2D 同层渲染
      const query = wx.createSelectorQuery().in(this);
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const result = res && res[0];
          if (!result || !result.node) {
            // 节点尚未就绪时短暂重试一次（lazyLoad / setData 竞态）
            setTimeout(() => {
              wx.createSelectorQuery()
                .in(this)
                .select('.ec-canvas')
                .fields({ node: true, size: true })
                .exec((retry) => {
                  const again = retry && retry[0];
                  if (!again || !again.node) {
                    console.warn('ec-canvas: 未能获取 canvas 2d 节点');
                    return;
                  }
                  this._setupNewCanvas(again, callback);
                });
            }, 30);
            return;
          }
          this._setupNewCanvas(result, callback);
        });
    },

    _setupNewCanvas(result, callback) {
      const canvasNode = result.node;
      this.canvasNode = canvasNode;

      // 部分基础库 canvas 节点无完整 DOM 事件 API，补空实现避免 dispose 崩
      if (typeof canvasNode.addEventListener !== 'function') {
        canvasNode.addEventListener = function () {};
      }
      if (typeof canvasNode.removeEventListener !== 'function') {
        canvasNode.removeEventListener = function () {};
      }

      const canvasDpr = getPixelRatio();
      const canvasWidth = result.width;
      const canvasHeight = result.height;

      const ctx2d = canvasNode.getContext('2d');
      const canvas = new WxCanvas(ctx2d, this.data.canvasId, true, canvasNode);

      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({
          createCanvas: () => canvas,
          loadImage: (src, onload, onerror) => {
            if (canvasNode.createImage) {
              const image = canvasNode.createImage();
              image.onload = onload;
              image.onerror = onerror;
              image.src = src;
              return image;
            }
            console.error(
              '加载图片依赖 `Canvas.createImage()` API，要求小程序基础库版本在 2.7.0 及以上。',
            );
          },
        });
      } else {
        echarts.setCanvasCreator(() => canvas);
      }

      if (typeof callback === 'function') {
        this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
      } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
        this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
      } else {
        this.triggerEvent('init', {
          canvas: canvas,
          width: canvasWidth,
          height: canvasHeight,
          dpr: canvasDpr,
        });
      }
    },

    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this);
        query
          .select('.ec-canvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvasNode = res[0].node;
            opt.canvas = canvasNode;
            wx.canvasToTempFilePath(opt);
          });
      } else {
        if (!opt.canvasId) {
          opt.canvasId = this.data.canvasId;
        }
        ctx.draw(true, () => {
          wx.canvasToTempFilePath(opt, this);
        });
      }
    },

    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {},
        });
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {},
        });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {},
        });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {};
        var handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {},
        });
        handler.dispatch('click', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {},
        });
        handler.processGesture(wrapTouch(e), 'end');
      }
    },
  },
});

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return event;
}

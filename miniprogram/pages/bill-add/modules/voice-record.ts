/**
 * 微信同声传译录音：本页专用，勿与 ask 页共用 manager。
 * 页面实例作 ctx，模块内唯一 requirePlugin。
 */

import { CANCEL_SLIDE_RPX, RECORD_MAX_MS, RECORD_MIN_MS } from './constants';
import { getWindowWidth } from '../../../utils/system';

const plugin = requirePlugin('WechatSI');
const recognitionManager = plugin.getRecordRecognitionManager();

/** 页面需具备的录音相关字段与方法 */
export interface VoiceRecordCtx {
  data: {
    recording: boolean;
    micPressed: boolean;
    showRecordPanel: boolean;
    recordCancel: boolean;
    aiParsing: boolean;
  };
  setData: (data: Record<string, unknown>) => void;
  parseText: (text: string) => void;
  _wantRecord: boolean;
  _discardRecord: boolean;
  _tooShort: boolean;
  _inCancelMode: boolean;
  _recordAuthed: boolean;
  _touchStartY: number;
  _cancelEnterPx: number;
  _cancelExitPx: number;
  _recordStartedAt: number;
  _durationTimer: number;
}

function formatRecordDuration(totalSec: number) {
  const sec = totalSec < 0 ? 0 : totalSec;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const mm = m < 10 ? '0' + m : String(m);
  const ss = s < 10 ? '0' + s : String(s);
  return mm + ':' + ss;
}

function clearDurationTimer(ctx: VoiceRecordCtx) {
  if (ctx._durationTimer) {
    clearInterval(ctx._durationTimer);
    ctx._durationTimer = 0;
  }
}

function startDurationTimer(ctx: VoiceRecordCtx) {
  clearDurationTimer(ctx);
  ctx._durationTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - ctx._recordStartedAt) / 1000);
    ctx.setData({ recordDurationText: formatRecordDuration(elapsed) });
  }, 1000) as unknown as number;
}

export function resetRecordUiState(ctx: VoiceRecordCtx, _fromStop?: boolean) {
  ctx._wantRecord = false;
  ctx._discardRecord = false;
  ctx._tooShort = false;
  ctx._inCancelMode = false;
  clearDurationTimer(ctx);
  ctx.setData({
    recording: false,
    micPressed: false,
    showRecordPanel: false,
    recordCancel: false,
    recordDurationText: '00:00',
  });
}

export function initCancelThresholds(ctx: VoiceRecordCtx) {
  try {
    const px = (CANCEL_SLIDE_RPX * getWindowWidth()) / 750;
    ctx._cancelEnterPx = px;
    ctx._cancelExitPx = px * 0.7;
  } catch (e) {
    ctx._cancelEnterPx = 50;
    ctx._cancelExitPx = 35;
  }
}

/** onLoad：绑定插件回调 */
export function bindVoiceHandlers(ctx: VoiceRecordCtx) {
  recognitionManager.onStart = () => {
    if (!ctx._wantRecord) {
      try {
        recognitionManager.stop();
      } catch (e) {
        // ignore
      }
      return;
    }
    ctx._recordStartedAt = Date.now();
    ctx.setData({
      recording: true,
      micPressed: true,
      showRecordPanel: true,
    });
    startDurationTimer(ctx);
  };

  recognitionManager.onStop = (res: { result?: string }) => {
    const discard = ctx._discardRecord || ctx._inCancelMode;
    const tooShort = ctx._tooShort;
    resetRecordUiState(ctx, true);

    if (discard) {
      if (tooShort) {
        wx.showToast({ title: '说话时间太短', icon: 'none' });
      }
      return;
    }

    const text = (res?.result || '').trim();
    if (!text) {
      wx.showToast({ title: '没听清，再试一次', icon: 'none' });
      return;
    }
    ctx.setData({ aiText: text });
    ctx.parseText(text);
  };

  recognitionManager.onError = (res: { msg?: string }) => {
    resetRecordUiState(ctx, true);
    wx.showToast({ title: '识别失败：' + (res?.msg || '请重试'), icon: 'none' });
  };
}

export function stopRecordingIfNeeded(ctx: VoiceRecordCtx) {
  ctx._wantRecord = false;
  ctx._discardRecord = true;
  ctx._inCancelMode = true;
  clearDurationTimer(ctx);
  const busy = ctx.data.recording || ctx.data.showRecordPanel || ctx.data.micPressed;
  if (!busy) return;

  if (ctx.data.recording) {
    try {
      recognitionManager.stop();
    } catch (e) {
      resetRecordUiState(ctx);
      return;
    }
    ctx.setData({
      recording: false,
      micPressed: false,
      showRecordPanel: false,
      recordCancel: false,
    });
    return;
  }

  try {
    recognitionManager.stop();
  } catch (e) {
    // 可能尚未 start
  }
  resetRecordUiState(ctx);
}

function guideOpenRecordSetting() {
  wx.showModal({
    title: '需要麦克风权限',
    content: '语音记账需要使用麦克风，请在设置中开启录音权限',
    confirmText: '去设置',
    success: (modalRes) => {
      if (modalRes.confirm) {
        wx.openSetting({});
      }
    },
  });
}

function ensureRecordAuth(ctx: VoiceRecordCtx, onOk: () => void) {
  if (ctx._recordAuthed) {
    onOk();
    return;
  }
  wx.getSetting({
    success: (settingRes) => {
      const auth = settingRes.authSetting['scope.record'];
      if (auth === true) {
        ctx._recordAuthed = true;
        onOk();
        return;
      }
      if (auth === false) {
        ctx._wantRecord = false;
        resetRecordUiState(ctx);
        guideOpenRecordSetting();
        return;
      }
      wx.authorize({
        scope: 'scope.record',
        success: () => {
          ctx._recordAuthed = true;
          onOk();
        },
        fail: () => {
          ctx._wantRecord = false;
          resetRecordUiState(ctx);
          guideOpenRecordSetting();
        },
      });
    },
    fail: () => {
      ctx._wantRecord = false;
      resetRecordUiState(ctx);
      wx.showToast({ title: '无法获取权限状态', icon: 'none' });
    },
  });
}

function beginRecognition(ctx: VoiceRecordCtx) {
  if (!ctx._wantRecord) {
    resetRecordUiState(ctx);
    return;
  }
  try {
    recognitionManager.start({ duration: RECORD_MAX_MS, lang: 'zh_CN' });
  } catch (err) {
    resetRecordUiState(ctx);
    wx.showToast({ title: '无法开始录音', icon: 'none' });
  }
}

export function warmupRecordAuth(ctx: VoiceRecordCtx) {
  if (ctx._recordAuthed) return;
  wx.getSetting({
    success: (settingRes) => {
      if (settingRes.authSetting['scope.record'] === true) {
        ctx._recordAuthed = true;
      }
    },
  });
}

export function onRecordTouchStart(ctx: VoiceRecordCtx, e: WechatMiniprogram.TouchEvent) {
  if (ctx.data.aiParsing || ctx.data.recording || ctx._wantRecord) return;
  const touch = e.touches && e.touches[0];
  ctx._touchStartY = touch ? touch.clientY : 0;
  ctx._wantRecord = true;
  ctx._discardRecord = false;
  ctx._tooShort = false;
  ctx._inCancelMode = false;

  ctx.setData({
    micPressed: true,
    showRecordPanel: true,
    recordCancel: false,
    recordDurationText: '00:00',
  });

  ensureRecordAuth(ctx, () => beginRecognition(ctx));
}

export function onRecordTouchMove(ctx: VoiceRecordCtx, e: WechatMiniprogram.TouchEvent) {
  if (!ctx._wantRecord && !ctx.data.recording) return;
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  const deltaUp = ctx._touchStartY - touch.clientY;
  let cancel = ctx._inCancelMode;
  if (!cancel && deltaUp > ctx._cancelEnterPx) cancel = true;
  else if (cancel && deltaUp < ctx._cancelExitPx) cancel = false;
  if (cancel !== ctx._inCancelMode) {
    ctx._inCancelMode = cancel;
    ctx.setData({ recordCancel: cancel });
  }
}

export function onRecordTouchEnd(ctx: VoiceRecordCtx) {
  ctx._wantRecord = false;
  if (!ctx.data.recording && !ctx.data.showRecordPanel && !ctx.data.micPressed) return;

  let shouldDiscard = ctx._inCancelMode;
  if (ctx.data.recording && !shouldDiscard) {
    const elapsed = Date.now() - ctx._recordStartedAt;
    if (elapsed < RECORD_MIN_MS) {
      shouldDiscard = true;
      ctx._tooShort = true;
    }
  }
  ctx._discardRecord = shouldDiscard;

  if (ctx.data.recording) {
    try {
      recognitionManager.stop();
    } catch (e) {
      resetRecordUiState(ctx);
    }
    return;
  }

  ctx._discardRecord = true;
  resetRecordUiState(ctx);
}

/**
 * 记一笔页编排：UI 事件 + setData；业务进 modules/。
 */

import {
  CATEGORIES,
  categoryItem,
  loadRecentCategoryNames,
  pushRecentCategoryName,
  recentCategoriesFromBills,
} from '../../utils/categories';
import { sanitizeAmountInput, toDateValue } from '../../utils/format';
import { MASCOT } from '../../utils/mascot';
import { request } from '../../utils/request';
import type { AiParseResult } from '../../types/api';
import {
  QUICK_AMOUNTS,
  WEEKDAY_LABELS,
  MONTH_DAY_LABELS,
} from './modules/constants';
import { monthDayIndexOf, weekdayIndexOf } from './modules/recurring';
import {
  computeAiResultsView,
  patchAiRowDate,
  patchAiRowTime,
  type AiResultRow,
} from './modules/ai-results';
import {
  parseAiText,
  parseOcrImage,
  postAiBill,
  postAiBillsBatch,
  postManualBill,
} from './modules/ai-api';
import {
  bindVoiceHandlers,
  initCancelThresholds,
  onRecordTouchEnd as voiceTouchEnd,
  onRecordTouchMove as voiceTouchMove,
  onRecordTouchStart as voiceTouchStart,
  stopRecordingIfNeeded,
  warmupRecordAuth,
  type VoiceRecordCtx,
} from './modules/voice-record';

interface BillBrief {
  category: string;
}

Page({
  data: {
    mode: 'ai' as 'ai' | 'manual',
    /** 切换后内容淡入 class；首屏为空避免入场动画 */
    modeEnter: '',

    aiText: '',
    aiParsing: false,
    aiSavingAll: false,
    aiResults: [] as AiResultRow[],
    aiResultCount: 0,
    aiTotalAmountText: '',
    recording: false,
    micPressed: false,
    showRecordPanel: false,
    recordCancel: false,
    recordDurationText: '00:00',
    showOcrLoading: false,

    amount: '',
    categories: CATEGORIES,
    recentCategories: [] as typeof CATEGORIES,
    selectedCategory: '餐饮',
    description: '',
    billDate: toDateValue(),
    submitting: false,
    canSubmit: false,
    quickAmounts: QUICK_AMOUNTS,
    isRecurring: false,
    recurringType: 'monthly' as 'monthly' | 'weekly',
    monthDayLabels: MONTH_DAY_LABELS,
    weekdayLabels: WEEKDAY_LABELS,
    monthDayIndex: monthDayIndexOf(toDateValue()),
    weekdayIndex: weekdayIndexOf(toDateValue()),

    showCelebrateToast: false,
    celebrateToastTitle: '记账成功，韭菜保护+1',
    mascotCelebrate: MASCOT.celebrate,
  },

  _wantRecord: false as boolean,
  _discardRecord: false as boolean,
  _tooShort: false as boolean,
  _inCancelMode: false as boolean,
  _recordAuthed: false as boolean,
  _touchStartY: 0 as number,
  _cancelEnterPx: 50 as number,
  _cancelExitPx: 35 as number,
  _recordStartedAt: 0 as number,
  _durationTimer: 0 as number,
  _celebrateTimer: 0 as number,

  _voiceCtx(): VoiceRecordCtx {
    return this as unknown as VoiceRecordCtx;
  },

  onLoad() {
    const ctx = this._voiceCtx();
    initCancelThresholds(ctx);
    bindVoiceHandlers(ctx);
    this.refreshRecentCategories();
  },

  onShow() {
    const ctx = this._voiceCtx();
    // WechatSI manager 全局单例，问答页也会绑回调；回本页时抢回
    bindVoiceHandlers(ctx);
    const today = toDateValue();
    this.setData({
      billDate: today,
      monthDayIndex: monthDayIndexOf(today),
      weekdayIndex: weekdayIndexOf(today),
    });
    this.updateCanSubmit();
    this.refreshRecentCategories();
    warmupRecordAuth(ctx);
  },

  onHide() {
    stopRecordingIfNeeded(this._voiceCtx());
  },

  onUnload() {
    stopRecordingIfNeeded(this._voiceCtx());
    if (this._celebrateTimer) {
      clearTimeout(this._celebrateTimer);
      this._celebrateTimer = 0;
    }
  },

  async refreshRecentCategories() {
    try {
      const res = await request<{ bills: BillBrief[] }>({
        url: '/api/v1/bills',
        method: 'GET',
        data: { page: 1, page_size: 50 },
      });
      let recent = recentCategoriesFromBills(res.bills || [], 3);
      if (!recent.length) {
        const names = loadRecentCategoryNames();
        recent = names
          .map((n) => categoryItem(n))
          .filter((x): x is NonNullable<typeof x> => !!x);
      }
      this.setData({ recentCategories: recent });
    } catch (e) {
      const names = loadRecentCategoryNames();
      const recent = names
        .map((n) => categoryItem(n))
        .filter((x): x is NonNullable<typeof x> => !!x);
      this.setData({ recentCategories: recent });
    }
  },

  bumpRecentCategory(name: string) {
    const names = pushRecentCategoryName(name, 3);
    const recent = names
      .map((n) => categoryItem(n))
      .filter((x): x is NonNullable<typeof x> => !!x);
    this.setData({ recentCategories: recent });
  },

  onRecordTouchStart(e: WechatMiniprogram.TouchEvent) {
    voiceTouchStart(this._voiceCtx(), e);
  },

  onRecordTouchMove(e: WechatMiniprogram.TouchEvent) {
    voiceTouchMove(this._voiceCtx(), e);
  },

  onRecordTouchEnd() {
    voiceTouchEnd(this._voiceCtx());
  },

  showCelebrate(title: string, options?: { goList?: boolean }) {
    const goList = !!(options && options.goList);
    if (this._celebrateTimer) {
      clearTimeout(this._celebrateTimer);
      this._celebrateTimer = 0;
    }
    this.setData({ showCelebrateToast: true, celebrateToastTitle: title });
    this._celebrateTimer = setTimeout(() => {
      this._celebrateTimer = 0;
      this.setData({ showCelebrateToast: false });
      if (goList) {
        wx.switchTab({ url: '/pages/bill-list/bill-list' });
      }
    }, 1500) as unknown as number;
  },

  onAiTextInput(e: WechatMiniprogram.Input) {
    this.setData({ aiText: e.detail.value });
  },

  setAiResults(items: AiParseResult[]) {
    this.setData(computeAiResultsView(items));
  },

  onAiDateChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number((e.currentTarget.dataset as { index?: number }).index);
    const dateValue = String(e.detail.value || '');
    if (isNaN(idx) || !dateValue) return;
    const row = this.data.aiResults[idx];
    if (!row || row.saving || this.data.aiSavingAll) return;
    const list = patchAiRowDate(this.data.aiResults, idx, dateValue);
    if (list) this.setData({ aiResults: list });
  },

  onAiTimeChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number((e.currentTarget.dataset as { index?: number }).index);
    const timeValue = String(e.detail.value || '');
    if (isNaN(idx) || !timeValue) return;
    const row = this.data.aiResults[idx];
    if (!row || row.saving || this.data.aiSavingAll) return;
    const list = patchAiRowTime(this.data.aiResults, idx, timeValue);
    if (list) this.setData({ aiResults: list });
  },

  async saveAiBill(item: AiParseResult) {
    await postAiBill(item, this.data.aiText || '');
    this.bumpRecentCategory(item.category);
  },

  vibrateOk() {
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (e) {
      // 部分机型可能不支持
    }
  },

  async parseText(rawText: string) {
    const text = (rawText || '').trim();
    if (!text) {
      wx.showToast({ title: '先说一句花了什么吧', icon: 'none' });
      return;
    }
    if (this.data.aiParsing) return;

    this.setData({ aiParsing: true, aiResults: [], aiResultCount: 0 });
    try {
      const { items, rawCount } = await parseAiText(text);
      if (!items.length) {
        wx.showToast({
          title:
            rawCount > 0
              ? '目前只记支出，收入先别塞账本'
              : '没听清花了多少，再说清楚点金额',
          icon: 'none',
        });
        return;
      }
      this.setAiResults(items);
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#ai-result-anchor', duration: 280 });
      }, 80);
    } catch (e) {
      this.setData({ aiResults: [], aiResultCount: 0 });
    } finally {
      this.setData({ aiParsing: false });
    }
  },

  onAiParse() {
    this.parseText(this.data.aiText);
  },

  onOcrTap() {
    if (this.data.aiParsing || this.data.recording || this.data.micPressed) return;
    stopRecordingIfNeeded(this._voiceCtx());

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '没拿到图片，再试一次', icon: 'none' });
          return;
        }
        if (file.size && file.size > 20 * 1024 * 1024) {
          wx.showToast({ title: '图片太大了，换张小一点的', icon: 'none' });
          return;
        }
        this.parseImage(path);
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') >= 0) return;
        wx.showToast({ title: '选图失败，换一张试试', icon: 'none' });
      },
    });
  },

  async parseImage(localPath: string) {
    if (this.data.aiParsing) return;
    this.setData({
      aiParsing: true,
      showOcrLoading: true,
      aiResults: [],
      aiResultCount: 0,
    });
    try {
      const { items, rawCount, ocrText } = await parseOcrImage(localPath);
      if (!items.length) {
        wx.showToast({
          title:
            rawCount > 0
              ? '目前只记支出，收入先别塞账本'
              : '没认出金额，换张更清楚的小票',
          icon: 'none',
        });
        return;
      }
      if (ocrText) {
        this.setData({
          aiText: ocrText.length > 500 ? ocrText.slice(0, 500) : ocrText,
        });
      }
      this.setAiResults(items);
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#ai-result-anchor', duration: 280 });
      }, 80);
    } catch (e) {
      const msg = e instanceof Error ? e.message || '' : '';
      if (msg.indexOf('图片还是太大') >= 0 || msg.indexOf('图片太大') >= 0) {
        wx.showToast({ title: msg, icon: 'none' });
      } else if (msg.indexOf('request:fail') >= 0) {
        wx.showToast({ title: '网络不通，检查后端地址', icon: 'none' });
      } else if (msg.indexOf('timeout') >= 0) {
        wx.showToast({ title: '识票超时，换张小图再试', icon: 'none' });
      }
      this.setData({ aiResults: [], aiResultCount: 0 });
    } finally {
      this.setData({ aiParsing: false, showOcrLoading: false });
    }
  },

  isAnyItemSaving() {
    return this.data.aiResults.some((r) => r.saving);
  },

  onAiRemoveItem(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget.dataset as { index?: number }).index);
    if (isNaN(idx) || this.data.aiSavingAll || this.isAnyItemSaving()) return;
    const next = this.data.aiResults.filter((_, i) => i !== idx);
    this.setAiResults(next);
  },

  async onAiSaveOneItem(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget.dataset as { index?: number }).index);
    if (isNaN(idx) || this.data.aiSavingAll) return;

    const list = this.data.aiResults;
    const item = list[idx];
    if (!item || item.saving) return;

    const key = `aiResults[${idx}].saving`;
    this.setData({ [key]: true });
    try {
      await this.saveAiBill(item);
      this.vibrateOk();
      this.showCelebrate('记账成功，韭菜保护+1');
      const next = list.filter((_, i) => i !== idx);
      this.setAiResults(next);
    } catch (e) {
      this.setData({ [key]: false });
    }
  },

  onAiCancel() {
    if (this.data.aiSavingAll || this.isAnyItemSaving()) return;
    this.setData({
      aiResults: [],
      aiResultCount: 0,
      aiTotalAmountText: '',
      aiText: '',
    });
  },

  async onAiSaveAll() {
    const { aiResults, aiSavingAll } = this.data;
    if (!aiResults.length || aiSavingAll || this.isAnyItemSaving()) return;

    this.setData({ aiSavingAll: true });
    const list = aiResults.slice();
    try {
      await postAiBillsBatch(list, this.data.aiText || '');
      for (let i = 0; i < list.length; i++) {
        this.bumpRecentCategory(list[i].category);
      }
      this.vibrateOk();
      const n = list.length;
      this.setData({
        aiResults: [],
        aiResultCount: 0,
        aiTotalAmountText: '',
        aiText: '',
      });
      this.showCelebrate(
        n > 1 ? `记账成功 ${n} 笔，韭菜保护+${n}` : '记账成功，韭菜保护+1',
        { goList: true },
      );
    } catch (e) {
      // 整批失败：列表保留，便于重试；toast 由 request 统一处理
    } finally {
      this.setData({ aiSavingAll: false });
    }
  },

  onModeChange(e: WechatMiniprogram.BaseEvent) {
    const mode = (e.currentTarget.dataset as { mode?: string }).mode;
    if (mode !== 'ai' && mode !== 'manual') return;
    if (mode === this.data.mode) return;
    stopRecordingIfNeeded(this._voiceCtx());
    this.setData({ mode, modeEnter: 'mode-panel-enter' });
    this.vibrateOk();
  },

  updateCanSubmit() {
    const num = Number(this.data.amount);
    const canSubmit =
      !!this.data.amount && !isNaN(num) && num > 0 && !this.data.submitting;
    this.setData({ canSubmit });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    const amount = sanitizeAmountInput(e.detail.value);
    this.setData({ amount }, () => this.updateCanSubmit());
  },

  onQuickAmountTap(e: WechatMiniprogram.BaseEvent) {
    const raw = (e.currentTarget.dataset as { amount?: number | string }).amount;
    const num = Number(raw);
    if (!num || isNaN(num)) return;
    const amount = sanitizeAmountInput(String(num));
    this.setData({ amount }, () => this.updateCanSubmit());
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const cat = (e.currentTarget.dataset as { cat?: string }).cat;
    if (!cat) return;
    this.setData({ selectedCategory: cat });
  },

  onDescInput(e: WechatMiniprogram.Input) {
    this.setData({ description: e.detail.value });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const billDate = e.detail.value as string;
    this.setData({
      billDate,
      monthDayIndex: monthDayIndexOf(billDate),
      weekdayIndex: weekdayIndexOf(billDate),
    });
  },

  onRecurringSwitch(e: WechatMiniprogram.SwitchChange) {
    const on = !!(e.detail && e.detail.value);
    const patch: Record<string, unknown> = { isRecurring: on };
    if (on) {
      patch.monthDayIndex = monthDayIndexOf(this.data.billDate);
      patch.weekdayIndex = weekdayIndexOf(this.data.billDate);
    }
    this.setData(patch);
  },

  onRecurringTypeTap(e: WechatMiniprogram.BaseEvent) {
    const t = (e.currentTarget.dataset as { type?: string }).type;
    if (t !== 'monthly' && t !== 'weekly') return;
    this.setData({ recurringType: t });
  },

  onMonthDayChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    if (isNaN(idx) || idx < 0 || idx > 30) return;
    this.setData({ monthDayIndex: idx });
  },

  onWeekdayChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    if (isNaN(idx) || idx < 0 || idx > 6) return;
    this.setData({ weekdayIndex: idx });
  },

  async submit() {
    const {
      amount,
      selectedCategory,
      description,
      billDate,
      submitting,
      canSubmit,
      isRecurring,
      recurringType,
      monthDayIndex,
      weekdayIndex,
    } = this.data;
    if (submitting || !canSubmit) return;

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    const billTime = new Date(`${billDate}T12:00:00`);
    const payload: Record<string, unknown> = {
      amount: numAmount,
      category: selectedCategory,
      description: description.trim() || null,
      source: 'manual',
      bill_time: billTime.toISOString(),
      is_recurring: !!isRecurring,
    };
    if (isRecurring) {
      payload.recurring_type = recurringType;
      payload.recurring_day =
        recurringType === 'monthly' ? monthDayIndex + 1 : weekdayIndex;
    }

    this.setData({ submitting: true, canSubmit: false });
    try {
      await postManualBill(payload);
      this.vibrateOk();
      this.bumpRecentCategory(selectedCategory);
      this.setData({ amount: '', description: '' }, () => this.updateCanSubmit());
      this.showCelebrate(
        isRecurring ? '记账成功，已设为周期账单' : '记账成功，韭菜保护+1',
      );
    } catch (e) {
      // 错误已 toast
    } finally {
      this.setData({ submitting: false });
      this.updateCanSubmit();
    }
  },
});

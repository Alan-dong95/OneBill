import { request } from '../../utils/request';
import { mdToHtml } from '../../utils/markdown';
import { getStatusBarHeight, getWindowWidth } from '../../utils/system';

/** 微信同声传译 · 语音识别（与记一笔页同一插件） */
const plugin = requirePlugin('WechatSI');
const recognitionManager = plugin.getRecordRecognitionManager();

interface AskResp {
  answer: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** 原始文本（用户消息 / AI 降级 / 加载态） */
  content: string;
  /** AI 消息的 HTML（由 markdown 转换） */
  html?: string;
  loading?: boolean;
  /** markdown 渲染失败时降级纯文本 */
  plain?: boolean;
  /** 展示用时间，如 14:30 */
  time?: string;
}

const WELCOME =
  "我是小韭菜，问点啥？比如'这个月餐饮花了多少'";

/** 本地对话缓存 key；最多保留最近若干条，防止 storage 爆 */
const CHAT_HISTORY_KEY = 'chat_history';
const CHAT_HISTORY_MAX = 20;

/** 新对话固定推荐 */
const FIXED_SUGGESTIONS = [
  '这个月花了多少',
  '奶茶花了多少',
  '火锅吃了几顿',
  '比上月多吗',
];

/** 分类相关关键词：命中后走分类追问 */
const CATEGORY_HINTS = [
  '餐饮',
  '交通',
  '奶茶',
  '火锅',
  '购物',
  '娱乐',
  '住房',
  '医疗',
  '教育',
  '日用',
  '分类',
];

/** 录音最长 / 最短（ms） */
const RECORD_MAX_MS = 60000;
const RECORD_MIN_MS = 500;

function formatRecordDuration(totalSec: number) {
  const sec = totalSec < 0 ? 0 : totalSec;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const mm = m < 10 ? '0' + m : String(m);
  const ss = s < 10 ? '0' + s : String(s);
  return mm + ':' + ss;
}

/** AI 气泡内 mp-html 标签样式（深色字，贴合白底气泡） */
const AI_TAG_STYLE = {
  p: 'margin:0 0 10px;font-size:14px;line-height:1.65;color:#1a2e1f;',
  strong: 'font-weight:700;color:#1a2e1f;',
  ul: 'margin:6px 0 10px;padding-left:1.25em;color:#1a2e1f;',
  li: 'margin:4px 0;font-size:14px;line-height:1.65;color:#1a2e1f;',
};

/** 东八区友好：用本地时钟格式化为 HH:mm */
function formatMsgTime(d?: Date): string {
  const date = d || new Date();
  const h = date.getHours();
  const m = date.getMinutes();
  const hh = h < 10 ? '0' + h : String(h);
  const mm = m < 10 ? '0' + m : String(m);
  return hh + ':' + mm;
}

function buildWelcome(): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: WELCOME,
    html: mdToHtml(WELCOME),
    time: formatMsgTime(),
  };
}

/** 根据最近一句用户问题生成追问推荐；无用户消息则固定四条 */
function buildSuggestions(messages: ChatMessage[]): string[] {
  let lastQ = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastQ = messages[i].content || '';
      break;
    }
  }
  if (!lastQ) return FIXED_SUGGESTIONS.slice();

  for (let i = 0; i < CATEGORY_HINTS.length; i++) {
    if (lastQ.indexOf(CATEGORY_HINTS[i]) >= 0) {
      // 刚问过交通就换餐饮，避免推荐同款
      if (lastQ.indexOf('交通') >= 0) {
        return ['那餐饮呢', '这个分类花最多的是哪天'];
      }
      return ['那交通呢', '这个分类花最多的是哪天'];
    }
  }

  // 总支出 / 对比类 → 引向分类或环比
  if (
    lastQ.indexOf('花了多少') >= 0 ||
    lastQ.indexOf('总支出') >= 0 ||
    lastQ.indexOf('一共') >= 0 ||
    lastQ.indexOf('花销') >= 0 ||
    lastQ.indexOf('比上月') >= 0
  ) {
    return ['那餐饮呢', '比上月多吗'];
  }

  return ['那餐饮呢', '比上月多吗'];
}

/** 校验并规范化 storage 里的历史，跳过加载中/非法项 */
function normalizeHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ChatMessage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as ChatMessage;
    if (!item || !item.id || typeof item.content !== 'string') continue;
    if (item.role === 'user') {
      out.push({
        id: item.id,
        role: 'user',
        content: item.content,
        time: item.time || '',
      });
      continue;
    }
    if (item.role === 'assistant' && !item.loading) {
      out.push({
        id: item.id,
        role: 'assistant',
        content: item.content,
        html: item.html || mdToHtml(item.content),
        plain: !!item.plain,
        loading: false,
        time: item.time || '',
      });
    }
  }
  return out.length ? out : null;
}

Page({
  data: {
    messages: [buildWelcome()] as ChatMessage[],
    inputValue: '',
    sending: false,
    scrollIntoView: '',
    aiTagStyle: AI_TAG_STYLE,
    aiContainerStyle: 'font-size:14px;line-height:1.65;color:#1a2e1f;',
    /** 自定义导航：状态栏 / 导航内容高 / 左侧按钮（对齐胶囊） */
    statusBarHeight: 20,
    navBarHeight: 44,
    navActionLeft: 10,
    navActionTop: 6,
    navActionSize: 32,
    /** 输入框上方横向推荐 */
    suggestions: FIXED_SUGGESTIONS.slice() as string[],
    /** 长按后弹出「复制」的消息 id */
    copyMenuId: '',
    /** 按住说话态 */
    recording: false,
    micPressed: false,
    /** 录音中居中遮罩（对齐记一笔） */
    showRecordPanel: false,
    recordDurationText: '00:00',
    /** 键盘抬起量（已扣 tabBar）；整页不加系统顶推，只缩消息区 */
    keyboardLift: 0,
  },

  /** 手指仍按住（处理 start 晚于抬手） */
  _wantRecord: false as boolean,
  /** 松手时是否丢弃本次录音 */
  _discardRecord: false as boolean,
  _tooShort: false as boolean,
  _recordAuthed: false as boolean,
  _recordStartedAt: 0 as number,
  _durationTimer: 0 as number,
  /** tabBar 占用高度；键盘高度含屏幕底，需扣掉才是页内抬升量 */
  _tabBarOccupy: 0 as number,

  onLoad() {
    this.initCustomNav();
    this.initTabBarOccupy();
    this.bindRecognition();
    this.loadHistory();
  },

  onShow() {
    // WechatSI manager 全局单例，记一笔也会绑回调；回本页时抢回
    this.bindRecognition();
    this.warmupRecordAuth();
  },

  onHide() {
    this.stopRecordingIfNeeded();
    if (this.data.keyboardLift) {
      this.setData({ keyboardLift: 0 });
    }
  },

  onUnload() {
    this.stopRecordingIfNeeded();
    this.clearDurationTimer();
  },

  /** 自定义导航下 windowHeight 一般已不含 tabBar */
  initTabBarOccupy() {
    try {
      const win = wx.getWindowInfo();
      const occupy = Math.max(0, (win.screenHeight || 0) - (win.windowHeight || 0));
      this._tabBarOccupy = occupy || 50;
    } catch (e) {
      this._tabBarOccupy = 50;
    }
  },

  /** 关掉 adjust-position 后，按键盘高度手动抬输入条（聊天页常规写法） */
  onKeyboardHeightChange(e: { detail?: { height?: number } }) {
    const h = (e.detail && e.detail.height) || 0;
    const lift = h > 0 ? Math.max(0, h - this._tabBarOccupy) : 0;
    if (lift === this.data.keyboardLift) {
      if (lift > 0) this.scrollToBottom();
      return;
    }
    this.setData({ keyboardLift: lift }, () => {
      if (lift > 0) this.scrollToBottom();
    });
  },

  /** 绑定同声传译回调（只填输入框，不自动发送） */
  bindRecognition() {
    recognitionManager.onStart = () => {
      if (!this._wantRecord) {
        try {
          recognitionManager.stop();
        } catch (e) {
          // ignore
        }
        return;
      }
      this._recordStartedAt = Date.now();
      this.setData({
        recording: true,
        micPressed: true,
        showRecordPanel: true,
      });
      this.startDurationTimer();
    };

    recognitionManager.onStop = (res: { result?: string }) => {
      const discard = this._discardRecord;
      const tooShort = this._tooShort;
      this.resetRecordUiState();

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
      // 识别结果写入输入框，用户可改再发
      this.setData({ inputValue: text });
    };

    recognitionManager.onError = (res: { msg?: string }) => {
      this.resetRecordUiState();
      wx.showToast({ title: '识别失败：' + (res?.msg || '请重试'), icon: 'none' });
    };
  },

  clearDurationTimer() {
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = 0;
    }
  },

  startDurationTimer() {
    this.clearDurationTimer();
    this._durationTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._recordStartedAt) / 1000);
      this.setData({ recordDurationText: formatRecordDuration(elapsed) });
    }, 1000) as unknown as number;
  },

  /** 自定义顶栏尺寸，左侧按钮与系统胶囊同高同边距 */
  initCustomNav() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      const statusBarHeight = getStatusBarHeight();
      const gap = menu.top - statusBarHeight;
      const navBarHeight = menu.height + gap * 2;
      // 左边距与胶囊右边距对称；顶/高与胶囊齐平
      const navActionLeft = Math.max(8, getWindowWidth() - menu.right);
      const navActionTop = gap;
      const navActionSize = menu.height;
      this.setData({
        statusBarHeight,
        navBarHeight,
        navActionLeft,
        navActionTop,
        navActionSize,
      });
    } catch (e) {
      // 量不到就用默认，不影响对话本身
    }
  },

  /** 打开页时读本地历史；没有则欢迎语 */
  loadHistory() {
    let history: ChatMessage[] | null = null;
    try {
      history = normalizeHistory(wx.getStorageSync(CHAT_HISTORY_KEY));
    } catch (e) {
      history = null;
    }
    if (history) {
      this.setData(
        {
          messages: history,
          suggestions: buildSuggestions(history),
        },
        () => {
          this.scrollToBottom();
        },
      );
    } else {
      this.setData({
        messages: [buildWelcome()],
        suggestions: FIXED_SUGGESTIONS.slice(),
      });
    }
  },

  /** 只存可展示消息，截断到最近 CHAT_HISTORY_MAX 条 */
  saveHistory(messages: ChatMessage[]) {
    const toSave: ChatMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.loading) continue;
      toSave.push(m);
    }
    const capped =
      toSave.length > CHAT_HISTORY_MAX
        ? toSave.slice(toSave.length - CHAT_HISTORY_MAX)
        : toSave;
    try {
      wx.setStorageSync(CHAT_HISTORY_KEY, capped);
    } catch (e) {
      // storage 满或异常时静默失败，不打断问答
    }
  },

  scrollToBottom() {
    // 先清空再设，确保同值时也能触发 scroll-into-view
    this.setData({ scrollIntoView: '' });
    setTimeout(() => {
      this.setData({ scrollIntoView: 'msg-bottom' });
    }, 50);
  },

  /** 清空对话与本地缓存，回到欢迎语 */
  onNewChat() {
    if (this.data.sending) {
      wx.showToast({ title: '等小韭菜说完再开新对话', icon: 'none' });
      return;
    }
    this.stopRecordingIfNeeded();
    try {
      wx.removeStorageSync(CHAT_HISTORY_KEY);
    } catch (e) {
      // ignore
    }
    this.setData({
      messages: [buildWelcome()],
      inputValue: '',
      scrollIntoView: '',
      suggestions: FIXED_SUGGESTIONS.slice(),
      copyMenuId: '',
    });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputValue: e.detail.value || '' });
  },

  /** 点推荐：直接当问题发出 */
  onTapSuggestion(e: WechatMiniprogram.TouchEvent) {
    if (this.data.sending) return;
    const q = (e.currentTarget.dataset as { q?: string }).q || '';
    if (!q) return;
    this.setData({ inputValue: q, copyMenuId: '' }, () => {
      this.onSend();
    });
  },

  /** AI 气泡长按 → 弹出复制按钮 */
  onAiLongPress(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id?: string }).id || '';
    if (!id) return;
    let msg: ChatMessage | null = null;
    const list = this.data.messages;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        msg = list[i];
        break;
      }
    }
    if (!msg || msg.loading || !msg.content) return;
    this.setData({ copyMenuId: id });
  },

  /** 点空白处收起复制菜单 */
  onDismissCopy() {
    if (!this.data.copyMenuId) return;
    this.setData({ copyMenuId: '' });
  },

  /** 复制当前 AI 回答纯文本 */
  onCopyAnswer(e: WechatMiniprogram.TouchEvent) {
    const content = (e.currentTarget.dataset as { content?: string }).content || '';
    if (!content) {
      this.setData({ copyMenuId: '' });
      return;
    }
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'none' });
      },
      complete: () => {
        this.setData({ copyMenuId: '' });
      },
    });
  },

  /** mp-html 渲染出错：该条降级为纯文字 */
  onMdError(e: WechatMiniprogram.CustomEvent) {
    const id = (e.currentTarget.dataset as { id?: string }).id;
    if (!id) return;
    this.patchMessage(id, { plain: true });
  },

  async onSend() {
    if (this.data.sending) return;
    const question = (this.data.inputValue || '').trim();
    if (!question) {
      wx.showToast({ title: '先写一句想问的', icon: 'none' });
      return;
    }

    const now = formatMsgTime();
    const userId = `u-${Date.now()}`;
    const aiId = `a-${Date.now()}`;
    // 不用 [...arr]：devtools SWC 会注入 @swc/runtime，小程序里找不到
    const nextMessages = this.data.messages.slice();
    nextMessages.push(
      { id: userId, role: 'user', content: question, time: now },
      {
        id: aiId,
        role: 'assistant',
        content: '',
        loading: true,
        time: now,
      },
    );

    this.setData({
      messages: nextMessages,
      inputValue: '',
      sending: true,
      scrollIntoView: 'msg-bottom',
      copyMenuId: '',
      suggestions: buildSuggestions(nextMessages),
    });

    try {
      const res = await request<AskResp>({
        url: '/api/v1/ask',
        method: 'POST',
        data: { question },
      });
      const answer = (res?.answer || '').trim() || '韭菜保护协会没找到相关记录';
      const updated = this.patchMessage(aiId, {
        content: answer,
        html: mdToHtml(answer),
        loading: false,
        plain: false,
        time: formatMsgTime(),
      });
      this.saveHistory(updated);
    } catch (e) {
      const fallback = '小韭菜这会儿卡壳了，过会儿再问一次呗。';
      const updated = this.patchMessage(aiId, {
        content: fallback,
        html: mdToHtml(fallback),
        loading: false,
        plain: false,
        time: formatMsgTime(),
      });
      this.saveHistory(updated);
    } finally {
      this.setData({ sending: false, scrollIntoView: 'msg-bottom' });
    }
  },

  patchMessage(id: string, patch: Partial<ChatMessage>): ChatMessage[] {
    const messages = this.data.messages.map((m) => {
      if (m.id !== id) return m;
      return Object.assign({}, m, patch) as ChatMessage;
    });
    this.setData({ messages });
    return messages;
  },

  // —— 语音：按住说话 ——

  warmupRecordAuth() {
    if (this._recordAuthed) return;
    wx.getSetting({
      success: (settingRes) => {
        if (settingRes.authSetting['scope.record'] === true) {
          this._recordAuthed = true;
        }
      },
    });
  },

  resetRecordUiState() {
    this._wantRecord = false;
    this._discardRecord = false;
    this._tooShort = false;
    this.clearDurationTimer();
    this.setData({
      recording: false,
      micPressed: false,
      showRecordPanel: false,
      recordDurationText: '00:00',
    });
  },

  stopRecordingIfNeeded() {
    this._wantRecord = false;
    this._discardRecord = true;
    this.clearDurationTimer();
    const busy =
      this.data.recording || this.data.showRecordPanel || this.data.micPressed;
    if (!busy) return;
    if (this.data.recording) {
      try {
        recognitionManager.stop();
      } catch (e) {
        this.resetRecordUiState();
        return;
      }
      this.setData({
        recording: false,
        micPressed: false,
        showRecordPanel: false,
      });
      return;
    }
    try {
      recognitionManager.stop();
    } catch (e) {
      // 可能尚未 start
    }
    this.resetRecordUiState();
  },

  guideOpenRecordSetting() {
    wx.showModal({
      title: '需要麦克风权限',
      content: '语音提问需要使用麦克风，请在设置中开启录音权限',
      confirmText: '去设置',
      success: (modalRes) => {
        if (modalRes.confirm) {
          wx.openSetting({});
        }
      },
    });
  },

  ensureRecordAuth(onOk: () => void) {
    if (this._recordAuthed) {
      onOk();
      return;
    }
    wx.getSetting({
      success: (settingRes) => {
        const auth = settingRes.authSetting['scope.record'];
        if (auth === true) {
          this._recordAuthed = true;
          onOk();
          return;
        }
        if (auth === false) {
          this._wantRecord = false;
          this.resetRecordUiState();
          this.guideOpenRecordSetting();
          return;
        }
        wx.authorize({
          scope: 'scope.record',
          success: () => {
            this._recordAuthed = true;
            onOk();
          },
          fail: () => {
            this._wantRecord = false;
            this.resetRecordUiState();
            this.guideOpenRecordSetting();
          },
        });
      },
      fail: () => {
        this._wantRecord = false;
        this.resetRecordUiState();
        wx.showToast({ title: '无法获取权限状态', icon: 'none' });
      },
    });
  },

  beginRecognition() {
    if (!this._wantRecord) {
      this.resetRecordUiState();
      return;
    }
    try {
      recognitionManager.start({ duration: RECORD_MAX_MS, lang: 'zh_CN' });
    } catch (err) {
      this.resetRecordUiState();
      wx.showToast({ title: '无法开始录音', icon: 'none' });
    }
  },

  onMicTouchStart() {
    if (this.data.sending || this.data.recording || this._wantRecord) return;
    this._wantRecord = true;
    this._discardRecord = false;
    this._tooShort = false;
    this.setData({
      micPressed: true,
      showRecordPanel: true,
      recordDurationText: '00:00',
      copyMenuId: '',
    });
    this.ensureRecordAuth(() => this.beginRecognition());
  },

  onMicTouchEnd() {
    this._wantRecord = false;
    if (
      !this.data.recording &&
      !this.data.showRecordPanel &&
      !this.data.micPressed
    ) {
      return;
    }

    let shouldDiscard = false;
    if (this.data.recording) {
      const elapsed = Date.now() - this._recordStartedAt;
      if (elapsed < RECORD_MIN_MS) {
        shouldDiscard = true;
        this._tooShort = true;
      }
    }
    this._discardRecord = shouldDiscard;

    if (this.data.recording) {
      try {
        recognitionManager.stop();
      } catch (e) {
        this.resetRecordUiState();
      }
      return;
    }

    // 尚未 onStart 就抬手
    this._discardRecord = true;
    this.resetRecordUiState();
  },

  onMicTouchCancel() {
    this.onMicTouchEnd();
  },
});

/** 记一笔页：纯常量 */

/** 快捷金额（元） */
export const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

/** 每周几展示（与后端 0=周一 … 6=周日 对齐） */
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 每月 1–31 号文案 */
export const MONTH_DAY_LABELS: string[] = [];
for (let d = 1; d <= 31; d++) {
  MONTH_DAY_LABELS.push(d + '号');
}

/** 上滑取消阈值（rpx） */
export const CANCEL_SLIDE_RPX = 100;
/** 录音最长时长（ms），到时自动停并识别 */
export const RECORD_MAX_MS = 60000;
/** 太短则丢弃（ms），避免误触闪录 */
export const RECORD_MIN_MS = 500;

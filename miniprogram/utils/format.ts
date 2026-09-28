/** 金额格式化：保留两位小数 */
export function formatAmount(n: number | string): string {
  const num = Number(n);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
}

/** 本月起止 ISO（本地时区） */
export function currentMonthRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  return { start, end, label };
}

/** 是否在本月 */
export function isInMonth(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** 是否为今天（本地时区） */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** 仅时分 HH:mm（按日分组列表用） */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  const h = `${d.getHours()}`.padStart(2, '0');
  const min = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${min}`;
}

/** bill_time 是否只有日期（时分秒全 0） */
export function isDateOnlyTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

/** 日期前缀：今天 / MM-DD */
function formatDatePrefix(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return '今天';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${m}-${day}`;
}

/**
 * 列表/解析结果时间展示：
 * - 有精确钟点 → 「今天 12:00」/「09-23 12:00」
 * - 仅日期+时段 → 「今天 中午」/「09-23 中午」
 * - 都没有 → 「今天」/「09-23」
 */
export function formatBillTime(iso: string, timePeriod?: string | null): string {
  const prefix = formatDatePrefix(iso);
  if (timePeriod) return `${prefix} ${timePeriod}`;
  if (isDateOnlyTime(iso)) return prefix;
  return `${prefix} ${formatClock(iso)}`;
}

/**
 * 按日分组列表右侧：时段 / 钟点 / 空（仅日期）
 */
export function formatBillClockOrPeriod(iso: string, timePeriod?: string | null): string {
  if (timePeriod) return timePeriod;
  if (isDateOnlyTime(iso)) return '';
  return formatClock(iso);
}

/** 分组标题：今天 / 昨天 / MM月DD日 */
export function formatDayTitle(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - target.getTime()) / 86400000;
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 日期 key：YYYY-MM-DD */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** picker 用的本地日期 YYYY-MM-DD */
export function toDateValue(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** picker 用的本地时分 HH:mm */
export function toTimeValue(d: Date = new Date()): string {
  const h = `${d.getHours()}`.padStart(2, '0');
  const min = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${min}`;
}

/** 本地日期+可选时分 → 后端可读的本地字面量（无 Z，避免时区漂移） */
export function combineLocalDateTime(dateValue: string, timeValue?: string | null): string {
  const clock = timeValue && timeValue.length >= 4 ? timeValue : '00:00';
  return `${dateValue}T${clock}:00`;
}

/** 清洗金额输入：最多两位小数 */
export function sanitizeAmountInput(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) {
    v = parts[0] + '.' + parts.slice(1).join('');
  }
  const [intPart, decPart] = v.split('.');
  if (decPart !== undefined) {
    return `${intPart}.${decPart.slice(0, 2)}`;
  }
  return intPart || '';
}

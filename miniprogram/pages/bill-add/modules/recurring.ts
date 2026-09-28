/** 周期账单：日期 → picker 下标 */

/** YYYY-MM-DD → 周一=0 … 周日=6 */
export function weekdayIndexOf(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return 0;
  // JS getDay: 0=周日 → 转成 0=周一
  return (d.getDay() + 6) % 7;
}

/** YYYY-MM-DD → 几号（1–31），picker 下标 = 日 - 1 */
export function monthDayIndexOf(dateStr: string): number {
  const parts = (dateStr || '').split('-');
  const day = Number(parts[2]) || 1;
  return Math.min(Math.max(day, 1), 31) - 1;
}

/** AI 确认列表：展示行构建 / 日期时间 patch（禁止展开运算符） */

import {
  combineLocalDateTime,
  formatAmount,
  formatBillTime,
  toDateValue,
  toTimeValue,
} from '../../../utils/format';
import type { AiParseResult } from '../../../types/api';

/** 列表展示用（金额/时间已格式化；时间可 picker 编辑） */
export interface AiResultRow extends AiParseResult {
  amountText: string;
  timeText: string;
  /** picker mode=date */
  dateValue: string;
  /** picker mode=time；无精确钟点时占位 12:00 */
  timeValue: string;
  /** 该条正在提交 */
  saving?: boolean;
}

/** 单条解析结果 → 展示行 */
export function buildAiResultRow(item: AiParseResult): AiResultRow {
  const d = new Date(item.bill_time);
  const hasExact = !!item.has_exact_time;
  const period = hasExact ? null : item.time_period || null;
  const dateValue = toDateValue(d);
  const timeValue = hasExact ? toTimeValue(d) : '12:00';
  const bill_time = hasExact
    ? combineLocalDateTime(dateValue, timeValue)
    : combineLocalDateTime(dateValue, null);
  return Object.assign({}, item, {
    bill_time,
    time_period: period,
    has_exact_time: hasExact,
    amountText: formatAmount(item.amount),
    timeText: formatBillTime(bill_time, period),
    dateValue,
    timeValue,
    saving: false,
  });
}

/** 解析列表 → setData 字段 */
export function computeAiResultsView(items: AiParseResult[]) {
  const aiResults = items.map((item) => buildAiResultRow(item));
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += Number(items[i].amount || 0);
  }
  return {
    aiResults,
    aiResultCount: aiResults.length,
    aiTotalAmountText: formatAmount(total),
  };
}

/** 改某一条日期，返回新 list */
export function patchAiRowDate(
  list: AiResultRow[],
  idx: number,
  dateValue: string,
): AiResultRow[] | null {
  const row = list[idx];
  if (!row) return null;
  const next = list.slice();
  const hasExact = !!row.has_exact_time;
  const period = hasExact ? null : row.time_period;
  const bill_time = hasExact
    ? combineLocalDateTime(dateValue, row.timeValue)
    : combineLocalDateTime(dateValue, null);
  next[idx] = Object.assign({}, row, {
    dateValue,
    bill_time,
    time_period: period,
    timeText: formatBillTime(bill_time, period),
  });
  return next;
}

/** 改某一条钟点 → 精确时间，返回新 list */
export function patchAiRowTime(
  list: AiResultRow[],
  idx: number,
  timeValue: string,
): AiResultRow[] | null {
  const row = list[idx];
  if (!row) return null;
  const next = list.slice();
  const bill_time = combineLocalDateTime(row.dateValue, timeValue);
  next[idx] = Object.assign({}, row, {
    timeValue,
    bill_time,
    has_exact_time: true,
    time_period: null,
    timeText: formatBillTime(bill_time, null),
  });
  return next;
}

/** 过滤掉收入条目 */
export function filterExpenseItems(items: AiParseResult[]): AiParseResult[] {
  return items.filter((it) => it.is_expense !== false);
}

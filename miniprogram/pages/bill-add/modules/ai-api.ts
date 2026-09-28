/** 记一笔页：AI parse / OCR / 提交账单（无 setData） */

import { request } from '../../../utils/request';
import { prepareOcrImage, readFileAsDataUrl } from '../../../utils/image';
import type { AiParseResponse, AiParseResult } from '../../../types/api';
import { filterExpenseItems } from './ai-results';

export async function parseAiText(text: string): Promise<{
  items: AiParseResult[];
  rawCount: number;
}> {
  const result = await request<AiParseResponse>({
    url: '/api/v1/ai/parse',
    method: 'POST',
    data: { text },
  });
  const raw = result?.items || [];
  return { items: filterExpenseItems(raw), rawCount: raw.length };
}

export async function parseOcrImage(localPath: string): Promise<{
  items: AiParseResult[];
  rawCount: number;
  ocrText: string;
}> {
  const compressed = await prepareOcrImage(localPath);
  const image = await readFileAsDataUrl(compressed);
  if (image.length > 3500000) {
    throw new Error('图片还是太大，换张清晰小图');
  }
  const result = await request<AiParseResponse>({
    url: '/api/v1/ai/ocr',
    method: 'POST',
    data: { image },
    timeout: 90000,
  });
  const raw = result?.items || [];
  return {
    items: filterExpenseItems(raw),
    rawCount: raw.length,
    ocrText: (result.ocr_text || '').trim(),
  };
}

function aiBillPayload(item: AiParseResult, rawText: string) {
  return {
    amount: item.amount,
    category: item.category,
    sub_category: item.sub_category,
    description: item.description || null,
    source: 'ai',
    raw_text: (rawText || '').trim() || null,
    bill_time: item.bill_time,
    time_period: item.has_exact_time ? null : item.time_period || null,
  };
}

export async function postAiBill(item: AiParseResult, rawText: string): Promise<void> {
  await request({
    url: '/api/v1/bills',
    method: 'POST',
    data: aiBillPayload(item, rawText),
  });
}

/** 全部确认：一次提交多笔，服务端整批事务 */
export async function postAiBillsBatch(
  items: AiParseResult[],
  rawText: string,
): Promise<void> {
  const bills = items.map((item) => aiBillPayload(item, rawText));
  await request({
    url: '/api/v1/bills/batch',
    method: 'POST',
    data: { bills },
  });
}

export async function postManualBill(payload: Record<string, unknown>): Promise<void> {
  await request({
    url: '/api/v1/bills',
    method: 'POST',
    data: payload,
  });
}

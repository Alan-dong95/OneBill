/**
 * 共享 API 类型：契约主体由 OpenAPI 生成，见 generated.ts。
 * 重新生成: cd server && python -m scripts.gen_frontend_types
 */

export type {
  AiParseResponse,
  AiParseResult,
  AskResponse,
  Bill,
  BillListResp,
  BudgetOut,
  CategoriesOut,
  FeedbackOut,
  MonthlyReportResp,
  StatsCategoryItem,
  StatsDailyItem,
  StatsOverview,
  StatsRankItem,
  StatsTrendItem,
} from './generated';

/** 复盘接口 LLM 失败兜底文案特征（不当作点评展示） */
export const REPORT_FALLBACK_HINT = '账本这会儿卡壳了';

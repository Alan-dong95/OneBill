/**
 * 由 server/scripts/gen_frontend_types.py 从 OpenAPI 生成，请勿手改。
 * 重新生成: cd server && python -m scripts.gen_frontend_types
 */

export interface Bill {
  id: number;
  amount: number;
  category: string;
  sub_category: string | null;
  description: string | null;
  source: string;
  bill_time: string;
  time_period?: string | null;
}

export interface BillListResp {
  total: number;
  bills: Array<Bill>;
  has_more: boolean;
}

export interface StatsOverview {
  total: number;
  count: number;
  by_category: Array<StatsCategoryItem>;
  monthly_trend: Array<StatsTrendItem>;
  top_categories: Array<StatsRankItem>;
  last_7_days?: Array<StatsDailyItem>;
  streak_days?: number;
}

export interface StatsCategoryItem {
  name: string;
  amount: number;
  percent: number;
}

export interface StatsTrendItem {
  month: string;
  amount: number;
}

export interface StatsDailyItem {
  date: string;
  amount: number;
}

export interface StatsRankItem {
  name: string;
  amount: number;
}

export interface BudgetOut {
  monthly_budget: number;
  spent: number;
  remaining: number;
  percent: number;
}

export interface AiParseResult {
  amount: number;
  category: string;
  sub_category?: string | null;
  description: string;
  bill_time: string;
  time_period?: string | null;
  has_exact_time?: boolean;
  is_expense?: boolean;
}

export interface AiParseResponse {
  items: Array<AiParseResult>;
  ocr_text?: string | null;
}

export interface MonthlyReportResp {
  month: string;
  stats: MonthlyStats;
  summary: string;
  cached?: boolean;
}

export interface MonthlyStats {
  total_amount: number;
  bill_count: number;
  avg_per_day: number;
  by_category: Array<ReportCategoryStat>;
  top_expense?: TopExpense | null;
  top_category_by_count?: string | null;
}

export interface ReportCategoryStat {
  category: string;
  amount: number;
  count: number;
  percent: number;
}

export interface TopExpense {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  bill_time: string;
}

export interface CategoriesOut {
  categories: Array<string>;
  legacy_map?: Record<string, unknown>;
}

export interface AskResponse {
  answer: string;
}

export interface FeedbackOut {
  ok?: boolean;
}

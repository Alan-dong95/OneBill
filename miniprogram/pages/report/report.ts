import { request } from '../../utils/request';
import { currentMonthRange, formatAmount, toDateValue } from '../../utils/format';
import { MASCOT } from '../../utils/mascot';
import { mdToHtml } from '../../utils/markdown';
import type { MonthlyReportResp, StatsOverview } from '../../types/api';

/** 复盘卡片内 mp-html 标签样式 */
const REPORT_TAG_STYLE = {
  p: 'margin:0 0 12px;font-size:14px;line-height:1.75;color:#1a2e1f;',
  strong: 'font-weight:700;color:#1a2e1f;',
  ul: 'margin:8px 0 12px;padding-left:1.25em;color:#1a2e1f;',
  li: 'margin:6px 0;font-size:14px;line-height:1.75;color:#1a2e1f;',
};

Page({
  data: {
    monthLabel: '',
    monthTotal: '0.00',
    monthCount: 0,
    loadingAmount: true,
    amountError: false,
    reportLoading: false,
    reportSummary: '',
    /** markdown 转好的 HTML */
    reportHtml: '',
    /** 渲染失败时降级纯文本 */
    reportPlain: false,
    mascotThinking: MASCOT.reportLoading,
    reportTagStyle: REPORT_TAG_STYLE,
    reportContainerStyle: 'font-size:14px;line-height:1.75;color:#1a2e1f;',
  },

  onLoad() {
    this.loadMonthAmount();
    this.fetchMonthlyReport(false);
  },

  /** 顶部当月支出大数字（与首页同源：stats/overview） */
  async loadMonthAmount() {
    const { label } = currentMonthRange();
    this.setData({ monthLabel: label, loadingAmount: true, amountError: false });

    try {
      const month = toDateValue().slice(0, 7);
      const res = await request<StatsOverview>({
        url: '/api/v1/stats/overview',
        method: 'POST',
        data: { month, mode: 'month' },
      });
      this.setData({
        monthTotal: formatAmount(res.total),
        monthCount: res.count || 0,
        loadingAmount: false,
        amountError: false,
      });
    } catch (e) {
      this.setData({ loadingAmount: false, amountError: true });
    }
  },

  onRetryAmount() {
    this.loadMonthAmount();
  },

  onRegenReport() {
    this.fetchMonthlyReport(true);
  },

  /** mp-html 出错：降级纯文字 */
  onReportMdError() {
    this.setData({ reportPlain: true });
  },

  async fetchMonthlyReport(force: boolean) {
    if (this.data.reportLoading) return;

    this.setData({ reportLoading: true, reportPlain: false });

    try {
      const res = await request<MonthlyReportResp>({
        url: '/api/v1/report/monthly',
        method: 'POST',
        data: { force },
      });
      const summary = res.summary || '';
      this.setData({
        reportSummary: summary,
        reportHtml: mdToHtml(summary),
        reportLoading: false,
        reportPlain: false,
      });
    } catch (e) {
      const summary =
        this.data.reportSummary ||
        '复盘暂时没出来，过会儿再试。韭菜保护协会提醒你：账还在，别慌。';
      this.setData({
        reportLoading: false,
        reportSummary: summary,
        reportHtml: mdToHtml(summary),
      });
    }
  },
});

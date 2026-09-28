/**
 * ECharts option 工厂（账单列表 / 统计页共用）。
 * 禁止展开运算符：devtools SWC 会注入 @swc/runtime。
 */
import { formatAmount } from './format';

/** 品牌绿色系扇区色板 */
export const PIE_COLORS = [
  '#27ae60',
  '#2ecc71',
  '#58d68d',
  '#1a2e1f',
  '#52be80',
  '#2a4a32',
  '#82e0aa',
  '#145a32',
  '#7dcea0',
  '#239b56',
  '#a9dfbf',
  '#196f3d',
];

export interface PieSlice {
  name: string;
  amount: number;
}

export interface PieOptionOpts {
  /** 中心副标题，如「本月支出」 */
  subtext?: string;
  /** 默认 '{b}\\n{d}%'；列表页可用 '{b}' */
  labelFormatter?: string;
  labelWidth?: number;
  showTooltip?: boolean;
}

/** 分类占比环形图 */
export function buildPieOption(
  list: PieSlice[],
  total: number,
  opts?: PieOptionOpts,
) {
  const subtext = (opts && opts.subtext) || '';
  const labelFormatter = (opts && opts.labelFormatter) || '{b}\n{d}%';
  const labelWidth = typeof (opts && opts.labelWidth) === 'number' ? opts!.labelWidth! : 56;
  const showTooltip = opts && opts.showTooltip === false ? false : true;

  const option: Record<string, unknown> = {
    color: PIE_COLORS,
    title: {
      text: total > 0 ? `¥${formatAmount(total)}` : '',
      subtext: total > 0 ? subtext : '',
      left: 'center',
      top: '38%',
      textStyle: { fontSize: 16, fontWeight: 700, color: '#1a2e1f' },
      subtextStyle: { fontSize: 11, color: '#9aab9e' },
      itemGap: 4,
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '48%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'outside',
          formatter: labelFormatter,
          fontSize: 10,
          color: '#5a6b5e',
          overflow: 'truncate',
          width: labelWidth,
        },
        labelLine: {
          length: 10,
          length2: 6,
          lineStyle: { color: '#c5d0c8', width: 1 },
        },
        data: list.map((item) => ({
          name: item.name,
          value: item.amount,
        })),
      },
    ],
  };

  if (showTooltip) {
    option.tooltip = {
      trigger: 'item',
      formatter: '{b}: ¥{c} ({d}%)',
    };
  }

  return option;
}

/** 最近 7 天柱状图，今天高亮 */
export function buildBarOption(days: { date: string; amount: number }[]) {
  const labels = days.map((d) => d.date);
  const values = days.map((d) => d.amount);
  const todayIndex = days.length - 1;

  return {
    grid: {
      left: 12,
      right: 12,
      top: 28,
      bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { name: string; data: number | { value: number } }[]) => {
        const p = params[0];
        const v = typeof p.data === 'object' ? p.data.value : p.data;
        return `${p.name}\n¥${formatAmount(v)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#eef3ef' } },
      axisLabel: { fontSize: 10, color: '#9aab9e', interval: 0 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 3,
      axisLabel: {
        fontSize: 10,
        color: '#b5c4b8',
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
      },
      splitLine: { lineStyle: { color: '#f0f4f1', type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        barWidth: '42%',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: i === todayIndex ? '#1a2e1f' : '#2ecc71',
            borderRadius: [6, 6, 0, 0],
          },
        })),
      },
    ],
  };
}

/** 趋势折线图（近 6 月或全年 1–12 月） */
export function buildLineOption(trend: { month: string; amount: number }[]) {
  const labels = trend.map((t) => {
    const parts = t.month.split('-');
    return `${Number(parts[1])}月`;
  });
  const values = trend.map((t) => t.amount);
  const dense = labels.length > 6;

  return {
    grid: {
      left: 12,
      right: 16,
      top: 28,
      bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { name: string; data: number }[]) => {
        const p = params[0];
        return `${p.name}\n¥${formatAmount(p.data)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#eef3ef' } },
      axisLabel: {
        fontSize: dense ? 9 : 10,
        color: '#9aab9e',
        interval: dense ? 0 : 'auto',
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 3,
      axisLabel: {
        fontSize: 10,
        color: '#b5c4b8',
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
      },
      splitLine: { lineStyle: { color: '#f0f4f1', type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: dense ? 6 : 8,
        data: values,
        lineStyle: { color: '#27ae60', width: 3 },
        itemStyle: { color: '#2ecc71', borderColor: '#fff', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(46, 204, 113, 0.28)' },
              { offset: 1, color: 'rgba(46, 204, 113, 0.02)' },
            ],
          },
        },
      },
    ],
  };
}

/** 分类排行横向柱状图 */
export function buildRankOption(list: { name: string; amount: number }[]) {
  const sorted = list.slice().reverse();
  const names = sorted.map((i) => i.name);
  const values = sorted.map((i) => i.amount);
  let maxVal = 1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > maxVal) maxVal = values[i];
  }

  return {
    grid: {
      left: 8,
      right: 48,
      top: 8,
      bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; data: number }[]) => {
        const p = params[0];
        return `${p.name}：¥${formatAmount(p.data)}`;
      },
    },
    xAxis: {
      type: 'value',
      max: maxVal * 1.15,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { fontSize: 12, color: '#5a6b5e' },
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        data: values,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#58d68d' },
              { offset: 1, color: '#27ae60' },
            ],
          },
          borderRadius: [0, 8, 8, 0],
        },
        label: {
          show: true,
          position: 'right',
          formatter: (p: { value: number }) => `¥${formatAmount(p.value)}`,
          fontSize: 10,
          color: '#9aab9e',
        },
      },
    ],
  };
}

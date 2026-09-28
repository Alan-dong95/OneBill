/** 精简 ECharts 类型声明（与 echarts.js 同目录） */
export interface EChartsInstance {
  setOption(option: unknown, notMerge?: boolean): void;
  clear(): void;
  dispose(): void;
}

export interface CanvasLike {
  setChart(chart: EChartsInstance): void;
}

export function init(
  canvas: CanvasLike,
  theme?: string | null,
  opts?: { width?: number; height?: number; devicePixelRatio?: number },
): EChartsInstance;

export function setPlatformAPI(api: unknown): void;
export function setCanvasCreator(fn: () => unknown): void;
export function registerPreprocessor(fn: (option: any) => void): void;

/**
 * 精简 ECharts 入口：仅注册实际用到的图与组件（饼 / 柱 / 折线）
 */
import * as echarts from 'echarts/core';
import { PieChart, BarChart, LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LabelLayout,
  CanvasRenderer,
]);

// 兼容 import * as echarts from './echarts'
export const init = echarts.init;
export const use = echarts.use;
export const registerPreprocessor = echarts.registerPreprocessor;
export const setPlatformAPI = echarts.setPlatformAPI;
export const setCanvasCreator = echarts.setCanvasCreator;
export const connect = echarts.connect;
export const disconnect = echarts.disconnect;
export const dispose = echarts.dispose;
export const getInstanceByDom = echarts.getInstanceByDom;
export const getInstanceById = echarts.getInstanceById;
export const registerTheme = echarts.registerTheme;
export const registerLocale = echarts.registerLocale;
export const registerMap = echarts.registerMap;
export const getMap = echarts.getMap;
export const graphic = echarts.graphic;
export const util = echarts.util;
export const number = echarts.number;
export const time = echarts.time;
export const format = echarts.format;
export const color = echarts.color;
export const version = echarts.version;

export default echarts;

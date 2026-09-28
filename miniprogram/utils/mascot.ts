/** 韭菜吉祥物资源路径（按场景选用；走线上 static，减小小程序包体） */
const STATIC = 'https://ajgekjgs.fit/static';

export const MASCOT = {
  /** 标准站立抱账本：启动页 / 关于 / 空状态 / 我的页默认头像 */
  stand: `${STATIC}/stand.jpg`,
  /** 眨眼比耶：记账成功 / 本月稳住庆祝 / 我的页·节俭王 */
  celebrate: `${STATIC}/celebrate.jpg`,
  /** 捂额冒汗：超支预警 / 被割复盘 / 我的页·月光族 */
  fleeced: `${STATIC}/fleeced.jpg`,
  /**
   * 我的页·外卖战士。
   * 暂无「抱外卖」专用图，先用站立；有图后改成 takeout.jpg 即可。
   */
  takeout: `${STATIC}/stand.jpg`,
  /** 小韭菜写账本：菜菜复盘入口 / 加载 / 卡片头像 */
  reportLoading: `${STATIC}/report-loading.jpg`,
} as const;

export type MascotMood = keyof typeof MASCOT;

/** 本月「刀口有点深」阈值（元），达到则用被割表情 */
export const MONTH_FLEECED_YUAN = 3000;

/** 本月支出偏低阈值（元），有账单且低于此视为稳住 */
export const MONTH_SAFE_YUAN = 1000;

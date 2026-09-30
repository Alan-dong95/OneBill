import { mdToHtml } from '../../utils/markdown';

/** 用户服务协议原文（markdown） */
const USER_MD = `# 韭菜保护本用户服务协议

更新日期：2026年9月28日

欢迎使用韭菜保护本AI记账小程序（以下简称"本小程序"）。

## 一、服务内容
本小程序提供AI智能记账服务，包括但不限于：
1. 文字、语音、拍照三种方式快速记账
2. 月度支出统计与图表分析
3. AI消费复盘与智能问答

## 二、用户账号
1. 用户通过微信授权登录，账号与微信账号绑定
2. 用户应妥善保管微信账号，对账号下的所有行为负责
3. 不得利用本小程序从事任何违法违规活动

## 三、用户数据
1. 用户记录的账单数据归用户所有
2. 我们承诺不向第三方出售或共享用户账单数据
3. 用户可随时删除账单或注销账号

## 四、服务变更与终止
1. 我们有权根据产品发展调整、暂停或终止部分服务
2. 服务变更将通过小程序内通知告知用户

## 五、免责声明
1. 本小程序提供的AI分析、统计结果仅供参考
2. 不构成任何投资、财务建议
3. 用户应自行对财务决策负责

## 六、协议更新
本协议可能不定期更新，更新后将在小程序内公示。继续使用即视为同意更新后的协议。`;

/** 隐私政策原文（markdown） */
const PRIVACY_MD = `# 韭菜保护本隐私政策

更新日期：2026年9月28日

我们非常重视用户的隐私保护。

## 一、我们收集的信息
1. 微信昵称和头像：用于显示用户身份
2. 账单数据：你手动记录的金额、分类、备注、时间等
3. 语音和照片：仅用于记账识别，识别完成后不保存原始文件

## 二、信息如何使用
收集的信息仅用于：
1. 提供记账、统计、图表展示功能
2. 进行AI消费分析与复盘
3. 改进产品体验

## 三、信息存储与保护
1. 数据存储在安全的服务器上
2. 不会向任何第三方出售、出租或共享你的个人信息
3. 不会用于任何商业广告推送

## 四、你的权利
1. 你可以随时查看、修改、删除你的账单数据
2. 你可以通过"意见反馈"申请注销账号

## 五、信息共享
我们不会向任何第三方共享你的个人信息，除非：
1. 获得你的明确同意
2. 法律法规要求

## 六、联系我们
如有任何隐私相关问题，请通过小程序内"意见反馈"联系我们。`;

/** mp-html 标签样式，贴合品牌绿字色 */
const TAG_STYLE = {
  h1: 'margin:0 0 20px;font-size:20px;font-weight:800;line-height:1.4;color:#1a2e1f;',
  h2: 'margin:24px 0 12px;font-size:16px;font-weight:700;line-height:1.4;color:#1a2e1f;',
  h3: 'margin:20px 0 10px;font-size:15px;font-weight:700;line-height:1.4;color:#1a2e1f;',
  p: 'margin:0 0 12px;font-size:14px;line-height:1.75;color:#1a2e1f;',
  strong: 'font-weight:700;color:#1a2e1f;',
  ul: 'margin:8px 0 12px;padding-left:1.25em;color:#1a2e1f;',
  li: 'margin:6px 0;font-size:14px;line-height:1.75;color:#1a2e1f;',
};

Page({
  data: {
    html: '',
    plain: false,
    tagStyle: TAG_STYLE,
    containerStyle: 'font-size:14px;line-height:1.75;color:#1a2e1f;padding:8px 0;',
  },

  onLoad(query: Record<string, string | undefined>) {
    const type = (query.type || 'user').toLowerCase();
    const isPrivacy = type === 'privacy';
    const md = isPrivacy ? PRIVACY_MD : USER_MD;
    wx.setNavigationBarTitle({
      title: isPrivacy ? '隐私政策' : '用户服务协议',
    });
    this.setData({ html: mdToHtml(md), plain: false });
  },

  /** mp-html 出错：降级展示原文提示 */
  onMdError() {
    this.setData({ plain: true });
  },
});

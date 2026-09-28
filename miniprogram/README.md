# 韭菜保护本 · 小程序

微信原生 + TypeScript。产品说明见仓库根目录 [`README.md`](../README.md)，后端接口见 [`server/README.md`](../server/README.md)。

## 本地运行

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开本目录
2. 改 `config.ts` 的 `API_BASE`：
   - 本地（仓库默认）：`http://localhost:8000`（需关闭「校验合法域名」）
   - 正式版：改成你自己的 HTTPS 域名（勿把生产域名提交进公开仓库）
3. 如需类型 / 图表依赖：`npm install` 后编译运行

登录在 `app.ts` 的 `onLaunch` 自动完成；Token 存本地，请求统一走 `utils/request`。

## 目录速览

```
miniprogram/
├── app.ts / app.json / app.wxss
├── config.ts              # 仅此处配置 API_BASE
├── pages/
│   ├── bill-add/          # 记一笔（AI / 手动 / OCR；全部确认走批量）
│   ├── bill-list/         # 列表 + 本月饼图（overview）
│   ├── bill-edit/
│   ├── stats/ / report/   # 统计与月度复盘
│   ├── ask/               # 账单问答
│   ├── budget/ / recurring/
│   ├── index/ / profile/ / feedback/ …
├── components/ec-canvas/  # ECharts（精简入口，改图类型需 rebuild）
├── utils/                 # request、format、categories、charts …
└── types/                 # generated.ts 由后端 OpenAPI 生成，勿手改
```

## 与后端约定（近期）

| 场景 | 接口 |
|------|------|
| 手动记账 / AI 单条确认 | `POST /api/v1/bills` |
| AI「全部确认」 | `POST /api/v1/bills/batch`（body `{ bills: [...] }`） |
| 账单列表本月饼图 | `POST /api/v1/stats/overview`（`mode=month`，不拉全量账单） |
| 统计页图表 | 同上 overview；月度点评可再调 report |

AI 解析 / OCR 只出草稿，确认后才入库。实现见 `pages/bill-add/modules/ai-api.ts`。

## 类型同步

后端改了入出参后，在 `server/` 下重新生成：

```bash
cd server
python -m scripts.gen_frontend_types
```

会覆盖 `types/generated.ts`；业务侧从 `types/api` 再导出使用。

## 开发注意

- 网络请求必须走 `utils/request`，不要页面里裸写 `wx.request`
- 禁止数组 / 对象展开运算符（devtools SWC 会注入小程序没有的 runtime）
- 用户可见文案可带「韭菜保护协会」口吻；注释用简体中文

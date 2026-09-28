# 韭菜保护本 · OneBill AI

AI 记账微信小程序：语音 / 自然语言一句话入账，自动分类，月度洞察，账单 RAG 问答。

> 产品叙事与面试材料见根目录 [`index.html`](./index.html)（落地手册）。

## 功能一览

| 能力 | 说明 |
|------|------|
| 微信登录 | `wx.login` → 后端 `code2session` → JWT |
| 手动记账 | 金额 / 分类 / 描述 / 日期 |
| AI 快速记 | 文本 / 语音 / OCR → LLM 解析草稿 → 单条确认或全部确认入库 |
| 账单列表 | 按用户隔离，支持编辑 / 删除；顶部本月饼图走统计聚合 |
| 月度洞察 | SQL 聚合 + LLM 自然语言总结，按月缓存 |
| 账单问答 | 意图分流：聚合走 SQL，明细走 pgvector 语义检索 |
| 消费统计 | 分类占比、月趋势等（ECharts）；与列表饼图共用 overview |

## 技术栈

- **小程序**：TypeScript + 微信原生 + WechatSI（语音）+ ECharts + mp-html
- **后端**：FastAPI + SQLAlchemy + JWT
- **数据库**：PostgreSQL 16 + pgvector（账单向量 HNSW）
- **模型**：SiliconFlow 对话 LLM（默认 `Qwen/Qwen2.5-7B-Instruct`，解析 / 月报 / 问答）、`BAAI/bge-m3`（Embedding）

## 仓库结构

```
onebill-ai-plan/
├── miniprogram/          # 微信小程序（详见 miniprogram/README.md）
├── server/               # FastAPI 后端（详见 server/README.md）
├── index.html            # 面试项目落地手册
└── assets/               # 品牌素材
```

TLS 证书、服务器 `.env` 只放本机 / 服务器，勿提交公开仓库。

## 快速开始

### 1. 后端

```bash
cd server

# 数据库（PostgreSQL 16 + pgvector）
createdb -U postgres onebill
# 推荐 Alembic；或 psql -f sql/init.sql（见 server/README）
cd server && alembic upgrade head

# 依赖与环境
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填 DATABASE_URL / 微信 / JWT / LLM_* / SiliconFlow

uvicorn app.main:app --reload --port 8000
```

验证：<http://localhost:8000/health> → `{"status":"ok"}`，接口文档 <http://localhost:8000/docs>。

### 2. 小程序

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开 `miniprogram/`
2. 按需改 `miniprogram/config.ts` 中的 `API_BASE`：
   - 本地（仓库默认）：`http://localhost:8000`（开发者工具需关闭「校验合法域名」）
   - 正式版：改成你自己的 HTTPS 域名（勿把生产域名提交进公开仓库）
3. `npm install`（如需类型与图表依赖），编译运行

登录在 `app.ts` 的 `onLaunch` 自动完成；Token 存本地并随请求带上。

## API 摘要

> 路径本身不是密钥；鉴权靠微信登录换 JWT。生产请关闭 Swagger（`EXPOSE_API_DOCS=false`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login` | 微信 code 换 JWT |
| POST | `/api/v1/bills` | 创建单笔账单 |
| POST | `/api/v1/bills/batch` | 批量创建（1–50 笔，整批事务；AI「全部确认」用） |
| GET | `/api/v1/bills` | 账单分页列表（`month` / `keyword`） |
| PUT | `/api/v1/bills/{id}` | 更新账单 |
| DELETE | `/api/v1/bills/{id}` | 删除账单 |
| POST | `/api/v1/ai/parse` | 自然语言解析（不入库） |
| POST | `/api/v1/ai/ocr` | 图片 OCR → 多笔草稿（不入库） |
| POST | `/api/v1/report/monthly` | 月度复盘（可缓存） |
| POST | `/api/v1/ask` | 账单问答 |
| POST | `/api/v1/stats/overview` | 统计概览（统计页 + 账单列表本月饼图） |
| GET | `/api/v1/meta/categories` | 分类枚举（前后端对齐） |
| GET | `/health` | 健康检查 |

鉴权：除登录与 health 外，请求头 `Authorization: Bearer <token>`。完整列表见 [`server/README.md`](./server/README.md)。

## 数据模型（要点）

- `users` — 微信 openid
- `bills` — 金额、12 类分类、来源、原文、记账时间
- `bill_vectors` — 账单描述 Embedding（1024 维，入库时写入）
- `monthly_reports` — 月报 JSON 缓存（`user_id + month` 唯一）

建表脚本：`server/sql/init.sql`。

## 设计要点

- **AI 只出草稿**：解析结果需用户确认后才写入账单，避免幻觉金额直接入库。
- **单条 / 批量分流**：手动与单条确认走 `POST /bills`；AI「全部确认」走 `POST /bills/batch`（整批成功或整批失败）。
- **饼图不拉全量账单**：账单列表本月分类饼图直接调 `stats/overview`，由服务端聚合。
- **混合检索问答**：LLM 判意图 → 聚合类走 SQL；回忆类走向量相似度；失败有兜底文案。
- **月报缓存**：同用户同月默认读缓存，`force=true` 可强制重生。

## 进度对照（相对落地手册）

- [x] 第 0 阶段：骨架、登录、建表
- [x] 第 1 阶段：账单 CRUD（按用户隔离）
- [x] 第 2 阶段：AI 自然语言 / 语音解析
- [x] 第 3 阶段：月度洞察
- [x] 第 4 阶段：RAG 问答
- [x] 第 5 阶段：统计页等完善
- [x] 拍照 OCR 入账（草稿确认后入库）
- [x] 账单批量创建 + 列表饼图复用 overview
- [ ] P2：预算提醒 / 订阅检测 / 多账本（未做）

## 相关文档

- 后端细节与环境变量：[`server/README.md`](./server/README.md)
- 小程序说明：[`miniprogram/README.md`](./miniprogram/README.md)
- 环境变量模板：[`server/.env.example`](./server/.env.example)
- 产品 / 架构 / 面试叙事：[`index.html`](./index.html)

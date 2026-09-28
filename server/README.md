# 韭菜保护本 · 后端

FastAPI + PostgreSQL(pgvector) + 微信登录 JWT + SiliconFlow（对话 LLM + Embedding）。

完整产品说明见仓库根目录 [`README.md`](../README.md)。

## 启动步骤

1. **建数据库**（PostgreSQL 16 + pgvector）

   ```bash
   createdb -U postgres onebill
   # 推荐：Alembic（与 models 同源）
   alembic upgrade head
   # 或兜底：psql -U postgres -d onebill -f sql/init.sql
   # 已有库（曾跑过 init.sql / migrate_*.sql）只需登记版本：
   # alembic stamp head
   ```

2. **装依赖**

   ```bash
   python -m venv .venv
   # Windows: .venv\Scripts\activate
   # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **配环境变量**

   ```bash
   cp .env.example .env
   ```

   必填：`DATABASE_URL`、`WECHAT_APPID`、`WECHAT_SECRET`、`JWT_SECRET`  
   AI 相关：`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`（解析 / 月报 / 问答）、`SILICONFLOW_API_KEY`（Embedding）  
   微信密钥在小程序后台「开发 → 开发设置」。

4. **启动**

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

5. **验证**

   - <http://localhost:8000/health> → `{"status":"ok"}`
   - <http://localhost:8000/docs> → Swagger

## 目录速览

```
server/
├── app/
│   ├── main.py              # 入口、CORS、路由挂载
│   ├── config.py            # 环境变量
│   ├── database.py          # SQLAlchemy 会话
│   ├── models.py            # User / Bill / MonthlyReport
│   ├── schemas/             # 入出参（按域拆分，__init__ 再导出）
│   ├── constants.py         # 分类 / 时段常量
│   ├── deps.py              # get_current_user
│   ├── timeutil.py          # 东八区月范围等
│   ├── core/
│   │   ├── security.py      # JWT 签发与校验
│   │   └── rate_limit.py    # 按用户/IP 滑动窗口限流（进程内）
│   ├── services/
│   │   ├── llm.py           # 对话 LLM（带 timeout）
│   │   ├── embedding.py     # SiliconFlow bge-m3（带 timeout）
│   │   ├── bill_vector.py   # 账单向量写入 / 补写
│   │   ├── ask.py / ai_parse.py / report.py / …
│   │   └── recurring.py     # 周期账单入账
│   └── routers/
│       ├── auth.py          # POST /api/v1/auth/login
│       ├── bills.py         # 账单 CRUD / 批量创建 / 导出 + 异步写向量
│       ├── ai.py            # POST /api/v1/ai/parse、/ocr
│       ├── report.py        # POST /api/v1/report/monthly
│       ├── ask.py           # POST /api/v1/ask（SQL + 向量混合）
│       ├── stats.py         # POST /api/v1/stats/overview
│       └── feedback.py      # 意见反馈
├── alembic/                 # 数据库迁移（新变更走这里）
├── sql/init.sql             # 空白库兜底建表（与 0001_initial 对齐）
├── scripts/
│   ├── backfill_vectors.py      # 补写缺失 embedding
│   ├── pack-deploy.ps1          # 本机打部署 zip（排除 .env / .venv）
│   └── remote-sync-deploy.sh    # 服务器上解压同步并重启（保留 .env / .venv）
├── tests/                   # 关键路径单测
├── .env.example
└── requirements.txt
```

## 常用脚本

```bash
# 从 OpenAPI 生成小程序 types/generated.ts
python -m scripts.gen_frontend_types

# 分类前后端一致性
pytest tests/test_category_parity.py -q

# 本机打部署包（仓库根目录生成 server-deploy-*.zip）
powershell -ExecutionPolicy Bypass -File server/scripts/pack-deploy.ps1
```

反馈截图落盘目录默认 `uploads/`（`UPLOAD_DIR`），经 `/uploads/...` 静态访问；历史 JSONB 里的 base64 行不自动迁移。

## 部署

### 线上约定（单实例）

| 项 | 当前值 | 备注 |
|----|--------|------|
| 机器 | 阿里云 ECS（示例 IP 见域名解析） | 备案 / 接入备案须与云厂商一致 |
| 域名 | `https://ajgekjgs.fit` | DNS 建议「仅 DNS」、勿开 Cloudflare 橙云代理，国内才稳 |
| 代码目录 | `/opt/onebill/server` | 线上 `.env`、`.venv` **只在服务器维护**，部署包不带密钥 |
| 进程 | `systemd` 服务名 `onebill` | 单 worker；限流与周期入账任务都是进程内逻辑，多实例会重复 |
| 反代 | Nginx → `127.0.0.1:8000` | 对外 443；证书勿提交公开仓库 |
| CORS | 环境变量 `CORS_ORIGINS` | 生产应收紧；开发可为 `*` |

水平扩展前需先换 Redis 限流 + 外部 cron，再上多 worker。

### 日常更新（推荐流程）

以下在 **Windows 本机**打包装包，在 **服务器**解压同步。路径按实际改。

#### 1. 本机打包

在仓库根目录执行：

```powershell
# 排除 .venv / .env / 各类 cache，生成 server-deploy-yyyyMMdd-HHmmss.zip
powershell -ExecutionPolicy Bypass -File server/scripts/pack-deploy.ps1
```

备注：

- zip 打在仓库根目录，不是 `server/` 里
- **不要**把本机 `.env` 打进包；线上密钥与本机往往不同
- 打包前确认要上线的改动已保存；无新 Python 依赖时服务器上 `pip install` 很快

#### 2. 上传到服务器

本机已配置 SSH 密钥时（示例）：

```powershell
# 把下面 zip 名换成刚打出来的文件名；密钥路径按本机实际改
$zip = ".\server-deploy-yyyyMMdd-HHmmss.zip"
$key = "$env:USERPROFILE\.ssh\id_ed25519"

# 部署包放到 /tmp，避免直接盖到业务目录
scp -i $key $zip root@你的服务器IP:/tmp/server-deploy.zip

# 同步脚本一并上传（首次或脚本有改动时）
scp -i $key .\server\scripts\remote-sync-deploy.sh root@你的服务器IP:/tmp/remote-sync-deploy.sh
```

备注：

- 没有密钥时先用面板 / 密码登录，把本机公钥写入服务器 `~/.ssh/authorized_keys`
- 也可用宝塔 / SFTP 把 zip 传到 `/tmp`，效果相同

#### 3. 服务器上备份 → 解压 → 同步 → 重启

SSH 登录后执行（或本机一条 `ssh ...` 远程跑）：

```bash
set -e
TS=$(date +%Y%m%d%H%M%S)

# 整目录备份，出问题可快速回滚：cp -a server.bak.$TS server（先停服务再盖）
cp -a /opt/onebill/server "/opt/onebill/server.bak.$TS"

# 解压到临时目录；Windows 打的 zip 偶发警告，用 || true 避免误中断，再用目录是否存在校验
rm -rf /tmp/onebill-unpack
mkdir -p /tmp/onebill-unpack
unzip -o /tmp/server-deploy.zip -d /tmp/onebill-unpack >/tmp/unzip.log 2>&1 || true
test -d /tmp/onebill-unpack/app || { echo "unpack failed, see /tmp/unzip.log"; exit 1; }

# 去 CRLF 后执行同步脚本（脚本会跳过 .env / .venv，再 pip / alembic / restart）
sed -i 's/\r$//' /tmp/remote-sync-deploy.sh
chmod +x /tmp/remote-sync-deploy.sh
bash /tmp/remote-sync-deploy.sh
```

`remote-sync-deploy.sh` 会依次：

1. 把 `/tmp/onebill-unpack/*` 覆盖到 `/opt/onebill/server/`（**跳过** `.env`、`.venv`）
2. `pip install -r requirements.txt`（有新依赖才真正变版本）
3. `alembic upgrade head`（无新迁移则空跑）
4. `systemctl restart onebill`
5. 检查 `systemctl is-active` 与本机 `http://127.0.0.1:8000/health`

备注：

- **绝对不要**用本机 `.env` 覆盖线上；数据库密码、微信 Secret、JWT 都以服务器为准
- `uploads/` 若在业务目录内且 zip 里没有，同步脚本按「包内有的项」覆盖；重要上传文件建议单独挂盘或事先确认不会被删
- 回滚：停服务 → 用最近的 `server.bak.*` 盖回 → `systemctl start onebill`

#### 4. 验收

```bash
# 本机或服务器均可
curl -sS https://ajgekjgs.fit/health
# 期望：{"status":"ok"}

# 可选：看新路由是否进 OpenAPI（按本次改动替换路径）
curl -sS http://127.0.0.1:8000/openapi.json | python3 -c \
  "import sys,json; print('/api/v1/bills/batch' in json.load(sys.stdin).get('paths',{}))"
```

小程序正式版须指向 HTTPS 域名；本地调试把 `miniprogram/config.ts` 的 `API_BASE` 改为 `http://localhost:8000`，并关闭合法域名校验。

### 首次在空机器上装（概要）

已有线上实例可跳过。新机大致顺序：

1. 装 PostgreSQL 16 + pgvector，建库，配好 `DATABASE_URL`
2. 把代码放到 `/opt/onebill/server`，`python -m venv .venv`，`pip install -r requirements.txt`
3. 从 `.env.example` 写线上 `.env`（微信 / JWT / LLM / Embedding）
4. `alembic upgrade head`
5. 配 systemd：`WorkingDirectory=/opt/onebill/server`，启动类似  
   `uvicorn app.main:app --host 127.0.0.1 --port 8000`（单 worker）
6. Nginx 反代 443 → 8000，挂证书；安全组放行 80/443
7. 域名解析到公网 IP；国内访问勿再套一层海外 CDN 代理

### 部署注意

- `.env`、证书私钥、微信 Secret **不要**进 Git、不要打进部署 zip
- 限流为单进程内存实现；多 worker 时各进程独立计数，额度会放大
- 周期账单任务挂在 lifespan 上，多副本会重复执行

## API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/health` | 否 | 健康检查 |
| POST | `/api/v1/auth/login` | 否 | `code` → JWT（按 IP 限流） |
| POST | `/api/v1/bills` | 是 | 创建单笔（响应后异步写 embedding；可选周期模板） |
| POST | `/api/v1/bills/batch` | 是 | 批量创建，body `{ "bills": BillCreate[] }`，1–50 笔，整批同一事务 |
| GET | `/api/v1/bills` | 是 | 分页列表；`month=YYYY-MM` / `keyword`（有关键词时忽略月份） |
| GET | `/api/v1/bills/export` | 是 | 导出当前用户全部账单 CSV |
| PUT | `/api/v1/bills/{id}` | 是 | 更新账单（异步重写 embedding） |
| DELETE | `/api/v1/bills/{id}` | 是 | 删除账单 |
| POST | `/api/v1/ai/parse` | 是 | 自然语言 → 多笔草稿（不入库；限流） |
| POST | `/api/v1/ai/ocr` | 是 | 图片 OCR → 多笔草稿（不入库；限流） |
| POST | `/api/v1/report/monthly` | 是 | 月报；`force` 可刷新缓存（限流） |
| POST | `/api/v1/ask` | 是 | 账单问答（限流） |
| POST | `/api/v1/stats/overview` | 是 | 统计概览（`mode=month\|year`；小程序账单列表本月饼图也用此接口） |

请求头：`Authorization: Bearer <token>`。

AI 相关接口有进程内滑动窗口限流；超时默认 LLM 30s、Embedding 20s（可用 `LLM_TIMEOUT_SECONDS` / `EMBEDDING_TIMEOUT_SECONDS` 覆盖）。

向量补写（历史失败或上游短暂挂掉后）:

```bash
cd server
python -m scripts.backfill_vectors
python -m scripts.backfill_vectors --limit 50 --user-id 1
```

## 当前进度

- [x] FastAPI 骨架 + 健康检查
- [x] 微信登录 → JWT
- [x] 建表 SQL（含 pgvector / 月报缓存）
- [x] 账单 CRUD，按 `user_id` 隔离
- [x] 账单批量创建（`POST /bills/batch`，整批事务）
- [x] LLM 自然语言 / OCR 解析（支持一句拆多笔；默认硅基流动千问）
- [x] 入库异步写 `bill_vectors` + 补写脚本
- [x] 月度洞察 + JSONB 缓存
- [x] RAG 问答（聚合 SQL / 明细向量）
- [x] 统计 overview（含列表页饼图复用）
- [x] AI 限流 / 输入长度 / LLM·Embedding timeout

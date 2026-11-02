# RhineLab Console · 框架骨架

> Rust + Tauri。**业务面两端一致，管理面是独立平台。**
> 本目录可编译、可运行：后端能起、能登录、能建映射、能被 `curl` 打到；
> 业务面与管理面是两个独立前端 + 两个独立桌面应用。

---

## 一、形态

```
┌─ W 端（Windows）────────────────────────────────────────────────┐
│                                                                  │
│   Rhine Business（业务面）          Rhine Fleet Control（管理面） │
│   · 本机 mock 控制台                · 独立平台，与业务面不同应用  │
│   · 免登录（自用）                  · 必须登录（管理员）          │
│   · 只连 127.0.0.1                  · 连远端 L 端节点            │
│                                                                  │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ 本机 HTTP                      │ HTTP（登录后）
               ▼                               ▼
        ┌──────────────┐              ┌──────────────────────┐
        │ 本地 mock 引擎 │              │ L 端 agent            │
        │ RHINE_AUTH=off│              │ /api/business/* 需登录│
        └──────────────┘              │ /api/admin/*    需管理员│
                                      │ /mock/*         无鉴权 │
                                      └──────────┬───────────┘
                                                 │ 同一份 ui/business/
                                                 ▼
                                        L 端业务面（要登录）
```

三条规则，正好对应三处代码：

1. **业务面只有一个**：`ui/business/` 一份代码，W 端本机跑、L 端浏览器跑。
   两端唯一差异是 `/api/meta` 返回的 `authRequired`——`true` 就先过登录门，`false` 就直接进。
2. **管理面是独立产品**：`ui/admin/`（+ `desktop/admin/`），自带登录、只连远端节点，
   **没有任何业务面视图**；业务面里也没有管理面入口。
3. **共用的只有领域层**：`crates/core` 被 agent 依赖；两个前端只共用 `ui/shared/`
   （视觉令牌 + API 客户端 + 启动序列），不共用页面。

---

## 二、目录

```
console/
├─ Cargo.toml                 workspace（core + agent）
├─ crates/core/               领域层：模型 / 认证 / 存储（JSON 持久化）
├─ apps/agent/                L 端 + 本机引擎：axum 路由、mock 引擎、静态托管
├─ ui/
│   ├─ shared/base.css        视觉令牌（Rhine 语言）
│   ├─ shared/api.js          API 客户端 / 工具 / 启动序列
│   ├─ business/              业务面（W/L 共用；L 端多一道登录门）
│   └─ admin/                 管理面（独立平台）
├─ desktop/
│   ├─ business/              Tauri: Rhine Business
│   └─ admin/                 Tauri: Rhine Fleet Control
└─ verify-api.mjs             端到端验收脚本（40 项）
```

---

## 三、跑起来

```bash
cd console

# ① L 端（业务面需登录；管理面与它同源提供，便于本地调试）
RHINE_AUTH=on RHINE_PORT=9600 RHINE_UI=ui RHINE_DATA=data/agent.json \
  cargo run -p rhine-agent
#   业务面  http://127.0.0.1:9600/business/   viewer / rhine-viewer-2026
#   管理面  http://127.0.0.1:9600/admin/      admin  / rhine-admin-2026
#   mock    http://127.0.0.1:9600/mock/nemp/v1/ne/list

# ② W 端本地引擎（业务面免登录）
RHINE_AUTH=off RHINE_PORT=9601 RHINE_UI=ui RHINE_DATA=data/local.json \
  cargo run -p rhine-agent
#   业务面  http://127.0.0.1:9601/business/   （直接进，无登录）

# ③ W 端两个桌面应用（需要 tauri-cli）
cargo install tauri-cli --version "^2"
cd desktop/business && cargo tauri dev
cd desktop/admin    && cargo tauri dev
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `RHINE_PORT` | `9600` | 监听端口 |
| `RHINE_AUTH` | `on` | `off` = 本机免登录模式（业务面不要登录；管理面 API 仍拒绝） |
| `RHINE_DATA` | `data/rhine.json` | 状态文件，首次启动播种 |
| `RHINE_UI` | `../../ui` | 静态目录 |

> 两个模式共用同一个二进制。W 端的"本机引擎"就是 `RHINE_AUTH=off` 的 agent，
> 发布时作为 Tauri sidecar 打包（见 `desktop/README.md`）。

---

## 四、认证

| 位置 | 要求 |
| --- | --- |
| L 端业务面 `/api/business/*` | **需登录**（Cookie 会话 + CSRF） |
| W 端业务面（`RHINE_AUTH=off`） | **免登录**，服务端给合成本机身份，无 CSRF |
| 两端管理面 `/api/admin/*` | **需管理员**（本机模式下也拒绝，因为管理面是独立平台） |
| `/mock/*` | **无鉴权**——它就是被测系统要打的目标 |

实现细节：
- 口令 **Argon2id**（PHC 串），永不回传前端；响应只用 `UserView`。
- 会话 Cookie `rhine_sess`：HttpOnly + SameSite=Strict，8 小时。
- 写操作双提交 CSRF：`X-CSRF` 必须与会话值相等（仅登录模式）。
- 业务面按 `owner` 隔离数据；本地免登录模式是"整机单人"，因此返回全部映射。

---

## 五、API

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/api/meta` | —（前端据此决定"要不要登录"） |
| POST | `/api/auth/login` · `/api/auth/logout` · GET `/api/auth/me` | — / 登录 / 登录 |
| GET·POST | `/api/business/mappings` | 登录（本地模式免） |
| PATCH·DELETE | `/api/business/mappings/:id` | 登录 + CSRF |
| POST | `/api/business/mappings/:id/test` | 登录（服务端真等 `delay_ms`） |
| GET | `/api/business/stats` · `/api/business/logs` | 登录 |
| GET | `/api/admin/nodes` · `/api/admin/users` · `/api/admin/logs` | 管理员 |
| POST | `/api/admin/nodes/:id/deploy` · `/api/admin/users` | 管理员 + CSRF |
| GET | `/api/admin/jobs/:id` | 管理员 |
| ANY | `/mock/*path` | 无 |

部署作业是真实状态机（`upload → verify → activate → done`），执行者目前是 tokio 节拍器；
把 `advance_deploy` 换成 SSH/HTTPS 回执即可，前端不用改。

---

## 六、视觉

依据 `rhinelab-blog-theme` 的 `DESIGN.md` 文字基准复刻：暖灰白 `#eae5e1`、黑字、
暖杏金选中信号、细线 + 紧凑排字、大写宽字距。

| 元素 | 实现 |
| --- | --- |
| 品牌三行 | `RHINE LAB / MOCK SERVICE / L-AGENT`（业务面）· `FLEET CONTROL / ADMIN`（管理面） |
| 启动序列 | 逐字揭示 + 权限双环反向旋转 + 四帧闪切（25fps 闪切语言） |
| 扫描线 | 2px 细光带 9s 下扫 + 32px 网格 + 轻颗粒 |
| 卡片 | 暖纸半透明、双角标记、`X-001` 档案编号、琥珀短规、标题滚动入场 |
| 数字 | 全站等宽 + `tabular-nums` |
| 无障碍 | `prefers-reduced-motion` 全量降级 |

**许可边界**：只复刻视觉语言，不搬运任何素材。MiSans 字体、原片音频、模型、
莱茵生命名称与标志均不在上游 MIT 范围内；字体走系统回退。

---

## 七、已验证

Windows 11 / Rust 1.96 / Node 26，依赖离线编译：

| 项 | 结果 |
| --- | --- |
| `cargo check --offline --workspace` | 通过（95 依赖全部来自本机缓存） |
| `cargo test -p rhine-core` | **2/2**（Argon2 往返、token 随机） |
| `cargo build -p rhine-agent` | 通过，7.2 MB |
| `node verify-api.mjs`（L 端模式） | **40/40**：认证 / CSRF / CRUD / mock / 部署状态机 / 角色隔离 / 审计 |
| 本地模式（`RHINE_AUTH=off`） | 无 CSRF 创建 200、mock 命中 200、删除 200；`/api/admin/*` 仍 **403** |
| mock 延迟真实性 | `delay_ms=240` → 实测 262 ms（服务端 sleep） |
| 部署状态机 | 四阶段推进，节点 `0.1.0→0.2.0`，结束回 `online` |
| 浏览器：W 本地业务面 | 无登录门、徽标 `LOCAL`、无用户区、4 条映射；新建后 5 条并立刻被 mock 命中 |
| 浏览器：L 端业务面 | 登录门 → viewer 登录 → 徽标 `L-AGENT`、显示用户、4 条映射 |
| 浏览器：管理面 | 独立登录（`FLEET CONTROL`）→ 舰队 3 节点、汇总 3/2/0/1、**无业务面视图** |
| 浏览器报错 | 0 个 page error |

截图：`docs/screens/`（`ui-business-local` · `ui-business-gate` · `ui-business-agent` ·
`ui-admin-login` · `ui-admin-fleet`）。

**未验证 / 未实现**：Tauri 出安装包（需 tauri-cli 与联网下载依赖）、SQLite（当前 JSON）、
真实 SSH/HTTPS 部署通道（节拍器桩）。

---

## 八、下一步

1. **Tauri 出包**：补图标、sidecar 打包、自动更新签名。
2. **SQLite**：替换 `store.rs` 单文件实现，`Store` 边界已收拢。
3. **真实部署**：`advance_deploy` → `Deployer` trait（SSH / HTTP 两种实现）。
4. **L 端守护**：systemd unit + 只读根 + 内存上限。
5. **登录加固**：失败限速、会话轮转、可选 TOTP。

## 一键启动

```powershell
.\start-demo.ps1   # 仓库根目录
```r

自动拉起 L 端(9600)/W 端(9601) 并打开业务面。

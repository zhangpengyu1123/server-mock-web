# 业务面演示手册 · RHINE LAB PLANE

> 要照着讲？看 **[demo-script.md](demo-script.md)**（逐幕操作脚本 + 16 张截图）。

> 面向"有机响应"的 MoC 平台：**LCM 管版本 → OMC 管升级 → 升级的元组件仍是网元**，
> 全流程带人机交互（human-in-the-loop），风格统一为米白档案纸 + 黑墨细线 + 琥珀信号色。

- 入口：`http://127.0.0.1:9600/business/plane.html`
- 登录：L 端需要凭据（默认 `admin / rhine-admin-2026`）；W 端 `RHINE_AUTH=off` 自动跳过
- 数据：`console/data/*.json`（端点 / 映射规则 / 网元 / 网元组 / 软件包 / 平台配置 / 升级任务 / 人机模板）

---

---

## 0.1 一键启动

```powershell
# 推荐（PowerShell，自动起两个实例并打开页面）
.\start-demo.ps1

# 双击或 cmd
start-demo.cmd
```

脚本行为：

1. 检查 `console/target/debug/rhine-agent.exe` 是否存在（不存在会提示编译命令）
2. 9600 未监听 → 后台起 L 端（`RHINE_AUTH=on`，需登录）；9601 未监听 → 起 W 端（免登录）
3. 等到 9600 就绪（最多 20s）→ 自动打开 `business/plane.html`

| 端 | 地址 | 凭据 |
|---|---|---|
| L 端 | http://127.0.0.1:9600/business/plane.html | `admin / rhine-admin-2026` |
| W 端 | http://127.0.0.1:9601/business/plane.html | 免登录 |
| 看板 | http://127.0.0.1:9600/business/index.html | 同 L 端 |

停止：`Get-Process rhine-agent | Stop-Process -Force`

> 桌面壳：`console/desktop/business/`（Tauri 2）已指向 `business/plane.html`，
> CSP 放行 9600/9601。打包需要 WebView2 + `cargo tauri build`，不在日常编译链里。
## 0. 两层结构（不是六个平级平台）

```
LAYER 1 · 运行态            端口在跑、请求在流动
  MOCK 管理   注册监听 → 证书 → 能力 → 启停
  MOCK 流程   规则编辑器 + 人机交互 + 审计
  运行审计    真实请求流水（202 可一键放行）
        ▲ 执行
        │ 定义
LAYER 2 · 准备态            网元与拓扑、平台能力
  网元自定义 / 拓扑连接 / 人机交互 / OMC / LCM / FS
```

顶部两颗按钮就是层级切换（运行态 ↔ 准备态），中间写着「定义 ↓ 执行」。

---

## 1. MOCK 管理（运行态）

| 操作 | 说明 | 接口 |
|---|---|---|
| 填 Host / Port | 本机 IP + 端口 | — |
| 保存端点 | 写入端点 | `PATCH /api/business/endpoints/:id` |
| 挂载能力 | NEMP / NEF / ALARM / PERF / FM 多选 | 同上（capabilities） |
| 生成证书 | 签发演示自签证书（CN + SAN + 序列号 + PEM） | `POST /api/business/endpoints/:id/cert` |
| 开启服务 | `SERVICE 运行中` | `PATCH ... { enabled: true }` |

四步进度条会随状态点亮；右侧「端点状态（服务端）」显示 ID / Endpoint / Service / Certificate / Capabilities，证书全文直接可读。

---

## 2. MOCK 流程（运行态）

### 2.1 接口列表 → 编辑

列出所有 mapping（method / path / status / delay / rules / human 数），点「编辑」进入规则编辑器。

### 2.2 规则编辑器

- **响应基础**：HTTP Status 下拉（200/201/202/204/400/401/403/404/500/503）+ Delay 毫秒
- **响应字段（对象化管理）**：每行 = 字段名 + 类型下拉（string/number/boolean/object/array）+ 行为下拉 + 参数
  - `静态值`：原样输出，支持 `{{req.xxx}}` 插值
  - `自增`：`step` 递增，超过 `max` 回卷
  - `单次生效`：首次输出，之后该字段消失
  - `条件表达式`：`req.mode=="fast"?true:false`
- **人机交互节点**：提示文案、超时、选项（`Option → Effect(continue/hold/abort) → Set field`）
- 「保存规则」→ `PATCH /api/business/mappings/:id/rules`

### 2.3 引擎行为（真实生效）

```
命中规则 → 若 human.state = pending → 202 {humanPending, prompt, options} + 头 x-rhine-human: pending
         否则按字段生成 JSON → 延迟 delay_ms → 返回 status
```

实测样本（同一接口连续两次）：
```json
第 1 次 {"code":"0","data":{"neId":"GNB-01","ok":true},"seq":1,"token":"tk-once"}
第 2 次 {"code":"0","data":{"neId":"GNB-02","ok":false},"seq":2}
```

### 2.4 运行审计

每次命中落库（method / path / status / delay / human），`HUMAN 202` 行带**「确认」**按钮 → 放行后后续请求返回真响应。

---

## 3. 网元自定义（准备态）

- 列表：名称 / 架构 / 类型 / 版本 / 所属组
- **新建网元**：`POST /api/business/elements`（自动带 5 步升级流程，激活与主备倒换默认挂人机交互）
- **复制网元**：`POST /api/business/elements/:id/copy`
- **成组**：`POST /api/business/groups`
- **升级流程 / 参数校验可编辑**：进入「升级流程」→ 改步骤名、点开关挂/摘人机交互、增删步骤与校验规则 → 「保存到网元」(`PATCH /api/business/elements/:id`)
- 改版本时后端自动把旧版本压入 `prev_versions`

---

## 4. 拓扑连接（准备态）

- **2D**：SVG 正交连线，站点 → 网元组 → 网元，三层按钮切换，双击下钻，hover 档案卡
- **3D**：Blender 资产（站点平台 / 网元组托板 / 网元立卡 / 组件芯片），斜上 45° 可拖拽缩放
  - 卡面铭牌显示 `NE-0001 / gNB-HZ-0904 / v5.2.1`
  - 点选高亮邻接（琥珀连线加粗、非邻接压暗）
  - 双击网元 → 组件级（中心立卡 + 环形组件芯片）

---

## 5. 人机交互（准备态）

状态机可视化 + 可编辑：

- 状态表：ID / Label / Tone（signal / ink / danger / muted），可增删改
- 操作结果表：`Option → Effect → To state → Set field`，可增删改
- 「保存状态机」→ `PATCH /api/business/human-template`
- **该模板会真实影响升级任务弹出的人工确认选项**

默认：`确认继续/continue → RESOLVED`、`稍后处理/hold → PENDING`、`终止升级/abort → EXPIRED`

---

## 6. OMC 平台（准备态）

- **纳管网元**：点 chip 切换，写回 `platform.omc_elements`
- **站点**：名称 + 角色（primary / secondary）可编辑保存，后续任务与 LCM 升级都用它
- **账号**：填名字 + 选角色（运维 / 只读 / 管理员）→ 创建，授权范围取当前纳管网元
- **创建升级任务** → 进入时间线

### 6.1 升级任务时间线

5 段：`上传软件包 → 预检查与参数校验 → 激活 → 主备倒换 → 完成与回执`

- **前两段无人工 → 自动推进**（服务端 3s 一拍，前端 3s 轮询）
- **激活 / 主备倒换带人机交互** → 到点停下，琥珀卡片内联显示提示与选项
- 选项效果：`continue` 推进 / `hold` 挂起 / `abort` 失败归零

实测：创建后 6~10 秒内自动从 20% 走到 60%，停在「激活」；确认后继续到「主备倒换」；再确认到 100%。

---

## 7. LCM 平台（准备态）

- 管理的网元与当前 / 旧版本
- 软件包仓库：包名 / **类型** / **所属网元** / **厂商** / **版本**
- 与 OMC **共部署开关**（`platform.co_deploy`）
- **「升级」按钮** → `POST /api/business/packages/:id/upgrade`
  - 以「包所属网元当前版本」为 from、包版本（或指定版本）为 to
  - 直接生成一套 5 段升级任务并跳到时间线 ← **LCM↔OMC 的联动点**

---

## 8. FS 虚层平台（准备态）

- 平台配置：CPU 数量 / 主站点 / 备站点 / 平台版本（可 PATCH）
- **软件包校验流程（可执行）**：`POST /api/business/platform/fs/verify`
  - checksum → 签名 → 兼容性（仓库为空则失败）→ 主备站点一致性（同名则失败）
  - **失败即中断**，每步记录 `PASS/FAIL + note + 时间`
- 平台升级流程 6 步（展示用「演练一次」触发人工确认界面）

---

## 9. 数据流总览

```
MOCK 端点 ──→ /mock/* 引擎 ──→ 响应（规则字段 + 延迟 + 状态码）
                    │                 └─ 人机门 202 → 审计页确认 → 200
                    └─→ 审计（MockHit 环形缓冲 200 条）

网元（属性/版本/流程/校验/组件/组）
   ├─→ 拓扑 2D/3D（数据驱动）
   └─→ 组织成 网元组 → OMC 纳管

人机交互模板（状态 + 操作结果）
   └─→ 升级任务的人工确认选项

LCM 软件包（归属网元 + 版本）──→ 升级任务（from=网元当前版本, to=包版本）
                                    └─→ 时间线（自动推进 / 人工门拦截）

FS：平台版本 + 校验流程（可执行，失败中断）
```

---

## 10. 常用验证命令

```powershell
# 端点
curl http://127.0.0.1:9600/api/business/endpoints -b cookie
# 规则
curl -X PATCH .../api/business/mappings/map-0011/rules -d '{"fields":[...]}'
# 打 mock
curl -X POST http://127.0.0.1:9600/mock/demo/v1/rule -d '{"neId":"GNB-01","mode":"fast"}'
# 任务
curl http://127.0.0.1:9600/api/business/tasks
# FS 校验
curl -X POST http://127.0.0.1:9600/api/business/platform/fs/verify
```

---

## 11. 关键实现位置

| 层 | 文件 |
|---|---|
| 页面骨架 | `console/ui/business/plane.html` |
| 业务面逻辑 | `console/ui/business/plane.js`（13 个视图函数） |
| 样式 | `console/ui/business/plane.css` |
| 3D 拓扑 | `console/ui/business/plane-topo3d.js` |
| 拓扑资产 | `console/assets/blender/topo_assets_v1.py` → `console/ui/business/assets/topo_*.glb` |
| 后端模型 | `console/crates/core/src/model.rs` |
| 存储 | `console/crates/core/src/store.rs` |
| 接口与引擎 | `console/apps/agent/src/main.rs` |

---

## 12. 场景快照与教学场景库

MOCK 管理页右侧「场景快照（导出 / 导入）」：

| 操作 | 说明 |
|---|---|
| 预置场景下拉 + 载入 | 一键切到某套教学场景（会覆盖当前数据） |
| ↓ 导出场景 | 下载 `rhine-scene-*.json`（约 13 KB） |
| ↑ 导入场景 | 选本地 JSON 导入，提示「已导入 N 条 ✓」 |

快照内容：端点（含证书/能力）、网元（属性/版本/流程/校验/组件）、网元组、软件包、平台配置（站点/CPU/共部署）、人机模板、MOCK 映射（含 fields 与 variants）。

接口：

```bash
GET  /api/business/export        # 导出（登录即可）
POST /api/business/import        # 导入（管理员 + CSRF），整体覆盖，保留用户与会话
```

内置场景（`console/ui/business/scenes/`）：

| 文件 | 场景 | 要点 |
|---|---|---|
| `baseline.json` | 基线：单站点三网元 | 标准演示起点 |
| `co-deploy.json` | 双站点共部署 | CPU 32、共部署开启、版本 5.3.0 待升级 |
| `fault-drill.json` | 故障演练 | 注入 500 规则、慢速兜底 400ms、15s 人机超时 |
| `index.json` | 索引 | 下拉列表的数据源 |

> 换机器演示：把 `scenes/*.json` 或自己导出的快照拷过去，导入即可 1:1 复现。
---

## 0.2 便携发行版（免安装）

```powershell
node console/assets/make-dist.mjs      # 生成 dist/rhine-mock-console-1.0.0/
```

产物结构：

```
dist/rhine-mock-console-1.0.0/
  启动.cmd                一键起两个后端 + 打开桌面业务面
  停止.cmd
  rhine-agent.exe         后端（9.7 MB）
  Rhine 业务面.exe        桌面应用（12.1 MB，内嵌整套 UI）
  ui/                     静态前端（浏览器模式）
  data/                   数据文件（可备份替换）
  docs/                   演示手册 + 逐幕脚本 + 截图
  README.txt
```

实测（从 dist 目录独立运行）：9600/9601 均监听、浏览器 `plane.html → 200`、
`/api/meta.authRequired=false`、桌面壳加载「业务面 · RHINE LAB PLANE」。

> 桌面壳通过 WebView2 远程调试端口取证：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`，
> 用 CDP 可读到完整 DOM（包含从 9601 拉到的端点数据），说明桌面应用与本机 agent 已打通。
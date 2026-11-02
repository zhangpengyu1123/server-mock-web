# 业务面 · 信息架构与落地方案（v1 讨论稿）

> 目标：做一套「有机响应」的 Mock 平台 —— **LCM 管版本，OMC 管升级，升级的元组件本身是网元**，
> 交互上重点做**网元拓扑**与**人机交互（human-in-the-loop）状态机**，风格与管理面统一（米白档案纸 + 黑墨细线 + 琥珀信号色 + 大写小字）。

---

## 1. 顶层结构：一个产物，五个工作台

业务面是**单一前端产物**（`console/ui/business/`），同构部署；W 端免登录、L 端需登录（差别只在 `authRequired`）。
左侧工作台导航固定五项，右上是当前工作台上下文（平台实例 / 站点 / 版本）。

| 工作台 | 职责 | 核心对象 |
|---|---|---|
| **MOCK 管理** | 把本机变成 Mock 端点 | 监听端口、证书、平台能力挂载、启停 |
| **MOCK 流程** | 定义"接口怎么响应" | 接口、响应规则、字段、人机交互节点、审计 |
| **网元管理** | 定义"被测对象" | 网元、网元组、架构/类型/版本、升级步骤、参数校验 |
| **OMC 平台** | 网元的运维视角 | 平台纳管网元、账号、一体化升级任务 + 站点 |
| **LCM 平台** | 网元的版本视角 | 纳管网元、软件包仓库（类型/归属/厂商/版本）、共部署 |
| **FS 平台** | 独立简单流程 | CPU 数量、主副站点、升级流程、平台版本、包校验 |

FS 是"独立且简单"的一条支线：**平台自身的升级**（虚层），与 LCM/OMC 的网元升级并列，不混在同一条流程里。

---

## 2. 数据模型（先定骨架，后续可加字段）

```
Platform        { id, kind: OMC|LCM|FS, name, version, capabilities[], coDeployWith? }
MockEndpoint    { id, host, port, certId, capabilities[], enabled, nodeId? }
Cert            { id, cn, san[], issuedAt, expiresAt, pem, keyPem }
MockInterface   { id, endpointId, method, path, rules[], hits, audit[] }
Rule            { id, status, delayMs, fields[], humanSteps[] }
Field           { name, type, source: static|autoIncrement|once|conditional,
                  value?, step?, stepMax?, condition?, options? }
HumanStep       { id, prompt, options[{label,next}], timeoutMs, onTimeout }
NetworkElement  { id, name, arch, type, version, software, prevVersions[],
                  groupId?, params[], upgradeFlowId }
UpgradeFlow     { id, steps[], humanSteps[] }        // 网元升级流程（含人机交互）
UpgradeTask     { id, siteId, elementIds[], from, to, stage, progress, humanPending? }
SoftwarePackage { id, kind, elementType, vendor, version, checksum, verified }
Account         { id, name, elementIds[] }           // OMC 账号纳管范围
Site            { id, name, role: primary|secondary, elements[] }
```

**关系要点**：`LCM` 产出/管理**软件包与网元版本**；`OMC` 用这些版本**发起升级任务**；
升级的每一步若需要人工确认 → 进入 `HumanStep`（可在 MOCK 流程里定义，也可在网元升级流程里定义）。

---

## 3. 三个必须做好的交互（这是"有机"的关键）

### 3.1 网元拓扑
- **网元级拓扑**：站点 → 网元组 → 网元（可展开/折叠），布局用**正交连线**，不用力导向（更工程感）。
- **组件级拓扑**：进入某个网元 → 展开其**组成组件**（单板/进程/数据库/业务模块），组件间依赖用有向边。
- 两者共用一套画布组件：`topo.js`（SVG，米白底、黑墨 1px、琥珀选中、hover 显示档案纸卡）。
- 交互：hover 高亮邻接、点击右侧出档案纸详情、双击下钻（组 → 网元 → 组件）。

### 3.2 人机交互（Human-in-the-loop）
这是升级流程里"卡住等人"的节点，做成**一等公民**：

```
[升级执行中] ──► (HumanStep: 确认主备倒换) ──► [继续] ──► [完成]
                        │
                        └─► 超时 / 取消 ──► [挂起] ──► 可重试
```
- 每个 `HumanStep` 可定义：**提示文案、可选项（每项带 next 与副作用）、超时行为、是否可重复**
- 三种状态：`pending`（等人）/ `resolved`（已选）/ `expired`（超时，走 onTimeout）
- 平台侧（MOCK 流程）可预先配置"这个接口在第 N 次调用时抛出一个待确认状态"，用来驱动真实的人机交互演练

### 3.3 升级任务时间线
- 竖向时间线 + 阶段（upload → verify → activate → done），**每个阶段可挂人机交互**
- 任务详情右栏：关联站点、网元列表（拓扑缩略）、当前卡在哪个 HumanStep

---

## 4. 接口（业务面后端）

沿用现有 `/api/business/*` 前缀，逐步加：

```
GET/POST   /api/business/endpoints          监听端口登记（host/port/证书/能力）
POST       /api/business/certs              生成证书（CN + SAN，返回 pem/key）
PATCH      /api/business/endpoints/:id      挂载能力 / 启停
GET/POST   /api/business/interfaces         接口 + 响应规则（含字段、人机交互节点）
GET        /api/business/audit              请求响应审计（分页 + 过滤）
GET/POST   /api/business/elements           网元、网元组、参数校验规则
GET/POST   /api/business/flows              升级流程（步骤 + 人机交互）
GET/POST   /api/business/packages           软件包（LCM）
GET/POST   /api/business/tasks              升级任务（OMC），含 human 待办
POST       /api/business/tasks/:id/human    提交人机交互选择
```

**Mock 引擎扩展**：`/mock/*` 在命中规则后，若规则含 `humanSteps` 且未解决 → 返回 `202 + {humanPending, prompt, options}`，
并把状态挂起；前端在 MOCK 流程里显示"待你确认"卡片，选择后继续返回真实响应。

---

## 5. 分阶段落地（建议顺序）

| 阶段 | 交付 | 为什么先做 |
|---|---|---|
| **P1** | 业务面骨架：左侧六个工作台 + 路由 + 统一档案纸样式 + 拓扑画布组件 | 先把"壳"和画布做对，后面所有界面复用 |
| **P2** | MOCK 管理 + MOCK 流程（端口/证书/能力、接口规则、字段、审计） | 这是平台能被"请求"起来的基础，也能立刻自测 |
| **P3** | 网元管理 + 拓扑（网元级 / 组件级） | 被测对象定义清楚，OMC/LCM 才有意义 |
| **P4** | LCM（软件包、版本）+ OMC（账号、升级任务、站点） | 版本 → 升级 的主线闭环 |
| **P5** | 人机交互状态机 + FS 支线 | 最后把"有机响应"补齐 |

---

## 6. 需要你拍板的三个点

1. **P1 的壳**：业务面沿用现在这份单页（`ui/business/index.html` + app.js）扩展成六工作台，还是**新开一页** `plane.html` 专门跑六工作台（旧页保留给"快速 mock"）？
2. **拓扑粒度**：网元"组件"要不要我按**华为/中兴常见单板模型**（主控板 / 交换板 / 业务板 / 电源 / 风扇）先内置一套模板，还是全部由用户自定义？
3. **人机交互的驱动方式**：只在 MOCK 接口里配置（请求触发），还是也要能在**升级任务时间线**里手动"制造一个人工确认点"用于演练？我建议两者都要，但先做哪一个由你定。

---

## 7. 我会先动手的部分（等你确认后）

**P1 + P2 的第一刀**：
- `ui/business/` 加左侧工作台导航与视图切换（档案纸风格，复用管理面的 `rig-ui.css` 语汇）
- 画出 `topo.js`（SVG 拓扑画布：站点/网元组/网元三级，正交连线 + hover 档案卡 + 双击下钻）
- MOCK 管理页：**登记监听端口 → 生成证书 → 挂载能力 → 开启服务** 四步表单，接后端新接口
- MOCK 流程页：接口列表 + 响应规则编辑器（status/delay/字段表：静态 / 自增 / 单次生效 / 条件）+ 审计日志

先出 P1/P2 的可运行版本，再按 P3→P5 推。

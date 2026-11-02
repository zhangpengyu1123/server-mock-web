# V5 · 音乐调测台（Rhine Music Console）

> 把 mock 平台做成一台**正在运行的调测设备**：底部 transport 控服务起停与会话流量时间轴，
> 中间是专辑卡式的端点／能力／网元／软件包卡列，顶部是一条密集刻度尺导航。
> 语言取自莱茵生命音乐台 —— `UI组件库/07-Rhine-Music-Demo`（RonaldDeng，MIT，基于上游 `LBEILC/RhineLabUI`）。
>
> 三版（V1/V2/V3）之外的这一版只换**视觉语言与布局**；数据、规则引擎、模拟器、动效与微交互
> 全部来自 `../_shared/`（五版共用，本版未改动任何一个共享文件）。

打开：`http://127.0.0.1:4500/v5-music-console/`（`node serve.mjs` 已经在跑；本目录不含服务端代码）。

---

## 一、设计依据（只引用真读过的源码与文档）

| 依据 | 用途 |
| --- | --- |
| `07-Rhine-Music-Demo/DESIGN.md`（238 行，40 KB） | 完整设计基线：晨雾／月影命名与配色、`ContentTransition` 360ms、排字层级、列距与波浪语法、常态波动 2.5s、减少动态效果直接到位 |
| `07-Rhine-Music-Demo/src/music-theme.css`、`music-theme-switch.css`、`music.css`、`music-navigation-ruler.css` | `@property` 颜色插值（650ms 连续换主题）、主题底板横移 380ms、transport 控件、刻度尺 `--tick-*` 变量 |
| `07-Rhine-Music-Demo/src/music-app.ts`（transport 标记） | 「正在播放 + 播放/暂停/停止」的最小 transport 结构 |
| `08-RhineLabUI-上游`、`06-RhineLab-Blog-Theme` | 同源语言的共同约束（细线、几乎无圆角、强调靠琥珀与下划线） |
| `../_shared/RHINELAB-DESIGN-LANGUAGE.md` | 从三个仓库源码里数出来的色板与排字（本版逐条照用，未自行发明配色） |
| `../_shared/README.md` §1–§5 | 数据/动作契约、§4b `MP.btn`、§5 六界面验收清单 |

### 色板（值与我方 `app.css` 的 token 一一对应）

| token | 晨雾 `data-theme="dawn"` | 月影 `data-theme="moon"` |
| --- | --- | --- |
| `--canvas` / `--canvas-2` | `#e8e5e1` / `#eae5e1` | `#171713` / `#1b1b17` |
| `--paper` / `--paper-2` / `--surface` | `#fffaf5` / `#fff7ed` / `#efede7` | `#24221f` / `#2a2824` / `#201f1b` |
| `--ink` / `--ink-strong` / `--ink-2` | `#171713` / `#080a08` / `#24221f` | `#e9eef2` / `#f4f7fa` / `#dfe4e8` |
| `--muted` / `--muted-2` / `--muted-3` | `#74786f` / `#807866` / `#8e897b` | `#9caabd` / `#8d99a8` / `#7f8b99` |
| **`--accent`（暖杏金）** | **`#a67d48`**，亮部 `#ffe3b2` | **`#a67d48`**，亮部 `#ffe3b2` |
| 暖色阶 | `#e4d5c1` `#d8c9b9` `#c1b8a7` `#b4a18c` | `#3b352b` `#332f27` `#4a4438` `#5b5344` |
| 橄榄（完成态） | `#565c46` | `#8b9377` |
| 细线 `--line` / `--line-2` | `rgba(36,34,31,.26)` / `.14` | `rgba(208,226,243,.20)` / `.12` |

排字：区块标题 **22px** · 页签与分组标题 **14px** · 设置项与主操作 **13px** · 说明与次要操作 **12px** · 辅助小字 **11px**
（`.mcs__meta h1` 22 / `.mcdt__hd h2` 14 / `.mcin+.mcbtn` 13 / `.mcfld>label` 12 / `.mcfld__hint` 11，与上表逐一对应）。
字体：`MiSans → "PingFang SC","Microsoft YaHei",system-ui`；数字/时间/编号用 `"JetBrains Mono",Consolas,monospace`。
**无 `@font-face`、无外链字体、图标全部内联 SVG**（`_check.mjs` 的 c2–c4 会断言）。

形状：1px 细线是主结构手段，全站只有 `border-radius: 0`（搜索 `app.css` 无 `border-radius` 非零值）；
按钮是「细线文字按钮 / 1px 下划线」；`:focus-visible` 用 1px 琥珀描边；`disabled` 0.45 透明。

---

## 二、四个 signature 与平台数据的对应关系

### 1. 底部 transport 条 → mock 服务的遥控器

| transport 元素 | 绑定的平台数据 / 动作 |
| --- | --- |
| 大圆形主控（`#btnMain`，`data-fx="transport"`） | `MP.select.port()` 的 `running`：点击 → `startService` / `stopService`；图形按真实状态做 180ms 透明度+缩放切换（`.mct-bar.is-running`） |
| 进度轨（`#tlTrack`，`role="slider"`） | **会话流量时间轴**：`hist[]` 保存本次会话内到达的审计记录（上限 120 条），`tl.value/tl.max` 映射到 `MP.state.logs`；指针可拖（`X.scrub`），拖离右端即进入「回看」，右下角出现 `#tlLive`「回到实时」 |
| 循环重放（`#btnLoop`） | `MP.sim.start(2600 / (rate/2))` / `MP.sim.stop()`；`aria-pressed` 与 `S.ui.running` 同步 |
| 重放（`#btnReplay`） | `MP.actions.triggerApi(选中接口)` —— 真的走一遍规则引擎 |
| 速率刻度（`#rateWrap`，`role="slider"`，1–8 档） | 流速倍率 `rate/2`（0.5×–4×），换算成模拟器间隔 `2600/(rate/2)` ms，并写进 `#tlHint` 文案 |
| 停止服务（`#btnStopFuse`） | `stopService` + 可撤销 toast（撤销走 `startService`） |
| 「正在服务」块（`#npEndpoint` / `#npCaps`） | `IP:端口 + 当前接口路径`，能力行 = `方法 · 接口名 · 能力CODE 版本`（取 `SEL.capsOfPort`） |
| 右侧 `#smRequests / #smLatency / #smHuman` | `SEL.kpis()` 的 `req / avgLat / pendingHuman`，数字用 `MP.motion.countUp` |
| 频谱 `#spectrum`（canvas） | `pushHist()` 每来一条 `log` 事件就在随机位置 `pump()` 起一根柱，`rampLoop()` 每帧乘 0.90 衰减；柱高随 `t` 逐柱相位抖动 —— **跟着审计日志的到达节奏跳**；`MP.motion.reduced` 时只画静帧 |

### 2. 专辑卡阵列 → 端点／能力／接口／网元／软件包／任务

列 = 一级对象，卡 = 一级对象下的条目（`COLS[screen]` 每屏一份模型）：

| 屏 | 列 | 卡 |
| --- | --- | --- |
| `mock` | 端口（`S.ports`，列头显示 `协议/TLS`，列暗度按选中列） | 6 种平台能力（`S.caps`，显示挂载状态与端点数）+ 1 张 `SVC` 服务状态卡 |
| `flow` | 平台能力（只列有接口的） | 接口（方法/路径/状态码/时延/人机数/命中次数） |
| `ne` | 网元组 + 「未成组」 | 网元（`neId · version`，含类型/架构/状态标签） |
| `omp` | 受管网元 / 网元组 / 账号 / 一体化任务 / 站点（5 列） | 各自实体 |
| `lcm` | 软件包类型分组 + 受管网元列 | 软件包（已校验/待校验、大小、厂商） |
| `vlp` | 虚层实例 / 升级流程 / 软件包校验 / 平台软件包（4 列） | 站点与堆栈、4 个流程步骤、4 项校验、平台包 |

- 悬停轻抬（`MP.btn` subtle，`y:-1`）、点击选中、选中列以外的列 `--col-o:.42` 压暗 —— 注意力只跟着当前列。
- **异步波峰**：`wave()` 为每张卡按 `data-phase`（源自能力 hue / 路径长度 / 版本号）算出 `dist*46 + phase*90` ms 的延迟，推入 `waveQueue`；
  环境循环 `stepWaves(now)` 到点才用 `MP.motion.spring({from:-3-…, to:0, stiffness:300, damping:15})` 起跳 —— 临界阻尼、保留速度，
  于是**选中项先抬、两侧依次起伏**，不同列相位不同。
- 键盘：`←/→` 切列、`↑/↓` 切卡、到边界时 `boundBump()` 给一次弹簧橡皮筋反馈（不是「按了没反应」）；
  卡片是 `<button>`，`aria-pressed` 跟选中态同步；列头也是 `<button>`，点列头直接跳列。
- 每列补空位（`.mcard.is-empty`）维持列高，键盘导航自动跳过。

### 3. 刻度尺导航 → 六个界面

`buildRuler()` 按 `NAV_ORDER` 生成 6 个 `.mcr__tick`，每个 = `<i>` 细竖刻度 + `<u>` 两位编号 + `<span>` 中文标签；
刻度之间插 `.mcr__hatch`（`repeating-linear-gradient` 的密集短刻，原作 `music-navigation-ruler` 的做法）。
选中态：刻度从 10px 加长到 26px **并变琥珀**，下划线 180ms 跟上，中文标签显示出来；编号与右侧 `CONSOLE / SCREEN` 同步。
窄屏时刻度尺在**容器内**横向滚动，选中刻度自动 `scrollLeft` 回视野。

### 4. 晨雾／月影双主题 → 连续过渡（不是硬切）

- 所有颜色都是 `:root` / `:root[data-theme="moon"]` 上的变量，`app.css` 顶部给 `html/body/.mc/.mcb/.mcr/.mct-bar/.mcf/.mcs/.mcard/.mcdt*` 等挂了
  `transition: background-color/color/border-color var(--t-theme)`（`--t-theme: 650ms × --ms`），于是换主题是**沿同一条时钟插值**；
- 点击主题时另外叠一层从该按钮圆心展开的旧画布色光圈（`clip-path`，380ms），再淡出 240ms —— 参考原作「以当前选中元素为起点」的规则；
- 持久化 `localStorage['mp-v5-theme']`（与 v3 的 `mp-v3-theme` 分开，互不干扰）；首屏在 `boot()` 最前面应用，避免闪一下默认主题。

---

## 三、六个界面与 §5 清单逐条落点

| §5 条目 | 落点（本版 DOM / 动作） |
| --- | --- |
| S1 注册本机 IP + 端口（IP 可选网卡或手填，端口范围校验） | `#mA`（网卡下拉：`S.host.ip` / `S.host.alt` / 「手填…」）+ `#mIpH` + `#mP`（1024–65535 校验，`#mPErr` **就近报错**，`aria-invalid`）→ `MP.actions.registerPort`，异步 loading |
| S1 生成证书文件（CN、有效期、指纹；未签发要能签发） | `#mCert`「生成证书文件 / 重新签发」→ `MP.btn.loading` + `X.latticeLoader` 计时 → `MP.actions.generateCert`；`#mCertKv` 展示 STATUS/CN/VALID/FINGERPRINT，`#mCertMark`（`statusMark`）跟随签发态 |
| S1 挂载一种或多种平台能力（6 选 N，可卸载） | `#mCapGrid` 里 6 个 `X.velocitySwitch` → `attachCap` / `detachCap`；卡列里的能力卡同步显示「已挂载 · N 个接口」 |
| S1 开启 mock 服务（按住确认；可停止；停止后可撤销） | `#mStart` = `X.holdConfirm`（1100ms 按住到满，`MP.actions.startService`）；`#mFuse` = `X.fuseButton`（`stopService`，4s 引信内可撤销）；transport 主控与空格键也走同一动作 |
| S2 审计日志（实时追加、过滤、搜索、展开报文、重放） | `#fLogBody` 行首 5 列（时间/方法/路径/状态/时延），点开 `#fLogBody .mclog__bd` 看 REQUEST/RESPONSE/命中说明；`#fSegFilter`（`segmented`：全部/成功/异常/待人工）、`#fQuery` 搜索、`[data-replay]` 单条重放、`#fReplayAll` 批量重放（loading + 进度） |
| S2 定制延迟与 HTTP status | `#fDelayBox` = `X.scrub`（0–3000ms 步进 10，超界橡皮筋，`onChange` 写 `updateApi`）；`#fStatus` 8 档下拉 + `#fSeg` 常用状态快捷分段 → `updateApi` |
| S2 面向对象定制响应字段（下拉选 + 手填，可增删） | `#fFields` 每行：路径 `data-prop="key"` / 类型 9 档 `data-prop="type"` / 来源（下拉选・手填 `data-prop="source"`）/ 基准值 + 候选选项（`options` 逗号分隔）；`#fAddField` 新增、行尾 `[data-remove-field]` 删除 → `addField/updateField/removeField` |
| S2 字段级规则 自增／单次生效／条件（+固定／随机），命中说明可见 | `data-prop="rule.kind"` 五档下拉，切换时按类型补默认参数并重画该行；参数区 `data-rk="start|step|pattern"`（自增）、`times|fallback`（单次）、`when.key|when.op|when.value|then|else`（条件，`withWhen()` 维护隐藏基准 `when.base` 保证合并正确）、随机复用 `options`；命中说明在日志展开区的 `.mcnote`（key · 规则名 · 第 n 次命中 / 已失效返回兜底值） |
| S2 插入人机交互并放行/拒绝 | `#fIxAdd` + `#fIxKind`（人工确认/验证码/人工闸门）→ `addInteraction`；日志行上的 `[data-ix="approve|reject"]` → `resolveInteraction`（放行 200 / 拒绝 403），`#fIxList` 列出当前接口的人机交互 |
| S3 网元属性、架构、类型 | `#nName #nNeId #nType #nArch #nVendor #nGroup` → `updateNE` / `assignGroup` |
| S3 版本、使用软件名称、旧版本 | `#nVer #nSoft #nOld`（旧版本逗号分隔，回滚点候选）→ `updateNE` |
| S3 升级流程步骤（增删、排序、自动/人工/手动） | `#nFlow` 步骤链，`[data-step-up|down|del]` → `moveStep` / `removeStep`；`#nStepAdd`（名称/类型/耗时/归属）→ `addUpgradeStep` |
| S3 步骤中的人机交互 | `kind:'human'` 的步骤带 `interaction{owner,timeoutS}`（`#nStepOwner`）；`runUpgrade()` 跑到该步会**真的停下**并弹出「放行并继续」 |
| S3 网元成组 | `#nGroup` 下拉 + 「未成组」列；`#oGrpAdd` 新建组（名称/说明/策略） |
| S3 复制网元 | `#nCopy` → `copyNE`（编号自动递增），toast 带「撤销复制」动作 |
| S3 参数校验（规则 + 执行结果） | `#nValList` 规则清单 + `#nValField/#nValRule/#nValLevel/#nValMsg` 新增（正则先编译校验，`#nValRuleErr`）→ `addValidation`；`#nValRun` = loading + `latticeLoader` → `runValidation`，结果逐行 `.is-pass/.is-fail` 上色并更新 `#nValSummary` |
| S4 受管网元与组 | 表格 1：受管网元清单（组用 `[data-omp-group]` 下拉即改 → `assignGroup`）+ 组卡片列 |
| S4 账号管理的网元范围 | 表格 2 的「网元范围」列（组 + 追加网元数），`[data-acct-sw]` = `velocitySwitch` → `toggleAccount` |
| S4 创建账号 | `#oAcName/#oAcRole/#oAcScope/#oAcNes`（多选）→ `createAccount`，loading + 可撤销 toast |
| S4 创建一体化升级任务并关联站点 | `#oTkName/#oTkSite/#oTkOwner/#oTkNes`（多选）→ `createTask`；`[data-task-adv]` 逐个推进（loading），每步 `gauge` 显示进度，到「人工放行」会置 `waiting-human` |
| S5 定制平台管理的网元 | 表格的「受管网元」列 + 网元卡列（与网元管理平台同源数据） |
| S5 软件包（类型/所属网元/厂商/版本） | 表格每行 4 个可编辑控件 `[data-pkg-type|ne|vendor|ver]`；`#lPkgName/#lPkgType/#lPkgNe/#lPkgVendor/#lPkgVer/#lPkgSize` → `addPackage` |
| S5 与网元管理平台共部署 | `#lCoDeploy`（`velocitySwitch` → `toggleCoDeploy('lcmp')`）与 `#oCoDeploy`（`omp`）两处，端口复用说明跟着开关变；`S.deploy.*.host` 展示复用端口 |
| S6 CPU 数量 | `#vCpuBox` = `X.scrub`（`vlp.cpuRange` 4–64，橡皮筋）+ `#vGaugeBox` = `X.gauge` 占用读数 → `setCPU` |
| S6 主副站点 | `#vPri` / `#vSec` 两个下拉 + 互斥校验（相同则 `#vSiteErr` 报错）→ `setSite('primary'|'secondary')` |
| S6 升级流程详情 | `#vFlow` 四步（自动/手动/人工），`#vNext` 推进一步（loading；到人工步停下等人确认）、`#vReset` = `fuseButton` 重置可撤销 |
| S6 平台版本 | `#vVer` 下拉（R3.1.0 / R3.0.6 / R3.2.0-rc1）→ `setVlpVersion` |
| S6 软件包校验流程 | `#vChecks` 4 项（MD5/签名/依赖/回滚点），每项 `statusMark` 三段形变可点单跑；`#vCheckAll` = loading + `latticeLoader` 逐项 `runVlpCheck` |
| 全局：六屏可切换、切换动效连续 | `switchScreen()`：同帧隐藏旧页显示新页 + `.mcs__ct` 从 `.35` 淡入（`@keyframes mcContentIn`，360ms）= `ContentTransition`；同时用 `M.carry(刻度矩形, 新页内容)` 做共享元素连续过渡（无起点时退回 `M.iris`） |
| 全局：每次动作有反馈 | 63 处 `toast()` 调用（含撤销/动作按钮）、`statusMark` 形变、`gauge` 液面、可选音效 |
| 全局：键盘可达 / focus 可见 / aria-label | 卡片、列头、刻度、transport、抽屉全部是原生 `<button>`，关键控件有 `aria-label`/`aria-pressed`/`aria-expanded`/`aria-current`；`:focus-visible` 1px 琥珀描边；数字键 1–6 切屏、`←→↑↓` 切列切卡、`T` 主题、`L` 循环、空格启停、`Esc` 关抽屉 |
| 全局：四档断点不横向滚动 | 见下节 |
| 全局：`prefers-reduced-motion` | `MP.motion.reduced` 分支（跳过波浪/常态波动/光圈）+ CSS `@media (prefers-reduced-motion: reduce)` 全量归零（`.001ms`） |
| 全局：表单可见 label、就近报错、重画不丢焦点 | 每个控件都有 `<label for>` 或 `aria-label`；`fieldErr()` 写 `#xxxErr` 并给 `.has-err`；所有输入带 `data-fkey`，`keepFocus()` 在重画前后按 `data-fkey / data-fid+data-prop / data-fid+data-rk / data-log-id / id` 五级键恢复焦点、选区与滚动位置 |

---

## 四、微交互原语（`MP.micro`，12/12 全部使用，样式由本版自写 `mx-*`）

| 原语 | 调用点 | 语义 |
| --- | --- | --- |
| `holdConfirm` ×2 | `#mStart`、`#nRun` | 按住到满才开启 mock 服务 / 执行升级（不可轻率触发） |
| `fuseButton` ×3 | `#mFuse`、`#mRemove`、`#vReset`（另 `#lPkgDel` 用同语义的 toast 撤销） | 停止服务 / 移除端口 / 重置流程，完成后引信内可撤销 |
| `velocitySwitch` ×4 处 | 能力挂载 6 个、账号启停 N 个、共部署 2 个、接口（能力）开关 | 速度驱动的挤压开关 |
| `gauge` ×3 | `#nRunBox`（升级进度）、`#oTaskList` 每任务、`#vGaugeBox`（CPU 占用） | 连续量的惯性液面 |
| `statusMark` ×6 处 | `#mCertMark`、`#mSvcMark`、`#nRunMark`、软件包校验、`#vChecks` 4 项、`#vFlow` 4 步 | 环→弧→勾/叹号三段形变 |
| `scrub` ×3 | `#fDelayBox`（延迟 ms）、`#vCpuBox`（CPU 核数）、`#tlTrack`（流量时间轴） | 拖拽改值 + 超界橡皮筋 |
| `toast` ×63 调用点 | 全部动作反馈、撤销入口 | 引信倒计时 + 可撤销提示 |
| `rippleLoader` ×1 | 软件包校验按钮旁 | 菱形涟漪加载 |
| `latticeLoader` ×3 | 签发证书、参数校验、软件包/虚层校验 | 格点波动 + 实时计时 |
| `segmented` ×2 | `#fSegFilter`（日志过滤）、`#fSeg`（常用状态码） | 橡皮筋分段控件 |
| `magnetic` ×1 | 当前屏第一个主行动（`wireMagnets()` 按屏分配） | 技能要求一屏 ≤1–2 个磁吸焦点 |
| `spotlight` ×1 | 当前屏第一张卡 | 光斑跟随（`--mx/--my`） |

---

## 五、按钮动效（`MP.btn`，技能预设落地层）

`boot()` 里 `MP.btn.install()`，每次渲染后 `MP.btn.enhance(scope)`（共 4 处调用点）。

| `data-fx` | 数量 | 落点 |
| --- | --- | --- |
| `transport` | 1 | 底部大圆形主控 `#btnMain`（按下 `scale(.94)` + `latch` 音效 + 涟漪） |
| `standard` | 15 处（HTML 0 + JS 模板 15） | 六屏主行动：注册端口、签发证书、按住开启服务（`#mStart` 另挂 `holdConfirm`）、手动触发、保存网元、按住执行升级、执行参数校验、创建账号、创建任务、登记软件包、执行全部校验、放行（`[data-ix=approve]`）等 |
| `subtle`（默认） | 28 处（HTML 6 + JS 22） | 刻度、列头、卡列步进、抽屉、日志重放、细线工具按钮 |
| `magnetic` | 一屏 1 个（运行期分配） | `wireMagnets()` 把当前屏第一个 `.mcact` 升级为磁吸，其余保持 `standard` |
| `none` | 8 处 | 主题开关两格、`fuseButton` 外壳、共部署容器等（这些控件自己有运动语言，避免叠加） |
| `MP.btn.loading` | **14 处** | 注册端口、签发/重签证书、触发接口、批量重放、新建网元、参数校验、任务推进、创建账号、创建任务、登记软件包、软件包校验、虚层推进、虚层单项校验、虚层全部校验 |
| `MP.btn.ripple` | 1 处 | 空格键启动服务时给主控补一圈涟漪 |

实现要点：**事件委托**（document 上一套 `click / input / change / keydown` 监听），所以卡列、表格、日志频繁重画不需要重新绑定；
所有动效只用 `transform / opacity / box-shadow`；**没有**为动效引入彩色填充按钮 —— 保持莱茵生命的「裸按钮」语言。

---

## 六、动效清单

| 场景 | 实现 |
| --- | --- |
| 界面切换（360ms `ContentTransition`） | `switchScreen()` 同一帧 `hidden` 旧页、显示新页，给新页加 `.is-entering` → `@keyframes mcContentIn { from {opacity:.35} to {opacity:1} }`，时长 `--t-content: calc(360ms × --ms)`；420ms 后移除类。**不做双页交叉淡化**（避免文字重叠，这是原作明确撤回过的方案） |
| 共享元素连续过渡 | 点刻度时把该刻度的 `getBoundingClientRect()` 交给 `MP.motion.carry(rect, 新页 .mcs__ct, {duration:360})`（FLIP，从刻度长出来）；无起点时用 `M.iris`（首屏用 `M.develop` 显影） |
| 卡列选中 | `wave()` + `stepWaves()`：延迟 `dist*46 + phase*90` ms 后用 `MP.motion.spring({stiffness:300, damping:15})` 起跳 → 选中项抬起、两侧依次起伏 |
| 列间异步 | 常态波动每列相位差 0.55 弧度（`phase = ci * 0.55`）；卡级相位来自 `data-phase`（能力 hue / 路径长度 / 版本号 / 索引） |
| 常态轻微波动（2.5s 缓入） | `ambientLoop()`：`idle = clamp((now - lastInteract - 2500)/1600, 0, 1)`，`lastInteract` 由任何 `click/input/keydown/pointer` 刷新；振幅 `sin(t*0.9 + phase) * 2.6 * idle` 作用于列、列头与刻度尺读数区 |
| 数字滚动（460ms 家族） | `M.countUp` 用于 `#smRequests` 与卡片上的请求计数 |
| 主题切换 | 颜色变量 650ms 插值 + 从按钮圆心展开的旧画布色 `clip-path` 光圈（380ms）+ 240ms 淡出 |
| 弹窗（抽屉） | 进 300ms（`mcPop`，位移 12px）/ 出 200ms（`mcPopOut`，位移 8px） |
| 页签 / 下划线（150/180ms） | 刻度 `color` 150ms、刻度高度与下划线 180ms；主题底板横移 380ms、文字转色 260ms |
| 减少动态效果 | `MP.motion.reduced` 下：不加 `.is-entering` 动画、跳过波浪与常态波动、`carry/iris/develop` 直接返回；CSS 侧 `@media (prefers-reduced-motion: reduce)` 把所有 `animation/transition` 压到 `.001ms` |

---

## 七、响应式：375 / 768 / 1024 / 1440 四档

| 断点 | 关键变化 |
| --- | --- |
| ≥1440px | `--pad: 48px`；卡列宽 250px；transport 四段（正在服务 / 控件 / 时间轴 / 指标） |
| 1024–1439px | `--pad: 33px`；卡列 216px；transport 保持四段但收窄，隐藏 THEME 指标 |
| ≤1023px | `--pad: 25px`；`--barw: 104px`；transport 折成两行（`grid-template-areas: "now ctl" "tl tl"`），指标块隐藏 |
| ≤768px | `--pad: 20px`；顶栏文字控制收成图标、刻度尺隐藏右侧读数（`.mcr__now`）、卡列 200px、transport 主控 46px |
| ≤480px（覆盖 375） | `--pad: 16px`；卡列 176px；日志行去掉时延列；`#fFields` 行改单列（`.mcfw__row` 变 1 列）；toast 贴边 |

不横向滚动的三级防线：

1. 宽表格包在 `.mctbl-wrap`（`overflow-x:auto`）、卡列在 `.mcar__strip`（`overflow-x:auto`）、刻度尺在 `.mcr__inner`（`overflow-x:auto`）—— 一律**容器内**滚动；
2. 所有 flex/grid 子项带 `min-width: 0`（`.mcs`、`.mcar__col`、`.mcdt`、`.mcfld`、`.mcin`…），长字符串 `overflow-wrap/word-break`；
3. `html, body, .mc { overflow-x: hidden }` 兜底。

**我实测到的部分**：`_check.mjs` 只做静态断言（媒体查询数值与存在性、容器滚动与 `overflow-x` 防线存在）；
**没有**跑浏览器，因此 `document.documentElement.scrollWidth <= clientWidth + 1` 这个数值**未被本代理验证**，
需要验收方在 375 / 768 / 1024 / 1440 四档各开一次页面确认（我不占用同一个浏览器实例，也不重启 4500 端口）。

---

## 八、自检（可复现）

在 `mock-platform` 目录下：

```bash
node --check v5-music-console/app.js
node v5-music-console/_check.mjs
```

`_check.mjs` 分两部分：

- **A 静态自检**：a) 抓出 `app.js` 里所有 `$('#id')` / `getElementById('id')`，断言都存在于 `index.html`（动态注入容器走白名单）
  并断言 `index.html` 无重复 id；b) 六个 `data-screen`、六刻度导航、双主题控件 + `localStorage`、
  `MP.btn` ≥4 类用法、`MP.micro` ≥8 个原语、`data-fx` 分级、ContentTransition 360ms、carry/iris、2.5s 常态波动、列间相位、频谱、
  时间轴 scrub、速率刻度、端点信息；c) 脚本引入顺序、无外链资源/字体、图标内联 SVG；d) 四档媒体查询与横向溢出防线。
- **B 无浏览器冒烟**：手写一个极小 DOM/画布/存储替身（属性选择器、后代选择器、`innerHTML` 解析都实现），
  把 `../_shared/{domain,motion,micro,button-fx,fx}.js` 与 `app.js` 真跑一遍：boot、六屏切换、**全部 domain 动作**、
  事件委托（卡列/刻度/日志/字段表单）、键盘、主题持久化、transport 操作，以及每屏的**渲染内容断言**
  （有列有卡、计数格式、无 `undefined/NaN/[object` 泄漏、§5 所需控件与容器齐备）。
  不启动浏览器、不监听端口。

最后一次真实输出（本仓库当前代码）：

```
$ node --check v5-music-console/app.js
（无输出，exit 0）

$ node v5-music-console/_check.mjs
=== V5 · 音乐调测台 自检（静态 + 无浏览器冒烟） ===

A/B 静态自检 —— 通过 31 项：
  ✔ a) app.js 里 $('#id') / getElementById('id') 全部存在于 index.html（动态列白名单）  → 143 个字面量 id 全部命中
  ✔ a2) index.html 无重复 id  → 51 个 id 唯一
  ✔ b1) 六个 data-screen 齐全  → mock, flow, ne, omp, lcm, vlp
  ✔ b2) 六屏顺序由 NAV_ORDER 定义
  ✔ b3) 刻度尺导航生成逻辑（六刻度 + data-nav）
  ✔ b4) 双主题控件（晨雾／月影）+ localStorage 持久化
  ✔ b5) 主题键独立（mp-v5-theme，不与 v3/v4 冲突）
  ✔ b6) transport 大圆形主控带 data-fx="transport"
  ✔ b7) MP.btn ≥4 类用法  → install, enhance, loading, ripple
  ✔ b8) data-fx 分级使用  → subtle, standard, transport, none
  ✔ b9) 六屏合计「主行动」按钮 ≥4 处  → 15 处 standard
  ✔ b10) 异步操作使用 MP.btn.loading  → 14 处
  ✔ b11) magnetic 按屏分配（一屏 1 个，符合技能约束）
  ✔ b12) MP.micro ≥8 个不同原语（语义位置）  → 12 个：holdConfirm, velocitySwitch, gauge, statusMark, scrub, toast, rippleLoader, latticeLoader, segmented, fuseButton, magnetic, spotlight
  ✔ b13) ContentTransition（.is-entering + mcContentIn 关键帧）
  ✔ b14) ContentTransition 时长 360ms
  ✔ b15) 切换用 carry() / iris()（不硬切）
  ✔ b16) 交互后 2.5s 缓入常态轻微波动
  ✔ b17) 列与列之间异步波峰（相位差）
  ✔ b18) 减少动态效果（JS + CSS 双保险）
  ✔ b19) canvas 频谱（#spectrum）
  ✔ b20) 时间轴 scrub（#tlTrack）
  ✔ b21) 速率刻度（#rateWrap）
  ✔ b22) 「正在服务」端点信息（#npEndpoint）
  ✔ c1) 脚本引入顺序符合 _shared/README 契约  → 10405 < 10450 < 10495 < 10539 < 10546 < 10619
  ✔ c2) 无外链资源（无 CDN）
  ✔ c3) 无外链字体（MiSans 走系统回退）
  ✔ c4) 图标全部内联 SVG（无位图、无 emoji）
  ✔ c5) README.md 已写  → …字节
  ✔ d1) 375 / 768 / 1024 / 1440 四档媒体查询齐备  → @480px @768px @1023px @1440px
  ✔ d2) 容器内横向滚动 + 文档级 overflow-x 防线

冒烟测试（真跑 _shared/*.js + app.js，未开浏览器）：
  ✔ boot：app.js 与五个共享脚本执行完毕，MP 层齐备
  ✔ 切到 mock 并渲染 … ✔ 切到 vlp 并渲染（6 步）
  ✔ mock：注册端口 / 签发证书 / 挂载能力 / 启停服务
  ✔ flow：五类字段规则都能配，且规则引擎真的产生变化
  ✔ flow：字段增删 / 人机交互 / 触发 / 放行拒绝 / 过滤搜索
  ✔ ne：属性 / 版本 / 旧版本 / 成组 / 复制 / 步骤排序 / 参数校验
  ✔ omp：账号创建与启停 / 任务创建关联站点 / 推进到人工 / 共部署
  ✔ lcm：软件包增删校验 / 共部署
  ✔ vlp：CPU 越界 clamp / 主副站点 / 版本 / 校验 / 流程推进与重置
  ✔ 流量模拟器 tick（真的走规则、写日志）
  ✔ 主题切换 晨雾 → 月影 → 晨雾（含 localStorage）
  ✔ transport：主控 / 循环 / 重放 / 停止 / 速率键盘
  ✔ 抽屉：索引 / 设置 打开与关闭
  ✔ 键盘：数字键 1–6 / 方向键切列切卡 / T / L / 空格 / Esc
  ✔ 事件委托：列头 / 卡 / 刻度 / 步进按钮 / 日志展开重放放行
  ✔ 表单委托：字段路径 / 规则类型切换 / 条件 when 写回
  ✔ 渲染内容：mock/flow/ne/omp/lcm/vlp 有列 / 有卡 / 无 undefined-NaN 泄漏 / 计数正确（6 步）
  ✔ 功能落点：mock/flow/ne/omp/lcm/vlp §5 所需的控件与容器都在（6 步）
  ✔ transport 与平台数据的对应关系成立
  ✔ runtime 无未捕获异常

运行期错误 0 条：

控制台输出：
  · [log] %c[Mock 平台 V5 · 音乐调测台] 已就绪 · 6 个界面 · 数字键 1–6 · ← → 切列 · ↑ ↓ 切卡 · T 切主题 · 空格启停服务 color:#a67d48

文件行数：index.html 250 · app.css 1244 · app.js 2809

结果：全部通过（静态 31 项 + 冒烟 35 步，0 错误）
```

### 未被本代理验证的部分（如实标注）

- **真实浏览器渲染与像素**：布局尺寸、颜色观感、`scrollWidth <= clientWidth + 1` 的四档实测 —— 本任务明确要求不开浏览器，未验证。
- **动画的肉眼观感**（360ms 淡入、异步波峰、常态波动、频谱跳动）：只验证了代码路径与 `reduced-motion` 分支存在，未做视觉确认。
- **音效**：`MP.sfx` 默认关闭，仅接了 `#sfxBtn` 开关；未做听感验证。

---

## 九、文件

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `index.html` | 250 | 品牌行 + 索引/设置抽屉 + 刻度尺导航 + 六个 `<section class="mcs" data-screen>` + 底部 `#transport` + 页脚 + `#toasts`；末尾按序引五个 `_shared` 脚本再引 `./app.js` |
| `app.css` | 1244 | 双主题 token（`@property` 无需，变量 + 650ms 过渡）/ 细线排字 / 卡列与卡 / 详情面板与表单 / 表格与日志 / transport / `mx-*` 12 个原语样式 / 9 个 `@keyframes` / 四档响应式 |
| `app.js` | 2809 | 视图层：卡列模型 `COLS` → 渲染 → 事件委托 → `keepFocus` → 订阅局部重画；transport 会话时间轴与频谱；主题与抽屉 |
| `_check.mjs` | — | 一次性自检 + 无浏览器冒烟（不在页面引用链里，验收跑完可删） |
| `README.md` | 本文件 | 设计依据、四个 signature 与数据的对应、§5 逐条落点、微交互与动效清单、自检输出 |

共享层 `../_shared/{domain,motion,micro,button-fx,fx}.js` 与 `../_shared/README.md` **本版未改动一个字节**；
未触碰 `v1`/`v2`/`v3`/`v4`、`serve.mjs`、根 `index.html`。

---

## 附：原图补遗（Lead 追加，2026-10-16）

用户随后提供了原作主界面截图（3D 专辑卡墙 + 顶部工具簇 + 左下统计 + 右下运行时状态），据此补齐：

| 原图里的元素 | 本版落点 |
| --- | --- |
| 右上 `略缩图模式` | `#thumbBtn`：把 `.mcar__strip` 由横向条带切成 `auto-fill` 紧凑网格（`data-thumb="on"`），偏好存 `localStorage['mp-v5-thumb']`；实测切网格后仍无横向溢出 |
| 左下 `LOCAL COLLECTION 69 ALBUMS / 454 TRACKS` | 页脚 `#collStats`：「LOCAL COLLECTION 3 / 111」＝ 端点 / 已挂载能力覆盖的接口总数，随 `MP.subscribe` 更新 |
| 右下 `59 FPS / 晨雾 / V0.5.0` | 页脚 `#fpsBadge`：rAF 实测帧率（每 500ms 刷新）+ 当前主题 + 版本，低于 40 FPS 变暖杏金；实测 `124 FPS · 月影 · V0.5` |
| 专辑卡左侧的金色书脊 | `.mcard::before` 3px 暖杏金书脊：hover 0.55 不透明、选中 1.0 |
| 顶部 `音乐库` 入口 | 既有 `#libraryBtn`（调测台索引）已对应 |

实测（Lead，浏览器）：四档 × 六屏无横向滚动、`pageerror = 0`；略缩图模式切换、统计与 FPS 均按预期工作。

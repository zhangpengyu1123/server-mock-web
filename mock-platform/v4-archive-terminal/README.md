# V4 · 档案终端（Rhine Lab Archive Terminal）

Mock 平台的第四版设计稿。数据、动作、规则引擎、流量模拟器**全部来自 `_shared`**（`MP.*`），
本目录只负责「视觉语言 + 布局 + 本版签名动效」。零依赖、离线可跑、无构建、无 CDN、无外链字体。

```
v4-archive-terminal/
├── index.html       结构（左侧竖排刻度尺 + 六个界面 + 底部「当前分类 · 索引 / 总计」）
├── app.css          设计令牌 + 组件 + 四档响应式
├── app.js           渲染 / 接线 / 签名动效（视图层，唯一数据入口是 MP.*）
├── _selfcheck.mjs   一次性静态自检（不启动浏览器、不占端口）
└── README.md        本文件
```

引入顺序（`index.html` 末尾，与契约一致）：

```html
<script src="../_shared/domain.js"></script>
<script src="../_shared/motion.js"></script>
<script src="../_shared/micro.js"></script>
<script src="../_shared/button-fx.js"></script>
<script src="./app.js"></script>
```

> 未引 `../_shared/fx.js`：本版的程序化背景（点阵 + 细网格）用纯 CSS 实现，
> 不挂 canvas，避免与解密扫描线抢注意力。

---

## 一、设计语言：数值取自本地源码，不是估的

| 角色 | 值 | 来源 |
| --- | --- | --- |
| 画布 | `#e8e5e1` / `#eae5e1` | `06-RhineLab-Blog-Theme/src/style.css` `:root`、`08/src/style.css` |
| 纸面 / 浮层 | `#fffaf5`、`#fff7ed`、`#ece9e4` | 同上 |
| 主文字 | `#080a08`、`#171713`、`#24221f`、`#232722` | 同上 |
| 次要文字 | `#74786f`、`#77756d`、`#807866`、`#8e897b` | 同上 |
| **强调（选中信号）** | **`#a67d48`** | 博客主题 `button:focus-visible{outline:2px solid #a67d48}`、`.file-ticks button:hover:before{background:#a27849}` |
| 暖色系 | `#ffe3b2`、`#e4d5c1`、`#d8c9b9`、`#c1b8a7`、`#b4a18c`、`#938977`、`#d0c6b5` | 三个仓库频次统计（见 `_shared/RHINELAB-DESIGN-LANGUAGE.md`） |
| 橄榄（正常 / 在线） | `#565c46` | 同上 |
| 暗色「深夜」 | 石墨 `#171713` / `#24221f`，暖白 `#e9eef2`，muted `#9caabd`，细线 `rgba(208,226,243,.2)`，强调仍 `#a67d48` / `#ffe3b2` | `08/src/theme.css`、`DESIGN.md`「明暗配色」 |
| 字体 | `MiSans → "PingFang SC","Microsoft YaHei",system-ui`；数字 / 编号 / 代码 `"JetBrains Mono",Consolas,monospace` | `06/src/style.css`、`07/DESIGN.md`；**不引任何字体文件** |
| 排字层级 | 标题 22 / 分组 14 / 主要操作 13 / 说明 12 / 辅助 11 / 微字 10 | `07-Rhine-Music-Demo/DESIGN.md` |
| 形状 | 1px 细线、几乎无圆角、`:focus-visible` 1px 琥珀描边、disabled `.45` | `07/DESIGN.md` 第三节 |

**这套语言里不出现的东西**（照 `_shared/RHINELAB-DESIGN-LANGUAGE.md` 第五节执行）：
不出现蓝青 / 青色强调、45° 危险斜纹、彩色填充的圆角按钮、糖果色状态标签、
大面积装饰渐变、霓虹发光、Emoji 图标、圆角卡片 + 投影堆叠的通用 SaaS 风。

所有图标都是**内联 SVG**（描边 `currentColor`），没有 emoji、没有图标字体。

---

## 二、`_shared/README.md` §5 六屏验收清单（逐条勾选）

### S1 `mock` Mock 管理
- [x] **注册本机 IP + 端口**：`#pfIp` 下拉含两张本机网卡（`MP.state.host.ip` / `.alt`）、`127.0.0.1`、以及「手动输入…」（选中后就地展开 `#pfIpCustom`）；`#pfPort` 校验 1024–65535、IPv4 合法性、重复端点，**就近报错**（`#pfPortErr` + `.field.is-invalid`）。提交走 `MP.actions.registerPort`。
- [x] **生成证书文件**：未签发态给出 CN / 有效期（90/365/730/1095 天）/ 签发机构，`签发证书` 按钮走 `MP.btn.loading(btn,'签发中')`；已签发态展示 CN、有效期、签发时间、签发机构、**指纹**，并提供 **导出证书文件**（生成真实 PEM `.crt` Blob 下载）与 **重新签发**（`generateCert`）。
- [x] **挂载一种或多种平台能力**：6 项能力做成可选芯片（`aria-pressed`），点选 `attachCap`、再点 `detachCap`，行内实时显示 `code · 版本 · 接口数`。
- [x] **开启 mock 服务（按住确认）**：`MP.micro.holdConfirm`，1000ms 按住到满才启动；**可停止**（`fuseButton`，引信 4.2s）；**停止后可撤销**（toast 的 `撤销` + fuse 的 `onUndo` 双通道）。证书未签发或未挂能力时按钮禁用并就近说明原因。删除端点同样是 `fuseButton` + 可撤销。
- 密级映射：未签发 = `PUBLIC`，已签发未启动 = `RESTRICTED`，运行中 = `TOP SECRET`（显示在端点档案的密级标签与页脚）。
- 主行动：卡片头部 `ACCESS FILE`（`data-fx="magnetic"`，本屏唯一磁吸焦点），点击会调阅端点档案并放行最早的待人工请求，然后切到 Mock 流程。

### S2 `flow` Mock 流程
- [x] **审计日志（实时追加 / 过滤 / 搜索 / 展开看报文 / 重放）**：`MP.sim.start(2600)` 持续造流量，`log` 事件增量 `insertBefore` 到 `#logBody`；`segmented` 过滤 全部/成功/异常/待人工；`#logQuery` 搜索路径 / 网元 / 判定；点行展开 `RQ` / `RS` 两栏 JSON + **规则命中说明**；`重放` 按同路径重新 `triggerApi`。宽表在 `#logWrap`（`overflow-x:auto`）内滚动。
- [x] **定制延迟与 HTTP status**：`#apiStatus` 下拉 10 个状态码（200/201/202/400/403/404/409/429/500/503）；延迟用 `MP.micro.scrub`（0–3000ms、步长 10、方向键可调、超界橡皮筋）。
- [x] **面向对象地定制每个字段**：字段行可改路径 / 类型（`MP.state.fieldTypes` 9 种）/ 取值方式（下拉选择 ↔ 手工填写）/ 取值 / 规则种类，可增（`addField`）、可删（`removeField`）。
- [x] **字段级规则：自增 / 单次生效 / 条件（+ 固定 / 随机）**：五种 `rule.kind` 全部可配参数——
  自增 `start` `step` `pattern{n:04}`；单次生效 `times` `fallback`；条件 `when{key,op,value}` + `then` / `else`（操作符 等于/包含/非空/末尾为偶数）；随机用逗号分隔候选；固定直接取值。
  **命中说明可见**：卡片内每行 `fld__desc` 标注规则名 + 提示，调阅日志时逐字段列出 `字段 = 值（命中说明）`。
- [x] **插入人机交互并放行 / 拒绝**：`segmented` 插入 人工确认 / 验证码 / 人工闸门；命中该接口时日志 `202` 并标记「待人工」；日志行内 `放行`（→200）/ `拒绝`（→403）按钮。
- 手动触发走 `MP.btn.loading(btn,'触发中')`（>300ms 异步）。

### S3 `ne` 网元管理
- [x] **属性、架构、类型**：类型 7 项 / 架构 5 项 / 厂商 4 项下拉；另有可增删的键值对属性表（`心跳周期` / `最大承载用户` …），改动直接写回 `updateNE`。
- [x] **版本、使用软件名称、旧版本**：`当前版本` 输入（`neVerErr` 就近校验 `x.y[.z]`）、`使用软件名称`、只读型号，以及**旧版本标签组**（当前版本高亮为琥珀）。
- [x] **升级流程步骤（增删、排序、自动 / 人工 / 手动）**：步骤列表带 上移 / 下移 / 删除（`moveStep` / `removeStep`），新增步骤可选 **自动 / 手动 / 人工**（`segmented`），人工步骤自动带负责人与超时。
- [x] **升级流程中的人机交互**：流程执行到「人工」步骤时挂起，步骤标记变 `working`，并在就地位置出现 **按住放行人工步骤**（`holdConfirm`）；放行后流程继续。
- [x] **网元成组**：归组下拉（`assignGroup`）+ 组策略输入 + 新建组（`addGroup`）；`网元组` 面板列出每组成员与策略。
- [x] **复制网元**：`copyNE`，编号按同前缀自动递增（`GNB-HZ-000N`），副本状态「未注册」；按钮走 `MP.btn.loading`。
- [x] **参数校验（规则 + 执行结果）**：规则列表（字段 / 正则 / 级别 错误|警告 / 提示），可新增；`执行校验` → `runValidation`，结果逐条形变为 勾（通过）/ 叹号（不通过），执行期间按钮 `loading` + 结果区 `latticeLoader`。

### S4 `omp` 网元管理平台
- [x] **受管网元、网元组**：左栏列出全部网元及其归属，未纳入平台的标 `未纳入平台`；下方列出网元组并提供 **一键建任务**（预填任务表单并聚焦）。
- [x] **账号管理的网元范围**：创建表单含 **授权网元组**（勾选组会展开为成员）与 **授权网元** 两组复选框；账号行显示 `角色 · 授权 N 个网元 · 范围 …`。
- [x] **创建账号**：`账号名称`（就近报错：空 / 字符集 3–24 / 重复）、`角色` 3 选 1，提交走 `createAccount`；账号行右侧 `velocitySwitch` 启停（`toggleAccount`）。
- [x] **创建一体化升级任务并关联站点**：任务名（就近报错）+ **关联站点**下拉（3 个站点，显示区域与可分配 CPU）+ 目标网元组；`createTask` 按组成员串行生成步骤；任务卡片显示 `gauge` 进度、`statusMark` 状态、步骤标签串，`推进下一步` 走 `MP.btn.loading(btn,'推进中')`，遇人工步骤自动置「等待人工」并给「立即放行」。

### S5 `lcm` 生命周期平台
- [x] **受管网元**：受管网元清单（勾选态，带版本）。
- [x] **软件包（类型 / 所属网元 / 厂商 / 版本）**：类型 4 种（整包/补丁/热补丁/配置包）、所属网元（含「平台级」）、厂商 4 家、版本（就近校验）+ 包名 + 大小；`addPackage` 登记。列表显示 `类型 · 厂商 · V版本 · MB · MD5 · 所属`，可按 全部/已校验/待校验 过滤（`segmented`）。
- [x] **与网元管理平台共部署**：`velocitySwitch` 切换 `toggleCoDeploy('lcmp')`；就地说明**端口复用**——共部署时 LCMP 32 个接口与 NEMP 46 个接口挂同一端点（`10.18.32.104:8443`），端口只登记一次、证书只签发一次；关闭则 LCMP 改用独立端点 `:9443` 并需单独签发证书。
- 软件包校验：`走校验流程` → 状态宿主流转 `latticeLoader`（格点 + 实时计时），完成后 `statusMark` 变勾 + toast「MD5 / 厂商签名 / 依赖关系 三项一致」。删除软件包带可撤销 toast。

### S6 `vlp` 虚层管理平台
- [x] **CPU 数量**：`scrub` 拖拽 / 方向键改核数（4–64，步长 2，超界橡皮筋），另有 `−2` / `+2` 按钮；`gauge` 液面显示配额。
- [x] **主副站点**：3 个站点，各自「设为主站 / 设为副站」；互斥校验（主副不能同站）并就近 toast 报错；卡片显示主副站点余量与卷。
- [x] **升级流程详情**：4 步流程（自动 / 自动 / 手动 / 人工），节点三态着墨，`推进下一步` 与 `重置流程`；自动步骤会自行推进，人工步骤挂起并给 **按住放行**（`holdConfirm`）。
- [x] **平台版本**：`VLMP R3.1.0` / `R3.0.6` / `R3.2.0-rc1` 下拉（`setVlpVersion`）。
- [x] **软件包校验流程**：4 项校验（MD5 / 签名 / 依赖 / 回滚点），每项 `statusMark`（勾 / 叹号 / 空环）与详情文本，`执行校验` 走 `latticeLoader` 后刷新为通过；`X/Y 通过` 计数在卡片头。

### 全局
- [x] **6 个界面可切换且不硬切**：`iris()`（从被点的刻度圆心展开）叠加本版签名（刻度移动 + 解密扫描线 + 内容 `stagger`）。
- [x] **每次动作有反馈**：全部动作有 toast / 状态形变 / 计数滚动；音效可选（`MP.sfx.toggle()`，默认关闭）。
- [x] **键盘可达、focus 可见、`aria-label` 到位**：数字键 `1`–`6` 切界面、`[` `]` 前后翻、`T` 切主题；`aria-current` / `aria-pressed` / `aria-selected` / `role="slider"` / `role="switch"` / `aria-busy` 均设置；`:focus-visible` = 1px 琥珀描边；`.skip` 跳转链接。
- [x] **375 / 768 / 1024 / 1440 四档不横向滚动**：见 §五。
- [x] **`prefers-reduced-motion` 生效**：CSS 侧 `html.mp-reduced` 与 `@media (prefers-reduced-motion: reduce)` 双保险，JS 侧所有动效入口判 `MP.motion.reduced`（直接到位、不播放）。
- [x] **表单：可见 label、就近报错、不因重画丢焦点**：`keepFocus()` 在重画前后保存 `#id` / `[data-fkey]` / `[data-fid]+[data-prop]` / `[data-nf]` 四类焦点键与选区内偏移，并恢复所有 `.card__bd--roll` / `.card__in--scroll` 的滚动位置。

---

## 三、微交互原语（用了 10 个，要求 ≥ 8）

| # | 原语 | 用在哪里（语义） |
| --- | --- | --- |
| 1 | `holdConfirm` | **启动 mock 服务**（按住 1000ms）、**执行升级流程**（按住 1200ms）、**放行人工步骤**（按住 900ms）、**虚层人工放行**（按住 1000ms） |
| 2 | `fuseButton` | **停止服务**（引信 4.2s + 撤销）、**删除端点**（引信 3.2s + 撤销） |
| 3 | `velocitySwitch` | **账号启停**（每个账号行一个）、**与网元管理平台共部署** |
| 4 | `gauge` | **虚层升级进度**（任务卡 `taskGauge-*`）、**网元升级流程进度**（`#flowGauge`）、**虚层 CPU 配额**（`#cpuGauge`） |
| 5 | `statusMark` | **证书状态**（勾 / 叹号）、**服务状态**（环 / 勾）、**参数校验结果**、**任务状态**、**软件包校验状态**、**虚层校验项**、**人工步骤等待态**（working 弧） |
| 6 | `scrub` | **响应延迟 ms**（0–3000，步长 10）、**虚层 CPU 核数**（4–64，步长 2，超界橡皮筋） |
| 7 | `toast` | 全部动作反馈；**可撤销**：停止服务 / 删除端点 / 删除软件包 / 移除人机交互类操作；**可执行**：立即放行任务 |
| 8 | `latticeLoader` | **参数校验执行中**（`#validResult`）、**软件包校验中**（`pkgMark-*`）、**虚层校验项执行中**（`vcm-*` / `vcl-*`）—— 都是「校验 / 升级进行中」的长耗时区域 |
| 9 | `segmented` | **日志过滤**（全部/成功/异常/待人工）、**接口能力过滤**、**人机交互插入**（人工确认/验证码/人工闸门）、**升级步骤类型**（自动/手动/人工）、**软件包过滤** |
| 10 | `spotlight` | **端点登记簿**与列表行的光斑跟随（`--mx/--my`，纯 `radial-gradient`，不填底色） |

未用的两个：`rippleLoader`（提交类加载已被 `MP.btn.loading` 覆盖，避免同一动作出现两套加载语言）、
`magnetic`（`MP.micro.magnetic` 与 `MP.btn` 的 `data-fx="magnetic"` 会互相抢 `transform`；本版统一走 `MP.btn`，见 §四）。

---

## 四、按钮动效清单（`MP.btn` 技能落地层）

`boot()` 里 `MP.btn.install()` 一次 + `MP.btn.enhance(document)`；每次局部重画后对本屏根节点再 `enhance`（`enhance` 内部用 `WeakSet` 去重，不会重复接线）。

### 分级与落点

| 级别 | 元素 | 数量 |
| --- | --- | --- |
| **`data-fx="magnetic"`**（磁吸，一屏 ≤2；本版 **1 个**） | `#accessFile`「ACCESS FILE」—— Mock 管理屏的主行动 | 1 |
| **`data-fx="standard"`**（y:-4 / scale:1.02 / 250ms + `.is-lifted` 阴影抬升） | `登记端点`、`签发证书`、`保存属性`、`复制当前网元`、`新增字段`、`手动触发一次请求`、`执行校验`（网元）、`执行校验`（虚层校验项）、`推进下一步`（虚层）、`推进下一步`（任务卡）、`走校验流程`、`创建账号`、`创建任务`、`新建网元` | 14 |
| **`data-fx="subtle"`**（y:-1 / opacity:.9 / 150ms） | `#themeBtn` 主题切换、`#sfxBtn` 音效开关；其余按钮走默认 `subtle`（`MP.btn` 的 `tier()` 兜底），包括 6 个刻度导航（`.tick`）、全部 `.abtn--sm` 行内小按钮（放行/拒绝/重放/设为主站/一键建任务/置顶下移删除）、能力芯片、行选择、分页签 | 全部其余按钮 |

**`magnetic` 计数 = 1**（技能约束「一屏最多 1–2 个焦点」；`button-fx.js` 在 >2 时 `console.warn`）。
分屏后每个界面都只有 0–1 个 `standard` 级别的主行动被 `stagger` 高亮，磁吸只有 Mock 屏 1 个。

### 异步操作 → loading（技能：>300ms 必须给反馈）

| 异步动作 | 反馈方式 |
| --- | --- |
| 签发证书 | `MP.btn.loading(btn,'签发中')`（700ms，最短展示 300ms，带 `aria-busy`） |
| 重新签发证书 | `MP.btn.loading(btn,'重签中')`（600ms） |
| 手动触发一次请求 | `MP.btn.loading(btn,'触发中')`（420ms） |
| ACCESS FILE 调阅 | `MP.btn.loading(btn,'调阅中')`（420ms） |
| 保存网元属性 | `MP.btn.loading(btn,'写入中')`（420ms） |
| 复制网元 | `MP.btn.loading(btn,'复制中')`（380ms） |
| 参数校验执行 | `MP.btn.loading(btn,'校验中')` **+** `latticeLoader('正在执行参数校验')` |
| 一体化任务推进 | `MP.btn.loading(btn,'推进中')`（460ms） |
| 虚层流程推进 | `MP.btn.loading(btn,'推进中')`（420ms） |
| 软件包校验 | `latticeLoader('校验中')`（1500ms，长耗时区域） |
| 虚层校验项执行 | `latticeLoader('校验中')`（950ms） |
| 启动服务 / 执行升级 / 人工放行 | `holdConfirm` 的按住进度条本身就是进行中反馈 + `is-done` 落定 |

按下反馈：`button-fx.js` 的 `pointerdown → scale(.97)` + 涟漪（`ACCESS FILE` 用 `data-ripple="never"` 关掉涟漪）+ 抬起弹簧归位；
键盘空格 / 回车也走同一套按压反馈。禁用态自动 `.is-disabled`（`.45` 透明 + `not-allowed`）。

**只加动、不加装饰**：本版没有因为加动效而把任何按钮改成彩色填充；所有按钮仍是
「1px 细线 + 下划线」的克制样式（下划线 180ms `scaleX(0→1)`，颜色只在 hover 时转暖杏金）。

---

## 五、动效清单（对照原作数值家族）

| 场景 | 本版实现 | 数值 |
| --- | --- | --- |
| 编号 / 标题滚动 | `.tick__no` 的 `.rn__out` / `.rn__in`（上翻出 / 上翻入 + 模糊） | **460ms** `cubic-bezier(.2,.8,.2,1)`，direct 模式，content 相同不重播 |
| 界面内容切换 | 共享层 `M.develop()` + `M.stagger(cards,{each:26,y:10})` | 380ms / 300ms |
| 解密揭示（本版签名） | `--dcy` 驱动的 CSS mask 前沿 + 2px 扫描亮线 + 内容 `dcyDev` | **460ms**，逐卡错峰 70ms |
| 详情进出 | `.card__bd--roll` 滚动区内容替换 | 令牌 `--d-detail: 180ms` |
| 弹窗进 / 出 | `mx-toast` 进 `translateY(-14px)→0` / 出 `translateY(-10px) scale(.97)` | 进 **300ms** / 出 **200ms**（位移 12px 进 / 8px 出同族） |
| 页签内容 / 下划线 | 页签内容 `tabIn` 淡入；`#neTabInk` 连续移动（不断跳） | **150ms** / **180ms** |
| 状态反馈 | `.tag` / `.dot` / `.tick__badge` 颜色过渡 | **220ms** |
| 主题切换 | `html,body,.hd,.rail,.ft,.card,.input,.tbl…` 同步 `background-color/color/border-color` | **650ms** linear（连续，不硬切），`localStorage` 持久化 |
| hover 微交互 | `MP.btn` subtle 150ms / standard 250ms | 150 / 250ms |
| 刻度琥珀条移动 | `MP.motion.spring({from,to,stiffness:190,damping:22})` 写 `--ruler-y` | **临界阻尼、改目标保留速度** |
| 按下归位 | `MP.btn` 的 `pressUp` → `MP.motion.spring({stiffness:320,damping:20})` | 380ms 内落定 |
| `prefers-reduced-motion` | CSS `html.mp-reduced *{transition-duration:1ms}` + `@media` 关掉扫描线 / 蒙版 / 旋转 / 涟漪；JS 全部 `MP.reduced` 分支 | **直接到位，不播放** |

### 解密扫描线怎么实现的（不用三维）

```
.card.is-frosted .card__bd      → backdrop-filter: blur(9px) saturate(.88) contrast(1.04)   ← 磨砂盖板
.card.is-frosted .card__bd::before → 实心 --frost 罩层（z-index:2，仍在内容之上）             ← 盖板的不透明部分
.card.is-frosted .card__in      → 清晰内容层
```

三层共用**同一条 mask 前沿**：

```css
mask-image: linear-gradient(180deg,
  transparent 0%, transparent calc(var(--dcy) * 100%),
  #000 calc(var(--dcy) * 100% + 16px), #000 100%);
```

- `--dcy` 由 **`@property` 注册为 `<number>`**，因此可以在 `@keyframes dcyProp` 里从 0 补间到 1
  （未注册的自定义属性不能插值）。`is-decrypted` 加上时启动 `dcyProp 460ms cubic-bezier(.22,1,.36,1) both`，
  前沿从顶部连续走到 `100%`，同时 16px 羽化宽度就是原作的「羽化清除前沿」。
- `.card::after` 是一条 **2px 暖杏金亮线**（`linear-gradient(90deg, transparent, #ffe3b2, #a67d48, #ffe3b2, transparent)` +
  `box-shadow: 0 0 10px 1px var(--accent-soft)`），`@keyframes dcyScan` 用 `--dcy-end`（JS 按 `offsetHeight` 逐卡量出）
  从 10% 位移扫到 `--dcy-end`，与 mask 前沿同长同节奏。
- 不支持的 `mask-image` 的浏览器：`@supports not (mask-image: …)` 退化为**整体淡入 460ms**（仍不硬切）。
- 卡片 `overflow: hidden` 保证亮线扫到底部时被裁掉，不会溢出到屏外。
- 全程只用 `mask / transform / opacity / filter / backdrop-filter`，**零三维、零 canvas、零位图**。

---

## 六、响应式：375 / 768 / 1024 / 1440 四档

### 断点策略

| 档位 | 关键变化 |
| --- | --- |
| **≥1440** | `--p1:30px`、`--rail-w:224px`、`--gap:22px`，KPI 间距 26px，滚动区 `max-height:66vh` |
| 1281–1440 | 默认档：`--rail-w:208px`、`--p1:24px`、两列 → `grid--1-2` / `grid--240` / `grid--2-1` / `grid--3` |
| **≤1280** | 隐藏宽网卡信息；滚动区 `58vh` |
| **≤1024** | `--rail-w:178px`；`.grid--3 → 2 列`，`.grid--1-2 / --240 / --2-1 → 单列`；隐藏页眉遥测；隐藏刻度英文副题；`.cols2 → 单列`；`.frow--4 → 2 列`；滚动区 `52vh` |
| **≤768** | **左侧竖排刻度尺 → 顶部横向刻度尺**（`.rail` 转 `sticky` + `flex-direction:row` + `overflow-x:auto`，琥珀条改为横向 `width/left`）；页脚隐藏两格；`.frow--2/3/4 → 单列`；`.card__bd--roll` 取消高度限制（改由页面纵向滚动）；表格 `min-width:640px` 在 `#logWrap` 内滚动 |
| **≤400（覆盖 375）** | `--p1:11px`；隐藏拉丁副题与时钟；页脚再隐藏两格；字号收一档 |

### 为什么不会横向滚动（结构约束）

1. `body { overflow-x: hidden }`，并且**没有任何元素用视口单位宽度 + 负外边距 / 绝对定位突出视口**之外。
2. `.rail` 与 `.ft` 分别 `position: fixed` 到视口左 / 下边缘；`.stage` 用 `margin: 64px 0 40px 208px` 让开，
   `.stage` 自身 `min-width: 0; overflow-x: hidden`。
3. 所有 flex / grid 子项都设 `min-width: 0`，`grid-template-columns` 一律用 `minmax(0, 1fr)`——
   杜绝「内容把栅格顶宽」。
4. **宽表与刻度尺一律在容器内滚动**：
   - 审计表 `min-width: 720px`（≤768 时 640px），宿主 `#logWrap` 是 `.card__in--scroll { overflow-x: auto }`；
   - 报文 `pre` 是 `overflow: auto`；
   - `#respStudio` 的字段行用 `flex-wrap` + 固定 `flex-basis`，超宽时换行而不是溢出；
   - 顶部横向刻度尺自身 `overflow-x: auto`；
   - `.mx-seg`（分段控件）`overflow-x: auto; max-width: 100%`；
   - 所有滚动宿主加 `overscroll-behavior-x: contain`，不会把滚动传给页面。
5. 文本溢出统一用 `overflow-wrap: anywhere` / `text-overflow: ellipsis`，不做最小宽假设。

### 结论与限制（重要）

- **静态结论**：上述五项约束在四档断点下成立；`.stage` 宽度 = `100vw − rail`，栅格全部 `minmax(0,·)`，
  宽内容（表格 / 报文 / 分段控件 / 横向刻度尺）都有 `overflow-x:auto` 的容器兜住。
  容器内的 `scrollWidth > clientWidth` 属于**容器内滚动**，不参与 `documentElement.scrollWidth`。
- **限制**：本轮**没有在浏览器里实测** `document.documentElement.scrollWidth <= clientWidth + 1`。
  用户的约束明确要求「不要启动浏览器、不要用 Playwright，也不要用 4500 端口」，
  因此运行时四档测量留待用户在自己那个浏览器实例里复核。请以实际测量为准，
  本轮给出的自检输出全部是**静态文本分析**（见 §七），不含任何浏览器数据。

---

## 七、自检命令与真实输出

### 1) 语法检查

```
$ node --check v4-archive-terminal/app.js
node --check app.js: OK
```

### 2) 静态自检

```
$ node v4-archive-terminal/_selfcheck.mjs
[a] $('\#id') / getElementById('id') → index.html
  静态 id 共 117 个；index.html 内 98 个 id
  运行时生成的容器（已在 app.js 模板中逐条核对）:
    - accSw-  ← 账号行开关宿主（每账号一个）
    - certCn / certCnErr / certDays / certIssuer  ← 证书表单（仅未签发时存在）
    - certMark  ← 证书状态形变宿主（签发 / 未签发两态）
    - certGenHost / certGenBtn  ← 证书签发按钮宿主与按钮自身
    - coDeploySw  ← 共部署开关宿主
    - cpuGauge / cpuScrub  ← CPU 液面与拖拽控件宿主
    - delayScrub  ← 响应延迟拖拽控件宿主
    - flowGauge / stepStatus / upRun / stepList  ← 升级流程执行区
    - stepName / stepDur / stepKind  ← 新增步骤表单
    - ixAdd  ← 人机交互插入分段控件宿主
    - paramKey / paramVal  ← 网元属性新增输入
    - validResult / vField / vRule / vLevel / vMsg  ← 参数校验表单与结果区
    - groupSel / groupStrategy  ← 归组控件
    - neName / neVerErr / neSave  ← 网元属性表单
    - pkgMark- / taskGauge- / taskMark- / stepMark- / vrm- / vcm- / vcl-  ← 逐条状态宿主
  ✓ 所有静态 id 均能在 index.html 找到，或命中「运行时生成容器」白名单并经模板核对

[b] 六个 data-screen 与六个导航项
  ✓ data-screen="mock" / "flow" / "ne" / "omp" / "lcm" / "vlp" 存在
  ✓ 导航刻度 data-nav="mock" / "flow" / "ne" / "omp" / "lcm" / "vlp" 存在

[c] 脚本引入顺序（共享层 → 本变体）
  ✓ domain → motion → micro → button-fx → app.js 顺序正确

[c] MP.btn 按钮动效层（要求 ≥ 4 类用法）
  ✓ MP.btn.install()：注入纯「动」样式   ×1
  ✓ MP.btn.enhance()：自动增强按钮   ×1
  ✓ MP.btn.loading()：异步 >300ms 的 loading 态   ×2
  ✓ data-fx="standard"：主行动 y:-4 / scale:1.02 / 250ms   ×14
  ✓ data-fx="magnetic"：磁吸（一屏 ≤2）   ×1
  ✓ data-fx="subtle"：刻度与文字按钮 y:-1 / 150ms   ×2

[c] MP.micro 原语使用（要求 ≥ 8 个不同原语）
  ✓ holdConfirm  ✓ velocitySwitch  ✓ gauge  ✓ statusMark  ✓ scrub
  ✓ toast  ✓ latticeLoader  ✓ segmented  ✓ fuseButton  ✓ spotlight

[c] MP.motion 动效原语与音效
  ✓ iris  ✓ develop  ✓ stagger  ✓ countUp  ✓ reveal  ✓ spring
  ✓ MP.motion.reduced 已处理      ✓ 音效开关调用 MP.sfx.toggle()

[c] 规则引擎五类 + 人机交互三类
  ✓ fixed  ✓ increment  ✓ once  ✓ conditional  ✓ random
  ✓ human-confirm  ✓ captcha  ✓ manual-gate

[d] 本版签名：竖排刻度 / 解密扫描线 / 密级标签
  ✓ 刻度尺琥珀选中条（.rail__bar）        ✓ 解密前沿用 @property 注册后可连续补间
  ✓ 解密扫描亮线关键帧（2px 暖杏金）      ✓ CSS mask 解密前沿
  ✓ 权限 / 密级标签（PUBLIC / RESTRICTED / TOP SECRET）   ✓ TOP SECRET 密级实例
  ✓ 底部「当前分类 · 索引 / 总计」
  ✓ 编号滚动 460ms  ✓ 页签内容 150ms  ✓ 页签下划线 180ms
  ✓ 详情进出 180ms  ✓ 弹窗进入 300ms  ✓ 弹窗退出 200ms

[d] 响应式四档媒体查询
  ✓ 1440 档  ✓ 1280 档  ✓ 1024 档  ✓ 768 档  ✓ 375 档
  ✓ 页面 overflow-x hidden + 宽内容在容器内 auto 滚动
  ✓ prefers-reduced-motion 生效（CSS）

结果
  ✓ 全部自检通过（117 个静态 id / 6 个界面 / 6 个刻度导航项 / 10 个微交互原语 / 6 类 MP.btn 用法）
```

`_selfcheck.mjs` 只做静态文本分析：不启动浏览器、不监听 / 连接任何端口、不写任何文件。

### 3) 未做 / 待用户复核

- 浏览器内的**运行时**验证（真实渲染、四档 `scrollWidth` 实测、解密扫描线观感、磁吸手感）未执行——
  按要求未启动浏览器、未使用 Playwright、未触碰 4500 端口。
- 未改动 `_shared/**`（写入过程中发现 `_shared/button-fx.js` 被本仓库其他工作流改动过，
  为避免覆盖他人改动，本版**没有**修改共享层，只在 `app.css` 内以本版作用域收口
  `MP.btn.loading` 文案的换行行为），也未改动 `v1` / `v2` / `v3` / `serve.mjs` / 根 `index.html`。
- `_selfcheck.mjs` 是任务书允许的一次性自检脚本（`node -e` 或 `v4-archive-terminal/_selfcheck.mjs`），
  不属于三个交付文件，可随时删除。

---

## 附：原图补遗（Lead 追加，2026-10-16）

用户随后提供了原作截图（档案详情页 / 暗色解密态 / ARCHIVE INDEX 弹层），据此补齐了这些 signature：

| 原图里的元素 | 本版落点 |
| --- | --- |
| 左上 `RHINE LAB / SYNTHESIZE INFORMATION / ANALYSIS OS` 三行拉丁字 | 页眉品牌第三行 `.hd__en--sub` |
| 右上 `🔍 ARCHIVE INDEX [/]` `+ SAVED 00` `🕐` | 页眉 `.hd__idx`：索引按钮（`/` 快捷键）+ `+ N SAVED`（已签发证书的端点数） |
| 左上 `← ARCHIVE OVERVIEW [ESC]` | 内容区顶部 `.ovw__back`（打开档案索引；`ESC` 也可回总览） |
| 全宽黑底反白主行动 `+ SAVE ARTICLE / 收藏文章` | `.barbtn`：「＋ 登记端点 / REGISTER PORT」，hover 变暖杏金 |
| 两列键值表（DEPARTMENT/科室 · COLLECTION/编目范围 · RELATED/相关人物 · STATUS/状态） | 端点档案卡底部 `#pdKv`，随选中端点实时更新（手术：平台能力 / 端口范围 / 访问者+检定代理 / 服务状态） |
| 玻璃卡上的同心圆环 | `.rings`（三环 + 一段暖杏金弧），置于卡片标题区 |
| 左下 `NO.034 / INTERNAL DATABASE` | 刻度尺底部 `#railNo`（`NO.001`–`NO.006`）+ `INTERNAL DATABASE` |
| 底部 `▪ SESSION AUTHORIZED … JOYCE / 00:46:14 REINITIALIZE ↗` | 页脚 `.ft__cell--auth` + 访问者 `JOYCE` + `REINITIALIZE ↗`（重新载入） |
| 右下 `POWERED BY RHINE LAB` · `034 / 040` | 页脚 `POWERED BY RHINE LAB`（既有 `01 / 06` 已在） |
| **ARCHIVE INDEX 弹层**（检索框 + 分类芯片 + FILE/科室/ACCESS 表格 + `08 RECORDS FOUND` + `INTERNAL DATABASE • CONNECTED`） | `#idxModal`：**24 条记录**（6 界面 + 3 端点 + 6 能力 + 5 网元 + 4 软件包），可检索（测：`GNB` → 3 条）、分类筛选（软件包 → 4 条）、点击跳转到对应界面并选中对象，`ESC` 关闭 |
| 暗色下的「解密中」占位块 | `.sk` 骨架块：弹层打开时先占位 320ms 再揭示 |

实测（Lead，浏览器）：四档 × 六屏无横向滚动、`pageerror = 0`；弹层 24 条记录、检索/筛选/跳转/ESC 全部通过。

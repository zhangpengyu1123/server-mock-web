# V2 · 瑞士网格 · 编辑风（Swiss Modernism 2.0）

> 浅色、留白充足、靠 12 栏网格与字号建立层级：把 mock 平台当成一份**可评审的规格文档**来做。
> 同一个平台的同一批数据（`_shared/domain.js`），只换视觉语言与布局。

导航：顶部横向编号导航（01–06）+ 单栏编辑式版面（巨号衬线标题 / 编号章节 / 细规则线 / 大量留白），
**不复用 V1 的左侧图标导轨 + 深色面板结构**。

---

## 设计依据（`ui-ux-pro-max` 的 `--design-system` 推荐）

dials：**variance 5 / motion 6 / density 4**。返回结果与采用情况：

| 项 | 库推荐 | 本版采用 |
| --- | --- | --- |
| Style | **Swiss Modernism 2.0**（网格系统、模块化、非对称、国际主义、理性、数学化间距） | 原样采用 |
| Primary / On-primary | `#18181B` / `#FFFFFF` | 原样采用 |
| Secondary | `#3F3F46` | 采用（`--ink-2` 文字层级） |
| Background / Foreground | `#FAFAFA` / `#09090B` | 原样采用 |
| Muted / Border | `#E8ECF0` / `#E4E4E7` | 采用 |
| Destructive | `#DC2626` | 原样采用 |
| Typography | Inter（标题/正文）+ 等宽（数据） | 采用；另加衬线（`Songti SC` / `Source Han Serif SC` / `Noto Serif SC`）做中文大标题，强化编辑感 |
| Key effects | 12 栏网格、数学化间距、清晰层级、编号化章节 | 采用（`--s1…--s11` = 4→96px 阶梯；`grid-template-columns: repeat(12, 1fr)`；`.hero__idx` 01–06） |
| Density | 4/10（留白充足） | 采用：区块间距 48–96px，面板内边距 24–32px |
| Motion | 标准编排 300–450ms | 采用：`iris` 界面切换 + `stagger` 入场 + `countUp` 数字滚动，退出比进入快 |

字体全部走系统字体栈，**不引外链字体**；正文 `16px` 起、行高 `1.65`。

### 唯一一处对库的**有意偏离**：accent / CTA 色

库给这套风格配的是 `#EC4899`（编辑粉）。**本版改用 `#0B63F6`（信号蓝）**，理由：

1. 这是**电信运维**平台，颜色要承担状态语义（成功 `#047857` / 告警 `#B45309` / 异常 `#DC2626`）。
   粉红与 destructive 红在浅底上近距离难以区分，会让「主行动色」和「危险色」互相污染。
2. 瑞士风的信条是「色彩是信息，不是装饰」——强调色只用来标**当前位置与主行动**，
   其余层级交给字重、字号与网格线；一个中性冷色比一个高饱和暖色更服从这条纪律。
3. 信号蓝在 `#FAFAFA` 浅底上与 `#18181B` 主色并列时对比度足够，且与三个语义色互不干扰。

库明确要求的「反模式」也已规避：不做作品集式空壳、不留没有信息的占位——
每个 KPI 都带单位与一句口径说明（如「异常 3 / HTTP ≥ 400 与兜底分支」），
列表项一律带真实数值与单位（ms / 核 / MB / rps / 成员数）。

---

## 与 V1 的差异（布局 / 字体 / 颜色 三项全不同）

| | V1 暗场运维控制台 | **V2 瑞士网格 · 编辑风** |
| --- | --- | --- |
| 布局 | 左侧图标导轨 + 深色面板 + 底部状态条 | **顶部横向编号导航 + 单栏编辑版面 + 12 栏网格 + 页脚元信息条** |
| 字体 | Inter + 等宽（无衬线层级） | **衬线巨号中文标题（clamp 40→80px）+ Inter 正文 + 等宽数据** |
| 颜色 | 深靛 `#1E1B4B` 底 + 琥珀 `#F97316` | **浅底 `#FAFAFA` + 近黑 `#18181B` + 信号蓝 `#0B63F6`** |
| 关键意象 | 扫描线、发光、刻度、HUD 密度 9 | **2px 黑顶线、1px 细规则线、编号章节、大留白、几乎无圆角与阴影** |
| 导航选中态 | 琥珀高亮 | 黑底白字反差块（Swiss 经典手法） |

---

## 六个界面与 §5 验收清单逐条落点

> 逐条对照 `_shared/README.md` §5；每条后面是**实现落点**。

### S1 `mock` Mock 管理

| §5 条目 | 落点 |
| --- | --- |
| 注册本机 IP + 端口（IP 可选网卡或手填，端口范围校验） | `#pfIp` 下拉（`S.host.ip` / `S.host.alt` / 手动输入→`#pfIpCustom`）+ `#pfPort`；提交时校验 IPv4、`1024–65535`、重复端点，错误写到 `#pfPortErr` 并给 `.field.is-invalid`，就近报错 |
| 生成证书文件（CN、有效期、指纹；未签发要能签发） | 未签发时渲染 `#certCn` / `#certDays` + `#certGenBtn` → `rippleLoader`「签发中…」→ `A.generateCert`；已签发时显示 CN / 有效期 / 签发时间 / 签发机构 / **指纹**，可 `导出证书文件（PEM）`（Blob + `a.download`）与 `重新签发` |
| 挂载一种或多种平台能力（6 选 N，可卸载） | `.checks` 内 6 个 `[data-cap]` chip（`aria-pressed`），显示能力名 + 代号 + 版本 + 端点数；点击 `attachCap` / `detachCap` |
| 开启 mock 服务（按住确认；可停止；停止后可撤销） | 未运行：`#startSvcBtn` + `holdConfirm`（1.0s，禁用条件=证书未签发或未挂能力，并给出原因）；运行中：`fuseButton`「停止服务」4.2s 引信窗口，`onCommit` 停止 + toast 可撤销，`onUndo` 恢复；删除端点同样用 `fuseButton` + 撤销 |

### S2 `flow` Mock 流程

| §5 条目 | 落点 |
| --- | --- |
| 请求与响应审计日志（实时追加、过滤、搜索、展开看报文、重放） | `#logBody` 表格；`log` 事件**前插新行**并加 `.is-new` 闪动（不全量重画）；`segmented` 过滤 全部/成功/异常/待人工；`#logQuery` 搜索；点击行展开 `REQUEST` / `RESPONSE` 报文 + **规则命中说明**；`重放` 按钮按 path 找回接口并 `triggerApi` |
| 定制延迟与 HTTP status code | `#apiStatus` 下拉（200/201/202/400/403/404/409/500/503，带英文短语）→ `updateApi({status})`；`#delayScrub` 拖拽控件（0–3000ms，步长 10，方向键可调）→ `updateApi({delayMs})` |
| 面向对象定制响应每个字段（部分下拉选、部分手填，可增删字段） | 每个字段一张 `.fcard`：字段路径、类型（`fieldTypes`）、**取值方式（手工填写 / 下拉选择）**、字段值（下拉 or 输入框）、必填开关、说明；`+ 新增字段` / 删除（带撤销） |
| 字段级规则：自增 / 单次生效 / 条件（+ 固定 / 随机），命中说明可见 | `生效规则` 下拉覆盖 `RULE_META` 全五类，参数**内联展开**：自增（起始/步长/`{n:04}` 格式）、单次生效（次数/兜底值）、条件（条件字段下拉/操作符/命中时/否则）、随机（候选值）。命中说明在日志展开区以 `.rule-note` 逐条展示 `key = value · 规则 · note`，另在触发 toast 里摘要前 3 条 |
| 插入人机交互（人工确认 / 验证码 / 人工闸门），并在日志里放行或拒绝 | `#ixAdd` `segmented` 三选（`human-confirm` / `captcha` / `manual-gate`）+ `A.addInteraction`；命中后日志行显示「待人工 · 标签」并给出 `放行` / `拒绝` 按钮 → `A.resolveInteraction` |

### S3 `ne` 网元管理

| §5 条目 | 落点 |
| --- | --- |
| 定制属性、架构、类型 | `属性 / 版本` 分页：网元名称、网元编号（带格式提示）、类型（`neTypes`）、架构（`arches`）、厂商（`vendors`）、型号（只读）；属性键值以 chip 展示 |
| 定制版本、使用软件名称、旧版本 | 当前版本、使用软件名称（可编辑），`旧版本（可回滚）` 列出 `oldVersions` 全部版本标签 |
| 定制升级流程步骤（增删、排序、自动/人工/手动） | `升级流程` 分页：步骤列表带序号、类型标签、时长、人工步骤的负责人/超时；`↑` / `↓` / `×` 操作；新增步骤用 `segmented` 选 自动/手动/人工 + 名称 + 时长，新增后自动排到人工步骤区段之前 |
| 定制升级流程中可能的人机交互 | 步骤类型选「人工」时 `A.addUpgradeStep` 自动挂 `interaction {owner, timeoutS}`，行内展示「人机交互：值班工程师 · 超时 600s」 |
| 网元成组 | `成组 / 复制` 分页：选择已有组归入，或填组名/策略 `新建网元组并归入`；`网元组` 面板展示策略与成员数 |
| 复制网元 | `复制网元` 按钮（`magnetic`）→ `copyNE`，toast 带撤销（回滚 `S.nes`）；复制体继承属性 / 校验规则 / 升级流程 |
| 定制参数校验（规则 + 执行结果） | `参数校验` 分页：规则列表（字段 / 正则 / 级别 / 提示）；新增规则表单；`执行校验` → `latticeLoader`「参数校验执行中」 → `A.runValidation` 逐条 `statusMark`（通过 / 不通过）+ toast 汇总 `n/m 条规则通过` |

### S4 `omp` 网元管理平台

| §5 条目 | 落点 |
| --- | --- |
| 定制平台所管理的网元、网元组 | `受管网元与组` 面板：每个网元显示架构/版本/厂商与所属组标签（无组显示「未纳入平台」），组单独列出策略与成员数 |
| 账号管理的网元范围 | 账号行显示「授权 N 个网元」并列出名称；创建账号时 `#acNes` 复选框逐网元勾选范围 |
| 创建账号 | `#accForm`：账号名（非空 + 重复名校验，就近报错）+ 角色（升级操作员 / 只读审计 / 平台管理员）+ 授权网元 → `A.createAccount` |
| 创建一体化升级任务并关联站点 | `#taskForm`：任务名 + `#tkSite` 关联站点（显示区域与可分配核数）+ `#tkGroup` 目标组（自动勾选该组成员）+ `#tkNes` 关联网元多选 → `A.createTask`；任务卡展示站点、负责人、步骤链，`推进下一步` 在人工步骤处转为「等待人工放行」并给 `立即放行` 动作 |

### S5 `lcm` 生命周期平台

| §5 条目 | 落点 |
| --- | --- |
| 定制平台管理的网元 | `受管网元` 面板列出全部网元（版本 / 厂商 / 该网元的包数量）+ 状态点 |
| 定制软件包（类型 / 所属网元 / 厂商 / 版本） | `#pkgForm`：名称、类型（`softTypes`）、所属网元（含「平台级」）、厂商、版本、大小 MB；列表展示类型 / 所属 / 厂商 / 版本 / MB / MD5 / 上传时间；`segmented` 过滤 全部/已校验/待校验；`走校验` → `latticeLoader` → `validatePackage`；`移除` 用 `fuseButton` 带引信撤销 |
| 可以和网元管理平台共部署（开关 + 端口复用说明） | `部署形态` 面板：`velocitySwitch` 切换 `coDeploy`，说明文案随状态变化（复用 `10.18.32.104:8443` 端点与证书 / 改用独立端点 `:9443`），并列出 LCMP 端点、NEMP 端点、包数量/已校验数 |

### S6 `vlp` 虚层管理平台

| §5 条目 | 落点 |
| --- | --- |
| 定制平台 CPU 数量 | `#cpuScrub`（拖拽 + ←→ 键，范围来自 `cpuRange` 4–64，步长 2，超界橡皮筋）+ `−2 核` / `+2 核` 按钮 → `A.setCPU`；`gauge` 展示配额占用 |
| 定制主副站点 | 站点列表逐行 `设为主站` / `设为副站`，当前角色用标签标出；把主站设为副站会被拦截并提示；面板同时显示主/副站可分配余量 |
| 定制升级流程详情 | 步骤列表（自动/手动/人工 + 完成/进行中/待执行）+ 每步 `statusMark`；`按住推进`（`holdConfirm`）→ `advanceVlpFlow`；`重置` → `resetVlpFlow`；进度 `n / m 步` |
| 定制平台版本 | `#vlpVer` 下拉（`VLMP R3.1.0` / `VLMP R3.0.6（回滚点）`）→ `setVlpVersion`；KPI 同步 |
| 定制软件包校验流程 | `软件包校验流程` 面板：MD5 / 签名 / 依赖 / 回滚点四项，状态用 `statusMark`（通过 / 警告 / 未执行），`执行校验` → `latticeLoader`「校验」→ `runVlpCheck` 并刷新明细（含 `刚刚校验通过 · 时刻`） |

### 全局

| §5 条目 | 落点 |
| --- | --- |
| 6 个界面可切换，切换动效连续（不硬切） | 导航点击 → 记录按钮中心相对 `#stage` 的坐标 → `MP.motion.iris(sc, { origin, duration: 420 })` 光圈展开；键盘/程序切换走 `develop()` 显影；面板再 `stagger({ each: 22, y: 10 })` |
| 每次动作有反馈（toast / 状态形变 / 音效可选） | 全部动作走 `X.toast`（含 tone / 撤销动作）；状态变化走 `statusMark` / `gauge` / `fuseButton`；音效开关默认关闭 |
| 键盘可达、focus 可见、`aria-label` 到位 | 全部交互元素为原生 `button` / `input` / `select` / `label`；`:focus-visible` 有 2px 蓝色外框；导航 `aria-current`、开关 `role="switch"` + `aria-checked`、分段按钮 `aria-pressed`、tab `aria-selected`、图标按钮 `aria-label`、跳转链接 `.skiplink`；键 `1–6` 切界面 |
| 375 / 768 / 1024 / 1440 四档不横向滚动 | 5 档媒体查询（<768 / ≥768 / ≥1024 / ≥1440 + reduced-motion）；表格容器 `.panel__b--scroll` 溢出时**容器内滚动**；顶栏在窄屏换行且导航容器内横向滚动 |
| `prefers-reduced-motion` 生效 | CSS 全局把 `animation/transition` 压到 `0.01ms`；JS 侧 `MP.motion.reduced` 让 `countUp` 直出终值、`iris`/`stagger` 归零 |
| 表单：可见 label、就近报错、不因重画丢焦点 | 每个控件都有 `.flabel`；错误写在同一 `.field` 内的 `.ferr`；`keepFocus()` 在重画前记录 `id` / `data-fkey` / `data-fid+data-prop` 与选区，重画后还原并回滚滚动位置 |

---

## 微交互原语：12 个（样式全部自写，类名前缀 `mx-`）

| 原语 | 本版落点（语义位置） |
| --- | --- |
| `holdConfirm` | **启动 mock 服务**（1.0s）、**执行升级**（1.2s）、虚层升级流程「按住推进」（0.9s） |
| `fuseButton` | **停止 mock 服务**（4.2s 引信可撤销）、**删除端点**、**移除软件包** |
| `velocitySwitch` | **账号启停**、**与网元管理平台共部署**开关 |
| `gauge` | 任务升级进度、网元升级流程就绪度、虚层 CPU 配额占用 |
| `statusMark` | 网元参数校验逐条结果、任务状态（执行中/等待人工/已完成）、虚层校验项与流程步骤 |
| `scrub` | **响应延迟 ms**、**CPU 核数** |
| `toast` | 全局动作反馈（含撤销入口、引信倒计时条） |
| `rippleLoader` | 证书签发中（提交类操作） |
| `latticeLoader` | 参数校验执行中、软件包校验中、虚层校验项执行中（格点波动 + 实时计时） |
| `segmented` | **日志过滤**、人机交互类型选择、软件包过滤、升级步骤类型 |
| `magnetic` | 主行动按钮：注册 MOCK 端口、生成证书、复制网元 |
| `spotlight` | 所有 `.panel` 卡片的鼠标光斑跟随 |

---

## 动效清单（150–450ms，退出比进入快，全部受 `MP.motion.reduced` 约束）

| 场景 | 动效 | 时长 |
| --- | --- | --- |
| 界面切换（点击导航） | `MP.motion.iris()` 从被点导航项位置光圈展开 | 420ms（退出 ×0.6） |
| 界面切换（键盘 / 程序触发） | `MP.motion.develop()` 显影（模糊+低对比 → 清晰） | 340ms |
| 面板 / KPI 入场 | `MP.motion.stagger()` 交错上移 | each 22ms / 320ms |
| KPI 与遥测数字 | `MP.motion.countUp()` 滚动 | 420ms |
| 网元切换 / 分页切换 | `MP.motion.develop()` 局部显影 | 300–320ms |
| 长页面区块 | `MP.motion.reveal()`（`[data-reveal]` + IntersectionObserver） | 420ms |
| 新日志行 | CSS `@keyframes rowin` 底色闪动 | 380ms |
| 状态变化 | `statusMark` 三段形变 / `gauge` 惯性液面 / `fuseButton` 引信 | 300–450ms |
| 音效 | `MP.sfx`（默认关闭，右上 SFX 开关，`aria-pressed` 同步） | — |

---

## 响应式（375 / 768 / 1024 / 1440 四档）

- `< 768`：单栏、`--gutter: 16px`、顶栏换行、导航容器内横向滚动；
- `768–1023`：12 栏降为 2 栏，英雄区改双列（编号 + 标题 + 拉丁副题）；
- `≥ 1024`：完整 `repeat(12, 1fr)`，`.cell--4 / --6 / --8` 跨列，英雄区三区非对称；
- `≥ 1440`：`--gutter: 48px`、`--maxw: 1560px`、标题 80px、面板内边距 32px；
- 表格 / 日志始终在容器内滚动，页面本身不产生横向滚动条。

**验收补充（Lead，2026-10-16）**：原实现只把顶栏换行放在 ≤767，
而单行顶栏的内容固有宽度约 1345px，导致 768–1365 区间整页横向溢出（实测 1345px）。
已把顶栏换行 + 导航容器内横向滚动的处理扩到 `≤1365`，并让 KPI 长值（`ON · 10.18.32.104:8443`）
可换行、窄屏降字号。修补只动布局与字号，不动颜色/字体/装饰/动效；
`≥1366` 时第一行本来就放得下，观感与原来一致。

> 归属说明：这一段修补由 Lead 在本次浏览器验收中直接追加到 `app.css` 末尾
> （`@media (max-width: 1365px)` 与 `.kpi__v { overflow-wrap: anywhere; }`），
> 我这次只读未改，也未再叠加第二条同类媒体查询。我的静态自检覆盖不到真实排版，
> 横向滚动的结论以 Lead 的 30 次浏览器实测为准（见下方「Lead 浏览器复核结果」）。

---

## 自检（本次实现实际执行，输出为真实结果）

### 1. 语法检查

```bash
cd mock-platform
node --check v2-swiss-editorial/app.js
# → 无输出，exit code 0
```

### 2. 接线自检 `v2-swiss-editorial/_selfcheck.mjs`

```bash
node v2-swiss-editorial/_selfcheck.mjs
```

做三件事：

- **a) 静态 id 对账**：正则抓出 `app.js` 里全部 `$('#xxx')` / `document.getElementById('xxx')`
  的静态 id（本次为 **99 个**），断言每个都能在 `index.html`（88 个 `id`）里找到；
- **b) 六个 `data-screen` 与六个 `data-nav`**（`mock` `flow` `ne` `omp` `lcm` `vlp`）都必须存在，数量必须为 6；
- **c) 附加断言**：脚本引入顺序（domain → motion → micro → fx → app.js）、
  `MP.micro` 原语使用数 ≥ 8、`MP.motion` 原语使用（iris/develop/stagger/countUp/reveal）、
  `MP.motion.reduced` 与 `MP.sfx.toggle()` 接入、规则引擎五类 + 人机交互三类均覆盖。

**运行时生成的容器白名单**（`index.html` 里没有，由 `app.js` 的模板字符串产出；
脚本会同时用正则核对 `app.js` 里确实存在对应的 `id="…"` 字面量，拼写漂移会直接判失败）：

| id / 前缀 | 说明 |
| --- | --- |
| `certMark` `certGen` `certCn` `certDays` `svcBox` | 端点详情面板在渲染时才生成（证书状态形变宿主、签发按钮宿主、未签发时的 CN/有效期输入、服务控制区） |
| `accSw-` `pkgOps-` `taskGauge-` `taskMark-` | 每个账号 / 软件包 / 任务一个实例 |
| `vm-` `vr-` `vcm-` `vfm-` | 每条校验规则 / 每条校验结果 / 每个虚层校验项 / 每个虚层流程步骤一个实例 |
| `delayScrub` `ixAdd` `cpuScrub` `cpuGauge` `flowGauge` `upgradeHold` `coDeploySw` | MOCK 流程与虚层平台中承载微交互原语的宿主（挂载后宿主 id 会改成 `*Host`，防止重画时重复挂载原语） |
| `stepName` `stepKind` `stepDur` `validResult` `vField` `vRule` `vLevel` `vMsg` `groupName` `groupStrategy` `neCopy` | 网元详情各分页的表单控件 |

**自检输出结论**：

```
结果
  ✓ 全部自检通过（99 个静态 id / 6 个界面 / 6 个导航项）
```

### 3. 补充：Node 侧 DOM 桩冒烟（一次性，未留在仓库）

> 按要求本次**不启动浏览器、不使用 Playwright、不占用 4500 端口**。
> 为弥补「静态自检跑不到运行时」，另写了一个**一次性**的 Node 冒烟脚本：
> 用极简 DOM 桩（属性选择器 + 后代组合 + 事件冒泡 + 虚拟时钟）在 `node` 里真正执行
> `boot()` 与六个界面的主要交互链路，验证完即删除（未作为交付物保留）。
> 它捕获到了 1 个真实缺陷，已修复：

- **真实缺陷（已修）**：`bindMock` 里用 `var act = e.target.closest('[data-act]')` 遮蔽了本文件的
  `act()` 锁定助手，导致**证书签发**在 620ms 后抛出 `act is not a function`（`#certGenBtn` 已从 DOM
  移除、状态未写入）。已把局部变量改名为 `actEl`，全文件复查无其他遮蔽点。

冒烟覆盖并通过的链路（节选）：
端口注册与范围校验、能力挂载/卸载、证书签发与导出、按住启动服务、引信停止服务、删除端点、
接口选择、status/延迟/名称定制、字段增删与五类规则参数渲染、插入人机交互、手动触发后的规则命中说明、
日志展开/过滤/搜索/重放、人工放行、网元四页签、属性/架构/类型/版本/软件名、新建与复制网元、
升级步骤增删排序 + 按住执行升级、参数校验、成组、账号启停、创建账号（含重复名拦截）、
创建一体化任务并关联站点（含关联网元）、任务推进与进度液面、共部署开关（含端口复用说明）、
软件包登记/过滤/校验/移除、虚层 CPU 拖拽与加减、平台版本、主副站点（含主站保护）、
流程推进与重置、校验流程逐项执行、键盘 1–6 切屏、音效开关、模拟暂停/恢复、
**重画不丢焦点**、reduced-motion 下动效归零、连续流量模拟与日志上限。

**Lead 浏览器复核结果（2026-10-16，已完成）**：
上面「仍需复核」的四点已实测——真实排版与断点在 375 / 768 / 1024 / 1280 / 1440 × 六屏共 30 次测量中
`scrollWidth == clientWidth` 全部通过、无横向滚动；控制台无报错（仅 favicon 404）；
`iris` 切屏与 `develop` 入场的空间连续性正常；`fx.js` 的 canvas 背景与音频输出正常（音效默认关闭）。
另实测交互链路：选端点 → 生成证书（`none → issued`）→ 按住启动（`running: true`，出现引信停止按钮）；
预期响应字段规则下拉改成「自增」立即生效；手动触发一次请求审计日志 +1；
共部署 `velocitySwitch` 切换 `true → false`；`gauge` / `statusMark` / `scrub` / `segmented` / `magnetic` 均按预期渲染与响应。
截图见 `_verify/v2/`。

---

## 文件

- `index.html` —— 顶栏（品牌 + 编号导航 + SFX/时钟）+ 遥测规则条 + 六个 `data-screen` 骨架 + 页脚 + toast 容器
- `app.css` —— 设计令牌 / 编辑排版 / 12 栏网格 / 面板与表格 / `mx-*` 微交互样式 / 响应式与 reduced-motion
- `app.js` —— 视图层（订阅 → 按 `evt.type` 局部渲染 → 事件委托接线；`keepFocus` 保证重画不丢焦点）
- `_selfcheck.mjs` —— 接线自检脚本（一次性自检工具，非运行依赖）
- 共享层：`../_shared/{domain,motion,micro,fx}.js`（三版共用，本版只读不改）

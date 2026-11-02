# V3 · 莱茵生命 临床档案 / 终端

Mock 平台前端第 3 版设计稿。同一份 `_shared` 数据与规则引擎（`MP.*` 是唯一数据入口），
只在**视觉语言与版式**上与 V1（暗场运维控制台）、V2（瑞士编辑风）分道扬镳。

- 入口：`v3-rhine-lab/index.html`（服务已在跑：`http://127.0.0.1:4500/v3-rhine-lab/`）
- 文件：`index.html`（导航 + 骨架）/ `app.css`（设计系统 + 装饰类 + `mx-*`）/ `app.js`（视图层）
- 零依赖、离线可跑：无 npm / 无 Tailwind / 无 CDN / 无外链字体（纯系统字体栈）
- 品牌气质：临床实验室**档案** + **终端机**——编号化区块（01 / 02 / 03）、`RL-` 前缀编号、
  检定/校验清单、自绘六边形与菱形徽标、细密刻度与十字准星
- **不使用任何游戏素材文件或 logo**：所有几何装饰（六边形徽标、菱形、准星、刻度、网点）都是自绘 CSS / 内联 SVG

---

## 1. 双主题（本版核心特征）

| | `档案` ARCHIVE（亮 · 默认） | `终端` TERMINAL（暗） |
| --- | --- | --- |
| 画布 | `#f5f5f5` | `#0f0f10` |
| 表面 / surface-2 / surface-3 / inset | `#ffffff` / `#f5f5f5` / `#ebebeb` / `#eef0f1` | `#1a1b1c` / `#232425` / `#2d2e30` / `#141516` |
| 文字 fg / secondary / muted | `#1d1f20` / `#454647` / `#626262` | `#f0f0f0` / `#c9c9c9` / `#8d8d8d` |
| **强调色** | `--ak-blue-500 #0098DC`（游戏内蓝） | `--ak-cyan-500 #18D1FF`（官网青） |
| 阴影 | `0 1px 2px rgba(0,0,0,.08)` / `0 4px 12px …` | `0 1px 2px rgba(0,0,0,.4)` / `0 4px 14px …` |

- 切换控件在页眉右上角（`#themeBtn`），点按 / 键盘 `T` 均可切换。
- **切换动效 = 光圈式扩散**：以切换控件圆心为原点，一层「旧主题画布色」的光圈铺满全屏后淡出，
  露出新主题（`switchTheme()`，360ms 扩散 + 220ms 退场，token `--ak-ease` / `--ak-ease-in`）。
- 主题持久化到 `localStorage`（键 `mp-v3-theme`，读取失败静默降级为默认亮色「档案」）。
- 次强调与语义色：`#FFD800`（黄）· `#FF9433`（橙 · 6★/警示）· `#D83C3C` / `#C82A36` / `#A40000`（红）·
  `#2FAC78`（绿 · 成功）· `#BF96ED`（紫）；中性阶按规范 14 级全量落成 `--n-000 … --n-1000`。

## 2. 正典 token 落点

- **方舟 = 直角**：圆角统一 `0`；全站只有输入框 `.input` 用 `2px`（规范里唯一的例外）。
  全站无切角矩形、无斜切边、无 45° 斜带。
- **左侧色条 + 1px 细框**：`border-image: linear-gradient(to right, var(--c) 4px, var(--border) 4px) 1 1 1 4`
  用在 `.panel`（区块）、`.kpi`（指标块）；大字标题条 `.sc-head` 用 8px 色条。用 `border-image` 直角拼接，
  避免 `border` 在角上斜接出小斜边。
- **4px 栅格**：`--s1…--s12` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96。
- **断点**：320 / 640 / 1120 / 1680（`@media (max-width:359/639/1119/1679px)`）；页眉 56（手机 52）；两侧留白 24（手机 16）。
- **字体策略（Latin as ornament）**
  - 中文正文：`"Source Han Sans SC","Noto Sans SC","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",system-ui`，行高 **1.7**
  - 拉丁展示：`"Oswald","Arial Narrow",system-ui` + `letter-spacing:-.02em`
  - HUD 标签/数值：`"Chakra Petch","Oswald",system-ui`；等宽：`"JetBrains Mono",Consolas,monospace`
  - 字阶 display-xl 3.5 / display 2.5 / h1 2 / h2 1.5 / h3 1.25 / h4 1.0625 / body-lg 1.125 / body 1 / sm .875 / xs .75 / overline .6875
  - 跟踪：caps `.08em`、overline `.14em`
  - **中文标题是主角**：区块标题只写中文；成排的英文副题只出现在「一页一两处」（`.sc-head__lat`、
    `.hd__en`、`.nav__txt i`、`.panel__no`），不滥用。
  - **表格/数据数字一律正文字体 + `tabular-nums`**（`body { font-variant-numeric: tabular-nums }`），
    没有一处用 HUD 字体渲染表格数据（HUD 字体只用于 9–10px 的拉丁小标签与 `.hd__tv` 遥测读数）。
- **动效 token**：`--ak-dur-instant 80ms / fast 150 / normal 250 / slow 400`；
  `--ak-ease cubic-bezier(.2,.8,.2,1)` / `--ak-ease-in (.4,0,1,1)` / `--ak-ease-out (0,0,.2,1)` / `--ak-ease-sharp (.4,0,.2,1)`。
  退出比进入快（界面切换 520ms 进 / 312ms 出；主题光圈 360ms 进 / 220ms 出）。
- **层级**：dropdown 100 / sticky 200 / header 1000 / overlay 1500 / modal 2000 / toast 3000 / tooltip 4000。
- **`prefers-reduced-motion: reduce`**：`*, *::before, *::after` 的 animation 与 transition 全部压到 `.01ms`。
- **图标**：全部内联 SVG（页眉徽标、导航、按钮、箭头、状态环），零 emoji。

## 3. 装饰语言落点（每个界面各举一处）

| 装饰 | 实现 | 落点举例 |
| --- | --- | --- |
| 左侧色条 + 1px 细框 | `.panel` / `.kpi` 的 `border-image` 直角拼接 | `04 OMP` 三栏面板：`#accList` 面板左侧 4px 强调色条 |
| 45° 斜纹 `.ak-stripes` | `repeating-linear-gradient(45deg,…)` | `05 LCM` 待校验软件包行（`--warn` 橙斜纹）；`01 Mock 管理`「停止服务」危险按钮（`--danger` 红斜纹） |
| 半调网点 `.ak-halftone` | `radial-gradient` 网点 + `mask-image` 向右渐隐 | `02 Mock 流程`「响应字段（面向对象定制）」标题条 |
| 角标三角 `.ak-corner` | `border-top` + `border-left: transparent` 直角三角 | `02 Mock 流程` 日志表里「待人工 · 升级前人工确认」标签右上角三角；`01 Mock 管理` 已挂载能力 chip 右上角三角 |
| 黑白反转 `.ak-inverse` 思路 | 主按钮 = `--inv-bg`/`--inv-fg` 明度反转 | `01 Mock 管理`「登记端点」主按钮（亮色下黑底白字，暗色下白底黑字） |
| 拉丁装饰字 `.ak-overline` / `.ak-num` / `.ak-code-id` / `.ak-watermark` | 字体族 + 字距 + 超大低透明度 | `.ak-watermark`：`01 Mock 管理` 端口卡右上角超大水印编号 `RL-01`；`.ak-code-id`：`03 网元管理` 档案头的 `MOCK-GNB` |
| 菱形母题 | `.dia`（`transform: rotate(45deg)`，是独立小图形，不是盒子的斜边） | 列表符号：`02 Mock 流程` 能力分组标题；时间线节点：`.step__node`（`03 网元管理` 升级流程 / `06 VLP` 升级流程详情）；加载涟漪：`mx-ripple` 三菱形错峰 |
| 细密刻度 / 十字准星 | `.ak-scale` 双层 `repeating-linear-gradient`；`.bg__reticle` 十字线 | `.ak-scale`：`01 Mock 管理`「挂载平台能力」与「MOCK 服务」之间的标本标尺；准星：页面左上 / 右下背景层 |
| 网格 / 点阵 | `.bg__dots` 点阵（`mask-image` 上下渐隐）+ `.bg__grid` 80px 网格 | 全局背景层（未挂 canvas，避免与档案气质抢戏；`fx.js` 仍按契约引入备用） |

## 4. 六个界面（`data-screen` 与导航 `data-nav` 一致）

`mock` `flow` `ne` `omp` `lcm` `vlp` —— 编号化区块 01…06 与导航序号、面板内 `01/02/03` 分区编号一致。

## 5. §5 验收清单逐条落点

### S1 `mock` Mock 管理
- [x] **注册本机 IP + 端口**：`#pfIp` 下拉列出本机两张网卡 + 回环 + 「手动输入…」（手填框 `#pfIpCustom`）；
  端口范围校验 1024–65535、IPv4 合法性、重复登记检测；错误就近显示在 `#pfPortErr`（`role="alert"`）并给字段加 `is-invalid`
- [x] **生成证书文件**：未签发时 `#certGenHost` 提供 CN / 有效期 / 签发机构表单 → `rippleLoader` 签发；
  已签发时展示 CN、有效期、签发时间、机构、**指纹**，并「导出证书文件」为 PEM `.crt`（Blob 下载）、可重新签发
- [x] **挂载多种平台能力**：6 个能力 chip（`aria-pressed`）可任意挂载/卸载，卸载会写审计日志
- [x] **开启 mock 服务**：`holdConfirm` 按住 1.2s 启动（未签发证书或未挂载能力时禁用并说明原因）；
  运行时用 `fuseButton` 停止（4.2s 引信内可撤销），可恢复

### S2 `flow` Mock 流程
- [x] **审计日志**：实时追加（模拟器 2.6s 一轮）、`segmented` 过滤（全部/成功/异常/待人工）、搜索框、
  展开看 REQUEST/RESPONSE 报文、一键重放（重放会重新走规则引擎）
- [x] **定制延迟与 HTTP status code**：`#apiStatus` 九种状态码下拉；`scrub` 拖拽/方向键改延迟 0–3000ms（10ms 步长）
- [x] **面向对象响应字段定制**：字段可增删（`#addFieldBtn` / 删除按钮），每个字段独立设
  **路径 / 类型（9 种）/ 取值方式（手工填写 ↔ 下拉选择）/ 取值**
- [x] **字段级规则**：固定 / **自增**（起点·步长·`{n:04}` 格式）/ **单次生效**（次数·兜底值）/ **条件**（字段·操作符 等于|包含|非空|末尾为偶数·比较值·命中时·否则）/ 随机（候选值）；
  命中说明可见：手动触发后的 toast 摘要 + 日志展开里的 `字段 = 值 · 规则名 · 命中说明`
- [x] **插入人机交互**：`segmented` 三选（人工确认 / 验证码 / 人工闸门）插入，可移除；
  日志行出现「待人工」角标标签与**放行 / 拒绝**按钮（`resolveInteraction` → 状态码 200 / 403）

### S3 `ne` 网元管理
- [x] **属性、架构、类型**：名称/编号/类型（7 种）/架构（5 种）/厂商/型号 + **属性键值对可增删**（`params`）
- [x] **版本、使用软件名称、旧版本**：版本（格式校验 `7.2.0`）、软件名、旧版本列表并高亮当前版本
- [x] **升级流程步骤**：增（名称/类型/耗时/负责人）、删、上移、下移
- [x] **升级流程中的人机交互**：类型选「人工」自动挂上人机交互（负责人 + 超时 300s）；
  「按住执行升级流程」（`holdConfirm`）逐步骤推进 `statusMark` + `gauge` 进度，走到人工步骤挂起并 toast 提供「立即放行」
- [x] **网元成组**：归入/移出已有组、新建组（组名/策略/说明）、组列表显示成员数与策略
- [x] **复制网元**：序号顺延一位，属性/校验/升级流程继承，toast 内可撤销复制
- [x] **参数校验**：规则增删（字段/正则/级别/提示，正则非法会拦下并提示）、**执行校验**（`latticeLoader` 计时 + `statusMark` 逐条结果 + n/N 通过）

### S4 `omp` 网元管理平台
- [x] **受管网元、网元组**：`#ompScope` 列出全部网元（未纳入平台的有角标）与网元组，组行带「一键建任务」预填
- [x] **账号管理的网元范围**：创建账号时可勾选**授权网元组**（自动并入其成员）与**授权网元**；账号行显示范围
- [x] **创建账号**：名称（格式 + 重名校验，就近报错）、角色三选、范围多选
- [x] **一体化升级任务 + 关联站点**：任务名 + 站点下拉（含区域/CPU）+ 目标网元组；
  任务卡显示站点、步骤条、`gauge` 进度、`statusMark` 状态、逐步推进；遇人工步骤自动置 `waiting-human` 并给「立即放行」

### S5 `lcm` 生命周期平台
- [x] **受管网元**：`#lcmScope` 列出全部受管网元（带版本）
- [x] **软件包：类型 / 所属网元 / 厂商 / 版本**：登记表单四项齐全（+ 大小），列表按 全部/已校验/待校验 过滤，
  待校验行进校验流程（`latticeLoader` → `statusMark` 通过），可移除并撤销
- [x] **与网元管理平台共部署**：`velocitySwitch` 开关 + 端点/版本/包数对照 + **端口复用说明**
  （共部署时复用 `10.18.32.104:8443` 与同一张证书，端口只登记一次；关闭则回落到独立端点 `:9443`）

### S6 `vlp` 虚层管理平台
- [x] **CPU 数量**：`scrub` 拖拽/方向键（4–64 核，步长 2，超界橡皮筋）+ ±2 按钮 + `gauge` 配额读数
- [x] **主副站点**：站点列表带可分配 CPU 与规划角色，设为**主站**/设为**副站**（互斥校验 + 提示）
- [x] **升级流程详情**：四步流程（自动/手动/人工）菱形时间线、状态推进（自动步骤自动走完、人工步骤 `holdConfirm` 按住放行）、推进下一步 / 重置流程
- [x] **平台版本**：三个版本下拉（含回滚点 R3.0.6）
- [x] **软件包校验流程**：MD5 / 签名 / 依赖 / 回滚点四项，逐项执行校验（`latticeLoader` + `statusMark`），警告项用斜纹行强调

### 全局
- [x] 6 个界面可切换，切换动效连续（`MP.motion.iris()` 光圈**从导航项展开**，无导航项来源时退回 `develop()` + `stagger()`）
- [x] 每次动作有反馈：toast（引信倒计时 + 可撤销）/ 状态形变 / 音效（默认关，`MP.sfx.toggle()`）
- [x] 键盘可达：所有控件是原生 `button`/`input`/`select`；`:focus-visible` 2px 强调色描边；
      数字键 1–6 切界面、`T` 切主题；`aria-label` / `aria-pressed` / `aria-selected` / `aria-current` / `role="alert"` / `aria-describedby` 到位
- [x] 320 / 640 / 1120 / 1680 断点不横向滚动（栅格逐级降为单列、导航横向滚动而非撑破页面、
      `body { overflow-x: hidden }` + `min-width: 0` 的 flex/grid 子项）
- [x] `prefers-reduced-motion` 生效（所有动画/过渡 → 0.01ms，`MP.motion.reduced` 同时作用于 JS 侧）
- [x] 表单：可见 `<label for>`；就近报错（`.field__err` + `role="alert"` + `is-invalid`）；
      **重画不丢焦点**（`keepFocus()` 同时还原焦点、光标选区与 6 个滚动容器的 `scrollTop`）

## 6. 微交互原语（`MP.micro`，共 12 个 ≥ 8；样式全部自写，类名前缀 `mx-`）

| # | 原语 | 语义位置 |
| --- | --- | --- |
| 1 | `holdConfirm` 按住确认 | `01` 按住启动 MOCK 服务（1.0s）· `03` 按住执行升级流程（1.2s）· `06` 人工步骤「按住放行」（1.0s） |
| 2 | `fuseButton` 完成后可撤销 | `01` 停止服务（4.2s 引信）/ 删除端点（3.2s 引信） |
| 3 | `velocitySwitch` 速度驱动挤压开关 | `04` 账号启用/停用逐行开关 · `05` 与网元管理平台共部署开关 |
| 4 | `gauge` 惯性液面读数 | `03` 升级执行进度 · `04` 每个一体化任务的升级进度 · `06` CPU 配额 |
| 5 | `statusMark` 状态三段形变 | `03` 参数校验逐条结果 · `04` 任务状态（执行中/等待人工/已完成）· `05` 软件包校验状态 · `06` 四项校验状态 |
| 6 | `scrub` 拖拽改数值 + 橡皮筋 | `02` 响应延迟 ms（0–3000，步长 10）· `06` CPU 核数（4–64，步长 2） |
| 7 | `toast` 引信倒计时 + 撤销 | 全局反馈（每个 `MP.actions` 调用都有对应 toast；复制网元/删除端点/移除软件包/停止服务带撤销） |
| 8 | `rippleLoader` **菱形涟漪**加载 | `01` 签发证书进行中 · `03` 执行校验时按钮内退回小尺寸加载 |
| 9 | `latticeLoader` 格点波动 + 实时计时 | `03` 参数校验中 · `05` 软件包校验中 · `06` 校验项执行中 |
| 10 | `segmented` 橡皮筋分段控件 | `02` 日志过滤（全部/成功/异常/待人工）· `02` 能力过滤 · `02` 人机交互类型三选 |
| 11 | `magnetic` 磁吸 | 主行动按钮：登记端点 / 新建网元 / 复制网元 / 手动触发请求 / 创建账号 / 创建任务 / 登记软件包 / +2 核（`[data-magnetic]`，由 `wireMagnets()` 在每次重画后补接线） |
| 12 | `spotlight` 光斑跟随 | `01` 端点登记簿的每张端口卡（`--mx/--my` 光斑） |

## 7. 动效清单

| 界面 | 动效 | 用的 token / API |
| --- | --- | --- |
| 全局 · 界面切换 | **iris 光圈从导航项展开**（圆心 = 导航项在舞台坐标系里的中心）；无来源时 `develop()` + 面板 `stagger()` | `MP.motion.iris`（520ms `--ak-ease`，退出 0.6×加速 `--ak-ease-in`）· `develop 380ms` · `stagger each 24ms` |
| 全局 · 主题切换 | 光圈式扩散：旧主题画布色圆形光罩从切换控件圆心铺满 → 淡出 | `--ak-dur-slow 400ms` 内的 360ms `--ak-ease` + 220ms `--ak-ease-in` |
| 全局 · 数字指标 | 页眉遥测 6 个读数变化时数字滚动 | `MP.motion.countUp(duration 420)` |
| 全局 · 面板 | 当前界面下所有 `.panel/.kpi` 交错入场 | `MP.motion.stagger(each 24, y 10, duration 300)` |
| 全局 · 滚动 | `[data-reveal]` 滚动进场 | `MP.motion.reveal` |
| `01 mock` | 端口卡选中/运行态色条切换 `--ak-dur-fast`；光斑跟随 `--ak-dur-normal` 淡入 | `--ak-ease` |
| `01 mock` | 按住启动：填充条 `rAF` 线性推进；停止：底部引信 4.2s 线性烧尽 | `mx-hold` / `mx-fuse`（微交互内部使用 `spring`） |
| `02 flow` | 新日志行 `ak-flash` 高亮闪现（`--ak-dur-slow`）；分段控件滑块橡皮筋 320ms | `--ak-ease` |
| `02 flow` | 字段行按规则类型着色左边条（固定/自增/单次/条件/随机） | `--ak-dur-fast` |
| `03 ne` | 升级流程：菱形节点 `ak-beat` 脉冲标记 active；进度 `gauge` 惯性液面；状态 `mx-mark` 环→弧→勾/叹号 | `--ak-ease` / `spring` |
| `04 omp` | 任务进度 `gauge` 惯性液面 + 任务状态 `mx-mark`；账号开关速度挤压 | `--ak-ease` |
| `05 lcm` | 校验中 `mx-lattice` 格点波动 + 实时秒表 → done 转绿 | `--ak-ease` |
| `06 vlp` | CPU `gauge` 液面惯性；流程自动推进逐步骤点亮；校验 `mx-mark` 三段形变 | `--ak-ease` |
| 全站 · 加载 | 菱形涟漪 `mx-ripple` 三菱形错峰 160ms（按钮内退回圆弧转圈 `.btn.is-busy`） | `--ak-ease-out` |
| 全站 · reduced-motion | 所有 animation/transition → `0.01ms`，`MP.motion.reduced` 为真时 JS 侧走无动画分支 | `@media (prefers-reduced-motion: reduce)` |

## 8. 自检

在 `mock-platform` 目录下执行（**未启动浏览器、未使用 Playwright、未占用 4500 端口**）：

```powershell
node --check v3-rhine-lab/app.js
```

```
check exit: 0        # 语法通过，无输出即无错误
```

一次性自检脚本（跑完即删，下面的命令**就是实测时执行的那条**，可原样复跑）：
抓出 `app.js` 里所有 `$('#id')` / `$$('#id')`，与 `index.html` 的 `id="…"` 集合比对，
运行期由 JS 自己写进面板 HTML 的容器走显式白名单；再断言六个 `data-screen`、六个 `data-nav`、取值与顺序一致、
双主题切换控件存在。

```powershell
$code = @'
const fs=require("fs"),H=process.env.V3DIR;
const html=fs.readFileSync(H+"/index.html","utf8"),js=fs.readFileSync(H+"/app.js","utf8");
const ids=new Set([...js.matchAll(/\$\$?\(\s*'#([\w-]+)'/g)].map(m=>m[1]));
const htmlIds=new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
const dyn=new Set(["certCn","certDays","certIssuer","certCnErr","certGenHost","svcBox","apiStatus","delayScrub","fieldList","ixBox","ixAdd","addFieldBtn","triggerBtn","neName","neCode","neType","neArch","neVendor","neVersion","neVerErr","neSoft","neModel","paramList","paramKey","paramVal","paramAdd","neSave","vField","vLevel","vRule","vMsg","validAdd","validRun","validResult","stepList","upRun","upGauge","upMark","stepName","stepKind","stepDur","stepOwner","stepAdd","neGroup","grpName","grpStrategy","grpDesc","groupNew","neCopy","coDeploySw","cpuScrub","cpuGauge"]);
const pre=["acc-","gauge-","pkgm-","vcm-","vcl-"];
const miss=[...ids].filter(i=>!htmlIds.has(i)&&!dyn.has(i)&&!pre.some(p=>i.startsWith(p)));
const screens=[...html.matchAll(/data-screen="([^"]+)"/g)].map(m=>m[1]);
const navs=[...html.matchAll(/data-nav="([^"]+)"/g)].map(m=>m[1]);
const want=["mock","flow","ne","omp","lcm","vlp"];
const okA=miss.length===0, okB=screens.join()===want.join()&&navs.join()===want.join()&&/id="themeBtn"/.test(html);
console.log("a) $(\"#id\") 共 "+ids.size+" 个：静态命中 "+[...ids].filter(i=>htmlIds.has(i)).length+"，动态白名单 "+[...ids].filter(i=>!htmlIds.has(i)).length+"，悬空引用 "+(miss.join(",")||"无"));
console.log("b) data-screen=["+screens.join(",")+"] nav=["+navs.join(",")+"] 主题控件="+(/id="themeBtn"/.test(html)?"有":"无"));
console.log(okA&&okB?"\u2705 全部通过":"\u274c 失败");
process.exit(okA&&okB?0:1);
'@
[System.IO.File]::WriteAllText((Join-Path $env:TEMP 'v3selfcheck.cjs'), $code, (New-Object System.Text.UTF8Encoding($false)))
$env:V3DIR = (Resolve-Path 'v3-rhine-lab').Path
node (Join-Path $env:TEMP 'v3selfcheck.cjs'); "--- exit: $LASTEXITCODE ---"
Remove-Item -LiteralPath (Join-Path $env:TEMP 'v3selfcheck.cjs') -Force
```

实测输出：

```
a) $("#id") 共 111 个：静态命中 79，动态白名单 32，悬空引用 无
b) data-screen=[mock,flow,ne,omp,lcm,vlp] nav=[mock,flow,ne,omp,lcm,vlp] 主题控件=有
✅ 全部通过
--- exit: 0 ---
```

（开发过程中另有一版 `v3-rhine-lab/_selfcheck.mjs`，逐条打印了动态 id 模板与所用 `MP.micro` 原语清单，
实测输出为：）

```
—— V3 自检 ——
a) $('#id') 共 111 个：静态骨架命中 79 个，动态容器白名单 32 个，无悬空引用
b) data-screen=6 个（mock,flow,ne,omp,lcm,vlp）· 导航项=6 个 · 主题控件存在
   动态 id 模板（模板字符串拼接，人工确认）：选择器 [acc-] · getElementById [gauge-, pkgm-, pkgm-, vcm-, vcl-]
   实际使用的 MP.micro 原语 12 个：holdConfirm, velocitySwitch, gauge, statusMark, scrub, toast,
                                   rippleLoader, latticeLoader, segmented, fuseButton, magnetic, spotlight

✅ 全部通过
--- exit: 0 ---
```

结论：

1. `app.js` 无语法错误（`node --check` 退出码 0）。
2. `app.js` 引用的 111 个 `#id` 中，79 个在静态骨架里命中，32 个是运行期由 JS 注入面板 HTML 的容器
   （证书表单、字段编辑器、步骤列表、校验表单、`gauge-*` / `pkgm-*` / `vcm-*` / `vcl-*` / `acc-*` 前缀容器），
   **零悬空引用**。
3. 六个 `data-screen` 与六个导航 `data-nav` 取值、数量、顺序完全一致；双主题切换控件
   （`#themeBtn` / `#themeName` / `html[data-theme]`）与 `localStorage` 读写均在位。
4. 实际接线 `MP.micro` 原语 12 个，满足「≥ 8 且语义正确」。

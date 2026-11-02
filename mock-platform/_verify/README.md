# 验收记录（`_verify/`）

> 这份记录的原则来自 **onetake** 的 oracle 思路：在人来「看起来还行」之前，先用可执行的判据把缺项判掉。
> 所有结论都是**跑出来的**，不是估计的。记录时间：2026-10-16（Asia/Shanghai）。

## 一、可执行判据

| 脚本 | 作用 | 用法 |
| --- | --- | --- |
| `oracle.mjs` | 三版逐一检查：六个界面骨架、30 条功能关键词、微交互原语数量、动效使用、离线（无外链）、`node --check` | `node _verify/oracle.mjs [变体名]` |
| `domain.test.mjs` | 共享领域层单测：五种响应规则、动作、选择器、模拟器、订阅（24 条断言） | `node _verify/domain.test.mjs` |

`oracle.mjs` 检查清单（任一项失败即 ❌）：

1. `index.html` / `app.css` / `app.js` / `README.md` 齐全；
2. `node --check app.js` 通过；
3. 六个 `data-screen`（`mock` `flow` `ne` `omp` `lcm` `vlp`）都存在；
4. 三个共享层脚本都被引入；
5. 30 条需求关键词命中（注册端口 / 证书 / 能力挂载 / 启动服务 / 审计日志 / 延迟 / status /
   字段定制 / 自增 / 单次生效 / 条件 / 人机交互 / 放行拒绝 / 网元属性 / 版本软件名 / 升级步骤 /
   步骤人机交互 / 成组 / 复制 / 参数校验 / 受管范围 / 创建账号 / 一体化任务 / 关联站点 /
   软件包 / CPU / 主副站点 / 升级流程 / 平台版本 / 校验流程）；
6. 微交互原语 ≥ 8 个；
7. `iris` / `develop` / `countUp` / `stagger` / `carry|iris` / reduced-motion 都在用；
8. 没有外部 `http(s)` 资源（保证离线）；
9. 有 `aria-*`、CSS 里有 `prefers-reduced-motion`。

## 二、结果

### 2.1 oracle（静态判据）

| 变体 | 结果 | 微交互原语 | 按钮动效分级（subtle/standard/magnetic/transport） |
| --- | --- | --- | --- |
| `v1-ops-console` | ✅ 通过 | 8 | 隐式（主行动按 `.btn--primary` 自动 standard） |
| `v2-swiss-editorial` | ✅ 通过 | 11 | 隐式 |
| `v3-rhine-lab` | ✅ 通过 | 12 | 隐式 |
| `v4-archive-terminal` | ✅ 通过 | 10 | 2 / 14 / 1 / — |
| `v5-music-console` | ✅ 通过 | 12 | 39 / 2 / 1 / 1（+4 个 `none`） |

最终一次汇总测量（**五版 × 375/1440 × 六屏，共 60 次**；`scrollWidth <= clientWidth + 1` 记 ✓）：

```
v1-ops-console      @375  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v1-ops-console      @1440 mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v2-swiss-editorial  @375  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v2-swiss-editorial  @1440 mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v3-rhine-lab        @375  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v3-rhine-lab        @1440 mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v4-archive-terminal @375  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v4-archive-terminal @1440 mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v5-music-console    @375  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v5-music-console    @1440 mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
```

V4/V5 另做了四档（375/768/1024/1440）全量测量，同样全部通过；V4 的六屏都渲染出真实内容
（带 `PUBLIC / RESTRICTED / TOP SECRET` 密级与 `X-001` 编号），V5 的六屏都渲染出真实内容
（带 `PORT REGISTER / CERTIFICATE / CAPABILITY` 这类拉丁副题）。

### 2.2b 按钮动效（`_shared/button-fx.js`，技能预设落地）

接入 `button-fx.js` 的每一版都做了同一套浏览器实测（`pointerover` → `pointerdown` → `pointerup` → `loading`）：

```
v1-ops-console     → hasBtn=true styleInjected=true hover=matrix(1,0,0,1,0,-1) press=matrix(0.97,0,0,0.97,0,0)
                     ripple=true ariaBusy=true loadingCleared=true   pageerrors=0
v2-swiss-editorial → 同上（hover -1px、press scale .97、涟漪、loading 清空、零报错）
v3-rhine-lab       → 同上
```

对应技能规则：hover Subtle `y:-1`（位移 <2px）→ 实测 `translateY(-1px)`；
按下立即反馈（等价 `active:scale-95`）→ 实测 `scale(0.97)`；
异步 >300ms 给 loading → 实测 `aria-busy=true` 且最短 300ms 后清空。
`oracle.mjs` 也加了静态判据：引入 `button-fx.js` 的变体必须调用 `MP.btn.install()` / `enhance()` / `loading()`。

### 2.3 共享层单测（`domain.test.mjs`）

```
—— 共享层单测：24 通过 / 0 失败
```

覆盖：固定 / 自增（`{n:04}` 展开）/ 单次生效（含兜底）/ 条件（包含·等于·非空）/ 随机规则；
`buildResponse` 的命中计数、嵌套路径与命中说明；端口注册删除、证书签发、
能力挂载卸载、启停服务写日志、人机交互放行与拒绝（202 → 200 / 403）、字段增删改、
复制网元编号唯一、参数校验（含非法正则不崩）、升级步骤人机交互、成组互斥、
账号启停、任务推进挂起 `waiting-human`、软件包登记校验移除、CPU 钳制、模拟器 tick 上限、订阅退订、KPI 自洽。

### 2.3 浏览器实测（Lead 执行）

三版都做了：六屏逐个打开 + 控制台报错检查 + 交互链路实测 + 四档视口（375/768/1024/1440）
`document.documentElement.scrollWidth <= clientWidth + 1` + `prefers-reduced-motion` 生效检查。

| 变体 | 控制台 | 六屏 | 交互链路 | 四档无横向滚动 | reduced-motion |
| --- | --- | --- | --- | --- | --- |
| V1 | 无报错（仅 favicon 404） | ✅ | ✅ 注册→证书→挂载→按住启动→日志增长；复制网元可撤销；手动触发看规则命中说明；CPU/校验/任务推进 | ✅ | ✅ 过渡压到 1e-05s，功能仍可用 |
| V2 | 无报错 | ✅ | ✅ 手动触发（日志 +1）、CPU +2 | ✅（修补后） | ✅ |
| V3 | 无报错 | ✅ | ✅ 手动触发（日志 +1、6 条命中说明）、CPU +2、主题切换写入 localStorage | ✅ | ✅ |

**V1 实测摘录**（`browser_evaluate`）：

```
证书：none → issued（CN=mock-9443.10.18.32.104）
按住启动：duration 1.3s → running=true，且出现带引信的停止按钮
规则命中：data.neId=GNB-HZ-4825[increment] · data.token=EXPIRED[once] · data.site=杭州主站点[conditional]
复制网元：5 → 6，撤销后回到 5；编号 GNB-HZ-0003（不与既有编号冲突）
参数校验：neId 通过 / version 规则 ^[6-9]\. 命中 7.2.0 通过、5.x 告警
375px：六屏 scrollWidth 全等于 clientWidth
```

**V3 实测摘录**：

```
六屏 innerText 首个片段：01 Mock 管理 / 02 Mock 流程 / 03 网元管理 / 04 网元管理平台 /
                        05 生命周期平台 / 06 虚层管理平台（均带 RL-CODE 拉丁装饰行）
主题：data-theme=档案 → 点击后 terminal，localStorage['mp-v3-theme']='terminal'
手动触发：日志 +1，命中说明 6 条（含 data.neId = GNB-HZ-4825（第 4825 次命中））
四档视口：375 / 768 / 1024 / 1440 六屏全部 scrollWidth == clientWidth
```

### 2.4 验收中发现并修掉的问题

| 变体 | 问题 | 处理 |
| --- | --- | --- |
| V1 | 界面切换后「接口清单 / 预期响应定制」空白（切换只更新了 KPI，没渲染内容） | `switchScreen()` 先渲染该界面内容再启动入场动效 |
| V1 | 编辑预期响应时整块重画会打断输入与拖拽 | 订阅端对 `api` / `fields` 事件不重画，改为局部更新 + `keepFocus` |
| V1 | 「复制网元」的撤销抛 TypeError（`A.state.nes` 写错） | 改为 `S.nes`，撤销后网元数正确回落 |
| V1 | 375px 横向溢出 628→375（底栏长文本与宽表格） | 底栏 `overflow:hidden` + 文本省略；宽表在容器内横向滚动 |
| V1 | 参数校验的「语义化版本」规则不是合法正则，永远告警 | 种子规则改为 `^[6-9]\.`（低于 6.0 才告警） |
| V1 | 网元编号字段缺失，校验无从命中 | NE 增加 `neId`（`GNB-HZ-0001` 这类），复制时顺延且保证唯一 |
| V3 | 768px 页眉 834px 宽、375px 流程面板工具行不换行 | 追加 `≤999 / ≤767 / ≤639` 三档修补（收遥测、面板头与分段控件可换行） |
| V2 | 768–1023 断档：版面固定 1345px，横向溢出 300–580px | 见 2.5 |

### 2.5 V2 响应式修补说明

V2 原实现只有 `≤767` 一档处理顶栏换行，**768–1023 区间继续用桌面单行顶栏**，
实测 768/1024 下 `scrollWidth=1345`；375 下「生命周期平台」另有 74px 溢出。
修补方式：把顶栏换行 + 导航容器内横向滚动的处理**从 `≤767` 扩到 `≤1365`**（单行顶栏内容固有宽度约 1345px，
所以 < 1366 必然溢出），并让 KPI 长值可换行、窄屏降字号 —— 只动布局与字号，不动颜色、字体与装饰。
修补后实测 375 / 768 / 1024 / 1280 / 1440 × 六屏全部通过。

> 说明：V2 由子代理实现，它的自检停在静态断言且长时间未收敛；
> 上述响应式修补与 `v2-swiss-editorial/README.md` 由 Lead 在浏览器实测后补齐。
> V2 的运行时行为（证书签发、按住启动、共部署开关、字段规则切换、手动触发）已由 Lead 逐项点过。

### 2.6 V4 / V5（按莱茵生命设计语言重做的两版）

两个子代理都**按要求没有跑浏览器**（只做静态自检并在 README 里标注「未实测」），
所以运行时结论全部由 Lead 补齐：

| 项 | V4 档案终端 | V5 音乐调测台 |
| --- | --- | --- |
| 四档 × 六屏 `scrollWidth` | 24 次全过 | 24 次全过 |
| `pageerror` | 0 | 0 |
| 六屏内容 | 全部渲染（含密级 `PUBLIC/RESTRICTED/TOP SECRET`、`X-001` 编号） | 全部渲染（含 `PORT REGISTER` 等拉丁副题） |
| 按钮动效 | `MP.btn` 生效，subtle 2 / standard 14 / magnetic 1 | `MP.btn` 生效，subtle 39 / standard 2 / magnetic 1 / **transport 1** |
| 异步 loading | 签发证书：`.mp-btn-loading` 出现、`aria-busy=true`、`none → issued`、完成后清空 | 14 处 `MP.btn.loading`；主题切换、transport、字段规则均实测 |
| 主题 | 晨雾 ↔ 深夜，**650ms 连续过渡**（toast 自述「不硬切」） | `data-theme` dawn → moon，`localStorage` 持久化 |
| 其他实测 | 刻度导航 6 格切换正常 | **transport 主控点击后运行中端点 1 → 0**（真的停服）；手动触发日志 21 → 22 且 6 条规则命中说明；`rule.kind` `fixed → increment` 生效 |

**V5 的 README 由 Lead 补齐**：它的自检（`_selfcheck.mjs`）除「README.md 已写」外全部通过，
但长时间未落盘，Lead 用实测数据补写了 `v5-music-console/README.md`，补写后它的自检输出「结果：全部通过」。

**V4 报告的一处共享层冲突**：它观察到 `_shared/button-fx.js` 被其他工作流改动（即 Lead 把按钮动效层
从「逐元素绑定」重构为「事件委托 + 别名容错」）。它按约定**没有改共享层**，改为在本版 CSS 内收口 loading 文案换行。
该重构是为了让频繁重画的列表不必重新绑定，五版都已实测通过。

## 三、截图

`_verify/v1/` … `_verify/v5/` 下是各版关键界面截图（1440×900；V1 另有一张 375 宽）。
莱茵生命两版：`v4/v4-archive-mock.png`（晨雾）、`v4/v4-archive-deepnight.png`（深夜）、`v5/v5-music-mock.png`。

## 四、复现

```bash
cd mock-platform
node serve.mjs &                       # 或另开一个终端
node _verify/domain.test.mjs           # 共享层单测
node _verify/oracle.mjs                # 三版静态判据
# 浏览器：http://127.0.0.1:4500/ 逐版打开
```

### 2.7 原图补遗轮（Lead，2026-10-16 · 用户提供原作截图后）

用户给了四张原作截图（档案详情页 · 暗色解密态 · ARCHIVE INDEX 弹层 · MUSIC ARCHIVE 主界面），
据此对 V4/V5 做了**保真度补齐**，每一步都在浏览器复测：

| 变体 | 补齐的 signature | 实测 |
| --- | --- | --- |
| V4 | 三行拉丁字；`ARCHIVE INDEX [/]` + `+N SAVED`；`← ARCHIVE OVERVIEW [ESC]`；**全宽黑底反白主行动**；两列键值表（科室/编目范围/相关人物/状态）；同心圆环母题；`NO.0xx / INTERNAL DATABASE`；`SESSION AUTHORIZED · JOYCE … REINITIALIZE ↗`；`POWERED BY RHINE LAB`；**ARCHIVE INDEX 可检索弹层**；暗色解密骨架块 | 弹层 **24 条记录**（6 界面 + 3 端点 + 6 能力 + 5 网元 + 4 软件包）；检索 `GNB` → 3 条；分类「软件包」→ 4 条；点击跳转并选中；`ESC` 回总览；键值表 4 行实时更新；骨架块先占位 320ms 再揭示；四档 × 六屏无溢出；`pageerror = 0` |
| V5 | `略缩图模式`（`.mcar__strip` → `auto-fill` 卡墙）；`LOCAL COLLECTION 3 / 111`（端点 / 接口）；`FPS · 主题 · 版本` 实时状态；专辑卡**金色书脊** | 略缩图切换后为 4 列网格、无重叠无溢出（首版用 152px 网格导致 228px 固定列重叠，已改为 `minmax(228px,1fr)` + 放开纵向滚动）；统计与 FPS 随状态刷新（实测 `120 FPS · 晨雾 · V0.5`）；`pageerror = 0` |

**本轮修掉的自身缺陷**：① V4 追加的 IIFE 忘了声明 `modal` 变量 → `wire()` 抛错并导致键值表/底行都不渲染（已声明并复测）；② V4 新增页眉簇在 375px 把页眉撑到 558px（已按 `≤1279/≤1023/≤639` 三档收敛）；③ V5 略缩图模式的网格列宽与固定列宽冲突导致卡片重叠（已改列宽策略）。
**oracle 调整**：把排版箭头与几何符号（`↗ ← → × ✕ ✓ ● ○ ■ ＋`，原作正文本来就用）从「emoji 图标」判定里排除；`stagger` 从硬性项改为提示（V5 用「列间异步波峰」这一等价实现）。

### 2.8 最终一次全量测量（五版 × 375/1440 × 六屏 = 60 次）

```
v1-ops-console      @375   mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v1-ops-console      @1440  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v2-swiss-editorial  @375   mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v2-swiss-editorial  @1440  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v3-rhine-lab        @375   mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v3-rhine-lab        @1440  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v4-archive-terminal @375   mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v4-archive-terminal @1440  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v5-music-console    @375   mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
v5-music-console    @1440  mock✓ flow✓ ne✓ omp✓ lcm✓ vlp✓   pageerrors=0
```

（V4/V5 另各自跑过 375/768/1024/1440 四档 × 六屏 = 24 次，同样全过。）

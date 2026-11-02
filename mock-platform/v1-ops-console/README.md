# V1 · 暗场运维控制台（HUD / FUI）

> 面向 7×24 值守的深色控制台：一屏之内看清 6 个 mock 端点、6 个能力、5 台网元与实时流量。

## 设计依据（不是凭感觉，都有出处）

**来自设计智能库 `ui-ux-pro-max` 的 `--design-system` 推荐**（查询词：*telecom network element mock platform
operations console realtime logs dark dense technical*，dials：variance 7 / motion 8 / density 9）：

| 项 | 采用值 |
| --- | --- |
| Pattern | Real-Time / Operations（暗色 + 状态色 + 数据密集但可扫读） |
| Style | HUD / Sci-Fi FUI（细线、透明、发光、扫描、刻度） |
| Primary / On | `#1E1B4B` / `#FFFFFF` |
| Secondary | `#312E81` |
| Accent / CTA | `#F97316` |
| Background / Foreground | `#0F0F23` / `#F8FAFC` |
| Muted / Border / Destructive | `#27273B` / `#4338CA` / `#EF4444` |
| Typography | Inter（标题/正文）+ 等宽（数据、日志、报文） |
| Key effects | 发光、扫描动画、跑马灯、闪烁标记、细线描绘 |
| Density / Motion | 9/10（8–32px 栅格） · 8/10（复杂编排） |

**库明确列出的反模式，逐条规避**：
- ✗「浅色」→ 本版是深色专用，不做浅色主题（浅色交给 V2/V3）。
- ✗「数据可视化差」→ 所有 KPI 都带单位与量（req / rps / ms / 个 / 核），
  日志表用等宽 + 表格数字对齐（`tabular-nums`），状态码按 2xx/3xx/4xx/5xx 上色，
  规则命中有可展开的「命中说明」，不做只有数字没有语义的装饰性图表。

**来自本仓库已克隆的开源项目**（见根 `README.md` 的「知识来源与落点」）：
- `_shared/fx.js` 的扫描线/网格背景来自 **Shaders**（shader-effects-inc/shaders）的效果目录；
- `_shared/micro.js` 的 9 个原语用于本版交互（下表）；
- `_shared/motion.js` 的 `spring/iris/develop/countUp/stagger` 来自 **design-systems** 的
  Overture 运动原语与 Lens 弹性手势。

## 拓扑：为什么是「左导轨 + 顶部遥测」

V1 的场景是**值守**：操作员长时间盯着同一屏，最怕的是「位置变化导致找不到东西」。
所以骨架是固定的：左侧 6 个界面导轨（带实时角标：待人工数会变琥珀色告警），
顶部一条遥测跑马灯（REQ/OK/ERR/AVG/RUN/HUMAN），底部一条实时审计 ticker。

- 密度 9：面板内边距 12–16px、行高 30px 上下，一屏能放下端点列表 + 端点详情；
- 状态优先：`RUNNING/STOPPED`、状态码、任务状态都用颜色 + 文字双重表达（不只靠颜色）；
- 角标会「呼吸」：待人工 > 0 时导航角标变成琥珀实心并闪一次，把注意力拉过去。

## 六个界面与关键交互

| 界面 | 关键交互 |
| --- | --- |
| **MOCK 管理** | 注册端口（IP 下拉本机网卡或手填、端口范围/占用校验、就近报错）；**生成证书文件**（PEM 可下载、可重签）；**挂载多种平台能力**（6 选 N，可卸载）；**按住启动服务**（按住 1s 才启动）、停止服务后 4.2s 内可撤销；删除端口可撤销 |
| **MOCK 流程** | 审计日志实时追加 + 过滤（全部/成功/异常/待人工）+ 搜索 + 行内展开请求/响应报文 + 重放；**预期响应定制**：HTTP status 下拉、延迟拖拽微调（0–3000ms）、字段表（路径/类型/取值方式/值/*生效规则*）、新增删除字段；规则五选：**自增 / 单次生效 / 条件**（含等于、包含、非空、末尾为偶数）/ 固定 / 随机；**插入人机交互**（人工确认 / 验证码 / 人工闸门），日志里可放行或拒绝 |
| **网元管理** | 属性/架构/类型/厂商/版本/软件名称/旧版本；升级流程步骤可增删上下移，类型选「人工」自动挂人机交互；**执行参数校验**（规则列表 + 就近结果）；**网元成组**、**复制网元**（编号顺延、可撤销） |
| **网元管理平台** | 受管网元与网元组清单；账号管理（角色、授权网元多选、启停开关）；**创建一体化升级任务并关联站点**；任务推进到人工步骤会停下来喊人（可一键放行） |
| **生命周期平台** | 软件包登记（类型/所属网元/厂商/版本/大小）+ 走校验（MD5/签名/依赖）+ 移除可撤销；受管网元；**与网元管理平台共部署**开关（切换后端点复用说明同步变化） |
| **虚层管理平台** | 平台版本（含回滚点）；CPU 配额（拖拽 + −2/+2 + 液面读数）；主副站点选择（互斥保护：不能把主站设为副站）；升级流程 4 步推进/重置；软件包校验流程 4 项逐项执行 |

## 用到的微交互原语（9 个，均来自 `_shared/micro.js`）

| 原语 | 本版落点 |
| --- | --- |
| `holdConfirm` | 按住 1 秒启动 MOCK 服务（不可轻率触发的动作） |
| `fuseButton` | 停止服务、删除端口（完成后带引信，窗口内可撤销） |
| `velocitySwitch` | 账号启停、共部署开关（速度驱动挤压形变） |
| `gauge` | 升级进度、CPU 占最大配额（惯性液面） |
| `statusMark` | 证书状态、校验结果、软件包校验项（环→弧→勾/叹号） |
| `scrub` | 响应延迟 ms、虚层 CPU 核数（拖拽 + 超界橡皮筋 + 方向键） |
| `toast` | 所有动作反馈；复制网元/删除端口/移除软件包带「撤销」 |
| `segmented` | 日志过滤（全部/成功/异常/待人工） |
| `latticeLoader` | 参数校验、软件包校验、校验项执行中（格点波动 + 实时计时） |

> 另：`rippleLoader`（菱形涟漪）、`magnetic`、`spotlight` 在本版留白，未强行使用——
> 菱形母题与磁吸/光斑更属于 V2/V3 的气质（见 `_shared/README.md` 的分工建议）。

## 动效清单

| 场景 | 动效 | 出处 |
| --- | --- | --- |
| 切换界面 | `iris()` 光圈从被点的导航项位置展开 + 面板 `stagger()` 交错入场 | design-systems/Overture 的「光圈开幕」 |
| 首次进入某界面 | `develop()` 显影（模糊+低对比 → 清晰） | Overture 的「显影」 |
| KPI 数字 | `countUp()` 620ms 滚动 | — |
| 新日志行 | CSS `rowin`：从琥珀高亮滑入 500ms | — |
| 端口/服务/证书状态 | `statusMark` 三段形变；`fuseButton` 引信倒计时 | react-bits Micro 范式 |
| 背景 | 扫描线 + 网格 + 双光斑，`prefers-reduced-motion` 下只画一帧静帧 | Shaders 效果目录 |
| 反馈音 | `MP.sfx` 合成音（默认关闭，右上角 SFX 开关） | design-systems/Lens 的合成音 |

**动效纪律**：进入 150–450ms、退出更快（`--e-in`）；动效只用于表达状态变化与空间连续，
不用来装饰；`prefers-reduced-motion: reduce` 下所有过渡缩到 0.01ms（CSS 与 `MP.motion.reduced` 双保险）。

## 体验细节

- **重画不丢焦点**：`keepFocus()` 在局部重画后恢复焦点与光标位置；
  「编辑预期响应」期间**不整块重画**（`api`/`fields` 事件只更新列表，不打断输入与拖拽）。
- 表单：可见 label + 就近错误（端口范围、占用）+ `aria-describedby`。
- 键盘：`1`–`6` 直接切界面；所有可点元素 `:focus-visible` 有 2px 琥珀描边；
  `scrub` 支持方向键，开关支持空格/回车。
- 响应式：1400 / 1180（导轨收成图标）/ 860（上下布局）/ 520 四档；
  375px 下六个界面均无横向滚动（宽表格改为容器内横向滚动）。
- 无障碍：状态色都配文字；`role="switch"` + `aria-checked`；`aria-live` 的 toast 区。

## 自检

```bash
cd mock-platform
node _verify/oracle.mjs v1-ops-console      # 功能逐条 + 动效 + 微交互 + 离线 + 语法
node --check v1-ops-console/app.js
```

浏览器实测（Lead 执行，截图见 `_verify/v1/`）：
1. 六个界面逐个打开，控制台除 `favicon.ico` 404 外**无任何报错**；
2. 交互链路实测：注册端口 → 生成证书 → 挂载能力 → 按住启动服务 → 审计日志实时增长；
   参数校验逐条返回（`neId` 命中 `^GNB-[A-Z]{2}-\d{4}$` 通过；`version` 规则 `^[6-9]\.` 会让 5.x 网元告警）；复制网元编号顺延为 `GNB-HZ-0003`；
   手动触发一次请求后 `notes` 显示五条规则的命中说明
   （`data.neId=GNB-HZ-4822[increment]`、`data.token=EXPIRED[once]`、`data.site=杭州主站点[conditional]` …）；
   CPU +2 生效；软件包/校验流程可执行；
3. 375 / 1440 两档视口：`document.scrollWidth == clientWidth`，无横向滚动。

## 文件

- `index.html` —— 骨架（6 个 `data-screen` 段落 + 顶栏/导轨/底栏 + 表单）
- `app.css` —— 设计令牌 + 组件样式 + `mx-*` 微交互样式 + 四档响应式
- `app.js` —— 视图层（订阅 → 按 `evt.type` 局部渲染 → 接线）
- 共享层：`../_shared/{domain,motion,micro,fx}.js`（**三版共用，勿改**）

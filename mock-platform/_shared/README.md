# `_shared/` 共享层接口契约（三版必须遵守）

三版前台共用同一份**数据、规则引擎、动效与微交互**，只在**视觉语言与布局**上分道扬镳。
这样对比才有意义：看到的是同一个平台的同一批数据，差异全部来自设计。

引入顺序（每个变体的 `index.html` 末尾）：

```html
<script src="../_shared/domain.js"></script>   <!-- 必装 -->
<script src="../_shared/motion.js"></script>   <!-- 必装 -->
<script src="../_shared/micro.js"></script>    <!-- 必装 -->
<script src="../_shared/fx.js"></script>       <!-- 可选（要用 canvas 特效时） -->
<script src="./app.js"></script>               <!-- 本变体自己的逻辑 -->
```

---

## 1. `MP` 数据层（domain.js）

### 1.1 状态

```js
MP.state.host      // { hostname, ip, alt, os, agent, uptimeS }
MP.state.ports[]   // { id, ip, port, protocol, tls, cert{cn,status,days,issuedAt,issuer,fingerprint},
                   //   caps[], running, createdAt, note, stats{req,ok,err,rps} }
MP.state.caps[]    // 平台能力：{ id, code, name, version, endpoints, hue }
MP.state.apis[]    // { id, capId, method, path, name, desc, delayMs, status, hits, lastAt,
                   //   fields[], interactions[], enabled }
MP.state.logs[]    // { id, ts, clock, portId, method, path, status, latencyMs, ne, verdict,
                   //   interaction{kind,status,label,owner,timeoutS}|null, req, res{status,body,notes,hit} }
MP.state.nes[]     // { id, name, code, type, arch, vendor, version, softName, group, status, model,
                   //   params{}, oldVersions[], validations[], upgrade[] }
MP.state.groups[]  // { id, name, desc, members[], strategy }
MP.state.accounts[]// { id, name, role, scope[], nes[], createdAt, status }
MP.state.packages[]// { id, name, type, ne, vendor, version, sizeMB, md5, validated, uploadedAt }
MP.state.tasks[]   // { id, name, type, site, neIds[], status, progress, createdAt, owner, steps[] }
MP.state.vlp       // { version, cpu, cpuRange[2], primarySite, secondarySite, volume,
                   //   upgradeFlow[{id,name,kind,state}], checks[{id,name,target,state,detail}] }
MP.state.deploy    // { omp{version,neCount,accountCount,coDeploy,host}, lcmp{version,packageCount,coDeploy,host} }
MP.state.sites[]   // { id, name, role, region, cpu }
MP.state.neTypes / neCodes / arches / vendors / softTypes / fieldTypes  // 下拉数据源
MP.state.ui        // { screen, theme, selectedPort, selectedApi, logFilter, logQuery, running }
```

### 1.2 订阅

```js
const off = MP.subscribe((state, evt) => { /* evt.type 见下 */ });
```

`evt.type` 取值：`screen` `ports` `cert` `caps` `service` `select-port` `select-api`
`log-filter` `log-query` `api` `fields` `interactions` `log` `interaction-resolved`
`ne` `group` `upgrade` `validation` `validation-run` `account` `task` `deploy`
`package` `vlp` `stats`。

> 建议每个变体写一个 `render()`：先按 `evt.type` 判断要不要重画，再局部更新 DOM。
> 最省事的做法是「事件到了就重画当前界面」，但**必须保留输入焦点与滚动位置**，
> 否则用户正在填表单会被打断（这是三版的硬性体验要求）。

### 1.3 动作（全部为同步、可预测）

```js
// 导航 / 选择
MP.actions.setScreen(name)            // 'mock' | 'flow' | 'ne' | 'omp' | 'lcm' | 'vlp'
MP.actions.selectPort(id)  MP.actions.selectApi(id)
MP.actions.setLogFilter('all'|'ok'|'err'|'human')  MP.actions.setLogQuery(q)

// S1 mock 管理
MP.actions.registerPort({ ip, port, protocol, tls, caps[], note }) → port
MP.actions.removePort(id)
MP.actions.generateCert(id, { cn, days, issuer }) → cert
MP.actions.attachCap(portId, capId) / MP.actions.detachCap(portId, capId)
MP.actions.startService(id) / MP.actions.stopService(id)

// S2 mock 流程
MP.actions.updateApi(id, { status, delayMs, name, desc, enabled })
MP.actions.addField(apiId) → field
MP.actions.updateField(apiId, fieldId, { key, type, source, value, options, required, desc, rule:{...} })
MP.actions.removeField(apiId, fieldId)
MP.actions.addInteraction(apiId, 'human-confirm'|'captcha'|'manual-gate')
MP.actions.removeInteraction(apiId, ixId)
MP.actions.triggerApi(apiId) → log        // 手动触发一次，字段规则会真的生效
MP.actions.resolveInteraction(logId, 'approve'|'reject')

// S3 网元管理
MP.actions.addNE({ name, code, type, arch, vendor, version, group }) → ne
MP.actions.updateNE(id, patch)
MP.actions.copyNE(id) → ne                 // 名称自动递增
MP.actions.addGroup({ name, desc, strategy }) / MP.actions.assignGroup(neId, groupId)
MP.actions.addUpgradeStep(neId, { name, kind:'auto'|'manual'|'human', durationS, owner })
MP.actions.moveStep(neId, stepId, +1|-1) / MP.actions.removeStep(neId, stepId)
MP.actions.addValidation(neId, { field, rule, level, message })
MP.actions.runValidation(neId) → [{ field, level, pass, message }]

// S4 网元管理平台
MP.actions.createAccount({ name, role, scope[], nes[] }) → account
MP.actions.toggleAccount(id)
MP.actions.createTask({ name, site, neIds[], owner }) → task
MP.actions.advanceTask(id)                 // 推进；到人工步骤会自动置 waiting-human
MP.actions.toggleCoDeploy('omp'|'lcmp')

// S5 生命周期平台
MP.actions.addPackage({ name, type, ne, vendor, version, sizeMB }) → pkg
MP.actions.validatePackage(id) / MP.actions.removePackage(id)

// S6 虚层管理平台
MP.actions.setCPU(n)  MP.actions.setSite('primary'|'secondary', siteId)
MP.actions.setVlpVersion(v)  MP.actions.runVlpCheck(checkId)
MP.actions.advanceVlpFlow()  MP.actions.resetVlpFlow()
```

### 1.4 选择器

```js
MP.select.port(id?)          // 当前/指定端口
MP.select.api(id?)           // 当前/指定接口
MP.select.apisOfCap(capId)
MP.select.capsOfPort(portId) // → [{ id, name, code, ... }]
MP.select.logsFiltered()     // 已应用 全部/成功/异常/待人工 + 搜索
MP.select.ne(id) / MP.select.group(id)
MP.select.kpis()             // { ports, running, req, ok, err, avgLat, ne, groups,
                             //   accounts, packages, tasks, pendingHuman }
```

### 1.5 规则引擎（定制响应的核心）

字段 `rule.kind` 五种，UI 必须都能配：

| kind | 名称 | 参数 | 效果 |
| --- | --- | --- | --- |
| `fixed` | 固定 | — | 每次同一个值 |
| `increment` | 自增 | `start` `step` `pattern`（`{n:04}` 占位） | 第 n 次命中按步长累加 |
| `once` | 单次生效 | `times` `fallback` | 首次返回设定值，之后兜底 |
| `conditional` | 条件 | `when{key,op,value}` `then` `else` | 按上游字段分派（op：等于/包含/非空/末尾为偶数） |
| `random` | 随机 | 复用 `options` | 从候选里随机取 |

`MP.buildResponse(api)` → `{ body, notes:[{key,value,rule,note}], status, delayMs, hit }`，
`notes[].note` 是给人看的命中说明（**UI 要展示它**，这是"看得到规则在生效"的关键）。

### 1.6 流量模拟器

```js
MP.sim.start(2600); MP.sim.stop();   // 只为 running 的端口造日志，自动走规则与异常分支
```

---

## 2. `MP.motion`（motion.js）

```js
MP.motion.spring({ from, to, stiffness, damping, onUpdate, onDone }) → { to(v), stop() }
MP.motion.iris(el, { origin:'x y', duration, out:false })   // 光圈开幕（触发点为圆心）
MP.motion.develop(el, { duration })                          // 显影：模糊+低对比 → 清晰
MP.motion.countUp(el, to, { duration, format, suffix })       // 数字滚动
MP.motion.stagger(nodes, { each, y, scale, duration })        // 交错入场
MP.motion.carry(fromRect, toEl, { duration })                 // 共享元素连续过渡（FLIP）
MP.motion.reveal(root)                                        // [data-reveal] 滚动入场
MP.motion.stream(el, text, { speed })                         // 打字机
MP.motion.reduced                                             // 只读，跟随系统偏好
MP.sfx.enabled / MP.sfx.toggle(bool) / MP.sfx.play('tick'|'step'|'toggle'|'confirm'|'latch'|'warn'|'iris'|'undo'|'boot')
```

**三版共同的动效硬要求**

1. 界面切换**不能硬切**：至少用一种 spatial continuity（`iris` 光圈从导航项展开 / `carry` 共享元素 / 内容整体 develop + 交错）。
2. 时长 150–400ms 为主（PRTS 的 `--ak-dur-*` 同理），退出比进入快。
3. 数字类指标用 `countUp`；状态变化用 `statusMark` / `gauge`。
4. `prefers-reduced-motion: reduce` 下：所有动效归零，只保留状态可读性。

---

## 3. `MP.micro`（micro.js）

原生实现的微交互原语（**类名前缀统一 `mx-`，各变体自己写样式**）：

| 调用 | 作用 | 用在平台的哪里 |
| --- | --- | --- |
| `MP.micro.holdConfirm(el, {duration, label, doneLabel, onConfirm})` | 按住到满才确认 | 启动 mock 服务、执行升级 |
| `MP.micro.velocitySwitch(el, {checked, onChange, label})` | 速度驱动的挤压开关 | 共部署开关、接口启停、日志跟随 |
| `MP.micro.gauge(el, {value, unit, label})` | 惯性液面读数 | 升级进度、虚层 CPU 占用 |
| `MP.micro.statusMark(el, {state, label})` | 环→弧→勾/叹号 三段形变 | 任务状态、校验结果 |
| `MP.micro.scrub(el, {min,max,step,value,suffix,onChange})` | 拖拽改数值 + 超界橡皮筋 | 响应延迟 ms、CPU 核数 |
| `MP.micro.toast(host, {title,desc,tone,duration,actionLabel,onAction,onUndo})` | 引信倒计时 + 可撤销提示 | 全部动作反馈（撤销复制/删除） |
| `MP.micro.rippleLoader(el, {label})` | 菱形涟漪加载 | 提交类操作 |
| `MP.micro.latticeLoader(el, {label})` | 格点波动 + 实时计时 | 校验/升级进行中 |
| `MP.micro.segmented(root, {items:[{label,value}], value, onChange})` | 橡皮筋分段控件 | 日志过滤、协议选择 |
| `MP.micro.fuseButton(el, {label,doneLabel,undoLabel,undoWindow,onCommit,onUndo})` | 完成后带引信的撤销 | 停止服务、删除端口/软件包 |
| `MP.micro.magnetic(el, {strength})` | 磁吸 | 主行动按钮 |
| `MP.micro.spotlight(el)` | 光斑跟随（写入 `--mx/--my`） | 卡片 |

**要求**：每版至少用到 **8 个**不同原语，且必须出现在语义正确的位置（不是堆砌）。

---

## 4. `MP.fx`（fx.js，可选）

```js
MP.fx.noise(canvas, {amount, scale}) / aurora(canvas, {colors, speed})
MP.fx.mesh(canvas, {colors}) / scanlines(canvas, {gap, alpha})
MP.fx.dots(canvas, {gap, r, wave}) / particles(canvas, {count, color})
MP.fx.sheen(canvas, {alpha})
MP.fx.auto(root)   // 按 <canvas data-fx="aurora" data-fx-colors="#18D1FF,#FFD800" data-fx-static> 自动挂载
```

## 4b. `MP.btn`（button-fx.js）—— 按钮动效层【v4/v5 必装】

把 `ui-ux-pro-max` 技能给出的动效预设落成原语。**原则：只加动，不加装饰**——不改颜色、
不填色块、不加圆角；动效强度靠 `data-fx` 分级，默认 `subtle`。

| 技能依据 | 本模块落点 |
| --- | --- |
| Hover · Subtle：`y:-1`、`opacity:.9`、150ms `power1.out`；位移 <2px | `data-fx="subtle"`（默认） |
| Hover · Standard：`y:-4`、`scale:1.02`、阴影抬升、250ms `power2.out`；配反向补间 | `data-fx="standard"`（或 `.btn--primary`），加 `.is-lifted` 抬升阴影 |
| Hover · Complex：磁吸 `elastic.out(1,0.4)`、钳制 `*0.3`、**一屏 ≤1–2 个** | `data-fx="magnetic"`；超 2 个运行期 `console.warn` |
| 按下立即反馈（等价 `active:scale-95`） | `pointerdown` → `scale(.97)`（transport 为 `.94`）+ 涟漪 + 音效 |
| 抬起弹簧归位（保留速度） | `MP.motion.spring()` 归位，380ms 内落定 |
| 异步 >300ms 必须 loading | `MP.btn.loading(btn, '签发中')` → 返回 `done()`；**最短展示 300ms** 防闪烁，带 `aria-busy` |
| 禁用：降透明 + 改 cursor | 自动监听 `disabled` / `aria-disabled` → `.is-disabled` |
| 只用 transform/opacity，不触发布局 | 全部动效仅 `transform / opacity / box-shadow` |

```js
MP.btn.install();                 // 注入动效样式（只含「动」，不含颜色/字体）
MP.btn.enhance(document);         // 自动增强所有 button / .btn / [role=button]
const done = MP.btn.loading(el, '校验中');   // …异步…; done();
MP.btn.skeleton(host, 3);         // >300ms 的占位骨架，返回移除函数
```

`<button data-fx="none">` 可跳过；`data-ripple="never"` 可关掉单个按钮的涟漪。
`prefers-reduced-motion` 下只保留颜色/透明度反馈，不做位移。


---

## 5. 六个界面必须覆盖的功能（验收清单）

> 这是需求原文的逐条落点，三版都要有，不能少项。缺一项算未完成。

**S1 `mock` Mock 管理**
- [ ] 注册本机 IP + 端口作为 mock 端口（IP 可选本机网卡或手填，端口范围校验）
- [ ] 为映射的 IP/端口**生成证书文件**（CN、有效期、指纹；未签发的要能签发）
- [ ] 给端口**挂载一种或多种平台能力**（6 选 N，可卸载）
- [ ] **开启 mock 服务**（按住确认；可停止；停止后可撤销）

**S2 `flow` Mock 流程**
- [ ] 请求与响应**审计日志**（实时追加、过滤、搜索、展开看报文、重放）
- [ ] **管理每个接口的预期响应**：定制**延迟**与 **HTTP status code**
- [ ] 面向对象地定制响应**每个字段**（部分下拉选、部分手填，可增删字段）
- [ ] 字段级规则：**自增 / 单次生效 / 条件**（+ 固定 / 随机），命中说明可见
- [ ] **插入人机交互**（人工确认 / 验证码 / 人工闸门），并能在日志里放行或拒绝

**S3 `ne` 网元管理**
- [ ] 定制网元**属性、架构、类型**
- [ ] 定制网元**版本、使用软件名称、旧版本**
- [ ] 定制**升级流程步骤**（增删、排序、自动/人工/手动）
- [ ] 定制升级流程中可能的**人机交互**
- [ ] **网元成组**（同组网元）
- [ ] **复制网元**
- [ ] 定制网元的**参数校验**（规则 + 执行结果）

**S4 `omp` 网元管理平台**
- [ ] 定制平台所管理的**网元、网元组**
- [ ] **账号管理**的网元范围
- [ ] **创建账号**
- [ ] 创建**一体化升级任务**并**关联站点**

**S5 `lcm` 生命周期平台**
- [ ] 定制平台管理的**网元**
- [ ] 定制平台管理的**软件包**（类型 / 所属网元 / 厂商 / 版本）
- [ ] 可以**和网元管理平台共部署**（开关 + 端口复用说明）

**S6 `vlp` 虚层管理平台**
- [ ] 定制平台 **CPU 数量**
- [ ] 定制**主副站点**
- [ ] 定制**升级流程详情**
- [ ] 定制**平台版本**
- [ ] 定制**软件包校验流程**

**全局**
- [ ] 6 个界面可切换，切换动效连续（不硬切）
- [ ] 每次动作有反馈（toast / 状态形变 / 音效可选）
- [ ] 键盘可达、focus 可见、`aria-label` 到位
- [ ] 375 / 768 / 1024 / 1440 四档断点不横向滚动
- [ ] `prefers-reduced-motion` 生效
- [ ] 表单：可见 label、就近报错、不因重画丢焦点

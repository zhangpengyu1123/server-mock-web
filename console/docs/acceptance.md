# 验收报告 · RHINE LAB 业务面

> 生成方式：`node console/scripts/verify-all.mjs`（API 层逐条断言）+ 浏览器 UI 走查
> 最近一次运行：**37 / 37 通过**

---

## 一、目标清单 → 实现对照

### MOCK 管理

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 注册本机 IP 和端口作为 mock 端口 | `POST /api/business/endpoints {host,port,capabilities}` | `200 → 127.0.0.1:18443 id=ep-0004` |
| 为映射 IP 生成证书文件 | `POST /endpoints/:id/cert {cn,san}` → CN/SAN/序列号/有效期/PEM | `CN=mock.rhine.local，PEM 389 字节，SAN=mock.rhine.local,127.0.0.1` |
| 挂载一种或多种平台能力 | `capabilities[]`（NEMP / NEF / ALARM / PERF / FM） | `capabilities=NEMP,NEF` |
| 开启 mock 服务 | `PATCH /endpoints/:id {enabled}` | `enabled=true` |

### MOCK 流程

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 请求与响应审计日志 | 环形缓冲（200 条），含 method/path/status/延迟/human/规则 | `13 条，最近 POST /nemp/v1/ne/register → 200` |
| 管理每个接口的预期响应 | `PATCH /mappings/:id/rules` | `POST /nemp/v1/ne/register` |
| 定制延迟与 HTTP status | 每条规则独立 `status` / `delay_ms` | `fast/201/5ms · slow/200/600ms · fail/500/12ms · 兜底/200/45ms` |
| 面向对象管理响应字段（部分下拉、部分手填） | `fields[]`：字段名（手填）+ 类型（下拉）+ 行为（下拉）+ 值 | `sessionId(autoIncrement), onceToken(once), accepted(condition)` |
| 字段行为：自增 / 单次生效 / 条件 | `source = autoIncrement \| once \| condition` | 自增实测 `sessionId 11 → 13`；条件实测 `accepted` 在 fast 时为 true |
| 可插入人机交互 | `human{prompt,options,state}`；命中时返回 202 + `x-rhine-human: pending` | `202 · prompt="确认上报该告警？" · 选项 3 个` |

### 网元管理

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 定制属性 / 架构 / 类型 | `arch`（SA/NSA/CU-DU/EPC）、`kind`（gNB/MME/UPF/AMF/SMF） | `gNB-HZ-0904: arch=SA kind=gNB` |
| 定制版本 / 软件名称 / 旧版本 | `version` / `software` / `prev_versions[]` | `v5.2.1 · NR-RAN · 旧版本 5.1.9,5.1.4` |
| 定制升级流程步骤 | `flow[]`（默认 5 步） | `上传软件包 → 预检查 → 激活⟂ → 主备倒换⟂ → 完成与回执` |
| 流程中的人机交互 | 每步 `human: bool` | `2 步需要人工确认` |
| 定制参数校验 | `checks[]`（字段 / 规则 / 错误信息） | `2 条校验规则` |
| 网元成组 | `groups[].element_ids` | `杭州 gNB 组(2) · 杭州 核心网组(1)` |
| 复制网元 | `POST /elements/:id/copy` | `ne-0004 → ne-0005（gNB-HZ-0999-copy）` |

### OMC 平台

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 定制平台所管理的网元 | `platform.omc_elements[]`（点选写回） | `2 个网元` |
| 定制平台所管理的网元组 | `platform.omc_groups[]` | `g-hz-01` |
| 定制账号管理的网元 | `accounts[].scope[]`（行内点选 → 保存） | `omc-ops[运维]→1 网元 · omc-view[只读]→2 网元` |
| 创建账号 | `PATCH /platform {accounts}` | `新增 verify-bot（只读，范围 ne-0001）` |
| 创建一体化升级任务并关联站点 | `POST /tasks {site,element_ids,from_version,to_version}` | `UPG-0091 · 站点 site-hz · 5 段 · 起始 20%` |

### LCM 平台

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 定制平台管理的网元 | 网元当前版本 / 旧版本表 + 「软件包」预填 | 见 LCM 页左列 |
| 软件包四要素（类型 / 所属网元 / 厂商 / 版本） | `packages[]`：`kind / owner / vendor / version` | `网元软件包 · ne-0001 · 华为 · v5.2.1` |
| 可与 OMC 共部署 | `platform.co_deploy` | `co_deploy=true` |
| （联动）包一键生成升级任务 | `POST /packages/:id/upgrade` | `UPG-0182 · 5.2.1 → 5.2.1` |

### FS 虚层

| 目标要求 | 实现 | 实测证据 |
|---|---|---|
| 定制 CPU 数量 | `platform.fs.cpus`，可改可存 | `16 vCPU`；写回实测 `16 → 40` |
| 定制主副站点 | `fs.site_primary / site_secondary` | `主 HZ 主站点 / 备 NB 备站点` |
| 定制升级流程详情 | `fs.upgrade_steps[]`（可增删改） | `6 步：挂载安装镜像 → 预检查 → 停业务 → 安装 → 启动自检 → 主备切换验证` |
| 定制平台版本 | `fs.version` | `v2.4.0` |
| 定制软件包校验流程 | `fs.verify_steps[]` + 可执行 `POST /platform/fs/verify` | `4 步：checksum → 签名 → 版本兼容 → 主备一致性`，执行 `4 PASS / 0 FAIL` |

---

## 二、任务时间线（升级闭环）

| 能力 | 实测 |
|---|---|
| 自动推进 | 无人工阶段每 3s 推进，`20% → 60%` |
| 人工门拦截 | `HUMAN · PENDING`，三选项带 `EFFECT · continue / hold / abort` |
| 超时挂起 | 60s 未确认 → `HUMAN · EXPIRED · 超时 60s`，阶段 `已挂起（等人确认）` |
| 重新发起 | 「重新发起确认」→ 回到 pending |
| 一键演示 | 「▶ 演示一次完整升级」→ 约 25s 跑到 `100%`，5 段全 `已完成` |

---

## 三、界面与形态

| 项 | 证据 |
|---|---|
| 九块工作台 | 逐页走查：MOCK 管理(3 卡) / MOCK 流程(3) / 运行审计(5) / 网元自定义(2) / 拓扑(2) / 人机交互(3) / OMC(2) / LCM(2) / FS(4)，零 JS 报错 |
| 两层 IA | 顶部 `LAYER 1 运行态 ⇄ LAYER 2 准备态`，中间 `定义 ↓ 执行` |
| 拓扑三视角 | 站点/网元 · 网元组 · 组件级；2D 正交 / 3D 资产；单资产 `topo_all.glb`（503 KB，1 次请求） |
| 方向语义 | 流光单向 父→子（采样 t: 0.41→0.60→0.79→0.98），中点箭头 |
| 选中联动 | 邻接保持不透明、其余 60%；命中链路琥珀加亮，其余流光点隐藏 |
| 桌面壳 | 无边框 + 自绘 `— □ ×`；`is-tauri=true`、拖动区存在、close 后进程退出 |
| 浏览器模式 | 桌面控件隐藏，保留「退出」按钮 |

---

## 四、数据与文档

| 项 | 状态 |
|---|---|
| 种子数据 | 1 端点 / 3 网元（各 5 步流程、2 步人工）/ 2 组 / 3 包 / 4 映射 / 0 任务 |
| 三套教学场景 | baseline / co-deploy / fault-drill（各 9 KB 左右，均带演示规则） |
| 导出导入 | `GET /api/business/export` / `POST /api/business/import` |
| 文档 | `demo-script.md`（11 幕 + 16 图）· `business-plane-manual.md` · `visual-spec.md` · 本报告 |
| 便携包 | `dist/rhine-mock-console-1.0.0/`（34.6 MB）+ zip（17.9 MB） |

---

## 五、复跑方式

```powershell
.\start-demo.ps1 -NoBrowser          # 起 9600/9601
node console/scripts/seed-demo-rules.mjs   # 造演示规则与审计
node console/scripts/verify-all.mjs        # 37 项断言
node console/scripts/clean-scene.mjs       # 回归后清理测试数据
```

期望输出末行：`37/37 通过 ✅`

---

## 六、已知边界

| 项 | 说明 |
|---|---|
| 证书 | 演示用自签信息（CN/SAN/序列号/PEM 文本），不做真实 TLS 握手 |
| mock 引擎 | 单进程内存映射 + JSON 持久化，不做多实例一致性 |
| 暗色主题 | 未实现（业务面定位为单一浅色档案纸） |
| 安装包 | 未出 MSI/NSIS（离线环境缺 `tauri-cli`），提供便携目录 + zip |
| 拓扑性能 | 单资产 + 缓存已足够；未做实例化/LOD |

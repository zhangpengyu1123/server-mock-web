# RHINE LAB · MOCK 平台

面向**电信网元生命周期**的可交互仿真平台。核心理念是「有机响应」：

> **下面定义"应该发生什么"，上面验证"实际发生了什么"，中间由人机交互把它们咬合起来。**

- 设计语言对齐 [RhineLabUI](https://github.com/LBEILC/RhineLabUI)：米白档案纸 + 黑墨细线 + 琥珀信号色
- 拓扑资产用 Blender 制作（站点平台 / 网元组托板 / 网元立卡 / 五种组件芯片）
- 前后端零构建：Rust + axum 后端，原生 ES Module 前端，无打包工具

---

## 快速开始

```powershell
# 1) 编译后端（首次）
cd console; cargo build --offline

# 2) 一键启动（起 9600/9601 并打开业务面）
cd ..
.\start-demo.ps1
```

| 入口 | 地址 | 凭据 |
|---|---|---|
| L 端（业务面） | http://127.0.0.1:9600/business/plane.html | `admin / rhine-admin-2026` |
| W 端（免登录） | http://127.0.0.1:9601/business/plane.html | — |
| 管理面看板 | http://127.0.0.1:9600/business/index.html | 同 L 端 |

也可以用便携版：`node console/assets/make-dist.mjs` → `dist/rhine-mock-console-1.0.0/启动.cmd`。
桌面应用：`console/desktop/business/target/debug/rhine-desktop-business.exe`（Tauri 2 + WebView2）。

---

## 两层结构（不是六个平级平台）

```
LAYER 1 · 运行态            端口在跑、请求在流动
  MOCK 管理   注册监听 → 签发证书 → 挂载能力 → 开启服务
  MOCK 流程   规则编辑器（字段行为 / 多规则 / 人机门）+ 运行审计
  运行审计    真实请求流水、状态码分布、延迟图、接口健康度、202 一键放行
        ▲ 执行
        │ 定义
LAYER 2 · 准备态            网元与拓扑、平台能力
  网元自定义  属性/架构/类型/版本/软件/组件；升级流程与参数校核可编辑
  拓扑连接    站点 → 网元组 → 网元 → 组件，2D 正交 / 3D 资产双视角
  人机交互    状态机（状态 + 操作结果）→ 驱动真实任务的人工确认选项
  OMC 平台    纳管网元/组、站点、账号授权范围、一体化升级任务
  LCM 平台    版本管理、软件包仓库、与 OMC 共部署、一键生成升级任务
  FS 虚层     CPU/主备站点/平台版本、可执行的软件包校验流程
```

---

## 核心闭环

```
MOCK 端点 ──→ /mock/* 引擎 ──→ 响应（多规则 + 字段行为 + 延迟 + 状态码）
                    │                 └─ 人机门 202 → 审计页确认 → 200
                    └─→ 运行审计（环形缓冲 200 条）

网元（属性/版本/流程/校验/组件/分组）
   ├─→ 拓扑 2D/3D（数据驱动）
   └─→ 网元组 → OMC 纳管 → 一体化升级任务

人机交互模板（状态 + 操作结果）──→ 任务人工确认的选项

LCM 软件包（归属网元 + 版本）──→ 升级任务（from=网元当前版本, to=包版本）
                                    └─→ 时间线：自动推进 / 人工门拦截 / 超时挂起 / 重发

FS：平台版本 + 校验流程（可执行，失败即中断）
```

升级任务时间线的三种节奏：

| 阶段类型 | 行为 |
|---|---|
| 无人工 | 服务端 3s 一拍自动推进 |
| 有人工 | 停下等确认；`continue` 推进 / `hold` 挂起 / `abort` 失败 |
| 超时未确认 | `EXPIRED` + 阶段挂起，可一键「重新发起确认」 |

---

## 目录结构

```
.
├─ start-demo.ps1 / .cmd          一键启动（幂等，端口已在监听则跳过）
├─ console/
│  ├─ crates/core/               模型与存储（Persisted JSON）
│  ├─ apps/agent/                后端：业务面 API + mock 引擎 + 自动推进定时器
│  ├─ ui/
│  │  ├─ business/               ★ 业务面（plane.html / plane.js / plane.css / plane-topo3d.js）
│  │  │  ├─ assets/topo_all.glb  Blender 合并资产（503 KB，8 个对象）
│  │  │  └─ scenes/              三套教学场景（基线 / 共部署 / 故障演练）
│  │  ├─ admin/                  管理面（独立产品，3D 机架等）
│  │  └─ shared/                 公共样式与 API 封装
│  ├─ desktop/business/          Tauri 2 桌面壳（内嵌 ui，连本机 9601）
│  ├─ docs/                      演示手册 + 逐幕脚本 + 16 张截图
│  ├─ assets/blender/            Blender 生成脚本（拓扑资产源头）
│  └─ data/                      运行数据（agent.json / local.json）
└─ dist/                         便携发行包产物（gitignore）
```

---

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Rust 2021 · axum 0.7 · tokio · serde（无数据库，JSON 持久化） |
| 前端 | 原生 ES Module / IIFE，importmap 引 three.js，无打包器 |
| 3D | three.js r1xx + Blender 4.5 导出 GLB（程序生成几何，零贴图） |
| 桌面 | Tauri 2 + WebView2 |
| 文档 | Markdown + 截图归档 |

编译：`cargo build --offline`（全部依赖已在本地 registry 缓存，可离线构建）。

---

## 文档

| 文件 | 内容 |
|---|---|
| [console/docs/demo-script.md](console/docs/demo-script.md) | **逐幕演示脚本**（11 幕：操作 / 看点 / 台词 / 验证命令 + 截图） |
| [console/docs/business-plane-manual.md](console/docs/business-plane-manual.md) | 业务面手册：启动、九块工作台、接口、场景库、便携版 |

---

## 演示数据

页面内「MOCK 管理 → 场景快照」可一键载入：

| 场景 | 说明 |
|---|---|
| 基线：单站点三网元 | 标准演示起点 |
| 双站点共部署 | CPU 32、共部署开启、版本 5.3.0 待升级 |
| 故障演练 | 注入 500 规则 + 400ms 慢兜底 + 15s 人工确认超时 |

支持 `↓ 导出场景` 存 JSON，在另一台机器 `↑ 导入场景` 1:1 复现。

---

## 已验证的关键路径

- 浏览器（9600 / 9601）与桌面壳（WebView2）双端加载同一套 UI，数据走真实 API
- MOCK 引擎：多规则命中 `201/500/200`、延迟覆盖、`x-rhine-rule` 头、202 人机门
- 升级任务：自动推进 `20% → 60%`、人工门拦截、60s 超时 `EXPIRED` + 重发回 `pending`、一键演示跑满 100%
- 拓扑：单个 GLB 一次请求、三层视角切换、点选高亮、双击下钻、卡面铭牌
- FS 校验：`checksum → 签名 → 兼容性 → 主备一致性`，失败即中断

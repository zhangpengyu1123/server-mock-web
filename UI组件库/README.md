# UI组件库 · 本地落地版

目标：把你提到的 5 个东西**真正拿到本地**，按目录分别存放，可离线打开、可运行、可核对。
不是链接收藏夹——每一项都是完整克隆 / 渲染快照 + 验证记录。

## 一、这 5 个东西是什么、从哪来

前两个来自你在 [time.jamecling.com](https://time.jamecling.com) 上看到的文章（原页面已存档，见
[`_来源网页/`](_来源网页)），后三个是你给的链接：

| # | 名称 | 来源 | 类型 | 许可 |
| --- | --- | --- | --- | --- |
| 01 | **Shaders** | <https://github.com/shader-effects-inc/shaders> · 官网 <https://shaders.com> | 开源 WebGPU 组件库（React/Vue/Svelte/Solid/JS） | MIT |
| 02 | **Micro**（React Bits 的微交互分类） | <https://github.com/DavidHDev/react-bits> · <https://reactbits.dev/c/micro> | React 微交互组件分类（含全库 216 个免费组件） | MIT + Commons Clause v1.0 |
| 03 | **oil-ui** | <https://github.com/oil-oil/oil-ui> · <https://ui.oiloil.org> | 给 AI Agent 用的 UI 设计 Skill | MIT |
| 04 | **design-systems**（一次曝光） | <https://github.com/ruiqichenbiec/design-systems> · <https://ruiqichenbiec.github.io/design-systems/> | 三套原生 Web 设计体系（Lens/Lattice/Overture，78 组件） | MIT |
| 05 | **onetake** | <https://github.com/feitangyuan/onetake> · <https://onetakemotion.com> | 做「一镜到底」动效短片的 Agent Skill | PolyForm Noncommercial 1.0.0（**非商用**） |
| 06 | **rhinelab-blog-theme**（莱茵生命博客主题 + 三维档案终端） | <https://github.com/JesseLee-CN/rhinelab-blog-theme> | Markdown + Git 静态博客模板，含 `/lab/` 三维档案终端（脱敏开源版） | MIT |
| 07 | **Rhine-Music-Demo**（莱茵生命音乐台） | <https://github.com/RonaldDeng/Rhine-Music-Demo> | 基于上游的本地音乐播放器：三维专辑卡阵列 + 本地播放 + AI 专辑介绍工作流 | MIT |
| 08 | **RhineLabUI**（上游原作，**这套设计语言的源头**） | <https://github.com/LBEILC/RhineLabUI> · 官网 <https://rhine.lubeiluchen.cc/> | TypeScript + Three.js 的「莱茵生命档案终端」：玻璃档案阵列、解密揭示、Rolling Number | MIT |

> 06/07 都基于 08。**三者的色板与排字规则完全一致**（暖灰白 `#e8e5e1` + 近黑 `#080a08` + 暖杏金 `#a67d48`），
> 所以我把这套语言提取成了一份共享规范：[`mock-platform/_shared/RHINELAB-DESIGN-LANGUAGE.md`](../mock-platform/_shared/RHINELAB-DESIGN-LANGUAGE.md)
> （色值是从三个仓库的 CSS/TS 里做频次统计得出来的，不是估的）。V4/V5 两版新前台按它施工。

来源文章存档（`_来源网页/`）：

- 《Shaders 开源 WebGPU 组件库：200 多个特效免费导出任意框架代码》— <https://time.jamecling.com/bookmark-shaders>
- 《Micro 微交互组件库上线，30 个免费 React 动效组件下载使用教程》— <https://time.jamecling.com/bookmark-micro>

## 二、目录结构

```
UI组件库/
├─ 01-Shaders-WebGPU/        Shaders 完整克隆 + 官网快照 + _本地说明.md
├─ 02-Micro-ReactBits/       react-bits 完整克隆 + Micro 独立副本 + 清单 + 可运行 demo + 快照
│   ├─ _micro-only/Micro/    34 个 Micro 组件（jsx + css，原样复制）
│   ├─ _micro-demo/          Vite + React 19 本地运行验证（13 个组件）
│   ├─ _micro清单.md/json    逐组件清单 + 依赖速查
│   └─ _live-site/
├─ 03-oil-ui/                oil-ui 完整克隆 + 官网快照
├─ 04-design-systems/        完整克隆 + 官网快照 + _local-run/（本机跑起来的截图）
├─ 05-onetake/               完整克隆（含 12 支成片 mp4）+ 官网快照
├─ _来源网页/                 time.jamecling.com 两篇原文的 HTML + 纯文本存档
├─ _tools/                   可复现脚本（盘点 / 归档来源 / 抽取 Micro 清单）
├─ _inventory.json           全部落地的机器可读盘点结果
└─ README.md                 本文件
```

说明：每个项目目录里，`_` 开头的文件/目录都是**本工具包新增的归档物**（说明、快照、demo），
仓库本体一律未改动；`git status --untracked-files=no` 全部干净（即与上游 commit 完全一致）。

## 三、落地与验证结果

| # | 目录 | commit | 体积 / 文件数 | 怎么验证的 |
| --- | --- | --- | --- | --- |
| 01 | `01-Shaders-WebGPU` | `81fd4ec`（2026-10-09，v4.0.4） | 17.5 MB / 1222 | `packages/core/src/shaders/` 下**正好 200 个**着色器组件目录（402 文件）；含 React/Vue/Svelte/Solid/JS 五个入口包与官方 Agent Skill |
| 02 | `02-Micro-ReactBits` | `43591e8b`（2026-10-15） | 374 MB / 7734 | `src/content/Micro/` 34 个组件与线上 llms.txt 的 34 条**一一对应**；`_micro-demo` 已 `npm install` + `vite build` 成功（6485 modules）并在浏览器渲染出 13 个组件 |
| 03 | `03-oil-ui` | `1640b36`（2026-10-15） | 3.3 MB / 42 | `SKILL.md`（version 0.23.2）+ 11 篇 references + 生成器/截图脚本 + 4 个测试齐全 |
| 04 | `04-design-systems` | `7a424c9`（2026-10-04） | 128.5 MB / 572 | **本机实测**：`node serve.mjs` → 打开 `http://127.0.0.1:4300/`，首页与 Lens 完整展示正常渲染（截图见 `_local-run/`） |
| 05 | `05-onetake` | `4157581`（2026-10-12） | 101.8 MB / 113 | `cases/` 下 12 个案例目录含渲染好的 `.mp4`（合计约 78 MB），可直接播放；`scripts/verify_promo.py` 等工具齐全 |
| 06 | `06-RhineLab-Blog-Theme` | `6f1e5b0`（2026-10-06） | 83.9 MB / 1149 | 含 `/lab/` 三维档案终端入口与共享层（`shared/content.ts`、`shared/client.ts`）；已提取其色板与动效数值到设计语言文档 |
| 07 | `07-Rhine-Music-Demo` | `a889801`（2026-10-13） | 48.4 MB / 315 | `DESIGN.md`（40 KB）是完整设计基线；`src/music-*.css` 给出晨雾/月影双主题、transport 与刻度尺导航的实现 |
| 08 | `08-RhineLabUI-上游` | `12cc5e4`（2026-10-08） | 138.3 MB / 1225 | `DESIGN.md`（183 行）+ `AGENTS.md` 是这套设计语言的规范原文；`src/` 含档案阵列、解密揭示、Rolling Number 的实现 |

（体积/文件数按 `_inventory.json` 实测，不含 `.git`，但含本包新增的说明、快照、demo 等归档物。）

合计约 **625 MB**（工作区，不含 `.git`）；连 `.git` 历史一起算，整个 `UI组件库/` 约 **1.15 GB / 9834 个文件**。

## 四、怎么离线用

```bash
# 04 design-systems：仓库自带服务器（已验证）
cd 04-design-systems && node serve.mjs      # → http://127.0.0.1:4300/

# 02 Micro：跑本地验证 demo（需要 npm install）
cd 02-Micro-ReactBits/_micro-demo
npm install && npm run dev                  # 或 npm run build && npm run preview

# 02 Micro：零依赖离线打开已构建好的 demo（dist 已随包保留）
node _tools/serve.mjs 02-Micro-ReactBits/_micro-demo/dist 4400   # → http://127.0.0.1:4400/

# 02 Micro：直接取单个组件（复制两文件 + 装依赖）
#   _micro-only/Micro/HoldButton/{HoldButton.jsx,HoldButton.css}
#   依赖速查见 02-Micro-ReactBits/_micro清单.md 末尾

# 01 Shaders：当依赖用最省事
npm install shaders    # import { Shader, CursorTrail } from 'shaders/react'
#   源码构建：cd 01-Shaders-WebGPU && pnpm install && pnpm run lib:build

# 05 onetake：先看片
#   05-onetake/cases/onetake-launch-30s/onetake-launch.mp4 等 12 支
```

每个项目各自的细节（内容清单、运行方式、许可注意事项、核对信息）都在对应目录的
`_本地说明.md` 里。

## 五、网页快照说明（重要）

5 个项目里，**只有 design-systems 本身就是一个纯静态网站**，克隆下来即可直接跑起来；
其余 4 个的官网（shaders.com / reactbits.dev / ui.oiloil.org / onetakemotion.com）是
线上服务，本项目对它们做的是**渲染快照存档**：`*/_live-site/*.html` +
全页截图 `*.png`。

快照的作用是「留存当时的页面外观与文字」作为证据，**不是可离线独立运行的副本**
（HTML 里的 JS/CSS 依赖线上域名）。要离线可用，用对应仓库本体。

## 六、注意事项

- **许可差异**：01/03/04 是标准 MIT；02 是 **MIT + Commons Clause**（可商用，但不得转售/再分发组件本身）；
  05 是 **PolyForm Noncommercial**（仅非商用）——商用前务必读 `LICENSE`。
- **Node 版本**：Shaders 仓库声明 `engines: node 22.20.x` + `pnpm 10`；本机若为更高版本，
  `pnpm install` 可能报 engines 警告。
- **网络**：`02-Micro-ReactBits/_micro-demo` 首次运行需要 `npm install`（react/motion/hugeicons）；
  design-systems 零依赖，`node serve.mjs` 即可。
- **体积**：02 与 05、04 体积较大（媒体资源多），备份时按需取舍。

## 七、复现 / 校验

```bash
# 重新拉取（与本地一致）
git clone https://github.com/shader-effects-inc/shaders        01-Shaders-WebGPU
git clone https://github.com/DavidHDev/react-bits              02-Micro-ReactBits
git clone https://github.com/oil-oil/oil-ui                    03-oil-ui
git clone https://github.com/ruiqichenbiec/design-systems      04-design-systems
git clone https://github.com/feitangyuan/onetake               05-onetake

# 盘点本地落地情况（commit / 体积 / 文件数 / 许可）
node _tools/inventory.mjs

# 重新归档来源网页
node _tools/archive-source-pages.mjs

# 重新抽取 Micro 清单（会联网核对线上 llms.txt）
node _tools/extract-micro.mjs
```

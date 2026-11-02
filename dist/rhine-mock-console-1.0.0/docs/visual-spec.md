# 视觉基准 · 与 RhineLabUI 的 token 对齐

> 本文件记录业务面配色/排版基准，以及**逐项对照上游仓库**的结果。
> 上游：`LBEILC/RhineLabUI`（本地检出：`../_ref/RhineLabUI`）

## 1. 调色板逐项对照

上游 token 定义在 `src/theme-ui.ts` 的 `palette` 常量（明/暗两套）：

```ts
ink:   ["#080a08", "#e0e3dc"]
muted: ["#77756d", "#a6b0b1"]
line:  ["#aaa59a", "#536166"]
paper: ["#eae5e1", "#11181b"]
panel: ["#edebe4", "#202a2f"]
field: ["#e7e3d9", "#2a363b"]
accent:["#9b7247", "#c5a16b"]
```

业务面（`console/ui/business/plane.css`）当前取值：

| 用途 | 变量 | 值 | 上游对应 | 状态 |
|---|---|---|---|---|
| 正文/墨色 | `--ink` | `#080a08` | `ink[0]` | ✅ 完全一致 |
| 辅助文字 | `--ink-2` | `#77756d` | `muted[0]` | ✅ 完全一致 |
| 弱化文字 | `--ink-3` | `#9a978e` | `muted` 与 `line` 之间 | 派生（用于三级信息） |
| 细线 | `--line` | `#aaa59a` | `line[0]` | ✅ 完全一致 |
| 次细线 | `--line-2` | `#bdb8ad` | 上游 `theme.css` 的分隔线 | ✅ 一致 |
| 纸面 | `--paper` | `#eae5e1` | `paper[0]` | ✅ 完全一致 |
| 纸面（次） | `--paper-2` | `#e7e3d9` | `field[0]` | ✅ 完全一致 |
| 卡片面板 | `--panel` | `#edebe4` | `panel[0]` | ✅ 一致 |
| 琥珀信号 | `--signal` | `#9b7247` | `accent[0]` | ✅ 完全一致 |
| 沙色（拓扑铭牌底） | `--sand` | `#c1b8a7` | 无直接对应 | 自有（3D 材质需要） |
| 危险/失败 | `--danger` | `#7d2f22` | 无直接对应 | 自有（错误状态语义） |

调整前 → 后（2026-11-03）：

```
--ink     #171713              → #080a08   更纯的黑，标题对比更强
--ink-2   rgba(23,23,19,.62)   → #77756d   由半透明改为实色暖灰（与上游一致，小字号更清晰）
--ink-3   rgba(23,23,19,.40)   → #9a978e   同上
--line    rgba(23,23,19,.16)   → #aaa59a   由 A 字头浅线改为实色细线（与上游一致）
--line-2  rgba(23,23,19,.28)   → #bdb8ad
--signal  #a67d48              → #9b7247   琥珀略偏暖、更沉
```

## 2. 为什么把半透明改成实色

上游所有线条/辅助文字都是**实色**（`#aaa59a` / `#77756d`），不是 `rgba(ink, α)`。
在浅色纸面上两者的观感差别在于：

- 半透明线叠在纸面 `#eae5e1` 上 ≈ `#d0cfce`，比上游**轻一档**，卡片边界偏弱
- 半透明辅助文字叠在纸面上 ≈ `#6f6f6b`，但小字号下抗锯齿更糊

改成实色后，卡片轮廓、表格分隔线、列标题的清晰度与上游一致。

## 3. 排版基准（沿用，未改）

| 元素 | 规格 |
|---|---|
| 正文 | 13px / 1.65 |
| 页标题 `h1` | 19px，字重 500，`letter-spacing .01em` |
| 区块标题（卡片标题） | 10.5px，`letter-spacing .18em`，全大写或中文加宽 |
| 表格 | 11.5px，单元格 padding 9px，表头 `letter-spacing .16em` |
| 左侧导航 | 12.5px |
| 等宽字体 | `JetBrains Mono` → Consolas 兜底（编号、路径、时间戳一律等宽） |
| 档案号（右上） | 9px，`letter-spacing .22em`，`FILE NO. XXX-000` |

## 4. 纹理与动效

- 全局 SVG 噪点颗粒（`body.pl::after`），与上游「颗粒 20%、尺寸 20%、12Hz」同源思路
- 琥珀流光：`@keyframes rhineFlow` 虚线位移（2D 连线）、3D 连线上的单向流动光点 + 中点箭头（父 → 子）
- 加载骨架：`TO P O L O G Y  L O A D I N G` + `@keyframes rhineLoad`

## 5. 与上游的差异（有意保留）

| 项 | 上游 | 本业务面 | 原因 |
|---|---|---|---|
| 暗色主题 | 有（`[data-dark-surface]`） | 无 | 业务面定位为"档案纸"单一浅色，避免讲课切主题分心 |
| 3D 场景 | 玻璃档案阵列 | 网元拓扑（站点/组/网元/组件） | 领域不同 |
| 字体 | 自带 woff2（`fonts.css` 574 KB） | 系统字体 | 便携包体积；等宽用 JetBrains Mono/Consolas |
| 动效系统 | 景深曲面 + 全局滤镜 | 不做 | 业务表格信息密度高，滤镜会影响可读性 |

## 6. 复核方式

```powershell
# 取实际计算值
node -e "console.log(getComputedStyle(document.documentElement).getPropertyValue('--ink'))"
```

或直接看 `console/docs/img/01-mock-admin.png`（MOCK 管理）与 `03-audit-charts.png`（运行审计）。

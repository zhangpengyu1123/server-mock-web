import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/README.md';
let s = readFileSync(P, 'utf8');
const add = [
  '',
  '---',
  '',
  '## 十、R5：三套配色可切（暖纸 / 纯白 / 蓝黑）',
  '',
  '用户原话：*"三种界面颜色风格：当前的尼尔风格，还有 v7 的纯白风格，再新增一种是 Codex 那种蓝黑色专业风，然后可以切换。"*',
  '',
  '### 10.1 做法：先把颜色彻底 token 化，再换皮',
  '',
  '换主题最容易翻车的地方是**硬编码色残留**（白底上留一块深色块，或者深底上留一段黑字）。所以顺序是：',
  '',
  '1. **清点**：`app.css` 里有 **62 处** `rgba(42, 41, 35, …)`（都是"墨色 + 透明度"），另有页签底、边框、舞台底、启动屏底等 6 处裸 hex。',
  '2. **token 化**：`rgba(42,41,35,…)` → `rgba(var(--ink-rgb),…)`；裸 hex → `--tab / --tab-hi / --charcoal-bd / --void / --boot-bg / --key-bg`。',
  '   改完 `rgba(42, 41, 35` 计数为 **0**。',
  '3. **三套变量组**（`html[data-theme]`，`:root` 即暖纸）：',
  '',
  '| 主题 | 底 | 面板 | 主行动 | 强调 | 说明 |',
  '| --- | --- | --- | --- | --- | --- |',
  '| `nier` 暖纸 | `#c8c3ac` | `#ccc7af` | `#3e3c34` | `#8c3a2e` | 参考图取色，默认 |',
  '| `white` 纯白 | `#fafafa` | `#ffffff` | `#18181b` | `#0b63f6` | v7 瑞士：白底 + 近黑 + 信号蓝 |',
  '| `codex` 蓝黑 | `#0d1117` | `#161b22` | `#1158c7` | `#58a6ff` | GitHub 深色系；主色压深到对比度 6.4:1 |',
  '',
  '深色主题额外处理了三件小东西：颗粒层 `mix-blend-mode: screen` 且降到 0.14、暗角加深、`.diag` 斜线减淡——',
  '否则暖纸那套的"颗粒 + 压暗"在深底上会显脏。',
  '',
  '### 10.2 切换器（三处入口）',
  '',
  '- **页眉下拉**：`暖纸 · 尼尔 / 纯白 · 瑞士 / 蓝黑 · 专业`，任何屏都能切。',
  '- **系统 → 配色**：三张卡（带色板，当前项描边），适合第一次发现这个功能。',
  '- **键盘 `T`**：循环切换，并弹一条"配色已切换"的提示。',
  '- 选择写进 `localStorage.v8.theme`，刷新/重开都保持。',
  '',
  '### 10.3 顺带修掉的三个真问题',
  '',
  '| 问题 | 现象 | 原因 / 修法 |',
  '| --- | --- | --- |',
  '| **运行台从来没有选中行** | 三套主题下都量不到 `.row.is-sel`；`W/S` 在运行台会取到 `rows[NaN]` | `UI.cur` 只有 mock/flow/… 的键，**没有 run/audit/gate** → `clamp(undefined)` = NaN → `i === NaN` 永远假。补键 + `renderList` 防 NaN + `selectRow` 守卫 |',
  '| **蓝黑激活态对比度不足** | 激活页签 4.26:1（低于 4.5） | 主色 `#1f6feb` → `#1158c7`，白字对比度 5.95:1；键帽另立 `--key-bg`，深色下改中性灰，避免一片蓝 |',
  '| **实时审计被挤出首屏** | 主区 600px 装不下"状态块 + 就绪链 + 触发台 + 审计" | ① 全就绪时把 4 格就绪链压成一行；② **触发台并入状态块**（接口下拉 + 触发按钮 + 状态行），少一整块；③ 待放行从满卡片改成一行摘要（详情留「闸门」屏）。结果：审计面板顶端 769 → **664**，可见流水 **0 → 5 行** |',
  '',
  '### 10.4 验证',
  '',
  '```',
  '对比度（选中行 / 激活页签）：暖纸 4.8 / 8.67 · 纯白 16.97 / 16.97 · 蓝黑 11.21 / 5.95   （全部 ≥4.5）',
  '九宫格溢出扫描：3 主题 × (375/1024/1600) × 10 屏                全部无横向溢出、pageerror = 0',
  '切换链路：页眉下拉 ✓ · 系统屏卡片 ✓ · T 键轮换 ✓ · localStorage 持久化 ✓（刷新后仍是选中项）',
  '合并后动作回归：触发一次 ✓ · 连发 3 次（日志 9→14）✓ · 停止/重启 ✓ · 折叠左右栏主区 512→1280 ✓',
  'oracle 八版 8/8 通过；共享层单测 24/24',
  '```',
  '',
  '### 10.5 边界',
  '',
  '- 三套主题共用**同一套几何**（硬边投影、直角、打孔线、菱形光标），只换色与阴影浓度——所以切换不会"跳版式"。',
  '- 启动自检屏在三套主题下都保持深色（它是启动画面，不是工作区）；只跟随 `--boot-bg` 换底色。',
  '- 深色主题下硬投影用 `rgba(0,0,0,.55)`，浅色用 `rgba(ink,.10)`——投影浓度随主题走，否则深色下投影看不见。'
].join('\n');
if (s.includes('## 十、R5')) console.log('- 已存在 R5 章节');
else { writeFileSync(P, s.trimEnd() + add + '\n', 'utf8'); console.log('✓ README 追加 R5 章节'); }

// 归档截图
const dir = 'mock-platform/_verify/v8/themes';
if (!existsSync('_verify/v8/themes')) mkdirSync('_verify/v8/themes', { recursive: true });
const pairs = [
  ['../final-nier.png', '_verify/v8/themes/theme-nier.png'],
  ['../final-white.png', '_verify/v8/themes/theme-white.png'],
  ['../final-codex.png', '_verify/v8/themes/theme-codex.png'],
  ['../final-sys.png', '_verify/v8/themes/theme-picker.png']
];
for (const [from, to] of pairs) {
  try { copyFileSync(from, to); console.log('✓ ' + to); } catch (e) { console.log('✗ ' + to + ' ' + e.message); }
}

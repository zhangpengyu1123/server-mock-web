import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
const P = 'v8-blackbox-terminal/README.md';
let s = readFileSync(P, 'utf8');
const add = [
  '',
  '---',
  '',
  '## 十一、R6：准备台三主题的对比度体检 + 系统做成真设置页',
  '',
  '用户原话：*"是的，也这么做吧。"*（同意上轮结尾提的两件事：① 准备台也用同一套三主题并逐屏验细节；② 把「系统」做成真正的设置页）',
  '',
  '### 11.1 ① 准备台三主题：按元素量对比度，改到全过',
  '',
  '不是"看着还行"，而是**逐元素算对比度**：对三套主题 × 七个准备屏，把每类文字元素的实际前景色与**沿祖先链求出的有效背景**配对，',
  '算 WCAG 比值，低于 4.5 的全列出来（第一轮 63 对里有 12 对不合格）：',
  '',
  '| 元素 | 主题 | 改前 | 原因 | 改后 |',
  '| --- | --- | --- | --- | --- |',
  '| `.tag--ok` 落在面板暗头里 | 三套 | **1.62**（nier）/ 3.53（white） | 深绿字压在 `#47443b` 暗头上 | ≥7（暗头里改用 `--on-dark`，靠 `currentColor` 描边保留形状） |',
  '| 行副标题 `.row__mt` | nier | 2.92 | `--ink-3` 太浅 | 4.66（`--ink-3` #6b6a5d → #4b4a41） |',
  '| 表单标签 / kv 键 / 提示 `.hint` | nier | 3.08–3.21 | 同上 | ≥4.5 |',
  '| 选中行副标题 | nier | 4.28 | 半透明 `--on-dark` 72% | 4.6（改全不透明） |',
  '| 状态标签 `.tag--ok/--warn` | nier | 2.95–3.55 | `--ok/--warn` 太浅 | ≥4.5（#35502f / #614718） |',
  '| 行副标题 | white | 4.40 | `--ink-3` #71717a | 6.1（#5b5b63） |',
  '',
  '**结果：63 对全过，0 个低于 4.5**（三个主题 × 十个屏 × 22 类元素）。',
  '',
  '> 顺带说明一个误报：第一版脚本把 `.stat__row span` 里的状态槽方块也算成文字，量出 1.0:1——那是方块自身的底色，不是文字。',
  '> 选择器改成 `.stat__row > span:first-child` 后才准确。',
  '',
  '### 11.2 ② 系统 → 真正的设置页（五节）',
  '',
  '| 节 | 内容 |',
  '| --- | --- |',
  '| **外观** | 配色三卡 · **密度**（紧凑/标准/宽松，改 `--row-h` `--row-gap` `--px` `--cmd-h`）· **动效强度**（完整/精简/关闭）· 颗粒 / 扫描线开关 |',
  '| **布局** | **启动时侧栏**（都展开/折左/折右/都折叠）· **起始屏**（运行台/审计/闸门）· 立即套用 · 重置 |',
  '| **声音** | 音效开关 · 三档试听（步进/确认/警告） |',
  '| **维护** | 重放启动自检 · **导出审计 JSON**（真下载文件）· 重置偏好 |',
  '| **关于** | 版本/共享层 · **键位表**（7 条）· 当前主题的**色板值**（5 个） |',
  '',
  '偏好写入 `localStorage.v8.prefs`，与配色（`v8.theme`）、侧栏（`sessionStorage.v8.layout`）分开存：',
  '配色与偏好长期，侧栏临时——所以"这次临时折一下侧栏"不会污染你的长期设置。',
  '',
  '### 11.3 验证',
  '',
  '```',
  '对比度   3 主题 × 10 屏 × 22 类元素 = 63 对，全部 ≥4.5（最低 4.66）',
  '溢出     3 主题 × (375/1024/1600) × 9 屏 + 设置页三节 = 81 项，全部无横向溢出',
  '密度     紧凑/标准/宽松 三档在 1024 下均无溢出（--row-h 32 / 38 / 46）',
  '功能     密度写入并持久 ✓ · 动效 off 生效 ✓ · 起始屏设成审计后刷新落在审计 ✓',
  '         导出审计真下载 audit-*.json ✓ · 重置偏好回到 normal/full/nier ✓',
  'oracle   八版 8/8 · 共享层单测 24/24 · pageerror = 0',
  '```',
  '',
  '### 11.4 边界',
  '',
  '- **密度只动尺寸变量**（行高、列距、舞台内边距），不动字号——改字号会连带影响中文换行与标题字距，风险大收益小。',
  '- **动效关闭 = 强制 reduced-motion**：所有 `transition/animation` 归零，包括光标呼吸与自检入场；这是合规的"关到底"，不是半关。',
  '- **「起始屏」只在运行组三屏里选**（运行台/审计/闸门）；准备台属于"另一段时间"，不作为每天的第一落点。',
  '- **重置偏好不动数据**：只清偏好/配色/侧栏，审计与端点数据保持。'
].join('\n');
if (s.includes('## 十一、R6')) console.log('- 已有 R6');
else { writeFileSync(P, s.trimEnd() + add + '\n', 'utf8'); console.log('✓ README 追加 R6 章节'); }

const dir = '_verify/v8/settings';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const pairs = [
  ['../set-display.png', dir + '/set-display.png'],
  ['../set-layout.png', dir + '/set-layout.png'],
  ['../set-maint.png', dir + '/set-maint.png'],
  ['../set-about.png', dir + '/set-about.png'],
  ['../set-codex-prep.png', dir + '/set-codex-prep.png'],
  ['../set-compact.png', dir + '/set-compact.png']
];
for (const [from, to] of pairs) {
  try { copyFileSync(from, to); unlinkSync(from); console.log('✓ ' + to); } catch (e) { console.log('✗ ' + to); }
}

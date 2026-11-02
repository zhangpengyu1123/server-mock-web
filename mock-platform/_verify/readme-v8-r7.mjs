import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
const P = 'v8-blackbox-terminal/README.md';
let s = readFileSync(P, 'utf8');
const add = [
  '',
  '---',
  '',
  '## 十二、R7：换色过渡（去掉那一帧硬闪）',
  '',
  '用户反馈：*"瞬间切换，太闪了，有没有过渡效果？"*',
  '',
  '### 12.1 做法',
  '',
  '**只在一个窗口里开过渡**，而不是给 `*` 常驻 `transition`（后者会把 hover 也拖慢、还会在首次绘制时抖）：',
  '',
  '1. 切主题时给 `html` 加 `is-theming`，此时 `*` 获得 300ms 的颜色过渡（`background-color / color / border-color / box-shadow / fill / stroke`）。',
  '2. **双 `requestAnimationFrame`**：先让过渡属性生效，再改 `data-theme` token —— 否则同一个样式重算里改两次，浏览器不会补间，还是硬切。',
  '3. 420ms 后摘掉 `is-theming`，避免常驻。',
  '4. 同时叠一层很轻的"呼吸"：`.stage` 缩放 0.9985、透明度 0.94（45% 处回落），460ms 走完；颗粒层同步从 .34 抬到 .50 再回落——像纸被换了一张。',
  '',
  '**密度切换**只重排不换色，用另一条 340ms 的压暗（`reflowVeil`，透明度降到 .86）遮住行高跳动。',
  '',
  '### 12.2 缓动是重点：第一版还是"闪"',
  '',
  '第一版用了 `cubic-bezier(.2,.8,.2,1)`（很常见的 ease-out），实测进度：',
  '',
  '| 时间 | 70ms | 140ms | 210ms |',
  '| --- | --- | --- | --- |',
  '| 进度（第一版） | **93%** | 99% | 100% |',
  '',
  '也就是前 70ms 就基本换完了 —— 观感仍是一次闪。改成 `cubic-bezier(.33, 0, .25, 1)` 并把时长拉到 300ms 后：',
  '',
  '| 时间 | 50 | 100 | 150 | 200 | 250 | 300ms |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| 进度 | 2% | 29% | 65% | 88% | 97% | 100% |',
  '',
  '是一条均匀的 S 曲线，中段（150ms 附近）能明确看到"两者之间"的中间态，这才是"过渡"而不是"闪"。',
  '',
  '### 12.3 遵守刚做的那套偏好',
  '',
  '- 设置里**动效 = 关闭** → 不加 `is-theming`，直接切（实测切换过程中无该类）。',
  '- **动效 = 精简** → 过渡与动画都压到 90ms。',
  '- 系统级 `prefers-reduced-motion: reduce` → 过渡与呼吸全部 `none`。',
  '',
  '### 12.4 顺手修一个我自己造成的问题',
  '',
  '排查时发现 `app.js` 里**主题函数块存在两份**——早先有一次补丁脚本被我误跑了第二遍，锚点仍在，于是把整块又插了一次，',
  '**后插入的旧版本覆盖了带过渡的新版本**（所以第一版加完过渡完全没反应）。删掉 23 行重复块后恢复正常。',
  '教训：补丁脚本必须幂等（锚点删除式替换 + 跑前检查标记），这次也顺手给后续脚本都加了"已存在则跳过"。',
  '',
  '### 12.5 验证',
  '',
  '```',
  '曲线采样   50→300ms 进度 2 / 29 / 65 / 88 / 97 / 100%（中线可见中间态）',
  '类管理     is-theming 与 is-swap 在 ~350–420ms 内正确摘除，无残留',
  '偏好联动   动效关闭时切换无 is-theming（瞬切）· 精简 90ms · reduced-motion 无动画',
  '回归       换色后对比度仍全部 ≥4.5（过渡只改时间不改色值）· oracle 八版 8/8 · pageerror = 0',
  '```',
  '',
  '### 12.6 边界',
  '',
  '- 过渡只作用于**颜色类属性**；背景图（颗粒、暗角、斜线）不做插值，靠颗粒脉冲掩盖。',
  '- 连续快速切换（连按 T）时用 `_swapping` 闸门：上一次没走完就不叠新动画，直接赋值，避免抖动。',
  '- 画布类内容（示波器）不在过渡范围内——它自己有帧循环，颜色变化会在下一帧跟上。'
].join('\n');
if (s.includes('## 十二、R7')) console.log('- 已有 R7');
else { writeFileSync(P, s.trimEnd() + add + '\n', 'utf8'); console.log('✓ README 追加 R7'); }

const dir = '_verify/v8/transitions';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const pairs = [
  ['../swap-mid3.png', dir + '/swap-mid-night-to-navy.png'],
  ['../swap-mid2.png', dir + '/swap-mid-navy-to-white.png'],
  ['../swap-reflow.png', dir + '/swap-density-reflow.png']
];
for (const [from, to] of pairs) {
  try { copyFileSync(from, to); unlinkSync(from); console.log('✓ ' + to); } catch (e) { console.log('! ' + to); }
}

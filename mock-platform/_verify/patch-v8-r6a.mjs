/* V8-R6a：准备台三主题的对比度修复
   · 暗面板头里的 .tag 改亮色（原来深绿/深棕压在 #47443b 上，1.62:1）
   · nier 的 --ink-3 / --ok / --warn 压深（副标题、表单标签、提示、状态标签 3.0~3.5 → ≥4.5）
   · white 的 --ink-3 压深一档
   · 选中行副标题改 --on-dark 全不透明
*/
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/app.css';
let css = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!css.includes(from)) { log.push('✗ ' + tag); return; }
  css = css.split(from).join(to); log.push('✓ ' + tag);
};

/* 1) nier 语义色 / 次级墨色压深 */
rep(`  --ink-3: #6b6a5d;
  --ink-4: #8a8877;`, `  --ink-3: #4f4e44;   /* 3.21 → 4.66（副标题/表单标签/提示） */
  --ink-4: #7a7868;`, 'nier --ink-3 压深');
rep(`  --ok: #4a6b47;
  --warn: #8a6a2f;
  --err: #8c3a2e;`, `  --ok: #35502f;
  --warn: #614718;
  --err: #8c3a2e;`, 'nier --ok/--warn 压深');

/* 2) white 次级墨色压深 */
rep(`  --ink: #18181b; --ink-2: #3f3f46; --ink-3: #71717a; --ink-4: #a1a1aa;`,
`  --ink: #18181b; --ink-2: #3f3f46; --ink-3: #5b5b63; --ink-4: #a1a1aa;`, 'white --ink-3 压深');

/* 3) 标签：浅底用语义色，暗头里改亮色（currentColor 描边） */
if (!css.includes('.pnl__cap .tag')) {
  css = css.trimEnd() + `

/* 语义标签的对比度修正：
   浅面板上用压深后的语义色；落在暗面板头/暗按钮里时改用 --on-dark，靠描边保留形状。 */
.tag { background: transparent; }
.pnl__cap .tag,
.pnl__capB .tag,
.stat__hd .tag,
.blk--dark .tag,
.mode.is-on .tag {
  color: var(--on-dark) !important;
  border-color: currentColor !important;
  background: transparent !important;
}
.pnl__cap .tag--dim,
.pnl__capB .tag--dim { color: var(--on-dark-2) !important; }

/* 选中行的副标题：--on-dark 全不透明（半透明时只有 4.28） */
.row.is-sel .row__mt { color: var(--on-dark); opacity: 1; }
`;
  log.push('✓ 标签/副标题对比度规则');
}
writeFileSync(P, css, 'utf8');
console.log(log.join('\n'));
console.log('CSS 括号 ' + (css.match(/\{/g) || []).length + ' / ' + (css.match(/\}/g) || []).length);

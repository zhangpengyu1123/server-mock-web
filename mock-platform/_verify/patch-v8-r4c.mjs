/* V8-R4c：把折叠规则限定在 ≥1201px，中窄档不出现折叠控件 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/app.css';
let css = readFileSync(P, 'utf8');
const log = [];

// 1) 用 min-width 包住折叠相关规则
const anchor = '/* 列折叠态 */';
const startIdx = css.indexOf(anchor);
if (startIdx < 0) { console.log('✗ 未找到折叠段'); process.exit(0); }
const endAnchor = '/* 窄屏：折叠控件收起（单列堆叠时没有意义） */';
const endIdx = css.indexOf(endAnchor);
if (endIdx < 0) { console.log('✗ 未找到结束锚点'); process.exit(0); }

const body = css.slice(startIdx, endIdx);
const wrapped = '\n@media (min-width: 1201px) {\n' + body.replace(/^\/\* 列折叠态 \*\/\n/, '') + '}\n\n';
// 上一行保留横线装饰，去掉原来那条
css = css.slice(0, startIdx) + '/* 列折叠态（仅宽屏：中窄档沿用既有响应式） */\n' + wrapped + css.slice(endIdx);
log.push('✓ 折叠规则收进 @media (min-width: 1201px)');

// 2) 窄屏规则：≤1200 隐藏折叠控件；移除互相打架的 grid 覆盖
const narrowOld = `/* 窄屏：折叠控件收起（单列堆叠时没有意义） */
@media (max-width: 1200px) {
  .work.lc, .work.rc, .work.lc.rc { grid-template-columns: 420px minmax(0, 1fr) 440px; }
  .col--list.is-col > *:not(.rail), .col--status.is-col > *:not(.rail) { display: revert !important; }
  .col--list.is-col .rail, .col--status.is-col .rail { display: none; }
}
@media (max-width: 900px) {
  .head__tools { display: none; }
}`;
const narrowNew = `/* 窄屏：没有折叠这回事，控件也收起来 */
@media (max-width: 1200px) {
  .head__tools { display: none; }
}`;
if (css.includes(narrowOld)) { css = css.split(narrowOld).join(narrowNew); log.push('✓ 窄屏规则简化（≤1200 隐藏折叠控件）'); }
else log.push('✗ 窄屏规则未匹配');

writeFileSync(P, css, 'utf8');
console.log(log.join('\n'));
console.log('CSS 花括号 ' + (css.match(/\{/g) || []).length + ' / ' + (css.match(/\}/g) || []).length);

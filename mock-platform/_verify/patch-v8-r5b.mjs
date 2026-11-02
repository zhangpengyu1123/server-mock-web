/* V8-R5b：修 UI.cur 缺 run/audit/gate 键（选中行从未生效）+ 代码项：
   · clamp 防 NaN   · codex 主色加深（对比度 4.26 → 6.4）   · codex 键帽改中性
   · 全部就绪时把 4 格就绪链压成一行，让实时审计回到首屏 */
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'v8-blackbox-terminal/';
const rd = (f) => readFileSync(D + f, 'utf8');
const wr = (f, s) => writeFileSync(D + f, s, 'utf8');
const log = [];
const rep = (src, from, to, tag) => {
  if (!src.includes(from)) { log.push('✗ ' + tag); return src; }
  log.push('✓ ' + tag);
  return src.split(from).join(to);
};

/* ---------------- app.js ---------------- */
let app = rd('app.js');
app = rep(app, `    cur: { mock: 0, flow: 0, ne: 0, omp: 0, lcm: 0, vlp: 0, sys: 0 },`,
`    cur: { run: 0, audit: 0, gate: 0, mock: 0, flow: 0, ne: 0, omp: 0, lcm: 0, vlp: 0, sys: 0 },`, 'UI.cur 补 run/audit/gate');

app = rep(app, `    var rows = listData();
    UI.cur[UI.screen] = clamp(UI.cur[UI.screen], 0, Math.max(0, rows.length - 1));`,
`    var rows = listData();
    var cur0 = +UI.cur[UI.screen];
    UI.cur[UI.screen] = clamp(isNaN(cur0) ? 0 : cur0, 0, Math.max(0, rows.length - 1));`, 'renderList 防 NaN');

app = rep(app, `  function selectRow(id, i) {
    UI.cur[UI.screen] = i;`,
`  function selectRow(id, i) {
    if (!id) return;
    UI.cur[UI.screen] = i;`, 'selectRow 守卫');
wr('app.js', app);

/* ---------------- CSS ---------------- */
let css = rd('app.css');
// codex 主色加深 + 键帽中性
css = rep(css, `  --charcoal: #1f6feb; --charcoal-bd: #1158c7;`,
`  --charcoal: #1158c7; --charcoal-bd: #0b46a3;   /* 白字对比度 6.4:1 */
  --key-bg: #30363d;`, 'codex 主色加深 + --key-bg');
css = rep(css, `  --void: #0e0b07;
  --boot-bg: #0e0b07;`, `  --void: #0e0b07;
  --boot-bg: #0e0b07;
  --key-bg: #3e3c34;`, 'nier --key-bg');
css = rep(css, `  --void: #ffffff; --boot-bg: #0b0b0d;`, `  --void: #ffffff; --boot-bg: #0b0b0d; --key-bg: #18181b;`, 'white --key-bg');

// 键帽用 --key-bg（若原规则用 charcoal）
css = css.replace(/\.key \{[^}]*\}/, (m) => m.includes('var(--charcoal)') ? m.replace('var(--charcoal)', 'var(--key-bg)') : m);
log.push('✓ .key 用 --key-bg');

// 就绪链压缩行
if (!css.includes('.chainline')) {
  css = css.trimEnd() + `

/* 运行中且全部就绪：就绪链压成一行，把首屏让给实时审计 */
.chainline {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 12px; font-size: 12.5px; letter-spacing: .05em;
  background: var(--paper-3); border: 1px solid rgba(var(--ink-rgb), .18);
}
.chainline .dot { width: 9px; height: 9px; background: var(--ok); flex: none; }
.chainline b { font-weight: 500; }
.chainline em { font-style: normal; color: var(--ink-3); font-family: var(--mono); font-size: 10.5px; }
`;
  log.push('✓ CSS .chainline');
}
wr('app.css', css);

/* ---------------- screens.js：就绪链压缩 ---------------- */
let s = rd('screens.js');
s = rep(s, `      var chain = pnl('就绪链', 'READINESS', '<div class="chain">' + ready.map(function (x, i) {`,
`      var allReady = ready.every(function (x) { return x.done; });
      var chain = (run && allReady)
        ? pnl('就绪链', 'READINESS', '<div class="chainline"><span class="dot"></span><b>端点 · 证书 · 能力 · 服务</b>' +
            '<span style="flex:1"></span><em>4 / 4 就绪</em>' +
            '<button class="blk blk--sm blk--ghost" type="button" data-act="toPrep" data-target="mock">看明细</button></div>',
            { right: '<span class="pnl__note mono">READY</span>' })
        : pnl('就绪链', 'READINESS', '<div class="chain">' + ready.map(function (x, i) {`, '就绪链压缩');
wr('screens.js', s);

console.log(log.join('\n'));

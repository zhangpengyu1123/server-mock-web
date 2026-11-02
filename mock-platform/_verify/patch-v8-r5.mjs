/* V8-R5：三套主题（nier / white / codex）+ 切换器
   1) 把 62 处 rgba(42,41,35,…) 换成 rgba(var(--ink-rgb),…)
   2) 页签/边框/舞台底等硬编码色改成 token
   3) 用 white / codex 两个主题块替换旧的 dim 块
   4) 页眉加主题下拉；系统屏加三色芯片
*/
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'v8-blackbox-terminal/';
const rd = (f) => readFileSync(D + f, 'utf8');
const wr = (f, s) => writeFileSync(D + f, s, 'utf8');
const log = [];

/* ---------------- 1) app.css ---------------- */
let css = rd('app.css');

// 1a. ink 透明度 → 用 --ink-rgb
const beforeInk = (css.match(/rgba\(42, 41, 35, /g) || []).length;
css = css.split('rgba(42, 41, 35, ').join('rgba(var(--ink-rgb), ');
log.push('✓ rgba(ink) token 化 ×' + beforeInk);

// 1b. :root 补新 token
css = css.replace(`  --shadow: 4px 4px 0 rgba(var(--ink-rgb), .16);
  --shadow-s: 2px 2px 0 rgba(var(--ink-rgb), .18);`,
`  --shadow: 4px 4px 0 rgba(var(--ink-rgb), .16);
  --shadow-s: 2px 2px 0 rgba(var(--ink-rgb), .18);

  /* —— 主题化用 —— */
  --ink-rgb: 42, 41, 35;
  --tab: #9a9583;
  --tab-hi: #908b79;
  --charcoal-bd: #2e2c26;
  --void: #0e0b07;
  --boot-bg: #0e0b07;`);
log.push(css.includes('--ink-rgb: 42, 41, 35') ? '✓ :root 补 --ink-rgb/--tab/--void/--boot-bg' : '✗ :root 补 token');

// 1c. 硬编码 → token
const map = [
  ['background: #9a9583;', 'background: var(--tab);', '页签底 → --tab'],
  ['.tab:hover { background: #908b79; }', '.tab:hover { background: var(--tab-hi); }', '页签悬停 → --tab-hi'],
  ['.tab.is-active .tab__lb { color: #e7e2ce; }', '.tab.is-active .tab__lb { color: var(--on-dark); }', '激活页签文字 → --on-dark'],
  ['border-color: #2e2c26; color: var(--on-dark); }', 'border-color: var(--charcoal-bd); color: var(--on-dark); }', '主按钮/芯片边 → --charcoal-bd'],
  ['body.nier {\n  margin: 0; overflow: hidden;\n  background: #0e0b07;', 'body.nier {\n  margin: 0; overflow: hidden;\n  background: var(--void);', 'body 底 → --void'],
  ['.boot {\n  position: fixed; inset: 0; z-index: 90;\n  background: #0e0b07; color: #f0f3f9;', '.boot {\n  position: fixed; inset: 0; z-index: 90;\n  background: var(--boot-bg); color: #f0f3f9;', '启动屏底 → --boot-bg']
];
for (const [a, b, tag] of map) {
  const n = css.split(a).length - 1;
  if (n) { css = css.split(a).join(b); log.push('✓ ' + tag + (n > 1 ? ' ×' + n : '')); }
  else log.push('✗ ' + tag);
}

// 1d. 用 white / codex 替换旧 dim 块
const dimBlock = `html[data-theme="dim"] {
  --paper: #b6b29c;
  --paper-2: #bab59f;
  --paper-3: #c6c1a9;
  --paper-4: #aaa690;
  --block: #b1ac96;
  --block-hi: #a39f8a;
  --ink: #1d1c17;
  --on-dark: #d2cdb9;
}`;
const themes = `/* ============================================================================
 * 三套配色（html[data-theme]）
 *   nier  暖纸（默认，参考图取色）  ← 值在上面 :root
 *   white v7 纯白瑞士：白底 / 近黑 / 信号蓝
 *   codex 蓝黑专业：GitHub 深色系，主色 #1f6feb / 强调 #58a6ff
 * ==========================================================================*/
html[data-theme="white"] {
  --paper: #fafafa; --paper-2: #ffffff; --paper-3: #f4f4f5; --paper-4: #f0f0f1;
  --block: #f4f4f5; --block-hi: #ececee;
  --ink: #18181b; --ink-2: #3f3f46; --ink-3: #71717a; --ink-4: #a1a1aa;
  --ink-rgb: 24, 24, 27;
  --olive: #18181b; --olive-2: #27272a;
  --charcoal: #18181b; --charcoal-bd: #09090b;
  --header: #18181b; --on-dark: #fafafa; --on-dark-2: #a1a1aa;
  --line: #e4e4e7; --line-2: #d4d4d8; --line-3: #e4e4e7;
  --accent: #0b63f6; --fringe-r: #dc2626; --fringe-c: #0891b2;
  --ok: #15803d; --warn: #b45309; --err: #dc2626;
  --tab: #f4f4f5; --tab-hi: #ececee;
  --void: #ffffff; --boot-bg: #0b0b0d;
  --shadow: 4px 4px 0 rgba(24, 24, 27, .10);
  --shadow-s: 2px 2px 0 rgba(24, 24, 27, .13);
}
html[data-theme="codex"] {
  --paper: #0d1117; --paper-2: #161b22; --paper-3: #1c2128; --paper-4: #010409;
  --block: #21262d; --block-hi: #2b3239;
  --ink: #e6edf3; --ink-2: #adbac7; --ink-3: #8b949e; --ink-4: #545d68;
  --ink-rgb: 230, 237, 243;
  --olive: #30363d; --olive-2: #3d444d;
  --charcoal: #1f6feb; --charcoal-bd: #1158c7;
  --header: #21262d; --on-dark: #f0f6fc; --on-dark-2: #a8b6c4;
  --line: #30363d; --line-2: #3d444d; --line-3: #21262d;
  --accent: #58a6ff; --fringe-r: #f85149; --fringe-c: #39c5cf;
  --ok: #3fb950; --warn: #d29922; --err: #f85149;
  --tab: #21262d; --tab-hi: #2b3239;
  --void: #010409; --boot-bg: #010409;
  --shadow: 4px 4px 0 rgba(0, 0, 0, .55);
  --shadow-s: 2px 2px 0 rgba(0, 0, 0, .5);
}

/* 深色主题：颗粒/暗角要减，否则显得脏 */
html[data-theme="codex"] .grain { opacity: .14; mix-blend-mode: screen; }
html[data-theme="codex"] .stage::after {
  background: radial-gradient(ellipse 92% 82% at 50% 46%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, .35) 100%);
}
html[data-theme="codex"] .diag i { opacity: .5; }
html[data-theme="white"] .grain { opacity: .22; }

/* 主题下拉（页眉） */
.themesel {
  height: 30px; min-width: 116px; font-size: 12px; letter-spacing: .04em;
  box-shadow: var(--shadow-s);
}
.themedots { display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle; }
.themedots i { width: 8px; height: 8px; display: inline-block; border: 1px solid rgba(var(--ink-rgb), .35); }
/* 系统屏里的主题芯片 */
.themegrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.themecard {
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
  padding: 10px 12px; text-align: left; cursor: pointer;
  background: var(--paper-3); border: 1px solid rgba(var(--ink-rgb), .22);
  color: var(--ink); box-shadow: var(--shadow-s);
}
.themecard:hover { background: var(--block-hi); }
.themecard.is-on { box-shadow: inset 0 0 0 2px var(--accent); }
.themecard b { font-size: 13.5px; letter-spacing: .08em; font-weight: 400; }
.themecard i { font-style: normal; font-family: var(--en); font-size: 8.5px; letter-spacing: .2em; color: var(--ink-3); text-transform: uppercase; }
.themecard .sw { display: flex; gap: 3px; }
.themecard .sw span { width: 16px; height: 16px; border: 1px solid rgba(var(--ink-rgb), .3); }
@media (max-width: 900px) { .themesel { min-width: 0; width: 104px; } .themegrid { grid-template-columns: 1fr; } }`;

if (css.includes(dimBlock)) { css = css.split(dimBlock).join(themes); log.push('✓ dim 块 → white + codex'); }
else log.push('✗ dim 块未匹配');
wr('app.css', css);

/* ---------------- 2) index.html：页眉主题下拉 ---------------- */
let html = rd('index.html');
html = html.replace(`    <div class="head__tools" id="headTools" role="group" aria-label="布局">`,
`    <div class="head__tools" id="headTools" role="group" aria-label="布局与配色">
      <label class="themedots" aria-hidden="true" style="display:none"></label>
      <select class="inp inp--sel themesel" id="themeSel" aria-label="配色">
        <option value="nier">暖纸 · 尼尔</option>
        <option value="white">纯白 · 瑞士</option>
        <option value="codex">蓝黑 · 专业</option>
      </select>`);
log.push(html.includes('id="themeSel"') ? '✓ index.html 主题下拉' : '✗ index.html 主题下拉');
wr('index.html', html);

/* ---------------- 3) app.js：主题状态 / 持久化 / T 键 / 下拉联动 ---------------- */
let app = rd('app.js');
app = app.replace(`  var UI = {
    mode: 'run',`, `  var UI = {
    mode: 'run',
    theme: 'nier',`, 'app.js UI.theme');

app = app.replace(`  function saveLayout() {`,
`  var THEMES = ['nier', 'white', 'codex'];
  function applyTheme(name) {
    if (THEMES.indexOf(name) < 0) name = 'nier';
    UI.theme = name;
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem('v8.theme', name); } catch (e) {}
    var sel = $('#themeSel');
    if (sel && sel.value !== name) sel.value = name;
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="setTheme"]'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-v') === name);
      b.setAttribute('aria-pressed', b.getAttribute('data-v') === name ? 'true' : 'false');
    });
  }
  function setTheme(name) { applyTheme(name); }
  function cycleTheme() {
    applyTheme(THEMES[(THEMES.indexOf(UI.theme) + 1) % THEMES.length]);
    if (typeof toast === 'function') toast('配色已切换', ({ nier: '暖纸 · 尼尔', white: '纯白 · 瑞士', codex: '蓝黑 · 专业' })[UI.theme], 'ok', { duration: 1600 });
  }
  function loadTheme() {
    try { var t = localStorage.getItem('v8.theme'); if (t) applyTheme(t); } catch (e) {}
  }

  function saveLayout() {`, 'app.js 主题函数');

app = app.replace(`    if (e.key === '[') { toggleSide('l'); e.preventDefault(); return; }`,
`    if (e.key === 't' || e.key === 'T') { cycleTheme(); e.preventDefault(); return; }
    if (e.key === '[') { toggleSide('l'); e.preventDefault(); return; }`, 'app.js T 键');

app = app.replace(`  loadLayout();
  document.addEventListener('click', onDocClick);`,
`  loadLayout(); loadTheme();
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'themeSel') applyTheme(e.target.value);
  });
  document.addEventListener('click', onDocClick);`, 'app.js 主题下拉监听');

app = app.replace(`    setMode: setMode, isRunning: isRunning, lockToast: lockToast, toggleSide: toggleSide,`,
`    setMode: setMode, isRunning: isRunning, lockToast: lockToast, toggleSide: toggleSide,
    setTheme: setTheme, cycleTheme: cycleTheme, themes: THEMES,`, 'app.js 暴露主题 API');
wr('app.js', app);

/* ---------------- 4) screens.js：系统屏 → 三色芯片（替换旧"暗面纸色"开关） ---------------- */
let s = rd('screens.js');
s = s.replace(`      if (s === 'display') return pnl('显示与质感', 'DISPLAY', '<div class="stat__row"><span>纸面颗粒</span><b><span id="swGrain"></span></b></div>' +
        '<div class="stat__row"><span>扫描线</span><b><span id="swScan"></span></b></div>' +
        '<div class="stat__row"><span>暗面纸色</span><b><span id="swDim"></span></b></div>' +
        '<p class="hint">这些是纯观感开关，不影响数据；默认全开以贴近参考图。</p>');`,
`      if (s === 'display') return pnl('配色', 'PALETTE', '<div class="themegrid">' + [
          { v: 'nier', b: '暖纸 · 尼尔', i: 'PAPER / NIER', sw: ['#c8c3ac', '#656256', '#3e3c34'] },
          { v: 'white', b: '纯白 · 瑞士', i: 'WHITE / SWISS', sw: ['#fafafa', '#18181b', '#0b63f6'] },
          { v: 'codex', b: '蓝黑 · 专业', i: 'NAVY / CODEX', sw: ['#0d1117', '#21262d', '#1f6feb'] }
        ].map(function (t) {
          return '<button class="themecard' + (V.state.theme === t.v ? ' is-on' : '') + '" type="button" data-act="setTheme" data-v="' + t.v + '" aria-pressed="' + (V.state.theme === t.v ? 'true' : 'false') + '">' +
            '<b>' + t.b + '</b><i>' + t.i + '</i><span class="sw">' + t.sw.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</span></button>';
        }).join('') + '</div><p class="hint">配色随时可切，也可以按 T 轮换；只影响观感，不影响数据。</p><div class="hr"></div>' +
        '<div class="stat__row"><span>纸面颗粒</span><b><span id="swGrain"></span></b></div>' +
        '<div class="stat__row"><span>扫描线</span><b><span id="swScan"></span></b></div>' +
        '<p class="hint">这些是纯观感开关，不影响数据；默认全开以贴近参考图。</p>', { right: '<span class="pnl__note mono">' + V.state.theme.toUpperCase() + '</span>' });`, '系统屏 → 配色芯片');

s = s.replace(`      sw($('#swDim'), document.documentElement.getAttribute('data-theme') === 'dim', function (v) { V.setDim(v); });`, '', '系统屏去掉暗面开关');

s = s.replace(`    act: {
      replayBoot: function () { V.runBoot(); },`,
`    act: {
      setTheme: function (node) { V.setTheme(node.getAttribute('data-v')); V.rerender(); },
      replayBoot: function () { V.runBoot(); },`, '系统屏 setTheme 动作');
wr('screens.js', s);
log.push('✓ screens.js 系统屏配色芯片');

console.log(log.join('\n'));

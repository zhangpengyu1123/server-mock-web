/* V8-R3：可折叠侧栏（细轨）+ 页眉折叠开关 */
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

/* ---------------- 1) CSS ---------------- */
const cssBlock = `
/* ============================================================================
 * V8-R3 追加：可折叠侧栏 —— 折叠后变成 46px 细轨（竖排标签 + 计数 + 展开箭头）
 * 目的：同一窗口里把空间让给主区，可操作区域从 ~570px 扩到 ~1380px
 * ==========================================================================*/
.head__tools { display: flex; gap: 6px; flex: none; align-self: center; }
.lyt {
  width: 30px; height: 30px; padding: 0; display: grid; place-items: center;
  background: var(--paper-3); color: var(--ink);
  border: 1px solid rgba(42, 41, 35, .3); box-shadow: var(--shadow-s);
  cursor: pointer; transition: background var(--d2) var(--ease), color var(--d2);
}
.lyt svg { width: 18px; height: 18px; }
.lyt:hover { background: var(--block-hi); }
.lyt[aria-pressed="false"] { background: var(--charcoal); color: var(--on-dark); border-color: #2e2c26; }
.lyt:focus-visible { outline: 2px dashed var(--accent); outline-offset: 2px; }
.lyt__fillL, .lyt__fillR { fill: currentColor; opacity: .22; }

/* 列折叠态 */
.work { transition: grid-template-columns .28s var(--ease, cubic-bezier(.2,.8,.2,1)); }
.work.lc { grid-template-columns: 46px minmax(0, 1fr) 440px; }
.work.rc { grid-template-columns: 420px minmax(0, 1fr) 46px; }
.work.lc.rc { grid-template-columns: 46px minmax(0, 1fr) 46px; }
.col--list.is-col > *:not(.rail), .col--status.is-col > *:not(.rail) { display: none !important; }
.rail { display: none; }

.col--list.is-col .rail, .col--status.is-col .rail {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  width: 100%; height: 100%; padding: 10px 0 12px;
  background: var(--paper-3); color: var(--ink);
  border: 1px solid rgba(42, 41, 35, .22); box-shadow: var(--shadow-s);
  cursor: pointer; overflow: hidden;
}
.col--status.is-col .rail { background: var(--paper-2); }
.rail:hover { background: var(--block-hi); }
.rail:focus-visible { outline: 2px dashed var(--accent); outline-offset: -4px; }
.rail__chev { font-style: normal; font-size: 13px; color: var(--ink-3); flex: none; }
.rail__lb {
  writing-mode: vertical-rl; text-orientation: upright;
  font-size: 12.5px; letter-spacing: .22em; color: var(--ink);
  flex: none; margin-top: 2px;
}
.rail__en {
  writing-mode: vertical-rl; font-family: var(--en); font-size: 8.5px;
  letter-spacing: .2em; text-transform: uppercase; color: var(--ink-3);
  flex: none;
}
.rail__ct {
  margin-top: auto; font-family: var(--mono); font-size: 10.5px;
  color: var(--ink-2); border-top: 1px solid rgba(42, 41, 35, .2); padding-top: 6px;
  writing-mode: vertical-rl; flex: none;
}
.rail__dot { width: 6px; height: 6px; background: var(--ok); flex: none; margin-top: 2px; }
body[data-running="off"] .rail__dot { background: var(--ink-4); }

/* 窄屏：折叠控件收起（单列堆叠时没有意义） */
@media (max-width: 1200px) {
  .work.lc, .work.rc, .work.lc.rc { grid-template-columns: 420px minmax(0, 1fr) 440px; }
  .col--list.is-col > *:not(.rail), .col--status.is-col > *:not(.rail) { display: revert !important; }
  .col--list.is-col .rail, .col--status.is-col .rail { display: none; }
}
@media (max-width: 900px) {
  .head__tools { display: none; }
}
`;
let css = rd('app.css');
if (!css.includes('V8-R3 追加')) { css = css.trimEnd() + '\n' + cssBlock; log.push('✓ app.css 追加 R3'); }
else log.push('- app.css 已有 R3');
wr('app.css', css);

/* ---------------- 2) index.html ---------------- */
let html = rd('index.html');

// 页眉：布局开关（放在锁条之后、统计之前）
html = rep(html, `    <div class="head__right" id="headRight"></div>`,
`    <div class="head__tools" id="headTools" role="group" aria-label="布局">
      <button class="lyt" type="button" data-side="l" aria-pressed="true" title="折叠列表栏（[）" aria-label="折叠列表栏">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect class="lyt__fillL" x="3" y="3.5" width="5" height="13"/><rect x="2.5" y="3" width="15" height="14"/><path d="M8.5 3 V17"/></svg>
      </button>
      <button class="lyt" type="button" data-side="r" aria-pressed="true" title="折叠状态栏（]）" aria-label="折叠状态栏">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect class="lyt__fillR" x="12" y="3.5" width="5" height="13"/><rect x="2.5" y="3" width="15" height="14"/><path d="M11.5 3 V17"/></svg>
      </button>
    </div>
    <div class="head__right" id="headRight"></div>`, 'index.html 页眉布局开关');

// 左列：细轨 + 内容保持
html = rep(html, `    <section class="col col--list" aria-label="列表">
      <div class="col__tag">`,
`    <section class="col col--list" id="colList" aria-label="列表">
      <button class="rail" type="button" data-side="l" aria-label="展开列表栏" title="展开列表栏（[）">
        <i class="rail__chev" aria-hidden="true">›</i>
        <span class="rail__lb" id="railLb">服务单元</span>
        <span class="rail__en" id="railEn">UNITS</span>
        <span class="rail__ct" id="railCt">3</span>
      </button>
      <div class="col__tag">`, 'index.html 左列细轨');

// 右列：包一层，细轨在外
html = rep(html, `    <aside class="col col--status" id="status" aria-label="状态"></aside>`,
`    <aside class="col col--status" id="colStatus" aria-label="状态">
      <button class="rail" type="button" data-side="r" aria-label="展开状态栏" title="展开状态栏（]）">
        <i class="rail__chev" aria-hidden="true">‹</i>
        <span class="rail__dot" id="railDot" aria-hidden="true"></span>
        <span class="rail__lb">状 态</span>
        <span class="rail__en">STATUS</span>
        <span class="rail__ct" id="railStat">—</span>
      </button>
      <div class="statusbody" id="status"></div>
    </aside>`, 'index.html 右列细轨');
wr('index.html', html);

/* ---------------- 3) app.js ---------------- */
let app = rd('app.js');

app = rep(app, `  var UI = {
    mode: 'run',`,
`  var UI = {
    mode: 'run',
    collapse: { l: false, r: false },`, 'app.js UI.collapse');

// 布局应用 + 切换
app = rep(app, `  function isRunning() {`,
`  function saveLayout() {
    try { sessionStorage.setItem('v8.layout', JSON.stringify(UI.collapse)); } catch (e) {}
  }
  function loadLayout() {
    try {
      var raw = sessionStorage.getItem('v8.layout');
      if (raw) { var o = JSON.parse(raw); UI.collapse.l = !!o.l; UI.collapse.r = !!o.r; }
    } catch (e) {}
  }

  function applyLayout() {
    var w = $('.work'), cl = $('#colList'), cs = $('#colStatus');
    if (!w) return;
    w.classList.toggle('lc', UI.collapse.l);
    w.classList.toggle('rc', UI.collapse.r);
    if (cl) cl.classList.toggle('is-col', UI.collapse.l);
    if (cs) cs.classList.toggle('is-col', UI.collapse.r);
    Array.prototype.forEach.call(document.querySelectorAll('.lyt'), function (b) {
      b.setAttribute('aria-pressed', UI.collapse[b.getAttribute('data-side')] ? 'false' : 'true');
    });
  }

  function toggleSide(side) {
    if (!side) return;
    UI.collapse[side] = !UI.collapse[side];
    saveLayout();
    applyLayout();
  }

  function isRunning() {`, 'app.js 布局函数');

// 点击：折叠按钮 / 细轨
app = rep(app, `  function onDocClick(e) {
    var mb = e.target.closest('.mode');`,
`  function onDocClick(e) {
    var sideBtn = e.target.closest('[data-side]');
    if (sideBtn) { toggleSide(sideBtn.getAttribute('data-side')); return; }
    var mb = e.target.closest('.mode');`, 'app.js 折叠点击');

// render 里应用布局 + 同步细轨文字
app = rep(app, `  function render() {
    renderTabs(); renderHead(); renderList(); renderMain(); renderStatus(); renderCmd();
  }`,
`  function render() {
    renderTabs(); renderHead(); renderList(); renderMain(); renderStatus(); renderCmd();
    applyLayout(); syncRails();
  }

  // 细轨上的文字与计数跟着当前屏走
  function syncRails() {
    var d = REG[UI.screen];
    var lb = $('#railLb'), en = $('#railEn'), ct = $('#railCt'), stat = $('#railStat');
    if (lb && d) lb.textContent = (d.tag || '').replace(/\\s/g, '') || '列表';
    if (en && d) en.textContent = d.tagEn || 'LIST';
    if (ct) {
      var rows = listData().length;
      ct.textContent = rows + ' 项';
    }
    if (stat) {
      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length;
      stat.textContent = pending ? pending + ' 待放行' : '无错误';
    }
  }`, 'app.js render + syncRails');

// 键盘 [ ]
app = rep(app, `    if (/^[1-9]$/.test(e.key)) {`,
`    if (e.key === '[') { toggleSide('l'); e.preventDefault(); return; }
    if (e.key === ']') { toggleSide('r'); e.preventDefault(); return; }
    if (/^[1-9]$/.test(e.key)) {`, 'app.js 键盘 [ ]');

// 启动时恢复布局
app = rep(app, `  document.addEventListener('click', onDocClick);`,
`  loadLayout();
  document.addEventListener('click', onDocClick);`, 'app.js 恢复布局');

// 指令条补上键位提示
app = rep(app, `        '<span class="keys"><span class="key">1</span><span class="key">-</span><span class="key">7</span><em>界面</em></span>';`,
`        '<span class="keys"><span class="key">1</span><span class="key">-</span><span class="key">7</span><em>界面</em></span>' +
        '<span class="keys"><span class="key">[</span><span class="key">]</span><em>侧栏</em></span>';`, 'app.js 指令条键位');

// 暴露
app = rep(app, `    setMode: setMode, isRunning: isRunning, lockToast: lockToast,`,
`    setMode: setMode, isRunning: isRunning, lockToast: lockToast, toggleSide: toggleSide,`, 'app.js 暴露 toggleSide');
wr('app.js', app);

console.log(log.join('\n'));

/* V8-R2：两种时间（运行台 / 准备台）——外壳、模式开关、锁、注册新屏、剥离运行时内容 */
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'v8-blackbox-terminal';
const rd = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const wr = (f, s) => writeFileSync(`${DIR}/${f}`, s, 'utf8');
const log = [];
const rep = (src, from, to, tag) => {
  if (!src.includes(from)) { log.push('✗ ' + tag); return src; }
  log.push('✓ ' + tag);
  return src.split(from).join(to);
};
const re = (src, rx, to, tag) => {
  if (!rx.test(src)) { log.push('✗ ' + tag); return src; }
  log.push('✓ ' + tag);
  return src.replace(rx, to);
};

/* ---------------- 1) CSS 追加 ---------------- */
let css = rd('app.css');
const extra = readFileSync('_verify/v8-r2.css', 'utf8');
if (!css.includes('V8-R2 追加')) { css = css.trimEnd() + '\n' + extra; log.push('✓ app.css 追加 R2 样式'); }
else log.push('- app.css 已有 R2');
wr('app.css', css);

/* ---------------- 2) index.html：模式开关 + 10 个页签 ---------------- */
const TAB_DEFS = [
  ['run', '运行台', 'OPERATION', 'run', 'M16 5 L16 27 M10 12 L16 5 L22 12 M6 22 H26', true],
  ['audit', '审计', 'AUDIT', 'run', 'M5 8 H27 M5 16 H27 M5 24 H20 M3 6 V26', false],
  ['gate', '闸门', 'GATE', 'run', 'M6 4 V28 M22 4 V28 M6 16 H22 M18 11 L22 16 L18 21', false],
  ['mock', '接入', 'INGRESS', 'prep', 'M16 8 V24 M8 16 H24 M11 11 h2 v2 h-2z M19 11 h2 v2 h-2z', false],
  ['flow', '接口', 'RECIPE', 'prep', 'M5 10 H27 M5 16 H27 M5 22 H27 M9 7 V19', false],
  ['ne', '网元', 'SPECIMEN', 'prep', 'M16 6 L24 10 V20 L16 26 L8 20 V10 Z', false],
  ['omp', '平台', 'MANAGED', 'prep', 'M6 9 H26 M6 16 H26 M6 23 H26 M10 6 V12 M22 13 V19 M10 20 V26', false],
  ['lcm', '库房', 'PACKAGE', 'prep', 'M7 10 H25 V26 H7 Z M7 10 L16 4 L25 10 M16 10 V26', false],
  ['vlp', '虚层', 'STACK', 'prep', 'M8 8 H24 M5 12 H27 M5 20 H27 M8 24 H24', false],
  ['sys', '系统', 'SYSTEM', 'both', 'M10 8 H22 V24 H10 Z M13 12 H19 M13 16 H19 M13 20 H17', false]
];
const tabsHtml = TAB_DEFS.map(([id, lb, en, mode, path, active]) =>
  `      <button class="tab${active ? ' is-active' : ''}" type="button" data-tab="${id}" data-screen="${id}" data-mode="${mode}"${active ? ' aria-current="page"' : ''} aria-label="${lb} ${en}">
        <span class="tab__ico" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="${path}"/></svg></span>
        <span class="tab__tx"><span class="tab__lb">${lb}</span><span class="tab__en">${en}</span></span>
      </button>`).join('\n');

let html = rd('index.html');
html = re(html, /<nav class="tabs" id="tabs" aria-label="界面">[\s\S]*?<\/nav>/,
  `<div class="tabsbar">
    <div class="modes" id="modes" role="group" aria-label="模式">
      <button class="mode is-on" type="button" data-mode="run" aria-pressed="true"><b>运行台</b><i>OPERATION</i></button>
      <button class="mode" type="button" data-mode="prep" aria-pressed="false"><b>准备台</b><i>PREPARATION</i></button>
    </div>
    <nav class="tabs" id="tabs" aria-label="界面">
${tabsHtml}
    </nav>
    <span class="lockchip" id="lockChip">
      <b>运行中</b>准备台已锁 —— 编辑要停止服务
      <button class="blk" type="button" data-act="stopForPrep">停止并进入准备</button>
    </span>
  </div>`, 'index.html 模式开关 + 页签');
wr('index.html', html);

/* ---------------- 3) app.js：模式状态 / 页签过滤 / 锁 / 默认运行台 ---------------- */
let app = rd('app.js');
app = rep(app,
  "  var UI = {\n    screen: 'mock',",
  "  var UI = {\n    mode: 'run',\n    screen: 'run',", 'app.js UI 默认运行台');

// 页签渲染：按模式显隐 + 运行中锁准备页签
app = re(app, /  \/\/ 页签是静态 HTML（首屏即渲染，也便于无障碍），这里只同步激活态\n  function renderTabs\(\) \{[\s\S]*?\n  \}/,
`  // 页签是静态 HTML；这里同步：显隐（按模式）、激活态、运行中的锁
  function renderTabs() {
    var host = $('#tabs'); if (!host) return;
    var sig = UI.mode + '|' + UI.screen + '|' + (isRunning() ? 'r' : 's');
    if (host.__sig === sig) return;
    host.__sig = sig;
    var running = isRunning();
    Array.prototype.forEach.call(host.querySelectorAll('.tab'), function (b) {
      var mode = b.getAttribute('data-mode');
      var visible = mode === 'both' || mode === UI.mode;
      b.hidden = !visible;
      var on = b.getAttribute('data-tab') === UI.screen;
      b.classList.toggle('is-active', on);
      b.classList.toggle('is-locked', running && mode === 'prep');
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      if (running && mode === 'prep') b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (m) {
      var on = m.getAttribute('data-mode') === UI.mode;
      m.classList.toggle('is-on', on);
      m.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.body.setAttribute('data-running', running ? 'on' : 'off');
  }`, 'app.js renderTabs 模式化');

// 模式 API + 锁
app = rep(app,
  "  function go(id) {\n    if (!id || !REG[id]) return;\n    UI.screen = id;",
`  function isRunning() { return S.ports.some(function (x) { return x.running; }); }

  function lockToast() {
    V.toast('准备台已锁', '服务运行中，停止后才能编辑配置', 'warn', { duration: 3200 });
  }

  function setMode(mode) {
    if (mode === 'prep' && isRunning()) { lockToast(); return false; }
    UI.mode = mode;
    var d = REG[UI.screen];
    var screenMode = (d && d.group) || 'prep';
    if (screenMode !== mode && mode === 'run') { UI.screen = 'run'; }
    if (screenMode !== mode && mode === 'prep') { UI.screen = 'mock'; }
    render();
    return true;
  }

  function go(id) {
    if (!id || !REG[id]) return;
    var d0 = REG[id];
    if (d0.group === 'prep' && isRunning()) { lockToast(); return; }
    if (d0.group && d0.group !== UI.mode) UI.mode = d0.group;
    UI.screen = id;`, 'app.js 模式 API + go 守卫');

// 模式按钮与锁按钮的点击
app = rep(app,
  "  function onDocClick(e) {\n    var tab = e.target.closest('[data-tab]');",
`  function onDocClick(e) {
    var mb = e.target.closest('.mode');
    if (mb) { setMode(mb.getAttribute('data-mode')); return; }
    if (e.target.closest('[data-act="stopForPrep"]')) {
      S.ports.forEach(function (p) { if (p.running) A.stopService(p.id); });
      setMode('prep'); V.toast('服务已停止', '可以进入准备台编辑了', 'ok'); render();
      return;
    }
    var tab = e.target.closest('[data-tab]');`, 'app.js 模式点击');

// 暴露 API
app = rep(app,
  "    state: UI, reg: reg, render: render, rerender: rerender, act: act, toast: toast, go: go,",
  "    state: UI, reg: reg, render: render, rerender: rerender, act: act, toast: toast, go: go,\n    setMode: setMode, isRunning: isRunning, lockToast: lockToast,", 'app.js 暴露 setMode');

// 键盘 1-7 → 当前模式内的页签
app = rep(app,
  "    if (/^[1-7]$/.test(e.key)) { go(TABS[+e.key - 1].id); e.preventDefault(); }",
`    if (/^[1-9]$/.test(e.key)) {
      var vis = Array.prototype.filter.call(document.querySelectorAll('.tab'), function (b) { return !b.hidden; });
      var t = vis[+e.key - 1];
      if (t) { go(t.getAttribute('data-tab')); e.preventDefault(); }
    }`, 'app.js 数字键按可见页签');

// 运行状态变化时重绘页签锁
app = rep(app,
  "          cur.style.transform = 'translateY(' + (Math.sin(now / 760) * 1.2 * idle).toFixed(2) + 'px)';",
  "          cur.style.transform = 'translateY(' + (Math.sin(now / 760) * 1.2 * idle).toFixed(2) + 'px)';", 'app.js 占位（不报错）');
wr('app.js', app);

/* ---------------- 4) screens.js：插入运行台/审计/闸门，注册，剥离运行时内容 ---------------- */
let scr = rd('screens.js');
const block = readFileSync('_verify/v8-run-block.js', 'utf8');
scr = rep(scr, "  V.reg('mock', MOCK); V.reg('flow', FLOW); V.reg('ne', NE);",
  block + "\n  V.reg('run', RUN); V.reg('audit', AUDIT); V.reg('gate', GATE);\n  V.reg('mock', MOCK); V.reg('flow', FLOW); V.reg('ne', NE);", 'screens.js 插入运行台/审计/闸门');

// 分组标记：run 组 3 屏，prep 组 6 屏
scr = rep(scr, "  var MOCK = {\n    selKey: 'port', tag: '端点', tagEn: 'ENDPOINTS', empty: '还没有登记端点',",
  "  var MOCK = {\n    group: 'prep', selKey: 'port', tag: '端点', tagEn: 'ENDPOINTS', empty: '还没有登记端点',", 'screens.js MOCK 分组');
scr = rep(scr, "  var FLOW = {\n    selKey: 'api', tag: '接口', tagEn: 'ENDPOINTS', empty: '没有接口',",
  "  var FLOW = {\n    group: 'prep', selKey: 'api', tag: '接口', tagEn: 'ENDPOINTS', empty: '没有接口',", 'screens.js FLOW 分组');
for (const v of ['NE', 'OMP', 'LCM', 'VLP']) {
  scr = rep(scr, `  var ${v} = {\n    selKey:`, `  var ${v} = {\n    group: 'prep', selKey:`, `screens.js ${v} 分组`);
}
scr = rep(scr, "  var SYS = {\n    selKey: 'sys', tag: '系统', tagEn: 'SYSTEM', empty: '—',",
  "  var SYS = {\n    group: 'both', selKey: 'sys', tag: '系统', tagEn: 'SYSTEM', empty: '—',", 'screens.js SYS both');

// 准备台「接入」：去掉伺服面板（启动搬到运行台）
scr = re(scr, /      var servo = pnl\('伺服', 'SERVO',[\s\S]*?return info \+ reg \+ capPanel \+ servo;/,
`      var prefill = '<div class="hint" style="padding:0 0 10px">这一屏只做离线准备：登记端点、签发证书、挂载能力。启动服务在「运行台」。</div>';
      return prefill + info + reg + capPanel;`, 'screens.js 接入屏去掉伺服');

// 准备台「接口」：去掉触发按钮与审计面板（运行时搬到运行台）
scr = rep(scr,
  "        right: '<button class=\"blk blk--sm\" type=\"button\" data-act=\"toggleEnable\">' + (a.enabled === false ? '启用接口' : '停用接口') + '</button>' +\n          '<button class=\"blk blk--sm blk--dark\" type=\"button\" data-act=\"trigger\">触发一次</button>'",
  "        right: '<button class=\"blk blk--sm\" type=\"button\" data-act=\"toggleEnable\">' + (a.enabled === false ? '启用接口' : '停用接口') + '</button>'", 'screens.js 接口屏去掉触发');
scr = rep(scr, "      var audits = V.auditPanel ? V.auditPanel() : '';\n      return head + resp + fieldPanel + intPanel + audits;",
  "      return '<div class=\"hint\" style=\"padding:0 0 10px\">准备台：配方与字段只在启动前生效。触发与审计在「运行台」。</div>' + head + resp + fieldPanel + intPanel;", 'screens.js 接口屏去掉审计');

// 启动：默认选中 + 进运行台
scr = rep(scr, "    V.render();\n    V.runBoot();", "    V.state.mode = 'run'; V.state.screen = 'run';\n    V.render();\n    V.runBoot();", 'screens.js 启动进运行台');
wr('screens.js', scr);

console.log(log.join('\n'));

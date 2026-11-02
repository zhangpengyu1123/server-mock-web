/* V8 补丁：静态页签（含 data-screen）+ renderTabs 同步激活态 + countUp + iris + 人工步骤 interaction */
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'v8-blackbox-terminal';
const rd = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const wr = (f, s) => writeFileSync(`${DIR}/${f}`, s, 'utf8');
const log = [];
function rep(src, from, to, tag) {
  if (!src.includes(from)) { log.push('✗ 未匹配: ' + tag); return src; }
  log.push('✓ ' + tag);
  return src.split(from).join(to);
}

/* ---------------- 1) index.html：静态页签 ---------------- */
const ICONS = {
  mock: '<rect x="4" y="0" width="1" height="9"/><rect x="0" y="4" width="9" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="2" y="6" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/>',
  flow: '<rect x="0" y="3" width="9" height="3"/><rect x="3" y="0" width="3" height="9"/><rect x="1" y="1" width="1" height="1"/><rect x="7" y="1" width="1" height="1"/><rect x="1" y="7" width="1" height="1"/><rect x="7" y="7" width="1" height="1"/>',
  ne: '<rect x="3" y="0" width="3" height="2"/><rect x="1" y="2" width="7" height="1"/><rect x="0" y="3" width="9" height="4"/><rect x="1" y="7" width="7" height="1"/><rect x="3" y="8" width="3" height="1"/>',
  omp: '<rect x="0" y="1" width="9" height="1"/><rect x="0" y="4" width="9" height="1"/><rect x="0" y="7" width="9" height="1"/><rect x="1" y="1" width="1" height="1"/><rect x="7" y="4" width="1" height="1"/><rect x="1" y="7" width="1" height="1"/>',
  lcm: '<rect x="0" y="2" width="4" height="1"/><rect x="0" y="3" width="2" height="5"/><rect x="2" y="3" width="2" height="1"/><rect x="5" y="4" width="4" height="1"/><rect x="7" y="5" width="2" height="4"/>',
  vlp: '<rect x="1" y="1" width="7" height="1"/><rect x="0" y="2" width="9" height="1"/><rect x="0" y="5" width="9" height="1"/><rect x="1" y="6" width="7" height="1"/><rect x="2" y="3" width="1" height="1"/><rect x="4" y="3" width="1" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="2" y="7" width="1" height="1"/><rect x="4" y="7" width="1" height="1"/><rect x="6" y="7" width="1" height="1"/>',
  sys: '<rect x="1" y="0" width="7" height="1"/><rect x="0" y="1" width="1" height="7"/><rect x="8" y="1" width="1" height="7"/><rect x="1" y="8" width="7" height="1"/><rect x="3" y="3" width="3" height="3"/><rect x="4" y="0" width="1" height="1"/><rect x="4" y="8" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/>'
};
const TABS = [
  ['mock', '接 入', 'INGRESS'], ['flow', '引 擎', 'ENGINE'], ['ne', '标 本', 'SPECIMEN'],
  ['omp', '受管域', 'MANAGED'], ['lcm', '库 房', 'PACKAGE'], ['vlp', '虚 层', 'STACK'], ['sys', '系 统', 'SYSTEM']
];
const tabsHtml = '<nav class="tabs" id="tabs" aria-label="界面">' + TABS.map(([id, lb, en], i) => `
      <button class="tab${i === 0 ? ' is-active' : ''}" type="button" data-tab="${id}" data-screen="${id}"${i === 0 ? ' aria-current="page"' : ''} aria-label="${lb.replace(/ /g, '')} ${en}">
        <span class="tab__ico" aria-hidden="true"><svg viewBox="0 0 9 9" fill="currentColor">${ICONS[id]}</svg></span>
        <span class="tab__tx"><span class="tab__lb">${lb}</span><span class="tab__en">${i + 1} · ${en}</span></span>
      </button>`).join('') + `
    </nav>`;
let html = rd('index.html');
html = rep(html, '<nav class="tabs" id="tabs" aria-label="界面"></nav>', tabsHtml, 'index.html 静态页签');
wr('index.html', html);

/* ---------------- 2) app.js ---------------- */
let app = rd('app.js');
const oldTabs = /  function renderTabs\(\) \{[\s\S]*?\n  \}\n\n  \/\* -+ 渲染：页标题/;
const newTabs = `  // 页签是静态 HTML（首屏即渲染，也便于无障碍），这里只同步激活态
  function renderTabs() {
    var host = $('#tabs'); if (!host) return;
    if (host.__sig === UI.screen) return;
    host.__sig = UI.screen;
    Array.prototype.forEach.call(host.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-tab') === UI.screen;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------------------------------------------------------------- 渲染：页标题`;
if (oldTabs.test(app)) { app = app.replace(oldTabs, newTabs); log.push('✓ app.js renderTabs'); }
else log.push('✗ app.js renderTabs');

app = rep(app,
  "'<div class=\"stat__row\"><span>审计记录：</span><b>' + fmt(S.logs.length) + '</b></div>'",
  "'<div class=\"stat__row\"><span>审计记录：</span><b data-count=\"' + S.logs.length + '\">' + fmt(S.logs.length) + '</b></div>'",
  'app.js 审计记录 data-count');
app = rep(app,
  "'<div class=\"stat__row\"><span>累计命中：</span><b>' + fmt(hits) + '</b></div>'",
  "'<div class=\"stat__row\"><span>累计命中：</span><b data-count=\"' + hits + '\">' + fmt(hits) + '</b></div>'",
  'app.js 累计命中 data-count');

const countUpPatch = `    if (host.__sig !== html) { host.__sig = html; host.innerHTML = html; }
    // 数字滚动（技能预设 countUp）：只有值变了才动，避免每 2.6 秒重放
    Array.prototype.forEach.call(host.querySelectorAll('[data-count]'), function (b) {
      var v = +b.getAttribute('data-count');
      if (b.__v !== v) { b.__v = v; if (M && M.countUp && !M.reduced) M.countUp(b, v, { duration: 420 }); }
    });
  }`;
app = rep(app,
  `    if (host.__sig !== html) { host.__sig = html; host.innerHTML = html; }
  }`,
  countUpPatch, 'app.js countUp 挂载');

app = rep(app,
  `    bootEl.classList.add('is-off');
    UI.booted = true;`,
  `    bootEl.classList.add('is-off');
    // 光圈揭幕（技能预设 iris）：自检结束，主界面从中心展开
    if (M && M.iris) { var st = document.getElementById('stage'); if (st) M.iris(st, { duration: 560, origin: '50% 45%' }); }
    UI.booted = true;`,
  'app.js iris 揭幕');
wr('app.js', app);

/* ---------------- 3) screens.js：人工步骤带 interaction ---------------- */
let scr = rd('screens.js');
scr = rep(scr,
  `        A.addUpgradeStep(n.id, { name: name, kind: kd ? kd.value : 'auto', durationS: 30 });`,
  `        var kind = kd ? kd.value : 'auto';
        var step = { name: name, kind: kind, durationS: 30 };
        // 人工步骤必须带交互规格：执行到这里会停在闸门等人放行
        if (kind === 'human') { step.durationS = 0; step.interaction = { kind: 'human-confirm', owner: '值班工程师', timeoutS: 600 }; }
        A.addUpgradeStep(n.id, step);`,
  'screens.js 人工步骤 interaction');
wr('screens.js', scr);

console.log(log.join('\n'));

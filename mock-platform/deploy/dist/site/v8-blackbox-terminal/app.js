/* ============================================================================
 * V8 · BLACKBOX TERMINAL —— 核心层
 *   页签 / 列表（菱形光标）/ 主区 / 右侧状态面板 / 底部指令条 / 键盘导航 / 启动自检
 *   屏级渲染在 screens.js，通过 V8.register(name, def) 注册。
 * ==========================================================================*/
window.V8 = (function () {
  var S = MP.state, A = MP.actions, SEL = MP.select, M = MP.motion, X = MP.micro, B = MP.btn;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var pad = function (n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; };
  var clock = function (d) { d = d || new Date(); return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------------------------------------------------------------- 页签（7 个，对应参考图） */
  var ICO = {
    ingress: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="4" y="0" width="1" height="9"/><rect x="0" y="4" width="9" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="2" y="6" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/></svg>',
    engine: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="0" y="3" width="9" height="3"/><rect x="3" y="0" width="3" height="9"/><rect x="1" y="1" width="1" height="1"/><rect x="7" y="1" width="1" height="1"/><rect x="1" y="7" width="1" height="1"/><rect x="7" y="7" width="1" height="1"/></svg>',
    specimen: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="3" y="0" width="3" height="2"/><rect x="1" y="2" width="7" height="1"/><rect x="0" y="3" width="9" height="4"/><rect x="1" y="7" width="7" height="1"/><rect x="3" y="8" width="3" height="1"/></svg>',
    managed: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="0" y="1" width="9" height="1"/><rect x="0" y="4" width="9" height="1"/><rect x="0" y="7" width="9" height="1"/><rect x="1" y="1" width="1" height="1"/><rect x="7" y="4" width="1" height="1"/><rect x="1" y="7" width="1" height="1"/></svg>',
    pkg: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="0" y="2" width="4" height="1"/><rect x="0" y="3" width="2" height="5"/><rect x="2" y="3" width="2" height="1"/><rect x="5" y="4" width="4" height="1"/><rect x="7" y="5" width="2" height="4"/></svg>',
    stack: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="1" y="1" width="7" height="1"/><rect x="0" y="2" width="9" height="1"/><rect x="0" y="5" width="9" height="1"/><rect x="1" y="6" width="7" height="1"/><rect x="2" y="3" width="1" height="1"/><rect x="4" y="3" width="1" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="2" y="7" width="1" height="1"/><rect x="4" y="7" width="1" height="1"/><rect x="6" y="7" width="1" height="1"/></svg>',
    sys: '<svg viewBox="0 0 9 9" fill="currentColor"><rect x="1" y="0" width="7" height="1"/><rect x="0" y="1" width="1" height="7"/><rect x="8" y="1" width="1" height="7"/><rect x="1" y="8" width="7" height="1"/><rect x="3" y="3" width="3" height="3"/><rect x="4" y="0" width="1" height="1"/><rect x="4" y="8" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/></svg>'
  };
  var TABS = [
    { id: 'mock', lb: '接 入', en: 'INGRESS', ico: ICO.ingress },
    { id: 'flow', lb: '引 擎', en: 'ENGINE', ico: ICO.engine },
    { id: 'ne', lb: '标 本', en: 'SPECIMEN', ico: ICO.specimen },
    { id: 'omp', lb: '受管域', en: 'MANAGED', ico: ICO.managed },
    { id: 'lcm', lb: '库 房', en: 'PACKAGE', ico: ICO.pkg },
    { id: 'vlp', lb: '虚 层', en: 'STACK', ico: ICO.stack },
    { id: 'sys', lb: '系 统', en: 'SYSTEM', ico: ICO.sys }
  ];

  /* ---------------------------------------------------------------- 状态 */
  var UI = {
    mode: 'run',
    theme: 'nier',
    prefs: { density: 'normal', motion: 'full', sideOnBoot: 'expanded', startScreen: 'run' },
    theme: 'nier',
    collapse: { l: false, r: false },
    screen: 'run',
    sel: { port: null, api: null, ne: null, acc: null, pkg: null, vlp: null, audit: null, sys: 'display' },
    cur: { run: 0, audit: 0, gate: 0, mock: 0, flow: 0, ne: 0, omp: 0, lcm: 0, vlp: 0, sys: 0 },
    sub: { flow: 'recipe', ne: 'attr', omp: 'acc', lcm: 'pkg', vlp: 'all', sys: 'display' },
    neRun: null,
    grain: true,
    scan: true,
    snd: true,
    booted: false
  };
  var REG = {};
  var boot = false;

  function reg(name, def) {
    REG[name] = def;
    if (!UI.sel[def.selKey]) UI.sel[def.selKey] = null;
  }

  /* ---------------------------------------------------------------- 提示 */
  function toast(title, desc, tone, opt) {
    var host = $('#toasts'); if (!host) return;
    opt = opt || {};
    var node = document.createElement('div');
    node.className = 'toast' + (tone ? ' toast--' + tone : '');
    node.innerHTML = '<div class="toast__t"><span class="toast__mk mono">' + (tone === 'danger' ? '✕' : tone === 'warn' ? '!' : '✓') + '</span>' + esc(title) + '</div>' +
      (desc ? '<div class="toast__d">' + esc(desc) + '</div>' : '');
    host.appendChild(node);
    if (MP.sfx && UI.snd) MP.sfx.play(tone === 'danger' ? 'warn' : tone === 'warn' ? 'step' : 'confirm');
    setTimeout(function () { node.style.opacity = '0'; node.style.transition = 'opacity 200ms'; setTimeout(function () { node.remove(); }, 220); }, opt.duration || 2600);
  }

  /* ---------------------------------------------------------------- 渲染：页签 */
  // 页签是静态 HTML；这里同步：显隐（按模式）、激活态、运行中的锁
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
  }

  /* ---------------------------------------------------------------- 渲染：页标题 */
  function renderHead() {
    var d = REG[UI.screen]; if (!d) return;
    var t = $('#headTitle'), s = $('#headSub'), r = $('#headRight');
    if (t) t.textContent = d.title;
    if (s) s.textContent = d.sub;
    if (r) {
      var stats = d.stats ? d.stats() : [];
      var html = stats.map(function (x) {
        return '<div class="headStat"><i>' + esc(x.k) + '</i><b>' + esc(x.v) + '</b></div>';
      }).join('');
      if (r.__sig !== html) { r.__sig = html; r.innerHTML = html; }
    }
  }

  /* ---------------------------------------------------------------- 渲染：左列列表 */
  function listData() {
    var d = REG[UI.screen];
    if (!d || !d.list) return [];
    return d.list() || [];
  }
  function renderList() {
    var d = REG[UI.screen];
    var host = $('#list');
    if (!host || !d) return;
    var rows = listData();
    var cur0 = +UI.cur[UI.screen];
    UI.cur[UI.screen] = clamp(isNaN(cur0) ? 0 : cur0, 0, Math.max(0, rows.length - 1));
    var html = rows.length ? rows.map(function (r, i) {
      var on = i === UI.cur[UI.screen];
      return '<li><button class="row' + (on ? ' is-sel' : '') + '" type="button" data-row="' + esc(r.id) + '" data-i="' + i + '"' +
        (on ? ' aria-current="true"' : '') + '>' +
        '<span class="row__cursor" aria-hidden="true"></span>' +
        '<span class="row__mk" aria-hidden="true"></span>' +
        '<span class="row__tx"><span class="row__lb">' + esc(r.label) + '</span>' +
        (r.meta ? '<span class="row__mt">' + esc(r.meta) + '</span>' : '') + '</span>' +
        (r.count != null ? '<span class="row__ct">' + esc(r.count) + '</span>' : '') +
        '</button></li>';
    }).join('') : '<li><div class="empty">' + esc(d.empty || '无记录') + '</div></li>';
    if (host.__sig !== html) { host.__sig = html; host.innerHTML = html; }
    var tag = $('#listTag'), tagEn = $('#listTagEn');
    if (tag) tag.textContent = d.tag || '列表';
    if (tagEn) tagEn.textContent = d.tagEn || 'LIST';
    var foot = $('#listFoot');
    if (foot) {
      var fh = d.foot ? d.foot() : '';
      if (foot.__sig !== fh) { foot.__sig = fh; foot.innerHTML = fh; }
    }
    var thumb = $('#scrollThumb');
    if (thumb) {
      var p = rows.length > 6 ? clamp((UI.cur[UI.screen] + 1) / rows.length, 0, 1) * 100 : 0;
      thumb.style.top = Math.max(0, p - 22) + '%';
      thumb.style.height = rows.length > 6 ? '22%' : '100%';
    }
  }

  /* ---------------------------------------------------------------- 渲染：主区 */
  function renderMain() {
    var d = REG[UI.screen], host = $('#main');
    if (!host || !d) return;
    var html = d.main ? d.main() : '';
    if (host.__sig === html) return;
    host.__sig = html;
    host.innerHTML = '<div class="mainbody">' + html + '</div>';
    if (d.mount) { try { d.mount(); } catch (err) { console.error('[V8 mount]', err); } }
    if (B) B.enhance(host);
  }

  /* ---------------------------------------------------------------- 渲染：右侧状态面板（参考图的「状态」） */
  function renderStatus() {
    var host = $('#status'); if (!host) return;
    var running = S.ports.filter(function (p) { return p.status === 'running'; }).length;
    var _pf = SEL.port(); var capsMounted = (_pf && (_pf.caps || []).length) || 0;
    var hits = S.apis.reduce(function (n, a) { return n + (a.hits || 0); }, 0);
    var byMethod = { weak: 0, strong: 0, shot: 0 };
    S.apis.forEach(function (a) {
      var m = (a.method || 'GET').toUpperCase();
      if (m === 'GET') byMethod.weak++;
      else if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') byMethod.strong++;
      else byMethod.shot++;
    });
    var blocked = S.logs.filter(function (l) { return (l.status || 200) >= 400; }).length;
    var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length;
    var health = S.ports.length ? Math.round(running / S.ports.length * 100) : 0;
    var slots = '';
    for (var i = 0; i < 11; i++) slots += '<span class="slot' + (i < capsMounted ? ' is-on' : '') + '"></span>';
    var html =
      '<div class="stat__hd"><b>状 态</b><i>STATUS</i></div>' +
      '<div class="stat__bd">' +
        '<div class="stat__idrow"><span class="stat__id">MOCK-2B</span><span class="stat__lv">Lv : ' + pad(S.apis.length, 2) + '</span></div>' +
        '<div class="stat__row"><span>在服端点：</span><b>' + running + ' / ' + S.ports.length + '</b></div>' +
        '<div class="stat__row"><span>审计记录：</span><b data-count="' + S.logs.length + '">' + fmt(S.logs.length) + '</b></div>' +
        '<div class="stat__row"><span>累计命中：</span><b data-count="' + hits + '">' + fmt(hits) + '</b></div>' +
        '<div class="stat__row stat__row--hp"><span>服务健康：</span><span class="stat__bar"><i style="width:' + health + '%"></i></span><b>' + health + '%</b></div>' +
        '<div class="stat__row"><span>弱接口：</span><b>' + fmt(byMethod.weak) + '</b></div>' +
        '<div class="stat__row"><span>强接口：</span><b>' + fmt(byMethod.strong) + '</b></div>' +
        '<div class="stat__row"><span>射击接口：</span><b>' + fmt(byMethod.shot) + '</b></div>' +
        '<div class="stat__row"><span>异 常：</span><b>' + fmt(blocked) + '</b></div>' +
        '<div class="stat__slots" aria-label="已挂载能力">' + slots + '</div>' +
        '<div class="stat__foot' + (pending ? ' is-bad' : '') + '">' + (pending ? pending + ' 项待放行' : '无错误') + '</div>' +
      '</div>';
    if (host.__sig !== html) { host.__sig = html; host.innerHTML = html; }
    // 数字滚动（技能预设 countUp）：只有值变了才动，避免每 2.6 秒重放
    Array.prototype.forEach.call(host.querySelectorAll('[data-count]'), function (b) {
      var v = +b.getAttribute('data-count');
      if (b.__v !== v) { b.__v = v; if (M && M.countUp && !M.reduced) M.countUp(b, v, { duration: 420 }); }
    });
  }

  /* ---------------------------------------------------------------- 渲染：底部指令条 */
  function renderCmd() {
    var d = REG[UI.screen], txt = $('#cmdText'), keys = $('#cmdKeys');
    if (txt) {
      var t = (d && d.cmd) ? d.cmd() : '选择。';
      if (txt.textContent !== t) txt.textContent = t;
    }
    if (keys) {
      var html = '<span class="keys"><span class="key">W</span><span class="key">S</span><em>选择</em></span>' +
        '<span class="keys"><span class="key key--wide">Enter</span><em>确认</em></span>' +
        '<span class="keys"><span class="key key--wide">Esc</span><em>返回</em></span>' +
        '<span class="keys"><span class="key">1</span><span class="key">-</span><span class="key">7</span><em>界面</em></span>' +
        '<span class="keys"><span class="key">[</span><span class="key">]</span><em>侧栏</em></span>';
      if (keys.__sig !== html) { keys.__sig = html; keys.innerHTML = html; }
    }
  }

  function render() {
    renderTabs(); renderHead(); renderList(); renderMain(); renderStatus(); renderCmd();
    applyLayout(); syncRails();
  }

  // 细轨上的文字与计数跟着当前屏走
  function syncRails() {
    var d = REG[UI.screen];
    var lb = $('#railLb'), en = $('#railEn'), ct = $('#railCt'), stat = $('#railStat');
    if (lb && d) lb.textContent = (d.tag || '').replace(/\s/g, '') || '列表';
    if (en && d) en.textContent = d.tagEn || 'LIST';
    if (ct) {
      var rows = listData().length;
      ct.textContent = rows + ' 项';
    }
    if (stat) {
      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length;
      stat.textContent = pending ? pending + ' 待放行' : '无错误';
    }
  }

  /* ---------------------------------------------------------------- 屏级动作 */
  function act(name, node, ev) {
    var d = REG[UI.screen];
    if (d && d.act && d.act[name]) { d.act[name](node, ev); return true; }
    if (REG._global && REG._global[name]) { REG._global[name](node, ev); return true; }
    return false;
  }

  function selectRow(id, i) {
    if (!id) return;
    UI.cur[UI.screen] = i;
    var d = REG[UI.screen];
    if (d && d.pick) d.pick(id, i);
    render();
  }

  /* ---------------------------------------------------------------- 事件 */
  function onDocClick(e) {
    var sideBtn = e.target.closest('[data-side]');
    if (sideBtn) { toggleSide(sideBtn.getAttribute('data-side')); return; }
    var mb = e.target.closest('.mode');
    if (mb) { setMode(mb.getAttribute('data-mode')); return; }
    if (e.target.closest('[data-act="stopForPrep"]')) {
      S.ports.forEach(function (p) { if (p.running) A.stopService(p.id); });
      setMode('prep'); toast('服务已停止', '可以进入准备台编辑了', 'ok'); render();
      return;
    }
    var tab = e.target.closest('[data-tab]');
    if (tab) { go(tab.getAttribute('data-tab')); return; }
    var row = e.target.closest('[data-row]');
    if (row) { selectRow(row.getAttribute('data-row'), +row.getAttribute('data-i')); return; }
    var a = e.target.closest('[data-act]');
    if (a) {
      var name = a.getAttribute('data-act');
      if (act(name, a, e)) { if (a.hasAttribute('data-norender') !== true) setTimeout(render, 0); return; }
    }
  }

  function onDocChange(e) {
    var t = e.target;
    if (t.matches('[data-fk]')) {
      var d = REG[UI.screen];
      if (d && d.change) d.change(t.getAttribute('data-fk'), t);
      setTimeout(render, 0);
    }
  }

  function onSubmit(e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    var d = REG[UI.screen];
    if (d && d.submit) d.submit(f.getAttribute('data-form'), f);
    setTimeout(function () { render(); renderStatus(); }, 0);
  }

  function isTyping(el2) {
    if (!el2) return false;
    var tag = (el2.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el2.isContentEditable;
  }

  function onDocKey(e) {
    if (!UI.booted) { skipBoot(); return; }
    if (e.key === 'Escape') {
      if (isTyping(document.activeElement)) { document.activeElement.blur(); e.preventDefault(); return; }
      var d = REG[UI.screen];
      if (d && d.esc && d.esc()) { render(); e.preventDefault(); return; }
      if (UI.sel[REG[UI.screen] && REG[UI.screen].selKey]) {
        UI.sel[REG[UI.screen].selKey] = null; render(); e.preventDefault();
      }
      return;
    }
    if (isTyping(document.activeElement)) {
      if (e.key === 'Enter' && document.activeElement.form) { /* 交给表单 */ }
      return;
    }
    var k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup' || k === 's' || k === 'arrowdown') {
      var rows = listData();
      if (!rows.length) return;
      var delta = (k === 'w' || k === 'arrowup') ? -1 : 1;
      var d2 = REG[UI.screen];
      if (d2 && d2.move && d2.move(delta)) { render(); e.preventDefault(); return; }
      var nx = clamp(UI.cur[UI.screen] + delta, 0, rows.length - 1);
      if (nx !== UI.cur[UI.screen]) { selectRow(rows[nx].id, nx); }
      e.preventDefault(); return;
    }
    if (e.key === 'Enter') {
      var d3 = REG[UI.screen];
      var rows3 = listData();
      var row = rows3[UI.cur[UI.screen]];
      if (d3 && d3.enter && d3.enter(row ? row.id : null)) { render(); e.preventDefault(); return; }
      return;
    }
    if (e.key === 't' || e.key === 'T') { cycleTheme(); e.preventDefault(); return; }
    if (e.key === 't' || e.key === 'T') { cycleTheme(); e.preventDefault(); return; }
    if (e.key === '[') { toggleSide('l'); e.preventDefault(); return; }
    if (e.key === ']') { toggleSide('r'); e.preventDefault(); return; }
    if (/^[1-9]$/.test(e.key)) {
      var vis = Array.prototype.filter.call(document.querySelectorAll('.tab'), function (b) { return !b.hidden; });
      var t = vis[+e.key - 1];
      if (t) { go(t.getAttribute('data-tab')); e.preventDefault(); }
    }
  }

  var THEMES = ['nier', 'white', 'codex'];
  var PREF_DEF = { density: 'normal', motion: 'full', sideOnBoot: 'expanded', startScreen: 'run' };

  function loadPrefs() {
    try {
      var raw = localStorage.getItem('v8.prefs');
      if (raw) {
        var o = JSON.parse(raw) || {};
        Object.keys(PREF_DEF).forEach(function (k) { if (o[k] != null) UI.prefs[k] = o[k]; });
      }
    } catch (e) {}
  }
  function savePrefs() { try { localStorage.setItem('v8.prefs', JSON.stringify(UI.prefs)); } catch (e) {} }
  function applyPrefs() {
    var h = document.documentElement;
    h.setAttribute('data-density', UI.prefs.density || 'normal');
    h.setAttribute('data-motion', UI.prefs.motion || 'full');
    Array.prototype.forEach.call(document.querySelectorAll('[data-pref]'), function (b) {
      if (b.getAttribute('data-pref') !== Object.keys({})[0] && false) return;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pref-group]'), function (b) {
      var g = b.getAttribute('data-pref-group');
      var on = String(UI.prefs[g]) === String(b.getAttribute('data-pref-v'));
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function setPref(k, v) {
    if (!(k in PREF_DEF)) return;
    if (k === 'density' && v !== UI.prefs.density) {
      withSwap('reflow', function () { UI.prefs[k] = v; savePrefs(); applyPrefs(); });
      return;
    }
    UI.prefs[k] = v;
    savePrefs(); applyPrefs();
    if (k === 'sideOnBoot') applySidePreset(v);
  }
  function applySidePreset(v) {
    UI.collapse.l = v === 'l' || v === 'both';
    UI.collapse.r = v === 'r' || v === 'both';
    applyLayout();
  }
  function resetPrefs() {
    UI.prefs = JSON.parse(JSON.stringify(PREF_DEF));
    savePrefs(); applyPrefs();
    try { localStorage.removeItem('v8.theme'); } catch (e) {}
    applyTheme('nier', true);
    applySidePreset(UI.prefs.sideOnBoot);
  }
  // —— 切换过渡：换色 / 重排时给一点时间，别硬闪 ——
  var _swapping = false;
  function motionAllowed() {
    if (UI.prefs && UI.prefs.motion === 'off') return false;
    if (M && M.reduced) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) {}
    return true;
  }
  function beginSwap(kind) {
    if (_swapping || !motionAllowed()) return false;
    _swapping = true;
    document.documentElement.classList.add('is-theming');
    var st = document.getElementById('stage');
    if (st) {
      st.classList.remove('is-swap', 'is-reflow');
      void st.offsetWidth;                       // 强制一次重排，确保过渡从旧值开始
      st.classList.add(kind === 'reflow' ? 'is-reflow' : 'is-swap');
    }
    return true;
  }
  function endSwap(ok) {
    if (!ok) return;
    setTimeout(function () {
      document.documentElement.classList.remove('is-theming');
      var st = document.getElementById('stage');
      if (st) st.classList.remove('is-swap', 'is-reflow');
      _swapping = false;
    }, 420);
  }
  // 双 rAF：先让过渡属性生效，再改 token，浏览器才会从旧颜色补间到新颜色
  function withSwap(kind, fn) {
    if (!beginSwap(kind)) { fn(); return; }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { fn(); endSwap(true); });
    });
  }

  function applyTheme(name, animate) {
    if (THEMES.indexOf(name) < 0) name = 'nier';
    if (animate && name !== UI.theme) { withSwap('swap', function () { applyTheme(name, false); }); return; }
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
  function setTheme(name) { applyTheme(name, true); }
  function cycleTheme() {
    applyTheme(THEMES[(THEMES.indexOf(UI.theme) + 1) % THEMES.length], true);
    if (typeof toast === 'function') toast('配色已切换', ({ nier: '暖纸 · 尼尔', white: '纯白 · 瑞士', codex: '蓝黑 · 专业' })[UI.theme], 'ok', { duration: 1600 });
  }
  function loadTheme() {
    try { var t = localStorage.getItem('v8.theme'); if (t) applyTheme(t); } catch (e) {}
  }

  function saveLayout() {
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

  function isRunning() { return S.ports.some(function (x) { return x.running; }); }

  function lockToast() {
    toast('准备台已锁', '服务运行中，停止后才能编辑配置', 'warn', { duration: 3200 });
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
    UI.screen = id;
    if (A && A.setScreen) A.setScreen(id === 'sys' ? 'mock' : id);
    render();
    var inst = $('#main');
    if (inst && M && !M.reduced) M.develop(inst, { duration: 260 });
  }

  /* ---------------------------------------------------------------- 启动自检 */
  var BOOT_LINES = [
    '正在开始系统检验', '记忆单元检测：正常', '正在初始化终端会话', '正在载入平台数据',
    '体征检测：正常', '剩余 MP 检测：100%', '黑匣子温度：正常', '黑匣子内部压力：正常',
    '正在启动 IFF', '正在启动 FCS', '正在启动辅助机通讯连接', '正在启动 DBU 配置',
    '正在启动惯性控制系统', '正在启动环境传感器',
    '接口认证：完成', '端点状态检测：通过', '系统：完全就绪'
  ];
  var bootTimer = null, bootDone = false;
  function runBoot() {
    var box = $('#bootLog'), bootEl = $('#boot');
    if (!box || !bootEl) { UI.booted = true; return; }
    bootEl.classList.remove('is-off');
    box.innerHTML = '';
    UI.booted = false;
    var i = 0;
    var tick2 = function () {
      if (i >= BOOT_LINES.length) {
        bootDone = true;
        setTimeout(finishBoot, 380);
        return;
      }
      var li = document.createElement('li');
      li.className = i >= BOOT_LINES.length - 2 ? 'is-key' : '';
      var parts = BOOT_LINES[i].split('：');
      li.innerHTML = parts.length > 1 ? esc(parts[0]) + '：<b>' + esc(parts.slice(1).join('：')) + '</b>' : esc(BOOT_LINES[i]);
      box.appendChild(li);
      i++;
      bootTimer = setTimeout(tick2, 105);
    };
    tick2();
    var c = $('#bootClock');
    if (c) { c.textContent = clock(); var t3 = setInterval(function () { if (!bootDone) c.textContent = clock(); else clearInterval(t3); }, 1000); }
  }
  function finishBoot() {
    var bootEl = $('#boot');
    if (!bootEl) return;
    bootEl.classList.add('is-off');
    // 光圈揭幕（技能预设 iris）：自检结束，主界面从中心展开
    if (M && M.iris) { var st = document.getElementById('stage'); if (st) M.iris(st, { duration: 560, origin: '50% 45%' }); }
    UI.booted = true;
    bootDone = true;
    setTimeout(function () { bootEl.style.display = 'none'; }, 340);
    render();
  }
  function skipBoot() {
    if (UI.booted) return;
    if (bootTimer) clearTimeout(bootTimer);
    finishBoot();
  }

  /* ---------------------------------------------------------------- 主题/质感开关（系统屏用） */
  function setGrain(on) { UI.grain = on; var g = $('.grain'); if (g) g.style.display = on ? '' : 'none'; }
  function setScan(on) { UI.scan = on; var s = $('.boot__scan'); if (s) s.style.display = on ? '' : 'none'; }
  function setDim(on) { document.documentElement.setAttribute('data-theme', on ? 'dim' : ''); }

  /* ---------------------------------------------------------------- 事件挂载 */
  loadLayout(); loadTheme(); loadPrefs(); applyPrefs();
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'themeSel') applyTheme(e.target.value, true);
  });
  document.addEventListener('click', onDocClick);
  document.addEventListener('change', onDocChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onDocKey);

  /* ---------------------------------------------------------------- 暴露 */
  function rerender() { render(); }

  return {
    state: UI, reg: reg, render: render, rerender: rerender, act: act, toast: toast, go: go,
    setMode: setMode, isRunning: isRunning, lockToast: lockToast, toggleSide: toggleSide,
    setTheme: setTheme, cycleTheme: cycleTheme, themes: THEMES,
    prefs: function () { return UI.prefs; }, setPref: setPref, applyPrefs: applyPrefs, resetPrefs: resetPrefs,
    applySidePreset: applySidePreset,
    setTheme: setTheme, cycleTheme: cycleTheme, themes: THEMES,
    runBoot: runBoot, skipBoot: skipBoot, setGrain: setGrain, setScan: setScan, setDim: setDim,
    setSnd: function (v) { UI.snd = v; if (MP.sfx && MP.sfx.enabled !== v) MP.sfx.toggle(v); },
    h: esc, f: fmt, p: pad, clock: clock, clamp: clamp,
    booted: function () { return UI.booted; },
    debug: { reg: REG, tabs: TABS }
  };
})();

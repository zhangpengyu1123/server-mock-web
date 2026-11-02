/* ============================================================================
 * V5 · 音乐调测台（Rhine Music Console） —— 一次性自检 / 冒烟脚本
 *   （不在 index.html 的引用链里，交付运行时用不到；验收跑完可删）
 *
 * 用法（在 mock-platform 目录下）：
 *   node --check v5-music-console/app.js
 *   node v5-music-console/_check.mjs
 *
 * 两部分：
 *   A. 静态自检 —— a) app.js 里所有 $('#id') / getElementById('id') 都存在于 index.html
 *                   b) 六屏 / 六刻度 / 双主题 / MP.btn ≥4 类 / MP.micro ≥8 个 / 动效与断点
 *                   c) 交付清单与零外部依赖
 *   B. 无浏览器冒烟 —— 手写极小 DOM 替身，真跑 _shared/*.js + app.js：
 *      boot、六屏切换、全部 domain 动作、事件委托、键盘、渲染内容断言。
 *      **不开浏览器、不占端口**（本任务明确要求）。
 * ==========================================================================*/
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(here, '..', '_shared');
const html = await readFile(path.join(here, 'index.html'), 'utf8');
const css = await readFile(path.join(here, 'app.css'), 'utf8');
const js = await readFile(path.join(here, 'app.js'), 'utf8');
const readme = await readFile(path.join(here, 'README.md'), 'utf8').catch(() => '');

const fail = [];
const ok = [];
function check(cond, label, detail) { (cond ? ok : fail).push(label + (detail ? '  → ' + detail : '')); }

/* ======================================================== A. 静态自检 */
const staticIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
/* 动态注入容器的白名单（由 app.js 自己拼出来 / index.html 已声明）
   + 其它代理在同一目录追加的块所引用的 id（本版核心不依赖它们，但不能因此判为缺失） */
const DYN = new Set(['popTitle', 'popBody', 'toasts', 'thumbBtn', 'collStats', 'fpsBadge']);

const usedStatic = new Set();
for (const m of js.matchAll(/\$\(\s*'#([A-Za-z][\w-]*)'/g)) usedStatic.add(m[1]);
for (const m of js.matchAll(/getElementById\(\s*'([A-Za-z][\w-]*)'/g)) usedStatic.add(m[1]);
const jsGenIds = new Set([...js.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]));
const patternIds = [...js.matchAll(/\bid="([A-Za-z][\w-]*)-\s*'/g)].map((m) => m[1]);
const missing = [...usedStatic].filter((id) => {
  if (staticIds.has(id) || DYN.has(id) || jsGenIds.has(id)) return false;
  return !patternIds.some((p) => id.startsWith(p + '-'));
});
check(missing.length === 0, "a) app.js 里 $('#id') / getElementById('id') 全部存在于 index.html（动态列白名单）",
  missing.length ? '缺失：' + missing.join(', ') : usedStatic.size + ' 个字面量 id 全部命中');

const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = [...new Set(idList.filter((v, i) => idList.indexOf(v) !== i))];
check(dup.length === 0, 'a2) index.html 无重复 id', dup.length ? '重复：' + dup.join(', ') : idList.length + ' 个 id 唯一');

const screens = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
check(screens.every((s) => html.includes('data-screen="' + s + '"')), 'b1) 六个 data-screen 齐全', screens.join(', '));
check(/NAV_ORDER\s*=\s*\[/.test(js) && screens.every((s) => js.includes("'" + s + "'")), 'b2) 六屏顺序由 NAV_ORDER 定义');
check(/function buildRuler\(\)/.test(js) && /mcr__tick/.test(js) && /\.dataset\.nav = id/.test(js), 'b3) 刻度尺导航生成逻辑（六刻度 + data-nav）');
check(/data-theme-set="dawn"/.test(html) && /data-theme-set="moon"/.test(html) && /localStorage\.setItem\(THEME_KEY/.test(js) && /localStorage\.getItem\(THEME_KEY/.test(js),
  'b4) 双主题控件（晨雾／月影）+ localStorage 持久化');
check(/THEME_KEY\s*=\s*'mp-v5-theme'/.test(js), 'b5) 主题键独立（mp-v5-theme，不与 v3/v4 冲突）');
check(html.includes('data-fx="transport"'), 'b6) transport 大圆形主控带 data-fx="transport"');

const btnUses = ['install', 'enhance', 'loading', 'ripple'].filter((k) => new RegExp('MP\\.btn\\.' + k + '\\s*\\(').test(js));
check(btnUses.length >= 4, 'b7) MP.btn ≥4 类用法', btnUses.join(', '));
const fxTiers = ['subtle', 'standard', 'transport', 'none'].filter((t) => html.includes('data-fx="' + t + '"') || js.includes('data-fx="' + t + '"'));
check(fxTiers.length >= 3, 'b8) data-fx 分级使用', fxTiers.join(', '));
check((js.match(/data-fx="standard"/g) || []).length >= 4, 'b9) 六屏合计「主行动」按钮 ≥4 处',
  String((js.match(/data-fx="standard"/g) || []).length) + ' 处 standard');
check(/MP\.btn\.loading\(/.test(js), 'b10) 异步操作使用 MP.btn.loading',
  String((js.match(/MP\.btn\.loading\(/g) || []).length) + ' 处');
check(/dataset\.fx = 'magnetic'/.test(js) && /MP\.micro\.magnetic\(/.test(js), 'b11) magnetic 按屏分配（一屏 1 个，符合技能约束）');

const MICRO = ['holdConfirm', 'velocitySwitch', 'gauge', 'statusMark', 'scrub', 'toast', 'rippleLoader', 'latticeLoader', 'segmented', 'fuseButton', 'magnetic', 'spotlight'];
const microUsed = MICRO.filter((k) => new RegExp('(X|MP\\.micro)\\.' + k + '\\s*\\(').test(js));
check(microUsed.length >= 8, 'b12) MP.micro ≥8 个不同原语（语义位置）', microUsed.length + ' 个：' + microUsed.join(', '));

/* app.js 里可能有后续追加的独立 IIFE（例如「原图补遗」块）：报出来，便于分辨作者 */
const iifeCount = (js.match(/^\(function \(\) \{/gm) || []).length;
check(iifeCount >= 1, 'b12b) app.js 顶层 IIFE 数量', String(iifeCount) + ' 个（>1 说明有其它代理追加了独立块）');

check(/is-entering/.test(js) && /mcContentIn/.test(css), 'b13) ContentTransition（.is-entering + mcContentIn 关键帧）');
check(/--t-content:\s*calc\(360ms/.test(css), 'b14) ContentTransition 时长 360ms');
check(/M\.carry\(/.test(js) && /M\.iris\(/.test(js), 'b15) 切换用 carry() / iris()（不硬切）');
check(/idle = MP\.clamp\(\(now - lastInteract - 2500\)/.test(js), 'b16) 交互后 2.5s 缓入常态轻微波动');
check(/stepWaves/.test(js) && /phase = ci \* 0\.55/.test(js), 'b17) 列与列之间异步波峰（相位差）');
check(/M\.reduced/.test(js) && /prefers-reduced-motion/.test(css), 'b18) 减少动态效果（JS + CSS 双保险）');
check(/getContext\('2d'\)/.test(js) && /id="spectrum"/.test(html), 'b19) canvas 频谱（#spectrum）');
check(/id="tlTrack"/.test(html) && /function makeScrub\(\)/.test(js), 'b20) 时间轴 scrub（#tlTrack）');
check(/id="rateWrap"/.test(html) && /function setRate\(/.test(js), 'b21) 速率刻度（#rateWrap）');
check(/id="npEndpoint"/.test(html) && /function npInfo\(\)/.test(js), 'b22) 「正在服务」端点信息（#npEndpoint）');

const order = ['domain.js', 'motion.js', 'micro.js', 'button-fx.js', 'fx.js', 'app.js'].map((f) => html.indexOf(f));
check(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), 'c1) 脚本引入顺序符合 _shared/README 契约', order.join(' < '));
check(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org[^"']*/g, '')), 'c2) 无外链资源（无 CDN）');
check(!/@font-face/.test(css) && !/\.woff|\.ttf/.test(html + css), 'c3) 无外链字体（MiSans 走系统回退）');
check(!/<img\b/.test(html) && /<svg/.test(html), 'c4) 图标全部内联 SVG（无位图、无 emoji）');
check(readme.length > 0, 'c5) README.md 已写', readme.length + ' 字节');

const bp = ['480', '768', '1023', '1440'].filter((n) => css.includes(n + 'px'));
check(bp.length >= 4, 'd1) 375 / 768 / 1024 / 1440 四档媒体查询齐备', bp.map((b) => '@' + b + 'px').join(' '));
check(/overflow-x:\s*auto/.test(css) && /overflow-x:\s*hidden/.test(css), 'd2) 容器内横向滚动 + 文档级 overflow-x 防线');

/* ======================================================== B. 无浏览器冒烟 */
const errors = [];
const warns = [];
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'option', 'source', 'col']);
const SELF_CLOSE = new Set(['circle', 'path', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'stop']);
const htmlById = new Map();

class Style {
  constructor() { this._p = {}; this.cssText = ''; this.transition = ''; this.transform = ''; }
  setProperty(k, v) { this._p[k] = v; }
  getPropertyValue(k) { return this._p[k] || ''; }
  removeProperty(k) { delete this._p[k]; }
}
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.ownerDocument = null;
    this._attrs = {}; this._classes = new Set();
    this.style = new Style(); this.dataset = {}; this._listeners = {};
    this.hidden = false; this.disabled = false; this.tabIndex = -1;
    this.value = ''; this.textContent = ''; this._html = '';
    this.scrollLeft = 0; this.scrollTop = 0;
    this.scrollWidth = 400; this.clientWidth = 400; this.scrollHeight = 300; this.clientHeight = 300;
    this.offsetWidth = 100; this.offsetHeight = 40; this.clientLeft = 0;
  }
  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = v; if (this.dataset) this.dataset.id = v; }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this._classes;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      toggle: (c, on) => { if (on === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (on) s.add(c); else s.delete(c); },
      contains: (c) => s.has(c)
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v == null ? '' : v); this.children = []; parseFragment(this, this._html); }
  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === 'class') this.className = v;
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return this._attrs[k] !== undefined; }
  appendChild(n) { if (!n) return n; n.parentNode = this; n.ownerDocument = this.ownerDocument; this.children.push(n); return n; }
  insertBefore(n) { return this.appendChild(n); }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  click() { this.dispatch('click', { target: this, clientX: 1, clientY: 1 }); }
  setPointerCapture() {} releasePointerCapture() {}
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter((f) => f !== fn); }
  dispatch(type, ev) {
    ev = ev || {}; ev.type = type; ev.target = ev.target || this;
    ev.preventDefault = ev.preventDefault || (() => {});
    ev.stopPropagation = ev.stopPropagation || (() => {});
    const run = (n) => (n._listeners[type] || []).forEach((fn) => {
      try { fn(ev); } catch (e) { errors.push(type + ' @ ' + n.tagName + '.' + n.className + ' → ' + e.message); }
    });
    run(this);
    let p = this.parentNode;
    while (p) { run(p); p = p.parentNode; }
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.offsetWidth, height: this.offsetHeight, right: this.offsetWidth, bottom: this.offsetHeight }; }
  closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; }
  matches(sel) { return matches(this, sel); }
  querySelector(sel) { return query(this, sel)[0] || null; }
  querySelectorAll(sel) { return query(this, sel); }
  animate() { return { cancel() {}, finished: Promise.resolve() }; }
  getContext() { return ctx2d(); }
}

function parseFragment(host, fragment) {
  const stack = [host];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(fragment))) {
    const closing = fragment[m.index + 1] === '/';
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const selfClose = m[3] === '/' || VOID.has(tag) || SELF_CLOSE.has(tag);
    if (closing) {
      if (stack.length > 1 && stack[stack.length - 1].tagName === tag.toUpperCase()) stack.pop();
      continue;
    }
    const n = host.ownerDocument.createElement(tag);
    /* 属性解析必须认引号，否则 data-prop="a.b" 会被后面的引号吃掉值 */
    for (const a of attrs.matchAll(/([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const val = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
      n.setAttribute(a[1], val);
    }
    stack[stack.length - 1].appendChild(n);
    if (n.id) htmlById.set(n.id, n);
    if (!selfClose) stack.push(n);
  }
  return host;
}

function matchSimple(n, sel) {
  if (!sel) return false;
  const nots = [];
  const s = String(sel).replace(/:not\(([^)]*)\)/g, (_, inner) => { nots.push(inner.trim()); return ''; });
  for (const neg of nots) if (matchSimple(n, neg)) return false;
  const re = /\[[^\]]*\]|#[\w-]+|\.[\w-]+|[a-zA-Z][\w-]*/g;
  let m, saw = false;
  while ((m = re.exec(s))) {
    const p = m[0]; saw = true;
    if (p.startsWith('#')) { if (n.id !== p.slice(1)) return false; }
    else if (p.startsWith('.')) { if (!n._classes.has(p.slice(1))) return false; }
    else if (p.startsWith('[')) {
      const mm = /^\[([\w-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?\]$/.exec(p);
      if (!mm) return false;
      const [, key, op, val] = mm;
      let cur;
      if (key === 'class') cur = n.className;
      else if (key.startsWith('data-')) cur = n.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      else cur = n.getAttribute(key);
      if (op === undefined) { if (cur === undefined || cur === null) return false; }
      else if (op === '=') { if (String(cur) !== String(val)) return false; }
      else if (op === '~=') { if (!String(cur || '').split(/\s+/).includes(val)) return false; }
      else if (op === '^=') { if (!String(cur || '').startsWith(val)) return false; }
      else if (op === '$=') { if (!String(cur || '').endsWith(val)) return false; }
      else if (op === '*=') { if (!String(cur || '').includes(val)) return false; }
    } else if (n.tagName !== p.toUpperCase()) return false;
  }
  return saw;
}
function matches(n, sel) {
  return String(sel).split(',').map((x) => x.trim()).filter(Boolean).some((one) => {
    const chain = one.split(/\s+/).filter(Boolean);
    if (chain.length === 1) return matchSimple(n, chain[0]);
    if (!matchSimple(n, chain[chain.length - 1])) return false;
    let cur = n.parentNode, idx = chain.length - 2;
    while (cur && idx >= 0) { if (matchSimple(cur, chain[idx])) idx--; cur = cur.parentNode; }
    return idx < 0;
  });
}
function query(root, sel) {
  const out = [], seen = new Set();
  (function visit(n) {
    for (const c of n.children || []) { if (matches(c, sel) && !seen.has(c)) { seen.add(c); out.push(c); } visit(c); }
  })(root);
  return out;
}
function ctx2d() {
  return {
    setTransform() {}, clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {},
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    fillStyle: '', strokeStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1
  };
}

const registry = [], detached = [];
const doc = {
  readyState: 'complete', hidden: false, activeElement: null,
  documentElement: new El('html'), head: new El('head'), body: new El('body'), _listeners: {},
  createElement(tag) { const e = new El(tag); e.ownerDocument = doc; registry.push(e); return e; },
  createComment() { return doc.createElement('span'); },
  createDocumentFragment() { return doc.createElement('div'); },
  createTextNode(t) { const e = doc.createElement('span'); e.textContent = t; return e; },
  getElementById(id) { return htmlById.get(id) || null; },
  querySelector(sel) { return doc.querySelectorAll(sel)[0] || null; },
  querySelectorAll(sel) { return query(doc.documentElement, sel).concat(detached.filter((e) => matches(e, sel))); },
  addEventListener(t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn); },
  removeEventListener() {},
  dispatch(type, ev) {
    ev = ev || {}; ev.type = type; ev.target = ev.target || doc.body;
    ev.preventDefault = ev.preventDefault || (() => {});
    ev.stopPropagation = ev.stopPropagation || (() => {});
    (doc._listeners[type] || []).forEach((fn) => { try { fn(ev); } catch (e) { errors.push('doc ' + type + ' → ' + e.message); } });
  }
};
doc.documentElement.ownerDocument = doc;
const bodyStart = html.indexOf('<body>'), bodyEnd = html.lastIndexOf('</body>');
parseFragment(doc.documentElement, html.slice(bodyStart + 6, bodyEnd)
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, ''));
(function index(n) { (n.children || []).forEach((c) => { if (c.id) htmlById.set(c.id, c); registry.push(c); index(c); }); })(doc.documentElement);

const store = {}, rafQ = [];
const win = {
  devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900, document: doc,
  location: { href: 'http://127.0.0.1:4500/v5-music-console/' },
  navigator: { userAgent: 'node-check' },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (fn) => rafQ.push(fn),
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 4)),
  clearTimeout, setInterval: (fn, ms) => setInterval(fn, Math.max(ms || 0, 1000)), clearInterval,
  addEventListener() {}, removeEventListener() {},
  getComputedStyle: () => ({ getPropertyValue: () => '#a67d48' }),
  console: {
    log: (...a) => warns.push('[log] ' + a.join(' ')),
    warn: (...a) => warns.push('[warn] ' + a.join(' ')),
    error: (...a) => errors.push('[error] ' + a.join(' '))
  },
  performance: { now: () => Date.now() },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
  AudioContext: null,
  /* fx.js 的 aurora/mesh 需要能 new 出来 */
  Function: function () { return { stop() {}, canvas: null, ctx: ctx2d(), size: { w: 100, h: 40 } }; },
  WeakSet, WeakMap, Map, Set, Promise, JSON, Math, Date, String, Number, Array, Object, RegExp, Error,
  parseFloat, parseInt, isNaN, Uint8ClampedArray
};
win.window = win; win.self = win; win.globalThis = win;

const ctx = vm.createContext(win);
for (const f of ['domain.js', 'motion.js', 'micro.js', 'button-fx.js', 'fx.js']) {
  try { vm.runInContext(await readFile(path.join(sharedDir, f), 'utf8'), ctx, { filename: '_shared/' + f }); }
  catch (e) { errors.push('载入 _shared/' + f + ' 失败：' + e.message); }
}
try { vm.runInContext(js, ctx, { filename: 'v5-music-console/app.js' }); }
catch (e) { errors.push('app.js 执行失败：' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); }

const MP = win.MP;
const steps = [];
function step(label, fn) {
  try { fn(); steps.push('  ✔ ' + label); }
  catch (e) { steps.push('  ✘ ' + label + ' → ' + e.message); errors.push(label + ' → ' + e.message); }
}
step('boot：app.js 与五个共享脚本执行完毕，MP 层齐备', () => {
  if (!MP || !MP.btn || !MP.micro || !MP.motion || !MP.actions) throw new Error('MP 不完整');
  if (!doc.querySelector('.mcs[data-screen="mock"]')) throw new Error('缺六屏骨架');
  if (doc.querySelectorAll('.mcr__tick').length !== 6) throw new Error('刻度数=' + doc.querySelectorAll('.mcr__tick').length);
});
for (let i = 0; i < 10; i++) { const q = rafQ.splice(0, rafQ.length); q.forEach((fn) => fn(Date.now())); }

for (const s of screens) step('切到 ' + s + ' 并渲染', () => { MP.actions.setScreen(s); if (MP.state.ui.screen !== s) throw new Error('未切换'); });

step('mock：注册端口 / 签发证书 / 挂载能力 / 启停服务', () => {
  const before = MP.state.ports.length;
  MP.actions.registerPort({ ip: '10.18.32.199', port: 18443, protocol: 'HTTPS', tls: 'TLS1.3', caps: ['cap-nemp'], note: 'check' });
  if (MP.state.ports.length !== before + 1) throw new Error('未注册');
  if (!MP.actions.generateCert(MP.state.ports[0].id, { cn: 'check.local' })) throw new Error('签发失败');
  MP.actions.attachCap('port-1', 'cap-vlmp'); MP.actions.detachCap('port-1', 'cap-vlmp');
  MP.actions.stopService('port-1'); MP.actions.startService('port-1');
});
step('flow：五类字段规则都能配，且规则引擎真的产生变化', () => {
  ['increment', 'once', 'conditional', 'random', 'fixed'].forEach((k) => {
    MP.actions.updateField('api-1', MP.state.apis[0].fields[0].id, { rule: { kind: k, start: 1, step: 2, times: 1, fallback: 'X', when: { key: 'code', op: '等于', value: '0' }, then: 'A', else: 'B' } });
  });
  const a = MP.buildResponse(MP.state.apis[0]), b = MP.buildResponse(MP.state.apis[0]);
  if (JSON.stringify(a.notes) === JSON.stringify(b.notes)) throw new Error('规则没有产生变化');
  if (!a.notes.length) throw new Error('没有命中说明');
});
step('flow：字段增删 / 人机交互 / 触发 / 放行拒绝 / 过滤搜索', () => {
  const f = MP.actions.addField('api-1');
  MP.actions.updateField('api-1', f.id, { key: 'data.x', value: '1' });
  MP.actions.removeField('api-1', f.id);
  MP.actions.addInteraction('api-1', 'captcha');
  const log = MP.actions.triggerApi('api-1');
  if (!log) throw new Error('triggerApi 无返回');
  if (log.interaction) MP.actions.resolveInteraction(log.id, 'approve');
  MP.actions.removeInteraction('api-1', MP.state.apis[0].interactions[0].id);
  ['all', 'ok', 'err', 'human'].forEach((x) => MP.actions.setLogFilter(x));
  MP.actions.setLogQuery('register'); MP.select.logsFiltered(); MP.actions.setLogQuery('');
});
step('ne：属性 / 版本 / 旧版本 / 成组 / 复制 / 步骤排序 / 参数校验', () => {
  MP.actions.updateNE('ne-1', { type: MP.state.neTypes[1], arch: MP.state.arches[2], version: '7.9.9', softName: 'X_V799', oldVersions: ['7.2.0'] });
  MP.actions.addGroup({ name: '检查组', desc: 'd', strategy: '并行' });
  MP.actions.assignGroup('ne-1', MP.state.groups[MP.state.groups.length - 1].id);
  const c = MP.actions.copyNE('ne-1');
  if (!c || c.id === 'ne-1') throw new Error('复制失败');
  MP.actions.addUpgradeStep('ne-1', { name: '检查步骤', kind: 'human', durationS: 5, owner: 'x' });
  const st = MP.state.nes[0].upgrade;
  MP.actions.moveStep('ne-1', st[1].id, +1); MP.actions.moveStep('ne-1', st[1].id, -1);
  MP.actions.removeStep('ne-1', st[st.length - 1].id);
  MP.actions.addValidation('ne-1', { field: 'version', rule: '^7\\.', level: '警告', message: 'm' });
  const r = MP.actions.runValidation('ne-1');
  if (!r.length || typeof r[0].pass !== 'boolean') throw new Error('校验结果结构不对');
});
step('omp：账号创建与启停 / 任务创建关联站点 / 推进到人工 / 共部署', () => {
  const a = MP.actions.createAccount({ name: 'check_ops', role: '升级操作员', scope: ['grp-hz'], nes: ['ne-1'] });
  MP.actions.toggleAccount(a.id); MP.actions.toggleAccount(a.id);
  const t = MP.actions.createTask({ name: '检查任务', site: '杭州主站点', neIds: ['ne-1', 'ne-2'], owner: 'check_ops' });
  for (let i = 0; i < 12; i++) MP.actions.advanceTask(t.id);
  MP.actions.toggleCoDeploy('omp'); MP.actions.toggleCoDeploy('omp');
});
step('lcm：软件包增删校验 / 共部署', () => {
  const p = MP.actions.addPackage({ name: 'CHECK_R1.0.0.pkg', type: '整包', ne: 'ne-1', vendor: '自研', version: '1.0.0', sizeMB: 10 });
  MP.actions.validatePackage(p.id); MP.actions.removePackage(p.id);
  MP.actions.toggleCoDeploy('lcmp'); MP.actions.toggleCoDeploy('lcmp');
});
step('vlp：CPU 越界 clamp / 主副站点 / 版本 / 校验 / 流程推进与重置', () => {
  MP.actions.setCPU(30); MP.actions.setCPU(999);
  if (MP.state.vlp.cpu > MP.state.vlp.cpuRange[1]) throw new Error('CPU 没有 clamp');
  MP.actions.setSite('primary', 'site-a'); MP.actions.setSite('secondary', 'site-c');
  MP.actions.setVlpVersion('VLMP R3.2.0-rc1');
  MP.state.vlp.checks.forEach((c) => MP.actions.runVlpCheck(c.id));
  for (let i = 0; i < 6; i++) MP.actions.advanceVlpFlow();
  MP.actions.resetVlpFlow();
});
step('流量模拟器 tick（真的走规则、写日志）', () => { const n = MP.state.logs.length; MP.sim.tick(); if (MP.state.logs.length < n) throw new Error('日志减少'); });
step('主题切换 晨雾 → 月影 → 晨雾（含 localStorage）', () => {
  doc.querySelector('[data-theme-set="moon"]').click();
  if (win.document.documentElement.getAttribute('data-theme') !== 'moon') throw new Error('没切到月影');
  if (store['mp-v5-theme'] !== 'moon') throw new Error('localStorage 没写入');
  doc.querySelector('[data-theme-set="dawn"]').click();
});
step('transport：主控 / 循环 / 重放 / 停止 / 速率键盘', () => {
  doc.getElementById('btnMain').click(); doc.getElementById('btnMain').click();
  doc.getElementById('btnLoop').click(); doc.getElementById('btnLoop').click();
  doc.getElementById('btnReplay').click(); doc.getElementById('btnStopFuse').click();
});
step('抽屉：索引 / 设置 打开与关闭', () => {
  doc.getElementById('libraryBtn').click(); doc.getElementById('settingsBtn').click(); doc.getElementById('popClose').click();
});
step('键盘：数字键 1–6 / 方向键切列切卡 / T / L / 空格 / Esc', () => {
  const kd = (key, target) => doc.dispatch('keydown', { key, target: target || doc.body });
  ['1', '2', '3', '4', '5', '6'].forEach(kd);
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 't', 'L', ' ', 'Escape'].forEach(kd);
});
step('事件委托：列头 / 卡 / 刻度 / 步进按钮 / 日志展开重放放行', () => {
  screens.forEach((s) => {
    MP.actions.setScreen(s);
    ['.mcar__colhd', '.mcard:not(.is-empty)', '.mcr__tick', '[data-car-step]'].forEach((sel) => {
      const el = doc.querySelector(sel); if (el) el.click();
    });
  });
  MP.actions.setScreen('flow');
  const t = doc.querySelector('[data-log-toggle]'); if (t) t.click();
  const rp = doc.querySelector('[data-replay]'); if (rp) rp.click();
  const log = MP.actions.triggerApi('api-3');
  if (log && log.interaction) { MP.actions.setScreen('flow'); const ap = doc.querySelector('[data-ix="approve"]'); if (ap) ap.click(); }
});
step('表单委托：字段路径 / 规则类型切换 / 条件 when 写回', () => {
  MP.actions.setScreen('flow');
  const f = MP.state.apis[0].fields[0];
  const key = doc.querySelector('[data-fid="' + f.id + '"][data-prop="key"]');
  if (key) { key.value = 'code.changed'; key.dispatch('input', { target: key }); }
  const kind = doc.querySelector('[data-fid="' + f.id + '"][data-prop="rule.kind"]');
  if (kind) { kind.value = 'conditional'; kind.dispatch('change', { target: kind }); }
  const wk = doc.querySelector('[data-fid="' + f.id + '"][data-rk="when.key"]');
  if (wk) { wk.value = 'data.token'; wk.dispatch('input', { target: wk }); }
  const base = doc.querySelector('[data-fid="' + f.id + '"][data-rk="when.base"]');
  if (base && JSON.parse(base.value).key !== 'data.token') throw new Error('when.key 没有写回：' + base.value);
});

function textOf(h) { return String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }
for (const s of screens) {
  step('渲染内容：' + s + ' 有列 / 有卡 / 无 undefined-NaN 泄漏 / 计数正确', () => {
    MP.actions.setScreen(s);
    const car = doc.querySelector('[data-car="' + s + '"]');
    if (!car.querySelectorAll('.mcar__col').length) throw new Error('没有列');
    if (!car.querySelectorAll('.mcard:not(.is-empty)').length) throw new Error('没有卡');
    const t = textOf(doc.getElementById(s + 'Detail').innerHTML) + ' ' + car.querySelector('.mcar__nav').innerHTML;
    if (/undefined|NaN|\[object/.test(t)) throw new Error('出现 ' + t.match(/.{0,30}(undefined|NaN|\[object)[^ ]*/)[0]);
    if (!/\d\d \/ \d\d/.test(car.querySelector('.mcar__nav b').textContent)) throw new Error('计数不对');
  });
}
const perScreen = {
  mock: { text: ['端口参数', '证书文件', '平台能力挂载', 'mock 服务'], ids: ['mA', 'mIpH', 'mP', 'mProto', 'mTls', 'mNote', 'mReg', 'mCert', 'mCertKv', 'mCertMark', 'mCapGrid', 'mStart', 'mFuse', 'mSvcMark', 'mCn', 'mIssuer', 'mDays'], sel: ['.mx-mark', '.mx-hold', '.mx-fuse', '.mx-sw'], min: { '.mx-sw': 6 } },
  flow: { text: ['预期响应', '响应字段与规则', '插入人机交互', '审计日志'], ids: ['fName', 'fStatus', 'fDesc', 'fDelayBox', 'fDelayErr', 'fSeg', 'fFields', 'fIxList', 'fIxKind', 'fSegFilter', 'fQuery', 'fLogBody', 'fLogCount', 'fAddField', 'fIxAdd', 'fTrigger', 'fApply', 'fReplayAll'], sel: ['.mx-scrub', '.mx-seg', '[data-log-toggle]', '[data-prop="rule.kind"]'] },
  ne: { text: ['网元属性', '升级流程步骤', '参数校验'], ids: ['nName', 'nNeId', 'nType', 'nArch', 'nVendor', 'nGroup', 'nVer', 'nSoft', 'nOld', 'nStatus', 'nSave', 'nNew', 'nCopy', 'nCopyHint', 'nFlow', 'nStepName', 'nStepKind', 'nStepDur', 'nStepOwner', 'nStepAdd', 'nRun', 'nRunBox', 'nValSummary', 'nValList', 'nValField', 'nValRule', 'nValLevel', 'nValMsg', 'nValAdd', 'nValRun'], sel: ['[data-step-up]', '[data-step-down]', '[data-step-del]', '.mcval'] },
  omp: { text: ['平台所管理的网元与网元组', '账号管理', '创建一体化升级任务并关联站点'], ids: ['oGrpName', 'oGrpDesc', 'oGrpStrat', 'oGrpAdd', 'oAcctBody', 'oAcName', 'oAcRole', 'oAcScope', 'oAcNes', 'oAcAdd', 'oTaskList', 'oTkName', 'oTkSite', 'oTkOwner', 'oTkNes', 'oTkAdd', 'oCoDeploy'], sel: ['table.mctbl', '[data-omp-group]', '[data-acct-sw]', '[data-task-adv]', '.mx-gauge'], min: { 'table.mctbl': 2 } },
  lcm: { text: ['平台管理的网元与软件包'], ids: ['lPkgName', 'lPkgType', 'lPkgNe', 'lPkgVendor', 'lPkgVer', 'lPkgSize', 'lPkgAdd', 'lCoDeploy', 'lPkgNow'], sel: ['[data-pkg-type]', '[data-pkg-ne]', '[data-pkg-vendor]', '[data-pkg-ver]', '[data-pkg-val]', '[data-pkg-del]', '.mctbl'] },
  vlp: { text: ['平台资源与站点', '升级流程详情', '软件包校验流程'], ids: ['vCpuBox', 'vPri', 'vSec', 'vVer', 'vVol', 'vGaugeBox', 'vApply', 'vFlow', 'vNext', 'vReset', 'vRunBox', 'vChecks', 'vCheckAll'], sel: ['.mx-scrub', '[data-check-run]', '.mx-mark'] }
};
for (const s of screens) {
  step('功能落点：' + s + ' §5 所需的控件与容器都在', () => {
    MP.actions.setScreen(s);
    const det = doc.getElementById(s + 'Detail');
    const t = textOf(det.innerHTML);
    perScreen[s].text.forEach((k) => { if (t.indexOf(k) < 0) throw new Error('缺区块文案：' + k); });
    perScreen[s].ids.forEach((id) => { if (!doc.getElementById(id)) throw new Error('缺 #' + id); });
    (perScreen[s].sel || []).forEach((sel) => {
      const n = det.querySelectorAll(sel).length;
      const min = (perScreen[s].min && perScreen[s].min[sel]) || 1;
      if (n < min) throw new Error('缺 ' + sel + '（' + n + ' < ' + min + '）');
    });
  });
}
step('transport 与平台数据的对应关系成立', () => {
  MP.actions.setScreen('flow'); MP.actions.selectApi('api-3');
  const ep = doc.getElementById('npEndpoint'), caps = doc.getElementById('npCaps');
  if (!/:\d+\//.test(ep.textContent)) throw new Error('端点格式不对：' + ep.textContent);
  if (caps.textContent.indexOf('POST') < 0) throw new Error('能力行缺接口信息');
  if (doc.getElementById('tlTrack').getAttribute('role') !== 'slider') throw new Error('时间轴不是 slider');
  if (doc.getElementById('rateWrap').getAttribute('role') !== 'slider') throw new Error('速率不是 slider');
  const p = MP.select.port();
  MP.actions.stopService(p.id);
  if (MP.select.port(p.id).running !== false) throw new Error('停止没生效');
});
step('runtime 无未捕获异常', () => {
  if (errors.length) throw new Error(errors.length + ' 条：' + errors.slice(0, 4).join(' | '));
});

/* ======================================================== 输出 */
console.log('\n=== V5 · 音乐调测台 自检（静态 + 无浏览器冒烟） ===\n');
console.log('A/B 静态自检 —— 通过 ' + ok.length + ' 项：');
ok.forEach((l) => console.log('  ✔ ' + l));
if (fail.length) { console.log('\n静态自检失败 ' + fail.length + ' 项：'); fail.forEach((l) => console.log('  ✘ ' + l)); }
console.log('\n冒烟测试（真跑 _shared/*.js + app.js，未开浏览器）：');
steps.forEach((l) => console.log(l));
const uniq = errors.filter((e, i) => errors.indexOf(e) === i);
console.log('\n运行期错误 ' + uniq.length + ' 条：');
uniq.forEach((e) => console.log('  ✘ ' + e));
console.log('\n控制台输出：');
warns.slice(0, 5).forEach((w) => console.log('  · ' + w));
console.log('\n文件行数：index.html ' + html.split('\n').length + ' · app.css ' + css.split('\n').length + ' · app.js ' + js.split('\n').length);
const bad = fail.length + uniq.length;
console.log(bad ? '\n结果：失败（' + bad + '）\n' : '\n结果：全部通过（静态 ' + ok.length + ' 项 + 冒烟 ' + steps.length + ' 步，0 错误）\n');
process.exit(bad ? 1 : 0);

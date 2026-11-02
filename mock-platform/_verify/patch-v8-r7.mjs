/* V8-R7：主题/密度切换的过渡（去"硬闪"）
   · 换色：给整个文档加 is-theming，300ms 内所有颜色属性走过渡，换完移除该类
   · 加一层极轻微呼吸（opacity .94 / scale .998），让"换皮"读成一口气而不是一次闪
   · 遵守设置里的「动效」偏好与 prefers-reduced-motion：关闭/精简时直接切
*/
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'v8-blackbox-terminal/';
const rd = (f) => readFileSync(D + f, 'utf8');
const wr = (f, s) => writeFileSync(D + f, s, 'utf8');
const log = [];

/* ---------------- 1) CSS ---------------- */
let css = rd('app.css');
if (!css.includes('V8-R7')) {
  css = css.trimEnd() + `

/* ============================================================================
 * V8-R7：切换过渡
 *   换色时把过渡限定在 is-theming 的窗口内（避免常驻 * 过渡拖慢 hover）
 * ==========================================================================*/
html.is-theming *,
html.is-theming *::before,
html.is-theming *::after {
  transition:
    background-color 260ms cubic-bezier(.2, .8, .2, 1),
    color 260ms cubic-bezier(.2, .8, .2, 1),
    border-color 260ms cubic-bezier(.2, .8, .2, 1),
    box-shadow 300ms cubic-bezier(.2, .8, .2, 1),
    fill 260ms cubic-bezier(.2, .8, .2, 1),
    stroke 260ms cubic-bezier(.2, .8, .2, 1),
    outline-color 260ms cubic-bezier(.2, .8, .2, 1) !important;
}
/* 换色的"一口气"：极轻的缩放 + 轻微压暗，避免大块颜色硬切 */
.stage.is-swap { animation: swapBreath 400ms var(--ease, cubic-bezier(.2,.8,.2,1)); }
@keyframes swapBreath {
  0%   { opacity: 1;    transform: none; }
  42%  { opacity: .935; transform: scale(.9985); }
  100% { opacity: 1;    transform: none; }
}
/* 密度切换只重排、不换色：用压暗遮住 reflow 的跳动 */
.stage.is-reflow { animation: reflowVeil 300ms var(--ease, cubic-bezier(.2,.8,.2,1)); }
@keyframes reflowVeil {
  0%   { opacity: 1; }
  35%  { opacity: .86; }
  100% { opacity: 1; }
}
/* 动效偏好 / 系统减弱动效：都不演 */
html[data-motion="off"].is-theming *,
html[data-motion="off"] .stage.is-swap,
html[data-motion="off"] .stage.is-reflow,
html[data-motion="lite"].is-theming * { transition-duration: 90ms !important; animation-duration: 90ms !important; }
@media (prefers-reduced-motion: reduce) {
  html.is-theming *,
  html.is-theming *::before,
  html.is-theming *::after { transition: none !important; }
  .stage.is-swap, .stage.is-reflow { animation: none !important; }
}
`;
  log.push('✓ CSS 切换过渡');
}
wr('app.css', css);

/* ---------------- 2) app.js：包一层过渡 ---------------- */
let app = rd('app.js');
if (!app.includes('function beginSwap')) {
  app = app.replace(`  function applyTheme(name) {
    if (THEMES.indexOf(name) < 0) name = 'nier';
    UI.theme = name;`,
`  // —— 切换过渡：换色 / 重排时给一点时间，别硬闪 ——
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
    UI.theme = name;`, 'app.js 过渡骨架');
  log.push('✓ app.js 过渡骨架');

  // setTheme 允许带动画
  app = app.replace(`  function setTheme(name) { applyTheme(name); }`,
`  function setTheme(name) { applyTheme(name, true); }`, 'setTheme 走过渡');
  app = app.replace(`    applyTheme(THEMES[(THEMES.indexOf(UI.theme) + 1) % THEMES.length]);`,
`    applyTheme(THEMES[(THEMES.indexOf(UI.theme) + 1) % THEMES.length], true);`, 'T 键走过渡');
  app = app.replace(`    if (e.target && e.target.id === 'themeSel') applyTheme(e.target.value);`,
`    if (e.target && e.target.id === 'themeSel') applyTheme(e.target.value, true);`, '页眉下拉走过渡');

  // 密度切换：走 reflow 过渡
  app = app.replace(`  function setPref(k, v) {
    if (!(k in PREF_DEF)) return;
    UI.prefs[k] = v;
    savePrefs(); applyPrefs();`,
`  function setPref(k, v) {
    if (!(k in PREF_DEF)) return;
    if (k === 'density' && v !== UI.prefs.density) {
      withSwap('reflow', function () { UI.prefs[k] = v; savePrefs(); applyPrefs(); });
      return;
    }
    UI.prefs[k] = v;
    savePrefs(); applyPrefs();`, 'app.js 密度走过渡');
  wr('app.js', app);
  log.push('✓ app.js 各入口接过渡');
}

/* resetPrefs 里重置主题也走过渡 */
app = rd('app.js');
app = app.replace(`    applyTheme('nier');`, `    applyTheme('nier', true);`);
wr('app.js', app);

console.log(log.join('\n'));

/* ============================================================================
 * mock-platform / _shared/button-fx.js
 * 按钮动效层 —— 把 ui-ux-pro-max 技能给出的动效预设落成可复用原语
 *
 * 技能依据（`search.py --domain gsap "button micro-interaction hover press ripple
 * magnetic feedback"` 与 `--domain ux "button press click loading disabled state"`）：
 *  1) Hover · Subtle     y:-1  opacity:.9                      150ms  power1.out
 *     Do：位移 < 2px，读作「反馈」而不是「运动」
 *     Don't：hover 不动画 layout 相关属性（width/height/margin）
 *  2) Hover · Standard   y:-4  scale:1.02  boxShadow 抬升       250ms  power2.out
 *     Do：配一条 mouseleave 反向补间，别让 hover 卡住
 *  3) Hover · Complex    磁吸，elastic.out(1,0.4)               300–500ms
 *     Do：钳制牵引强度（*0.3），元素不能离开命中区
 *     Don't：一屏最多 1–2 个磁吸焦点，多了就是噪声
 *  4) 按下：立即给按压反馈（等价 active:scale-95），不能有「按了没反应」
 *  5) 异步 >300ms：必须给 loading（spinner/skeleton），不能让界面冻住
 *  6) 禁用：降不透明度 + 改 cursor，不能和正常态长得一样
 *  7) 贯穿：只用 transform/opacity/box-shadow（走合成器），不触发布局抖动
 *
 * 实现要点：**事件委托**（document 上一套监听），因此在 SPI 频繁重画的列表/表格里
 * 不需要重新绑定；新插入的按钮自动生效。
 *
 * 与莱茵生命仓库（RhineLabUI / rhinelab-blog-theme / Rhine-Music-Demo）的克制语言对齐：
 * **只加动，不加装饰**——不改颜色、不填色块、不加圆角；强度靠 `data-fx` 分级，默认 subtle。
 *
 * 用法：
 *   MP.btn.install();                       // 注入样式 + 注册委托（boot 里调一次）
 *   MP.btn.enhance(document);               // 兼容入口：确保已安装，并对磁吸数量做提醒
 *   <button data-fx="standard">…</button>   // standard / subtle / magnetic / transport / none
 *   <button data-ripple="never">…</button>  // 关掉单个按钮的涟漪
 *   const done = MP.btn.loading(btn, '签发中'); done();
 *   MP.btn.skeleton(host, 3);               // 长耗时区域的占位骨架
 * ==========================================================================*/
(function (global) {
  'use strict';
  var MP = global.MP || (global.MP = {});
  var M = MP.motion;

  var SEL = 'button, .btn, [role="button"], input[type="submit"], input[type="button"]';
  var MIN_LOADING = 300;   // 技能：>300ms 的操作必须给 loading 反馈
  var installed = false;
  var hoverEl = null, pressEl = null, magEl = null, magRaf = 0, magX = 0, magY = 0, magTX = 0, magTY = 0;

  function reduced() { return !!(MP.motion && MP.motion.reduced); }

  function nodeOf(target) {
    if (!target || !target.closest) return null;
    var el = target.closest(SEL);
    if (!el) return null;
    if (el.getAttribute('data-fx') === 'none') return null;
    if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  }

  function tier(el) {
    var t = el.getAttribute('data-fx');
    if (t) return t;
    if (el.classList.contains('btn--primary') || el.classList.contains('btn-primary') ||
        el.classList.contains('primary') || el.getAttribute('data-primary') === 'true') return 'standard';
    return 'subtle';
  }

  function hoverY(el) {
    var t = tier(el);
    if (t === 'standard') return -4;
    if (t === 'magnetic' || t === 'transport') return -2;
    return -1;
  }

  /* ------------------------------------------------------------ 涟漪（可选） */
  function ripple(el, ev) {
    if (reduced()) return;
    if (el.getAttribute('data-ripple') === 'never') return;
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    var r = el.getBoundingClientRect();
    var x = (ev && ev.clientX ? ev.clientX - r.left : r.width / 2);
    var y = (ev && ev.clientY ? ev.clientY - r.top : r.height / 2);
    var d = Math.max(r.width, r.height) * 2.1;
    var n = document.createElement('span');
    n.className = 'mp-ripple';
    n.setAttribute('aria-hidden', 'true');
    n.style.cssText = 'position:absolute;left:' + (x - d / 2) + 'px;top:' + (y - d / 2) + 'px;' +
      'width:' + d + 'px;height:' + d + 'px;border-radius:50%;pointer-events:none;' +
      'background:radial-gradient(circle,currentColor 0%,transparent 68%);' +
      'opacity:0;transform:scale(.18);transition:transform 520ms cubic-bezier(.2,.8,.2,1),opacity 520ms linear;' +
      'mix-blend-mode:soft-light';
    if (cs.overflow === 'visible') el.style.overflow = 'hidden';
    el.appendChild(n);
    requestAnimationFrame(function () { n.style.opacity = '.3'; n.style.transform = 'scale(1)'; });
    setTimeout(function () { n.style.opacity = '0'; }, 300);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 640);
  }

  /* --------------------------------------------------------- 按下 / 抬起运动 */
  function pressDown(el, ev) {
    if (!el) return;
    pressEl = el;
    el.classList.add('is-pressing');
    if (reduced()) return;
    el.style.transform = 'translateY(0) scale(' + (tier(el) === 'transport' ? .94 : .97) + ')';
    ripple(el, ev);
    if (MP.sfx) MP.sfx.play(tier(el) === 'transport' ? 'latch' : 'step');
  }

  function pressUp(el) {
    if (!el) el = pressEl;
    if (!el) return;
    el.classList.remove('is-pressing');
    pressEl = null;
    if (reduced()) { el.style.transform = ''; return; }
    var t = tier(el);
    var from = (t === 'transport' ? .94 : .97);
    var to = el === hoverEl ? hoverY(el) / 100 : 0;
    // 抬起：弹簧归位（共享层的阻尼谐振子，改目标保留速度）
    if (MP.motion && MP.motion.spring) {
      var s = M.spring({
        from: from, to: 1, stiffness: 320, damping: 22,
        onUpdate: function (v) {
          var y = (el === hoverEl ? hoverY(el) : 0);
          el.style.transform = 'translateY(' + y + 'px) scale(' + v.toFixed(4) + ')';
        }
      });
      setTimeout(function () { s.stop(); el.style.transform = el === hoverEl ? 'translateY(' + hoverY(el) + 'px)' : ''; }, 360);
    } else {
      el.style.transform = '';
    }
    void to;
    if (MP.sfx) MP.sfx.play('tick');
  }

  function hoverIn(el) {
    if (!el || el === hoverEl) return;
    hoverOut(hoverEl);
    hoverEl = el;
    el.classList.add('is-hover');
    if (reduced()) return;
    el.style.transform = 'translateY(' + hoverY(el) + 'px)';
    if (tier(el) === 'standard') el.classList.add('is-lifted');
  }

  function hoverOut(el) {
    if (!el) return;
    el.classList.remove('is-hover', 'is-lifted');
    if (el !== pressEl) el.style.transform = '';
    if (el === hoverEl) hoverEl = null;
  }

  /* ------------------------------------------------------------------ 磁吸 */
  // 技能约束：钳制强度 *0.3；一屏最多 1–2 个焦点。
  function magLoop() {
    if (!magEl) { magRaf = 0; return; }
    magX += (magTX - magX) * 0.18;
    magY += (magTY - magY) * 0.18;
    magEl.style.transform = 'translate(' + magX.toFixed(2) + 'px,' + (magY + hoverY(magEl)).toFixed(2) + 'px)';
    if (Math.abs(magTX - magX) > 0.05 || Math.abs(magTY - magY) > 0.05) magRaf = requestAnimationFrame(magLoop);
    else magRaf = 0;
  }

  function magSet(el) {
    if (magEl === el) return;
    if (magEl) { magEl.style.transform = ''; }
    magEl = el; magX = magY = magTX = magTY = 0;
  }

  /* ------------------------------------------------------------- 委托安装 */
  function install() {
    if (installed) return;
    installed = true;

    var st = document.createElement('style');
    st.id = 'mp-button-fx-style';
    st.textContent = [
      '[data-fx], .btn, button[class] { will-change: transform; }',
      '[data-fx], .btn { transition: transform 150ms cubic-bezier(.2,.8,.2,1), opacity 150ms linear, box-shadow 220ms cubic-bezier(.2,.8,.2,1); }',
      '[data-fx="standard"], .btn--primary { transition-duration: 250ms; }',
      '.is-lifted { box-shadow: 0 12px 24px rgba(0,0,0,.12); }',
      '.is-disabled, [disabled] { opacity: .45; cursor: not-allowed; }',
      '.mp-btn-loading { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; }',
      '.mp-btn-loading i { width: 4px; height: 4px; background: currentColor; transform: rotate(45deg); animation: mpBtnPulse 1.1s cubic-bezier(0,0,.2,1) infinite; }',
      '.mp-btn-loading i:nth-child(2) { animation-delay: .16s; opacity: .7; }',
      '.mp-btn-loading i:nth-child(3) { animation-delay: .32s; opacity: .45; }',
      '@keyframes mpBtnPulse { 0%,100% { opacity: .25; } 50% { opacity: 1; } }',
      '.mp-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; }',
      '.mp-skeleton span { height: 10px; width: var(--w, 70%); background: currentColor; opacity: .12; animation: mpSkel 1.4s linear infinite; }',
      '@keyframes mpSkel { 0%,100% { opacity: .08; } 50% { opacity: .18; } }',
      '.mp-ripple { contain: strict; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  [data-fx], .btn { transition-duration: .01ms !important; }',
      '  .mp-btn-loading i, .mp-skeleton span { animation-duration: .01ms !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(st);

    document.addEventListener('pointerover', function (e) {
      var el = nodeOf(e.target);
      if (el) { hoverIn(el); if (el.getAttribute('data-fx') === 'magnetic' && !reduced()) { magSet(el); if (!magRaf) magRaf = requestAnimationFrame(magLoop); } }
    }, true);
    document.addEventListener('pointerout', function (e) {
      var el = nodeOf(e.target);
      if (!el) return;
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(SEL) : null;
      if (to === el) return;
      if (el.getAttribute('data-fx') === 'magnetic') magSet(null);
      hoverOut(el);
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (!magEl || reduced()) return;
      var r = magEl.getBoundingClientRect();
      magTX = (e.clientX - (r.left + r.width / 2)) * 0.3;   // 技能：钳制 *0.3
      magTY = (e.clientY - (r.top + r.height / 2)) * 0.3;
    }, { passive: true });
    document.addEventListener('pointerdown', function (e) {
      var el = nodeOf(e.target);
      if (el) pressDown(el, e);
    }, true);
    document.addEventListener('pointerup', function (e) {
      var el = nodeOf(e.target) || pressEl;
      if (el) pressUp(el);
    }, true);
    document.addEventListener('pointercancel', function () { if (pressEl) pressUp(pressEl); }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      var el = nodeOf(e.target);
      if (el && el.tagName === 'BUTTON' && !el.classList.contains('is-pressing')) pressDown(el, null);
    }, true);
    document.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      var el = nodeOf(e.target);
      if (el) { hoverOut(el); pressUp(el); }
    }, true);
    document.addEventListener('focusout', function (e) {
      var el = nodeOf(e.target);
      if (el) { hoverOut(el); if (el.classList.contains('is-pressing')) pressUp(el); }
    }, true);
  }

  /* ---------------------------------------------------------------- 兼容入口 */
  // 保持 enhance() 这个名称：确保已安装；顺便按技能的约束检查磁吸焦点数量。
  function enhance(root) {
    install();
    var scope = root || document;
    var mags = scope.querySelectorAll('[data-fx="magnetic"]');
    if (mags.length > 2 && global.console) {
      console.warn('[button-fx] 本页磁吸按钮 ' + mags.length + ' 个：技能建议一屏最多 1–2 个焦点，超出会变噪。');
    }
    return scope.querySelectorAll(SEL).length;
  }

  /* -------------------------------------------------------------- loading 态 */
  function loading(el, label) {
    if (!el || el.__mpLoading) return function () {};
    el.__mpLoading = true;
    var prevDisabled = el.disabled;
    el.disabled = true;
    el.classList.add('is-loading');
    el.setAttribute('aria-busy', 'true');
    var box = document.createElement('span');
    box.className = 'mp-btn-loading';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<i></i><i></i><i></i>' + (label ? '<span class="mp-btn-loading__t">' + label + '</span>' : '');
    el.appendChild(box);
    var t0 = performance.now();
    return function done() {
      var wait = Math.max(0, MIN_LOADING - (performance.now() - t0));
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        el.classList.remove('is-loading');
        el.removeAttribute('aria-busy');
        el.disabled = prevDisabled;
        el.__mpLoading = false;
      }, wait);
    };
  }

  /* ------------------------------------------------- 骨架屏（>300ms 的占位） */
  function skeleton(host, rows) {
    rows = rows || 3;
    var wrap = document.createElement('div');
    wrap.className = 'mp-skeleton';
    for (var i = 0; i < rows; i++) {
      var r = document.createElement('span');
      r.style.setProperty('--w', (56 + ((i * 17) % 40)) + '%');
      wrap.appendChild(r);
    }
    host.appendChild(wrap);
    return function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
  }

  MP.btn = {
    enhance: enhance, install: install, loading: loading, skeleton: skeleton,
    ripple: ripple, pressDown: pressDown, pressUp: pressUp, hoverIn: hoverIn, hoverOut: hoverOut,
    TIERS: ['subtle', 'standard', 'magnetic', 'transport'],
    MIN_LOADING: MIN_LOADING
  };
})(window);

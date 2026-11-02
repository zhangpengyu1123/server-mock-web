/* ============================================================================
 * mock-platform / _shared/motion.js
 * 动效核心 + 合成音效
 *
 * 知识来源与落点（详见 mock-platform/README.md「知识来源」）：
 *  · spring() 阻尼谐振子（改目标保留位置与速度）——取自 design-systems/04 的
 *    Overture.motion「共振」与 Lens 弹性手势的做法（MIT，思路沿用，代码自写）。
 *  · iris() 光圈开幕 / develop() 显影——取自 Overture「光圈 · 显影 · 弹簧」三原语。
 *  · carry() 共享元素连续过渡、杜绝「切镜头」——取自 onetake 的「一镜到底」连续性要求。
 *  · sfx 合成音效共用一个空间感——取自 Lens 的 13 种原创合成音 + Overture.sound 八音。
 *  · reduced-motion 全部归零——取自 PRTS Design「动画与过渡缩到 0.01ms」。
 * ==========================================================================*/
(function (global) {
  'use strict';
  var MP = global.MP || (global.MP = {});

  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { reduced = e.matches; });
  if (mq && mq.addListener) mq.addListener(function (e) { reduced = e.matches; });

  var raf = global.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var caf = global.cancelAnimationFrame || clearTimeout;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* ------------------------------------------------------------ 弹簧（共振） */
  // spring({from,to,stiffness,damping,onUpdate,onDone}) → { to(v), stop(), value }
  function spring(opts) {
    opts = opts || {};
    var k = opts.stiffness == null ? 170 : opts.stiffness;
    var c = opts.damping == null ? 20 : opts.damping;
    var x = opts.from == null ? 0 : opts.from;
    var v = opts.velocity || 0;
    var target = opts.to == null ? 0 : opts.to;
    var stop = false, last = 0, id = 0;
    function step(ts) {
      if (stop) return;
      if (!last) last = ts;
      var dt = clamp((ts - last) / 1000, 0.001, 0.032);
      last = ts;
      // 半隐式欧拉：改目标时位置与速度都保留（Overture 的做法）
      var a = -k * (x - target) - c * v;
      v += a * dt; x += v * dt;
      if (opts.onUpdate) opts.onUpdate(x, v, target);
      if (Math.abs(x - target) < 0.0008 && Math.abs(v) < 0.0008) {
        x = target; v = 0;
        if (opts.onUpdate) opts.onUpdate(x, v, target);
        if (opts.onDone) opts.onDone(x);
        return;
      }
      id = raf(step);
    }
    id = raf(step);
    return {
      to: function (t) { target = t; v += (t - x) * 0.0; last = 0; },   // 保留速度
      get value() { return x; },
      get target() { return target; },
      stop: function () { stop = true; caf(id); }
    };
  }

  /* -------------------------------------------------------------- 光圈开幕 */
  // 以触发点为圆心展开；退出约为进入的 0.6 倍并加速离场（同 Overture 的 iris）
  function iris(el, opts) {
    opts = opts || {};
    var origin = opts.origin || '50% 50%';
    var dur = reduced ? 1 : (opts.duration || 520);
    var out = !!opts.out;
    var r = Math.hypot(el.offsetWidth || 400, el.offsetHeight || 300);
    el.style.transformOrigin = origin;
    if (out) {
      el.style.transition = 'clip-path ' + dur * 0.6 + 'ms cubic-bezier(0.4,0,1,1), opacity ' + dur * 0.6 + 'ms linear';
      el.style.clipPath = 'circle(0px at ' + origin + ')';
      el.style.opacity = '0';
      return;
    }
    el.style.transition = 'none';
    el.style.clipPath = 'circle(0px at ' + origin + ')';
    el.style.opacity = '0';
    void el.offsetWidth;
    el.style.transition = 'clip-path ' + dur + 'ms cubic-bezier(0.2,0.8,0.2,1), opacity ' + Math.round(dur * 0.5) + 'ms linear';
    el.style.clipPath = 'circle(' + r + 'px at ' + origin + ')';
    el.style.opacity = '1';
    if (opts.onDone) setTimeout(opts.onDone, dur);
  }

  /* ---------------------------------------------------------------- 显影 */
  // 影像从模糊/低对比到清晰，配合位移（Overture 的 develop）
  function develop(el, opts) {
    opts = opts || {};
    var dur = reduced ? 1 : (opts.duration || 460);
    el.style.transition = 'filter ' + dur + 'ms cubic-bezier(0.2,0.8,0.2,1), opacity ' + dur + 'ms linear, transform ' + dur + 'ms cubic-bezier(0.2,0.8,0.2,1)';
    el.style.filter = 'blur(10px) contrast(1.4) saturate(1.6)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    void el.offsetWidth;
    el.style.filter = 'none';
    el.style.opacity = '1';
    el.style.transform = 'none';
    if (opts.onDone) setTimeout(opts.onDone, dur);
  }

  /* ------------------------------------------------------------ 数字滚动 */
  function countUp(el, to, opts) {
    opts = opts || {};
    var from = opts.from == null ? (parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0) : opts.from;
    var dur = reduced ? 1 : (opts.duration || 700);
    var fmt = opts.format || function (v) { return Math.round(v).toLocaleString('en-US'); };
    var t0 = 0;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1);
      el.textContent = fmt(from + (to - from) * ease(p)) + (opts.suffix || '');
      if (p < 1) raf(step);
      else if (opts.onDone) opts.onDone();
    }
    if (reduced) { el.textContent = fmt(to) + (opts.suffix || ''); return; }
    raf(step);
  }

  /* -------------------------------------------------------------- 交错入场 */
  function stagger(nodes, opts) {
    opts = opts || {};
    nodes = Array.prototype.slice.call(nodes);
    var each = reduced ? 0 : (opts.each == null ? 45 : opts.each);
    nodes.forEach(function (n, i) {
      n.style.opacity = '0';
      n.style.transform = 'translateY(' + (opts.y == null ? 12 : opts.y) + 'px) scale(' + (opts.scale || 1) + ')';
      n.style.transition = 'opacity ' + (opts.duration || 360) + 'ms cubic-bezier(0.2,0.8,0.2,1) ' + (i * each) + 'ms, transform ' + (opts.duration || 360) + 'ms cubic-bezier(0.2,0.8,0.2,1) ' + (i * each) + 'ms';
      raf(function () {
        n.style.opacity = '1';
        n.style.transform = 'none';
      });
    });
  }

  /* ------------------------------------------- 连续过渡：共享元素不切镜头 */
  // onetake 的核心：下一个画面要从上一个画面里长出来，而不是硬切。
  // 这里用 FLIP：量出旧位置 → 交给新视图 → 从旧位置动到新位置。
  function carry(fromRect, toEl, opts) {
    opts = opts || {};
    if (reduced || !fromRect) return;
    var to = toEl.getBoundingClientRect();
    var dx = fromRect.left - to.left, dy = fromRect.top - to.top;
    var sx = fromRect.width / (to.width || 1), sy = fromRect.height / (to.height || 1);
    toEl.style.transition = 'none';
    toEl.style.transformOrigin = 'top left';
    toEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    toEl.style.opacity = '0.6';
    void toEl.offsetWidth;
    toEl.style.transition = 'transform ' + (opts.duration || 460) + 'ms cubic-bezier(0.2,0.8,0.2,1), opacity ' + (opts.duration || 460) + 'ms linear';
    toEl.style.transform = 'none';
    toEl.style.opacity = '1';
    setTimeout(function () { toEl.style.transition = ''; toEl.style.transformOrigin = ''; }, (opts.duration || 460) + 30);
  }

  /* -------------------------------------------------------------- 滚动入场 */
  function reveal(root) {
    var nodes = (root || document).querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in global)) {
      Array.prototype.forEach.call(nodes, function (n) { n.style.opacity = 1; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { develop(e.target, { duration: 420 }); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(nodes, function (n) { n.style.opacity = reduced ? 1 : 0; io.observe(n); });
  }

  /* ---------------------------------------------------------------- 打字机 */
  function stream(el, text, opts) {
    opts = opts || {};
    if (reduced) { el.textContent = text; return; }
    var i = 0, speed = opts.speed || 22;
    el.textContent = '';
    (function tick() {
      if (i >= text.length) return;
      el.textContent += text.charAt(i++);
      setTimeout(tick, speed + (Math.random() < 0.12 ? speed * 4 : 0));
    })();
  }

  /* ------------------------------------------------------------ 合成音效 */
  // 一个 AudioContext 复用；默认关闭，首次用户手势后由 UI 决定是否开启。
  var sfx = {
    enabled: false, ctx: null, master: null, room: null,
    init: function () {
      if (sfx.ctx || !global.AudioContext) return sfx.ctx;
      var Ctx = global.AudioContext || global.webkitAudioContext;
      sfx.ctx = new Ctx();
      sfx.master = sfx.ctx.createGain();
      sfx.master.gain.value = 0.16;
      // 「共用一个房间」：一条短混响，让所有声音听起来在同一空间里（同 Lens / Overture 的做法）
      sfx.room = sfx.ctx.createConvolver();
      var len = Math.floor(sfx.ctx.sampleRate * 0.5);
      var buf = sfx.ctx.createBuffer(2, len, sfx.ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      sfx.room.buffer = buf;
      var wet = sfx.ctx.createGain(); wet.gain.value = 0.22;
      sfx.master.connect(sfx.ctx.destination);
      sfx.master.connect(wet); wet.connect(sfx.room); sfx.room.connect(sfx.ctx.destination);
      return sfx.ctx;
    },
    tone: function (o) {
      if (!sfx.enabled) return;
      var ctx = sfx.init(); if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.dur || 0.12));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.5, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.12));
      osc.connect(g); g.connect(sfx.master);
      osc.start(t); osc.stop(t + (o.dur || 0.12) + 0.02);
    },
    noise: function (o) {
      if (!sfx.enabled) return;
      var ctx = sfx.init(); if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime, dur = o.dur || 0.08;
      var buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f || 1800; bp.Q.value = o.q || 1.2;
      var g = ctx.createGain(); g.gain.value = o.vol || 0.3;
      src.connect(bp); bp.connect(g); g.connect(sfx.master);
      src.start(t);
    },
    play: function (name) {
      if (!sfx.enabled) return;
      switch (name) {
        case 'tick': return sfx.tone({ f: 1180, f2: 980, dur: 0.045, vol: 0.22, type: 'square' });
        case 'step': return sfx.noise({ f: 2200, dur: 0.04, vol: 0.18 });
        case 'toggle': return sfx.tone({ f: 420, f2: 720, dur: 0.09, vol: 0.3, type: 'triangle' });
        case 'confirm': return (sfx.tone({ f: 620, f2: 940, dur: 0.16, vol: 0.34, type: 'triangle' }), setTimeout(function () { sfx.tone({ f: 1240, dur: 0.18, vol: 0.24 }); }, 90));
        case 'latch': return sfx.noise({ f: 900, dur: 0.12, vol: 0.34, q: 0.7 });
        case 'warn': return sfx.tone({ f: 300, f2: 180, dur: 0.26, vol: 0.32, type: 'sawtooth' });
        case 'iris': return sfx.noise({ f: 520, dur: 0.34, vol: 0.22, q: 0.5 });
        case 'undo': return sfx.tone({ f: 880, f2: 320, dur: 0.2, vol: 0.26, type: 'triangle' });
        case 'boot': return (sfx.tone({ f: 180, f2: 520, dur: 0.3, vol: 0.3 }), setTimeout(function () { sfx.noise({ f: 1600, dur: 0.2, vol: 0.2 }); }, 160));
        default: return sfx.tone({ f: 800, dur: 0.06, vol: 0.2 });
      }
    },
    toggle: function (on) {
      sfx.enabled = on == null ? !sfx.enabled : !!on;
      if (sfx.enabled) { sfx.init(); sfx.play('toggle'); }
      return sfx.enabled;
    }
  };

  MP.motion = {
    spring: spring, iris: iris, develop: develop, countUp: countUp, stagger: stagger,
    carry: carry, reveal: reveal, stream: stream, ease: ease, clamp: clamp,
    get reduced() { return reduced; }
  };
  MP.sfx = sfx;
})(window);

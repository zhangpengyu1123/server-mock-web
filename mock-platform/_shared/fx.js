/* ============================================================================
 * mock-platform / _shared/fx.js
 * 程序化视觉特效（Canvas 2D）
 *
 * 知识来源：Shaders（shader-effects-inc/shaders）的 200 个 WebGPU 组件目录告诉我
 * 「网页视觉特效的词汇表」有哪些——噪波 / 极光 / 网格渐变 / 扫描线 / 点阵 / 粒子 /
 * 金属拉丝 / 玻璃折射。本项目把这些效果用 Canvas 2D 手写实现，好处是：
 *   · 零依赖、离线可跑，不要求浏览器支持 WebGPU；
 *   · 需要 GPU 级效果时，可以随时把同名的 Shaders 组件换进来（其 npm 包 `shaders`
 *     支持 React/Vue/Svelte/Solid/JS，导出即用）。
 * 所有特效：DPR 自适应、页面隐藏时暂停、prefers-reduced-motion 下只画一帧静帧。
 * ==========================================================================*/
(function (global) {
  'use strict';
  var MP = global.MP || (global.MP = {});

  function setup(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var host = canvas.parentElement || canvas;
    function resize() {
      var w = host.clientWidth || canvas.clientWidth || 600;
      var h = host.clientHeight || canvas.clientHeight || 300;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w, h: h };
    }
    var size = resize();
    var running = true, id = 0, t0 = performance.now();
    var loopFn = null;
    function frame(ts) {
      if (!running) return;
      var size2 = canvas.__mpSize || size;
      loopFn(ctx, size2.w, size2.h, (ts - t0) / 1000);
      id = requestAnimationFrame(frame);
    }
    function start(fn) {
      loopFn = fn;
      global.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVis);
      if (MP.motion && MP.motion.reduced) { loopFn(ctx, size.w, size.h, 0); return { stop: stop }; }
      id = requestAnimationFrame(frame);
      return { stop: stop, canvas: canvas, ctx: ctx, size: size };
    }
    function onResize() { size = resize(); canvas.__mpSize = size; if (MP.motion && MP.motion.reduced && loopFn) loopFn(ctx, size.w, size.h, 0); }
    function onVis() { if (document.hidden) { running = false; cancelAnimationFrame(id); } else { running = true; t0 = performance.now() - 1000; id = requestAnimationFrame(frame); } }
    function stop() { running = false; cancelAnimationFrame(id); global.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); }
    return { start: start, stop: stop, ctx: ctx, size: size };
  }

  /* ---------------------------------------------------------- 噪波 / 胶片颗粒 */
  function noise(canvas, opts) {
    opts = opts || {};
    var amount = opts.amount == null ? 0.055 : opts.amount;
    var scale = opts.scale || 2;
    var off = document.createElement('canvas');
    var octx = off.getContext('2d');
    var ctl = setup(canvas, opts);
    function draw(ctx, w, h, t) {
      var tw = Math.max(2, Math.round(w / scale)), th = Math.max(2, Math.round(h / scale));
      if (off.width !== tw || off.height !== th) { off.width = tw; off.height = th; }
      var img = octx.createImageData(tw, th);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = amount;
      ctx.globalCompositeOperation = opts.blend || 'overlay';
      ctx.drawImage(off, 0, 0, w, h);
      ctx.restore();
    }
    if (!opts.static) return ctl.start(draw);
    var s = ctl.size; draw(ctl.ctx, s.w, s.h, 0); return ctl;
  }

  /* ------------------------------------------------------------ 极光 / 流动渐变 */
  // 对应 Shaders 目录里的 Aurora / LinearGradient / Gradient，用于页面底光。
  function aurora(canvas, opts) {
    opts = opts || {};
    var colors = opts.colors || ['#18D1FF', '#7ee5ff', '#FFD800', '#0098DC'];
    var speed = opts.speed || 0.07;
    var ctl = setup(canvas, opts);
    return ctl.start(function (ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      var bands = opts.bands || 4;
      for (var i = 0; i < bands; i++) {
        var k = i / (bands - 1 || 1);
        var cx = w * (0.5 + 0.42 * Math.sin(t * speed * (1 + k) + i * 1.7));
        var cy = h * (0.35 + 0.34 * Math.cos(t * speed * 0.8 + i * 2.1));
        var r = Math.max(w, h) * (0.42 + 0.16 * Math.sin(t * speed + i));
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        var c = colors[i % colors.length];
        g.addColorStop(0, hexA(c, opts.alpha == null ? 0.5 : opts.alpha));
        g.addColorStop(0.5, hexA(c, 0.12));
        g.addColorStop(1, hexA(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (opts.grain !== false) grain(ctx, w, h, opts.grain == null ? 0.03 : opts.grain);
    });
  }

  /* --------------------------------------------------------- 网格渐变（meshy） */
  function mesh(canvas, opts) {
    opts = opts || {};
    var colors = opts.colors || ['#1E1B4B', '#F97316', '#312E81'];
    var ctl = setup(canvas, opts);
    var blobs = colors.map(function (c, i) { return { c: c, x: Math.random(), y: Math.random(), r: 0.45 + Math.random() * 0.3, s: (0.03 + Math.random() * 0.05) * (i % 2 ? -1 : 1) }; });
    return ctl.start(function (ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      blobs.forEach(function (b, i) {
        var x = w * (b.x + 0.28 * Math.sin(t * b.s * 6 + i));
        var y = h * (b.y + 0.24 * Math.cos(t * b.s * 5 + i * 1.3));
        var r = Math.max(w, h) * b.r;
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(b.c, 0.62)); g.addColorStop(1, hexA(b.c, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
    });
  }

  /* --------------------------------------------------------------- 扫描线 */
  function scanlines(canvas, opts) {
    opts = opts || {};
    var gap = opts.gap || 3, alpha = opts.alpha == null ? 0.14 : opts.alpha;
    var ctl = setup(canvas, opts);
    return ctl.start(function (ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      var off = (t * (opts.speed || 14)) % gap;
      for (var y = -gap; y < h; y += gap) ctx.fillRect(0, y + off, w, 1);
      if (opts.sweep !== false) {
        var sy = ((t * (opts.sweepSpeed || 60)) % (h + 160)) - 80;
        var g = ctx.createLinearGradient(0, sy - 70, 0, sy + 70);
        g.addColorStop(0, hexA(opts.sweepColor || '#18D1FF', 0));
        g.addColorStop(0.5, hexA(opts.sweepColor || '#18D1FF', 0.10));
        g.addColorStop(1, hexA(opts.sweepColor || '#18D1FF', 0));
        ctx.fillStyle = g; ctx.fillRect(0, sy - 70, w, 140);
      }
    });
  }

  /* ------------------------------------------------- 点阵 / 网格（Lattice 启发） */
  function dots(canvas, opts) {
    opts = opts || {};
    var gap = opts.gap || 26, r = opts.r || 1.2;
    var ctl = setup(canvas, opts);
    if (opts.static) { var s = ctl.size; drawDots(ctl.ctx, s.w, s.h, 0); return ctl; }
    return ctl.start(drawDots);
    function drawDots(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      var col = opts.color || 'rgba(255,255,255,.22)';
      var wave = opts.wave !== false;
      for (var y = gap; y < h; y += gap) {
        for (var x = gap; x < w; x += gap) {
          var d = wave ? 1 + 0.55 * Math.sin((x + y) * 0.012 - t * 1.4) : 1;
          ctx.beginPath();
          ctx.fillStyle = col;
          ctx.globalAlpha = wave ? 0.35 + 0.35 * Math.sin((x * 0.7 + y * 0.4) * 0.01 - t * 0.9) : 1;
          ctx.arc(x, y, r * d, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /* -------------------------------------------------------------- 轻量粒子 */
  function particles(canvas, opts) {
    opts = opts || {};
    var count = opts.count || 40;
    var ctl = setup(canvas, opts);
    var ps = [];
    return ctl.start(function (ctx, w, h, t) {
      if (ps.length !== count) {
        ps = [];
        for (var i = 0; i < count; i++) ps.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 10, r: 0.6 + Math.random() * 1.6, a: 0.15 + Math.random() * 0.4 });
      }
      ctx.clearRect(0, 0, w, h);
      ps.forEach(function (p) {
        p.x += p.vx * 0.016; p.y += p.vy * 0.016;
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w; }
        if (p.x < -6) p.x = w + 6; if (p.x > w + 6) p.x = -6;
        ctx.beginPath();
        ctx.fillStyle = hexA(opts.color || '#ffffff', p.a);
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      });
    });
  }

  /* ------------------------------------------------------------- 金属拉丝光泽 */
  function sheen(canvas, opts) {
    opts = opts || {};
    var ctl = setup(canvas, opts);
    return ctl.start(function (ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      var x = ((t * 0.22) % 1.6 - 0.3) * w;
      var g = ctx.createLinearGradient(x - w * 0.3, 0, x + w * 0.3, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,' + (opts.alpha == null ? 0.09 : opts.alpha) + ')');
      g.addColorStop(0.55, 'rgba(255,255,255,' + (opts.alpha == null ? 0.05 : opts.alpha * 0.5) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.5;
      for (var y = 0; y < h; y += 2) {
        ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.02) + ')';
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1;
    });
  }

  /* ----------------------------------------------------------------- 小工具 */
  function grain(ctx, w, h, amount) {
    var n = Math.floor(w * h * 0.0022);
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.random() * amount + ')';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }
  function hexA(hex, a) {
    if (hex.charAt(0) !== '#') return hex;
    var v = hex.slice(1);
    if (v.length === 3) v = v.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  MP.fx = {
    noise: noise, aurora: aurora, mesh: mesh, scanlines: scanlines, dots: dots,
    particles: particles, sheen: sheen, hexA: hexA,
    auto: function (root) {
      // 按 data-fx 自动挂载：<canvas data-fx="aurora" data-fx-colors="#18D1FF,#FFD800">
      var list = (root || document).querySelectorAll('canvas[data-fx]');
      var made = [];
      Array.prototype.forEach.call(list, function (c) {
        var kind = c.getAttribute('data-fx');
        if (typeof MP.fx[kind] !== 'function') return;
        var opts = {};
        var colors = c.getAttribute('data-fx-colors');
        if (colors) opts.colors = colors.split(',').map(function (s) { return s.trim(); });
        if (c.hasAttribute('data-fx-static')) opts.static = true;
        if (c.getAttribute('data-fx-alpha')) opts.alpha = parseFloat(c.getAttribute('data-fx-alpha'));
        made.push(MP.fx[kind](c, opts));
      });
      return made;
    }
  };
})(window);

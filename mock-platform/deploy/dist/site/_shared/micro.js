/* ============================================================================
 * mock-platform / _shared/micro.js
 * 微交互原语（Micro-interactions）
 *
 * 知识来源：react-bits 的「Micro」分类（34 个微交互组件）给了我一套「什么样的
 * 小控件才算活」的范式——按住确认、速度驱动的形变、液面惯性、状态三段形变、
 * 拖拽数值、引信倒计时与撤销、格点涟漪加载。
 * 本项目按这些**交互范式**重新实现（原创代码，未复制其源码，以符合其
 * MIT + Commons Clause 中「不得再分发组件本身及其移植版」的限制）。
 * 参数与手感（时长、阻尼、位移量）按本平台场景重新调过。
 * ==========================================================================*/
(function (global) {
  'use strict';
  var MP = global.MP || (global.MP = {});
  var M = MP.motion;
  var reduced = function () { return MP.motion.reduced; };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var h = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ------------------------------------------------ 1. 按住确认（hold to confirm） */
  // 场景：启动 mock 服务 / 执行升级这类不可轻率触发的动作，必须按住到满。
  function holdConfirm(el, opts) {
    opts = opts || {};
    var dur = opts.duration || 1100;
    el.classList.add('mx-hold');
    if (!el.querySelector('.mx-hold__fill')) el.appendChild(h('span', 'mx-hold__fill'));
    var fill = el.querySelector('.mx-hold__fill');
    var label = el.querySelector('.mx-hold__label');
    var p = 0, timer = null, done = false;
    function paint() { fill.style.transform = 'scaleX(' + p + ')'; fill.style.opacity = p > 0 ? '1' : '0'; }
    function start(e) {
      if (el.disabled || done) return;
      e.preventDefault();
      el.classList.add('is-holding');
      MP.sfx.play('tick');
      var t0 = performance.now();
      (function tick(ts) {
        p = clamp((ts - t0) / dur, 0, 1);
        paint();
        if (p < 1) timer = requestAnimationFrame(tick);
        else finish(true);
      })(t0);
    }
    function finish(ok) {
      cancelAnimationFrame(timer);
      el.classList.remove('is-holding');
      if (ok) {
        done = true; p = 1; paint();
        el.classList.add('is-done');
        MP.sfx.play('latch');
        if (label && opts.doneLabel) label.textContent = opts.doneLabel;
        if (opts.onConfirm) opts.onConfirm();
        setTimeout(function () { if (opts.resetAfter !== 0) release(); }, opts.resetAfter || 1400);
      } else {
        if (p > 0.05 && MP.sfx.enabled) MP.sfx.play('undo');
        var s = M.spring({ from: p, to: 0, stiffness: 320, damping: 18, onUpdate: function (v) { p = clamp(v, 0, 1); paint(); } });
        setTimeout(function () { s.stop(); p = 0; paint(); }, 420);
        if (label && opts.label) label.textContent = opts.label;
      }
    }
    function release() { done = false; p = 0; paint(); el.classList.remove('is-done'); if (label && opts.label) label.textContent = opts.label; }
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', function () { if (!done) finish(false); });
    el.addEventListener('pointerleave', function () { if (!done) finish(false); });
    el.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') start(e); });
    el.addEventListener('keyup', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !done) finish(false); });
    paint();
    return { release: release, get progress() { return p; } };
  }

  /* --------------------------------------------- 2. 速度驱动的挤压开关（squish） */
  function velocitySwitch(el, opts) {
    opts = opts || {};
    var on = opts.checked;
    var rail = h('span', 'mx-sw__rail'), thumb = h('span', 'mx-sw__thumb');
    el.classList.add('mx-sw');
    el.appendChild(rail); el.appendChild(thumb);
    el.setAttribute('role', 'switch');
    var last = 0, v = 0, stretch = 1, raf = 0;
    function paint() {
      el.classList.toggle('is-on', on);
      thumb.style.transform = 'translateX(' + (on ? '100%' : '0%') + ') scaleX(' + stretch + ')';
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    function loop() {
      var sp = Math.min(1, Math.abs(v) / 6);
      thumb.style.transform = 'translateX(' + (on ? '100%' : '0%') + ') scaleX(' + (1 + sp * 0.55) + ')';
      if (performance.now() - last < 160) raf = requestAnimationFrame(loop);
      else { stretch = 1; paint(); }
    }
    function toggle(e) {
      if (el.disabled) return;
      on = !on;
      v = performance.now() - last; last = performance.now();
      if (!reduced()) loop();
      paint();
      MP.sfx.play(on ? 'confirm' : 'toggle');
      if (opts.onChange) opts.onChange(on);
    }
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(e); } });
    if (opts.label) el.setAttribute('aria-label', opts.label);
    el.tabIndex = el.tabIndex >= 0 ? el.tabIndex : 0;
    paint();
    return { set: function (v) { on = v; paint(); }, get value() { return on; } };
  }

  /* --------------------------------------------------- 3. 摆动液面读数（gauge） */
  // 场景：升级进度、虚层 CPU 分配这类「连续量」，用惯性液面比进度条更有存在感。
  function gauge(el, opts) {
    opts = opts || {};
    var value = opts.value == null ? 0 : opts.value;
    var shown = value, v = 0;
    el.classList.add('mx-gauge');
    el.innerHTML = '<span class="mx-gauge__glass"><span class="mx-gauge__liquid"></span></span>' +
      '<span class="mx-gauge__read"><b class="mx-gauge__num">0</b><i class="mx-gauge__unit">' + (opts.unit || '%') + '</i></span>';
    var liquid = el.querySelector('.mx-gauge__liquid');
    var num = el.querySelector('.mx-gauge__num');
    var raf = 0;
    function loop() {
      var diff = value - shown;
      v += diff * 0.10; v *= 0.84; shown += v;
      if (Math.abs(diff) < 0.02 && Math.abs(v) < 0.02) { shown = value; v = 0; }
      var pct = clamp(shown, 0, 100);
      liquid.style.height = pct + '%';
      liquid.style.transform = 'rotate(' + clamp(v * 1.4, -6, 6) + 'deg)';
      num.textContent = Math.round(pct);
      if (Math.abs(value - shown) > 0.01 || Math.abs(v) > 0.01) raf = requestAnimationFrame(loop);
    }
    function set(nv) { value = clamp(nv, 0, 100); if (reduced()) { shown = value; liquid.style.height = value + '%'; num.textContent = Math.round(value); return; } cancelAnimationFrame(raf); loop(); }
    set(value);
    if (opts.label) el.setAttribute('aria-label', opts.label + ' ' + value + (opts.unit || '%'));
    return { set: set, get value() { return value; } };
  }

  /* --------------------------------------------- 4. 状态三段形变（status mark） */
  // idle 环 → working 弧（转动）→ done 勾 / error 叹号
  function statusMark(el, opts) {
    opts = opts || {};
    el.classList.add('mx-mark');
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"></circle>' +
      '<path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"></path>' +
      '<path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"></path>' +
      '<path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"></path></svg>' +
      (opts.label ? '<span class="mx-mark__label">' + opts.label + '</span>' : '');
    var cur = 'idle';
    function set(state, text) {
      cur = state;
      el.classList.remove('is-idle', 'is-working', 'is-done', 'is-error');
      el.classList.add('is-' + state);
      if (text && el.querySelector('.mx-mark__label')) el.querySelector('.mx-mark__label').textContent = text;
      if (state === 'done') MP.sfx.play('confirm');
      if (state === 'error') MP.sfx.play('warn');
    }
    set(opts.state || 'idle');
    return { set: set, get state() { return cur; } };
  }

  /* ------------------------------------------- 5. 拖拽改数值 + 橡皮筋（scrub） */
  function scrub(el, opts) {
    opts = opts || {};
    var min = opts.min == null ? 0 : opts.min, max = opts.max == null ? 100 : opts.max;
    var step = opts.step || 1, value = opts.value == null ? min : opts.value;
    var startX = 0, startV = 0, dragging = false, over = 0;
    el.classList.add('mx-scrub');
    if (opts.label) { var l = h('span', 'mx-scrub__label', opts.label); el.insertBefore(l, el.firstChild); }
    var val = h('span', 'mx-scrub__val', String(value));
    el.appendChild(val);
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    function paint() {
      var shown = value + over;
      val.textContent = (opts.prefix || '') + Math.round(shown) + (opts.suffix || '');
      el.style.setProperty('--scrub-p', ((value - min) / (max - min) * 100) + '%');
      el.setAttribute('aria-valuenow', String(value));
      el.setAttribute('aria-valuemin', String(min)); el.setAttribute('aria-valuemax', String(max));
    }
    function down(e) { dragging = true; startX = e.clientX; startV = value; el.classList.add('is-dragging'); el.setPointerCapture && el.setPointerCapture(e.pointerId); }
    function move(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var raw = startV + dx * (opts.sensitivity || 0.6) * step;
      if (raw > max) over = Math.min((raw - max) * 0.35, (max - min) * 0.12);
      else if (raw < min) over = Math.max((raw - min) * 0.35, -(max - min) * 0.12);
      else over = 0;
      value = clamp(Math.round(raw / step) * step, min, max);
      paint();
      if (opts.onChange) opts.onChange(value);
    }
    function up() { if (!dragging) return; dragging = false; el.classList.remove('is-dragging'); var s = M.spring({ from: over, to: 0, stiffness: 300, damping: 16, onUpdate: function (v) { over = v; paint(); } }); paint(); MP.sfx.play('step'); }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0);
      if (!d) return; e.preventDefault();
      value = clamp(value + d, min, max); paint(); MP.sfx.play('step');
      if (opts.onChange) opts.onChange(value);
    });
    paint();
    return { set: function (v) { value = clamp(v, min, max); paint(); }, get value() { return value; } };
  }

  /* --------------------------------- 6. 带引信倒计时的提示 + 撤销（toast/fuse） */
  function toast(host, opts) {
    opts = opts || {};
    var node = h('div', 'mx-toast' + (opts.tone ? ' mx-toast--' + opts.tone : ''));
    node.innerHTML =
      '<div class="mx-toast__bar"><i style="animation-duration:' + (opts.duration || 4200) + 'ms"></i></div>' +
      '<div class="mx-toast__body"><b class="mx-toast__title">' + (opts.title || '') + '</b>' +
      (opts.desc ? '<span class="mx-toast__desc">' + opts.desc + '</span>' : '') + '</div>' +
      (opts.actionLabel ? '<button class="mx-toast__action" type="button">' + opts.actionLabel + '</button>' : '') +
      '<button class="mx-toast__close" type="button" aria-label="关闭">×</button>';
    host.appendChild(node);
    if (!reduced()) {
      node.style.transform = 'translateY(-14px)'; node.style.opacity = '0';
      requestAnimationFrame(function () { node.style.transition = 'transform 320ms cubic-bezier(0.2,0.8,0.2,1), opacity 240ms linear'; node.style.transform = 'none'; node.style.opacity = '1'; });
    }
    var closed = false;
    function close(byUser) {
      if (closed) return; closed = true;
      node.style.transition = 'transform 260ms cubic-bezier(0.4,0,1,1), opacity 220ms linear';
      node.style.transform = 'translateY(-10px) scale(0.97)'; node.style.opacity = '0';
      setTimeout(function () { node.remove(); }, 280);
      if (byUser && opts.onUndo) opts.onUndo();
    }
    var t = setTimeout(function () { close(false); }, opts.duration || 4200);
    node.querySelector('.mx-toast__close').addEventListener('click', function () { clearTimeout(t); close(true); });
    if (opts.actionLabel) node.querySelector('.mx-toast__action').addEventListener('click', function () { clearTimeout(t); MP.sfx.play('undo'); close(false); if (opts.onAction) opts.onAction(); });
    // 下滑消解（SwipeToast 的做法）
    var y0 = null;
    node.addEventListener('pointerdown', function (e) { y0 = e.clientY; });
    node.addEventListener('pointerup', function (e) { if (y0 != null && e.clientY - y0 < -26) { clearTimeout(t); close(false); } y0 = null; });
    return { close: close, node: node };
  }

  /* ------------------------------------------- 7. 菱形涟漪加载（PRTS 母题） */
  function rippleLoader(el, opts) {
    opts = opts || {};
    el.classList.add('mx-ripple');
    el.innerHTML = '<i></i><i></i><i></i>' + (opts.label ? '<span>' + opts.label + '</span>' : '');
    return { stop: function () { el.classList.remove('mx-ripple'); el.innerHTML = opts.label || ''; } };
  }

  /* ------------------------------- 8. 格点波动 + 计时（agent 状态行的做法） */
  function latticeLoader(el, opts) {
    opts = opts || {};
    var n = opts.size || 9;
    el.classList.add('mx-lattice');
    var html = '<span class="mx-lattice__grid">';
    for (var i = 0; i < n; i++) html += '<i style="animation-delay:' + (i * 90) + 'ms"></i>';
    html += '</span><b class="mx-lattice__label">' + (opts.label || '') + '</b><span class="mx-lattice__time">0.0s</span>';
    el.innerHTML = html;
    var t0 = performance.now(), raf = 0, time = el.querySelector('.mx-lattice__time');
    (function tick(ts) {
      time.textContent = ((ts - t0) / 1000).toFixed(1) + 's';
      raf = requestAnimationFrame(tick);
    })(t0);
    return {
      label: function (s) { el.querySelector('.mx-lattice__label').textContent = s; },
      done: function (s) { el.classList.add('is-done'); el.querySelector('.mx-lattice__label').textContent = s; cancelAnimationFrame(raf); },
      stop: function () { cancelAnimationFrame(raf); }
    };
  }

  /* --------------------------------------- 9. 橡皮筋分段控件（jelly segmented） */
  function segmented(root, opts) {
    opts = opts || {};
    var items = opts.items || [];
    var value = opts.value == null ? items[0] && items[0].value : opts.value;
    root.classList.add('mx-seg');
    root.innerHTML = '<span class="mx-seg__thumb"></span>';
    items.forEach(function (it) {
      var b = h('button', 'mx-seg__item', it.label);
      b.type = 'button';
      b.dataset.value = it.value;
      b.addEventListener('click', function () { set(it.value); });
      root.appendChild(b);
    });
    var thumb = root.querySelector('.mx-seg__thumb');
    function set(v, silent) {
      value = v;
      var btns = root.querySelectorAll('.mx-seg__item');
      var idx = 0;
      Array.prototype.forEach.call(btns, function (b, i) { b.classList.toggle('is-active', b.dataset.value === String(v)); if (b.dataset.value === String(v)) idx = i; });
      var b = btns[idx]; if (!b) return;
      var w = b.offsetWidth, x = b.offsetLeft;
      if (reduced()) { thumb.style.width = w + 'px'; thumb.style.transform = 'translateX(' + x + 'px)'; }
      else {
        // 从当前位置「拉伸着」滑过去：先拉宽再收回（橡皮筋）
        var cur = parseFloat((thumb.style.transform.match(/translateX\(([-\d.]+)/) || [0, 0])[1]) || 0;
        thumb.style.width = (w + Math.min(28, Math.abs(x - cur) * 0.35)) + 'px';
        thumb.style.transform = 'translateX(' + (x - Math.min(14, Math.abs(x - cur) * 0.18)) + 'px)';
        setTimeout(function () { thumb.style.width = w + 'px'; thumb.style.transform = 'translateX(' + x + 'px)'; }, 12);
      }
      if (!silent) { MP.sfx.play('step'); if (opts.onChange) opts.onChange(v); }
    }
    setTimeout(function () { set(value, true); }, 0);
    global.addEventListener('resize', function () { set(value, true); });
    return { set: set, get value() { return value; } };
  }

  /* --------------------------- 10. 完成后可撤销的引信按钮（fuse / undo） */
  function fuseButton(el, opts) {
    opts = opts || {};
    el.classList.add('mx-fuse');
    var label = opts.label || '执行';
    var doneLabel = opts.doneLabel || '已完成';
    var undoLabel = opts.undoLabel || '撤销';
    el.innerHTML = '<span class="mx-fuse__burn"></span><span class="mx-fuse__text">' + label + '</span>';
    var text = el.querySelector('.mx-fuse__text');
    var burn = el.querySelector('.mx-fuse__burn');
    var state = 'idle', timer = null;
    function commit() {
      state = 'done';
      el.classList.add('is-done');
      text.textContent = doneLabel;
      burn.style.transition = 'none'; burn.style.transform = 'scaleX(1)';
      void burn.offsetWidth;
      burn.style.transition = 'transform ' + ((opts.undoWindow || 4000)) + 'ms linear';
      burn.style.transform = 'scaleX(0)';
      MP.sfx.play('latch');
      if (opts.onCommit) opts.onCommit();
      timer = setTimeout(function () { reset(); if (opts.onFuseEnd) opts.onFuseEnd(); }, opts.undoWindow || 4000);
    }
    function reset() { state = 'idle'; el.classList.remove('is-done'); text.textContent = label; burn.style.transition = 'none'; burn.style.transform = 'scaleX(1)'; clearTimeout(timer); }
    el.addEventListener('click', function () {
      if (el.disabled) return;
      if (state === 'idle') commit();
      else { reset(); MP.sfx.play('undo'); if (opts.onUndo) opts.onUndo(); }
    });
    return { commit: commit, reset: reset, get state() { return state; } };
  }

  /* ------------------------------------------------- 11. 磁吸 & 光斑跟随 */
  function magnetic(el, opts) {
    opts = opts || {};
    var strength = opts.strength || 0.22;
    el.classList.add('mx-magnetic');
    function move(e) {
      var r = el.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) * strength;
      var dy = (e.clientY - (r.top + r.height / 2)) * strength;
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    function leave() { el.style.transform = 'none'; }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return { destroy: function () { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); } };
  }

  function spotlight(el) {
    el.classList.add('mx-spot');
    function move(e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }
    el.addEventListener('pointermove', move);
    return { destroy: function () { el.removeEventListener('pointermove', move); } };
  }

  MP.micro = {
    holdConfirm: holdConfirm, velocitySwitch: velocitySwitch, gauge: gauge, statusMark: statusMark,
    scrub: scrub, toast: toast, rippleLoader: rippleLoader, latticeLoader: latticeLoader,
    segmented: segmented, fuseButton: fuseButton, magnetic: magnetic, spotlight: spotlight,
    h: h
  };
})(window);

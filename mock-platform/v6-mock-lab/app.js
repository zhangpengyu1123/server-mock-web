/* ============================================================================
 * V6 · MOCK 实验台 —— 核心（信号链 / 母线 / 监视器 / 审计带 / 闸门）
 *
 * 结构隐喻（本版的设计主张）：
 *   对端网元 → 接入层 → 能力矩阵 → 响应引擎 → 审计带，是一条**信号链**。
 *   每来一次请求，就有一颗信号脉冲从链首走到它该停的节点；需要人放行的请求会停在闸门前排队。
 *   底部审计带是可回放的时间轴：拖动播放头 = 回到那一刻，列表与监视器一起回退。
 *
 * 本文件只做「链 / 带 / 监视器 / 闸门」；六个仪器抽屉在 instruments.js 里注册。
 * 动效一律走 ui-ux-pro-max 技能落地的 MP.motion / MP.micro / MP.btn，不自己发明时长曲线。
 * ==========================================================================*/
window.V6 = (function () {
  'use strict';
  var MP = window.MP;
  if (!MP) { console.error('[V6] 共享层未加载'); return null; }
  var S = MP.state, A = MP.actions, SEL = MP.select, M = MP.motion, X = MP.micro;

  /* ------------------------------------------------------------ 小工具 */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function n2(v) { return String(v).padStart(2, '0'); }
  function pct(v) { return Math.max(0, Math.min(100, v)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clockOf(d) { d = d || new Date(); return n2(d.getHours()) + ':' + n2(d.getMinutes()) + ':' + n2(d.getSeconds()); }

  /* ------------------------------------------------------------ 运行时状态 */
  var OP = 'JOYCE';
  var SCREENS = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var STAGE = { mock: 1, flow: 3, ne: 2, omp: 2, lcm: 2, vlp: 2 };   // 每屏在链上的落点
  var SPAN = 360000;                                                  // 审计带窗口 = 6 分钟（够放下一整段会话历史）
  var ui = {
    loop: 0, fps: 0, scope: 'wave', gateOpen: false, lastInteract: Date.now(),
    rate: 1, tape: { mode: 'live', cursor: 1 }, live: { ok: 0, err: 0 }, lastLogId: null
  };
  var instruments = {};   // { name: { render, wire, inspect } }
  var gateDots = [];

  /* ============================================================ 渲染协调 */
  var busy = false;
  function keepFocus(fn) {
    var ae = document.activeElement, id = ae && ae.id, s = ae && ae.selectionStart, e = ae && ae.selectionEnd;
    var sx = window.scrollX, sy = window.scrollY;
    fn();
    if (id) { var n = document.getElementById(id); if (n && n.focus) { try { n.focus({ preventScroll: true }); if (s != null && n.setSelectionRange) n.setSelectionRange(s, e); } catch (err) {} } }
    if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo(sx, sy);
  }

  function renderBus() {
    var k = SEL.kpis();
    setNum($('#roReq'), k.req); setNum($('#roOk'), k.ok); setNum($('#roErr'), k.err);
    setNum($('#roLat'), k.avgLat); setNum($('#roGate'), k.pendingHuman);
    setNum($('#roLoop'), ui.loop);
    var lv = $('#roLive');
    if (lv) { lv.textContent = ui.tape.mode === 'live' ? 'LIVE' : clockOf(new Date(cutoff())) ; lv.style.color = ui.tape.mode === 'live' ? 'var(--sig)' : 'var(--gate)'; }
    var gc = $('#gateCount'); if (gc) gc.textContent = k.pendingHuman;
    var led = $('[data-gate-led]'); if (led) led.className = 'led led--gate' + (k.pendingHuman ? ' is-warn' : '');
    var rb = $('#recBtn'); if (rb) rb.setAttribute('aria-pressed', ui.tape.mode === 'live' ? 'true' : 'false');
    var gb = $('#gateBtn'); if (gb) gb.setAttribute('aria-pressed', k.pendingHuman ? 'true' : 'false');
  }
  function setNum(node, v) {
    if (!node) return;
    v = +v || 0;
    if (node.__v === v) return;
    node.__v = v;
    if (M && !M.reduced) M.countUp(node, v, { duration: 420 }); else node.textContent = v;
  }

  /* ================================================================ 信号链 */
  // 横向信号链：节点中心相对链轨的 X 偏移
  function nodeStops() {
    var host = $('#pathPulses'); if (!host) return [0];
    var rb = host.getBoundingClientRect();
    return $$('.node').map(function (b, i) {
      var r = b.getBoundingClientRect();
      return r.width ? (r.left - rb.left + r.width / 2) : i * 190 + 95;
    });
  }
  function flashNode(i) {
    var b = $$('.node')[i]; if (!b) return;
    b.classList.remove('is-flash'); void b.offsetWidth; b.classList.add('is-flash');
  }
  function pulse(stageIdx, kind) {
    if (M.reduced) { flashNode(stageIdx); return null; }
    var host = $('#pathPulses'); if (!host) return null;
    var stops = nodeStops(), to = stops[clamp(stageIdx, 0, stops.length - 1)] - 5;
    var dot = el('span', 'pulse' + (kind === 'err' ? ' pulse--alarm' : kind === 'gate' ? ' pulse--gate' : ''));
    host.appendChild(dot);
    var anim = dot.animate(
      [{ transform: 'translateX(0px) scale(.55)', opacity: .18 }, { transform: 'translateX(' + to + 'px) scale(1)', opacity: 1 }],
      { duration: 720 + stageIdx * 110, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
    );
    anim.onfinish = function () {
      flashNode(stageIdx);
      if (kind === 'gate') return;                       // 闸门脉冲留在原地排队
      anim.cancel(); dot.remove();
    };
    if (kind === 'gate') gateDots.push(dot);
    return dot;
  }
  function renderGateDots() {
    // 停在闸门前的脉冲数量 = 待人工请求数（最多 4 颗，其余并成计数显示在母线）
    var host = $('#pathPulses'); if (!host) return;
    var pend = SEL.kpis().pendingHuman;
    while (gateDots.length > Math.min(pend, 4)) gateDots.pop().remove();
    while (gateDots.length < Math.min(pend, 4)) {
      var d = pulse(3, 'gate');
      if (!d) break;
    }
    gateDots.forEach(function (d, i) { d.style.opacity = (0.55 + 0.45 * Math.sin(performance.now() / 420 + i)).toFixed(3); });
  }

  function renderPath() {
    var k = SEL.kpis();
    var runningPorts = S.ports.filter(function (p) { return p.running; }).length;
    var mounts = S.ports.reduce(function (n, p) { return n + p.caps.length; }, 0);
    var eps = 0;
    S.ports.forEach(function (p) { SEL.capsOfPort(p.id).forEach(function (c) { eps += c.endpoints; }); });
    var sets = {
      peer: S.nes.length + ' 标本 · ' + S.nes.filter(function (n) { return n.status === '在线'; }).length + ' 在线',
      ingress: runningPorts + '/' + S.ports.length + ' 在服 · ' + k.req + ' 请求',
      matrix: mounts + ' 挂载 · ' + eps + ' 接口 · ' + S.caps.length + ' 能力',
      engine: S.apis.length + ' 接口 · ' + S.apis.filter(function (a) { return a.enabled !== false; }).length + ' 启用',
      tape: S.logs.length + ' 条 · 待放行 ' + k.pendingHuman
    };
    var leds = {
      peer: S.nes.length ? (S.nes.every(function (n) { return n.status === '在线'; }) ? 'is-on' : '') : '',
      ingress: runningPorts ? 'is-on' : '',
      matrix: mounts ? 'is-on' : '',
      engine: k.err ? 'is-err' : (S.apis.length ? 'is-on' : ''),
      tape: k.pendingHuman ? 'is-warn' : (S.logs.length ? 'is-on' : '')
    };
    Object.keys(sets).forEach(function (id) {
      var kv = $('#node' + id.charAt(0).toUpperCase() + id.slice(1));
      if (kv) kv.textContent = sets[id];
      var led = $('[data-node-led="' + id + '"]');
      if (led) led.className = 'led ' + (leds[id] || '');
    });

    // 链上游标：停在当前界面所属节点
    var idx = STAGE[S.ui.screen] != null ? STAGE[S.ui.screen] : 1;
    var cur = $('#pathCursor'), stops = nodeStops(), nodes = $$('.node'), rail = $('#pathPulses');
    if (cur && rail && nodes[idx]) {
      var rb = rail.getBoundingClientRect(), nr = nodes[idx].getBoundingClientRect();
      if (nr.width) { cur.style.left = (nr.left - rb.left) + 'px'; cur.style.width = nr.width + 'px'; }
      else { cur.style.left = Math.max(0, stops[idx] - 20) + 'px'; cur.style.width = '40px'; }
    }
    $$('.node').forEach(function (b, i) { b.classList.toggle('is-active', i === idx); });
    renderGateDots();
  }

  /* ================================================================ 监视器 */
  var SCOPE_SPAN = 60000;   // 示波器窗口比审计带短：让波形更密、更像在跳
  function buckets() {
    var n = 32, out = [], t1 = tapeT1(), span = SCOPE_SPAN, w = span / n, now = t1;
    for (var i = 0; i < n; i++) out.push({ t0: now - span + i * w, ok: 0, err: 0, lat: 0 });
    ui.cut = null;
    var cut = cutoff();
    S.logs.forEach(function (l) {
      if (l.ts > cut) return;
      var i = Math.floor((l.ts - out[0].t0) / w);
      if (i < 0 || i >= n) return;
      if (l.status >= 400 || l.verdict === '异常') out[i].err++; else out[i].ok++;
      out[i].lat += l.latencyMs || 0;
    });
    return out;
  }
  var scopeCv, scopeCtx, dpr = 1;
  function sizeScope() {
    if (!scopeCv) return;
    var r = scopeCv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    scopeCv.width = Math.max(1, Math.floor(r.width * dpr));
    scopeCv.height = Math.max(1, Math.floor(r.height * dpr));
  }
  function drawScope() {
    if (!scopeCtx) return;
    var W = scopeCv.width, H = scopeCv.height;
    var cs = getComputedStyle(document.documentElement);
    var sig = cs.getPropertyValue('--sig').trim() || '#4be0c8';
    var alarm = cs.getPropertyValue('--alarm').trim() || '#ff6b6b';
    var brass = cs.getPropertyValue('--brass').trim() || '#c9a05c';
    var line = 'rgba(255,255,255,.09)';
    scopeCtx.clearRect(0, 0, W, H);
    scopeCtx.lineWidth = 1 * dpr;
    scopeCtx.strokeStyle = line;
    for (var g = 1; g < 4; g++) {
      scopeCtx.beginPath(); scopeCtx.moveTo(0, H * g / 4); scopeCtx.lineTo(W, H * g / 4); scopeCtx.stroke();
    }
    var b = buckets();
    if (ui.scope === 'dist') {
      // 延迟分布：按 12 档统计条目数，并标出均值
      var bins = new Array(12).fill(0), maxL = 0, sum = 0, cnt = 0;
      var cut = cutoff();
      S.logs.forEach(function (l) { if (l.ts > cut) return; maxL = Math.max(maxL, l.latencyMs || 0); sum += l.latencyMs || 0; cnt++; });
      var top = Math.max(200, Math.ceil((maxL || 200) / 100) * 100);
      S.logs.forEach(function (l) {
        if (l.ts > cut) return;
        var i = clamp(Math.floor((l.latencyMs || 0) / top * 12), 0, 11); bins[i]++;
      });
      var mx = Math.max(1, Math.max.apply(null, bins));
      var bw = W / 12;
      bins.forEach(function (v, i) {
        var h = (v / mx) * (H - 16);
        scopeCtx.fillStyle = (i >= 9) ? alarm : sig;
        scopeCtx.globalAlpha = .78;
        scopeCtx.fillRect(i * bw + 1 * dpr, H - h - 8 * dpr, bw - 2 * dpr, h);
      });
      scopeCtx.globalAlpha = 1;
      if (cnt) {
        var avg = sum / cnt, x = clamp(avg / top, 0, 1) * W;
        scopeCtx.strokeStyle = brass; scopeCtx.setLineDash([3 * dpr, 3 * dpr]);
        scopeCtx.beginPath(); scopeCtx.moveTo(x, 0); scopeCtx.lineTo(x, H); scopeCtx.stroke(); scopeCtx.setLineDash([]);
      }
    } else {
      var mx2 = 1, i;
      for (i = 0; i < b.length; i++) mx2 = Math.max(mx2, b[i].ok + b[i].err);
      var bw2 = W / b.length;
      for (i = 0; i < b.length; i++) {
        var tot = b[i].ok + b[i].err;
        var h2 = (tot / mx2) * (H - 10 * dpr);
        var y = H - 6 * dpr;
        if (b[i].ok) { scopeCtx.fillStyle = sig; scopeCtx.globalAlpha = .82; scopeCtx.fillRect(i * bw2 + 1 * dpr, y - h2, bw2 - 2 * dpr, h2); }
        if (b[i].err) {
          var eh = (b[i].err / mx2) * (H - 10 * dpr);
          scopeCtx.fillStyle = alarm; scopeCtx.globalAlpha = .95;
          scopeCtx.fillRect(i * bw2 + 1 * dpr, y - h2, bw2 - 2 * dpr, eh);
        }
      }
      scopeCtx.globalAlpha = 1;
      // 延迟折线
      scopeCtx.strokeStyle = brass; scopeCtx.globalAlpha = .7; scopeCtx.beginPath();
      for (i = 0; i < b.length; i++) {
        var t = b[i].ok + b[i].err; var lat = t ? b[i].lat / t : 0;
        var y2 = H - 6 * dpr - clamp(lat / 900, 0, 1) * (H - 10 * dpr);
        i ? scopeCtx.lineTo(i * bw2 + bw2 / 2, y2) : scopeCtx.moveTo(bw2 / 2, y2);
      }
      scopeCtx.stroke(); scopeCtx.globalAlpha = 1;
    }
    // 播放头（回放模式下显示）
    if (ui.tape.mode !== 'live') {
      scopeCtx.strokeStyle = cs.getPropertyValue('--gate').trim() || '#f4c152';
      scopeCtx.beginPath(); scopeCtx.moveTo(0, H - 2); scopeCtx.lineTo(W, H - 2); scopeCtx.stroke();
    }
  }
  function renderScopeKv() {
    var host = $('#scopeKv'); if (!host) return;
    var cut = cutoff();
    var vis = S.logs.filter(function (l) { return l.ts <= cut; });
    var ok = vis.filter(function (l) { return l.status < 400 && l.verdict !== '异常'; }).length;
    var err = vis.length - ok;
    var lat = vis.length ? Math.round(vis.reduce(function (n, l) { return n + (l.latencyMs || 0); }, 0) / vis.length) : 0;
    var rps = 0;
    var win = vis.filter(function (l) { return l.ts > Date.now() - 10000; }).length;
    rps = (win / 10).toFixed(1);
    host.innerHTML =
      kv('窗口', ui.tape.mode === 'live' ? 'LIVE' : clockOf(new Date(cut))) +
      kv('样本', vis.length) + kv('成功', ok) + kv('异常', err) +
      kv('平均时延', lat + ' ms') + kv('RPS', rps);
    function kv(k, v) { return '<span>' + esc(k) + ' <b>' + esc(v) + '</b></span>'; }
  }

  /* ============================================================== 审计带 */
  // 注意：domain.js 的 S.logs 既有 push 也有 unshift，顺序不保证 —— 一律按 ts 排序后再用
  function logsByTs() {
    return S.logs.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function cutoff() {
    if (ui.tape.mode === 'live' || !S.logs.length) return Infinity;
    var t0 = tapeT0(), t1 = tapeT1();
    return t0 + (t1 - t0) * ui.tape.cursor;
  }
  function tapeT1() { var l = logsByTs()[0]; return l ? l.ts : Date.now(); }
  function tapeT0() {
    var list = logsByTs();
    var oldest = list.length ? list[list.length - 1].ts : Date.now();
    var newest = list.length ? list[0].ts : Date.now();
    // 窗口至少覆盖「最近 SPAN」，但不把仅有的历史挤出画面
    return Math.max(oldest, newest - SPAN);
  }
  function logsInView() {
    var cut = cutoff(), t0 = tapeT0();
    return logsByTs().filter(function (l) { return l.ts >= t0 && (cut === Infinity || l.ts <= cut); });
  }
  function renderTape() {
    var marks = $('#tapeMarks'); if (!marks) return;
    var t0 = tapeT0(), t1 = tapeT1(), span = Math.max(1, t1 - t0), cut = cutoff();
    var list = S.logs.filter(function (l) { return l.ts >= t0; });
    var html = '';
    list.forEach(function (l) {
      var p = pct((l.ts - t0) / span * 100);
      var cls = 'mark';
      if (l.interaction && l.interaction.status === 'pending') cls += ' mark--gate';
      else if (l.status >= 400 || l.verdict === '异常') cls += ' mark--err';
      else cls += ' mark--ok';
      if (l.ts > cut) cls += ' is-future';
      html += '<span class="' + cls + '" style="left:' + p.toFixed(3) + '%" title="' + esc(l.clock + ' ' + l.method + ' ' + l.path + ' → ' + l.status) + '"></span>';
    });
    marks.innerHTML = html;
    var play = $('#tapePlay');
    if (play) play.style.left = pct(ui.tape.cursor * 100) + '%';
    var track = $('#tapeTrack');
    if (track) track.setAttribute('aria-valuenow', Math.round(ui.tape.cursor * 100));
    var read = $('#tapeRead');
    if (read) {
      var near = null, best = Infinity;
      logsInView().forEach(function (l) { var d = Math.abs(l.ts - cut); if (d < best) { best = d; near = l; } });
      var newest = logsByTs()[0];
      read.textContent = ui.tape.mode === 'live'
        ? (newest ? '最近 ' + newest.clock + ' ' + newest.method + ' ' + newest.path + ' → ' + newest.status + ' · ' + newest.latencyMs + 'ms' : '等待信号…')
        : (near ? '回放 ' + near.clock + ' ' + near.method + ' ' + near.path + ' → ' + near.status + ' · ' + near.latencyMs + 'ms' : '该时刻无记录');
    }
    var live = $('#tpLive'); if (live) live.setAttribute('aria-pressed', ui.tape.mode === 'live' ? 'true' : 'false');
    $$('.mark.is-future').forEach(function (m) { m.style.opacity = '.18'; });
  }

  function setCursor(p, fromDrag) {
    ui.tape.cursor = clamp(p, 0, 1);
    if (fromDrag) ui.tape.mode = 'review';
    ui.lastInteract = Date.now();
    renderTape(); renderScopeKv(); renderInspector();
  }
  function toLive() {
    ui.tape.mode = 'live'; ui.tape.cursor = 1;
    renderBus(); renderTape(); renderScopeKv(); renderInspector();
    toast('已回到实时', '播放头吸附到最新信号', 'ok');
  }
  function stepBack() {
    var cut = cutoff();
    var list = logsByTs();
    var prev = null;
    for (var i = 0; i < list.length; i++) { if (list[i].ts < (cut === Infinity ? tapeT1() : cut) - 1) { prev = list[i]; break; } }
    if (!prev) return;
    ui.tape.mode = 'review';
    var t1 = tapeT1(), t0 = tapeT0();
    ui.tape.cursor = clamp((prev.ts - t0) / Math.max(1, t1 - t0), 0, 1);
    renderBus(); renderTape(); renderScopeKv(); renderInspector();
  }

  /* ============================================================== 检查器 */
  function renderInspector() {
    var host = $('#inspectBox'); if (!host) return;
    var inst = instruments[S.ui.screen];
    var fn = inst && inst.inspect;
    var html = fn ? fn() : '<div class="empty">这台仪器没有检查器</div>';
    if (host.__sig === html) return;
    host.__sig = html;
    host.innerHTML = html;
    if (M && !M.reduced && host.firstElementChild) M.develop(host.firstElementChild, { duration: 260 });
  }
  function inspectorForPort(p) {
    if (!p) return '<div class="empty">在左侧端点清单里选一个端点</div>';
    var caps = SEL.capsOfPort(p.id) || [];
    var logs = logsInView().filter(function (l) { return l.portId === p.id; });
    var last = logs[0];
    return '<div class="insp">' +
      '<div class="insp__hd">' + (p.running ? '<i class="led is-on"></i>' : '<i class="led"></i>') +
      '<b class="mono">' + esc(p.ip) + ':' + esc(p.port) + '</b>' +
      '<span class="tag ' + (p.cert.status === 'issued' ? 'tag--sig' : 'tag--dim') + '">' + esc(p.cert.status === 'issued' ? 'CERT OK' : 'NO CERT') + '</span>' +
      '<span class="tag tag--dim">' + esc(p.protocol) + '/' + esc(p.tls) + '</span></div>' +
      '<div class="kvlist">' +
      row2('CN', p.cert.cn || '—') + row2('指纹', (p.cert.fingerprint || '—').slice(0, 18)) +
      row2('能力', caps.length ? caps.map(function (c) { return c.code; }).join(' ') : '未挂载') +
      row2('窗口内请求', logs.length + ' 条 · 异常 ' + logs.filter(function (l) { return l.status >= 400; }).length) +
      '</div>' +
      (last ? '<pre>' + esc(last.method + ' ' + last.path + ' → ' + last.status + '\n' + JSON.stringify(last.res && last.res.body ? last.res.body : {}, null, 1).slice(0, 420)) + '</pre>' :
        '<div class="hint">该端点还没有请求记录</div>') +
      '</div>';
  }
  function inspectorForLog(l) {
    if (!l) return '<div class="empty">在审计带里选一条记录</div>';
    var notes = (l.res && l.res.notes) || [];
    return '<div class="insp">' +
      '<div class="insp__hd"><b class="mono">' + esc(l.method) + ' ' + esc(l.path) + '</b>' +
      '<span class="tag ' + (l.status >= 400 ? 'tag--alarm' : 'tag--sig') + '">' + esc(l.status) + '</span>' +
      '<span class="tag tag--dim">' + esc(l.latencyMs + 'ms') + '</span>' +
      '<span class="tag tag--brass">' + esc(l.clock) + '</span></div>' +
      '<div class="kvlist">' + row2('端口', l.portId) + row2('网元', l.ne || '—') + row2('判定', l.verdict || '—') +
      row2('人机交互', l.interaction ? (l.interaction.label + ' · ' + l.interaction.status) : '无') + '</div>' +
      (notes.length ? '<div class="insp__notes">' + notes.map(function (x) { return '<span>' + esc(x.key) + '=' + esc(x.value) + ' <i>[' + esc(x.rule) + ']</i></span>'; }).join('') + '</div>' : '') +
      '<pre>' + esc(JSON.stringify(l.res && l.res.body ? l.res.body : {}, null, 1).slice(0, 900)) + '</pre>' +
      (l.interaction && l.interaction.status === 'pending'
        ? '<div class="chips"><button class="abtn" data-act="gate-approve" data-id="' + esc(l.id) + '" data-fx="standard">放行</button>' +
          '<button class="abtn abtn--quiet" data-act="gate-reject" data-id="' + esc(l.id) + '">拒绝</button></div>' : '') +
      '</div>';
  }
  function row2(k, v) { return '<div><i>' + esc(k) + '</i><b>' + esc(v) + '</b></div>'; }

  /* ================================================================ 闸门 */
  function pendingLogs() {
    return S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
  }
  function renderGate() {
    var host = $('#gateList'); if (!host) return;
    var list = pendingLogs();
    if (!list.length) { host.innerHTML = '<div class="empty">闸门是空的 · 没有等待放行的请求</div>'; return; }
    host.innerHTML = list.map(function (l) {
      var ixx = l.interaction || {};
      return '<div class="row" style="cursor:default">' +
        '<div class="row__t"><b class="mono">' + esc(l.method) + ' ' + esc(l.path) + '</b>' +
        '<span class="tag tag--gate">' + esc(ixx.kind || 'human') + '</span>' +
        '<span class="tag tag--dim">' + esc(l.clock) + '</span>' +
        '<span class="row__r" style="margin-left:auto"><span class="tag">负责人 ' + esc(ixx.owner || '—') + '</span>' +
        '<span class="tag tag--dim">超时 ' + esc(ixx.timeoutS || 0) + 's</span></span></div>' +
        '<div class="row__s">' + esc((ixx.label || '等待人工确认') + ' · 端口 ' + l.portId + ' · 网元 ' + (l.ne || '—')) + '</div>' +
        '<div class="row__r"><button class="abtn" data-act="gate-approve" data-id="' + esc(l.id) + '" data-fx="standard">放行 APPROVE</button>' +
        '<button class="abtn abtn--quiet" data-act="gate-reject" data-id="' + esc(l.id) + '">拒绝 REJECT</button></div>' +
        '</div>';
    }).join('');
  }
  function openGate() {
    var box = $('#gateBox'); if (!box) return;
    box.hidden = false; ui.gateOpen = true; renderGate();
    if (!M.reduced) M.iris($('.drawerbox__panel'), { origin: '90% 6%', duration: 320 });
    toast('闸门已打开', pendingLogs().length + ' 个请求等待放行', 'warn');
  }
  function closeGate() {
    var box = $('#gateBox'); if (!box || box.hidden) return;
    ui.gateOpen = false;
    box.classList.add('is-closing');
    setTimeout(function () { box.hidden = true; box.classList.remove('is-closing'); }, 200);
  }

  /* ============================================================ 界面切换 */
  function switchScreen(name, opts) {
    if (SCREENS.indexOf(name) < 0) return;
    var same = S.ui.screen === name;
    A.setScreen(name);
    var inst = $('.inst[data-screen="' + name + '"]');
    if (!inst) return;
    inst.classList.add('is-active');
    inst.hidden = false;
    if (!same && !M.reduced) {
      M.develop(inst, { duration: 360 });
      M.stagger($$(':scope > .inst__bd > .cell', inst), { each: 42, y: 10, duration: 280 });
    }
    // 抽屉游标：弹性移动到当前抽屉
    var spine = $('#drawerSpine'), tab = $('.drawer[data-nav="' + name + '"]');
    if (spine && tab) {
      spine.style.opacity = '1';
      var target = { left: tab.offsetLeft + 14, w: tab.offsetWidth - 28 };
      var from = { left: parseFloat(spine.dataset.l || 0), w: parseFloat(spine.dataset.w || 0) };
      if (M.reduced) { spine.style.left = target.left + 'px'; spine.style.width = target.w + 'px'; }
      else M.spring({
        from: 0, to: 1, stiffness: 240, damping: 26,
        onUpdate: function (t) {
          spine.style.left = (from.left + (target.left - from.left) * t) + 'px';
          spine.style.width = (from.w + (target.w - from.w) * t) + 'px';
        }
      });
      spine.dataset.l = target.left; spine.dataset.w = target.w;
    }
    // 链上游标 + 脉冲
    var idx = STAGE[name] != null ? STAGE[name] : 1;
    pulse(idx);
    localStorage.setItem('v6-screen', name);
  }

  /* ============================================================ 主题 */
  var THEME_KEY = 'v6-theme';
  function applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    var b = $('#themeBtn'), t = $('#themeName');
    if (b) b.setAttribute('aria-pressed', name === 'night' ? 'true' : 'false');
    if (t) t.textContent = name === 'night' ? '夜航' : '晨雾';
  }
  function toggleTheme() {
    var now = document.documentElement.getAttribute('data-theme') === 'night' ? 'dawn' : 'night';
    applyTheme(now);
    try { localStorage.setItem(THEME_KEY, now); } catch (e) {}
    toast(now === 'night' ? '已切到「夜航」' : '已切到「晨雾」', '颜色连续过渡 620ms，不硬切', 'ok', { duration: 2600 });
    beep('toggle');
  }

  /* ============================================================== 提示 */
  function toast(title, desc, tone, opt) {
    var host = $('#toasts'); if (!host) return;
    opt = opt || {};
    X.toast(host, {
      title: title, desc: desc, tone: tone || 'ok', duration: opt.duration || 4200,
      actionLabel: opt.actionLabel, onAction: opt.onAction, onUndo: opt.onUndo
    });
    if (MP.sfx.enabled) MP.sfx.play(tone === 'danger' ? 'warn' : tone === 'warn' ? 'step' : 'confirm');
  }

  /* ============================================================== 总线 */
  function beep(name) { if (MP.sfx.enabled) MP.sfx.play(name); }

  /* ============================================================== 订阅 */
  function renderAll() {
    renderBus(); renderPath(); renderTape(); renderScopeKv();
    var inst = instruments[S.ui.screen];
    if (inst && inst.render) inst.render();
    renderInspector();
    if (ui.gateOpen) renderGate();
  }

  function onEvent(state, evt) {
    var t = evt && evt.type;
    if (t === 'log' && evt.log) {
      ui.loop++;
      var l = evt.log;
      var idx = STAGE[S.ui.screen] != null ? STAGE[S.ui.screen] : 3;
      var pending = l.interaction && l.interaction.status === 'pending';
      if (l.portId) {
        var p = S.ports.filter(function (x) { return x.id === l.portId; })[0];
        if (p) idx = p.caps.length ? 3 : 1;
      }
      if (pending) { pulse(3, 'gate'); beep('latch'); }
      else if (l.status >= 400 || l.verdict === '异常') { pulse(idx, 'err'); beep('warn'); }
      else { pulse(idx); beep('tick'); }
      if (ui.tape.mode === 'live') ui.tape.cursor = 1;
    }
    if (t === 'interaction-resolved') {
      gateDots = gateDots.filter(function (d, i) { if (i === 0) { d.remove(); return false; } return true; });
      beep('latch');
    }
    if (t === 'validation-run' || t === 'upgrade' || t === 'task') beep('step');
    if (t === 'service') beep('toggle');

    // 重画：列表/读数总是更新；表单区不动（避免打断输入）
    var heavy = ['log', 'screen', 'ports', 'cert', 'caps', 'service', 'select-port', 'select-api',
      'api', 'fields', 'interactions', 'ne', 'group', 'validation', 'account', 'task', 'deploy',
      'package', 'vlp', 'interaction-resolved', 'log-filter', 'log-query'];
    if (heavy.indexOf(t) < 0) { renderBus(); return; }
    if (S.ui.screen === 'flow' && (t === 'api' || t === 'fields')) {
      // 引擎正在编辑配方：只让检查器与读数跟上，不重画表单
      keepFocus(function () { renderBus(); renderPath(); renderTape(); renderScopeKv(); renderInspector(); });
      return;
    }
    keepFocus(renderAll);
  }

  /* ============================================================== 接线 */
  function wire() {
    // 抽屉 / 链上节点 / 导航
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        ui.lastInteract = Date.now();
        var nm = nav.dataset.nav;
        $$('.drawer').forEach(function (b) { b.classList.toggle('is-active', b.dataset.nav === nm); });
        $$('.inst').forEach(function (s) { var on = s.dataset.screen === nm; s.hidden = !on; s.classList.toggle('is-active', on); });
        switchScreen(nm);
        if (nav.classList.contains('node')) beep('step');
        return;
      }
      var nodeBtn = e.target.closest('[data-node]');
      if (nodeBtn && !nodeBtn.dataset.nav) {
        // 纯观察节点：闪一下并高亮
        var i = $$('.node').indexOf(nodeBtn);
        flashNode(i);
        beep('tick');
        toast(nodeBtn.querySelector('b').textContent, $('#node' + nodeBtn.dataset.node.charAt(0).toUpperCase() + nodeBtn.dataset.node.slice(1)).textContent, 'ok', { duration: 2600 });
        return;
      }
      if (e.target.closest('#tpLive')) { toLive(); return; }
      if (e.target.closest('#tpJump')) { setCursor(1, true); toLive(); return; }
      if (e.target.closest('#tpStep')) { stepBack(); return; }
      if (e.target.closest('#themeBtn')) { toggleTheme(); return; }
      if (e.target.closest('#gateBtn')) { openGate(); return; }
      if (e.target.closest('#recBtn')) {
        ui.tape.mode = ui.tape.mode === 'live' ? 'review' : 'live';
        if (ui.tape.mode === 'live') ui.tape.cursor = 1;
        renderBus(); renderTape();
        beep('toggle');
        toast(ui.tape.mode === 'live' ? '录制跟随实时' : '已冻结：可以拖动回看', ui.tape.mode === 'live' ? '时间带吸附最新信号' : '松手后用「步进 / 实时」回到现在', 'warn');
        return;
      }
      if (e.target.closest('#sfxBtn')) {
        MP.sfx.toggle(!MP.sfx.enabled);
        var b = $('#sfxBtn'); b.setAttribute('aria-pressed', MP.sfx.enabled ? 'true' : 'false');
        toast('仪表音效 ' + (MP.sfx.enabled ? '开' : '关'), '合成音，不加载任何音频文件', 'ok', { duration: 2600 });
        return;
      }
      if (e.target.closest('[data-close]')) { closeGate(); return; }
      if (e.target.closest('[data-scope]')) {
        var sb = e.target.closest('[data-scope]');
        ui.scope = sb.dataset.scope;
        $$('#scopeTabs .ctab').forEach(function (c) { c.classList.toggle('is-active', c === sb); });
        beep('step');
        return;
      }
      // 闸门内的放行/拒绝（全局委托，检查器与闸门共用）
      var g = e.target.closest('[data-act="gate-approve"],[data-act="gate-reject"]');
      if (g) {
        var approve = g.dataset.act === 'gate-approve';
        var id = g.dataset.id;
        var done = MP.btn.loading(g, approve ? '放行中' : '拒绝中');
        setTimeout(function () {
          A.resolveInteraction(id, approve ? 'approve' : 'reject');
          done();
          toast(approve ? '已放行' : '已拒绝', approve ? '请求继续执行，审计带上留一条绿标' : '按 403 返回，审计带上留一条红标', approve ? 'ok' : 'danger');
          renderGate();
        }, 420);
        return;
      }
    });

    // 时间带：拖动回看（pointer 事件，支持触控）
    var track = $('#tapeTrack');
    if (track) {
      var dragging = false;
      function p(e) {
        var r = track.getBoundingClientRect();
        setCursor((e.clientX - r.left) / Math.max(1, r.width), true);
      }
      track.addEventListener('pointerdown', function (e) {
        dragging = true; track.classList.add('is-scrubbing'); p(e);
        // 捕获指针是加分项不是必需：合成/已释放的指针会抛错，不能让它挡住回放
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        beep('step');
      });
      track.addEventListener('pointermove', function (e) { if (dragging) p(e); });
      track.addEventListener('pointerup', function (e) {
        dragging = false; track.classList.remove('is-scrubbing');
        try { track.releasePointerCapture(e.pointerId); } catch (err) {}
        toast('回放中', '播放头停在 ' + clockOf(new Date(cutoff())) + ' · 点「实时」回到现在', 'warn', { actionLabel: '回到实时', onAction: toLive, duration: 5200 });
      });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { setCursor(ui.tape.cursor - 0.04, true); e.preventDefault(); }
        if (e.key === 'ArrowRight') { setCursor(ui.tape.cursor + 0.04, true); e.preventDefault(); }
        if (e.key === 'Home') { toLive(); e.preventDefault(); }
      });
    }

    // 键盘：1..6 切抽屉，G 闸门，Esc 关闭
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape' && ui.gateOpen) { closeGate(); e.preventDefault(); return; }
      if (typing || e.metaKey || e.ctrlKey) return;
      var i = '123456'.indexOf(e.key);
      if (i > -1) {
        var nm = SCREENS[i];
        $$('.drawer').forEach(function (b) { b.classList.toggle('is-active', b.dataset.nav === nm); });
        $$('.inst').forEach(function (s) { var on = s.dataset.screen === nm; s.hidden = !on; s.classList.toggle('is-active', on); });
        switchScreen(nm);
        e.preventDefault();
        return;
      }
      if (e.key === 'g' || e.key === 'G') { openGate(); e.preventDefault(); }
    });

    window.addEventListener('resize', function () { sizeScope(); renderScopeKv(); });
  }

  /* ================================================================ 启动 */
  var booted = false;
  function boot() {
    if (booted) return; booted = true;
    if (MP.btn) { MP.btn.install(); MP.btn.enhance(document); }
    try { applyTheme(localStorage.getItem(THEME_KEY) || 'dawn'); } catch (e) { applyTheme('dawn'); }
    // 启动流量模拟器（否则审计带/示波器是静止的：种子数据之外不会有新请求）
    if (MP.sim && MP.sim.start) MP.sim.start(Math.round(2600 / (ui.rate || 1)));

    // 速率（技能：分段控件）—— 1× 对应 2600ms 一拍
    if ($('#rateWrap')) {
      X.segmented($('#rateWrap'), {
        items: [{ label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '4×', value: 4 }, { label: '8×', value: 8 }],
        value: ui.rate,
        onChange: function (v) {
          ui.rate = v;
          MP.sim.start(Math.round(2600 / v));
          toast('采样速率 ' + v + '×', '模拟器每 ' + Math.round(2600 / v) + 'ms 产生一次请求', 'ok', { duration: 2400 });
          beep('step');
        }
      });
    }

    scopeCv = $('#scopeCanvas');
    if (scopeCv) { scopeCtx = scopeCv.getContext('2d'); sizeScope(); }

    wire();
    if (instruments[S.ui.screen] && instruments[S.ui.screen].wire) instruments[S.ui.screen].wire();
    Object.keys(instruments).forEach(function (k) { if (instruments[k].wire) instruments[k].wire(); });

    MP.subscribe(onEvent);
    renderAll();
    switchScreen(S.ui.screen || 'mock');

    // 时钟 + 采样循环（一个 rAF 循环同时驱动：示波器、闸门脉冲呼吸、FPS）
    var last = performance.now(), frames = 0, acc = 0, fpsAt = last;
    function tick(now) {
      frames++;
      acc += now - last; last = now;
      if (now - fpsAt >= 500) {
        ui.fps = Math.round(frames * 1000 / (now - fpsAt));
        var f = $('#roFps'); if (f) f.textContent = ui.fps;
        frames = 0; fpsAt = now;
        var c = $('#busClock'); if (c) c.textContent = clockOf();
      }
      drawScope();
      if (gateDots.length) renderGateDots();
      // 常态波动：交互停止 2.5s 后，链上游标轻微呼吸（幅度 <2px，技能：位移要小）
      if (!M.reduced && Date.now() - ui.lastInteract > 2500) {
        var cur = $('#pathCursor');
        if (cur) {
          var idle = clamp((Date.now() - ui.lastInteract - 2500) / 1600, 0, 1);
          cur.style.transform = 'translateY(' + (Math.sin(now / 760) * 1.2 * idle).toFixed(2) + 'px)';
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // instruments.js 会先注册好六台仪器并主动调用 V6.boot()；这里的兜底定时器保证即使它没调也能启动
  setTimeout(boot, 0);

  /* ------------------------------------------------------------ 对外接口 */
  return {
    /* 给 instruments.js 用 */
    MP: MP, S: S, A: A, SEL: SEL, M: M, X: X,
    $: $, $$: $$, el: el, esc: esc, n2: n2, clamp: clamp, clockOf: clockOf, row2: row2,
    toast: toast, beep: beep, keepFocus: keepFocus,
    register: function (name, api) { instruments[name] = api; },
    rerender: renderAll,
    boot: boot,
    /* 审计带：其它仪器用这两个函数取「当前可见记录」，回放时会跟着回退 */
    cutoff: cutoff,
    logsInView: logsInView,
    cutoffClock: function () { var c = cutoff(); return c === Infinity ? 'LIVE' : clockOf(new Date(c)); },
    inspectorForPort: inspectorForPort,
    inspectorForLog: inspectorForLog,
    openGate: openGate,
    switchScreen: switchScreen,
    ui: ui
  };
})();

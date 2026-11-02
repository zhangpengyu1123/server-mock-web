/* ============================================================================
 * V3 · 莱茵生命 临床档案 / 终端 —— 视图层
 *
 * 数据、动作、规则引擎、模拟器全部来自 _shared（MP.*），本文件只做「渲染 + 接线」。
 * 视觉语言：方舟直角 / 双主题（档案 · 终端）/ 左侧色条 + 1px 细框 / 45° 斜纹 /
 *           半调网点 / 角标三角 / 黑白反转 / 拉丁装饰字 / 菱形母题。
 * 徽标、菱形、六边形、准星、刻度均为自绘几何，未使用任何游戏素材。
 * ==========================================================================*/
(function () {
  'use strict';
  var MP = window.MP;
  var S = MP.state, A = MP.actions, SEL = MP.select, M = MP.motion, X = MP.micro;

  /* ------------------------------------------------------------ DOM 小工具 */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function statusCls(code) { var c = Math.floor(+code / 100); return c === 2 ? 's2xx' : c === 3 ? 's3xx' : c === 4 ? 's4xx' : 's5xx'; }
  function ruleMeta(kind) { return MP.RULE_META[kind] || MP.RULE_META.fixed; }
  function ruleTag(kind) {
    var m = ruleMeta(kind);
    var tone = m.tone === 'neutral' ? 'ghost' : m.tone === 'accent' ? 'accent' : m.tone === 'info' ? 'violet' : m.tone;
    return '<span class="tag tag--' + tone + '">' + m.name + '</span>';
  }
  function neName(id) { var n = MP.byId(S.nes, id); return n ? n.name : '平台级'; }
  function opts(arr, cur) { return arr.map(function (o) { return '<option' + (String(o) === String(cur) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }
  function kpi(k, v, u, tone) {
    return '<div class="kpi' + (tone ? ' kpi--' + tone : '') + '"><div class="kpi__k">' + k + '</div>' +
      '<div class="kpi__v">' + v + (u ? '<span class="kpi__u">' + u + '</span>' : '') + '</div></div>';
  }
  var TOAST_HOST = null;
  function toast(title, desc, o) {
    o = o || {};
    X.toast(TOAST_HOST || $('#toasts'), {
      title: title, desc: desc, tone: o.tone, duration: o.duration || 4200,
      actionLabel: o.actionLabel, onAction: o.onAction, onUndo: o.onUndo
    });
  }

  /* 磁吸：主行动按钮（局部重画后需要重新接线，故单独走一个函数） */
  function wireMagnets(root) {
    $$('[data-magnetic]', root || document).forEach(function (n) {
      if (n.dataset.magnetized) return;
      n.dataset.magnetized = '1';
      X.magnetic(n, { strength: 0.2 });
    });
  }

  /* --------------------------------------------- 焦点 / 滚动位置保护（硬要求） */
  function scrollHosts() {
    var list = $$('.panel__bd--scroll, .stage, #logWrap');
    list.push(document.scrollingElement || document.documentElement);
    return list;
  }
  function keepFocus(fn) {
    var a = document.activeElement;
    var key = a && a.id ? { t: 'id', v: a.id } : null;
    if (!key && a && a.dataset && a.dataset.fid) key = { t: 'fid', v: a.dataset.fid, p: a.dataset.prop || a.dataset.rk };
    if (!key && a && a.dataset && a.dataset.fkey) key = { t: 'fk', v: a.dataset.fkey };
    if (!key && a && a.dataset && a.dataset.nf) key = { t: 'nf', v: a.dataset.nf };
    var ss = null, se = null;
    try { ss = a && a.selectionStart; se = a && a.selectionEnd; } catch (e) { ss = null; }
    var hosts = scrollHosts();
    var tops = hosts.map(function (h) { return h.scrollTop; });
    fn();
    hosts.forEach(function (h, i) { if (h && h.scrollTop !== tops[i]) h.scrollTop = tops[i]; });
    if (!key) return;
    var n = null;
    if (key.t === 'id') n = document.getElementById(key.v);
    else if (key.t === 'fid') n = document.querySelector('[data-fid="' + key.v + '"][data-prop="' + key.p + '"]') || document.querySelector('[data-fid="' + key.v + '"][data-rk="' + key.p + '"]');
    else if (key.t === 'fk') n = document.querySelector('[data-fkey="' + key.v + '"]');
    else if (key.t === 'nf') n = document.querySelector('[data-nf="' + key.v + '"]');
    if (n && n.focus) {
      n.focus();
      try { if (ss != null && n.setSelectionRange) n.setSelectionRange(ss, se); } catch (e) { /* number/select 不支持 */ }
    }
  }

  /* ------------------------------------------------------------ 主题（双主题） */
  var THEME_KEY = 'mp-v3-theme';
  var THEMES = {
    archive: { name: '档案', en: 'ARCHIVE' },
    terminal: { name: '终端', en: 'TERMINAL' }
  };
  var themeLock = false;
  function applyTheme(t) {
    if (!THEMES[t]) t = 'archive';
    document.documentElement.setAttribute('data-theme', t);
    S.ui.theme = t;
    var n = $('#themeName'), e = $('#themeEn'), st = $('#stTheme'), b = $('#themeBtn');
    if (n) n.textContent = THEMES[t].name;
    if (e) e.textContent = THEMES[t].en;
    if (st) st.textContent = THEMES[t].en;
    if (b) b.setAttribute('aria-pressed', t === 'terminal' ? 'true' : 'false');
    try { localStorage.setItem(THEME_KEY, t); } catch (err) { /* 隐私模式忽略 */ }
  }
  function switchTheme(next) {
    if (themeLock || S.ui.theme === next) return;
    var btn = $('#themeBtn');
    var r = btn.getBoundingClientRect();
    themeLock = true;
    MP.sfx.play('iris');
    /* 光圈式扩散：从切换控件圆心开始，整页做一次 iris 展开（与导航 iris 同一语言） */
    var veil = el('div', 'theme-veil');
    veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(veil);
    /* 固定成「旧主题画布色」再切主题，避免光圈扩散中途换色 */
    var oldCanvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#f5f5f5';
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var rad = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
    veil.style.cssText = 'position:fixed;inset:0;z-index:300;pointer-events:none;background:' + oldCanvas + ';' +
      'clip-path:circle(0px at ' + cx + 'px ' + cy + 'px);transition:clip-path 360ms cubic-bezier(.2,.8,.2,1)';
    void veil.offsetWidth;
    veil.style.clipPath = 'circle(' + rad + 'px at ' + cx + 'px ' + cy + 'px)';
    applyTheme(next);
    if (S.ui.screen === 'mock' || S.ui.screen === 'flow') { renderTelemetry(); }
    setTimeout(function () {
      veil.style.transition = 'clip-path 220ms cubic-bezier(.4,0,1,1), opacity 200ms linear';
      veil.style.opacity = '0';
      setTimeout(function () { veil.remove(); themeLock = false; }, 240);
    }, 300);
    toast(next === 'terminal' ? '已切换到「终端」' : '已切换到「档案」', next === 'terminal' ? '暗色终端：官网青 #18D1FF 作为强调' : '亮色档案：游戏内蓝 #0098DC 作为强调', { duration: 2600 });
  }

  /* ---------------------------------------------------------------- 顶栏 / 状态 */
  function renderChrome() {
    $('#hostName').textContent = S.host.hostname;
    $('#hostId').textContent = 'RL-' + S.host.ip.split('.').map(function (n) { return String(+n).padStart(2, '0'); }).join('');
    $('#hostIp').textContent = S.host.ip + ' / ' + S.host.alt;
    $('#hostAgent').textContent = S.host.agent;
    var up = Math.floor(S.host.uptimeS / 3600);
    $('#stSpec').textContent = 'UP ' + Math.floor(up / 24) + 'd' + (up % 24) + 'h · ' + S.host.os.split(' ')[0] + ' ' + S.host.os.split(' ')[1];
  }

  function renderTelemetry() {
    var k = SEL.kpis();
    var ids = { tkReq: k.req, tkOk: k.ok, tkErr: k.err, tkLat: k.avgLat, tkRun: k.running, tkHuman: k.pendingHuman };
    Object.keys(ids).forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.textContent !== String(ids[id])) M.countUp(n, ids[id], { duration: 420 });
    });
    var badges = { ports: k.ports, human: k.pendingHuman, ne: k.ne, tasks: k.tasks, packages: k.packages };
    Object.keys(badges).forEach(function (key) {
      var n = document.querySelector('[data-badge="' + key + '"]');
      if (n) n.textContent = badges[key];
      var item = n && n.closest('.nav__item');
      if (item) item.classList.toggle('is-attention', key === 'human' && badges[key] > 0);
    });
    var last = S.logs[0];
    $('#stLast').textContent = last ? (last.clock + ' ' + last.method + ' ' + last.path + ' → ' + last.status) : '—';
  }

  function renderKpisFor(name) {
    var k = SEL.kpis(), html = '';
    if (name === 'mock') {
      html = kpi('端口', k.ports, '个') + kpi('运行中', k.running, '个', 'ok') + kpi('总请求', k.req, '', 'accent') + kpi('平均时延', k.avgLat, 'ms');
    } else if (name === 'flow') {
      html = kpi('请求', k.req, '') + kpi('成功', k.ok, '', 'ok') + kpi('异常', k.err, '', 'danger') + kpi('待人工', k.pendingHuman, '', k.pendingHuman ? 'warn' : '');
    } else if (name === 'ne') {
      html = kpi('标本', k.ne, '个') + kpi('网元组', k.groups, '个') + kpi('升级中', S.nes.filter(function (n) { return n.status === '升级中'; }).length, '个', 'accent') +
        kpi('校验规则', S.nes.reduce(function (a, n) { return a + n.validations.length; }, 0), '条');
    } else if (name === 'omp') {
      html = kpi('受管网元', k.ne, '个') + kpi('账号', k.accounts, '个', 'accent') + kpi('进行中任务', k.tasks, '个', 'warn') + kpi('共部署', S.deploy.omp.coDeploy ? 'ON' : 'OFF', '', S.deploy.omp.coDeploy ? 'ok' : '');
    } else if (name === 'lcm') {
      html = kpi('软件包', k.packages, '个', 'accent') + kpi('已校验', S.packages.filter(function (p) { return p.validated; }).length, '个', 'ok') +
        kpi('受管网元', k.ne, '个') + kpi('共部署', S.deploy.lcmp.coDeploy ? 'ON' : 'OFF', '', S.deploy.lcmp.coDeploy ? 'ok' : '');
    } else if (name === 'vlp') {
      html = kpi('平台版本', S.vlp.version.replace('VLMP ', ''), '') + kpi('CPU', S.vlp.cpu, '核', 'accent') +
        kpi('校验通过', S.vlp.checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + S.vlp.checks.length, '') +
        kpi('流程', S.vlp.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length + '/' + S.vlp.upgradeFlow.length, '');
    }
    var host = document.querySelector('.screen[data-screen="' + name + '"] .sc-head__kpis');
    if (host) host.innerHTML = html;
  }

  /* ============================================================== 01 · Mock 管理 */
  function renderMock() {
    var host = $('#portList');
    host.innerHTML = S.ports.map(function (p, i) {
      var caps = SEL.capsOfPort(p.id);
      var certTag = p.cert.status === 'issued' ? '<span class="tag tag--ok">证书已签发</span>' : '<span class="tag tag--danger">未签发</span>';
      return '<button class="port mx-spot' + (p.id === S.ui.selectedPort ? ' is-active' : '') + (p.running ? ' is-running' : '') + '" data-port="' + p.id + '" type="button" aria-pressed="' + (p.id === S.ui.selectedPort) + '">' +
        '<span class="ak-watermark" aria-hidden="true">RL-' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="port__hd"><i class="dia' + (p.running ? '' : ' dia--muted') + '" aria-hidden="true"></i>' +
        '<b class="port__ep">' + esc(p.ip) + ':' + p.port + '</b>' +
        '<span class="tag tag--ghost">' + esc(p.protocol) + '</span>' + certTag +
        '<span class="port__stats">' + (p.running ? 'RUNNING' : 'STOPPED') + '<br />' + p.stats.req + ' req · ' + p.stats.rps + ' rps</span></span>' +
        '<span class="port__meta">' + esc(p.tls) + ' · ' + caps.length + ' 项能力' + (caps.length ? '（' + caps.map(function (c) { return c.code; }).join('/') + '）' : '') +
        ' · 建于 ' + esc(p.createdAt) + '</span>' +
        '<span class="port__meta">' + esc(p.note || '') + '</span>' +
        '</button>';
    }).join('') || '<div class="empty">登记簿为空 —— 先在下方登记本机 IP 与端口</div>';
    $$('.mx-spot', host).forEach(function (n) { X.spotlight(n); });

    var p = SEL.port();
    $('#pdProto').textContent = p ? p.protocol : '—';
    $('#pdPort').textContent = p ? (p.ip + ':' + p.port) : '—';
    var body = $('#portDetailBody');
    if (!p) { body.innerHTML = '<div class="empty">请选择一个端点查看档案</div>'; return; }

    /* 01 证书文件 */
    var certHtml;
    if (p.cert.status === 'issued') {
      certHtml =
        '<div class="vstack">' +
        '<div class="hstack"><span class="mx-mark is-done" id="certMark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/><path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg><span class="mx-mark__label">证书有效</span></span>' +
        '<b class="mono">' + esc(p.cert.cn) + '</b><span class="tag tag--ok">已签发</span><span class="tag tag--ghost">' + esc(p.cert.issuer) + '</span></div>' +
        '<div class="form__grid form__grid--4">' +
        '<div class="field"><span class="field__lbl">有效期</span><b class="ak-num">' + p.cert.days + ' 天</b></div>' +
        '<div class="field"><span class="field__lbl">签发时间</span><b class="ak-num">' + esc(p.cert.issuedAt) + '</b></div>' +
        '<div class="field"><span class="field__lbl">签发机构</span><b>' + esc(p.cert.issuer) + '</b></div>' +
        '<div class="field"><span class="field__lbl">指纹 FINGERPRINT</span><b class="mono">' + esc(p.cert.fingerprint) + '</b></div>' +
        '</div>' +
        '<div class="ak-rule"></div>' +
        '<div class="hstack"><button class="btn btn--sm" data-act="cert-download" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 11.5L12 16l4.5-4.5M5 19h14"/></svg><span>导出证书文件</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-act="cert-reissue" type="button"><span>重新签发</span></button>' +
        '<span class="muted small">导出为 PEM（.crt），用于对端校验本 mock 端点的 TLS 身份</span></div>' +
        '</div>';
    } else {
      certHtml =
        '<div class="vstack">' +
        '<div class="hstack"><span class="mx-mark is-error" id="certMark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/><path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg><span class="mx-mark__label">尚无证书</span></span>' +
        '<span class="tag tag--danger">TLS 未就绪</span><span class="muted small">未签发证书前不能启动服务</span></div>' +
        '<div class="form__grid form__grid--3">' +
        '<label class="field" for="certCn"><span class="field__lbl">证书 CN <i class="ak-overline">COMMON NAME</i></span>' +
        '<input class="input" id="certCn" value="' + esc('mock-' + p.port + '.' + p.ip) + '" data-fkey="certCn" aria-describedby="certCnErr" />' +
        '<em class="field__err" id="certCnErr" role="alert" hidden></em></label>' +
        '<label class="field" for="certDays"><span class="field__lbl">有效期（天）</span><select class="input" id="certDays">' + opts([90, 365, 730, 1095], 365) + '</select></label>' +
        '<label class="field" for="certIssuer"><span class="field__lbl">签发机构</span><select class="input" id="certIssuer">' + opts(['MockCA-Root', 'MockCA-Intermediate', 'RhineLab-LabCA'], 'MockCA-Root') + '</select></label>' +
        '</div>' +
        '<div class="hstack" id="certGenHost"><button class="btn btn--primary" data-act="cert-gen" type="button" id="certGenBtn"><span>为 ' + esc(p.ip) + ':' + p.port + ' 签发证书</span></button>' +
        '<span class="muted small">签发后可挂载平台能力并启动服务</span></div>' +
        '</div>';
    }

    /* 02 平台能力（6 选 N，可卸载） */
    var capChips = S.caps.map(function (c) {
      var on = p.caps.indexOf(c.id) >= 0;
      return '<button class="chk' + (on ? ' is-on ak-corner' : '') + '" data-cap="' + c.id + '" type="button" aria-pressed="' + on + '">' +
        '<i class="dia' + (on ? '' : ' dia--muted') + '" aria-hidden="true"></i>' + esc(c.name) +
        ' <em class="muted">' + c.code + ' · ' + c.version + ' · ' + c.endpoints + ' 接口</em></button>';
    }).join('');

    body.innerHTML =
      '<div class="ak-stripes form__grid form__grid--4" style="padding:12px">' +
      '<div class="field"><span class="field__lbl">协议</span><b>' + esc(p.protocol) + '</b></div>' +
      '<div class="field"><span class="field__lbl">TLS</span><b>' + esc(p.tls) + '</b></div>' +
      '<div class="field"><span class="field__lbl">请求 / 成功 / 异常</span><b class="ak-num">' + p.stats.req + ' / ' + p.stats.ok + ' / ' + p.stats.err + '</b></div>' +
      '<div class="field"><span class="field__lbl">当前 RPS</span><b class="ak-num">' + p.stats.rps + '</b></div>' +
      '</div>' +
      '<div class="sec-title ak-halftone"><span class="sec-title__no">01</span>检定证书文件</div>' + certHtml +
      '<div class="ak-rule"></div>' +
      '<div class="sec-title ak-halftone"><span class="sec-title__no">02</span>挂载平台能力（6 选 N，可卸载）</div>' +
      '<div class="checks">' + capChips + '</div>' +
      '<div class="ak-scale" aria-hidden="true"></div>' +
      '<div class="sec-title ak-halftone"><span class="sec-title__no">03</span>MOCK 服务</div>' +
      '<div class="hstack" id="svcBox"></div>';

    /* 03 服务控制 */
    var box = $('#svcBox');
    var mark = el('span', 'mx-mark is-' + (p.running ? 'done' : 'idle'));
    mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/>' +
      '<path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/>' +
      '<path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg>' +
      '<span class="mx-mark__label">' + (p.running ? '服务运行中' : '服务已停止') + '</span>';
    box.appendChild(mark);

    if (p.running) {
      var stop = el('button', 'btn btn--danger ak-stripes', '<span class="mx-fuse__text">停止服务</span>');
      stop.type = 'button';
      box.appendChild(stop);
      X.fuseButton(stop, {
        label: '停止服务', doneLabel: '已停止', undoWindow: 4200,
        onCommit: function () {
          A.stopService(p.id);
          toast('已停止 mock 服务', ':' + p.port + ' 不再接收请求 · 4 秒内可撤销', {
            tone: 'warn', actionLabel: '撤销',
            onAction: function () { A.startService(p.id); toast('已恢复服务', ':' + p.port + ' 重新开始接收请求', { tone: 'ok', duration: 2400 }); }
          });
        },
        onUndo: function () { A.startService(p.id); toast('已撤销停止', ':' + p.port + ' 继续运行', { tone: 'ok', duration: 2400 }); }
      });
    } else {
      var startBtn = el('button', 'btn btn--primary mx-hold');
      startBtn.type = 'button';
      startBtn.disabled = p.cert.status !== 'issued' || !p.caps.length;
      startBtn.innerHTML = '<span class="mx-hold__label">按住启动 MOCK 服务</span>';
      box.appendChild(startBtn);
      X.holdConfirm(startBtn, {
        duration: 1000, label: '按住启动 MOCK 服务', doneLabel: '服务已启动',
        onConfirm: function () {
          A.startService(p.id);
          toast('MOCK 服务已启动', p.ip + ':' + p.port + ' · ' + SEL.capsOfPort(p.id).map(function (c) { return c.name; }).join(' / '), { tone: 'ok' });
        }
      });
      if (startBtn.disabled) box.appendChild(el('span', 'muted small', p.cert.status !== 'issued' ? '需先签发证书' : '需至少挂载一项平台能力'));
    }

    var del = el('button', 'btn btn--sm btn--ghost mx-fuse', '<span class="mx-fuse__text">删除端点</span>');
    del.type = 'button';
    box.appendChild(del);
    X.fuseButton(del, {
      label: '删除端点', doneLabel: '已删除', undoWindow: 3200,
      onCommit: function () {
        var backup = JSON.parse(JSON.stringify(p));
        A.removePort(p.id);
        toast('已删除端点', backup.ip + ':' + backup.port, {
          tone: 'danger', actionLabel: '撤销',
          onAction: function () {
            S.ports.push(backup); S.ui.selectedPort = backup.id;
            MP.emit({ type: 'ports', action: 'restore' });
            toast('已恢复端点', backup.ip + ':' + backup.port, { tone: 'ok', duration: 2400 });
          }
        });
      }
    });
  }

  function bindMock() {
    $('#portList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-port]'); if (!b) return;
      A.selectPort(b.dataset.port); MP.sfx.play('step');
    });

    $('#portDetailBody').addEventListener('click', function (e) {
      var p = SEL.port(); if (!p) return;
      var cap = e.target.closest('[data-cap]');
      if (cap) {
        var id = cap.dataset.cap;
        if (p.caps.indexOf(id) >= 0) { A.detachCap(p.id, id); MP.sfx.play('undo'); toast('已卸载能力', MP.capName(id) + ' 不再由该端点提供', { duration: 2600 }); }
        else { A.attachCap(p.id, id); MP.sfx.play('confirm'); toast('已挂载能力', MP.capName(id) + ' · ' + SEL.apisOfCap(id).length + ' 个接口可被定制', { tone: 'ok' }); }
        return;
      }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var kind = act.dataset.act;
      if (kind === 'cert-gen') {
        var cn = ($('#certCn') || {}).value || '', days = +($('#certDays') || {}).value || 365, issuer = ($('#certIssuer') || {}).value || 'MockCA-Root';
        var err = $('#certCnErr'), field = $('#certCn') ? $('#certCn').closest('.field') : null;
        var ok = /^[A-Za-z0-9.\-*_]{3,64}$/.test(cn.trim());
        if (err) { err.hidden = ok; err.textContent = ok ? '' : 'CN 只能包含字母 / 数字 / . - _ ，长度 3–64'; }
        if (field) field.classList.toggle('is-invalid', !ok);
        if (!ok) { MP.sfx.play('warn'); return; }
        var genBtn = $('#certGenBtn');
        var done = genBtn ? MP.btn.loading(genBtn, '正在签发') : function () {};   // 技能规则：>300ms 异步给 loading
        setTimeout(function () {
          A.generateCert(p.id, { cn: cn.trim(), days: days, issuer: issuer });
          done();
          toast('证书已签发', cn.trim() + ' · ' + days + ' 天 · ' + issuer, { tone: 'ok' });
        }, 700);
        return;
      }
      if (kind === 'cert-download') {
        var pem = '-----BEGIN CERTIFICATE-----\n' +
          btoa(unescape(encodeURIComponent(p.cert.cn + '|' + p.cert.fingerprint + '|' + p.cert.days + '|' + p.cert.issuer))).replace(/(.{64})/g, '$1\n') +
          '\n-----END CERTIFICATE-----\n';
        var blob = new Blob([pem], { type: 'application/x-pem-file' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = p.cert.cn + '.crt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('证书文件已导出', a.download + '（PEM 编码）', { tone: 'ok' });
        return;
      }
      if (kind === 'cert-reissue') {
        A.generateCert(p.id, { cn: p.cert.cn, days: p.cert.days, issuer: p.cert.issuer });
        toast('已重新签发证书', p.cert.cn + ' · 指纹已更新', { tone: 'ok' });
      }
    });

    /* 本机 IP：网卡下拉 + 手动输入 */
    var ipSel = $('#pfIp');
    ipSel.innerHTML = [S.host.ip, S.host.alt, '__custom__'].map(function (v) {
      return '<option value="' + v + '">' + (v === '__custom__' ? '手动输入…' : v + '（本机网卡）') + '</option>';
    }).join('') + '<option value="127.0.0.1">127.0.0.1（回环）</option>';
    var custom = el('input', 'input');
    custom.id = 'pfIpCustom'; custom.placeholder = '10.x.x.x'; custom.hidden = true;
    custom.setAttribute('aria-label', '手动输入本机 IP');
    custom.dataset.fkey = 'pfIpCustom';
    ipSel.parentElement.appendChild(custom);
    ipSel.addEventListener('change', function () {
      custom.hidden = ipSel.value !== '__custom__';
      if (!custom.hidden) custom.focus();
    });

    $('#portForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var ip = ipSel.value === '__custom__' ? custom.value.trim() : ipSel.value;
      var port = parseInt($('#pfPort').value, 10);
      var ok = true, msg = '';
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some(function (n) { return +n > 255; })) { ok = false; msg = '请输入合法的 IPv4 地址'; }
      else if (!(port >= 1024 && port <= 65535)) { ok = false; msg = '端口需在 1024–65535 之间（1024 以下为系统保留）'; }
      else if (S.ports.some(function (p) { return p.ip === ip && p.port === port; })) { ok = false; msg = '该 IP:端口 已在登记簿中'; }
      var errEl = $('#pfPortErr');
      errEl.hidden = ok; errEl.textContent = msg;
      var fEl = ($('#pfPort') || {}).closest ? $('#pfPort').closest('.field') : null;
      if (fEl) fEl.classList.toggle('is-invalid', !ok);
      if (!ok) { MP.sfx.play('warn'); errEl.focus && errEl.focus(); return; }
      var p = A.registerPort({ ip: ip, port: port, protocol: $('#pfProto').value, tls: $('#pfTls').value, note: $('#pfNote').value.trim() || '手动登记' });
      $('#pfNote').value = '';
      MP.sfx.play('confirm');
      toast('已登记 mock 端点', p.ip + ':' + p.port + ' —— 下一步：签发证书 → 挂载能力 → 启动服务', { tone: 'ok', duration: 5200 });
    });
  }

  /* ============================================================== 02 · Mock 流程 */
  var capFilter = 'all';
  function renderApiList() {
    var html = '';
    S.caps.forEach(function (c) {
      if (capFilter !== 'all' && capFilter !== c.id) return;
      var apis = SEL.apisOfCap(c.id);
      if (!apis.length) return;
      html += '<div class="vstack"><div class="hstack"><i class="dia" aria-hidden="true"></i><b class="small">' + esc(c.name) + '</b>' +
        '<span class="tag tag--ghost">' + c.code + ' · ' + c.version + '</span>' +
        '<span class="muted small right">' + apis.length + ' 个接口</span></div>';
      apis.forEach(function (a) {
        html += '<button class="row' + (a.id === S.ui.selectedApi ? ' is-active' : '') + '" data-api="' + a.id + '" type="button" aria-pressed="' + (a.id === S.ui.selectedApi) + '">' +
          '<span class="row__main"><span class="row__t"><span class="tag tag--ghost">' + a.method + '</span> ' + esc(a.path) + '</span>' +
          '<span class="row__s">' + esc(a.name) + ' · ' + a.delayMs + 'ms · ' + a.fields.length + ' 字段 · 命中 ' + a.hits + ' 次' +
          (a.interactions.length ? ' · <span class="tag tag--warn">人机交互</span>' : '') + '</span></span>' +
          (a.id === S.ui.selectedApi ? '<span class="row__right"><i class="dia" aria-hidden="true"></i></span>' : '') +
          '</button>';
      });
      html += '</div>';
    });
    $('#apiList').innerHTML = html || '<div class="empty">该能力下暂无接口</div>';
  }

  function applyRuleParam(apiId, fieldId, rk, raw) {
    var a = MP.byId(S.apis, apiId); if (!a) return;
    var f = a.fields.filter(function (x) { return x.id === fieldId; })[0]; if (!f) return;
    if (rk === 'options') {
      A.updateField(apiId, fieldId, { options: String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean), rule: { options: String(raw) } });
      return;
    }
    if (rk.indexOf('when.') === 0) {
      var when = Object.assign({}, (f.rule || {}).when || {});
      when[rk.split('.')[1]] = raw;
      A.updateField(apiId, fieldId, { rule: { when: when } });
      return;
    }
    var patch = {};
    patch[rk] = /^-?\d+$/.test(String(raw)) ? parseInt(raw, 10) : raw;
    A.updateField(apiId, fieldId, { rule: patch });
  }

  function renderStudio() {
    var a = SEL.api();
    var box = $('#respStudio');
    if (!a) { box.innerHTML = '<div class="empty">先选择一个接口</div>'; $('#apiTools').innerHTML = ''; return; }    $('#apiTools').innerHTML = '<span class="tag tag--ghost">' + a.method + ' ' + esc(a.path) + '</span>' +
      '<span class="muted small">命中 ' + a.hits + ' 次</span>' +
      (a.lastAt ? '<span class="muted small">最近 ' + esc(a.lastAt) + '</span>' : '');

    var STATUS = { 200: 'OK', 201: 'Created', 202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many', 500: 'Server Error', 503: 'Unavailable' };
    var statusOpts = Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (+s === a.status ? ' selected' : '') + '>' + s + ' ' + STATUS[s] + '</option>';
    }).join('');

    var fieldRows = a.fields.map(function (f) {
      var r = f.rule || { kind: 'fixed' };
      var tone = (ruleMeta(r.kind).tone === 'neutral' ? '' : ruleMeta(r.kind).tone === 'info' ? 'violet' : ruleMeta(r.kind).tone);
      var typeOpts = opts(S.fieldTypes, f.type);
      var ruleOpts = Object.keys(MP.RULE_META).map(function (k) {
        return '<option value="' + k + '"' + (k === r.kind ? ' selected' : '') + '>' + MP.RULE_META[k].name + '</option>';
      }).join('');
      var param = '';
      if (r.kind === 'increment') {
        param = '<label class="field"><span class="field__lbl">起点</span><input class="input" data-f="' + f.id + '" data-rk="start" value="' + (r.start == null ? 1 : r.start) + '" data-fkey="rk-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">步长</span><input class="input" data-f="' + f.id + '" data-rk="step" value="' + (r.step == null ? 1 : r.step) + '" data-fkey="rs-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">格式 {n:04}</span><input class="input" data-f="' + f.id + '" data-rk="pattern" value="' + esc(r.pattern || '') + '" placeholder="RL-{n:04}" data-fkey="rp-' + f.id + '" /></label>';
      } else if (r.kind === 'once') {
        param = '<label class="field"><span class="field__lbl">生效次数</span><input class="input" data-f="' + f.id + '" data-rk="times" value="' + (r.times == null ? 1 : r.times) + '" data-fkey="rt-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">之后的兜底值</span><input class="input" data-f="' + f.id + '" data-rk="fallback" value="' + esc(r.fallback || '') + '" data-fkey="rf-' + f.id + '" /></label>';
      } else if (r.kind === 'conditional') {
        var keys = a.fields.filter(function (x) { return x.key !== f.key; }).map(function (x) { return x.key; });
        param = '<label class="field"><span class="field__lbl">条件字段</span><select class="input" data-f="' + f.id + '" data-rk="when.key">' +
          keys.map(function (k) { return '<option' + (r.when && r.when.key === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span class="field__lbl">操作符</span><select class="input" data-f="' + f.id + '" data-rk="when.op">' +
          opts(['等于', '包含', '非空', '末尾为偶数'], r.when && r.when.op) + '</select></label>' +
          '<label class="field"><span class="field__lbl">命中时</span><input class="input" data-f="' + f.id + '" data-rk="then" value="' + esc(r.then || '') + '" data-fkey="rc-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">否则</span><input class="input" data-f="' + f.id + '" data-rk="else" value="' + esc(r.else || '') + '" data-fkey="re-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">比较值</span><input class="input" data-f="' + f.id + '" data-rk="when.value" value="' + esc((r.when && r.when.value) || '') + '" data-fkey="rw-' + f.id + '" /></label>';
      } else if (r.kind === 'random') {
        param = '<label class="field field--wide"><span class="field__lbl">候选取值（逗号分隔）</span><input class="input" data-f="' + f.id + '" data-rk="options" value="' + esc((f.options || []).join(',')) + '" data-fkey="ro-' + f.id + '" /></label>';
      }
      var valueCell = f.source === 'select'
        ? '<select class="input" data-fid="' + f.id + '" data-prop="value" aria-label="字段取值">' + (f.options || []).map(function (o) { return '<option' + (String(o) === String(f.value) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
        : '<input class="input" data-fid="' + f.id + '" data-prop="value" value="' + esc(f.value) + '" data-fkey="fv-' + f.id + '" aria-label="字段取值" />';
      return '<div class="fld' + (tone ? ' fld--' + tone : '') + '">' +
        '<div class="fld__top">' +
        '<input class="input" data-fid="' + f.id + '" data-prop="key" value="' + esc(f.key) + '" aria-label="字段路径" data-fkey="fk-' + f.id + '" />' +
        '<select class="input" data-fid="' + f.id + '" data-prop="type" aria-label="字段类型" style="flex:0 1 110px">' + typeOpts + '</select>' +
        '<select class="input" data-fid="' + f.id + '" data-prop="source" aria-label="取值方式" style="flex:0 1 130px">' +
        '<option value="manual"' + (f.source === 'manual' ? ' selected' : '') + '>手工填写</option>' +
        '<option value="select"' + (f.source === 'select' ? ' selected' : '') + '>下拉选择</option></select>' +
        valueCell +
        '<select class="input" data-fid="' + f.id + '" data-prop="rulekind" aria-label="生效规则" style="flex:0 1 120px">' + ruleOpts + '</select>' +
        '<button class="iconbtn" data-del-field="' + f.id + '" type="button" aria-label="删除字段 ' + esc(f.key) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button>' +
        '</div>' +
        (param ? '<div class="form__grid form__grid--3" style="margin-top:8px">' + param + '</div>' : '') +
        '<div class="fld__desc">' + esc(f.desc || '') + ' · ' + ruleMeta(r.kind).hint + (f.required ? ' · 必填' : '') + '</div>' +
        '</div>';
    }).join('') || '<div class="empty">该接口还没有响应字段 —— 点「新增字段」开始定制</div>';

    var IX_META = { 'human-confirm': ['人工确认', 'tag--warn'], captcha: ['验证码', 'tag--violet'], 'manual-gate': ['人工闸门', 'tag--danger'] };
    var ixRows = a.interactions.map(function (ix) {
      var meta = IX_META[ix.kind] || ['人工确认', 'tag--ghost'];
      return '<div class="row ak-corner ak-corner--warn"><span class="row__main"><span class="row__t"><span class="tag ' + meta[1] + '">' + meta[0] + '</span>' + esc(ix.label) + '</span>' +
        '<span class="row__s">负责人 ' + esc(ix.owner) + ' · 超时 ' + ix.timeoutS + 's · 命中该接口时先挂起，等待人工放行或拒绝</span></span>' +
        '<span class="row__right"><button class="iconbtn" data-del-ix="' + ix.id + '" type="button" aria-label="移除人机交互 ' + esc(ix.label) + '">×</button></span></div>';
    }).join('') || '<div class="muted small">未插入人机交互 —— 命中该接口会直接返回定制响应</div>';

    box.innerHTML =
      '<div class="form__grid form__grid--2">' +
      '<label class="field" for="apiStatus"><span class="field__lbl">HTTP Status Code <i class="ak-overline">EXPECTED</i></span><select class="input" id="apiStatus">' + statusOpts + '</select></label>' +
      '<div class="field"><span class="field__lbl">响应延迟 <i class="ak-overline">DELAY</i>（拖拽或方向键）</span><div class="hstack"><div id="delayScrub"></div></div></div>' +
      '</div>' +
      '<div class="ak-rule"></div>' +
      '<div class="sec-title ak-halftone"><span class="sec-title__no">01</span>响应字段（面向对象定制）' +
      '<button class="btn btn--sm right" id="addFieldBtn" type="button"><span>+ 新增字段</span></button></div>' +
      '<div class="vstack" id="fieldList">' + fieldRows + '</div>' +
      '<div class="ak-rule"></div>' +
      '<div class="sec-title ak-halftone"><span class="sec-title__no">02</span>人机交互' +
      '<span class="muted small right">在自动响应中间插入需要人操作的环节</span></div>' +
      '<div class="vstack" id="ixBox">' + ixRows + '</div>' +
      '<div class="hstack"><span id="ixAdd"></span>' +
      '<button class="btn btn--primary right" id="triggerBtn" type="button" data-magnetic><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span>手动触发一次请求</span></button></div>';

    X.scrub($('#delayScrub'), {
      label: 'DELAY', value: a.delayMs, min: 0, max: 3000, step: 10, suffix: ' ms',
      onChange: function (v) { A.updateApi(a.id, { delayMs: v }); }
    });
    X.segmented($('#ixAdd'), {
      items: [{ label: '人工确认', value: 'human-confirm' }, { label: '验证码', value: 'captcha' }, { label: '人工闸门', value: 'manual-gate' }],
      onChange: function (v) {
        A.addInteraction(a.id, v);
        toast('已插入人机交互', IX_META[v][0] + ' · 命中后可在审计日志里放行或拒绝', { tone: 'ok' });
      }
    });
    wireMagnets(box);
  }

  function bindFlow() {
    $('#apiList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-api]'); if (!b) return;
      A.selectApi(b.dataset.api); MP.sfx.play('step');
    });

    $('#respStudio').addEventListener('change', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target;
      if (t.id === 'apiStatus') { A.updateApi(a.id, { status: +t.value }); toast('已更新状态码', t.value + ' ' + t.options[t.selectedIndex].text.split(' ')[1], { tone: 'ok', duration: 2400 }); return; }
      var fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (prop === 'rulekind' && fid) { A.updateField(a.id, fid, { rule: { kind: t.value } }); keepFocus(renderStudio); return; }
      if (prop === 'source' && fid) { A.updateField(a.id, fid, { source: t.value }); keepFocus(renderStudio); return; }
      if (prop && fid) { A.updateField(a.id, fid, { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a.id, rf, rk, t.value); return; }
    });
    $('#respStudio').addEventListener('input', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target, fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (fid && (prop === 'key' || prop === 'value')) { A.updateField(a.id, fid, prop === 'key' ? { key: t.value } : { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a.id, rf, rk, t.value); }
    });
    $('#respStudio').addEventListener('click', function (e) {
      var a = SEL.api(); if (!a) return;
      var del = e.target.closest('[data-del-field]');
      if (del) { A.removeField(a.id, del.dataset.delField); MP.sfx.play('undo'); keepFocus(renderStudio); return; }
      var dix = e.target.closest('[data-del-ix]');
      if (dix) { A.removeInteraction(a.id, dix.dataset.delIx); MP.sfx.play('undo'); keepFocus(renderStudio); return; }
      if (e.target.closest('#addFieldBtn')) {
        var nf = A.addField(a.id);
        keepFocus(renderStudio);
        var input = document.querySelector('[data-fid="' + nf.id + '"][data-prop="key"]');
        if (input) { input.focus(); input.select(); }
        toast('已新增字段', '填好路径与取值后立即生效', { duration: 2400 });
        return;
      }
      if (e.target.closest('#triggerBtn')) {
        var log = A.triggerApi(a.id);
        var notes = ((log.res && log.res.notes) || []).map(function (n) { return n.key + ' = ' + n.value + '（' + n.note + '）'; });
        toast('已触发 ' + a.method + ' ' + a.path, notes.slice(0, 3).join(' · ') + (notes.length > 3 ? ' 等 ' + notes.length + ' 项' : ''), { tone: 'ok', duration: 6000 });
        MP.sfx.play('confirm');
      }
    });

    X.segmented($('#apiFilter'), {
      items: [{ label: '全部能力', value: 'all' }].concat(S.caps.map(function (c) { return { label: c.code, value: c.id }; })),
      value: 'all',
      onChange: function (v) { capFilter = v; renderApiList(); }
    });

    X.segmented($('#logFilter'), {
      items: [{ label: '全部', value: 'all' }, { label: '成功', value: 'ok' }, { label: '异常', value: 'err' }, { label: '待人工', value: 'human' }],
      value: S.ui.logFilter,
      onChange: function (v) { A.setLogFilter(v); }
    });
    $('#logQuery').addEventListener('input', function (e) { A.setLogQuery(e.target.value); });

    $('#logBody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-log]'); if (!tr) return;
      var id = tr.dataset.log;
      if (e.target.closest('[data-approve]')) { A.resolveInteraction(id, 'approve'); toast('已人工放行', '请求继续执行，状态码回到 200', { tone: 'ok' }); MP.sfx.play('confirm'); return; }
      if (e.target.closest('[data-reject]')) { A.resolveInteraction(id, 'reject'); toast('已人工拒绝', '请求被终止（403）', { tone: 'danger' }); MP.sfx.play('warn'); return; }
      if (e.target.closest('[data-replay]')) {
        var log = MP.byId(S.logs, id); if (!log) return;
        var api = S.apis.filter(function (x) { return x.path === log.path; })[0];
        if (api) { A.triggerApi(api.id); MP.sfx.play('confirm'); toast('已重放请求', log.method + ' ' + log.path + ' · 规则会重新计算命中', { duration: 3000 }); }
        else toast('该路径没有匹配的定制接口', log.path, { tone: 'warn' });
        return;
      }
      tr.classList.toggle('is-open');
      var next = tr.nextElementSibling;
      if (next && next.classList.contains('tbl__exp')) next.remove();
      else tr.insertAdjacentElement('afterend', logExpand(MP.byId(S.logs, id)));
      MP.sfx.play('step');
    });
  }

  function logExpand(l) {
    if (!l) return el('tr');
    var tr = el('tr', 'tbl__exp');
    var notes = (l.res && l.res.notes) ? '<div class="rule-notes">' + l.res.notes.map(function (n) {
      return '<span class="rule-note"><b>' + esc(n.key) + '</b> = ' + esc(n.value) + ' <i>' + esc(ruleMeta(n.rule).name) + ' · ' + esc(n.note) + '</i></span>';
    }).join('') + '</div>' : '';
    tr.innerHTML = '<td colspan="9"><div class="cols2">' +
      '<div><div class="sec-title"><span class="sec-title__no">RQ</span>REQUEST</div><pre>' + esc(JSON.stringify(l.req || {}, null, 2)) + '</pre></div>' +
      '<div><div class="sec-title"><span class="sec-title__no">RS</span>RESPONSE</div><pre>' + esc(JSON.stringify(l.res || {}, null, 2)) + '</pre></div>' +
      '</div>' + notes + '</td>';
    return tr;
  }

  function logRow(l) {
    var tr = el('tr', 'is-new');
    tr.dataset.log = l.id;
    tr.setAttribute('tabindex', '0');
    var pending = l.interaction && l.interaction.status === 'pending';
    tr.innerHTML =
      '<td class="mono">' + l.clock + '</td>' +
      '<td class="mono">' + esc((MP.byId(S.ports, l.portId) || {}).port || '—') + '</td>' +
      '<td class="mono">' + esc(l.method) + '</td>' +
      '<td class="mono">' + esc(l.path) + '</td>' +
      '<td><span class="status-code ' + statusCls(l.status) + '">' + l.status + '</span></td>' +
      '<td class="mono">' + l.latencyMs + 'ms</td>' +
      '<td class="mono">' + esc(l.ne) + '</td>' +
      '<td>' + (pending
        ? '<span class="tag tag--warn ak-corner ak-corner--warn">待人工 · ' + esc(l.interaction.label || '') + '</span>'
        : '<span class="muted">' + esc(l.verdict || '') + '</span>') + '</td>' +
      '<td class="right">' + (pending
        ? '<button class="btn btn--sm" data-approve type="button">放行</button> <button class="btn btn--sm btn--danger" data-reject type="button">拒绝</button>'
        : '<button class="btn btn--sm btn--ghost" data-replay type="button">重放</button>') + '</td>';
    return tr;
  }

  function renderLogs(full) {
    var body = $('#logBody'); if (!body) return;
    if (full) {
      var list = SEL.logsFiltered();
      body.innerHTML = '';
      if (!list.length) { $('#logWrap').innerHTML = '<div class="empty">没有符合条件的请求 —— 换个过滤条件或搜索词</div>'; return; }
      var frag = document.createDocumentFragment();
      list.slice(0, 120).forEach(function (l) { frag.appendChild(logRow(l)); });
      body.appendChild(frag);
      return;
    }
    var l = S.logs[0]; if (!l) return;
    var f = S.ui.logFilter;
    if (f === 'ok' && l.status >= 400) return;
    if (f === 'err' && l.status < 400) return;
    if (f === 'human' && !l.interaction) return;
    var q = (S.ui.logQuery || '').toLowerCase();
    if (q && (l.path + l.verdict + l.ne).toLowerCase().indexOf(q) < 0) return;
    body.insertBefore(logRow(l), body.firstChild);
    while (body.children.length > 120) body.removeChild(body.lastChild);
  }

  /* ============================================================== 03 · 网元管理 */
  var neSel = null, neTab = 'profile', upRun = null;

  function renderNe() {
    $('#neList').innerHTML = S.nes.map(function (n, i) {
      var dot = n.status === '在线' ? 'dot--ok' : n.status === '升级中' ? 'dot--warn' : 'dot--idle';
      return '<button class="row' + (n.id === neSel ? ' is-active' : '') + '" data-ne="' + n.id + '" type="button" aria-pressed="' + (n.id === neSel) + '">' +
        '<span class="row__num">RL-' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="row__main"><span class="row__t"><i class="dot ' + dot + '" aria-hidden="true"></i>' + esc(n.name) + '</span>' +
        '<span class="row__s">' + esc(n.type) + ' · ' + esc(n.arch) + ' · V' + esc(n.version) + ' · ' + esc(n.vendor) +
        (n.group && SEL.group(n.group) ? ' · ' + esc(SEL.group(n.group).name) : ' · 未成组') + '</span></span>' +
        '<span class="row__right"><span class="tag tag--ghost">' + esc(n.code) + '</span></span></button>';
    }).join('') || '<div class="empty">暂无网元 —— 点右上角「新建网元」</div>';

    $('#groupList').innerHTML = S.groups.map(function (g) {
      return '<div class="row"><span class="row__main"><span class="row__t"><i class="dia" aria-hidden="true"></i>' + esc(g.name) + '</span>' +
        '<span class="row__s">' + esc(g.strategy) + ' · ' + esc(g.desc) + '</span></span>' +
        '<span class="row__right">' + g.members.map(function (m) { return '<span class="tag tag--ghost">' + esc((MP.byId(S.nes, m) || {}).code || '—') + '</span>'; }).join('') +
        '<span class="tag tag--accent">' + g.members.length + ' 成员</span></span></div>';
    }).join('') || '<div class="empty">暂无网元组</div>';

    var n = MP.byId(S.nes, neSel) || S.nes[0];
    var body = $('#neBody');
    if (!n) { $('#neDetailTitle').textContent = '网元档案'; $('#neTools').innerHTML = ''; body.innerHTML = '<div class="empty">先新建一个网元</div>'; return; }
    neSel = n.id;
    $('#neDetailTitle').textContent = n.name;
    $('#neTools').innerHTML = '<span class="tag tag--ghost">' + esc(n.code) + '</span>' +
      '<span class="tag ' + (n.status === '在线' ? 'tag--ok' : n.status === '升级中' ? 'tag--warn' : 'tag--ghost') + '">' + esc(n.status) + '</span>' +
      '<span class="ak-code-id">' + esc(n.model) + '</span>';
    $$('#neTabs .tabs__t').forEach(function (t) {
      var on = t.dataset.netab === neTab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (neTab === 'profile') {
      var params = Object.keys(n.params || {});
      body.innerHTML =
        '<div class="form__grid form__grid--2">' +
        '<label class="field" for="neName"><span class="field__lbl">网元名称</span><input class="input" id="neName" data-nf="name" value="' + esc(n.name) + '" data-fkey="ne-name" /></label>' +
        '<label class="field" for="neCode"><span class="field__lbl">网元编号</span><input class="input" id="neCode" data-nf="code" value="' + esc(n.code) + '" data-fkey="ne-code" /></label>' +
        '<label class="field" for="neType"><span class="field__lbl">类型 <i class="ak-overline">TYPE</i></span><select class="input" id="neType" data-nf="type">' + opts(S.neTypes, n.type) + '</select></label>' +
        '<label class="field" for="neArch"><span class="field__lbl">架构 <i class="ak-overline">ARCH</i></span><select class="input" id="neArch" data-nf="arch">' + opts(S.arches, n.arch) + '</select></label>' +
        '<label class="field" for="neVendor"><span class="field__lbl">厂商</span><select class="input" id="neVendor" data-nf="vendor">' + opts(S.vendors, n.vendor) + '</select></label>' +
        '<label class="field" for="neVersion"><span class="field__lbl">当前版本</span><input class="input" id="neVersion" data-nf="version" value="' + esc(n.version) + '" data-fkey="ne-ver" aria-describedby="neVerErr" />' +
        '<em class="field__err" id="neVerErr" role="alert" hidden></em></label>' +
        '<label class="field" for="neSoft"><span class="field__lbl">使用软件名称</span><input class="input" id="neSoft" data-nf="softName" value="' + esc(n.softName) + '" data-fkey="ne-soft" /></label>' +
        '<label class="field" for="neModel"><span class="field__lbl">型号</span><input class="input" id="neModel" value="' + esc(n.model) + '" readonly /></label>' +
        '</div>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title" data-reveal><span class="sec-title__no">01</span>旧版本（可回滚）</div>' +
        '<div class="hstack">' + n.oldVersions.map(function (v) {
          var cur = v === n.version;
          return '<span class="tag ' + (cur ? 'tag--accent' : 'tag--ghost') + '">V' + esc(v) + (cur ? ' · 当前' : '') + '</span>';
        }).join('') + '</div>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>网元属性（键值对，可增删）</div>' +
        '<div class="vstack" id="paramList">' + params.map(function (k) {
          return '<div class="hstack"><input class="input" style="flex:1 1 160px" data-pk="key" data-pid="' + esc(k) + '" value="' + esc(k) + '" aria-label="属性名" />' +
            '<input class="input" style="flex:1 1 200px" data-pk="value" data-pid="' + esc(k) + '" value="' + esc(n.params[k]) + '" aria-label="属性值" />' +
            '<button class="iconbtn" data-param-del="' + esc(k) + '" type="button" aria-label="删除属性 ' + esc(k) + '">×</button></div>';
        }).join('') + '</div>' +
        '<div class="hstack"><input class="input" id="paramKey" placeholder="新属性名，如 心跳周期" style="flex:1 1 160px" aria-label="新属性名" />' +
        '<input class="input" id="paramVal" placeholder="属性值，如 30s" style="flex:1 1 200px" aria-label="新属性值" />' +
        '<button class="btn btn--sm" id="paramAdd" type="button"><span>+ 新增属性</span></button></div>' +
        '<div class="ak-rule"></div>' +
        '<div class="hstack"><button class="btn btn--primary" id="neSave" type="button"><span>保存属性</span></button>' +
        '<span class="muted small">属性改动会写入网元档案，用于对端接口的字段级定制</span></div>';
    } else if (neTab === 'valid') {
      body.innerHTML =
        '<div class="sec-title"><span class="sec-title__no">01</span>参数校验规则' +
        '<span class="muted small right">对端上报字段会被这些规则检查（正则）</span></div>' +
        '<div class="vstack" id="validList">' + n.validations.map(function (v) {
          return '<div class="row"><span class="row__main"><span class="row__t mono">' + esc(v.field) + '</span>' +
            '<span class="row__s">' + esc(v.rule) + ' · ' + esc(v.message) + '</span></span>' +
            '<span class="row__right"><span class="tag ' + (v.level === '错误' ? 'tag--danger' : 'tag--warn') + '">' + esc(v.level) + '</span></span></div>';
        }).join('') || '<div class="empty">还没有校验规则</div>' + '</div>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>新增校验规则</div>' +
        '<div class="form__grid form__grid--3">' +
        '<label class="field" for="vField"><span class="field__lbl">字段</span><input class="input" id="vField" value="neId" data-fkey="v-field" /></label>' +
        '<label class="field" for="vLevel"><span class="field__lbl">级别</span><select class="input" id="vLevel">' + opts(['错误', '警告'], '错误') + '</select></label>' +
        '<label class="field field--wide" for="vRule"><span class="field__lbl">正则 / 规则</span><input class="input" id="vRule" placeholder="^GNB-[A-Z]{2}-\\d{4}$" data-fkey="v-rule" /></label>' +
        '<label class="field field--wide" for="vMsg"><span class="field__lbl">不通过时的提示</span><input class="input" id="vMsg" placeholder="网元编号格式不合法" data-fkey="v-msg" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" id="validAdd" type="button"><span>新增规则</span></button>' +
        '<button class="btn btn--primary btn--sm" id="validRun" type="button"><span>执行校验</span></button>' +
        '<span id="validResult" class="grow"></span></div>';
    } else if (neTab === 'flow') {
      var total = n.upgrade.reduce(function (a, s) { return a + (s.kind === 'auto' ? (s.durationS || 0) : 0); }, 0);
      var ixCount = n.upgrade.filter(function (s) { return s.kind === 'human'; }).length;
      body.innerHTML =
        '<div class="sec-title"><span class="sec-title__no">01</span>升级流程步骤' +
        '<span class="muted small right">共 ' + n.upgrade.length + ' 步 · 自动步骤合计 ' + total + 's · 人机交互 ' + ixCount + ' 处</span></div>' +
        '<div class="hstack"><button class="btn btn--primary btn--sm mx-hold" id="upRun" type="button"><span class="mx-hold__label">按住执行升级流程</span></button>' +
        '<div id="upGauge"></div><span id="upMark"></span><span class="muted small">按住 1.2s 开始；人工步骤处会挂起等待放行</span></div>' +
        '<ul class="steps" id="stepList">' + n.upgrade.map(function (s, i) {
          var kind = s.kind === 'auto' ? '<span class="tag tag--ghost">自动 ' + (s.durationS || 0) + 's</span>'
            : s.kind === 'manual' ? '<span class="tag tag--warn">手动 ' + (s.durationS || 0) + 's</span>'
              : '<span class="tag tag--accent">人工 · 人机交互</span>';
          var state = (upRun && upRun.neId === n.id && upRun.states[i]) || 'todo';
          return '<li class="step is-' + state + '"><span class="step__node" aria-hidden="true"></span>' +
            '<span class="step__body"><span class="step__name">' + esc(s.name) + '</span>' +
            '<span class="step__meta">' + kind + (s.interaction ? '<span>负责人 ' + esc(s.interaction.owner) + '</span><span>超时 ' + s.interaction.timeoutS + 's</span>' : '') + '</span></span>' +
            '<span class="step__right">' +
            '<button class="iconbtn" data-step-up="' + s.id + '" type="button" aria-label="上移步骤 ' + esc(s.name) + '">' +
            '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>' +
            '<button class="iconbtn" data-step-down="' + s.id + '" type="button" aria-label="下移步骤 ' + esc(s.name) + '">' +
            '<svg viewBox="0 0 24 24"><path d="M12 5v14M18 13l-6 6-6-6" /></svg></button>' +
            '<button class="iconbtn" data-step-del="' + s.id + '" type="button" aria-label="删除步骤 ' + esc(s.name) + '">' +
            '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button>' +
            '</span></li>';
        }).join('') + '</ul>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>新增升级步骤</div>' +
        '<div class="form__grid form__grid--4">' +
        '<label class="field" for="stepName"><span class="field__lbl">步骤名称</span><input class="input" id="stepName" placeholder="例如：业务验证" data-fkey="step-name" /></label>' +
        '<label class="field" for="stepKind"><span class="field__lbl">类型</span><select class="input" id="stepKind">' +
        '<option value="auto">自动（计时）</option><option value="manual">手动（人工操作不计时）</option><option value="human">人工（插入人机交互）</option></select></label>' +
        '<label class="field" for="stepDur"><span class="field__lbl">预计耗时 (s)</span><input class="input" id="stepDur" inputmode="numeric" value="30" data-fkey="step-dur" /></label>' +
        '<label class="field" for="stepOwner"><span class="field__lbl">交互负责人</span><input class="input" id="stepOwner" value="值班工程师" data-fkey="step-owner" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" id="stepAdd" type="button"><span>+ 新增步骤</span></button>' +
        '<span class="muted small">类型选「人工」时会自动挂上人机交互（负责人 / 超时 300s）</span></div>';
    } else {
      var ungrouped = S.nes.filter(function (x) { return !x.group || x.group === ''; });
      body.innerHTML =
        '<label class="field" for="neGroup"><span class="field__lbl">归入网元组 <i class="ak-overline">GROUP</i></span>' +
        '<select class="input" id="neGroup"><option value="">（不分组）</option>' + S.groups.map(function (g) {
          return '<option value="' + g.id + '"' + (g.id === n.group ? ' selected' : '') + '>' + esc(g.name) + ' · ' + g.members.length + ' 个成员</option>';
        }).join('') + '</select></label>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title"><span class="sec-title__no">01</span>新建网元组</div>' +
        '<div class="form__grid form__grid--3">' +
        '<label class="field" for="grpName"><span class="field__lbl">组名</span><input class="input" id="grpName" placeholder="西安灾备组" data-fkey="grp-name" /></label>' +
        '<label class="field" for="grpStrategy"><span class="field__lbl">升级策略</span><select class="input" id="grpStrategy">' +
        opts(['串行 · 每台间隔 60s', '并行 · 保留备用', '串行 · 人工逐台确认'], '串行 · 每台间隔 60s') + '</select></label>' +
        '<label class="field" for="grpDesc"><span class="field__lbl">说明</span><input class="input" id="grpDesc" placeholder="同架构同版本批量升级" data-fkey="grp-desc" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" id="groupNew" type="button"><span>+ 新建并归入</span></button>' +
        '<span class="muted small">该网元会被立即归入新组</span></div>' +
        '<div class="ak-rule"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>复制网元</div>' +
        '<div class="hstack"><button class="btn btn--primary mx-magnetic" data-magnetic id="neCopy" type="button"><span>复制该网元</span></button>' +
        '<span class="muted small">名称末尾序号顺延一位；属性 / 校验规则 / 升级流程全部继承（可在 toast 中撤销）</span></div>' +
        '<div class="muted small">当前未成组网元：' + (ungrouped.length ? ungrouped.map(function (x) { return esc(x.name); }).join('、') : '（无）') + '</div>';
    }
    wireMagnets(body);
  }

  function stopUpgrade() {
    if (upRun && upRun.timer) clearTimeout(upRun.timer);
    if (upRun) { upRun.timer = null; upRun.running = false; }
  }

  function paintSteps() {
    var list = $('#stepList'); if (!list || !upRun) return;
    $$('.step', list).forEach(function (li, i) {
      var st = upRun.states[i] || 'todo';
      li.className = 'step is-' + st;
    });
    var g = $('#upGauge');
    if (g && upRun.gauge) upRun.gauge.set(upRun.progress);
    var mk = $('#upMark');
    if (mk && upRun.mark) {
      if (upRun.running) upRun.mark.set('working', '升级执行中 ' + upRun.progress + '%');
      else if (upRun.progress >= 100) upRun.mark.set('done', '升级完成 ' + upRun.progress + '%');
      else if (upRun.waiting) upRun.mark.set('working', '等待人工放行 · ' + (MP.byId(S.nes, upRun.neId) || {}).name);
      else upRun.mark.set('idle', '升级已中断 · ' + upRun.progress + '%');
    }
  }

  function startUpgrade(n) {
    var btn = $('#upRun'); if (!btn) return;
    stopUpgrade();
    upRun = {
      neId: n.id, states: n.upgrade.map(function () { return 'todo'; }),
      idx: 0, progress: 0, running: true, waiting: false, timer: null
    };
    var g = $('#upGauge');
    if (g) { g.innerHTML = ''; upRun.gauge = X.gauge(g, { value: 0, unit: '%', label: '升级进度' }); }
    var mk = $('#upMark');
    if (mk) { mk.innerHTML = ''; upRun.mark = X.statusMark(mk, { state: 'working', label: '升级执行中' }); }
    A.updateNE(n.id, { status: '升级中' });
    toast('升级流程已启动', n.name + ' · 共 ' + n.upgrade.length + ' 步', { tone: 'ok' });

    (function stepNext() {
      if (!upRun || !upRun.running) return;
      var steps = n.upgrade;
      if (upRun.idx >= steps.length) {
        upRun.running = false; upRun.progress = 100;
        A.updateNE(n.id, { status: '在线' });
        paintSteps();
        toast('升级流程已完成', n.name + ' 全部 ' + steps.length + ' 步通过', { tone: 'ok', duration: 5200 });
        return;
      }
      upRun.states[upRun.idx] = 'active';
      var s = steps[upRun.idx];
      paintSteps();
      if (s.kind === 'human') {
        upRun.waiting = true;
        toast('到达人机交互步骤', s.name + ' · 负责人 ' + ((s.interaction || {}).owner || '值班工程师') + ' · 超时 ' + ((s.interaction || {}).timeoutS || 300) + 's', {
          tone: 'warn', duration: 8000, actionLabel: '立即放行',
          onAction: function () {
            if (!upRun) return;
            upRun.waiting = false;
            upRun.states[upRun.idx] = 'done';
            upRun.progress = Math.round((upRun.idx + 1) / steps.length * 100);
            upRun.idx++;
            toast('已人工放行', s.name + ' 继续执行', { tone: 'ok', duration: 2400 });
            MP.sfx.play('confirm');
            paintSteps();
            upRun.timer = setTimeout(stepNext, 420);
          }
        });
        MP.sfx.play('warn');
        return;
      }
      var wait = s.kind === 'auto' ? 700 : 900;
      upRun.timer = setTimeout(function () {
        if (!upRun || !upRun.running) return;
        upRun.states[upRun.idx] = 'done';
        upRun.progress = Math.round((upRun.idx + 1) / steps.length * 100);
        upRun.idx++;
        paintSteps();
        MP.sfx.play('step');
        upRun.timer = setTimeout(stepNext, 260);
      }, wait);
    })();
  }

  function bindNe() {
    $('#neList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ne]'); if (!b) return;
      stopUpgrade(); neSel = b.dataset.ne; renderNe(); MP.sfx.play('step');
    });
    $('#neTabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-netab]'); if (!t) return;
      neTab = t.dataset.netab;
      renderNe();
      MP.sfx.play('step');
    });
    $('#neNew').addEventListener('click', function () {
      var n = A.addNE({ name: '新网元 ' + (S.nes.length + 1), code: 'GNB', type: S.neTypes[0], arch: S.arches[0], vendor: S.vendors[0], version: '7.0.0' });
      neSel = n.id; neTab = 'profile'; renderNe();
      toast('已创建网元', n.name + ' —— 补全属性 / 校验 / 升级流程后即可用于 mock', { tone: 'ok' });
    });

    $('#neBody').addEventListener('change', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var t = e.target, f = t.dataset.nf;
      if (f) {
        if (f === 'version') {
          var ok = /^\d+\.\d+(\.\d+)?$/.test(t.value.trim());
          var err = $('#neVerErr'); if (err) { err.hidden = ok; err.textContent = ok ? '' : '版本需形如 7.2.0'; }
          if (t.closest('.field')) t.closest('.field').classList.toggle('is-invalid', !ok);
          if (!ok) { MP.sfx.play('warn'); return; }
        }
        var patch = {}; patch[f] = t.value;
        A.updateNE(n.id, patch);
        return;
      }
      if (t.id === 'neGroup') {
        A.assignGroup(n.id, t.value);
        toast('已调整分组', t.value ? (SEL.group(t.value) || {}).name : '未分组', { duration: 2400 });
      }
      if (t.dataset.pk) {
        var params = Object.assign({}, n.params);
        var pid = t.dataset.pid;
        if (t.dataset.pk === 'key') { if (t.value.trim()) { params[t.value.trim()] = params[pid]; delete params[pid]; } }
        else params[pid] = t.value;
        A.updateNE(n.id, { params: params });
      }
    });

    $('#neBody').addEventListener('input', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var t = e.target;
      if (t.dataset.pk === 'value') {
        var params = Object.assign({}, n.params); params[t.dataset.pid] = t.value; A.updateNE(n.id, { params: params });
      }
    });

    $('#neBody').addEventListener('click', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var up = e.target.closest('[data-step-up]'), down = e.target.closest('[data-step-down]'), del = e.target.closest('[data-step-del]');
      if (up) { A.moveStep(n.id, up.dataset.stepUp, -1); MP.sfx.play('step'); return; }
      if (down) { A.moveStep(n.id, down.dataset.stepDown, 1); MP.sfx.play('step'); return; }
      if (del) { A.removeStep(n.id, del.dataset.stepDel); MP.sfx.play('undo'); toast('已删除步骤', '升级流程已更新', { duration: 2200 }); return; }
      if (e.target.closest('#paramAdd')) {
        var k = ($('#paramKey') || {}).value || '', v = ($('#paramVal') || {}).value || '';
        if (!k.trim()) { if ($('#paramKey')) $('#paramKey').focus(); MP.sfx.play('warn'); return; }
        var params = Object.assign({}, n.params); params[k.trim()] = v; A.updateNE(n.id, { params: params });
        toast('已新增属性', k.trim() + ' = ' + v, { tone: 'ok', duration: 2400 });
        return;
      }
      if (e.target.closest('[data-param-del]')) {
        var pk = e.target.closest('[data-param-del]').dataset.paramDel;
        var p2 = Object.assign({}, n.params); delete p2[pk]; A.updateNE(n.id, { params: p2 });
        toast('已删除属性', pk, { duration: 2200 });
        return;
      }
      if (e.target.closest('#neSave')) { toast('属性已保存', n.name + ' · ' + n.type + ' / V' + n.version, { tone: 'ok' }); return; }
      if (e.target.closest('#stepAdd')) {
        var name = ($('#stepName') || {}).value || '新步骤';
        var kind = ($('#stepKind') || {}).value || 'auto';
        var dur = +($('#stepDur') || {}).value || 0;
        var owner = ($('#stepOwner') || {}).value || '值班工程师';
        A.addUpgradeStep(n.id, { name: name, kind: kind, durationS: dur, owner: owner });
        MP.sfx.play('confirm');
        toast('已新增升级步骤', name + '（' + ({ auto: '自动', manual: '手动', human: '人工 · 人机交互' })[kind] + '）', { tone: 'ok' });
        return;
      }
      if (e.target.closest('#validAdd')) {
        var rule = ($('#vRule') || {}).value || '', field = ($('#vField') || {}).value || 'neId';
        try { new RegExp(rule); } catch (err) {
          if ($('#vRule')) $('#vRule').focus();
          MP.sfx.play('warn');
          toast('正则表达式无效', rule + ' —— 请检查转义', { tone: 'danger' });
          return;
        }
        A.addValidation(n.id, { field: field, rule: rule, level: ($('#vLevel') || {}).value, message: ($('#vMsg') || {}).value || '不符合规则' });
        toast('已新增校验规则', field + ' · ' + rule, { tone: 'ok', duration: 2400 });
        return;
      }
      if (e.target.closest('#validRun')) {
        var target = $('#validResult');
        target.innerHTML = '';
        var lat = el('span'); target.appendChild(lat);
        var ctl = X.latticeLoader(lat, { label: '校验中' });
        X.rippleLoader($('#validRun'), { label: '' });
        setTimeout(function () {
          var res = A.runValidation(n.id);
          var pass = res.filter(function (r) { return r.pass; }).length;
          ctl.done('校验完成');
          target.innerHTML = res.map(function (r) {
            return '<span class="mx-mark is-' + (r.pass ? 'done' : 'error') + '" style="margin-right:12px">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/>' +
              '<path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/>' +
              '<path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg>' +
              '<span class="mx-mark__label">' + esc(r.field) + '：' + esc(r.message) + '</span></span>';
          }).join('') + '<span class="mx-lattice is-done" style="margin-left:8px"><b class="mx-lattice__label">' + pass + '/' + res.length + ' 通过</b></span>';
          toast(pass === res.length ? '参数校验全部通过' : '参数校验发现问题', pass + '/' + res.length + ' 条规则通过', { tone: pass === res.length ? 'ok' : 'warn' });
        }, 900);
        return;
      }
      if (e.target.closest('#neCopy')) {
        var c = A.copyNE(n.id);
        MP.sfx.play('confirm');
        toast('已复制网元', c.name + '（' + c.id + '）—— 属性 / 校验 / 升级流程已继承', {
          tone: 'ok', actionLabel: '撤销复制',
          onAction: function () {
            S.nes = S.nes.filter(function (x) { return x.id !== c.id; });
            S.groups.forEach(function (g) { g.members = g.members.filter(function (m) { return m !== c.id; }); });
            if (neSel === c.id) neSel = n.id;
            MP.emit({ type: 'ne', action: 'undo-copy' });
            toast('已撤销复制', c.name, { duration: 2400 });
          }
        });
        return;
      }
      if (e.target.closest('#groupNew')) {
        var gname = ($('#grpName') || {}).value.trim();
        if (!gname) { if ($('#grpName')) $('#grpName').focus(); MP.sfx.play('warn'); toast('请填写组名', '网元组名不能为空', { tone: 'warn', duration: 2600 }); return; }
        var g = A.addGroup({ name: gname, desc: ($('#grpDesc') || {}).value || '手动创建', strategy: ($('#grpStrategy') || {}).value });
        A.assignGroup(n.id, g.id);
        MP.sfx.play('confirm');
        toast('已新建网元组', g.name + '，' + n.name + ' 已归入', { tone: 'ok' });
      }
    });
  }

  /* 升级流程：holdConfirm 需要重新接线（步骤列表重画后按钮被替换） */
  function wireUpgradeRun() {
    var btn = $('#upRun'); if (!btn) return;
    var n = MP.byId(S.nes, neSel); if (!n) return;
    X.holdConfirm(btn, {
      duration: 1200, label: '按住执行升级流程', doneLabel: '升级进行中',
      onConfirm: function () { startUpgrade(n); }
    });
  }

  /* ========================================================== 04 · 网元管理平台 */
  function renderOmp() {
    $('#ompScopeMeta').textContent = S.nes.length + ' 个网元 / ' + S.groups.length + ' 个组';
    $('#ompScope').innerHTML = S.nes.map(function (n, i) {
      return '<div class="row' + (n.group ? '' : ' ak-corner') + '"><span class="row__num">RL-' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="row__main"><span class="row__t">' + esc(n.name) + '</span>' +
        '<span class="row__s mono">' + esc(n.code) + ' · ' + esc(n.arch) + ' · V' + esc(n.version) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (n.group ? 'tag--ok' : 'tag--ghost') + '">' + (n.group ? esc((SEL.group(n.group) || {}).name) : '未纳入平台') + '</span></span></div>';
    }).join('') + '<div class="ak-rule"></div>' + S.groups.map(function (g) {
      return '<div class="row"><span class="row__main"><span class="row__t"><i class="dia" aria-hidden="true"></i>组 · ' + esc(g.name) + '</span>' +
        '<span class="row__s">' + esc(g.strategy) + ' · ' + esc(g.desc) + '</span></span>' +
        '<span class="row__right"><span class="tag tag--accent">' + g.members.length + ' 成员</span>' +
        '<button class="btn btn--sm" data-omp-group-task="' + g.id + '" type="button"><span>一键建任务</span></button></span></div>';
    }).join('');

    $('#accCount').textContent = S.accounts.length + ' 个账号';
    $('#accList').innerHTML = S.accounts.map(function (a) {
      return '<div class="row"><span class="row__main"><span class="row__t mono">' + esc(a.name) + '</span>' +
        '<span class="row__s">' + esc(a.role) + ' · 授权 ' + a.nes.length + ' 个网元' +
        (a.scope && a.scope.length ? ' · 范围 ' + a.scope.map(function (s) { return esc((SEL.group(s) || {}).name || s); }).join('、') : '') +
        ' · ' + esc(a.createdAt) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (a.status === '启用' ? 'tag--ok' : 'tag--ghost') + '">' + esc(a.status) + '</span>' +
        '<span id="acc-' + a.id + '"></span></span></div>';
    }).join('') || '<div class="empty">暂无账号</div>';
    S.accounts.forEach(function (a) {
      var host = $('#acc-' + a.id); if (!host) return;
      var sw = el('button', 'mx-sw');
      sw.type = 'button';
      host.appendChild(sw);
      X.velocitySwitch(sw, {
        checked: a.status === '启用', label: '启用或停用账号 ' + a.name,
        onChange: function (on) {
          A.toggleAccount(a.id);
          toast(on ? '账号已启用' : '账号已停用', a.name + ' · ' + a.role, { tone: on ? 'ok' : 'warn', duration: 2400 });
        }
      });
    });

    $('#acScopes').innerHTML = S.groups.map(function (g) {
      return '<label class="chk"><input type="checkbox" value="' + g.id + '" data-scope />' + esc(g.name) + ' <em class="muted">' + g.members.length + ' 台</em></label>';
    }).join('') || '<span class="muted small">还没有网元组</span>';
    $('#acNes').innerHTML = S.nes.map(function (n) {
      return '<label class="chk"><input type="checkbox" value="' + n.id + '" data-acne />' + esc(n.name) + ' <em class="muted">' + esc(n.code) + '</em></label>';
    }).join('');

    $('#taskWrap').innerHTML = S.tasks.map(function (t) {
      var steps = t.steps.map(function (s, i) {
        return '<span class="tag ' + (s.state === 'done' ? 'tag--ok' : s.state === 'active' ? 'tag--accent' : 'tag--ghost') + '">' + (i + 1) + '. ' + esc(s.name) + '</span>';
      }).join('');
      var tone = t.status === 'done' ? 'done' : t.status === 'waiting-human' ? 'idle' : 'working';
      return '<div class="fld' + (t.status === 'waiting-human' ? ' fld--warn ak-corner ak-corner--warn' : '') + '">' +
        '<div class="hstack"><b>' + esc(t.name) + '</b><span class="tag tag--ghost">' + esc(t.type) + '</span>' +
        '<span class="tag tag--accent">' + esc(t.site) + '</span>' +
        '<span class="tag ' + (t.status === 'done' ? 'tag--ok' : t.status === 'waiting-human' ? 'tag--warn' : 'tag--ghost') + '">' +
        ({ done: '已完成', 'waiting-human': '等待人工', running: '执行中' })[t.status] + '</span>' +
        '<span class="right muted small">' + esc(t.owner) + ' · ' + esc(t.createdAt) + '</span></div>' +
        '<div class="hstack" style="margin-top:8px">' +
        '<span id="gauge-' + t.id + '"></span>' +
        '<span class="mx-mark is-' + tone + '" id="tm-' + t.id + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/>' +
        '<path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/>' +
        '<path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg>' +
        '<span class="mx-mark__label">' + ({ done: '已完成', 'waiting-human': '等待人工放行', running: '执行中' })[t.status] + '</span></span>' +
        '<button class="btn btn--sm right" data-task-advance="' + t.id + '" type="button"><span>推进下一步</span></button></div>' +
        '<div class="hstack" style="margin-top:6px">' + steps + '</div>' +
        '<div class="fld__desc">关联站点 ' + esc(t.site) + ' · ' + t.neIds.length + ' 个目标网元 · 创建于 ' + esc(t.createdAt) + '</div>' +
        '</div>';
    }).join('') || '<div class="empty">暂无任务</div>';
    S.tasks.forEach(function (t) {
      var host = document.getElementById('gauge-' + t.id); if (!host) return;
      X.gauge(host, { value: t.progress, label: '升级进度' });
    });

    $('#tkSite').innerHTML = S.sites.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '（' + esc(s.region) + ' · ' + s.cpu + ' 核）</option>'; }).join('');
    $('#tkGroup').innerHTML = S.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + ' · ' + g.members.length + ' 个网元</option>'; }).join('');
  }

  function bindOmp() {
    $('#accForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#acName').value.trim();
      var err = $('#acNameErr'), bad = false, msg = '';
      if (!name) { bad = true; msg = '账号名称不能为空'; }
      else if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) { bad = true; msg = '账号名仅允许字母 / 数字 / _ . - ，3–24 位'; }
      else if (S.accounts.some(function (a) { return a.name === name; })) { bad = true; msg = '该账号已存在'; }
      err.hidden = !bad; err.textContent = msg;
      $('#acName').closest('.field').classList.toggle('is-invalid', bad);
      if (bad) { $('#acName').focus(); MP.sfx.play('warn'); return; }
      var scope = $$('#acScopes input:checked').map(function (i) { return i.value; });
      var nes = $$('#acNes input:checked').map(function (i) { return i.value; });
      scope.forEach(function (gid) {
        var g = SEL.group(gid); if (!g) return;
        g.members.forEach(function (m) { if (nes.indexOf(m) < 0) nes.push(m); });
      });
      A.createAccount({ name: name, role: $('#acRole').value, scope: scope, nes: nes });
      $('#acName').value = '';
      $$('#acNes input:checked, #acScopes input:checked').forEach(function (i) { i.checked = false; });
      MP.sfx.play('confirm');
      toast('已创建账号', name + ' · ' + $('#acRole').value + ' · 授权 ' + nes.length + ' 个网元', { tone: 'ok' });
    });

    $('#taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#tkName').value.trim();
      var err = $('#tkNameErr'), bad = !name;
      err.hidden = !bad; err.textContent = bad ? '任务名称不能为空' : '';
      $('#tkName').closest('.field').classList.toggle('is-invalid', bad);
      if (bad) { $('#tkName').focus(); MP.sfx.play('warn'); return; }
      var gid = $('#tkGroup').value, g = SEL.group(gid);
      var t = A.createTask({ name: name, site: (MP.byId(S.sites, $('#tkSite').value) || {}).name, neIds: g ? g.members.slice() : [], owner: 'zhangwei' });
      $('#tkName').value = '';
      MP.sfx.play('confirm');
      toast('已创建一体化升级任务', t.name + ' · 关联 ' + t.site + ' · ' + t.steps.length + ' 个步骤', { tone: 'ok' });
    });

    $('#ompScope').addEventListener('click', function (e) {
      var b = e.target.closest('[data-omp-group-task]'); if (!b) return;
      var g = SEL.group(b.dataset.ompGroupTask); if (!g) return;
      $('#tkGroup').value = g.id;
      var site = $('#tkSite');
      $('#tkName').value = g.name + ' 一体化升级';
      toast('已预填任务表单', '目标网元组 ' + g.name + ' · 关联站点 ' + site.options[site.selectedIndex].text, { duration: 3200 });
      $('#tkName').focus();
    });

    $('#taskWrap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-task-advance]'); if (!b) return;
      var t = MP.byId(S.tasks, b.dataset.taskAdvance); if (!t) return;
      A.advanceTask(t.id);
      var idx = t.steps.map(function (s) { return s.state; }).indexOf('active');
      if (t.status === 'waiting-human') {
        MP.sfx.play('warn');
        toast('任务等待人工放行', t.steps[idx] ? t.steps[idx].name : '人工步骤', {
          tone: 'warn', actionLabel: '立即放行',
          onAction: function () { A.advanceTask(t.id); toast('已放行', t.name + ' 继续执行', { tone: 'ok' }); }
        });
      } else if (t.status === 'done') {
        toast('任务已完成', t.name + ' · 关联站点 ' + t.site, { tone: 'ok' });
      } else {
        toast('已推进', (t.steps[idx] || {}).name || '下一步', { duration: 2400 });
        MP.sfx.play('step');
      }
    });
  }

  /* ========================================================== 05 · 生命周期平台 */
  var pkgFilter = 'all';
  function renderLcm() {
    X.segmented($('#pkgFilter'), {
      items: [{ label: '全部', value: 'all' }, { label: '已校验', value: 'ok' }, { label: '待校验', value: 'todo' }],
      value: pkgFilter,
      onChange: function (v) { pkgFilter = v; keepFocus(renderLcm); }
    });
    var list = S.packages.filter(function (p) { return pkgFilter === 'all' || (pkgFilter === 'ok' ? p.validated : !p.validated); });
    $('#pkgCount').textContent = list.length + ' / ' + S.packages.length + ' 个';
    $('#pkgList').innerHTML = list.map(function (p, i) {
      return '<div class="row' + (p.validated ? '' : ' ak-stripes ak-stripes--warn') + (p.validated ? ' ak-corner' : '') + '">' +
        '<span class="row__num">RL-' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="row__main"><span class="row__t mono">' + esc(p.name) + '</span>' +
        '<span class="row__s">' + esc(p.type) + ' · ' + esc(p.vendor) + ' · V' + esc(p.version) + ' · ' + p.sizeMB + 'MB · MD5 ' + esc(p.md5) + ' · 所属 ' + esc(neName(p.ne)) + '</span></span>' +
        '<span class="row__right">' + (p.validated ? '<span class="tag tag--ok">已校验</span>' : '<span class="tag tag--warn">待校验</span>') +
        '<span id="pkgm-' + p.id + '"></span>' +
        (p.validated ? '' : '<button class="btn btn--sm" data-pkg-validate="' + p.id + '" type="button"><span>走校验流程</span></button>') +
        '<button class="iconbtn" data-pkg-del="' + p.id + '" type="button" aria-label="移除软件包 ' + esc(p.name) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button></span></div>';
    }).join('') || '<div class="empty">没有符合条件的软件包</div>';
    S.packages.forEach(function (p) {
      var host = document.getElementById('pkgm-' + p.id); if (!host) return;
      X.statusMark(host, { state: p.validated ? 'done' : 'idle', label: p.validated ? '校验通过' : '未校验' });
    });

    $('#lcmScopeMeta').textContent = S.nes.length + ' 个受管网元';
    $('#lcmScope').innerHTML = S.nes.map(function (n) {
      return '<label class="chk is-on"><input type="checkbox" checked data-lcm-ne />' + esc(n.name) + ' <em class="muted">V' + esc(n.version) + '</em></label>';
    }).join('');

    var box = $('#deployBox');
    box.innerHTML =
      '<div class="vstack">' +
      '<div class="hstack"><b class="small">与网元管理平台共部署</b><span id="coDeploySw"></span>' +
      '<span class="tag ' + (S.deploy.lcmp.coDeploy ? 'tag--ok' : 'tag--ghost') + '">' + (S.deploy.lcmp.coDeploy ? '共用端点' : '独立端点') + '</span></div>' +
      '<div class="muted small">共部署时两个平台复用同一 mock 端点与证书（' + esc(S.deploy.omp.host) + '），端口只需登记一次、证书只需签发一次；' +
      (S.deploy.lcmp.coDeploy ? '当前 LCMP 与 NEMP 共用该端点。' : '当前 LCMP 使用独立端点，需要单独登记端口并签发证书。') + '</div>' +
      '<div class="form__grid form__grid--2">' +
      '<div class="fld' + (S.deploy.lcmp.coDeploy ? ' fld--accent' : '') + '"><div class="field__lbl">LCMP 端点</div><b class="mono">' + (S.deploy.lcmp.coDeploy ? esc(S.deploy.omp.host) : '10.18.32.104:9443') + '</b></div>' +
      '<div class="fld"><div class="field__lbl">NEMP 端点</div><b class="mono">' + esc(S.deploy.omp.host) + '</b></div>' +
      '<div class="fld"><div class="field__lbl">平台版本</div><b>' + esc(S.deploy.lcmp.version) + '</b></div>' +
      '<div class="fld"><div class="field__lbl">软件包</div><b class="ak-num">' + S.packages.length + ' 个（已校验 ' + S.packages.filter(function (p) { return p.validated; }).length + '）</b></div>' +
      '</div>' +
      '<div class="ak-scale" aria-hidden="true"></div>' +
      '<div class="hstack"><span class="muted small">端口复用：共部署后 LCMP 的 32 个接口与 NEMP 的 46 个接口挂在同一端口上，由能力挂载区分</span></div>' +
      '</div>';
    var sw = el('button', 'mx-sw');
    sw.type = 'button';
    $('#coDeploySw').appendChild(sw);
    X.velocitySwitch(sw, {
      checked: S.deploy.lcmp.coDeploy, label: '切换与网元管理平台共部署',
      onChange: function (on) {
        A.toggleCoDeploy('lcmp');
        toast(on ? '已开启共部署' : '已关闭共部署', on ? '复用 NEMP 端点与证书，端口无需重复登记' : 'LCMP 将使用独立端点 :9443，需单独签发证书', { tone: on ? 'ok' : 'warn' });
      }
    });

    $('#pkgType').innerHTML = opts(S.softTypes, S.softTypes[0]);
    $('#pkgVendor').innerHTML = opts(S.vendors, S.vendors[0]);
    $('#pkgNe').innerHTML = '<option value="">（平台级 · 不属于具体网元）</option>' + S.nes.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + ' · ' + esc(n.code) + '</option>'; }).join('');
  }

  function bindLcm() {
    $('#pkgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#pkgName').value.trim(), ver = $('#pkgVer').value.trim();
      var eN = $('#pkgNameErr'), eV = $('#pkgVerErr');
      var badN = !name, badV = !/^\d+\.\d+(\.\d+)?$/.test(ver);
      eN.hidden = !badN; eN.textContent = badN ? '包名不能为空' : '';
      eV.hidden = !badV; eV.textContent = badV ? '版本号需形如 7.3.0' : '';
      $('#pkgName').closest('.field').classList.toggle('is-invalid', badN);
      $('#pkgVer').closest('.field').classList.toggle('is-invalid', badV);
      if (badN || badV) { (badN ? $('#pkgName') : $('#pkgVer')).focus(); MP.sfx.play('warn'); return; }
      A.addPackage({ name: name, type: $('#pkgType').value, ne: $('#pkgNe').value, vendor: $('#pkgVendor').value, version: ver, sizeMB: +$('#pkgSize').value || 0 });
      $('#pkgName').value = ''; $('#pkgVer').value = ''; $('#pkgSize').value = '';
      MP.sfx.play('confirm');
      toast('已登记软件包', name + ' · V' + ver + ' —— 需通过校验流程后才可用于升级', { tone: 'ok' });
    });

    $('#pkgList').addEventListener('click', function (e) {
      var v = e.target.closest('[data-pkg-validate]');
      if (v) {
        var id = v.dataset.pkgValidate;
        var host = document.getElementById('pkgm-' + id);
        if (host) { host.innerHTML = ''; X.latticeLoader(host, { label: '校验中' }); }
        v.remove();
        setTimeout(function () {
          A.validatePackage(id);
          toast('软件包校验通过', 'MD5 / 厂商签名 / 依赖关系 三项一致', { tone: 'ok' });
        }, 1100);
        return;
      }
      var d = e.target.closest('[data-pkg-del]');
      if (d) {
        var p = MP.byId(S.packages, d.dataset.pkgDel); if (!p) return;
        A.removePackage(p.id);
        MP.sfx.play('undo');
        toast('已移除软件包', p.name, {
          tone: 'danger', actionLabel: '撤销',
          onAction: function () { S.packages.push(p); MP.emit({ type: 'package', action: 'restore' }); toast('已恢复软件包', p.name, { tone: 'ok', duration: 2400 }); }
        });
      }
    });
  }

  /* ========================================================== 06 · 虚层管理平台 */
  function renderVlp() {
    var v = S.vlp;
    var pc = MP.byId(S.sites, v.primarySite) || {}, sc = MP.byId(S.sites, v.secondarySite) || {};
    $('#vlpCore').innerHTML =
      '<div class="form__grid form__grid--2">' +
      '<label class="field" for="vlpVer"><span class="field__lbl">平台版本 <i class="ak-overline">VERSION</i></span><select class="input" id="vlpVer">' +
      ['VLMP R3.1.0', 'VLMP R3.0.6', 'VLMP R3.2.0-rc1'].map(function (o) { return '<option' + (o === v.version ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="field"><span class="field__lbl">CPU 数量（' + v.cpuRange[0] + '–' + v.cpuRange[1] + ' 核 · 拖拽或方向键）</span>' +
      '<div class="hstack"><div id="cpuScrub"></div>' +
      '<button class="btn btn--sm" data-cpu="-2" type="button" aria-label="减少 2 核"><span>−2</span></button>' +
      '<button class="btn btn--sm mx-magnetic" data-magnetic data-cpu="2" type="button" aria-label="增加 2 核"><span>+2</span></button></div></div>' +      '</div>' +
      '<div class="hstack" style="margin-top:12px">' +
      '<span id="cpuGauge"></span>' +
      '<div class="vstack grow">' +
      '<div class="form__grid form__grid--3">' +
      '<div class="fld"><div class="field__lbl">主站点余量</div><b class="ak-num">' + (pc.cpu == null ? '—' : pc.cpu) + ' 核</b></div>' +
      '<div class="fld"><div class="field__lbl">副站点余量</div><b class="ak-num">' + (sc.cpu == null ? '—' : sc.cpu) + ' 核</b></div>' +
      '<div class="fld"><div class="field__lbl">卷</div><b class="mono">' + esc(v.volume) + '</b></div>' +
      '</div>' +
      '<div class="muted small">CPU 超过站点余量时会进入橡皮筋超界提示；升级时会先做倒换演练再切版本。</div>' +
      '</div></div>';
    X.scrub($('#cpuScrub'), {
      label: 'CPU', value: v.cpu, min: v.cpuRange[0], max: v.cpuRange[1], step: 2, suffix: ' 核',
      onChange: function (num) { A.setCPU(num); var g = $('#cpuGauge'); if (g && g.__mx) g.__mx.set((num - v.cpuRange[0]) / (v.cpuRange[1] - v.cpuRange[0]) * 100); }
    });
    var cg = $('#cpuGauge');
    cg.__mx = X.gauge(cg, { value: (v.cpu - v.cpuRange[0]) / (v.cpuRange[1] - v.cpuRange[0]) * 100, unit: '%', label: 'CPU 配额' });

    $('#vlpSites').innerHTML = S.sites.map(function (s) {
      var role = s.id === v.primarySite ? '主站点' : s.id === v.secondarySite ? '副站点' : '';
      return '<div class="row' + (role ? ' is-active' : '') + '"><span class="row__main"><span class="row__t">' +
        '<i class="dia' + (role === '主站点' ? '' : ' dia--muted') + '" aria-hidden="true"></i>' + esc(s.name) +
        ' <span class="tag tag--ghost">' + esc(s.region) + '</span></span>' +
        '<span class="row__s">可分配 CPU ' + s.cpu + ' 核 · 规划角色 ' + esc(s.role) + '</span></span>' +
        '<span class="row__right">' + (role ? '<span class="tag tag--accent">' + role + '</span>' : '') +
        '<button class="btn btn--sm" data-site-p="' + s.id + '" type="button"><span>设为主站</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-site-s="' + s.id + '" type="button"><span>设为副站</span></button></span></div>';
    }).join('');

    $('#vlpFlow').innerHTML = '<ul class="steps" id="vlpFlowList">' + v.upgradeFlow.map(function (s, i) {
      var kind = s.kind === 'auto' ? '<span class="tag tag--ghost">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工 · 人机交互</span>';
      return '<li class="step is-' + s.state + '"><span class="step__node" aria-hidden="true"></span>' +
        '<span class="step__body"><span class="step__name">' + (i + 1) + '. ' + esc(s.name) + '</span>' +
        '<span class="step__meta">' + kind + '<span>' + ({ done: '已完成', active: '进行中', todo: '待执行' })[s.state] + '</span></span></span>' +
        (s.kind === 'human' && s.state !== 'done' ? '<span class="step__right"><button class="btn btn--sm mx-hold" data-vlp-human="' + s.id + '" type="button"><span class="mx-hold__label">按住放行</span></button></span>' : '') +
        '</li>';
    }).join('') + '</ul>';

    var checks = v.checks;
    $('#vlpCheckMeta').textContent = checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + checks.length + ' 通过';
    $('#vlpChecks').innerHTML = '<div class="vstack">' + checks.map(function (c) {
      var tone = c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle';
      return '<div class="row' + (c.state === 'warn' ? ' ak-stripes ak-stripes--warn' : '') + '">' +
        '<span class="mx-mark is-' + tone + '" id="vcm-' + c.id + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/>' +
        '<path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/>' +
        '<path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg>' +
        '<span class="mx-mark__label">' + ({ pass: '通过', warn: '警告', idle: '未执行' })[c.state] + '</span></span>' +
        '<span class="row__main"><span class="row__t">' + esc(c.name) + '</span>' +
        '<span class="row__s">目标 ' + esc(c.target) + ' · ' + esc(c.detail) + '</span></span>' +
        '<span class="row__right"><span id="vcl-' + c.id + '"></span>' +
        (c.state === 'pass' ? '' : '<button class="btn btn--sm" data-check="' + c.id + '" type="button"><span>执行校验</span></button>') + '</span></div>';
    }).join('') + '</div>';

    checks.forEach(function (c) {
      var host = document.getElementById('vcm-' + c.id);
      if (host) X.statusMark(host, { state: c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle', label: ({ pass: '通过', warn: '警告', idle: '未执行' })[c.state] });
    });
    $$('#vlpFlowList [data-vlp-human]').forEach(function (b) {
      X.holdConfirm(b, {
        duration: 1000, label: '按住放行', doneLabel: '已放行',
        onConfirm: function () { A.advanceVlpFlow(); toast('已人工放行版本切换', '流程继续推进', { tone: 'ok' }); }
      });
    });
    wireMagnets($('#vlpCore'));
  }

  function bindVlp() {
    $('#vlpCore').addEventListener('change', function (e) {
      if (e.target.id === 'vlpVer') { A.setVlpVersion(e.target.value); toast('已切换平台版本', e.target.value, { tone: 'ok', duration: 2400 }); }
    });
    $('#vlpCore').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cpu]');
      if (b) { A.setCPU(S.vlp.cpu + (+b.dataset.cpu)); MP.sfx.play('step'); }
    });
    $('#vlpSites').addEventListener('click', function (e) {
      var p = e.target.closest('[data-site-p]'), s = e.target.closest('[data-site-s]');
      if (p) {
        if (p.dataset.siteP === S.vlp.secondarySite) { toast('主副站点不能是同一个', '请先把主站让给其它站点', { tone: 'warn' }); MP.sfx.play('warn'); return; }
        A.setSite('primary', p.dataset.siteP);
        toast('已设为主站点', (MP.byId(S.sites, p.dataset.siteP) || {}).name, { tone: 'ok', duration: 2400 });
      }
      if (s) {
        if (s.dataset.siteS === S.vlp.primarySite) { toast('不能把主站点设为副站点', '请先把另一个站点设为主站', { tone: 'warn' }); MP.sfx.play('warn'); return; }
        A.setSite('secondary', s.dataset.siteS);
        toast('已设为副站点', (MP.byId(S.sites, s.dataset.siteS) || {}).name, { tone: 'ok', duration: 2400 });
      }
    });
    $('#vlpAdvance').addEventListener('click', function () {
      stopVlp();
      A.advanceVlpFlow();
      MP.sfx.play('step');
      vlpRun();
    });
    $('#vlpReset').addEventListener('click', function () { stopVlp(); A.resetVlpFlow(); toast('已重置升级流程', '回到第一步：平台预检', { duration: 2400 }); });
    $('#vlpChecks').addEventListener('click', function (e) {
      var b = e.target.closest('[data-check]'); if (!b) return;
      var host = document.getElementById('vcl-' + b.dataset.check);
      b.remove();
      if (host) X.latticeLoader(host, { label: '校验中' });
      setTimeout(function () {
        A.runVlpCheck(b.dataset.check);
        toast('校验项已刷新', '结果更新为通过', { tone: 'ok', duration: 2400 });
      }, 950);
    });
  }

  /* 虚层升级流程的自动推进（含人机交互挂起） */
  var vlpTimer = null;
  function stopVlp() { if (vlpTimer) clearTimeout(vlpTimer); vlpTimer = null; }
  function vlpRun() {
    var v = S.vlp;
    var active = v.upgradeFlow.filter(function (s) { return s.state === 'active'; })[0];
    if (!active) return;
    if (active.kind === 'human') {
      toast('流程停在人机交互步骤', active.name + ' · 请按住「放行」继续', { tone: 'warn', duration: 6000 });
      MP.sfx.play('warn');
      return;
    }
    vlpTimer = setTimeout(function () {
      A.advanceVlpFlow();
      MP.sfx.play('step');
      vlpRun();
    }, active.kind === 'auto' ? 1200 : 1500);
  }

  /* ================================================================== 导航 */
  var navOrder = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var navNames = { mock: 'Mock 管理', flow: 'Mock 流程', ne: '网元管理', omp: '网元管理平台', lcm: '生命周期平台', vlp: '虚层管理平台' };
  var pendingOrigin = null, navLock = false;

  function renderScreenContent(name) {
    if (name === 'mock') renderMock();
    if (name === 'flow') { renderApiList(); renderStudio(); renderLogs(true); }
    if (name === 'ne') { renderNe(); wireUpgradeRun(); }
    if (name === 'omp') renderOmp();
    if (name === 'lcm') renderLcm();
    if (name === 'vlp') renderVlp();
  }

  function switchScreen(name) {
    $$('.screen').forEach(function (sc) {
      var on = sc.dataset.screen === name;
      sc.hidden = !on;
      sc.classList.toggle('is-active', on);
    });
    $$('.nav__item').forEach(function (b) {
      var on = b.dataset.nav === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderScreenContent(name);
    renderKpisFor(name);
    document.title = 'Mock 平台 · V3 · ' + navNames[name] + ' · 莱茵生命档案';
    var sc = document.querySelector('.screen[data-screen="' + name + '"]');
    if (!sc) return;
    if (pendingOrigin) { M.iris(sc, { origin: pendingOrigin }); pendingOrigin = null; }
    else M.develop(sc, { duration: 380 });
    var panels = sc.querySelectorAll('.panel, .kpi');
    if (panels.length && !M.reduced) M.stagger(panels, { each: 24, y: 10, duration: 300 });
    M.reveal(sc);
    wireMagnets(sc);
    navLock = false;
  }

  function go(name, btn) {
    if (navLock) return;
    if (S.ui.screen === name && !btn) return;
    navLock = true;
    if (btn) {
      var r = btn.getBoundingClientRect();
      var s = $('#stage').getBoundingClientRect();
      /* iris 圆心 = 导航项在舞台坐标系里的中心（从导航项展开） */
      pendingOrigin = (r.left + r.width / 2 - s.left) + 'px ' + Math.max(0, r.top + r.height / 2 - s.top) + 'px';
    }
    MP.sfx.play('iris');
    A.setScreen(name);
  }

  function bindNav() {
    $$('.nav__item').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.nav, b); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key >= '1' && e.key <= '6') go(navOrder[+e.key - 1]);
      if (e.key === 't' || e.key === 'T') switchTheme(S.ui.theme === 'archive' ? 'terminal' : 'archive');
    });
  }

  /* ============================================================== 渲染调度 */
  function renderAll() {
    renderChrome(); renderTelemetry();
    renderScreenContent(S.ui.screen);
    renderKpisFor(S.ui.screen);
  }

  MP.subscribe(function (state, evt) {
    var t = evt.type;
    if (t === 'screen') { switchScreen(state.ui.screen); return; }
    if (t === 'log') {
      renderTelemetry();
      if (state.ui.screen === 'flow') renderLogs(false);
      return;
    }
    if (t === 'stats') { renderTelemetry(); return; }
    if (t === 'select-port' || t === 'cert' || t === 'caps' || t === 'service' || t === 'ports') {
      renderTelemetry();
      if (state.ui.screen === 'mock') keepFocus(renderMock);
      renderKpisFor('mock');
      return;
    }
    if (t === 'select-api') { if (state.ui.screen === 'flow') { renderApiList(); keepFocus(renderStudio); } return; }
    if (t === 'api') return;                                   /* 本地 DOM 已是最新，重画会打断输入 */
    if (t === 'fields') { if (state.ui.screen === 'flow') renderApiList(); return; }
    if (t === 'interactions') { if (state.ui.screen === 'flow') keepFocus(renderStudio); return; }
    if (t === 'log-filter' || t === 'log-query') {
      if (state.ui.screen === 'flow') {
        keepFocus(function () {
          $('#logWrap').innerHTML = '<table class="tbl tbl--logs"><caption class="sr">请求与响应审计日志</caption><thead><tr>' +
            '<th scope="col">时间</th><th scope="col">端口</th><th scope="col">方法</th><th scope="col">路径</th><th scope="col">状态</th>' +
            '<th scope="col">时延</th><th scope="col">网元</th><th scope="col">判定</th><th scope="col"><span class="sr">操作</span></th>' +
            '</tr></thead><tbody id="logBody"></tbody></table>';
          renderLogs(true);
        });
      }
      return;
    }
    if (t === 'interaction-resolved') { if (state.ui.screen === 'flow') renderLogs(true); return; }
    if (t === 'ne' || t === 'upgrade' || t === 'validation' || t === 'group') {
      renderTelemetry();
      if (state.ui.screen === 'ne') { keepFocus(renderNe); wireUpgradeRun(); paintSteps(); }
      renderKpisFor('ne');
      return;
    }
    if (t === 'validation-run') { renderKpisFor('ne'); return; }  /* 结果本地渲染，不重画表单 */
    if (t === 'account' || t === 'deploy') {
      if (state.ui.screen === 'omp') keepFocus(renderOmp);
      if (state.ui.screen === 'lcm') keepFocus(renderLcm);
      renderKpisFor('omp'); renderKpisFor('lcm');
      return;
    }
    if (t === 'task') { if (state.ui.screen === 'omp') keepFocus(renderOmp); renderKpisFor('omp'); return; }
    if (t === 'package') { if (state.ui.screen === 'lcm') keepFocus(renderLcm); renderKpisFor('lcm'); return; }
    if (t === 'vlp') { if (state.ui.screen === 'vlp') keepFocus(renderVlp); renderKpisFor('vlp'); return; }
  });

  /* ================================================================== 启动 */
  function boot() {
    MP.btn.install();
    MP.btn.enhance(document);
    TOAST_HOST = $('#toasts');
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    applyTheme(saved === 'terminal' ? 'terminal' : 'archive');   /* 默认亮色「档案」 */
    renderChrome();
    switchScreen(S.ui.screen);
    bindNav(); bindMock(); bindFlow(); bindNe(); bindOmp(); bindLcm(); bindVlp();

    $('#sfxBtn').addEventListener('click', function () {
      var on = MP.sfx.toggle();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? '界面音效已开启' : '界面音效已关闭', on ? '合成音效与操作反馈共用同一空间感' : '静音模式下所有交互仍保留视觉反馈', { duration: 2600 });
    });
    $('#themeBtn').addEventListener('click', function () {
      switchTheme(S.ui.theme === 'archive' ? 'terminal' : 'archive');
    });

    /* 底栏点击切换流量模拟 */
    $('.ft').addEventListener('click', function (e) {
      if (e.target.closest('.ft__item--grow')) return;
      if (S.ui.running) {
        MP.sim.stop(); S.ui.running = false; $('#stSim').textContent = 'PAUSED';
        toast('已暂停流量模拟', '审计日志不再自动追加', { duration: 2200 });
      } else {
        MP.sim.start(2600); S.ui.running = true; $('#stSim').textContent = 'RUNNING';
        toast('已恢复流量模拟', '对端请求会持续进入审计日志', { tone: 'ok', duration: 2200 });
      }
    });

    MP.sim.start(2600);
    setInterval(function () { $('#clock').textContent = MP.clock(); }, 1000);
    $('#clock').textContent = MP.clock();
    M.reveal(document);
    MP.sfx.play('boot');
    console.log('%c[Mock 平台 V3 · 莱茵生命 临床档案 / 终端] 已就绪 · 6 个界面 · 数字键 1–6 切换 · T 切主题', 'color:#0098DC');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ============================================================================
 * V2 · 瑞士网格 · 编辑风 —— 视图层
 * ---------------------------------------------------------------------------
 * 数据与动作全部来自共享层（MP.*），本文件只负责：
 *   · 按 evt.type 局部更新 DOM（重画前保住焦点与滚动位置）
 *   · 用 MP.motion 做界面连续过渡（iris / carry / develop + stagger / countUp）
 *   · 用 MP.micro 的微交互原语，并把样式写在 app.css 的 .mx-* 里
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
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function statusCls(c) { var k = Math.floor(+c / 100); return k === 2 ? 's2xx' : k === 3 ? 's3xx' : k === 4 ? 's4xx' : 's5xx'; }
  function ruleTag(kind) {
    var m = MP.RULE_META[kind] || MP.RULE_META.fixed;
    var cls = m.tone === 'neutral' ? 'tag--line' : m.tone === 'accent' ? 'tag--accent' : m.tone === 'warn' ? 'tag--warn' : m.tone === 'danger' ? 'tag--err' : 'tag--ok';
    return '<span class="tag ' + cls + '">' + esc(m.name) + '</span>';
  }
  var NE_DOT = { '在线': 'dot--ok', '升级中': 'dot--warn', '离线': 'dot--idle', '未注册': 'dot--accent' };
  var IX_NAME = { 'human-confirm': '人工确认', 'captcha': '验证码', 'manual-gate': '人工闸门' };
  var STATUS_TEXT = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden',
    404: 'Not Found', 409: 'Conflict', 500: 'Server Error', 503: 'Unavailable'
  };

  /* ------------------------------------- 重画时保住焦点 / 光标 / 滚动位置 */
  var lastFocusKey = null;
  function activeKey() {
    var a = document.activeElement;
    if (!a || a === document.body || !a.getAttribute) return null;
    var k = a.id ? 'id:' + a.id : (a.dataset && a.dataset.fkey ? 'fk:' + a.dataset.fkey : null);
    if (!k && a.dataset && a.dataset.fid) k = 'ff:' + a.dataset.fid + ':' + (a.dataset.prop || a.dataset.rk) + ':' + (a.dataset.f || '');
    if (!k && a.dataset && a.dataset.nef) k = 'nf:' + a.dataset.nef;
    return k;
  }
  function resolveKey(k) {
    if (!k) return null;
    if (k.indexOf('id:') === 0) return document.getElementById(k.slice(3));
    if (k.indexOf('fk:') === 0) return document.querySelector('[data-fkey="' + k.slice(3) + '"]');
    if (k.indexOf('nf:') === 0) return document.querySelector('[data-nef="' + k.slice(3) + '"]');
    var p = k.slice(3).split(':');
    return document.querySelector('[data-fid="' + p[0] + '"][data-prop="' + p[1] + '"]') ||
      document.querySelector('[data-fid="' + p[0] + '"][data-rk="' + p[1] + '"]');
  }
  function keepFocus(fn) {
    var a = document.activeElement;
    var key = activeKey() || lastFocusKey;
    var ss = a && a.selectionStart, se = a && a.selectionEnd;
    var sx = window.scrollX, sy = window.scrollY;
    fn();
    if (key) {
      var n = resolveKey(key);
      if (n && n.focus) {
        n.focus();
        try { if (ss != null && n.setSelectionRange && n.type !== 'number') n.setSelectionRange(ss, se); } catch (e) { /* 部分类型不支持选区 */ }
      }
    }
    window.scrollTo(sx, sy);
  }
  function softRefresh() {
    lastFocusKey = activeKey();
    if (!lastFocusKey) return;
    var n = resolveKey(lastFocusKey);
    if (n) n.classList.add('is-restoring');
    setTimeout(function () { if (n) n.classList.remove('is-restoring'); }, 180);
  }

  /* ------------------------------------------------------------- 反馈工具 */
  function toast(title, desc, o) {
    o = o || {};
    X.toast($('#toasts'), {
      title: title, desc: desc, tone: o.tone, duration: o.duration || 4200,
      actionLabel: o.actionLabel, onAction: o.onAction
    });
  }
  function badge(key, v) {
    var n = document.querySelector('[data-badge="' + key + '"]');
    if (!n) return;
    n.textContent = v;
    var item = n.closest('.nav__item');
    if (item) item.classList.toggle('is-attention', (key === 'human' || key === 'vlp') && +v > 0);
  }
  function countUp(el, to, suffix, fmt) {
    if (!el) return;
    if (M.reduced) { el.textContent = (fmt ? fmt(to) : num(to)) + (suffix || ''); return; }
    M.countUp(el, to, { duration: 420, format: fmt || num, suffix: suffix || '' });
  }
  function writeKpi(name, key, v, suffix) {
    var n = document.querySelector('.screen[data-screen="' + name + '"] [data-kpi="' + key + '"]');
    if (!n) return;
    if (n.dataset.done === '1') n.textContent = num(v) + (suffix || '');
    else { n.dataset.done = '1'; countUp(n, v, suffix); }
  }
  function kpiText(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }

  function opts(arr, cur) {
    return arr.map(function (o) { return '<option' + (String(o) === String(cur) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
  }
  function segItems(items) {
    return items.map(function (i) { return { label: i[1], value: i[0] }; });
  }
  /* 只挂一次的分段控件（避免重画后 thumb 位置错乱） */
  function buildSeg(host, items, value, onChange, key) {
    if (!host || host.dataset.built === '1') return;
    host.dataset.built = '1';
    X.segmented(host, { items: items, value: value, onChange: onChange });
    if (key) host.dataset.segKey = key;
  }
  /* 惰性挂载的微交互（重画不清空容器，只在首次挂载） */
  function attachOnce(node, flag, fn) {
    if (!node || node.dataset[flag] === '1') return;
    node.dataset[flag] = '1';
    fn(node);
  }
  function sw(host, checked, label, onChange) {
    if (!host) return;
    var b = el('button', 'mx-sw');
    b.type = 'button';
    host.appendChild(b);
    X.velocitySwitch(b, { checked: !!checked, label: label, onChange: onChange });
  }
  function gauge(host, value, opts2) {
    if (!host) return null;
    return X.gauge(host, Object.assign({ value: value, unit: '%', label: '进度' }, opts2 || {}));
  }
  function mark(host, state, label) {
    if (!host) return null;
    return X.statusMark(host, { state: state, label: label });
  }

  /* ======================================================== 本地视图状态 */
  var ST = { neSel: null, neTab: 'profile', stepKind: 'auto', studio: null, draft: {}, pkgFilter: 'all', editing: false, lock: null };
  function neSel() { return MP.byId(S.nes, ST.neSel) || S.nes[0]; }
  /* 某些动作（引信撤销 / 涟漪加载 / 删除字段）不允许重画：把发起它们的界面锁住一次 emit，
     动作结束后再用 after 补一次干净的渲染（不影响按钮的引信动画） */
  function act(fn, after) {
    var prev = ST.lock;
    ST.lock = S.ui.screen;
    try { fn(); } finally { ST.lock = prev; }
    if (after) setTimeout(after, 0);
  }

  /* ============================================================== 顶栏 */
  function renderChrome() {
    var k = SEL.kpis();
    badge('ports', k.ports); badge('human', k.pendingHuman);
    badge('ne', k.ne); badge('tasks', k.tasks); badge('packages', k.packages);
    badge('vlp', S.vlp.upgradeFlow.filter(function (f) { return f.state === 'done'; }).length + '/' + S.vlp.upgradeFlow.length);
    var host = S.host.hostname + ' · ' + S.host.ip + ' / ' + S.host.alt + ' · ' + S.host.os + ' · ' + S.host.agent;
    ['hostLine', 'flowHost', 'neHost', 'ompHost', 'lcmHost', 'vlpHost'].forEach(function (id) { kpiText(id, host); });
  }
  function renderTelemetry() {
    var k = SEL.kpis();
    setNum('tkReq', k.req, ''); setNum('tkOk', k.ok, ''); setNum('tkErr', k.err, '');
    setNum('tkLat', k.avgLat, ''); setNum('tkRun', k.running, ''); setNum('tkPorts', k.ports, '');
    setNum('tkHuman', k.pendingHuman, '');
    kpiText('portCount', k.ports);
    var last = S.logs[0];
    kpiText('stLast', last ? (last.clock + ' ' + last.method + ' ' + last.path + ' → ' + last.status) : '—');
  }
  function setNum(id, v, suffix) {
    var n = document.getElementById(id);
    if (!n) return;
    if (n.dataset.done === '1') { n.textContent = num(v) + (suffix || ''); return; }
    n.dataset.done = '1';
    countUp(n, v, suffix);
  }
  function renderKpis(name) {
    var k = SEL.kpis();
    if (name === 'mock') {
      writeKpi('mock', 'ports', k.ports, '个'); writeKpi('mock', 'running', k.running, '个');
      writeKpi('mock', 'req', k.req, ''); writeKpi('mock', 'avgLat', k.avgLat, 'ms');
    } else if (name === 'flow') {
      writeKpi('flow', 'req', k.req, ''); writeKpi('flow', 'ok', k.ok, '');
      writeKpi('flow', 'err', k.err, ''); writeKpi('flow', 'pendingHuman', k.pendingHuman, '条');
    } else if (name === 'ne') {
      writeKpi('ne', 'ne', k.ne, '个'); writeKpi('ne', 'groups', k.groups, '个');
      writeKpi('ne', 'validations', S.nes.reduce(function (a, n) { return a + (n.validations || []).length; }, 0), '条');
      writeKpi('ne', 'upgrading', S.nes.filter(function (n) { return n.status === '升级中'; }).length, '个');
    } else if (name === 'omp') {
      writeKpi('omp', 'ne', k.ne, '个'); writeKpi('omp', 'accounts', k.accounts, '个');
      writeKpi('omp', 'tasks', k.tasks, '个');
      kpiText('ompCoDeploy', S.deploy.omp.coDeploy ? 'ON · 复用端点' : 'OFF · 独立端点');
    } else if (name === 'lcm') {
      writeKpi('lcm', 'packages', k.packages, '个');
      writeKpi('lcm', 'validated', S.packages.filter(function (p) { return p.validated; }).length, '个');
      writeKpi('lcm', 'ne', k.ne, '个');
      kpiText('lcmCoDeploy', S.deploy.lcmp.coDeploy ? 'ON · ' + S.deploy.omp.host : 'OFF · :9443');
    } else if (name === 'vlp') {
      kpiText('vlpVerKpi', S.vlp.version.replace('VLMP ', ''));
      writeKpi('vlp', 'cpu', S.vlp.cpu, '核');
      kpiText('vlpCheckKpi', S.vlp.checks.filter(function (c) { return c.state === 'pass'; }).length + ' / ' + S.vlp.checks.length);
      kpiText('vlpFlowKpi', S.vlp.upgradeFlow.filter(function (f) { return f.state === 'done'; }).length + ' / ' + S.vlp.upgradeFlow.length);
    }
  }

  /* ============================================================ S1 MOCK */
  function portRow(p) {
    var caps = SEL.capsOfPort(p.id);
    var dot = p.running ? 'dot--ok' : (p.cert.status === 'issued' ? 'dot--idle' : 'dot--warn');
    return '<li><button class="pick' + (p.id === S.ui.selectedPort ? ' is-active' : '') + '" data-port="' + p.id + '" type="button" aria-pressed="' + (p.id === S.ui.selectedPort) + '">' +
      '<span class="dot ' + dot + '"></span>' +
      '<span class="row__main">' +
      '<span class="port__ep">' + esc(p.ip) + ':' + p.port + '</span>' +
      '<span class="port__meta">' + esc(p.protocol) + ' · ' + esc(p.tls) + ' · ' + caps.length + ' 项能力 · ' + esc(p.createdAt) + '</span>' +
      '<span class="port__meta">' + num(p.stats.req) + ' 请求 · ' + p.stats.rps + ' rps</span>' +
      '</span>' +
      '<span class="row__right"><span class="tag ' + (p.running ? 'tag--ok' : 'tag--line') + '">' + (p.running ? 'RUNNING' : 'STOPPED') + '</span></span>' +
      '</button></li>';
  }
  function renderMock() {
    $('#portList').innerHTML = S.ports.map(portRow).join('') ||
      '<li class="empty">还没有 mock 端点，先在下方登记本机 IP 与端口</li>';

    var p = SEL.port();
    $('#pdProto').textContent = p ? p.protocol : '—';
    $('#pdPort').textContent = p ? (p.ip + ':' + p.port) : '—';
    var body = $('#portDetailBody');
    if (!p) { body.innerHTML = '<div class="empty">选择或新建一个 mock 端点</div>'; return; }

    var certHtml;
    if (p.cert.status === 'issued') {
      certHtml =
        '<div class="hstack"><span id="certMark"></span><b class="mono">' + esc(p.cert.cn) + '</b><span class="tag tag--ok">已签发</span></div>' +
        '<div class="fgrid">' +
        profileCard('有效期', p.cert.days + ' 天') + profileCard('签发时间', esc(p.cert.issuedAt)) +
        profileCard('签发机构', esc(p.cert.issuer)) + profileCard('指纹', '<span class="mono" style="font-size:12px">' + esc(p.cert.fingerprint) + '</span>') +
        '</div>' +
        '<div class="facts">' +
        '<button class="btn btn--sm" data-act="cert-download" type="button">导出证书文件（PEM）</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="cert-reissue" type="button">重新签发</button>' +
        '<span class="note">对端用该证书校验本 mock 端点的 TLS 身份</span>' +
        '</div>';
    } else {
      certHtml =
        '<div class="hstack"><span id="certMark"></span><b>尚未签发证书</b><span class="tag tag--err">TLS 未就绪</span></div>' +
        '<div class="f2">' +
        '<label class="field"><span class="flabel">证书 CN</span><input class="input" id="certCn" data-fkey="certCn" value="' + esc('mock-' + p.port + '.' + p.ip) + '" /></label>' +
        '<label class="field"><span class="flabel">有效期</span><select class="input" id="certDays"><option>90</option><option selected>365</option><option>730</option></select></label>' +
        '</div>' +
        '<div class="facts"><span id="certGen"></span><span class="note">签发后可挂载能力并启动服务</span></div>';
    }

    var capChips = S.caps.map(function (c) {
      var on = p.caps.indexOf(c.id) >= 0;
      return '<button class="chk' + (on ? ' is-on' : '') + '" data-cap="' + c.id + '" type="button" aria-pressed="' + on + '">' +
        esc(c.name) + ' <em>' + c.code + ' ' + c.version + '</em><em>' + c.endpoints + ' EP</em></button>';
    }).join('');

    body.innerHTML =
      '<div class="fgrid">' +
      profileCard('协议 / TLS', esc(p.protocol) + ' · ' + esc(p.tls)) +
      profileCard('请求 / 成功 / 异常', num(p.stats.req) + ' / ' + num(p.stats.ok) + ' / ' + num(p.stats.err)) +
      profileCard('当前 RPS', String(p.stats.rps)) +
      profileCard('备注', esc(p.note)) +
      '</div>' +
      '<div class="hr"></div>' +
      '<h3 class="flabel">① 证书文件</h3>' + certHtml +
      '<div class="hr"></div>' +
      '<h3 class="flabel">② 挂载平台能力（6 选 N · 可卸载）</h3>' +
      '<div class="checks">' + capChips + '</div>' +
      '<div class="hr"></div>' +
      '<h3 class="flabel">③ MOCK 服务</h3>' +
      '<div class="hstack" id="svcBox"></div>';

    if (p.cert.status === 'issued') mark($('#certMark'), 'done', '证书有效 ' + p.cert.days + ' 天');
    else mark($('#certMark'), 'error', '未签发');
    if ($('#certGen')) {
      var gen = el('button', 'btn btn--primary mx-magnetic', '<span class="mx-hold__label">为 ' + esc(p.ip) + ':' + p.port + ' 生成证书</span>');
      gen.type = 'button'; gen.id = 'certGenBtn'; gen.dataset.act = 'cert-gen';
      $('#certGen').appendChild(gen);
      X.magnetic(gen, { strength: 0.16 });
    }

    var box = $('#svcBox');
    var sm = el('span'); box.appendChild(sm);
    mark(sm, p.running ? 'done' : 'idle', p.running ? '服务运行中' : '服务已停止');

    if (p.running) {
      var stop = el('button', 'btn btn--danger');
      stop.type = 'button'; stop.dataset.stop = p.id;
      box.appendChild(stop);
      X.fuseButton(stop, {
        label: '停止服务', doneLabel: '已停止', undoWindow: 4200,
        onCommit: function () {
          act(function () { A.stopService(p.id); });
          toast('已停止 mock 服务', ':' + p.port + ' 不再接收请求，4 秒内可撤销', {
            tone: 'warn', actionLabel: '撤销',
            onAction: function () { A.startService(p.id); toast('已恢复服务', ':' + p.port + ' 重新接收请求', { tone: 'ok', duration: 2600 }); }
          });
        },
        onUndo: function () { A.startService(p.id); toast('已撤销停止', ':' + p.port + ' 继续运行', { tone: 'ok', duration: 2600 }); }
      });
    } else {
      var startBtn = el('button', 'btn btn--primary');
      startBtn.type = 'button'; startBtn.id = 'startSvcBtn';
      startBtn.innerHTML = '<span class="mx-hold__label">按住启动 MOCK 服务</span>';
      startBtn.disabled = p.cert.status !== 'issued' || !p.caps.length;
      box.appendChild(startBtn);
      X.holdConfirm(startBtn, {
        duration: 1000, label: '按住启动 MOCK 服务', doneLabel: '服务已启动',
        onConfirm: function () {
          A.startService(p.id);
          toast('MOCK 服务已启动', p.ip + ':' + p.port + ' · ' + SEL.capsOfPort(p.id).map(function (c) { return c.name; }).join(' / '), { tone: 'ok' });
        }
      });
      if (startBtn.disabled) {
        box.appendChild(el('span', 'note', p.cert.status !== 'issued' ? '需先签发证书' : '需至少挂载一项平台能力'));
      }
    }
    var del = el('button', 'btn btn--sm btn--ghost right');
    del.type = 'button';
    box.appendChild(del);
    X.fuseButton(del, {
      label: '删除端口', doneLabel: '已删除', undoWindow: 3200,
      onCommit: function () {
        var backup = JSON.parse(JSON.stringify(p));
        act(function () { A.removePort(p.id); });
        toast('已删除端点', backup.ip + ':' + backup.port, {
          tone: 'danger', actionLabel: '撤销',
          onAction: function () {
            S.ports.push(backup); S.ui.selectedPort = backup.id;
            MP.emit({ type: 'ports', action: 'restore' });
            toast('已恢复端点', backup.ip + ':' + backup.port, { tone: 'ok', duration: 2600 });
          }
        });
      }
    });
  }
  function profileCard(k, v) {
    return '<div class="preview"><span class="preview__k">' + k + '</span><span class="preview__v">' + v + '</span></div>';
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
        if (p.caps.indexOf(id) >= 0) A.detachCap(p.id, id); else A.attachCap(p.id, id);
        MP.sfx.play('toggle');
        return;
      }
      var actEl = e.target.closest('[data-act]');
      if (!actEl) return;
      if (actEl.dataset.act === 'cert-gen') {
        var cn = ($('#certCn') || {}).value || ('mock-' + p.port + '.' + p.ip);
        var days = +($('#certDays') || {}).value || 365;
        var done = MP.btn.loading(actEl, '签发中');   // 技能规则：>300ms 异步在按钮上给 loading
        setTimeout(function () {
          act(function () { A.generateCert(p.id, { cn: cn, days: days }); }, function () { keepFocus(renderMock); });
          done();
          toast('证书已签发', cn + ' · 有效期 ' + days + ' 天', { tone: 'ok' });
          MP.sfx.play('confirm');
        }, 620);
        return;
      }
      if (actEl.dataset.act === 'cert-download') {
        var pem = '-----BEGIN CERTIFICATE-----\n' +
          btoa(unescape(encodeURIComponent(p.cert.cn + '|' + p.cert.fingerprint + '|' + p.cert.days))).replace(/(.{64})/g, '$1\n') +
          '\n-----END CERTIFICATE-----\n';
        var blob = new Blob([pem], { type: 'application/x-pem-file' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = p.cert.cn + '.crt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('证书文件已导出', a.download + '（PEM · X.509 指纹 ' + p.cert.fingerprint + '）', { tone: 'ok' });
        return;
      }
      if (actEl.dataset.act === 'cert-reissue') {
        A.generateCert(p.id, { cn: p.cert.cn, days: p.cert.days });
        toast('已重新签发证书', p.cert.cn + ' · 指纹已更新', { tone: 'ok' });
      }
    });

    var ipSel = $('#pfIp');
    ipSel.innerHTML = [S.host.ip, S.host.alt, '__custom__'].map(function (v) {
      return '<option value="' + v + '">' + (v === '__custom__' ? '手动输入…' : v + '（本机网卡）') + '</option>';
    }).join('');
    var custom = $('#pfIpCustom');
    ipSel.addEventListener('change', function () {
      custom.hidden = ipSel.value !== '__custom__';
      if (!custom.hidden) custom.focus();
    });

    $('#portForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var ip = ipSel.value === '__custom__' ? (custom.value || '').trim() : ipSel.value;
      var port = parseInt($('#pfPort').value, 10);
      var errEl = $('#pfPortErr'), msg = '';
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) msg = '请输入合法的 IPv4 地址（四段 0–255）';
      else if (!(port >= 1024 && port <= 65535)) msg = '端口范围校验：需在 1024–65535 之间';
      else if (S.ports.some(function (p) { return p.ip === ip && p.port === port; })) msg = '该 IP:端口已被注册，请换一个';
      errEl.hidden = !msg;
      errEl.textContent = msg;
      $('#pfPort').closest('.field').classList.toggle('is-invalid', !!msg);
      if (msg) { MP.sfx.play('warn'); $('#pfPort').focus(); return; }
      var p = A.registerPort({ ip: ip, port: port, protocol: $('#pfProto').value, tls: $('#pfTls').value });
      MP.sfx.play('confirm');
      toast('已注册 mock 端点', p.ip + ':' + p.port + ' — 下一步：签发证书 → 挂载平台能力 → 启动服务', { tone: 'ok', duration: 5200 });
    });
  }

  /* ============================================================ S2 FLOW */
  function renderApiList() {
    var html = '';
    S.caps.forEach(function (c) {
      var apis = SEL.apisOfCap(c.id);
      if (!apis.length) return;
      html += '<div class="row" style="border-bottom:1px solid var(--primary);padding-left:0"><span class="dot" style="background:hsl(' + c.hue + ' 80% 45%)"></span>' +
        '<span class="row__main"><span class="row__t"><b>' + esc(c.name) + '</b></span>' +
        '<span class="row__s"><span>' + c.code + ' · ' + c.version + ' · ' + c.endpoints + ' 个端点</span></span></span></div>';
      apis.forEach(function (a) {
        html += '<button class="pick' + (a.id === S.ui.selectedApi ? ' is-active' : '') + '" data-api="' + a.id + '" type="button" aria-pressed="' + (a.id === S.ui.selectedApi) + '">' +
          '<span class="row__main">' +
          '<span class="row__t"><span class="tag tag--line">' + a.method + '</span><b class="mono" style="font-size:13.5px">' + esc(a.path) + '</b></span>' +
          '<span class="row__s"><span>' + esc(a.name) + '</span><span>' + a.delayMs + ' ms</span><span>' + a.fields.length + ' 字段</span>' +
          '<span>' + num(a.hits) + ' 次命中</span>' + (a.interactions.length ? '<span class="tag tag--accent">含人机交互</span>' : '') + '</span>' +
          '</span></button>';
      });
    });
    $('#apiList').innerHTML = html || '<div class="empty">暂无接口</div>';
  }
  function syncDraft(api) {
    if (!ST.studio || ST.studio !== api.id) {
      ST.studio = api.id;
      ST.draft = { name: api.name, desc: api.desc, status: api.status, delayMs: api.delayMs };
    }
  }
  function applyDraft(api) {
    var d = ST.draft;
    if (d.name !== api.name || d.desc !== api.desc) A.updateApi(api.id, { name: d.name, desc: d.desc });
  }
  function fieldParamHtml(f, api) {
    var r = f.rule || { kind: 'fixed' };
    if (r.kind === 'increment') {
      return '<label class="field"><span class="flabel">起始值</span><input class="input" type="number" data-f="' + f.id + '" data-rk="start" data-fkey="rs-' + f.id + '" value="' + (r.start || 1) + '" /></label>' +
        '<label class="field"><span class="flabel">步长</span><input class="input" type="number" data-f="' + f.id + '" data-rk="step" data-fkey="rp-' + f.id + '" value="' + (r.step || 1) + '" /></label>' +
        '<label class="field"><span class="flabel">编号格式</span><input class="input" data-f="' + f.id + '" data-rk="pattern" data-fkey="rn-' + f.id + '" value="' + esc(r.pattern || '') + '" placeholder="GNB-HZ-{n:04}" /></label>';
    }
    if (r.kind === 'once') {
      return '<label class="field"><span class="flabel">生效次数</span><input class="input" type="number" data-f="' + f.id + '" data-rk="times" data-fkey="rt-' + f.id + '" value="' + (r.times || 1) + '" /></label>' +
        '<label class="field"><span class="flabel">兜底值</span><input class="input" data-f="' + f.id + '" data-rk="fallback" data-fkey="rf-' + f.id + '" value="' + esc(r.fallback || '') + '" placeholder="EXPIRED" /></label>';
    }
    if (r.kind === 'conditional') {
      var keys = api.fields.filter(function (x) { return x.key !== f.key; }).map(function (x) { return x.key; });
      var when = r.when || {};
      return '<label class="field"><span class="flabel">条件字段</span><select class="input" data-f="' + f.id + '" data-rk="when.key"' + (keys.length ? '' : ' disabled') + '>' +
        (keys.length ? keys.map(function (k) { return '<option' + (k === when.key ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') : '<option>（无上游字段）</option>') + '</select></label>' +
        '<label class="field"><span class="flabel">操作符</span><select class="input" data-f="' + f.id + '" data-rk="when.op">' + opts(['等于', '包含', '非空', '末尾为偶数'], when.op || '等于') + '</select></label>' +
        '<label class="field"><span class="flabel">命中时</span><input class="input" data-f="' + f.id + '" data-rk="then" data-fkey="rc-' + f.id + '" value="' + esc(r.then || '') + '" /></label>' +
        '<label class="field"><span class="flabel">否则</span><input class="input" data-f="' + f.id + '" data-rk="else" data-fkey="re-' + f.id + '" value="' + esc(r.else || '') + '" /></label>';
    }
    if (r.kind === 'random') {
      return '<label class="field"><span class="flabel">随机候选（逗号分隔）</span><input class="input" data-f="' + f.id + '" data-rk="options" data-fkey="ro-' + f.id + '" value="' + esc((f.options || []).join(',')) + '" placeholder="a,b,c" /></label>';
    }
    return '<span class="note">固定值：每次都返回同一个值，无额外参数</span>';
  }
  function fieldCard(f, api, i) {
    var r = f.rule || { kind: 'fixed' };
    var valueCell = f.source === 'select'
      ? '<select class="input" data-fid="' + f.id + '" data-prop="value">' + (f.options || []).map(function (o) { return '<option' + (String(o) === String(f.value) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
      : '<input class="input" data-fid="' + f.id + '" data-prop="value" data-fkey="fv-' + f.id + '" value="' + esc(f.value) + '" />';
    return '<div class="fcard">' +
      '<div class="fcard__h">' +
      '<span class="fcard__n">字段 ' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="grow"></span>' +
      ruleTag(r.kind) +
      '<button class="iconbtn" data-del-field="' + f.id + '" type="button" aria-label="删除字段 ' + esc(f.key) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button>' +
      '</div>' +
      '<div class="fcard__b">' +
      '<div class="fgrid">' +
      '<label class="field"><span class="flabel">字段路径</span><input class="input" data-fid="' + f.id + '" data-prop="key" data-fkey="fk-' + f.id + '" value="' + esc(f.key) + '" placeholder="data.neId" /></label>' +
      '<label class="field"><span class="flabel">类型</span><select class="input" data-fid="' + f.id + '" data-prop="type">' + opts(S.fieldTypes, f.type) + '</select></label>' +
      '<label class="field"><span class="flabel">取值方式</span><select class="input" data-fid="' + f.id + '" data-prop="source">' +
      '<option value="manual"' + (f.source === 'manual' ? ' selected' : '') + '>手工填写</option>' +
      '<option value="select"' + (f.source === 'select' ? ' selected' : '') + '>下拉选择</option></select></label>' +
      '<label class="field"><span class="flabel">字段值</span>' + valueCell + '</label>' +
      '</div>' +
      '<div class="fgrid">' +
      '<label class="field"><span class="flabel">生效规则</span><select class="input" data-fid="' + f.id + '" data-prop="rulekind">' +
      Object.keys(MP.RULE_META).map(function (k) { return '<option value="' + k + '"' + (k === r.kind ? ' selected' : '') + '>' + MP.RULE_META[k].name + ' · ' + MP.RULE_META[k].hint + '</option>'; }).join('') +
      '</select></label>' +
      fieldParamHtml(f, api) +
      '</div>' +
      '<div class="row__s"><span><input type="checkbox" data-fid="' + f.id + '" data-prop="required"' + (f.required ? ' checked' : '') + ' aria-label="是否为必填字段" /> 必填</span>' +
      '<span>说明：' + esc(f.desc || '—') + '</span><span>已命中 ' + num(api.hits) + ' 次</span></div>' +
      '</div></div>';
  }
  function previewHtml(api) {
    var d = ST.draft;
    var lines = api.fields.map(function (f) {
      var r = f.rule || { kind: 'fixed' };
      return '  "' + f.key + '": "' + (f.source === 'select' ? f.value : (f.value || '')) + '"   // ' + (MP.RULE_META[r.kind] || {}).name;
    }).join('\n');
    return '<div class="preview">' +
      '<span class="preview__k">响应预览 · 定制后每次命中都会按规则求值</span>' +
      '<span class="preview__v">HTTP ' + d.status + ' ' + (STATUS_TEXT[d.status] || '') + ' · 延迟 ' + d.delayMs + ' ms · 第 ' + (api.hits + 1) + ' 次命中\n{\n' + esc(lines) + '\n}</span>' +
      '</div>';
  }
  function renderStudio() {
    var a = SEL.api();
    var box = $('#respStudio');
    if (!a) {
      box.innerHTML = '<div class="empty">先选择一个接口</div>';
      $('#apiTools').innerHTML = '';
      return;
    }
    syncDraft(a);
    $('#apiTools').innerHTML = '<span class="tag tag--line">' + a.method + ' ' + esc(a.path) + '</span>' +
      '<span class="panel__meta">命中 <b>' + num(a.hits) + '</b> 次</span>';

    var ixHtml = a.interactions.map(function (ix) {
      var tone = ix.kind === 'human-confirm' ? 'tag--accent' : ix.kind === 'captcha' ? 'tag--warn' : 'tag--err';
      return '<div class="row"><span class="row__main"><span class="row__t"><span class="tag ' + tone + '">' + (IX_NAME[ix.kind] || ix.kind) + '</span><b>' + esc(ix.label) + '</b></span>' +
        '<span class="row__s"><span>负责人 ' + esc(ix.owner) + '</span><span>超时 ' + ix.timeoutS + ' s</span><span>命中后返回 202 并等待人工处置</span></span></span>' +
        '<button class="iconbtn" data-del-ix="' + ix.id + '" type="button" aria-label="移除人机交互 ' + esc(ix.label) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></div>';
    }).join('') || '<div class="empty">未插入人机交互：命中该接口时直接返回定制响应</div>';

    box.innerHTML =
      '<div class="fgrid">' +
      '<label class="field"><span class="flabel">接口名称</span><input class="input" id="apiName" data-fkey="apiName" value="' + esc(ST.draft.name) + '" /></label>' +
      '<label class="field"><span class="flabel">HTTP Status Code</span><select class="input" id="apiStatus">' +
      [200, 201, 202, 400, 403, 404, 409, 500, 503].map(function (s) {
        return '<option value="' + s + '"' + (s === ST.draft.status ? ' selected' : '') + '>' + s + ' ' + STATUS_TOP(s) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="field"><span class="flabel">响应延迟（拖拽 / ←→ 方向键）</span><div id="delayScrub"></div></div>' +
      '<label class="field"><span class="flabel">接口说明</span><input class="input" data-fkey="apiDesc" value="' + esc(ST.draft.desc) + '" placeholder="对端网元上电后注册到平台" /></label>' +
      '</div>' +
      previewHtml(a) +
      '<div class="hr"></div>' +
      '<div class="hstack"><h3 class="flabel">响应字段（面向对象定制）</h3>' +
      '<span class="note">部分下拉选、部分手填；每个字段可单独设生效规则</span>' +
      '<button class="btn btn--sm right" id="addFieldBtn" type="button">+ 新增字段</button></div>' +
      '<div class="rows" id="fieldList">' + a.fields.map(function (f, i) { return fieldCard(f, a, i); }).join('') + '</div>' +
      '<div class="hr"></div>' +
      '<div class="hstack"><h3 class="flabel">人机交互</h3><span class="note">在自动链路中间插入需要人操作的环节，日志里可放行 / 拒绝</span></div>' +
      '<div class="rows">' + ixHtml + '</div>' +
      '<div class="facts"><span class="flabel">插入类型</span><span id="ixAdd"></span>' +
      '<button class="btn btn--primary right" id="triggerBtn" type="button">手动触发一次请求</button></div>';

    var dhost = $('#delayScrub');
    if (dhost) {
      X.scrub(dhost, {
        label: '延迟', value: ST.draft.delayMs, min: 0, max: 3000, step: 10, suffix: ' ms',
        onChange: function (v) { ST.draft.delayMs = v; A.updateApi(a.id, { delayMs: v }); }
      });
    }
    var ihost = $('#ixAdd');
    if (ihost) {
      X.segmented(ihost, {
        items: segItems([['human-confirm', '人工确认'], ['captcha', '验证码'], ['manual-gate', '人工闸门']]),
        onChange: function (v) { A.addInteraction(a.id, v); toast('已插入人机交互', (IX_NAME[v] || v) + ' · 命中后请求会挂起等待人工处置', { tone: 'ok' }); }
      });
    }
  }
  function STATUS_TOP(s) { return (STATUS_TEXT[s] || '').toUpperCase(); }

  function applyRuleParam(api, fid, rk, raw) {
    var f = MP.byId(api.fields, fid); if (!f) return;
    if (rk === 'options') {
      A.updateField(api.id, fid, { options: String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
      return;
    }
    if (rk.indexOf('when.') === 0) {
      var when = Object.assign({}, (f.rule || {}).when || {});
      when[rk.split('.')[1]] = raw;
      A.updateField(api.id, fid, { rule: { when: when } });
      return;
    }
    var patch = {}; patch[rk] = /^-?\d+$/.test(String(raw)) ? parseInt(raw, 10) : raw;
    A.updateField(api.id, fid, { rule: patch });
  }
  function refreshWhenKeys(api, fid) {
    var f = MP.byId(api.fields, fid); if (!f || (f.rule || {}).kind !== 'conditional') return;
    var sel = document.querySelector('[data-f="' + fid + '"][data-rk="when.key"]');
    if (!sel) return;
    var cur = (f.rule.when || {}).key;
    var keys = api.fields.filter(function (x) { return x.id !== fid; }).map(function (x) { return x.key; });
    sel.innerHTML = keys.map(function (k) { return '<option' + (k === cur ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
  }

  function bindFlow() {
    $('#apiList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-api]'); if (!b) return;
      A.selectApi(b.dataset.api); MP.sfx.play('step');
    });
    $('#respStudio').addEventListener('input', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target, fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (t.id === 'apiName') { ST.draft.name = t.value; applyDraft(a); return; }
      if (t.dataset.fkey === 'apiDesc') { ST.draft.desc = t.value; applyDraft(a); return; }
      if (fid && prop === 'key') { A.updateField(a.id, fid, { key: t.value }); refreshWhenKeys(a, fid); return; }
      if (fid && prop === 'value') { A.updateField(a.id, fid, { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a, rf, rk, t.value); return; }
    });
    $('#respStudio').addEventListener('change', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target, fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (t.id === 'apiStatus') {
        ST.draft.status = +t.value;
        A.updateApi(a.id, { status: +t.value });
        renderApiList();
        toast('已更新状态码', t.value + ' ' + STATUS_TOP(+t.value) + ' · 该接口命中后返回此状态', { tone: 'ok', duration: 2600 });
        return;
      }
      if (fid && prop === 'source') { A.updateField(a.id, fid, { source: t.value }); softRefresh(); renderStudio(); return; }
      if (fid && prop === 'type') { A.updateField(a.id, fid, { type: t.value }); return; }
      if (fid && prop === 'required') { A.updateField(a.id, fid, { required: t.checked }); return; }
      if (fid && prop === 'rulekind') { A.updateField(a.id, fid, { rule: { kind: t.value } }); softRefresh(); renderStudio(); return; }
      if (fid && prop === 'value') { A.updateField(a.id, fid, { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a, rf, rk, t.value); refreshWhenKeys(a, rf); return; }
    });
    $('#respStudio').addEventListener('click', function (e) {
      var a = SEL.api(); if (!a) return;
      var del = e.target.closest('[data-del-field]');
      if (del) {
        var f = MP.byId(a.fields, del.dataset.delField);
        act(function () { A.removeField(a.id, del.dataset.delField); }, function () { renderApiList(); renderStudio(); });
        MP.sfx.play('undo');
        toast('已删除字段', f ? f.key : '', {
          tone: 'danger', actionLabel: '撤销',
          onAction: function () {
            if (!f) return;
            a.fields.push(f);
            MP.emit({ type: 'fields', apiId: a.id, action: 'restore' });
            toast('已恢复字段', f.key, { tone: 'ok', duration: 2400 });
          }
        });
        return;
      }
      var dix = e.target.closest('[data-del-ix]');
      if (dix) {
        A.removeInteraction(a.id, dix.dataset.delIx);
        MP.sfx.play('undo');
        toast('已移除人机交互', '该接口命中后将直接返回定制响应', { duration: 2800 });
        return;
      }
      if (e.target.closest('#addFieldBtn')) {
        ST.editing = true;
        var nf = A.addField(a.id);
        ST.editing = false;
        renderStudio();
        var input = document.querySelector('[data-fid="' + nf.id + '"][data-prop="key"]');
        if (input) { input.focus(); input.select(); }
        toast('已新增字段', '填入字段路径与取值方式即可生效', { duration: 2600 });
        return;
      }
      if (e.target.closest('#triggerBtn')) {
        var log = A.triggerApi(a.id);
        var notes = ((log.res && log.res.notes) || []).map(function (n) { return n.key + ' = ' + n.value + '（' + n.note + '）'; });
        toast('已触发 ' + a.method + ' ' + a.path,
          notes.slice(0, 3).join(' · ') + (notes.length > 3 ? ' 等 ' + notes.length + ' 项字段' : ''), { tone: 'ok', duration: 6500 });
        MP.sfx.play('confirm');
        renderApiList();
      }
    });
  }

  function logRow(l) {
    var tr = el('tr');
    tr.dataset.log = l.id;
    var pending = l.interaction && l.interaction.status === 'pending';
    var port = MP.byId(S.ports, l.portId);
    tr.innerHTML =
      '<td class="mono">' + esc(l.clock) + '</td>' +
      '<td class="mono">' + esc(port ? port.port : '—') + '</td>' +
      '<td class="mono">' + esc(l.method) + '</td>' +
      '<td class="mono">' + esc(l.path) + '</td>' +
      '<td><span class="status-code ' + statusCls(l.status) + '">' + l.status + '</span></td>' +
      '<td class="mono">' + l.latencyMs + ' ms</td>' +
      '<td class="mono">' + esc(l.ne) + '</td>' +
      '<td>' + (pending
        ? '<span class="tag tag--accent">待人工 · ' + esc(l.interaction.label || '') + '</span>'
        : '<span class="row__s">' + esc(l.verdict) + '</span>') + '</td>' +
      '<td class="right">' + (pending
        ? '<button class="btn btn--sm" data-approve type="button">放行</button> <button class="btn btn--sm btn--danger" data-reject type="button">拒绝</button>'
        : '<button class="btn btn--sm btn--ghost" data-replay type="button">重放</button>') + '</td>';
    return tr;
  }
  function logExpand(l) {
    if (!l) return null;
    var tr = el('tr', 'exp');
    var notes = (l.res && l.res.notes) ? '<div class="rule-notes">' + l.res.notes.map(function (n) {
      return '<span class="rule-note"><b>' + esc(n.key) + '</b><span>= ' + esc(n.value) + '</span><i>规则 ' + esc(n.rule) + '</i><i>' + esc(n.note) + '</i></span>';
    }).join('') + '</div>' : '<span class="note">本次未走字段规则引擎（LOCAL 动作日志）</span>';
    tr.innerHTML = '<td colspan="9"><div class="cols2">' +
      '<div><h4>REQUEST</h4><pre>' + esc(JSON.stringify(l.req || {}, null, 2)) + '</pre></div>' +
      '<div><h4>RESPONSE</h4><pre>' + esc(JSON.stringify(l.res || { status: l.status, verdict: l.verdict }, null, 2)) + '</pre></div>' +
      '</div><div class="hr" style="margin:16px 0"></div><h4>规则命中说明</h4>' + notes + '</td>';
    return tr;
  }
  function renderLogs(full) {
    var body = $('#logBody');
    if (!body) return;
    if (full) {
      var list = SEL.logsFiltered();
      body.innerHTML = '';
      if (!list.length) {
        body.innerHTML = '<tr class="exp"><td colspan="9"><div class="empty">没有符合条件的请求</div></td></tr>';
        return;
      }
      list.slice(0, 120).forEach(function (l) {
        var tr = logRow(l);
        if (S.ui.logQuery && (l.path + l.verdict + l.ne).toLowerCase().indexOf(S.ui.logQuery.toLowerCase()) >= 0) tr.classList.add('is-open');
        body.appendChild(tr);
      });
      return;
    }
    var l = S.logs[0];
    if (!l) return;
    var f = S.ui.logFilter;
    if (f === 'ok' && l.status >= 400) return;
    if (f === 'err' && l.status < 400) return;
    if (f === 'human' && !l.interaction) return;
    var q = (S.ui.logQuery || '').toLowerCase();
    if (q && (l.path + l.verdict + l.ne).toLowerCase().indexOf(q) < 0) return;
    var empty = body.querySelector('.empty');
    if (empty) body.innerHTML = '';
    var tr = logRow(l);
    tr.classList.add('is-new');
    body.insertBefore(tr, body.firstChild);
    setTimeout(function () { tr.classList.remove('is-new'); }, 420);
    while (body.children.length > 120) body.removeChild(body.lastChild);
  }
  function renderLogHead() {
    var wrap = $('#logWrap');
    if (!wrap) return;
    wrap.innerHTML = '<table class="tbl"><thead><tr>' +
      '<th scope="col">时间</th><th scope="col">端口</th><th scope="col">方法</th><th scope="col">路径</th>' +
      '<th scope="col">状态</th><th scope="col">时延</th><th scope="col">网元</th><th scope="col">判定 / 人机</th>' +
      '<th scope="col"><span class="sr">操作</span></th></tr></thead><tbody id="logBody"></tbody></table>';
  }
  function bindFlowLog() {
    buildSeg($('#logFilter'), segItems([['all', '全部'], ['ok', '成功'], ['err', '异常'], ['human', '待人工']]), 'all', function (v) {
      A.setLogFilter(v);
    });
    $('#logQuery').addEventListener('input', function (e) { A.setLogQuery(e.target.value); });
    $('#logWrap').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-log]'); if (!tr) return;
      var id = tr.dataset.log;
      if (e.target.closest('[data-approve]')) { A.resolveInteraction(id, 'approve'); MP.sfx.play('confirm'); toast('已人工放行', '请求继续执行，交互环节记入审计', { tone: 'ok' }); return; }
      if (e.target.closest('[data-reject]')) { A.resolveInteraction(id, 'reject'); MP.sfx.play('warn'); toast('已人工拒绝', '请求被终止并返回 403', { tone: 'danger' }); return; }
      if (e.target.closest('[data-replay]')) {
        var log = MP.byId(S.logs, id); if (!log) return;
        var api = S.apis.filter(function (x) { return x.path === log.path; })[0];
        if (api) { A.triggerApi(api.id); MP.sfx.play('confirm'); toast('已重放请求', log.method + ' ' + log.path + ' · 规则引擎重新求值', { duration: 2800 }); renderApiList(); }
        else toast('该路径没有匹配的定制接口', log.path, { tone: 'warn' });
        return;
      }
      tr.classList.toggle('is-open');
      var next = tr.nextElementSibling;
      if (next && next.classList.contains('exp')) { next.remove(); MP.sfx.play('step'); return; }
      var ex = logExpand(MP.byId(S.logs, id));
      if (ex) tr.insertAdjacentElement('afterend', ex);
      MP.sfx.play('step');
    });
  }

  /* ============================================================== S3 NE */
  function renderNeList() {
    var n = neSel();
    if (n) ST.neSel = n.id;
    $('#neList').innerHTML = S.nes.map(function (x) {
      var g = x.group ? (SEL.group(x.group) || {}).name : '';
      return '<button class="pick' + (n && x.id === n.id ? ' is-active' : '') + '" data-ne="' + x.id + '" type="button" aria-pressed="' + !!(n && x.id === n.id) + '">' +
        '<span class="dot ' + (NE_DOT[x.status] || 'dot--idle') + '"></span>' +
        '<span class="row__main"><span class="row__t"><b>' + esc(x.name) + '</b><span class="tag tag--line">' + esc(x.code) + '</span></span>' +
        '<span class="row__s"><span>' + esc(x.type) + '</span><span>' + esc(x.arch) + '</span><span>V' + esc(x.version) + '</span>' +
        '<span>' + esc(x.vendor) + '</span><span>' + (g ? esc(g) : '未成组') + '</span></span></span></button>';
    }).join('') || '<div class="empty">暂无网元，点「新建」开始</div>';

    $('#groupList').innerHTML = S.groups.map(function (g) {
      return '<div class="row"><span class="row__main"><span class="row__t"><b>' + esc(g.name) + '</b></span>' +
        '<span class="row__s"><span>' + esc(g.strategy) + '</span><span>' + g.members.length + ' 个成员</span><span>' + esc(g.desc) + '</span></span></span>' +
        '<span class="row__right">' + g.members.map(function (m) {
          var x = MP.byId(S.nes, m);
          return '<span class="tag tag--line">' + esc(x ? x.code : m) + '</span>';
        }).join('') + '</span></div>';
    }).join('') || '<div class="empty">暂无网元组</div>';
  }
  function renderNeBody() {
    var n = neSel();
    var body = $('#neBody');
    if (!n) { body.innerHTML = '<div class="empty">先新建一个网元</div>'; $('#neDetailTitle').textContent = '网元详情'; $('#neTools').innerHTML = ''; return; }
    ST.neSel = n.id;
    $('#neDetailTitle').textContent = n.name;
    $('#neTools').innerHTML = '<span class="tag tag--line">' + esc(n.code) + '</span><span class="tag tag--line">' + esc(n.model) + '</span>' +
      '<span class="tag ' + (n.status === '在线' ? 'tag--ok' : n.status === '升级中' ? 'tag--warn' : 'tag--line') + '">' + esc(n.status) + '</span>';

    if (ST.neTab === 'profile') {
      body.innerHTML =
        '<div class="fgrid">' +
        '<label class="field"><span class="flabel">网元名称</span><input class="input" data-nef="name" data-fkey="ne-name" value="' + esc(n.name) + '" /></label>' +
        '<label class="field"><span class="flabel">网元编号</span><input class="input mono" data-nef="code" data-fkey="ne-code" value="' + esc(n.code) + '" /><em class="fhint">用于参数校验，格式 ' + esc(n.code) + '-区号-四位序号</em></label>' +
        '<label class="field"><span class="flabel">网元类型</span><select class="input" data-nef="type">' + opts(S.neTypes, n.type) + '</select></label>' +
        '<label class="field"><span class="flabel">架构</span><select class="input" data-nef="arch">' + opts(S.arches, n.arch) + '</select></label>' +
        '<label class="field"><span class="flabel">厂商</span><select class="input" data-nef="vendor">' + opts(S.vendors, n.vendor) + '</select></label>' +
        '<label class="field"><span class="flabel">型号</span><input class="input mono" value="' + esc(n.model) + '" readonly /></label>' +
        '</div>' +
        '<div class="hr"></div>' +
        '<h3 class="flabel">版本与软件</h3>' +
        '<div class="fgrid">' +
        '<label class="field"><span class="flabel">当前版本</span><input class="input mono" data-nef="version" data-fkey="ne-ver" value="' + esc(n.version) + '" /></label>' +
        '<label class="field"><span class="flabel">使用软件名称</span><input class="input mono" data-nef="softName" data-fkey="ne-soft" value="' + esc(n.softName) + '" /></label>' +
        '</div>' +
        '<div class="hstack"><span class="flabel">旧版本（可回滚）</span>' +
        n.oldVersions.map(function (v) { return '<span class="tag tag--line">V' + esc(v) + '</span>'; }).join('') + '</div>' +
        '<div class="hr"></div>' +
        '<h3 class="flabel">网元属性</h3>' +
        '<div class="chips">' + Object.keys(n.params).map(function (k) {
          return '<span class="tag">' + esc(k) + ' <b>' + esc(n.params[k]) + '</b></span>';
        }).join('') + '</div>' +
        '<div class="facts"><button class="btn btn--sm" id="neSave" type="button">保存属性</button>' +
        '<span class="note">属性即时生效，会作为响应字段定制的上游数据</span></div>';
      return;
    }

    if (ST.neTab === 'valid') {
      body.innerHTML =
        '<div class="hstack"><h3 class="flabel">参数校验规则</h3><span class="note">对端上报字段会被这些规则逐条检查</span>' +
        '<button class="btn btn--sm btn--primary right" id="validRun" type="button">执行校验</button></div>' +
        '<div class="rows">' + (n.validations.map(function (v) {
          return '<div class="row"><span class="row__main"><span class="row__t mono"><b>' + esc(v.field) + '</b></span>' +
            '<span class="row__s"><span class="mono">' + esc(v.rule) + '</span><span>' + esc(v.message) + '</span></span></span>' +
            '<span class="row__right"><span class="tag ' + (v.level === '错误' ? 'tag--err' : 'tag--warn') + '">' + esc(v.level) + '</span>' +
            '<span id="vm-' + v.id + '"></span></span></div>';
        }).join('') || '<div class="empty">还没有校验规则</div>') + '</div>' +
        '<div id="validResult" class="rows"></div>' +
        '<div class="hr"></div>' +
        '<div class="fgrid">' +
        '<label class="field"><span class="flabel">字段</span><input class="input mono" id="vField" value="neId" /></label>' +
        '<label class="field"><span class="flabel">级别</span><select class="input" id="vLevel"><option>错误</option><option>警告</option></select></label>' +
        '<label class="field"><span class="flabel">正则 / 规则</span><input class="input mono" id="vRule" data-fkey="vRule" placeholder="^GNB-[A-Z]{2}-\\d{4}$" /></label>' +
        '<label class="field"><span class="flabel">不通过的提示</span><input class="input" id="vMsg" data-fkey="vMsg" placeholder="网元编号格式不合法" /></label>' +
        '</div>' +
        '<div class="facts"><button class="btn btn--sm" id="validAdd" type="button">新增规则</button>' +
        '<span class="note">规则在「执行校验」时对当前网元取值求值</span></div>';
      n.validations.forEach(function (v) {
        var host = document.getElementById('vm-' + v.id);
        if (host) mark(host, 'idle', v.level);
      });
      return;
    }

    if (ST.neTab === 'flow') {
      var total = n.upgrade.reduce(function (a, s) { return a + (s.kind === 'auto' ? (s.durationS || 0) : 0); }, 0);
      body.innerHTML =
        '<div class="hstack"><h3 class="flabel">升级流程步骤</h3>' +
        '<span class="note">共 ' + n.upgrade.length + ' 步 · 自动步骤合计 ' + total + ' s（手动 / 人工不计时）</span>' +
        '<span id="flowGauge" class="right"></span></div>' +
        '<div class="steps">' + n.upgrade.map(function (s, i) {
          var kindTag = s.kind === 'auto' ? '<span class="tag tag--line">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工</span>';
          return '<div class="step"><span class="step__idx">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="step__main"><span class="step__name">' + esc(s.name) + '</span>' +
            '<span class="step__meta">' + kindTag +
            (s.kind === 'auto' ? '<span>' + s.durationS + ' s</span>' : '<span>' + s.durationS + ' s（手动执行）</span>') +
            (s.interaction ? '<span>人机交互：' + esc(s.interaction.owner) + ' · 超时 ' + s.interaction.timeoutS + ' s</span>' : '') +
            '</span></span>' +
            '<span class="step__right">' +
            '<button class="iconbtn" data-step-up="' + s.id + '" type="button" aria-label="上移步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button>' +
            '<button class="iconbtn" data-step-down="' + s.id + '" type="button" aria-label="下移步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button>' +
            '<button class="iconbtn" data-step-del="' + s.id + '" type="button" aria-label="删除步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>' +
            '</span></div>';
        }).join('') + '</div>' +
        '<div class="hr"></div>' +
        '<div class="fgrid">' +
        '<label class="field"><span class="flabel">新步骤名称</span><input class="input" id="stepName" data-fkey="stepName" placeholder="例如：业务验证" /></label>' +
        '<div class="field"><span class="flabel">步骤类型</span><span id="stepKind"></span></div>' +
        '<label class="field"><span class="flabel">时长 / 超时（秒）</span><input class="input" id="stepDur" data-fkey="stepDur" inputmode="numeric" value="30" /></label>' +
        '</div>' +
        '<div class="facts"><button class="btn btn--sm" id="stepAdd" type="button">新增步骤</button>' +
        '<span class="note">类型选「人工」会自动挂上人机交互（负责人 / 超时）</span>' +
        '<span id="upgradeHold" class="right"></span></div>';

      var gh = $('#flowGauge');
      if (gh) gauge(gh, n.status === '升级中' ? 46 : (n.status === '在线' ? 100 : 0), { label: '升级流程就绪度', unit: '%' });
      var sh = $('#stepKind');
      if (sh) X.segmented(sh, {
        items: segItems([['auto', '自动'], ['manual', '手动'], ['human', '人工']]),
        value: ST.stepKind,
        onChange: function (v) { ST.stepKind = v; MP.sfx.play('step'); }
      });
      var uh = $('#upgradeHold');
      if (uh) {
        var b = el('button', 'btn btn--primary');
        b.type = 'button';
        b.innerHTML = '<span class="mx-hold__label">按住执行升级</span>';
        uh.appendChild(b);
        var target = n;
        X.holdConfirm(b, {
          duration: 1200, label: '按住执行升级', doneLabel: '升级已下发',
          onConfirm: function () {
            A.updateNE(target.id, { status: '升级中' });
            toast('已下发升级流程', target.name + ' · ' + target.upgrade.length + ' 个步骤 · 含人机交互步骤', { tone: 'ok', duration: 5200 });
          }
        });
      }
      return;
    }

    body.innerHTML =
      '<div class="fgrid">' +
      '<label class="field"><span class="flabel">归入网元组</span><select class="input" id="neGroup">' +
      '<option value="">（不分组）</option>' + S.groups.map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === n.group ? ' selected' : '') + '>' + esc(g.name) + ' · ' + g.members.length + ' 个成员</option>';
      }).join('') + '</select></label>' +
      '<label class="field"><span class="flabel">新组名</span><input class="input" id="groupName" data-fkey="groupName" placeholder="南京核心网组" /></label>' +
      '<label class="field"><span class="flabel">新组策略</span><input class="input" id="groupStrategy" data-fkey="groupStrategy" value="串行 · 每台间隔 60s" /></label>' +
      '</div>' +
      '<div class="facts"><button class="btn btn--sm" id="groupNew" type="button">新建网元组并归入</button>' +
      '<span class="note">同组网元可批量下发升级任务</span></div>' +
      '<div class="hr"></div>' +
      '<div class="facts"><button class="btn btn--primary btn--sm mx-magnetic" id="neCopy" type="button">复制网元</button>' +
      '<span class="note">复制后名称序号顺延一位，属性 / 校验规则 / 升级流程全部继承</span></div>';
    var cbtn = $('#neCopy');
    if (cbtn) X.magnetic(cbtn, { strength: 0.18 });
  }
  function renderNe() {
    renderNeList();
    renderNeBody();
    renderKpis('ne');
  }
  function bindNe() {
    $('#neList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ne]'); if (!b) return;
      ST.neSel = b.dataset.ne;
      MP.sfx.play('step');
      renderNeBody();
      renderNeList();
      var n = neSel();
      var host = $('#neBody');
      if (n && host) M.develop(host, { duration: 300 });
    });
    $('#neTabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-netab]'); if (!t) return;
      ST.neTab = t.dataset.netab;
      $$('#neTabs .tab').forEach(function (x) {
        var on = x === t;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderNeBody();
      var host = $('#neBody');
      if (host) M.develop(host, { duration: 320 });
    });
    $('#neNew').addEventListener('click', function () {
      var n = A.addNE({
        name: '新网元 ' + String(S.nes.length + 1).padStart(2, '0'), code: 'GNB', type: S.neTypes[0],
        arch: S.arches[0], vendor: S.vendors[0], version: '7.0.0'
      });
      ST.neSel = n.id; ST.neTab = 'profile';
      toast('已创建网元', n.name + ' — 补充属性 / 架构 / 类型后即可用于 mock', { tone: 'ok' });
      MP.sfx.play('confirm');
    });
    $('#neBody').addEventListener('change', function (e) {
      var n = neSel(); if (!n) return;
      var t = e.target, f = t.dataset.nef;
      if (f) { var patch = {}; patch[f] = t.value; A.updateNE(n.id, patch); return; }
      if (t.id === 'neGroup') {
        A.assignGroup(n.id, t.value);
        toast('已调整分组', t.value ? ((SEL.group(t.value) || {}).name + ' · ' + ((SEL.group(t.value) || {}).members || []).length + ' 个成员') : '未分组', { duration: 2600 });
      }
    });
    $('#neBody').addEventListener('click', function (e) {
      var n = neSel(); if (!n) return;
      var up = e.target.closest('[data-step-up]'), dn = e.target.closest('[data-step-down]'), dl = e.target.closest('[data-step-del]');
      if (up) { A.moveStep(n.id, up.dataset.stepUp, -1); MP.sfx.play('step'); return; }
      if (dn) { A.moveStep(n.id, dn.dataset.stepDown, 1); MP.sfx.play('step'); return; }
      if (dl) { A.removeStep(n.id, dl.dataset.stepDel); MP.sfx.play('undo'); toast('已删除步骤', '剩余 ' + n.upgrade.length + ' 步', { duration: 2400 }); return; }
      if (e.target.closest('#neSave')) { toast('属性已保存', n.name + ' · ' + n.type + ' / V' + n.version + ' / ' + n.arch, { tone: 'ok' }); return; }
      if (e.target.closest('#stepAdd')) {
        var name = ($('#stepName') || {}).value || '新步骤';
        var dur = parseInt(($('#stepDur') || {}).value, 10);
        var kind = ST.stepKind;
        A.addUpgradeStep(n.id, { name: name, kind: kind, durationS: isNaN(dur) ? 30 : dur });
        ($('#stepName') || {}).value = '';
        var idx = n.upgrade.map(function (s) { return s.name; }).lastIndexOf(name);
        var guard = 0;
        while (kind === 'human' && idx > 2 && guard++ < 40) { A.moveStep(n.id, n.upgrade[idx].id, -1); idx--; }
        toast('已新增升级步骤', name + '（' + ({ auto: '自动', manual: '手动', human: '人工 · 含人机交互' })[kind] + '）', { tone: 'ok', duration: 2600 });
        MP.sfx.play('confirm');
        return;
      }
      if (e.target.closest('#validAdd')) {
        var rule = ($('#vRule') || {}).value || '';
        A.addValidation(n.id, { field: ($('#vField') || {}).value, rule: rule, level: ($('#vLevel') || {}).value, message: ($('#vMsg') || {}).value });
        ($('#vRule') || {}).value = '';
        toast('已新增校验规则', ($('#vField') || {}).value + ' ← ' + rule, { tone: 'ok', duration: 2600 });
        return;
      }
      if (e.target.closest('#validRun')) {
        var target = $('#validResult');
        if (!target) return;
        target.innerHTML = '';
        var loader = el('div');
        target.appendChild(loader);
        X.latticeLoader(loader, { label: '参数校验执行中' });
        setTimeout(function () {
          var res = A.runValidation(n.id);
          var pass = res.filter(function (r) { return r.pass; }).length;
          loader.remove();
          res.forEach(function (r) {
            var row = el('div', 'row');
            row.innerHTML = '<span id="vr-' + r.id + '"></span><span class="row__main"><span class="row__t mono"><b>' + esc(r.field) + '</b></span>' +
              '<span class="row__s"><span>' + esc(r.message) + '</span><span>' + esc(r.level) + '</span></span></span>';
            target.appendChild(row);
            var host = document.getElementById('vr-' + r.id);
            if (host) mark(host, r.pass ? 'done' : 'error', r.pass ? '通过' : '不通过');
          });
          toast(pass === res.length ? '参数校验全部通过' : '参数校验发现问题', pass + ' / ' + res.length + ' 条规则通过', { tone: pass === res.length ? 'ok' : 'warn' });
        }, 900);
        return;
      }
      if (e.target.closest('#groupNew')) {
        var gname = ($('#groupName') || {}).value || ('新网元组 ' + String(S.groups.length + 1).padStart(2, '0'));
        var g = A.addGroup({ name: gname, desc: '手动创建 · ' + n.name, strategy: ($('#groupStrategy') || {}).value || '串行' });
        A.assignGroup(n.id, g.id);
        toast('已新建网元组', g.name + ' — 当前网元 ' + n.name + ' 已归入', { tone: 'ok' });
        MP.sfx.play('confirm');
        return;
      }
      if (e.target.closest('#neCopy')) {
        var c = A.copyNE(n.id);
        MP.sfx.play('confirm');
        toast('已复制网元', c.name + ' · 继承 ' + c.upgrade.length + ' 个升级步骤与 ' + c.validations.length + ' 条校验规则', {
          tone: 'ok', actionLabel: '撤销',
          onAction: function () {
            S.nes = S.nes.filter(function (x) { return x.id !== c.id; });
            MP.emit({ type: 'ne', action: 'undo-copy' });
            toast('已撤销复制', c.name, { tone: 'ok', duration: 2400 });
          }
        });
      }
    });
  }

  /* ============================================================= S4 OMP */
  function renderOmp() {
    $('#ompScopeMeta').textContent = S.nes.length + ' 个网元 / ' + S.groups.length + ' 个组';
    $('#ompScope').innerHTML = S.nes.map(function (n) {
      return '<div class="row"><span class="row__main"><span class="row__t"><b>' + esc(n.name) + '</b><span class="tag tag--line mono">' + esc(n.code) + '</span></span>' +
        '<span class="row__s"><span>' + esc(n.arch) + '</span><span>V' + esc(n.version) + '</span><span>' + esc(n.vendor) + '</span></span></span>' +
        '<span class="row__right"><span class="tag ' + (n.group ? 'tag--accent' : 'tag--line') + '">' + (n.group ? esc((SEL.group(n.group) || {}).name || '') : '未纳入平台') + '</span></span></div>';
    }).join('') +
      S.groups.map(function (g) {
        return '<div class="row"><span class="row__main"><span class="row__t"><b>组 · ' + esc(g.name) + '</b></span>' +
          '<span class="row__s"><span>' + esc(g.strategy) + '</span><span>' + esc(g.desc) + '</span></span></span>' +
          '<span class="row__right"><span class="tag tag--accent">' + g.members.length + ' 成员</span></span></div>';
      }).join('');

    $('#accCount').textContent = S.accounts.length + ' 个账号';
    $('#accList').innerHTML = S.accounts.map(function (a) {
      var names = a.nes.map(function (id) { var n = MP.byId(S.nes, id); return n ? n.name : id; }).join(' / ');
      return '<div class="row"><span class="row__main"><span class="row__t mono"><b>' + esc(a.name) + '</b><span class="tag tag--line">' + esc(a.role) + '</span>' +
        '<span class="tag ' + (a.status === '启用' ? 'tag--ok' : 'tag--line') + '">' + esc(a.status) + '</span></span>' +
        '<span class="row__s"><span>授权 ' + a.nes.length + ' 个网元</span><span>' + esc(names || '—') + '</span><span>' + esc(a.createdAt) + '</span></span></span>' +
        '<span class="row__right"><span id="accSw-' + a.id + '"></span></span></div>';
    }).join('') || '<div class="empty">暂无账号</div>';
    S.accounts.forEach(function (a) {
      var host = document.getElementById('accSw-' + a.id);
      if (!host) return;
      sw(host, a.status === '启用', '启用或停用账号 ' + a.name, function (on) {
        A.toggleAccount(a.id);
        toast(on ? '账号已启用' : '账号已停用', a.name + ' · ' + a.role, { tone: on ? 'ok' : 'warn', duration: 2600 });
      });
    });

    $('#taskWrap').innerHTML = S.tasks.map(function (t) {
      var steps = t.steps.map(function (s, i) {
        return '<span class="tag ' + (s.state === 'done' ? 'tag--ok' : s.state === 'active' ? 'tag--accent' : 'tag--line') + '">' + String(i + 1).padStart(2, '0') + ' ' + esc(s.name) + '</span>';
      }).join('');
      return '<div class="fcard" style="margin-bottom:12px"><div class="fcard__h">' +
        '<b>' + esc(t.name) + '</b>' +
        '<span class="tag tag--line">' + esc(t.site) + '</span>' +
        '<span class="grow"></span><span id="taskMark-' + t.id + '"></span></div>' +
        '<div class="fcard__b">' +
        '<div class="hstack"><span id="taskGauge-' + t.id + '"></span>' +
        '<span class="row__main"><span class="row__s">' +
        '<span>类型 ' + esc(t.type) + '</span><span>负责人 ' + esc(t.owner) + '</span><span>创建于 ' + esc(t.createdAt) + '</span>' +
        '<span>关联网元 ' + (t.neIds.length ? t.neIds.map(function (id) { return esc((MP.byId(S.nes, id) || {}).name || id); }).join(' + ') : '—') + '</span>' +
        '</span><span class="chips">' + steps + '</span></span>' +
        '<button class="btn btn--sm" data-task-advance="' + t.id + '" type="button">推进下一步</button></div>' +
        '</div></div>';
    }).join('') || '<div class="empty">暂无任务</div>';
    S.tasks.forEach(function (t) {
      var gh = document.getElementById('taskGauge-' + t.id);
      if (gh) {
        gh.classList.add('mx-gauge--sm');
        gauge(gh, t.progress, { label: '升级进度', unit: '%' });
      }
      var mh = document.getElementById('taskMark-' + t.id);
      if (mh) {
        var state = t.status === 'done' ? 'done' : t.status === 'waiting-human' ? 'error' : 'working';
        mark(mh, state, ({ done: '已完成', 'waiting-human': '等待人工放行', running: '执行中' })[t.status]);
      }
    });

    $('#tkSite').innerHTML = S.sites.map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '（' + esc(s.region) + ' · 可分配 ' + s.cpu + ' 核）</option>';
    }).join('');
    $('#tkGroup').innerHTML = S.groups.map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + ' · ' + g.members.length + ' 个网元</option>';
    }).join('');
    $('#acNes').innerHTML = S.nes.map(function (n) {
      return '<label class="chk"><input type="checkbox" value="' + n.id + '" />' + esc(n.name) + ' <em>' + esc(n.code) + '</em></label>';
    }).join('');
    $('#tkNes').innerHTML = S.nes.map(function (n) {
      return '<label class="chk"><input type="checkbox" value="' + n.id + '" />' + esc(n.name) + ' <em>V' + esc(n.version) + '</em></label>';
    }).join('');
    syncTaskNes();
    renderKpis('omp');
  }
  function syncTaskNes() {
    var gid = ($('#tkGroup') || {}).value;
    var g = gid ? SEL.group(gid) : null;
    if (!g) return;
    $$('#tkNes input').forEach(function (i) { i.checked = g.members.indexOf(i.value) >= 0; });
  }
  function bindOmp() {
    $('#accForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#acName').value.trim();
      var errEl = $('#acNameErr');
      var dup = S.accounts.some(function (a) { return a.name === name; });
      if (!name || dup) { errEl.hidden = false; errEl.textContent = dup ? '账号名已存在，请换一个' : '账号名不能为空'; $('#acName').focus(); MP.sfx.play('warn'); return; }
      errEl.hidden = true;
      var nes = $$('#acNes input:checked').map(function (i) { return i.value; });
      var a = A.createAccount({ name: name, role: $('#acRole').value, nes: nes, scope: [] });
      $('#acName').value = '';
      MP.sfx.play('confirm');
      toast('已创建账号', a.name + ' · ' + a.role + ' · 授权 ' + nes.length + ' 个网元', { tone: 'ok' });
    });
    $('#tkGroup').addEventListener('change', function () { syncTaskNes(); });
    $('#taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#tkName').value.trim();
      var errEl = $('#tkNameErr');
      if (!name) { errEl.hidden = false; $('#tkName').focus(); MP.sfx.play('warn'); return; }
      errEl.hidden = true;
      var siteId = $('#tkSite').value;
      var site = MP.byId(S.sites, siteId) || {};
      var nes = $$('#tkNes input:checked').map(function (i) { return i.value; });
      var t = A.createTask({ name: name, site: site.name, neIds: nes, owner: 'zhangwei' });
      $('#tkName').value = '';
      MP.sfx.play('confirm');
      toast('已创建一体化升级任务', t.name + ' · 关联站点 ' + t.site + '（' + site.region + '）· ' + t.steps.length + ' 个步骤', { tone: 'ok', duration: 5200 });
    });
    $('#taskWrap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-task-advance]'); if (!b) return;
      var t = MP.byId(S.tasks, b.dataset.taskAdvance); if (!t) return;
      A.advanceTask(t.id);
      var idx = t.steps.map(function (s) { return s.state; }).indexOf('active');
      if (t.status === 'waiting-human') {
        MP.sfx.play('warn');
        toast('任务等待人工放行', (t.steps[idx] ? t.steps[idx].name : '人工步骤') + ' · 关联站点 ' + t.site, {
          tone: 'warn', actionLabel: '立即放行',
          onAction: function () { A.advanceTask(t.id); toast('已放行', t.name + ' 继续执行', { tone: 'ok' }); }
        });
      } else if (t.status === 'done') {
        toast('任务已完成', t.name + ' · 站点 ' + t.site + ' 联动校验通过', { tone: 'ok' });
      } else {
        toast('已推进', (t.steps[idx] ? t.steps[idx].name : '下一步') + ' · 进度 ' + t.progress + '%', { duration: 2400 });
      }
    });
    $('#ompCoDeploy').closest('.kpi').addEventListener('click', function () {
      A.toggleCoDeploy('omp');
      toast(S.deploy.omp.coDeploy ? '已开启共部署' : '已关闭共部署', S.deploy.omp.coDeploy ? '复用 ' + S.deploy.omp.host + ' 端点与证书' : '平台将使用独立端点', { tone: S.deploy.omp.coDeploy ? 'ok' : 'warn', duration: 2800 });
    });
  }

  /* ============================================================= S5 LCM */
  function renderLcm() {
    var list = S.packages.filter(function (p) {
      return ST.pkgFilter === 'all' || (ST.pkgFilter === 'ok' ? p.validated : !p.validated);
    });
    $('#pkgCount').textContent = list.length + ' / ' + S.packages.length + ' 个包';
    $('#pkgList').innerHTML = list.map(function (p) {
      var n = MP.byId(S.nes, p.ne);
      return '<div class="row"><span class="row__main">' +
        '<span class="row__t mono"><b>' + esc(p.name) + '</b><span class="tag tag--line">' + esc(p.type) + '</span>' +
        (p.validated ? '<span class="tag tag--ok">已校验</span>' : '<span class="tag tag--warn">待校验</span>') + '</span>' +
        '<span class="row__s"><span>所属 ' + (n ? esc(n.name) : '平台级') + '</span><span>厂商 ' + esc(p.vendor) + '</span>' +
        '<span>V' + esc(p.version) + '</span><span>' + num(p.sizeMB) + ' MB</span><span>MD5 ' + esc(p.md5) + '</span><span>' + esc(p.uploadedAt) + '</span></span>' +
        '</span><span class="row__right" id="pkgOps-' + p.id + '"></span></div>';
    }).join('') || '<div class="empty">没有符合条件的软件包</div>';

    S.packages.forEach(function (p) {
      var host = document.getElementById('pkgOps-' + p.id);
      if (!host) return;
      if (!p.validated) {
        var v = el('button', 'btn btn--sm', '走校验');
        v.type = 'button'; v.dataset.pkgValidate = p.id;
        host.appendChild(v);
      }
      var d = el('button', 'btn btn--sm btn--danger');
      d.type = 'button';
      host.appendChild(d);
      X.fuseButton(d, {
        label: '移除', doneLabel: '已移除', undoWindow: 4000,
        onCommit: function () {
          var backup = JSON.parse(JSON.stringify(p));
          act(function () { A.removePackage(p.id); }, function () { keepFocus(renderLcm); });
          toast('已移除软件包', backup.name, {
            tone: 'danger', actionLabel: '撤销',
            onAction: function () {
              S.packages.push(backup);
              MP.emit({ type: 'package', action: 'restore' });
              toast('已恢复软件包', backup.name, { tone: 'ok', duration: 2600 });
            }
          });
        }
      });
    });

    $('#lcmScopeMeta').textContent = S.nes.length + ' 个受管网元';
    $('#lcmScope').innerHTML = S.nes.map(function (n) {
      return '<div class="row"><span class="row__main"><span class="row__t"><b>' + esc(n.name) + '</b><span class="tag tag--line">' + esc(n.code) + '</span></span>' +
        '<span class="row__s"><span>V' + esc(n.version) + '</span><span>' + esc(n.vendor) + '</span><span>包 ' + S.packages.filter(function (p) { return p.ne === n.id; }).length + ' 个</span></span></span>' +
        '<span class="row__right"><span class="dot ' + (NE_DOT[n.status] || 'dot--idle') + '"></span></span></div>';
    }).join('') || '<div class="empty">暂无网元</div>';

    var box = $('#deployBox');
    box.innerHTML =
      '<div class="hstack"><b>' + esc(S.deploy.lcmp.version) + '</b><span class="tag tag--line">' + S.packages.length + ' 个包</span><span id="coDeploySw" class="right"></span></div>' +
      '<div class="note">共部署时生命周期平台与网元管理平台复用同一 mock 端点与证书（' + esc(S.deploy.omp.host) + '），端口只需注册一次、证书只签发一份；' +
      (S.deploy.lcmp.coDeploy ? '当前 LCMP 与 NEMP 共用该端点。' : '当前 LCMP 使用独立端点 :9443，需要单独注册端口与证书。') + '</div>' +
      '<div class="hr"></div>' +
      '<div class="fgrid">' +
      profileCard('LCMP 端点', S.deploy.lcmp.coDeploy ? esc(S.deploy.omp.host) + '（复用）' : '10.18.32.104:9443（独立）') +
      profileCard('NEMP 端点', esc(S.deploy.omp.host)) +
      profileCard('软件包', S.packages.length + ' 个 · 已校验 ' + S.packages.filter(function (p) { return p.validated; }).length + ' 个') +
      '</div>';
    sw($('#coDeploySw'), S.deploy.lcmp.coDeploy, '切换与网元管理平台共部署', function (on) {
      A.toggleCoDeploy('lcmp');
      toast(on ? '已开启共部署' : '已关闭共部署', on ? '复用 NEMP 端点与证书，无需重复注册端口' : 'LCMP 将使用独立端点 :9443', { tone: on ? 'ok' : 'warn' });
    });

    buildSeg($('#pkgFilter'), segItems([['all', '全部'], ['ok', '已校验'], ['todo', '待校验']]), ST.pkgFilter, function (v) {
      ST.pkgFilter = v;
      renderLcm();
    });
    $('#pkgType').innerHTML = opts(S.softTypes, null);
    $('#pkgVendor').innerHTML = opts(S.vendors, null);
    $('#pkgNe').innerHTML = '<option value="">（平台级）</option>' + S.nes.map(function (n) {
      return '<option value="' + n.id + '">' + esc(n.name) + ' · V' + esc(n.version) + '</option>';
    }).join('');
    renderKpis('lcm');
  }
  function bindLcm() {
    $('#pkgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#pkgName').value.trim(), ver = $('#pkgVer').value.trim();
      var errEl = $('#pkgErr');
      if (!name || !ver) {
        errEl.hidden = false;
        errEl.textContent = !name ? '软件包名称不能为空' : '版本号不能为空（例如 7.2.0）';
        (name ? $('#pkgVer') : $('#pkgName')).focus();
        MP.sfx.play('warn');
        return;
      }
      errEl.hidden = true;
      var p = A.addPackage({
        name: name, type: $('#pkgType').value, ne: $('#pkgNe').value,
        vendor: $('#pkgVendor').value, version: ver, sizeMB: +$('#pkgSize').value || 0
      });
      $('#pkgName').value = ''; $('#pkgVer').value = ''; $('#pkgSize').value = '';
      MP.sfx.play('confirm');
      toast('已登记软件包', p.name + ' · V' + p.version + ' · ' + num(p.sizeMB) + ' MB — 需走校验流程后用于升级', { tone: 'ok' });
    });
    $('#pkgList').addEventListener('click', function (e) {
      var v = e.target.closest('[data-pkg-validate]');
      if (v) {
        var holder = el('span');
        v.replaceWith(holder);
        X.latticeLoader(holder, { label: '校验中' });
        var id = v.dataset.pkgValidate;
        setTimeout(function () {
          A.validatePackage(id);
          var p = MP.byId(S.packages, id);
          toast('软件包校验通过', (p ? p.name : '') + ' · MD5 / 厂商签名 / 依赖 三项一致', { tone: 'ok' });
        }, 1100);
      }
    });
  }

  /* ============================================================= S6 VLP */
  function renderVlp() {
    var v = S.vlp;
    $('#vlpCore').innerHTML =
      '<div class="fgrid">' +
      '<label class="field"><span class="flabel">平台版本</span><select class="input" id="vlpVer">' +
      ['VLMP R3.1.0', 'VLMP R3.0.6（回滚点）'].map(function (o) {
        return '<option' + (o === v.version ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="field"><span class="flabel">CPU 数量（拖拽 / ←→ 键 · 范围 ' + v.cpuRange[0] + '–' + v.cpuRange[1] + ' 核）</span><div id="cpuScrub"></div></div>' +
      '</div>' +
      '<div class="hr"></div>' +
      '<div class="hstack" style="gap:24px">' +
      '<span id="cpuGauge"></span>' +
      '<span class="row__main">' +
      '<span class="row__s"><span>卷 ' + esc(v.volume) + '</span><span>升级时先做倒换演练再切版本</span></span>' +
      '<span class="row__s"><span>主站点可分配余量 ' + (MP.byId(S.sites, v.primarySite) || {}).cpu + ' 核</span>' +
      '<span>副站点可分配余量 ' + (MP.byId(S.sites, v.secondarySite) || {}).cpu + ' 核</span></span>' +
      '</span>' +
      '<button class="btn btn--sm right" data-cpu="-2" type="button">− 2 核</button>' +
      '<button class="btn btn--sm" data-cpu="2" type="button">+ 2 核</button>' +
      '</div>';

    var host = $('#cpuScrub');
    if (host) {
      host.id = 'cpuScrubHost';
      X.scrub(host, {
        label: 'CPU', value: v.cpu, min: v.cpuRange[0], max: v.cpuRange[1], step: 2, suffix: ' 核',
        onChange: function (n) { A.setCPU(n); }
      });
    }
    var g = $('#cpuGauge');
    if (g) gauge(g, (v.cpu - v.cpuRange[0]) / (v.cpuRange[1] - v.cpuRange[0]) * 100, { label: 'CPU 配额占用' });

    $('#vlpSites').innerHTML = S.sites.map(function (s) {
      var role = s.id === v.primarySite ? '主站点' : s.id === v.secondarySite ? '副站点' : '';
      return '<div class="row"><span class="row__main"><span class="row__t"><b>' + esc(s.name) + '</b>' +
        '<span class="tag tag--line">' + esc(s.region) + '</span>' +
        (role ? '<span class="tag tag--accent">' + role + '</span>' : '') + '</span>' +
        '<span class="row__s"><span>可分配 CPU ' + s.cpu + ' 核</span><span>平台角色 ' + esc(s.role) + '</span></span></span>' +
        '<span class="row__right">' +
        '<button class="btn btn--sm" data-site-p="' + s.id + '" type="button">设为主站</button>' +
        '<button class="btn btn--sm btn--ghost" data-site-s="' + s.id + '" type="button">设为副站</button>' +
        '</span></div>';
    }).join('');

    var flow = $('#vlpFlow');
    var done = v.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length;
    flow.innerHTML =
      '<div class="steps">' + v.upgradeFlow.map(function (s, i) {
        var kind = s.kind === 'auto' ? '<span class="tag tag--line">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工</span>';
        return '<div class="step is-' + s.state + '"><span class="step__idx">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="step__main"><span class="step__name">' + esc(s.name) + '</span>' +
          '<span class="step__meta">' + kind + '<span>' + ({ done: '已完成', active: '进行中', todo: '待执行' })[s.state] + '</span></span></span>' +
          '<span class="step__right" id="vfm-' + s.id + '"></span></div>';
      }).join('') + '</div>' +
      '<div class="hstack"><span id="flowLattice"></span>' +
      '<span class="note">进度 ' + done + ' / ' + v.upgradeFlow.length + ' 步</span></div>';
    v.upgradeFlow.forEach(function (s) {
      var h = document.getElementById('vfm-' + s.id);
      if (h) mark(h, s.state === 'done' ? 'done' : s.state === 'active' ? 'working' : 'idle', '');
    });

    var adv = $('#vlpAdvance');
    if (adv) {
      adv.innerHTML = '';
      var b = el('button', 'btn btn--primary btn--sm');
      b.type = 'button';
      b.innerHTML = '<span class="mx-hold__label">按住推进</span>';
      adv.appendChild(b);
      X.holdConfirm(b, {
        duration: 900, label: '按住推进', doneLabel: '已推进',
        onConfirm: function () {
          A.advanceVlpFlow();
          var d2 = S.vlp.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length;
          var cur = S.vlp.upgradeFlow.filter(function (s) { return s.state === 'active'; })[0];
          toast('升级流程已推进', (cur ? '当前步骤：' + cur.name : '全部步骤已完成') + ' · ' + d2 + '/' + S.vlp.upgradeFlow.length, { tone: 'ok' });
        }
      });
    }

    var checks = v.checks;
    $('#vlpCheckMeta').innerHTML = '<b>' + checks.filter(function (c) { return c.state === 'pass'; }).length + '</b> / ' + checks.length + ' 通过';
    $('#vlpChecks').innerHTML = checks.map(function (c) {
      return '<div class="row"><span id="vcm-' + c.id + '"></span>' +
        '<span class="row__main"><span class="row__t"><b>' + esc(c.name) + '</b></span>' +
        '<span class="row__s"><span class="mono">' + esc(c.target) + '</span><span>' + esc(c.detail) + '</span></span></span>' +
        '<span class="row__right">' + (c.state === 'pass'
          ? '<span class="tag tag--ok">通过</span>'
          : '<button class="btn btn--sm" data-check="' + c.id + '" type="button">执行校验</button>') +
        '</span></div>';
    }).join('');
    checks.forEach(function (c) {
      var h = document.getElementById('vcm-' + c.id);
      if (h) mark(h, c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle', c.state === 'pass' ? '通过' : c.state === 'warn' ? '警告' : '未执行');
    });
    renderKpis('vlp');
  }
  function bindVlp() {
    $('#vlpCore').addEventListener('change', function (e) {
      if (e.target.id === 'vlpVer') {
        A.setVlpVersion(e.target.value);
        toast('已切换平台版本', e.target.value + ' · 升级时会先校验回滚点', { tone: 'ok', duration: 2600 });
      }
    });
    $('#vlpCore').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cpu]'); if (!b) return;
      A.setCPU(S.vlp.cpu + (+b.dataset.cpu));
      MP.sfx.play('step');
    });
    $('#vlpSites').addEventListener('click', function (e) {
      var p = e.target.closest('[data-site-p]'), s = e.target.closest('[data-site-s]');
      if (p) {
        A.setSite('primary', p.dataset.siteP);
        toast('已设为主站点', (MP.byId(S.sites, p.dataset.siteP) || {}).name + ' 承载业务，副站点承担容灾', { tone: 'ok', duration: 2600 });
      }
      if (s) {
        if (s.dataset.siteS === S.vlp.primarySite) {
          MP.sfx.play('warn');
          toast('不能把主站点设为副站点', '请先把另一个站点设为主站', { tone: 'warn' });
          return;
        }
        A.setSite('secondary', s.dataset.siteS);
        toast('已设为副站点', (MP.byId(S.sites, s.dataset.siteS) || {}).name, { tone: 'ok', duration: 2600 });
      }
    });
    $('#vlpReset').addEventListener('click', function () {
      A.resetVlpFlow();
      toast('已重置升级流程', '回到第 01 步：' + S.vlp.upgradeFlow[0].name, { duration: 2600 });
    });
    $('#vlpChecks').addEventListener('click', function (e) {
      var b = e.target.closest('[data-check]'); if (!b) return;
      var host = b.parentElement;
      var holder = el('span');
      b.replaceWith(holder);
      var lat = X.latticeLoader(holder, { label: '校验' });
      var id = b.dataset.check;
      setTimeout(function () {
        A.runVlpCheck(id);
        var c = MP.byId(S.vlp.checks, id);
        toast('校验项已更新', (c ? c.name : '') + ' · ' + (c ? c.detail : '通过'), { tone: 'ok', duration: 2600 });
      }, 850);
    });
  }

  /* ========================================================== 渲染调度 */
  function renderScreen(name) {
    if (name === 'mock') { renderMock(); renderKpis('mock'); }
    if (name === 'flow') { renderApiList(); renderStudio(); renderLogs(true); renderKpis('flow'); }
    if (name === 'ne') renderNe();
    if (name === 'omp') renderOmp();
    if (name === 'lcm') renderLcm();
    if (name === 'vlp') renderVlp();
  }

  MP.subscribe(function (state, evt) {
    var t = evt.type, sc = state.ui.screen;
    if (t === 'screen') { switchScreen(sc); return; }
    if (t === 'log') {
      renderTelemetry();
      if (sc === 'flow') renderLogs(false);
      return;
    }
    if (t === 'stats') { renderTelemetry(); return; }
    if (t === 'log-filter' || t === 'log-query') {
      if (sc === 'flow') keepFocus(function () { renderLogHead(); bindFlowLog(); renderLogs(true); });
      return;
    }
    if (t === 'interaction-resolved') { if (sc === 'flow') renderLogs(true); return; }
    if (t === 'ports' || t === 'cert' || t === 'caps' || t === 'service' || t === 'select-port') {
      if (ST.lock === 'mock') return;         // 正在涟漪加载 / 引信撤销，保持现场
      renderTelemetry();
      if (sc === 'mock') { keepFocus(renderMock); renderKpis('mock'); }
      return;
    }
    if (t === 'select-api') { if (sc === 'flow') { renderApiList(); renderStudio(); } return; }
    // 编辑预期响应时本地 DOM 已是最新值，整块重画会打断输入与拖拽
    if (t === 'api') return;
    if (t === 'fields') {
      if (ST.lock === 'flow') return;         // 删除 / 恢复字段时保留引信按钮
      if (sc === 'flow' && evt.action !== 'edit') { renderApiList(); if (ST.editing) renderStudio(); }
      return;
    }
    if (t === 'interactions') { if (sc === 'flow') renderStudio(); return; }
    if (t === 'ne' || t === 'upgrade' || t === 'validation' || t === 'group') {
      if (ST.lock === 'ne') return;
      renderTelemetry();
      if (sc === 'ne') keepFocus(renderNe);
      return;
    }
    if (t === 'validation-run') return;   // 结果由本地渲染，避免重画打断表单
    if (t === 'account' || t === 'task') { if (sc === 'omp') keepFocus(renderOmp); return; }
    if (t === 'deploy') {
      if (sc === 'omp') keepFocus(renderOmp);
      if (sc === 'lcm') keepFocus(renderLcm);
      renderKpis(sc);
      return;
    }
    if (t === 'package') {
      if (ST.lock === 'lcm') return;        // 引信撤销窗口内保留按钮状态
      if (sc === 'lcm') keepFocus(renderLcm);
      return;
    }
    if (t === 'vlp') { if (sc === 'vlp') keepFocus(renderVlp); return; }
  });

  /* ============================================================== 导航 */
  var NAV_ORDER = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var NAV_NAME = { mock: 'MOCK 管理', flow: 'MOCK 流程', ne: '网元管理', omp: '网元管理平台', lcm: '生命周期平台', vlp: '虚层管理平台' };
  var pendingOrigin = null;

  function go(name, btn) {
    if (S.ui.screen === name && !btn) return;
    if (btn) {
      var r = btn.getBoundingClientRect(), s = $('#stage').getBoundingClientRect();
      pendingOrigin = (r.left + r.width / 2 - s.left) + 'px ' + (r.bottom - s.top) + 'px';
    }
    MP.sfx.play('iris');
    A.setScreen(name);
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
    renderScreen(name);
    renderChrome();
    renderTelemetry();
    document.title = 'Mock 平台 · V2 瑞士网格 · ' + NAV_NAME[name];

    var sc = document.querySelector('.screen[data-screen="' + name + '"]');
    if (!sc) return;
    if (pendingOrigin) { M.iris(sc, { origin: pendingOrigin, duration: 420 }); pendingOrigin = null; }
    else M.develop(sc, { duration: 340 });
    var parts = sc.querySelectorAll('.panel, .kpi');
    if (parts.length) M.stagger(parts, { each: 22, y: 10, duration: 320 });
  }

  /* ============================================================== 启动 */
  function boot() {
    MP.btn.install();
    MP.btn.enhance(document);
    renderChrome();
    switchScreen(S.ui.screen);
    bindMock(); bindFlow(); bindFlowLog(); bindNe(); bindOmp(); bindLcm(); bindVlp();

    $$('.nav__item').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.nav, b); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key >= '1' && e.key <= '6') go(NAV_ORDER[+e.key - 1]);
    });

    $('#sfxBtn').addEventListener('click', function () {
      var on = MP.sfx.toggle();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? '界面音效已开启' : '界面音效已关闭',
        on ? '合成音效与操作反馈共用同一个空间感' : '静音模式下所有交互仍保留视觉反馈',
        { duration: 2600 });
    });

    $('#stSim').closest('.foot__i').addEventListener('click', function () {
      if (S.ui.running) {
        MP.sim.stop(); S.ui.running = false;
        kpiText('stSim', 'PAUSED');
        toast('已暂停流量模拟', '审计日志不再自动追加请求', { duration: 2400 });
      } else {
        MP.sim.start(2600); S.ui.running = true;
        kpiText('stSim', 'RUNNING');
        toast('已恢复流量模拟', '对端请求会持续进入审计日志', { tone: 'ok', duration: 2400 });
      }
    });

    // 面板光斑跟随（主行动区卡片）
    $$('.panel').forEach(function (p) { X.spotlight(p); });
    var submit = $('#pfSubmit');
    if (submit) X.magnetic(submit, { strength: 0.14 });

    MP.fx.auto(document);
    MP.sim.start(2600);
    setInterval(function () { kpiText('clock', MP.clock()); }, 1000);
    kpiText('clock', MP.clock());
    M.reveal(document);
    console.log('%c[Mock 平台 V2] 瑞士网格 · 编辑风已就绪 · 6 个界面 · 按 1–6 切换', 'color:#0B63F6;font-weight:600');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

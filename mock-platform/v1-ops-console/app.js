/* ============================================================================
 * V1 · 暗场运维控制台 —— 视图层
 * 只用 MP.* 共享层，不直接改数据；所有交互都走 MP.actions。
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
  function ruleTag(kind) { var m = MP.RULE_META[kind] || MP.RULE_META.fixed; return '<span class="tag tag--' + (m.tone === 'neutral' ? 'ghost' : m.tone === 'accent' ? 'accent' : m.tone) + '">' + m.name + '</span>'; }

  // 重画时保住焦点与光标位置（表单体验的硬要求）
  function keepFocus(fn) {
    var a = document.activeElement;
    var key = a && (a.id || a.getAttribute('data-fkey'));
    if (!key && a && a.dataset && a.dataset.fid) key = 'prop:' + a.dataset.fid + ':' + (a.dataset.prop || a.dataset.rk);
    var ss = a && a.selectionStart, se = a && a.selectionEnd;
    fn();
    if (key) {
      var n;
      if (key.indexOf('prop:') === 0) {
        var p = key.split(':');
        n = document.querySelector('[data-fid="' + p[1] + '"][data-prop="' + p[2] + '"]') ||
            document.querySelector('[data-fid="' + p[1] + '"][data-rk="' + p[2] + '"]');
      } else {
        n = document.getElementById(key) || document.querySelector('[data-fkey="' + key + '"]');
      }
      if (n && n.focus) { n.focus(); try { if (ss != null && n.setSelectionRange) n.setSelectionRange(ss, se); } catch (e) {} }
    }
  }
  // 规则参数写回（值不改结构时只改状态，避免重画打断输入）
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
  function toast(title, desc, opts) {
    opts = opts || {};
    X.toast($('#toasts'), { title: title, desc: desc, tone: opts.tone, duration: opts.duration || 4200, actionLabel: opts.actionLabel, onAction: opts.onAction });
  }
  function kpi(k, v, u, tone) {
    return '<div class="kpi' + (tone ? ' kpi--' + tone : '') + '"><div class="kpi__k">' + k + '</div>' +
      '<div class="kpi__v">' + v + (u ? '<span class="kpi__u">' + u + '</span>' : '') + '</div></div>';
  }

  /* --------------------------------------------------------------- 顶栏 / 底栏 */
  function renderChrome() {
    $('#hostName').textContent = S.host.hostname;
    $('#hostIp').textContent = S.host.ip;
    $('#hostOs').textContent = S.host.os;
    $('#hostAgent').textContent = S.host.agent;
    $('#sigId').textContent = '0x' + (S.host.ip.split('.').reduce(function (a, b) { return a + (+b); }, 0) * 37).toString(16).toUpperCase();
    var up = Math.floor(S.host.uptimeS / 3600);
    $('#uptime').textContent = Math.floor(up / 24) + 'd ' + (up % 24) + 'h';
  }

  function renderTelemetry() {
    var k = SEL.kpis();
    $('#tkReq').textContent = k.req;
    $('#tkOk').textContent = k.ok;
    $('#tkErr').textContent = k.err;
    $('#tkLat').textContent = k.avgLat;
    $('#tkRun').textContent = k.running;
    $('#tkPorts').textContent = k.ports;
    $('#tkHuman').textContent = k.pendingHuman;
    $('#portCount').textContent = k.ports;
    var badges = {
      ports: k.ports, human: k.pendingHuman, ne: k.ne, tasks: k.tasks, packages: k.packages
    };
    Object.keys(badges).forEach(function (key) {
      var n = document.querySelector('[data-badge="' + key + '"]');
      if (n) n.textContent = badges[key];
      var item = n && n.closest('.rail__item');
      if (item) item.classList.toggle('is-attention', key === 'human' && badges[key] > 0);
    });
    var last = S.logs[0];
    $('#stLast').textContent = last ? (last.clock + ' ' + last.method + ' ' + last.path + ' → ' + last.status) : '—';
    $('#stTicker').textContent = S.logs.slice(1, 4).map(function (l) { return l.method + ' ' + l.path + ' ' + l.status; }).join('   ·   ');
  }
  function renderKpisFor(name) {
    var k = SEL.kpis();
    var html = '';
    if (name === 'mock') {
      html = kpi('端点', k.ports, '个') + kpi('运行中', k.running, '个', 'ok') + kpi('总请求', k.req, '', 'accent') + kpi('平均时延', k.avgLat, 'ms');
    } else if (name === 'flow') {
      html = kpi('请求', k.req, '') + kpi('成功', k.ok, '', 'ok') + kpi('异常', k.err, '', 'warn') + kpi('待人工', k.pendingHuman, '', k.pendingHuman ? 'accent' : '');
    } else if (name === 'ne') {
      html = kpi('网元', k.ne, '个') + kpi('网元组', k.groups, '个') + kpi('升级中', S.nes.filter(function (n) { return n.status === '升级中'; }).length, '个', 'accent') + kpi('校验规则', S.nes.reduce(function (a, n) { return a + n.validations.length; }, 0), '条');
    } else if (name === 'omp') {
      html = kpi('受管网元', k.ne, '个') + kpi('账号', k.accounts, '个', 'accent') + kpi('进行中任务', k.tasks, '个', 'warn') + kpi('共部署', S.deploy.omp.coDeploy ? 'ON' : 'OFF', '', S.deploy.omp.coDeploy ? 'ok' : '');
    } else if (name === 'lcm') {
      html = kpi('软件包', k.packages, '个', 'accent') + kpi('已校验', S.packages.filter(function (p) { return p.validated; }).length, '个', 'ok') + kpi('受管网元', k.ne, '个') + kpi('共部署', S.deploy.lcmp.coDeploy ? 'ON' : 'OFF', '', S.deploy.lcmp.coDeploy ? 'ok' : '');
    } else if (name === 'vlp') {
      html = kpi('平台版本', S.vlp.version.replace('VLMP ', ''), '') + kpi('CPU', S.vlp.cpu, '核', 'accent') + kpi('校验通过', S.vlp.checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + S.vlp.checks.length, '') + kpi('流程', S.vlp.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length + '/' + S.vlp.upgradeFlow.length, '');
    }
    var host = document.querySelector('[data-screen="' + name + '"] .screen__kpis');
    if (host) {
      host.innerHTML = html;
      // 指标数字滚动（动效要求：数字类指标用 countUp）
      $$('.kpi__v', host).forEach(function (v) {
        var raw = (v.firstChild && v.firstChild.nodeType === 3) ? String(v.firstChild.nodeValue).trim() : '';
        if (!/^\d+$/.test(raw)) return;
        var span = document.createElement('span');
        v.replaceChild(span, v.firstChild);
        M.countUp(span, parseInt(raw, 10), { duration: 620 });
      });
    }
  }

  /* ==================================================================== S1 */
  function renderMock() {
    // 端口列表
    var host = $('#portList');
    host.innerHTML = S.ports.map(function (p) {
      var caps = SEL.capsOfPort(p.id);
      return '<li><button class="port' + (p.id === S.ui.selectedPort ? ' is-active' : '') + '" data-port="' + p.id + '" type="button">' +
        '<span class="dot ' + (p.running ? 'dot--ok' : 'dot--idle') + '"></span>' +
        '<span><span class="port__ep">' + esc(p.ip) + ':' + p.port + '</span>' +
        '<span class="port__meta">' + esc(p.protocol) + ' · ' + esc(p.tls) + ' · ' + caps.length + ' 项能力 · ' + esc(p.createdAt) + '</span></span>' +
        '<span class="port__right"><span class="tag ' + (p.running ? 'tag--ok' : 'tag--ghost') + '">' + (p.running ? 'RUNNING' : 'STOPPED') + '</span>' +
        '<span class="port__meta">' + p.stats.req + ' req · ' + p.stats.rps + ' rps</span></span>' +
        '</button></li>';
    }).join('') || '<li class="empty">还没有 mock 端口，先在下方注册本机 IP 与端口</li>';

    var p = SEL.port();
    $('#pdProto').textContent = p ? p.protocol : '—';
    $('#pdPort').textContent = p ? (p.ip + ':' + p.port) : '—';
    var body = $('#portDetailBody');
    if (!p) { body.innerHTML = '<div class="empty">选择或新建一个 mock 端口</div>'; return; }

    var certHtml;
    if (p.cert.status === 'issued') {
      certHtml =
        '<div class="stack">' +
        '<div class="hstack"><span class="mx-mark is-done"><svg viewBox="0 0 24 24"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/></svg></span>' +
        '<b class="mono">' + esc(p.cert.cn) + '</b><span class="tag tag--ok">已签发</span></div>' +
        '<div class="cards">' +
        '<div class="card"><div class="card__k">有效期</div><div class="card__v">' + p.cert.days + ' 天</div></div>' +
        '<div class="card"><div class="card__k">签发时间</div><div class="card__v">' + esc(p.cert.issuedAt) + '</div></div>' +
        '<div class="card"><div class="card__k">签发机构</div><div class="card__v">' + esc(p.cert.issuer) + '</div></div>' +
        '<div class="card"><div class="card__k">指纹</div><div class="card__v" style="font-size:11px">' + esc(p.cert.fingerprint) + '</div></div>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" data-act="cert-download" type="button">下载证书文件</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="cert-reissue" type="button">重新签发</button>' +
        '<span class="muted small">证书用于对端校验本 mock 端点的 TLS 身份</span></div>' +
        '</div>';
    } else {
      certHtml =
        '<div class="stack">' +
        '<div class="hstack"><span class="mx-mark is-error"><svg viewBox="0 0 24 24"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg></span>' +
        '<b>尚未签发证书</b><span class="tag tag--danger">TLS 未就绪</span></div>' +
        '<div class="form__grid form__grid--2">' +
        '<label class="field"><span class="field__label">证书 CN</span><input class="input" id="certCn" value="' + esc('mock-' + p.port + '.' + p.ip) + '" data-fkey="certCn" /></label>' +
        '<label class="field"><span class="field__label">有效期（天）</span><select class="input" id="certDays"><option>90</option><option selected>365</option><option>730</option></select></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--primary" data-act="cert-gen" type="button" id="certGenBtn"><span>为 ' + esc(p.ip) + ':' + p.port + ' 生成证书</span></button>' +
        '<span class="muted small">签发后即可挂载能力并启动服务</span></div>' +
        '</div>';
    }

    var capChips = S.caps.map(function (c) {
      var on = p.caps.indexOf(c.id) >= 0;
      return '<button class="chk' + (on ? ' is-on' : '') + '" data-cap="' + c.id + '" type="button" aria-pressed="' + on + '">' +
        '<span class="dot" style="background:hsl(' + c.hue + ' 85% 60%)"></span>' + esc(c.name) + ' <em class="muted">' + c.code + '</em></button>';
    }).join('');

    body.innerHTML =
      '<div class="cards">' +
      '<div class="card"><div class="card__k">协议</div><div class="card__v">' + esc(p.protocol) + '</div></div>' +
      '<div class="card"><div class="card__k">TLS</div><div class="card__v">' + esc(p.tls) + '</div></div>' +
      '<div class="card"><div class="card__k">请求 / 成功 / 异常</div><div class="card__v">' + p.stats.req + ' / ' + p.stats.ok + ' / ' + p.stats.err + '</div></div>' +
      '<div class="card"><div class="card__k">当前 RPS</div><div class="card__v">' + p.stats.rps + '</div></div>' +
      '</div>' +
      '<div class="hr"></div>' +
      '<h3 class="small muted" style="letter-spacing:.12em">① 证书文件</h3>' + certHtml +
      '<div class="hr"></div>' +
      '<h3 class="small muted" style="letter-spacing:.12em">② 挂载平台能力（可多选）</h3>' +
      '<div class="checks">' + capChips + '</div>' +
      '<div class="hr"></div>' +
      '<h3 class="small muted" style="letter-spacing:.12em">③ MOCK 服务</h3>' +
      '<div class="hstack" id="svcBox"></div>';

    // 服务控制
    var box = $('#svcBox');
    var mark = el('span', 'mx-mark is-' + (p.running ? 'done' : 'idle'));
    mark.innerHTML = '<svg viewBox="0 0 24 24"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/></svg><span class="mx-mark__label">' + (p.running ? '服务运行中' : '服务已停止') + '</span>';
    box.appendChild(mark);
    if (p.running) {
      var stop = el('button', 'btn btn--danger', '<span class="mx-fuse__text">停止服务</span>');
      stop.type = 'button';
      box.appendChild(stop);
      X.fuseButton(stop, {
        label: '停止服务', doneLabel: '已停止', undoLabel: '撤销', undoWindow: 4200,
        onCommit: function () { A.stopService(p.id); toast('已停止 mock 服务', ':' + p.port + ' 不再接收请求；4 秒内可撤销', { tone: 'warn', actionLabel: '撤销', onAction: function () { A.startService(p.id); toast('已恢复服务', ':' + p.port); } }); },
        onUndo: function () { A.startService(p.id); toast('已撤销停止', ':' + p.port + ' 继续运行'); }
      });
    } else {
      var startBtn = el('button', 'btn btn--primary mx-hold', '<span class="mx-hold__label">按住启动 MOCK 服务</span>');
      startBtn.type = 'button';
      startBtn.disabled = p.cert.status !== 'issued' || !p.caps.length;
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
    var del = el('button', 'btn btn--sm btn--ghost', '删除端口');
    del.type = 'button';
    box.appendChild(del);
    X.fuseButton(del, {
      label: '删除端口', doneLabel: '已删除', undoWindow: 3200,
      onCommit: function () {
        var backup = JSON.parse(JSON.stringify(p));
        A.removePort(p.id);
        toast('已删除端口', backup.ip + ':' + backup.port, {
          tone: 'danger', actionLabel: '撤销',
          onAction: function () {
            S.ports.push(backup); S.ui.selectedPort = backup.id;
            MP.emit({ type: 'ports', action: 'restore' });
            toast('已恢复端口', backup.ip + ':' + backup.port, { tone: 'ok', duration: 2400 });
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
      if (cap) { var id = cap.dataset.cap; if (p.caps.indexOf(id) >= 0) A.detachCap(p.id, id); else A.attachCap(p.id, id); MP.sfx.play('toggle'); return; }
      var act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'cert-gen') {
        var btn = act, cn = ($('#certCn') || {}).value, days = +($('#certDays') || {}).value;
        // 技能规则：>300ms 的异步必须在按钮上给 loading（最短 300ms，带 aria-busy）
        var done = MP.btn.loading(btn, '签发中');
        setTimeout(function () {
          A.generateCert(p.id, { cn: cn, days: days });
          done();
          toast('证书已签发', cn + ' · 有效期 ' + days + ' 天', { tone: 'ok' });
        }, 620);
      }
      if (act && act.dataset.act === 'cert-download') {
        var pem = '-----BEGIN CERTIFICATE-----\n' +
          btoa(p.cert.cn + '|' + p.cert.fingerprint + '|' + p.cert.days).replace(/(.{64})/g, '$1\n') +
          '\n-----END CERTIFICATE-----\n';
        var blob = new Blob([pem], { type: 'application/x-pem-file' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = p.cert.cn + '.crt';
        document.body.appendChild(a); a.click(); a.remove();
        toast('证书文件已导出', a.download + '（PEM 格式）', { tone: 'ok' });
      }
      if (act && act.dataset.act === 'cert-reissue') {
        A.generateCert(p.id, { cn: p.cert.cn, days: p.cert.days });
        toast('已重新签发证书', p.cert.cn, { tone: 'ok' });
      }
    });

    // 注册端口
    var ipSel = $('#pfIp');
    ipSel.innerHTML = [S.host.ip, S.host.alt, '__custom__'].map(function (v) {
      return '<option value="' + v + '">' + (v === '__custom__' ? '手动输入…' : v) + '</option>';
    }).join('');
    var custom = el('input', 'input');
    custom.id = 'pfIpCustom'; custom.placeholder = '10.x.x.x'; custom.hidden = true;
    ipSel.parentElement.appendChild(custom);
    ipSel.addEventListener('change', function () { custom.hidden = ipSel.value !== '__custom__'; });

    $('#portForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var ip = ipSel.value === '__custom__' ? (custom.value || '').trim() : ipSel.value;
      var port = parseInt($('#pfPort').value, 10);
      var errEl = $('#pfPortErr'); var ok = true;
      var msg = '';
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { ok = false; msg = '请输入合法的 IPv4 地址'; }
      else if (!(port >= 1024 && port <= 65535)) { ok = false; msg = '端口需在 1024–65535 之间'; }
      else if (S.ports.some(function (p) { return p.ip === ip && p.port === port; })) { ok = false; msg = '该 IP:端口已被注册'; }
      errEl.hidden = ok; errEl.textContent = msg;
      $('#pfPort').closest('.field').classList.toggle('is-invalid', !ok);
      if (!ok) { MP.sfx.play('warn'); return; }
      var p = A.registerPort({ ip: ip, port: port, protocol: $('#pfProto').value, tls: $('#pfTls').value });
      MP.sfx.play('confirm');
      toast('已注册 mock 端口', p.ip + ':' + p.port + ' — 下一步签发证书、挂载平台能力', { tone: 'ok' });
    });
  }

  /* ==================================================================== S2 */
  function renderApiList() {
    var html = '';
    S.caps.forEach(function (c) {
      var apis = SEL.apisOfCap(c.id);
      if (!apis.length) return;
      html += '<div class="stack"><div class="hstack"><span class="dot" style="background:hsl(' + c.hue + ' 85% 60%)"></span>' +
        '<b class="small">' + esc(c.name) + '</b><span class="tag tag--ghost">' + c.code + ' · ' + c.version + '</span></div>';
      apis.forEach(function (a) {
        html += '<button class="row' + (a.id === S.ui.selectedApi ? ' is-active' : '') + '" data-api="' + a.id + '" type="button" style="text-align:left">' +
          '<span class="row__t"><span class="tag tag--ghost">' + a.method + '</span> ' + esc(a.path) + '</span>' +
          '<span class="row__s">' + esc(a.name) + ' · ' + a.delayMs + 'ms · ' + a.fields.length + ' 字段 · ' + a.hits + ' 次命中' + (a.interactions.length ? ' · 含人机交互' : '') + '</span>' +
          '</button>';
      });
      html += '</div>';
    });
    $('#apiList').innerHTML = html || '<div class="empty">暂无接口</div>';
  }

  function renderStudio() {
    var a = SEL.api();
    var box = $('#respStudio');
    if (!a) { box.innerHTML = '<div class="empty">先选择一个接口</div>'; $('#apiTools').innerHTML = ''; return; }
    $('#apiTools').innerHTML = '<span class="tag tag--ghost">' + a.method + ' ' + esc(a.path) + '</span><span class="muted small">命中 ' + a.hits + ' 次</span>';

    var statusOpts = [200, 201, 202, 400, 403, 404, 409, 500, 503].map(function (s) {
      return '<option value="' + s + '"' + (s === a.status ? ' selected' : '') + '>' + s + ' ' + ({ 200: 'OK', 201: 'Created', 202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Server Error', 503: 'Unavailable' })[s] + '</option>';
    }).join('');

    var fieldRows = a.fields.map(function (f) {
      var r = f.rule || { kind: 'fixed' };
      var typeOpts = S.fieldTypes.map(function (t) { return '<option' + (t === f.type ? ' selected' : '') + '>' + t + '</option>'; }).join('');
      var ruleOpts = Object.keys(MP.RULE_META).map(function (k) { return '<option value="' + k + '"' + (k === r.kind ? ' selected' : '') + '>' + MP.RULE_META[k].name + '</option>'; }).join('');
      var param = '';
      if (r.kind === 'increment') {
        param = '<label class="field"><span class="field__label">起点</span><input class="input" data-f="' + f.id + '" data-rk="start" value="' + (r.start || 1) + '" data-fkey="rk-' + f.id + '"/></label>' +
          '<label class="field"><span class="field__label">步长</span><input class="input" data-f="' + f.id + '" data-rk="step" value="' + (r.step || 1) + '" data-fkey="rs-' + f.id + '"/></label>' +
          '<label class="field" style="grid-column:span 2"><span class="field__label">格式</span><input class="input" data-f="' + f.id + '" data-rk="pattern" value="' + esc(r.pattern || '') + '" placeholder="GNB-HZ-{n:04}" data-fkey="rp-' + f.id + '"/></label>';
      } else if (r.kind === 'once') {
        param = '<label class="field"><span class="field__label">生效次数</span><input class="input" data-f="' + f.id + '" data-rk="times" value="' + (r.times || 1) + '" data-fkey="rt-' + f.id + '"/></label>' +
          '<label class="field" style="grid-column:span 3"><span class="field__label">兜底值</span><input class="input" data-f="' + f.id + '" data-rk="fallback" value="' + esc(r.fallback || '') + '" data-fkey="rf-' + f.id + '"/></label>';
      } else if (r.kind === 'conditional') {
        var keys = a.fields.filter(function (x) { return x.key !== f.key; }).map(function (x) { return x.key; });
        var ops = ['等于', '包含', '非空', '末尾为偶数'];
        param = '<label class="field"><span class="field__label">条件字段</span><select class="input" data-f="' + f.id + '" data-rk="when.key">' + keys.map(function (k) { return '<option' + (r.when && r.when.key === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span class="field__label">操作符</span><select class="input" data-f="' + f.id + '" data-rk="when.op">' + ops.map(function (o) { return '<option' + (r.when && r.when.op === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span class="field__label">命中时</span><input class="input" data-f="' + f.id + '" data-rk="then" value="' + esc(r.then || '') + '" data-fkey="rc-' + f.id + '"/></label>' +
          '<label class="field"><span class="field__label">否则</span><input class="input" data-f="' + f.id + '" data-rk="else" value="' + esc(r.else || '') + '" data-fkey="re-' + f.id + '"/></label>';
      } else if (r.kind === 'random') {
        param = '<label class="field" style="grid-column:span 4"><span class="field__label">候选值（逗号分隔）</span><input class="input" data-f="' + f.id + '" data-rk="options" value="' + esc((f.options || []).join(',')) + '" data-fkey="ro-' + f.id + '"/></label>';
      }
      var valueCell = f.source === 'select'
        ? '<select class="input" data-fid="' + f.id + '" data-prop="value">' + (f.options || []).map(function (o) { return '<option' + (String(o) === String(f.value) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
        : '<input class="input" data-fid="' + f.id + '" data-prop="value" value="' + esc(f.value) + '" data-fkey="fv-' + f.id + '" />';
      return '<div class="panel" style="border-radius:8px;background:rgba(15,15,35,.4)">' +
        '<div class="panel__body" style="gap:8px">' +
        '<div class="hstack">' +
        '<input class="input" style="max-width:220px" data-fid="' + f.id + '" data-prop="key" value="' + esc(f.key) + '" aria-label="字段路径" data-fkey="fk-' + f.id + '"/>' +
        '<select class="input" style="max-width:120px" data-fid="' + f.id + '" data-prop="type" aria-label="类型">' + typeOpts + '</select>' +
        '<select class="input" style="max-width:110px" data-fid="' + f.id + '" data-prop="source" aria-label="取值方式"><option value="manual"' + (f.source === 'manual' ? ' selected' : '') + '>手工填写</option><option value="select"' + (f.source === 'select' ? ' selected' : '') + '>下拉选择</option></select>' +
        '<span style="min-width:180px">' + valueCell + '</span>' +
        '<span class="right"></span>' +
        '<select class="input" style="max-width:132px" data-fid="' + f.id + '" data-prop="rulekind" data-tone="' + ((MP.RULE_META[r.kind] || {}).tone || 'neutral') + '" aria-label="生效规则">' + ruleOpts + '</select>' +
        '<button class="iconbtn" data-del-field="' + f.id + '" type="button" aria-label="删除字段"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
        '</div>' +
        (param ? '<div class="form__grid form__grid--2" style="grid-template-columns:repeat(4,minmax(0,1fr))">' + param + '</div>' : '') +
        '<div class="muted small">' + esc(f.desc || '') + ' · ' + MP.RULE_META[r.kind].hint + '</div>' +
        '</div></div>';
    }).join('');

    var ixRows = a.interactions.map(function (ix) {
      var meta = { 'human-confirm': ['人工确认', 'tag--accent'], 'captcha': ['验证码', 'tag--warn'], 'manual-gate': ['人工闸门', 'tag--danger'] }[ix.kind] || ['人工确认', 'tag--ghost'];
      return '<div class="hstack"><span class="tag ' + meta[1] + '">' + meta[0] + '</span><span class="row__s">' + esc(ix.label) + ' · 负责人 ' + esc(ix.owner) + ' · 超时 ' + ix.timeoutS + 's</span>' +
        '<button class="iconbtn right" data-del-ix="' + ix.id + '" type="button" aria-label="移除人机交互">×</button></div>';
    }).join('') || '<div class="muted small">未插入人机交互：命中该接口时会直接返回定制响应</div>';

    box.innerHTML =
      '<div class="form__grid form__grid--2">' +
      '<label class="field"><span class="field__label">HTTP Status Code</span><select class="input" id="apiStatus">' + statusOpts + '</select></label>' +
      '<div class="field"><span class="field__label">响应延迟（拖拽 / 方向键）</span><div class="hstack"><div id="delayScrub"></div><span class="muted small">命中后等待该时长再返回</span></div></div>' +
      '</div>' +
      '<div class="hstack"><b class="small">响应字段（面向对象定制）</b><span class="muted small">每个字段可单独设取值方式与生效规则</span>' +
      '<button class="btn btn--sm right" id="addFieldBtn" type="button">+ 新增字段</button></div>' +
      '<div class="stack" id="fieldList">' + fieldRows + '</div>' +
      '<div class="hr"></div>' +
      '<div class="hstack"><b class="small">人机交互</b><span class="muted small">在自动响应中间插入需要人操作的环节</span></div>' +
      '<div id="ixBox">' + ixRows + '</div>' +
      '<div class="hstack"><span id="ixAdd"></span>' +
      '<button class="btn btn--primary btn--sm right" id="triggerBtn" type="button"><span>手动触发一次请求</span></button></div>';

    X.scrub($('#delayScrub'), {
      label: '延迟', value: a.delayMs, min: 0, max: 3000, step: 10, suffix: ' ms',
      onChange: function (v) { A.updateApi(a.id, { delayMs: v }); }
    });
    X.segmented($('#ixAdd'), {
      items: [{ label: '人工确认', value: 'human-confirm' }, { label: '验证码', value: 'captcha' }, { label: '人工闸门', value: 'manual-gate' }],
      onChange: function (v) { A.addInteraction(a.id, v); toast('已插入人机交互', { 'human-confirm': '人工确认', captcha: '验证码', 'manual-gate': '人工闸门' }[v], { tone: 'ok' }); }
    });
  }

  function bindFlow() {
    $('#apiList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-api]'); if (!b) return;
      A.selectApi(b.dataset.api); MP.sfx.play('step');
    });
    $('#respStudio').addEventListener('change', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target;
      if (t.id === 'apiStatus') { A.updateApi(a.id, { status: +t.value }); toast('已更新状态码', t.value, { tone: 'ok', duration: 2600 }); return; }
      var fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (prop === 'rulekind' && fid) { A.updateField(a.id, fid, { rule: { kind: t.value } }); keepFocus(renderStudio); return; }
      if (prop === 'source' && fid) { A.updateField(a.id, fid, { source: t.value }); keepFocus(renderStudio); return; }
      if (prop && fid) { A.updateField(a.id, fid, { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a.id, rf, rk, t.value); return; }
    });
    $('#respStudio').addEventListener('input', function (e) {
      var a = SEL.api(); if (!a) return;
      var t = e.target, fid = t.dataset.fid, prop = t.dataset.prop, rk = t.dataset.rk, rf = t.dataset.f;
      if (fid && prop === 'key') { A.updateField(a.id, fid, { key: t.value }); return; }
      if (fid && prop === 'value') { A.updateField(a.id, fid, { value: t.value }); return; }
      if (rk && rf) { applyRuleParam(a.id, rf, rk, t.value); return; }
    });
    $('#respStudio').addEventListener('click', function (e) {
      var a = SEL.api(); if (!a) return;
      var del = e.target.closest('[data-del-field]');
      if (del) { A.removeField(a.id, del.dataset.delField); renderStudio(); MP.sfx.play('undo'); return; }
      var dix = e.target.closest('[data-del-ix]');
      if (dix) { A.removeInteraction(a.id, dix.dataset.delIx); renderStudio(); MP.sfx.play('undo'); return; }
      if (e.target.closest('#addFieldBtn')) {
        var nf = A.addField(a.id);
        renderStudio();
        var input = document.querySelector('[data-fid="' + nf.id + '"][data-prop="key"]');
        if (input) { input.focus(); input.select(); }
        toast('已新增字段', '填入路径与取值即可生效', { duration: 2400 });
        return;
      }
      var trig = e.target.closest('#triggerBtn');
      if (trig) {
        var log = A.triggerApi(a.id);
        var notes = (log.res.notes || []).map(function (n) { return n.key + ' = ' + n.value + '（' + n.note + '）'; });
        toast('已触发 ' + a.method + ' ' + a.path, notes.slice(0, 3).join(' · ') + (notes.length > 3 ? ' 等 ' + notes.length + ' 项' : ''), { tone: 'ok', duration: 6000 });
        MP.sfx.play('confirm');
      }
    });

    // 日志过滤
    X.segmented($('#logFilter'), {
      items: [{ label: '全部', value: 'all' }, { label: '成功', value: 'ok' }, { label: '异常', value: 'err' }, { label: '待人工', value: 'human' }],
      value: 'all',
      onChange: function (v) { A.setLogFilter(v); }
    });
    $('#logQuery').addEventListener('input', function (e) { A.setLogQuery(e.target.value); });
    $('#logBody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-log]'); if (!tr) return;
      var id = tr.dataset.log;
      if (e.target.closest('[data-approve]')) { A.resolveInteraction(id, 'approve'); toast('已人工放行', '请求继续执行', { tone: 'ok' }); return; }
      if (e.target.closest('[data-reject]')) { A.resolveInteraction(id, 'reject'); toast('已人工拒绝', '请求被终止（403）', { tone: 'danger' }); return; }
      if (e.target.closest('[data-replay]')) {
        var log = MP.byId(S.logs, id); if (!log) return;
        var api = S.apis.filter(function (x) { return x.path === log.path; })[0];
        if (api) { A.triggerApi(api.id); MP.sfx.play('confirm'); toast('已重放请求', log.method + ' ' + log.path, { duration: 2600 }); }
        else toast('该路径无匹配的定制接口', log.path, { tone: 'warn' });
        return;
      }
      tr.classList.toggle('is-open');
      var next = tr.nextElementSibling;
      if (next && next.classList.contains('table__exp')) next.remove();
      else tr.insertAdjacentElement('afterend', logExpand(MP.byId(S.logs, id)));
      MP.sfx.play('step');
    });
  }

  function logExpand(l) {
    if (!l) return el('tr');
    var tr = el('tr', 'table__exp');
    var notes = (l.res && l.res.notes) ? '<div class="rule-note">' + l.res.notes.map(function (n) { return '<span>' + esc(n.key) + ' = ' + esc(n.value) + ' · ' + esc(n.rule) + ' · ' + esc(n.note) + '</span>'; }).join('') + '</div>' : '';
    tr.innerHTML = '<td colspan="9"><div class="cols2">' +
      '<div><h4>REQUEST</h4><pre>' + esc(JSON.stringify(l.req || {}, null, 2)) + '</pre></div>' +
      '<div><h4>RESPONSE</h4><pre>' + esc(JSON.stringify(l.res || {}, null, 2)) + '</pre></div>' +
      '</div>' + notes + '</td>';
    return tr;
  }

  function logRow(l) {
    var tr = el('tr', 'is-new');
    tr.dataset.log = l.id;
    tr.innerHTML =
      '<td class="mono">' + l.clock + '</td>' +
      '<td class="mono">' + esc((MP.byId(S.ports, l.portId) || {}).port || '—') + '</td>' +
      '<td class="mono">' + l.method + '</td>' +
      '<td class="mono">' + esc(l.path) + '</td>' +
      '<td><span class="status-code ' + statusCls(l.status) + '">' + l.status + '</span></td>' +
      '<td class="mono">' + l.latencyMs + 'ms</td>' +
      '<td class="mono">' + esc(l.ne) + '</td>' +
      '<td>' + (l.interaction && l.interaction.status === 'pending'
        ? '<span class="tag tag--accent">待人工 · ' + esc(l.interaction.label || '') + '</span>'
        : '<span class="muted small">' + esc(l.verdict) + '</span>') + '</td>' +
      '<td class="right">' +
      (l.interaction && l.interaction.status === 'pending'
        ? '<button class="btn btn--sm" data-approve type="button">放行</button> <button class="btn btn--sm btn--danger" data-reject type="button">拒绝</button>'
        : '<button class="btn btn--sm btn--ghost" data-replay type="button">重放</button>') +
      '</td>';
    return tr;
  }

  function renderLogs(full) {
    var body = $('#logBody');
    if (full) {
      var list = SEL.logsFiltered();
      body.innerHTML = '';
      list.slice(0, 120).forEach(function (l) { body.appendChild(logRow(l)); });
      if (!list.length) $('#logWrap').innerHTML = '<div class="empty">没有符合条件的请求</div>';
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
    body.insertBefore(logRow(l), body.firstChild);
    while (body.children.length > 120) body.removeChild(body.lastChild);
  }

  /* ==================================================================== S3 */
  var neTab = 'profile';
  function renderNe() {
    $('#neList').innerHTML = S.nes.map(function (n) {
      return '<button class="row' + (n.id === neSel ? ' is-active' : '') + '" data-ne="' + n.id + '" type="button" style="text-align:left">' +
        '<span class="row__t"><span class="dot ' + (n.status === '在线' ? 'dot--ok' : n.status === '升级中' ? 'dot--warn' : 'dot--idle') + '"></span> ' + esc(n.name) + '</span>' +
        '<span class="row__s mono">' + esc(n.neId) + '</span><span class="row__s">' + esc(n.type) + ' · ' + esc(n.arch) + ' · V' + esc(n.version) + ' · ' + esc(n.vendor) + (n.group ? ' · ' + esc((SEL.group(n.group) || {}).name || '') : ' · 未成组') + '</span>' +
        '</button>';
    }).join('') || '<div class="empty">暂无网元</div>';

    $('#groupList').innerHTML = S.groups.map(function (g) {
      return '<div class="row"><span><span class="row__t">' + esc(g.name) + '</span><span class="row__s">' + esc(g.strategy) + ' · ' + g.members.length + ' 个成员</span></span>' +
        '<span class="row__right">' + g.members.map(function (m) { return '<span class="tag tag--ghost">' + esc((MP.byId(S.nes, m) || {}).code || '') + '</span>'; }).join('') + '</span></div>';
    }).join('') || '<div class="empty">暂无网元组</div>';

    var n = MP.byId(S.nes, neSel) || S.nes[0];
    if (!n) { $('#neBody').innerHTML = '<div class="empty">先新建一个网元</div>'; return; }
    neSel = n.id;
    $('#neDetailTitle').textContent = n.name;
    $('#neTools').innerHTML = '<span class="tag tag--ghost">' + esc(n.neId) + '</span>' +
      '<span class="tag tag--ghost">' + esc(n.code) + '</span>' +
      '<span class="tag ' + (n.status === '在线' ? 'tag--ok' : n.status === '升级中' ? 'tag--warn' : 'tag--ghost') + '">' + esc(n.status) + '</span>';

    var body = $('#neBody');
    if (neTab === 'profile') {
      var opts = function (arr, cur) { return arr.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); };
      body.innerHTML =
        '<div class="form__grid form__grid--2">' +
        '<label class="field"><span class="field__label">网元名称</span><input class="input" data-nef="name" value="' + esc(n.name) + '" data-fkey="ne-name"/></label>' +
        '<label class="field"><span class="field__label">网元编号</span><input class="input" data-nef="neId" value="' + esc(n.neId) + '" data-fkey="ne-code"/><em class="field__hint">用于参数校验，格式 ' + esc(n.code) + '-区号-四位序号</em></label>' +
        '<label class="field"><span class="field__label">类型</span><select class="input" data-nef="type">' + opts(S.neTypes, n.type) + '</select></label>' +
        '<label class="field"><span class="field__label">架构</span><select class="input" data-nef="arch">' + opts(S.arches, n.arch) + '</select></label>' +
        '<label class="field"><span class="field__label">厂商</span><select class="input" data-nef="vendor">' + opts(S.vendors, n.vendor) + '</select></label>' +
        '<label class="field"><span class="field__label">版本</span><input class="input" data-nef="version" value="' + esc(n.version) + '" data-fkey="ne-ver"/></label>' +
        '<label class="field"><span class="field__label">使用软件名称</span><input class="input" data-nef="softName" value="' + esc(n.softName) + '" data-fkey="ne-soft"/></label>' +
        '<label class="field"><span class="field__label">型号</span><input class="input" value="' + esc(n.model) + '" readonly /></label>' +
        '</div>' +
        '<div class="hr"></div>' +
        '<div class="hstack"><b class="small">旧版本（可回滚）</b>' + n.oldVersions.map(function (v) { return '<span class="tag tag--ghost">V' + esc(v) + '</span>'; }).join('') + '</div>' +
        '<div class="hr"></div>' +
        '<div class="hstack"><b class="small">网元属性</b>' + Object.keys(n.params).map(function (k) {
          return '<span class="tag">' + esc(k) + ' <em class="muted">' + esc(n.params[k]) + '</em></span>';
        }).join('') + '</div>' +
        '<div class="hstack"><span class="muted small">属性改动即时生效，用于对端接口的字段级定制</span>' +
        '<button class="btn btn--sm right" id="neSave" type="button">保存属性</button></div>';
    } else if (neTab === 'valid') {
      body.innerHTML =
        '<div class="hstack"><b class="small">参数校验规则</b><span class="muted small">对端上报字段会被这些规则检查</span>' +
        '<button class="btn btn--sm right" id="validRun" type="button">执行校验</button></div>' +
        '<div class="stack" id="validList">' + n.validations.map(function (v) {
          return '<div class="row"><span><span class="row__t mono">' + esc(v.field) + '</span><span class="row__s">' + esc(v.rule) + ' · ' + esc(v.message) + '</span></span>' +
            '<span class="row__right"><span class="tag ' + (v.level === '错误' ? 'tag--danger' : 'tag--warn') + '">' + esc(v.level) + '</span></span></div>';
        }).join('') + '</div>' +
        '<div class="hr"></div>' +
        '<div class="form__grid form__grid--2">' +
        '<label class="field"><span class="field__label">字段</span><input class="input" id="vField" value="neId" /></label>' +
        '<label class="field"><span class="field__label">级别</span><select class="input" id="vLevel"><option>错误</option><option>警告</option></select></label>' +
        '<label class="field" style="grid-column:span 2"><span class="field__label">正则 / 规则</span><input class="input" id="vRule" placeholder="^GNB-[A-Z]{2}-\\d{4}$" /></label>' +
        '<label class="field" style="grid-column:span 2"><span class="field__label">不通过的提示</span><input class="input" id="vMsg" placeholder="网元编号格式不合法" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" id="validAdd" type="button">新增规则</button><span id="validResult" class="grow"></span></div>';
    } else if (neTab === 'flow') {
      body.innerHTML =
        '<div class="hstack"><b class="small">升级流程步骤</b><span class="muted small">共 ' + n.upgrade.length + ' 步 · 预计 ' + n.upgrade.reduce(function (a, s) { return a + (s.durationS || 0); }, 0) + 's（人工步骤不计时）</span></div>' +
        '<ul class="steps">' + n.upgrade.map(function (s, i) {
          var kindTag = s.kind === 'auto' ? '<span class="tag tag--ghost">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工</span>';
          return '<li class="step"><span class="step__idx">' + (i + 1) + '</span>' +
            '<span><span class="step__name">' + esc(s.name) + '</span>' +
            '<span class="step__meta">' + kindTag + (s.kind === 'auto' ? ' ' + s.durationS + 's' : '') + (s.interaction ? ' · 负责人 ' + esc(s.interaction.owner) + ' · 超时 ' + s.interaction.timeoutS + 's' : '') + '</span></span>' +
            '<span class="step__right">' +
            '<button class="iconbtn" data-step-up="' + s.id + '" type="button" aria-label="上移">↑</button>' +
            '<button class="iconbtn" data-step-down="' + s.id + '" type="button" aria-label="下移">↓</button>' +
            '<button class="iconbtn" data-step-del="' + s.id + '" type="button" aria-label="删除">×</button>' +
            '</span></li>';
        }).join('') + '</ul>' +
        '<div class="hr"></div>' +
        '<div class="form__grid form__grid--2">' +
        '<label class="field"><span class="field__label">新步骤名称</span><input class="input" id="stepName" placeholder="例如：业务验证" /></label>' +
        '<label class="field"><span class="field__label">类型</span><select class="input" id="stepKind"><option value="auto">自动</option><option value="manual">手动</option><option value="human">人工（插入人机交互）</option></select></label>' +
        '</div>' +
        '<div class="hstack"><button class="btn btn--sm" id="stepAdd" type="button">新增步骤</button>' +
        '<span class="muted small">类型选「人工」时会自动挂上人工确认（负责人 / 超时）</span></div>';
    } else {
      body.innerHTML =
        '<div class="stack">' +
        '<label class="field"><span class="field__label">归入网元组</span><select class="input" id="neGroup">' +
        '<option value="">（不分组）</option>' + S.groups.map(function (g) { return '<option value="' + g.id + '"' + (g.id === n.group ? ' selected' : '') + '>' + esc(g.name) + ' · ' + g.members.length + ' 个成员</option>'; }).join('') +
        '</select></label>' +
        '<div class="hstack"><button class="btn btn--sm" id="groupNew" type="button">新建网元组</button>' +
        '<span class="muted small">同组网元可批量下发升级任务</span></div>' +
        '<div class="hr"></div>' +
        '<div class="hstack"><button class="btn btn--sm btn--primary" id="neCopy" type="button">复制网元</button>' +
        '<span class="muted small">复制后编号顺延一位，属性 / 校验 / 升级流程全部继承</span></div>' +
        '</div>';
    }
  }

  var neSel = null;
  function bindNe() {
    $('#neList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ne]'); if (!b) return;
      neSel = b.dataset.ne; renderNe(); MP.sfx.play('step');
    });
    $('#neTabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-netab]'); if (!t) return;
      neTab = t.dataset.netab;
      $$('#neTabs .tabs__t').forEach(function (x) { x.classList.toggle('is-active', x === t); });
      renderNe();
    });
    $('#neNew').addEventListener('click', function () {
      var n = A.addNE({ name: '新网元 ' + (S.nes.length + 1), code: 'GNB', type: S.neTypes[0], arch: S.arches[0], vendor: S.vendors[0], version: '7.0.0' });
      neSel = n.id; neTab = 'profile'; renderNe();
      toast('已创建网元', n.name + '，补充属性后即可用于 mock', { tone: 'ok' });
    });
    $('#neBody').addEventListener('change', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var f = e.target.dataset.nef;
      if (f) { var patch = {}; patch[f] = e.target.value; A.updateNE(n.id, patch); }
      if (e.target.id === 'neGroup') { A.assignGroup(n.id, e.target.value); toast('已调整分组', e.target.value ? (SEL.group(e.target.value) || {}).name : '未分组', { duration: 2400 }); }
    });
    $('#neBody').addEventListener('click', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var up = e.target.closest('[data-step-up]'), down = e.target.closest('[data-step-down]'), del = e.target.closest('[data-step-del]');
      if (up) { A.moveStep(n.id, up.dataset.stepUp, -1); return; }
      if (down) { A.moveStep(n.id, down.dataset.stepDown, 1); return; }
      if (del) { A.removeStep(n.id, del.dataset.stepDel); MP.sfx.play('undo'); return; }
      if (e.target.closest('#neSave')) { toast('属性已保存', n.name + ' · ' + n.type + ' / V' + n.version, { tone: 'ok' }); return; }
      if (e.target.closest('#stepAdd')) {
        var name = ($('#stepName') || {}).value || '新步骤';
        var kind = ($('#stepKind') || {}).value || 'auto';
        A.addUpgradeStep(n.id, { name: name, kind: kind, durationS: kind === 'auto' ? 30 : 60 });
        toast('已新增升级步骤', name + '（' + ({ auto: '自动', manual: '手动', human: '人工' })[kind] + '）', { tone: 'ok', duration: 2400 });
        return;
      }
      if (e.target.closest('#validAdd')) {
        A.addValidation(n.id, { field: ($('#vField') || {}).value, rule: ($('#vRule') || {}).value, level: ($('#vLevel') || {}).value, message: ($('#vMsg') || {}).value });
        toast('已新增校验规则', ($('#vField') || {}).value, { tone: 'ok', duration: 2400 });
        return;
      }
      if (e.target.closest('#validRun')) {
        var target = $('#validResult');
        X.latticeLoader(target, { label: '校验中' });
        setTimeout(function () {
          var res = A.runValidation(n.id);
          var pass = res.filter(function (r) { return r.pass; }).length;
          target.innerHTML = res.map(function (r) {
            return '<span class="mx-mark is-' + (r.pass ? 'done' : 'error') + '" style="margin-right:10px">' +
              '<svg viewBox="0 0 24 24"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/><path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg>' +
              '<span class="mx-mark__label">' + esc(r.field) + '：' + esc(r.message) + '</span></span>';
          }).join('');
          toast(pass === res.length ? '参数校验全部通过' : '参数校验发现问题', pass + '/' + res.length + ' 条规则通过', { tone: pass === res.length ? 'ok' : 'warn' });
        }, 900);
        return;
      }
      if (e.target.closest('#neCopy')) {
        var c = A.copyNE(n.id);
        toast('已复制网元', c.name, {
          tone: 'ok', actionLabel: '撤销',
          onAction: function () { S.nes = S.nes.filter(function (x) { return x.id !== c.id; }); MP.emit({ type: 'ne' }); toast('已撤销复制', c.name, { duration: 2400 }); }
        });
        MP.sfx.play('confirm');
        return;
      }
      if (e.target.closest('#groupNew')) {
        var g = A.addGroup({ name: '新网元组 ' + (S.groups.length + 1), desc: '手动创建', strategy: '串行 · 每台间隔 60s' });
        A.assignGroup(n.id, g.id);
        toast('已新建网元组', g.name + '，当前网元已归入', { tone: 'ok' });
      }
    });
  }

  /* ==================================================================== S4 */
  function renderOmp() {
    var managedGroups = S.groups.slice();
    $('#ompScopeMeta').textContent = S.nes.length + ' 个网元 / ' + managedGroups.length + ' 个组';
    $('#ompScope').innerHTML = S.nes.map(function (n) {
      return '<div class="row"><span><span class="row__t">' + esc(n.name) + '</span><span class="row__s mono">' + esc(n.code) + ' · ' + esc(n.arch) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (n.group ? 'tag--ok' : 'tag--ghost') + '">' + (n.group ? esc((SEL.group(n.group) || {}).name || '') : '未纳入平台') + '</span></span></div>';
    }).join('') + '<div class="hr"></div>' + managedGroups.map(function (g) {
      return '<div class="row"><span><span class="row__t">组 · ' + esc(g.name) + '</span><span class="row__s">' + esc(g.strategy) + '</span></span>' +
        '<span class="row__right"><span class="tag tag--accent">' + g.members.length + ' 成员</span></span></div>';
    }).join('');

    $('#accCount').textContent = S.accounts.length + ' 个账号';
    $('#accList').innerHTML = S.accounts.map(function (a) {
      return '<div class="row"><span><span class="row__t mono">' + esc(a.name) + '</span><span class="row__s">' + esc(a.role) + ' · 授权 ' + a.nes.length + ' 个网元 · ' + esc(a.createdAt) + '</span></span>' +
        '<span class="row__right"><span id="acc-' + a.id + '"></span></span></div>';
    }).join('') || '<div class="empty">暂无账号</div>';
    S.accounts.forEach(function (a) {
      var host = $('#acc-' + a.id); if (!host) return;
      var sw = el('button', 'mx-sw'); sw.type = 'button'; sw.setAttribute('aria-label', '启用或停用账号 ' + a.name);
      host.appendChild(sw);
      X.velocitySwitch(sw, { checked: a.status === '启用', label: a.name, onChange: function (on) { A.toggleAccount(a.id); toast(on ? '账号已启用' : '账号已停用', a.name + ' · ' + a.role, { duration: 2400 }); } });
    });
    // 账号授权网元
    $('#acNes').innerHTML = S.nes.map(function (n) {
      return '<label class="chk"><input type="checkbox" value="' + n.id + '" />' + esc(n.name) + '</label>';
    }).join('');

    $('#taskWrap').innerHTML = S.tasks.map(function (t) {
      var gaugeId = 'gauge-' + t.id;
      var steps = t.steps.map(function (s, i) {
        return '<span class="tag ' + (s.state === 'done' ? 'tag--ok' : s.state === 'active' ? 'tag--accent' : 'tag--ghost') + '">' + (i + 1) + '. ' + esc(s.name) + '</span>';
      }).join('');
      return '<div class="panel" style="background:rgba(15,15,35,.45)"><div class="panel__body" style="gap:10px">' +
        '<div class="hstack"><b>' + esc(t.name) + '</b><span class="tag tag--ghost">' + esc(t.site) + '</span>' +
        '<span class="tag ' + (t.status === 'done' ? 'tag--ok' : t.status === 'waiting-human' ? 'tag--accent' : 'tag--warn') + '">' + ({ done: '已完成', 'waiting-human': '等待人工', running: '执行中' })[t.status] + '</span>' +
        '<span class="right muted small">' + esc(t.owner) + '</span></div>' +
        '<div class="hstack"><div id="' + gaugeId + '"></div>' +
        '<div class="stack grow">' + steps + '<span class="muted small">创建于 ' + esc(t.createdAt) + ' · 关联站点 ' + esc(t.site) + '</span></div>' +
        '<button class="btn btn--sm" data-task-advance="' + t.id + '" type="button">推进下一步</button>' +
        '</div></div></div>';
    }).join('') || '<div class="empty">暂无任务</div>';
    S.tasks.forEach(function (t) {
      var host = document.getElementById('gauge-' + t.id); if (!host) return;
      X.gauge(host, { value: t.progress, label: '升级进度' });
    });

    $('#tkSite').innerHTML = S.sites.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '（' + esc(s.region) + '）</option>'; }).join('');
    $('#tkGroup').innerHTML = S.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + ' · ' + g.members.length + ' 个网元</option>'; }).join('');
  }

  function bindOmp() {
    $('#accForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#acName').value.trim();
      if (!name) { $('#acName').focus(); MP.sfx.play('warn'); return; }
      var nes = $$('#acNes input:checked').map(function (i) { return i.value; });
      A.createAccount({ name: name, role: $('#acRole').value, nes: nes, scope: [] });
      $('#acName').value = '';
      MP.sfx.play('confirm');
      toast('已创建账号', name + ' · 授权 ' + nes.length + ' 个网元', { tone: 'ok' });
    });
    $('#taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#tkName').value.trim();
      var gid = $('#tkGroup').value;
      if (!name) { $('#tkName').focus(); MP.sfx.play('warn'); return; }
      var g = SEL.group(gid);
      var t = A.createTask({ name: name, site: (MP.byId(S.sites, $('#tkSite').value) || {}).name, neIds: g ? g.members.slice() : [], owner: 'zhangwei' });
      $('#tkName').value = '';
      MP.sfx.play('confirm');
      toast('已创建一体化升级任务', t.name + ' · 关联 ' + t.site + ' · ' + t.steps.length + ' 个步骤', { tone: 'ok' });
    });
    $('#taskWrap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-task-advance]'); if (!b) return;
      var t = MP.byId(S.tasks, b.dataset.taskAdvance);
      A.advanceTask(t.id);
      var idx = t.steps.map(function (s) { return s.state; }).indexOf('active');
      if (t.status === 'waiting-human') {
        toast('任务等待人工放行', t.steps[idx] ? t.steps[idx].name : '人工步骤', { tone: 'warn', actionLabel: '立即放行', onAction: function () { A.advanceTask(t.id); toast('已放行', t.name + ' 继续执行', { tone: 'ok' }); } });
        MP.sfx.play('warn');
      } else if (t.status === 'done') {
        toast('任务已完成', t.name, { tone: 'ok' });
      } else {
        toast('已推进', t.steps[idx] ? t.steps[idx].name : '下一步', { duration: 2400 });
      }
      MP.sfx.play('step');
    });
  }

  /* ==================================================================== S5 */
  var pkgFilter = 'all';
  function renderLcm() {
    X.segmented($('#pkgFilter'), {
      items: [{ label: '全部', value: 'all' }, { label: '已校验', value: 'ok' }, { label: '待校验', value: 'todo' }],
      value: pkgFilter, onChange: function (v) { pkgFilter = v; renderLcm(); }
    });
    var list = S.packages.filter(function (p) { return pkgFilter === 'all' || (pkgFilter === 'ok' ? p.validated : !p.validated); });
    $('#pkgCount').textContent = list.length + ' / ' + S.packages.length;
    $('#pkgList').innerHTML = list.map(function (p) {
      var ne = MP.byId(S.nes, p.ne);
      return '<div class="row"><span><span class="row__t mono">' + esc(p.name) + '</span>' +
        '<span class="row__s">' + esc(p.type) + ' · ' + esc(p.vendor) + ' · V' + esc(p.version) + ' · ' + p.sizeMB + 'MB · MD5 ' + esc(p.md5) + ' · 所属 ' + (ne ? esc(ne.name) : '平台级') + '</span></span>' +
        '<span class="row__right">' + (p.validated ? '<span class="tag tag--ok">已校验</span>' : '<button class="btn btn--sm" data-pkg-validate="' + p.id + '" type="button">走校验</button>') +
        '<button class="iconbtn" data-pkg-del="' + p.id + '" type="button" aria-label="移除软件包">×</button></span></div>';
    }).join('') || '<div class="empty">没有符合条件的软件包</div>';

    $('#lcmScopeMeta').textContent = S.nes.length + ' 个受管网元';
    $('#lcmScope').innerHTML = S.nes.map(function (n) {
      return '<label class="chk" style="margin:2px"><input type="checkbox" checked />' + esc(n.name) + ' <em class="muted">V' + esc(n.version) + '</em></label>';
    }).join('');

    var box = $('#deployBox');
    box.innerHTML = '<div class="stack">' +
      '<div class="hstack"><b class="small">与网元管理平台共部署</b><span id="coDeploySw"></span></div>' +
      '<div class="muted small">共部署时两个平台复用同一 mock 端点与证书（' + esc(S.deploy.omp.host) + '），端口只需注册一次；' +
      (S.deploy.lcmp.coDeploy ? '当前 LCMP 与 NEMP 共用该端点。' : '当前 LCMP 使用独立端点，需要单独注册端口与证书。') + '</div>' +
      '<div class="cards">' +
      '<div class="card' + (S.deploy.lcmp.coDeploy ? ' card--hl' : '') + '"><div class="card__k">LCMP 端点</div><div class="card__v">' + (S.deploy.lcmp.coDeploy ? esc(S.deploy.omp.host) : '10.18.32.104:9443') + '</div></div>' +
      '<div class="card"><div class="card__k">软件包</div><div class="card__v">' + S.packages.length + ' 个</div></div>' +
      '</div></div>';
    var sw = el('button', 'mx-sw'); sw.type = 'button'; sw.setAttribute('aria-label', '切换共部署');
    $('#coDeploySw').appendChild(sw);
    X.velocitySwitch(sw, {
      checked: S.deploy.lcmp.coDeploy, label: '共部署',
      onChange: function (on) { A.toggleCoDeploy('lcmp'); toast(on ? '已开启共部署' : '已关闭共部署', on ? '复用 NEMP 端点与证书，无需重复注册' : 'LCMP 将使用独立端点 :9443', { tone: on ? 'ok' : 'warn' }); }
    });

    $('#pkgType').innerHTML = S.softTypes.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    $('#pkgVendor').innerHTML = S.vendors.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    $('#pkgNe').innerHTML = '<option value="">（平台级）</option>' + S.nes.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + '</option>'; }).join('');
  }

  function bindLcm() {
    $('#pkgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#pkgName').value.trim(), ver = $('#pkgVer').value.trim();
      if (!name || !ver) { (name ? $('#pkgVer') : $('#pkgName')).focus(); MP.sfx.play('warn'); return; }
      A.addPackage({ name: name, type: $('#pkgType').value, ne: $('#pkgNe').value, vendor: $('#pkgVendor').value, version: ver, sizeMB: +$('#pkgSize').value || 0 });
      $('#pkgName').value = ''; $('#pkgVer').value = ''; $('#pkgSize').value = '';
      MP.sfx.play('confirm');
      toast('已登记软件包', name + ' · V' + ver + ' — 需走校验流程后才可用于升级', { tone: 'ok' });
    });
    $('#pkgList').addEventListener('click', function (e) {
      var v = e.target.closest('[data-pkg-validate]');
      if (v) {
        var row = v.closest('.row');
        v.replaceWith(el('span'));
        var host = row.querySelector('.row__right');
        var box = el('span'); host.insertBefore(box, host.firstChild);
        X.latticeLoader(box, { label: '校验' });
        setTimeout(function () {
          A.validatePackage(v.dataset.pkgValidate);
          toast('软件包校验通过', 'MD5 / 签名 / 依赖 三项一致', { tone: 'ok' });
        }, 1100);
        return;
      }
      var d = e.target.closest('[data-pkg-del]');
      if (d) {
        var p = MP.byId(S.packages, d.dataset.pkgDel);
        A.removePackage(d.dataset.pkgDel); MP.sfx.play('undo');
        toast('已移除软件包', p ? p.name : '', { tone: 'danger', actionLabel: '撤销', onAction: function () { S.packages.push(p); MP.emit({ type: 'package' }); toast('已恢复软件包', p.name, { tone: 'ok', duration: 2400 }); } });
      }
    });
  }

  /* ==================================================================== S6 */
  function renderVlp() {
    var v = S.vlp;
    $('#vlpCore').innerHTML =
      '<div class="form__grid form__grid--2">' +
      '<label class="field"><span class="field__label">平台版本</span><select class="input" id="vlpVer">' +
      ['VLMP R3.1.0', 'VLMP R3.0.6（回滚点）'].map(function (o) { return '<option' + (o === v.version ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="field"><span class="field__label">CPU 配额（' + v.cpuRange[0] + '–' + v.cpuRange[1] + ' 核）</span><div class="hstack"><div id="cpuScrub"></div><button class="btn btn--sm" data-cpu="-2" type="button">−2</button><button class="btn btn--sm" data-cpu="2" type="button">+2</button></div></div>' +
      '</div>' +
      '<div class="hstack" style="margin-top:10px">' +
      '<div id="cpuGauge"></div>' +
      '<div class="stack grow">' +
      '<div class="card"><div class="card__k">主站点可分配余量</div><div class="card__v">' + (MP.byId(S.sites, v.primarySite) || {}).cpu + ' 核</div></div>' +
      '<div class="card"><div class="card__k">副站点可分配余量</div><div class="card__v">' + (MP.byId(S.sites, v.secondarySite) || {}).cpu + ' 核</div></div>' +
      '<div class="muted small">卷 ' + esc(v.volume) + ' · 升级时会先做倒换演练再切版本</div></div>' +
      '</div>';
    X.scrub($('#cpuScrub'), { label: 'CPU', value: v.cpu, min: v.cpuRange[0], max: v.cpuRange[1], step: 2, suffix: ' 核', onChange: function (n) { A.setCPU(n); } });
    X.gauge($('#cpuGauge'), { value: v.cpu / v.cpuRange[1] * 100, unit: '%', label: 'CPU 占最大配额' });

    $('#vlpSites').innerHTML = S.sites.map(function (s) {
      var role = s.id === v.primarySite ? '主站点' : s.id === v.secondarySite ? '副站点' : '';
      return '<div class="row' + (role ? ' is-active' : '') + '"><span><span class="row__t">' + esc(s.name) + ' <span class="tag tag--ghost">' + esc(s.region) + '</span></span>' +
        '<span class="row__s">可分配 CPU ' + s.cpu + ' 核 · ' + esc(s.role) + '</span></span>' +
        '<span class="row__right">' + (role ? '<span class="tag tag--accent">' + role + '</span>' : '') +
        '<button class="btn btn--sm" data-site-p="' + s.id + '" type="button">设为主站</button>' +
        '<button class="btn btn--sm btn--ghost" data-site-s="' + s.id + '" type="button">设为副站</button></span></div>';
    }).join('');

    $('#vlpFlow').innerHTML = '<ul class="steps">' + v.upgradeFlow.map(function (s, i) {
      var kind = s.kind === 'auto' ? '<span class="tag tag--ghost">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工</span>';
      return '<li class="step is-' + s.state + '"><span class="step__idx">' + (i + 1) + '</span>' +
        '<span><span class="step__name">' + esc(s.name) + '</span><span class="step__meta">' + kind + ' · ' + ({ done: '已完成', active: '进行中', todo: '待执行' })[s.state] + '</span></span></li>';
    }).join('') + '</ul>';

    var checks = v.checks;
    $('#vlpCheckMeta').textContent = checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + checks.length + ' 通过';
    $('#vlpChecks').innerHTML = '<div class="stack">' + checks.map(function (c) {
      var tone = c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle';
      return '<div class="row"><span class="mx-mark is-' + tone + '"><svg viewBox="0 0 24 24"><circle class="mx-mark__bg" cx="12" cy="12" r="9"/><path class="mx-mark__arc" d="M12 3 a9 9 0 0 1 9 9" fill="none"/><path class="mx-mark__tick" d="M7 12.6 l3.2 3.2 L17.4 8.6" fill="none"/><path class="mx-mark__bang" d="M12 7.4 v5.2 M12 16.6 v0.2" fill="none"/></svg></span>' +
        '<span><span class="row__t">' + esc(c.name) + '</span><span class="row__s">' + esc(c.target) + ' · ' + esc(c.detail) + '</span></span>' +
        '<span class="row__right">' + (c.state === 'pass' ? '<span class="tag tag--ok">通过</span>' : '<button class="btn btn--sm" data-check="' + c.id + '" type="button">执行校验</button>') + '</span></div>';
    }).join('') + '</div>';
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
      if (p) { A.setSite('primary', p.dataset.siteP); toast('已设为主站点', (MP.byId(S.sites, p.dataset.siteP) || {}).name, { tone: 'ok', duration: 2400 }); }
      if (s) {
        if (s.dataset.siteS === S.vlp.primarySite) { toast('不能把主站点设为副站点', '请先把另一个站点设为主站', { tone: 'warn' }); MP.sfx.play('warn'); return; }
        A.setSite('secondary', s.dataset.siteS); toast('已设为副站点', (MP.byId(S.sites, s.dataset.siteS) || {}).name, { tone: 'ok', duration: 2400 });
      }
    });
    $('#vlpAdvance').addEventListener('click', function () { A.advanceVlpFlow(); MP.sfx.play('step'); });
    $('#vlpReset').addEventListener('click', function () { A.resetVlpFlow(); toast('已重置升级流程', '回到第一步', { duration: 2200 }); });
    $('#vlpChecks').addEventListener('click', function (e) {
      var b = e.target.closest('[data-check]'); if (!b) return;
      var host = b.parentElement;
      b.replaceWith(el('span'));
      var box = el('span'); host.insertBefore(box, host.firstChild);
      X.latticeLoader(box, { label: '校验' });
      setTimeout(function () { A.runVlpCheck(b.dataset.check); toast('校验项已更新', '结果刷新为通过', { tone: 'ok', duration: 2400 }); }, 850);
    });
  }

  /* ================================================================= 导航 */
  var navOrder = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var navNames = { mock: 'MOCK 管理', flow: 'MOCK 流程', ne: '网元管理', omp: '网元管理平台', lcm: '生命周期平台', vlp: '虚层管理平台' };
  var pendingOrigin = null;

  function bindNav() {
    $$('.rail__item').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.nav, b); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key >= '1' && e.key <= '6') go(navOrder[+e.key - 1]);
    });
  }

  function go(name, btn) {
    if (S.ui.screen === name && !btn) return;
    if (btn) {
      var r = btn.getBoundingClientRect(), s = $('#stage').getBoundingClientRect();
      pendingOrigin = (r.left + r.width / 2 - s.left) + 'px ' + (r.top + r.height / 2 - s.top) + 'px';
    }
    MP.sfx.play('iris');
    A.setScreen(name);
  }

  function renderScreenContent(name) {
    if (name === 'mock') renderMock();
    if (name === 'flow') { renderApiList(); renderStudio(); renderLogs(true); }
    if (name === 'ne') renderNe();
    if (name === 'omp') renderOmp();
    if (name === 'lcm') renderLcm();
    if (name === 'vlp') renderVlp();
  }

  function switchScreen(name) {
    $$('.screen').forEach(function (sc) {
      var on = sc.dataset.screen === name;
      sc.hidden = !on;
      if (on) sc.classList.add('is-active');
      else sc.classList.remove('is-active');
    });
    $$('.rail__item').forEach(function (b) { b.classList.toggle('is-active', b.dataset.nav === name); });
    renderScreenContent(name);
    renderKpisFor(name);
    document.title = 'Mock 平台 · V1 · ' + navNames[name];
    var sc = document.querySelector('.screen[data-screen="' + name + '"]');
    if (sc) {
      if (pendingOrigin) { M.iris(sc, { origin: pendingOrigin }); pendingOrigin = null; }
      else M.develop(sc);
      var panels = sc.querySelectorAll('.panel, .kpi');
      if (panels.length) M.stagger(panels, { each: 26, y: 10 });
    }
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
      renderTelemetry(); if (state.ui.screen === 'mock') keepFocus(renderMock); renderKpisFor('mock'); return;
    }
    if (t === 'select-api') { if (state.ui.screen === 'flow') { renderApiList(); renderStudio(); } return; }
    // 编辑预期响应时不整块重画：本地 DOM 已经是最新值，重画会打断输入与拖拽
    if (t === 'api') return;
    if (t === 'fields') { if (state.ui.screen === 'flow') renderApiList(); return; }
    if (t === 'interactions') { if (state.ui.screen === 'flow') renderStudio(); return; }
    if (t === 'log-filter' || t === 'log-query') { if (state.ui.screen === 'flow') keepFocus(function () { $('#logWrap').innerHTML = '<table class="table table--logs"><thead><tr><th>时间</th><th>端口</th><th>方法</th><th>路径</th><th>状态</th><th>时延</th><th>网元</th><th>判定</th><th></th></tr></thead><tbody id="logBody"></tbody></table>'; renderLogs(true); }); return; }
    if (t === 'interaction-resolved') {
      if (state.ui.screen === 'flow') { renderLogs(true); }
      return;
    }
    if (t === 'ne' || t === 'upgrade' || t === 'validation' || t === 'group') {
      renderTelemetry(); if (state.ui.screen === 'ne') keepFocus(renderNe); renderKpisFor('ne'); return;
    }
    if (t === 'validation-run') { renderKpisFor('ne'); return; }   // 结果由本地渲染，不重画表单
    if (t === 'account' || t === 'task' || t === 'deploy') {
      if (state.ui.screen === 'omp') keepFocus(renderOmp);
      if (state.ui.screen === 'lcm') keepFocus(renderLcm);
      renderKpisFor('omp'); renderKpisFor('lcm'); return;
    }
    if (t === 'package') { if (state.ui.screen === 'lcm') keepFocus(renderLcm); renderKpisFor('lcm'); return; }
    if (t === 'vlp') { if (state.ui.screen === 'vlp') keepFocus(renderVlp); renderKpisFor('vlp'); return; }
  });

  /* ================================================================== 启动 */
  function boot() {
    MP.btn.install();
    MP.btn.enhance(document);
    renderChrome();
    switchScreen(S.ui.screen);
    bindNav(); bindMock(); bindFlow(); bindNe(); bindOmp(); bindLcm(); bindVlp();
    renderAll();
    MP.fx.auto(document);
    MP.sim.start(2600);
    setInterval(function () { $('#clock').textContent = MP.clock(); }, 1000);
    $('#clock').textContent = MP.clock();
    $('#sfxBtn').addEventListener('click', function () {
      var on = MP.sfx.toggle();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? '界面音效已开启' : '界面音效已关闭', on ? '合成音效与操作反馈共用同一空间感' : '静音模式下所有交互仍保留视觉反馈', { duration: 2600 });
    });
    // 底栏点击切换流量模拟
    $('.status').addEventListener('click', function () {
      if (S.ui.running) { MP.sim.stop(); S.ui.running = false; $('#stSim').textContent = 'PAUSED'; toast('已暂停流量模拟', '审计日志不再自动追加', { duration: 2200 }); }
      else { MP.sim.start(2600); S.ui.running = true; $('#stSim').textContent = 'RUNNING'; toast('已恢复流量模拟', '对端请求会持续进入审计日志', { tone: 'ok', duration: 2200 }); }
    });
    M.reveal(document);
    console.log('%c[Mock 平台 V1] 暗场运维控制台已就绪 · 6 个界面 · 按 1–6 切换', 'color:#F97316');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ============================================================================
 * V4 · 档案终端（Rhine Lab Archive Terminal）—— 视图层
 *
 * 数据、动作、规则引擎、流量模拟器全部来自 _shared（MP.*）；本文件只做
 * 「渲染 + 接线 + 本版签名动效」。
 *
 * 本版签名（对应 06-RhineLab-Blog-Theme 的档案终端与 07 的音乐台同语言体系）：
 *   1) 左侧竖排刻度导航：六格细刻度，选中格加长 + 暖杏金 #a67d48，旁边两位编号 01–06；
 *      切换时刻度（.rail__bar）由 MP.motion.spring 连续移动（临界阻尼、保留速度），
 *      编号走 460ms direct 滚动（旧的向上翻出、新的向上翻入）。
 *   2) 卡片 = 磨砂盖板 + 内部信息层：进入时一条 2px 暖杏金解密扫描线自上而下扫过，
 *      CSS mask 前沿同步下移，内容由模糊转清晰（@property --dcy 连续补间）。
 *   3) 权限 / 密级标签（PUBLIC / RESTRICTED / TOP SECRET）映射端口与服务状态。
 *   4) 编号体系 X-001…X-018、分类标签、中英双语层级、底部「当前分类 · 索引 / 总计」。
 *   5) 主行动按钮：细线 + 下划线（ACCESS FILE 式），只用 MP.btn 的动效分级。
 * ==========================================================================*/
(function () {
  'use strict';
  var MP = window.MP;
  var S = MP.state, A = MP.actions, SEL = MP.select, M = MP.motion, X = MP.micro, B = MP.btn;

  /* ------------------------------------------------------------------ 小工具 */
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
  function opts(arr, cur) { return arr.map(function (o) { return '<option' + (String(o) === String(cur) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }
  function neName(id) { var n = MP.byId(S.nes, id); return n ? n.name : '平台级'; }
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
  /* 统一异步：>300ms 的操作必须有 loading 反馈（技能要求） */
  var REDUCED = function () { return M.reduced; };
  function asyncBtn(btn, label, ms, work) {
    if (!btn || REDUCED()) { setTimeout(work, 0); return; }
    var done = B.loading(btn, label);
    setTimeout(function () { work(); done(); }, ms);
  }
  function wireBtns(root) {
    B.enhance(root || document);
  }

  /* --------------------------------------------- 焦点 / 滚动位置保护（硬要求） */
  function scrollHosts() {
    var list = $$('.card__bd--roll, .card__in--scroll');
    if (M.reduced) list = [];
    list.push(document.scrollingElement || document.documentElement);
    return list;
  }
  function keepFocus(fn) {
    var a = document.activeElement;
    var key = a && a.id ? { t: 'id', v: a.id } : null;
    if (!key && a && a.dataset && a.dataset.fid) key = { t: 'fp', v: a.dataset.fid, p: a.dataset.prop };
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
    else if (key.t === 'fp') n = document.querySelector('[data-fid="' + key.v + '"][data-prop="' + key.p + '"]');
    else if (key.t === 'fk') n = document.querySelector('[data-fkey="' + key.v + '"]');
    else if (key.t === 'nf') n = document.querySelector('[data-nf="' + key.v + '"]');
    if (n && n.focus) {
      n.focus();
      try { if (ss != null && n.setSelectionRange) n.setSelectionRange(ss, se); } catch (e) { /* select/number 不支持 */ }
    }
  }

  /* ---------------------------------------------------------------- 主题 */
  /* 晨雾（亮）/ 深夜（暗）：颜色 650ms 连续过渡，不硬切；localStorage 持久化 */
  var THEME_KEY = 'mp-v4-theme';
  var THEMES = { dawn: { name: '晨雾', en: 'DAWN' }, night: { name: '深夜', en: 'NIGHT' } };
  function applyTheme(t) {
    if (!THEMES[t]) t = 'dawn';
    document.documentElement.setAttribute('data-theme', t);
    S.ui.theme = t;
    var n = $('#themeName'), e = $('#themeEn'), b = $('#themeBtn');
    if (n) n.textContent = THEMES[t].name;
    if (e) e.textContent = THEMES[t].en;
    if (b) b.setAttribute('aria-pressed', t === 'night' ? 'true' : 'false');
    try { localStorage.setItem(THEME_KEY, t); } catch (err) { /* 隐私模式忽略 */ }
  }

  /* ================================================================ 页眉 / 页脚 */
  function renderChrome() {
    $('#hostName').textContent = S.host.hostname;
    $('#hostId').textContent = 'RL-' + S.host.ip.split('.').map(function (n) { return String(+n).padStart(2, '0'); }).join('');
    $('#hostIp').textContent = S.host.ip + ' / ' + S.host.alt;
    $('#hostAgent').textContent = S.host.agent;
  }

  function renderTelemetry() {
    var k = SEL.kpis();
    var ids = { tkReq: k.req, tkOk: k.ok, tkErr: k.err, tkLat: k.avgLat, tkRun: k.running, tkHuman: k.pendingHuman };
    Object.keys(ids).forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.textContent !== String(ids[id])) {
        if (REDUCED()) n.textContent = String(ids[id]);
        else M.countUp(n, ids[id], { duration: 420 });
      }
    });
    var badges = { ports: k.ports, human: k.pendingHuman, ne: k.ne, tasks: k.tasks, packages: k.packages };
    Object.keys(badges).forEach(function (key) {
      var n = document.querySelector('[data-badge="' + key + '"]');
      if (n) n.textContent = badges[key];
      var item = n && n.closest('.tick');
      if (item) item.classList.toggle('is-attention', (key === 'human' || key === 'tasks') && badges[key] > 0);
    });
    var v = $('#ftLv'); if (v) v.textContent = LV[S.ui.screen] || '—';
    var last = S.logs[0];
    var l = $('#stLast'); if (l) l.textContent = last ? (last.clock + ' ' + last.method + ' ' + last.path + ' → ' + last.status) : '—';
    var sim = $('#stSim'); if (sim) sim.textContent = S.ui.running ? 'RUNNING' : 'PAUSED';
  }

  function renderKpisFor(name) {
    var k = SEL.kpis(), html = '';
    if (name === 'mock') {
      html = kpi('端口', k.ports, '个') + kpi('运行中', k.running, '个', 'ok') + kpi('总请求', k.req, '', 'accent') + kpi('平均时延', k.avgLat, 'ms');
    } else if (name === 'flow') {
      html = kpi('请求', k.req, '') + kpi('成功', k.ok, '', 'ok') + kpi('异常', k.err, '', 'danger') + kpi('待人工', k.pendingHuman, '', k.pendingHuman ? 'warn' : '');
    } else if (name === 'ne') {
      html = kpi('网元', k.ne, '个') + kpi('网元组', k.groups, '个') + kpi('升级中', S.nes.filter(function (n) { return n.status === '升级中'; }).length, '个', 'accent') +
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

  /* ================================================================ 01 · Mock 管理 */
  var ipCustom = null;
  function renderMock() {
    var host = $('#portList');
    host.innerHTML = S.ports.map(function (p, i) {
      var caps = SEL.capsOfPort(p.id);
      var certTag = p.cert.status === 'issued' ? '<span class="tag tag--ok">证书已签发</span>' : '<span class="tag tag--danger">未签发</span>';
      return '<button class="row' + (p.id === S.ui.selectedPort ? ' is-active' : '') + '" data-port="' + p.id + '" type="button" aria-pressed="' + (p.id === S.ui.selectedPort) + '">' +
        '<span class="row__num">X-' + String(i + 1).padStart(3, '0') + '</span>' +
        '<span class="row__main"><span class="row__t"><i class="dot ' + (p.running ? 'dot--ok' : 'dot--idle') + '" aria-hidden="true"></i>' +
        '<b class="mono">' + esc(p.ip) + ':' + p.port + '</b>' +
        '<span class="tag tag--ghost">' + esc(p.protocol) + '</span>' + certTag + '</span>' +
        '<span class="row__s">' + esc(p.tls) + ' · ' + caps.length + ' 项能力' + (caps.length ? '（' + caps.map(function (c) { return c.code; }).join('/') + '）' : '') +
        ' · 建于 ' + esc(p.createdAt) + '</span>' +
        '<span class="row__s">' + (p.running ? 'RUNNING' : 'STOPPED') + ' · ' + p.stats.req + ' req · ' + p.stats.rps + ' rps · ' + esc(p.note || '') + '</span></span>' +
        '</button>';
    }).join('') || '<div class="empty">登记簿为空 —— 先在下方登记本机 IP 与端口</div>';
    $$('.row', host).forEach(function (n) { if (!n.__spot) { n.__spot = 1; X.spotlight(n); } });

    var p = SEL.port();
    $('#pdProto').textContent = p ? p.protocol : '—';
    $('#pdPort').textContent = p ? (p.ip + ':' + p.port) : '—';
    var body = $('#portDetailBody');
    if (!p) { body.innerHTML = '<div class="empty">请选择一个端点查看档案</div>'; return; }
    var lv = p.running ? 'TOP SECRET · 服务已挂载' : (p.cert.status === 'issued' ? 'RESTRICTED · 待启动' : 'PUBLIC · 未签发');

    /* 01 证书文件 */
    var certHtml;
    if (p.cert.status === 'issued') {
      certHtml =
        '<div class="vstack">' +
        '<div class="hstack"><span id="certMark"></span><b class="mono">' + esc(p.cert.cn) + '</b>' +
        '<span class="tag tag--ok">已签发</span><span class="tag tag--ghost">' + esc(p.cert.issuer) + '</span></div>' +
        '<div class="frow frow--4">' +
        '<div class="field"><span class="field__lbl">有效期</span><b class="mono">' + p.cert.days + ' 天</b></div>' +
        '<div class="field"><span class="field__lbl">签发时间</span><b class="mono">' + esc(p.cert.issuedAt) + '</b></div>' +
        '<div class="field"><span class="field__lbl">签发机构</span><b>' + esc(p.cert.issuer) + '</b></div>' +
        '<div class="field"><span class="field__lbl">指纹 FINGERPRINT</span><b class="mono">' + esc(p.cert.fingerprint) + '</b></div>' +
        '</div>' +
        '<div class="rule-h"></div>' +
        '<div class="hstack">' +
        '<button class="abtn abtn--sm" data-act="cert-download" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 11.5L12 16l4.5-4.5M5 19h14" /></svg><span>导出证书文件</span></button>' +
        '<button class="abtn abtn--sm abtn--quiet" data-act="cert-reissue" type="button"><span>重新签发</span></button>' +
        '<span class="note">导出为 PEM（.crt），用于对端校验本 mock 端点的 TLS 身份</span></div>' +
        '</div>';
    } else {
      certHtml =
        '<div class="vstack">' +
        '<div class="hstack"><span id="certMark"></span><span class="tag tag--danger">TLS 未就绪</span>' +
        '<span class="note">未签发证书前不能启动服务</span></div>' +
        '<div class="frow frow--3">' +
        '<label class="field" for="certCn"><span class="field__lbl">证书 CN <i>COMMON NAME</i></span>' +
        '<input class="input mono" id="certCn" value="' + esc('mock-' + p.port + '.' + p.ip) + '" data-fkey="certCn" aria-describedby="certCnErr" />' +
        '<em class="field__err" id="certCnErr" role="alert" hidden></em></label>' +
        '<label class="field" for="certDays"><span class="field__lbl">有效期 / 天</span><select class="input" id="certDays">' + opts([90, 365, 730, 1095], 365) + '</select></label>' +
        '<label class="field" for="certIssuer"><span class="field__lbl">签发机构</span><select class="input" id="certIssuer">' + opts(['MockCA-Root', 'MockCA-Intermediate', 'RhineLab-LabCA'], 'MockCA-Root') + '</select></label>' +
        '</div>' +
        '<div class="hstack" id="certGenHost"><button class="abtn" data-fx="standard" data-act="cert-gen" type="button" id="certGenBtn"><span>为 ' + esc(p.ip) + ':' + p.port + ' 签发证书</span></button>' +
        '<span class="note">签发后可挂载平台能力并启动服务</span></div>' +
        '</div>';
    }

    /* 02 平台能力（6 选 N，可卸载） */
    var capChips = S.caps.map(function (c) {
      var on = p.caps.indexOf(c.id) >= 0;
      return '<button class="chk' + (on ? ' is-on' : '') + '" data-cap="' + c.id + '" type="button" aria-pressed="' + on + '">' +
        '<i class="dia' + (on ? '' : ' dia--muted') + '" aria-hidden="true"></i>' + esc(c.name) +
        ' <em>' + c.code + ' · ' + c.version + ' · ' + c.endpoints + ' 接口</em></button>';
    }).join('');

    body.innerHTML =
      '<div class="frow frow--4">' +
      '<div class="field"><span class="field__lbl">协议</span><b>' + esc(p.protocol) + '</b></div>' +
      '<div class="field"><span class="field__lbl">TLS</span><b>' + esc(p.tls) + '</b></div>' +
      '<div class="field"><span class="field__lbl">请求 / 成功 / 异常</span><b class="mono">' + p.stats.req + ' / ' + p.stats.ok + ' / ' + p.stats.err + '</b></div>' +
      '<div class="field"><span class="field__lbl">当前 RPS</span><b class="mono">' + p.stats.rps + '</b></div>' +
      '</div>' +
      '<div class="sec-title"><span class="sec-title__no">01</span>证书文件 <i class="note">CERTIFICATE</i></div>' + certHtml +
      '<div class="rule-h"></div>' +
      '<div class="sec-title"><span class="sec-title__no">02</span>挂载平台能力 <i class="note">6 选 N · 可卸载</i></div>' +
      '<div class="checks">' + capChips + '</div>' +
      '<div class="scale" aria-hidden="true"></div>' +
      '<div class="sec-title"><span class="sec-title__no">03</span>MOCK 服务 <i class="note">SERVICE</i></div>' +
      '<div class="hstack" id="svcBox"></div>';

    var cm = $('#certMark');
    if (cm) X.statusMark(cm, { state: p.cert.status === 'issued' ? 'done' : 'error', label: p.cert.status === 'issued' ? '证书有效' : '尚无证书' });

    /* 03 服务控制：开启按住确认（holdConfirm），停止 / 删除走引信撤销（fuseButton） */
    var box = $('#svcBox');
    var mark = el('span');
    box.appendChild(mark);
    X.statusMark(mark, { state: p.running ? 'done' : 'idle', label: p.running ? '服务运行中' : '服务已停止' });

    if (p.running) {
      var stop = el('button', 'abtn abtn--sm');
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
      var startBtn = el('button', 'abtn mx-hold');
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
      if (startBtn.disabled) box.appendChild(el('span', 'note', p.cert.status !== 'issued' ? '需先签发证书' : '需至少挂载一项平台能力'));
    }

    var del = el('button', 'abtn abtn--sm abtn--quiet');
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
    wireBtns(body);
  }

  function bindMock() {
    $('#portList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-port]'); if (!b) return;
      A.selectPort(b.dataset.port); MP.sfx.play('step');
    });

    $('#portDetailBody').addEventListener('click', function (e) {
      var p = SEL.port(); if (!p) return;
      /* ACCESS FILE：细线 + 下划线的主行动，唯一的磁吸焦点（技能：一屏 1–2 个） */
      var af = e.target.closest('#accessFile');
      if (af) {
        asyncBtn(af, '调阅中', 420, function () {
          var pend = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; })[0];
          if (pend) {
            A.resolveInteraction(pend.id, 'approve');
            MP.sfx.play('confirm');
            toast('ACCESS FILE · 已放行待人工请求', pend.method + ' ' + pend.path, { tone: 'ok' });
            go('flow', $('#rail .tick.is-active'));
          } else {
            toast('ACCESS FILE · 已调阅端点档案', p.ip + ':' + p.port + ' · 当前无待人工请求', { duration: 3200 });
          }
        });
        return;
      }
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
        /* 异步签发：>300ms，用 MP.btn.loading 占位（不再是纯 loader 图标） */
        asyncBtn(act, '签发中', 700, function () {
          A.generateCert(p.id, { cn: cn.trim(), days: days, issuer: issuer });
          toast('证书已签发', cn.trim() + ' · ' + days + ' 天 · ' + issuer, { tone: 'ok' });
        });
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
        asyncBtn(act, '重签中', 600, function () {
          A.generateCert(p.id, { cn: p.cert.cn, days: p.cert.days, issuer: p.cert.issuer });
          toast('已重新签发证书', p.cert.cn + ' · 指纹已更新', { tone: 'ok' });
        });
      }
    });

    /* 本机 IP：网卡下拉 + 手动输入 */
    var ipSel = $('#pfIp');
    ipSel.innerHTML = [S.host.ip, S.host.alt].map(function (v) {
      return '<option value="' + v + '">' + v + '（本机网卡）</option>';
    }).join('') + '<option value="__custom__">手动输入…</option>' + '<option value="127.0.0.1">127.0.0.1（回环）</option>';
    ipCustom = el('input', 'input mono');
    ipCustom.id = 'pfIpCustom'; ipCustom.placeholder = '10.x.x.x'; ipCustom.hidden = true;
    ipCustom.setAttribute('aria-label', '手动输入本机 IP');
    ipCustom.dataset.fkey = 'pfIpCustom';
    ipSel.parentElement.appendChild(ipCustom);
    ipSel.addEventListener('change', function () {
      ipCustom.hidden = ipSel.value !== '__custom__';
      if (!ipCustom.hidden) ipCustom.focus();
    });

    $('#portForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var ip = ipSel.value === '__custom__' ? ipCustom.value.trim() : ipSel.value;
      var port = parseInt($('#pfPort').value, 10);
      var ok = true, msg = '';
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some(function (n) { return +n > 255; })) { ok = false; msg = '请输入合法的 IPv4 地址'; }
      else if (!(port >= 1024 && port <= 65535)) { ok = false; msg = '端口需在 1024–65535 之间（1024 以下为系统保留）'; }
      else if (S.ports.some(function (p) { return p.ip === ip && p.port === port; })) { ok = false; msg = '该 IP:端口 已在登记簿中'; }
      var errEl = $('#pfPortErr');
      errEl.hidden = ok; errEl.textContent = msg;
      var fEl = $('#pfPort').closest('.field');
      fEl.classList.toggle('is-invalid', !ok);
      if (!ok) { MP.sfx.play('warn'); errEl.focus && errEl.focus(); return; }
      var p = A.registerPort({ ip: ip, port: port, protocol: $('#pfProto').value, tls: $('#pfTls').value, note: $('#pfNote').value.trim() || '手动登记' });
      $('#pfNote').value = '';
      MP.sfx.play('confirm');
      toast('已登记 mock 端点', p.ip + ':' + p.port + ' —— 下一步：签发证书 → 挂载能力 → 启动服务', { tone: 'ok', duration: 5200 });
    });
  }

  /* ================================================================ 02 · Mock 流程 */
  var capFilter = 'all';
  function renderApiList() {
    var html = '';
    S.caps.forEach(function (c) {
      if (capFilter !== 'all' && capFilter !== c.id) return;
      var apis = SEL.apisOfCap(c.id);
      if (!apis.length) return;
      html += '<div class="vstack"><div class="hstack"><i class="dia" aria-hidden="true"></i><b class="small">' + esc(c.name) + '</b>' +
        '<span class="tag tag--ghost">' + c.code + ' · ' + c.version + '</span>' +
        '<span class="note right">' + apis.length + ' 个接口</span></div>';
      apis.forEach(function (a) {
        html += '<button class="row' + (a.id === S.ui.selectedApi ? ' is-active' : '') + '" data-api="' + a.id + '" type="button" aria-pressed="' + (a.id === S.ui.selectedApi) + '">' +
          '<span class="row__main"><span class="row__t"><span class="tag tag--ghost">' + a.method + '</span> <span class="mono">' + esc(a.path) + '</span></span>' +
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
    if (!a) { box.innerHTML = '<div class="empty">先选择一个接口</div>'; $('#apiTools').innerHTML = ''; return; }
    $('#apiTools').innerHTML = '<span class="tag tag--ghost mono">' + a.method + ' ' + esc(a.path) + '</span>' +
      '<span class="note">命中 ' + a.hits + ' 次</span>' +
      (a.lastAt ? '<span class="note">最近 ' + esc(a.lastAt) + '</span>' : '');

    var STATUS = { 200: 'OK', 201: 'Created', 202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many', 500: 'Server Error', 503: 'Unavailable' };
    var statusOpts = Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (+s === a.status ? ' selected' : '') + '>' + s + ' ' + STATUS[s] + '</option>';
    }).join('');

    var fieldRows = a.fields.map(function (f) {
      var r = f.rule || { kind: 'fixed' };
      var meta = ruleMeta(r.kind);
      var tone = meta.tone === 'neutral' ? '' : meta.tone === 'info' ? 'violet' : meta.tone;
      var typeOpts = opts(S.fieldTypes, f.type);
      var ruleOpts = Object.keys(MP.RULE_META).map(function (k) {
        return '<option value="' + k + '"' + (k === r.kind ? ' selected' : '') + '>' + MP.RULE_META[k].name + '</option>';
      }).join('');
      var param = '';
      if (r.kind === 'increment') {
        param = '<label class="field"><span class="field__lbl">起点</span><input class="input mono" data-f="' + f.id + '" data-rk="start" value="' + (r.start == null ? 1 : r.start) + '" data-fkey="rk-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">步长</span><input class="input mono" data-f="' + f.id + '" data-rk="step" value="' + (r.step == null ? 1 : r.step) + '" data-fkey="rs-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">格式 {n:04}</span><input class="input mono" data-f="' + f.id + '" data-rk="pattern" value="' + esc(r.pattern || '') + '" placeholder="GNB-HZ-{n:04}" data-fkey="rp-' + f.id + '" /></label>';
      } else if (r.kind === 'once') {
        param = '<label class="field"><span class="field__lbl">生效次数</span><input class="input mono" data-f="' + f.id + '" data-rk="times" value="' + (r.times == null ? 1 : r.times) + '" data-fkey="rt-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">之后的兜底值</span><input class="input mono" data-f="' + f.id + '" data-rk="fallback" value="' + esc(r.fallback || '') + '" data-fkey="rf-' + f.id + '" /></label>';
      } else if (r.kind === 'conditional') {
        var keys = a.fields.filter(function (x) { return x.key !== f.key; }).map(function (x) { return x.key; });
        param = '<label class="field"><span class="field__lbl">条件字段</span><select class="input mono" data-f="' + f.id + '" data-rk="when.key">' +
          keys.map(function (k) { return '<option' + (r.when && r.when.key === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span class="field__lbl">操作符</span><select class="input" data-f="' + f.id + '" data-rk="when.op">' +
          opts(['等于', '包含', '非空', '末尾为偶数'], r.when && r.when.op) + '</select></label>' +
          '<label class="field"><span class="field__lbl">比较值</span><input class="input mono" data-f="' + f.id + '" data-rk="when.value" value="' + esc((r.when && r.when.value) || '') + '" data-fkey="rw-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">命中时</span><input class="input mono" data-f="' + f.id + '" data-rk="then" value="' + esc(r.then || '') + '" data-fkey="rc-' + f.id + '" /></label>' +
          '<label class="field"><span class="field__lbl">否则</span><input class="input mono" data-f="' + f.id + '" data-rk="else" value="' + esc(r.else || '') + '" data-fkey="re-' + f.id + '" /></label>';
      } else if (r.kind === 'random') {
        param = '<label class="field field--wide"><span class="field__lbl">候选取值（逗号分隔）</span><input class="input mono" data-f="' + f.id + '" data-rk="options" value="' + esc((f.options || []).join(',')) + '" data-fkey="ro-' + f.id + '" /></label>';
      }
      var valueCell = f.source === 'select'
        ? '<select class="input" data-fid="' + f.id + '" data-prop="value" aria-label="字段取值">' + (f.options || []).map(function (o) { return '<option' + (String(o) === String(f.value) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
        : '<input class="input mono" data-fid="' + f.id + '" data-prop="value" value="' + esc(f.value) + '" data-fkey="fv-' + f.id + '" aria-label="字段取值" />';
      return '<div class="fld' + (tone ? ' fld--' + tone : '') + '">' +
        '<div class="fld__top">' +
        '<input class="input mono" data-fid="' + f.id + '" data-prop="key" value="' + esc(f.key) + '" aria-label="字段路径" data-fkey="fk-' + f.id + '" />' +
        '<select class="input" data-fid="' + f.id + '" data-prop="type" aria-label="字段类型" style="flex:0 1 108px">' + typeOpts + '</select>' +
        '<select class="input" data-fid="' + f.id + '" data-prop="source" aria-label="取值方式" style="flex:0 1 118px">' +
        '<option value="manual"' + (f.source === 'manual' ? ' selected' : '') + '>手工填写</option>' +
        '<option value="select"' + (f.source === 'select' ? ' selected' : '') + '>下拉选择</option></select>' +
        valueCell +
        '<select class="input" data-fid="' + f.id + '" data-prop="rulekind" aria-label="生效规则" style="flex:0 1 116px">' + ruleOpts + '</select>' +
        '<button class="ibtn ibtn--danger" data-del-field="' + f.id + '" type="button" aria-label="删除字段 ' + esc(f.key) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button>' +
        '</div>' +
        (param ? '<div class="frow frow--3">' + param + '</div>' : '') +
        '<div class="fld__desc">' + esc(f.desc || '') + ' · <i>' + meta.name + '</i> ' + meta.hint + (f.required ? ' · 必填' : '') + '</div>' +
        '</div>';
    }).join('') || '<div class="empty">该接口还没有响应字段 —— 点「新增字段」开始定制</div>';

    var IX_META = { 'human-confirm': ['人工确认', 'tag--warn'], captcha: ['验证码', 'tag--violet'], 'manual-gate': ['人工闸门', 'tag--danger'] };
    var ixRows = a.interactions.map(function (ix) {
      var meta = IX_META[ix.kind] || ['人工确认', 'tag--ghost'];
      return '<div class="row"><span class="row__main"><span class="row__t"><span class="tag ' + meta[1] + '">' + meta[0] + '</span>' + esc(ix.label) + '</span>' +
        '<span class="row__s">负责人 ' + esc(ix.owner) + ' · 超时 ' + ix.timeoutS + 's · 命中该接口时先挂起，等待人工放行或拒绝</span></span>' +
        '<span class="row__right"><button class="ibtn ibtn--danger" data-del-ix="' + ix.id + '" type="button" aria-label="移除人机交互 ' + esc(ix.label) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></span></div>';
    }).join('') || '<span class="note">未插入人机交互 —— 命中该接口会直接返回定制响应</span>';

    box.innerHTML =
      '<div class="frow frow--2">' +
      '<label class="field" for="apiStatus"><span class="field__lbl">HTTP Status Code <i>EXPECTED</i></span><select class="input" id="apiStatus">' + statusOpts + '</select></label>' +
      '<div class="field"><span class="field__lbl">响应延迟 <i>DELAY</i>（拖拽或方向键）</span><div class="hstack"><div id="delayScrub"></div></div></div>' +
      '</div>' +
      '<div class="rule-h"></div>' +
      '<div class="sec-title"><span class="sec-title__no">01</span>响应字段（面向对象定制）' +
      '<button class="abtn abtn--sm right" id="addFieldBtn" type="button"><span>+ 新增字段</span></button></div>' +
      '<div class="vstack" id="fieldList">' + fieldRows + '</div>' +
      '<div class="rule-h"></div>' +
      '<div class="sec-title"><span class="sec-title__no">02</span>人机交互<span class="note right">在自动响应中间插入需要人操作的环节</span></div>' +
      '<div class="vstack" id="ixBox">' + ixRows + '</div>' +
      '<div class="hstack"><span id="ixAdd"></span>' +
      '<button class="abtn right" id="triggerBtn" type="button" data-fx="standard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span>手动触发一次请求</span></button></div>';

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
    wireBtns(box);
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
        asyncBtn(e.target.closest('#triggerBtn'), '触发中', 420, function () {
          var log = A.triggerApi(a.id);
          var notes = ((log.res && log.res.notes) || []).map(function (n) { return n.key + ' = ' + n.value + '（' + n.note + '）'; });
          toast('已触发 ' + a.method + ' ' + a.path, notes.slice(0, 3).join(' · ') + (notes.length > 3 ? ' 等 ' + notes.length + ' 项' : ''), { tone: 'ok', duration: 6000 });
          MP.sfx.play('confirm');
        });
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
        ? '<span class="tag tag--warn">待人工 · ' + esc(l.interaction.label || '') + '</span>'
        : '<span class="muted">' + esc(l.verdict || '') + '</span>') + '</td>' +
      '<td class="right">' + (pending
        ? '<button class="abtn abtn--sm" data-approve type="button"><span>放行</span></button> <button class="abtn abtn--sm abtn--quiet" data-reject type="button"><span>拒绝</span></button>'
        : '<button class="abtn abtn--sm abtn--quiet" data-replay type="button"><span>重放</span></button>') + '</td>';
    return tr;
  }

  function renderLogs(full) {
    var body = $('#logBody'); if (!body) return;
    if (full) {
      var list = SEL.logsFiltered();
      body.innerHTML = '';
      if (!list.length) { body.innerHTML = '<tr><td colspan="9"><div class="empty">没有符合条件的请求 —— 换个过滤条件或搜索词</div></td></tr>'; return; }
      var frag = document.createDocumentFragment();
      list.slice(0, 120).forEach(function (l) { frag.appendChild(logRow(l)); });
      body.appendChild(frag);
      wireBtns(body);
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
    wireBtns(body);
  }

  /* ================================================================ 03 · 网元管理 */
  var neSel = null, neTab = 'profile';

  function renderNe() {
    $('#neList').innerHTML = S.nes.map(function (n, i) {
      var dot = n.status === '在线' ? 'dot--ok' : n.status === '升级中' ? 'dot--warn' : 'dot--idle';
      return '<button class="row' + (n.id === neSel ? ' is-active' : '') + '" data-ne="' + n.id + '" type="button" aria-pressed="' + (n.id === neSel) + '">' +
        '<span class="row__num">X-' + String(i + 1).padStart(3, '0') + '</span>' +
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
    $('#neTools').innerHTML = '<span class="tag tag--ghost mono">' + esc(n.code) + '</span>' +
      '<span class="tag ' + (n.status === '在线' ? 'tag--ok' : n.status === '升级中' ? 'tag--warn' : 'tag--ghost') + '">' + esc(n.status) + '</span>' +
      '<span class="tag tag--ghost mono">' + esc(n.model) + '</span>';
    $$('#neTabs .tabs__t').forEach(function (t) {
      var on = t.dataset.netab === neTab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    paintTabInk();

    if (neTab === 'profile') {
      var params = Object.keys(n.params || {});
      body.innerHTML =
        '<div class="frow frow--2">' +
        '<label class="field" for="neName"><span class="field__lbl">网元名称</span><input class="input" id="neName" data-nf="name" value="' + esc(n.name) + '" data-fkey="ne-name" /></label>' +
        '<label class="field" for="neCode"><span class="field__lbl">网元编号</span><input class="input mono" id="neCode" data-nf="code" value="' + esc(n.code) + '" data-fkey="ne-code" /></label>' +
        '<label class="field" for="neType"><span class="field__lbl">类型 <i>TYPE</i></span><select class="input" id="neType" data-nf="type">' + opts(S.neTypes, n.type) + '</select></label>' +
        '<label class="field" for="neArch"><span class="field__lbl">架构 <i>ARCH</i></span><select class="input" id="neArch" data-nf="arch">' + opts(S.arches, n.arch) + '</select></label>' +
        '<label class="field" for="neVendor"><span class="field__lbl">厂商</span><select class="input" id="neVendor" data-nf="vendor">' + opts(S.vendors, n.vendor) + '</select></label>' +
        '<label class="field" for="neVersion"><span class="field__lbl">当前版本</span><input class="input mono" id="neVersion" data-nf="version" value="' + esc(n.version) + '" data-fkey="ne-ver" aria-describedby="neVerErr" />' +
        '<em class="field__err" id="neVerErr" role="alert" hidden></em></label>' +
        '<label class="field" for="neSoft"><span class="field__lbl">使用软件名称</span><input class="input mono" id="neSoft" data-nf="softName" value="' + esc(n.softName) + '" data-fkey="ne-soft" /></label>' +
        '<label class="field" for="neModel"><span class="field__lbl">型号</span><input class="input mono" id="neModel" value="' + esc(n.model) + '" readonly /></label>' +
        '</div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">01</span>旧版本（可回滚）</div>' +
        '<div class="hstack">' + (n.oldVersions || []).map(function (v) {
          var cur = v === n.version;
          return '<span class="tag ' + (cur ? 'tag--accent' : 'tag--ghost') + ' mono">V' + esc(v) + (cur ? ' · 当前' : '') + '</span>';
        }).join('') + '</div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>网元属性（键值对，可增删）</div>' +
        '<div class="vstack" id="paramList">' + params.map(function (k) {
          return '<div class="hstack"><input class="input" style="flex:1 1 150px" data-pk="key" data-pid="' + esc(k) + '" value="' + esc(k) + '" aria-label="属性名" />' +
            '<input class="input" style="flex:1 1 180px" data-pk="value" data-pid="' + esc(k) + '" value="' + esc(n.params[k]) + '" aria-label="属性值" />' +
            '<button class="ibtn ibtn--danger" data-param-del="' + esc(k) + '" type="button" aria-label="删除属性 ' + esc(k) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>';
        }).join('') + '</div>' +
        '<div class="hstack"><input class="input" id="paramKey" placeholder="新属性名，如 心跳周期" style="flex:1 1 150px" aria-label="新属性名" />' +
        '<input class="input" id="paramVal" placeholder="属性值，如 30s" style="flex:1 1 180px" aria-label="新属性值" />' +
        '<button class="abtn abtn--sm" id="paramAdd" type="button"><span>+ 新增属性</span></button></div>' +
        '<div class="rule-h"></div>' +
        '<div class="hstack"><button class="abtn" id="neSave" type="button" data-fx="standard"><span>保存属性</span></button>' +
        '<span class="note">属性改动会写入网元档案，用于对端接口的字段级定制</span></div>';
    } else if (neTab === 'valid') {
      body.innerHTML =
        '<div class="sec-title"><span class="sec-title__no">01</span>参数校验规则<span class="note right">对端上报字段会被这些规则检查（正则）</span></div>' +
        '<div class="vstack" id="validList">' + n.validations.map(function (v) {
          return '<div class="row"><span class="row__main"><span class="row__t mono">' + esc(v.field) + '</span>' +
            '<span class="row__s">' + esc(v.rule) + ' · ' + esc(v.message) + '</span></span>' +
            '<span class="row__right"><span class="tag ' + (v.level === '错误' ? 'tag--danger' : 'tag--warn') + '">' + esc(v.level) + '</span></span></div>';
        }).join('') + '</div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>新增校验规则</div>' +
        '<div class="frow frow--4">' +
        '<label class="field" for="vField"><span class="field__lbl">字段</span><select class="input" id="vField">' + opts(['neId', 'version', 'name', 'code', 'softName'], 'neId') + '</select></label>' +
        '<label class="field" for="vRule"><span class="field__lbl">正则规则</span><input class="input mono" id="vRule" value="^' + esc(n.code) + '-[A-Z]{2}-\\d{4}$" data-fkey="vRule" /></label>' +
        '<label class="field" for="vLevel"><span class="field__lbl">级别</span><select class="input" id="vLevel">' + opts(['错误', '警告'], '错误') + '</select></label>' +
        '<label class="field" for="vMsg"><span class="field__lbl">不通过提示</span><input class="input" id="vMsg" placeholder="编号格式不合法" data-fkey="vMsg" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="abtn abtn--sm" id="vAdd" type="button"><span>+ 添加规则</span></button>' +
        '<button class="abtn abtn--sm" id="vRun" type="button" data-fx="standard"><span>执行校验</span></button>' +
        '<span class="note">执行结果就近显示在下方</span></div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">03</span>校验执行结果</div>' +
        '<div class="vstack" id="validResult"><span class="note">尚未执行 —— 点「执行校验」</span></div>';
    } else if (neTab === 'flow') {
      body.innerHTML =
        '<div class="sec-title"><span class="sec-title__no">01</span>升级流程步骤<span class="note right">自动 / 人工 / 手动，可排序、可删</span></div>' +
        '<ul class="steps" id="stepList">' + n.upgrade.map(function (s, i) {
          var kind = s.kind === 'auto' ? '<span class="tag tag--ghost">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工 · 人机交互</span>';
          return '<li class="step"><span class="step__node" aria-hidden="true"></span>' +
            '<span class="step__body"><span class="step__name">' + String(i + 1).padStart(2, '0') + ' · ' + esc(s.name) + '</span>' +
            '<span class="step__meta">' + kind + '<span>' + (s.durationS ? s.durationS + 's' : '等待人工') + '</span>' +
            (s.interaction ? '<span>' + esc(s.interaction.owner) + ' · 超时 ' + s.interaction.timeoutS + 's</span>' : '') + '</span></span>' +
            '<span class="step__right step__tools">' +
            '<button class="ibtn" data-step-up="' + s.id + '" type="button" aria-label="上移步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>' +
            '<button class="ibtn" data-step-down="' + s.id + '" type="button" aria-label="下移步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button>' +
            '<button class="ibtn ibtn--danger" data-step-del="' + s.id + '" type="button" aria-label="删除步骤 ' + esc(s.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button>' +
            '</span></li>';
        }).join('') + '</ul>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>新增步骤</div>' +
        '<div class="frow frow--3">' +
        '<label class="field" for="stepName"><span class="field__lbl">步骤名称</span><input class="input" id="stepName" placeholder="软件包校验" data-fkey="stepName" /></label>' +
        '<label class="field" for="stepDur"><span class="field__lbl">预计耗时 / s</span><input class="input mono" id="stepDur" inputmode="numeric" value="30" data-fkey="stepDur" /></label>' +
        '<div class="field"><span class="field__lbl">步骤类型</span><div id="stepKind"></div></div>' +
        '</div>' +
        '<div class="hstack"><button class="abtn abtn--sm" id="stepAdd" type="button"><span>+ 添加步骤</span></button>' +
        '<span class="note">「人工」类型会在执行时挂起，等待人机交互放行</span></div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">03</span>执行流程</div>' +
        '<div class="hstack"><span id="flowGauge"></span>' +
        '<button class="abtn mx-hold" id="upRun" type="button"><span class="mx-hold__label">按住执行升级流程</span></button>' +
        '<span id="stepStatus" class="note">执行到「人工」步骤会自动挂起</span></div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">04</span>人机交互（流程中的人工环节）</div>' +
        '<div class="vstack">' + (n.upgrade.filter(function (s) { return s.interaction; }).map(function (s) {
          return '<div class="row"><span class="row__main"><span class="row__t"><span class="tag tag--accent">人工</span>' + esc(s.name) + '</span>' +
            '<span class="row__s">负责人 ' + esc(s.interaction.owner) + ' · 超时 ' + s.interaction.timeoutS + 's</span></span>' +
            '<span class="row__right"><span id="stepMark-' + s.id + '"></span></span></div>';
        }).join('') || '<span class="note">当前流程没有人工环节 —— 新增一个「人工」类型的步骤即可</span>') + '</div>';
    } else {
      body.innerHTML =
        '<div class="sec-title"><span class="sec-title__no">01</span>网元成组</div>' +
        '<div class="frow frow--2">' +
        '<label class="field" for="groupSel"><span class="field__lbl">归入网元组</span><select class="input" id="groupSel"><option value="">（不归组）</option>' +
        S.groups.map(function (g) { return '<option value="' + g.id + '"' + (n.group === g.id ? ' selected' : '') + '>' + esc(g.name) + ' · ' + g.members.length + ' 成员</option>'; }).join('') + '</select></label>' +
        '<label class="field" for="groupStrategy"><span class="field__lbl">组策略</span><input class="input" id="groupStrategy" placeholder="串行 · 每台间隔 60s" data-fkey="groupStrategy" /></label>' +
        '</div>' +
        '<div class="hstack"><button class="abtn abtn--sm" id="groupApply" type="button"><span>应用归组</span></button>' +
        '<button class="abtn abtn--sm abtn--quiet" id="groupNew" type="button"><span>新建组</span></button>' +
        '<span class="note">同组网元可被一体化任务批量下发</span></div>' +
        '<div class="rule-h"></div>' +
        '<div class="sec-title"><span class="sec-title__no">02</span>复制网元</div>' +
        '<div class="hstack"><button class="abtn" id="neCopy" type="button" data-fx="standard"><span>复制当前网元</span></button>' +
        '<span class="note">编号按同前缀自动递增（' + esc(String(n.neId || '').replace(/\d{4}$/, '')) + 'NNNN），副本状态为「未注册」</span></div>';
    }
    if (neTab === 'flow') wireUpgradeRun();
    wireBtns(body);
  }

  function paintTabInk() {
    var ink = $('#neTabInk'), act = $('#neTabs .tabs__t.is-active');
    if (!ink || !act) return;
    if (REDUCED()) { ink.style.transition = 'none'; }
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + act.offsetLeft + 'px)';
    if (REDUCED()) setTimeout(function () { ink.style.transition = ''; }, 0);
  }

  function paintSteps(activeIdx, state) {
    var n = MP.byId(S.nes, neSel); if (!n) return;
    $$('#stepList .step').forEach(function (li, i) {
      li.classList.remove('is-done', 'is-active');
      if (activeIdx == null) return;
      if (i < activeIdx) li.classList.add('is-done');
      if (i === activeIdx) li.classList.add(state === 'done' ? 'is-done' : 'is-active');
    });
    var host = $('#stepStatus');
    if (!host) return;
    if (activeIdx == null) { host.textContent = '执行到「人工」步骤会自动挂起'; return; }
    var s = n.upgrade[activeIdx];
    if (!s) { host.textContent = '流程已完成'; return; }
    host.textContent = (activeIdx + 1) + '/' + n.upgrade.length + ' · ' + s.name + (s.kind === 'human' ? ' —— 等待人工放行' : '');
  }

  function wireUpgradeRun() {
    var btn = $('#upRun'); if (!btn) return;
    var n = MP.byId(S.nes, neSel); if (!n) return;
    /* 升级执行：按住确认（不可轻率触发）；重画后不重复接线 */
    if (btn.__holdWired) return;
    btn.__holdWired = 1;
    X.holdConfirm(btn, {
      duration: 1200, label: '按住执行升级流程', doneLabel: '升级进行中',
      onConfirm: function () { startUpgrade(n); }
    });
  }

  /* 人工环节的放行：按住确认（与虚层平台同一语言） */
  function wireStepGate(n, s) {
    var host = $('#stepStatus'); if (!host || !s) return;
    host.innerHTML = '';
    var b = el('button', 'abtn abtn--sm mx-hold');
    b.type = 'button';
    b.innerHTML = '<span class="mx-hold__label">按住放行人工步骤</span>';
    host.appendChild(b);
    X.holdConfirm(b, {
      duration: 900, label: '按住放行人工步骤', doneLabel: '已放行',
      onConfirm: function () {
        var idx = n.upgrade.map(function (x) { return x.id; }).indexOf(s.id);
        MP.sfx.play('confirm');
        upgradeRun = null;
        if (idx >= 0) { i = idx + 1; run(); }
      }
    });
  }

  var upgradeRun = null, upIdx = 0;

  function startUpgrade(n) {
    stopUpgrade();
    var total = n.upgrade.length;
    if (!total) { toast('该网元还没有升级步骤', '先到「升级流程」页签添加步骤', { tone: 'warn' }); return; }
    upIdx = 0;
    A.updateNE(n.id, { status: '升级中' });
    run();

    function run() {
      if (upIdx >= total) {
        paintSteps(null);
        var g = $('#flowGauge'); if (g && g.__mx) g.__mx.set(100);
        stopUpgrade();
        A.updateNE(n.id, { status: '在线', version: (n.oldVersions[0] || n.version) });
        toast('升级流程已完成', n.name + ' · 共 ' + total + ' 个步骤', { tone: 'ok' });
        return;
      }
      var s = n.upgrade[upIdx];
      paintSteps(upIdx);
      var gaugeHost = $('#flowGauge');
      if (gaugeHost && gaugeHost.__mx) gaugeHost.__mx.set(Math.round((upIdx + 1) / total * 100));
      if (s.kind === 'human') {
        /* 人机交互：流程挂起，就近给出按住放行 */
        var markHost = document.getElementById('stepMark-' + s.id);
        if (markHost) { markHost.innerHTML = ''; X.statusMark(markHost, { state: 'working', label: '等待人工放行' }); }
        wireStepGate(n, s);
        upgradeRun = { waiting: true };
        toast('流程停在人机交互步骤', s.name + ' · 在下方按住「放行人工步骤」继续', { tone: 'warn', duration: 6000 });
        MP.sfx.play('warn');
        return;
      }
      upgradeRun = setTimeout(function () { upIdx++; run(); }, s.kind === 'auto' ? 900 : 1200);
    }
  }
  function stopUpgrade() {
    if (upgradeRun && typeof upgradeRun !== 'number') { upgradeRun = null; return; }
    if (upgradeRun) { clearTimeout(upgradeRun); upgradeRun = null; }
  }

  function bindNe() {
    $('#neList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ne]'); if (!b) return;
      neSel = b.dataset.ne; stopUpgrade(); renderNe(); MP.sfx.play('step');
    });
    $('#neTabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-netab]'); if (!t) return;
      neTab = t.dataset.netab; keepFocus(renderNe); MP.sfx.play('step');
    });
    $('#neNew').addEventListener('click', function () {
      var n = A.addNE({
        name: '新网元 · 待命名', code: 'UPF', neId: 'UPF-HZ-00' + String(S.nes.length + 1).padStart(2, '0'),
        type: S.neTypes[2], arch: S.arches[0], vendor: S.vendors[3], version: '1.0.0', group: ''
      });
      neSel = n.id; neTab = 'profile';
      keepFocus(renderNe);
      var inp = $('#neName'); if (inp) { inp.focus(); inp.select(); }
      toast('已新建网元', n.neId + ' · 属性 / 版本 / 升级流程都可继续定制', { tone: 'ok' });
    });

    $('#neBody').addEventListener('change', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var t = e.target;
      if (t.dataset.nf) {
        if (t.dataset.nf === 'version' && !/^\d+\.\d+(\.\d+)?$/.test(t.value.trim())) {
          var err = $('#neVerErr'); if (err) { err.hidden = false; err.textContent = '版本号需形如 7.2.0'; }
          t.closest('.field').classList.add('is-invalid');
          MP.sfx.play('warn');
          return;
        }
        var err2 = $('#neVerErr'); if (err2) { err2.hidden = true; err2.textContent = ''; }
        t.closest('.field').classList.remove('is-invalid');
        A.updateNE(n.id, { [t.dataset.nf]: t.value });
        toast('已更新网元属性', t.dataset.nf + ' = ' + t.value, { duration: 2200 });
        return;
      }
      if (t.id === 'groupSel') { A.assignGroup(n.id, t.value); toast('已更新归组', t.value ? ('归入 ' + (SEL.group(t.value) || {}).name) : '已移出所有网元组', { tone: 'ok' }); return; }
    });
    $('#neBody').addEventListener('input', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var t = e.target;
      if (t.dataset.nf) { A.updateNE(n.id, { [t.dataset.nf]: t.value }); return; }
      if (t.dataset.pk && t.dataset.pid != null) {
        var params = Object.assign({}, n.params);
        if (t.dataset.pk === 'key') { delete params[t.dataset.pid]; params[t.value] = n.params[t.dataset.pid]; }
        else params[t.dataset.pid] = t.value;
        A.updateNE(n.id, { params: params });
      }
    });

    $('#neBody').addEventListener('click', function (e) {
      var n = MP.byId(S.nes, neSel); if (!n) return;
      var t = e.target;
      if (t.closest('#paramAdd')) {
        var k = $('#paramKey').value.trim(), v = $('#paramVal').value.trim();
        if (!k) { toast('属性名不能为空', '例如「心跳周期」', { tone: 'warn' }); $('#paramKey').focus(); return; }
        var p = Object.assign({}, n.params); p[k] = v || '—';
        A.updateNE(n.id, { params: p });
        toast('已新增属性', k + ' = ' + (v || '—'), { tone: 'ok', duration: 2400 });
        return;
      }
      var pd = t.closest('[data-param-del]');
      if (pd) { var p2 = Object.assign({}, n.params); delete p2[pd.dataset.paramDel]; A.updateNE(n.id, { params: p2 }); keepFocus(renderNe); toast('已删除属性', pd.dataset.paramDel, { duration: 2400 }); return; }
      if (t.closest('#neSave')) {
        asyncBtn(t.closest('#neSave'), '写入中', 420, function () {
          A.updateNE(n.id, {});
          toast('已保存网元属性', n.name + ' · ' + Object.keys(n.params).length + ' 项', { tone: 'ok' });
        });
        return;
      }
      if (t.closest('#vAdd')) {
        var field = $('#vField').value, rule = $('#vRule').value.trim(), level = $('#vLevel').value, msg = $('#vMsg').value.trim();
        A.addValidation(n.id, { field: field, rule: rule, level: level, message: msg || '不符合规则' });
        if ($('#vMsg')) $('#vMsg').value = '';
        toast('已添加校验规则', field + ' · ' + level, { tone: 'ok', duration: 2400 });
        return;
      }
      if (t.closest('#vRun')) {
        /* 参数校验：异步 + 结果形变（statusMark） */
        var host = $('#validResult');
        host.innerHTML = '';
        if (REDUCED()) {
          paintValidation(n);
        } else {
          var done = B.loading(t.closest('#vRun'), '校验中');
          X.latticeLoader(host, { label: '正在执行参数校验' });
          setTimeout(function () { paintValidation(n); done(); toast('参数校验完成', n.name + ' · ' + n.validations.length + ' 条规则', { tone: 'ok' }); }, 900);
        }
        return;
      }
      if (t.closest('#neCopy')) {
        asyncBtn(t.closest('#neCopy'), '复制中', 380, function () {
          var c = A.copyNE(n.id);
          if (c) { neSel = c.id; toast('已复制网元', n.name + ' → ' + c.name + '（' + c.neId + '）', { tone: 'ok' }); }
        });
        return;
      }
      if (t.closest('#groupApply')) {
        A.assignGroup(n.id, $('#groupSel').value);
        var g = SEL.group($('#groupSel').value);
        if (g) { var gs = $('#groupStrategy').value.trim(); if (gs) g.strategy = gs; MP.emit({ type: 'group', action: 'update' }); }
        toast('已应用归组', g ? (n.name + ' → ' + g.name) : '已移出所有网元组', { tone: 'ok' });
        return;
      }
      if (t.closest('#groupNew')) {
        var gname = '新建组 ' + (S.groups.length + 1);
        var ng = A.addGroup({ name: gname, desc: '在「成组 / 复制」里创建', strategy: $('#groupStrategy').value.trim() || '串行' });
        A.assignGroup(n.id, ng.id);
        toast('已新建网元组并归入', gname, { tone: 'ok' });
        return;
      }
      var up = t.closest('[data-step-up]'), down = t.closest('[data-step-down]'), del2 = t.closest('[data-step-del]');
      if (up) { A.moveStep(n.id, up.dataset.stepUp, -1); keepFocus(renderNe); return; }
      if (down) { A.moveStep(n.id, down.dataset.stepDown, 1); keepFocus(renderNe); return; }
      if (del2) { A.removeStep(n.id, del2.dataset.stepDel); keepFocus(renderNe); toast('已删除步骤', '升级流程已更新', { duration: 2400 }); return; }
      if (t.closest('#stepAdd')) {
        var name = $('#stepName').value.trim(), dur = +$('#stepDur').value || 30;
        if (!name) { toast('步骤名称不能为空', '例如「软件包校验」', { tone: 'warn' }); $('#stepName').focus(); return; }
        A.addUpgradeStep(n.id, { name: name, kind: stepKind, durationS: dur, owner: '值班工程师' });
        $('#stepName').value = '';
        keepFocus(renderNe);
        toast('已添加升级步骤', name + ' · ' + (stepKind === 'auto' ? '自动' : stepKind === 'manual' ? '手动' : '人工（人机交互）'), { tone: 'ok' });
        return;
      }
    });

    /* 步骤类型分段控件（每次进入「升级流程」页签重建） */
    var segHost = $('#stepKind');
    if (segHost) {
      X.segmented(segHost, {
        items: [{ label: '自动', value: 'auto' }, { label: '手动', value: 'manual' }, { label: '人工', value: 'human' }],
        value: stepKind,
        onChange: function (v) { stepKind = v; }
      });
    }
    var fg = $('#flowGauge');
    if (fg) fg.__mx = X.gauge(fg, { value: 0, unit: '%', label: '升级流程进度' });
    /* 人工步骤放行：按住确认 */
    $$('#neBody [id^="stepMark-"]').forEach(function (host) {
      var s = null;
      var n2 = MP.byId(S.nes, neSel);
      if (n2) s = n2.upgrade.filter(function (x) { return 'stepMark-' + x.id === host.id; })[0];
      X.statusMark(host, { state: s ? 'idle' : 'idle', label: '未执行' });
    });
  }
  var stepKind = 'auto';

  function paintValidation(n) {
    var res = A.runValidation(n.id);
    var host = $('#validResult'); if (!host) return;
    host.innerHTML = res.map(function (r) {
      return '<div class="row"><span id="vrm-' + r.id + '"></span>' +
        '<span class="row__main"><span class="row__t mono">' + esc(r.field) + '</span>' +
        '<span class="row__s">' + esc(r.message) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (r.level === '错误' ? 'tag--danger' : 'tag--warn') + '">' + esc(r.level) + '</span></span></div>';
    }).join('') || '<span class="note">没有启用的校验规则</span>';
    res.forEach(function (r) {
      var h = document.getElementById('vrm-' + r.id);
      if (h) X.statusMark(h, { state: r.pass ? 'done' : 'error', label: r.pass ? '通过' : '不通过' });
    });
    wireBtns(host);
  }

  /* ================================================================ 04 · 网元管理平台 */
  function renderOmp() {
    $('#ompScopeMeta').textContent = S.nes.length + ' 个网元 / ' + S.groups.length + ' 个组';
    $('#ompScope').innerHTML = S.nes.map(function (n, i) {
      return '<div class="row"><span class="row__num">X-' + String(i + 1).padStart(3, '0') + '</span>' +
        '<span class="row__main"><span class="row__t">' + esc(n.name) + '</span>' +
        '<span class="row__s mono">' + esc(n.code) + ' · ' + esc(n.arch) + ' · V' + esc(n.version) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (n.group ? 'tag--ok' : 'tag--ghost') + '">' + (n.group ? esc((SEL.group(n.group) || {}).name) : '未纳入平台') + '</span></span></div>';
    }).join('') + '<div class="rule-h"></div>' + S.groups.map(function (g) {
      return '<div class="row"><span class="row__main"><span class="row__t"><i class="dia" aria-hidden="true"></i>组 · ' + esc(g.name) + '</span>' +
        '<span class="row__s">' + esc(g.strategy) + ' · ' + esc(g.desc) + '</span></span>' +
        '<span class="row__right"><span class="tag tag--accent">' + g.members.length + ' 成员</span>' +
        '<button class="abtn abtn--sm" data-omp-group-task="' + g.id + '" type="button"><span>一键建任务</span></button></span></div>';
    }).join('');

    $('#accCount').textContent = S.accounts.length + ' 个账号';
    $('#accList').innerHTML = S.accounts.map(function (a) {
      return '<div class="row"><span class="row__main"><span class="row__t mono">' + esc(a.name) + '</span>' +
        '<span class="row__s">' + esc(a.role) + ' · 授权 ' + a.nes.length + ' 个网元' +
        (a.scope && a.scope.length ? ' · 范围 ' + a.scope.map(function (s) { return esc((SEL.group(s) || {}).name || s); }).join('、') : '') +
        ' · ' + esc(a.createdAt) + '</span></span>' +
        '<span class="row__right"><span class="tag ' + (a.status === '启用' ? 'tag--ok' : 'tag--ghost') + '">' + esc(a.status) + '</span>' +
        '<span id="accSw-' + a.id + '"></span></span></div>';
    }).join('') || '<div class="empty">暂无账号</div>';
    S.accounts.forEach(function (a) {
      var host = document.getElementById('accSw-' + a.id); if (!host) return;
      var sw = el('button', 'mx-sw');
      sw.type = 'button';
      host.appendChild(sw);
      /* 账号启停：速度驱动的挤压开关 */
      X.velocitySwitch(sw, {
        checked: a.status === '启用', label: '启用或停用账号 ' + a.name,
        onChange: function (on) {
          A.toggleAccount(a.id);
          toast(on ? '账号已启用' : '账号已停用', a.name + ' · ' + a.role, { tone: on ? 'ok' : 'warn', duration: 2400 });
        }
      });
    });

    $('#acScopes').innerHTML = S.groups.map(function (g) {
      return '<label class="chk"><input type="checkbox" value="' + g.id + '" data-scope />' + esc(g.name) + ' <em>' + g.members.length + ' 台</em></label>';
    }).join('') || '<span class="note">还没有网元组</span>';
    $('#acNes').innerHTML = S.nes.map(function (n) {
      return '<label class="chk"><input type="checkbox" value="' + n.id + '" data-acne />' + esc(n.name) + ' <em>' + esc(n.code) + '</em></label>';
    }).join('');

    $('#taskWrap').innerHTML = S.tasks.map(function (t) {
      var steps = t.steps.map(function (s, i) {
        return '<span class="tag ' + (s.state === 'done' ? 'tag--ok' : s.state === 'active' ? 'tag--accent' : 'tag--ghost') + '">' + (i + 1) + '. ' + esc(s.name) + '</span>';
      }).join('');
      return '<div class="fld' + (t.status === 'waiting-human' ? ' fld--warn' : '') + '">' +
        '<div class="hstack"><b>' + esc(t.name) + '</b><span class="tag tag--ghost">' + esc(t.type) + '</span>' +
        '<span class="tag tag--accent">' + esc(t.site) + '</span>' +
        '<span class="tag ' + (t.status === 'done' ? 'tag--ok' : t.status === 'waiting-human' ? 'tag--warn' : 'tag--ghost') + '">' +
        ({ done: '已完成', 'waiting-human': '等待人工', running: '执行中' })[t.status] + '</span>' +
        '<span class="note right">' + esc(t.owner) + ' · ' + esc(t.createdAt) + '</span></div>' +
        '<div class="hstack">' +
        '<span id="taskGauge-' + t.id + '"></span>' +
        '<span id="taskMark-' + t.id + '"></span>' +
        '<button class="abtn abtn--sm right" data-task-advance="' + t.id + '" type="button" data-fx="standard"><span>推进下一步</span></button></div>' +
        '<div class="hstack">' + steps + '</div>' +
        '<div class="fld__desc">关联站点 ' + esc(t.site) + ' · ' + t.neIds.length + ' 个目标网元 · 创建于 ' + esc(t.createdAt) + '</div>' +
        '</div>';
    }).join('') || '<div class="empty">暂无任务</div>';
    S.tasks.forEach(function (t) {
      var host = document.getElementById('taskGauge-' + t.id);
      if (host) X.gauge(host, { value: t.progress, label: '升级进度' });
      var m = document.getElementById('taskMark-' + t.id);
      var st = t.status === 'done' ? 'done' : t.status === 'waiting-human' ? 'idle' : 'working';
      if (m) X.statusMark(m, { state: st, label: ({ done: '已完成', 'waiting-human': '等待人工放行', running: '执行中' })[t.status] });
    });

    $('#tkSite').innerHTML = S.sites.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '（' + esc(s.region) + ' · ' + s.cpu + ' 核）</option>'; }).join('');
    $('#tkGroup').innerHTML = S.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + ' · ' + g.members.length + ' 个网元</option>'; }).join('');
    wireBtns($('#accList')); wireBtns($('#taskWrap')); wireBtns($('#ompScope'));
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
      /* 任务推进：异步，用 MP.btn.loading 顶住 */
      asyncBtn(b, '推进中', 460, function () {
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
    });
  }

  /* ================================================================ 05 · 生命周期平台 */
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
      return '<div class="row">' +
        '<span class="row__num">X-' + String(i + 1).padStart(3, '0') + '</span>' +
        '<span class="row__main"><span class="row__t mono">' + esc(p.name) + '</span>' +
        '<span class="row__s">' + esc(p.type) + ' · ' + esc(p.vendor) + ' · V' + esc(p.version) + ' · ' + p.sizeMB + 'MB · MD5 ' + esc(p.md5) + ' · 所属 ' + esc(neName(p.ne)) + '</span></span>' +
        '<span class="row__right">' + (p.validated ? '<span class="tag tag--ok">已校验</span>' : '<span class="tag tag--warn">待校验</span>') +
        '<span id="pkgMark-' + p.id + '"></span>' +
        (p.validated ? '' : '<button class="abtn abtn--sm" data-pkg-validate="' + p.id + '" type="button" data-fx="standard"><span>走校验流程</span></button>') +
        '<button class="ibtn ibtn--danger" data-pkg-del="' + p.id + '" type="button" aria-label="移除软件包 ' + esc(p.name) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" /></svg></button></span></div>';
    }).join('') || '<div class="empty">没有符合条件的软件包</div>';
    S.packages.forEach(function (p) {
      var host = document.getElementById('pkgMark-' + p.id); if (!host) return;
      X.statusMark(host, { state: p.validated ? 'done' : 'idle', label: p.validated ? '校验通过' : '未校验' });
    });

    $('#lcmScopeMeta').textContent = S.nes.length + ' 个受管网元';
    $('#lcmScope').innerHTML = S.nes.map(function (n) {
      return '<label class="chk is-on"><input type="checkbox" checked data-lcm-ne />' + esc(n.name) + ' <em>V' + esc(n.version) + '</em></label>';
    }).join('');

    var box = $('#deployBox');
    box.innerHTML =
      '<div class="vstack">' +
      '<div class="hstack"><b class="small">与网元管理平台共部署</b><span id="coDeploySw"></span>' +
      '<span class="tag ' + (S.deploy.lcmp.coDeploy ? 'tag--ok' : 'tag--ghost') + '">' + (S.deploy.lcmp.coDeploy ? '共用端点' : '独立端点') + '</span></div>' +
      '<div class="note">共部署时两个平台复用同一 mock 端点与证书（' + esc(S.deploy.omp.host) + '），端口只需登记一次、证书只需签发一次；' +
      (S.deploy.lcmp.coDeploy ? '当前 LCMP 与 NEMP 共用该端点。' : '当前 LCMP 使用独立端点，需要单独登记端口并签发证书。') + '</div>' +
      '<div class="frow frow--2">' +
      '<div class="fld' + (S.deploy.lcmp.coDeploy ? ' fld--accent' : '') + '"><div class="field__lbl">LCMP 端点</div><b class="mono">' + (S.deploy.lcmp.coDeploy ? esc(S.deploy.omp.host) : '10.18.32.104:9443') + '</b></div>' +
      '<div class="fld"><div class="field__lbl">NEMP 端点</div><b class="mono">' + esc(S.deploy.omp.host) + '</b></div>' +
      '<div class="fld"><div class="field__lbl">平台版本</div><b>' + esc(S.deploy.lcmp.version) + '</b></div>' +
      '<div class="fld"><div class="field__lbl">软件包</div><b class="mono">' + S.packages.length + ' 个（已校验 ' + S.packages.filter(function (p) { return p.validated; }).length + '）</b></div>' +
      '</div>' +
      '<div class="scale" aria-hidden="true"></div>' +
      '<div class="hstack"><span class="note">端口复用：共部署后 LCMP 的 32 个接口与 NEMP 的 46 个接口挂在同一端口上，由能力挂载区分</span></div>' +
      '</div>';
    var sw = el('button', 'mx-sw');
    sw.type = 'button';
    $('#coDeploySw').appendChild(sw);
    /* 共部署开关：速度驱动的挤压开关 */
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
    wireBtns($('#pkgList'));
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
        var host = document.getElementById('pkgMark-' + id);
        /* 软件包校验：格点波动 + 实时计时（长耗时区域） */
        if (host && !REDUCED()) { host.innerHTML = ''; X.latticeLoader(host, { label: '校验中' }); }
        v.remove();
        asyncBtn2(1500, function () {
          A.validatePackage(id);
          toast('软件包校验通过', 'MD5 / 厂商签名 / 依赖关系 三项一致', { tone: 'ok' });
        });
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
  function asyncBtn2(ms, work) { if (REDUCED()) { work(); return; } setTimeout(work, ms); }

  /* ================================================================ 06 · 虚层管理平台 */
  var vlpTimer = null;
  function stopVlp() { if (vlpTimer) clearTimeout(vlpTimer); vlpTimer = null; }

  function renderVlp() {
    var v = S.vlp;
    var pc = MP.byId(S.sites, v.primarySite) || {}, sc = MP.byId(S.sites, v.secondarySite) || {};
    $('#vlpCore').innerHTML =
      '<div class="frow frow--2">' +
      '<label class="field" for="vlpVer"><span class="field__lbl">平台版本 <i>VERSION</i></span><select class="input" id="vlpVer">' +
      ['VLMP R3.1.0', 'VLMP R3.0.6', 'VLMP R3.2.0-rc1'].map(function (o) { return '<option' + (o === v.version ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="field"><span class="field__lbl">CPU 数量（' + v.cpuRange[0] + '–' + v.cpuRange[1] + ' 核 · 拖拽或方向键）</span>' +
      '<div class="hstack"><div id="cpuScrub"></div>' +
      '<button class="abtn abtn--sm" data-cpu="-2" type="button" aria-label="减少 2 核"><span>−2</span></button>' +
      '<button class="abtn abtn--sm" data-cpu="2" type="button" aria-label="增加 2 核"><span>+2</span></button></div></div>' +
      '</div>' +
      '<div class="hstack" style="margin-top:12px">' +
      '<span id="cpuGauge"></span>' +
      '<div class="vstack grow">' +
      '<div class="frow frow--3">' +
      '<div class="fld"><div class="field__lbl">主站点余量</div><b class="mono">' + (pc.cpu == null ? '—' : pc.cpu) + ' 核</b></div>' +
      '<div class="fld"><div class="field__lbl">副站点余量</div><b class="mono">' + (sc.cpu == null ? '—' : sc.cpu) + ' 核</b></div>' +
      '<div class="fld"><div class="field__lbl">卷</div><b class="mono">' + esc(v.volume) + '</b></div>' +
      '</div>' +
      '<div class="note">CPU 超过站点余量时会进入橡皮筋超界提示；升级时会先做倒换演练再切版本。</div>' +
      '</div></div>';
    /* CPU 核数：拖拽改数值 + 超界橡皮筋 */
    X.scrub($('#cpuScrub'), {
      label: 'CPU', value: v.cpu, min: v.cpuRange[0], max: v.cpuRange[1], step: 2, suffix: ' 核',
      onChange: function (num) { A.setCPU(num); var g = $('#cpuGauge'); if (g && g.__mx) g.__mx.set((num - v.cpuRange[0]) / (v.cpuRange[1] - v.cpuRange[0]) * 100); }
    });
    var cg = $('#cpuGauge');
    /* 液面读数：CPU 配额 */
    cg.__mx = X.gauge(cg, { value: (v.cpu - v.cpuRange[0]) / (v.cpuRange[1] - v.cpuRange[0]) * 100, unit: '%', label: 'CPU 配额' });

    $('#vlpSites').innerHTML = S.sites.map(function (s) {
      var role = s.id === v.primarySite ? '主站点' : s.id === v.secondarySite ? '副站点' : '';
      return '<div class="row' + (role ? ' is-active' : '') + '"><span class="row__main"><span class="row__t">' +
        '<i class="dia' + (role === '主站点' ? '' : ' dia--muted') + '" aria-hidden="true"></i>' + esc(s.name) +
        ' <span class="tag tag--ghost mono">' + esc(s.region) + '</span></span>' +
        '<span class="row__s">可分配 CPU ' + s.cpu + ' 核 · 规划角色 ' + esc(s.role) + '</span></span>' +
        '<span class="row__right">' + (role ? '<span class="tag tag--accent">' + role + '</span>' : '') +
        '<button class="abtn abtn--sm" data-site-p="' + s.id + '" type="button"><span>设为主站</span></button>' +
        '<button class="abtn abtn--sm abtn--quiet" data-site-s="' + s.id + '" type="button"><span>设为副站</span></button></span></div>';
    }).join('');

    $('#vlpFlow').innerHTML = '<ul class="steps" id="vlpFlowList">' + v.upgradeFlow.map(function (s, i) {
      var kind = s.kind === 'auto' ? '<span class="tag tag--ghost">自动</span>' : s.kind === 'manual' ? '<span class="tag tag--warn">手动</span>' : '<span class="tag tag--accent">人工 · 人机交互</span>';
      return '<li class="step is-' + s.state + '"><span class="step__node" aria-hidden="true"></span>' +
        '<span class="step__body"><span class="step__name">' + String(i + 1).padStart(2, '0') + ' · ' + esc(s.name) + '</span>' +
        '<span class="step__meta">' + kind + '<span>' + ({ done: '已完成', active: '进行中', todo: '待执行' })[s.state] + '</span></span></span>' +
        (s.kind === 'human' && s.state !== 'done' ? '<span class="step__right"><button class="abtn abtn--sm mx-hold" data-vlp-human="' + s.id + '" type="button"><span class="mx-hold__label">按住放行</span></button></span>' : '') +
        '</li>';
    }).join('') + '</ul>';

    var checks = v.checks;
    $('#vlpCheckMeta').textContent = checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + checks.length + ' 通过';
    $('#vlpChecks').innerHTML = '<div class="vstack">' + checks.map(function (c) {
      return '<div class="row"><span id="vcm-' + c.id + '"></span>' +
        '<span class="row__main"><span class="row__t">' + esc(c.name) + '</span>' +
        '<span class="row__s">目标 ' + esc(c.target) + ' · ' + esc(c.detail) + '</span></span>' +
        '<span class="row__right"><span id="vcl-' + c.id + '"></span>' +
        (c.state === 'pass' ? '' : '<button class="abtn abtn--sm" data-check="' + c.id + '" type="button" data-fx="standard"><span>执行校验</span></button>') + '</span></div>';
    }).join('') + '</div>';

    checks.forEach(function (c) {
      var host = document.getElementById('vcm-' + c.id);
      if (host) X.statusMark(host, { state: c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle', label: ({ pass: '通过', warn: '警告', idle: '未执行' })[c.state] });
    });
    $$('#vlpFlowList [data-vlp-human]').forEach(function (b) {
      X.holdConfirm(b, {
        duration: 1000, label: '按住放行', doneLabel: '已放行',
        onConfirm: function () { stopVlp(); A.advanceVlpFlow(); toast('已人工放行版本切换', '流程继续推进', { tone: 'ok' }); vlpRun(); }
      });
    });
    wireBtns($('#vlpChecks'));
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
    $('#vlpAdvance').addEventListener('click', function (e) {
      stopVlp();
      asyncBtn(e.currentTarget, '推进中', 420, function () {
        A.advanceVlpFlow();
        MP.sfx.play('step');
        vlpRun();
      });
    });
    $('#vlpReset').addEventListener('click', function () { stopVlp(); A.resetVlpFlow(); toast('已重置升级流程', '回到第一步：平台预检', { duration: 2400 }); });
    $('#vlpChecks').addEventListener('click', function (e) {
      var b = e.target.closest('[data-check]'); if (!b) return;
      var host = document.getElementById('vcl-' + b.dataset.check);
      b.remove();
      var mark = document.getElementById('vcm-' + b.dataset.check);
      if (mark && !REDUCED()) { mark.innerHTML = ''; X.latticeLoader(mark, { label: '校验中' }); }
      else if (host && !REDUCED()) { X.latticeLoader(host, { label: '校验中' }); }
      setTimeout(function () {
        A.runVlpCheck(b.dataset.check);
        toast('校验项已刷新', '结果更新为通过', { tone: 'ok', duration: 2400 });
      }, 950);
    });
  }

  /* 虚层升级流程的自动推进（含人机交互挂起） */
  function vlpRun() {
    var v = S.vlp;
    var active = v.upgradeFlow.filter(function (s) { return s.state === 'active'; })[0];
    if (!active) return;
    if (active.kind === 'human') {
      toast('流程停在人机交互步骤', active.name + ' · 请按住「放行」继续', { tone: 'warn', duration: 6000 });
      MP.sfx.play('warn');
      return;
    }
    if (REDUCED()) return;
    vlpTimer = setTimeout(function () {
      A.advanceVlpFlow();
      MP.sfx.play('step');
      vlpRun();
    }, active.kind === 'auto' ? 1200 : 1500);
  }

  /* ================================================================== 导航 */
  var navOrder = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var NAV = {
    mock: { idx: '01', zh: 'Mock 管理', en: 'PORT REGISTRY', lv: 'PUBLIC', cat: '01 · MOCK 管理 / PORT REGISTRY' },
    flow: { idx: '02', zh: 'Mock 流程', en: 'RESPONSE STUDIO', lv: 'RESTRICTED', cat: '02 · MOCK 流程 / RESPONSE STUDIO' },
    ne: { idx: '03', zh: '网元管理', en: 'NE SPECIMEN', lv: 'RESTRICTED', cat: '03 · 网元管理 / NE SPECIMEN' },
    omp: { idx: '04', zh: '网元管理平台', en: 'MANAGED SCOPE', lv: 'TOP SECRET', cat: '04 · 网元管理平台 / MANAGED SCOPE' },
    lcm: { idx: '05', zh: '生命周期平台', en: 'PACKAGE LIFE CYCLE', lv: 'RESTRICTED', cat: '05 · 生命周期平台 / PACKAGE LIFE CYCLE' },
    vlp: { idx: '06', zh: '虚层管理平台', en: 'VIRTUAL LAYER', lv: 'TOP SECRET', cat: '06 · 虚层管理平台 / VIRTUAL LAYER' }
  };
  var LV = {}; Object.keys(NAV).forEach(function (k) { LV[k] = NAV[k].lv; });

  /* 刻度尺：选中格加长 + 暖杏金，琥珀条连续移动（临界阻尼、保留速度） */
  var rulerSpring = null;
  function railAxis() {
    return (window.innerWidth <= 768) ? 'x' : 'y';
  }
  function measureRuler(animate) {
    var bar = $('#railBar'), act = $('#rail .tick.is-active'), track = $('.rail__track');
    if (!bar || !act || !track) return;
    var ar = act.getBoundingClientRect(), tr = track.getBoundingClientRect();
    var axis = railAxis();
    var size = axis === 'x' ? ar.width : ar.height;
    var pos = axis === 'x' ? (ar.left - tr.left) : (ar.top - tr.top);
    bar.style.setProperty('--ruler-h', size + 'px');
    document.documentElement.style.setProperty('--ruler-h', size + 'px');
    if (rulerSpring) { rulerSpring.stop(); rulerSpring = null; }
    if (!animate || REDUCED()) {
      document.documentElement.style.setProperty('--ruler-y', pos + 'px');
      return;
    }
    var from = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ruler-y')) || 0;
    rulerSpring = M.spring({
      from: from, to: pos, stiffness: 190, damping: 22,
      onUpdate: function (v) { document.documentElement.style.setProperty('--ruler-y', v + 'px'); },
      onDone: function () { rulerSpring = null; }
    });
  }

  /* 编号滚动：460ms direct（旧的向上翻出、新的向上翻入），减少动态效果直接切换 */
  function rollIndex(name) {
    var host = document.querySelector('[data-rn="' + name + '"]');
    if (!host) return;
    var next = NAV[name].idx;
    if (host.__cur === next) return;
    var prev = host.__cur || host.textContent.trim();
    host.__cur = next;
    if (REDUCED()) { host.textContent = next; return; }
    host.innerHTML = '<span class="rn__out" aria-hidden="true">' + esc(prev) + '</span><span class="rn__in">' + esc(next) + '</span>';
    setTimeout(function () {
      if (host.__cur === next) host.textContent = next;
    }, 480);
  }

  /* 解密揭示：给每张卡片量出扫描线行程，再逐张放行（前沿自上而下） */
  function decryptCards(sc) {
    var cards = $$('.card', sc);
    cards.forEach(function (c) {
      c.classList.remove('is-frosted', 'is-decrypted', 'is-developing');
      c.style.removeProperty('--dcy-end');
    });
    if (REDUCED()) return;
    cards.forEach(function (c) {
      var end = Math.max(120, c.offsetHeight - 2);
      c.style.setProperty('--dcy-end', end + 'px');
      c.classList.add('is-frosted');
      void c.offsetHeight;
    });
    cards.forEach(function (c, i) {
      setTimeout(function () {
        c.classList.add('is-decrypted');
        setTimeout(function () { c.classList.remove('is-frosted', 'is-decrypted'); }, 480);
      }, i * 70);
      setTimeout(function () {
        c.classList.add('is-developing');
        setTimeout(function () { c.classList.remove('is-developing'); }, 400);
      }, i * 70 + 90);
    });
  }

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
    $$('#rail .tick').forEach(function (b) {
      var on = b.dataset.nav === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    rollIndex(name);
    measureRuler(true);
    renderScreenContent(name);
    renderKpisFor(name);
    document.title = 'Mock 平台 · V4 · ' + NAV[name].zh + ' · 莱茵生命档案终端';
    var ftCat = $('#ftCat'); if (ftCat) ftCat.textContent = NAV[name].cat;
    var ftIdx = $('#ftIdx'); if (ftIdx) ftIdx.textContent = NAV[name].idx + ' / 06';
    var ftLv = $('#ftLv'); if (ftLv) ftLv.textContent = NAV[name].lv;
    var sc = document.querySelector('.screen[data-screen="' + name + '"]');
    if (!sc) { navLock = false; return; }
    if (pendingOrigin) { M.iris(sc, { origin: pendingOrigin }); pendingOrigin = null; }
    else M.develop(sc, { duration: 380 });
    var cards = sc.querySelectorAll('.card');
    if (cards.length && !REDUCED()) M.stagger(cards, { each: 26, y: 10, duration: 300 });
    M.reveal(sc);
    decryptCards(sc);
    wireBtns(sc);
    navLock = false;
  }

  function go(name, btn) {
    if (navLock) return;
    if (S.ui.screen === name && !btn) return;
    navLock = true;
    if (btn) {
      var r = btn.getBoundingClientRect();
      var s = $('#stage').getBoundingClientRect();
      /* iris 圆心 = 刻度在舞台坐标系里的中心（从导航刻度展开） */
      pendingOrigin = (r.left + r.width / 2 - s.left) + 'px ' + Math.max(0, r.top + r.height / 2 - s.top) + 'px';
    }
    MP.sfx.play('iris');
    A.setScreen(name);
  }

  function bindNav() {
    $$('#rail .tick').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.nav, b); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key >= '1' && e.key <= '6') { go(navOrder[+e.key - 1], $('#rail .tick.is-active')); return; }
      if (e.key === '[' || e.key === ']') {
        var i = navOrder.indexOf(S.ui.screen);
        var j = (i + (e.key === ']' ? 1 : navOrder.length - 1)) % navOrder.length;
        go(navOrder[j], $('#rail .tick.is-active'));
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        applyTheme(S.ui.theme === 'dawn' ? 'night' : 'dawn');
        toast(S.ui.theme === 'night' ? '已切换到「深夜」' : '已切换到「晨雾」', '石墨底 + 暖白文字 + 琥珀强调，颜色连续过渡', { duration: 2600 });
      }
    });
    window.addEventListener('resize', function () { measureRuler(false); });
  }

  /* ============================================================== 渲染调度 */
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
    if (t === 'log-filter' || t === 'log-query') { if (state.ui.screen === 'flow') keepFocus(function () { renderLogs(true); }); return; }
    if (t === 'interaction-resolved') { if (state.ui.screen === 'flow') renderLogs(true); return; }
    if (t === 'ne' || t === 'upgrade' || t === 'validation' || t === 'group') {
      renderTelemetry();
      if (state.ui.screen === 'ne') { keepFocus(renderNe); wireUpgradeRun(); }
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
    TOAST_HOST = $('#toasts');
    /* 技能动效层：只加动、不加装饰 */
    B.install();
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    applyTheme(saved === 'night' ? 'night' : 'dawn');   /* 默认亮色「晨雾」 */
    var s = document.createElement('span'); s.className = 'sr'; s.textContent = 'sw'; document.body.appendChild(s); s.remove();
    wireBtns(document);
    renderChrome();
    switchScreen(S.ui.screen);
    bindNav(); bindMock(); bindFlow(); bindNe(); bindOmp(); bindLcm(); bindVlp();

    $('#sfxBtn').addEventListener('click', function () {
      var on = MP.sfx.toggle();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? '界面音效已开启' : '界面音效已关闭', on ? '合成音效与操作反馈共用同一空间感' : '静音模式下所有交互仍保留视觉反馈', { duration: 2600 });
    });
    $('#themeBtn').addEventListener('click', function () {
      applyTheme(S.ui.theme === 'dawn' ? 'night' : 'dawn');
      toast(S.ui.theme === 'night' ? '已切换到「深夜」' : '已切换到「晨雾」', '颜色约 650ms 连续过渡，不硬切', { duration: 2400 });
    });
    $('.ft').addEventListener('click', function (e) {
      if (e.target.closest('.ft__cell--grow')) return;
      if (S.ui.running) {
        MP.sim.stop(); S.ui.running = false; renderTelemetry();
        toast('已暂停流量模拟', '审计日志不再自动追加', { duration: 2200 });
      } else {
        MP.sim.start(2600); S.ui.running = true; renderTelemetry();
        toast('已恢复流量模拟', '对端请求会持续进入审计日志', { tone: 'ok', duration: 2200 });
      }
    });

    MP.sim.start(2600);
    setInterval(function () { $('#clock').textContent = MP.clock(); }, 1000);
    $('#clock').textContent = MP.clock();
    M.reveal(document);
    MP.sfx.play('boot');
    console.log('%c[Mock 平台 V4 · 莱茵生命档案终端] 已就绪 · 6 个界面 · 数字键 1–6 / [ ] 切换 · T 切主题', 'color:#a67d48');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ==========================================================================
 * 原图补遗 · Lead 追加（2026-10-16）
 * 依据用户提供的原作截图实现：
 *   · ARCHIVE INDEX 可检索弹层（原图 3）：六屏 + 端点 + 平台能力 + 网元 + 软件包 统一检索与跳转
 *   · 顶部 [+ SAVED] 计数、刻度尺底部 NO.0xx / INTERNAL DATABASE、底部 SESSION AUTHORIZED / REINITIALIZE
 *   · 端点档案卡底部的两列键值表（DEPARTMENT / COLLECTION / RELATED / STATUS）
 * 全部只读 MP.state / 只走 MP.actions，不改既有渲染逻辑；以独立 IIFE 追加，便于回退。
 * ==========================================================================*/
(function () {
  'use strict';
  var MP = window.MP; if (!MP) return;
  var S = MP.state, A = MP.actions, SEL = MP.select;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  var OPERATOR = 'JOYCE';                     // 原图底部状态行里的访问者
  var SCREENS = [
    { id: 'mock', no: '01', zh: 'Mock 管理', en: 'PORT REGISTRY / CERTIFICATE', cat: '界面' },
    { id: 'flow', no: '02', zh: 'Mock 流程', en: 'AUDIT LOG / RESPONSE STUDIO', cat: '界面' },
    { id: 'ne', no: '03', zh: '网元管理', en: 'NE SPECIMEN / VALIDATION', cat: '界面' },
    { id: 'omp', no: '04', zh: '网元管理平台', en: 'MANAGED SCOPE / ACCOUNT', cat: '界面' },
    { id: 'lcm', no: '05', zh: '生命周期平台', en: 'PACKAGE / CO-DEPLOY', cat: '界面' },
    { id: 'vlp', no: '06', zh: '虚层管理平台', en: 'CPU / SITE PAIR', cat: '界面' }
  ];
  var CATS = ['全部档案', '界面', '端点', '平台能力', '网元', '软件包'];
  var cat = '全部档案', q = '';

  var modal = document.getElementById('idxModal');   // 弹层根节点（wire/open/close 都用它）

  /* ---------------------------------------------------------- 记录集构建 */
  function records() {
    var out = [];
    SCREENS.forEach(function (s) {
      out.push({ no: 'X-0' + s.no, zh: s.zh, en: s.en, cat: '界面', dept: '界面 / SCREEN', acc: 'AUTHORIZED', go: function () { A.setScreen(s.id); } });
    });
    S.ports.forEach(function (p, i) {
      var caps = SEL.capsOfPort(p.id).map(function (c) { return c.name; }).join(' + ') || '未挂载能力';
      out.push({
        no: 'X-1' + String(i + 1).padStart(2, '0'), zh: p.ip + ':' + p.port, en: p.note + ' · ' + caps,
        cat: '端点', dept: '端点 / PORT',
        acc: p.running ? 'AUTHORIZED' : (p.cert.status === 'issued' ? 'RESTRICTED' : 'LOCKED'),
        go: function () { A.setScreen('mock'); A.selectPort(p.id); }
      });
    });
    S.caps.forEach(function (c) {
      var used = S.ports.filter(function (p) { return p.caps.indexOf(c.id) >= 0; }).length;
      out.push({
        no: c.code, zh: c.name, en: c.version + ' · ' + c.endpoints + ' 接口 · 已挂载 ' + used + ' 个端点',
        cat: '平台能力', dept: '能力 / CAPABILITY',
        acc: used ? 'AUTHORIZED' : 'RESTRICTED',
        go: function () { A.setScreen('mock'); }
      });
    });
    S.nes.forEach(function (n) {
      var g = SEL.group(n.group);
      out.push({
        no: n.neId, zh: n.name, en: n.type + ' · V' + n.version + ' · ' + (g ? g.name : '未成组'),
        cat: '网元', dept: '网元 / ' + n.code, acc: n.status === '在线' ? 'AUTHORIZED' : 'RESTRICTED',
        go: function () { A.setScreen('ne'); }
      });
    });
    S.packages.forEach(function (k) {
      out.push({
        no: k.type, zh: k.name, en: 'V' + k.version + ' · ' + k.vendor + ' · ' + k.sizeMB + 'MB · MD5 ' + k.md5,
        cat: '软件包', dept: '软件包 / PACKAGE', acc: k.validated ? 'AUTHORIZED' : 'RESTRICTED',
        go: function () { A.setScreen('lcm'); }
      });
    });
    return out;
  }

  function filtered() {
    var all = records();
    var key = q.trim().toLowerCase();
    return all.filter(function (r) {
      if (cat !== '全部档案' && r.cat !== cat) return false;
      if (!key) return true;
      return (r.no + r.zh + r.en + r.dept + r.acc + r.cat).toLowerCase().indexOf(key) >= 0;
    });
  }

  /* ------------------------------------------------------------ 弹层渲染 */
  function renderChips() {
    var host = $('#idxChips'); if (!host) return;
    host.innerHTML = CATS.map(function (c) {
      return '<button class="modal__chip' + (c === cat ? ' is-on' : '') + '" type="button" role="tab" aria-selected="' + (c === cat) + '" data-cat="' + esc(c) + '" data-fx="subtle">' + esc(c) + '</button>';
    }).join('');
  }

  function renderList(withSkeleton) {
    var host = $('#idxList'); if (!host) return;
    var cnt = $('#idxCount');
    if (withSkeleton) {
      host.innerHTML = '<div class="idx__headrow"><span>FILE / 档案</span><span>标题 / TITLE</span><span>科室 / DEPARTMENT</span><span>权限 / ACCESS</span><span></span></div>' +
        '<div style="padding:18px 0"><div class="sk"><i></i><i></i><i></i><i></i></div></div>';
      if (cnt) cnt.textContent = '检索中…';
      return;
    }
    var rows = filtered();
    host.innerHTML = '<div class="idx__headrow"><span>FILE / 档案</span><span>标题 / TITLE</span><span>科室 / DEPARTMENT</span><span>权限 / ACCESS</span><span></span></div>' +
      (rows.length ? rows.map(function (r, i) {
        return '<button class="idx__row" type="button" data-idx="' + i + '" data-fx="subtle">' +
          '<span class="idx__no">' + esc(r.no) + '</span>' +
          '<span class="idx__main"><b>' + esc(r.zh) + '</b><i>' + esc(r.en) + '</i></span>' +
          '<span class="idx__dept">' + esc(r.dept) + '</span>' +
          '<span class="idx__acc">' + esc(r.acc) + '</span>' +
          '<span class="idx__go" aria-hidden="true">↗</span>' +
          '</button>';
      }).join('') : '<div class="idx__empty">未找到匹配的档案 · NO RECORDS FOUND</div>');
    if (cnt) cnt.textContent = String(rows.length).padStart(2, '0') + ' RECORDS FOUND';
    host.__rows = rows;
  }

  var lastFocus = null;
  function openIdx() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('is-closing');
    renderChips();
    renderList(true);                                  // 原图 2 的那种「先占位后揭示」
    setTimeout(function () { if (!modal.hidden) renderList(false); }, 320);
    var inp = $('#idxInput'); if (inp) { inp.value = ''; q = ''; setTimeout(function () { inp.focus(); }, 60); }
  }

  function closeIdx() {
    if (!modal || modal.hidden) return;
    modal.classList.add('is-closing');
    setTimeout(function () {
      modal.hidden = true; modal.classList.remove('is-closing');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 200);
  }

  /* -------------------------------------------------------- 外壳细节刷新 */
  function renderShell() {
    var s = SCREENS.filter(function (x) { return x.id === S.ui.screen; })[0] || SCREENS[0];
    var no = $('#railNo'); if (no) no.textContent = 'NO.' + String(s.no).padStart(3, '0');
    var idx = $('#ftIdx'); // 既有页脚已维护
    var saved = $('#savedN');
    if (saved) saved.textContent = S.ports.filter(function (p) { return p.cert.status === 'issued'; }).length;
    var user = $('#ftUser'); if (user) user.textContent = OPERATOR;
    renderKv();
  }

  function renderKv() {
    var host = $('#pdKv'); if (!host) return;
    var p = SEL.port();
    if (!p) { host.innerHTML = ''; return; }
    var caps = SEL.capsOfPort(p.id).map(function (c) { return c.name; }).join(' + ') || '未挂载能力';
    var status = p.running ? '● 服务运行中 · 可读取'
      : (p.cert.status === 'issued' ? '○ 证书已签发 · 待启动' : '○ 仅登记 · 尚未签发证书');
    var rows = [
      ['DEPARTMENT / 科室', esc(caps)],
      ['COLLECTION / 编目范围', esc(p.ip + ':' + p.port + ' · ' + p.protocol + ' / ' + p.tls)],
      ['RELATED / 相关人物', esc(OPERATOR + ' · 检定代理 ' + S.host.agent)],
      ['STATUS / 状态', status]
    ];
    host.innerHTML = '<div class="kv">' + rows.map(function (r) {
      return '<div class="kv__row"><i>' + r[0] + '</i><b>' + r[1] + '</b></div>';
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------------- 事件接线 */
  function wire() {
    if (!modal) return;
    var idxBtn = $('#idxBtn'); if (idxBtn) idxBtn.addEventListener('click', openIdx);
    var ovwBtn = $('#ovwBtn'); if (ovwBtn) ovwBtn.addEventListener('click', openIdx);
    var reinit = $('#reinitBtn');
    if (reinit) reinit.addEventListener('click', function () { MP.sfx.play('boot'); location.reload(); });

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeIdx(); MP.sfx.play('tick'); return; }
      var chip = e.target.closest('[data-cat]');
      if (chip) { cat = chip.dataset.cat; renderChips(); renderList(false); MP.sfx.play('step'); return; }
      var row = e.target.closest('[data-idx]');
      if (row) {
        var list = $('#idxList');
        var r = list && list.__rows ? list.__rows[+row.dataset.idx] : null;
        if (r && r.go) { closeIdx(); r.go(); MP.sfx.play('latch'); }
      }
    });

    var inp = $('#idxInput');
    if (inp) inp.addEventListener('input', function () { q = inp.value; renderList(false); });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') {
        if (!modal.hidden) { closeIdx(); e.preventDefault(); return; }
        if (S.ui.screen !== 'mock' && !typing) { A.setScreen('mock'); e.preventDefault(); }
        return;
      }
      if (e.key === '/' && !typing && modal.hidden) { openIdx(); e.preventDefault(); }
    });
  }

  MP.subscribe(function () { renderShell(); if (modal && !modal.hidden) renderList(false); });

  function start() { wire(); renderShell(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

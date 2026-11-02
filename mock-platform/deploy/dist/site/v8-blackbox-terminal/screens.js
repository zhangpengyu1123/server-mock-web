/* ============================================================================
 * V8 · BLACKBOX TERMINAL —— 屏级层（七个界面：六屏业务 + 系统）
 *   每个屏注册 { tag, title, list(), main(), stats(), cmd(), pick(), act{}, change(), submit(), mount() }
 * ==========================================================================*/
(function () {
  var V = window.V8, S = MP.state, A = MP.actions, SEL = MP.select, X = MP.micro, B = MP.btn, M = MP.motion;
  var h = V.h, f = V.f, p = V.p, clamp = V.clamp;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function kv(k, v) { return '<div class="kv"><span class="kv__k">' + k + '</span><span class="kv__v">' + (v == null || v === '' ? '—' : v) + '</span></div>'; }
  function pnl(cap, en, body, opt) {
    opt = opt || {};
    return '<section class="pnl' + (opt.cls ? ' ' + opt.cls : '') + '">' +
      '<div class="pnl__cap"><b>' + cap + '</b>' + (en ? '<i>' + en + '</i>' : '') +
      (opt.right ? '<span class="pnl__capB">' + opt.right + '</span>' : '') + '</div>' +
      '<div class="pnl__bd' + (opt.bd ? ' ' + opt.bd : '') + '">' + body + '</div></section>';
  }
  function blk(label, act, attrs, cls) {
    return '<button class="blk ' + (cls || '') + '" type="button" data-act="' + act + '" ' + (attrs || '') + '>' + label + '</button>';
  }
  function tag(t, cls) { return '<span class="tag ' + (cls || '') + '">' + t + '</span>'; }
  function field(label, en, inner) {
    return '<label class="fld"><span class="fld__lb">' + label + '<i>' + (en || '') + '</i></span>' + inner + '</label>';
  }
  function inp(name, value, opt) {
    opt = opt || {};
    return '<input class="inp" name="' + name + '" id="' + (opt.id || name) + '" value="' + h(value) + '"' +
      (opt.placeholder ? ' placeholder="' + h(opt.placeholder) + '"' : '') +
      (opt.list ? ' list="' + opt.list + '"' : '') + (opt.type ? ' type="' + opt.type + '"' : '') +
      (opt.attrs || '') + ' />';
  }
  function sel(name, value, options, attrs) {
    return '<select class="inp inp--sel" name="' + name + '" id="' + name + '" ' + (attrs || '') + '>' +
      options.map(function (o) {
        var v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
        return '<option value="' + h(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + h(l) + '</option>';
      }).join('') + '</select>';
  }
  function portLabel(pf) { return pf.ip + ':' + pf.port; }
  // curNE() 是按 id 查询的（无参返回 null），选中态必须自己存
  function curNE() {
    var id = V.state.sel.ne;
    return S.nes.filter(function (n) { return n.id === id; })[0] || S.nes[0] || null;
  }
  function certTag(pf) {
    var c = pf.cert || {};
    if (c.status === 'issued') return tag('CERT OK', 'tag--ok');
    if (c.status === 'expired') return tag('EXPIRED', 'tag--err');
    return tag('NO CERT', 'tag--dim');
  }
  function statusOf(code) {
    if (code >= 500) return tag(code, 'tag--err');
    if (code >= 400) return tag(code, 'tag--warn');
    return tag(code, 'tag--ok');
  }
  function fmtLogTime(l) { return l.clock || V.clock(new Date(l.ts)); }

  /* ================================================================ I 接入 */
  var MOCK = {
    group: 'prep', selKey: 'port', tag: '端点', tagEn: 'ENDPOINTS', empty: '还没有登记端点',
    title: '接 入 层', sub: '- 端点与身份登记',
    stats: function () {
      var run = S.ports.filter(function (x) { return x.running; }).length;
      return [{ k: 'ENDPOINTS', v: S.ports.length }, { k: 'RUNNING', v: run }, { k: 'CERTS', v: S.ports.filter(function (x) { return x.cert.status === 'issued'; }).length }];
    },
    list: function () {
      return S.ports.map(function (x) {
        return { id: x.id, label: portLabel(x), meta: x.protocol + '/' + x.tls + ' · ' + (x.cert.status === 'issued' ? '已签发' : '待签发'), count: x.caps.length + ' CAP' };
      });
    },
    pick: function (id) { A.selectPort(id); },
    cmd: function () { return '选择端点：在下方签发证书、挂载能力；启用服务请回运行台。'; },
    enter: function (id) { if (!id) return false; A.selectPort(id); return true; },
    main: function () {
      var pf = SEL.port();
      if (!pf) return pnl('端点', 'ENDPOINT', '<div class="empty">左侧还没有端点。登记一个本机端点开始。</div>');
      var caps = SEL.capsOfPort(pf.id);
      var mounted = {}; (pf.caps || []).forEach(function (id) { mounted[id] = 1; });
      var canStart = pf.cert.status === 'issued' && (pf.caps || []).length > 0;
      var s = pf.stats || {};
      var info = pnl('端点', 'ENDPOINT', '<div class="pnl__bd--3">' +
        kv('地址', '<b>' + h(portLabel(pf)) + '</b>') + kv('协议 / TLS', h(pf.protocol + ' / ' + pf.tls)) +
        kv('证书', certTag(pf) + ' <small>' + (pf.cert.days ? pf.cert.days + ' 天' : '—') + '</small>') +
        kv('签发时间', h(pf.cert.issuedAt || '—')) + kv('签发机构', h(pf.cert.issuer || '—')) +
        kv('指纹', '<small>' + h((pf.cert.fingerprint || '—').slice(0, 22)) + '</small>') +
        kv('请求 / 成功 / 异常', h(f(s.req)) + ' / ' + h(f(s.ok)) + ' / ' + h(f(s.err))) +
        kv('当前 RPS', '<b>' + h((s.rps || 0).toFixed(1)) + '</b>') +
        kv('备注', '<small>' + h(pf.note || '—') + '</small>') + '</div>', { right: certTag(pf) });
      var reg = pnl('端点登记', 'REGISTER', '<form class="form" data-form="port"><div class="fgrid fgrid--2">' +
        field('本机 IP', 'IP', inp('ip', '', { placeholder: '10.18.x.x', list: 'nicList', id: 'mkIp' })) +
        field('端口', 'PORT', inp('port', '', { placeholder: '8443', id: 'mkPort', type: 'number' })) +
        '</div><div class="fgrid fgrid--2">' +
        field('协议', 'PROTOCOL', sel('protocol', 'HTTPS', ['HTTPS', 'HTTP'])) +
        field('TLS 版本', 'TLS', sel('tls', 'TLS1.3', ['TLS1.3', 'TLS1.2', '—'])) +
        '</div><div class="blkbar">' + blk('登记端点', 'noop', 'type="submit"', 'blk--dark') +
        '<button class="blk" type="button" data-act="fillNic">取本机网卡</button></div>' +
        '<datalist id="nicList">' + (S.host && S.host.ip ? '<option value="' + h(S.host.ip) + '">主网卡</option>' : '') +
        (S.host && S.host.alt ? '<option value="' + h(S.host.alt) + '">第二网卡</option>' : '') + '</datalist>' +
        '<p class="hint">登记后可签发证书并挂载平台能力；三者齐备才能启动 mock 服务。</p></form>');
      var capPanel = pnl('能力挂载', 'CAPABILITY', '<div class="capgrid" id="capGrid">' +
        S.caps.map(function (c) {
          var on = !!mounted[c.id];
          return '<button class="chip' + (on ? ' is-on' : '') + '" type="button" data-act="toggleCap" data-id="' + h(c.id) + '"' +
            (canStart || on ? '' : '') + ' aria-pressed="' + on + '"><span class="capcode">' + h(c.code) + '</span>' +
            '<span class="capname">' + h(c.name) + '</span><span class="capep">' + c.endpoints + 'EP</span></button>';
        }).join('') + '</div><p class="hint">已挂载 ' + caps.length + ' 项能力。能力决定这个端点能仿真哪些接口。</p>',
        { right: '<span class="pnl__note mono">' + caps.length + ' / ' + S.caps.length + '</span>' });
      var prefill = '<div class="hint" style="padding:0 0 10px">这一屏只做离线准备：登记端点、签发证书、挂载能力。启动服务在「运行台」。</div>';
      var certPanel = pnl('证书', 'CERTIFICATE', '<div class="certrow">' +
        field('有效期', 'VALID FOR', '<select class="inp inp--sel" data-fk="certDays">' + [30, 90, 365, 730].map(function (d) {
          return '<option value="' + d + '"' + ((V.state.certDays || 365) === d ? ' selected' : '') + '>' + d + ' 天</option>';
        }).join('') + '</select>') +
        '<div class="blkbar">' + blk('签发证书', 'genCert', '', 'blk--dark blk--sm') +
        blk('重新签发', 'reissue', '', 'blk--sm') + blk('导出 PEM', 'exportPem', '', 'blk--sm') + '</div>' +
        '</div><p class="hint">签发后可导出 PEM 给对端网元导入；重新签发会重置有效期。</p>', { right: certTag(pf) });
      return prefill + info + certPanel + reg + capPanel;
    },
    mount: function () {
      var pf = SEL.port();
      if (!pf) return;
      if ($('#mkStart')) X.holdConfirm($('#mkStart'), {
        duration: 900, label: '按住 0.9 秒启动',
        onConfirm: function () { A.startService(pf.id); V.toast('mock 服务已启动', portLabel(pf) + ' · ' + pf.caps.length + ' 项能力', 'ok'); V.rerender(); }
      });
      if ($('#mkFuse')) X.fuseButton($('#mkFuse'), {
        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onCommit: function () { A.stopService(pf.id); V.rerender(); },
        onUndo: function () { A.startService(pf.id); V.rerender(); }
      });
    },
    act: {
      fillNic: function () { var el = $('#mkIp'); if (el && S.host) el.value = S.host.ip; },
      toggleCap: function (node) { var pf = SEL.port(); if (!pf) return; var id = node.getAttribute('data-id'); if ((pf.caps || []).indexOf(id) >= 0) A.detachCap(pf.id, id); else A.attachCap(pf.id, id); },
      genCert: function (node) {
        var pf = SEL.port(); if (!pf) return;
        B.loading(node, '签发中');
        setTimeout(function () {
          A.generateCert(pf.id, { cn: pf.cert.cn || ('mock-' + pf.port + '.' + pf.ip), days: (V.state.certDays || 365), issuer: 'MockCA-Root' });
          V.toast('证书已签发', 'CN ' + (pf.cert.cn || ('mock-' + pf.port)) + ' · 365 天', 'ok');
          V.rerender();
        }, 320);
      },
      reissue: function (node) {
        var pf = SEL.port(); if (!pf) return;
        B.loading(node, '重签中');
        var dys = V.state.certDays || 365;
        setTimeout(function () { A.generateCert(pf.id, { cn: 'mock-' + pf.port + '.' + pf.ip, days: dys, issuer: 'MockCA-Root' }); V.toast('已重新签发', '有效期重置为 ' + dys + ' 天', 'ok'); V.rerender(); }, 320);
      },
      exportPem: function () {
        var pf = SEL.port(); if (!pf) return;
        var pem = '-----BEGIN CERTIFICATE-----\n' + (pf.cert.fingerprint || 'MOCK-CERT') + '\n' + portLabel(pf) + '\n-----END CERTIFICATE-----';
        var blob = new Blob([pem], { type: 'text/plain' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'mock-' + pf.port + '.pem'; a.click(); URL.revokeObjectURL(a.href);
        V.toast('已导出 PEM', 'mock-' + pf.port + '.pem', 'ok');
      },
      noop: function () {}
    },
    submit: function (form) {
      var fd = new FormData(form), ip = String(fd.get('ip') || '').trim(), port = +fd.get('port');
      var errs = [];
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) errs.push('IP 格式不正确');
      if (!port || port < 1 || port > 65535) errs.push('端口需在 1–65535');
      if (S.ports.some(function (x) { return x.ip === ip && x.port === port; })) errs.push('该端点已登记');
      if (errs.length) { V.toast('登记失败', errs[0], 'danger'); return; }
      A.registerPort({ ip: ip, port: port, protocol: fd.get('protocol'), tls: fd.get('tls') });
      V.toast('端点已登记', ip + ':' + port, 'ok');
    }
  };

  /* ================================================================ II 引擎 */
  function ruleBody(fl, aid) {
    var r = fl.rule || { kind: 'fixed' };
    var kinds = [{ v: 'fixed', l: '固定' }, { v: 'increment', l: '自增' }, { v: 'once', l: '单次生效' }, { v: 'conditional', l: '条件' }, { v: 'random', l: '随机' }];
    var body = '<div class="fgrid fgrid--2">' +
      field('规则', 'RULE', '<select class="inp inp--sel" data-fk="rule" data-id="' + h(fl.id) + '">' + kinds.map(function (k) {
        return '<option value="' + k.v + '"' + (r.kind === k.v ? ' selected' : '') + '>' + k.l + '</option>';
      }).join('') + '</select>') +
      (r.kind === 'increment' ? field('起始 / 步长 / 模板', 'START · STEP · PATTERN', '<div class="fgrid fgrid--3" style="gap:6px">' +
        inp('start', r.start == null ? 1 : r.start, { type: 'number', attrs: 'data-fk="r-start" data-id="' + h(fl.id) + '"' }) +
        inp('step', r.step == null ? 1 : r.step, { type: 'number', attrs: 'data-fk="r-step" data-id="' + h(fl.id) + '"' }) +
        inp('pattern', r.pattern || '{n}', { attrs: 'data-fk="r-pattern" data-id="' + h(fl.id) + '"' }) + '</div>') : '') +
      (r.kind === 'once' ? field('生效次数', 'TIMES', inp('times', r.times == null ? 1 : r.times, { type: 'number', attrs: 'data-fk="r-times" data-id="' + h(fl.id) + '"' })) : '') +
      (r.kind === 'conditional' ? field('条件 / 命中 / 否则', 'WHEN · THEN · ELSE', '<div class="fgrid fgrid--3" style="gap:6px">' +
        inp('when', (r.when && r.when.key) || '', { placeholder: 'data.site', attrs: 'data-fk="r-when" data-id="' + h(fl.id) + '"' }) +
        inp('then', r.then || '', { placeholder: '杭州主站点', attrs: 'data-fk="r-then" data-id="' + h(fl.id) + '"' }) +
        inp('else', r.else || '', { placeholder: '西安灾备', attrs: 'data-fk="r-else" data-id="' + h(fl.id) + '"' }) + '</div>') : '') +
      (r.kind === 'random' ? field('候选值', 'OPTIONS', inp('options', (r.options || []).join(','), { attrs: 'data-fk="r-options" data-id="' + h(fl.id) + '"' })) : '') +
      '</div>';
    return body;
  }
  var FLOW = {
    group: 'prep', selKey: 'api', tag: '接口', tagEn: 'ENDPOINTS', empty: '没有接口',
    title: '引 擎', sub: '- 预期响应配方',
    stats: function () {
      return [{ k: 'APIS', v: S.apis.length }, { k: 'AUDIT', v: S.logs.length }, { k: 'PENDING', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length }];
    },
    list: function () {
      return S.apis.map(function (a) {
        return { id: a.id, label: a.method + ' ' + a.name, meta: a.path, count: a.enabled === false ? 'OFF' : a.status };
      });
    },
    pick: function (id) { A.selectApi(id); },
    enter: function (id) { if (!id) return false; A.selectApi(id); return true; },
    cmd: function () { return UI_SUB() === 'audit' ? '点击审计记录查看报文与命中说明；待放行可在此放行或拒绝。' : '调整响应配方，或触发一次看配套审计。'; },
    main: function () {
      var a = SEL.api();
      if (!a) return pnl('接口', 'ENDPOINT', '<div class="empty">左侧没有接口。</div>');
      var head = pnl('接口', 'ENDPOINT', '<div class="pnl__bd--3">' +
        kv('方法', '<b>' + h(a.method) + '</b>') + kv('路径', '<small>' + h(a.path) + '</small>') +
        kv('状态', statusOf(a.status)) + kv('命中', h(f(a.hits))) +
        kv('延迟', h((a.delayMs || 0) + ' ms')) + kv('所属能力', h((S.caps.filter(function (c) { return c.id === a.cap; })[0] || { code: '—' }).code)) +
        '</div>', {
        right: '<button class="blk blk--sm" type="button" data-act="toggleEnable">' + (a.enabled === false ? '启用接口' : '停用接口') + '</button>'
      });
      var resp = pnl('响应配方', 'RESPONSE', '<div class="fgrid fgrid--2">' +
        field('HTTP 状态', 'STATUS', '<select class="inp inp--sel" data-fk="status">' + [200, 201, 202, 204, 400, 403, 404, 500].map(function (c) {
          return '<option value="' + c + '"' + (a.status === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + '</select>') +
        field('延迟预设', 'PRESET', '<select class="inp inp--sel" data-fk="delayPreset" data-id="' + h(a.id) + '">' + [0, 60, 120, 300, 800, 1500, 2500].map(function (d) {
          return '<option value="' + d + '"' + ((a.delayMs || 0) === d ? ' selected' : '') + '>' + d + ' ms</option>';
        }).join('') + '</select>') +
        field('响应延迟（可拖）', 'DELAY', '<div id="delayScrub"></div>') + '</div>');
      var fields = (a.fields || []);
      var fb = fields.length ? fields.map(function (fl) {
        var types = ['字符串', '整数', '浮点', '布尔', '枚举', '对象', '数组', '时间戳', '证书指纹'];
        var sources = [{ v: 'manual', l: '手填' }, { v: 'random', l: '随机' }, { v: 'seq', l: '序列' }, { v: 'select', l: '下拉' }];
        return '<div class="pnl" style="box-shadow:none"><div class="pnl__cap" style="height:26px"><b class="mono">' + h(fl.key) + '</b><i>' + h(fl.type) + '</i>' +
          '<span class="pnl__capB"><button class="mini" type="button" data-act="delField" data-id="' + h(fl.id) + '" aria-label="删除字段">✕</button></span></div>' +
          '<div class="pnl__bd pnl__bd--2">' +
          field('字段名', 'KEY', inp('k', fl.key, { attrs: 'data-fk="f-key" data-id="' + h(fl.id) + '"' })) +
          field('类型', 'TYPE', '<select class="inp inp--sel" data-fk="f-type" data-id="' + h(fl.id) + '">' + types.map(function (t) {
            return '<option' + (fl.type === t ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select>') +
          field('取值方式', 'SOURCE', '<select class="inp inp--sel" data-fk="f-source" data-id="' + h(fl.id) + '">' + sources.map(function (sc) {
            return '<option value="' + sc.v + '"' + (fl.source === sc.v ? ' selected' : '') + '>' + sc.l + '</option>';
          }).join('') + '</select>') +
          field('值', 'VALUE', inp('v', fl.value == null ? '' : fl.value, { attrs: 'data-fk="f-value" data-id="' + h(fl.id) + '"' })) +
          '<div style="grid-column:1/-1">' + ruleBody(fl) + '</div>' +
          '</div></div>';
      }).join('') : '<div class="empty">还没有字段。新增一个字段开始定制响应体。</div>';
      var fieldPanel = pnl('字段定制', 'FIELDS', fb + '<div class="blkbar">' + blk('+ 新增字段', 'addField', '', 'blk--sm') + '</div>', { right: '<span class="pnl__note mono">' + fields.length + '</span>' });
      var inter = (a.interactions || []);
      var intBody = inter.length ? inter.map(function (it) {
        return '<div class="stat__row"><span>' + h(it.kind || '人工确认') + '<small class="mono" style="margin-left:8px;color:var(--ink-3)">' + h(it.owner || '值班工程师') + '</small></span>' +
          '<b><button class="mini" type="button" data-act="delInter" data-id="' + h(it.id) + '">✕</button></b></div>';
      }).join('') : '<p class="hint">没有插入人机交互。插入后每次触发都会先停在闸门等人放行。</p>';
      var intPanel = pnl('人机交互', 'INTERACTION', intBody + '<div class="blkbar">' +
        '<select class="inp inp--sel" id="intKind" style="width:auto"><option value="人工确认">人工确认</option><option value="验证码">验证码</option><option value="手动闸门">手动闸门</option></select>' +
        blk('插入交互', 'addInter', '', 'blk--sm') + '</div>');
      return '<div class="hint" style="padding:0 0 10px">准备台：配方与字段只在启动前生效。触发与审计在「运行台」。</div>' + head + resp + fieldPanel + intPanel;
    },
    mount: function () {
      var a = SEL.api(); if (!a) return;
      if ($('#delayScrub')) X.scrub($('#delayScrub'), {
        min: 0, max: 3000, step: 50, value: a.delayMs || 0, suffix: ' ms', label: 'DELAY',
        onChange: function (v) { A.updateApi(a.id, { delayMs: v }); var el = $('#delayVal'); if (el) el.textContent = v + ' ms'; }
      });
      if (V.mountAudit) V.mountAudit();
    },
    act: {
      toggleEnable: function () { var a = SEL.api(); if (a) A.updateApi(a.id, { enabled: a.enabled === false }); },
      trigger: function (node) {
        var a = SEL.api(); if (!a) return;
        B.loading(node, '触发中');
        setTimeout(function () {
          var r = A.triggerApi(a.id);
          V.toast('已触发 ' + a.method + ' ' + a.path, '→ ' + ((r && r.status) || a.status) + ' · ' + ((r && r.delayMs) || a.delayMs) + ' ms', 'ok');
          V.rerender();
        }, 340);
      },
      addField: function () { var a = SEL.api(); if (a) A.addField(a.id); },
      delField: function (node) { var a = SEL.api(); if (a) A.removeField(a.id, node.getAttribute('data-id')); },
      addInter: function () { var a = SEL.api(); if (!a) return; var k = $('#intKind'); A.addInteraction(a.id, { kind: k ? k.value : '人工确认', owner: '值班工程师', timeoutS: 600 }); V.toast('已插入人机交互', '触发后会停在闸门', 'warn'); },
      delInter: function (node) { var a = SEL.api(); if (a) A.removeInteraction(a.id, node.getAttribute('data-id')); },
      pickAudit: function (node) { V.selAudit(node.getAttribute('data-id')); },
      approve: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      reject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      setFilter: function (node) { A.setLogFilter(node.getAttribute('data-v')); },
      noop: function () {}
    },
    change: function (fk, t) {
      var a = SEL.api(); if (!a) return;
      if (fk === 'status') A.updateApi(a.id, { status: +t.value });
      else if (fk === 'delayPreset') A.updateApi(a.id, { delayMs: +t.value });
      else if (fk === 'rule') { var fl = (a.fields || []).filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (fl) A.updateField(a.id, fl.id, { rule: Object.assign({}, fl.rule || {}, { kind: t.value }) }); }
      else if (fk === 'f-key' || fk === 'f-type' || fk === 'f-source' || fk === 'f-value') {
        var id = t.getAttribute('data-id'), patch = {};
        if (fk === 'f-key') patch.key = t.value;
        if (fk === 'f-type') patch.type = t.value;
        if (fk === 'f-source') patch.source = t.value;
        if (fk === 'f-value') patch.value = t.value;
        A.updateField(a.id, id, patch);
      } else if (fk.indexOf('r-') === 0) {
        var fid = t.getAttribute('data-id'), f2 = (a.fields || []).filter(function (x) { return x.id === fid; })[0];
        if (!f2) return;
        var r = Object.assign({}, f2.rule || {});
        var key = fk.slice(2);
        if (key === 'options') r.options = t.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        else if (key === 'when') r.when = Object.assign({}, r.when || {}, { key: t.value });
        else if (key === 'then') r.then = t.value;
        else if (key === 'else') r['else'] = t.value;
        else r[key] = isNaN(+t.value) ? t.value : +t.value;
        A.updateField(a.id, fid, { rule: r });
      }
    }
  };
  function UI_SUB() { return V.state.sub.flow; }

  /* ================================================================ III 标本 */
  var NE = {
    group: 'prep', selKey: 'ne', tag: '标本', tagEn: 'SPECIMENS', empty: '没有标本',
    title: '标 本', sub: '- 网元属性与升级流程',
    stats: function () {
      return [{ k: 'SPECIMENS', v: S.nes.length }, { k: 'ONLINE', v: S.nes.filter(function (n) { return n.status === '在线'; }).length }, { k: 'GROUPS', v: S.groups.length }];
    },
    list: function () {
      return S.nes.map(function (n) {
        return { id: n.id, label: n.name, meta: n.arch + ' · ' + n.type + ' · ' + (SEL.group(n.group) ? SEL.group(n.group).name : '未分组'), count: n.version };
      });
    },
    pick: function (id) { V.state.sel.ne = id; A.updateNE(id, {}); V.state.neRun = null; },
    enter: function (id) { if (!id) return false; V.state.sel.ne = id; A.updateNE(id, {}); return true; },
    cmd: function () { return V.state.sub.ne === 'upgrade' ? 'W / S 移动步骤，Enter 执行升级流程。' : '选择标本查看属性；可复制、成组或执行参数校验。'; },
    main: function () {
      var n = curNE();
      if (!n) return pnl('标本', 'SPECIMEN', '<div class="empty">左侧没有标本。</div>');
      var tab = V.state.sub.ne || 'attr';
      var tabs = '<div class="blkbar" style="margin-bottom:10px">' +
        ['attr:属性', 'group:归属', 'upgrade:升级流程', 'valid:参数校验'].map(function (x) {
          var k = x.split(':')[0], l = x.split(':')[1];
          return '<button class="blk blk--sm' + (tab === k ? ' blk--dark' : ' blk--ghost') + '" type="button" data-act="neTab" data-v="' + k + '">' + l + '</button>';
        }).join('') + '<span style="flex:1"></span>' + blk('复制网元', 'copyNE', '', 'blk--sm') + '</div>';
      var body = '';
      if (tab === 'attr') {
        body = pnl('属性', 'ATTRIBUTE', '<form class="form" data-form="ne"><div class="fgrid fgrid--2">' +
          field('名称', 'NAME', inp('name', n.name)) + field('架构', 'ARCH', sel('arch', n.arch, S.arches)) +
          field('类型', 'TYPE', sel('type', n.type, S.neTypes)) + field('厂商', 'VENDOR', sel('vendor', n.vendor, S.vendors)) +
          field('版本', 'VERSION', inp('version', n.version)) + field('软件名', 'SOFTWARE', inp('software', n.software)) +
          field('状态', 'STATUS', sel('status', n.status, ['在线', '离线', '维护中'])) +
          field('分组', 'GROUP', '<select class="inp inp--sel" data-fk="group">' + S.groups.map(function (g) {
            return '<option value="' + h(g.id) + '"' + (n.group === g.id ? ' selected' : '') + '>' + h(g.name) + '</option>';
          }).join('') + '</select>') +
          '</div><div class="blkbar">' + blk('保存属性', 'noop', 'type="submit"', 'blk--dark blk--sm') +
          blk('复制网元', 'copyNE', '', 'blk--sm') + '</div></form>') +
          pnl('归属', 'GROUP', '<div class="pnl__bd--2">' + kv('当前分组', h(SEL.group(n.group) ? SEL.group(n.group).name : '未分组')) +
            kv('组内标本', h(S.groupMembers ? S.groupMembers(n.group) : '—')) + '</div>' +
            '<div class="blkbar"><input class="inp" id="grName" placeholder="新组名称" style="width:40%" />' + blk('新建组', 'addGroup', '', 'blk--sm') + '</div>');
      } else if (tab === 'group') {
        body = pnl('组管理', 'GROUPS', S.groups.map(function (g) {
          var cnt = S.nes.filter(function (x) { return x.group === g.id; }).length;
          return '<div class="stat__row"><span>' + h(g.name) + '</span><b>' + cnt + ' 台' + (n.group === g.id ? ' · 当前' : '') + '</b>' +
            '<button class="mini" type="button" data-act="assign" data-id="' + h(g.id) + '">+</button></div>';
        }).join('') + '<div class="blkbar"><input class="inp" id="grName" placeholder="新组名称" style="width:42%" />' + blk('新建组', 'addGroup', '', 'blk--sm') + '</div>');
      } else if (tab === 'upgrade') {
        var run = V.state.neRun;
        var steps = (n.upgrade || []);
        body = pnl('升级流程', 'UPGRADE', '<ul class="steps">' + steps.map(function (s, i) {
          var kindTag = s.kind === 'human' ? tag('人工', 'tag--warn') : s.kind === 'manual' ? tag('手动', 'tag--dim') : tag('自动', 'tag--ok');
          var isRun = run && run.idx === i;
          return '<li class="step' + (isRun ? ' is-run' : '') + '"><span class="step__i">' + p(i + 1) + '</span>' +
            '<span class="step__t">' + h(s.name) + ' <span class="step__m">' + (s.durationS || 0) + 's</span></span>' +
            '<span class="step__r">' + kindTag +
            '<button class="mini" type="button" data-act="up" data-i="' + i + '" aria-label="上移">↑</button>' +
            '<button class="mini" type="button" data-act="down" data-i="' + i + '" aria-label="下移">↓</button>' +
            '<button class="mini" type="button" data-act="delStep" data-i="' + i + '" aria-label="删除">✕</button></span></li>';
        }).join('') + '</ul><div class="blkbar">' +
          '<input class="inp" id="stepName" placeholder="新步骤名称" style="width:38%" />' +
          '<select class="inp inp--sel" id="stepKind" style="width:auto"><option value="auto">自动</option><option value="manual">手动</option><option value="human">人工</option></select>' +
          blk('新增步骤', 'addStep', '', 'blk--sm') + '</div>' +
          '<div class="blkbar">' + blk(run ? '继续执行（' + (run.idx + 1) + '/' + steps.length + '）' : '执行升级流程', 'runUpgrade', '', 'blk--dark') +
          (run ? blk('重置', 'resetRun', '', 'blk--sm') : '') + '</div>' +
          '<div id="runLog">' + (run && run.logs.length ? '<ul class="steps">' + run.logs.map(function (l) { return '<li class="step"><span class="step__i mono">·</span><span class="step__t">' + h(l) + '</span></li>'; }).join('') + '</ul>' : '<p class="hint">执行后会逐步推进；遇到「人工」步骤会停在闸门等人放行。</p>') + '</div>');
      } else {
        var vs = (n.validations || []);
        body = pnl('参数校验', 'VALIDATION', (vs.length ? vs.map(function (v) {
          var st = v.validated === true ? 'done' : v.validated === false ? 'error' : 'idle';
          return '<div class="stat__row"><span>' + h(v.name || v.key) + '</span><b><span class="mx-mark-host" data-mark="' + st + '" data-label="' + h(v.validated === true ? '通过' : v.validated === false ? '未通过' : '待校验') + '"></span></b>' +
            '<button class="mini" type="button" data-act="delValid" data-id="' + h(v.id) + '">✕</button></div>';
        }).join('') : '<p class="hint">还没有校验规则。</p>') +
          '<div class="blkbar"><input class="inp" id="validName" placeholder="校验项（如 版本一致性）" style="width:44%" />' +
          blk('新增校验', 'addValid', '', 'blk--sm') + blk('执行校验', 'runValid', '', 'blk--dark blk--sm') + '</div>' +
          '<div id="validLoad"></div>');
      }
      return tabs + body;
    },
    mount: function () {
      var n = curNE(); if (!n) return;
      $$('[data-mark]').forEach(function (host) {
        X.statusMark(host, { state: host.getAttribute('data-mark'), label: host.getAttribute('data-label') });
      });
      if (V.state.running === 'ne-valid' && $('#validLoad')) {
        X.latticeLoader($('#validLoad'), { label: '正在执行 ' + ((n.validations || []).length) + ' 项校验' });
      }
    },
    act: {
      neTab: function (node) { V.state.sub.ne = node.getAttribute('data-v'); },
      copyNE: function () { var n = curNE(); if (!n) return; A.copyNE(n.id); V.toast('已复制网元', n.name + ' → 副本', 'ok'); },
      addGroup: function () { var g = $('#grName'); if (!g || !g.value.trim()) { V.toast('新建失败', '组名不能为空', 'danger'); return; } A.addGroup({ name: g.value.trim() }); V.toast('已新建组', g.value.trim(), 'ok'); },
      assign: function (node) { var n = curNE(); if (n) { A.updateNE(n.id, { group: node.getAttribute('data-id') }); V.toast('已加入组', SEL.group(node.getAttribute('data-id')).name, 'ok'); } },
      addStep: function () {
        var n = curNE(); if (!n) return;
        var nm = $('#stepName'), kd = $('#stepKind');
        var name = nm && nm.value.trim(); if (!name) { V.toast('新增失败', '步骤名不能为空', 'danger'); return; }
        var kind = kd ? kd.value : 'auto';
        var step = { name: name, kind: kind, durationS: 30 };
        // 人工步骤必须带交互规格：执行到这里会停在闸门等人放行
        if (kind === 'human') { step.durationS = 0; step.interaction = { kind: 'human-confirm', owner: '值班工程师', timeoutS: 600 }; }
        A.addUpgradeStep(n.id, step);
      },
      up: function (node) { var n = curNE(); if (n) A.moveStep(n.id, +node.getAttribute('data-i'), -1); },
      down: function (node) { var n = curNE(); if (n) A.moveStep(n.id, +node.getAttribute('data-i'), 1); },
      delStep: function (node) { var n = curNE(); if (n) A.removeStep(n.id, +node.getAttribute('data-i')); },
      runUpgrade: function (node) {
        var n = curNE(); if (!n) return;
        var steps = n.upgrade || [];
        var run = V.state.neRun || (V.state.neRun = { idx: 0, logs: [] });
        if (run.idx >= steps.length) { V.toast('流程已结束', '可点重置重新走一遍', 'warn'); return; }
        var st = steps[run.idx];
        B.loading(node, '执行中');
        setTimeout(function () {
          run.logs.push(p(run.idx + 1) + ' ' + st.name + '：完成');
          V.state.running = null;
          if (st.kind === 'human') { V.toast('停在第 ' + (run.idx + 1) + ' 步', '「' + st.name + '」需人工放行，已同步到闸门', 'warn'); }
          run.idx++;
          if (run.idx >= steps.length) V.toast('升级流程完成', steps.length + ' 步全部通过', 'ok');
          V.rerender();
        }, 340);
      },
      resetRun: function () { V.state.neRun = null; },
      addValid: function () { var n = curNE(); if (!n) return; var v = $('#validName'); if (!v || !v.value.trim()) { V.toast('新增失败', '校验项不能为空', 'danger'); return; } A.addValidation(n.id, { key: v.value.trim(), name: v.value.trim(), op: 'eq', value: 'R7.2.0' }); },
      delValid: function (node) { var n = curNE(); if (!n) return; var id = node.getAttribute('data-id'); A.updateNE(n.id, { validations: (n.validations || []).filter(function (v) { return v.id !== id; }) }); },
      runValid: function (node) {
        var n = curNE(); if (!n) return;
        V.state.running = 'ne-valid'; V.rerender();
        setTimeout(function () {
          A.runValidation(n.id);
          V.state.running = null;
          var ok = (curNE().validations || []).filter(function (v) { return v.validated === true; }).length;
          V.toast('校验完成', ok + ' 项通过', 'ok'); V.rerender();
        }, 760);
      },
      noop: function () {}
    },
    change: function (fk, t) {
      if (fk === 'certDays') { V.state.certDays = +t.value; return; }
      var n = curNE(); if (!n) return;
      if (fk === 'group') A.updateNE(n.id, { group: t.value });
    },
    submit: function (form) {
      var n = curNE(); if (!n) return;
      var fd = new FormData(form), patch = {};
      ['name', 'arch', 'type', 'vendor', 'version', 'software', 'status'].forEach(function (k) { var v = fd.get(k); if (v != null) patch[k] = String(v); });
      if (!patch.name) { V.toast('保存失败', '名称不能为空', 'danger'); return; }
      A.updateNE(n.id, patch);
      V.toast('属性已保存', patch.name, 'ok');
    }
  };

  /* ================================================================ IV 受管域 */
  var OMP = {
    group: 'prep', selKey: 'acc', tag: '账号', tagEn: 'ACCOUNTS', empty: '没有账号',
    title: '受 管 域', sub: '- 账号与一体化任务',
    stats: function () {
      return [{ k: 'ACCOUNTS', v: S.accounts.length }, { k: 'TASKS', v: S.tasks.length }, { k: 'RUNNING', v: S.tasks.filter(function (t) { return t.status !== 'done'; }).length }];
    },
    list: function () {
      return S.accounts.map(function (a) {
        return { id: a.id, label: a.name, meta: a.role + ' · ' + (a.nes || []).length + ' 台授权', count: a.status };
      });
    },
    pick: function (id) { V.state.sel.acc = id; },
    enter: function (id) { if (!id) return false; V.state.sel.acc = id; return true; },
    cmd: function () { return '创建账号并授权网元；一体化任务推进到人工步骤会停在闸门。'; },
    main: function () {
      var acc = S.accounts.filter(function (a) { return a.id === V.state.sel.acc; })[0] || S.accounts[0];
      var accPanel = acc ? pnl('账号', 'ACCOUNT', '<div class="pnl__bd--2">' +
        kv('账号', '<b>' + h(acc.name) + '</b>') + kv('角色', h(acc.role)) +
        kv('创建时间', h(acc.createdAt)) + kv('状态', acc.status === '启用' ? tag('启用', 'tag--ok') : tag('停用', 'tag--dim')) +
        '</div><div class="chips" style="margin-top:10px">' + (acc.nes || []).map(function (id) {
          var n = S.nes.filter(function (x) { return x.id === id; })[0];
          return '<span class="chip is-on">' + h(n ? n.name : id) + '</span>';
        }).join('') + '</div><div class="blkbar" style="margin-top:10px">' + blk(acc.status === '启用' ? '停用账号' : '启用账号', 'toggleAcc', 'data-id="' + h(acc.id) + '"', 'blk--sm') + '</div>') : '';
      var create = pnl('创建账号', 'CREATE', '<form class="form" data-form="acc"><div class="fgrid fgrid--2">' +
        field('账号', 'NAME', inp('name', '', { placeholder: 'ops_xx', id: 'accName' })) +
        field('角色', 'ROLE', sel('role', '升级操作员', ['升级操作员', '只读审计', '平台管理员'])) + '</div>' +
        field('授权网元', 'SCOPE', '<div class="chips">' + S.nes.map(function (n) {
          return '<label class="chip"><input type="checkbox" name="ne" value="' + h(n.id) + '" style="margin-right:6px" />' + h(n.name) + '</label>';
        }).join('') + '</div>') +
        '<div class="blkbar">' + blk('创建账号', 'noop', 'type="submit"', 'blk--dark blk--sm') + '</div></form>');
      var taskBody = S.tasks.map(function (t) {
        var gid = 'g-' + t.id;
        var human = (t.steps || []).filter(function (s) { return s.state === 'waiting-human'; }).length;
        return '<div class="pnl" style="box-shadow:none"><div class="pnl__cap" style="height:26px"><b>' + h(t.name) + '</b><i>' + h(t.status) + '</i>' +
          '<span class="pnl__capB mono">' + t.progress + '%</span></div><div class="pnl__bd">' +
          '<div class="blkbar" style="align-items:center"><div id="' + gid + '" style="flex:1"></div>' + blk('推进', 'advTask', 'data-id="' + h(t.id) + '"', 'blk--sm') + '</div>' +
          '<div class="stat__row"><span>关联站点</span><b>' + h(t.site || '—') + '</b></div>' +
          '<ul class="steps">' + (t.steps || []).map(function (s) {
            var st = s.state === 'done' ? tag('完成', 'tag--ok') : s.state === 'waiting-human' ? tag('待人工', 'tag--warn') : tag('待执行', 'tag--dim');
            return '<li class="step"><span class="step__i">·</span><span class="step__t">' + h(s.name) + '</span><span class="step__r">' + st + '</span></li>';
          }).join('') + '</ul>' + (human ? '<p class="hint">存在人工步骤：请到闸门放行后继续推进。</p>' : '') + '</div></div>';
      }).join('') || '<div class="empty">还没有一体化任务。</div>';
      var taskPanel = pnl('一体化任务', 'INTEGRATION', taskBody + '<div class="hr"></div><form class="form" data-form="task"><div class="fgrid fgrid--2">' +
        field('任务名', 'NAME', inp('name', '', { placeholder: '一键升级 杭州集群' })) +
        field('站点', 'SITE', sel('site', (S.sites[0] || {}).name || '杭州主站点', S.sites.map(function (s) { return { v: s.name, l: s.name }; }))) +
        '</div><div class="blkbar">' + blk('创建任务', 'noop', 'type="submit"', 'blk--dark blk--sm') + '</div></form>');
      var sitePanel = pnl('站点', 'SITE', '<div class="pnl__bd--2">' +
        kv('主站点', h(S.vlp.primarySite || '—')) + kv('副站点', h(S.vlp.secondarySite || '—')) + '</div>' +
        '<div class="blkbar">' + S.sites.map(function (s) {
          return '<button class="blk blk--sm" type="button" data-act="setSite" data-v="' + h(s.id) + '" data-role="primary">主：' + h(s.name) + '</button>';
        }).join('') + '</div>');
      return (accPanel || '') + create + taskPanel + sitePanel;
    },
    mount: function () {
      S.tasks.forEach(function (t) {
        var host = $('#g-' + t.id);
        if (host) X.gauge(host, { value: t.progress || 0, unit: '%', label: '进度' });
      });
    },
    act: {
      toggleAcc: function (node) { A.toggleAccount(node.getAttribute('data-id')); },
      advTask: function (node) {
        var id = node.getAttribute('data-id');
        B.loading(node, '推进中');
        setTimeout(function () { A.advanceTask(id); V.rerender(); }, 320);
      },
      setSite: function (node) { A.setSite('primary', node.getAttribute('data-v')); V.toast('已设置主站点', node.textContent.replace('主：', ''), 'ok'); },
      noop: function () {}
    },
    submit: function (form, el) {
      if (form.getAttribute('data-form') === 'acc') {
        var fd = new FormData(el), nm = String(fd.get('name') || '').trim();
        if (!nm) { V.toast('创建失败', '账号不能为空', 'danger'); return; }
        A.createAccount({ name: nm, role: fd.get('role'), nes: fd.getAll('ne') });
        V.toast('账号已创建', nm + ' · ' + fd.getAll('ne').length + ' 台授权', 'ok');
      } else {
        var fd2 = new FormData(el), tn = String(fd2.get('name') || '').trim();
        if (!tn) { V.toast('创建失败', '任务名不能为空', 'danger'); return; }
        A.createTask({ name: tn, site: fd2.get('site'), ne: (S.nes[0] || {}).id });
        V.toast('任务已创建', tn, 'ok');
      }
    }
  };

  /* ================================================================ V 库房 */
  var LCM = {
    group: 'prep', selKey: 'pkg', tag: '软件包', tagEn: 'PACKAGES', empty: '没有软件包',
    title: '库 房', sub: '- 软件包与共部署',
    stats: function () {
      return [{ k: 'PACKAGES', v: S.packages.length }, { k: 'VERIFIED', v: S.packages.filter(function (p2) { return p2.validated; }).length }, { k: 'CODE', v: S.deploy && S.deploy.coDeploy ? 'ON' : 'OFF' }];
    },
    list: function () {
      return S.packages.map(function (x) {
        return { id: x.id, label: x.name, meta: x.vendor + ' · ' + x.version, count: x.type };
      });
    },
    pick: function (id) { V.state.sel.pkg = id; },
    enter: function (id) { if (!id) return false; V.state.sel.pkg = id; return true; },
    cmd: function () { return '校验软件包指纹；与网元管理平台共部署可复用同一端口。'; },
    main: function () {
      var pk = S.packages.filter(function (x) { return x.id === V.state.sel.pkg; })[0] || S.packages[0];
      if (!pk) return pnl('软件包', 'PACKAGE', '<div class="empty">还没有软件包。</div>');
      var ne = S.nes.filter(function (n) { return n.id === pk.ne; })[0];
      var info = pnl('软件包', 'PACKAGE', '<div class="pnl__bd--2">' +
        kv('名称', '<b>' + h(pk.name) + '</b>') + kv('类型', h(pk.type)) +
        kv('所属网元', h(ne ? ne.name : pk.ne)) + kv('厂商', h(pk.vendor)) +
        kv('版本', h(pk.version)) + kv('大小', h(pk.sizeMB) + ' MB') +
        kv('MD5', '<small>' + h(pk.md5 || '—') + '</small>') +
        kv('校验', pk.validated ? tag('已校验', 'tag--ok') : tag('未校验', 'tag--warn')) + '</div>' +
        '<div class="blkbar" style="margin-top:10px"><span id="pkgMark" data-mark="' + (pk.validated ? 'done' : 'idle') + '" data-label="' + (pk.validated ? '通过' : '待校验') + '"></span>' +
        blk('校验软件包', 'verify', 'data-id="' + h(pk.id) + '"', 'blk--dark blk--sm') +
        '<button class="blk blk--sm" id="pkgFuse" type="button" data-act="noop">移除</button></div>');
      var add = pnl('新增软件包', 'ADD', '<form class="form" data-form="pkg"><div class="fgrid fgrid--2">' +
        field('名称', 'NAME', inp('name', '', { placeholder: 'GNB_R7.2.0_full.pkg' })) +
        field('类型', 'TYPE', sel('type', '整包', ['整包', '补丁', '热修复'])) +
        field('所属网元', 'NE', sel('ne', (S.nes[0] || {}).id, S.nes.map(function (n) { return { v: n.id, l: n.name }; }))) +
        field('厂商', 'VENDOR', sel('vendor', '华为', S.vendors)) + '</div>' +
        '<div class="blkbar">' + blk('加入库房', 'noop', 'type="submit"', 'blk--dark blk--sm') + '</div></form>');
      var verify = pnl('校验流程', 'VERIFY', '<div id="pkgLoad"></div>' +
        '<ul class="steps"><li class="step"><span class="step__i">1</span><span class="step__t">MD5 摘要比对</span><span class="step__r">' + (pk.validated ? tag('通过', 'tag--ok') : tag('待执行', 'tag--dim')) + '</span></li>' +
        '<li class="step"><span class="step__i">2</span><span class="step__t">签名与证书链</span><span class="step__r">' + (pk.validated ? tag('通过', 'tag--ok') : tag('待执行', 'tag--dim')) + '</span></li>' +
        '<li class="step"><span class="step__i">3</span><span class="step__t">依赖与版本兼容</span><span class="step__r">' + (pk.validated ? tag('通过', 'tag--ok') : tag('待执行', 'tag--dim')) + '</span></li></ul>');
      var code = pnl('共部署', 'CO-DEPLOY', '<div style="display:flex;align-items:center;gap:12px"><div id="coSw"></div>' +
        '<p class="hint" style="flex:1">与网元管理平台共部署：生命周期平台复用同一端口与证书，不需要单独登记端点。</p></div>');
      return info + add + verify + code;
    },
    mount: function () {
      var pk = S.packages.filter(function (x) { return x.id === V.state.sel.pkg; })[0] || S.packages[0];
      if (!pk) return;
      var mk = $('#pkgMark');
      if (mk) X.statusMark(mk, { state: pk.validated ? 'done' : 'idle', label: pk.validated ? '通过' : '待校验' });
      if ($('#coSw')) X.velocitySwitch($('#coSw'), {
        checked: !!(S.deploy && S.deploy.coDeploy), label: '共部署',
        onChange: function (v) { A.toggleCoDeploy('lcmp'); V.toast(v ? '已开启共部署' : '已关闭共部署', 'LCMP 复用端口', 'ok'); V.rerender(); }
      });
      if (V.state.running === 'pkg-verify' && $('#pkgLoad')) X.latticeLoader($('#pkgLoad'), { label: 'MD5 / 签名 / 依赖' });
      if ($('#pkgFuse')) X.fuseButton($('#pkgFuse'), {
        label: '移除', doneLabel: '已移除', undoLabel: '撤销', undoWindow: 3000,
        onCommit: function () { A.removePackage(pk.id); V.rerender(); },
        onUndo: function () { V.toast('已撤销移除', pk.name, 'ok'); V.rerender(); }
      });
    },
    act: {
      verify: function (node) {
        var id = node.getAttribute('data-id');
        B.loading(node, '校验中');
        V.state.running = 'pkg-verify'; V.rerender();
        setTimeout(function () { A.validatePackage(id); V.state.running = null; V.toast('校验完成', 'MD5 / 签名 / 依赖全部通过', 'ok'); V.rerender(); }, 760);
      },
      noop: function () {}
    },
    submit: function (form, el) {
      var fd = new FormData(el), nm = String(fd.get('name') || '').trim();
      if (!nm) { V.toast('加入失败', '名称不能为空', 'danger'); return; }
      A.addPackage({ name: nm, type: fd.get('type'), ne: fd.get('ne'), vendor: fd.get('vendor'), version: '7.2.0', sizeMB: 1024 });
      V.toast('已加入库房', nm, 'ok');
    }
  };

  /* ================================================================ VI 虚层 */
  var VLP = {
    group: 'prep', selKey: 'vlp', tag: '配置项', tagEn: 'STACK', empty: '无配置项',
    title: '虚 层', sub: '- CPU 配额与站点',
    stats: function () {
      return [{ k: 'VERSION', v: S.vlp.version }, { k: 'CPU', v: S.vlp.cpu }, { k: 'FLOW', v: (S.vlp.flow || []).filter(function (x) { return x.state === 'done'; }).length + '/' + (S.vlp.flow || []).length }];
    },
    list: function () {
      return [
        { id: 'cpu', label: 'CPU 配额', meta: '核心数与占用', count: S.vlp.cpu + 'C' },
        { id: 'site', label: '主副站点', meta: '互斥切换', count: S.vlp.primarySite ? '已设' : '—' },
        { id: 'ver', label: '平台版本', meta: '可回滚', count: S.vlp.version },
        { id: 'flow', label: '升级流程', meta: '四步推进', count: (S.vlp.flow || []).filter(function (x) { return x.state === 'done'; }).length + '/4' },
        { id: 'check', label: '软件包校验', meta: '四项检查', count: (S.vlp.checks || []).filter(function (x) { return x.state === 'pass'; }).length + '/' + (S.vlp.checks || []).length }
      ];
    },
    pick: function (id) { V.state.sub.vlp = id; },
    enter: function (id) { if (!id) return false; V.state.sub.vlp = id; return true; },
    cmd: function () { return '调整 CPU 配额、切换主副站点，或推进虚层升级流程。'; },
    main: function () {
      var focus = V.state.sub.vlp || 'cpu';
      var cpuPanel = pnl('CPU 配额', 'CPU', '<div style="display:flex;align-items:center;gap:18px"><div id="cpuGauge"></div>' +
        '<div style="flex:1"><div id="cpuScrub"></div><p class="hint" style="margin-top:8px">改变配额会同步到所有虚层实例；降配需先疏散业务。</p></div></div>',
        { right: '<span class="pnl__note mono">' + S.vlp.cpu + ' / 64 C</span>' });
      var sitePanel = pnl('主副站点', 'SITE', '<div class="pnl__bd--2">' + kv('主站点', h(S.vlp.primarySite || '—')) + kv('副站点', h(S.vlp.secondarySite || '—')) + '</div>' +
        '<div class="blkbar">' + S.sites.map(function (s) {
          return '<button class="blk blk--sm" type="button" data-act="setSite" data-v="' + h(s.id) + '">设为' + h(s.name) + '</button>';
        }).join('') + '</div><p class="hint">主副站点互斥：设为主站点会自动从副站点移除。</p>');
      var verPanel = pnl('平台版本', 'VERSION', '<div class="fgrid fgrid--2">' +
        field('版本', 'VERSION', '<select class="inp inp--sel" data-fk="vlpVer">' + ['V3.1.4', 'V3.2.0', 'V3.2.1'].map(function (v) {
          return '<option' + (S.vlp.version === v ? ' selected' : '') + '>' + v + '</option>';
        }).join('') + '</select>') + kv('当前', '<b>' + h(S.vlp.version) + '</b>') + '</div>' +
        '<div class="blkbar">' + blk('执行版本检查', 'vlpCheck', '', 'blk--sm') + '</div>');
      var flowPanel = pnl('升级流程', 'FLOW', '<ul class="steps">' + (S.vlp.flow || []).map(function (s, i) {
        var st = s.state === 'done' ? tag('完成', 'tag--ok') : s.kind === 'human' ? tag('待人工', 'tag--warn') : tag('待执行', 'tag--dim');
        return '<li class="step"><span class="step__i">' + p(i + 1) + '</span><span class="step__t">' + h(s.name) + '</span><span class="step__r">' + st + '</span></li>';
      }).join('') + '</ul><div class="blkbar">' + blk('推进流程', 'vlpFlow', '', 'blk--dark blk--sm') + blk('重置', 'vlpReset', '', 'blk--sm') + '</div>');
      var checkPanel = pnl('软件包校验', 'VERIFY', '<ul class="steps">' + (S.vlp.checks || []).map(function (c, i) {
        var st = c.state === 'pass' ? tag('通过', 'tag--ok') : c.state === 'warn' ? tag('告警', 'tag--warn') : tag('待执行', 'tag--dim');
        return '<li class="step"><span class="step__i">' + p(i + 1) + '</span><span class="step__t">' + h(c.name) + '</span><span class="step__r">' + st + '</span></li>';
      }).join('') + '</ul><div class="blkbar">' + blk('全部校验', 'vlpCheckAll', '', 'blk--dark blk--sm') + '</div>' + '<div id="vlpLoad"></div>');
      var order = ['cpu', 'site', 'ver', 'flow', 'check'];
      var panels = { cpu: cpuPanel, site: sitePanel, ver: verPanel, flow: flowPanel, check: checkPanel };
      return order.map(function (k) { return panels[k]; }).join('');
    },
    mount: function () {
      if ($('#cpuGauge')) X.gauge($('#cpuGauge'), { value: Math.round(S.vlp.cpu / 64 * 100), unit: '%', label: 'CPU' });
      if ($('#cpuScrub')) X.scrub($('#cpuScrub'), {
        min: 1, max: 64, step: 1, value: S.vlp.cpu, suffix: ' C', label: 'CPU',
        onChange: function (v) { A.setCPU(v); var g = $('#cpuGauge'); if (g) V.rerender(); }
      });
      if (V.state.running === 'vlp' && $('#vlpLoad')) X.latticeLoader($('#vlpLoad'), { label: '四项校验执行中' });
    },
    act: {
      setSite: function (node) { var id = node.getAttribute('data-v'); A.setSite(id === (S.vlp.primarySite || '') ? 'secondary' : 'primary', id); V.toast('站点已更新', '主：' + (S.vlp.primarySite || '—') + ' / 副：' + (S.vlp.secondarySite || '—'), 'ok'); },
      vlpCheck: function (node) { B.loading(node, '检查中'); setTimeout(function () { V.toast('版本检查通过', S.vlp.version, 'ok'); V.rerender(); }, 340); },
      vlpFlow: function (node) {
        B.loading(node, '推进中');
        setTimeout(function () {
          A.advanceVlpFlow();
          var s = (S.vlp.flow || []).filter(function (x) { return x.state !== 'done'; })[0];
          V.toast('流程推进', s ? '下一步：' + s.name : '全部完成', 'ok'); V.rerender();
        }, 320);
      },
      vlpReset: function () { A.resetVlpFlow(); V.toast('流程已重置', '回到第一步', 'warn'); },
      vlpCheckAll: function (node) {
        V.state.running = 'vlp'; V.rerender();
        B.loading(node, '校验中');
        setTimeout(function () {
          (S.vlp.checks || []).forEach(function (c) { A.runVlpCheck(c.id); });
          V.state.running = null;
          V.toast('全部校验完成', '四项检查已执行', 'ok'); V.rerender();
        }, 820);
      },
      noop: function () {}
    },
    change: function (fk, t) { if (fk === 'vlpVer') { A.setVlpVersion(t.value); V.toast('平台版本已切换', t.value, 'ok'); } }
  };

  /* ================================================================ VII 系统 */
  var SYS = {
    group: 'both', selKey: 'sys', tag: '设置', tagEn: 'SETTINGS', empty: '—',
    title: '系 统', sub: '- 设置与维护',
    stats: function () {
      return [
        { k: 'BUILD', v: '8.0' },
        { k: 'THEME', v: ({ nier: 'NIER', white: 'SWISS', codex: 'CODEX' })[V.state.theme] || 'NIER' },
        { k: 'DENSITY', v: ({ compact: '紧凑', normal: '标准', loose: '宽松' })[V.prefs().density] || '标准' }
      ];
    },
    list: function () {
      return [
        { id: 'display', label: '外观', meta: '配色 / 密度 / 动效 / 质感', count: ({ nier: '暖纸', white: '纯白', codex: '蓝黑' })[V.state.theme] || '暖纸' },
        { id: 'layout', label: '布局', meta: '启动时侧栏 / 起始屏', count: ({ expanded: '展开', l: '折左', r: '折右', both: '双折' })[V.prefs().sideOnBoot] || '展开' },
        { id: 'sound', label: '声音', meta: '合成音效', count: V.state.snd ? 'ON' : 'OFF' },
        { id: 'boot', label: '维护', meta: '重放自检 / 导出审计 / 重置', count: '▶' },
        { id: 'about', label: '关于', meta: '版本 / 键位 / 色板', count: '8.0' }
      ];
    },
    pick: function (id) { V.state.sub.sys = id; V.state.sel.sys = id; },
    enter: function (id) { if (!id) return false; V.state.sub.sys = id; V.state.sel.sys = id; return true; },
    cmd: function () { return '选中项按 Enter 进入；开关与分段直接点击生效，偏好会记住。'; },
    main: function () {
      var s = V.state.sub.sys || 'display';
      var P = V.prefs();

      if (s === 'display') {
        return pnl('配色', 'PALETTE', '<div class="themegrid">' + [
          { v: 'nier', b: '暖纸 · 尼尔', i: 'PAPER / NIER', sw: ['#c8c3ac', '#656256', '#3e3c34'] },
          { v: 'white', b: '纯白 · 瑞士', i: 'WHITE / SWISS', sw: ['#fafafa', '#18181b', '#0b63f6'] },
          { v: 'codex', b: '蓝黑 · 专业', i: 'NAVY / CODEX', sw: ['#0d1117', '#21262d', '#1158c7'] }
        ].map(function (t) {
          return '<button class="themecard' + (V.state.theme === t.v ? ' is-on' : '') + '" type="button" data-act="setTheme" data-v="' + t.v + '" aria-pressed="' + (V.state.theme === t.v ? 'true' : 'false') + '">' +
            '<b>' + t.b + '</b><i>' + t.i + '</i><span class="sw">' + t.sw.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</span></button>';
        }).join('') + '</div>', { right: '<span class="pnl__note mono">' + V.state.theme.toUpperCase() + '</span>' })
        + pnl('密度', 'DENSITY', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">列表与留白</div><div class="setrow__d">紧凑更适合一屏看更多条；宽松适合演示。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['compact', '紧凑'], ['normal', '标准'], ['loose', '宽松']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="density" data-v="' + x[0] + '" data-pref-group="density" data-pref-v="' + x[0] + '" class="' + (P.density === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">动效强度</div><div class="setrow__d">精简会缩短过渡；关闭后所有过渡与入场动画归零（等于强制 reduced-motion）。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['full', '完整'], ['lite', '精简'], ['off', '关闭']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="motion" data-v="' + x[0] + '" data-pref-group="motion" data-pref-v="' + x[0] + '" class="' + (P.motion === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '</div>')
        + pnl('质感', 'TEXTURE', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">纸面颗粒</div><div class="setrow__d">一层 SVG 湍流噪声，模拟纸的粗粝。</div></div><div class="setrow__c"><span id="swGrain"></span></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">扫描线</div><div class="setrow__d">启动自检屏上的水平细线。</div></div><div class="setrow__c"><span id="swScan"></span></div></div>' +
          '</div>');
      }

      if (s === 'layout') {
        return pnl('启动布局', 'STARTUP', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">启动时的侧栏</div><div class="setrow__d">宽屏下生效；窄屏本来就没有折叠。也可以随时按 <kbd>[</kbd> <kbd>]</kbd> 临时切换。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['expanded', '都展开'], ['l', '折左'], ['r', '折右'], ['both', '都折叠']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="sideOnBoot" data-v="' + x[0] + '" data-pref-group="sideOnBoot" data-pref-v="' + x[0] + '" class="' + (P.sideOnBoot === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">启动落在哪一屏</div><div class="setrow__d">运维视角首选「运行台」；排查期可直接落到「审计」。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['run', '运行台'], ['audit', '审计'], ['gate', '闸门']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="startScreen" data-v="' + x[0] + '" data-pref-group="startScreen" data-pref-v="' + x[0] + '" class="' + (P.startScreen === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '</div><div class="blkbar">' + blk('立即套用侧栏', 'applySide', '', 'blk--sm') + blk('重置全部偏好', 'resetPrefs', '', 'blk--ghost blk--sm') + '</div>');
      }

      if (s === 'sound') {
        return pnl('声音', 'SOUND', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">操作音效</div><div class="setrow__d">切换、确认、警告各有独立合成音，不加载任何音频文件。</div></div><div class="setrow__c"><span id="swSnd"></span></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">试听</div><div class="setrow__d">三档：步进 / 确认 / 警告。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm" type="button" data-act="sfxStep">步进</button>' +
          '<button class="blk blk--sm" type="button" data-act="sfxOk">确认</button>' +
          '<button class="blk blk--sm" type="button" data-act="sfxWarn">警告</button></div></div>' +
          '</div>');
      }

      if (s === 'boot') {
        return pnl('维护', 'MAINTENANCE', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">重放启动自检</div><div class="setrow__d">重放进入时那 17 行自检序列（可随时按键跳过）。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm blk--dark" type="button" data-act="replayBoot">重放</button>' +
          '<button class="blk blk--sm" type="button" data-act="skipBoot">跳过</button></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">导出审计 JSON</div><div class="setrow__d">把当前全部审计记录（含报文与命中说明）下载成文件。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm" type="button" data-act="exportAudit">导出 ' + S.logs.length + ' 条</button></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">重置偏好</div><div class="setrow__d">配色、密度、动效、侧栏、起始屏全部回到默认；不动数据。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm blk--ghost" type="button" data-act="resetPrefs">重置</button></div></div>' +
          '</div>');
      }

      return pnl('关于', 'ABOUT', '<div class="pnl__bd--2">' +
        kv('界面', 'BLACKBOX TERMINAL 8.0') + kv('视觉语言', '纸面 / 硬边投影 / 打孔线 / 菱形光标') +
        kv('配色', ({ nier: '暖纸 · 尼尔', white: '纯白 · 瑞士', codex: '蓝黑 · 专业' })[V.state.theme] || '—') +
        kv('共享层', '_shared/domain · motion · micro · button-fx') + kv('数据', '前端模拟（种子 + 定时器）') + '</div>')
        + pnl('键位', 'KEYMAP', '<div class="keymap">' +
          '<kbd>W</kbd><span>上一条 / 上一项</span><kbd>S</kbd><span>下一条 / 下一项</span>' +
          '<kbd>Enter</kbd><span>确认（选中项 / 启动）</span><kbd>Esc</kbd><span>返回上一级</span>' +
          '<kbd>1 – 9</kbd><span>切换到当前模式的第 n 个页签</span><kbd>[ ]</kbd><span>折叠 / 展开左右侧栏</span>' +
          '<kbd>T</kbd><span>轮换三套配色</span></div>')
        + pnl('色板', 'SWATCHES', '<div class="swatchtable">' + [
          ['画布', V.state.theme === 'codex' ? '#0d1117' : V.state.theme === 'white' ? '#fafafa' : '#c8c3ac'],
          ['面板', V.state.theme === 'codex' ? '#161b22' : V.state.theme === 'white' ? '#ffffff' : '#ccc7af'],
          ['次级面', V.state.theme === 'codex' ? '#1c2128' : V.state.theme === 'white' ? '#f4f4f5' : '#d7d2b9'],
          ['主行动', V.state.theme === 'codex' ? '#1158c7' : V.state.theme === 'white' ? '#18181b' : '#3e3c34'],
          ['强调', V.state.theme === 'codex' ? '#58a6ff' : V.state.theme === 'white' ? '#0b63f6' : '#8c3a2e']
        ].map(function (x) { return '<div><i style="background:' + x[1] + '"></i>' + x[0] + ' <span class="mono" style="color:var(--ink-3);font-size:10.5px">' + x[1] + '</span></div>'; }).join('') + '</div>');
    },
    mount: function () {
      var s = V.state.sub.sys;
      function sw(host, on, onChange) { if (host) X.velocitySwitch(host, { checked: on, label: '', onChange: onChange }); }
      if (s === 'display') {
        sw($('#swGrain'), V.state.grain, function (v) { V.setGrain(v); });
        sw($('#swScan'), V.state.scan, function (v) { V.setScan(v); });
      }
      if (s === 'sound') {
        sw($('#swSnd'), V.state.snd, function (v) { V.setSnd(v); V.toast(v ? '音效已开' : '音效已关', '合成音，不加载文件', 'ok'); });
      }
      V.applyPrefs();
    },
    act: {
      setTheme: function (node) { V.setTheme(node.getAttribute('data-v')); V.rerender(); },
      setPref: function (node) {
        var k = node.getAttribute('data-k'), val = node.getAttribute('data-v');
        V.setPref(k, val);
        V.rerender();
        if (k === 'density') V.toast('密度已切换', ({ compact: '紧凑', normal: '标准', loose: '宽松' })[val], 'ok');
        if (k === 'motion') V.toast('动效已切换', ({ full: '完整', lite: '精简', off: '关闭' })[val], 'ok');
      },
      applySide: function () { V.applySidePreset(V.prefs().sideOnBoot); V.toast('侧栏已套用', '按 [ ] 可临时改', 'ok'); },
      resetPrefs: function () { V.resetPrefs(); V.toast('已重置偏好', '配色/密度/动效/侧栏回到默认', 'ok'); },
      sfxStep: function () { if (MP.sfx) MP.sfx.play('step'); },
      sfxOk: function () { if (MP.sfx) MP.sfx.play('confirm'); },
      sfxWarn: function () { if (MP.sfx) MP.sfx.play('warn'); },
      exportAudit: function () {
        var data = { exportedAt: new Date().toISOString(), platform: 'BLACKBOX-8.0', theme: V.state.theme, count: S.logs.length, logs: S.logs };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'audit-' + Date.now() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
        V.toast('已导出审计', S.logs.length + ' 条 · JSON', 'ok');
      },
      replayBoot: function () { V.runBoot(); },
      skipBoot: function () { V.skipBoot(); },
      noop: function () {}
    }
  };

  V.auditPanel = function () {
    var a = SEL.api();
    var filter = S.ui.logFilter || 'all';
    var q = (S.ui.logQuery || '').toLowerCase();
    var logs = S.logs.filter(function (l) {
      var okv = (l.status || 200) < 400;
      if (filter === 'ok' && !okv) return false;
      if (filter === 'err' && okv) return false;
      if (filter === 'human' && !(l.interaction && l.interaction.status === 'pending')) return false;
      if (q && (l.path || '').toLowerCase().indexOf(q) < 0 && (l.method || '').toLowerCase().indexOf(q) < 0 && String(l.status).indexOf(q) < 0) return false;
      return true;
    });
    var rows = logs.slice(0, 40);
    var body = '<div class="blkbar" style="margin-bottom:8px">' +
      '<div id="afilter"></div>' +
      '<input class="inp" id="aquery" placeholder="搜索路径 / 方法" value="' + h(q) + '" style="width:35%" />' +
      blk('触发一次', 'trigger', '', 'blk--sm blk--dark') + '</div>' +
      '<div class="alog">' + (rows.length ? rows.map(function (l) {
        var sel = V.state.sel.audit === l.id;
        var inter = l.interaction && l.interaction.status === 'pending';
        return '<div class="alog__r' + (sel ? ' is-sel' : '') + '" data-act="pickAudit" data-id="' + h(l.id) + '">' +
          '<span class="alog__t">' + h(fmtLogTime(l)) + '</span>' +
          '<span>' + statusOf(l.status) + '</span>' +
          '<span class="alog__p">' + h(l.method + ' ' + l.path) + '</span>' +
          '<span>' + (inter ? tag('待放行', 'tag--warn') : '<span class="mono">' + (l.latencyMs || 0) + 'ms</span>') + '</span>' +
          '</div>' + (sel ? auditDetail(l) : '');
      }).join('') : '<div class="empty">没有匹配的审计记录。</div>') + '</div>';
    return pnl('审计日志', 'AUDIT', body, { right: '<span class="pnl__note mono">' + logs.length + '</span>' });
  };
  function auditDetail(l) {
    var res = l.res || {};
    var notes = (res.notes || []);
    var pending = l.interaction && l.interaction.status === 'pending';
    return '<div class="alog__bd">' +
      '<pre>' + h(JSON.stringify(res.body || res, null, 2).slice(0, 900)) + '</pre>' +
      (notes.length ? '<div class="alog__notes">' + notes.slice(0, 8).map(function (n) {
        return '<span>' + h(n.key) + '=<i>' + h(n.value) + '</i> [' + h(n.rule) + ']</span>';
      }).join('') + '</div>' : '') +
      (pending ? '<div class="alog__acts">' + blk('放行', 'approve', 'data-id="' + h(l.id) + '"', 'blk--sm blk--dark') + blk('拒绝', 'reject', 'data-id="' + h(l.id) + '"', 'blk--sm') + '</div>' : '') +
      '</div>';
  }
  V.mountAudit = function () {
    if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
    if ($('#afilter')) X.segmented($('#afilter'), {
      value: V.state.auditF.status,
      items: [{ label: '全部', value: 'all' }, { label: '2xx', value: '2xx' }, { label: '4xx', value: '4xx' }, { label: '5xx', value: '5xx' }],
      onChange: function (v) { V.state.auditF.status = v; V.rerender(); }
    });
    var q = $('#aquery');
    if (q) q.addEventListener('input', function () { A.setLogQuery(q.value); clearTimeout(V._qT); V._qT = setTimeout(function () { V.rerender(); }, 220); });
  };
  V.selAudit = function (id) { V.state.sel.audit = V.state.sel.audit === id ? null : id; V.rerender(); };
  V.resolveAudit = function (id, approve) {
    A.resolveInteraction(id, approve ? 'approve' : 'reject');
    V.toast(approve ? '已放行' : '已拒绝', approve ? '请求继续执行' : '按 403 返回', approve ? 'ok' : 'warn');
    V.rerender();
  };
  V.state.logsInView = function () { return S.logs; };


  /* ================================================================ 0 运行台（首屏主角）
   * 这是"运行时"的唯一入口：状态 → 就绪链 → 触发 → 实时审计 / 待放行。
   * 编辑类功能一律不在这一屏出现，它们在准备台。 */
  function curPort() { return SEL.port() || S.ports[0] || null; }
  function readiness(pf) {
    var caps = (pf && pf.caps) || [];
    return [
      { i: '01', key: 'port', t: '端点已登记', m: pf ? portLabel(pf) : '未登记', done: !!pf, target: 'mock' },
      { i: '02', key: 'cert', t: '证书已签发', m: pf && pf.cert.status === 'issued' ? ('CN ' + (pf.cert.cn || 'mock')) : '待签发', done: !!(pf && pf.cert.status === 'issued'), target: 'mock' },
      { i: '03', key: 'caps', t: '能力已挂载', m: caps.length + ' 项 · ' + (caps.length ? '就绪' : '未挂载'), done: caps.length > 0, target: 'mock' },
      { i: '04', key: 'svc', t: '服务运行中', m: pf && pf.running ? '监听中' : '未启动', done: !!(pf && pf.running), target: 'mock' }
    ];
  }
  var RUN = {
    group: 'run', selKey: 'port', tag: '服务单元', tagEn: 'UNITS', empty: '还没有端点',
    title: '运 行 台', sub: '- 启动与运行中操作',
    stats: function () {
      var pf = curPort(), run = S.ports.filter(function (x) { return x.running; }).length;
      return [{ k: 'STATE', v: pf && pf.running ? 'RUNNING' : 'STOPPED' }, { k: 'REQ', v: pf ? f((pf.stats || {}).req || 0) : '0' }, { k: 'GATE', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length }];
    },
    list: function () {
      return S.ports.map(function (x) {
        var caps = (x.caps || []).length;
        return {
          id: x.id, label: portLabel(x), count: x.running ? '运行' : '停止',
          meta: (x.cert.status === 'issued' ? '证书就绪' : '缺证书') + ' · ' + caps + ' 能力 · ' + ((x.stats || {}).req || 0) + ' 请求'
        };
      });
    },
    pick: function (id) { A.selectPort(id); },
    enter: function (id) { if (!id) return false; A.selectPort(id); return true; },
    cmd: function () {
      var pf = curPort();
      if (!pf) return '还没有端点：先到准备台登记一个端点。';
      if (!pf.running) {
        var pre = readiness(pf).slice(0, 3), miss = pre.filter(function (x) { return !x.done; })[0];
        return miss ? '启动前还差一步：' + miss.t + '（点就绪链去处理）。' : '前置条件齐备：按住「启动 mock 服务」0.9 秒。';
      }
      return '运行中：选中接口按 Enter 触发，或处理下方待放行请求。';
    },
    main: function () {
      var pf = curPort();
      if (!pf) return pnl('服务单元', 'UNIT', '<div class="empty">还没有端点。到「准备台 → 接入」登记一个本机端点。</div>');
      var run = !!pf.running, caps = (pf.caps || []).length, ready = readiness(pf);
      var stats = pf.stats || {};
      // 接口清单与当前接口（状态块里的下拉与触发都用它们）
      var apisList = S.apis.filter(function (a) { return a.enabled !== false; });
      var curApi = apisList.filter(function (a) { return a.id === V.state.sel.api; })[0] || apisList[0];
      var hero = '<div class="runhero' + (run ? ' is-on' : '') + '">' +
        '<div class="runhero__top"><div>' +
          '<div class="runhero__st"><span class="dot"></span>' + (run ? '运 行 中' : '已 停 止') + '</div>' +
          '<div class="runhero__sub">' + h(portLabel(pf)) + ' · ' + h(pf.protocol + '/' + pf.tls) + ' · ' + caps + ' 项能力 · 本次请求 ' + f(stats.req) + ' · 异常 ' + f(stats.err) + '</div>' +
        '</div><div class="runhero__acts">' +
          (run
            ? '<button class="blk" id="runStop" type="button" data-act="noop">停止 mock 服务</button>'
            : '<button class="blk blk--dark" id="runStart" type="button" data-act="noop"' + (ready.slice(0, 3).every(function (x) { return x.done; }) ? '' : ' disabled') + '><span>按住启动 mock 服务</span><em>HOLD</em></button>') +
        '</div></div>' +
        '<div class="runhero__ctl">' +
          '<label class="fld"><span class="fld__lb">服务单元<i>UNIT</i></span>' +
          '<select class="inp inp--sel" data-fk="runUnit">' + S.ports.map(function (x) {
            return '<option value="' + h(x.id) + '"' + (x.id === pf.id ? ' selected' : '') + '>' + h(portLabel(x)) + (x.running ? ' · 运行' : ' · 停止') + '</option>';
          }).join('') + '</select></label>' +
          '<label class="fld"><span class="fld__lb">接口<i>API</i></span>' +
          '<select class="inp inp--sel" data-fk="runApi"' + (run ? '' : ' disabled') + '>' + apisList.map(function (a) {
            return '<option value="' + h(a.id) + '"' + (curApi && a.id === curApi.id ? ' selected' : '') + '>' + h(a.method + ' ' + a.name) + '</option>';
          }).join('') + '</select></label>' +
          '<button class="blk blk--dark" type="button" data-act="runTrigger"' + (run ? '' : ' disabled') + ' style="min-height:30px;align-self:flex-end">触发一次</button>' +
        '</div>' +
        '<div class="runhero__hint">' + (run
          ? '状态 ' + (curApi ? curApi.status : '—') + ' · 延迟 ' + (curApi ? (curApi.delayMs || 0) + ' ms' : '—') + ' · 命中 ' + (curApi ? f(curApi.hits) : '—') + ' · 改配置要回准备台。'
          : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面就绪链去处理。')) + '</div>' +
        '<div class="qbar">' +
          '<select class="inp inp--sel" data-fk="burst" style="height:30px;width:auto;font-size:12.5px" aria-label="连发次数">' + [3, 5, 10, 20].map(function (n) {
            return '<option value="' + n + '"' + ((V.state.burst || 5) === n ? ' selected' : '') + '>连发 ' + n + ' 次</option>';
          }).join('') + '</select>' +
          '<button class="blk blk--dark" type="button" data-act="qBurst"' + (run ? '' : ' disabled') + '>开始连发</button>' +
          '<span class="sep" aria-hidden="true"></span>' +
          '<button class="blk" type="button" data-act="qRestart"' + (ready.slice(0, 3).every(function (x) { return x.done; }) ? '' : ' disabled') + '>重启服务</button>' +
          '<button class="blk" type="button" data-act="toAudit">全部记录</button>' +
          '<button class="blk" type="button" data-act="qCopy">复制端点</button>' +
          '<button class="blk" type="button" data-act="qPrep">进准备台</button>' +
        '</div>' +
        '</div>';
      var allReady = ready.every(function (x) { return x.done; });
      var chain = (run && allReady)
        ? pnl('就绪链', 'READINESS', '<div class="chainline"><span class="dot"></span><b>端点 · 证书 · 能力 · 服务</b>' +
            '<span style="flex:1"></span><em>4 / 4 就绪</em>' +
            '<button class="blk blk--sm blk--ghost" type="button" data-act="toPrep" data-target="mock">看明细</button></div>',
            { right: '<span class="pnl__note mono">READY</span>' })
        : pnl('就绪链', 'READINESS', '<div class="chain">' + ready.map(function (x, i) {
        var cls = x.done ? 'is-done' : (!x.done && ready.slice(0, i).every(function (y) { return y.done; }) ? 'is-now' : '');
        return '<button class="chainstep ' + cls + '" type="button" data-act="toPrep" data-target="mock">' +
          '<span class="chainstep__i">' + x.i + '</span>' +
          '<span class="chainstep__t"><span class="mk"></span>' + x.t + '</span>' +
          '<span class="chainstep__m">' + h(x.m) + '</span></button>';
      }).join('') + '</div>', { right: '<span class="pnl__note mono">' + ready.filter(function (x) { return x.done; }).length + ' / 4</span>' });
      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      var latest = S.logs.slice(0, 7);
      var p0 = pending[0];
      var feed = (p0 ? '<div class="pendline"><span class="tag tag--warn">待放行 ' + pending.length + '</span>' +
          '<span class="pendline__p">' + h(p0.method + ' ' + p0.path) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button class="blk" type="button" data-act="runApprove" data-id="' + h(p0.id) + '">放行</button>' +
          '<button class="blk blk--ghost" type="button" data-act="toGate">闸门 ' + pending.length + ' 项 →</button></div>' : '') +
        '<div class="feed">' + (latest.length ? latest.map(function (l) {
          var st = (l.status || 200) >= 500 ? 'tag--err' : (l.status || 200) >= 400 ? 'tag--warn' : 'tag--ok';
          return '<div class="feed__r"><span class="feed__t">' + h(fmtLogTime(l)) + '</span>' +
            '<span class="' + st + ' mono">' + l.status + '</span>' +
            '<span class="feed__p">' + h(l.method + ' ' + l.path) + '</span>' +
            '<span class="mono">' + (l.latencyMs || 0) + 'ms</span></div>';
        }).join('') : '<div class="empty">还没有请求。启动服务后模拟器会开始产生流量。</div>') + '</div>';
      var feedPnl = pnl('实时审计', 'LIVE FEED', (run ? feed : '<div class="empty">服务停止中：没有实时流量。</div>'), {
        right: '<span class="pnl__note mono">' + (curApi ? h(curApi.method + ' ' + curApi.path) : '') + '</span>' +
          '<button class="blk blk--sm blk--ghost" type="button" data-act="toAudit">全部记录</button>'
      });
      return hero + chain + feedPnl;
    },
    mount: function () {
      var pf = curPort(); if (!pf) return;
      if ($('#runStart')) X.holdConfirm($('#runStart'), {
        duration: 900, label: '按住 0.9 秒启动',
        onConfirm: function () {
          A.startService(pf.id);
          V.toast('mock 服务已启动', portLabel(pf) + ' · ' + (pf.caps || []).length + ' 项能力在服', 'ok');
          V.rerender();
        }
      });
      if ($('#runStop')) X.fuseButton($('#runStop'), {
        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onCommit: function () { A.stopService(pf.id); V.rerender(); },
        onUndo: function () { A.startService(pf.id); V.rerender(); }
      });
    },
    act: {
      toPrep: function (node) {
        var target = node.getAttribute('data-target') || 'mock';
        if (V.isRunning()) { V.lockToast(); return; }
        V.setMode('prep'); V.go(target);
      },
      toAudit: function () { V.go('audit'); },
      toGate: function () { V.go('gate'); },
      runTrigger: function (node) {
        var pf = curPort();
        if (!pf || !pf.running) { V.toast('无法触发', '服务未启动', 'warn'); return; }
        var selEl = $('#main select[data-fk="runApi"]');
        var id = selEl ? selEl.value : (V.state.sel.api || (S.apis[0] || {}).id);
        A.selectApi(id);
        B.loading(node, '触发中');
        setTimeout(function () {
          var r = A.triggerApi(id);
          V.toast('已触发一次', '→ ' + ((r && r.status) || '') + ' · ' + ((r && r.delayMs) || 0) + ' ms', 'ok');
          V.rerender();
        }, 320);
      },
      qTrigger: function (node) { RUN.act.runTrigger(node); },
      qBurst: function (node) {
        var pf = curPort();
        if (!pf || !pf.running) { V.toast('无法连发', '服务未启动', 'warn'); return; }
        var selEl = $('#main select[data-fk="runApi"]');
        var id = selEl ? selEl.value : (V.state.sel.api || (S.apis[0] || {}).id);
        var n = +(V.state.burst || 5), i = 0;
        B.loading(node, '连发 ' + n + ' 次');
        (function fire() {
          if (i >= n) { V.toast('已连发 ' + n + ' 次', '看下方实时审计', 'ok'); V.rerender(); return; }
          i++; A.triggerApi(id);
          setTimeout(fire, 110);
        })();
      },
      qRestart: function (node) {
        var pf = curPort(); if (!pf) return;
        B.loading(node, '重启中');
        if (pf.running) A.stopService(pf.id);
        setTimeout(function () {
          A.startService(pf.id);
          V.toast('服务已重启', portLabel(pf) + ' · ' + (pf.caps || []).length + ' 项能力在服', 'ok');
          V.rerender();
        }, 560);
      },
      qCopy: function () {
        var pf = curPort(); if (!pf) return;
        var txt = portLabel(pf) + '  ' + pf.protocol + '/' + pf.tls;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function () { V.toast('已复制端点', txt, 'ok'); }).catch(function () { V.toast('端点信息', txt, 'ok'); });
            return;
          }
        } catch (e) {}
        V.toast('端点信息', txt, 'ok');
      },
      qPrep: function () { if (V.isRunning()) { V.lockToast(); return; } V.setMode('prep'); V.go('mock'); },
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) {
      if (fk === 'runApi') { V.state.sel.api = t.value; A.selectApi(t.value); setTimeout(V.rerender, 0); }
      else if (fk === 'runUnit') { V.state.sel.port = t.value; A.selectPort(t.value); setTimeout(V.rerender, 0); }
      else if (fk === 'burst') { V.state.burst = +t.value; }
    }
  };

  /* ================================================================ 0.1 审计（运行时，完整记录） */
  var AUDIT = {
    group: 'run', selKey: 'audit', tag: '审计记录', tagEn: 'AUDIT LOG', empty: '没有审计记录',
    title: '审 计', sub: '- 全部请求与命中说明',
    stats: function () {
      return [{ k: 'TOTAL', v: S.logs.length }, { k: 'ERR', v: S.logs.filter(function (l) { return (l.status || 200) >= 400; }).length }, { k: 'GATE', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length }];
    },
    list: function () {
      return auditRows().map(function (l) {
        return { id: l.id, label: l.method + ' ' + l.path, meta: fmtLogTime(l) + ' · ' + (l.latencyMs || 0) + 'ms', count: l.status };
      });
    },
    pick: function (id) { V.state.sel.audit = V.state.sel.audit === id ? null : id; },
    enter: function (id) { if (!id) return false; V.state.sel.audit = id; return true; },
    cmd: function () { return '选中一条记录看报文与命中说明；待放行的可直接放行或拒绝。'; },
    main: function () {
      var l = S.logs.filter(function (x) { return x.id === V.state.sel.audit; })[0] || S.logs[0];
      if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
      var af = V.state.auditF;
      var apiPaths = [];
      S.logs.forEach(function (x) { if (apiPaths.indexOf(x.path) < 0) apiPaths.push(x.path); });
      var head = pnl('过滤', 'FILTER', '<div class="blkbar">' +
        '<select class="inp inp--sel" data-fk="afRange" style="width:auto" aria-label="范围">' + [30, 60, 200].map(function (n) {
          return '<option value="' + n + '"' + (af.range === String(n) ? ' selected' : '') + '>最近 ' + n + ' 条</option>';
        }).join('') + '<option value="all"' + (af.range === 'all' ? ' selected' : '') + '>全部</option></select>' +
        '<select class="inp inp--sel" data-fk="afApi" style="width:auto;max-width:38%" aria-label="接口">' +
        '<option value="all"' + (af.api === 'all' ? ' selected' : '') + '>全部接口</option>' +
        apiPaths.map(function (pp) {
          return '<option value="' + h(pp) + '"' + (af.api === pp ? ' selected' : '') + '>' + h(pp) + '</option>';
        }).join('') + '</select>' +
        '<div id="afilter"></div>' +
        '<input class="inp" id="aquery" placeholder="搜索路径 / 方法 / 状态" value="' + h(S.ui.logQuery || '') + '" style="width:26%" /></div>');
      if (!l) return head + '<div class="empty" style="margin-top:12px">选一条记录查看详情（左列按 W / S 移动）。</div>';
      var res = l.res || {}, notes = res.notes || [], pending = l.interaction && l.interaction.status === 'pending';
      return head + pnl('记录', 'RECORD', '<div class="pnl__bd--3">' +
        kv('时间', h(fmtLogTime(l))) + kv('方法', '<b>' + h(l.method) + '</b>') + kv('状态', statusOf(l.status)) +
        kv('路径', '<small>' + h(l.path) + '</small>') + kv('延迟', h((l.latencyMs || 0) + ' ms')) + kv('端口', h(l.portId || '—')) + '</div>') +
        pnl('响应体', 'BODY', '<pre>' + h(JSON.stringify(res.body || {}, null, 2).slice(0, 1200)) + '</pre>') +
        (notes.length ? pnl('命中说明', 'MATCHED RULES', '<div class="alog__notes">' + notes.map(function (n) {
          return '<span>' + h(n.key) + '=<i>' + h(n.value) + '</i> [' + h(n.rule) + ']</span>';
        }).join('') + '</div>') : '') +
        (pending ? pnl('人机交互', 'GATE', '<div class="pendcard"><span class="pendcard__t">' + h(l.interaction.owner || '值班工程师') + ' 需放行</span>' +
          '<span style="flex:1"></span><button class="blk" type="button" data-act="runApprove" data-id="' + h(l.id) + '">放行</button>' +
          '<button class="blk" type="button" data-act="runReject" data-id="' + h(l.id) + '">拒绝</button></div>') : '');
    },
    mount: function () { if (V.mountAudit) V.mountAudit(); },
    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) {
      if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
      if (fk === 'afRange') V.state.auditF.range = t.value;
      if (fk === 'afApi') V.state.auditF.api = t.value;
    }
  };

  // 审计过滤：范围 / 状态（segmented）/ 接口
  function auditRows() {
    var af = V.state.auditF || (V.state.auditF = { range: '60', status: 'all', api: 'all' });
    var base = af.range === 'all' ? S.logs.slice() : S.logs.slice(0, +af.range);
    var q = (S.ui.logQuery || '').toLowerCase();
    return base.filter(function (l) {
      var st = l.status || 200;
      if (af.status === '2xx' && !(st >= 200 && st < 300)) return false;
      if (af.status === '4xx' && !(st >= 400 && st < 500)) return false;
      if (af.status === '5xx' && st < 500) return false;
      if (af.api !== 'all' && l.path !== af.api) return false;
      if (q && (l.path || '').toLowerCase().indexOf(q) < 0 && (l.method || '').toLowerCase().indexOf(q) < 0 && String(st).indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ================================================================ 0.2 闸门（待人工集中处理） */
  var GATE = {
    group: 'run', selKey: 'audit', tag: '待放行', tagEn: 'GATE', empty: '当前没有待放行的请求',
    title: '闸 门', sub: '- 人机交互放行',
    stats: function () {
      var p = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      return [{ k: 'PENDING', v: p.length }, { k: 'APPROVED', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'approved'; }).length }, { k: 'REJECTED', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'rejected'; }).length }];
    },
    list: function () {
      return S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).map(function (l) {
        return { id: l.id, label: l.method + ' ' + l.path, meta: fmtLogTime(l) + ' · ' + (l.interaction.owner || '值班工程师'), count: '待放行' };
      });
    },
    pick: function (id) { V.state.sel.audit = id; },
    enter: function (id) { if (!id) return false; V.state.sel.audit = id; return true; },
    cmd: function () { return '放行的请求继续执行并留绿标；拒绝的按 403 返回并留红标。'; },
    main: function () {
      var pend = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      if (!pend.length) return pnl('闸门', 'GATE', '<div class="empty">当前没有待放行的请求。<br />在「准备台 → 接口」给某个接口插入人机交互，再触发一次就会停在这里。</div>');
      return pnl('待放行', 'PENDING', '<div class="gatelist">' + pend.map(function (l) {
        var it = l.interaction || {};
        return '<div class="gatecard"><div><div class="gatecard__t">' + h(l.method + ' ' + l.path) + '</div>' +
          '<div class="gatecard__m">' + h(fmtLogTime(l)) + ' · 类型 ' + h(it.kind || '人工确认') + ' · 负责人 ' + h(it.owner || '值班工程师') + ' · 超时 ' + Math.round((it.timeoutS || 600) / 60) + ' 分</div></div>' +
          '<div class="blkbar"><button class="blk" type="button" data-act="runApprove" data-id="' + h(l.id) + '">放行</button>' +
          '<button class="blk" type="button" data-act="runReject" data-id="' + h(l.id) + '">拒绝</button></div></div>';
      }).join('') + '</div>', { right: '<span class="pnl__note mono">' + pend.length + '</span>' });
    },
    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    }
  };


  V.reg('run', RUN); V.reg('audit', AUDIT); V.reg('gate', GATE);
  V.reg('mock', MOCK); V.reg('flow', FLOW); V.reg('ne', NE);
  V.reg('omp', OMP); V.reg('lcm', LCM); V.reg('vlp', VLP); V.reg('sys', SYS);

  /* ================================================================ 启动 */
  function boot() {
    if (B) { B.install(); }
    var pf = SEL.port() || S.ports[0];
    if (pf) { A.selectPort(pf.id); V.state.sel.port = pf.id; }
    if (!SEL.api() && S.apis[0]) A.selectApi(S.apis[0].id);
    if (!V.state.sel.ne && S.nes[0]) { V.state.sel.ne = S.nes[0].id; A.updateNE(S.nes[0].id, {}); }
    V.state.sel.api = (SEL.api() || S.apis[0] || {}).id;
    V.state.sel.ne = V.state.sel.ne || (S.nes[0] || {}).id;
    V.state.sel.acc = (S.accounts[0] || {}).id;
    V.state.sel.pkg = (S.packages[0] || {}).id;
    V.state.sub.vlp = 'cpu';
    if (S.port && S.port.id) { V.state.sel.port = S.port.id; }
    if (V.applySidePreset) V.applySidePreset(V.prefs().sideOnBoot || 'expanded');
    var _first = V.prefs().startScreen || 'run';
    V.state.mode = 'run'; V.state.screen = (['run', 'audit', 'gate'].indexOf(_first) >= 0 ? _first : 'run');
    V.render();
    V.runBoot();
    if (MP.sim && MP.sim.start) MP.sim.start(2600);
    setInterval(function () { V.render(); }, 2600);
    document.addEventListener('click', function (e) { if (!V.booted()) V.skipBoot(); }, true);
    document.addEventListener('keydown', function (e) { if (!V.booted()) V.skipBoot(); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

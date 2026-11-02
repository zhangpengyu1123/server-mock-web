/* ============================================================================
 * V6 · MOCK 实验台 —— 六台仪器抽屉（本文件只做「仪器」，链与带在 app.js）
 *
 *   I   接入 INGRESS    端点登记 / 检定证书 / 能力挂载 / 伺服起停
 *   II  引擎 ENGINE     预期响应配方（状态·延迟·字段·五类规则·人机交互）+ 审计日志
 *   III 标本 SPECIMEN   网元属性 / 参数校验 / 升级流程（含人工环节）/ 成组复制
 *   IV  受管域 MANAGED  受管网元与组 / 账号与授权范围 / 一体化升级任务关联站点
 *   V   库房 PACKAGE    软件包（类型·所属网元·厂商·版本）/ 校验 / 与网元管理平台共部署
 *   VI  虚层 STACK      CPU 配额 / 主副站点 / 升级流程 / 平台版本 / 软件包校验
 *
 * 每个仪器注册 { render, wire, inspect }。重画一律走 setHtml(容器, 签名, html)：
 * 签名不变就不动 DOM —— 既避免闪烁，也保证「重画不丢焦点」这条体验硬要求。
 * ==========================================================================*/
(function () {
  'use strict';
  var V6 = window.V7; if (!V6) { console.error('[V7] app.js 未加载'); return; }
  var MP = V6.MP, S = V6.S, A = V6.A, SEL = V6.SEL, M = V6.M, X = V6.X;
  var $ = V6.$, $$ = V6.$$, esc = V6.esc, el = V6.el, toast = V6.toast, beep = V6.beep, row2 = V6.row2;

  /* ============================================================ 共用小件 */
  function setHtml(host, sig, html) {
    if (!host || host.__sig === sig) return false;
    host.__sig = sig; host.innerHTML = html; return true;
  }
  function hasFocus(id) {
    var a = document.activeElement, c = document.getElementById(id);
    return !!(c && a && c !== a && c.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
  }
  function sig() { return Array.prototype.join.call(arguments, '|'); }
  function json(v) { try { return JSON.stringify(v); } catch (e) { return ''; } }
  function fillDatalist(id, items) {
    var d = document.getElementById(id); if (!d) return;
    var h = items.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');
    if (d.__h !== h) { d.__h = h; d.innerHTML = h; }
  }
  function fillSelect(sel, items, cur) {
    if (!sel) return;
    var h = items.map(function (v) {
      var val = typeof v === 'string' ? v : v.value, lab = typeof v === 'string' ? v : v.label;
      var vs = String(val), on = cur != null && String(cur) === vs;
      return '<option value="' + esc(vs) + '"' + (on ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('');
    if (sel.__h !== h) { sel.__h = h; sel.innerHTML = h; }
  }
  function led(cls) { return '<i class="led' + (cls ? ' ' + cls : '') + '"></i>'; }
  function tag(text, cls) { return '<span class="tag' + (cls ? ' tag--' + cls : '') + '">' + esc(text) + '</span>'; }
  function statusTag(code) {
    var c = Math.floor(+code / 100);
    return tag(code, c === 2 ? 'sig' : c === 3 ? 'brass' : c === 4 ? 'gate' : 'alarm');
  }
  function pemOf(p) {
    var body = [p.cert.cn, p.cert.fingerprint, p.cert.days, p.cert.issuer, p.cert.issuedAt].join('|');
    var b64 = btoa(unescape(encodeURIComponent(body))).replace(/(.{64})/g, '$1\n');
    return '-----BEGIN CERTIFICATE-----\n' + b64 + '\n-----END CERTIFICATE-----\n';
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/x-pem-file' });
    var url = URL.createObjectURL(blob);
    var a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  function portLabel(p) { return p.ip + ':' + p.port; }

  /* ============================================================ I · 接入 */
  var STATUS_CODES = [200, 201, 202, 204, 400, 403, 404, 500];

  function mockRender() {
    var p = SEL.port();
    var running = S.ports.filter(function (x) { return x.running; }).length;

    var k = $('#mockStat');
    if (k) k.textContent = 'RUNNING ' + running + '/' + S.ports.length + ' · CERT ' + S.ports.filter(function (x) { return x.cert.status === 'issued'; }).length + '/' + S.ports.length;
    var pc = $('#portCount'); if (pc) pc.textContent = S.ports.length;

    var list = $('#portList');
    if (list && !hasFocus('portList')) {
      setHtml(list, sig('ports', S.ports.map(function (x) { return x.id + x.cert.status + x.running + x.caps.length + x.stats.req; }).join(','), p && p.id),
        S.ports.length ? S.ports.map(function (x) {
          var on = p && p.id === x.id, caps = SEL.capsOfPort(x.id);
          return '<button class="row' + (on ? ' is-on' : '') + '" type="button" data-act="pick-port" data-id="' + esc(x.id) + '" data-fx="subtle">' +
            '<span class="row__t">' + led(x.running ? 'is-on' : '') + '<b class="mono">' + esc(portLabel(x)) + '</b>' +
            tag(x.cert.status === 'issued' ? 'CERT OK' : 'NO CERT', x.cert.status === 'issued' ? 'sig' : 'dim') +
            tag(x.protocol + '/' + x.tls, 'dim') +
            '<span class="row__r" style="margin-left:auto">' + tag(caps.length + ' CAP', 'brass') + tag('rps ' + x.stats.rps, 'dim') + '</span></span>' +
            '<span class="row__s">' + esc(x.note || '无备注') + ' · ' + x.stats.req + ' 次请求 · ' + x.stats.err + ' 异常</span></button>';
        }).join('') : '<div class="empty">还没有端点 · 在下面登记一个</div>');
    }

    // 证书
    var cb = $('#certBox'), cd = $('#certDot');
    if (cd) cd.textContent = p ? (p.cert.status === 'issued' ? 'ISSUED' : 'EMPTY') : '—';
    if (cb) {
      var ch = !p ? '<div class="empty">先选一个端点</div>' : (p.cert.status === 'issued'
        ? '<div class="kvlist">' + row2('CN', p.cert.cn) + row2('有效期', p.cert.days + ' 天') +
          row2('签发机构', p.cert.issuer) + row2('签发时间', p.cert.issuedAt) + '</div>' +
          '<pre style="margin:0;padding:7px;background:#08090b;border:1px solid var(--line-3);font-family:var(--f-mono);font-size:9.5px;color:var(--ink-2);max-height:110px;overflow:auto">' + esc(pemOf(p).slice(0, 400)) + '</pre>' +
          '<div class="chips"><button class="abtn" data-act="cert-export" data-fx="subtle">导出 PEM</button>' +
          '<button class="abtn abtn--quiet" data-act="cert-issue" data-fx="standard">重新签发</button></div>'
        : '<div class="empty">该端点还没有检定证书 · 签发后才能挂载能力与启动服务</div>' +
          '<div class="chips"><button class="abtn" data-act="cert-issue" data-fx="standard">签发证书</button></div>');
      var cSig = sig('cert', p && p.id, p && p.cert.status, p && p.cert.cn, p && p.cert.fingerprint);
      if (hasFocus('certBox')) { /* 证书格没有输入，忽略 */ }
      setHtml(cb, cSig, ch);
    }

    // 能力矩阵
    var cg = $('#capGrid');
    if (cg) {
      var mounted = {};
      if (p) p.caps.forEach(function (id) { mounted[id] = 1; });
      setHtml(cg, sig('caps', p && p.id, Object.keys(mounted).sort().join(',')),
        S.caps.map(function (c) {
          var on = !!mounted[c.id];
          return '<button class="chip' + (on ? ' is-on' : '') + '" type="button" data-act="toggle-cap" data-id="' + esc(c.id) + '" ' +
            (p ? '' : 'disabled ') + 'data-fx="subtle" aria-pressed="' + on + '">' +
            '<span class="capcode">' + esc(c.code) + '</span><span class="capname">' + esc(c.name) + '</span>' +
            '<span class="capep">' + c.endpoints + 'EP</span></button>';
        }).join(''));
    }

    // 伺服
    var sb = $('#servoBox');
    if (sb) {
      var can = p && p.cert.status === 'issued' && p.caps.length > 0;
      var html = '<div class="kvlist">' + row2('服务状态', p ? (p.running ? '运行中' : '已停止') : '—') +
        row2('可启动条件', can ? '已满足' : (p && p.cert.status !== 'issued' ? '缺证书' : p && !p.caps.length ? '未挂载能力' : '—')) + '</div>';
      if (p && p.running) html += '<button class="bar bar--ghost" id="mFuse" type="button" data-fx="standard">停止 mock 服务</button>';
      else html += '<button class="bar" id="mStart" type="button" data-fx="standard"' + (can ? '' : ' disabled') + '><span>按住启动 mock 服务</span><em class="mono">HOLD</em></button>';
      if (setHtml(sb, sig('servo', p && p.id, p && p.running, p && p.caps.length, can), html)) {
        if ($('#mStart')) {
          X.holdConfirm($('#mStart'), {
            duration: 900, label: '按住启动 mock 服务', doneLabel: '已启动',
            onConfirm: function () {
              A.startService(S.ui.selectedPort);
              toast('mock 服务已启动', portLabel(SEL.port()) + ' 开始按配方应答', 'ok');
            }
          });
        }
        if ($('#mFuse')) {
          X.fuseButton($('#mFuse'), {
            label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销', undoWindow: 4200,
            onCommit: function () { A.stopService(S.ui.selectedPort); toast('mock 服务已停止', '端口不再应答，审计带停止增长', 'warn'); },
            onUndo: function () { A.startService(S.ui.selectedPort); toast('已撤销停止', '服务继续应答', 'ok'); }
          });
        }
      }
    }
  }

  function flowRender() {
    var api = SEL.api();
    var k = $('#flowStat');
    if (k) k.textContent = S.apis.length + ' 接口 · ' + S.logs.length + ' 条审计 · 回放窗口 ' + V6.cutoffClock();

    // 接口清单（按能力分组）
    var list = $('#apiList');
    if (list && !hasFocus('apiList')) {
      var html = S.caps.map(function (c) {
        var apis = SEL.apisOfCap(c.id);
        if (!apis.length) return '';
        return '<div class="step__m" style="margin-top:4px">' + esc(c.code) + ' · ' + esc(c.name) + '</div>' +
          apis.map(function (a) {
            var on = api && api.id === a.id;
            return '<button class="row' + (on ? ' is-on' : '') + '" type="button" data-act="pick-api" data-id="' + esc(a.id) + '" data-fx="subtle">' +
              '<span class="row__t">' + tag(a.method, a.method === 'GET' ? 'dim' : 'brass') +
              '<b style="font-size:12px">' + esc(a.name) + '</b>' +
              '<span class="row__r" style="margin-left:auto">' + statusTag(a.status) + '</span></span>' +
              '<span class="row__s">' + esc(a.path) + ' · ' + a.delayMs + 'ms · 命中 ' + a.hits + '</span></button>';
          }).join('');
      }).join('');
      setHtml(list, sig('apis', api && api.id, S.apis.map(function (a) { return a.id + a.status + a.delayMs + a.hits + a.enabled; }).join(',')), html || '<div class="empty">没有接口</div>');
    }
    var at = $('#apiTag'); if (at) at.textContent = api ? api.method + ' ' + api.path : '—';

    // 配方
    var box = $('#recipeBox');
    if (box && !hasFocus('recipeBox')) {
      var rSig = api ? sig('recipe', api.id, api.status, api.delayMs, api.enabled,
        json(api.fields.map(function (f) { return [f.key, f.type, f.source, f.value, json(f.rule), json(f.options)]; })),
        json(api.interactions.map(function (i) { return [i.kind, i.label]; }))) : 'none';
      if (setHtml(box, rSig, api ? recipeHtml(api) : '<div class="empty">选一个接口来配配方</div>')) mountRecipe(api);
    }

    // 审计日志（跟随审计带的回放位置）
    var ab = $('#auditBox');
    if (ab) {
      var q = (S.ui.logQuery || '').trim().toLowerCase(), f = S.ui.logFilter || 'all';
      var rows = V6.logsInView().filter(function (l) {
        var okv = l.status < 400 && l.verdict !== '异常';
        if (f === 'ok' && !okv) return false;
        if (f === 'err' && okv) return false;
        if (f === 'human' && !(l.interaction && l.interaction.status === 'pending')) return false;
        if (q && (l.path + ' ' + (l.ne || '') + ' ' + l.method + ' ' + l.status).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var ah = rows.length ? rows.slice(0, 120).map(function (l) {
          var okv = l.status < 400 && l.verdict !== '异常';
          var pend = l.interaction && l.interaction.status === 'pending';
          var notes = (l.res && l.res.notes) || [];
          return '<button class="row" type="button" data-act="pick-log" data-id="' + esc(l.id) + '" data-fx="subtle"' + (pend ? ' style="border-color:var(--gate)"' : '') + '>' +
            '<span class="row__t">' + led(pend ? 'is-warn' : okv ? 'is-on' : 'is-err') +
            '<span class="mono" style="font-size:10.5px">' + esc(l.clock) + '</span>' +
            tag(l.method, l.method === 'GET' ? 'dim' : 'brass') + statusTag(l.status) +
            tag(l.latencyMs + 'ms', 'dim') +
            (pend ? tag('待放行', 'gate') : '') +
            '<span class="row__r" style="margin-left:auto">' + tag(l.portId, 'dim') + '</span></span>' +
            '<span class="row__s">' + esc(l.path) + (l.ne ? ' · ' + esc(l.ne) : '') +
            (notes.length ? ' · ' + esc(notes.slice(0, 4).map(function (n) { return n.key + '=' + n.value + '[' + n.rule + ']'; }).join(' ')) : '') + '</span></button>';
        }).join('') : '<div class="empty">窗口内没有匹配的审计记录</div>';
      setHtml(ab, sig('audit', rows.length, rows.length ? rows[0].id : '', q, f, V6.ui.tape.mode, V6.ui.tape.cursor.toFixed(3)), ah);
    }
  }

  function recipeHtml(a) {
    var f = a.fields || [];
    var ix = a.interactions || [];
    return '' +
      '<div class="fgrid fgrid--2">' +
        '<label class="fld"><span>HTTP 状态 <i class="mono">STATUS</i></span><select class="inp" id="apiStatus">' +
          STATUS_CODES.map(function (c) { return '<option value="' + c + '"' + (+a.status === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="fld"><span>启用</span><span id="apiEnable"></span></label>' +
      '</div>' +
      '<div class="fld"><span>响应延迟 <i class="mono">DELAY</i></span><span id="apiDelay"></span></div>' +
      '<div class="cell__cap" style="margin:2px -11px 0"><b>字段定制</b><i class="mono">FIELDS</i><span class="cell__n mono">' + f.length + '</span></div>' +
      (f.length ? f.map(fieldHtml).join('') : '<div class="empty">这个接口返回空对象 · 加一个字段</div>') +
      '<div class="chips"><button class="abtn" data-act="add-field" data-fx="subtle">＋ 新增字段</button>' +
      '<button class="abtn abtn--quiet" data-act="trigger-api" data-fx="standard">手动触发一次</button></div>' +
      '<div class="cell__cap" style="margin:2px -11px 0"><b>人机交互</b><i class="mono">HUMAN-IN-THE-LOOP</i><span class="cell__n mono">' + ix.length + '</span></div>' +
      (ix.length ? ix.map(function (i) {
        return '<div class="row" style="cursor:default"><span class="row__t">' + tag(i.kind, 'gate') + '<b style="font-size:12px">' + esc(i.label || i.kind) + '</b>' +
          '<span class="row__r" style="margin-left:auto"><button class="ibtn" data-act="rm-ix" data-id="' + esc(i.id) + '" title="移除">✕</button></span></span>' +
          '<span class="row__s">命中后请求进入闸门等待放行 / 拒绝</span></div>';
      }).join('') : '<div class="hint">没有插入人机交互 · 插入后每次命中都会停在闸门</div>') +
      '<div class="chips"><button class="abtn" data-act="add-ix" data-kind="human-confirm" data-fx="subtle">＋ 人工确认</button>' +
      '<button class="abtn" data-act="add-ix" data-kind="captcha" data-fx="subtle">＋ 验证码</button>' +
      '<button class="abtn" data-act="add-ix" data-kind="manual-gate" data-fx="subtle">＋ 手动闸门</button></div>';
  }

  function fieldHtml(f) {
    var r = f.rule || { kind: 'fixed' };
    var types = S.fieldTypes || ['string', 'int', 'bool', 'object', 'array'];
    var sources = [{ v: 'manual', l: '手填' }, { v: 'random', l: '随机' }, { v: 'sequence', l: '序列' }, { v: 'fromRequest', l: '取自请求' }];
    return '<div class="cell" style="margin:0 0 6px">' +
      '<div class="cell__cap" style="padding:6px 9px"><b class="mono" style="font-size:10.5px">' + esc(f.key) + '</b>' +
        '<i class="mono">' + esc(f.type || 'string') + '</i>' +
        '<span class="cell__tabs"><button class="ibtn" data-act="rm-field" data-id="' + esc(f.id) + '" title="删除字段">✕</button></span></div>' +
      '<div class="cell__bd" style="padding:8px 9px;gap:6px">' +
        '<div class="fgrid fgrid--2">' +
          '<label class="fld"><span>字段名</span><input class="inp mono" data-fk="key" data-id="' + esc(f.id) + '" value="' + esc(f.key) + '" /></label>' +
          '<label class="fld"><span>类型</span><select class="inp" data-fk="type" data-id="' + esc(f.id) + '">' +
            types.map(function (t) { return '<option' + (t === f.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld"><span>取值方式</span><select class="inp" data-fk="source" data-id="' + esc(f.id) + '">' +
            sources.map(function (o) { return '<option value="' + o.v + '"' + (o.v === f.source ? ' selected' : '') + '>' + o.l + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld"><span>值</span><input class="inp mono" data-fk="value" data-id="' + esc(f.id) + '" value="' + esc(f.value == null ? '' : f.value) + '" /></label>' +
          '<label class="fld"><span>规则 <i class="mono">RULE</i></span><select class="inp" data-fk="rulekind" data-id="' + esc(f.id) + '">' +
            [['fixed', '固定'], ['increment', '自增'], ['once', '单次生效'], ['conditional', '条件'], ['random', '随机']].map(function (o) {
              return '<option value="' + o[0] + '"' + (o[0] === r.kind ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') + '</select></label>' +
        '</div>' +
        ruleParams(f, r) +
      '</div></div>';
  }

  function ruleParams(f, r) {
    var id = esc(f.id), k = r.kind;
    if (k === 'increment') {
      return '<div class="fgrid fgrid--3">' +
        inp('起始 start', 'start', id, r.start != null ? r.start : 1) +
        inp('步长 step', 'step', id, r.step != null ? r.step : 1) +
        inp('格式 pattern', 'pattern', id, r.pattern || '{n:04}') + '</div>' +
        '<div class="hint">第 n 次命中按步长累加，pattern 里的 {n:04} 补零</div>';
    }
    if (k === 'once') {
      return '<div class="fgrid fgrid--2">' +
        inp('生效次数 times', 'times', id, r.times != null ? r.times : 1) +
        inp('之后返回 fallback', 'fallback', id, r.fallback != null ? r.fallback : '') + '</div>';
    }
    if (k === 'conditional') {
      var w = r.when || {};
      var ops = [['equals', '等于'], ['contains', '包含'], ['notEmpty', '非空'], ['evenTail', '末尾为偶数']];
      return '<div class="fgrid fgrid--3">' +
        inp('上游字段 key', 'whenKey', id, w.key || 'method') +
        '<label class="fld"><span>判断</span><select class="inp" data-rk="whenOp" data-id="' + id + '">' +
          ops.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === w.op ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        inp('比较值', 'whenValue', id, w.value || '') + '</div>' +
        '<div class="fgrid fgrid--2">' + inp('命中返回 then', 'then', id, r.then != null ? r.then : '') +
        inp('否则返回 else', 'else', id, r.else != null ? r['else'] : '') + '</div>';
    }
    if (k === 'random') {
      return inp('候选值（逗号分隔）', 'options', id, (f.options || []).join(',')) + '<div class="hint">从候选里随机取一个</div>';
    }
    return '<div class="hint">每次返回同一个值</div>';
    function inp(label, key, fid, v) {
      return '<label class="fld"><span>' + esc(label) + '</span><input class="inp mono" data-rk="' + key + '" data-id="' + fid + '" value="' + esc(v) + '" /></label>';
    }
  }

  function mountRecipe(a) {
    if (!a) return;
    var st = $('#apiStatus');
    if (st) st.addEventListener('change', function () { A.updateApi(a.id, { status: +st.value }); });
    var en = $('#apiEnable');
    if (en) X.velocitySwitch(en, { checked: a.enabled !== false, label: '接口启用', onChange: function (v) { A.updateApi(a.id, { enabled: v }); toast(v ? '接口已启用' : '接口已停用', a.method + ' ' + a.path, v ? 'ok' : 'warn'); } });
    var dl = $('#apiDelay');
    if (dl) X.scrub(dl, {
      min: 0, max: 3000, step: 50, value: a.delayMs || 0, suffix: ' ms',
      onChange: function (v) { A.updateApi(a.id, { delayMs: v }); }
    });
    MP.btn.enhance($('#recipeBox'));
  }

  function flowInspect() {
    var l = V6.logsInView()[0];
    var api = SEL.api();
    if (!api) return '<div class="empty">选一个接口</div>';
    var r = MP.buildResponse(api);
    return V6.inspectorForLog(l) +
      '<div class="insp"><div class="insp__hd"><b>配方预览</b>' + statusTag(r.status) + tag(r.delayMs + 'ms', 'dim') + '</div>' +
      (r.notes && r.notes.length ? '<div class="insp__notes">' + r.notes.map(function (n) { return '<span>' + esc(n.key) + '=' + esc(n.value) + ' <i>[' + esc(n.rule) + ']</i></span>'; }).join('') + '</div>' : '') +
      '<pre>' + esc(JSON.stringify(r.body, null, 1).slice(0, 700)) + '</pre></div>';
  }

  /* ============================================================ II · 引擎 */
  V6.register('mock', { render: mockRender, inspect: function () { return V6.inspectorForPort(SEL.port()); } });
  V6.register('flow', { render: flowRender, inspect: flowInspect });

  window.__V7_PART1 = { setHtml: setHtml, hasFocus: hasFocus, sig: sig, fillSelect: fillSelect, fillDatalist: fillDatalist, tag: tag, led: led, statusTag: statusTag, portLabel: portLabel, json: json, download: download };
})();

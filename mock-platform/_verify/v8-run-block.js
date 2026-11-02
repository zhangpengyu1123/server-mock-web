
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
    selKey: 'port', tag: '服务单元', tagEn: 'UNITS', empty: '还没有端点',
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
        var r = readiness(pf), miss = r.filter(function (x) { return !x.done; })[0];
        return miss ? '启动前还差一步：' + miss.t + '。按 Enter 或按住下方按钮。' : '前置条件齐备：按住「启动 mock 服务」0.9 秒。';
      }
      return '运行中：选中接口按 Enter 触发，或处理下方待放行请求。';
    },
    main: function () {
      var pf = curPort();
      if (!pf) return pnl('服务单元', 'UNIT', '<div class="empty">还没有端点。到「准备台 → 接入」登记一个本机端点。</div>');
      var run = !!pf.running, caps = (pf.caps || []).length, ready = readiness(pf);
      var stats = pf.stats || {};
      var hero = '<div class="runhero' + (run ? ' is-on' : '') + '">' +
        '<div class="runhero__top"><div>' +
          '<div class="runhero__st"><span class="dot"></span>' + (run ? '运 行 中' : '已 停 止') + '</div>' +
          '<div class="runhero__sub">' + h(portLabel(pf)) + ' · ' + h(pf.protocol + '/' + pf.tls) + ' · ' + caps + ' 项能力 · 本次请求 ' + f(stats.req) + ' · 异常 ' + f(stats.err) + '</div>' +
        '</div><div class="runhero__acts">' +
          (run
            ? '<button class="blk" id="runStop" type="button" data-act="noop">停止 mock 服务</button>'
            : '<button class="blk blk--dark" id="runStart" type="button" data-act="noop"' + (ready.slice(0, 3).every(function (x) { return x.done; }) ? '' : ' disabled') + '><span>按住启动 mock 服务</span><em>HOLD</em></button>') +
        '</div></div>' +
        '<div class="runhero__hint">' + (run
          ? '触发器与实时审计就在下面；编辑配置请先停止服务，再到准备台。'
          : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面的就绪链直接去处理。')) + '</div>' +
        '</div>';
      var chain = pnl('就绪链', 'READINESS', '<div class="chain">' + ready.map(function (x, i) {
        var cls = x.done ? 'is-done' : (!x.done && ready.slice(0, i).every(function (y) { return y.done; }) ? 'is-now' : '');
        return '<button class="chainstep ' + cls + '" type="button" data-act="toPrep" data-target="mock">' +
          '<span class="chainstep__i">' + x.i + '</span>' +
          '<span class="chainstep__t"><span class="mk"></span>' + x.t + '</span>' +
          '<span class="chainstep__m">' + h(x.m) + '</span></button>';
      }).join('') + '</div>', { right: '<span class="pnl__note mono">' + ready.filter(function (x) { return x.done; }).length + ' / 4</span>' });
      var apis = S.apis.filter(function (a) { return a.enabled !== false; });
      var curApi = apis.filter(function (a) { return a.id === V.state.sel.api; })[0] || apis[0];
      var trig = pnl('触发台', 'TRIGGER', (run
        ? '<div class="trigrow"><label class="fld"><span class="fld__lb">接口<i>ENDPOINT</i></span>' +
          '<select class="inp inp--sel" data-fk="runApi">' + apis.map(function (a) {
            return '<option value="' + h(a.id) + '"' + (curApi && a.id === curApi.id ? ' selected' : '') + '>' + h(a.method + ' ' + a.name) + ' — ' + h(a.path) + '</option>';
          }).join('') + '</select></label>' +
          '<button class="blk blk--dark" type="button" data-act="runTrigger" style="min-height:34px">触发一次</button></div>' +
          '<div class="trigmeta"><span>状态 <b>' + (curApi ? curApi.status : '—') + '</b></span><span>延迟 <b>' + (curApi ? (curApi.delayMs || 0) + ' ms' : '—') + '</b></span><span>命中 <b>' + (curApi ? f(curApi.hits) : '—') + '</b></span><span>人机交互 <b>' + (curApi && (curApi.interactions || []).length ? '已插入' : '无') + '</b></span></div>'
        : '<div class="empty">服务停止中：启动后才能触发接口。</div>'), {
        right: '<span class="pnl__note mono">' + (curApi ? h(curApi.method) : '') + '</span>'
      });
      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      var latest = S.logs.slice(0, 7);
      var feed = (pending.length ? pending.map(function (l) {
        return '<div class="pendcard"><span class="pendcard__t">待放行 · ' + h(l.method + ' ' + l.path) + '</span>' +
          '<span class="pendcard__m">' + h(fmtLogTime(l)) + ' · ' + h((l.interaction.owner || '值班工程师')) + ' · 超时 ' + Math.round((l.interaction.timeoutS || 600) / 60) + ' 分</span>' +
          '<span style="flex:1"></span>' +
          '<button class="blk" type="button" data-act="runApprove" data-id="' + h(l.id) + '">放行</button>' +
          '<button class="blk" type="button" data-act="runReject" data-id="' + h(l.id) + '">拒绝</button></div>';
      }).join('') : '') +
        '<div class="feed">' + (latest.length ? latest.map(function (l) {
          var st = (l.status || 200) >= 500 ? 'tag--err' : (l.status || 200) >= 400 ? 'tag--warn' : 'tag--ok';
          return '<div class="feed__r"><span class="feed__t">' + h(fmtLogTime(l)) + '</span>' +
            '<span class="' + st + ' mono">' + l.status + '</span>' +
            '<span class="feed__p">' + h(l.method + ' ' + l.path) + '</span>' +
            '<span class="mono">' + (l.latencyMs || 0) + 'ms</span></div>';
        }).join('') : '<div class="empty">还没有请求。启动服务后模拟器会开始产生流量。</div>') + '</div>';
      var feedPnl = pnl('实时审计', 'LIVE FEED', (run ? feed : '<div class="empty">服务停止中：没有实时流量。</div>'), {
        right: '<button class="blk blk--sm blk--ghost" type="button" data-act="toAudit">全部记录</button>'
      });
      return hero + chain + trig + feedPnl;
    },
    mount: function () {
      var pf = curPort(); if (!pf) return;
      if ($('#runStart')) X.holdConfirm($('#runStart'), {
        duration: 900, label: '按住 0.9 秒启动',
        onDone: function () {
          A.startService(pf.id);
          V.toast('mock 服务已启动', portLabel(pf) + ' · ' + (pf.caps || []).length + ' 项能力在服', 'ok');
          V.rerender();
        }
      });
      if ($('#runStop')) X.fuseButton($('#runStop'), {
        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onDone: function () { A.stopService(pf.id); V.rerender(); },
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
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) { if (fk === 'runApi') { V.state.sel.api = t.value; A.selectApi(t.value); setTimeout(V.rerender, 0); } }
  };

  /* ================================================================ 0.1 审计（运行时，完整记录） */
  var AUDIT = {
    selKey: 'audit', tag: '审计记录', tagEn: 'AUDIT LOG', empty: '没有审计记录',
    title: '审 计', sub: '- 全部请求与命中说明',
    stats: function () {
      return [{ k: 'TOTAL', v: S.logs.length }, { k: 'ERR', v: S.logs.filter(function (l) { return (l.status || 200) >= 400; }).length }, { k: 'GATE', v: S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length }];
    },
    list: function () {
      return S.logs.slice(0, 40).map(function (l) {
        return { id: l.id, label: l.method + ' ' + l.path, meta: fmtLogTime(l) + ' · ' + (l.latencyMs || 0) + 'ms', count: l.status };
      });
    },
    pick: function (id) { V.state.sel.audit = V.state.sel.audit === id ? null : id; },
    enter: function (id) { if (!id) return false; V.state.sel.audit = id; return true; },
    cmd: function () { return '选中一条记录看报文与命中说明；待放行的可直接放行或拒绝。'; },
    main: function () {
      var l = S.logs.filter(function (x) { return x.id === V.state.sel.audit; })[0];
      var head = pnl('过滤', 'FILTER', '<div class="blkbar"><div id="afilter"></div>' +
        '<input class="inp" id="aquery" placeholder="搜索路径 / 方法 / 状态" value="' + h(S.ui.logQuery || '') + '" style="width:38%" /></div>');
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
    }
  };

  /* ================================================================ 0.2 闸门（待人工集中处理） */
  var GATE = {
    selKey: 'audit', tag: '待放行', tagEn: 'GATE', empty: '当前没有待放行的请求',
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


/* ============================================================================
 * V6 · 实验台 —— 后半：标本 / 受管域 / 库房 / 虚层 + 全部接线 + 启动
 * ==========================================================================*/
(function () {
  'use strict';
  var V6 = window.V7; if (!V6) return;
  var H = window.__V7_PART1 || {};
  var MP = V6.MP, S = V6.S, A = V6.A, SEL = V6.SEL, M = V6.M, X = V6.X;
  var $ = V6.$, $$ = V6.$$, esc = V6.esc, el = V6.el, toast = V6.toast, beep = V6.beep, row2 = V6.row2;
  var setHtml = H.setHtml, hasFocus = H.hasFocus, sig = H.sig, fillSelect = H.fillSelect, fillDatalist = H.fillDatalist;
  var tag = H.tag, led = H.led, statusTag = H.statusTag, portLabel = H.portLabel, json = H.json;
  var UI = V6.ui;
  UI.netab = UI.netab || 'profile';
  UI.pkgFilter = UI.pkgFilter || 'all';
  UI.neRun = UI.neRun || null;
  UI.pickNes = UI.pickNes || {};

  function field(label, id, value, ph) {
    return '<label class="fld"><span>' + esc(label) + '</span><input class="inp" id="' + id + '" value="' + esc(value == null ? '' : value) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' /></label>';
  }
  function sel(label, id, items, cur) {
    return '<label class="fld"><span>' + esc(label) + '</span><select class="inp" id="' + id + '">' +
      items.map(function (v) { var val = typeof v === 'string' ? v : v.value, lab = typeof v === 'string' ? v : v.label; return '<option value="' + esc(val) + '"' + (String(cur) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') +
      '</select></label>';
  }
  function errEl(hostId, msg) {
    var h = document.getElementById(hostId);
    if (!h) return;
    h.textContent = msg; h.hidden = !msg;
  }
  function pick(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }

  /* ============================================================ 标本 · 网元 */
  function neState() {
    // 没选过就默认选中第一个标本（否则标本台一进来是空态）
    if (!SEL.ne() && S.nes.length) S.ui.selectedNe = S.nes[0].id;
    var ne = SEL.ne();
    var steps = ne ? ne.upgrade : [];
    if (!UI.neRun || UI.neRun.neId !== (ne && ne.id)) UI.neRun = { neId: ne && ne.id, idx: 0, logs: [] };
    return { ne: ne, steps: steps, run: UI.neRun };
  }

  function neRender() {
    var st = neState(), ne = st.ne;
    var s1 = $('#neStat');
    if (s1) s1.textContent = S.nes.length + ' 标本 · ' + S.nes.filter(function (n) { return n.status === '在线'; }).length + ' 在线 · ' + S.groups.length + ' 组';
    var c1 = $('#neCount'); if (c1) c1.textContent = S.nes.length;

    var list = $('#neList');
    if (list && !hasFocus('neList')) {
      setHtml(list, sig('ne', S.nes.map(function (n) { return n.id + n.status + n.version + n.group; }).join(','), ne && ne.id),
        S.nes.length ? S.nes.map(function (n) {
          var on = ne && ne.id === n.id, g = SEL.group(n.group);
          return '<button class="row' + (on ? ' is-on' : '') + '" type="button" data-act="pick-ne" data-id="' + esc(n.id) + '" data-fx="subtle">' +
            '<span class="row__t">' + led(n.status === '在线' ? 'is-on' : '') + '<b style="font-size:12px">' + esc(n.name) + '</b>' +
            tag(n.type, 'brass') + '<span class="row__r" style="margin-left:auto">' + tag('V' + n.version, 'dim') + '</span></span>' +
            '<span class="row__s mono">' + esc(n.neId) + ' · ' + esc(n.arch) + ' · ' + esc(g ? g.name : '未成组') + ' · ' + n.upgrade.length + ' 步</span></button>';
        }).join('') : '<div class="empty">还没有标本</div>');
    }

    var gb = $('#groupBox');
    if (gb) {
      setHtml(gb, sig('groups', S.groups.map(function (g) { return g.id + g.members.length + g.strategy; }).join(','), ne && ne.group),
        '<div class="step__m">网元组</div>' +
        (S.groups.length ? S.groups.map(function (g) {
          var mine = ne && ne.group === g.id;
          return '<div class="row" style="cursor:default"><span class="row__t"><b style="font-size:12px">' + esc(g.name) + '</b>' +
            tag(g.strategy, 'dim') + tag(g.members.length + ' 成员', 'brass') +
            '<span class="row__r" style="margin-left:auto"><button class="abtn abtn--sm" data-act="join-group" data-id="' + esc(g.id) + '" data-fx="subtle"' + (ne ? '' : ' disabled') + '>' + (mine ? '已在组内' : '加入') + '</button></span></span>' +
            '<span class="row__s">' + esc(g.desc || '—') + '</span></div>';
        }).join('') : '<div class="hint">还没有网元组</div>') +
        '<div class="fgrid fgrid--2"><input class="inp" id="grName" placeholder="新组名称" />' +
        '<select class="inp" id="grStrategy"><option>按站点</option><option>按版本</option><option>按厂商</option></select></div>' +
        '<div class="chips"><button class="abtn" data-act="add-group" data-fx="subtle">＋ 建组</button>' +
        '<button class="abtn abtn--quiet" data-act="copy-ne" data-fx="subtle"' + (ne ? '' : ' disabled') + '>复制当前标本</button></div>');
    }

    var box = $('#neBox');
    if (box && !hasFocus('neBox')) {
      var html = UI.netab === 'valid' ? neValidHtml(ne) : UI.netab === 'flow' ? neFlowHtml(st) : neProfileHtml(ne);
      setHtml(box, sig('nebox', UI.netab, ne && ne.id, ne && json([ne.name, ne.type, ne.arch, ne.vendor, ne.version, ne.softName, ne.status, ne.group]),
        json(ne && ne.validations), json(ne && ne.upgrade), UI.neRun && UI.neRun.idx, UI.neRun && UI.neRun.logs.length), html);
    }
  }

  function neProfileHtml(ne) {
    if (!ne) return '<div class="empty">选一个标本来看属性</div>';
    return '<div class="fgrid fgrid--2">' +
      field('名称', 'neName', ne.name) + sel('类型', 'neType', S.neTypes || [], ne.type) +
      sel('架构', 'neArch', S.arches || [], ne.arch) + sel('厂商', 'neVendor', S.vendors || [], ne.vendor) +
      field('版本', 'neVer', ne.version) + field('软件名', 'neSoft', ne.softName) +
      sel('状态', 'neStatus', ['在线', '离线', '维护中'], ne.status) +
      sel('网元组', 'neGroup', [{ value: '', label: '未成组' }].concat(S.groups.map(function (g) { return { value: g.id, label: g.name }; })), ne.group) +
      '</div>' +
      '<div class="chips"><button class="abtn" data-act="save-ne" data-fx="standard">保存属性</button>' +
      '<button class="abtn abtn--quiet" data-act="copy-ne" data-fx="subtle">复制</button>' +
      '<button class="abtn abtn--quiet" data-act="new-ne" data-fx="subtle">＋ 新建标本</button></div>' +
      '<div class="step__m">旧版本</div>' +
      (ne.oldVersions && ne.oldVersions.length
        ? '<div class="chips">' + ne.oldVersions.map(function (v) { return tag('V' + v, 'dim'); }).join('') + '</div>'
        : '<div class="hint">没有历史版本</div>') +
      '<div class="kvlist">' + row2('编号', ne.neId) + row2('型号', ne.model || '—') +
      row2('校验规则', (ne.validations || []).length + ' 条') + row2('升级步骤', ne.upgrade.length + ' 步') + '</div>';
  }

  function neValidHtml(ne) {
    if (!ne) return '<div class="empty">选一个标本</div>';
    return (ne.validations && ne.validations.length ? '<ul class="steps">' + ne.validations.map(function (v) {
      return '<li class="step"><span class="step__i">◆</span><span class="step__t">' + esc(v.field) + ' <span class="step__m">' + esc(v.rule) + '</span></span>' +
        '<span class="step__r">' + tag(v.level, v.level === 'error' ? 'alarm' : 'gate') + '<button class="ibtn" data-act="rm-valid" data-id="' + esc(v.id) + '" title="移除">✕</button></span></li>';
    }).join('') + '</ul>' : '<div class="hint">还没有校验规则</div>') +
      '<div class="fgrid fgrid--3">' + field('字段', 'vdField', 'version') + field('规则', 'vdRule', '^[6-9]\\.') +
      sel('级别', 'vdLevel', ['error', 'warn'], 'error') + '</div>' +
      field('提示语', 'vdMsg', '版本低于 6.0 不允许入库') +
      '<div class="chips"><button class="abtn" data-act="add-valid" data-fx="subtle">＋ 加规则</button>' +
      '<button class="abtn" data-act="run-valid" data-fx="standard">执行参数校验</button></div>' +
      '<div id="vdOut"></div>';
  }

  function neFlowHtml(st) {
    var ne = st.ne, run = st.run;
    if (!ne) return '<div class="empty">选一个标本</div>';
    var rows = st.steps.map(function (s, i) {
      var state = i < run.idx ? 'is-on' : (i === run.idx ? 'is-warn' : '');
      return '<li class="step"><span class="step__i">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="step__t">' + led(state) + ' ' + esc(s.name) + ' <span class="step__m">' + esc(s.kind) + ' · ' + (s.durationS || 0) + 's · ' + esc(s.owner || '—') + '</span></span>' +
        '<span class="step__r"><button class="ibtn" data-act="step-up" data-id="' + esc(s.id) + '" title="上移">↑</button>' +
        '<button class="ibtn" data-act="step-down" data-id="' + esc(s.id) + '" title="下移">↓</button>' +
        '<button class="ibtn" data-act="step-rm" data-id="' + esc(s.id) + '" title="移除">✕</button></span></li>';
    }).join('');
    return '<ul class="steps">' + (rows || '<li class="step"><span class="step__m">没有步骤</span></li>') + '</ul>' +
      '<div class="fgrid fgrid--2">' + field('步骤名', 'usName', '升级前检查') +
      sel('类型', 'usKind', [{ value: 'auto', label: '自动' }, { value: 'manual', label: '手动' }, { value: 'human', label: '人工（需放行）' }], 'auto') +
      field('耗时 s', 'usDur', '60') + field('负责人', 'usOwner', 'JOYCE') + '</div>' +
      '<div class="chips"><button class="abtn" data-act="step-add" data-fx="subtle">＋ 加步骤</button>' +
      '<button class="abtn" data-act="run-ne" data-fx="standard">执行升级流程</button>' +
      '<button class="abtn abtn--quiet" data-act="run-ne-reset" data-fx="subtle">重置</button></div>' +
      '<div id="neRunOut">' + (run.logs.length ? run.logs.map(function (t) { return '<div class="hint">· ' + esc(t) + '</div>'; }).join('') : '<div class="hint">还没执行过</div>') + '</div>';
  }

  /* ============================================================ 受管域 */
  function ompRender() {
    var s1 = $('#ompStat'), k = SEL.kpis();
    if (s1) s1.textContent = S.deploy.omp.version + ' · ' + k.ne + ' 标本 · ' + k.accounts + ' 账号 · ' + k.tasks + ' 任务';

    var sb = $('#scopeBox');
    if (sb) {
      setHtml(sb, sig('scope', S.groups.map(function (g) { return g.id + g.members.length; }).join(','), S.nes.map(function (n) { return n.id + n.group; }).join(',')),
        '<div class="step__m">受管的网元组</div>' +
        (S.groups.map(function (g) {
          return '<div class="row" style="cursor:default"><span class="row__t"><b style="font-size:12px">' + esc(g.name) + '</b>' + tag(g.strategy, 'dim') +
            tag(g.members.length + ' 成员', 'brass') + '</span><span class="row__s">' + esc(g.desc || '') + '</span></div>';
        }).join('') || '<div class="hint">没有组</div>') +
        '<div class="step__m">受管的网元</div>' +
        '<div class="chips">' + S.nes.map(function (n) { return tag(n.name, n.group ? 'sig' : 'dim'); }).join('') + '</div>');
    }
    var ac = $('#accCount'); if (ac) ac.textContent = S.accounts.length;
    var al = $('#accList');
    if (al) {
      setHtml(al, sig('acc', S.accounts.map(function (a) { return a.id + a.status + a.nes.length; }).join(',')),
        S.accounts.length ? S.accounts.map(function (a) {
          return '<div class="row" style="cursor:default"><span class="row__t">' + led(a.status === '启用' ? 'is-on' : '') +
            '<b style="font-size:12px">' + esc(a.name) + '</b>' + tag(a.role, 'brass') +
            '<span class="row__r" style="margin-left:auto"><span id="sw-' + esc(a.id) + '"></span></span></span>' +
            '<span class="row__s">授权 ' + a.nes.length + ' 个网元 · ' + esc((a.scope || []).join(' / ')) + '</span></div>';
        }).join('') : '<div class="empty">还没有账号</div>');
      S.accounts.forEach(function (a) {
        var host = $('#sw-' + a.id);
        if (host) X.velocitySwitch(host, { checked: a.status === '启用', label: a.name, onChange: function (v) { A.toggleAccount(a.id); toast(a.name + (v ? ' 已启用' : ' 已停用'), '账号状态切换', v ? 'ok' : 'warn'); } });
      });
    }
    var nes = $('#acNes');
    if (nes) {
      setHtml(nes, sig('picknes', S.nes.map(function (n) { return n.id + (UI.pickNes[n.id] ? 1 : 0); }).join(',')),
        S.nes.map(function (n) { return '<button class="chip' + (UI.pickNes[n.id] ? ' is-on' : '') + '" type="button" data-act="pick-nes" data-id="' + esc(n.id) + '" data-fx="subtle">' + esc(n.name) + '</button>'; }).join(''));
    }
    var tl = $('#taskList');
    if (tl) {
      setHtml(tl, sig('tasks', S.tasks.map(function (t) { return t.id + t.status + t.progress; }).join(',')),
        S.tasks.length ? S.tasks.map(function (t) {
          var done = /done|完成/.test(t.status), human = /human|等待/.test(t.status);
          return '<div class="row" style="cursor:default"><span class="row__t">' + led(done ? 'is-on' : human ? 'is-warn' : '') +
            '<b style="font-size:12px">' + esc(t.name) + '</b>' + tag(t.site, 'dim') +
            '<span class="row__r" style="margin-left:auto"><button class="abtn abtn--sm" data-act="advance-task" data-id="' + esc(t.id) + '" data-fx="subtle"' + (done ? ' disabled' : '') + '>推进</button></span></span>' +
            '<span class="row__s">' + esc(t.status) + ' · ' + t.progress + '% · 关联 ' + (t.neIds || []).length + ' 个网元 · 负责 ' + esc(t.owner || '—') + '</span>' +
            '<span id="g-' + esc(t.id) + '" style="max-width:120px"></span></div>';
        }).join('') : '<div class="empty">还没有一体化任务</div>');
      S.tasks.forEach(function (t) {
        var host = $('#g-' + t.id);
        if (host) X.gauge(host, { value: t.progress || 0, unit: '%', label: '进度' });
      });
    }
    fillSelect($('#tkSite'), (S.sites || []).map(function (x) { return x.name; }), (S.sites[0] || {}).name);
    fillSelect($('#tkGroup'), S.groups.map(function (g) { return { value: g.id, label: g.name }; }));
  }

  /* ============================================================ 库房 */
  function lcmRender() {
    var s1 = $('#lcmStat'), k = SEL.kpis();
    if (s1) s1.textContent = S.deploy.lcmp.version + ' · ' + S.packages.length + ' 软件包 · 已校验 ' + S.packages.filter(function (p) { return p.validated; }).length;

    var fl = $('#pkgFilter');
    if (fl && !fl.__done) {
      fl.__done = 1;
      X.segmented(fl, {
        items: [{ label: '全部', value: 'all' }, { label: '已校验', value: 'ok' }, { label: '待校验', value: 'todo' }],
        value: UI.pkgFilter,
        onChange: function (v) { UI.pkgFilter = v; lcmRender(); }
      });
    }
    var pl = $('#pkgList');
    if (pl) {
      var rows = S.packages.filter(function (x) { return UI.pkgFilter === 'all' || (UI.pkgFilter === 'ok' ? x.validated : !x.validated); });
      setHtml(pl, sig('pkg', UI.pkgFilter, S.packages.map(function (x) { return x.id + x.validated + x.version; }).join(',')),
        rows.length ? rows.map(function (x) {
          return '<div class="row" style="cursor:default"><span class="row__t">' + led(x.validated ? 'is-on' : 'is-warn') +
            '<b style="font-size:12px">' + esc(x.name) + '</b>' + tag(x.type, 'brass') + tag('V' + x.version, 'dim') +
            '<span class="row__r" style="margin-left:auto"><span id="vk-' + esc(x.id) + '"></span>' +
            '<button class="abtn abtn--sm" data-act="validate-pkg" data-id="' + esc(x.id) + '" data-fx="subtle">校验</button>' +
            '<button class="abtn abtn--sm abtn--quiet" data-act="remove-pkg" data-id="' + esc(x.id) + '">移除</button></span></span>' +
            '<span class="row__s">' + esc(x.ne) + ' · ' + esc(x.vendor) + ' · ' + x.sizeMB + 'MB · MD5 ' + esc((x.md5 || '').slice(0, 10)) + '</span>' +
            '<span id="vm-' + esc(x.id) + '"></span></div>';
        }).join('') : '<div class="empty">没有匹配的软件包</div>');
      S.packages.forEach(function (x) {
        var vm = $('#vm-' + x.id);
        if (vm) X.statusMark(vm, { state: x.validated ? 'done' : 'idle', label: x.validated ? 'MD5 / 签名 / 依赖 全部通过' : '尚未校验' });
      });
    }
    fillSelect($('#pkgType'), S.softTypes || [], (S.packages[0] || {}).type);
    fillSelect($('#pkgNe'), S.nes.map(function (n) { return n.name; }), (S.nes[0] || {}).name);
    fillSelect($('#pkgVendor'), S.vendors || [], (S.packages[0] || {}).vendor);

    var sc = $('#lcmScope');
    if (sc) setHtml(sc, sig('lcmScope', S.nes.length), '<div class="chips">' + S.nes.map(function (n) { return tag(n.name + ' V' + n.version, 'dim'); }).join('') + '</div>');
    var dp = $('#deployBox');
    if (dp) {
      var co = S.deploy.lcmp.coDeploy;
      setHtml(dp, sig('deploy', co, S.deploy.lcmp.host, S.deploy.omp.host),
        '<div class="kvlist">' + row2('本平台', S.deploy.lcmp.version + ' @ ' + S.deploy.lcmp.host) +
        row2('网元管理平台', S.deploy.omp.version + ' @ ' + S.deploy.omp.host) +
        row2('部署形态', co ? '与网元管理平台共部署（复用端口）' : '独立部署（独占端口）') + '</div>' +
        '<div class="chips" id="coDeploy"></div>');
      var host = $('#coDeploy');
      if (host) X.velocitySwitch(host, { checked: co, label: '与网元管理平台共部署', onChange: function (v) { A.toggleCoDeploy('lcmp'); toast(v ? '已切到共部署' : '已切到独立部署', v ? '与 ' + S.deploy.omp.version + ' 复用端口，可省一个监听端口' : '生命周期平台独占端口', v ? 'ok' : 'warn'); } });
    }
  }

  /* ============================================================ 虚层 */
  function vlpRender() {
    var v = S.vlp, s1 = $('#vlpStat');
    if (s1) s1.textContent = v.version + ' · CPU ' + v.cpu + ' 核 · ' + v.upgradeFlow.filter(function (f) { return f.state === 'done'; }).length + '/' + v.upgradeFlow.length + ' 步';

    var core = $('#vlpCore');
    if (core) {
      var cpuRange = v.cpuRange || [4, 64];
      setHtml(core, sig('vlpCore', v.version, v.cpu),
        sel('平台版本', 'vlpVersion', ['VLMP R3.0.4', 'VLMP R3.1.0', 'VLMP R3.2.0'], v.version) +
        '<div class="fld"><span>CPU 配额 <i class="mono">CORES</i></span><span id="vlpCpu"></span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start"><span id="vlpGauge"></span>' +
        '<div class="kvlist" style="flex:1">' + row2('范围', cpuRange[0] + '–' + cpuRange[1] + ' 核') +
        row2('卷容量', (v.volume || 0) + ' GB') + row2('主站点', v.primarySite || '未指定') + row2('副站点', v.secondarySite || '未指定') + '</div></div>');
      X.scrub($('#vlpCpu'), { min: cpuRange[0], max: cpuRange[1], step: 1, value: v.cpu, suffix: ' 核', onChange: function (n) { A.setCPU(n); } });
      var g = $('#vlpGauge');
      if (g) X.gauge(g, { value: Math.round(v.cpu / cpuRange[1] * 100), unit: '%', label: 'CPU 占用' });
    }

    var sites = $('#vlpSites');
    if (sites) {
      setHtml(sites, sig('sites', v.primarySite, v.secondarySite),
        '<div class="step__m">主站点（唯一）</div><div class="chips">' + (S.sites || []).map(function (s) {
          return '<button class="chip' + (s.name === v.primarySite ? ' is-on' : '') + '" type="button" data-act="site-primary" data-id="' + esc(s.id) + '" data-fx="subtle">' +
            esc(s.name) + ' <span class="mono" style="font-size:9px">' + esc(s.region) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="step__m">副站点（与主站点互斥）</div><div class="chips">' + (S.sites || []).map(function (s) {
          return '<button class="chip' + (s.name === v.secondarySite ? ' is-on' : '') + '" type="button" data-act="site-secondary" data-id="' + esc(s.id) + '" data-fx="subtle">' + esc(s.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="hint">站点共 ' + (S.sites || []).length + ' 个 · 灾备站点建议只作副站点</div>');
    }

    var flow = $('#vlpFlow');
    if (flow) {
      setHtml(flow, sig('vlpFlow', v.upgradeFlow.map(function (f) { return f.id + f.state; }).join(','), v.checks.map(function (c) { return c.id + c.state; }).join(',')),
        '<div class="step__m">升级流程</div><ul class="steps">' + v.upgradeFlow.map(function (f, i) {
          return '<li class="step"><span class="step__i">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="step__t">' + led(f.state === 'done' ? 'is-on' : f.state === 'active' ? 'is-warn' : '') + ' ' + esc(f.name) +
            ' <span class="step__m">' + esc(f.kind) + ' · ' + esc(f.state) + '</span></span>' +
            '<span class="step__r"><span id="sm-' + esc(f.id) + '"></span></span></li>';
        }).join('') + '</ul>' +
        '<div class="chips"><button class="abtn" data-act="vlp-advance" data-fx="standard">推进一步</button>' +
        '<button class="abtn abtn--quiet" data-act="vlp-reset" data-fx="subtle">重置流程</button></div>' +
        '<div class="step__m">软件包校验流程</div><ul class="steps">' + v.checks.map(function (c) {
          return '<li class="step"><span class="step__i">◆</span><span class="step__t">' + esc(c.name) +
            ' <span class="step__m">' + esc(c.target || '') + ' · ' + esc(c.state) + '</span></span>' +
            '<span class="step__r"><span id="cm-' + esc(c.id) + '"></span>' +
            '<button class="ibtn" data-act="vlp-check" data-id="' + esc(c.id) + '" title="执行该项">▶</button></span></li>';
        }).join('') + '</ul>' +
        '<div class="chips"><button class="abtn abtn--quiet" data-act="vlp-check-all" data-fx="subtle">执行全部校验</button></div>');
      v.checks.forEach(function (c) {
        var m = $('#cm-' + c.id);
        if (m) X.statusMark(m, { state: c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : c.state === 'running' ? 'working' : 'idle', label: c.detail || c.state });
      });
      v.upgradeFlow.forEach(function (f) {
        var m = $('#sm-' + f.id);
        if (m) X.statusMark(m, { state: f.state === 'done' ? 'done' : f.state === 'active' ? 'working' : 'idle', label: f.state });
      });
    }
  }

  /* ============================================================ 检查器 */
  function neInspect() {
    var st = neState(), ne = st.ne;
    if (!ne) return '<div class="empty">选一个标本</div>';
    return '<div class="insp"><div class="insp__hd">' + led(ne.status === '在线' ? 'is-on' : '') + '<b>' + esc(ne.name) + '</b>' + tag(ne.type, 'brass') + tag('V' + ne.version, 'dim') + '</div>' +
      '<div class="kvlist">' + row2('编号', ne.neId) + row2('架构', ne.arch) + row2('厂商', ne.vendor) +
      row2('软件名', ne.softName) + row2('组', (SEL.group(ne.group) || {}).name || '未成组') +
      row2('流程进度', st.run.idx + '/' + st.steps.length) + '</div></div>';
  }
  function ompInspect() {
    var k = SEL.kpis();
    return '<div class="insp"><div class="insp__hd"><b>受管域概览</b>' + tag(S.deploy.omp.version, 'brass') + '</div>' +
      '<div class="kvlist">' + row2('标本', k.ne) + row2('网元组', k.groups) + row2('账号', k.accounts) +
      row2('一体化任务', k.tasks) + row2('共部署', S.deploy.omp.coDeploy ? '是' : '否') + row2('宿主', S.deploy.omp.host) + '</div></div>';
  }
  function lcmInspect() {
    var p = S.packages[0];
    return '<div class="insp"><div class="insp__hd"><b>最近登记的软件包</b>' + tag(S.deploy.lcmp.version, 'brass') + '</div>' +
      (p ? '<div class="kvlist">' + row2('名称', p.name) + row2('类型', p.type) + row2('所属网元', p.ne) +
        row2('厂商', p.vendor) + row2('版本', p.version) + row2('大小', p.sizeMB + 'MB') + row2('校验', p.validated ? '通过' : '待校验') + '</div>' +
        '<pre>' + esc('MD5 ' + (p.md5 || '—')) + '</pre>' : '<div class="hint">还没有软件包</div>') + '</div>';
  }
  function vlpInspect() {
    var v = S.vlp;
    return '<div class="insp"><div class="insp__hd"><b>虚层平台</b>' + tag(v.version, 'brass') + '</div>' +
      '<div class="kvlist">' + row2('CPU', v.cpu + ' 核') + row2('主站点', v.primarySite || '—') +
      row2('副站点', v.secondarySite || '—') + row2('升级流程', v.upgradeFlow.filter(function (f) { return f.state === 'done'; }).length + '/' + v.upgradeFlow.length) +
      row2('校验通过', v.checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + v.checks.length) + row2('卷', (v.volume || 0) + ' GB') + '</div></div>';
  }

  V6.register('ne', { render: neRender, inspect: neInspect });
  V6.register('omp', { render: ompRender, inspect: ompInspect });
  V6.register('lcm', { render: lcmRender, inspect: lcmInspect });
  V6.register('vlp', { render: vlpRender, inspect: vlpInspect });

  /* ============================================================ 事件接线 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act, id = b.dataset.id;
    switch (act) {
      case 'pick-port': A.selectPort(id); return;
      case 'toggle-cap':
        var p = SEL.port(); if (!p) return;
        if (p.caps.indexOf(id) >= 0) { A.detachCap(p.id, id); toast('已卸载能力', (pick(S.caps, id) || {}).name || id, 'warn'); }
        else { A.attachCap(p.id, id); toast('已挂载能力', (pick(S.caps, id) || {}).name || id, 'ok'); }
        return;
      case 'cert-issue':
        var pf = SEL.port(); if (!pf) return;
        var done = MP.btn.loading(b, '签发中');
        setTimeout(function () {
          A.generateCert(pf.id, { cn: pf.cert.cn || ('mock-' + pf.port + '.' + pf.ip), days: 365, issuer: 'MockCA-Root' });
          done();
          toast('证书已签发', (SEL.port() || {}).cert.cn + ' · 365 天', 'ok');
        }, 620);
        return;
      case 'cert-export':
        var pe = SEL.port(); if (!pe) return;
        H.download('mock-' + pe.port + '.pem', '-----BEGIN CERTIFICATE-----\n' + btoa(unescape(encodeURIComponent(pe.cert.cn + '|' + pe.cert.fingerprint))).replace(/(.{64})/g, '$1\n') + '\n-----END CERTIFICATE-----\n');
        toast('已导出 PEM', '文件名 mock-' + pe.port + '.pem', 'ok');
        return;

      case 'pick-api': A.selectApi(id); return;
      case 'add-field':
        var a1 = SEL.api(); if (!a1) return;
        var f1 = A.addField(a1.id);
        toast('已加字段', f1.key + ' · 记得配规则', 'ok');
        return;
      case 'rm-field': A.removeField(SEL.api().id, id); toast('已删除字段', '', 'warn'); return;
      case 'add-ix': A.addInteraction(SEL.api().id, b.dataset.kind); toast('已插入人机交互', '下次命中会停在闸门等你放行', 'warn'); return;
      case 'rm-ix': A.removeInteraction(SEL.api().id, id); toast('已移除人机交互', '命中后直接返回', 'ok'); return;
      case 'trigger-api':
        var a2 = SEL.api(); if (!a2) return;
        var d2 = MP.btn.loading(b, '触发中');
        setTimeout(function () {
          var lg = A.triggerApi(a2.id);
          d2();
          var notes = (lg.res && lg.res.notes) || [];
          toast('已触发 ' + a2.method + ' ' + a2.path,
            notes.slice(0, 3).map(function (n) { return n.key + '=' + n.value + '[' + n.rule + ']'; }).join(' · ') || '按配方返回',
            lg.interaction && lg.interaction.status === 'pending' ? 'warn' : 'ok', { duration: 5200 });
        }, 460);
        return;

      case 'pick-ne':
        if (V6.ui) V6.ui.selectedNe = id;
        S.ui.selectedNe = id;
        A.updateNE(id, {}); V6.rerender(); return;
      case 'save-ne':
        var ne1 = SEL.ne(); if (!ne1) return;
        var patch = {
          name: ($('#neName') || {}).value, type: ($('#neType') || {}).value, arch: ($('#neArch') || {}).value,
          vendor: ($('#neVendor') || {}).value, version: ($('#neVer') || {}).value, softName: ($('#neSoft') || {}).value,
          status: ($('#neStatus') || {}).value, group: ($('#neGroup') || {}).value
        };
        var bad = (ne1.validations || []).filter(function (v) {
          var re; try { re = new RegExp(v.rule); } catch (x) { return false; }
          return v.field === 'version' && patch.version && !re.test(patch.version);
        });
        A.updateNE(ne1.id, patch);
        if (bad.length) toast('已保存，但参数校验不通过', bad[0].message || bad[0].field, 'warn');
        else toast('标本属性已保存', patch.name + ' · V' + patch.version, 'ok');
        return;
      case 'copy-ne':
        var nc = A.copyNE(SEL.ne().id);
        toast('已复制标本', nc.name + ' · ' + nc.neId, 'ok');
        return;
      case 'new-ne':
        var nn = A.addNE({ name: '新建标本 ' + (S.nes.length + 1), code: (S.neCodes || ['GNB'])[0], type: (S.neTypes || ['gNB'])[0], arch: (S.arches || ['分布式'])[0], vendor: (S.vendors || ['RhineLab'])[0], version: '6.0.0', group: '' });
        toast('已新建标本', nn.name, 'ok'); return;
      case 'join-group': A.assignGroup(SEL.ne().id, id); toast('已加入网元组', (pick(S.groups, id) || {}).name, 'ok'); return;
      case 'add-group':
        var gg = A.addGroup({ name: ($('#grName') || {}).value || ('新组 ' + (S.groups.length + 1)), desc: '由实验台创建', strategy: ($('#grStrategy') || {}).value });
        toast('已建组', gg.name, 'ok'); return;
      case 'add-valid':
        A.addValidation(SEL.ne().id, { field: ($('#vdField') || {}).value, rule: ($('#vdRule') || {}).value, level: ($('#vdLevel') || {}).value, message: ($('#vdMsg') || {}).value });
        toast('已加校验规则', ($('#vdField') || {}).value + ' ' + ($('#vdRule') || {}).value, 'ok'); return;
      case 'rm-valid':
        var nev = SEL.ne();
        A.updateNE(nev.id, { validations: nev.validations.filter(function (v) { return v.id !== id; }) });
        toast('已移除校验规则', '', 'warn'); return;
      case 'run-valid':
        var ne2 = SEL.ne(); if (!ne2) return;
        var host = $('#vdOut'); host.innerHTML = '';
        var ld = el('div'); host.appendChild(ld);
        X.latticeLoader(ld, { label: '正在执行 ' + (ne2.validations || []).length + ' 条规则' });
        var dv = MP.btn.loading(b, '校验中');
        setTimeout(function () {
          var res = A.runValidation(ne2.id);
          dv();
          host.innerHTML = res.length ? res.map(function (r) {
            return '<div class="row" style="cursor:default"><span class="row__t">' + tag(r.pass ? 'PASS' : 'FAIL', r.pass ? 'sig' : 'alarm') +
              '<b style="font-size:12px">' + esc(r.field) + '</b><span class="row__s" style="margin-left:auto">' + esc(r.message || '') + '</span></span></div>';
          }).join('') : '<div class="hint">没有校验规则</div>';
          toast('参数校验完成', res.filter(function (r) { return r.pass; }).length + '/' + res.length + ' 通过', res.every(function (r) { return r.pass; }) ? 'ok' : 'warn');
        }, 760);
        return;
      case 'step-add':
        A.addUpgradeStep(SEL.ne().id, { name: ($('#usName') || {}).value, kind: ($('#usKind') || {}).value, durationS: +($('#usDur') || {}).value || 60, owner: ($('#usOwner') || {}).value });
        toast('已加升级步骤', ($('#usName') || {}).value, 'ok'); return;
      case 'step-up': A.moveStep(SEL.ne().id, id, -1); return;
      case 'step-down': A.moveStep(SEL.ne().id, id, 1); return;
      case 'step-rm': A.removeStep(SEL.ne().id, id); toast('已移除步骤', '', 'warn'); return;
      case 'run-ne-reset': UI.neRun = { neId: SEL.ne().id, idx: 0, logs: [] }; neRender(); toast('流程已重置', '回到第一步', 'warn'); return;
      case 'run-ne':
        var ne3 = SEL.ne(); if (!ne3) return;
        if (!UI.neRun || UI.neRun.neId !== ne3.id) UI.neRun = { neId: ne3.id, idx: 0, logs: [] };
        var run = UI.neRun;
        if (run.idx >= ne3.upgrade.length) { toast('流程已走完', '点重置可以再来一遍', 'ok'); return; }
        var step = ne3.upgrade[run.idx];
        var dr = MP.btn.loading(b, '执行中');
        setTimeout(function () {
          if (step.kind === 'human') {
            dr();
            run.logs.push('步骤 ' + (run.idx + 1) + '「' + step.name + '」等待人工放行');
            toast('步骤需要人工放行', step.name + ' · 已停在闸门前', 'warn', { actionLabel: '去闸门', onAction: V6.openGate });
            neRender();
            return;
          }
          run.idx++;
          run.logs.push('步骤 ' + run.idx + '「' + step.name + '」' + (step.kind === 'auto' ? '自动完成' : '手动完成'));
          dr();
          toast('步骤完成', step.name, 'ok');
          neRender();
          if (run.idx >= ne3.upgrade.length) toast('升级流程完成', ne3.name + ' 已到目标版本', 'ok');
        }, Math.min(1200, (step.durationS || 30) * 8));
        return;

      case 'pick-nes': UI.pickNes[id] = !UI.pickNes[id]; ompRender(); return;
      case 'advance-task':
        var dt = MP.btn.loading(b, '推进中');
        setTimeout(function () {
          A.advanceTask(id);
          dt();
          var now = pick(S.tasks, id);
          toast('任务已推进', now.name + ' · ' + now.status + ' · ' + now.progress + '%', /human|等待/.test(now.status) ? 'warn' : 'ok');
          if (/human|等待/.test(now.status)) toast('任务停在人工步骤', '放行后继续', 'warn', { actionLabel: '打开闸门', onAction: V6.openGate });
        }, 520);
        return;

      case 'validate-pkg':
        var dv2 = MP.btn.loading(b, '校验中');
        var vm = $('#vm-' + id);
        if (vm) { vm.innerHTML = ''; X.latticeLoader(vm, { label: 'MD5 / 签名 / 依赖' }); }
        setTimeout(function () {
          A.validatePackage(id);
          dv2();
          var np = pick(S.packages, id);
          toast('软件包校验' + (np.validated ? '通过' : '未通过'), np.name + ' · ' + (np.validated ? '可以投递' : '缺依赖或签名不符'), np.validated ? 'ok' : 'danger');
        }, 820);
        return;
      case 'remove-pkg':
        var rp = pick(S.packages, id);
        X.fuseButton(b, {
          label: '移除', doneLabel: '已移除', undoLabel: '撤销', undoWindow: 4000,
          onCommit: function () { A.removePackage(id); toast('已移除软件包', rp.name, 'warn'); },
          onUndo: function () { A.addPackage({ name: rp.name, type: rp.type, ne: rp.ne, vendor: rp.vendor, version: rp.version, sizeMB: rp.sizeMB }); toast('已撤销移除', rp.name, 'ok'); }
        });
        return;

      case 'site-primary': A.setSite('primary', id); toast('主站点已切换', (pick(S.sites, id) || {}).name, 'ok'); return;
      case 'site-secondary':
        if (id === S.vlp.primarySite) { toast('主副不能是同一站点', '先把主站点换到别处', 'danger'); return; }
        A.setSite('secondary', id); toast('副站点已切换', (pick(S.sites, id) || {}).name, 'ok'); return;
      case 'vlp-advance': A.advanceVlpFlow(); toast('虚层流程已推进', '', 'ok'); return;
      case 'vlp-reset': A.resetVlpFlow(); toast('虚层流程已重置', '', 'warn'); return;
      case 'vlp-check':
        var db = MP.btn.loading(b, '校验中');
        setTimeout(function () { A.runVlpCheck(id); db(); toast('校验项已执行', (S.vlp.checks.filter(function (c) { return c.id === id; })[0] || {}).name || '', 'ok'); }, 620);
        return;
      case 'vlp-check-all':
        var da = MP.btn.loading(b, '全部校验中');
        setTimeout(function () {
          S.vlp.checks.forEach(function (c) { A.runVlpCheck(c.id); });
          da();
          var pass = S.vlp.checks.filter(function (c) { return c.state === 'pass'; }).length;
          toast('软件包校验完成', pass + '/' + S.vlp.checks.length + ' 通过', pass === S.vlp.checks.length ? 'ok' : 'warn');
        }, 900);
        return;
    }
  });

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-netab]');
    if (!tab) return;
    UI.netab = tab.dataset.netab;
    $$('#neTabs .ctab').forEach(function (c) { c.classList.toggle('is-active', c === tab); });
    neRender(); beep('step');
  });

  /* 字段 / 规则编辑（委托 change + input） */
  function patchField(t) {
    var api = SEL.api(); if (!api) return;
    var fid = t.dataset.id, key = t.dataset.fk, val = t.value;
    var patch = {};
    if (key === 'rulekind') {
      var f0 = api.fields.filter(function (f) { return f.id === fid; })[0] || {};
      patch.rule = Object.assign({}, f0.rule || {}, { kind: val });
    } else if (key === 'type' || key === 'source' || key === 'key' || key === 'value') patch[key] = val;
    A.updateField(api.id, fid, patch);
  }
  function patchRule(t) {
    var api = SEL.api(); if (!api) return;
    var fid = t.dataset.id, k = t.dataset.rk, v = t.value;
    var f = api.fields.filter(function (x) { return x.id === fid; })[0]; if (!f) return;
    var rule = Object.assign({}, f.rule || { kind: 'fixed' });
    if (k === 'whenKey' || k === 'whenOp' || k === 'whenValue') {
      var w = Object.assign({}, rule.when || {});
      w[k === 'whenKey' ? 'key' : k === 'whenOp' ? 'op' : 'value'] = v;
      rule.when = w;
    } else if (k === 'options') {
      A.updateField(api.id, fid, { options: v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
      return;
    } else if (k === 'start' || k === 'step' || k === 'times') rule[k] = +v;
    else rule[k] = v;
    A.updateField(api.id, fid, { rule: rule });
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.dataset) return;
    if (t.dataset.fk) patchField(t);
    else if (t.dataset.rk) patchRule(t);
    else if (t.id === 'vlpVersion') { A.setVlpVersion(t.value); toast('平台版本已切换', t.value, 'ok'); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.dataset) return;
    if (t.dataset.fk && (t.dataset.fk === 'value' || t.dataset.fk === 'key')) patchField(t);
    else if (t.dataset.rk && t.dataset.rk.indexOf('when') === 0) patchRule(t);
    else if (t.id === 'auditQuery') A.setLogQuery(t.value);
  });

  /* 表单提交 */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.id) return;
    e.preventDefault();
    if (f.id === 'portForm') {
      var ip = ($('#pfIp') || {}).value || '', port = +($('#pfPort') || {}).value;
      if (!ip.trim()) { errEl('pfPortErr', '请填本机 IP（可从网卡列表选，也可手填）'); return; }
      if (!(port > 0 && port <= 65535)) { errEl('pfPortErr', '端口必须在 1–65535 之间'); return; }
      if (S.ports.some(function (p) { return p.ip === ip && p.port === port; })) { errEl('pfPortErr', '这个 IP:端口 已经登记过了'); return; }
      errEl('pfPortErr', '');
      var np = A.registerPort({ ip: ip.trim(), port: port, protocol: ($('#pfProto') || {}).value, tls: ($('#pfTls') || {}).value, caps: [], note: '' });
      toast('端点已登记', portLabel(np) + ' · 接下来签发证书并挂载能力', 'ok');
      return;
    }
    if (f.id === 'accForm') {
      var name = ($('#acName') || {}).value || '';
      if (!name.trim()) { toast('账号名不能为空', '输入框上方就是 label', 'danger'); if ($('#acName')) $('#acName').focus(); return; }
      var nes = Object.keys(UI.pickNes).filter(function (k) { return UI.pickNes[k]; });
      var acc = A.createAccount({ name: name.trim(), role: ($('#acRole') || {}).value, scope: nes.length ? ['指定网元'] : ['全部网元'], nes: nes });
      UI.pickNes = {};
      toast('账号已创建', acc.name + ' · ' + acc.role + ' · 授权 ' + acc.nes.length + ' 个网元', 'ok');
      return;
    }
    if (f.id === 'taskForm') {
      var tname = ($('#tkName') || {}).value || '';
      if (!tname.trim()) { toast('任务名不能为空', '', 'danger'); return; }
      var site = ($('#tkSite') || {}).value, gid = ($('#tkGroup') || {}).value, g = pick(S.groups, gid);
      var t2 = A.createTask({ name: tname.trim(), site: site, neIds: g ? g.members.slice() : [], owner: 'JOYCE' });
      toast('一体化任务已创建', t2.name + ' · 关联 ' + site + ' · ' + t2.neIds.length + ' 个网元', 'ok');
      return;
    }
    if (f.id === 'pkgForm') {
      var pname = ($('#pkgName') || {}).value || '', pver = ($('#pkgVer') || {}).value || '';
      if (!pname.trim() || !pver.trim()) { toast('名称与版本必填', '版本形如 1.0.0', 'danger'); return; }
      var pk = A.addPackage({ name: pname.trim(), type: ($('#pkgType') || {}).value, ne: ($('#pkgNe') || {}).value, vendor: ($('#pkgVendor') || {}).value, version: pver.trim(), sizeMB: +($('#pkgSize') || {}).value || 420 });
      toast('软件包已登记', pk.name + ' · 待校验', 'ok');
      return;
    }
  });

  /* 启动 + 全局小件 */
  V6.boot();
  setTimeout(function () {
    var af = $('#auditFilter');
    if (af && !af.__done) {
      af.__done = 1;
      X.segmented(af, {
        items: [{ label: '全部', value: 'all' }, { label: '成功', value: 'ok' }, { label: '异常', value: 'err' }, { label: '待人工', value: 'human' }],
        value: S.ui.logFilter || 'all',
        onChange: function (v) { A.setLogFilter(v); }
      });
    }
    var host = S.host || {};
    fillDatalist('nicList', [host.ip, host.alt].filter(Boolean));
    var ipEl = $('#pfIp');
    if (ipEl && !ipEl.value) ipEl.value = host.ip || '';
  }, 0);
})();

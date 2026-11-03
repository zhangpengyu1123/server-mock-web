/* ============================================================================
   管理面（独立平台）
   · 自己的登录：选择目标 L 端节点 + 管理员凭据
   · 只有舰队 / 部署 / 账号 / 审计，**没有任何业务面视图**
   · 与业务面唯一的交集是：它管理的对象（L 端）同时也在跑业务面
   ==========================================================================*/
(function () {
  'use strict';
  const { $, $$, esc, nf, hhmmss, mmdd, sleep, toast, client, typeLines, flicker, bootClock } = RL;

  const S = {
    base: '',
    api: null,
    user: null,
    view: 'nodes',
    nodes: [],
    users: [],
    logs: [],
    job: null,
    jobs: [],
    mappings: [],
    rigFocus: null,
    rigSel: null,
    scene: null,
    jobTimer: null,
    statTimer: null
  };

  /* ------------------------------------------------------------------ 登录 */
  const LINES = [
    ['MOUNT /dev/fleet', 'OK'],
    ['TRUST ANCHOR', 'VERIFIED'],
    ['NODE HANDSHAKE', 'PENDING'],
    ['REQUEST RECEIVED', '—'],
    ['START PROCESSING', '……']
  ];

  async function runSequence() {
    $('#seq').hidden = false;
    $('#card').hidden = true;
    await typeLines($('#seqLog'), $('#seqVerb'), LINES, (i) => {
      if (i === 2) $('#seqVerb').textContent = 'NODE HANDSHAKE';
      if (i === 3) $('#seqVerb').textContent = 'REQUEST RECEIVED';
    });
    $('#seqVerb').textContent = 'START PROCESSING';
    await sleep(150);
    flicker($('#authFlicker'), 240);
    await sleep(180);
    $('#seq').hidden = true;
    $('#card').hidden = false;
    setTimeout(() => $('#fUser').focus(), 60);
  }

  function loginError(msg) {
    const box = $('#loginErr');
    box.hidden = false;
    box.textContent = 'CONNECT FAILED · ' + msg;
    const card = $('#card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    $('#footMsg').textContent = '接入失败';
  }

  async function doLogin(ev) {
    if (ev) ev.preventDefault();
    const btn = $('#btnLogin');
    const base = $('#fServer').value.trim();
    const user = $('#fUser').value.trim();
    const pass = $('#fPass').value;
    if (!base) return loginError('请填写目标节点地址（如 http://10.0.0.21:9600）');
    if (!user || !pass) return loginError('需要管理员身份与授权码');

    S.base = base;
    S.api = client(S.base);
    btn.disabled = true;
    $('#footMsg').textContent = '正在连接节点…';
    try {
      const meta = await fetch(S.base.replace(/\/+$/, '') + '/api/meta').then((r) => r.json());
      $('#footVer').textContent = 'v' + (meta.version || '0.1.0');
      const data = await S.api.req('/api/auth/login', { method: 'POST', body: { username: user, password: pass } });
      if (data.user.role !== 'admin') {
        throw Object.assign(new Error('该账号不是管理员'), { status: 403 });
      }
      S.user = data.user;
      S.api.setCsrf(data.csrf);
  window.RHINE_CSRF = data.csrf;   // 供 3D 交互层复用（rig-ui.js）
      try { localStorage.setItem('rhine.admin.base', S.base); } catch (e) {}
      $('#footMsg').textContent = '已接入 · 载入舰队';
      $('#whiteout').classList.add('on');
      await sleep(420);
      enter();
    } catch (e) {
      loginError(e.status === 401 ? '凭据无效' : e.message);
      $('#fPass').value = '';
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ 主体 */
  function enter() {
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#userName').textContent = S.user.display || S.user.username;
    $('#userRole').textContent = 'ADMIN';
    $('#topTarget').textContent = S.base.replace(/^https?:\/\//, '');
    renderRail();
    renderView();
    loadAll();
    clearInterval(S.statTimer);
    S.statTimer = setInterval(refresh, 5000);
  }

  function renderRail() {
    const groups = [
      { title: 'FLEET', items: [{ id: 'nodes', lb: '机架视图', hint: S.nodes.length }, { id: 'jobs', lb: '部署作业', hint: S.jobs.length }] },
      { title: 'ACCESS', items: [{ id: 'users', lb: '账号', hint: S.users.length }, { id: 'audit', lb: '审计流', hint: S.logs.length }] }
    ];
    $('#rail').innerHTML = groups
      .map(
        (g, gi) =>
          '<div class="rail__grp"><h4>' +
          esc(g.title) +
          '</h4>' +
          g.items
            .map(
              (it, i) =>
                '<button class="rail__item' +
                (it.id === S.view ? ' is-on' : '') +
                '" data-view="' +
                it.id +
                '" type="button"><i>' +
                esc(('0' + (gi * 10 + i + 1)).slice(-2)) +
                '</i>' +
                esc(it.lb) +
                '<em>' +
                (it.hint == null ? '' : esc(it.hint)) +
                '</em></button>'
            )
            .join('') +
          '</div>'
      )
      .join('');
  }

  const head = (t, sub, acts) =>
    '<div class="main__head"><div><h2 class="main__title">' + esc(t) + '</h2><div class="main__sub">' + esc(sub) + '</div></div><div class="main__acts">' + (acts || '') + '</div></div>';

  function renderView() {
    const views = {
      // 机架视图 = 三维场景（主板=虚机，插在上面的服务器模块=mock 服务）
      nodes: () => viewRig(),
      jobs: () => head('部署作业', '管理面 · 分阶段回执') + viewJobs(),
      users: () => head('账号', '管理面 · 业务面用户与权限') + viewUsers(),
      audit: () => head('审计流', '管理面 · 全部操作记录') + viewAudit()
    };
    $('#main').innerHTML = (views[S.view] || views.nodes)();
    bind();
    if (S.view === 'nodes') mountRig();
  }

  function stageBar(job) {
    const order = ['upload', 'verify', 'activate', 'done'];
    const i = order.indexOf(job.stage);
    const bars = order.map((_, k) => '<i class="' + (k <= i ? 'on' : '') + '"></i>').join('');
    return (
      '<div class="stage ' + (job.stage === 'done' ? 'stage--done' : '') + '">' + bars + '</div>' +
      '<div class="stage__lb"><span>' + esc(job.message || job.stage) + '</span><span>' + esc(job.progress) + '% · ' + esc(job.stage.toUpperCase()) + '</span></div>'
    );
  }

  /* ---------------------------------------------------------------- 三维机架 */
  const KIND_LABEL = { LCM: 'LCM', OMC: 'OMC', FS: 'FS' };

  function viewRig() {
    if (!S.nodes.length) {
      return '<div class="pnl"><div class="empty">没有节点<em>确认目标地址是否正确、L 端 agent 是否在跑</em></div></div>';
    }
    const online = S.nodes.filter((n) => n.status === 'online').length;
    const list = S.nodes
      .map((n) => {
        const dot = n.status === 'online' ? 'is-on' : n.status === 'updating' ? 'is-up' : 'is-off';
        const cnt = (S.mappings || []).filter((m) => m.node_id === n.id || (!m.node_id && false)).length;
        return (
          '<button class="rig-hud__item' + (n.id === S.rigFocus ? ' is-on' : '') + '" data-focus="' + esc(n.id) + '" type="button">' +
          '<span class="rig-hud__dot ' + dot + '"></span>' +
          '<span class="rig-hud__nm">' + esc(n.name) + '</span>' +
          '<span class="rig-hud__meta">' + esc(n.version) + '</span>' +
          '</button>'
        );
      })
      .join('');

    return (
      '<div class="rig" id="rig">' +
      '<div class="rig-hud">' +
      '<div class="rig-hud__tl">' +
      '<div class="rig-hud__brand">RHINE LAB</div>' +
      '<div class="rig-hud__sub">Fleet Rig · 虚机管理平台</div>' +
      '<span class="rig-hud__idx mono">X-001</span>' +
      '</div>' +
      '<div class="rig-hud__tr">' +
      '<div class="kv"><span>NODES</span><b>' + S.nodes.length + '</b></div>' +
      '<div class="kv"><span>ONLINE</span><b>' + online + '</b></div>' +
      '<div class="kv"><span>SERVICES</span><b>' + (S.mappings || []).length + '</b></div>' +
      '<div class="kv"><span>TARGET</span><b>' + esc(S.base.replace(/^https?:\/\//, '')) + '</b></div>' +
      '</div>' +
      '<div class="rig-hud__list">' + list + '</div>' +
      '<div class="rig-hud__panel" id="rigPanel"></div>' +
      '<div class="rig-hud__legend">' +
      '<span><i></i>LCM</span><span><i></i>OMC</span><span><i class="is-cyan"></i>DEPLOYING</span><span><i class="is-dim"></i>OFFLINE</span>' +
      '</div>' +
      '<div class="rig-hud__hint">拖拽旋转 · 滚轮缩放 · 点选查看</div>' +
      '</div></div>'
    );
  }

  function mountRig() {
    const host = $('#rig');
    if (!host || !window.RhineScene) return;
    S.scene = window.RhineScene.mount(host, {
      onSelect: (type, payload) => {
        S.rigSel = payload;
        S.rigFocus = type === 'node' ? payload.id : (payload.data && payload.data.node_id) || null;
        // 操作面板统一由 rig-ui.js 提供（右侧停靠）；这里清掉内联面板，避免双面板
        renderRigPanel(type, null);
        $$('.rig-hud__item').forEach((b) => b.classList.toggle('is-on', b.dataset.focus === S.rigFocus));
      }
    });
    // 等模块脚本就绪（首次加载时 app.js 可能先跑）
    const apply = () => window.RhineScene && window.RhineScene.setData({ nodes: S.nodes, mappings: S.mappings || [] });
    if (window.RhineScene) apply();
    else window.addEventListener('rhine-scene-module-ready', apply, { once: true });
  }

  function renderRigPanel(type, payload) {
    const panel = $('#rigPanel');
    if (!panel) return;
    if (!payload) { panel.classList.remove('is-on'); panel.innerHTML = ''; return; }
    const d = payload.data || {};
    let html = '';
    if (type === 'node') {
      html =
        '<h4>『' + esc(d.name || '') + '』</h4>' +
        '<dl><dt>NODE</dt><dd>' + esc(d.id) + '</dd>' +
        '<dt>ADDR</dt><dd>' + esc(d.addr) + '</dd>' +
        '<dt>STATUS</dt><dd>' + esc(d.status) + '</dd>' +
        '<dt>VERSION</dt><dd>' + esc(d.version) + '</dd>' +
        '<dt>MAPPINGS</dt><dd>' + esc(d.mappings) + '</dd></dl>' +
        '<div class="acts"><select class="inp" id="rigVer" style="height:28px;width:92px"><option value="0.2.0">0.2.0</option><option value="0.1.1">0.1.1</option><option value="0.0.9">0.0.9</option></select>' +
        '<button class="btn btn--sm btn--primary" data-act="deploy" data-id="' + esc(d.id) + '">下发部署</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="close-panel">关闭</button></div>';
    } else {
      html =
        '<h4>『' + esc(d.name || d.path) + '』<span class="kind">' + esc(KIND_LABEL[d.kind] || d.kind || 'LCM') + '</span></h4>' +
        '<dl><dt>METHOD</dt><dd>' + esc(String(d.method || '').toUpperCase()) + '</dd>' +
        '<dt>PATH</dt><dd style="word-break:break-all">' + esc(d.path) + '</dd>' +
        '<dt>STATUS</dt><dd>' + esc(d.status) + '</dd>' +
        '<dt>DELAY</dt><dd>' + esc(d.delay_ms) + ' ms</dd>' +
        '<dt>HITS</dt><dd>' + esc(d.hits) + '</dd></dl>' +
        '<div class="acts"><button class="btn btn--sm" data-act="pulse" data-id="' + esc(d.id) + '">脉冲</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="close-panel">关闭</button></div>';
    }
    panel.innerHTML = html;
    panel.classList.add('is-on');
  }

  function viewNodesLegacy() {
    if (!S.nodes.length) return '<div class="pnl"><div class="empty">没有节点<em>确认目标地址是否正确、L 端 agent 是否在跑</em></div></div>';
    const cards = S.nodes
      .map((n) => {
        const st = n.status === 'online' ? ['st--on', 'ONLINE'] : n.status === 'updating' ? ['st--off', 'UPDATING'] : ['st--off', 'OFFLINE'];
        const job = S.job && S.job.node_id === n.id ? S.job : null;
        return (
          '<div class="node' + (n.status === 'offline' ? ' is-off' : '') + '">' +
          '<div class="node__hd"><span class="node__name">' + esc(n.name) + '</span><span class="node__addr">' + esc(n.addr) + '</span></div>' +
          '<div class="node__row"><span class="st ' + st[0] + '">' + st[1] + '</span><span>版本</span><b>' + esc(n.version) + '</b><span>映射</span><b>' + esc(n.mappings) + '</b></div>' +
          (job ? stageBar(job) : '<div class="node__env">LAST SEEN ' + esc(mmdd(n.last_seen)) + '</div>') +
          '<div class="node__acts"><select class="inp" data-deploy-target="' + esc(n.id) + '" style="height:30px;width:104px">' +
          '<option value="0.2.0">0.2.0</option><option value="0.1.1">0.1.1</option><option value="0.0.9">0.0.9</option></select>' +
          '<button class="btn btn--sm btn--primary" data-act="deploy" data-id="' + esc(n.id) + '"' + (n.status === 'updating' ? ' disabled' : '') + '>下发部署</button>' +
          '</div></div>'
        );
      })
      .join('');
    return '<div class="nodes">' + cards + '</div>';
  }

  function viewJobs() {
    if (!S.jobs.length) return '<div class="pnl"><div class="empty">本会话还没有部署作业<em>去「节点舰队」下发一次</em></div></div>';
    return S.jobs
      .map(
        (j) =>
          '<div class="pnl"><div class="pnl__cap"><b>作业 ' + esc(j.id) + '</b><i>DEPLOY</i><span class="sp"></span><span class="badge ' + (j.finished ? 'badge--ok' : 'badge--amber') + '">' + (j.finished ? 'DONE' : 'RUNNING') + '</span></div>' +
          '<div class="pnl__bd">' + stageBar(j) +
          '<div class="grid3" style="margin-top:14px"><div><div class="fld__lb">节点</div><div class="mono">' + esc(j.node_id) + '</div></div>' +
          '<div><div class="fld__lb">版本</div><div class="mono">' + esc(j.from_version) + ' → ' + esc(j.to_version) + '</div></div>' +
          '<div><div class="fld__lb">开始</div><div class="mono">' + esc(hhmmss(j.started_at)) + '</div></div></div></div></div>'
      )
      .join('');
  }

  function viewUsers() {
    const rows = S.users.length
      ? S.users
          .map(
            (u) =>
              '<tr><td class="mono">' + esc(u.username) + '</td><td>' + esc(u.display) + '</td>' +
              '<td><span class="badge ' + (u.role === 'admin' ? 'badge--amber' : 'badge--dim') + '">' + esc(u.role.toUpperCase()) + '</span></td>' +
              '<td class="mono">' + esc(mmdd(u.created_at)) + '</td></tr>'
          )
          .join('')
      : '<tr><td colspan="4"><div class="empty">没有账号</div></td></tr>';
    return (
      '<div class="pnl"><div class="pnl__cap"><b>账号</b><i>ACCOUNTS</i></div><div class="pnl__bd--flush"><table class="tbl"><thead><tr><th>身份</th><th>显示名</th><th>角色</th><th>创建</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="pnl"><div class="pnl__cap"><b>新建业务账号</b><i>CREATE</i></div><div class="pnl__bd"><form id="formUser" class="grid3">' +
      '<label class="fld"><span class="fld__lb">身份 <i>USERNAME</i></span><input class="inp mono" name="username" required minlength="3" /></label>' +
      '<label class="fld"><span class="fld__lb">授权码 <i>PASSWORD</i></span><input class="inp mono" name="password" type="password" required minlength="8" /></label>' +
      '<label class="fld"><span class="fld__lb">显示名 <i>DISPLAY</i></span><input class="inp" name="display" /></label>' +
      '<div class="span2 form__acts" style="margin-top:0"><button class="btn btn--primary btn--sm" type="submit">创建</button></div></form></div></div>'
    );
  }

  function viewAudit() {
    const rows = S.logs.length
      ? S.logs
          .map(
            (l) =>
              '<div class="feed__r"><span class="feed__t">' + esc(mmdd(l.at)) + '</span><span class="feed__a">' + esc(l.action) + '</span>' +
              '<span class="feed__d">' + esc(l.detail) + ' <span style="color:var(--ink-4)">· ' + esc(l.actor) + '</span></span></div>'
          )
          .join('')
      : '<div class="empty">暂无记录</div>';
    return '<div class="pnl"><div class="pnl__cap"><b>审计流</b><i>AUDIT</i><span class="sp"></span><span class="badge badge--dim">' + S.logs.length + '</span></div><div class="feed">' + rows + '</div></div>';
  }

  function bind() {
    $$('#main [data-act="reload"]').forEach((b) => b.addEventListener('click', loadAll));
    // 机架视图：右侧面板按钮
    $$('#main [data-act="close-panel"]').forEach((b) =>
      b.addEventListener('click', () => {
        const panel = $('#rigPanel');
        if (panel) { panel.classList.remove('is-on'); panel.innerHTML = ''; }
        S.rigSel = null;
        $$('.rig-hud__item').forEach((x) => x.classList.remove('is-on'));
      })
    );
    $$('#main [data-act="pulse"]').forEach((b) =>
      b.addEventListener('click', () => {
        if (window.RhineScene) window.RhineScene.pulse(b.dataset.id);
      })
    );
    // 机架视图：左侧节点清单 → 相机聚焦
    $$('#main [data-focus]').forEach((b) =>
      b.addEventListener('click', () => {
        S.rigFocus = b.dataset.focus;
        $$('.rig-hud__item').forEach((x) => x.classList.toggle('is-on', x === b));
        if (window.RhineScene) {
          window.RhineScene.focus(b.dataset.focus);
          const n = S.nodes.find((x) => x.id === b.dataset.focus);
          if (n) renderRigPanel('node', { id: n.id, data: n });
        }
      })
    );
    $$('#main [data-act="deploy"]').forEach((b) =>
      b.addEventListener('click', async () => {
        // 卡片视图用 data-deploy-target，机架面板用 #rigVer
        const sel = $('[data-deploy-target="' + b.dataset.id + '"]') || $('#rigVer');
        const version = sel ? sel.value : '0.2.0';
        b.disabled = true;
        try {
          const job = await S.api.req('/api/admin/nodes/' + encodeURIComponent(b.dataset.id) + '/deploy', { method: 'POST', body: { version } });
          S.job = job;
          S.jobs.unshift(job);
          if (window.RhineScene) window.RhineScene.setJob(job);
          toast('已下发 ' + version, 'ok');
          renderRail();
          pollJob(job.id);
        } catch (e) {
          toast('下发失败：' + e.message, 'err');
          b.disabled = false;
        }
      })
    );
    const fu = $('#formUser');
    if (fu)
      fu.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = new FormData(fu);
        try {
          await S.api.req('/api/admin/users', {
            method: 'POST',
            body: { username: String(f.get('username')), password: String(f.get('password')), display: String(f.get('display') || ''), role: 'operator' }
          });
          await loadUsers();
          renderRail();
          renderView();
          toast('账号已创建', 'ok');
        } catch (e) {
          toast('创建失败：' + e.message, 'err');
        }
      });
  }

  /* ------------------------------------------------------------------ 数据 */
  async function loadNodes() { S.nodes = await S.api.req('/api/admin/nodes'); }
  async function loadMappings() { S.mappings = await S.api.req('/api/business/mappings'); }
  async function loadUsers() { S.users = await S.api.req('/api/admin/users'); }
  async function loadLogs() { S.logs = await S.api.req('/api/admin/logs'); }
  async function refresh() {
    try {
      $('#topNodes').textContent = S.nodes.length;
      $('#topOnline').textContent = S.nodes.filter((n) => n.status === 'online').length;
      $('#topJobs').textContent = S.jobs.length;
      $('#sbMid').textContent = 'TARGET ' + S.base.replace(/^https?:\/\//, '');
      $('#sbRight').textContent = 'FLEET v0.1.0';
    } catch (e) {}
  }
  async function loadAll() {
    try {
      await Promise.all([loadNodes(), loadUsers(), loadLogs(), loadMappings()]);
      if (window.RhineScene) window.RhineScene.setData({ nodes: S.nodes, mappings: S.mappings });
      renderRail();
      renderView();
      refresh();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return logout(true);
      toast('加载失败：' + e.message, 'err');
    }
  }

  function pollJob(id) {
    clearInterval(S.jobTimer);
    S.jobTimer = setInterval(async () => {
      try {
        const j = await S.api.req('/api/admin/jobs/' + encodeURIComponent(id));
        S.job = j;
        const idx = S.jobs.findIndex((x) => x.id === j.id);
        if (idx >= 0) S.jobs[idx] = j;
        renderView();
        if (j.finished) {
          clearInterval(S.jobTimer);
          await loadNodes();
          await loadMappings();
          if (window.RhineScene) window.RhineScene.setData({ nodes: S.nodes, mappings: S.mappings });
          renderRail();
          renderView();
          refresh();
          toast(j.ok ? '部署完成 · ' + j.to_version : '部署失败', j.ok ? 'ok' : 'err');
        }
      } catch (e) {
        clearInterval(S.jobTimer);
      }
    }, 500);
  }

  async function logout(silent) {
    try { if (S.api && S.user) await S.api.req('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    S.user = null;
    S.nodes = []; S.users = []; S.logs = []; S.job = null; S.jobs = [];
    clearInterval(S.jobTimer);
    clearInterval(S.statTimer);
    $('#app').hidden = true;
    $('#auth').hidden = false;
    $('#fPass').value = '';
    if (!silent) toast('已退出', 'ok');
    runSequence();
  }

  /* ------------------------------------------------------------------ 启动 */
  async function boot() {
    bootClock('#metaClock');
    let saved = '';
    try { saved = localStorage.getItem('rhine.admin.base') || ''; } catch (e) {}
    if (saved) $('#fServer').value = saved;

    $('#loginForm').addEventListener('submit', doLogin);
    $('#btnDemo').addEventListener('click', () => {
      if (!$('#fServer').value) $('#fServer').value = 'http://127.0.0.1:9600';
      $('#fUser').value = 'admin';
      $('#fPass').value = 'rhine-admin-2026';
      $('#footMsg').textContent = '已填入演示管理员';
    });
    $('#btnLogout').addEventListener('click', () => logout(false));
    $('#rail').addEventListener('click', (e) => {
      const it = e.target.closest('.rail__item');
      if (it) { S.view = it.dataset.view; renderRail(); renderView(); }
    });

    runSequence();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

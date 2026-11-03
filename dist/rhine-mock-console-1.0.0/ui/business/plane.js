/* ============================================================================
   RHINE LAB · PLANE（业务面）
   ----------------------------------------------------------------------------
   结构：两层
     LAYER 1 运行态 → MOCK 管理 / MOCK 流程 / 运行审计
     LAYER 2 准备态 → 网元自定义 / 拓扑 / 平台能力(LCM·OMC·FS)
   说明：本轮为界面实现，人机交互只做操作界面（状态机 UI），不接业务执行。
   ==========================================================================*/
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------------------- 状态 */
  const S = {
    csrf: sessionStorage.getItem('rhine.plane.csrf') || '',
    ep: null,          // 当前 Mock 端点（来自后端）
    tasks: [],         // 审计
    taskTimer: 0,      // 任务视图轮询定时器

    // 升级任务（来自后端）
    taskSel: null,     // 当前查看的任务 id
    packages: [],      // LCM 软件包（来自后端）
    platform: null,    // 平台配置（共部署 / FS）
    human: null,       // 人机交互模板（状态机）
    layer: 'runtime',
    view: 'mock-admin',
    bandTimer: 0,      // 状态条 5s 刷新定时器
    railCollapsed: (function () { try { return localStorage.getItem('rhine.plane.rail') === '1'; } catch (e) { return false; } })(),
    endpoint: { host: '127.0.0.1', port: '9443', enabled: false, cert: null, caps: [] },
    caps: ['NEMP', 'NEF', 'ALARM', 'PERF', 'FM'],
    ifaces: [
      { id: 'if-1', method: 'POST', path: '/nemp/v1/ne/register', status: 200, delay: 120, rules: 3, human: 0, hits: 0 },
      { id: 'if-2', method: 'GET', path: '/nemp/v1/ne/list', status: 200, delay: 40, rules: 2, human: 0, hits: 0 },
      { id: 'if-3', method: 'POST', path: '/necm/v1/upgrade/start', status: 202, delay: 300, rules: 4, human: 2, hits: 0 },
    ],
    audit: [],
    fields: [
      { name: 'neId', type: 'string', source: 'static', value: 'GNB-HZ-0904' },
      { name: 'seq', type: 'number', source: 'autoIncrement', step: 1, max: 999 },
      { name: 'token', type: 'string', source: 'once', value: 'tk-0001' },
      { name: 'result', type: 'string', source: 'conditional', condition: 'status==200 ? "ok" : "fail"' },
    ],
    human: [
      { prompt: '升级即将进入主备倒换，请确认现场可以操作', timeout: 60, options: [{ l: '确认继续', next: 'activate' }, { l: '稍后处理', next: 'hold' }] },
    ],
    elements: [
      { id: 'ne-0001', name: 'gNB-HZ-0904', arch: 'SA', type: 'gNB', version: '5.2.1', sw: 'NR-RAN', group: 'g-hz-01', comps: ['主控板', '交换板', '业务板', '电源', '风扇'] },
      { id: 'ne-0002', name: 'gNB-HZ-0905', arch: 'SA', type: 'gNB', version: '5.2.0', sw: 'NR-RAN', group: 'g-hz-01', comps: ['主控板', '业务板', '电源'] },
      { id: 'ne-0003', name: 'MME-HZ-01', arch: 'EPC', type: 'MME', version: '4.8.4', sw: 'EPC-CORE', group: 'g-hz-02', comps: ['主控板', '信令板', '电源'] },
    ],
    groups: [
      { id: 'g-hz-01', name: '杭州 gNB 组', elements: ['ne-0001', 'ne-0002'] },
      { id: 'g-hz-02', name: '杭州 核心网组', elements: ['ne-0003'] },
    ],
    site: { id: 'site-hz', name: 'HZ 主站点', role: 'primary' },
    ifaceSel: 'if-1',
    ifaceRules: {
      'if-1': {
        status: 200, delay: 120,
        fields: [
          { name: 'code', type: 'string', src: 'static', value: '0' },
          { name: 'message', type: 'string', src: 'static', value: 'success' },
          { name: 'data.neId', type: 'string', src: 'condition', value: 'req.neId || "GNB-HZ-0904"' },
          { name: 'data.seq', type: 'number', src: 'autoIncrement', step: 1, max: 9999 },
          { name: 'data.token', type: 'string', src: 'once', value: 'tk-once-0001' },
        ],
        human: [
          { step: '激活', prompt: '升级包已就绪，确认开始激活？', timeout: 60, state: 'PENDING',
            options: [{ l: '确认激活', effect: 'continue', set: 'result=ok' }, { l: '取消', effect: 'abort', set: 'result=cancel' }] },
        ],
      },
    },
    ifaceVariants: {},  // mappingId -> 多规则数组
    sceneMsg: '',       // 场景导入/导出提示
    scenes: [],         // 内置教学场景（./scenes/index.json）
    accSel: 0,          // OMC 当前编辑授权的账号下标
    pkgDraft: { name: '', kind: '网元软件包', owner: '', vendor: '', version: '' },
    neForm: { open: false, name: '', arch: 'SA', kind: 'gNB', version: '5.2.1', software: 'NR-RAN', group: '', comps: ['主控板', '业务板', '电源'] },
    neDraft: null,     // 当前编辑中的网元草稿（flow / checks）
    groupDraft: [],    // 成组选中的网元
    topoLevel: 'element',
    topoDim: '2d',   // '2d' | '3d'（记住选择，切层级后仍生效）
    omc: {
      elements: ['ne-0001', 'ne-0002'],
      groups: ['g-hz-01'],
      accounts: [
        { id: 'acc-01', name: 'omc-ops', scope: ['ne-0001'], role: '运维' },
        { id: 'acc-02', name: 'omc-view', scope: ['ne-0001', 'ne-0002'], role: '只读' },
      ],
      tasks: [
        { id: 'UPG-0091', site: 'site-hz', elements: ['ne-0001', 'ne-0002'], from: '5.2.0', to: '5.2.1', stage: 'activate', progress: 62, human: 1 },
      ],
    },
    lcm: {
      elements: ['ne-0001', 'ne-0002', 'ne-0003'],
      coDeploy: true,
      packages: [
        { id: 'pkg-001', name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.1', verified: true },
        { id: 'pkg-002', name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.0', verified: true },
        { id: 'pkg-003', name: 'EPC-CORE', kind: '核心网软件包', owner: 'ne-0003', vendor: '中兴', version: '4.8.4', verified: true },
      ],
    },
    fs: {
      cpus: 16, sitePrimary: 'HZ 主站点', siteSecondary: 'NB 备站点',
      platformVersion: '2.4.0',
      verifySteps: ['校验 checksum（sha256）', '校验签名（GPG）', '校验包与平台版本兼容性', '校验主备站点一致性'],
      upgrade: ['挂载安装镜像', '预检查（CPU/内存/存储）', '停业务', '安装', '启动并自检', '主备切换验证'],
    },
    neFlow: [
      { s: '上传软件包', human: false },
      { s: '预检查（参数校验）', human: false },
      { s: '激活', human: true },
      { s: '主备倒换', human: true },
      { s: '完成与回执', human: false },
    ],
    neChecks: [
      { f: 'version', rule: '目标版本 > 当前版本', msg: '不支持降级' },
      { f: 'arch', rule: '必须与网元架构一致', msg: '架构不匹配' },
      { f: 'standby', rule: '主备状态必须为双活', msg: '备侧不可用' },
    ],
    humanStates: [
      { id: 'PENDING', label: '待确认', tone: 'signal' },
      { id: 'RESOLVED', label: '已确认', tone: 'ink' },
      { id: 'EXPIRED', label: '已超时', tone: 'danger' },
      { id: 'SKIPPED', label: '已跳过', tone: 'muted' },
    ],
    humanOutcomes: [
      { opt: '确认继续', effect: '跳到 主备倒换', setField: 'humanResult=ok' },
      { opt: '稍后处理', effect: '挂起任务', setField: 'humanResult=hold' },
      { opt: '终止升级', effect: '任务失败回滚', setField: 'humanResult=abort' },
    ],
    topoSel: null,
  };

  /* ---------------------------------------------------------------- API */
  // 桌面壳（Tauri）里页面来自 tauri://localhost，相对 /api 不可用 → 指向本机 W 端
  const IS_TAURI = (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost');
  const API_BASE = IS_TAURI ? 'http://127.0.0.1:9601' : '';

  function apiUrl(path) {
    if (!API_BASE) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return API_BASE + (path.startsWith('/') ? path : '/' + path);
  }

  function headers(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (S.csrf) h['X-CSRF'] = S.csrf;
    return h;
  }
  async function api(path, opts) {
    const r = await fetch(apiUrl(path), Object.assign({ credentials: 'include' }, opts || {}));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.status === 204 ? null : r.json();
  }

  /** 登录门：L 端需要凭据；W 端（authRequired=false）直接放行 */
  async function ensureAuth() {
    const meta = await api('/api/meta').catch(() => null);
    if (meta && meta.authRequired === false) return true;
    // 关键：/api/auth/me 会返回当前会话的 csrf。必须以它为准——
    // 否则同一浏览器里被别的页面（如管理面）重新登录过，sessionStorage 里的旧 csrf 会失效，
    // 所有写操作都会 403（历史 bug：删除接口点两次后报"权限不足"）。
    if (S.csrf) {
      const me = await api('/api/auth/me').catch(() => null);
      if (me && me.user) {
        if (me.csrf && me.csrf !== S.csrf) {
          S.csrf = me.csrf;
          sessionStorage.setItem('rhine.plane.csrf', me.csrf);
        }
        return true;
      }
    }
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'pl-human';
      wrap.id = 'plLogin';
      wrap.innerHTML = `<div class="pl-human__box" style="width:380px">
        <div class="pl-human__hd"><div><div class="pl-human__t">接入业务面</div>
          <div class="pl-human__s">SIGN IN · BUSINESS PLANE</div></div></div>
        <div class="pl-human__bd">
          <div class="pl-field" style="margin-bottom:10px"><label>Username</label><input id="plU" value="viewer" /></div>
          <div class="pl-field" style="margin-bottom:12px"><label>Password</label><input id="plP" type="password" value="rhine-viewer-2026" /></div>
          <button class="pl-btn pl-btn--solid" id="plGo" style="width:100%">登录</button>
          <div class="pl-muted" id="plErr" style="margin-top:8px;font-size:9px;color:#7d2f22"></div>
        </div></div>`;
      document.body.appendChild(wrap);
      const submit = async () => {
        try {
          const data = await api('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: $('#plU').value, password: $('#plP').value }),
          });
          S.csrf = data.csrf;
          sessionStorage.setItem('rhine.plane.csrf', data.csrf);
          wrap.remove();
          resolve(true);
        } catch (e) {
          $('#plErr').textContent = '登录失败：' + e.message;
        }
      };
      $('#plGo').addEventListener('click', submit);
      $('#plP').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  async function loadHuman() {
    try { S.human = await api('/api/business/human-template'); } catch (e) { /* 离线 */ }
      try { S.scenes = await fetch(apiUrl('./scenes/index.json'), { cache: 'no-store' }).then((r) => r.json()); } catch (e) { S.scenes = []; }
    return S.human;
  }

  async function loadLcm() {
    try {
      const [pkgs, cfg] = await Promise.all([
        api('/api/business/packages'),
        api('/api/business/platform'),
      ]);
      if (Array.isArray(pkgs)) S.packages = pkgs;
      if (cfg) S.platform = cfg;
    } catch (e) { /* 离线保留演示数据 */ }
    return { packages: S.packages, platform: S.platform };
  }

  async function loadElements() {
    try {
      const [els, gs] = await Promise.all([
        api('/api/business/elements'),
        api('/api/business/groups'),
      ]);
      if (Array.isArray(els) && els.length) {
        S.elements = els.map((e) => ({
          id: e.id, name: e.name, arch: e.arch,
          type: e.kind, version: e.version, sw: e.software,
          group: e.group, comps: e.components || [],
          prev: (e.prev_versions || [])[0] || '—',
          checks: e.checks || [], flow: e.flow || [],
        }));
      }
      if (Array.isArray(gs) && gs.length) {
        S.groups = gs.map((g) => ({ id: g.id, name: g.name, elements: g.element_ids || [] }));
      }
      if (!S.elements.find((e) => e.id === S.topoSel) && S.elements.length) S.topoSel = S.elements[0].id;
    } catch (e) { /* 离线时保留演示数据 */ }
    return { elements: S.elements, groups: S.groups };
  }

  async function loadAudit() {
    try { S.audit = await api('/api/business/audit?limit=60') || []; } catch (e) { S.audit = []; }
    return S.audit;
  }

  async function loadIfaces() {
    try {
      const list = await api('/api/business/mappings') || [];
      S.ifaces = list.map((m) => ({
        id: m.id,
        method: String(m.method || 'get').toUpperCase(),
        path: m.path,
        status: m.status,
        delay: m.delay_ms,
        rules: (m.fields || []).length,
        human: m.human ? 1 : 0,
        raw: m,
      }));
      list.forEach((m) => {
        S.ifaceRules[m.id] = {
          status: m.status,
          delay: m.delay_ms,
          fields: (m.fields || []).map((f) => ({
            name: f.name, type: f.kind, src: f.source, value: f.value,
            step: f.step, max: f.max, condition: f.condition,
          })),
          human: m.human ? [{
            step: '人工确认',
            prompt: m.human.prompt,
            timeout: 60,
            state: String(m.human.state || 'pending').toUpperCase(),
            options: (m.human.options || []).map((o) => ({ l: o.label, effect: o.effect, set: '—' })),
          }] : [],
          raw: m,
        };
      S.ifaceVariants[m.id] = (m.variants || []).map((v) => Object.assign({}, v));
      });
      if (!S.ifaces.find((x) => x.id === S.ifaceSel) && S.ifaces.length) S.ifaceSel = S.ifaces[0].id;
    } catch (e) { /* 离线时保留本地演示数据 */ }
    return S.ifaces;
  }

  async function loadTasks() {
    try { S.tasks = await api('/api/business/tasks') || []; } catch (e) { S.tasks = []; }
    return S.tasks;
  }

  /** 拉取端点（没有就建一个） */
  async function loadEndpoint() {
    try {
      const list = await api('/api/business/endpoints');
      if (list && list.length) { S.ep = list[0]; return S.ep; }
      S.ep = await api('/api/business/endpoints', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ host: '127.0.0.1', port: 8443, capabilities: [] }),
      });
      return S.ep;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- 导航 */
  const NAV = [
    {
      layer: 'runtime', title: '运行态 · 现在在跑什么', items: [
        { id: 'mock-admin', t: 'MOCK 管理', s: 'PORT', g: '端口' },
        { id: 'mock-flow', t: 'MOCK 流程', s: 'FLOW', g: '流程' },
        { id: 'audit', t: '运行审计', s: 'LOG', g: '审计' },
      ],
    },
    {
      layer: 'prep', title: '准备态 · 定义什么', items: [
        { id: 'elements', t: '网元自定义', s: 'NE', g: '网元' },
        { id: 'topo', t: '拓扑连接', s: 'TOPO', g: '拓扑' },
        { id: 'human', t: '人机交互', s: 'HUMAN-SM', g: '人机' },
        { id: 'omc', t: 'OMC 平台', s: '纳管·账号·升级', g: 'OMC' },
        { id: 'lcm', t: 'LCM 平台', s: '版本·软件包', g: 'LCM' },
        { id: 'fs', t: 'FS 虚层', s: '站点·CPU·校验', g: 'FS' },
      ],
    },
  ];

  const LAYER_HINT = {
    runtime: '端口在跑 · 请求在流动',
    prep: '网元与拓扑 · 平台能力（改完即生效）',
  };
  const LAYER_HOME = { runtime: 'mock-admin', prep: 'elements' };

  function renderRail() {
    // 只渲染当前工作区的导航：切层 = 换一套导航，而不是同一列表换个高亮
    const grp = NAV.find((g) => g.layer === S.layer) || NAV[0];
    const other = S.layer === 'runtime' ? 'prep' : 'runtime';
    $('#plRail').innerHTML = `
      <div class="pl-rail__scroll">
        <div class="pl-rail__grp">
          <div class="pl-rail__hd">${esc(grp.title)}</div>
          ${grp.items.map((it) => `
            <button class="pl-rail__item${S.view === it.id ? ' is-on' : ''}" data-view="${it.id}" title="${esc(it.t)}">
              <span>${esc(it.t)}</span><small>${esc(it.s)}</small>
              <span class="pl-rail__g">${esc(it.g)}</span>
            </button>`).join('')}
        </div>
      </div>
      <button class="pl-rail__jump" id="plJump" title="切换到${other === 'runtime' ? '运行态' : '准备态'}">${other === 'runtime' ? '→ 运行态' : '← 准备态'}</button>
      <button class="pl-rail__toggle" id="plRailToggle" title="折叠/展开侧边栏（Ctrl+B）">
        <i id="plRailIco">‹</i><span>收起</span>
      </button>`;
    // 折叠状态
    const collapsed = S.railCollapsed;
    $('.pl-body').classList.toggle('is-collapsed', !!collapsed);
    const ico = $('#plRailIco');
    if (ico) ico.textContent = collapsed ? '›' : '‹';
    const sp = $('#plRailToggle span');
    if (sp) sp.textContent = collapsed ? '展开' : '收起';

    $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    const jump = $('#plJump');
    if (jump) jump.addEventListener('click', () => go(LAYER_HOME[other], other));
    const tg = $('#plRailToggle');
    if (tg) tg.addEventListener('click', toggleRail);
  }

  /** 折叠/展开侧边栏（记忆到 localStorage） */
  function toggleRail() {
    S.railCollapsed = !S.railCollapsed;
    try { localStorage.setItem('rhine.plane.rail', S.railCollapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    $('.pl-body').classList.toggle('is-collapsed', !!S.railCollapsed);
    const ico = $('#plRailIco');
    if (ico) ico.textContent = S.railCollapsed ? '›' : '‹';
    const sp = $('#plRailToggle span');
    if (sp) sp.textContent = S.railCollapsed ? '展开' : '收起';
  }

  /** 只刷新状态条（运行态每 5s 拉一次审计，不打断正在编辑的表单） */
  function updateBand() {
    const el = document.querySelector('.pl-band');
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = band();
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  }

  function startBandTimer() {
    if (S.bandTimer) { clearInterval(S.bandTimer); S.bandTimer = 0; }
    if (S.layer !== 'runtime') return;
    S.bandTimer = setInterval(async () => {
      if (S.layer !== 'runtime') return;
      try { await loadAudit(); updateBand(); } catch (e) { /* 忽略 */ }
    }, 5000);
  }

  /** 视图跳转：同步工作区 + 视图 + hash */
  function go(view, layer) {
    const v = VIEWS[view] ? view : 'mock-admin';
    S.view = v;
    S.layer = layer || (['mock-admin', 'mock-flow', 'audit'].includes(v) ? 'runtime' : 'prep');
    syncHash();
    render();
    // 进入运行态：立刻补一次审计，状态条才不会停在旧数字
    if (S.layer === 'runtime') loadAudit().then(() => updateBand()).catch(() => {});
  }

  /** URL hash = #/<layer>/<view>：可分享、可后退 */
  function syncHash() {
    const h = '#/' + S.layer + '/' + S.view;
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (e) { location.hash = h; }
    }
  }

  function readHash() {
    const m = /^#\/(runtime|prep)\/([a-z-]+)$/.exec(location.hash || '');
    if (!m) return false;
    if (!VIEWS[m[2]]) return false;
    S.layer = m[1];
    S.view = m[2];
    return true;
  }

  /** 工作区状态条：运行态看"现在在跑什么"，准备态看"定义了什么" */
  function band() {
    const running = !!(S.ep && S.ep.enabled);
    const ep = S.ep || {};
    const hits = (S.audit || []).length;
    const humanPend = (S.audit || []).filter((a) => a.human === 'pending').length;
    const errRate = (S.audit || []).length
      ? Math.round(((S.audit || []).filter((a) => Number(a.status) >= 400).length / (S.audit || []).length) * 100)
      : 0;
    if (S.layer === 'runtime') {
      return `<div class="pl-band">
        <span class="pl-band__k"><i></i>LIVE</span>
        <span class="pl-band__i">端口 <b>${esc((ep.host || '—') + ':' + (ep.port || '—'))}</b></span>
        <span class="pl-band__i ${running ? '' : 'is-warn'}">服务 <b>${running ? '运行中' : '未启动'}</b></span>
        <span class="pl-band__i">近 ${hits} 次请求 · 错误率 <b>${errRate}%</b></span>
        ${humanPend ? `<span class="pl-band__i is-warn">待人工 <b>${humanPend}</b></span>` : ''}
        <span class="pl-band__sp"></span>
        <span>LIVE FEED · 每 5s 刷新</span>
      </div>`;
    }
    const p = S.platform || {};
    const ne = (S.elements || []).length;
    const pkg = (S.packages || []).length;
    return `<div class="pl-band pl-band--draft">
      <span class="pl-band__k"><i></i>DRAFT</span>
      <span class="pl-band__i">站点 <b>${esc(p.site_name || '—')}</b></span>
      <span class="pl-band__i">纳管网元 <b>${ne}</b></span>
      <span class="pl-band__i">软件包 <b>${pkg}</b></span>
      <span class="pl-band__i">共部署 <b>${p.co_deploy ? '开' : '关'}</b></span>
      <span class="pl-band__sp"></span>
      <span>编辑即生效 · 无需重启</span>
    </div>`;
  }

  /* ---------------------------------------------------------------- 通用块 */
  function head(title, sub, file) {
    return `<div class="pl-hd">
      <div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
      <div class="pl-hd__file">${esc(file || '')}</div>
    </div>`;
  }

  /* ---------------------------------------------------------------- 视图：MOCK 管理 */
  function viewMockAdmin() {
    const e = S.ep || { host: '127.0.0.1', port: 8443, capabilities: [], cert: null, enabled: false };
    const caps = e.capabilities || [];
    const step = !e.host ? 1 : !e.cert ? 2 : caps.length === 0 ? 3 : e.enabled ? 4 : 4;
    const steps = ['登记监听', '签发证书', '挂载能力', '开启服务'];
    return head('MOCK 管理', 'Register endpoint · issue certificate · mount capabilities · start', 'FILE NO. MOCK-001') + `
      <div class="pl-steps">
        ${steps.map((t2, i) => `<div class="pl-step${step === i + 1 ? ' is-on' : (step > i + 1 ? ' is-done' : '')}">
          <div class="pl-step__n">STEP ${i + 1}</div><div class="pl-step__t">${esc(t2)}</div></div>`).join('')}
      </div>
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">01 · 注册本机 IP 与端口</div>
          <div class="pl-form">
            <div class="pl-field--row">
              <div class="pl-field"><label>Host / IP</label><input id="epHost" value="${esc(e.host)}" /></div>
              <div class="pl-field"><label>Port</label><input id="epPort" value="${esc(e.port)}" /></div>
            </div>
            <div class="pl-field"><label>挂载平台能力（可多选，写入后端）</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                ${S.caps.map((c) => `<button class="pl-btn pl-btn--sm" data-cap="${esc(c)}"
                  style="${caps.includes(c) ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${esc(c)}</button>`).join('')}
              </div>
            </div>
            <div class="pl-row-end">
              <button class="pl-btn" id="btnSave">保存端点</button>
              <button class="pl-btn" id="btnCert">02 · 生成证书</button>
              <button class="pl-btn pl-btn--solid" id="btnStart">${e.enabled ? '停止服务' : '04 · 开启服务'}</button>
            </div>
          </div>
        </div>
      <div class="pl-card">
        <div class="pl-card__t">场景快照（导出 / 导入）</div>
        <div class="pl-muted" style="font-size:10px;line-height:1.8;margin-bottom:10px">
          把端点、网元、网元组、软件包、平台配置、人机模板、MOCK 规则打包成一个 JSON。换机器演示时导入即可。
        <div class="pl-row-end" style="justify-content:flex-start;gap:8px;margin-bottom:8px">
          <select id="scenePick" style="font:inherit;font-size:10px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);min-width:170px">
            <option value="">— 选择预置教学场景 —</option>
            ${(S.scenes || []).map((s) => `<option value="${esc(s.file)}">${esc(s.name)}</option>`).join('')}
          </select>
          <button class="pl-btn pl-btn--sm" id="btnScenePreset">载入</button>
        </div>
        </div>
        <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
          <button class="pl-btn pl-btn--sm" id="btnSceneExport">↓ 导出场景</button>
          <button class="pl-btn pl-btn--sm" id="btnSceneImport">↑ 导入场景</button>
          <input type="file" id="sceneFile" accept="application/json" style="display:none"/>
          <span class="pl-muted" id="sceneMsg" style="font-size:9px">${esc(S.sceneMsg || '')}</span>
        </div>
      </div>

        <div class="pl-card">
          <div class="pl-card__t">端点状态（服务端）</div>
          <dl class="pl-kv">
            <dt>ID</dt><dd>${esc(e.id || '—')}</dd>
            <dt>Endpoint</dt><dd>${esc(e.host)}:${esc(e.port)}</dd>
            <dt>Service</dt><dd>${e.enabled ? '<span class="pl-dot pl-dot--on"></span>运行中' : '<span class="pl-dot"></span>未启动'}</dd>
            <dt>Certificate</dt><dd>${e.cert ? esc(e.cert.cn) + ' · SAN ' + e.cert.san.length : '<span class="pl-muted">未签发</span>'}</dd>
            <dt>Capabilities</dt><dd>${caps.length ? caps.map((c) => `<span class="pl-tag pl-tag--on">${esc(c)}</span>`).join(' ') : '<span class="pl-muted">未挂载</span>'}</dd>
          </dl>
          <div style="margin-top:12px">
            <div class="pl-card__t" style="margin-bottom:6px">证书内容</div>
            <pre class="pl-muted" style="margin:0;font-size:8px;line-height:1.55;white-space:pre-wrap">${e.cert ? esc(e.cert.pem) : '—'}</pre>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：MOCK 流程 */
  function viewMockFlow() {
    return head('MOCK 流程', 'Response rules · field behaviors · human-in-the-loop · audit', 'FILE NO. MOCK-002') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">接口列表</div>
          <table class="pl-table">
            <thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Delay</th><th>Rules</th><th>Human</th><th></th></tr></thead>
            <tbody>${S.ifaces.map((i) => `<tr>
              <td>${esc(i.method)}</td><td>${esc(i.path)}</td>
              <td class="num">${i.status}</td><td class="num">${i.delay} ms</td>
              <td class="num">${i.rules}</td>
              <td>${i.human ? `<span class="pl-tag pl-tag--on">${i.human}</span>` : '<span class="pl-muted">—</span>'}</td>
              <td style="text-align:right;white-space:nowrap">
                <button class="pl-btn pl-btn--sm" data-iface="${esc(i.id)}">编辑</button>
                <button class="pl-btn pl-btn--sm pl-btn--danger" data-iface-del="${esc(i.id)}" data-armed="0">删除</button>
              </td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">人机交互节点（界面）</div>
          ${(((S.ifaceRules[S.ifaceSel] || {}).human) || []).map((h, i) => `<div style="border:1px solid var(--line);padding:10px;margin-bottom:8px">
            <div style="font-size:8px;letter-spacing:.18em;color:var(--ink-3)">HUMAN STEP ${i + 1}</div>
            <div style="margin:6px 0 8px;font-size:10.5px;line-height:1.7">${esc(h.prompt)}</div>
            <div class="pl-muted" style="font-size:8.5px">超时 ${h.timeout}s · 选项 ${h.options.map((o) => esc(o.l)).join(' / ')}</div>
            <div style="margin-top:8px"><button class="pl-btn pl-btn--sm" id="btnHumanPreview">预览确认界面</button></div>
          </div>`).join('')}
          <button class="pl-btn pl-btn--sm" id="btnHumanAdd">＋ 插入人机交互</button>
        </div>
      </div>
      <div class="pl-card" style="margin-top:14px">
        <div class="pl-card__t">响应字段（面向对象：静态 / 自增 / 单次 / 条件）</div>
        <table class="pl-table">
          <thead><tr><th>Field</th><th>Type</th><th>Behavior</th><th>Param</th><th></th></tr></thead>
          <tbody>${S.fields.map((f, i) => `<tr>
            <td>${esc(f.name)}</td><td>${esc(f.type)}</td>
            <td><select data-field-src="${i}" style="font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)">
              ${['static', 'autoIncrement', 'once', 'conditional'].map((v) => `<option${f.source === v ? ' selected' : ''}>${v}</option>`).join('')}
            </select></td>
            <td class="pl-muted">${esc(f.value || (f.source === 'autoIncrement' ? 'step=' + f.step + ' max=' + f.max : f.condition || '—'))}</td>
            <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-field-del="${i}">移除</button></td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFieldAdd">＋ 添加字段</button></div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：审计 */
  /** 审计统计：状态码分桶 / 延迟 / P95 */
  function auditStats(rows) {
    const bucket = (s) => (s === 202 ? 'HUMAN' : s >= 500 ? '5xx' : s >= 400 ? '4xx' : s >= 300 ? '3xx' : '2xx');
    const counts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, HUMAN: 0 };
    rows.forEach((r) => { const k = bucket(Number(r.status)); counts[k] = (counts[k] || 0) + 1; });
    const delays = rows.map((r) => Number(r.delay_ms) || 0).sort((a, b) => a - b);
    const p95 = delays.length ? delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.95))] : 0;
    const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    const maxDelay = Math.max(1, ...delays);
    return { counts, p95, avg, maxDelay, series: rows.slice(0, 40).reverse() };
  }

  /** 接口健康度：按 path 聚合命中 / 错误率 / 平均延迟 */
  function auditHealth(rows) {
    if (!rows.length) return '';
    const map = new Map();
    rows.forEach((r) => {
      const k = String(r.path || '—');
      const it = map.get(k) || { path: k, hits: 0, errors: 0, delays: [], lastStatus: 0, lastAt: 0 };
      it.hits++;
      const st = Number(r.status) || 0;
      if (st >= 400) it.errors++;
      it.delays.push(Number(r.delay_ms) || 0);
      if ((Number(r.at) || 0) >= it.lastAt) { it.lastAt = Number(r.at) || 0; it.lastStatus = st; }
      map.set(k, it);
    });
    const list = Array.from(map.values()).sort((a, b) => b.hits - a.hits).slice(0, 8);
    const body = list.map((it) => {
      const avg = Math.round(it.delays.reduce((a, b) => a + b, 0) / it.delays.length);
      const rate = Math.round((it.errors / it.hits) * 100);
      const tone = rate === 0 ? 'var(--ink)' : rate < 30 ? '#a0703c' : 'var(--danger)';
      return '<tr>'
        + '<td class="pl-mono" style="font-size:10px">' + esc(it.path) + '</td>'
        + '<td class="num">' + it.hits + '</td>'
        + '<td class="num" style="color:' + tone + ';font-weight:600">' + rate + '%</td>'
        + '<td class="num">' + avg + ' ms</td>'
        + '<td class="num">' + it.lastStatus + '</td>'
        + '</tr>';
    }).join('');
    return '<div class="pl-card"><div class="pl-card__t">接口健康度（按 path 聚合）</div>'
      + '<table class="pl-table"><thead><tr><th>Path</th><th>Hits</th><th>Err</th><th>Avg</th><th>Last</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>';
  }

  /** 审计图表 HTML（概览 / 状态码分布 / 延迟条形） */
  function auditCharts(rows) {
    if (!rows.length) return '';
    const st = auditStats(rows);
    const kv = (label, val, tone) => '<div style="flex:1;min-width:86px">'
      + '<div class="pl-muted" style="font-size:8px;letter-spacing:.18em">' + label + '</div>'
      + '<div style="font:600 18px/1.2 \'JetBrains Mono\',monospace;color:' + (tone || 'var(--ink)') + ';margin-top:4px">' + val + '</div></div>';
    const maxCount = Math.max(1, ...Object.values(st.counts));
    const bars = Object.keys(st.counts).map((k) => {
      const v = st.counts[k];
      const color = k === '5xx' ? 'var(--danger)' : k === '4xx' ? '#a0703c' : k === 'HUMAN' ? 'var(--signal)' : 'var(--ink)';
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">'
        + '<div class="pl-mono" style="font-size:9px;width:46px;color:var(--ink-3)">' + k + '</div>'
        + '<div style="flex:1;height:9px;background:rgba(23,23,19,.06)"><i style="display:block;height:9px;width:'
        + ((v / maxCount) * 100).toFixed(1) + '%;background:' + color + '"></i></div>'
        + '<div class="pl-mono num" style="font-size:9.5px;width:26px;text-align:right">' + v + '</div></div>';
    }).join('');
    const step = 320 / Math.max(st.series.length, 1);
    const rects = st.series.map((r, i) => {
      const d = Number(r.delay_ms) || 0;
      const h = Math.max(1.5, (d / st.maxDelay) * 64);
      const color = Number(r.status) >= 400 ? 'var(--danger)' : r.human ? 'var(--signal)' : 'var(--ink)';
      return '<rect x="' + (i * step).toFixed(1) + '" y="' + (72 - h).toFixed(1) + '" width="'
        + Math.max(2, step - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + color + '" opacity=".82"/>';
    }).join('');
    return '<div class="pl-card"><div class="pl-card__t">概览</div>'
      + '<div style="display:flex;gap:18px;flex-wrap:wrap;padding:2px 0 4px">'
      + kv('HITS', rows.length)
      + kv('AVG DELAY', st.avg + ' ms')
      + kv('P95', st.p95 + ' ms', st.p95 > 500 ? 'var(--danger)' : 'var(--ink)')
      + kv('HUMAN', rows.filter((r) => r.human).length, 'var(--signal)')
      + kv('ERRORS', rows.filter((r) => Number(r.status) >= 400).length, rows.some((r) => Number(r.status) >= 400) ? 'var(--danger)' : 'var(--ink)')
      + '</div></div>'
      + '<div class="pl-grid pl-grid--side">'
      + '<div class="pl-card"><div class="pl-card__t">状态码分布</div>' + bars + '</div>'
      + '<div class="pl-card"><div class="pl-card__t">延迟（最近 ' + st.series.length + ' 次）</div>'
      + '<svg viewBox="0 0 320 74" preserveAspectRatio="none" style="width:100%;height:74px;display:block">'
      + '<line x1="0" y1="72" x2="320" y2="72" stroke="rgba(23,23,19,.18)"/>' + rects + '</svg>'
      + '<div class="pl-muted" style="font-size:8px;letter-spacing:.14em;margin-top:4px">BAR = DELAY MS · 深=成功 琥珀=人机 红=错误</div>'
        + '</div></div>'
        + auditHealth(rows);
  }


  function viewAudit() {
    const rows = Array.isArray(S.audit) ? S.audit : [];
    const tfmt = (ms) => {
      if (!ms) return '—';
      const d = new Date(Number(ms));
      return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    };
    return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + auditCharts(rows) + `
      <div class="pl-card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <div class="pl-card__t" style="margin:0">请求与响应（最近 ${rows.length} 条，服务端记录）</div>
          <button class="pl-btn pl-btn--sm" id="btnAuditRefresh">刷新</button>
        </div>
        ${rows.length ? `<table class="pl-table">
          <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Delay</th><th>Human</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td class="pl-muted pl-mono">${tfmt(r.at)}</td>
            <td>${esc(String(r.method || '').toUpperCase())}</td>
            <td>${esc(r.path)}</td>
            <td class="num ${r.status >= 400 ? 'pl-tag--bad' : ''}">${r.status}</td>
            <td class="num">${r.delay_ms || 0} ms</td>
            <td>${r.human ? `<span class="pl-tag pl-tag--on">HUMAN 202</span>
              <button class="pl-btn pl-btn--sm" data-human-resolve="${esc(r.mapping_id || '')}" style="margin-left:6px">确认</button>` : '<span class="pl-muted">—</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>` : `<div class="pl-muted" style="padding:14px 0;font-size:10px">
          还没有请求记录。开一个 Mock 服务并打一次 <code>/mock/...</code>，这里会出现真实的请求与响应审计。
        </div>`}
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：网元自定义 */
  function viewElements() {
    return head('网元自定义', 'Architecture · type · version · software · upgrade steps · grouping', 'FILE NO. NE-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">网元清单</div>
          <table class="pl-table">
            <thead><tr><th>Name</th><th>Arch</th><th>Type</th><th>Version</th><th>组</th><th></th></tr></thead>
            <tbody>${S.elements.map((e) => `<tr>
              <td>${esc(e.name)}</td><td>${esc(e.arch)}</td><td>${esc(e.type)}</td>
              <td class="num">${esc(e.version)}</td><td class="pl-muted">${esc(e.group || '—')}</td>
              <td style="text-align:right">
                <button class="pl-btn pl-btn--sm" data-ne-detail="${esc(e.id)}">升级流程</button>
                <button class="pl-btn pl-btn--sm" data-ne-copy="${esc(e.id)}">复制</button>
              </td></tr>`).join('')}</tbody>
          </table>
            <div class="pl-row-end" style="gap:6px">
              <button class="pl-btn pl-btn--sm" id="btnGroupAdd">＋ 成组</button>
              <button class="pl-btn pl-btn--sm" id="btnNeForm">＋ 新建网元</button>
            </div>
              ${S.neForm.open ? `<div style="border:1px solid var(--line-2);padding:10px;margin-top:10px">
                <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:8px">新建网元（写入后端）</div>
                <div style="display:grid;grid-template-columns:1.4fr 0.9fr 0.9fr 0.8fr 1fr 1.1fr;gap:6px;margin-bottom:8px">
                  <input id="neName" placeholder="网元名 gNB-HZ-0910" value="${esc(S.neForm.name)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <select id="neArch" style="font:inherit;font-size:10px;padding:4px 6px;background:#fff;border:1px solid var(--line-2)">
                    ${['SA', 'NSA', 'CU-DU', 'EPC'].map((a) => `<option${S.neForm.arch === a ? ' selected' : ''}>${a}</option>`).join('')}
                  </select>
                  <select id="neKind" style="font:inherit;font-size:10px;padding:4px 6px;background:#fff;border:1px solid var(--line-2)">
                    ${['gNB', 'MME', 'UPF', 'AMF', 'SMF'].map((k) => `<option${S.neForm.kind === k ? ' selected' : ''}>${k}</option>`).join('')}
                  </select>
                  <input id="neVersion" placeholder="5.2.1" value="${esc(S.neForm.version)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <input id="neSoftware" placeholder="软件名 NR-RAN" value="${esc(S.neForm.software)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <select id="neGroup" style="font:inherit;font-size:10px;padding:4px 6px;background:#fff;border:1px solid var(--line-2)">
                    ${S.groups.map((g) => `<option value="${esc(g.id)}"${S.neForm.group === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">组件（点选）</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
                  ${['主控板', '交换板', '业务板', '信令板', '电源', '风扇', '时钟板'].map((c) => {
                    const on = S.neForm.comps.includes(c);
                    return `<button class="pl-btn pl-btn--sm" data-ne-comp="${esc(c)}"
                      style="${on ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${esc(c)}</button>`;
                  }).join('')}
                </div>
                <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
                  <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnNeSubmit">创建</button>
                  <button class="pl-btn pl-btn--sm" id="btnNeCancel">取消</button>
                  <span class="pl-muted" id="neFormMsg" style="font-size:9px"></span>
                </div>
              </div>` : ''}
        </div>
        <div class="pl-card">
          <div class="pl-card__t">组件模板（内置）</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${['主控板', '交换板', '业务板', '信令板', '电源', '风扇', '时钟板'].map((c) => `<span class="pl-tag">${esc(c)}</span>`).join(' ')}
          </div>
          <div class="pl-card__t" style="margin-top:14px">升级流程步骤</div>
          <ol style="margin:0;padding-left:18px;font-size:10.5px;line-height:1.9">
            <li>上传软件包 <span class="pl-muted">（校验 checksum）</span></li>
            <li>预检查 <span class="pl-muted">（参数校验：版本兼容 / 主备状态）</span></li>
            <li>激活 <span class="pl-tag pl-tag--on">含人机交互</span></li>
            <li>主备倒换 <span class="pl-tag pl-tag--on">含人机交互</span></li>
            <li>完成与回执</li>
          </ol>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：拓扑 */
  function viewTopo() {
    return head('拓扑连接', 'Site → element group → element → component（正交连线，双击下钻）', 'FILE NO. TOPO-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card" style="padding:0;overflow:hidden">
          <div class="pl-topo" id="topoBox" style="position:relative">
            <svg id="topoSvg" viewBox="0 0 880 430" preserveAspectRatio="xMidYMid meet"></svg>
            <div class="topo-tip" id="topoTip"></div>
            <div id="topo3d" style="position:absolute;inset:0;display:none"></div>
            <div style="position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:3">
              <button class="pl-btn pl-btn--sm" data-dim="2d" id="btn2d">2D</button>
              <button class="pl-btn pl-btn--sm" data-dim="3d" id="btn3d">3D</button>
            </div>
          </div>
          <div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--line)">
            ${['element', 'group', 'component'].map((l) => `<button class="pl-btn pl-btn--sm" data-level="${l}"
              style="${S.topoLevel === l ? 'background:#17140f;color:#f3eee7;border-color:#17140f' : ''}">${
              l === 'element' ? '站点/网元' : l === 'group' ? '网元组' : '组件级'}</button>`).join('')}
            <span class="pl-muted" style="margin-left:auto;font-size:8.5px;align-self:center">双击节点下钻</span>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">选中对象</div>
          <div id="topoDetail" class="pl-muted" style="font-size:10px;line-height:1.9">在左侧点击节点查看详情</div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：平台能力 */
  function viewPlatforms() {
    return head('平台能力', 'LCM 管版本 · OMC 管升级 · FS 为独立支线', 'FILE NO. PLAT-001') + `
      <div class="pl-grid pl-grid--3">
        <div class="pl-card">
          <div class="pl-card__t">LCM · 生命周期</div>
          <dl class="pl-kv">
            <dt>纳管网元</dt><dd>${S.elements.length} 个</dd>
            <dt>软件包</dt><dd>6 个 · 3 厂商</dd>
            <dt>共部署</dt><dd>可与 OMC 同机部署</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:12px">软件包（类型/厂商/版本）</div>
          <table class="pl-table"><tbody>
            <tr><td>NR-RAN 5.2.1</td><td class="pl-muted">华为</td><td class="num">已验证</td></tr>
            <tr><td>NR-RAN 5.2.0</td><td class="pl-muted">华为</td><td class="num">历史版本</td></tr>
            <tr><td>EPC-CORE 4.8.4</td><td class="pl-muted">中兴</td><td class="num">已验证</td></tr>
          </tbody></table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">OMC · 运维</div>
          <dl class="pl-kv">
            <dt>纳管网元</dt><dd>${S.groups.length} 组 / ${S.elements.length} 网元</dd>
            <dt>账号</dt><dd>2 个（按网元范围授权）</dd>
            <dt>站点</dt><dd>
              <input id="siteName" value="${esc((S.platform && S.platform.site_name) || S.site.name)}"
                style="font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2);width:120px"/>
              <select id="siteRole" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2);margin-left:4px">
                ${['primary', 'secondary'].map((r) => `<option${(((S.platform && S.platform.site_role) || S.site.role) === r) ? ' selected' : ''}>${r}</option>`).join('')}
              </select>
              <button class="pl-btn pl-btn--sm" id="btnSiteSave" style="margin-left:6px">保存</button>
            </dd>
          </dl>
          <div class="pl-card__t" style="margin-top:12px">一体化升级任务</div>
          <table class="pl-table"><tbody>
            <tr><td>UPG-0091</td><td class="pl-muted">gNB ×2</td><td>5.2.0 → 5.2.1</td></tr>
            <tr><td>UPG-0090</td><td class="pl-muted">MME ×1</td><td>4.8.4 → 4.8.5</td></tr>
          </tbody></table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">FS · 虚层（独立支线）</div>
          <dl class="pl-kv">
            <dt>CPU 数量</dt><dd>16 vCPU</dd>
            <dt>站点</dt><dd>主 HZ / 备 NB</dd>
            <dt>平台版本</dt><dd>2.4.0</dd>
            <dt>包校验</dt><dd>checksum + 签名</dd>
          </dl>
          <div style="margin-top:12px"><button class="pl-btn pl-btn--sm" id="btnFsFlow">查看升级流程</button></div>
        </div>
      </div>`;
  }



  function viewTask() {
    const t2 = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
    if (!t2) {
      return head('升级任务', 'Integrated upgrade · stages · human-in-the-loop', 'FILE NO. UPG') + `
        <div class="pl-card"><div class="pl-muted" style="font-size:10px;padding:10px 0">
          还没有升级任务。到「OMC 平台」或「LCM 平台」发起一次升级，或在下面直接建一个。
        </div>
        <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div></div>`;
    }
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起（等人确认）' };
    const nodeColor = (st) => st === 'done' ? 'var(--signal)' : st === 'running' ? 'var(--ink)' : st === 'failed' ? '#7d2f22' : st === 'held' ? '#a67d48' : 'var(--line-2)';
    const pendingIdx = t2.stages.findIndex((st) => st.human && st.human.state === 'pending');
    return head('升级任务 · ' + t2.id, 'Stage timeline · human-in-the-loop state machine', 'FILE NO. ' + t2.id) + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">阶段时间线（人工确认内联在阶段里）</div>
          <div style="position:relative;padding-left:22px">
            <div style="position:absolute;left:5px;top:8px;bottom:8px;width:1px;background:var(--line-2)"></div>
            ${t2.stages.map((st, i) => `
              <div style="position:relative;padding:0 0 16px 8px">
                <div style="position:absolute;left:-21px;top:4px;width:9px;height:9px;background:${nodeColor(st.state)}"></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
                  <b style="font-size:11.5px">${i + 1}. ${esc(st.label)}</b>
                  <span class="pl-tag ${st.state === 'done' ? 'pl-tag--on' : st.state === 'failed' ? 'pl-tag--bad' : ''}">${esc(ST[st.state] || st.state)}</span>
                </div>
                ${st.human && st.human.state === 'pending' && st.state === 'running' ? `
                  <div style="border:1px solid var(--signal);background:rgba(166,125,72,.07);padding:11px;margin-top:8px">
                    <div style="font-size:8px;letter-spacing:.2em;color:#8a6a3c">HUMAN · PENDING · 超时 ${st.human.timeout_s}s</div>
                    <div style="margin:7px 0 9px;font-size:11px;line-height:1.75">${esc(st.human.prompt)}</div>
                    <div style="display:grid;gap:6px">
                      ${st.human.options.map((o, oi) => `<button class="pl-human__opt" data-human-opt="${oi}">
                        <span>${esc(o.label)}</span><small>EFFECT · ${esc(o.effect)}</small></button>`).join('')}
                    </div>
                  </div>` : ''}
                ${st.human && st.human.state === 'expired' ? `
                  <div style="border:1px solid #7d2f22;background:rgba(125,47,34,.05);padding:11px;margin-top:8px">
                    <div style="font-size:8px;letter-spacing:.2em;color:#7d2f22">HUMAN · EXPIRED · 超时 ${st.human.timeout_s}s</div>
                    <div style="margin:7px 0 9px;font-size:11px;line-height:1.75">${esc(st.human.prompt)}</div>
                    <button class="pl-btn pl-btn--sm" data-human-retry="${esc(t2.id)}">重新发起确认</button>
                  </div>` : ''}
                ${st.human && st.human.state !== 'pending' && st.human.state !== 'expired' ? `
                  <div class="pl-muted" style="font-size:8.5px;margin-top:4px">
                    人机交互 · ${esc(st.human.state)}${st.human.chosen !== undefined && st.human.chosen !== null ? ' · 选择第 ' + (st.human.chosen + 1) + ' 项' : ''}
                  </div>` : ''}
              </div>`).join('')}
          </div>
          <div style="height:2px;background:var(--line-2);margin-top:2px">
            <i style="display:block;height:2px;width:${t2.progress}%;background:var(--signal);transition:width .3s ease"></i>
          </div>
          <div class="pl-muted" style="font-size:8.5px;margin-top:6px">
            进度 ${t2.progress}% · v${esc(t2.from_version)} → v${esc(t2.to_version)} · 站点 ${esc(t2.site)} · 网元 ${t2.element_ids.length} 个
            ${pendingIdx >= 0 ? ' · 卡在第 ' + (pendingIdx + 1) + ' 段待确认' : ''}
          </div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">任务摘要</div>
          <dl class="pl-kv">
            <dt>Task</dt><dd>${esc(t2.id)}</dd>
            <dt>Site</dt><dd>${esc(t2.site)}</dd>
            <dt>Elements</dt><dd>${t2.element_ids.length} 个</dd>
            <dt>Version</dt><dd>v${esc(t2.from_version)} → v${esc(t2.to_version)}</dd>
            <dt>Stage</dt><dd>${(t2.stage || 0) + 1} / ${t2.stages.length}</dd>
            <dt>Human</dt><dd>${pendingIdx >= 0 ? '<span class="pl-tag pl-tag--on">PENDING</span>' : '<span class="pl-muted">无待确认</span>'}</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">所有任务</div>
          <table class="pl-table"><tbody>
            ${S.tasks.map((x) => `<tr>
              <td>${esc(x.id)}</td>
              <td class="pl-muted">${esc(x.stages[x.stage] ? x.stages[x.stage].key : '—')}</td>
              <td class="num">${x.progress}%</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-task="${esc(x.id)}">查看</button></td>
            </tr>`).join('')}
          </tbody></table>
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskDemo">▶ 演示一次完整升级</button>
            <button class="pl-btn pl-btn--sm" id="btnTaskPurge">清理已完成</button>
            <button class="pl-btn pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：人机交互状态机 */

  /* ---------------------------------------------------------------- 视图：OMC */

  /* ---------------------------------------------------------------- 视图：LCM */

  /* ---------------------------------------------------------------- 视图：FS */

  /* ---------------------------------------------------------------- 视图：网元详情（升级流程 + 参数校验 + 人机交互） */

  /* ---------------------------------------------------------------- 视图：人机交互状态机 */
  function viewHuman() {
    const h = S.human || {
      states: [
        { id: 'PENDING', label: '待确认', tone: 'signal' },
        { id: 'RESOLVED', label: '已确认', tone: 'ink' },
        { id: 'EXPIRED', label: '已超时', tone: 'danger' },
        { id: 'SKIPPED', label: '已跳过', tone: 'muted' },
      ],
      outcomes: [
        { option: '确认继续', effect: 'continue', to: 'RESOLVED', set_field: 'humanResult=ok' },
        { option: '稍后处理', effect: 'hold', to: 'PENDING', set_field: 'humanResult=hold' },
        { option: '终止升级', effect: 'abort', to: 'EXPIRED', set_field: 'humanResult=abort' },
      ],
    };
    const toneColor = { signal: '#a67d48', ink: '#171713', danger: '#7d2f22', muted: '#8e897b' };
    const W = 760, H = 260;
    const p = h.states.find((s) => s.id === 'PENDING') || { id: 'PENDING' };
    const nodes = [
      { id: p.id, x: 90, y: 120, label: (h.states.find((s) => s.id === p.id) || {}).label || '待确认', tone: 'signal' },
    ];
    // 其余状态排右侧
    const rest = h.states.filter((s) => s.id !== p.id);
    const stepY = (H - 70) / Math.max(1, rest.length - 1 || 1);
    rest.forEach((s, i) => nodes.push({ id: s.id, x: 520, y: 45 + i * (rest.length > 1 ? stepY : 0), label: s.label, tone: s.tone }));
    const nodeById = (id) => nodes.find((n) => n.id === id);
    return head('人机交互', 'Human-in-the-loop state machine · editable states & outcomes', 'FILE NO. HUMAN-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card" style="padding:0;overflow:hidden">
          <div class="pl-card__t" style="padding:12px 16px 0">状态机</div>
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a67d48"></path>
              </marker>
            </defs>
            ${h.outcomes.map((o) => {
              const from = nodeById(p.id);
              const to = nodeById(o.to) || from;
              const mx = (from.x + to.x) / 2;
              const d = from.id === to.id
                ? `M ${from.x + 60} ${from.y} C ${from.x + 120} ${from.y - 70}, ${from.x + 120} ${from.y + 70}, ${from.x + 60} ${from.y}`
                : `M ${from.x + 62} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x - 62} ${to.y}`;
              return `<path d="${d}" fill="none" stroke="#a67d48" stroke-width="1.2" marker-end="url(#arrow)" opacity="0.85"/>
                <text x="${mx}" y="${(from.y + to.y) / 2 - 8}" font-size="9" fill="#8a6a3c" text-anchor="middle" font-family="JetBrains Mono,monospace">${esc(o.option)}</text>`;
            }).join('')}
            ${nodes.map((n) => `<g>
              <rect x="${n.x - 62}" y="${n.y - 22}" width="124" height="44" fill="#f6f1ea" stroke="${toneColor[n.tone] || '#171713'}" stroke-width="1.2"/>
              <text x="${n.x}" y="${n.y - 4}" font-size="10" fill="#171713" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="600">${esc(n.id)}</text>
              <text x="${n.x}" y="${n.y + 11}" font-size="9" fill="#8e897b" text-anchor="middle" font-family="JetBrains Mono,monospace">${esc(n.label)}</text>
            </g>`).join('')}
          </svg>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">状态（可增删改）</div>
          <table class="pl-table">
            <thead><tr><th>ID</th><th>Label</th><th>Tone</th><th></th></tr></thead>
            <tbody>${h.states.map((s, i) => `<tr>
              <td><input data-st-id="${i}" value="${esc(s.id)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-st-label="${i}" value="${esc(s.label)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><select data-st-tone="${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                ${['signal', 'ink', 'danger', 'muted'].map((v) => `<option${s.tone === v ? ' selected' : ''}>${v}</option>`).join('')}
              </select></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-st-del="${i}">移除</button></td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnStateAdd">＋ 状态</button></div>
        </div>
      </div>

      <div class="pl-card" style="margin-top:14px">
        <div class="pl-card__t">操作结果（option → effect → 目标状态）</div>
        <table class="pl-table">
          <thead><tr><th>Option</th><th>Effect</th><th>To state</th><th>Set field</th><th></th></tr></thead>
          <tbody>${h.outcomes.map((o, i) => `<tr>
            <td><input data-oc-opt="${i}" value="${esc(o.option)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
            <td><select data-oc-eff="${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
              ${['continue', 'hold', 'abort'].map((v) => `<option${o.effect === v ? ' selected' : ''}>${v}</option>`).join('')}
            </select></td>
            <td><select data-oc-to="${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
              ${h.states.map((s) => `<option${o.to === s.id ? ' selected' : ''}>${esc(s.id)}</option>`).join('')}
            </select></td>
            <td><input data-oc-set="${i}" value="${esc(o.set_field || '')}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
            <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-oc-del="${i}">移除</button></td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="pl-row-end">
          <span class="pl-muted" id="humanMsg" style="margin-right:auto;font-size:9px"></span>
          <button class="pl-btn pl-btn--sm" id="btnOutcomeAdd">＋ 操作结果</button>
          <button class="pl-btn pl-btn--solid" id="btnHumanSave">保存状态机</button>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：OMC */
  function viewOmc() {
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起（等人确认）' };
    const cfg = S.platform || { omc_elements: [], omc_groups: [], accounts: [] };
    const managed = cfg.omc_elements && cfg.omc_elements.length ? cfg.omc_elements : S.omc.elements;
    const accounts = cfg.accounts && cfg.accounts.length ? cfg.accounts : S.omc.accounts;
    return head('OMC 平台', 'Managed elements · accounts · integrated upgrade task with site', 'FILE NO. OMC-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">纳管网元（点选切换，写回后端）</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            ${S.elements.map((el) => `<button class="pl-btn pl-btn--sm" data-omc-el="${esc(el.id)}"
              style="${managed.includes(el.id) ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${esc(el.name)}</button>`).join('')}
          </div>
          <dl class="pl-kv">
            <dt>纳管数量</dt><dd>${managed.length} / ${S.elements.length}</dd>
            <dt>网元组</dt><dd>${(cfg.omc_groups || []).length ? cfg.omc_groups.join(' · ') : '—'}</dd>
            <dt>站点</dt><dd>
              <input id="siteName" value="${esc((S.platform && S.platform.site_name) || S.site.name)}"
                style="font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2);width:120px"/>
              <select id="siteRole" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2);margin-left:4px">
                ${['primary', 'secondary'].map((r) => `<option${(((S.platform && S.platform.site_role) || S.site.role) === r) ? ' selected' : ''}>${r}</option>`).join('')}
              </select>
              <button class="pl-btn pl-btn--sm" id="btnSiteSave" style="margin-left:6px">保存</button>
            </dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">账号（按网元范围授权）</div>
          <table class="pl-table">
              <thead><tr><th>Account</th><th>Role</th><th>Scope</th><th></th></tr></thead>
              <tbody>${accounts.map((a, i) => `<tr style="cursor:pointer${S.accSel === i ? ';background:rgba(166,125,72,.08)' : ''}" data-acc-row="${i}">
                <td>${esc(a.name)}</td><td>${esc(a.role)}</td>
                <td class="pl-muted">${(a.scope || []).length} 个网元</td>
                <td style="text-align:right"><span class="pl-tag ${S.accSel === i ? 'pl-tag--on' : ''}">${S.accSel === i ? '编辑中' : '授权'}</span></td></tr>`).join('')}</tbody>
            </table>

            ${accounts[S.accSel] ? `<div style="border:1px solid var(--line-2);padding:10px;margin-top:10px">
              <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">
                授权范围 · ${esc(accounts[S.accSel].name)}（点选网元写入 scope）
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
                ${S.elements.map((el) => {
                  const on = (accounts[S.accSel].scope || []).includes(el.id);
                  return `<button class="pl-btn pl-btn--sm" data-acc-scope="${esc(el.id)}"
                    style="${on ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${esc(el.name)}</button>`;
                }).join('')}
              </div>
              <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
                <button class="pl-btn pl-btn--sm" id="btnAccAll">全选纳管网元</button>
                <button class="pl-btn pl-btn--sm" id="btnAccNone">清空</button>
                <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnAccSave">保存授权</button>
                <span class="pl-muted" id="accMsg" style="font-size:9px"></span>
              </div>
            </div>` : ''}
          <div style="display:flex;gap:6px;margin-top:10px">
            <input id="accName" placeholder="账号名" style="flex:1;font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
            <select id="accRole" style="font:inherit;font-size:10px;padding:4px;background:#fff;border:1px solid var(--line-2)">
              <option>运维</option><option>只读</option><option>管理员</option>
            </select>
            <button class="pl-btn pl-btn--sm" id="btnAccAdd">创建账号</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">一体化升级任务（点击进入时间线）</div>
          ${S.tasks.length ? S.tasks.slice(0, 6).map((k) => {
            const cur = k.stages[k.stage] || {};
            const pending = cur.human && cur.human.state === 'pending';
            return `<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px;cursor:pointer" data-task="${esc(k.id)}">
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <b style="font-size:11.5px">${esc(k.id)}</b>
                <span class="pl-tag ${pending ? 'pl-tag--on' : ''}">${esc(ST[cur.state] || cur.state || '—')}</span>
              </div>
              <div class="pl-muted" style="font-size:9px;margin:6px 0">
                站点 ${esc(k.site)} · 网元 ${k.element_ids.length} 个 · v${esc(k.from_version)} → v${esc(k.to_version)}
              </div>
              <div style="height:2px;background:var(--line-2)"><i style="display:block;height:2px;width:${k.progress}%;background:var(--signal)"></i></div>
              <div class="pl-muted" style="font-size:8.5px;margin-top:6px">进度 ${k.progress}%${pending ? ' · 卡在人工确认' : ''}</div>
            </div>`;
          }).join('') : '<div class="pl-muted" style="font-size:10px;padding:6px 0">还没有任务，点下面创建。</div>'}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskAdd">＋ 创建升级任务</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：LCM */
  function viewLcm() {
    const l = S.lcm;
    const pkgs = (S.packages && S.packages.length) ? S.packages : l.packages;
    const byId = (id) => (S.elements.find((x) => x.id === id) || {}).name || id;
    const co = S.platform ? !!S.platform.co_deploy : l.coDeploy;
    return head('LCM 平台', 'Element versions · software packages · co-deploy with OMC', 'FILE NO. LCM-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">管理的网元与当前版本</div>
          <table class="pl-table">
            <thead><tr><th>Element</th><th>Software</th><th>Current</th><th>Prev</th><th></th></tr></thead>
            <tbody>${S.elements.map((el) => `<tr>
              <td>${esc(el.name)}</td><td class="pl-muted">${esc(el.sw)}</td>
              <td class="num">v${esc(el.version)}</td>
              <td class="pl-muted num">${esc(el.prev || '—')}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-for="${esc(el.id)}">软件包</button></td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end" style="align-items:center">
            <span class="pl-muted" style="font-size:8.5px;margin-right:auto">与 OMC 共部署：${co ? '<span class="pl-dot pl-dot--on"></span>已开启' : '未开启'}</span>
            <button class="pl-btn pl-btn--sm" id="btnCoDeploy">${co ? '关闭共部署' : '开启共部署'}</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">软件包仓库（点「升级」直接生成 OMC 任务）</div>
          <table class="pl-table">
            <thead><tr><th>Package</th><th>类型</th><th>所属网元</th><th>厂商</th><th>版本</th><th></th></tr></thead>
            <tbody>${pkgs.map((p) => `<tr>
              <td>${esc(p.name)}</td><td class="pl-muted">${esc(p.kind)}</td>
              <td class="pl-muted">${esc(byId(p.owner))}</td>
              <td class="pl-muted">${esc(p.vendor)}</td><td class="num">v${esc(p.version)}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-up="${esc(p.id)}" data-pkg-ver="${esc(p.version)}">升级</button></td>
            </tr>`).join('')}</tbody>
          </table>
              <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
                <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">登记软件包（写入后端）</div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr 1.1fr 1fr 0.8fr auto;gap:6px;align-items:center">
                  <input id="pkgName" placeholder="包名 NR-RAN" value="${esc(S.pkgDraft.name)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <select id="pkgKind" style="font:inherit;font-size:10px;padding:4px 6px;background:#fff;border:1px solid var(--line-2)">
                    ${['网元软件包', '补丁包', '驱动包', '配置文件包'].map((k) => `<option${S.pkgDraft.kind === k ? ' selected' : ''}>${k}</option>`).join('')}
                  </select>
                  <select id="pkgOwner" style="font:inherit;font-size:10px;padding:4px 6px;background:#fff;border:1px solid var(--line-2)">
                    ${S.elements.map((el) => `<option value="${esc(el.id)}"${S.pkgDraft.owner === el.id ? ' selected' : ''}>${esc(el.name)}</option>`).join('')}
                  </select>
                  <input id="pkgVendor" placeholder="厂商" value="${esc(S.pkgDraft.vendor)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <input id="pkgVersion" placeholder="5.2.2" value="${esc(S.pkgDraft.version)}"
                    style="font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnPkgSubmit">登记</button>
                </div>
                <div class="pl-muted" id="pkgMsg" style="font-size:9px;margin-top:6px"></div>
              </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：FS */
  function viewFs() {
    const f = Object.assign({}, S.fs, (S.platform && S.platform.fs) ? {
      cpus: S.platform.fs.cpus,
      sitePrimary: S.platform.fs.site_primary,
      siteSecondary: S.platform.fs.site_secondary,
      platformVersion: S.platform.fs.version,
      verifySteps: S.platform.fs.verify_steps,
      upgrade: S.platform.fs.upgrade_steps,
      verifyRuns: S.platform.fs.verify_runs || [],
    } : {});
    const runs = f.verifyRuns || [];
    const runOf = (step) => runs.find((r) => r.step === step);
    const tone = (st) => st === 'pass' ? 'pl-tag--on' : st === 'fail' ? 'pl-tag--bad' : '';
    const tfmt = (ms) => ms ? new Date(Number(ms)).toTimeString().slice(0, 8) : '';
    const fails = runs.filter((r) => r.status === 'fail').length;
    return head('FS 虚层平台', 'CPU · primary/secondary site · platform version · package verification', 'FILE NO. FS-001') + `
      <div class="pl-grid pl-grid--3">
        <div class="pl-card">
          <div class="pl-card__t">平台配置</div>
          <dl class="pl-kv">
            <dt>CPU</dt><dd>${f.cpus} vCPU</dd>
            <dt>主站点</dt><dd>${esc(f.sitePrimary)}</dd>
            <dt>备站点</dt><dd>${esc(f.siteSecondary)}</dd>
            <dt>平台版本</dt><dd>v${esc(f.platformVersion)}</dd>
          </dl>
        </div>
        <div class="pl-card">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="pl-card__t" style="margin:0">软件包校验流程</div>
            <button class="pl-btn pl-btn--sm" id="btnFsVerify">执行校验</button>
          </div>
          <div style="margin-top:10px">
            ${(f.verifySteps || []).map((st, i) => {
              const r = runOf(st);
              return `<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px dotted var(--line)">
                <span style="width:14px;text-align:center;color:${r && r.status === 'pass' ? '#a67d48' : r && r.status === 'fail' ? '#7d2f22' : 'var(--ink-3)'}">
                  ${r && r.status === 'pass' ? '✓' : r && r.status === 'fail' ? '✕' : '○'}
                </span>
                <div style="flex:1">
                  <div style="font-size:10.5px">${i + 1}. ${esc(st)}</div>
                  ${r ? `<div class="pl-muted" style="font-size:8.5px;margin-top:2px">${esc(r.note)} · ${tfmt(r.at)}</div>` : ''}
                </div>
                ${r ? `<span class="pl-tag ${tone(r.status)}">${esc(r.status.toUpperCase())}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
          ${runs.length ? `<div class="pl-muted" style="font-size:8.5px;margin-top:8px">
            最近一次：${runs.length} 步 · 失败 ${fails} 项 ${fails ? '· 已中断' : '· 全部通过'}
          </div>` : '<div class="pl-muted" style="font-size:8.5px;margin-top:8px">尚未执行校验</div>'}
        </div>
        <div class="pl-card">
          <div class="pl-card__t">平台升级流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            ${(f.upgrade || []).map((st) => `<li>${esc(st)}</li>`).join('')}
          </ol>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFsUpgrade">演练一次</button></div>
        </div>
          ${''}
          <div class="pl-card" style="grid-column:1/-1">
            <div class="pl-card__t">定制平台配置与流程（写入后端）</div>
            <div style="display:grid;grid-template-columns:0.7fr 1fr 1fr 0.7fr auto;gap:8px;align-items:end;margin-bottom:12px">
              <div class="pl-field"><label>CPU 数量</label>
                <input id="fsCpus" type="number" min="1" value="${f.cpus}"
                  style="font:inherit;font-size:11px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);width:100%"/></div>
              <div class="pl-field"><label>主站点</label>
                <input id="fsPrimary" value="${esc(f.sitePrimary)}"
                  style="font:inherit;font-size:11px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);width:100%"/></div>
              <div class="pl-field"><label>备站点</label>
                <input id="fsSecondary" value="${esc(f.siteSecondary)}"
                  style="font:inherit;font-size:11px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);width:100%"/></div>
              <div class="pl-field"><label>平台版本</label>
                <input id="fsVersion" value="${esc(f.platformVersion)}"
                  style="font:inherit;font-size:11px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);width:100%"/></div>
              <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnFsSave">保存配置</button>
            </div>

            <div class="pl-grid pl-grid--side">
              <div>
                <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">软件包校验流程（可增删）</div>
                ${(f.verifySteps || []).map((st, i) => `<div style="display:flex;gap:6px;margin-bottom:5px">
                  <input data-fs-verify="${i}" value="${esc(st)}"
                    style="flex:1;font:inherit;font-size:10px;padding:4px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <button class="pl-btn pl-btn--sm" data-fs-verify-del="${i}">删除</button>
                </div>`).join('')}
                <button class="pl-btn pl-btn--sm" id="btnFsVerifyAdd">＋ 校验步骤</button>
              </div>
              <div>
                <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">平台升级流程（可增删）</div>
                ${(f.upgrade || []).map((st, i) => `<div style="display:flex;gap:6px;margin-bottom:5px">
                  <input data-fs-upgrade="${i}" value="${esc(st)}"
                    style="flex:1;font:inherit;font-size:10px;padding:4px 7px;background:#fff;border:1px solid var(--line-2)"/>
                  <button class="pl-btn pl-btn--sm" data-fs-upgrade-del="${i}">删除</button>
                </div>`).join('')}
                <button class="pl-btn pl-btn--sm" id="btnFsUpgradeAdd">＋ 升级步骤</button>
              </div>
            </div>
            <div class="pl-row-end" style="align-items:center;margin-top:10px">
              <span class="pl-muted" id="fsMsg" style="font-size:9px;margin-right:auto"></span>
              <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnFsSaveFlow">保存流程</button>
            </div>
          </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：网元详情（升级流程 + 参数校验 + 人机交互） */
  function viewNeDetail() {
    const el = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
    if (!S.neDraft || S.neDraft.__id !== el.id) {
      S.neDraft = {
        __id: el.id,
        flow: (el.flow && el.flow.length ? el.flow : [
          { step: '上传软件包', human: false },
          { step: '预检查（参数校验）', human: false },
          { step: '激活', human: true },
          { step: '主备倒换', human: true },
          { step: '完成与回执', human: false },
        ]).map((x) => ({ step: x.step || '', human: !!x.human })),
        checks: (el.checks || []).map((c) => ({ field: c.field || '', rule: c.rule || '', msg: c.msg || '' })),
      };
    }
    const d = S.neDraft;
    return head('网元 · ' + el.name, 'Upgrade flow · parameter validation · human-in-the-loop', 'FILE NO. NE-002') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">升级流程步骤（可增删 · 点开关挂人机交互 · 保存到后端）</div>
          <table class="pl-table">
            <thead><tr><th>#</th><th>Step</th><th>Human</th><th></th></tr></thead>
            <tbody>${d.flow.map((st, i) => `<tr>
              <td class="num">${i + 1}</td>
              <td><input data-flow-step="${i}" value="${esc(st.step)}" style="width:100%;font:inherit;font-size:10.5px;padding:3px 5px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><button class="pl-btn pl-btn--sm" data-flow-human="${i}" style="${st.human ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${st.human ? '含确认' : '—'}</button></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-flow-del="${i}">删除</button></td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFlowAdd">＋ 步骤</button></div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">参数校验规则（可编辑）</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Rule</th><th>Fail</th><th></th></tr></thead>
            <tbody>${d.checks.map((c, i) => `<tr>
              <td><input data-chk-field="${i}" value="${esc(c.field)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-chk-rule="${i}" value="${esc(c.rule)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-chk-msg="${i}" value="${esc(c.msg)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-chk-del="${i}">删除</button></td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnChkAdd">＋ 校验</button></div>
          <div class="pl-card__t" style="margin-top:14px">版本</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="pl-tag pl-tag--on">v${esc(el.version)}（当前）</span>
            ${(el.prev && el.prev !== '—') ? `<span class="pl-tag">v${esc(el.prev)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="pl-row-end" style="margin-top:14px">
        <span class="pl-muted" id="neMsg" style="margin-right:auto;font-size:9px"></span>
        <button class="pl-btn" id="btnNeBack">返回列表</button>
        <button class="pl-btn pl-btn--solid" id="btnNeSave">保存到网元</button>
      </div>`;
  }




  /* ---------------------------------------------------------------- 视图：升级任务时间线 */

  /* ---------------------------------------------------------------- 视图：接口规则编辑器 */
  function viewIface() {
    const id = S.ifaceSel;
    const base = S.ifaces.find((x) => x.id === id) || S.ifaces[0];
    const r = S.ifaceRules[id] || (S.ifaceRules[id] = { status: base.status, delay: base.delay, fields: [], human: [] });
    const SRC_LABEL = { static: '静态值', autoIncrement: '自增', once: '单次生效', condition: '条件表达式' };
    return head('接口 · ' + base.method + ' ' + base.path, 'Response rules · field behaviors · human-in-the-loop', 'FILE NO. FLOW-002') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">响应基础</div>
          <div class="pl-form">
            <div class="pl-field--row">
              <div class="pl-field"><label>HTTP Status</label>
                <select id="ifStatus">${[200, 201, 202, 204, 400, 401, 403, 404, 500, 503].map((s) => `<option${r.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
              </div>
              <div class="pl-field"><label>Delay (ms)</label><input id="ifDelay" value="${r.delay}" /></div>
            </div>
            <div class="pl-field"><label>Content-Type</label><input value="application/json" readonly /></div>
          </div>

          <div class="pl-card__t">多规则匹配（按顺序，首个条件命中即生效）</div>
          <table class="pl-table">
            <thead><tr><th>条件（req.mode=="fast"，留空=兜底）</th><th>Status</th><th>Delay</th><th>响应体</th><th>备注</th><th></th></tr></thead>
            <tbody>
              ${((S.ifaceVariants[id]) || []).map((v, i) => `<tr>
                <td><input data-var-when="${i}" value="${esc(v.when || '')}" placeholder='req.mode=="fast"' style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-status="${i}" value="${v.status == null ? '' : v.status}" style="width:54px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-delay="${i}" value="${v.delay_ms == null ? '' : v.delay_ms}" style="width:56px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-body="${i}" value="${esc(v.body || '')}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-note="${i}" value="${esc(v.note || '')}" style="width:64px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-var-del="${i}">删除</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnVarAdd">＋ 规则</button></div>

          <div class="pl-card__t" style="margin-top:16px">响应字段（对象化管理）</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Type</th><th>Behavior</th><th>Param</th><th></th></tr></thead>
            <tbody>
              ${r.fields.map((f, i) => `<tr>
                <td>${esc(f.name)}</td>
                <td><select data-fld-type="${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                  ${['string', 'number', 'boolean', 'object', 'array'].map((ty) => `<option${f.type === ty ? ' selected' : ''}>${ty}</option>`).join('')}
                </select></td>
                <td><select data-fld-src="${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                  ${Object.keys(SRC_LABEL).map((k) => `<option value="${k}"${f.src === k ? ' selected' : ''}>${SRC_LABEL[k]}</option>`).join('')}
                </select></td>
                <td class="pl-muted" style="font-size:9px">
                  ${f.src === 'autoIncrement'
                    ? 'step=' + f.step + ' · max=' + f.max
                    : f.src === 'condition' ? esc(f.value || '') : esc(f.value || '—')}
                </td>
                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-fld-del="${i}">移除</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="ifFldAdd">＋ 添加字段</button></div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">人机交互节点（可自定义状态与操作结果）</div>
          ${r.human.length ? r.human.map((h, hi) => `<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <b style="font-size:11px">${esc(h.step)}</b>
              <span class="pl-tag pl-tag--on">${esc(h.state)}</span>
            </div>
            <div style="margin:6px 0;font-size:10.5px;line-height:1.7">${esc(h.prompt)}</div>
            <div class="pl-muted" style="font-size:8.5px">超时 ${h.timeout}s</div>
            <table class="pl-table" style="margin-top:6px">
              <thead><tr><th>Option</th><th>Effect</th><th>Set field</th></tr></thead>
              <tbody>${h.options.map((o) => `<tr><td>${esc(o.l)}</td><td>${esc(o.effect)}</td><td class="pl-muted">${esc(o.set)}</td></tr>`).join('')}</tbody>
            </table>
            <div class="pl-row-end"><button class="pl-btn pl-btn--sm" data-human-preview="${hi}">预览</button></div>
          </div>`).join('') : '<div class="pl-muted" style="font-size:10px;padding:8px 0">还没有人机交互节点</div>'}
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="ifHumanAdd">＋ 插入人机交互</button></div>
        </div>
      </div>
      <div class="pl-row-end" style="margin-top:14px">
        <span class="pl-muted" id="ifSaveMsg" style="margin-right:auto;font-size:9px"></span>
        <button class="pl-btn" id="ifBack">返回接口列表</button>
        <button class="pl-btn pl-btn--solid" id="ifSave">保存规则</button>
      </div>`;
  }

  /* ---------------------------------------------------------------- 拓扑渲染 */
  function renderTopo() {
    const svg = $('#topoSvg');
    if (!svg) return;
    const box = [];
    const nodes = [];
    const links = [];
    const mk = (id, x, y, w, h, t, s, kind) => nodes.push({ id, x, y, w, h, t, s, kind });

    if (S.topoLevel === 'element') {
      mk('site', 360, 24, 170, 40, S.site.name, 'SITE · ' + S.site.role, 'site');
      S.groups.forEach((g, gi) => {
        const gx = 120 + gi * 330;
        mk(g.id, gx, 120, 200, 38, g.name, 'GROUP · ' + g.elements.length + ' NE', 'group');
        links.push(['site', g.id]);
        g.elements.forEach((eid, ei) => {
          const e = S.elements.find((x) => x.id === eid);
          if (!e) return;
          const ex = gx + 10 + ei * 105;
          mk(e.id, ex, 210, 95, 40, e.name, e.version, 'ne');
          links.push([g.id, e.id]);
        });
      });
      } else if (S.topoLevel === 'group') {
        // 组视角：站点 → 选中的组 → 组内网元（横向展开）
        const g = S.groups.find((x) => x.id === S.topoSel) || S.groups[0];
        mk('site', 360, 20, 180, 38, S.site.name, 'SITE · ' + S.site.role, 'site');
        if (g) {
          mk(g.id, 350, 110, 200, 44, g.name, 'GROUP · ' + g.elements.length + ' NE', 'group');
          links.push(['site', g.id]);
          const members = g.elements.map((id) => S.elements.find((x) => x.id === id)).filter(Boolean);
          members.forEach((m, i) => {
            const n = members.length;
            const x = n === 1 ? 360 : 40 + (640 / (n - 1)) * i;
            mk(m.id, x, 230, 170, 44, m.name, m.type + ' · v' + m.version, 'ne');
            links.push([g.id, m.id]);
          });
        }
        // 其他组：右侧速览
        S.groups.filter((x) => !g || x.id !== g.id).forEach((x, i) => {
          mk('go-' + x.id, 700, 20 + i * 32, 160, 26, x.name, x.elements.length + ' NE', 'group');
        });
    } else {
      const e = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
      mk('ne', 40, 170, 150, 44, e.name, 'NE · v' + e.version, 'ne');
      e.comps.forEach((c, i) => {
        mk('c' + i, 300, 40 + i * 62, 150, 40, c, 'COMPONENT', 'comp');
        links.push(['ne', 'c' + i]);
      });
      mk('bus', 560, 170, 150, 44, '内部总线', 'BACKPLANE', 'comp');
      links.push(['ne', 'bus']);
    }

    const wOf = (id) => nodes.find((n) => n.id === id);
    let html = '';
    // 正交连线：父底 → 子顶（先竖后横再竖）
    links.forEach(([a, b]) => {
      const A = wOf(a), B = wOf(b);
      if (!A || !B) return;
      const x1 = A.x + A.w / 2, y1 = A.y + A.h;
      const x2 = B.x + B.w / 2, y2 = B.y;
      const midY = (y1 + y2) / 2;
      const d = S.topoLevel === 'component'
        ? `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      html += `<path class="topo-link" d="${d}" />`;
    });
    // 节点
    nodes.forEach((n) => {
      html += `<g class="topo-node${S.topoSel === n.id ? ' is-on' : ''}" data-node="${n.id}">
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" />
        <text class="topo-node__t" x="${n.x + 10}" y="${n.y + 17}">${esc(n.t)}</text>
        <text class="topo-node__s" x="${n.x + 10}" y="${n.y + 31}">${esc(n.s)}</text>
      </g>`;
    });
    svg.innerHTML = html;

    // hover 档案卡 + 点击 + 双击下钻
    const tip = $('#topoTip');
    $$('.topo-node', svg).forEach((g) => {
      g.addEventListener('mousemove', (ev) => {
        const id = g.dataset.node;
        const n = nodes.find((x) => x.id === id);
        if (!n) return;
        tip.innerHTML = `<b>${esc(n.t)}</b><br><span class="pl-muted">${esc(n.s)}</span>`;
        tip.classList.add('on');
        const r = $('#topoBox').getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 250) + 'px';
        tip.style.top = (ev.clientY - r.top + 14) + 'px';
      });
      g.addEventListener('mouseleave', () => tip.classList.remove('on'));
      g.addEventListener('click', () => {
        const raw = g.dataset.node || '';
        if (raw.startsWith('go-')) { S.topoSel = raw.slice(3); S.topoLevel = 'group'; }
        else { S.topoSel = raw; }
        renderTopo();
        renderTopoDetail();
        if (window.PlaneTopo3D && S.topoDim === '3d') window.PlaneTopo3D.rebuild();
      });
      g.addEventListener('dblclick', () => {
        const id = g.dataset.node;
        if (S.topoLevel === 'element' && id.startsWith('g-')) { S.topoLevel = 'group'; S.topoSel = id; }
        else if (S.topoLevel === 'element' || S.topoLevel === 'group') {
          const el = S.elements.find((x) => x.id === id);
          if (el) { S.topoSel = el.id; S.topoLevel = 'component'; }
        }
        // 组件级下双击 → 进入该网元的升级流程/校验/人机交互详情
        if (S.topoLevel === 'component' && S.elements.find((x) => x.id === S.topoSel)) {
          S.view = 'ne-detail';
          render();
          return;
        }
        renderTopo(); renderTopoDetail();
      });
    });
  }

  function renderTopoDetail() {
    const box = $('#topoDetail');
    if (!box) return;
    const id = S.topoSel;
    if (!id) { box.innerHTML = '在左侧点击节点查看详情'; return; }
    const e = S.elements.find((x) => x.id === id);
    if (e) {
      box.innerHTML = `<dl class="pl-kv">
        <dt>Name</dt><dd>${esc(e.name)}</dd>
        <dt>Arch</dt><dd>${esc(e.arch)}</dd>
        <dt>Type</dt><dd>${esc(e.type)}</dd>
        <dt>Version</dt><dd>v${esc(e.version)}</dd>
        <dt>Software</dt><dd>${esc(e.sw)}</dd>
        <dt>Group</dt><dd>${esc(e.group)}</dd>
        <dt>Components</dt><dd>${e.comps.map((c) => `<span class="pl-tag">${esc(c)}</span>`).join(' ')}</dd>
      </dl>`;
      return;
    }
    const g = S.groups.find((x) => x.id === id);
    if (g) {
      box.innerHTML = `<dl class="pl-kv"><dt>Group</dt><dd>${esc(g.name)}</dd>
        <dt>Members</dt><dd>${g.elements.length} 个网元</dd></dl>`;
      return;
    }
    box.innerHTML = `<dl class="pl-kv"><dt>Site</dt><dd>${esc(S.site.name)} · ${esc(S.site.role)}</dd>
      <dt>Groups</dt><dd>${S.groups.length}</dd><dt>Elements</dt><dd>${S.elements.length}</dd></dl>`;
  }

  /* ---------------------------------------------------------------- 人机交互弹窗 */
  let humanTimer = 0, humanLeft = 0;
  function openHuman(opts) {
    const h = opts || S.human[0];
    $('#plHuman').hidden = false;
    $('#plHumanPrompt').textContent = h.prompt;
    $('#plHumanSub').textContent = 'HUMAN-IN-THE-LOOP · 超时 ' + h.timeout + 's';
    const stEl = $('#plHumanState');
    stEl.textContent = 'PENDING';
    stEl.className = 'pl-human__state';
    $('#plHumanOpts').innerHTML = h.options.map((o) => `<button class="pl-human__opt" data-next="${esc(o.next)}">
      <span>${esc(o.l)}</span><small>NEXT · ${esc(o.next)}</small></button>`).join('');
    humanLeft = h.timeout;
    $('#plHumanBar').style.width = '100%';
    clearInterval(humanTimer);
    humanTimer = setInterval(() => {
      humanLeft -= 1;
      $('#plHumanBar').style.width = Math.max(0, (humanLeft / h.timeout) * 100) + '%';
      if (humanLeft <= 0) {
        clearInterval(humanTimer);
        stEl.textContent = 'EXPIRED';
        stEl.className = 'pl-human__state is-expired';
        $('#plHumanOpts').innerHTML = '<div class="pl-muted" style="font-size:10px">已超时。按流程配置：挂起等待 / 重试 / 跳过。</div>';
      }
    }, 1000);
  }
  function closeHuman() { clearInterval(humanTimer); $('#plHuman').hidden = true; }

  /* ---------------------------------------------------------------- 路由 */
  const VIEWS = {
    'mock-admin': viewMockAdmin,
    'mock-flow': viewMockFlow,
    audit: viewAudit,
    elements: viewElements,
    topo: viewTopo,
    omc: viewOmc,
    lcm: viewLcm,
    fs: viewFs,
    'ne-detail': viewNeDetail,
    'iface': viewIface,
    'task': viewTask,
    'human': viewHuman,
  };


  function render() {
    renderRail();
    const fn = VIEWS[S.view] || viewMockAdmin;
    const main = $('#plMain');
    main.classList.remove('is-swap');
    main.innerHTML = band() + fn();
    // 强制重排后再加动画类，保证每次切换都能看到过渡
    void main.offsetWidth;
    main.classList.add('is-swap');
    // 工作区视觉：body 上标记当前模式，顶栏按钮与提示同步
    document.body.classList.toggle('is-runtime', S.layer === 'runtime');
    document.body.classList.toggle('is-prep', S.layer === 'prep');
    $$('.pl-mode__b').forEach((b) => {
      const on = b.dataset.layer === S.layer;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const hint = $('#plModeHint');
    startBandTimer();
    if (hint) hint.textContent = LAYER_HINT[S.layer] || '';
    bindView();
    if (S.view === 'topo') { renderTopo(); renderTopoDetail(); }
      // 维度记忆：当前是 3D 时，重渲染后自动恢复
      if (S.view === 'topo' && S.topoDim === '3d') {
        const b3now = $('#btn3d');
        if (b3now) setTimeout(() => b3now.click(), 0);
      }

      // 任务视图：每 3s 拉一次，进度变化则重渲染（自动推进阶段会自己动）
      if (S.taskTimer) { clearTimeout(S.taskTimer); S.taskTimer = 0; }
      if (S.view === 'task' && S.tasks.length) {
        const snapshot = S.tasks.map((x) => x.id + ':' + x.stage + ':' + x.progress).join('|');
        S.taskTimer = setTimeout(async () => {
          try {
            const fresh = await api('/api/business/tasks');
            const next = (fresh || []).map((x) => x.id + ':' + x.stage + ':' + x.progress).join('|');
            S.tasks = fresh || S.tasks;
            if (next !== snapshot) render();
            else { S.taskTimer = setTimeout(() => render(), 3000); }
          } catch (e) { /* 忽略 */ }
        }, 3000);
      }
  }

  /* ---------------------------------------------------------------- 事件 */
  function bindView() {
    // MOCK 管理（全部走服务端）
    const epId = () => (S.ep && S.ep.id) || '';
    $$('[data-cap]').forEach((b) => b.addEventListener('click', async () => {
      const c = b.dataset.cap;
      if (!S.ep) return;
      const set = new Set(S.ep.capabilities || []);
      set.has(c) ? set.delete(c) : set.add(c);
      try {
        S.ep = await api('/api/business/endpoints/' + epId(), {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ capabilities: [...set] }),
        });
      } catch (e2) { console.warn(e2); }
      render();
    }));
    const btnSave = $('#btnSave');
    if (btnSave) btnSave.addEventListener('click', async () => {
      if (!S.ep) return;
      try {
        S.ep = await api('/api/business/endpoints/' + epId(), {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ host: $('#epHost').value.trim(), port: +$('#epPort').value || 8443 }),
        });
      } catch (e2) { console.warn(e2); }
      render();
    });
    const btnCert = $('#btnCert');
    if (btnCert) btnCert.addEventListener('click', async () => {
      if (!S.ep) return;
      try {
        S.ep = await api('/api/business/endpoints/' + epId() + '/cert', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ cn: $('#epHost').value.trim() || S.ep.host, san: [S.ep.host, 'localhost'] }),
        });
      } catch (e2) { console.warn(e2); }
      render();
    });
    const btnStart = $('#btnStart');
    if (btnStart) btnStart.addEventListener('click', async () => {
      if (!S.ep) return;
      try {
        S.ep = await api('/api/business/endpoints/' + epId(), {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ enabled: !S.ep.enabled }),
        });
      } catch (e2) { console.warn(e2); }
      render();
    });

    // MOCK 流程
    $$('[data-field-src]').forEach((sel) => sel.addEventListener('change', () => {
      S.fields[+sel.dataset.fieldSrc].source = sel.value; render();
    }));
    $$('[data-field-del]').forEach((b) => b.addEventListener('click', () => {
      S.fields.splice(+b.dataset.fieldDel, 1); render();
    }));
    const fa = $('#btnFieldAdd');
    if (fa) fa.addEventListener('click', () => {
      S.fields.push({ name: 'newField', type: 'string', source: 'static', value: '' }); render();
    });
    const hAdd = $('#btnHumanAdd');
    if (hAdd) hAdd.addEventListener('click', () => openHuman());
    const hPrev = $('#btnHumanPreview');
    if (hPrev) hPrev.addEventListener('click', () => openHuman());

    // 网元
    // 网元 · 新建（真表单）
    const neFormBind = (id, key, isSelect) => {
      const el = $('#' + id);
      if (!el) return;
      el.addEventListener(isSelect ? 'change' : 'input', () => { S.neForm[key] = el.value; });
    };
    const neOpen = $('#btnNeForm');
    if (neOpen) neOpen.addEventListener('click', () => {
      S.neForm.open = !S.neForm.open;
      if (S.neForm.open && !S.neForm.group) S.neForm.group = (S.groups[0] || {}).id || '';
      render();
    });
    neFormBind('neName', 'name');
    neFormBind('neArch', 'arch', true);
    neFormBind('neKind', 'kind', true);
    neFormBind('neVersion', 'version');
    neFormBind('neSoftware', 'software');
    neFormBind('neGroup', 'group', true);
    $$('[data-ne-comp]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.neComp;
      const arr = S.neForm.comps || (S.neForm.comps = []);
      S.neForm.comps = arr.includes(c) ? arr.filter((x) => x !== c) : arr.concat([c]);
      render();
    }));
    const neCancel = $('#btnNeCancel');
    if (neCancel) neCancel.addEventListener('click', () => { S.neForm.open = false; render(); });
    const neSubmit = $('#btnNeSubmit');
    if (neSubmit) neSubmit.addEventListener('click', async () => {
      const msg = $('#neFormMsg');
      const f = S.neForm;
      if (!f.name.trim()) { if (msg) msg.textContent = '网元名必填'; return; }
      try {
        await api('/api/business/elements', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            name: f.name.trim(), arch: f.arch, kind: f.kind,
            version: f.version.trim() || '5.2.1',
            software: f.software.trim() || 'NR-RAN',
            group: f.group || (S.groups[0] || {}).id || '',
            components: f.comps && f.comps.length ? f.comps : ['主控板'],
          }),
        });
        await loadElements();
        S.neForm = { open: false, name: '', arch: f.arch, kind: f.kind, version: '', software: f.software, group: f.group, comps: f.comps };
      } catch (e) { if (msg) msg.textContent = '创建失败：' + e.message; }
      render();
    });
    $$('[data-ne-detail]').forEach((b) => b.addEventListener('click', () => {
      S.topoSel = b.dataset.neDetail; S.view = 'ne-detail'; render();
    }));
    $$('[data-ne-copy]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/api/business/elements/' + b.dataset.neCopy + '/copy', {
          method: 'POST', headers: headers(), body: '{}',
        });
        await loadElements();
      } catch (e) { console.warn(e); }
      render();
    }));

    // 拓扑层级
      $$('[data-level]').forEach((b) => b.addEventListener('click', () => {
        S.topoLevel = b.dataset.level;
        if (S.topoLevel === 'group' && !String(S.topoSel || '').startsWith('g-')) {
          S.topoSel = (S.groups[0] || {}).id || S.topoSel;
        }
        if (S.topoLevel === 'component' && !S.elements.find((x) => x.id === S.topoSel)) {
          S.topoSel = (S.elements[0] || {}).id || S.topoSel;
        }
        render(); }));

    // 2D / 3D 切换
    const b2 = $('#btn2d'), b3 = $('#btn3d'), box3 = $('#topo3d');
    if (b2 && b3 && box3) {
      b2.addEventListener('click', () => {
          S.topoDim = '2d';
        box3.style.display = 'none';
        $('#topoSvg').style.display = '';
        b2.style.cssText = 'background:#17140f;color:#eae5e1;border-color:#17140f';
        b3.style.cssText = '';
        if (window.PlaneTopo3D) window.PlaneTopo3D.unmount();
      });
        S.topoDim = '3d';
      b3.addEventListener('click', () => {
        box3.style.display = 'block';
        $('#topoSvg').style.display = 'none';
        b3.style.cssText = 'background:#17140f;color:#eae5e1;border-color:#17140f';
        b2.style.cssText = '';
        if (window.PlaneTopo3D) window.PlaneTopo3D.mount(
          box3, S,
          (id, data) => {
            S.topoSel = id;
            if (S.topoLevel === 'group' && data && data.kind === 'group' && window.PlaneTopo3D) window.PlaneTopo3D.rebuild();
            renderTopoDetail();
          },
          (kind, id) => {
            if (kind === 'ne') { S.topoSel = id; S.topoLevel = 'component'; }
            else if (kind === 'site' || kind === 'group') { S.topoLevel = 'element'; }
            if (window.PlaneTopo3D) window.PlaneTopo3D.rebuild();
            // 同步层级按钮选中态（不整页重渲染，保住 3D 实例）
            Array.from(document.querySelectorAll('[data-level]')).forEach((btn) => {
              const on = btn.dataset.level === S.topoLevel;
              btn.style.cssText = on ? 'background:#17140f;color:#eae5e1;border-color:#17140f' : '';
            });
            renderTopoDetail();
          }
        );
      });
    }

    // 左侧导航
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      S.view = b.dataset.view;
      S.layer = ['mock-admin', 'mock-flow', 'audit'].includes(S.view) ? 'runtime' : 'prep';
      render();
    }));
    // 工作区切换：运行态 ⇄ 准备态（各自一套导航 + 状态条）
    $$('.pl-mode__b').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.layer === S.layer) return;
      go(LAYER_HOME[b.dataset.layer], b.dataset.layer);
    }));

    // 接口规则编辑器
    $$('[data-iface]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceSel = b.dataset.iface; S.view = 'iface'; render();
    }));

    // 接口删除：第一次点变「确认删除？」，4s 内再点才真删
    $$('[data-iface-del]').forEach((b) => {
let timer = 0;
b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (b.dataset.armed !== '1') {
    b.dataset.armed = '1';
    b.dataset.label = b.textContent;
    b.textContent = '确认删除？';
    clearTimeout(timer);
    timer = setTimeout(() => {
      b.dataset.armed = '0';
      b.textContent = b.dataset.label || '删除';
    }, 4000);
    return;
    }
    clearTimeout(timer);
    b.disabled = true;
    try {
    await api('/api/business/mappings/' + encodeURIComponent(b.dataset.ifaceDel), {
      method: 'DELETE', headers: headers(),
    });
    await loadIfaces();
    if (S.ifaceSel === b.dataset.ifaceDel) S.ifaceSel = (S.ifaces[0] || {}).id || '';
    } catch (e) { console.warn(e); }
    render();
});
    });
    const ifSave = $('#ifSave');
    if (ifSave) ifSave.addEventListener('click', async () => {
      const r = S.ifaceRules[S.ifaceSel];
      if (!r) return;
      const msg = $('#ifSaveMsg');
      try {
        await api('/api/business/mappings/' + S.ifaceSel, {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ status: r.status, delay_ms: r.delay }),
        });

      // 多规则编辑（条件 / 状态码 / 延迟 / 响应体）
      const varArr = () => (S.ifaceVariants[S.ifaceSel] || (S.ifaceVariants[S.ifaceSel] = []));
      const bindVar = (sel, key) => {
        $$(sel).forEach((el) => el.addEventListener('input', () => {
          const i = +(el.dataset.varWhen ?? el.dataset.varStatus ?? el.dataset.varDelay ?? el.dataset.varBody ?? el.dataset.varNote);
          const arr = varArr();
          const v = arr[i] || (arr[i] = {});
          if (key === 'status' || key === 'delay_ms') v[key] = el.value === '' ? null : Number(el.value);
          else v[key] = el.value;
        }));
      };
      bindVar('[data-var-when]', 'when');
      bindVar('[data-var-status]', 'status');
      bindVar('[data-var-delay]', 'delay_ms');
      bindVar('[data-var-body]', 'body');
      bindVar('[data-var-note]', 'note');
      $$('[data-var-del]').forEach((b) => b.addEventListener('click', () => {
        varArr().splice(+b.dataset.varDel, 1);
        render();
      }));
      const varAddBtn = $('#btnVarAdd');
      if (varAddBtn) varAddBtn.addEventListener('click', () => {
        varArr().push({ when: '', status: null, delay_ms: null, body: '', note: '' });
        render();
      });

        await api('/api/business/mappings/' + S.ifaceSel + '/rules', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({
            fields: r.fields.map((f) => ({
              name: f.name, kind: f.type, source: f.src, value: f.value || '',
              step: f.step || 1, max: f.max || 0, condition: f.value || '',
            })),
              variants: (S.ifaceVariants[S.ifaceSel] || []).map((v) => ({
                when: v.when || '',
                status: v.status == null ? null : Number(v.status),
                delay_ms: v.delay_ms == null ? null : Number(v.delay_ms),
                body: v.body == null ? null : v.body,
                note: v.note || '',
              })),
            human: r.human.length ? {
              prompt: r.human[0].prompt,
              options: r.human[0].options.map((o) => ({ label: o.l, effect: o.effect })),
              state: String(r.human[0].state || 'PENDING').toLowerCase(),
            } : null,
            clear_human: r.human.length === 0,
          }),
        });
        if (msg) { msg.textContent = '已保存到服务端 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2200); }
        await loadIfaces();
      } catch (e) {
        if (msg) msg.textContent = '保存失败：' + e.message;
      }
    });
    const ifBack = $('#ifBack');
    if (ifBack) ifBack.addEventListener('click', () => { S.view = 'mock-flow'; render(); });
    const ifStatus = $('#ifStatus');
    if (ifStatus) ifStatus.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.status = +ifStatus.value;
      const b = S.ifaces.find((x) => x.id === S.ifaceSel); if (b) b.status = r.status;
      render();
    });
    const ifDelay = $('#ifDelay');
    if (ifDelay) ifDelay.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.delay = +ifDelay.value || 0;
      const b = S.ifaces.find((x) => x.id === S.ifaceSel); if (b) b.delay = r.delay;
      render();
    });
    $$('[data-fld-src]').forEach((sel) => sel.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.fields[+sel.dataset.fldSrc].src = sel.value; render();
    }));
    $$('[data-fld-type]').forEach((sel) => sel.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.fields[+sel.dataset.fldType].type = sel.value; render();
    }));
    $$('[data-fld-del]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].fields.splice(+b.dataset.fldDel, 1); render();
    }));
    const fAdd = $('#ifFldAdd');
    if (fAdd) fAdd.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].fields.push({ name: 'newField', type: 'string', src: 'static', value: '' }); render();
    });
    const ifHumanAddBtn = $('#ifHumanAdd');
    if (ifHumanAddBtn) ifHumanAddBtn.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].human.push({
        step: '人工确认', prompt: '请确认是否继续执行', timeout: 60, state: 'PENDING',
        options: [{ l: '继续', effect: 'continue', set: 'result=ok' }, { l: '终止', effect: 'abort', set: 'result=abort' }],
      });
      render();
    });
    $$('[data-human-preview]').forEach((b) => b.addEventListener('click', () => {
      const h = S.ifaceRules[S.ifaceSel].human[+b.dataset.humanPreview];
      openHuman({ prompt: h.prompt, timeout: h.timeout, options: h.options.map((o) => ({ l: o.l, next: o.effect })) });
    }));

    // 审计

    // 审计
    const auditRefresh = $('#btnAuditRefresh');
    if (auditRefresh) auditRefresh.addEventListener('click', async () => { await loadAudit(); render(); });

    // 网元详情：流程 / 校验 编辑
    $$('[data-flow-step]').forEach((el) => el.addEventListener('input', () => {
      S.neDraft.flow[+el.dataset.flowStep].step = el.value;
    }));
    $$('[data-flow-human]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.flowHuman;
      S.neDraft.flow[i].human = !S.neDraft.flow[i].human;
      render();
    }));
    $$('[data-flow-del]').forEach((b) => b.addEventListener('click', () => {
      S.neDraft.flow.splice(+b.dataset.flowDel, 1); render();
    }));
    const flowAdd = $('#btnFlowAdd');
    if (flowAdd) flowAdd.addEventListener('click', () => {
      S.neDraft.flow.push({ step: '新步骤', human: false }); render();
    });
    $$('[data-chk-field]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkField].field = el.value; }));
    $$('[data-chk-rule]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkRule].rule = el.value; }));
    $$('[data-chk-msg]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkMsg].msg = el.value; }));
    $$('[data-chk-del]').forEach((b) => b.addEventListener('click', () => {
      S.neDraft.checks.splice(+b.dataset.chkDel, 1); render();
    }));
    const chkAdd = $('#btnChkAdd');
    if (chkAdd) chkAdd.addEventListener('click', () => {
      S.neDraft.checks.push({ field: 'field', rule: '必填', msg: '缺失参数' }); render();
    });
    const neBack = $('#btnNeBack');
    if (neBack) neBack.addEventListener('click', () => { S.view = 'elements'; render(); });
    const neSave = $('#btnNeSave');
    if (neSave) neSave.addEventListener('click', async () => {
      const msg = $('#neMsg');
      try {
        await api('/api/business/elements/' + S.neDraft.__id, {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ flow: S.neDraft.flow, checks: S.neDraft.checks }),
        });
        await loadElements();
        S.neDraft.__id = null;   // 让草稿从新数据重建
        if (msg) { msg.textContent = '已保存到网元 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // 成组：把当前组内网元 + 选中项写成一个新组
    const groupAdd = $('#btnGroupAdd');
    if (groupAdd) groupAdd.addEventListener('click', async () => {
      const members = S.elements.map((e) => e.id).slice(0, 2);
      try {
        await api('/api/business/groups', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ name: '新网元组 ' + (S.groups.length + 1), site: 'site-hz', element_ids: members }),
        });
        await loadElements();
      } catch (e) { console.warn(e); }
      render();
    });

    // 人机交互状态机编辑
    const humanDraft = () => S.human || { states: [], outcomes: [] };
    $$('[data-st-id]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stId].id = el.value.trim().toUpperCase();
    }));
    $$('[data-st-label]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stLabel].label = el.value;
    }));
    $$('[data-st-tone]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stTone].tone = el.value;
    }));
    $$('[data-st-del]').forEach((b) => b.addEventListener('click', () => {
      humanDraft().states.splice(+b.dataset.stDel, 1); render();
    }));
    const stAdd = $('#btnStateAdd');
    if (stAdd) stAdd.addEventListener('click', () => {
      humanDraft().states.push({ id: 'NEW_STATE', label: '新状态', tone: 'muted' }); render();
    });
    $$('[data-oc-opt]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocOpt].option = el.value;
    }));
    $$('[data-oc-eff]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocEff].effect = el.value;
    }));
    $$('[data-oc-to]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocTo].to = el.value; render();
    }));
    $$('[data-oc-set]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocSet].set_field = el.value;
    }));
    $$('[data-oc-del]').forEach((b) => b.addEventListener('click', () => {
      humanDraft().outcomes.splice(+b.dataset.ocDel, 1); render();
    }));
    const ocAdd = $('#btnOutcomeAdd');
    if (ocAdd) ocAdd.addEventListener('click', () => {
      humanDraft().outcomes.push({ option: '新操作', effect: 'continue', to: 'RESOLVED', set_field: '' }); render();
    });
    const hSave = $('#btnHumanSave');
    if (hSave) hSave.addEventListener('click', async () => {
      const msg = $('#humanMsg');
      try {
        S.human = await api('/api/business/human-template', {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ states: S.human.states, outcomes: S.human.outcomes }),
        });
        if (msg) { msg.textContent = '已保存到服务端 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // OMC · 纳管网元切换
    $$('[data-omc-el]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.omcEl;
      const cfg = S.platform || { omc_elements: [] };
      const cur = new Set(cfg.omc_elements || []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ omc_elements: [...cur] }),
        });
        S.omc.elements = S.platform.omc_elements || [...cur];
      } catch (e) { console.warn(e); }
      render();
    }));
    // OMC · 创建账号
    const accAdd = $('#btnAccAdd');
    if (accAdd) accAdd.addEventListener('click', async () => {
      const name = ($('#accName') || {}).value;
      if (!name || !name.trim()) return;
      const cfg = S.platform || { accounts: [] };
      const accounts = (cfg.accounts || []).slice();
      accounts.push({
        id: 'acc-' + String(accounts.length + 1).padStart(2, '0'),
        name: name.trim(),
        role: ($('#accRole') || {}).value || '只读',
        scope: (cfg.omc_elements || S.omc.elements || []).slice(0, 1),
      });
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ accounts }),
        });
        S.omc.accounts = S.platform.accounts || accounts;
      } catch (e) { console.warn(e); }
      render();
    });

    // 预置教学场景
    const presetBtn = $('#btnScenePreset');
    if (presetBtn) presetBtn.addEventListener('click', async () => {
      const pick = $('#scenePick');
      const file = pick && pick.value;
      if (!file) { S.sceneMsg = '先选一个场景'; render(); return; }
      try {
        const payload = await api('./scenes/' + file, { raw: true }).catch(() => null)
          || await fetch(apiUrl('./scenes/' + file), { cache: 'no-store' }).then((r) => r.json());
        const res = await api('/api/business/import', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
        await Promise.all([loadEndpoint(), loadElements(), loadLcm(), loadHuman(), loadTasks(), loadIfaces()]);
        S.sceneMsg = '已载入「' + ((S.scenes.find((s) => s.file === file) || {}).name || file) + '」' + (res.imported || 0) + ' 条 ✓';
      } catch (e) { S.sceneMsg = '载入失败：' + e.message; }
      setTimeout(() => { S.sceneMsg = ''; if (S.view === 'mock-admin') render(); }, 3200);
      render();
    });

    // 场景导出 / 导入
    const sceneExport = $('#btnSceneExport');
    if (sceneExport) sceneExport.addEventListener('click', async () => {
      const msg = $('#sceneMsg');
      try {
        const scene = await api('/api/business/export');
        const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'rhine-scene-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        S.sceneMsg = '已导出 ✓  ' + a.download;
        setTimeout(() => { S.sceneMsg = ''; if (S.view === 'mock-admin') render(); }, 2500);
      } catch (e) { if (msg) msg.textContent = '导出失败：' + e.message; }
    });
    const sceneImportBtn = $('#btnSceneImport');
    const sceneFile = $('#sceneFile');
    if (sceneImportBtn && sceneFile) {
      sceneImportBtn.addEventListener('click', () => sceneFile.click());
      sceneFile.addEventListener('change', async () => {
        const msg = $('#sceneMsg');
        const f = sceneFile.files && sceneFile.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const payload = JSON.parse(text);
          const res = await api('/api/business/import', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
          await Promise.all([loadEndpoint(), loadElements(), loadLcm(), loadHuman(), loadTasks(), loadIfaces()]);
          S.sceneMsg = '已导入 ' + (res.imported || 0) + ' 条 ✓';
          setTimeout(() => { S.sceneMsg = ''; if (S.view === 'mock-admin') render(); }, 3000);
        } catch (e) { if (msg) msg.textContent = '导入失败：' + e.message; }
        render();
      });
    }

    // 审计：确认人机交互（放行 202）
    $$('[data-human-resolve]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.humanResolve;
      if (!id) return;
      b.disabled = true;
      try {
        await api('/api/business/mappings/' + id + '/human', {
          method: 'POST', headers: headers(), body: JSON.stringify({ option: 0 }),
        });
        await loadAudit();
      } catch (e) { console.warn(e); }
      render();
    }));

    // 任务 · 超时后重新发起人工确认
    $$('[data-human-retry]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/api/business/tasks/' + b.dataset.humanRetry + '/human/retry', {
          method: 'POST', headers: headers(), body: '{}',
        });
        await loadTasks();
      } catch (e) { console.warn(e); }
      render();
    }));

    // OMC · 账号授权
    $$('[data-acc-row]').forEach((row) => row.addEventListener('click', () => {
      S.accSel = Number(row.dataset.accRow);
      render();
    }));
    $$('[data-acc-scope]').forEach((b) => b.addEventListener('click', async () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || S.omc.accounts || []));
      const a = accs[S.accSel];
      if (!a) return;
      a.scope = a.scope || [];
      const id = b.dataset.accScope;
      a.scope = a.scope.includes(id) ? a.scope.filter((x) => x !== id) : a.scope.concat([id]);
      cfg.accounts = accs;
      S.platform = cfg;
      render();
    }));
    const accAll = $('#btnAccAll');
    if (accAll) accAll.addEventListener('click', () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || []));
      if (accs[S.accSel]) accs[S.accSel].scope = (S.elements || []).map((e) => e.id);
      cfg.accounts = accs; S.platform = cfg; render();
    });
    const accNone = $('#btnAccNone');
    if (accNone) accNone.addEventListener('click', () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || []));
      if (accs[S.accSel]) accs[S.accSel].scope = [];
      cfg.accounts = accs; S.platform = cfg; render();
    });
    const accSave = $('#btnAccSave');
    if (accSave) accSave.addEventListener('click', async () => {
      const msg = $('#accMsg');
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ accounts: (S.platform.accounts || []) }),
        });
        if (msg) msg.textContent = '已保存 ✓';
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // OMC · 站点保存
    const siteSave = $('#btnSiteSave');
    if (siteSave) siteSave.addEventListener('click', async () => {
      const name = ($('#siteName') || {}).value || '';
      const role = ($('#siteRole') || {}).value || 'primary';
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ site_name: name.trim(), site_role: role }),
        });
        S.site = Object.assign({}, S.site, { name: name.trim() || S.site.name, role });
      } catch (e) { console.warn(e); }
      render();
    });

    // LCM · 包升级 → 生成任务
    $$('[data-pkg-up]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const task = await api('/api/business/packages/' + b.dataset.pkgUp + '/upgrade', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: (S.platform && S.platform.site_name) || 'site-hz', to_version: b.dataset.pkgVer }),
        });
        S.tasks.unshift(task);
        S.taskSel = task.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    }));
    // LCM · 共部署开关
    const coBtn = $('#btnCoDeploy');
    if (coBtn) coBtn.addEventListener('click', async () => {
      try {
        const cur = S.platform ? !!S.platform.co_deploy : false;
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: !cur }),
        });
        if (S.lcm) S.lcm.coDeploy = S.platform.co_deploy;
      } catch (e) { console.warn(e); }
      render();
    });

    // 升级任务
    $$('[data-task]').forEach((b) => b.addEventListener('click', () => {
      S.taskSel = b.dataset.task; S.view = 'task'; render();
    }));
    $$('[data-human-opt]').forEach((b) => b.addEventListener('click', async () => {
      const task = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
      if (!task) return;
      try {
        const up = await api('/api/business/tasks/' + task.id + '/human', {
          method: 'POST', headers: headers(), body: JSON.stringify({ option: +b.dataset.humanOpt }),
        });
        S.tasks = S.tasks.map((x) => (x.id === up.id ? up : x));
      } catch (e) { console.warn(e); }
      render();
    }));
    // 演示剧本：建任务 → 自动推进 → 遇到人工确认 3s 后自动点第 1 项 → 到 100%
    const demo = $('#btnTaskDemo');
    if (demo) demo.addEventListener('click', async () => {
      demo.disabled = true;
      demo.textContent = '演示中…';
      try {
        const site = (S.platform && S.platform.site_name) || 'site-hz';
        const t0 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site, element_ids: ['ne-0001'], from_version: '5.2.1', to_version: '5.2.2' }),
        });
        S.taskSel = t0.id;
        S.view = 'task';
        render();
        // 轮询：有人工确认待处理 → 2.2s 后自动选第 1 项；100% 结束
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const list = await api('/api/business/tasks');
          S.tasks = list || S.tasks;
          const cur = (S.tasks || []).find((x) => x.id === t0.id);
          if (!cur) break;
          const stage = cur.stages[cur.stage] || {};
          if (stage.human && stage.human.state === 'pending') {
            await new Promise((r) => setTimeout(r, 900));
            await api('/api/business/tasks/' + t0.id + '/human', {
              method: 'POST', headers: headers(), body: JSON.stringify({ option: 0 }),
            });
          }
          render();
          if (cur.progress >= 100) break;
        }
      } catch (e) { console.warn(e); }
      if (demo) { demo.disabled = false; demo.textContent = '▶ 演示一次完整升级'; }
      render();
    });

    const purge = $('#btnTaskPurge');
    if (purge) purge.addEventListener('click', async () => {
      try {
        await api('/api/business/tasks/purge', { method: 'POST', headers: headers(), body: '{}' });
        await loadTasks();
        S.taskSel = (S.tasks[0] || {}).id || null;
      } catch (e) { console.warn(e); }
      render();
    });
    const quick = $('#btnTaskQuick');
    if (quick) quick.addEventListener('click', async () => {
      try {
        const t3 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: (S.platform && S.platform.site_name) || 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),
        });
        S.tasks.unshift(t3);
        S.taskSel = t3.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    });

    // 平台页
    const accAddOld = $('#btnAccAdd');
    if (accAddOld) accAddOld.addEventListener('click', () => {
      S.omc.accounts.push({ id: 'acc-0' + (S.omc.accounts.length + 1), name: 'omc-user' + (S.omc.accounts.length + 1), scope: ['ne-0001'], role: '只读' });
      render();
    });
    const taskAdd = $('#btnTaskAdd');
    if (taskAdd) taskAdd.addEventListener('click', async () => {
      try {
        const t3 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: (S.platform && S.platform.site_name) || 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),
        });
        S.tasks.unshift(t3);
        S.taskSel = t3.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    });
    const taskHuman = $('#btnTaskHuman');
    if (taskHuman) taskHuman.addEventListener('click', () => openHuman());
    const co = $('#btnCoDeploy');
    if (co) co.addEventListener('click', async () => {
      const next = !(S.platform ? !!S.platform.co_deploy : S.lcm.coDeploy);
      try {
        S.platform = await api('/api/business/platform', { method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: next }) });
      } catch (e) { console.warn(e); }
      render();
    });
    // LCM · 软件包登记（写后端）
    const draftBind = (id, key, isSelect) => {
      const el = $('#' + id);
      if (!el) return;
      el.addEventListener(isSelect ? 'change' : 'input', () => { S.pkgDraft[key] = el.value; });
    };
    draftBind('pkgName', 'name');
    draftBind('pkgKind', 'kind', true);
    draftBind('pkgOwner', 'owner', true);
    draftBind('pkgVendor', 'vendor');
    draftBind('pkgVersion', 'version');
    if (!S.pkgDraft.owner && S.elements[0]) S.pkgDraft.owner = S.elements[0].id;
    const pkgSubmit = $('#btnPkgSubmit');
    if (pkgSubmit) pkgSubmit.addEventListener('click', async () => {
      const msg = $('#pkgMsg');
      const d = S.pkgDraft;
      if (!d.name.trim() || !d.version.trim()) { if (msg) msg.textContent = '包名与版本必填'; return; }
      try {
        await api('/api/business/packages', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ name: d.name.trim(), kind: d.kind, owner: d.owner || (S.elements[0] || {}).id, vendor: d.vendor.trim() || '—', version: d.version.trim() }),
        });
        await loadLcm();
        S.pkgDraft = { name: '', kind: d.kind, owner: d.owner, vendor: d.vendor, version: '' };
        if (msg) msg.textContent = '已登记 ✓';
      } catch (e) { if (msg) msg.textContent = '登记失败：' + e.message; }
      render();
    });
    $$('[data-pkg-for]').forEach((b) => b.addEventListener('click', () => {
      S.pkgDraft.owner = b.dataset.pkgFor;
      render();
    }));
    // FS 虚层：执行包校验
    const fsVerify = $('#btnFsVerify');
    if (fsVerify) fsVerify.addEventListener('click', async () => {
      try {
        S.platform = await api('/api/business/platform/fs/verify', { method: 'POST', headers: headers(), body: '{}' });
      } catch (e) { console.warn(e); }
      render();
    });

    const fsUp = $('#btnFsUpgrade');
    if (fsUp) fsUp.addEventListener('click', () => openHuman({
      prompt: 'FS 虚层升级将停止业务并切换主备站点，请确认可以继续',
      timeout: 45,
      options: [{ l: '确认切换', next: 'install' }, { l: '取消升级', next: 'abort' }],
    }));
    // FS · 配置与流程编辑（PATCH platform.fs）
    const fsCfg = () => Object.assign({}, (S.platform && S.platform.fs) || {});
    const fsDraft = () => {
      const c = fsCfg();
      return {
        cpus: Number(($('#fsCpus') || {}).value || c.cpus || 16),
        site_primary: (($('#fsPrimary') || {}).value || '').trim() || c.site_primary,
        site_secondary: (($('#fsSecondary') || {}).value || '').trim() || c.site_secondary,
        version: (($('#fsVersion') || {}).value || '').trim() || c.version,
        verify_steps: $$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean),
        upgrade_steps: $$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean),
        verify_runs: c.verify_runs || [],
      };
    };
    const fsSave = async (msgSel) => {
      const msg = $(msgSel);
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ fs: fsDraft() }),
        });
        if (msg) { msg.textContent = '已保存 ✓'; setTimeout(() => { const m = $(msgSel); if (m) m.textContent = ''; }, 2500); }
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    };
    const fsSaveBtn = $('#btnFsSave');
    if (fsSaveBtn) fsSaveBtn.addEventListener('click', () => fsSave('#fsMsg'));
    const fsSaveFlow = $('#btnFsSaveFlow');
    if (fsSaveFlow) fsSaveFlow.addEventListener('click', () => fsSave('#fsMsg'));
    const fsAddVerify = $('#btnFsVerifyAdd');
    if (fsAddVerify) fsAddVerify.addEventListener('click', async () => {
      const c = fsCfg();
      const steps = ($$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean)).concat(['新校验步骤']);
      S.platform = await api('/api/business/platform', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ fs: Object.assign({}, c, { verify_steps: steps }) }),
      });
      render();
    });
    const fsAddUpgrade = $('#btnFsUpgradeAdd');
    if (fsAddUpgrade) fsAddUpgrade.addEventListener('click', async () => {
      const c = fsCfg();
      const steps = ($$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean)).concat(['新升级步骤']);
      S.platform = await api('/api/business/platform', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ fs: Object.assign({}, c, { upgrade_steps: steps }) }),
      });
      render();
    });
    $$('[data-fs-verify-del]').forEach((b) => b.addEventListener('click', async () => {
      const c = fsCfg();
      const steps = $$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean);
      steps.splice(Number(b.dataset.fsVerifyDel), 1);
      S.platform = await api('/api/business/platform', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ fs: Object.assign({}, c, { verify_steps: steps }) }),
      });
      render();
    }));
    $$('[data-fs-upgrade-del]').forEach((b) => b.addEventListener('click', async () => {
      const c = fsCfg();
      const steps = $$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean);
      steps.splice(Number(b.dataset.fsUpgradeDel), 1);
      S.platform = await api('/api/business/platform', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ fs: Object.assign({}, c, { upgrade_steps: steps }) }),
      });
      render();
    }));
    $$('[data-flow-toggle]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.flowToggle;
      S.neFlow[i].human = !S.neFlow[i].human;
      render();
    }));
    const chkAddBtn = $('#btnCheckAdd');
    if (chkAddBtn) chkAddBtn.addEventListener('click', () => {
      S.neChecks.push({ f: 'newField', rule: '必填', msg: '缺失参数' });
      render();
    });
    const hp2 = $('#btnHumanPreview2');
    if (hp2) hp2.addEventListener('click', () => openHuman());

    // 人机交互弹窗
    $$('.pl-human__opt').forEach((b) => b.addEventListener('click', () => {
      const st = $('#plHumanState');
      st.textContent = 'RESOLVED';
      st.className = 'pl-human__state is-resolved';
      clearInterval(humanTimer);
      setTimeout(closeHuman, 500);
    }));
    if ($('#plHuman')) {
      $('#plHuman').addEventListener('click', (e) => { if (e.target.id === 'plHuman') closeHuman(); });
    }
  }

  // ---------------------------------------------------------------- 桌面壳窗口控制
  (function bindWindowControls() {
    const box = $('#plWinCtl');
    if (!box) return;
    const api = window.__TAURI_INTERNALS__;
    const call = (cmd) => (api && api.invoke) ? api.invoke('plugin:window|' + cmd, { label: 'main' }) : Promise.resolve();
    box.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const k = b.dataset.win;
      if (k === 'min') call('minimize');
      else if (k === 'max') call('toggle_maximize');
      else if (k === 'close') call('close');
    }));
  })();

  $('#plExit') && $('#plExit').addEventListener('click', () => { location.href = '/'; });
  // 深链：#/runtime/audit、#/prep/topo —— 直接落到对应工作区与视图
    // 一次性注册：hash 路由 + 折叠快捷键（不要放进 bindView，否则每次渲染都会重复注册）
    window.addEventListener('hashchange', () => {
      if (readHash()) render();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleRail();
      }
    });

  readHash();
  (async () => {
    try {
      const ok = await ensureAuth();
      if (ok) {
        await loadEndpoint(); await loadElements(); await loadLcm(); await loadHuman();
        await loadTasks(); await loadIfaces(); await loadAudit();
      }
    } catch (e) { /* 后端不可达时退化为本地演示数据 */ }
    render();
  })();
  window.Plane = { S, render, openHuman, go };
})();


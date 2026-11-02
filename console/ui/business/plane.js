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

    // 升级任务（来自后端）
    taskSel: null,     // 当前查看的任务 id
    layer: 'runtime',
    view: 'mock-admin',
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
    topoLevel: 'element',
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
  function headers(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (S.csrf) h['X-CSRF'] = S.csrf;
    return h;
  }
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: 'include' }, opts || {}));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.status === 204 ? null : r.json();
  }

  /** 登录门：L 端需要凭据；W 端（authRequired=false）直接放行 */
  async function ensureAuth() {
    const meta = await api('/api/meta').catch(() => null);
    if (meta && meta.authRequired === false) return true;
    if (S.csrf) {
      const me = await api('/api/auth/me').catch(() => null);
      if (me && me.user) return true;
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
      layer: 'runtime', title: 'LAYER 1 · 运行态', items: [
        { id: 'mock-admin', t: 'MOCK 管理', s: 'PORT' },
        { id: 'mock-flow', t: 'MOCK 流程', s: 'FLOW' },
        { id: 'audit', t: '运行审计', s: 'LOG' },
      ],
    },
    {
      layer: 'prep', title: 'LAYER 2 · 准备态（下层）', items: [
        { id: 'elements', t: '网元自定义', s: 'NE' },
        { id: 'topo', t: '拓扑连接', s: 'TOPO' },
        { id: 'omc', t: 'OMC 平台', s: '纳管·账号·升级' },
        { id: 'lcm', t: 'LCM 平台', s: '版本·软件包' },
        { id: 'fs', t: 'FS 虚层', s: '站点·CPU·校验' },
      ],
    },
  ];

  function renderRail() {
    $('#plRail').innerHTML = NAV.map((g) => `
      <div class="pl-rail__grp">
        <div class="pl-rail__hd">${esc(g.title)}</div>
        ${g.items.map((it) => `
          <button class="pl-rail__item${S.view === it.id ? ' is-on' : ''}" data-view="${it.id}">
            <span>${esc(it.t)}</span><small>${esc(it.s)}</small>
          </button>`).join('')}
      </div>`).join('');
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
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-iface="${esc(i.id)}">编辑</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">人机交互节点（界面）</div>
          ${S.human.map((h, i) => `<div style="border:1px solid var(--line);padding:10px;margin-bottom:8px">
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
  function viewAudit() {
    const rows = Array.isArray(S.audit) ? S.audit : [];
    const tfmt = (ms) => {
      if (!ms) return '—';
      const d = new Date(Number(ms));
      return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    };
    return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + `
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
            <td>${r.human ? '<span class="pl-tag pl-tag--on">HUMAN 202</span>' : '<span class="pl-muted">—</span>'}</td>
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
          <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnNeAdd">＋ 新建网元</button></div>
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
            <dt>站点</dt><dd>${esc(S.site.name)} · ${esc(S.site.role)}</dd>
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


  /* ---------------------------------------------------------------- 视图：OMC */
  function viewOmc() {
    const o = S.omc;
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    return head('OMC 平台', 'Managed elements · accounts · integrated upgrade task with site', 'FILE NO. OMC-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">纳管范围</div>
          <dl class="pl-kv">
            <dt>网元</dt><dd>${o.elements.map((id) => esc((S.elements.find((e) => e.id === id) || {}).name || id)).join(' · ')}</dd>
            <dt>网元组</dt><dd>${o.groups.map((g) => esc((S.groups.find((x) => x.id === g) || {}).name || g)).join(' · ')}</dd>
            <dt>站点</dt><dd>${esc(S.site.name)} · ${esc(S.site.role)}</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">账号（按网元范围授权）</div>
          <table class="pl-table">
            <thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>
            <tbody>${o.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.role)}</td>
              <td class="pl-muted">${a.scope.length} 个网元</td></tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnAccAdd">＋ 创建账号</button></div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">一体化升级任务（点击进入时间线）</div>
          ${S.tasks.length ? S.tasks.map((k) => {
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
              <div class="pl-muted" style="font-size:8.5px;margin-top:6px">
                进度 ${k.progress}%${pending ? ' · 卡在人工确认' : ''}
              </div>
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
    return head('LCM 平台', 'Element versions · software packages · co-deploy with OMC', 'FILE NO. LCM-001') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">管理的网元与当前版本</div>
          <table class="pl-table">
            <thead><tr><th>Element</th><th>Software</th><th>Current</th><th>Prev</th><th></th></tr></thead>
            <tbody>${S.elements.map((e) => `<tr>
              <td>${esc(e.name)}</td><td class="pl-muted">${esc(e.sw)}</td>
              <td class="num">v${esc(e.version)}</td>
              <td class="pl-muted num">${e.prev || '—'}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-for="${esc(e.id)}">软件包</button></td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end" style="align-items:center">
            <span class="pl-muted" style="font-size:8.5px;margin-right:auto">与 OMC 共部署：${l.coDeploy ? '<span class="pl-dot pl-dot--on"></span>已开启' : '未开启'}</span>
            <button class="pl-btn pl-btn--sm" id="btnCoDeploy">${l.coDeploy ? '关闭共部署' : '开启共部署'}</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">软件包仓库</div>
          <table class="pl-table">
            <thead><tr><th>Package</th><th>类型</th><th>所属网元</th><th>厂商</th><th>版本</th></tr></thead>
            <tbody>${l.packages.map((p) => `<tr>
              <td>${esc(p.name)}</td><td class="pl-muted">${esc(p.kind)}</td>
              <td class="pl-muted">${esc((S.elements.find((e) => e.id === p.owner) || {}).name || p.owner)}</td>
              <td class="pl-muted">${esc(p.vendor)}</td><td class="num">v${esc(p.version)}</td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnPkgAdd">＋ 登记软件包</button></div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：FS */
  function viewFs() {
    const f = S.fs;
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
          <div class="pl-card__t">软件包校验流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            ${f.verifySteps.map((s) => `<li>${esc(s)}</li>`).join('')}
          </ol>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">平台升级流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            ${f.upgrade.map((s) => `<li>${esc(s)}</li>`).join('')}
          </ol>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFsUpgrade">演练一次</button></div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 视图：网元详情（升级流程 + 参数校验 + 人机交互） */
  function viewNeDetail() {
    const e = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
    return head('网元 · ' + e.name, 'Upgrade flow · parameter validation · human-in-the-loop', 'FILE NO. NE-002') + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">升级流程步骤（可挂人机交互）</div>
          <table class="pl-table">
            <thead><tr><th>#</th><th>Step</th><th>Human</th><th></th></tr></thead>
            <tbody>${S.neFlow.map((s, i) => `<tr>
              <td class="num">${i + 1}</td><td>${esc(s.s)}</td>
              <td>${s.human ? '<span class="pl-tag pl-tag--on">含确认</span>' : '<span class="pl-muted">—</span>'}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-flow-toggle="${i}">${s.human ? '移除' : '插入'}人机交互</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">参数校验规则</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Rule</th><th>Fail</th></tr></thead>
            <tbody>${S.neChecks.map((c) => `<tr><td>${esc(c.f)}</td><td class="pl-muted">${esc(c.rule)}</td>
              <td class="pl-muted">${esc(c.msg)}</td></tr>`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnCheckAdd">＋ 增加校验</button></div>
          <div class="pl-card__t" style="margin-top:14px">旧版本</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="pl-tag">v5.1.9</span><span class="pl-tag">v5.1.4</span><span class="pl-tag">v5.0.7</span>
          </div>
        </div>
      </div>
      <div class="pl-card" style="margin-top:14px">
        <div class="pl-card__t">人机交互状态机（自定义状态与操作结果）</div>
        <table class="pl-table">
          <thead><tr><th>State</th><th>Label</th><th>Tone</th></tr></thead>
          <tbody>${S.humanStates.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.label)}</td>
            <td><span class="pl-tag ${s.tone === 'signal' ? 'pl-tag--on' : s.tone === 'danger' ? 'pl-tag--bad' : ''}">${esc(s.tone)}</span></td></tr>`).join('')}</tbody>
        </table>
        <div class="pl-card__t" style="margin-top:14px">选项 → 操作结果</div>
        <table class="pl-table">
          <thead><tr><th>Option</th><th>Effect</th><th>Set field</th></tr></thead>
          <tbody>${S.humanOutcomes.map((o) => `<tr><td>${esc(o.opt)}</td><td>${esc(o.effect)}</td>
            <td class="pl-muted">${esc(o.setField)}</td></tr>`).join('')}</tbody>
        </table>
        <div class="pl-row-end">
          <button class="pl-btn pl-btn--sm" id="btnHumanPreview2">预览确认界面</button>
        </div>
      </div>`;
  }



  /* ---------------------------------------------------------------- 视图：升级任务时间线 */
  function viewTask() {
    const t2 = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
    if (!t2) {
      return head('升级任务', 'Integrated upgrade · stages · human-in-the-loop', 'FILE NO. UPG') + `
        <div class="pl-card"><div class="pl-muted" style="font-size:10px;padding:10px 0">
          还没有升级任务。到「OMC 平台」点「创建升级任务」，或在下面直接建一个。
        </div>
        <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div></div>`;
    }
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    const pendingHuman = t2.stages.find((s) => s.human && s.human.state === 'pending' && s.state === 'running');
    return head('升级任务 · ' + t2.id, 'Stage timeline · human-in-the-loop state machine', 'FILE NO. ' + t2.id) + `
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">阶段时间线</div>
          <div style="position:relative;padding-left:20px">
            <div style="position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--line-2)"></div>
            ${t2.stages.map((s, i) => `
              <div style="position:relative;padding:0 0 18px 6px">
                <div style="position:absolute;left:-19px;top:5px;width:9px;height:9px;background:${
                  s.state === 'done' ? 'var(--signal)' : s.state === 'running' ? 'var(--ink)' : s.state === 'failed' ? '#7d2f22' : 'var(--line-2)'
                }"></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <b style="font-size:11.5px">${i + 1}. ${esc(s.label)}</b>
                  <span class="pl-tag ${
                    s.state === 'done' ? 'pl-tag--on' : s.state === 'failed' ? 'pl-tag--bad' : ''
                  }">${esc(ST[s.state] || s.state)}</span>
                </div>
                ${s.human ? `<div class="pl-muted" style="font-size:8.5px;margin-top:3px">
                  人机交互 · ${esc(s.human.state)} · 超时 ${s.human.timeout_s}s
                </div>` : ''}
              </div>`).join('')}
          </div>
          <div style="height:2px;background:var(--line-2);margin-top:4px">
            <i style="display:block;height:2px;width:${t2.progress}%;background:var(--signal)"></i>
          </div>
          <div class="pl-muted" style="font-size:8.5px;margin-top:6px">进度 ${t2.progress}% · v${esc(t2.from_version)} → v${esc(t2.to_version)} · 站点 ${esc(t2.site)} · 网元 ${t2.element_ids.length} 个</div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">人工确认（Human-in-the-loop）</div>
          ${pendingHuman ? `
            <div style="border:1px solid var(--signal);padding:12px;background:rgba(166,125,72,.06)">
              <div style="font-size:8.5px;letter-spacing:.2em;color:#8a6a3c">${esc(pendingHuman.key.toUpperCase())} · PENDING</div>
              <div style="margin:8px 0 10px;font-size:11.5px;line-height:1.8">${esc(pendingHuman.human.prompt)}</div>
              <div style="display:grid;gap:7px">
                ${pendingHuman.human.options.map((o, oi) => `<button class="pl-human__opt" data-human-opt="${oi}">
                  <span>${esc(o.label)}</span><small>EFFECT · ${esc(o.effect)}</small></button>`).join('')}
              </div>
              <div class="pl-muted" style="margin-top:8px;font-size:8px">提交后会真正推进任务阶段（continue）或挂起/终止</div>
            </div>` : `<div class="pl-muted" style="font-size:10px;padding:8px 0">当前没有待确认的人机交互节点。</div>`}
          <div class="pl-card__t" style="margin-top:14px">所有任务</div>
          <table class="pl-table"><tbody>
            ${S.tasks.map((x) => `<tr>
              <td>${esc(x.id)}</td>
              <td class="pl-muted">${esc(x.stages[x.stage] ? x.stages[x.stage].key : '—')}</td>
              <td class="num">${x.progress}%</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-task="${esc(x.id)}">查看</button></td>
            </tr>`).join('')}
          </tbody></table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div>
        </div>
      </div>`;
  }

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
      mk('site', 360, 24, 170, 40, S.site.name, 'SITE', 'site');
      S.elements.forEach((e, i) => {
        const x = 80 + i * 250;
        mk(e.id, x, 140, 180, 42, e.name, e.type + ' · v' + e.version, 'ne');
        links.push(['site', e.id]);
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
        S.topoSel = g.dataset.node;
        renderTopo();
        renderTopoDetail();
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
  };

  function render() {
    renderRail();
    const fn = VIEWS[S.view] || viewMockAdmin;
    $('#plMain').innerHTML = fn();
    $$('.pl-layer').forEach((b) => b.classList.toggle('is-on', b.dataset.layer === S.layer));
    bindView();
    if (S.view === 'topo') { renderTopo(); renderTopoDetail(); }
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
    const na = $('#btnNeAdd');
    if (na) na.addEventListener('click', () => {
      const n = S.elements.length + 1;
      S.elements.push({ id: 'ne-000' + n, name: 'gNB-HZ-09' + (4 + n), arch: 'SA', type: 'gNB', version: '5.2.1', sw: 'NR-RAN', group: 'g-hz-01', comps: ['主控板', '业务板', '电源'] });
      render();
    });
    $$('[data-ne-detail]').forEach((b) => b.addEventListener('click', () => {
      S.topoSel = b.dataset.neDetail; S.view = 'ne-detail'; render();
    }));
    $$('[data-ne-copy]').forEach((b) => b.addEventListener('click', () => {
      const src = S.elements.find((x) => x.id === b.dataset.neCopy);
      if (!src) return;
      const n = S.elements.length + 1;
      S.elements.push(Object.assign({}, src, { id: 'ne-000' + n, name: src.name + '-copy' }));
      render();
    }));

    // 拓扑层级
    $$('[data-level]').forEach((b) => b.addEventListener('click', () => { S.topoLevel = b.dataset.level; render(); }));

    // 2D / 3D 切换
    const b2 = $('#btn2d'), b3 = $('#btn3d'), box3 = $('#topo3d');
    if (b2 && b3 && box3) {
      b2.addEventListener('click', () => {
        box3.style.display = 'none';
        $('#topoSvg').style.display = '';
        b2.style.cssText = 'background:#17140f;color:#eae5e1;border-color:#17140f';
        b3.style.cssText = '';
        if (window.PlaneTopo3D) window.PlaneTopo3D.unmount();
      });
      b3.addEventListener('click', () => {
        box3.style.display = 'block';
        $('#topoSvg').style.display = 'none';
        b3.style.cssText = 'background:#17140f;color:#eae5e1;border-color:#17140f';
        b2.style.cssText = '';
        if (window.PlaneTopo3D) window.PlaneTopo3D.mount(box3, S, (id) => { S.topoSel = id; renderTopoDetail(); });
      });
    }

    // 左侧导航
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      S.view = b.dataset.view;
      S.layer = ['mock-admin', 'mock-flow', 'audit'].includes(S.view) ? 'runtime' : 'prep';
      render();
    }));
    // 两层切换：切到该层第一个视图
    $$('.pl-layer').forEach((b) => b.addEventListener('click', () => {
      S.layer = b.dataset.layer;
      S.view = S.layer === 'runtime' ? 'mock-admin' : 'elements';
      render();
    }));

    // 接口规则编辑器
    $$('[data-iface]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceSel = b.dataset.iface; S.view = 'iface'; render();
    }));
    const ifSave = $('#ifSave');
    if (ifSave) ifSave.addEventListener('click', async () => {
      const r = S.ifaceRules[S.ifaceSel];
      if (!r) return;
      const msg = $('#ifSaveMsg');
      try {
        await api('/api/business/mappings/' + S.ifaceSel, {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ status: r.status, delay_ms: r.delay }),
        });
        await api('/api/business/mappings/' + S.ifaceSel + '/rules', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({
            fields: r.fields.map((f) => ({
              name: f.name, kind: f.type, source: f.src, value: f.value || '',
              step: f.step || 1, max: f.max || 0, condition: f.value || '',
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
    const quick = $('#btnTaskQuick');
    if (quick) quick.addEventListener('click', async () => {
      try {
        const t3 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),
        });
        S.tasks.unshift(t3);
        S.taskSel = t3.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    });

    // 平台页
    const accAdd = $('#btnAccAdd');
    if (accAdd) accAdd.addEventListener('click', () => {
      S.omc.accounts.push({ id: 'acc-0' + (S.omc.accounts.length + 1), name: 'omc-user' + (S.omc.accounts.length + 1), scope: ['ne-0001'], role: '只读' });
      render();
    });
    const taskAdd = $('#btnTaskAdd');
    if (taskAdd) taskAdd.addEventListener('click', async () => {
      try {
        const t3 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),
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
    if (co) co.addEventListener('click', () => { S.lcm.coDeploy = !S.lcm.coDeploy; render(); });
    const pkgAdd = $('#btnPkgAdd');
    if (pkgAdd) pkgAdd.addEventListener('click', () => {
      S.lcm.packages.push({ id: 'pkg-00' + (S.lcm.packages.length + 1), name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.2', verified: true });
      render();
    });
    const fsUp = $('#btnFsUpgrade');
    if (fsUp) fsUp.addEventListener('click', () => openHuman({
      prompt: 'FS 虚层升级将停止业务并切换主备站点，请确认可以继续',
      timeout: 45,
      options: [{ l: '确认切换', next: 'install' }, { l: '取消升级', next: 'abort' }],
    }));
    $$('[data-flow-toggle]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.flowToggle;
      S.neFlow[i].human = !S.neFlow[i].human;
      render();
    }));
    const chkAdd = $('#btnCheckAdd');
    if (chkAdd) chkAdd.addEventListener('click', () => {
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

  $('#plExit') && $('#plExit').addEventListener('click', () => { location.href = '/'; });
  (async () => {
    try {
      const ok = await ensureAuth();
      if (ok) { await loadEndpoint(); await loadTasks(); await loadIfaces(); await loadAudit(); }
    } catch (e) { /* 后端不可达时退化为本地演示数据 */ }
    render();
  })();
  window.Plane = { S, render, openHuman };
})();

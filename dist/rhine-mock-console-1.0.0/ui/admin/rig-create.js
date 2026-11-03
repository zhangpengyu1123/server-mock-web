/* ============================================================================
   RHINE LAB · 新建（虚机主板 / 服务器卡）
   ----------------------------------------------------------------------------
   档案纸风格的两个入口按钮 + 表单弹窗：
     · ＋ 新建虚机   → POST /api/admin/nodes        { name, addr, version }
     · ＋ 新建服务器 → POST /api/business/mappings  { name, method, path, version }
   成功后重新拉取 nodes + mappings 并刷新 3D 场景（不整页刷新）
   ==========================================================================*/
(function () {
  'use strict';

  const CSS = `
  .rig-new { display: flex; gap: 8px; }
  .rig-new button {
    appearance: none; cursor: pointer; font: inherit;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9px; letter-spacing: .18em; text-transform: uppercase;
    padding: 7px 11px; color: #17140f; background: rgba(243,238,231,.86);
    border: 1px solid rgba(23,20,15,.28); transition: all .12s ease;
  }
  .rig-new button:hover { background: #17140f; color: #f3eee7; border-color: #17140f; }
  .rig-new button i { font-style: normal; color: #d79a44; margin-right: 6px; }
  .top__acts .rig-new button { padding: 6px 9px; background: transparent; }
  .top__acts .rig-new button:hover { background: #17140f; color: #f3eee7; }

  .rig-form { position: fixed; z-index: 75; width: 372px; background: #f3eee7;
    background-image: linear-gradient(180deg, rgba(255,255,255,.5), rgba(238,232,223,.5));
    color: #17140f; border: 1px solid rgba(23,20,15,.22);
    box-shadow: 0 18px 44px rgba(64,52,40,.18); opacity: 0; transform: translateY(6px);
    transition: opacity .14s ease, transform .14s ease; pointer-events: none;
    font-family: "JetBrains Mono", ui-monospace, monospace; }
  .rig-form.on { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .rig-form__hd { display: flex; justify-content: space-between; align-items: flex-start;
    padding: 13px 15px 9px; border-bottom: 1px solid rgba(23,20,15,.16); }
  .rig-form__ttl { font-size: 13px; font-weight: 600; letter-spacing: .02em; }
  .rig-form__sub { margin-top: 3px; font-size: 8.5px; letter-spacing: .2em;
    text-transform: uppercase; color: rgba(23,20,15,.45); }
  .rig-form__x { cursor: pointer; color: rgba(23,20,15,.42); padding: 2px 4px; }
  .rig-form__x:hover { color: #17140f; }
  .rig-form__bd { padding: 12px 15px 4px; }
  .rig-field { margin-bottom: 10px; }
  .rig-field > label { display: block; font-size: 8.5px; letter-spacing: .18em;
    text-transform: uppercase; color: rgba(23,20,15,.5); margin-bottom: 4px; }
  .rig-field input, .rig-field select {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 11px;
    padding: 8px 9px; color: #17140f; background: rgba(255,255,255,.55);
    border: 1px solid rgba(23,20,15,.26); border-radius: 0; outline: none;
  }
  .rig-field input:focus, .rig-field select:focus { border-color: #17140f; background: #fff; }
  .rig-field--row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .rig-host { padding: 8px 9px; background: rgba(23,20,15,.05); border: 1px dashed rgba(23,20,15,.3);
    font-size: 10.5px; letter-spacing: .04em; }
  .rig-host b { font-weight: 600; }
  .rig-host em { font-style: normal; color: rgba(23,20,15,.45); font-size: 9px; margin-left: 6px; }
  .rig-host i { color: #7d2f22; font-style: normal; }
  #btnNewSvc[disabled] { opacity: .48; cursor: not-allowed; }
  #btnNewSvc[disabled]:hover { background: transparent; color: #17140f; border-color: rgba(23,20,15,.28); }
  .rig-form__err { font-size: 10px; color: #7d2f22; min-height: 14px; padding: 0 0 6px; }
  .rig-form__ft { display: grid; grid-template-columns: 1fr 1fr; padding: 6px 15px 14px; }
  .rig-form__ft button { appearance: none; cursor: pointer; font: inherit; font-size: 10px;
    letter-spacing: .16em; text-transform: uppercase; padding: 10px 8px; margin: -1px 0 0 -1px;
    color: #17140f; background: transparent; border: 1px solid rgba(23,20,15,.3); }
  .rig-form__ft button[type="submit"] { background: #17140f; color: #f3eee7; border-color: #17140f; }
  .rig-form__ft button:hover { background: #17140f; color: #f3eee7; }

  /* 平台类型三选：每项带色点 + 中文名 + 一行说明，选中有边框加重 */
  .rig-kind { display: grid; gap: 6px; }
  .rig-kind__opt {
    display: grid; grid-template-columns: 10px 1fr; gap: 8px; align-items: start;
    padding: 8px 10px; cursor: pointer; text-align: left;
    background: rgba(255,255,255,.42); border: 1px solid rgba(23,20,15,.22);
    font: inherit; color: #17140f; transition: background .12s ease, border-color .12s ease;
  }
  .rig-kind__opt:hover { background: #fff; }
  .rig-kind__opt.is-on { border-color: #17140f; background: #fff; box-shadow: inset 0 -2px 0 #d79a44; }
  .rig-kind__dot { width: 8px; height: 8px; margin-top: 4px; }
  .rig-kind__opt[data-kind="LCM"] .rig-kind__dot { background: #d79a44; }
  .rig-kind__opt[data-kind="OMC"] .rig-kind__dot { background: #3f8f93; }
  .rig-kind__opt[data-kind="FS"]  .rig-kind__dot { background: #4a6b47; }
  .rig-kind__nm { font-size: 11px; letter-spacing: .06em; font-weight: 600; }
  .rig-kind__nm em { font-style: normal; font-size: 8.5px; letter-spacing: .16em; color: rgba(23,20,15,.45); margin-left: 6px; }
  .rig-kind__ds { display: block; margin-top: 2px; font-size: 9px; letter-spacing: .04em; color: rgba(23,20,15,.55); }
  `;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ------------------------------------------------------------ 入口按钮 */
  const bar = document.createElement('div');
  bar.className = 'rig-new';
  bar.innerHTML = '<button data-new="vm" id="btnNewVm"><i>+</i>New VM</button>' +
    '<button data-new="svc" id="btnNewSvc" disabled title="先点选一台虚机主板"><i>+</i>New Service</button>';
  // 挂载优先级：页面顶栏动作槽（与统计同行、留分隔线）→ HUD 动作区 → 绝对定位兜底
  function mountBar() {
    const slot = document.getElementById('topActs') || document.getElementById('rigActs');
    if (slot) {
      if (bar.parentElement !== slot) { bar.style.position = ''; bar.style.top = ''; bar.style.right = ''; slot.appendChild(bar); }
      return true;
    }
    const host = document.getElementById('rig') || document.body;
    if (bar.parentElement === host) return true;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    bar.style.position = 'absolute';
    bar.style.top = '14px';
    bar.style.right = '16px';
    host.appendChild(bar);
    return true;
  }
  mountBar();

  /* ------------------------------------------------------------ 表单 */
  const form = document.createElement('form');   // 必须是 form：div 不会触发 submit
  form.noValidate = true;
  form.className = 'rig-form on';
  form.style.display = 'none';
  document.body.appendChild(form);

  let mode = 'svc';

  // 当前选中的虚机（主板）：服务器卡必须挂在它上面，两个按钮不是并列关系
  let vmTarget = null;

  let formSlot = -1;   // 从空插仓点进来时锁定的插仓号
  let vmStats = { total: 0, used: 0, free: [] };

  function setVmTarget(node) {
    vmTarget = node || null;
    const svc = document.getElementById('btnNewSvc');
    if (!svc) return;
    if (vmTarget) {
      // 容量：主板插仓满了就别让人白填表
      vmStats = (window.RhineScene && window.RhineScene.bayStats)
        ? window.RhineScene.bayStats(vmTarget.id) : { total: 0, used: 0, free: [] };
      const full = vmStats.total > 0 && vmStats.used >= vmStats.total;
      const name = vmTarget.name || vmTarget.id;
      svc.disabled = full;
      if (full) {
        svc.title = '该板已满 ' + vmStats.used + '/' + vmStats.total + ' — 换一块空板，或先删一张卡';
        svc.innerHTML = '<i>+</i>New Service · 已满 ' + vmStats.used + '/' + vmStats.total;
      } else {
        svc.title = '在 ' + name + ' 上新建服务器卡（已占 ' + vmStats.used + '/' + (vmStats.total || '?') + '）';
        svc.innerHTML = '<i>+</i>New Service · ' + name + (vmStats.total ? ' (' + vmStats.used + '/' + vmStats.total + ')' : '');
      }
    } else {
      svc.disabled = true;
      svc.title = '先点选一台虚机主板';
      svc.innerHTML = '<i>+</i>New Service';
    }
  }

  window.addEventListener('rig:selected', (e) => {
    const d = e.detail || {};
    if (d.type === 'node') setVmTarget(d.node);
    else if (!d.type) setVmTarget(null);
  });

  // 点空插仓：直接就地弹表单，并把插仓号带进去
  window.addEventListener('rig:bay', (e) => {
    const d = e.detail || {};
    const s = window.RhineScene && window.RhineScene.instance;
    const b = s && s.byNode.get(d.nodeId);
    if (!b || !b.node) return;
    setVmTarget(b.node);
    openForm('svc', b.node, null, d.slot);
  });

  function htmlFor(m) {
    if (m === 'vm') {
      return `<div class="rig-form__hd"><div>
          <div class="rig-form__ttl">新建虚机主板</div>
          <div class="rig-form__sub">New Virtual Machine · Fleet</div></div>
          <div class="rig-form__x">✕</div></div>
        <div class="rig-form__bd">
          <div class="rig-field"><label>Name</label><input name="name" placeholder="RHINE-L-04" /></div>
          <div class="rig-field"><label>Address</label><input name="addr" placeholder="10.0.0.24:9443" /></div>
          <div class="rig-field"><label>Version</label><input name="version" value="0.1.0" /></div>
          <div class="rig-form__err"></div>
        </div>
        <div class="rig-form__ft"><button type="button" data-cancel>取消</button><button type="submit">登记虚机</button></div>`;
    }
    return `<div class="rig-form__hd"><div>
        <div class="rig-form__ttl">新建服务器卡</div>
        <div class="rig-form__sub">New Service · Mock Mapping</div></div>
        <div class="rig-form__x">✕</div></div>
      <div class="rig-form__bd">
        <div class="rig-field">
          <label>Host VM · 所属主板</label>
          <div class="rig-host" id="rigHost">${vmTarget ? '<b>' + (vmTarget.name || vmTarget.id) + '</b> <em>' + vmTarget.id + '</em>' : '<i>未选择虚机 — 请先在机架上点选一台主板</i>'}</div>
        </div>
        <div class="rig-field">
          <label>Bay · 插仓</label>
          <div class="rig-host" id="rigBay">${formSlot >= 0 ? 'BAY ' + (formSlot + 1) + ' · 指定插仓' : '自动选择空插仓'}</div>
          <input type="hidden" name="slot" value="${formSlot}" />
        </div>
        <div class="rig-field">
          <label>Platform · 平台类型</label>
          <div class="rig-kind" id="rigKind">
            <button type="button" class="rig-kind__opt is-on" data-kind="LCM">
              <span class="rig-kind__dot"></span>
              <span><span class="rig-kind__nm">LCM 生命周期<em>版本 / 软件包</em></span>
              <span class="rig-kind__ds">管网元版本与软件包；琥珀色铭牌，长卡位</span></span>
            </button>
            <button type="button" class="rig-kind__opt" data-kind="OMC">
              <span class="rig-kind__dot"></span>
              <span><span class="rig-kind__nm">OMC 网元管理<em>纳管 / 账号 / 升级</em></span>
              <span class="rig-kind__ds">发起升级与纳管；青色铭牌，气道色同步</span></span>
            </button>
            <button type="button" class="rig-kind__opt" data-kind="FS">
              <span class="rig-kind__dot"></span>
              <span><span class="rig-kind__nm">FS 虚层<em>站点 / CPU / 校验</em></span>
              <span class="rig-kind__ds">虚层平台能力；绿色铭牌，高卡位</span></span>
            </button>
          </div>
          <input type="hidden" name="kind" value="LCM" />
        </div>
        <div class="rig-field"><label>Service name</label><input name="name" placeholder="注册网元" /></div>
        <div class="rig-field rig-field--row">
          <div><label>Method</label><select name="method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></div>
          <div><label>Version</label><input name="version" value="0.1.0" /></div>
        </div>
        <div class="rig-field"><label>Path</label><input name="path" placeholder="/nemp/v1/ne/list" /></div>
        <div class="rig-form__err"></div>
      </div>
      <div class="rig-form__ft"><button type="button" data-cancel>取消</button><button type="submit">部署服务</button></div>`;
  }

  function openForm(m, a, b) {
    mode = m;
    // 兼容两种调用：openForm('svc', node) 与 openForm('svc', x, y)
    let nodeArg = null, x, y;
    if (a && typeof a === 'object') { nodeArg = a; } else { x = a; y = b; }
    // 只有第 4 个参数（arguments[3]）才是插仓号，避免与 x/y 坐标混淆
    formSlot = (m === 'svc' && typeof arguments[3] === 'number') ? arguments[3] : -1;
    if (m === 'svc') setVmTarget(nodeArg || vmTarget);
    form.innerHTML = htmlFor(m);
    form.style.display = '';
    form.classList.add('on');
    const w = 372, h = form.offsetHeight || 320;
    form.style.left = Math.max(16, Math.min(x || innerWidth / 2 - w / 2, innerWidth - w - 16)) + 'px';
    form.style.top = Math.max(70, Math.min(y || 120, innerHeight - h - 16)) + 'px';
    // 平台类型三选：选中同步 hidden + 改 name 占位提示
    const kindBox = form.querySelector('#rigKind');
    if (kindBox) {
      const hidden = form.querySelector('input[name="kind"]');
      const nameInp = form.querySelector('input[name="name"]');
      const PH = { LCM: '登记网元版本', OMC: '纳管网元', FS: '查询站点信息' };
      kindBox.querySelectorAll('.rig-kind__opt').forEach((b) => b.addEventListener('click', () => {
        kindBox.querySelectorAll('.rig-kind__opt').forEach((x) => x.classList.toggle('is-on', x === b));
        if (hidden) hidden.value = b.dataset.kind;
        if (nameInp && PH[b.dataset.kind]) nameInp.placeholder = PH[b.dataset.kind];
      }));
    }
    setTimeout(() => { const i = form.querySelector('input:not([type=hidden])'); if (i) i.focus(); }, 40);
  }
  function closeForm() { form.classList.remove('on'); form.style.display = 'none'; }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-new]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    openForm(b.dataset.new === 'vm' ? 'vm' : 'svc', r.left - 300, r.bottom + 10);
  });

  form.addEventListener('click', (e) => {
    if (e.target.closest('.rig-form__x') || e.target.closest('[data-cancel]')) closeForm();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeForm(); });

  function csrf() {
    return window.RHINE_CSRF || (document.cookie.match(/(?:^|;\s*)rhine_csrf=([^;]+)/) || [])[1] || '';
  }

  async function refreshScene() {
    try {
      const [nodes, mappings] = await Promise.all([
        fetch('/api/admin/nodes', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/business/mappings', { credentials: 'include' }).then((r) => r.json()),
      ]);
      if (window.RhineScene && window.RhineScene.setData) {
        window.RhineScene.setData({ nodes, mappings });
      }
      window.dispatchEvent(new CustomEvent('rig:data', { detail: { nodes, mappings } }));
      // 刷新后重算当前主板的插仓容量（刚插满就应立刻禁用按钮）
      setVmTarget(vmTarget);
      return { nodes: nodes.length, mappings: mappings.length };
    } catch (e) { return null; }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.rig-form__err');
    const val = (n) => (form.querySelector(`[name="${n}"]`) || {}).value || '';
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    err.textContent = '';
    try {
      if (mode === 'vm') {
        const body = { name: val('name') || 'RHINE-L-NEW', addr: val('addr') || '10.0.0.99:9443', version: val('version') || '0.1.0' };
        const r = await fetch('/api/admin/nodes', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf() },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const n = await r.json();
        closeForm();
        if (window.RigUI && window.RigUI.say) window.RigUI.say('已登记虚机 ' + n.name + ' (' + n.id + ')');
      } else {
        if (!vmTarget) throw new Error('请先点选一台虚机主板，再新建服务器卡');
        const kind = val('kind') || 'LCM';
        const body = {
          name: val('name') || val('path'), method: val('method') || 'GET',
          path: val('path') || '/mock/new', version: val('version') || '0.1.0',
          kind,
          node_id: vmTarget.id,
          slot: Number(val('slot')) >= 0 ? Number(val('slot')) : -1,
          status: 200, body: '{}',
        };
        const r = await fetch('/api/business/mappings', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf() },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const m = await r.json();
        closeForm();
        if (window.RigUI && window.RigUI.say) window.RigUI.say('已部署 ' + (m.kind || 'LCM') + ' 服务「' + (m.name || m.path) + '」v' + m.version);
      }
      await refreshScene();
    } catch (ex) {
      err.textContent = '创建失败：' + ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  window.RigCreate = { openForm, closeForm, refreshScene, mountBar, setVmTarget, getVmTarget: () => vmTarget };
})();

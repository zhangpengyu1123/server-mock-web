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
  .rig-new { position: absolute; top: 14px; right: 16px; z-index: 20; display: flex; gap: 8px; }
  .rig-new button {
    appearance: none; cursor: pointer; font: inherit;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9px; letter-spacing: .18em; text-transform: uppercase;
    padding: 7px 11px; color: #17140f; background: rgba(243,238,231,.86);
    border: 1px solid rgba(23,20,15,.28); transition: all .12s ease;
  }
  .rig-new button:hover { background: #17140f; color: #f3eee7; border-color: #17140f; }
  .rig-new button i { font-style: normal; color: #d79a44; margin-right: 6px; }

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
  .rig-form__err { font-size: 10px; color: #7d2f22; min-height: 14px; padding: 0 0 6px; }
  .rig-form__ft { display: grid; grid-template-columns: 1fr 1fr; padding: 6px 15px 14px; }
  .rig-form__ft button { appearance: none; cursor: pointer; font: inherit; font-size: 10px;
    letter-spacing: .16em; text-transform: uppercase; padding: 10px 8px; margin: -1px 0 0 -1px;
    color: #17140f; background: transparent; border: 1px solid rgba(23,20,15,.3); }
  .rig-form__ft button[type="submit"] { background: #17140f; color: #f3eee7; border-color: #17140f; }
  .rig-form__ft button:hover { background: #17140f; color: #f3eee7; }
  `;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ------------------------------------------------------------ 入口按钮 */
  const bar = document.createElement('div');
  bar.className = 'rig-new';
  bar.innerHTML = '<button data-new="vm"><i>+</i>New VM</button><button data-new="svc"><i>+</i>New Service</button>';
  const host = document.getElementById('rig') || document.body;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(bar);

  /* ------------------------------------------------------------ 表单 */
  const form = document.createElement('form');   // 必须是 form：div 不会触发 submit
  form.noValidate = true;
  form.className = 'rig-form on';
  form.style.display = 'none';
  document.body.appendChild(form);

  let mode = 'svc';

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

  function openForm(m, x, y) {
    mode = m;
    form.innerHTML = htmlFor(m);
    form.style.display = '';
    form.classList.add('on');
    const w = 372, h = form.offsetHeight || 320;
    form.style.left = Math.max(16, Math.min(x || innerWidth / 2 - w / 2, innerWidth - w - 16)) + 'px';
    form.style.top = Math.max(70, Math.min(y || 120, innerHeight - h - 16)) + 'px';
    setTimeout(() => { const i = form.querySelector('input'); if (i) i.focus(); }, 40);
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
        const body = {
          name: val('name') || val('path'), method: val('method') || 'GET',
          path: val('path') || '/mock/new', version: val('version') || '0.1.0',
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
        if (window.RigUI && window.RigUI.say) window.RigUI.say('已部署服务 ' + (m.name || m.path) + ' v' + m.version);
      }
      await refreshScene();
    } catch (ex) {
      err.textContent = '创建失败：' + ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  window.RigCreate = { openForm, closeForm, refreshScene };
})();

/* ============================================================================
   RHINE LAB · 交互层（rig-ui.js）
   ----------------------------------------------------------------------------
   1) 悬停：跟随光标的科技感详情卡（主板 / 服务器两种内容）
   2) 点击：操作弹窗 —— 启用 / 停用 / 更新 / 共享（真实调用后端接口）
   依赖：window.RhineScene.instance（boards / modules / hovered）
   样式自带（内联注入），不依赖 css 文件，避免影响既有 HUD
   ==========================================================================*/
(function () {
  'use strict';

  // CSRF：管理面 app.js 会把 token 存在它自己的 api 客户端里；这里做多路兼容
  function csrf() {
    try {
      if (window.RHINE_CSRF) return window.RHINE_CSRF;
      if (window.RHINE_API && window.RHINE_API.csrf) return window.RHINE_API.csrf;
      if (window.S && window.S.api && window.S.api.csrf) return window.S.api.csrf;
      const m = document.cookie.match(/(?:^|;\s*)rhine_csrf=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) { /* ignore */ }
    return '';
  }

  const API = {
    async patch(id, body) {
      const r = await fetch('/api/business/mappings/' + encodeURIComponent(id), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('PATCH ' + r.status);
      return r.json();
    },
    async deploy(nodeId, version) {
      const r = await fetch('/api/admin/nodes/' + encodeURIComponent(nodeId) + '/deploy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf() },
        body: JSON.stringify({ version }),
      });
      if (!r.ok) throw new Error('DEPLOY ' + r.status);
      return r.json();
    },
  };

  /* ------------------------------------------------------------ 样式 */
  const CSS = `
  .rig-tip, .rig-modal { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; }
  .rig-tip {
    position: fixed; z-index: 60; min-width: 268px; max-width: 340px;
    background: rgba(20, 18, 16, .94); color: #f4efe7;
    border: 1px solid rgba(215,154,68,.55);
    box-shadow: 0 12px 40px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.04);
    padding: 12px 14px 11px; pointer-events: none; opacity: 0;
    transform: translateY(4px); transition: opacity .12s ease, transform .12s ease;
    backdrop-filter: blur(2px);
  }
  .rig-tip.on { opacity: 1; transform: translateY(0); }
  .rig-tip__hd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .rig-tip__k { font-size: 10px; letter-spacing: .14em; padding: 2px 6px;
    border: 1px solid rgba(215,154,68,.6); color: #d79a44; }
  .rig-tip__t { font-size: 14px; letter-spacing: .02em; font-weight: 600; }
  .rig-tip__row { display: flex; justify-content: space-between; gap: 14px;
    font-size: 11px; color: rgba(244,239,231,.62); padding: 2px 0; }
  .rig-tip__row b { color: #f4efe7; font-weight: 500; }
  .rig-tip__bar { margin-top: 8px; height: 2px; background: rgba(244,239,231,.14); position: relative; overflow: hidden; }
  .rig-tip__bar i { position: absolute; inset: 0 auto 0 0; background: #d79a44; width: 40%; animation: rigSweep 1.6s linear infinite; }
  @keyframes rigSweep { from { transform: translateX(-100%);} to { transform: translateX(260%);} }

  .rig-modal { position: fixed; z-index: 70; width: 380px;
    background: rgba(18,16,14,.97); color: #f4efe7; border: 1px solid rgba(215,154,68,.55);
    box-shadow: 0 24px 70px rgba(0,0,0,.45); opacity: 0; transform: translateY(8px);
    transition: opacity .14s ease, transform .14s ease; pointer-events: none; }
  .rig-modal.on { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .rig-modal__hd { padding: 14px 16px 10px; border-bottom: 1px solid rgba(244,239,231,.10);
    display: flex; justify-content: space-between; align-items: baseline; }
  .rig-modal__ttl { font-size: 14px; font-weight: 600; letter-spacing: .02em; }
  .rig-modal__x { cursor: pointer; color: rgba(244,239,231,.5); font-size: 16px; line-height: 1; }
  .rig-modal__x:hover { color: #d79a44; }
  .rig-modal__bd { padding: 12px 16px 6px; }
  .rig-modal__meta { font-size: 11px; color: rgba(244,239,231,.55); line-height: 1.7; margin-bottom: 10px; }
  .rig-modal__meta b { color: #f4efe7; font-weight: 500; }
  .rig-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 16px 16px; }
  .rig-btn { appearance: none; cursor: pointer; padding: 9px 10px; font: inherit; font-size: 12px;
    letter-spacing: .06em; color: #f4efe7; background: rgba(244,239,231,.05);
    border: 1px solid rgba(244,239,231,.18); text-align: center; transition: all .12s ease; }
  .rig-btn:hover { border-color: #d79a44; color: #d79a44; background: rgba(215,154,68,.08); }
  .rig-btn[data-act="stop"]:hover { border-color: #a33a2b; color: #d9705f; background: rgba(163,58,43,.10); }
  .rig-btn.is-busy { opacity: .5; pointer-events: none; }
  .rig-toast { position: fixed; left: 50%; bottom: 42px; transform: translateX(-50%);
    z-index: 80; background: rgba(20,18,16,.96); color: #f4efe7; border: 1px solid rgba(215,154,68,.5);
    font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; padding: 9px 16px; opacity: 0;
    transition: opacity .16s ease; pointer-events: none; }
  .rig-toast.on { opacity: 1; }
  `;

  const style = document.createElement('style');
  style.textContent = '';   // 样式改由 rig-ui.css 提供（米白档案风）
  document.head.appendChild(style);

  /* ------------------------------------------------------------ DOM */
  const tip = document.createElement('div');
  tip.className = 'rig-tip';
  document.body.appendChild(tip);

  const modal = document.createElement('div');
  modal.className = 'rig-modal';
  modal.innerHTML = `
    <div class="rig-modal__hd">
      <div>
        <div class="rig-modal__ttl">—</div>
        <div class="rig-modal__sub">—</div>
      </div>
      <div class="rig-modal__x">✕</div>
    </div>
    <div class="rig-modal__bd"><div class="rig-modal__meta"></div></div>
    <div class="rig-modal__act">Actions · 操作</div>
    <div class="rig-actions">
      <button class="rig-btn" data-act="start">启用</button>
      <button class="rig-btn" data-act="stop">停用</button>
      <button class="rig-btn" data-act="update">更新版本</button>
      <button class="rig-btn" data-act="share">共享</button>
    </div>
    <div class="rig-modal__ft"><span><i class="dot"></i><em>Confidentiality</em></span><span>Rhine Lab · Fleet Control</span></div>`;
  document.body.appendChild(modal);

  const toast = document.createElement('div');
  toast.className = 'rig-toast';
  document.body.appendChild(toast);

  let toastTimer = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2200);
  }

  /* ------------------------------------------------------------ 悬停卡 */
  let pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

  function kindLabel(k) { return k === 'OMC' ? '运维 OMC' : k === 'FS' ? '文件 FS' : '生命周期 LCM'; }

  function showTip(html) {
    tip.innerHTML = html;
    tip.classList.add('on');
    requestAnimationFrame(() => placeTip());
  }
  function hideTip() { tip.classList.remove('on'); }
  function placeTip() {
    const w = tip.offsetWidth || 286, h = tip.offsetHeight || 120;
    // 操作面板打开时，悬停卡一律放到它的左侧，绝不重叠
    let panelLeft = innerWidth;
    if (modal.classList.contains('on')) {
      const r = modal.getBoundingClientRect();
      panelLeft = r.left;
    }
    let x = pointer.x + 18, y = pointer.y + 16;
    if (x + w + 14 > panelLeft) x = Math.min(pointer.x - w - 18, panelLeft - w - 14);
    if (y + h > innerHeight - 12) y = pointer.y - h - 16;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }

  function tipForModule(m) {
    const mp = m.mapping || {};
    const on = mp.enabled !== false;
    const node = m.board.node || {};
    const stale = !!(mp.version && node.version && mp.version !== node.version);
    const rows = [
      ['方法 / 路径', (mp.method || 'GET').toUpperCase() + ' ' + (mp.path || '')],
      ['版本', 'v' + (mp.version || node.version || '—') + (stale ? '  ← 落后于节点 v' + node.version : '')],
      ['状态', on ? '启用中' : '已停用'],
      ['命中', String(mp.hits || 0)],
      ['所属虚机', (node.name || '') + ' · ' + (node.version || '')],
    ];
    const file = 'FILE NO. ' + (mp.id || m.id).toUpperCase().replace('MAP-', 'X-');
    return `<div class="rig-tip__hd">
        <span class="rig-tip__k">${m.kind}</span>
        <span class="rig-tip__t">${mp.name || mp.path || m.id}</span>
      </div>
      <div class="rig-tip__row"><span>Model</span><b>${kindLabel(m.kind)}</b></div>
      ${rows.map(([k, v]) => `<div class="rig-tip__row${/版本/.test(k) && stale ? ' is-stale' : ''}"><span>${k}</span><b>${v}</b></div>`).join('')}
      <div class="rig-tip__bar"><i></i></div>
      <div class="rig-tip__foot"><span>${file}</span><span>Powered by Rhine Lab</span></div>`;
  }

  function tipForBoard(b) {
    const n = b.node || {};
    const mods = (window.RhineScene.instance.modules || []).filter((m) => m.board === b);
    const on = mods.filter((m) => m.mapping && m.mapping.enabled !== false).length;
    return `<div class="rig-tip__hd"><span class="rig-tip__k">VM</span>
        <span class="rig-tip__t">${n.name || n.id}</span></div>
      <div class="rig-tip__row"><span>节点</span><b>${n.id}</b></div>
      <div class="rig-tip__row"><span>地址</span><b>${n.addr || '—'}</b></div>
      <div class="rig-tip__row"><span>版本</span><b>v${n.version || '—'}</b></div>
      <div class="rig-tip__row"><span>状态</span><b>${n.status === 'online' ? '在线' : n.status === 'updating' ? '部署中' : '离线'}</b></div>
      <div class="rig-tip__row"><span>服务</span><b>${mods.length} 个（启用 ${on}）</b></div>
      <div class="rig-tip__bar"><i></i></div>`;
  }

  /* ------------------------------------------------------------ 弹窗 */
  let current = null;   // { type: 'module'|'board', ref }

  function openModal(type, ref) {
    current = { type, ref };
    const m = modal.querySelector('.rig-modal__ttl');
    const meta = modal.querySelector('.rig-modal__meta');
    const btns = modal.querySelectorAll('.rig-btn');

    if (type === 'module') {
      const mp = ref.mapping || {};
      const node = ref.board.node || {};
      m.textContent = mp.name || mp.path || ref.id;
      modal.querySelector('.rig-modal__sub').textContent =
        'FILE NO. ' + String(mp.id || ref.id).toUpperCase().replace('MAP-', 'X-') + '  ·  ' + ref.kind;
      meta.innerHTML = `
        <div class="row"><span>Model</span><b>${kindLabel(ref.kind)}</b></div>
        <div class="row"><span>Endpoint</span><b>${(mp.method || 'GET').toUpperCase()} ${mp.path || ''}</b></div>
        <div class="row"><span>Version</span><b>v${mp.version || node.version || '—'}</b></div>
        <div class="row"><span>State</span><b>${mp.enabled === false ? 'STOPPED' : 'RUNNING'}</b></div>
        <div class="row"><span>Host VM</span><b>${node.name || ''} · v${node.version || '—'}</b></div>
        <div class="row"><span>Hits</span><b>${mp.hits || 0}</b></div>`;
      btns.forEach((b) => { b.style.display = ''; });
      btns[0].disabled = mp.enabled !== false;
      btns[1].disabled = mp.enabled === false;
      btns[3].disabled = false;
    } else {
      const n = ref.node || {};
      m.textContent = n.name || n.id;
      modal.querySelector('.rig-modal__sub').textContent =
        'NODE ' + String(n.id || '').toUpperCase() + '  ·  VM';
      meta.innerHTML = `
        <div class="row"><span>Node</span><b>${n.id}</b></div>
        <div class="row"><span>Address</span><b>${n.addr || '—'}</b></div>
        <div class="row"><span>Version</span><b>v${n.version || '—'}</b></div>
        <div class="row"><span>State</span><b>${String(n.status || '').toUpperCase()}</b></div>
        <div class="row"><span>Services</span><b>${(window.RhineScene.instance.modules || []).filter((x) => x.board === ref).length}</b></div>`;
      btns.forEach((b) => { b.style.display = 'none'; });
      btns[2].style.display = '';   // 虚机只允许"更新版本"
    }

    modal.classList.add('on');
    // 面板固定停靠在右侧（不跟随点击位置）：点击 = 操作，不与悬停卡抢空间
  }

  function closeModal() { modal.classList.remove('on'); current = null; }

  modal.querySelector('.rig-modal__x').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  modal.addEventListener('click', async (e) => {
    const btn = e.target.closest('.rig-btn');
    if (!btn || !current) return;
    const act = btn.dataset.act;
    btn.classList.add('is-busy');
    try {
      if (current.type === 'board') {
        const n = current.ref.node;
        const next = bumpVersion(n.version || '0.1.0');
        await API.deploy(n.id, next);
        say('已下发部署 v' + next + ' → ' + (n.name || n.id));
        closeModal();
        return;
      }
      const mp = current.ref.mapping;
      if (act === 'start') {
        await API.patch(mp.id, { enabled: true });
        mp.enabled = true;
        say('已启用 ' + (mp.name || mp.path));
      } else if (act === 'stop') {
        await API.patch(mp.id, { enabled: false });
        mp.enabled = false;
        say('已停用 ' + (mp.name || mp.path));
      } else if (act === 'update') {
        const next = bumpVersion(mp.version || current.ref.board.node.version || '0.1.0');
        await API.patch(mp.id, { version: next });
        mp.version = next;
        say('已更新到 v' + next);
      } else if (act === 'share') {
        const url = location.origin + '/mock' + (mp.path || '');
        try { await navigator.clipboard.writeText(url); say('已复制 mock 直链：' + url); }
        catch { say('mock 直链：' + url); }
      }
      closeModal();
      // 重新拉数据并刷新 3D：停用/版本更新当场生效（不用刷新页面）
      try {
        const [nodes, mappings] = await Promise.all([
          fetch('/api/admin/nodes', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/business/mappings', { credentials: 'include' }).then((r) => r.json()),
        ]);
        if (window.RhineScene && window.RhineScene.setData) window.RhineScene.setData({ nodes, mappings });
      } catch (e) { /* 忽略刷新失败 */ }
    } catch (err) {
      say('操作失败：' + err.message);
    } finally {
      btn.classList.remove('is-busy');
    }
  });

  function bumpVersion(v) {
    const p = String(v).split('.').map((x) => parseInt(x, 10) || 0);
    while (p.length < 3) p.push(0);
    p[2] += 1;
    return p.join('.');
  }

  /* ------------------------------------------------------------ 主循环 */
  // 监听场景的选择事件（场景内部已完成射线检测）
  function bindSelect() {
    const s = window.RhineScene && window.RhineScene.instance;
    if (!s || !s.renderer) { setTimeout(bindSelect, 300); return; }
    const host = s.renderer.domElement.parentElement;
    if (!host || host.__rigBound) return;
    host.__rigBound = true;
    host.addEventListener('rig:select', (e) => {
      if (!e.detail || !e.detail.type) { closeModal(); return; }
      window.__rigSel = e.detail;
      const d = e.detail || {};
      const s2 = window.RhineScene.instance;
      if (d.type === 'mapping') {
        const m = s2.modules.find((x) => x.id === d.id);
        if (m) openModal('module', m, pointer.x, pointer.y);
      } else if (d.type === 'node') {
        const b = s2.boards.find((x) => x.id === d.id);
        if (b) openModal('board', b, pointer.x, pointer.y);
      }
    });
  }
  bindSelect();

  let lastHover = null;
  let downAt = null;

  window.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; }, { passive: true });

  // 点空白（没悬停任何对象）关闭操作面板；拖拽旋转不误关
  window.addEventListener('pointerup', (e) => {
    if (!modal.classList.contains('on') || !downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    if (e.target && e.target.closest && e.target.closest('.rig-modal')) return;
    const s = window.RhineScene && window.RhineScene.instance;
    if (!s || !s.renderer) return;
    const rect = s.renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) { closeModal(); return; }
    if (!s.hovered) closeModal();
  }, { passive: true });


  function loop() {
    requestAnimationFrame(loop);
    const s = window.RhineScene && window.RhineScene.instance;
    if (!s) return;
    const id = s.hovered;
    // 操作面板已打开、且悬停的正是面板里的那个对象 → 不再弹详情卡（面板已经写着同样信息）
    if (id && current && modal.classList.contains('on')) {
      const ref = current.ref || {};
      const curId = (ref.mapping && ref.mapping.id) || ref.id;
      if (curId === id) { if (tip.classList.contains('on')) hideTip(); lastHover = id; return; }
    }
    if (id === lastHover) { if (id) placeTip(); return; }
    lastHover = id;
    if (!id) { hideTip(); return; }
    const mod = s.modules.find((m) => m.id === id);
    if (mod) { showTip(tipForModule(mod)); return; }
    const board = s.boards.find((b) => b.id === id);
    if (board) { showTip(tipForBoard(board)); return; }
    hideTip();
  }
  loop();

  window.RigUI = { openModal, closeModal, say };
})();

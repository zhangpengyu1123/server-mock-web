/* ============================================================================
   业务面（W / L 共用）
   · W 端：本机运行，/api/meta 返回 authRequired=false → 直接进，无登录
   · L 端：/api/meta 返回 authRequired=true → 先走登录门，再进同一个界面
   两个模式共用同一份视图代码；差异只有"门前那一步"。
   ==========================================================================*/
(function () {
  'use strict';
  const { $, $$, esc, nf, hhmmss, mmdd, sleep, toast, client, pretty, typeLines, flicker, bootClock } = RL;

  const S = {
    base: (window.__RHINE__ && window.__RHINE__.apiBase) || '',
    meta: null,
    api: null,
    user: null,
    view: 'mappings',
    mappings: [],
    logs: [],
    lastTest: null,
    clockTimer: null,
    statTimer: null
  };

  /* ------------------------------------------------------------------ 登录门 */
  const GATE_LINES = [
    ['MOUNT /dev/analysis', 'OK'],
    ['KEYSTORE  0x7F3A', 'UNSEALED'],
    ['IDENTITY HANDSHAKE', 'OK'],
    ['REQUEST RECEIVED', '—'],
    ['START PROCESSING', '……']
  ];

  async function runGate() {
    const gate = $('#gate');
    gate.hidden = false;
    $('#app').hidden = true;
    $('#gateSeq').hidden = false;
    $('#gateCard').hidden = true;
    bootClock('#gateClock');

    await typeLines($('#gateLog'), $('#gateVerb'), GATE_LINES, (i) => {
      if (i === 2) $('#gateVerb').textContent = 'ID CONFIRMED';
      if (i === 3) $('#gateVerb').textContent = 'REQUEST RECEIVED';
    });
    $('#gateVerb').textContent = 'START PROCESSING';
    await sleep(150);
    flicker($('#gateFlicker'), 240);
    await sleep(180);
    $('#gateSeq').hidden = true;
    $('#gateCard').hidden = false;
    $('#gFoot').textContent = '等待授权';
    setTimeout(() => $('#gUser').focus(), 60);
  }

  function gateError(msg) {
    const box = $('#gErr');
    box.hidden = false;
    box.textContent = 'ACCESS DENIED · ' + msg;
    const card = $('#gateCard');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    $('#gFoot').textContent = '接入被拒绝';
  }

  async function submitGate(ev) {
    if (ev) ev.preventDefault();
    const btn = $('#gSubmit');
    const user = $('#gUser').value.trim();
    const pass = $('#gPass').value;
    if (!user || !pass) return gateError('需要身份与授权码');
    btn.disabled = true;
    $('#gFoot').textContent = '提交凭据…';
    try {
      const data = await S.api.req('/api/auth/login', { method: 'POST', body: { username: user, password: pass } });
      S.user = data.user;
      S.api.setCsrf(data.csrf);
      $('#gFoot').textContent = '已授权';
      $('#gateWhite').classList.add('on');
      await sleep(400);
      enter();
    } catch (e) {
      gateError(e.status === 401 ? '凭据无效' : e.message);
      $('#gPass').value = '';
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ 主界面 */
  function enter() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    const needsAuth = !!S.meta.authRequired;
    $('#userBox').hidden = !needsAuth;
    $('#btnLogout').hidden = !needsAuth;
    $('#modeBadge').textContent = needsAuth ? 'L-AGENT' : 'LOCAL';
    $('#modeBadge').className = 'badge ' + (needsAuth ? 'badge--amber' : 'badge--ok');
    if (needsAuth && S.user) {
      $('#userName').textContent = S.user.display || S.user.username;
      $('#userRole').textContent = S.user.role.toUpperCase();
    }
    renderRail();
    renderView();
    loadAll();
    clearInterval(S.statTimer);
    S.statTimer = setInterval(refreshStats, 5000);
  }

  function renderRail() {
    const items = [
      { g: 'MAPPINGS', id: 'mappings', lb: '本地映射', hint: S.mappings.length },
      { g: 'MAPPINGS', id: 'new', lb: '新建映射', hint: '' },
      { g: 'RUNTIME', id: 'endpoint', lb: '接入端点', hint: '' },
      { g: 'RUNTIME', id: 'feed', lb: '调用流', hint: S.logs.length }
    ];
    const groups = [];
    items.forEach((it) => {
      let g = groups.find((x) => x.title === it.g);
      if (!g) groups.push((g = { title: it.g, items: [] }));
      g.items.push(it);
    });
    $('#rail').innerHTML = groups
      .map(
        (g) =>
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
                esc(('0' + (i + 1)).slice(-2)) +
                '</i>' +
                esc(it.lb) +
                '<em>' +
                (it.hint === '' ? '' : esc(it.hint)) +
                '</em></button>'
            )
            .join('') +
          '</div>'
      )
      .join('');
  }

  function renderView() {
    const head = (t, sub, acts) =>
      '<div class="main__head"><div><h2 class="main__title">' + esc(t) + '</h2><div class="main__sub">' + esc(sub) + '</div></div><div class="main__acts">' + (acts || '') + '</div></div>';
    const views = {
      mappings: () => head('本地映射', '把请求映射成可控响应', '<button class="btn btn--sm btn--primary" data-view="new">新建映射</button>') + viewMappings(),
      new: () => head('新建映射', '方法 / 路径 / 状态码 / 延迟 / 响应体') + viewNew(),
      endpoint: () => head('接入端点', '被测系统直接调用这里，不需要登录') + viewEndpoint(),
      feed: () => head('调用流', '最近的引擎命中') + viewFeed()
    };
    $('#main').innerHTML = (views[S.view] || views.mappings)();
    bind();
  }

  function viewMappings() {
    if (!S.mappings.length) return '<div class="pnl"><div class="empty">还没有映射<em>点右上「新建映射」创建第一条</em></div></div>';
    const rows = S.mappings
      .map(
        (m) =>
          '<tr class="' + (m.enabled ? '' : 'is-off') + '">' +
          '<td><span class="method" data-m="' + esc(m.method.toUpperCase()) + '">' + esc(m.method.toUpperCase()) + '</span></td>' +
          '<td><span class="path">' + esc(m.path) + '</span><div style="font-size:11px;color:var(--ink-3)">' + esc(m.name) + '</div></td>' +
          '<td class="num">' + esc(m.status) + '</td><td class="num">' + esc(m.delay_ms) + ' ms</td>' +
          '<td class="num">' + nf(m.hits) + '</td>' +
          '<td><span class="st ' + (m.enabled ? 'st--on' : 'st--off') + '">' + (m.enabled ? '启用' : '停用') + '</span></td>' +
          '<td><div class="acts"><button class="btn btn--sm" data-act="test" data-id="' + esc(m.id) + '">试打</button>' +
          '<button class="btn btn--sm" data-act="toggle" data-id="' + esc(m.id) + '" data-on="' + (m.enabled ? '0' : '1') + '">' + (m.enabled ? '停用' : '启用') + '</button>' +
          '<button class="btn btn--sm btn--danger" data-act="del" data-id="' + esc(m.id) + '">删除</button></div></td></tr>'
      )
      .join('');
    const test = S.lastTest
      ? '<div class="pnl"><div class="pnl__cap"><b>试打结果</b><i>LAST TEST</i><span class="sp"></span>' +
        '<span class="badge ' + (S.lastTest.status < 400 ? 'badge--ok' : 'badge--err') + '">HTTP ' + esc(S.lastTest.status) + '</span>' +
        '<span class="badge badge--dim">' + esc(S.lastTest.latency_ms) + ' ms</span></div><div class="pnl__bd"><pre class="code">' + esc(pretty(S.lastTest.body)) + '</pre></div></div>'
      : '';
    return (
      '<div class="pnl"><div class="pnl__cap"><b>映射清单</b><i>MAPPINGS</i><span class="sp"></span><span class="badge badge--amber">' + S.mappings.length + '</span></div>' +
      '<div class="pnl__bd--flush"><table class="tbl"><thead><tr><th>方法</th><th>路径 / 名称</th><th>状态</th><th>延迟</th><th>命中</th><th>开关</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + test
    );
  }

  function viewNew() {
    return (
      '<div class="pnl"><div class="pnl__cap"><b>映射定义</b><i>DEFINITION</i></div><div class="pnl__bd"><form id="formMap" class="grid2">' +
      '<label class="fld"><span class="fld__lb">方法 <i>METHOD</i></span><select class="inp" name="method"><option>GET</option><option selected>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>' +
      '<label class="fld"><span class="fld__lb">路径 <i>PATH</i></span><input class="inp mono" name="path" required placeholder="/nemp/v1/ne/register" /></label>' +
      '<label class="fld"><span class="fld__lb">名称 <i>NAME</i></span><input class="inp" name="name" placeholder="注册网元" /></label>' +
      '<label class="fld"><span class="fld__lb">状态码 <i>STATUS</i></span><input class="inp mono" name="status" type="number" value="200" min="100" max="599" /></label>' +
      '<label class="fld"><span class="fld__lb">延迟 <i>DELAY ms</i></span><input class="inp mono" name="delay" type="number" value="0" min="0" max="10000" step="10" /></label>' +
      '<label class="fld"><span class="fld__lb">内容类型 <i>CONTENT-TYPE</i></span><input class="inp mono" name="ct" value="application/json" /></label>' +
      '<label class="fld span2"><span class="fld__lb">响应体 <i>BODY</i></span><textarea class="inp mono" name="body" rows="6">{\n  "code": "0",\n  "message": "success"\n}</textarea></label>' +
      '<div class="span2 form__acts"><button class="btn btn--primary" type="submit">创建映射</button><button class="btn btn--ghost" type="button" data-view="mappings">取消</button></div>' +
      '</form></div></div>'
    );
  }

  function viewEndpoint() {
    const origin = location.origin;
    const ex = S.mappings[0];
    const curl = ex ? `curl -i -X ${ex.method.toUpperCase()} ${origin}/mock${ex.path}` : `curl -i ${origin}/mock/nemp/v1/ne/register`;
    return (
      '<div class="pnl"><div class="pnl__cap"><b>端点</b><i>ENDPOINT</i></div><div class="pnl__bd">' +
      '<div class="hintcode"><span>BASE</span><b>' + esc(origin + '/mock') + '</b></div>' +
      '<p style="font-size:12px;color:var(--ink-3);margin:12px 0 8px">把这条发给被测系统或同事，就能直接命中映射（mock 引擎不需要登录）：</p>' +
      '<div class="hintcode"><b>' + esc(curl) + '</b><span style="flex:1"></span><button class="btn btn--sm" data-act="copy" data-text="' + esc(curl) + '">复制</button></div>' +
      '<p style="font-size:11.5px;color:var(--ink-3);margin-top:12px">命中会记进「调用流」并在命中数 +1。404 表示没有匹配到「方法 + 路径」都相同且启用的映射。</p>' +
      '</div></div>'
    );
  }

  function viewFeed() {
    const rows = S.logs.length
      ? S.logs.map((l) => '<div class="feed__r"><span class="feed__t">' + esc(mmdd(l.at)) + '</span><span class="feed__a">' + esc(l.action) + '</span><span class="feed__d">' + esc(l.detail) + '</span></div>').join('')
      : '<div class="empty">暂无记录</div>';
    return '<div class="pnl"><div class="pnl__cap"><b>调用流</b><i>FEED</i><span class="sp"></span><span class="badge badge--dim">' + S.logs.length + '</span></div><div class="feed">' + rows + '</div></div>';
  }

  /* -------------------------------------------------------------------- 绑定 */
  function bind() {
    $$('#main [data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; renderRail(); renderView(); }));
    $$('#main [data-act="copy"]').forEach((b) =>
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.text); toast('已复制', 'ok'); } catch (e) { toast('复制失败', 'err'); }
      })
    );
    $$('#main [data-act="test"]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          S.lastTest = await S.api.req('/api/business/mappings/' + encodeURIComponent(b.dataset.id) + '/test', { method: 'POST' });
          renderView();
          toast('试打 ' + S.lastTest.status + ' · ' + S.lastTest.latency_ms + 'ms', 'ok');
        } catch (e) { toast('试打失败：' + e.message, 'err'); } finally { b.disabled = false; }
      })
    );
    $$('#main [data-act="toggle"]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await S.api.req('/api/business/mappings/' + encodeURIComponent(b.dataset.id), { method: 'PATCH', body: { enabled: b.dataset.on === '1' } });
          await loadMappings(); renderRail(); renderView();
        } catch (e) { toast('切换失败：' + e.message, 'err'); }
      })
    );
    $$('#main [data-act="del"]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('删除这条映射？')) return;
        try {
          await S.api.req('/api/business/mappings/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' });
          await loadMappings(); renderRail(); renderView(); toast('已删除', 'ok');
        } catch (e) { toast('删除失败：' + e.message, 'err'); }
      })
    );
    const fm = $('#formMap');
    if (fm)
      fm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = new FormData(fm);
        try {
          await S.api.req('/api/business/mappings', {
            method: 'POST',
            body: {
              method: String(f.get('method')),
              path: String(f.get('path')).trim(),
              name: String(f.get('name') || ''),
              status: Number(f.get('status')) || 200,
              delay_ms: Number(f.get('delay')) || 0,
              content_type: String(f.get('ct') || 'application/json'),
              body: String(f.get('body') || '{}')
            }
          });
          await loadMappings();
          toast('映射已创建', 'ok');
          S.view = 'mappings';
          renderRail();
          renderView();
        } catch (e) { toast('创建失败：' + e.message, 'err'); }
      });
  }

  /* -------------------------------------------------------------------- 数据 */
  async function loadMappings() { S.mappings = await S.api.req('/api/business/mappings'); }
  async function loadLogs() { S.logs = await S.api.req('/api/business/logs'); }
  async function refreshStats() {
    try {
      const st = await S.api.req('/api/business/stats');
      $('#topMaps').textContent = nf(st.mappings);
      $('#topHits').textContent = nf(st.hits);
      $('#sbMid').textContent = 'MAPS ' + st.mappings + ' · ENABLED ' + st.enabled + ' · HITS ' + st.hits;
      $('#sbRight').textContent = 'v' + st.version;
    } catch (e) {}
  }
  async function loadAll() {
    try {
      await Promise.all([loadMappings(), loadLogs()]);
      await refreshStats();
      renderRail();
      renderView();
    } catch (e) {
      if (e.status === 401) return logout();
      toast('加载失败：' + e.message, 'err');
    }
  }

  async function logout() {
    try { await S.api.req('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    S.user = null;
    clearInterval(S.statTimer);
    $('#app').hidden = true;
    runGate();
  }

  /* -------------------------------------------------------------------- 启动 */
  async function boot() {
    const saved = (() => { try { return localStorage.getItem('rhine.base') || ''; } catch (e) { return ''; } })();
    if (saved) S.base = saved;
    if (window.__RHINE__ && window.__RHINE__.apiBase) S.base = window.__RHINE__.apiBase;
    S.api = client(S.base);

    let meta = { authRequired: true, version: '0.1.0' };
    try { meta = await fetch((S.base || '').replace(/\/+$/, '') + '/api/meta').then((r) => r.json()); } catch (e) {}
    S.meta = meta;
    $('#gateVer').textContent = meta.version || '0.1.0';
    $('#gFootVer').textContent = 'v' + (meta.version || '0.1.0');
    $('#gateNode').textContent = meta.node || 'L-AGENT';

    // 登录门绑定（无论是否显示都先绑好）
    $('#gateForm').addEventListener('submit', submitGate);
    $('#gDemo').addEventListener('click', () => { $('#gUser').value = 'viewer'; $('#gPass').value = 'rhine-viewer-2026'; $('#gFoot').textContent = '已填入业务用户凭据'; });
    $('#btnLogout').addEventListener('click', logout);
    $('#rail').addEventListener('click', (e) => {
      const it = e.target.closest('.rail__item');
      if (it) { S.view = it.dataset.view; renderRail(); renderView(); }
    });

    if (!meta.authRequired) {
      // W 端本地：没有登录这一步，直接进业务面
      S.user = null;
      enter();
      return;
    }
    // L 端：先看是否有会话，没有就走登录门
    try {
      const me = await S.api.req('/api/auth/me');
      S.user = me.user;
      S.api.setCsrf(me.csrf);
      enter();
    } catch (e) {
      runGate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

#!/usr/bin/env node
/* plane 业务面接后端：
   1) 登录门（L 端需要；W 端 authRequired=false 自动跳过）→ 拿到 CSRF 存 sessionStorage
   2) MOCK 管理页改为读写 /api/business/endpoints（登记 / 改能力 / 签发证书 / 启停）
   3) 顺手把 seed 的演示端点挪到 if 块之外 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
function patch(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [from, to, tag] of pairs) {
    if (!t.includes(from)) { log.push('MISS ' + tag); continue; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  }
  writeFileSync(file, t, 'utf8');
}

/* ---------- 1) store.rs：seed 端点移出 users 判空块 ---------- */
const sf = 'console/crates/core/src/store.rs';
{
  let t = readFileSync(sf, 'utf8');
  const block = `        if inner.endpoints.is_empty() {
            inner.endpoints.push(MockEndpoint {
                id: "ep-0001".into(), host: "127.0.0.1".into(), port: 8443,
                capabilities: vec!["NEMP".into()], cert: None, enabled: false,
                created_at: now_ms(),
            });
        }
`;
  if (t.includes(block)) {
    t = t.replace(block, '');
    // 插到 seed 的 if 块闭合之后：找到 seed(&mut inner); 所在 if 的结束位置（下一处 "\n        }\n"）
    const i = t.indexOf('seed(&mut inner);');
    const close = t.indexOf('\n        }\n', i);
    if (i > 0 && close > 0) {
      t = t.slice(0, close + '\n        }\n'.length) + block + t.slice(close + '\n        }\n'.length);
      log.push('ok   seed 端点移出');
    } else log.push('MISS seed 移位');
    writeFileSync(sf, t, 'utf8');
  } else log.push('MISS seed 块定位');
}

/* ---------- 2) plane.js：登录门 + 端点 API ---------- */
patch('console/ui/business/plane.js', [
  // 状态
  [`  const S = {
    layer: 'runtime',`, `  const S = {
    csrf: sessionStorage.getItem('rhine.plane.csrf') || '',
    ep: null,          // 当前 Mock 端点（来自后端）
    layer: 'runtime',`, 'state csrf/ep'],

  // 工具：API
  [`  /* ---------------------------------------------------------------- 导航 */`, `  /* ---------------------------------------------------------------- API */
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
      wrap.innerHTML = \`<div class="pl-human__box" style="width:380px">
        <div class="pl-human__hd"><div><div class="pl-human__t">接入业务面</div>
          <div class="pl-human__s">SIGN IN · BUSINESS PLANE</div></div></div>
        <div class="pl-human__bd">
          <div class="pl-field" style="margin-bottom:10px"><label>Username</label><input id="plU" value="viewer" /></div>
          <div class="pl-field" style="margin-bottom:12px"><label>Password</label><input id="plP" type="password" value="rhine-viewer-2026" /></div>
          <button class="pl-btn pl-btn--solid" id="plGo" style="width:100%">登录</button>
          <div class="pl-muted" id="plErr" style="margin-top:8px;font-size:9px;color:#7d2f22"></div>
        </div></div>\`;
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

  /* ---------------------------------------------------------------- 导航 */`, 'api helpers'],
]);

/* 之后把 viewMockAdmin 的端点数据源换成 S.ep —— 用整块替换 */
{
  let t = readFileSync('console/ui/business/plane.js', 'utf8');
  const start = t.indexOf('  function viewMockAdmin() {');
  const end = t.indexOf('  /* ---------------------------------------------------------------- 视图：MOCK 流程 */');
  if (start > 0 && end > start) {
    const repl = `  function viewMockAdmin() {
    const e = S.ep || { host: '127.0.0.1', port: 8443, capabilities: [], cert: null, enabled: false };
    const caps = e.capabilities || [];
    const step = !e.host ? 1 : !e.cert ? 2 : caps.length === 0 ? 3 : e.enabled ? 4 : 4;
    const steps = ['登记监听', '签发证书', '挂载能力', '开启服务'];
    return head('MOCK 管理', 'Register endpoint · issue certificate · mount capabilities · start', 'FILE NO. MOCK-001') + \`
      <div class="pl-steps">
        \${steps.map((t2, i) => \`<div class="pl-step\${step === i + 1 ? ' is-on' : (step > i + 1 ? ' is-done' : '')}">
          <div class="pl-step__n">STEP \${i + 1}</div><div class="pl-step__t">\${esc(t2)}</div></div>\`).join('')}
      </div>
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">01 · 注册本机 IP 与端口</div>
          <div class="pl-form">
            <div class="pl-field--row">
              <div class="pl-field"><label>Host / IP</label><input id="epHost" value="\${esc(e.host)}" /></div>
              <div class="pl-field"><label>Port</label><input id="epPort" value="\${esc(e.port)}" /></div>
            </div>
            <div class="pl-field"><label>挂载平台能力（可多选，写入后端）</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                \${S.caps.map((c) => \`<button class="pl-btn pl-btn--sm" data-cap="\${esc(c)}"
                  style="\${caps.includes(c) ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">\${esc(c)}</button>\`).join('')}
              </div>
            </div>
            <div class="pl-row-end">
              <button class="pl-btn" id="btnSave">保存端点</button>
              <button class="pl-btn" id="btnCert">02 · 生成证书</button>
              <button class="pl-btn pl-btn--solid" id="btnStart">\${e.enabled ? '停止服务' : '04 · 开启服务'}</button>
            </div>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">端点状态（服务端）</div>
          <dl class="pl-kv">
            <dt>ID</dt><dd>\${esc(e.id || '—')}</dd>
            <dt>Endpoint</dt><dd>\${esc(e.host)}:\${esc(e.port)}</dd>
            <dt>Service</dt><dd>\${e.enabled ? '<span class="pl-dot pl-dot--on"></span>运行中' : '<span class="pl-dot"></span>未启动'}</dd>
            <dt>Certificate</dt><dd>\${e.cert ? esc(e.cert.cn) + ' · SAN ' + e.cert.san.length : '<span class="pl-muted">未签发</span>'}</dd>
            <dt>Capabilities</dt><dd>\${caps.length ? caps.map((c) => \`<span class="pl-tag pl-tag--on">\${esc(c)}</span>\`).join(' ') : '<span class="pl-muted">未挂载</span>'}</dd>
          </dl>
          <div style="margin-top:12px">
            <div class="pl-card__t" style="margin-bottom:6px">证书内容</div>
            <pre class="pl-muted" style="margin:0;font-size:8px;line-height:1.55;white-space:pre-wrap">\${e.cert ? esc(e.cert.pem) : '—'}</pre>
          </div>
        </div>
      </div>\`;
  }

`;
    t = t.slice(0, start) + repl + t.slice(end);
    log.push('ok   viewMockAdmin 改用 S.ep');
  } else log.push('MISS viewMockAdmin 区间');

  // 事件：改为调用后端
  const oldBind = t.indexOf("    // MOCK 管理");
  if (oldBind > 0) {
    const oldEnd = t.indexOf('    // MOCK 流程', oldBind);
    const newBind = `    // MOCK 管理（全部走服务端）
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

`;
    t = t.slice(0, oldBind) + newBind + t.slice(oldEnd);
    log.push('ok   MOCK 管理事件接后端');
  } else log.push('MISS MOCK 管理绑定');

  // 启动顺序：登录 → 拉端点 → 渲染
  t = t.replace(`  $('#plExit') && $('#plExit').addEventListener('click', () => { location.href = '/'; });
  render();`,
`  $('#plExit') && $('#plExit').addEventListener('click', () => { location.href = '/'; });
  (async () => {
    try {
      const ok = await ensureAuth();
      if (ok) await loadEndpoint();
    } catch (e) { /* 后端不可达时退化为本地演示数据 */ }
    render();
  })();`);
  writeFileSync('console/ui/business/plane.js', t, 'utf8');
  log.push('ok   启动顺序');
}

console.log(log.join('\n'));

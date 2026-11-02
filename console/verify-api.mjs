#!/usr/bin/env node
/* rhine-agent 端到端验收：node verify-api.mjs [baseUrl]
 * 覆盖：认证 / CSRF / 业务面 CRUD / mock 引擎 / 管理面部署状态机 / 角色隔离 / 审计
 * 零依赖：Node 18+ 自带 fetch。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:9600';

let pass = 0, fail = 0;
const results = [];
function chk(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简会话客户端：手动维护 Cookie + CSRF，模拟浏览器的行为 */
function client() {
  let cookie = '';
  let csrf = '';
  async function req(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body) headers['content-type'] = 'application/json';
    if (cookie) headers['cookie'] = cookie;
    if (csrf && (opts.method || 'GET') !== 'GET') headers['x-csrf'] = csrf;
    if (opts.noCsrf) delete headers['x-csrf'];
    const res = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const m = setCookie.match(/rhine_sess=([^;]*)/);
    if (m) cookie = 'rhine_sess=' + m[1];
    for (const [k, v] of res.headers) if (k.toLowerCase() === 'set-cookie') {
      const mm = v.match(/rhine_sess=([^;]*)/);
      if (mm) cookie = 'rhine_sess=' + mm[1];
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: res.status, data, headers: res.headers, text };
  }
  return {
    req,
    setCsrf(v) { csrf = v; },
    get cookie() { return cookie; }
  };
}

(async () => {
  console.log('=== 0. health ===');
  const h = await fetch(BASE + '/health').then((r) => r.json());
  chk('health', h.ok === true, `version=${h.version} mappings=${h.mappings} nodes=${h.nodes}`);

  console.log('\n=== 1. 认证 ===');
  const admin = client();
  const r1 = await admin.req('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'rhine-admin-2026' } });
  chk('admin 登录', r1.status === 200, `user=${r1.data?.user?.username} role=${r1.data?.user?.role}`);
  chk('返回 csrf', (r1.data?.csrf || '').length >= 32, `len=${(r1.data?.csrf || '').length}`);
  chk('Cookie 是 HttpOnly', /HttpOnly/i.test(r1.headers.get('set-cookie') || ''), (r1.headers.get('set-cookie') || '').slice(0, 46));
  admin.setCsrf(r1.data.csrf);

  const me = await admin.req('/api/auth/me');
  chk('带会话 /me', me.status === 200 && me.data.user.username === 'admin');
  const anon = await client().req('/api/auth/me');
  chk('无会话 /me → 401', anon.status === 401, `got ${anon.status}`);

  const bad = await client().req('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'nope' } });
  chk('错误口令 → 401', bad.status === 401, `got ${bad.status}`);

  console.log('\n=== 2. 业务面：映射 CRUD + CSRF ===');
  const maps0 = await admin.req('/api/business/mappings');
  chk('种子映射', maps0.data.length === 4, `count=${maps0.data.length}`);

  const payload = { method: 'POST', path: '/verify/v1/ping', name: 'verify-ping', status: 201, delay_ms: 150, body: '{"pong":true}' };
  const noCsrf = await admin.req('/api/business/mappings', { method: 'POST', body: payload, noCsrf: true });
  chk('缺 X-CSRF → 403', noCsrf.status === 403, `got ${noCsrf.status}`);

  const created = await admin.req('/api/business/mappings', { method: 'POST', body: payload });
  chk('创建映射', created.status === 200 && !!created.data.id, `id=${created.data?.id} status=${created.data?.status}`);

  const dup = await admin.req('/api/business/mappings', { method: 'POST', body: payload });
  chk('同路径重复 → 409', dup.status === 409, `got ${dup.status}`);

  const badPath = await admin.req('/api/business/mappings', { method: 'POST', body: { method: 'GET', path: 'no-slash' } });
  chk('path 不以 / 开头 → 400', badPath.status === 400, `got ${badPath.status}`);

  const patched = await admin.req(`/api/business/mappings/${created.data.id}`, { method: 'PATCH', body: { enabled: false } });
  chk('停用映射', patched.status === 200 && patched.data.enabled === false, `enabled=${patched.data?.enabled}`);

  console.log('\n=== 3. mock 引擎（真实 HTTP，无需登录）===');
  const hit = await fetch(BASE + '/mock/nemp/v1/ne/list');
  const hitBody = await hit.text();
  chk('GET 命中 → 200', hit.status === 200, `bytes=${hitBody.length}`);
  chk('响应体来自映射', hitBody.includes('杭州主站点'), hitBody.slice(0, 46).replace(/\n/g, ' '));
  chk('响应头带 x-rhine-mapping', !!hit.headers.get('x-rhine-mapping'), `id=${hit.headers.get('x-rhine-mapping')}`);

  const t0 = Date.now();
  await fetch(BASE + '/mock/alarm/v1/report', { method: 'POST' }).then((r) => r.text());
  const dt = Date.now() - t0;
  chk('延迟是真的（≥230ms）', dt >= 230, `elapsed=${dt}ms`);

  const miss = await fetch(BASE + '/mock/does/not/exist');
  chk('未命中 → 404', miss.status === 404, `got ${miss.status}`);

  const mapsAfter = await admin.req('/api/business/mappings');
  const listMap = mapsAfter.data.find((m) => m.path === '/nemp/v1/ne/list');
  chk('命中数递增', listMap.hits >= 1, `hits=${listMap.hits}`);

  console.log('\n=== 4. 管理面：部署状态机 ===');
  const nodes = await admin.req('/api/admin/nodes');
  chk('节点清单', nodes.data.length === 3, `count=${nodes.data.length}`);
  const target = nodes.data.find((n) => n.id === 'node-0001');
  const fromVer = target.version;

  const job0 = await admin.req('/api/admin/nodes/node-0001/deploy', { method: 'POST', body: { version: '0.2.0' } });
  chk('下发部署', job0.status === 200 && !!job0.data.id, `job=${job0.data?.id} from=${job0.data?.from_version}`);

  const seen = [];
  let j = job0.data;
  for (let i = 0; i < 40 && !j.finished; i++) {
    await sleep(350);
    const r = await admin.req('/api/admin/jobs/' + job0.data.id);
    j = r.data;
    if (!seen.includes(j.stage)) seen.push(j.stage);
  }
  chk('阶段推进', seen.length >= 3, seen.join(' → '));
  chk('作业完成且成功', j.finished === true && j.ok === true, `progress=${j.progress} stage=${j.stage}`);

  const nodes2 = await admin.req('/api/admin/nodes');
  const t2 = nodes2.data.find((n) => n.id === 'node-0001');
  chk('节点版本已更新', t2.version === '0.2.0', `${fromVer} → ${t2.version}`);
  chk('节点回到 online', t2.status === 'online', `status=${t2.status}`);

  const users = await admin.req('/api/admin/users');
  chk('账号列表', users.data.length >= 2, `count=${users.data.length}`);
  chk('口令哈希不外泄', !JSON.stringify(users.data).includes('argon2'), 'checked payload');

  const nu = await admin.req('/api/admin/users', { method: 'POST', body: { username: 'verify-op', password: 'verify-pass-2026', display: '验证账号', role: 'operator' } });
  chk('新建业务账号', nu.status === 200 && nu.data.username === 'verify-op', `role=${nu.data?.role}`);

  const shortPw = await admin.req('/api/admin/users', { method: 'POST', body: { username: 'verify-x', password: 'short' } });
  chk('短口令 → 400', shortPw.status === 400, `got ${shortPw.status}`);

  console.log('\n=== 5. 角色隔离 ===');
  const viewer = client();
  const vr = await viewer.req('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: 'rhine-viewer-2026' } });
  chk('viewer 登录', vr.status === 200, `role=${vr.data?.user?.role}`);
  viewer.setCsrf(vr.data.csrf);

  const vAdmin = await viewer.req('/api/admin/nodes');
  chk('viewer 打管理面 → 403', vAdmin.status === 403, `got ${vAdmin.status}`);

  const vMaps = await viewer.req('/api/business/mappings');
  const owners = [...new Set(vMaps.data.map((m) => m.owner))];
  chk('viewer 只见自己的映射', owners.length === 1 && owners[0] === 'user-0002', `owners=${owners.join(',')} count=${vMaps.data.length}`);

  const vDeploy = await viewer.req('/api/admin/nodes/node-0001/deploy', { method: 'POST', body: { version: '0.3.0' } });
  chk('viewer 下发部署 → 403', vDeploy.status === 403, `got ${vDeploy.status}`);

  console.log('\n=== 6. 审计与收尾 ===');
  const logs = await admin.req('/api/admin/logs');
  const acts = logs.data.map((l) => l.action).join(',');
  for (const a of ['auth.login', 'mapping.create', 'deploy.start', 'user.create']) {
    chk('审计含 ' + a, acts.includes(a));
  }
  const del = await admin.req(`/api/business/mappings/${created.data.id}`, { method: 'DELETE' });
  chk('删除映射', del.status === 200, `got ${del.status}`);

  const lo = await admin.req('/api/auth/logout', { method: 'POST' });
  chk('登出', lo.status === 200);
  const after = await admin.req('/api/auth/me');
  chk('登出后会话失效 → 401', after.status === 401, `got ${after.status}`);

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  if (fail) {
    console.log('\nFAILED:');
    results.filter((r) => r[0] === 'FAIL').forEach((r) => console.log('  - ' + r[1] + (r[2] ? '  [' + r[2] + ']' : '')));
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('验收脚本异常：', e);
  process.exit(2);
});

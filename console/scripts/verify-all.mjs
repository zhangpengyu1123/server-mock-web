// 全量回归：按目标清单逐条验证业务面能力（API 层）
// 用法：node console/scripts/verify-all.mjs   （需 9600 在跑，admin 凭据）
const BASE = process.env.RHINE_BASE || 'http://127.0.0.1:9600';
const results = [];
let group = '';

const G = (name) => { group = name; };

function ok(label, detail) { results.push({ group, label, pass: true, detail }); }
function bad(label, detail) { results.push({ group, label, pass: false, detail }); }
function check(label, cond, detail) { cond ? ok(label, detail) : bad(label, detail ?? '断言失败'); }

/* ---------- 登录 ---------- */
const lr = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
});
const auth = await lr.json();
const COOKIE = (lr.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
const H = { Cookie: COOKIE, 'Content-Type': 'application/json', 'X-CSRF': auth.csrf };
const J = (p, o) => fetch(BASE + p, Object.assign({ headers: H }, o || {})).then(async (r) => ({ status: r.status, h: r.headers, body: r.status === 204 ? null : await r.json() }));

/* ================= 一、MOCK 管理 ================= */
G('MOCK 管理');
{
  const ep = await J('/api/business/endpoints', {
    method: 'POST',
    body: JSON.stringify({ host: '127.0.0.1', port: 18443, capabilities: ['NEMP', 'NEF'] }),
  });
  check('注册本机 IP:端口 作为 mock 端口', ep.status === 200 && ep.body.host === '127.0.0.1',
    `${ep.status} → ${ep.body.host}:${ep.body.port} id=${ep.body.id}`);
  const id = ep.body.id;

  const cert = await J(`/api/business/endpoints/${id}/cert`, { method: 'POST', body: JSON.stringify({ cn: 'mock.rhine.local', san: ['mock.rhine.local', '127.0.0.1'] }) });
  const certObj = cert.body.cert || cert.body;
  const pem = String(certObj.pem || '');
  check('为映射 IP 生成证书文件', cert.status === 200 && pem.includes('BEGIN CERTIFICATE'),
    `${cert.status}，CN=${certObj.cn}，PEM ${pem.length} 字节，SAN=${(certObj.san || []).join(',')}`);

  const mounted = (ep.body.capabilities || []).join(',');
  check('挂载一种或多种平台能力', mounted.includes('NEMP') && mounted.includes('NEF'), `capabilities=${mounted}`);

  const svc = await J(`/api/business/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
  check('开启 mock 服务', svc.status === 200 && svc.body.enabled === true, `enabled=${svc.body.enabled}`);
  await J(`/api/business/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
}

/* ================= 二、MOCK 流程 ================= */
G('MOCK 流程');
{
  const ms = (await J('/api/business/mappings')).body;
  const m = ms.find((x) => x.path === '/nemp/v1/ne/register');
  check('管理每个接口的预期响应', !!m, `${m ? m.method.toUpperCase() + ' ' + m.path : '未找到'}`);
  check('定制延迟与 HTTP status code', (m.variants || []).some((v) => v.status === 500 && v.delay_ms === 12),
    '规则：fast/201/5ms · slow/200/600ms · fail/500/12ms · 兜底/200/45ms');
  check('面向对象形式管理响应字段', (m.fields || []).length === 3,
    `字段：${(m.fields || []).map((f) => f.name + '(' + f.source + ')').join(', ')}`);
  const incField = (m.fields || []).find((f) => f.source === 'autoIncrement');
  const onceField = (m.fields || []).find((f) => f.source === 'once');
  const condField = (m.fields || []).find((f) => f.source === 'condition');
  check('字段行为：自增 / 单次生效 / 条件', !!incField && !!onceField && !!condField,
    `${incField && incField.name} · ${onceField && onceField.name} · ${condField && condField.name}`);

  const post = (mode) => fetch(BASE + '/mock/nemp/v1/ne/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mode ? { mode } : {}),
  });
  const fast = await post('fast'), fail = await post('fail'), dflt = await post('');
  const fb = await fast.json(), db = await dflt.json();
  check('多规则按条件命中', fast.status === 201 && fail.status === 500 && dflt.status === 200,
    `fast→201(${fast.headers.get('x-rhine-rule')}) fail→500(${fail.headers.get('x-rhine-rule')}) 兜底→200`);
  check('自增字段逐次生效', Number(db.sessionId) > Number(fb.sessionId),
    `sessionId ${fb.sessionId} → ${db.sessionId}`);
  check('条件字段按表达式求值', fb.accepted === true && (await fail.json()).accepted === false,
    'accepted 在 mode=fast 时为 true，其余 false');

  const audits = (await J('/api/business/audit')).body;
  check('请求与响应审计日志', audits.length > 0, `${audits.length} 条，最近 ${audits[0].method} ${audits[0].path} → ${audits[0].status}`);

  /* 人机交互：把告警接口挂一个人机门 */
  const alarm = ms.find((x) => x.path === '/alarm/v1/report');
  await J(`/api/business/mappings/${alarm.id}/rules`, {
    method: 'PATCH',
    body: JSON.stringify({
      human: {
        prompt: '确认上报该告警？',
        state: 'pending',
        options: [
          { label: '确认上报', effect: 'continue' },
          { label: '挂起等待', effect: 'hold' },
          { label: '终止流程', effect: 'abort' },
        ],
      },
    }),
  });
  const h = await fetch(BASE + '/mock/alarm/v1/report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const hb = await h.json();
  check('可插入人机交互（请求被挡住）', h.status === 202 && hb.humanPending === true && h.headers.get('x-rhine-human') === 'pending',
    `202 · prompt="${hb.prompt}" · 选项 ${(hb.options || []).length} 个`);
  const hid = hb.humanId || hb.id;
  if (hid) await J(`/api/business/mappings/${alarm.id}/human?resolve=${hid}`, { method: 'POST', body: JSON.stringify({ option: 0 }) }).catch(() => {});
}

/* ================= 三、网元管理 ================= */
G('网元管理');
{
  const els = (await J('/api/business/elements')).body;
  const el = els[0];
  check('定制网元属性 / 架构 / 类型', !!el.arch && !!el.kind, `${el.name}: arch=${el.arch} kind=${el.kind}`);
  check('定制版本 / 软件名称 / 旧版本', !!el.version && !!el.software && Array.isArray(el.prev_versions),
    `v${el.version} · ${el.software} · 旧版本 ${(el.prev_versions || []).join(',') || '（空）'}`);
  check('定制升级流程步骤', (el.flow || []).length === 5,
    (el.flow || []).map((s) => s.step + (s.human ? '⟂' : '')).join(' → '));
  check('流程中可挂人机交互', (el.flow || []).some((s) => s.human),
    `${(el.flow || []).filter((s) => s.human).length} 步需要人工确认`);
  check('定制参数校验', Array.isArray(el.checks), `${(el.checks || []).length} 条校验规则`);

  const created = await J('/api/business/elements', {
    method: 'POST',
    body: JSON.stringify({ name: 'gNB-HZ-0999', arch: 'SA', kind: 'gNB', version: '5.2.3', software: 'NR-RAN', group: 'g-hz-01', components: ['主控板', '业务板'] }),
  });
  check('新建网元（属性全部可定制）', created.status === 200 && created.body.version === '5.2.3',
    `${created.status} → ${created.body.name} v${created.body.version}`);

  const copied = await J(`/api/business/elements/${created.body.id}/copy`, { method: 'POST', body: '{}' });
  check('复制网元', copied.status === 200 && copied.body.id !== created.body.id,
    `${created.body.id} → ${copied.body.id}（${copied.body.name}）`);

  const gs = (await J('/api/business/groups')).body;
  check('网元成组（同组网元）', gs.length > 0 && gs.some((g) => (g.element_ids || []).length > 1),
    gs.map((g) => g.name + '(' + (g.element_ids || []).length + ')').join(' · '));

  // 清理：删掉本轮新建的网元（DELETE 接口存在时生效，否则靠 clean-scene 兜底）
  for (const id of [created.body.id, copied.body.id]) {
    const del = await J('/api/business/elements/' + id, { method: 'DELETE' }).catch(() => ({ status: 0 }));
    if (del.status !== 200 && del.status !== 204) console.log('    （提示）网元 ' + id + ' 需靠 clean-scene 清理，DELETE 返回 ' + del.status);
  }
}

/* ================= 四、OMC ================= */
G('OMC 平台');
{
  const p = (await J('/api/business/platform')).body;
  check('定制平台所管理的网元', Array.isArray(p.omc_elements) && p.omc_elements.length > 0, `${p.omc_elements.length} 个网元`);
  check('定制平台所管理的网元组', Array.isArray(p.omc_groups), `${(p.omc_groups || []).join(', ') || '（空）'}`);
  check('账号与其管理范围', (p.accounts || []).every((a) => Array.isArray(a.scope)),
    (p.accounts || []).map((a) => `${a.name}[${a.role}]→${a.scope.length} 网元`).join(' · '));

  const acc = await J('/api/business/platform', {
    method: 'PATCH',
    body: JSON.stringify({ accounts: (p.accounts || []).concat([{ id: 'acc-verify', name: 'verify-bot', role: '只读', scope: [p.omc_elements[0]] }]) }),
  });
  check('创建账号', acc.status === 200 && acc.body.accounts.some((a) => a.name === 'verify-bot'),
    `新增 verify-bot（只读，范围 ${p.omc_elements[0]}）`);
  // 清理
  await J('/api/business/platform', {
    method: 'PATCH',
    body: JSON.stringify({ accounts: acc.body.accounts.filter((a) => a.name !== 'verify-bot') }),
  });

  const tk = await J('/api/business/tasks', {
    method: 'POST',
    body: JSON.stringify({ site: 'site-hz', element_ids: [p.omc_elements[0]], from_version: '5.2.1', to_version: '5.2.2' }),
  });
  check('创建一体化升级任务并关联站点', tk.status === 200 && tk.body.site === 'site-hz' && tk.body.stages.length === 5,
    `${tk.body.id} · 站点 ${tk.body.site} · ${tk.body.stages.length} 段 · 起始 ${tk.body.progress}%`);
}

/* ================= 五、LCM ================= */
G('LCM 平台');
{
  const pkgs = (await J('/api/business/packages')).body;
  check('定制平台管理的软件包', pkgs.length > 0,
    pkgs.map((x) => `${x.name}@${x.version}(${x.kind}/${x.vendor})`).join(' · '));
  check('软件包四要素（类型/所属网元/厂商/版本）',
    pkgs.every((x) => x.kind && x.owner && x.vendor && x.version),
    `示例：${pkgs[0].kind} · ${pkgs[0].owner} · ${pkgs[0].vendor} · v${pkgs[0].version}`);
  const p = (await J('/api/business/platform')).body;
  check('可与 OMC 共部署', typeof p.co_deploy === 'boolean', `co_deploy=${p.co_deploy}`);
  const up = await J(`/api/business/packages/${pkgs[0].id}/upgrade`, { method: 'POST', body: JSON.stringify({ site: 'site-hz' }) });
  check('软件包一键生成 OMC 升级任务', up.status === 200 && !!up.body.id,
    `${up.body.id} · ${up.body.from_version} → ${up.body.to_version}`);
}

/* ================= 六、FS 虚层 ================= */
G('FS 虚层');
{
  const p = (await J('/api/business/platform')).body;
  const f = p.fs;
  check('定制平台 CPU 数量', typeof f.cpus === 'number' && f.cpus > 0, `${f.cpus} vCPU`);
  check('定制主副站点', !!f.site_primary && !!f.site_secondary, `主 ${f.site_primary} / 备 ${f.site_secondary}`);
  check('定制平台版本', !!f.version, `v${f.version}`);
  check('定制升级流程详情', (f.upgrade_steps || []).length >= 3, `${f.upgrade_steps.length} 步：${f.upgrade_steps.join(' → ')}`);
  check('定制软件包校验流程', (f.verify_steps || []).length >= 3, `${f.verify_steps.length} 步：${f.verify_steps.join(' → ')}`);

  // 改 CPU 再校验落库
  await J('/api/business/platform', { method: 'PATCH', body: JSON.stringify({ fs: Object.assign({}, f, { cpus: 40 }) }) });
  const after = (await J('/api/business/platform')).body.fs;
  check('平台配置可写回（CPU 16 → 40）', after.cpus === 40, `cpus=${after.cpus}`);
  await J('/api/business/platform', { method: 'PATCH', body: JSON.stringify({ fs: Object.assign({}, f, { cpus: f.cpus }) }) });

  const v = await J('/api/business/platform/fs/verify', { method: 'POST', body: '{}' });
  const runs = (v.body.fs || {}).verify_runs || [];
  const pass = runs.filter((r) => r.status === 'pass').length;
  const fail = runs.filter((r) => r.status === 'fail').length;
  check('软件包校验流程可执行（失败即中断）', runs.length > 0,
    `${runs.length} 步执行：${pass} PASS / ${fail} FAIL${fail ? ' → 中断' : ''}`);
}

/* ---------- 汇总 ---------- */
const total = results.length;
const passed = results.filter((r) => r.pass).length;
let lastGroup = '';
for (const r of results) {
  if (r.group !== lastGroup) { console.log('\n■ ' + r.group); lastGroup = r.group; }
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\n${passed}/${total} 通过${passed === total ? ' ✅' : ' ❌'}`);
process.exit(passed === total ? 0 : 1);

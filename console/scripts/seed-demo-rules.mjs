// 给 map-0001（POST /nemp/v1/ne/register）配置演示规则：4 条变体 + 3 个字段行为
// 同时删除带时间戳的测试映射，让审计页展示干净数据。
const BASE = process.env.RHINE_BASE || 'http://127.0.0.1:9600';

const login = async () => {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
  });
  const j = await r.json();
  const cookie = (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  return { Cookie: cookie, 'X-CSRF': j.csrf, 'Content-Type': 'application/json' };
};

const variants = [
  { when: 'req.mode=="fast"', status: 201, delay_ms: 5, body: '{"code":0,"mode":"fast","ne":"gNB-HZ-0904"}', note: '快速通道' },
  { when: 'req.mode=="slow"', status: 200, delay_ms: 600, body: '{"code":0,"mode":"slow"}', note: '慢链路（撑高 P95）' },
  { when: 'req.mode=="fail"', status: 500, delay_ms: 12, body: '{"code":5001,"msg":"register rejected"}', note: '注册失败用例' },
  { when: '', status: 200, delay_ms: 45, body: '{"code":0,"mode":"default"}', note: '兜底' },
];

// RuleField：kind(string|number|boolean|object|array) + source(static|autoIncrement|once|condition)
const fields = [
  { name: 'sessionId', kind: 'string', source: 'autoIncrement', value: 'SESS-', step: 1 },
  { name: 'onceToken', kind: 'string', source: 'once', value: 'ONE-ONLY-OK' },
  { name: 'accepted', kind: 'boolean', source: 'condition', condition: 'req.mode=="fast"?true:false', value: 'false' },
];

const H = await login();

const r = await fetch(BASE + '/api/business/mappings/map-0001/rules', {
  method: 'PATCH', headers: H, body: JSON.stringify({ variants, fields }),
});
console.log('配置 map-0001 规则 → ' + r.status);

const ms = await fetch(BASE + '/api/business/mappings', { headers: H }).then((x) => x.json());
const m = ms.find((x) => x.id === 'map-0001');
console.log('  ' + m.method.toUpperCase() + ' ' + m.path + '  variants=' + m.variants.length + ' fields=' + m.fields.length);

// 打几次真实请求，制造演示用审计数据
const modes = ['fast', 'slow', 'fail', '', 'fast', 'slow', '', 'fast', 'fail', 'slow'];
for (const mode of modes) {
  const body = mode ? JSON.stringify({ mode }) : '{}';
  await fetch(BASE + '/mock' + m.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
console.log('  已产生 ' + modes.length + ' 条审计（/nemp/v1/ne/register）');

// 删除带时间戳的测试映射
const targets = ms.filter((x) => /-\d{10,}$/.test(x.path));
for (const t of targets) {
  const d = await fetch(BASE + '/api/business/mappings/' + t.id, { method: 'DELETE', headers: H });
  console.log('  删除测试映射 ' + t.id + ' ' + t.path + ' → ' + d.status);
}

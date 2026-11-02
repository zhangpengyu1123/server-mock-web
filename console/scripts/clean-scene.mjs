// 清理场景：删除带时间戳的测试映射与演示任务，保留干净的演示规则 map-0001
const BASE = process.env.RHINE_BASE || 'http://127.0.0.1:9600';

const r = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
});
const j = await r.json();
const H = {
  Cookie: (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; '),
  'X-CSRF': j.csrf, 'Content-Type': 'application/json',
};

const scene = await fetch(BASE + '/api/business/export', { headers: H }).then((x) => x.json());
const before = { mappings: scene.mappings.length, tasks: (scene.tasks || []).length };

scene.mappings = scene.mappings.filter((m) => !/\d{10,}$/.test(m.path));
// 回归脚本留下的痕迹：gNB-HZ-0999 及其副本、18443 测试端点
scene.elements = (scene.elements || []).filter((e) => !/0999/.test(e.name));
scene.endpoints = (scene.endpoints || []).filter((e) => e.port !== 18443);
scene.tasks = [];
scene.hits = [];

const imp = await fetch(BASE + '/api/business/import', {
  method: 'POST', headers: H, body: JSON.stringify(scene),
});
console.log('导入清理后的场景 → ' + imp.status + '  ' + (await imp.text()));
console.log('  映射 ' + before.mappings + ' → ' + scene.mappings.length + '；任务 ' + before.tasks + ' → 0；命中清空');

const ms = await fetch(BASE + '/api/business/mappings', { headers: H }).then((x) => x.json());
console.log('  剩余映射:');
ms.forEach((m) => console.log('    ' + m.method.toUpperCase() + ' ' + m.path + '  v=' + (m.variants || []).length));

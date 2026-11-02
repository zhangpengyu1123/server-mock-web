// 造审计数据：4 种状态（201/200慢/500/200默认）
const BASE = 'http://127.0.0.1:9600';

(async () => {
  const l = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
  });
  const j = await l.json();
  const cookie = (l.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', 'X-CSRF': j.csrf, Cookie: cookie };

  const path = '/demo/v1/audit' + Date.now();
  const m = await fetch(BASE + '/api/business/mappings', {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: '审计演示', method: 'POST', path, status: 200, body: '{"ok":true}', version: '0.1.0' }),
  }).then((r) => r.json());

  await fetch(BASE + '/api/business/mappings/' + m.id + '/rules', {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      variants: [
        { when: 'req.mode=="fast"', status: 201, delay_ms: 5, body: '{"m":"fast"}' },
        { when: 'req.mode=="slow"', status: 200, delay_ms: 600, body: '{"m":"slow"}' },
        { when: 'req.mode=="fail"', status: 500, delay_ms: 12, body: '{"e":1}' },
        { when: '', status: 200, delay_ms: 45, body: '{"m":"default"}' },
      ],
      fields: [],
    }),
  });

  const modes = ['fast', 'slow', 'fail', 'x', 'fast', 'slow', 'fail', 'x', 'x', 'fast', 'slow', 'fail'];
  for (const mode of modes) {
    await fetch(BASE + '/mock' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
    });
  }
  console.log('已产生 ' + modes.length + ' 条审计（path=' + path + '）');
})();

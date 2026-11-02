// 多规则匹配验证
const BASE = 'http://127.0.0.1:9600';

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
  });
  const j = await login.json();
  const cookie = (login.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', 'X-CSRF': j.csrf, Cookie: cookie };

  const m = await fetch(BASE + '/api/business/mappings', {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: '多规则演示', method: 'POST', path: '/demo/v1/variant-' + Date.now(), status: 200, body: '{"mode":"none"}', version: '0.1.0' }),
  }).then((r) => r.json());

  console.log('created mapping:', JSON.stringify(m).slice(0, 120));
  const patch = await fetch(BASE + '/api/business/mappings/' + m.id + '/rules', {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      variants: [
        { when: 'req.mode=="fast"', status: 201, delay_ms: 0, body: '{"mode":"fast","ok":true}', note: '快速通道' },
        { when: 'req.mode=="fail"', status: 500, delay_ms: 0, body: '{"error":"boom"}', note: '故障注入' },
        { when: '', status: 200, delay_ms: 120, body: '{"mode":"default"}', note: '兜底' },
      ],
    }),
  });
  console.log('PATCH rules →', patch.status);

  for (const mode of ['fast', 'fail', 'other']) {
    const t0 = Date.now();
    const res = await fetch(BASE + '/mock' + m.path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
    });
    const text = await res.text();
    console.log('mode=' + mode.padEnd(6) + ' → ' + res.status + '  ' + String(Date.now() - t0).padStart(3) + 'ms  rule=' + (res.headers.get('x-rhine-rule') || '-').padEnd(18) + ' ' + text);
  }
})();

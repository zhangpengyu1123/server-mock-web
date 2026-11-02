#!/usr/bin/env node
/* FS 校验流程测试：单次登录拿 cookie+csrf，再跑两种场景 */
const BASE = 'http://127.0.0.1:9600';
const steps = ['校验 checksum（sha256）', '校验签名（GPG）', '校验包与平台版本兼容性', '校验主备站点一致性'];
const upgrade = ['挂载安装镜像', '预检查（CPU/内存/存储）', '停业务', '安装', '启动并自检', '主备切换验证'];

async function login() {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'rhine-admin-2026' }),
  });
  const j = await r.json();
  const cookie = (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  return { csrf: j.csrf, cookie };
}

async function main() {
  const { csrf, cookie } = await login();
  const H = { 'Content-Type': 'application/json', 'X-CSRF': csrf, Cookie: cookie };
  const put = (fs) => fetch(BASE + '/api/business/platform', { method: 'PATCH', headers: H, body: JSON.stringify({ fs }) }).then((r) => r.json());
  const verify = () => fetch(BASE + '/api/business/platform/fs/verify', { method: 'POST', headers: H, body: '{}' }).then((r) => r.json());

  await put({ cpus: 16, site_primary: 'HZ 主站点', site_secondary: 'HZ 主站点', version: '2.4.0', verify_steps: steps, upgrade_steps: upgrade });
  const bad = await verify();
  console.log('=== 场景 A：主备站点同名（应停在第 4 步）===');
  (bad.fs.verify_runs || []).forEach((r) => console.log(`  [${r.status}] ${r.step} — ${r.note}`));

  await put({ cpus: 16, site_primary: 'HZ 主站点', site_secondary: 'NB 备站点', version: '2.4.0', verify_steps: steps, upgrade_steps: upgrade });
  const good = await verify();
  console.log('=== 场景 B：正常（4 项全过）===');
  (good.fs.verify_runs || []).forEach((r) => console.log(`  [${r.status}] ${r.step} — ${r.note}`));
}

main().catch((e) => { console.error('failed:', e.message); process.exit(1); });

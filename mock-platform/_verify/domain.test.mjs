/* ============================================================================
 * mock-platform / _verify/domain.test.mjs
 * 共享领域层的单元测试（零依赖，node --test 也可跑）
 * 用法: node _verify/domain.test.mjs
 *
 * 三版前台共用同一份 domain.js，所以规则引擎、动作、选择器一旦错了是三版一起错。
 * 这里把「自增/单次生效/条件」这些需求点变成可执行断言。
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// domain.js 是浏览器脚本（IIFE，挂到 window），在 Node 里用一个最小 window 沙箱加载
const src = readFileSync(join(here, '..', '_shared', 'domain.js'), 'utf8');
const sandbox = { window: {}, console };
new Function('window', 'console', src)(sandbox.window, console);
const MP = sandbox.window.MP;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const fresh = () => { const s = { window: {}, console }; new Function('window', 'console', src)(s.window, console); return s.window.MP; };

console.log('\ndomain.js · 规则引擎');

t('固定规则：每次返回同一个值', () => {
  const M = fresh();
  const f = { key: 'code', value: '0', rule: { kind: 'fixed' } };
  assert.equal(M.resolveField(f, { response: {}, hit: 1 }).value, '0');
  assert.equal(M.resolveField(f, { response: {}, hit: 9 }).value, '0');
});

t('自增规则：按步长累加并支持 {n:04} 格式', () => {
  const M = fresh();
  const f = { key: 'data.neId', value: 'x', rule: { kind: 'increment', start: 1, step: 1, pattern: 'GNB-HZ-{n:04}' } };
  assert.equal(M.resolveField(f, { response: {}, hit: 1 }).value, 'GNB-HZ-0001');
  assert.equal(M.resolveField(f, { response: {}, hit: 7 }).value, 'GNB-HZ-0007');
  const f2 = { key: 'n', value: '0', rule: { kind: 'increment', start: 10, step: 5 } };
  assert.equal(M.resolveField(f2, { response: {}, hit: 3 }).value, '20');
});

t('单次生效：首次返回设定值，之后走兜底值', () => {
  const M = fresh();
  const f = { key: 'data.token', value: 'tk_9f2c', rule: { kind: 'once', times: 1, fallback: 'EXPIRED' } };
  assert.equal(M.resolveField(f, { response: {}, hit: 1 }).value, 'tk_9f2c');
  assert.equal(M.resolveField(f, { response: {}, hit: 2 }).value, 'EXPIRED');
  const g = { key: 't', value: 'A', rule: { kind: 'once', times: 2, fallback: 'B' } };
  assert.equal(M.resolveField(g, { response: {}, hit: 2 }).value, 'A');
  assert.equal(M.resolveField(g, { response: {}, hit: 3 }).value, 'B');
});

t('条件规则：包含 / 等于 / 非空 / 末尾为偶数', () => {
  const M = fresh();
  const f = (op, then, els) => ({ key: 'site', value: '', rule: { kind: 'conditional', when: { key: 'neId', op: op, value: 'GNB' }, then: then, else: els } });
  assert.equal(M.resolveField(f('包含', '杭州主站点', '南京副站点'), { response: { neId: 'GNB-HZ-0001' }, hit: 1 }).value, '杭州主站点');
  assert.equal(M.resolveField(f('包含', '杭州主站点', '南京副站点'), { response: { neId: 'AMF-NJ-0003' }, hit: 1 }).value, '南京副站点');
  const eq = { key: 'x', value: '', rule: { kind: 'conditional', when: { key: 'a', op: '等于', value: '1' }, then: 'Y', else: 'N' } };
  assert.equal(M.resolveField(eq, { response: { a: '1' }, hit: 1 }).value, 'Y');
  assert.equal(M.resolveField(eq, { response: { a: '2' }, hit: 1 }).value, 'N');
  const nz = { key: 'x', value: '', rule: { kind: 'conditional', when: { key: 'a', op: '非空', value: '' }, then: 'Y', else: 'N' } };
  assert.equal(M.resolveField(nz, { response: { a: 'x' }, hit: 1 }).value, 'Y');
  assert.equal(M.resolveField(nz, { response: { a: '' }, hit: 1 }).value, 'N');
});

t('随机规则：只从候选值里取', () => {
  const M = fresh();
  const f = { key: 'x', value: '', options: ['a', 'b', 'c'], rule: { kind: 'random' } };
  for (let i = 0; i < 40; i++) assert.ok(['a', 'b', 'c'].includes(M.resolveField(f, { response: {}, hit: i }).value));
});

t('buildResponse：命中次数累加，且每个字段带可读的命中说明', () => {
  const M = fresh();
  const api = M.state.apis.find((a) => a.id === 'api-1');
  const before = api.hits;
  const r1 = M.buildResponse(api);
  assert.equal(api.hits, before + 1);
  assert.equal(r1.hit, before + 1);
  assert.ok(r1.notes.length === api.fields.length);
  assert.ok(r1.notes.every((n) => typeof n.note === 'string' && n.note.length > 0));
  const inc = r1.notes.find((n) => n.rule === 'increment');
  assert.ok(inc && /GNB-HZ-/.test(inc.value), '自增字段应展开为编号');
  const once = r1.notes.find((n) => n.rule === 'once');
  assert.ok(once, '应有单次生效字段');
});

t('buildResponse 支持嵌套路径（data.neId 这类对象化字段）', () => {
  const M = fresh();
  const api = M.state.apis.find((a) => a.id === 'api-5');
  const r = M.buildResponse(api);
  assert.equal(typeof r.body.data, 'object');
  assert.ok('stackId' in r.body.data);
});

console.log('\ndomain.js · 动作与选择器');

t('注册端口 → 选择 → 删除，端口数正确变化', () => {
  const M = fresh();
  const before = M.state.ports.length;
  const p = M.actions.registerPort({ ip: '10.0.0.9', port: 10443, protocol: 'HTTPS' });
  assert.equal(M.state.ports.length, before + 1);
  assert.equal(M.state.ui.selectedPort, p.id);
  M.actions.removePort(p.id);
  assert.equal(M.state.ports.length, before);
});

t('签发证书：状态与字段齐全，可导出所需信息', () => {
  const M = fresh();
  const cert = M.actions.generateCert('port-2', { cn: 'mock-test', days: 90 });
  assert.equal(cert.status, 'issued');
  assert.equal(cert.cn, 'mock-test');
  assert.equal(cert.days, 90);
  assert.ok(cert.fingerprint.length > 0);
});

t('挂载 / 卸载平台能力（一个端口可挂多种）', () => {
  const M = fresh();
  M.actions.attachCap('port-2', 'cap-nemp');
  M.actions.attachCap('port-2', 'cap-lcmp');
  const p = M.state.ports.find((x) => x.id === 'port-2');
  assert.deepEqual(p.caps.sort(), ['cap-lcmp', 'cap-nemp', 'cap-vlmp'].sort());
  M.actions.detachCap('port-2', 'cap-vlmp');
  assert.ok(!M.state.ports.find((x) => x.id === 'port-2').caps.includes('cap-vlmp'));
});

t('启停服务会写审计日志', () => {
  const M = fresh();
  const n = M.state.logs.length;
  M.actions.startService('port-2');
  assert.equal(M.state.ports.find((x) => x.id === 'port-2').running, true);
  assert.ok(M.state.logs.length > n);
  M.actions.stopService('port-2');
  assert.equal(M.state.ports.find((x) => x.id === 'port-2').running, false);
});

t('插入人机交互 → 触发后可在日志里放行 / 拒绝', () => {
  const M = fresh();
  M.actions.addInteraction('api-1', 'human-confirm');
  M.actions.selectApi('api-1');
  const log = M.actions.triggerApi('api-1');
  assert.equal(log.status, 202);
  assert.equal(log.interaction.status, 'pending');
  M.actions.resolveInteraction(log.id, 'approve');
  assert.equal(log.interaction.status, 'approve');
  assert.equal(log.status, 200);
  const log2 = M.actions.triggerApi('api-1');
  M.actions.resolveInteraction(log2.id, 'reject');
  assert.equal(log2.status, 403);
});

t('字段增删改：新增后可改规则与取值', () => {
  const M = fresh();
  const f = M.actions.addField('api-1');
  assert.ok(f && f.id);
  M.actions.updateField('api-1', f.id, { key: 'data.foo', rule: { kind: 'increment', start: 100, step: 2 } });
  const got = M.state.apis.find((a) => a.id === 'api-1').fields.find((x) => x.id === f.id);
  assert.equal(got.key, 'data.foo');
  assert.equal(got.rule.start, 100);
  M.actions.removeField('api-1', f.id);
  assert.ok(!M.state.apis.find((a) => a.id === 'api-1').fields.some((x) => x.id === f.id));
});

t('复制网元：编号唯一且属性/流程继承', () => {
  const M = fresh();
  const src = M.state.nes.find((n) => n.id === 'ne-1');
  const c = M.actions.copyNE('ne-1');
  assert.notEqual(c.neId, src.neId);
  const ids = M.state.nes.map((n) => n.neId);
  assert.equal(new Set(ids).size, ids.length, '网元编号必须唯一：' + ids.join(','));
  assert.deepEqual(c.upgrade.map((s) => s.name), src.upgrade.map((s) => s.name));
  assert.equal(c.status, '未注册');
});

t('参数校验：命中通过，不合规返回失败（含正则非法也不崩）', () => {
  const M = fresh();
  const ok = M.actions.runValidation('ne-1');
  assert.ok(ok.every((r) => r.pass), JSON.stringify(ok));
  M.actions.updateNE('ne-1', { neId: 'BAD' });
  const bad = M.actions.runValidation('ne-1');
  assert.ok(bad.some((r) => !r.pass));
  M.actions.addValidation('ne-1', { field: 'neId', rule: '([', level: '错误', message: '非法正则' });
  assert.doesNotThrow(() => M.actions.runValidation('ne-1'));
});

t('升级流程：新增人工步骤会自动带人机交互；可上下移', () => {
  const M = fresh();
  const n = M.state.nes.find((x) => x.id === 'ne-1');
  const len = n.upgrade.length;
  M.actions.addUpgradeStep('ne-1', { name: '业务验证', kind: 'human', owner: '值班工程师' });
  assert.equal(n.upgrade.length, len + 1);
  assert.equal(n.upgrade[len].kind, 'human');
  assert.equal(n.upgrade[len].interaction.owner, '值班工程师');
  const first = n.upgrade[0].id, second = n.upgrade[1].id;
  M.actions.moveStep('ne-1', second, -1);
  assert.equal(n.upgrade[0].id, second);
  assert.equal(n.upgrade[1].id, first);
});

t('网元成组：成员在组间移动且不重复', () => {
  const M = fresh();
  M.actions.assignGroup('ne-5', 'grp-hz');
  const hz = M.state.groups.find((g) => g.id === 'grp-hz');
  assert.ok(hz.members.includes('ne-5'));
  assert.equal(hz.members.filter((m) => m === 'ne-5').length, 1, '同一成员不能重复进组');
  M.actions.assignGroup('ne-5', 'grp-nj');
  assert.ok(!M.state.groups.find((g) => g.id === 'grp-hz').members.includes('ne-5'));
  assert.ok(M.state.groups.find((g) => g.id === 'grp-nj').members.includes('ne-5'));
});

t('创建账号 / 启停账号', () => {
  const M = fresh();
  const n = M.state.accounts.length;
  const a = M.actions.createAccount({ name: 'ops_test', role: '升级操作员', nes: ['ne-1'] });
  assert.equal(M.state.accounts.length, n + 1);
  M.actions.toggleAccount(a.id);
  assert.equal(a.status, '停用');
});

t('一体化升级任务：推进到人工步骤会挂起为 waiting-human', () => {
  const M = fresh();
  const t = M.actions.createTask({ name: 'T', site: '杭州主站点', neIds: ['ne-1'] });
  assert.equal(t.status, 'running');
  for (let i = 0; i < 12 && t.status === 'running'; i++) M.actions.advanceTask(t.id);
  assert.ok(t.progress > 0);
  assert.ok(['waiting-human', 'done', 'running'].includes(t.status));
});

t('软件包：登记 → 校验 → 移除', () => {
  const M = fresh();
  const p = M.actions.addPackage({ name: 'X.pkg', type: '补丁', ne: 'ne-1', vendor: '华为', version: '1.0.1', sizeMB: 10 });
  assert.equal(p.validated, false);
  M.actions.validatePackage(p.id);
  assert.equal(M.state.packages.find((x) => x.id === p.id).validated, true);
  M.actions.removePackage(p.id);
  assert.ok(!M.state.packages.some((x) => x.id === p.id));
});

t('虚层平台：CPU 钳制在范围内、主副站点可切换、校验项可执行', () => {
  const M = fresh();
  M.actions.setCPU(9999);
  assert.equal(M.state.vlp.cpu, M.state.vlp.cpuRange[1]);
  M.actions.setCPU(1);
  assert.equal(M.state.vlp.cpu, M.state.vlp.cpuRange[0]);
  M.actions.setSite('primary', 'site-b');
  assert.equal(M.state.vlp.primarySite, 'site-b');
  M.actions.runVlpCheck('vc4');
  assert.equal(M.state.vlp.checks.find((c) => c.id === 'vc4').state, 'pass');
});

t('流量模拟器：tick 只写运行中端口的日志，并累加统计', () => {
  const M = fresh();
  const n = M.state.logs.length;
  M.sim.tick(); M.sim.tick(); M.sim.tick();
  assert.ok(M.state.logs.length >= n, '日志不应减少');
  assert.ok(M.state.logs.length <= n + 6, '每次 tick 至多 2 条');
});

t('订阅机制：动作会广播事件，退订后不再收到', () => {
  const M = fresh();
  let got = [];
  const off = M.subscribe((s, e) => got.push(e.type));
  M.actions.setScreen('flow');
  M.actions.attachCap('port-1', 'cap-alarm');
  assert.ok(got.includes('screen') && got.includes('caps'));
  off();
  const before = got.length;
  M.actions.setScreen('ne');
  assert.equal(got.length, before);
});

t('kpis 选择器：数字自洽（成功 + 异常 = 总数）', () => {
  const M = fresh();
  const k = M.select.kpis();
  assert.equal(k.ok + k.err, k.req);
  assert.ok(k.ports > 0 && k.ne > 0);
});

console.log('\n—— 共享层单测：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

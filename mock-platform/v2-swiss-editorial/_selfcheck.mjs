/* ============================================================================
 * V2 · 一次性自检脚本（node v2-swiss-editorial/_selfcheck.mjs）
 * ---------------------------------------------------------------------------
 * a) 抓出 app.js 里所有 $('#xxx') / document.getElementById('xxx') 的静态 id，
 *    断言每个 id 都出现在 index.html 中（动态生成的容器走白名单，逐条给出理由）。
 * b) 断言六个 data-screen 与六个导航项都存在于 index.html。
 * c) 额外断言：脚本引入顺序、微交互原语（≥8）与动效原语的实际调用。
 * 只做静态文本分析，不启动浏览器。
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, 'app.js'), 'utf8');
const html = readFileSync(join(here, 'index.html'), 'utf8');

let fail = 0;
const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => { fail++; console.log('  \u2717 ' + m); };
const head = (m) => console.log('\n' + m);

/* ------------------------------------------------ a) id 覆盖检查 --------- */
head('[a] $(\'#id\') / getElementById(\'id\') → index.html');

const ids = new Set();
for (const m of js.matchAll(/\$\(\s*'#([A-Za-z][\w-]*)'/g)) ids.add(m[1]);
for (const m of js.matchAll(/getElementById\(\s*'([A-Za-z][\w-]*)'/g)) ids.add(m[1]);
// 排除带拼接的动态模板（如 id="accSw-' + a.id + '"），它们不是静态 id
const staticIds = [...ids].filter((id) => /^[A-Za-z][\w-]*$/.test(id)).sort();

const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) htmlIds.add(m[1]);

/* 运行时由本变体的模板字符串生成的容器 id。
   每一项都必须能在 app.js 里找到对应的 id="…" / id\s*=\s*'…' 字面量，
   否则说明该 id 根本没有被创建（拼错或漏写），自检会直接判失败。 */
const GENERATED = [
  ['accSw-', /accSw-' \+ a\.id/, '账号行右侧的开关宿主（每个账号一个）'],
  ['taskGauge-', /taskGauge-' \+ t\.id/, '任务进度液面宿主（每个任务一个）'],
  ['taskMark-', /taskMark-' \+ t\.id/, '任务状态形变宿主（每个任务一个）'],
  ['pkgOps-', /pkgOps-' \+ p\.id/, '软件包行操作区（每个包一个）'],
  ['vm-', /vm-' \+ v\.id/, '校验规则状态标记宿主（每条规则一个）'],
  ['vr-', /vr-' \+ r\.id/, '校验执行结果标记宿主（每条结果一个）'],
  ['vcm-', /vcm-' \+ c\.id/, '虚层校验项状态标记宿主（每项一个）'],
  ['vfm-', /vfm-' \+ s\.id/, '虚层升级流程步骤状态标记宿主（每步一个）'],
  ['certMark', /id="certMark"/, '证书状态形变宿主（详情面板渲染时生成）'],
  ['certGen', /id="certGen"/, '证书签发按钮宿主'],
  ['certCn', /id="certCn"/, '证书 CN 输入框（仅未签发时存在）'],
  ['certDays', /id="certDays"/, '证书有效期下拉（仅未签发时存在）'],
  ['svcBox', /id="svcBox"/, 'MOCK 服务控制区（启动 / 停止 / 删除）'],
  ['delayScrub', /id="delayScrub"/, '响应延迟拖拽控件宿主'],
  ['ixAdd', /id="ixAdd"/, '人机交互插入分段控件宿主'],
  ['cpuScrub', /id="cpuScrub"/, 'CPU 核数拖拽控件宿主'],
  ['cpuGauge', /id="cpuGauge"/, 'CPU 配额液面宿主'],
  ['coDeploySw', /id="coDeploySw"/, '共部署开关宿主（生命周期平台）'],
  ['stepName', /id="stepName"/, '新增升级步骤名称输入'],
  ['stepKind', /id="stepKind"/, '新增升级步骤类型分段控件宿主'],
  ['stepDur', /id="stepDur"/, '新增升级步骤时长输入'],
  ['flowGauge', /id="flowGauge"/, '升级流程就绪度液面宿主'],
  ['upgradeHold', /id="upgradeHold"/, '按住执行升级按钮宿主'],
  ['validResult', /id="validResult"/, '参数校验执行结果区'],
  ['vField', /id="vField"/, '校验规则字段输入'],
  ['vRule', /id="vRule"/, '校验规则正则输入'],
  ['vLevel', /id="vLevel"/, '校验规则级别下拉'],
  ['vMsg', /id="vMsg"/, '校验不通过提示输入'],
  ['groupName', /id="groupName"/, '新建网元组名称输入'],
  ['groupStrategy', /id="groupStrategy"/, '新建网元组策略输入'],
  ['neCopy', /id="neCopy"/, '复制网元按钮']
];

const missing = [], dynamic = [];
for (const id of staticIds) {
  if (htmlIds.has(id)) continue;
  const hit = GENERATED.find(([prefix, re]) => id === prefix || id.startsWith(prefix));
  if (!hit) { missing.push(id); continue; }
  if (!hit[1].test(js)) { missing.push(id + '（白名单条目与 app.js 模板不匹配，疑似拼写漂移）'); continue; }
  dynamic.push(id + '  ← ' + hit[2]);
}
console.log('  静态 id 共 ' + staticIds.length + ' 个；index.html 内 ' + htmlIds.size + ' 个 id');
if (dynamic.length) console.log('  运行时生成的容器（已在 app.js 模板中逐条核对）:\n    - ' + dynamic.join('\n    - '));
if (missing.length) missing.forEach((id) => bad('index.html 缺少 id: #' + id));
else ok('所有静态 id 均能在 index.html 找到，或命中「运行时生成容器」白名单并经模板核对');

/* --------------------------------- b) 六个 data-screen + 六个 nav 项 ----- */
head('[b] 六个 data-screen 与六个导航项');
const SCREENS = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
const screens = [...html.matchAll(/data-screen="([^"]+)"/g)].map((m) => m[1]);
const navs = [...html.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]);
for (const s of SCREENS) {
  if (screens.includes(s)) ok('data-screen="' + s + '" 存在');
  else bad('缺少 data-screen="' + s + '"');
}
for (const s of SCREENS) {
  if (navs.includes(s)) ok('导航项 data-nav="' + s + '" 存在');
  else bad('缺少导航项 data-nav="' + s + '"');
}
if (screens.length !== 6) bad('data-screen 数量为 ' + screens.length + '，期望 6');
if (navs.length !== 6) bad('data-nav 数量为 ' + navs.length + '，期望 6');

/* ------------------------------------------- c) 依赖顺序 / 原语清单 ----- */
head('[c] 脚本引入顺序（共享层 → 本变体）');
const order = ['../_shared/domain.js', '../_shared/motion.js', '../_shared/micro.js', '../_shared/fx.js', './app.js'];
let cursor = -1, orderOk = true;
for (const src of order) {
  const at = html.indexOf('src="' + src + '"');
  if (at < 0) { bad('index.html 缺少 <script src="' + src + '">'); orderOk = false; continue; }
  if (at < cursor) { bad('引入顺序错误：' + src); orderOk = false; }
  cursor = at;
}
if (orderOk) ok('domain → motion → micro → fx → app.js 顺序正确');

head('[c] MP.micro 原语使用（要求 ≥ 8 个不同原语）');
const MICRO = ['holdConfirm', 'velocitySwitch', 'gauge', 'statusMark', 'scrub', 'toast',
  'rippleLoader', 'latticeLoader', 'segmented', 'fuseButton', 'magnetic', 'spotlight'];
const usedMicro = MICRO.filter((k) => new RegExp('X\\.' + k + '\\(').test(js));
usedMicro.forEach((k) => ok('MP.micro.' + k));
if (usedMicro.length < 8) bad('只用到 ' + usedMicro.length + ' 个微交互原语，要求 ≥ 8');

head('[c] MP.motion 动效原语使用');
const MOTION = ['iris', 'develop', 'stagger', 'countUp', 'reveal'];
const usedMotion = MOTION.filter((k) => new RegExp('M\\.' + k + '\\(').test(js));
usedMotion.forEach((k) => ok('MP.motion.' + k));
if (!/M\.reduced/.test(js)) bad('未处理 MP.motion.reduced'); else ok('MP.motion.reduced 已处理');
if (!/MP\.sfx\.toggle\(/.test(js)) bad('未接入 MP.sfx.toggle()'); else ok('音效开关调用 MP.sfx.toggle()');

head('[c] 规则引擎五类 + 人机交互三类');
for (const k of ['fixed', 'increment', 'once', 'conditional', 'random']) {
  if (new RegExp("'" + k + "'").test(js) || new RegExp('"' + k + '"').test(js)) ok('规则种类覆盖：' + k);
  else bad('未覆盖规则种类：' + k);
}
for (const k of ['human-confirm', 'captcha', 'manual-gate']) {
  if (js.includes(k)) ok('人机交互种类覆盖：' + k); else bad('未覆盖人机交互：' + k);
}

/* ---------------------------------------------------------------- 结果 --- */
head('结果');
if (fail) { console.log('  ✗ 自检未通过，失败 ' + fail + ' 项'); process.exit(1); }
console.log('  ✓ 全部自检通过（' + staticIds.length + ' 个静态 id / 6 个界面 / 6 个导航项）');

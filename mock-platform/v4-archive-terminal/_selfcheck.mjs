/* ============================================================================
 * V4 · 档案终端 · 一次性自检脚本
 *   运行：node v4-archive-terminal/_selfcheck.mjs   （在 mock-platform 目录下）
 *
 * a) 抓出 app.js 里所有 $('#id') / getElementById('id') 的静态 id，
 *    断言每个 id 都存在于 index.html；运行时由模板生成的容器走白名单，
 *    且白名单条目必须能在 app.js 里找到对应字面量（防止拼写漂移）。
 * b) 断言六个 data-screen、六个导航项（data-nav）都在 index.html。
 * c) 断言 MP.btn（≥4 类用法：install/enhance/loading/standard/magnetic）与
 *    MP.micro（≥8 个原语）都在 app.js 里被真实调用；顺带核对脚本引入顺序、
 *    MP.motion 原语、音效开关与规则 / 人机交互种类覆盖。
 * 全部为静态文本分析，不启动浏览器、不占用任何端口。
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, 'app.js'), 'utf8');
const html = readFileSync(join(here, 'index.html'), 'utf8');
const css = readFileSync(join(here, 'app.css'), 'utf8');

let fail = 0;
const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => { fail++; console.log('  \u2717 ' + m); };
const head = (m) => console.log('\n' + m);

/* ------------------------------------------------ a) id 覆盖检查 --------- */
head("[a] $('\\#id') / getElementById('id') → index.html");

const ids = new Set();
for (const m of js.matchAll(/\$\(\s*'#([A-Za-z][\w-]*)'/g)) ids.add(m[1]);
for (const m of js.matchAll(/getElementById\(\s*'([A-Za-z][\w-]*)'/g)) ids.add(m[1]);
const staticIds = [...ids].filter((id) => /^[A-Za-z][\w-]*$/.test(id)).sort();

const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) htmlIds.add(m[1]);

/* 运行时由本变体模板生成的容器 id：每项必须能在 app.js 找到对应字面量 */
const GENERATED = [
  ['certMark', /id="certMark"/, '证书状态形变宿主（签发 / 未签发两态）'],
  ['certCn', /id="certCn"/, '证书 CN 输入（仅未签发时存在）'],
  ['certDays', /id="certDays"/, '证书有效期下拉（仅未签发时存在）'],
  ['certIssuer', /id="certIssuer"/, '证书签发机构下拉（仅未签发时存在）'],
  ['certCnErr', /id="certCnErr"/, '证书 CN 就近报错'],
  ['certGenHost', /id="certGenHost"/, '证书签发按钮宿主'],
  ['certGenBtn', /id="certGenBtn"/, '证书签发按钮自身'],
  ['svcBox', /id="svcBox"/, 'MOCK 服务控制区（启动 / 停止 / 删除）'],
  ['delayScrub', /id="delayScrub"/, '响应延迟拖拽控件宿主'],
  ['ixAdd', /id="ixAdd"/, '人机交互插入分段控件宿主'],
  ['stepList', /id="stepList"/, '升级流程步骤列表'],
  ['stepName', /id="stepName"/, '新增步骤名称输入'],
  ['stepDur', /id="stepDur"/, '新增步骤耗时输入'],
  ['stepKind', /id="stepKind"/, '新增步骤类型分段控件宿主'],
  ['stepStatus', /id="stepStatus"/, '升级执行状态文字'],
  ['flowGauge', /id="flowGauge"/, '升级流程进度液面宿主'],
  ['upRun', /id="upRun"/, '按住执行升级流程按钮'],
  ['paramList', /id="paramList"/, '网元属性键值对列表'],
  ['paramKey', /id="paramKey"/, '新属性名输入'],
  ['paramVal', /id="paramVal"/, '新属性值输入'],
  ['validList', /id="validList"/, '参数校验规则列表'],
  ['validResult', /id="validResult"/, '参数校验执行结果区'],
  ['vField', /id="vField"/, '校验规则字段下拉'],
  ['vRule', /id="vRule"/, '校验规则正则输入'],
  ['vLevel', /id="vLevel"/, '校验规则级别下拉'],
  ['vMsg', /id="vMsg"/, '校验不通过提示输入'],
  ['groupSel', /id="groupSel"/, '归组下拉'],
  ['groupStrategy', /id="groupStrategy"/, '组策略输入'],
  ['neName', /id="neName"/, '网元名称输入（属性 / 版本页签渲染时生成）'],
  ['neVerErr', /id="neVerErr"/, '网元版本就近报错'],
  ['neSave', /id="neSave"/, '保存网元属性按钮'],
  ['neCopy', /id="neCopy"/, '复制网元按钮'],
  ['cpuScrub', /id="cpuScrub"/, 'CPU 核数拖拽控件宿主'],
  ['cpuGauge', /id="cpuGauge"/, 'CPU 配额液面宿主'],
  ['coDeploySw', /id="coDeploySw"/, '共部署开关宿主'],
  ['vlpVer', /id="vlpVer"/, '虚层平台版本下拉'],
  ['accSw-', /accSw-' \+ a\.id/, '账号行开关宿主（每账号一个）'],
  ['taskGauge-', /taskGauge-' \+ t\.id/, '任务进度液面宿主（每任务一个）'],
  ['taskMark-', /taskMark-' \+ t\.id/, '任务状态形变宿主（每任务一个）'],
  ['pkgMark-', /pkgMark-' \+ p\.id/, '软件包校验状态宿主（每包一个）'],
  ['stepMark-', /stepMark-' \+ s\.id/, '人工步骤状态标记宿主（每步一个）'],
  ['vrm-', /vrm-' \+ r\.id/, '参数校验结果标记宿主（每条结果一个）'],
  ['vcm-', /vcm-' \+ c\.id/, '虚层校验项状态标记宿主（每项一个）'],
  ['vcl-', /vcl-' \+ c\.id/, '虚层校验执行结果宿主（每项一个）'],
  ['pfIpCustom', /id = 'pfIpCustom'|id="pfIpCustom"/, '手动输入 IP 的输入框（选「手动输入…」时出现）']
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
const ticks = [...html.matchAll(/class="tick[^"]*"[^>]*data-nav="([^"]+)"/g)].map((m) => m[1]);
for (const s of SCREENS) {
  if (screens.includes(s)) ok('data-screen="' + s + '" 存在');
  else bad('缺少 data-screen="' + s + '"');
}
for (const s of SCREENS) {
  if (navs.includes(s)) ok('导航刻度 data-nav="' + s + '" 存在');
  else bad('缺少导航刻度 data-nav="' + s + '"');
}
if (screens.length !== 6) bad('data-screen 数量为 ' + screens.length + '，期望 6');
if (navs.length !== 6) bad('data-nav 数量为 ' + navs.length + '，期望 6');
if (ticks.length !== 6) bad('竖排刻度 .tick 数量为 ' + ticks.length + '，期望 6');

/* ------------------------------------------- c) 依赖顺序 / 原语清单 ----- */
head('[c] 脚本引入顺序（共享层 → 本变体）');
const order = ['../_shared/domain.js', '../_shared/motion.js', '../_shared/micro.js',
  '../_shared/button-fx.js', './app.js'];
let cursor = -1, orderOk = true;
for (const src of order) {
  const at = html.indexOf('src="' + src + '"');
  if (at < 0) { bad('index.html 缺少 <script src="' + src + '">'); orderOk = false; continue; }
  if (at < cursor) { bad('引入顺序错误：' + src); orderOk = false; }
  cursor = at;
}
if (orderOk) ok('domain → motion → micro → button-fx → app.js 顺序正确');

head('[c] MP.btn 按钮动效层（要求 ≥ 4 类用法）');
const BTN = [
  [/B\.install\(\)/, 'MP.btn.install()：注入纯「动」样式'],
  [/B\.enhance\(/, 'MP.btn.enhance()：自动增强按钮'],
  [/B\.loading\(/, 'MP.btn.loading()：异步 >300ms 的 loading 态'],
  [/data-fx="standard"/, 'data-fx="standard"：主行动 y:-4 / scale:1.02 / 250ms'],
  [/data-fx="magnetic"/, 'data-fx="magnetic"：磁吸（一屏 ≤2）'],
  [/data-fx="subtle"/, 'data-fx="subtle"：刻度与文字按钮 y:-1 / 150ms']
];
let btnKinds = 0;
for (const [re, label] of BTN) {
  const n = (js.match(new RegExp(re.source, 'g')) || []).length + (html.match(new RegExp(re.source, 'g')) || []).length;
  if (n > 0) { btnKinds++; ok(label + '   ×' + n); }
  else bad('缺失：' + label);
}
if (btnKinds < 4) bad('MP.btn 用法只覆盖 ' + btnKinds + ' 类，要求 ≥ 4');

head('[c] MP.micro 原语使用（要求 ≥ 8 个不同原语）');
const MICRO = ['holdConfirm', 'velocitySwitch', 'gauge', 'statusMark', 'scrub', 'toast',
  'rippleLoader', 'latticeLoader', 'segmented', 'fuseButton', 'magnetic', 'spotlight'];
const usedMicro = MICRO.filter((k) => new RegExp('X\\.' + k + '\\(').test(js));
usedMicro.forEach((k) => ok('MP.micro.' + k));
if (usedMicro.length < 8) bad('只用到 ' + usedMicro.length + ' 个微交互原语，要求 ≥ 8');

head('[c] MP.motion 动效原语与音效');
const MOTION = ['iris', 'develop', 'stagger', 'countUp', 'reveal', 'spring'];
const usedMotion = MOTION.filter((k) => new RegExp('M\\.' + k + '\\(').test(js));
usedMotion.forEach((k) => ok('MP.motion.' + k));
if (!/M\.reduced/.test(js)) bad('未处理 MP.motion.reduced'); else ok('MP.motion.reduced 已处理');
if (!/MP\.sfx\.toggle\(/.test(js)) bad('未接入 MP.sfx.toggle()'); else ok('音效开关调用 MP.sfx.toggle()');

head('[c] 规则引擎五类 + 人机交互三类');
for (const k of ['fixed', 'increment', 'once', 'conditional', 'random']) {
  if (js.includes("'" + k + "'")) ok('规则种类覆盖：' + k);
  else bad('未覆盖规则种类：' + k);
}
for (const k of ['human-confirm', 'captcha', 'manual-gate']) {
  if (js.includes(k)) ok('人机交互种类覆盖：' + k); else bad('未覆盖人机交互：' + k);
}

/* ------------------------------------------- d) 本版签名与响应式自检 ----- */
head('[d] 本版签名：竖排刻度 / 解密扫描线 / 密级标签');
const SIG = [
  [/rail__bar/, css, '刻度尺琥珀选中条（.rail__bar）'],
  [/@property --dcy/, css, '解密前沿用 @property 注册后可连续补间'],
  [/dcyScan/, css, '解密扫描亮线关键帧（2px 暖杏金自上而下）'],
  [/mask-image: linear-gradient\(180deg,\s*\n?\s*transparent 0%/, css, 'CSS mask 解密前沿'],
  [/sec-lv/, html, '权限 / 密级标签（PUBLIC / RESTRICTED / TOP SECRET）'],
  [/data-lv="secret"/, html, 'TOP SECRET 密级实例'],
  [/ftIdx/, html, '底部「当前分类 · 索引 / 总计」'],
  [/--d-roll: 460ms/, css, '编号滚动 460ms'],
  [/--d-tab: 150ms/, css, '页签内容 150ms'],
  [/--d-ink: 180ms/, css, '页签下划线 180ms'],
  [/--d-detail: 180ms/, css, '详情进出 180ms'],
  [/--d-modal-in: 300ms/, css, '弹窗进入 300ms'],
  [/--d-modal-out: 200ms/, css, '弹窗退出 200ms']
];
for (const [re, src, label] of SIG) {
  if (re.test(src)) ok(label); else bad('缺失签名元素：' + label);
}

head('[d] 响应式四档媒体查询');
const MQ = [
  [/@media \(min-width: 1440px\)/, '1440 档'],
  [/@media \(max-width: 1280px\)/, '1280 档'],
  [/@media \(max-width: 1024px\)/, '1024 档'],
  [/@media \(max-width: 768px\)/, '768 档'],
  [/@media \(max-width: 400px\)/, '375 档']
];
for (const [re, label] of MQ) {
  if (re.test(css)) ok(label + ' 媒体查询存在'); else bad(label + ' 媒体查询缺失');
}
if (/overflow-x: hidden/.test(css) && /overflow-x: auto/.test(css)) ok('页面 overflow-x hidden + 宽内容在容器内 auto 滚动');
else bad('缺少横向溢出的封装策略');
if (/prefers-reduced-motion: reduce/.test(css)) ok('prefers-reduced-motion 生效（CSS）');
else bad('缺少 prefers-reduced-motion 处理');

/* ---------------------------------------------------------------- 结果 --- */
head('结果');
if (fail) { console.log('  \u2717 自检未通过，失败 ' + fail + ' 项'); process.exit(1); }
console.log('  \u2713 全部自检通过（' + staticIds.length + ' 个静态 id / 6 个界面 / 6 个刻度导航项 / ' +
  usedMicro.length + ' 个微交互原语 / ' + btnKinds + ' 类 MP.btn 用法）');

/* ============================================================================
 * mock-platform / _verify/oracle.mjs
 * 三版前台的验收 oracle：在人来逐页看之前，先自动判掉「缺项 / 断链 / 需要联网 / 语法错」。
 * 思路来自 onetake（feitangyuan/onetake）的 scripts/verify_promo.py——
 * 用可执行的判据替代「看起来还行」。
 *
 * 用法（在 mock-platform 目录下）：
 *   node _verify/oracle.mjs               # 检查全部变体
 *   node _verify/oracle.mjs v1-ops-console
 * ==========================================================================*/
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SCREENS = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];

// 需求逐条落点的「证据关键词」：每个都必须能在该变体的 index.html + app.js + app.css 里找到
const FEATURES = [
  ['S1 注册本机 IP/端口', /registerPort/],
  ['S1 生成证书文件', /generateCert|generateCert\(|cert/i],
  ['S1 挂载多种平台能力', /attachCap|detachCap/],
  ['S1 启动 mock 服务', /startService/],
  ['S2 审计日志', /logsFiltered|triggerApi|logs\b/],
  ['S2 定制延迟', /delayMs/],
  ['S2 定制 HTTP status', /status\s*[:=]|updateApi/],
  ['S2 面向对象字段定制', /addField|updateField/],
  ['S2 自增规则', /increment/],
  ['S2 单次生效规则', /once/],
  ['S2 条件规则', /conditional/],
  ['S2 插入人机交互', /addInteraction/],
  ['S2 人工放行/拒绝', /resolveInteraction/],
  ['S3 网元属性/架构/类型', /updateNE|addNE/],
  ['S3 版本与软件名', /softName|version/],
  ['S3 升级流程步骤', /addUpgradeStep|moveStep|removeStep/],
  ['S3 步骤中的人机交互', /kind:\s*'human'|human-confirm/],
  ['S3 网元成组', /addGroup|assignGroup/],
  ['S3 复制网元', /copyNE/],
  ['S3 参数校验', /addValidation|runValidation/],
  ['S4 受管网元与组', /omp|受管网元/],
  ['S4 创建账号', /createAccount/],
  ['S4 一体化升级任务', /createTask/],
  ['S4 关联站点', /site/],
  ['S5 软件包管理', /addPackage|validatePackage|removePackage/],
  ['S6 CPU 数量', /setCPU/],
  ['S6 主副站点', /setSite/],
  ['S6 升级流程详情', /advanceVlpFlow|resetVlpFlow/],
  ['S6 平台版本', /setVlpVersion/],
  ['S6 软件包校验流程', /runVlpCheck/],
];

const MOTION = [
  ['动效：光圈开幕 iris', /\.iris\(/],
  ['动效：显影 develop', /\.develop\(/],
  ['动效：数字滚动 countUp', /\.countUp\(/],
  ['动效：交错入场 stagger', /\.stagger\(/],
  ['动效：连续过渡 carry 或 iris', /\.carry\(|\.iris\(/],
  ['动效：遵守 reduced-motion', /reduced|prefers-reduced-motion/],
];

const MICRO_MIN = 8;

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
async function read(p) { try { return await readFile(p, 'utf8'); } catch { return ''; } }

function syntaxOk(file) {
  try { execFileSync('node', ['--check', file], { stdio: 'pipe' }); return true; }
  catch { return false; }
}

const results = [];
const only = process.argv[2];
const dirs = (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^v\d/.test(d.name))
  .map((d) => d.name)
  .filter((d) => !only || d === only)
  .sort();

for (const dir of dirs) {
  const base = join(root, dir);
  const html = await read(join(base, 'index.html'));
  const css = await read(join(base, 'app.css'));
  const doc = await read(join(base, 'README.md'));
  // 视图层可能拆成多个脚本（V6 就是 app.js + instruments.js + instruments2.js），
  // 判据必须读**该变体下所有 .js**，否则会误判「功能缺项 / 原语不足」。
  const jsFiles = (await readdir(base, { withFileTypes: true }))
    .filter((f) => f.isFile() && f.name.endsWith('.js') && !f.name.startsWith('_'))
    .map((f) => f.name).sort();
  const js = (await Promise.all(jsFiles.map((f) => read(join(base, f))))).join('\n');
  const blob = [html, js, css].join('\n');
  const problems = [];
  const notes = [];

  if (!html) problems.push('缺少 index.html');
  if (!js) problems.push('缺少 app.js');
  if (!css) problems.push('缺少 app.css');
  if (!doc) problems.push('缺少 README.md');
  for (const f of jsFiles) {
    if (!syntaxOk(join(base, f))) problems.push('语法检查未通过：' + f);
  }

  // 1) 六个界面
  for (const s of SCREENS) {
    if (!new RegExp('data-screen="' + s + '"').test(html)) problems.push('缺少界面 data-screen="' + s + '"');
  }
  // 2) 共享层脚本
  for (const f of ['domain.js', 'motion.js', 'micro.js']) {
    if (html.indexOf('../_shared/' + f) < 0) problems.push('未引入 _shared/' + f);
  }
  // 3) 功能逐条
  const missingFeatures = FEATURES.filter(([, re]) => !re.test(blob)).map(([n]) => n);
  missingFeatures.forEach((n) => problems.push('功能缺项：' + n));
  // 4) 微交互：至少 8 个不同原语（在 app.js 里被真正调用）
  const prims = ['holdConfirm', 'velocitySwitch', 'gauge', 'statusMark', 'scrub', 'toast',
    'rippleLoader', 'latticeLoader', 'segmented', 'fuseButton', 'magnetic', 'spotlight']
    .filter((p) => new RegExp('\\b' + p + '\\s*\\(').test(js));
  if (prims.length < MICRO_MIN) problems.push('微交互原语不足：' + prims.length + ' < ' + MICRO_MIN);
  // 5) 动效
  for (const [name, re] of MOTION) {
    if (name.indexOf('stagger') >= 0) {
      // 交错入场的实现可以多样（有的变体用列间异步波浪代替 stagger），只作提醒
      if (!re.test(blob) && !/wave|delay|--d-|transition-delay/.test(blob)) notes.push('未直接使用 MP.motion.stagger（若用其它交错实现请在 README 说明）');
      continue;
    }
    if (!re.test(blob)) problems.push(name + ' 未见使用');
  }
  // 5b) 按钮动效（技能预设）：引入 button-fx.js 的变体必须真的用 MP.btn（允许别名，如 var B = MP.btn）
  if (/button-fx\.js/.test(html)) {
    if (!/\.install\s*\(\s*\)/.test(js)) problems.push('按钮动效：未调用 install()');
    if (!/\.enhance\s*\(/.test(js)) problems.push('按钮动效：未调用 enhance()');
    if (!/\.loading\s*\(/.test(js)) problems.push('按钮动效：异步操作未使用 loading()');
    const fxTiers = (js + html).match(/data-fx="(subtle|standard|magnetic|transport)"/g) || [];
    const uniq = new Set(fxTiers.map((s) => s.slice(9, -1)));
    // 没写显式 data-fx 也可以：主行动类（btn--primary）会被自动识别为 standard 档
    if (uniq.size < 2 && !/btn--primary|btn-primary|\.primary/.test(blob)) {
      notes.push('按钮动效分级只有 ' + [...uniq].join('/') + '（建议 subtle/standard/magnetic 都用上）');
    }
  }
  // 6) 离线：不得有外部 http(s) 资源
  const externals = (html.match(/(?:src|href)="(https?:\/\/[^"]+)"/g) || []).filter((s) => !/schema\.org|w3\.org/.test(s));
  if (externals.length) problems.push('引用了外部资源（破坏离线）：' + externals.slice(0, 3).join(' '));
  // 7) 细节
  if (!/aria-/.test(blob)) problems.push('未见 aria-* 无障碍标注');
  if (!/prefers-reduced-motion/.test(blob)) problems.push('CSS 未见 prefers-reduced-motion 适配');
  // 排版箭头与几何符号（原作正文就用它们，不是 emoji 图标）：↗ ← → ↑ ↓ × ✕ ↔ ✓ ● ○ ■ ▸ ◂ ＋
  const TYPO = /[\u2190-\u21FF\u00D7\u2713\u2715\u25CF\u25CB\u25A0\u25B8\u25C2\uFF0B]/g;
  if (/\p{Extended_Pictographic}/u.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(TYPO, ''))) {
    notes.push('HTML 里出现了 emoji 字符（规范要求用 SVG 图标，请人工确认是否为图标）');
  }

  results.push({ variant: dir, ok: problems.length === 0, problems, notes, micro: prims.length });
}

// 输出
let failed = 0;
for (const r of results) {
  console.log('\n' + (r.ok ? '✅ ' : '❌ ') + r.variant + '  （微交互原语 ' + r.micro + ' 个）');
  if (r.problems.length) { failed++; r.problems.forEach((p) => console.log('   - ' + p)); }
  r.notes.forEach((n) => console.log('   ⚠ ' + n));
}
console.log('\n—— 汇总：' + results.length + ' 个变体，' + (results.length - failed) + ' 通过 / ' + failed + ' 未通过');
process.exit(failed ? 1 : 0);

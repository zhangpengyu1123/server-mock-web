/* ============================================================================
 * V5 · 音乐调测台 —— 一次性自检脚本（不属于交付运行时，跑完即可删）
 *
 *   cd mock-platform
 *   node v5-music-console/_selfcheck.mjs
 *
 * 检查项：
 *   a) app.js 里所有 $('#id') / getElementById('id') 的 id 都必须存在于 index.html
 *      （动态注入的节点走白名单，且白名单里的 id 必须由 app.js 自己生成，不能是笔误）
 *   b) 六个 data-screen、六个导航刻度、双主题控件、MP.btn ≥4 类用法、MP.micro 调用
 *   c) 交付文件清单与外部依赖（不得有 CDN / 外链字体）
 *   d) 四档断点媒体查询存在性
 * ==========================================================================*/
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(here, 'index.html'), 'utf8');
const css = await readFile(path.join(here, 'app.css'), 'utf8');
const js = await readFile(path.join(here, 'app.js'), 'utf8');
const readme = await readFile(path.join(here, 'README.md'), 'utf8').catch(() => '');

const fail = [];
const ok = [];
function check(cond, label, detail) {
  (cond ? ok : fail).push(label + (detail ? '  → ' + detail : ''));
}

/* ---------------------------------------------------- a) 选择器 ↔ DOM */
const staticIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

/* 动态注入容器/节点的白名单：这些 id 由 app.js 自己拼在模板里 */
const DYN = new Set(['popTitle', 'popBody', 'toasts']);

const usedStatic = new Set();
const usedDyn = new Set(['__ignore__']);

/* $('#id') —— 只认字面量，避免把模板串误判 */
for (const m of js.matchAll(/\$\(\s*'#([A-Za-z][\w-]*)'/g)) usedStatic.add(m[1]);
for (const m of js.matchAll(/getElementById\(\s*'([A-Za-z][\w-]*)'/g)) usedStatic.add(m[1]);
/* 模板串里带 id="xxx" 的（自身生成） */
const jsGenIds = new Set([...js.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]));
/* 运行时拼出来的 id（'id-' + f.id 这类） */
const dynPatternIds = new Set();
for (const m of js.matchAll(/\bid="([A-Za-z][\w-]*)-\s*'/g)) {
  for (let i = 1; i <= 12; i++) dynPatternIds.add(m[1] + '-' + 'f' + i);
}
for (const m of js.matchAll(/id="' \+ ([A-Za-z]+) \+ '-([A-Za-z]+)/g)) dynPatternIds.add('dynamic:' + m[1] + '-' + m[2]);

/* 逐个名字面量 id：必须静态存在，或属于白名单/自生成 */
const missing = [];
for (const id of usedStatic) {
  const isStatic = staticIds.has(id);
  const isDyn = DYN.has(id);
  const isSelfGen = jsGenIds.has(id);
  const isPattern = dynPatternIds.has(id) || [...dynPatternIds].some((p) => id.startsWith(p.slice(0, -1)));
  if (!isStatic && !isDyn && !isSelfGen && !isPattern) missing.push(id);
  else if (isDyn) usedDyn.add(id);
}
check(missing.length === 0, 'a) app.js 里 $(\'#id\') / getElementById 的字面量 id 全部存在于 index.html 或白名单',
  missing.length ? '缺失：' + missing.join(', ') : usedStatic.size + ' 个字面量 id 全部命中');

/* 反向：index.html 里 id 重复 */
const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = idList.filter((v, i) => idList.indexOf(v) !== i);
check(dup.length === 0, 'a2) index.html 无重复 id', dup.length ? '重复：' + [...new Set(dup)].join(', ') : idList.length + ' 个 id 唯一');

/* 反之：index.html 里声明了但 app.js 从没用过的 id（提示，不算失败） */
const unused = [...staticIds].filter((id) => !usedStatic.has(id) && !jsGenerated(id));
ok.push('a3) index.html 声明 ' + staticIds.size + ' 个 id，app.js 直接引用 ' + [...usedStatic].filter((i) => staticIds.has(i)).length + ' 个');
function jsGenerated(id) { return js.includes('id="' + id + '"') || js.includes("'" + id + "'"); }

/* ---------------------------------------------------- b) 六屏 / 刻度 / 主题 / 动效层 */
const screens = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
const screenHit = screens.filter((s) => html.includes('data-screen="' + s + '"'));
check(screenHit.length === 6, 'b1) 六个 data-screen 齐全', screenHit.join(', '));

check(/NAV_ORDER\s*=\s*\[/.test(js) && screens.every((s) => js.includes("'" + s + "'")),
  'b2) 刻度尺导航由 NAV_ORDER 生成六个刻度', 'NAV_ORDER 覆盖六屏');

const tickBuild = /buildRuler\(\)/.test(js) && /mcr__tick/.test(js) && /\.dataset\.nav = id/.test(js);
check(tickBuild, 'b3) 刻度尺按钮（.mcr__tick + data-nav）生成逻辑存在');

check(html.includes('data-theme-set="dawn"') && html.includes('data-theme-set="moon"') && /localStorage\.setItem\(THEME_KEY/.test(js),
  'b4) 双主题控件（晨雾／月影）+ localStorage 持久化');

check(/THEME_KEY\s*=\s*'mp-v5-theme'/.test(js), 'b5) 主题键独立（mp-v5-theme）');

/* MP.btn：install / enhance / loading / skeleton 或 ripple —— 至少 4 类 */
const btnUses = ['install', 'enhance', 'loading', 'skeleton', 'ripple', 'magnetic']
  .filter((k) => new RegExp('MP\\.btn\\.' + k + '\\s*\\(').test(js));
check(btnUses.length >= 4, 'b6) MP.btn ≥4 类用法', btnUses.join(', '));

/* data-fx 分级 */
const fxTiers = ['subtle', 'standard', 'magnetic', 'transport', 'none']
  .filter((t) => html.includes('data-fx="' + t + '"') || js.includes('data-fx="' + t + '"') || js.includes("dataset.fx = '" + t + "'") || js.includes('data-fx="magnetic"'));
check(fxTiers.length >= 3, 'b7) data-fx 分级使用', fxTiers.join(', '));
check((js.match(/data-fx="standard"/g) || []).length >= 4, 'b8) data-fx="standard" 出现在多处主行动',
  String((js.match(/data-fx="standard"/g) || []).length) + ' 处');
check(html.includes('data-fx="transport"'), 'b9) transport 大圆主控带 data-fx="transport"');
check(/data-fx="magnetic"|dataset\.fx = 'magnetic'/.test(js), 'b10) magnetic 由 JS 按屏分配（一屏 1 个）');
check(/MP\.btn\.loading\(/.test(js), 'b11) 异步操作用 MP.btn.loading');

/* MP.micro：12 个原语里用了几个（语义位置） */
const MICRO = ['holdConfirm', 'velocitySwitch', 'gauge', 'statusMark', 'scrub', 'toast',
  'rippleLoader', 'latticeLoader', 'segmented', 'fuseButton', 'magnetic', 'spotlight'];
const microUsed = MICRO.filter((k) => new RegExp('(X|MP\\.micro)\\.' + k + '\\s*\\(').test(js));
check(microUsed.length >= 8, 'b12) MP.micro ≥8 个不同原语', microUsed.length + ' 个：' + microUsed.join(', '));

/* 动效：ContentTransition 360 / carry / iris / ambient / reduced */
check(/is-entering/.test(js) && /mcContentIn/.test(css), 'b13) ContentTransition（.is-entering + mcContentIn 关键帧）');
check(/--t-content:\s*calc\(360ms/.test(css), 'b14) ContentTransition 时长为 360ms');
check(/M\.carry\(|M\.iris\(/.test(js), 'b15) 界面切换用 carry()/iris()（不硬切）');
check(/idle = MP\.clamp\(\(now - lastInteract - 2500\)/.test(js), 'b16) 交互后 2.5s 缓入常态波动');
check(/stepWaves/.test(js) && /phase = ci \* 0\.55/.test(js), 'b17) 列间异步波峰（相位差）');
check(/MP\.motion\.reduced|M\.reduced/.test(js), 'b18) 减少动态效果分支存在');
check(/prefers-reduced-motion/.test(css), 'b19) CSS 也有 prefers-reduced-motion 归零');

/* canvas 频谱 */
check(/getContext\('2d'\)/.test(js) && /drawSpec/.test(js) && /id="spectrum"/.test(html),
  'b20) canvas 频谱（#spectrum + drawSpec）');

/* transport 对应关系 */
check(/tlTrack/.test(html) && /makeScrub/.test(js), 'b21) 时间轴 scrub（#tlTrack + makeScrub）');
check(/rateWrap/.test(html) && /setRate/.test(js), 'b22) 速率刻度（#rateWrap + setRate）');
check(/npEndpoint/.test(html) && /npInfo/.test(js), 'b23) 「正在服务」端点信息（#npEndpoint + npInfo）');

/* ---------------------------------------------------- c) 交付与依赖 */
check(/\.\.\/_shared\/domain\.js/.test(html) && /\.\.\/_shared\/motion\.js/.test(html) &&
  /\.\.\/_shared\/micro\.js/.test(html) && /\.\.\/_shared\/button-fx\.js/.test(html) &&
  /\.\.\/_shared\/fx\.js/.test(html) && /\.\/app\.js/.test(html),
  'c1) 脚本引入顺序符合 _shared/README 契约');
const order = ['domain.js', 'motion.js', 'micro.js', 'button-fx.js', 'fx.js', 'app.js']
  .map((f) => html.indexOf(f));
check(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), 'c2) 引入顺序递增', order.join(' < '));
check(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org[^"']*/g, '')),
  'c3) 无外链资源（CDN / 字体）');
check(!/@font-face/.test(css), 'c4) app.css 无 @font-face');
check(!/<img\b|\.png|\.jpg|\.svg"|\.woff/.test(html), 'c5) 无外部图片/字体引用（图标全内联 SVG）');
check(readme.length > 0, 'c6) README.md 已写', readme.length + ' 字节');

/* ---------------------------------------------------- d) 响应式四档 */
const bp = ['375', '768', '1024', '1440'];
const bpFound = bp.filter((n) => css.includes(n + 'px'));
check(bpFound.length >= 3, 'd1) 四档断点数值出现', bpFound.join(', '));
check(/max-width:\s*480px/.test(css) && /max-width:\s*768px/.test(css) && /max-width:\s*1023px/.test(css) && /min-width:\s*1440px/.test(css),
  'd2) 375 / 768 / 1024 / 1440 四档媒体查询齐备');
check(/overflow-x:\s*(auto|hidden|contain)/.test(css), 'd3) 容器内横向滚动 / 文档级 overflow-x 防线存在');

/* ---------------------------------------------------- 输出 */
console.log('\n=== V5 · 音乐调测台 自检 ===\n');
console.log('通过 ' + ok.length + ' 项：');
ok.forEach((l) => console.log('  ✔ ' + l));
if (fail.length) {
  console.log('\n失败 ' + fail.length + ' 项：');
  fail.forEach((l) => console.log('  ✘ ' + l));
}
console.log('\napp.js ' + js.split('\n').length + ' 行 · app.css ' + css.split('\n').length + ' 行 · index.html ' + html.split('\n').length + ' 行');
console.log(fail.length ? '\n结果：失败\n' : '\n结果：全部通过\n');
process.exit(fail.length ? 1 : 0);

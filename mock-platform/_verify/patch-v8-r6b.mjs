/* V8-R6b：把「系统」做成真正的设置页（外观 / 布局 / 声音 / 维护 / 关于）+ 偏好持久化 */
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'v8-blackbox-terminal/';
const rd = (f) => readFileSync(D + f, 'utf8');
const wr = (f, s) => writeFileSync(D + f, s, 'utf8');
const log = [];

/* ---------------- 1) CSS：密度 / 动效 / 设置行件 ---------------- */
let css = rd('app.css');
css = css.split('  --ink-3: #4f4e44;').join('  --ink-3: #4b4a41;');
if (!css.includes('V8-R6b')) {
  css = css.trimEnd() + `

/* ============================================================================
 * V8-R6b：系统设置 —— 密度 / 动效强度 / 设置行
 * ==========================================================================*/
html[data-density="compact"] { --row-h: 32px; --row-gap: 14px; --px: 44px; --cmd-h: 54px; }
html[data-density="loose"]   { --row-h: 46px; --row-gap: 30px; --px: 68px; --cmd-h: 70px; }
html[data-density="compact"] .pnl__bd { padding: 9px 12px; }
html[data-density="compact"] .row__mt { font-size: 10px; }
html[data-density="loose"] .runhero { padding: 18px 20px 16px; }

html[data-motion="lite"] { --d1: 80ms; --d2: 130ms; --d3: 190ms; }
html[data-motion="off"] *, html[data-motion="off"] *::before, html[data-motion="off"] *::after {
  animation: none !important; transition: none !important;
}

/* 设置行：左标签 + 右控件 */
.setlist { display: flex; flex-direction: column; }
.setrow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center;
  padding: 11px 0; border-bottom: 1px solid rgba(var(--ink-rgb), .14);
}
.setrow:last-child { border-bottom: 0; }
.setrow__t { font-size: 13.5px; letter-spacing: .04em; }
.setrow__d { margin-top: 2px; font-size: 11px; color: var(--ink-3); line-height: 1.5; }
.setrow__c { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.setseg { display: inline-flex; border: 1px solid rgba(var(--ink-rgb), .28); }
.setseg button {
  min-height: 28px; padding: 0 10px; background: var(--paper-3); color: var(--ink);
  border: 0; border-right: 1px solid rgba(var(--ink-rgb), .2); cursor: pointer;
  font-size: 12px; letter-spacing: .04em; font-family: inherit;
}
.setseg button:last-child { border-right: 0; }
.setseg button:hover { background: var(--block-hi); }
.setseg button.is-on { background: var(--charcoal); color: var(--on-dark); }
.keymap { display: grid; grid-template-columns: 106px minmax(0, 1fr); gap: 6px 14px; font-size: 12.5px; }
.keymap kbd {
  font-family: var(--mono); font-size: 11px; padding: 1px 6px; border: 1px solid rgba(var(--ink-rgb), .3);
  background: var(--paper-3); color: var(--ink); justify-self: start;
}
.swatchtable { display: flex; flex-direction: column; gap: 6px; }
.swatchtable div { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.swatchtable i { width: 14px; height: 14px; border: 1px solid rgba(var(--ink-rgb), .3); }
`;
  log.push('✓ CSS 密度/动效/设置行');
}
wr('app.css', css);

/* ---------------- 2) app.js：偏好系统 ---------------- */
let app = rd('app.js');
if (!app.includes('function applyPrefs')) {
  app = app.replace(`  var THEMES = ['nier', 'white', 'codex'];`,
`  var THEMES = ['nier', 'white', 'codex'];
  var PREF_DEF = { density: 'normal', motion: 'full', sideOnBoot: 'expanded', startScreen: 'run' };

  function loadPrefs() {
    try {
      var raw = localStorage.getItem('v8.prefs');
      if (raw) {
        var o = JSON.parse(raw) || {};
        Object.keys(PREF_DEF).forEach(function (k) { if (o[k] != null) UI.prefs[k] = o[k]; });
      }
    } catch (e) {}
  }
  function savePrefs() { try { localStorage.setItem('v8.prefs', JSON.stringify(UI.prefs)); } catch (e) {} }
  function applyPrefs() {
    var h = document.documentElement;
    h.setAttribute('data-density', UI.prefs.density || 'normal');
    h.setAttribute('data-motion', UI.prefs.motion || 'full');
    Array.prototype.forEach.call(document.querySelectorAll('[data-pref]'), function (b) {
      if (b.getAttribute('data-pref') !== Object.keys({})[0] && false) return;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pref-group]'), function (b) {
      var g = b.getAttribute('data-pref-group');
      var on = String(UI.prefs[g]) === String(b.getAttribute('data-pref-v'));
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function setPref(k, v) {
    if (!(k in PREF_DEF)) return;
    UI.prefs[k] = v;
    savePrefs(); applyPrefs();
    if (k === 'sideOnBoot') applySidePreset(v);
  }
  function applySidePreset(v) {
    UI.collapse.l = v === 'l' || v === 'both';
    UI.collapse.r = v === 'r' || v === 'both';
    applyLayout();
  }
  function resetPrefs() {
    UI.prefs = JSON.parse(JSON.stringify(PREF_DEF));
    savePrefs(); applyPrefs();
    try { localStorage.removeItem('v8.theme'); } catch (e) {}
    applyTheme('nier');
    applySidePreset(UI.prefs.sideOnBoot);
  }`, 'app.js 偏好系统');
  log.push('✓ app.js 偏好系统');
}
app = app.replace(`    mode: 'run',
    theme: 'nier',`, `    mode: 'run',
    theme: 'nier',
    prefs: { density: 'normal', motion: 'full', sideOnBoot: 'expanded', startScreen: 'run' },`, 'app.js UI.prefs');

app = app.replace(`  loadLayout(); loadTheme();`, `  loadLayout(); loadTheme(); loadPrefs(); applyPrefs();`, 'app.js 启动加载偏好');
app = app.replace(`    setTheme: setTheme, cycleTheme: cycleTheme, themes: THEMES,`,
`    setTheme: setTheme, cycleTheme: cycleTheme, themes: THEMES,
    prefs: function () { return UI.prefs; }, setPref: setPref, applyPrefs: applyPrefs, resetPrefs: resetPrefs,
    applySidePreset: applySidePreset,`, 'app.js 暴露偏好 API');
wr('app.js', app);

/* 启动时按偏好设置侧栏与起始屏（在 screens.js 的 boot 里做，这里改 boot 尾部） */
let scr = rd('screens.js');
scr = scr.replace(`    V.state.mode = 'run'; V.state.screen = 'run';`,
`    if (V.applySidePreset) V.applySidePreset(V.prefs().sideOnBoot || 'expanded');
    var _first = V.prefs().startScreen || 'run';
    V.state.mode = 'run'; V.state.screen = 'run';`, 'boot 应用侧栏偏好');

/* ---------------- 3) 新 SYS 设置页 ---------------- */
const start = scr.indexOf('  var SYS = {');
const end = scr.indexOf('  V.auditPanel = function');
if (start < 0 || end < 0) { console.log('✗ SYS 块定位失败'); }
const SYS_NEW = `  var SYS = {
    group: 'both', selKey: 'sys', tag: '设置', tagEn: 'SETTINGS', empty: '—',
    title: '系 统', sub: '- 设置与维护',
    stats: function () {
      return [
        { k: 'BUILD', v: '8.0' },
        { k: 'THEME', v: ({ nier: 'NIER', white: 'SWISS', codex: 'CODEX' })[V.state.theme] || 'NIER' },
        { k: 'DENSITY', v: ({ compact: '紧凑', normal: '标准', loose: '宽松' })[V.prefs().density] || '标准' }
      ];
    },
    list: function () {
      return [
        { id: 'display', label: '外观', meta: '配色 / 密度 / 动效 / 质感', count: ({ nier: '暖纸', white: '纯白', codex: '蓝黑' })[V.state.theme] || '暖纸' },
        { id: 'layout', label: '布局', meta: '启动时侧栏 / 起始屏', count: ({ expanded: '展开', l: '折左', r: '折右', both: '双折' })[V.prefs().sideOnBoot] || '展开' },
        { id: 'sound', label: '声音', meta: '合成音效', count: V.state.snd ? 'ON' : 'OFF' },
        { id: 'boot', label: '维护', meta: '重放自检 / 导出审计 / 重置', count: '▶' },
        { id: 'about', label: '关于', meta: '版本 / 键位 / 色板', count: '8.0' }
      ];
    },
    pick: function (id) { V.state.sub.sys = id; V.state.sel.sys = id; },
    enter: function (id) { if (!id) return false; V.state.sub.sys = id; V.state.sel.sys = id; return true; },
    cmd: function () { return '选中项按 Enter 进入；开关与分段直接点击生效，偏好会记住。'; },
    main: function () {
      var s = V.state.sub.sys || 'display';
      var P = V.prefs();

      if (s === 'display') {
        return pnl('配色', 'PALETTE', '<div class="themegrid">' + [
          { v: 'nier', b: '暖纸 · 尼尔', i: 'PAPER / NIER', sw: ['#c8c3ac', '#656256', '#3e3c34'] },
          { v: 'white', b: '纯白 · 瑞士', i: 'WHITE / SWISS', sw: ['#fafafa', '#18181b', '#0b63f6'] },
          { v: 'codex', b: '蓝黑 · 专业', i: 'NAVY / CODEX', sw: ['#0d1117', '#21262d', '#1158c7'] }
        ].map(function (t) {
          return '<button class="themecard' + (V.state.theme === t.v ? ' is-on' : '') + '" type="button" data-act="setTheme" data-v="' + t.v + '" aria-pressed="' + (V.state.theme === t.v ? 'true' : 'false') + '">' +
            '<b>' + t.b + '</b><i>' + t.i + '</i><span class="sw">' + t.sw.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</span></button>';
        }).join('') + '</div>', { right: '<span class="pnl__note mono">' + V.state.theme.toUpperCase() + '</span>' })
        + pnl('密度', 'DENSITY', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">列表与留白</div><div class="setrow__d">紧凑更适合一屏看更多条；宽松适合演示。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['compact', '紧凑'], ['normal', '标准'], ['loose', '宽松']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="density" data-v="' + x[0] + '" data-pref-group="density" data-pref-v="' + x[0] + '" class="' + (P.density === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">动效强度</div><div class="setrow__d">精简会缩短过渡；关闭后所有过渡与入场动画归零（等于强制 reduced-motion）。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['full', '完整'], ['lite', '精简'], ['off', '关闭']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="motion" data-v="' + x[0] + '" data-pref-group="motion" data-pref-v="' + x[0] + '" class="' + (P.motion === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '</div>')
        + pnl('质感', 'TEXTURE', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">纸面颗粒</div><div class="setrow__d">一层 SVG 湍流噪声，模拟纸的粗粝。</div></div><div class="setrow__c"><span id="swGrain"></span></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">扫描线</div><div class="setrow__d">启动自检屏上的水平细线。</div></div><div class="setrow__c"><span id="swScan"></span></div></div>' +
          '</div>');
      }

      if (s === 'layout') {
        return pnl('启动布局', 'STARTUP', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">启动时的侧栏</div><div class="setrow__d">宽屏下生效；窄屏本来就没有折叠。也可以随时按 <kbd>[</kbd> <kbd>]</kbd> 临时切换。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['expanded', '都展开'], ['l', '折左'], ['r', '折右'], ['both', '都折叠']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="sideOnBoot" data-v="' + x[0] + '" data-pref-group="sideOnBoot" data-pref-v="' + x[0] + '" class="' + (P.sideOnBoot === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">启动落在哪一屏</div><div class="setrow__d">运维视角首选「运行台」；排查期可直接落到「审计」。</div></div>' +
          '<div class="setrow__c"><div class="setseg">' + [['run', '运行台'], ['audit', '审计'], ['gate', '闸门']].map(function (x) {
            return '<button type="button" data-act="setPref" data-k="startScreen" data-v="' + x[0] + '" data-pref-group="startScreen" data-pref-v="' + x[0] + '" class="' + (P.startScreen === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
          }).join('') + '</div></div></div>' +
          '</div><div class="blkbar">' + blk('立即套用侧栏', 'applySide', '', 'blk--sm') + blk('重置全部偏好', 'resetPrefs', '', 'blk--ghost blk--sm') + '</div>');
      }

      if (s === 'sound') {
        return pnl('声音', 'SOUND', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">操作音效</div><div class="setrow__d">切换、确认、警告各有独立合成音，不加载任何音频文件。</div></div><div class="setrow__c"><span id="swSnd"></span></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">试听</div><div class="setrow__d">三档：步进 / 确认 / 警告。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm" type="button" data-act="sfxStep">步进</button>' +
          '<button class="blk blk--sm" type="button" data-act="sfxOk">确认</button>' +
          '<button class="blk blk--sm" type="button" data-act="sfxWarn">警告</button></div></div>' +
          '</div>');
      }

      if (s === 'boot') {
        return pnl('维护', 'MAINTENANCE', '<div class="setlist">' +
          '<div class="setrow"><div><div class="setrow__t">重放启动自检</div><div class="setrow__d">重放进入时那 17 行自检序列（可随时按键跳过）。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm blk--dark" type="button" data-act="replayBoot">重放</button>' +
          '<button class="blk blk--sm" type="button" data-act="skipBoot">跳过</button></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">导出审计 JSON</div><div class="setrow__d">把当前全部审计记录（含报文与命中说明）下载成文件。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm" type="button" data-act="exportAudit">导出 ' + S.logs.length + ' 条</button></div></div>' +
          '<div class="setrow"><div><div class="setrow__t">重置偏好</div><div class="setrow__d">配色、密度、动效、侧栏、起始屏全部回到默认；不动数据。</div></div>' +
          '<div class="setrow__c"><button class="blk blk--sm blk--ghost" type="button" data-act="resetPrefs">重置</button></div></div>' +
          '</div>');
      }

      return pnl('关于', 'ABOUT', '<div class="pnl__bd--2">' +
        kv('界面', 'BLACKBOX TERMINAL 8.0') + kv('视觉语言', '纸面 / 硬边投影 / 打孔线 / 菱形光标') +
        kv('配色', ({ nier: '暖纸 · 尼尔', white: '纯白 · 瑞士', codex: '蓝黑 · 专业' })[V.state.theme] || '—') +
        kv('共享层', '_shared/domain · motion · micro · button-fx') + kv('数据', '前端模拟（种子 + 定时器）') + '</div>')
        + pnl('键位', 'KEYMAP', '<div class="keymap">' +
          '<kbd>W</kbd><span>上一条 / 上一项</span><kbd>S</kbd><span>下一条 / 下一项</span>' +
          '<kbd>Enter</kbd><span>确认（选中项 / 启动）</span><kbd>Esc</kbd><span>返回上一级</span>' +
          '<kbd>1 – 9</kbd><span>切换到当前模式的第 n 个页签</span><kbd>[ ]</kbd><span>折叠 / 展开左右侧栏</span>' +
          '<kbd>T</kbd><span>轮换三套配色</span></div>')
        + pnl('色板', 'SWATCHES', '<div class="swatchtable">' + [
          ['画布', V.state.theme === 'codex' ? '#0d1117' : V.state.theme === 'white' ? '#fafafa' : '#c8c3ac'],
          ['面板', V.state.theme === 'codex' ? '#161b22' : V.state.theme === 'white' ? '#ffffff' : '#ccc7af'],
          ['次级面', V.state.theme === 'codex' ? '#1c2128' : V.state.theme === 'white' ? '#f4f4f5' : '#d7d2b9'],
          ['主行动', V.state.theme === 'codex' ? '#1158c7' : V.state.theme === 'white' ? '#18181b' : '#3e3c34'],
          ['强调', V.state.theme === 'codex' ? '#58a6ff' : V.state.theme === 'white' ? '#0b63f6' : '#8c3a2e']
        ].map(function (x) { return '<div><i style="background:' + x[1] + '"></i>' + x[0] + ' <span class="mono" style="color:var(--ink-3);font-size:10.5px">' + x[1] + '</span></div>'; }).join('') + '</div>');
    },
    mount: function () {
      var s = V.state.sub.sys;
      function sw(host, on, onChange) { if (host) X.velocitySwitch(host, { checked: on, label: '', onChange: onChange }); }
      if (s === 'display') {
        sw($('#swGrain'), V.state.grain, function (v) { V.setGrain(v); });
        sw($('#swScan'), V.state.scan, function (v) { V.setScan(v); });
      }
      if (s === 'sound') {
        sw($('#swSnd'), V.state.snd, function (v) { V.setSnd(v); V.toast(v ? '音效已开' : '音效已关', '合成音，不加载文件', 'ok'); });
      }
      V.applyPrefs();
    },
    act: {
      setTheme: function (node) { V.setTheme(node.getAttribute('data-v')); V.rerender(); },
      setPref: function (node) {
        var k = node.getAttribute('data-k'), val = node.getAttribute('data-v');
        V.setPref(k, val);
        V.rerender();
        if (k === 'density') V.toast('密度已切换', ({ compact: '紧凑', normal: '标准', loose: '宽松' })[val], 'ok');
        if (k === 'motion') V.toast('动效已切换', ({ full: '完整', lite: '精简', off: '关闭' })[val], 'ok');
      },
      applySide: function () { V.applySidePreset(V.prefs().sideOnBoot); V.toast('侧栏已套用', '按 [ ] 可临时改', 'ok'); },
      resetPrefs: function () { V.resetPrefs(); V.toast('已重置偏好', '配色/密度/动效/侧栏回到默认', 'ok'); },
      sfxStep: function () { if (MP.sfx) MP.sfx.play('step'); },
      sfxOk: function () { if (MP.sfx) MP.sfx.play('confirm'); },
      sfxWarn: function () { if (MP.sfx) MP.sfx.play('warn'); },
      exportAudit: function () {
        var data = { exportedAt: new Date().toISOString(), platform: 'BLACKBOX-8.0', theme: V.state.theme, count: S.logs.length, logs: S.logs };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'audit-' + Date.now() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
        V.toast('已导出审计', S.logs.length + ' 条 · JSON', 'ok');
      },
      replayBoot: function () { V.runBoot(); },
      skipBoot: function () { V.skipBoot(); },
      noop: function () {}
    }
  };

`;
scr = scr.substring(0, start) + SYS_NEW + scr.substring(end);
log.push('✓ SYS 替换为设置页');
wr('screens.js', scr);

console.log(log.join('\n'));

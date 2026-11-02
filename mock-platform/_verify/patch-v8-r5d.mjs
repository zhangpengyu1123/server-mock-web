/* V8-R5d：合并「触发台」进状态块（去掉一整块面板），把实时审计提到首屏 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/screens.js';
let s = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!s.includes(from)) { log.push('✗ ' + tag); return; }
  s = s.split(from).join(to); log.push('✓ ' + tag);
};

/* 1) hero 控件行：服务单元 + 接口 + 触发一次 */
rep(`        '<div class="runhero__ctl">' +
          '<label class="fld"><span class="fld__lb">服务单元<i>UNIT</i></span>' +
          '<select class="inp inp--sel" data-fk="runUnit">' + S.ports.map(function (x) {
            return '<option value="' + h(x.id) + '"' + (x.id === pf.id ? ' selected' : '') + '>' + h(portLabel(x)) + (x.running ? ' · 运行' : ' · 停止') + '</option>';
          }).join('') + '</select></label>' +
          '<span class="runhero__hint">' + (run
            ? '触发器与实时审计在下面；改配置要先停止服务。'
            : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面就绪链去处理。')) + '</span>' +
        '</div>' +`,
`        '<div class="runhero__ctl">' +
          '<label class="fld"><span class="fld__lb">服务单元<i>UNIT</i></span>' +
          '<select class="inp inp--sel" data-fk="runUnit">' + S.ports.map(function (x) {
            return '<option value="' + h(x.id) + '"' + (x.id === pf.id ? ' selected' : '') + '>' + h(portLabel(x)) + (x.running ? ' · 运行' : ' · 停止') + '</option>';
          }).join('') + '</select></label>' +
          '<label class="fld"><span class="fld__lb">接口<i>API</i></span>' +
          '<select class="inp inp--sel" data-fk="runApi"' + (run ? '' : ' disabled') + '>' + apisList.map(function (a) {
            return '<option value="' + h(a.id) + '"' + (curApi && a.id === curApi.id ? ' selected' : '') + '>' + h(a.method + ' ' + a.name) + '</option>';
          }).join('') + '</select></label>' +
          '<button class="blk blk--dark" type="button" data-act="runTrigger"' + (run ? '' : ' disabled') + ' style="min-height:30px;align-self:flex-end">触发一次</button>' +
        '</div>' +
        '<div class="runhero__hint">' + (run
          ? '状态 ' + (curApi ? curApi.status : '—') + ' · 延迟 ' + (curApi ? (curApi.delayMs || 0) + ' ms' : '—') + ' · 命中 ' + (curApi ? f(curApi.hits) : '—') + ' · 改配置要回准备台。'
          : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面就绪链去处理。')) + '</div>' +`,
  'hero 合并接口选择与触发');

/* 2) hero 里要先用 apis/curApi：把它们的定义提到 hero 之前 */
rep(`      var syncNote = 0;
      var hero = '<div class="runhero'`,
`      var apis = S.apis.filter(function (a) { return a.enabled !== false; });
      var curApi = apis.filter(function (a) { return a.id === V.state.sel.api; })[0] || apis[0];
      var apisList = apis;
      var hero = '<div class="runhero'`, 'apis 提前定义');

/* 3) 删掉原触发台面板与旧定义，返回值去掉 trig */
rep(`      var apis = S.apis.filter(function (a) { return a.enabled !== false; });
      var curApi = apis.filter(function (a) { return a.id === V.state.sel.api; })[0] || apis[0];
      var trig = pnl('触发台', 'TRIGGER', (run
        ? '<div class="trigrow"><label class="fld"><span class="fld__lb">接口<i>ENDPOINT</i></span>' +
          '<select class="inp inp--sel" data-fk="runApi">' + apis.map(function (a) {
            return '<option value="' + h(a.id) + '"' + (curApi && a.id === curApi.id ? ' selected' : '') + '>' + h(a.method + ' ' + a.name) + ' — ' + h(a.path) + '</option>';
          }).join('') + '</select></label>' +
          '<button class="blk blk--dark" type="button" data-act="runTrigger" style="min-height:34px">触发一次</button></div>' +
          '<div class="trigmeta"><span>状态 <b>' + (curApi ? curApi.status : '—') + '</b></span><span>延迟 <b>' + (curApi ? (curApi.delayMs || 0) + ' ms' : '—') + '</b></span><span>命中 <b>' + (curApi ? f(curApi.hits) : '—') + '</b></span><span>人机交互 <b>' + (curApi && (curApi.interactions || []).length ? '已插入' : '无') + '</b></span></div>'
        : '<div class="empty">服务停止中：启动后才能触发接口。</div>'), {
        right: '<span class="pnl__note mono">' + (curApi ? h(curApi.method) : '') + '</span>'
      });
`, '', '删除触发台面板');

rep(`      return hero + chain + trig + feedPnl;`, `      return hero + chain + feedPnl;`, '返回值去掉 trig');
rep(`        right: '<button class="blk blk--sm blk--ghost" type="button" data-act="toAudit">全部记录</button>'`,
`        right: '<span class="pnl__note mono">' + (curApi ? h(curApi.method + ' ' + curApi.path) : '') + '</span>' +
          '<button class="blk blk--sm blk--ghost" type="button" data-act="toAudit">全部记录</button>'`, '审计面板头补当前接口');

writeFileSync(P, s, 'utf8');
console.log(log.join('\n'));

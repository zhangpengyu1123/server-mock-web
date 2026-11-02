/* V8-R4b：修细轨宽度（左栏 54px 缩进）+ 快捷条并入状态块 + 去重复按钮 */
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'v8-blackbox-terminal/';
const rd = (f) => readFileSync(D + f, 'utf8');
const wr = (f, s) => writeFileSync(D + f, s, 'utf8');
const log = [];
const rep = (src, from, to, tag) => {
  if (!src.includes(from)) { log.push('✗ ' + tag); return src; }
  log.push('✓ ' + tag);
  return src.split(from).join(to);
};

/* 1) CSS：折叠时清掉左栏缩进；细轨铺满；快捷条改成状态块底部动作行 */
let css = rd('app.css');
css = rep(css, `.col--list.is-col > *:not(.rail), .col--status.is-col > *:not(.rail) { display: none !important; }`,
`.col--list.is-col > *:not(.rail), .col--status.is-col > *:not(.rail) { display: none !important; }
.col--list.is-col { padding-left: 0 !important; }`, 'CSS 左栏缩进清零');

css = rep(css, `.col--list.is-col .rail, .col--status.is-col .rail {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  width: 100%; height: 100%; padding: 10px 0 12px;`,
`.col--list.is-col .rail, .col--status.is-col .rail {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  width: 100%; height: 100%; min-width: 0; padding: 10px 0 12px;`, 'CSS 细轨铺满');

css = rep(css, `.qbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }`,
`.qbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-top: 12px; padding-top: 11px;
  border-top: 1px solid rgba(42, 41, 35, .18);
}`, 'CSS 快捷条并入状态块');
wr('app.css', css);

/* 2) screens.js：qbar 移进 runhero（放在 hint 之后、块闭合之前），去掉重复的"触发一次" */
let s = rd('screens.js');
const qbarOld = `        '</div>' +
        '<div class="qbar">' +
          '<button class="blk blk--dark" type="button" data-act="qTrigger"' + (run ? '' : ' disabled') + '>触发一次</button>' +
          '<select class="inp inp--sel" data-fk="burst" style="height:30px;width:auto;font-size:12.5px" aria-label="连发次数">' + [3, 5, 10, 20].map(function (n) {
            return '<option value="' + n + '"' + ((V.state.burst || 5) === n ? ' selected' : '') + '>连发 ' + n + ' 次</option>';
          }).join('') + '</select>' +
          '<button class="blk" type="button" data-act="qBurst"' + (run ? '' : ' disabled') + '>开始连发</button>' +
          '<span class="sep" aria-hidden="true"></span>' +
          '<button class="blk" type="button" data-act="qRestart"' + (ready.slice(0, 3).every(function (x) { return x.done; }) ? '' : ' disabled') + '>重启服务</button>' +
          '<button class="blk" type="button" data-act="toAudit">全部记录</button>' +
          '<button class="blk" type="button" data-act="qCopy">复制端点</button>' +
          '<button class="blk" type="button" data-act="qPrep">进准备台</button>' +
        '</div>';`;
const qbarNew = `        '<div class="qbar">' +
          '<select class="inp inp--sel" data-fk="burst" style="height:30px;width:auto;font-size:12.5px" aria-label="连发次数">' + [3, 5, 10, 20].map(function (n) {
            return '<option value="' + n + '"' + ((V.state.burst || 5) === n ? ' selected' : '') + '>连发 ' + n + ' 次</option>';
          }).join('') + '</select>' +
          '<button class="blk blk--dark" type="button" data-act="qBurst"' + (run ? '' : ' disabled') + '>开始连发</button>' +
          '<span class="sep" aria-hidden="true"></span>' +
          '<button class="blk" type="button" data-act="qRestart"' + (ready.slice(0, 3).every(function (x) { return x.done; }) ? '' : ' disabled') + '>重启服务</button>' +
          '<button class="blk" type="button" data-act="toAudit">全部记录</button>' +
          '<button class="blk" type="button" data-act="qCopy">复制端点</button>' +
          '<button class="blk" type="button" data-act="qPrep">进准备台</button>' +
        '</div>' +
        '</div>';`;
s = rep(s, qbarOld, qbarNew, '快捷条移入状态块 + 去重复按钮');
wr('screens.js', s);
console.log(log.join('\n'));

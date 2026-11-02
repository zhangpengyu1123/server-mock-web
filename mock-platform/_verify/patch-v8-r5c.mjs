/* V8-R5c：尼尔选中行对比度 + 待放行压缩成一行 + 主区留白收紧 */
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

/* 1) nier：选中行文字提亮（4.28 → ~4.9），顺带面板暗头也更好读 */
let css = rd('app.css');
css = rep(css, `  --on-dark: #ddd8c4;
  --on-dark-2: #b9b4a0;`, `  --on-dark: #e9e4d0;
  --on-dark-2: #c2bda8;`, 'nier on-dark 提亮');

/* 2) 待放行横幅 + 主区留白 */
if (!css.includes('.pendline')) {
  css = css.trimEnd() + `

/* 待放行：一行摘要（详情在「闸门」屏），把首屏让给实时审计 */
.pendline {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 10px; margin-bottom: 8px;
  background: rgba(180, 83, 9, .12);
  border: 1px solid var(--warn);
  font-size: 12px; letter-spacing: .04em;
}
.pendline .tag { flex: none; }
.pendline__p { font-family: var(--mono); font-size: 10.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; }
.pendline .blk { min-height: 24px; padding: 0 9px; font-size: 11.5px; box-shadow: none; }
/* 运行台主区留白收紧一档 */
.col--main .mainbody > .pnl + .pnl { margin-top: 10px; }
.col--main .runhero + .pnl { margin-top: 10px; }
`;
  log.push('✓ CSS 待放行横幅 + 留白收紧');
}
wr('app.css', css);

/* 3) screens.js：待放行卡片 → 一行摘要 */
let s = rd('screens.js');
const oldCards = `      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      var latest = S.logs.slice(0, 7);
      var feed = (pending.length ? pending.map(function (l) {
        return '<div class="pendcard"><span class="pendcard__t">待放行 · ' + h(l.method + ' ' + l.path) + '</span>' +
          '<span class="pendcard__m">' + h(fmtLogTime(l)) + ' · ' + h((l.interaction.owner || '值班工程师')) + ' · 超时 ' + Math.round((l.interaction.timeoutS || 600) / 60) + ' 分</span>' +
          '<span style="flex:1"></span>' +
          '<button class="blk" type="button" data-act="runApprove" data-id="' + h(l.id) + '">放行</button>' +
          '<button class="blk" type="button" data-act="runReject" data-id="' + h(l.id) + '">拒绝</button></div>';
      }).join('') : '') +`;
const newBanner = `      var pending = S.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; });
      var latest = S.logs.slice(0, 7);
      var p0 = pending[0];
      var feed = (p0 ? '<div class="pendline"><span class="tag tag--warn">待放行 ' + pending.length + '</span>' +
          '<span class="pendline__p">' + h(p0.method + ' ' + p0.path) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button class="blk" type="button" data-act="runApprove" data-id="' + h(p0.id) + '">放行</button>' +
          '<button class="blk" type="button" data-act="runReject" data-id="' + h(p0.id) + '">拒绝</button>' +
          '<button class="blk blk--ghost" type="button" data-act="toGate">全部 ' + pending.length + ' 项 →</button></div>' : '') +`;
s = rep(s, oldCards, newBanner, '待放行 → 一行摘要');

s = rep(s, `      toAudit: function () { V.go('audit'); },`,
`      toAudit: function () { V.go('audit'); },
      toGate: function () { V.go('gate'); },`, '新增 toGate 动作');
wr('screens.js', s);
console.log(log.join('\n'));

/* V8-R4：更多下拉选 + 可操作控件（运行台快捷条 / 审计下拉过滤 / 证书随签发 / 延迟预设） */
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

/* ---------------- CSS：hero 控件行 + 快捷操作条 ---------------- */
let css = rd('app.css');
if (!css.includes('V8-R4')) {
  css = css.trimEnd() + `

/* ============================================================================
 * V8-R4：可操作区域 —— 状态块内的下拉、快捷操作条、审计过滤下拉
 * ==========================================================================*/
.runhero__ctl { display: flex; align-items: flex-end; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
.runhero__ctl .fld { min-width: 210px; flex: 0 1 280px; }
.runhero__ctl .inp { height: 30px; font-size: 12.5px; }
.runhero__ctl .runhero__hint { margin: 0 0 4px; flex: 1 1 260px; }
.qbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.qbar .blk { min-height: 30px; padding: 0 11px; font-size: 12.5px; box-shadow: var(--shadow-s); }
.qbar .sep { width: 1px; align-self: stretch; background: rgba(42, 41, 35, .2); margin: 0 3px; }
.fld--inline { display: flex; align-items: center; gap: 8px; }
.fld--inline > .fld__lb { margin: 0; white-space: nowrap; }
.certrow { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: end; }
`;
  log.push('✓ app.css 追加 R4');
} else log.push('- app.css 已有 R4');
wr('app.css', css);

/* ---------------- screens.js ---------------- */
let s = rd('screens.js');

/* 1) 运行台：hero 内服务单元下拉 + 快捷操作条 */
s = rep(s, `        '<div class="runhero__hint">' + (run
          ? '触发器与实时审计就在下面；编辑配置请先停止服务，再到准备台。'
          : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面的就绪链直接去处理。')) + '</div>' +
        '</div>';`,
`        '<div class="runhero__ctl">' +
          '<label class="fld"><span class="fld__lb">服务单元<i>UNIT</i></span>' +
          '<select class="inp inp--sel" data-fk="runUnit">' + S.ports.map(function (x) {
            return '<option value="' + h(x.id) + '"' + (x.id === pf.id ? ' selected' : '') + '>' + h(portLabel(x)) + (x.running ? ' · 运行' : ' · 停止') + '</option>';
          }).join('') + '</select></label>' +
          '<span class="runhero__hint">' + (run
            ? '触发器与实时审计在下面；改配置要先停止服务。'
            : (ready.slice(0, 3).every(function (x) { return x.done; }) ? '前置条件已满足，按住 0.9 秒即启动。' : '还有前置条件未完成：点下面就绪链去处理。')) + '</span>' +
        '</div>' +
        '</div>' +
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
        '</div>';`, '运行台 hero 下拉 + 快捷条');

/* 2) 运行台：动作 */
s = rep(s, `      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) { if (fk === 'runApi') { V.state.sel.api = t.value; A.selectApi(t.value); setTimeout(V.rerender, 0); } }
  };`,
`      qTrigger: function (node) { RUN.act.runTrigger(node); },
      qBurst: function (node) {
        var pf = curPort();
        if (!pf || !pf.running) { V.toast('无法连发', '服务未启动', 'warn'); return; }
        var selEl = $('#main select[data-fk="runApi"]');
        var id = selEl ? selEl.value : (V.state.sel.api || (S.apis[0] || {}).id);
        var n = +(V.state.burst || 5), i = 0;
        B.loading(node, '连发 ' + n + ' 次');
        (function fire() {
          if (i >= n) { V.toast('已连发 ' + n + ' 次', '看下方实时审计', 'ok'); V.rerender(); return; }
          i++; A.triggerApi(id);
          setTimeout(fire, 110);
        })();
      },
      qRestart: function (node) {
        var pf = curPort(); if (!pf) return;
        B.loading(node, '重启中');
        if (pf.running) A.stopService(pf.id);
        setTimeout(function () {
          A.startService(pf.id);
          V.toast('服务已重启', portLabel(pf) + ' · ' + (pf.caps || []).length + ' 项能力在服', 'ok');
          V.rerender();
        }, 560);
      },
      qCopy: function () {
        var pf = curPort(); if (!pf) return;
        var txt = portLabel(pf) + '  ' + pf.protocol + '/' + pf.tls;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function () { V.toast('已复制端点', txt, 'ok'); }).catch(function () { V.toast('端点信息', txt, 'ok'); });
            return;
          }
        } catch (e) {}
        V.toast('端点信息', txt, 'ok');
      },
      qPrep: function () { if (V.isRunning()) { V.lockToast(); return; } V.setMode('prep'); V.go('mock'); },
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) {
      if (fk === 'runApi') { V.state.sel.api = t.value; A.selectApi(t.value); setTimeout(V.rerender, 0); }
      else if (fk === 'runUnit') { V.state.sel.port = t.value; A.selectPort(t.value); setTimeout(V.rerender, 0); }
      else if (fk === 'burst') { V.state.burst = +t.value; }
    }
  };`, '运行台 动作与下拉');

/* 3) 接入屏：证书面板（有效期下拉 + 签发/重签/导出）——之前只定义了动作，没渲染按钮 */
s = rep(s, `      return prefill + info + reg + capPanel;`,
`      var certPanel = pnl('证书', 'CERTIFICATE', '<div class="certrow">' +
        field('有效期', 'VALID FOR', '<select class="inp inp--sel" data-fk="certDays">' + [30, 90, 365, 730].map(function (d) {
          return '<option value="' + d + '"' + ((V.state.certDays || 365) === d ? ' selected' : '') + '>' + d + ' 天</option>';
        }).join('') + '</select>') +
        '<div class="blkbar">' + blk('签发证书', 'genCert', '', 'blk--dark blk--sm') +
        blk('重新签发', 'reissue', '', 'blk--sm') + blk('导出 PEM', 'exportPem', '', 'blk--sm') + '</div>' +
        '</div><p class="hint">签发后可导出 PEM 给对端网元导入；重新签发会重置有效期。</p>', { right: certTag(pf) });
      return prefill + info + certPanel + reg + capPanel;`, '接入屏 证书面板');

/* 4) 接入屏：有效期用下拉值；change 记录 */
s = rep(s, `          A.generateCert(pf.id, { cn: pf.cert.cn || ('mock-' + pf.port + '.' + pf.ip), days: 365, issuer: 'MockCA-Root' });`,
`          A.generateCert(pf.id, { cn: pf.cert.cn || ('mock-' + pf.port + '.' + pf.ip), days: (V.state.certDays || 365), issuer: 'MockCA-Root' });`, '签发用 dropdown 天数');
s = rep(s, `        setTimeout(function () { A.generateCert(pf.id, { cn: 'mock-' + pf.port + '.' + pf.ip, days: 365, issuer: 'MockCA-Root' }); V.toast('已重新签发', '有效期重置为 365 天', 'ok'); V.rerender(); }, 320);`,
`        var dys = V.state.certDays || 365;
        setTimeout(function () { A.generateCert(pf.id, { cn: 'mock-' + pf.port + '.' + pf.ip, days: dys, issuer: 'MockCA-Root' }); V.toast('已重新签发', '有效期重置为 ' + dys + ' 天', 'ok'); V.rerender(); }, 320);`, '重签用 dropdown 天数');
s = rep(s, `    change: function (fk, t) { var n = curNE(); if (!n) return; if (fk === 'group') A.updateNE(n.id, { group: t.value }); },`,
`    change: function (fk, t) {
      if (fk === 'certDays') { V.state.certDays = +t.value; return; }
      var n = curNE(); if (!n) return;
      if (fk === 'group') A.updateNE(n.id, { group: t.value });
    },`, '接入屏 change');

/* 5) 接口屏：延迟预设下拉（与 scrub 联动） */
s = rep(s, `      var resp = pnl('响应配方', 'RESPONSE', '<div class="fgrid fgrid--2">' +
        field('HTTP 状态', 'STATUS', '<select class="inp inp--sel" data-fk="status">' + [200, 201, 202, 204, 400, 403, 404, 500].map(function (c) {
          return '<option value="' + c + '"' + (a.status === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + '</select>') +
        field('响应延迟', 'DELAY', '<div id="delayScrub"></div>') + '</div>');`,
`      var resp = pnl('响应配方', 'RESPONSE', '<div class="fgrid fgrid--2">' +
        field('HTTP 状态', 'STATUS', '<select class="inp inp--sel" data-fk="status">' + [200, 201, 202, 204, 400, 403, 404, 500].map(function (c) {
          return '<option value="' + c + '"' + (a.status === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + '</select>') +
        field('延迟预设', 'PRESET', '<select class="inp inp--sel" data-fk="delayPreset" data-id="' + h(a.id) + '">' + [0, 60, 120, 300, 800, 1500, 2500].map(function (d) {
          return '<option value="' + d + '"' + ((a.delayMs || 0) === d ? ' selected' : '') + '>' + d + ' ms</option>';
        }).join('') + '</select>') +
        field('响应延迟（可拖）', 'DELAY', '<div id="delayScrub"></div>') + '</div>');`, '接口屏 延迟预设');

s = rep(s, `      if (fk === 'status') A.updateApi(a.id, { status: +t.value });`,
`      if (fk === 'status') A.updateApi(a.id, { status: +t.value });
      else if (fk === 'delayPreset') A.updateApi(a.id, { delayMs: +t.value });`, '接口屏 delayPreset 联动');

/* 6) 审计屏：范围 / 接口 下拉（状态用已有 segmented） */
s = rep(s, `      var head = pnl('过滤', 'FILTER', '<div class="blkbar"><div id="afilter"></div>' +
        '<input class="inp" id="aquery" placeholder="搜索路径 / 方法 / 状态" value="' + h(S.ui.logQuery || '') + '" style="width:38%" /></div>');`,
`      if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
      var af = V.state.auditF;
      var apiPaths = [];
      S.logs.forEach(function (x) { if (apiPaths.indexOf(x.path) < 0) apiPaths.push(x.path); });
      var head = pnl('过滤', 'FILTER', '<div class="blkbar">' +
        '<select class="inp inp--sel" data-fk="afRange" style="width:auto" aria-label="范围">' + [30, 60, 200].map(function (n) {
          return '<option value="' + n + '"' + (af.range === String(n) ? ' selected' : '') + '>最近 ' + n + ' 条</option>';
        }).join('') + '<option value="all"' + (af.range === 'all' ? ' selected' : '') + '>全部</option></select>' +
        '<select class="inp inp--sel" data-fk="afApi" style="width:auto;max-width:38%" aria-label="接口">' +
        '<option value="all"' + (af.api === 'all' ? ' selected' : '') + '>全部接口</option>' +
        apiPaths.map(function (pp) {
          return '<option value="' + h(pp) + '"' + (af.api === pp ? ' selected' : '') + '>' + h(pp) + '</option>';
        }).join('') + '</select>' +
        '<div id="afilter"></div>' +
        '<input class="inp" id="aquery" placeholder="搜索路径 / 方法 / 状态" value="' + h(S.ui.logQuery || '') + '" style="width:26%" /></div>');`, '审计屏 下拉过滤 UI');

/* 7) 审计屏：过滤逻辑 + 列表/stats 用它 */
s = rep(s, `    list: function () {
      return S.logs.slice(0, 40).map(function (l) {
        return { id: l.id, label: l.method + ' ' + l.path, meta: fmtLogTime(l) + ' · ' + (l.latencyMs || 0) + 'ms', count: l.status };
      });
    },`,
`    list: function () {
      return auditRows().map(function (l) {
        return { id: l.id, label: l.method + ' ' + l.path, meta: fmtLogTime(l) + ' · ' + (l.latencyMs || 0) + 'ms', count: l.status };
      });
    },`, '审计 list 用过滤');

s = rep(s, `  /* ================================================================ 0.2 闸门（待人工集中处理） */`,
`  // 审计过滤：范围 / 状态（segmented）/ 接口
  function auditRows() {
    var af = V.state.auditF || (V.state.auditF = { range: '60', status: 'all', api: 'all' });
    var base = af.range === 'all' ? S.logs.slice() : S.logs.slice(0, +af.range);
    var q = (S.ui.logQuery || '').toLowerCase();
    return base.filter(function (l) {
      var st = l.status || 200;
      if (af.status === '2xx' && !(st >= 200 && st < 300)) return false;
      if (af.status === '4xx' && !(st >= 400 && st < 500)) return false;
      if (af.status === '5xx' && st < 500) return false;
      if (af.api !== 'all' && l.path !== af.api) return false;
      if (q && (l.path || '').toLowerCase().indexOf(q) < 0 && (l.method || '').toLowerCase().indexOf(q) < 0 && String(st).indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ================================================================ 0.2 闸门（待人工集中处理） */`, '审计 auditRows');

s = rep(s, `    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    }
  };

  /* ================================================================ 0.2 闸门（待人工集中处理） */`,
`    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) {
      if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
      if (fk === 'afRange') V.state.auditF.range = t.value;
      if (fk === 'afApi') V.state.auditF.api = t.value;
    }
  };

  /* ================================================================ 0.2 闸门（待人工集中处理） */`, '审计 change');

/* 8) mountAudit 的状态 segmented 写进 auditF.status */
s = rep(s, `    if ($('#afilter')) X.segmented($('#afilter'), {
      value: S.ui.logFilter || 'all',
      items: [{ label: '全部', value: 'all' }, { label: '成功', value: 'ok' }, { label: '异常', value: 'err' }, { label: '待人工', value: 'human' }],
      onChange: function (v) { A.setLogFilter(v); V.rerender(); }
    });`,
`    if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
    if ($('#afilter')) X.segmented($('#afilter'), {
      value: V.state.auditF.status,
      items: [{ label: '全部', value: 'all' }, { label: '2xx', value: '2xx' }, { label: '4xx', value: '4xx' }, { label: '5xx', value: '5xx' }],
      onChange: function (v) { V.state.auditF.status = v; V.rerender(); }
    });`, '审计 segmented 接 auditF');

wr('screens.js', s);
console.log(log.join('\n'));

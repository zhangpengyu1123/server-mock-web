import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/screens.js';
let s = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const n = s.split(from).length - 1;
  if (!n) { log.push('✗ ' + tag + '（未匹配）'); return; }
  s = s.split(from).join(to);
  log.push('✓ ' + tag + ' ×' + n);
};

/* holdConfirm 的完成回调是 onConfirm；fuseButton 是 onCommit（共享层 micro.js 的真实签名） */

// 1) 运行台：按住启动
rep(`        duration: 900, label: '按住 0.9 秒启动',
        onDone: function () {
          A.startService(pf.id);`,
`        duration: 900, label: '按住 0.9 秒启动',
        onConfirm: function () {
          A.startService(pf.id);`, '运行台 holdConfirm → onConfirm');

// 2) 运行台：停止
rep(`        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onDone: function () { A.stopService(pf.id); V.rerender(); },`,
`        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onCommit: function () { A.stopService(pf.id); V.rerender(); },`, '运行台 fuseButton → onCommit');

// 3) 准备台·接入：按住启动（备用入口）
rep(`        duration: 900, label: '按住 0.9 秒启动',
        onDone: function () { A.startService(pf.id); V.toast('mock 服务已启动', portLabel(pf) + ' · ' + pf.caps.length + ' 项能力', 'ok'); V.rerender(); }`,
`        duration: 900, label: '按住 0.9 秒启动',
        onConfirm: function () { A.startService(pf.id); V.toast('mock 服务已启动', portLabel(pf) + ' · ' + pf.caps.length + ' 项能力', 'ok'); V.rerender(); }`, '接入屏 holdConfirm → onConfirm');

// 4) 准备台·接入：停止
rep(`        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onDone: function () { A.stopService(pf.id); V.rerender(); },
        onUndo: function () { A.startService(pf.id); V.rerender(); }
      });
    },
    act: {
      fillNic:`,
`        label: '停止 mock 服务', doneLabel: '已停止', undoLabel: '撤销停止', undoWindow: 3200,
        onCommit: function () { A.stopService(pf.id); V.rerender(); },
        onUndo: function () { A.startService(pf.id); V.rerender(); }
      });
    },
    act: {
      fillNic:`, '接入屏 fuseButton → onCommit');

// 5) 库房：移除软件包
rep(`        label: '移除', doneLabel: '已移除', undoLabel: '撤销', undoWindow: 3000,
        onDone: function () { A.removePackage(pk.id); V.rerender(); },`,
`        label: '移除', doneLabel: '已移除', undoLabel: '撤销', undoWindow: 3000,
        onCommit: function () { A.removePackage(pk.id); V.rerender(); },`, '库房 fuseButton → onCommit');

writeFileSync(P, s, 'utf8');
console.log(log.join('\n'));
console.log('剩余 onDone 出现: ' + (s.match(/onDone\s*:/g) || []).length);

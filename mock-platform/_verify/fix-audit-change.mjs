import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/screens.js';
let s = readFileSync(P, 'utf8');
const from = `    mount: function () { if (V.mountAudit) V.mountAudit(); },
    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    }
  };`;
const to = `    mount: function () { if (V.mountAudit) V.mountAudit(); },
    act: {
      runApprove: function (node) { V.resolveAudit(node.getAttribute('data-id'), true); },
      runReject: function (node) { V.resolveAudit(node.getAttribute('data-id'), false); },
      noop: function () {}
    },
    change: function (fk, t) {
      if (!V.state.auditF) V.state.auditF = { range: '60', status: 'all', api: 'all' };
      if (fk === 'afRange') V.state.auditF.range = t.value;
      if (fk === 'afApi') V.state.auditF.api = t.value;
    }
  };`;
if (!s.includes(from)) { console.log('✗ 未匹配'); process.exit(0); }
s = s.replace(from, to);
writeFileSync(P, s, 'utf8');
console.log('✓ 审计 change 已挂');

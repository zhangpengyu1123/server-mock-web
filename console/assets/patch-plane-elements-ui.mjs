#!/usr/bin/env node
/* 网元/组接后端：loadElements 映射 + 新建/复制走 API */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 载入网元与组 */
rep(`  async function loadAudit() {`,
`  async function loadElements() {
    try {
      const [els, gs] = await Promise.all([
        api('/api/business/elements'),
        api('/api/business/groups'),
      ]);
      if (Array.isArray(els) && els.length) {
        S.elements = els.map((e) => ({
          id: e.id, name: e.name, arch: e.arch,
          type: e.kind, version: e.version, sw: e.software,
          group: e.group, comps: e.components || [],
          prev: (e.prev_versions || [])[0] || '—',
          checks: e.checks || [], flow: e.flow || [],
        }));
      }
      if (Array.isArray(gs) && gs.length) {
        S.groups = gs.map((g) => ({ id: g.id, name: g.name, elements: g.element_ids || [] }));
      }
      if (!S.elements.find((e) => e.id === S.topoSel) && S.elements.length) S.topoSel = S.elements[0].id;
    } catch (e) { /* 离线时保留演示数据 */ }
    return { elements: S.elements, groups: S.groups };
  }

  async function loadAudit() {`, 'loadElements');

/* 2) 新建网元 → API */
rep(`    const na = $('#btnNeAdd');
    if (na) na.addEventListener('click', () => {
      const n = S.elements.length + 1;
      S.elements.push({ id: 'ne-000' + n, name: 'gNB-HZ-09' + (4 + n), arch: 'SA', type: 'gNB', version: '5.2.1', sw: 'NR-RAN', group: 'g-hz-01', comps: ['主控板', '业务板', '电源'] });
      render();
    });`,
`    const na = $('#btnNeAdd');
    if (na) na.addEventListener('click', async () => {
      try {
        await api('/api/business/elements', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            name: 'gNB-HZ-09' + String(10 + S.elements.length),
            arch: 'SA', kind: 'gNB', version: '5.2.1', software: 'NR-RAN',
            group: (S.groups[0] || {}).id || '', components: ['主控板', '业务板', '电源'],
          }),
        });
        await loadElements();
      } catch (e) { console.warn(e); }
      render();
    });`, 'ne add api');

/* 3) 复制网元 → API */
rep(`    $$('[data-ne-copy]').forEach((b) => b.addEventListener('click', () => {
      const src = S.elements.find((x) => x.id === b.dataset.neCopy);
      if (!src) return;
      const n = S.elements.length + 1;
      S.elements.push(Object.assign({}, src, { id: 'ne-000' + n, name: src.name + '-copy' }));
      render();
    }));`,
`    $$('[data-ne-copy]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/api/business/elements/' + b.dataset.neCopy + '/copy', { method: 'POST', headers: headers(), body: '{}' });
        await loadElements();
      } catch (e) { console.warn(e); }
      render();
    }));`, 'ne copy api');

/* 4) 启动载入 */
rep(`      if (ok) { await loadEndpoint(); await loadTasks(); await loadIfaces(); await loadAudit(); }`,
    `      if (ok) { await loadEndpoint(); await loadElements(); await loadTasks(); await loadIfaces(); await loadAudit(); }`, 'startup elements');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

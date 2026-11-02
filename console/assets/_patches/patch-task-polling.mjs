#!/usr/bin/env node
/* 任务视图轮询：每 3s 拉一次任务，进度变化则重渲染（时间线自己动） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 状态：定时器 */
rep(`    tasks: [],         // 升级任务（来自后端）`,
    `    tasks: [],         // 升级任务（来自后端）
    taskTimer: 0,      // 任务视图轮询定时器`, 'state timer');

/* render 末尾：任务视图轮询 */
rep(`      if (S.view === 'topo' && S.topoDim === '3d') {
        const b3now = $('#btn3d');
        if (b3now) setTimeout(() => b3now.click(), 0);
      }`,
`      if (S.view === 'topo' && S.topoDim === '3d') {
        const b3now = $('#btn3d');
        if (b3now) setTimeout(() => b3now.click(), 0);
      }

      // 任务视图：每 3s 拉一次，进度变化则重渲染（自动推进阶段会自己动）
      if (S.taskTimer) { clearTimeout(S.taskTimer); S.taskTimer = 0; }
      if (S.view === 'task' && S.tasks.length) {
        const snapshot = S.tasks.map((x) => x.id + ':' + x.stage + ':' + x.progress).join('|');
        S.taskTimer = setTimeout(async () => {
          try {
            const fresh = await api('/api/business/tasks');
            const next = (fresh || []).map((x) => x.id + ':' + x.stage + ':' + x.progress).join('|');
            S.tasks = fresh || S.tasks;
            if (next !== snapshot) render();
            else { S.taskTimer = setTimeout(() => render(), 3000); }
          } catch (e) { /* 忽略 */ }
        }, 3000);
      }`, 'task polling');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

#!/usr/bin/env node
/* 桌面壳窗口控制：在 plExit 绑定前插入 bindWindowControls */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
if (lines.some((l) => l.includes('bindWindowControls'))) { console.log('已存在，跳过'); process.exit(0); }
const i = lines.findIndex((l) => l.includes("$('#plExit') && $('#plExit').addEventListener"));
if (i < 0) { console.log('MISS plExit'); process.exit(1); }
const block = `  // ---------------------------------------------------------------- 桌面壳窗口控制
  (function bindWindowControls() {
    const box = $('#plWinCtl');
    if (!box) return;
    const api = window.__TAURI_INTERNALS__;
    const call = (cmd) => (api && api.invoke) ? api.invoke('plugin:window|' + cmd, { label: 'main' }) : Promise.resolve();
    box.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const k = b.dataset.win;
      if (k === 'min') call('minimize');
      else if (k === 'max') call('toggle_maximize');
      else if (k === 'close') call('close');
    }));
  })();
`.split('\n');
lines = [...lines.slice(0, i), ...block, ...lines.slice(i)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   bindWindowControls 插入（L' + (i + 1) + '）');

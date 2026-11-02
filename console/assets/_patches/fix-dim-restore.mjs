#!/usr/bin/env node
/* 修复：① 把"恢复 3D"块从模块级挪进 render()；② mount 时若画布已脱离 DOM 则重建 */
import { readFileSync, writeFileSync } from 'node:fs';

/* ---- plane.js ---- */
{
  const P = 'console/ui/business/plane.js';
  let lines = readFileSync(P, 'utf8').split(/\r?\n/);
  // 删除模块级错位块（3 行 + 注释尾巴）
  const i = lines.findIndex((l) => l.includes("if (S.view === 'topo' && S.topoDim === '3d') {"));
  if (i > 0) {
    // 向上找注释行起点（含乱码合并行），向下找闭合 }
    let start = i;
    while (start > 0 && lines[start - 1].includes('3D')) start--;
    let end = i;
    while (end < lines.length && lines[end].trim() !== '}') end++;
    lines.splice(start, end - start + 1);
    console.log('ok   移除模块级错位块');
  }
  // 在 render() 末尾插入
  const ri = lines.findIndex((l) => l.includes('function render() {'));
  if (ri > 0) {
    const close = lines.findIndex((l, idx) => idx > ri && l.trim() === '}');
    const ins = [
      "      // 维度记忆：当前是 3D 时，重渲染后自动恢复",
      "      if (S.view === 'topo' && S.topoDim === '3d') {",
      "        const b3now = $('#btn3d');",
      "        if (b3now) setTimeout(() => b3now.click(), 0);",
      "      }",
    ];
    lines = [...lines.slice(0, close), ...ins, ...lines.slice(close)];
    console.log('ok   render() 内插入恢复逻辑');
  }
  writeFileSync(P, lines.join('\n'), 'utf8');
}

/* ---- plane-topo3d.js ---- */
{
  const P = 'console/ui/business/plane-topo3d.js';
  let t = readFileSync(P, 'utf8');
  const from = `  mount(host, state, onPick, onDrill) {
    if (rig) { rig.state = state; rig.onPick = onPick; rig.onDrill = onDrill; window.__topoRig = rig; return rig; }`;
  const to = `  mount(host, state, onPick, onDrill) {
    // host 是重渲染后的新容器时，旧 rig 的画布已脱离 DOM → 重建
    if (rig && !host.contains(rig.renderer.domElement)) { rig.dispose(); rig = null; }
    if (rig) { rig.state = state; rig.onPick = onPick; rig.onDrill = onDrill; window.__topoRig = rig; return rig; }`;
  if (t.includes(from)) { t = t.replace(from, to); console.log('ok   mount 重建逻辑'); }
  else console.log('MISS mount');
  writeFileSync(P, t, 'utf8');
}

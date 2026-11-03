// admin 机架：悬停=详情 / 点击=操作（右侧停靠面板）
// 1) rig-ui.js：面板不再跟随点击点；去掉重复的 pointerup 打开；悬停卡避让面板；点空白关闭
// 2) app.js：机架选中不再渲染第二个面板（#rigPanel），避免与操作面板重复
import { readFileSync, writeFileSync } from 'node:fs';

const log = [];

/* ---------------------------------------------- rig-ui.js */
{
  const P = 'console/ui/admin/rig-ui.js';
  let lines = readFileSync(P, 'utf8').split(/\r?\n/);

  /* ① openModal：忽略坐标，面板固定停靠 */
  const i = lines.findIndex((l) => l.includes('function openModal(type, ref, clientX, clientY) {'));
  if (i < 0) throw new Error('MISS openModal');
  lines[i] = '  function openModal(type, ref) {';
  // 删除末尾的定位代码块（从 "modal.classList.add('on');" 到 "hideTip();"）
  const s = lines.findIndex((l, k) => k > i && l.includes("modal.classList.add('on');"));
  const e = lines.findIndex((l, k) => k > s && l.includes('hideTip();'));
  if (s < 0 || e < 0) throw new Error('MISS 定位块');
  lines.splice(s + 1, e - s, '    // 面板固定停靠在右侧（不跟随点击位置）：点击 = 操作，不与悬停卡抢空间');
  log.push('ok   openModal 固定停靠');

  /* ② 删除重复的 pointerup 打开逻辑（rig:select 已经打开） */
  const d1 = lines.findIndex((l) => l.includes('window.addEventListener(\'pointerup\''));
  if (d1 >= 0) {
    let d2 = d1;
    let depth = 0, started = false;
    for (let k = d1; k < lines.length; k++) {
      for (const ch of lines[k]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
      if (started && depth === 0) { d2 = k; break; }
    }
    lines.splice(d1, d2 - d1 + 1);
    log.push('ok   移除 pointerup 重复打开');
  } else log.push('MISS pointerup');

  /* ③ placeTip：面板打开时靠左放置 */
  const pi = lines.findIndex((l) => l.includes('function placeTip() {'));
  if (pi >= 0) {
    let pe = pi;
    while (pe < lines.length && !(lines[pe].trim() === '}' && pe > pi)) pe++;
    const ind = '  ';
    lines.splice(pi, pe - pi + 1,
      '  function placeTip() {',
      '    const w = tip.offsetWidth || 286, h = tip.offsetHeight || 120;',
      '    // 操作面板打开时，悬停卡一律放到它的左侧，绝不重叠',
      '    let panelLeft = innerWidth;',
      "    if (modal.classList.contains('on')) {",
      '      const r = modal.getBoundingClientRect();',
      '      panelLeft = r.left;',
      '    }',
      '    let x = pointer.x + 18, y = pointer.y + 16;',
      '    if (x + w + 14 > panelLeft) x = Math.min(pointer.x - w - 18, panelLeft - w - 14);',
      '    if (y + h > innerHeight - 12) y = pointer.y - h - 16;',
      '    tip.style.left = Math.max(8, x) + \'px\';',
      '    tip.style.top = Math.max(8, y) + \'px\';',
      '  }');
    log.push('ok   placeTip 避让面板');
  } else log.push('MISS placeTip');

  /* ④ 点空白处关闭面板（场景没选中任何对象时） */
  const si = lines.findIndex((l) => l.includes("host.addEventListener('rig:select'"));
  if (si >= 0) {
    // 在选中断言前插入：若 detail 为空 → 关闭
    lines.splice(si + 1, 0,
      '      if (!e.detail || !e.detail.type) { closeModal(); return; }');
    log.push('ok   空白点击关闭面板');
  } else log.push('MISS rig:select');

  writeFileSync(P, lines.join('\n'), 'utf8');
}

/* ---------------------------------------------- app.js：不再渲染第二个面板 */
{
  const P = 'console/ui/admin/app.js';
  let t = readFileSync(P, 'utf8');
  const from = `        onSelect: (type, payload) => {
          S.rigSel = payload;
          S.rigFocus = type === 'node' ? payload.id : (payload.data && payload.data.node_id) || null;
          renderRigPanel(type, payload);`;
  const to = `        onSelect: (type, payload) => {
          S.rigSel = payload;
          S.rigFocus = type === 'node' ? payload.id : (payload.data && payload.data.node_id) || null;
          // 操作面板由 rig-ui.js 统一提供（右侧停靠）；这里只清掉旧的内联面板，避免双面板
          renderRigPanel(type, null);`;
  if (t.includes(from)) {
    t = t.replace(from, to);
    writeFileSync(P, t, 'utf8');
    log.push('ok   app.js 停用重复面板');
  } else log.push('MISS app.js onSelect');
}

console.log(log.join('\n'));

#!/usr/bin/env node
/* 把 scene.js 的几何常量对齐 v5 资产（薄方卡 + 平放主板 + 5 窄槽） */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'console/ui/admin/scene.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

// 1) 几何常量
rep(
`const G = {
  boardTop: 0.710,
  socketPitch: 0.372,
  socketCount: 6,
  socketSeatY: 0.665,      // 卡匣插到位的 y（= 板面 - 槽深）
  insertLift: 0.95,        // 落位动画起始高度
  spacing: 2.92,
  plateY: 0.512,           // 卡匣铭牌中心（相对卡匣原点）
};`,
`const G = {
  boardTop: 0.710,         // 板面上表面
  socketPitch: 0.420,      // 槽心间距（与 Blender SPEC 一致）
  socketCount: 5,
  socketSeatY: 0.650,      // 卡片插到位的 y（= 板面 - 槽深 0.060）
  insertLift: 1.05,        // 落位动画起始高度（从上方落下）
  spacing: 2.92,           // 主板间距
  boardPlateY: 0.662,      // 主板前缘铭牌中心
  boardPlateZ: 0.4312,
  boardPlateW: 0.84,
  boardPlateH: 0.082,
  railY: 0.7065,           // 前缘光槽 y
  railZ: 0.398,
  cardThick: 0.018,
};`,
'G constants'
);

// 2) 主板前缘铭牌位置
rep(
`      plate.position.set(-0.55, G.boardTop - 0.048, 0.4615);`,
`      plate.position.set(-0.55, G.boardPlateY, G.boardPlateZ);`,
'board plate position'
);

// 3) 前缘流线位置
rep(
`      ribbon.position.set(0, G.boardTop - 0.002, 0.462);
      ribbon.rotation.x = -0.12;`,
`      ribbon.position.set(0, G.railY, G.railZ);
      ribbon.rotation.x = -0.10;`,
'ribbon position'
);

// 4) 卡片落位：按型号算铭牌位置与尺寸
rep(
`      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
      root.position.set(board.xs[slot], G.socketSeatY + G.insertLift, 0);
      board.root.add(root);

      // 卡匣铭牌：服务名 + 方法/路径 + 机型
      const name = mp.name || mp.path || mp.id;
      const plate = this.makePlate(0.252, 0.124,
        [name, String(mp.method || 'GET').toUpperCase() + ' ' + (mp.path || '')],
        { big: 64, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });
      plate.position.set(0, G.plateY, 0.0455);
      root.add(plate);`,
`      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
      root.position.set(board.xs[slot], G.socketSeatY + G.insertLift, 0);
      board.root.add(root);

      // 卡片面上的显著铭牌：服务名 + 方法/路径（贴在深色铭牌凹位上）
      const name = mp.name || mp.path || mp.id;
      const tall = kind === 'FS';
      const plateW = tall ? 0.300 : 0.282;
      const plateH = tall ? 0.098 : 0.086;
      const plateY = tall ? 0.318 : 0.292;
      const plate = this.makePlate(plateW, plateH,
        [name, String(mp.method || 'GET').toUpperCase() + ' ' + (mp.path || '')],
        { big: 68, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });
      plate.position.set(0, plateY, G.cardThick / 2 + 0.0018);
      root.add(plate);`,
'card plate position'
);

// 5) 命中光晕位置（跟着铭牌走）
rep(
`      glow.scale.set(0.34, 0.34, 1);
      glow.position.set(0, G.plateY, 0.12);`,
`      glow.scale.set(0.34, 0.34, 1);
      glow.position.set(0, plateY, 0.10);`,
'glow position'
);

// 6) 卡片插入动画：垂直落下 + 轻微旋转收束
rep(
`      const delay = 0.08 + i * 0.045;
      const k = Math.max(0, Math.min(1, (this.intro - delay) * 1.5));
      const ease = 1 - Math.pow(1 - k, 3);
      m.root.position.y = m.seatY + G.insertLift * (1 - ease);`,
`      const delay = 0.08 + i * 0.05;
      const k = Math.max(0, Math.min(1, (this.intro - delay) * 1.45));
      const ease = 1 - Math.pow(1 - k, 3);
      m.root.position.y = m.seatY + G.insertLift * (1 - ease);
      // 落位末段轻微回弹，像被槽"吸住"
      const settle = Math.sin(Math.min(1, Math.max(0, (k - 0.82) / 0.18)) * Math.PI) * 0.012;
      m.root.position.y -= settle;`,
'insert animation'
);

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

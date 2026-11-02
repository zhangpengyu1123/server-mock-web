#!/usr/bin/env node
/* 主板重做：砍腿悬浮 + 比例贴近卡槽 + 卡槽靠一侧、另一侧留信息/特效区
   同时把 scene.js 的几何常量与相机同步过去 */
import { readFileSync, writeFileSync } from 'node:fs';

const log = [];
function patch(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [from, to, tag] of pairs) {
    const isRe = from instanceof RegExp;
    const hit = isRe ? from.test(t) : t.includes(from);
    if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; continue; }
    t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
    log.push('ok   ' + tag);
  }
  writeFileSync(file, t, 'utf8');
}

/* ---------------- 1. Blender 资产：悬浮窄板 ---------------- */
patch('console/assets/blender/build_rhine_assets_v7.py', [
  // 板：窄而长（容纳 5 张卡 + 一块信息区），不再需要腿高
  [/"w": 1\.10, "d": 0\.50, "t": 0\.050,\n        "leg_h": 0\.640, "leg": 0\.064,/,
   `"w": 0.460, "d": 0.820, "t": 0.050,
        "leg_h": 0.640, "leg": 0.064,      # 腿已砍掉，仅保留悬浮高度基准`, 'board size'],

  // 卡槽整体推到板的 +Y 一侧（信息区留在 -Y 侧，正对相机）
  [/def slot_ys\(\):\n    """插槽沿深度 Y 排开：卡片面贴面并排（像刀片卡插在背板上）"""\n    s = SPEC\["board"\]\n    n = s\["slot_count"\]\n    span = \(n - 1\) \* s\["slot_pitch"\]\n    return \[-span \/ 2 \+ i \* s\["slot_pitch"\] for i in range\(n\)\]/,
   `def slot_ys():
    """卡槽集中在板的一侧（+Y），另一侧留信息/特效区"""
    s = SPEC["board"]
    n = s["slot_count"]
    return [0.040 + i * s["slot_pitch"] for i in range(n)]`, 'slot_ys side'],

  // 去掉四腿与脚垫
  [/    for tag, sx, sy in \(\("FL", -1, -1\), \("FR", 1, -1\), \("BL", -1, 1\), \("BR", 1, 1\)\):\n        leg = box\("GEO_Board_Leg_%s" % tag, \(s\["leg"\], s\["leg"\], s\["leg_h"\]\),\n                  \(sx \* \(s\["w"\] \/ 2 - 0\.10\), sy \* \(s\["d"\] \/ 2 - 0\.12\), s\["leg_h"\] \/ 2\),\n                  M\["body"\], bevel=0\.0024, seg=2\)\n        leg\.parent = root\n        pad = box\("GEO_Board_Pad_%s" % tag, \(s\["leg"\] \* 1\.1, s\["leg"\] \* 1\.1, 0\.006\),\n                  \(sx \* \(s\["w"\] \/ 2 - 0\.10\), sy \* \(s\["d"\] \/ 2 - 0\.12\), 0\.003\),\n                  M\["metal"\], bevel=0\.001, seg=1\)\n        pad\.parent = root\n\n/,
   `    # 无腿：主板悬浮（由场景里的软阴影/底部辉光交代"悬着"）\n\n`, 'remove legs'],

  // 信息/特效区：板面 -Y 侧一块嵌入式浅凹板（运行时写节点名/版本，并叠加光效）
  [/    plate = box\("GEO_Board_Plate", \(0\.620, 0\.0020, 0\.074\),\n                \(0\.10, -s\["d"\] \/ 2 - 0\.0012, top_z - 0\.040\), M\["dark"\], bevel=0\.0\)\n    plate\.parent = root/,
   `    # 信息区：板面靠相机一侧的嵌入式铭牌（写节点名/版本）
    plate = box("GEO_Board_Plate", (s["w"] * 0.80, s["d"] * 0.34, 0.0014),
                (0, -s["d"] / 2 + s["d"] * 0.21, top_z + 0.0007), M["dark"], bevel=0.0)
    plate.parent = root
    # 信息区右侧竖条（状态光，运行时驱动）
    side = box("GEO_Board_InfoBar", (0.008, s["d"] * 0.30, 0.0020),
               (s["w"] * 0.34, -s["d"] / 2 + s["d"] * 0.21, top_z + 0.0010), M["accent"], bevel=0.0)
    side.parent = root
    # 信息区下方三道细刻度（装饰性"标尺"）
    for i in range(3):
        tick = box("GEO_Board_Ruler_%d" % i, (s["w"] * 0.62, 0.0014, 0.0016),
                   (0, -s["d"] / 2 + s["d"] * 0.06 + i * 0.016, top_z + 0.0009), M["dark"], bevel=0.0)
        tick.parent = root`, 'info panel'],
]);

/* ---------------- 2. scene.js：几何/相机/信息区 ---------------- */
patch('console/ui/admin/scene.js', [
  [/const G = \{[\s\S]*?\n\};/, `const G = {
  boardTop: 0.690,
  bayRows: 5, bayCols: 1,
  bayPitchY: 0.082, bayY0: 0.040,   // 卡槽集中在 +Y 一侧
  bayW: 0.360, bayD: 0.026, bayDepth: 0.055,
  cardSeatY: 0.635,
  insertLift: 0.80,
  spacing: 0.72,                    // 悬浮窄板横向成排
  infoY: 0.690,                     // 信息铭牌（板面，靠相机一侧）
  infoZ: 0.172,
  infoW: 0.36, infoH: 0.28,
  railY: 0.690, railZ: 0.405,
  cardT: 0.018,
};
`, 'G'],

  [/  bayCenters\(\) \{[\s\S]*?\n  \}/,
   `  bayCenters() {
    const out = [];
    for (let r = 0; r < G.bayRows; r++) {
      out.push({ x: 0, y: G.bayY0 + r * G.bayPitchY });
    }
    return out;
  }`, 'bayCenters'],

  // 主板信息铭牌：平铺在板面信息区（写节点名/版本/编号）
  [/      const plate = this\.makePlate\(0\.84, 0\.082,\n        \[node\.name \|\| node\.id, 'NODE ' \+ node\.id\.replace\(\/\^node-\/, ''\) \+ '  ·  ' \+ \(node\.version \|\| ''\)\],\n        \{ big: 60, code: 'X-' \+ String\(bi \+ 1\)\.padStart\(3, '0'\), accent: '#d79a44' \}\);\n      plate\.position\.set\(0\.10, G\.boardPlateY, G\.boardPlateZ\);/,
   `      const plate = this.makePlate(G.infoW, G.infoH,
        [node.name || node.id, 'NODE ' + node.id.replace(/^node-/, '') + '   ·   ' + (node.version || '')],
        { big: 92, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44' });
      plate.rotation.x = -Math.PI / 2;         // 平铺在板面信息区
      plate.position.set(0, G.infoY + 0.0018, G.infoZ);`, 'board info plate'],

  // 前缘光流：贴到信息区前缘
  [/      ribbon\.position\.set\(0, G\.railY, G\.railZ\);\n      ribbon\.rotation\.x = -Math\.PI \/ 2;      \/\/ 平铺在前缘光槽上/,
   `      ribbon.position.set(0, G.railY + 0.0022, G.railZ);
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.scale.set(0.34, 1, 1);            // 窄板：光流按板宽收窄`, 'ribbon'],

  // 相机：更近的 45° 特写
  [/    this\.camera\.position\.set\(1\.15, 1\.85, 1\.70\);   \/\/ 拉近：单板特写 \+ 卡排占满画面/,
   `    this.camera.position.set(0.62, 1.12, 0.94);   // 悬浮窄板 + 卡排的 45° 特写`, 'camera'],
  [/    this\.controls\.target\.set\(0, 0\.74, 0\);/,
   `    this.controls.target.set(0, 0.72, 0.06);`, 'target'],
  [/    this\.controls\.minDistance = 1\.1;/, `    this.controls.minDistance = 0.55;`, 'minDist'],
  [/    this\.controls\.maxDistance = 8\.0;/, `    this.controls.maxDistance = 4.5;`, 'maxDist'],

  // 光带宽度随板宽收窄
  [/        new THREE\.PlaneGeometry\(2\.26, 0\.030\),/, `        new THREE.PlaneGeometry(0.40, 0.024),`, 'ribbon geo'],
]);

console.log(log.join('\n'));

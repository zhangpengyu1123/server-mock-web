// ① 三种平台卡：鎏金中文铭牌 + 造型差异化
// —— scene.js 部分 ——
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/admin/scene.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];
const find = (pred, from = 0) => lines.findIndex((l, i) => i >= from && pred(l));

/* ---------- A. 鎏金铭牌纹理 + 斜向扫光纹理 ---------- */
{
  const i = find((l) => l.includes('function nameplateTexture(lines, opts) {'));
  if (i < 0) log.push('MISS nameplateTexture');
  else {
    const block = [
      '  /* 鎏金铭牌：中文全称用金箔渐变 + 压凸 + 高光边 */',
      '  const KIND_CN = {',
      '    LCM: { cn: \'生命周期管理\', en: \'LIFECYCLE MGMT\', accent: \'#d79a44\' },',
      '    OMC: { cn: \'网元管理\', en: \'NE MANAGEMENT\', accent: \'#3f8f93\' },',
      '    FS: { cn: \'虚拟机管理\', en: \'VM MANAGEMENT\', accent: \'#4a6b47\' },',
      '  };',
      '',
      '  function goldPlateTexture(kind) {',
      '    const info = KIND_CN[kind] || KIND_CN.LCM;',
      '    const W = 1536, H = 384;',
      '    const cv = document.createElement(\'canvas\');',
      '    cv.width = W; cv.height = H;',
      '    const g = cv.getContext(\'2d\');',
      '    g.clearRect(0, 0, W, H);',
      '',
      '    const cn = info.cn;',
      '    const en = info.en;',
      '    // ---- 中文：金箔纵向渐变 ----',
      '    const gold = g.createLinearGradient(0, H * 0.18, 0, H * 0.80);',
      '    gold.addColorStop(0.00, \'#fbf0c4\');',
      '    gold.addColorStop(0.22, \'#e9c877\');',
      '    gold.addColorStop(0.46, \'#c6923c\');',
      '    gold.addColorStop(0.54, \'#f3dfa2\');',
      '    gold.addColorStop(0.72, \'#b07a26\');',
      '    gold.addColorStop(1.00, \'#f6e6b4\');',
      '    const size = 168;',
      '    g.font = \'700 \' + size + \'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif\';',
      '    g.textAlign = \'center\';',
      '    g.textBaseline = \'middle\';',
      '    const cx = W / 2, cy = H * 0.44;',
      '    // 压凸：先画深色底，再往上偏移描金',
      '    g.fillStyle = \'rgba(0,0,0,.55)\';',
      '    g.fillText(cn, cx, cy + 6);',
      '    g.lineWidth = 3;',
      '    g.strokeStyle = \'rgba(60,38,10,.85)\';',
      '    g.strokeText(cn, cx, cy + 2);',
      '    g.fillStyle = gold;',
      '    g.fillText(cn, cx, cy);',
      '    // 顶部高光细线（金箔反光）',
      '    g.globalCompositeOperation = \'source-atop\';',
      '    const shine = g.createLinearGradient(0, cy - size * 0.55, 0, cy - size * 0.05);',
      '    shine.addColorStop(0, \'rgba(255,255,255,.75)\');',
      '    shine.addColorStop(1, \'rgba(255,255,255,0)\');',
      '    g.fillStyle = shine;',
      '    g.fillRect(0, cy - size * 0.6, W, size * 0.6);',
      '    g.globalCompositeOperation = \'source-over\';',
      '',
      '    // ---- 英文副题（等宽细金）----',
      '    g.font = \'500 46px "JetBrains Mono",ui-monospace,Consolas,monospace\';',
      '    g.fillStyle = \'rgba(233,200,119,.62)\';',
      '    g.fillText(en, cx, H * 0.845);',
      '',
      '    const tex = new THREE.CanvasTexture(cv);',
      '    tex.anisotropy = 4;',
      '    return tex;',
      '  }',
      '',
      '  /* 斜向扫光：一条白色渐变，靠 offset 动画制造鎏金反光 */',
      '  function sheenTexture() {',
      '    const W = 512, H = 8;',
      '    const cv = document.createElement(\'canvas\');',
      '    cv.width = W; cv.height = H;',
      '    const g = cv.getContext(\'2d\');',
      '    const grd = g.createLinearGradient(0, 0, W, 0);',
      '    grd.addColorStop(0.00, \'rgba(255,255,255,0)\');',
      '    grd.addColorStop(0.46, \'rgba(255,246,214,0)\');',
      '    grd.addColorStop(0.50, \'rgba(255,246,214,.85)\');',
      '    grd.addColorStop(0.54, \'rgba(255,246,214,0)\');',
      '    grd.addColorStop(1.00, \'rgba(255,255,255,0)\');',
      '    g.fillStyle = grd;',
      '    g.fillRect(0, 0, W, H);',
      '    const tex = new THREE.CanvasTexture(cv);',
      '    tex.wrapS = THREE.RepeatWrapping;',
      '    tex.repeat.set(1, 1);',
      '    return tex;',
      '  }',
      '',
      '  function nameplateTexture(lines, opts) {',
    ];
    lines.splice(i, 1, ...block);
    log.push('ok   鎏金纹理生成器（L' + (i + 1) + '）');
  }
}

/* ---------- B. 造型差异：kind 专属附加件 ---------- */
{
  const i = find((l) => l.includes("const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);"));
  if (i < 0) log.push('MISS 卡匣克隆');
  else {
    // 在该行后插入 bbox 计算 + 附加件调用
    lines.splice(i + 1, 0,
      '      const dims = this.dressCard(root, kind);   // 造型差异 + 返回尺寸');
    log.push('ok   dressCard 调用（L' + (i + 2) + '）');
  }
}

/* ---------- C. 鎏金铭牌挂到卡面 ---------- */
{
  const i = find((l) => l.includes('plate.position.set(0, plateYc, G.cardT / 2 + 0.0036);'));
  if (i < 0) log.push('MISS 铭牌定位');
  else {
    lines.splice(i + 2, 0,
      '',
      '        // —— 鎏金中文全称：贴在卡面中下部的空档，45° 视角正对镜头 ——',
      '        const goldTex = this.goldTex(kind);',
      '        const goldW = Math.min(0.34, (dims && dims.w ? dims.w : 0.40) * 0.84);',
      '        const goldH = goldW * 0.25;',
      '        const goldMat = new THREE.MeshBasicMaterial({ map: goldTex, transparent: true, toneMapped: false, depthWrite: false });',
      '        const gold = new THREE.Mesh(new THREE.PlaneGeometry(goldW, goldH), goldMat);',
      '        const faceZ = (dims && dims.zFront ? dims.zFront : G.cardT / 2) + 0.0042;',
      '        const goldY = (dims && dims.yMin ? dims.yMin : 0.06) + (dims && dims.h ? dims.h : 0.42) * 0.30;',
      '        gold.position.set(0, goldY, faceZ);',
      '        gold.renderOrder = 4;',
      '        root.add(gold);',
      '',
      '        // 扫光条：靠 offset.x 慢慢推，像金箔被灯扫过',
      '        const sheenMat = new THREE.MeshBasicMaterial({',
      '          map: this.sheenTex(), transparent: true, opacity: 0.55,',
      '          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,',
      '        });',
      '        const sheen = new THREE.Mesh(new THREE.PlaneGeometry(goldW, goldH * 1.5), sheenMat);',
      '        sheen.position.set(0, goldY, faceZ + 0.0012);',
      '        sheen.renderOrder = 5;',
      '        root.add(sheen);');
    log.push('ok   鎏金铭牌 + 扫光（L' + (i + 3) + '）');
  }
}

/* ---------- D. 记录到 module（给 tick 做扫光动画） ---------- */
{
  const i = find((l) => l.includes('const emitters = [].concat('));
  if (i < 0) log.push('MISS emitters');
  else {
    lines.splice(i, 0,
      '        const goldTick = { sheen, gold };',
      '');
    log.push('ok   goldTick（L' + (i + 1) + '）');
  }
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));

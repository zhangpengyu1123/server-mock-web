// 补"同组网元之间的连线"：按 5GC 参考接口画弧线 + N 编号小标签
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (a, b, tag) => { if (t.includes(a)) { t = t.replace(a, b); log.push('ok   ' + tag); } else log.push('MISS ' + tag); };

/* ① 接口表：谁连谁、接口编号 */
rep(`// 单例：宿主容器被重建时销毁旧实例
let rig = null;`,
`/* 网元间接口（5GC 参考点）：[源, 目标, 接口名, 是否跨组] */
const IFACES = [
  ['AMF', 'SMF', 'N11', true],
  ['AMF', 'AUSF', 'N12', false],
  ['AMF', 'UDM', 'N8', false],
  ['AMF', 'NSSF', 'N22', true],
  ['AMF', 'NRF', 'N27', true],
  ['SMF', 'UPF', 'N4', true],
  ['SMF', 'PCF', 'N7', false],
  ['SMF', 'UDM', 'N10', true],
  ['AUSF', 'UDM', 'N13', false],
  ['PCF', 'NRF', 'N27', true],
  ['UPF', 'NSSF', 'N22', true],
];

// 单例：宿主容器被重建时销毁旧实例
let rig = null;`, '接口表');

rep(`    this.labels = [];
    this.links = [];
    this.nodes = [];
    this.build();
    this.bindPick();`,
`    this.labels = [];
    this.links = [];
    this.ifaces = [];
    this.nodes = [];
    this.build();
    this.bindPick();`, '初始化 ifaces');

/* ② build 里重置 ifaces + 记录每个网元的位置 */
rep(`    this.nodes = [];
    this.labels = [];
    this.links = [];`,
`    this.nodes = [];
    this.labels = [];
    this.links = [];
    this.ifaces = [];
    this.nfPos = {};`, 'build 重置');

rep(`        const real = els[realIdx % Math.max(1, els.length)] || null;`,
`        this.nfPos[n.name] = new THREE.Vector3(mx, my, mz);

        const real = els[realIdx % Math.max(1, els.length)] || null;`, '记录网元位置');

/* ③ 连线方法：弧线 + 接口编号标签 */
rep(`  /* ------------------------------------------------------------- 建场 */
  build() {`,
`  /** 网元间接口：一段抬高的小弧线 + 接口编号 */
  iface(a, b, code, cross) {
    const from = a.clone();
    const to = b.clone();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const lift = cross ? 0.30 : 0.20;
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 28, cross ? 0.0032 : 0.0026, 5, false),
      new THREE.MeshStandardMaterial({
        color: cross ? 0xc0a97f : 0xa9a094, roughness: 0.65, metalness: 0,
        transparent: true, opacity: cross ? 0.62 : 0.50, depthWrite: false,
      })
    );
    this.root.add(tube);

    // 接口编号：贴在中点上方，billboard
    const top = curve.getPoint(0.5);
    const { tex, aspect } = labelTexture(code, '', { big: 52, ink: '#6b5535' });
    const hh = 0.075;
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(hh * aspect, hh),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    tag.position.copy(top).add(new THREE.Vector3(0, 0.055, 0));
    tag.renderOrder = 6;
    this.root.add(tag);
    this.labels.push(tag);

    this.ifaces.push({ from: this.nameOf(a), to: this.nameOf(b), code, tube, tag, a, b, cross });
  }

  nameOf() { return ''; }

  /* ------------------------------------------------------------- 建场 */
  build() {`, 'iface 方法');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

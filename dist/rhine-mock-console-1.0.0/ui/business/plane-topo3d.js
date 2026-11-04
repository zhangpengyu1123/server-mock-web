/* ============================================================================
   RHINE LAB · 业务面 3D 拓扑（v5 · 5GC 网元几何 · 精修材质）
   ----------------------------------------------------------------------------
   口径：
     · 只画网元；每个同组网元有且只有一个底座网元，业务网元全部挂在它上面
     · 底座三种，都是正方体，底部 1/4 黄条写 BASE：
         CSP     玻璃
         CGP     石墨（哑光深色）
         CSPEdge 信息数码体
     · 其余网元用圆柱 / 三棱锥 / 四棱锥 / 正方体
     · LCM 示例体：上下四棱锥对接成沙漏
   材质（刻意不用"金属"——金属在浅色纸感场景里最显廉价）：
     瓷 porcelain / 石墨 graphite / 玻璃 glass / 琥珀树脂 resin / 数码 data / 灰泥 slate
   尺度：整体比上一版小约 35%，层级靠明度差 + 接触阴影 + 尺寸落差拉出来
   ==========================================================================*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PAL = {
  paper: 0xece7e1,
  ink: 0x1b1916,
  amber: 0xa67d48,
  gold: 0xc8a86a,
  base: 0xe8bd4a,          // 底座黄条
  porcelain: 0xefe9df,
  graphite: 0x35312b,
  glass: 0xd6e7ea,
  resin: 0xd8c39a,
  slate: 0x9a948a,
  data: 0x101a1f,
};

/* 环境贴图：竖向渐变 + 顶部亮斑（没有 env，玻璃与哑光体都会发灰） */
function envTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0.00, '#ffffff');
  grd.addColorStop(0.45, '#efe8dd');
  grd.addColorStop(0.72, '#bcb3a5');
  grd.addColorStop(1.00, '#6d675e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = 'rgba(255,253,246,.95)';
  g.beginPath(); g.ellipse(17, 7, 11, 4.5, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 接触阴影：径向渐变贴片，让悬浮体"落"在平面上 */
function shadowTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grd.addColorStop(0.00, 'rgba(38,32,24,.40)');
  grd.addColorStop(0.55, 'rgba(38,32,24,.15)');
  grd.addColorStop(1.00, 'rgba(38,32,24,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 信息数码体：十六进制数字流 */
function digitTexture(seed) {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#0c1519';
  g.fillRect(0, 0, W, H);
  g.font = '600 14px "JetBrains Mono",ui-monospace,monospace';
  let s = seed || 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 9; y < H; y += 16) {
    for (let x = 5; x < W; x += 28) {
      const v = Math.floor(rnd() * 256).toString(16).padStart(2, '0').toUpperCase();
      g.fillStyle = rnd() > 0.66 ? 'rgba(232,189,74,.85)' : 'rgba(150,206,210,.36)';
      g.fillText(v, x, y);
    }
  }
  g.strokeStyle = 'rgba(150,206,210,.14)';
  g.lineWidth = 1;
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 黄条：写 BASE */
function baseBandTexture() {
  const W = 512, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8bd4a';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(27,25,22,.10)';
  g.lineWidth = 8;
  for (let x = -H; x < W + H; x += 30) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
  g.fillStyle = '#1b1916';
  g.font = '700 54px "JetBrains Mono",ui-monospace,monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText('BASE', W * 0.5, H * 0.53);
  g.fillStyle = 'rgba(27,25,22,.5)';
  for (let i = 0; i < 7; i++) { g.fillRect(28, 26 + i * 12, 14, 2); g.fillRect(W - 42, 26 + i * 12, 14, 2); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* 文字标签 */
function labelTexture(title, sub, opts) {
  opts = opts || {};
  const W = 512, H = 168;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  if (opts.tick) { g.fillStyle = opts.tick; g.fillRect(0, 34, 4, H - 68); }
  g.fillStyle = opts.ink || '#1b1916';
  g.font = '600 ' + (opts.big || 54) + 'px "JetBrains Mono","PingFang SC","Microsoft YaHei",monospace';
  let text = String(title || '');
  while (g.measureText(text).width > W - 48 && text.length > 2) text = text.slice(0, -2) + '…';
  g.fillText(text, 18, opts.sub ? H * 0.40 : H * 0.52);
  if (sub) {
    g.fillStyle = 'rgba(27,25,22,.48)';
    g.font = '500 ' + (opts.small || 28) + 'px "JetBrains Mono","PingFang SC",monospace';
    let s = String(sub);
    while (g.measureText(s).width > W - 48 && s.length > 2) s = s.slice(0, -2) + '…';
    g.fillText(s, 18, H * 0.74);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: W / H };
}

/* ---------------------------------------------------------------- 5GC 目录 */
const BASES = [
  { id: 'base-CSP', name: 'CSP', material: 'glass', group: 'grp-1', cn: '云服务平台' },
  { id: 'base-CGP', name: 'CGP', material: 'graphite', group: 'grp-2', cn: '云网关平台' },
  { id: 'base-CSPEdge', name: 'CSPEdge', material: 'data', group: 'grp-3', cn: '边缘平台' },
];

const NFS = [
  { id: 'nf-amf', name: 'AMF', shape: 'cyl', material: 'porcelain', g: 'grp-1', cn: '接入与移动性管理' },
  { id: 'nf-ausf', name: 'AUSF', shape: 'tri', material: 'glass', g: 'grp-1', cn: '鉴权服务器' },
  { id: 'nf-udm', name: 'UDM', shape: 'quad', material: 'slate', g: 'grp-1', cn: '统一数据管理' },
  { id: 'nf-smf', name: 'SMF', shape: 'cyl', material: 'glass', g: 'grp-2', cn: '会话管理' },
  { id: 'nf-pcf', name: 'PCF', shape: 'cube', material: 'resin', g: 'grp-2', cn: '策略控制' },
  { id: 'nf-nrf', name: 'NRF', shape: 'tri', material: 'porcelain', g: 'grp-2', cn: '网络存储' },
  { id: 'nf-upf', name: 'UPF', shape: 'quad', material: 'resin', g: 'grp-3', cn: '用户平面' },
  { id: 'nf-nssf', name: 'NSSF', shape: 'cyl', material: 'slate', g: 'grp-3', cn: '网络切片选择' },
];

// 单例：宿主容器被重建时销毁旧实例
let rig = null;

class Topo3D {
  constructor(host, state, onPick, onDrill) {
    this.host = host;
    this.state = state;
    this.onPick = onPick;
    this.onDrill = onDrill;

    const w = host.clientWidth || 880;
    const h = host.clientHeight || 430;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.paper);
    this.scene.fog = new THREE.FogExp2(PAL.paper, 0.030);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 80);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = Math.PI * 0.10;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minAzimuthAngle = -Math.PI * 0.55;
    this.controls.maxAzimuthAngle = Math.PI * 0.55;
    this.controls.enablePan = false;

    this.env = envTexture();
    this.scene.environment = this.env;
    this.shadowTex = shadowTexture();
    this.texCache = {};

    this.lights();
    this.floor();

    this.labels = [];
    this.links = [];
    this.nodes = [];
    this.build();
    this.bindPick();
    this.loop();
  }

  lights() {
    // 三灯：天光 + 主光（柔和阴影）+ 反侧补光 → 哑光体也有层次
    this.scene.add(new THREE.HemisphereLight(0xfffdf8, 0xd6cec2, 0.85));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.55);
    key.position.set(-2.6, 4.6, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4;
    sc.near = 0.5; sc.far = 14;
    key.shadow.bias = -0.0011;
    key.shadow.radius = 3;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe7ea, 0.42);
    fill.position.set(3.2, 1.6, -2.4);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe0b0, 0.30);
    rim.position.set(0.4, 2.2, -3.4);
    this.scene.add(rim);
  }

  floor() {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0xf1ece5, roughness: 0.97, metalness: 0 })
    );
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.scene.add(f);

    const grid = new THREE.GridHelper(14, 14, 0xd6cec2, 0xe3dcd2);
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.30;
    this.scene.add(grid);
  }

  /* ------------------------------------------------------------- 材质 */
  /* 只用五种：瓷 / 石墨 / 玻璃 / 琥珀树脂 / 数码（外加灰泥）。没有金属。 */
  material(kind) {
    const ck = 'mat-' + kind;
    if (this.texCache[ck]) return this.texCache[ck];
    let m;
    if (kind === 'glass') {
      m = new THREE.MeshPhysicalMaterial({
        color: PAL.glass, metalness: 0, roughness: 0.03,
        transmission: 0.92, thickness: 0.28, ior: 1.48,
        transparent: true, opacity: 0.58,
        clearcoat: 1, clearcoatRoughness: 0.02,
        envMapIntensity: 1.35, side: THREE.DoubleSide, depthWrite: false,
        attenuationColor: new THREE.Color(0xa7ccd4), attenuationDistance: 0.9,
      });
    } else if (kind === 'graphite') {
      m = new THREE.MeshPhysicalMaterial({
        color: PAL.graphite, metalness: 0.15, roughness: 0.62,
        clearcoat: 0.35, clearcoatRoughness: 0.55,
        sheen: 0.4, sheenColor: new THREE.Color(0x8a8378),
        envMapIntensity: 0.75,
      });
    } else if (kind === 'porcelain') {
      m = new THREE.MeshPhysicalMaterial({
        color: PAL.porcelain, metalness: 0, roughness: 0.42,
        clearcoat: 0.55, clearcoatRoughness: 0.35,
        sheen: 0.5, sheenColor: new THREE.Color(0xffffff),
        envMapIntensity: 0.55,
      });
    } else if (kind === 'resin') {
      m = new THREE.MeshPhysicalMaterial({
        color: PAL.resin, metalness: 0, roughness: 0.30,
        transmission: 0.22, thickness: 0.20, ior: 1.42,
        transparent: true, opacity: 0.90,
        clearcoat: 0.7, clearcoatRoughness: 0.25,
        envMapIntensity: 0.9,
        attenuationColor: new THREE.Color(0xc39a5c), attenuationDistance: 0.5,
      });
    } else if (kind === 'slate') {
      m = new THREE.MeshPhysicalMaterial({
        color: PAL.slate, metalness: 0.05, roughness: 0.74,
        sheen: 0.55, sheenColor: new THREE.Color(0xd8d2c6),
        envMapIntensity: 0.5,
      });
    } else {
      const tex = digitTexture(11);
      m = new THREE.MeshStandardMaterial({
        color: PAL.data, metalness: 0.2, roughness: 0.45,
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42,
        envMapIntensity: 0.7,
      });
    }
    m.__kind = kind;
    this.texCache[ck] = m;
    return m;
  }

  /* ------------------------------------------------------------- 几何体 */
  solid(shape, s) {
    if (shape === 'cyl') return new THREE.CylinderGeometry(s * 0.52, s * 0.52, s * 1.45, 32, 1);
    if (shape === 'tri') return new THREE.ConeGeometry(s * 0.70, s * 1.42, 3, 1);
    if (shape === 'quad') {
      const g = new THREE.ConeGeometry(s * 0.72, s * 1.42, 4, 1);
      g.rotateY(Math.PI / 4);
      return g;
    }
    return new THREE.BoxGeometry(s, s, s);
  }

  /** 接触阴影（贴地圆形渐变），把悬浮体"落"在平面上 */
  contact(x, z, size, opacity) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: this.shadowTex, transparent: true, opacity: opacity === undefined ? 0.9 : opacity,
        depthWrite: false, toneMapped: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.renderOrder = 1;
    m.raycast = () => {};
    this.root.add(m);
    return m;
  }

  /** 底座：正方体 + 底部 1/4 黄条 */
  baseCube(base, S) {
    const grp = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), this.material(base.material));
    core.castShadow = true;
    core.receiveShadow = true;
    grp.add(core);

    const bandH = S / 4;
    const bandSide = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: baseBandTexture(), roughness: 0.62, metalness: 0.02,
    });
    const bandTop = new THREE.MeshStandardMaterial({ color: PAL.base, roughness: 0.62, metalness: 0.02 });
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(S * 1.008, bandH, S * 1.008),
      [bandSide, bandSide, bandTop, bandTop, bandSide, bandSide]
    );
    band.position.y = -S / 2 + bandH / 2;
    band.castShadow = true;
    grp.add(band);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(S, S, S)),
      new THREE.LineBasicMaterial({
        color: base.material === 'glass' ? 0x7f9095 : 0x8d8578,
        transparent: true, opacity: 0.30,
      })
    );
    edges.raycast = () => {};
    grp.add(edges);
    return { grp, core, size: S };
  }

  /** LCM 沙漏：上下四棱锥对接 */
  hourglass(S) {
    const grp = new THREE.Group();
    const H = S * 1.85;
    const m = this.material('resin');
    const mk = (rot) => {
      const g = new THREE.ConeGeometry(S * 0.70, H / 2, 4, 1);
      g.rotateY(Math.PI / 4);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (rot) mesh.rotation.x = Math.PI;
      return mesh;
    };
    const lower = mk(false); lower.position.y = -H / 4 + 0.010;
    const upper = mk(true);  upper.position.y = H / 4 - 0.010;
    grp.add(lower, upper);
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(S * 0.155, 0.0055, 10, 28),
      new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.4, metalness: 0.1 })
    );
    seam.rotation.x = Math.PI / 2;
    seam.raycast = () => {};
    grp.add(seam);
    return { grp, height: H };
  }

  /* ------------------------------------------------------------- 标签 */
  addLabel(parent, title, sub, y, scale, opts, z) {
    const { tex, aspect } = labelTexture(title, sub, opts);
    const hh = 0.105 * (scale || 1);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(hh * aspect, hh),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    m.position.set(0, y, z || 0);
    m.renderOrder = 6;
    parent.add(m);
    this.labels.push(m);
    return m;
  }

  /* ------------------------------------------------------------- 连线 */
  link(a0, b0, opts) {
    opts = opts || {};
    const a = new THREE.Vector3(...a0);
    const b = new THREE.Vector3(...b0);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) return;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0026, 0.0026, len, 5, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xa9a094, roughness: 0.6, metalness: 0,
        transparent: true, opacity: 0.55, depthWrite: false,
      })
    );
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc8a86a, transparent: true, opacity: 0.95, toneMapped: false })
    );
    this.root.add(dot);
    this.links.push({ from: opts.fromId, to: opts.toId, mesh: m, dot, a, b, phase: Math.random() });
  }

  /* ------------------------------------------------------------- 建场 */
  build() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.nodes = [];
    this.labels = [];
    this.links = [];

    const st = this.state || {};
    const els = Array.isArray(st.elements) ? st.elements : [];
    const pick = (obj, data) => { obj.userData = Object.assign({}, data); this.nodes.push(obj); };

    /* —— 尺度：整体缩小，靠明度差与阴影分层 —— */
    const BASE_S = 0.52;
    const BASE_Y = 0.50;
    const NF_Y = BASE_Y + 0.60;
    const COLX = [-0.94, 0, 0.94];
    const ROWZ = 0.0;
    const NE_S = 0.20;

    const byGroup = {};
    els.forEach((e) => { const g = e.group || 'grp-1'; (byGroup[g] = byGroup[g] || []).push(e); });
    let realIdx = 0;

    BASES.forEach((b, gi) => {
      const gx = COLX[gi];
      const gz = ROWZ;
      const { grp, core, size } = this.baseCube(b, BASE_S);
      grp.position.set(gx, BASE_Y, gz);
      this.root.add(grp);
      this.contact(gx, gz, 1.02, 0.95);

      const groupIds = Object.keys(byGroup);
      const boundHere = byGroup[groupIds[gi] || ('grp-' + (gi + 1))] || [];
      const total = boundHere.length;

      pick(core, { kind: 'base', id: b.id, label: b.name, base: b.name, group: b.group });
      this.addLabel(grp, b.name, 'BASE · ' + b.cn + (total ? ' · ' + total + ' NE' : ''), -size * 0.62, 1.0, {
        big: 56, small: 26, tick: '#a67d48',
      }, size * 0.92);

      // 同组地环
      {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.56, 0.575, 64),
          new THREE.MeshBasicMaterial({ color: 0xbfb5a3, transparent: true, opacity: 0.50, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(gx, 0.006, gz);
        ring.raycast = () => {};
        this.root.add(ring);
      }

      const members = NFS.filter((n) => n.g === b.group);
      const span = Math.PI * 0.66;
      members.forEach((n, i) => {
        const t = members.length === 1 ? 0.5 : i / (members.length - 1);
        const ang = -span / 2 + span * t;
        const r = 0.42;
        const mx = gx + Math.sin(ang) * r;
        const mz = gz + Math.cos(ang) * r * 0.52 - 0.04;
        const my = NF_Y + (i % 2 ? 0.07 : 0);

        const size2 = n.shape === 'cube' ? NE_S * 1.12 : NE_S;
        const geo = this.solid(n.shape, size2);
        const mesh = new THREE.Mesh(geo, this.material(n.material));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(mx, my, mz);
        mesh.rotation.y = ang * 0.5;
        this.root.add(mesh);
        this.contact(mx, mz, 0.42, 0.42);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 24),
          new THREE.LineBasicMaterial({ color: 0x6c665c, transparent: true, opacity: 0.20 })
        );
        edges.raycast = () => {};
        mesh.add(edges);

        const real = els[realIdx % Math.max(1, els.length)] || null;
        if (real) realIdx += 1;
        const labelName = real ? real.name : n.name;
        const sub = real ? (n.name + ' · v' + (real.version || '—')) : (n.name + ' · ' + n.cn);

        pick(mesh, { kind: 'ne', id: real ? real.id : n.id, label: labelName, code: n.name, element: real || null });
        this.addLabel(mesh, labelName, sub, n.shape === 'cube' ? 0.18 : 0.155, 0.85, {
          big: 46, small: 24, tick: '#a67d48',
        });

        this.link([gx, BASE_Y + size * 0.5, gz], [mx, my - 0.10, mz], { fromId: b.id, toId: real ? real.id : n.id });
      });
    });

    // LCM 沙漏
    {
      const lx = COLX[2] + 0.86;
      const lz = ROWZ + 0.26;
      const { grp, height } = this.hourglass(0.24);
      grp.position.set(lx, BASE_Y + 0.12, lz);
      this.root.add(grp);
      this.contact(lx, lz, 0.52, 0.55);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.20, height, 12, 1, true),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.raycast = () => {};
      hit.userData = { kind: 'lcm', id: 'lcm-hourglass', label: 'LCM' };
      hit.position.copy(grp.position);
      this.root.add(hit);
      this.nodes.push(hit);

      this.addLabel(grp, 'LCM', '生命周期 · 版本沙漏', height * 0.66, 0.9, {
        big: 54, small: 24, tick: '#a67d48',
      });
      this.lcmGrp = grp;
    }

    // 相机：按画布宽高比装下整排
    const target = new THREE.Vector3(0.34, BASE_Y + 0.46, 0.02);
    const aspect = this.camera.aspect || 2.1;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfW = 1.72;
    const dist = halfW / Math.tan(hFov / 2) * 1.14;   // 留 14% 余量，别让标签切边
    const dir = new THREE.Vector3(0.26, 0.50, 1).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.select(this.selected || null);
  }

  /* ------------------------------------------------------------- 选中 */
  select(id) {
    if (!this.nodes) return;
    this.selected = id;
    const near = new Set([id]);
    (this.links || []).forEach((l) => { if (l.from === id) near.add(l.to); if (l.to === id) near.add(l.from); });
    const none = !id;
    this.nodes.forEach((o) => {
      const oid = (o.userData || {}).id;
      const isSel = oid === id;
      const on = near.has(oid);
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        const mm = c.material;
        if (Array.isArray(mm)) return;
        if (mm.emissive && !mm.emissiveMap && mm.__kind !== 'data') {
          mm.emissive.setHex(isSel ? 0x6b4a1f : 0x000000);
          mm.emissiveIntensity = isSel ? 0.22 : 0;
        }
        if (mm.transparent && mm.opacity > 0.1) {
          if (mm.__baseOp === undefined) mm.__baseOp = mm.opacity;
          mm.opacity = none ? mm.__baseOp : (on ? mm.__baseOp : mm.__baseOp * 0.55);
        }
      });
    });
    (this.links || []).forEach((l) => {
      const hit = l.from === id || l.to === id;
      l.mesh.material.opacity = none ? 0.55 : (hit ? 0.95 : 0.18);
      l.mesh.material.color.setHex(hit && !none ? 0xa67d48 : 0xa9a094);
      l.dot.material.opacity = none ? 0.9 : (hit ? 1 : 0.15);
      l.dot.visible = none || hit;
    });
  }

  /* ------------------------------------------------------------- 拾取 */
  bindPick() {
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2(-2, -2);
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });
    const pick = () => {
      if (!this.nodes) return null;
      this.ray.setFromCamera(this.ptr, this.camera);
      const hits = this.ray.intersectObjects(this.nodes, true);
      if (!hits.length) return null;
      const resolve = (h) => {
        let o = h.object;
        while (o && !(o.userData && o.userData.kind)) o = o.parent;
        return o;
      };
      for (const h of hits) {
        const o = resolve(h);
        if (o && (o.userData.kind === 'ne' || o.userData.kind === 'base' || o.userData.kind === 'lcm')) return o;
      }
      return resolve(hits[0]) || null;
    };
    el.addEventListener('click', () => {
      const o = pick();
      if (!o) return;
      this.select(o.userData.id);
      if (this.onPick) this.onPick(o.userData.id, o.userData);
    });
    el.addEventListener('dblclick', () => {
      const o = pick();
      if (!o) return;
      this.select(o.userData.id);
      if (this.onDrill) this.onDrill(o.userData.kind, o.userData.id);
    });
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    this.labels.forEach((l) => { if (l.parent) l.quaternion.copy(this.camera.quaternion); });
    const now = (performance.now() / 3000);
    if (this.links && this.links.length) {
      this.links.forEach((l) => {
        const e = ((now + l.phase) % 1);
        l.dot.position.lerpVectors(l.a, l.b, e);
        l.dot.material.opacity = 0.25 + Math.sin(e * Math.PI) * 0.75;
      });
    }
    if (this.lcmGrp) this.lcmGrp.rotation.y += 0.0035;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.host.clientWidth || 880;
    const h = this.host.clientHeight || 430;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

window.PlaneTopo3D = {
  mount(host, state, onPick, onDrill) {
    if (rig && !host.contains(rig.renderer.domElement)) { rig.dispose(); rig = null; }
    if (rig) { rig.state = state; rig.onPick = onPick; rig.onDrill = onDrill; window.__topoRig = rig; return rig; }
    rig = new Topo3D(host, state, onPick, onDrill);
    window.__topoRig = rig;
    return rig;
  },
  select(id) { if (rig) rig.select(id); },
  unmount() { if (rig) { rig.dispose(); rig = null; } },
  rebuild() { if (rig) rig.build(); },
};

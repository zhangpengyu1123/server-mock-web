/* ============================================================================
   RHINE LAB · 业务面 3D 拓扑（v4 · 5GC 网元几何）
   ----------------------------------------------------------------------------
   设计口径（按需求重写）：
     · 只管"网元"，不再画站点/机架/托盘这些非网元设备
     · 每个"同组网元"有且只有一个底座网元；同组业务网元全部挂在这个底座上
     · 底座网元三种：CSP / CGP / CSPEdge，都是正方体
         CSP     玻璃材质
         CGP     金属材质
         CSPEdge 信息数码体（自发光 + 数字纹理 + 线框）
       三者底部 1/4 用黄条包裹，黄条上写 BASE
     · 其他网元用圆柱 / 三棱锥 / 四棱锥 / 正方体，材质各异
     · 另设 LCM 几何示例体：上下两个四棱锥对接成沙漏
   交互：点选高亮同组 / 双击下钻 / 拖拽旋转缩放
   ==========================================================================*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PAL = {
  paper: 0xe9e4de,
  ink: 0x171713,
  amber: 0xb8853f,
  base: 0xf2c437,          // 底座黄条
  glass: 0xbfe4ef,
  metal: 0xc9c1b0,
  data: 0x16232b,
  soft: 0xd8d2c8,
};

/* 环境贴图：一条竖向渐变当"反射天光"，金属/玻璃才有质感（无需外部 HDR） */
function envTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0.00, '#ffffff');
  grd.addColorStop(0.42, '#e4dcd1');
  grd.addColorStop(0.70, '#a89f92');
  grd.addColorStop(1.00, '#5d5850');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 32);
  // 顶部一块亮斑，金属表面会出现一条高光带
  g.fillStyle = 'rgba(255,252,244,.9)';
  g.beginPath();
  g.ellipse(18, 7, 12, 5, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 事件文本贴图：数字流（CSPEdge 的"信息数码体"） */
function digitTexture(seed) {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d181e';
  g.fillRect(0, 0, W, H);
  g.font = '600 15px "JetBrains Mono",ui-monospace,monospace';
  let s = seed || 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 10; y < H; y += 17) {
    for (let x = 6; x < W; x += 30) {
      const v = Math.floor(rnd() * 256).toString(16).padStart(2, '0').toUpperCase();
      g.fillStyle = rnd() > 0.62 ? 'rgba(120,235,214,.95)' : 'rgba(120,235,214,.30)';
      g.fillText(v, x, y);
    }
  }
  g.strokeStyle = 'rgba(120,235,214,.20)';
  g.lineWidth = 1;
  for (let y = 0; y < H; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 黄条贴图：写 BASE（四面环绕） */
function baseBandTexture() {
  const W = 512, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2c437';
  g.fillRect(0, 0, W, H);
  // 斜纹
  g.strokeStyle = 'rgba(23,23,19,.12)';
  g.lineWidth = 10;
  for (let x = -H; x < W + H; x += 34) {
    g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke();
  }
  g.fillStyle = '#171713';
  g.font = '700 58px "JetBrains Mono",ui-monospace,monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText('BASE', W * 0.5, H * 0.52);
  // 两侧细刻度
  g.fillStyle = 'rgba(23,23,19,.55)';
  for (let i = 0; i < 8; i++) { g.fillRect(26, 24 + i * 11, 18, 3); g.fillRect(W - 44, 24 + i * 11, 18, 3); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* 文字标签（billboard） */
function labelTexture(title, sub, opts) {
  opts = opts || {};
  const W = 512, H = 168;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  if (opts.tick) { g.fillStyle = opts.tick; g.fillRect(0, 26, 5, H - 52); }
  g.fillStyle = opts.ink || '#171713';
  g.font = '600 ' + (opts.big || 56) + 'px "JetBrains Mono","PingFang SC","Microsoft YaHei",monospace';
  let text = String(title || '');
  while (g.measureText(text).width > W - 54 && text.length > 2) text = text.slice(0, -2) + '…';
  g.fillText(text, 20, opts.sub ? H * 0.40 : H * 0.52);
  if (sub) {
    g.fillStyle = 'rgba(23,23,19,.55)';
    g.font = '500 ' + (opts.small || 30) + 'px "JetBrains Mono","PingFang SC",monospace';
    let s = String(sub);
    while (g.measureText(s).width > W - 54 && s.length > 2) s = s.slice(0, -2) + '…';
    g.fillText(s, 20, H * 0.74);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: W / H };
}

// 单例：宿主容器被重建时销毁旧实例
let rig = null;

/* ---------------------------------------------------------------- 5GC 目录 */
/* 底座网元：同组唯一，三种形状都是正方体，仅材质不同 */
const BASES = [
  { id: 'base-CSP', name: 'CSP', shape: 'cube', material: 'glass', group: 'grp-1', cn: '云服务平台' },
  { id: 'base-CGP', name: 'CGP', shape: 'cube', material: 'metal', group: 'grp-2', cn: '云网关平台' },
  { id: 'base-CSPEdge', name: 'CSPEdge', shape: 'cube', material: 'data', group: 'grp-3', cn: '边缘平台' },
];

/* 业务网元：全部挂在各自的底座上（同组只有 1 个底座） */
const NFS = [
  { id: 'nf-amf', name: 'AMF', shape: 'cyl', material: 'metal', g: 'grp-1', cn: '接入与移动性管理' },
  { id: 'nf-ausf', name: 'AUSF', shape: 'tri', material: 'glass', g: 'grp-1', cn: '鉴权服务器' },
  { id: 'nf-udm', name: 'UDM', shape: 'quad', material: 'soft', g: 'grp-1', cn: '统一数据管理' },
  { id: 'nf-smf', name: 'SMF', shape: 'cyl', material: 'glass', g: 'grp-2', cn: '会话管理' },
  { id: 'nf-pcf', name: 'PCF', shape: 'cube', material: 'metal', g: 'grp-2', cn: '策略控制' },
  { id: 'nf-nrf', name: 'NRF', shape: 'tri', material: 'metal', g: 'grp-2', cn: '网络存储' },
  { id: 'nf-upf', name: 'UPF', shape: 'quad', material: 'metal', g: 'grp-3', cn: '用户平面' },
  { id: 'nf-nssf', name: 'NSSF', shape: 'cyl', material: 'soft', g: 'grp-3', cn: '网络切片选择' },
];

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
    this.scene.fog = new THREE.FogExp2(PAL.paper, 0.016);

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 80);
    this.camera.position.set(3.3, 3.0, 4.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 11;
    this.controls.minPolarAngle = Math.PI * 0.10;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minAzimuthAngle = -Math.PI * 0.55;
    this.controls.maxAzimuthAngle = Math.PI * 0.55;
    this.controls.enablePan = false;

    this.env = envTexture();
    this.scene.environment = this.env;

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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c4, 1.05));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(-3.4, 5.6, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    key.shadow.bias = -0.0009;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9a8, 0.6);
    rim.position.set(3.8, 2.4, -3.6);
    this.scene.add(rim);
  }

  /* 平面：细网格，说明"这些东西悬浮在平面上" */
  floor() {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0xece7e0, roughness: 0.95, metalness: 0 })
    );
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.scene.add(f);

    const grid = new THREE.GridHelper(24, 24, 0xc7bfb2, 0xd9d2c7);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.scene.add(grid);
  }

  /* ------------------------------------------------------------- 材质 */
  material(kind) {
    if (kind === 'glass') {
      return new THREE.MeshPhysicalMaterial({
        color: PAL.glass, metalness: 0, roughness: 0.05,
        transmission: 0.86, thickness: 0.55, ior: 1.46,
        transparent: true, opacity: 0.62,
        clearcoat: 1, clearcoatRoughness: 0.04,
        envMapIntensity: 1.5, side: THREE.DoubleSide,
        attenuationColor: new THREE.Color(0x9fd2e2), attenuationDistance: 1.2,
      });
    }
    if (kind === 'metal') {
      return new THREE.MeshStandardMaterial({
        color: PAL.metal, metalness: 0.96, roughness: 0.24,
        envMapIntensity: 1.35,
        emissive: 0x120f0b, emissiveIntensity: 0.5,
      });
    }
    if (kind === 'data') {
      const tex = digitTexture(11);
      return new THREE.MeshStandardMaterial({
        color: PAL.data, metalness: 0.5, roughness: 0.35,
        map: tex, emissiveMap: tex, emissive: 0x7de8cf, emissiveIntensity: 0.55,
        envMapIntensity: 0.8,
      });
    }
    // soft：哑光陶土
    return new THREE.MeshStandardMaterial({ color: PAL.soft, metalness: 0.1, roughness: 0.78, envMapIntensity: 0.6 });
  }

  /* ------------------------------------------------------------- 几何体 */
  solid(shape, size) {
    const s = size || 0.22;
    if (shape === 'cyl') return new THREE.CylinderGeometry(s * 0.52, s * 0.52, s * 1.5, 28);
    if (shape === 'tri') return new THREE.ConeGeometry(s * 0.72, s * 1.5, 3);
    if (shape === 'quad') {
      const g = new THREE.ConeGeometry(s * 0.74, s * 1.5, 4, 1);
      g.rotateY(Math.PI / 4);
      return g;
    }
    return new THREE.BoxGeometry(s, s, s);
  }

  /** 底座正方体 + 底部 1/4 黄条（BASE）+ 材质 */
  baseCube(base, size) {
    const grp = new THREE.Group();
    const S = size || 0.66;
    const core = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), this.material(base.material));
    core.castShadow = true;
    core.receiveShadow = true;
    grp.add(core);

    // 黄条：正好包住底部 1/4
    const bandH = S / 4;
    const bandTex = baseBandTexture();
    const bandSide = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: bandTex, roughness: 0.55, metalness: 0.05,
    });
    const bandTop = new THREE.MeshStandardMaterial({ color: PAL.base, roughness: 0.55, metalness: 0.05 });
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(S * 1.012, bandH, S * 1.012),
      [bandSide, bandSide, bandTop, bandTop, bandSide, bandSide]
    );
    band.position.y = -S / 2 + bandH / 2;
    band.castShadow = true;
    band.receiveShadow = true;
    grp.add(band);

    // 数码体/玻璃体加一圈细线框，轮廓更清楚
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(S, S, S)),
      new THREE.LineBasicMaterial({
        color: base.material === 'data' ? 0x7de8cf : 0x8b8478,
        transparent: true,
        opacity: base.material === 'data' ? 0.75 : 0.45,
      })
    );
    edges.raycast = () => {};
    grp.add(edges);
    return { grp, core, edges, size: S, bandH };
  }

  /** LCM 沙漏：上下两个四棱锥对接 */
  hourglass(size) {
    const grp = new THREE.Group();
    const S = size || 0.34;
    const H = S * 1.9;
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xe3c063, metalness: 0.85, roughness: 0.28,
      envMapIntensity: 1.3, emissive: 0x2a1e08, emissiveIntensity: 0.5,
    });
    const lower = new THREE.Mesh(new THREE.ConeGeometry(S * 0.72, H / 2, 4, 1), m);
    lower.geometry.rotateY(Math.PI / 4);
    lower.position.y = -H / 4 + 0.012;   // 两个锥体在中缝略微咬合，避免看起来断开
    const upper = new THREE.Mesh(new THREE.ConeGeometry(S * 0.72, H / 2, 4, 1), m);
    upper.geometry.rotateY(Math.PI / 4);
    upper.rotation.x = Math.PI;
    upper.position.y = H / 4 - 0.012;
    [lower, upper].forEach((o) => { o.castShadow = true; o.receiveShadow = true; grp.add(o); });
    // 中缝光带
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(S * 0.17, 0.010, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffc35c, emissiveIntensity: 1.6, roughness: 0.4 })
    );
    seam.rotation.x = Math.PI / 2;
    seam.raycast = () => {};
    grp.add(seam);
    return { grp, size: S, height: H };
  }

  /* ------------------------------------------------------------- 标签 */
  addLabel(parent, title, sub, y, scale, opts) {
    const { tex, aspect } = labelTexture(title, sub, opts);
    const hh = 0.15 * (scale || 1);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(hh * aspect, hh),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    m.position.set(0, y, 0);
    m.renderOrder = 6;
    parent.add(m);
    this.labels.push(m);
    return m;
  }

  /* ------------------------------------------------------------- 连线 */
  link(from, to, opts) {
    opts = opts || {};
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) return;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(opts.r || 0.005, opts.r || 0.005, len, 6, 1, true),
      new THREE.MeshStandardMaterial({
        color: opts.color || 0xb8a893, emissive: opts.color || 0xb8a893,
        emissiveIntensity: 0.5, transparent: true, opacity: 0.75, roughness: 0.4,
      })
    );
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);

    // 上行的数据光点（业务网元 → 底座，反向也走）
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffc978, emissiveIntensity: 2.2, roughness: 0.4 })
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

    const BASE_Y = 0.72;                 // 底座中心高度（悬浮在平面之上）
    const BASE_S = 0.80;
    const NF_Y = BASE_Y + 0.76;          // 业务网元挂载高度（贴着底座顶面）
    const COLX = [-1.30, 0, 1.30];       // 三个同组沿 x 排开
    const ROWZ = 0.0;

    // 把真实网元按组分配到业务网元槽位（有数据就显示真实名字/版本）
    const byGroup = {};
    els.forEach((e) => { const g = e.group || 'grp-1'; (byGroup[g] = byGroup[g] || []).push(e); });
    let realIdx = 0;

    BASES.forEach((b, gi) => {
      const gx = COLX[gi];
      const gz = ROWZ;
      const { grp, core, size } = this.baseCube(b, BASE_S);
      grp.position.set(gx, BASE_Y, gz);
      this.root.add(grp);

      const groupIds = Object.keys(byGroup);
      const boundHere = byGroup[groupIds[gi] || ('grp-' + (gi + 1))] || [];
      const total = boundHere.length;

      // 底座本体可点（业务网元点击走各自的绑定网元）
      pick(core, { kind: 'base', id: b.id, label: b.name, base: b.name, group: b.group });
      this.addLabel(grp, b.name, 'BASE · ' + b.cn + (total ? ' · ' + total + ' NE' : ''), -size * 0.86, 1.25, {
        big: 60, small: 28, tick: '#b8853f',
      });

      // 同组地环：一个细椭圆环，标出"这一组的范围"（不是设备，只是分组提示）
      {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.82, 0.87, 64),
          new THREE.MeshBasicMaterial({ color: 0xc0b6a4, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(gx, 0.012, gz + 0.02);
        ring.raycast = () => {};
        this.root.add(ring);
        const dash = new THREE.Mesh(
          new THREE.RingGeometry(0.867, 0.880, 64),
          new THREE.MeshBasicMaterial({ color: 0xb8853f, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(gx, 0.013, gz + 0.02);
        dash.raycast = () => {};
        this.root.add(dash);
      }

      // 同组业务网元：在底座上方呈扇形展开（全部挂在这一个底座上）
      const members = NFS.filter((n) => n.g === b.group);
      const span = Math.PI * 0.70;
      members.forEach((n, i) => {
        const t = members.length === 1 ? 0.5 : i / (members.length - 1);
        const ang = -span / 2 + span * t;
        const r = 0.56;
        const mx = gx + Math.sin(ang) * r;
        const mz = gz + Math.cos(ang) * r * 0.48 - 0.02;
        const my = NF_Y + (i % 2 ? 0.10 : 0);

        const geo = this.solid(n.shape, n.shape === 'cube' ? 0.34 : 0.30);
        const mesh = new THREE.Mesh(geo, this.material(n.material));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(mx, my, mz);
        mesh.rotation.y = ang * 0.6;
        this.root.add(mesh);

        // 边缘线：几何体轮廓更清晰
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 24),
          new THREE.LineBasicMaterial({ color: 0x6f6a60, transparent: true, opacity: 0.28 })
        );
        edges.raycast = () => {};
        mesh.add(edges);

        const real = els[realIdx % Math.max(1, els.length)] || null;
        if (real) realIdx += 1;
        const labelName = real ? real.name : n.name;
        const sub = real ? (n.name + ' · v' + (real.version || '—')) : (n.name + ' · ' + n.cn);

        pick(mesh, {
          kind: 'ne',
          id: real ? real.id : n.id,
          label: labelName,
          code: n.name,
          element: real || null,
        });
        this.addLabel(mesh, labelName, sub, n.shape === 'cube' ? 0.30 : 0.26, 1.0, {
          big: 46, small: 24, tick: '#b8853f',
        });

        // 挂载关系：底座 → 业务网元
        this.link([gx, BASE_Y + size * 0.5, gz], [mx, my - 0.14, mz], {
          fromId: b.id, toId: real ? real.id : n.id, r: 0.004,
        });
      });
    });

    // LCM 几何示例体：沙漏，放在右侧，说明"LCM 只管版本生命周期"
    {
      const lx = COLX[2] + 1.16;
      const lz = ROWZ + 0.42;
      const { grp, height } = this.hourglass(0.34);
      grp.position.set(lx, BASE_Y + 0.28, lz);
      this.root.add(grp);
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.30, 0.30, height, 12, 1, true),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.raycast = () => {};
      hit.userData = { kind: 'lcm', id: 'lcm-hourglass', label: 'LCM' };
      this.root.add(hit);
      hit.position.copy(grp.position);
      this.nodes.push(hit);
      this.addLabel(grp, 'LCM', '生命周期 · 版本沙漏', height * 0.62, 0.95, {
        big: 56, small: 26, tick: '#b8853f',
      });
      this.lcmGrp = grp;
    }

    this.controls.target.set(0.42, BASE_Y + 0.34, 0.12);
    this.camera.position.set(1.42, BASE_Y + 2.44, 4.02);
    this.camera.lookAt(this.controls.target);
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
        if (mm.emissive && !mm.emissiveMap) {
          if (isSel) { mm.emissive.setHex(0x6b4a1f); mm.emissiveIntensity = 0.55; }
          else { mm.emissive.setHex(mm.__em || 0x000000); mm.emissiveIntensity = mm.__emi || 0; }
        }
        if (mm.transparent && mm.opacity > 0.05) mm.opacity = none ? (mm.__op || mm.opacity) : (on ? 1 : 0.45);
      });
    });
    (this.links || []).forEach((l) => {
      const hit = l.from === id || l.to === id;
      l.mesh.material.color.setHex(none ? 0xb8a893 : (hit ? 0xe6b26a : 0xa9a29a));
      l.mesh.material.emissiveIntensity = none ? 0.5 : (hit ? 1.8 : 0.12);
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
        l.dot.material.emissiveIntensity = 0.8 + Math.sin(e * Math.PI) * 1.8;
      });
    }
    // 沙漏缓慢自转，提示它是"示例体"
    if (this.lcmGrp) this.lcmGrp.rotation.y += 0.004;
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

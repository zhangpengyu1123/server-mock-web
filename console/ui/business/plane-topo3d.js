/* ============================================================================
   RHINE LAB · 3D 拓扑（v3 · Blender 资产）
   ----------------------------------------------------------------------------
   资产来自 console/assets/blender/topo_assets_v1.py（米白档案质感 + 琥珀光条）：
     topo_site.glb  站点平台（1.62 × 1.18，凹槽/短脚/前缘光条/四角刻线）
     topo_group.glb 网元组托板（2.10 × 0.72，3 条卡槽）
     topo_ne.glb    网元模块（立卡 0.36 × 0.48，标签凹槽 + 顶缘光带 + 散热筋）
     topo_comp.glb  组件芯片（0.22，琥珀条与缺口）
   交互：点选高亮邻接 / 双击下钻（element→component） / 拖拽旋转缩放
   资产加载失败时回退程序化方块，保证不白屏。
   ==========================================================================*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const C = { paper: 0xeae5e1, ink: 0x171713, amber: 0xa67d48, sand: 0xc1b8a7, muted: 0x8e897b };
const ASSETS = './assets/';

let rig = null;

function labelTexture(title, sub, opts) {
  opts = opts || {};
  const W = 512, H = 160;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.fillStyle = '#171713';
  g.font = '600 ' + (opts.big || 60) + 'px "JetBrains Mono","PingFang SC","Microsoft YaHei",monospace';
  let text = String(title || '');
  while (g.measureText(text).width > W - 40 && text.length > 3) text = text.slice(0, -2) + '…';
  g.fillText(text, 18, opts.sub ? H * 0.40 : H * 0.52);
  if (sub) {
    g.fillStyle = 'rgba(23,23,19,.55)';
    g.font = '500 ' + (opts.small || 32) + 'px "JetBrains Mono","PingFang SC",monospace';
    g.fillText(String(sub), 18, H * 0.75);
  }
  if (opts.tick) { g.fillStyle = opts.tick; g.fillRect(0, 4, 6, H - 8); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: W / H };
}

/* 卡面铭牌贴图：名称 + 版本 + 编号（贴在 Blender 的 MAT_TopoPlate 面上） */
function nameplateTexture(name, version, code) {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#171713';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(234,229,225,.30)';
  g.lineWidth = 2;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#a67d48';
  g.fillRect(20, 20, 6, 34);
  g.fillStyle = 'rgba(234,229,225,.50)';
  g.font = '500 24px "JetBrains Mono",monospace';
  g.fillText(String(code || ''), 34, 46);
  g.fillStyle = '#eae5e1';
  g.font = '600 58px "JetBrains Mono","PingFang SC",monospace';
  let nm = String(name || '');
  while (g.measureText(nm).width > W - 60 && nm.length > 4) nm = nm.slice(0, -2) + '…';
  g.fillText(nm, 30, 132);
  g.fillStyle = '#a67d48';
  g.font = '600 40px "JetBrains Mono",monospace';
  g.fillText('v' + String(version || ''), 30, 200);
  g.fillStyle = 'rgba(234,229,225,.25)';
  for (let i = 0; i < 7; i++) g.fillRect(W - 150 + i * 16, 184, 8, 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const MAT = {};
function mat(color, rough) {
  const k = 'm' + color + rough;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color, roughness: rough });
  return MAT[k];
}
function glow(color, intensity) {
  const k = 'g' + color + intensity;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.42 });
  return MAT[k];
}

class Topo3D {
  constructor(host, state, onPick, onDrill) {
    this.host = host;
    this.state = state;
    this.onPick = onPick;
    this.onDrill = onDrill;

    const w = host.clientWidth || 880;
    const h = host.clientHeight || 430;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.paper);
    this.scene.fog = new THREE.FogExp2(C.paper, 0.030);

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 80);
    this.camera.position.set(2.6, 2.3, 3.0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 9;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.40;
    this.controls.minAzimuthAngle = -Math.PI * 0.45;
    this.controls.maxAzimuthAngle = Math.PI * 0.45;
    this.controls.enablePan = false;

    this.lights();
    this.floor();
    this.labels = [];
    this.links = [];
    this.models = null;
    this.loader = new GLTFLoader();
    // 加载态骨架：资产下载完成前给可读反馈
    this.skeleton = document.createElement('div');
    this.skeleton.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:rgba(234,229,225,.92);z-index:2;font:600 9px "JetBrains Mono",monospace;letter-spacing:.22em;color:rgba(23,23,19,.55)';
    this.skeleton.innerHTML = '<div>T O P O L O G Y &nbsp; L O A D I N G</div><div style="width:120px;height:1px;background:rgba(23,23,19,.18);overflow:hidden"><i style="display:block;width:40%;height:1px;background:#a67d48;animation:rhineLoad 1.1s ease-in-out infinite"></i></div><style>@keyframes rhineLoad{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}</style>';
    host.appendChild(this.skeleton);
    const done = () => {
      if (this.skeleton && this.skeleton.parentNode) this.skeleton.remove();
      this.skeleton = null;
      this.build();
    };
    this.loadModels().then(done).catch(() => {
      if (this.skeleton) this.skeleton.innerHTML = '<div>ASSET FALLBACK</div><div style="font-size:8px;opacity:.6">资产加载失败，使用程序化几何</div>';
      setTimeout(done, 600);
    });
    this.bindPick();
    this.loop();
  }

  lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, C.sand, 1.0));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.85);
    key.position.set(-3.2, 5.2, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9a8, 0.55);
    rim.position.set(3.6, 2.6, -3.2);
    this.scene.add(rim);
    this.bounce = new THREE.PointLight(0xffbf78, 1.1, 5, 2);
    this.bounce.position.set(0, 0.32, 1.2);
    this.scene.add(this.bounce);
  }

  floor() {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0xe8e3dc, roughness: 0.94 }));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.scene.add(f);
  }

  async loadModels() {
    const l = (n) => new Promise((res, rej) => this.loader.load(ASSETS + n + '.glb?v=' + Date.now(), res, undefined, rej));
    const names = ['site', 'group', 'ne', 'comp', 'comp_ctrl', 'comp_switch', 'comp_service', 'comp_power', 'comp_fan'];
    const loaded = await Promise.all(names.map((n) => l('topo_' + n).catch(() => null)));
    this.models = {};
    names.forEach((n, i) => { if (loaded[i]) this.models[n] = loaded[i]; });
  }

  /** 组件名映射到资产：主控/交换/业务/电源/风扇，其余用通用芯片 */
  compKind(name) {
    const s = String(name || '');
    if (/主控|ctrl|control/i.test(s)) return 'comp_ctrl';
    if (/交换|switch/i.test(s)) return 'comp_switch';
    if (/业务|service|业务板/i.test(s)) return 'comp_service';
    if (/电源|power|psu/i.test(s)) return 'comp_power';
    if (/风扇|fan/i.test(s)) return 'comp_fan';
    return 'comp';
  }

  inst(kind) {
    if (this.models && !this.models[kind]) kind = 'comp';
    if (!this.models) return null;
    const o = this.models[kind].scene.clone(true);
    o.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.material = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
      }
    });
    return o;
  }

  /** 卡面铭牌：以 MAT_TopoPlate 面的网格为父级，前后各贴一张（不依赖 UV 朝向） */
  paintNameplate(mod, name, version, code) {
    const tex = nameplateTexture(name, version, code);
    let count = 0;
    mod.traverse((c) => {
      if (!c.isMesh) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const plateIdx = mats.findIndex((m) => /TopoPlate/i.test(m.name || ''));
      if (plateIdx < 0) return;
      // 该网格的包围盒 → 取最薄的轴作为法线方向
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      const size = bb.getSize(new THREE.Vector3());
      const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => a[1] - b[1]);
      const thin = axes[0][0];                 // 最薄轴 = 面法线方向
      const faceAxes = axes.slice(1);          // 面内两轴（升序）
      const big = faceAxes[1], small = faceAxes[0];
      const w = big[1] * 0.94;                 // 宽 = 较长轴
      const h = small[1] * 0.94;               // 高 = 较短轴
      const flip = big[0] === 'y';             // 若长轴是 y，需要把平面转 90°
      const off = axes[0][1] / 2 + 0.0015;
      const center = bb.getCenter(new THREE.Vector3());

      [1, -1].forEach((sign) => {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })
        );
        plane.position.copy(center);
        if (thin === 'x') { plane.position.x += sign * off; plane.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; if (flip) plane.rotation.z = Math.PI / 2; }
        else if (thin === 'y') { plane.position.y += sign * off; plane.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2; if (flip) plane.rotation.z = Math.PI / 2; }
        else { plane.position.z += sign * off; if (sign < 0) plane.rotation.y = Math.PI; if (flip) plane.rotation.z = Math.PI / 2; }
        plane.renderOrder = 7;
        c.add(plane);
        count++;
      });
    });
    return count;
  }

  /* 程序化回退 */
  plate(w, t, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat(color || 0xe6e1d9, 0.62));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  card(w, h, t) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat(0xdfd8ce, 0.6));
    m.castShadow = true; m.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.012, t + 0.002), glow(C.amber, 1.7));
    band.position.y = h / 2 - 0.022;
    m.add(band);
    return m;
  }

  addLabel(parent, title, sub, y, scale, opts) {
    const { tex, aspect } = labelTexture(title, sub, opts);
    const hh = 0.16 * (scale || 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(hh * aspect, hh),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(0, y, 0);
    m.renderOrder = 5;
    parent.add(m);
    this.labels.push(m);
    return m;
  }

  linkOneshot(a, b) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return null;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6, 1, true), glow(C.amber, 0.95));
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);
    return m;
  }

  edge(idA, idB) {
    const a = this.anchorOf(idA), b = this.anchorOf(idB);
    const m = this.linkOneshot(a, b);
    if (!m) return;
    // 流光：沿线往复的小光点
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), glow(0xffc978, 2.6));
    dot.position.set(a[0], a[1], a[2]);
    this.root.add(dot);
    this.links.push({ from: idA, to: idB, mesh: m, dot, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), phase: Math.random() });
  }

  anchorOf(id) {
    const n = (this.nodes || []).find((o) => o.userData && o.userData.id === id);
    if (!n) return [0, 0.7, 0];
    return [n.position.x, n.position.y + 0.1, n.position.z];
  }

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

    const st = this.state;
    const lvl = st.topoLevel || 'element';
    const Y = 0.62;
    const addPick = (obj, data) => { obj.userData = Object.assign({}, data); this.nodes.push(obj); };

    if (lvl === 'component') {
      const ne = st.elements.find((e) => e.id === st.topoSel) || st.elements[0];
      const base = this.inst('site') || this.plate(3.0, 0.06, 3.0);
      base.scale.setScalar(1.15);
      base.position.set(0, Y - 0.05, 0);
      this.root.add(base);

      const mod = this.inst('ne') || this.card(0.78, 0.5, 0.035);
      mod.position.set(0, Y, 0);
      if (this.models) mod.scale.setScalar(1.55);
      if (this.models) this.paintNameplate(mod, ne.name, ne.version, ne.id.toUpperCase());
      this.root.add(mod);
      addPick(mod, { kind: 'ne', id: ne.id, label: ne.name });
      this.addLabel(mod, ne.name, ne.type + ' · v' + ne.version, this.models ? 0.86 : 0.35, 1.15, { big: 46, small: 26, tick: '#a67d48' });

      const comps = ne.comps || [];
      comps.forEach((name, i) => {
        const ang = (i / comps.length) * Math.PI * 2 - Math.PI / 2;
        const r = 0.92;
        const chip = this.inst(this.compKind(name)) || new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(0xd8d1c7, 0.55));
        chip.position.set(Math.cos(ang) * r, Y + 0.02, Math.sin(ang) * r); chip.scale.setScalar(1.5);
        chip.rotation.y = -ang + Math.PI / 2;
        this.root.add(chip);
        addPick(chip, { kind: 'comp', id: ne.id + ':' + name, label: name });
        this.addLabel(chip, name, 'COMPONENT', 0.20, 0.85, { big: 44, small: 24 });
        this.edge(ne.id, ne.id + ':' + name);
      });

      this.controls.target.set(0, Y + 0.10, 0);
      this.camera.position.set(2.9, Y + 2.45, 3.15);
      return;
    }

    // 组视角：站点板在后，选中的组居中，组内网元弧形展开
    if (lvl === 'group') {
      const g = st.groups.find((x) => x.id === st.topoSel) || st.groups[0];
      const siteB = this.inst('site') || this.plate(1.55, 0.08, 1.05, 0xeae5e1);
      siteB.scale.setScalar(0.85);
      siteB.position.set(0, Y, -1.30);
      this.root.add(siteB);
      addPick(siteB, { kind: 'site', id: 'site', label: st.site.name });
      this.addLabel(siteB, st.site.name, 'SITE', 0.26, 0.9, { big: 44, small: 24, tick: '#a67d48' });

      if (g) {
        const tray = this.inst('group') || this.plate(2.05, 0.07, 0.66, 0xe6e1d9);
        tray.position.set(0, Y, 0);
        this.root.add(tray);
        addPick(tray, { kind: 'group', id: g.id, label: g.name });
        this.addLabel(tray, g.name, 'GROUP · ' + g.elements.length + ' NE', 0.30, 1.0, { big: 42, small: 22 });
        this.edge('site', g.id);

        const members = g.elements.map((id) => st.elements.find((e) => e.id === id)).filter(Boolean);
        members.forEach((e, i) => {
          const n = members.length;
          const span = 1.25;
          const x = n === 1 ? 0 : -span / 2 + (span / (n - 1)) * i;
          const mod = this.inst('ne') || this.card(0.34, 0.46, 0.03);
          mod.position.set(x, Y + 0.05, 0.02);
          mod.scale.setScalar(1.15);
          this.root.add(mod);
          addPick(mod, { kind: 'ne', id: e.id, label: e.name });
          if (this.models) this.paintNameplate(mod, e.name, e.version, e.id.toUpperCase());
          this.addLabel(mod, e.name, e.type + ' · v' + e.version, this.models ? 0.58 : 0.34, 1.0,
            { big: 42, small: 22, tick: /5\.2\.1/.test(e.version) ? '#a67d48' : null });
          this.edge(g.id, e.id);
        });
      }
      // 其他组：后排小托盘，可点切换焦点
      const others = st.groups.filter((x) => !g || x.id !== g.id);
      others.forEach((og, i) => {
        const tray = this.inst('group') || this.plate(1.2, 0.06, 0.4, 0xe6e1d9);
        tray.scale.setScalar(0.55);
        tray.position.set(-1.5 + i * 1.5, Y - 0.02, -2.15);
        this.root.add(tray);
        addPick(tray, { kind: 'group', id: og.id, label: og.name });
        this.addLabel(tray, og.name, og.elements.length + ' NE', 0.20, 0.8, { big: 44, small: 24 });
      });

      this.controls.target.set(0, Y + 0.12, -0.15);
      this.camera.position.set(2.6, Y + 2.1, 2.9);
      return;
    }

    const site = this.inst('site') || this.plate(1.55, 0.08, 1.05, 0xeae5e1);
    site.position.set(0, Y, 0.95);
    this.root.add(site);
    addPick(site, { kind: 'site', id: 'site', label: st.site.name });
    this.addLabel(site, st.site.name, 'SITE · ' + st.site.role, 0.30, 1.05, { big: 44, small: 24, tick: '#a67d48' });

    st.groups.forEach((g, gi) => {
      const gz = -0.25 - gi * 1.45;
      const tray = this.inst('group') || this.plate(2.05, 0.07, 0.66, 0xe6e1d9);
      tray.position.set(0, Y, gz);
      this.root.add(tray);
      addPick(tray, { kind: 'group', id: g.id, label: g.name });
      this.addLabel(tray, g.name, 'GROUP · ' + g.elements.length + ' NE', 0.30, 0.95, { big: 42, small: 22 });
      this.edge('site', g.id);

      g.elements.forEach((eid, ei) => {
        const e = st.elements.find((x) => x.id === eid);
        if (!e) return;
        const x = (ei - (g.elements.length - 1) / 2) * 0.66;
        const mod = this.inst('ne') || this.card(0.34, 0.46, 0.03);
        mod.position.set(x, Y + 0.04, gz); mod.scale.setScalar(1.25);
        if (this.models) this.paintNameplate(mod, e.name, e.version, e.id.toUpperCase());
        this.root.add(mod);
        addPick(mod, { kind: 'ne', id: e.id, label: e.name });
        this.addLabel(mod, e.name, e.type + ' · v' + e.version, this.models ? 0.60 : 0.34, 1.0,
          { big: 42, small: 22, tick: /5\.2\.1/.test(e.version) ? '#a67d48' : null });
        this.edge(g.id, e.id);
      });
    });

    this.controls.target.set(0, Y + 0.10, -0.35);
    this.camera.position.set(3.15, Y + 2.35, 3.25);
  }

  select(id) {
    if (!this.nodes) return;
    this.selected = id;
    const near = new Set([id]);
    (this.links || []).forEach((l) => {
      if (l.from === id) near.add(l.to);
      if (l.to === id) near.add(l.from);
    });
    this.nodes.forEach((o) => {
      const oid = (o.userData || {}).id;
      const isSel = oid === id;
      const on = near.has(oid);
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        const mm = c.material;
        if (mm.emissive) {
          if (isSel) { mm.emissive.setHex(0x6b4a1f); mm.emissiveIntensity = 0.5; }
          else { mm.emissive.setHex(0x000000); mm.emissiveIntensity = 0; }
        }
        mm.transparent = true;
        mm.opacity = isSel ? 1 : (on ? 0.95 : 0.38);
      });
    });
    (this.links || []).forEach((l) => {
      const hit = l.from === id || l.to === id;
      l.mesh.material = l.mesh.material.clone();
      l.mesh.material.color.setHex(hit ? 0xe0a95c : 0x9a948a);
      l.mesh.material.emissive.setHex(hit ? 0xa67d48 : 0x000000);
      l.mesh.material.emissiveIntensity = hit ? 1.5 : 0.15;
      l.mesh.scale.set(hit ? 1.8 : 0.7, 1, hit ? 1.8 : 0.7);
    });
  }

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
      // 优先拾取"网元 / 组件"这类小对象，避免被托板/站点板挡住
      for (const h of hits) {
        const o = resolve(h);
        if (o && (o.userData.kind === 'ne' || o.userData.kind === 'comp')) return o;
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
    // 流光推进（每 3.2s 走完一条线段，错相出发）
    if (this.links && this.links.length) {
      const now = performance.now() / 3200;
      this.links.forEach((l) => {
        if (!l.dot) return;
        const k = ((now + l.phase) % 1);
        const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
        l.dot.position.lerpVectors(l.a, l.b, e);
        l.dot.material.emissiveIntensity = 1.6 + Math.sin(e * Math.PI) * 1.6;
      });
    }
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
    // host 是重渲染后的新容器时，旧 rig 的画布已脱离 DOM → 重建
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
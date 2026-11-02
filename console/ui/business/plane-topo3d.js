/* ============================================================================
   RHINE LAB · 3D 拓扑（v2 · 程序化档案板）
   ----------------------------------------------------------------------------
   为什么不用 GLB：站点/组/组件在拓扑尺度上只有几厘米，直接复用管理面的机架
   资产会小到看不清。这里按参考仓的"档案板"语言程序化生成：
     站点   = 大方形悬浮板（1.50 × 0.08 × 1.10）
     网元组 = 长条板（2.00 × 0.07 × 0.62）
     网元   = 立卡（0.34 × 0.46 × 0.03），顶缘一条琥珀光
     组件   = 小立方（0.22），环形围绕网元
   连接   = 细圆柱光管；标注 = canvas 文字牌（始终朝向相机）
   视角   = 斜上 45°，可拖拽/缩放，带边界
   ==========================================================================*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const C = { paper: 0xeae5e1, ink: 0x171713, amber: 0xa67d48, sand: 0xc1b8a7, muted: 0x8e897b };

let rig = null;

/* ---------------------------------------------------------------- 文字牌 */
function labelTexture(title, sub, opts) {
  opts = opts || {};
  const W = 512, H = 160;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.fillStyle = '#171713';
  g.font = '600 ' + (opts.big || 52) + 'px "JetBrains Mono","PingFang SC","Microsoft YaHei",monospace';
  let text = String(title || '');
  while (g.measureText(text).width > W - 40 && text.length > 3) text = text.slice(0, -2) + '…';
  g.fillText(text, 18, opts.sub ? H * 0.40 : H * 0.52);
  if (sub) {
    g.fillStyle = 'rgba(23,23,19,.55)';
    g.font = '500 ' + (opts.small || 28) + 'px "JetBrains Mono","PingFang SC",monospace';
    g.fillText(String(sub), 18, H * 0.75);
  }
  if (opts.tick) {
    g.fillStyle = opts.tick;
    g.fillRect(0, 4, 6, H - 8);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: W / H };
}

const MAT = {};
function mat(color, rough, metal) {
  const k = 'm' + color + rough + (metal || 0);
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal || 0 });
  return MAT[k];
}
function glow(color, intensity) {
  const k = 'g' + color + intensity;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.42 });
  return MAT[k];
}

class Topo3D {
  constructor(host, state, onPick) {
    this.host = host;
    this.state = state;
    this.onPick = onPick;

    const w = host.clientWidth || 880;
    const h = host.clientHeight || 430;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.paper);
    this.scene.fog = new THREE.FogExp2(C.paper, 0.032);

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 80);
    this.camera.position.set(2.5, 2.2, 2.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.40;
    this.controls.minAzimuthAngle = -Math.PI * 0.45;
    this.controls.maxAzimuthAngle = Math.PI * 0.45;
    this.controls.enablePan = false;

    this.lights();
    this.floor();
    this.labels = [];
    this.build();
    this.bindPick();
    this.clock = new THREE.Clock();
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
      new THREE.MeshStandardMaterial({ color: 0xe2ddd6, roughness: 0.94 }));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.scene.add(f);
  }

  plate(w, t, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat(color || 0xe6e1d9, 0.62));
    m.castShadow = true; m.receiveShadow = true;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.003, d * 0.86), mat(C.muted, 0.8));
    inner.position.y = t / 2 + 0.002;
    m.add(inner);
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
    const hh = 0.105 * (scale || 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(hh * aspect, hh),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(0, y, 0);
    m.renderOrder = 5;
    parent.add(m);
    this.labels.push(m);
    return m;
  }

  link(a, b) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6, 1, true), glow(C.amber, 0.95));
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);
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

    const st = this.state;
    const lvl = st.topoLevel || 'element';
    const Y = 0.62;
    const addPick = (obj, data) => { obj.userData = data; this.nodes.push(obj); };

    if (lvl === 'component') {
      const ne = st.elements.find((e) => e.id === st.topoSel) || st.elements[0];
      const base = this.plate(3.0, 0.06, 3.0, 0xe9e4dc);
      base.position.set(0, Y - 0.03, 0);
      this.root.add(base);

      const c = this.card(0.78, 0.5, 0.035);
      c.position.set(0, Y + 0.26, 0);
      this.root.add(c);
      addPick(c, { kind: 'ne', id: ne.id, label: ne.name });
      this.addLabel(c, ne.name, ne.type + ' · v' + ne.version, 0.35, 1.15, { big: 46, small: 26, tick: '#a67d48' });

      const comps = ne.comps || [];
      comps.forEach((name, i) => {
        const ang = (i / comps.length) * Math.PI * 2 - Math.PI / 2;
        const r = 1.2;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(0xd8d1c7, 0.55));
        box.position.set(Math.cos(ang) * r, Y + 0.11, Math.sin(ang) * r);
        box.castShadow = true;
        this.root.add(box);
        addPick(box, { kind: 'comp', id: ne.id + ':' + name, label: name });
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.004, 0.004), glow(C.amber, 1.4));
        line.position.y = 0.112;
        box.add(line);
        this.addLabel(box, name, 'COMPONENT', 0.21, 0.85, { big: 44, small: 24 });
        this.link([0, Y + 0.12, 0], [box.position.x, Y + 0.11, box.position.z]);
      });

      this.controls.target.set(0, Y + 0.14, 0);
      this.camera.position.set(2.3, Y + 1.55, 2.5);
      return;
    }

    // 站点
    const site = this.plate(1.55, 0.08, 1.05, 0xeae5e1);
    site.position.set(0, Y, 0.95);
    this.root.add(site);
    addPick(site, { kind: 'site', id: 'site', label: st.site.name });
    this.addLabel(site, st.site.name, 'SITE · ' + st.site.role, 0.30, 1.05, { big: 44, small: 24, tick: '#a67d48' });

    // 组 + 网元
    st.groups.forEach((g, gi) => {
      const gz = -0.25 - gi * 1.45;
      const gp = this.plate(2.05, 0.07, 0.66, 0xe6e1d9);
      gp.position.set(0, Y, gz);
      this.root.add(gp);
      addPick(gp, { kind: 'group', id: g.id, label: g.name });
      this.addLabel(gp, g.name, 'GROUP · ' + g.elements.length + ' NE', 0.27, 0.95, { big: 42, small: 22 });
      this.link([0, Y + 0.04, 0.95 - 0.52], [0, Y + 0.04, gz + 0.33]);

      g.elements.forEach((eid, ei) => {
        const e = st.elements.find((x) => x.id === eid);
        if (!e) return;
        const x = (ei - (g.elements.length - 1) / 2) * 0.66;
        const cd = this.card(0.34, 0.46, 0.03);
        cd.position.set(x, Y + 0.30, gz);
        this.root.add(cd);
        addPick(cd, { kind: 'ne', id: e.id, label: e.name });
        this.addLabel(cd, e.name, e.type + ' · v' + e.version, 0.33, 1.0,
          { big: 42, small: 22, tick: /5\.2\.1/.test(e.version) ? '#a67d48' : null });
        this.link([x, Y + 0.06, gz], [x, Y + 0.10, gz]);
      });
    });

    this.controls.target.set(0, Y + 0.10, -0.5);
    this.camera.position.set(2.6, Y + 1.85, 2.7);
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
    el.addEventListener('click', () => {
      if (!this.nodes) return;
      this.ray.setFromCamera(this.ptr, this.camera);
      const hits = this.ray.intersectObjects(this.nodes, true);
      if (!hits.length) return;
      let o = hits[0].object;
      while (o && !o.userData.kind) o = o.parent;
      if (o && this.onPick) this.onPick(o.userData.id, o.userData);
    });
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    this.labels.forEach((l) => { if (l.parent) l.quaternion.copy(this.camera.quaternion); });
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
  mount(host, state, onPick) {
    if (rig) return rig;
    rig = new Topo3D(host, state, onPick);
    return rig;
  },
  unmount() { if (rig) { rig.dispose(); rig = null; } },
  rebuild() { if (rig) rig.build(); },
};

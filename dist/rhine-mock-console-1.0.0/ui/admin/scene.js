/* ============================================================================
   RHINE LAB · FLEET RIG — 实时三维机架视图（v2：平放主板 + 从上插入的服务器卡匣）
   ----------------------------------------------------------------------------
   资产：board.glb（平放长条主板，6 槽）+ server_{lcm,omc,fs}.glb（竖直卡匣）
   语义：主板 = 虚机（L 端节点）；卡匣 = 部署其上的 mock 服务，机型 LCM/OMC/FS
   标识：每块主板前缘 + 每个卡匣前脸都有铭牌凹位，这里用 canvas 贴图写真实名称，
         所以"多个主板平铺在一起"也能一眼分清
   视效：暖白雾 + 地面肋条 + 前缘光槽流线 + 卡匣状态灯 + 命中脉冲 + 泛光 + 落位动画
   ==========================================================================*/

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ASSETS = './assets/';
const ASSET_V = '?v=' + Date.now();   // 构建戳：防止浏览器缓存旧 GLB
const KINDS = ['LCM', 'OMC', 'FS'];

/* 与 Blender SPEC 对齐（米）：board 平板顶面 0.710，槽心 x 步距 0.372，槽位 6 个 */
const G = {
  boardTop: 0.690,
  bayRows: 5, bayCols: 1,
  bayPitchY: 0.195, bayY0: -0.360,  // 间距再放宽，侧视能看到每张卡的铭牌
  bayW: 0.400, bayD: 0.028, bayDepth: 0.055,
  cardSeatY: 0.635,
  insertLift: 0.80,
  spacing: 0.82,                    // 板宽 0.46 + 间隙 0.36
  infoY: 0.7035,                    // 信息卡贴在探出板外的横卡面上
  infoZ: 0.545,
  infoW: 0.380, infoH: 0.095,
  railY: 0.690, railZ: 0.405,
  cardT: 0.018,
};





const C = {
  haze: 0xeee8e2,
  amber: 0xd79a44,
  cyan: 0x3f8f93,
  err: 0xa33a2b,
  dim: 0x8a8278,
};

/* ------------------------------------------------------------------ 贴图 */
function flowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 8;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad.addColorStop(0.30, 'rgba(255,214,150,0.16)');
  grad.addColorStop(0.47, 'rgba(255,240,214,0.95)');
  grad.addColorStop(0.53, 'rgba(255,240,214,0.95)');
  grad.addColorStop(0.70, 'rgba(255,214,150,0.16)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,222,1)');
  grad.addColorStop(0.25, 'rgba(255,206,140,0.72)');
  grad.addColorStop(0.62, 'rgba(214,150,60,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/** 铭牌：深底 + 暖白字 + 琥珀色块，像是刻在卡匣上的档案标签 */
  /* 平台语义：三种卡分别是生命周期管理 / 网元管理 / 虚拟机管理 */
  /* 平台标识：主标用缩写，副标英文全称（中文名只在表单/图例里做解释） */
  const KIND_CN = {
    LCM: { code: 'LCM', en: 'LIFECYCLE MGMT' },
    OMC: { code: 'OMC', en: 'NE MANAGEMENT' },
    FS: { code: 'FS', en: 'VM MANAGEMENT' },
  };

  /* 鎏金铭牌：中文全称烤金箔渐变 + 压凸 + 顶部高光 */
  function goldPlateTexture(kind) {
    const info = KIND_CN[kind] || KIND_CN.LCM;
    const W = 1536, H = 384;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);

    // ---- 主标：LCM / OMC / FS，宽字距 ----
    const code = info.code;
    const size = 236;
    const track = 30;
    g.font = '700 ' + size + 'px "JetBrains Mono",ui-monospace,Consolas,monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const widths = code.split('').map((ch) => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (code.length - 1);
    let x = (W - total) / 2;
    const cy = H * 0.40;

    const gold = g.createLinearGradient(0, cy - size * 0.62, 0, cy + size * 0.62);
    gold.addColorStop(0.00, '#f8e6b0');
    gold.addColorStop(0.16, '#e5bf70');
    gold.addColorStop(0.42, '#b57f28');
    gold.addColorStop(0.50, '#f0d78f');
    gold.addColorStop(0.68, '#8f5f18');
    gold.addColorStop(0.86, '#d8b45c');
    gold.addColorStop(1.00, '#fbf0c6');

    const drawCode = (dx, dy, fill) => {
      let cx = x + dx;
      g.fillStyle = fill;
      for (let i = 0; i < code.length; i++) {
        g.fillText(code[i], cx, cy + dy);
        cx += widths[i] + track;
      }
    };

    // 压凸：深色底 + 描边，再压金
    drawCode(0, 8, 'rgba(16,10,4,.66)');
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(58,36,8,.9)';
    let sx = x;
    g.beginPath();
    for (let i = 0; i < code.length; i++) {
      g.strokeText(code[i], sx, cy + 3);
      sx += widths[i] + track;
    }
    drawCode(0, 0, gold);

    // 顶部反光，只作用在字上
    g.globalCompositeOperation = 'source-atop';
    const shine = g.createLinearGradient(0, cy - size * 0.52, 0, cy - size * 0.02);
    shine.addColorStop(0, 'rgba(255,246,214,.34)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, cy - size * 0.58, W, size * 0.58);
    g.globalCompositeOperation = 'source-over';

    // ---- 副标：英文全称 ----
    g.textAlign = 'center';
    g.font = '500 46px "JetBrains Mono",ui-monospace,Consolas,monospace';
    g.fillStyle = 'rgba(233,200,119,.66)';
    g.fillText(info.en, W / 2, H * 0.845);

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  /* 斜向扫光条：靠贴图 offset 慢慢推，模拟金箔被灯扫过 */
  function sheenTexture() {
    const W = 512, H = 8;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.44, 'rgba(255,246,214,0)');
    grd.addColorStop(0.50, 'rgba(255,248,222,.90)');
    grd.addColorStop(0.56, 'rgba(255,246,214,0)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(1.6, 1);
    return tex;
  }

  function nameplateTexture(lines, opts) {
  opts = opts || {};
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const isOff = !!opts.disabled;
  g.fillStyle = isOff ? '#6e6963' : '#141210';   // 停用：灰底反白（作废章）
  g.fillRect(0, 0, W, H);

  // 左侧琥珀竖条
  g.fillStyle = opts.accent || '#d79a44';
  g.fillRect(0, 0, 10, H);

  const pad = 46;
  g.textBaseline = 'middle';
  // 主标题
  g.fillStyle = isOff ? '#faf7f2' : '#f7f2ea';
  g.font = '600 ' + (opts.big || 78) + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  let text = String(lines[0] || '');
  while (g.measureText(text).width > W - pad * 2 - 40 && text.length > 3) {
    text = text.slice(0, -2) + '…';
  }
  g.fillText(text, pad, H * 0.40);

  // 次行（等宽小字）
  if (lines[1]) {
    g.fillStyle = opts.accent || '#d79a44';
    g.font = '500 54px "JetBrains Mono",ui-monospace,Consolas,monospace';
    g.fillText(String(lines[1]), pad, H * 0.775);
  }
  // 右上角编号
  if (opts.code) {
    g.fillStyle = 'rgba(247,242,234,.55)';
    g.font = '500 42px ui-monospace,Consolas,monospace';
    g.textAlign = 'right';
    g.fillText(String(opts.code), W - pad, H * 0.30);
    g.textAlign = 'left';
  }
  // 末尾小刻度
  g.fillStyle = 'rgba(247,242,234,.28)';
  for (let i = 0; i < 14; i++) g.fillRect(W - pad - i * 16, H - 26, 8, 3);
      // —— chip：版本 + 状态（右下角） ——
      const chips = [];
      if (opts.version) {
        chips.push({ text: 'v' + opts.version, fill: null,
          ink: opts.stale ? 'rgba(247,242,234,.40)' : '#d79a44', stale: !!opts.stale });
      }
      if (opts.state) {
        const on = opts.state === 'ON', sync = opts.state === 'SYNC';
        chips.push({ text: opts.state,
          fill: on ? '#d79a44' : sync ? '#3f8f93' : 'rgba(247,242,234,.16)',
          ink: (on || sync) ? '#141210' : 'rgba(247,242,234,.72)' });
      }
      let chipX = W - pad;
      const chipY = H - 96;
      g.font = '600 40px "JetBrains Mono",ui-monospace,Consolas,monospace';
      g.textBaseline = 'middle';
      for (let k = chips.length - 1; k >= 0; k--) {
        const c = chips[k];
        const tw = g.measureText(c.text).width;
        const bw = tw + 44;
        if (c.fill) { g.fillStyle = c.fill; g.fillRect(chipX - bw, chipY - 40, bw, 80); }
        else {
          if (c.stale) {
            // 落后版本：斜纹底 + 琥珀描边（视觉拉力：该升级了）
            g.save(); g.beginPath(); g.rect(chipX - bw, chipY - 40, bw, 80); g.clip();
            g.strokeStyle = 'rgba(215,154,68,.30)'; g.lineWidth = 3;
            for (let hx = chipX - bw - 80; hx < chipX + 20; hx += 14) {
              g.beginPath(); g.moveTo(hx, chipY + 40); g.lineTo(hx + 80, chipY - 40); g.stroke();
            }
            g.restore();
            g.strokeStyle = '#d79a44'; g.lineWidth = 3;
          } else {
            g.strokeStyle = 'rgba(247,242,234,.34)'; g.lineWidth = 2;
          }
          g.strokeRect(chipX - bw, chipY - 40, bw, 80);
        }
        g.fillStyle = c.ink;
        g.fillText(c.text, chipX - bw + 22, chipY);
        chipX -= bw + 16;
      }

  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ 机架 */
class Rig {
  constructor(host) {
    this.host = host;
    this.clock = new THREE.Clock();
    this.boards = [];
    this.modules = [];
    this.byNode = new Map();
    this.byMapping = new Map();
    this.hovered = null;
    this.pointer = new THREE.Vector2(-2, -2);
    this.raycaster = new THREE.Raycaster();
    this.intro = 0;
    this.dragState = null;   // 拖拽中的卡 { mod, home }
    this.dropTarget = null;
    this.flowTex = flowTexture();
    this.glowTex = glowTexture();
    this.labelTexCache = new Map();

    const w = host.clientWidth || 1200;
    const h = host.clientHeight || 700;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.haze);
    this.scene.fog = new THREE.FogExp2(C.haze, 0.026);

    this.camera = new THREE.PerspectiveCamera(36, w / h, 0.05, 90);
    this.camera.position.set(1.02, 1.38, 1.32);   // 特写但留边：单板 + 卡排完整入画

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.86;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'rig__canvas';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-0.02, 0.78, 0.14);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.55;
    this.controls.maxDistance = 3.2;
    // 拖拽边界：不让用户转到板背面或钻到板底下
    this.controls.minAzimuthAngle = -Math.PI / 3;
    this.controls.maxAzimuthAngle = Math.PI / 3;
    this.controls.minPolarAngle = Math.PI * 0.10;
    this.controls.maxPolarAngle = Math.PI * 0.40;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.5;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.40, 0.55, 0.94);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildLights();
    this.buildFloor();
    this.addOverlays();

    this.loader = new GLTFLoader();
    this.ready = this.loadAssets();
    this.ready.then(() => {
      if (this.pendingData) this.applyData(this.pendingData);
      this.host.classList.add('is-ready');
    });

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.bindPointer();
    this.loop();
  }

  /* -------------------------------------------------------------- 光/地 */
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8bfb6, 0.60));

    const key = new THREE.DirectionalLight(0xfff6ea, 1.12);
    key.position.set(-3.4, 6.6, 3.4);   // 左后上方：避免近处卡面被正面直射打爆
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7;
    key.shadow.bias = -0.0007;
    key.shadow.radius = 3;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xffd7a2, 0.58);
    rim.position.set(-5.0, 3.0, -4.0);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.26);
    fill.position.set(-3.2, 1.8, 4.2);
    this.scene.add(fill);

    this.bounce = new THREE.PointLight(0xffbf78, 2.2, 7.0, 2.0);
    this.bounce.position.set(0, 0.60, 1.1);
    this.scene.add(this.bounce);
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xd6cfc7, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.003;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ribCount = 54;
    const ribs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(16.0, 0.006, 0.020),
      new THREE.MeshStandardMaterial({ color: 0xc9c1b9, roughness: 0.86 }),
      ribCount
    );
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < ribCount; i++) {
      mtx.makeTranslation(0, 0.003, 4.6 - i * 0.18);
      ribs.setMatrixAt(i, mtx);
    }
    ribs.receiveShadow = true;
    this.scene.add(ribs);
  }

  addOverlays() {
    const vig = document.createElement('div');
    vig.className = 'rig__vignette';
    this.host.appendChild(vig);
    const scan = document.createElement('div');
    scan.className = 'rig__scan';
    this.host.appendChild(scan);
    this.scanEl = scan;
  }

  /* -------------------------------------------------------------- 资产 */
  async loadAssets() {
    const load = (f) => new Promise((res, rej) => this.loader.load(ASSETS + f + ASSET_V, res, undefined, rej));
    const [board, lcm, omc, fs] = await Promise.all([
      load('board.glb'), load('server_lcm.glb'), load('server_omc.glb'), load('server_fs.glb')
    ]);
    this.prefabs = { board, LCM: lcm, OMC: omc, FS: fs };
  }

  clonePrefab(gltf) {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    });
    return root;
  }

  collect(root, prefix) {
    const out = [];
    root.traverse((o) => { if (o.isMesh && o.name.startsWith(prefix)) out.push(o); });
    return out;
  }

  /** 贴在深色铭牌凹位上的文字平面（自带 UV，文字由 canvas 生成） */
  makePlate(width, height, lines, opts) {
    const tex = nameplateTexture(lines, opts);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.renderOrder = 3;
    return mesh;
  }

  /* -------------------------------------------------------------- 数据 */
  setData(data) {
    this.pendingData = data;
    if (!this.prefabs) return;
    this.applyData(data);
  }

  /** 插仓中心：2 排 × 3 列（与 Blender SPEC 一致） */
  bayCenters() {
    const out = [];
    for (let r = 0; r < G.bayRows; r++) {
      out.push({ x: 0, z: -(G.bayY0 + r * G.bayPitchY) });   // Blender Y → glTF −Z
    }
    return out;
  }

  applyData(data) {
    const nodes = data.nodes || [];
    const mappings = data.mappings || [];

    for (const b of this.boards) this.scene.remove(b.root);
    for (const m of this.modules) this.scene.remove(m.root);
    this.boards = []; this.modules = [];
    this.byNode.clear(); this.byMapping.clear();

    const startX = -((nodes.length - 1) * G.spacing) / 2;

    nodes.forEach((node, bi) => {
      const root = this.clonePrefab(this.prefabs.board);
      root.position.set(startX + bi * G.spacing, 0, 0);
      this.scene.add(root);

      const rail = this.collect(root, 'GEO_Board_LightRail')[0];
      if (rail) {
        rail.material.emissive = new THREE.Color(C.amber);
        rail.material.emissiveIntensity = 1.6;
      }
      const glows = this.collect(root, 'SOCKET_GLOW');

      // 前缘铭牌：节点名 + 版本 + 编号
      const plate = this.makePlate(G.infoW, G.infoH,
        [node.name || node.id, 'NODE ' + node.id.replace(/^node-/, '') + '   ·   ' + (node.version || '')],
        { big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44',
            version: node.version || '',
            state: node.status === 'online' ? 'ON' : node.status === 'updating' ? 'SYNC' : 'OFF' });
      plate.rotation.x = -Math.PI / 2;      // 平铺在板面（横向信息卡）
      plate.position.set(0, G.infoY, G.infoZ);
      root.add(plate);

      // 前缘光槽上的流线（JS 生成，带 UV）
      const ribbon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.40, 0.024),
        new THREE.MeshBasicMaterial({
          map: this.flowTex.clone(), color: C.amber, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        })
      );
      ribbon.material.map.wrapS = THREE.RepeatWrapping;
      ribbon.material.map.repeat.set(2.2, 1);
      ribbon.position.set(0, G.railY + 0.0022, G.railZ);
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.scale.set(0.34, 1, 1);            // 窄板：光流按板宽收窄
      root.add(ribbon);

      // 离线：整板压暗一档（与在线板形成明显区别）
      if (node.status === 'offline') {
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            if (mat.color && mat.emissiveIntensity === undefined) mat.color.multiplyScalar(0.86);
          });
        });
      }

      const bays = this.bayCenters();
      // 空插仓：每个插仓一块浅色凹槽，既是"还能插"的提示，也是点击/拖放目标
      const bayMeshes = [];
      bays.forEach((bay, si) => {
        // 竖立标记面：放在"卡会站的位置"，从 45° 视角看得见，也不会被板面遮挡
        const geo = new THREE.PlaneGeometry(G.bayW * 0.78, 0.22);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xd79a44, transparent: true, opacity: 0.07,
          side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(bay.x, G.cardSeatY + 0.16, bay.z);
        m.userData.bay = { nodeId: node.id, slot: si };
        // 边框：让"空插仓"看起来是一个待插的槽，而不是一块脏污
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0xd79a44, transparent: true, opacity: 0.40 })
        );
        edges.raycast = () => {};   // 线段的拾取阈值极大，会吃掉整块画布，必须关掉
        m.add(edges);
        root.add(m);
        bayMeshes.push(m);
      });

      const board = { id: node.id, node, root, glows, rail, ribbon, bays, bayMeshes, index: bi };
      this.boards.push(board);
      this.byNode.set(node.id, board);
    });

    // 卡匣落位：按 node_id → 否则按机型选板 → 否则按哈希
    const used = new Map();
    mappings.forEach((mp) => {
      const kind = mp.kind || this.inferKind(mp);
      let bi = nodes.findIndex((n) => n.id === mp.node_id);
      if (bi < 0) {
        const cands = nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => (n.kind || KINDS[i % 3]) === kind);
        bi = cands.length ? cands[0].i : this.hash(mp.id) % Math.max(1, nodes.length);
      }
      const board = this.boards[bi];
      if (!board) return;
        const taken = used.get(bi) || new Set();
        const want = typeof mp.slot === 'number' ? mp.slot : -1;
        let slot = -1;
        if (want >= 0 && want < board.bays.length && !taken.has(want)) slot = want;
        if (slot < 0) {
          for (let s = 0; s < board.bays.length; s++) { if (!taken.has(s)) { slot = s; break; } }
        }
        if (slot < 0) return;      // 板满：不落位（容量提示在 UI）
        taken.add(slot);
        used.set(bi, taken);

      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
        const dims = this.dressCard(root, kind);   // 造型差异（返回尺寸供铭牌定位）
      // 卡片材质压暗一档：白卡正对主光时容易过曝
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (mat.color && mat.emissiveIntensity === undefined) mat.color.multiplyScalar(0.93);
        if (mat.roughness !== undefined) mat.roughness = Math.max(0.62, mat.roughness);
        if (mat.metalness !== undefined) mat.metalness = 0;
      });
    });
    const bay = board.bays[slot];
        const bayMesh = board.bayMeshes && board.bayMeshes[slot];
        if (bayMesh) bayMesh.visible = false;   // 该插仓已占用
      root.position.set(bay.x, G.cardSeatY + G.insertLift, bay.z);
      root.scale.setScalar(1.06);
      board.root.add(root);

      // 铭牌贴在卡面**上部**：面贴面并排时，45° 俯视每张卡露出的就是这条
      const name = mp.name || mp.path || mp.id;
      const tall = kind === 'FS';
      const plateW = tall ? 0.330 : 0.315;
      const plateH = tall ? 0.082 : 0.072;
      const plateYc = tall ? 0.368 : 0.334;
      const plate = this.makePlate(plateW, plateH,
        [name, String(mp.method || 'GET').toUpperCase() + '  ' + (mp.path || '')],
        {
          big: 110, code: kind,
          accent: kind === 'OMC' ? '#3f8f93' : kind === 'FS' ? '#4a6b47' : '#d79a44',
          version: mp.version || (board.node && board.node.version) || '',
          stale: !!(mp.version && board.node && mp.version !== board.node.version),
          state: mp.enabled === false ? 'OFF' : 'ON',
          disabled: mp.enabled === false,
        });
      plate.position.set(0, plateYc, G.cardT / 2 + 0.0036);   // 前移 2mm，跳出铭牌凹位
      root.add(plate);

        // —— 鎏金中文全称：暗色衬板 + 金箔字（生命周期管理 / 网元管理 / 虚拟机管理）——
        const goldW = Math.min(0.285, (dims.w || 0.40) * 0.70);
        const goldH = goldW * 0.25;
        const goldY = dims.yMin + dims.h * 0.46;   // 卡面中上部的大块留白
        const faceZ = dims.zFront + 0.0042;

        // 衬板：深色半透 + 细金边，让金字在浅色卡面上"嵌"进去
        const backW = goldW + 0.022, backH = goldH + 0.013;
        const back = new THREE.Mesh(
          new THREE.PlaneGeometry(backW, backH),
          new THREE.MeshBasicMaterial({ color: 0x120e08, transparent: true, opacity: 0.93, toneMapped: false, depthWrite: false })
        );
        back.position.set(0, goldY, faceZ);
        back.renderOrder = 3;
        root.add(back);

        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(backW, backH)),
          new THREE.LineBasicMaterial({ color: 0xc6923c, transparent: true, opacity: 0.75 })
        );
        edge.raycast = () => {};
        edge.position.set(0, goldY, faceZ + 0.0004);
        root.add(edge);

        const gold = new THREE.Mesh(
          new THREE.PlaneGeometry(goldW, goldH),
          new THREE.MeshBasicMaterial({ map: this.goldTex(kind), transparent: true, toneMapped: false, depthWrite: false })
        );
        gold.position.set(0, goldY, faceZ + 0.0012);
        gold.renderOrder = 4;
        root.add(gold);

        // 扫光：细窄一条金色高光，慢慢扫过铭牌
        const sheenTex = this.sheenTex();
        const sheen = new THREE.Mesh(
          new THREE.PlaneGeometry(goldW * 0.92, goldH * 0.94),
          new THREE.MeshBasicMaterial({
            map: sheenTex, color: 0xffd98a, transparent: true, opacity: 0.10,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
          })
        );
        sheen.position.set(0, goldY, faceZ + 0.0022);
        sheen.renderOrder = 5;
        root.add(sheen);

      const emitters = [].concat(
        this.collect(root, 'GEO_Server_Strip'),
        this.collect(root, 'GEO_Server_VBar'),
        this.collect(root, 'GEO_Server_Led')
      );
      emitters.forEach((o) => {
        o.material.emissive = new THREE.Color(kind === 'OMC' ? C.cyan : kind === 'FS' ? C.green : C.amber);
        o.material.emissiveIntensity = mp.enabled === false ? 0.08 : 1.4;
      });

      // 命中光晕（贴在前脸上方）
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: mp.enabled === false ? 0x777777 : C.amber,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0
      }));
      glow.scale.set(0.34, 0.34, 1);
      glow.position.set(0, plateYc, 0.10);
      root.add(glow);

      // 停用：整卡压暗，并盖一层半透明遮罩，远看就能分辨
      if (mp.enabled === false) {
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            if (mat.color) mat.color.multiplyScalar(0.80);
            if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
          });
        });
        const veil = new THREE.Mesh(
          new THREE.PlaneGeometry(0.360, 0.360),
          new THREE.MeshBasicMaterial({ color: 0x1b1917, transparent: true, opacity: 0.34, depthWrite: false })
        );
        veil.position.set(0, 0.19, G.cardT / 2 + 0.0055);
        veil.renderOrder = 2;
        root.add(veil);
        mp.__veil = veil;
      }

      const bg = board.glows[slot];
      if (bg) bg.material.emissiveIntensity = 0.03;

      const mod = {
        id: mp.id, mapping: mp, kind, root, board, slot,
        emitters, glow, plate, seatY: G.cardSeatY,
          gold, sheen,
        seed: (this.hash(mp.id) % 1000) / 1000, hit: 0
      };
      this.modules.push(mod);
      this.byMapping.set(mp.id, mod);
    });

    this.intro = 0;
    this.host.classList.add('is-assembling');
    if (this.selectedId && !this.byNode.has(this.selectedId) && !this.byMapping.has(this.selectedId)) {
      this.selectedId = null;
    }
  }

  /** 每种平台一张鎏金贴图（只生成一次） */
  goldTex(kind) {
    this._gold = this._gold || {};
    if (!this._gold[kind]) this._gold[kind] = goldPlateTexture(kind);
    return this._gold[kind];
  }

  /** 扫光贴图（每个卡各自 clone，才能独立推 offset） */
  sheenTex() {
    this._sheenBase = this._sheenBase || sheenTexture();
    const tex = this._sheenBase.clone();
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * 造型差异化：三种平台不只是换颜色，卡体轮廓也不同
   *   LCM 生命周期管理 → 顶部三层"版本阶梯"，右下时间轴凹槽
   *   OMC 网元管理     → 顶部一根"管理总线"，左侧 4 个端口凸点
   *   FS  虚拟机管理   → 底部"宿主裙边" + 右侧双风扇环
   * 返回 { w, h, yMin, zFront } 供鎏金铭牌定位。
   */
  dressCard(root, kind) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const dims = { w: size.x || 0.40, h: size.y || 0.42, yMin: box.min.y, zFront: box.max.z };
    const accent = kind === 'OMC' ? C.cyan : kind === 'FS' ? C.green : C.amber;
    // 与卡体同族的浅色金属，不要用深色块，否则像贴在卡上的黑胶带
    const shell = new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.55, metalness: 0.25 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.45, metalness: 0.45 });
    const glow = new THREE.MeshStandardMaterial({
      color: accent, emissive: new THREE.Color(accent), emissiveIntensity: 0.85,
      roughness: 0.4, metalness: 0.2, toneMapped: false,
    });
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); root.add(mesh); return mesh; };
    const TOP = box.max.y;

    if (kind === 'LCM') {
      // 顶部三层"版本阶梯"：逐级抬升的薄板
      for (let k = 0; k < 3; k++) {
        const w = 0.33 - k * 0.070;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, 0.026), k === 2 ? glow : shell);
        add(bar, -0.01 + k * 0.012, TOP + 0.005 + k * 0.010, 0.004);
      }
      // 卡面右下：时间轴刻度（版本演进）
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.004, 0.004), trim);
      add(rail, 0.0, dims.yMin + 0.048, dims.zFront + 0.0012);
      for (let k = 0; k < 5; k++) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.003), k === 4 ? glow : trim);
        add(tick, -0.096 + k * 0.048, dims.yMin + 0.056, dims.zFront + 0.0014);
      }
    } else if (kind === 'OMC') {
      // 顶部"管理总线"：一根细梁 + 两个立脚
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.009, 0.022), shell);
      add(beam, 0, TOP + 0.010, 0.002);
      [-0.11, 0.11].forEach((x) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.020, 0.018), trim);
        add(leg, x, TOP + 0.008, 0.002);
      });
      // 顶部天线桅杆：网元管理的"上行链路"
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.085, 8), trim);
      add(mast, 0.075, TOP + 0.048, 0.002);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 10), glow);
      add(bulb, 0.075, TOP + 0.094, 0.002);
      // 左侧端口凸点（4 个，像被纳管的网元）
      for (let k = 0; k < 4; k++) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.014, 0.008), k === 0 ? glow : trim);
        add(port, -size.x / 2 + 0.020, dims.yMin + 0.062 + k * 0.026, dims.zFront + 0.0016);
      }
    } else {
      // FS：底部"宿主裙边" + 右下双风扇环
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(size.x * 1.04, 0.012, 0.042), trim);
      add(skirt, 0, dims.yMin + 0.002, 0.008);
      [-0.042, 0.042].forEach((dx, k) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0030, 8, 24), k === 0 ? glow : trim);
        ring.position.set(dx, dims.yMin + 0.088, dims.zFront + 0.0016);
        root.add(ring);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 16), trim);
        hub.position.set(dx, dims.yMin + 0.088, dims.zFront + 0.0018);
        root.add(hub);
      });
    }
    return dims;
  }

  inferKind(mp) {
    const p = (mp.path || '').toLowerCase();
    if (p.includes('omc')) return 'OMC';
    if (p.includes('fs') || p.includes('file')) return 'FS';
    if (p.includes('lcm') || p.includes('nemp') || p.includes('ne/')) return 'LCM';
    return KINDS[this.hash(mp.id) % 3];
  }

  hash(s) {
    let h = 2166136261;
    for (let i = 0; i < String(s).length; i++) {
      h ^= String(s).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  /* -------------------------------------------------------------- 交互 */
  bindPointer() {
    const el = this.renderer.domElement;
    this.onMove = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.hover();
    };
    this.onLeave = () => { this.pointer.set(-2, -2); this.setHover(null); };
    this.onClick = () => this.pick();
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('click', this.onClick);
  }

  /** 某个对象是否属于某张卡（用于拖拽时把它自己排除出命中） */
  isInModule(obj, mod) {
    let o = obj;
    while (o) { if (o === mod.root) return true; o = o.parent; }
    return false;
  }

  intersect() {
    const targets = this.boards.map((b) => b.root);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(targets, true);
    // 拖拽中的卡正压在光标下，必须排除，否则目标插仓永远判不出来
    if (!this.dragState) return hits;
    return hits.filter((h) => !this.isInModule(h.object, this.dragState.mod));
  }

  hover() {
    const hits = this.intersect();
    this.setHover(hits.length ? hits[0] : null);
  }

  setHover(hit) {
    const info = hit ? this.hitInfo(hit.object) : null;
    if (info && info.type === 'bay') {
      this.hovered = 'bay:' + info.nodeId + ':' + info.slot;
      this.renderer.domElement.style.cursor = 'copy';
      this.emit('hover', { type: 'bay', nodeId: info.nodeId, slot: info.slot, id: this.hovered });
      return;
    }
    const id = hit ? this.ownerOf(hit.object) : null;
    if (id === this.hovered) return;
    this.hovered = id;
    const el = this.renderer.domElement;
    el.style.cursor = id ? 'pointer' : 'grab';
    this.emit('hover', id ? { id, type: id.indexOf('map') === 0 || this.byMapping.has(id) ? 'mapping' : 'node' } : { id: null });
  }

  /** 命中对象的完整信息：模块 / 主板 / 空插仓 */
  hitInfo(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.bay) return Object.assign({ type: 'bay' }, o.userData.bay);
      const m = this.modules.find((x) => x.root === o);
      if (m) return { type: 'mapping', id: m.id, module: m };
      const b = this.boards.find((x) => x.root === o);
      if (b) return { type: 'node', id: b.id, board: b };
      o = o.parent;
    }
    return null;
  }

  /** 某块板的插仓占用（给 UI 做容量提示） */
  bayStats(nodeId) {
    const b = this.byNode.get(nodeId);
    if (!b) return { total: 0, used: 0, free: [] };
    const taken = new Set((this.modules || []).filter((m) => m.board === b).map((m) => m.slot));
    const free = [];
    for (let s = 0; s < b.bays.length; s++) { if (!taken.has(s)) free.push(s); }
    return { total: b.bays.length, used: taken.size, free };
  }

  /** 拖拽时高亮可落位的插仓 */
  /** 拾起一张卡：抬高、微亮、其余卡变暗，方便看清落点 */
  beginDrag(mappingId) {
    const mod = this.modules.find((m) => m.mapping && m.mapping.id === mappingId);
    if (!mod || !mod.root) return false;
    const home = { x: mod.root.position.x, y: mod.root.position.y, z: mod.root.position.z };
    this.dragState = { mod, home };
    mod.root.position.y = home.y + 0.16;
    mod.root.scale.setScalar(0.92);   // 抬起时略缩小，避免贴脸时过大
    this.cssDragOpacity(mod.root, 0.94, true);
    // 其余卡压暗，突出拖拽对象
    this.modules.forEach((m) => {
      if (m === mod) return;
      this.cssDragOpacity(m.root, 0.55, true);
    });
    // 空插仓一起提亮，形成"可放这里"的暗示
    this.boards.forEach((b) => (b.bayMeshes || []).forEach((m) => {
      if (m.visible) { m.material.opacity = 0.16; }
    }));
    return true;
  }

  /** 拖拽跟随：把卡挪到光标对应的世界位置（在一个水平面上求交） */
  moveDragTo(clientX, clientY) {
    if (!this.dragState) return;
    const el = this.renderer.domElement;
    const r = el.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(G.cardSeatY + 0.16));
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return;
    // 限制在机架范围内，别让卡飘到镜头前
    const cx = Math.max(-1.35, Math.min(1.35, hit.x));
    const cz = Math.max(-0.85, Math.min(0.55, hit.z));
    const root = this.dragState.mod.root;
    root.position.x = cx;
    root.position.z = cz;
    // 轻轻朝相机倾斜，像被捏起来
    root.rotation.y = Math.atan2(
      this.camera.position.x - hit.x,
      this.camera.position.z - hit.z
    ) * 0.25;
  }

  /** 结束拖拽：commit=false 回到原位 */
  endDrag(commit) {
    const st = this.dragState;
    this.dragState = null;
    this.modules.forEach((m) => this.cssDragOpacity(m.root, 1, false));
    this.boards.forEach((b) => (b.bayMeshes || []).forEach((m) => {
      if (m.visible) m.material.opacity = 0.07;
    }));
    if (!st) return;
    st.mod.root.scale.setScalar(1);
    st.mod.root.rotation.y = 0;
    if (commit) return;
    // 取消：回弹到原插仓
    st.mod.root.position.set(st.home.x, st.home.y, st.home.z);
  }

  /** 递归改材质透明度（记录原值以便还原） */
  cssDragOpacity(root, opacity, mark) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (mark) {
          if (mat.userData.__op === undefined) mat.userData.__op = mat.opacity;
          mat.transparent = true;
          mat.opacity = Math.min(mat.userData.__op, opacity);
        } else {
          if (mat.userData.__op !== undefined) mat.opacity = mat.userData.__op;
        }
      });
    });
  }

  setDropTarget(nodeId, slot) {
    this.boards.forEach((b) => {
      (b.bayMeshes || []).forEach((m) => {
        const hit = b.id === nodeId && m.userData.bay.slot === slot;
        const mat = m.material;
        if (mat.emissive) {
          mat.emissive.setHex(hit ? 0x3f8f93 : 0xd79a44);
          mat.emissiveIntensity = hit ? 1.8 : 0.12;
        } else {
          // MeshBasicMaterial：用透明度 + 颜色做高亮
          mat.color.setHex(hit ? 0x3f8f93 : 0xd79a44);
          mat.opacity = hit ? 0.55 : 0.07;
        }
      });
    });
    this.dropTarget = nodeId ? { nodeId, slot } : null;
  }

  ownerOf(obj) {
    let o = obj;
    while (o) {
      const m = this.modules.find((x) => x.root === o);
      if (m) return m.id;
      const b = this.boards.find((x) => x.root === o);
      if (b) return b.id;
      o = o.parent;
    }
    return null;
  }

  pick() {
    const hits = this.intersect();
    if (!hits.length) return;
    const info = this.hitInfo(hits[0].object);
    if (!info) return;
    // 空插仓：点一下就能就地新建服务卡
    if (info.type === 'bay') {
      this.emit('select', { type: 'bay', nodeId: info.nodeId, slot: info.slot });
      return;
    }
    if (info.type === 'mapping') {
      this.selectedId = info.id;
      this.emit('select', { type: 'mapping', id: info.id, data: info.module.mapping });
      return;
    }
    if (info.type === 'node') {
      this.selectedId = info.id;
      this.emit('select', { type: 'node', id: info.id, data: info.board.node });
    }
  }

  emit(type, payload) {
    this.host.dispatchEvent(new CustomEvent('rig:' + type, { detail: payload }));
  }

  focus(nodeId) {
    const b = this.byNode.get(nodeId);
    if (!b) return;
    this.controls.target.set(b.root.position.x, 0.78, 0);
    this.camera.position.set(b.root.position.x + 0.6, 1.9, 4.6);
  }

  /* -------------------------------------------------------------- 循环 */
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.prefabs) this.tick(dt, t);
    this.controls.update();
    this.composer.render();
  }

  tick(dt, t) {
    this.intro = Math.min(1, this.intro + dt * 0.85);

    this.boards.forEach((b, bi) => {
      const online = b.node.status === 'online';
      const updating = b.node.status === 'updating';
      const offline = b.node.status === 'offline';
      const target = updating ? new THREE.Color(C.cyan) : offline ? new THREE.Color(C.dim) : new THREE.Color(C.amber);

      if (b.rail) {
        b.rail.material.emissive.lerp(target, 0.07);
        const base = offline ? 0.15 : updating ? 2.6 : 1.5;
        const pulse = updating ? 0.55 + 0.45 * Math.sin(t * 9 + bi) : 0.9 + 0.1 * Math.sin(t * 1.5 + bi);
        b.rail.material.emissiveIntensity = base * pulse;
      }
      if (b.ribbon) {
        const m = b.ribbon.material;
        m.color.lerp(target, 0.07);
        m.opacity = offline ? 0.08 : updating ? 1.0 : 0.7;
        m.map.offset.x -= dt * (offline ? 0 : updating ? 0.95 : 0.24);
        m.map.repeat.x = offline ? 2.2 : updating ? 3.8 : 2.2;
      }

      // 空槽灯：未占用时呼吸
      b.glows.forEach((g, i) => {
        const occ = this.modules.some((m) => m.board === b && m.slot === i);
        g.material.emissiveIntensity = occ ? 0.02 : offline ? 0.10 : 0.75 + 0.35 * Math.sin(t * 2.0 + i + bi);
      });
    });

    // 拖动中的卡：轻微浮沉；落点插仓：脉冲高亮
    if (this.dragState) {
        const root = this.dragState.mod.root;
        root.position.y = G.cardSeatY + 0.16 + Math.sin(t * 5.5) * 0.012;
    }
    const dtTarget = this.dropTarget;
    this.boards.forEach((b) => (b.bayMeshes || []).forEach((m) => {
        if (!m.visible) return;
        const isTarget = dtTarget && dtTarget.nodeId === b.id && dtTarget.slot === m.userData.bay.slot;
        if (isTarget) {
            const pulse = 0.42 + 0.28 * (0.5 + 0.5 * Math.sin(t * 7));
            m.material.opacity = pulse;
            m.material.color.setHex(0x3f8f93);
        } else if (this.dragState) {
            m.material.opacity = 0.16;
        } else {
            // 悬停某块板时，把它的空位提亮一点（提示"这里能插"）
            const boardHovered = this.hovered === b.id;
            m.material.opacity = boardHovered ? 0.16 : 0.07;
        }
    }));

    this.modules.forEach((m, i) => {
      // 从上往下插入：错峰落位
      const delay = 0.08 + i * 0.05;
      const k = Math.max(0, Math.min(1, (this.intro - delay) * 1.45));
      const ease = 1 - Math.pow(1 - k, 3);
      if (this.intro < 1 && !(this.dragState && this.dragState.mod === m)) m.root.position.y = m.seatY + G.insertLift * (1 - ease);   // 入场结束后把 y 交给特效层   // 竖直插入
      const settle = Math.sin(Math.min(1, Math.max(0, (k - 0.85) / 0.15)) * Math.PI) * 0.005;
        // 鎏金扫光：每 6 秒左右扫一遍，按 seed 错开相位
        if (m.sheen && m.sheen.material && m.sheen.material.map) {
          const phase = (t * 0.16 + m.seed) % 1;
          m.sheen.material.map.offset.x = -0.35 + phase * 1.7;
          m.sheen.material.opacity = 0.05 + 0.14 * Math.sin(phase * Math.PI);
        }
      m.root.position.y -= settle;

      const enabled = m.mapping.enabled !== false;
      const hits = m.mapping.hits || 0;
      const base = enabled ? 1.1 + Math.min(1.6, hits * 0.02) : 0.06;
      const breathe = 0.86 + 0.14 * Math.sin(t * 2.0 + m.seed * 6.28);
      m.emitters.forEach((o) => {
        if (o.material && o.material.emissive) o.material.emissiveIntensity = base * breathe;
      });

      m.hit = Math.max(0, m.hit - dt * 1.7);
      if (m.glow) {
        m.glow.material.opacity =
          (enabled ? 0.12 + Math.min(0.45, hits * 0.008) : 0) * (0.65 + 0.35 * Math.sin(t * 2.2 + m.seed * 6.28))
          + m.hit * 0.5;
        m.glow.scale.setScalar(0.30 + m.hit * 0.16);
      }
      // 铭牌：未启用的服务压暗
      if (m.plate) m.plate.material.opacity = enabled ? 1.0 : 0.55;
      if (m.plate) m.plate.material.transparent = !enabled;
      if (m.plate) m.plate.material.opacity = enabled ? 1.0 : 0.42;
    });

    if (this.scanEl) {
      const up = this.boards.some((b) => b.node.status === 'updating');
      this.scanEl.style.opacity = up ? '0.85' : '0';
    }
  }

  resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  setJob(job) { this.job = job; }
  pulse(mappingId) {
    const m = this.byMapping.get(mappingId);
    if (m) m.hit = 1;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    const el = this.renderer && this.renderer.domElement;
    if (el) {
      el.removeEventListener('pointermove', this.onMove);
      el.removeEventListener('pointerleave', this.onLeave);
      el.removeEventListener('click', this.onClick);
      el.remove();
    }
    if (this.controls) this.controls.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}

/* ------------------------------------------------------------------ 对外 API */
let current = null;

window.RhineScene = {
  mount(host, opts) {
    if (current && current.host === host) return current;
    if (current) { current.dispose(); current = null; }
    current = new Rig(host);
    if (opts) {
      if (opts.onSelect) host.addEventListener('rig:select', (e) => opts.onSelect(e.detail.type, e.detail));
      if (opts.onHover) host.addEventListener('rig:hover', (e) => opts.onHover(e.detail));
    }
    return current;
  },
  setData(data) { if (current) current.setData(data); },
    bayStats: (nodeId) => (current ? current.bayStats(nodeId) : { total: 0, used: 0, free: [] }),
    setDropTarget: (nodeId, slot) => { if (current) current.setDropTarget(nodeId, slot); },
    hitAt(clientX, clientY) {
      if (!current) return null;
      const el = current.renderer.domElement;
      const r = el.getBoundingClientRect();
      current.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
      current.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
      const hits = current.intersect();
      return hits.length ? current.hitInfo(hits[0].object) : null;
    },
    setOrbitEnabled: (on) => { if (current && current.controls) current.controls.enabled = !!on; },
    beginDrag: (id) => (current ? current.beginDrag(id) : false),
    moveDragTo: (x, y) => { if (current) current.moveDragTo(x, y); },
    endDrag: (commit) => { if (current) current.endDrag(commit); },
  setJob(job) { if (current) current.setJob(job); },
  pulse(id) { if (current) current.pulse(id); },
  focus(id) { if (current) current.focus(id); },
  dispose() { if (current) { current.dispose(); current = null; } },
  get instance() { return current; },
};
window.dispatchEvent(new CustomEvent('rhine-scene-module-ready'));

/* ============================================================================
   RHINE LAB · 视效层（effects.js）
   ----------------------------------------------------------------------------
   独立模块：只读取 window.RhineScene.instance 暴露的 boards / modules / hovered，
   不改动 scene.js 的既有逻辑，便于单独开关与回滚。
   实现的五组效果（按约定顺序）：
     1. 前缘光流      — 每块板前缘一条循环流动的琥珀光带；部署中变青、加速
     2. 卡顶光带      — 每张卡顶缘细光呼吸；接口命中时沿带宽闪一次
     3. 热插拔        — 命中数增长时，对应卡上浮 60mm 再落位（"热插拔"）
     4. 悬停反馈      — 悬停卡：琥珀描边光晕 + 铭牌轻微放大
     5. 信息区扫描    — 部署中，一道细光沿探出板外的信息卡扫过
   ==========================================================================*/

import * as THREE from 'three';

const AMBER = new THREE.Color(0xd79a44);
const CYAN = new THREE.Color(0x3f8f93);
const DIM = new THREE.Color(0x8a8278);

/* ---------------------------------------------------------------- 贴图 */
function flowTex() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 8;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad.addColorStop(0.34, 'rgba(255,214,150,0.10)');
  grad.addColorStop(0.46, 'rgba(255,246,226,0.95)');
  grad.addColorStop(0.52, 'rgba(255,246,226,0.95)');
  grad.addColorStop(0.64, 'rgba(255,214,150,0.10)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 8);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function softTex() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,246,226,0.95)');
  grad.addColorStop(0.45, 'rgba(255,200,120,0.30)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

const TEX_FLOW = flowTex();
const TEX_SOFT = softTex();

/* ---------------------------------------------------------------- 状态 */
const state = new WeakMap();     // board -> { flow, scan }
const modState = new WeakMap();  // module -> { top[], hoverGlow, prevHits, hotplug }
const clock = new THREE.Clock();
const LIFT = 0.090;              // 热插拔上浮高度（90mm）

function findIn(root, prefix) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.name.startsWith(prefix)) out.push(o); });
  return out;
}

/* ---------------------------------------------------------------- 初始化 */
function setupBoard(s, b) {
  if (state.has(b)) return;
  const st = {
    flow: null,
    scan: null,
  };

  // —— 1. 前缘光流：贴在板前缘光条上方的一层加性流线 ——
  const flow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.022),
    new THREE.MeshBasicMaterial({
      map: TEX_FLOW.clone(), color: AMBER, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  flow.material.map.wrapS = THREE.RepeatWrapping;
  flow.material.map.repeat.set(2.0, 1);
  flow.rotation.x = -Math.PI / 2;
  flow.position.set(0, 0.6875, 0.484);   // 板前缘光条正上方
  flow.renderOrder = 4;
  b.root.add(flow);
  st.flow = flow;

  // —— 5. 信息区扫描：探出板外的信息卡上的一道细光 ——
  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(0.030, 0.16),
    new THREE.MeshBasicMaterial({
      color: 0x9fd6d8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  scan.rotation.x = -Math.PI / 2;
  scan.position.set(-0.18, 0.7015, 0.545);   // 信息卡面上
  scan.renderOrder = 5;
  b.root.add(scan);
  st.scan = scan;

  state.set(b, st);
}

function setupModule(s, m) {
  if (modState.has(m)) return;
  const tops = findIn(m.root, 'GEO_Server_Strip_Top');
  const st = {
    tops,
    prevHits: (m.mapping.hits || 0),
    lift: 0,        // 热插拔位移
    targetLift: 0,
    hoverGlow: null,
  };
  // 4. 悬停光晕（贴在卡面铭牌外框的一圈柔光）
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX_SOFT, color: AMBER, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(0.62, 0.34, 1);
  glow.position.set(0, 0.33, 0.05);
  glow.renderOrder = 6;
  m.root.add(glow);
  st.hoverGlow = glow;
  modState.set(m, st);
}

/* ---------------------------------------------------------------- 每帧 */
function update() {
  const s = window.RhineScene && window.RhineScene.instance;
  if (!s || !s.boards || !s.boards.length) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ---------- 板级 ----------
  for (const b of s.boards) {
    setupBoard(s, b);
    const st = state.get(b);
    if (!st) continue;

    const updating = b.node && b.node.status === 'updating';
    const offline = b.node && b.node.status === 'offline';
    const target = updating ? CYAN : offline ? DIM : AMBER;

    if (st.flow) {
      st.flow.material.color.lerp(target, 0.08);
      st.flow.material.opacity = offline ? 0.10 : updating ? 1.0 : 0.78;
      st.flow.material.map.offset.x -= dt * (offline ? 0 : updating ? 1.35 : 0.30);
      st.flow.material.map.repeat.x = updating ? 3.2 : 2.0;
    }
    if (st.scan) {
      if (updating) {
        const p = (t * 0.55) % 1;
        st.scan.position.x = -0.19 + p * 0.38;
        st.scan.material.opacity = 0.85 * Math.sin(p * Math.PI);
      } else {
        st.scan.material.opacity = 0;
      }
    }
  }

  // ---------- 卡级 ----------
  for (const m of s.modules) {
    setupModule(s, m);
    const st = modState.get(m);
    if (!st) continue;

    const enabled = m.mapping.enabled !== false;
    const hits = m.mapping.hits || 0;
    const seed = m.seed || 0;

    // 3. 热插拔：命中数增长 → 上浮再落位
    if (hits > st.prevHits) st.lift = LIFT;   // 命中增长 → 触发热插拔
    st.prevHits = hits;
    st.lift = Math.max(0, st.lift - dt * 0.26);
    if (st.lift > 0) {
      const e = Math.sin((st.lift / LIFT) * Math.PI);     // 上去再回来
      m.root.position.y = m.seatY + e * LIFT;
      m.root.rotation.z = -e * 0.049;                     // 2.8° 倾斜，像被抽出一点
    } else if (m.root.position.y !== m.seatY) {
      m.root.position.y = m.seatY;
      m.root.rotation.z = 0;
    }

    // 2. 卡顶光带：呼吸 + 命中闪
    const flash = st.lift > 0 ? 1 : 0;
    const boardUpdating = m.board && m.board.node && m.board.node.status === 'updating';
    st.tops.forEach((o) => {
      if (!o.material || !o.material.emissive) return;
      if (!enabled) {
        // 停用：整条熄灭、颜色转暗（"断线"感）
        o.material.emissive.setHex(0x2a2622);
        o.material.emissiveIntensity = 0.05;
        return;
      }
      if (boardUpdating) {
        // 部署中：青色跑马灯（沿卡排相位推进）
        o.material.emissive.copy(CYAN);
        const phase = (t * 1.6 - (m.slot || 0) * 0.9) % 1;
        o.material.emissiveIntensity = 0.7 + 3.2 * Math.max(0, Math.sin(phase * Math.PI * 2));
      } else {
        // 启用：琥珀实线 + 轻微呼吸
        o.material.emissive.copy(AMBER);
        o.material.emissiveIntensity = 1.55 + 0.22 * Math.sin(t * 1.6 + seed * 6.28);
      }
      if (flash) o.material.emissiveIntensity += flash * 2.4;
    });

    // 4. 悬停反馈
    const isHover = s.hovered === m.id;
    if (st.hoverGlow) {
      const targetOp = isHover ? 0.55 : 0;
      st.hoverGlow.material.opacity += (targetOp - st.hoverGlow.material.opacity) * 0.16;
    }
    if (m.plate) {
      const targetScale = isHover ? 1.045 : 1.0;
      m.plate.scale.x += (targetScale - m.plate.scale.x) * 0.18;
      m.plate.scale.y += (targetScale - m.plate.scale.y) * 0.18;
    }
  }
}

function loop() {
  requestAnimationFrame(loop);
  try { update(); } catch (e) { /* 特效层失败不影响主场景 */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loop, { once: true });
} else {
  loop();
}

window.RhineEffects = {
  version: 1,
  // 手动触发热插拔（部署时可调用）
  hotplug(mappingId) {
    const s = window.RhineScene && window.RhineScene.instance;
    if (!s) return;
    const m = s.byMapping && s.byMapping.get(mappingId);
    const st = m && modState.get(m);
    if (st) st.lift = LIFT;
  },
};

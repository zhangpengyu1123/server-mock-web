#!/usr/bin/env node
/* ① 运行审计：HUMAN 202 记录带"确认"按钮 → resolve
   ② 3D 拓扑：资产加载态 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];

/* ---------- plane.js：审计确认按钮 ---------- */
{
  const P = 'console/ui/business/plane.js';
  let t = readFileSync(P, 'utf8');
  const rep = (from, to, tag) => {
    if (!t.includes(from)) { log.push('MISS ' + tag); return; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  };

  rep(`            <td>\${r.human ? '<span class="pl-tag pl-tag--on">HUMAN 202</span>' : '<span class="pl-muted">—</span>'}</td>`,
`            <td>\${r.human ? \`<span class="pl-tag pl-tag--on">HUMAN 202</span>
              <button class="pl-btn pl-btn--sm" data-human-resolve="\${esc(r.mapping_id || '')}" style="margin-left:6px">确认</button>\` : '<span class="pl-muted">—</span>'}</td>`,
    'audit human button');

  rep(`    // LCM · 包升级 → 生成任务`,
`    // 审计：确认人机交互（放行 202）
    $$('[data-human-resolve]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.humanResolve;
      if (!id) return;
      b.disabled = true;
      try {
        await api('/api/business/mappings/' + id + '/human', {
          method: 'POST', headers: headers(), body: JSON.stringify({ option: 0 }),
        });
        await loadAudit();
      } catch (e) { console.warn(e); }
      render();
    }));

    // LCM · 包升级 → 生成任务`, 'audit resolve binding');

  writeFileSync(P, t, 'utf8');
}

/* ---------- plane-topo3d.js：加载态 ---------- */
{
  const P = 'console/ui/business/plane-topo3d.js';
  let t = readFileSync(P, 'utf8');
  const rep = (from, to, tag) => {
    if (!t.includes(from)) { log.push('MISS ' + tag); return; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  };

  rep(`    this.models = null;
    this.loader = new GLTFLoader();
    this.loadModels().then(() => this.build()).catch(() => this.build());`,
`    this.models = null;
    this.loader = new GLTFLoader();

    // 加载态骨架：资产下载完成前给可读反馈
    this.skeleton = document.createElement('div');
    this.skeleton.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'flex-direction:column;gap:8px;background:rgba(234,229,225,.92);z-index:2;'
      + 'font:600 9px "JetBrains Mono",monospace;letter-spacing:.22em;color:rgba(23,23,19,.55)';
    this.skeleton.innerHTML = '<div>T O P O L O G Y &nbsp; L O A D I N G</div>'
      + '<div style="width:120px;height:1px;background:rgba(23,23,19,.18);overflow:hidden">'
      + '<i style="display:block;width:40%;height:1px;background:#a67d48;animation:rhineLoad 1.1s ease-in-out infinite"></i></div>'
      + '<style>@keyframes rhineLoad{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}</style>';
    host.appendChild(this.skeleton);

    const done = () => {
      if (this.skeleton && this.skeleton.parentNode) this.skeleton.remove();
      this.skeleton = null;
      this.build();
    };
    this.loadModels().then(done).catch(() => {
      if (this.skeleton) this.skeleton.innerHTML = '<div>ASSET FALLBACK</div><div style="font-size:8px;opacity:.6">资产加载失败，使用程序化几何</div>';
      setTimeout(done, 600);
    });`, 'loading skeleton');

  writeFileSync(P, t, 'utf8');
}

console.log(log.join('\n'));

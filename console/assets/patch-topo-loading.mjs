#!/usr/bin/env node
/* 3D 拓扑加载态（node 版，避免 PowerShell 引号问题） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const i = lines.findIndex((l) => l.includes('this.loadModels().then('));
if (i < 0) { console.log('MISS'); process.exit(1); }

const ins = [
  "    // 加载态骨架：资产下载完成前给可读反馈",
  "    this.skeleton = document.createElement('div');",
  "    this.skeleton.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"
    + "flex-direction:column;gap:8px;background:rgba(234,229,225,.92);z-index:2;"
    + "font:600 9px \"JetBrains Mono\",monospace;letter-spacing:.22em;color:rgba(23,23,19,.55)';",
  "    this.skeleton.innerHTML = '<div>T O P O L O G Y &nbsp; L O A D I N G</div>"
    + "<div style=\"width:120px;height:1px;background:rgba(23,23,19,.18);overflow:hidden\">"
    + "<i style=\"display:block;width:40%;height:1px;background:#a67d48;animation:rhineLoad 1.1s ease-in-out infinite\"></i></div>"
    + "<style>@keyframes rhineLoad{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}</style>';",
  "    host.appendChild(this.skeleton);",
  "    const done = () => {",
  "      if (this.skeleton && this.skeleton.parentNode) this.skeleton.remove();",
  "      this.skeleton = null;",
  "      this.build();",
  "    };",
  "    this.loadModels().then(done).catch(() => {",
  "      if (this.skeleton) this.skeleton.innerHTML = '<div>ASSET FALLBACK</div>"
    + "<div style=\"font-size:8px;opacity:.6\">资产加载失败，使用程序化几何</div>';",
  "      setTimeout(done, 600);",
  "    });",
];
lines = [...lines.slice(0, i), ...ins, ...lines.slice(i + 1)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   加载态已插入');

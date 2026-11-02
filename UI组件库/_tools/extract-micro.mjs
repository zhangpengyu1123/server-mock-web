// 从 react-bits 克隆中抽出 Micro 分类，生成独立的组件清单
// 用法: node _tools/extract-micro.mjs
import { readdir, mkdir, copyFile, writeFile, stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const libRoot = join(here, '..');
const srcDir = join(libRoot, '02-Micro-ReactBits', 'src', 'content', 'Micro');
const outDir = join(libRoot, '02-Micro-ReactBits', '_micro-only', 'Micro');

// 1) 抓官方 llms.txt / sitemap 作为「线上口径」
const llms = await (await fetch('https://www.reactbits.dev/llms.txt')).text();
const online = [];
let inMicro = false;
for (const line of llms.split('\n')) {
  if (/^##\s+Micro\s*$/.test(line)) { inMicro = true; continue; }
  if (inMicro && /^##\s+/.test(line)) break;
  if (!inMicro) continue;
  const m = /^-\s+\[(.+?)\]\((https:\/\/[^)]+)\):\s*(.*?)\.\s*CLI:\s*`(.+?)`/.exec(line.trim());
  if (m) online.push({ title: m[1], url: m[2], desc: m[3], cli: m[4] });
}

// 2) 本地源码目录
const localDirs = (await readdir(srcDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const cliToDir = (cli) => cli; // 仓库里目录名就是 CLI 名（PascalCase）

// 3) 复制文件
await mkdir(outDir, { recursive: true });
let copied = 0;
const rows = [];
for (const dir of localDirs) {
  const from = join(srcDir, dir);
  const files = (await readdir(from)).filter((f) => !f.startsWith('.'));
  await mkdir(join(outDir, dir), { recursive: true });
  for (const f of files) {
    await copyFile(join(from, f), join(outDir, dir, f));
    copied++;
  }
  const meta = online.find((o) => cliToDir(o.cli) === dir);
  rows.push({
    dir,
    files,
    bytes: (await Promise.all(files.map(async (f) => (await stat(join(from, f))).size))).reduce((a, b) => a + b, 0),
    title: meta?.title ?? '',
    url: meta?.url ?? '',
    desc: meta?.desc ?? '',
    cli: meta?.cli ?? dir,
    documented: Boolean(meta),
  });
}

// 4) 输出清单
const inRepoName = (dir) => dir;
rows.sort((a, b) => inRepoName(a.dir).localeCompare(inRepoName(b.dir)));
const md = [];
md.push('# Micro 微交互组件清单（从 react-bits 克隆抽取）');
md.push('');
md.push(`- 克隆来源：<https://github.com/DavidHDev/react-bits>（commit \`43591e8b\`）`);
md.push(`- 线上分类页：<https://reactbits.dev/c/micro>（本目录 \`_live-site/reactbits-c-micro.html\` 为渲染快照）`);
md.push(`- 本地组件数：**${localDirs.length}** 个；官方 llms.txt 当前收录：**${online.length}** 个`);
md.push(`- 每个组件 = 1 个 \`.jsx\` + 1 个同名 \`.css\`（组件内部 \`import './X.css'\`，复制两文件即可用）`);
md.push('- 抽取副本：`_micro-only/Micro/<组件名>/`（原样复制，未改动）；完整仓库仍在上一级目录');
md.push('');
md.push('| # | 组件 | CLI / 目录 | 本地源码 | 文档 | 说明 |');
md.push('| --- | --- | --- | --- | --- | --- |');
rows.forEach((r, i) => {
  const path = `_micro-only/Micro/${r.dir}/`;
  md.push(`| ${i + 1} | ${r.title || r.dir} | \`${r.cli}\` | [${r.dir}](${path}) | [文档](${r.url || 'https://reactbits.dev/c/micro'}) | ${r.desc || ''} |`);
});
const missingLocal = online.filter((o) => !localDirs.includes(cliToDir(o.cli)));
if (missingLocal.length) {
  md.push('');
  md.push(`> 线上有、本地没有：${missingLocal.map((m) => m.cli).join(', ')}`);
}
md.push('');
md.push('## 第三方依赖速查');
md.push('');
md.push('| 依赖 | 用到的组件 |');
md.push('| --- | --- |');
const depMap = { 'motion/react': [], '@hugeicons/react + @hugeicons/core-free-icons': [], 'three': [], 'matter-js': [], 'react/react-dom only': [] };
for (const r of rows) {
  const code = await readFile(join(srcDir, r.dir, r.files.find((f) => f.endsWith('.jsx'))), 'utf8');
  if (/from 'three'/.test(code)) depMap['three'].push(r.dir);
  else if (/matter-js/.test(code)) depMap['matter-js'].push(r.dir);
  else if (/@hugeicons/.test(code) && /motion\/react/.test(code)) depMap['motion/react'].push(r.dir);
  else if (/motion\/react/.test(code)) depMap['motion/react'].push(r.dir);
  else if (/@hugeicons/.test(code)) depMap['@hugeicons/react + @hugeicons/core-free-icons'].push(r.dir);
  else depMap['react/react-dom only'].push(r.dir);
}
for (const [k, v] of Object.entries(depMap)) md.push(`| \`${k}\` | ${v.join(', ')} |`);
md.push('');

await writeFile(join(libRoot, '02-Micro-ReactBits', '_micro清单.md'), md.join('\n'), 'utf8');
await writeFile(join(libRoot, '02-Micro-ReactBits', '_micro清单.json'), JSON.stringify({ source: 'https://github.com/DavidHDev/react-bits', commit: '43591e8b', onlineCount: online.length, localCount: localDirs.length, components: rows }, null, 2), 'utf8');
console.log(JSON.stringify({ localCount: localDirs.length, onlineCount: online.length, copiedFiles: copied, missingLocal: missingLocal.map((m) => m.cli) }, null, 2));

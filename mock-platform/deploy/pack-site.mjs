#!/usr/bin/env node
/* 打包可部署站点：只收"站点本体"，把截图库与素材库排除在外
 *   node deploy/pack-site.mjs            → deploy/dist/site/ + site.tar.gz
 * 站点 = index.html + v1..v8 + _shared   （约 1.7 MB）
 * 排除 = _verify（32 MB 截图）/ UI组件库（896 MB）/ deploy / serve.mjs / *.md
 */
import { readdirSync, statSync, mkdirSync, rmSync, cpSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();                     // 应为 mock-platform/
const DIST = join(ROOT, 'deploy', 'dist');
const SITE = join(DIST, 'site');
const INCLUDE_FILES = ['index.html'];
const INCLUDE_DIRS = ['_shared', 'v1-ops-console', 'v2-swiss-editorial', 'v3-rhine-lab', 'v4-archive-terminal', 'v5-music-console', 'v6-mock-lab', 'v7-swiss-bench', 'v8-blackbox-terminal'];
const SKIP_EXT = new Set(['.md', '.zip', '.tar', '.gz', '.log']);

if (!existsSync(join(ROOT, 'v8-blackbox-terminal'))) {
  console.error('✗ 请在 mock-platform/ 目录下运行：node deploy/pack-site.mjs');
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

for (const f of INCLUDE_FILES) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(SITE, f));
}
for (const d of INCLUDE_DIRS) {
  if (!existsSync(join(ROOT, d))) { console.warn('  ! 缺少目录 ' + d); continue; }
  cpSync(join(ROOT, d), join(SITE, d), { recursive: true, filter: (src) => !SKIP_EXT.has(extname(src)) && !src.includes('__pycache__') });
}

/* 版本戳先落盘，再算清单 —— 否则清单会漏掉 version.txt（数目对不上） */
const BUILD_ISO = new Date().toISOString();
writeFileSync(join(SITE, 'version.txt'), 'BLACKBOX TERMINAL 8.0\nbuild ' + BUILD_ISO + '\n');

/* 清单 + 校验和（部署后可用来自证"传上去的是这一份"） */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const buf = readFileSync(p);
      files.push({ path: relative(SITE, p).split('\\').join('/'), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16) });
    }
  }
})(SITE);

const total = files.reduce((n, f) => n + f.bytes, 0);
const manifest = { generatedAt: BUILD_ISO, files: files.length, bytes: total, build: '8.0', entries: files };
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));

/* 打 tar.gz（用系统 tar，Windows 10+ 自带 bsdtar） */
try {
  execFileSync('tar', ['-czf', join(DIST, 'site.tar.gz'), '-C', DIST, 'site'], { stdio: 'ignore' });
} catch (e) {
  console.warn('  ! tar 打包失败（不影响目录部署）：' + e.message);
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('站点目录  ' + SITE);
console.log('文件数    ' + files.length);
console.log('未压缩    ' + kb(total));
const tgz = join(DIST, 'site.tar.gz');
if (existsSync(tgz)) console.log('tar.gz    ' + kb(statSync(tgz).size));
console.log('');
console.log('最大的 6 个文件：');
files.sort((a, b) => b.bytes - a.bytes).slice(0, 6).forEach(f => console.log('  ' + kb(f.bytes).padStart(10) + '  ' + f.path));
console.log('');
console.log('下一步：scp deploy/dist/site.tar.gz user@vm:/tmp/ && ssh user@vm "sudo bash /srv/blackbox/install.sh /tmp/site.tar.gz"');

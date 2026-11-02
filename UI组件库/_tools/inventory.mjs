// 盘点 UI组件库/ 下 5 个项目的落地情况：commit、许可证、体积、文件数、关键计数
// 用法: node _tools/inventory.mjs
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');

const items = [
  { dir: '01-Shaders-WebGPU', name: 'Shaders', repo: 'https://github.com/shader-effects-inc/shaders' },
  { dir: '02-Micro-ReactBits', name: 'Micro (React Bits)', repo: 'https://github.com/DavidHDev/react-bits' },
  { dir: '03-oil-ui', name: 'oil-ui', repo: 'https://github.com/oil-oil/oil-ui' },
  { dir: '04-design-systems', name: 'design-systems', repo: 'https://github.com/ruiqichenbiec/design-systems' },
  { dir: '05-onetake', name: 'onetake', repo: 'https://github.com/feitangyuan/onetake' },
];

async function walk(dir, acc = { files: 0, bytes: 0 }, skipGit = true) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skipGit && e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc, skipGit);
    else {
      acc.files++;
      acc.bytes += (await stat(p)).size;
    }
  }
  return acc;
}

const git = (dir, args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const rows = [];
for (const it of items) {
  const dir = join(rootDir, it.dir);
  const acc = await walk(dir);
  let license = '';
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      const t = await readFile(join(dir, f), 'utf8');
      license = t.split('\n').find((l) => l.trim().length > 0)?.trim().slice(0, 60) ?? '';
      break;
    } catch {}
  }
  rows.push({
    item: it.name,
    dir: it.dir,
    repo: it.repo,
    commit: git(dir, ['rev-parse', '--short', 'HEAD']),
    commitDate: git(dir, ['log', '-1', '--format=%ad', '--date=short']),
    commitSubject: git(dir, ['log', '-1', '--format=%s']),
    worktreeClean: git(dir, ['status', '--porcelain']) === '',
    files: acc.files,
    sizeMB: +(acc.bytes / 1024 / 1024).toFixed(1),
    licenseFile: license ? license.replace(/\s+/g, ' ') : '',
  });
}

console.log(JSON.stringify(rows, null, 2));

/* 参考图取色器：解码 PNG（8bit / 非隔行），输出尺寸、主色分布、指定坐标的颜色。
 * 用法： node _verify/png-sample.mjs <file.png> [x,y ...]
 * 目的：做截图还原时用真实像素定色，而不是凭印象猜。 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodePNG(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len + 4;
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error('只支持 8bit，实际 ' + bitDepth);
  if (interlace) throw new Error('不支持隔行');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持 colorType ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) cur[x] = (cur[x] + a) & 255;
      else if (filter === 2) cur[x] = (cur[x] + b) & 255;
      else if (filter === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, channels, data: out, palette };
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

const file = process.argv[2];
const pts = process.argv.slice(3).map((s) => s.split(',').map(Number));
const { w, h, channels, data } = decodePNG(file);

function px(x, y) {
  const i = (y * w + x) * channels;
  return [data[i], data[i + 1], data[i + 2]];
}

console.log(`文件 ${file}`);
console.log(`尺寸 ${w}×${h}  channels=${channels}`);

// 主色：总量 1/4 抽样，按出现次数排序
const counts = new Map();
for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
  const [r, g, b] = px(x, y);
  const k = (r << 16) | (g << 8) | b;
  counts.set(k, (counts.get(k) || 0) + 1);
}
const total = [...counts.values()].reduce((s, v) => s + v, 0);
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
console.log('主色（抽样 1/4）:');
for (const [k, n] of top) {
  const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255;
  console.log(`  ${hex(r, g, b)}  ${(n / total * 100).toFixed(2).padStart(5)}%   rgb(${r},${g},${b})`);
}

// 平均色
let sr = 0, sg = 0, sb = 0, c = 0;
for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
  const [r, g, b] = px(x, y); sr += r; sg += g; sb += b; c++;
}
console.log(`平均色 ${hex(Math.round(sr / c), Math.round(sg / c), Math.round(sb / c))}`);

if (pts.length) {
  console.log('指定坐标:');
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= w || y >= h) { console.log(`  (${x},${y}) 越界`); continue; }
    const [r, g, b] = px(x, y);
    console.log(`  (${x},${y})  ${hex(r, g, b)}  rgb(${r},${g},${b})`);
  }
}

// 水平扫描：给一行，找出颜色变化的位置（量对齐线用）
if (process.env.SCAN_Y) {
  const y = Number(process.env.SCAN_Y);
  let last = null, runs = [];
  for (let x = 0; x < w; x++) {
    const h2 = hex(...px(x, y));
    if (h2 !== last) { runs.push([x, h2]); last = h2; }
  }
  if (runs.length < 60) {
    console.log(`水平扫描 y=${y}（颜色变化 ${runs.length} 处）:`);
    runs.forEach(([x, c2]) => console.log(`  x=${x}  ${c2}`));
  } else {
    console.log(`水平扫描 y=${y} 变化过多（${runs.length}），前 40 处:`);
    runs.slice(0, 40).forEach(([x, c2]) => console.log(`  x=${x}  ${c2}`));
  }
}

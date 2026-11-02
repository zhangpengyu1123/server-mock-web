/* 修：app.js 里主题函数块被插入了两次（第二次是早先误跑补丁造成），删掉后一份旧块 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'v8-blackbox-terminal/app.js';
let s = readFileSync(P, 'utf8');

const marker = "  var THEMES = ['nier', 'white', 'codex'];";
const first = s.indexOf(marker);
const second = s.indexOf(marker, first + marker.length);

if (first < 0 || second < 0) {
  console.log('定位失败 first=' + first + ' second=' + second);
  process.exit(0);
}
// 第二份块的起点：往回退到块前的空白行
let startDel = second;
const head = s.lastIndexOf('function loadTheme() {', second); // 确保不是我们要删的
// 删除范围：从第二份 marker 到 "  function saveLayout() {" 之前
const endMarker = '  function saveLayout() {';
const endDel = s.indexOf(endMarker, second);
if (endDel < 0) { console.log('未找到 saveLayout 锚点'); process.exit(0); }

const removed = s.slice(startDel, endDel);
s = s.slice(0, startDel) + s.slice(endDel);
writeFileSync(P, s, 'utf8');
console.log('✓ 删除重复块 ' + removed.split('\n').length + ' 行');
console.log('剩余 THEMES 定义 ×' + (s.match(/var THEMES = \['nier', 'white', 'codex'\];/g) || []).length);
console.log('剩余 applyTheme ×' + (s.match(/function applyTheme\(/g) || []).length);
console.log('themeSel 监听 ×' + (s.match(/themeSel'\) applyTheme/g) || []).length);

#!/usr/bin/env node
/* Tauri 桌面壳适配：绝对路径 /api 请求指向本机 W 端 9601（tauri:// 下相对路径不可用） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ① 常量：桌面壳探测 + API 基址 */
rep(`  function headers(extra) {`,
`  // 桌面壳（Tauri）里页面来自 tauri://localhost，相对 /api 不可用 → 指向本机 W 端
  const IS_TAURI = (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost');
  const API_BASE = IS_TAURI ? 'http://127.0.0.1:9601' : '';

  function apiUrl(path) {
    if (!API_BASE) return path;
    if (/^https?:\\/\\//i.test(path)) return path;
    return API_BASE + (path.startsWith('/') ? path : '/' + path);
  }

  function headers(extra) {`, 'tauri base');

/* ② api() 走 apiUrl */
rep(`  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: 'include' }, opts || {}));`,
`  async function api(path, opts) {
    const r = await fetch(apiUrl(path), Object.assign({ credentials: 'include' }, opts || {}));`, 'api uses base');

/* ③ 场景索引与预置 JSON 也走 apiUrl */
rep(`      try { S.scenes = await fetch('./scenes/index.json', { cache: 'no-store' }).then((r) => r.json()); } catch (e) { S.scenes = []; }`,
    `      try { S.scenes = await fetch(apiUrl('./scenes/index.json'), { cache: 'no-store' }).then((r) => r.json()); } catch (e) { S.scenes = []; }`, 'scenes index');
rep(`          || await fetch('./scenes/' + file, { cache: 'no-store' }).then((r) => r.json());`,
    `          || await fetch(apiUrl('./scenes/' + file), { cache: 'no-store' }).then((r) => r.json());`, 'preset fetch');

/* ④ 桌面壳里用 W 端数据，登录门直接放行（meta 来自 9601 → authRequired=false 已可放行） */
writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

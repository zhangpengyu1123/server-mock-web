// 通过 CDP 截取桌面壳（WebView2）里的页面截图，保存为 PNG
import { writeFileSync } from 'node:fs';
const out = process.argv[2] || 'desktop-cdp.png';
const LIST = 'http://127.0.0.1:9222/json/list';
const list = await fetch(LIST).then((r) => r.json());
if (!list.length) { console.log('  没有 target'); process.exit(1); }
const sock = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let id = 0;
const send = (method, params) => new Promise((res) => {
  const mid = ++id;
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { sock.removeEventListener('message', h); res(m); } };
  sock.addEventListener('message', h);
  sock.send(JSON.stringify({ id: mid, method, params }));
});
const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (!r.result || !r.result.data) { console.log('  截图失败: ' + JSON.stringify(r).slice(0, 200)); process.exit(1); }
writeFileSync(out, Buffer.from(r.result.data, 'base64'));
console.log('  已保存 ' + out + '  (' + Math.round(Buffer.from(r.result.data, 'base64').length / 1024) + ' KB)');
sock.close();

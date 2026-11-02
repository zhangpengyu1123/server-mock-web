// 通过 WebView2 远程调试端口读取桌面壳里业务面的实际渲染状态
const LIST = 'http://127.0.0.1:9222/json/list';

const list = await fetch(LIST).then((r) => r.json());
if (!list.length) { console.log('  没有可用的 CDP target'); process.exit(1); }
for (const t of list) console.log('  target: ' + JSON.stringify(t.title) + '  ' + t.url);

const sock = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });

let id = 0;
const send = (method, params) => new Promise((res) => {
  const mid = ++id;
  const h = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === mid) { sock.removeEventListener('message', h); res(m); }
  };
  sock.addEventListener('message', h);
  sock.send(JSON.stringify({ id: mid, method, params }));
});

const expr = `JSON.stringify({
  title: document.title,
  view: (document.querySelector('.pl-hd h1') || {}).textContent,
  ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
  accent: getComputedStyle(document.documentElement).getPropertyValue('--signal').trim(),
  nav: document.querySelectorAll('[data-view]').length,
  cards: document.querySelectorAll('.pl-card').length,
})`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log('  DOM: ' + (r.result && r.result.result ? r.result.result.value : JSON.stringify(r)));
sock.close();

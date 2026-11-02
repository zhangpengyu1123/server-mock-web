// 桌面壳自绘标题栏验证：drag region / 窗口按钮 / 无边框
const LIST = 'http://127.0.0.1:9222/json/list';
const list = await fetch(LIST).then((r) => r.json());
if (!list.length) { console.log('没有 CDP target'); process.exit(1); }
console.log('  target: ' + list[0].title + '  ' + list[0].url);

const sock = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let id = 0;
const send = (method, params) => new Promise((res) => {
  const mid = ++id;
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { sock.removeEventListener('message', h); res(m); } };
  sock.addEventListener('message', h);
  sock.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.text);
  return r.result && r.result.result ? r.result.result.value : JSON.stringify(r);
};

console.log('  is-tauri class: ' + await evalJs("document.documentElement.classList.contains('is-tauri')"));
console.log('  drag region:    ' + await evalJs("!!document.querySelector('.pl-top[data-tauri-drag-region]')"));
console.log('  窗口按钮可见:   ' + await evalJs("(() => { const b = document.querySelector('#plWinCtl'); if (!b) return 'missing'; const cs = getComputedStyle(b); return cs.display + ' / ' + b.querySelectorAll('[data-win]').length + ' 按钮'; })()"));
console.log('  __TAURI_INTERNALS__: ' + await evalJs("typeof window.__TAURI_INTERNALS__"));
console.log('  invoke 可用:    ' + await evalJs("!!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)"));

// 实测最小化：调用后窗口应隐藏（isMinimized 通过 IPC 无法直接读，改看 Promise 是否 resolve）
console.log('  minimize → ' + await evalJs("window.__TAURI_INTERNALS__.invoke('plugin:window|minimize', { label: 'main' }).then(() => 'resolved').catch((e) => 'rejected: ' + e)"));
sock.close();

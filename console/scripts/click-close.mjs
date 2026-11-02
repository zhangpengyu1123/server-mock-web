// 实测窗口按钮：点击「关闭」后进程应退出
const LIST = 'http://127.0.0.1:9222/json/list';
const list = await fetch(LIST).then((r) => r.json());
if (!list.length) { console.log('  没有 target'); process.exit(1); }
const sock = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });

const send = (id, method, params) => sock.send(JSON.stringify({ id, method, params }));
// 模拟点击自绘标题栏的关闭按钮（走真实事件路径）
send(1, 'Runtime.evaluate', {
  expression: "document.querySelector('[data-win=\"close\"]').click()",
  returnByValue: true,
});
console.log('  已点击关闭按钮');
await new Promise((r) => setTimeout(r, 1500));
try { sock.close(); } catch (e) {}

#!/usr/bin/env node
/* 把后台自动推进的 spawn 移到 AppState 创建之后（避免 use of moved value） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/apps/agent/src/main.rs';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

// 1) 删除现有块
const s = lines.findIndex((l) => l.includes('// 任务自动推进（3s 一拍）'));
if (s >= 0) {
  let e = s;
  while (e < lines.length && !lines[e].includes('let listener = tokio::net::TcpListener::bind(addr)')) e++;
  lines.splice(s, e - s);
  console.log('ok   移除旧位置块');
}

// 2) 找到 AppState 创建结束位置
const st0 = lines.findIndex((l) => l.includes('let st = Arc::new(AppState {'));
if (st0 < 0) { console.log('MISS AppState'); process.exit(1); }
let close = st0;
let depth = 0, started = false;
for (let i = st0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') depth--;
  }
  if (started && depth === 0) { close = i; break; }
}
// close 指向 `});`
const block = [
  '',
  '    // 任务自动推进（3s 一拍）：让无人工阶段自己往前走',
  '    {',
  '        let auto_store = st.store.clone();',
  '        tokio::spawn(async move {',
  '            let mut tick = tokio::time::interval(Duration::from_secs(3));',
  '            loop {',
  '                tick.tick().await;',
  '                let n = auto_store.auto_tick(2500);',
  '                if n > 0 {',
  '                    auto_store.push_log("agent", "task.auto", &format!("自动推进 {} 个任务", n), "info");',
  '                }',
  '            }',
  '        });',
  '    }',
];
lines = [...lines.slice(0, close + 1), ...block, ...lines.slice(close + 1)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   已插入到 AppState 之后（L' + (close + 2) + '）');

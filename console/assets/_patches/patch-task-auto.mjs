#!/usr/bin/env node
/* 任务自动推进：无待确认人机交互的 running 阶段，每 3s 推进一步；前端时间线自动轮询 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
function patch(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [from, to, tag] of pairs) {
    if (!t.includes(from)) { log.push('MISS ' + tag); continue; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  }
  writeFileSync(file, t, 'utf8');
}

/* model：UpgradeTask 增加 updated_at */
patch('console/crates/core/src/model.rs', [
  ['    pub stages: Vec<UpgradeStage>,\n    pub created_at: Millis,\n}',
   '    pub stages: Vec<UpgradeStage>,\n    pub created_at: Millis,\n    #[serde(default)]\n    pub updated_at: Millis,\n}', 'task updated_at'],
]);

/* store：构造时写入 + auto_tick */
patch('console/crates/core/src/store.rs', [
  ['            created_at: now_ms(),\n        };\n        i.tasks.push(task.clone());',
   '            created_at: now_ms(),\n            updated_at: now_ms(),\n        };\n        i.tasks.push(task.clone());', 'create updated_at'],
  ['    // ---------------- 审计 ----------------',
`    /// 自动推进：没有待确认人机交互的当前阶段，按节拍前进
    pub fn auto_tick(&self, dwell_ms: i64) -> usize {
        let mut i = self.inner.lock().unwrap();
        let now = now_ms();
        let mut changed = 0;
        let n = i.tasks.len();
        for idx in 0..n {
            let t = &i.tasks[idx];
            if t.stage + 1 >= t.stages.len() {
                continue;
            }
            let cur = &t.stages[t.stage];
            if cur.state != "running" {
                continue;
            }
            // 有人机交互且未确认 → 不自动推进
            if let Some(h) = &cur.human {
                if h.state == "pending" {
                    continue;
                }
            }
            if now - t.updated_at < dwell_ms {
                continue;
            }
            let t = &mut i.tasks[idx];
            t.stages[t.stage].state = "done".into();
            let next = t.stage + 1;
            t.stage = next;
            t.stages[next].state = "running".into();
            t.progress = (((next + 1) as f32 / t.stages.len() as f32) * 100.0) as u8;
            if next + 1 >= t.stages.len() {
                t.stages[next].state = "done".into();
                t.progress = 100;
            }
            t.updated_at = now;
            changed += 1;
        }
        if changed > 0 {
            let _ = self.persist_locked(&i);
        }
        changed
    }

    // ---------------- 审计 ----------------`, 'store auto_tick'],
]);

/* 人工确认后刷新 updated_at */
patch('console/crates/core/src/store.rs', [
  ['        let out = i.tasks[idx].clone();\n        self.persist_locked(&i)?;\n        Ok(out)\n    }\n\n    /// 自动推进',
   '        i.tasks[idx].updated_at = now_ms();\n        let out = i.tasks[idx].clone();\n        self.persist_locked(&i)?;\n        Ok(out)\n    }\n\n    /// 自动推进', 'resolve updated_at'],
]);

/* agent：启动后台 tick */
patch('console/apps/agent/src/main.rs', [
  ['    let listener = tokio::net::TcpListener::bind(addr)',
`    // 任务自动推进（3s 一拍）：让无人工阶段自己往前走
    {
        let store = st.store.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(3));
            loop {
                tick.tick().await;
                let n = store.auto_tick(2500);
                if n > 0 {
                    store.push_log("agent", "task.auto", &format!("自动推进 {} 个任务", n), "info");
                }
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(addr)`, 'spawn auto tick'],
]);

console.log(log.join('\n'));

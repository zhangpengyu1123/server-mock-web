#!/usr/bin/env node
/* 用行号补齐：HumanStep 构造的 since + expire/retry 方法 + resolve 清 since */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/crates/core/src/store.rs';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

// ① HumanStep 字面量里补 since
const h = lines.findIndex((l) => l.includes('let human = |prompt: &str, timeout_s: u32| HumanStep {'));
if (h >= 0) {
  for (let i = h; i < h + 12; i++) {
    if (lines[i].trim() === 'timeout_s,') {
      lines.splice(i + 1, 0, '            since: now_ms(),');
      log.push('ok   HumanStep.since');
      break;
    }
  }
}

// ② 在 auto_tick 之前插入 expire_humans / retry_human
const at = lines.findIndex((l) => l.includes('pub fn auto_tick(&self, dwell_ms: i64) -> usize {'));
if (at > 0) {
  const ins = `    /// 人机交互超时：到点置 expired，阶段挂起（held）
    pub fn expire_humans(&self) -> usize {
        let mut i = self.inner.lock().unwrap();
        let now = now_ms();
        let mut n = 0;
        for t in i.tasks.iter_mut() {
            if t.progress >= 100 { continue; }
            for idx in 0..t.stages.len() {
                let is_pending = t.stages[idx].human.as_ref().map(|h| h.state == "pending").unwrap_or(false);
                if !is_pending { continue; }
                let expired = t.stages[idx]
                    .human
                    .as_ref()
                    .map(|h| h.since > 0 && now - h.since > (h.timeout_s as i64) * 1000)
                    .unwrap_or(false);
                if !expired { continue; }
                if let Some(hh) = t.stages[idx].human.as_mut() { hh.state = "expired".into(); }
                if t.stages[idx].state == "running" { t.stages[idx].state = "held".into(); }
                t.updated_at = now;
                n += 1;
            }
        }
        if n > 0 { let _ = self.persist_locked(&i); }
        n
    }

    /// 超时后重新发起人工确认
    pub fn retry_human(&self, id: &str) -> Result<UpgradeTask> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.tasks.iter().position(|t| t.id == id).ok_or(Error::NotFound)?;
        {
            let t = &mut i.tasks[idx];
            let si = t.stage;
            if let Some(hh) = t.stages[si].human.as_mut() {
                hh.state = "pending".into();
                hh.chosen = None;
                hh.since = now_ms();
            }
            t.stages[si].state = "running".into();
            t.updated_at = now_ms();
        }
        let out = i.tasks[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

`.split('\n');
  // 找到 auto_tick 上方的注释行起点
  let start = at;
  while (start > 0 && (lines[start - 1].trim().startsWith('///') || lines[start - 1].trim() === '')) start--;
  lines = [...lines.slice(0, start), ...ins, ...lines.slice(start)];
  log.push('ok   expire_humans / retry_human');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));

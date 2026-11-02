#!/usr/bin/env node
/* 人机交互超时：HumanStep 增加 since；auto_tick 到点置 expired + 阶段 held；前端提示可重新确认 */
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

/* model：since */
patch('console/crates/core/src/model.rs', [
  ['    #[serde(default)]\n    pub chosen: Option<usize>,\n    pub timeout_s: u32,\n}',
   '    #[serde(default)]\n    pub chosen: Option<usize>,\n    pub timeout_s: u32,\n    /// 进入 pending 的时间（用于超时判定）\n    #[serde(default)]\n    pub since: Millis,\n}', 'human since'],
]);

/* store：创建时写 since + auto_tick 处理超时 */
patch('console/crates/core/src/store.rs', [
  ['            state: "pending".into(),\n            chosen: None,\n            timeout_s,\n        };',
   '            state: "pending".into(),\n            chosen: None,\n            timeout_s,\n            since: now_ms(),\n        };', 'create since'],
  ['    /// 自动推进：没有待确认人机交互的当前阶段，按节拍前进\n    pub fn auto_tick(&self, dwell_ms: i64) -> usize {',
`    /// 人机交互超时：到点置 expired，阶段挂起（held）
    pub fn expire_humans(&self) -> usize {
        let mut i = self.inner.lock().unwrap();
        let now = now_ms();
        let mut n = 0;
        for t in i.tasks.iter_mut() {
            if t.progress >= 100 { continue; }
            for idx in 0..t.stages.len() {
                let is_pending = t.stages[idx]
                    .human
                    .as_ref()
                    .map(|h| h.state == "pending")
                    .unwrap_or(false);
                if !is_pending { continue; }
                let expired = t.stages[idx]
                    .human
                    .as_ref()
                    .map(|h| h.since > 0 && now - h.since > (h.timeout_s as i64) * 1000)
                    .unwrap_or(false);
                if !expired { continue; }
                if let Some(h) = t.stages[idx].human.as_mut() {
                    h.state = "expired".into();
                }
                if t.stages[idx].state == "running" {
                    t.stages[idx].state = "held".into();
                }
                t.updated_at = now;
                n += 1;
            }
        }
        if n > 0 { let _ = self.persist_locked(&i); }
        n
    }

    /// 重新发起人工确认（超时后重试）
    pub fn retry_human(&self, id: &str) -> Result<UpgradeTask> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.tasks.iter().position(|t| t.id == id).ok_or(Error::NotFound)?;
        {
            let t = &mut i.tasks[idx];
            let si = t.stage;
            if let Some(h) = t.stages[si].human.as_mut() {
                h.state = "pending".into();
                h.chosen = None;
                h.since = now_ms();
            }
            t.stages[si].state = "running".into();
            t.updated_at = now_ms();
        }
        let out = i.tasks[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    /// 自动推进：没有待确认人机交互的当前阶段，按节拍前进
    pub fn auto_tick(&self, dwell_ms: i64) -> usize {`, 'store expire/retry'],
  // 人工确认后把 since 清掉（避免再次超时）
  ['        i.tasks[idx].updated_at = now_ms();\n        let out = i.tasks[idx].clone();',
   '        i.tasks[idx].updated_at = now_ms();\n        if let Some(h) = i.tasks[idx].stages[i.tasks[idx].stage].human.as_mut() { h.since = 0; }\n        let out = i.tasks[idx].clone();', 'resolve clear since'],
]);

/* main：agent tick 里调用 expire + 路由重试 */
patch('console/apps/agent/src/main.rs', [
  ['                let n = auto_store.auto_tick(2500);',
   '                let e = auto_store.expire_humans();\n                if e > 0 { auto_store.push_log("agent", "human.expire", &format!("{} 个人工确认超时", e), "warn"); }\n                let n = auto_store.auto_tick(2500);', 'tick expire'],
  ['async fn business_purge_tasks(',
`async fn business_retry_human(
    st: Ctx, headers: HeaderMap, Path(id): Path<String>,
) -> ApiResult<Json<UpgradeTask>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.retry_human(&id)?))
}

async fn business_purge_tasks(`, 'handler retry'],
  ['.route("/business/tasks/:id/human", post(business_resolve_human))',
   `.route("/business/tasks/:id/human", post(business_resolve_human))
        .route("/business/tasks/:id/human/retry", post(business_retry_human))`, 'route retry'],
]);

console.log(log.join('\n'));

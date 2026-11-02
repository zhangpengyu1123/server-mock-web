#!/usr/bin/env node
/* 清理测试任务：POST /api/business/tasks/purge（删除已完成/失败任务） */
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

patch('console/crates/core/src/store.rs', [
  ['    /// 自动推进：没有待确认人机交互的当前阶段，按节拍前进',
`    /// 清理：删除已完成（progress>=100）或已失败的任务
    pub fn purge_tasks(&self) -> usize {
        let mut i = self.inner.lock().unwrap();
        let before = i.tasks.len();
        i.tasks.retain(|t| {
            let failed = t.stages.iter().any(|s| s.state == "failed");
            !(t.progress >= 100 || failed)
        });
        let removed = before - i.tasks.len();
        if removed > 0 {
            let _ = self.persist_locked(&i);
        }
        removed
    }

    /// 自动推进：没有待确认人机交互的当前阶段，按节拍前进`, 'store purge'],
]);

patch('console/apps/agent/src/main.rs', [
  ['async fn business_tasks(',
`async fn business_purge_tasks(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let removed = st.store.purge_tasks();
    st.store.push_log("business", "task.purge", &format!("清理 {} 个任务", removed), "info");
    Ok(Json(json!({ "removed": removed })))
}

async fn business_tasks(`, 'handler purge'],
  ['.route("/business/tasks", get(business_tasks).post(business_create_task))',
   `.route("/business/tasks", get(business_tasks).post(business_create_task))
        .route("/business/tasks/purge", post(business_purge_tasks))`, 'route purge'],
]);

/* UI：任务摘要里加清理按钮 */
patch('console/ui/business/plane.js', [
  [`          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div>`,
`          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskPurge">清理已完成</button>
            <button class="pl-btn pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button>
          </div>`, 'ui purge button'],
  [`    const quick = $('#btnTaskQuick');`,
`    const purge = $('#btnTaskPurge');
    if (purge) purge.addEventListener('click', async () => {
      try {
        await api('/api/business/tasks/purge', { method: 'POST', headers: headers(), body: '{}' });
        await loadTasks();
        S.taskSel = (S.tasks[0] || {}).id || null;
      } catch (e) { console.warn(e); }
      render();
    });
    const quick = $('#btnTaskQuick');`, 'ui purge binding'],
]);

console.log(log.join('\n'));

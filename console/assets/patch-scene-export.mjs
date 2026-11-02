#!/usr/bin/env node
/* 导出 / 导入 业务面场景（端到端 JSON 快照） */
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

/* ---------- store ---------- */
patch('console/crates/core/src/store.rs', [
  ['    /// 清理：删除已完成（progress>=100）或已失败的任务',
`    /// 导出场景：业务面九块工作台的完整数据
    pub fn export_scene(&self) -> serde_json::Value {
        let i = self.inner.lock().unwrap();
        serde_json::json!({
            "kind": "rhine-lab-scene",
            "version": 1,
            "exported_at": now_ms(),
            "endpoints": i.endpoints,
            "elements": i.elements,
            "groups": i.groups,
            "packages": i.packages,
            "platform": i.platform,
            "human": i.human,
            "mappings": i.mappings,
        })
    }

    /// 导入场景：整体覆盖（保留用户与会话）
    pub fn import_scene(&self, v: serde_json::Value) -> Result<usize> {
        let mut i = self.inner.lock().unwrap();
        let get = |k: &str| v.get(k).cloned().unwrap_or(serde_json::Value::Null);
        let mut count = 0usize;
        if let Ok(x) = serde_json::from_value::<Vec<model::MockEndpoint>>(get("endpoints")) { count += x.len(); i.endpoints = x; }
        if let Ok(x) = serde_json::from_value::<Vec<model::NetworkElement>>(get("elements")) { count += x.len(); i.elements = x; }
        if let Ok(x) = serde_json::from_value::<Vec<model::ElementGroup>>(get("groups")) { count += x.len(); i.groups = x; }
        if let Ok(x) = serde_json::from_value::<Vec<model::SoftwarePackage>>(get("packages")) { count += x.len(); i.packages = x; }
        if let Ok(x) = serde_json::from_value::<model::PlatformCfg>(get("platform")) { i.platform = x; count += 1; }
        if let Ok(x) = serde_json::from_value::<model::HumanTemplate>(get("human")) { i.human = x; count += 1; }
        if let Ok(x) = serde_json::from_value::<Vec<model::Mapping>>(get("mappings")) { count += x.len(); i.mappings = x; }
        self.persist_locked(&i)?;
        Ok(count)
    }

    /// 清理：删除已完成（progress>=100）或已失败的任务`, 'store export/import'],
]);

/* ---------- agent 路由 ---------- */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_retry_human(',
`async fn business_export(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.export_scene()))
}

async fn business_import(
    st: Ctx, headers: HeaderMap, Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    if u.role != "admin" {
        return Err(Error::Forbidden);
    }
    let n = st.store.import_scene(body)?;
    st.store.push_log("business", "scene.import", &format!("导入 {} 条记录", n), "info");
    Ok(Json(json!({ "imported": n })))
}

async fn business_retry_human(`, 'handlers export/import'],
  ['.route("/business/tasks/purge", post(business_purge_tasks))',
   `.route("/business/tasks/purge", post(business_purge_tasks))
        .route("/business/export", get(business_export))
        .route("/business/import", post(business_import))`, 'routes export/import'],
]);

console.log(log.join('\n'));

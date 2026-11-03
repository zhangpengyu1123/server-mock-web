// 后端：新增「删除虚机（服务器）」——级联删除该虚机下的服务
// 1) store.rs: delete_node(&self, id) -> Result<usize>（返回被级联删除的服务数）
// 2) main.rs: DELETE /admin/nodes/:id
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];

/* ---------------------------------------------------------------- store.rs */
{
  const P = 'console/crates/core/src/store.rs';
  let t = readFileSync(P, 'utf8');
  if (t.includes('pub fn delete_node')) {
    log.push('skip store.delete_node（已存在）');
  } else {
    const anchor = '    pub fn delete_mapping(&self, user: &AuthUser, id: &str) -> Result<()> {';
    if (!t.includes(anchor)) throw new Error('MISS delete_mapping 锚点');
    const fn = `    /// 删除虚机（服务器）。级联删除挂在该虚机下的服务，返回被删服务数。
    pub fn delete_node(&self, id: &str) -> Result<usize> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.nodes.iter().position(|n| n.id == id).ok_or(Error::NotFound)?;
        let node = i.nodes.remove(idx);
        let before = i.mappings.len();
        i.mappings.retain(|m| m.node_id != id);
        let removed = before - i.mappings.len();
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(
            "admin",
            "node.delete",
            &format!("删除虚机 {}（级联服务 {} 个）", node.id, removed),
            "warn",
        );
        Ok(removed)
    }

${anchor}`;
    t = t.replace(anchor, fn);
    writeFileSync(P, t, 'utf8');
    log.push('ok   store.delete_node');
  }
}

/* ---------------------------------------------------------------- main.rs */
{
  const P = 'console/apps/agent/src/main.rs';
  let t = readFileSync(P, 'utf8');

  if (!t.includes('async fn admin_delete_node')) {
    const anchor = 'async fn admin_deploy(';
    if (!t.includes(anchor)) throw new Error('MISS admin_deploy 锚点');
    const handler = `async fn admin_delete_node(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let u = auth_admin(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let removed = st.store.delete_node(&id)?;
    Ok(Json(json!({ "ok": true, "removed_services": removed })))
}

${anchor}`;
    t = t.replace(anchor, handler);
    log.push('ok   admin_delete_node handler');
  } else log.push('skip handler（已存在）');

  // 路由：/admin/nodes/:id → DELETE
  const routeAnchor = '        .route("/admin/nodes/:id/deploy", post(admin_deploy))';
  if (t.includes(routeAnchor) && !t.includes('.route("/admin/nodes/:id", delete(admin_delete_node))')) {
    t = t.replace(routeAnchor,
      '        .route("/admin/nodes/:id", delete(admin_delete_node))\n' + routeAnchor);
    log.push('ok   路由 DELETE /admin/nodes/:id');
  } else log.push('skip 路由（已存在或锚点缺失）');

  writeFileSync(P, t, 'utf8');
}

console.log(log.join('\n'));

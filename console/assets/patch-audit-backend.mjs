#!/usr/bin/env node
/* 请求/响应审计：MockHit 记录 + GET /api/business/audit + 运行审计页接真数据 */
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

/* model: MockHit */
patch('console/crates/core/src/model.rs', [
  ['/// Mock 监听端点：本机 IP:端口', `/// 一次 mock 命中记录（审计用）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MockHit {
    pub at: Millis,
    pub mapping_id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub delay_ms: u32,
    pub human: bool,
}

/// Mock 监听端点：本机 IP:端口`, 'model hit'],
]);

/* store: hits 队列 + 记录 + 查询 */
patch('console/crates/core/src/store.rs', [
  ['struct Inner {', 'struct Inner {\n    hits: VecDeque<MockHit>,', 'inner hits'],
  ['endpoints: vec![],', 'endpoints: vec![],\n            hits: VecDeque::new(),', 'inner init hits'],
  ['inner.endpoints = p.endpoints;', 'inner.endpoints = p.endpoints;\n                        inner.hits = p.hits;', 'load hits'],
  ['#[serde(default)]\n    endpoints: Vec<MockEndpoint>,',
   '#[serde(default)]\n    endpoints: Vec<MockEndpoint>,\n    #[serde(default)]\n    hits: VecDeque<MockHit>,', 'persisted hits'],
  ['endpoints: inner.endpoints.clone(),', 'endpoints: inner.endpoints.clone(),\n            hits: inner.hits.clone(),', 'persist hits'],
  ['    // ---------------- MOCK 规则 ----------------', `    // ---------------- 审计 ----------------
    pub fn log_hit(&self, hit: MockHit) {
        let mut i = self.inner.lock().unwrap();
        i.hits.push_front(hit);
        while i.hits.len() > 200 { i.hits.pop_back(); }
        let _ = self.persist_locked(&i);
    }

    pub fn hits(&self, limit: usize) -> Vec<MockHit> {
        let i = self.inner.lock().unwrap();
        i.hits.iter().take(limit.clamp(1, 200)).cloned().collect()
    }

    // ---------------- MOCK 规则 ----------------`, 'store hits'],
]);

/* main: 记录命中 + 路由 */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_patch_rules(', `async fn business_audit(
    st: Ctx,
    headers: HeaderMap,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Json<Vec<MockHit>>> {
    let _u = auth(&st, &headers)?;
    let limit = q.get("limit").and_then(|v| v.parse::<usize>().ok()).unwrap_or(80);
    Ok(Json(st.store.hits(limit)))
}

async fn business_patch_rules(`, 'handler audit'],

  ['.route("/business/mappings/:id/rules", patch(business_patch_rules))',
   `.route("/business/audit", get(business_audit))
        .route("/business/mappings/:id/rules", patch(business_patch_rules))`, 'route audit'],

  // 引擎末尾记录命中
  [`    res.headers_mut().insert(
        header::HeaderName::from_static("x-rhine-mapping"),
        HeaderValue::from_str(&m.id).unwrap_or_else(|_| HeaderValue::from_static("-")),
    );
    res`,
   `    res.headers_mut().insert(
        header::HeaderName::from_static("x-rhine-mapping"),
        HeaderValue::from_str(&m.id).unwrap_or_else(|_| HeaderValue::from_static("-")),
    );
    st.store.log_hit(MockHit {
        at: now_ms(),
        mapping_id: m.id.clone(),
        method: method.as_str().to_string(),
        path: path.clone(),
        status: m.status,
        delay_ms: m.delay_ms,
        human: false,
    });
    res`, 'engine log hit'],

  // 人机交互挂起也记一条
  [`            let mut res = (StatusCode::ACCEPTED, Json(payload)).into_response();
            res.headers_mut().insert(
                header::HeaderName::from_static("x-rhine-human"),
                HeaderValue::from_static("pending"),
            );
            return res;`,
   `            let mut res = (StatusCode::ACCEPTED, Json(payload)).into_response();
            res.headers_mut().insert(
                header::HeaderName::from_static("x-rhine-human"),
                HeaderValue::from_static("pending"),
            );
            st.store.log_hit(MockHit {
                at: now_ms(),
                mapping_id: m.id.clone(),
                method: method.as_str().to_string(),
                path: path.clone(),
                status: 202,
                delay_ms: m.delay_ms,
                human: true,
            });
            return res;`, 'engine log human'],
]);

console.log(log.join('\n'));

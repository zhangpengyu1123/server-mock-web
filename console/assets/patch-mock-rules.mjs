#!/usr/bin/env node
/* MOCK 规则落库 + 引擎执行
   model: RuleField / RuleHuman / RuleOption；Mapping 增加 fields / human / counter
   engine: 按字段生成 JSON（static 支持 {{req.x}} / autoIncrement / once / condition 三元），
           human.state=pending 时返回 202 + 待确认；解析接口 POST /api/mock/human/:id */
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

/* ---------- model ---------- */
const EXTRA = `
// ---------------- MOCK 响应规则 ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuleField {
    pub name: String,
    /// string | number | boolean | object | array
    pub kind: String,
    /// static | autoIncrement | once | condition
    pub source: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "one")]
    pub step: i64,
    #[serde(default)]
    pub max: i64,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub used: bool,
}

fn one() -> i64 { 1 }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuleOption {
    pub label: String,
    pub effect: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuleHuman {
    pub prompt: String,
    pub options: Vec<RuleOption>,
    /// pending | resolved
    pub state: String,
    #[serde(default)]
    pub chosen: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct PatchRulesReq {
    #[serde(default)]
    pub fields: Option<Vec<RuleField>>,
    #[serde(default)]
    pub human: Option<RuleHuman>,
    #[serde(default)]
    pub clear_human: bool,
}

#[derive(Debug, Deserialize)]
pub struct ResolveMockHumanReq {
    pub option: usize,
}
`;
patch('console/crates/core/src/model.rs', [
  ['/// Mock 监听端点：本机 IP:端口', EXTRA + '\n/// Mock 监听端点：本机 IP:端口', 'model rules'],
  // Mapping 增加三个字段
  ['    pub enabled: bool,\n    /// 该服务当前部署版本',
   `    pub enabled: bool,
    /// 结构化响应字段（为空时用 body 原样返回）
    #[serde(default)]
    pub fields: Vec<RuleField>,
    /// 人机交互节点
    #[serde(default)]
    pub human: Option<RuleHuman>,
    /// 该服务当前部署版本`, 'mapping fields'],
]);

/* ---------- store：规则读写 + 命中即执行（含计数） ---------- */
patch('console/crates/core/src/store.rs', [
  ['    // ---------------- 升级任务 ----------------', `    // ---------------- MOCK 规则 ----------------
    pub fn patch_rules(&self, id: &str, req: PatchRulesReq) -> Result<Mapping> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.mappings.iter().position(|m| m.id == id).ok_or(Error::NotFound)?;
        {
            let m = &mut i.mappings[idx];
            if let Some(f) = req.fields { m.fields = f; }
            if req.clear_human { m.human = None; } else if let Some(h) = req.human { m.human = Some(h); }
        }
        let out = i.mappings[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    pub fn mock_human(&self, id: &str) -> Result<Option<RuleHuman>> {
        let i = self.inner.lock().unwrap();
        let m = i.mappings.iter().find(|m| m.id == id).ok_or(Error::NotFound)?;
        Ok(m.human.clone())
    }

    /// 解析人机交互：continue → resolved；abort → 保持 pending 但记录 chosen
    pub fn resolve_mock_human(&self, id: &str, option: usize) -> Result<Mapping> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.mappings.iter().position(|m| m.id == id).ok_or(Error::NotFound)?;
        {
            let m = &mut i.mappings[idx];
            if let Some(h) = m.human.as_mut() {
                h.chosen = Some(option);
                let eff = h.options.get(option).map(|o| o.effect.clone()).unwrap_or_else(|| "continue".into());
                if eff == "continue" { h.state = "resolved".into(); }
            }
        }
        let out = i.mappings[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    /// 按规则推进计数并返回"本次响应"所需的字段快照（autoIncrement / once 在此变动）
    pub fn advance_rules(&self, id: &str) -> Result<Vec<RuleField>> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.mappings.iter().position(|m| m.id == id).ok_or(Error::NotFound)?;
        let mut snapshot = Vec::new();
        {
            let m = &mut i.mappings[idx];
            for f in m.fields.iter_mut() {
                match f.source.as_str() {
                    "autoIncrement" => {
                        f.count += f.step.max(1);
                        if f.max > 0 && f.count > f.max { f.count = f.step.max(1); }
                        let mut c = f.clone();
                        c.value = f.count.to_string();
                        snapshot.push(c);
                    }
                    "once" => {
                        let mut c = f.clone();
                        if f.used { c.value = String::new(); } else { f.used = true; }
                        snapshot.push(c);
                    }
                    _ => snapshot.push(f.clone()),
                }
            }
        }
        self.persist_locked(&i)?;
        Ok(snapshot)
    }

    // ---------------- 升级任务 ----------------`, 'store rules'],
]);

/* ---------- main：引擎执行 + 路由 ---------- */
patch('console/apps/agent/src/main.rs', [
  // 引擎重写
  [`async fn mock_engine(st: Ctx, Path(rest): Path<String>, method: Method) -> Response {
    let path = format!("/{rest}");
    let m = match st.store.hit_mock(method.as_str(), &path) {`,
   `/// 极简条件求值：支持 "a==b?X:Y"（a/b 可为 req.<字段> 或字面量）
fn eval_condition(expr: &str, body: &serde_json::Value) -> String {
    let (cond, branches) = match expr.split_once('?') { Some(v) => v, None => return expr.to_string() };
    let (yes, no) = match branches.split_once(':') { Some(v) => v, None => (branches, "") };
    let (lhs, rhs) = match cond.split_once("==") { Some(v) => v, None => return yes.trim().to_string() };
    let val = |s: &str| -> String {
        let s = s.trim().trim_matches('"');
        if let Some(k) = s.strip_prefix("req.") {
            body.get(k).map(|v| match v { serde_json::Value::String(x) => x.clone(), o => o.to_string() }).unwrap_or_default()
        } else { s.to_string() }
    };
    if val(lhs) == val(rhs) { yes.trim().trim_matches('"').to_string() } else { no.trim().trim_matches('"').to_string() }
}

/// 把规则字段拼成 JSON：点路径自动嵌套
fn build_body(fields: &[RuleField], req: &serde_json::Value, base: &str) -> String {
    let mut root = serde_json::Value::Object(Default::default());
    for f in fields {
        let raw = match f.source.as_str() {
            "condition" => eval_condition(&f.condition, req),
            "once" if f.value.is_empty() => continue,
            _ => f.value.clone(),
        };
        // {{req.x}} 插值
        let mut out = raw.clone();
        while let Some(s) = out.find("{{req.") {
            if let Some(e) = out[s..].find("}}") {
                let key = out[s + 6..s + e].to_string();
                let v = req.get(&key).map(|x| match x { serde_json::Value::String(y) => y.clone(), o => o.to_string() }).unwrap_or_default();
                out = format!("{}{}{}", &out[..s], v, &out[s + e + 2..]);
            } else { break; }
        }
        let val = match f.kind.as_str() {
            "number" => serde_json::from_str::<serde_json::Value>(&out).unwrap_or(serde_json::Value::from(0)),
            "boolean" => serde_json::Value::Bool(out == "true" || out == "1"),
            "object" | "array" => serde_json::from_str(&out).unwrap_or(serde_json::Value::String(out.clone())),
            _ => serde_json::Value::String(out),
        };
        let parts: Vec<&str> = f.name.split('.').collect();
        let mut cur = &mut root;
        for (i, p) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                cur[p] = val.clone();
            } else {
                cur = cur.as_object_mut().unwrap().entry(p.to_string()).or_insert_with(|| serde_json::Value::Object(Default::default()));
            }
        }
    }
    if root.as_object().map(|o| o.is_empty()).unwrap_or(true) { base.to_string() } else { root.to_string() }
}

async fn mock_engine(
    st: Ctx,
    Path(rest): Path<String>,
    method: Method,
    body: Option<Json<serde_json::Value>>,
) -> Response {
    let path = format!("/{rest}");
    let m = match st.store.hit_mock(method.as_str(), &path) {`, 'engine head'],

  // 命中后：人机交互挂起 + 规则响应
  [`    if m.delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(m.delay_ms as u64)).await;
    }
    let ct = HeaderValue::from_str(&m.content_type)`,
   `    // 人机交互未确认 → 202 + 待确认载荷
    if let Some(h) = m.human.as_ref() {
        if h.state == "pending" {
            let payload = json!({
                "humanPending": true,
                "mapping": m.id,
                "prompt": h.prompt,
                "options": h.options,
            });
            let mut res = (StatusCode::ACCEPTED, Json(payload)).into_response();
            res.headers_mut().insert(
                header::HeaderName::from_static("x-rhine-human"),
                HeaderValue::from_static("pending"),
            );
            return res;
        }
    }

    if m.delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(m.delay_ms as u64)).await;
    }
    let req_json = body.map(|Json(v)| v).unwrap_or_else(|| json!({}));
    let out_body = if m.fields.is_empty() {
        m.body.clone()
    } else {
        match st.store.advance_rules(&m.id) {
            Ok(fs) => build_body(&fs, &req_json, &m.body),
            Err(_) => m.body.clone(),
        }
    };
    let ct = HeaderValue::from_str(&m.content_type)`, 'engine body'],

  // 响应体换成 out_body
  [`    let mut res = Response::new(axum::body::Body::from(m.body.clone()));`,
   `    let mut res = Response::new(axum::body::Body::from(out_body));`, 'engine res'],

  // 规则接口
  ['async fn business_tasks(', `async fn business_patch_rules(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<PatchRulesReq>,
) -> ApiResult<Json<Mapping>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_rules(&id, req)?))
}

async fn business_resolve_mock_human(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ResolveMockHumanReq>,
) -> ApiResult<Json<Mapping>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let m = st.store.resolve_mock_human(&id, req.option)?;
    st.store.push_log("business", "mock.human", &format!("人机交互 {}", m.id), "info");
    Ok(Json(m))
}

async fn business_tasks(`, 'handlers rules'],

  ['.route("/business/tasks", get(business_tasks).post(business_create_task))',
   `.route("/business/mappings/:id/rules", patch(business_patch_rules))
        .route("/business/mappings/:id/human", post(business_resolve_mock_human))
        .route("/business/tasks", get(business_tasks).post(business_create_task))`, 'routes rules'],
]);

console.log(log.join('\n'));

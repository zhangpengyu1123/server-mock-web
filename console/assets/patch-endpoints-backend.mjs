#!/usr/bin/env node
/* 后端：Mock 端点（host/port/能力/证书/启停）落库 + 路由
   - core/model.rs: MockEndpoint / MockCert / 请求体
   - core/store.rs: Persisted+Inner 增加 endpoints，seed 一个演示端点，增删改与签发证书
   - apps/agent/src/main.rs: GET/POST /business/endpoints, PATCH /business/endpoints/:id, POST /business/endpoints/:id/cert */
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

/* ---------------- model.rs ---------------- */
const MODEL_ADD = `
/// Mock 监听端点：本机 IP:端口 + 挂载的平台能力 + 可选证书
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MockEndpoint {
    pub id: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub cert: Option<MockCert>,
    pub enabled: bool,
    pub created_at: Millis,
}

/// 演示用自签证书（不用于真实 TLS，仅承载 CN/SAN/有效期信息）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MockCert {
    pub cn: String,
    pub san: Vec<String>,
    pub serial: String,
    pub issued_at: Millis,
    pub expires_at: Millis,
    pub pem: String,
}

#[derive(Debug, Deserialize)]
pub struct NewEndpointReq {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchEndpointReq {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub capabilities: Option<Vec<String>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct NewCertReq {
    pub cn: String,
    #[serde(default)]
    pub san: Vec<String>,
}
`;
patch('console/crates/core/src/model.rs', [
  ['\n#[derive(Debug, Deserialize)]\npub struct NewNodeReq {', MODEL_ADD + '\n#[derive(Debug, Deserialize)]\npub struct NewNodeReq {', 'model structs'],
]);

/* ---------------- store.rs ---------------- */
patch('console/crates/core/src/store.rs', [
  // Inner 字段
  ['struct Inner {', 'struct Inner {\n    endpoints: Vec<MockEndpoint>,', 'inner field'],
  // open() 初始化
  ['started_at: now_ms(),\n        };', 'started_at: now_ms(),\n            endpoints: vec![],\n        };', 'inner init'],
  // 载入
  ['inner.seq = p.seq;', 'inner.seq = p.seq;\n                        inner.endpoints = p.endpoints;', 'load'],
  // seed 一个演示端点
  ['if inner.users.is_empty() {\n            seed(&mut inner);\n        }',
   `if inner.users.is_empty() {
            seed(&mut inner);
        }
        if inner.endpoints.is_empty() {
            inner.endpoints.push(MockEndpoint {
                id: "ep-0001".into(),
                host: "127.0.0.1".into(),
                port: 8443,
                capabilities: vec!["NEMP".into()],
                cert: None,
                enabled: false,
                created_at: now_ms(),
            });
        }`, 'seed endpoint'],
  // 持久化
  ['seq: inner.seq,\n        };', 'seq: inner.seq,\n            endpoints: inner.endpoints.clone(),\n        };', 'persist'],
  // Persisted 结构
  ['struct Persisted {', 'struct Persisted {\n    #[serde(default)]\n    endpoints: Vec<MockEndpoint>,', 'persisted field'],
  // 方法：插在 push_log 之前
  ['    pub fn push_log(', `    // ---------------- Mock 端点 ----------------
    pub fn endpoints(&self) -> Vec<MockEndpoint> {
        self.inner.lock().unwrap().endpoints.clone()
    }

    pub fn create_endpoint(&self, req: NewEndpointReq) -> Result<MockEndpoint> {
        let mut i = self.inner.lock().unwrap();
        let next = i
            .endpoints
            .iter()
            .filter_map(|e| e.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max()
            .unwrap_or(0)
            + 1;
        let ep = MockEndpoint {
            id: format!("ep-{:04}", next),
            host: req.host,
            port: req.port,
            capabilities: req.capabilities,
            cert: None,
            enabled: false,
            created_at: now_ms(),
        };
        i.endpoints.push(ep.clone());
        self.persist_locked(&i)?;
        Ok(ep)
    }

    pub fn patch_endpoint(&self, id: &str, req: PatchEndpointReq) -> Result<MockEndpoint> {
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .endpoints
            .iter()
            .position(|e| e.id == id)
            .ok_or(Error::NotFound)?;
        {
            let e = &mut i.endpoints[idx];
            if let Some(h) = req.host { e.host = h; }
            if let Some(p) = req.port { e.port = p; }
            if let Some(c) = req.capabilities { e.capabilities = c; }
            if let Some(v) = req.enabled { e.enabled = v; }
        }
        let out = i.endpoints[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    /// 签发演示证书：CN + SAN + 序列号 + 有效期，返回 PEM 文本
    pub fn issue_cert(&self, id: &str, req: NewCertReq) -> Result<MockEndpoint> {
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .endpoints
            .iter()
            .position(|e| e.id == id)
            .ok_or(Error::NotFound)?;
        let mut serial = String::new();
        for _ in 0..16 {
            serial.push_str(&format!("{:02X}", rand::random::<u8>()));
        }
        let mut body = String::new();
        let mut k = 0usize;
        while k < 24 {
            body.push_str(&format!("{:08X}", rand::random::<u32>()));
            k += 1;
            if k % 4 == 0 { body.push('\\n'); }
        }
        let san = if req.san.is_empty() { vec![req.cn.clone(), "localhost".into()] } else { req.san };
        let cert = MockCert {
            cn: req.cn.clone(),
            san: san.clone(),
            serial: serial.clone(),
            issued_at: now_ms(),
            expires_at: now_ms() + 365 * 24 * 3600 * 1000,
            pem: format!(
                "-----BEGIN CERTIFICATE-----\\n# RHINE LAB · DEMO CERT（演示用，不可用于真实 TLS）\\n# CN={}\\n# SAN={}\\n# SERIAL={}\\n{}\\n-----END CERTIFICATE-----",
                req.cn,
                san.join(","),
                serial,
                body
            ),
        };
        i.endpoints[idx].cert = Some(cert);
        let out = i.endpoints[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    pub fn push_log(`, 'store methods'],
]);

/* ---------------- main.rs ---------------- */
patch('console/apps/agent/src/main.rs', [
  ['async fn admin_nodes(', `async fn business_endpoints(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<MockEndpoint>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.endpoints()))
}

async fn business_create_endpoint(
    st: Ctx,
    headers: HeaderMap,
    Json(req): Json<NewEndpointReq>,
) -> ApiResult<Json<MockEndpoint>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.create_endpoint(req)?))
}

async fn business_patch_endpoint(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<PatchEndpointReq>,
) -> ApiResult<Json<MockEndpoint>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_endpoint(&id, req)?))
}

async fn business_issue_cert(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<NewCertReq>,
) -> ApiResult<Json<MockEndpoint>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let ep = st.store.issue_cert(&id, req)?;
    st.store.push_log("business", "endpoint.cert", &format!("签发证书 {}", ep.id), "info");
    Ok(Json(ep))
}

async fn admin_nodes(`, 'handlers'],
  ['.route("/admin/nodes", get(admin_nodes).post(admin_create_node))',
   `.route("/business/endpoints", get(business_endpoints).post(business_create_endpoint))
        .route("/business/endpoints/:id", patch(business_patch_endpoint))
        .route("/business/endpoints/:id/cert", post(business_issue_cert))
        .route("/admin/nodes", get(admin_nodes).post(admin_create_node))`, 'routes'],
]);

console.log(log.join('\n'));

//! RhineLab Console · L 端 agent
//!
//! 一个进程承担三件事（这就是 L 端「业务面」的全部）：
//! 1. `/api/business/*` 业务面：本地映射 CRUD + 试打 + 日志（需登录）
//! 2. `/api/admin/*`    管理面：节点清单 / 下发部署 / 用户管理（需管理员）
//! 3. `/mock/*`         **真正的 mock 引擎**：按映射返回状态码/延迟/响应体，供被测系统直接调用
//!
//! W 端 Tauri 壳加载同一套 `ui/`，所以「L 端日常使用与 W 端业务面无异」
//! 是共用前端 + 共用 `rhine-core` 的结果，不是复制粘贴。

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, patch, post};
use axum::{Json, Router};
use rhine_core::model::*;
use rhine_core::{AuthUser, Error, Store};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tower_http::cors::CorsLayer;

pub struct AppState {
    pub store: Store,
    pub ui_dir: PathBuf,
    /// true  = L 端（业务面需要登录，管理面需要管理员）
    /// false = W 端本地（业务面免登录；管理面 API 仍不可用，它属于独立平台）
    pub auth_required: bool,
}

type Ctx = State<Arc<AppState>>;
type ApiResult<T> = Result<T, ApiErr>;

const COOKIE: &str = "rhine_sess";

// ------------------------------------------------------------------ 错误 → HTTP
// `Error` 定义在 rhine-core（不依赖 axum），而 `IntoResponse` 属于 axum，
// 直接实现会违反孤儿规则 → 用本地 newtype 包装。
pub struct ApiErr(pub Error);

impl From<Error> for ApiErr {
    fn from(e: Error) -> Self {
        ApiErr(e)
    }
}

impl IntoResponse for ApiErr {
    fn into_response(self) -> Response {
        let code = self.0.status();
        let status = StatusCode::from_u16(code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (
            status,
            Json(json!({ "error": self.0.to_string(), "status": code })),
        )
            .into_response()
    }
}

// ------------------------------------------------------------------ 会话
fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix("rhine_sess=") {
            return Some(v.to_string());
        }
    }
    None
}

fn auth(st: &AppState, headers: &HeaderMap) -> Result<AuthUser, Error> {
    // 本地桌面模式：没有账号体系，业务面直接以本机身份操作
    if !st.auth_required {
        return Ok(AuthUser {
            id: "user-local".into(),
            username: "local".into(),
            display: "本机".into(),
            role: Role::Operator,
            csrf: String::new(),
        });
    }
    let token = cookie_token(headers).ok_or(Error::Unauthorized)?;
    st.store.resolve(&token).ok_or(Error::Unauthorized)
}

fn auth_admin(st: &AppState, headers: &HeaderMap) -> Result<AuthUser, Error> {
    let u = auth(st, headers)?;
    if !u.role.is_admin() {
        return Err(Error::Forbidden);
    }
    Ok(u)
}

/// 双提交 CSRF：写操作必须带 `X-CSRF` 且与会话里的值相等
fn csrf_guard(st: &AppState, headers: &HeaderMap, user: &AuthUser) -> Result<(), Error> {
    if !st.auth_required {
        return Ok(());
    }
    let got = headers
        .get("x-csrf")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if got.is_empty() || !rhine_core::auth::ct_eq(got, &user.csrf) {
        return Err(Error::Forbidden);
    }
    Ok(())
}

fn set_cookie(token: &str, max_age: i64) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}"
    ))
    .expect("cookie 值非法")
}

// ================================================================== 认证
async fn login(st: Ctx, Json(req): Json<LoginReq>) -> ApiResult<Response> {
    let (token, view) = st.store.login(&req.username, &req.password)?;
    let mut res = Json(view).into_response();
    res.headers_mut()
        .insert(header::SET_COOKIE, set_cookie(&token, 8 * 3600));
    Ok(res)
}

async fn logout(st: Ctx, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(t) = cookie_token(&headers) {
        st.store.logout(&t);
    }
    let mut res = Json(json!({ "ok": true })).into_response();
    res.headers_mut().insert(header::SET_COOKIE, set_cookie("", 0));
    Ok(res)
}

/// 前端用它判断"要不要登录"：这是业务面 W/L 两端唯一的差异点
async fn meta(st: Ctx) -> Json<Value> {
    let s = st.store.stats();
    Json(json!({
        "authRequired": st.auth_required,
        "mode": if st.auth_required { "agent" } else { "local" },
        "version": s.version,
        "node": if st.auth_required { "L-AGENT" } else { "LOCAL" },
        "auth": if st.auth_required { "login" } else { "none" }
    }))
}

async fn me(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let u = auth(&st, &headers)?;
    Ok(Json(json!({
        "user": { "id": u.id, "username": u.username, "display": u.display, "role": u.role },
        "csrf": u.csrf
    })))
}

// ================================================================== 业务面
async fn business_mappings(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<Mapping>>> {
    let u = auth(&st, &headers)?;
    // 本地单用户模式没有"别人"的概念 → 返回全部；L 端按 owner 隔离
    let list = if st.auth_required {
        st.store.mappings_for(&u)
    } else {
        st.store.all_mappings()
    };
    Ok(Json(list))
}

async fn business_create(
    st: Ctx,
    headers: HeaderMap,
    Json(req): Json<NewMapping>,
) -> ApiResult<Json<Mapping>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.create_mapping(&u, req)?))
}

async fn business_patch(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<PatchMapping>,
) -> ApiResult<Json<Mapping>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_mapping(&u, &id, req)?))
}

async fn business_delete(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    st.store.delete_mapping(&u, &id)?;
    Ok(Json(json!({ "ok": true })))
}

/// 试打：服务端真的等够延迟再返回，前端看到的延迟不是假动画
async fn business_test(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<MockHit>> {
    let u = auth(&st, &headers)?;
    let pool = if st.auth_required {
        st.store.mappings_for(&u)
    } else {
        st.store.all_mappings()
    };
    let m = pool.into_iter().find(|m| m.id == id).ok_or(Error::NotFound)?;
    let started = Instant::now();
    tokio::time::sleep(Duration::from_millis(m.delay_ms as u64)).await;
    st.store.hit_mock(m.method.as_str(), &m.path)?;
    Ok(Json(MockHit {
        status: m.status,
        body: m.body,
        content_type: m.content_type,
        latency_ms: started.elapsed().as_millis() as u64,
        mapping_id: m.id,
    }))
}

async fn business_logs(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<LogEntry>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.logs(120)))
}

async fn business_stats(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Stats>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.stats()))
}

// ================================================================== 管理面
async fn business_tasks(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<UpgradeTask>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.tasks()))
}

async fn business_create_task(
    st: Ctx,
    headers: HeaderMap,
    Json(req): Json<NewTaskReq>,
) -> ApiResult<Json<UpgradeTask>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let t = st.store.create_task(req)?;
    st.store.push_log("business", "task.create", &format!("创建升级任务 {}", t.id), "info");
    Ok(Json(t))
}

async fn business_resolve_human(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ResolveHumanReq>,
) -> ApiResult<Json<UpgradeTask>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let t = st.store.resolve_human(&id, req.option)?;
    st.store.push_log("business", "task.human", &format!("人工确认 {} → 阶段 {}", t.id, t.stage), "info");
    Ok(Json(t))
}

async fn business_endpoints(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<MockEndpoint>>> {
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

async fn admin_nodes(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<AgentNode>>> {
    let _u = auth_admin(&st, &headers)?;
    Ok(Json(st.store.nodes()))
}

/// 新建虚机主板（登记一台 L 端节点）
async fn admin_create_node(
    st: Ctx,
    headers: HeaderMap,
    Json(req): Json<NewNodeReq>,
) -> ApiResult<Json<AgentNode>> {
    let u = auth_admin(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let node = st.store.create_node(req)?;
    st.store
        .push_log("admin", "node.create", &format!("新建虚机 {}", node.id), "info");
    Ok(Json(node))
}

async fn admin_deploy(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<DeployReq>,
) -> ApiResult<Json<DeployJob>> {
    let u = auth_admin(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let job = st.store.start_deploy(&u, &id, &req.version)?;

    // 后台按节拍推进；真实实现替换为「SSH / HTTPS 轮询节点回执」
    let store = st.store.clone_for_task();
    let job_id = job.id.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(650)).await;
            match store.advance_deploy(&job_id) {
                Some(j) if j.finished => break,
                Some(_) => continue,
                None => break,
            }
        }
    });
    Ok(Json(job))
}

async fn admin_job(
    st: Ctx,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<DeployJob>> {
    let _u = auth_admin(&st, &headers)?;
    st.store.job(&id).map(Json).ok_or(ApiErr(Error::NotFound))
}

async fn admin_users(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<UserView>>> {
    let _u = auth_admin(&st, &headers)?;
    Ok(Json(st.store.users()))
}

async fn admin_create_user(
    st: Ctx,
    headers: HeaderMap,
    Json(req): Json<NewUserReq>,
) -> ApiResult<Json<UserView>> {
    let u = auth_admin(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let role = match req.role.as_deref() {
        Some("admin") => Role::Admin,
        _ => Role::Operator,
    };
    let display = req.display.unwrap_or_else(|| req.username.clone());
    Ok(Json(st.store.create_user(
        &u,
        &req.username,
        &req.password,
        &display,
        role,
    )?))
}

async fn admin_logs(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<LogEntry>>> {
    let _u = auth_admin(&st, &headers)?;
    Ok(Json(st.store.logs(200)))
}

// ================================================================== mock 引擎
/// 被测系统真正调用的端点。走真实 HTTP（不是进程内调用），
/// 所以「本地映射」能被 curl、被别的服务、被测系统本身打到。
async fn mock_engine(st: Ctx, Path(rest): Path<String>, method: Method) -> Response {
    let path = format!("/{rest}");
    let m = match st.store.hit_mock(method.as_str(), &path) {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "no mapping", "method": method.as_str(), "path": path })),
            )
                .into_response()
        }
    };
    if m.delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(m.delay_ms as u64)).await;
    }
    let ct = HeaderValue::from_str(&m.content_type)
        .unwrap_or_else(|_| HeaderValue::from_static("application/json"));
    let mut res = Response::new(axum::body::Body::from(m.body.clone()));
    *res.status_mut() = StatusCode::from_u16(m.status).unwrap_or(StatusCode::OK);
    res.headers_mut().insert(header::CONTENT_TYPE, ct);
    res.headers_mut().insert(
        header::HeaderName::from_static("x-rhine-mapping"),
        HeaderValue::from_str(&m.id).unwrap_or_else(|_| HeaderValue::from_static("-")),
    );
    res
}

/// `/` → `/business/`：让业务面里的 `./app.js`、`../shared/base.css` 这些相对路径成立；
/// 同一份目录在 Tauri 里（直接加载 business/index.html）也成立。
async fn root_redirect() -> axum::response::Redirect {
    axum::response::Redirect::to("/business/")
}

async fn health(State(st): Ctx) -> Json<Value> {
    let s = st.store.stats();
    Json(json!({
        "ok": true,
        "version": s.version,
        "mappings": s.mappings,
        "nodes": s.nodes
    }))
}

// ================================================================== 启动
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();

    let port: u16 = std::env::var("RHINE_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9600);
    let data = std::env::var("RHINE_DATA").unwrap_or_else(|_| "data/rhine.json".into());
    let ui_dir = std::env::var("RHINE_UI").unwrap_or_else(|_| "../../ui".into());
    // W 端本地：RHINE_AUTH=off → 业务面免登录（管理面 API 仍然拒绝，它属于独立平台）
    let auth_required = std::env::var("RHINE_AUTH").map(|v| v != "off").unwrap_or(true);

    let store = Store::open(&data)?;
    store.push_log("system", "agent.boot", &format!("监听 :{port}"), "info");
    let st = Arc::new(AppState {
        store,
        ui_dir: PathBuf::from(&ui_dir),
        auth_required,
    });

    let api = Router::new()
        .route("/meta", get(meta))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
        .route(
            "/business/mappings",
            get(business_mappings).post(business_create),
        )
        .route(
            "/business/mappings/:id",
            patch(business_patch).delete(business_delete),
        )
        .route("/business/mappings/:id/test", post(business_test))
        .route("/business/logs", get(business_logs))
        .route("/business/stats", get(business_stats))
        .route("/business/tasks", get(business_tasks).post(business_create_task))
        .route("/business/tasks/:id/human", post(business_resolve_human))
        .route("/business/endpoints", get(business_endpoints).post(business_create_endpoint))
        .route("/business/endpoints/:id", patch(business_patch_endpoint))
        .route("/business/endpoints/:id/cert", post(business_issue_cert))
        .route("/admin/nodes", get(admin_nodes).post(admin_create_node))
        .route("/admin/nodes/:id/deploy", post(admin_deploy))
        .route("/admin/jobs/:id", get(admin_job))
        .route("/admin/users", get(admin_users).post(admin_create_user))
        .route("/admin/logs", get(admin_logs));

    // W 端 Tauri 的页面 origin 是 http://tauri.localhost，与 agent 不同源且要带 Cookie：
    // mirror_request 回显来源 → 浏览器才接受 Allow-Credentials。
    // 生产环境请把这里收紧成固定的桌面端 origin，而不是镜像任意来源。
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::HeaderName::from_static("x-csrf"),
        ])
        .allow_credentials(true);

    let ui = st.ui_dir.clone();
    let app = Router::new()
        .nest("/api", api)
        .route("/health", get(health))
        .route("/", get(root_redirect))
        .route("/mock/*path", any(mock_engine))
        // 静态资源（shared/base.css、各应用自己的 app.js）从 ui/ 根上取
        .fallback_service(ServeDir::new(&ui))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(st);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("RhineLab agent 监听 {addr}（ui={}）", ui.display());
    println!("RhineLab agent   http://{addr}   (auth={})", if auth_required { "required" } else { "off (local)" });
    println!("  业务面  http://{addr}/business/     {}", if auth_required { "需登录 · viewer / rhine-viewer-2026" } else { "免登录（本机模式）" });
    println!("  管理面  http://{addr}/admin/        独立平台 · admin / rhine-admin-2026");
    println!("  mock    http://{addr}/mock/nemp/v1/ne/register");
    axum::serve(listener, app).await?;
    Ok(())
}

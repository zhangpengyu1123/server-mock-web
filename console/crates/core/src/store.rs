//! 状态与持久化。
//!
//! 存储选型说明：scaffold 阶段用「JSON 文件 + 进程内 Mutex」，零 C 依赖、编译快、
//! 数据可读可 diff。真实部署应换成 SQLite（`rusqlite` bounded 或 `sqlx`），
//! `Store` 的边界已经把读写收在一处，替换时只动这个文件。

use crate::auth;
use crate::model::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    NotFound,
    Unauthorized,
    Forbidden,
    BadRequest(String),
    Conflict(String),
    Io(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::NotFound => write!(f, "资源不存在"),
            Error::Unauthorized => write!(f, "未登录或会话已过期"),
            Error::Forbidden => write!(f, "权限不足"),
            Error::BadRequest(m) => write!(f, "请求不合法：{m}"),
            Error::Conflict(m) => write!(f, "冲突：{m}"),
            Error::Io(m) => write!(f, "存储错误：{m}"),
        }
    }
}

impl std::error::Error for Error {}

impl Error {
    pub fn status(&self) -> u16 {
        match self {
            Error::NotFound => 404,
            Error::Unauthorized => 401,
            Error::Forbidden => 403,
            Error::BadRequest(_) => 400,
            Error::Conflict(_) => 409,
            Error::Io(_) => 500,
        }
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone, Debug)]
pub struct Session {
    pub token: String,
    pub user_id: String,
    pub csrf: String,
    pub expires_at: i64,
}

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
    pub display: String,
    pub role: Role,
    pub csrf: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Persisted {
    users: Vec<User>,
    mappings: Vec<Mapping>,
    nodes: Vec<AgentNode>,
    seq: u64,
}

struct Inner {
    users: Vec<User>,
    mappings: Vec<Mapping>,
    nodes: Vec<AgentNode>,
    sessions: HashMap<String, Session>,
    jobs: HashMap<String, DeployJob>,
    logs: VecDeque<LogEntry>,
    seq: u64,
    started_at: i64,
}

#[derive(Clone)]
pub struct Store {
    path: PathBuf,
    inner: Arc<Mutex<Inner>>,
    pub version: String,
}

const SESSION_TTL_MS: i64 = 8 * 3600 * 1000;

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let mut inner = Inner {
            users: vec![],
            mappings: vec![],
            nodes: vec![],
            sessions: HashMap::new(),
            jobs: HashMap::new(),
            logs: VecDeque::new(),
            seq: 0,
            started_at: now_ms(),
        };

        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| Error::Io(e.to_string()))?;
            match serde_json::from_str::<Persisted>(&raw) {
                Ok(p) => {
                    inner.users = p.users;
                    inner.mappings = p.mappings;
                    inner.nodes = p.nodes;
                    inner.seq = p.seq;
                }
                Err(e) => {
                    // 坏数据不静默吞掉：备份后重新播种，避免"看起来正常但数据没了"
                    let bak = path.with_extension(format!("corrupt.{}", now_ms()));
                    let _ = fs::copy(&path, &bak);
                    eprintln!("! 存储解析失败（{e}），已备份到 {bak:?} 并重新播种");
                }
            }
        }

        if inner.users.is_empty() {
            seed(&mut inner);
        }

        let store = Self {
            path,
            inner: Arc::new(Mutex::new(inner)),
            version: "0.1.0".into(),
        };
        store.persist_locked(&store.inner.lock().unwrap())?;
        Ok(store)
    }

    fn persist_locked(&self, inner: &Inner) -> Result<()> {
        let doc = Persisted {
            users: inner.users.clone(),
            mappings: inner.mappings.clone(),
            nodes: inner.nodes.clone(),
            seq: inner.seq,
        };
        let json = serde_json::to_string_pretty(&doc).map_err(|e| Error::Io(e.to_string()))?;
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let tmp = self.path.with_extension("tmp");
        fs::write(&tmp, json).map_err(|e| Error::Io(e.to_string()))?;
        fs::rename(&tmp, &self.path).map_err(|e| Error::Io(e.to_string()))?;
        Ok(())
    }

    /// 后台任务持有独立句柄（内部是 Arc<Mutex<..>>，共享同一份状态）
    pub fn clone_for_task(&self) -> Self {
        self.clone()
    }

    pub fn push_log(&self, actor: &str, action: &str, detail: &str, level: &str) {
        let mut i = self.inner.lock().unwrap();
        i.logs.push_front(LogEntry {
            at: now_ms(),
            actor: actor.into(),
            action: action.into(),
            detail: detail.into(),
            level: level.into(),
        });
        while i.logs.len() > 500 {
            i.logs.pop_back();
        }
    }

    pub fn logs(&self, limit: usize) -> Vec<LogEntry> {
        let i = self.inner.lock().unwrap();
        i.logs.iter().take(limit).cloned().collect()
    }

    // ---------------------------------------------------------------- 认证
    /// 登录成功返回 (Cookie 用的 token, 会话视图)。
    /// token 单独返回而不是塞进视图：它只应该存在于 Set-Cookie 里。
    pub fn login(&self, username: &str, password: &str) -> Result<(String, SessionView)> {
        let mut i = self.inner.lock().unwrap();
        let user = i
            .users
            .iter()
            .find(|u| u.username == username)
            .ok_or(Error::Unauthorized)?
            .clone();
        if !auth::verify(password, &user.hash) {
            return Err(Error::Unauthorized);
        }
        let token = auth::token();
        let csrf = auth::token();
        let expires_at = now_ms() + SESSION_TTL_MS;
        i.sessions.insert(
            token.clone(),
            Session {
                token: token.clone(),
                user_id: user.id.clone(),
                csrf: csrf.clone(),
                expires_at,
            },
        );
        let view = SessionView {
            user: UserView::from(&user),
            csrf,
            expires_at,
        };
        drop(i);
        self.push_log(&user.username, "auth.login", "登录成功", "info");
        Ok((token, view))
    }

    pub fn resolve(&self, token: &str) -> Option<AuthUser> {
        let mut i = self.inner.lock().unwrap();
        let sess = i.sessions.get(token).cloned()?;
        if sess.expires_at < now_ms() {
            i.sessions.remove(token);
            return None;
        }
        let user = i.users.iter().find(|u| u.id == sess.user_id)?.clone();
        Some(AuthUser {
            id: user.id,
            username: user.username,
            display: user.display,
            role: user.role,
            csrf: sess.csrf,
        })
    }

    pub fn logout(&self, token: &str) {
        let mut i = self.inner.lock().unwrap();
        i.sessions.remove(token);
    }

    // ------------------------------------------------------------- 映射 CRUD
    pub fn mappings_for(&self, user: &AuthUser) -> Vec<Mapping> {
        let i = self.inner.lock().unwrap();
        let mut v: Vec<Mapping> = i
            .mappings
            .iter()
            .filter(|m| user.role.is_admin() || m.owner == user.id)
            .cloned()
            .collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    /// 本地单用户模式用：不做 owner 过滤（整台机器只有一个使用者）
    pub fn all_mappings(&self) -> Vec<Mapping> {
        let i = self.inner.lock().unwrap();
        let mut v: Vec<Mapping> = i.mappings.iter().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn create_mapping(&self, user: &AuthUser, req: NewMapping) -> Result<Mapping> {
        if req.path.trim().is_empty() || !req.path.starts_with('/') {
            return Err(Error::BadRequest("path 必须以 / 开头".into()));
        }
        if Method::parse(&req.method).is_none() {
            return Err(Error::BadRequest("method 不合法".into()));
        }
        let mut i = self.inner.lock().unwrap();
        if i.mappings
            .iter()
            .any(|m| m.owner == user.id && m.path == req.path && m.method == Method::parse(&req.method).unwrap())
        {
            return Err(Error::Conflict("同路径同方法已存在".into()));
        }
        i.seq += 1;
        let m = Mapping {
            id: format!("map-{:04}", i.seq),
            owner: user.id.clone(),
            name: req.name.unwrap_or_else(|| req.path.clone()),
            method: Method::parse(&req.method).unwrap(),
            path: req.path.clone(),
            status: req.status.unwrap_or(200),
              version: req.version.clone().unwrap_or_else(|| "0.1.0".into()),
            delay_ms: req.delay_ms.unwrap_or(0),
            content_type: req
                .content_type
                .unwrap_or_else(|| "application/json".into()),
            body: req.body.unwrap_or_else(|| "{}".into()),
            enabled: true,
            hits: 0,
            last_hit_at: None,
            created_at: now_ms(),
        };
        i.mappings.push(m.clone());
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(&user.username, "mapping.create", &m.path, "info");
        Ok(m)
    }

    pub fn patch_mapping(&self, user: &AuthUser, id: &str, patch: PatchMapping) -> Result<Mapping> {
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .mappings
            .iter()
            .position(|m| m.id == id)
            .ok_or(Error::NotFound)?;
        if !user.role.is_admin() && i.mappings[idx].owner != user.id {
            return Err(Error::Forbidden);
        }
        if let Some(v) = patch.enabled {
            i.mappings[idx].enabled = v;
        }
        if let Some(v) = patch.status {
            i.mappings[idx].status = v;
        }
        if let Some(v) = patch.delay_ms {
            i.mappings[idx].delay_ms = v;
        }
          if let Some(v) = patch.version.clone() {
              i.mappings[idx].version = v;
          }
        if let Some(v) = patch.body {
            i.mappings[idx].body = v;
        }
        let m = i.mappings[idx].clone();
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(&user.username, "mapping.patch", &m.path, "info");
        Ok(m)
    }

    pub fn delete_mapping(&self, user: &AuthUser, id: &str) -> Result<()> {
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .mappings
            .iter()
            .position(|m| m.id == id)
            .ok_or(Error::NotFound)?;
        if !user.role.is_admin() && i.mappings[idx].owner != user.id {
            return Err(Error::Forbidden);
        }
        let m = i.mappings.remove(idx);
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(&user.username, "mapping.delete", &m.path, "warn");
        Ok(())
    }

    /// mock 引擎命中：返回响应并在计数上记账
    pub fn hit_mock(&self, method: &str, path: &str) -> Result<Mapping> {
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .mappings
            .iter()
            .position(|m| m.enabled && m.path == path && m.method.as_str() == method)
            .ok_or(Error::NotFound)?;
        i.mappings[idx].hits += 1;
        i.mappings[idx].last_hit_at = Some(now_ms());
        let m = i.mappings[idx].clone();
        self.persist_locked(&i)?;
        Ok(m)
    }

    // ---------------------------------------------------------------- 节点
    /// 新建一台 L 端节点（管理面登记"虚机主板"）
    pub fn create_node(&self, req: NewNodeReq) -> Result<AgentNode> {
        let mut i = self.inner.lock().unwrap();
        let next = i
            .nodes
            .iter()
            .filter_map(|n| n.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max()
            .unwrap_or(0)
            + 1;
        let node = AgentNode {
            id: format!("node-{:04}", next),
            name: req.name,
            addr: req.addr,
            version: req.version.unwrap_or_else(|| "0.1.0".into()),
            status: NodeStatus::Online,
            last_seen: now_ms(),
            mappings: 0,
        };
        i.nodes.push(node.clone());
        self.persist_locked(&i)?;
        Ok(node)
    }

    pub fn nodes(&self) -> Vec<AgentNode> {
        self.inner.lock().unwrap().nodes.clone()
    }

    pub fn start_deploy(&self, user: &AuthUser, node_id: &str, version: &str) -> Result<DeployJob> {
        if !user.role.is_admin() {
            return Err(Error::Forbidden);
        }
        let mut i = self.inner.lock().unwrap();
        let idx = i
            .nodes
            .iter()
            .position(|n| n.id == node_id)
            .ok_or(Error::NotFound)?;
        let from = i.nodes[idx].version.clone();
        if from == version {
            return Err(Error::Conflict("目标版本与当前版本相同".into()));
        }
        i.seq += 1;
        let job = DeployJob {
            id: format!("job-{:04}", i.seq),
            node_id: node_id.to_string(),
            from_version: from,
            to_version: version.to_string(),
            stage: "upload".into(),
            progress: 5,
            message: "上传产物".into(),
            started_at: now_ms(),
            finished: false,
            ok: false,
        };
        i.jobs.insert(job.id.clone(), job.clone());
        i.nodes[idx].status = NodeStatus::Updating;
        let node_name = i.nodes[idx].name.clone();
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(
            &user.username,
            "deploy.start",
            &format!("{node_name} → {version}"),
            "warn",
        );
        Ok(job)
    }

    /// 由后台任务按节拍推进一个作业（真实实现里是 SSH/HTTP 回执）
    pub fn advance_deploy(&self, job_id: &str) -> Option<DeployJob> {
        let mut i = self.inner.lock().unwrap();
        let job = i.jobs.get_mut(job_id)?;
        if job.finished {
            return Some(job.clone());
        }
        let (stage, progress, msg) = match job.progress {
            0..=24 => ("upload", 25, "上传产物"),
            25..=54 => ("verify", 55, "校验签名与版本"),
            55..=84 => ("activate", 85, "原子切换 + 重载"),
            _ => ("done", 100, "已生效"),
        };
        job.stage = stage.into();
        job.progress = progress;
        job.message = msg.into();
        if progress == 100 {
            job.finished = true;
            job.ok = true;
        }
        let node_id = job.node_id.clone();
        let to = job.to_version.clone();
        let snapshot = job.clone();
        if progress == 100 {
            if let Some(n) = i.nodes.iter_mut().find(|n| n.id == node_id) {
                n.version = to;
                n.status = NodeStatus::Online;
                n.last_seen = now_ms();
            }
        }
        let _ = self.persist_locked(&i);
        Some(snapshot)
    }

    pub fn job(&self, id: &str) -> Option<DeployJob> {
        self.inner.lock().unwrap().jobs.get(id).cloned()
    }

    // ---------------------------------------------------------------- 用户
    pub fn users(&self) -> Vec<UserView> {
        let i = self.inner.lock().unwrap();
        i.users.iter().map(UserView::from).collect()
    }

    pub fn create_user(
        &self,
        actor: &AuthUser,
        username: &str,
        password: &str,
        display: &str,
        role: Role,
    ) -> Result<UserView> {
        if !actor.role.is_admin() {
            return Err(Error::Forbidden);
        }
        if username.len() < 3 || password.len() < 8 {
            return Err(Error::BadRequest("用户名至少 3 位、密码至少 8 位".into()));
        }
        let mut i = self.inner.lock().unwrap();
        if i.users.iter().any(|u| u.username == username) {
            return Err(Error::Conflict("用户名已存在".into()));
        }
        i.seq += 1;
        let hash = auth::hash_password(password);
        let u = User {
            id: format!("user-{:04}", i.seq),
            username: username.to_string(),
            display: display.to_string(),
            role,
            hash,
            created_at: now_ms(),
        };
        i.users.push(u.clone());
        self.persist_locked(&i)?;
        drop(i);
        self.push_log(&actor.username, "user.create", username, "warn");
        Ok(UserView::from(&u))
    }

    // ---------------------------------------------------------------- 统计
    pub fn stats(&self) -> Stats {
        let i = self.inner.lock().unwrap();
        let hits: u64 = i.mappings.iter().map(|m| m.hits).sum();
        Stats {
            mappings: i.mappings.len() as u32,
            enabled: i.mappings.iter().filter(|m| m.enabled).count() as u32,
            hits,
            nodes: i.nodes.len() as u32,
            online: i
                .nodes
                .iter()
                .filter(|n| n.status == NodeStatus::Online)
                .count() as u32,
            uptime_s: ((now_ms() - i.started_at) / 1000).max(0) as u64,
            version: self.version.clone(),
        }
    }
}

fn seed(inner: &mut Inner) {
    inner.users.push(User {
        id: "user-0001".into(),
        username: "admin".into(),
        display: "莱茵生命 · 管理员".into(),
        role: Role::Admin,
        hash: auth::hash_password("rhine-admin-2026"),
        created_at: now_ms(),
    });
    inner.users.push(User {
        id: "user-0002".into(),
        username: "viewer".into(),
        display: "观测站 · 业务用户".into(),
        role: Role::Operator,
        hash: auth::hash_password("rhine-viewer-2026"),
        created_at: now_ms(),
    });

    inner.nodes = vec![
        AgentNode {
            id: "node-0001".into(),
            name: "RHINE-L-01".into(),
            addr: "10.0.0.21:9443".into(),
            version: "0.1.0".into(),
            status: NodeStatus::Online,
            last_seen: now_ms(),
            mappings: 4,
        },
        AgentNode {
            id: "node-0002".into(),
            name: "RHINE-L-02".into(),
            addr: "10.0.0.22:9443".into(),
            version: "0.1.0".into(),
            status: NodeStatus::Online,
            last_seen: now_ms() - 42_000,
            mappings: 2,
        },
        AgentNode {
            id: "node-0003".into(),
            name: "RHINE-L-03".into(),
            addr: "10.0.0.23:9443".into(),
            version: "0.0.9".into(),
            status: NodeStatus::Offline,
            last_seen: now_ms() - 3_600_000,
            mappings: 0,
        },
    ];

    let demo = vec![
        ("注册网元", Method::Post, "/nemp/v1/ne/register", 200, 120u32, "{\"code\":\"0\",\"message\":\"success\",\"data\":{\"neId\":\"GNB-HZ-0904\"}}"),
        ("网元列表", Method::Get, "/nemp/v1/ne/list", 200, 60, "{\"code\":\"0\",\"data\":{\"items\":[{\"neId\":\"GNB-HZ-0904\",\"site\":\"杭州主站点\"}]}}"),
        ("告警上报", Method::Post, "/alarm/v1/report", 202, 240, "{\"code\":\"0\",\"message\":\"accepted\"}"),
        ("鉴权失败样例", Method::Get, "/nemp/v1/auth/probe", 401, 30, "{\"code\":\"401\",\"message\":\"token expired\"}"),
    ];
    for (i, (name, method, path, status, delay, body)) in demo.into_iter().enumerate() {
        inner.mappings.push(Mapping {
            id: format!("map-{:04}", i + 1),
            owner: "user-0002".into(),
            name: name.into(),
            method,
            path: path.into(),
            status,
            delay_ms: delay,
            content_type: "application/json".into(),
            body: body.into(),
            enabled: true,
              version: ["0.1.1", "0.1.0", "0.2.0"][i % 3].to_string(),
            hits: (i as u64) * 7,
            last_hit_at: None,
            created_at: now_ms() - (i as i64) * 60_000,
        });
    }
    inner.seq = 10;
}

//! 领域模型：两端（W / L）共用同一套结构。
//!
//! 设计要点：
//! - 所有时间戳用 `i64` 毫秒（epoch），避免引入时间库，也便于前端直接 `new Date(ms)`。
//! - 凭据字段（salt / hash）永不序列化给前端：`skip_serializing` 是硬约束，不是约定。
//! - 管理面与业务面看到的是**同一份** Mapping；区别只在权限与视图，不在数据。

use serde::{Deserialize, Serialize};

pub type Millis = i64;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// 管理面：可管理 L 端节点、下发部署、管理用户
    Admin,
    /// 业务面：只能管理自己的映射
    Operator,
}

impl Role {
    pub fn is_admin(self) -> bool {
        matches!(self, Role::Admin)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display: String,
    pub role: Role,
    /// Argon2id 的 PHC 串。**必须参与序列化**，否则重启后用户记录读不回来
    /// （`skip_serializing` 会让 JSON 里没有该字段，反序列化直接失败）。
    /// 不外泄的保证放在 API 层：所有响应只用 [`UserView`]，从不直接返回 `User`。
    pub hash: String,
    pub created_at: Millis,
}

/// 对外可见的用户视图（管理面用户列表用）
#[derive(Clone, Debug, Serialize)]
pub struct UserView {
    pub id: String,
    pub username: String,
    pub display: String,
    pub role: Role,
    pub created_at: Millis,
}

impl From<&User> for UserView {
    fn from(u: &User) -> Self {
        Self {
            id: u.id.clone(),
            username: u.username.clone(),
            display: u.display.clone(),
            role: u.role,
            created_at: u.created_at,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

impl Method {
    pub fn as_str(&self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Patch => "PATCH",
            Method::Delete => "DELETE",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_uppercase().as_str() {
            "GET" => Some(Method::Get),
            "POST" => Some(Method::Post),
            "PUT" => Some(Method::Put),
            "PATCH" => Some(Method::Patch),
            "DELETE" => Some(Method::Delete),
            _ => None,
        }
    }
}

/// 一条「本地映射」：把某个路径映射成指定的 mock 响应。
/// 业务面用户可以自己创建（限自己的 owner），管理面可以看见全部。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mapping {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub method: Method,
    /// 例如 `/nemp/v1/ne/register`
    pub path: String,
    pub status: u16,
    pub delay_ms: u32,
    pub content_type: String,
    pub body: String,
    pub enabled: bool,
    /// 该服务当前部署版本，形如 `0.1.1`（旧数据缺省为空）
    #[serde(default)]
    pub version: String,
    pub hits: u64,
    pub last_hit_at: Option<Millis>,
    pub created_at: Millis,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeStatus {
    Online,
    Updating,
    Offline,
}

/// 被管理面管理的 L 端节点
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentNode {
    pub id: String,
    pub name: String,
    /// 形如 `10.0.0.21:9443`
    pub addr: String,
    pub version: String,
    pub status: NodeStatus,
    pub last_seen: Millis,
    pub mappings: u32,
}

/// 部署作业：管理面下发 → 节点上分阶段执行
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeployJob {
    pub id: String,
    pub node_id: String,
    pub from_version: String,
    pub to_version: String,
    /// upload / verify / activate / done / failed
    pub stage: String,
    pub progress: u8,
    pub message: String,
    pub started_at: Millis,
    pub finished: bool,
    pub ok: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SessionView {
    pub user: UserView,
    /// 双提交令牌：写操作必须带 `X-CSRF`
    pub csrf: String,
    pub expires_at: Millis,
}

#[derive(Clone, Debug, Serialize)]
pub struct LogEntry {
    pub at: Millis,
    pub actor: String,
    pub action: String,
    pub detail: String,
    pub level: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Stats {
    pub mappings: u32,
    pub enabled: u32,
    pub hits: u64,
    pub nodes: u32,
    pub online: u32,
    pub uptime_s: u64,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct MockHit {
    pub status: u16,
    pub body: String,
    pub content_type: String,
    pub latency_ms: u64,
    pub mapping_id: String,
}

// ============================================================ 请求体 DTO
// 只做反序列化；校验放在 store 层，保证「无论从 HTTP 还是 IPC 进来，规则只有一份」。

#[derive(Debug, Deserialize)]
pub struct LoginReq {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct NewMapping {
    pub name: Option<String>,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub version: Option<String>,
    pub status: Option<u16>,
    pub delay_ms: Option<u32>,
    pub content_type: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct PatchMapping {
    pub enabled: Option<bool>,
    pub status: Option<u16>,
    pub delay_ms: Option<u32>,
    pub body: Option<String>,
    /// 更新服务版本（"更新"操作）
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NewNodeReq {
    pub name: String,
    pub addr: String,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeployReq {
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct NewUserReq {
    pub username: String,
    pub password: String,
    pub display: Option<String>,
    pub role: Option<String>,
}

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
    /// 结构化响应字段（为空时用 body 原样返回）
    #[serde(default)]
    pub fields: Vec<RuleField>,
    /// 人机交互节点
    #[serde(default)]
    pub human: Option<RuleHuman>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MockHit {
    pub status: u16,
    pub body: String,
    pub content_type: String,
    pub latency_ms: u64,
    pub mapping_id: String,
    /// 审计扩展字段
    #[serde(default)]
    pub at: Millis,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub delay_ms: u32,
    #[serde(default)]
    pub human: bool,
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




// ---------------- 人机交互模板 ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HumanStateDef {
    pub id: String,
    pub label: String,
    /// signal | ink | danger | muted
    pub tone: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HumanOutcomeDef {
    pub option: String,
    /// continue | hold | abort
    pub effect: String,
    /// 目标状态 id
    pub to: String,
    #[serde(default)]
    pub set_field: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct HumanTemplate {
    #[serde(default)]
    pub states: Vec<HumanStateDef>,
    #[serde(default)]
    pub outcomes: Vec<HumanOutcomeDef>,
}

#[derive(Debug, Deserialize)]
pub struct PatchHumanTemplateReq {
    pub states: Option<Vec<HumanStateDef>>,
    pub outcomes: Option<Vec<HumanOutcomeDef>>,
}

// ---------------- LCM 软件包 ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoftwarePackage {
    pub id: String,
    pub name: String,
    /// 网元软件包 | 核心网软件包 | 平台补丁
    pub kind: String,
    /// 所属网元 id
    pub owner: String,
    pub vendor: String,
    pub version: String,
    #[serde(default)]
    pub verified: bool,
    pub created_at: Millis,
}

#[derive(Debug, Deserialize)]
pub struct NewPackageReq {
    pub name: String,
    pub kind: String,
    pub owner: String,
    pub vendor: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub scope: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifyRun {
    pub step: String,
    /// pass | fail | pending
    pub status: String,
    pub at: Millis,
    #[serde(default)]
    pub note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct FsConfig {
    pub cpus: u32,
    pub site_primary: String,
    pub site_secondary: String,
    pub version: String,
    #[serde(default)]
    pub verify_steps: Vec<String>,
    #[serde(default)]
    pub upgrade_steps: Vec<String>,
    #[serde(default)]
    pub verify_runs: Vec<VerifyRun>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct PlatformCfg {
    #[serde(default)]
    pub lcm_elements: Vec<String>,
    #[serde(default)]
    pub co_deploy: bool,
    #[serde(default)]
    pub omc_elements: Vec<String>,
    #[serde(default)]
    pub omc_groups: Vec<String>,
    #[serde(default)]
    pub accounts: Vec<Account>,
    /// 站点（一体化升级任务关联的站点）
    #[serde(default)]
    pub site_name: String,
    #[serde(default)]
    pub site_role: String,
    pub fs: FsConfig,
}

#[derive(Debug, Deserialize)]
pub struct PatchPlatformReq {
    pub site_name: Option<String>,
    pub site_role: Option<String>,
    pub lcm_elements: Option<Vec<String>>,
    pub co_deploy: Option<bool>,
    pub omc_elements: Option<Vec<String>>,
    pub omc_groups: Option<Vec<String>>,
    pub accounts: Option<Vec<Account>>,
    pub fs: Option<FsConfig>,
}

#[derive(Debug, Deserialize)]
pub struct PackageUpgradeReq {
    #[serde(default)]
    pub site: String,
    /// 可覆盖包版本
    #[serde(default)]
    pub to_version: Option<String>,
}

// ---------------- 网元 ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElementCheck {
    pub field: String,
    pub rule: String,
    pub msg: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElementStep {
    pub step: String,
    #[serde(default)]
    pub human: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NetworkElement {
    pub id: String,
    pub name: String,
    /// SA | NSA | EPC | CLOUD
    pub arch: String,
    /// gNB | MME | UPF | CU | DU
    pub kind: String,
    pub version: String,
    pub software: String,
    #[serde(default)]
    pub prev_versions: Vec<String>,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub checks: Vec<ElementCheck>,
    #[serde(default)]
    pub flow: Vec<ElementStep>,
    pub created_at: Millis,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElementGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub site: String,
    #[serde(default)]
    pub element_ids: Vec<String>,
    pub created_at: Millis,
}

#[derive(Debug, Deserialize)]
pub struct NewElementReq {
    pub name: String,
    pub arch: String,
    pub kind: String,
    pub version: String,
    pub software: String,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub components: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchElementReq {
    pub name: Option<String>,
    pub arch: Option<String>,
    pub kind: Option<String>,
    pub version: Option<String>,
    pub software: Option<String>,
    pub group: Option<String>,
    pub components: Option<Vec<String>>,
    pub checks: Option<Vec<ElementCheck>>,
    pub flow: Option<Vec<ElementStep>>,
}

#[derive(Debug, Deserialize)]
pub struct NewGroupReq {
    pub name: String,
    #[serde(default)]
    pub site: String,
    #[serde(default)]
    pub element_ids: Vec<String>,
}

// ---------------- 升级任务（OMC 一体化升级） ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HumanOption {
    pub label: String,
    /// continue | abort | hold
    pub effect: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HumanStep {
    pub prompt: String,
    pub options: Vec<HumanOption>,
    /// pending | resolved | expired
    pub state: String,
    #[serde(default)]
    pub chosen: Option<usize>,
    pub timeout_s: u32,
    /// 进入 pending 的时间（用于超时判定）
    #[serde(default)]
    pub since: Millis,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpgradeStage {
    pub key: String,
    pub label: String,
    /// pending | running | done | failed | held
    pub state: String,
    #[serde(default)]
    pub human: Option<HumanStep>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpgradeTask {
    pub id: String,
    pub site: String,
    pub element_ids: Vec<String>,
    pub from_version: String,
    pub to_version: String,
    /// 当前阶段索引
    pub stage: usize,
    pub progress: u8,
    pub stages: Vec<UpgradeStage>,
    pub created_at: Millis,
    #[serde(default)]
    pub updated_at: Millis,
}

#[derive(Debug, Deserialize)]
pub struct NewTaskReq {
    pub site: String,
    pub element_ids: Vec<String>,
    pub from_version: String,
    pub to_version: String,
}

#[derive(Debug, Deserialize)]
pub struct ResolveHumanReq {
    /// 选项下标
    pub option: usize,
}


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

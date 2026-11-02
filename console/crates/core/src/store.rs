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
    #[serde(default)]
    endpoints: Vec<MockEndpoint>,
    #[serde(default)]
    elements: Vec<NetworkElement>,
    #[serde(default)]
    groups: Vec<ElementGroup>,
    #[serde(default)]
    packages: Vec<SoftwarePackage>,
    #[serde(default)]
    platform: PlatformCfg,
    #[serde(default)]
    human: HumanTemplate,
    #[serde(default)]
    hits: VecDeque<MockHit>,
    #[serde(default)]
    tasks: Vec<UpgradeTask>,
    users: Vec<User>,
    mappings: Vec<Mapping>,
    nodes: Vec<AgentNode>,
    seq: u64,
}

struct Inner {
    human: HumanTemplate,
    packages: Vec<SoftwarePackage>,
    platform: PlatformCfg,
    elements: Vec<NetworkElement>,
    groups: Vec<ElementGroup>,
    hits: VecDeque<MockHit>,
    tasks: Vec<UpgradeTask>,
    endpoints: Vec<MockEndpoint>,
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
            endpoints: vec![],
            human: HumanTemplate {
                states: vec![
                    HumanStateDef { id: "PENDING".into(), label: "待确认".into(), tone: "signal".into() },
                    HumanStateDef { id: "RESOLVED".into(), label: "已确认".into(), tone: "ink".into() },
                    HumanStateDef { id: "EXPIRED".into(), label: "已超时".into(), tone: "danger".into() },
                    HumanStateDef { id: "SKIPPED".into(), label: "已跳过".into(), tone: "muted".into() },
                ],
                outcomes: vec![
                    HumanOutcomeDef { option: "确认继续".into(), effect: "continue".into(), to: "RESOLVED".into(), set_field: "humanResult=ok".into() },
                    HumanOutcomeDef { option: "稍后处理".into(), effect: "hold".into(), to: "PENDING".into(), set_field: "humanResult=hold".into() },
                    HumanOutcomeDef { option: "终止升级".into(), effect: "abort".into(), to: "EXPIRED".into(), set_field: "humanResult=abort".into() },
                ],
            },
            packages: vec![],
            platform: PlatformCfg {
                lcm_elements: vec![], co_deploy: true, omc_elements: vec![], omc_groups: vec![],
                accounts: vec![],
                fs: FsConfig {
                    cpus: 16,
                    site_primary: "HZ 主站点".into(),
                    site_secondary: "NB 备站点".into(),
                    version: "2.4.0".into(),
                    verify_steps: vec![
                        "校验 checksum（sha256）".into(),
                        "校验签名（GPG）".into(),
                        "校验包与平台版本兼容性".into(),
                        "校验主备站点一致性".into(),
                    ],
                    upgrade_steps: vec![
                        "挂载安装镜像".into(), "预检查（CPU/内存/存储）".into(), "停业务".into(),
                        "安装".into(), "启动并自检".into(), "主备切换验证".into(),
                    ],
                },
            },
            elements: vec![],
            groups: vec![],
            hits: VecDeque::new(),
            tasks: vec![],
        };

        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| Error::Io(e.to_string()))?;
            match serde_json::from_str::<Persisted>(&raw) {
                Ok(p) => {
                    inner.users = p.users;
                    inner.mappings = p.mappings;
                    inner.nodes = p.nodes;
                    inner.seq = p.seq;
                        inner.endpoints = p.endpoints;
                        inner.elements = p.elements;
                        inner.human = p.human;
                        inner.packages = p.packages;
                        inner.platform = p.platform;
                        inner.groups = p.groups;
                        inner.hits = p.hits;
                        inner.tasks = p.tasks;
                }
                Err(e) => {
                    // 坏数据不静默吞掉：备份后重新播种，避免"看起来正常但数据没了"
                    let bak = path.with_extension(format!("corrupt.{}", now_ms()));
                    let _ = fs::copy(&path, &bak);
                    eprintln!("! 存储解析失败（{e}），已备份到 {bak:?} 并重新播种");
                }
            }
        }

        if inner.packages.is_empty() {
            let pk = |id: &str, name: &str, kind: &str, owner: &str, vendor: &str, version: &str| SoftwarePackage {
                id: id.into(), name: name.into(), kind: kind.into(), owner: owner.into(),
                vendor: vendor.into(), version: version.into(), verified: true, created_at: now_ms(),
            };
            inner.packages.push(pk("pkg-001", "NR-RAN", "网元软件包", "ne-0001", "华为", "5.2.1"));
            inner.packages.push(pk("pkg-002", "NR-RAN", "网元软件包", "ne-0001", "华为", "5.2.0"));
            inner.packages.push(pk("pkg-003", "EPC-CORE", "核心网软件包", "ne-0003", "中兴", "4.8.4"));
            inner.platform.lcm_elements = vec!["ne-0001".into(), "ne-0002".into(), "ne-0003".into()];
            inner.platform.omc_elements = vec!["ne-0001".into(), "ne-0002".into()];
            inner.platform.omc_groups = vec!["g-hz-01".into()];
            inner.platform.accounts = vec![
                Account { id: "acc-01".into(), name: "omc-ops".into(), role: "运维".into(), scope: vec!["ne-0001".into()] },
                Account { id: "acc-02".into(), name: "omc-view".into(), role: "只读".into(), scope: vec!["ne-0001".into(), "ne-0002".into()] },
            ];
        }
        if inner.human.states.is_empty() {
            inner.human.states = vec![
                HumanStateDef { id: "PENDING".into(), label: "待确认".into(), tone: "signal".into() },
                HumanStateDef { id: "RESOLVED".into(), label: "已确认".into(), tone: "ink".into() },
                HumanStateDef { id: "EXPIRED".into(), label: "已超时".into(), tone: "danger".into() },
                HumanStateDef { id: "SKIPPED".into(), label: "已跳过".into(), tone: "muted".into() },
            ];
            inner.human.outcomes = vec![
                HumanOutcomeDef { option: "确认继续".into(), effect: "continue".into(), to: "RESOLVED".into(), set_field: "humanResult=ok".into() },
                HumanOutcomeDef { option: "稍后处理".into(), effect: "hold".into(), to: "PENDING".into(), set_field: "humanResult=hold".into() },
                HumanOutcomeDef { option: "终止升级".into(), effect: "abort".into(), to: "EXPIRED".into(), set_field: "humanResult=abort".into() },
            ];
        }
        if inner.elements.is_empty() {
            inner.groups.push(ElementGroup {
                id: "g-hz-01".into(), name: "杭州 gNB 组".into(), site: "site-hz".into(),
                element_ids: vec!["ne-0001".into(), "ne-0002".into()], created_at: now_ms(),
            });
            inner.groups.push(ElementGroup {
                id: "g-hz-02".into(), name: "杭州 核心网组".into(), site: "site-hz".into(),
                element_ids: vec!["ne-0003".into()], created_at: now_ms(),
            });
            let comps = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
            inner.elements.push(NetworkElement {
                id: "ne-0001".into(), name: "gNB-HZ-0904".into(), arch: "SA".into(), kind: "gNB".into(),
                version: "5.2.1".into(), software: "NR-RAN".into(),
                prev_versions: vec!["5.1.9".into(), "5.1.4".into()],
                group: "g-hz-01".into(),
                components: comps(&["主控板", "交换板", "业务板", "电源", "风扇"]),
                checks: vec![
                    ElementCheck { field: "version".into(), rule: "目标版本 > 当前版本".into(), msg: "不支持降级".into() },
                    ElementCheck { field: "arch".into(), rule: "必须与网元架构一致".into(), msg: "架构不匹配".into() },
                ],
                flow: vec![], created_at: now_ms(),
            });
            inner.elements.push(NetworkElement {
                id: "ne-0002".into(), name: "gNB-HZ-0905".into(), arch: "SA".into(), kind: "gNB".into(),
                version: "5.2.0".into(), software: "NR-RAN".into(),
                prev_versions: vec!["5.1.9".into()], group: "g-hz-01".into(),
                components: comps(&["主控板", "业务板", "电源"]),
                checks: vec![], flow: vec![], created_at: now_ms(),
            });
            inner.elements.push(NetworkElement {
                id: "ne-0003".into(), name: "MME-HZ-01".into(), arch: "EPC".into(), kind: "MME".into(),
                version: "4.8.4".into(), software: "EPC-CORE".into(),
                prev_versions: vec!["4.8.3".into()], group: "g-hz-02".into(),
                components: comps(&["主控板", "信令板", "电源"]),
                checks: vec![], flow: vec![], created_at: now_ms(),
            });
        }
        if inner.users.is_empty() {
            seed(&mut inner);
        if inner.endpoints.is_empty() {
            inner.endpoints.push(MockEndpoint {
                id: "ep-0001".into(), host: "127.0.0.1".into(), port: 8443,
                capabilities: vec!["NEMP".into()], cert: None, enabled: false,
                created_at: now_ms(),
            });
        }
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
            endpoints: inner.endpoints.clone(),
            elements: inner.elements.clone(),
            packages: inner.packages.clone(),
            human: inner.human.clone(),
            platform: inner.platform.clone(),
            groups: inner.groups.clone(),
            hits: inner.hits.clone(),
            tasks: inner.tasks.clone(),
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

    // ---------------- 人机交互模板 ----------------
    pub fn human_template(&self) -> HumanTemplate {
        self.inner.lock().unwrap().human.clone()
    }

    pub fn patch_human_template(&self, req: PatchHumanTemplateReq) -> Result<HumanTemplate> {
        let mut i = self.inner.lock().unwrap();
        if let Some(s) = req.states { i.human.states = s; }
        if let Some(o) = req.outcomes { i.human.outcomes = o; }
        let out = i.human.clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    // ---------------- LCM 软件包 / 平台配置 ----------------
    pub fn packages(&self) -> Vec<SoftwarePackage> {
        self.inner.lock().unwrap().packages.clone()
    }
    pub fn platform(&self) -> PlatformCfg {
        self.inner.lock().unwrap().platform.clone()
    }

    pub fn create_package(&self, req: NewPackageReq) -> Result<SoftwarePackage> {
        let mut i = self.inner.lock().unwrap();
        let next = i.packages.iter()
            .filter_map(|p| p.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max().unwrap_or(0) + 1;
        let p = SoftwarePackage {
            id: format!("pkg-{:03}", next),
            name: req.name, kind: req.kind, owner: req.owner,
            vendor: req.vendor, version: req.version,
            verified: false, created_at: now_ms(),
        };
        i.packages.push(p.clone());
        self.persist_locked(&i)?;
        Ok(p)
    }

    pub fn patch_platform(&self, req: PatchPlatformReq) -> Result<PlatformCfg> {
        let mut i = self.inner.lock().unwrap();
        {
            let p = &mut i.platform;
            if let Some(v) = req.lcm_elements { p.lcm_elements = v; }
            if let Some(v) = req.co_deploy { p.co_deploy = v; }
            if let Some(v) = req.omc_elements { p.omc_elements = v; }
            if let Some(v) = req.omc_groups { p.omc_groups = v; }
            if let Some(v) = req.accounts { p.accounts = v; }
            if let Some(v) = req.fs { p.fs = v; }
        }
        let out = i.platform.clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    /// 包升级 → 生成一体化升级任务（LCM 管版本、OMC 管升级的联动点）
    pub fn upgrade_package(&self, pkg_id: &str, site: &str, to_override: Option<String>) -> Result<UpgradeTask> {
        let pkg = {
            let i = self.inner.lock().unwrap();
            i.packages.iter().find(|p| p.id == pkg_id).cloned().ok_or(Error::NotFound)?
        };
        let from = {
            let i = self.inner.lock().unwrap();
            i.elements.iter().find(|e| e.id == pkg.owner).map(|e| e.version.clone()).unwrap_or_else(|| "0.0.0".into())
        };
        let req = NewTaskReq {
            site: if site.is_empty() { "site-hz".into() } else { site.into() },
            element_ids: vec![pkg.owner.clone()],
            from_version: from,
            to_version: to_override.unwrap_or_else(|| pkg.version.clone()),
        };
        let task = self.create_task(req)?;
        // 标记包为已验证（升级即视为已校验）
        {
            let mut i = self.inner.lock().unwrap();
            if let Some(p) = i.packages.iter_mut().find(|p| p.id == pkg_id) {
                p.verified = true;
            }
            let _ = self.persist_locked(&i);
        }
        Ok(task)
    }

    // ---------------- 网元 ----------------
    pub fn elements(&self) -> Vec<NetworkElement> {
        self.inner.lock().unwrap().elements.clone()
    }
    pub fn groups(&self) -> Vec<ElementGroup> {
        self.inner.lock().unwrap().groups.clone()
    }

    pub fn create_element(&self, req: NewElementReq) -> Result<NetworkElement> {
        let mut i = self.inner.lock().unwrap();
        let next = i.elements.iter()
            .filter_map(|e| e.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max().unwrap_or(0) + 1;
        let el = NetworkElement {
            id: format!("ne-{:04}", next),
            name: req.name, arch: req.arch, kind: req.kind,
            version: req.version, software: req.software,
            prev_versions: vec![], group: req.group,
            components: req.components, checks: vec![],
            flow: vec![
                ElementStep { step: "上传软件包".into(), human: false },
                ElementStep { step: "预检查（参数校验）".into(), human: false },
                ElementStep { step: "激活".into(), human: true },
                ElementStep { step: "主备倒换".into(), human: true },
                ElementStep { step: "完成与回执".into(), human: false },
            ],
            created_at: now_ms(),
        };
        i.elements.push(el.clone());
        self.persist_locked(&i)?;
        Ok(el)
    }

    pub fn patch_element(&self, id: &str, req: PatchElementReq) -> Result<NetworkElement> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.elements.iter().position(|e| e.id == id).ok_or(Error::NotFound)?;
        {
            let e = &mut i.elements[idx];
            if let Some(v) = req.name { e.name = v; }
            if let Some(v) = req.arch { e.arch = v; }
            if let Some(v) = req.kind { e.kind = v; }
            if let Some(v) = req.version { e.prev_versions.insert(0, e.version.clone()); e.version = v; }
            if let Some(v) = req.software { e.software = v; }
            if let Some(v) = req.group { e.group = v; }
            if let Some(v) = req.components { e.components = v; }
            if let Some(v) = req.checks { e.checks = v; }
            if let Some(v) = req.flow { e.flow = v; }
        }
        let out = i.elements[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    /// 复制网元（同名 + "-copy"，同组）
    pub fn copy_element(&self, id: &str) -> Result<NetworkElement> {
        let mut i = self.inner.lock().unwrap();
        let src = i.elements.iter().find(|e| e.id == id).cloned().ok_or(Error::NotFound)?;
        let next = i.elements.iter()
            .filter_map(|e| e.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max().unwrap_or(0) + 1;
        let mut el = src.clone();
        el.id = format!("ne-{:04}", next);
        el.name = format!("{}-copy", src.name);
        el.created_at = now_ms();
        el.prev_versions.clear();
        i.elements.push(el.clone());
        self.persist_locked(&i)?;
        Ok(el)
    }

    pub fn create_group(&self, req: NewGroupReq) -> Result<ElementGroup> {
        let mut i = self.inner.lock().unwrap();
        let next = i.groups.iter()
            .filter_map(|g| g.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max().unwrap_or(0) + 1;
        let g = ElementGroup {
            id: format!("g-{:04}", next),
            name: req.name, site: req.site, element_ids: req.element_ids,
            created_at: now_ms(),
        };
        i.groups.push(g.clone());
        self.persist_locked(&i)?;
        Ok(g)
    }

    // ---------------- 审计 ----------------
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

    // ---------------- MOCK 规则 ----------------
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

    // ---------------- 升级任务 ----------------
    pub fn tasks(&self) -> Vec<UpgradeTask> {
        self.inner.lock().unwrap().tasks.clone()
    }

    /// 新建一体化升级任务：5 段流程，其中 activate / 主备倒换 带人机交互
    pub fn create_task(&self, req: NewTaskReq) -> Result<UpgradeTask> {
        let mut i = self.inner.lock().unwrap();
        let next = i
            .tasks
            .iter()
            .filter_map(|t| t.id.rsplit('-').next().and_then(|x| x.parse::<u32>().ok()))
            .max()
            .unwrap_or(0)
            + 1;
        let human = |prompt: &str, timeout_s: u32| HumanStep {
            prompt: prompt.into(),
            options: vec![
                HumanOption { label: "确认继续".into(), effect: "continue".into() },
                HumanOption { label: "稍后处理".into(), effect: "hold".into() },
                HumanOption { label: "终止升级".into(), effect: "abort".into() },
            ],
            state: "pending".into(),
            chosen: None,
            timeout_s,
        };
        let stages = vec![
            UpgradeStage { key: "upload".into(), label: "上传软件包".into(), state: "done".into(), human: None },
            UpgradeStage { key: "verify".into(), label: "预检查与参数校验".into(), state: "done".into(), human: None },
            UpgradeStage { key: "activate".into(), label: "激活".into(), state: "running".into(),
                human: Some(human("升级包已就绪，确认开始激活？", 60)) },
            UpgradeStage { key: "switch".into(), label: "主备倒换".into(), state: "pending".into(),
                human: Some(human("即将主备倒换，请确认现场可以操作", 45)) },
            UpgradeStage { key: "done".into(), label: "完成与回执".into(), state: "pending".into(), human: None },
        ];
        let task = UpgradeTask {
            id: format!("UPG-{:04}", 90 + next),
            site: req.site,
            element_ids: req.element_ids,
            from_version: req.from_version,
            to_version: req.to_version,
            stage: 2,
            progress: 40,
            stages,
            created_at: now_ms(),
        };
        i.tasks.push(task.clone());
        self.persist_locked(&i)?;
        Ok(task)
    }

    /// 提交人工确认：continue 推进阶段、hold 挂起、abort 失败
    pub fn resolve_human(&self, id: &str, option: usize) -> Result<UpgradeTask> {
        let mut i = self.inner.lock().unwrap();
        let idx = i.tasks.iter().position(|t| t.id == id).ok_or(Error::NotFound)?;
        {
            let t = &mut i.tasks[idx];
            let si = t.stage;
            if si >= t.stages.len() {
                return Ok(t.clone());
            }
            let eff = match &t.stages[si].human {
                Some(h) => h.options.get(option).map(|o| o.effect.clone()).unwrap_or_else(|| "continue".into()),
                None => "continue".into(),
            };
            if let Some(h) = t.stages[si].human.as_mut() {
                h.state = if eff == "abort" { "expired".into() } else { "resolved".into() };
                h.chosen = Some(option);
            }
            match eff.as_str() {
                "continue" => {
                    t.stages[si].state = "done".into();
                    let next = (si + 1).min(t.stages.len() - 1);
                    t.stage = next;
                    t.stages[next].state = "running".into();
                    t.progress = (((next + 1) as f32 / t.stages.len() as f32) * 100.0) as u8;
                    if next == t.stages.len() - 1 {
                        t.stages[next].state = "running".into();
                    }
                }
                "hold" => {
                    t.stages[si].state = "held".into();
                }
                _ => {
                    t.stages[si].state = "failed".into();
                    t.progress = 0;
                }
            }
        }
        let out = i.tasks[idx].clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    // ---------------- Mock 端点 ----------------
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
            if k % 4 == 0 { body.push('\n'); }
        }
        let san = if req.san.is_empty() { vec![req.cn.clone(), "localhost".into()] } else { req.san };
        let cert = MockCert {
            cn: req.cn.clone(),
            san: san.clone(),
            serial: serial.clone(),
            issued_at: now_ms(),
            expires_at: now_ms() + 365 * 24 * 3600 * 1000,
            pem: format!(
                "-----BEGIN CERTIFICATE-----\n# RHINE LAB · DEMO CERT（演示用，不可用于真实 TLS）\n# CN={}\n# SAN={}\n# SERIAL={}\n{}\n-----END CERTIFICATE-----",
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
            fields: vec![],
            human: None,
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
            fields: vec![],
            human: None,
              version: ["0.1.1", "0.1.0", "0.2.0"][i % 3].to_string(),
            hits: (i as u64) * 7,
            last_hit_at: None,
            created_at: now_ms() - (i as i64) * 60_000,
        });
    }
    inner.seq = 10;
}

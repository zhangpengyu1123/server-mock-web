#!/usr/bin/env node
/* LCM 软件包 + 平台配置（共部署/FS 参数）+ 包升级联动生成任务 */
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
const M = `
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
pub struct FsConfig {
    pub cpus: u32,
    pub site_primary: String,
    pub site_secondary: String,
    pub version: String,
    #[serde(default)]
    pub verify_steps: Vec<String>,
    #[serde(default)]
    pub upgrade_steps: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
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
    pub fs: FsConfig,
}

#[derive(Debug, Deserialize)]
pub struct PatchPlatformReq {
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
}
`;
patch('console/crates/core/src/model.rs', [
  ['// ---------------- 网元 ----------------', M + '\n// ---------------- 网元 ----------------', 'model packages'],
]);

/* ---------- store ---------- */
patch('console/crates/core/src/store.rs', [
  ['struct Inner {', 'struct Inner {\n    packages: Vec<SoftwarePackage>,\n    platform: PlatformCfg,', 'inner packages'],
  ['endpoints: vec![],', `endpoints: vec![],
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
            },`, 'inner init packages'],
  ['inner.elements = p.elements;', 'inner.elements = p.elements;\n                        inner.packages = p.packages;\n                        inner.platform = p.platform;', 'load packages'],
  ['#[serde(default)]\n    elements: Vec<NetworkElement>,',
   `#[serde(default)]
    elements: Vec<NetworkElement>,
    #[serde(default)]
    packages: Vec<SoftwarePackage>,
    #[serde(default)]
    platform: PlatformCfg,`, 'persisted packages'],
  ['elements: inner.elements.clone(),', 'elements: inner.elements.clone(),\n            packages: inner.packages.clone(),\n            platform: inner.platform.clone(),', 'persist packages'],
  ['    // ---------------- 网元 ----------------', `    // ---------------- LCM 软件包 / 平台配置 ----------------
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
    pub fn upgrade_package(&self, pkg_id: &str, site: &str) -> Result<UpgradeTask> {
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
            to_version: pkg.version.clone(),
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

    // ---------------- 网元 ----------------`, 'store packages'],
]);

/* ---------- seed packages ---------- */
patch('console/crates/core/src/store.rs', [
  ['if inner.elements.is_empty() {', `if inner.packages.is_empty() {
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
        if inner.elements.is_empty() {`, 'seed packages'],
]);

/* ---------- main ---------- */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_elements(', `async fn business_packages(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<SoftwarePackage>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.packages()))
}

async fn business_create_package(
    st: Ctx, headers: HeaderMap, Json(req): Json<NewPackageReq>,
) -> ApiResult<Json<SoftwarePackage>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.create_package(req)?))
}

async fn business_platform(st: Ctx, headers: HeaderMap) -> ApiResult<Json<PlatformCfg>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.platform()))
}

async fn business_patch_platform(
    st: Ctx, headers: HeaderMap, Json(req): Json<PatchPlatformReq>,
) -> ApiResult<Json<PlatformCfg>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_platform(req)?))
}

async fn business_package_upgrade(
    st: Ctx, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<PackageUpgradeReq>,
) -> ApiResult<Json<UpgradeTask>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let t = st.store.upgrade_package(&id, &req.site)?;
    st.store.push_log("business", "pkg.upgrade", &format!("软件包 {} → 任务 {}", id, t.id), "info");
    Ok(Json(t))
}

async fn business_elements(`, 'handlers packages'],
  ['.route("/business/elements", get(business_elements).post(business_create_element))',
   `.route("/business/packages", get(business_packages).post(business_create_package))
        .route("/business/packages/:id/upgrade", post(business_package_upgrade))
        .route("/business/platform", get(business_platform).patch(business_patch_platform))
        .route("/business/elements", get(business_elements).post(business_create_element))`, 'routes packages'],
]);

console.log(log.join('\n'));

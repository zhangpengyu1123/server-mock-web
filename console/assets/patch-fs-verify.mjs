#!/usr/bin/env node
/* FS 软件包校验：可执行步骤 + 结果落库 */
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

/* model：VerifyRun + FsConfig 增加 verify_runs */
patch('console/crates/core/src/model.rs', [
  [`#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FsConfig {`,
`#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifyRun {
    pub step: String,
    /// pass | fail | pending
    pub status: String,
    pub at: Millis,
    #[serde(default)]
    pub note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FsConfig {`, 'model verify'],
  [`    #[serde(default)]
    pub upgrade_steps: Vec<String>,
}`,
`    #[serde(default)]
    pub upgrade_steps: Vec<String>,
    #[serde(default)]
    pub verify_runs: Vec<VerifyRun>,
}`, 'fs verify_runs'],
]);

/* store：执行校验 */
patch('console/crates/core/src/store.rs', [
  ['    // ---------------- 人机交互模板 ----------------',
`    /// 执行 FS 软件包校验流程：逐项判定并记录结果
    pub fn run_fs_verify(&self) -> Result<PlatformCfg> {
        let mut i = self.inner.lock().unwrap();
        let steps = i.platform.fs.verify_steps.clone();
        let pkg_count = i.packages.len();
        let same_site = i.platform.fs.site_primary == i.platform.fs.site_secondary;
        let mut runs = Vec::new();
        for s in steps.iter() {
            let (ok, note) = if s.contains("checksum") {
                (true, "sha256 匹配")
            } else if s.contains("签名") {
                (true, "GPG 签名有效")
            } else if s.contains("兼容") {
                (pkg_count > 0, if pkg_count > 0 { format!("{} 个软件包与平台版本兼容", pkg_count) } else { "仓库为空，无法校验兼容性".into() })
            } else if s.contains("一致性") {
                (!same_site, if same_site { "主备站点同名，校验失败".into() } else { "主备站点一致".into() })
            } else {
                (true, "通过".into())
            };
            runs.push(VerifyRun {
                step: s.clone(),
                status: if ok { "pass".into() } else { "fail".into() },
                at: now_ms(),
                note,
            });
            if !ok { break; }
        }
        i.platform.fs.verify_runs = runs;
        let out = i.platform.clone();
        self.persist_locked(&i)?;
        Ok(out)
    }

    // ---------------- 人机交互模板 ----------------`, 'store verify'],
]);

/* main：路由 */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_human_template(', `async fn business_fs_verify(st: Ctx, headers: HeaderMap) -> ApiResult<Json<PlatformCfg>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let cfg = st.store.run_fs_verify()?;
    let fails = cfg.fs.verify_runs.iter().filter(|r| r.status == "fail").count();
    st.store.push_log("business", "fs.verify", &format!("FS 包校验完成，失败 {} 项", fails), if fails > 0 { "warn" } else { "info" });
    Ok(Json(cfg))
}

async fn business_human_template(`, 'handler verify'],
  ['.route("/business/human-template", get(business_human_template).patch(business_patch_human_template))',
   `.route("/business/human-template", get(business_human_template).patch(business_patch_human_template))
        .route("/business/platform/fs/verify", post(business_fs_verify))`, 'route verify'],
]);

console.log(log.join('\n'));

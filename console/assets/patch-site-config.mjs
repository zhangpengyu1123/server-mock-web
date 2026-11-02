#!/usr/bin/env node
/* 站点可配置：PlatformCfg 增加 site_name / site_role，OMC 页可编辑 */
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

/* model */
patch('console/crates/core/src/model.rs', [
  ['    #[serde(default)]\n    pub accounts: Vec<Account>,',
   `    #[serde(default)]
    pub accounts: Vec<Account>,
    /// 站点（一体化升级任务关联的站点）
    #[serde(default)]
    pub site_name: String,
    #[serde(default)]
    pub site_role: String,`, 'model site'],
  ['pub struct PatchPlatformReq {',
   `pub struct PatchPlatformReq {
    pub site_name: Option<String>,
    pub site_role: Option<String>,`, 'patch req site'],
]);

/* store：默认值 + patch */
patch('console/crates/core/src/store.rs', [
  ['                omc_elements: vec![], omc_groups: vec![],\n                accounts: vec![],',
   `                omc_elements: vec![], omc_groups: vec![],
                accounts: vec![],
                site_name: "HZ 主站点".into(),
                site_role: "primary".into(),`, 'store default site'],
  ['            if let Some(v) = req.accounts { p.accounts = v; }',
   `            if let Some(v) = req.accounts { p.accounts = v; }
            if let Some(v) = req.site_name { p.site_name = v; }
            if let Some(v) = req.site_role { p.site_role = v; }`, 'store patch site'],
]);

console.log(log.join('\n'));

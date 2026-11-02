#!/usr/bin/env node
/* 人机交互模板落库：状态机（状态 + 操作结果） */
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
  ['// ---------------- LCM 软件包 ----------------', `// ---------------- 人机交互模板 ----------------
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

// ---------------- LCM 软件包 ----------------`, 'model human'],
]);

/* store */
patch('console/crates/core/src/store.rs', [
  ['struct Inner {', 'struct Inner {\n    human: HumanTemplate,', 'inner human'],
  ['endpoints: vec![],', `endpoints: vec![],
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
            },`, 'inner init human'],
  ['inner.elements = p.elements;', 'inner.elements = p.elements;\n                        inner.human = p.human;', 'load human'],
  ['#[serde(default)]\n    packages: Vec<SoftwarePackage>,',
   '#[serde(default)]\n    packages: Vec<SoftwarePackage>,\n    #[serde(default)]\n    human: HumanTemplate,', 'persisted human'],
  ['packages: inner.packages.clone(),', 'packages: inner.packages.clone(),\n            human: inner.human.clone(),', 'persist human'],
  ['    // ---------------- LCM 软件包 / 平台配置 ----------------', `    // ---------------- 人机交互模板 ----------------
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

    // ---------------- LCM 软件包 / 平台配置 ----------------`, 'store human'],
]);

/* main */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_packages(', `async fn business_human_template(st: Ctx, headers: HeaderMap) -> ApiResult<Json<HumanTemplate>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.human_template()))
}

async fn business_patch_human_template(
    st: Ctx, headers: HeaderMap, Json(req): Json<PatchHumanTemplateReq>,
) -> ApiResult<Json<HumanTemplate>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_human_template(req)?))
}

async fn business_packages(`, 'handlers human'],
  ['.route("/business/packages", get(business_packages).post(business_create_package))',
   `.route("/business/human-template", get(business_human_template).patch(business_patch_human_template))
        .route("/business/packages", get(business_packages).post(business_create_package))`, 'routes human'],
]);

console.log(log.join('\n'));

#!/usr/bin/env node
/* 网元 / 网元组 落库 + 接口 */
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
`;
patch('console/crates/core/src/model.rs', [
  ['// ---------------- 升级任务（OMC 一体化升级） ----------------', M + '\n// ---------------- 升级任务（OMC 一体化升级） ----------------', 'model elements'],
]);

/* ---------- store ---------- */
patch('console/crates/core/src/store.rs', [
  ['struct Inner {', 'struct Inner {\n    elements: Vec<NetworkElement>,\n    groups: Vec<ElementGroup>,', 'inner elements'],
  ['endpoints: vec![],', 'endpoints: vec![],\n            elements: vec![],\n            groups: vec![],', 'inner init'],
  ['inner.endpoints = p.endpoints;', 'inner.endpoints = p.endpoints;\n                        inner.elements = p.elements;\n                        inner.groups = p.groups;', 'load'],
  ['#[serde(default)]\n    endpoints: Vec<MockEndpoint>,',
   '#[serde(default)]\n    endpoints: Vec<MockEndpoint>,\n    #[serde(default)]\n    elements: Vec<NetworkElement>,\n    #[serde(default)]\n    groups: Vec<ElementGroup>,', 'persisted'],
  ['endpoints: inner.endpoints.clone(),', 'endpoints: inner.endpoints.clone(),\n            elements: inner.elements.clone(),\n            groups: inner.groups.clone(),', 'persist'],
  ['    // ---------------- 审计 ----------------', `    // ---------------- 网元 ----------------
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

    // ---------------- 审计 ----------------`, 'store elements'],
]);

/* ---------- seed ---------- */
patch('console/crates/core/src/store.rs', [
  ['if inner.users.is_empty() {', `if inner.elements.is_empty() {
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
        if inner.users.is_empty() {`, 'seed elements'],
]);

/* ---------- main: handlers + routes ---------- */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_audit(', `async fn business_elements(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<NetworkElement>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.elements()))
}

async fn business_create_element(
    st: Ctx, headers: HeaderMap, Json(req): Json<NewElementReq>,
) -> ApiResult<Json<NetworkElement>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.create_element(req)?))
}

async fn business_patch_element(
    st: Ctx, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<PatchElementReq>,
) -> ApiResult<Json<NetworkElement>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.patch_element(&id, req)?))
}

async fn business_copy_element(
    st: Ctx, headers: HeaderMap, Path(id): Path<String>,
) -> ApiResult<Json<NetworkElement>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    let el = st.store.copy_element(&id)?;
    st.store.push_log("business", "element.copy", &format!("复制网元 {}", el.id), "info");
    Ok(Json(el))
}

async fn business_groups(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<ElementGroup>>> {
    let _u = auth(&st, &headers)?;
    Ok(Json(st.store.groups()))
}

async fn business_create_group(
    st: Ctx, headers: HeaderMap, Json(req): Json<NewGroupReq>,
) -> ApiResult<Json<ElementGroup>> {
    let u = auth(&st, &headers)?;
    csrf_guard(&st, &headers, &u)?;
    Ok(Json(st.store.create_group(req)?))
}

async fn business_audit(`, 'handlers elements'],
  ['.route("/business/audit", get(business_audit))',
   `.route("/business/elements", get(business_elements).post(business_create_element))
        .route("/business/elements/:id", patch(business_patch_element))
        .route("/business/elements/:id/copy", post(business_copy_element))
        .route("/business/groups", get(business_groups).post(business_create_group))
        .route("/business/audit", get(business_audit))`, 'routes elements'],
]);

console.log(log.join('\n'));

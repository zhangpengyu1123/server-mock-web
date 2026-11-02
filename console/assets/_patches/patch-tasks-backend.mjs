#!/usr/bin/env node
/* 升级任务后端：UpgradeTask / Stage / HumanStep + 创建、查询、人工确认
   路由：GET/POST /api/business/tasks、POST /api/business/tasks/:id/human */
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

/* ---------------- model.rs ---------------- */
const MODEL = `
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
`;
patch('console/crates/core/src/model.rs', [
  ['/// Mock 监听端点：本机 IP:端口', MODEL + '\n/// Mock 监听端点：本机 IP:端口', 'model tasks'],
]);

/* ---------------- store.rs ---------------- */
patch('console/crates/core/src/store.rs', [
  ['struct Inner {', 'struct Inner {\n    tasks: Vec<UpgradeTask>,', 'inner tasks'],
  ['endpoints: vec![],', 'endpoints: vec![],\n            tasks: vec![],', 'inner init tasks'],
  ['inner.endpoints = p.endpoints;', 'inner.endpoints = p.endpoints;\n                        inner.tasks = p.tasks;', 'load tasks'],
  ['#[serde(default)]\n    endpoints: Vec<MockEndpoint>,',
   '#[serde(default)]\n    endpoints: Vec<MockEndpoint>,\n    #[serde(default)]\n    tasks: Vec<UpgradeTask>,', 'persisted tasks'],
  ['endpoints: inner.endpoints.clone(),', 'endpoints: inner.endpoints.clone(),\n            tasks: inner.tasks.clone(),', 'persist tasks'],
  ['    // ---------------- Mock 端点 ----------------', `    // ---------------- 升级任务 ----------------
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

    // ---------------- Mock 端点 ----------------`, 'store task methods'],
]);

/* ---------------- main.rs ---------------- */
patch('console/apps/agent/src/main.rs', [
  ['async fn business_endpoints(', `async fn business_tasks(st: Ctx, headers: HeaderMap) -> ApiResult<Json<Vec<UpgradeTask>>> {
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

async fn business_endpoints(`, 'handlers tasks'],
  ['.route("/business/endpoints", get(business_endpoints).post(business_create_endpoint))',
   `.route("/business/tasks", get(business_tasks).post(business_create_task))
        .route("/business/tasks/:id/human", post(business_resolve_human))
        .route("/business/endpoints", get(business_endpoints).post(business_create_endpoint))`, 'routes tasks'],
]);

console.log(log.join('\n'));

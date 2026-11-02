#!/usr/bin/env node
/* 多规则匹配：Mapping.variants，按 when 条件顺序匹配，命中即用该规则的状态码/延迟/响应体 */
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
patch('console/crates/core/src/model.rs', [
  [`pub struct Mapping {`,
`/// 一条"条件规则"：when 命中时覆盖状态码/延迟/响应体
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct RuleVariant {
    /// 条件表达式，如 req.mode=="fast"；空串 = 兜底
    #[serde(default)]
    pub when: String,
    pub status: Option<u16>,
    pub delay_ms: Option<u32>,
    pub body: Option<String>,
    #[serde(default)]
    pub note: String,
}

pub struct Mapping {`, 'model RuleVariant'],
  [`    pub fields: Vec<RuleField>,`, `    pub fields: Vec<RuleField>,
    #[serde(default)]
    pub variants: Vec<RuleVariant>,`, 'mapping variants'],
  [`pub struct PatchRulesReq {`, `pub struct PatchRulesReq {
    pub variants: Option<Vec<RuleVariant>>,`, 'patch variants'],
]);

/* ---------- store: 新建 mapping 时空 variants ---------- */
patch('console/crates/core/src/store.rs', [
  ['            fields: vec![],', '            fields: vec![],\n            variants: vec![],', 'create variants'],
  ['            if let Some(v) = req.fields { m.fields = v; }',
   '            if let Some(v) = req.fields { m.fields = v; }\n            if let Some(v) = req.variants { m.variants = v; }', 'patch store variants'],
]);

console.log(log.join('\n'));

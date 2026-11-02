#!/usr/bin/env node
/* 按行插入：多规则匹配 + 使用生效值（修正 anchor） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/apps/agent/src/main.rs';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

// ① 在 human 判定前插入变体选择
const hi = lines.findIndex((l) => l.includes('if let Some(h) = m.human.as_ref() {'));
if (hi < 0) { console.log('MISS human'); process.exit(1); }
const ins = `        // 多规则匹配：按顺序取第一条 when 命中的变体，覆盖状态码 / 延迟 / 响应体
        let req_match = body.as_ref().map(|Json(v)| v.clone()).unwrap_or_else(|| json!({}));
        let mut eff_status = m.status;
        let mut eff_delay = m.delay_ms;
        let mut eff_body = m.body.clone();
        let mut matched_when = String::new();
        for v in &m.variants {
            let hit = v.when.trim().is_empty() || eval_condition(&v.when, &req_match) == "true";
            if !hit { continue; }
            if let Some(s) = v.status { eff_status = s; }
            if let Some(d) = v.delay_ms { eff_delay = d; }
            if let Some(b) = &v.body { eff_body = b.clone(); }
            matched_when = if v.when.trim().is_empty() { "default".to_string() } else { v.when.clone() };
            break;
        }
`.split('\n');
lines = [...lines.slice(0, hi), ...ins, ...lines.slice(hi)];
log.push('ok   变体选择');

// ② 生效值替换（逐行）
let i2 = lines.findIndex((l) => l.includes('if m.delay_ms > 0 {'));
if (i2 >= 0) { lines[i2] = '      if eff_delay > 0 {'; log.push('ok   eff_delay 判定'); }
let i3 = lines.findIndex((l) => l.includes('Duration::from_millis(m.delay_ms as u64)'));
if (i3 >= 0) { lines[i3] = lines[i3].replace('m.delay_ms', 'eff_delay'); log.push('ok   eff_delay sleep'); }
let i4 = lines.findIndex((l) => l.includes('let out_body = if m.fields.is_empty() {'));
if (i4 >= 0) {
  lines[i4 + 1] = '          eff_body.clone()';
  for (let k = i4 + 2; k < i4 + 8; k++) {
    if (lines[k].includes('build_body(&fs, &req_json, &m.body)')) { lines[k] = lines[k].replace('&m.body', '&eff_body'); }
    if (lines[k].includes('Err(_) => m.body.clone()')) { lines[k] = lines[k].replace('m.body.clone()', 'eff_body.clone()'); }
  }
  log.push('ok   eff_body 使用');
}
let i5 = lines.findIndex((l) => l.includes('StatusCode::from_u16(m.status)'));
if (i5 >= 0) {
  lines[i5] = lines[i5].replace('m.status', 'eff_status');
  lines.splice(i5 + 1, 0,
    '      if !matched_when.is_empty() {',
    '          res.headers_mut().insert(',
    '              header::HeaderName::from_static("x-rhine-rule"),',
    '              HeaderValue::from_str(&matched_when).unwrap_or_else(|_| HeaderValue::from_static("-")),',
    '          );',
    '      }');
  log.push('ok   eff_status + 规则头');
}
// ③ 审计状态
for (let k = 0; k < lines.length; k++) {
  if (lines[k].includes('status: m.status,')) { lines[k] = lines[k].replace('m.status', 'eff_status'); log.push('ok   审计 status'); }
  if (lines[k].includes('delay_ms: m.delay_ms,') && k > 600) { lines[k] = lines[k].replace('m.delay_ms', 'eff_delay'); log.push('ok   审计 delay'); }
}
writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));

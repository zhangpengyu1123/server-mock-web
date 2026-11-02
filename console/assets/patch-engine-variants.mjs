#!/usr/bin/env node
/* mock_engine：加入多规则匹配（variants 覆盖 status / delay / body） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/apps/agent/src/main.rs';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 在 human 判定前插入变体选择 */
rep(`        if let Some(h) = &m.human {`,
`        // 多规则匹配：按顺序取第一条 when 命中的变体，覆盖状态码 / 延迟 / 响应体
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

        if let Some(h) = &m.human {`, 'variant select');

/* 2) 使用生效值 */
rep(`      if m.delay_ms > 0 {
          tokio::time::sleep(Duration::from_millis(m.delay_ms as u64)).await;
      }
      let req_json = body.map(|Json(v)| v).unwrap_or_else(|| json!({}));
      let out_body = if m.fields.is_empty() {
          m.body.clone()
      } else {
          match st.store.advance_rules(&m.id) {
              Ok(fs) => build_body(&fs, &req_json, &m.body),
              Err(_) => m.body.clone(),
          }
      };`,
`      if eff_delay > 0 {
          tokio::time::sleep(Duration::from_millis(eff_delay as u64)).await;
      }
      let req_json = body.map(|Json(v)| v).unwrap_or_else(|| json!({}));
      let out_body = if m.fields.is_empty() {
          eff_body.clone()
      } else {
          match st.store.advance_rules(&m.id) {
              Ok(fs) => build_body(&fs, &req_json, &eff_body),
              Err(_) => eff_body.clone(),
          }
      };`, 'use effective');

rep(`      *res.status_mut() = StatusCode::from_u16(m.status).unwrap_or(StatusCode::OK);
      res.headers_mut().insert(header::CONTENT_TYPE, ct);`,
`      *res.status_mut() = StatusCode::from_u16(eff_status).unwrap_or(StatusCode::OK);
      res.headers_mut().insert(header::CONTENT_TYPE, ct);
      if !matched_when.is_empty() {
          res.headers_mut().insert(
              header::HeaderName::from_static("x-rhine-rule"),
              HeaderValue::from_str(&matched_when).unwrap_or_else(|_| HeaderValue::from_static("-")),
          );
      }`, 'status + rule header');

/* 3) 审计里记生效状态码 */
rep(`          status: m.status,
          delay_ms: m.delay_ms,`, `          status: eff_status,
          delay_ms: eff_delay,`, 'audit status');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

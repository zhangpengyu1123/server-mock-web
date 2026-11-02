#!/usr/bin/env node
/* 合并 MockHit：保留既有定义并扩展审计字段；删掉我新加的那份；补全构造点 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
function rd(f) { return readFileSync(f, 'utf8'); }
function wr(f, t) { writeFileSync(f, t, 'utf8'); }

/* ---- model.rs ---- */
{
  const f = 'console/crates/core/src/model.rs';
  let t = rd(f);
  // 1) 删除我新增的重复定义（带注释那份）
  const dup = `/// 一次 mock 命中记录（审计用）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MockHit {
    pub at: Millis,
    pub mapping_id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub delay_ms: u32,
    pub human: bool,
}

`;
  if (t.includes(dup)) { t = t.replace(dup, ''); log.push('ok   model: 删除重复 MockHit'); }
  else log.push('MISS model dup');

  // 2) 扩展既有 MockHit
  const oldStruct = `pub struct MockHit {
    pub status: u16,
    pub body: String,
    pub content_type: String,
    pub latency_ms: u64,
    pub mapping_id: String,
}`;
  const newStruct = `pub struct MockHit {
    pub status: u16,
    pub body: String,
    pub content_type: String,
    pub latency_ms: u64,
    pub mapping_id: String,
    /// 审计扩展字段
    #[serde(default)]
    pub at: Millis,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub delay_ms: u32,
    #[serde(default)]
    pub human: bool,
}`;
  if (t.includes(oldStruct)) { t = t.replace(oldStruct, newStruct); log.push('ok   model: 扩展 MockHit'); }
  else log.push('MISS model extend');
  wr(f, t);
}

/* ---- main.rs ---- */
{
  const f = 'console/apps/agent/src/main.rs';
  let t = rd(f);
  // 既有构造点（business_test）补默认值
  t = t.replace(`Ok(Json(MockHit {`, `Ok(Json(MockHit {`);
  // 定位既有字面量并补字段：以 latency_ms: 结尾的构造
  const oldLit = `        mapping_id: m.id.clone(),
    }))`;
  if (t.includes(oldLit)) {
    t = t.replace(oldLit, `        mapping_id: m.id.clone(),
        at: now_ms(),
        method: method.as_str().to_string(),
        path: path.clone(),
        delay_ms: m.delay_ms,
        human: false,
    }))`);
    log.push('ok   main: 既有构造点补字段');
  } else log.push('MISS main old literal');

  // 我的两处 log_hit 补 body/content_type/latency_ms
  t = t.replace(`        status: m.status,
        delay_ms: m.delay_ms,
        human: false,
    });`, `        status: m.status,
        delay_ms: m.delay_ms,
        human: false,
        body: String::new(),
        content_type: m.content_type.clone(),
        latency_ms: m.delay_ms as u64,
    });`);
  t = t.replace(`                status: 202,
                delay_ms: m.delay_ms,
                human: true,
            });`, `                status: 202,
                delay_ms: m.delay_ms,
                human: true,
                body: String::new(),
                content_type: m.content_type.clone(),
                latency_ms: 0,
            });`);
  log.push('ok   main: log_hit 补字段');
  wr(f, t);
}
console.log(log.join('\n'));

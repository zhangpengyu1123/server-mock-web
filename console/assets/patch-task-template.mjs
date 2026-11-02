#!/usr/bin/env node
/* 1) create_task 用 HumanTemplate 生成人机交互选项
   2) OMC 账号 / 纳管网元 走 /api/business/platform */
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

/* ---- store: create_task 用模板 ---- */
patch('console/crates/core/src/store.rs', [
  [`        let human = |prompt: &str, timeout_s: u32| HumanStep {
            prompt: prompt.into(),
            options: vec![
                HumanOption { label: "确认继续".into(), effect: "continue".into() },
                HumanOption { label: "稍后处理".into(), effect: "hold".into() },
                HumanOption { label: "终止升级".into(), effect: "abort".into() },
            ],
            state: "pending".into(),
            chosen: None,
            timeout_s,
        };`,
   `        // 人机交互选项来自可编辑的状态机模板
        let tpl = i.human.clone();
        let opts: Vec<HumanOption> = if tpl.outcomes.is_empty() {
            vec![
                HumanOption { label: "确认继续".into(), effect: "continue".into() },
                HumanOption { label: "稍后处理".into(), effect: "hold".into() },
                HumanOption { label: "终止升级".into(), effect: "abort".into() },
            ]
        } else {
            tpl.outcomes.iter().map(|o| HumanOption { label: o.option.clone(), effect: o.effect.clone() }).collect()
        };
        let human = |prompt: &str, timeout_s: u32| HumanStep {
            prompt: prompt.into(),
            options: opts.clone(),
            state: "pending".into(),
            chosen: None,
            timeout_s,
        };`, 'create_task template'],
]);
console.log(log.join('\n'));

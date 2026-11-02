#!/usr/bin/env node
/* 用行号区间替换 create_task 里的 human 闭包，让人机选项来自状态机模板 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/crates/core/src/store.rs';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('let human = |prompt: &str, timeout_s: u32| HumanStep {'));
if (start < 0) { console.log('MISS start'); process.exit(1); }
let end = -1;
for (let i = start; i < start + 20; i++) {
  if (lines[i].trim() === '};') { end = i; break; }
}
if (end < 0) { console.log('MISS end'); process.exit(1); }
const indent = lines[start].match(/^\s*/)[0];
const repl = [
  `${indent}// 人机交互选项来自可编辑的状态机模板（HumanTemplate）`,
  `${indent}let tpl = i.human.clone();`,
  `${indent}let opts: Vec<HumanOption> = if tpl.outcomes.is_empty() {`,
  `${indent}    vec![`,
  `${indent}        HumanOption { label: "确认继续".into(), effect: "continue".into() },`,
  `${indent}        HumanOption { label: "稍后处理".into(), effect: "hold".into() },`,
  `${indent}        HumanOption { label: "终止升级".into(), effect: "abort".into() },`,
  `${indent}    ]`,
  `${indent}} else {`,
  `${indent}    tpl.outcomes.iter().map(|o| HumanOption { label: o.option.clone(), effect: o.effect.clone() }).collect()`,
  `${indent}};`,
  `${indent}let human = |prompt: &str, timeout_s: u32| HumanStep {`,
  `${indent}    prompt: prompt.into(),`,
  `${indent}    options: opts.clone(),`,
  `${indent}    state: "pending".into(),`,
  `${indent}    chosen: None,`,
  `${indent}    timeout_s,`,
  `${indent}};`,
];
const out = [...lines.slice(0, start), ...repl, ...lines.slice(end + 1)];
writeFileSync(P, out.join('\n'), 'utf8');
console.log('ok   create_task 用模板生成选项');

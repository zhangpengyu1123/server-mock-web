#!/usr/bin/env node
/* 修复 RuleVariant 插错位置：把 Mapping 的 doc/derive 还原，RuleVariant 单独成块 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/crates/core/src/model.rs';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

const docStart = lines.findIndex((l) => l.includes('一条「本地映射」'));
const mapStart = lines.findIndex((l) => l.trim() === 'pub struct Mapping {');
if (docStart < 0 || mapStart < 0) { console.log('MISS'); process.exit(1); }

const block = `  /// 一条「本地映射」：把某个路径映射成指定的 mock 响应。
  /// 业务面用户可以自己创建（限自己的 owner），管理面可以看见全部。
  #[derive(Clone, Debug, Serialize, Deserialize)]
  pub struct Mapping {`.split('\n');

const variant = `
  /// 一条「条件规则」：when 命中时覆盖状态码 / 延迟 / 响应体
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
`.split('\n');

// 用 variant + block 替换 docStart..mapStart（含）
const out = [...lines.slice(0, docStart), ...variant, ...block, ...lines.slice(mapStart + 1)];
writeFileSync(P, out.join('\n'), 'utf8');
console.log('ok   位置修复（' + docStart + ' → ' + mapStart + '）');

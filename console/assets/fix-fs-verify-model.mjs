#!/usr/bin/env node
/* 在 FsConfig 前插入 VerifyRun 结构，并在 FsConfig 内加 verify_runs 字段 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/crates/core/src/model.rs';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);

// 幂等
if (lines.some((l) => l.includes('pub struct VerifyRun'))) {
  console.log('already present');
} else {
  const i = lines.findIndex((l) => l.includes('pub struct FsConfig {'));
  if (i < 0) { console.log('MISS FsConfig'); process.exit(1); }
  // 找到 derive 行起点（向上找）
  let d = i - 1;
  while (d >= 0 && !lines[d].includes('#[derive(')) d--;
  const ins = [
    '#[derive(Clone, Debug, Serialize, Deserialize)]',
    'pub struct VerifyRun {',
    '    pub step: String,',
    '    /// pass | fail | pending',
    '    pub status: String,',
    '    pub at: Millis,',
    '    #[serde(default)]',
    '    pub note: String,',
    '}',
    '',
  ];
  lines.splice(d < 0 ? i : d, 0, ...ins);
  console.log('ok   VerifyRun 结构');
}

// verify_runs 字段
const j = lines.findIndex((l) => l.includes('pub struct FsConfig {'));
if (j >= 0 && !lines.slice(j, j + 15).some((l) => l.includes('verify_runs'))) {
  let k = j;
  for (; k < lines.length; k++) {
    if (lines[k].trim() === '}') break;
    if (lines[k].includes('pub upgrade_steps')) {
      lines.splice(k + 1, 0, '    #[serde(default)]', '    pub verify_runs: Vec<VerifyRun>,');
      console.log('ok   FsConfig.verify_runs');
      break;
    }
  }
}
writeFileSync(P, lines.join('\n'), 'utf8');

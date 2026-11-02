// 生成内置教学场景（从当前导出的场景派生 3 套）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = JSON.parse(readFileSync('scene-export.json', 'utf8'));
const outDir = 'console/ui/business/scenes';
mkdirSync(outDir, { recursive: true });

const stamp = (o) => ({ ...o, kind: 'rhine-lab-scene', version: 1, exported_at: Date.now() });

/* ① 基线：三网元单站点 */
const s1 = stamp(JSON.parse(JSON.stringify(base)));
s1.platform = { ...s1.platform, site_name: '杭州滨江站', site_role: 'primary' };
writeFileSync(join(outDir, 'baseline.json'), JSON.stringify(s1, null, 2));

/* ② 双站点共部署：LCM/OMC 共部署开启 + 备站点命名 + 第二个组 */
const s2 = stamp(JSON.parse(JSON.stringify(base)));
s2.platform = { ...s2.platform, site_name: '杭州滨江站', site_role: 'primary', co_deploy: true, cpus: 32 };
s2.human = s2.human || {};
s2.groups = (s2.groups || []).slice(0, 2);
s2.elements = (s2.elements || []).map((e, i) => ({
  ...e,
  name: e.name.replace(/HZ/, 'BJ'),
  ...(i === 0 ? { version: '5.3.0', prev: '5.2.1' } : {}),
}));
writeFileSync(join(outDir, 'co-deploy.json'), JSON.stringify(s2, null, 2));

/* ③ 故障演练：注入 500 规则 + 短超时人机 + 失败校验场景 */
const s3 = stamp(JSON.parse(JSON.stringify(base)));
s3.platform = { ...s3.platform, site_name: '演练沙箱', site_role: 'secondary', cpus: 8 };
s3.mappings = (s3.mappings || []).map((m, i) => {
  if (i !== 0) return m;
  return {
    ...m,
    variants: [
      { when: 'req.mode=="fast"', status: 201, delay_ms: 0, body: '{"mode":"fast","ok":true}', note: '快速通道' },
      { when: 'req.mode=="fail"', status: 500, delay_ms: 0, body: '{"error":"INJECTED"}', note: '故障注入' },
      { when: '', status: 200, delay_ms: 400, body: '{"mode":"default"}', note: '慢速兜底' },
    ],
    human: {
      prompt: '演练：确认放行？(15s 内不确认将超时挂起)',
      options: [
        { label: '确认继续', effect: 'continue' },
        { label: '稍后处理', effect: 'hold' },
        { label: '终止', effect: 'abort' },
      ],
      state: 'pending',
      timeout_s: 15,
    },
  };
});
writeFileSync(join(outDir, 'fault-drill.json'), JSON.stringify(s3, null, 2));

/* 索引 */
const index = [
  { file: 'baseline.json', name: '基线：单站点三网元', desc: '标准演示起点，OMC/LCM 均可用' },
  { file: 'co-deploy.json', name: '双站点共部署', desc: 'CPU 32、共部署开启、版本 5.3.0 待升级' },
  { file: 'fault-drill.json', name: '故障演练', desc: '注入 500 规则 + 15s 人机超时' },
];
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));

console.log('生成场景:');
for (const f of ['baseline.json', 'co-deploy.json', 'fault-drill.json', 'index.json']) {
  const p = join(outDir, f);
  console.log('  ' + f + '  ' + (readFileSync(p).length / 1024).toFixed(1) + ' KB');
}

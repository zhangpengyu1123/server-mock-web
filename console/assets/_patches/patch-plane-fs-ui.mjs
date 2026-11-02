#!/usr/bin/env node
/* FS 页面：校验步骤可执行 + 结果展示 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 重写 viewFs */
const s = t.indexOf('  function viewFs() {');
const e = t.indexOf('  /* ---------------------------------------------------------------- 视图：网元详情');
if (s > 0 && e > s) {
  const fn = `  function viewFs() {
    const f = Object.assign({}, S.fs, (S.platform && S.platform.fs) ? {
      cpus: S.platform.fs.cpus,
      sitePrimary: S.platform.fs.site_primary,
      siteSecondary: S.platform.fs.site_secondary,
      platformVersion: S.platform.fs.version,
      verifySteps: S.platform.fs.verify_steps,
      upgrade: S.platform.fs.upgrade_steps,
      verifyRuns: S.platform.fs.verify_runs || [],
    } : {});
    const runs = f.verifyRuns || [];
    const runOf = (step) => runs.find((r) => r.step === step);
    const tone = (st) => st === 'pass' ? 'pl-tag--on' : st === 'fail' ? 'pl-tag--bad' : '';
    const tfmt = (ms) => ms ? new Date(Number(ms)).toTimeString().slice(0, 8) : '';
    const fails = runs.filter((r) => r.status === 'fail').length;
    return head('FS 虚层平台', 'CPU · primary/secondary site · platform version · package verification', 'FILE NO. FS-001') + \`
      <div class="pl-grid pl-grid--3">
        <div class="pl-card">
          <div class="pl-card__t">平台配置</div>
          <dl class="pl-kv">
            <dt>CPU</dt><dd>\${f.cpus} vCPU</dd>
            <dt>主站点</dt><dd>\${esc(f.sitePrimary)}</dd>
            <dt>备站点</dt><dd>\${esc(f.siteSecondary)}</dd>
            <dt>平台版本</dt><dd>v\${esc(f.platformVersion)}</dd>
          </dl>
        </div>
        <div class="pl-card">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="pl-card__t" style="margin:0">软件包校验流程</div>
            <button class="pl-btn pl-btn--sm" id="btnFsVerify">执行校验</button>
          </div>
          <div style="margin-top:10px">
            \${(f.verifySteps || []).map((st, i) => {
              const r = runOf(st);
              return \`<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px dotted var(--line)">
                <span style="width:14px;text-align:center;color:\${r && r.status === 'pass' ? '#a67d48' : r && r.status === 'fail' ? '#7d2f22' : 'var(--ink-3)'}">
                  \${r && r.status === 'pass' ? '✓' : r && r.status === 'fail' ? '✕' : '○'}
                </span>
                <div style="flex:1">
                  <div style="font-size:10.5px">\${i + 1}. \${esc(st)}</div>
                  \${r ? \`<div class="pl-muted" style="font-size:8.5px;margin-top:2px">\${esc(r.note)} · \${tfmt(r.at)}</div>\` : ''}
                </div>
                \${r ? \`<span class="pl-tag \${tone(r.status)}">\${esc(r.status.toUpperCase())}</span>\` : ''}
              </div>\`;
            }).join('')}
          </div>
          \${runs.length ? \`<div class="pl-muted" style="font-size:8.5px;margin-top:8px">
            最近一次：\${runs.length} 步 · 失败 \${fails} 项 \${fails ? '· 已中断' : '· 全部通过'}
          </div>\` : '<div class="pl-muted" style="font-size:8.5px;margin-top:8px">尚未执行校验</div>'}
        </div>
        <div class="pl-card">
          <div class="pl-card__t">平台升级流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            \${(f.upgrade || []).map((st) => \`<li>\${esc(st)}</li>\`).join('')}
          </ol>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFsUpgrade">演练一次</button></div>
        </div>
      </div>\`;
  }

`;
  t = t.slice(0, s) + fn + t.slice(e);
  log.push('ok   viewFs');
} else log.push('MISS viewFs');

/* 事件：执行校验 */
rep(`    // FS 虚层演练`,
`    // FS 虚层：执行包校验
    const fsVerify = $('#btnFsVerify');
    if (fsVerify) fsVerify.addEventListener('click', async () => {
      try {
        S.platform = await api('/api/business/platform/fs/verify', { method: 'POST', headers: headers(), body: '{}' });
      } catch (e) { console.warn(e); }
      render();
    });

    // FS 虚层演练`, 'bind fs verify');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

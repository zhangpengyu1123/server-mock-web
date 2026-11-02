#!/usr/bin/env node
/* plane.js 扩充：OMC / LCM / FS 三个平台页 + 网元升级流程（含人机交互）+ 参数校验 + 人机交互状态机编辑器
   做法：插入视图函数 + 更新 NAV / VIEWS 路由，不动既有视图。 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const hit = t.includes(from);
  if (!hit) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ---------- 1. NAV：平台能力拆成 OMC / LCM / FS ---------- */
rep(`        { id: 'platforms', t: '平台能力', s: 'LCM·OMC·FS' },`,
`        { id: 'omc', t: 'OMC 平台', s: '纳管·账号·升级' },
        { id: 'lcm', t: 'LCM 平台', s: '版本·软件包' },
        { id: 'fs', t: 'FS 虚层', s: '站点·CPU·校验' },`, 'nav platforms → 3');

/* ---------- 2. 状态：补充平台数据 ---------- */
rep(`    topoLevel: 'element',`,
`    topoLevel: 'element',
    omc: {
      elements: ['ne-0001', 'ne-0002'],
      groups: ['g-hz-01'],
      accounts: [
        { id: 'acc-01', name: 'omc-ops', scope: ['ne-0001'], role: '运维' },
        { id: 'acc-02', name: 'omc-view', scope: ['ne-0001', 'ne-0002'], role: '只读' },
      ],
      tasks: [
        { id: 'UPG-0091', site: 'site-hz', elements: ['ne-0001', 'ne-0002'], from: '5.2.0', to: '5.2.1', stage: 'activate', progress: 62, human: 1 },
      ],
    },
    lcm: {
      elements: ['ne-0001', 'ne-0002', 'ne-0003'],
      coDeploy: true,
      packages: [
        { id: 'pkg-001', name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.1', verified: true },
        { id: 'pkg-002', name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.0', verified: true },
        { id: 'pkg-003', name: 'EPC-CORE', kind: '核心网软件包', owner: 'ne-0003', vendor: '中兴', version: '4.8.4', verified: true },
      ],
    },
    fs: {
      cpus: 16, sitePrimary: 'HZ 主站点', siteSecondary: 'NB 备站点',
      platformVersion: '2.4.0',
      verifySteps: ['校验 checksum（sha256）', '校验签名（GPG）', '校验包与平台版本兼容性', '校验主备站点一致性'],
      upgrade: ['挂载安装镜像', '预检查（CPU/内存/存储）', '停业务', '安装', '启动并自检', '主备切换验证'],
    },
    neFlow: [
      { s: '上传软件包', human: false },
      { s: '预检查（参数校验）', human: false },
      { s: '激活', human: true },
      { s: '主备倒换', human: true },
      { s: '完成与回执', human: false },
    ],
    neChecks: [
      { f: 'version', rule: '目标版本 > 当前版本', msg: '不支持降级' },
      { f: 'arch', rule: '必须与网元架构一致', msg: '架构不匹配' },
      { f: 'standby', rule: '主备状态必须为双活', msg: '备侧不可用' },
    ],
    humanStates: [
      { id: 'PENDING', label: '待确认', tone: 'signal' },
      { id: 'RESOLVED', label: '已确认', tone: 'ink' },
      { id: 'EXPIRED', label: '已超时', tone: 'danger' },
      { id: 'SKIPPED', label: '已跳过', tone: 'muted' },
    ],
    humanOutcomes: [
      { opt: '确认继续', effect: '跳到 主备倒换', setField: 'humanResult=ok' },
      { opt: '稍后处理', effect: '挂起任务', setField: 'humanResult=hold' },
      { opt: '终止升级', effect: '任务失败回滚', setField: 'humanResult=abort' },
    ],`, 'state platforms');

/* ---------- 3. 三个平台视图 + 网元升级/校验视图 ---------- */
const views = `
  /* ---------------------------------------------------------------- 视图：OMC */
  function viewOmc() {
    const o = S.omc;
    return head('OMC 平台', 'Managed elements · accounts · integrated upgrade task with site', 'FILE NO. OMC-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">纳管范围</div>
          <dl class="pl-kv">
            <dt>网元</dt><dd>\${o.elements.map((id) => esc((S.elements.find((e) => e.id === id) || {}).name || id)).join(' · ')}</dd>
            <dt>网元组</dt><dd>\${o.groups.map((g) => esc((S.groups.find((x) => x.id === g) || {}).name || g)).join(' · ')}</dd>
            <dt>站点</dt><dd>\${esc(S.site.name)} · \${esc(S.site.role)}</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">账号（按网元范围授权）</div>
          <table class="pl-table">
            <thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>
            <tbody>\${o.accounts.map((a) => \`<tr><td>\${esc(a.name)}</td><td>\${esc(a.role)}</td>
              <td class="pl-muted">\${a.scope.length} 个网元</td></tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnAccAdd">＋ 创建账号</button></div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">一体化升级任务</div>
          \${o.tasks.map((k) => \`<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <b style="font-size:11.5px">\${esc(k.id)}</b>
              <span class="pl-tag \${k.human ? 'pl-tag--on' : ''}">\${esc(k.stage)}</span>
            </div>
            <div class="pl-muted" style="font-size:9px;margin:6px 0">站点 \${esc(S.site.name)} · 网元 \${k.elements.length} 个 · v\${esc(k.from)} → v\${esc(k.to)}</div>
            <div style="height:2px;background:var(--line-2)"><i style="display:block;height:2px;width:\${k.progress}%;background:var(--signal)"></i></div>
            <div class="pl-muted" style="font-size:8.5px;margin-top:6px">进度 \${k.progress}%\${k.human ? ' · 卡在人工确认（1）' : ''}</div>
          </div>\`).join('')}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskHuman">查看人工确认</button>
            <button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskAdd">＋ 创建升级任务</button>
          </div>
        </div>
      </div>\`;
  }

  /* ---------------------------------------------------------------- 视图：LCM */
  function viewLcm() {
    const l = S.lcm;
    return head('LCM 平台', 'Element versions · software packages · co-deploy with OMC', 'FILE NO. LCM-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">管理的网元与当前版本</div>
          <table class="pl-table">
            <thead><tr><th>Element</th><th>Software</th><th>Current</th><th>Prev</th><th></th></tr></thead>
            <tbody>\${S.elements.map((e) => \`<tr>
              <td>\${esc(e.name)}</td><td class="pl-muted">\${esc(e.sw)}</td>
              <td class="num">v\${esc(e.version)}</td>
              <td class="pl-muted num">\${e.prev || '—'}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-for="\${esc(e.id)}">软件包</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end" style="align-items:center">
            <span class="pl-muted" style="font-size:8.5px;margin-right:auto">与 OMC 共部署：\${l.coDeploy ? '<span class="pl-dot pl-dot--on"></span>已开启' : '未开启'}</span>
            <button class="pl-btn pl-btn--sm" id="btnCoDeploy">\${l.coDeploy ? '关闭共部署' : '开启共部署'}</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">软件包仓库</div>
          <table class="pl-table">
            <thead><tr><th>Package</th><th>类型</th><th>所属网元</th><th>厂商</th><th>版本</th></tr></thead>
            <tbody>\${l.packages.map((p) => \`<tr>
              <td>\${esc(p.name)}</td><td class="pl-muted">\${esc(p.kind)}</td>
              <td class="pl-muted">\${esc((S.elements.find((e) => e.id === p.owner) || {}).name || p.owner)}</td>
              <td class="pl-muted">\${esc(p.vendor)}</td><td class="num">v\${esc(p.version)}</td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnPkgAdd">＋ 登记软件包</button></div>
        </div>
      </div>\`;
  }

  /* ---------------------------------------------------------------- 视图：FS */
  function viewFs() {
    const f = S.fs;
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
          <div class="pl-card__t">软件包校验流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            \${f.verifySteps.map((s) => \`<li>\${esc(s)}</li>\`).join('')}
          </ol>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">平台升级流程</div>
          <ol style="margin:0;padding-left:16px;font-size:10px;line-height:1.95">
            \${f.upgrade.map((s) => \`<li>\${esc(s)}</li>\`).join('')}
          </ol>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFsUpgrade">演练一次</button></div>
        </div>
      </div>\`;
  }

  /* ---------------------------------------------------------------- 视图：网元详情（升级流程 + 参数校验 + 人机交互） */
  function viewNeDetail() {
    const e = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
    return head('网元 · ' + e.name, 'Upgrade flow · parameter validation · human-in-the-loop', 'FILE NO. NE-002') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">升级流程步骤（可挂人机交互）</div>
          <table class="pl-table">
            <thead><tr><th>#</th><th>Step</th><th>Human</th><th></th></tr></thead>
            <tbody>\${S.neFlow.map((s, i) => \`<tr>
              <td class="num">\${i + 1}</td><td>\${esc(s.s)}</td>
              <td>\${s.human ? '<span class="pl-tag pl-tag--on">含确认</span>' : '<span class="pl-muted">—</span>'}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-flow-toggle="\${i}">\${s.human ? '移除' : '插入'}人机交互</button></td>
            </tr>\`).join('')}</tbody>
          </table>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">参数校验规则</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Rule</th><th>Fail</th></tr></thead>
            <tbody>\${S.neChecks.map((c) => \`<tr><td>\${esc(c.f)}</td><td class="pl-muted">\${esc(c.rule)}</td>
              <td class="pl-muted">\${esc(c.msg)}</td></tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnCheckAdd">＋ 增加校验</button></div>
          <div class="pl-card__t" style="margin-top:14px">旧版本</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="pl-tag">v5.1.9</span><span class="pl-tag">v5.1.4</span><span class="pl-tag">v5.0.7</span>
          </div>
        </div>
      </div>
      <div class="pl-card" style="margin-top:14px">
        <div class="pl-card__t">人机交互状态机（自定义状态与操作结果）</div>
        <table class="pl-table">
          <thead><tr><th>State</th><th>Label</th><th>Tone</th></tr></thead>
          <tbody>\${S.humanStates.map((s) => \`<tr><td>\${esc(s.id)}</td><td>\${esc(s.label)}</td>
            <td><span class="pl-tag \${s.tone === 'signal' ? 'pl-tag--on' : s.tone === 'danger' ? 'pl-tag--bad' : ''}">\${esc(s.tone)}</span></td></tr>\`).join('')}</tbody>
        </table>
        <div class="pl-card__t" style="margin-top:14px">选项 → 操作结果</div>
        <table class="pl-table">
          <thead><tr><th>Option</th><th>Effect</th><th>Set field</th></tr></thead>
          <tbody>\${S.humanOutcomes.map((o) => \`<tr><td>\${esc(o.opt)}</td><td>\${esc(o.effect)}</td>
            <td class="pl-muted">\${esc(o.setField)}</td></tr>\`).join('')}</tbody>
        </table>
        <div class="pl-row-end">
          <button class="pl-btn pl-btn--sm" id="btnHumanPreview2">预览确认界面</button>
        </div>
      </div>\`;
  }
`;

/* 插到"拓扑渲染"注释之前 */
rep(`  /* ---------------------------------------------------------------- 拓扑渲染 */`, views + `\n  /* ---------------------------------------------------------------- 拓扑渲染 */`, 'insert views');

/* ---------- 4. VIEWS 路由 ---------- */
rep(`    platforms: viewPlatforms,`, `    omc: viewOmc,
    lcm: viewLcm,
    fs: viewFs,
    'ne-detail': viewNeDetail,`, 'routes');

/* ---------- 5. 事件：平台页按钮 ---------- */
rep(`    // 人机交互弹窗`, `    // 平台页
    const accAdd = $('#btnAccAdd');
    if (accAdd) accAdd.addEventListener('click', () => {
      S.omc.accounts.push({ id: 'acc-0' + (S.omc.accounts.length + 1), name: 'omc-user' + (S.omc.accounts.length + 1), scope: ['ne-0001'], role: '只读' });
      render();
    });
    const taskAdd = $('#btnTaskAdd');
    if (taskAdd) taskAdd.addEventListener('click', () => {
      S.omc.tasks.push({ id: 'UPG-00' + (92 + S.omc.tasks.length), site: S.site.id, elements: ['ne-0001'], from: '5.2.1', to: '5.2.2', stage: 'upload', progress: 8, human: 0 });
      render();
    });
    const taskHuman = $('#btnTaskHuman');
    if (taskHuman) taskHuman.addEventListener('click', () => openHuman());
    const co = $('#btnCoDeploy');
    if (co) co.addEventListener('click', () => { S.lcm.coDeploy = !S.lcm.coDeploy; render(); });
    const pkgAdd = $('#btnPkgAdd');
    if (pkgAdd) pkgAdd.addEventListener('click', () => {
      S.lcm.packages.push({ id: 'pkg-00' + (S.lcm.packages.length + 1), name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.2', verified: true });
      render();
    });
    const fsUp = $('#btnFsUpgrade');
    if (fsUp) fsUp.addEventListener('click', () => openHuman({
      prompt: 'FS 虚层升级将停止业务并切换主备站点，请确认可以继续',
      timeout: 45,
      options: [{ l: '确认切换', next: 'install' }, { l: '取消升级', next: 'abort' }],
    }));
    $$('[data-flow-toggle]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.flowToggle;
      S.neFlow[i].human = !S.neFlow[i].human;
      render();
    }));
    const chkAdd = $('#btnCheckAdd');
    if (chkAdd) chkAdd.addEventListener('click', () => {
      S.neChecks.push({ f: 'newField', rule: '必填', msg: '缺失参数' });
      render();
    });
    const hp2 = $('#btnHumanPreview2');
    if (hp2) hp2.addEventListener('click', () => openHuman());

    // 人机交互弹窗`, 'bind platform buttons');

/* ---------- 6. 拓扑节点双击进网元详情 ---------- */
rep(`        else if (S.topoLevel === 'element' || S.topoLevel === 'group') {
          const el = S.elements.find((x) => x.id === id);
          if (el) { S.topoSel = el.id; S.topoLevel = 'component'; }
        }`,
`        else if (S.topoLevel === 'element' || S.topoLevel === 'group') {
          const el = S.elements.find((x) => x.id === id);
          if (el) { S.topoSel = el.id; S.topoLevel = 'component'; }
        }
        // 三连击语义：选中后可用右侧"打开升级流程"
        if (S.topoLevel === 'component' && id && S.elements.find((x) => x.id === S.topoSel)) {
          S.view = 'ne-detail';
        }`, 'dblclick → ne detail');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));

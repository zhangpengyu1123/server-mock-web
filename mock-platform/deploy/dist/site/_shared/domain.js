/* ============================================================================
 * mock-platform / _shared/domain.js
 * 领域数据层 + 状态仓库 + 规则引擎 + 流量模拟器
 * 三版前台共用同一份数据与同一套动作，保证三版看到的是同一个平台、同一批数据。
 * 纯浏览器脚本（IIFE，无模块、无构建、无依赖），file:// 下也能跑。
 * ==========================================================================*/
(function (global) {
  'use strict';

  var MP = global.MP || (global.MP = {});

  /* ---------------------------------------------------------------- 基础工具 */
  var uidN = 1000;
  var uid = function (p) { uidN += 7; return (p || 'id') + '-' + uidN.toString(36); };
  var pad = function (n, l) { return String(n).padStart(l || 2, '0'); };
  var now = function () { return new Date(); };
  var clock = function (d) { d = d || now(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  var stamp = function (d) { d = d || now(); return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + clock(d); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var pick = function (arr, i) { return arr[Math.abs(i == null ? Math.floor(Math.random() * arr.length) : i) % arr.length]; };

  /* ---------------------------------------------------------------- 静态字典 */
  // 平台能力：一个 mock 端口可以挂一种或多种
  var CAPS = [
    { id: 'cap-nemp', code: 'NEMP', name: '网元管理平台', version: 'R7.2', endpoints: 46, hue: 196 },
    { id: 'cap-lcmp', code: 'LCMP', name: '生命周期平台', version: 'R5.8', endpoints: 32, hue: 152 },
    { id: 'cap-vlmp', code: 'VLMP', name: '虚层管理平台', version: 'R3.1', endpoints: 21, hue: 42 },
    { id: 'cap-nems', code: 'NEMS', name: '网元模拟服务', version: 'R9.0', endpoints: 58, hue: 268 },
    { id: 'cap-alarm', code: 'ALMP', name: '告警上报平台', version: 'R2.4', endpoints: 12, hue: 8 },
    { id: 'cap-perf', code: 'PMFP', name: '性能采集平台', version: 'R2.0', endpoints: 16, hue: 320 }
  ];

  // 网元类型 / 架构 / 厂商
  var NE_TYPES = ['gNB（基站）', 'AMF（接入与移动性管理）', 'UPF（用户面功能）', 'SMF（会话管理）', 'MME（移动性管理）', 'OMC（操作维护中心）', 'UPF-Edge（边缘用户面）'];
  var NE_CODES = ['GNB', 'AMF', 'UPF', 'SMF', 'MME', 'OMC', 'UPFE'];
  var ARCHES = ['x86_64 虚拟机', 'ARM64 裸机', '容器化（K8s）', 'ARM64 虚拟机', '异构刀片'];
  var VENDORS = ['华为', '中兴', '烽火', '自研'];
  var SOFT_TYPES = ['整包', '补丁', '热补丁', '配置包'];
  var SITES = [
    { id: 'site-a', name: '杭州主站点', role: '主站点', region: 'ZJ-HZ', cpu: 12 },
    { id: 'site-b', name: '南京副站点', role: '副站点', region: 'JS-NJ', cpu: 8 },
    { id: 'site-c', name: '西安灾备站点', role: '副站点', region: 'SN-XA', cpu: 6 }
  ];
  var FIELD_TYPES = ['字符串', '整数', '浮点', '布尔', '枚举', '对象', '数组', '时间戳', '证书指纹'];

  /* ---------------------------------------------------------------- 种子数据 */
  function seed() {
    var ports = [
      {
        id: 'port-1', ip: '10.18.32.104', port: 8443, protocol: 'HTTPS', tls: 'TLS1.3',
        cert: { cn: 'mock-nemp.10.18.32.104', status: 'issued', days: 365, issuedAt: stamp(), issuer: 'MockCA-Root', fingerprint: '3A:9F:C2:11:7E:8B:D4:05' },
        caps: ['cap-nemp', 'cap-lcmp'], running: true, createdAt: '10-14 09:12', note: '本机主端口 · 网元管理 + 生命周期',
        stats: { req: 12480, ok: 12102, err: 378, rps: 3.2 }
      },
      {
        id: 'port-2', ip: '10.18.32.104', port: 9443, protocol: 'HTTPS', tls: 'TLS1.2',
        cert: { cn: '', status: 'none', days: 0, issuedAt: '', issuer: '', fingerprint: '' },
        caps: ['cap-vlmp'], running: false, createdAt: '10-15 14:40', note: '虚层专用 · 待签发证书',
        stats: { req: 0, ok: 0, err: 0, rps: 0 }
      },
      {
        id: 'port-3', ip: '10.18.32.77', port: 8080, protocol: 'HTTP', tls: '—',
        cert: { cn: '', status: 'none', days: 0, issuedAt: '', issuer: '', fingerprint: '' },
        caps: ['cap-alarm'], running: false, createdAt: '10-15 16:02', note: '第二网卡 · 告警上报',
        stats: { req: 214, ok: 214, err: 0, rps: 0 }
      }
    ];

    var fields = {
      'api-reg': [
        { id: 'f1', key: 'code', type: '整数', source: 'select', value: '0', options: ['0', '200', '404', '500'], rule: { kind: 'fixed' }, required: true, desc: '平台返回码' },
        { id: 'f2', key: 'message', type: '字符串', source: 'manual', value: 'success', rule: { kind: 'fixed' }, required: true, desc: '描述' },
        { id: 'f3', key: 'data.neId', type: '字符串', source: 'manual', value: 'GNB-HZ-0001', rule: { kind: 'increment', start: 1, step: 1, pattern: 'GNB-HZ-{n:04}' }, required: true, desc: '网元编号（自增）' },
        { id: 'f4', key: 'data.registerTime', type: '时间戳', source: 'select', value: 'now', options: ['now', 'fixed', '+1h'], rule: { kind: 'fixed' }, required: false, desc: '注册时间' },
        { id: 'f5', key: 'data.token', type: '字符串', source: 'manual', value: 'tk_9f2c', rule: { kind: 'once', times: 1, fallback: 'EXPIRED' }, required: false, desc: '一次性令牌' },
        { id: 'f6', key: 'data.site', type: '枚举', source: 'select', value: '杭州主站点', options: ['杭州主站点', '南京副站点', '西安灾备站点'], rule: { kind: 'conditional', when: { key: 'data.neId', op: '包含', value: 'GNB' }, then: '杭州主站点', else: '南京副站点' }, required: false, desc: '按网元类型分派站点' }
      ]
    };
    function api(id, capId, method, path, name, desc, delayMs, status, hits) {
      return { id: id, capId: capId, method: method, path: path, name: name, desc: desc, delayMs: delayMs, status: status, hits: hits || 0, lastAt: '', match: 'path+method', fields: (fields['api-reg'] || []).map(function (f) { return JSON.parse(JSON.stringify(f)); }), interactions: [], enabled: true };
    }

    var apis = [
      api('api-1', 'cap-nemp', 'POST', '/nemp/v1/ne/register', '网元注册', '对端网元上电后注册到平台', 120, 200, 4821),
      api('api-2', 'cap-nemp', 'GET', '/nemp/v1/ne/{neId}/state', '查询网元状态', '返回网元运行态与心跳', 60, 200, 20140),
      api('api-3', 'cap-nemp', 'POST', '/nemp/v1/ne/{neId}/upgrade', '触发升级', '下发升级任务给网元', 800, 202, 136),
      api('api-4', 'cap-lcmp', 'GET', '/lcmp/v1/package/list', '软件包列表', '按网元/厂商/版本过滤', 90, 200, 902),
      api('api-5', 'cap-vlmp', 'POST', '/vlmp/v1/stack/create', '创建虚层', '创建虚层并分配 CPU', 1500, 201, 24),
      api('api-6', 'cap-alarm', 'POST', '/alarm/v1/report', '告警上报', '接收网元告警', 40, 200, 3312)
    ];
    apis[2].fields[0].value = '202';
    apis[2].interactions = [{ id: 'ix-1', kind: 'human-confirm', label: '升级前人工确认', timeoutS: 300, owner: '值班工程师' }];
    apis[4].fields = [
      { id: 'g1', key: 'code', type: '整数', source: 'select', value: '201', options: ['200', '201', '409'], rule: { kind: 'fixed' }, required: true, desc: '返回码' },
      { id: 'g2', key: 'data.stackId', type: '字符串', source: 'manual', value: 'VLMP-STK-0007', rule: { kind: 'increment', start: 7, step: 1, pattern: 'VLMP-STK-{n:04}' }, required: true, desc: '虚层编号（自增）' },
      { id: 'g3', key: 'data.cpu', type: '整数', source: 'manual', value: '8', rule: { kind: 'conditional', when: { key: 'data.stackId', op: '末尾为偶数' }, then: '8', else: '12' }, required: true, desc: '按编号奇偶分配 CPU' }
    ];

    var logs = [];
    var seedLogs = [
      ['POST', '/nemp/v1/ne/register', 200, 118, 'GNB-HZ-0001', '匹配规则', null],
      ['GET', '/nemp/v1/ne/GNB-HZ-0001/state', 200, 61, 'GNB-HZ-0001', '匹配规则', null],
      ['POST', '/alarm/v1/report', 200, 44, 'UPF-NJ-0003', '匹配规则', null],
      ['POST', '/nemp/v1/ne/GNB-HZ-0002/upgrade', 202, 812, 'GNB-HZ-0002', '等待人机交互', 'human-confirm'],
      ['GET', '/lcmp/v1/package/list', 200, 88, '—', '匹配规则', null],
      ['POST', '/nemp/v1/ne/register', 500, 121, 'AMF-XA-0009', '定制响应命中', null],
      ['POST', '/vlmp/v1/stack/create', 201, 1462, '—', '匹配规则', null],
      ['GET', '/nemp/v1/ne/GNB-HZ-0001/state', 404, 57, 'GNB-HZ-0001', '路径未匹配，走兜底', null]
    ];
    seedLogs.forEach(function (r, i) {
      var t = new Date(Date.now() - (seedLogs.length - i) * 47000);
      logs.push({
        id: 'log-' + (i + 1), ts: t.getTime(), clock: clock(t),
        portId: i % 3 === 0 ? 'port-1' : (i % 3 === 1 ? 'port-1' : 'port-3'),
        method: r[0], path: r[1], status: r[2], latencyMs: r[3], ne: r[4], verdict: r[5],
        interaction: r[6] ? { kind: r[6], status: 'pending' } : null,
        req: { headers: { 'X-NE-Id': r[4], 'Content-Type': 'application/json' }, body: { neId: r[4], op: r[0] === 'GET' ? 'query' : 'submit' } },
        res: { code: r[2] === 200 ? 0 : r[2], message: r[2] === 200 ? 'success' : (r[2] === 202 ? 'task accepted' : 'mock override'), data: { neId: r[4], latency: r[3] + 'ms' } }
      });
    });

    function ne(i, name, code, neId, type, arch, vendor, version, group, status) {
      return {
        id: 'ne-' + (i + 1), name: name, code: code, neId: neId, type: type, arch: arch, vendor: vendor,
        version: version, softName: code + '_V' + version.replace(/\./g, ''), group: group,
        status: status, model: 'MOCK-' + code,
        params: { 心跳周期: '30s', 最大承载用户: '12000', 传输加密: 'TLS1.3', 日志级别: 'INFO' },
        oldVersions: [version, '6.8.1', '6.7.4'],
        validations: [
          { id: 'v1', field: 'neId', rule: '^' + code + '-[A-Z]{2}-\\d{4}$', level: '错误', message: '网元编号格式 ' + code + '-区号-四位序号', enabled: true },
          { id: 'v2', field: 'version', rule: '^[6-9]\\.', level: '警告', message: '低于 6.0 的大版本需先过预检', enabled: true }
        ],
        upgrade: [
          { id: 's1', name: '升级前健康检查', kind: 'auto', durationS: 20 },
          { id: 's2', name: '软件包校验', kind: 'auto', durationS: 35 },
          { id: 's3', name: '人工放行（值班确认）', kind: 'human', durationS: 0, interaction: { kind: 'human-confirm', owner: '值班工程师', timeoutS: 600 } },
          { id: 's4', name: '主用/备用倒换', kind: 'manual', durationS: 120 },
          { id: 's5', name: '业务验证', kind: 'auto', durationS: 45 }
        ]
      };
    }
    var nes = [
      ne(0, '杭州·基站 01', 'GNB', 'GNB-HZ-0001', 'gNB（基站）', 'ARM64 裸机', '华为', '7.2.0', 'grp-hz', '在线'),
      ne(1, '杭州·基站 02', 'GNB', 'GNB-HZ-0002', 'gNB（基站）', 'ARM64 裸机', '华为', '7.1.3', 'grp-hz', '升级中'),
      ne(2, '南京·核心网 AMF', 'AMF', 'AMF-NJ-0003', 'AMF（接入与移动性管理）', 'x86_64 虚拟机', '中兴', '9.0.2', 'grp-nj', '在线'),
      ne(3, '南京·用户面 UPF', 'UPF', 'UPF-NJ-0004', 'UPF（用户面功能）', '容器化（K8s）', '烽火', '5.4.1', 'grp-nj', '离线'),
      ne(4, '西安·灾备 OMC', 'OMC', 'OMC-XA-0009', 'OMC（操作维护中心）', '异构刀片', '自研', '3.3.0', '', '在线')
    ];

    var groups = [
      { id: 'grp-hz', name: '杭州基站组', desc: '同架构同版本批量升级', members: ['ne-1', 'ne-2'], strategy: '串行 · 每台间隔 60s' },
      { id: 'grp-nj', name: '南京核心网组', desc: '主备倒换联动', members: ['ne-3', 'ne-4'], strategy: '并行 · 保留备用',  }
    ];

    return {
      host: { hostname: 'MOCK-WIN-01', ip: '10.18.32.104', alt: '10.18.32.77', os: 'Windows 11 23H2', agent: 'MockAgent 4.2.1', uptimeS: 432000 },
      caps: CAPS, neTypes: NE_TYPES, neCodes: NE_CODES, arches: ARCHES, vendors: VENDORS,
      softTypes: SOFT_TYPES, fieldTypes: FIELD_TYPES, sites: SITES,
      ports: ports, apis: apis, logs: logs, nes: nes, groups: groups,
      accounts: [
        { id: 'ac-1', name: 'zhangwei', role: '升级操作员', scope: ['grp-hz'], nes: ['ne-1', 'ne-2'], createdAt: '09-28 10:20', status: '启用' },
        { id: 'ac-2', name: 'ops_nj', role: '只读审计', scope: ['grp-nj'], nes: ['ne-3', 'ne-4'], createdAt: '10-06 15:44', status: '启用' }
      ],
      packages: [
        { id: 'pkg-1', name: 'GNB_R7.2.0_full.pkg', type: '整包', ne: 'ne-1', vendor: '华为', version: '7.2.0', sizeMB: 1840, md5: 'c41f9a...7d20', validated: true, uploadedAt: '10-12 11:03' },
        { id: 'pkg-2', name: 'AMF_R9.0.3_patch.pkg', type: '补丁', ne: 'ne-3', vendor: '中兴', version: '9.0.3', sizeMB: 260, md5: '88be31...0ac9', validated: false, uploadedAt: '10-15 09:31' },
        { id: 'pkg-3', name: 'UPF_R5.4.2_hot.pkg', type: '热补丁', ne: 'ne-4', vendor: '烽火', version: '5.4.2', sizeMB: 42, md5: '1d77c0...5e11', validated: true, uploadedAt: '10-14 17:55' },
        { id: 'pkg-4', name: 'VLMP_R3.1.0_stack.pkg', type: '整包', ne: '', vendor: '自研', version: '3.1.0', sizeMB: 905, md5: '90ab44...2f7c', validated: false, uploadedAt: '10-15 16:20' }
      ],
      tasks: [
        {
          id: 'task-1', name: '杭州基站组 一体化升级', type: '一体化升级', site: '杭州主站点', neIds: ['ne-1', 'ne-2'],
          status: 'waiting-human', progress: 46, createdAt: '10-15 20:10', owner: 'zhangwei',
          steps: [
            { id: 't1', name: '任务下发', state: 'done', at: '20:10:02' },
            { id: 't2', name: 'NE-1 健康检查', state: 'done', at: '20:10:24' },
            { id: 't3', name: 'NE-1 包校验', state: 'done', at: '20:11:02' },
            { id: 't4', name: '人工放行', state: 'active', at: '20:11:40' },
            { id: 't5', name: 'NE-1 倒换升级', state: 'todo', at: '' },
            { id: 't6', name: 'NE-2 串行升级', state: 'todo', at: '' }
          ]
        },
        { id: 'task-2', name: '虚层扩容 · 南京', type: '虚层创建', site: '南京副站点', neIds: [], status: 'done', progress: 100, createdAt: '10-13 14:02', owner: 'ops_nj', steps: [{ id: 'u1', name: '创建虚层', state: 'done', at: '14:02:11' }, { id: 'u2', name: '软件包校验', state: 'done', at: '14:04:38' }] }
      ],
      vlp: {
        version: 'VLMP R3.1.0', cpu: 8, cpuRange: [4, 64],
        primarySite: 'site-a', secondarySite: 'site-b', volume: 'stack-vol-07',
        upgradeFlow: [
          { id: 'vf1', name: '平台预检（CPU / 存储 / 网络）', kind: 'auto', state: 'done' },
          { id: 'vf2', name: '软件包完整性校验', kind: 'auto', state: 'active' },
          { id: 'vf3', name: '主副站点倒换演练', kind: 'manual', state: 'todo' },
          { id: 'vf4', name: '版本切换与回滚点确认', kind: 'human', state: 'todo' }
        ],
        checks: [
          { id: 'vc1', name: 'MD5 校验', target: 'VLMP_R3.1.0_stack.pkg', state: 'pass', detail: '90ab44…2f7c 一致' },
          { id: 'vc2', name: '签名校验', target: 'VLMP_R3.1.0_stack.pkg', state: 'pass', detail: '厂商签名有效（自研）' },
          { id: 'vc3', name: '依赖校验', target: 'stack-vol-07', state: 'warn', detail: '南京副站点可分配 CPU 仅剩 8 核' },
          { id: 'vc4', name: '回滚点校验', target: 'VLMP R3.0.6', state: 'idle', detail: '未执行' }
        ]
      },
      deploy: {
        omp: { version: 'NEMP R7.2', neCount: 5, accountCount: 2, coDeploy: true, host: '10.18.32.104:8443' },
        lcmp: { version: 'LCMP R5.8', packageCount: 4, coDeploy: true, host: '10.18.32.104:8443' }
      }
    };
  }

  /* ------------------------------------------------------------------ 仓库 */
  var state = seed();
  var listeners = [];
  state.ui = { screen: 'mock', theme: 'dark', selectedPort: 'port-1', selectedApi: 'api-1', logFilter: 'all', logQuery: '', running: true };

  function emit(evt) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state, evt || {}); } catch (e) { /* 单个订阅者出错不影响其它 */ }
    }
  }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  /* --------------------------------------------------------------- 规则引擎 */
  // 规则种类：fixed（固定）· increment（自增）· once（单次生效）· conditional（条件）· random（随机）
  var RULE_META = {
    fixed: { name: '固定', tone: 'neutral', hint: '每次都返回同一个值' },
    increment: { name: '自增', tone: 'accent', hint: '每次命中按步长累加' },
    once: { name: '单次生效', tone: 'warn', hint: '首次返回设定值，之后走兜底值' },
    conditional: { name: '条件', tone: 'info', hint: '按上游字段取值分派' },
    random: { name: '随机', tone: 'danger', hint: '从候选值里随机取' }
  };

  function expand(pattern, n) {
    return String(pattern || '').replace(/\{n(?::(\d+))?\}/g, function (_, w) { return pad(n, w ? +w : 0); });
  }

  // 上下文 ctx：{ response:{ key: value }, hit: n }
  function resolveField(f, ctx) {
    var r = f.rule || { kind: 'fixed' };
    ctx = ctx || { response: {}, hit: 1 };
    if (r.kind === 'increment') {
      var n = (r.start || 1) + (r.step || 1) * (ctx.hit - 1);
      return { value: r.pattern ? expand(r.pattern, n) : String(n), note: '第 ' + ctx.hit + ' 次命中' };
    }
    if (r.kind === 'once') {
      var left = r.times || 1;
      if (ctx.hit <= left) return { value: f.value, note: '单次生效（第 ' + ctx.hit + '/' + left + ' 次）' };
      return { value: r.fallback == null ? '' : r.fallback, note: '已失效，返回兜底值' };
    }
    if (r.kind === 'conditional') {
      var w = r.when || {};
      var cur = ctx.response[w.key];
      var hit = false;
      if (w.op === '包含') hit = String(cur || '').indexOf(String(w.value)) >= 0;
      else if (w.op === '等于') hit = String(cur) === String(w.value);
      else if (w.op === '末尾为偶数') hit = /[02468]$/.test(String(ctx.response['__lastNumeric'] || f.value));
      else if (w.op === '非空') hit = cur != null && cur !== '';
      else hit = true;
      return { value: hit ? r.then : r.else, note: '条件命中（' + (w.key || '—') + ' ' + (w.op || '') + '）' };
    }
    if (r.kind === 'random') {
      var opts = (f.options && f.options.length ? f.options : ['a', 'b', 'c']);
      return { value: pick(opts), note: '随机候选' };
    }
    return { value: f.value, note: '固定值' };
  }

  // 组装一次完整的 mock 响应
  function buildResponse(api) {
    var hit = (api.hits || 0) + 1;
    api.hits = hit;
    var out = {}, notes = [], ctx = { response: {}, hit: hit };
    (api.fields || []).forEach(function (f) {
      var r = resolveField(f, ctx);
      var numeric = String(r.value).replace(/[^\d]/g, '');
      if (numeric) ctx.response['__lastNumeric'] = numeric;
      setPath(out, f.key, r.value);
      ctx.response[f.key] = r.value;
      notes.push({ key: f.key, value: r.value, rule: (f.rule || {}).kind || 'fixed', note: r.note });
    });
    return { body: out, notes: notes, status: api.status, delayMs: api.delayMs, hit: hit };
  }

  function setPath(obj, path, val) {
    var parts = String(path).split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }
  function getPath(obj, path) {
    return String(path).split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }

  /* --------------------------------------------------------------- 动作层 */
  var actions = {
    setScreen: function (screen) { state.ui.screen = screen; emit({ type: 'screen', screen: screen }); },

    registerPort: function (input) {
      var p = {
        id: uid('port'), ip: input.ip, port: +input.port, protocol: input.protocol || 'HTTPS', tls: input.tls || 'TLS1.3',
        cert: { cn: '', status: 'none', days: 0, issuedAt: '', issuer: '', fingerprint: '' },
        caps: input.caps ? input.caps.slice() : [], running: false,
        createdAt: stamp(), note: input.note || '手动注册', stats: { req: 0, ok: 0, err: 0, rps: 0 }
      };
      state.ports.push(p);
      state.ui.selectedPort = p.id;
      actions.log({ method: 'LOCAL', path: '/mock/port/register', status: 201, latencyMs: 3, ne: '—', verdict: '注册 mock 端口 ' + p.ip + ':' + p.port, portId: p.id });
      emit({ type: 'ports', action: 'register', id: p.id });
      return p;
    },

    removePort: function (id) {
      state.ports = state.ports.filter(function (p) { return p.id !== id; });
      if (state.ui.selectedPort === id) state.ui.selectedPort = (state.ports[0] || {}).id;
      emit({ type: 'ports', action: 'remove' });
    },

    generateCert: function (id, opts) {
      var p = byId(state.ports, id); if (!p) return null;
      opts = opts || {};
      var cn = opts.cn || ('mock-' + p.port + '.' + p.ip);
      p.cert = {
        cn: cn, status: 'issued', days: opts.days || 365, issuedAt: stamp(),
        issuer: opts.issuer || 'MockCA-Root', fingerprint: (Math.random().toString(16).slice(2, 10).toUpperCase() + ':' + Math.random().toString(16).slice(2, 10).toUpperCase())
      };
      actions.log({ method: 'LOCAL', path: '/mock/cert/issue', status: 200, latencyMs: 46, ne: '—', verdict: '签发证书 ' + cn, portId: id });
      emit({ type: 'cert', id: id });
      return p.cert;
    },

    attachCap: function (portId, capId) {
      var p = byId(state.ports, portId); if (!p || p.caps.indexOf(capId) >= 0) return;
      p.caps.push(capId);
      actions.log({ method: 'LOCAL', path: '/mock/cap/attach', status: 200, latencyMs: 5, ne: '—', verdict: '挂载能力 ' + capName(capId), portId: portId });
      emit({ type: 'caps', portId: portId });
    },
    detachCap: function (portId, capId) {
      var p = byId(state.ports, portId); if (!p) return;
      p.caps = p.caps.filter(function (c) { return c !== capId; });
      actions.log({ method: 'LOCAL', path: '/mock/cap/detach', status: 200, latencyMs: 5, ne: '—', verdict: '卸载能力 ' + capName(capId), portId: portId });
      emit({ type: 'caps', portId: portId });
    },

    startService: function (id) {
      var p = byId(state.ports, id); if (!p) return;
      p.running = true; p.stats.rps = +(1 + Math.random() * 4).toFixed(1);
      actions.log({ method: 'LOCAL', path: '/mock/service/start', status: 200, latencyMs: 12, ne: '—', verdict: '启动 mock 服务 :' + p.port, portId: id });
      emit({ type: 'service', id: id, running: true });
    },
    stopService: function (id) {
      var p = byId(state.ports, id); if (!p) return;
      p.running = false; p.stats.rps = 0;
      actions.log({ method: 'LOCAL', path: '/mock/service/stop', status: 200, latencyMs: 9, ne: '—', verdict: '停止 mock 服务 :' + p.port, portId: id });
      emit({ type: 'service', id: id, running: false });
    },

    selectPort: function (id) { state.ui.selectedPort = id; emit({ type: 'select-port', id: id }); },
    selectApi: function (id) { state.ui.selectedApi = id; emit({ type: 'select-api', id: id }); },
    setLogFilter: function (f) { state.ui.logFilter = f; emit({ type: 'log-filter', filter: f }); },
    setLogQuery: function (q) { state.ui.logQuery = q; emit({ type: 'log-query', query: q }); },

    updateApi: function (id, patch) {
      var a = byId(state.apis, id); if (!a) return;
      Object.keys(patch).forEach(function (k) { a[k] = patch[k]; });
      emit({ type: 'api', id: id, patch: patch });
    },

    addField: function (apiId) {
      var a = byId(state.apis, apiId); if (!a) return null;
      var f = { id: uid('f'), key: 'data.newField', type: '字符串', source: 'manual', value: '', options: [], rule: { kind: 'fixed' }, required: false, desc: '新增字段' };
      a.fields.push(f); emit({ type: 'fields', apiId: apiId }); return f;
    },
    updateField: function (apiId, fieldId, patch) {
      var a = byId(state.apis, apiId); if (!a) return;
      var f = a.fields.filter(function (x) { return x.id === fieldId; })[0]; if (!f) return;
      Object.keys(patch).forEach(function (k) {
        if (k === 'rule') { f.rule = Object.assign({}, f.rule, patch[k]); } else { f[k] = patch[k]; }
      });
      emit({ type: 'fields', apiId: apiId, fieldId: fieldId });
    },
    removeField: function (apiId, fieldId) {
      var a = byId(state.apis, apiId); if (!a) return;
      a.fields = a.fields.filter(function (x) { return x.id !== fieldId; });
      emit({ type: 'fields', apiId: apiId });
    },
    addInteraction: function (apiId, kind) {
      var a = byId(state.apis, apiId); if (!a) return;
      a.interactions.push({ id: uid('ix'), kind: kind || 'human-confirm', label: '人工确认', timeoutS: 300, owner: '值班工程师' });
      emit({ type: 'interactions', apiId: apiId });
    },
    removeInteraction: function (apiId, ixId) {
      var a = byId(state.apis, apiId); if (!a) return;
      a.interactions = a.interactions.filter(function (x) { return x.id !== ixId; });
      emit({ type: 'interactions', apiId: apiId });
    },

    // 手动触发一次请求（"手动控制 mock api"）
    triggerApi: function (apiId) {
      var a = byId(state.apis, apiId); if (!a) return null;
      var res = buildResponse(a);
      a.lastAt = clock();
      var ix = (a.interactions && a.interactions[0]) || null;
      var log = {
        id: uid('log'), ts: Date.now(), clock: clock(),
        portId: state.ui.selectedPort, method: a.method, path: a.path,
        status: ix ? 202 : res.status, latencyMs: res.delayMs, ne: guessNe(a.path),
        verdict: ix ? '已插入人机交互：' + ix.label : '手动触发 · 命中定制响应',
        interaction: ix ? { kind: ix.kind, status: 'pending', label: ix.label, owner: ix.owner, timeoutS: ix.timeoutS } : null,
        req: { headers: { 'X-Mock-Platform': 'manual', 'Content-Type': 'application/json' }, body: { trigger: 'manual', api: a.path } },
        res: { status: res.status, body: res.body, notes: res.notes, delayMs: res.delayMs, hit: res.hit }
      };
      state.logs.unshift(log);
      if (state.logs.length > 400) state.logs.pop();
      var p = byId(state.ports, state.ui.selectedPort);
      if (p) { p.stats.req++; p.stats.ok++; }
      emit({ type: 'log', log: log });
      return log;
    },

    resolveInteraction: function (logId, decision) {
      var l = byId(state.logs, logId); if (!l || !l.interaction) return;
      l.interaction.status = decision;
      l.verdict = decision === 'approve' ? '人工放行 · 继续执行' : '人工拒绝 · 已终止';
      l.status = decision === 'approve' ? 200 : 403;
      emit({ type: 'interaction-resolved', logId: logId, decision: decision });
    },

    log: function (partial) {
      var l = {
        id: uid('log'), ts: Date.now(), clock: clock(), portId: partial.portId || state.ui.selectedPort,
        method: partial.method || 'LOCAL', path: partial.path, status: partial.status || 200,
        latencyMs: partial.latencyMs || 1, ne: partial.ne || '—', verdict: partial.verdict || '',
        interaction: null, req: partial.req || null, res: partial.res || null
      };
      state.logs.unshift(l);
      if (state.logs.length > 400) state.logs.pop();
      emit({ type: 'log', log: l });
      return l;
    },

    /* ----------------------------------------------------------- 网元管理 */
    addNE: function (input) {
      var ne = {
        id: uid('ne'), name: input.name, code: input.code, neId: input.neId || ((input.code || 'NE') + '-HZ-' + pad(state.nes.length + 1, 4)),
        type: input.type, arch: input.arch,
        vendor: input.vendor, version: input.version, softName: (input.code || 'NE') + '_V' + String(input.version).replace(/\./g, ''),
        group: input.group || '', status: '未注册', model: 'MOCK-' + input.code,
        params: input.params || { 心跳周期: '30s', 日志级别: 'INFO' },
        oldVersions: [input.version], validations: [], upgrade: [
          { id: uid('s'), name: '升级前健康检查', kind: 'auto', durationS: 20 },
          { id: uid('s'), name: '软件包校验', kind: 'auto', durationS: 35 }
        ]
      };
      state.nes.push(ne);
      emit({ type: 'ne', action: 'add', id: ne.id });
      return ne;
    },

    updateNE: function (id, patch) {
      var n = byId(state.nes, id); if (!n) return;
      Object.keys(patch).forEach(function (k) { n[k] = patch[k]; });
      emit({ type: 'ne', action: 'update', id: id });
    },

    copyNE: function (id) {
      var n = byId(state.nes, id); if (!n) return null;
      var c = JSON.parse(JSON.stringify(n));
      c.id = uid('ne');
      var prefix = String(n.neId || n.code + '-HZ-').replace(/\d{4}$/, '');
      var max = state.nes.reduce(function (m, x) {
        var s = String(x.neId || '');
        return s.indexOf(prefix) === 0 ? Math.max(m, parseInt(s.slice(prefix.length), 10) || 0) : m;
      }, 0);
      c.neId = prefix + pad(max + 1, 4);
      c.name = n.name + ' · 副本';
      c.code = n.code;
      c.status = '未注册';
      state.nes.push(c);
      emit({ type: 'ne', action: 'copy', id: c.id });
      return c;
    },

    addGroup: function (input) {
      var g = { id: uid('grp'), name: input.name, desc: input.desc || '', members: [], strategy: input.strategy || '串行' };
      state.groups.push(g); emit({ type: 'group', action: 'add', id: g.id }); return g;
    },
    assignGroup: function (neId, groupId) {
      var n = byId(state.nes, neId); if (!n) return;
      state.groups.forEach(function (g) { g.members = g.members.filter(function (m) { return m !== neId; }); });
      n.group = groupId;
      if (groupId) { var g = byId(state.groups, groupId); if (g) g.members.push(neId); }
      emit({ type: 'group', action: 'assign' });
    },

    addUpgradeStep: function (neId, step) {
      var n = byId(state.nes, neId); if (!n) return;
      n.upgrade.push({ id: uid('s'), name: step.name || '新步骤', kind: step.kind || 'auto', durationS: step.durationS == null ? 30 : step.durationS, interaction: step.kind === 'human' ? { kind: 'human-confirm', owner: step.owner || '值班工程师', timeoutS: 300 } : null });
      emit({ type: 'upgrade', neId: neId });
    },
    moveStep: function (neId, stepId, dir) {
      var n = byId(state.nes, neId); if (!n) return;
      var i = n.upgrade.map(function (s) { return s.id; }).indexOf(stepId);
      var j = i + dir;
      if (i < 0 || j < 0 || j >= n.upgrade.length) return;
      var t = n.upgrade[i]; n.upgrade[i] = n.upgrade[j]; n.upgrade[j] = t;
      emit({ type: 'upgrade', neId: neId });
    },
    removeStep: function (neId, stepId) {
      var n = byId(state.nes, neId); if (!n) return;
      n.upgrade = n.upgrade.filter(function (s) { return s.id !== stepId; });
      emit({ type: 'upgrade', neId: neId });
    },
    addValidation: function (neId, v) {
      var n = byId(state.nes, neId); if (!n) return;
      n.validations.push({ id: uid('v'), field: v.field || 'neId', rule: v.rule || '', level: v.level || '错误', message: v.message || '', enabled: true });
      emit({ type: 'validation', neId: neId });
    },
    runValidation: function (neId) {
      var n = byId(state.nes, neId); if (!n) return [];
      var results = (n.validations || []).filter(function (v) { return v.enabled; }).map(function (v) {
        var ok = true;
        try { ok = new RegExp(v.rule).test(String(n[v.field] == null ? '' : n[v.field])); } catch (e) { ok = false; }
        return { id: v.id, field: v.field, level: v.level, pass: ok, message: ok ? '校验通过' : (v.message || '不符合规则') };
      });
      emit({ type: 'validation-run', neId: neId, results: results });
      return results;
    },

    /* ------------------------------------------------- 网元管理平台 / 账号 */
    createAccount: function (input) {
      var a = { id: uid('ac'), name: input.name, role: input.role || '升级操作员', scope: input.scope || [], nes: input.nes || [], createdAt: stamp(), status: '启用' };
      state.accounts.push(a); emit({ type: 'account', action: 'add', id: a.id }); return a;
    },
    toggleAccount: function (id) {
      var a = byId(state.accounts, id); if (!a) return;
      a.status = a.status === '启用' ? '停用' : '启用'; emit({ type: 'account', action: 'toggle', id: id });
    },

    createTask: function (input) {
      var t = {
        id: uid('task'), name: input.name, type: '一体化升级', site: input.site, neIds: input.neIds || [],
        status: 'running', progress: 0, createdAt: stamp(), owner: input.owner || 'zhangwei',
        steps: [{ id: uid('t'), name: '任务下发', state: 'active', at: clock() }].concat((input.neIds || []).map(function (id, i) {
          var n = byId(state.nes, id);
          return { id: uid('t'), name: (n ? n.name : id) + ' 升级', state: 'todo', at: '' };
        })).concat([{ id: uid('t'), name: '站点联动校验', state: 'todo', at: '' }])
      };
      state.tasks.unshift(t); emit({ type: 'task', action: 'add', id: t.id }); return t;
    },
    advanceTask: function (id) {
      var t = byId(state.tasks, id); if (!t) return;
      var i = t.steps.map(function (s) { return s.state; }).indexOf('active');
      if (i < 0) i = t.steps.map(function (s) { return s.state; }).indexOf('todo');
      if (i < 0) { t.status = 'done'; t.progress = 100; emit({ type: 'task', action: 'advance', id: id }); return; }
      if (t.steps[i].state === 'todo') { t.steps[i].state = 'active'; t.steps[i].at = clock(); }
      else { t.steps[i].state = 'done'; if (t.steps[i + 1]) { t.steps[i + 1].state = 'active'; t.steps[i + 1].at = clock(); } }
      var done = t.steps.filter(function (s) { return s.state === 'done'; }).length;
      t.progress = Math.round(done / t.steps.length * 100);
      if (/人工放行|人工/.test(t.steps[i].name) && t.steps[i].state === 'active') t.status = 'waiting-human';
      else if (t.progress === 100) t.status = 'done';
      else t.status = 'running';
      emit({ type: 'task', action: 'advance', id: id });
    },
    toggleCoDeploy: function (which) {
      state.deploy[which].coDeploy = !state.deploy[which].coDeploy;
      emit({ type: 'deploy', which: which });
    },

    /* ------------------------------------------------------- 生命周期平台 */
    addPackage: function (input) {
      var p = { id: uid('pkg'), name: input.name, type: input.type, ne: input.ne || '', vendor: input.vendor, version: input.version, sizeMB: input.sizeMB || 0, md5: Math.random().toString(16).slice(2, 8) + '...' + Math.random().toString(16).slice(2, 6), validated: false, uploadedAt: stamp() };
      state.packages.push(p); emit({ type: 'package', action: 'add', id: p.id }); return p;
    },
    validatePackage: function (id) {
      var p = byId(state.packages, id); if (!p) return;
      p.validated = true; emit({ type: 'package', action: 'validate', id: id });
    },
    removePackage: function (id) {
      state.packages = state.packages.filter(function (p) { return p.id !== id; });
      emit({ type: 'package', action: 'remove' });
    },

    /* ------------------------------------------------------- 虚层管理平台 */
    setCPU: function (n) {
      state.vlp.cpu = clamp(n, state.vlp.cpuRange[0], state.vlp.cpuRange[1]);
      emit({ type: 'vlp', action: 'cpu' });
    },
    setSite: function (role, siteId) {
      if (role === 'primary') state.vlp.primarySite = siteId; else state.vlp.secondarySite = siteId;
      emit({ type: 'vlp', action: 'site' });
    },
    setVlpVersion: function (v) { state.vlp.version = v; emit({ type: 'vlp', action: 'version' }); },
    runVlpCheck: function (id) {
      var c = byId(state.vlp.checks, id); if (!c) return;
      c.state = 'pass'; c.detail = '刚刚校验通过 · ' + clock();
      emit({ type: 'vlp', action: 'check', id: id });
    },
    advanceVlpFlow: function () {
      var f = state.vlp.upgradeFlow;
      var i = f.map(function (s) { return s.state; }).indexOf('active');
      if (i < 0) i = f.map(function (s) { return s.state; }).indexOf('todo');
      if (i < 0) return;
      if (f[i].state === 'todo') f[i].state = 'active';
      else { f[i].state = 'done'; if (f[i + 1]) f[i + 1].state = 'active'; }
      emit({ type: 'vlp', action: 'flow' });
    },
    resetVlpFlow: function () {
      state.vlp.upgradeFlow.forEach(function (s, i) { s.state = i === 0 ? 'active' : 'todo'; });
      emit({ type: 'vlp', action: 'flow-reset' });
    }
  };

  /* ------------------------------------------------------------ 流量模拟器 */
  var sim = {
    timer: null, interval: 2600, hits: 0,
    start: function (intervalMs) {
      if (sim.timer) return;
      sim.interval = intervalMs || sim.interval;
      sim.timer = setInterval(sim.tick, sim.interval);
    },
    stop: function () { clearInterval(sim.timer); sim.timer = null; },
    tick: function () {
      var running = state.ports.filter(function (p) { return p.running; });
      if (!running.length) return;
      var n = 1 + Math.floor(Math.random() * 2);
      for (var k = 0; k < n; k++) {
        var port = pick(running);
        var pool = state.apis.filter(function (a) { return port.caps.indexOf(a.capId) >= 0; });
        if (!pool.length) continue;
        var api = pick(pool);
        var res = buildResponse(api);
        api.lastAt = clock();
        var bad = Math.random() < 0.12;
        var status = bad ? pick([500, 404, 403]) : res.status;
        var ix = api.interactions && api.interactions.length && Math.random() < 0.25 ? api.interactions[0] : null;
        var log = {
          id: uid('log'), ts: Date.now(), clock: clock(), portId: port.id,
          method: api.method, path: api.path.replace('{neId}', 'GNB-HZ-000' + (1 + Math.floor(Math.random() * 9))),
          status: ix ? 202 : status, latencyMs: res.delayMs + Math.floor(Math.random() * 40),
          ne: guessNe(api.path), verdict: ix ? '已插入人机交互：' + ix.label : (bad ? '定制响应命中（异常分支）' : '匹配规则'), 
          interaction: ix ? { kind: ix.kind, status: 'pending', label: ix.label, owner: ix.owner, timeoutS: ix.timeoutS } : null,
          req: { headers: { 'X-Mock-Platform': 'sim', 'Content-Type': 'application/json' }, body: { neId: guessNe(api.path), op: api.method } },
          res: { status: status, body: res.body, notes: res.notes, delayMs: res.delayMs, hit: res.hit }
        };
        state.logs.unshift(log);
        if (state.logs.length > 400) state.logs.pop();
        port.stats.req++; if (status < 400) port.stats.ok++; else port.stats.err++;
        sim.hits++;
        emit({ type: 'log', log: log });
      }
      running.forEach(function (p) { p.stats.rps = +(0.6 + Math.random() * 4.4).toFixed(1); });
      emit({ type: 'stats' });
    }
  };

  /* ----------------------------------------------------------------- 选择器 */
  var select = {
    port: function (id) { return byId(state.ports, id || state.ui.selectedPort); },
    api: function (id) { return byId(state.apis, id || state.ui.selectedApi); },
    apisOfCap: function (capId) { return state.apis.filter(function (a) { return a.capId === capId; }); },
    logsFiltered: function () {
      var f = state.ui.logFilter, q = (state.ui.logQuery || '').trim().toLowerCase();
      return state.logs.filter(function (l) {
        if (f === 'ok' && l.status >= 400) return false;
        if (f === 'err' && l.status < 400) return false;
        if (f === 'human' && !l.interaction) return false;
        if (q && (l.path + l.verdict + l.ne).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    },
    kpis: function () {
      var req = 0, ok = 0, err = 0, lat = 0, n = 0;
      state.logs.forEach(function (l) { req++; if (l.status < 400) ok++; else err++; lat += l.latencyMs; n++; });
      return {
        ports: state.ports.length, running: state.ports.filter(function (p) { return p.running; }).length,
        req: req, ok: ok, err: err, avgLat: n ? Math.round(lat / n) : 0,
        ne: state.nes.length, groups: state.groups.length, accounts: state.accounts.length,
        packages: state.packages.length, tasks: state.tasks.filter(function (t) { return t.status !== 'done'; }).length,
        pendingHuman: state.logs.filter(function (l) { return l.interaction && l.interaction.status === 'pending'; }).length
      };
    },
    ne: function (id) { return byId(state.nes, id); },
    group: function (id) { return byId(state.groups, id); },
    capsOfPort: function (portId) {
      var p = byId(state.ports, portId); if (!p) return [];
      return p.caps.map(function (c) { return byId(state.caps, c); }).filter(Boolean);
    }
  };

  /* --------------------------------------------------------------- 内部工具 */
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function capName(id) { var c = byId(state.caps, id); return c ? c.name : id; }
  function guessNe(path) {
    var m = /(GNB|AMF|UPF|SMF|MME|OMC)-([A-Z]{2})-(\d{4})/.exec(path || '');
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return pick(['GNB-HZ-0001', 'AMF-NJ-0003', 'UPF-NJ-0004', 'OMC-XA-0009']);
  }

  /* ------------------------------------------------------------------ 导出 */
  MP.uid = uid;
  MP.now = now;
  MP.clock = clock;
  MP.stamp = stamp;
  MP.clamp = clamp;
  MP.getPath = getPath;
  MP.setPath = setPath;
  MP.expand = expand;
  MP.RULE_META = RULE_META;
  MP.state = state;
  MP.subscribe = subscribe;
  MP.emit = emit;
  MP.actions = actions;
  MP.select = select;
  MP.sim = sim;
  MP.resolveField = resolveField;
  MP.buildResponse = buildResponse;
  MP.byId = byId;
  MP.capName = capName;
})(window);

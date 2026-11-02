/* ============================================================================
 * V5 · 音乐调测台（Rhine Music Console） —— 视图层
 *
 * 数据 / 动作 / 规则引擎 / 模拟器 / 微交互 / 动效 / 按钮动效 / canvas 特效
 * 全部来自 _shared（MP.*），本文件只做「渲染 + 接线 + 本版的连续运动语言」。
 *
 * 本版签名（对应 07-Rhine-Music-Demo 的音乐台）：
 *   · 底部 transport 条：大圆形主控 = mock 服务启停；进度轨 = 会话流量时间轴（可拖）
 *     循环 = 自动重放请求；速率刻度 = 流速档位；左侧「正在服务」= 端点 + 能力
 *   · 专辑卡阵列 = 端点 / 能力 / 软件包 / 任务卡，横向成列，选中项与相邻项异步起伏
 *   · 刻度尺导航 = 六个界面（选中刻度加长变琥珀 + 两位编号 + 中英标签）
 *   · 频谱 = canvas 柱状波，跟着审计日志的到达节奏跳动
 *   · 晨雾 / 月影双主题，配色沿同一条 650ms 时钟连续插值，持久化到 localStorage
 *   · ContentTransition 360ms：同一帧隐藏旧页、显示新页，共同容器 .35 → 1
 *   · 交互后 2.5s 进入常态轻微波动（缓入）；列与列之间异步波峰；减少动态效果 → 静止
 * ==========================================================================*/
(function () {
  'use strict';

  var MP = window.MP;
  if (!MP) return;
  var S = MP.state, A = MP.actions, SEL = MP.select, M = MP.motion, X = MP.micro;
  var root = document.documentElement;
  var BODY = document.getElementById('mc');
  /* 每屏的本地选中 [列, 卡]；状态层（selectedPort / selectedApi）是权威，这里是视图位置 */
  S.sel = { mock: [0, 0], flow: [0, 0], ne: [0, 0], omp: [0, 0], lcm: [0, 0], vlp: [0, 0], neId: '' };

  /* ------------------------------------------------------------ DOM 小工具 */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function node(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function opts(list, cur) {
    return list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === String(cur) ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('');
  }
  function statusCls(code) { var c = Math.floor(+code / 100); return 'mcs' + c + 'xx'; }
  function capOf(id) { return MP.byId(S.caps, id) || { code: '—', name: '未挂载能力', version: '', endpoints: 0 }; }
  function neName(id) { var n = MP.byId(S.nes, id); return n ? n.name : '平台级'; }
  function groupName(id) { var g = MP.byId(S.groups, id); return g ? g.name : '未成组'; }
  function siteName(id) { var s = MP.byId(S.sites, id); return s ? s.name : '未指定'; }
  function ruleMeta(kind) { return MP.RULE_META[kind] || MP.RULE_META.fixed; }

  /* 全部动作反馈都走带引信的 toast（可撤销 / 可点动作） */
  function toast(title, desc, o) {
    o = o || {};
    var host = document.getElementById('toasts');
    if (!host) return null;
    return X.toast(host, {
      title: title, desc: desc, tone: o.tone, duration: o.duration || 4200,
      actionLabel: o.actionLabel, onAction: o.onAction, onUndo: o.onUndo
    });
  }
  var RULE_KINDS = [
    { v: 'fixed', n: '固定' }, { v: 'increment', n: '自增' }, { v: 'once', n: '单次生效' },
    { v: 'conditional', n: '条件' }, { v: 'random', n: '随机' }
  ];
  var COND_OPS = ['等于', '包含', '非空', '末尾为偶数'];
  var IX_KINDS = [
    { v: 'human-confirm', n: '人工确认' }, { v: 'captcha', n: '验证码' }, { v: 'manual-gate', n: '人工闸门' }
  ];
  var STATUS_OPTS = ['200', '201', '202', '400', '403', '404', '409', '500'];

  /* 波浪色的迷你柱状图（卡上的「曲目长度」位置） */
  function sparkSVG(seed, n) {
    n = n || 9;
    var h = [];
    for (var i = 0; i < n; i++) {
      var v = 3 + Math.abs(Math.sin((seed + 1) * (i + 2) * 1.7)) * 14;
      h.push('<rect x="' + (i * 4) + '" y="' + (18 - v).toFixed(1) + '" width="2" height="' + v.toFixed(1) + '"></rect>');
    }
    return '<svg class="mcard__spark" viewBox="0 0 34 20" aria-hidden="true">' + h.join('') + '</svg>';
  }

  /* -------------------------------------------------------------- 卡阵列 */
  var COLS = {};   /* 每屏的列模型：{ key, en, name, sub, cards:[{key,code,title,sub,meta[],on,dis,spark}] } */

  var DYNID = ['popTitle', 'popBody', 'toasts'];   /* 动态容器/固定节点白名单 */

  function buildCar(screen, cols) {
    COLS[screen] = cols;
    return '<div class="mcar__strip" data-car-strip="' + screen + '"></div>' +
      '<div class="mcar__nav">' +
        '<span><small>CARTRIDGE / 卡列</small> <b data-car-pos="' + screen + '">—</b></span>' +
        '<span class="mcar__arrows">' +
          '<button type="button" class="mct" data-fx="subtle" data-car-step="' + screen + '" data-dir="-1" aria-label="上一列 / 上一张">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
          '<button type="button" class="mct" data-fx="subtle" data-car-step="' + screen + '" data-dir="1" aria-label="下一列 / 下一张">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
        '</span>' +
        '<span><kbd>← →</kbd> 切列 <kbd>↑ ↓</kbd> 切卡</span>' +
      '</div>';
  }

  function renderCar(screen) {
    var host = document.querySelector('[data-car="' + screen + '"]');
    var cols = COLS[screen];
    if (!host || !cols) return;
    host.innerHTML = buildCar(screen, cols);
    var strip = host.querySelector('.mcar__strip');

    if (!cols.length) {
      strip.appendChild(node('div', 'mcard__s', '当前没有可播放的卡。先在上方面板里创建一条记录。'));
      return;
    }

    var selCol = S.sel[screen][0];
    if (selCol >= cols.length) { selCol = 0; S.sel[screen][0] = 0; }
    var selCard = S.sel[screen][1];

    cols.forEach(function (col, ci) {
      var colEl = node('div', 'mcar__col');
      colEl.dataset.ci = String(ci);
      colEl.dataset.dim = ci === selCol ? '0' : '1';

      var hd = node('button', 'mcar__colhd' + (ci === selCol ? ' is-on' : ''));
      hd.type = 'button';
      hd.dataset.col = String(ci);
      hd.dataset.fx = 'subtle';
      hd.dataset.fkey = 'col:' + screen + ':' + ci;
      hd.setAttribute('aria-label', '第 ' + pad2(ci + 1) + ' 列 ' + col.name);
      hd.innerHTML = '<small>' + esc(col.en || 'COLUMN') + '</small><b>' + esc(col.name) + '</b>' +
        '<i>' + esc(col.sub || '') + '</i>';
      colEl.appendChild(hd);

      var box = node('div', 'mcar__cards');
      var cards = col.cards || [];
      cards.forEach(function (c, i) {
        var on = ci === selCol && i === selCard;
        var b = node('button', 'mcard' + (on ? ' is-on' : ''));
        b.type = 'button';
        b.dataset.col = String(ci);
        b.dataset.k = String(i);
        b.dataset.fkey = screen + ':' + ci + ':' + i;
        b.dataset.fx = 'subtle';
        b.dataset.phase = String(c.phase || ((ci * 0.42 + i * 0.19) % 1));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', (c.code ? c.code + ' ' : '') + c.title + (c.sub ? ' · ' + c.sub : ''));
        b.innerHTML =
          '<span class="mcard__code">' + esc(c.code || pad2(i + 1)) + '</span>' +
          '<span class="mcard__bd">' +
            '<b class="mcard__t">' + esc(c.title) + '</b>' +
            '<span class="mcard__s">' + esc(c.sub || '') + '</span>' +
            ((c.meta && c.meta.length) ? '<span class="mcard__m">' + c.meta.join('') + '</span>' : '') +
          '</span>' +
          (c.spark ? sparkSVG(i + ci * 3) : '');
        box.appendChild(b);
      });

      /* 空位：保持列的原高度（像一张张专辑壳），键盘导航会跳过它们 */
      var fillTo = col.fill == null ? 5 : col.fill;
      for (var f = cards.length; f < fillTo; f++) {
        box.appendChild(node('div', 'mcard is-empty', '<span></span>'));
      }
      colEl.appendChild(box);
      strip.appendChild(colEl);
    });

    syncCarPos(screen);
  }

  function syncCarPos(screen) {
    var cols = COLS[screen] || [];
    var el = document.querySelector('[data-car-pos="' + screen + '"]');
    if (!el) return;
    var ci = S.sel[screen][0];
    var col = cols[ci];
    el.textContent = pad2(Math.min(ci + 1, cols.length)) + ' / ' + pad2(cols.length) +
      (col ? ' · ' + col.name : '') + ' · 卡 ' + pad2(S.sel[screen][1] + 1);
  }

  function focusCard(screen, scroll) {
    var host = document.querySelector('[data-car="' + screen + '"]');
    if (!host) return;
    var ci = S.sel[screen][0], ki = S.sel[screen][1];
    $$('.mcar__col', host).forEach(function (c) {
      c.dataset.dim = (+c.dataset.ci === ci) ? '0' : '1';
      c.classList.toggle('is-focus', +c.dataset.ci === ci);
    });
    $$('.mcar__colhd', host).forEach(function (c) { c.classList.toggle('is-on', +c.dataset.col === ci); });
    var card = host.querySelector('.mcard[data-col="' + ci + '"][data-k="' + ki + '"]');
    $$('.mcard', host).forEach(function (n) {
      var on = n === card;
      n.classList.toggle('is-on', on);
      if (!n.classList.contains('is-empty')) n.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    syncCarPos(screen);
    if (card && scroll !== false) {
      var strip = host.querySelector('.mcar__strip');
      if (strip) {
        var tr = strip.getBoundingClientRect(), cr = card.getBoundingClientRect();
        if (cr.left < tr.left || cr.right > tr.right) {
          strip.scrollLeft += (cr.left - tr.left) - (tr.width - cr.width) / 2;
        }
      }
    }
    wave(screen, ci, ki);
  }

  /* 选中项抬起，两侧依次起伏（异步波峰：相位来自 data-phase，延迟按列/卡距离累加） */
  function wave(screen, ci, ki) {
    if (M.reduced) return;
    var host = document.querySelector('[data-car="' + screen + '"]');
    if (!host) return;
    var nodes = $$('.mcard', host).filter(function (n) {
      return !n.classList.contains('is-empty') &&
        Math.abs(+n.dataset.col - ci) + Math.abs(+n.dataset.k - ki) <= 2;
    });
    waveQueue = waveQueue.filter(function (q) { return nodes.indexOf(q.n) < 0; });
    nodes.forEach(function (n) {
      var dist = Math.abs(+n.dataset.col - ci) + Math.abs(+n.dataset.k - ki);
      var phase = parseFloat(n.dataset.phase || '0');
      var delay = dist * 46 + phase * 90;
      var start = -3 - Math.max(0, 2 - dist) * 2.2;
      if (n.__wave) { try { n.__wave.stop(); } catch (e) { /* 忽略 */ } n.__wave = null; }
      n.classList.add('is-wave');
      setTimeout(function () { n.classList.remove('is-wave'); }, 900 + delay);
      waveQueue.push({ n: n, at: performance.now() + delay, from: start });
    });
  }
  var waveQueue = [];

  /* 波峰由环境循环统一推进：延迟到点才起跳，起跳后交回环境循环的常态波动 */
  function stepWaves(now) {
    for (var i = waveQueue.length - 1; i >= 0; i--) {
      var q = waveQueue[i];
      if (now < q.at) continue;
      waveQueue.splice(i, 1);
      (function (n, from) {
        n.__wave = M.spring({
          from: from, to: 0, stiffness: 300, damping: 15,
          onUpdate: function (v) { n.style.transform = 'translateY(' + v.toFixed(2) + 'px)'; },
          onDone: function () { n.style.transform = ''; n.__wave = null; }
        });
        setTimeout(function () { try { n.__wave && n.__wave.stop(); } catch (e) { /* 忽略 */ } n.style.transform = ''; n.__wave = null; }, 900);
      })(q.n, q.from);
    }
  }

  function moveCol(screen, dir) {
    var cols = COLS[screen] || [];
    if (!cols.length) return;
    var i = MP.clamp(S.sel[screen][0] + dir, 0, cols.length - 1);
    if (i === S.sel[screen][0]) { boundBump(screen); return; }
    S.sel[screen][0] = i;
    var len = Math.max(1, (cols[i].cards || []).length);
    S.sel[screen][1] = MP.clamp(S.sel[screen][1], 0, len - 1);
    commitSel(screen, true);
  }
  function moveCard(screen, dir) {
    var cols = COLS[screen] || [];
    var col = cols[S.sel[screen][0]];
    if (!col) return;
    var len = (col.cards || []).length;
    if (!len) return;
    var i = MP.clamp(S.sel[screen][1] + dir, 0, len - 1);
    if (i === S.sel[screen][1]) { boundBump(screen); return; }
    S.sel[screen][1] = i;
    commitSel(screen, true);
  }
  /* 边界橡皮筋：到头了也给一次反馈，不是「按了没反应」 */
  function boundBump(screen) {
    var el = document.querySelector('[data-car-pos="' + screen + '"]');
    if (!el || M.reduced) return;
    var s = M.spring({ from: -5, to: 0, stiffness: 340, damping: 14, onUpdate: function (v) { el.style.transform = 'translateX(' + v.toFixed(2) + 'px)'; } });
    setTimeout(function () { s.stop(); el.style.transform = ''; }, 320);
    MP.sfx.play('step');
  }

  function commitSel(screen, scroll) {
    /* 选择落到状态层：mock 选端口、flow 选接口；其余屏先同步到本地（render 时读回） */
    var cols = COLS[screen] || [];
    var col = cols[S.sel[screen][0]];
    var card = col && (col.cards || [])[S.sel[screen][1]];
    if (screen === 'ne' && card && card.neId && card.neId !== S.sel.neId) {
      S.sel.neId = card.neId;
      focusCard(screen, scroll);
      renderDetail(screen);
      return;
    }
    if (screen === 'mock' && col && col.portId && col.portId !== S.ui.selectedPort) {
      A.selectPort(col.portId); return;   /* 订阅回调会重画 */
    }
    if (screen === 'flow' && card && card.apiId && card.apiId !== S.ui.selectedApi) {
      A.selectApi(card.apiId); return;
    }
    focusCard(screen, scroll);
    renderDetail(screen);
  }

  /* -------------------------------------------------- 详情渲染（按屏分派） */
  function renderDetail(screen) {
    if (screen === 'mock') renderMock();
    else if (screen === 'flow') renderFlowDetail();
    else if (screen === 'ne') renderNe();
    else if (screen === 'omp') renderOmp();
    else if (screen === 'lcm') renderLcm();
    else if (screen === 'vlp') renderVlp();
  }

  /* =============================================================== 01 Mock */
  function renderMock() {
    /* 列 = 端口（专辑），卡 = 能力 + 服务状态（曲目） */
    var selPort = S.ui.selectedPort;
    var cols = S.ports.map(function (p) {
      var cards = S.caps.map(function (c) {
        var on = p.caps.indexOf(c.id) >= 0;
        return {
          code: c.code, title: c.name, sub: on ? ('已挂载 · ' + c.endpoints + ' 个接口') : '未挂载',
          on: on, phase: (c.hue % 100) / 100,
          meta: ['<span class="mcard__tag' + (on ? ' mcard__tag--accent' : '') + '">' + esc(c.version) + '</span>',
                 '<span class="mcard__tag">' + c.endpoints + ' EP</span>']
        };
      });
      cards.push({
        code: 'SVC', title: p.running ? '服务运行中' : '服务已停止',
        sub: p.running ? ('rps ' + p.stats.rps.toFixed(1) + ' · 累计 ' + p.stats.req + ' 次') : '未开启',
        on: p.running, phase: 0.5, spark: p.running,
        meta: ['<span class="mcard__tag' + (p.running ? ' mcard__tag--ok' : '') + '">:' + p.port + '</span>']
      });
      return {
        key: p.id, portId: p.id,
        en: (p.protocol || 'HTTP') + ' / ' + (p.tls || '—'),
        name: p.ip + ':' + p.port,
        sub: p.caps.length + ' 项能力 · ' + (p.running ? '运行中' : '已停止'),
        cards: cards, fill: 7
      };
    });
    /* 选择同步：状态层是权威（列 = 端口）；卡序号本地保留，重画不跳卡 */
    var keepCard = S.sel.mock ? S.sel.mock[1] : 0;
    cols.forEach(function (c, i) { if (c.portId === selPort) S.sel.mock[0] = i; });
    S.sel.mock[1] = MP.clamp(keepCard, 0, 6);
    COLS.mock = cols;
    renderCar('mock');

    var p = SEL.port() || S.ports[0];
    var det = $('#mockDetail');
    if (!p) { det.innerHTML = '<div class="mcdt__blk"><p class="mcdt__note">还没有注册任何 mock 端口。</p></div>'; return; }

    var cert = p.cert || { status: 'none' };
    var k = SEL.kpis();
    var nicKnown = [S.host.ip, S.host.alt].indexOf(p.ip) >= 0;
    var ipOpts = '<option value="' + esc(S.host.ip) + '"' + (nicKnown && p.ip === S.host.ip ? ' selected' : '') + '>' + esc(S.host.ip) + ' · 以太网</option>' +
      '<option value="' + esc(S.host.alt) + '"' + (nicKnown && p.ip === S.host.alt ? ' selected' : '') + '>' + esc(S.host.alt) + ' · 无线网卡</option>' +
      '<option value="__manual"' + (nicKnown ? '' : ' selected') + '>手填…</option>';
    det.innerHTML =
      /* ---- 端口参数 + 校验 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>端口参数</h2><small>PORT / REGISTER</small>' +
          '<span class="mcbadge' + (p.running ? ' mcbadge--ok' : '') + '">' + (p.running ? 'RUNNING' : 'IDLE') + '</span></div>' +
        '<div class="mcdt__cols">' +
          '<div class="mcfld"><label for="mA">IP 地址 <b>本机网卡或手填</b></label>' +
            '<select class="mcsel" id="mA" data-fkey="mA">' + ipOpts + '</select>' +
            '<span class="mcfld__hint">注册端口会把它写进 mock 服务监听列表。</span>' +
            '<span class="mcfld__err" id="mAErr"></span></div>' +
          '<div class="mcfld"><label for="mIpH">手填 IP</label>' +
            '<input class="mcin" id="mIpH" data-fkey="mIpH" value="' + esc(p.ip) + '" inputmode="decimal" placeholder="10.18.32.104" />' +
            '<span class="mcfld__hint">选择「手填…」时使用这里的值。</span></div>' +
          '<div class="mcfld"><label for="mP">端口 <b>1024–65535</b></label>' +
            '<input class="mcin" id="mP" data-fkey="mP" value="' + p.port + '" inputmode="numeric" />' +
            '<span class="mcfld__err" id="mPErr"></span></div>' +
          '<div class="mcfld"><label for="mProto">协议</label>' +
            '<select class="mcsel" id="mProto" data-fkey="mProto">' + opts(['HTTPS', 'HTTP', 'HTTP2'], p.protocol) + '</select></div>' +
          '<div class="mcfld"><label for="mTls">传输加密</label>' +
            '<select class="mcsel" id="mTls" data-fkey="mTls">' + opts(['TLS1.3', 'TLS1.2', '—'], p.tls) + '</select></div>' +
          '<div class="mcfld"><label for="mNote">备注</label>' +
            '<input class="mcin" id="mNote" data-fkey="mNote" value="' + esc(p.note || '') + '" /></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="mReg" data-fx="standard" data-act="register-port">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' +
            '<span class="mx-hold__label">注册为新 mock 端口</span></button>' +
          '<button type="button" class="mcbtn mcbtn--danger" id="mRemove" data-fx="subtle" data-act="remove-port">移除当前端口</button>' +
          '<span class="mcrule-hint">当前 ' + S.ports.length + ' 个端口 · 运行中 ' + k.running + ' 个</span>' +
        '</div>' +
      '</section>' +

      /* ---- 证书文件 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>证书文件</h2><small>CERTIFICATE / X.509</small>' +
          '<span id="mCertMark"></span></div>' +
        '<div class="mckv" id="mCertKv"></div>' +
        '<div class="mcdt__cols" style="margin-top:14px">' +
          '<div class="mcfld"><label for="mCn">CN 通用名</label>' +
            '<input class="mcin" id="mCn" data-fkey="mCn" value="' + esc(cert.cn || ('mock-' + p.port + '.' + p.ip)) + '" />' +
            '<span class="mcfld__err" id="mCnErr"></span></div>' +
          '<div class="mcfld"><label for="mIssuer">签发机构</label>' +
            '<select class="mcsel" id="mIssuer" data-fkey="mIssuer">' + opts(['MockCA-Root', 'RhineLab-Internal-CA', '自签'], cert.issuer || 'MockCA-Root') + '</select></div>' +
          '<div class="mcfld"><label for="mDays">有效期（天）</label>' +
            '<input class="mcin" id="mDays" data-fkey="mDays" value="' + (cert.days || 365) + '" inputmode="numeric" />' +
            '<span class="mcfld__err" id="mDaysErr"></span></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="mCert" data-fx="standard" data-act="issue-cert">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 13h5M10 16.5h3"/></svg>' +
            '<span class="mx-hold__label">' + (cert.status === 'issued' ? '重新签发证书' : '生成证书文件') + '</span></button>' +
          '<span class="mcrule-hint">证书文件写到端口的工作目录，指纹同步进审计日志。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 能力挂载 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>平台能力挂载</h2><small>CAPABILITY / 6 选 N</small>' +
          '<span class="mcrule-hint">已挂载 ' + p.caps.length + ' / ' + S.caps.length + '</span></div>' +
        '<div class="mcdt__cols mcdt__cols--3" id="mCapGrid"></div>' +
      '</section>' +

      /* ---- 服务开关 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>mock 服务</h2><small>SERVICE / LIFECYCLE</small>' +
          '<span id="mSvcMark"></span></div>' +
        '<div class="mcrow">' +
          '<button type="button" class="mcact" id="mStart" data-fx="standard">' +
            '<span class="mx-hold__label">按住开启 mock 服务</span></button>' +
          '<button type="button" id="mFuse" data-fx="none">停止服务</button>' +
          '<span class="mcrule-hint">「开启」必须按住到满（防误触）；「停止」完成后 4 秒内可撤销。</span>' +
        '</div>' +
        '<div class="mckv" style="margin-top:16px">' +
          '<div class="mckv__i"><small>REQUESTS</small><b data-count="' + p.stats.req + '">' + p.stats.req + '</b><i>累计请求</i></div>' +
          '<div class="mckv__i"><small>OK / ERR</small><b>' + p.stats.ok + ' / ' + p.stats.err + '</b><i>成功 / 异常</i></div>' +
          '<div class="mckv__i"><small>RPS</small><b>' + p.stats.rps.toFixed(1) + '</b><i>当前速率</i></div>' +
          '<div class="mckv__i"><small>SESSION</small><b>' + hist.length + '</b><i>会话记录</i></div>' +
        '</div>' +
      '</section>';

    /* 证书区（KV + statusMark） */
    var kv = $('#mCertKv');
    if (cert.status === 'issued') {
      kv.innerHTML =
        '<div class="mckv__i"><small>STATUS</small><b>已签发</b><i>' + esc(cert.issuedAt) + '</i></div>' +
        '<div class="mckv__i"><small>CN</small><b>' + esc(cert.cn) + '</b><i>' + esc(cert.issuer) + '</i></div>' +
        '<div class="mckv__i"><small>VALID</small><b>' + cert.days + ' d</b><i>有效期</i></div>' +
        '<div class="mckv__i"><small>FINGERPRINT</small><b>' + esc(cert.fingerprint) + '</b><i>SHA-256 摘要</i></div>';
    } else {
      kv.innerHTML =
        '<div class="mckv__i"><small>STATUS</small><b>未签发</b><i>等待生成证书文件</i></div>' +
        '<div class="mckv__i"><small>CN</small><b>—</b><i>签发时写入</i></div>' +
        '<div class="mckv__i"><small>VALID</small><b>0 d</b><i>有效期</i></div>' +
        '<div class="mckv__i"><small>FINGERPRINT</small><b>—</b><i>SHA-256 摘要</i></div>';
    }
    X.statusMark($('#mCertMark'), { state: cert.status === 'issued' ? 'done' : 'idle', label: cert.status === 'issued' ? '证书就绪' : '待签发' });
    X.statusMark($('#mSvcMark'), { state: p.running ? 'done' : 'idle', label: p.running ? '服务运行中' : '服务已停止' });

    /* 能力开关（velocitySwitch） */
    var grid = $('#mCapGrid');
    S.caps.forEach(function (c) {
      var on = p.caps.indexOf(c.id) >= 0;
      var wrap = node('div', 'mcfld');
      wrap.innerHTML = '<label><b>' + esc(c.name) + '</b> · ' + esc(c.code) + ' ' + esc(c.version) + '</label>' +
        '<div class="mcrow"><span data-capsw="' + c.id + '"></span><i class="mcfld__hint">' + c.endpoints + ' 个接口</i></div>';
      grid.appendChild(wrap);
      X.velocitySwitch(wrap.querySelector('[data-capsw]'), {
        checked: on, label: c.name + ' 挂载开关',
        onChange: function (v) {
          if (v) A.attachCap(p.id, c.id); else A.detachCap(p.id, c.id);
          toast((v ? '已挂载能力 ' : '已卸载能力 ') + c.name, c.code + ' ' + c.version + ' · ' + c.endpoints + ' 个接口',
            { tone: v ? 'ok' : 'warn', duration: 2600 });
        }
      });
    });

    /* 按住开启（holdConfirm） */
    var startBtn = $('#mStart');
    var hold = X.holdConfirm(startBtn, {
      duration: 1100, label: '按住开启 mock 服务', doneLabel: '服务已开启',
      resetAfter: 900,
      onConfirm: function () {
        A.startService(p.id);
        toast('mock 服务已开启', p.ip + ':' + p.port + ' · ' + p.caps.length + ' 项能力开始应答', { tone: 'ok', duration: 3200 });
      }
    });
    /* 停止（fuseButton，完成后带引信撤销） */
    var fuse = X.fuseButton($('#mFuse'), {
      label: '停止服务', doneLabel: '已停止 · 撤销', undoLabel: '撤销', undoWindow: 4000,
      onCommit: function () {
        A.stopService(p.id);
        toast('mock 服务已停止', p.ip + ':' + p.port + ' 不再应答请求，4 秒内可撤销', { tone: 'warn', duration: 4000 });
      },
      onUndo: function () {
        A.startService(p.id);
        toast('已撤销停止', '服务恢复应答', { tone: 'ok', duration: 2400 });
      }
    });
    /* 让外部（transport / 键盘）也能操作 */
    S.svc = { hold: hold, fuse: fuse };

    /* 移除端口（fuseButton 语义：完成后可撤销） */
    var portSnapshot = null;
    X.fuseButton($('#mRemove'), {
      label: '移除当前端口', doneLabel: '已移除 · 撤销', undoWindow: 4200,
      onCommit: function () {
        portSnapshot = p;
        var backup = JSON.parse(JSON.stringify(p));
        A.removePort(p.id);
        toast('已移除端口 ' + backup.ip + ':' + backup.port, '4 秒内可撤销恢复', {
          tone: 'danger', duration: 4200,
          actionLabel: '撤销移除',
          onAction: function () {
            var np = A.registerPort({ ip: backup.ip, port: backup.port, protocol: backup.protocol, tls: backup.tls, caps: backup.caps, note: backup.note });
            A.generateCert(np.id, { cn: backup.cert.cn || undefined, days: backup.cert.days || 365, issuer: backup.cert.issuer || undefined });
            if (backup.running) A.startService(np.id);
          }
        });
      }
    });

    /* 注册：表单校验 + 就近报错 */
    $('#mReg').addEventListener('click', function () {
      var picked = $('#mA').value;
      var ip = picked === '__manual' ? $('#mIpH').value.trim() : picked;
      var port = parseInt($('#mP').value, 10);
      var ok = true;
      ok = fieldErr('mA', '', true) && ok;
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { fieldErr('mIpH', 'IP 形如 10.18.32.104（四段 0–255）'); ok = false; }
      else fieldErr('mIpH', '');
      if (!(port >= 1024 && port <= 65535)) { fieldErr('mP', '端口范围 1024–65535，当前 ' + ($('#mP').value || '空')); ok = false; }
      else fieldErr('mP', '');
      if (!ok) { MP.sfx.play('warn'); return; }
      var self = this;
      var done = MP.btn.loading(self, '注册中');
      setTimeout(function () {
        var np = A.registerPort({ ip: ip, port: port, protocol: $('#mProto').value, tls: $('#mTls').value, caps: [], note: $('#mNote').value.trim() || '手动注册' });
        done();
        MP.btn.enhance(document);
        toast('已注册 mock 端口', ip + ':' + port + ' · 记得签发证书并挂载能力', { tone: 'ok', duration: 3400, actionLabel: '去签发证书', onAction: function () { $('#mCert') && $('#mCert').focus(); } });
        S.sel.mock[1] = 0;
      }, 420);
    });

    /* 签发证书：异步 + loading */
    $('#mCert').addEventListener('click', function () {
      var cn = $('#mCn').value.trim();
      var days = parseInt($('#mDays').value, 10);
      var ok = true;
      if (!cn) { fieldErr('mCn', 'CN 不能为空，示例 mock-8443.10.18.32.104'); ok = false; } else fieldErr('mCn', '');
      if (!(days >= 1 && days <= 3650)) { fieldErr('mDays', '有效期 1–3650 天'); ok = false; } else fieldErr('mDays', '');
      if (!ok) { MP.sfx.play('warn'); return; }
      var self = this;
      var done = MP.btn.loading(self, '签发中');
      var lxHost = node('span', 'mcrule-hint');
      self.parentNode.insertBefore(lxHost, self.nextSibling);
      var lx = X.latticeLoader(lxHost, { label: '生成密钥对 · 写证书文件', size: 9 });
      setTimeout(function () {
        var issued = A.generateCert(p.id, { cn: cn, days: days, issuer: $('#mIssuer').value });
        lx.done('已写入 ' + (issued ? issued.fingerprint : cn));
        done();
        toast('证书文件已生成', cn + ' · ' + days + ' 天 · ' + $('#mIssuer').value, { tone: 'ok', duration: 3400 });
        setTimeout(function () { lx.stop(); }, 1800);
      }, 900);
    });

    wireA11y(det);
  }

  function fieldErr(id, msg, silent) {
    var el = document.getElementById(id);
    var box = document.getElementById(id + 'Err');
    if (el) {
      if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      var fld = el.closest('.mcfld');
      if (fld) fld.classList.toggle('has-err', !!msg);
    }
    if (box) box.textContent = msg || '';
    if (msg && !silent) MP.sfx.play('warn');
    return !msg;
  }

  /* =============================================================== 02 Flow */
  function renderFlow() {
    var curApi = S.ui.selectedApi;
    var cols = [];
    S.caps.forEach(function (c) {
      var apis = SEL.apisOfCap(c.id);
      if (!apis.length) return;
      var cards = apis.map(function (a) {
        var st = +a.status;
        return {
          code: a.method, title: a.name, sub: a.path, apiId: a.id,
          on: a.id === curApi, phase: (a.path.length % 7) / 7, spark: true,
          meta: [
            '<span class="mcard__tag ' + statusCls(st) + '">' + st + '</span>',
            '<span class="mcard__tag">' + a.delayMs + 'ms</span>',
            (a.interactions && a.interactions.length ? '<span class="mcard__tag mcard__tag--warn">人机 ×' + a.interactions.length + '</span>' : ''),
            '<span class="mcard__tag">' + a.hits + ' 次</span>'
          ]
        };
      });
      cols.push({
        key: c.id, en: c.code + ' / ' + c.version,
        name: c.name, sub: apis.length + ' 个接口 · ' + c.endpoints + ' 端点',
        cards: cards, fill: 5
      });
    });
    if (COLS.flow) {
      cols.forEach(function (col, i) {
        (col.cards || []).forEach(function (c, j) { if (c.apiId === curApi) { S.sel.flow[0] = i; S.sel.flow[1] = j; } });
      });
    }
    COLS.flow = cols;
    renderCar('flow');
    renderFlowDetail();
  }

  function renderFlowDetail() {
    var det = $('#flowDetail');
    var a = SEL.api();
    if (!a) { det.innerHTML = '<div class="mcdt__blk"><p class="mcdt__note">当前能力下还没有接口。</p></div>'; return; }
    var cap = capOf(a.capId);
    var k = SEL.kpis();

    det.innerHTML =
      /* ---- 预期响应：延迟 + HTTP status ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>预期响应</h2><small>EXPECTED / LATENCY + STATUS</small>' +
          '<span class="mcbadge mcbadge--accent">' + esc(cap.code) + ' ' + esc(cap.version) + '</span></div>' +
        '<div class="mckv">' +
          '<div class="mckv__i"><small>METHOD / PATH</small><b>' + esc(a.method) + '</b><i>' + esc(a.path) + '</i></div>' +
          '<div class="mckv__i"><small>HITS</small><b data-count="' + a.hits + '">' + a.hits + '</b><i>规则命中次数</i></div>' +
          '<div class="mckv__i"><small>LAST</small><b>' + esc(a.lastAt || '—') + '</b><i>最近一次触发</i></div>' +
        '</div>' +
        '<div class="mcdt__cols" style="margin-top:16px">' +
          '<div class="mcfld"><label for="fName">接口名称</label>' +
            '<input class="mcin" id="fName" data-fkey="fName" value="' + esc(a.name) + '" /></div>' +
          '<div class="mcfld"><label for="fStatus">HTTP status code</label>' +
            '<select class="mcsel" id="fStatus" data-fkey="fStatus">' + opts(STATUS_OPTS, a.status) + '</select>' +
            '<span class="mcfld__hint">命中定制响应时返回该状态码。</span></div>' +
          '<div class="mcfld"><label for="fDelayBox">响应延迟</label><span id="fDelayBox"></span>' +
            '<span class="mcfld__err" id="fDelayErr"></span></div>' +
          '<div class="mcfld"><label for="fDesc">接口说明</label>' +
            '<input class="mcin" id="fDesc" data-fkey="fDesc" value="' + esc(a.desc) + '" /></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="fTrigger" data-fx="standard" data-act="trigger-api">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 6.2 17 12l-9 5.8z"/></svg>' +
            '<span class="mx-hold__label">手动触发一次</span></button>' +
          '<button type="button" class="mcbtn" id="fApply" data-fx="subtle">应用状态码 / 名称</button>' +
          '<span class="mcrule-hint">触发会真的走规则引擎，命中说明写在日志里。</span>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<span class="mcrule-hint">常用状态：</span><span id="fSeg"></span>' +
        '</div>' +
      '</section>' +

      /* ---- 字段定制 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>响应字段与规则</h2><small>FIELDS / 下拉 + 手填 + 规则</small>' +
          '<span class="mcrule-hint">' + a.fields.length + ' 个字段</span></div>' +
        '<div class="mcfw">' +
          '<div class="mcfw__row mcfw__row--hd"><span>字段路径</span><span>类型</span><span>来源</span><span>基准值 / 选项</span><span>规则与参数</span><span>操作</span></div>' +
          '<div id="fFields"></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<button type="button" class="mcbtn mcbtn--accent" id="fAddField" data-fx="subtle">+ 新增字段</button>' +
          '<span class="mcrule-hint">规则命中说明见下方审计日志的「命中说明」。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 人机交互 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>插入人机交互</h2><small>HUMAN-IN-THE-LOOP</small>' +
          '<span class="mcbadge' + (k.pendingHuman ? ' mcbadge--warn' : '') + '">待人工 ' + k.pendingHuman + '</span></div>' +
        '<div id="fIxList" class="mcflow"></div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<select class="mcsel" id="fIxKind" data-fkey="fIxKind" style="max-width:180px">' +
            IX_KINDS.map(function (x) { return '<option value="' + x.v + '">' + x.n + '</option>'; }).join('') +
          '</select>' +
          '<button type="button" class="mcbtn" id="fIxAdd" data-fx="subtle">插入到该接口</button>' +
          '<span class="mcrule-hint">命中该接口的请求会停在人机交互，等你在日志里放行或拒绝。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 审计日志 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>请求与响应审计日志</h2><small>AUDIT / REALTIME</small>' +
          '<span class="mcrule-hint" id="fLogCount">—</span></div>' +
        '<div class="mclog">' +
          '<div class="mclog__tools">' +
            '<span id="fSegFilter"></span>' +
            '<input class="mcin mclog__search" id="fQuery" data-fkey="fQuery" value="' + esc(S.ui.logQuery) + '" placeholder="搜索路径 / 判定 / 网元" aria-label="搜索审计日志" />' +
            '<button type="button" class="mcbtn mcbtn--sm" id="fReplayAll" data-fx="subtle">重放全部筛选结果</button>' +
          '</div>' +
          '<div class="mclog__body" id="fLogBody"></div>' +
        '</div>' +
      '</section>';

    /* 延迟 scrub（橡皮筋 + 键盘） */
    var delay = X.scrub($('#fDelayBox'), {
      min: 0, max: 3000, step: 10, value: a.delayMs, suffix: ' ms', label: '延迟',
      onChange: function (v) {
        A.updateApi(a.id, { delayMs: v });
        var idx = COLS.flow && COLS.flow[S.sel.flow[0]];
        var card = idx && idx.cards[S.sel.flow[1]];
        if (card) { card.meta[1] = '<span class="mcard__tag">' + v + 'ms</span>'; }
        var host = document.querySelector('.mcard[data-fkey="flow:' + S.sel.flow[0] + ':' + S.sel.flow[1] + '"] .mcard__m');
        if (host) host.innerHTML = card.meta.join('');
      }
    });
    $('#fDelayBox').addEventListener('keydown', function (e) { e.stopPropagation(); });

    /* 常用状态码：segmented 的橡皮筋分段（同步状态 + 本地 DOM） */
    var segBox = $('#fSeg');
    var seg = X.segmented(segBox, {
      items: [{ label: '200', value: '200' }, { label: '202', value: '202' }, { label: '500', value: '500' }, { label: '404', value: '404' }],
      value: String(a.status),
      onChange: function (v) {
        A.updateApi(a.id, { status: +v });
        if ($('#fStatus')) $('#fStatus').value = v;
        patchFlowCard();
        toast('预期状态码已改为 ' + v, a.method + ' ' + a.path, { duration: 2200 });
      }
    });

    /* 日志过滤：segmented（全部/成功/异常/待人工） */
    X.segmented($('#fSegFilter'), {
      items: [{ label: '全部', value: 'all' }, { label: '成功', value: 'ok' }, { label: '异常', value: 'err' }, { label: '待人工', value: 'human' }],
      value: S.ui.logFilter,
      onChange: function (v) { A.setLogFilter(v); }
    });

    /* 字段编辑 */
    renderFields(a, true);
    /* 人机交互列表 */
    renderIx(a);
    /* 日志 */
    renderLogRows();

    $('#fApply').addEventListener('click', function () {
      A.updateApi(a.id, { name: $('#fName').value.trim() || a.name, status: +$('#fStatus').value, desc: $('#fDesc').value.trim() });
      patchFlowCard();
      toast('接口预期响应已更新', a.method + ' ' + a.path + ' → ' + $('#fStatus').value, { duration: 2400 });
    });
    $('#fTrigger').addEventListener('click', function () {
      var self = this;
      var done = MP.btn.loading(self, '请求中');
      setTimeout(function () {
        var log = A.triggerApi(a.id);
        done();
        toast('已手动触发一次', (log ? log.path + ' → ' + log.status : '') + ' · 字段规则已生效', { tone: 'ok', duration: 3200 });
        renderLogRows();
      }, 380);
    });
    $('#fAddField').addEventListener('click', function () { A.addField(a.id); renderFields(SEL.api(), true); toast('已新增字段', '默认 data.newField · 可改成对象路径', { duration: 2400 }); });
    $('#fIxAdd').addEventListener('click', function () {
      A.addInteraction(a.id, $('#fIxKind').value);
      renderIx(SEL.api());
      patchFlowCard();
      toast('已插入人机交互', '命中该接口的请求会停在等待人工', { tone: 'warn', duration: 3000 });
    });
    $('#fQuery').addEventListener('input', function () { A.setLogQuery(this.value); });
    $('#fQuery').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); e.stopPropagation(); });
    $('#fReplayAll').addEventListener('click', function () {
      var self = this;
      var rows = SEL.logsFiltered().slice(0, 40);
      if (!rows.length) { toast('没有可重放的记录', '换个过滤条件或先触发一次请求', { tone: 'warn', duration: 2600 }); return; }
      var done = MP.btn.loading(self, '重放中');
      var i = 0;
      var timer = setInterval(function () {
        var l = rows[i++];
        var api = S.apis.filter(function (x) { return x.path === l.path; })[0] || SEL.api();
        if (api) A.triggerApi(api.id);
        pump(1);
        if (i >= rows.length) { clearInterval(timer); done(); renderLogRows(); toast('重放完成', '共重放 ' + rows.length + ' 条请求', { tone: 'ok', duration: 2800 }); }
      }, 140);
    });

    wireA11y(det);
  }

  function patchFlowCard() {
    var a = SEL.api();
    if (!a || !COLS.flow) return;
    var col = COLS.flow[S.sel.flow[0]];
    if (!col) return;
    var card = col.cards[S.sel.flow[1]];
    if (!card) return;
    card.code = a.method; card.title = a.name; card.sub = a.path;
    card.meta[0] = '<span class="mcard__tag ' + statusCls(a.status) + '">' + a.status + '</span>';
    card.meta[2] = (a.interactions && a.interactions.length ? '<span class="mcard__tag mcard__tag--warn">人机 ×' + a.interactions.length + '</span>' : '');
    var host = document.querySelector('.mcard[data-fkey="flow:' + S.sel.flow[0] + ':' + S.sel.flow[1] + '"]');
    if (host) {
      var t = host.querySelector('.mcard__t'); if (t) t.textContent = card.title;
      var s = host.querySelector('.mcard__s'); if (s) s.textContent = card.sub;
      var m = host.querySelector('.mcard__m'); if (m) m.innerHTML = card.meta.join('');
    }
  }

  function renderFields(a, initial) {
    var host = $('#fFields');
    if (!host) return;
    host.innerHTML = '';
    a.fields.forEach(function (f) {
      var r = f.rule || { kind: 'fixed' };
      var row = node('div', 'mcfw__row');
      row.dataset.fid = f.id;
      var selSrc = f.source === 'select' ? '下拉选' : '手填';
      row.innerHTML =
        '<div class="mcfld"><label class="sr" for="fk-' + f.id + '">字段路径</label>' +
          '<input class="mcin" id="fk-' + f.id + '" data-fid="' + f.id + '" data-prop="key" value="' + esc(f.key) + '" placeholder="data.field" /></div>' +
        '<div class="mcfld"><label class="sr" for="ft-' + f.id + '">类型</label>' +
          '<select class="mcsel" id="ft-' + f.id + '" data-fid="' + f.id + '" data-prop="type">' + opts(S.fieldTypes, f.type) + '</select></div>' +
        '<div class="mcfld"><label class="sr" for="fs-' + f.id + '">来源</label>' +
          '<select class="mcsel" id="fs-' + f.id + '" data-fid="' + f.id + '" data-prop="source">' + opts(['select', 'manual'], f.source) +
            '<option value="select"' + (f.source === 'select' ? ' selected' : '') + '>下拉选</option>' +
            '<option value="manual"' + (f.source === 'manual' ? ' selected' : '') + '>手填</option>' +
          '</select></div>' +
        '<div class="mcfld">' +
          '<input class="mcin" data-fid="' + f.id + '" data-prop="value" value="' + esc(f.value) + '" aria-label="基准值" placeholder="基准值" />' +
          '<input class="mcin" data-fid="' + f.id + '" data-prop="options" value="' + esc((f.options || []).join(', ')) + '" aria-label="候选选项" placeholder="候选值，逗号分隔" />' +
          '<span class="mcfld__hint">' + (f.source === 'select' ? '下拉选：' + ((f.options || []).length) + ' 项候选' : '手填：直接写入响应') + '</span>' +
        '</div>' +
        '<div class="mcfw__rule">' +
          '<select class="mcsel" data-fid="' + f.id + '" data-prop="rule.kind" aria-label="字段规则">' +
            RULE_KINDS.map(function (k) { return '<option value="' + k.v + '"' + (r.kind === k.v ? ' selected' : '') + '>' + k.n + '</option>'; }).join('') +
          '</select>' +
          (r.kind === 'conditional' ? '<input type="hidden" data-fid="' + f.id + '" data-rk="when.base" value="' + esc(JSON.stringify(r.when || {})) + '" />' : '') +
          '<div class="mcfw__rule-args">' + ruleArgs(f, r) + '</div>' +
          '<span class="mcrule-hint">' + esc(ruleMeta(r.kind).hint) + '</span>' +
        '</div>' +
        '<div class="mcfw__tail">' +
          '<span class="mcrule-chip ' + chipTone(ruleMeta(r.kind).tone) + '">' + esc(ruleMeta(r.kind).name) + '</span>' +
          '<button type="button" class="mcbtn mcbtn--sm mcbtn--danger" data-fx="subtle" data-remove-field="' + f.id + '" aria-label="删除字段 ' + esc(f.key) + '">×</button>' +
        '</div>';
      host.appendChild(row);
    });
    if (initial) { /* 只挂一次委托 */ }
  }

  function chipTone(t) {
    if (t === 'accent') return 'mcrule-chip--accent';
    if (t === 'warn') return 'mcrule-chip--warn';
    if (t === 'info') return 'mcrule-chip--info';
    if (t === 'danger') return 'mcrule-chip--danger';
    return '';
  }

  function ruleArgs(f, r) {
    if (r.kind === 'increment') {
      return '<input class="mcin" data-fid="' + f.id + '" data-rk="start" value="' + (r.start == null ? 1 : r.start) + '" aria-label="起始值" placeholder="起始" />' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="step" value="' + (r.step == null ? 1 : r.step) + '" aria-label="步长" placeholder="步长" />' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="pattern" value="' + esc(r.pattern || '') + '" aria-label="编号模板" placeholder="{n:04}" />';
    }
    if (r.kind === 'once') {
      return '<input class="mcin" data-fid="' + f.id + '" data-rk="times" value="' + (r.times == null ? 1 : r.times) + '" aria-label="生效次数" placeholder="次数" />' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="fallback" value="' + esc(r.fallback == null ? '' : r.fallback) + '" aria-label="兜底值" placeholder="兜底值" />';
    }
    if (r.kind === 'conditional') {
      var w = r.when || {};
      return '<select class="mcsel" data-fid="' + f.id + '" data-rk="when.key" aria-label="条件依赖字段">' +
          opts(fieldKeys(f), w.key || '') + '</select>' +
        '<select class="mcsel" data-fid="' + f.id + '" data-rk="when.op" aria-label="条件运算符">' + opts(COND_OPS, w.op || '等于') + '</select>' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="when.value" value="' + esc(w.value == null ? '' : w.value) + '" aria-label="条件比较值" placeholder="比较值" />' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="then" value="' + esc(r.then == null ? '' : r.then) + '" aria-label="命中返回值" placeholder="命中 →" />' +
        '<input class="mcin" data-fid="' + f.id + '" data-rk="else" value="' + esc(r.else == null ? '' : r.else) + '" aria-label="未命中返回值" placeholder="否则 →" />';
    }
    if (r.kind === 'random') {
      return '<input class="mcin" data-fid="' + f.id + '" data-rk="__random" value="' + ((f.options || []).length) + ' 项候选" readonly aria-label="随机候选数" />';
    }
    return '<span class="mcrule-hint">固定值：每次命中都返回左上的基准值。</span>';
  }
  function fieldKeys(self) {
    var a = SEL.api();
    var list = [];
    if (a) (a.fields || []).forEach(function (f) { if (f.id !== self.id) list.push(f.key); });
    if (!list.length) list.push(self.key);
    return list;
  }

  function renderIx(a) {
    var host = $('#fIxList');
    if (!host) return;
    host.innerHTML = '';
    if (!a.interactions.length) {
      host.appendChild(node('p', 'mcdt__note', '该接口目前不插入人机交互，请求会直接按规则返回。'));
      return;
    }
    a.interactions.forEach(function (ix, i) {
      var kindName = (IX_KINDS.filter(function (x) { return x.v === ix.kind; })[0] || { n: ix.kind }).n;
      var row = node('div', 'mcflow__st');
      row.innerHTML = '<span class="mcflow__no">' + pad2(i + 1) + '</span>' +
        '<span class="mcflow__bd"><b>' + esc(ix.label || kindName) + '</b><i>' + esc(kindName) + ' · 归属 ' + esc(ix.owner || '值班工程师') + ' · 超时 ' + (ix.timeoutS || 300) + 's</i></span>' +
        '<span class="mcflow__kind">HUMAN</span>' +
        '<span class="mcflow__ops"><button type="button" class="mcbtn mcbtn--sm mcbtn--danger" data-fx="subtle" data-remove-ix="' + ix.id + '" aria-label="移除人机交互">移除</button></span>';
      host.appendChild(row);
    });
  }

  function renderLogRows() {
    var host = $('#fLogBody');
    if (!host) return;
    var list = SEL.logsFiltered();
    var cnt = $('#fLogCount');
    if (cnt) cnt.textContent = list.length + ' / ' + S.logs.length + ' 条 · 待人工 ' + SEL.kpis().pendingHuman;
    host.innerHTML = '';
    list.slice(0, 160).forEach(function (l) {
      var row = node('div', 'mclog__row');
      row.dataset.logId = l.id;
      var ixPending = l.interaction && l.interaction.status === 'pending';
      var hd = node('button', 'mclog__hd');
      hd.type = 'button';
      hd.dataset.logToggle = l.id;
      hd.dataset.fx = 'subtle';
      hd.setAttribute('aria-expanded', 'false');
      hd.setAttribute('aria-label', '展开 ' + l.method + ' ' + l.path + ' 的报文');
      hd.innerHTML =
        '<span class="mclog__time">' + esc(l.clock) + '</span>' +
        '<span class="mclog__m">' + esc(l.method) + '</span>' +
        '<span class="mclog__p">' + esc(l.path) + '</span>' +
        '<span class="mclog__st ' + statusCls(l.status) + '">' + l.status + '</span>' +
        '<span class="mclog__lat">' + l.latencyMs + 'ms</span>';
      row.appendChild(hd);

      var bd = node('div', 'mclog__bd');
      bd.hidden = true;
      bd.innerHTML =
        '<div><small class="mcrule-hint">REQUEST</small><pre class="mcpre">' + esc(JSON.stringify(l.req, null, 2)) + '</pre></div>' +
        '<div><small class="mcrule-hint">RESPONSE</small><pre class="mcpre">' + esc(JSON.stringify(l.res, null, 2)) + '</pre></div>' +
        '<div><small class="mcrule-hint">命中说明 / VERDICT</small>' +
          '<p class="mcdt__note" style="margin:6px 0">' + esc(l.verdict || '—') + ' · 网元 ' + esc(l.ne) + ' · 端口 ' + esc((SEL.port(l.portId) || {}).port || l.portId) + '</p>' +
          '<div class="mcnotes">' + notesHTML(l) + '</div>' +
          '<div class="mcrow" style="margin-top:10px">' +
            '<button type="button" class="mcbtn mcbtn--sm" data-fx="subtle" data-replay="' + l.id + '">重放</button>' +
            (ixPending ? '<button type="button" class="mcbtn mcbtn--sm" data-fx="standard" data-ix="approve" data-log="' + l.id + '">放行</button>' +
                         '<button type="button" class="mcbtn mcbtn--sm mcbtn--danger" data-fx="subtle" data-ix="reject" data-log="' + l.id + '">拒绝</button>' : '') +
            (l.interaction ? '<span class="mcbadge' + (ixPending ? ' mcbadge--warn' : ' mcbadge--ok') + '">' + (ixPending ? '等待人工' : esc(l.interaction.status)) + '</span>' : '') +
          '</div>' +
        '</div>';
      row.appendChild(bd);
      host.appendChild(row);
    });
    if (!list.length) host.appendChild(node('p', 'mcdt__note', '当前过滤条件下没有记录。'));
  }

  function notesHTML(l) {
    var notes = (l.res && l.res.notes) || [];
    if (!notes.length) return '<span class="mcrule-hint">该次请求没有字段级规则说明（兜底分支）。</span>';
    return notes.map(function (n) {
      var m = ruleMeta(n.rule);
      return '<div class="mcnote"><b>' + esc(n.key) + '</b><i>' + esc(m.name) + ' · ' + esc(n.note) + '</i><span>' + esc(n.value) + '</span></div>';
    }).join('');
  }

  /* ================================================================= 03 NE */
  function renderNe() {
    var groups = S.groups.concat([{ id: '', name: '未成组', desc: '尚未分配网元组', members: S.nes.filter(function (n) { return !n.group; }).map(function (n) { return n.id; }), strategy: '—' }]);
    var cols = groups.map(function (g) {
      var members = S.nes.filter(function (n) { return (g.id ? n.group === g.id : !n.group); });
      var cards = members.map(function (n) {
        return {
          code: n.code, title: n.name, sub: n.neId + ' · ' + n.version, neId: n.id,
          phase: (n.version.charCodeAt(0) % 9) / 9, spark: n.status === '升级中',
          meta: ['<span class="mcard__tag">' + esc(n.type.split('（')[0]) + '</span>',
                 '<span class="mcard__tag">' + esc(n.arch) + '</span>',
                 '<span class="mcard__tag ' + (n.status === '在线' ? 'mcard__tag--ok' : n.status === '升级中' ? 'mcard__tag--accent' : 'mcard__tag--warn') + '">' + esc(n.status) + '</span>']
        };
      });
      return {
        key: g.id || '__none', en: g.id ? 'GROUP' : 'UNGROUPED',
        name: g.name, sub: members.length + ' 个网元 · ' + (g.strategy || '—'),
        cards: cards, fill: 6
      };
    });
    cols.forEach(function (col, i) {
      (col.cards || []).forEach(function (c, j) { if (c.neId === S.sel.neId) { S.sel.ne[0] = i; S.sel.ne[1] = j; } });
    });
    COLS.ne = cols;
    renderCar('ne');

    var ne = MP.byId(S.nes, S.sel.neId) || S.nes[0];
    var det = $('#neDetail');
    if (!ne) { det.innerHTML = '<div class="mcdt__blk"><p class="mcdt__note">还没有网元。</p></div>'; return; }

    det.innerHTML =
      /* ---- 属性 / 架构 / 类型 + 版本 / 软件名 / 旧版本 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>网元属性</h2><small>ABOUT / ARCH / TYPE</small>' +
          '<span class="mcbadge mcbadge--accent">' + esc(ne.neId) + '</span></div>' +
        '<div class="mcdt__cols">' +
          '<div class="mcfld"><label for="nName">名称</label><input class="mcin" id="nName" data-fkey="nName" value="' + esc(ne.name) + '" /></div>' +
          '<div class="mcfld"><label for="nNeId">网元编号</label><input class="mcin" id="nNeId" data-fkey="nNeId" value="' + esc(ne.neId) + '" />' +
            '<span class="mcfld__err" id="nNeIdErr"></span></div>' +
          '<div class="mcfld"><label for="nType">类型</label><select class="mcsel" id="nType" data-fkey="nType">' + opts(S.neTypes, ne.type) + '</select></div>' +
          '<div class="mcfld"><label for="nArch">架构</label><select class="mcsel" id="nArch" data-fkey="nArch">' + opts(S.arches, ne.arch) + '</select></div>' +
          '<div class="mcfld"><label for="nVendor">厂商</label><select class="mcsel" id="nVendor" data-fkey="nVendor">' + opts(S.vendors, ne.vendor) + '</select></div>' +
          '<div class="mcfld"><label for="nGroup">网元组</label><select class="mcsel" id="nGroup" data-fkey="nGroup">' +
            '<option value="">未成组</option>' + S.groups.map(function (g) { return '<option value="' + g.id + '"' + (ne.group === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') +
          '</select><span class="mcfld__hint">切换即等同组成员的重新分配。</span></div>' +
        '</div>' +
        '<div class="mcdt__cols" style="margin-top:16px">' +
          '<div class="mcfld"><label for="nVer">版本</label><input class="mcin" id="nVer" data-fkey="nVer" value="' + esc(ne.version) + '" />' +
            '<span class="mcfld__err" id="nVerErr"></span></div>' +
          '<div class="mcfld"><label for="nSoft">使用软件名称</label><input class="mcin" id="nSoft" data-fkey="nSoft" value="' + esc(ne.softName) + '" /></div>' +
          '<div class="mcfld"><label for="nOld">旧版本（逗号分隔）</label><input class="mcin" id="nOld" data-fkey="nOld" value="' + esc((ne.oldVersions || []).join(', ')) + '" />' +
            '<span class="mcfld__hint">升级回滚点的候选来源。</span></div>' +
          '<div class="mcfld"><label for="nStatus">运行状态</label><select class="mcsel" id="nStatus" data-fkey="nStatus">' + opts(['在线', '离线', '升级中', '未注册'], ne.status) + '</select></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="nSave" data-fx="standard" data-act="save-ne"><span class="mx-hold__label">保存网元属性</span></button>' +
          '<button type="button" class="mcbtn" id="nNew" data-fx="standard">+ 新建网元</button>' +
          '<button type="button" class="mcbtn" id="nCopy" data-fx="subtle">复制当前网元</button>' +
          '<span class="mcrule-hint" id="nCopyHint">复制会自动递增编号。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 升级流程 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>升级流程步骤</h2><small>UPGRADE FLOW / AUTO · MANUAL · HUMAN</small>' +
          '<span class="mcrule-hint">' + ne.upgrade.length + ' 步 · 含人机交互 ' + ne.upgrade.filter(function (s) { return s.kind === 'human'; }).length + ' 步</span></div>' +
        '<div class="mcflow" id="nFlow"></div>' +
        '<div class="mcdt__cols" style="margin-top:14px">' +
          '<div class="mcfld"><label for="nStepName">新步骤名称</label><input class="mcin" id="nStepName" data-fkey="nStepName" placeholder="例如：业务验证" /></div>' +
          '<div class="mcfld"><label for="nStepKind">步骤类型</label><select class="mcsel" id="nStepKind" data-fkey="nStepKind">' +
            '<option value="auto">自动</option><option value="manual">手动</option><option value="human">人工（人机交互）</option></select></div>' +
          '<div class="mcfld"><label for="nStepDur">预计耗时（秒）</label><input class="mcin" id="nStepDur" data-fkey="nStepDur" value="30" inputmode="numeric" /></div>' +
          '<div class="mcfld"><label for="nStepOwner">人机交互归属</label><input class="mcin" id="nStepOwner" data-fkey="nStepOwner" value="值班工程师" /></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcbtn mcbtn--accent" id="nStepAdd" data-fx="subtle">+ 追加步骤</button>' +
          '<button type="button" class="mcact" id="nRun" data-fx="standard"><span class="mx-hold__label">按住执行升级</span></button>' +
          '<span id="nRunBox" class="mcrule-hint"></span>' +
        '</div>' +
      '</section>' +

      /* ---- 参数校验 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>参数校验</h2><small>VALIDATION / RULE + RESULT</small>' +
          '<span id="nValSummary" class="mcrule-hint">—</span></div>' +
        '<div class="mcvals" id="nValList"></div>' +
        '<div class="mcdt__cols" style="margin-top:14px">' +
          '<div class="mcfld"><label for="nValField">校验字段</label><select class="mcsel" id="nValField" data-fkey="nValField">' +
            opts(['neId', 'name', 'version', 'arch', 'vendor', 'softName'], 'neId') + '</select></div>' +
          '<div class="mcfld"><label for="nValRule">正则规则</label><input class="mcin" id="nValRule" data-fkey="nValRule" value="^' + esc(ne.code) + '-[A-Z]{2}-\\d{4}$" />' +
            '<span class="mcfld__err" id="nValRuleErr"></span></div>' +
          '<div class="mcfld"><label for="nValLevel">级别</label><select class="mcsel" id="nValLevel" data-fkey="nValLevel">' + opts(['错误', '警告', '提示'], '错误') + '</select></div>' +
          '<div class="mcfld"><label for="nValMsg">失败提示</label><input class="mcin" id="nValMsg" data-fkey="nValMsg" value="网元编号需符合 区域-四位序号" /></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcbtn" id="nValAdd" data-fx="subtle">+ 新增规则</button>' +
          '<button type="button" class="mcact" id="nValRun" data-fx="standard"><span class="mx-hold__label">执行参数校验</span></button>' +
        '</div>' +
      '</section>';

    /* 步骤链 */
    renderNeFlow(ne);
    renderNeVal(ne);

    /* 保存 */
    $('#nSave').addEventListener('click', function () {
      var ok = true;
      if (!/^[A-Z]{2,4}-[A-Z]{2}-\d{4}$/.test($('#nNeId').value.trim())) { fieldErr('nNeId', '编号形如 GNB-HZ-0001（大写代码-区号-四位）'); ok = false; } else fieldErr('nNeId', '');
      if (!/^\d+\.\d+(\.\d+)?$/.test($('#nVer').value.trim())) { fieldErr('nVer', '版本形如 7.2.0'); ok = false; } else fieldErr('nVer', '');
      if (!ok) return;
      A.updateNE(ne.id, {
        name: $('#nName').value.trim(), neId: $('#nNeId').value.trim(), type: $('#nType').value,
        arch: $('#nArch').value, vendor: $('#nVendor').value, version: $('#nVer').value.trim(),
        softName: $('#nSoft').value.trim(), status: $('#nStatus').value,
        oldVersions: $('#nOld').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      });
      if ($('#nGroup').value !== ne.group) A.assignGroup(ne.id, $('#nGroup').value);
      toast('网元属性已保存', ne.neId + ' · ' + ne.arch, { tone: 'ok', duration: 2600 });
    });

    /* 新建 / 复制 */
    $('#nNew').addEventListener('click', function () {
      var self = this;
      var done = MP.btn.loading(self, '创建中');
      setTimeout(function () {
        var n = A.addNE({
          name: '新建网元 ' + pad2(S.nes.length + 1), code: 'GNB', type: S.neTypes[0],
          arch: S.arches[0], vendor: S.vendors[0], version: '7.0.0', group: S.groups[0] ? S.groups[0].id : ''
        });
        done();
        S.sel.neId = n.id;
        toast('已新建网元', n.neId + ' · 记得配置升级流程', { tone: 'ok', duration: 2800 });
      }, 420);
    });
    $('#nCopy').addEventListener('click', function () {
      var c = A.copyNE(ne.id);
      if (!c) return;
      S.sel.neId = c.id;
      toast('已复制网元', ne.name + ' → ' + c.name + '（' + c.neId + '）', {
        tone: 'ok', duration: 4200, actionLabel: '撤销复制',
        onAction: function () {
          A.updateNE(c.id, { status: '未注册' });
          toast('副本已标记为未注册', '可以在列表里继续改属性，或直接忽略它', { duration: 2600 });
        }
      });
    });

    /* 追加步骤 */
    $('#nStepAdd').addEventListener('click', function () {
      A.addUpgradeStep(ne.id, {
        name: $('#nStepName').value.trim() || '新步骤', kind: $('#nStepKind').value,
        durationS: parseInt($('#nStepDur').value, 10) || 30, owner: $('#nStepOwner').value.trim()
      });
      renderNeFlow(MP.byId(S.nes, ne.id));
      toast('已追加升级步骤', $('#nStepKind').value === 'human' ? '该步骤会插入人机交互' : '顺序按追加排列，可上下移动', { duration: 2600 });
    });

    /* 执行升级：holdConfirm + gauge + statusMark */
    var runBox = $('#nRunBox');
    X.holdConfirm($('#nRun'), {
      duration: 1200, label: '按住执行升级', doneLabel: '升级已开始', resetAfter: 1200,
      onConfirm: function () {
        runUpgrade(MP.byId(S.nes, ne.id), runBox);
      }
    });

    /* 参数校验 */
    $('#nValAdd').addEventListener('click', function () {
      var rule = $('#nValRule').value.trim();
      var ok = true;
      try { new RegExp(rule); } catch (e) { ok = false; }
      if (!ok) { fieldErr('nValRule', '正则表达式无法编译，检查括号与转义'); return; }
      fieldErr('nValRule', '');
      A.addValidation(ne.id, { field: $('#nValField').value, rule: rule, level: $('#nValLevel').value, message: $('#nValMsg').value.trim() });
      renderNeVal(MP.byId(S.nes, ne.id));
      toast('已新增校验规则', $('#nValField').value + ' · ' + $('#nValLevel').value, { duration: 2600 });
    });
    $('#nValRun').addEventListener('click', function () {
      var self = this;
      var done = MP.btn.loading(self, '校验中');
      var host = node('span', 'mcrule-hint');
      self.parentNode.insertBefore(host, self.nextSibling);
      var lx = X.latticeLoader(host, { label: '逐条执行正则校验', size: 9 });
      setTimeout(function () {
        var results = A.runValidation(ne.id);
        var pass = results.filter(function (r) { return r.pass; }).length;
        lx.done('完成 ' + pass + '/' + results.length);
        done();
        paintValResults(ne, results);
        toast('参数校验完成', pass + ' / ' + results.length + ' 条通过', { tone: pass === results.length ? 'ok' : 'warn', duration: 3000 });
        setTimeout(function () { if (lx && lx.stop) lx.stop(); }, 1600);
      }, 780);
    });

    wireA11y(det);
  }

  function renderNeFlow(ne) {
    var host = $('#nFlow');
    if (!host) return;
    host.innerHTML = '';
    ne.upgrade.forEach(function (s, i) {
      var kindName = s.kind === 'auto' ? '自动' : s.kind === 'manual' ? '手动' : '人工 / 人机交互';
      var row = node('div', 'mcflow__st');
      row.innerHTML = '<span class="mcflow__no">' + pad2(i + 1) + '</span>' +
        '<span class="mcflow__bd"><b>' + esc(s.name) + '</b><i>' + kindName + (s.durationS ? ' · 预计 ' + s.durationS + 's' : '') +
          (s.kind === 'human' && s.interaction ? ' · 归属 ' + esc(s.interaction.owner) + ' · 超时 ' + s.interaction.timeoutS + 's' : '') + '</i></span>' +
        '<span class="mcflow__kind">' + s.kind.toUpperCase() + '</span>' +
        '<span class="mcflow__ops">' +
          '<button type="button" class="mcbtn mcbtn--sm" data-fx="subtle" data-step-up="' + s.id + '" aria-label="上移步骤 ' + esc(s.name) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="mcbtn mcbtn--sm" data-fx="subtle" data-step-down="' + s.id + '" aria-label="下移步骤 ' + esc(s.name) + '"' + (i === ne.upgrade.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="mcbtn mcbtn--sm mcbtn--danger" data-fx="subtle" data-step-del="' + s.id + '" aria-label="删除步骤 ' + esc(s.name) + '">×</button>' +
        '</span>';
      host.appendChild(row);
    });
  }

  function renderNeVal(ne) {
    var host = $('#nValList');
    if (!host) return;
    host.innerHTML = '';
    (ne.validations || []).forEach(function (v) {
      var row = node('div', 'mcval');
      row.dataset.vid = v.id;
      row.innerHTML = '<span class="mcval__lv">' + (v.level === '错误' ? '✕' : '!') + '</span>' +
        '<span class="mcval__bd"><b>' + esc(v.field) + '</b><i>' + esc(v.rule) + ' · ' + esc(v.message) + '</i></span>' +
        '<span class="mcval__lv">' + esc(v.level) + '</span>';
      host.appendChild(row);
    });
    if (!(ne.validations || []).length) host.appendChild(node('p', 'mcdt__note', '还没有校验规则。'));
    var sum = $('#nValSummary');
    if (sum) sum.textContent = (ne.validations || []).length + ' 条规则 · 最近一次未执行';
  }

  function paintValResults(ne, results) {
    var host = $('#nValList');
    if (!host) return;
    $$('.mcval', host).forEach(function (row) {
      var r = results.filter(function (x) { return x.id === row.dataset.vid; })[0];
      if (!r) return;
      row.classList.toggle('is-pass', r.pass);
      row.classList.toggle('is-fail', !r.pass);
      var lv = row.querySelector('.mcval__lv:last-child');
      if (lv) lv.textContent = r.pass ? '通过' : r.level;
      var i = row.querySelector('.mcval__bd i');
      if (i) i.textContent = r.message;
    });
    var sum = $('#nValSummary');
    var pass = results.filter(function (r) { return r.pass; }).length;
    if (sum) sum.textContent = pass + ' / ' + results.length + ' 条通过';
  }

  /* 升级执行：gauge + statusMark + latticeLoader 的全过程 */
  var upTimer = null;
  function runUpgrade(ne, host) {
    if (upTimer) clearInterval(upTimer);
    host.innerHTML = '<span id="nGaugeHost"></span><span id="nRunMark"></span>';
    var gauge = X.gauge($('#nGaugeHost'), { value: 0, unit: '%', label: '升级进度' });
    var mark = X.statusMark($('#nRunMark'), { state: 'working', label: '步骤 1 / ' + ne.upgrade.length });
    var steps = ne.upgrade;
    var i = 0, pct = 0;
    upTimer = setInterval(function () {
      pct += 6 + Math.random() * 7;
      if (pct >= 100) {
        pct = 0; i++;
        if (i >= steps.length) {
          clearInterval(upTimer); upTimer = null;
          gauge.set(100); mark.set('done', '升级完成 · ' + steps.length + ' 步');
          A.updateNE(ne.id, { version: bumpVersion(ne.version), status: '在线', oldVersions: [bumpVersion(ne.version)].concat(ne.oldVersions || []) });
          toast('升级流程执行完成', ne.neId + ' → ' + bumpVersion(ne.version), { tone: 'ok', duration: 4200 });
          MP.sfx.play('confirm');
          return;
        }
        if (steps[i].kind === 'human') {
          mark.set('working', '等待人工：' + steps[i].name);
          MP.sfx.play('warn');
          /* 人机交互：暂停在这里，等用户放行 */
          clearInterval(upTimer); upTimer = null;
          var gate = node('button', 'mcbtn mcbtn--sm', '放行并继续');
          gate.type = 'button'; gate.dataset.fx = 'standard';
          gate.addEventListener('click', function () {
            gate.remove();
            mark.set('working', '已放行 · ' + steps[i].name);
            i++;
            resumeUpgrade(steps, i, gauge, mark, ne);
          });
          host.appendChild(gate);
          toast('升级停在人机交互步骤', steps[i].name + ' · 点「放行并继续」', { tone: 'warn', duration: 6000 });
          return;
        }
        mark.set('working', '步骤 ' + (i + 1) + ' / ' + steps.length + ' · ' + steps[i].name);
      }
      gauge.set(Math.min(100, pct));
    }, 260);
  }
  function resumeUpgrade(steps, i, gauge, mark, ne) {
    var pct = 0;
    upTimer = setInterval(function () {
      pct += 6 + Math.random() * 7;
      gauge.set(Math.min(100, pct));
      if (pct >= 100) {
        i++;
        if (i >= steps.length) {
          clearInterval(upTimer); upTimer = null;
          gauge.set(100); mark.set('done', '升级完成 · ' + steps.length + ' 步');
          A.updateNE(ne.id, { version: bumpVersion(ne.version), status: '在线' });
          toast('升级流程执行完成', ne.neId + ' → ' + bumpVersion(ne.version), { tone: 'ok', duration: 4000 });
          return;
        }
        mark.set('working', '步骤 ' + (i + 1) + ' / ' + steps.length + ' · ' + steps[i].name);
        pct = 0;
      }
    }, 220);
  }
  function bumpVersion(v) {
    var p = String(v).split('.');
    if (p.length < 3) return v;
    p[2] = String((parseInt(p[2], 10) || 0) + 1);
    return p.join('.');
  }

  /* ================================================================ 04 OMP */
  function renderOmp() {
    var cols = [
      { key: 'ne', en: 'MANAGED NE', name: '受管网元', sub: S.nes.length + ' 个 · ' + S.groups.length + ' 个组', cards: [], fill: 6 },
      { key: 'grp', en: 'NE GROUP', name: '网元组', sub: S.groups.length + ' 组', cards: [], fill: 6 },
      { key: 'acct', en: 'ACCOUNT', name: '账号', sub: S.accounts.length + ' 个账号', cards: [], fill: 6 },
      { key: 'task', en: 'TASK', name: '一体化升级任务', sub: S.tasks.length + ' 个任务', cards: [], fill: 6 },
      { key: 'site', en: 'SITE', name: '站点', sub: S.sites.length + ' 个站点', cards: [], fill: 6 }
    ];
    S.nes.forEach(function (n) {
      cols[0].cards.push({
        code: n.code, title: n.name, sub: n.neId, neId: n.id,
        meta: ['<span class="mcard__tag">' + esc(groupName(n.group)) + '</span>',
               '<span class="mcard__tag ' + (n.status === '在线' ? 'mcard__tag--ok' : 'mcard__tag--warn') + '">' + esc(n.status) + '</span>']
      });
    });
    S.groups.forEach(function (g) {
      cols[1].cards.push({
        code: 'GRP', title: g.name, sub: g.desc, grpId: g.id,
        meta: ['<span class="mcard__tag">' + g.members.length + ' 成员</span>', '<span class="mcard__tag">' + esc(g.strategy) + '</span>']
      });
    });
    S.accounts.forEach(function (a) {
      cols[2].cards.push({
        code: 'ACC', title: a.name, sub: a.role + ' · ' + a.scope.length + ' 个范围', accId: a.id,
        meta: ['<span class="mcard__tag ' + (a.status === '启用' ? 'mcard__tag--ok' : 'mcard__tag--danger') + '">' + esc(a.status) + '</span>',
               '<span class="mcard__tag">' + a.nes.length + ' 网元</span>']
      });
    });
    S.tasks.forEach(function (t) {
      cols[3].cards.push({
        code: 'TSK', title: t.name, sub: t.site + ' · ' + t.createdAt, taskId: t.id, spark: t.status === 'running',
        meta: ['<span class="mcard__tag ' + (t.status === 'done' ? 'mcard__tag--ok' : t.status === 'waiting-human' ? 'mcard__tag--warn' : 'mcard__tag--accent') + '">' + esc(t.status) + '</span>',
               '<span class="mcard__tag">' + t.progress + '%</span>']
      });
    });
    S.sites.forEach(function (s) {
      cols[4].cards.push({
        code: s.region.split('-')[1], title: s.name, sub: s.role + ' · ' + s.region, siteId: s.id,
        meta: ['<span class="mcard__tag">CPU ' + s.cpu + '</span>']
      });
    });
    COLS.omp = cols;
    renderCar('omp');

    var det = $('#ompDetail');
    var d = S.deploy.omp;
    det.innerHTML =
      /* ---- 受管网元与组 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>平台所管理的网元与网元组</h2><small>MANAGED NE / GROUP</small>' +
          '<span class="mcbadge">' + esc(d.version) + '</span></div>' +
        '<div class="mctbl-wrap"><table class="mctbl"><caption>受管网元清单（共 ' + S.nes.length + ' 个）</caption>' +
          '<thead><tr><th scope="col">网元</th><th scope="col">编号</th><th scope="col">组</th><th scope="col">归属站点</th><th scope="col">状态</th></tr></thead><tbody>' +
          S.nes.map(function (n, i) {
            return '<tr><td>' + esc(n.name) + '</td><td class="mcmono">' + esc(n.neId) + '</td>' +
              '<td><select class="mcsel" data-omp-group="' + n.id + '" aria-label="' + esc(n.name) + ' 的网元组">' +
              '<option value="">未成组</option>' +
              S.groups.map(function (g) { return '<option value="' + g.id + '"' + (n.group === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') +
              '</select></td>' +
              '<td>' + esc(S.sites[i % S.sites.length].name) + '</td>' +
              '<td><span class="mcbadge' + (n.status === '在线' ? ' mcbadge--ok' : ' mcbadge--warn') + '">' + esc(n.status) + '</span></td></tr>';
          }).join('') +
          '</tbody></table></div>' +
        '<div class="mcdt__cols" style="margin-top:14px">' +
          '<div class="mcfld"><label for="oGrpName">新建网元组名称</label><input class="mcin" id="oGrpName" data-fkey="oGrpName" placeholder="例如：杭州基站组" /></div>' +
          '<div class="mcfld"><label for="oGrpDesc">组说明</label><input class="mcin" id="oGrpDesc" data-fkey="oGrpDesc" placeholder="同架构同版本批量升级" /></div>' +
          '<div class="mcfld"><label for="oGrpStrat">组策略</label><select class="mcsel" id="oGrpStrat" data-fkey="oGrpStrat">' +
            opts(['串行 · 每台间隔 60s', '并行 · 保留备用', '串行 · 失败即停'], '串行 · 每台间隔 60s') + '</select></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<button type="button" class="mcbtn" id="oGrpAdd" data-fx="subtle">+ 创建网元组</button>' +
          '<span class="mcrule-hint">选择组即把该网元重新分配到新组。</span>' +
        '</div>' +
        '<div class="mcflow" id="oTaskList" style="margin-top:16px"></div>' +
      '</section>' +

      /* ---- 账号管理 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>账号管理</h2><small>ACCOUNT / SCOPE</small>' +
          '<span class="mcrule-hint">' + S.accounts.length + ' 个账号</span></div>' +
        '<div class="mctbl-wrap"><table class="mctbl"><caption>账号与其网元范围</caption>' +
          '<thead><tr><th scope="col">账号</th><th scope="col">角色</th><th scope="col">网元范围</th><th scope="col">创建时间</th><th scope="col">启停</th></tr></thead><tbody id="oAcctBody"></tbody></table></div>' +
        '<div class="mcdt__cols" style="margin-top:14px">' +
          '<div class="mcfld"><label for="oAcName">账号名</label><input class="mcin" id="oAcName" data-fkey="oAcName" placeholder="例如：ops_hz" />' +
            '<span class="mcfld__err" id="oAcNameErr"></span></div>' +
          '<div class="mcfld"><label for="oAcRole">角色</label><select class="mcsel" id="oAcRole" data-fkey="oAcRole">' +
            opts(['升级操作员', '只读审计', '平台管理员', '值班工程师'], '升级操作员') + '</select></div>' +
          '<div class="mcfld"><label for="oAcScope">网元范围（组）</label><select class="mcsel" id="oAcScope" data-fkey="oAcScope">' +
            S.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="mcfld"><label for="oAcNes">额外网元范围（可多选）</label><select class="mcsel" id="oAcNes" data-fkey="oAcNes" multiple size="4">' +
            S.nes.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<button type="button" class="mcact" id="oAcAdd" data-fx="standard"><span class="mx-hold__label">创建账号</span></button>' +
          '<span class="mcrule-hint">创建后账号立即可用，可随时启停。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 一体化升级任务 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>创建一体化升级任务并关联站点</h2><small>INTEGRATED TASK / SITE</small>' +
          '<span class="mcrule-hint">进行中 ' + SEL.kpis().tasks + ' 个</span></div>' +
        '<div class="mcdt__cols">' +
          '<div class="mcfld"><label for="oTkName">任务名称</label><input class="mcin" id="oTkName" data-fkey="oTkName" placeholder="例如：杭州基站组 一体化升级" />' +
            '<span class="mcfld__err" id="oTkNameErr"></span></div>' +
          '<div class="mcfld"><label for="oTkSite">关联站点</label><select class="mcsel" id="oTkSite" data-fkey="oTkSite">' +
            S.sites.map(function (s) { return '<option value="' + s.name + '">' + esc(s.name) + ' · ' + esc(s.role) + '</option>'; }).join('') + '</select></div>' +
          '<div class="mcfld"><label for="oTkOwner">执行人</label><select class="mcsel" id="oTkOwner" data-fkey="oTkOwner">' +
            S.accounts.map(function (a) { return '<option value="' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="mcfld"><label for="oTkNes">关联网元（可多选）</label><select class="mcsel" id="oTkNes" data-fkey="oTkNes" multiple size="4">' +
            S.nes.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + ' · ' + esc(n.version) + '</option>'; }).join('') + '</select>' +
            '<span class="mcfld__err" id="oTkNesErr"></span></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:12px">' +
          '<button type="button" class="mcact" id="oTkAdd" data-fx="standard"><span class="mx-hold__label">创建任务</span></button>' +
          '<button type="button" class="mcbtn" id="oCoDeploy" data-fx="none">共部署</button>' +
          '<span class="mcrule-hint">共部署 = 与生命周期平台复用同一端口 ' + esc(d.host) + '。</span>' +
        '</div>' +
      '</section>';

    renderOmpTasks();
    renderAcctBody();
    paintCoDeploySwitches();

    $('#oGrpAdd').addEventListener('click', function () {
      var name = $('#oGrpName').value.trim();
      if (!name) { toast('组名称不能为空', '例如「杭州基站组」', { tone: 'warn', duration: 2600 }); return; }
      A.addGroup({ name: name, desc: $('#oGrpDesc').value.trim(), strategy: $('#oGrpStrat').value });
      $('#oGrpName').value = '';
      toast('已创建网元组', name, { tone: 'ok', duration: 2600 });
    });

    $('#oAcAdd').addEventListener('click', function () {
      var name = $('#oAcName').value.trim();
      if (!/^[A-Za-z0-9_.-]{3,}$/.test(name)) { fieldErr('oAcName', '账号名至少 3 位，只用字母数字与 _ . -'); return; }
      fieldErr('oAcName', '');
      var self = this;
      var done = MP.btn.loading(self, '创建中');
      setTimeout(function () {
        var scope = $('#oAcScope').value ? [$('#oAcScope').value] : [];
        var nes = $$('#oAcNes option').filter(function (o) { return o.selected; }).map(function (o) { return o.value; });
        A.createAccount({ name: name, role: $('#oAcRole').value, scope: scope, nes: nes });
        done();
        $('#oAcName').value = '';
        toast('已创建账号 ' + name, $('#oAcRole').value + ' · 范围 ' + (scope.length + nes.length) + ' 项',
          { tone: 'ok', duration: 4200, actionLabel: '撤销创建', onAction: function () { toast('账号保留但已停用', '可在表格里重新启用', { duration: 2600 }); } });
      }, 460);
    });

    $('#oTkAdd').addEventListener('click', function () {
      var name = $('#oTkName').value.trim();
      var nes = $$('#oTkNes option').filter(function (o) { return o.selected; }).map(function (o) { return o.value; });
      var ok = true;
      if (!name) { fieldErr('oTkName', '任务名称不能为空'); ok = false; } else fieldErr('oTkName', '');
      if (!nes.length) { fieldErr('oTkNes', '至少选择一个网元，否则任务没有执行对象'); ok = false; } else fieldErr('oTkNes', '');
      if (!ok) return;
      var self = this;
      var done = MP.btn.loading(self, '下发中');
      setTimeout(function () {
        A.createTask({ name: name, site: $('#oTkSite').value, neIds: nes, owner: $('#oTkOwner').value });
        done();
        $('#oTkName').value = '';
        toast('一体化升级任务已创建', name + ' · 站点 ' + $('#oTkSite').value, { tone: 'ok', duration: 3600 });
      }, 520);
    });

    wireA11y(det);
  }

  function renderOmpTasks() {
    var host = $('#oTaskList');
    if (!host) return;
    host.innerHTML = '<span class="mcrule-hint">进行中与最近的一体化任务</span>';
    S.tasks.forEach(function (t, i) {
      var row = node('div', 'mcflow__st');
      row.innerHTML = '<span class="mcflow__no">' + pad2(i + 1) + '</span>' +
        '<span class="mcflow__bd"><b>' + esc(t.name) + '</b><i>' + esc(t.site) + ' · ' + esc(t.owner) + ' · ' + t.createdAt +
          ' · 步骤 ' + t.steps.filter(function (s) { return s.state === 'done'; }).length + '/' + t.steps.length + '</i></span>' +
        '<span class="mcflow__kind">' + esc(t.status) + '</span>' +
        '<span class="mcflow__ops"><span class="mcrule-hint mcmono">' + t.progress + '%</span>' +
          '<button type="button" class="mcbtn mcbtn--sm" data-fx="subtle" data-task-adv="' + t.id + '">推进</button>' +
          '<span data-task-gauge="' + t.id + '"></span></span>';
      host.appendChild(row);
      var g = X.gauge(row.querySelector('[data-task-gauge]'), { value: t.progress, unit: '%', label: t.name + ' 进度' });
      g.set(t.progress);
    });
  }

  function renderAcctBody() {
    var body = $('#oAcctBody');
    if (!body) return;
    body.innerHTML = '';
    S.accounts.forEach(function (a) {
      var tr = node('tr');
      tr.innerHTML = '<td>' + esc(a.name) + '</td><td>' + esc(a.role) + '</td>' +
        '<td>' + esc(a.scope.map(groupName).join('、') || '—') + (a.nes.length ? ' + ' + a.nes.length + ' 台网元' : '') + '</td>' +
        '<td class="mcmono">' + esc(a.createdAt) + '</td>' +
        '<td><span data-acct-sw="' + a.id + '"></span></td>';
      body.appendChild(tr);
      X.velocitySwitch(tr.querySelector('[data-acct-sw]'), {
        checked: a.status === '启用', label: a.name + ' 账号启停',
        onChange: function (v) {
          A.toggleAccount(a.id);
          toast(a.name + (v ? ' 已启用' : ' 已停用'), v ? '可以继续下发任务' : '该账号的令牌立即失效', { tone: v ? 'ok' : 'warn', duration: 2600 });
        }
      });
    });
  }

  function paintCoDeploySwitches() {
    var host = $('#oCoDeploy');
    if (!host) return;
    host.innerHTML = '';
    var box = node('span');
    host.appendChild(node('span', 'mcrule-hint', '共部署'));
    host.appendChild(box);
    X.velocitySwitch(box, {
      checked: S.deploy.omp.coDeploy, label: '网元管理平台共部署',
      onChange: function (v) {
        A.toggleCoDeploy('omp');
        toast(v ? '已开启共部署' : '已关闭共部署', v ? '与生命周期平台复用端口 ' + S.deploy.omp.host : '两个平台改用各自端口', { tone: v ? 'ok' : 'warn', duration: 3000 });
      }
    });
  }

  /* ================================================================ 05 LCM */
  function renderLcm() {
    var byType = {};
    S.packages.forEach(function (p) { (byType[p.type] = byType[p.type] || []).push(p); });
    var cols = [];
    Object.keys(byType).forEach(function (type) {
      var list = byType[type];
      cols.push({
        key: type, en: 'PACKAGE TYPE', name: type + ' 包', sub: list.length + ' 个软件包',
        cards: list.map(function (p) {
          var ne = MP.byId(S.nes, p.ne);
          return {
            code: p.vendor.slice(0, 2), title: p.name, sub: (ne ? ne.name : '平台级') + ' · v' + p.version, pkgId: p.id,
            phase: (p.sizeMB % 100) / 100, spark: p.validated,
            meta: ['<span class="mcard__tag ' + (p.validated ? 'mcard__tag--ok' : 'mcard__tag--warn') + '">' + (p.validated ? '已校验' : '待校验') + '</span>',
                   '<span class="mcard__tag">' + p.sizeMB + 'MB</span>',
                   '<span class="mcard__tag">' + esc(p.vendor) + '</span>']
          };
        }), fill: 5
      });
    });
    cols.push({
      key: 'ne', en: 'MANAGED NE', name: '受管网元', sub: S.nes.length + ' 个',
      cards: S.nes.map(function (n) {
        return { code: n.code, title: n.name, sub: n.softName, neId: n.id, meta: ['<span class="mcard__tag">v' + esc(n.version) + '</span>', '<span class="mcard__tag">' + esc(n.arch) + '</span>'] };
      }), fill: 6
    });
    COLS.lcm = cols;
    renderCar('lcm');

    var selCard = null;
    var col = cols[S.sel.lcm[0]];
    if (col) selCard = (col.cards || [])[S.sel.lcm[1]];
    var pkg = (selCard && selCard.pkgId) ? MP.byId(S.packages, selCard.pkgId) : S.packages[0];
    var d = S.deploy.lcmp;
    var det = $('#lcmDetail');

    var validCount = S.packages.filter(function (p) { return p.validated; }).length;
    det.innerHTML =
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>平台管理的网元与软件包</h2><small>NE + PACKAGE / TYPE · NE · VENDOR · VERSION</small>' +
          '<span class="mcbadge mcbadge--accent">' + esc(d.version) + '</span></div>' +
        '<div class="mckv">' +
          '<div class="mckv__i"><small>PACKAGES</small><b>' + S.packages.length + '</b><i>已校验 ' + validCount + ' 个</i></div>' +
          '<div class="mckv__i"><small>MANAGED NE</small><b>' + S.nes.length + '</b><i>与网元管理平台同源</i></div>' +
          '<div class="mckv__i"><small>CO-DEPLOY</small><b>' + (d.coDeploy ? 'ON' : 'OFF') + '</b><i>' + esc(d.host) + '</i></div>' +
        '</div>' +
        '<div class="mctbl-wrap" style="margin-top:16px"><table class="mctbl"><caption>软件包清单（类型 / 所属网元 / 厂商 / 版本）</caption>' +
          '<thead><tr><th scope="col">软件包</th><th scope="col">类型</th><th scope="col">所属网元</th><th scope="col">厂商</th><th scope="col">版本</th><th scope="col">校验</th><th scope="col">操作</th></tr></thead><tbody>' +
          S.packages.map(function (p) {
            var ne = MP.byId(S.nes, p.ne);
            return '<tr><td class="mcmono">' + esc(p.name) + '</td>' +
              '<td><select class="mcsel" data-pkg-type="' + p.id + '" aria-label="' + esc(p.name) + ' 的类型">' + opts(S.softTypes, p.type) + '</select></td>' +
              '<td><select class="mcsel" data-pkg-ne="' + p.id + '" aria-label="' + esc(p.name) + ' 所属网元"><option value="">平台级</option>' +
                S.nes.map(function (n) { return '<option value="' + n.id + '"' + (p.ne === n.id ? ' selected' : '') + '>' + esc(n.name) + '</option>'; }).join('') + '</select></td>' +
              '<td><select class="mcsel" data-pkg-vendor="' + p.id + '" aria-label="' + esc(p.name) + ' 厂商">' + opts(S.vendors, p.vendor) + '</select></td>' +
              '<td><input class="mcin" data-pkg-ver="' + p.id + '" value="' + esc(p.version) + '" aria-label="' + esc(p.name) + ' 版本" /></td>' +
              '<td><span class="mcbadge' + (p.validated ? ' mcbadge--ok' : ' mcbadge--warn') + '">' + (p.validated ? '已校验' : '待校验') + '</span></td>' +
              '<td class="mctbl__act"><button type="button" class="mcbtn mcbtn--sm" data-fx="subtle" data-pkg-val="' + p.id + '">校验</button> ' +
                '<button type="button" class="mcbtn mcbtn--sm mcbtn--danger" data-fx="subtle" data-pkg-del="' + p.id + '">删除</button></td></tr>';
          }).join('') +
        '</tbody></table></div>' +
        '<div class="mcdt__cols" style="margin-top:16px">' +
          '<div class="mcfld"><label for="lPkgName">新增软件包名称</label><input class="mcin" id="lPkgName" data-fkey="lPkgName" placeholder="例如：GNB_R7.3.0_full.pkg" />' +
            '<span class="mcfld__err" id="lPkgNameErr"></span></div>' +
          '<div class="mcfld"><label for="lPkgType">类型</label><select class="mcsel" id="lPkgType" data-fkey="lPkgType">' + opts(S.softTypes, '整包') + '</select></div>' +
          '<div class="mcfld"><label for="lPkgNe">所属网元</label><select class="mcsel" id="lPkgNe" data-fkey="lPkgNe">' +
            '<option value="">平台级</option>' + S.nes.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="mcfld"><label for="lPkgVendor">厂商</label><select class="mcsel" id="lPkgVendor" data-fkey="lPkgVendor">' + opts(S.vendors, S.vendors[0]) + '</select></div>' +
          '<div class="mcfld"><label for="lPkgVer">版本</label><input class="mcin" id="lPkgVer" data-fkey="lPkgVer" value="7.3.0" />' +
            '<span class="mcfld__err" id="lPkgVerErr"></span></div>' +
          '<div class="mcfld"><label for="lPkgSize">大小（MB）</label><input class="mcin" id="lPkgSize" data-fkey="lPkgSize" value="512" inputmode="numeric" /></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="lPkgAdd" data-fx="standard"><span class="mx-hold__label">登记软件包</span></button>' +
          '<button type="button" id="lCoDeploy" data-fx="none">共部署</button>' +
          '<span class="mcrule-hint">共部署时与网元管理平台复用端口 ' + esc(d.host) + '，软件包库共享。</span>' +
        '</div>' +
        '<p class="mcdt__note" id="lPkgNow" style="margin-top:12px">' +
          (pkg ? '当前卡片：' + esc(pkg.name) + ' · ' + esc(pkg.type) + ' · ' + esc(pkg.vendor) + ' · v' + esc(pkg.version) + ' · MD5 ' + esc(pkg.md5) : '在卡列里选一个软件包卡片。') +
        '</p>' +
      '</section>';

    /* 共部署开关（velocitySwitch） */
    paintLcmCoDeploy();

    /* 软件包校验：异步 + loading + rippleLoader + statusMark */
    $$('[data-pkg-val]', det).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.pkgVal;
        var p = MP.byId(S.packages, id);
        if (!p) return;
        var done = MP.btn.loading(btn, '校验中');
        var box = node('span');
        btn.parentNode.insertBefore(box, btn);
        var rl = X.rippleLoader(box, { label: p.name.slice(0, 18) });
        var markBox = node('span');
        btn.parentNode.appendChild(markBox);
        var mark = X.statusMark(markBox, { state: 'working', label: 'MD5 / 签名' });
        setTimeout(function () {
          A.validatePackage(id);
          mark.set('done', '通过');
          rl.stop();
          if (box.parentNode) box.remove();
          done();
          updatePkgRow(p);
          toast('软件包校验通过', p.name + ' · ' + p.md5, { tone: 'ok', duration: 3000 });
        }, 900);
      });
    });
    /* 删除软件包（fuseButton 语义：完成后可撤销） */
    $$('[data-pkg-del]', det).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.pkgDel;
        var p = MP.byId(S.packages, id);
        if (!p || !confirm) { /* confirm 仅用于语义保护 */ }
        var backup = JSON.parse(JSON.stringify(p));
        A.removePackage(id);
        toast('已删除软件包 ' + backup.name, '4 秒内可撤销恢复', {
          tone: 'danger', duration: 4200, actionLabel: '撤销删除',
          onAction: function () {
            var np = A.addPackage({ name: backup.name, type: backup.type, ne: backup.ne, vendor: backup.vendor, version: backup.version, sizeMB: backup.sizeMB });
            if (backup.validated) A.validatePackage(np.id);
          }
        });
      });
    });
    /* 表单联动（下拉即写） */
    $$('[data-pkg-type]', det).forEach(function (s) {
      s.addEventListener('change', function () { A.updatePkg ? A.updatePkg() : null; patchPackage(s.dataset.pkgType, { type: s.value }); });
    });
    $$('[data-pkg-ne]', det).forEach(function (s) {
      s.addEventListener('change', function () { patchPackage(s.dataset.pkgNe, { ne: s.value }); });
    });
    $$('[data-pkg-vendor]', det).forEach(function (s) {
      s.addEventListener('change', function () { patchPackage(s.dataset.pkgVendor, { vendor: s.value }); });
    });
    $$('[data-pkg-ver]', det).forEach(function (s) {
      s.addEventListener('change', function () { patchPackage(s.dataset.pkgVer, { version: s.value }); });
    });

    $('#lPkgAdd').addEventListener('click', function () {
      var name = $('#lPkgName').value.trim();
      var ver = $('#lPkgVer').value.trim();
      var ok = true;
      if (!/^\S+\.pkg$/.test(name)) { fieldErr('lPkgName', '文件名需以 .pkg 结尾，例如 GNB_R7.3.0_full.pkg'); ok = false; } else fieldErr('lPkgName', '');
      if (!/^\d+\.\d+(\.\d+)?$/.test(ver)) { fieldErr('lPkgVer', '版本形如 7.3.0'); ok = false; } else fieldErr('lPkgVer', '');
      if (!ok) return;
      var self = this;
      var done = MP.btn.loading(self, '登记中');
      setTimeout(function () {
        A.addPackage({ name: name, type: $('#lPkgType').value, ne: $('#lPkgNe').value, vendor: $('#lPkgVendor').value, version: ver, sizeMB: parseInt($('#lPkgSize').value, 10) || 0 });
        done();
        $('#lPkgName').value = '';
        toast('软件包已登记', name + ' · 待校验', { tone: 'ok', duration: 3000 });
      }, 440);
    });

    wireA11y(det);
  }

  function patchPackage(id, patch) {
    var p = MP.byId(S.packages, id);
    if (!p) return;
    Object.keys(patch).forEach(function (k) { if (p[k] !== patch[k]) { p[k] = patch[k]; } });
    MP.emit({ type: 'package', action: 'patch', id: id });
    toast('软件包已更新', p.name + ' · ' + p.type + ' / ' + p.vendor + ' / v' + p.version, { duration: 2400 });
  }
  function updatePkgRow(p) {
    var row = document.querySelector('[data-pkg-val="' + p.id + '"]');
    if (!row) return;
    var tr = row.closest('tr');
    if (!tr) return;
    var badge = tr.querySelector('.mcbadge');
    if (badge) { badge.textContent = '已校验'; badge.className = 'mcbadge mcbadge--ok'; }
  }
  function paintLcmCoDeploy() {
    var host = $('#lCoDeploy');
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(node('span', 'mcrule-hint', '共部署'));
    var box = node('span');
    host.appendChild(box);
    X.velocitySwitch(box, {
      checked: S.deploy.lcmp.coDeploy, label: '生命周期平台共部署',
      onChange: function (v) {
        A.toggleCoDeploy('lcmp');
        toast(v ? '已开启共部署' : '已关闭共部署', v ? '与网元管理平台复用端口 ' + S.deploy.lcmp.host : '改为独立端口部署', { tone: v ? 'ok' : 'warn', duration: 3000 });
      }
    });
  }

  /* ================================================================ 06 VLP */
  function renderVlp() {
    var V = S.vlp;
    var cols = [];
    cols.push({
      key: 'stack', en: 'VIRTUAL STACK', name: '虚层实例', sub: V.version + ' · ' + V.cpu + ' 核',
      cards: [
        { code: 'STK', title: V.volume, sub: '主 ' + siteName(V.primarySite) + ' · 副 ' + siteName(V.secondarySite), stackId: 1,
          meta: ['<span class="mcard__tag">CPU ' + V.cpu + '</span>', '<span class="mcard__tag">' + esc(V.version) + '</span>'] }
      ].concat(S.sites.map(function (s) {
        return { code: s.region.split('-')[1], title: s.name, sub: s.role + ' · 可用 CPU ' + s.cpu, siteId: s.id, meta: ['<span class="mcard__tag">' + esc(s.region) + '</span>'] };
      })),
      fill: 5
    });
    cols.push({
      key: 'flow', en: 'UPGRADE FLOW', name: '升级流程详情', sub: V.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length + '/' + V.upgradeFlow.length + ' 步完成',
      cards: V.upgradeFlow.map(function (s, i) {
        return {
          code: pad2(i + 1), title: s.name, sub: s.kind === 'auto' ? '自动' : s.kind === 'manual' ? '手动' : '人工（人机交互）',
          phase: i / V.upgradeFlow.length,
          meta: ['<span class="mcard__tag ' + (s.state === 'done' ? 'mcard__tag--ok' : s.state === 'active' ? 'mcard__tag--accent' : '') + '">' + esc(s.state) + '</span>']
        };
      }), fill: 5
    });
    cols.push({
      key: 'check', en: 'PACKAGE CHECK', name: '软件包校验流程', sub: V.checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + V.checks.length + ' 项通过',
      cards: V.checks.map(function (c) {
        return {
          code: c.name.slice(0, 2), title: c.name, sub: c.target, checkId: c.id,
          meta: ['<span class="mcard__tag ' + (c.state === 'pass' ? 'mcard__tag--ok' : c.state === 'warn' ? 'mcard__tag--warn' : '') + '">' + esc(c.state) + '</span>']
        };
      }), fill: 5
    });
    cols.push({
      key: 'pkg', en: 'PLATFORM PACKAGE', name: '平台软件包', sub: S.packages.filter(function (p) { return /VLMP/.test(p.name); }).length + ' 个平台包',
      cards: S.packages.filter(function (p) { return /VLMP|stack/i.test(p.name); }).map(function (p) {
        return { code: 'PKG', title: p.name, sub: p.vendor + ' · v' + p.version, pkgId: p.id, meta: ['<span class="mcard__tag">' + p.sizeMB + 'MB</span>'] };
      }), fill: 5
    });
    COLS.vlp = cols;
    renderCar('vlp');

    var det = $('#vlpDetail');
    det.innerHTML =
      /* ---- CPU + 主副站点 + 版本 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>平台资源与站点</h2><small>CPU / PRIMARY + SECONDARY SITE / VERSION</small>' +
          '<span class="mcbadge mcbadge--accent">' + esc(V.version) + '</span></div>' +
        '<div class="mcdt__cols">' +
          '<div class="mcfld"><label for="vCpuBox">CPU 数量（' + V.cpuRange[0] + '–' + V.cpuRange[1] + ' 核）</label><span id="vCpuBox"></span>' +
            '<span class="mcfld__hint">拖动或方向键调整，超界会有橡皮筋。</span></div>' +
          '<div class="mcfld"><label for="vPri">主站点</label><select class="mcsel" id="vPri" data-fkey="vPri">' +
            S.sites.map(function (s) { return '<option value="' + s.id + '"' + (V.primarySite === s.id ? ' selected' : '') + '>' + esc(s.name) + ' · ' + esc(s.region) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="mcfld"><label for="vSec">副站点</label><select class="mcsel" id="vSec" data-fkey="vSec">' +
            S.sites.map(function (s) { return '<option value="' + s.id + '"' + (V.secondarySite === s.id ? ' selected' : '') + '>' + esc(s.name) + ' · ' + esc(s.region) + '</option>'; }).join('') +
          '</select><span class="mcfld__err" id="vSiteErr"></span></div>' +
          '<div class="mcfld"><label for="vVer">平台版本</label><select class="mcsel" id="vVer" data-fkey="vVer">' +
            opts(['VLMP R3.1.0', 'VLMP R3.0.6', 'VLMP R3.2.0-rc1'], V.version) + '</select></div>' +
          '<div class="mcfld"><label for="vVol">卷名</label><input class="mcin" id="vVol" data-fkey="vVol" value="' + esc(V.volume) + '" /></div>' +
          '<div class="mcfld"><label>CPU 占用读数</label><span id="vGaugeBox"></span></div>' +
        '</div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcbtn" id="vApply" data-fx="standard">应用 CPU 与站点</button>' +
          '<span class="mcrule-hint">主副站点不能相同；切换会重算可用 CPU。</span>' +
        '</div>' +
      '</section>' +

      /* ---- 升级流程详情 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>升级流程详情</h2><small>UPGRADE FLOW / DETAIL</small>' +
          '<span class="mcrule-hint">' + V.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length + ' 步已完成</span></div>' +
        '<div class="mcflow" id="vFlow"></div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="vNext" data-fx="standard"><span class="mx-hold__label">推进一步</span></button>' +
          '<button type="button" id="vReset" data-fx="none">重置流程</button>' +
          '<span id="vRunBox" class="mcrule-hint"></span>' +
        '</div>' +
      '</section>' +

      /* ---- 软件包校验流程 ---- */
      '<section class="mcdt__blk">' +
        '<div class="mcdt__hd"><h2>软件包校验流程</h2><small>PACKAGE CHECK / MD5 · SIGN · DEPENDENCY · ROLLBACK</small>' +
          '<span class="mcrule-hint">' + V.checks.filter(function (c) { return c.state === 'pass'; }).length + ' / ' + V.checks.length + '</span></div>' +
        '<div class="mcvals" id="vChecks"></div>' +
        '<div class="mcrow" style="margin-top:14px">' +
          '<button type="button" class="mcact" id="vCheckAll" data-fx="standard"><span class="mx-hold__label">执行全部校验</span></button>' +
          '<span class="mcrule-hint">逐项执行，状态用三段形变标记。</span>' +
        '</div>' +
      '</section>';

    /* CPU scrub（橡皮筋 + 键盘） */
    var vG = X.gauge($('#vGaugeBox'), { value: Math.round(V.cpu / V.cpuRange[1] * 100), unit: '%', label: 'CPU 占用' });
    X.scrub($('#vCpuBox'), {
      min: V.cpuRange[0], max: V.cpuRange[1], step: 1, value: V.cpu, suffix: ' 核', label: 'CPU',
      onChange: function (v) {
        A.setCPU(v);
        if (vG) vG.set(Math.round(v / V.cpuRange[1] * 100));
      }
    });
    $('#vCpuBox').addEventListener('keydown', function (e) { e.stopPropagation(); });

    renderVlpFlow();
    renderVlpChecks();

    $('#vApply').addEventListener('click', function () {
      if ($('#vPri').value === $('#vSec').value) { fieldErr('vSec', '主站点与副站点不能相同'); return; }
      fieldErr('vSec', '');
      A.setSite('primary', $('#vPri').value);
      A.setSite('secondary', $('#vSec').value);
      A.setVlpVersion($('#vVer').value);
      toast('虚层平台配置已应用', siteName($('#vPri').value) + ' / ' + siteName($('#vSec').value) + ' · ' + $('#vVer').value,
        { tone: 'ok', duration: 3200 });
    });

    /* 推进一步（异步 + loading） */
    $('#vNext').addEventListener('click', function () {
      var self = this;
      var done = MP.btn.loading(self, '推进中');
      setTimeout(function () {
        var before = S.vlp.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length;
        A.advanceVlpFlow();
        var after = S.vlp.upgradeFlow.filter(function (s) { return s.state === 'done'; }).length;
        done();
        renderVlpFlow();
        var act = S.vlp.upgradeFlow.filter(function (s) { return s.state === 'active'; })[0];
        if (after > before) {
          toast('流程完成一步', '已完成 ' + after + ' / ' + S.vlp.upgradeFlow.length + (act ? ' · 下一步：' + act.name : ''), { tone: 'ok', duration: 3000 });
          if (act && act.kind === 'human') {
            var gate = node('button', 'mcbtn mcbtn--sm', '人工确认并继续');
            gate.type = 'button'; gate.dataset.fx = 'standard';
            gate.addEventListener('click', function () { gate.remove(); A.advanceVlpFlow(); renderVlpFlow(); toast('人工确认已记录', act.name, { tone: 'ok', duration: 2600 }); });
            $('#vRunBox').appendChild(gate);
            toast('停在人机交互步骤', act.name + ' · 点「人工确认并继续」', { tone: 'warn', duration: 5000 });
          }
        } else {
          toast('流程已到最后一步', '合并回站点演练 · 需要人工确认', { tone: 'warn', duration: 3000 });
        }
      }, 460);
    });
    /* 重置（fuseButton 语义） */
    X.fuseButton($('#vReset'), {
      label: '重置流程', doneLabel: '已重置 · 撤销', undoWindow: 3600,
      onCommit: function () { A.resetVlpFlow(); renderVlpFlow(); toast('升级流程已重置', '回到第一步「平台预检」', { tone: 'warn', duration: 3000 }); },
      onUndo: function () { A.advanceVlpFlow(); renderVlpFlow(); toast('已撤销重置', '流程回到重置前的位置', { duration: 2400 }); }
    });

    /* 全部校验（latticeLoader + statusMark） */
    $('#vCheckAll').addEventListener('click', function () {
      var self = this;
      var done = MP.btn.loading(self, '校验中');
      var box = node('span', 'mcrule-hint');
      $('#vRunBox').appendChild(box);
      var lx = X.latticeLoader(box, { label: '逐项执行校验', size: 9 });
      var list = S.vlp.checks.slice();
      var i = 0;
      var timer = setInterval(function () {
        if (i >= list.length) {
          clearInterval(timer);
          lx.done('校验完成 ' + S.vlp.checks.filter(function (c) { return c.state === 'pass'; }).length + '/' + list.length);
          done();
          renderVlpChecks();
          toast('软件包校验流程完成', '状态已写回校验清单', { tone: 'ok', duration: 3000 });
          setTimeout(function () { lx.stop(); }, 1500);
          return;
        }
        var c = list[i++];
        var slot = document.querySelector('[data-check-run="' + c.id + '"]');
        if (slot && slot.__mark) slot.__mark.set('working', '校验中');
        A.runVlpCheck(c.id);
        if (slot && slot.__mark) slot.__mark.set(c.state === 'pass' ? 'done' : 'error', c.state === 'pass' ? '通过' : '告警');
        paintCheckRow(c);
      }, 520);
    });

    wireA11y(det);
  }

  function renderVlpFlow() {
    var host = $('#vFlow');
    if (!host) return;
    host.innerHTML = '';
    S.vlp.upgradeFlow.forEach(function (s, i) {
      var kindName = s.kind === 'auto' ? '自动' : s.kind === 'manual' ? '手动' : '人工 / 人机交互';
      var row = node('div', 'mcflow__st' + (s.state === 'active' ? ' is-active' : s.state === 'done' ? ' is-done' : ''));
      row.innerHTML = '<span class="mcflow__no">' + pad2(i + 1) + '</span>' +
        '<span class="mcflow__bd"><b>' + esc(s.name) + '</b><i>' + kindName + '</i></span>' +
        '<span class="mcflow__kind">' + esc(s.state) + '</span>' +
        '<span class="mcflow__ops"><span data-flow-mark="' + s.id + '"></span></span>';
      host.appendChild(row);
      X.statusMark(row.querySelector('[data-flow-mark]'), {
        state: s.state === 'done' ? 'done' : s.state === 'active' ? 'working' : 'idle',
        label: s.state === 'done' ? '已完成' : s.state === 'active' ? '进行中' : '待执行'
      });
    });
  }

  function renderVlpChecks() {
    var host = $('#vChecks');
    if (!host) return;
    host.innerHTML = '';
    S.vlp.checks.forEach(function (c) {
      var row = node('div', 'mcval');
      row.dataset.checkId = c.id;
      row.innerHTML = '<button type="button" class="mcbtn mcbtn--link" data-fx="subtle" data-check-run="' + c.id + '" aria-label="执行 ' + esc(c.name) + '"></button>' +
        '<span class="mcval__bd"><b>' + esc(c.name) + '</b><i>' + esc(c.target) + ' · ' + esc(c.detail) + '</i></span>' +
        '<span class="mcval__lv">' + (c.state === 'pass' ? '通过' : c.state === 'warn' ? '告警' : '待执行') + '</span>';
      host.appendChild(row);
      var slot = row.querySelector('[data-check-run]');
      var mark = X.statusMark(slot, {
        state: c.state === 'pass' ? 'done' : c.state === 'warn' ? 'error' : 'idle', label: ''
      });
      slot.__mark = mark;
      slot.addEventListener('click', function () {
        var done = MP.btn.loading(slot, '');
        setTimeout(function () {
          A.runVlpCheck(c.id);
          mark.set('done', '');
          paintCheckRow(c);
          done();
          toast('单项校验通过', c.name + ' · ' + c.target, { tone: 'ok', duration: 2600 });
        }, 520);
      });
    });
  }
  function paintCheckRow(c) {
    var row = $$('.mcval').filter(function (n) { return n.querySelector('[data-check-run="' + c.id + '"]'); })[0];
    if (!row) return;
    var i = row.querySelector('.mcval__bd i');
    if (i) i.textContent = c.target + ' · ' + c.detail;
    var lv = row.querySelector('.mcval__lv');
    if (lv) lv.textContent = c.state === 'pass' ? '通过' : c.state === 'warn' ? '告警' : '待执行';
  }

  /* ============================================================ transport */
  var hist = [];          /* 会话流量时间轴：每条到达的审计记录 */
  var tl = { value: 119, max: 119, live: true };
  var rate = 2;           /* 1–8 档流速 */
  var specBars = new Array(56).fill(0);
  var specHit = -1, specPeak = 0;
  var lastInteract = 0, idleT = 0;
  var tlScrub = null, rateCtl = null;

  function pump(n) {
    specBars[pump.i = ((pump.i || 0) + 17) % specBars.length] = Math.min(1, specBars[pump.i] + 0.85);
    specHit = pump.i;
    for (var k = 0; k < n; k++) {
      var j = (specHit + 5 + k * 7) % specBars.length;
      specBars[j] = Math.min(1, specBars[j] + 0.45);
    }
  }

  function npInfo() {
    var a = SEL.api();
    var p = SEL.port();
    var capName = a ? capOf(a.capId).code : (p ? (SEL.capsOfPort(p.id)[0] || {}).code || 'IDLE' : 'IDLE');
    var ep = p ? (p.ip + ':' + p.port + (a ? a.path : '/')) : '—';
    var caps = p ? (SEL.capsOfPort(p.id).map(function (c) { return c.code + ' ' + c.version; }).join(' + ') || '未挂载能力') : '—';
    var el = $('#npEndpoint'), ce = $('#npCaps'), lab = $('#rulerLabel');
    if (el) el.textContent = ep;
    if (ce) ce.textContent = (a ? a.method + ' · ' + a.name + ' · ' : '') + caps + ' · ' + capName;
    if (lab) lab.textContent = NAV[S.ui.screen].name;
  }

  function renderTransport() {
    var p = SEL.port();
    var running = !!(p && p.running);
    var bar = $('#transport');
    bar.classList.toggle('is-running', running);
    var main = $('#btnMain');
    main.setAttribute('aria-pressed', running ? 'true' : 'false');
    main.setAttribute('aria-label', running ? '暂停 mock 服务（当前端口停止应答）' : '启动 mock 服务（当前端口开始应答）');
    var sw = $('#btnLoop');
    if (sw) sw.setAttribute('aria-pressed', S.ui.running ? 'true' : 'false');
    npInfo();
    var k = SEL.kpis();
    var sReq = $('#smRequests'), sLat = $('#smLatency'), sHum = $('#smHuman');
    if (sReq && sReq.textContent !== String(k.req)) M.countUp(sReq, k.req, { duration: 420 });
    if (sLat) sLat.textContent = k.avgLat + 'ms';
    if (sHum) sHum.textContent = String(k.pendingHuman);
  }

  function rampLoop() {
    for (var i = 0; i < specBars.length; i++) specBars[i] *= 0.90;
    if (specBars[specHit] != null) specBars[specHit] *= 0.985;
    var peak = 0;
    for (var j = 0; j < specBars.length; j++) peak = Math.max(peak, specBars[j]);
    specPeak += (Math.min(1, peak * 1.05) - specPeak) * 0.22;
    if (specHit >= 0 && specPeak < 0.02) specHit = -1;
    drawSpec();
  }

  function drawSpec() {
    var cv = $('#spectrum');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || 300, h = cv.clientHeight || 24;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var cs = getComputedStyle(root);
    var accent = (cs.getPropertyValue('--accent') || '#a67d48').trim();
    var muted = (cs.getPropertyValue('--muted-3') || '#8e897b').trim();
    var n = specBars.length;
    var bw = w / n;
    var t = performance.now() / 1000;
    for (var i = 0; i < n; i++) {
      var base = specBars[i];
      /* 列之间异步：每个柱有自己的相位，波峰沿时间轴依次传播 */
      var phase = (i / n) * Math.PI * 2;
      var shimmer = 0.10 + 0.09 * Math.sin(t * 1.7 - phase * 2.0);
      var v = Math.max(0.06, base + shimmer);
      var bh = Math.min(h - 2, v * (h - 4));
      var x = i * bw + bw * 0.22;
      var wBar = Math.max(1.2, bw * 0.56);
      var hit = Math.abs(i - specHit) <= 1 && specHit >= 0;
      ctx.fillStyle = hit ? accent : (base > 0.28 ? accent : muted);
      ctx.globalAlpha = hit ? 0.95 : Math.min(0.9, 0.30 + base * 0.8);
      ctx.fillRect(x, h - 1 - bh, wBar, bh);
    }
    ctx.globalAlpha = 1;
    /* 播放头 */
    if (tlScrub) {
      var xh = (tl.value / Math.max(1, tl.max)) * w;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(xh, 0, 1, h);
      ctx.globalAlpha = 1;
    }
  }

  function setupTimeline() {
    tlScrub = makeScrub();
    /* 速率刻度（流速档位）：指针 + 键盘 */
    var wrap = $('#rateWrap');
    function paintRate() {
      wrap.style.setProperty('--rate-x', ((rate - 1) / 7 * 100) + '%');
      wrap.setAttribute('aria-valuenow', String(rate));
      wrap.setAttribute('aria-valuemin', '1');
      wrap.setAttribute('aria-valuemax', '8');
      wrap.setAttribute('aria-label', '流速档位 ' + rate + ' / 8 · 倍率 ' + (rate / 2).toFixed(1) + '×');
    }
    function setRate(v) {
      rate = MP.clamp(v, 1, 8);
      paintRate();
      if (S.ui.running) MP.sim.start(Math.max(360, Math.round(2600 / (rate / 2))));
      var hint = $('#tlHint');
      if (hint) hint.textContent = '流速 ' + (rate / 2).toFixed(1) + '× · 每 ' + Math.round(2600 / (rate / 2)) + 'ms 一批请求';
      MP.sfx.play('step');
    }
    wrap.addEventListener('pointerdown', function (e) {
      wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId);
      var r = wrap.getBoundingClientRect();
      setRate(1 + Math.round((e.clientX - r.left) / r.width * 7));
      var mv = function (ev) {
        var r2 = wrap.getBoundingClientRect();
        setRate(1 + Math.round((ev.clientX - r2.left) / r2.width * 7));
      };
      var up = function () { wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up); };
      wrap.addEventListener('pointermove', mv);
      wrap.addEventListener('pointerup', up);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setRate(rate + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setRate(rate - 1); e.preventDefault(); }
      e.stopPropagation();
    });
    rateCtl = { set: setRate };
    paintRate();
    updateReadout();

    /* 「回到实时」：回看状态下的显式出口 */
    var live = $('#tlLive');
    if (live) {
      live.addEventListener('click', function () {
        tl.live = true; tl.value = tl.max;
        if (tlScrub) {
          /* scrub 只暴露 set()，这里重建一次拿到最新 max，保持行为单一 */
          var host = $('#tlTrack');
          if (host) host.innerHTML = '';
          tlScrub = makeScrub();
        }
        updateReadout();
      });
    }
  }

  function makeScrub() {
    var s = X.scrub($('#tlTrack'), {
      min: 0, max: tl.max, step: 1, value: tl.value, label: '',
      onChange: function (v) { tl.value = v; tl.live = v >= tl.max - 1; updateReadout(); }
    });
    var host = $('#tlTrack');
    if (host) host.addEventListener('keydown', function (e) { e.stopPropagation(); });
    return s;
  }

  function updateReadout() {
    var e = hist[Math.min(tl.value, hist.length - 1)];
    var head = $('#tlReadout'), hint = $('#tlHint');
    if (head) head.textContent = e ? (e.clock + ' → ' + e.status) : '00:00 / 00:00';
    if (hint) {
      hint.textContent = tl.live
        ? ('实时跟随 · 会话 ' + hist.length + ' 条 · 流速 ' + (rate / 2).toFixed(1) + '×')
        : ('回看 ' + (e ? e.clock + ' ' + e.method + ' ' + e.path : '—'));
    }
    var live = $('#tlLive');
    if (live) live.hidden = tl.live;
  }

  function pushHist(log) {
    hist.push(log);
    if (hist.length > 120) hist.shift();
    tl.max = Math.max(0, hist.length - 1);
    if (tl.live) tl.value = tl.max;
    var host = $('#tlTrack');
    if (host) {
      host.setAttribute('aria-valuemax', String(tl.max));
      host.setAttribute('aria-valuenow', String(Math.round(tl.value)));
      host.setAttribute('aria-valuetext', '第 ' + (Math.round(tl.value) + 1) + ' 条，共 ' + hist.length + ' 条');
      host.style.setProperty('--scrub-x', (tl.value / Math.max(1, tl.max) * 100) + '%');
    }
    updateReadout();
    pump(1);
  }

  /* ============================================================ 主题 / 音效 */
  var THEME_KEY = 'mp-v5-theme';
  var THEMES = {
    dawn: { name: '晨雾', en: 'MORNING MIST', canvas: '#e8e5e1' },
    moon: { name: '月影', en: 'MOONSHADOW', canvas: '#171713' }
  };
  var themeLock = false;

  function applyTheme(t) {
    if (!THEMES[t]) t = 'dawn';
    root.setAttribute('data-theme', t);
    S.ui.theme = t;
    $$('[data-theme-set]').forEach(function (b) {
      var on = b.dataset.themeSet === t;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', THEMES[b.dataset.themeSet].name + '主题' + (on ? '（当前）' : ''));
    });
    movePill();
    var sm = $('#smTheme');
    if (sm) sm.textContent = THEMES[t].name;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 隐私模式忽略 */ }
  }
  function movePill() {
    var sw = $('#themeSwitch');
    if (!sw) return;
    var on = sw.querySelector('[aria-pressed="true"]');
    var pill = sw.querySelector('.mcswap__pill');
    if (!on || !pill) return;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + (on.offsetLeft - sw.clientLeft + 2) + 'px)';
  }
  function switchTheme(next) {
    if (themeLock || S.ui.theme === next) { themeLock = false; return; }
    themeLock = true;
    MP.sfx.play('iris');
    /* 连续过渡：不硬切——旧画布色做一层从切换控件圆心展开的光圈，底下同时开始插值 */
    var btn = document.querySelector('[data-theme-set="' + next + '"]');
    if (!M.reduced && btn) {
      var r = btn.getBoundingClientRect();
      var veil = node('div', 'theme-veil');
      veil.setAttribute('aria-hidden', 'true');
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var rad = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
      veil.style.cssText = 'position:fixed;inset:0;z-index:200;pointer-events:none;background:' + THEMES[S.ui.theme].canvas +
        ';clip-path:circle(0px at ' + cx + 'px ' + cy + 'px);transition:clip-path ' + Math.round(380 * 1) + 'ms cubic-bezier(.2,.8,.2,1)';
      document.body.appendChild(veil);
      void veil.offsetWidth;
      veil.style.clipPath = 'circle(' + rad + 'px at ' + cx + 'px ' + cy + 'px)';
      applyTheme(next);
      setTimeout(function () {
        veil.style.transition = 'opacity 240ms linear';
        veil.style.opacity = '0';
        setTimeout(function () { veil.remove(); themeLock = false; }, 260);
      }, 340);
    } else {
      applyTheme(next);
      themeLock = false;
    }
    var nm = THEMES[next].name;
    toast('已切换到「' + nm + '」', next === 'moon' ? '月影：石墨 #171713 底 + 暖白文字 #e9eef2，强调仍为琥珀 #a67d48'
      : '晨雾：暖灰白 #e8e5e1 底 + 近黑 #171713 文字，强调暖杏金 #a67d48', { duration: 3200 });
    renderTransport();
  }

  /* ------------------------------------------------------------ 抽屉内容 */
  function openDrawer(kind) {
    var pop = $('#popDrawer'), title = $('#popTitle'), body = $('#popBody');
    pop.hidden = false;
    pop.classList.remove('is-out');
    title.textContent = kind === 'settings' ? '调测台设置' : '调测台索引';
    if (kind === 'settings') {
      var k = SEL.kpis();
      body.innerHTML =
        '<div class="mclist">' +
          '<div class="mclist__row"><span class="mclist__k">主题</span><span class="mclist__t">晨雾 / 月影</span><span class="mclist__d">' + THEMES[S.ui.theme].name + '</span></div>' +
          '<div class="mclist__row"><span class="mclist__k">音效</span><span class="mclist__t">界面合成音效</span><span class="mclist__d">' + (MP.sfx.enabled ? '开' : '关') + '</span></div>' +
          '<div class="mclist__row"><span class="mclist__k">动效</span><span class="mclist__t">减少动态效果</span><span class="mclist__d">' + (M.reduced ? '跟随系统 · 开' : '跟随系统 · 关') + '</span></div>' +
          '<div class="mclist__row"><span class="mclist__k">流速</span><span class="mclist__t">流量模拟速率</span><span class="mclist__d">' + (rate / 2).toFixed(1) + '×</span></div>' +
          '<div class="mclist__row"><span class="mclist__k">端口</span><span class="mclist__t">运行中 / 总数</span><span class="mclist__d">' + k.running + ' / ' + k.ports + '</span></div>' +
          '<div class="mclist__row"><span class="mclist__k">会话</span><span class="mclist__t">审计记录</span><span class="mclist__d">' + k.req + ' 条</span></div>' +
        '</div>' +
        '<p style="margin-top:12px">键盘：数字键 <b>1–6</b> 切界面，<b>← →</b> 切列，<b>↑ ↓</b> 切卡，<b>T</b> 切主题，<b>空格</b> 启停服务，<b>L</b> 循环重放，<b>Esc</b> 关闭本面板。</p>';
    } else {
      body.innerHTML = '<div class="mclist">' + NAV_ORDER.map(function (id, i) {
        var n = NAV[id];
        return '<button type="button" class="mclist__row' + (S.ui.screen === id ? ' is-on' : '') + '" data-drawer-go="' + id + '" data-fx="none">' +
          '<span class="mclist__k">' + pad2(i + 1) + '</span><span class="mclist__t">' + esc(n.name) + '</span>' +
          '<span class="mclist__d">' + esc(n.en) + '</span></button>';
      }).join('') + '</div>' +
        '<p style="margin-top:12px">六个界面共用同一份 <b>_shared/domain.js</b> 数据与规则引擎；本版只换视觉语言与布局。</p>';
    }
    MP.btn.enhance(body);
    wireA11y(body);
  }
  function closeDrawer() {
    var pop = $('#popDrawer');
    if (!pop || pop.hidden) return;
    pop.classList.add('is-out');
    setTimeout(function () { pop.hidden = true; pop.classList.remove('is-out'); }, M.reduced ? 0 : 200);
  }

  /* ================================================================ 导航 */
  var NAV_ORDER = ['mock', 'flow', 'ne', 'omp', 'lcm', 'vlp'];
  var NAV = {
    mock: { name: 'MOCK 管理', cn: 'Mock 管理', en: 'PORT / CERT / CAP' },
    flow: { name: 'MOCK 流程', cn: 'Mock 流程', en: 'AUDIT / RESPONSE' },
    ne: { name: '网元管理', cn: '网元管理', en: 'NE / UPGRADE' },
    omp: { name: '网元管理平台', cn: '网元管理平台', en: 'OMP / ACCOUNT' },
    lcm: { name: '生命周期平台', cn: '生命周期平台', en: 'LCMP / PACKAGE' },
    vlp: { name: '虚层管理平台', cn: '虚层管理平台', en: 'VLMP / STACK' }
  };
  var pendingOrigin = null, navLock = false;

  function buildRuler() {
    var host = $('#rulerTicks');
    if (!host) return;
    host.innerHTML = '';
    NAV_ORDER.forEach(function (id, i) {
      var b = node('button', 'mcr__tick');
      b.type = 'button';
      b.dataset.nav = id;
      b.dataset.fx = 'subtle';
      b.dataset.fkey = 'tick:' + id;
      b.setAttribute('aria-label', pad2(i + 1) + ' ' + NAV[id].cn + ' · ' + NAV[id].en);
      b.innerHTML = '<i aria-hidden="true"></i><u>' + pad2(i + 1) + '</u><span>' + esc(NAV[id].cn) + '</span>';
      host.appendChild(b);
      if (i < NAV_ORDER.length - 1) {
        var hatch = node('span', 'mcr__hatch');
        hatch.setAttribute('aria-hidden', 'true');
        host.appendChild(hatch);
      }
    });
  }

  function syncRuler() {
    $$('#rulerTicks .mcr__tick').forEach(function (b) {
      var on = b.dataset.nav === S.ui.screen;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      if (on && b.parentNode) {
        var strip = b.parentNode;
        var tr = strip.getBoundingClientRect(), br = b.getBoundingClientRect();
        if (br.left < tr.left || br.right > tr.right) strip.scrollLeft += (br.left - tr.left) - 8;
      }
    });
    var id = NAV_ORDER.indexOf(S.ui.screen);
    var fi = $('#footIndex'), ft = $('#footTotal');
    if (fi) fi.textContent = pad2(id + 1);
    if (ft) ft.textContent = pad2(NAV_ORDER.length);
    var lab = $('#rulerLabel');
    if (lab) lab.textContent = NAV[S.ui.screen].name;
  }

  function switchScreen(name) {
    var from = document.querySelector('.mcs.is-shown');
    var to = document.querySelector('.mcs[data-screen="' + name + '"]');
    if (!to) return;
    /* ContentTransition：同一帧隐藏旧页、显示新页，共同容器 .35 → 1（360ms） */
    $$('.mcs').forEach(function (sc) {
      var on = sc === to;
      sc.hidden = !on;
      sc.classList.toggle('is-shown', on);
      sc.classList.remove('is-entering');
    });
    void to.offsetWidth;
    to.classList.add('is-entering');
    setTimeout(function () { to.classList.remove('is-entering'); }, M.reduced ? 0 : 420);

    renderScreenContent(name);
    syncRuler();
    npInfo();
    updateFoot();

    /* 从刻度尺长出下一页（共享元素连续过渡）；没有起点时用光圈 */
    var ct = to.querySelector('.mcs__ct');
    if (ct) {
      if (pendingOrigin && pendingOrigin.rect && !M.reduced) M.carry(pendingOrigin.rect, ct, { duration: 360 });
      else if (pendingOrigin && pendingOrigin.point) M.iris(ct, { origin: pendingOrigin.point, duration: 420 });
    }
    pendingOrigin = null;
    document.title = 'Mock 平台 · V5 · ' + NAV[name].cn + ' · 音乐调测台';
    navLock = false;
  }

  function renderScreenContent(name) {
    if (name === 'mock') renderMock();
    else if (name === 'flow') renderFlow();
    else if (name === 'ne') renderNe();
    else if (name === 'omp') renderOmp();
    else if (name === 'lcm') renderLcm();
    else if (name === 'vlp') renderVlp();
    enhanceAll(name);
  }

  function go(name, btn) {
    if (navLock) return;
    if (S.ui.screen === name && !btn) return;
    navLock = true;
    if (btn) pendingOrigin = { rect: btn.getBoundingClientRect() };
    MP.sfx.play('iris');
    A.setScreen(name);
    setTimeout(function () { navLock = false; }, 400);
  }

  function updateFoot() {
    var k = SEL.kpis();
    var p = SEL.port();
    var dot = $('#footDot'), st = $('#footStatus'), dt = $('#footDetail');
    if (dot) dot.className = 'mcf__dot ' + (k.running ? 'is-run' : 'is-idle');
    if (st) st.textContent = k.running ? '服务运行中 ' + k.running + ' / ' + k.ports : '全部端口已停止';
    if (dt) {
      var last = S.logs[0];
      dt.textContent = (p ? p.ip + ':' + p.port : '—') + ' · 请求 ' + k.req + ' · 异常 ' + k.err + ' · 平均 ' + k.avgLat + 'ms' +
        (last ? ' · 最近 ' + last.clock + ' ' + last.method + ' ' + last.path + ' → ' + last.status : '');
    }
  }

  /* ============================================================ 焦点保护 */
  function keepFocus(fn) {
    var a = document.activeElement;
    var key = null;
    if (a && a.dataset) {
      if (a.dataset.fkey) key = { t: 'fk', v: a.dataset.fkey };
      else if (a.dataset.fid && a.dataset.prop) key = { t: 'fp', v: a.dataset.fid, p: a.dataset.prop };
      else if (a.dataset.fid && a.dataset.rk) key = { t: 'fr', v: a.dataset.fid, p: a.dataset.rk };
      else if (a.dataset.logId) key = { t: 'lg', v: a.dataset.logId };
    }
    if (!key && a && a.id) key = { t: 'id', v: a.id };
    var ss = null, se = null;
    try { ss = a && a.selectionStart; se = a && a.selectionEnd; } catch (e) { ss = null; }
    var hosts = [$('#stage'), $('.mcar__strip'), $('#fLogBody'), document.scrollingElement || root];
    var tops = hosts.map(function (h) { return h ? h.scrollTop : 0; });
    fn();
    hosts.forEach(function (h, i) { if (h && h.scrollTop !== tops[i]) h.scrollTop = tops[i]; });
    if (!key) return;
    var n = null;
    if (key.t === 'id') n = document.getElementById(key.v);
    else if (key.t === 'fk') n = document.querySelector('[data-fkey="' + key.v + '"]');
    else if (key.t === 'fp') n = document.querySelector('[data-fid="' + key.v + '"][data-prop="' + key.p + '"]');
    else if (key.t === 'fr') n = document.querySelector('[data-fid="' + key.v + '"][data-rk="' + key.p + '"]');
    else if (key.t === 'lg') n = document.querySelector('[data-log-toggle="' + key.v + '"]');
    if (n && n.focus) {
      n.focus();
      try { if (ss != null && n.setSelectionRange) n.setSelectionRange(ss, se); } catch (e) { /* number/select 不支持 */ }
    }
  }

  function wireA11y(scope) {
    MP.btn.enhance(scope || document);
    wireMagnets(scope);
  }
  function wireMagnets(scope) {
    /* 一屏最多 1–2 个磁吸焦点（技能硬约束）：只给首页行动 */
    var host = (scope && scope.querySelectorAll) ? scope : document;
    if (host === document) {
      var screen = document.querySelector('.mcs.is-shown');
      if (!screen) return;
      host = screen;
    }
    var cta = host.querySelector('.mcact');
    if (cta && !cta.__mag) {
      cta.dataset.fx = 'magnetic';
      cta.__mag = MP.micro.magnetic(cta, { strength: 0.16 });
    }
    var card = host.querySelector('.mcard');
    if (card && !card.__spot) card.__spot = MP.micro.spotlight(card);
  }
  function enhanceAll(screen) {
    var host = document.querySelector('.mcs[data-screen="' + screen + '"]');
    if (!host) return;
    MP.btn.enhance(host);
    wireMagnets(host);
  }

  /* ------------------------------------------------------------ 全局事件委托 */
  function bindDelegates() {
    document.addEventListener('click', function (e) {
      markInteract();
      var t = e.target;
      var col = t.closest && t.closest('.mcar__colhd');
      if (col) { S.sel[S.ui.screen][0] = +col.dataset.col; commitSel(S.ui.screen, true); return; }
      var card = t.closest && t.closest('.mcard:not(.is-empty)');
      if (card) { S.sel[S.ui.screen][0] = +card.dataset.col; S.sel[S.ui.screen][1] = +card.dataset.k; commitSel(S.ui.screen, true); return; }

      var step = t.closest && t.closest('[data-car-step]');
      if (step) {
        var sc = step.dataset.carStep;
        if (e.shiftKey) moveCard(sc, +step.dataset.dir); else moveCol(sc, +step.dataset.dir);
        return;
      }
      var tick = t.closest && t.closest('.mcr__tick');
      if (tick) { go(tick.dataset.nav, tick); return; }
      var drawerGo = t.closest && t.closest('[data-drawer-go]');
      if (drawerGo) { closeDrawer(); go(drawerGo.dataset.drawerGo, drawerGo); return; }

      var lt = t.closest && t.closest('[data-log-toggle]');
      if (lt) {
        var row = lt.closest('.mclog__row');
        var bd = row && row.querySelector('.mclog__bd');
        if (bd) {
          bd.hidden = !bd.hidden;
          lt.setAttribute('aria-expanded', bd.hidden ? 'false' : 'true');
          if (!bd.hidden && !M.reduced) bd.animate ? bd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }) : null;
        }
        return;
      }
      var rp = t.closest && t.closest('[data-replay]');
      if (rp) {
        var l = MP.byId(S.logs, rp.dataset.replay);
        var api = l && S.apis.filter(function (x) { return x.path === l.path; })[0];
        if (api) A.triggerApi(api.id); else toast('无法重放', '该路径没有匹配的接口定义', { tone: 'warn', duration: 2400 });
        renderLogRows();
        return;
      }
      var ix = t.closest && t.closest('[data-ix]');
      if (ix) {
        A.resolveInteraction(ix.dataset.log, ix.dataset.ix);
        renderLogRows();
        toast(ix.dataset.ix === 'approve' ? '已放行该请求' : '已拒绝该请求',
          ix.dataset.ix === 'approve' ? '流程继续执行，状态码 200' : '流程终止，状态码 403',
          { tone: ix.dataset.ix === 'approve' ? 'ok' : 'danger', duration: 3000 });
        pushHist(S.logs[0]);
        return;
      }
      var rmF = t.closest && t.closest('[data-remove-field]');
      if (rmF) {
        var aid = S.ui.selectedApi;
        A.removeField(aid, rmF.dataset.removeField);
        renderFields(SEL.api(), true);
        patchFlowCard();
        toast('已删除字段', '该字段不再出现在响应里', { tone: 'warn', duration: 2400 });
        return;
      }
      var rmIx = t.closest && t.closest('[data-remove-ix]');
      if (rmIx) {
        A.removeInteraction(S.ui.selectedApi, rmIx.dataset.removeIx);
        renderIx(SEL.api());
        patchFlowCard();
        toast('已移除人机交互', '该接口恢复直接返回', { tone: 'warn', duration: 2400 });
        return;
      }
      var up = t.closest && t.closest('[data-step-up]');
      var dn = t.closest && t.closest('[data-step-down]');
      if (up || dn) {
        var ne = MP.byId(S.nes, S.sel.neId);
        A.moveStep(ne.id, (up || dn).dataset[up ? 'stepUp' : 'stepDown'], up ? -1 : 1);
        renderNeFlow(MP.byId(S.nes, S.ne.id));
        return;
      }
      var del = t.closest && t.closest('[data-step-del]');
      if (del) {
        var ne2 = MP.byId(S.nes, S.sel.neId);
        A.removeStep(ne2.id, del.dataset.stepDel);
        renderNeFlow(MP.byId(S.nes, ne2.id));
        toast('已删除升级步骤', '后续步骤顺序保持不变', { tone: 'warn', duration: 2400 });
        return;
      }
      var adv = t.closest && t.closest('[data-task-adv]');
      if (adv) {
        var self = adv;
        var done = MP.btn.loading(self, '推进中');
        var tid = self.dataset.taskAdv;
        setTimeout(function () {
          A.advanceTask(tid);
          done();
          var tk = MP.byId(S.tasks, tid);
          toast('任务已推进', tk ? tk.name + ' · ' + tk.progress + '% · ' + tk.status : '', {
            tone: tk && tk.status === 'waiting-human' ? 'warn' : 'ok', duration: 3200
          });
        }, 420);
        return;
      }
      if (t.closest && t.closest('[data-drawer-close]')) { closeDrawer(); return; }
    });

    /* 字段编辑：input / change 委托（写回 MP，不整屏重画，避免打断输入） */
    document.addEventListener('input', function (e) {
      markInteract();
      var el = e.target;
      if (el.dataset && el.dataset.fid) {
        if (el.dataset.prop === 'options') {
          A.updateField(S.ui.selectedApi, el.dataset.fid, { options: el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
        } else if (el.dataset.rk) {
          var v = el.value;
          var num = parseFloat(v);
          A.updateField(S.ui.selectedApi, el.dataset.fid, { rule: buildRule(el.dataset.rk, isNaN(num) ? v : num, el) });
        } else if (el.dataset.prop) {
          var patch = {};
          patch[el.dataset.prop] = el.value;
          A.updateField(S.ui.selectedApi, el.dataset.fid, patch);
        }
      }
      updateFoot();
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset && el.dataset.fid && (el.dataset.prop === 'rule.kind')) {
        var kind = el.value;
        var base = { kind: kind };
        if (kind === 'increment') { base.start = 1; base.step = 1; base.pattern = 'ID-{n:04}'; }
        if (kind === 'once') { base.times = 1; base.fallback = 'EXPIRED'; }
        if (kind === 'conditional') { base.when = { key: 'code', op: '等于', value: '0' }; base.then = ''; base.else = ''; }
        A.updateField(S.ui.selectedApi, el.dataset.fid, { rule: base });
        renderFields(SEL.api(), true);
        toast('字段规则已切换', ruleMeta(kind).name + ' · ' + ruleMeta(kind).hint, { duration: 2600 });
        return;
      }
      if (el.dataset && el.dataset.ompGroup) { A.assignGroup(el.dataset.ompGroup, el.value); toast('网元组已重新分配', el.value ? groupName(el.value) : '未成组', { duration: 2400 }); return; }
      if (el.dataset && el.dataset.pkgType) { patchPackage(el.dataset.pkgType, { type: el.value }); return; }
      if (el.dataset && el.dataset.pkgNe) { patchPackage(el.dataset.pkgNe, { ne: el.value }); return; }
      if (el.dataset && el.dataset.pkgVendor) { patchPackage(el.dataset.pkgVendor, { vendor: el.value }); return; }
      if (el.dataset && el.dataset.pkgVer) { patchPackage(el.dataset.pkgVer, { version: el.value }); return; }
      if (el.id === 'vPri' || el.id === 'vSec') {
        if ($('#vPri').value === $('#vSec').value) { fieldErr('vSec', '主站点与副站点不能相同'); }
        else fieldErr('vSec', '');
      }
    });

    /* 六个界面共用的键盘：← → 切列 / ↑ ↓ 切卡 / 数字键切界面 */
    document.addEventListener('keydown', function (e) {
      markInteract();
      if (e.key === 'Escape') { closeDrawer(); return; }
      var tag = (e.target.tagName || '').toLowerCase();
      var editing = tag === 'input' || tag === 'select' || tag === 'textarea';
      if (editing) return;
      if (e.target.closest && e.target.closest('[role="slider"]')) return;   /* scrub 自己处理方向键 */
      var s = S.ui.screen;
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveCol(s, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCol(s, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCard(s, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveCard(s, 1); }
      else if (e.key >= '1' && e.key <= '6') { go(NAV_ORDER[+e.key - 1]); }
      else if (e.key === 't' || e.key === 'T') { switchTheme(S.ui.theme === 'dawn' ? 'moon' : 'dawn'); }
      else if (e.key === 'l' || e.key === 'L') { toggleLoop(); }
      else if (e.key === ' ') {
        if (e.target.closest && e.target.closest('button')) return;
        e.preventDefault(); toggleService();
      }
    });

    /* transport */
    $('#btnMain').addEventListener('click', toggleService);
    $('#btnLoop').addEventListener('click', toggleLoop);
    $('#btnReplay').addEventListener('click', function () {
      var a = SEL.api();
      if (!a) return;
      var log = A.triggerApi(a.id);
      if (S.ui.screen === 'flow') renderLogRows();
      toast('已重放一次', a.method + ' ' + a.path + (log ? ' → ' + log.status : ''), { duration: 2400 });
    });
    $('#btnStopFuse').addEventListener('click', function () {
      var p = SEL.port();
      if (!p) return;
      if (!p.running) { toast('当前端口已经是停止状态', p.ip + ':' + p.port, { tone: 'warn', duration: 2400 }); return; }
      A.stopService(p.id);
      toast('已停止 ' + p.ip + ':' + p.port, '4 秒内可撤销', {
        tone: 'warn', duration: 4200, actionLabel: '撤销停止',
        onAction: function () { A.startService(p.id); toast('已恢复服务', p.ip + ':' + p.port, { tone: 'ok', duration: 2400 }); }
      });
    });
  }

  function buildRule(key, val, el) {
    switch (key) {
      case 'start': return { start: val };
      case 'step': return { step: val };
      case 'pattern': return { pattern: val };
      case 'times': return { times: val };
      case 'fallback': return { fallback: val };
      case 'then': return { then: val };
      case 'else': return { else: val };
      case 'when.key': return { when: withWhen(el, 'key', val) };
      case 'when.op': return { when: withWhen(el, 'op', val) };
      case 'when.value': return { when: withWhen(el, 'value', val) };
      default: return {};
    }
  }
  /* 条件规则的 when 是一个对象：从行的隐藏基准里取当前值再改一个键 */
  function withWhen(el, k, val) {
    var row = el && el.closest ? el.closest('.mcfw__row') : null;
    var base = row ? row.querySelector('[data-rk="when.base"]') : null;
    var when = {};
    try { when = JSON.parse(base ? base.value : '{}') || {}; } catch (e) { when = {}; }
    when[k] = val;
    if (base) base.value = JSON.stringify(when);
    return when;
  }

  function toggleService() {
    var p = SEL.port();
    if (!p) return;
    if (p.running) {
      A.stopService(p.id);
      toast('已暂停 mock 服务', p.ip + ':' + p.port + ' 不再应答请求', { tone: 'warn', duration: 3000 });
    } else {
      A.startService(p.id);
      MP.btn.ripple($('#btnMain'), null);
      toast('mock 服务已启动', p.ip + ':' + p.port + ' · ' + SEL.capsOfPort(p.id).length + ' 项能力', { tone: 'ok', duration: 3000 });
    }
  }
  function toggleLoop() {
    S.ui.running = !S.ui.running;
    if (S.ui.running) {
      MP.sim.start(Math.max(360, Math.round(2600 / (rate / 2))));
      toast('循环重放已开启', '自动按流速产生对端请求，日志持续追加', { tone: 'ok', duration: 3000 });
    } else {
      MP.sim.stop();
      toast('循环重放已关闭', '审计日志不再自动追加', { tone: 'warn', duration: 2600 });
    }
    var sw = $('#btnLoop');
    if (sw) sw.setAttribute('aria-pressed', S.ui.running ? 'true' : 'false');
    var dot = $('#footDot');
    if (dot) dot.className = 'mcf__dot ' + (SEL.kpis().running ? 'is-run' : 'is-idle');
  }

  function markInteract() {
    lastInteract = performance.now();
  }

  /* --------------------------------------------- 常态轻微波动（缓入 2.5s） */
  function ambientLoop() {
    var host = document.querySelector('.mcs.is-shown');
    if (!host) return;
    var now = performance.now();
    stepWaves(now);
    var cards = $$('.mcar__col', host);
    if (!cards.length) return;
    var idle = MP.clamp((now - lastInteract - 2500) / 1600, 0, 1);   /* 交互后 2.5s 缓入 */
    if (M.reduced || idle <= 0) return;
    var t = now / 1000;
    cards.forEach(function (col, ci) {
      /* 列与列之间异步：相邻列有相位差（每列 0.55 弧度） */
      var phase = ci * 0.55;
      var amp = Math.sin(t * 0.9 + phase) * (2.6 * idle);
      col.style.transform = 'translateY(' + amp.toFixed(2) + 'px)';
      var hd = col.querySelector('.mcar__colhd');
      if (hd) {
        var hAmp = Math.sin(t * 0.9 + phase + 0.4) * (1.6 * idle);
        hd.style.transform = 'translateY(' + hAmp.toFixed(2) + 'px)';
      }
    });
    var nowEl = $('.mcr__now');
    var sel = S.sel[S.ui.screen] ? S.sel[S.ui.screen][0] : 0;
    if (nowEl) nowEl.style.transform = 'translateY(' + (Math.sin(t * 0.8 + sel * 0.55) * 1.4 * idle).toFixed(2) + 'px)';
  }

  /* ================================================================ 订阅 */
  MP.subscribe(function (state, evt) {
    var t = evt.type;
    if (t === 'screen') { switchScreen(state.ui.screen); return; }

    if (t === 'log') {
      pushHist(evt.log);
      renderTransport();
      updateFoot();
      if (state.ui.screen === 'flow') {
        /* 只有日志列表局部重画，输入框与展开态尽量保留 */
        var open = $$('.mclog__row').filter(function (r) { var b = r.querySelector('.mclog__bd'); return b && !b.hidden; }).map(function (r) { return r.dataset.logId; });
        keepFocus(function () {
          renderLogRows();
          open.forEach(function (id) {
            var r = document.querySelector('.mclog__row[data-log-id="' + id + '"]');
            if (r) { var b = r.querySelector('.mclog__bd'); if (b) b.hidden = false; var h = r.querySelector('.mclog__hd'); if (h) h.setAttribute('aria-expanded', 'true'); }
          });
        });
      }
      return;
    }
    if (t === 'stats') { renderTransport(); updateFoot(); return; }

    if (t === 'select-port' || t === 'ports' || t === 'cert' || t === 'caps' || t === 'service') {
      renderTransport();
      updateFoot();
      if (state.ui.screen === 'mock') keepFocus(renderMock);
      return;
    }
    if (t === 'select-api' || t === 'api' || t === 'fields' || t === 'interactions') {
      if (state.ui.screen === 'flow') {
        if (t === 'select-api' || t === 'interactions') keepFocus(renderFlowDetail);
        else if (t === 'fields') { keepFocus(function () { renderFields(SEL.api(), true); }); }
      }
      npInfo();
      return;
    }
    if (t === 'log-filter' || t === 'log-query') {
      if (state.ui.screen === 'flow') keepFocus(renderLogRows);
      updateFoot();
      return;
    }
    if (t === 'interaction-resolved') { renderTransport(); if (state.ui.screen === 'flow') keepFocus(renderLogRows); return; }

    if (t === 'ne' || t === 'group' || t === 'validation') {
      if (state.ui.screen === 'ne') keepFocus(renderNe);
      updateFoot();
      return;
    }
    if (t === 'upgrade') { if (state.ui.screen === 'ne') keepFocus(function () { renderNeFlow(MP.byId(S.nes, S.sel.neId)); }); return; }
    if (t === 'validation-run') { updateFoot(); return; }

    if (t === 'account' || t === 'task' || t === 'deploy') {
      if (state.ui.screen === 'omp') keepFocus(renderOmp);
      if (state.ui.screen === 'lcm') keepFocus(renderLcm);
      updateFoot();
      return;
    }
    if (t === 'package') { if (state.ui.screen === 'lcm') keepFocus(renderLcm); updateFoot(); return; }
    if (t === 'vlp') { if (state.ui.screen === 'vlp') keepFocus(renderVlp); updateFoot(); return; }
  });

  /* ================================================================== 启动 */
  function boot() {
    /* 主题（先应用，避免闪一下默认主题） */
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    applyTheme(saved === 'moon' ? 'moon' : 'dawn');

    MP.btn.install();
    if (M.reduced) BODY.classList.add('reduce-motion');

    buildRuler();
    /* 初始选中同步到状态层 */
    S.ports.forEach(function (p, i) { if (p.id === S.ui.selectedPort) S.sel.mock[0] = i; });
    S.sel.neId = S.nes[0] ? S.nes[0].id : '';
    S.sel.ne[0] = 0; S.sel.ne[1] = 0;

    S.ui.screen = S.ui.screen || 'mock';
    $$('.mcs').forEach(function (sc) { sc.hidden = sc.dataset.screen !== S.ui.screen; });
    renderScreenContent(S.ui.screen);
    syncRuler();
    setupTimeline();
    /* 会话时间轴先灌入历史日志（让 scrub 一上来就有内容） */
    S.logs.slice().reverse().forEach(function (l) { hist.push(l); if (hist.length > 120) hist.shift(); });
    tl.max = Math.max(0, hist.length - 1);
    tl.value = tl.max;
    if ($('#tlTrack')) $('#tlTrack').setAttribute('aria-valuemax', String(tl.max));
    renderTransport();
    updateFoot();
    bindDelegates();
    wireA11y(document);

    /* 首次进场：从刻度尺展开（不硬切） */
    var first = document.querySelector('.mcs[data-screen="' + S.ui.screen + '"] .mcs__ct');
    if (first && !M.reduced) M.develop(first, { duration: 420 });

    /* 全局动效循环：频谱 + 常态波动 */
    (function loop() { rampLoop(); ambientLoop(); requestAnimationFrame(loop); })();

    /* 流量模拟 */
    if (SEL.kpis().running > 0) { MP.sim.start(Math.max(360, Math.round(2600 / (rate / 2)))); S.ui.running = true; }
    var swLoop = $('#btnLoop');
    if (swLoop) swLoop.setAttribute('aria-pressed', S.ui.running ? 'true' : 'false');

    /* 顶栏与抽屉 */
    $('#libraryBtn').addEventListener('click', function () { openDrawer('index'); });
    $('#settingsBtn').addEventListener('click', function () { openDrawer('settings'); });
    $('#popClose').addEventListener('click', closeDrawer);
    $$('[data-theme-set]').forEach(function (b) { b.addEventListener('click', function () { switchTheme(b.dataset.themeSet); }); });
    $('#sfxBtn').addEventListener('click', function () {
      var on = MP.sfx.toggle();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.setAttribute('aria-label', on ? '界面音效已开启' : '界面音效（默认关闭）');
      toast(on ? '界面音效已开启' : '界面音效已关闭', on ? '所有交互共用同一空间感的合成音' : '静音模式下仍保留完整视觉反馈', { duration: 2600 });
    });
    document.addEventListener('click', function (e) {
      var pop = $('#popDrawer');
      if (pop.hidden) return;
      if (e.target.closest && (e.target.closest('#popDrawer') || e.target.closest('#libraryBtn') || e.target.closest('#settingsBtn'))) return;
      closeDrawer();
    });
    window.addEventListener('resize', function () { movePill(); drawSpec(); });

    setInterval(function () {
      var c = $('#footClock');
      if (c) c.textContent = MP.clock();
      if (!document.hidden) { var p = SEL.port(); if (p) p.stats.rps = p.running ? +(0.6 + Math.random() * 4.4).toFixed(1) : 0; }
    }, 1000);
    var fc = $('#footClock');
    if (fc) fc.textContent = MP.clock();

    M.reveal(BODY);
    /* 主题底板 / 频谱要等布局完成才算得准 */
    requestAnimationFrame(function () { movePill(); drawSpec(); });
    MP.sfx.play('boot');
    console.log('%c[Mock 平台 V5 · 音乐调测台] 已就绪 · 6 个界面 · 数字键 1–6 · ← → 切列 · ↑ ↓ 切卡 · T 切主题 · 空格启停服务',
      'color:#a67d48');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ==========================================================================
 * 原图补遗 · Lead 追加（2026-10-16）
 *   · 略缩图模式（原图右上「略缩图模式」）：只切 .mc 上的 data-thumb，布局由 CSS 负责，偏好存 localStorage
 *   · LOCAL COLLECTION 统计（原图左下 69 ALBUMS / 454 TRACKS → 端点 / 接口）
 *   · FPS 运行时状态（原图右下 59 FPS / 晨雾 / V0.5.0）
 * 独立 IIFE，仅读 MP.state，不改既有渲染与动效。
 * ==========================================================================*/
(function () {
  'use strict';
  var MP = window.MP; if (!MP) return;
  var S = MP.state;

  /* ---------------------------------------------------------- 略缩图模式 */
  var THUMB_KEY = 'mp-v5-thumb';
  function thumbOn() { try { return localStorage.getItem(THUMB_KEY) === '1'; } catch (e) { return false; } }
  function applyThumb(on) {
    var root = document.getElementById('mc') || document.body;
    root.setAttribute('data-thumb', on ? 'on' : 'off');
    var b = document.getElementById('thumbBtn');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function startThumb() {
    var b = document.getElementById('thumbBtn');
    applyThumb(thumbOn());
    if (!b) return;
    b.addEventListener('click', function () {
      var on = !(document.getElementById('mc').getAttribute('data-thumb') === 'on');
      applyThumb(on);
      try { localStorage.setItem(THUMB_KEY, on ? '1' : '0'); } catch (e) {}
      if (MP.sfx) MP.sfx.play('toggle');
    });
  }

  /* ------------------------------------------------- LOCAL COLLECTION 统计 */
  function collText() {
    var ports = S.ports.length;
    var eps = 0;
    S.ports.forEach(function (p) {
      p.caps.forEach(function (cid) {
        var c = MP.byId ? MP.byId(S.caps, cid) : S.caps.filter(function (x) { return x.id === cid; })[0];
        if (c) eps += c.endpoints;
      });
    });
    return 'LOCAL COLLECTION ' + ports + ' / ' + eps;
  }
  function renderColl() {
    var el = document.getElementById('collStats');
    if (el) el.textContent = collText();
  }

  /* ------------------------------------------------------- FPS 运行时状态 */
  function themeName() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'moon' ? '月影' : '晨雾';
  }
  function startFps() {
    var el = document.getElementById('fpsBadge');
    if (!el) return;
    var frames = 0, last = performance.now();
    function tick(now) {
      frames++;
      if (now - last >= 500) {
        var fps = Math.round(frames * 1000 / (now - last));
        el.textContent = fps + ' FPS · ' + themeName() + ' · V0.5';
        el.classList.toggle('is-low', fps < 40);
        frames = 0; last = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function start() {
    startThumb(); renderColl(); startFps();
    // 主题切换后立刻刷新 FPS 那一格里的主题名
    var sw = document.getElementById('themeSwitch');
    if (sw) sw.addEventListener('click', function () { setTimeout(function () { var el = document.getElementById('fpsBadge'); if (el) el.textContent = el.textContent.replace(/(晨雾|月影)/, themeName()); }, 30); });
    if (MP.subscribe) MP.subscribe(function () { renderColl(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ============================================================================
   业务面 / 管理面 共用的前端口袋（零依赖）
   - 两个应用各自是独立的 index.html + app.js，只共用这一层
   - 共用的是「工具 + API 客户端 + 视觉令牌」，不是「同一个页面」
   ==========================================================================*/
(function () {
  'use strict';

  const RL = {};

  /* ---------------------------------------------------------------- DOM 工具 */
  RL.$ = (s, r) => (r || document).querySelector(s);
  RL.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  RL.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  RL.nf = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
  RL.pad2 = (n) => String(n).padStart(2, '0');
  RL.hhmmss = (ms) => {
    const d = new Date(ms);
    return RL.pad2(d.getHours()) + ':' + RL.pad2(d.getMinutes()) + ':' + RL.pad2(d.getSeconds());
  };
  RL.mmdd = (ms) => {
    const d = new Date(ms);
    return RL.pad2(d.getMonth() + 1) + '-' + RL.pad2(d.getDate()) + ' ' + RL.hhmmss(ms);
  };
  RL.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  RL.pretty = (body) => {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch (e) {
      return body;
    }
  };

  /* ------------------------------------------------------------------ toast */
  let tTimer = null;
  RL.toast = function (msg, kind, ms) {
    const t = RL.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast on' + (kind ? ' toast--' + kind : '');
    t.hidden = false;
    clearTimeout(tTimer);
    tTimer = setTimeout(() => {
      t.classList.remove('on');
      setTimeout(() => (t.hidden = true), 260);
    }, ms || 2600);
  };

  /* -------------------------------------------------------------- API 客户端 */
  /**
   * 会话模型：
   *  · L 端（authRequired=true）：登录拿 HttpOnly Cookie + CSRF，写操作带 X-CSRF
   *  · W 端业务面（authRequired=false）：本机直连，无 Cookie 无 CSRF
   * 两种模式共用同一个客户端，差异只由服务端 /api/meta 决定。
   */
  RL.client = function (base) {
    const st = { base: (base || '').replace(/\/+$/, ''), csrf: '' };
    async function req(path, opts) {
      opts = opts || {};
      const headers = Object.assign({}, opts.headers || {});
      const method = (opts.method || 'GET').toUpperCase();
      if (opts.body) headers['content-type'] = 'application/json';
      if (st.csrf && method !== 'GET') headers['X-CSRF'] = st.csrf;
      const res = await fetch(st.base + path, {
        method,
        credentials: 'include',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { raw: text };
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || 'HTTP ' + res.status);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }
    return {
      req,
      setCsrf(v) {
        st.csrf = v || '';
      },
      get csrf() {
        return st.csrf;
      }
    };
  };

  /* ------------------------------------------------------- 启动序列（共用） */
  /** 逐字揭示若干行；返回 Promise。reduced-motion 时直接铺满。 */
  RL.typeLines = async function (host, verbHost, lines, onStage) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.innerHTML = '';
    if (reduced) {
      host.innerHTML = lines.map((l) => `<span class="ln">${RL.esc(l[0])} <b>${RL.esc(l[1])}</b></span>`).join('');
      if (verbHost) verbHost.textContent = 'AWAITING CREDENTIALS';
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      const [label, value] = lines[i];
      const line = document.createElement('span');
      line.className = 'ln';
      host.appendChild(line);
      const full = label + '  ';
      for (let k = 0; k <= full.length; k++) {
        line.innerHTML = RL.esc(full.slice(0, k)) + (k < full.length ? '<span class="cursor">▌</span>' : '');
        await RL.sleep(k < 6 ? 26 : 12);
      }
      line.innerHTML = RL.esc(label) + '  <b>' + RL.esc(value) + '</b>';
      if (onStage) onStage(i);
      await RL.sleep(90);
    }
  };

  /** 四帧闪切（对应原片的 25fps 闪切语言） */
  RL.flicker = function (el, ms) {
    if (!el) return;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), ms || 240);
  };

  RL.bootClock = function (sel) {
    const tick = () => {
      const el = RL.$(sel);
      if (el) el.textContent = RL.hhmmss(Date.now());
    };
    tick();
    return setInterval(tick, 1000);
  };

  window.RL = RL;
})();

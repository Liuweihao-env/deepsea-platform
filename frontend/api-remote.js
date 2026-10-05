/* ============================================================
   api-remote.js —— 把 API 门面指向真实后端
   ============================================================
   机制：
     index.html 里先加载 /api/boot.js
       · 由后端托管时 → 该文件存在，设置 window.__API_BASE__ = ""
       · 由普通静态服务器托管时 → 该文件 404，什么都不发生
     于是本文件自动判断：有后端就走后端，没有就继续用本地 mock。

   本文件**覆盖 mock.js 暴露的 API 门面的方法**，页面代码一行不用改
   （这正是"先把接口冻结"换来的东西）。

   建立：2026-10-05
   ============================================================ */
(function (global) {
  'use strict';

  if (typeof global.__API_BASE__ === 'undefined') return;   // 没有后端 → 保持 mock
  const M = global.API;
  if (!M) return;

  const B = global.__API_BASE__ || '';
  M.remote = true;

  function qs(params) {
    if (!params) return '';
    const parts = [];
    Object.keys(params).forEach(function (k) {
      const v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function get(path, params) {
    return fetch(B + path + qs(params)).then(function (r) { return r.json(); });
  }

  function post(path, body) {
    return fetch(B + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  /* ---------- 同步/异步兼容 ----------
     页面里 load() 的写法是 API.resolve(API.env(...), function (d) { ... })
     本地 mock 返回普通值 → 直接回调
     远端返回 Promise      → 等回来再回调
     两种模式共用同一份页面代码。 */
  M.resolve = function (v, cb) {
    if (v && typeof v.then === 'function') { v.then(cb); return; }
    cb(v);
  };

  /* ---------- 指令与告警：轮询保持新鲜 ----------
     后端的状态机是在服务端跑的，前端拿不到推送，所以定时拉。
     （WebSocket 是后续优化项，不是本期硬线） */
  let _cmds = [], _alarms = [];
  const POLL_MS = 900;

  function poll() {
    get('/api/commands').then(function (d) {
      if (Array.isArray(d)) { _cmds = d; M._bump(); }
    }).catch(function () {});
    get('/api/alarms').then(function (d) {
      if (Array.isArray(d)) { _alarms = d; M._bump(); }
    }).catch(function () {});
  }
  M._bump = function () { (M._subs || []).forEach(function (f) { try { f(); } catch (e) {} }); };
  M._subs = [];

  M.subscribe = function (f) {
    M._subs.push(f);
    return function () {
      const i = M._subs.indexOf(f);
      if (i >= 0) M._subs.splice(i, 1);
    };
  };

  poll();
  setInterval(poll, POLL_MS);

  /* ---------- 覆盖各接口 ---------- */
  M.sites = function () { return M._sites || []; };
  M.env = function (site, minutes, opts) {
    opts = opts || {};
    return get('/api/env', { site_id: site, minutes: minutes || 60,
                             storm: opts.storm ? 1 : 0, heat: opts.heat ? 1 : 0,
                             offline: opts.offline ? 1 : 0 });
  };
  M.fish = function (m) { return get('/api/fish', { minutes: m || 60 }); };
  M.struct = function (m) { return get('/api/struct', { minutes: m || 60 }); };
  M.heatGrid = function () { return get('/api/heatmap').then(function (d) { return d.grid; }); };
  M.feedDecision = function () { return get('/api/feed/decision'); };
  M.feedRecords = function () { return get('/api/feed/records'); };
  M.devices = function () { return M._devices || []; };
  M.commands = function () { return _cmds.slice(); };
  M.alarms = function () { return _alarms.slice(); };
  M.alarm = function (id) {
    for (let i = 0; i < _alarms.length; i++) if (_alarms[i].alarm_event_id === id) return _alarms[i];
    return null;
  };
  M.sendCommand = function (deviceId, type, params, opts) {
    const body = { device_id: deviceId, command_type: type, params: params || {} };
    if (opts && opts.inject) body.inject = opts.inject;
    return post('/api/commands', body).then(function (c) { poll(); return c; });
  };

  /* 站点与设备：一次性拉，之后当静态配置用 */
  get('/api/sites').then(function (d) { if (Array.isArray(d)) { M._sites = d; M._bump(); } });
  get('/api/devices').then(function (d) { if (Array.isArray(d)) { M._devices = d; M._bump(); } });
  setInterval(function () {
    get('/api/devices').then(function (d) { if (Array.isArray(d)) { M._devices = d; M._bump(); } });
  }, 3000);

})(window);

/* ===========================================================
 *  auth.js —— 日常培训考核模块 · 授权码访问控制
 *  ---------------------------------------------------------
 *  设计说明（纯前端离线可用）：
 *  1) 授权码由后台生成，格式 LD-XXXX-XXXX-XXXX（12 位，去除易混淆字符）。
 *     码内自带「绑定用户哈希 + 到期日 + 序号 + 签名」，学员端可完全离线校验，
 *     无需联网、无需服务器，跨设备/跨电脑同样有效。
 *  2) 学员在「日常培训考核」入口提交申请：
 *     · 同一台电脑（同浏览器）：申请直接写入本机台账，后台立刻可见，
 *       后台点「授权」后学员端自动检测放行。
 *     · 跨设备：学员复制「申请码」发给管理员，管理员在后台粘贴录入即可看到
 *       申请人姓名/工号/部门/时间，再生成授权码回传。
 *  3) 后台可设定有效期（天）、随时撤销 / 恢复 / 延期 / 删除。
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS = global.LDWS || {};

  /* 站点内置密钥：随文件分发，保证所有终端一致，跨设备校验才能通过。
     如需更换，请在后台「日常授权管理」中修改，并把整份系统文件重新分发给全员。 */
  var BUILTIN_SECRET = 'LDWS-DAILY-AUTH-2025';

  /* 32 进制字母表（剔除易混淆的 I O 0 1） */
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var DAY = 86400000;
  var EPOCH = new Date(2025, 0, 1, 0, 0, 0, 0).getTime();   // 本地时间基准日
  var MAX_DAY = 4095;                                        // 12bit，可用至 2036 年

  /* ---------- 基础工具 ---------- */
  function h32(s) {
    s = String(s == null ? '' : s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  function enc20(n) {                       // 20bit → 4 字符
    n = (n >>> 0) & 0xFFFFF;
    var s = '';
    for (var i = 3; i >= 0; i--) s += ALPHA.charAt((n >>> (i * 5)) & 31);
    return s;
  }
  function dec20(s) {                       // 4 字符 → 20bit（失败返回 -1）
    if (!s || s.length !== 4) return -1;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = ALPHA.indexOf(s.charAt(i));
      if (v < 0) return -1;
      n = n * 32 + v;
    }
    return n;
  }
  function b64e(s) {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }
  function dayIdx(ts) { return Math.floor((ts - EPOCH) / DAY); }
  function dayEnd(idx) { return EPOCH + (idx + 1) * DAY - 1000; }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function fmtDay(ts) {
    var d = new Date(ts), p = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function rid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 配置 ---------- */
  function cfg() {
    var c = (L.Bank && L.Bank.cfg && L.Bank.cfg.daily && L.Bank.cfg.daily.auth) || null;
    if (!c) c = { enabled: true, days: 30, bind: true, secret: '' };
    return c;
  }
  function secret() { return (cfg().secret || '').trim() || BUILTIN_SECRET; }
  function saveCfg(patch) {
    if (!L.Bank || !L.Bank.cfg) return Promise.resolve();
    var d = L.Bank.cfg.daily = L.Bank.cfg.daily || {};
    var a = d.auth = d.auth || { enabled: true, days: 30, bind: true, secret: '', seq: 1 };
    Object.keys(patch || {}).forEach(function (k) { a[k] = patch[k]; });
    return L.Bank.saveCfg();
  }

  /* ---------- 授权码 ---------- */
  /**
   * 生成授权码
   * @param {string} user  绑定的登录用户名；传空串表示「通用码」（任何账号可用）
   * @param {number} expireAt 到期时间戳
   * @param {number} seq   序号 0~255
   */
  function makeCode(user, expireAt, seq) {
    var u = String(user || '').trim();
    var p1 = u ? (h32('U:' + u.toLowerCase()) & 0xFFFFF) : 0;
    if (u && p1 === 0) p1 = 1;                       // 0 保留给通用码
    var di = dayIdx(expireAt);
    if (di < 0) di = 0;
    if (di > MAX_DAY) di = MAX_DAY;
    var p2 = ((di & 0xFFF) << 8) | ((seq || 0) & 0xFF);
    var a = enc20(p1), b = enc20(p2);
    var sg = enc20(h32(a + b + '|' + secret()) & 0xFFFFF);
    return 'LD-' + a + '-' + b + '-' + sg;
  }

  function normalize(code) {
    var s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('LD') === 0) s = s.slice(2);
    return s;
  }

  /**
   * 校验授权码
   * @returns {{ok:boolean, reason:string, msg:string, expireAt:number, bound:boolean, seq:number}}
   */
  function verifyCode(code, user) {
    var s = normalize(code);
    if (s.length !== 12) return { ok: false, reason: 'format', msg: '授权码格式不正确（应为 LD-XXXX-XXXX-XXXX）' };
    var a = s.slice(0, 4), b = s.slice(4, 8), sg = s.slice(8, 12);
    var p1 = dec20(a), p2 = dec20(b), sig = dec20(sg);
    if (p1 < 0 || p2 < 0 || sig < 0) return { ok: false, reason: 'format', msg: '授权码含有无效字符，请核对后重新输入' };
    if ((h32(a + b + '|' + secret()) & 0xFFFFF) !== sig) {
      return { ok: false, reason: 'sign', msg: '授权码无效（校验失败），请向管理员核实' };
    }
    var di = (p2 >> 8) & 0xFFF, seq = p2 & 0xFF;
    var exp = dayEnd(di);
    var bound = p1 !== 0;
    if (bound) {
      var u = String(user || '').trim();
      var expect = h32('U:' + u.toLowerCase()) & 0xFFFFF;
      if (expect === 0) expect = 1;
      if (!u || expect !== p1) {
        return { ok: false, reason: 'user', msg: '该授权码不是发给当前登录账号的，请使用本人账号登录后再试' };
      }
    }
    if (Date.now() > exp) {
      return { ok: false, reason: 'expired', msg: '授权码已于 ' + fmtDay(exp) + ' 到期，请重新申请', expireAt: exp };
    }
    return { ok: true, reason: '', msg: '', expireAt: exp, bound: bound, seq: seq };
  }

  /* ---------- 申请码（学员 → 管理员） ---------- */
  function buildReqCode(p) {
    var body = b64e(JSON.stringify({
      u: p.user || '', n: p.name || '', o: p.no || '',
      d: p.dept || '', t: p.at || Date.now(), m: p.dev || '', r: p.note || ''
    }));
    var sg = enc20(h32(body + '|' + secret()) & 0xFFFFF);
    return 'LDREQ-' + body + '-' + sg;
  }
  function parseReqCode(str) {
    var s = String(str || '').trim().replace(/\s+/g, '');
    if (s.indexOf('LDREQ-') !== 0) return { ok: false, msg: '不是有效的申请码（应以 LDREQ- 开头）' };
    s = s.slice(6);
    var i = s.lastIndexOf('-');
    if (i < 0) return { ok: false, msg: '申请码不完整' };
    var body = s.slice(0, i), sg = s.slice(i + 1);
    if (enc20(h32(body + '|' + secret()) & 0xFFFFF) !== sg.toUpperCase()) {
      return { ok: false, msg: '申请码校验失败，可能在传输中被截断或修改' };
    }
    try {
      var o = JSON.parse(b64d(body));
      return {
        ok: true, data: {
          user: o.u || '', name: o.n || '', no: o.o || '',
          dept: o.d || '', at: o.t || Date.now(), dev: o.m || '', note: o.r || ''
        }
      };
    } catch (e) { return { ok: false, msg: '申请码内容无法解析' }; }
  }

  /* ---------- 设备标识 ---------- */
  var _dev = null;
  function deviceId() {
    if (_dev) return Promise.resolve(_dev);
    return L.Store.get('deviceId').then(function (v) {
      if (v) { _dev = v; return v; }
      _dev = rid().toUpperCase().slice(0, 8);
      return L.Store.set('deviceId', _dev).then(function () { return _dev; });
    });
  }

  /* ---------- 申请台账 ---------- */
  var reqs = {
    all: function () { return L.Store.get('authReqs').then(function (v) { return v || []; }); },
    save: function (list) { return L.Store.set('authReqs', list.slice(0, 500)); },
    add: function (item) {
      return reqs.all().then(function (list) {
        // 同一账号 + 待处理 → 覆盖更新，避免刷屏
        var i = -1;
        for (var k = 0; k < list.length; k++) {
          if (list[k].status === 'pending' &&
              ((item.user && list[k].user === item.user) ||
               (!item.user && list[k].name === item.name && list[k].dev === item.dev))) { i = k; break; }
        }
        var rec = {
          id: item.id || rid(), user: item.user || '', name: item.name || '',
          no: item.no || '', dept: item.dept || '', note: item.note || '',
          dev: item.dev || '', at: item.at || Date.now(),
          from: item.from || 'local', status: 'pending', code: ''
        };
        if (i >= 0) { rec.id = list[i].id; list[i] = rec; }
        else list.unshift(rec);
        return reqs.save(list).then(function () { return rec; });
      });
    },
    update: function (id, patch) {
      return reqs.all().then(function (list) {
        var f = list.filter(function (x) { return x.id === id; })[0];
        if (f) Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
        return reqs.save(list).then(function () { return f; });
      });
    },
    remove: function (id) {
      return reqs.all().then(function (list) {
        return reqs.save(list.filter(function (x) { return x.id !== id; }));
      });
    },
    clearDone: function () {
      return reqs.all().then(function (list) {
        return reqs.save(list.filter(function (x) { return x.status === 'pending'; }));
      });
    }
  };

  /* ---------- 授权台账 ---------- */
  var grants = {
    all: function () { return L.Store.get('authGrants').then(function (v) { return v || []; }); },
    save: function (list) { return L.Store.set('authGrants', list.slice(0, 800)); },
    /** 签发一张授权码 */
    issue: function (o) {
      var days = Math.max(1, parseInt(o.days, 10) || cfg().days || 30);
      var expireAt = dayEnd(dayIdx(today0()) + days - 1);
      var c = cfg();
      var seq = ((c.seq || 1) % 256);
      return saveCfg({ seq: (seq + 1) % 256 }).then(function () {
        var code = makeCode(o.bindUser || '', expireAt, seq);
        var rec = {
          code: code, user: o.bindUser || '', name: o.name || '', no: o.no || '',
          dept: o.dept || '', days: days, issuedAt: Date.now(), expireAt: expireAt,
          status: 'active', by: o.by || '', reqId: o.reqId || '', note: o.note || ''
        };
        return grants.all().then(function (list) {
          list.unshift(rec);
          return grants.save(list).then(function () { return rec; });
        });
      });
    },
    update: function (code, patch) {
      return grants.all().then(function (list) {
        var f = list.filter(function (x) { return x.code === code; })[0];
        if (f) Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
        return grants.save(list).then(function () { return f; });
      });
    },
    /** 延期：重新签发一张同人新码（原码作废） */
    extend: function (code, days) {
      return grants.all().then(function (list) {
        var f = list.filter(function (x) { return x.code === code; })[0];
        if (!f) return null;
        f.status = 'revoked';
        f.note = (f.note ? f.note + '；' : '') + '已延期换发新码';
        return grants.save(list).then(function () {
          return grants.issue({
            bindUser: f.user, name: f.name, no: f.no, dept: f.dept,
            days: days, by: f.by, reqId: f.reqId, note: '由 ' + code + ' 延期换发'
          });
        });
      });
    },
    remove: function (code) {
      return grants.all().then(function (list) {
        return grants.save(list.filter(function (x) { return x.code !== code; }));
      });
    },
    /** 本机台账中：某账号当前是否已有有效（绑定式）授权 */
    activeFor: function (list, user) {
      if (!user) return null;
      var now = Date.now();
      var u = String(user).toLowerCase();
      var hit = list.filter(function (g) {
        return g.status === 'active' && g.user && String(g.user).toLowerCase() === u && g.expireAt > now;
      });
      hit.sort(function (a, b) { return b.expireAt - a.expireAt; });
      return hit[0] || null;
    },
    find: function (list, code) {
      var c = normalize(code);
      return list.filter(function (g) { return normalize(g.code) === c; })[0] || null;
    }
  };

  /* ---------- 学员端本地授权态 ---------- */
  var state = {
    get: function () { return L.Store.get('authState:daily').then(function (v) { return v || null; }); },
    set: function (v) { return L.Store.set('authState:daily', v); },
    clear: function () { return L.Store.del('authState:daily'); }
  };

  /* ---------- 门禁校验 ---------- */
  /**
   * @returns Promise<{ok:boolean, reason:string, msg:string, expireAt:number}>
   * reason: '' | 'none' | 'expired' | 'revoked' | 'user' | 'sign' | 'format'
   */
  function check() {
    if (!cfg().enabled) return Promise.resolve({ ok: true, reason: 'off' });
    if (L.UI && L.UI.isAdminLoggedIn && L.UI.isAdminLoggedIn()) return Promise.resolve({ ok: true, reason: 'admin' });
    var s = (L.UI && L.UI.session && L.UI.session()) || null;
    var user = (s && s.user) || '';
    return Promise.all([state.get(), grants.all()]).then(function (r) {
      var st = r[0], list = r[1];

      // ① 本机台账已为该账号签发有效授权（同机场景：后台一授权，学员端自动放行）
      var g = grants.activeFor(list, user);
      if (g) {
        return state.set({ code: g.code, user: user, expireAt: g.expireAt, at: Date.now() })
          .then(function () { return { ok: true, reason: 'grant', expireAt: g.expireAt, code: g.code }; });
      }

      // ② 本地已保存的授权码 → 离线校验
      if (st && st.code) {
        var rec = grants.find(list, st.code);
        if (rec && rec.status === 'revoked') {
          return state.clear().then(function () {
            return { ok: false, reason: 'revoked', msg: '您的授权已被管理员撤销，请重新申请' };
          });
        }
        var v = verifyCode(st.code, user);
        if (v.ok) return { ok: true, reason: 'code', expireAt: v.expireAt, code: st.code };
        return state.clear().then(function () { return { ok: false, reason: v.reason, msg: v.msg }; });
      }
      return { ok: false, reason: 'none', msg: '' };
    });
  }

  /** 学员端提交授权码 */
  function redeem(code) {
    var s = (L.UI && L.UI.session && L.UI.session()) || null;
    var user = (s && s.user) || '';
    var v = verifyCode(code, user);
    if (!v.ok) return Promise.resolve(v);
    return grants.all().then(function (list) {
      var rec = grants.find(list, code);
      if (rec && rec.status === 'revoked') {
        return { ok: false, reason: 'revoked', msg: '该授权码已被管理员撤销' };
      }
      return state.set({
        code: 'LD-' + normalize(code).replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'),
        user: user, expireAt: v.expireAt, at: Date.now()
      }).then(function () {
        // 台账中若无此码（跨设备），补记一条便于后台统计
        if (!rec) {
          list.unshift({
            code: 'LD-' + normalize(code).replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'),
            user: user, name: (s && s.name) || '', no: (s && s.no) || '', dept: (s && s.dept) || '',
            days: 0, issuedAt: Date.now(), expireAt: v.expireAt, status: 'active',
            by: '', reqId: '', note: '学员端核销登记'
          });
          return grants.save(list).then(function () { return v; });
        }
        return v;
      });
    });
  }

  /** 学员端提交授权申请（写入本机台账 + 返回可转发的申请码） */
  function apply(note) {
    var s = (L.UI && L.UI.session && L.UI.session()) || null;
    return deviceId().then(function (dev) {
      var item = {
        user: (s && s.user) || '', name: (s && s.name) || '', no: (s && s.no) || '',
        dept: (s && s.dept) || '', note: note || '', dev: dev, at: Date.now(), from: 'local'
      };
      return reqs.add(item).then(function (rec) {
        return { rec: rec, code: buildReqCode(item) };
      });
    });
  }

  L.Auth = {
    BUILTIN_SECRET: BUILTIN_SECRET,
    cfg: cfg, saveCfg: saveCfg, secret: secret,
    makeCode: makeCode, verifyCode: verifyCode, normalize: normalize,
    buildReqCode: buildReqCode, parseReqCode: parseReqCode,
    reqs: reqs, grants: grants, state: state,
    check: check, redeem: redeem, apply: apply,
    deviceId: deviceId, fmtDay: fmtDay, dayEnd: dayEnd, dayIdx: dayIdx, today0: today0,
    daysLeft: function (exp) { return Math.ceil((exp - Date.now()) / DAY); }
  };

})(window);

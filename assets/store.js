/* ===========================================================
 *  store.js —— 存储层 + 题库仓库
 *  · IndexedDB 优先，失败自动降级 localStorage（兼容 file:// 直接打开）
 *  · 日常培训题库 与 关键岗位题库 严格分库，互不混用
 * =========================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'LDWS_EXAM_DB', STORE = 'kv', DB_VER = 1;
  var _db = null, _mode = 'ls', _ready = null;
  var _mem = {};   // 兜底内存存储（IndexedDB 与 localStorage 均不可用时使用，如 file:// 直接打开）

  function lsOK() {
    try { return (typeof localStorage !== 'undefined') && localStorage !== null; }
    catch (e) { return false; }
  }
  function openIDB() {
    return new Promise(function (res, rej) {
      if (!global.indexedDB) return rej('no-idb');
      var to = setTimeout(function () { rej('timeout'); }, 2500);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { clearTimeout(to); return rej(e); }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function (e) { clearTimeout(to); res(e.target.result); };
      req.onerror = function (e) { clearTimeout(to); rej(e); };
      req.onblocked = function () { clearTimeout(to); rej('blocked'); };
    });
  }

  var Store = {
    mode: function () { return _mode; },
    init: function () {
      if (_ready) return _ready;
      _ready = Promise.resolve().then(function () {
        if (typeof global.indexedDB !== 'undefined') {
          return openIDB().then(function (db) { _db = db; _mode = 'idb'; })
            .catch(function () { return fallback(); });
        }
        return fallback();
      });
      return _ready;
    },
    get: function (k) {
      return Store.init().then(function () {
        if (_mode === 'idb') {
          return new Promise(function (res) {
            var tx = _db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
            tx.onsuccess = function () { res(tx.result === undefined ? null : tx.result); };
            tx.onerror = function () { res(null); };
          });
        }
        if (_mode === 'ls') {
          var v = localStorage.getItem('LDWS:' + k);
          if (v === null) return null;
          try { return JSON.parse(v); } catch (e) { return null; }
        }
        return _mem[k] == null ? null : _mem[k];
      });
    },
    set: function (k, v) {
      return Store.init().then(function () {
        if (_mode === 'idb') {
          return new Promise(function (res, rej) {
            var tx = _db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
            tx.onsuccess = function () { res(true); };
            tx.onerror = function (e) { rej(e); };
          });
        }
        if (_mode === 'ls') {
          try { localStorage.setItem('LDWS:' + k, JSON.stringify(v)); return true; }
          catch (e) { throw new Error('本地存储空间不足，请在后台删除部分题库后重试。'); }
        }
        _mem[k] = v; return true;
      });
    },
    del: function (k) {
      return Store.init().then(function () {
        if (_mode === 'idb') {
          return new Promise(function (res) {
            var tx = _db.transaction(STORE, 'readwrite').objectStore(STORE)['delete'](k);
            tx.onsuccess = function () { res(true); };
            tx.onerror = function () { res(false); };
          });
        }
        if (_mode === 'ls') { localStorage.removeItem('LDWS:' + k); return true; }
        delete _mem[k]; return true;
      });
    }
  };

  // 决定降级策略：IndexedDB → localStorage → 内存
  function fallback() {
    _db = null;
    if (lsOK()) { _mode = 'ls'; }
    else { _mode = 'mem'; }
  }

  /* ================= 日常培训岗位考试方案（按题库抽题，banks 映射到分岗位题库 D2-D12） ================= */
  // 各专项抽题来源：
  //   安全专项 -> D3（安全专项题库）
  //   通用基础 -> D2（通用基础题库·全体员工必修）
  //   岗位专项 -> 对应岗位题库（D4 设备员 / D5 质量管理员 / D6 内审员 / D7 监督员 / D8 采样员 / D9 样品员 / D10 实验室检测员 / D11 报告编制员 / D12 报告审核员）
  var DAILY_POSITION_PLANS = [
    {
      name: '采样员理论考核',
      kind: 'position',
      position: '采样员',
      minutes: 120,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D8'] }
      ]
    },
    {
      name: '实验室检测员理论考核',
      kind: 'position',
      position: '实验室检测员',
      minutes: 120,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D10'] }
      ]
    },
    {
      name: '报告编制员理论考核',
      kind: 'position',
      position: '报告编制员',
      minutes: 100,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 85, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D11'] }
      ]
    },
    {
      name: '报告审核员理论考核',
      kind: 'position',
      position: '报告审核员',
      minutes: 100,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 85, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D12'] }
      ]
    },
    {
      name: '样品员理论考核',
      kind: 'position',
      position: '样品员',
      minutes: 80,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D9'] }
      ]
    },
    {
      name: '设备员理论考核',
      kind: 'position',
      position: '设备员',
      minutes: 80,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D4'] }
      ]
    },
    {
      name: '质量管理员理论考核',
      kind: 'position',
      position: '质量管理员',
      minutes: 80,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D5'] }
      ]
    },
    {
      name: '内审员理论考核',
      kind: 'position',
      position: '内审员',
      minutes: 80,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D6'] }
      ]
    },
    {
      name: '监督员理论考核',
      kind: 'position',
      position: '监督员',
      minutes: 80,
      scoreMap: { 1: 1, 2: 1, 3: 1 },
      pass: 'all',
      subs: [
        { name: '安全专项', passMode: 'percent', pass: 100, n: { 1: 15, 2: 8, 3: 7 }, banks: ['D3'], ranges: { 1: [51, 80], 2: [136, 148], 3: [189, 208] } },
        { name: '通用基础', passMode: 'score', pass: 80, n: { 1: 20, 2: 10, 3: 10 }, banks: ['D2'], ranges: { 1: [1, 50], 2: [111, 135], 3: [164, 188] } },
        { name: '岗位专项', passMode: 'score', pass: 80, n: { 1: 30, 2: 20, 3: 15 }, banks: ['D7'] }
      ]
    }
  ];

  /* ================= 默认配置 ================= */
  var DEFAULT_CFG = {
    adminPass: 'ldws2025',
    company: '湖南绿盾卫士检测技术有限公司',
    keypost: {
      firstMin: 90,          // 首次考试时长（分钟）
      extendMin: 60,         // 扩领域考试时长
      passScore: 70,         // 合格分
      switchLimit: 3,        // 允许切屏次数，达到即自动交卷
      shuffleOptions: true,  // 选项乱序
      antiCopy: true,        // 考试中禁用复制/右键
      positions: null        // 关键岗位配置（岗位+兼任），首次运行时按大纲播种
    },
    daily: {
      switchLimit: 3,
      shuffleOptions: true,
      antiCopy: false,
      plans: DAILY_POSITION_PLANS, // 日常培训考试方案（内置岗位方案）
      auth: {                 // 日常培训考核 · 授权码访问控制
        enabled: true,        // 是否需要授权码才能进入本模块
        days: 30,             // 默认授权有效期（天）
        bind: true,           // 生成授权码时默认绑定申请人账号
        secret: '',           // 自定义签名密钥（留空使用内置密钥；修改后须重新分发系统文件）
        seq: 1                // 授权码序号（自增）
      }
    },
    report: {               // 成绩回传（集中收集）
      enabled: false,       // 是否启用回传
      url: '',              // 回传地址（接收 POST JSON 的接口）
      secret: ''            // 回传密钥（接口可校验，留空则不校验）
    }
  };

  /* ================= 题库仓库 ================= */
  var TYPE_NAME = { 1: '单选题', 2: '多选题', 3: '判断题' };

  var Bank = {
    cfg: null,
    kpData: null,      // 内置关键岗位题库
    extra: { keypost: [], daily: [] },   // 上传题库的元信息列表
    _cache: {},        // id -> questions

    loadCfg: function () {
      return Store.get('cfg').then(function (c) {
        Bank.cfg = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CFG)), c || {});
        // 若老用户尚未配置日常岗位方案，自动播种内置方案
        if (!Bank.cfg.daily._seededV2 && (!Bank.cfg.daily.plans || !Bank.cfg.daily.plans.length)) {
          Bank.cfg.daily.plans = JSON.parse(JSON.stringify(DAILY_POSITION_PLANS));
          Bank.cfg.daily._seededV2 = true;
          return Bank.saveCfg().then(function () { return Bank.cfg; });
        }
        // 迁移：将内置岗位方案更新为最新版本（补充 banks 映射，使考试模式使用分岗位题库 D2-D12）。
        // 内置岗位方案不可在后台编辑，直接覆盖；用户自建的自定义方案保持不变。
        if ((Bank.cfg.daily._plansV || 0) < 3) {
          Bank.cfg.daily.plans = (Bank.cfg.daily.plans || []).filter(function (p) {
            return p.kind !== 'position';
          }).concat(JSON.parse(JSON.stringify(DAILY_POSITION_PLANS)));
          Bank.cfg.daily._plansV = 3;
          return Bank.saveCfg().then(function () { return Bank.cfg; });
        }
        return Bank.cfg;
      });
    },
    saveCfg: function () { return Store.set('cfg', Bank.cfg); },

    init: function () {
      Bank.kpData = global.__KEYPOST_BANK__ || { banks: [], questions: [] };
      // 建立内置题库索引
      Bank._builtinIdx = {};
      Bank.kpData.questions.forEach(function (q) {
        (Bank._builtinIdx[q.c] = Bank._builtinIdx[q.c] || []).push(q);
      });
      // 内置日常培训题库
      Bank.dailyData = global.__DAILY_BANK__ || { banks: [], questions: [] };
      Bank._dailyIdx = {};
      Bank.dailyData.questions.forEach(function (q) {
        var bid = q.bank || 'D1';
        (Bank._dailyIdx[bid] = Bank._dailyIdx[bid] || []).push(q);
      });
      return Bank.loadCfg()
        .then(function () {
          if (!Array.isArray(Bank.cfg.keypost.positions) ||
              Bank.cfg.keypost.positions.filter(function (p) { return p.combo; }).length < 12) {
            Bank.cfg.keypost.positions = defaultPositions();
            return Bank.saveCfg();
          }
        })
        .then(function () { return Bank.admins.seed(); })
        .then(function () { return Store.get('banklist:keypost'); })
        .then(function (l) { Bank.extra.keypost = l || []; return Store.get('banklist:daily'); })
        .then(function (l) { Bank.extra.daily = l || []; });
    },

    /** 列出某命名空间下全部题库（含内置） */
    list: function (ns) {
      var out = [];
      if (ns === 'keypost') {
        Bank.kpData.banks.forEach(function (b) {
          out.push({
            id: b.id, ns: 'keypost', builtin: true, subject: b.subject, major: b.major,
            name: b.name, n1: b.n1, n2: b.n2, n3: b.n3, total: b.total
          });
        });
      }
      if (ns === 'daily') {
        (Bank.dailyData.banks || []).forEach(function (b) {
          out.push({
            id: b.id, ns: 'daily', builtin: true, subject: b.subject || '', major: b.major || '',
            name: b.name, n1: b.n1, n2: b.n2, n3: b.n3, total: b.total
          });
        });
      }
      (Bank.extra[ns] || []).forEach(function (b) { out.push(b); });
      return out;
    },

    /** 取题库题目（Promise） */
    questions: function (id) {
      if (Bank._builtinIdx && Bank._builtinIdx[id]) return Promise.resolve(Bank._builtinIdx[id]);
      if (Bank._dailyIdx && Bank._dailyIdx[id]) return Promise.resolve(Bank._dailyIdx[id]);
      if (Bank._cache[id]) return Promise.resolve(Bank._cache[id]);
      return Store.get('bank:' + id).then(function (arr) {
        arr = arr || [];
        Bank._cache[id] = arr;
        return arr;
      });
    },

    /** 合并多个题库的题目 */
    questionsOf: function (ids) {
      return Promise.all(ids.map(Bank.questions)).then(function (arrs) {
        var out = [];
        arrs.forEach(function (a) { out = out.concat(a); });
        return out;
      });
    },

    /** 新增/覆盖上传题库 */
    save: function (ns, meta, questions) {
      var id = meta.id;
      Bank._cache[id] = questions;
      return Store.set('bank:' + id, questions).then(function () {
        var list = Bank.extra[ns] || (Bank.extra[ns] = []);
        var i = list.findIndex(function (x) { return x.id === id; });
        var m = {
          id: id, ns: ns, builtin: false, subject: meta.subject || '', major: meta.major || '',
          name: meta.name, file: meta.file || '', at: Date.now(),
          n1: questions.filter(function (q) { return q.t === 1; }).length,
          n2: questions.filter(function (q) { return q.t === 2; }).length,
          n3: questions.filter(function (q) { return q.t === 3; }).length
        };
        m.total = m.n1 + m.n2 + m.n3;
        if (i >= 0) list[i] = m; else list.push(m);
        return Store.set('banklist:' + ns, list).then(function () { return m; });
      });
    },

    remove: function (ns, id) {
      var list = Bank.extra[ns] || [];
      Bank.extra[ns] = list.filter(function (x) { return x.id !== id; });
      delete Bank._cache[id];
      return Store.del('bank:' + id).then(function () {
        return Store.set('banklist:' + ns, Bank.extra[ns]);
      });
    },

    meta: function (ns, id) {
      return Bank.list(ns).filter(function (b) { return b.id === id; })[0] || null;
    },

    typeName: function (t) { return TYPE_NAME[t] || '题目'; }
  };

  /* ============ 考生账号（本地存储） ============ */
  // 说明：本系统为纯前端静态应用，账号仅保存在考生本机浏览器。
  // 密码使用轻量哈希（非强加密）仅作基本混淆；如需统一账号管理请自行接入后端。
  function pwHash(s) {
    s = String(s == null ? '' : s);
    var h = 5381, i = s.length;
    while (i) h = ((h * 33) ^ s.charCodeAt(--i)) >>> 0;
    return 'p' + h.toString(36) + s.length.toString(36);
  }
  Bank.accounts = {
    all: function () { return Store.get('accounts').then(function (v) { return v || []; }); },
    get: function (user) {
      return this.all().then(function (a) {
        return a.filter(function (x) { return x.user === user; })[0] || null;
      });
    },
    save: function (acc) {
      return this.all().then(function (a) {
        var i = a.findIndex(function (x) { return x.user === acc.user; });
        if (i >= 0) a[i] = acc; else a.push(acc);
        return Store.set('accounts', a).then(function () { return acc; });
      });
    },
    update: function (user, patch) {
      return this.all().then(function (a) {
        var f = a.filter(function (x) { return x.user === user; })[0];
        if (f) Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
        return Store.set('accounts', a);
      });
    },
    remove: function (user) {
      return this.all().then(function (a) {
        return Store.set('accounts', a.filter(function (x) { return x.user !== user; }));
      });
    }
  };

  /* ============ 管理员账户（本地存储） ============ */
  // 由「管理员登录」入口校验，可在后台「管理员账户」页生成 / 重置 / 删除。
  Bank.admins = {
    all: function () { return Store.get('admins').then(function (v) { return v || []; }); },
    get: function (user) {
      return this.all().then(function (a) {
        return a.filter(function (x) { return x.user === user; })[0] || null;
      });
    },
    save: function (acc) {
      return this.all().then(function (a) {
        var i = a.findIndex(function (x) { return x.user === acc.user; });
        if (i >= 0) a[i] = acc; else a.push(acc);
        return Store.set('admins', a).then(function () { return acc; });
      });
    },
    remove: function (user) {
      return this.all().then(function (a) {
        return Store.set('admins', a.filter(function (x) { return x.user !== user; }));
      });
    },
    // 首次运行播种默认管理员（密码取 cfg.adminPass）
    seed: function () {
      return this.all().then(function (a) {
        if (a && a.length) return a;
        var def = {
          user: 'admin', name: '系统管理员', role: 'admin',
          pass: pwHash((Bank.cfg && Bank.cfg.adminPass) || 'ldws2025')
        };
        return Store.set('admins', [def]).then(function () { return [def]; });
      });
    }
  };

  /* ============ 关键岗位配置（按大纲） ============ */
  // 默认岗位依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》4.2 与 4.2.1.5（兼任）
  function clonePlan(p) {
    var o = {}; Object.keys(p).forEach(function (s) { o[s] = { 1: p[s][1] || 0, 2: p[s][2] || 0, 3: p[s][3] || 0 }; }); return o;
  }
  function defaultPositions() {
    var BASE = {
      top: { name: '最高管理者', focus: '侧重科目A', note: '接受科目 A、B 考试', plan: { A: { 1: 25, 2: 15, 3: 10 }, B: { 1: 5, 2: 5, 3: 5 } } },
      quality: { name: '质量负责人', focus: '侧重科目B', note: '接受科目 A、B、C 考试', plan: { A: { 1: 10, 2: 5, 3: 5 }, B: { 1: 15, 2: 10, 3: 5 }, C: { 1: 5, 2: 5, 3: 5 } } },
      tech: { name: '技术负责人', focus: '侧重科目C', note: '接受科目 A、B、C、D 考试', plan: { A: { 1: 5, 2: 5, 3: 2 }, B: { 1: 5, 2: 5, 3: 3 }, C: { 1: 12, 2: 6, 3: 6 }, D: { 1: 8, 2: 4, 3: 4 } } },
      signer: { name: '授权签字人', focus: '侧重科目D', note: '接受科目 A、B、C、D 考试', plan: { A: { 1: 5, 2: 5, 3: 2 }, B: { 1: 5, 2: 5, 3: 3 }, C: { 1: 8, 2: 4, 3: 4 }, D: { 1: 12, 2: 6, 3: 6 } } }
    };
    var out = [];
    Object.keys(BASE).forEach(function (k) {
      out.push({ key: k, name: BASE[k].name, focus: BASE[k].focus, note: BASE[k].note, combo: false, enabled: true, plan: clonePlan(BASE[k].plan) });
    });
    // 兼任组合（依据大纲 4.2.1.5）：主岗位 a 可兼任任一其他关键岗位 b（a≠b），
    // 考试按兼任岗位 b 的要求组卷。生成全部 a×b 组合，供界面两个下拉任意搭配。
    var COMBOS = [];
    Object.keys(BASE).forEach(function (a) {
      Object.keys(BASE).forEach(function (b) {
        if (a !== b) COMBOS.push([a, b, b]);
      });
    });
    COMBOS.forEach(function (c) {
      var a = c[0], b = c[1], inh = c[2];
      out.push({
        key: a + '_' + b, name: BASE[a].name + '兼任' + BASE[inh].name, combo: true, enabled: true,
        note: '按「' + BASE[inh].name + '」要求考试（大纲 4.2.1.5）', focus: BASE[inh].focus,
        plan: clonePlan(BASE[inh].plan)
      });
    });
    return out;
  }
  Bank.defaultPositions = defaultPositions;
  // 返回启用的岗位列表
  Bank.positionList = function () {
    var ps = (Bank.cfg && Bank.cfg.keypost && Bank.cfg.keypost.positions) || [];
    return ps.filter(function (p) { return p.enabled !== false; });
  };
  Bank.getPosition = function (key) {
    var ps = (Bank.cfg && Bank.cfg.keypost && Bank.cfg.keypost.positions) || [];
    return ps.filter(function (p) { return p.key === key; })[0] || null;
  };

  /* ============ Excel / CSV 解析 ============ */
  var OPTL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  function cell(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\u00a0/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
  }

  function parseRows(rows, srcName) {
    // 找表头
    var hi = -1, cm = null;
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var cells = (rows[i] || []).map(cell);
      var joined = cells.join('|');
      if (joined.indexOf('题干') >= 0 && joined.indexOf('答案') >= 0) {
        cm = {};
        cells.forEach(function (c, j) {
          if (!c) return;
          var key = c.replace(/[（(][^)）]*[)）]/g, '').trim();
          if (key.indexOf('题干') === 0) cm.stem = j;
          else if (key.indexOf('题型') === 0) cm.type = j;
          else if (key.indexOf('答案') === 0) cm.ans = j;
          else if (key.indexOf('选项') === 0 && key.length >= 3) cm['o' + key.charAt(2)] = j;
          else if (key.indexOf('知识点') >= 0 && cm.kp === undefined) cm.kp = j;
          else if ((key.indexOf('解析') >= 0 || key.indexOf('说明') >= 0) && cm.ex === undefined) cm.ex = j;
        });
        if (cm.stem !== undefined && cm.ans !== undefined) { hi = i; break; }
        cm = null;
      }
    }
    if (hi < 0) return { ok: false, msg: '未找到表头行（需包含「题干」「答案」列）', items: [] };

    var items = [], bad = 0, seen = {};
    for (var r = hi + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var stem = cell(row[cm.stem]);
      if (!stem) continue;
      var ansRaw = cell(row[cm.ans]);
      var typeRaw = cm.type !== undefined ? cell(row[cm.type]) : '';
      var opts = [];
      for (var k = 0; k < OPTL.length; k++) {
        var ci = cm['o' + OPTL[k]];
        if (ci === undefined) continue;
        opts.push(cell(row[ci]));
      }
      while (opts.length && !opts[opts.length - 1]) opts.pop();

      var letters = (ansRaw.toUpperCase().match(/[A-H]/g) || []);
      var t = 0;
      if (/单选|单项/.test(typeRaw)) t = 1;
      else if (/多选|多项|不定项/.test(typeRaw)) t = 2;
      else if (/判断/.test(typeRaw)) t = 3;

      if (!t) {
        if (opts.length <= 2 && letters.every(function (L) { return L === 'A' || L === 'B'; })) t = 3;
        else if (letters.length > 1) t = 2; else t = 1;
      }
      if (t === 3) {
        if (!letters.length) {
          if (/对|正确|√|是|T|Y/i.test(ansRaw)) letters = ['A'];
          else if (/错|误|×|否|F|N/i.test(ansRaw)) letters = ['B'];
        }
        opts = ['对', '错'];
      }
      if (!letters.length) { bad++; continue; }
      if (t === 1 && letters.length > 1) t = 2;
      var over = letters.some(function (L) { return OPTL.indexOf(L) > opts.length - 1; });
      if (over) { bad++; continue; }

      var a = letters.filter(function (v, ix, s) { return s.indexOf(v) === ix; }).sort().join('');
      var key = stem + '#' + a + '#' + opts.join('|');
      if (seen[key]) continue;
      seen[key] = 1;

      var item = { id: hash(key), t: t, q: stem, o: opts, a: a };
      if (cm.kp !== undefined && cell(row[cm.kp])) item.k = cell(row[cm.kp]);
      if (cm.ex !== undefined && cell(row[cm.ex])) item.e = cell(row[cm.ex]);
      items.push(item);
    }
    return { ok: true, items: items, bad: bad, src: srcName };
  }

  function parseWorkbook(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('文件读取失败')); };
      fr.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var all = [], bad = 0, sheets = [];
          wb.SheetNames.forEach(function (sn) {
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
            var r = parseRows(rows, sn);
            if (r.ok && r.items.length) {
              sheets.push({ name: sn, n: r.items.length });
              all = all.concat(r.items); bad += r.bad || 0;
            }
          });
          // 跨工作表去重
          var seen = {}, uniq = [];
          all.forEach(function (q) {
            var key = q.q + '#' + q.a + '#' + q.o.join('|');
            if (seen[key]) return; seen[key] = 1; uniq.push(q);
          });
          res({ items: uniq, bad: bad, sheets: sheets });
        } catch (err) { rej(err); }
      };
      fr.readAsArrayBuffer(file);
    });
  }

  function hash(s) {
    var h = 5381, i = s.length;
    while (i) h = (h * 33) ^ s.charCodeAt(--i);
    return (h >>> 0).toString(36) + s.length.toString(36);
  }

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) &&
        base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], patch[k]);
      } else base[k] = patch[k];
    });
    return base;
  }

  global.LDWS = global.LDWS || {};
  global.LDWS.Store = Store;
  global.LDWS.Bank = Bank;
  global.LDWS.parseWorkbook = parseWorkbook;
  global.LDWS.parseRows = parseRows;
  global.LDWS.DEFAULT_CFG = DEFAULT_CFG;
  global.LDWS.hash = hash;
  global.LDWS.pwHash = pwHash;

})(window);

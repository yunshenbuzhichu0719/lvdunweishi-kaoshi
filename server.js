/* ===========================================================
 *  server.js —— 绿盾卫士云版后端（纯 Node，零依赖）
 *  · 同时托管 PWA 前端（public/）与 API
 *  · 数据存于 data-store.json（用户 / 管理员 / 考试记录）
 *  启动：node server.js   （可选环境变量 PORT、DATA_FILE）
 * =========================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data-store.json');
const SECRET = process.env.SECRET || 'lvdunweishi-cloud-2025';

/* ============================================================
 *  授权码签名工具（port from assets/auth.js，保证前后端算法一致）
 *  学员端可离线校验后端签发的码；后端也可校验前端生成的申请码。
 * ============================================================ */
const AUTH_BUILTIN = 'LDWS-DAILY-AUTH-2025';
const AUTH_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTH_DAY = 86400000;
const AUTH_EPOCH = 1735660800000;   // UTC+8 的 2025-01-01 00:00:00（与前端 new Date(2025,0,1) 在中国时区一致）
const AUTH_MAX_DAY = 4095;
function h32(s) {
  s = String(s == null ? '' : s);
  var h = 2166136261 >>> 0;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function enc20(n) {
  n = (n >>> 0) & 0xFFFFF;
  var s = '';
  for (var i = 3; i >= 0; i--) s += AUTH_ALPHA.charAt((n >>> (i * 5)) & 31);
  return s;
}
function dec20(s) {
  if (!s || s.length !== 4) return -1;
  var n = 0;
  for (var i = 0; i < 4; i++) {
    var v = AUTH_ALPHA.indexOf(s.charAt(i));
    if (v < 0) return -1;
    n = n * 32 + v;
  }
  return n;
}
function b64e(s) { return Buffer.from(s, 'utf8').toString('base64url'); }
function b64d(s) { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); }
function authDayIdx(ts) { return Math.floor((ts - AUTH_EPOCH) / AUTH_DAY); }
function authDayEnd(idx) { return AUTH_EPOCH + (idx + 1) * AUTH_DAY - 1000; }
function authFmtDay(ts) {
  var d = new Date(ts + 8 * 3600 * 1000);
  var p = function (n) { return n < 10 ? '0' + n : n; };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
function authSecret() {
  var c = DB.authCfg || {};
  return (c.secret || '').trim() || AUTH_BUILTIN;
}
function authNormalize(code) {
  var s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.indexOf('LD') === 0) s = s.slice(2);
  return s;
}
function authMakeCode(user, expireAt, seq) {
  var u = String(user || '').trim();
  var p1 = u ? (h32('U:' + u.toLowerCase()) & 0xFFFFF) : 0;
  if (u && p1 === 0) p1 = 1;
  var di = authDayIdx(expireAt);
  if (di < 0) di = 0;
  if (di > AUTH_MAX_DAY) di = AUTH_MAX_DAY;
  var p2 = ((di & 0xFFF) << 8) | ((seq || 0) & 0xFF);
  var a = enc20(p1), b = enc20(p2);
  var sg = enc20(h32(a + b + '|' + authSecret()) & 0xFFFFF);
  return 'LD-' + a + '-' + b + '-' + sg;
}
function authVerifyCode(code, user) {
  var s = authNormalize(code);
  if (s.length !== 12) return { ok: false, reason: 'format', msg: '授权码格式不正确（应为 LD-XXXX-XXXX-XXXX）' };
  var a = s.slice(0, 4), b = s.slice(4, 8), sg = s.slice(8, 12);
  var p1 = dec20(a), p2 = dec20(b), sig = dec20(sg);
  if (p1 < 0 || p2 < 0 || sig < 0) return { ok: false, reason: 'format', msg: '授权码含有无效字符，请核对后重新输入' };
  if ((h32(a + b + '|' + authSecret()) & 0xFFFFF) !== sig) return { ok: false, reason: 'sign', msg: '授权码无效（校验失败），请向管理员核实' };
  var di = (p2 >> 8) & 0xFFF, sq = p2 & 0xFF;
  var exp = authDayEnd(di);
  var bound = p1 !== 0;
  if (bound) {
    var u = String(user || '').trim();
    var expect = h32('U:' + u.toLowerCase()) & 0xFFFFF;
    if (expect === 0) expect = 1;
    if (!u || expect !== p1) return { ok: false, reason: 'user', msg: '该授权码不是发给当前登录账号的，请使用本人账号登录后再试' };
  }
  if (Date.now() > exp) return { ok: false, reason: 'expired', msg: '授权码已于 ' + authFmtDay(exp) + ' 到期，请重新申请', expireAt: exp };
  return { ok: true, reason: '', msg: '', expireAt: exp, bound: bound, seq: sq };
}
function authBuildReqCode(p) {
  var body = b64e(JSON.stringify({ u: p.user || '', n: p.name || '', o: p.no || '', d: p.dept || '', t: p.at || Date.now(), m: p.dev || '', r: p.note || '' }));
  var sg = enc20(h32(body + '|' + authSecret()) & 0xFFFFF);
  return 'LDREQ-' + body + '-' + sg;
}
function authParseReqCode(str) {
  var s = String(str || '').trim().replace(/\s+/g, '');
  if (s.indexOf('LDREQ-') !== 0) return { ok: false, msg: '不是有效的申请码（应以 LDREQ- 开头）' };
  s = s.slice(6);
  var i = s.lastIndexOf('-');
  if (i < 0) return { ok: false, msg: '申请码不完整' };
  var body = s.slice(0, i), sg = s.slice(i + 1);
  if (enc20(h32(body + '|' + authSecret()) & 0xFFFFF) !== sg.toUpperCase()) return { ok: false, msg: '申请码校验失败，可能在传输中被截断或修改' };
  try {
    var o = JSON.parse(b64d(body));
    return { ok: true, data: { user: o.u || '', name: o.n || '', no: o.o || '', dept: o.d || '', at: o.t || Date.now(), dev: o.m || '', note: o.r || '' } };
  } catch (e) { return { ok: false, msg: '申请码内容无法解析' }; }
}
/** 台账中某账号当前是否已有有效授权 */
function authActiveGrant(user) {
  if (!user) return null;
  var now = Date.now(), u = String(user).toLowerCase();
  var hit = DB.authGrants.filter(function (g) {
    return g.status === 'active' && g.user && String(g.user).toLowerCase() === u && g.expireAt > now;
  });
  hit.sort(function (a, b) { return b.expireAt - a.expireAt; });
  return hit[0] || null;
}

/* ---------------- 数据存储 ---------------- */
const EMPTY = { users: [], admins: [], records: [], sessions: {}, authReqs: [], authGrants: [], authCfg: { enabled: true, days: 30, bind: true, secret: '', seq: 1, autoGrant: false } };
let DB = load();

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const o = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return Object.assign({}, EMPTY, o);
    }
  } catch (e) { /* ignore */ }
  // 首次运行：播种默认管理员 admin / ldws2025
  const { salt, passHash } = pw('ldws2025');
  const db = JSON.parse(JSON.stringify(EMPTY));
  db.admins.push({ user: 'admin', name: '系统管理员', salt, passHash });
  return db;
}
let _saveT = null;
function save() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }
    catch (e) { console.error('保存数据失败', e); }
  }, 50);
}

/* ---------------- 密码与令牌 ---------------- */
function pw(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passHash = crypto.scryptSync(String(p), salt, 64).toString('hex');
  return { salt, passHash };
}
function check(p, salt, passHash) {
  const h = crypto.scryptSync(String(p), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(passHash, 'hex'));
}
function makeToken(user, role) {
  const body = Buffer.from(JSON.stringify({ user, role, exp: Date.now() + 86400000 * 7 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(t) {
  if (!t || t.indexOf('.') < 0) return null;
  const [body, sig] = t.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expect) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}

/* ---------------- 工具 ---------------- */
function send(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}
function readBody(req) {
  return new Promise((res, rej) => {
    const chunks = [];
    req.on('data', c => { chunks.push(c); if (Buffer.concat(chunks).length > 1e7) req.destroy(); });
    req.on('end', () => {
      try {
        const d = Buffer.concat(chunks).toString('utf8');
        res(d ? JSON.parse(d) : {});
      } catch (e) { rej(e); }
    });
    req.on('error', rej);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg'
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.normalize(path.join(PUBLIC, rel));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------------- API ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  // 注册
  if (p === '/api/register' && m === 'POST') {
    const b = await readBody(req);
    const user = (b.user || '').trim(), name = (b.name || '').trim(), pass = (b.pass || '');
    if (user.length < 2) return send(res, 400, { ok: false, msg: '账号至少 2 个字符' });
    if (pass.length < 4) return send(res, 400, { ok: false, msg: '密码至少 4 位' });
    if (DB.users.some(u => u.user === user)) return send(res, 409, { ok: false, msg: '该账号已存在' });
    const { salt, passHash } = pw(pass);
    const rec = { id: crypto.randomUUID(), user, name: name || user, no: (b.no || '').trim(), dept: (b.dept || '').trim(), salt, passHash, createdAt: Date.now() };
    DB.users.push(rec); save();
    return send(res, 200, { ok: true, token: makeToken(user, 'user'), user: { user: rec.user, name: rec.name, no: rec.no, dept: rec.dept } });
  }

  // 登录（考生）
  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req);
    const user = (b.user || '').trim(), pass = (b.pass || '');
    const u = DB.users.find(x => x.user === user);
    if (!u || !check(pass, u.salt, u.passHash)) return send(res, 401, { ok: false, msg: '账号或密码错误' });
    return send(res, 200, { ok: true, token: makeToken(user, 'user'), user: { user: u.user, name: u.name, no: u.no || '', dept: u.dept || '' } });
  }

  // 管理员登录
  if (p === '/api/admin/login' && m === 'POST') {
    const b = await readBody(req);
    const user = (b.user || '').trim(), pass = (b.pass || '');
    const a = DB.admins.find(x => x.user === user);
    if (!a || !check(pass, a.salt, a.passHash)) return send(res, 401, { ok: false, msg: '管理员账号或密码错误' });
    return send(res, 200, { ok: true, token: makeToken(user, 'admin'), admin: { user: a.user, name: a.name } });
  }

  // 以下均需鉴权
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = verifyToken(token);
  if (!claims) return send(res, 401, { ok: false, msg: '未登录或登录已过期' });

  // 提交考试记录
  if (p === '/api/exam/submit' && m === 'POST') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    const b = await readBody(req);
    const u = DB.users.find(x => x.user === claims.user);
    if (!u) return send(res, 401, { ok: false, msg: '账号不存在' });
    if (!b.result || typeof b.result.score !== 'number') return send(res, 400, { ok: false, msg: '记录格式错误' });
    const rec = {
      id: crypto.randomUUID(),
      userId: u.id, user: u.user, name: u.name,
      mode: b.mode || '', post: b.post || '', combo: b.combo || '',
      title: b.title || '', passScore: b.passScore || 70,
      score: b.result.score, total: b.result.total,
      right: b.result.right, wrong: b.result.wrong, blank: b.result.blank,
      detail: b.detail || [], duration: b.duration || 0,
      submittedAt: Date.now()
    };
    DB.records.push(rec); save();
    return send(res, 200, { ok: true, id: rec.id });
  }

  // 我的信息
  if (p === '/api/me' && m === 'GET') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    const u = DB.users.find(x => x.user === claims.user);
    if (!u) return send(res, 404, { ok: false, msg: '账号不存在' });
    return send(res, 200, { ok: true, user: { user: u.user, name: u.name, no: u.no || '', dept: u.dept || '', createdAt: u.createdAt } });
  }

  // 我的记录
  if (p === '/api/me/records' && m === 'GET') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    const list = DB.records.filter(r => r.user === claims.user)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map(r => ({ id: r.id, title: r.title, mode: r.mode, post: r.post, combo: r.combo, score: r.score, total: r.total, passScore: r.passScore, submittedAt: r.submittedAt, duration: r.duration }));
    return send(res, 200, { ok: true, records: list });
  }

  // 记录明细
  if (/^\/api\/record\/[A-Za-z0-9-]+$/.test(p) && m === 'GET') {
    const id = p.split('/').pop();
    const r = DB.records.find(x => x.id === id);
    if (!r) return send(res, 404, { ok: false, msg: '记录不存在' });
    if (claims.role !== 'admin' && r.user !== claims.user) return send(res, 403, { ok: false, msg: '无权限' });
    return send(res, 200, { ok: true, record: r });
  }

  /* ---- 授权码：学员端接口（需 user 登录）---- */
  if (p === '/api/auth/apply' && m === 'POST') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    const b = await readBody(req);
    const u = DB.users.find(x => x.user === claims.user);
    if (!u) return send(res, 401, { ok: false, msg: '账号不存在' });
    var item = {
      id: crypto.randomUUID(), user: u.user, name: (b.name || u.name || ''),
      no: (b.no || ''), dept: (b.dept || ''), note: b.note || '',
      dev: b.dev || 'cloud', at: Date.now(), from: 'cloud', status: 'pending', code: ''
    };
    var idx = DB.authReqs.findIndex(r => r.status === 'pending' && r.user === item.user);
    if (idx >= 0) { item.id = DB.authReqs[idx].id; DB.authReqs[idx] = item; }
    else DB.authReqs.unshift(item);
    save();
    return send(res, 200, { ok: true, rec: item, reqCode: authBuildReqCode(item) });
  }
  if (p === '/api/auth/status' && m === 'GET') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    var acfg = DB.authCfg || {};
    if (!acfg.enabled) return send(res, 200, { ok: true, reason: 'off' });
    var ag = authActiveGrant(claims.user);
    if (ag) return send(res, 200, { ok: true, reason: 'grant', expireAt: ag.expireAt, code: ag.code });
    return send(res, 200, { ok: false, reason: 'none' });
  }
  if (p === '/api/auth/redeem' && m === 'POST') {
    if (claims.role !== 'user') return send(res, 403, { ok: false, msg: '无权限' });
    const b = await readBody(req);
    var av = authVerifyCode(b.code || '', claims.user);
    if (!av.ok) return send(res, 200, av);
    var ac = authNormalize(b.code);
    var arec = DB.authGrants.find(x => authNormalize(x.code) === ac);
    if (arec && arec.status === 'revoked') return send(res, 200, { ok: false, reason: 'revoked', msg: '该授权码已被管理员撤销' });
    if (!arec) {
      var au = DB.users.find(x => x.user === claims.user);
      DB.authGrants.unshift({
        code: 'LD-' + ac.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'),
        user: claims.user, name: au ? au.name : '', no: '', dept: '',
        days: 0, issuedAt: Date.now(), expireAt: av.expireAt, status: 'active',
        by: '', reqId: '', note: '学员端云核销登记'
      });
      save();
    }
    return send(res, 200, av);
  }

  // ---- 管理员接口 ----
  if (claims.role !== 'admin') return send(res, 403, { ok: false, msg: '需要管理员权限' });

  if (p === '/api/admin/users' && m === 'GET') {
    const users = DB.users.map(u => {
      const rs = DB.records.filter(r => r.user === u.user);
      const best = rs.reduce((mx, r) => Math.max(mx, r.score), 0);
      return {
        user: u.user, name: u.name, createdAt: u.createdAt,
        exams: rs.length, best: rs.length ? best : null,
        lastAt: rs.length ? Math.max.apply(null, rs.map(r => r.submittedAt)) : null
      };
    }).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    return send(res, 200, { ok: true, users, total: users.length });
  }
  if (p === '/api/admin/records' && m === 'GET') {
    const q = url.searchParams.get('user') || '';
    let list = DB.records.slice();
    if (q) list = list.filter(r => r.user === q);
    list.sort((a, b) => b.submittedAt - a.submittedAt);
    list = list.map(r => ({ id: r.id, user: r.user, name: r.name, title: r.title, mode: r.mode, post: r.post, combo: r.combo, score: r.score, total: r.total, passScore: r.passScore, submittedAt: r.submittedAt, duration: r.duration }));
    return send(res, 200, { ok: true, records: list, total: list.length });
  }
  // 管理员改密码
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readBody(req);
    const a = DB.admins.find(x => x.user === claims.user);
    if (!a) return send(res, 404, { ok: false, msg: '管理员不存在' });
    if (!check(b.oldPass || '', a.salt, a.passHash)) return send(res, 400, { ok: false, msg: '原密码错误' });
    if ((b.newPass || '').length < 4) return send(res, 400, { ok: false, msg: '新密码至少 4 位' });
    const { salt, passHash } = pw(b.newPass);
    a.salt = salt; a.passHash = passHash; save();
    return send(res, 200, { ok: true });
  }
  // 新增管理员
  if (p === '/api/admin/add' && m === 'POST') {
    const b = await readBody(req);
    const user = (b.user || '').trim(), pass = (b.pass || '');
    if (user.length < 2) return send(res, 400, { ok: false, msg: '账号至少 2 个字符' });
    if ((pass || '').length < 4) return send(res, 400, { ok: false, msg: '密码至少 4 位' });
    if (DB.admins.some(x => x.user === user)) return send(res, 409, { ok: false, msg: '管理员已存在' });
    const { salt, passHash } = pw(pass);
    DB.admins.push({ user, name: b.name || user, salt, passHash }); save();
    return send(res, 200, { ok: true });
  }

  /* ---- 授权码：管理员接口 ---- */
  if (p === '/api/auth/requests' && m === 'GET') {
    return send(res, 200, { ok: true, requests: DB.authReqs, total: DB.authReqs.length });
  }
  if (p === '/api/auth/importReq' && m === 'POST') {
    const b = await readBody(req);
    var pr = authParseReqCode(b.reqCode || '');
    if (!pr.ok) return send(res, 400, { ok: false, msg: pr.msg });
    var d = pr.data;
    var item2 = {
      id: crypto.randomUUID(), user: d.user, name: d.name, no: d.no, dept: d.dept,
      note: d.note, dev: d.dev || 'remote', at: d.at || Date.now(), from: 'reqcode', status: 'pending', code: ''
    };
    if (d.user) {
      var ix = DB.authReqs.findIndex(r => r.status === 'pending' && r.user === d.user);
      if (ix >= 0) { item2.id = DB.authReqs[ix].id; DB.authReqs[ix] = item2; }
      else DB.authReqs.unshift(item2);
    } else DB.authReqs.unshift(item2);
    save();
    return send(res, 200, { ok: true, rec: item2 });
  }
  if (p === '/api/auth/grant' && m === 'POST') {
    const b = await readBody(req);
    var rq = DB.authReqs.find(r => r.id === b.reqId);
    if (!rq) return send(res, 404, { ok: false, msg: '申请不存在' });
    var gcfg = DB.authCfg || {};
    var gdays = Math.max(1, parseInt(b.days, 10) || gcfg.days || 30);
    var gseq = (gcfg.seq || 1) % 256;
    gcfg.seq = (gseq + 1) % 256;
    var gexp = authDayEnd(authDayIdx(Date.now()) + gdays - 1);
    var gUser = (b.bindUser != null ? b.bindUser : (gcfg.bind ? rq.user : ''));
    var gcode = authMakeCode(gUser, gexp, gseq);
    var grec = {
      code: gcode, user: gUser, name: rq.name, no: rq.no, dept: rq.dept,
      days: gdays, issuedAt: Date.now(), expireAt: gexp, status: 'active',
      by: claims.user, reqId: rq.id, note: rq.note || ''
    };
    DB.authGrants.unshift(grec);
    rq.status = 'granted'; rq.code = gcode; rq.grantId = gcode;
    save();
    return send(res, 200, { ok: true, code: gcode, grant: grec });
  }
  if (p === '/api/auth/grant/manual' && m === 'POST') {
    const b = await readBody(req);
    var mcfg = DB.authCfg || {};
    var mdays = Math.max(1, parseInt(b.days, 10) || mcfg.days || 30);
    var mseq = (mcfg.seq || 1) % 256;
    mcfg.seq = (mseq + 1) % 256;
    var mexp = authDayEnd(authDayIdx(Date.now()) + mdays - 1);
    var mUser = (b.bindUser != null ? b.bindUser : (mcfg.bind ? (b.user || '') : ''));
    var mcode = authMakeCode(mUser, mexp, mseq);
    var mrec = {
      code: mcode, user: mUser, name: b.name || '', no: b.no || '', dept: b.dept || '',
      days: mdays, issuedAt: Date.now(), expireAt: mexp, status: 'active',
      by: claims.user, reqId: '', note: b.note || '手动生成'
    };
    DB.authGrants.unshift(mrec);
    save();
    return send(res, 200, { ok: true, code: mcode, grant: mrec });
  }
  if (p === '/api/auth/deny' && m === 'POST') {
    const b = await readBody(req);
    var drq = DB.authReqs.find(r => r.id === b.reqId);
    if (!drq) return send(res, 404, { ok: false, msg: '申请不存在' });
    drq.status = 'denied';
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/revoke' && m === 'POST') {
    const b = await readBody(req);
    var rc = authNormalize(b.code);
    var rg = DB.authGrants.find(x => authNormalize(x.code) === rc);
    if (!rg) return send(res, 404, { ok: false, msg: '授权码不存在' });
    rg.status = 'revoked'; rg.revokedAt = Date.now();
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/restore' && m === 'POST') {
    const b = await readBody(req);
    var rstc = authNormalize(b.code);
    var rstg = DB.authGrants.find(x => authNormalize(x.code) === rstc);
    if (!rstg) return send(res, 404, { ok: false, msg: '授权码不存在' });
    rstg.status = 'active'; delete rstg.revokedAt;
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/extend' && m === 'POST') {
    const b = await readBody(req);
    var ec = authNormalize(b.code);
    var eg = DB.authGrants.find(x => authNormalize(x.code) === ec);
    if (!eg) return send(res, 404, { ok: false, msg: '授权码不存在' });
    eg.status = 'revoked'; eg.note = (eg.note ? eg.note + '；' : '') + '已延期换发新码';
    var ecfg = DB.authCfg || {};
    var edays = Math.max(1, parseInt(b.days, 10) || ecfg.days || 30);
    var eseq = (ecfg.seq || 1) % 256;
    ecfg.seq = (eseq + 1) % 256;
    var eexp = authDayEnd(authDayIdx(Date.now()) + edays - 1);
    var ecode = authMakeCode(eg.user, eexp, eseq);
    var erec = {
      code: ecode, user: eg.user, name: eg.name, no: eg.no, dept: eg.dept,
      days: edays, issuedAt: Date.now(), expireAt: eexp, status: 'active',
      by: claims.user, reqId: eg.reqId, note: '由 ' + eg.code + ' 延期换发'
    };
    DB.authGrants.unshift(erec);
    save();
    return send(res, 200, { ok: true, code: ecode, grant: erec });
  }
  if (p === '/api/auth/grants' && m === 'GET') {
    return send(res, 200, { ok: true, grants: DB.authGrants, total: DB.authGrants.length });
  }
  if (p === '/api/auth/revokeAll' && m === 'POST') {
    var nowRA = Date.now();
    DB.authGrants.forEach(function (g) {
      if (g.status === 'active') { g.status = 'revoked'; g.revokedAt = nowRA; }
    });
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/cfg' && m === 'GET') {
    return send(res, 200, { ok: true, cfg: DB.authCfg || {} });
  }
  if (p === '/api/auth/cfg' && m === 'POST') {
    const b = await readBody(req);
    var ncfg = DB.authCfg || {};
    if (b.enabled !== undefined) ncfg.enabled = !!b.enabled;
    if (b.days !== undefined) ncfg.days = parseInt(b.days, 10) || 30;
    if (b.bind !== undefined) ncfg.bind = !!b.bind;
    if (b.autoGrant !== undefined) ncfg.autoGrant = !!b.autoGrant;
    if (b.secret !== undefined) ncfg.secret = String(b.secret);
    DB.authCfg = ncfg;
    save();
    return send(res, 200, { ok: true, cfg: ncfg });
  }
  if (/^\/api\/auth\/req\/[A-Za-z0-9_-]+$/.test(p) && m === 'DELETE') {
    var drid = p.split('/').pop();
    DB.authReqs = DB.authReqs.filter(r => r.id !== drid);
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/clearReqs' && m === 'POST') {
    DB.authReqs = DB.authReqs.filter(r => r.status === 'pending');
    save();
    return send(res, 200, { ok: true });
  }
  if (/^\/api\/auth\/grant\/[A-Za-z0-9-]+$/.test(p) && m === 'DELETE') {
    var dgcode = authNormalize(p.split('/').pop());
    DB.authGrants = DB.authGrants.filter(x => authNormalize(x.code) !== dgcode);
    save();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { ok: false, msg: '接口不存在' });
}

/* ---------------- 服务器 ---------------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(e => {
      console.error(e);
      if (!res.headersSent) send(res, 500, { ok: false, msg: '服务器错误' });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log('绿盾卫士云版已启动: http://localhost:' + PORT);
});

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

/* ---------------- 数据存储 ---------------- */
const EMPTY = { users: [], admins: [], records: [], sessions: {} };
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
    const rec = { id: crypto.randomUUID(), user, name: name || user, salt, passHash, createdAt: Date.now() };
    DB.users.push(rec); save();
    return send(res, 200, { ok: true, token: makeToken(user, 'user'), user: { user: rec.user, name: rec.name } });
  }

  // 登录（考生）
  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req);
    const user = (b.user || '').trim(), pass = (b.pass || '');
    const u = DB.users.find(x => x.user === user);
    if (!u || !check(pass, u.salt, u.passHash)) return send(res, 401, { ok: false, msg: '账号或密码错误' });
    return send(res, 200, { ok: true, token: makeToken(user, 'user'), user: { user: u.user, name: u.name } });
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
    return send(res, 200, { ok: true, user: { user: u.user, name: u.name, createdAt: u.createdAt } });
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

#!/usr/bin/env node
/* ============================================================
 *  collector.js —— 成绩收集服务端（零依赖，仅需 Node.js）
 * ------------------------------------------------------------
 *  接收考试页 POST 过来的成绩，集中保存到 scores.json，
 *  并提供密码保护的查看 / 导出 CSV / 清空 界面。
 *
 *  启动：
 *    node tools/collector.js
 *  或自定义：
 *    PORT=8080 ADMIN_PW=你的密码 SECRET=密钥 node tools/collector.js
 *
 *  环境变量：
 *    PORT      监听端口（默认 3000）
 *    ADMIN_PW  查看成绩后台的密码（默认 ldws2025）
 *    SECRET    回传密钥；若设置，则接口只接受带正确 X-Report-Token 的请求
 *    DATA      成绩保存文件名（默认 ./scores.json）
 *    STATIC    可选：填“考试系统目录”路径，则本服务同时托管该静态站点
 * ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ADMIN_PW = process.env.ADMIN_PW || 'ldws2025';
const SECRET = process.env.SECRET || '';
const DATA = process.env.DATA || path.join(__dirname, 'scores.json');
const STATIC = process.env.STATIC || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Report-Token'
};

let scores = [];
try { scores = JSON.parse(fs.readFileSync(DATA, 'utf8') || '[]'); } catch (e) { scores = []; }
function persist() { fs.writeFileSync(DATA, JSON.stringify(scores, null, 2)); }

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(body);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleString('zh-CN'); } catch (e) { return String(ts); }
}

function handleScore(req, res) {
  // 密钥校验
  const token = req.headers['x-report-token'] || '';
  if (SECRET && token !== SECRET) return sendJSON(res, 403, { ok: false, error: 'secret mismatch' });
  let buf = '';
  req.on('data', c => { buf += c; if (buf.length > 5e6) req.destroy(); });
  req.on('end', () => {
    let rec;
    try { rec = JSON.parse(buf); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
    if (!rec || !rec.id) return sendJSON(res, 400, { ok: false, error: 'missing id' });
    // 去重（同一场考试只保留最后一次上报）
    scores = scores.filter(r => r.id !== rec.id);
    scores.push(Object.assign({ at: Date.now() }, rec));
    persist();
    sendJSON(res, 200, { ok: true, total: scores.length });
  });
}

function viewer(pwOk) {
  if (!pwOk) {
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>成绩收集后台</title>' +
      '<style>body{font-family:system-ui,sans-serif;background:#f3f5f7;display:flex;height:100vh;align-items:center;justify-content:center}form{background:#fff;padding:28px 32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08)}input{padding:8px 10px;width:220px;border:1px solid #ccc;border-radius:8px}button{margin-top:12px;padding:8px 18px;background:#0e7a4f;color:#fff;border:0;border-radius:8px;cursor:pointer}h1{font-size:18px;margin:0 0 14px}</style></head>' +
      '<body><form method="get"><h1>成绩收集后台</h1><input type="password" name="pw" placeholder="请输入查看密码"><div><button>进入</button></div></form></body></html>';
  }
  const cols = ['提交时间', '姓名', '工号', '部门', '考试名称', '岗位', '科目D', '成绩', '满分', '合格线', '合格', '对/错/空', '用时(s)', '切屏', '自动交卷', '记录编号'];
  const rows = scores.slice().reverse().map(r => [
    fmtTime(r.at || r.ts), esc(r.name), esc(r.no), esc(r.dept), esc(r.title), esc(r.post), esc(r.category),
    r.score, r.total, r.passScore, r.pass ? '是' : '否', (r.right || 0) + '/' + (r.wrong || 0) + '/' + (r.blank || 0),
    r.used, r.switches, r.auto ? '是' : '否', esc(r.id)
  ].map(esc).join('</td><td>')).map(t => '<tr><td>' + t + '</td></tr>').join('');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>成绩收集后台</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#f3f5f7;margin:0;padding:24px;color:#222}' +
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:13px;margin-bottom:16px}' +
    '.bar{display:flex;gap:10px;margin-bottom:14px}.bar a{text-decoration:none;padding:8px 14px;border-radius:8px;background:#0e7a4f;color:#fff;font-size:13px}' +
    'table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}th,td{border:1px solid #e3e6ea;padding:7px 9px;text-align:left}' +
    'th{background:#eef2f5;position:sticky;top:0}.pass{color:#0e7a4f;font-weight:600}.fail{color:#c0392b;font-weight:600}</style></head><body>' +
    '<h1>成绩收集后台</h1><div class="sub">共 ' + scores.length + ' 条成绩记录</div>' +
    '<div class="bar"><a href="?pw=' + esc(ADMIN_PW) + '">刷新</a><a href="/csv?pw=' + esc(ADMIN_PW) + '">导出 CSV</a><a href="/clear?pw=' + esc(ADMIN_PW) + '" onclick="return confirm(\'确认清空全部成绩？\')">清空成绩</a></div>' +
    '<table><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
    (rows || '<tr><td colspan="' + cols.length + '">暂无成绩</td></tr>') + '</tbody></table></body></html>';
}

function csv() {
  const head = ['提交时间', '姓名', '工号', '部门', '考试名称', '岗位', '科目D', '成绩', '满分', '合格线', '合格', '答对', '答错', '未答', '用时', '切屏', '自动交卷', '记录编号'];
  const lines = scores.slice().reverse().map(r => [
    fmtTime(r.at || r.ts), r.name, r.no, r.dept, r.title, r.post, r.category,
    r.score, r.total, r.passScore, r.pass ? '是' : '否', r.right, r.wrong, r.blank, r.used, r.switches, r.auto ? '是' : '否', r.id
  ].map(v => {
    v = v == null ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(','));
  return '﻿' + head.join(',') + '\n' + lines.join('\n');
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serveStatic(req, res, pathname) {
  let fp = decodeURIComponent(pathname);
  if (fp === '/' || fp === '') fp = '/index.html';
  const file = path.join(STATIC, fp);
  if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  // CORS 预检
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (p === '/api/score' && req.method === 'POST') return handleScore(req, res);

  if (p === '/' || p === '/view') {
    const pwOk = u.searchParams.get('pw') === ADMIN_PW;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(viewer(pwOk));
  }
  if (p === '/csv') {
    if (u.searchParams.get('pw') !== ADMIN_PW) { res.writeHead(403); return res.end('forbidden'); }
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="scores.csv"' });
    return res.end(csv());
  }
  if (p === '/clear') {
    if (u.searchParams.get('pw') !== ADMIN_PW) { res.writeHead(403); return res.end('forbidden'); }
    scores = []; persist();
    res.writeHead(302, { Location: '/?pw=' + encodeURIComponent(ADMIN_PW) });
    return res.end();
  }
  if (STATIC) return serveStatic(req, res, p);

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('未找到该路径。请 POST 到 /api/score 上报成绩，或访问 / 查看成绩后台。');
});

server.listen(PORT, () => {
  console.log('成绩收集服务已启动： http://localhost:' + PORT);
  console.log('  查看成绩： http://localhost:' + PORT + '/  （密码：' + ADMIN_PW + '）');
  console.log('  上报接口： POST http://<本机IP>:' + PORT + '/api/score');
  if (SECRET) console.log('  已启用密钥校验（X-Report-Token）');
  if (STATIC) console.log('  同时托管静态站点： ' + STATIC);
  console.log('  成绩保存于： ' + DATA);
});

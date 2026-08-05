/* Quick smoke test for /api/exam/submit in cloud mode */
const http = require('http');

const BASE = 'http://localhost:3999';
const DATA_FILE = './_smoke_data.json';
const fs = require('fs');
if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);

const { spawn } = require('child_process');
const server = spawn('C:/Users/ydyyf/.workbuddy/binaries/node/versions/22.22.2/node.exe', ['server.js'], {
  env: { ...process.env, PORT: '3999', DATA_FILE: DATA_FILE },
  stdio: ['pipe', 'pipe', 'pipe']
});

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'localhost', port: 3999, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, data: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  let pass = 0, fail = 0;
  function ok(c, m) { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); }

  await new Promise(r => setTimeout(r, 1500));

  // 1. Register a student
  const reg = await req('POST', '/api/register', { user: 'tester', pass: '1234', name: '测试员', no: 'T001', dept: 'QA部' });
  ok(reg.data.ok, '注册成功');
  const userToken = reg.data.token;
  ok(reg.data.user.no === 'T001' && reg.data.user.dept === 'QA部', '返回的 no/dept 正确');

  // 2. Submit an exam record
  const sub = await req('POST', '/api/exam/submit', {
    mode: 'daily', post: '检测员', combo: '通用', title: '日常考核-检测员',
    passScore: 70, duration: 1200,
    detail: [{ no: 1, ok: true }, { no: 2, ok: false }],
    result: { score: 80, total: 100, right: 8, wrong: 2, blank: 0 }
  }, userToken);
  ok(sub.data.ok, '成绩提交成功 id=' + sub.data.id);

  // 3. Login admin and view records
  const adm = await req('POST', '/api/admin/login', { user: 'admin', pass: 'ldws2025' });
  ok(adm.data.ok, '管理员登录成功');
  const adminToken = adm.data.token;

  const records = await req('GET', '/api/admin/records?user=tester', null, adminToken);
  ok(records.data.ok && records.data.records.length === 1, '管理员能看到 1 条成绩记录');
  ok(records.data.records[0].score === 80 && records.data.records[0].user === 'tester', '成绩数据正确');

  const users = await req('GET', '/api/admin/users', null, adminToken);
  ok(users.data.ok && users.data.users.some(u => u.user === 'tester' && u.exams === 1 && u.best === 80),
     '管理员能看到用户统计（考试数=1，最高分=80）');

  console.log('\n========== ' + pass + ' 通过 / ' + fail + ' 失败 ==========');
  server.kill();
  if (fs.existsSync(DATA_FILE)) try { fs.unlinkSync(DATA_FILE); } catch(e) {}
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); server.kill(); process.exit(1); });
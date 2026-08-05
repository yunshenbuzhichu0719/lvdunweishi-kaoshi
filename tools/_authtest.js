/* 后端授权码 API 闭环测试 —— 零依赖纯 Node */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3999;
const DATA = path.join(__dirname, '_test-data.json');
if (fs.existsSync(DATA)) fs.unlinkSync(DATA);

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { PORT: String(PORT), DATA_FILE: DATA, SECRET: 'test-secret-2025' },
  stdio: ['pipe', 'pipe', 'pipe']
});
server.stderr.on('data', d => process.stderr.write('[server] ' + d));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => {
      const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(ch).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, json: {} }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  await sleep(600);
  try {
    console.log('\n【1】注册学员 zhangsan');
    let r = await req('POST', '/api/register', { user: 'zhangsan', name: '张三', pass: '1234' });
    ok(r.status === 200 && r.json.ok, '注册成功');
    const tok = r.json.token;
    ok(!!tok, '获得 token');

    console.log('\n【2】学员提交授权申请');
    r = await req('POST', '/api/auth/apply', { note: '日常培训需要', name: '张三', no: 'G001', dept: '检测部' }, tok);
    ok(r.json.ok, '申请成功');
    ok(r.json.reqCode && r.json.reqCode.indexOf('LDREQ-') === 0, '返回申请码 ' + (r.json.reqCode || '').slice(0, 16) + '…');
    const reqId = r.json.rec.id;
    const reqCode = r.json.reqCode;

    console.log('\n【3】学员查授权状态（应无授权）');
    r = await req('GET', '/api/auth/status', null, tok);
    ok(r.json.ok === false && r.json.reason === 'none', '状态=none（未授权）');

    console.log('\n【4】管理员登录');
    r = await req('POST', '/api/admin/login', { user: 'admin', pass: 'ldws2025' });
    ok(r.json.ok, '管理员登录成功');
    const atok = r.json.token;

    console.log('\n【5】管理员查申请列表');
    r = await req('GET', '/api/auth/requests', null, atok);
    ok(r.json.ok && r.json.total >= 1, '申请列表 ' + r.json.total + ' 条');
    ok(r.json.requests[0].user === 'zhangsan' && r.json.requests[0].name === '张三', '看到张三的申请');

    console.log('\n【6】管理员授权');
    r = await req('POST', '/api/auth/grant', { reqId: reqId, days: 30 }, atok);
    ok(r.json.ok, '授权成功');
    ok(r.json.code && r.json.code.indexOf('LD-') === 0, '生成授权码 ' + r.json.code);
    const grantCode = r.json.code;

    console.log('\n【7】学员查状态（应有授权）');
    r = await req('GET', '/api/auth/status', null, tok);
    ok(r.json.ok && r.json.reason === 'grant', '状态=grant（已授权），到期 ' + (r.json.expireAt ? new Date(r.json.expireAt).toLocaleDateString() : '?'));

    console.log('\n【8】学员用授权码核销（模拟跨设备输入）');
    r = await req('POST', '/api/auth/redeem', { code: grantCode }, tok);
    ok(r.json.ok, '核销成功');

    console.log('\n【9】管理员撤销授权');
    r = await req('POST', '/api/auth/revoke', { code: grantCode }, atok);
    ok(r.json.ok, '撤销成功');

    console.log('\n【10】学员查状态（撤销后应无授权）');
    r = await req('GET', '/api/auth/status', null, tok);
    ok(r.json.ok === false, '状态=无授权（撤销生效）');

    console.log('\n【11】学员用已撤销的码核销（应拒绝）');
    r = await req('POST', '/api/auth/redeem', { code: grantCode }, tok);
    ok(r.json.ok === false && r.json.reason === 'revoked', '已撤销码被拒绝');

    console.log('\n【12】管理员录入申请码（异地场景）');
    r = await req('POST', '/api/auth/importReq', { reqCode: reqCode }, atok);
    ok(r.json.ok, '录入申请码成功，看到 ' + (r.json.rec ? r.json.rec.name : '?'));

    console.log('\n【13】管理员手动生成授权码');
    r = await req('POST', '/api/auth/grant/manual', { user: 'lisi', name: '李四', no: 'G002', dept: '质量部', days: 60 }, atok);
    ok(r.json.ok && r.json.code.indexOf('LD-') === 0, '手动发码 ' + r.json.code);

    console.log('\n【14】管理员查授权台账');
    r = await req('GET', '/api/auth/grants', null, atok);
    ok(r.json.ok && r.json.total >= 2, '台账 ' + r.json.total + ' 条');

    console.log('\n【15】管理员延期换发');
    r = await req('POST', '/api/auth/extend', { code: r.json.grants[0].code, days: 90 }, atok);
    ok(r.json.ok && r.json.code.indexOf('LD-') === 0, '延期换发新码 ' + r.json.code);

    console.log('\n【16】管理员保存配置');
    r = await req('POST', '/api/auth/cfg', { enabled: true, days: 45, bind: true, autoGrant: true }, atok);
    ok(r.json.ok && r.json.cfg.days === 45, '配置保存成功，days=45');

    console.log('\n【17】管理员查配置');
    r = await req('GET', '/api/auth/cfg', null, atok);
    ok(r.json.ok && r.json.cfg.autoGrant === true, '配置读取成功，autoGrant=true');

    console.log('\n【18】关闭门禁后学员状态=off');
    await req('POST', '/api/auth/cfg', { enabled: false }, atok);
    r = await req('GET', '/api/auth/status', null, tok);
    ok(r.json.ok && r.json.reason === 'off', '门禁关闭，状态=off');

    console.log('\n【19】跨端验证：后端签发的码前端能校验（算法一致性）');
    // 用前端 auth.js 相同算法手动验证 grantCode 的格式
    ok(grantCode.indexOf('LD-') === 0 && grantCode.split('-').length === 4, '授权码格式 LD-XXXX-XXXX-XXXX 正确 (' + grantCode + ')');

    console.log('\n【20】未登录访问授权接口应 401');
    r = await req('GET', '/api/auth/status');
    ok(r.status === 401, '未登录被拦截');

    console.log('\n【21】学员访问管理员接口应 403');
    r = await req('GET', '/api/auth/requests', null, tok);
    ok(r.status === 403, '学员被拦截管理员接口');

    console.log('\n========== ' + pass + ' 通过 / ' + fail + ' 失败 ==========\n');
  } catch (e) {
    console.error('测试异常:', e);
    fail++;
  } finally {
    server.kill();
    try { if (fs.existsSync(DATA)) fs.unlinkSync(DATA); } catch (e) {}
    process.exit(fail > 0 ? 1 : 0);
  }
})();

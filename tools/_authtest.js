/* 登录流程测试（jsdom 加载真实 index.html）：注册 / 忘记密码入口已移除，仅验证登录 */
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail++; };

(async function () {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e && e.message || e)));

  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'file://' + ROOT + '/index.html',
    virtualConsole: vc,
    beforeParse(win) { win.print = function () {}; win.scrollTo = function () {}; win.alert = function () {}; }
  });
  const win = dom.window;
  await new Promise(res => { if (win.document.readyState === 'complete') res(); else win.addEventListener('load', res); });
  await sleep(800);
  const doc = win.document;
  const txt = () => doc.body.textContent;
  const $ = id => doc.getElementById(id);

  ok(/考生登录/.test(txt()), '显示登录界面');

  // 预置一个考生账号（注册 UI 已移除，改为直接落库）
  await win.LDWS.Bank.accounts.save({ user: 'alice', pass: win.LDWS.pwHash('pw1234'), name: '爱丽丝', no: 'A01', dept: '监测科' });
  const acc = await win.LDWS.Bank.accounts.get('alice');
  ok(!!acc && acc.name === '爱丽丝', '账号已写入本地存储');
  ok(acc.pass !== 'pw1234', '密码已哈希存储（非明文）');

  // 1) 登录（正确密码）
  $('lUser').value = 'alice'; $('lPw').value = 'pw1234';
  $('btnLogin').click(); await sleep(300);
  ok(/日常培训考核/.test(txt()), '用正确密码登录成功');
  ok(win.LDWS.UI.session().name === '爱丽丝', '登录态携带姓名');

  // 退出
  $('btnLogout').click(); await sleep(200);

  // 2) 错误密码被拒
  $('lUser').value = 'alice'; $('lPw').value = 'wrong';
  $('btnLogin').click(); await sleep(200);
  ok(/账号或密码错误/.test(txt()), '错误密码被拒绝');

  ok(errors.length === 0, '无 JS 运行时错误' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));

  console.log('\n=== 结果 ===');
  console.log(fail === 0 ? 'AUTH PASS ✅' : (fail + ' 项失败 ❌'));
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });

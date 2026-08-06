/* 登录 / 注册 / 忘记密码 流程测试（jsdom 加载真实 index.html） */
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

  // 1) 注册
  doc.querySelector('[data-tab="reg"]').click(); await sleep(40);
  $('rUser').value = 'alice'; $('rPw').value = 'pw1234'; $('rPw2').value = 'pw1234';
  $('rName').value = '爱丽丝'; $('rNo').value = 'A01'; $('rDept').value = '监测科';
  $('rQ').value = doc.querySelector('#rQ option').value; $('rA').value = '北京';
  $('btnReg').click(); await sleep(300);
  ok(/日常培训考核/.test(txt()), '注册后自动登录进入首页');
  const acc = await win.LDWS.Bank.accounts.get('alice');
  ok(!!acc && acc.name === '爱丽丝', '账号已写入本地存储');
  ok(acc.pass !== 'pw1234', '密码已哈希存储（非明文）');

  // 退出，回到登录页
  $('btnLogout').click(); await sleep(200);
  ok(/考生登录/.test(txt()), '退出后回到登录界面');

  // 2) 登录（正确密码）
  $('lUser').value = 'alice'; $('lPw').value = 'pw1234';
  $('btnLogin').click(); await sleep(300);
  ok(/日常培训考核/.test(txt()), '用正确密码登录成功');
  ok(win.LDWS.UI.session().name === '爱丽丝', '登录态携带姓名');

  // 退出
  $('btnLogout').click(); await sleep(200);

  // 3) 错误密码被拒
  $('lUser').value = 'alice'; $('lPw').value = 'wrong';
  $('btnLogin').click(); await sleep(200);
  ok(/账号或密码错误/.test(txt()), '错误密码被拒绝');

  // 4) 忘记密码：密保答案重置
  doc.querySelector('[data-tab="fp"]').click(); await sleep(40);
  $('fUser').value = 'alice'; $('btnFp').click(); await sleep(300);
  ok(/密保问题/.test(txt()), '忘记密码第一步显示密保问题');
  ok(!$('fpStep2').classList.contains('hidden'), '第二步（答案+新密码）已展开');
  $('fA').value = '北京'; $('fPw').value = 'new5678'; $('fPw2').value = 'new5678';
  $('btnFp').click(); await sleep(300);
  ok(/密码已重置/.test(txt()), '密保答案正确后密码已重置');
  const acc2 = await win.LDWS.Bank.accounts.get('alice');
  ok(acc2.pass === win.LDWS.pwHash('new5678'), '新密码已生效');

  // 5) 用新密码登录
  $('lUser').value = 'alice'; $('lPw').value = 'new5678';
  $('btnLogin').click(); await sleep(300);
  ok(/日常培训考核/.test(txt()), '用重置后的新密码成功登录');

  // 6) 忘记密码错误答案被拒
  $('btnLogout').click(); await sleep(150);
  doc.querySelector('[data-tab="fp"]').click(); await sleep(40);
  $('fUser').value = 'alice'; $('btnFp').click(); await sleep(250);
  $('fA').value = '上海'; $('fPw').value = 'x1'; $('fPw2').value = 'x1';
  $('btnFp').click(); await sleep(200);
  ok(/密保答案不正确/.test(txt()), '密保答案错误被拒绝');

  ok(errors.length === 0, '无 JS 运行时错误' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));

  console.log('\n=== 结果 ===');
  console.log(fail === 0 ? 'AUTH PASS ✅' : (fail + ' 项失败 ❌'));
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });

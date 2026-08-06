/* 管理员账户 + 关键岗位配置 测试（jsdom 加载真实 index.html） */
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

  // 1) 默认管理员已播种
  const admins = await win.LDWS.Bank.admins.all();
  ok(admins.length >= 1 && admins[0].user === 'admin', '默认管理员 admin 已播种');
  ok(admins[0].pass !== 'ldws2025', '管理员密码已哈希（非明文）');

  // 2) 关键岗位配置（基础 4 + 兼任 9 = 13）
  const pos = win.LDWS.Bank.positionList();
  ok(pos.length === 13, '关键岗位配置含 13 个岗位（4 基础 + 9 兼任），实际 ' + pos.length);
  const combo = win.LDWS.Bank.getPosition('tech_signer');
  ok(!!combo && combo.combo === true, '存在兼任岗位：技术负责人兼任授权签字人');
  ok(combo && combo.plan.D && combo.plan.D[1] === 12, '兼任岗位按授权签字人配比（科目D单选12）');

  // 3) 组卷配置满分应为 100（按配比计算，与题库题量无关）
  let expect = 0;
  Object.keys(combo.plan).forEach(s => {
    const pl = combo.plan[s]; expect += (pl[1] || 0) * 1 + (pl[2] || 0) * 2 + (pl[3] || 0) * 2;
  });
  ok(expect === 100, '按配置岗位配比合计 100 分（实际 ' + expect + '）');
  const paper = win.LDWS.Engine.buildPaper({
    mode: 'first', post: 'tech_signer', pool: { A: [], B: [], C: [], D: [] },
    planObj: combo.plan, postName: combo.name, minutes: 90, shuffleOptions: false
  });
  ok(/首次考试 · 技术负责人兼任授权签字人/.test(paper.title), '试卷标题含兼任岗位名');

  // 4) 管理员登录流程
  ok(!!$('toAdmin'), '登录页存在「管理员登录」入口');
  $('toAdmin').click(); await sleep(200);
  ok(/管理员登录/.test(txt()), '进入管理员登录页');
  $('aUser').value = 'admin'; $('aPw').value = 'ldws2025';
  $('btnAlogin').click(); await sleep(300);
  ok(win.LDWS.UI.isAdminLoggedIn(), '管理员登录成功（admin 会话已建立）');
  ok(/关键岗位配置/.test(txt()), '后台已渲染「关键岗位配置」导航');
  ok(/管理员账户/.test(txt()), '后台已渲染「管理员账户」导航');

  // 5) 新增管理员账户（随机密码）
  doc.querySelector('[data-nav="admins"]').click(); await sleep(150);
  $('nU').value = 'boss'; $('nN').value = '园长';
  $('nAdd').click(); await sleep(250);
  const admins2 = await win.LDWS.Bank.admins.all();
  ok(admins2.some(a => a.user === 'boss'), '新增管理员 boss 成功');

  ok(errors.length === 0, '无 JS 运行时错误' + (errors.length ? '：' + errors.join('; ') : ''));

  console.log('\n=== 管理员/岗位配置结果 ===');
  console.log(fail === 0 ? 'ADMIN PASS ✅' : ('ADMIN FAIL ❌ (' + fail + ')'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

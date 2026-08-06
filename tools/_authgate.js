/* 日常培训考核 · 授权码门禁测试（jsdom 加载真实 index.html） */
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail++; };

(async function () {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String((e && e.message) || e)));

  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'file://' + ROOT + '/index.html',
    virtualConsole: vc,
    beforeParse(win) {
      win.print = function () { }; win.scrollTo = function () { };
      win.alert = function () { }; win.confirm = function () { return true; };
    }
  });
  const win = dom.window;
  await new Promise(res => { if (win.document.readyState === 'complete') res(); else win.addEventListener('load', res); });
  await sleep(900);

  const doc = win.document;
  const L = win.LDWS;
  const A = L.Auth;
  const txt = () => doc.body.textContent;
  const maskOpen = () => !doc.getElementById('modalMask').classList.contains('hidden');

  console.log('\n【1】模块加载');
  ok(!!A, 'LDWS.Auth 已加载');
  ok(A.cfg().enabled === true, '默认启用授权码访问控制');

  console.log('\n【2】授权码生成 / 离线校验');
  const exp = A.dayEnd(A.dayIdx(A.today0()) + 6);          // 7 天后
  const code = A.makeCode('zhangsan', exp, 7);
  ok(/^LD-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), '授权码格式 ' + code);
  ok(A.verifyCode(code, 'zhangsan').ok, '本人账号校验通过');
  ok(A.verifyCode(code, 'ZhangSan').ok, '账号大小写不敏感');
  ok(A.verifyCode(code, 'lisi').reason === 'user', '他人账号被拒绝（防止授权码扩散）');
  ok(A.verifyCode(code, '').reason === 'user', '未登录被拒绝');
  ok(A.fmtDay(A.verifyCode(code, 'zhangsan').expireAt) === A.fmtDay(exp), '到期日还原正确');

  const bad = code.slice(0, -1) + (code.slice(-1) === 'A' ? 'B' : 'A');
  ok(A.verifyCode(bad, 'zhangsan').reason === 'sign', '篡改一位即校验失败');
  ok(A.verifyCode('LD-XXXX-XXXX', 'zhangsan').reason === 'format', '长度不足报格式错误');

  const past = A.dayEnd(A.dayIdx(A.today0()) - 2);
  ok(A.verifyCode(A.makeCode('zhangsan', past, 1), 'zhangsan').reason === 'expired', '过期码被拒绝');

  const anyCode = A.makeCode('', exp, 9);
  ok(A.verifyCode(anyCode, 'whoever').ok, '通用码任何账号可用');

  console.log('\n【3】申请码编解码');
  const rc = A.buildReqCode({ user: 'zhangsan', name: '张三', no: 'G001', dept: '检测部', note: '年度培训', at: Date.now(), dev: 'DEV12345' });
  ok(rc.indexOf('LDREQ-') === 0, '申请码前缀正确');
  const pr = A.parseReqCode(rc);
  ok(pr.ok && pr.data.name === '张三' && pr.data.dept === '检测部' && pr.data.no === 'G001', '申请码可还原申请人信息');
  ok(!A.parseReqCode(rc.slice(0, rc.length - 3) + 'ZZZ').ok, '申请码被篡改时拒绝');

  console.log('\n【4】学员端门禁拦截');
  await L.Bank.accounts.save({ user: 'zhangsan', pass: L.pwHash('1234'), name: '张三', no: 'G001', dept: '检测部' });
  L.UI.login({ user: 'zhangsan', name: '张三', no: 'G001', dept: '检测部' });
  await sleep(60);
  L.UI.go('daily');
  await sleep(200);
  ok(/该模块需要授权码才能进入/.test(txt()), '未授权时显示门禁页');
  ok(maskOpen(), '自动弹出授权弹窗');
  ok(/输入授权码/.test(txt()) && /申请授权码/.test(txt()), '弹窗含「输入授权码 / 申请授权码」两个页签');

  console.log('\n【5】学员提交申请 → 后台可见');
  const ap = await A.apply('参加年度安全培训');
  ok(ap.code.indexOf('LDREQ-') === 0, '生成可转发的申请码');
  let reqs = await A.reqs.all();
  ok(reqs.length === 1 && reqs[0].status === 'pending', '后台申请台账出现 1 条待处理');
  ok(reqs[0].name === '张三' && reqs[0].user === 'zhangsan' && reqs[0].dept === '检测部', '后台能看到申请人姓名/账号/部门');
  await A.apply('重复提交');
  reqs = await A.reqs.all();
  ok(reqs.length === 1, '同一账号重复申请不会刷屏（覆盖更新）');

  console.log('\n【6】后台授权 → 学员自动放行');
  const g = await A.grants.issue({ bindUser: 'zhangsan', name: '张三', dept: '检测部', days: 15, reqId: reqs[0].id });
  await A.reqs.update(reqs[0].id, { status: 'granted', code: g.code });
  ok(g.status === 'active' && g.days === 15, '签发授权码 ' + g.code + '（15 天）');
  let chk = await A.check();
  ok(chk.ok, '同机场景：授权后学员端 check() 自动放行');
  const st = await A.state.get();
  ok(st && A.normalize(st.code) === A.normalize(g.code), '学员端本地已写入授权态');

  console.log('\n【7】撤销授权');
  await A.grants.update(g.code, { status: 'revoked' });
  await A.state.clear();
  chk = await A.check();
  ok(!chk.ok && chk.reason === 'none', '撤销后再次进入被拦截');
  // 学员手上仍有旧码 → 核销时被台账拦下
  const rd = await A.redeem(g.code);
  ok(!rd.ok && rd.reason === 'revoked', '已撤销的码无法再次核销');

  console.log('\n【8】跨设备：学员输入授权码进入');
  await A.grants.save([]);                                   // 模拟学员设备（无后台台账）
  await A.state.clear();
  const g2code = A.makeCode('zhangsan', exp, 21);
  const rd2 = await A.redeem(g2code);
  ok(rd2.ok, '离线输入授权码核销成功');
  chk = await A.check();
  ok(chk.ok, '核销后 check() 放行');
  L.UI.go('daily');
  await sleep(200);
  ok(/刷题模式/.test(txt()) && !/该模块需要授权码/.test(txt()), '成功进入日常培训考核模块');

  console.log('\n【9】关闭开关后不拦截');
  await A.saveCfg({ enabled: false });
  await A.state.clear();
  chk = await A.check();
  ok(chk.ok && chk.reason === 'off', '关闭授权控制后直接放行');
  await A.saveCfg({ enabled: true });

  console.log('\n【10】关键岗位模块不受影响');
  await A.state.clear();
  L.UI.go('keypost');
  await sleep(150);
  ok(/关键岗位人员考试/.test(txt()) && !/该模块需要授权码/.test(txt()), '关键岗位模块无需授权');

  console.log('\n【11】后台页面渲染');
  await A.grants.issue({ bindUser: 'lisi', name: '李四', days: 30 });
  L.UI.adminLogin({ user: 'admin', name: '系统管理员' });
  await sleep(50);
  L.Admin.enter('dailyAuth');
  await sleep(400);
  ok(/日常授权管理/.test(txt()), '后台导航含「日常授权管理」');
  ok(/授权台账/.test(txt()) && /手动生成授权码/.test(txt()), '后台页面渲染完整');
  ok(doc.querySelectorAll('#grBody tr').length >= 1, '授权台账有记录');

  console.log('\n【错误检查】');
  ok(errors.length === 0, 'jsdom 运行期无脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));

  console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项' : '✅ 全部通过'));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

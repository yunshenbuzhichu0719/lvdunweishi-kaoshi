/* 集成冒烟测试：在 jsdom 中加载真实 index.html，驱动关键路径 */
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
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'file://' + ROOT + '/index.html',
    virtualConsole: vc,
    beforeParse(win) {
      // jsdom 未实现的浏览器 API，桩掉以避免误报（真实浏览器中可用）
      win.print = function () {};
      win.scrollTo = function () {};
      win.alert = function () {};
      win.confirm = function () { return true; };
    }
  });
  const win = dom.window;

  // 等待脚本加载 + main 启动
  await new Promise(res => { if (win.document.readyState === 'complete') res(); else win.addEventListener('load', res); });
  await sleep(800); // 等 Bank.init().then(go('home'))

  ok(errors.length === 0, '页面加载无 JS 运行时错误' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  const doc = win.document;
  const txt = () => doc.body.textContent;

  // 登录门禁：未登录先显示登录界面（含 注册 / 忘记密码 标签）
  ok(/考生登录/.test(txt()), '未登录时显示登录界面');
  ok(!!doc.querySelector('[data-tab="reg"]'), '登录页含「注册」标签');
  ok(!!doc.querySelector('[data-tab="fp"]'), '登录页含「忘记密码」标签');
  // 切换到注册标签并注册一个新账号（自动登录）
  doc.querySelector('[data-tab="reg"]').click();
  await sleep(50);
  doc.getElementById('rUser').value = 'tester01';
  doc.getElementById('rPw').value = 'abc123';
  doc.getElementById('rPw2').value = 'abc123';
  doc.getElementById('rName').value = '测试员';
  doc.getElementById('rQ').value = doc.querySelector('#rQ option').value;
  doc.getElementById('rA').value = '答案';
  doc.getElementById('btnReg').click();
  await sleep(400);
  ok(/日常培训考核/.test(txt()) && /关键岗位人员考试/.test(txt()), '注册并自动登录后进入首页');
  ok(doc.getElementById('btnBack').classList.contains('hidden'), '首页不显示返回按钮（根界面）');

  // 内置题库已加载
  const banks = win.LDWS.Bank.list('keypost');
  ok(banks.length > 0, '内置关键岗位题库已加载（题库数 ' + banks.length + '）');

  // 导航到关键岗位组卷设置
  win.LDWS.UI.go('kpExamSetup');
  await sleep(50);
  ok(/组卷设置/.test(txt()), '进入关键岗位考试·组卷设置页');
  ok(!doc.getElementById('btnBack').classList.contains('hidden'), '组卷设置页显示返回按钮');

  // 选择 最高管理者（默认），填写姓名，开始考试
  const nameInput = doc.getElementById('exName');
  ok(!!nameInput, '考生姓名输入框存在');
  nameInput.value = '测试员';
  doc.getElementById('startExam').click();
  await sleep(400); // 等待 prepareKPExam 异步取题 + buildPaper

  ok(win.LDWS.UI.isExamRunning(), '考试已开始（isExamRunning=true）');
  const bodyTxt = txt();
  ok(/单选 30/.test(bodyTxt) && /多选 20/.test(bodyTxt) && /判断 15/.test(bodyTxt),
    '最高管理者试卷配比正确：单选30·多选20·判断15');
  ok(!!doc.getElementById('btnSubmit'), '答题界面含交卷按钮');
  ok(!doc.getElementById('btnBack').classList.contains('hidden'), '考试进行中显示返回按钮');

  // 模拟切屏：3 次（间隔 > 防抖 1500ms）
  for (let i = 0; i < 3; i++) {
    win.dispatchEvent(new win.Event('blur'));
    await sleep(1600);
  }
  await sleep(300);
  ok(!win.LDWS.UI.isExamRunning(), '切屏 3 次后考试已自动交卷（isExamRunning=false）');
  ok(/自动交卷/.test(txt()), '弹出「自动交卷」提示（' + (txt().includes('自动交卷') ? '已出现' : '未出现') + '）');

  // 点击「查看成绩」
  const btn = Array.from(doc.querySelectorAll('.modal button')).find(b => /查看成绩/.test(b.textContent));
  if (btn) { btn.click(); await sleep(200); }
  ok(/成绩单|答卷解析/.test(txt()), '交卷后展示成绩单 / 答卷解析');
  ok(/测试员/.test(txt()), '成绩单显示登录考生姓名（身份已绑定记录）');

  // 打印试卷存档视图
  const bp = doc.getElementById('btnPrint');
  ok(!!bp, '成绩单含「打印试卷存档」按钮');
  if (bp) { bp.click(); await sleep(200); }
  ok(/考试试卷存档/.test(txt()) && /正确答案/.test(txt()), '打印试卷存档视图渲染（含题面/选项/正确答案）');

  // 题库隔离验证：日常培训上传绝不污染关键岗位题库
  await win.LDWS.Bank.save('daily', { id: 'DTEST', name: '测试日常题库', subject: 'X' },
    [{ id: 'q1', t: 1, q: '测试题干', o: ['A', 'B'], a: 'A' }]);
  const dl = win.LDWS.Bank.list('daily');
  const kl = win.LDWS.Bank.list('keypost');
  ok(dl.some(b => b.id === 'DTEST'), '日常培训题库上传后仅出现在 daily 命名空间');
  ok(!kl.some(b => b.id === 'DTEST') && kl.length === 19, '关键岗位内置题库未被污染（仍为 19 个）');

  console.log('\n=== 结果 ===');
  console.log(fail === 0 ? 'SMOKE PASS ✅' : (fail + ' 项失败 ❌'));
  dom.window.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });

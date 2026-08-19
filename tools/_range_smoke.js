// 关键岗位考试 · 考试范围多选弹窗 烟雾测试（jsdom）
// 覆盖：进入组卷设置 → 点开始考试 → 弹窗出现 → chip 渲染 → 切换 → 汇总更新 → 确认组卷启动
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

const TARGET = path.join(ROOT, 'ldws-site', 'index.html');

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const s = String(e);
    if (/Not implemented/i.test(s)) return;
    if (/Could not parse CSS/i.test(s)) return;
    errors.push(s);
  });
  const dom = await JSDOM.fromFile(TARGET, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'file:///' + TARGET.replace(/\\/g, '/'), virtualConsole: vc,
    beforeParse(win) {
      win.print = () => {}; win.scrollTo = () => {}; win.alert = () => {}; win.confirm = () => true;
    }
  });
  const win = dom.window, doc = win.document;
  await new Promise(res => win.addEventListener('load', res));
  await sleep(1500);

  const L = win.LDWS;
  ok(!!L, '已加载 LDWS 全局对象');

  await L.Bank.admins.seed().then(function () {
    return L.UI.login({ user: 'tester', name: '华老三', no: 'EMP001', dept: '检测部', guest: false });
  }).then(async function () {
    L.UI.go('kpExamSetup');
    await sleep(120);
    const html = doc.getElementById('main').innerHTML;
    ok(/组卷设置/.test(html), '组卷设置页渲染');
    ok(!!doc.getElementById('exName'), '考生姓名输入存在');
    ok(!!doc.getElementById('startExam'), '开始考试按钮存在');

    // 填姓名并点击开始考试
    doc.getElementById('exName').value = '张三';
    doc.getElementById('startExam').click();
    await sleep(80);

    const title = doc.getElementById('modalTitle');
    ok(title && /本次考试内容/.test(title.textContent), '弹窗标题为「本次考试内容」');
    const chips = doc.querySelectorAll('#modalBody .chip.rng');
    ok(chips.length > 0, '考试范围 chip 已渲染（数量=' + chips.length + '）');

    // 默认选区：top 岗位应默认选中 科目A、科目B（大纲配比涉及）
    const onChips = doc.querySelectorAll('#modalBody .chip.rng.on');
    ok(onChips.length >= 1, '存在默认选中的科目 chip（数量=' + onChips.length + '）');

    // 汇总文本应出现
    const sum = doc.getElementById('rngSummary');
    ok(sum && /题/.test(sum.innerHTML), '实时汇总已生成：' + (sum ? sum.textContent : ''));

    // 切换一个 chip（取消选中再选中）
    const firstChip = chips[0];
    const wasOn = firstChip.classList.contains('on');
    firstChip.click();
    await sleep(20);
    ok(firstChip.classList.contains('on') !== wasOn, '点击 chip 可切换选中态');

    // 再点一次恢复
    firstChip.click();
    await sleep(20);

    // 点击弹窗内「开始考试」
    const footBtns = doc.querySelectorAll('#modalFoot .btn');
    let startBtn = null;
    footBtns.forEach(b => { if (/开始考试/.test(b.textContent)) startBtn = b; });
    ok(!!startBtn, '弹窗内「开始考试」按钮存在');
    if (startBtn) {
      startBtn.click();
      await sleep(300);
      const examHtml = doc.getElementById('main').innerHTML;
      ok(/答题卡|交卷|单选题|多选题|判断题/.test(examHtml), '确认后进入考试界面（答题卡/题型渲染）');
      ok(doc.getElementById('modalMask').classList.contains('hidden'), '弹窗已关闭');
    }
    return sleep(50);
  }).then(function () {
    ok(errors.length === 0, '无 JS 运行时错误' + (errors.length ? '：' + errors.join(' | ') : ''));
    console.log('\n范围多选弹窗测试：通过 ' + pass + ' / 失败 ' + fail);
    if (fail > 0) process.exit(1);
    process.exit(0);
  }).catch(function (e) {
    console.log('❌ 测试异常：', e && e.stack || e);
    process.exit(1);
  });
})();

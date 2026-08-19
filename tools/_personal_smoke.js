// 绿盾卫士云版 / ldws-site · 个人中心烟雾测试（jsdom）
// 覆盖：学员登录 → personal 渲染；4 个子页（错题本 / 收藏夹 / 学习报告 / 考试记录）空数据 + 模拟数据场景
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

// 由于主入口是 绿盾卫士云版/public/index.html（涵盖完整云前后端集成），且其余两份是简单副本，
// 这里直接测 ldws-site 的 index.html 作为最小可运行版本
const TARGET = path.join(ROOT, 'ldws-site', 'index.html');

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const s = String(e);
    if (/Not implemented/i.test(s)) return;          // jsdom 已知不支持
    if (/Could not parse CSS/i.test(s)) return;       // CSS 兼容性噪音
    errors.push(s);
  });
  const dom = await JSDOM.fromFile(TARGET, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'file:///' + TARGET.replace(/\\/g, '/'), virtualConsole: vc,
    beforeParse(win) {
      win.print = () => {}; win.scrollTo = () => {}; win.alert = () => {}; win.confirm = () => true;
      // 桩掉 application/xlsx 等可能缺失的 MIME
    }
  });
  const win = dom.window, doc = win.document;
  await new Promise(res => win.addEventListener('load', res));
  await sleep(1500);                          // 等待 Bank.init() 与首屏渲染

  const L = win.LDWS;
  ok(!!L, '已加载 LDWS 全局对象');
  ok(typeof L.UI.go === 'function' && typeof L.UI.login === 'function', 'L.UI 已暴露 go/login');

  // 直接模拟考生已登录（避免走注册流程）
  L.Bank.admins.seed().then(function () {
    return L.UI.login({ user: 'tester', name: '华老三', no: 'EMP001', dept: '检测部', guest: false });
  }).then(function () {
    // 1) go('personal') 后页面应包含问候卡片 / 两个模块卡 / 4 个子页入口
    L.UI.go('personal');
    return sleep(50);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/persona-hero/.test(html), '个人中心：问候卡渲染');
    ok(/你好，华老三/.test(html), '个人中心：姓名问候');
    ok(/pmod\s+m-blue/.test(html), '个人中心：专项练习卡');
    ok(/pmod\s+m-violet/.test(html), '个人中心：模拟考试卡');
    ok(/data-go="personalWrong"/.test(html), '个人中心：错题本入口');
    ok(/data-go="personalFav"/.test(html), '个人中心：收藏夹入口');
    ok(/data-go="personalStudy"/.test(html), '个人中心：学习报告入口');
    ok(/data-go="personalRecords"/.test(html), '个人中心：考试记录入口');
    // 统计应在异步回调里填：再等一拍
    return sleep(50);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/累计答题/.test(html), '个人中心：累计答题标签');
    // 等待异步填充 + 再次 sleep 触发 microtask
    return sleep(150);
  }).then(function () {
    const ph = doc.getElementById('phStatTotal');
    const acc = doc.getElementById('phStatAcc');
    const avg = doc.getElementById('phStatAvg');
    ok(ph && /题$/.test(ph.textContent), '个人中心：累计答题异步填充（无记录时为 0题）');
    ok(acc && /%$/.test(acc.textContent), '个人中心：正确率异步填充（无记录时为 0%）');
    ok(avg && /分$/.test(avg.textContent), '个人中心：考试平均分异步填充（无记录时为 0分）');

    // 2) 子页：错题本（无数据时为空提示）
    L.UI.go('personalWrong');
    return sleep(80);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/错题本/.test(html), '子页：错题本标题');
    ok(/(暂无论题|加载中)/.test(html), '子页：错题本空状态/加载态');
    ok(/ns-tabs/.test(html), '子页：模块筛选 tab');

    // 3) 收藏夹
    L.UI.go('personalFav');
    return sleep(80);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/收藏夹/.test(html), '子页：收藏夹标题');
    ok(/(暂无收藏|加载中)/.test(html), '子页：收藏夹空状态/加载态');

    // 4) 学习报告（无 records 时显示考试次数 0 场）
    L.UI.go('personalStudy');
    return sleep(150);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/学习报告/.test(html), '子页：学习报告标题');
    ok(/stat-grid/.test(html), '子页：学习报告 6 张统计卡');
    ok(/日常培训考核/.test(html) && /关键岗位人员考试/.test(html), '子页：模块分块');
    ok(/暂无考试记录|近期考试/.test(html), '子页：近期考试块');

    // 5) 考试记录（无 records 时为空提示）
    L.UI.go('personalRecords');
    return sleep(150);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/考试记录/.test(html), '子页：考试记录标题');
    ok(/暂无考试记录|查看详情/.test(html), '子页：考试记录空表/表头');

    // 6) 注入 1 条考试记录后看筛选 & 详情路径
    return L.Store.set('records', [{
      id: 'Rtest1', ts: Date.now(), ns: 'keypost', mode: 'exam', title: '科目A模拟卷',
      who: { user: 'tester', name: '华老三', no: 'EMP001', dept: '检测部' },
      score: 85, total: 100, pass: true, passScore: 70,
      right: 28, wrong: 2, blank: 0, used: 1820, switches: 0, auto: false, reason: '',
      paper: [], detail: []
    }]);
  }).then(function () {
    L.UI.go('personalStudy');
    return sleep(120);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/考试次数/.test(html) && /1场/.test(html), '有 1 条记录时：考试次数 = 1场');
    ok(/最高/.test(html) && /85/.test(html), '有 1 条记录时：显示最高分 85');

    L.UI.go('personalRecords');
    return sleep(120);
  }).then(function () {
    const html = doc.getElementById('main').innerHTML;
    ok(/查看详情/.test(html), '有记录时：考试记录表格有详情按钮');
    ok(/科目A模拟卷/.test(html), '有记录时：试卷标题正确');
  }).then(function () {
    ok(errors.length === 0, '页面无致命 JS 异常（最后断言）');
    console.log('\n---');
    console.log(`PASS=${pass}  FAIL=${fail}  errors=${errors.length}`);
    if (errors.length) console.log('errors:', errors.slice(0, 5));
    dom.window.close();
    process.exit(fail ? 1 : 0);
  }).catch(function (e) {
    console.error('FAIL with exception:', e && e.stack || e);
    console.log('errors collected:', errors.slice(0, 3));
    dom.window.close();
    process.exit(1);
  });
})();

/* 直达考试链接测试：jsdom 加载带 query 的 index.html */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail++; };

const URL = pathToFileURL(path.join(ROOT, 'index.html')).href + '?post=tech&exam=1&kiosk=1';

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => { const m = String(e && e.message || e); if (!/scrollTo|Not implemented/.test(m)) errors.push(m); });

(async function () {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: URL,
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.print = function () {};
      win.scrollTo = function () {};
    }
  });
  const win = dom.window, doc = win.document;
  // 等待 bank 初始化 + 登录门禁渲染
  for (let i = 0; i < 100; i++) {
    if (win.LDWS && win.LDWS.Bank && win.LDWS.Bank.cfg && doc.getElementById('btnLogin')) break;
    await sleep(100);
  }
  ok(/考生登录/.test(doc.body.textContent), '直达链接未登录时先显示登录界面');
  // 游客模式已移除：通过注册账号登录，登录后应按 deepLink 自动跳转到对应考试设置页
  doc.querySelector('.lc-tab[data-tab="reg"]').click();
  doc.getElementById('rUser').value = 'dl_test_' + Date.now();
  doc.getElementById('rPw').value = 'test1234';
  doc.getElementById('rPw2').value = 'test1234';
  doc.getElementById('rName').value = '直达测试';
  doc.getElementById('rA').value = 'dog';
  doc.getElementById('btnReg').click();

  for (let i = 0; i < 100; i++) {
    if (doc.querySelector('.pick[data-post="tech"]')) break;
    await sleep(100);
  }

  ok(errors.length === 0, '直达链接加载无 JS 运行时错误' + (errors.length ? '：' + errors.join('; ') : ''));
  ok(!!doc.querySelector('[data-post="tech"].on'), '已预选「技术负责人」岗位');
  ok(!!doc.querySelector('#startExam'), '组卷设置页已渲染（含「开始考试」按钮）');
  const adminBtn = doc.getElementById('btnAdminEntry');
  ok(!adminBtn, 'kiosk=1：后台入口已从考生界面移除（考生无法进入后台）');
  const hd = (doc.querySelector('.page-hd h2') || {}).textContent || '';
  ok(/组卷设置/.test(hd), '标题为「关键岗位人员考试 · 组卷设置」（' + hd + '）');

  console.log('\n=== 直达链接结果 ===');
  console.log(fail === 0 ? 'DEEPLINK PASS ✅' : ('DEEPLINK FAIL ❌ (' + fail + ')'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

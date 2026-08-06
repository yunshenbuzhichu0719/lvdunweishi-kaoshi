/* 真实 Chromium E2E 冒烟测试（playwright-core + 本地 chromium-1234） */
const { chromium } = require('playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, '_e2e_shots');
const EXE = 'C:/Users/ydyyf/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function () {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const url = 'file://' + ROOT + '/index.html';
  await page.goto(url, { waitUntil: 'load' });
  await sleep(900);

  console.log('\n【E1】加载与授权模块');
  ok(await page.evaluate(() => !!(window.LDWS && window.LDWS.Auth)), 'LDWS.Auth 已加载');
  ok(await page.evaluate(() => window.LDWS.Auth.cfg().enabled === true), '默认启用授权码访问控制');
  await page.screenshot({ path: path.join(SHOTS, '01-home.png') });

  console.log('\n【E2】学员门禁：未授权进入被拦截并弹窗');
  await page.evaluate(() => {
    const L = window.LDWS;
    L.Bank.accounts.saveSync
      ? null
      : null;
  });
  // 直接以学员身份登录并进入 daily
  await page.evaluate(async () => {
    const L = window.LDWS;
    await L.Bank.accounts.save({ user: 'zhangsan', pass: L.pwHash('1234'), name: '张三', no: 'G001', dept: '检测部' });
    L.UI.login({ user: 'zhangsan', name: '张三', no: 'G001', dept: '检测部' });
  });
  await sleep(120);
  await page.evaluate(() => window.LDWS.UI.go('daily'));
  await sleep(350);
  const gateVisible = await page.evaluate(() => {
    const m = document.getElementById('modalMask');
    const has = txt => (document.body.textContent || '').indexOf(txt) >= 0;
    return {
      modal: m && !m.classList.contains('hidden'),
      gateText: has('需要授权码才能进入') || has('授权码'),
      tabs: has('输入授权码') && has('申请授权码')
    };
  });
  ok(gateVisible.modal, '未授权进入时授权弹窗自动弹出');
  ok(gateVisible.tabs, '弹窗含「输入授权码 / 申请授权码」页签');
  await page.screenshot({ path: path.join(SHOTS, '02-auth-modal.png') });

  console.log('\n【E3】学员提交申请 → 后台可见');
  const reqCode = await page.evaluate(async () => {
    const L = window.LDWS;
    // 切到申请页签并提交
    const tab = document.querySelector('[data-atab="req"]'); if (tab) tab.click();
    await new Promise(r => setTimeout(r, 80));
    const btn = document.getElementById('apSubmit'); if (btn) btn.click();
    await new Promise(r => setTimeout(r, 120));
    const ta = document.getElementById('apReqCode');
    return ta ? ta.value : '';
  });
  ok(reqCode.indexOf('LDREQ-') === 0, '学员端生成可转发的申请码 ' + reqCode.slice(0, 18) + '…');
  await sleep(150);
  const pending = await page.evaluate(async () => {
    const list = await window.LDWS.Auth.reqs.all();
    return list.filter(r => r.status === 'pending').length;
  });
  ok(pending >= 1, '后台申请台账出现 ' + pending + ' 条待处理');

  console.log('\n【E4】后台授权管理页渲染');
  await page.evaluate(() => { window.LDWS.UI.adminLogin({ user: 'admin', name: '系统管理员' }); });
  await sleep(200);
  await page.evaluate(() => { window.LDWS.Admin.enter('dailyAuth'); });
  await sleep(350);
  const adminOk = await page.evaluate(() => {
    const t = document.body.textContent || '';
    return t.indexOf('日常授权管理') >= 0 && t.indexOf('授权申请') >= 0 && t.indexOf('授权台账') >= 0;
  });
  ok(adminOk, '后台「日常授权管理」页面渲染完整');
  // 收掉残留学员端授权弹窗，便于清晰截图后台页
  await page.evaluate(() => { const m = document.getElementById('modalMask'); if (m) m.classList.add('hidden'); });
  await sleep(80);
  await page.screenshot({ path: path.join(SHOTS, '03-admin-auth.png') });

  console.log('\n【E5】后台授权 → 学员自动放行');
  const granted = await page.evaluate(async () => {
    const A = window.LDWS.Auth;
    const list = await A.reqs.all();
    const p = list.find(r => r.status === 'pending');
    if (!p) return { ok: false };
    const g = await A.grants.issue({ bindUser: p.user, name: p.name, no: p.no, dept: p.dept, days: p.days || A.cfg().days, reqId: p.id });
    await A.reqs.update(p.id, { status: 'granted', code: g.code });
    return { ok: true, code: g.code };
  });
  ok(granted.ok, '后台为待处理申请签发授权码 ' + (granted.code || ''));
  await sleep(200);
  // 切回学员视角（会话须为 zhangsan），再次进入 daily 应自动放行
  const autoPass = await page.evaluate(async () => {
    const L = window.LDWS;
    L.UI.login({ user: 'zhangsan', name: '张三', no: 'G001', dept: '检测部' });
    await new Promise(r => setTimeout(r, 60));
    L.UI.go('daily');
    await new Promise(r => setTimeout(r, 300));
    const chk = await L.Auth.check();
    const hasGate = (document.body.textContent || '').indexOf('该模块需要授权码') >= 0;
    return { ok: chk.ok, hasGate };
  });
  ok(autoPass.ok && !autoPass.hasGate, '同机场景：学员再次进入日常培训自动放行（门禁消失）');
  await page.screenshot({ path: path.join(SHOTS, '04-daily-unlocked.png') });

  console.log('\n【E6】错误检查');
  ok(errors.length === 0, '运行期无脚本错误' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (fail === 0 ? '✅ 真实浏览器 E2E 全部通过' : '❌ 失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 异常:', e); process.exit(2); });

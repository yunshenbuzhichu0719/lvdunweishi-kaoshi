/* E2E cloud-mode test: register → login → auth gate → apply → admin authorize → auto-pass
 * Uses real Chromium via playwright-core + local chromium-1234.
 */
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SHOTS = path.join(__dirname, '_e2e_cloud_shots');
const fs = require('fs');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = 'C:/Users/ydyyf/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Use a unique data file for this test run
  const DATA_FILE = path.join(ROOT, '_e2e_data.json');
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);

  // Start backend server
  const { spawn } = require('child_process');
  const server = spawn('C:/Users/ydyyf/.workbuddy/binaries/node/versions/22.22.2/node.exe', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '3999', DATA_FILE: DATA_FILE },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  await sleep(1500);

  const BASE = 'http://localhost:3999';

  try {
    console.log('\n【C1】页面加载 + 云模式检测');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(500);
    const isCloud = await page.evaluate(() => window.LDWS.Cloud && window.LDWS.Cloud.isCloud());
    ok(isCloud, 'Cloud.isCloud() 返回 true（http 访问模式）');
    await page.screenshot({ path: path.join(SHOTS, '01-home.png') });

    console.log('\n【C2】学员注册（云端）');
    await page.evaluate(() => window.LDWS.UI.go('login'));
    await sleep(300);
    // Switch to register tab
    await page.evaluate(() => { document.querySelector('[data-tab="reg"]').click(); });
    await sleep(200);
    await page.fill('#rUser', 'zhangsan');
    await page.fill('#rPw', '1234');
    await page.fill('#rPw2', '1234');
    await page.fill('#rName', '张三');
    await page.fill('#rNo', 'G001');
    await page.fill('#rDept', '检测部');
    await page.fill('#rA', '答案');
    await page.click('#btnReg');
    await sleep(1000);
    const loggedIn = await page.evaluate(() => {
      var s = window.LDWS.UI.session();
      return s && s.user === 'zhangsan' && s.name === '张三';
    });
    ok(loggedIn, '注册成功并自动登录，session.user=zhangsan, name=张三');
    ok(loggedIn && (await page.evaluate(() => window.LDWS.UI.session().no)) === 'G001', '注册时工号 G001 已保存');
    await page.screenshot({ path: path.join(SHOTS, '02-registered.png') });

    console.log('\n【C3】进入日常培训考核 → 被门禁拦截');
    await page.evaluate(() => window.LDWS.UI.go('daily'));
    await sleep(600);
    const gateVisible = await page.evaluate(() => {
      var t = document.body.textContent || '';
      return t.indexOf('需要授权码') >= 0 || t.indexOf('授权码') >= 0;
    });
    ok(gateVisible, '门禁拦截，显示授权码提示');
    await page.screenshot({ path: path.join(SHOTS, '03-gate.png') });

    console.log('\n【C4】学员申请授权码（云端）');
    // Switch to "申请授权码" tab
    await page.click('[data-atab="req"]');
    await sleep(300);
    // Fill note and submit
    await page.fill('#apNote', '培训需要');
    await page.click('#apSubmit');
    await sleep(1500);
    // Wait for the apply-done panel to show
    const reqCode = await page.evaluate(() => {
      var ta = document.getElementById('apReqCode');
      return ta ? ta.value : '';
    });
    ok(reqCode.indexOf('LDREQ-') === 0, '生成申请码 ' + reqCode.slice(0, 20) + '…');
    await page.screenshot({ path: path.join(SHOTS, '04-applied.png') });

    console.log('\n【C5】后台管理员看到申请');
    // Admin login via API
    const adminResp = await page.evaluate(async () => {
      var r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'admin', pass: 'ldws2025' })
      });
      return r.json();
    });
    ok(adminResp.ok, '管理员登录成功');
    // Store admin token
    await page.evaluate((token, admin) => {
      localStorage.setItem('ldws_admin_token', token);
      localStorage.setItem('ldws_admin', JSON.stringify(admin));
    }, adminResp.token, adminResp.admin);

    // Close any open modal and stop auth poll
    await page.evaluate(() => {
      if (window.LDWS.UI && window.LDWS.UI.stopAuthPoll) window.LDWS.UI.stopAuthPoll();
      var mask = document.getElementById('modalMask');
      if (mask) mask.classList.add('hidden');
    });
    await sleep(300);

    // Enter admin and navigate to dailyAuth
    await page.evaluate(() => {
      window.LDWS.UI.adminLogin({ user: 'admin', name: '系统管理员' });
    });
    await sleep(200);
    await page.evaluate(() => window.LDWS.Admin.enter('dailyAuth'));
    await sleep(1500); // Wait for cloud config load + render

    const adminPageOk = await page.evaluate(() => {
      var t = document.body.textContent || '';
      return t.indexOf('日常培训考核') >= 0 && t.indexOf('授权管理') >= 0;
    });
    ok(adminPageOk, '后台「日常授权管理」页面渲染');
    await page.screenshot({ path: path.join(SHOTS, '05-admin-auth.png') });

    // Check if the request is visible
    const reqVisible = await page.evaluate(() => {
      var t = document.body.textContent || '';
      return t.indexOf('zhangsan') >= 0 && t.indexOf('张三') >= 0;
    });
    ok(reqVisible, '后台申请列表看到 zhangsan / 张三 的申请');
    await page.screenshot({ path: path.join(SHOTS, '06-req-list.png') });

    console.log('\n【C6】管理员授权 → 学员自动放行');
    // Click the "授权" button for the first pending request
    await page.evaluate(() => {
      var btn = document.querySelector('[data-grant]');
      if (btn) btn.click();
    });
    await sleep(1500);
    // Check if a code was generated (showCodeBox modal)
    const codeGenerated = await page.evaluate(() => {
      var t = document.body.textContent || '';
      var m = t.match(/LD-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      return m ? m[0] : '';
    });
    ok(!!codeGenerated, '授权成功，生成授权码 ' + (codeGenerated || '(未找到)'));
    await page.screenshot({ path: path.join(SHOTS, '07-granted.png') });

    // Close modal
    await page.evaluate(() => {
      var mask = document.getElementById('modalMask');
      if (mask) mask.classList.add('hidden');
    });
    await sleep(200);

    console.log('\n【C7】学员再次进入日常培训 → 自动放行');
    // Switch back to student session
    await page.evaluate(() => {
      // Clear admin session, restore student session
      window.LDWS.UI.adminLogout();
    });
    await sleep(200);
    // The student token should still be in localStorage
    await page.evaluate(() => {
      // Re-init session from cloud
      window.LDWS.UI.initSession();
    });
    await sleep(500);
    await page.evaluate(() => window.LDWS.UI.go('daily'));
    await sleep(1000);
    const autoPass = await page.evaluate(() => {
      var t = document.body.textContent || '';
      // Should see daily training content, not the gate
      var hasGate = t.indexOf('需要授权码才能进入') >= 0;
      var hasContent = t.indexOf('刷题') >= 0 || t.indexOf('考试') >= 0 || t.indexOf('培训资料') >= 0;
      return { ok: !hasGate && hasContent, hasGate: hasGate };
    });
    ok(autoPass.ok, '学员再次进入日常培训自动放行（门禁消失）');
    await page.screenshot({ path: path.join(SHOTS, '08-auto-pass.png') });

    console.log('\n【C8】管理员撤销授权 → 学员被拦截');
    // Admin login again
    await page.evaluate(async () => {
      var r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'admin', pass: 'ldws2025' })
      });
      var data = await r.json();
      if (data.ok) {
        localStorage.setItem('ldws_admin_token', data.token);
        localStorage.setItem('ldws_admin', JSON.stringify(data.admin));
      }
    });
    await sleep(300);
    await page.evaluate(() => {
      window.LDWS.UI.adminLogin({ user: 'admin', name: '系统管理员' });
    });
    await sleep(200);
    await page.evaluate(() => window.LDWS.Admin.enter('dailyAuth'));
    await sleep(1500);
    // Click "撤销" for the first active grant
    await page.evaluate(() => {
      var btn = document.querySelector('[data-goff]');
      if (btn) btn.click();
    });
    await sleep(500);
    // Confirm in the confirmBox modal (button text "撤销")
    await page.evaluate(() => {
      var btns = document.querySelectorAll('#modalFoot button, .modal-ft button');
      btns.forEach(function(b) {
        if (b.textContent.trim() === '撤销' || b.textContent.trim() === '全部撤销') b.click();
      });
    });
    await sleep(1200);
    const revokedOk = await page.evaluate(() => {
      var t = document.body.textContent || '';
      return t.indexOf('已撤销') >= 0;
    });
    ok(revokedOk, '授权已撤销');
    await page.screenshot({ path: path.join(SHOTS, '09-revoked.png') });

    // Switch back to student
    await page.evaluate(() => window.LDWS.UI.adminLogout());
    await sleep(200);
    await page.evaluate(() => window.LDWS.UI.initSession());
    await sleep(500);
    await page.evaluate(() => window.LDWS.UI.go('daily'));
    await sleep(1000);
    const blockedAgain = await page.evaluate(() => {
      var t = document.body.textContent || '';
      return t.indexOf('需要授权码') >= 0 || t.indexOf('授权码') >= 0;
    });
    ok(blockedAgain, '撤销后学员再次进入被门禁拦截');
    await page.screenshot({ path: path.join(SHOTS, '10-blocked.png') });

    console.log('\n【C9】无 JS 错误');
    ok(errors.length === 0, '页面无未捕获 JS 错误' + (errors.length ? '：' + errors.slice(0, 3).join('; ') : ''));

  } catch (e) {
    console.error('E2E 异常:', e);
    fail++;
    await page.screenshot({ path: path.join(SHOTS, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
    server.kill();
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  }

  console.log('\n========== ' + pass + ' 通过 / ' + fail + ' 失败 ==========');
  process.exit(fail > 0 ? 1 : 0);
})();

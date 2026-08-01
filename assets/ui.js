/* ===========================================================
 *  ui.js —— 通用组件 + 刷题 / 考试 / 成绩单
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS;
  var OPTL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var _deep = null; // 直达考试链接参数（?post= &exam= &cat= &kiosk=）
  var _reportUrl = '';   // 直达链接 ?reportUrl= 覆盖回传地址
  var _reportForce = false; // 直达链接 ?report=1 强制回传
  var _session = null;   // 登录态：{name,no,dept}

  /* ============ 基础工具 ============ */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function main() { return $('#main'); }
  function setHTML(html) { main().innerHTML = html; main().scrollTop = 0; try { if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); } catch (e) {} }

  var toastTimer;
  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, 2600);
  }

  function modal(opt) {
    return new Promise(function (res) {
      $('#modalTitle').textContent = opt.title || '提示';
      $('#modalBody').innerHTML = opt.html || esc(opt.text || '');
      var ft = $('#modalFoot');
      ft.innerHTML = '';
      var btns = opt.buttons || [{ text: '确定', primary: true, value: true }];
      btns.forEach(function (b) {
        var el = document.createElement('button');
        el.className = 'btn ' + (b.primary ? (b.danger ? 'danger' : '') : 'ghost');
        el.textContent = b.text;
        el.onclick = function () { close(); res(b.value); };
        ft.appendChild(el);
      });
      $('#modalMask').classList.remove('hidden');
      function close() { $('#modalMask').classList.add('hidden'); }
      $('#modalMask').onclick = function (e) {
        if (e.target === $('#modalMask') && !opt.lock) { close(); res(null); }
      };
    });
  }
  function confirmBox(title, text, okText, danger) {
    return modal({
      title: title, html: text, lock: true,
      buttons: [{ text: '取消', value: false }, { text: okText || '确定', primary: true, danger: danger, value: true }]
    });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h > 0 ? (h < 10 ? '0' + h : h) + ':' : '') + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }
  function fmtDate(ts) {
    var d = new Date(ts), p = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function typeTag(t) {
    return '<span class="tag t' + t + '">' + L.Bank.typeName(t) + '</span>';
  }

  /* ============ 路由 + 返回导航 ============ */
  var Router = { stack: [], current: null };
  function go(view, params) {
    Router.current = { view: view, params: params || {} };
    Views[view](params || {});
    refreshNav();
  }
  // 根据当前视图计算「返回」目标；返回 null 表示无返回（首页/登录）
  function navTarget() {
    var v = Router.current && Router.current.view;
    if (!v) return null;
    if (v === 'daily' || v === 'keypost') return 'home';
    if (v === 'dailyPractice' || v === 'dailyExamSetup') return 'daily';
    if (v === 'kpPractice' || v === 'kpExamSetup') return 'keypost';
    if (v === 'result' || v === 'cert' || v === 'print' || v === 'exam') {
      return (Router.current.params && Router.current.params.ns) || 'home';
    }
    return null;
  }
  function refreshNav() {
    var b = document.getElementById('btnBack');
    if (!b) return;
    var t = navTarget();
    if (t) { b.classList.remove('hidden'); b.setAttribute('data-back', t); }
    else b.classList.add('hidden');
  }
  function crumb(items) {
    return '<div class="crumb">' + items.map(function (it, i) {
      if (it.go) return '<a data-go="' + it.go + '" data-p=\'' + esc(JSON.stringify(it.params || {})) + '\'>' + esc(it.t) + '</a><span>/</span>';
      return '<b>' + esc(it.t) + '</b>';
    }).join('') + '</div>';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-go]');
    if (!a) return;
    var p = {};
    try { p = JSON.parse(a.getAttribute('data-p') || '{}'); } catch (err) { }
    go(a.getAttribute('data-go'), p);
  });

  /* ============ 记录 ============ */
  function saveRecord(rec) {
    return L.Store.get('records').then(function (list) {
      list = list || [];
      list.unshift(rec);
      if (list.length > 800) list = list.slice(0, 800);
      return L.Store.set('records', list);
    });
  }

  /* 错题本 / 收藏 */
  function loadSet(key) { return L.Store.get(key).then(function (v) { return v || {}; }); }

  /* ============ 首页 ============ */
  var Views = {};

  Views.home = function () {
    var kp = L.Bank.list('keypost'), daily = L.Bank.list('daily');
    var kpN = kp.reduce(function (s, b) { return s + b.total; }, 0);
    var dN = daily.reduce(function (s, b) { return s + b.total; }, 0);
    setHTML(
      '<div class="hero">' +
      '<h1>内部培训考核系统</h1>' +
      '<p>面向公司全员的日常培训考核，以及依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》组织的关键岗位人员模拟考试。两套题库完全独立管理，互不混用。</p>' +
      '<div class="stats">' +
      '<div><b>' + dN + '</b><span>日常培训题库题量</span></div>' +
      '<div><b>' + kpN + '</b><span>关键岗位题库题量</span></div>' +
      '<div><b>' + kp.length + '</b><span>关键岗位科目/专业类别</span></div>' +
      '</div></div>' +

      '<div class="mods">' +
      '<div class="mod m1" data-go="daily">' +
      '<div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a6fd4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>' +
      '<h3>日常培训考核</h3>' +
      '<p>公司内部各项培训的学习与考核，题库由管理员在后台单独上传维护。</p>' +
      '<div class="feats"><span>刷题模式</span><span>考试模式</span><span>错题本</span><span>独立题库</span></div>' +
      '<div class="go">进入模块 →</div></div>' +

      '<div class="mod m2" data-go="keypost">' +
      '<div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0e7a4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></div>' +
      '<h3>关键岗位人员考试</h3>' +
      '<p>最高管理者 / 技术负责人 / 质量负责人 / 授权签字人考前训练与模拟考，按大纲规则随机组卷。</p>' +
      '<div class="feats"><span>刷题模式</span><span>模拟考试</span><span>随机组卷</span><span>防切屏</span></div>' +
      '<div class="go">进入模块 →</div></div>' +
      '</div>'
    );
  };

  /* ============ 登录（入口门禁） ============ */
  function initSession() {
    return L.Store.get('session').then(function (s) { _session = s || null; updateUserChip(); return _session; });
  }
  function updateUserChip() {
    var chip = document.getElementById('userChip');
    if (!chip) return;
    if (_session) {
      chip.classList.remove('hidden');
      var nm = _session.name || '考生';
      chip.innerHTML = '您好，' + esc(nm) +
        ' <a id="btnLogout" style="cursor:pointer;margin-left:8px;color:var(--green-900);text-decoration:underline;font-weight:700">退出</a>';
      var lo = document.getElementById('btnLogout');
      if (lo) lo.onclick = function () { doLogout(); };
    } else { chip.classList.add('hidden'); chip.innerHTML = ''; }
  }
  function doLogin(who) {
    _session = who;
    L.Store.set('session', who);
    updateUserChip();
    toast('登录成功，欢迎 ' + who.name, 'ok');
    var q; try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    if (q && (q.get('post') || q.get('daily'))) deepLink();
    else go('home');
  }
  function doLogout() {
    _session = null;
    L.Store.del('session');
    updateUserChip();
    go('login');
  }

  /* ============ 管理员登录态 ============ */
  var _adminSession = null;
  function initAdminSession() {
    return L.Store.get('adminSession').then(function (s) { _adminSession = s || null; return _adminSession; });
  }
  function adminLogin(acc) {
    _adminSession = { user: acc.user, name: acc.name };
    return L.Store.set('adminSession', _adminSession);
  }
  function adminLogout() {
    _adminSession = null;
    return L.Store.del('adminSession');
  }
  function isAdminLoggedIn() { return !!_adminSession; }

  Views.adminLogin = function () {
    setHTML(
      '<div class="login-wrap"><div class="login-card">' +
      '<div class="lc-logo"><svg viewBox="0 0 32 38" width="34" height="40" aria-hidden="true">' +
      '<path d="M16 1 L30 6 v14c0 8.5-5.9 14.4-14 17C7.9 34.4 2 28.5 2 20V6z" fill="#0e7a4f"/>' +
      '<path d="M16 1 L30 6 v14c0 8.5-5.9 14.4-14 17z" fill="#129962"/>' +
      '<path d="M9.5 19.2 l4.4 4.4 L23 14.4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<h2>管理员登录</h2>' +
      '<div class="sub">使用管理员账户（用户名 + 密码）进入后台</div>' +
      '<label class="fld"><span>管理员用户名 <b style="color:var(--red)">*</b></span><input type="text" id="aUser" placeholder="如 admin" autocomplete="username"></label>' +
      '<label class="fld"><span>密码 <b style="color:var(--red)">*</b></span><input type="password" id="aPw" placeholder="请输入密码" autocomplete="current-password"></label>' +
      '<div class="lc-err" id="aErr"></div>' +
      '<button class="btn lg" id="btnAlogin">登　录</button>' +
      '<div class="lc-tip">管理员账户可在后台「管理员账户」页生成与管理；初始账户 <b>admin</b> / 初始密码 <b>' + esc((L.Bank.cfg && L.Bank.cfg.adminPass) || 'ldws2025') + '</b>，登录后请尽快修改。</div>' +
      '</div>' +
      '<div style="margin-top:16px;font-size:13px;color:var(--ink-400)"><a id="toExaminee" style="cursor:pointer;color:var(--green-800);text-decoration:underline">← 返回考生登录</a></div>' +
      '</div>'
    );
    function setErr(m) { var e = $('#aErr'); if (e) e.textContent = m || ''; }
    function tryLogin() {
      var user = ($('#aUser').value || '').trim();
      var pw = $('#aPw').value || '';
      if (!user) { setErr('请输入管理员用户名'); return; }
      setErr('');
      L.Bank.admins.get(user).then(function (acc) {
        if (!acc || L.pwHash(pw) !== acc.pass) { setErr('用户名或密码错误'); return; }
        adminLogin(acc).then(function () { L.Admin.enter(); });
      });
    }
    $('#btnAlogin').onclick = tryLogin;
    $('#aUser').onkeydown = function (e) { if (e.key === 'Enter') tryLogin(); };
    $('#aPw').onkeydown = function (e) { if (e.key === 'Enter') tryLogin(); };
    $('#toExaminee').onclick = function () { go('login'); };
  };

  Views.login = function () {
    var SEC_Q = ['您母亲的姓名？', '您就读的第一所小学名称？', '您出生城市的名称？', '您宠物的名字？', '您最喜欢的一本书？'];
    setHTML(
      '<div class="login-wrap"><div class="login-card">' +
      '<div class="lc-logo"><svg viewBox="0 0 32 38" width="34" height="40" aria-hidden="true">' +
      '<path d="M16 1 L30 6 v14c0 8.5-5.9 14.4-14 17C7.9 34.4 2 28.5 2 20V6z" fill="#0e7a4f"/>' +
      '<path d="M16 1 L30 6 v14c0 8.5-5.9 14.4-14 17z" fill="#129962"/>' +
      '<path d="M9.5 19.2 l4.4 4.4 L23 14.4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<h2>考生登录</h2>' +
      '<div class="sub">请先登录，再以本人身份参加考试</div>' +

      // 登录面板
      '<div id="loginPane">' +
      '<label class="fld"><span>用户名 <b style="color:var(--red)">*</b></span><input type="text" id="lUser" placeholder="请输入用户名" autocomplete="username"></label>' +
      '<label class="fld"><span>密码 <b style="color:var(--red)">*</b></span><input type="password" id="lPw" placeholder="请输入密码" autocomplete="current-password"></label>' +
      '<div class="lc-err" id="loginErr"></div>' +
      '<button class="btn lg" id="btnLogin">登　录</button>' +
      '</div>' +

      // 注册面板
      '<div id="regPane" class="hidden">' +
      '<label class="fld"><span>用户名 <b style="color:var(--red)">*</b></span><input type="text" id="rUser" placeholder="用于登录，建议用姓名拼音/工号"></label>' +
      '<div class="grid g2">' +
      '<label class="fld"><span>密码 <b style="color:var(--red)">*</b></span><input type="password" id="rPw" placeholder="至少 4 位"></label>' +
      '<label class="fld"><span>确认密码 <b style="color:var(--red)">*</b></span><input type="password" id="rPw2" placeholder="再次输入密码"></label></div>' +
      '<label class="fld"><span>姓名 <b style="color:var(--red)">*</b></span><input type="text" id="rName" placeholder="考生真实姓名" autocomplete="name"></label>' +
      '<div class="grid g2">' +
      '<label class="fld"><span>工号 / 证件号</span><input type="text" id="rNo" placeholder="选填"></label>' +
      '<label class="fld"><span>所在部门</span><input type="text" id="rDept" placeholder="选填"></label></div>' +
      '<label class="fld"><span>密保问题 <b style="color:var(--red)">*</b></span><select id="rQ">' + SEC_Q.map(function (q) { return '<option value="' + esc(q) + '">' + esc(q) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld"><span>密保答案 <b style="color:var(--red)">*</b></span><input type="text" id="rA" placeholder="用于找回密码"></label>' +
      '<div class="lc-err" id="regErr"></div>' +
      '<button class="btn lg" id="btnReg">注　册</button>' +
      '<div class="lc-tip">账号仅保存在你本机浏览器；注册后即可用用户名+密码登录，并自动带入姓名/工号/部门。</div>' +
      '</div>' +

      // 忘记密码面板
      '<div id="fpPane" class="hidden">' +
      '<label class="fld"><span>用户名 <b style="color:var(--red)">*</b></span><input type="text" id="fUser" placeholder="请输入注册时的用户名"></label>' +
      '<div id="fpStep2" class="hidden">' +
      '<div class="lc-q" id="fQText"></div>' +
      '<label class="fld"><span>密保答案 <b style="color:var(--red)">*</b></span><input type="text" id="fA" placeholder="请输入密保问题答案"></label>' +
      '<div class="grid g2">' +
      '<label class="fld"><span>新密码 <b style="color:var(--red)">*</b></span><input type="password" id="fPw" placeholder="至少 4 位"></label>' +
      '<label class="fld"><span>确认新密码 <b style="color:var(--red)">*</b></span><input type="password" id="fPw2" placeholder="再次输入"></label></div>' +
      '</div>' +
      '<div class="lc-err" id="fpErr"></div>' +
      '<button class="btn lg" id="btnFp">下　一　步</button>' +
      '<div class="lc-tip">通过注册时设置的密保问题验证身份，即可重置密码。</div>' +
      '</div>' +

      // 切换标签（注册 / 忘记密码）置于长条登录按钮正下方
      '<div class="lc-tabs">' +
      '<button class="lc-tab" data-tab="reg">注册</button>' +
      '<button class="lc-tab" data-tab="fp">忘记密码</button>' +
      '</div>' +
      '<div class="lc-tip">登录后将以该身份参加考试，成绩与答卷记入你的考试档案，可在「后台管理 → 考试记录」中查询、打印存档。</div>' +

      '</div>' +
      '<div style="margin-top:16px;font-size:13px;color:var(--ink-400)"><a id="toAdmin" style="cursor:pointer;color:var(--green-800);text-decoration:underline">管理员登录 →</a></div>' +
      '</div>'
    );
    var toAdmin = document.getElementById('toAdmin');
    if (toAdmin) toAdmin.onclick = function () { go('adminLogin'); };

    function switchTab(t) {
      $$('.lc-tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
      $('#loginPane').classList.toggle('hidden', t !== 'login');
      $('#regPane').classList.toggle('hidden', t !== 'reg');
      $('#fpPane').classList.toggle('hidden', t !== 'fp');
    }
    $$('.lc-tab').forEach(function (b) { b.onclick = function () { switchTab(b.getAttribute('data-tab')); }; });

    function setErr(id, msg) { var e = $('#' + id); if (e) e.textContent = msg || ''; }

    // ---- 登录 ----
    function tryLogin() {
      var user = ($('#lUser').value || '').trim();
      var pw = $('#lPw').value || '';
      if (!user) { setErr('loginErr', '请输入用户名'); return; }
      setErr('loginErr', '');
      L.Bank.accounts.get(user).then(function (acc) {
        if (!acc) { setErr('loginErr', '账号不存在，请先注册'); return; }
        if (L.pwHash(pw) !== acc.pass) { setErr('loginErr', '账号或密码错误'); return; }
        doLogin({ user: acc.user, name: acc.name, no: acc.no || '', dept: acc.dept || '', guest: false });
      });
    }
    $('#btnLogin').onclick = tryLogin;
    $('#lUser').onkeydown = function (e) { if (e.key === 'Enter') tryLogin(); };
    $('#lPw').onkeydown = function (e) { if (e.key === 'Enter') tryLogin(); };

    // ---- 注册 ----
    function tryReg() {
      var user = ($('#rUser').value || '').trim();
      var pw = $('#rPw').value || '', pw2 = $('#rPw2').value || '';
      var name = ($('#rName').value || '').trim();
      var ans = ($('#rA').value || '').trim().toLowerCase();
      setErr('regErr', '');
      if (user.length < 2) return setErr('regErr', '用户名至少 2 个字符');
      if (pw.length < 4) return setErr('regErr', '密码至少 4 位');
      if (pw !== pw2) return setErr('regErr', '两次输入的密码不一致');
      if (!name) return setErr('regErr', '请填写姓名');
      if (!ans) return setErr('regErr', '请填写密保答案');
      L.Bank.accounts.get(user).then(function (ex) {
        if (ex) { setErr('regErr', '该用户名已被注册'); return; }
        var acc = {
          user: user, pass: L.pwHash(pw), name: name,
          no: ($('#rNo').value || '').trim(), dept: ($('#rDept').value || '').trim(),
          q: $('#rQ').value, a: L.pwHash(ans)
        };
        L.Bank.accounts.save(acc).then(function () {
          doLogin({ user: acc.user, name: acc.name, no: acc.no, dept: acc.dept, guest: false });
        });
      });
    }
    $('#btnReg').onclick = tryReg;

    // ---- 忘记密码 ----
    var _fpAcc = null, _fpStep = 1;
    function tryFp() {
      if (_fpStep === 1) {
        var user = ($('#fUser').value || '').trim();
        if (!user) { setErr('fpErr', '请输入用户名'); return; }
        setErr('fpErr', '');
        L.Bank.accounts.get(user).then(function (acc) {
          if (!acc) { setErr('fpErr', '该账号不存在'); return; }
          _fpAcc = acc; _fpStep = 2;
          $('#fQText').textContent = '密保问题：' + acc.q;
          $('#fpStep2').classList.remove('hidden');
          $('#btnFp').textContent = '重　置　密　码';
          var fa = $('#fA'); if (fa) fa.focus();
        });
      } else {
        var na = ($('#fPw').value || ''), na2 = ($('#fPw2').value || '');
        var answ = ($('#fA').value || '').trim().toLowerCase();
        if (!_fpAcc) return setErr('fpErr', '请先输入用户名');
        if (L.pwHash(answ) !== _fpAcc.a) return setErr('fpErr', '密保答案不正确');
        if (na.length < 4) return setErr('fpErr', '新密码至少 4 位');
        if (na !== na2) return setErr('fpErr', '两次密码不一致');
        L.Bank.accounts.update(_fpAcc.user, { pass: L.pwHash(na) }).then(function () {
          switchTab('login');
          $('#lUser').value = _fpAcc.user;
          _fpStep = 1; _fpAcc = null;
          $('#fpStep2').classList.add('hidden');
          $('#btnFp').textContent = '下　一　步';
          toast('密码已重置，请用新密码登录', 'ok');
        });
      }
    }
    $('#btnFp').onclick = tryFp;
  };

  /* ============ 模块首页 ============ */
  function moduleHome(ns) {
    var isKP = ns === 'keypost';
    var banks = L.Bank.list(ns);
    var total = banks.reduce(function (s, b) { return s + b.total; }, 0);
    var title = isKP ? '关键岗位人员考试' : '日常培训考核';
    var desc = isKP
      ? '题库依据湖南省市场监督管理局公示题库整理，科目 A/B/C 及科目 D（生态环境监测类、卫生计生类）。'
      : '题库由管理员在「后台管理 → 日常培训题库」中上传，与关键岗位题库完全隔离。';

    setHTML(
      crumb([{ t: '首页', go: 'home' }, { t: title }]) +
      '<div class="page-hd"><div><h2>' + title + '</h2><div class="sub">' + desc + '</div></div>' +
      '<span class="chip gray">题库 ' + banks.length + ' 个 · 共 ' + total + ' 题</span></div>' +

      (total === 0 && !isKP ?
        '<div class="card pad empty"><div class="big">日常培训题库为空</div>' +
        '<div>请先进入「后台管理 → 日常培训题库」上传 Excel 题库文件。</div>' +
        '<div style="margin-top:18px"><button class="btn" id="toAdmin">前往后台上传</button></div></div>'
        :
        '<div class="mods">' +
        '<div class="mod m1" data-go="' + (isKP ? 'kpPractice' : 'dailyPractice') + '">' +
        '<div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a6fd4" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>' +
        '<h3>刷题模式</h3><p>逐题练习，作答后立即显示对错与正确答案，自动收录错题，可随时中断续练。</p>' +
        '<div class="feats"><span>顺序/随机</span><span>错题重练</span><span>收藏</span><span>进度记忆</span></div>' +
        '<div class="go">开始刷题 →</div></div>' +

        '<div class="mod m2" data-go="' + (isKP ? 'kpExamSetup' : 'dailyExamSetup') + '">' +
        '<div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0e7a4f" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
        '<h3>考试模式</h3><p>' + (isKP ? '按大纲规定的岗位题型配比随机组卷，全程计时，切屏超限自动交卷。' : '按后台配置的考试方案随机组卷，计时作答，交卷后出成绩单。') + '</p>' +
        '<div class="feats"><span>随机组题</span><span>倒计时</span><span>切屏监测</span><span>自动阅卷</span></div>' +
        '<div class="go">进入考试 →</div></div>' +
        '</div>')
    );
    var ta = $('#toAdmin');
    if (ta) ta.onclick = function () { L.Admin.enter(); };
  }
  Views.daily = function () { moduleHome('daily'); };
  Views.keypost = function () { moduleHome('keypost'); };

  /* ============ 刷题：选择题库 ============ */
  function practiceSetup(ns) {
    var isKP = ns === 'keypost';
    var banks = L.Bank.list(ns);
    var sel = {};

    function groupHTML() {
      if (!banks.length) return '<div class="empty"><div class="big">暂无题库</div><div>请先在后台上传题库。</div></div>';
      if (!isKP) {
        return '<div class="grid g3">' + banks.map(cardHTML).join('') + '</div>';
      }
      var html = '';
      ['A', 'B', 'C'].forEach(function (s) {
        var g = banks.filter(function (b) { return b.subject === s && !b.major; });
        if (!g.length) return;
        html += '<h4 style="margin:20px 0 10px;font-size:14px;color:var(--ink-700)">' + esc(L.Engine.SUBJECT_NAME[s]) + '</h4>' +
          '<div class="grid g3">' + g.map(cardHTML).join('') + '</div>';
      });
      var majors = {};
      banks.filter(function (b) { return b.subject === 'D'; }).forEach(function (b) {
        (majors[b.major || '其他'] = majors[b.major || '其他'] || []).push(b);
      });
      Object.keys(majors).forEach(function (m) {
        html += '<h4 style="margin:22px 0 10px;font-size:14px;color:var(--ink-700)">科目D · ' + esc(m) + '</h4>' +
          '<div class="grid g3">' + majors[m].map(cardHTML).join('') + '</div>';
      });
      var others = banks.filter(function (b) { return ['A', 'B', 'C', 'D'].indexOf(b.subject) < 0; });
      if (others.length) {
        html += '<h4 style="margin:22px 0 10px;font-size:14px;color:var(--ink-700)">其他（后台补充上传）</h4>' +
          '<div class="grid g3">' + others.map(cardHTML).join('') + '</div>';
      }
      return html;
    }
    function cardHTML(b) {
      return '<div class="pick" data-id="' + esc(b.id) + '">' +
        '<div class="nm">' + esc(b.name) + '</div>' +
        '<div class="qs">单选 ' + b.n1 + ' · 多选 ' + b.n2 + ' · 判断 ' + b.n3 + ' <b style="color:var(--green-700)">共 ' + b.total + ' 题</b></div>' +
        '</div>';
    }

    setHTML(
      crumb([{ t: '首页', go: 'home' }, { t: isKP ? '关键岗位人员考试' : '日常培训考核', go: ns }, { t: '刷题模式' }]) +
      '<div class="page-hd"><div><h2>刷题模式 · 选择题库</h2><div class="sub">可多选，选中的题库将合并练习</div></div>' +
      '<div style="display:flex;gap:8px"><button class="btn ghost sm" id="selAll">全选</button><button class="btn ghost sm" id="selNone">清空</button></div></div>' +
      '<div class="card pad" id="bankBox">' + groupHTML() + '</div>' +
      '<div class="card pad" style="margin-top:16px">' +
      '<div style="display:flex;gap:22px;align-items:flex-end;flex-wrap:wrap">' +
      '<label class="fld" style="width:170px;margin:0"><span>练习顺序</span><select id="order"><option value="seq">顺序练习</option><option value="rand">随机练习</option></select></label>' +
      '<label class="fld" style="width:170px;margin:0"><span>题型范围</span><select id="ftype"><option value="0">全部题型</option><option value="1">仅单选题</option><option value="2">仅多选题</option><option value="3">仅判断题</option></select></label>' +
      '<label class="fld" style="width:190px;margin:0"><span>练习范围</span><select id="scope"><option value="all">全部题目</option><option value="wrong">仅错题本</option><option value="fav">仅收藏题</option></select></label>' +
      '<label style="display:flex;align-items:center;gap:7px;font-size:13.5px;margin-bottom:2px"><input type="checkbox" id="shufOpt" style="width:auto"> 选项乱序</label>' +
      '<div style="flex:1"></div>' +
      '<button class="btn lg" id="startPractice">开始练习</button>' +
      '</div><div id="pickInfo" style="margin-top:12px;font-size:13px;color:var(--ink-400)">未选择题库</div></div>'
    );

    function refresh() {
      var ids = Object.keys(sel);
      var t = banks.filter(function (b) { return sel[b.id]; }).reduce(function (s, b) { return s + b.total; }, 0);
      $('#pickInfo').innerHTML = ids.length ? ('已选 <b style="color:var(--green-700)">' + ids.length + '</b> 个题库，共 <b style="color:var(--green-700)">' + t + '</b> 题') : '未选择题库';
    }
    $$('#bankBox .pick').forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) { delete sel[id]; el.classList.remove('on'); }
        else { sel[id] = 1; el.classList.add('on'); }
        refresh();
      };
    });
    $('#selAll').onclick = function () { banks.forEach(function (b) { sel[b.id] = 1; }); $$('#bankBox .pick').forEach(function (e) { e.classList.add('on'); }); refresh(); };
    $('#selNone').onclick = function () { sel = {}; $$('#bankBox .pick').forEach(function (e) { e.classList.remove('on'); }); refresh(); };
    $('#startPractice').onclick = function () {
      var ids = Object.keys(sel);
      if (!ids.length) return toast('请至少选择一个题库', 'err');
      startPractice(ns, ids, {
        order: $('#order').value, ftype: +$('#ftype').value,
        scope: $('#scope').value, shuffleOpt: $('#shufOpt').checked
      });
    };
  }
  Views.dailyPractice = function () { practiceSetup('daily'); };
  Views.kpPractice = function () { practiceSetup('keypost'); };

  /* ============ 刷题主界面 ============ */
  var P = null;
  function startPractice(ns, bankIds, opt) {
    Promise.all([
      L.Bank.questionsOf(bankIds),
      loadSet('wrong:' + ns),
      loadSet('fav:' + ns),
      L.Store.get('prog:' + ns + ':' + L.hash(bankIds.slice().sort().join(',')))
    ]).then(function (r) {
      var qs = r[0].slice(), wrong = r[1], fav = r[2], prog = r[3];
      if (opt.ftype) qs = qs.filter(function (q) { return q.t === opt.ftype; });
      if (opt.scope === 'wrong') qs = qs.filter(function (q) { return wrong[q.id]; });
      if (opt.scope === 'fav') qs = qs.filter(function (q) { return fav[q.id]; });
      if (!qs.length) return toast(opt.scope === 'wrong' ? '错题本为空' : (opt.scope === 'fav' ? '暂无收藏题目' : '没有符合条件的题目'), 'err');
      if (opt.order === 'rand') L.Engine.shuffle(qs);
      if (opt.shuffleOpt) qs = qs.map(L.Engine.shuffleOptions);

      P = {
        ns: ns, ids: bankIds, key: 'prog:' + ns + ':' + L.hash(bankIds.slice().sort().join(',')),
        qs: qs, i: (opt.order === 'seq' && opt.scope === 'all' && prog && prog.i < qs.length) ? prog.i : 0,
        ans: {}, judged: {}, wrong: wrong, fav: fav, opt: opt,
        stat: { right: 0, wrong: 0 }
      };
      renderPractice();
    });
  }

  function renderPractice() {
    var q = P.qs[P.i];
    var isKP = P.ns === 'keypost';
    setHTML(
      crumb([{ t: '首页', go: 'home' }, { t: isKP ? '关键岗位人员考试' : '日常培训考核', go: P.ns }, { t: '刷题模式' }]) +
      '<div class="quiz-wrap">' +
      '<div class="quiz-main" id="qmain"></div>' +
      '<div class="quiz-side">' +
      '<div class="sheet"><h4><span>本次练习</span><span class="chip gray" id="pStat"></span></h4>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button class="btn ghost sm" id="btnFav" style="flex:1">收藏</button>' +
      '<button class="btn ghost sm" id="btnJump" style="flex:1">跳题</button>' +
      '</div>' +
      '<div class="nums" id="pNums"></div></div>' +
      '<button class="btn ghost" id="btnExitP">结束练习</button>' +
      '</div></div>'
    );
    $('#btnExitP').onclick = exitPractice;
    $('#btnJump').onclick = function () {
      modal({
        title: '跳转到题号', lock: false,
        html: '<label class="fld"><span>输入题号（1 - ' + P.qs.length + '）</span><input type="number" id="jn" min="1" max="' + P.qs.length + '" value="' + (P.i + 1) + '"></label>',
        buttons: [{ text: '取消', value: false }, { text: '跳转', primary: true, value: true }]
      }).then(function (v) {
        if (!v) return;
        var n = parseInt($('#jn') && $('#jn').value, 10);
        if (n >= 1 && n <= P.qs.length) { P.i = n - 1; drawPQ(); }
      });
      setTimeout(function () { var e = $('#jn'); if (e) e.focus(); }, 80);
    };
    drawPQ();
  }

  function drawPQ() {
    var q = P.qs[P.i];
    var judged = P.judged[P.i];
    var sel = P.ans[P.i] || [];
    var html =
      '<div class="q-meta">' + typeTag(q.t) +
      '<span class="q-idx">第 ' + (P.i + 1) + ' / ' + P.qs.length + ' 题</span>' +
      (q.k ? '<span class="chip gray">' + esc(q.k) + '</span>' : '') +
      (P.fav[q.id] ? '<span class="chip">已收藏</span>' : '') +
      (P.wrong[q.id] ? '<span class="tag no">错题</span>' : '') +
      '</div>' +
      '<div class="q-stem">' + esc(q.q) + '</div>' +
      '<div class="opts" id="opts">' + q.o.map(function (o, i) {
        var Lt = OPTL[i], cls = 'opt';
        if (judged) {
          cls += ' locked';
          var inAns = q.a.indexOf(Lt) >= 0, inSel = sel.indexOf(Lt) >= 0;
          if (inAns) cls += ' right';
          else if (inSel) cls += ' wrong';
        } else if (sel.indexOf(Lt) >= 0) cls += ' sel';
        return '<div class="' + cls + '" data-k="' + Lt + '"><div class="k">' + Lt + '</div><div class="v">' + esc(o) + '</div></div>';
      }).join('') + '</div>';

    if (judged) {
      var ok = judged.ok;
      html += '<div class="judgebar ' + (ok ? 'ok' : 'no') + '">' +
        '<b>' + (ok ? '✓ 回答正确' : '✗ 回答错误') + '</b>　正确答案：<b>' + esc(q.a) + '</b>' +
        (sel.length ? '　你的答案：<b>' + esc(sel.join('')) + '</b>' : '　<b>未作答</b>') +
        (q.e ? '<div style="margin-top:8px;color:var(--ink-700)">解析：' + esc(q.e) + '</div>' : '') +
        '</div>';
    } else if (q.t === 2) {
      html += '<div style="margin-top:14px;font-size:13px;color:var(--ink-400)">多选题：选择完成后点击「确认作答」</div>';
    }

    html += '<div class="q-nav">' +
      '<div class="left"><button class="btn ghost" id="pPrev"' + (P.i === 0 ? ' disabled' : '') + '>上一题</button></div>' +
      '<div class="right">' +
      (!judged ? '<button class="btn outline" id="pShow">查看答案</button>' : '') +
      (!judged && q.t === 2 ? '<button class="btn" id="pOK">确认作答</button>' : '') +
      '<button class="btn' + (judged ? '' : ' ghost') + '" id="pNext">' + (P.i === P.qs.length - 1 ? '完成练习' : '下一题') + '</button>' +
      '</div></div>';

    $('#qmain').innerHTML = html;

    $$('#opts .opt').forEach(function (el) {
      el.onclick = function () {
        if (P.judged[P.i]) return;
        var k = el.getAttribute('data-k');
        var cur = P.ans[P.i] || [];
        if (q.t === 2) {
          var ix = cur.indexOf(k);
          if (ix >= 0) cur.splice(ix, 1); else cur.push(k);
          P.ans[P.i] = cur.sort();
          drawPQ();
        } else {
          P.ans[P.i] = [k];
          judgeP();
        }
      };
    });
    var b;
    if ((b = $('#pOK'))) b.onclick = function () {
      if (!(P.ans[P.i] || []).length) return toast('请先选择答案', 'err');
      judgeP();
    };
    if ((b = $('#pShow'))) b.onclick = function () { judgeP(true); };
    if ((b = $('#pPrev'))) b.onclick = function () { if (P.i > 0) { P.i--; drawPQ(); saveProg(); } };
    if ((b = $('#pNext'))) b.onclick = function () {
      if (P.i >= P.qs.length - 1) return exitPractice(true);
      P.i++; drawPQ(); saveProg();
    };
    $('#btnFav').textContent = P.fav[q.id] ? '取消收藏' : '收藏本题';
    $('#btnFav').onclick = function () {
      if (P.fav[q.id]) delete P.fav[q.id]; else P.fav[q.id] = 1;
      L.Store.set('fav:' + P.ns, P.fav);
      drawPQ(); drawNums();
    };
    drawNums();
    $('#pStat').textContent = '对 ' + P.stat.right + ' · 错 ' + P.stat.wrong;
  }

  function judgeP(reveal) {
    var q = P.qs[P.i];
    var sel = (P.ans[P.i] || []).slice().sort();
    var ok = !reveal && sel.join('') === q.a;
    P.judged[P.i] = { ok: ok };
    if (ok) { P.stat.right++; if (P.wrong[q.id]) { delete P.wrong[q.id]; L.Store.set('wrong:' + P.ns, P.wrong); } }
    else { P.stat.wrong++; P.wrong[q.id] = (P.wrong[q.id] || 0) + 1; L.Store.set('wrong:' + P.ns, P.wrong); }
    drawPQ(); saveProg();
  }
  function saveProg() { L.Store.set(P.key, { i: P.i, ts: Date.now() }); }

  function drawNums() {
    var h = '';
    for (var i = 0; i < P.qs.length; i++) {
      var c = 'b';
      var cls = [];
      if (i === P.i) cls.push('cur');
      if (P.judged[i]) cls.push(P.judged[i].ok ? 'right' : 'wrong');
      if (P.fav[P.qs[i].id]) cls.push('mark');
      h += '<b class="' + cls.join(' ') + '" data-i="' + i + '">' + (i + 1) + '</b>';
    }
    var box = $('#pNums');
    box.style.maxHeight = '260px'; box.style.overflow = 'auto';
    box.innerHTML = h;
    $$('#pNums b').forEach(function (el) {
      el.onclick = function () { P.i = +el.getAttribute('data-i'); drawPQ(); };
    });
  }

  function exitPractice(done) {
    var total = P.stat.right + P.stat.wrong;
    var rate = total ? Math.round(P.stat.right / total * 100) : 0;
    confirmBox(done ? '练习完成' : '结束练习',
      '<div class="kv"><div class="k">已练题数</div><div>' + total + ' / ' + P.qs.length + '</div>' +
      '<div class="k">正确 / 错误</div><div><b style="color:var(--green-700)">' + P.stat.right + '</b> / <b style="color:var(--red)">' + P.stat.wrong + '</b></div>' +
      '<div class="k">正确率</div><div><b>' + rate + '%</b></div></div>' +
      '<div style="margin-top:10px;color:var(--ink-400);font-size:13px">错题已自动收入错题本，可在刷题设置中选择「仅错题本」重练。</div>',
      '返回模块').then(function (v) { if (v) go(P.ns); });
  }

  /* ============ 考试：关键岗位 设置 ============ */
  Views.kpExamSetup = function () {
    var cfg = L.Bank.cfg.keypost;
    var positions = L.Bank.positionList();
    var banks = L.Bank.list('keypost');
    var dBanks = banks.filter(function (b) { return b.subject === 'D'; });
    var majors = {};
    dBanks.forEach(function (b) { (majors[b.major || '其他'] = majors[b.major || '其他'] || []).push(b); });

    var state = { type: 'first', post: positions[0] ? positions[0].key : 'top', major: Object.keys(majors)[0] || '', cat: '' };
    if (state.major && majors[state.major]) state.cat = majors[state.major][0].id;
    // 直达链接预填（?post=tech&exam=2&cat=<二级类别id>）
    if (_deep && _deep.post && L.Bank.getPosition(_deep.post)) {
      state.post = _deep.post;
      if (_deep.type) state.type = _deep.type;
      if (_deep.cat) {
        var _fb = dBanks.filter(function (b) { return b.id === _deep.cat || b.name === _deep.cat; })[0];
        if (_fb) { state.major = _fb.major || '其他'; state.cat = _fb.id; }
      }
    }
    function curPos() { return L.Bank.getPosition(state.post) || positions[0]; }

    function postCards() {
      return positions.map(function (p) {
        return '<div class="pick' + (state.post === p.key ? ' on' : '') + '" data-post="' + p.key + '">' +
          '<div class="nm">' + esc(p.name) + '　<span class="tag ok">' + esc(p.focus) + '</span></div>' +
          '<div class="ds">' + esc(p.note) + '</div>' +
          '<div class="qs">' + esc(L.Engine.planSummary(p.plan)) + '</div></div>';
      }).join('');
    }
    function catOptions() {
      var g = majors[state.major] || [];
      return g.map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (state.cat === b.id ? ' selected' : '') + '>' + esc(b.name) + '（' + b.total + ' 题）</option>';
      }).join('');
    }

    function render() {
      var pos = curPos();
      var needD = state.type === 'extend' || Object.keys(pos.plan).indexOf('D') >= 0;
      setHTML(
        crumb([{ t: '首页', go: 'home' }, { t: '关键岗位人员考试', go: 'keypost' }, { t: '考试模式' }]) +
        '<div class="page-hd"><div><h2>关键岗位人员考试 · 组卷设置</h2>' +
        '<div class="sub">组卷规则依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》4.2 条</div></div></div>' +

        '<div class="card pad" style="margin-bottom:16px">' +
        '<div style="font-size:13.5px;font-weight:600;margin-bottom:10px">一、考试类型</div>' +
        '<div class="grid g2">' +
        '<div class="pick' + (state.type === 'first' ? ' on' : '') + '" data-type="first">' +
        '<div class="nm">首次考试</div><div class="ds">按报考岗位大纲配比组卷，单选1分、多选2分、判断2分，合计100分</div>' +
        '<div class="qs">时长 ' + cfg.firstMin + ' 分钟　合格线 ' + cfg.passScore + ' 分</div></div>' +
        '<div class="pick' + (state.type === 'extend' ? ' on' : '') + '" data-type="extend">' +
        '<div class="nm">扩领域考试</div><div class="ds">仅考科目D 一个专业类别：单选20×2分、多选20×2分、判断10×2分</div>' +
        '<div class="qs">时长 ' + cfg.extendMin + ' 分钟　合格线 ' + cfg.passScore + ' 分</div></div>' +
        '</div></div>' +

        (state.type === 'first' ?
          '<div class="card pad" style="margin-bottom:16px">' +
          '<div style="font-size:13.5px;font-weight:600;margin-bottom:10px">二、报考岗位</div>' +
          '<div class="grid g2">' + postCards() + '</div>' +
          '<div style="margin-top:10px;font-size:12.5px;color:var(--ink-400)">' +
          '兼任说明：最高管理者兼任其他关键岗位时按其他岗位考试；质量负责人兼任授权签字人时按「授权签字人」考试；授权签字人兼任技术负责人时按「技术负责人」考试。</div>' +
          '</div>' : '') +

        (needD ?
          '<div class="card pad" style="margin-bottom:16px">' +
          '<div style="font-size:13.5px;font-weight:600;margin-bottom:10px">' + (state.type === 'first' ? '三' : '二') + '、科目D 专业类别</div>' +
          '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
          '<label class="fld" style="flex:1;min-width:240px;margin:0"><span>专业大类</span><select id="selMajor">' +
          Object.keys(majors).map(function (m) { return '<option value="' + esc(m) + '"' + (state.major === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="fld" style="flex:2;min-width:280px;margin:0"><span>二级类别（题库）</span><select id="selCat">' + catOptions() + '</select></label>' +
          '</div>' +
          '<div style="margin-top:10px;font-size:12.5px;color:var(--ink-400)">大纲 4.2.2：技术负责人、授权签字人每次考试科目D 只能考试一个专业大类。</div>' +
          '</div>' : '') +

        '<div class="card pad">' +
        '<div style="font-size:13.5px;font-weight:600;margin-bottom:12px">' + (state.type === 'first' ? (needD ? '四' : '三') : '三') + '、考生信息</div>' +
        '<div class="grid g3">' +
        '<label class="fld"><span>姓名<b style="color:var(--red)">*</b></span><input type="text" id="exName" placeholder="请输入考生姓名" value="' + esc((_session && _session.name) || '') + '"></label>' +
        '<label class="fld"><span>身份证号 / 工号</span><input type="text" id="exNo" placeholder="选填" value="' + esc((_session && _session.no) || '') + '"></label>' +
        '<label class="fld"><span>所在部门</span><input type="text" id="exDept" placeholder="选填" value="' + esc((_session && _session.dept) || '') + '"></label>' +
        '</div>' +
        '<div class="warnbox" style="margin-bottom:16px">' +
        '<b>考场纪律：</b>考试开始后请勿切换窗口、最小化或切换浏览器标签页。系统将自动监测，累计切屏 <b>' + cfg.switchLimit + '</b> 次将强制交卷；考试时间到系统自动提交答卷。' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
        '<div id="paperInfo" style="font-size:13px;color:var(--ink-600)"></div>' +
        '<button class="btn lg" id="startExam">开始考试</button></div>' +
        '</div>'
      );

      $$('[data-type]').forEach(function (el) { el.onclick = function () { state.type = el.getAttribute('data-type'); render(); }; });
      $$('[data-post]').forEach(function (el) { el.onclick = function () { state.post = el.getAttribute('data-post'); render(); }; });
      var sm = $('#selMajor');
      if (sm) sm.onchange = function () { state.major = sm.value; state.cat = (majors[state.major][0] || {}).id || ''; render(); };
      var sc = $('#selCat');
      if (sc) sc.onchange = function () { state.cat = sc.value; };

      var plan = state.type === 'first' ? pos.plan : L.Engine.EXTEND_PLAN;
      $('#paperInfo').innerHTML = '本场组卷：' + esc(L.Engine.planSummary(plan)) +
        '　·　时长 ' + (state.type === 'first' ? cfg.firstMin : cfg.extendMin) + ' 分钟';

      $('#startExam').onclick = function () {
        var name = ($('#exName').value || '').trim();
        if (!name) return toast('请填写考生姓名', 'err');
        var needD2 = state.type === 'extend' || Object.keys(pos.plan).indexOf('D') >= 0;
        if (needD2 && !state.cat) return toast('请选择科目D 专业类别', 'err');
        prepareKPExam(state, {
          name: name, no: ($('#exNo').value || '').trim(), dept: ($('#exDept').value || '').trim()
        });
      };
    }
    render();
  };

  function prepareKPExam(state, who) {
    var cfg = L.Bank.cfg.keypost;
    var pos = L.Bank.getPosition(state.post) || { name: state.post, plan: {} };
    var banks = L.Bank.list('keypost');
    var pools = {};
    var jobs = [];
    ['A', 'B', 'C'].forEach(function (s) {
      var ids = banks.filter(function (b) { return b.subject === s && !b.major; }).map(function (b) { return b.id; });
      jobs.push(L.Bank.questionsOf(ids).then(function (qs) { pools[s] = qs; }));
    });
    jobs.push(L.Bank.questionsOf(state.cat ? [state.cat] : []).then(function (qs) { pools.D = qs; }));

    Promise.all(jobs).then(function () {
      var paper = L.Engine.buildPaper({
        mode: state.type, post: state.post, pool: pools,
        planObj: state.type === 'first' ? pos.plan : null,
        postName: pos.name,
        minutes: state.type === 'first' ? cfg.firstMin : cfg.extendMin,
        shuffleOptions: cfg.shuffleOptions
      });
      var catMeta = state.cat ? L.Bank.meta('keypost', state.cat) : null;
      paper.category = catMeta ? (catMeta.major + ' / ' + catMeta.name) : '';
      if (paper.warn.length) {
        modal({
          title: '题量提示', lock: true,
          html: '<div style="color:var(--amber)">部分题型题量不足，试卷已按实际可用题量组卷：</div><ul style="margin:8px 0 0;padding-left:20px">' +
            paper.warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>',
          buttons: [{ text: '返回修改', value: false }, { text: '仍然开始', primary: true, value: true }]
        }).then(function (v) { if (v) startExam('keypost', paper, who, cfg); });
      } else startExam('keypost', paper, who, cfg);
    });
  }

  /* ============ 考试：日常培训 设置 ============ */
  Views.dailyExamSetup = function () {
    var cfg = L.Bank.cfg.daily;
    var plans = cfg.plans || [];
    var banks = L.Bank.list('daily');
    if (!banks.length) {
      setHTML(crumb([{ t: '首页', go: 'home' }, { t: '日常培训考核', go: 'daily' }, { t: '考试模式' }]) +
        '<div class="card pad empty"><div class="big">尚未上传日常培训题库</div><div>请先在「后台管理 → 日常培训题库」上传题库。</div></div>');
      return;
    }
    var state = { plan: plans.length ? 0 : -1 };

    function render() {
      setHTML(
        crumb([{ t: '首页', go: 'home' }, { t: '日常培训考核', go: 'daily' }, { t: '考试模式' }]) +
        '<div class="page-hd"><div><h2>日常培训考核 · 考试</h2><div class="sub">选择后台配置的考试方案，系统随机组卷</div></div></div>' +
        (plans.length ?
          '<div class="card pad" style="margin-bottom:16px"><div style="font-size:13.5px;font-weight:600;margin-bottom:10px">一、选择考试方案</div>' +
          '<div class="grid g2">' + plans.map(function (p, i) {
            var bn = (p.banks || []).map(function (id) { var m = L.Bank.meta('daily', id); return m ? m.name : '(已删除)'; });
            return '<div class="pick' + (state.plan === i ? ' on' : '') + '" data-plan="' + i + '">' +
              '<div class="nm">' + esc(p.name) + '</div>' +
              '<div class="ds">单选 ' + p.n1 + '×' + p.s1 + '分　多选 ' + p.n2 + '×' + p.s2 + '分　判断 ' + p.n3 + '×' + p.s3 + '分</div>' +
              '<div class="qs">时长 ' + p.minutes + ' 分钟 · 合格 ' + p.pass + ' 分 · 题库：' + esc(bn.join('、') || '未指定') + '</div></div>';
          }).join('') + '</div></div>'
          :
          '<div class="card pad empty"><div class="big">尚未配置考试方案</div><div>请在「后台管理 → 日常考试方案」中新建方案。</div>' +
          '<div style="margin-top:16px"><button class="btn" id="toAdmin2">前往后台配置</button></div></div>') +

        (plans.length ?
          '<div class="card pad"><div style="font-size:13.5px;font-weight:600;margin-bottom:12px">二、考生信息</div>' +
          '<div class="grid g3">' +
          '<label class="fld"><span>姓名<b style="color:var(--red)">*</b></span><input type="text" id="exName" placeholder="请输入姓名" value="' + esc((_session && _session.name) || '') + '"></label>' +
          '<label class="fld"><span>工号</span><input type="text" id="exNo" placeholder="选填" value="' + esc((_session && _session.no) || '') + '"></label>' +
          '<label class="fld"><span>所在部门</span><input type="text" id="exDept" placeholder="选填" value="' + esc((_session && _session.dept) || '') + '"></label>' +
          '</div>' +
          '<div class="warnbox" style="margin-bottom:16px">考试开始后请勿切换窗口；累计切屏 <b>' + cfg.switchLimit + '</b> 次将强制交卷，时间到自动提交。</div>' +
          '<div style="text-align:right"><button class="btn lg" id="startExam">开始考试</button></div></div>' : '')
      );
      $$('[data-plan]').forEach(function (el) { el.onclick = function () { state.plan = +el.getAttribute('data-plan'); render(); }; });
      var t2 = $('#toAdmin2'); if (t2) t2.onclick = function () { L.Admin.enter('dailyPlan'); };
      var se = $('#startExam');
      if (se) se.onclick = function () {
        var name = ($('#exName').value || '').trim();
        if (!name) return toast('请填写姓名', 'err');
        if (state.plan < 0) return toast('请选择考试方案', 'err');
        var p = plans[state.plan];
        L.Bank.questionsOf(p.banks || []).then(function (qs) {
          var paper = L.Engine.buildPaper({
            mode: 'custom', title: p.name, minutes: p.minutes,
            plan: { X: { 1: p.n1, 2: p.n2, 3: p.n3 } },
            scoreMap: { 1: p.s1, 2: p.s2, 3: p.s3 },
            pool: { X: qs }, shuffleOptions: cfg.shuffleOptions
          });
          paper.passScore = p.pass;
          var run = function () {
            startExam('daily', paper, { name: name, no: ($('#exNo').value || '').trim(), dept: ($('#exDept').value || '').trim() },
              { switchLimit: cfg.switchLimit, passScore: p.pass, antiCopy: cfg.antiCopy });
          };
          if (paper.warn.length) {
            modal({
              title: '题量提示', lock: true,
              html: '<div style="color:var(--amber)">题库题量不足，已按实际数量组卷：</div><ul style="margin:8px 0 0;padding-left:20px">' +
                paper.warn.map(function (w) { return '<li>' + esc(w.replace('科目X ', '')) + '</li>'; }).join('') + '</ul>',
              buttons: [{ text: '返回', value: false }, { text: '仍然开始', primary: true, value: true }]
            }).then(function (v) { if (v) run(); });
          } else run();
        });
      };
    }
    render();
  };

  /* ============ 考试主界面 ============ */
  var E = null;
  function startExam(ns, paper, who, cfg) {
    E = {
      ns: ns, paper: paper, who: who, cfg: cfg,
      ans: {}, mark: {}, i: 0,
      left: paper.minutes * 60, started: Date.now(),
      switches: 0, lastLeave: 0, finished: false, timer: null, autoReason: ''
    };
    Router.current = { view: 'exam', params: { ns: ns } };
    bindAntiCheat();
    renderExam();
    refreshNav();
    E.timer = setInterval(tick, 1000);
  }

  function tick() {
    if (!E || E.finished) return;
    E.left--;
    var t = $('#tmr');
    if (t) {
      t.textContent = fmtTime(E.left);
      var box = $('#tmrBox');
      if (box) box.classList.toggle('danger', E.left <= 300);
    }
    if (E.left <= 0) submitExam(true, '考试时间已到，系统自动提交答卷');
  }

  function onLeaveScreen() {
    if (!E || E.finished) return;
    var now = Date.now();
    if (now - E.lastLeave < 1500) return;
    E.lastLeave = now;
    E.switches++;
    var limit = E.cfg.switchLimit || 3;
    var sw = $('#swCount'); if (sw) sw.textContent = E.switches;
    if (E.switches >= limit) {
      submitExam(true, '检测到切屏 ' + E.switches + ' 次，已达上限，系统强制提交答卷');
    } else {
      modal({
        title: '⚠ 违规提醒', lock: true,
        html: '<div style="color:var(--red);font-weight:600;font-size:15px;margin-bottom:8px">检测到您已离开考试界面 ' + E.switches + ' 次</div>' +
          '<div>考试期间不得切换窗口、最小化或切换标签页。<br>累计达到 <b>' + limit + '</b> 次系统将<b style="color:var(--red)">强制交卷</b>，' +
          '剩余机会 <b>' + (limit - E.switches) + '</b> 次。</div>',
        buttons: [{ text: '我知道了，继续考试', primary: true, value: true }]
      });
    }
  }

  var _vis, _blur, _ctx, _copy;
  function bindAntiCheat() {
    _vis = function () { if (document.hidden) onLeaveScreen(); };
    _blur = function () { onLeaveScreen(); };
    document.addEventListener('visibilitychange', _vis);
    window.addEventListener('blur', _blur);
    if (E.cfg.antiCopy) {
      _ctx = function (e) { e.preventDefault(); };
      _copy = function (e) { e.preventDefault(); toast('考试期间禁止复制', 'err'); };
      document.addEventListener('contextmenu', _ctx);
      document.addEventListener('copy', _copy);
    }
  }
  function unbindAntiCheat() {
    document.removeEventListener('visibilitychange', _vis);
    window.removeEventListener('blur', _blur);
    if (_ctx) document.removeEventListener('contextmenu', _ctx);
    if (_copy) document.removeEventListener('copy', _copy);
    _ctx = _copy = null;
  }

  function renderExam() {
    var p = E.paper;
    setHTML(
      '<div class="page-hd" style="margin-bottom:14px"><div><h2>' + esc(p.title) + '</h2>' +
      '<div class="sub">考生：<b>' + esc(E.who.name) + '</b>' + (E.who.dept ? ' · ' + esc(E.who.dept) : '') +
      (p.category ? ' · 科目D：' + esc(p.category) : '') +
      ' · 满分 ' + p.totalScore + ' 分 · 合格 ' + (E.cfg.passScore || 70) + ' 分</div></div>' +
      '<span class="chip gray">单选 ' + p.counts[1] + ' · 多选 ' + p.counts[2] + ' · 判断 ' + p.counts[3] + '</span></div>' +
      '<div class="quiz-wrap">' +
      '<div class="quiz-main" id="qmain"></div>' +
      '<div class="quiz-side">' +
      '<div class="timer" id="tmrBox"><div class="t" id="tmr">' + fmtTime(E.left) + '</div><div class="l">剩余考试时间</div></div>' +
      '<div class="warnbox">切屏监测：已切屏 <b id="swCount">0</b> / ' + (E.cfg.switchLimit || 3) + ' 次，达到上限自动交卷。</div>' +
      '<div class="sheet"><h4><span>答题卡</span><span class="chip gray" id="doneN">0/' + p.items.length + '</span></h4><div id="eSheet"></div></div>' +
      '<button class="btn" id="btnSubmit">交卷</button>' +
      '</div></div>'
    );
    $('#btnSubmit').onclick = function () { askSubmit(); };
    drawEQ();
  }

  function drawEQ() {
    var p = E.paper, it = p.items[E.i];
    var sel = E.ans[E.i] || [];
    var html =
      '<div class="q-meta">' + typeTag(it.t) +
      '<span class="q-idx">第 ' + (E.i + 1) + ' / ' + p.items.length + ' 题（' + it.score + ' 分）</span>' +
      (it.sub && it.sub !== 'X' ? '<span class="chip gray">科目' + it.sub + '</span>' : '') +
      (E.mark[E.i] ? '<span class="tag t3">已标记</span>' : '') +
      '</div>' +
      '<div class="q-stem">' + esc(it.q) + '</div>' +
      '<div class="opts" id="opts">' + it.o.map(function (o, i) {
        var Lt = OPTL[i];
        return '<div class="opt' + (sel.indexOf(Lt) >= 0 ? ' sel' : '') + '" data-k="' + Lt + '">' +
          '<div class="k">' + Lt + '</div><div class="v">' + esc(o) + '</div></div>';
      }).join('') + '</div>' +
      (it.t === 2 ? '<div style="margin-top:12px;font-size:13px;color:var(--ink-400)">多选题：请选择全部正确选项，多选、少选、错选均不得分</div>' : '') +
      '<div class="q-nav">' +
      '<div class="left"><button class="btn ghost" id="ePrev"' + (E.i === 0 ? ' disabled' : '') + '>上一题</button>' +
      '<button class="btn ghost" id="eMark">' + (E.mark[E.i] ? '取消标记' : '标记本题') + '</button>' +
      '<button class="btn ghost" id="eClear">清除选择</button></div>' +
      '<div class="right">' +
      (E.i === p.items.length - 1 ? '<button class="btn" id="eSubmit2">交卷</button>' : '<button class="btn" id="eNext">下一题</button>') +
      '</div></div>';
    $('#qmain').innerHTML = html;

    $$('#opts .opt').forEach(function (el) {
      el.onclick = function () {
        var k = el.getAttribute('data-k');
        var cur = E.ans[E.i] || [];
        if (it.t === 2) {
          var ix = cur.indexOf(k);
          if (ix >= 0) cur.splice(ix, 1); else cur.push(k);
          E.ans[E.i] = cur.sort();
        } else E.ans[E.i] = [k];
        drawEQ();
      };
    });
    var b;
    if ((b = $('#ePrev'))) b.onclick = function () { if (E.i > 0) { E.i--; drawEQ(); } };
    if ((b = $('#eNext'))) b.onclick = function () { if (E.i < p.items.length - 1) { E.i++; drawEQ(); } };
    if ((b = $('#eSubmit2'))) b.onclick = askSubmit;
    $('#eMark').onclick = function () { E.mark[E.i] = !E.mark[E.i]; drawEQ(); };
    $('#eClear').onclick = function () { delete E.ans[E.i]; drawEQ(); };
    drawESheet();
  }

  function drawESheet() {
    var p = E.paper, groups = [{ t: 1, n: '一、单项选择题' }, { t: 2, n: '二、多项选择题' }, { t: 3, n: '三、判断题' }];
    var html = '', done = 0;
    groups.forEach(function (g) {
      var idxs = [];
      p.items.forEach(function (it, i) { if (it.t === g.t) idxs.push(i); });
      if (!idxs.length) return;
      html += '<div class="grp"><div class="lbl">' + g.n + '（' + idxs.length + ' 题）</div><div class="nums">' +
        idxs.map(function (i) {
          var cls = [];
          if ((E.ans[i] || []).length) { cls.push('done'); }
          if (E.mark[i]) cls.push('mark');
          if (i === E.i) cls.push('cur');
          return '<b class="' + cls.join(' ') + '" data-i="' + i + '">' + (i + 1) + '</b>';
        }).join('') + '</div></div>';
    });
    p.items.forEach(function (it, i) { if ((E.ans[i] || []).length) done++; });
    $('#eSheet').innerHTML = html;
    $('#doneN').textContent = done + '/' + p.items.length;
    $$('#eSheet b').forEach(function (el) { el.onclick = function () { E.i = +el.getAttribute('data-i'); drawEQ(); }; });
  }

  function askSubmit() {
    var p = E.paper, blank = 0, marks = 0;
    p.items.forEach(function (it, i) { if (!(E.ans[i] || []).length) blank++; if (E.mark[i]) marks++; });
    confirmBox('确认交卷',
      '<div class="kv"><div class="k">试卷题量</div><div>' + p.items.length + ' 题</div>' +
      '<div class="k">未作答</div><div><b style="color:' + (blank ? 'var(--red)' : 'var(--green-700)') + '">' + blank + '</b> 题</div>' +
      '<div class="k">已标记</div><div>' + marks + ' 题</div>' +
      '<div class="k">剩余时间</div><div>' + fmtTime(E.left) + '</div></div>' +
      (blank ? '<div style="margin-top:10px;color:var(--red)">仍有未作答题目，交卷后不可修改，确定提交？</div>' : '<div style="margin-top:10px;color:var(--ink-400)">交卷后不可修改，确定提交？</div>'),
      '确认交卷').then(function (v) { if (v) submitExam(false, ''); });
  }

  function submitExam(auto, reason) {
    if (!E || E.finished) return;
    E.finished = true;
    clearInterval(E.timer);
    unbindAntiCheat();
    var ansArr = [];
    E.paper.items.forEach(function (_, i) { ansArr[i] = E.ans[i] || []; });
    var r = L.Engine.grade(E.paper, ansArr, {});
    var pass = r.score >= (E.cfg.passScore || 70);
    var used = Math.round((Date.now() - E.started) / 1000);
    var rec = {
      id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(), ns: E.ns, mode: E.paper.mode, title: E.paper.title,
      post: E.paper.post || '', category: E.paper.category || '',
      who: E.who, score: r.score, total: E.paper.total || E.paper.totalScore,
      pass: pass, passScore: E.cfg.passScore || 70,
      right: r.right, wrong: r.wrong, blank: r.blank,
      used: used, switches: E.switches, auto: !!auto, reason: reason || '',
      paper: E.paper.items.map(function (it) { return { no: it.no, sub: it.sub, t: it.t, q: it.q, o: it.o, a: it.a, e: it.e, score: it.score }; }),
      detail: r.detail
    };
    saveRecord(rec).then(function () {
      if (auto) {
        modal({
          title: '自动交卷', lock: true,
          html: '<div style="color:var(--red);font-weight:600;margin-bottom:6px">' + esc(reason) + '</div><div>系统已自动提交答卷并完成阅卷。</div>',
          buttons: [{ text: '查看成绩', primary: true, value: true }]
        }).then(function () { showResult(rec); reportScore(rec); });
      } else { showResult(rec); reportScore(rec); }
    });
  }

  /* ============ 成绩回传（集中收集） ============ */
  function reportEnabled() {
    var r = (L.Bank.cfg && L.Bank.cfg.report) || {};
    if (_reportForce) return !!(_reportUrl || r.url);
    return !!r.enabled && !!r.url;
  }
  function reportTarget() {
    if (_reportUrl) return _reportUrl;
    var r = (L.Bank.cfg && L.Bank.cfg.report) || {};
    return r.url || '';
  }
  function reportSecret() {
    var r = (L.Bank.cfg && L.Bank.cfg.report) || {};
    return r.secret || '';
  }
  function buildReportPayload(rec) {
    return {
      app: '绿盾卫士培训考核系统',
      id: rec.id, ts: rec.ts, time: new Date(rec.ts).toISOString(),
      ns: rec.ns, mode: rec.mode, title: rec.title, post: rec.post, category: rec.category,
      name: rec.who.name, no: rec.who.no || '', dept: rec.who.dept || '',
      score: rec.score, total: rec.total, passScore: rec.passScore, pass: rec.pass,
      right: rec.right, wrong: rec.wrong, blank: rec.blank, used: rec.used, switches: rec.switches,
      auto: rec.auto, reason: rec.reason || '',
      detail: rec.detail
    };
  }
  function sendJSON(url, data, secret) {
    return new Promise(function (res, rej) {
      var body = JSON.stringify(data);
      try {
        if (global.fetch) {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Report-Token': secret || '' }, body: body })
            .then(function (r) { if (r.ok) res(); else rej(new Error('HTTP ' + r.status)); })
            .catch(rej);
        } else {
          var x = new XMLHttpRequest();
          x.open('POST', url, true);
          x.setRequestHeader('Content-Type', 'application/json');
          if (secret) x.setRequestHeader('X-Report-Token', secret);
          x.onreadystatechange = function () { if (x.readyState === 4) { if (x.status >= 200 && x.status < 300) res(); else rej(new Error('HTTP ' + x.status)); } };
          x.onerror = function () { rej(new Error('网络错误')); };
          x.send(body);
        }
      } catch (e) { rej(e); }
    });
  }
  function reportScore(rec) {
    var box = document.getElementById('reportStatus');
    if (!reportEnabled()) { if (box) box.textContent = ''; return; }
    var url = reportTarget();
    if (!url) { if (box) { box.textContent = '（未配置回传地址，成绩仅保存在本机）'; box.className = 'meta'; } return; }
    if (box) { box.textContent = '成绩上报中…'; box.className = 'meta rep-pending'; }
    sendJSON(url, buildReportPayload(rec), reportSecret()).then(function () {
      if (box) { box.textContent = '✓ 成绩已上报组织者'; box.className = 'meta rep-ok'; }
    }).catch(function (e) {
      if (box) {
        box.innerHTML = '⚠ 上报失败：' + esc(String((e && e.message) || e)) + ' <a href="#" id="retryReport" style="color:#fff;text-decoration:underline">重试</a>';
        box.className = 'meta rep-err';
        var rb = document.getElementById('retryReport');
        if (rb) rb.onclick = function (ev) { ev.preventDefault(); reportScore(rec); };
      }
    });
  }

  /* ============ 成绩单 ============ */
  function showResult(rec) {
    var pass = rec.pass;
    var html =
      crumb([{ t: '首页', go: 'home' }, { t: rec.ns === 'keypost' ? '关键岗位人员考试' : '日常培训考核', go: rec.ns }, { t: '成绩单' }]) +
      '<div class="score-hero' + (pass ? '' : ' fail') + '">' +
      '<div class="big">' + rec.score + '</div>' +
      '<div class="st">' + (pass ? '合　格' : '不合格') + '</div>' +
      '<div class="meta">' + esc(rec.title) + (rec.category ? ' · ' + esc(rec.category) : '') +
      '　|　满分 ' + rec.total + ' 分　合格线 ' + rec.passScore + ' 分</div>' +
      '<div class="meta">' + esc(rec.who.name) + (rec.who.no ? '（' + esc(rec.who.no) + '）' : '') + '　' + fmtDate(rec.ts) + '</div>' +
      (rec.auto ? '<div class="meta" style="margin-top:8px;background:rgba(0,0,0,.2);display:inline-block;padding:4px 14px;border-radius:99px">' + esc(rec.reason) + '</div>' : '') +
      '</div>' +
      '<div id="reportStatus" class="meta"></div>' +
      '<div class="sc-grid">' +
      '<div class="sc-box"><b style="color:var(--green-700)">' + rec.right + '</b><span>答对题数</span></div>' +
      '<div class="sc-box"><b style="color:var(--red)">' + rec.wrong + '</b><span>答错题数</span></div>' +
      '<div class="sc-box"><b>' + rec.blank + '</b><span>未作答</span></div>' +
      '<div class="sc-box"><b>' + fmtTime(rec.used) + '</b><span>用时（切屏 ' + rec.switches + ' 次）</span></div>' +
      '</div>' +
      '<div class="page-hd"><h2 style="font-size:17px">答卷解析</h2><div style="display:flex;gap:8px">' +
      (pass ? '<button class="btn outline sm" id="btnCert">生成合格证明</button>' : '') +
      '<button class="btn ghost sm" id="btnPrint">打印试卷存档</button>' +
      '<button class="btn ghost sm" id="fltAll">全部</button><button class="btn ghost sm" id="fltBad">仅看错题</button>' +
      '<button class="btn sm" data-go="' + rec.ns + '">返回模块</button></div></div>' +
      '<div id="reviewBox"></div>';
    setHTML(html);
    Router.current = { view: 'result', params: { ns: rec.ns } };
    refreshNav();

    function draw(onlyBad) {
      var box = $('#reviewBox'), h = '';
      rec.paper.forEach(function (it, i) {
        var d = rec.detail[i];
        if (onlyBad && d.ok) return;
        h += '<div class="review-item ' + (d.ok ? 'good' : 'bad') + '">' +
          '<div class="q-meta">' + typeTag(it.t) + '<span class="q-idx">第 ' + it.no + ' 题 · ' + it.score + ' 分</span>' +
          (it.sub && it.sub !== 'X' ? '<span class="chip gray">科目' + it.sub + '</span>' : '') +
          '<span class="tag ' + (d.ok ? 'ok' : 'no') + '">' + (d.ok ? '正确 +' + d.score : '错误 0') + '</span></div>' +
          '<div class="q-stem" style="font-size:15px;margin-bottom:12px">' + esc(it.q) + '</div>' +
          '<div class="opts">' + it.o.map(function (o, k) {
            var Lt = OPTL[k], cls = 'opt locked';
            if (it.a.indexOf(Lt) >= 0) cls += ' right';
            else if (d.sel.indexOf(Lt) >= 0) cls += ' wrong';
            return '<div class="' + cls + '"><div class="k">' + Lt + '</div><div class="v">' + esc(o) + '</div></div>';
          }).join('') + '</div>' +
          '<div class="judgebar ' + (d.ok ? 'ok' : 'no') + '">正确答案：<b>' + esc(it.a) + '</b>　你的答案：<b>' + (d.sel ? esc(d.sel) : '未作答') + '</b>' +
          (it.e ? '<div style="margin-top:6px">解析：' + esc(it.e) + '</div>' : '') + '</div>' +
          '</div>';
      });
      box.innerHTML = h || '<div class="card pad empty"><div class="big">全部答对</div><div>本场考试没有错题。</div></div>';
    }
    draw(false);
    $('#fltAll').onclick = function () { draw(false); };
    $('#fltBad').onclick = function () { draw(true); };
    var bc = $('#btnCert');
    if (bc) bc.onclick = function () { showCert(rec); };
    var bp = $('#btnPrint');
    if (bp) bp.onclick = function () { printExam(rec); };
  }

  /* ============ 打印试卷存档 ============ */
  function printExam(rec) {
    var p = rec.paper || [], d = rec.detail || [];
    function ansHtml(it) {
      var di = d[it.no - 1] || {};
      var sel = di.sel || '';
      return '<div class="pp-opts">' + it.o.map(function (o, k) {
        var Lt = OPTL[k], cls = 'pp-opt';
        if (it.a.indexOf(Lt) >= 0) cls += ' ans';
        if (sel && sel.indexOf(Lt) >= 0) cls += ' mine';
        return '<div class="' + cls + '"><span class="k">' + Lt + '</span><span>' + esc(o) + '</span></div>';
      }).join('') + '</div>';
    }
    function sec(t, n) {
      var items = p.filter(function (it) { return it.t === t; });
      if (!items.length) return '';
      return '<h3 class="pp-sec">' + n + '（共 ' + items.length + ' 题，每题 ' + items[0].score + ' 分）</h3>' +
        items.map(function (it) {
          var di = d[it.no - 1] || {};
          return '<div class="pp-q">' +
            '<div class="pp-qt"><b>' + it.no + '.</b> ' + esc(it.q) + '</div>' +
            ansHtml(it) +
            '<div class="pp-ans">正确答案：<b>' + esc(it.a) + '</b>　考生作答：<b>' + esc(di.sel || '未作答') + '</b>　本题得分：<b>' + (di.score != null ? di.score : 0) + '</b>' +
            (it.e ? '　解析：' + esc(it.e) : '') + '</div></div>';
        }).join('');
    }
    var html =
      '<div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px">' +
      '<button class="btn ghost" id="backRes2">返回成绩单</button><button class="btn" id="doPrint2">打印 / 另存为PDF</button></div>' +
      '<div class="paper-print">' +
      '<div class="pp-hd"><h1>' + esc(rec.title) + '</h1>' +
      '<div class="pp-sub">' + esc(L.Bank.cfg.company) + ' · 考试试卷存档</div>' +
      '<div class="pp-meta">姓名：<b>' + esc(rec.who.name) + '</b>　工号：' + esc(rec.who.no || '—') + '　部门：' + esc(rec.who.dept || '—') +
      '　日期：' + fmtDate(rec.ts) + '　类别：' + esc(rec.category || '—') +
      '　得分：<b>' + rec.score + '</b>/' + rec.total + '（合格线 ' + rec.passScore + '）　结论：<b>' + (rec.pass ? '合格' : '不合格') + '</b></div></div>' +
      sec(1, '一、单项选择题') + sec(2, '二、多项选择题') + sec(3, '三、判断题') +
      '<div class="pp-foot">证明编号：' + esc(rec.id) + '　本试卷由内部培训考核系统自动生成，仅作公司内部培训考核存档使用。</div>' +
      '</div>';
    setHTML(html);
    Router.current = { view: 'print', params: { ns: rec.ns } };
    refreshNav();
    $('#doPrint2').onclick = function () { window.print(); };
    $('#backRes2').onclick = function () { showResult(rec); };
  }

  function showCert(rec) {
    var cfg = L.Bank.cfg;
    var d = new Date(rec.ts);
    setHTML(
      '<div class="no-print" style="margin-bottom:16px;display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn ghost" id="backRes">返回成绩单</button><button class="btn" id="doPrint">打印 / 另存为PDF</button></div>' +
      '<div class="cert">' +
      '<h1>考核合格证明</h1><div class="sub">CERTIFICATE OF ASSESSMENT</div>' +
      '<div class="body">' +
      '兹证明 <b style="border-bottom:1px solid #333;padding:0 14px">' + esc(rec.who.name) + '</b> ' +
      (rec.who.no ? '（证件/工号：' + esc(rec.who.no) + '）' : '') +
      '于 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日参加本公司组织的' +
      '<b>' + esc(rec.title) + '</b>' + (rec.category ? '（科目D 专业类别：' + esc(rec.category) + '）' : '') +
      '，考试成绩 <b style="color:#0e7a4f;font-size:18px">' + rec.score + '</b> 分（满分 ' + rec.total + ' 分，合格线 ' + rec.passScore + ' 分），' +
      '结论为 <b>合格</b>。' +
      '</div>' +
      '<div class="sign"><div>' + esc(cfg.company) + '</div><div>' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日</div></div>' +
      '<div style="margin-top:26px;font-size:11.5px;color:#999;text-align:left">证明编号：' + esc(rec.id) + '　本证明由内部培训考核系统自动生成，仅作公司内部培训考核记录使用。</div>' +
      '</div>'
    );
    Router.current = { view: 'cert', params: { ns: rec.ns } };
    refreshNav();
    $('#doPrint').onclick = function () { window.print(); };
    $('#backRes').onclick = function () { showResult(rec); };
  }

  /* ============ 直达考试链接 ============ */
  // 支持的参数：
  //   ?post=top|quality|tech|signer  &exam=1(首次,默认)|2(扩领域)  &cat=<科目D二级类别id>   &kiosk=1(隐藏后台入口)
  //   ?daily=exam|practice
  function deepLink() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return false; }
    if (q.get('kiosk') === '1') {
      var ae = document.getElementById('btnAdminEntry');
      if (ae) ae.style.display = 'none';
    }
    // 成绩回传覆盖：?report=1 强制回传  ?reportUrl=<地址> 指定回传地址
    if (q.get('report') === '1') _reportForce = true;
    var _ru = q.get('reportUrl');
    if (_ru) _reportUrl = _ru;
    if (q.get('post')) {
      var post = String(q.get('post')).toLowerCase();
      var type = q.get('exam') === '2' ? 'extend' : 'first';
      _deep = { post: post, type: type, cat: q.get('cat') || '' };
      go('kpExamSetup');
      return true;
    }
    if (q.get('daily')) {
      _deep = null;
      go(q.get('daily') === 'practice' ? 'dailyPractice' : 'dailyExamSetup');
      return true;
    }
    _deep = null;
    return false;
  }

  /* ============ 导出 ============ */
  global.LDWS.UI = {
    $: $, $$: $$, esc: esc, setHTML: setHTML, toast: toast, modal: modal, confirmBox: confirmBox,
    fmtTime: fmtTime, fmtDate: fmtDate, typeTag: typeTag, crumb: crumb, go: go, Views: Views,
    showResult: showResult, saveRecord: saveRecord, printExam: printExam,
    isExamRunning: function () { return E && !E.finished; },
    deepLink: deepLink,
    initSession: initSession, login: doLogin, logout: doLogout,
    initAdminSession: initAdminSession, adminLogin: adminLogin, adminLogout: adminLogout,
    isAdminLoggedIn: isAdminLoggedIn,
    isLoggedIn: function () { return !!_session; },
    session: function () { return _session; }
  };
})(window);

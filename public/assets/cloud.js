/* ===========================================================
 *  cloud.js —— 绿盾卫士云版前端：PWA + 后端 API
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS;
  var Engine = L.Engine, Bank = L.Bank;
  var Cloud = global.LDWS_CLOUD = {
    user: null, token: localStorage.getItem('lvdun_token') || null,
    admin: null, adminToken: localStorage.getItem('lvdun_admin_token') || null,
    paper: null, answers: [], startAt: 0, timerId: null, switches: 0,
    cfg: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, el) { return (el || document).querySelectorAll(sel); };

  /* ---------- 通用 UI ---------- */
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }
  function modal(title, body, foot) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = body || '';
    $('modalFoot').innerHTML = foot || '<button class="btn" id="modalClose">关闭</button>';
    $('modalMask').classList.remove('hidden');
    var close = function () { $('modalMask').classList.add('hidden'); };
    var b = $('modalClose'); if (b) b.onclick = close;
    $('modalMask').onclick = function (e) { if (e.target === $('modalMask')) close(); };
  }
  function fmtTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return n < 10 ? '0' + n : n; }
  function fmtDur(s) {
    if (s == null) return '-';
    var m = Math.floor(s / 60), sec = s % 60;
    return m + '分' + (sec ? sec + '秒' : '');
  }

  /* ---------- API ---------- */
  async function api(path, opt) {
    opt = opt || {};
    var headers = { 'Content-Type': 'application/json' };
    var tok = Cloud.adminToken || Cloud.token;
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    var body = opt.body ? JSON.stringify(opt.body) : undefined;
    var res = await fetch(path, { method: opt.method || 'GET', headers: headers, body: body });
    var data = { ok: res.ok, status: res.status };
    try { data.json = await res.json(); } catch (e) { data.json = {}; }
    if (res.status === 401) {
      if (Cloud.adminToken) { Cloud.adminToken = null; localStorage.removeItem('lvdun_admin_token'); renderAdminLogin('登录已过期'); }
      else { Cloud.token = null; localStorage.removeItem('lvdun_token'); Cloud.user = null; renderAuth('登录已过期，请重新登录'); }
      throw new Error('401');
    }
    return data;
  }

  /* ---------- 顶栏 ---------- */
  function refreshHeader() {
    var chip = $('userChip');
    if (Cloud.user) { chip.textContent = Cloud.user.name || Cloud.user.user; chip.classList.remove('hidden'); }
    else { chip.classList.add('hidden'); }
    $('btnBack').classList.add('hidden');
  }

  /* ---------- 路由 ---------- */
  function setMain(html, title) {
    $('main').innerHTML = html;
    if (title) document.title = title + ' · 绿盾卫士云版';
  }
  Cloud.go = function (name, arg) {
    clearInterval(Cloud.timerId);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('contextmenu', disableCtx);
    document.removeEventListener('copy', disableCopy);
    document.removeEventListener('cut', disableCopy);
    if (name === 'auth') renderAuth(arg);
    else if (name === 'home') renderHome();
    else if (name === 'setup') renderSetup();
    else if (name === 'exam') renderExam();
    else if (name === 'result') renderResult(arg);
    else if (name === 'records') renderMyRecords();
    else if (name === 'admin') renderAdminLogin(arg);
    else if (name === 'adminPanel') renderAdminPanel();
    refreshHeader();
  };

  /* ---------- 登录/注册 ---------- */
  function renderAuth(err) {
    document.title = '登录 · 绿盾卫士云版';
    var html = '<div class="card pad" style="max-width:400px;margin:24px auto">' +
      '<h2 style="text-align:center">绿盾卫士 · 云版</h2>' +
      '<p class="muted" style="text-align:center">账号集中管理，考试记录云端汇总</p>' +
      (err ? '<div class="tag red" style="margin-bottom:12px">' + err + '</div>' : '') +
      '<div id="authForm"></div>' +
      '<p class="muted" style="text-align:center;font-size:12px;margin-top:12px">还没有账号？<a href="#" id="toggleAuth">去注册</a></p>' +
      '</div>';
    setMain(html, '登录');
    var isLogin = true;
    function build() {
      var nameRow = isLogin ? '' : '<div class="form-row"><label class="label">姓名</label><input class="input" id="aName" placeholder="怎么称呼"></div>';
      $('authForm').innerHTML = nameRow +
        '<div class="form-row"><label class="label">账号</label><input class="input" id="aUser" placeholder="账号/手机号"></div>' +
        '<div class="form-row"><label class="label">密码</label><input class="input" id="aPw" type="password" placeholder="密码"></div>' +
        '<button class="btn primary" id="aBtn" style="width:100%">' + (isLogin ? '登录' : '注册') + '</button>' +
        '<p class="muted" style="text-align:center;font-size:12px;margin-top:10px">' + (isLogin ? '管理员请从首页「管理后台」入口登录' : '注册后自动登录') + '</p>';
      $('toggleAuth').textContent = isLogin ? '去注册' : '去登录';
      $('aBtn').onclick = isLogin ? doLogin : doRegister;
    }
    $('toggleAuth').onclick = function (e) { e.preventDefault(); isLogin = !isLogin; build(); };
    build();

    function doLogin() {
      var u = $('aUser').value.trim(), p = $('aPw').value.trim();
      api('/api/login', { method: 'POST', body: { user: u, pass: p } }).then(function (r) {
        if (!r.ok) return toast(r.json.msg || '登录失败');
        Cloud.token = r.json.token; Cloud.user = r.json.user;
        localStorage.setItem('lvdun_token', Cloud.token);
        Cloud.go('home');
      }).catch(function () {});
    }
    function doRegister() {
      var u = $('aUser').value.trim(), p = $('aPw').value.trim(), n = ($('aName') ? $('aName').value.trim() : '');
      if (u.length < 2) return toast('账号至少 2 个字符');
      if (p.length < 4) return toast('密码至少 4 位');
      api('/api/register', { method: 'POST', body: { user: u, name: n, pass: p } }).then(function (r) {
        if (!r.ok) return toast(r.json.msg || '注册失败');
        Cloud.token = r.json.token; Cloud.user = r.json.user;
        localStorage.setItem('lvdun_token', Cloud.token);
        toast('注册成功'); Cloud.go('home');
      }).catch(function () {});
    }
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var html = '<div class="card pad" style="max-width:500px;margin:24px auto">' +
      '<h2 style="text-align:center">欢迎，' + (Cloud.user ? (Cloud.user.name || Cloud.user.user) : '考生') + '</h2>' +
      '<div style="display:grid;gap:12px;margin-top:16px">' +
      '<button class="btn primary" id="btnStart" style="font-size:16px;padding:16px">开始关键岗位考试</button>' +
      '<button class="btn" id="btnRecords" style="font-size:16px;padding:16px">我的考试记录</button>' +
      '<button class="btn ghost" id="btnAdmin" style="font-size:16px;padding:16px">管理后台</button>' +
      '<button class="btn ghost sm" id="btnLogout">退出登录</button>' +
      '</div></div>';
    setMain(html, '首页');
    $('btnStart').onclick = function () { Cloud.go('setup'); };
    $('btnRecords').onclick = function () { Cloud.go('records'); };
    $('btnAdmin').onclick = function () { Cloud.go('admin'); };
    $('btnLogout').onclick = function () {
      Cloud.token = null; Cloud.user = null; localStorage.removeItem('lvdun_token');
      Cloud.go('auth');
    };
  }

  /* ---------- 考试设置 ---------- */
  function renderSetup() {
    var posts = Bank.positionList().filter(function (p) { return !p.combo; });
    var comboAll = Bank.positionList().filter(function (p) { return p.combo; });
    var mainOpts = posts.map(function (p) { return '<option value="' + p.key + '">' + p.name + '</option>'; }).join('');
    var viceOpts = '<option value="">不兼任</option>' + posts.map(function (p) { return '<option value="' + p.key + '">' + p.name + '</option>'; }).join('');
    var html = '<div class="card pad" style="max-width:520px;margin:24px auto">' +
      '<h3>关键岗位考试设置</h3>' +
      '<div class="form-row"><label class="label">考试类型</label><select class="select" id="sMode"><option value="first">首次考试</option><option value="extend">扩领域考试</option></select></div>' +
      '<div class="form-row"><label class="label">报考岗位</label><select class="select" id="sMain">' + mainOpts + '</select></div>' +
      '<div class="form-row"><label class="label">兼任岗位（可选）</label><select class="select" id="sVice">' + viceOpts + '</select></div>' +
      '<div class="form-row"><label class="label">岗位说明</label><div class="muted" id="sNote">' + posts[0].note + '</div></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button class="btn primary" id="sBuild">生成试卷</button>' +
      '<button class="btn ghost" id="sBack">返回</button>' +
      '</div></div>';
    setMain(html, '考试设置');
    var sMain = $('sMain'), sVice = $('sMode'), sNote = $('sNote');
    function updateNote() {
      var m = $('sMode').value;
      if (m === 'extend') { sNote.textContent = '仅考科目D（检验检测专业技术知识），满分100分，时长' + Cloud.cfg.keypost.extendMin + '分钟'; return; }
      var v = sVice.value, k = v ? (sMain.value + '_' + v) : sMain.value;
      var p = Bank.getPosition(k);
      sNote.textContent = (p ? p.note : '') + '　' + Engine.planSummary(p ? p.plan : {});
    }
    sMain.onchange = updateNote; $('sVice').onchange = updateNote; $('sMode').onchange = updateNote;
    updateNote();
    $('sBack').onclick = function () { Cloud.go('home'); };
    $('sBuild').onclick = function () {
      var mode = $('sMode').value, main = sMain.value, vice = $('sVice').value;
      var key = (mode === 'first' && vice) ? (main + '_' + vice) : main;
      var pos = mode === 'first' ? Bank.getPosition(key) : null;
      var minutes = mode === 'first' ? Cloud.cfg.keypost.firstMin : Cloud.cfg.keypost.extendMin;
      var spec = { mode: mode, post: main, combo: vice || '', shuffleOptions: Cloud.cfg.keypost.shuffleOptions, minutes: minutes };
      if (mode === 'first') {
        spec.planObj = pos; spec.postName = pos ? pos.name : '';
      }
      spec.pool = Bank._builtinIdx;
      Cloud.paper = Engine.buildPaper(spec);
      if (Cloud.paper.warn && Cloud.paper.warn.length) {
        modal('组卷提示', '<ul style="text-align:left">' + Cloud.paper.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>');
      }
      Cloud.answers = Cloud.paper.items.map(function () { return []; });
      Cloud.switches = 0;
      Cloud.go('exam');
    };
  }

  /* ---------- 考试中 ---------- */
  function disableCtx(e) { if (Cloud.paper) e.preventDefault(); }
  function disableCopy(e) { if (Cloud.paper) { e.preventDefault(); return false; } }
  function onBlur() { if (Cloud.paper) countSwitch(); }
  function onVis() { if (Cloud.paper && document.hidden) countSwitch(); }
  function countSwitch() {
    Cloud.switches++;
    var limit = Cloud.cfg.keypost.switchLimit;
    toast('检测到离开考试界面（' + Cloud.switches + '/' + limit + '）');
    if (Cloud.switches >= limit) { toast('切屏次数超限，自动交卷'); submitExam(true); }
  }
  function renderExam() {
    var p = Cloud.paper;
    var total = p.items.length;
    var html = '<div id="examWrap" style="max-width:720px;margin:0 auto;padding:12px">' +
      '<div class="card pad" style="position:sticky;top:8px;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div><b>' + p.title + '</b><div class="muted">共' + total + '题 · 满分' + p.totalScore + ' · 合格' + Cloud.cfg.keypost.passScore + '分</div></div>' +
      '<div class="chip" id="examTimer" style="font-size:18px">' + fmtRemaining(p.minutes * 60) + '</div>' +
      '</div>' +
      '<div id="qList" style="margin-top:12px"></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin:16px 0 40px">' +
      '<button class="btn primary" id="btnSubmit">交卷</button>' +
      '<button class="btn ghost" id="btnGiveup">放弃</button>' +
      '</div></div>';
    setMain(html, '考试中');
    renderQuestionList();
    Cloud.startAt = Date.now();
    var left = p.minutes * 60;
    Cloud.timerId = setInterval(function () {
      left--;
      $('examTimer').textContent = fmtRemaining(left);
      if (left <= 0) { clearInterval(Cloud.timerId); submitExam(true); }
    }, 1000);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    if (Cloud.cfg.keypost.antiCopy) {
      document.addEventListener('contextmenu', disableCtx);
      document.addEventListener('copy', disableCopy);
      document.addEventListener('cut', disableCopy);
    }
    $('btnSubmit').onclick = function () { submitExam(false); };
    $('btnGiveup').onclick = function () {
      if (confirm('确定放弃本场考试？成绩将不被记录。')) { clearInterval(Cloud.timerId); Cloud.go('home'); }
    };
  }
  function fmtRemaining(s) {
    if (s <= 0) return '00:00'; var m = Math.floor(s / 60); var sec = s % 60; return pad(m) + ':' + pad(sec);
  }
  function renderQuestionList() {
    var el = $('qList');
    el.innerHTML = Cloud.paper.items.map(function (it, i) {
      var opts = (it.o || []).map(function (o, j) {
        var L = Engine.OPTL[j];
        var checked = Cloud.answers[i].indexOf(L) >= 0 ? 'checked' : '';
        return '<label class="opt-label" style="display:block;padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">' +
          '<input type="' + (it.t === 2 ? 'checkbox' : 'radio') + '" name="q' + i + '" value="' + L + '" ' + checked + ' data-idx="' + i + '"> ' +
          '<b>' + L + '.</b> ' + escapeHtml(o) + '</label>';
      }).join('');
      return '<div class="card pad" style="margin-bottom:10px">' +
        '<div class="muted">第' + (i + 1) + '题 · ' + Bank.typeName(it.t) + ' · ' + (Engine.SUBJECT_NAME[it.sub] || it.sub) + '</div>' +
        '<div style="font-weight:500;margin:8px 0">' + escapeHtml(it.q) + '</div>' +
        '<div>' + opts + '</div></div>';
    }).join('');
    $$('input[data-idx]').forEach(function (inp) {
      inp.onchange = function () {
        var idx = +this.getAttribute('data-idx');
        var val = this.value;
        if (Cloud.paper.items[idx].t === 2) {
          var arr = Cloud.answers[idx];
          if (this.checked) { if (arr.indexOf(val) < 0) arr.push(val); }
          else { Cloud.answers[idx] = arr.filter(function (x) { return x !== val; }); }
        } else {
          Cloud.answers[idx] = [val];
        }
      };
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function submitExam(forced) {
    if (!forced && !confirm('确定交卷？')) return;
    clearInterval(Cloud.timerId);
    var dur = Math.max(0, Math.floor((Date.now() - Cloud.startAt) / 1000));
    var result = Engine.grade(Cloud.paper, Cloud.answers);
    var detail = result.detail.map(function (d, i) {
      var it = Cloud.paper.items[i];
      return { no: d.no, qid: d.qid, sub: d.sub, t: d.t, q: it.q, sel: d.sel, a: d.a, ok: d.ok, score: d.score, full: d.full };
    });
    var payload = {
      mode: Cloud.paper.mode, post: Cloud.paper.post, combo: Cloud.paper.combo || '',
      title: Cloud.paper.title, passScore: Cloud.cfg.keypost.passScore,
      result: result, detail: detail, duration: dur
    };
    api('/api/exam/submit', { method: 'POST', body: payload }).then(function (r) {
      if (!r.ok) toast('成绩提交失败：' + (r.json.msg || '网络错误'));
      Cloud.go('result', { result: result, detail: detail, paper: Cloud.paper, submitted: r.ok });
    }).catch(function () {
      Cloud.go('result', { result: result, detail: detail, paper: Cloud.paper, submitted: false });
    });
  }
  function startTimerIfNeeded() {
    // resume timer placeholder: current simple implementation stops on confirm; acceptable
  }

  /* ---------- 结果 ---------- */
  function renderResult(arg) {
    var r = arg.result, p = arg.paper;
    var pass = r.score >= Cloud.cfg.keypost.passScore;
    var html = '<div class="card pad" style="max-width:520px;margin:24px auto;text-align:center">' +
      '<h2>' + (pass ? '<span style="color:#0e7a4f">合格</span>' : '<span style="color:#d32f2f">不合格</span>') + '</h2>' +
      '<div style="font-size:42px;font-weight:700">' + r.score + '<span style="font-size:16px;font-weight:400">/' + r.total + '</span></div>' +
      '<div class="muted">答对 ' + r.right + ' · 答错 ' + r.wrong + ' · 漏答 ' + r.blank + '</div>' +
      (arg.submitted === false ? '<div class="tag red" style="margin-top:10px">本次成绩未成功上传到云端</div>' : '') +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">' +
      '<button class="btn primary" id="rHome">返回首页</button>' +
      '<button class="btn" id="rReview">查看答卷</button>' +
      '</div></div>';
    setMain(html, '考试结果');
    $('rHome').onclick = function () { Cloud.go('home'); };
    $('rReview').onclick = function () { showReview(arg.detail); };
  }
  function showReview(detail) {
    var body = '<div style="max-height:60vh;overflow:auto">' + detail.map(function (d) {
      var cls = d.ok ? 'green' : 'red';
      return '<div style="border-bottom:1px solid #eee;padding:8px 0">' +
        '<b style="color:' + (d.ok ? '#0e7a4f' : '#d32f2f') + '">第' + d.no + '题 ' + (d.ok ? '✓' : '✗') + '</b>' +
        '<div class="muted">你的答案：' + (d.sel || '未答') + '　正确答案：' + d.a + '　得分：' + d.score + '/' + d.full + '</div>' +
        '</div>';
    }).join('') + '</div>';
    modal('答题详情', body);
  }

  /* ---------- 我的记录 ---------- */
  function renderMyRecords() {
    setMain('<div class="card pad" style="max-width:720px;margin:24px auto"><h3>我的考试记录</h3><div id="recList">加载中…</div><button class="btn ghost" id="recBack" style="margin-top:12px">返回</button></div>', '我的记录');
    $('recBack').onclick = function () { Cloud.go('home'); };
    api('/api/me/records').then(function (r) {
      if (!r.ok) return $('recList').innerHTML = '<div class="empty">加载失败</div>';
      var list = r.json.records;
      if (!list.length) return $('recList').innerHTML = '<div class="empty">暂无考试记录</div>';
      $('recList').innerHTML = '<div class="list">' + list.map(function (x) {
        var pass = x.score >= x.passScore;
        return '<div class="list-item" data-id="' + x.id + '" style="cursor:pointer">' +
          '<div><b>' + x.title + '</b><div class="muted">' + fmtTime(x.submittedAt) + ' · ' + fmtDur(x.duration) + '</div></div>' +
          '<div style="text-align:right"><span style="font-size:20px;font-weight:700;color:' + (pass ? '#0e7a4f' : '#d32f2f') + '">' + x.score + '</span><div class="muted">/' + x.total + '</div></div>' +
          '</div>';
      }).join('') + '</div>';
      $$('.list-item').forEach(function (el) {
        el.onclick = function () {
          var id = this.getAttribute('data-id');
          api('/api/record/' + id).then(function (r) {
            if (!r.ok) return toast('读取失败');
            showReview(r.json.record.detail);
          }).catch(function () {});
        };
      });
    }).catch(function () { $('recList').innerHTML = '<div class="empty">加载失败</div>'; });
  }

  /* ---------- 管理后台 ---------- */
  function renderAdminLogin(err) {
    if (Cloud.adminToken) return renderAdminPanel();
    var html = '<div class="card pad" style="max-width:400px;margin:24px auto">' +
      '<h2 style="text-align:center">管理后台登录</h2>' +
      (err ? '<div class="tag red" style="margin-bottom:12px">' + err + '</div>' : '') +
      '<div class="form-row"><label class="label">管理员账号</label><input class="input" id="adUser" value="admin"></div>' +
      '<div class="form-row"><label class="label">密码</label><input class="input" id="adPw" type="password" placeholder="初始密码 ldws2025"></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button class="btn primary" id="adBtn" style="flex:1">登录</button>' +
      '<button class="btn ghost" id="adBack">返回</button>' +
      '</div></div>';
    setMain(html, '管理登录');
    $('adBack').onclick = function () { Cloud.go('home'); };
    $('adBtn').onclick = function () {
      var u = $('adUser').value.trim(), p = $('adPw').value.trim();
      api('/api/admin/login', { method: 'POST', body: { user: u, pass: p } }).then(function (r) {
        if (!r.ok) return toast(r.json.msg || '登录失败');
        Cloud.adminToken = r.json.token; Cloud.admin = r.json.admin;
        localStorage.setItem('lvdun_admin_token', Cloud.adminToken);
        Cloud.go('adminPanel');
      }).catch(function () {});
    };
  }
  function renderAdminPanel() {
    setMain('<div class="card pad" style="max-width:900px;margin:12px auto"><h2>管理后台</h2>' +
      '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">' +
      '<button class="btn" id="adUsers">全部考生</button>' +
      '<button class="btn" id="adRecords">全部记录</button>' +
      '<button class="btn ghost" id="adLogout">退出后台</button>' +
      '</div><div id="adBody">加载中…</div></div>', '管理后台');
    $('adLogout').onclick = function () { Cloud.adminToken = null; Cloud.admin = null; localStorage.removeItem('lvdun_admin_token'); Cloud.go('home'); };
    $('adUsers').onclick = loadAdminUsers;
    $('adRecords').onclick = loadAdminRecords;
    loadAdminUsers();
  }
  function loadAdminUsers() {
    $('adBody').innerHTML = '加载中…';
    api('/api/admin/users').then(function (r) {
      if (!r.ok) return $('adBody').innerHTML = '<div class="empty">加载失败</div>';
      var rows = r.json.users.map(function (u) {
        return '<tr data-user="' + u.user + '" style="cursor:pointer">' +
          '<td>' + u.user + '</td><td>' + u.name + '</td><td>' + u.exams + '</td><td>' + (u.best != null ? u.best : '-') + '</td><td>' + fmtTime(u.lastAt) + '</td><td>' + fmtTime(u.createdAt) + '</td>' +
          '</tr>';
      }).join('');
      $('adBody').innerHTML = '<h3>考生列表（' + r.json.total + '人）</h3>' +
        '<div style="overflow:auto"><table class="admin-table" style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f5f5f5"><th>账号</th><th>姓名</th><th>考试次数</th><th>最高分</th><th>最近考试</th><th>注册时间</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      $$('tbody tr').forEach(function (tr) {
        tr.onclick = function () { loadAdminRecords(this.getAttribute('data-user')); };
      });
    }).catch(function () { $('adBody').innerHTML = '<div class="empty">加载失败</div>'; });
  }
  function loadAdminRecords(user) {
    $('adBody').innerHTML = '加载中…';
    api('/api/admin/records?user=' + encodeURIComponent(user || '')).then(function (r) {
      if (!r.ok) return $('adBody').innerHTML = '<div class="empty">加载失败</div>';
      var rows = r.json.records.map(function (x) {
        var pass = x.score >= x.passScore;
        return '<tr data-id="' + x.id + '" style="cursor:pointer">' +
          '<td>' + x.user + '</td><td>' + x.name + '</td><td>' + x.title + '</td>' +
          '<td style="color:' + (pass ? '#0e7a4f' : '#d32f2f') + '">' + x.score + '/' + x.total + '</td>' +
          '<td>' + fmtTime(x.submittedAt) + '</td><td>' + fmtDur(x.duration) + '</td>' +
          '</tr>';
      }).join('');
      $('adBody').innerHTML = '<h3>考试记录' + (user ? '（' + user + '）' : '（全部）') + ' · ' + r.json.total + '条</h3>' +
        '<div style="overflow:auto"><table class="admin-table" style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f5f5f5"><th>账号</th><th>姓名</th><th>考试名称</th><th>成绩</th><th>提交时间</th><th>用时</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      $$('tbody tr').forEach(function (tr) {
        tr.onclick = function () {
          var id = this.getAttribute('data-id');
          api('/api/record/' + id).then(function (r) { if (r.ok) showReview(r.json.record.detail); else toast('读取失败'); }).catch(function () {});
        };
      });
    }).catch(function () { $('adBody').innerHTML = '<div class="empty">加载失败</div>'; });
  }

  /* ---------- 启动 ---------- */
  Cloud.boot = function () {
    Bank.init().then(function () {
      Cloud.cfg = Bank.cfg;
      // 若已有 token，尝试恢复用户信息（简化为进入首页后自动校验）
      if (Cloud.token) {
        api('/api/me').then(function (r) {
          if (r.ok) { Cloud.user = r.json.user; Cloud.go('home'); }
          else { Cloud.token = null; localStorage.removeItem('lvdun_token'); Cloud.go('auth'); }
        }).catch(function () { Cloud.go('auth'); });
      } else {
        Cloud.go('auth');
      }
      // Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    }).catch(function (e) {
      $('main').innerHTML = '<div class="card pad empty"><div class="big">系统初始化失败</div><div>' + (e && e.message) + '</div></div>';
    });
    $('btnHome').onclick = function () { Cloud.go('home'); };
  };
})(window);

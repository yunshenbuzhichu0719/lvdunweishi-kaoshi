/* ===========================================================
 *  main.js —— 启动
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS;

  function boot() {
    L.Bank.init().then(function () {
      document.getElementById('btnHome').onclick = function () {
        if (L.UI.adminLoggedIn && L.UI.adminLoggedIn()) { L.Admin.enter(); return; }
        if (!L.UI.isLoggedIn()) { L.UI.go('login'); return; }
        if (L.UI.isExamRunning()) {
          return L.UI.confirmBox('退出考试', '<b style="color:var(--red)">考试正在进行中</b>，返回首页将放弃本场考试且不计成绩。确认退出？', '放弃考试', true)
            .then(function (v) { if (v) location.reload(); });
        }
        L.UI.go('home');
      };

      // 返回上一界面（考试中返回视为放弃本场考试）
      var btnBack = document.getElementById('btnBack');
      if (btnBack) btnBack.onclick = function () {
        if (L.UI.isExamRunning()) {
          return L.UI.confirmBox('退出考试', '<b style="color:var(--red)">考试正在进行中</b>，返回将放弃本场考试且不计成绩。确认返回？', '放弃考试', true)
            .then(function (v) { if (v) location.reload(); });
        }
        var t = btnBack.getAttribute('data-back');
        if (t) L.UI.go(t);
      };

      // 入口门禁：管理员已登录 → 后台；考生已登录 → 首页；均未登录 → 登录页
      L.UI.initSession().then(function () { return L.UI.initAdminSession(); }).then(function () {
        if (L.UI.adminLoggedIn && L.UI.adminLoggedIn()) {
          L.Admin.enter();
        } else if (L.UI.isLoggedIn()) {
          L.UI.go('personal');
          if (L.UI.deepLink && L.UI.deepLink()) { /* 已跳转至对应考试设置页 */ }
        } else {
          L.UI.go('login');
        }
      });
    }).catch(function (e) {
      document.getElementById('main').innerHTML =
        '<div class="card pad empty"><div class="big">系统初始化失败</div><div>' +
        (e && e.message ? e.message : e) + '</div></div>';
    });

    // 考试中防止误关闭
    window.addEventListener('beforeunload', function (e) {
      if (L.UI && L.UI.isExamRunning && L.UI.isExamRunning()) {
        e.preventDefault(); e.returnValue = '';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

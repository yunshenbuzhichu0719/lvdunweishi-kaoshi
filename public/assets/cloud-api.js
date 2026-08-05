/* ===========================================================
 *  cloud-api.js —— 云端模式通信层
 *  ---------------------------------------------------------
 *  当系统通过 http/https 访问时自动启用：
 *  · 管理 JWT token（学员 + 管理员分离）
 *  · 封装 fetch 调用，自动携带 Authorization 头
 *  · 提供注册/登录/管理员登录等认证 API
 *  file:// 双击打开时本文件不生效，系统仍为纯前端离线模式。
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS = global.LDWS || {};

  var isCloudMode = (typeof location !== 'undefined' &&
    location.protocol &&
    (location.protocol === 'http:' || location.protocol === 'https:'));

  var K_TOKEN = 'ldws_token';
  var K_ADMIN = 'ldws_admin_token';
  var K_USER = 'ldws_user';
  var K_ADMIN_INFO = 'ldws_admin';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- token 管理 ---------- */
  function getToken() { return lsGet(K_TOKEN) || ''; }
  function setToken(t) { lsSet(K_TOKEN, t); }
  function clearToken() { lsDel(K_TOKEN); lsDel(K_USER); }

  function getAdminToken() { return lsGet(K_ADMIN) || ''; }
  function setAdminToken(t) { lsSet(K_ADMIN, t); }
  function clearAdminToken() { lsDel(K_ADMIN); lsDel(K_ADMIN_INFO); }

  function getUserInfo() { try { return JSON.parse(lsGet(K_USER) || 'null'); } catch (e) { return null; } }
  function setUserInfo(u) { lsSet(K_USER, JSON.stringify(u)); }
  function getAdminInfo() { try { return JSON.parse(lsGet(K_ADMIN_INFO) || 'null'); } catch (e) { return null; } }
  function setAdminInfo(a) { lsSet(K_ADMIN_INFO, JSON.stringify(a)); }

  /* ---------- 通用 API 调用 ----------
   * 自动选择 token：管理员 token 优先（后台操作），否则用学员 token
   * 返回 Promise<响应体 JSON>
   */
  function api(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var headers = { 'Content-Type': 'application/json' };
    var token = getAdminToken() || getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var f = { method: method, headers: headers };
    if (opts.body !== undefined) f.body = JSON.stringify(opts.body);
    return fetch(path, f).then(function (r) {
      return r.json().then(function (data) {
        if (r.status === 401) {
          // token 失效：清除对应 token
          if (opts.admin) clearAdminToken(); else clearToken();
        }
        return data;
      });
    }).catch(function (e) {
      return { ok: false, msg: '网络错误：' + String((e && e.message) || e) };
    });
  }

  /* ---------- 认证 API ---------- */
  function login(user, pass) {
    return api('/api/login', { method: 'POST', body: { user: user, pass: pass } }).then(function (r) {
      if (r.ok) { setToken(r.token); setUserInfo(r.user); }
      return r;
    });
  }
  function register(user, pass, name, no, dept) {
    return api('/api/register', { method: 'POST', body: { user: user, pass: pass, name: name, no: no || '', dept: dept || '' } }).then(function (r) {
      if (r.ok) { setToken(r.token); setUserInfo(r.user); }
      return r;
    });
  }
  function adminLogin(user, pass) {
    return api('/api/admin/login', { method: 'POST', body: { user: user, pass: pass } }).then(function (r) {
      if (r.ok) { setAdminToken(r.token); setAdminInfo(r.admin); }
      return r;
    });
  }

  /* ---------- 退出 ---------- */
  function logout() { clearToken(); }
  function adminLogout() { clearAdminToken(); }

  L.Cloud = {
    isCloud: function () { return isCloudMode; },
    // token
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    getAdminToken: getAdminToken, setAdminToken: setAdminToken, clearAdminToken: clearAdminToken,
    getUserInfo: getUserInfo, setUserInfo: setUserInfo,
    getAdminInfo: getAdminInfo, setAdminInfo: setAdminInfo,
    // api
    api: api,
    // auth
    login: login, register: register, adminLogin: adminLogin,
    logout: logout, adminLogout: adminLogout
  };

})(window);

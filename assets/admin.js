/* ===========================================================
 *  admin.js —— 后台管理
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS;
  var U = null;      // 延迟取 UI
  var logged = false;
  var page = 'overview';

  function ui() { return (U = U || L.UI); }
  function $(s, r) { return ui().$(s, r); }
  function $$(s, r) { return ui().$$(s, r); }
  var esc = function (s) { return ui().esc(s); };

  var NAV = [
    { k: 'overview', t: '概览' },
    { k: 'dailyBank', t: '日常培训题库' },
    { k: 'dailyPlan', t: '日常考试方案' },
    { k: 'kpBank', t: '关键岗位题库' },
    { k: 'kpCfg', t: '关键岗位参数' },
    { k: 'kpPositions', t: '关键岗位配置' },
    { k: 'admins', t: '管理员账户' },
    { k: 'records', t: '考试记录' },
    { k: 'report', t: '成绩回传' },
    { k: 'sys', t: '系统设置' }
  ];

  function enter(target) {
    if (target) page = target;
    if (L.UI.isExamRunning && L.UI.isExamRunning()) {
      return ui().toast('考试进行中，无法进入后台', 'err');
    }
    if (!L.UI.isAdminLoggedIn()) return;   // 管理员登录在登录页完成
    render();
  }

  function render() {
    ui().setHTML(
      ui().crumb([{ t: '首页', go: 'home' }, { t: '后台管理' }]) +
      '<div class="admin-lay">' +
      '<div class="admin-nav">' + NAV.map(function (n) {
        return '<a data-nav="' + n.k + '" class="' + (page === n.k ? 'on' : '') + '">' + n.t + '</a>';
      }).join('') + '<a id="navLogout" style="color:var(--red)">退出登录</a></div>' +
      '<div class="admin-body" id="abody"></div></div>'
    );
    $$('[data-nav]').forEach(function (el) {
      el.onclick = function () { page = el.getAttribute('data-nav'); render(); };
    });
    $('#navLogout').onclick = function () {
      L.UI.adminLogout().then(function () { ui().go('login'); });
    };
    PAGES[page]();
  }

  var PAGES = {};

  /* ---------- 概览 ---------- */
  PAGES.overview = function () {
    var d = L.Bank.list('daily'), k = L.Bank.list('keypost');
    var dN = d.reduce(function (s, b) { return s + b.total; }, 0);
    var kN = k.reduce(function (s, b) { return s + b.total; }, 0);
    L.Store.get('records').then(function (recs) {
      recs = recs || [];
      var passN = recs.filter(function (r) { return r.pass; }).length;
      $('#abody').innerHTML =
        '<h3 style="margin:0 0 16px;font-size:17px">系统概览</h3>' +
        '<div class="sc-grid" style="margin-bottom:20px">' +
        '<div class="sc-box"><b>' + d.length + '</b><span>日常培训题库</span></div>' +
        '<div class="sc-box"><b>' + dN + '</b><span>日常培训题量</span></div>' +
        '<div class="sc-box"><b>' + k.length + '</b><span>关键岗位题库</span></div>' +
        '<div class="sc-box"><b>' + kN + '</b><span>关键岗位题量</span></div>' +
        '</div>' +
        '<div class="sc-grid" style="margin-bottom:20px">' +
        '<div class="sc-box"><b>' + recs.length + '</b><span>考试记录</span></div>' +
        '<div class="sc-box"><b style="color:var(--green-700)">' + passN + '</b><span>合格人次</span></div>' +
        '<div class="sc-box"><b style="color:var(--red)">' + (recs.length - passN) + '</b><span>不合格人次</span></div>' +
        '<div class="sc-box"><b>' + (recs.filter(function (r) { return r.auto; }).length) + '</b><span>自动交卷</span></div>' +
        '</div>' +
        '<div class="warnbox">存储模式：<b>' + (L.Store.mode() === 'idb' ? 'IndexedDB（推荐）' : 'localStorage（容量约 5MB）') + '</b>。' +
        '题库与考试记录均保存在本机浏览器中，更换电脑或清理浏览器数据会导致丢失，请定期在「系统设置」中导出备份。</div>';
    });
  };

  /* ---------- 题库管理（通用） ---------- */
  function bankPage(ns, title, desc) {
    var banks = L.Bank.list(ns);
    var builtinN = banks.filter(function (b) { return b.builtin; }).length;
    $('#abody').innerHTML =
      '<div class="page-hd" style="margin-bottom:14px"><div><h3 style="margin:0;font-size:17px">' + title + '</h3>' +
      '<div class="sub">' + desc + '</div></div>' +
      '<button class="btn sm" id="btnUp">上传题库</button></div>' +
      '<div id="upBox" class="hidden" style="margin-bottom:16px">' +
      '<div class="drop" id="drop"><div class="big">点击选择 或 拖拽文件到此处</div>' +
      '<div>支持 .xlsx / .xls / .csv，可一次选择多个文件；每个文件将作为一个题库分类</div></div>' +
      '<input type="file" id="fileIn" multiple accept=".xlsx,.xls,.csv" style="display:none">' +
      '<div style="margin-top:10px;font-size:12.5px;color:var(--ink-400)">' +
      '表头需包含：序号 / 题型 / 题干 / 答案 / 选项A…选项E（可选「知识点」「解析」列）。题型支持 单选题、多选题、判断题；判断题答案填 A（对）或 B（错）。</div>' +
      '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th style="width:34px">#</th><th>题库名称</th><th>归属</th><th>单选</th><th>多选</th><th>判断</th><th>合计</th><th>来源</th><th style="width:90px">操作</th>' +
      '</tr></thead><tbody id="bkBody"></tbody></table></div>' +
      (builtinN ? '<div style="margin-top:10px;font-size:12.5px;color:var(--ink-400)">内置题库来自湖南省市场监督管理局公示题库，不可删除；如需更新可上传同名题库作为补充分类。</div>' : '');

    function drawRows() {
      var list = L.Bank.list(ns);
      $('#bkBody').innerHTML = list.length ? list.map(function (b, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td><b>' + esc(b.name) + '</b></td>' +
          '<td>' + (b.subject ? '科目' + esc(b.subject) : '—') + (b.major ? ' / ' + esc(b.major) : '') + '</td>' +
          '<td>' + b.n1 + '</td><td>' + b.n2 + '</td><td>' + b.n3 + '</td><td><b>' + b.total + '</b></td>' +
          '<td>' + (b.builtin ? '<span class="tag ok">内置</span>' : '<span class="tag t1">上传</span>') + '</td>' +
          '<td>' + (b.builtin ? '<span style="color:var(--ink-300)">—</span>' :
            '<a style="color:var(--red);cursor:pointer" data-del="' + esc(b.id) + '">删除</a>') + '</td></tr>';
      }).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--ink-400);padding:36px">暂无题库</td></tr>';
      $$('[data-del]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-del');
          var m = L.Bank.meta(ns, id);
          ui().confirmBox('删除题库', '确认删除题库「<b>' + esc(m.name) + '</b>」（' + m.total + ' 题）？该操作不可恢复。', '删除', true)
            .then(function (v) {
              if (!v) return;
              L.Bank.remove(ns, id).then(function () { ui().toast('已删除', 'ok'); drawRows(); });
            });
        };
      });
    }
    drawRows();

    $('#btnUp').onclick = function () { $('#upBox').classList.toggle('hidden'); };
    var drop = $('#drop'), fin = $('#fileIn');
    drop.onclick = function () { fin.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) {
      e.preventDefault(); drop.classList.remove('over');
      handleFiles(e.dataTransfer.files);
    };
    fin.onchange = function () { handleFiles(fin.files); fin.value = ''; };

    function handleFiles(files) {
      files = Array.prototype.slice.call(files);
      if (!files.length) return;
      var queue = files.slice();
      var results = [];
      (function next() {
        if (!queue.length) return finish();
        var f = queue.shift();
        L.parseWorkbook(f).then(function (r) {
          results.push({ file: f.name, ok: true, r: r });
        }).catch(function (e) {
          results.push({ file: f.name, ok: false, msg: e.message || '解析失败' });
        }).then(next);
      })();

      function finish() {
        var good = results.filter(function (x) { return x.ok && x.r.items.length; });
        if (!good.length) {
          return ui().modal({
            title: '导入失败',
            html: '<div>未能从所选文件中解析出题目：</div><ul style="padding-left:20px">' +
              results.map(function (x) { return '<li>' + esc(x.file) + '：' + esc(x.ok ? '无有效题目（请检查表头是否含「题干」「答案」列）' : x.msg) + '</li>'; }).join('') + '</ul>'
          });
        }
        var rows = good.map(function (x, i) {
          var base = x.file.replace(/\.(xlsx|xls|csv)$/i, '');
          var c1 = x.r.items.filter(function (q) { return q.t === 1; }).length;
          var c2 = x.r.items.filter(function (q) { return q.t === 2; }).length;
          var c3 = x.r.items.filter(function (q) { return q.t === 3; }).length;
          return '<tr><td style="padding:6px 4px"><input type="text" data-nm="' + i + '" value="' + esc(base) + '"></td>' +
            (ns === 'keypost' ?
              '<td style="padding:6px 4px;width:88px"><select data-sub="' + i + '"><option value="">—</option><option>A</option><option>B</option><option>C</option><option selected>D</option></select></td>' +
              '<td style="padding:6px 4px;width:150px"><input type="text" data-mj="' + i + '" placeholder="专业大类(选填)"></td>' : '') +
            '<td style="padding:6px 4px;white-space:nowrap;font-size:12.5px">单' + c1 + ' 多' + c2 + ' 判' + c3 + ' <b>共' + x.r.items.length + '</b></td></tr>';
        }).join('');
        ui().modal({
          title: '确认导入 ' + good.length + ' 个题库', lock: true,
          html: '<table class="tbl"><thead><tr><th>题库名称</th>' +
            (ns === 'keypost' ? '<th>科目</th><th>专业大类</th>' : '') + '<th>题量</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (results.some(function (x) { return !x.ok || !x.r.items.length; }) ?
              '<div style="margin-top:10px;color:var(--amber);font-size:12.5px">部分文件未解析出题目已忽略。</div>' : '') +
            (good.some(function (x) { return x.r.bad; }) ?
              '<div style="margin-top:6px;color:var(--ink-400);font-size:12.5px">共 ' + good.reduce(function (s, x) { return s + x.r.bad; }, 0) + ' 行因答案缺失或与选项不匹配被跳过。</div>' : ''),
          buttons: [{ text: '取消', value: false }, { text: '确认导入', primary: true, value: true }]
        }).then(function (v) {
          if (!v) return;
          var names = good.map(function (_, i) { return ($('[data-nm="' + i + '"]') || {}).value; });
          var subs = good.map(function (_, i) { var e = $('[data-sub="' + i + '"]'); return e ? e.value : ''; });
          var mjs = good.map(function (_, i) { var e = $('[data-mj="' + i + '"]'); return e ? e.value.trim() : ''; });
          var chain = Promise.resolve();
          good.forEach(function (x, i) {
            chain = chain.then(function () {
              var nm = (names[i] || x.file).trim();
              return L.Bank.save(ns, {
                id: ns.toUpperCase() + '::' + L.hash(nm + '|' + x.file + '|' + ns),
                name: nm, subject: subs[i] || '', major: mjs[i] || '', file: x.file
              }, x.r.items);
            });
          });
          chain.then(function () { ui().toast('导入成功', 'ok'); drawRows(); $('#upBox').classList.add('hidden'); })
            .catch(function (e) { ui().modal({ title: '保存失败', text: e.message || '存储空间不足' }); });
        });
      }
    }
  }

  PAGES.dailyBank = function () {
    bankPage('daily', '日常培训题库', '公司内部日常培训专用题库，与关键岗位题库完全隔离，互不混用。');
  };
  PAGES.kpBank = function () {
    bankPage('keypost', '关键岗位题库', '内置科目 A/B/C 及科目 D（生态环境监测类、卫生计生类）；可另行上传补充题库。');
  };

  /* ---------- 日常考试方案 ---------- */
  PAGES.dailyPlan = function () {
    var cfg = L.Bank.cfg.daily;
    var banks = L.Bank.list('daily');

    function draw() {
      $('#abody').innerHTML =
        '<div class="page-hd" style="margin-bottom:14px"><div><h3 style="margin:0;font-size:17px">日常考试方案</h3>' +
        '<div class="sub">配置日常培训考核的组卷规则，考生在考试模式中选择方案后随机组卷</div></div>' +
        '<button class="btn sm" id="newPlan">新建方案</button></div>' +
        (banks.length ? '' : '<div class="warnbox" style="margin-bottom:14px">尚未上传日常培训题库，请先在「日常培训题库」中上传。</div>') +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>方案名称</th><th>题型配比</th><th>满分</th><th>时长</th><th>合格分</th><th>适用题库</th><th style="width:90px">操作</th>' +
        '</tr></thead><tbody>' +
        ((cfg.plans || []).length ? cfg.plans.map(function (p, i) {
          var full = p.n1 * p.s1 + p.n2 * p.s2 + p.n3 * p.s3;
          var bn = (p.banks || []).map(function (id) { var m = L.Bank.meta('daily', id); return m ? m.name : '(已删除)'; });
          return '<tr><td><b>' + esc(p.name) + '</b></td>' +
            '<td style="font-size:12.5px">单选 ' + p.n1 + '×' + p.s1 + '　多选 ' + p.n2 + '×' + p.s2 + '　判断 ' + p.n3 + '×' + p.s3 + '</td>' +
            '<td>' + full + '</td><td>' + p.minutes + ' 分钟</td><td>' + p.pass + '</td>' +
            '<td style="font-size:12.5px;max-width:220px">' + esc(bn.join('、') || '—') + '</td>' +
            '<td><a style="cursor:pointer" data-ed="' + i + '">编辑</a>　<a style="color:var(--red);cursor:pointer" data-rm="' + i + '">删除</a></td></tr>';
        }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--ink-400);padding:36px">暂无方案</td></tr>') +
        '</tbody></table></div>' +
        '<div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line-2)">' +
        '<div style="font-weight:600;font-size:13.5px;margin-bottom:10px">日常考试通用设置</div>' +
        '<div class="grid g3">' +
        '<label class="fld"><span>切屏次数上限（达到自动交卷）</span><input type="number" id="dSw" min="1" max="20" value="' + cfg.switchLimit + '"></label>' +
        '<label class="fld"><span>选项乱序</span><select id="dShuf"><option value="1"' + (cfg.shuffleOptions ? ' selected' : '') + '>开启</option><option value="0"' + (!cfg.shuffleOptions ? ' selected' : '') + '>关闭</option></select></label>' +
        '<label class="fld"><span>考试中禁止复制/右键</span><select id="dCopy"><option value="1"' + (cfg.antiCopy ? ' selected' : '') + '>开启</option><option value="0"' + (!cfg.antiCopy ? ' selected' : '') + '>关闭</option></select></label>' +
        '</div><button class="btn sm" id="dSave">保存设置</button></div>';

      $('#newPlan').onclick = function () { editPlan(-1); };
      $$('[data-ed]').forEach(function (e) { e.onclick = function () { editPlan(+e.getAttribute('data-ed')); }; });
      $$('[data-rm]').forEach(function (e) {
        e.onclick = function () {
          var i = +e.getAttribute('data-rm');
          ui().confirmBox('删除方案', '确认删除「' + esc(cfg.plans[i].name) + '」？', '删除', true).then(function (v) {
            if (!v) return;
            cfg.plans.splice(i, 1); L.Bank.saveCfg().then(function () { ui().toast('已删除', 'ok'); draw(); });
          });
        };
      });
      $('#dSave').onclick = function () {
        cfg.switchLimit = Math.max(1, +$('#dSw').value || 3);
        cfg.shuffleOptions = $('#dShuf').value === '1';
        cfg.antiCopy = $('#dCopy').value === '1';
        L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); });
      };
    }

    function editPlan(idx) {
      var p = idx >= 0 ? JSON.parse(JSON.stringify(cfg.plans[idx])) :
        { name: '', n1: 20, s1: 2, n2: 10, s2: 3, n3: 10, s3: 3, minutes: 60, pass: 60, banks: [] };
      ui().modal({
        title: idx >= 0 ? '编辑考试方案' : '新建考试方案', lock: true,
        html:
          '<label class="fld"><span>方案名称</span><input type="text" id="pn" value="' + esc(p.name) + '" placeholder="如：2026年度质量体系培训考核"></label>' +
          '<div class="grid g3">' +
          '<label class="fld"><span>单选题数</span><input type="number" id="n1" min="0" value="' + p.n1 + '"></label>' +
          '<label class="fld"><span>单选每题分</span><input type="number" id="s1" min="0" step="0.5" value="' + p.s1 + '"></label>' +
          '<label class="fld"><span>时长（分钟）</span><input type="number" id="mi" min="1" value="' + p.minutes + '"></label>' +
          '<label class="fld"><span>多选题数</span><input type="number" id="n2" min="0" value="' + p.n2 + '"></label>' +
          '<label class="fld"><span>多选每题分</span><input type="number" id="s2" min="0" step="0.5" value="' + p.s2 + '"></label>' +
          '<label class="fld"><span>合格分</span><input type="number" id="ps" min="0" value="' + p.pass + '"></label>' +
          '<label class="fld"><span>判断题数</span><input type="number" id="n3" min="0" value="' + p.n3 + '"></label>' +
          '<label class="fld"><span>判断每题分</span><input type="number" id="s3" min="0" step="0.5" value="' + p.s3 + '"></label>' +
          '<div></div></div>' +
          '<label class="fld"><span>适用题库（可多选，按住 Ctrl / Shift）</span>' +
          '<select id="pb" multiple size="6">' + banks.map(function (b) {
            return '<option value="' + esc(b.id) + '"' + ((p.banks || []).indexOf(b.id) >= 0 ? ' selected' : '') + '>' + esc(b.name) + '（' + b.total + ' 题）</option>';
          }).join('') + '</select></label>' +
          '<div id="planSum" style="font-size:12.5px;color:var(--ink-400)"></div>',
        buttons: [{ text: '取消', value: false }, { text: '保存', primary: true, value: true }]
      }).then(function (v) {
        if (!v) return;
        var np = {
          name: ($('#pn').value || '').trim() || '未命名方案',
          n1: +$('#n1').value || 0, s1: +$('#s1').value || 0,
          n2: +$('#n2').value || 0, s2: +$('#s2').value || 0,
          n3: +$('#n3').value || 0, s3: +$('#s3').value || 0,
          minutes: Math.max(1, +$('#mi').value || 60), pass: +$('#ps').value || 60,
          banks: Array.prototype.slice.call($('#pb').selectedOptions).map(function (o) { return o.value; })
        };
        if (np.n1 + np.n2 + np.n3 <= 0) return ui().toast('题量不能为 0', 'err');
        if (!np.banks.length) return ui().toast('请至少选择一个题库', 'err');
        cfg.plans = cfg.plans || [];
        if (idx >= 0) cfg.plans[idx] = np; else cfg.plans.push(np);
        L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); draw(); });
      });
      setTimeout(function () {
        function upd() {
          var f = (+$('#n1').value || 0) * (+$('#s1').value || 0) + (+$('#n2').value || 0) * (+$('#s2').value || 0) + (+$('#n3').value || 0) * (+$('#s3').value || 0);
          var e = $('#planSum'); if (e) e.textContent = '试卷满分：' + f + ' 分，共 ' + ((+$('#n1').value || 0) + (+$('#n2').value || 0) + (+$('#n3').value || 0)) + ' 题';
        }
        ['n1', 's1', 'n2', 's2', 'n3', 's3'].forEach(function (id) { var e = $('#' + id); if (e) e.oninput = upd; });
        upd();
      }, 60);
    }
    draw();
  };

  /* ---------- 关键岗位参数 ---------- */
  PAGES.kpCfg = function () {
    var c = L.Bank.cfg.keypost;
    var E = L.Engine;
    $('#abody').innerHTML =
      '<h3 style="margin:0 0 4px;font-size:17px">关键岗位考试参数</h3>' +
      '<div class="sub" style="color:var(--ink-400);font-size:13px;margin-bottom:18px">默认值依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》，如需模拟练习可自行调整。</div>' +
      '<div class="grid g3">' +
      '<label class="fld"><span>首次考试时长（分钟）</span><input type="number" id="k1" min="1" value="' + c.firstMin + '"></label>' +
      '<label class="fld"><span>扩领域考试时长（分钟）</span><input type="number" id="k2" min="1" value="' + c.extendMin + '"></label>' +
      '<label class="fld"><span>合格分数线</span><input type="number" id="k3" min="1" max="100" value="' + c.passScore + '"></label>' +
      '<label class="fld"><span>切屏次数上限（达到自动交卷）</span><input type="number" id="k4" min="1" max="20" value="' + c.switchLimit + '"></label>' +
      '<label class="fld"><span>选项乱序</span><select id="k5"><option value="1"' + (c.shuffleOptions ? ' selected' : '') + '>开启</option><option value="0"' + (!c.shuffleOptions ? ' selected' : '') + '>关闭</option></select></label>' +
      '<label class="fld"><span>考试中禁止复制/右键</span><select id="k6"><option value="1"' + (c.antiCopy ? ' selected' : '') + '>开启</option><option value="0"' + (!c.antiCopy ? ' selected' : '') + '>关闭</option></select></label>' +
      '</div>' +
      '<button class="btn" id="kSave">保存参数</button>' +
      '<div style="margin-top:26px;padding-top:18px;border-top:1px solid var(--line-2)">' +
      '<div style="font-weight:600;font-size:13.5px;margin-bottom:10px">大纲组卷规则（当前配置，可在「关键岗位配置」中调整）</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>考试类型 / 岗位</th><th>组卷配比</th><th>分值</th><th>合计</th></tr></thead><tbody>' +
      (L.Bank.cfg.keypost.positions || []).map(function (p) {
        var n = 0; Object.keys(p.plan).forEach(function (s) { n += (p.plan[s][1] || 0) * 1 + (p.plan[s][2] || 0) * 2 + (p.plan[s][3] || 0) * 2; });
        return '<tr><td><b>' + (p.combo ? '兼任 · ' : '首次考试 · ') + esc(p.name) + '</b><div style="font-size:12px;color:var(--ink-400)">' + esc(p.focus || '') + '</div></td>' +
          '<td style="font-size:12.5px">' + esc(E.planSummary(p.plan)) + '</td>' +
          '<td style="font-size:12.5px">单选1分 / 多选2分 / 判断2分</td><td><b>' + n + ' 分</b></td></tr>';
      }).join('') +
      '<tr><td><b>扩领域考试 · 科目D</b><div style="font-size:12px;color:var(--ink-400)">单个专业大类</div></td>' +
      '<td style="font-size:12.5px">科目D（单选20、多选20、判断10）</td><td style="font-size:12.5px">全部 2 分</td><td><b>100 分</b></td></tr>' +
      '</tbody></table></div></div>';
    $('#kSave').onclick = function () {
      c.firstMin = Math.max(1, +$('#k1').value || 90);
      c.extendMin = Math.max(1, +$('#k2').value || 60);
      c.passScore = Math.max(1, +$('#k3').value || 70);
      c.switchLimit = Math.max(1, +$('#k4').value || 3);
      c.shuffleOptions = $('#k5').value === '1';
      c.antiCopy = $('#k6').value === '1';
      L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); });
    };
  };

  /* ---------- 关键岗位配置 ---------- */
  PAGES.kpPositions = function () {
    var c = L.Bank.cfg.keypost;
    var POS = c.positions || [];
    var SUBJ = ['A', 'B', 'C', 'D'];
    var SBASE = { top: '最高管理者', quality: '质量负责人', tech: '技术负责人', signer: '授权签字人' };

    function draw() {
      POS = c.positions || [];
      function planInputs(p, idx) {
        return SUBJ.map(function (s) {
          var pl = p.plan[s] || { 1: 0, 2: 0, 3: 0 };
          return '<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px">' +
            '<div style="font-weight:600;font-size:12.5px;margin-bottom:6px;color:var(--green-800)">科目' + s + '</div>' +
            '<div style="display:flex;gap:6px">' +
            '<label style="flex:1;font-size:11.5px;color:var(--ink-600)">单选<input type="number" min="0" data-p="' + idx + '" data-s="' + s + '" data-t="1" value="' + (pl[1] || 0) + '" style="padding:5px 6px"></label>' +
            '<label style="flex:1;font-size:11.5px;color:var(--ink-600)">多选<input type="number" min="0" data-p="' + idx + '" data-s="' + s + '" data-t="2" value="' + (pl[2] || 0) + '" style="padding:5px 6px"></label>' +
            '<label style="flex:1;font-size:11.5px;color:var(--ink-600)">判断<input type="number" min="0" data-p="' + idx + '" data-s="' + s + '" data-t="3" value="' + (pl[3] || 0) + '" style="padding:5px 6px"></label>' +
            '</div></div>';
        }).join('');
      }
      $('#abody').innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap;gap:10px">' +
        '<div><h3 style="margin:0;font-size:17px">关键岗位配置</h3>' +
        '<div class="sub">依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》4.2 与 4.2.1.5（兼任），可调整各组卷配比；考试按此配置组卷。</div></div>' +
        '<button class="btn sm" id="savePos">保存配置</button></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px;padding:12px;background:var(--green-050);border-radius:10px">' +
        '<label class="fld" style="margin:0"><span>岗位一</span><select id="cA">' + Object.keys(SBASE).map(function (k) { return '<option value="' + k + '">' + SBASE[k] + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld" style="margin:0"><span>兼任</span><select id="cB">' + Object.keys(SBASE).map(function (k) { return '<option value="' + k + '">' + SBASE[k] + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld" style="margin:0"><span>按（继承）考试</span><select id="cInh">' + Object.keys(SBASE).map(function (k) { return '<option value="' + k + '">' + SBASE[k] + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn sm" id="addCombo">+ 添加兼任岗位</button></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:30px">#</th><th>岗位名称</th><th>侧重</th><th style="width:60px">启用</th><th>组卷配比（各科目 单选/多选/判断）</th><th style="width:70px">操作</th></tr></thead><tbody>' +
        POS.map(function (p, i) {
          return '<tr><td>' + (i + 1) + '</td>' +
            '<td><input type="text" data-nm="' + i + '" value="' + esc(p.name) + '" style="max-width:170px"><div style="font-size:11.5px;color:var(--ink-400);margin-top:3px">' + (p.combo ? '兼任岗位' : '基础岗位') + (p.note ? '　' + esc(p.note) : '') + '</div></td>' +
            '<td><input type="text" data-fc="' + i + '" value="' + esc(p.focus || '') + '" style="max-width:120px" placeholder="如：侧重科目C"></td>' +
            '<td style="text-align:center"><input type="checkbox" data-en="' + i + '"' + (p.enabled !== false ? ' checked' : '') + '></td>' +
            '<td>' + planInputs(p, i) + '</td>' +
            '<td>' + (p.combo ? '<a style="color:var(--red);cursor:pointer" data-rmp="' + i + '">删除</a>' : '<span style="color:var(--ink-300)">—</span>') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';

      $('#savePos').onclick = function () {
        POS.forEach(function (p, i) {
          p.name = ($('[data-nm="' + i + '"]').value || '').trim() || p.name;
          p.focus = ($('[data-fc="' + i + '"]').value || '').trim();
          p.enabled = $('[data-en="' + i + '"]').checked;
          SUBJ.forEach(function (s) {
            [1, 2, 3].forEach(function (t) {
              var el = $('[data-p="' + i + '"][data-s="' + s + '"][data-t="' + t + '"]');
              p.plan[s] = p.plan[s] || { 1: 0, 2: 0, 3: 0 };
              p.plan[s][t] = Math.max(0, +el.value || 0);
            });
          });
        });
        c.positions = POS;
        L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); });
      };
      $('#addCombo').onclick = function () {
        var a = $('#cA').value, b = $('#cB').value, inh = $('#cInh').value;
        if (a === b) return ui().toast('两个岗位不能相同', 'err');
        var key = a + '_' + b;
        if (POS.some(function (x) { return x.key === key; })) return ui().toast('该兼任岗位已存在', 'err');
        var basePlan = (POS.filter(function (x) { return x.key === inh; })[0] || {}).plan || {};
        var clone = {}; Object.keys(basePlan).forEach(function (s) { clone[s] = { 1: basePlan[s][1] || 0, 2: basePlan[s][2] || 0, 3: basePlan[s][3] || 0 }; });
        POS.push({ key: key, name: SBASE[a] + '兼任' + SBASE[inh], combo: true, enabled: true, note: '按「' + SBASE[inh] + '」要求考试（大纲 4.2.1.5）', focus: '侧重科目' + (BASE_FOCUS[inh] || ''), plan: clone });
        c.positions = POS;
        L.Bank.saveCfg().then(function () { draw(); ui().toast('已添加', 'ok'); });
      };
      $$('[data-rmp]').forEach(function (e) {
        e.onclick = function () {
          var i = +e.getAttribute('data-rmp');
          ui().confirmBox('删除岗位', '确认删除兼任岗位「' + esc(POS[i].name) + '」？', '删除', true).then(function (v) {
            if (!v) return;
            POS.splice(i, 1); c.positions = POS; L.Bank.saveCfg().then(function () { draw(); ui().toast('已删除', 'ok'); });
          });
        };
      });
    }
    var BASE_FOCUS = { top: 'A', quality: 'B', tech: 'C', signer: 'D' };
    draw();
  };

  /* ---------- 管理员账户 ---------- */
  function genPwd(n) {
    n = n || 10;
    var s = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var r = ''; for (var i = 0; i < n; i++) r += s.charAt(Math.floor(Math.random() * s.length));
    return r;
  }
  PAGES.admins = function () {
    L.Bank.admins.all().then(function (list) {
      $('#abody').innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap;gap:10px">' +
        '<div><h3 style="margin:0;font-size:17px">管理员账户</h3>' +
        '<div class="sub">后台管理员专用账户；支持在后台新增 / 重置管理员，密码可自定义设置或随机生成。账户仅保存在本机浏览器。</div></div></div>' +
        '<div class="card pad" style="max-width:760px;margin-bottom:16px">' +
        '<div style="font-weight:600;font-size:13.5px;margin-bottom:10px">新增管理员</div>' +
        '<div class="grid g2">' +
        '<label class="fld"><span>用户名 <b style="color:var(--red)">*</b></span><input type="text" id="nU" placeholder="登录用户名"></label>' +
        '<label class="fld"><span>姓名 / 备注</span><input type="text" id="nN" placeholder="选填"></label></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">' +
        '<label class="fld" style="flex:1;min-width:220px;margin:0"><span>密码（留空则自动生成）</span><input type="text" id="nP" placeholder="留空随机生成"></label>' +
        '<button class="btn sm" id="nGen">生成随机密码</button>' +
        '<button class="btn sm" id="nAdd">添加账户</button></div>' +
        '<div id="nMsg" style="margin-top:8px;font-size:12.5px"></div>' +
        '</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th style="width:200px">操作</th></tr></thead><tbody>' +
        list.map(function (a, i) {
          return '<tr><td><b>' + esc(a.user) + '</b></td><td>' + esc(a.name || '') + '</td><td>管理员</td>' +
            '<td><a style="cursor:pointer" data-rst="' + i + '">重置密码</a>　' +
            (list.length > 1 ? '<a style="color:var(--red);cursor:pointer" data-del="' + i + '">删除</a>' : '<span style="color:var(--ink-300)">—</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';

      $('#nGen').onclick = function () { $('#nP').value = genPwd(10); $('#nMsg').textContent = '已生成随机密码，点击「添加账户」即可使用（也可自行修改）。'; };
      $('#nAdd').onclick = function () {
        var u = ($('#nU').value || '').trim();
        if (u.length < 2) return ui().toast('用户名至少 2 个字符', 'err');
        if (list.some(function (x) { return x.user === u; })) return ui().toast('该用户名已存在', 'err');
        var pw = ($('#nP').value || '').trim() || genPwd(10);
        L.Bank.admins.save({ user: u, name: ($('#nN').value || '').trim(), role: 'admin', pass: L.pwHash(pw) })
          .then(function () { PAGES.admins(); ui().toast('账户已添加，密码：' + pw, 'ok'); });
      };
      $$('[data-rst]').forEach(function (e) {
        e.onclick = function () {
          var i = +e.getAttribute('data-rst'); var a = list[i];
          var init = genPwd(10);
          ui().modal({
            title: '重置密码',
            lock: true,
            html:
              '<div style="margin-bottom:10px">为管理员 <b>' + esc(a.user) + '</b> 设置新密码：</div>' +
              '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
              '<label class="fld" style="flex:1;min-width:220px;margin:0"><span>新密码</span><input type="text" id="rstPwd" value="' + esc(init) + '" style="font-family:monospace"></label>' +
              '<button class="btn sm" id="rstGen">生成随机</button></div>' +
              '<div style="margin-top:8px;font-size:12px;color:var(--ink-400)">可改为自己易记的密码；留空或点「生成随机」则使用随机密码。</div>',
            buttons: [{ text: '取消', value: false }, { text: '确定重置', primary: true, danger: true, value: true }]
          }).then(function (v) {
            if (!v) return;
            var np = ($('#rstPwd').value || '').trim() || init;
            a.pass = L.pwHash(np);
            L.Bank.admins.save(a).then(function () { PAGES.admins(); ui().toast('密码已重置：' + np, 'ok'); });
          });
          var g = $('#rstGen');
          if (g) g.onclick = function () { var el = $('#rstPwd'); if (el) el.value = genPwd(10); };
        };
      });
      $$('[data-del]').forEach(function (e) {
        e.onclick = function () {
          var i = +e.getAttribute('data-del'); var a = list[i];
          ui().confirmBox('删除管理员', '确认删除管理员 <b>' + esc(a.user) + '</b>？', '删除', true).then(function (v) {
            if (!v) return;
            L.Bank.admins.remove(a.user).then(function () { PAGES.admins(); ui().toast('已删除', 'ok'); });
          });
        };
      });
    });
  };

  /* ---------- 考试记录 ---------- */
  PAGES.records = function () {
    L.Store.get('records').then(function (recs) {
      recs = recs || [];
      var flt = { ns: '', kw: '' };
      function draw() {
        var list = recs.filter(function (r) {
          if (flt.ns && r.ns !== flt.ns) return false;
          if (flt.kw && (r.who.name + (r.who.no || '') + r.title).indexOf(flt.kw) < 0) return false;
          return true;
        });
        $('#abody').innerHTML =
          '<div class="page-hd" style="margin-bottom:14px"><div><h3 style="margin:0;font-size:17px">考试记录</h3>' +
          '<div class="sub">共 ' + recs.length + ' 条记录</div></div>' +
          '<div style="display:flex;gap:8px"><button class="btn ghost sm" id="expX">导出 Excel</button>' +
          '<button class="btn ghost sm" id="prtTbl">打印记录表</button>' +
          '<button class="btn ghost sm" id="clrRec" style="color:var(--red)">清空记录</button></div></div>' +
          '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">' +
          '<select id="fns" style="width:180px"><option value="">全部模块</option>' +
          '<option value="daily"' + (flt.ns === 'daily' ? ' selected' : '') + '>日常培训考核</option>' +
          '<option value="keypost"' + (flt.ns === 'keypost' ? ' selected' : '') + '>关键岗位人员考试</option></select>' +
          '<input type="text" id="fkw" placeholder="搜索姓名 / 工号 / 考试名称" value="' + esc(flt.kw) + '" style="width:260px">' +
          '</div>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>时间</th><th>姓名</th><th>模块 / 考试</th><th>得分</th><th>结论</th><th>用时</th><th>切屏</th><th style="width:60px">详情</th>' +
          '</tr></thead><tbody>' +
          (list.length ? list.map(function (r, i) {
            return '<tr><td style="font-size:12.5px;white-space:nowrap">' + ui().fmtDate(r.ts) + '</td>' +
              '<td><b>' + esc(r.who.name) + '</b>' + (r.who.dept ? '<div style="font-size:11.5px;color:var(--ink-400)">' + esc(r.who.dept) + '</div>' : '') + '</td>' +
              '<td style="font-size:12.5px">' + (r.ns === 'keypost' ? '<span class="tag ok">关键岗位</span>' : '<span class="tag t1">日常培训</span>') +
              ' ' + esc(r.title) + (r.category ? '<div style="font-size:11.5px;color:var(--ink-400)">' + esc(r.category) + '</div>' : '') + '</td>' +
              '<td><b style="font-size:15px;color:' + (r.pass ? 'var(--green-700)' : 'var(--red)') + '">' + r.score + '</b><span style="color:var(--ink-400)"> / ' + r.total + '</span></td>' +
              '<td>' + (r.pass ? '<span class="tag ok">合格</span>' : '<span class="tag no">不合格</span>') + '</td>' +
              '<td style="font-size:12.5px">' + ui().fmtTime(r.used) + (r.auto ? '<div style="font-size:11px;color:var(--red)">自动交卷</div>' : '') + '</td>' +
              '<td>' + r.switches + '</td>' +
              '<td><a style="cursor:pointer" data-view="' + esc(r.id) + '">查看</a> · <a style="cursor:pointer" data-print="' + esc(r.id) + '">打印</a></td></tr>';
          }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--ink-400);padding:36px">暂无记录</td></tr>') +
          '</tbody></table></div>';

        $('#fns').onchange = function () { flt.ns = this.value; draw(); };
        $('#fkw').oninput = function () { flt.kw = this.value.trim(); draw(); };
        $$('[data-view]').forEach(function (e) {
          e.onclick = function () {
            var r = recs.filter(function (x) { return x.id === e.getAttribute('data-view'); })[0];
            if (r) ui().showResult(r);
          };
        });
        $$('[data-print]').forEach(function (e) {
          e.onclick = function () {
            var r = recs.filter(function (x) { return x.id === e.getAttribute('data-print'); })[0];
            if (r) ui().printExam(r);
          };
        });
        $('#expX').onclick = function () { exportRecords(list); };
        $('#prtTbl').onclick = function () { printRecordsView(list); };
        $('#clrRec').onclick = function () {
          ui().confirmBox('清空考试记录', '将删除全部 ' + recs.length + ' 条考试记录，不可恢复。确认继续？', '清空', true).then(function (v) {
            if (!v) return;
            L.Store.set('records', []).then(function () { recs = []; ui().toast('已清空', 'ok'); draw(); });
          });
        };
      }
      draw();
    });
  };

  function exportRecords(list) {
    if (!list.length) return ui().toast('没有可导出的记录', 'err');
    var rows = [['考试时间', '模块', '考试名称', '科目D类别', '姓名', '证件/工号', '部门', '得分', '满分', '合格线', '结论', '答对', '答错', '未答', '用时(分)', '切屏次数', '是否自动交卷']];
    list.forEach(function (r) {
      rows.push([
        ui().fmtDate(r.ts), r.ns === 'keypost' ? '关键岗位人员考试' : '日常培训考核', r.title, r.category || '',
        r.who.name, r.who.no || '', r.who.dept || '',
        r.score, r.total, r.passScore, r.pass ? '合格' : '不合格',
        r.right, r.wrong, r.blank, Math.round(r.used / 60 * 10) / 10, r.switches, r.auto ? '是' : '否'
      ]);
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 17 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
    { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 12 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '考试记录');
    XLSX.writeFile(wb, '考试记录_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function printRecordsView(list) {
    var rows = list.map(function (r) {
      return '<tr><td style="font-size:12.5px;white-space:nowrap">' + ui().fmtDate(r.ts) + '</td>' +
        '<td><b>' + ui().esc(r.who.name) + '</b>' + (r.who.no ? '<div style="font-size:11.5px;color:#666">' + ui().esc(r.who.no) + '</div>' : '') +
        (r.who.dept ? '<div style="font-size:11.5px;color:#666">' + ui().esc(r.who.dept) + '</div>' : '') + '</td>' +
        '<td style="font-size:12.5px">' + (r.ns === 'keypost' ? '关键岗位' : '日常培训') + '<br>' + ui().esc(r.title) + (r.category ? '<div style="font-size:11.5px;color:#666">' + ui().esc(r.category) + '</div>' : '') + '</td>' +
        '<td><b>' + r.score + '</b>/' + r.total + '</td>' +
        '<td>' + (r.pass ? '合格' : '不合格') + '</td>' +
        '<td style="font-size:12.5px">' + ui().fmtTime(r.used) + '</td>' +
        '<td style="text-align:center">' + r.switches + '</td></tr>';
    }).join('');
    document.getElementById('main').innerHTML =
      '<div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px">' +
      '<button class="btn ghost" id="prBack">返回</button><button class="btn" id="prDo">打印 / 另存为PDF</button></div>' +
      '<div class="print-records"><h2>考试记录表</h2>' +
      '<div class="pr-sub">' + ui().esc(L.Bank.cfg.company) + '　共 ' + list.length + ' 条　打印时间 ' + ui().fmtDate(Date.now()) + '</div>' +
      '<table class="tbl"><thead><tr><th>时间</th><th>姓名 / 工号 / 部门</th><th>模块 / 考试</th><th>得分</th><th>结论</th><th>用时</th><th>切屏</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999">暂无记录</td></tr>') + '</tbody></table></div>';
    document.getElementById('prBack').onclick = function () { L.Admin.enter('records'); };
    document.getElementById('prDo').onclick = function () { window.print(); };
  }

  /* ---------- 系统设置 ---------- */
  PAGES.sys = function () {
    var cfg = L.Bank.cfg;
    $('#abody').innerHTML =
      '<h3 style="margin:0 0 18px;font-size:17px">系统设置</h3>' +
      '<div class="grid g2" style="align-items:start">' +
      '<div><div style="font-weight:600;font-size:13.5px;margin-bottom:10px">基本信息</div>' +
      '<label class="fld"><span>单位名称（用于合格证明）</span><input type="text" id="cName" value="' + esc(cfg.company) + '"></label>' +
      '<button class="btn sm" id="saveName">保存</button></div>' +
      '<div><div style="font-weight:600;font-size:13.5px;margin-bottom:10px">管理员账户</div>' +
      '<div style="color:var(--ink-400);font-size:12.5px;line-height:1.8">后台管理员账户（用户名 + 密码）请在「管理员账户」页生成、重置与删除。</div>' +
      '<button class="btn sm" id="goAdmins">管理管理员账户</button></div>' +
      '</div>' +
      '<div style="margin-top:26px;padding-top:18px;border-top:1px solid var(--line-2)">' +
      '<div style="font-weight:600;font-size:13.5px;margin-bottom:10px">考生账号说明</div>' +
      '<div style="color:var(--ink-400);font-size:12.5px;line-height:1.8">考生须先在登录页「注册」账号（用户名+密码+密保），再以本人身份登录参加考试；账号仅保存在本机浏览器。考试身份、成绩与答卷会计入考试档案，可在「考试记录」中查询、打印存档。</div>' +
      '<div style="margin-top:26px;padding-top:18px;border-top:1px solid var(--line-2)">' +
      '<div style="font-weight:600;font-size:13.5px;margin-bottom:6px">数据备份与恢复</div>' +
      '<div style="color:var(--ink-400);font-size:12.5px;margin-bottom:12px">题库、配置与考试记录保存在本机浏览器中。更换电脑、清理浏览器缓存前，请先导出备份文件。</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn outline sm" id="expAll">导出全部数据（.json）</button>' +
      '<button class="btn ghost sm" id="impAll">从备份恢复</button>' +
      '<input type="file" id="impFile" accept=".json" style="display:none">' +
      '<button class="btn ghost sm" id="dlTpl">下载题库导入模板</button>' +
      '<button class="btn danger sm" id="wipe">清空全部本地数据</button>' +
      '</div></div>' +
      '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--line-2);font-size:12.5px;color:var(--ink-400);line-height:1.9">' +
      '存储模式：<b>' + (L.Store.mode() === 'idb' ? 'IndexedDB' : 'localStorage') + '</b>　|　' +
      '内置关键岗位题库：<b>' + (L.Bank.kpData.questions || []).length + '</b> 题　|　版本 v1.0' +
      '</div>';

    $('#saveName').onclick = function () {
      cfg.company = ($('#cName').value || '').trim() || '湖南绿盾卫士检测技术有限公司';
      L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); });
    };
    $('#goAdmins').onclick = function () { page = 'admins'; render(); };
    $('#expAll').onclick = function () {
      var data = { cfg: cfg, banklist: {}, banks: {}, records: [], v: 1, at: Date.now() };
      var jobs = [];
      ['daily', 'keypost'].forEach(function (ns) {
        data.banklist[ns] = L.Bank.extra[ns];
        (L.Bank.extra[ns] || []).forEach(function (b) {
          jobs.push(L.Bank.questions(b.id).then(function (qs) { data.banks[b.id] = qs; }));
        });
      });
      jobs.push(L.Store.get('records').then(function (r) { data.records = r || []; }));
      ['daily', 'keypost'].forEach(function (ns) {
        jobs.push(L.Store.get('wrong:' + ns).then(function (v) { data['wrong:' + ns] = v || {}; }));
        jobs.push(L.Store.get('fav:' + ns).then(function (v) { data['fav:' + ns] = v || {}; }));
      });
      Promise.all(jobs).then(function () {
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '绿盾卫士考核系统备份_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        ui().toast('备份已导出', 'ok');
      });
    };
    $('#impAll').onclick = function () { $('#impFile').click(); };
    $('#impFile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function (e) {
        var data;
        try { data = JSON.parse(e.target.result); } catch (err) { return ui().toast('备份文件格式错误', 'err'); }
        ui().confirmBox('恢复数据', '将用备份覆盖当前的配置、上传题库与考试记录，确认继续？', '恢复', true).then(function (v) {
          if (!v) return;
          var jobs = [L.Store.set('cfg', data.cfg || {}), L.Store.set('records', data.records || [])];
          ['daily', 'keypost'].forEach(function (ns) {
            jobs.push(L.Store.set('banklist:' + ns, (data.banklist || {})[ns] || []));
            jobs.push(L.Store.set('wrong:' + ns, data['wrong:' + ns] || {}));
            jobs.push(L.Store.set('fav:' + ns, data['fav:' + ns] || {}));
          });
          Object.keys(data.banks || {}).forEach(function (id) { jobs.push(L.Store.set('bank:' + id, data.banks[id])); });
          Promise.all(jobs).then(function () {
            ui().modal({ title: '恢复完成', text: '数据已恢复，页面将自动刷新。' }).then(function () { location.reload(); });
          });
        });
      };
      fr.readAsText(f); this.value = '';
    };
    $('#dlTpl').onclick = function () { downloadTemplate(); };
    $('#wipe').onclick = function () {
      ui().confirmBox('危险操作', '<b style="color:var(--red)">将清空本机全部数据</b>：上传的题库、考试方案、考试记录、错题本与系统配置，且不可恢复。<br>内置关键岗位题库不受影响。<br><br>确认继续？', '全部清空', true)
        .then(function (v) {
          if (!v) return;
          var jobs = [L.Store.del('cfg'), L.Store.del('records')];
          ['daily', 'keypost'].forEach(function (ns) {
            (L.Bank.extra[ns] || []).forEach(function (b) { jobs.push(L.Store.del('bank:' + b.id)); });
            jobs.push(L.Store.del('banklist:' + ns), L.Store.del('wrong:' + ns), L.Store.del('fav:' + ns));
          });
          Promise.all(jobs).then(function () { location.reload(); });
        });
    };
  };

  /* ---------- 成绩回传（集中收集） ---------- */
  PAGES.report = function () {
    var r = L.Bank.cfg.report;
    $('#abody').innerHTML =
      '<h3 style="margin:0 0 4px;font-size:17px">成绩回传设置</h3>' +
      '<div class="sub" style="color:var(--ink-400);font-size:13px;margin-bottom:18px">开启后，考生交卷时成绩将自动 POST 到下方地址，便于你集中收集与阅卷。分享链接追加 `?report=1` 可强制回传，`?reportUrl=<地址>` 可临时指定回传地址。</div>' +
      '<div class="card pad" style="max-width:760px">' +
      '<label class="fld" style="flex-direction:row;align-items:center;gap:10px"><span style="width:auto">启用成绩回传</span>' +
      '<select id="rEn"><option value="1"' + (r.enabled ? ' selected' : '') + '>开启</option><option value="0"' + (!r.enabled ? ' selected' : '') + '>关闭</option></select></label>' +
      '<label class="fld"><span>回传地址（接收 POST JSON 的接口）</span><input type="text" id="rUrl" placeholder="https://你的收集服务/api/score" value="' + esc(r.url) + '"></label>' +
      '<label class="fld"><span>回传密钥（可选，接口端校验；留空不校验）</span><input type="text" id="rSec" placeholder="与收集服务端一致的密钥" value="' + esc(r.secret) + '"></label>' +
      '<div style="display:flex;gap:10px;margin-top:6px"><button class="btn" id="rSave">保存设置</button>' +
      '<button class="btn ghost" id="rTest">发送测试成绩</button></div>' +
      '<div id="rMsg" style="margin-top:12px;font-size:13px"></div>' +
      '</div>' +
      '<div class="warnbox" style="max-width:760px;margin-top:14px">提示：本系统为纯前端静态页，收集服务需自行部署（见使用说明「集中收集成绩」一节）。可用随附的 <b>tools/collector.js</b>（零依赖 Node 服务），或将地址指向腾讯问卷 / 金数据等支持 Webhook 的表单。</div>';

    $('#rSave').onclick = function () {
      r.enabled = $('#rEn').value === '1';
      r.url = ($('#rUrl').value || '').trim();
      r.secret = ($('#rSec').value || '').trim();
      L.Bank.saveCfg().then(function () { ui().toast('已保存', 'ok'); });
    };
    $('#rTest').onclick = function () {
      var url = ($('#rUrl').value || '').trim();
      if (!url) return ui().toast('请先填写回传地址', 'err');
      var msg = $('#rMsg'); msg.textContent = '发送测试中…';
      var secret = ($('#rSec').value || '').trim();
      var sample = { app: '绿盾卫士培训考核系统', id: 'TEST' + Date.now().toString(36), ts: Date.now(), time: new Date().toISOString(), ns: 'keypost', mode: 'exam', title: '【测试】关键岗位人员考试', post: 'tech', category: '', name: '测试考生', no: '', dept: '', score: 88, total: 100, passScore: 70, pass: true, right: 30, wrong: 5, blank: 0, used: 600, switches: 0, auto: false, reason: '', detail: [] };
      var send = global.fetch
        ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Report-Token': secret }, body: JSON.stringify(sample) }).then(function (x) { if (!x.ok) throw new Error('HTTP ' + x.status); })
        : new Promise(function (res, rej) { var x = new XMLHttpRequest(); x.open('POST', url, true); x.setRequestHeader('Content-Type', 'application/json'); if (secret) x.setRequestHeader('X-Report-Token', secret); x.onreadystatechange = function () { if (x.readyState === 4) { if (x.status >= 200 && x.status < 300) res(); else rej(new Error('HTTP ' + x.status)); } }; x.onerror = function () { rej(new Error('网络错误')); }; x.send(JSON.stringify(sample)); });
      Promise.resolve(send).then(function () { msg.innerHTML = '<b style="color:var(--green-700)">✓ 测试发送成功</b>，请到收集服务端确认是否收到「测试考生」记录。'; })
        .catch(function (e) { msg.innerHTML = '<b style="color:var(--red)">✗ 发送失败：' + esc(String((e && e.message) || e)) + '</b>'; });
    };
  };

  function downloadTemplate() {
    var rows = [
      ['序号', '题型（必填）', '题干（必填）', '答案', '选项A', '选项B', '选项C', '选项D', '选项E', '知识点', '解析'],
      [1, '单选题', '检验检测机构应当依法独立开展检验检测活动，对其出具的检验检测数据、结果（ ）。', 'C', '仅承担说明责任', '不承担责任', '负责并承担相应法律责任', '由委托方承担责任', '', '资质认定管理办法', '《检验检测机构资质认定管理办法》第四条'],
      [2, '多选题', '下列属于检验检测机构关键岗位人员的有（ ）。', 'ABCD', '最高管理者', '技术负责人', '质量负责人', '授权签字人', '', '关键岗位', '《湖南省检验检测机构关键岗位人员管理办法》'],
      [3, '判断题', '判断题答案填 A 表示"对"，填 B 表示"错"，选项列可留空。', 'A', '对', '错', '', '', '', '填写说明', '']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 60 }, { wch: 8 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 30 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '题库模板');
    XLSX.writeFile(wb, '题库导入模板.xlsx');
  }

  global.LDWS.Admin = { enter: enter, downloadTemplate: downloadTemplate };
})(window);

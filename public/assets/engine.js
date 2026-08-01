/* ===========================================================
 *  engine.js —— 组卷 / 计分 / 考试会话
 *  组卷规则严格依据《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》4.2
 * =========================================================== */
(function (global) {
  'use strict';
  var L = global.LDWS;
  var OPTL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  /* ---------- 大纲规定的岗位组卷方案（首次考试） ---------- */
  // 结构：{ 科目: { 1:单选数, 2:多选数, 3:判断数 } }
  var POSTS = {
    top: {
      key: 'top', name: '最高管理者', focus: '侧重科目A',
      note: '接受科目 A、B 考试',
      plan: { A: { 1: 25, 2: 15, 3: 10 }, B: { 1: 5, 2: 5, 3: 5 } }
    },
    quality: {
      key: 'quality', name: '质量负责人', focus: '侧重科目B',
      note: '接受科目 A、B、C 考试',
      plan: { A: { 1: 10, 2: 5, 3: 5 }, B: { 1: 15, 2: 10, 3: 5 }, C: { 1: 5, 2: 5, 3: 5 } }
    },
    tech: {
      key: 'tech', name: '技术负责人', focus: '侧重科目C',
      note: '接受科目 A、B、C、D 考试',
      plan: { A: { 1: 5, 2: 5, 3: 2 }, B: { 1: 5, 2: 5, 3: 3 }, C: { 1: 12, 2: 6, 3: 6 }, D: { 1: 8, 2: 4, 3: 4 } }
    },
    signer: {
      key: 'signer', name: '授权签字人', focus: '侧重科目D',
      note: '接受科目 A、B、C、D 考试',
      plan: { A: { 1: 5, 2: 5, 3: 2 }, B: { 1: 5, 2: 5, 3: 3 }, C: { 1: 8, 2: 4, 3: 4 }, D: { 1: 12, 2: 6, 3: 6 } }
    }
  };
  // 首次考试分值：单选 1 分、多选 2 分、判断 2 分（合计 100 分）
  var SCORE_FIRST = { 1: 1, 2: 2, 3: 2 };
  // 扩领域考试：科目D 单选20×2、多选20×2、判断10×2（合计 100 分）
  var EXTEND_PLAN = { D: { 1: 20, 2: 20, 3: 10 } };
  var SCORE_EXTEND = { 1: 2, 2: 2, 3: 2 };

  var SUBJECT_NAME = {
    A: '科目A · 法律、法规、规章及相关规范性文件',
    B: '科目B · 质量管理基础及风险管理知识',
    C: '科目C · 检验检测通用技术基础',
    D: '科目D · 检验检测专业技术知识'
  };

  /* ---------- 工具 ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr, n) {
    if (n <= 0) return [];
    var c = arr.slice();
    shuffle(c);
    return c.slice(0, Math.min(n, c.length));
  }
  function shuffleOptions(q) {
    if (q.t === 3 || !q.o || q.o.length < 2) return q;
    var order = q.o.map(function (_, i) { return i; });
    shuffle(order);
    var newO = order.map(function (i) { return q.o[i]; });
    var ansIdx = q.a.split('').map(function (c) { return OPTL.indexOf(c); });
    var newA = [];
    order.forEach(function (orig, pos) { if (ansIdx.indexOf(orig) >= 0) newA.push(OPTL[pos]); });
    return { id: q.id, t: q.t, q: q.q, o: newO, a: newA.sort().join(''), k: q.k, e: q.e, c: q.c, s: q.s };
  }

  /* ---------- 组卷 ---------- */
  /**
   * spec = {
   *   mode:'first'|'extend'|'custom',
   *   post:'top'|..., 用于 first
   *   subjectBanks:{A:[ids],B:[ids],C:[ids],D:[ids]},  // 各科目可用题库 id
   *   plan / scoreMap  // custom 时自定义
   *   shuffleOptions:bool
   * }
   */
  function buildPaper(spec) {
    var plan, scoreMap, title, minutes;
    if (spec.mode === 'first') {
      var p = spec.planObj || (spec.post ? POSTS[spec.post] : null);
      plan = spec.plan || (p && p.plan) || p || {};
      scoreMap = SCORE_FIRST;
      title = '首次考试 · ' + (spec.postName || (p && p.name) || (spec.post && POSTS[spec.post] && POSTS[spec.post].name) || '自定义岗位');
      minutes = spec.minutes;
    } else if (spec.mode === 'extend') {
      plan = EXTEND_PLAN; scoreMap = SCORE_EXTEND;
      title = '扩领域考试 · 科目D';
      minutes = spec.minutes;
    } else {
      plan = spec.plan; scoreMap = spec.scoreMap || SCORE_FIRST;
      title = spec.title || '自定义考试';
      minutes = spec.minutes;
    }

    var pool = spec.pool;   // { A:[q...], B:[...], ... }
    var sections = [], all = [], warn = [];
    Object.keys(plan).forEach(function (sub) {
      var need = plan[sub];
      var qs = pool[sub] || [];
      var byT = { 1: [], 2: [], 3: [] };
      qs.forEach(function (q) { if (byT[q.t]) byT[q.t].push(q); });
      var got = [];
      [1, 2, 3].forEach(function (t) {
        var n = need[t] || 0;
        if (!n) return;
        var sel = pick(byT[t], n);
        if (sel.length < n) warn.push('科目' + sub + ' ' + L.Bank.typeName(t) + ' 题量不足（需 ' + n + ' 题，实有 ' + sel.length + ' 题）');
        got = got.concat(sel);
      });
      if (got.length) sections.push({ subject: sub, name: SUBJECT_NAME[sub] || ('科目' + sub), count: got.length });
      got.forEach(function (q) { all.push({ sub: sub, q: q }); });
    });

    // 按 单选 → 多选 → 判断 排序，同类型内打乱
    var ordered = [];
    [1, 2, 3].forEach(function (t) {
      var g = all.filter(function (x) { return x.q.t === t; });
      shuffle(g);
      ordered = ordered.concat(g);
    });

    var items = ordered.map(function (x, i) {
      var q = spec.shuffleOptions ? shuffleOptions(x.q) : x.q;
      return {
        no: i + 1, qid: q.id, sub: x.sub, t: q.t, q: q.q, o: q.o, a: q.a,
        k: q.k || '', e: q.e || '', score: scoreMap[q.t] || 1, bank: x.q.c || ''
      };
    });

    var total = items.reduce(function (s, x) { return s + x.score; }, 0);
    return {
      title: title, mode: spec.mode, post: spec.post || '', minutes: minutes,
      items: items, sections: sections, totalScore: total, warn: warn,
      counts: {
        1: items.filter(function (x) { return x.t === 1; }).length,
        2: items.filter(function (x) { return x.t === 2; }).length,
        3: items.filter(function (x) { return x.t === 3; }).length
      }
    };
  }

  /* ---------- 计分 ---------- */
  function grade(paper, answers, opt) {
    opt = opt || {};
    var detail = [], got = 0, right = 0, wrong = 0, blank = 0;
    paper.items.forEach(function (it, i) {
      var sel = (answers[i] || []).slice().sort().join('');
      var ok = sel === it.a && sel !== '';
      var sc = 0;
      if (ok) sc = it.score;
      else if (opt.halfForPartial && it.t === 2 && sel) {
        // 多选漏选（无错选）给一半分
        var selArr = sel.split(''), ansArr = it.a.split('');
        var noWrong = selArr.every(function (c) { return ansArr.indexOf(c) >= 0; });
        if (noWrong && selArr.length < ansArr.length) sc = Math.round(it.score / 2 * 10) / 10;
      }
      got += sc;
      if (!sel) blank++; else if (ok) right++; else wrong++;
      detail.push({ no: it.no, qid: it.qid, sub: it.sub, t: it.t, sel: sel, a: it.a, ok: ok, score: sc, full: it.score });
    });
    got = Math.round(got * 10) / 10;
    return {
      score: got, total: paper.totalScore, right: right, wrong: wrong, blank: blank,
      detail: detail
    };
  }

  /* ---------- 岗位说明 ---------- */
  function planSummary(plan) {
    return Object.keys(plan).map(function (s) {
      var p = plan[s];
      var seg = [];
      if (p[1]) seg.push('单选' + p[1]);
      if (p[2]) seg.push('多选' + p[2]);
      if (p[3]) seg.push('判断' + p[3]);
      return '科目' + s + '（' + seg.join('、') + '）';
    }).join('　');
  }

  global.LDWS.Engine = {
    POSTS: POSTS, SUBJECT_NAME: SUBJECT_NAME,
    SCORE_FIRST: SCORE_FIRST, SCORE_EXTEND: SCORE_EXTEND, EXTEND_PLAN: EXTEND_PLAN,
    buildPaper: buildPaper, grade: grade, shuffle: shuffle, pick: pick,
    shuffleOptions: shuffleOptions, planSummary: planSummary, OPTL: OPTL
  };
})(window);

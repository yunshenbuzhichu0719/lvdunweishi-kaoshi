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
   *
   * 新版岗位方案 plan 格式：
   * {
   *   kind:'position', name:'...', position:'...', minutes:120, scoreMap:{1:1,2:1,3:1}, pass:'all',
   *   subs:[
   *     { name:'安全专项', passMode:'percent'|'score', pass:100, n:{1:15,2:8,3:7}, ranges:{1:[51,80],2:[136,148],3:[189,208]} }
   *   ]
   * }
   */
  function numId(qid) {
    return parseInt((qid || '').replace(/^q0*/, '') || '0', 10);
  }

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

    var pool = spec.pool;   // 旧模式 { A:[q...], ... }；岗位模式为全部题目的数组
    var sections = [], all = [], warn = [];

    // ---------- 岗位模式（多专项，按题库 banks 抽题，回退按 id 范围抽题） ----------
    if (plan && plan.subs && plan.subs.length) {
      var allQs = Array.isArray(pool) ? pool : (pool.all || []);
      plan.subs.forEach(function (sub) {
        var got = [];
        [1, 2, 3].forEach(function (t) {
          var n = (sub.n && sub.n[t]) || 0;
          if (!n) return;
          var cand;
          if (sub.banks && sub.banks.length) {
            // 新版：从指定题库（题目 bank 字段匹配）按题型抽题
            cand = allQs.filter(function (q) {
              return q.t === t && sub.banks.indexOf(q.bank) >= 0;
            });
          } else {
            // 旧版：按题号范围（针对 D1 单一题库）抽题
            var range = (sub.ranges && sub.ranges[t]) || [];
            var lo = range[0] || 0, hi = range[1] || 0;
            cand = allQs.filter(function (q) {
              return q.t === t && numId(q.id) >= lo && numId(q.id) <= hi;
            });
          }
          var sel = pick(cand, n);
          if (sel.length < n) warn.push(sub.name + ' ' + L.Bank.typeName(t) + ' 题量不足（需 ' + n + ' 题，实有 ' + sel.length + ' 题）');
          got = got.concat(sel);
        });
        if (got.length) sections.push({ subject: sub.name, name: sub.name, count: got.length, meta: sub });
        got.forEach(function (q) { all.push({ sub: sub.name, q: q }); });
      });

      // 按专项顺序、专项内按 单选→多选→判断 排列
      var orderedPos = [];
      plan.subs.forEach(function (sub) {
        [1, 2, 3].forEach(function (t) {
          var g = all.filter(function (x) { return x.sub === sub.name && x.q.t === t; });
          shuffle(g);
          orderedPos = orderedPos.concat(g);
        });
      });

      var smPos = plan.scoreMap || scoreMap || { 1: 1, 2: 1, 3: 1 };
      var itemsPos = orderedPos.map(function (x, i) {
        var q = spec.shuffleOptions ? shuffleOptions(x.q) : x.q;
        return {
          no: i + 1, qid: q.id, sub: x.sub, t: q.t, q: q.q, o: q.o, a: q.a,
          k: q.k || '', e: q.e || '', score: smPos[q.t] || 1, bank: x.q.c || ''
        };
      });
      var totalPos = itemsPos.reduce(function (s, x) { return s + x.score; }, 0);
      return {
        title: title, mode: spec.mode, post: spec.post || '', minutes: minutes,
        items: itemsPos, sections: sections, totalScore: totalPos, warn: warn,
        planMeta: { kind: 'position', pass: plan.pass, subs: plan.subs, scoreMap: smPos },
        counts: {
          1: itemsPos.filter(function (x) { return x.t === 1; }).length,
          2: itemsPos.filter(function (x) { return x.t === 2; }).length,
          3: itemsPos.filter(function (x) { return x.t === 3; }).length
        }
      };
    }

    // ---------- 旧模式（按科目/题库抽题） ----------
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
    var res = {
      score: got, total: paper.totalScore, right: right, wrong: wrong, blank: blank,
      detail: detail
    };

    // 岗位模式：按子试卷分项评分并判定整体合格
    if (paper.planMeta && paper.planMeta.kind === 'position' && paper.planMeta.subs) {
      var subMap = {};
      paper.planMeta.subs.forEach(function (s) { subMap[s.name] = s; });
      var groups = {};
      paper.items.forEach(function (it) { groups[it.sub] = (groups[it.sub] || []).concat([it]); });
      var subs = [];
      Object.keys(groups).forEach(function (name) {
        var meta = subMap[name] || {};
        var its = groups[name];
        var subDetail = detail.filter(function (d) { return d.sub === name; });
        var sc = subDetail.reduce(function (s, d) { return s + d.score; }, 0);
        var tot = its.reduce(function (s, it) { return s + it.score; }, 0);
        var r = subDetail.filter(function (d) { return d.ok; }).length;
        var w = subDetail.filter(function (d) { return !d.ok && d.sel; }).length;
        var b = its.length - r - w;
        var rate = tot > 0 ? Math.round(sc / tot * 1000) / 10 : 0;
        var pass = false;
        if (meta.passMode === 'percent') pass = rate >= (meta.pass || 100);
        else pass = rate >= (meta.pass || 80);
        subs.push({ name: name, score: sc, total: tot, right: r, wrong: w, blank: b, rate: rate, pass: pass, passMode: meta.passMode, passValue: meta.pass });
      });
      res.subs = subs;
      res.passed = subs.every(function (s) { return s.pass; });
    } else if (opt.passScore != null) {
      res.passed = got >= opt.passScore;
    }
    return res;
  }

  /* ---------- 岗位说明 ---------- */
  function planSummary(plan) {
    if (plan && plan.subs && plan.subs.length) {
      return plan.subs.map(function (sub) {
        var seg = [];
        if (sub.n && sub.n[1]) seg.push('单选' + sub.n[1]);
        if (sub.n && sub.n[2]) seg.push('多选' + sub.n[2]);
        if (sub.n && sub.n[3]) seg.push('判断' + sub.n[3]);
        var req = sub.passMode === 'percent' ? '须 100% 正确' : '≥' + (sub.pass || 80) + '%';
        return sub.name + '（' + seg.join('、') + '，' + req + '）';
      }).join(' / ');
    }
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

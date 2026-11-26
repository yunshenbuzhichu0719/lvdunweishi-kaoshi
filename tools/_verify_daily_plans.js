/* 四模块日常考试方案配置自检（无需 jsdom，直接加载数据层与组卷引擎） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const mem = new Map();
const localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
const ctx = { console, Promise, JSON, Math, Date, setTimeout, clearTimeout, localStorage };
ctx.window = ctx;
vm.createContext(ctx);
['assets/store.js', 'data/bank-daily.js', 'assets/engine.js'].forEach(f => vm.runInContext(read(f), ctx));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };

(async () => {
  await ctx.window.LDWS.Bank.init();
  const Bank = ctx.window.LDWS.Bank;
  const Engine = ctx.window.LDWS.Engine;
  const cfg = Bank.cfg.daily;
  const plans = cfg.plans || [];

  ok(plans.length === 10, '岗位方案数=10（实为 ' + plans.length + '）');
  ok(cfg._plansV === 5, '方案迁移版本=5（实为 ' + cfg._plansV + '）');

  const positions = ['设备员','质量管理员','内审员','监督员','采样员','样品员','检测员','报告编制员','报告审核员','资料员'];
  const expect = {
    K1: { n: { 1: 20, 2: 10, 3: 10 }, sm: { 1: 2, 2: 4, 3: 2 }, pass: 80, full: 100, min: 50 },
    K2: { n: { 1: 20, 2: 10, 3: 10 }, sm: { 1: 2, 2: 4, 3: 2 }, pass: 80, full: 100, min: 50 },
    K3: { n: { 1: 30, 2: 20, 3: 15 }, sm: { 1: 1, 2: 2, 3: 2 }, pass: 70, full: 100, min: 80 },
    K4: { n: { 1: 30, 2: 20, 3: 15 }, sm: { 1: 1, 2: 2, 3: 2 }, pass: 70, full: 100, min: 80 }
  };
  let structOK = true, bankOK = true, paperOK = true;

  plans.forEach(p => {
    if (p.kind !== 'position' || positions.indexOf(p.position) < 0 || p.subs.length !== 4) structOK = false;
    p.subs.forEach(sub => {
      const code = (sub.name || '').slice(0, 2);
      const e = expect[code];
      if (!e) { structOK = false; return; }
      const n = sub.n || {};
      const sm = sub.scoreMap || {};
      const full = (n[1] || 0) * sm[1] + (n[2] || 0) * sm[2] + (n[3] || 0) * sm[3];
      if (n[1] !== e.n[1] || n[2] !== e.n[2] || n[3] !== e.n[3] ||
          sm[1] !== e.sm[1] || sm[2] !== e.sm[2] || sm[3] !== e.sm[3] ||
          sub.pass !== e.pass || full !== e.full || sub.minutes !== e.min) structOK = false;

      const id = 'D::' + p.position + '::' + code;
      if (!sub.banks || sub.banks.length !== 1 || sub.banks[0] !== id || !Bank._dailyIdx[id]) bankOK = false;

      const qs = Bank._dailyIdx[id] || [];
      const paper = Engine.buildPaper({
        mode: 'custom',
        title: p.position + ' · ' + sub.name,
        minutes: sub.minutes,
        plan: { kind: 'position', name: sub.name, subs: [sub], scoreMap: p.scoreMap, pass: 'all' },
        pool: qs,
        shuffleOptions: false
      });
      const answers = paper.items.map(it => it.a.split(''));
      const grade = Engine.grade(paper, answers);
      const counts = paper.counts || {};
      if (paper.warn.length || paper.items.length !== (e.n[1] + e.n[2] + e.n[3]) ||
          paper.totalScore !== 100 || grade.score !== 100 || !grade.subs[0].pass ||
          counts[1] !== e.n[1] || counts[2] !== e.n[2] || counts[3] !== e.n[3]) {
        paperOK = false;
        console.log('    异常: ' + p.position + ' ' + code + ' warn=' + JSON.stringify(paper.warn) +
          ' items=' + paper.items.length + ' total=' + paper.totalScore + ' got=' + grade.score);
      }
    });
  });
  ok(structOK, '10岗×4模块结构、题量、分值、合格线、时长全部正确');
  ok(bankOK, '40个模块题库ID均存在且映射正确');
  ok(paperOK, '40套模块卷均可组满、满分100、全对判定合格');

  console.log(fail ? ('\nFAILED: ' + fail) : '\nALL_OK');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });

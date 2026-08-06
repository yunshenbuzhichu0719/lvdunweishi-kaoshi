/* 自检脚本：加载真实内置题库 + engine.js，校验大纲随机组卷与计分 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.LDWS = { Bank: { typeName: function (t) { return ['', '单选题', '多选题', '判断题'][t] || '题目'; } } };

// 1) 加载题库数据包
const bankSrc = fs.readFileSync(path.join(ROOT, 'data', 'bank-keypost.js'), 'utf8');
eval(bankSrc);
const BANK = global.__KEYPOST_BANK__;

// 2) 加载 engine
const engineSrc = fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8');
eval(engineSrc);
const Engine = global.LDWS.Engine;

// 3) 按科目分组构建 pool
function buildPool(questions) {
  const pool = { A: [], B: [], C: [], D: [] };
  questions.forEach(q => { if (pool[q.s]) pool[q.s].push(q); });
  return pool;
}
const pool = buildPool(BANK.questions);

function countByType(arr) {
  const c = { 1: 0, 2: 0, 3: 0 };
  arr.forEach(q => { if (c[q.t] !== undefined) c[q.t]++; });
  return c;
}

console.log('=== 题库规模 ===');
console.log('总题数:', BANK.questions.length);
['A', 'B', 'C', 'D'].forEach(s => {
  const c = countByType(pool[s]);
  console.log(`  科目${s}: 单${c[1]} 多${c[2]} 判${c[3]} 合计${pool[s].length}`);
});

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  ❌ ' + msg); fail++; }
  else console.log('  ✅ ' + msg);
}

console.log('\n=== 首次考试组卷校验（大纲 4.2）===');
Object.keys(Engine.POSTS).forEach(post => {
  const p = Engine.POSTS[post];
  const paper = Engine.buildPaper({ mode: 'first', post: post, minutes: 90, pool: pool, shuffleOptions: false });
  const plan = p.plan;
  let ok = true, detail = [];
  Object.keys(plan).forEach(sub => {
    ['1', '2', '3'].forEach(t => {
      const need = plan[sub][t] || 0;
      if (!need) return;
      const got = paper.items.filter(it => it.sub === sub && it.t === +t).length;
      if (got !== need) { ok = false; detail.push(`科目${sub}${Engine.Bank.typeName(+t)}需${need}实${got}`); }
    });
  });
  const total = paper.items.reduce((s, x) => s + x.score, 0);
  console.log(`\n[${p.name}] 题数=${paper.items.length} 总分=${total} 警告=${paper.warn.length}`);
  if (paper.warn.length) paper.warn.forEach(w => console.log('    ⚠ ' + w));
  assert(ok && total === 100 && paper.warn.length === 0,
    `${p.name} 组卷配比/分值正确（${detail.join(';') || 'OK'}）`);
});

console.log('\n=== 扩领域考试（科目D）校验 ===');
const ext = Engine.buildPaper({ mode: 'extend', minutes: 60, pool: pool, shuffleOptions: false });
const need = Engine.EXTEND_PLAN.D;
let eok = true, ed = [];
['1', '2', '3'].forEach(t => {
  const got = ext.items.filter(it => it.sub === 'D' && it.t === +t).length;
  if (got !== need[t]) { eok = false; ed.push(`D${Engine.Bank.typeName(+t)}需${need[t]}实${got}`); }
});
const etot = ext.items.reduce((s, x) => s + x.score, 0);
assert(eok && etot === 100 && ext.warn.length === 0, `扩领域科目D 配比/分值正确（${ed.join(';') || 'OK'}）`);

console.log('\n=== 计分校验（全部答对应得满分）===');
// 首次考试 技术负责人
const tp = Engine.buildPaper({ mode: 'first', post: 'tech', minutes: 90, pool: pool, shuffleOptions: false });
const answersRight = tp.items.map(it => it.a.split(''));
const g1 = Engine.grade(tp, answersRight);
assert(g1.score === 100 && g1.right === tp.items.length, `全对得 ${g1.score} 分，正确 ${g1.right}/${tp.items.length}`);

// 选项乱序后仍可满分（乱序后 item.a 已是最新位置）
const tp2 = Engine.buildPaper({ mode: 'first', post: 'signer', minutes: 90, pool: pool, shuffleOptions: true });
const answersRight2 = tp2.items.map(it => it.a.split(''));
const g2 = Engine.grade(tp2, answersRight2);
assert(g2.score === 100, `选项乱序全对得 ${g2.score} 分`);

// 全错应得 0
const g3 = Engine.grade(tp, tp.items.map(() => []));
assert(g3.score === 0, `全空得 ${g3.score} 分`);

console.log('\n=== 结果 ===');
console.log(fail === 0 ? 'ALL PASS ✅' : (fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);

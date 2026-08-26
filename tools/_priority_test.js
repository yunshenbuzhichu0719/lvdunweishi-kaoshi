/* 验证 engine.js buildPaper 的「弱项优先」组卷逻辑：
 * 错题 ∪ 未刷过的题 应优先被抽中。 */
const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'assets', 'engine.js');
const code = fs.readFileSync(enginePath, 'utf8');

const window = { LDWS: { Bank: { typeName: function (t) { return 'T' + t; } } } };
// engine.js: (function(global){ ... })(window)
new Function('window', code)(window);
const Engine = window.LDWS.Engine;

// 构造 30 题：id q1..q30，题型按 1,2,3 循环
const all = [];
for (let i = 1; i <= 30; i++) {
  const t = ((i - 1) % 3) + 1;
  all.push({ id: 'q' + i, t: t, q: 'stem' + i, o: ['a', 'b', 'c', 'd'], a: 'A', bank: 'X', c: 'X', s: 'X' });
}

// 错题：q1,q2,q3 ；已刷：q1..q20 （q21..q30 未刷）
const wrongSet = {}; ['q1', 'q2', 'q3'].forEach(function (id) { wrongSet[id] = 1; });
const practicedSet = {}; for (let i = 1; i <= 20; i++) practicedSet['q' + i] = 1;

const pool = { X: all };
const spec = {
  mode: 'custom', title: 't', minutes: 60,
  plan: { X: { 1: 5, 2: 5, 3: 5 } },
  scoreMap: { 1: 1, 2: 1, 3: 1 }, pool: pool, shuffleOptions: false,
  wrongSet: wrongSet, practicedSet: practicedSet
};

const paper = Engine.buildPaper(spec);

function isWeak(id) { return !!wrongSet[id] || !practicedSet[id]; }

let pass = true;
function assert(cond, msg) {
  if (!cond) { pass = false; console.log('  ✗ ' + msg); }
  else console.log('  ✓ ' + msg);
}

[1, 2, 3].forEach(function (t) {
  const need = 5;
  const weakAvail = all.filter(function (q) { return q.t === t && isWeak(q.id); }).length;
  const items = paper.items.filter(function (x) { return x.t === t; });
  const weak = items.filter(function (x) { return isWeak(x.qid); }).length;
  assert(weak === Math.min(need, weakAvail),
    '题型' + t + ' 抽中弱项 = ' + weak + '（候选弱项 ' + weakAvail + '，期望 ' + Math.min(need, weakAvail) + '）');
});

const totalWeak = paper.items.filter(function (x) { return isWeak(x.qid); }).length;
const expTotal = [1, 2, 3].reduce(function (s, t) {
  const need = 5;
  const weakAvail = all.filter(function (q) { return q.t === t && isWeak(q.id); }).length;
  return s + Math.min(need, weakAvail);
}, 0);
assert(totalWeak === expTotal, '总弱项抽中 = ' + totalWeak + '（期望 ' + expTotal + '）');

// 对比：不启用优先时弱项数量应 <= 12（随机，不强制）
const paper2 = Engine.buildPaper({
  mode: 'custom', title: 't', minutes: 60,
  plan: { X: { 1: 5, 2: 5, 3: 5 } },
  scoreMap: { 1: 1, 2: 1, 3: 1 }, pool: pool, shuffleOptions: false,
  wrongSet: null, practicedSet: null
});
const weak2 = paper2.items.filter(function (x) { return isWeak(x.qid); }).length;
assert(paper2.items.length === 15, '未启用优先时组卷数量 = ' + paper2.items.length);
console.log('  · 未启用优先时弱项抽中 = ' + weak2 + '（随机，≤12 正常）');

console.log(pass ? '\nPRIORITY TEST PASS' : '\nPRIORITY TEST FAIL');
process.exit(pass ? 0 : 1);

/* 将桌面「17-水及涉水产品类」4 个 xls 题库合并进 data/bank-keypost.js */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('../assets/xlsx.full.min.js');

const SRC_DIR = 'C:/Users/A/Desktop/湖南省关键岗位人员管理办法/关键岗位人员考试公示题库/科目D/17-水及涉水产品类';
const MAJOR = '17-水及涉水产品类';
const BANK_FILE = path.join(__dirname, '..', 'data', 'bank-keypost.js');

// 1. 读取现有题库
const src = fs.readFileSync(BANK_FILE, 'utf8');
global.window = {};
eval(src);
const B = window.__KEYPOST_BANK__;

// 2. 若已存在同名 major，先移除旧数据（幂等重跑）
B.banks = B.banks.filter(b => b.major !== MAJOR);
B.questions = B.questions.filter(q => !q.c.startsWith('SD::' + MAJOR + '::'));

// 3. 解析 xls
const TYPE_MAP = { '单选题': 1, '多选题': 2, '判断题': 3 };
const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.xls')).sort();
let added = 0;

for (const f of files) {
  const name = f.replace(/\.xls$/i, '');
  const bid = 'SD::' + MAJOR + '::' + name;
  const wb = XLSX.read(fs.readFileSync(path.join(SRC_DIR, f)), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const n = { 1: 0, 2: 0, 3: 0 };

  rows.slice(1).forEach(r => {
    const q = String(r[2] || '').trim();
    if (!q) return;
    const t = TYPE_MAP[String(r[1] || '').trim()];
    if (!t) { console.warn('跳过未知题型:', f, r[1]); return; }
    let a = String(r[3] || '').toUpperCase().replace(/[^A-D]/g, '');
    let o;
    if (t === 3) {
      o = ['对', '错'];
      // xls 中答案 A=对 B=错，与现有库一致
    } else {
      o = [1, 2, 3, 4].map(i => String(r[i + 3] || '').trim()).filter(s => s !== '');
    }
    if (!o.length || !a) { console.warn('跳过不完整题:', f, q.slice(0, 30)); return; }
    const id = crypto.createHash('md5').update(bid + '|' + q).digest('hex').slice(0, 12);
    B.questions.push({ id, t, q, o, a, s: 'D', c: bid });
    n[t]++;
    added++;
  });

  B.banks.push({
    id: bid, subject: 'D', major: MAJOR, name,
    n1: n[1], n2: n[2], n3: n[3], total: n[1] + n[2] + n[3]
  });
  console.log(name, '单选', n[1], '多选', n[2], '判断', n[3]);
}

B.generated = '2026-10-28';
B.banks.sort((x, y) => (x.subject + (x.major || '') + x.name).localeCompare(y.subject + (y.major || '') + y.name, 'zh'));

// 4. 写回（保持原有单行格式）
fs.writeFileSync(BANK_FILE, 'window.__KEYPOST_BANK__=' + JSON.stringify(B) + ';\n', 'utf8');
console.log('新增题目:', added, '题库总数:', B.banks.length, '题目总数:', B.questions.length);

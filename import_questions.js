/**
 * 批量导入题库脚本
 * 读取 Downloads 目录下的所有科目 Excel 文件并导入数据库
 * 
 * Excel 格式：序号 | 题型 | 题干 | 答案 | 选项A | 选项B | 选项C | 选项D (| 选项E)
 * 科目/专业大类/领域 从文件名推断
 */
const XLSX = require('xlsx');
const path = require('path');
const { db, initDB } = require('./db');

initDB();

// 文件名 → { subject, domain, category }
const fileConfigs = [
  { file: '科目A.xlsx',                                           subject: 'A', domain: null,  category: null },
  { file: '科目B.xlsx',                                           subject: 'B', domain: null,  category: null },
  { file: '科目C.xlsx',                                           subject: 'C', domain: null,  category: null },
  { file: '科目D-1卫生化学参数.xlsx',                              subject: 'D', domain: '公共卫生', category: '卫生化学' },
  { file: '科目D-卫生-2微生物参数.xlsx',                            subject: 'D', domain: '公共卫生', category: '微生物' },
  { file: '科目D环境监测1-水（含大气降水）和废水参数.xlsx',           subject: 'D', domain: '环境监测', category: '水（含大气降水）和废水' },
  { file: '科目D环境监测2-环境空气和废气参数.xlsx',                  subject: 'D', domain: '环境监测', category: '环境空气和废气' },
  { file: '科目D环境监测3-土壤和水系沉积物参数.xlsx',                subject: 'D', domain: '环境监测', category: '土壤和水系沉积物' },
  { file: '科目D环境监测4-固体废物参数.xlsx',                        subject: 'D', domain: '环境监测', category: '固体废物' },
  { file: '科目D环境监测5-生物参数.xlsx',                            subject: 'D', domain: '环境监测', category: '生物' },
  { file: '科目D环境监测6-噪声参数.xlsx',                            subject: 'D', domain: '环境监测', category: '噪声' },
  { file: '科目D环境监测7-振动参数.xlsx',                            subject: 'D', domain: '环境监测', category: '振动' },
  { file: '科目D环境监测8-电离电磁辐射参数.xlsx',                    subject: 'D', domain: '环境监测', category: '电离电磁辐射' },
  { file: '科目D环境监测9-非道路移动机械排放污染物参数.xlsx',         subject: 'D', domain: '环境监测', category: '非道路移动机械排放污染物' },
  { file: '科目D环境监测10-油气回收参数.xlsx',                       subject: 'D', domain: '环境监测', category: '油气回收' },
  { file: '科目D环境监测11-海洋沉积物参数.xlsx',                     subject: 'D', domain: '环境监测', category: '海洋沉积物' },
  { file: '科目D环境监测12-生物体残留参数.xlsx',                     subject: 'D', domain: '环境监测', category: '生物体残留' },
];

const DOWNLOADS_DIR = 'E:\\综合部\\资质文件标准\\法律法规\\湖南省关键岗位人员管理办法\\题目（系统下载）';

// 清空旧题库
console.log('清空旧题库...');
db.prepare('DELETE FROM questions').run();

const insertStmt = db.prepare(`
  INSERT INTO questions (subject, type, category, domain, content, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function normalizeType(rawType) {
  const t = String(rawType || '').trim();
  if (t.includes('单选')) return '单选题';
  if (t.includes('多选')) return '多选题';
  if (t.includes('判断')) return '判断题';
  return null;
}

function normalizeAnswer(answer, type) {
  let a = String(answer || '').trim();
  if (!a) return '';

  if (type === '判断题') {
    if (['对', '正确', 'A', 'T', '√', 'true', 'TRUE', '是'].includes(a)) return 'A';
    if (['错', '错误', 'B', 'F', '×', 'false', 'FALSE', '否'].includes(a)) return 'B';
    // 尝试首字符
    const upper = a.toUpperCase().charAt(0);
    if (['A', 'B'].includes(upper)) return upper;
    return 'A';
  }

  if (type === '单选题') {
    return a.toUpperCase().replace(/[^A-E]/g, '').charAt(0) || '';
  }

  if (type === '多选题') {
    return a.toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
  }

  return a;
}

function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim();
    for (const kw of keywords) {
      if (h.includes(kw)) return i;
    }
  }
  return -1;
}

// 题型列关键词（兼容各种表头写法，包括直接用题型名称做表头）
const typeKeywords = ['题型', '单选', '多选', '判断'];

let totalImported = 0;
let totalErrors = 0;
const summary = [];

for (const cfg of fileConfigs) {
  const filePath = path.join(DOWNLOADS_DIR, cfg.file);

  try {
    const workbook = XLSX.readFile(filePath);
    let fileImported = 0;
    let fileErrors = 0;

    // 遍历所有 sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rows.length < 2) continue; // 跳过空 sheet

      const headers = rows[0];
      const colType = findColumn(headers, typeKeywords);
      const colContent = findColumn(headers, ['题干']);
      const colAnswer = findColumn(headers, ['答案']);
      const colA = findColumn(headers, ['选项A', 'A']);
      const colB = findColumn(headers, ['选项B', 'B']);
      const colC = findColumn(headers, ['选项C', 'C']);
      const colD = findColumn(headers, ['选项D', 'D']);
      const colE = findColumn(headers, ['选项E', 'E']);

      if (colType < 0 || colContent < 0 || colAnswer < 0) {
        console.log(`  [跳过sheet] ${cfg.file} / ${sheetName}: 找不到必要列`);
        continue;
      }

      let imported = 0;
      let errors = 0;

      const insertMany = db.transaction(() => {
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawType = row[colType];
          const type = normalizeType(rawType);
          if (!type) continue; // 跳过空行或未知题型

          const content = String(row[colContent] || '').trim();
          if (!content) continue;

          const rawAnswer = row[colAnswer];
          const answer = normalizeAnswer(rawAnswer, type);
          if (!answer) {
            errors++;
            continue;
          }

          const getOpt = (idx) => idx >= 0 ? String(row[idx] || '').trim() : '';
          let optA = getOpt(colA);
          let optB = getOpt(colB);
          let optC = getOpt(colC);
          let optD = getOpt(colD);
          let optE = getOpt(colE);

          if (type === '判断题') {
            if (!optA) optA = '正确';
            if (!optB) optB = '错误';
            optC = '';
            optD = '';
            optE = '';
          }

          insertStmt.run(
            cfg.subject, type, cfg.category, cfg.domain,
            content, optA, optB, optC, optD, optE || null,
            answer, ''
          );
          imported++;
        }
      });

      insertMany();
      fileImported += imported;
      fileErrors += errors;
      if (imported > 0) {
        console.log(`  [sheet: ${sheetName}] 导入 ${imported} 题`);
      }
    }

    totalImported += fileImported;
    totalErrors += fileErrors;
    console.log(`[OK] ${cfg.file}: 共导入 ${fileImported} 题${fileErrors ? `, ${fileErrors} 错误` : ''}`);
    summary.push({ file: cfg.file, imported: fileImported, errors: fileErrors, domain: cfg.domain, category: cfg.category });
  } catch (err) {
    console.log(`[错误] ${cfg.file}: ${err.message}`);
    summary.push({ file: cfg.file, imported: 0, errors: 0, reason: err.message });
  }
}

// 统计
console.log('\n========================================');
console.log('  导入完成！');
console.log('========================================');
console.log(`  总导入: ${totalImported} 题`);
console.log(`  总错误: ${totalErrors} 题`);
console.log('');

// 按科目统计
const stats = db.prepare(`
  SELECT subject, type, domain, COUNT(*) as count
  FROM questions GROUP BY subject, type, domain ORDER BY subject, type
`).all();

console.log('题库统计:');
let lastSubject = '';
for (const s of stats) {
  if (s.subject !== lastSubject) {
    console.log(`  科目${s.subject}:`);
    lastSubject = s.subject;
  }
  const domainStr = s.domain ? ` [${s.domain}]` : '';
  console.log(`    ${s.type}: ${s.count} 题${domainStr}`);
}

// 科目D按领域统计
const dStats = db.prepare(`
  SELECT domain, COUNT(*) as count FROM questions WHERE subject = 'D' GROUP BY domain
`).all();
if (dStats.length > 0) {
  console.log('\n科目D领域分布:');
  for (const d of dStats) {
    console.log(`  ${d.domain || '(无)'}: ${d.count} 题`);
  }
}

// 科目D按大类统计
const catStats = db.prepare(`
  SELECT category, domain, COUNT(*) as count FROM questions WHERE subject = 'D' GROUP BY category, domain ORDER BY domain, category
`).all();
if (catStats.length > 0) {
  console.log('\n科目D专业大类:');
  for (const c of catStats) {
    console.log(`  [${c.domain}] ${c.category}: ${c.count} 题`);
  }
}

console.log('');
process.exit(0);

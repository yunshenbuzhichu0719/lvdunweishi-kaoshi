/**
 * 湖南绿盾卫士检测技术有限公司 - 内部培训考核系统
 * 主服务器文件
 */
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const crypto = require('crypto');

const { db, initDB } = require('./db');
const {
  firstExamConfigs,
  getEffectivePosition,
  getFirstExamConfig,
  getExtendedExamConfig,
  calculateTotalScore,
  getTotalQuestionCount
} = require('./examConfig');

// 初始化数据库
initDB();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置
app.use(session({
  secret: 'green-shield-exam-2025-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时
    httpOnly: true
  }
}));

// 文件上传配置
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const fs = require('fs');

// ============ 中间件：认证检查 ============

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ============ 认证相关 API ============

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    position: user.position,
    concurrent_position: user.concurrent_position,
    employee_id: user.employee_id,
    department: user.department
  };

  res.json({ success: true, user: req.session.user });
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 获取当前用户信息
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '未登录' });
  }
  res.json({ user: req.session.user });
});

// 修改密码
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, user.id);
  res.json({ success: true });
});

// ============ 管理员：用户管理 API ============

// 获取用户列表
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, name, role, position, concurrent_position, employee_id, department, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ users });
});

// 创建用户
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, name, role, position, concurrent_position, employee_id, department } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: '用户名、密码和姓名为必填项' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password, name, role, position, concurrent_position, employee_id, department)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, hashedPassword, name, role || 'examinee', position || null,
    concurrent_position || null, employee_id || null, department || null);

  res.json({ success: true, id: result.lastInsertRowid });
});

// 更新用户
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, role, position, concurrent_position, employee_id, department, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare(`
      UPDATE users SET name=?, role=?, position=?, concurrent_position=?, employee_id=?, department=?, password=?
      WHERE id=?
    `).run(name, role, position, concurrent_position, employee_id, department, hashedPassword, id);
  } else {
    db.prepare(`
      UPDATE users SET name=?, role=?, position=?, concurrent_position=?, employee_id=?, department=?
      WHERE id=?
    `).run(name, role, position, concurrent_position, employee_id, department, id);
  }

  res.json({ success: true });
});

// 删除用户
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.user.id) {
    return res.status(400).json({ error: '不能删除当前登录的管理员账号' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ 管理员：题库管理 API ============

// 获取题库统计
app.get('/api/admin/questions/stats', requireAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT subject, type, COUNT(*) as count
    FROM questions GROUP BY subject, type
  `).all();

  const result = {};
  for (const row of stats) {
    if (!result[row.subject]) result[row.subject] = {};
    result[row.subject][row.type] = row.count;
  }

  // 科目D的专业大类统计
  const categories = db.prepare(`
    SELECT category, type, COUNT(*) as count
    FROM questions WHERE subject = 'D' AND category IS NOT NULL
    GROUP BY category, type
  `).all();

  const categoryStats = {};
  for (const row of categories) {
    if (!categoryStats[row.category]) categoryStats[row.category] = {};
    categoryStats[row.category][row.type] = row.count;
  }

  res.json({ stats: result, categories: categoryStats });
});

// 获取题目列表（分页）
app.get('/api/admin/questions', requireAdmin, (req, res) => {
  const { subject, type, category, page = 1, pageSize = 20 } = req.query;
  let where = '1=1';
  const params = [];

  if (subject) { where += ' AND subject = ?'; params.push(subject); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (category) { where += ' AND category = ?'; params.push(category); }

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const total = db.prepare(`SELECT COUNT(*) as count FROM questions WHERE ${where}`).get(...params).count;
  const questions = db.prepare(`
    SELECT * FROM questions WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ questions, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 删除单个题目
app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 按科目/类型批量删除
app.delete('/api/admin/questions', requireAdmin, (req, res) => {
  const { subject, type, category } = req.body;
  let where = '1=1';
  const params = [];

  if (subject) { where += ' AND subject = ?'; params.push(subject); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (category) { where += ' AND category = ?'; params.push(category); }

  const result = db.prepare(`DELETE FROM questions WHERE ${where}`).run(...params);
  res.json({ success: true, deleted: result.changes });
});

// 清空全部题库
app.delete('/api/admin/questions/all', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM questions').run();
  res.json({ success: true, deleted: result.changes });
});

// 上传Excel题库
app.post('/api/admin/questions/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const defaultSubject = req.body.subject || '';
    const defaultDomain = req.body.domain || '';
    const defaultCategory = req.body.category || '';
    let totalImported = 0;
    let totalErrors = [];

    // 遍历所有 sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rows.length < 2) continue;

      // 解析表头，建立列索引映射
      const headers = rows[0].map(h => String(h).trim());

      // 查找各列索引（兼容各种表头写法）
      const findCol = (keywords) => {
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i];
          for (const kw of keywords) {
            if (h.includes(kw)) return i;
          }
        }
        return -1;
      };

      const colSubject = findCol(['科目']);
      const colType = findCol(['题型', '单选', '多选', '判断']);
      const colContent = findCol(['题干']);
      const colAnswer = findCol(['答案', '正确答案']);
      const colA = findCol(['选项A', 'A']);
      const colB = findCol(['选项B', 'B']);
      const colC = findCol(['选项C', 'C']);
      const colD = findCol(['选项D', 'D']);
      const colE = findCol(['选项E', 'E']);
      const colCategory = findCol(['专业大类', '大类', '类别']);
      const colDomain = findCol(['领域']);
      const colExplanation = findCol(['解析', '说明']);

      // 必须包含的列
      if (colType < 0 || colContent < 0 || colAnswer < 0) {
        totalErrors.push(`Sheet "${sheetName}": 找不到必要列（题型/题干/答案）`);
        continue;
      }

      // 科目：优先从列读取，没有则用表单指定的
      const getSubject = (row) => {
        if (colSubject >= 0) {
          const s = String(row[colSubject] || '').trim().toUpperCase();
          if (['A', 'B', 'C', 'D'].includes(s)) return s;
        }
        return defaultSubject.toUpperCase();
      };

      const insertStmt = db.prepare(`
        INSERT INTO questions (subject, type, category, domain, content, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((dataRows) => {
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const subject = getSubject(row);
          const rawType = String(row[colType] || '').trim();
          const content = String(row[colContent] || '').trim();

          if (!subject || !rawType || !content) continue;

          // 标准化题型
          let type = rawType;
          if (rawType.includes('单选')) type = '单选题';
          else if (rawType.includes('多选')) type = '多选题';
          else if (rawType.includes('判断')) type = '判断题';

          if (!['单选题', '多选题', '判断题'].includes(type)) continue;
          if (!['A', 'B', 'C', 'D'].includes(subject)) continue;

          const getOpt = (idx) => idx >= 0 ? String(row[idx] || '').trim() : '';
          let optA = getOpt(colA);
          let optB = getOpt(colB);
          let optC = getOpt(colC);
          let optD = getOpt(colD);
          let optE = getOpt(colE);

          let correctAnswer = String(row[colAnswer] || '').trim();

          // 判断题特殊处理
          if (type === '判断题') {
            if (!optA) optA = '正确';
            if (!optB) optB = '错误';
            optC = ''; optD = ''; optE = '';
            if (['对', '正确', 'A', 'T', '√', 'true', 'TRUE', '是'].includes(correctAnswer)) correctAnswer = 'A';
            else if (['错', '错误', 'B', 'F', '×', 'false', 'FALSE', '否'].includes(correctAnswer)) correctAnswer = 'B';
          } else if (type === '单选题') {
            correctAnswer = correctAnswer.toUpperCase().replace(/[^A-E]/g, '').charAt(0);
          } else if (type === '多选题') {
            correctAnswer = correctAnswer.toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
          }

          if (!correctAnswer) {
            totalErrors.push(`Sheet "${sheetName}" 第${i + 2}行: 答案为空`);
            continue;
          }

          const category = colCategory >= 0 ? String(row[colCategory] || '').trim() : defaultCategory;
          const domain = colDomain >= 0 ? String(row[colDomain] || '').trim() : defaultDomain;
          const explanation = colExplanation >= 0 ? String(row[colExplanation] || '').trim() : '';

          insertStmt.run(
            subject, type, category || null, domain || null,
            content, optA, optB, optC, optD, optE || null,
            correctAnswer, explanation
          );
          totalImported++;
        }
      });

      insertMany(rows.slice(1));
    }

    // 删除上传的临时文件
    const fs = require('fs');
    fs.unlink(req.file.path, () => {});

    res.json({
      success: true,
      imported: totalImported,
      errors: totalErrors.slice(0, 20),
      totalErrors: totalErrors.length
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '文件解析失败: ' + err.message });
  }
});

// 下载Excel模板
app.get('/api/admin/questions/template', requireAdmin, (req, res) => {
  const templateData = [
    ['科目', '题型', '专业大类', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析'],
    ['A', '单选题', '', '《中华人民共和国计量法》是由（）发布的。', '全国人大常委会', '国务院', '国家质检总局', '国家计量局', 'A', '《计量法》由全国人大常委会制定发布'],
    ['A', '多选题', '', '下列属于检验检测机构资质认定评审准则中要求的有（）。', '公正性', '能力', '设施和设备', '管理体系', 'ABCD', '评审准则包含公正性、能力、设施和设备、管理体系等要求'],
    ['A', '判断题', '', '检验检测机构及其负责人对其出具的检验检测报告的真实性、准确性负责。', '正确', '错误', '', '', 'A', '根据《检验检测机构监督管理办法》规定'],
    ['B', '单选题', '', 'GB/T 19000-2016中提出了（）项质量管理原则。', '五', '六', '七', '八', 'C', 'GB/T 19000提出了七项质量管理原则'],
    ['C', '单选题', '', '测量结果与被测量真值之间的一致程度称为（）。', '精密度', '正确度', '准确度', '不确定度', 'C', '准确度是测量结果与真值的一致程度'],
    ['D', '单选题', '食品检测', '食品安全国家标准中，菌落总数的测定方法是（）。', 'GB 4789.2', 'GB 4789.3', 'GB 4789.4', 'GB 4789.10', 'A', 'GB 4789.2为菌落总数测定方法'],
    ['D', '判断题', '生态环境监测', '环境空气和废气采样时，应记录采样时的温度和大气压。', '正确', '错误', '', '', 'A', '采样时需记录温度和大气压以进行体积换算'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 50 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
    { wch: 10 }, { wch: 40 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '题库模板');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent('题库导入模板.xlsx')}`);
  res.send(buf);
});

// ============ 管理员：考试记录查看 API ============

app.get('/api/admin/exams', requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, position, result } = req.query;
  let where = '1=1';
  const params = [];

  if (position) { where += ' AND e.position = ?'; params.push(position); }
  if (result) { where += ' AND e.result = ?'; params.push(result); }

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM exams e WHERE ${where}
  `).get(...params).count;

  const exams = db.prepare(`
    SELECT e.*, u.name as user_name, u.username, u.employee_id, u.department
    FROM exams e JOIN users u ON e.user_id = u.id
    WHERE ${where}
    ORDER BY e.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ exams, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

app.get('/api/admin/exams/:id', requireAdmin, (req, res) => {
  const exam = db.prepare(`
    SELECT e.*, u.name as user_name, u.username, u.employee_id, u.department
    FROM exams e JOIN users u ON e.user_id = u.id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!exam) {
    return res.status(404).json({ error: '考试记录不存在' });
  }

  const questions = db.prepare(`
    SELECT eq.*, q.content, q.option_a, q.option_b, q.option_c, q.option_d,
           q.correct_answer, q.explanation
    FROM exam_questions eq
    JOIN questions q ON eq.question_id = q.id
    WHERE eq.exam_id = ?
    ORDER BY eq.order_num
  `).all(req.params.id);

  res.json({ exam, questions });
});

// ============ 考试相关 API ============

// 辅助函数：获取考试配置（新岗位从数据库读取科目配置）
function getExamConfigWithDB(effectivePosition) {
  const otherPositionNames = ['监督员', '设备员', '内审员', '报告审核员', '采样员', '检测员'];
  if (!otherPositionNames.includes(effectivePosition)) {
    return getFirstExamConfig(effectivePosition);
  }

  const posConfig = db.prepare('SELECT subjects FROM position_subjects WHERE position = ?').get(effectivePosition);
  if (!posConfig || !posConfig.subjects) {
    return null;
  }

  const configuredSubjects = posConfig.subjects.split(',').map(s => s.trim());
  const baseConfig = getFirstExamConfig(effectivePosition);

  const scorePerQuestion = baseConfig ? { ...baseConfig.scorePerQuestion } : { single: 1, multiple: 2, judge: 2 };
  const filteredConfig = {
    examType: baseConfig ? baseConfig.examType : '首次考试',
    duration: baseConfig ? baseConfig.duration : 90,
    subjects: {},
    scorePerQuestion
  };

  for (const subj of configuredSubjects) {
    if (baseConfig && baseConfig.subjects[subj]) {
      // 硬编码科目：直接使用预配置的题型数量
      filteredConfig.subjects[subj] = { ...baseConfig.subjects[subj] };
    } else {
      // 自定义科目（如"检测员"）：根据数据库实际题量动态生成配置
      const typeCounts = {};
      for (const typeName of ['单选题', '多选题', '判断题']) {
        const count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject = ? AND type = ?').get(subj, typeName).c;
        typeCounts[typeName] = count;
      }
      // 每题1分，单选全取，多选和判断全取
      const singleCount = typeCounts['单选题'] || 0;
      const multipleCount = typeCounts['多选题'] || 0;
      const judgeCount = typeCounts['判断题'] || 0;
      const totalQuestions = singleCount + multipleCount * 2 + judgeCount * 2;
      const totalScore = singleCount * scorePerQuestion.single + multipleCount * scorePerQuestion.multiple + judgeCount * scorePerQuestion.judge;

      if (totalQuestions === 0) continue;

      filteredConfig.subjects[subj] = {
        single: singleCount,
        multiple: multipleCount,
        judge: judgeCount,
        totalQuestions,
        totalScore
      };
    }
  }

  // 如果所有自定义科目都没有题，返回null
  if (Object.keys(filteredConfig.subjects).length === 0) {
    return null;
  }

  return filteredConfig;
}

// 获取可用的考试配置
app.get('/api/exam/config', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role === 'admin') {
    return res.json({ configs: [], message: '管理员无需参加考试' });
  }

  if (!user.position) {
    return res.json({ configs: [], message: '请联系管理员设置您的岗位信息' });
  }

  const effectivePosition = getEffectivePosition(user.position, user.concurrent_position);
  const config = getExamConfigWithDB(effectivePosition);

  if (!config) {
    return res.json({ configs: [], message: '您的岗位尚未配置考试科目，请联系管理员在"岗位科目配置"中设置' });
  }

  // 获取科目D的专业大类列表
  const categories = db.prepare(`
    SELECT DISTINCT category FROM questions
    WHERE subject = 'D' AND category IS NOT NULL AND category != ''
  `).all().map(r => r.category);

  // 检查题库是否充足
  const availability = {};
  const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题' };
  for (const [subject, counts] of Object.entries(config.subjects)) {
    availability[subject] = {};
    for (const [typeName, count] of Object.entries(counts)) {
      const dbType = typeMap[typeName];
      if (!dbType) continue; // 跳过 totalQuestions, totalScore 等非题型字段
      let query = 'SELECT COUNT(*) as count FROM questions WHERE subject = ? AND type = ?';
      const params = [subject, dbType];
      if (subject === 'D') {
        query += " AND category IS NOT NULL AND category != ''";
      }
      const available = db.prepare(query).get(...params).count;
      availability[subject][typeName] = { required: count, available };
    }
  }

  const totalQuestions = getTotalQuestionCount(config);
  const totalScore = calculateTotalScore(config);

  res.json({
    configs: [{
      examType: '首次考试',
      position: user.position,
      effectivePosition,
      concurrentPosition: user.concurrent_position,
      duration: config.duration,
      totalQuestions,
      totalScore,
      subjects: config.subjects,
      availability
    }],
    extendedExamAvailable: (user.position === '技术负责人' || user.position === '授权签字人' ||
      effectivePosition === '技术负责人' || effectivePosition === '授权签字人'),
    extendedConfig: {
      examType: '扩领域考试',
      duration: getExtendedExamConfig().duration,
      totalQuestions: getTotalQuestionCount(getExtendedExamConfig()),
      totalScore: calculateTotalScore(getExtendedExamConfig()),
      subjects: getExtendedExamConfig().subjects
    },
    categories
  });
});

// 获取所有其他岗位的考试配置
app.get('/api/exam/other-configs', requireAuth, (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.json({ positions: {} });
  }

  const otherPositionNames = ['监督员', '设备员', '内审员', '报告审核员', '采样员', '检测员'];
  const positions = {};

  for (const posName of otherPositionNames) {
    const config = getExamConfigWithDB(posName);
    if (!config) continue;

    const posConfig = db.prepare('SELECT subjects FROM position_subjects WHERE position = ?').get(posName);
    const subjects = posConfig ? posConfig.subjects.split(',').map(s => s.trim()) : [];

    // 检查题库充足性
    const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题' };
    let allAvailable = true;
    let totalQuestions = 0;

    for (const [subject, counts] of Object.entries(config.subjects)) {
      for (const [typeName, count] of Object.entries(counts)) {
        const dbType = typeMap[typeName];
        if (!dbType) continue;
        const available = db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject = ? AND type = ?').get(subject, dbType).c;
        if (available < count) allAvailable = false;
        totalQuestions += count;
      }
    }

    positions[posName] = {
      subjects,
      configured: subjects.length > 0,
      duration: config.duration,
      totalQuestions,
      totalScore: calculateTotalScore(config),
      available: allAvailable && totalQuestions > 0,
      subjectCounts: config.subjects
    };
  }

  res.json({ positions });
});

// 开始考试
app.post('/api/exam/start', requireAuth, (req, res) => {
  const user = req.session.user;
  const { examType, category, position: selectedPosition } = req.body;

  if (user.role === 'admin') {
    return res.status(403).json({ error: '管理员无需参加考试' });
  }

  if (!user.position) {
    return res.status(400).json({ error: '请联系管理员设置您的岗位信息' });
  }

  let config;
  let effectivePosition = null;

  if (examType === '首次考试') {
    effectivePosition = getEffectivePosition(user.position, user.concurrent_position);
    config = getExamConfigWithDB(effectivePosition);
    if (!config) {
      return res.status(400).json({ error: '您的岗位尚未配置考试科目，请联系管理员在"岗位科目配置"中设置' });
    }
  } else if (examType === '扩领域考试') {
    // 只有技术负责人和授权签字人可以参加扩领域考试
    const effPos = getEffectivePosition(user.position, user.concurrent_position);
    if (effPos !== '技术负责人' && effPos !== '授权签字人') {
      return res.status(403).json({ error: '只有技术负责人和授权签字人可以参加扩领域考试' });
    }
    config = getExtendedExamConfig();
    if (!category) {
      return res.status(400).json({ error: '请选择专业大类' });
    }
  } else if (examType === '其他岗位考试') {
    if (!selectedPosition) {
      return res.status(400).json({ error: '请选择岗位' });
    }
    const otherPositions = ['监督员', '设备员', '内审员', '报告审核员', '采样员', '检测员'];
    if (!otherPositions.includes(selectedPosition)) {
      return res.status(400).json({ error: '无效的岗位选择' });
    }
    effectivePosition = selectedPosition;
    config = getExamConfigWithDB(effectivePosition);
    if (!config) {
      return res.status(400).json({ error: '该岗位尚未配置考试科目，请联系管理员在"岗位科目配置"中设置' });
    }
  } else {
    return res.status(400).json({ error: '未知的考试类型' });
  }

  // 检查是否有进行中的考试
  const ongoing = db.prepare(`
    SELECT id FROM exams WHERE user_id = ? AND status = 'ongoing'
  `).get(user.id);
  if (ongoing) {
    return res.status(400).json({ error: '您有一场正在进行的考试，请先完成', examId: ongoing.id });
  }

  // 随机抽取题目
  const examQuestions = [];
  let orderNum = 0;
  const errors = [];

  for (const [subject, counts] of Object.entries(config.subjects)) {
    for (const [typeKey, count] of Object.entries(counts)) {
      const dbType = typeKey === 'single' ? '单选题' : typeKey === 'multiple' ? '多选题' : typeKey === 'judge' ? '判断题' : null;
      if (!dbType) continue; // 跳过 totalQuestions, totalScore 等非题型字段
      const scorePerQ = config.scorePerQuestion[typeKey];

      let query = 'SELECT * FROM questions WHERE subject = ? AND type = ?';
      const params = [subject, dbType];

      if (subject === 'D') {
        if (examType === '扩领域考试') {
          query += ' AND category = ?';
          params.push(category);
        } else {
          query += " AND category IS NOT NULL AND category != ''";
        }
      }

      query += ' ORDER BY RANDOM() LIMIT ?';
      params.push(count);

      const questions = db.prepare(query).all(...params);

      if (questions.length < count) {
        errors.push(`科目${subject} ${dbType}: 需要${count}道，题库仅有${questions.length}道`);
      }

      for (const q of questions) {
        orderNum++;
        examQuestions.push({
          question_id: q.id,
          subject,
          type: dbType,
          score: scorePerQ,
          order_num: orderNum,
          questionData: q
        });
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: '题库不足，无法组卷',
      details: errors
    });
  }

  // 创建考试记录
  const startTime = new Date().toISOString();
  const examResult = db.prepare(`
    INSERT INTO exams (user_id, exam_type, position, subject_d_category, start_time, duration, status, total_score)
    VALUES (?, ?, ?, ?, ?, ?, 'ongoing', ?)
  `).run(
    user.id, examType, effectivePosition || user.position,
    examType === '扩领域考试' ? category : null,
    startTime, config.duration, calculateTotalScore(config)
  );

  const examId = examResult.lastInsertRowid;

  // 保存题目
  const insertEq = db.prepare(`
    INSERT INTO exam_questions (exam_id, question_id, subject, type, score, order_num)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((eqs) => {
    for (const eq of eqs) {
      insertEq.run(examId, eq.question_id, eq.subject, eq.type, eq.score, eq.order_num);
    }
  });
  insertMany(examQuestions);

  // 返回考试数据（不包含正确答案）
  const questionsForClient = examQuestions.map(eq => {
    const q = eq.questionData;
    return {
      id: q.id,
      order: eq.order_num,
      subject: eq.subject,
      type: eq.type,
      score: eq.score,
      content: q.content,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d
    };
  });

  res.json({
    examId,
    startTime,
    duration: config.duration,
    totalQuestions: examQuestions.length,
    totalScore: calculateTotalScore(config),
    questions: questionsForClient
  });
});

// 获取考试历史（必须在 :id 路由之前定义）
app.get('/api/exam/history', requireAuth, (req, res) => {
  const exams = db.prepare(`
    SELECT * FROM exams WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);
  res.json({ exams });
});

// 获取考试内容（恢复考试用）
app.get('/api/exam/:id', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }
  if (exam.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: '无权访问' });
  }

  const questions = db.prepare(`
    SELECT eq.question_id as id, eq.subject, eq.type, eq.score, eq.order_num as "order",
           eq.user_answer,
           q.content, q.option_a, q.option_b, q.option_c, q.option_d
    FROM exam_questions eq
    JOIN questions q ON eq.question_id = q.id
    WHERE eq.exam_id = ?
    ORDER BY eq.order_num
  `).all(req.params.id);

  res.json({
    exam,
    questions: questions.map(q => ({
      ...q,
      user_answer: q.user_answer
    }))
  });
});

// 保存答题进度
app.post('/api/exam/:id/save', requireAuth, (req, res) => {
  const { answers } = req.body;
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: '考试不存在' });
  if (exam.status !== 'ongoing') return res.status(400).json({ error: '考试已结束' });

  const updateStmt = db.prepare(`
    UPDATE exam_questions SET user_answer = ?
    WHERE exam_id = ? AND question_id = ?
  `);

  const saveAll = db.transaction(() => {
    for (const [questionId, answer] of Object.entries(answers)) {
      updateStmt.run(answer, req.params.id, questionId);
    }
  });
  saveAll();

  res.json({ success: true });
});

// 提交考试（自动阅卷）
app.post('/api/exam/:id/submit', requireAuth, (req, res) => {
  const { answers = {}, submitReason = 'manual' } = req.body;
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);

  if (!exam) return res.status(404).json({ error: '考试不存在' });
  if (exam.status !== 'ongoing') return res.status(400).json({ error: '考试已结束' });

  // 保存答案
  const updateStmt = db.prepare(`
    UPDATE exam_questions SET user_answer = ?
    WHERE exam_id = ? AND question_id = ?
  `);
  const saveAll = db.transaction(() => {
    for (const [questionId, answer] of Object.entries(answers)) {
      updateStmt.run(answer, req.params.id, questionId);
    }
  });
  saveAll();

  // 自动阅卷
  const examQuestions = db.prepare(`
    SELECT eq.*, q.correct_answer
    FROM exam_questions eq
    JOIN questions q ON eq.question_id = q.id
    WHERE eq.exam_id = ?
  `).all(req.params.id);

  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const updateResult = db.prepare(`
    UPDATE exam_questions SET is_correct = ? WHERE id = ?
  `);

  const gradeAll = db.transaction(() => {
    for (const eq of examQuestions) {
      const userAnswer = eq.user_answer || '';

      if (!userAnswer) {
        unansweredCount++;
        updateResult.run(0, eq.id);
        continue;
      }

      let isCorrect = false;
      if (eq.type === '单选题') {
        isCorrect = userAnswer.toUpperCase().charAt(0) === eq.correct_answer.toUpperCase().charAt(0);
      } else if (eq.type === '多选题') {
        // 多选题：答案完全匹配（排序后比较）
        const normalized = userAnswer.toUpperCase().replace(/[^A-D]/g, '').split('').sort().join('');
        const correct = eq.correct_answer.toUpperCase().replace(/[^A-D]/g, '').split('').sort().join('');
        isCorrect = normalized === correct;
      } else if (eq.type === '判断题') {
        isCorrect = userAnswer.toUpperCase().charAt(0) === eq.correct_answer.toUpperCase().charAt(0);
      }

      if (isCorrect) {
        totalScore += eq.score;
        correctCount++;
        updateResult.run(1, eq.id);
      } else {
        wrongCount++;
        updateResult.run(0, eq.id);
      }
    }
  });
  gradeAll();

  const result = totalScore >= 70 ? '合格' : '不合格';
  const endTime = new Date().toISOString();

  db.prepare(`
    UPDATE exams
    SET status = ?, end_time = ?, score = ?, result = ?, submit_reason = ?
    WHERE id = ?
  `).run('submitted', endTime, totalScore, result, submitReason, req.params.id);

  res.json({
    success: true,
    score: totalScore,
    totalScore: exam.total_score,
    result,
    correctCount,
    wrongCount,
    unansweredCount,
    endTime
  });
});

// 更新切屏次数
app.post('/api/exam/:id/switch', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam || exam.status !== 'ongoing') {
    return res.json({ autoSubmit: false });
  }

  const newCount = exam.switch_count + 1;
  db.prepare('UPDATE exams SET switch_count = ? WHERE id = ?').run(newCount, req.params.id);

  if (newCount >= 3) {
    // 自动提交
    const examQuestions = db.prepare(`
      SELECT eq.*, q.correct_answer
      FROM exam_questions eq
      JOIN questions q ON eq.question_id = q.id
      WHERE eq.exam_id = ?
    `).all(req.params.id);

    let totalScore = 0;
    const updateResult = db.prepare(`UPDATE exam_questions SET is_correct = ? WHERE id = ?`);

    const gradeAll = db.transaction(() => {
      for (const eq of examQuestions) {
        const userAnswer = eq.user_answer || '';
        if (!userAnswer) {
          updateResult.run(0, eq.id);
          continue;
        }
        let isCorrect = false;
        if (eq.type === '单选题' || eq.type === '判断题') {
          isCorrect = userAnswer.toUpperCase().charAt(0) === eq.correct_answer.toUpperCase().charAt(0);
        } else if (eq.type === '多选题') {
          const normalized = userAnswer.toUpperCase().replace(/[^A-D]/g, '').split('').sort().join('');
          const correct = eq.correct_answer.toUpperCase().replace(/[^A-D]/g, '').split('').sort().join('');
          isCorrect = normalized === correct;
        }
        if (isCorrect) {
          totalScore += eq.score;
          updateResult.run(1, eq.id);
        } else {
          updateResult.run(0, eq.id);
        }
      }
    });
    gradeAll();

    const result = totalScore >= 70 ? '合格' : '不合格';
    db.prepare(`
      UPDATE exams SET status = 'auto_submitted', end_time = ?, score = ?, result = ?,
      submit_reason = '切屏超过3次自动提交', switch_count = ?
      WHERE id = ?
    `).run(new Date().toISOString(), totalScore, result, newCount, req.params.id);

    return res.json({
      autoSubmit: true,
      switchCount: newCount,
      score: totalScore,
      result
    });
  }

  res.json({ autoSubmit: false, switchCount: newCount });
});

// 获取考试结果
app.get('/api/exam/:id/result', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: '考试不存在' });
  if (exam.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: '无权访问' });
  }

  const questions = db.prepare(`
    SELECT eq.*, q.content, q.option_a, q.option_b, q.option_c, q.option_d,
           q.correct_answer, q.explanation
    FROM exam_questions eq
    JOIN questions q ON eq.question_id = q.id
    WHERE eq.exam_id = ?
    ORDER BY eq.order_num
  `).all(req.params.id);

  res.json({ exam, questions });
});

// ============ 资料库 API ============

// 确保资料目录存在
const materialsDir = path.join(__dirname, 'materials');
if (!fs.existsSync(materialsDir)) {
  fs.mkdirSync(materialsDir, { recursive: true });
}

// 文件上传配置（资料库专用）
const materialUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, materialsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeName = Buffer.from(file.originalname, 'utf8').toString('utf8')
        .replace(/[^\w\u4e00-\u9fff.-]/g, '_');
      cb(null, `${Date.now()}_${safeName}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// 根据文件类型返回 Content-Type
function getContentType(filetype, filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 生成随机下载码（格式：LDSV-XXXX-XXXX，排除易混淆字符）
function generateDownloadCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const segment = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `LDSV-${segment(4)}-${segment(4)}`;
}

// 获取资料列表（学员端）
app.get('/api/materials', requireAuth, (req, res) => {
  const materials = db.prepare(`
    SELECT id, title, filename, filetype, filesize, description, category, created_at
    FROM materials ORDER BY created_at DESC
  `).all();
  res.json({ materials });
});

// 在线查看资料（浏览器内打开，无需下载码）
app.get('/api/materials/:id/view', requireAuth, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!material) {
    return res.status(404).json({ error: '文件不存在' });
  }
  if (!fs.existsSync(material.filepath)) {
    return res.status(404).json({ error: '文件已被删除' });
  }
  // 以 inline 方式发送，浏览器直接预览
  // 安全头：禁止缓存、禁止下载工具抓取
  res.setHeader('Content-Type', getContentType(material.filetype, material.filename));
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(material.filename) + '"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const fileStream = fs.createReadStream(material.filepath);
  fileStream.pipe(res);
});

// 下载资料（需要下载码验证）
app.post('/api/materials/:id/download', requireAuth, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!material) {
    return res.status(404).json({ error: '文件不存在' });
  }
  if (!fs.existsSync(material.filepath)) {
    return res.status(404).json({ error: '文件已被删除' });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(403).json({ error: '请输入下载码' });
  }

  // 验证下载码
  const codeRecord = db.prepare('SELECT * FROM download_codes WHERE code = ?').get(code.trim().toUpperCase());
  if (!codeRecord) {
    return res.status(403).json({ error: '下载码不存在' });
  }
  if (codeRecord.status !== 'active') {
    return res.status(403).json({ error: '下载码已失效' });
  }
  if (codeRecord.used_count >= codeRecord.max_uses) {
    return res.status(403).json({ error: '下载码使用次数已用完' });
  }
  if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
    return res.status(403).json({ error: '下载码已过期' });
  }

  // 验证通过，记录使用
  db.prepare('UPDATE download_codes SET used_count = used_count + 1 WHERE id = ?').run(codeRecord.id);
  if (codeRecord.used_count + 1 >= codeRecord.max_uses) {
    db.prepare('UPDATE download_codes SET status = ? WHERE id = ?').run('used', codeRecord.id);
  }
  db.prepare(`
    INSERT INTO download_code_usage (code_id, material_id, user_id)
    VALUES (?, ?, ?)
  `).run(codeRecord.id, material.id, req.session.user.id);

  // 返回文件
  res.download(material.filepath, material.filename);
});

// 管理员：获取资料列表
app.get('/api/admin/materials', requireAdmin, (req, res) => {
  const materials = db.prepare(`
    SELECT m.*, u.name as uploader_name
    FROM materials m LEFT JOIN users u ON m.uploaded_by = u.id
    ORDER BY m.created_at DESC
  `).all();
  res.json({ materials });
});

// 管理员：上传资料
app.post('/api/admin/materials/upload', requireAdmin, materialUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }

  const { title, description, category } = req.body;
  const ext = path.extname(req.file.originalname).toLowerCase();
  let filetype = 'other';
  if (['.doc', '.docx'].includes(ext)) filetype = 'word';
  else if (['.xls', '.xlsx'].includes(ext)) filetype = 'excel';
  else if (['.pdf'].includes(ext)) filetype = 'pdf';

  const result = db.prepare(`
    INSERT INTO materials (title, filename, filepath, filetype, filesize, description, category, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title || req.file.originalname,
    req.file.originalname,
    req.file.path,
    filetype,
    req.file.size,
    description || null,
    category || null,
    req.session.user.id
  );

  res.json({ success: true, id: result.lastInsertRowid, filetype });
});

// 管理员：删除资料
app.delete('/api/admin/materials/:id', requireAdmin, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!material) {
    return res.status(404).json({ error: '文件不存在' });
  }

  // 删除物理文件
  if (material.filepath && fs.existsSync(material.filepath)) {
    fs.unlink(material.filepath, () => {});
  }

  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 管理员：直接下载资料（无需下载码）
app.get('/api/admin/materials/:id/download', requireAdmin, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!material) {
    return res.status(404).json({ error: '文件不存在' });
  }
  if (!fs.existsSync(material.filepath)) {
    return res.status(404).json({ error: '文件已被删除' });
  }
  res.download(material.filepath, material.filename);
});

// ============ 下载码管理 API ============

// 管理员：生成下载码
app.post('/api/admin/codes/generate', requireAdmin, (req, res) => {
  const { count = 1, maxUses = 1, expiresDays = 0, remark = '' } = req.body;
  const numCount = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const numMaxUses = Math.min(Math.max(parseInt(maxUses) || 1, 1), 999);
  const numExpiresDays = parseInt(expiresDays) || 0;

  let expiresAt = null;
  if (numExpiresDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + numExpiresDays);
    expiresAt = d.toISOString();
  }

  const codes = [];
  const insertStmt = db.prepare(`
    INSERT INTO download_codes (code, max_uses, expires_at, remark, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < numCount; i++) {
    let code, attempts = 0;
    do {
      code = generateDownloadCode();
      attempts++;
      if (attempts > 10) break;
    } while (db.prepare('SELECT id FROM download_codes WHERE code = ?').get(code));

    insertStmt.run(code, numMaxUses, expiresAt, remark || null, req.session.user.id);
    codes.push({
      code,
      max_uses: numMaxUses,
      expires_at: expiresAt,
      remark: remark || null
    });
  }

  res.json({ success: true, codes });
});

// 管理员：获取下载码列表
app.get('/api/admin/codes', requireAdmin, (req, res) => {
  const codes = db.prepare(`
    SELECT dc.*, u.name as creator_name,
      (SELECT COUNT(*) FROM download_code_usage dcu WHERE dcu.code_id = dc.id) as actual_uses
    FROM download_codes dc
    LEFT JOIN users u ON dc.created_by = u.id
    ORDER BY dc.created_at DESC
  `).all();
  res.json({ codes });
});

// 管理员：禁用下载码
app.patch('/api/admin/codes/:id/disable', requireAdmin, (req, res) => {
  const code = db.prepare('SELECT * FROM download_codes WHERE id = ?').get(req.params.id);
  if (!code) {
    return res.status(404).json({ error: '下载码不存在' });
  }
  db.prepare('UPDATE download_codes SET status = ? WHERE id = ?').run('disabled', req.params.id);
  res.json({ success: true });
});

// 管理员：删除下载码
app.delete('/api/admin/codes/:id', requireAdmin, (req, res) => {
  const code = db.prepare('SELECT * FROM download_codes WHERE id = ?').get(req.params.id);
  if (!code) {
    return res.status(404).json({ error: '下载码不存在' });
  }
  db.prepare('DELETE FROM download_code_usage WHERE code_id = ?').run(req.params.id);
  db.prepare('DELETE FROM download_codes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 管理员：查看下载码使用记录
app.get('/api/admin/codes/:id/usage', requireAdmin, (req, res) => {
  const records = db.prepare(`
    SELECT dcu.*, m.title as material_title, m.filename, u.name as user_name
    FROM download_code_usage dcu
    LEFT JOIN materials m ON dcu.material_id = m.id
    LEFT JOIN users u ON dcu.user_id = u.id
    WHERE dcu.code_id = ?
    ORDER BY dcu.used_at DESC
  `).all(req.params.id);
  res.json({ records });
});

// ============ 岗位科目配置 API ============

// 获取所有可用科目列表
app.get('/api/admin/subjects', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT subject FROM questions ORDER BY subject`).all();
  const subjects = rows.map(r => r.subject).filter(Boolean);
  res.json({ subjects });
});

// 管理员：获取所有岗位的刷题科目配置
app.get('/api/admin/position-subjects', requireAdmin, (req, res) => {
  const configs = db.prepare('SELECT * FROM position_subjects').all();
  const result = {};
  for (const c of configs) {
    result[c.position] = c.subjects.split(',').map(s => s.trim());
  }
  res.json({ configs: result });
});

// 管理员：设置岗位刷题科目
app.post('/api/admin/position-subjects', requireAdmin, (req, res) => {
  const { position, subjects } = req.body;
  if (!position) {
    return res.status(400).json({ error: '请指定岗位' });
  }
  if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: '请至少选择一个科目' });
  }
  const subjectsStr = subjects.join(',');
  db.prepare(`
    INSERT INTO position_subjects (position, subjects, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(position) DO UPDATE SET
      subjects = excluded.subjects,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(position, subjectsStr, req.session.user.id);
  res.json({ success: true });
});

// 管理员：取消岗位科目配置（清除配置）
app.delete('/api/admin/position-subjects/:position', requireAdmin, (req, res) => {
  const { position } = req.params;
  if (!position) {
    return res.status(400).json({ error: '请指定岗位' });
  }
  const result = db.prepare('DELETE FROM position_subjects WHERE position = ?').run(position);
  if (result.changes > 0) {
    res.json({ success: true, message: '配置已清除' });
  } else {
    res.json({ success: true, message: '该岗位未配置，无需清除' });
  }
});

// 获取刷题配置（可用科目、领域、大类、题型及题量）
app.get('/api/practice/config', requireAuth, (req, res) => {
  // 各科目题型统计
  const subjects = ['A', 'B', 'C', 'D'];
  const types = ['单选题', '多选题', '判断题'];
  const result = {};

  for (const subj of subjects) {
    result[subj] = { types: {}, domains: {} };
    for (const t of types) {
      const count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject = ? AND type = ?').get(subj, t).c;
      result[subj].types[t] = count;
    }
  }

  // 科目D的领域和大类统计
  const domains = db.prepare(`
    SELECT domain, type, COUNT(*) as c FROM questions WHERE subject = 'D' AND domain IS NOT NULL GROUP BY domain, type
  `).all();
  for (const d of domains) {
    if (!result['D'].domains[d.domain]) {
      result['D'].domains[d.domain] = { types: {}, categories: {} };
    }
    result['D'].domains[d.domain].types[d.type] = d.c;
  }

  // 科目D各大类统计
  const categories = db.prepare(`
    SELECT category, domain, type, COUNT(*) as c FROM questions WHERE subject = 'D' AND category IS NOT NULL GROUP BY category, domain, type
  `).all();
  for (const c of categories) {
    if (!result['D'].domains[c.domain]?.categories[c.category]) {
      result['D'].domains[c.domain].categories[c.category] = { types: {} };
    }
    result['D'].domains[c.domain].categories[c.category].types[c.type] = c.c;
  }

  // 其他岗位的科目配置和题量统计（从数据库读取管理员配置的科目）
  const otherPositions = {};
  const otherPositionNames = ['监督员', '设备员', '内审员', '报告审核员', '采样员', '检测员'];

  // 从数据库读取岗位科目配置
  const posSubjectConfigs = db.prepare('SELECT * FROM position_subjects').all();
  const posSubjectMap = {};
  for (const psc of posSubjectConfigs) {
    posSubjectMap[psc.position] = psc.subjects.split(',').map(s => s.trim());
  }

  for (const posName of otherPositionNames) {
    // 优先使用数据库配置，未配置时默认为空数组（不显示题库）
    const posSubjects = posSubjectMap[posName] || [];
    const subjectCounts = {};
    let posTotal = 0;

    for (const subj of posSubjects) {
      const subjInfo = { types: {}, total: 0 };
      for (const t of types) {
        const count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject = ? AND type = ?').get(subj, t).c;
        subjInfo.types[t] = count;
        subjInfo.total += count;
      }
      subjectCounts[subj] = subjInfo;
      posTotal += subjInfo.total;
    }

    otherPositions[posName] = {
      subjects: posSubjects,
      subjectCounts: subjectCounts,
      totalQuestions: posTotal,
      configured: posSubjects.length > 0
    };
  }

  res.json({ subjects: result, positions: otherPositions });
});

// 获取刷题题目
app.get('/api/practice/questions', requireAuth, (req, res) => {
  const { subject, subjects, type, domain, category, limit = 50, mode = 'random' } = req.query;
  const userId = req.session.user.id;

  // 支持多科目（逗号分隔）或单科目
  let subjectList = [];
  if (subjects) {
    subjectList = subjects.split(',').map(s => s.trim()).filter(Boolean);
  } else if (subject) {
    subjectList = [subject];
  }

  if (subjectList.length === 0) {
    return res.status(400).json({ error: '请选择科目' });
  }

  // 构建 IN 查询
  const subjectPlaceholders = subjectList.map(() => '?').join(',');
  let query = `SELECT * FROM questions WHERE subject IN (${subjectPlaceholders})`;
  const params = [...subjectList];

  if (type && type !== '全部') {
    query += ' AND type = ?';
    params.push(type);
  }

  // 仅当单科目D时支持领域和大类筛选
  if (subjectList.length === 1 && subjectList[0] === 'D') {
    if (domain) {
      query += ' AND domain = ?';
      params.push(domain);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
  }

  // 获取该用户已练习过的题目ID（用于顺序模式下跳过已做过的，或错题模式下仅做错过的）
  let practicedIds = [];
  let wrongIds = [];

  if (mode === 'sequential') {
    const practicedPlaceholders = subjectList.map(() => '?').join(',');
    practicedIds = db.prepare(`
      SELECT DISTINCT question_id FROM practice_records WHERE user_id = ? AND subject IN (${practicedPlaceholders})
    `).all(userId, ...subjectList).map(r => r.question_id);
  } else if (mode === 'wrong') {
    // 刷错题模式：只查询用户做错的题目
    const wrongSubjectPlaceholders = subjectList.map(() => '?').join(',');
    let wrongQuery = `
      SELECT DISTINCT pr.question_id FROM practice_records pr
      JOIN questions q ON pr.question_id = q.id
      WHERE pr.user_id = ? AND pr.is_correct = 0 AND q.subject IN (${wrongSubjectPlaceholders})
    `;
    const wrongParams = [userId, ...subjectList];
    if (type && type !== '全部') {
      wrongQuery += ' AND q.type = ?';
      wrongParams.push(type);
    }
    if (subjectList.length === 1 && subjectList[0] === 'D') {
      if (domain) {
        wrongQuery += ' AND q.domain = ?';
        wrongParams.push(domain);
      }
      if (category) {
        wrongQuery += ' AND q.category = ?';
        wrongParams.push(category);
      }
    }
    wrongIds = db.prepare(wrongQuery).all(...wrongParams).map(r => r.question_id);
  }

  if (mode === 'wrong') {
    if (wrongIds.length === 0) {
      return res.json({ questions: [], total: 0, message: '暂无错题记录，请先进行刷题练习' });
    }
    // 只查询做错的题目
    const placeholders = wrongIds.map(() => '?').join(',');
    query += ` AND id IN (${placeholders})`;
    params.push(...wrongIds);
    query += ' ORDER BY RANDOM()';
  } else if (mode === 'sequential' && practicedIds.length > 0) {
    // 找到用户还没做过的题
    const placeholders = practicedIds.map(() => '?').join(',');
    query += ` AND id NOT IN (${placeholders})`;
    params.push(...practicedIds);
    query += ' ORDER BY id ASC';
  } else {
    query += ' ORDER BY RANDOM()';
  }

  query += ' LIMIT ?';
  params.push(parseInt(limit));

  const questions = db.prepare(query).all(...params);

  // 返回题目（包含正确答案和解析，刷题模式可见）
  res.json({
    questions: questions.map(q => ({
      id: q.id,
      subject: q.subject,
      type: q.type,
      category: q.category,
      domain: q.domain,
      content: q.content,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      correct_answer: q.correct_answer,
      explanation: q.explanation
    })),
    total: questions.length,
    practicedCount: practicedIds.length
  });
});

// 提交刷题答案（单题）
app.post('/api/practice/check', requireAuth, (req, res) => {
  const { questionId, userAnswer } = req.body;
  const userId = req.session.user.id;

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }

  let isCorrect = false;
  if (question.type === '单选题' || question.type === '判断题') {
    isCorrect = (userAnswer || '').toUpperCase().charAt(0) === question.correct_answer.toUpperCase().charAt(0);
  } else if (question.type === '多选题') {
    const normalized = (userAnswer || '').toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
    const correct = question.correct_answer.toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
    isCorrect = normalized === correct;
  }

  // 记录刷题结果
  db.prepare(`
    INSERT INTO practice_records (user_id, subject, domain, category, question_id, user_answer, is_correct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, question.subject, question.domain, question.category, questionId, userAnswer || '', isCorrect ? 1 : 0);

  res.json({
    isCorrect,
    correctAnswer: question.correct_answer,
    explanation: question.explanation || ''
  });
});

// 获取刷题统计
app.get('/api/practice/stats', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const stats = db.prepare(`
    SELECT pr.subject, q.type, COUNT(*) as total, SUM(pr.is_correct) as correct
    FROM practice_records pr
    JOIN questions q ON pr.question_id = q.id
    WHERE pr.user_id = ?
    GROUP BY pr.subject, q.type
  `).all(userId);

  const totalPracticed = db.prepare('SELECT COUNT(*) as c FROM practice_records WHERE user_id = ?').get(userId).c;
  const totalCorrect = db.prepare('SELECT COALESCE(SUM(is_correct),0) as c FROM practice_records WHERE user_id = ?').get(userId).c;

  res.json({
    stats,
    totalPracticed,
    totalCorrect,
    accuracy: totalPracticed > 0 ? Math.round(totalCorrect / totalPracticed * 100) : 0
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  湖南绿盾卫士检测技术有限公司`);
  console.log(`  内部培训考核系统已启动`);
  console.log(`========================================`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  管理员账号: admin / admin123`);
  console.log(`========================================\n`);
});

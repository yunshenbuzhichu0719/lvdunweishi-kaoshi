/**
 * 数据库初始化与操作模块
 */
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'exam.db');
const db = new Database(DB_PATH);

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');

function initDB() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'examinee',
      position TEXT,
      concurrent_position TEXT,
      employee_id TEXT,
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 题库表
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      domain TEXT,
      content TEXT NOT NULL,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      option_e TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 兼容旧数据库：如果 questions 表缺少 domain / option_e 列则自动添加
  try {
    db.prepare('SELECT domain FROM questions LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE questions ADD COLUMN domain TEXT');
    console.log('[DB] 已添加 questions.domain 列');
  }
  try {
    db.prepare('SELECT option_e FROM questions LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE questions ADD COLUMN option_e TEXT');
    console.log('[DB] 已添加 questions.option_e 列');
  }

  // 刷题记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      domain TEXT,
      category TEXT,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      is_correct INTEGER,
      practiced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // 考试记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_type TEXT NOT NULL,
      position TEXT,
      subject_d_category TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER NOT NULL,
      status TEXT DEFAULT 'ongoing',
      total_score INTEGER DEFAULT 100,
      score INTEGER,
      result TEXT,
      switch_count INTEGER DEFAULT 0,
      submit_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 考试题目表（每场考试抽取的题目及作答记录）
  db.exec(`
    CREATE TABLE IF NOT EXISTS exam_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      type TEXT NOT NULL,
      score INTEGER NOT NULL,
      order_num INTEGER NOT NULL,
      user_answer TEXT,
      is_correct INTEGER,
      FOREIGN KEY (exam_id) REFERENCES exams(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // 资料库表（后台上传的Word/Excel/PDF文件）
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filetype TEXT NOT NULL,
      filesize INTEGER,
      description TEXT,
      category TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // 下载码表（管理员生成，学员下载资料时验证）
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at DATETIME,
      status TEXT DEFAULT 'active',
      remark TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 下载码使用记录表（审计追踪每次下载）
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_code_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      user_id INTEGER,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (code_id) REFERENCES download_codes(id),
      FOREIGN KEY (material_id) REFERENCES materials(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 岗位刷题科目配置表（管理员设置各岗位刷题用哪些科目）
  db.exec(`
    CREATE TABLE IF NOT EXISTS position_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position TEXT NOT NULL,
      subjects TEXT NOT NULL,
      updated_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(position)
    )
  `);

  // 创建默认管理员账号
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, name, role, position)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', hashedPassword, '系统管理员', 'admin', null);
    console.log('[DB] 默认管理员账号已创建: admin / admin123');
  }

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_questions_subject_type ON questions(subject, type);
    CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
    CREATE INDEX IF NOT EXISTS idx_questions_domain ON questions(domain);
    CREATE INDEX IF NOT EXISTS idx_exams_user_id ON exams(user_id);
    CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_practice_user_id ON practice_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_download_codes_code ON download_codes(code);
    CREATE INDEX IF NOT EXISTS idx_download_code_usage_code_id ON download_code_usage(code_id);
  `);
}

module.exports = { db, initDB };

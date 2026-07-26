/**
 * 管理后台前端逻辑
 */

// 当前用户信息
let currentUser = null;

// 考试配置数据（用于配置页面展示）
const examConfigs = {
  '最高管理者': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 25, multiple: 15, judge: 10 },
      'B': { single: 5,  multiple: 5,  judge: 5  }
    },
    desc: '科目A + 科目B，侧重科目A',
    rule: '4.2.1.2'
  },
  '质量负责人': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 10, multiple: 5,  judge: 5 },
      'B': { single: 15, multiple: 10, judge: 5 },
      'C': { single: 5,  multiple: 5,  judge: 5 }
    },
    desc: '科目A + B + C，侧重科目B',
    rule: '4.2.1.3'
  },
  '技术负责人': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 5,  multiple: 5, judge: 2 },
      'B': { single: 5,  multiple: 5, judge: 3 },
      'C': { single: 12, multiple: 6, judge: 6 },
      'D': { single: 8,  multiple: 4, judge: 4 }
    },
    desc: '科目A+B+C+D，侧重科目C',
    rule: '4.2.1.4 a)'
  },
  '授权签字人': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 5,  multiple: 5, judge: 2 },
      'B': { single: 5,  multiple: 5, judge: 3 },
      'C': { single: 8,  multiple: 4, judge: 4 },
      'D': { single: 12, multiple: 6, judge: 6 }
    },
    desc: '科目A+B+C+D，侧重科目D',
    rule: '4.2.1.4 b)'
  },
  '监督员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 15, multiple: 5, judge: 5 },
      'B': { single: 15, multiple: 5, judge: 5 },
      'C': { single: 10, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目A+B',
    rule: '内部考核'
  },
  '设备员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目C',
    rule: '内部考核'
  },
  '内审员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 20, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 10, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目A',
    rule: '内部考核'
  },
  '报告审核员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目C',
    rule: '内部考核'
  },
  '采样员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目C',
    rule: '内部考核'
  },
  '检测员': {
    examType: '首次考试', duration: 90, passScore: 70,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    desc: '科目A+B+C，侧重科目C',
    rule: '内部考核'
  },
  '扩领域考试': {
    examType: '扩领域考试', duration: 60, passScore: 70,
    subjects: {
      'D': { single: 20, multiple: 20, judge: 10 }
    },
    desc: '科目D单独考试，每次限一个专业大类',
    rule: '4.2.2'
  }
};

const subjectNames = {
  'A': '科目A：法律法规规章及规范性文件',
  'B': '科目B：质量管理基础及风险管理知识',
  'C': '科目C：检验检测通用技术基础',
  'D': '科目D：检验检测专业技术知识'
};

// ==================== 初始化 ====================
async function init() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (!data.user || data.user.role !== 'admin') {
      window.location.href = '/login.html';
      return;
    }
    currentUser = data.user;
    document.getElementById('adminInfo').textContent = currentUser.name;
    loadDashboard();
  } catch (err) {
    window.location.href = '/login.html';
  }
}

// ==================== 导航 ====================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + page).classList.remove('hidden');

    if (page === 'dashboard') loadDashboard();
    else if (page === 'users') loadUsers();
    else if (page === 'questions') loadQuestions(1);
    else if (page === 'upload') {}
    else if (page === 'materials') loadMaterials();
    else if (page === 'codes') loadCodes();
    else if (page === 'possubjects') loadPosSubjects();
    else if (page === 'exams') loadExams(1);
    else if (page === 'config') loadConfig();
  });
});

// ==================== 仪表盘 ====================
async function loadDashboard() {
  try {
    const [usersRes, statsRes, examsRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/questions/stats'),
      fetch('/api/admin/exams?pageSize=1')
    ]);
    const usersData = await usersRes.json();
    const statsData = await statsRes.json();
    const examsData = await examsRes.json();

    document.getElementById('statUsers').textContent = usersData.users.length;
    
    let totalQ = 0;
    for (const s of Object.values(statsData.stats)) {
      for (const c of Object.values(s)) totalQ += c;
    }
    document.getElementById('statQuestions').textContent = totalQ;
    document.getElementById('statExams').textContent = examsData.total;

    // 题库分布表格
    let html = '<div class="table-wrapper"><table><thead><tr><th>科目</th><th>单选题</th><th>多选题</th><th>判断题</th><th>合计</th></tr></thead><tbody>';
    for (const [subject, types] of Object.entries(statsData.stats)) {
      const single = types['单选题'] || 0;
      const multiple = types['多选题'] || 0;
      const judge = types['判断题'] || 0;
      html += `<tr><td>${subjectNames[subject]}</td><td>${single}</td><td>${multiple}</td><td>${judge}</td><td>${single+multiple+judge}</td></tr>`;
    }
    html += '</tbody></table></div>';
    document.getElementById('questionStatsTable').innerHTML = html;

    // 科目D大类
    let catHtml = '<div class="table-wrapper"><table><thead><tr><th>专业大类</th><th>单选题</th><th>多选题</th><th>判断题</th><th>合计</th></tr></thead><tbody>';
    if (statsData.categories && Object.keys(statsData.categories).length > 0) {
      for (const [cat, types] of Object.entries(statsData.categories)) {
        const single = types['单选题'] || 0;
        const multiple = types['多选题'] || 0;
        const judge = types['判断题'] || 0;
        catHtml += `<tr><td>${cat}</td><td>${single}</td><td>${multiple}</td><td>${judge}</td><td>${single+multiple+judge}</td></tr>`;
      }
    } else {
      catHtml += '<tr><td colspan="5" style="text-align:center; color:var(--text-light);">暂无科目D题目</td></tr>';
    }
    catHtml += '</tbody></table></div>';
    document.getElementById('categoryStatsTable').innerHTML = catHtml;

    // 合格人数
    const passedRes = await fetch('/api/admin/exams?pageSize=1000&result=合格');
    const passedData = await passedRes.json();
    const uniquePassed = new Set(passedData.exams.map(e => e.user_id));
    document.getElementById('statPassed').textContent = uniquePassed.size;
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// ==================== 用户管理 ====================
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    let html = '';
    for (const u of data.users) {
      html += `<tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.name}</td>
        <td>${u.role === 'admin' ? '<span class="tag tag-blue">管理员</span>' : '<span class="tag tag-gray">考生</span>'}</td>
        <td>${u.position || '-'}</td>
        <td>${u.concurrent_position || '-'}</td>
        <td>${u.employee_id || '-'}</td>
        <td>${u.department || '-'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="showUserModal(${u.id})">编辑</button>
          ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">删除</button>` : ''}
        </td>
      </tr>`;
    }
    document.getElementById('usersTableBody').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:var(--text-light);">暂无用户</td></tr>';
  } catch (err) {
    console.error('Load users error:', err);
  }
}

function showUserModal(id) {
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const form = document.getElementById('userForm');
  form.reset();
  document.getElementById('userId').value = '';

  if (id) {
    // 编辑
    title.textContent = '编辑用户';
    fetch(`/api/admin/users`).then(r => r.json()).then(data => {
      const user = data.users.find(u => u.id === id);
      if (user) {
        document.getElementById('userId').value = user.id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userUsername').disabled = true;
        document.getElementById('userPassword').value = '';
        document.getElementById('passwordHint').textContent = '（留空则不修改）';
        document.getElementById('userName').value = user.name;
        document.getElementById('userRole').value = user.role;
        document.getElementById('userPosition').value = user.position || '';
        document.getElementById('userConcurrentPosition').value = user.concurrent_position || '';
        document.getElementById('userEmployeeId').value = user.employee_id || '';
        document.getElementById('userDepartment').value = user.department || '';
      }
    });
  } else {
    // 新增
    title.textContent = '新增用户';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('passwordHint').textContent = '*';
  }

  modal.classList.add('show');
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userId').value;
  const data = {
    username: document.getElementById('userUsername').value,
    name: document.getElementById('userName').value,
    role: document.getElementById('userRole').value,
    position: document.getElementById('userPosition').value,
    concurrent_position: document.getElementById('userConcurrentPosition').value,
    employee_id: document.getElementById('userEmployeeId').value,
    department: document.getElementById('userDepartment').value
  };
  const password = document.getElementById('userPassword').value;
  if (password) data.password = password;
  if (!id && !password) {
    alert('请输入密码');
    return;
  }

  try {
    const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('userModal');
      loadUsers();
    } else {
      alert(result.error || '保存失败');
    }
  } catch (err) {
    alert('网络错误');
  }
}

async function deleteUser(id) {
  if (!confirm('确定删除该用户？相关考试记录将保留。')) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadUsers();
    else alert(data.error || '删除失败');
  } catch (err) {
    alert('网络错误');
  }
}

// ==================== 题库管理 ====================
async function loadQuestions(page) {
  const subject = document.getElementById('filterSubject').value;
  const type = document.getElementById('filterType').value;
  const params = new URLSearchParams({ page, pageSize: 20 });
  if (subject) params.set('subject', subject);
  if (type) params.set('type', type);

  try {
    const res = await fetch(`/api/admin/questions?${params}`);
    const data = await res.json();
    let html = '';
    for (const q of data.questions) {
      const contentPreview = q.content.length > 50 ? q.content.substring(0, 50) + '...' : q.content;
      html += `<tr>
        <td>${q.id}</td>
        <td><span class="tag tag-green">科目${q.subject}</span></td>
        <td><span class="tag tag-blue">${q.type}</span></td>
        <td>${q.category || '-'}</td>
        <td style="max-width:300px; overflow:hidden; text-overflow:ellipsis;">${contentPreview}</td>
        <td><span class="tag tag-orange">${q.correct_answer}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewQuestion(${q.id})">查看</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">删除</button>
        </td>
      </tr>`;
    }
    document.getElementById('questionsTableBody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:var(--text-light);">暂无题目</td></tr>';
    renderPagination('questionsPagination', data.total, data.page, data.pageSize, loadQuestions);
  } catch (err) {
    console.error('Load questions error:', err);
  }
}

async function viewQuestion(id) {
  // 从当前列表中查找
  const res = await fetch(`/api/admin/questions?pageSize=1000`);
  const data = await res.json();
  const q = data.questions.find(x => x.id === id);
  if (!q) return;

  let html = `<div style="margin-bottom:16px;">
    <span class="tag tag-green">科目${q.subject}</span>
    <span class="tag tag-blue">${q.type}</span>
    ${q.category ? `<span class="tag tag-gray">${q.category}</span>` : ''}
  </div>`;
  html += `<div style="font-size:16px; margin-bottom:16px; line-height:1.8;">${q.content}</div>`;
  if (q.option_a) html += `<div style="padding:8px 0;"><strong>A.</strong> ${q.option_a}</div>`;
  if (q.option_b) html += `<div style="padding:8px 0;"><strong>B.</strong> ${q.option_b}</div>`;
  if (q.option_c) html += `<div style="padding:8px 0;"><strong>C.</strong> ${q.option_c}</div>`;
  if (q.option_d) html += `<div style="padding:8px 0;"><strong>D.</strong> ${q.option_d}</div>`;
  html += `<div style="margin-top:16px; padding:12px; background:#E8F5E9; border-radius:8px;">
    <strong>正确答案：</strong><span class="tag tag-green">${q.correct_answer}</span>
  </div>`;
  if (q.explanation) {
    html += `<div style="margin-top:12px; padding:12px; background:#F5F5F5; border-radius:8px;">
      <strong>解析：</strong>${q.explanation}
    </div>`;
  }
  document.getElementById('questionDetail').innerHTML = html;
  document.getElementById('questionModal').classList.add('show');
}

async function deleteQuestion(id) {
  if (!confirm('确定删除该题目？')) return;
  try {
    const res = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadQuestions(document.querySelector('.pagination .active')?.textContent || 1);
    else alert(data.error);
  } catch (err) { alert('网络错误'); }
}

async function clearAllQuestions() {
  if (!confirm('⚠️ 确认清空全部题库？此操作不可恢复！')) return;
  if (!confirm('再次确认：将删除所有科目所有题目，确定吗？')) return;
  try {
    const res = await fetch('/api/admin/questions/all', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(`已清空 ${data.deleted} 道题目`);
      loadQuestions(1);
    }
  } catch (err) { alert('网络错误'); }
}

// ==================== 上传题库 ====================
async function downloadTemplate() {
  window.location.href = '/api/admin/questions/template';
}

function uploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  doUpload(file);
}

// 拖拽上传
const uploadZone = document.getElementById('uploadZone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  });
}

async function doUpload(file) {
  const formData = new FormData();
  formData.append('file', file);
  // 附加科目/领域/大类参数（当Excel无这些列时使用）
  const subject = document.getElementById('uploadSubject');
  const domain = document.getElementById('uploadDomain');
  const category = document.getElementById('uploadCategory');
  if (subject && subject.value) formData.append('subject', subject.value);
  if (domain && domain.value) formData.append('domain', domain.value);
  if (category && category.value) formData.append('category', category.value);

  document.getElementById('uploadResult').innerHTML = '<div class="alert alert-info">正在上传并解析...</div>';

  try {
    const res = await fetch('/api/admin/questions/upload', {
      method: 'POST', body: formData
    });
    const data = await res.json();
    if (data.success) {
      let html = `<div class="alert alert-success">
        ✅ 导入成功！共导入 ${data.imported} 道题目。
      </div>`;
      if (data.totalErrors > 0) {
        html += `<div class="alert alert-warning">
          ⚠️ 有 ${data.totalErrors} 行数据未导入（显示前${data.errors.length}条）：<br>
          ${data.errors.join('<br>')}
        </div>`;
      }
      document.getElementById('uploadResult').innerHTML = html;
      loadQuestionStats();
    } else {
      document.getElementById('uploadResult').innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
    }
  } catch (err) {
    document.getElementById('uploadResult').innerHTML = '<div class="alert alert-danger">上传失败，请重试</div>';
  }
  // 清空input以便再次上传
  document.getElementById('fileInput').value = '';
}

// ==================== 考试记录 ====================
async function loadExams(page) {
  const position = document.getElementById('filterExamPosition')?.value || '';
  const result = document.getElementById('filterExamResult')?.value || '';
  const params = new URLSearchParams({ page, pageSize: 20 });
  if (position) params.set('position', position);
  if (result) params.set('result', result);

  try {
    const res = await fetch(`/api/admin/exams?${params}`);
    const data = await res.json();
    let html = '';
    for (const e of data.exams) {
      const duration = e.end_time ? Math.round((new Date(e.end_time) - new Date(e.start_time)) / 60000) + '分钟' : '-';
      const submitLabel = e.submit_reason === '切屏超过3次自动提交' ? '<span class="tag tag-red">切屏自动提交</span>' :
                          e.status === 'auto_submitted' ? '<span class="tag tag-orange">超时自动提交</span>' :
                          '<span class="tag tag-green">手动提交</span>';
      html += `<tr>
        <td>${e.id}</td>
        <td>${e.user_name}</td>
        <td>${e.username}</td>
        <td>${e.exam_type}</td>
        <td>${e.position || '-'}</td>
        <td>${e.subject_d_category || '-'}</td>
        <td>${e.score !== null ? e.score : '-'} / ${e.total_score}</td>
        <td>${e.result ? (e.result === '合格' ? '<span class="tag tag-green">合格</span>' : '<span class="tag tag-red">不合格</span>') : '<span class="tag tag-gray">进行中</span>'}</td>
        <td>${duration}</td>
        <td>${submitLabel}</td>
        <td style="font-size:12px;">${e.start_time ? new Date(e.start_time).toLocaleString('zh-CN') : '-'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="viewExam(${e.id})">详情</button></td>
      </tr>`;
    }
    document.getElementById('examsTableBody').innerHTML = html || '<tr><td colspan="12" style="text-align:center;color:var(--text-light);">暂无考试记录</td></tr>';
    renderPagination('examsPagination', data.total, data.page, data.pageSize, loadExams);
  } catch (err) {
    console.error('Load exams error:', err);
  }
}

async function viewExam(id) {
  try {
    const res = await fetch(`/api/admin/exams/${id}`);
    const data = await res.json();
    const e = data.exam;
    let html = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
      <div><strong>考生：</strong>${e.user_name} (${e.username})</div>
      <div><strong>考试类型：</strong>${e.exam_type}</div>
      <div><strong>岗位：</strong>${e.position || '-'}</div>
      <div><strong>专业大类：</strong>${e.subject_d_category || '-'}</div>
      <div><strong>得分：</strong>${e.score} / ${e.total_score}</div>
      <div><strong>结果：</strong>${e.result === '合格' ? '<span class="tag tag-green">合格</span>' : '<span class="tag tag-red">不合格</span>'}</div>
      <div><strong>开始时间：</strong>${new Date(e.start_time).toLocaleString('zh-CN')}</div>
      <div><strong>结束时间：</strong>${e.end_time ? new Date(e.end_time).toLocaleString('zh-CN') : '-'}</div>
      <div><strong>切屏次数：</strong>${e.switch_count}</div>
      <div><strong>提交方式：</strong>${e.submit_reason || '手动提交'}</div>
    </div>`;

    html += '<div style="max-height:400px; overflow-y:auto;"><table><thead><tr><th>序号</th><th>科目</th><th>题型</th><th>题干</th><th>考生答案</th><th>正确答案</th><th>结果</th></tr></thead><tbody>';
    for (const q of data.questions) {
      html += `<tr>
        <td>${q.order_num}</td>
        <td>科目${q.subject}</td>
        <td>${q.type}</td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${q.content}</td>
        <td>${q.user_answer || '<span style="color:var(--text-light);">未作答</span>'}</td>
        <td>${q.correct_answer}</td>
        <td>${q.is_correct === 1 ? '<span class="tag tag-green">正确</span>' : q.is_correct === 0 ? '<span class="tag tag-red">错误</span>' : '-'}</td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    document.getElementById('examDetail').innerHTML = html;
    document.getElementById('examModal').classList.add('show');
  } catch (err) {
    console.error('View exam error:', err);
  }
}

// ==================== 考试配置展示 ====================
function loadConfig() {
  let html = '';
  for (const [name, config] of Object.entries(examConfigs)) {
    let totalQ = 0, totalScore = 0;
    for (const counts of Object.values(config.subjects)) {
      totalQ += counts.single + counts.multiple + counts.judge;
    }
    const scorePer = name === '扩领域考试' ? { single: 2, multiple: 2, judge: 2 } : { single: 1, multiple: 2, judge: 2 };
    for (const counts of Object.values(config.subjects)) {
      totalScore += counts.single * scorePer.single + counts.multiple * scorePer.multiple + counts.judge * scorePer.judge;
    }

    html += `<div class="card">
      <div class="card-title">
        <span>${name} <span class="tag tag-gray">${config.rule}</span></span>
        <span class="tag tag-blue">${config.examType}</span>
      </div>
      <p style="color:var(--text-light); font-size:14px; margin-bottom:12px;">${config.desc}</p>
      <div class="flex gap-16" style="flex-wrap:wrap; margin-bottom:12px;">
        <span class="tag tag-green">考试时长：${config.duration}分钟</span>
        <span class="tag tag-green">总分：${totalScore}分</span>
        <span class="tag tag-green">题量：${totalQ}道</span>
        <span class="tag tag-green">合格线：${config.passScore}分</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>科目</th><th>单选题</th><th>多选题</th><th>判断题</th><th>小计</th></tr></thead>
          <tbody>`;

    for (const [subject, counts] of Object.entries(config.subjects)) {
      const subTotal = counts.single + counts.multiple + counts.judge;
      const subScore = counts.single * scorePer.single + counts.multiple * scorePer.multiple + counts.judge * scorePer.judge;
      html += `<tr>
        <td>${subjectNames[subject]}</td>
        <td>${counts.single}道 × ${scorePer.single}分 = ${counts.single * scorePer.single}分</td>
        <td>${counts.multiple}道 × ${scorePer.multiple}分 = ${counts.multiple * scorePer.multiple}分</td>
        <td>${counts.judge}道 × ${scorePer.judge}分 = ${counts.judge * scorePer.judge}分</td>
        <td>${subTotal}道 / ${subScore}分</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    
    if (name === '最高管理者' || name === '质量负责人' || name === '授权签字人') {
      html += `<div class="alert alert-info" style="margin-top:12px;">
        <strong>兼任规则（4.2.1.5）：</strong>
        ${name === '最高管理者' ? '最高管理者兼任其他岗位时，按其他岗位要求考试。' : ''}
        ${name === '质量负责人' ? '质量负责人兼任授权签字人时，按授权签字人要求考试（4.2.1.4 b）。' : ''}
        ${name === '授权签字人' ? '授权签字人兼任技术负责人时，按技术负责人要求考试（4.2.1.4 a）。' : ''}
      </div>`;
    }
    if (name === '技术负责人' || name === '授权签字人') {
      html += `<div class="alert alert-warning" style="margin-top:8px;">
        <strong>扩领域考试：</strong>技术负责人、授权签字人每次科目D考试限一个专业大类，增加大类需单独参加扩领域考试。
      </div>`;
    }
    html += `</div>`;
  }

  // 防作弊规则
  html += `<div class="card">
    <div class="card-title">考试规则</div>
    <div class="alert alert-warning">
      <strong>防作弊机制：</strong>考试过程中切屏3次将自动提交试卷。<br>
      <strong>自动提交：</strong>考试时间结束自动提交答卷。<br>
      <strong>合格标准：</strong>总分100分，70分及以上为"合格"。
    </div>
  </div>`;

  document.getElementById('configContainer').innerHTML = html;
}

// ==================== 资料库管理 ====================
async function loadMaterials() {
  try {
    const res = await fetch('/api/admin/materials');
    const data = await res.json();
    let html = '';
    for (const m of data.materials) {
      const typeIcon = m.filetype === 'word' ? '📄 Word' :
                       m.filetype === 'excel' ? '📊 Excel' :
                       m.filetype === 'pdf' ? '📕 PDF' : '📎 文件';
      const sizeStr = m.filesize ? formatFileSize(m.filesize) : '-';
      html += `<tr>
        <td>${m.id}</td>
        <td>${m.title}</td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${m.filename}</td>
        <td><span class="tag tag-blue">${typeIcon}</span></td>
        <td>${m.category ? `<span class="tag tag-gray">${m.category}</span>` : '-'}</td>
        <td>${sizeStr}</td>
        <td>${m.uploader_name || '-'}</td>
        <td style="font-size:12px;">${new Date(m.created_at).toLocaleString('zh-CN')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="downloadMaterial(${m.id})">下载</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaterial(${m.id})">删除</button>
        </td>
      </tr>`;
    }
    document.getElementById('materialsTableBody').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:var(--text-light);">暂无资料</td></tr>';
  } catch (err) {
    console.error('Load materials error:', err);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function uploadMaterial(input) {
  const file = input.files[0];
  if (!file) return;

  const title = document.getElementById('materialTitle').value.trim();
  if (!title) {
    alert('请输入资料标题');
    input.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  const category = document.getElementById('materialCategory').value;
  const description = document.getElementById('materialDescription').value;
  if (category) formData.append('category', category);
  if (description) formData.append('description', description);

  document.getElementById('materialUploadResult').innerHTML = '<div class="alert alert-info">正在上传...</div>';

  fetch('/api/admin/materials/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('materialUploadResult').innerHTML = '<div class="alert alert-success">✅ 上传成功！</div>';
      document.getElementById('materialTitle').value = '';
      document.getElementById('materialDescription').value = '';
      document.getElementById('materialCategory').value = '';
      loadMaterials();
    } else {
      document.getElementById('materialUploadResult').innerHTML = `<div class="alert alert-danger">${data.error || '上传失败'}</div>`;
    }
  })
  .catch(() => {
    document.getElementById('materialUploadResult').innerHTML = '<div class="alert alert-danger">上传失败，请重试</div>';
  });
  input.value = '';
}

// 拖拽上传
const materialUploadZone = document.getElementById('materialUploadZone');
if (materialUploadZone) {
  materialUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    materialUploadZone.classList.add('dragover');
  });
  materialUploadZone.addEventListener('dragleave', () => {
    materialUploadZone.classList.remove('dragover');
  });
  materialUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    materialUploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      document.getElementById('materialFileInput').files = e.dataTransfer.files;
      uploadMaterial(document.getElementById('materialFileInput'));
    }
  });
}

function downloadMaterial(id) {
  window.location.href = `/api/admin/materials/${id}/download`;
}

async function deleteMaterial(id) {
  if (!confirm('确定删除该资料？文件将被永久删除。')) return;
  try {
    const res = await fetch(`/api/admin/materials/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadMaterials();
    else alert(data.error || '删除失败');
  } catch (err) {
    alert('网络错误');
  }
}

// ==================== 岗位科目配置 ====================

async function loadPosSubjects() {
  const positions = [
    { name: '监督员', icon: '👁' },
    { name: '设备员', icon: '🔧' },
    { name: '内审员', icon: '📝' },
    { name: '报告审核员', icon: '✅' },
    { name: '采样员', icon: '🧪' },
    { name: '检测员', icon: '🔬' }
  ];
  const allSubjects = ['A', 'B', 'C', 'D'];

  try {
    const res = await fetch('/api/admin/position-subjects');
    const data = await res.json();
    const configs = data.configs || {};

    let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px,1fr)); gap:16px;">';
    for (const pos of positions) {
      const current = configs[pos.name] || [];
      const hasConfig = current.length > 0;

      let checkboxHtml = '';
      for (const subj of allSubjects) {
        const checked = current.includes(subj) ? 'checked' : '';
        checkboxHtml += `<label style="display:inline-flex; align-items:center; gap:4px; padding:8px 16px; border:2px solid var(--border); border-radius:8px; cursor:pointer; font-size:14px; transition:all 0.2s; ${checked ? 'border-color:var(--primary); background:#E8F5E9; font-weight:600;' : ''}" onclick="toggleSubjectChip(this)">
          <input type="checkbox" value="${subj}" ${checked} style="display:none;">
          <span>科目${subj}</span>
        </label>`;
      }

      html += `<div class="card" style="padding:20px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <span style="font-size:28px;">${pos.icon}</span>
          <div>
            <h3 style="font-size:16px; margin:0;">${pos.name}</h3>
            <span style="font-size:12px; color:${hasConfig ? 'var(--primary)' : 'var(--text-light)'};">${hasConfig ? '已配置：' + current.join('、') : '未配置'}</span>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px; color:var(--text-light); display:block; margin-bottom:8px;">考试和刷题科目（多选）</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${checkboxHtml}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="savePosSubjects('${pos.name}', this)">保存配置</button>
          <button class="btn btn-outline btn-sm" onclick="clearPosSubjects('${pos.name}', this)" ${!hasConfig ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>取消配置</button>
        </div>
      </div>`;
    }
    html += '</div>';
    document.getElementById('posSubjectsContainer').innerHTML = html;
  } catch (err) {
    console.error('Load posSubjects error:', err);
    document.getElementById('posSubjectsContainer').innerHTML = '<div class="alert alert-danger">加载失败</div>';
  }
}

function toggleSubjectChip(label) {
  const input = label.querySelector('input');
  input.checked = !input.checked;
  if (input.checked) {
    label.style.borderColor = 'var(--primary)';
    label.style.background = '#E8F5E9';
    label.style.fontWeight = '600';
  } else {
    label.style.borderColor = 'var(--border)';
    label.style.background = '';
    label.style.fontWeight = '';
  }
}

async function savePosSubjects(position, btn) {
  const card = btn.closest('.card');
  const checkboxes = card.querySelectorAll('input[type="checkbox"]:checked');
  const subjects = Array.from(checkboxes).map(cb => cb.value);

  if (subjects.length === 0) {
    alert('请至少选择一个科目');
    return;
  }

  btn.textContent = '保存中...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/admin/position-subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position, subjects })
    });
    const data = await res.json();
    if (data.success) {
      btn.textContent = '已保存 ✓';
      // 重新加载整个岗位科目配置区域，确保取消配置按钮正确启用
      setTimeout(() => { loadPosSubjects(); }, 800);
    } else {
      alert(data.error || '保存失败');
      btn.textContent = '保存配置';
      btn.disabled = false;
    }
  } catch (err) {
    alert('网络错误');
    btn.textContent = '保存配置';
    btn.disabled = false;
  }
}

async function clearPosSubjects(position, btn) {
  if (!confirm(`确定要清除"${position}"的科目配置吗？清除后该岗位将无法参加考试和刷题。`)) {
    return;
  }

  btn.textContent = '清除中...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/admin/position-subjects/${encodeURIComponent(position)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      btn.textContent = '已清除 ✓';
      setTimeout(() => { loadPosSubjects(); }, 800);
    } else {
      alert(data.error || '清除失败');
      btn.textContent = '取消配置';
      btn.disabled = false;
    }
  } catch (err) {
    alert('网络错误');
    btn.textContent = '取消配置';
    btn.disabled = false;
  }
}

// ==================== 下载码管理 ====================

async function loadCodes() {
  try {
    const res = await fetch('/api/admin/codes');
    const data = await res.json();
    let html = '';
    for (const c of data.codes) {
      const statusBadge = c.status === 'active'
        ? '<span class="tag tag-green">可用</span>'
        : c.status === 'used'
        ? '<span class="tag tag-gray">已用完</span>'
        : '<span class="tag tag-red">已禁用</span>';
      const expiry = c.expires_at
        ? new Date(c.expires_at).toLocaleDateString('zh-CN')
        : '永久';
      const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
      const expiryDisplay = isExpired
        ? `<span style="color:#dc3545;">${expiry} (已过期)</span>`
        : expiry;

      html += `<tr>
        <td>${c.id}</td>
        <td style="font-family:monospace; font-weight:600; letter-spacing:1px; color:var(--primary);">${c.code}</td>
        <td>${statusBadge}</td>
        <td>${c.max_uses}</td>
        <td>${c.actual_uses || c.used_count || 0}</td>
        <td style="font-size:12px;">${expiryDisplay}</td>
        <td>${c.remark || '-'}</td>
        <td>${c.creator_name || '-'}</td>
        <td style="font-size:12px;">${new Date(c.created_at).toLocaleString('zh-CN')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="copyCode('${c.code}')">复制</button>
          ${c.status === 'active' ? `<button class="btn btn-outline btn-sm" onclick="disableCode(${c.id})">禁用</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteCode(${c.id})">删除</button>
        </td>
      </tr>`;
    }
    document.getElementById('codesTableBody').innerHTML = html || '<tr><td colspan="10" style="text-align:center;color:var(--text-light);">暂无下载码</td></tr>';
  } catch (err) {
    console.error('Load codes error:', err);
  }
}

async function generateCodes() {
  const count = document.getElementById('codeCount').value;
  const maxUses = document.getElementById('codeMaxUses').value;
  const expiresDays = document.getElementById('codeExpiresDays').value;
  const remark = document.getElementById('codeRemark').value;
  const resultEl = document.getElementById('codeGenResult');

  resultEl.innerHTML = '<div class="alert alert-info">正在生成...</div>';

  try {
    const res = await fetch('/api/admin/codes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, maxUses, expiresDays, remark })
    });
    const data = await res.json();

    if (data.success && data.codes.length > 0) {
      let html = '<div class="alert alert-success">✅ 已生成 ' + data.codes.length + ' 个下载码：</div>';
      html += '<div style="background:#f8f9fa; border-radius:8px; padding:16px; margin-top:8px;">';
      for (const c of data.codes) {
        html += `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #ddd;">
          <span style="font-family:monospace; font-size:18px; font-weight:700; color:var(--primary); letter-spacing:2px;">${c.code}</span>
          <button class="btn btn-outline btn-sm" onclick="copyCode('${c.code}')">复制</button>
        </div>`;
      }
      html += '</div>';
      html += '<div style="margin-top:12px; font-size:13px; color:var(--text-light);">请将下载码发送给需要下载资料的人员。</div>';
      resultEl.innerHTML = html;

      // 清空备注
      document.getElementById('codeRemark').value = '';
      // 刷新列表
      loadCodes();
    } else {
      resultEl.innerHTML = `<div class="alert alert-danger">${data.error || '生成失败'}</div>`;
    }
  } catch (err) {
    resultEl.innerHTML = '<div class="alert alert-danger">网络错误，请重试</div>';
  }
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    // 简单提示
    const tip = document.createElement('div');
    tip.textContent = '已复制: ' + code;
    tip.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#1B7A3D; color:white; padding:8px 20px; border-radius:8px; font-size:14px; z-index:9999; box-shadow:0 2px 10px rgba(0,0,0,0.2);';
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 2000);
  }).catch(() => {
    // fallback
    const textarea = document.createElement('textarea');
    textarea.value = code;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    alert('已复制: ' + code);
  });
}

async function disableCode(id) {
  if (!confirm('确定禁用该下载码？禁用后将无法使用。')) return;
  try {
    const res = await fetch(`/api/admin/codes/${id}/disable`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) loadCodes();
    else alert(data.error || '禁用失败');
  } catch (err) {
    alert('网络错误');
  }
}

async function deleteCode(id) {
  if (!confirm('确定删除该下载码？此操作不可恢复。')) return;
  try {
    const res = await fetch(`/api/admin/codes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadCodes();
    else alert(data.error || '删除失败');
  } catch (err) {
    alert('网络错误');
  }
}

// ==================== 通用工具 ====================
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function renderPagination(containerId, total, page, pageSize, callback) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) {
    document.getElementById(containerId).innerHTML = '';
    return;
  }
  let html = '';
  html += `<button ${page <= 1 ? 'disabled' : ''} onclick="${callback.name}(${page - 1})">上一页</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="${i === page ? 'active' : ''}" onclick="${callback.name}(${i})">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += '<button disabled>...</button>';
    }
  }
  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="${callback.name}(${page + 1})">下一页</button>`;
  document.getElementById(containerId).innerHTML = html;
}

function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => {
    window.location.href = '/login.html';
  });
}

// 启动
init();

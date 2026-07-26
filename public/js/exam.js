/**
 * 考试页面前端逻辑
 */

let examData = null;
let examId = null;
let answers = {};
let timerInterval = null;
let timeRemaining = 0;
let switchCount = 0;
let isSubmitting = false;
let lastSaveTime = 0;
let currentQuestionId = null;

const typeOrder = ['单选题', '多选题', '判断题'];
const typeLabels = {
  '单选题': '单选题',
  '多选题': '多选题',
  '判断题': '判断题'
};
const typeClasses = {
  '单选题': 'single',
  '多选题': 'multiple',
  '判断题': 'judge'
};

async function init() {
  // 检查登录状态
  try {
    const meRes = await fetch('/api/me');
    const meData = await meRes.json();
    if (!meData.user) {
      window.location.href = '/login.html';
      return;
    }
  } catch (err) {
    window.location.href = '/login.html';
    return;
  }

  // 从sessionStorage获取考试数据
  const stored = sessionStorage.getItem('examData');
  if (stored) {
    examData = JSON.parse(stored);
    examId = examData.examId;
    renderExam();
  } else {
    // 尝试恢复进行中的考试
    const res = await fetch('/api/exam/history');
    const data = await res.json();
    const ongoing = data.exams.find(e => e.status === 'ongoing');
    if (ongoing) {
      examId = ongoing.id;
      // 获取考试详情
      const detailRes = await fetch(`/api/exam/${examId}`);
      const detailData = await detailRes.json();
      examData = {
        examId: examId,
        startTime: ongoing.start_time,
        duration: ongoing.duration,
        totalQuestions: detailData.questions.length,
        totalScore: ongoing.total_score,
        questions: detailData.questions.map(q => ({
          id: q.id,
          order: q.order,
          subject: q.subject,
          type: q.type,
          score: q.score,
          content: q.content,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d
        }))
      };
      // 恢复已答答案
      for (const q of detailData.questions) {
        if (q.user_answer) {
          answers[q.id] = q.user_answer;
        }
      }
      renderExam();
    } else {
      window.location.href = '/exam-start.html';
      return;
    }
  }

  // 设置防作弊
  setupAntiCheat();
}

function renderExam() {
  document.getElementById('totalCount').textContent = examData.totalQuestions;
  document.getElementById('totalCountLabel').textContent = `共${examData.totalQuestions}题`;

  // 渲染题目
  let html = '';
  for (const q of examData.questions) {
    const isJudge = q.type === '判断题';
    const isMultiple = q.type === '多选题';

    html += `<div class="question-block" id="qblock-${q.id}">
      <div class="question-header">
        <div class="question-number">${q.order}</div>
        <span class="question-subject-tag">科目${q.subject}</span>
        <span class="question-type-tag">${q.type}</span>
        <span class="question-score">${q.score}分</span>
      </div>
      <div class="question-content">${q.content}</div>
      <div class="question-options ${isJudge ? 'judge-options' : ''}">`;

    if (isJudge) {
      html += renderOption(q.id, 'A', q.option_a || '正确', isJudge);
      html += renderOption(q.id, 'B', q.option_b || '错误', isJudge);
    } else {
      if (q.option_a) html += renderOption(q.id, 'A', q.option_a, false, isMultiple);
      if (q.option_b) html += renderOption(q.id, 'B', q.option_b, false, isMultiple);
      if (q.option_c) html += renderOption(q.id, 'C', q.option_c, false, isMultiple);
      if (q.option_d) html += renderOption(q.id, 'D', q.option_d, false, isMultiple);
    }

    html += `</div></div>`;
  }
  document.getElementById('questionsPanel').innerHTML = html;

  // 渲染答题卡
  renderNavGrid();

  // 恢复已选答案
  for (const [qid, ans] of Object.entries(answers)) {
    restoreAnswer(parseInt(qid), ans);
  }
  updateAnsweredCount();

  // 设置第一题为当前题
  if (examData.questions.length > 0) {
    updateCurrentQuestion(examData.questions[0].id);
  }

  // 启动计时器
  startTimer();

  // 绑定选项点击事件
  bindOptionClicks();

  // 监听滚动，自动更新当前题
  setupScrollTracking();
}

function renderOption(qid, letter, text, isJudge, isMultiple) {
  const selected = answers[qid] && (
    isMultiple
      ? answers[qid].includes(letter)
      : answers[qid] === letter
  ) ? 'selected' : '';
  return `<div class="option-item ${selected}" data-qid="${qid}" data-letter="${letter}" data-multiple="${isMultiple || false}">
    <div class="option-letter">${letter}</div>
    <div class="option-text">${text}</div>
  </div>`;
}

function bindOptionClicks() {
  document.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', () => {
      const qid = parseInt(item.dataset.qid);
      const letter = item.dataset.letter;
      const isMultiple = item.dataset.multiple === 'true';

      if (isMultiple) {
        // 多选题
        if (!answers[qid]) answers[qid] = '';
        if (answers[qid].includes(letter)) {
          answers[qid] = answers[qid].replace(letter, '');
          if (answers[qid] === '') delete answers[qid];
        } else {
          answers[qid] = (answers[qid] + letter).split('').sort().join('');
        }
      } else {
        // 单选题/判断题
        answers[qid] = letter;
      }

      // 更新UI
      updateQuestionUI(qid);
      updateAnsweredCount();

      // 自动保存
      autoSave();
    });
  });
}

function updateQuestionUI(qid) {
  const block = document.getElementById(`qblock-${qid}`);
  if (!block) return;
  const options = block.querySelectorAll('.option-item');
  const currentAns = answers[qid] || '';
  const isMultiple = options.length > 0 && options[0].dataset.multiple === 'true';

  options.forEach(opt => {
    const letter = opt.dataset.letter;
    const isSelected = isMultiple
      ? currentAns.includes(letter)
      : currentAns === letter;
    opt.classList.toggle('selected', isSelected);
  });

  // 同步更新答题卡上的已答状态
  const navItem = document.querySelector(`.qnav-item[data-qid="${qid}"]`);
  if (navItem) {
    navItem.classList.toggle('answered', !!currentAns);
  }
}

function restoreAnswer(qid, ans) {
  answers[qid] = ans;
  updateQuestionUI(qid);
}

function renderNavGrid() {
  const container = document.getElementById('navGrid');
  if (!container || !examData) return;

  // 按题型分组
  const groups = {};
  for (const q of examData.questions) {
    if (!groups[q.type]) groups[q.type] = [];
    groups[q.type].push(q);
  }

  let html = '';
  for (const typeName of typeOrder) {
    const questions = groups[typeName];
    if (!questions || questions.length === 0) continue;

    const typeClass = typeClasses[typeName] || 'single';
    const label = typeLabels[typeName] || typeName;

    html += `<div class="question-nav-group">
      <div class="question-nav-group-title">
        <span class="type-indicator ${typeClass}"></span>
        <span>${label}</span>
        <span class="type-count">${questions.length}题</span>
      </div>
      <div class="question-nav-grid-group">`;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const displayNum = i + 1; // 题型内从1开始编号
      const answered = answers[q.id] ? 'answered' : '';
      const current = q.id === currentQuestionId ? 'current' : '';
      html += `<div class="qnav-item ${answered} ${current}" data-qid="${q.id}" onclick="scrollToQuestion(${q.id})">${displayNum}</div>`;
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;
}

function updateCurrentQuestion(qid) {
  currentQuestionId = qid;
  // 更新答题卡高亮
  document.querySelectorAll('.qnav-item').forEach(item => {
    const itemQid = parseInt(item.dataset.qid);
    item.classList.toggle('current', itemQid === qid);
  });
}

function scrollToQuestion(qid) {
  const block = document.getElementById(`qblock-${qid}`);
  if (block) {
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateCurrentQuestion(qid);
  }
}

function updateAnsweredCount() {
  const count = Object.keys(answers).filter(k => answers[k]).length;
  document.getElementById('answeredCount').textContent = count;
}

// ==================== 计时器 ====================
function startTimer() {
  const startTime = new Date(examData.startTime).getTime();
  const endTime = startTime + examData.duration * 60 * 1000;

  function update() {
    const now = Date.now();
    timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000));

    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const timerEl = document.getElementById('timer');
    const timerSidebarEl = document.getElementById('timerSidebar');

    if (timerEl) timerEl.textContent = `⏱ ${timeStr}`;
    if (timerSidebarEl) timerSidebarEl.textContent = timeStr;

    // 颜色变化
    if (timeRemaining <= 300) {
      if (timerEl) timerEl.className = 'exam-timer danger';
      if (timerSidebarEl) timerSidebarEl.style.color = 'var(--danger)';
    } else if (timeRemaining <= 600) {
      if (timerEl) timerEl.className = 'exam-timer warning';
      if (timerSidebarEl) timerSidebarEl.style.color = 'var(--warning)';
    }

    // 自动交卷
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      submitExam('timeout');
      return;
    }

    // 定期保存
    if (now - lastSaveTime > 30000) {
      autoSave();
    }
  }

  update();
  timerInterval = setInterval(update, 1000);
}

// ==================== 滚动跟踪当前题 ====================
function setupScrollTracking() {
  const panel = document.getElementById('questionsPanel');
  if (!panel) return;

  let scrollTimeout;
  panel.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const blocks = panel.querySelectorAll('.question-block');
      let closest = null;
      let closestDist = Infinity;
      const panelRect = panel.getBoundingClientRect();
      const threshold = panelRect.top + 100;

      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        const dist = Math.abs(rect.top - threshold);
        if (dist < closestDist) {
          closestDist = dist;
          closest = block;
        }
      }

      if (closest) {
        const qid = parseInt(closest.id.replace('qblock-', ''));
        if (qid !== currentQuestionId) {
          updateCurrentQuestion(qid);
        }
      }
    }, 150);
  });
}

// ==================== 自动保存 ====================
async function autoSave() {
  if (isSubmitting) return;
  lastSaveTime = Date.now();
  try {
    await fetch(`/api/exam/${examId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
  } catch (err) {
    console.error('Auto save error:', err);
  }
}

// ==================== 防作弊：切屏检测 ====================
function setupAntiCheat() {
  // 页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isSubmitting) {
      handleSwitch();
    }
  });

  // 窗口失焦
  window.addEventListener('blur', () => {
    if (!isSubmitting && document.visibilityState === 'hidden') {
      // visibilitychange 已处理，避免重复
    }
  });

  // 离开页面警告
  window.addEventListener('beforeunload', (e) => {
    if (!isSubmitting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function handleSwitch() {
  if (isSubmitting) return;
  switchCount++;

  const remaining = 3 - switchCount;
  const warning = document.getElementById('switchWarning');
  const remainingEl = document.getElementById('switchRemaining');

  if (switchCount < 3) {
    remainingEl.textContent = remaining;
    warning.classList.add('show');
    setTimeout(() => warning.classList.remove('show'), 5000);
  }

  // 通知服务器
  try {
    const res = await fetch(`/api/exam/${examId}/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();

    if (data.autoSubmit) {
      // 切屏超过3次，自动提交
      isSubmitting = true;
      clearInterval(timerInterval);
      alert(`⚠️ 切屏超过3次，考试已自动提交！\n得分: ${data.score}分\n结果: ${data.result}`);
      window.location.href = `/result.html?id=${examId}`;
    }
  } catch (err) {
    console.error('Switch notify error:', err);
  }
}

// ==================== 交卷 ====================
function confirmSubmit() {
  const answered = Object.keys(answers).filter(k => answers[k]).length;
  const unanswered = examData.totalQuestions - answered;

  document.getElementById('submitInfo').innerHTML = `
    <p>已答题数：<strong>${answered}</strong> / ${examData.totalQuestions}</p>
    ${unanswered > 0 ? `<p style="color:var(--danger);">未答题数：${unanswered}</p>` : '<p style="color:var(--primary);">已全部作答</p>'}
  `;
  document.getElementById('submitModal').classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

async function submitExam(reason) {
  if (isSubmitting) return;
  isSubmitting = true;
  clearInterval(timerInterval);
  closeModal('submitModal');

  try {
    const res = await fetch(`/api/exam/${examId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, submitReason: reason })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.removeItem('examData');
      if (reason === 'timeout') {
        alert('⏰ 考试时间已到，系统已自动提交答卷！');
      }
      window.location.href = `/result.html?id=${examId}`;
    } else {
      alert(data.error || '提交失败');
      isSubmitting = false;
    }
  } catch (err) {
    alert('网络错误，请重试');
    isSubmitting = false;
  }
}

// 启动
init();

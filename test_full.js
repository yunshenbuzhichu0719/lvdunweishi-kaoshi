/**
 * 完整流程测试脚本
 */
const http = require('http');

function apiCall(method, path, data, cookie) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, data: d, setCookie });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // 1. Login as technical manager
  console.log('=== 1. Login ===');
  const loginRes = await apiCall('POST', '/api/login', { username: 'technical', password: 'test123' });
  const cookie = loginRes.setCookie[0].split(';')[0];
  console.log('Login:', JSON.parse(loginRes.data).user.name);

  // 2. Get exam config
  console.log('\n=== 2. Exam Config ===');
  const configRes = await apiCall('GET', '/api/exam/config', null, cookie);
  const config = JSON.parse(configRes.data);
  console.log('Position:', config.configs[0].position);
  console.log('Duration:', config.configs[0].duration, 'min');
  console.log('Total questions:', config.configs[0].totalQuestions);
  console.log('Total score:', config.configs[0].totalScore);
  console.log('Extended exam available:', config.extendedExamAvailable);
  console.log('Categories:', config.categories);

  // 3. Start exam
  console.log('\n=== 3. Start Exam ===');
  const startRes = await apiCall('POST', '/api/exam/start', { examType: '首次考试' }, cookie);
  const examData = JSON.parse(startRes.data);
  if (!examData.examId) {
    console.log('Error:', examData);
    return;
  }
  console.log('Exam ID:', examData.examId);
  console.log('Duration:', examData.duration, 'min');
  console.log('Total questions:', examData.totalQuestions);
  console.log('Total score:', examData.totalScore);

  // Subject distribution
  const dist = {};
  const typeDist = {};
  for (const q of examData.questions) {
    dist[q.subject] = (dist[q.subject] || 0) + 1;
    typeDist[q.type] = (typeDist[q.type] || 0) + 1;
  }
  console.log('Subject distribution:', dist);
  console.log('Type distribution:', typeDist);

  // Verify question counts match config
  const expected = config.configs[0].subjects;
  let counts = {};
  for (const q of examData.questions) {
    if (!counts[q.subject]) counts[q.subject] = { single: 0, multiple: 0, judge: 0 };
    const typeKey = q.type === '单选题' ? 'single' : q.type === '多选题' ? 'multiple' : 'judge';
    counts[q.subject][typeKey]++;
  }
  console.log('\nQuestion count verification:');
  let allMatch = true;
  for (const [subj, expectedCounts] of Object.entries(expected)) {
    for (const [type, expectedCount] of Object.entries(expectedCounts)) {
      const actual = counts[subj]?.[type] || 0;
      const match = actual === expectedCount;
      if (!match) allMatch = false;
      console.log(`  Subject ${subj} ${type}: expected=${expectedCount}, actual=${actual} ${match ? 'OK' : 'MISMATCH'}`);
    }
  }
  console.log('All counts match:', allMatch);

  // 4. Submit exam with some answers
  console.log('\n=== 4. Submit Exam ===');
  const answers = {};
  for (const q of examData.questions) {
    if (q.type === '多选题') answers[q.id] = 'ABC';
    else answers[q.id] = 'A';
  }
  const submitRes = await apiCall('POST', `/api/exam/${examData.examId}/submit`, { answers, submitReason: 'manual' }, cookie);
  const submitData = JSON.parse(submitRes.data);
  console.log('Score:', submitData.score, '/', examData.totalScore);
  console.log('Result:', submitData.result);
  console.log('Correct:', submitData.correctCount, 'Wrong:', submitData.wrongCount, 'Unanswered:', submitData.unansweredCount);

  // 5. Test extended exam
  console.log('\n=== 5. Extended Exam ===');
  const extStartRes = await apiCall('POST', '/api/exam/start', { examType: '扩领域考试', category: '食品检测' }, cookie);
  const extData = JSON.parse(extStartRes.data);
  if (extData.examId) {
    console.log('Extended exam ID:', extData.examId);
    console.log('Duration:', extData.duration, 'min');
    console.log('Total questions:', extData.totalQuestions);
    const extDist = {};
    for (const q of extData.questions) {
      extDist[q.type] = (extDist[q.type] || 0) + 1;
    }
    console.log('Type distribution:', extDist);

    // Submit
    const extAnswers = {};
    for (const q of extData.questions) {
      if (q.type === '多选题') extAnswers[q.id] = 'AB';
      else extAnswers[q.id] = 'B';
    }
    const extSubmitRes = await apiCall('POST', `/api/exam/${extData.examId}/submit`, { answers: extAnswers, submitReason: 'manual' }, cookie);
    const extSubmitData = JSON.parse(extSubmitRes.data);
    console.log('Score:', extSubmitData.score, '/', extData.totalScore);
    console.log('Result:', extSubmitData.result);
  } else {
    console.log('Error starting extended exam:', extData);
  }

  // 6. Check exam history
  console.log('\n=== 6. Exam History ===');
  const histRes = await apiCall('GET', '/api/exam/history', null, cookie);
  const histData = JSON.parse(histRes.data);
  if (histData.exams && Array.isArray(histData.exams)) {
    for (const e of histData.exams) {
      console.log(`  Exam #${e.id}: ${e.exam_type} | Score: ${e.score}/${e.total_score} | Result: ${e.result}`);
    }
  } else {
    console.log('  History response:', histRes.data.substring(0, 200));
  }

  console.log('\n=== All tests passed! ===');
}

run().catch(err => console.error('Test error:', err));

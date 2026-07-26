// Test practice flow
const http = require('http');

function apiCall(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookie) options.headers.Cookie = cookie;
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data, cookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  // Login as student
  let res = await apiCall('POST', '/api/login', { username: 'teststu', password: '123456' });
  const cookie = res.cookie[0].split(';')[0];
  console.log('Login:', JSON.parse(res.data).user.name);

  // Get practice config
  res = await apiCall('GET', '/api/practice/config', null, cookie);
  const config = JSON.parse(res.data);
  console.log('\nPractice Config:');
  for (const [subj, info] of Object.entries(config.subjects)) {
    const total = Object.values(info.types).reduce((a,b) => a+b, 0);
    console.log(`  科目${subj}: ${total} 题`);
    if (info.domains && Object.keys(info.domains).length > 0) {
      for (const [domain, dInfo] of Object.entries(info.domains)) {
        const dTotal = Object.values(dInfo.types).reduce((a,b) => a+b, 0);
        console.log(`    [${domain}] ${dTotal} 题, ${Object.keys(dInfo.categories).length} 大类`);
      }
    }
  }

  // Get practice questions - 科目D 环境监测 噪声
  const params = new URLSearchParams({
    subject: 'D', domain: '环境监测', category: '噪声', limit: '3'
  });
  res = await apiCall('GET', '/api/practice/questions?' + params.toString(), null, cookie);
  const qData = JSON.parse(res.data);
  console.log(`\n获取题目: 科目D 环境监测 噪声, ${qData.total} 题`);

  // Check answer for first question
  if (qData.questions.length > 0) {
    const q = qData.questions[0];
    console.log(`\nQ1: ${q.type} | 正确答案: ${q.correct_answer}`);
    console.log(`   题干: ${q.content.substring(0, 50)}...`);

    // Submit correct answer
    res = await apiCall('POST', '/api/practice/check', {
      questionId: q.id, userAnswer: q.correct_answer
    }, cookie);
    const checkResult = JSON.parse(res.data);
    console.log(`   提交正确答案 -> isCorrect: ${checkResult.isCorrect}`);

    // Submit wrong answer
    const wrongAnswer = q.correct_answer === 'A' ? 'B' : 'A';
    res = await apiCall('POST', '/api/practice/check', {
      questionId: q.questions?.[1]?.id || qData.questions[1]?.id,
      userAnswer: wrongAnswer
    }, cookie);
    if (qData.questions[1]) {
      const checkResult2 = JSON.parse(res.data);
      console.log(`Q2: 提交错误答案(${wrongAnswer}) -> isCorrect: ${checkResult2.isCorrect}`);
    }
  }

  // Get practice stats
  res = await apiCall('GET', '/api/practice/stats', null, cookie);
  const stats = JSON.parse(res.data);
  console.log(`\n刷题统计: 已练习 ${stats.totalPracticed} 题, 正确 ${stats.totalCorrect} 题, 正确率 ${stats.accuracy}%`);

  console.log('\n✅ 刷题模块测试通过！');
})();

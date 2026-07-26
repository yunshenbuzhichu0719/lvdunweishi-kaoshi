const http = require('http');

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 3000, path, method, headers: {} };
    if (cookie) opts.headers['Cookie'] = cookie;
    if (body) opts.headers['Content-Type'] = 'application/json';
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        resolve({ data, cookie: setCookie ? setCookie[0] : null });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  const adminLogin = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
  const adminCookie = adminLogin.cookie;

  await request('POST', '/api/admin/users', {
    username: 'testwrong', password: '123456', name: '错题测试',
    role: 'examinee', position: '技术负责人'
  }, adminCookie);
  console.log('User created: testwrong');

  const stuLogin = await request('POST', '/api/login', { username: 'testwrong', password: '123456' });
  const stuCookie = stuLogin.cookie;

  const qsRes = await request('GET', '/api/practice/questions?subject=A&type=' + encodeURIComponent('单选题') + '&limit=5', null, stuCookie);
  const qsData = JSON.parse(qsRes.data);
  console.log('Got questions:', qsData.questions.length);

  for (let i = 0; i < 3; i++) {
    const q = qsData.questions[i];
    const wrongAnswer = q.correct_answer === 'A' ? 'B' : 'A';
    await request('POST', '/api/practice/check', { questionId: q.id, userAnswer: wrongAnswer }, stuCookie);
    console.log('  Q' + q.id + ' answered wrong (' + wrongAnswer + '), correct=' + q.correct_answer);
  }

  const wrongRes = await request('GET', '/api/practice/questions?subject=A&type=' + encodeURIComponent('单选题') + '&limit=10&mode=wrong', null, stuCookie);
  const wrongData = JSON.parse(wrongRes.data);
  console.log('Wrong questions:', wrongData.questions.length, 'total:', wrongData.total, 'msg:', wrongData.message || 'ok');
  for (const q of wrongData.questions) {
    console.log('  Wrong Q:', q.id, q.content.substring(0, 30));
  }

  const emptyRes = await request('GET', '/api/practice/questions?subject=B&type=' + encodeURIComponent('单选题') + '&limit=10&mode=wrong', null, stuCookie);
  const emptyData = JSON.parse(emptyRes.data);
  console.log('Empty wrong mode:', emptyData.questions.length, emptyData.message || 'ok');

  console.log('Test passed!');
}

test().catch(e => console.error(e.message));

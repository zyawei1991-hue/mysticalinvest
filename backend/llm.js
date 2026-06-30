const https = require('https');

const LLM_API_URL = process.env.LLM_API_URL || 'https://coding.caolele.top/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'glm-4.7';

async function callLLM(prompt) {
  return new Promise((resolve, reject) => {
    if (!LLM_API_KEY) {
      reject(new Error('未设置 LLM_API_KEY 环境变量'));
      return;
    }
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });
    const url = new URL(LLM_API_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LLM_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.choices && result.choices[0]) {
            resolve(result.choices[0].message.content);
          } else {
            reject(new Error('LLM返回异常: ' + body.substring(0, 300)));
          }
        } catch (e) {
          reject(new Error('LLM解析失败: ' + e.message + ' | body: ' + body.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { callLLM };

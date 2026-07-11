const https = require('https');

const LLM_API_URL = process.env.LLM_API_URL || 'https://coding.caolele.top/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'glm-4.7';
const DEFAULT_MAX_TOKENS = 1600;

function resolveMaxTokens(value) {
  const configured = Number(value || process.env.LLM_MAX_TOKENS || DEFAULT_MAX_TOKENS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_TOKENS;
  return Math.max(400, Math.min(4000, Math.round(configured)));
}

async function callLLMWithMeta(prompt, llmOptions = {}) {
  return new Promise((resolve, reject) => {
    if (!LLM_API_KEY) {
      reject(new Error('未设置 LLM_API_KEY 环境变量'));
      return;
    }
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: llmOptions.temperature ?? 0.7,
      max_tokens: resolveMaxTokens(llmOptions.maxTokens)
    });
    const url = new URL(LLM_API_URL);
    const requestOptions = {
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
    const req = https.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error('LLM请求失败: HTTP ' + res.statusCode + ' | ' + body.substring(0, 300)));
            return;
          }
          if (result.choices && result.choices[0]) {
            const choice = result.choices[0];
            resolve({
              content: String(choice.message?.content || ''),
              finishReason: choice.finish_reason || null,
              usage: result.usage || null
            });
          } else {
            reject(new Error('LLM返回异常: ' + body.substring(0, 300)));
          }
        } catch (e) {
          reject(new Error('LLM解析失败: ' + e.message + ' | body: ' + body.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('LLM请求超时')));
    req.write(payload);
    req.end();
  });
}

async function callLLM(prompt, options = {}) {
  const result = await callLLMWithMeta(prompt, options);
  return result.content;
}

module.exports = { callLLM, callLLMWithMeta };

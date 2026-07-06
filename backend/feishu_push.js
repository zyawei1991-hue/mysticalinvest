#!/usr/bin/env node
/**
 * 五行日报 - 飞书群推送脚本
 * 用法: node feishu_push.js <report_type> <card_title> <summary>
 */

const https = require('https');
const http = require('http');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const CHAT_ID = process.env.FEISHU_CHAT_ID;
const SITE_URL = process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/';

function postJson(hostname, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...extraHeaders
    };
    const req = https.request({ hostname, port: 443, path, method: 'POST', headers }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve({ raw: b }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(hostname, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const missing = [];
  if (!APP_ID) missing.push('FEISHU_APP_ID');
  if (!APP_SECRET) missing.push('FEISHU_APP_SECRET');
  if (!CHAT_ID) missing.push('FEISHU_CHAT_ID');
  if (missing.length) {
    console.error('缺少环境变量:', missing.join(', '));
    process.exit(1);
  }

  const reportType = process.argv[2] || 'morning';
  let cardTitle = process.argv[3] || '五行投资日报';
  let summary = process.argv[4] || '';

  if (!process.argv[3] || !process.argv[4]) {
    try {
      const report = await getJson('localhost', 3000, `/api/latest?type=${encodeURIComponent(reportType)}`);
      cardTitle = process.argv[3] || `五行投资日报 ${report.report_date || ''}`;
      summary = process.argv[4] || report.card_summary || summary;
    } catch (e) {
      console.warn(`[${reportType}] 读取本地日报摘要失败:`, e.message);
    }
  }
  summary = summary || '投资日报已生成，点击查看完整市场摘要、行业方向和关注标的。';

  console.log(`[${reportType}] 获取飞书token...`);
  const tokenRes = await postJson('open.feishu.cn', '/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: APP_ID, app_secret: APP_SECRET });
  if (tokenRes.code !== 0) { console.error('Token失败:', tokenRes.msg); process.exit(1); }
  const token = tokenRes.tenant_access_token;

  const typeLabel = { morning: '早盘', noon: '午间', evening: '盘后' }[reportType] || '日报';

  console.log(`[${reportType}] 发送卡片到群...`);
  const sendRes = await postJson('open.feishu.cn', '/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      receive_id: CHAT_ID,
      msg_type: 'interactive',
      content: JSON.stringify({
        header: {
          title: { content: `${cardTitle} - ${typeLabel}版`, tag: 'plain_text' },
          template: 'blue'
        },
        elements: [
          { tag: 'div', text: { content: summary, tag: 'lark_md' } },
          { tag: 'hr' },
          {
            tag: 'action',
            actions: [{
              tag: 'button',
              text: { content: '📊 查看日报详情', tag: 'plain_text' },
              url: SITE_URL,
              type: 'default'
            }]
          }
        ]
      })
    },
    { Authorization: `Bearer ${token}` }
  );

  if (sendRes.code === 0) {
    console.log('✅ 推送成功');
  } else {
    console.error('❌ 推送失败:', sendRes.msg);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function getJson(hostname, port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: requestPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function postWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const data = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: url.hostname,
      port: url.protocol === 'https:' ? 443 : 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  loadEnvFile(path.join(__dirname, '..', '.env'));

  const webhookUrl = process.env.FEISHU_WEBHOOK;
  if (!webhookUrl) {
    console.error('Missing FEISHU_WEBHOOK');
    process.exit(1);
  }

  const reportType = process.argv[2] || 'morning';
  const expectedDate = process.argv[3] || '';
  const siteUrl = process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/';
  const report = await getJson('127.0.0.1', 3000, `/api/latest?type=${encodeURIComponent(reportType)}`);

  if (!report || !report.report_date) {
    console.error(`No report found for type=${reportType}`);
    process.exit(1);
  }
  if (expectedDate && report.report_date !== expectedDate) {
    console.error(`Latest ${reportType} report is ${report.report_date}, expected ${expectedDate}`);
    process.exit(1);
  }

  const typeLabel = { morning: '早盘', noon: '午间', evening: '盘后' }[reportType] || '日报';
  const title = `五行投资日报 ${report.report_date} - ${typeLabel}版`;
  const summary = report.card_summary || '投资日报已生成，点击查看完整市场摘要、行业方向和关注标的。';

  const response = await postWebhook(webhookUrl, {
    msg_type: 'interactive',
    card: {
      header: {
        title: { content: title, tag: 'plain_text' },
        template: 'blue'
      },
      elements: [
        { tag: 'div', text: { content: summary, tag: 'lark_md' } },
        { tag: 'hr' },
        {
          tag: 'action',
          actions: [{
            tag: 'button',
            text: { content: '查看日报详情', tag: 'plain_text' },
            url: siteUrl,
            type: 'default'
          }]
        }
      ]
    }
  });

  console.log(JSON.stringify({
    report_date: report.report_date,
    report_type: report.report_type,
    webhook_code: response.code ?? response.StatusCode,
    webhook_msg: response.msg ?? response.StatusMessage
  }));

  if ((response.code ?? response.StatusCode) !== 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

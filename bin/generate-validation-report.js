#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function requestJson(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const request = http.request({
      hostname: '127.0.0.1',
      port: Number(process.env.PORT || 3000),
      path: requestPath,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          const payload = JSON.parse(raw);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(payload.error || payload.message || `HTTP ${response.statusCode}`));
            return;
          }
          resolve(payload);
        } catch (error) {
          reject(new Error(`validation report response parse failed: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

function postWebhook(urlValue, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const data = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request({
      hostname: url.hostname,
      port: url.protocol === 'https:' ? 443 : 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) }
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (_) { resolve({ raw, statusCode: response.statusCode }); }
      });
    });
    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

function isScheduledTradingBoundary(periodType, now = new Date()) {
  const { get } = require('../backend/database');
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const row = get('SELECT cal_date, is_open FROM ia_trade_cal WHERE cal_date = ?', [date]);
  if (!row || Number(row.is_open) !== 1) return false;
  const next = get(`SELECT cal_date FROM ia_trade_cal WHERE is_open = 1 AND cal_date > ? ORDER BY cal_date LIMIT 1`, [date]);
  if (!next) return false;
  if (periodType === 'month') return next.cal_date.slice(0, 6) !== date.slice(0, 6);
  const nextDate = new Date(`${next.cal_date.slice(0, 4)}-${next.cal_date.slice(4, 6)}-${next.cal_date.slice(6, 8)}T12:00:00Z`);
  return nextDate.getUTCDay() === 1;
}

function buildCard(report) {
  const site = (process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/').replace(/\/?$/, '/');
  const typeLabel = report.period_type === 'week' ? '周报' : '月报';
  const forward = report.forward_validation || {};
  const best = forward.best_case;
  const worst = forward.worst_case;
  const lines = [
    `**证据等级：${report.evidence_level}**`,
    `独立事件 ${report.independent_events?.total || 0} 个；前向到期样本 ${forward.completed || 0} 个`,
    `平均基准超额：${Number.isFinite(Number(forward.avg_benchmark_excess)) ? `${Number(forward.avg_benchmark_excess).toFixed(2)}%` : '数据不足'}`,
    `五行增量：${report.historical_attribution?.comparable ? '已有可比结果' : '候选全集不足，暂不评价'}`,
    `最大正向案例：${best ? `${best.name} ${Number(best.benchmark_excess).toFixed(2)}%` : '暂无到期样本'}`,
    `最大负向案例：${worst ? `${worst.name} ${Number(worst.benchmark_excess).toFixed(2)}%` : '暂无到期样本'}`,
    '',
    '**本期优先事项**',
    ...(report.recommendations || []).slice(0, 3).map((item, index) => `${index + 1}. ${item}`)
  ];
  return {
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: `五行投资验证${typeLabel} · ${report.period_key}` }, template: 'blue' },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
        { tag: 'hr' },
        { tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '查看验证档案' }, url: `${site}#validations`, type: 'default' }] }
      ]
    }
  };
}

async function main() {
  loadEnv(path.join(ROOT, '.env'));
  const periodType = process.argv[2] || 'week';
  if (!['week', 'month'].includes(periodType)) throw new Error('period type must be week or month');
  if (process.argv.includes('--scheduled') && !isScheduledTradingBoundary(periodType)) {
    console.log(JSON.stringify({ skipped: true, reason: 'not the last local trading day of the period', period_type: periodType }));
    return;
  }
  await requestJson('POST', '/api/platform/validations/run', {});
  const report = await requestJson('POST', '/api/platform/validation-reports/generate', { period_type: periodType });
  let pushed = false;
  if (process.env.FEISHU_VALIDATION_REPORT_ENABLED === '1' && process.env.FEISHU_WEBHOOK) {
    const response = await postWebhook(process.env.FEISHU_WEBHOOK, buildCard(report));
    if ((response.code ?? response.statusCode) !== 0) throw new Error(`validation report webhook failed: ${response.msg || response.code || response.statusCode}`);
    pushed = true;
  }
  console.log(JSON.stringify({
    period_type: report.period_type,
    period_key: report.period_key,
    evidence_level: report.evidence_level,
    independent_events: report.independent_events?.total || 0,
    completed_samples: report.forward_validation?.completed || 0,
    pushed
  }));
}

main().catch(error => { console.error(error.message); process.exit(1); });

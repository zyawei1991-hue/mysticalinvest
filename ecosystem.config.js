const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const [name, ...rest] = line.split('=');
    const key = name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    process.env[key] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const env = {
  NODE_ENV: process.env.NODE_ENV || 'production'
};

for (const key of [
  'PORT',
  'MX_APIKEY',
  'LLM_API_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'FEISHU_WEBHOOK_ENABLED',
  'FEISHU_VALIDATION_REPORT_ENABLED',
  'FEISHU_PUSH_UNCHANGED',
  'FEISHU_WEBHOOK',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_CHAT_ID',
  'DAILY_SITE_URL'
]) {
  if (process.env[key]) env[key] = process.env[key];
}

module.exports = {
  apps: [
    {
      name: 'daily-report',
      script: './backend/server.js',
      interpreter: 'C:/tools/node-v18.20.8-win-x64/node.exe',
      cwd: 'C:/www/daily-report',
      env
    },
    {
      name: 'daily-report-weekly-validation',
      script: './bin/generate-validation-report.js',
      args: 'week --scheduled',
      interpreter: 'C:/tools/node-v18.20.8-win-x64/node.exe',
      cwd: 'C:/www/daily-report',
      autorestart: false,
      cron_restart: '10 18 * * 5',
      env
    },
    {
      name: 'daily-report-monthly-validation',
      script: './bin/generate-validation-report.js',
      args: 'month --scheduled',
      interpreter: 'C:/tools/node-v18.20.8-win-x64/node.exe',
      cwd: 'C:/www/daily-report',
      autorestart: false,
      cron_restart: '20 18 28-31 * *',
      env
    }
  ]
};

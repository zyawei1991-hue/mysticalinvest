#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KANBAN_PATH = path.join(ROOT, 'frontend', 'project-kanban-data.json');
const ENV_PATH = path.join(ROOT, '.env');

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

function postJson(hostname, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      port: 443,
      path: requestPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          resolve({ raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
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
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          resolve({ raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function collectPriorityItems(kanban) {
  const priorityRank = {
    'P0-urgent': 0,
    important_urgent: 0,
    P0: 1,
    important: 1
  };
  const rows = [];
  for (const lane of kanban.lanes || []) {
    if (lane.id === 'done') continue;
    for (const item of lane.items || []) {
      const priority = item.priority || '';
      if (!(priority in priorityRank)) continue;
      if (item.status === 'completed') continue;
      rows.push({
        lane: lane.title || lane.id,
        title: item.title,
        owner: item.owner || '未指定',
        status: item.status || 'pending',
        priority,
        due: item.due || '',
        detail: item.detail || '',
        rank: priorityRank[priority]
      });
    }
  }
  return rows
    .sort((a, b) => a.rank - b.rank || String(a.due).localeCompare(String(b.due)) || a.title.localeCompare(b.title))
    .slice(0, 8);
}

function statusText(status) {
  return {
    pending: '待办',
    in_progress: '进行中',
    review: '待确认'
  }[status] || status || '待办';
}

function buildCard(kanban, items) {
  const siteUrl = process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/';
  const kanbanUrl = siteUrl.replace(/\/?$/, '/') + 'project-kanban.html';
  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines = items.length
    ? items.map((item, index) => {
        const due = item.due ? `｜截止 ${item.due}` : '';
        return `${index + 1}. **${item.title}**｜${item.priority}｜${statusText(item.status)}｜${item.owner}${due}\n${item.detail}`;
      }).join('\n\n')
    : '今天没有标记为 P0/P0-urgent 的未完成事项。';

  return {
    header: {
      title: { content: `五行投资日报｜08:00 重要待办 ${today}`, tag: 'plain_text' },
      template: items.some(item => item.rank === 0) ? 'red' : 'orange'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `项目进度：${kanban.overall_progress || 0}%\n当前重点：${kanban.current_focus || '-'}`
        }
      },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: lines } },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { content: '查看项目看板', tag: 'plain_text' },
            url: kanbanUrl,
            type: 'default'
          },
          {
            tag: 'button',
            text: { content: '查看日报', tag: 'plain_text' },
            url: siteUrl,
            type: 'default'
          }
        ]
      }
    ]
  };
}

// Clean outbound card definitions. These override the legacy declarations above,
// which contain terminal-encoding artifacts from earlier edits.
function collectPriorityItems(kanban) {
  const priorityRank = {
    'P0-urgent': 0,
    important_urgent: 0,
    P0: 1,
    important: 1
  };
  const rows = [];
  for (const lane of kanban.lanes || []) {
    if (lane.id === 'done') continue;
    for (const item of lane.items || []) {
      const priority = item.priority || '';
      if (!(priority in priorityRank)) continue;
      if (item.status === 'completed') continue;
      rows.push({
        lane: lane.title || lane.id,
        title: item.title,
        owner: item.owner || '\u672a\u6307\u5b9a',
        status: item.status || 'pending',
        priority,
        due: item.due || '',
        detail: item.detail || '',
        rank: priorityRank[priority]
      });
    }
  }
  return rows
    .sort((a, b) => a.rank - b.rank || String(a.due).localeCompare(String(b.due)) || a.title.localeCompare(b.title))
    .slice(0, 8);
}

function statusText(status) {
  return {
    pending: '\u5f85\u529e',
    in_progress: '\u8fdb\u884c\u4e2d',
    review: '\u5f85\u786e\u8ba4'
  }[status] || status || '\u5f85\u529e';
}

function buildCard(kanban, items) {
  const siteUrl = process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/';
  const kanbanUrl = siteUrl.replace(/\/?$/, '/') + 'project-kanban.html';
  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines = items.length
    ? items.map((item, index) => {
        const due = item.due ? ` | \u622a\u6b62 ${item.due}` : '';
        return `${index + 1}. **${item.title}** | ${item.priority} | ${statusText(item.status)} | ${item.owner}${due}\n${item.detail}`;
      }).join('\n\n')
    : '\u4eca\u5929\u6ca1\u6709\u6807\u8bb0\u4e3a P0/P0-urgent \u7684\u672a\u5b8c\u6210\u4e8b\u9879\u3002';

  return {
    header: {
      title: { content: `\u4e94\u884c\u6295\u8d44\u65e5\u62a5 | 8:00 \u91cd\u8981\u5f85\u529e ${today}`, tag: 'plain_text' },
      template: items.some(item => item.rank === 0) ? 'red' : 'orange'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `\u9879\u76ee\u8fdb\u5ea6\uff1a${kanban.overall_progress || 0}%\n\u5f53\u524d\u91cd\u70b9\uff1a${kanban.current_focus || '-'}`
        }
      },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: lines } },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { content: '\u67e5\u770b\u9879\u76ee\u770b\u677f', tag: 'plain_text' },
            url: kanbanUrl,
            type: 'default'
          },
          {
            tag: 'button',
            text: { content: '\u67e5\u770b\u65e5\u62a5', tag: 'plain_text' },
            url: siteUrl,
            type: 'default'
          }
        ]
      }
    ]
  };
}

async function sendByApp(card) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const chatId = process.env.FEISHU_CHAT_ID;
  if (!appId || !appSecret || !chatId) return null;

  const tokenRes = await postJson('open.feishu.cn', '/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId,
    app_secret: appSecret
  });
  if (tokenRes.code !== 0) {
    throw new Error(`tenant token failed: ${tokenRes.msg || tokenRes.code}`);
  }

  return postJson('open.feishu.cn', '/open-apis/im/v1/messages?receive_id_type=chat_id', {
    receive_id: chatId,
    msg_type: 'interactive',
    content: JSON.stringify(card)
  }, {
    Authorization: `Bearer ${tokenRes.tenant_access_token}`
  });
}

async function main() {
  loadEnvFile(ENV_PATH);
  const dryRun = process.argv.includes('--dry-run');
  const kanban = JSON.parse(fs.readFileSync(KANBAN_PATH, 'utf8'));
  const items = collectPriorityItems(kanban);
  const card = buildCard(kanban, items);

  if (dryRun) {
    console.log(JSON.stringify({ items, card }, null, 2));
    return;
  }

  let response = await sendByApp(card);
  if (!response) {
    const webhook = process.env.FEISHU_WEBHOOK;
    if (!webhook) throw new Error('Missing FEISHU app identity and FEISHU_WEBHOOK');
    response = await postWebhook(webhook, { msg_type: 'interactive', card });
  }

  console.log(JSON.stringify({
    item_count: items.length,
    code: response.code ?? response.StatusCode,
    msg: response.msg ?? response.StatusMessage
  }));

  if ((response.code ?? response.StatusCode) !== 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_PATH = path.join(ROOT, '.project-memory.local.json');
const KANBAN_PATH = path.join(ROOT, 'frontend', 'project-kanban-data.json');

const FIELD_ORDER = ['任务', '状态', '优先级', '截止日期', '负责人', '模块', '备注'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function firstCell(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function baseStatusToLocal(status) {
  return {
    '待开始': 'pending',
    '进行中': 'in_progress',
    '待确认': 'review',
    '已完成': 'completed',
    '阻塞': 'failed'
  }[status] || status || 'pending';
}

function flattenKanban(kanban) {
  const rows = [];
  for (const lane of kanban.lanes || []) {
    for (const item of lane.items || []) {
      rows.push({
        title: item.title || '',
        status: item.status || 'pending',
        priority: item.priority || '',
        due: normalizeDate(item.due),
        owner: item.owner || '',
        lane: lane.id,
        detail: item.detail || ''
      });
    }
  }
  return rows.filter(row => row.title);
}

function runLark(args) {
  const command = ['lark-cli', ...args].join(' ');
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true
      })
    : spawnSync('lark-cli', args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `lark-cli failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function readBaseRows(memory) {
  const table = memory.feishu_base.table;
  const args = [
    'base', '+record-list',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', table.table_id,
    '--limit', '200',
    '--format', 'json'
  ];
  for (const field of FIELD_ORDER) {
    args.push('--field-id', field);
  }

  const parsed = JSON.parse(runLark(args));
  const data = parsed.data || {};
  return (data.data || []).map((row, index) => ({
    record_id: (data.record_id_list || [])[index] || '',
    title: firstCell(row[0]),
    status: baseStatusToLocal(firstCell(row[1])),
    priority: firstCell(row[2]),
    due: normalizeDate(row[3]),
    owner: firstCell(row[4]),
    module: firstCell(row[5]),
    detail: row[6] || ''
  })).filter(row => row.title);
}

function keyed(rows) {
  return new Map(rows.map(row => [row.title, row]));
}

function diffRows(baseRows, localRows) {
  const baseByTitle = keyed(baseRows);
  const localByTitle = keyed(localRows);
  const onlyInBase = baseRows.filter(row => !localByTitle.has(row.title));
  const onlyInLocal = localRows.filter(row => !baseByTitle.has(row.title));
  const changed = [];

  for (const base of baseRows) {
    const local = localByTitle.get(base.title);
    if (!local) continue;
    const fields = {};
    for (const key of ['status', 'priority', 'due', 'owner', 'detail']) {
      if (String(base[key] || '') !== String(local[key] || '')) {
        fields[key] = { base: base[key] || '', local: local[key] || '' };
      }
    }
    if (Object.keys(fields).length) {
      changed.push({ title: base.title, fields });
    }
  }

  return { onlyInBase, onlyInLocal, changed };
}

function main() {
  if (!fs.existsSync(MEMORY_PATH)) {
    throw new Error(`Missing local project memory: ${MEMORY_PATH}`);
  }
  const memory = readJson(MEMORY_PATH);
  const kanban = readJson(KANBAN_PATH);
  const baseRows = readBaseRows(memory);
  const localRows = flattenKanban(kanban);
  const diff = diffRows(baseRows, localRows);

  console.log(JSON.stringify({
    mode: 'preview',
    base: {
      url: memory.feishu_base.url,
      table: memory.feishu_base.table.name,
      count: baseRows.length
    },
    local: {
      path: path.relative(ROOT, KANBAN_PATH),
      count: localRows.length
    },
    diff: {
      only_in_base: diff.onlyInBase.map(row => row.title),
      only_in_local: diff.onlyInLocal.map(row => row.title),
      changed: diff.changed
    },
    next_step: 'Review this diff before running any write sync.'
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

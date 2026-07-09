#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_PATH = path.join(ROOT, '.project-memory.local.json');
const KANBAN_PATH = path.join(ROOT, 'frontend', 'project-kanban-data.json');
const TEMP_DIR = path.join(ROOT, 'outputs', 'base-sync-temp');

const FIELDS = {
  title: '\u4efb\u52a1',
  status: '\u72b6\u6001',
  priority: '\u4f18\u5148\u7ea7',
  due: '\u622a\u6b62\u65e5\u671f',
  owner: '\u8d1f\u8d23\u4eba',
  module: '\u6a21\u5757',
  detail: '\u5907\u6ce8'
};

const FIELD_ORDER = [
  FIELDS.title,
  FIELDS.status,
  FIELDS.priority,
  FIELDS.due,
  FIELDS.owner,
  FIELDS.module,
  FIELDS.detail
];

const TITLE_ALIASES = {
  '\u8865\u9f50\u5408\u89c4\u514d\u8d23\u58f0\u660e': '\u5408\u89c4\u514d\u8d23\u58f0\u660e\u5168\u94fe\u8def\u8865\u9f50',
  '\u56e0\u5b50\u8ba1\u7b97\u6846\u67b6\u5de5\u7a0b\u5316': '\u884c\u4e1a\u591a\u5c5e\u6027\u8bc4\u5206\u5de5\u7a0b\u5316'
};

const BASE_TO_LOCAL_STATUS = {
  '\u5f85\u5f00\u59cb': 'pending',
  '\u8fdb\u884c\u4e2d': 'in_progress',
  '\u5f85\u786e\u8ba4': 'review',
  '\u5df2\u5b8c\u6210': 'completed',
  '\u963b\u585e': 'failed'
};

const LOCAL_TO_BASE_STATUS = {
  pending: '\u5f85\u5f00\u59cb',
  in_progress: '\u8fdb\u884c\u4e2d',
  review: '\u5f85\u786e\u8ba4',
  completed: '\u5df2\u5b8c\u6210',
  failed: '\u963b\u585e'
};

const LANE_BY_STATUS = {
  in_progress: 'doing',
  review: 'review',
  completed: 'done',
  pending: 'backlog',
  failed: 'backlog'
};

const PRIORITY_RANK = {
  'P0-urgent': 0,
  P0: 1,
  important: 1,
  P1: 2,
  P2: 3,
  P3: 4
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function firstCell(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function canonicalTitle(title) {
  return TITLE_ALIASES[title] || title;
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

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `lark-cli failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function runLarkJson(args) {
  return JSON.parse(runLark(args));
}

function tempJsonFile(prefix, value) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const safePrefix = String(prefix).replace(/[^A-Za-z0-9_-]/g, '_');
  const filePath = path.join(TEMP_DIR, `${safePrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeJson(filePath, value);
  return filePath;
}

function larkFileArg(filePath) {
  return `@${path.relative(ROOT, filePath).replace(/\\/g, '/')}`;
}

function readBaseRows(memory) {
  const args = [
    'base', '+record-list',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', memory.feishu_base.table.table_id,
    '--limit', '200',
    '--format', 'json'
  ];
  for (const field of FIELD_ORDER) args.push('--field-id', field);

  const parsed = runLarkJson(args);
  const data = parsed.data || {};
  return (data.data || []).map((row, index) => ({
    record_id: (data.record_id_list || [])[index] || '',
    source: 'base',
    title: firstCell(row[0]),
    canonical_title: canonicalTitle(firstCell(row[0])),
    status: BASE_TO_LOCAL_STATUS[firstCell(row[1])] || firstCell(row[1]) || 'pending',
    priority: firstCell(row[2]),
    due: normalizeDate(row[3]),
    owner: firstCell(row[4]),
    module: firstCell(row[5]),
    detail: row[6] || ''
  })).filter(row => row.title);
}

function flattenKanban(kanban) {
  const rows = [];
  for (const lane of kanban.lanes || []) {
    for (const item of lane.items || []) {
      rows.push({
        source: 'local',
        title: item.title || '',
        canonical_title: canonicalTitle(item.title || ''),
        status: item.status || 'pending',
        priority: item.priority === 'done' ? '' : (item.priority || ''),
        due: normalizeDate(item.due),
        owner: item.owner || '',
        module: item.module || '',
        lane: lane.id,
        detail: item.detail || ''
      });
    }
  }
  return rows.filter(row => row.title);
}

function groupByCanonical(baseRows, localRows) {
  const groups = new Map();
  for (const row of [...baseRows, ...localRows]) {
    const key = row.canonical_title;
    if (!groups.has(key)) groups.set(key, { title: key, base: [], local: [] });
    groups.get(key)[row.source].push(row);
  }
  return [...groups.values()];
}

function preferRow(rows, canonical) {
  if (!rows.length) return null;
  return rows.find(row => row.title === canonical) || rows[0];
}

function chooseValue(primary, fallback, key) {
  if (primary && primary[key] !== undefined && primary[key] !== null && primary[key] !== '') return primary[key];
  if (fallback && fallback[key] !== undefined && fallback[key] !== null && fallback[key] !== '') return fallback[key];
  return '';
}

function deriveModule(row) {
  const text = `${row.owner || ''} ${row.title || ''}`;
  if (/\u6570\u636e|Tushare|\u884c\u60c5|\u56de\u6d4b|\u8d44\u91d1|\u91cf\u80fd/.test(text)) return '\u6570\u636e';
  if (/\u5408\u89c4|\u514d\u8d23|\u5ba1\u6838/.test(text)) return '\u5408\u89c4';
  if (/\u5546\u4e1a|B2B/.test(text)) return '\u5546\u4e1a';
  if (/\u589e\u957f|\u843d\u5730\u9875/.test(text)) return '\u589e\u957f';
  if (/\u8fd0\u8425|\u79cd\u5b50|\u534f\u4f5c/.test(text)) return '\u8fd0\u8425';
  if (/\u4ea7\u54c1|UI|\u65e5\u62a5|\u7528\u6237|\u4f1a\u5458|\u6a21\u677f/.test(text)) return '\u4ea7\u54c1';
  return '\u6280\u672f';
}

function mergeRows(baseRows, localRows) {
  return groupByCanonical(baseRows, localRows).map(group => {
    const local = preferRow(group.local, group.title);
    const base = preferRow(group.base, group.title);
    const primary = local || base;
    const fallback = local ? base : null;
    const merged = {
      title: group.title,
      status: chooseValue(primary, fallback, 'status') || 'pending',
      priority: chooseValue(primary, fallback, 'priority'),
      due: chooseValue(primary, fallback, 'due'),
      owner: chooseValue(primary, fallback, 'owner'),
      module: chooseValue(primary, fallback, 'module'),
      detail: chooseValue(primary, fallback, 'detail'),
      base_records: group.base,
      local_records: group.local
    };
    if (!merged.module) merged.module = deriveModule(merged);
    return merged;
  });
}

function sortItems(items) {
  return items.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    return pa - pb || String(a.due || '9999-99-99').localeCompare(String(b.due || '9999-99-99')) || a.title.localeCompare(b.title, 'zh-CN');
  });
}

function updateLocalKanban(kanban, mergedRows) {
  const lanes = new Map((kanban.lanes || []).map(lane => [lane.id, { ...lane, items: [] }]));
  for (const id of ['doing', 'review', 'done', 'backlog']) {
    if (!lanes.has(id)) lanes.set(id, { id, title: id, items: [] });
  }

  for (const row of mergedRows) {
    const laneId = LANE_BY_STATUS[row.status] || 'backlog';
    const item = {
      title: row.title,
      owner: row.owner,
      status: row.status,
      detail: row.detail
    };
    if (row.priority) item.priority = row.priority;
    if (row.due) item.due = row.due;
    if (row.module) item.module = row.module;
    lanes.get(laneId).items.push(item);
  }

  for (const lane of lanes.values()) sortItems(lane.items);

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  kanban.last_updated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  kanban.lanes = ['doing', 'review', 'done', 'backlog'].map(id => lanes.get(id));
  return kanban;
}

function fieldGet(memory, fieldName) {
  const parsed = runLarkJson([
    'base', '+field-get',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', memory.feishu_base.table.table_id,
    '--field-id', fieldName,
    '--format', 'json'
  ]);
  return parsed.data.field;
}

function optionHue(name, fieldName) {
  if (fieldName === FIELDS.priority) {
    return {
      'P0-urgent': 'Red',
      P0: 'Orange',
      P1: 'Wathet',
      P2: 'Yellow',
      P3: 'Turquoise'
    }[name] || 'Blue';
  }
  return 'Blue';
}

function ensureSelectOptions(memory, fieldName, requiredNames) {
  const field = fieldGet(memory, fieldName);
  const existing = field.options || [];
  const names = new Set(existing.map(option => option.name));
  const missing = [...new Set(requiredNames.filter(Boolean))].filter(name => !names.has(name));
  if (!missing.length) return { field: fieldName, added: [] };

  const next = {
    name: field.name,
    type: field.type,
    multiple: Boolean(field.multiple),
    options: [
      ...existing,
      ...missing.map(name => ({ name, hue: optionHue(name, fieldName), lightness: 'Lighter' }))
    ]
  };
  const temp = tempJsonFile(`field-${fieldName}`, next);
  runLark([
    'base', '+field-update',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', memory.feishu_base.table.table_id,
    '--field-id', field.id || fieldName,
    '--json', larkFileArg(temp),
    '--yes',
    '--format', 'json'
  ]);
  return { field: fieldName, added: missing };
}

function recordPayload(row) {
  return {
    [FIELDS.title]: row.title,
    [FIELDS.status]: LOCAL_TO_BASE_STATUS[row.status] || LOCAL_TO_BASE_STATUS.pending,
    [FIELDS.priority]: row.priority || null,
    [FIELDS.due]: row.due ? `${row.due} 00:00:00` : null,
    [FIELDS.owner]: row.owner ? [row.owner] : null,
    [FIELDS.module]: row.module || null,
    [FIELDS.detail]: row.detail || ''
  };
}

function upsertBaseRecord(memory, row, recordId) {
  const temp = tempJsonFile('record', recordPayload(row));
  const args = [
    'base', '+record-upsert',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', memory.feishu_base.table.table_id,
    '--json', larkFileArg(temp),
    '--format', 'json'
  ];
  if (recordId) args.push('--record-id', recordId);
  return runLarkJson(args);
}

function deleteBaseRecords(memory, recordIds) {
  if (!recordIds.length) return null;
  const args = [
    'base', '+record-delete',
    '--base-token', memory.feishu_base.base_token,
    '--table-id', memory.feishu_base.table.table_id,
    '--yes',
    '--format', 'json'
  ];
  for (const id of recordIds) args.push('--record-id', id);
  return runLarkJson(args);
}

function buildPlan(mergedRows, baseRows, localRows) {
  const updateBase = mergedRows.filter(row => row.base_records.length > 0);
  const createBase = mergedRows.filter(row => row.base_records.length === 0);
  const deleteDuplicates = mergedRows.flatMap(row => row.base_records.slice(1).map(record => ({ title: row.title, record_id: record.record_id })));
  const localDuplicateTitles = localRows
    .filter(row => canonicalTitle(row.title) !== row.title)
    .map(row => ({ old: row.title, canonical: canonicalTitle(row.title) }));
  return {
    base_before: baseRows.length,
    local_before: localRows.length,
    merged: mergedRows.length,
    update_base: updateBase.length,
    create_base: createBase.length,
    delete_duplicate_base: deleteDuplicates,
    local_title_aliases_removed: localDuplicateTitles
  };
}

function applySync(memory, kanban, mergedRows) {
  const priorityNames = mergedRows.map(row => row.priority).filter(Boolean);
  const ownerNames = mergedRows.map(row => row.owner).filter(Boolean);
  const optionUpdates = [
    ensureSelectOptions(memory, FIELDS.priority, priorityNames),
    ensureSelectOptions(memory, FIELDS.owner, ownerNames)
  ];

  let updated = 0;
  let created = 0;
  const deleted = [];
  for (const row of mergedRows) {
    const primaryRecord = row.base_records[0];
    if (primaryRecord) {
      upsertBaseRecord(memory, row, primaryRecord.record_id);
      updated += 1;
      const duplicates = row.base_records.slice(1).map(record => record.record_id);
      if (duplicates.length) {
        deleteBaseRecords(memory, duplicates);
        deleted.push(...duplicates);
      }
    } else {
      upsertBaseRecord(memory, row, null);
      created += 1;
    }
  }

  updateLocalKanban(kanban, mergedRows);
  writeJson(KANBAN_PATH, kanban);
  return { option_updates: optionUpdates, updated, created, deleted };
}

function main() {
  const apply = process.argv.includes('--apply');
  if (!fs.existsSync(MEMORY_PATH)) throw new Error(`Missing local project memory: ${MEMORY_PATH}`);

  const memory = readJson(MEMORY_PATH);
  const kanban = readJson(KANBAN_PATH);
  const baseRows = readBaseRows(memory);
  const localRows = flattenKanban(kanban);
  const mergedRows = mergeRows(baseRows, localRows);
  const plan = buildPlan(mergedRows, baseRows, localRows);

  let result = null;
  if (apply) result = applySync(memory, kanban, mergedRows);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    base: { table: memory.feishu_base.table.name, count: baseRows.length },
    local: { path: path.relative(ROOT, KANBAN_PATH), count: localRows.length },
    plan,
    result,
    next_step: apply ? 'Run preview again to verify both sides are aligned.' : 'Run with --apply to update Base and local kanban.'
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

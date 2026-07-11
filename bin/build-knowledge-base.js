#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KB_DIR = path.join(ROOT, 'docs', 'kb');
const FRONTEND_JSON = path.join(ROOT, 'frontend', 'knowledge-base-data.json');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && entry.name.endsWith('.md')) return [fullPath];
    return [];
  });
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;

  lines.forEach(line => {
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(cleanScalar(listMatch[1]));
      return;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) return;
    currentKey = kv[1];
    const value = kv[2].trim();
    meta[currentKey] = value === '' ? [] : cleanScalar(value);
  });

  return { meta, body: text.slice(match[0].length) };
}

function cleanScalar(value) {
  return String(value || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(body, heading) {
  const lines = String(body || '').split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^##\s+(.+?)\s*$/);
    if (match && match[1].trim() === heading) {
      start = i + 1;
      break;
    }
  }

  if (start < 0) return '';
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n').trim();
}

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildItem(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const title = meta.title || path.basename(filePath, '.md');
  const conclusion = stripMarkdown(extractSection(body, '\u7ed3\u8bba'));
  const dailyUse = stripMarkdown(extractSection(body, '\u7528\u5728\u65e5\u62a5\u91cc'));
  const forbidden = stripMarkdown(extractSection(body, '\u7981\u6b62\u7528\u6cd5'));
  const plain = stripMarkdown(body);

  return {
    id: meta.id || relPath.replace(/[/.]/g, '-'),
    title,
    domain: meta.domain || relPath.split('/')[2] || 'general',
    status: meta.status || 'draft',
    confidence: meta.confidence || 'medium',
    source: meta.source || relPath,
    owner: meta.owner || '',
    updated: meta.updated || '',
    usable_for: normalizeList(meta.usable_for),
    tags: normalizeList(meta.tags),
    path: relPath,
    summary: conclusion || plain.slice(0, 220),
    daily_use: dailyUse,
    forbidden_use: forbidden,
    content: plain,
    content_preview: plain.slice(0, 900)
  };
}

function main() {
  const items = walk(KB_DIR)
    .map(buildItem)
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title));

  const domains = {};
  items.forEach(item => {
    if (!domains[item.domain]) domains[item.domain] = { count: 0, active: 0, draft: 0 };
    domains[item.domain].count += 1;
    if (item.status === 'active') domains[item.domain].active += 1;
    if (item.status === 'draft') domains[item.domain].draft += 1;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    version: 'kb-mvp-1',
    sourceDir: 'docs/kb',
    itemCount: items.length,
    domains,
    items
  };

  fs.writeFileSync(FRONTEND_JSON, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({
    ok: true,
    output: FRONTEND_JSON,
    itemCount: items.length,
    domains
  }, null, 2));
}

main();

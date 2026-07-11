#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INBOX_DIR = path.join(ROOT, 'docs', 'kb-inbox', 'files');
const DRAFT_DIR = path.join(ROOT, 'docs', 'kb-drafts');
const AUDIT_LOG = path.join(ROOT, 'data', 'kb-audit-log.jsonl');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function stamp() {
  const d = new Date();
  const pad = value => String(value).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('');
}

function safeName(value, fallback = 'knowledge-file') {
  const name = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return name || fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function readSourcePreview(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return 'Binary or non-UTF8 file. Please review the uploaded source directly.';
  }
  if (ext === '.html' || ext === '.htm') return stripHtml(raw).slice(0, 3000);
  return raw.replace(/\s+/g, ' ').trim().slice(0, 3000);
}

function inferDomain(text) {
  const haystack = String(text || '').toLowerCase();
  if (/合规|免责声明|禁用|边界|compliance|disclaimer/.test(haystack)) return 'compliance';
  if (/回测|验证|rank ic|spread|backtest|validation/.test(haystack)) return 'strategy';
  if (/etf|行业|申万|市场|行情|market|industry/.test(haystack)) return 'market';
  if (/月运|五行|紫微|建除|干支|节气|玄学|dongxuan|wuxing/.test(haystack)) return 'dongxuan';
  if (/日报|文案|用户|输出|卡片|output|persona/.test(haystack)) return 'output';
  return 'strategy';
}

function appendAudit(event) {
  ensureDir(path.dirname(AUDIT_LOG));
  fs.appendFileSync(AUDIT_LOG, `${JSON.stringify(event)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.source) {
    console.error('Usage: node bin/import-kb-file.js --source <file> [--title <title>] [--domain <domain>] [--usable-for daily_report]');
    process.exit(1);
  }

  const sourcePath = path.resolve(args.source);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  ensureDir(INBOX_DIR);
  ensureDir(DRAFT_DIR);

  const now = stamp();
  const ext = path.extname(sourcePath);
  const base = safeName(path.basename(sourcePath, ext));
  const inboxFile = path.join(INBOX_DIR, `${now}-${base}${ext}`);
  fs.copyFileSync(sourcePath, inboxFile);

  const preview = readSourcePreview(sourcePath);
  const domain = args.domain || inferDomain(`${sourcePath} ${preview}`);
  const title = args.title || path.basename(sourcePath, ext);
  const usableFor = args['usable-for'] || 'daily_report';
  const draftFile = path.join(DRAFT_DIR, `${now}-${base}.md`);
  const relInbox = path.relative(ROOT, inboxFile).replace(/\\/g, '/');
  const relDraft = path.relative(ROOT, draftFile).replace(/\\/g, '/');

  const draft = `---
id: draft.investment.${now}.${base}
title: ${title}
domain: ${domain}
status: draft
confidence: low
source: ${relInbox}
owner: app-kb-curator
updated: ${new Date().toISOString().slice(0, 10)}
usable_for:
  - ${usableFor}
tags:
  - file-import
  - investment-daily
---

## 结论

待审核。此知识卡由定期文件导入自动生成，只能作为投资日报子知识库草稿。

## 来源摘要

- 来源文件：\`${relInbox}\`
- 推断领域：\`${domain}\`
- 初始用途：\`${usableFor}\`

## 用在日报里

- 审核通过前，不进入日报 active 知识。
- 审核时需要判断它属于母库理论、投资日报映射、输出规范、合规边界还是案例复盘。
- 如可用于投资日报，应补充适用场景、禁用边界、证据来源和验证状态。

## 禁止用法

- 不得直接把本草稿作为日报程序调用依据。
- 不得把未验证的玄学信号写成投资建议。
- 不得删除来源文件和审计日志。

## 待审核问题

1. 这份材料是否属于投资日报子知识库。
2. 是否应回写母知识库。
3. 是否需要拆成多张知识卡。
4. 是否有合规风险或商业边界风险。
5. 是否需要回测或案例复盘支持。

## 原文摘录

\`\`\`text
${preview || 'No text preview available.'}
\`\`\`
`;

  fs.writeFileSync(draftFile, draft, 'utf8');
  appendAudit({
    event_type: 'kb_file_imported',
    source: path.relative(ROOT, sourcePath).replace(/\\/g, '/'),
    inbox_file: relInbox,
    draft_file: relDraft,
    domain,
    usable_for: usableFor,
    actor: 'import-kb-file',
    created_at: new Date().toISOString()
  });

  process.stdout.write(JSON.stringify({
    ok: true,
    inbox_file: relInbox,
    draft_file: relDraft,
    domain,
    usable_for: usableFor
  }, null, 2));
}

main();

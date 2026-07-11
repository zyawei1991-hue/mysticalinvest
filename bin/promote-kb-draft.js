#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KB_DIR = path.join(ROOT, 'docs', 'kb');
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

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metaText: '', body: text };
  return { metaText: match[1], body: text.slice(match[0].length) };
}

function metaValue(metaText, key) {
  const match = metaText.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : '';
}

function setMeta(metaText, key, value) {
  const line = `${key}: ${value}`;
  const pattern = new RegExp(`^${key}:.*$`, 'm');
  if (pattern.test(metaText)) return metaText.replace(pattern, line);
  return `${metaText.trim()}\n${line}`;
}

function safeName(value, fallback = 'knowledge-card') {
  const name = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return name || fallback;
}

function appendAudit(event) {
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  fs.appendFileSync(AUDIT_LOG, `${JSON.stringify(event)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.draft) {
    console.error('Usage: node bin/promote-kb-draft.js --draft <draft.md> [--domain strategy] [--reviewer name]');
    process.exit(1);
  }

  const draftPath = path.resolve(args.draft);
  if (!fs.existsSync(draftPath)) {
    console.error(`Draft file not found: ${draftPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(draftPath, 'utf8');
  let { metaText, body } = parseFrontMatter(raw);
  const domain = args.domain || metaValue(metaText, 'domain') || 'strategy';
  const reviewer = args.reviewer || 'manual-review';
  const title = metaValue(metaText, 'title') || path.basename(draftPath, '.md');
  const filename = `${safeName(path.basename(draftPath, '.md'))}.md`;
  const targetDir = path.join(KB_DIR, domain);
  const targetPath = path.join(targetDir, filename);

  if (fs.existsSync(targetPath)) {
    console.error(`Target already exists: ${targetPath}`);
    process.exit(1);
  }

  metaText = setMeta(metaText, 'status', 'active');
  metaText = setMeta(metaText, 'confidence', args.confidence || 'medium');
  metaText = setMeta(metaText, 'reviewer', reviewer);
  metaText = setMeta(metaText, 'updated', new Date().toISOString().slice(0, 10));

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, `---\n${metaText.trim()}\n---\n\n${body.trim()}\n`, 'utf8');
  appendAudit({
    event_type: 'kb_draft_promoted',
    draft_file: path.relative(ROOT, draftPath).replace(/\\/g, '/'),
    target_file: path.relative(ROOT, targetPath).replace(/\\/g, '/'),
    domain,
    title,
    reviewer,
    actor: 'promote-kb-draft',
    created_at: new Date().toISOString()
  });

  process.stdout.write(JSON.stringify({
    ok: true,
    target_file: path.relative(ROOT, targetPath).replace(/\\/g, '/'),
    domain,
    reviewer
  }, null, 2));
}

main();

const fs = require('fs');
const path = require('path');

const KB_JSON = path.join(__dirname, '../frontend/knowledge-base-data.json');

function loadKnowledgeBase() {
  if (!fs.existsSync(KB_JSON)) {
    return {
      generatedAt: null,
      version: 'missing',
      itemCount: 0,
      domains: {},
      items: []
    };
  }
  return JSON.parse(fs.readFileSync(KB_JSON, 'utf8'));
}

function searchKnowledgeBase(options = {}) {
  const kb = loadKnowledgeBase();
  const query = String(options.query || '').trim().toLowerCase();
  const domain = String(options.domain || '').trim();
  const usableFor = String(options.usable_for || '').trim();
  const status = String(options.status || '').trim();
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));

  let items = kb.items || [];
  if (domain) items = items.filter(item => item.domain === domain);
  if (usableFor) items = items.filter(item => (item.usable_for || []).includes(usableFor));
  if (status) items = items.filter(item => item.status === status);
  if (query) {
    items = items.filter(item => {
      const haystack = [
        item.id,
        item.title,
        item.summary,
        item.daily_use,
        item.forbidden_use,
        item.content,
        ...(item.tags || [])
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  return {
    ...kb,
    items: items.slice(0, limit),
    totalMatched: items.length
  };
}

module.exports = {
  loadKnowledgeBase,
  searchKnowledgeBase
};


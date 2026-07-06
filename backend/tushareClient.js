const { loadEnv } = require('./envLoader');

loadEnv();

function ymd(date) {
  return String(date).replace(/-/g, '').slice(0, 8);
}

function dashDate(value) {
  const s = String(value || '');
  if (s.includes('-')) return s.slice(0, 10);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tushareCall(apiName, params, fields, options) {
  const endpoint = process.env.TUSHARE_API_URL || 'http://api.tushare.pro';
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new Error('TUSHARE_TOKEN is not configured');
  const timeoutMs = Number((options && options.timeoutMs) || process.env.TUSHARE_TIMEOUT_MS || 30000);
  const retries = Number((options && options.retries) || process.env.TUSHARE_RETRIES || 3);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: apiName,
          token,
          params: params || {},
          fields: fields || ''
        }),
        signal: controller.signal
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error(`Tushare ${apiName} JSON parse failed: ${error.message}; body=${text.slice(0, 200)}`);
      }
      if (json.code !== 0) {
        throw new Error(`Tushare ${apiName} failed: ${json.msg || json.message || JSON.stringify(json).slice(0, 200)}`);
      }
      return json;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        lastError = new Error(`Tushare ${apiName} timeout after ${timeoutMs}ms`);
      } else {
        lastError = error;
      }
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function rowsFromResponse(json) {
  const fields = (json.data && json.data.fields) || [];
  const items = (json.data && json.data.items) || [];
  return items.map(item => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

async function fetchPaged(apiName, params, fields, options) {
  const pageSize = Number((options && options.pageSize) || 6000);
  const maxPages = Number((options && options.maxPages) || 10000);
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const json = await tushareCall(apiName, { ...(params || {}), limit: pageSize, offset }, fields, options);
    const batch = rowsFromResponse(json);
    rows.push(...batch);
    if (options && options.onPage) options.onPage({ apiName, offset, rows: batch.length, total: rows.length });
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function fetchPagedBatches(apiName, params, fields, options, onBatch) {
  const pageSize = Number((options && options.pageSize) || 6000);
  const maxPages = Number((options && options.maxPages) || 10000);
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const json = await tushareCall(apiName, { ...(params || {}), limit: pageSize, offset }, fields, options);
    const batch = rowsFromResponse(json);
    total += batch.length;
    if (batch.length) await onBatch(batch, { apiName, offset, rows: batch.length, total });
    if (options && options.onPage) options.onPage({ apiName, offset, rows: batch.length, total });
    if (batch.length < pageSize) break;
  }
  return total;
}

module.exports = {
  ymd,
  dashDate,
  tushareCall,
  rowsFromResponse,
  fetchPaged,
  fetchPagedBatches
};

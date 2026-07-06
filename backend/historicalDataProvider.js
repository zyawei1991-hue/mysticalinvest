const { spawnSync } = require('child_process');
const https = require('https');
const { run, all } = require('./database');
const { getIndustryProxy, getBenchmarkProxy } = require('./industryProxyMap');

function ymd(date) {
  return String(date).replace(/-/g, '').slice(0, 8);
}

function dashDate(date) {
  const s = String(date);
  if (s.includes('-')) return s.slice(0, 10);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(symbol) {
  if (!symbol) return '';
  const s = String(symbol).trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ|CSI)$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6') || s.startsWith('5')) return `${s}.SH`;
    return `${s}.SZ`;
  }
  return s;
}

function symbolToEastmoneySecid(symbol) {
  const normalized = normalizeSymbol(symbol);
  const [code, market] = normalized.split('.');
  if (market === 'SH' || market === 'CSI') return `1.${code}`;
  if (market === 'SZ') return `0.${code}`;
  return symbol;
}

function inferTushareApi(symbol, instrumentType) {
  const normalized = normalizeSymbol(symbol);
  if (instrumentType === 'fund') return 'fund_daily';
  if (instrumentType === 'index') return 'index_daily';
  if (normalized.endsWith('.CSI')) return 'index_daily';
  if (/^0{3}\d{3}\./.test(normalized) || /^399\d{3}\./.test(normalized)) return 'index_daily';
  if (/^(5|1)\d{5}\./.test(normalized)) return 'fund_daily';
  return 'daily';
}

function saveBars(provider, symbol, bars) {
  const normalized = normalizeSymbol(symbol);
  const sql = `INSERT INTO historical_daily_bars (
    provider, symbol, trade_date, open, high, low, close, pre_close, pct_chg, volume, amount, raw_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(provider, symbol, trade_date) DO UPDATE SET
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    pre_close = excluded.pre_close,
    pct_chg = excluded.pct_chg,
    volume = excluded.volume,
    amount = excluded.amount,
    raw_json = excluded.raw_json,
    updated_at = datetime('now')`;
  bars.forEach(bar => {
    run(sql, [
      provider,
      normalized,
      bar.trade_date,
      parseNumber(bar.open),
      parseNumber(bar.high),
      parseNumber(bar.low),
      parseNumber(bar.close),
      parseNumber(bar.pre_close),
      parseNumber(bar.pct_chg),
      parseNumber(bar.volume),
      parseNumber(bar.amount),
      JSON.stringify(bar.raw || bar)
    ]);
  });
}

function loadCachedBars(provider, symbol, startDate, endDate) {
  const rows = all(`SELECT provider, symbol, trade_date, open, high, low, close, pre_close, pct_chg, volume, amount
    FROM historical_daily_bars
    WHERE provider = ? AND symbol = ? AND trade_date >= ? AND trade_date <= ?
    ORDER BY trade_date ASC`, [provider, normalizeSymbol(symbol), dashDate(startDate), dashDate(endDate)]);
  return rows;
}

function hasEnoughCache(rows, minRows) {
  return Array.isArray(rows) && rows.length >= (minRows || 2);
}

async function requestJson(url, options) {
  const opts = options || {};
  const timeoutMs = Number(opts.timeout || process.env.TUSHARE_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { timeout, ...fetchOptions } = opts;
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON parse failed: ${e.message}; body=${text.slice(0, 200)}`);
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function maskUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    ['token', 'api_key', 'apikey'].forEach(key => {
      if (url.searchParams.has(key)) url.searchParams.set(key, '<redacted>');
    });
    return url.toString();
  } catch (error) {
    return String(value).replace(/(token=)[^&\s]+/i, '$1<redacted>');
  }
}

function requestJsonViaHttps(url, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: opts.headers || {},
      timeout: opts.timeout || 20000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${res.statusMessage}: ${text.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`JSON parse failed: ${error.message}; body=${text.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function withRetry(fn, attempts) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchTushareBars(symbol, startDate, endDate, options) {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new Error('TUSHARE_TOKEN is not configured');
  const normalized = normalizeSymbol(symbol);
  const apiName = inferTushareApi(normalized, options && options.instrumentType);
  const fields = 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount';
  const body = {
    api_name: apiName,
    token,
    params: {
      ts_code: normalized,
      start_date: ymd(startDate),
      end_date: ymd(endDate)
    },
    fields
  };
  const json = await requestJson(process.env.TUSHARE_API_URL || 'http://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (json.code !== 0) {
    throw new Error(`Tushare ${apiName} failed: ${json.msg || json.message || JSON.stringify(json).slice(0, 200)}`);
  }
  const columns = json.data && json.data.fields || [];
  const items = json.data && json.data.items || [];
  const rows = items.map(item => Object.fromEntries(columns.map((field, index) => [field, item[index]])));
  return rows.map(row => ({
    trade_date: dashDate(row.trade_date),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    pre_close: row.pre_close,
    pct_chg: row.pct_chg,
    volume: row.vol,
    amount: row.amount,
    raw: { provider: 'tushare', api_name: apiName, row }
  })).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

async function fetchEastmoneyKlineBars(symbol, startDate, endDate, options) {
  const secid = options && options.eastmoneySecid || symbolToEastmoneySecid(symbol);
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' + new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: '101',
    fqt: '1',
    beg: ymd(startDate),
    end: ymd(endDate)
  }).toString();
  const json = await withRetry(() => requestJsonViaHttps(url, {
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      Host: 'push2his.eastmoney.com',
      Accept: 'application/json,text/plain,*/*',
      Connection: 'close',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }), 3);
  const klines = json.data && json.data.klines || [];
  if (!klines.length) throw new Error(`Eastmoney returned no kline data for ${secid}`);
  return klines.map(line => {
    const parts = line.split(',');
    return {
      trade_date: dashDate(parts[0]),
      open: parts[1],
      close: parts[2],
      high: parts[3],
      low: parts[4],
      volume: parts[5],
      amount: parts[6],
      pct_chg: parts[8],
      raw: { provider: 'eastmoney-kline', secid, line }
    };
  }).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function findPythonCommand() {
  const candidates = [
    process.env.HIST_PYTHON,
    process.env.PYTHON,
    'python',
    'py'
  ].filter(Boolean);
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (!result.error && result.status === 0) return cmd;
  }
  return null;
}

function getProviderStatus() {
  return {
    tushare: {
      available: Boolean(process.env.TUSHARE_TOKEN),
      reason: process.env.TUSHARE_TOKEN
        ? `TUSHARE_TOKEN configured; api_url=${maskUrl(process.env.TUSHARE_API_URL || 'http://api.tushare.pro')}`
        : 'missing TUSHARE_TOKEN'
    },
    tushareMcp: {
      available: Boolean(process.env.TUSHARE_MCP_URL),
      reason: process.env.TUSHARE_MCP_URL ? 'TUSHARE_MCP_URL configured; verify tools/call before production use' : 'missing TUSHARE_MCP_URL'
    },
    baostock: {
      available: Boolean(findPythonCommand()),
      reason: findPythonCommand() ? 'python available; install baostock to enable' : 'python not found'
    },
    akshare: {
      available: Boolean(findPythonCommand()),
      reason: findPythonCommand() ? 'python available; install akshare to enable' : 'python not found'
    },
    eastmoney: {
      available: true,
      reason: 'fallback only; no SLA'
    }
  };
}

async function fetchBarsFromProvider(provider, symbol, startDate, endDate, options) {
  if (provider === 'tushare') return fetchTushareBars(symbol, startDate, endDate, options);
  if (provider === 'eastmoney') return fetchEastmoneyKlineBars(symbol, startDate, endDate, options);
  if (provider === 'baostock' || provider === 'akshare') {
    throw new Error(`${provider} requires a local Python runtime and a Python bridge; current host has no python command`);
  }
  throw new Error(`Unknown historical data provider: ${provider}`);
}

async function getDailyBars(input) {
  const opts = input || {};
  const provider = opts.provider || process.env.HISTORY_PROVIDER || (process.env.TUSHARE_TOKEN ? 'tushare' : 'eastmoney');
  const symbol = normalizeSymbol(opts.symbol);
  const cacheProvider = provider === 'auto' ? (process.env.TUSHARE_TOKEN ? 'tushare' : 'eastmoney') : provider;
  const cached = loadCachedBars(cacheProvider, symbol, opts.startDate, opts.endDate);
  if (!opts.refresh && hasEnoughCache(cached, opts.minRows)) return cached;

  try {
    const bars = await fetchBarsFromProvider(cacheProvider, symbol, opts.startDate, opts.endDate, opts);
    saveBars(cacheProvider, symbol, bars);
    return loadCachedBars(cacheProvider, symbol, opts.startDate, opts.endDate);
  } catch (error) {
    const allowFallback = opts.allowFallback !== false && cacheProvider !== 'eastmoney';
    if (!allowFallback) throw error;
    const fallbackBars = await fetchBarsFromProvider('eastmoney', symbol, opts.startDate, opts.endDate, opts);
    const enriched = fallbackBars.map(bar => ({
      ...bar,
      raw: {
        ...(bar.raw || {}),
        requested_provider: cacheProvider,
        fallback_reason: error.message
      }
    }));
    saveBars('eastmoney', symbol, enriched);
    return loadCachedBars('eastmoney', symbol, opts.startDate, opts.endDate);
  }
}

function resolveIndustryProxy(industry) {
  return getIndustryProxy(industry);
}

function resolveBenchmarkProxy(name) {
  return getBenchmarkProxy(name);
}

module.exports = {
  normalizeSymbol,
  dashDate,
  ymd,
  getProviderStatus,
  getDailyBars,
  fetchTushareBars,
  fetchEastmoneyKlineBars,
  loadCachedBars,
  saveBars,
  resolveIndustryProxy,
  resolveBenchmarkProxy
};

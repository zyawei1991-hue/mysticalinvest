/**
 * 行情数据获取模块 v2
 * - 大盘指数：腾讯财经 qt.gtimg.cn（GBK→UTF8解码）
 * - 涨跌家数、涨跌停、资金流向：东方财富妙想 API（mkapi2.dfcfs.com）
 *
 * 环境变量：MX_APIKEY
 */

const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');

const A_SHARE_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
const ETF_FS = 'b:MK0021,b:MK0022,b:MK0023,b:MK0024';
const EASTMONEY_PAGE_SIZE = Number(process.env.EASTMONEY_PAGE_SIZE || 100);
const EASTMONEY_MAX_PAGES = Number(process.env.EASTMONEY_MAX_PAGES || 80);
const EASTMONEY_SNAPSHOT_TTL_MS = Number(process.env.EASTMONEY_SNAPSHOT_TTL_MS || 120000);
const EASTMONEY_PUSH2_HOSTS = (process.env.EASTMONEY_PUSH2_HOSTS || 'https://push2delay.eastmoney.com,https://push2.eastmoney.com')
  .split(',')
  .map(item => item.trim().replace(/\/$/, ''))
  .filter(Boolean);
let eastmoneyRealtimeCache = null;

// ─────────────────────────────────────────────
// 工具：发 HTTPS POST 请求
// ─────────────────────────────────────────────
function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGetJsonOnce(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: Number(options.timeout || process.env.EASTMONEY_TIMEOUT_MS || 15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com/',
        'Accept': 'application/json,text/plain,*/*',
        ...(options.headers || {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${res.statusMessage}: ${text.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}; body=${text.slice(0, 200)}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function httpsGetJson(url, options = {}) {
  const retries = Number(options.retries ?? process.env.EASTMONEY_RETRIES ?? 2);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpsGetJsonOnce(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-' || value === '--') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function eastmoneyMarketPrefix(code) {
  if (!code) return '';
  return String(code).startsWith('6') || String(code).startsWith('5') || String(code).startsWith('9') ? 'SH' : 'SZ';
}

function normalizeEastmoneyRow(row) {
  const code = String(row.f12 || '').trim();
  const amount = toNumber(row.f6);
  const turnoverRate = toNumber(row.f8);
  const mainNetInflow = toNumber(row.f62);
  return {
    code,
    ts_code: code ? `${code}.${eastmoneyMarketPrefix(code)}` : '',
    name: String(row.f14 || '').trim(),
    price: toNumber(row.f2),
    changePercent: toNumber(row.f3),
    amount,
    turnoverRate,
    mainNetInflow,
    mainNetRatio: toNumber(row.f184),
    raw: row
  };
}

async function fetchEastmoneyClistPages(fs, options = {}) {
  const pageSize = Number(options.pageSize || EASTMONEY_PAGE_SIZE);
  const maxPages = Number(options.maxPages || EASTMONEY_MAX_PAGES);
  const fields = options.fields || 'f12,f14,f2,f3,f6,f8,f62,f184';
  const fid = options.fid || 'f62';
  const rows = [];

  for (let page = 1; page <= maxPages; page++) {
    const query = new URLSearchParams({
      pn: String(page),
      pz: String(pageSize),
      po: options.po || '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid,
      fs,
      fields
    }).toString();
    let json;
    let lastError;
    for (const host of EASTMONEY_PUSH2_HOSTS) {
      try {
        json = await httpsGetJson(`${host}/api/qt/clist/get?${query}`);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!json) throw lastError;
    const batch = json.data?.diff || [];
    rows.push(...batch.map(normalizeEastmoneyRow).filter(row => row.name || row.code));
    const total = Number(json.data?.total || 0);
    if (!batch.length) break;
    if (total > 0) {
      if (rows.length >= total) break;
    } else if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}

function summarizeRealtimeRows(rows) {
  const validRows = rows.filter(row => isFiniteNumber(row.changePercent));
  const up = validRows.filter(row => Number(row.changePercent) > 0).length;
  const down = validRows.filter(row => Number(row.changePercent) < 0).length;
  const flat = validRows.filter(row => Number(row.changePercent) === 0).length;
  const amountRows = rows.filter(row => isFiniteNumber(row.amount) && Number(row.amount) > 0);
  const totalAmount = amountRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const weightedTurnover = totalAmount > 0
    ? amountRows.reduce((sum, row) => sum + ((Number(row.turnoverRate) || 0) * Number(row.amount)), 0) / totalAmount
    : null;
  const flowRows = rows.filter(row => isFiniteNumber(row.mainNetInflow));
  const mainNetInflow = flowRows.reduce((sum, row) => sum + Number(row.mainNetInflow), 0);

  return {
    total: validRows.length,
    up,
    down,
    flat,
    totalAmount,
    turnoverRate: weightedTurnover,
    mainNetInflow,
    leaders: flowRows
      .filter(row => Number(row.mainNetInflow) > 0)
      .sort((a, b) => Number(b.mainNetInflow) - Number(a.mainNetInflow))
      .slice(0, 10),
    turnoverLeaders: amountRows
      .filter(row => isFiniteNumber(row.turnoverRate))
      .sort((a, b) => Number(b.turnoverRate) - Number(a.turnoverRate))
      .slice(0, 10)
  };
}

async function fetchEastmoneyRealtimeSnapshot(force = false) {
  const now = Date.now();
  if (!force && eastmoneyRealtimeCache && now - eastmoneyRealtimeCache.fetchedAt < EASTMONEY_SNAPSHOT_TTL_MS) {
    return eastmoneyRealtimeCache.snapshot;
  }

  const aShareRows = await fetchEastmoneyClistPages(A_SHARE_FS, { fid: 'f62' });
  const etfRows = await fetchEastmoneyClistPages(ETF_FS, { fid: 'f62', maxPages: 8 });
  const snapshot = {
    asOf: new Date().toISOString(),
    source: 'eastmoney-push2-full',
    aShare: summarizeRealtimeRows(aShareRows),
    etf: summarizeRealtimeRows(etfRows),
    aShareRows,
    etfRows
  };
  eastmoneyRealtimeCache = { fetchedAt: now, snapshot };
  return snapshot;
}

async function fetchEastmoneyNorthbound() {
  const query = new URLSearchParams({
    fields1: 'f1,f2,f3,f4',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
  }).toString();
  let json;
  let lastError;
  for (const host of EASTMONEY_PUSH2_HOSTS) {
    try {
      json = await httpsGetJson(`${host}/api/qt/kamt/get?${query}`);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!json) throw lastError;
  const data = json.data || {};
  const legs = ['hk2sh', 'hk2sz'].map(key => data[key]).filter(Boolean);
  if (!legs.length) return null;
  const hasEffectiveValue = legs.some(leg =>
    isFiniteNumber(leg.netBuyAmt) && Number(leg.netBuyAmt) !== 0 ||
    isFiniteNumber(leg.dayNetAmtIn) && Number(leg.dayNetAmtIn) !== 0
  );
  if (!hasEffectiveValue) return null;
  const netWan = legs.reduce((sum, leg) => sum + (Number(leg.netBuyAmt ?? leg.dayNetAmtIn) || 0), 0);
  return {
    netInflow: netWan * 10000,
    source: 'eastmoney-kamt',
    date: legs[0].date2 || legs[0].date || ''
  };
}

// ─────────────────────────────────────────────
// 工具：调用东财妙想 API
// ─────────────────────────────────────────────
async function queryEastmoney(toolQuery) {
  const apiKey = process.env.MX_APIKEY;
  if (!apiKey) throw new Error('未设置 MX_APIKEY 环境变量');

  const result = await httpsPost(
    'https://mkapi2.dfcfs.com/finskillshub/api/claw/query',
    { 'apikey': apiKey },
    { toolQuery }
  );

  if (!result.success) throw new Error(`东财API错误: ${result.message}`);
  return result.data?.data?.searchDataResultDTO || result.data?.data;
}

// ─────────────────────────────────────────────
// 工具：腾讯财经指数行情（GBK解码）
// ─────────────────────────────────────────────
function fetchQuoteRaw(codeStr) {
  return new Promise((resolve, reject) => {
    const url = `http://qt.gtimg.cn/q=${codeStr}`;
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          // 腾讯返回 GBK 编码，需要转 UTF-8
          const text = iconv.decode(Buffer.concat(chunks), 'gbk');
          resolve(text);
        } catch (e) {
          // iconv 不可用时降级（乱码但数值仍可用）
          resolve(Buffer.concat(chunks).toString('utf8'));
        }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────────
// 1. 获取大盘指数数据
// ─────────────────────────────────────────────
async function getIndexData() {
  const raw = await fetchQuoteRaw('sh000300,sz399001,sz399006,sh000001');
  const result = {};
  const lines = raw.split(';').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/v_([a-z]+\d+)="(.+)"/);
    if (!match) continue;
    const code = match[1];
    const fields = match[2].split('~');
    if (fields.length < 35) continue;

    const item = {
      name: fields[1],
      code: fields[2],
      last: parseFloat(fields[3]),
      prevClose: parseFloat(fields[4]),
      change: parseFloat(fields[31]),
      changePercent: parseFloat(fields[32]),
      high: parseFloat(fields[33]),
      low: parseFloat(fields[34]),
      open: parseFloat(fields[5]),
      volume: parseInt(fields[6]),
      amount: parseFloat(fields[37]) * 100,
    };

    if (code === 'sh000300') result.hs300 = item;
    else if (code === 'sz399001') result.sz = item;
    else if (code === 'sh000001') result.sh = item;
    else if (code === 'sz399006') result.cyb = item;  // 创业板指
  }

  if (!result.hs300 || !result.sh) {
    throw new Error('获取指数数据失败，字段缺失');
  }
  return result;
}

// ─────────────────────────────────────────────
// 1b. 获取海外主要指数数据
// ─────────────────────────────────────────────
async function getGlobalIndexData() {
  const raw = await fetchQuoteRaw('usDJI,usIXIC,usSPX,hkHSI');
  const result = {};
  const lines = raw.split(';').filter(l => l.trim());
  const keyMap = {
    usDJI: 'dow',
    usIXIC: 'nasdaq',
    usSPX: 'sp500',
    hkHSI: 'hsi'
  };

  for (const line of lines) {
    const match = line.match(/v_([a-zA-Z]+\d*|us[A-Z]+)="(.+)"/);
    if (!match) continue;
    const rawCode = match[1];
    const fields = match[2].split('~');
    if (fields.length < 35) continue;

    const key = keyMap[rawCode];
    if (!key) continue;

    result[key] = {
      name: fields[1],
      code: fields[2],
      last: parseFloat(fields[3]),
      prevClose: parseFloat(fields[4]),
      change: parseFloat(fields[31]),
      changePercent: parseFloat(fields[32]),
      high: parseFloat(fields[33]),
      low: parseFloat(fields[34]),
      time: fields[30] || ''
    };
  }

  return result;
}

// ─────────────────────────────────────────────
// 2. 获取市场涨跌家数（东财妙想API）
// ─────────────────────────────────────────────
async function getMarketBreadth() {
  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    if (snapshot.aShare.total > 0) {
      return {
        up: snapshot.aShare.up,
        down: snapshot.aShare.down,
        flat: snapshot.aShare.flat,
        total: snapshot.aShare.total,
        source: snapshot.source,
        asOf: snapshot.asOf
      };
    }
  } catch (e) {
    console.warn('东财全市场分页获取涨跌家数失败:', e.message);
  }

  try {
    const data = await queryEastmoney('今日A股市场上涨家数、下跌家数、平盘家数');
    if (!data || !data.dataTableDTOList || data.dataTableDTOList.length === 0) {
      return { up: 0, down: 0, flat: 0 };
    }

    // 从 nameMap 找上涨/下跌/平盘字段
    let up = 0, down = 0, flat = 0;
    for (const item of data.dataTableDTOList) {
      const nameMap = item.nameMap || {};
      const table = item.table || {};
      // 找包含"上涨"的字段
      for (const [fieldCode, fieldName] of Object.entries(nameMap)) {
        if (fieldCode === 'headName') continue;
        const valArr = table[fieldCode];
        const val = Math.round(parseValue(valArr?.[0]) || 0);
        if (fieldName.includes('上涨') || fieldName.includes('上升')) up = val;
        else if (fieldName.includes('下跌') || fieldName.includes('下降')) down = val;
        else if (fieldName.includes('平盘') || fieldName.includes('持平') || fieldName.includes('不变')) flat = val;
      }
    }
    return { up, down, flat };
  } catch (e) {
    console.warn('获取涨跌家数失败:', e.message);
    return { up: 0, down: 0, flat: 0 };
  }
}

// ─────────────────────────────────────────────
// 3. 获取涨跌幅较大的板块（东财妙想API）
// ─────────────────────────────────────────────
async function getLimitStocks() {
  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    const rows = snapshot.aShareRows || [];
    if (rows.length) {
      return {
        up: rows
          .filter(row => Number(row.changePercent) >= 9.5)
          .sort((a, b) => Number(b.changePercent) - Number(a.changePercent))
          .slice(0, 30)
          .map(row => ({ name: row.name, code: row.code, change: row.changePercent })),
        down: rows
          .filter(row => Number(row.changePercent) <= -9.5)
          .sort((a, b) => Number(a.changePercent) - Number(b.changePercent))
          .slice(0, 30)
          .map(row => ({ name: row.name, code: row.code, change: row.changePercent })),
        source: snapshot.source,
        asOf: snapshot.asOf
      };
    }
  } catch (e) {
    console.warn('东财全市场分页获取涨跌停失败:', e.message);
  }

  try {
    const data = await queryEastmoney('今日A股涨停板块和跌停板块，涨幅超7%的个股名称');
    if (!data || !data.dataTableDTOList) return { up: [], down: [] };

    const up = [];
    const down = [];

    for (const item of data.dataTableDTOList) {
      const nameMap = item.nameMap || {};
      const table = item.table || {};
      const entityName = (item.entityName || item.code || '').replace(/\(.*\)/, '').trim();

      // 找涨跌幅字段
      let change = null;
      for (const [code, name] of Object.entries(nameMap)) {
        if (code === 'headName') continue;
        if (name.includes('涨跌幅') || name.includes('涨幅')) {
          change = parseFloat(table[code]?.[0]) || null;
          break;
        }
      }
      if (change === null) continue;
      const stockItem = { name: entityName, code: item.code, change };
      if (change >= 7) up.push(stockItem);
      else if (change <= -7) down.push(stockItem);
    }

    return { up, down };
  } catch (e) {
    console.warn('获取涨跌停数据失败:', e.message);
    return { up: [], down: [] };
  }
}

// ─────────────────────────────────────────────
// 4. 获取主力资金净流入但股价下跌的股票（东财妙想API）
// ─────────────────────────────────────────────
async function getMoneyFlowDivergence() {
  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    const rows = (snapshot.aShareRows || [])
      .filter(row => Number(row.mainNetInflow) > 0 && Number(row.changePercent) < 0)
      .sort((a, b) => Number(b.mainNetInflow) - Number(a.mainNetInflow))
      .slice(0, 20)
      .map(row => ({
        name: row.name,
        code: row.code,
        close: row.price,
        change: row.changePercent,
        mainNetInflow: row.mainNetInflow,
        source: snapshot.source
      }));
    if (rows.length) return rows;
  } catch (e) {
    console.warn('东财全市场分页获取资金背离失败:', e.message);
  }

  try {
    const data = await queryEastmoney('今日A股主力资金净流入前10名，包含涨跌幅');
    if (!data || !data.dataTableDTOList) return [];

    const result = [];
    for (const item of data.dataTableDTOList) {
      const nameMap = item.nameMap || {};
      const table = item.table || {};
      const entityName = (item.entityName || '').replace(/\(.*\)/, '').trim();

      let netInflow = null, change = null, close = null;
      for (const [code, name] of Object.entries(nameMap)) {
        if (code === 'headName') continue;
        const val = parseFloat(table[code]?.[0]);
        if (name.includes('主力净流入') || name.includes('净流入')) netInflow = val;
        else if (name.includes('涨跌幅') || name.includes('涨幅')) change = val;
        else if (name.includes('最新价') || name.includes('收盘')) close = val;
      }

      // 只取：主力流入 > 0 但价格下跌（资金背离）
      if (netInflow !== null && change !== null && netInflow > 0 && change < 0) {
        result.push({ name: entityName, code: item.code, close, change, mainNetInflow: netInflow });
      }
    }
    return result;
  } catch (e) {
    console.warn('获取资金背离数据失败:', e.message);
    return [];
  }
}

function extractFirstNumberByName(data, keywords) {
  if (!data || !data.dataTableDTOList) return null;
  const keywordList = Array.isArray(keywords) ? keywords : [keywords];

  for (const item of data.dataTableDTOList) {
    const nameMap = item.nameMap || {};
    const table = item.table || {};
    for (const [code, name] of Object.entries(nameMap)) {
      if (code === 'headName' || code === 'headNameSub') continue;
      if (!keywordList.some(keyword => String(name || '').includes(keyword))) continue;
      const value = parseValue(table[code]?.[0]);
      if (value !== null) return value;
    }
  }
  return null;
}

function getTopRows(data, maxRows) {
  if (!data || !data.dataTableDTOList) return [];
  return data.dataTableDTOList.slice(0, maxRows).map(item => {
    const row = { name: (item.entityName || '').replace(/\(.*\)/, '').trim(), code: item.code || '' };
    const nameMap = item.nameMap || {};
    const table = item.table || {};
    for (const [code, name] of Object.entries(nameMap)) {
      if (code === 'headName' || code === 'headNameSub') continue;
      const label = String(name || '');
      const value = parseValue(table[code]?.[0]);
      if (value === null) continue;
      if (label.includes('主力净流入') || label.includes('净流入') || label.includes('主力净额')) row.mainNetInflow = value;
      else if (label.includes('涨跌幅') || label.includes('涨幅')) row.changePercent = value;
      else if (label.includes('换手')) row.turnoverRate = value;
      else if (label.includes('成交额')) row.amount = value;
    }
    return row;
  }).filter(row => row.name || row.code);
}

function describeFlow(value) {
  if (value === null || value === undefined) return '实时源未返回';
  const yi = value / 100000000;
  return `${yi >= 0 ? '+' : ''}${yi.toFixed(2)}亿`;
}

function formatNorthboundActivity(northbound) {
  if (!northbound || !isFiniteNumber(northbound.dealAmount)) return '实时净买入不再公开';
  const dealYi = Number(northbound.dealAmount) / 100;
  const parts = [`成交额${dealYi.toFixed(2)}亿`];
  if (northbound.quotaBalanceText) parts.push(northbound.quotaBalanceText);
  if (northbound.leadStockName) parts.push(`活跃股：${northbound.leadStockName}`);
  return parts.join('，');
}

async function fetchEastmoneyNorthboundDailyStats() {
  const query = new URLSearchParams({
    sortTypes: '-1',
    sortColumns: 'TRADE_DATE',
    source: 'WEB',
    client: 'WEB',
    reportName: 'RPT_MUTUAL_DEALAMT',
    columns: 'ALL',
    pageNumber: '1',
    pageSize: '5'
  }).toString();
  const url = `https://datacenter-web.eastmoney.com/web/api/data/v1/get?${query}`;
  const json = await httpsGetJson(url, {
    headers: {
      Referer: 'https://data.eastmoney.com/hsgt/hsgtV2.html'
    }
  });
  const row = json.result?.data?.[0];
  if (!row) return null;
  return {
    netInflow: null,
    disclosure: 'net_buy_unavailable_after_2024_disclosure_change',
    source: 'eastmoney-mutual-dealamt',
    date: String(row.TRADE_DATE || '').slice(0, 10),
    dealAmount: toNumber(row.NF_DEAL_AMT),
    dealAmountYi: isFiniteNumber(row.NF_DEAL_AMT) ? Number(row.NF_DEAL_AMT) / 100 : null,
    shDealAmountYi: isFiniteNumber(row.SSC_DEAL_AMT) ? Number(row.SSC_DEAL_AMT) / 100 : null,
    szDealAmountYi: isFiniteNumber(row.ST_DEAL_AMT) ? Number(row.ST_DEAL_AMT) / 100 : null,
    dealNum: (Number(row.SSC_DEAL_NUM || 0) || 0) + (Number(row.ST_DEAL_NUM || 0) || 0),
    quotaBalanceText: row.NF_QUOTA_BALANCE || row.SSC_QUOTA_BALANCE || row.ST_QUOTA_BALANCE || '',
    leadStockName: row.NF_LEAD_STOCKS || row.SSC_LEAD_STOCKS || row.ST_LEAD_STOCKS || '',
    leadStockCode: row.NF_LEAD_STOCKSCODE || row.SSC_LEAD_STOCKSCODE || row.ST_LEAD_STOCKSCODE || '',
    leadStockChange: toNumber(row.NF_CHANGE_RATE ?? row.SSC_CHANGE_RATE ?? row.ST_CHANGE_RATE),
    note: '公开渠道保留成交额/活跃股，盘中净买入、买卖额不再稳定披露'
  };
}

async function fetchEastmoneyFlowList(fs, limit) {
  const url = 'https://push2.eastmoney.com/api/qt/clist/get?' + new URLSearchParams({
    pn: '1',
    pz: String(limit || 10),
    po: '1',
    np: '1',
    fltt: '2',
    invt: '2',
    fid: 'f62',
    fs,
    fields: 'f12,f14,f3,f6,f8,f62'
  }).toString();
  const json = await httpsGetJson(url);
  const rows = json.data?.diff || [];
  return rows.map(row => ({
    code: row.f12,
    name: row.f14,
    changePercent: Number(row.f3),
    amount: Number(row.f6),
    turnoverRate: Number(row.f8),
    mainNetInflow: Number(row.f62)
  })).filter(row => row.name || row.code);
}

// 资金动量：北向、主力净流入、ETF 流向、换手率，供日报与回测复用。
async function getMarketMomentum() {
  const result = {
    asOf: new Date().toISOString(),
    northbound: { netInflow: null, source: 'eastmoney-kamt' },
    mainForce: { netInflow: null, leaders: [], source: 'eastmoney-push2-full' },
    etfFlow: { netInflow: null, leaders: [], source: 'eastmoney-push2-etf' },
    turnover: { marketRate: null, active: [], source: 'eastmoney-push2-full' },
    summary: ''
  };

  try {
    const northbound = await fetchEastmoneyNorthbound();
    if (northbound) {
      result.northbound = northbound;
    } else {
      throw new Error('eastmoney-kamt returned no effective northbound value');
    }
  } catch (e) {
    try {
      const data = await queryEastmoney('今日北向资金净流入金额，沪股通深股通合计');
      result.northbound.netInflow = extractFirstNumberByName(data, ['北向资金净流入', '净流入', '资金净额']);
      result.northbound.source = 'eastmoney-mx';
    } catch (fallbackError) {
      try {
        const activity = await fetchEastmoneyNorthboundDailyStats();
        if (activity) {
          result.northbound = activity;
        } else {
          result.northbound.error = 'northbound realtime net buy unavailable; daily activity unavailable';
        }
      } catch (activityError) {
        result.northbound.error = `northbound realtime net buy unavailable; daily activity fallback failed: ${activityError.message}`;
      }
    }
  }

  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    result.asOf = snapshot.asOf;
    result.mainForce.leaders = snapshot.aShare.leaders.slice(0, 5);
    result.mainForce.netInflow = snapshot.aShare.mainNetInflow;
    result.mainForce.sampleSize = snapshot.aShare.total;
  } catch (e) {
    try {
      const data = await queryEastmoney('今日A股主力资金净流入前10名，包含涨跌幅和换手率');
      result.mainForce.netInflow = extractFirstNumberByName(data, ['主力净流入', '主力净额', '净流入']);
      result.mainForce.leaders = getTopRows(data, 5);
    } catch (fallbackError) {
      result.mainForce.error = `${e.message}; fallback: ${fallbackError.message}`;
    }
  }

  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    result.etfFlow.leaders = snapshot.etf.leaders.slice(0, 5);
    result.etfFlow.netInflow = snapshot.etf.mainNetInflow;
    result.etfFlow.sampleSize = snapshot.etf.total;
  } catch (e) {
    try {
      const data = await queryEastmoney('今日ETF资金净流入前10，股票ETF行业ETF宽基ETF');
      result.etfFlow.netInflow = extractFirstNumberByName(data, ['净流入', '资金净额', '主力净流入']);
      result.etfFlow.leaders = getTopRows(data, 5);
    } catch (fallbackError) {
      result.etfFlow.error = `${e.message}; fallback: ${fallbackError.message}`;
    }
  }

  try {
    const snapshot = await fetchEastmoneyRealtimeSnapshot();
    result.turnover.active = snapshot.aShare.turnoverLeaders.slice(0, 5);
    result.turnover.marketRate = snapshot.aShare.turnoverRate;
    result.turnover.sampleSize = snapshot.aShare.total;
  } catch (e) {
    try {
      const data = await queryEastmoney('今日A股换手率，换手率最高前10行业和个股');
      result.turnover.marketRate = extractFirstNumberByName(data, ['换手率', '换手']);
      result.turnover.active = getTopRows(data, 5);
    } catch (fallbackError) {
      result.turnover.error = `${e.message}; fallback: ${fallbackError.message}`;
    }
  }

  const leaders = result.mainForce.leaders.slice(0, 3).map(item => item.name).filter(Boolean).join('、') || '实时源未返回';
  const etfs = result.etfFlow.leaders.slice(0, 3).map(item => item.name).filter(Boolean).join('、') || '实时源未返回';
  const northboundText = result.northbound.dealAmount ? formatNorthboundActivity(result.northbound) : describeFlow(result.northbound.netInflow);
  result.summary = `北向${northboundText}，主力${describeFlow(result.mainForce.netInflow)}，ETF${describeFlow(result.etfFlow.netInflow)}；主力活跃：${leaders}；ETF流向：${etfs}`;
  return result;
}

// ─────────────────────────────────────────────
// 工具：解析带单位的数值字符串 → 数字（元）
//   "7.592亿元" → 759200000
//   "-1.878亿元" → -187800000
//   "3.45%" → 3.45
//   "12.34" → 12.34
// ─────────────────────────────────────────────
function parseValue(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).replace(/,/g, '').trim();
  if (s === '--' || s === '-' || s === '') return null;
  const percentMatch = s.match(/^([+-]?\d+\.?\d*)%$/);
  if (percentMatch) return parseFloat(percentMatch[1]);
  const yiMatch = s.match(/^([+-]?\d+\.?\d*)亿/);
  if (yiMatch) return parseFloat(yiMatch[1]) * 100000000;
  const wanMatch = s.match(/^([+-]?\d+\.?\d*)万/);
  if (wanMatch) return parseFloat(wanMatch[1]) * 10000;
  return parseFloat(s) || null;
}

// ─────────────────────────────────────────────
// 5. 获取单只标的行情（组合策略）
//    - 实时行情（价格/涨跌）：腾讯财经 API（快）
//    - 主力资金 + PE/PB：东财妙想 API
// ─────────────────────────────────────────────
async function getStockQuote(stockCode, stockName) {
  // [FIX] 支持任意股票名称/代码查询，不再依赖stocks表预注册
  // 如果不是标准格式(sh/sz+数字)，尝试用新浪搜索API解析中文名
  if (!/^[a-z]{2}[0-9]{5,7}$/i.test(stockCode)) {
    try {
      const url = 'https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key=' + encodeURIComponent(stockCode);
      const raw = await new Promise((resolve, reject) => {
        require("https").get(url, res => {
          const c = [];
          res.on("data", x => c.push(x));
          res.on("end", () => {
            try { resolve(require("iconv-lite").decode(Buffer.concat(c), "gbk")); }
            catch(e) { resolve(Buffer.concat(c).toString()); }
          });
        }).on("error", reject);
      });
      // 格式: var suggestvalue="名称,类型,代码,完整代码,...;...";
      const m = raw.match(/suggestvalue="([^"]+)"/);
      if (m) {
        const items = m[1].split(';');
        // 优先匹配用户输入的名称（完全匹配或包含）
        let bestMatch = null;
        for (const item of items) {
          const parts = item.split(',');
          if (parts.length >= 4) {
            const fullCode = parts[3];
            const sName = parts[0];
            if (/^[a-z]{2}[0-9]{5,7}$/i.test(fullCode)) {
              // 完全匹配优先，然后是包含匹配
              if (sName === stockCode) {
                bestMatch = { fullCode, sName };
                break;
              } else if (!bestMatch && sName.includes(stockCode)) {
                bestMatch = { fullCode, sName };
              }
            }
          }
        }
        if (bestMatch) {
          stockCode = bestMatch.fullCode.toLowerCase();
          if (!stockName) stockName = bestMatch.sName;
          console.log('[STOCK] Resolved', stockCode, '<-', bestMatch.sName);
        }
      }
    } catch(e) {
      console.warn('[STOCK] Sina search failed:', e.message);
    }
  }
  const result = {
    name: stockName || stockCode,
    code: stockCode,
    last: null, change: null, changePercent: null,
    pe: null, pb: null, netInflow: null
  };

  // 1. 腾讯API取实时行情
  try {
    // 规范化代码格式：510300 → sh510300 / 000001 → sz000001
    let tCode = stockCode.replace(/\.(SH|SZ)$/i, '');
    if (!/^(sh|sz)/i.test(tCode)) {
      // 上交所：6xxxx（A股）、5xxxx（ETF/LOF）、11xxxx（可转债）
      // 深交所：0xxxx（A股）、3xxxx（创业板）、15xxxx（深ETF）、12xxxx（可转债）
      if (/^(6|5|1[15])/.test(tCode)) tCode = 'sh' + tCode;
      else tCode = 'sz' + tCode;
    }
    const raw = await fetchQuoteRaw(tCode.toLowerCase());
    const lines = raw.split(';').filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/v_([a-z]+\d+)="(.+)"/);
      if (!match) continue;
      const fields = match[2].split('~');
      if (fields.length < 35) continue;
      result.name = fields[1] || result.name;
      result.last = parseFloat(fields[3]);
      result.change = parseFloat(fields[31]);
      result.changePercent = parseFloat(fields[32]);
      // PE/PB from Tencent API: field[46]=PB, field[65]=PE_TTM
      if (!result.pe) {
        const peTTM = parseFloat(fields[65]);
        if (!isNaN(peTTM) && peTTM > 0) result.pe = peTTM;
      }
      if (!result.pb) {
        const pb = parseFloat(fields[46]);
        if (!isNaN(pb) && pb > 0 && pb < 100) result.pb = pb;
      }
      break;
    }
  } catch (e) {
    console.warn(`腾讯API获取${stockCode}行情失败:`, e.message);
  }

  // 2. 东财妙想API取主力资金
  try {
    const queryStr = stockName ? `${stockName} 今日主力净流入` : `${stockCode} 今日主力净流入`;
    const d = await queryEastmoney(queryStr);
    if (d && d.dataTableDTOList && d.dataTableDTOList.length > 0) {
      const item = d.dataTableDTOList[0];
      const nameMap = item.nameMap || {};
      const table = item.table || {};
      for (const [code, name] of Object.entries(nameMap)) {
        if (code === 'headName' || code === 'headNameSub') continue;
        if (name.includes('主力净流入') || name.includes('主力净额')) {
          const val = parseValue(table[code]?.[0]);
          if (val !== null) result.netInflow = val / 100000000; // 转亿元
          break;
        }
      }
    }
  } catch (e) {
    console.warn(`东财API获取${stockCode}资金失败:`, e.message);
  }

  // 3. 东财妙想API取PE/PB（仅个股有意义，ETF跳过）
  if (stockName && !stockName.includes('ETF') && !stockName.includes('指数')) {
    try {
      const d = await queryEastmoney(`${stockName || stockCode} 市盈率PE 市净率PB`);
      if (d && d.dataTableDTOList && d.dataTableDTOList.length > 0) {
        const item = d.dataTableDTOList[0];
        const nameMap = item.nameMap || {};
        const table = item.table || {};
        for (const [code, name] of Object.entries(nameMap)) {
          if (code === 'headName' || code === 'headNameSub') continue;
          const val = parseValue(table[code]?.[0]);
          if (val === null) continue;
          if (name === 'PE' || name === '市盈率') result.pe = val;
          else if (name === 'PB' || name === '市净率') result.pb = val;
        }
      }
    } catch (e) {
      console.warn(`东财API获取${stockCode} PE/PB失败:`, e.message);
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// 兼容旧接口 fetchQuote（腾讯API，返回原始格式）
// ─────────────────────────────────────────────
async function fetchQuote(codes) {
  const codeStr = Array.isArray(codes) ? codes.join(',') : codes;
  const raw = await fetchQuoteRaw(codeStr);
  const result = {};
  const lines = raw.split(';').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/v_([a-z]+\d+)="(.+)"/);
    if (!match) continue;
    const code = match[1];
    const fields = match[2].split('~');
    if (fields.length < 35) continue;
    result[code] = {
      name: fields[1],
      code: fields[2],
      last: parseFloat(fields[3]),
      change: parseFloat(fields[31]),
      changePercent: parseFloat(fields[32]),
      high: parseFloat(fields[33]),
      low: parseFloat(fields[34]),
      open: parseFloat(fields[5]),
      volume: parseInt(fields[6]),
      amount: parseFloat(fields[37]) * 100,
    };
  }
  return result;
}

module.exports = {
  fetchQuote,
  getIndexData,
  getGlobalIndexData,
  getMarketBreadth,
  getLimitStocks,
  getMoneyFlowDivergence,
  getMarketMomentum,
  getStockQuote,
  queryEastmoney,
  fetchEastmoneyRealtimeSnapshot,
  fetchEastmoneyNorthboundDailyStats,
};

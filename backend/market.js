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
  getStockQuote,
  queryEastmoney,
};

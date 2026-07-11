#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadEnv } = require('../backend/envLoader');
const { getDailyBars, resolveIndustryProxy } = require('../backend/historicalDataProvider');

loadEnv(path.join(__dirname, '../.env'));

const ROOT = path.join(__dirname, '..');
const ATTACHMENTS_DIR = path.join(ROOT, 'attachments');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'backtests');

const CROSS_FILE = path.join(ATTACHMENTS_DIR, 'industry-cross-36m.html');
const MARKET_FILE = path.join(ATTACHMENTS_DIR, 'wuxing-market-simulation-36m.html');
const FRONTEND_JSON = path.join(FRONTEND_DIR, 'wuxing-trend-backtest-data.json');

const CONFIG = {
  provider: readArg('--provider') || 'eastmoney',
  fallbackProvider: readArg('--fallback-provider') || 'yahoo',
  refresh: process.argv.includes('--refresh'),
  startDate: readArg('--start-date') || '2023-07-01',
  endDate: readArg('--end-date') || '2026-07-15',
  scoreFlatThreshold: Number(readArg('--score-flat') || 5),
  priceFlatThresholdPct: Number(readArg('--price-flat') || 1.5),
  majorScoreThreshold: Number(readArg('--major-score') || 10),
  majorReturnThresholdPct: Number(readArg('--major-return') || 5),
  moderateScoreThreshold: Number(readArg('--moderate-score') || 8),
  moderateReturnThresholdPct: Number(readArg('--moderate-return') || 3),
  maxReasonableMonthlyReturnPct: Number(readArg('--max-monthly-return') || 45),
  forwardTradingDays: Number(readArg('--forward-days') || 20)
};

const SCENARIOS = [
  {
    id: 'calendar_current_delta',
    name: '自然月当期：评分变化 vs 当月走势',
    shortName: '自然月当期',
    signalMode: 'delta',
    windowMode: 'calendar_current',
    description: '保留第一版 MVP：自然月行情对比本月评分相对上月的变化。用于看评分趋势和自然月走势是否同向。'
  },
  {
    id: 'solar_current_level',
    name: '月运区间当期：评分高低 vs 区间走势',
    shortName: '月运区间当期',
    signalMode: 'level',
    windowMode: 'solar_current',
    description: '按资料里的公历对应区间，例如 2023-07-07 至 2023-08-06，比较本月评分高低和同区间行业走势。用于看解释力。'
  },
  {
    id: 'forward_20d_level',
    name: '前瞻20交易日：评分高低 vs 后续走势',
    shortName: '前瞻20交易日',
    signalMode: 'level',
    windowMode: 'forward_20d',
    description: '从月运区间起始日开始取后续 20 个交易日，比较本月评分高低和后续走势。用于看短周期预测力。'
  },
  {
    id: 'next_calendar_month_level',
    name: '前瞻次月：评分高低 vs 次月走势',
    shortName: '前瞻次月',
    signalMode: 'level',
    windowMode: 'next_calendar_month',
    description: '用本月评分预测下一个自然月的行业走势。用于看更接近“下月是否验证”的预测力。'
  }
];

const EVENT_CALENDAR = [
  {
    month: '2023-08',
    title: 'A股印花税减半及资本市场活跃政策',
    type: 'policy',
    affected: ['证券', '非银金融', '银行', '房地产'],
    source: '财政部、证监会公开信息'
  },
  {
    month: '2023-10',
    title: '巴以冲突升级，全球避险和油价波动',
    type: 'geopolitics',
    affected: ['石油石化', '国防军工', '交通运输', '黄金有色'],
    source: 'Reuters / public news'
  },
  {
    month: '2023-12',
    title: '红海航运扰动，运价和供应链预期波动',
    type: 'geopolitics',
    affected: ['交通运输', '石油石化', '出口链'],
    source: 'Reuters / public news'
  },
  {
    month: '2024-02',
    title: '中央汇金增持ETF，市场稳定预期升温',
    type: 'policy',
    affected: ['非银金融', '银行', '综合', '沪深300'],
    source: '新华社 / public news'
  },
  {
    month: '2024-04',
    title: '资本市场新“国九条”发布，红利和质量因子强化',
    type: 'policy',
    affected: ['银行', '煤炭', '公用事业', '非银金融'],
    source: '国务院公开信息'
  },
  {
    month: '2024-05',
    title: '房地产去库存及信贷支持政策加码',
    type: 'policy',
    affected: ['房地产', '建筑材料', '建筑装饰', '银行'],
    source: '央行 / 金融监管总局公开信息'
  },
  {
    month: '2024-09',
    title: '国内一揽子稳增长政策和降准降息预期驱动风险偏好',
    type: 'macro_policy',
    affected: ['非银金融', '房地产', '计算机', '传媒', '综合'],
    source: '央行 / 国新办公开信息'
  },
  {
    month: '2025-01',
    title: 'DeepSeek等AI进展强化国产算力和软件重估',
    type: 'technology',
    affected: ['计算机', '通信', '半导体', '传媒'],
    source: 'public news'
  },
  {
    month: '2025-04',
    title: '中美关税和稀土出口管制扰动全球风险资产',
    type: 'trade_policy',
    affected: ['有色金属', '汽车', '电子', '半导体', '出口链'],
    source: '商务部 / Reuters public news'
  },
  {
    month: '2026-06',
    title: '中东地缘和油价风险升温',
    type: 'geopolitics',
    affected: ['石油石化', '国防军工', '交通运输'],
    source: 'public news'
  }
];

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '));
}

function pct(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function dirFromValue(value, threshold) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value > threshold) return 'up';
  if (value < -threshold) return 'down';
  return 'flat';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function datePartsToIso(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function naturalMonthRange(month) {
  const [year, monthIndex] = String(month).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const end = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return {
    start: `${year}-${pad2(monthIndex)}-01`,
    end,
    requestedEnd: end,
    label: `${year}-${pad2(monthIndex)}`
  };
}

function nextCalendarMonthRange(month) {
  const [year, monthIndex] = String(month).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const next = new Date(Date.UTC(year, monthIndex, 1));
  const nextMonth = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}`;
  return naturalMonthRange(nextMonth);
}

function parsePeriodFromBlock(block, month) {
  const gline = stripTags((block.match(/<p class="gline">([\s\S]*?)<\/p>/i) || [])[1] || '');
  const match = gline.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*[—\-~～至到]+\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) {
    const fallback = naturalMonthRange(month);
    return fallback ? { ...fallback, gline, source: 'natural_month_fallback' } : null;
  }
  const start = datePartsToIso(match[1], match[2], match[3]);
  const end = datePartsToIso(match[4], match[5], match[6]);
  return {
    start,
    end,
    requestedEnd: end,
    label: `${start} ~ ${end}`,
    gline,
    source: 'report_period'
  };
}

function parseCrossSignals() {
  const html = fs.readFileSync(CROSS_FILE, 'utf8');
  const thead = html.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  if (!thead) throw new Error('Cannot parse industry header from cross file');
  const industries = [...thead[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map(m => stripTags(m[1]))
    .filter(name => name && name !== '月份');

  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbody) throw new Error('Cannot parse body from cross file');

  const months = [];
  const signals = [];
  const rows = [...tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  rows.forEach((rowMatch, rowIndex) => {
    const cells = [...rowMatch[1].matchAll(/<td\b[\s\S]*?<\/td>/gi)].map(m => m[0]);
    const label = stripTags(cells[0] || '');
    const ym = label.match(/(\d{4})年(\d{2})月/);
    const month = ym ? `${ym[1]}-${ym[2]}` : null;
    if (!month) return;
    months.push(month);

    industries.forEach((industry, index) => {
      const cell = cells[index + 1] || '';
      const title = decodeHtml((cell.match(/\btitle="([^"]*)"/i) || [])[1] || '');
      const score = Number((title.match(/评分:\s*([0-9.]+)\s*\/100/) || [])[1]);
      const stars = Number((cell.match(/\bdata-stars="([0-9])"/i) || [])[1]);
      signals.push({
        month,
        seq: rowIndex + 1,
        industry,
        score: Number.isFinite(score) ? score : null,
        stars: Number.isFinite(stars) ? stars : null,
        text: title.replace(/\s+/g, ' ').slice(0, 240)
      });
    });
  });

  return { industries, months, signals };
}

function parseMarketSimulation() {
  if (!fs.existsSync(MARKET_FILE)) return {};
  const html = fs.readFileSync(MARKET_FILE, 'utf8');
  const blockMatches = [...html.matchAll(/<section class="month-block" id="m(\d+)">([\s\S]*?)(?=<section class="month-block" id="m\d+"|<\/body>)/g)];
  const byMonth = {};

  blockMatches.forEach(match => {
    const seq = Number(match[1]);
    const block = match[2];
    const monthLabel = stripTags(block.match(/<span class="label">([^<]+)<\/span>/i)?.[1] || '');
    const explicitYm = block.match(/(\d{4})年(\d{1,2})月/);
    const month = explicitYm ? `${explicitYm[1]}-${pad2(explicitYm[2])}` : monthLabel.replace('年', '-').replace('月', '');
    if (!/^\d{4}-\d{2}$/.test(month)) return;

    const core = stripTags((block.match(/<div class="sec-title">核心判断<\/div><div class="core-box">([\s\S]*?)<\/div>/i) || [])[1] || '');
    const top = parseRankTable(block, '本月利好行业 TOP5');
    const bottom = parseRankTable(block, '本月承压行业 BOTTOM5');
    const period = parsePeriodFromBlock(block, month);
    byMonth[month] = { seq, core, top, bottom, period };
  });

  return byMonth;
}

function parseRankTable(block, title) {
  const titleIndex = block.indexOf(title);
  if (titleIndex < 0) return [];
  const after = block.slice(titleIndex);
  const table = (after.match(/<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] || '';
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  return rows.map(row => {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]));
    return {
      industry: cells[0],
      stars: Number((cells[1] || '').match(/(\d)/)?.[1] || NaN),
      text: cells[2] || ''
    };
  }).filter(item => item.industry);
}

function normalizeBars(bars) {
  return (bars || [])
    .map(bar => ({
      trade_date: bar.trade_date,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      amount: Number(bar.amount || bar.volume || 0)
    }))
    .filter(bar => bar.trade_date && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function buildOhlcFromBars(bars, options = {}) {
  const sorted = normalizeBars(bars);
  if (!sorted.length) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const high = Math.max(...sorted.map(item => item.high));
  const low = Math.min(...sorted.map(item => item.low));
  const amount = sorted.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const returnPct = pct((last.close / first.open - 1) * 100);
  const requestedEnd = options.requestedEnd || options.end || last.trade_date;
  const anomaly = Number.isFinite(returnPct) && Math.abs(returnPct) > CONFIG.maxReasonableMonthlyReturnPct;
  return {
    open: first.open,
    high,
    low,
    close: last.close,
    returnPct,
    startDate: first.trade_date,
    endDate: last.trade_date,
    requestedStart: options.start || first.trade_date,
    requestedEnd,
    windowLabel: options.label || `${first.trade_date} ~ ${last.trade_date}`,
    bars: sorted.length,
    amount,
    partial: requestedEnd && last.trade_date < requestedEnd,
    anomaly,
    anomalyReason: anomaly
      ? `区间涨跌 ${returnPct}% 超过 ${CONFIG.maxReasonableMonthlyReturnPct}% 阈值，免费行情源可能存在复权跳点`
      : ''
  };
}

function aggregateBarsForRange(bars, start, end, label) {
  if (!start || !end) return null;
  const items = normalizeBars(bars).filter(bar => bar.trade_date >= start && bar.trade_date <= end);
  return buildOhlcFromBars(items, { start, end, requestedEnd: end, label: label || `${start} ~ ${end}` });
}

function aggregateForwardTradingDays(bars, start, tradingDays) {
  if (!start || !Number.isFinite(tradingDays) || tradingDays <= 0) return null;
  const items = normalizeBars(bars).filter(bar => bar.trade_date >= start).slice(0, tradingDays);
  if (!items.length) return null;
  return buildOhlcFromBars(items, {
    start,
    end: items[items.length - 1].trade_date,
    requestedEnd: items[items.length - 1].trade_date,
    label: `${start} 起后 ${items.length} 个交易日`
  });
}

function aggregateMonthlyBars(bars) {
  const groups = new Map();
  normalizeBars(bars).forEach(bar => {
    const month = String(bar.trade_date || '').slice(0, 7);
    if (!month) return;
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(bar);
  });

  const monthly = {};
  [...groups.entries()].forEach(([month, items]) => {
    const range = naturalMonthRange(month);
    const ohlc = buildOhlcFromBars(items, {
      start: range && range.start,
      end: range && range.end,
      requestedEnd: range && range.end,
      label: month
    });
    if (ohlc) monthly[month] = ohlc;
  });
  return monthly;
}

function classifyConsistency(scoreDelta, priceReturnPct, stars) {
  const scoreDir = dirFromValue(scoreDelta, CONFIG.scoreFlatThreshold);
  const priceDir = dirFromValue(priceReturnPct, CONFIG.priceFlatThresholdPct);

  let status = 'neutral';
  if (scoreDir === 'unknown' || priceDir === 'unknown') {
    status = 'missing';
  } else if (scoreDir === 'flat' && priceDir === 'flat') {
    status = 'consistent';
  } else if (scoreDir === 'flat' || priceDir === 'flat') {
    status = 'neutral';
  } else if (scoreDir === priceDir) {
    status = 'consistent';
  } else {
    status = 'divergent';
  }

  let divergenceLevel = 'none';
  if (status === 'divergent') {
    const scoreAbs = Math.abs(scoreDelta || 0);
    const priceAbs = Math.abs(priceReturnPct || 0);
    if (scoreAbs >= CONFIG.majorScoreThreshold && priceAbs >= CONFIG.majorReturnThresholdPct) {
      divergenceLevel = 'major';
    } else if (scoreAbs >= CONFIG.moderateScoreThreshold && priceAbs >= CONFIG.moderateReturnThresholdPct) {
      divergenceLevel = 'moderate';
    }
  }

  if (stars >= 4 && priceReturnPct <= -CONFIG.majorReturnThresholdPct) divergenceLevel = 'major';
  if (stars <= 2 && priceReturnPct >= CONFIG.majorReturnThresholdPct + 3) divergenceLevel = 'major';
  if (divergenceLevel !== 'none' && status !== 'missing') status = 'divergent';

  return { scoreDir, priceDir, status, divergenceLevel };
}

function dirFromScoreLevel(score, stars) {
  if (!Number.isFinite(score)) return 'unknown';
  if (stars >= 4 || score >= 60) return 'up';
  if (stars <= 2 || score <= 40) return 'down';
  return 'flat';
}

function classifyLevel(score, priceReturnPct, stars) {
  const scoreDir = dirFromScoreLevel(score, stars);
  const priceDir = dirFromValue(priceReturnPct, CONFIG.priceFlatThresholdPct);

  let status = 'neutral';
  if (scoreDir === 'unknown' || priceDir === 'unknown') {
    status = 'missing';
  } else if (scoreDir === 'flat' && priceDir === 'flat') {
    status = 'consistent';
  } else if (scoreDir === 'flat' || priceDir === 'flat') {
    status = 'neutral';
  } else if (scoreDir === priceDir) {
    status = 'consistent';
  } else {
    status = 'divergent';
  }

  let divergenceLevel = 'none';
  if (status === 'divergent') {
    const priceAbs = Math.abs(priceReturnPct || 0);
    if (priceAbs >= CONFIG.majorReturnThresholdPct) {
      divergenceLevel = 'major';
    } else if (priceAbs >= CONFIG.moderateReturnThresholdPct) {
      divergenceLevel = 'moderate';
    }
  }

  if (stars >= 4 && priceReturnPct <= -CONFIG.majorReturnThresholdPct) divergenceLevel = 'major';
  if (stars <= 2 && priceReturnPct >= CONFIG.majorReturnThresholdPct + 3) divergenceLevel = 'major';
  if (divergenceLevel !== 'none' && status !== 'missing') status = 'divergent';

  return { scoreDir, priceDir, status, divergenceLevel };
}

function buildEventMap() {
  const map = new Map();
  EVENT_CALENDAR.forEach(event => {
    if (!map.has(event.month)) map.set(event.month, []);
    map.get(event.month).push(event);
  });
  return map;
}

async function fetchMonthlyByProxy(industries) {
  const result = {};
  const unique = new Map();
  industries.forEach(industry => {
    const proxy = resolveIndustryProxy(industry);
    if (!proxy) return;
    if (!unique.has(proxy.symbol)) unique.set(proxy.symbol, { proxy, industries: [] });
    unique.get(proxy.symbol).industries.push(industry);
  });

  let done = 0;
  for (const item of unique.values()) {
    done += 1;
    process.stdout.write(`[${done}/${unique.size}] ${item.proxy.name} ${item.proxy.symbol}\n`);
    try {
      const bars = await getDailyBars({
        provider: CONFIG.provider,
        symbol: item.proxy.symbol,
        eastmoneySecid: item.proxy.eastmoneySecid,
        instrumentType: item.proxy.type,
        startDate: CONFIG.startDate,
        endDate: CONFIG.endDate,
        refresh: CONFIG.refresh,
        minRows: 120,
        allowFallback: true
      });
      const normalizedBars = normalizeBars(bars);
      const monthly = aggregateMonthlyBars(normalizedBars);
      item.industries.forEach(industry => {
        result[industry] = { proxy: item.proxy, bars: normalizedBars, monthly, provider: CONFIG.provider, error: null };
      });
    } catch (error) {
      if (CONFIG.fallbackProvider === 'yahoo') {
        try {
          const fallbackBars = await fetchYahooChartBars(item.proxy.symbol, CONFIG.startDate, CONFIG.endDate);
          const normalizedBars = normalizeBars(fallbackBars);
          const monthly = aggregateMonthlyBars(normalizedBars);
          item.industries.forEach(industry => {
            result[industry] = {
              proxy: item.proxy,
              bars: normalizedBars,
              monthly,
              provider: 'yahoo',
              error: `primary ${CONFIG.provider} failed: ${error.message}`
            };
          });
          continue;
        } catch (fallbackError) {
          item.industries.forEach(industry => {
            result[industry] = {
              proxy: item.proxy,
              bars: [],
              monthly: {},
              provider: null,
              error: `primary ${CONFIG.provider} failed: ${error.message}; yahoo failed: ${fallbackError.message}`
            };
          });
          continue;
        }
      }
      item.industries.forEach(industry => {
        result[industry] = { proxy: item.proxy, bars: [], monthly: {}, provider: null, error: error.message };
      });
    }
  }
  return result;
}

function symbolToYahoo(symbol) {
  const normalized = String(symbol || '').toUpperCase();
  if (normalized.endsWith('.SH')) return normalized.replace('.SH', '.SS');
  if (normalized.endsWith('.SZ')) return normalized;
  return normalized;
}

async function fetchYahooChartBars(symbol, startDate, endDate) {
  const yahooSymbol = symbolToYahoo(symbol);
  const period1 = Math.floor(new Date(`${startDate}T00:00:00+08:00`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59+08:00`).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?` + new URLSearchParams({
    period1: String(period1),
    period2: String(period2),
    interval: '1d',
    events: 'history',
    includeAdjustedClose: 'true'
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 160)}`);
    return parseYahooChartJson(text, yahooSymbol);
  } catch (error) {
    return fetchYahooChartBarsViaPowerShell(url, yahooSymbol, error);
  } finally {
    clearTimeout(timer);
  }
}

function fetchYahooChartBarsViaPowerShell(url, yahooSymbol, firstError) {
  const escapedUrl = url.replace(/'/g, "''");
  const command = `$ProgressPreference='SilentlyContinue'; $u='${escapedUrl}'; (Invoke-WebRequest -UseBasicParsing -Uri $u -Headers @{'User-Agent'='Mozilla/5.0'} -TimeoutSec 30).Content`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim();
    throw new Error(`${firstError.message}; PowerShell Yahoo fallback failed: ${stderr.slice(0, 220)}`);
  }
  return parseYahooChartJson(result.stdout, yahooSymbol);
}

function parseYahooChartJson(text, yahooSymbol) {
  const json = JSON.parse(text);
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !Array.isArray(result.timestamp)) {
    throw new Error(`Yahoo returned no chart result for ${yahooSymbol}`);
  }
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0] || {};
  const adjClose = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0] && result.indicators.adjclose[0].adjclose || [];
  const bars = result.timestamp.map((ts, index) => ({
    trade_date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: quote.open && quote.open[index],
    high: quote.high && quote.high[index],
    low: quote.low && quote.low[index],
    close: quote.close && quote.close[index],
    adjclose: adjClose[index],
    volume: quote.volume && quote.volume[index],
    raw: { provider: 'yahoo-chart', symbol: yahooSymbol }
  })).filter(bar => [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
    .map(bar => {
      const factor = Number.isFinite(bar.adjclose) && Number.isFinite(bar.close) && bar.close !== 0
        ? bar.adjclose / bar.close
        : 1;
      return {
        ...bar,
        open: bar.open * factor,
        high: bar.high * factor,
        low: bar.low * factor,
        close: bar.close * factor
      };
    });
  if (!bars.length) throw new Error(`Yahoo returned empty bars for ${yahooSymbol}`);
  return bars.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function summarize(rows, industries, months) {
  const compared = rows.filter(row => row.isComparable);
  const consistent = compared.filter(row => row.consistency === 'consistent').length;
  const divergent = compared.filter(row => row.consistency === 'divergent').length;
  const majorDivergence = compared.filter(row => row.divergenceLevel === 'major').length;
  const moderateDivergence = compared.filter(row => row.divergenceLevel === 'moderate').length;

  const byIndustry = industries.map(industry => {
    const items = compared.filter(row => row.industry === industry);
    const c = items.filter(row => row.consistency === 'consistent').length;
    const d = items.filter(row => row.consistency === 'divergent').length;
    const major = items.filter(row => row.divergenceLevel === 'major').length;
    const avgReturn = items.length ? items.reduce((sum, row) => sum + row.priceReturnPct, 0) / items.length : null;
    const deltaItems = items.filter(row => Number.isFinite(row.scoreDelta));
    const avgScoreDelta = deltaItems.length ? deltaItems.reduce((sum, row) => sum + row.scoreDelta, 0) / deltaItems.length : null;
    const avgScore = items.length ? items.reduce((sum, row) => sum + row.score, 0) / items.length : null;
    return {
      industry,
      observations: items.length,
      consistencyRate: items.length ? pct(c / items.length * 100) : null,
      divergentCount: d,
      majorDivergenceCount: major,
      avgReturnPct: pct(avgReturn),
      avgScoreDelta: pct(avgScoreDelta),
      avgScore: pct(avgScore)
    };
  }).sort((a, b) => {
    if (b.majorDivergenceCount !== a.majorDivergenceCount) return b.majorDivergenceCount - a.majorDivergenceCount;
    return (a.consistencyRate ?? 999) - (b.consistencyRate ?? 999);
  });

  const byMonth = months.map(month => {
    const items = compared.filter(row => row.month === month);
    const c = items.filter(row => row.consistency === 'consistent').length;
    const major = items.filter(row => row.divergenceLevel === 'major').length;
    return {
      month,
      observations: items.length,
      consistencyRate: items.length ? pct(c / items.length * 100) : null,
      majorDivergenceCount: major,
      events: EVENT_CALENDAR.filter(event => event.month === month).map(event => event.title)
    };
  });

  const topDivergences = compared
    .filter(row => row.divergenceLevel === 'major' || row.divergenceLevel === 'moderate')
    .sort((a, b) => {
      const levelScore = level => level === 'major' ? 2 : level === 'moderate' ? 1 : 0;
      const levelDiff = levelScore(b.divergenceLevel) - levelScore(a.divergenceLevel);
      if (levelDiff) return levelDiff;
      return Math.abs(b.priceReturnPct) - Math.abs(a.priceReturnPct);
    })
    .slice(0, 80)
    .map(row => ({
      month: row.month,
      industry: row.industry,
      score: row.score,
      scoreDelta: row.scoreDelta,
      stars: row.stars,
      priceReturnPct: row.priceReturnPct,
      windowLabel: row.windowLabel,
      divergenceLevel: row.divergenceLevel,
      eventTitles: row.events.map(event => event.title)
    }));

  return {
    industries: industries.length,
    months: months.length,
    totalSignalRows: rows.length,
    comparedRows: compared.length,
    missingPriceRows: rows.filter(row => !row.hasPrice).length,
    excludedAnomalyRows: rows.filter(row => row.priceAnomaly).length,
    consistencyRate: compared.length ? pct(consistent / compared.length * 100) : null,
    divergentRate: compared.length ? pct(divergent / compared.length * 100) : null,
    majorDivergence,
    moderateDivergence,
    byIndustry,
    byMonth,
    topDivergences
  };
}

function attachScoreDeltas(signals) {
  const prevScoreMap = new Map();
  return signals.map(signal => {
    const prevScore = prevScoreMap.has(signal.industry) ? prevScoreMap.get(signal.industry) : null;
    prevScoreMap.set(signal.industry, signal.score);
    const scoreDelta = Number.isFinite(signal.score) && Number.isFinite(prevScore) ? pct(signal.score - prevScore) : null;
    return { ...signal, prevScore, scoreDelta };
  });
}

function priceWindowForScenario(scenario, signal, marketContext, priceInfo) {
  const bars = priceInfo.bars || [];
  if (scenario.windowMode === 'calendar_current') {
    const monthBar = priceInfo.monthly ? priceInfo.monthly[signal.month] : null;
    return {
      priceOhlc: monthBar,
      windowLabel: monthBar ? monthBar.windowLabel || signal.month : signal.month,
      requestedRange: naturalMonthRange(signal.month)
    };
  }

  if (scenario.windowMode === 'solar_current') {
    const period = marketContext.period || naturalMonthRange(signal.month);
    const priceOhlc = period ? aggregateBarsForRange(bars, period.start, period.end, period.label) : null;
    return { priceOhlc, windowLabel: period ? period.label : signal.month, requestedRange: period };
  }

  if (scenario.windowMode === 'forward_20d') {
    const period = marketContext.period || naturalMonthRange(signal.month);
    const start = period && period.start;
    const priceOhlc = aggregateForwardTradingDays(bars, start, CONFIG.forwardTradingDays);
    return {
      priceOhlc,
      windowLabel: priceOhlc ? priceOhlc.windowLabel : `${start || signal.month} 起后 ${CONFIG.forwardTradingDays} 个交易日`,
      requestedRange: period
    };
  }

  if (scenario.windowMode === 'next_calendar_month') {
    const range = nextCalendarMonthRange(signal.month);
    const priceOhlc = range ? aggregateBarsForRange(bars, range.start, range.end, range.label) : null;
    return { priceOhlc, windowLabel: range ? range.label : signal.month, requestedRange: range };
  }

  return { priceOhlc: null, windowLabel: signal.month, requestedRange: null };
}

function classifyScenario(scenario, signal, priceReturnPct) {
  if (scenario.signalMode === 'level') {
    return classifyLevel(signal.score, priceReturnPct, signal.stars);
  }
  return classifyConsistency(signal.scoreDelta, priceReturnPct, signal.stars);
}

function buildScenarioRows(scenario, signals, priceByIndustry, marketByMonth, eventMap) {
  return signals.map(signal => {
    const priceInfo = priceByIndustry[signal.industry] || {};
    const marketContext = marketByMonth[signal.month] || {};
    const window = priceWindowForScenario(scenario, signal, marketContext, priceInfo);
    const priceAnomaly = Boolean(window.priceOhlc && window.priceOhlc.anomaly);
    const priceReturnPct = window.priceOhlc && !priceAnomaly ? window.priceOhlc.returnPct : null;
    const classification = classifyScenario(scenario, signal, priceReturnPct);
    const topRank = (marketContext.top || []).some(item => item.industry === signal.industry);
    const bottomRank = (marketContext.bottom || []).some(item => item.industry === signal.industry);
    const hasPrice = Boolean(window.priceOhlc && !priceAnomaly);
    const isComparable = hasPrice && !priceAnomaly && (
      scenario.signalMode === 'level'
        ? Number.isFinite(signal.score)
        : Number.isFinite(signal.scoreDelta)
    );
    const signalOpen = Number.isFinite(signal.prevScore) ? signal.prevScore : signal.score;

    return {
      scenarioId: scenario.id,
      month: signal.month,
      seq: signal.seq,
      industry: signal.industry,
      proxy: priceInfo.proxy || null,
      score: signal.score,
      prevScore: signal.prevScore,
      scoreDelta: signal.scoreDelta,
      stars: signal.stars,
      signalMode: scenario.signalMode,
      signalOhlc: {
        open: Number.isFinite(signalOpen) ? signalOpen : signal.score,
        high: Math.max(Number.isFinite(signalOpen) ? signalOpen : signal.score, signal.score),
        low: Math.min(Number.isFinite(signalOpen) ? signalOpen : signal.score, signal.score),
        close: signal.score
      },
      priceOhlc: window.priceOhlc && !priceAnomaly ? window.priceOhlc : null,
      hasPrice,
      isComparable,
      priceAnomaly,
      priceAnomalyReason: priceAnomaly ? window.priceOhlc.anomalyReason : '',
      priceReturnPct,
      priceProvider: priceInfo.provider || null,
      windowLabel: window.windowLabel || signal.month,
      windowStart: window.priceOhlc ? window.priceOhlc.startDate : (window.requestedRange && window.requestedRange.start),
      windowEnd: window.priceOhlc ? window.priceOhlc.endDate : (window.requestedRange && window.requestedRange.end),
      windowPartial: Boolean(window.priceOhlc && window.priceOhlc.partial),
      scoreDirection: classification.scoreDir,
      priceDirection: classification.priceDir,
      consistency: classification.status,
      divergenceLevel: classification.divergenceLevel,
      rankTag: topRank ? 'TOP5' : bottomRank ? 'BOTTOM5' : '',
      marketCore: marketContext.core || '',
      period: marketContext.period || null,
      events: eventMap.get(signal.month) || [],
      signalText: signal.text,
      priceError: priceInfo.error || null
    };
  });
}

function buildScenario(scenario, signals, priceByIndustry, marketByMonth, eventMap, industries, months) {
  const rows = buildScenarioRows(scenario, signals, priceByIndustry, marketByMonth, eventMap);
  return {
    id: scenario.id,
    name: scenario.name,
    shortName: scenario.shortName,
    signalMode: scenario.signalMode,
    windowMode: scenario.windowMode,
    description: scenario.description,
    rows,
    summary: summarize(rows, industries, months)
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const { industries, months, signals } = parseCrossSignals();
  const marketByMonth = parseMarketSimulation();
  const eventMap = buildEventMap();
  const priceByIndustry = await fetchMonthlyByProxy(industries);
  const signalsWithDeltas = attachScoreDeltas(signals);
  const scenarios = {};
  SCENARIOS.forEach(scenario => {
    scenarios[scenario.id] = buildScenario(scenario, signalsWithDeltas, priceByIndustry, marketByMonth, eventMap, industries, months);
  });
  const defaultScenarioId = SCENARIOS[0].id;
  const defaultScenario = scenarios[defaultScenarioId];

  const payload = {
    generatedAt: new Date().toISOString(),
    version: 'wuxing-trend-mvp-2',
    config: CONFIG,
    notes: [
      'MVP uses monthly total score and star rating from the uploaded 36-month cross table.',
      'Price trend uses tradable ETF proxies from backend/industryProxyMap.js, not official SW industry indexes.',
      'Consistency measures direction alignment under multiple windows; it does not evaluate absolute return forecast accuracy.'
    ],
    eventCalendar: EVENT_CALENDAR,
    months,
    industries,
    scenarioList: SCENARIOS,
    defaultScenarioId,
    scenarios,
    rows: defaultScenario.rows,
    summary: defaultScenario.summary
  };

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const snapshotPath = path.join(OUTPUT_DIR, `wuxing-trend-mvp-${stamp}.json`);
  fs.writeFileSync(FRONTEND_JSON, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2), 'utf8');

  process.stdout.write(JSON.stringify({
    ok: true,
    output: FRONTEND_JSON,
    snapshot: snapshotPath,
    summary: payload.summary
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

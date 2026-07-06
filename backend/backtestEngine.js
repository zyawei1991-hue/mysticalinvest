const fs = require('fs');
const path = require('path');
const { getBaZi, countFiveElements, getEnhancedIndustries } = require('./bazi');
const { FRAMEWORK_VERSION } = require('./swIndustryFramework');
const { run, getLastInsertRowId } = require('./database');
const {
  getDailyBars,
  resolveIndustryProxy,
  resolveBenchmarkProxy,
  getProviderStatus,
  dashDate
} = require('./historicalDataProvider');

function addCalendarDays(dateStr, days) {
  const date = new Date(`${dashDate(dateStr)}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDaysBetween(startDate, endDate) {
  const start = new Date(`${dashDate(startDate)}T00:00:00+08:00`);
  const end = new Date(`${dashDate(endDate)}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Infinity;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function pctReturn(entry, exit) {
  const a = Number(entry);
  const b = Number(exit);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return (b / a - 1) * 100;
}

function barIndexByDate(bars) {
  const map = new Map();
  bars.forEach((bar, index) => map.set(bar.trade_date, index));
  return map;
}

function findBarOnOrAfter(bars, date) {
  return bars.find(bar => bar.trade_date >= date) || null;
}

function findBarOnOrAfterIndex(bars, date) {
  return bars.findIndex(bar => bar.trade_date >= date);
}

function avg(values) {
  const xs = values.filter(value => Number.isFinite(value));
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function quantile(values, q) {
  const xs = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (xs[base + 1] !== undefined) return xs[base] + rest * (xs[base + 1] - xs[base]);
  return xs[base];
}

function stdev(values) {
  const xs = values.filter(value => Number.isFinite(value));
  if (xs.length < 2) return null;
  const mean = avg(xs);
  const variance = xs.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function summarizeTrades(trades) {
  const groups = {};
  trades.forEach(trade => {
    const key = `top${trade.top_n}_h${trade.horizon_days}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(trade);
  });
  const summary = {};
  Object.entries(groups).forEach(([key, rows]) => {
    const returns = rows.map(row => row.return_pct);
    const excess = rows.map(row => row.excess_return_pct);
    const sd = stdev(excess);
    summary[key] = {
      samples: rows.length,
      avg_return_pct: avg(returns),
      avg_benchmark_return_pct: avg(rows.map(row => row.benchmark_return_pct)),
      avg_excess_return_pct: avg(excess),
      median_excess_return_pct: quantile(excess, 0.5),
      win_rate: rows.length ? rows.filter(row => row.return_pct > 0).length / rows.length : null,
      hit_rate_vs_benchmark: rows.length ? rows.filter(row => row.excess_return_pct > 0).length / rows.length : null,
      excess_stdev: sd,
      simple_sharpe_per_trade: sd && sd > 0 ? avg(excess) / sd : null
    };
  });
  return summary;
}

function countProvidersFromBars(barsBySymbol, benchmarkBars) {
  const counts = {};
  const add = row => {
    const key = row && row.provider || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  };
  (benchmarkBars || []).forEach(add);
  Object.values(barsBySymbol || {}).forEach(rows => rows.forEach(add));
  return counts;
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, '', 'utf8');
    return;
  }
  const columns = Object.keys(rows[0]);
  const escape = value => {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.join(',')]
    .concat(rows.map(row => columns.map(column => escape(row[column])).join(',')))
    .join('\n');
  fs.writeFileSync(filePath, csv, 'utf8');
}

async function ensureBarsForSymbols(symbols, startDate, endDate, provider, refresh, proxyBySymbol) {
  const barsBySymbol = {};
  for (const symbol of symbols) {
    const proxy = proxyBySymbol[symbol] || {};
    barsBySymbol[symbol] = await getDailyBars({
      provider,
      symbol,
      startDate,
      endDate,
      refresh,
      instrumentType: proxy.type,
      eastmoneySecid: proxy.eastmoneySecid
    });
  }
  return barsBySymbol;
}

function generateSignalsForDates(dates, benchmarkBars) {
  const benchmarkByDate = new Map(benchmarkBars.map(bar => [bar.trade_date, bar]));
  return dates.map(date => {
    const signalDate = new Date(`${date}T09:30:00+08:00`);
    const bazi = getBaZi(signalDate);
    const fiveCount = countFiveElements(bazi);
    const prevBenchmark = benchmarkByDate.get(date);
    const industries = getEnhancedIndustries(bazi, fiveCount, {
      reportDate: signalDate,
      scenario: 'short_term',
      hs300Change: Number(prevBenchmark && prevBenchmark.pct_chg || 0),
      upStocks: []
    });
    return { date, industries };
  });
}

function insertRun(params) {
  run(`INSERT INTO backtest_runs (name, framework_version, provider, start_date, end_date, params_json)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    params.name || 'v21-industry-backtest',
    FRAMEWORK_VERSION,
    params.provider,
    params.startDate,
    params.endDate,
    JSON.stringify(params)
  ]);
  return getLastInsertRowId();
}

function insertSignal(runId, signalDate, rank, industry) {
  run(`INSERT INTO backtest_signals (
    run_id, signal_date, rank, industry, proxy_symbol, factor_score, rating, signal_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    runId,
    signalDate,
    rank,
    industry.name,
    industry.proxy_symbol || null,
    industry.factor_score,
    industry.rating,
    JSON.stringify(industry)
  ]);
}

function insertReturn(runId, trade) {
  run(`INSERT INTO backtest_returns (
    run_id, signal_date, industry, proxy_symbol, top_n, horizon_days,
    entry_date, exit_date, entry_price, exit_price,
    return_pct, benchmark_return_pct, excess_return_pct
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    runId,
    trade.signal_date,
    trade.industry,
    trade.proxy_symbol,
    trade.top_n,
    trade.horizon_days,
    trade.entry_date,
    trade.exit_date,
    trade.entry_price,
    trade.exit_price,
    trade.return_pct,
    trade.benchmark_return_pct,
    trade.excess_return_pct
  ]);
}

async function runIndustryBacktest(options) {
  const opts = {
    startDate: options.startDate,
    endDate: options.endDate,
    provider: options.provider || process.env.HISTORY_PROVIDER || (process.env.TUSHARE_TOKEN ? 'tushare' : 'eastmoney'),
    benchmark: options.benchmark || 'hs300',
    topNs: options.topNs || [1, 3, 5],
    horizons: options.horizons || [1, 3, 5, 10],
    refresh: Boolean(options.refresh),
    maxEntryLagDays: options.maxEntryLagDays || 5,
    outputDir: options.outputDir || path.join(__dirname, '../outputs/backtests')
  };
  if (!opts.startDate || !opts.endDate) throw new Error('startDate/endDate are required');

  fs.mkdirSync(opts.outputDir, { recursive: true });

  const benchmarkProxy = resolveBenchmarkProxy(opts.benchmark);
  const endWithBuffer = addCalendarDays(opts.endDate, Math.max(...opts.horizons) * 3 + 10);
  const benchmarkBars = await getDailyBars({
    provider: opts.provider,
    symbol: benchmarkProxy.symbol,
    startDate: opts.startDate,
    endDate: endWithBuffer,
    refresh: opts.refresh,
    instrumentType: benchmarkProxy.type,
    eastmoneySecid: benchmarkProxy.eastmoneySecid
  });
  const signalDates = benchmarkBars
    .filter(bar => bar.trade_date >= opts.startDate && bar.trade_date <= opts.endDate)
    .map(bar => bar.trade_date);
  if (signalDates.length < 2) throw new Error('Not enough benchmark trading days for backtest');

  const signals = generateSignalsForDates(signalDates, benchmarkBars);
  const selectedIndustries = new Map();
  signals.forEach(signal => {
    signal.industries.slice(0, Math.max(...opts.topNs)).forEach(industry => {
      const proxy = resolveIndustryProxy(industry.name);
      if (proxy) selectedIndustries.set(industry.name, proxy);
    });
  });
  const proxyBySymbol = {};
  selectedIndustries.forEach(proxy => { proxyBySymbol[proxy.symbol] = proxy; });
  const symbols = Array.from(new Set(Array.from(selectedIndustries.values()).map(proxy => proxy.symbol)));
  const barsBySymbol = await ensureBarsForSymbols(symbols, opts.startDate, endWithBuffer, opts.provider, opts.refresh, proxyBySymbol);
  const dataProviderCounts = countProvidersFromBars(barsBySymbol, benchmarkBars);

  const runId = insertRun(opts);
  const trades = [];
  const benchmarkIndex = barIndexByDate(benchmarkBars);

  signals.forEach(signal => {
    const signalBenchmarkIndex = benchmarkIndex.get(signal.date);
    if (signalBenchmarkIndex === undefined) return;
    const entryBenchmark = benchmarkBars[signalBenchmarkIndex + 1];
    if (!entryBenchmark) return;

    const maxTopN = Math.max(...opts.topNs);
    const ranked = signal.industries.slice(0, maxTopN).map((industry, index) => {
      const proxy = resolveIndustryProxy(industry.name);
      const enriched = {
        ...industry,
        proxy_symbol: proxy && proxy.symbol,
        proxy_name: proxy && proxy.name,
        proxy_is_broad: proxy && proxy.proxy
      };
      insertSignal(runId, signal.date, index + 1, enriched);
      return enriched;
    });

    opts.topNs.forEach(topN => {
      ranked.slice(0, topN).forEach(industry => {
        if (!industry.proxy_symbol) return;
        const bars = barsBySymbol[industry.proxy_symbol] || [];
        const entryIndex = findBarOnOrAfterIndex(bars, entryBenchmark.trade_date);
        if (entryIndex < 0) return;
        const entry = bars[entryIndex];
        if (calendarDaysBetween(entryBenchmark.trade_date, entry.trade_date) > opts.maxEntryLagDays) return;

        opts.horizons.forEach(horizon => {
          const benchmarkExit = benchmarkBars[signalBenchmarkIndex + horizon + 1];
          if (!benchmarkExit) return;
          if (entry.trade_date > benchmarkExit.trade_date) return;
          const exit = findBarOnOrAfter(bars.slice(entryIndex + 1), benchmarkExit.trade_date);
          if (!exit) return;
          const ret = pctReturn(entry.open || entry.close, exit.close);
          const benchRet = pctReturn(entryBenchmark.open || entryBenchmark.close, benchmarkExit.close);
          if (ret === null || benchRet === null) return;
          const trade = {
            run_id: runId,
            signal_date: signal.date,
            top_n: topN,
            industry: industry.name,
            proxy_symbol: industry.proxy_symbol,
            horizon_days: horizon,
            entry_date: entry.trade_date,
            exit_date: exit.trade_date,
            entry_price: Number(entry.open || entry.close),
            exit_price: Number(exit.close),
            return_pct: ret,
            benchmark_return_pct: benchRet,
            excess_return_pct: ret - benchRet,
            factor_score: industry.factor_score,
            rating: industry.rating
          };
          trades.push(trade);
          insertReturn(runId, trade);
        });
      });
    });
  });

  const metrics = summarizeTrades(trades);
  const providerStatus = getProviderStatus();
  const report = {
    run_id: runId,
    framework_version: FRAMEWORK_VERSION,
    params: opts,
    provider_status: providerStatus,
    data_provider_counts: dataProviderCounts,
    signal_days: signals.length,
    symbols: symbols.length,
    trades: trades.length,
    metrics
  };
  run('UPDATE backtest_runs SET metrics_json = ? WHERE id = ?', [JSON.stringify(report), runId]);

  const stamp = `${opts.startDate}_${opts.endDate}_run${runId}`;
  const jsonPath = path.join(opts.outputDir, `backtest-${stamp}.json`);
  const csvPath = path.join(opts.outputDir, `backtest-trades-${stamp}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeCsv(csvPath, trades);
  return { ...report, output: { jsonPath, csvPath } };
}

module.exports = {
  runIndustryBacktest,
  summarizeTrades
};

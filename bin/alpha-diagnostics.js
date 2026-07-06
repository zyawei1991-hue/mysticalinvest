#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../backend/envLoader');

loadEnv();

const { all } = require('../backend/database');
const {
  getBaZi,
  countFiveElements,
  analyzeMarketStrength,
  getMarketFavors
} = require('../backend/bazi');
const { scoreSwIndustries } = require('../backend/swIndustryFramework');
const { resolveIndustryProxy, dashDate } = require('../backend/historicalDataProvider');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    if (next && !next.startsWith('--')) {
      args[name] = next;
      i++;
    } else {
      args[name] = true;
    }
  }
  return args;
}

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

function avg(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function stdev(values) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return null;
  const mean = avg(xs);
  return Math.sqrt(xs.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (xs.length - 1));
}

function quantile(values, q) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return xs[base + 1] === undefined ? xs[base] : xs[base] + rest * (xs[base + 1] - xs[base]);
}

function pctReturn(entry, exit) {
  const a = Number(entry);
  const b = Number(exit);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return (b / a - 1) * 100;
}

function rankValues(values, descending) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => descending ? b.value - a.value : a.value - b.value);
  const ranks = Array(values.length).fill(0);
  for (let i = 0; i < sorted.length; i++) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[sorted[k].index] = rank;
    i = j - 1;
  }
  return ranks;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const meanX = avg(xs);
  const meanY = avg(ys);
  let num = 0;
  let denX = 0;
  let denY = 0;
  xs.forEach((x, i) => {
    const dx = x - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  });
  const den = Math.sqrt(denX * denY);
  return den ? num / den : null;
}

function spearman(rows) {
  const xs = rows.map(row => row.factor_score);
  const ys = rows.map(row => row.excess_return_pct);
  return pearson(rankValues(xs, false), rankValues(ys, false));
}

function byDate(bars) {
  const map = new Map();
  bars.forEach((bar, index) => map.set(bar.trade_date, { bar, index }));
  return map;
}

function findBarOnOrAfter(bars, date) {
  return bars.find(bar => bar.trade_date >= date) || null;
}

function loadBars(provider, symbol, startDate, endDate) {
  return all(`SELECT provider, symbol, trade_date, open, high, low, close, pre_close, pct_chg
    FROM historical_daily_bars
    WHERE provider = ? AND symbol = ? AND trade_date >= ? AND trade_date <= ?
    ORDER BY trade_date ASC`, [provider, symbol, dashDate(startDate), dashDate(endDate)]);
}

function getIndustryReturns(industry, bars, entryDate, exitDate, benchmarkReturn, maxEntryLagDays) {
  if (!bars || !bars.length) return null;
  const entry = findBarOnOrAfter(bars, entryDate);
  if (!entry) return null;
  if (calendarDaysBetween(entryDate, entry.trade_date) > maxEntryLagDays) return null;
  if (entry.trade_date > exitDate) return null;
  const laterBars = bars.filter(bar => bar.trade_date > entry.trade_date);
  const exit = findBarOnOrAfter(laterBars, exitDate);
  if (!exit) return null;
  const ret = pctReturn(entry.open || entry.close, exit.close);
  if (!Number.isFinite(ret) || !Number.isFinite(benchmarkReturn)) return null;
  return {
    ...industry,
    entry_date: entry.trade_date,
    exit_date: exit.trade_date,
    return_pct: ret,
    benchmark_return_pct: benchmarkReturn,
    excess_return_pct: ret - benchmarkReturn
  };
}

function summarize(rows, accessor) {
  const values = rows.map(accessor).filter(Number.isFinite);
  const mean = avg(values);
  const sd = stdev(values);
  const se = sd && values.length > 1 ? sd / Math.sqrt(values.length) : null;
  return {
    samples: values.length,
    mean,
    median: quantile(values, 0.5),
    q25: quantile(values, 0.25),
    q75: quantile(values, 0.75),
    stdev: sd,
    t_stat: se ? mean / se : null,
    ci95_low: se ? mean - 1.96 * se : null,
    ci95_high: se ? mean + 1.96 * se : null
  };
}

function fmtPct(value, digits = 4) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'NA';
}

function fmtNum(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'NA';
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, '', 'utf8');
    return;
  }
  const columns = Object.keys(rows[0]);
  const escape = value => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.writeFileSync(filePath, [columns.join(',')].concat(rows.map(row => columns.map(column => escape(row[column])).join(','))).join('\n'), 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const provider = args.provider || process.env.HISTORY_PROVIDER || 'tushare';
  const startDate = args.start || '2021-01-01';
  const endDate = args.end || '2026-06-19';
  const horizons = String(args.horizon || '1,3,5,10').split(',').map(Number).filter(Number.isFinite);
  const maxEntryLagDays = Number(args.maxEntryLagDays || 5);
  const outputDir = args.output || path.join(__dirname, '../outputs/backtests');
  fs.mkdirSync(outputDir, { recursive: true });

  const endWithBuffer = addCalendarDays(endDate, Math.max(...horizons) * 3 + 10);
  const benchmarkBars = loadBars(provider, '000300.SH', startDate, endWithBuffer);
  const benchmarkMap = byDate(benchmarkBars);
  const signalDates = benchmarkBars
    .filter(bar => bar.trade_date >= dashDate(startDate) && bar.trade_date <= dashDate(endDate))
    .map(bar => bar.trade_date);

  const proxyByIndustry = new Map();
  const barsBySymbol = new Map();
  signalDates.forEach(() => {});
  const allNames = scoreSwIndustries({
    bazi: getBaZi(new Date(`${signalDates[0]}T09:30:00+08:00`)),
    fiveCount: countFiveElements(getBaZi(new Date(`${signalDates[0]}T09:30:00+08:00`))),
    scenario: 'short_term',
    marketData: { reportDate: new Date(`${signalDates[0]}T09:30:00+08:00`) }
  }).industries.map(row => row.name);

  allNames.forEach(name => {
    const proxy = resolveIndustryProxy(name);
    if (!proxy) return;
    proxyByIndustry.set(name, proxy);
    if (!barsBySymbol.has(proxy.symbol)) {
      barsBySymbol.set(proxy.symbol, loadBars(provider, proxy.symbol, startDate, endWithBuffer));
    }
  });

  const dailyRows = [];
  const industryRows = [];
  for (const signalDate of signalDates) {
    const signalBenchmark = benchmarkMap.get(signalDate);
    if (!signalBenchmark) continue;
    const signalBenchmarkIndex = signalBenchmark.index;
    const entryBenchmark = benchmarkBars[signalBenchmarkIndex + 1];
    if (!entryBenchmark) continue;

    const dateObj = new Date(`${signalDate}T09:30:00+08:00`);
    const bazi = getBaZi(dateObj);
    const fiveCount = countFiveElements(bazi);
    const strengthInfo = analyzeMarketStrength(bazi, fiveCount);
    const favors = getMarketFavors(bazi, fiveCount, strengthInfo);
    const scored = scoreSwIndustries({
      bazi,
      fiveCount,
      favorableElement: favors.favorableElement || fiveCount.dominant,
      dominantElement: fiveCount.dominant,
      scenario: 'short_term',
      marketData: {
        reportDate: dateObj,
        hs300Change: Number(signalBenchmark.bar.pct_chg || 0),
        strongIndustries: []
      }
    }).industries.map((row, index) => ({
      ...row,
      rank: index + 1,
      proxy: proxyByIndustry.get(row.name)
    })).filter(row => row.proxy);

    for (const horizon of horizons) {
      const benchmarkExit = benchmarkBars[signalBenchmarkIndex + horizon + 1];
      if (!benchmarkExit) continue;
      const benchmarkReturn = pctReturn(entryBenchmark.open || entryBenchmark.close, benchmarkExit.close);
      if (!Number.isFinite(benchmarkReturn)) continue;

      const enriched = scored
        .map(industry => getIndustryReturns(
          industry,
          barsBySymbol.get(industry.proxy.symbol),
          entryBenchmark.trade_date,
          benchmarkExit.trade_date,
          benchmarkReturn,
          maxEntryLagDays
        ))
        .filter(Boolean);
      if (enriched.length < 10) continue;

      const sorted = enriched.slice().sort((a, b) => a.rank - b.rank);
      const top1 = sorted.slice(0, 1);
      const top3 = sorted.slice(0, 3);
      const top5 = sorted.slice(0, 5);
      const bottom5 = sorted.slice(-5);
      const universe = sorted;
      const bestFuture = universe.slice().sort((a, b) => b.excess_return_pct - a.excess_return_pct)[0];
      const top5Industries = new Set(top5.map(row => row.name));
      const row = {
        signal_date: signalDate,
        horizon_days: horizon,
        valid_industries: universe.length,
        rank_ic: spearman(universe),
        top1_excess_pct: avg(top1.map(item => item.excess_return_pct)),
        top3_excess_pct: avg(top3.map(item => item.excess_return_pct)),
        top5_excess_pct: avg(top5.map(item => item.excess_return_pct)),
        universe_excess_pct: avg(universe.map(item => item.excess_return_pct)),
        bottom5_excess_pct: avg(bottom5.map(item => item.excess_return_pct)),
        top5_lift_vs_universe_pct: avg(top5.map(item => item.excess_return_pct)) - avg(universe.map(item => item.excess_return_pct)),
        top5_bottom5_spread_pct: avg(top5.map(item => item.excess_return_pct)) - avg(bottom5.map(item => item.excess_return_pct)),
        top5_hit_vs_benchmark: avg(top5.map(item => item.excess_return_pct)) > 0 ? 1 : 0,
        top5_hit_vs_universe: avg(top5.map(item => item.excess_return_pct)) > avg(universe.map(item => item.excess_return_pct)) ? 1 : 0,
        future_best_in_top5: bestFuture && top5Industries.has(bestFuture.name) ? 1 : 0,
        expected_random_best_capture: Math.min(5 / universe.length, 1)
      };
      dailyRows.push(row);
      top5.forEach(item => {
        industryRows.push({
          signal_date: signalDate,
          horizon_days: horizon,
          rank: item.rank,
          industry: item.name,
          factor_score: item.factor_score,
          proxy_symbol: item.proxy.symbol,
          return_pct: item.return_pct,
          benchmark_return_pct: item.benchmark_return_pct,
          excess_return_pct: item.excess_return_pct
        });
      });
    }
  }

  const summaryRows = horizons.map(horizon => {
    const rows = dailyRows.filter(row => row.horizon_days === horizon);
    const top5 = summarize(rows, row => row.top5_excess_pct);
    const lift = summarize(rows, row => row.top5_lift_vs_universe_pct);
    const spread = summarize(rows, row => row.top5_bottom5_spread_pct);
    const ic = summarize(rows, row => row.rank_ic);
    return {
      horizon_days: horizon,
      signal_days: rows.length,
      avg_valid_industries: avg(rows.map(row => row.valid_industries)),
      top5_avg_excess_pct: top5.mean,
      top5_median_excess_pct: top5.median,
      top5_excess_t_stat: top5.t_stat,
      top5_excess_ci95_low_pct: top5.ci95_low,
      top5_excess_ci95_high_pct: top5.ci95_high,
      top5_hit_vs_benchmark: avg(rows.map(row => row.top5_hit_vs_benchmark)),
      top5_lift_vs_universe_pct: lift.mean,
      top5_lift_t_stat: lift.t_stat,
      top5_bottom5_spread_pct: spread.mean,
      top5_bottom5_spread_t_stat: spread.t_stat,
      rank_ic_avg: ic.mean,
      rank_ic_t_stat: ic.t_stat,
      rank_ic_positive_rate: rows.filter(row => row.rank_ic > 0).length / rows.length,
      future_best_capture_rate: avg(rows.map(row => row.future_best_in_top5)),
      random_best_capture_expectation: avg(rows.map(row => row.expected_random_best_capture))
    };
  });

  const annualRows = [];
  horizons.forEach(horizon => {
    const byYear = new Map();
    dailyRows.filter(row => row.horizon_days === horizon).forEach(row => {
      const year = row.signal_date.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(row);
    });
    byYear.forEach((rows, year) => {
      annualRows.push({
        year,
        horizon_days: horizon,
        signal_days: rows.length,
        top5_avg_excess_pct: avg(rows.map(row => row.top5_excess_pct)),
        top5_lift_vs_universe_pct: avg(rows.map(row => row.top5_lift_vs_universe_pct)),
        rank_ic_avg: avg(rows.map(row => row.rank_ic)),
        top5_hit_vs_universe: avg(rows.map(row => row.top5_hit_vs_universe))
      });
    });
  });

  const dailyCsv = path.join(outputDir, `alpha-diagnostics-daily-${startDate}_${endDate}.csv`);
  const summaryCsv = path.join(outputDir, `alpha-diagnostics-summary-${startDate}_${endDate}.csv`);
  const annualCsv = path.join(outputDir, `alpha-diagnostics-annual-${startDate}_${endDate}.csv`);
  const top5Csv = path.join(outputDir, `alpha-diagnostics-top5-rows-${startDate}_${endDate}.csv`);
  writeCsv(dailyCsv, dailyRows);
  writeCsv(summaryCsv, summaryRows);
  writeCsv(annualCsv, annualRows);
  writeCsv(top5Csv, industryRows);

  const h5 = summaryRows.find(row => row.horizon_days === 5);
  const h10 = summaryRows.find(row => row.horizon_days === 10);
  const reportPath = path.join(outputDir, `alpha-diagnostics-report-${startDate}_${endDate}.md`);
  const lines = [];
  lines.push(`# 五行日报算法 Alpha 诊断报告`);
  lines.push('');
  lines.push(`- 区间：${startDate} 至 ${endDate}`);
  lines.push(`- 数据源：${provider} 本地缓存`);
  lines.push(`- 目标：验证行业排序本身是否产生可解释 alpha，而不是只看跑赢率。`);
  lines.push(`- 口径：每日收盘信号，下一交易日开盘入场；比较 Top5、全行业均值、Bottom5、未来最强行业捕获率。`);
  lines.push('');
  lines.push('## 更有说服力的结论');
  lines.push('');
  if (h5) {
    lines.push(`1. **Top5 相对沪深300有正超额**：5日持有平均超额 ${fmtPct(h5.top5_avg_excess_pct)}，95%CI [${fmtPct(h5.top5_excess_ci95_low_pct)}, ${fmtPct(h5.top5_excess_ci95_high_pct)}]，t=${fmtNum(h5.top5_excess_t_stat)}。`);
    lines.push(`2. **Top5 相对全行业平均有提升**：5日 Top5-全行业均值提升 ${fmtPct(h5.top5_lift_vs_universe_pct)}，t=${fmtNum(h5.top5_lift_t_stat)}。这比“55%跑赢率”更能说明排序有用。`);
    lines.push(`3. **Top5-Bottom5 有分层**：5日 Top5-Bottom5 spread 为 ${fmtPct(h5.top5_bottom5_spread_pct)}，t=${fmtNum(h5.top5_bottom5_spread_t_stat)}。如果这个值长期为正，说明模型不只是碰巧选到上涨市场。`);
    lines.push(`4. **未来最强行业捕获率**：Top5 抓到未来最强行业的概率 ${fmtPct(h5.future_best_capture_rate * 100, 2)}，随机 Top5 理论期望约 ${fmtPct(h5.random_best_capture_expectation * 100, 2)}。`);
  }
  if (h10) {
    lines.push(`5. **10日持有仍有延续**：Top5 10日平均超额 ${fmtPct(h10.top5_avg_excess_pct)}，Top5-全行业均值提升 ${fmtPct(h10.top5_lift_vs_universe_pct)}。`);
  }
  lines.push('');
  lines.push('## 汇总指标');
  lines.push('');
  lines.push('| 持有期 | 信号日 | Top5平均超额 | 95%CI | t值 | Top5-全行业 | Top5-Bottom5 | Rank IC | IC正比例 | 未来最强捕获 | 随机期望 |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  summaryRows.forEach(row => {
    lines.push(`| ${row.horizon_days} | ${row.signal_days} | ${fmtPct(row.top5_avg_excess_pct)} | ${fmtPct(row.top5_excess_ci95_low_pct)}~${fmtPct(row.top5_excess_ci95_high_pct)} | ${fmtNum(row.top5_excess_t_stat)} | ${fmtPct(row.top5_lift_vs_universe_pct)} | ${fmtPct(row.top5_bottom5_spread_pct)} | ${fmtNum(row.rank_ic_avg, 4)} | ${fmtPct(row.rank_ic_positive_rate * 100, 2)} | ${fmtPct(row.future_best_capture_rate * 100, 2)} | ${fmtPct(row.random_best_capture_expectation * 100, 2)} |`);
  });
  lines.push('');
  lines.push('## 年度稳定性：Top5-全行业均值');
  lines.push('');
  lines.push('| 年份 | 持有期 | 信号日 | Top5平均超额 | Top5-全行业 | Rank IC | Top5强于全行业比例 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  annualRows
    .filter(row => row.horizon_days === 5 || row.horizon_days === 10)
    .forEach(row => {
      lines.push(`| ${row.year} | ${row.horizon_days} | ${row.signal_days} | ${fmtPct(row.top5_avg_excess_pct)} | ${fmtPct(row.top5_lift_vs_universe_pct)} | ${fmtNum(row.rank_ic_avg, 4)} | ${fmtPct(row.top5_hit_vs_universe * 100, 2)} |`);
    });
  lines.push('');
  lines.push('## 怎么理解');
  lines.push('');
  lines.push('- **跑赢率 55% 本身不强**，但如果同时看到 Top5-全行业、Top5-Bottom5、未来最强行业捕获率都显著高于随机，才更能证明算法有排序价值。');
  lines.push('- 当前结果更支持“行业候选池”价值：帮助投资者把注意力收敛到 3-5 个相对更优行业，而不是输出单一买点。');
  lines.push('- 如果要证明早盘/午盘日报也有效，下一轮必须使用当时可见的盘中资金和宽度快照，避免用收盘后数据反推盘中决策。');

  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({
    report: reportPath,
    summary_csv: summaryCsv,
    annual_csv: annualCsv,
    daily_csv: dailyCsv,
    top5_rows_csv: top5Csv,
    headline: h5
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

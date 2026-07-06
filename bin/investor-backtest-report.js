#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../backend/envLoader');

loadEnv();

const { get, all } = require('../backend/database');

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

function maxDrawdown(equityValues) {
  let peak = equityValues[0] || 1;
  let maxDd = 0;
  equityValues.forEach(value => {
    if (value > peak) peak = value;
    if (peak > 0) maxDd = Math.min(maxDd, value / peak - 1);
  });
  return maxDd * 100;
}

function compoundReturn(returnsPct) {
  return returnsPct.reduce((equity, value) => equity * (1 + value / 100), 1);
}

function formatPct(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'NA';
}

function formatNum(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'NA';
}

function toCsv(filePath, rows) {
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

function groupBasketRows(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = [row.signal_date, row.top_n, row.horizon_days].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        signal_date: row.signal_date,
        top_n: row.top_n,
        horizon_days: row.horizon_days,
        entry_date: row.entry_date,
        exit_date: row.exit_date,
        benchmark_return_pct: row.benchmark_return_pct,
        proxies: new Map()
      });
    }
    const group = groups.get(key);
    if (!group.proxies.has(row.proxy_symbol)) {
      group.proxies.set(row.proxy_symbol, row.return_pct);
    }
  });
  return Array.from(groups.values()).map(group => {
    const returns = Array.from(group.proxies.values()).filter(Number.isFinite);
    const basketReturn = avg(returns);
    return {
      signal_date: group.signal_date,
      top_n: Number(group.top_n),
      horizon_days: Number(group.horizon_days),
      entry_date: group.entry_date,
      exit_date: group.exit_date,
      proxy_count: returns.length,
      basket_return_pct: basketReturn,
      benchmark_return_pct: Number(group.benchmark_return_pct),
      excess_return_pct: Number.isFinite(basketReturn) ? basketReturn - Number(group.benchmark_return_pct) : null
    };
  }).filter(row => Number.isFinite(row.basket_return_pct) && Number.isFinite(row.benchmark_return_pct));
}

function summarizeSignals(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = `top${row.top_n}_h${row.horizon_days}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return Array.from(groups.entries()).map(([key, values]) => {
    const returns = values.map(row => row.basket_return_pct);
    const benchmark = values.map(row => row.benchmark_return_pct);
    const excess = values.map(row => row.excess_return_pct);
    const sd = stdev(excess);
    return {
      key,
      top_n: values[0].top_n,
      horizon_days: values[0].horizon_days,
      signal_days: values.length,
      avg_return_pct: avg(returns),
      avg_benchmark_return_pct: avg(benchmark),
      avg_excess_return_pct: avg(excess),
      median_excess_return_pct: quantile(excess, 0.5),
      q25_excess_return_pct: quantile(excess, 0.25),
      q75_excess_return_pct: quantile(excess, 0.75),
      win_rate: values.filter(row => row.basket_return_pct > 0).length / values.length,
      hit_rate_vs_benchmark: values.filter(row => row.excess_return_pct > 0).length / values.length,
      excess_stdev: sd,
      simple_sharpe_per_signal: sd && sd > 0 ? avg(excess) / sd : null
    };
  }).sort((a, b) => a.top_n - b.top_n || a.horizon_days - b.horizon_days);
}

function simulateDailyRebalance(rows, topN, costBps) {
  const selected = rows
    .filter(row => row.top_n === topN && row.horizon_days === 1)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const adjustedReturns = selected.map(row => row.basket_return_pct - costBps / 100);
  const benchmarkReturns = selected.map(row => row.benchmark_return_pct);
  const equity = [1];
  adjustedReturns.forEach(value => equity.push(equity[equity.length - 1] * (1 + value / 100)));
  const benchmarkEquity = [1];
  benchmarkReturns.forEach(value => benchmarkEquity.push(benchmarkEquity[benchmarkEquity.length - 1] * (1 + value / 100)));
  const finalEquity = equity[equity.length - 1] || 1;
  const finalBenchmark = benchmarkEquity[benchmarkEquity.length - 1] || 1;
  const annualFactor = selected.length ? 252 / selected.length : 0;
  return {
    mode: `top${topN}_daily_h1`,
    trades: selected.length,
    cost_bps_roundtrip: costBps,
    total_return_pct: (finalEquity - 1) * 100,
    benchmark_total_return_pct: (finalBenchmark - 1) * 100,
    excess_total_return_pct: (finalEquity - finalBenchmark) * 100,
    annualized_return_pct: annualFactor ? (Math.pow(finalEquity, annualFactor) - 1) * 100 : null,
    benchmark_annualized_return_pct: annualFactor ? (Math.pow(finalBenchmark, annualFactor) - 1) * 100 : null,
    max_drawdown_pct: maxDrawdown(equity),
    benchmark_max_drawdown_pct: maxDrawdown(benchmarkEquity)
  };
}

function simulateNonOverlap(rows, topN, horizonDays, costBps) {
  const selected = rows
    .filter(row => row.top_n === topN && row.horizon_days === horizonDays)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const picked = [];
  let lastExit = '';
  selected.forEach(row => {
    if (lastExit && row.entry_date <= lastExit) return;
    picked.push(row);
    lastExit = row.exit_date;
  });
  const adjustedReturns = picked.map(row => row.basket_return_pct - costBps / 100);
  const benchmarkReturns = picked.map(row => row.benchmark_return_pct);
  const strategyEquity = [1];
  adjustedReturns.forEach(value => strategyEquity.push(strategyEquity[strategyEquity.length - 1] * (1 + value / 100)));
  const benchmarkEquity = [1];
  benchmarkReturns.forEach(value => benchmarkEquity.push(benchmarkEquity[benchmarkEquity.length - 1] * (1 + value / 100)));
  const strategyFinal = strategyEquity[strategyEquity.length - 1] || 1;
  const benchmarkFinal = benchmarkEquity[benchmarkEquity.length - 1] || 1;
  return {
    mode: `top${topN}_nonoverlap_h${horizonDays}`,
    trades: picked.length,
    cost_bps_roundtrip: costBps,
    total_return_pct: (strategyFinal - 1) * 100,
    benchmark_total_return_pct: (benchmarkFinal - 1) * 100,
    excess_total_return_pct: (strategyFinal - benchmarkFinal) * 100,
    max_drawdown_pct: maxDrawdown(strategyEquity),
    benchmark_max_drawdown_pct: maxDrawdown(benchmarkEquity),
    hit_rate_vs_benchmark: picked.length ? picked.filter(row => row.excess_return_pct > 0).length / picked.length : null
  };
}

function segmentByYear(rows, topN, horizonDays) {
  const groups = new Map();
  rows.filter(row => row.top_n === topN && row.horizon_days === horizonDays).forEach(row => {
    const year = row.entry_date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(row);
  });
  return Array.from(groups.entries()).map(([year, values]) => ({
    year,
    signal_days: values.length,
    avg_excess_return_pct: avg(values.map(row => row.excess_return_pct)),
    median_excess_return_pct: quantile(values.map(row => row.excess_return_pct), 0.5),
    hit_rate_vs_benchmark: values.filter(row => row.excess_return_pct > 0).length / values.length
  })).sort((a, b) => a.year.localeCompare(b.year));
}

function main() {
  const args = parseArgs(process.argv);
  const run = args.run
    ? get('SELECT * FROM backtest_runs WHERE id = ?', [Number(args.run)])
    : get('SELECT * FROM backtest_runs ORDER BY id DESC LIMIT 1');
  if (!run) throw new Error('No backtest run found');

  const rawRows = all(`SELECT signal_date, top_n, horizon_days, entry_date, exit_date, proxy_symbol,
      return_pct, benchmark_return_pct, excess_return_pct
    FROM backtest_returns
    WHERE run_id = ?
    ORDER BY signal_date, top_n, horizon_days, proxy_symbol`, [run.id]);
  if (!rawRows.length) throw new Error(`No return rows found for run ${run.id}`);

  const baskets = groupBasketRows(rawRows);
  const signalSummary = summarizeSignals(baskets);
  const signalSummaryByKey = Object.fromEntries(signalSummary.map(row => [row.key, row]));
  const costBps = Number(args.costBps || 10);
  const portfolioRows = [
    simulateDailyRebalance(baskets, 1, 0),
    simulateDailyRebalance(baskets, 3, 0),
    simulateDailyRebalance(baskets, 5, 0),
    simulateDailyRebalance(baskets, 5, costBps),
    simulateNonOverlap(baskets, 5, 5, 0),
    simulateNonOverlap(baskets, 5, 5, costBps),
    simulateNonOverlap(baskets, 5, 10, 0),
    simulateNonOverlap(baskets, 5, 10, costBps)
  ];
  const yearlyTop5H5 = segmentByYear(baskets, 5, 5);
  const top1Frequency = all(`SELECT industry, COUNT(*) AS days
    FROM backtest_signals
    WHERE run_id = ? AND rank = 1
    GROUP BY industry
    ORDER BY days DESC
    LIMIT 10`, [run.id]);

  const bestIndustries = all(`SELECT industry, COUNT(*) AS samples,
      AVG(return_pct) AS avg_return_pct,
      AVG(excess_return_pct) AS avg_excess_return_pct,
      AVG(CASE WHEN excess_return_pct > 0 THEN 1.0 ELSE 0.0 END) AS hit_rate
    FROM backtest_returns
    WHERE run_id = ? AND top_n = 5 AND horizon_days = 5
    GROUP BY industry
    HAVING samples >= 80
    ORDER BY avg_excess_return_pct DESC
    LIMIT 8`, [run.id]);

  const weakIndustries = all(`SELECT industry, COUNT(*) AS samples,
      AVG(return_pct) AS avg_return_pct,
      AVG(excess_return_pct) AS avg_excess_return_pct,
      AVG(CASE WHEN excess_return_pct > 0 THEN 1.0 ELSE 0.0 END) AS hit_rate
    FROM backtest_returns
    WHERE run_id = ? AND top_n = 5 AND horizon_days = 5
    GROUP BY industry
    HAVING samples >= 80
    ORDER BY avg_excess_return_pct ASC
    LIMIT 8`, [run.id]);

  const outputDir = args.output || path.join(__dirname, '../outputs/backtests');
  fs.mkdirSync(outputDir, { recursive: true });
  const basketCsv = path.join(outputDir, `investor-basket-metrics-run${run.id}.csv`);
  const portfolioCsv = path.join(outputDir, `investor-portfolio-scenarios-run${run.id}.csv`);
  const reportPath = path.join(outputDir, `investor-backtest-report-run${run.id}.md`);
  toCsv(basketCsv, signalSummary);
  toCsv(portfolioCsv, portfolioRows);

  const keyRows = ['top1_h5', 'top3_h5', 'top5_h5', 'top5_h10']
    .map(key => signalSummaryByKey[key])
    .filter(Boolean);
  const top5H5 = signalSummaryByKey.top5_h5;
  const top1H5 = signalSummaryByKey.top1_h5;
  const dailyTop5Cost = portfolioRows.find(row => row.mode === 'top5_daily_h1' && row.cost_bps_roundtrip === costBps);
  const nonOverlapTop5H5Cost = portfolioRows.find(row => row.mode === 'top5_nonoverlap_h5' && row.cost_bps_roundtrip === costBps);

  const lines = [];
  lines.push(`# 五行投资日报算法投资有效性回测报告 Run ${run.id}`);
  lines.push('');
  lines.push(`- 回测区间：${run.start_date} 至 ${run.end_date}`);
  lines.push(`- 数据源：${run.provider}，行情已缓存到 SQLite`);
  lines.push(`- 验证对象：当前 V2.1 五行行业排序逻辑对“投资者选行业/配行业”的帮助`);
  lines.push(`- 交易口径：收盘后得到日报信号，下一交易日开盘买入，按 1/3/5/10 个交易日持有，相对沪深300计算超额`);
  lines.push(`- 重要边界：这次验证的是“行业推荐核心”，未覆盖早盘/午盘盘中资金、个股清单、LLM 文案和人工执行约束`);
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push('当前证据支持把日报用于“行业候选池/方向过滤”，不支持直接把 Top1 当作重仓买入信号。');
  if (top5H5 && top1H5) {
    lines.push(`Top5 分散篮子在 5 日持有上平均超额 ${formatPct(top5H5.avg_excess_return_pct, 4)}，中位超额 ${formatPct(top5H5.median_excess_return_pct, 4)}，跑赢率 ${formatPct(top5H5.hit_rate_vs_benchmark * 100, 2)}；Top1 的同口径中位超额为 ${formatPct(top1H5.median_excess_return_pct, 4)}，集中推荐稳定性不足。`);
  }
  if (dailyTop5Cost) {
    lines.push(`若每天按 Top5 做 1 日轮动，并扣除 ${costBps}bp 单次往返成本，累计收益约 ${formatPct(dailyTop5Cost.total_return_pct, 2)}，同口径沪深300约 ${formatPct(dailyTop5Cost.benchmark_total_return_pct, 2)}，但这类高频换仓对成本和滑点敏感。`);
  }
  if (nonOverlapTop5H5Cost) {
    lines.push(`若按 Top5/5日做非重叠轮动，并扣除 ${costBps}bp 往返成本，累计收益约 ${formatPct(nonOverlapTop5H5Cost.total_return_pct, 2)}，同口径沪深300约 ${formatPct(nonOverlapTop5H5Cost.benchmark_total_return_pct, 2)}。`);
  }
  lines.push('');
  lines.push('## 投资者决策检验');
  lines.push('');
  lines.push('| 信号 | 信号日 | 平均收益 | 沪深300 | 平均超额 | 中位超额 | 跑赢率 | 判断 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|');
  keyRows.forEach(row => {
    let judgement = '弱';
    if (row.avg_excess_return_pct > 0 && row.median_excess_return_pct > 0 && row.hit_rate_vs_benchmark >= 0.5) judgement = '可作为候选池';
    else if (row.avg_excess_return_pct > 0) judgement = '均值有贡献但不稳定';
    lines.push(`| ${row.key} | ${row.signal_days} | ${formatPct(row.avg_return_pct, 4)} | ${formatPct(row.avg_benchmark_return_pct, 4)} | ${formatPct(row.avg_excess_return_pct, 4)} | ${formatPct(row.median_excess_return_pct, 4)} | ${formatPct(row.hit_rate_vs_benchmark * 100, 2)} | ${judgement} |`);
  });
  lines.push('');
  lines.push('## 可执行组合模拟');
  lines.push('');
  lines.push('| 组合 | 次数 | 成本 | 策略累计 | 基准累计 | 超额累计 | 最大回撤 | 基准回撤 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  portfolioRows.forEach(row => {
    lines.push(`| ${row.mode} | ${row.trades} | ${row.cost_bps_roundtrip}bp | ${formatPct(row.total_return_pct, 2)} | ${formatPct(row.benchmark_total_return_pct, 2)} | ${formatPct(row.excess_total_return_pct, 2)} | ${formatPct(row.max_drawdown_pct, 2)} | ${formatPct(row.benchmark_max_drawdown_pct, 2)} |`);
  });
  lines.push('');
  lines.push('## 年度稳定性：Top5 / 5日');
  lines.push('');
  lines.push('| 年份 | 信号日 | 平均超额 | 中位超额 | 跑赢率 |');
  lines.push('|---|---:|---:|---:|---:|');
  yearlyTop5H5.forEach(row => {
    lines.push(`| ${row.year} | ${row.signal_days} | ${formatPct(row.avg_excess_return_pct, 4)} | ${formatPct(row.median_excess_return_pct, 4)} | ${formatPct(row.hit_rate_vs_benchmark * 100, 2)} |`);
  });
  lines.push('');
  lines.push('## 信号集中度');
  lines.push('');
  lines.push('Top1 高频行业说明算法在某些五行/年度结构下会反复偏向少数行业，需要限制单行业暴露。');
  lines.push('');
  lines.push('| 行业 | Top1 天数 |');
  lines.push('|---|---:|');
  top1Frequency.forEach(row => lines.push(`| ${row.industry} | ${row.days} |`));
  lines.push('');
  lines.push('## 行业贡献：Top5 / 5日');
  lines.push('');
  lines.push('表现较好的行业代理：');
  lines.push('');
  lines.push('| 行业 | 样本 | 平均收益 | 平均超额 | 跑赢率 |');
  lines.push('|---|---:|---:|---:|---:|');
  bestIndustries.forEach(row => lines.push(`| ${row.industry} | ${row.samples} | ${formatPct(row.avg_return_pct, 4)} | ${formatPct(row.avg_excess_return_pct, 4)} | ${formatPct(row.hit_rate * 100, 2)} |`));
  lines.push('');
  lines.push('表现较弱的行业代理：');
  lines.push('');
  lines.push('| 行业 | 样本 | 平均收益 | 平均超额 | 跑赢率 |');
  lines.push('|---|---:|---:|---:|---:|');
  weakIndustries.forEach(row => lines.push(`| ${row.industry} | ${row.samples} | ${formatPct(row.avg_return_pct, 4)} | ${formatPct(row.avg_excess_return_pct, 4)} | ${formatPct(row.hit_rate * 100, 2)} |`));
  lines.push('');
  lines.push('## 对产品和算法的建议');
  lines.push('');
  lines.push('1. 日报前端不要强调“第一行业必买”，应改成“Top5 行业候选池 + 风险过滤”。');
  lines.push('2. 组合建议默认分散到 3-5 个行业；单行业信号只作为关注度排序，不作为仓位排序。');
  lines.push('3. 权重校准方向：提高能改善 Top5 中位超额和年度稳定性的因子权重，降低只拉高均值但扩大回撤的因子。');
  lines.push('4. 下一轮回测应加入真实日报时间点：09:25/11:30/13:00/15:10，并用当时可见的盘中资金/宽度数据，避免把收盘信息误用于早盘。');
  lines.push('5. 每次日报落库后，把实际推荐、风险场景、后续 1/3/5/10 日结果写入 `decision_logs`，形成滚动校准闭环。');

  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({
    run_id: run.id,
    report: reportPath,
    basket_metrics: basketCsv,
    portfolio_scenarios: portfolioCsv,
    headline: {
      top5_h5_avg_excess_pct: top5H5 && top5H5.avg_excess_return_pct,
      top5_h5_median_excess_pct: top5H5 && top5H5.median_excess_return_pct,
      top5_h5_hit_rate: top5H5 && top5H5.hit_rate_vs_benchmark,
      daily_top5_cost_total_pct: dailyTop5Cost && dailyTop5Cost.total_return_pct,
      nonoverlap_top5_h5_cost_total_pct: nonOverlapTop5H5Cost && nonOverlapTop5H5Cost.total_return_pct
    }
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

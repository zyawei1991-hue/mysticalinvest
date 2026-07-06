#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../backend/envLoader');
loadEnv();

const { getDb } = require('../backend/database');
const { getDailyBars } = require('../backend/historicalDataProvider');

const STRATEGY_NAME = 'institutional-accumulation-mvp';
const AMOUNT_MIN = 200000; // Tushare daily.amount unit: thousand CNY, 200000 = RMB 200m.

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

function parseList(value, fallback) {
  if (!value) return fallback;
  return String(value).split(',').map(item => Number(item.trim())).filter(Number.isFinite);
}

function dashDate(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.includes('-')) return s.slice(0, 10);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function addDays(dateStr, days) {
  const date = new Date(`${dashDate(dateStr)}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
}

function avg(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function stdev(values) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return null;
  const mean = avg(xs);
  const variance = xs.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(equityCurve) {
  let peak = 1;
  let maxDd = 0;
  equityCurve.forEach(point => {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDd = Math.min(maxDd, point.equity / peak - 1);
  });
  return maxDd * 100;
}

function calcReturn(open, close) {
  const entry = Number(open);
  const exit = Number(close);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  return (exit / entry - 1) * 100;
}

function moneyParts(row) {
  const elg = asNumber(row.buy_elg_amount) - asNumber(row.sell_elg_amount);
  const lg = asNumber(row.buy_lg_amount) - asNumber(row.sell_lg_amount);
  const md = asNumber(row.buy_md_amount) - asNumber(row.sell_md_amount);
  return { elg, lg, md, total: elg + lg + md };
}

function computeFiveDayScore(values) {
  if (!Array.isArray(values) || values.length < 5) return null;
  const posDays = values.filter(value => value > 0).length;
  const mean = avg(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  let volatility = Math.sqrt(variance);
  if (!Number.isFinite(volatility) || volatility <= 1e-6) volatility = 10;
  const baseScore = values.reduce((sum, value) => sum + value, 0) / volatility;
  const minValue = Math.min(...values);
  const minIndex = values.indexOf(minValue);
  let shakeRecover = false;
  if (minIndex >= 0 && minIndex < values.length - 1) {
    const nextInflow = values[minIndex + 1];
    shakeRecover = nextInflow > Math.abs(minValue) * 1.5;
  }
  let coefficient = 0.3;
  if (posDays >= 4) coefficient = 1.2;
  else if (posDays === 3 && shakeRecover) coefficient = 1.5;
  return {
    values,
    pos_days: posDays,
    volatility,
    base_score: baseScore,
    coefficient,
    shake_recover: shakeRecover,
    final_score: baseScore * coefficient
  };
}

function isBadName(name) {
  const s = String(name || '');
  return s.includes('ST') || s.includes('*ST') || s.includes('退');
}

function lowerBound(dates, target) {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (dates[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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

function loadConceptMembers(db) {
  const map = new Map();
  const rows = db.prepare('SELECT stock_code, index_code FROM ia_ths_member').all();
  rows.forEach(row => {
    if (!map.has(row.stock_code)) map.set(row.stock_code, []);
    map.get(row.stock_code).push(row.index_code);
  });
  return map;
}

function loadStockBasic(db) {
  const rows = db.prepare('SELECT ts_code, name, list_date, industry, market FROM ia_stock_basic').all();
  return new Map(rows.map(row => [row.ts_code, row]));
}

function loadTradeDates(db, startDate, endDate) {
  return db.prepare(`SELECT cal_date
    FROM ia_trade_cal
    WHERE is_open = 1 AND cal_date >= ? AND cal_date <= ?
    ORDER BY cal_date ASC`).all(startDate, endDate).map(row => row.cal_date);
}

function getDateWindow(tradeDates, dateIndex, lookback) {
  const start = Math.max(0, dateIndex - lookback + 1);
  return tradeDates.slice(start, dateIndex + 1);
}

function loadConceptDailyMap(db, date) {
  const rows = db.prepare('SELECT index_code, pct_change FROM ia_ths_daily WHERE trade_date = ?').all(date);
  return new Map(rows.map(row => [row.index_code, asNumber(row.pct_change, NaN)]));
}

function loadFiveDayMoneyMap(db, dates) {
  const placeholders = dates.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM ia_moneyflow WHERE trade_date IN (${placeholders})`).all(...dates);
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.ts_code)) map.set(row.ts_code, new Map());
    map.get(row.ts_code).set(row.trade_date, moneyParts(row).total);
  });
  return map;
}

function loadBlockDiscountMap(db, dates) {
  const placeholders = dates.map(() => '?').join(',');
  const rows = db.prepare(`SELECT b.ts_code, MAX((d.close - b.price) / d.close) AS max_discount
    FROM ia_block_trade b
    JOIN ia_daily_bars d ON d.ts_code = b.ts_code AND d.trade_date = b.trade_date
    WHERE b.trade_date IN (${placeholders})
      AND b.price IS NOT NULL
      AND d.close IS NOT NULL
      AND d.close > 0
    GROUP BY b.ts_code`).all(...dates);
  return new Map(rows.map(row => [row.ts_code, asNumber(row.max_discount, 0)]));
}

function loadDailyCandidates(db, date) {
  return db.prepare(`SELECT
      d.ts_code, d.trade_date, d.open, d.high, d.low, d.close, d.pre_close, d.pct_chg, d.vol, d.amount,
      m.buy_md_amount, m.sell_md_amount, m.buy_lg_amount, m.sell_lg_amount,
      m.buy_elg_amount, m.sell_elg_amount, m.net_mf_amount,
      s.name, s.list_date, s.industry, s.market
    FROM ia_daily_bars d
    JOIN ia_moneyflow m ON m.ts_code = d.ts_code AND m.trade_date = d.trade_date
    LEFT JOIN ia_stock_basic s ON s.ts_code = d.ts_code
    WHERE d.trade_date = ?`).all(date);
}

function insertRun(db, params) {
  const info = db.prepare(`INSERT INTO ia_backtest_runs (name, provider, start_date, end_date, params_json)
    VALUES (?, ?, ?, ?, ?)`).run(
    STRATEGY_NAME,
    params.provider,
    params.startDate,
    params.endDate,
    JSON.stringify(params)
  );
  return Number(info.lastInsertRowid);
}

function persistSignals(db, runId, signalRows) {
  const stmt = db.prepare(`INSERT INTO ia_backtest_signals (
    run_id, signal_date, rank, ts_code, name, final_score, stock_pct_chg, board_min_chg,
    relative_chg, total_net_inflow, sup_big_ratio, big_total_ratio, mid_ratio,
    pos_days, shake_recover, is_new_stock, stock_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(rows => {
    rows.forEach(row => stmt.run(
      runId,
      row.signal_date,
      row.rank,
      row.ts_code,
      row.name,
      row.final_score,
      row.stock_pct_chg,
      row.board_min_chg,
      row.relative_chg,
      row.total_net_inflow,
      row.sup_big_ratio,
      row.big_total_ratio,
      row.mid_ratio,
      row.pos_days,
      row.shake_recover ? 1 : 0,
      row.is_new_stock ? 1 : 0,
      JSON.stringify(row)
    ));
  });
  for (let i = 0; i < signalRows.length; i += 1000) tx(signalRows.slice(i, i + 1000));
}

function persistReturns(db, runId, returnRows) {
  const stmt = db.prepare(`INSERT INTO ia_backtest_returns (
    run_id, signal_date, rank, ts_code, name, entry_date, exit_date, entry_price, exit_price,
    return_pct, benchmark_return_pct, excess_return_pct
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(rows => {
    rows.forEach(row => stmt.run(
      runId,
      row.signal_date,
      row.rank,
      row.ts_code,
      row.name,
      row.entry_date,
      row.exit_date,
      row.entry_price,
      row.exit_price,
      row.return_pct,
      row.benchmark_return_pct,
      row.excess_return_pct
    ));
  });
  for (let i = 0; i < returnRows.length; i += 1000) tx(returnRows.slice(i, i + 1000));
}

function summarizePortfolios(dailyRows, topNs, costPct) {
  const roundTripCostPct = Number(costPct || 0);
  const byTop = {};
  topNs.forEach(topN => {
    let equity = 1;
    const curve = [];
    const rows = dailyRows.map(row => {
      const picks = row.returns.filter(item => item.rank <= topN);
      const grossReturn = picks.length ? avg(picks.map(item => item.return_pct)) : 0;
      const strategyReturn = picks.length ? grossReturn - roundTripCostPct : 0;
      const benchmarkReturn = picks.length ? row.benchmark_return_pct : 0;
      const excessReturn = strategyReturn - benchmarkReturn;
      equity *= 1 + strategyReturn / 100;
      const point = {
        date: row.signal_date,
        active: picks.length > 0,
        pick_count: picks.length,
        return_pct: strategyReturn,
        benchmark_return_pct: benchmarkReturn,
        excess_return_pct: excessReturn,
        equity
      };
      curve.push(point);
      return point;
    });
    const active = rows.filter(row => row.active);
    const excess = active.map(row => row.excess_return_pct);
    const returns = active.map(row => row.return_pct);
    const sd = stdev(excess);
    const meanExcess = avg(excess);
    const compoundedReturn = (equity - 1) * 100;
    byTop[`top${topN}`] = {
      signal_days: rows.length,
      active_days: active.length,
      coverage_rate: rows.length ? active.length / rows.length : null,
      avg_pick_count: avg(active.map(row => row.pick_count)),
      avg_return_pct: avg(returns),
      median_return_pct: median(returns),
      avg_benchmark_return_pct: avg(active.map(row => row.benchmark_return_pct)),
      avg_excess_return_pct: meanExcess,
      median_excess_return_pct: median(excess),
      win_rate: active.length ? active.filter(row => row.return_pct > 0).length / active.length : null,
      hit_rate_vs_benchmark: active.length ? active.filter(row => row.excess_return_pct > 0).length / active.length : null,
      excess_stdev: sd,
      excess_t_stat: sd && sd > 0 && active.length > 1 ? meanExcess / sd * Math.sqrt(active.length) : null,
      compounded_return_pct: compoundedReturn,
      max_drawdown_pct: maxDrawdown(curve),
      return_drawdown_ratio: Math.abs(maxDrawdown(curve)) > 1e-9 ? compoundedReturn / Math.abs(maxDrawdown(curve)) : null
    };
  });
  return byTop;
}

function topNameStats(returnRows, limit) {
  const map = new Map();
  returnRows.forEach(row => {
    const key = `${row.ts_code}|${row.name}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.excess_return_pct);
  });
  return Array.from(map.entries()).map(([key, values]) => {
    const [tsCode, name] = key.split('|');
    return {
      ts_code: tsCode,
      name,
      samples: values.length,
      avg_excess_return_pct: avg(values),
      hit_rate_vs_benchmark: values.filter(value => value > 0).length / values.length
    };
  }).filter(row => row.samples >= 5)
    .sort((a, b) => b.avg_excess_return_pct - a.avg_excess_return_pct)
    .slice(0, limit || 20);
}

function buildReport(result) {
  const lines = [];
  lines.push(`# 机构吸筹策略 MVP 回测报告`);
  lines.push('');
  lines.push(`- 回测区间：${result.params.startDate} 至 ${result.params.endDate}`);
  lines.push(`- 数据源：Tushare 本地缓存`);
  lines.push(`- 策略口径：收盘后生成信号，下一交易日开盘买入，下一交易日收盘卖出`);
  lines.push(`- 基准：沪深300同日开盘到收盘收益`);
  lines.push(`- 候选排序：相对概念抗跌 + 主力资金双轨 + 5日吸筹/洗盘系数 + 大宗折价风控 + 次新降权`);
  lines.push(`- 全市场信号日：${result.metrics.signal_days}，有候选天数：${result.metrics.active_days}，平均候选数：${round(result.metrics.avg_candidates, 2)}`);
  lines.push('');
  lines.push(`## 组合结果（未扣交易成本）`);
  lines.push('');
  lines.push(`| 组合 | 覆盖率 | 日均收益 | 日均超额 | 中位超额 | 跑赢率 | t值 | 累计收益 | 最大回撤 | 收益回撤比 |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  Object.entries(result.metrics.portfolios).forEach(([key, row]) => {
    lines.push(`| ${key} | ${round(row.coverage_rate * 100, 2)}% | ${round(row.avg_return_pct, 4)}% | ${round(row.avg_excess_return_pct, 4)}% | ${round(row.median_excess_return_pct, 4)}% | ${round(row.hit_rate_vs_benchmark * 100, 2)}% | ${round(row.excess_t_stat, 2)} | ${round(row.compounded_return_pct, 2)}% | ${round(row.max_drawdown_pct, 2)}% | ${round(row.return_drawdown_ratio, 2)} |`);
  });
  lines.push('');
  lines.push(`## 成本压力测试（往返 ${round(result.metrics.round_trip_cost_pct, 2)}%）`);
  lines.push('');
  lines.push(`| 组合 | 覆盖率 | 成本后日均收益 | 成本后日均超额 | 成本后中位超额 | 成本后跑赢率 | t值 | 成本后累计收益 | 最大回撤 | 收益回撤比 |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  Object.entries(result.metrics.portfolios_after_cost).forEach(([key, row]) => {
    lines.push(`| ${key} | ${round(row.coverage_rate * 100, 2)}% | ${round(row.avg_return_pct, 4)}% | ${round(row.avg_excess_return_pct, 4)}% | ${round(row.median_excess_return_pct, 4)}% | ${round(row.hit_rate_vs_benchmark * 100, 2)}% | ${round(row.excess_t_stat, 2)} | ${round(row.compounded_return_pct, 2)}% | ${round(row.max_drawdown_pct, 2)}% | ${round(row.return_drawdown_ratio, 2)} |`);
  });
  lines.push('');
  lines.push(`## 过滤漏斗`);
  lines.push('');
  Object.entries(result.metrics.drop_reasons).forEach(([reason, count]) => {
    lines.push(`- ${reason}: ${count}`);
  });
  lines.push('');
  lines.push(`## Top候选贡献`);
  lines.push('');
  lines.push(`| 股票 | 样本 | 平均超额 | 跑赢率 |`);
  lines.push(`|---|---:|---:|---:|`);
  result.metrics.top_names.slice(0, 20).forEach(row => {
    lines.push(`| ${row.name} (${row.ts_code}) | ${row.samples} | ${round(row.avg_excess_return_pct, 4)}% | ${round(row.hit_rate_vs_benchmark * 100, 2)}% |`);
  });
  lines.push('');
  lines.push(`## 结论口径`);
  lines.push('');
  lines.push(`这版回测主要验证“机构吸筹 MVP”能否在次日短线场景提供可交易候选。判断重点不是单笔胜率，而是：覆盖率是否足够、Top组合是否有稳定超额、中位超额是否为正、t值是否接近或超过显著区间、回撤是否可承受。`);
  lines.push('');
  lines.push(`## 限制`);
  lines.push('');
  lines.push(`- 同花顺概念采用 Tushare THS 概念成分和日线，缺失概念映射的股票严格剔除，不做行业兜底。`);
  lines.push(`- 大宗折价由“大宗成交价 vs 当日收盘价”近似计算，Tushare 原始接口不直接给折价率。`);
  lines.push(`- 成本压力测试仅扣固定往返成本，尚未模拟涨跌停无法成交、冲击成本和真实滑点。`);
  return lines.join('\n');
}

async function runBacktest(options) {
  const db = getDb();
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  const params = {
    provider: 'tushare',
    startDate: dashDate(options.startDate),
    endDate: dashDate(options.endDate),
    topNs: options.topNs,
    maxRank: Math.max(...options.topNs),
    amountMin: AMOUNT_MIN,
    benchmark: '000300.SH',
    roundTripCostPct: Number(options.costPct || 0.2),
    outputDir: options.outputDir
  };
  fs.mkdirSync(params.outputDir, { recursive: true });

  const tradeDates = loadTradeDates(db, addDays(params.startDate, -30), addDays(params.endDate, 5));
  const evalDates = tradeDates.filter(date => date >= params.startDate && date <= params.endDate);
  if (evalDates.length < 5) throw new Error('Not enough cached trade dates for backtest');

  const stockBasicMap = loadStockBasic(db);
  const conceptMemberMap = loadConceptMembers(db);
  const benchmarkBars = await getDailyBars({
    provider: 'tushare',
    symbol: '000300.SH',
    startDate: addDays(params.startDate, -10),
    endDate: addDays(params.endDate, 10),
    instrumentType: 'index',
    refresh: false
  });
  const benchmarkByDate = new Map(benchmarkBars.map(row => [row.trade_date, row]));

  const runId = insertRun(db, params);
  const signalRows = [];
  const returnRows = [];
  const dailyPortfolioRows = [];
  const dropReasons = {};
  let totalCandidates = 0;

  function drop(reason) {
    dropReasons[reason] = (dropReasons[reason] || 0) + 1;
  }

  for (const signalDate of evalDates) {
    const dateIndex = tradeDates.indexOf(signalDate);
    if (dateIndex < 4 || dateIndex >= tradeDates.length - 1) continue;
    const nextDate = tradeDates[dateIndex + 1];
    if (nextDate > addDays(params.endDate, 5)) continue;
    const benchmarkBar = benchmarkByDate.get(nextDate);
    const benchmarkReturn = benchmarkBar ? calcReturn(benchmarkBar.open || benchmarkBar.close, benchmarkBar.close) : null;
    if (benchmarkReturn === null) {
      drop('missing_benchmark');
      continue;
    }

    const fiveDates = getDateWindow(tradeDates, dateIndex, 5);
    const conceptDailyMap = loadConceptDailyMap(db, signalDate);
    const fiveDayMoneyMap = loadFiveDayMoneyMap(db, fiveDates);
    const blockDiscountMap = loadBlockDiscountMap(db, fiveDates);
    const rows = loadDailyCandidates(db, signalDate);
    const candidates = [];

    rows.forEach(row => {
      const basic = stockBasicMap.get(row.ts_code) || row;
      const name = row.name || (basic && basic.name) || '';
      if (isBadName(name)) return drop('bad_name');
      if (!Number.isFinite(Number(row.open)) || !Number.isFinite(Number(row.close))) return drop('missing_price');
      if (asNumber(row.amount) < AMOUNT_MIN) return drop('amount_lt_200m');
      const pctChg = asNumber(row.pct_chg, NaN);
      if (!Number.isFinite(pctChg)) return drop('missing_pct_chg');
      if (pctChg >= 9.8) return drop('limit_up_or_high_chase');

      const parts = moneyParts(row);
      if (parts.total <= 0) return drop('total_net_inflow_lte_0');
      const supBigRatio = parts.elg / parts.total;
      const bigTotalRatio = (parts.elg + parts.lg) / parts.total;
      const midRatio = parts.md / parts.total;
      const validMoney = supBigRatio >= 0.2 || (supBigRatio < 0.2 && bigTotalRatio >= 0.4 && midRatio < 0.3);
      if (!validMoney) return drop('money_track_fail');

      const concepts = conceptMemberMap.get(row.ts_code) || [];
      if (!concepts.length) return drop('missing_concept_member');
      const conceptChanges = concepts.map(code => conceptDailyMap.get(code)).filter(Number.isFinite);
      if (!conceptChanges.length) return drop('missing_concept_daily');
      const boardMinChg = Math.min(...conceptChanges);
      const relativeChg = pctChg - boardMinChg;
      if (relativeChg < -1 || relativeChg > 2) return drop('relative_chg_out_of_range');

      const stockFiveMoney = fiveDayMoneyMap.get(row.ts_code);
      if (!stockFiveMoney) return drop('missing_5d_flow');
      const fiveDayValues = fiveDates.map(date => stockFiveMoney.get(date)).filter(Number.isFinite);
      if (fiveDayValues.length < 5) return drop('missing_5d_flow');
      const fiveDayScore = computeFiveDayScore(fiveDayValues);
      if (!fiveDayScore || !Number.isFinite(fiveDayScore.final_score)) return drop('bad_5d_score');

      const discount = blockDiscountMap.get(row.ts_code);
      if (Number.isFinite(discount) && discount > 0.08) return drop('block_discount_gt_8pct');

      const listDate = dashDate(row.list_date || (basic && basic.list_date));
      const listIndex = listDate ? lowerBound(tradeDates, listDate) : 0;
      const tradeDaysSinceList = Math.max(0, dateIndex - listIndex + 1);
      const isNewStock = tradeDaysSinceList > 0 && tradeDaysSinceList < 60;
      const finalScore = fiveDayScore.final_score * (isNewStock ? 0.5 : 1);

      candidates.push({
        signal_date: signalDate,
        ts_code: row.ts_code,
        name,
        final_score: finalScore,
        stock_pct_chg: pctChg,
        board_min_chg: boardMinChg,
        relative_chg: relativeChg,
        total_net_inflow: parts.total,
        sup_big_ratio: supBigRatio,
        big_total_ratio: bigTotalRatio,
        mid_ratio: midRatio,
        pos_days: fiveDayScore.pos_days,
        shake_recover: fiveDayScore.shake_recover,
        is_new_stock: isNewStock,
        trade_days_since_list: tradeDaysSinceList,
        coefficient: fiveDayScore.coefficient,
        base_score: fiveDayScore.base_score,
        five_day_net_inflow: fiveDayValues,
        concepts_count: concepts.length,
        max_block_discount: discount || 0
      });
    });

    candidates.sort((a, b) => b.final_score - a.final_score);
    totalCandidates += candidates.length;
    const ranked = candidates.slice(0, params.maxRank).map((row, index) => ({ ...row, rank: index + 1 }));
    signalRows.push(...ranked);

    const dailyReturns = [];
    ranked.forEach(row => {
      const bar = db.prepare('SELECT open, close FROM ia_daily_bars WHERE ts_code = ? AND trade_date = ?').get(row.ts_code, nextDate);
      if (!bar) {
        drop('missing_next_day_bar');
        return;
      }
      const ret = calcReturn(bar.open || bar.close, bar.close);
      if (ret === null) {
        drop('bad_next_day_price');
        return;
      }
      const record = {
        ...row,
        entry_date: nextDate,
        exit_date: nextDate,
        entry_price: Number(bar.open || bar.close),
        exit_price: Number(bar.close),
        return_pct: ret,
        benchmark_return_pct: benchmarkReturn,
        excess_return_pct: ret - benchmarkReturn
      };
      dailyReturns.push(record);
      returnRows.push(record);
    });
    dailyPortfolioRows.push({
      signal_date: signalDate,
      next_date: nextDate,
      candidates: candidates.length,
      returns: dailyReturns,
      benchmark_return_pct: benchmarkReturn
    });

    if (evalDates.indexOf(signalDate) % 50 === 0) {
      console.log(`processed ${signalDate}: candidates=${candidates.length}`);
    }
  }

  persistSignals(db, runId, signalRows);
  persistReturns(db, runId, returnRows);

  const metrics = {
    run_id: runId,
    signal_days: dailyPortfolioRows.length,
    active_days: dailyPortfolioRows.filter(row => row.returns.length).length,
    avg_candidates: dailyPortfolioRows.length ? totalCandidates / dailyPortfolioRows.length : null,
    stored_signals: signalRows.length,
    stored_returns: returnRows.length,
    drop_reasons: dropReasons,
    round_trip_cost_pct: params.roundTripCostPct,
    portfolios: summarizePortfolios(dailyPortfolioRows, params.topNs, 0),
    portfolios_after_cost: summarizePortfolios(dailyPortfolioRows, params.topNs, params.roundTripCostPct),
    top_names: topNameStats(returnRows, 20)
  };

  db.prepare('UPDATE ia_backtest_runs SET metrics_json = ? WHERE id = ?').run(JSON.stringify(metrics), runId);

  const baseName = `institutional-mvp-${params.startDate}_${params.endDate}_run${runId}`;
  const jsonPath = path.join(params.outputDir, `${baseName}.json`);
  const tradesPath = path.join(params.outputDir, `${baseName}-trades.csv`);
  const metricsPath = path.join(params.outputDir, `${baseName}-metrics.csv`);
  const reportPath = path.join(params.outputDir, `${baseName}-report.md`);

  const result = { params, metrics };
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  writeCsv(tradesPath, returnRows.map(row => ({
    signal_date: row.signal_date,
    rank: row.rank,
    ts_code: row.ts_code,
    name: row.name,
    final_score: round(row.final_score, 4),
    stock_pct_chg: round(row.stock_pct_chg, 4),
    board_min_chg: round(row.board_min_chg, 4),
    relative_chg: round(row.relative_chg, 4),
    total_net_inflow: round(row.total_net_inflow, 4),
    sup_big_ratio: round(row.sup_big_ratio, 4),
    big_total_ratio: round(row.big_total_ratio, 4),
    mid_ratio: round(row.mid_ratio, 4),
    pos_days: row.pos_days,
    shake_recover: row.shake_recover ? 1 : 0,
    is_new_stock: row.is_new_stock ? 1 : 0,
    entry_date: row.entry_date,
    return_pct: round(row.return_pct, 4),
    benchmark_return_pct: round(row.benchmark_return_pct, 4),
    excess_return_pct: round(row.excess_return_pct, 4)
  })));
  const metricRows = []
    .concat(Object.entries(metrics.portfolios).map(([portfolio, row]) => ({ scope: 'gross', portfolio, row })))
    .concat(Object.entries(metrics.portfolios_after_cost).map(([portfolio, row]) => ({ scope: `net_${params.roundTripCostPct}pct`, portfolio, row })));
  writeCsv(metricsPath, metricRows.map(item => ({
    scope: item.scope,
    portfolio: item.portfolio,
    signal_days: item.row.signal_days,
    active_days: item.row.active_days,
    coverage_rate: round(item.row.coverage_rate, 6),
    avg_pick_count: round(item.row.avg_pick_count, 4),
    avg_return_pct: round(item.row.avg_return_pct, 6),
    median_return_pct: round(item.row.median_return_pct, 6),
    avg_benchmark_return_pct: round(item.row.avg_benchmark_return_pct, 6),
    avg_excess_return_pct: round(item.row.avg_excess_return_pct, 6),
    median_excess_return_pct: round(item.row.median_excess_return_pct, 6),
    win_rate: round(item.row.win_rate, 6),
    hit_rate_vs_benchmark: round(item.row.hit_rate_vs_benchmark, 6),
    excess_stdev: round(item.row.excess_stdev, 6),
    excess_t_stat: round(item.row.excess_t_stat, 6),
    compounded_return_pct: round(item.row.compounded_return_pct, 6),
    max_drawdown_pct: round(item.row.max_drawdown_pct, 6),
    return_drawdown_ratio: round(item.row.return_drawdown_ratio, 6)
  })));
  fs.writeFileSync(reportPath, buildReport(result), 'utf8');

  return {
    runId,
    jsonPath,
    tradesPath,
    metricsPath,
    reportPath,
    metrics
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const startDate = args.start || args.startDate || '2024-01-08';
  const endDate = args.end || args.endDate || '2026-07-02';
  const topNs = parseList(args.top, [1, 3, 5]);
  const costPct = args.cost !== undefined ? Number(args.cost) : 0.2;
  const outputDir = args.output || path.join(__dirname, '../outputs/backtests');
  const result = await runBacktest({ startDate, endDate, topNs, outputDir, costPct });
  console.log(JSON.stringify({
    runId: result.runId,
    reportPath: result.reportPath,
    metricsPath: result.metricsPath,
    tradesPath: result.tradesPath,
    summary: result.metrics.portfolios
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});

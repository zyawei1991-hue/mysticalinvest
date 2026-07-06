#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../backend/envLoader');

loadEnv();

const { getDailyBars, getProviderStatus } = require('../backend/historicalDataProvider');
const { INDUSTRY_PROXY_MAP, BENCHMARKS } = require('../backend/industryProxyMap');

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

function uniqueTargets(includeBenchmarks) {
  const bySymbol = new Map();
  Object.entries(INDUSTRY_PROXY_MAP).forEach(([industry, proxy]) => {
    const current = bySymbol.get(proxy.symbol) || {
      symbol: proxy.symbol,
      name: proxy.name,
      type: proxy.type,
      eastmoneySecid: proxy.eastmoneySecid,
      industries: []
    };
    current.industries.push(industry);
    bySymbol.set(proxy.symbol, current);
  });
  if (includeBenchmarks) {
    Object.entries(BENCHMARKS).forEach(([key, proxy]) => {
      bySymbol.set(proxy.symbol, {
        symbol: proxy.symbol,
        name: proxy.name,
        type: proxy.type,
        eastmoneySecid: proxy.eastmoneySecid,
        benchmark: key,
        industries: []
      });
    });
  }
  return Array.from(bySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function main() {
  const args = parseArgs(process.argv);
  const startDate = args.start || args.startDate;
  const endDate = args.end || args.endDate;
  if (!startDate || !endDate) {
    console.error('Usage: node bin/cache-history.js --start 2024-01-01 --end 2026-07-05 [--provider tushare] [--refresh] [--allow-fallback]');
    process.exit(2);
  }

  const provider = args.provider || process.env.HISTORY_PROVIDER || 'tushare';
  const outputDir = args.output || path.join(__dirname, '../outputs/backtests');
  fs.mkdirSync(outputDir, { recursive: true });

  const targets = uniqueTargets(args.benchmarks !== false);
  const results = [];
  for (const target of targets) {
    const startedAt = Date.now();
    try {
      const rows = await getDailyBars({
        provider,
        symbol: target.symbol,
        startDate,
        endDate,
        refresh: Boolean(args.refresh),
        instrumentType: target.type,
        eastmoneySecid: target.eastmoneySecid,
        allowFallback: Boolean(args['allow-fallback'])
      });
      results.push({
        status: 'ok',
        symbol: target.symbol,
        name: target.name,
        type: target.type,
        rows: rows.length,
        first_date: rows[0] && rows[0].trade_date,
        last_date: rows[rows.length - 1] && rows[rows.length - 1].trade_date,
        industries: target.industries,
        benchmark: target.benchmark || null,
        elapsed_ms: Date.now() - startedAt
      });
    } catch (error) {
      results.push({
        status: 'error',
        symbol: target.symbol,
        name: target.name,
        type: target.type,
        industries: target.industries,
        benchmark: target.benchmark || null,
        error: error.message,
        elapsed_ms: Date.now() - startedAt
      });
    }
    const latest = results[results.length - 1];
    console.log(`${latest.status.toUpperCase()} ${latest.symbol} ${latest.name}: ${latest.rows || 0} rows${latest.error ? ` (${latest.error})` : ''}`);
  }

  const summary = {
    provider,
    startDate,
    endDate,
    provider_status: getProviderStatus(),
    targets: targets.length,
    ok: results.filter(row => row.status === 'ok').length,
    errors: results.filter(row => row.status === 'error').length,
    results
  };
  const filePath = path.join(outputDir, `cache-history-${provider}-${startDate}_${endDate}.json`);
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({
    provider,
    startDate,
    endDate,
    targets: summary.targets,
    ok: summary.ok,
    errors: summary.errors,
    output: filePath
  }, null, 2));

  if (summary.errors) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});

#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const path = require('path');
const { loadEnv } = require('../backend/envLoader');

loadEnv();

const { runIndustryBacktest } = require('../backend/backtestEngine');
const { getProviderStatus } = require('../backend/historicalDataProvider');

function parseList(value, fallback) {
  if (!value) return fallback;
  return String(value).split(',').map(item => Number(item.trim())).filter(Number.isFinite);
}

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

async function main() {
  const args = parseArgs(process.argv);
  if (args.status) {
    console.log(JSON.stringify(getProviderStatus(), null, 2));
    return;
  }
  const startDate = args.start || args.startDate;
  const endDate = args.end || args.endDate;
  if (!startDate || !endDate) {
    console.error('Usage: node bin/backtest-v21.js --start 2026-01-01 --end 2026-07-05 [--provider tushare|eastmoney] [--top 1,3,5] [--horizon 1,3,5,10] [--refresh]');
    process.exit(2);
  }
  const result = await runIndustryBacktest({
    startDate,
    endDate,
    provider: args.provider,
    benchmark: args.benchmark || 'hs300',
    topNs: parseList(args.top, [1, 3, 5]),
    horizons: parseList(args.horizon, [1, 3, 5, 10]),
    refresh: Boolean(args.refresh),
    outputDir: args.output || path.join(__dirname, '../outputs/backtests')
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});

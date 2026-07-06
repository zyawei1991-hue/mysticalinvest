#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const { loadEnv } = require('../backend/envLoader');
loadEnv();

const { getDb } = require('../backend/database');
const { ymd, dashDate, fetchPaged, fetchPagedBatches } = require('../backend/tushareClient');

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

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function monthRanges(start, end) {
  const result = [];
  let cursor = new Date(`${start}T00:00:00+08:00`);
  const endDate = new Date(`${end}T00:00:00+08:00`);
  const startDate = new Date(`${start}T00:00:00+08:00`);
  const fmt = date => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  while (cursor <= endDate) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const from = monthStart < startDate ? start : fmt(monthStart);
    const toDate = monthEnd > endDate ? endDate : monthEnd;
    result.push([from, fmt(toDate)]);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return result;
}

function runTransaction(db, sql, rows, mapper) {
  if (!rows.length) return;
  const stmt = db.prepare(sql);
  const insertMany = db.transaction(items => {
    items.forEach(row => stmt.run(...mapper(row)));
  });
  const chunkSize = 5000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    insertMany(rows.slice(i, i + chunkSize));
  }
}

async function cachePagedRows(label, apiName, params, fields, sql, mapper, options) {
  const db = getDb();
  let total = 0;
  await fetchPagedBatches(apiName, params, fields, {
    pageSize: 20000,
    ...(options || {}),
    onPage: page => console.log(`${label} page offset=${page.offset} rows=${page.rows} total=${page.total}`)
  }, async batch => {
    runTransaction(db, sql, batch, mapper);
    total += batch.length;
  });
  console.log(`${label} cached: ${total}`);
  return total;
}

async function cacheStockBasic(db) {
  const rows = await fetchPaged('stock_basic', { list_status: 'L' }, 'ts_code,symbol,name,area,industry,market,list_date');
  runTransaction(db, `INSERT INTO ia_stock_basic (ts_code, symbol, name, area, industry, market, list_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ts_code) DO UPDATE SET
      symbol=excluded.symbol, name=excluded.name, area=excluded.area, industry=excluded.industry,
      market=excluded.market, list_date=excluded.list_date, updated_at=datetime('now')`, rows, row => [
    row.ts_code, row.symbol, row.name, row.area, row.industry, row.market, dashDate(row.list_date)
  ]);
  console.log(`stock_basic cached: ${rows.length}`);
  return rows.length;
}

async function cacheTradeCal(db, start, end) {
  const rows = await fetchPaged('trade_cal', {
    exchange: 'SSE',
    start_date: ymd(start),
    end_date: ymd(end)
  }, 'cal_date,is_open,pretrade_date');
  runTransaction(db, `INSERT INTO ia_trade_cal (cal_date, is_open, pretrade_date)
    VALUES (?, ?, ?)
    ON CONFLICT(cal_date) DO UPDATE SET is_open=excluded.is_open, pretrade_date=excluded.pretrade_date`, rows, row => [
    dashDate(row.cal_date), Number(row.is_open || 0), row.pretrade_date ? dashDate(row.pretrade_date) : null
  ]);
  console.log(`trade_cal cached: ${rows.length}`);
  return rows.length;
}

async function cacheDaily(db, start, end) {
  let total = 0;
  for (const [from, to] of monthRanges(start, end)) {
    total += await cachePagedRows(`daily ${from}..${to}`, 'daily', {
      start_date: ymd(from),
      end_date: ymd(to)
    }, 'ts_code,trade_date,open,high,low,close,pre_close,pct_chg,vol,amount', `INSERT INTO ia_daily_bars (
      ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ts_code, trade_date) DO UPDATE SET
      open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
      pre_close=excluded.pre_close, pct_chg=excluded.pct_chg, vol=excluded.vol,
      amount=excluded.amount, updated_at=datetime('now')`, row => [
      row.ts_code, dashDate(row.trade_date), numberOrNull(row.open), numberOrNull(row.high), numberOrNull(row.low),
      numberOrNull(row.close), numberOrNull(row.pre_close), numberOrNull(row.pct_chg), numberOrNull(row.vol), numberOrNull(row.amount)
    ]);
  }
  console.log(`daily cached total: ${total}`);
  return total;
}

async function cacheDailyBasic(db, start, end) {
  const rows = await fetchPaged('daily_basic', {
    start_date: ymd(start),
    end_date: ymd(end)
  }, 'ts_code,trade_date,turnover_rate,volume_ratio,pe,pb,total_mv,circ_mv', {
    onPage: page => console.log(`daily_basic page offset=${page.offset} rows=${page.rows} total=${page.total}`)
  });
  const stmt = db.prepare(`UPDATE ia_daily_bars SET
    turnover_rate = ?, volume_ratio = ?, pe = ?, pb = ?, total_mv = ?, circ_mv = ?, updated_at = datetime('now')
    WHERE ts_code = ? AND trade_date = ?`);
  const insertShell = db.prepare(`INSERT OR IGNORE INTO ia_daily_bars (ts_code, trade_date, updated_at) VALUES (?, ?, datetime('now'))`);
  const tx = db.transaction(items => {
    items.forEach(row => {
      insertShell.run(row.ts_code, dashDate(row.trade_date));
      stmt.run(
        numberOrNull(row.turnover_rate), numberOrNull(row.volume_ratio), numberOrNull(row.pe), numberOrNull(row.pb),
        numberOrNull(row.total_mv), numberOrNull(row.circ_mv), row.ts_code, dashDate(row.trade_date)
      );
    });
  });
  for (let i = 0; i < rows.length; i += 5000) tx(rows.slice(i, i + 5000));
  console.log(`daily_basic cached: ${rows.length}`);
  return rows.length;
}

async function cacheMoneyflow(db, start, end) {
  const fields = 'ts_code,trade_date,buy_sm_amount,sell_sm_amount,buy_md_amount,sell_md_amount,buy_lg_amount,sell_lg_amount,buy_elg_amount,sell_elg_amount,net_mf_amount';
  let total = 0;
  for (const [from, to] of monthRanges(start, end)) {
    total += await cachePagedRows(`moneyflow ${from}..${to}`, 'moneyflow', {
      start_date: ymd(from),
      end_date: ymd(to)
    }, fields, `INSERT INTO ia_moneyflow (
      ts_code, trade_date, buy_sm_amount, sell_sm_amount, buy_md_amount, sell_md_amount,
      buy_lg_amount, sell_lg_amount, buy_elg_amount, sell_elg_amount, net_mf_amount, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ts_code, trade_date) DO UPDATE SET
      buy_sm_amount=excluded.buy_sm_amount, sell_sm_amount=excluded.sell_sm_amount,
      buy_md_amount=excluded.buy_md_amount, sell_md_amount=excluded.sell_md_amount,
      buy_lg_amount=excluded.buy_lg_amount, sell_lg_amount=excluded.sell_lg_amount,
      buy_elg_amount=excluded.buy_elg_amount, sell_elg_amount=excluded.sell_elg_amount,
      net_mf_amount=excluded.net_mf_amount, updated_at=datetime('now')`, row => [
      row.ts_code, dashDate(row.trade_date),
      numberOrNull(row.buy_sm_amount), numberOrNull(row.sell_sm_amount),
      numberOrNull(row.buy_md_amount), numberOrNull(row.sell_md_amount),
      numberOrNull(row.buy_lg_amount), numberOrNull(row.sell_lg_amount),
      numberOrNull(row.buy_elg_amount), numberOrNull(row.sell_elg_amount),
      numberOrNull(row.net_mf_amount)
    ], { pageSize: 6000 });
  }
  console.log(`moneyflow cached total: ${total}`);
  return total;
}

async function cacheThsIndex(db, type) {
  const rows = await fetchPaged('ths_index', { type }, 'ts_code,name,count,exchange,list_date,type');
  runTransaction(db, `INSERT INTO ia_ths_index (ts_code, name, count, exchange, list_date, type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ts_code) DO UPDATE SET
      name=excluded.name, count=excluded.count, exchange=excluded.exchange,
      list_date=excluded.list_date, type=excluded.type, updated_at=datetime('now')`, rows, row => [
    row.ts_code, row.name, numberOrNull(row.count), row.exchange, row.list_date ? dashDate(row.list_date) : null, row.type
  ]);
  console.log(`ths_index cached: ${rows.length}`);
  return rows;
}

async function cacheThsMembers(db, indexes, refresh) {
  const stmt = db.prepare(`INSERT INTO ia_ths_member (index_code, stock_code, stock_name, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(index_code, stock_code) DO UPDATE SET stock_name=excluded.stock_name, updated_at=datetime('now')`);
  const insertMany = db.transaction(rows => {
    rows.forEach(row => stmt.run(row.ts_code, row.con_code, row.con_name));
  });
  let total = 0;
  let failed = 0;
  for (const [index, item] of indexes.entries()) {
    if (!refresh) {
      const exists = db.prepare('SELECT 1 FROM ia_ths_member WHERE index_code = ? LIMIT 1').get(item.ts_code);
      if (exists) continue;
    }
    let rows = [];
    try {
      rows = await fetchPaged('ths_member', { ts_code: item.ts_code }, 'ts_code,con_code,con_name', {
        timeoutMs: 10000,
        pageSize: 2000,
        maxPages: 20
      });
      insertMany(rows);
      total += rows.length;
    } catch (error) {
      failed += 1;
      console.warn(`ths_member skipped ${item.ts_code} ${item.name || ''}: ${error.message}`);
    }
    if ((index + 1) % 25 === 0 || index === indexes.length - 1) {
      console.log(`ths_member cached indexes=${index + 1}/${indexes.length} rows_total=${total} failed=${failed}`);
    }
  }
  return total;
}

async function cacheThsDaily(db, start, end) {
  return cachePagedRows('ths_daily', 'ths_daily', {
    start_date: ymd(start),
    end_date: ymd(end)
  }, 'ts_code,trade_date,close,pct_change', `INSERT INTO ia_ths_daily (index_code, trade_date, close, pct_change, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(index_code, trade_date) DO UPDATE SET
      close=excluded.close, pct_change=excluded.pct_change, updated_at=datetime('now')`, row => [
    row.ts_code, dashDate(row.trade_date), numberOrNull(row.close), numberOrNull(row.pct_change)
  ], { pageSize: 3000 });
}

async function cacheBlockTrade(db, start, end) {
  db.prepare('DELETE FROM ia_block_trade WHERE trade_date BETWEEN ? AND ?').run(start, end);
  return cachePagedRows('block_trade', 'block_trade', {
    start_date: ymd(start),
    end_date: ymd(end)
  }, 'ts_code,trade_date,price,vol,amount,buyer,seller', `INSERT INTO ia_block_trade (ts_code, trade_date, price, vol, amount, buyer, seller, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`, row => [
    row.ts_code, dashDate(row.trade_date), numberOrNull(row.price), numberOrNull(row.vol), numberOrNull(row.amount), row.buyer || null, row.seller || null
  ], { pageSize: 1000 });
}

async function main() {
  const args = parseArgs(process.argv);
  const start = args.start || '2024-01-01';
  const end = args.end || '2026-07-05';
  const conceptType = args['concept-type'] || 'N';
  const refreshMembers = Boolean(args['refresh-members']);
  const db = getDb();
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  const summary = { start, end, conceptType };
  summary.stock_basic = args['skip-stock-basic'] ? 'skipped' : await cacheStockBasic(db);
  summary.trade_cal = args['skip-trade-cal'] ? 'skipped' : await cacheTradeCal(db, start, end);
  summary.daily = args['skip-daily'] ? 'skipped' : await cacheDaily(db, start, end);
  if (args['include-daily-basic']) {
    summary.daily_basic = await cacheDailyBasic(db, start, end);
  } else {
    summary.daily_basic = 'skipped';
  }
  summary.moneyflow = args['skip-moneyflow'] ? 'skipped' : await cacheMoneyflow(db, start, end);
  const indexes = args['skip-ths-index']
    ? db.prepare('SELECT ts_code, name FROM ia_ths_index').all()
    : await cacheThsIndex(db, conceptType);
  summary.ths_index = args['skip-ths-index'] ? 'skipped' : indexes.length;
  if (args['skip-members']) {
    summary.ths_member = 'skipped';
  } else {
    summary.ths_member = await cacheThsMembers(db, indexes, refreshMembers);
  }
  summary.ths_daily = args['skip-ths-daily'] ? 'skipped' : await cacheThsDaily(db, start, end);
  summary.block_trade = args['skip-block-trade'] ? 'skipped' : await cacheBlockTrade(db, start, end);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});

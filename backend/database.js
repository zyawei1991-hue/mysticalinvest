const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/daily_report.db');

let db = null;

function initDatabase() {
  if (db) {
    console.log('数据库已初始化，跳过');
    return db;
  }

  try {
    db = new Database(dbPath);
    console.log('已连接到SQLite数据库');
  } catch(e) {
    console.error('创建数据库失败:', e.message);
    return null;
  }

  // 建表
  const tables = [
    `CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      report_type TEXT NOT NULL,
      report_time TEXT,
      hs300_value REAL, hs300_change REAL,
      sh_value REAL, sh_change REAL,
      sz_value REAL, sz_change REAL,
      cy_value REAL, cy_change REAL,
      total_profit_loss REAL, total_profit_loss_percent REAL,
      holding_count INTEGER,
      bazi_json TEXT, industries_json TEXT, alerts_json TEXT,
      global_indexes_json TEXT, market_momentum_json TEXT, card_summary TEXT,
      operation_advice_json TEXT, key_variables_json TEXT,
      market_breadth_json TEXT, limit_stocks_json TEXT, annual_correction_json TEXT,
      bazi_interpretation TEXT,
      risk_warning TEXT, verification TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      name TEXT NOT NULL, code TEXT,
      alert_level TEXT, suggestion TEXT, reason TEXT,
      snapshot_price REAL,
      snapshot_change_percent REAL,
      snapshot_as_of TEXT,
      snapshot_source TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      five_elements TEXT,
      industry_analysis TEXT,
      stock_suggestions TEXT,
      risk_warning TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stock_industry_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT,
      industry TEXT NOT NULL,
      raw_industry TEXT,
      raw_concepts TEXT,
      source TEXT,
      confidence TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stock_analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      code TEXT,
      name TEXT,
      analysis_result TEXT,
      source TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS report_stock_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      watchlist_id INTEGER NOT NULL,
      suggestion TEXT, reason TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS decision_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL UNIQUE,
      report_date TEXT NOT NULL,
      report_type TEXT NOT NULL,
      conclusion TEXT,
      recommended_industries_json TEXT,
      key_variables_json TEXT,
      market_result_json TEXT,
      risk_scenario TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS historical_daily_bars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      pre_close REAL,
      pct_chg REAL,
      volume REAL,
      amount REAL,
      raw_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      framework_version TEXT,
      provider TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      params_json TEXT,
      metrics_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS backtest_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      signal_date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      industry TEXT NOT NULL,
      proxy_symbol TEXT,
      factor_score REAL,
      rating INTEGER,
      signal_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS backtest_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      signal_date TEXT NOT NULL,
      industry TEXT NOT NULL,
      proxy_symbol TEXT,
      top_n INTEGER,
      horizon_days INTEGER NOT NULL,
      entry_date TEXT,
      exit_date TEXT,
      entry_price REAL,
      exit_price REAL,
      return_pct REAL,
      benchmark_return_pct REAL,
      excess_return_pct REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_stock_basic (
      ts_code TEXT PRIMARY KEY,
      symbol TEXT,
      name TEXT,
      area TEXT,
      industry TEXT,
      market TEXT,
      list_date TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_trade_cal (
      cal_date TEXT PRIMARY KEY,
      is_open INTEGER,
      pretrade_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ia_daily_bars (
      ts_code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      pre_close REAL,
      pct_chg REAL,
      vol REAL,
      amount REAL,
      turnover_rate REAL,
      volume_ratio REAL,
      pe REAL,
      pb REAL,
      total_mv REAL,
      circ_mv REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ts_code, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS ia_moneyflow (
      ts_code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      buy_sm_amount REAL,
      sell_sm_amount REAL,
      buy_md_amount REAL,
      sell_md_amount REAL,
      buy_lg_amount REAL,
      sell_lg_amount REAL,
      buy_elg_amount REAL,
      sell_elg_amount REAL,
      net_mf_amount REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ts_code, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS ia_ths_index (
      ts_code TEXT PRIMARY KEY,
      name TEXT,
      count INTEGER,
      exchange TEXT,
      list_date TEXT,
      type TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_ths_member (
      index_code TEXT NOT NULL,
      stock_code TEXT NOT NULL,
      stock_name TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (index_code, stock_code)
    )`,
    `CREATE TABLE IF NOT EXISTS ia_ths_daily (
      index_code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      close REAL,
      pct_change REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (index_code, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS ia_block_trade (
      ts_code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      price REAL,
      vol REAL,
      amount REAL,
      buyer TEXT,
      seller TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      provider TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      params_json TEXT,
      metrics_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_backtest_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      signal_date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      ts_code TEXT NOT NULL,
      name TEXT,
      final_score REAL,
      stock_pct_chg REAL,
      board_min_chg REAL,
      relative_chg REAL,
      total_net_inflow REAL,
      sup_big_ratio REAL,
      big_total_ratio REAL,
      mid_ratio REAL,
      pos_days INTEGER,
      shake_recover INTEGER,
      is_new_stock INTEGER,
      stock_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ia_backtest_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      signal_date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      ts_code TEXT NOT NULL,
      name TEXT,
      entry_date TEXT,
      exit_date TEXT,
      entry_price REAL,
      exit_price REAL,
      return_pct REAL,
      benchmark_return_pct REAL,
      excess_return_pct REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS observation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      code TEXT,
      object_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS observation_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_item_id INTEGER NOT NULL,
      report_id INTEGER,
      report_date TEXT NOT NULL,
      report_type TEXT NOT NULL,
      state TEXT NOT NULL,
      score REAL,
      confidence TEXT,
      risk_level TEXT,
      completeness REAL,
      summary TEXT,
      primary_driver TEXT,
      primary_risk TEXT,
      upgrade_condition TEXT,
      downgrade_condition TEXT,
      invalidation_condition TEXT,
      factor_snapshot_json TEXT,
      source_meta_json TEXT,
      observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      algorithm_version TEXT NOT NULL DEFAULT 'observation-state-v1'
    )`,
    `CREATE TABLE IF NOT EXISTS state_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_item_id INTEGER NOT NULL,
      observation_state_id INTEGER NOT NULL,
      from_state TEXT,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      transition_type TEXT NOT NULL,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS validation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_item_id INTEGER NOT NULL,
      observation_state_id INTEGER NOT NULL,
      transition_id INTEGER,
      horizon_days INTEGER NOT NULL,
      due_date TEXT,
      condition_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS validation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      validation_task_id INTEGER NOT NULL UNIQUE,
      absolute_return REAL,
      benchmark_excess REAL,
      relative_excess REAL,
      max_favorable REAL,
      max_adverse REAL,
      condition_triggered INTEGER,
      risk_triggered_first INTEGER,
      verdict TEXT,
      result_json TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      risk_preference TEXT NOT NULL DEFAULT 'balanced',
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_events_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS validation_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT NOT NULL,
      period_key TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      evidence_level TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(period_type, period_key, algorithm_version)
    )`,
    `CREATE TABLE IF NOT EXISTS optimization_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      validation_report_id INTEGER,
      issue TEXT NOT NULL,
      evidence TEXT,
      module TEXT NOT NULL,
      priority TEXT NOT NULL,
      changes_parameters INTEGER NOT NULL DEFAULT 0,
      old_version TEXT,
      new_version TEXT,
      owner TEXT,
      review_window TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  console.log('开始建表...');
  for (const sql of tables) {
    try { db.exec(sql); } catch(e) {}
  }

  const migrations = [
    'ALTER TABLE reports ADD COLUMN global_indexes_json TEXT',
    'ALTER TABLE reports ADD COLUMN market_momentum_json TEXT',
    'ALTER TABLE reports ADD COLUMN card_summary TEXT',
    'ALTER TABLE reports ADD COLUMN operation_advice_json TEXT',
    'ALTER TABLE reports ADD COLUMN key_variables_json TEXT',
    'ALTER TABLE reports ADD COLUMN market_breadth_json TEXT',
    'ALTER TABLE reports ADD COLUMN limit_stocks_json TEXT',
    'ALTER TABLE reports ADD COLUMN annual_correction_json TEXT',
    'ALTER TABLE historical_daily_bars ADD COLUMN raw_json TEXT',
    'ALTER TABLE historical_daily_bars ADD COLUMN updated_at DATETIME',
    'ALTER TABLE backtest_returns ADD COLUMN top_n INTEGER',
    'ALTER TABLE ia_daily_bars ADD COLUMN turnover_rate REAL',
    'ALTER TABLE ia_daily_bars ADD COLUMN volume_ratio REAL',
    'ALTER TABLE ia_daily_bars ADD COLUMN pe REAL',
    'ALTER TABLE ia_daily_bars ADD COLUMN pb REAL',
    'ALTER TABLE ia_daily_bars ADD COLUMN total_mv REAL',
    'ALTER TABLE ia_daily_bars ADD COLUMN circ_mv REAL',
    'ALTER TABLE watchlist ADD COLUMN alert_level TEXT',
    'ALTER TABLE watchlist ADD COLUMN created_at DATETIME',
    'ALTER TABLE stocks ADD COLUMN snapshot_price REAL',
    'ALTER TABLE stocks ADD COLUMN snapshot_change_percent REAL',
    'ALTER TABLE stocks ADD COLUMN snapshot_as_of TEXT',
    'ALTER TABLE stocks ADD COLUMN snapshot_source TEXT',
    "UPDATE watchlist SET created_at = COALESCE(created_at, added_at, datetime('now'))"
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch(e) {}
  }

  const indexes = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_date_type ON reports(report_date, report_type)',
    'CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_stocks_report_id ON stocks(report_id)',
    'CREATE INDEX IF NOT EXISTS idx_snapshots_report_id ON report_stock_snapshots(report_id)',
    'CREATE INDEX IF NOT EXISTS idx_snapshots_watchlist_id ON report_stock_snapshots(watchlist_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_name ON watchlist(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_industry_cache_code ON stock_industry_cache(code)',
    'CREATE INDEX IF NOT EXISTS idx_stock_industry_cache_name ON stock_industry_cache(name)',
    'CREATE INDEX IF NOT EXISTS idx_stock_history_time ON stock_analysis_history(query_time DESC)',
    'CREATE INDEX IF NOT EXISTS idx_stock_history_code ON stock_analysis_history(code)',
    'CREATE INDEX IF NOT EXISTS idx_decision_logs_date_type ON decision_logs(report_date DESC, report_type)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_bars_provider_symbol_date ON historical_daily_bars(provider, symbol, trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_historical_bars_symbol_date ON historical_daily_bars(symbol, trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON backtest_runs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_backtest_signals_run_date ON backtest_signals(run_id, signal_date)',
    'CREATE INDEX IF NOT EXISTS idx_backtest_returns_run_date ON backtest_returns(run_id, signal_date)',
    'CREATE INDEX IF NOT EXISTS idx_ia_daily_date ON ia_daily_bars(trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_ia_moneyflow_date ON ia_moneyflow(trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_ia_ths_member_stock ON ia_ths_member(stock_code)',
    'CREATE INDEX IF NOT EXISTS idx_ia_ths_daily_date ON ia_ths_daily(trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_ia_block_trade_date_code ON ia_block_trade(trade_date, ts_code)',
    'CREATE INDEX IF NOT EXISTS idx_ia_runs_created ON ia_backtest_runs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_ia_signals_run_date ON ia_backtest_signals(run_id, signal_date)',
    'CREATE INDEX IF NOT EXISTS idx_ia_returns_run_date ON ia_backtest_returns(run_id, signal_date)',
    'CREATE INDEX IF NOT EXISTS idx_observation_items_type ON observation_items(object_type, active)',
    'CREATE INDEX IF NOT EXISTS idx_observation_states_item_time ON observation_states(observation_item_id, observed_at DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_observation_states_item_report ON observation_states(observation_item_id, report_id, report_type)',
    'CREATE INDEX IF NOT EXISTS idx_state_transitions_item_time ON state_transitions(observation_item_id, occurred_at DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_validation_task_state_horizon ON validation_tasks(observation_state_id, horizon_days)',
    'CREATE INDEX IF NOT EXISTS idx_validation_tasks_status_due ON validation_tasks(status, due_date)',
    'CREATE INDEX IF NOT EXISTS idx_validation_reports_period ON validation_reports(period_type, period_key)',
    'CREATE INDEX IF NOT EXISTS idx_optimization_status ON optimization_suggestions(status, priority)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_optimization_report_issue ON optimization_suggestions(validation_report_id, issue)',
  ];
  for (const sql of indexes) {
    try { db.exec(sql); } catch(e) {}
  }

  try {
    db.prepare(`INSERT OR IGNORE INTO user_preferences (
      id, risk_preference, reminder_enabled, reminder_events_json
    ) VALUES (1, 'balanced', 1, ?)`)
      .run(JSON.stringify(['upgrade', 'downgrade', 'invalidated', 'data_degraded']));
  } catch(e) {}

  console.log('数据库表初始化完成');
  return db;
}

// 同步初始化
initDatabase();

// 保存数据库
function saveDb() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
  }
}

// 执行写操作
function run(sql, params) {
  if (!db) { console.error('run() ERROR: db not initialized'); return; }
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(...params);
    stmt.run();
    // better-sqlite3 Statement 没有 free() 方法
  } catch(e) {
    console.error('run() SQL错误:', sql.substring(0, 60), e.message);
  }
}

// 查询单行，返回对象
function get(sql, params) {
  if (!db) { console.error('get() ERROR: db not initialized, SQL:', sql); return null; }
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(...params);
    const row = stmt.get();
    // better-sqlite3 Statement 没有 free() 方法
    return row || null;
  } catch(e) {
    console.error('get() SQL错误:', sql.substring(0, 60), e.message);
    return null;
  }
}

// 查询多行，返回对象数组
function all(sql, params) {
  if (!db) { console.error('all() ERROR: db not initialized'); return []; }
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(...params);
    return stmt.all();
  } catch(e) {
    console.error('all() SQL错误:', sql.substring(0, 60), e.message);
    return [];
  }
}

function getLastInsertRowId() {
  if (!db) return null;
  try {
    return db.prepare("SELECT last_insert_rowid()").pluck().get();
  } catch(e) { return null; }
}

module.exports = { db, getDb: () => db, initDatabase, saveDb, run, get, all, getLastInsertRowId };

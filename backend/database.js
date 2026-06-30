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
      global_indexes_json TEXT, card_summary TEXT,
      bazi_interpretation TEXT,
      risk_warning TEXT, verification TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      name TEXT NOT NULL, code TEXT,
      alert_level TEXT, suggestion TEXT, reason TEXT
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
  ];

  console.log('开始建表...');
  for (const sql of tables) {
    try { db.exec(sql); } catch(e) {}
  }

  const migrations = [
    'ALTER TABLE reports ADD COLUMN global_indexes_json TEXT',
    'ALTER TABLE reports ADD COLUMN card_summary TEXT'
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
    'CREATE INDEX IF NOT EXISTS idx_stock_history_time ON stock_analysis_history(query_time DESC)',
    'CREATE INDEX IF NOT EXISTS idx_stock_history_code ON stock_analysis_history(code)',
  ];
  for (const sql of indexes) {
    try { db.exec(sql); } catch(e) {}
  }

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

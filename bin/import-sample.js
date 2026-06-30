
#! /usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/daily_report.db');
const db = new Database(dbPath);

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT UNIQUE NOT NULL,
    hs300_value REAL,
    hs300_change REAL,
    total_profit_loss REAL,
    total_profit_loss_percent REAL,
    holding_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    alert_level TEXT,
    suggestion TEXT,
    reason TEXT,
    FOREIGN KEY (report_id) REFERENCES reports(id)
  );

  CREATE TABLE IF NOT EXISTS analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    five_elements TEXT,
    prediction TEXT,
    joke TEXT,
    FOREIGN KEY (report_id) REFERENCES reports(id)
  );
`);

console.log('表结构创建完成');

// 插入示例日报
const sampleReport = {
  report_date: '2026-03-31',
  hs300_value: 4671.56,
  hs300_change: -14.01, // -0.30%
  total_profit_loss: -7966,
  total_profit_loss_percent: -9.77,
  holding_count: 17
};

// 检查是否已存在
const existing = db.prepare('SELECT id FROM reports WHERE report_date = ?').get(sampleReport.report_date);
let reportId;

if (existing) {
  console.log('示例日报已存在，更新...');
  db.prepare(`
    UPDATE reports SET
      hs300_value = ?,
      hs300_change = ?,
      total_profit_loss = ?,
      total_profit_loss_percent = ?,
      holding_count = ?
    WHERE report_date = ?
  `).run(
    sampleReport.hs300_value,
    sampleReport.hs300_change,
    sampleReport.total_profit_loss,
    sampleReport.total_profit_loss_percent,
    sampleReport.holding_count,
    sampleReport.report_date
  );
  reportId = existing.id;
} else {
  const result = db.prepare(`
    INSERT INTO reports
    (report_date, hs300_value, hs300_change, total_profit_loss, total_profit_loss_percent, holding_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sampleReport.report_date,
    sampleReport.hs300_value,
    sampleReport.hs300_change,
    sampleReport.total_profit_loss,
    sampleReport.total_profit_loss_percent,
    sampleReport.holding_count
  );
  reportId = result.lastInsertRowid;
}

console.log('示例日报创建成功，ID:', reportId);

// 插入示例股票
const sampleStocks = [
  {
    name: '顺利3',
    code: '400142',
    alert_level: 'red',
    suggestion: '清仓',
    reason: '退市风险，及时止损'
  },
  {
    name: '芯片ETF',
    code: '512480',
    alert_level: 'yellow',
    suggestion: '减仓',
    reason: '技术走势走弱，短期调整'
  }
];

// 删除旧数据
db.prepare('DELETE FROM stocks WHERE report_id = ?').run(reportId);

// 插入新数据
const insertStock = db.prepare('INSERT INTO stocks (report_id, name, code, alert_level, suggestion, reason) VALUES (?, ?, ?, ?, ?, ?)');
const insertMany = db.transaction((stocks) => {
  for (const stock of stocks) {
    insertStock.run(reportId, stock.name, stock.code, stock.alert_level, stock.suggestion, stock.reason);
  }
});
insertMany(sampleStocks);

// 删除旧分析
db.prepare('DELETE FROM analysis WHERE report_id = ?').run(reportId);

// 插入示例分析
db.prepare('INSERT INTO analysis (report_id, five_elements, prediction, joke) VALUES (?, ?, ?, ?)').run(
  reportId,
  `今日盘面金旺木囚，水相不足。
大盘整体承木性下跌，金气克木，收阴合理。
持仓中金股表现尚可，水木票偏弱，符合五行走势。`,
  `明日水土相和，预计低位震荡，不宜追高，持仓观望为主。`,
  `巴菲特说："在别人恐惧我贪婪"，但巴菲特没说今天该贪婪还是恐惧，所以咱们还是先等等。`
);

db.close();

console.log('示例数据导入完成！');
console.log('\n现在可以启动服务器了:');
console.log('  cd backend && npm install && npm start');

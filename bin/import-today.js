#! /usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/daily_report.db');
const db = new Database(dbPath);

// 今日早盘数据（2026-04-01）
const todayReport = {
  report_date: '2026-04-01',
  hs300_value: 4652.83,
  hs300_change: -18.73, // -0.40%
  total_profit_loss: -8245,
  total_profit_loss_percent: -10.12,
  holding_count: 16
};

// 检查是否已存在
const existing = db.prepare('SELECT id FROM reports WHERE report_date = ?').get(todayReport.report_date);
let reportId;

if (existing) {
  console.log('今日日报已存在，更新...');
  db.prepare(`
    UPDATE reports SET
      hs300_value = ?,
      hs300_change = ?,
      total_profit_loss = ?,
      total_profit_loss_percent = ?,
      holding_count = ?
    WHERE report_date = ?
  `).run(
    todayReport.hs300_value,
    todayReport.hs300_change,
    todayReport.total_profit_loss,
    todayReport.total_profit_loss_percent,
    todayReport.holding_count,
    todayReport.report_date
  );
  reportId = existing.id;
} else {
  const result = db.prepare(`
    INSERT INTO reports
    (report_date, hs300_value, hs300_change, total_profit_loss, total_profit_loss_percent, holding_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    todayReport.report_date,
    todayReport.hs300_value,
    todayReport.hs300_change,
    todayReport.total_profit_loss,
    todayReport.total_profit_loss_percent,
    todayReport.holding_count
  );
  reportId = result.lastInsertRowid;
}

console.log('今日日报创建成功，ID:', reportId);

// 今日重点股票
const todayStocks = [
  {
    name: '贵州茅台',
    code: '600519',
    alert_level: 'yellow',
    suggestion: '观望',
    reason: '跌破1600支撑，等待企稳信号'
  },
  {
    name: '中芯国际',
    code: '688981',
    alert_level: 'red',
    suggestion: '减仓',
    reason: '连续三日放量下跌，趋势走弱'
  },
  {
    name: '工商银行',
    code: '601398',
    alert_level: 'green',
    suggestion: '持有',
    reason: '股息率稳定，防守配置合适'
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
insertMany(todayStocks);

// 删除旧分析
db.prepare('DELETE FROM analysis WHERE report_id = ?').run(reportId);

// 今日五行分析（ 公历2026年4月1日，农历闰二月十四，日柱癸未）
const fiveElements = `今日日柱癸未（水+土），辰月土旺金相水囚。
早盘开盘沪指低开低走，金气盛而水木弱，符合月令走势。
主力资金净流出312亿，情绪面偏空，土重埋金，做多动能不足。
板块来看，黄金、石油等土金板块偏强，科技成长水木板块承压，验证五行判断。`;

const prediction = `今日土旺克水，下午关注能否在3900点上方企稳。
用神金水，所以金融、黄金板块有望相对抗跌，成长股继续承压。
操作上保持轻仓，不急于抄底，等待水势回升（明日丙辰，水得生助）再看机会。`;

const joke = `"老师，为什么A股总是高开低走？" "因为中国人比较谦虚，早上给你点希望，下午再告诉你现实。"`;

// 插入分析
db.prepare('INSERT INTO analysis (report_id, five_elements, prediction, joke) VALUES (?, ?, ?, ?)').run(
  reportId,
  fiveElements,
  prediction,
  joke
);

db.close();

console.log('今日数据导入完成！');
console.log('访问 http://localhost:3000 查看日报');

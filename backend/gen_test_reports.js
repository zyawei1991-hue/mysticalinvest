const { db } = require('./database');

// 先删除今天已有的测试记录（含子表）
const existing = db.prepare("SELECT id FROM reports WHERE report_date = '2026-04-05'").all();
for (const r of existing) {
  db.prepare('DELETE FROM stocks WHERE report_id = ?').run(r.id);
  db.prepare('DELETE FROM analysis WHERE report_id = ?').run(r.id);
}
db.prepare("DELETE FROM reports WHERE report_date = '2026-04-05'").run();
console.log('Cleared existing 2026-04-05 records:', existing.length);

// 生成三种时段的测试报告
const types = [
  { type: 'morning', label: '早盘日报' },
  { type: 'noon',    label: '午间日报' },
  { type: 'evening', label: '盘后总结' }
];

for (const t of types) {
  const hs300_change = parseFloat((Math.random() * 3 - 1.5).toFixed(2));
  const sh_change = parseFloat((hs300_change + (Math.random() * 0.4 - 0.2)).toFixed(2));
  const result = db.prepare(`INSERT INTO reports
    (report_date, report_type, hs300_value, hs300_change, sh_value, sh_change, total_profit_loss, total_profit_loss_percent, holding_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      '2026-04-05', t.type,
      parseFloat((3820.5 + hs300_change * 20).toFixed(2)),
      hs300_change,
      parseFloat((3350.2 + sh_change * 20).toFixed(2)),
      sh_change,
      -7600 + Math.round(Math.random() * 500),
      -3.1,
      16
    );
  const reportId = result.lastInsertRowid;

  // 插入分析数据
  db.prepare('INSERT INTO analysis (report_id, five_elements, prediction, joke) VALUES (?, ?, ?, ?)').run(
    reportId,
    `【${t.label}】今日八字分析：木火土金水，五行相生相克，市场震荡中寻机会。`,
    `${t.label}行情以震荡为主，关注量能变化。`,
    '股票涨了叫分享，跌了叫秘密。'
  );

  // 插入3只测试股票
  const stocks = [
    { name: '贵州茅台', code: '600519', alert_level: 'green', suggestion: '持有', reason: '长期价值稳健' },
    { name: '中芯国际', code: '688981', alert_level: 'yellow', suggestion: '观望', reason: '等待方向明确' },
    { name: '工商银行', code: '601398', alert_level: 'green', suggestion: '持有', reason: '股息率稳定' }
  ];
  const insertStock = db.prepare('INSERT INTO stocks (report_id, name, code, alert_level, suggestion, reason) VALUES (?, ?, ?, ?, ?, ?)');
  for (const s of stocks) insertStock.run(reportId, s.name, s.code, s.alert_level, s.suggestion, s.reason);

  console.log('Created:', t.label, 'reportId:', reportId);
}

// 验证
const all = db.prepare("SELECT id, report_date, report_type, created_at FROM reports ORDER BY report_date DESC, report_type").all();
console.log('\nAll reports in DB:');
all.forEach(r => console.log(` [${r.id}] ${r.report_date} | ${r.report_type} | ${r.created_at}`));

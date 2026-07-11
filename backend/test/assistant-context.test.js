const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractAssistantStockQuery,
  parseAssistantTemporalIntent,
  summarizeAssistantTrend
} = require('../assistantContext');

test('parses 7-9月 as a month range instead of July 9', () => {
  const result = parseAssistantTemporalIntent(
    '看看南威软件7-9月建仓时机。',
    new Date('2026-07-11T00:00:00Z')
  );
  assert.deepEqual(result, {
    type: 'month_range',
    year: 2026,
    start_month: 7,
    end_month: 9,
    interpretation: '2026年7月至9月（月份区间，不是7月9日）'
  });
});

test('keeps an explicit calendar date as an exact date', () => {
  const result = parseAssistantTemporalIntent('复盘2026年7月9日的日报');
  assert.equal(result.type, 'exact_date');
  assert.equal(result.interpretation, '2026年7月9日');
});

test('extracts a Chinese stock name from a position timing question', () => {
  assert.equal(extractAssistantStockQuery('看看南威软件7-9月建仓时机。'), '南威软件');
});

test('extracts stock codes and watchlist names without guessing generic questions', () => {
  assert.equal(extractAssistantStockQuery('分析一下603636的走势'), '603636');
  assert.equal(
    extractAssistantStockQuery('南威软件最近有什么风险', [{ name: '南威软件', code: '603636' }]),
    '603636'
  );
  assert.equal(extractAssistantStockQuery('今天计算机行业为什么排第一'), null);
});

test('summarizes historical bars without returning the full series', () => {
  const summary = summarizeAssistantTrend({
    source: 'test-bars',
    bars: [
      { date: '2026-07-01', close: 10, high: 11, low: 9, changePercent: 1 },
      { date: '2026-07-02', close: 11, high: 12, low: 10, changePercent: 10 }
    ]
  });
  assert.equal(summary.available, true);
  assert.equal(summary.period_change_percent, 10);
  assert.equal(summary.period_high, 12);
  assert.equal(summary.period_low, 9);
  assert.equal(summary.recent_bars.length, 2);
});

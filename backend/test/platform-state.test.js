const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateMarketSnapshot,
  classifyObjectType,
  industryState,
  buildFactorAttribution
} = require('../platformState');

function report(overrides = {}) {
  return {
    hs300_change: 0.2,
    market_breadth_json: JSON.stringify({ up: 3200, down: 1800 }),
    market_momentum_json: JSON.stringify({
      mainForce: { netInflow: 1200000000 },
      etfFlow: { netInflow: 400000000 }
    }),
    operation_advice_json: JSON.stringify({ summary: '市场保持平衡，等待确认。' }),
    key_variables_json: JSON.stringify({
      variables: Array.from({ length: 10 }, (_, index) => ({ status: index < 9 ? 'ready' : 'pending_source' }))
    }),
    ...overrides
  };
}

test('classifies industries, ETFs and A shares without conflating them', () => {
  assert.equal(classifyObjectType('计算机', '', ''), 'industry');
  assert.equal(classifyObjectType('传媒ETF', '512980', ''), 'etf');
  assert.equal(classifyObjectType('南威软件', '603636', ''), 'stock');
});

test('treats missing fund flow as unknown instead of zero', () => {
  const market = calculateMarketSnapshot(report({
    market_momentum_json: JSON.stringify({ mainForce: {}, etfFlow: {} })
  }));
  assert.equal(market.main_flow, null);
  assert.equal(market.etf_flow, null);
  assert.match(market.risk_gates[2].fact, /暂缺|未知/);
});

test('high market risk blocks a high mystic score from becoming key tracking', () => {
  const market = calculateMarketSnapshot(report({
    hs300_change: -1.8,
    market_breadth_json: JSON.stringify({ up: 800, down: 4200 })
  }));
  const state = industryState({
    name: '计算机',
    factor_score: 100,
    key_variables: ['AI商业化'],
    pressure_test: { level: 'normal', active_risks: [] }
  }, 1, market);
  assert.equal(market.risk_level, '高');
  assert.equal(state.state, '降级观察');
});

test('factor attribution refuses to fabricate A-E when only Top5 was frozen', () => {
  const result = buildFactorAttribution(null, 5);
  assert.equal(result.available, true);
  assert.deepEqual(Object.keys(result.groups), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(result.comparable, false);
  assert.match(result.methodology, /不能事后重排|不以相同 Top5/);
  assert.equal(result.groups.A.available, false);
  assert.ok(result.groups.E.samples > 0);
});

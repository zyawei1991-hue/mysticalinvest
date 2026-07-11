const { get, all, run, getLastInsertRowId } = require('./database');
const { getIndustryProxy } = require('./industryProxyMap');

const STATE_ORDER = {
  '未覆盖': 0,
  '初步观察': 1,
  '等待确认': 2,
  '条件改善': 3,
  '重点跟踪': 4,
  '降级观察': 1,
  '逻辑失效': 0
};

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function reportTypeLabel(type) {
  return { morning: '早盘', noon: '午间', evening: '盘后' }[type] || type || '日报';
}

function calculateMarketSnapshot(report) {
  const breadth = parseJson(report.market_breadth_json, {}) || {};
  const momentum = parseJson(report.market_momentum_json, {}) || {};
  const operation = parseJson(report.operation_advice_json, {}) || {};
  const variables = parseJson(report.key_variables_json, {}) || {};
  const up = finite(breadth.up) || 0;
  const down = finite(breadth.down) || 0;
  const breadthBalance = up + down > 0 ? ((up - down) / (up + down)) * 100 : null;
  const hs300 = finite(report.hs300_change);
  const mainFlow = finite(momentum.mainForce?.netInflow);
  const etfFlow = finite(momentum.etfFlow?.netInflow);
  const readyVariables = Array.isArray(variables.variables)
    ? variables.variables.filter(item => item.status === 'ready').length
    : 0;
  const variableCount = Array.isArray(variables.variables) ? variables.variables.length : 0;
  const completeness = variableCount ? Math.round((readyVariables / variableCount) * 100) : 45;

  const highRisk = (hs300 !== null && hs300 <= -1.2)
    || (breadthBalance !== null && breadthBalance <= -28)
    || completeness < 45;
  const mediumRisk = highRisk
    || (hs300 !== null && hs300 < -0.35)
    || (breadthBalance !== null && breadthBalance < -10)
    || (mainFlow !== null && mainFlow < 0)
    || completeness < 75;
  const riskLevel = highRisk ? '高' : mediumRisk ? '中' : '低';
  const attack = riskLevel === '低'
    && (hs300 === null || hs300 >= 0)
    && (breadthBalance === null || breadthBalance >= 8)
    && (mainFlow === null || mainFlow >= 0);
  const marketState = riskLevel === '高' ? '防守' : attack ? '进攻' : '平衡';
  const facts = [
    hs300 === null ? '沪深300数据缺失' : `沪深300 ${hs300 >= 0 ? '+' : ''}${hs300.toFixed(2)}%`,
    breadthBalance === null ? '市场宽度缺失' : `宽度差 ${breadthBalance >= 0 ? '+' : ''}${breadthBalance.toFixed(1)}%`,
    mainFlow === null ? '主力资金缺失' : `主力资金${mainFlow >= 0 ? '净流入' : '净流出'}`
  ];
  const riskGates = [
    {
      key: 'index',
      label: '核心指数',
      level: hs300 !== null && hs300 <= -1.2 ? '高' : hs300 !== null && hs300 < -0.35 ? '中' : '低',
      fact: facts[0],
      condition: '若沪深300跌幅扩大至 -1.20% 以下，候选统一降级。',
      impact: hs300 !== null && hs300 <= -1.2 ? '阻断升级' : '保留观察资格'
    },
    {
      key: 'breadth',
      label: '市场宽度',
      level: breadthBalance !== null && breadthBalance <= -28 ? '高' : breadthBalance !== null && breadthBalance < -10 ? '中' : '低',
      fact: facts[1],
      condition: '宽度差低于 -28% 时视为多数方向缺少承接。',
      impact: breadthBalance !== null && breadthBalance < -10 ? '降低金融确认' : '允许正常排序'
    },
    {
      key: 'fund',
      label: '主力与 ETF 资金',
      level: mainFlow === null && etfFlow === null ? '中' : mainFlow !== null && mainFlow < 0 ? '中' : '低',
      fact: mainFlow === null && etfFlow === null ? '资金源暂缺，不能用 0 代替未知' : facts[2],
      condition: '主力与 ETF 资金同步转正，才构成新增金融确认。',
      impact: mainFlow === null || mainFlow < 0 ? '等待资金确认' : '形成资金确认'
    }
  ];

  return {
    state: marketState,
    risk_level: riskLevel,
    completeness,
    breadth_balance: breadthBalance,
    hs300_change: hs300,
    main_flow: mainFlow,
    etf_flow: etfFlow,
    conclusion: operation.summary || operation.stance || report.card_summary || '等待最新日报结论',
    facts,
    risk_gates: riskGates
  };
}

function classifyObjectType(name, code, requestedType) {
  if (['industry', 'etf', 'stock'].includes(requestedType)) return requestedType;
  const text = `${name || ''} ${code || ''}`;
  if (/ETF|基金/i.test(text) || /^(5|1)\d{5}$/.test(String(code || '').replace(/\D/g, ''))) return 'etf';
  if (/^\d{6}$/.test(String(code || '').replace(/\D/g, ''))) return 'stock';
  return 'industry';
}

function industryState(industry, rank, market) {
  const mystic = clamp(industry.factor_score);
  const adjustment = finite(industry.market_adjustment) || 0;
  const financial = clamp(50 + adjustment * 100 + (market.breadth_balance || 0) * 0.35
    + (market.main_flow !== null ? (market.main_flow > 0 ? 12 : -12) : -8));
  const elevated = industry.pressure_test?.level === 'elevated';
  const riskScore = clamp((market.risk_level === '高' ? 85 : market.risk_level === '中' ? 55 : 25) + (elevated ? 18 : 0));
  const score = clamp(mystic * 0.45 + financial * 0.45 + (100 - riskScore) * 0.1);
  let state = '等待确认';
  if (market.risk_level === '高' || elevated) state = '降级观察';
  else if (rank <= 3 && financial >= 62 && market.risk_level === '低') state = '重点跟踪';
  else if (rank <= 3 && financial >= 45) state = '条件改善';
  else if (mystic >= 55) state = '等待确认';
  else state = '初步观察';
  const completeness = market.completeness;
  if (completeness < 45) state = '未覆盖';
  const keys = Array.isArray(industry.key_variables) ? industry.key_variables : [];
  const activeRisks = industry.pressure_test?.active_risks || [];
  return {
    state,
    score: Number(score.toFixed(1)),
    confidence: completeness >= 85 ? '高' : completeness >= 65 ? '中' : '低',
    risk_level: market.risk_level === '高' || elevated ? '高' : market.risk_level,
    completeness,
    summary: `${industry.name}当前为${state}，评分用于排序，不直接构成交易动作。`,
    primary_driver: keys.slice(0, 2).join('、') || industry.reason || '行业五行先验',
    primary_risk: activeRisks[0] || (market.risk_level === '低' ? '金融确认尚需持续' : '市场风险门控限制升级'),
    upgrade_condition: `资金与相对强度新增确认，且风险等级不高于中；${keys[0] ? `重点复核${keys[0]}` : '数据完整度保持在 75% 以上'}。`,
    downgrade_condition: '主力资金或趋势确认显著转弱，或市场风险门控升至高。',
    invalidation_condition: '核心行业逻辑被事实否定，或在验证窗口内升级条件持续未兑现。',
    factors: {
      mystic_prior: mystic,
      financial_confirmation: Number(financial.toFixed(1)),
      risk_gate: Number(riskScore.toFixed(1)),
      element_profile: industry.element_profile || null,
      cycle: industry.current_cycle || null,
      rank,
      framework_version: industry.framework_version || 'unknown'
    },
    source_meta: {
      mystic: industry.weight_source || industry.source || 'industry framework',
      financial: 'latest report market breadth and fund flow',
      risk: 'observation-state-v1 risk gate',
      as_of: market.as_of || null,
      proxy: false
    }
  };
}

function proxyEtfState(industry, baseState, proxy) {
  return {
    ...baseState,
    completeness: Math.max(0, baseState.completeness - 5),
    confidence: baseState.completeness >= 80 ? baseState.confidence : '中',
    summary: `${proxy.name}作为${industry.name}的公开 ETF 代理，当前为${baseState.state}。代理表现不等同于申万官方行业指数。`,
    primary_driver: `${industry.name}行业状态；${baseState.primary_driver}`,
    primary_risk: `ETF 代理偏差；${baseState.primary_risk}`,
    factors: { ...baseState.factors, proxy_industry: industry.name, proxy_symbol: proxy.symbol },
    source_meta: {
      ...baseState.source_meta,
      observation: 'industry ETF proxy map',
      proxy: true,
      proxy_for: industry.name,
      symbol: proxy.symbol
    }
  };
}

function genericObservationState(item, market) {
  const alertMap = { red: '高', yellow: '中', green: '低' };
  const risk = alertMap[item.alert_level] || market.risk_level;
  const completeness = item.code ? Math.min(82, market.completeness) : Math.min(55, market.completeness);
  const state = completeness < 45 ? '未覆盖' : risk === '高' ? '降级观察' : '等待确认';
  return {
    state,
    score: null,
    confidence: completeness >= 75 ? '中' : '低',
    risk_level: risk,
    completeness,
    summary: `${item.name}已进入观察池，等待行情、估值、趋势和资金快照完成确认。`,
    primary_driver: item.suggestion || '用户关注',
    primary_risk: item.reason || '深度财务字段尚未完整接入',
    upgrade_condition: '趋势或资金出现新增确认，且数据完整度达到 75% 以上。',
    downgrade_condition: '风险门控升高、趋势转弱或关键数据源失效。',
    invalidation_condition: '原观察逻辑被关键事实否定。',
    factors: {
      mystic_prior: null,
      financial_confirmation: null,
      risk_gate: risk === '高' ? 85 : risk === '中' ? 55 : 25,
      pending: ['估值', '趋势', '资金', '基本面']
    },
    source_meta: {
      observation: item.source || 'watchlist',
      financial: 'pending stock or ETF enrichment',
      as_of: market.as_of || null,
      proxy: false
    }
  };
}

function transitionType(fromState, toState) {
  if (!fromState) return 'entered';
  if (toState === '逻辑失效') return 'invalidated';
  if (toState === '降级观察') return 'downgrade';
  return (STATE_ORDER[toState] || 0) > (STATE_ORDER[fromState] || 0) ? 'upgrade' : 'changed';
}

function upsertObservationItem(item) {
  const code = String(item.code || '').replace(/^(sh|sz)/i, '');
  const type = classifyObjectType(item.name, code, item.object_type);
  const objectKey = item.object_key || `${type}:${code || item.name}`;
  const existing = get('SELECT * FROM observation_items WHERE object_key = ?', [objectKey]);
  if (existing) {
    run(`UPDATE observation_items SET name = ?, code = ?, object_type = ?, source = ?, active = 1,
      updated_at = datetime('now') WHERE id = ?`, [item.name, code || null, type, item.source || existing.source, existing.id]);
    return { ...existing, name: item.name, code: code || null, object_type: type };
  }
  run(`INSERT INTO observation_items (object_key, name, code, object_type, source)
    VALUES (?, ?, ?, ?, ?)`, [objectKey, item.name, code || null, type, item.source || 'system']);
  return get('SELECT * FROM observation_items WHERE id = ?', [getLastInsertRowId()]);
}

function createValidationTasks(itemId, stateId, transitionId, type, condition, reportDate) {
  const horizons = type === 'stock' ? [3, 5, 10, 20] : [1, 3, 5, 10, 20];
  const base = new Date(`${reportDate}T12:00:00Z`);
  horizons.forEach(days => {
    const due = new Date(base);
    due.setUTCDate(due.getUTCDate() + Math.ceil(days * 1.45));
    run(`INSERT OR IGNORE INTO validation_tasks (
      observation_item_id, observation_state_id, transition_id, horizon_days, due_date, condition_text
    ) VALUES (?, ?, ?, ?, ?, ?)`, [itemId, stateId, transitionId, days, due.toISOString().slice(0, 10), condition]);
  });
}

function persistState(item, state, report) {
  const existingForReport = get(`SELECT * FROM observation_states
    WHERE observation_item_id = ? AND report_id = ? AND report_type = ?`, [item.id, report.id, report.report_type]);
  if (existingForReport) return existingForReport;
  const previous = get(`SELECT * FROM observation_states WHERE observation_item_id = ?
    ORDER BY observed_at DESC, id DESC LIMIT 1`, [item.id]);
  run(`INSERT INTO observation_states (
    observation_item_id, report_id, report_date, report_type, state, score, confidence, risk_level,
    completeness, summary, primary_driver, primary_risk, upgrade_condition, downgrade_condition,
    invalidation_condition, factor_snapshot_json, source_meta_json, observed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id, report.id, report.report_date, report.report_type, state.state, state.score, state.confidence,
    state.risk_level, state.completeness, state.summary, state.primary_driver, state.primary_risk,
    state.upgrade_condition, state.downgrade_condition, state.invalidation_condition,
    JSON.stringify(state.factors), JSON.stringify(state.source_meta),
    report.updated_at || report.created_at || new Date().toISOString()
  ]);
  const stateId = getLastInsertRowId();
  if (!previous || previous.state !== state.state) {
    const type = transitionType(previous?.state, state.state);
    const reason = previous
      ? `${previous.state} -> ${state.state}：${state.primary_driver}；风险：${state.primary_risk}`
      : `首次进入观察：${state.primary_driver}`;
    run(`INSERT INTO state_transitions (
      observation_item_id, observation_state_id, from_state, to_state, reason, transition_type, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [item.id, stateId, previous?.state || null, state.state, reason, type,
      report.updated_at || report.created_at || new Date().toISOString()]);
    const transitionId = getLastInsertRowId();
    createValidationTasks(item.id, stateId, transitionId, item.object_type, state.upgrade_condition, report.report_date);
  }
  return get('SELECT * FROM observation_states WHERE id = ?', [stateId]);
}

function latestReport(type) {
  if (type) return get(`SELECT * FROM reports WHERE report_type = ? ORDER BY report_date DESC, created_at DESC LIMIT 1`, [type]);
  return get(`SELECT * FROM reports ORDER BY report_date DESC,
    CASE report_type WHEN 'evening' THEN 3 WHEN 'noon' THEN 2 ELSE 1 END DESC, created_at DESC LIMIT 1`);
}

function syncReportState(reportInput) {
  const report = reportInput?.id ? reportInput : latestReport(reportInput?.report_type);
  if (!report) return null;
  const market = calculateMarketSnapshot(report);
  market.as_of = report.updated_at || report.created_at;
  const industries = parseJson(report.industries_json, []) || [];
  industries.slice(0, 10).forEach((industry, index) => {
    const item = upsertObservationItem({ name: industry.name, object_type: 'industry', source: 'daily-report' });
    const state = industryState(industry, index + 1, market);
    persistState(item, state, report);
    const proxy = getIndustryProxy(industry.name);
    if (proxy) {
      const etf = upsertObservationItem({
        name: proxy.name,
        code: String(proxy.symbol || '').replace(/\.(SH|SZ)$/i, ''),
        object_type: 'etf',
        source: 'industry-proxy-map'
      });
      persistState(etf, proxyEtfState(industry, state, proxy), report);
    }
  });
  const watched = all(`SELECT w.*, 'watchlist' AS source FROM watchlist w ORDER BY w.created_at DESC`);
  watched.forEach(watch => {
    const item = upsertObservationItem(watch);
    persistState(item, genericObservationState(watch, market), report);
  });
  return { report, market };
}

function hydrateState(row) {
  return {
    ...row,
    factors: parseJson(row.factor_snapshot_json, {}),
    source_meta: parseJson(row.source_meta_json, {})
  };
}

function listObservations(filters = {}) {
  const clauses = ['i.active = 1'];
  const params = [];
  if (filters.type && filters.type !== 'all') { clauses.push('i.object_type = ?'); params.push(filters.type); }
  if (filters.state) { clauses.push('s.state = ?'); params.push(filters.state); }
  if (filters.risk) { clauses.push('s.risk_level = ?'); params.push(filters.risk); }
  if (filters.report_id) { clauses.push('s.report_id = ?'); params.push(filters.report_id); }
  const stateSelector = filters.report_id
    ? `SELECT s2.id FROM observation_states s2 WHERE s2.observation_item_id = i.id AND s2.report_id = ?
      ORDER BY s2.observed_at DESC, s2.id DESC LIMIT 1`
    : `SELECT s2.id FROM observation_states s2 WHERE s2.observation_item_id = i.id
      ORDER BY s2.observed_at DESC, s2.id DESC LIMIT 1`;
  const selectorParams = filters.report_id ? [filters.report_id] : [];
  const rows = all(`SELECT i.*, s.id AS state_id, s.report_date, s.report_type, s.state, s.score,
      s.confidence, s.risk_level, s.completeness, s.summary, s.primary_driver, s.primary_risk,
      s.upgrade_condition, s.downgrade_condition, s.invalidation_condition,
      s.factor_snapshot_json, s.source_meta_json, s.observed_at,
      (SELECT COUNT(*) FROM state_transitions t WHERE t.observation_item_id = i.id) AS transition_count,
      (SELECT MIN(due_date) FROM validation_tasks v WHERE v.observation_item_id = i.id AND v.status = 'pending') AS next_review
    FROM observation_items i
    JOIN observation_states s ON s.id = (
      ${stateSelector}
    )
    WHERE ${clauses.join(' AND ')}
    ORDER BY CASE s.state WHEN '重点跟踪' THEN 1 WHEN '条件改善' THEN 2 WHEN '等待确认' THEN 3
      WHEN '初步观察' THEN 4 WHEN '降级观察' THEN 5 WHEN '逻辑失效' THEN 6 ELSE 7 END,
      COALESCE(s.score, -1) DESC, i.updated_at DESC`, selectorParams.concat(params));
  return rows.map(hydrateState);
}

function observationDetail(id) {
  const item = get('SELECT * FROM observation_items WHERE id = ?', [id]);
  if (!item) return null;
  const states = all(`SELECT * FROM observation_states WHERE observation_item_id = ?
    ORDER BY observed_at DESC, id DESC LIMIT 30`, [id]).map(hydrateState);
  const transitions = all(`SELECT * FROM state_transitions WHERE observation_item_id = ?
    ORDER BY occurred_at DESC, id DESC LIMIT 50`, [id]);
  const tasks = all(`SELECT v.*, r.verdict, r.absolute_return, r.benchmark_excess, r.calculated_at
    FROM validation_tasks v LEFT JOIN validation_results r ON r.validation_task_id = v.id
    WHERE v.observation_item_id = ? ORDER BY v.created_at DESC, v.horizon_days`, [id]);
  return { item, current: states[0] || null, history: states, transitions, validation_tasks: tasks };
}

function normalizeMarketSymbol(item) {
  if (item.object_type === 'industry') return getIndustryProxy(item.name)?.symbol || null;
  const digits = String(item.code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  return `${digits}.${digits.startsWith('5') || digits.startsWith('6') ? 'SH' : 'SZ'}`;
}

function calculateReturn(entry, exit) {
  if (!entry || !exit || !finite(entry.close) || !finite(exit.close) || Number(entry.close) === 0) return null;
  return ((Number(exit.close) / Number(entry.close)) - 1) * 100;
}

function calculateDueValidations() {
  const tasks = all(`SELECT v.*, i.name, i.code, i.object_type, s.report_date, s.state, s.risk_level
    FROM validation_tasks v
    JOIN observation_items i ON i.id = v.observation_item_id
    JOIN observation_states s ON s.id = v.observation_state_id
    WHERE v.status = 'pending' AND v.due_date <= date('now') ORDER BY v.id`);
  let completed = 0;
  let insufficient = 0;
  const details = [];
  tasks.forEach(task => {
    const symbol = normalizeMarketSymbol(task);
    if (!symbol) { insufficient += 1; return; }
    const bars = all(`SELECT trade_date, open, high, low, close FROM historical_daily_bars
      WHERE symbol = ? AND trade_date > ?
      ORDER BY CASE provider WHEN 'tushare' THEN 1 ELSE 2 END, trade_date`, [symbol, task.report_date]);
    const byDate = new Map();
    bars.forEach(bar => { if (!byDate.has(bar.trade_date)) byDate.set(bar.trade_date, bar); });
    const series = [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    if (series.length < task.horizon_days) { insufficient += 1; return; }
    const entry = series[0];
    const exit = series[task.horizon_days - 1];
    const benchmarkRows = all(`SELECT trade_date, open, high, low, close FROM historical_daily_bars
      WHERE symbol = '000300.SH' AND trade_date >= ? AND trade_date <= ?
      ORDER BY CASE provider WHEN 'tushare' THEN 1 ELSE 2 END, trade_date`, [entry.trade_date, exit.trade_date]);
    const benchmarkByDate = new Map();
    benchmarkRows.forEach(bar => { if (!benchmarkByDate.has(bar.trade_date)) benchmarkByDate.set(bar.trade_date, bar); });
    const benchmark = [...benchmarkByDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const absoluteReturn = calculateReturn(entry, exit);
    const benchmarkReturn = benchmark.length >= 2 ? calculateReturn(benchmark[0], benchmark[benchmark.length - 1]) : null;
    const benchmarkExcess = absoluteReturn !== null && benchmarkReturn !== null ? absoluteReturn - benchmarkReturn : null;
    const highs = series.slice(0, task.horizon_days).map(bar => finite(bar.high)).filter(value => value !== null);
    const lows = series.slice(0, task.horizon_days).map(bar => finite(bar.low)).filter(value => value !== null);
    const maxFavorable = highs.length ? ((Math.max(...highs) / Number(entry.close)) - 1) * 100 : null;
    const maxAdverse = lows.length ? ((Math.min(...lows) / Number(entry.close)) - 1) * 100 : null;
    const verdict = benchmarkExcess === null
      ? '数据不足'
      : benchmarkExcess > 0.5 ? '命中' : benchmarkExcess > -0.5 ? '部分命中' : '未命中';
    const riskTriggeredFirst = maxAdverse !== null && maxFavorable !== null && Math.abs(Math.min(0, maxAdverse)) > Math.max(0, maxFavorable);
    run(`INSERT OR REPLACE INTO validation_results (
      validation_task_id, absolute_return, benchmark_excess, relative_excess, max_favorable,
      max_adverse, condition_triggered, risk_triggered_first, verdict, result_json, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
      task.id, absoluteReturn, benchmarkExcess, null, maxFavorable, maxAdverse,
      benchmarkExcess !== null && benchmarkExcess > 0 ? 1 : 0, riskTriggeredFirst ? 1 : 0, verdict,
      JSON.stringify({ symbol, entry_date: entry.trade_date, exit_date: exit.trade_date,
        entry_price: entry.close, exit_price: exit.close, benchmark_return: benchmarkReturn,
        execution_rule: '冻结日后首个本地可用交易日收盘价作为代理执行口径' })
    ]);
    run("UPDATE validation_tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [task.id]);
    completed += 1;
    details.push({ task_id: task.id, name: task.name, symbol, horizon_days: task.horizon_days, verdict });
  });
  return { scanned: tasks.length, completed, insufficient, details };
}

function mean(values) {
  const clean = values.map(finite).filter(value => value !== null);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function buildFactorAttribution(runId, horizon = 5) {
  const run = runId
    ? get('SELECT * FROM backtest_runs WHERE id = ?', [runId])
    : get('SELECT * FROM backtest_runs ORDER BY id DESC LIMIT 1');
  if (!run) return { available: false, reason: '暂无行业回测运行' };
  const signals = all(`SELECT s.signal_date, s.industry, s.factor_score, s.signal_json,
      r.return_pct, r.benchmark_return_pct, r.excess_return_pct
    FROM backtest_signals s
    JOIN backtest_returns r ON r.run_id = s.run_id AND r.signal_date = s.signal_date
      AND r.industry = s.industry AND r.horizon_days = ? AND COALESCE(r.top_n, 5) = 5
    WHERE s.run_id = ?`, [horizon, run.id]);
  if (!signals.length) return { available: false, reason: '所选持有期暂无可比收益', run_id: run.id };
  const dates = new Map();
  signals.forEach(row => {
    const signal = parseJson(row.signal_json, {}) || {};
    const marketAdjustment = finite(signal.market_adjustment) || 0;
    const pressure = signal.pressure_test?.level === 'elevated' ? 1 : 0;
    const record = {
      ...row,
      financial: marketAdjustment,
      mystic: (finite(row.factor_score) || 0) - marketAdjustment * 100,
      combined: finite(row.factor_score) || 0,
      gated: (finite(row.factor_score) || 0) - pressure * 25
    };
    if (!dates.has(row.signal_date)) dates.set(row.signal_date, []);
    dates.get(row.signal_date).push(record);
  });
  const candidateCounts = [...dates.values()].map(rows => rows.length);
  const maxCandidates = candidateCounts.length ? Math.max(...candidateCounts) : 0;
  const averageCandidates = mean(candidateCounts) || 0;
  if (maxCandidates <= 5) {
    const metrics = parseJson(run.metrics_json, {}) || {};
    const legacy = metrics.metrics?.[`top5_h${horizon}`] || null;
    const unavailable = reason => ({ available: false, reason, signal_days: dates.size, samples: 0,
      avg_return_pct: null, avg_benchmark_return_pct: null, avg_excess_return_pct: null,
      positive_excess_rate: null });
    return {
      available: true,
      comparable: false,
      status: 'candidate_universe_incomplete',
      run_id: run.id,
      framework_version: run.framework_version,
      period: { start: run.start_date, end: run.end_date },
      horizon_days: horizon,
      methodology: `运行 #${run.id} 每个信号日最多仅保存 ${maxCandidates} 个候选（平均 ${averageCandidates.toFixed(1)} 个），缺少全行业候选全集，不能事后重排生成 A-E。以下缺失项是明确的数据边界，不以相同 Top5 结果冒充因子消融。`,
      groups: {
        A: { label: '随机 Top5 / 全行业等权', ...unavailable('缺少每日全行业收益与随机基线冻结') },
        B: { label: '纯金融模型', ...unavailable('未冻结纯金融模型的全行业评分') },
        C: { label: '纯五行模型', ...unavailable('未冻结纯五行模型的全行业独立评分') },
        D: { label: '五行 + 金融确认', ...unavailable('现有 Top5 已经过筛，无法还原无风险门控排序') },
        E: {
          label: '现有完整模型',
          available: Boolean(legacy),
          reason: legacy ? null : '回测运行缺少对应 Top5 指标',
          signal_days: metrics.signal_days || dates.size,
          samples: legacy?.samples || signals.length,
          avg_return_pct: legacy?.avg_return_pct ?? null,
          avg_benchmark_return_pct: legacy?.avg_benchmark_return_pct ?? null,
          avg_excess_return_pct: legacy?.avg_excess_return_pct ?? null,
          positive_excess_rate: legacy?.hit_rate_vs_benchmark ?? null
        }
      },
      required_next_run: '回测时为每个交易日冻结31个行业的 A-E 独立分数与收益，再做同日横截面重排。'
    };
  }
  const groups = {
    A: { label: '全行业等权基线', selector: rows => rows },
    B: { label: '纯金融确认', selector: rows => [...rows].sort((a, b) => b.financial - a.financial).slice(0, 5) },
    C: { label: '纯五行先验', selector: rows => [...rows].sort((a, b) => b.mystic - a.mystic).slice(0, 5) },
    D: { label: '五行 + 金融确认', selector: rows => [...rows].sort((a, b) => b.combined - a.combined).slice(0, 5) },
    E: { label: '完整模型 + 风险门控', selector: rows => [...rows].sort((a, b) => b.gated - a.gated).slice(0, 5) }
  };
  const output = {};
  Object.entries(groups).forEach(([key, group]) => {
    const daily = [];
    dates.forEach(rows => {
      const selected = group.selector(rows);
      daily.push({
        return_pct: mean(selected.map(row => row.return_pct)),
        benchmark_return_pct: mean(selected.map(row => row.benchmark_return_pct)),
        excess_return_pct: mean(selected.map(row => row.excess_return_pct))
      });
    });
    output[key] = {
      label: group.label,
      signal_days: daily.length,
      samples: key === 'A' ? signals.length : daily.length * 5,
      avg_return_pct: mean(daily.map(item => item.return_pct)),
      avg_benchmark_return_pct: mean(daily.map(item => item.benchmark_return_pct)),
      avg_excess_return_pct: mean(daily.map(item => item.excess_return_pct)),
      positive_excess_rate: daily.length
        ? daily.filter(item => finite(item.excess_return_pct) > 0).length / daily.length
        : null
    };
  });
  return {
    available: true,
    run_id: run.id,
    framework_version: run.framework_version,
    period: { start: run.start_date, end: run.end_date },
    horizon_days: horizon,
    methodology: '使用同一回测运行的冻结信号字段重新排序；A为全行业等权，B按market_adjustment，C剔除market_adjustment，D按factor_score，E对elevated风险扣分。属于可审计探索性消融，不替代独立生产回测。',
    comparable: true,
    groups: output
  };
}

function periodBounds(periodType, now = new Date()) {
  const date = new Date(now);
  if (periodType === 'month') {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { key: start.toISOString().slice(0, 7), start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  const day = date.getUTCDay() || 7;
  const start = new Date(date); start.setUTCDate(date.getUTCDate() - day + 1);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  return { key: start.toISOString().slice(0, 10), start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function buildValidationReport(periodType = 'week', now = new Date()) {
  const bounds = periodBounds(periodType, now);
  const transitions = all(`SELECT t.*, i.name, i.object_type FROM state_transitions t
    JOIN observation_items i ON i.id = t.observation_item_id
    WHERE date(t.occurred_at) BETWEEN ? AND ? ORDER BY t.occurred_at`, [bounds.start, bounds.end]);
  const results = all(`SELECT r.*, v.horizon_days, i.name, i.object_type FROM validation_results r
    JOIN validation_tasks v ON v.id = r.validation_task_id
    JOIN observation_items i ON i.id = v.observation_item_id
    WHERE date(r.calculated_at) BETWEEN ? AND ? ORDER BY r.calculated_at`, [bounds.start, bounds.end]);
  const pending = get(`SELECT COUNT(*) count FROM validation_tasks WHERE status = 'pending' AND due_date <= ?`, [bounds.end])?.count || 0;
  const attribution = buildFactorAttribution(null, 5);
  const full = attribution.groups?.E;
  const financial = attribution.groups?.B;
  let evidenceLevel = '数据不足';
  if (results.length >= 20 && attribution.comparable && full && financial) {
    const delta = (full.avg_excess_return_pct || 0) - (financial.avg_excess_return_pct || 0);
    evidenceLevel = delta > 0.1 ? '弱正向' : delta < -0.1 ? '暂无增量' : '中性';
  }
  const sortedResults = [...results].sort((a, b) => (b.benchmark_excess || -999) - (a.benchmark_excess || -999));
  const payload = {
    period_type: periodType,
    period_key: bounds.key,
    period: bounds,
    algorithm_version: 'observation-state-v1',
    evidence_level: evidenceLevel,
    market_environment: get(`SELECT state, risk_level, report_date, report_type FROM observation_states
      WHERE report_date BETWEEN ? AND ? ORDER BY observed_at DESC LIMIT 1`, [bounds.start, bounds.end]) || null,
    independent_events: {
      total: transitions.length,
      entered: transitions.filter(item => item.transition_type === 'entered').length,
      upgrades: transitions.filter(item => item.transition_type === 'upgrade').length,
      downgrades: transitions.filter(item => item.transition_type === 'downgrade').length,
      invalidated: transitions.filter(item => item.transition_type === 'invalidated').length
    },
    forward_validation: {
      completed: results.length,
      pending_due: pending,
      avg_absolute_return: mean(results.map(item => item.absolute_return)),
      avg_benchmark_excess: mean(results.map(item => item.benchmark_excess)),
      verdicts: {
        hit: results.filter(item => item.verdict === '命中').length,
        partial: results.filter(item => item.verdict === '部分命中').length,
        missed: results.filter(item => item.verdict === '未命中').length,
        insufficient: results.filter(item => item.verdict === '数据不足').length
      },
      best_case: sortedResults[0] || null,
      worst_case: sortedResults[sortedResults.length - 1] || null
    },
    historical_attribution: attribution,
    limitations: [
      results.length < 20 ? '本期前向到期样本少于20，不评价线上有效性。' : null,
      'A-E为现有冻结信号字段的探索性重排；正式结论仍需独立生产回测、滚动样本外和非重叠持有期。',
      !attribution.comparable ? '当前历史回测只冻结Top5，A-E候选全集不足，禁止比较五行增量。' : null,
      '当前财务深度字段未完整接入，个股估值与基本面归因不完整。'
    ].filter(Boolean),
    recommendations: [
      pending > 0 ? '优先补齐已到期但数据不足的验证任务。' : '继续积累不可覆盖的前向验证样本。',
      '建立独立的A-E生产回测，补齐滚动样本外、非重叠持有期和成本后结果。',
      '续期或替换盘后数据源，避免前向结果因行情缺口延迟。'
    ]
  };
  run(`INSERT INTO validation_reports (period_type, period_key, algorithm_version, evidence_level, payload_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(period_type, period_key, algorithm_version) DO UPDATE SET
      evidence_level = excluded.evidence_level, payload_json = excluded.payload_json,
      generated_at = datetime('now')`, [periodType, bounds.key, payload.algorithm_version, evidenceLevel, JSON.stringify(payload)]);
  const report = get(`SELECT * FROM validation_reports WHERE period_type = ? AND period_key = ? AND algorithm_version = ?`,
    [periodType, bounds.key, payload.algorithm_version]);
  const suggestionRows = [
    {
      issue: pending > 0 ? '到期验证任务仍有数据缺口' : '前向独立样本仍不足',
      evidence: `completed=${results.length}; pending_due=${pending}`,
      module: 'forward-validation',
      priority: pending > 0 ? 'P0' : 'P1',
      review_window: periodType === 'week' ? 'next-week' : 'next-month'
    },
    {
      issue: 'A-E候选全集与样本外对照未冻结',
      evidence: attribution.required_next_run || attribution.reason || 'candidate_universe_incomplete',
      module: 'factor-attribution',
      priority: 'P0',
      review_window: 'next-backtest-run'
    },
    {
      issue: '盘后历史行情源需要稳定性治理',
      evidence: '前向验证依赖连续的交易日收盘行情',
      module: 'data-source',
      priority: 'P1',
      review_window: 'next-month'
    }
  ];
  if (report?.id) {
    for (const suggestion of suggestionRows) {
      run(`INSERT OR IGNORE INTO optimization_suggestions (
        validation_report_id, issue, evidence, module, priority, review_window
      ) VALUES (?, ?, ?, ?, ?, ?)`, [
        report.id, suggestion.issue, suggestion.evidence, suggestion.module,
        suggestion.priority, suggestion.review_window
      ]);
    }
  }
  return { ...payload, id: report?.id, generated_at: report?.generated_at };
}

function overview(type) {
  const synced = syncReportState({ report_type: type });
  if (!synced) return null;
  const observations = listObservations({ report_id: synced.report.id });
  const top = observations.filter(item => item.object_type === 'industry').slice(0, 5);
  const previous = all(`SELECT report_date, report_type, conclusion, recommended_industries_json, updated_at
    FROM decision_logs ORDER BY report_date DESC, updated_at DESC LIMIT 2`);
  const previousNames = parseJson(previous[1]?.recommended_industries_json, [])?.slice(0, 3).map(item => item.name) || [];
  const topNames = top.slice(0, 3).map(item => item.name);
  const changes = [];
  topNames.filter(name => !previousNames.includes(name)).forEach(name => changes.push({ type: 'entered', text: `${name}进入 Top3` }));
  observations.filter(item => item.state === '降级观察').slice(0, 3)
    .forEach(item => changes.push({ type: 'downgrade', text: `${item.name}被风险门控降级` }));
  const tasks = all(`SELECT v.*, i.name, i.object_type FROM validation_tasks v
    JOIN observation_items i ON i.id = v.observation_item_id
    WHERE v.status = 'pending' ORDER BY v.due_date, v.horizon_days LIMIT 8`);
  const transitions = all(`SELECT t.*, i.name, i.object_type FROM state_transitions t
    JOIN observation_items i ON i.id = t.observation_item_id
    ORDER BY t.occurred_at DESC, t.id DESC LIMIT 8`);
  return {
    report: {
      id: synced.report.id,
      date: synced.report.report_date,
      type: synced.report.report_type,
      type_label: reportTypeLabel(synced.report.report_type),
      time: synced.report.report_time || null,
      updated_at: synced.report.updated_at || synced.report.created_at
    },
    market: synced.market,
    top_directions: top,
    changes: changes.length ? changes.slice(0, 5) : [{ type: 'stable', text: '相对上一时点暂无新的关键变化' }],
    pending_validations: tasks,
    recent_transitions: transitions,
    observation_count: observations.length,
    model: { version: 'observation-state-v1', scoring_role: '排序', state_role: '门槛与风险共同决定' }
  };
}

module.exports = {
  calculateMarketSnapshot,
  classifyObjectType,
  industryState,
  genericObservationState,
  upsertObservationItem,
  persistState,
  syncReportState,
  listObservations,
  observationDetail,
  calculateDueValidations,
  buildFactorAttribution,
  buildValidationReport,
  overview,
  parseJson
};

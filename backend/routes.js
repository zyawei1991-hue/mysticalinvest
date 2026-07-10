const express = require('express');
const { run, get, all, getLastInsertRowId } = require('./database');
const { getBaZi, countFiveElements, checkRelationship, getRecommendedIndustries, calculateTenGods, analyzeMarketStrength, getMarketFavors, getEnhancedIndustries, generateBaZiInterpretation, getJianchu, getChongSha, getZiweiSihua, calculateDayRating, getLuckyDirection, getAstockBriefing } = require('./bazi');
const { getStockQuote, fetchQuote, getStockTrend } = require('./market');
const { getProviderStatus } = require('./historicalDataProvider');
const { loadKnowledgeBase, searchKnowledgeBase } = require('./knowledgeBase');
const { callLLM } = require('./llm');
const {
  buildIntegratedStockAnalysis,
  normalizeStockQuery,
  resolveStockIndustryWithCache
} = require('./stockInsightFramework');

const router = express.Router();

function stringifyJson(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function truncateText(value, maxLength = 1200) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

function compactJson(value, maxLength = 1600) {
  if (value === undefined || value === null) return '';
  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch (e) {
    return truncateText(String(value), maxLength);
  }
}

async function resolveAndCacheStockIndustryFromInput(name, code) {
  const query = normalizeStockQuery(String(code || name || '').trim());
  if (!query) return null;
  try {
    const quote = await getStockQuote(query);
    const industry = await resolveStockIndustryWithCache(quote, name || code || query);
    return { quote, industry };
  } catch (error) {
    console.warn('标的行业自动识别失败:', error.message);
    return null;
  }
}

function normalizeReportQuoteCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(lower)) return lower;
  const digits = raw.replace(/\D/g, '');
  if (!/^\d{6}$/.test(digits)) return '';
  return (digits.startsWith('5') || digits.startsWith('6') ? 'sh' : 'sz') + digits;
}

function stripMarketPrefix(code) {
  return String(code || '').replace(/^(sh|sz)/i, '');
}

async function fetchReportQuoteSnapshots(items) {
  const codes = [];
  (items || []).forEach(item => {
    const quoteCode = normalizeReportQuoteCode(item && item.code);
    if (quoteCode) codes.push(quoteCode);
  });
  const uniqueCodes = Array.from(new Set(codes));
  if (!uniqueCodes.length) return {};
  try {
    const quotes = await fetchQuote(uniqueCodes);
    const asOf = new Date().toISOString();
    const snapshots = {};
    uniqueCodes.forEach(code => {
      const quote = quotes[code];
      if (!quote) return;
      snapshots[code] = {
        price: Number.isFinite(Number(quote.last)) ? Number(quote.last) : null,
        changePercent: Number.isFinite(Number(quote.changePercent)) ? Number(quote.changePercent) : null,
        asOf,
        source: 'Tencent quote API'
      };
    });
    return snapshots;
  } catch (error) {
    console.warn('生成日报标的行情快照失败:', error.message);
    return {};
  }
}

async function freezeReportStockSnapshots(stocks, industriesJson) {
  const normalizedStocks = Array.isArray(stocks) ? stocks.map(item => ({ ...item })) : [];
  const industries = parseJsonMaybe(industriesJson);
  const normalizedIndustries = Array.isArray(industries)
    ? industries.map(industry => ({
        ...industry,
        stocks: Array.isArray(industry.stocks) ? industry.stocks.map(stock => ({ ...stock })) : industry.stocks
      }))
    : industries;

  const quoteItems = normalizedStocks.slice();
  if (Array.isArray(normalizedIndustries)) {
    normalizedIndustries.forEach(industry => {
      if (Array.isArray(industry.stocks)) quoteItems.push(...industry.stocks);
    });
  }
  const snapshots = await fetchReportQuoteSnapshots(quoteItems);
  const applySnapshot = stock => {
    if (!stock || !stock.code) return stock;
    const quoteCode = normalizeReportQuoteCode(stock.code);
    const snapshot = snapshots[quoteCode];
    if (!snapshot) return stock;
    stock.snapshot_price = stock.snapshot_price ?? snapshot.price;
    stock.snapshot_change_percent = stock.snapshot_change_percent ?? snapshot.changePercent;
    stock.snapshot_as_of = stock.snapshot_as_of || snapshot.asOf;
    stock.snapshot_source = stock.snapshot_source || snapshot.source;
    if (stock.last === undefined || stock.last === null) stock.last = snapshot.price;
    if (stock.changePercent === undefined || stock.changePercent === null) stock.changePercent = snapshot.changePercent;
    stock.quote_as_of = stock.quote_as_of || snapshot.asOf;
    stock.quote_source = stock.quote_source || snapshot.source;
    stock.code = stripMarketPrefix(stock.code);
    return stock;
  };

  normalizedStocks.forEach(applySnapshot);
  if (Array.isArray(normalizedIndustries)) {
    normalizedIndustries.forEach(industry => {
      if (Array.isArray(industry.stocks)) industry.stocks.forEach(applySnapshot);
    });
  }

  return {
    stocks: normalizedStocks,
    industriesJson: normalizedIndustries ? stringifyJson(normalizedIndustries) : industriesJson
  };
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatAssistantPercent(value) {
  const number = toFiniteNumber(value);
  return number === null ? '未返回' : `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatAssistantYi(value) {
  const number = toFiniteNumber(value);
  if (number === null) return '未返回';
  const yi = Math.abs(number) > 1000000 ? number / 100000000 : number;
  return `${yi >= 0 ? '+' : ''}${yi.toFixed(2)}亿`;
}

function getAssistantBreadthBalancePct(marketBreadth) {
  if (!marketBreadth) return null;
  const up = toFiniteNumber(marketBreadth.up) || 0;
  const down = toFiniteNumber(marketBreadth.down) || 0;
  const flat = toFiniteNumber(marketBreadth.flat) || 0;
  const total = toFiniteNumber(marketBreadth.total) || up + down + flat;
  if (!total) return null;
  return ((up - down) / total) * 100;
}

function buildAssistantPageSummary(latestReport) {
  if (!latestReport) return null;
  const momentum = latestReport.market_momentum || {};
  const turnover = momentum.turnover || {};
  const marketBreadth = latestReport.market_breadth || {};
  const operationAdvice = latestReport.operation_advice || {};
  const turnoverRate = toFiniteNumber(turnover.marketRate);
  const breadthBalance = getAssistantBreadthBalancePct(marketBreadth);
  const mainFlow = toFiniteNumber(momentum.mainForce && momentum.mainForce.netInflow);
  const etfFlow = toFiniteNumber(momentum.etfFlow && momentum.etfFlow.netInflow);
  const weakBreadth = breadthBalance !== null && breadthBalance < -8;
  const strongBreadth = breadthBalance !== null && breadthBalance > 8;
  const highTurnover = turnoverRate !== null && turnoverRate >= 3;
  const lowTurnover = turnoverRate !== null && turnoverRate < 1.5;
  const mainOutflow = mainFlow !== null && mainFlow < 0;
  const mainInflow = mainFlow !== null && mainFlow > 0;
  const etfInflow = etfFlow !== null && etfFlow > 0;

  let volumeTitle = '量能等待确认';
  let volumeMeaning = '当前量能数据不足或方向不清，暂不把量能作为加仓依据。';
  let volumeAction = '保持观察，等成交活跃度、宽度和主力资金同时改善。';

  if (lowTurnover) {
    volumeTitle = '缩量观察';
    volumeMeaning = '全市场换手偏低，成交活跃度不足。';
    volumeAction = '不追涨，只看回踩后能否放量。';
  } else if (highTurnover && weakBreadth && mainOutflow) {
    volumeTitle = '放量分歧，承接偏弱';
    volumeMeaning = '换手率较高，但上涨家数明显少于下跌家数，且主力资金净流出，说明量能来自分歧和换手，不是顺畅进攻。';
    volumeAction = '不扩大仓位；候选行业只做观察，等宽度修复或主力流出收敛。';
  } else if (highTurnover && strongBreadth && mainInflow) {
    volumeTitle = '量价配合较好';
    volumeMeaning = '换手活跃，市场宽度和主力资金同步改善，量能对进攻方向有支持。';
    volumeAction = '可按仓位纪律跟踪强势行业延续性，但仍不追首波拉升。';
  } else if (highTurnover && etfInflow && !mainInflow) {
    volumeTitle = '指数资金托底，个股承接一般';
    volumeMeaning = '换手活跃且 ETF 有净流入，但主力资金没有同步转强。';
    volumeAction = '优先看 ETF 和行业龙头，不把小票冲高当作普涨确认。';
  } else if (highTurnover) {
    volumeTitle = '有量，但方向未完全确认';
    volumeMeaning = '全市场换手活跃，但还需要结合宽度和资金方向判断。';
    volumeAction = '只提高观察优先级，不单独因为有量就加仓。';
  }

  const up = toFiniteNumber(marketBreadth.up);
  const down = toFiniteNumber(marketBreadth.down);
  const riskValue = volumeTitle === '放量分歧，承接偏弱' || mainOutflow
    ? '最高只观察'
    : weakBreadth
      ? '等确认'
      : '正常排序';

  return {
    visible_view: '通用版日报',
    report_date: latestReport.report_date,
    report_type: latestReport.report_type,
    action: {
      stance: operationAdvice.stance || null,
      position: operationAdvice.position || null,
      rhythm: operationAdvice.rhythm || null,
      summary: operationAdvice.summary || latestReport.card_summary || null
    },
    visible_cards: {
      market: {
        label: weakBreadth ? '市场偏弱' : '市场中性',
        value: up !== null && down !== null ? `上涨${up}家 / 下跌${down}家` : '宽度数据未返回',
        meaning: weakBreadth ? '上涨家数明显少于下跌家数，先保护仓位。' : '宽度没有强风险触发。'
      },
      volume: {
        label: volumeTitle,
        value: formatAssistantPercent(turnoverRate),
        unit: '全市场换手率/量能百分比，不是资金金额',
        meaning: volumeMeaning,
        action: volumeAction
      },
      risk_gate: {
        label: '风险门控',
        value: riskValue,
        meaning: '资金、宽度、量能或指数触发风险时，行业候选只能先观察，不能直接升级为加仓信号。'
      }
    },
    raw_metrics: {
      turnover_rate_percent: turnoverRate,
      breadth_balance_percent: breadthBalance,
      main_force_flow_yi: mainFlow === null ? null : mainFlow / 100000000,
      etf_flow_yi: etfFlow === null ? null : etfFlow / 100000000,
      main_force_flow_text: formatAssistantYi(mainFlow),
      etf_flow_text: formatAssistantYi(etfFlow)
    },
    number_explainers: [
      turnoverRate === null ? null : `页面中的“${formatAssistantPercent(turnoverRate)}”指全市场换手率/量能状态，单位是%，不是主力资金或 ETF 资金的“亿”。`,
      `主力资金字段当前为${formatAssistantYi(mainFlow)}，ETF资金字段当前为${formatAssistantYi(etfFlow)}。`
    ].filter(Boolean)
  };
}

function getLatestAssistantContext(options = {}) {
  const reportType = String(options.report_type || '').trim();
  const reportDate = String(options.report_date || '').trim();
  const selectFields = `report_date, report_type, hs300_change, sh_change, sz_change, cy_change,
    card_summary, industries_json, operation_advice_json, key_variables_json,
    market_momentum_json, market_breadth_json, risk_warning`;
  let report = null;
  if (reportDate && reportType) {
    report = get(`SELECT ${selectFields} FROM reports WHERE report_date = ? AND report_type = ?
      ORDER BY created_at DESC LIMIT 1`, [reportDate, reportType]);
  }
  if (!report && reportType) {
    report = get(`SELECT ${selectFields} FROM reports WHERE report_type = ?
      ORDER BY report_date DESC, created_at DESC LIMIT 1`, [reportType]);
  }
  if (!report) {
    report = get(`SELECT ${selectFields} FROM reports ORDER BY report_date DESC, created_at DESC LIMIT 1`);
  }
  const decisions = all(`SELECT report_date, report_type, conclusion, recommended_industries_json,
    risk_scenario FROM decision_logs ORDER BY report_date DESC, updated_at DESC LIMIT 5`);
  const watchlist = all('SELECT name, code, alert_level FROM watchlist ORDER BY created_at DESC LIMIT 20');
  const latestReport = report ? {
    report_date: report.report_date,
    report_type: report.report_type,
    hs300_change: report.hs300_change,
    sh_change: report.sh_change,
    sz_change: report.sz_change,
    cy_change: report.cy_change,
    card_summary: report.card_summary,
    industries: parseJsonMaybe(report.industries_json),
    operation_advice: parseJsonMaybe(report.operation_advice_json),
    key_variables: parseJsonMaybe(report.key_variables_json),
    market_momentum: parseJsonMaybe(report.market_momentum_json),
    market_breadth: parseJsonMaybe(report.market_breadth_json),
    risk_warning: report.risk_warning
  } : null;
  return {
    requested_page: {
      report_date: reportDate || null,
      report_type: reportType || null,
      presentation_mode: options.presentation_mode || null
    },
    latest_report: latestReport,
    visible_report_summary: buildAssistantPageSummary(latestReport),
    recent_decisions: decisions.map(item => ({
      ...item,
      recommended_industries: parseJsonMaybe(item.recommended_industries_json)
    })),
    watchlist
  };
}

function buildAssistantPrompt(message, history, kbItems, context) {
  const kbText = (kbItems || []).map((item, index) => [
    `#${index + 1} ${item.title || item.id || '知识条目'}`,
    item.summary ? `摘要：${item.summary}` : '',
    item.daily_use ? `日常用法：${item.daily_use}` : '',
    item.forbidden_use ? `禁用边界：${item.forbidden_use}` : '',
    item.content ? `内容：${truncateText(item.content, 800)}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');

  const dialogue = (history || []).slice(-8).map(item => {
    const role = item.role === 'assistant' ? '助手' : '用户';
    return `${role}：${truncateText(item.content, 400)}`;
  }).join('\n');

  return [
    '你是“五行投资日报”项目内置 AI 助手，模型由 caolele 兼容接口提供。',
    '你的任务：基于项目日报、知识库、关注标的和用户对话，帮助用户解释日报、复盘模型、查询项目知识、生成观察清单。',
    '约束：不要编造实时行情；涉及个股时提醒这是观察和复盘，不构成买卖建议；遇到数据缺失要明确说缺失；不要输出 token、key、webhook、私有 Base 链接。',
    '如果用户问页面上看到的数字，优先使用 visible_report_summary 和 key_variables 中的原始字段、单位和解释；不要把“%”口径的量能/换手率误解成“亿”口径的资金流。',
    '回答风格：中文，短而具体，优先给结论和可执行下一步。',
    '',
    '【最近对话】',
    dialogue || '无',
    '',
    '【项目上下文】',
    compactJson(context, 5200),
    '',
    '【知识库命中】',
    kbText || '无命中知识条目',
    '',
    '【用户问题】',
    message
  ].join('\n');
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractConclusion(operationAdvice, fiveElements) {
  if (operationAdvice && operationAdvice.summary) return operationAdvice.summary;
  if (operationAdvice && (operationAdvice.stance || operationAdvice.position || operationAdvice.rhythm)) {
    return ['结论：' + (operationAdvice.stance || '观察'), operationAdvice.position, operationAdvice.rhythm]
      .filter(Boolean)
      .join('；');
  }
  const line = String(fiveElements || '').split('\n').find(item => item.startsWith('结论：'));
  return line || null;
}

function upsertDecisionLog(reportId, payload) {
  if (!reportId) return;
  const industries = normalizeArray(parseJsonMaybe(payload.industries_json));
  const operationAdvice = parseJsonMaybe(payload.operation_advice_json);
  const keyVariables = parseJsonMaybe(payload.key_variables_json);
  const marketResult = {
    hs300_change: payload.hs300_change,
    sh_change: payload.sh_change,
    sz_change: payload.sz_change,
    cy_change: payload.cy_change,
    market_breadth: parseJsonMaybe(payload.market_breadth_json),
    limit_stocks: parseJsonMaybe(payload.limit_stocks_json),
    market_momentum: parseJsonMaybe(payload.market_momentum_json)
  };
  const existing = get('SELECT id FROM decision_logs WHERE report_id = ?', [reportId]);
  const values = [
    payload.report_date,
    payload.report_type,
    extractConclusion(operationAdvice, payload.five_elements),
    JSON.stringify(industries.slice(0, 8)),
    payload.key_variables_json,
    JSON.stringify(marketResult),
    payload.risk_warning || (operationAdvice && operationAdvice.risk) || null
  ];
  if (existing) {
    run(`UPDATE decision_logs SET
      report_date = ?, report_type = ?, conclusion = ?, recommended_industries_json = ?,
      key_variables_json = ?, market_result_json = ?, risk_scenario = ?, updated_at = datetime('now')
      WHERE report_id = ?`, values.concat(reportId));
  } else {
    run(`INSERT INTO decision_logs (
      report_date, report_type, conclusion, recommended_industries_json,
      key_variables_json, market_result_json, risk_scenario, report_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values.concat(reportId));
  }
}

// 获取所有日报列表（分页）
router.get('/reports', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  const rows = all('SELECT * FROM reports ORDER BY report_date DESC LIMIT ? OFFSET ?', [pageSize, offset]);
  const totalRow = get('SELECT COUNT(*) as total FROM reports');
  const total = totalRow ? totalRow.total : 0;

  const watchlistCountRow = get('SELECT COUNT(*) as count FROM watchlist');
  const watchlistCount = watchlistCountRow ? watchlistCountRow.count : 0;
  const rowsWithCount = rows.map(row => ({
    ...row,
    holding_count: watchlistCount
  }));

  res.json({
    data: rowsWithCount,
    total,
    page,
    pageSize
  });
});

// 获取指定日期的日报详情
router.get('/reports/:date', async (req, res) => {
  const reportDate = req.params.date;
  const reportType = req.query.type;

  let report;
  if (reportType) {
    report = get('SELECT * FROM reports WHERE report_date = ? AND report_type = ?', [reportDate, reportType]);
  } else {
    report = get('SELECT * FROM reports WHERE report_date = ? ORDER BY created_at DESC LIMIT 1', [reportDate]);
  }

  if (!report) {
    return res.status(404).json({ error: '未找到该日期的日报' });
  }

  const stocks = getReportStocks(report.id);
  const analysis = get('SELECT * FROM analysis WHERE report_id = ?', [report.id]);

  const response = await buildReportResponse(report, stocks, analysis);
  res.json(response);
});

// 获取最新日报
router.get('/latest', async (req, res) => {
  const reportType = req.query.type || 'morning';
  const report = get('SELECT * FROM reports WHERE report_type = ? ORDER BY report_date DESC, created_at DESC LIMIT 1', [reportType]);

  if (!report) {
    return res.status(404).json({ error: `暂无${reportType}版日报数据` });
  }

  const stocks = getReportStocks(report.id);
  const analysis = get('SELECT * FROM analysis WHERE report_id = ?', [report.id]);
  const response = await buildReportResponse(report, stocks, analysis);
  res.json(response);
});

// 获取统计信息
router.get('/stats', (req, res) => {
  const totalRow = get('SELECT COUNT(*) as total FROM reports');
  res.json({ total_reports: totalRow ? totalRow.total : 0 });
});

router.get('/knowledge-base', (req, res) => {
  const hasFilters = req.query.q || req.query.domain || req.query.usable_for || req.query.status || req.query.limit;
  const payload = hasFilters
    ? searchKnowledgeBase({
        query: req.query.q,
        domain: req.query.domain,
        usable_for: req.query.usable_for,
        status: req.query.status,
        limit: req.query.limit
      })
    : loadKnowledgeBase();
  res.json(payload);
});

router.post('/assistant/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: '缺少 message' });

  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const kbResult = searchKnowledgeBase({
    query: message,
    usable_for: 'ai_chat',
    status: 'active',
    limit: 8
  });
  const fallbackKb = kbResult.items && kbResult.items.length > 0
    ? kbResult
    : searchKnowledgeBase({ usable_for: 'ai_chat', status: 'active', limit: 8 });
  const context = getLatestAssistantContext({
    report_type: req.body?.report_type,
    report_date: req.body?.report_date,
    presentation_mode: req.body?.presentation_mode
  });
  const prompt = buildAssistantPrompt(message, history, fallbackKb.items || [], context);

  try {
    const answer = await callLLM(prompt);
    res.json({
      answer,
      model: 'caolele',
      analysis_source: 'project_knowledge_assistant_v1',
      data_sources: {
        latest_report: context.latest_report ? `${context.latest_report.report_date}/${context.latest_report.report_type}` : null,
        knowledge_base_items: (fallbackKb.items || []).map(item => ({
          id: item.id,
          title: item.title,
          domain: item.domain
        })),
        dialogue_turns: history.slice(-8).length
      }
    });
  } catch (err) {
    const missingKey = /LLM_API_KEY/.test(err.message || '');
    res.status(missingKey ? 503 : 502).json({
      error: missingKey ? 'AI助手暂未配置模型密钥' : 'AI助手调用失败',
      message: missingKey ? '请在服务环境中配置 LLM_API_KEY 后重试' : err.message
    });
  }
});

router.get('/backtest/status', (req, res) => {
  const latestRuns = all(`SELECT id, name, framework_version, provider, start_date, end_date, metrics_json, created_at
    FROM backtest_runs ORDER BY id DESC LIMIT 10`);
  res.json({
    providers: getProviderStatus(),
    latest_runs: latestRuns.map(row => ({
      id: row.id,
      name: row.name,
      framework_version: row.framework_version,
      provider: row.provider,
      start_date: row.start_date,
      end_date: row.end_date,
      created_at: row.created_at,
      metrics: parseJsonMaybe(row.metrics_json)
    }))
  });
});

router.get('/backtest/institutional-status', (req, res) => {
  const latestRuns = all(`SELECT id, name, provider, start_date, end_date, params_json, metrics_json, created_at
    FROM ia_backtest_runs
    ORDER BY id DESC
    LIMIT 5`);
  res.json({
    latest_runs: latestRuns.map(row => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      start_date: row.start_date,
      end_date: row.end_date,
      created_at: row.created_at,
      params: parseJsonMaybe(row.params_json),
      metrics: parseJsonMaybe(row.metrics_json)
    }))
  });
});

// 创建/更新日报
router.post('/reports', async (req, res) => {
  const {
    report_date,
    report_type,
    hs300_value, hs300_change,
    sh_value, sh_change,
    sz_value, sz_change, cy_value, cy_change,
    total_profit_loss, total_profit_loss_percent,
    holding_count,
    stocks,
    five_elements, prediction, joke,
    bazi_json, industries_json, alerts_json,
    risk_warning, verification,
    global_indexes, global_indexes_json, market_momentum, market_momentum_json, card_summary,
    operation_advice, operation_advice_json,
    key_variables, key_variables_json,
    market_breadth, market_breadth_json,
    limit_stocks, limit_stocks_json,
    annual_correction, annual_correction_json,
    bazi_interpretation
  } = req.body;

  if (!report_date) return res.status(400).json({ error: '缺少报告日期' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report_date)) return res.status(400).json({ error: '日期格式错误' });
  const validTypes = ['morning', 'noon', 'evening'];
  const type = report_type || 'morning';
  if (!validTypes.includes(type)) return res.status(400).json({ error: `report_type 必须是 ${validTypes.join('/')}` });

  const numericFields = { hs300_value, hs300_change, sh_value, sh_change, total_profit_loss, total_profit_loss_percent, holding_count };
  for (const [field, value] of Object.entries(numericFields)) {
    if (value !== undefined && value !== null && typeof value !== 'number') {
      return res.status(400).json({ error: `${field} 必须是数字类型` });
    }
  }

  const frozenSnapshot = await freezeReportStockSnapshots(stocks, industries_json);
  const stocksForSave = frozenSnapshot.stocks;
  const industriesJsonForSave = frozenSnapshot.industriesJson || industries_json;

  const existing = get('SELECT id FROM reports WHERE report_date = ? AND report_type = ?', [report_date, type]);
  const globalIndexesJson = global_indexes_json || stringifyJson(global_indexes);
  const marketMomentumJson = market_momentum_json || stringifyJson(market_momentum);
  const operationAdviceJson = operation_advice_json || stringifyJson(operation_advice);
  const keyVariablesJson = key_variables_json || stringifyJson(key_variables);
  const marketBreadthJson = market_breadth_json || stringifyJson(market_breadth);
  const limitStocksJson = limit_stocks_json || stringifyJson(limit_stocks);
  const annualCorrectionJson = annual_correction_json || stringifyJson(annual_correction);

  let reportId;
  if (existing) {
    run(`
      UPDATE reports SET
        hs300_value = ?, hs300_change = ?,
        sh_value = ?, sh_change = ?,
        sz_value = ?, sz_change = ?,
        cy_value = ?, cy_change = ?,
        total_profit_loss = ?, total_profit_loss_percent = ?,
        holding_count = ?,
        bazi_json = ?, industries_json = ?, alerts_json = ?,
        global_indexes_json = ?, market_momentum_json = ?, card_summary = ?,
        operation_advice_json = ?, key_variables_json = ?,
        market_breadth_json = ?, limit_stocks_json = ?, annual_correction_json = ?,
        bazi_interpretation = ?,
        risk_warning = ?, verification = ?,
        updated_at = datetime('now')
      WHERE report_date = ? AND report_type = ?
    `, [hs300_value, hs300_change, sh_value, sh_change,
        sz_value, sz_change, cy_value, cy_change,
        total_profit_loss, total_profit_loss_percent, holding_count,
        bazi_json, industriesJsonForSave, alerts_json,
        globalIndexesJson, marketMomentumJson, card_summary,
        operationAdviceJson, keyVariablesJson, marketBreadthJson, limitStocksJson, annualCorrectionJson,
        bazi_interpretation, risk_warning, verification, report_date, type]);
    reportId = existing.id;
  } else {
    run(`
      INSERT INTO reports (report_date, report_type, hs300_value, hs300_change, sh_value, sh_change,
        sz_value, sz_change, cy_value, cy_change,
        total_profit_loss, total_profit_loss_percent, holding_count,
        bazi_json, industries_json, alerts_json, global_indexes_json, market_momentum_json, card_summary,
        operation_advice_json, key_variables_json, market_breadth_json, limit_stocks_json, annual_correction_json,
        bazi_interpretation, risk_warning, verification)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [report_date, type, hs300_value, hs300_change, sh_value, sh_change,
        sz_value, sz_change, cy_value, cy_change,
        total_profit_loss, total_profit_loss_percent, holding_count,
        bazi_json, industriesJsonForSave, alerts_json,
        globalIndexesJson, marketMomentumJson, card_summary,
        operationAdviceJson, keyVariablesJson, marketBreadthJson, limitStocksJson, annualCorrectionJson,
        bazi_interpretation, risk_warning, verification]);
    reportId = getLastInsertRowId();
  }

  run('DELETE FROM stocks WHERE report_id = ?', [reportId]);

  if (stocksForSave && stocksForSave.length > 0) {
    for (const stock of stocksForSave) {
      run(`INSERT INTO stocks (
        report_id, name, code, alert_level, suggestion, reason,
        snapshot_price, snapshot_change_percent, snapshot_as_of, snapshot_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reportId,
          stock.name,
          stripMarketPrefix(stock.code),
          stock.alert_level,
          stock.suggestion,
          stock.reason,
          stock.snapshot_price ?? null,
          stock.snapshot_change_percent ?? null,
          stock.snapshot_as_of || null,
          stock.snapshot_source || null
        ]);
    }
  }

  run('DELETE FROM analysis WHERE report_id = ?', [reportId]);

  if (five_elements || prediction || joke || bazi_interpretation) {
    run('INSERT INTO analysis (report_id, five_elements, prediction, joke, bazi_interpretation) VALUES (?, ?, ?, ?, ?)',
      [reportId, five_elements, prediction, joke, bazi_interpretation]);
  }

  upsertDecisionLog(reportId, {
    report_date,
    report_type: type,
    five_elements,
    hs300_change,
    sh_change,
    sz_change,
    cy_change,
    industries_json: industriesJsonForSave,
    market_momentum_json: marketMomentumJson,
    operation_advice_json: operationAdviceJson,
    key_variables_json: keyVariablesJson,
    market_breadth_json: marketBreadthJson,
    limit_stocks_json: limitStocksJson,
    risk_warning
  });

  res.json({ success: true, reportId, message: '日报创建成功' });
});

// 删除日报
router.delete('/reports/:date', (req, res) => {
  const report = get('SELECT id FROM reports WHERE report_date = ?', [req.params.date]);
  if (!report) return res.status(404).json({ error: '未找到该日期的日报' });
  run('DELETE FROM stocks WHERE report_id = ?', [report.id]);
  run('DELETE FROM analysis WHERE report_id = ?', [report.id]);
  run('DELETE FROM reports WHERE id = ?', [report.id]);
  res.json({ success: true, message: '日报删除成功' });
});

// 全局关注列表
router.get('/watchlist', (req, res) => {
  res.json({ data: all('SELECT * FROM watchlist ORDER BY created_at DESC') });
});

router.post('/watchlist', async (req, res) => {
  const { name, code, alert_level } = req.body;
  if (!name) return res.status(400).json({ error: '缺少标的名称' });
  const validLevels = ['red', 'yellow', 'green'];
  if (alert_level && !validLevels.includes(alert_level)) {
    return res.status(400).json({ error: `alert_level 必须是 ${validLevels.join('/')}` });
  }
  try {
    const resolved = await resolveAndCacheStockIndustryFromInput(name, code);
    const finalName = resolved?.quote?.name || name;
    const finalCode = resolved?.quote?.code || code || null;
    run('INSERT INTO watchlist (name, code, alert_level) VALUES (?, ?, ?)', [finalName, finalCode, alert_level]);
    res.json({
      success: true,
      id: getLastInsertRowId(),
      message: '添加成功',
      industry: resolved?.industry?.industry || null,
      industry_source: resolved?.industry?.source || null
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '该标的已在关注列表中' });
    }
    throw err;
  }
});

router.put('/watchlist/:id', async (req, res) => {
  const { name, code, alert_level } = req.body;
  if (name || code) await resolveAndCacheStockIndustryFromInput(name, code);
  run(`UPDATE watchlist SET name = COALESCE(?, name), code = COALESCE(?, code), alert_level = COALESCE(?, alert_level) WHERE id = ?`,
    [name, code, alert_level, req.params.id]);
  res.json({ success: true, message: '更新成功' });
});

router.delete('/watchlist/:id', (req, res) => {
  run('DELETE FROM report_stock_snapshots WHERE watchlist_id = ?', [req.params.id]);
  run('DELETE FROM watchlist WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '删除成功' });
});

// 日报的标的列表
router.get('/reports/:date/stocks', (req, res) => {
  const report = get('SELECT id FROM reports WHERE report_date = ? AND report_type = ?', [req.params.date, req.query.type || 'morning']);
  if (!report) return res.status(404).json({ error: '未找到该日报' });
  res.json({ data: getReportStocks(report.id) });
});

router.post('/reports/:date/stocks', async (req, res) => {
  const report = get('SELECT id FROM reports WHERE report_date = ? AND report_type = ?', [req.params.date, req.query.type || 'morning']);
  if (!report) return res.status(404).json({ error: '未找到该日报' });
  const { name, code, alert_level, suggestion, reason } = req.body || {};
  const finalName = String(name || code || '').trim();
  const finalCode = String(code || '').trim();
  if (!finalName) return res.status(400).json({ error: '缺少标的名称或代码' });
  const resolved = await resolveAndCacheStockIndustryFromInput(finalName, finalCode);
  const savedName = resolved?.quote?.name || finalName;
  const savedCode = resolved?.quote?.code || finalCode;
  const snapshot = resolved?.quote ? {
    price: Number.isFinite(Number(resolved.quote.last)) ? Number(resolved.quote.last) : null,
    changePercent: Number.isFinite(Number(resolved.quote.changePercent)) ? Number(resolved.quote.changePercent) : null,
    asOf: new Date().toISOString(),
    source: 'Tencent quote API'
  } : {};
  run(`INSERT INTO stocks (
    report_id, name, code, alert_level, suggestion, reason,
    snapshot_price, snapshot_change_percent, snapshot_as_of, snapshot_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.id,
      savedName,
      stripMarketPrefix(savedCode),
      alert_level || null,
      suggestion || '关注',
      reason || null,
      snapshot.price ?? null,
      snapshot.changePercent ?? null,
      snapshot.asOf || null,
      snapshot.source || null
    ]);
  res.json({
    success: true,
    id: getLastInsertRowId(),
    message: '标的已加入当前日报关注列表',
    industry: resolved?.industry?.industry || null,
    industry_source: resolved?.industry?.source || null
  });
});

router.put('/reports/:date/stocks/:stockId', async (req, res) => {
  const report = get('SELECT id FROM reports WHERE report_date = ? AND report_type = ?', [req.params.date, req.query.type || 'morning']);
  if (!report) return res.status(404).json({ error: '未找到该日报' });
  const { name, code, alert_level, suggestion, reason } = req.body || {};
  const existing = get('SELECT id FROM stocks WHERE id = ? AND report_id = ?', [req.params.stockId, report.id]);
  if (!existing) return res.status(404).json({ error: '未找到该标的' });
  if (name || code) await resolveAndCacheStockIndustryFromInput(name, code);
  run(`UPDATE stocks SET
    name = COALESCE(?, name),
    code = COALESCE(?, code),
    alert_level = ?,
    suggestion = COALESCE(?, suggestion),
    reason = COALESCE(?, reason)
    WHERE id = ? AND report_id = ?`,
    [name || null, code || null, alert_level || null, suggestion || null, reason || null, req.params.stockId, report.id]);
  res.json({ success: true, message: '标的已更新' });
});

router.delete('/reports/:date/stocks/:stockId', (req, res) => {
  const report = get('SELECT id FROM reports WHERE report_date = ? AND report_type = ?', [req.params.date, req.query.type || 'morning']);
  if (!report) return res.status(404).json({ error: '未找到该日报' });
  run('DELETE FROM stocks WHERE id = ? AND report_id = ?', [req.params.stockId, report.id]);
  res.json({ success: true, message: '标的已删除' });
});

// 日报生成
router.post('/generate', async (req, res) => {
  try {
    const reportType = req.body.type || 'morning';
    const date = new Date();
    if (reportType === 'morning') date.setHours(9, 30, 0);
    else if (reportType === 'noon') date.setHours(11, 30, 0);
    else if (reportType === 'evening') date.setHours(15, 0, 0);

    const bazi = getBaZi(date);
    const fiveCount = countFiveElements(bazi, { includeHour: false });
    const tenGodsResult = calculateTenGods(bazi);
    const strengthInfo = analyzeMarketStrength(bazi, fiveCount);
    const favors = getMarketFavors(bazi, fiveCount, strengthInfo);

    let hs300 = null, sh = null, sz = null, cyb = null;
    try {
      const rawQuotes = await fetchQuote(['sh000300', 'sh000001', 'sz399001', 'sz399006']);
      if (rawQuotes && rawQuotes.sh000300) {
        hs300 = { value: rawQuotes.sh000300.last, change: rawQuotes.sh000300.changePercent };
        sh = { value: rawQuotes.sh000001.last, change: rawQuotes.sh000001.changePercent };
        sz = { value: rawQuotes.sz399001 ? rawQuotes.sz399001.last : null, change: rawQuotes.sz399001 ? rawQuotes.sz399001.changePercent : null };
        cyb = { value: rawQuotes.sz399006 ? rawQuotes.sz399006.last : null, change: rawQuotes.sz399006 ? rawQuotes.sz399006.changePercent : null };
      }
    } catch (e) {
      console.error('获取行情失败:', e);
    }

    const marketData = {
      hs300Change: hs300 ? hs300.change : 0,
      cybChange: cyb ? cyb.change : 0,
      upStocks: [],
      reportDate: date,
      scenario: 'short_term'
    };

    const industries = getEnhancedIndustries(bazi, fiveCount, marketData);
    const baziInterpretation = generateBaZiInterpretation(bazi, fiveCount, marketData);

    const reportDate = date.toISOString().split('T')[0];
    const baziJson = JSON.stringify({
      date: `${bazi.year.ganzhi}年 ${bazi.month.ganzhi}月 ${bazi.day.ganzhi}日`,
      year_gan: bazi.year.gan, year_zhi: bazi.year.zhi,
      month_gan: bazi.month.gan, month_zhi: bazi.month.zhi,
      day_gan: bazi.day.gan, day_zhi: bazi.day.zhi,
      hour_gan: bazi.hour.gan, hour_zhi: bazi.hour.zhi,
      wuxing_power: {
        wood: fiveCount.count['木'],
        fire: fiveCount.count['火'],
        earth: fiveCount.count['土'],
        gold: fiveCount.count['金'],
        water: fiveCount.count['水']
      },
      ten_gods: tenGodsResult,
      market_strength: strengthInfo,
      favors: favors
    });

    const response = {
      success: true,
      report_date: reportDate,
      report_type: reportType,
      bazi: JSON.parse(baziJson),
      industries,
      bazi_interpretation: baziInterpretation,
      hs300_value: hs300 ? hs300.value : null,
      hs300_change: hs300 ? hs300.change : null,
      sh_value: sh ? sh.value : null,
      sh_change: sh ? sh.change : null,
      sz_value: sz ? sz.value : null,
      sz_change: sz ? sz.change : null,
      cy_value: cyb ? cyb.value : null,
      cy_change: cyb ? cyb.change : null,
      market_strength: strengthInfo.strength,
      investment_advice: favors.investmentAdvice
    };

    res.json(response);
  } catch (err) {
    console.error('生成失败:', err);
    res.status(500).json({ error: '生成失败', message: err.message });
  }
});

// 清空所有数据
router.delete('/clear', (req, res) => {
  try {
    run('DELETE FROM stocks');
    run('DELETE FROM analysis');
    run('DELETE FROM reports');
    res.json({ success: true, message: '数据已清空' });
  } catch (err) {
    res.status(500).json({ error: '清空失败' });
  }
});


// 个股实时行情+四维分析
router.get('/stock/analyze', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: '缺少查询参数 q' });

  try {
    // 1. 获取实时行情
    const quote = await getStockQuote(normalizeStockQuery(q));
    const industryProfile = await resolveStockIndustryWithCache(quote, q);

    // 2. 生成融合四维分析：行业五行先验 + 价投估值 + 量价资金确认
    const analysis = buildIntegratedStockAnalysis(quote, q, { date: req.query.date, industryProfile });
    const resolvedIndustry = industryProfile?.industry || analysis?.factors?.mystic?.industry || null;
    const valuation = analysis?.valuation || analysis?.factors?.value_points || null;

    res.json({
      name: quote.name,
      code: quote.code,
      industry: resolvedIndustry,
      industry_name: resolvedIndustry,
      industry_info: industryProfile || null,
      price: quote.last,
      change: quote.change,
      changePercent: quote.changePercent,
      pe: quote.pe,
      pb: quote.pb,
      netInflow: quote.netInflow,
      valuation,
      analysis_source: 'stock_integrated_rule_engine_v1',
      llm_enabled: false,
      data_sources: {
        realtime: 'Tencent quote API',
        valuation: 'Tencent quote PE_TTM/PB; Eastmoney Miaoxiang fallback when available',
        industry: industryProfile.source || 'stock industry cache / project map / Eastmoney industry field',
        flow: 'Eastmoney Miaoxiang main-force flow',
        analysis: '规则引擎融合行业五行先验、PE_TTM/PB估值、涨跌幅和主力资金，未调用大模型'
      },
      analysis
    });
  } catch (err) {
    console.error('个股分析失败:', err);
    res.status(500).json({ error: '分析失败', message: err.message });
  }
});

router.get('/stock/trend', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: '缺少查询参数 q' });
  try {
    const result = await getStockTrend(q, req.query.days || 30);
    res.json(result);
  } catch (err) {
    console.error('个股趋势获取失败:', err);
    res.status(500).json({ error: '趋势获取失败', message: err.message });
  }
});

// 简单的四维分析生成（不依赖 LLM，基于规则）
function generateSimpleAnalysis(quote, query) {
  const change = quote.changePercent || 0;
  const isUp = change >= 0;
  const absChange = Math.abs(change);

  // 消息面
  let news = '';
  if (absChange >= 7) news = isUp ? '涨停或接近涨停，市场情绪极度亢奋，注意获利盘压力' : '跌停或接近跌停，市场恐慌情绪蔓延';
  else if (absChange >= 4) news = isUp ? '涨幅较大，短线资金活跃，可能有题材驱动' : '跌幅较大，可能有负面消息或主力出货';
  else if (absChange >= 2) news = isUp ? '温和上涨，量价配合尚可' : '小幅回调，谨防趋势转弱';
  else if (absChange >= 0.5) news = isUp ? '小幅上涨，观望为主' : '小幅下跌，震荡格局';
  else news = '横盘整理，方向不明';

  // 基本面（有限信息）
  let fundamental = '';
  if (quote.pe !== null && quote.pe > 0) {
    if (quote.pe > 50) fundamental = 'PE偏高(' + quote.pe.toFixed(1) + ')，估值较贵';
    else if (quote.pe > 30) fundamental = 'PE适中(' + quote.pe.toFixed(1) + ')，估值合理';
    else if (quote.pe > 0) fundamental = 'PE较低(' + quote.pe.toFixed(1) + ')，估值有优势';
  }
  if (quote.pb !== null && quote.pb > 0) {
    fundamental += (fundamental ? '；' : '') + 'PB=' + quote.pb.toFixed(2);
  }
  if (quote.netInflow !== null) {
    const dir = quote.netInflow > 0 ? '主力净流入' : '主力净流出';
    fundamental += (fundamental ? '；' : '') + dir + (quote.netInflow > 0 ? '' + quote.netInflow.toFixed(2) + '亿' : '' + Math.abs(quote.netInflow).toFixed(2) + '亿');
  }
  if (!fundamental) fundamental = 'PE/PB估值数据暂无（第三方行情API服务限流），建议结合成交量、资金流和公开财报继续确认';

  // 技术面（基于涨跌幅推断）
  let technical = '';
  if (absChange >= 5) technical = isUp ? '强势突破，短线动能充沛，5日均线或已多头排列' : '破位下跌，5日均线或已死叉，短线谨慎';
  else if (absChange >= 2) technical = isUp ? '温和放量上涨，站稳5日均线' : '缩量回调，10日均线为支撑参考';
  else if (absChange >= 0.5) technical = isUp ? '小幅上涨，震荡整理中，关注量能配合' : '小幅回落，在支撑位徘徊';
  else technical = '横盘震荡，均线粘合，等待方向选择';

  let flow = '资金数据暂无，重点观察盘口承接、成交额变化和行业同步性';
  if (quote.netInflow !== null) {
    if (quote.netInflow > 0) flow = '主力资金净流入' + quote.netInflow.toFixed(2) + '亿，短线承接较好';
    else if (quote.netInflow < 0) flow = '主力资金净流出' + Math.abs(quote.netInflow).toFixed(2) + '亿，注意抛压';
    else flow = '主力资金基本持平，等待方向选择';
  }

  return { news, fundamental, technical, flow };
}

// ====== Helper Functions ======

async function buildReportResponse(report, stocks, analysis) {
  const reportType = report.report_type || 'morning';
  const timeConfig = { morning: { time: '09:25', label: '早盘' }, noon: { time: '11:30', label: '午间' }, evening: { time: '15:10', label: '盘后' } };
  const config = timeConfig[reportType] || timeConfig.morning;

  const response = {
    report_date: report.report_date,
    report_type: reportType,
    report_time: report.report_time || config.time,
    hs300_value: report.hs300_value,
    hs300_change: report.hs300_change,
    sh_value: report.sh_value, sh_change: report.sh_change,
    sz_value: report.sz_value, sz_change: report.sz_change,
    cy_value: report.cy_value, cy_change: report.cy_change,
    watch_count: stocks ? stocks.length : 0,
    stocks: stocks || [],
    joke: analysis?.joke,
    five_elements: analysis?.five_elements || null,
    bazi_interpretation: report.bazi_interpretation || analysis?.bazi_interpretation || null,
    card_summary: report.card_summary || null
  };

  if (report.global_indexes_json) {
    try { response.global_indexes = JSON.parse(report.global_indexes_json); } catch (e) { console.error('解析global_indexes_json失败:', e); }
  }

  if (report.market_momentum_json) {
    try { response.market_momentum = JSON.parse(report.market_momentum_json); } catch (e) { console.error('解析market_momentum_json失败:', e); }
  }

  if (report.operation_advice_json) {
    try { response.operation_advice = JSON.parse(report.operation_advice_json); } catch (e) { console.error('解析operation_advice_json失败:', e); }
  }

  if (report.key_variables_json) {
    try { response.key_variables = JSON.parse(report.key_variables_json); } catch (e) { console.error('解析key_variables_json失败:', e); }
  }

  if (report.market_breadth_json) {
    try { response.market_breadth = JSON.parse(report.market_breadth_json); } catch (e) { console.error('解析market_breadth_json失败:', e); }
  }

  if (report.limit_stocks_json) {
    try { response.limit_stocks = JSON.parse(report.limit_stocks_json); } catch (e) { console.error('解析limit_stocks_json失败:', e); }
  }

  if (report.annual_correction_json) {
    try { response.annual_correction = JSON.parse(report.annual_correction_json); } catch (e) { console.error('解析annual_correction_json失败:', e); }
  }

  if (report.bazi_json) {
    try {
      const baziData = JSON.parse(report.bazi_json);
      // 标准化为前端期望的扁平格式
      const fiveCount = countFiveElements(baziData, { includeHour: false });
      const t = fiveCount.total || 1;
      response.bazi = {
        date: baziData.year.ganzhi + "年 " + baziData.month.ganzhi + "月 " + baziData.day.ganzhi + "日",
        year_gan: baziData.year.gan, year_zhi: baziData.year.zhi,
        month_gan: baziData.month.gan, month_zhi: baziData.month.zhi,
        day_gan: baziData.day.gan, day_zhi: baziData.day.zhi,
        hour_gan: baziData.hour.gan, hour_zhi: baziData.hour.zhi,
        wuxing_power: {
          wood: fiveCount.count['木'] / t,
          fire: fiveCount.count['火'] / t,
          earth: fiveCount.count['土'] / t,
          gold: fiveCount.count['金'] / t,
          water: fiveCount.count['水'] / t
        },
        conflicts: []
      };
      response.ten_gods = calculateTenGods(baziData);
      response.market_strength = analyzeMarketStrength(baziData, fiveCount);
      response.favors = getMarketFavors(baziData, fiveCount, response.market_strength);
      const tenGodsTmp = calculateTenGods(baziData);
      response.day_rating = calculateDayRating(baziData, fiveCount, tenGodsTmp);
      response.astock_briefing = getAstockBriefing(baziData, fiveCount, { hs300Change: report.hs300_change || 0 });
    } catch (e) { console.error('解析bazi_json失败:', e); }
  }

  if (report.industries_json) {
    try { response.industries = JSON.parse(report.industries_json); } catch (e) { console.error('解析industries_json失败:', e); }
  }

  if (report.alerts_json && reportType === 'noon') {
    try { response.alerts = JSON.parse(report.alerts_json); } catch (e) { console.error('解析alerts_json失败:', e); }
  }

  if (!response.bazi && report.report_date) {
    const date = new Date(report.report_date);
    if (reportType === 'morning') date.setHours(9, 30, 0);
    else if (reportType === 'noon') date.setHours(11, 30, 0);
    else if (reportType === 'evening') date.setHours(15, 0, 0);

    const bazi = getBaZi(date);
    const fiveCount = countFiveElements(bazi, { includeHour: false });
    const tenGodsResult = calculateTenGods(bazi);
    const strengthInfo = analyzeMarketStrength(bazi, fiveCount);
    const favors = getMarketFavors(bazi, fiveCount, strengthInfo);

    response.bazi = {
      date: `${bazi.year.ganzhi}年 ${bazi.month.ganzhi}月 ${bazi.day.ganzhi}日`,
      year_gan: bazi.year.gan, year_zhi: bazi.year.zhi,
      month_gan: bazi.month.gan, month_zhi: bazi.month.zhi,
      day_gan: bazi.day.gan, day_zhi: bazi.day.zhi,
      hour_gan: bazi.hour.gan, hour_zhi: bazi.hour.zhi,
      wuxing_power: (function() {
        var t = fiveCount.total || 1;
        return {
          wood: fiveCount.count['木'] / t,
          fire: fiveCount.count['火'] / t,
          earth: fiveCount.count['土'] / t,
          gold: fiveCount.count['金'] / t,
          water: fiveCount.count['水'] / t
        };
      })(),
      conflicts: []
    };

    response.ten_gods = tenGodsResult;
    response.market_strength = strengthInfo;
    response.favors = favors;
    response.day_rating = calculateDayRating(bazi, fiveCount, tenGodsResult);
    response.astock_briefing = getAstockBriefing(bazi, fiveCount, { hs300Change: report.hs300_change || 0 });

    if (!response.bazi_interpretation && false) {
      const marketData = { hs300Change: report.hs300_change || 0 };
      response.bazi_interpretation = generateBaZiInterpretation(bazi, fiveCount, marketData);
    }
  }

  if (!response.industries && response.bazi) {
    const date = new Date(report.report_date);
    if (reportType === 'morning') date.setHours(9, 30, 0);
    else if (reportType === 'noon') date.setHours(11, 30, 0);
    else if (reportType === 'evening') date.setHours(15, 0, 0);

    const bazi = getBaZi(date);
    const fiveCount = countFiveElements(bazi, { includeHour: false });
    const marketData = { hs300Change: report.hs300_change || 0, upStocks: [] };
    response.industries = getEnhancedIndustries(bazi, fiveCount, marketData);
  }

  const hs300Change = report.hs300_change || 0;
  const generatedRisk = reportType === 'morning'
    ? generateMorningRiskWarning(hs300Change, response.bazi, response.market_strength)
    : reportType === 'noon'
      ? generateNoonRiskWarning(hs300Change, response.bazi)
      : generateEveningRiskWarning(hs300Change, response.bazi);
  response.risk_warning = normalizeRiskWarning(report.risk_warning || generatedRisk, reportType, {
    hs300Change,
    shChange: report.sh_change,
    cyChange: report.cy_change
  });

  if (reportType === 'evening') {
    response.verification = report.verification || generateVerification(hs300Change, response.bazi);
    response.prediction = analysis?.prediction || generatePrediction(response.bazi, hs300Change);
  }

  response.snapshot_policy = 'report_time_frozen';
  return response;
}

function generateMorningRiskWarning(change, bazi, marketStrength) {
  const strength = marketStrength ? marketStrength.strength : '中和';
  const strongElement = bazi ? Object.entries(bazi.wuxing_power || {}).sort((a, b) => b[1] - a[1])[0]?.[0] : '火';
  const elementName = { gold: '金', wood: '木', water: '水', fire: '火', earth: '土' }[strongElement] || '火';
  const actionMap = { '身强': '进取', '偏强': '偏多', '中和': '稳健', '偏弱': '防守', '身弱': '保守' };
  const action = actionMap[strength] || '稳健';

  const fact = `事实：沪深300当前${formatSignedPct(change)}。`;
  const forecast = `预测：五行强弱显示${elementName}属性当令，策略状态偏${action}。`;
  const scenario = change > 0
    ? '风险场景：当前上涨，但模型提示从盘中高位回撤/涨幅收窄风险，早盘不要用追高替代确认。'
    : '风险场景：当前承压，若开盘后跌幅扩大且量能不足，先看支撑位，不急于抄底。';
  return fact + forecast + scenario + '早盘波动较大，建议控制仓位。';
}

function generateNoonRiskWarning(change, bazi) {
  const fact = `事实：上午沪深300${formatSignedPct(change)}。`;
  let forecast = '预测：午后大概率继续围绕量能和主线强度做方向选择。';
  let scenario = '风险场景：消息面或资金面转弱时，下午开盘可能放大波动。';
  if (Math.abs(change) < 0.5) {
    forecast = '预测：上午窄幅震荡，多空仍在拉锯。';
  } else if (change > 0) {
    forecast = '预测：上午震荡上行，但上涨后需要确认承接。';
    scenario = '风险场景：当前上涨，但模型提示从盘中高位回撤/涨幅收窄风险；若午后开盘量能跟不上，应避免继续追高。';
  } else {
    forecast = '预测：上午承压下行，午后先看能否企稳。';
    scenario = '风险场景：若午后跌幅扩大且主线行业转弱，应减少弱势仓位。';
  }
  return fact + forecast + scenario;
}

function generateEveningRiskWarning(change, bazi) {
  const fact = `事实：今日沪深300${formatSignedPct(change)}。`;
  let forecast = '预测：明日先看指数方向选择和行业轮动强度。';
  let scenario = '风险场景：若市场情绪走弱，应降低交易频率。';
  if (change > 1) {
    forecast = '预测：强势上涨后仍可能延续强势，但短线性价比下降。';
    scenario = '风险场景：当前上涨，但模型提示从盘中高位回撤/涨幅收窄风险；若明日高开低走，优先保护利润。';
  } else if (change > 0) {
    forecast = '预测：小幅收涨后仍处震荡验证阶段。';
    scenario = '风险场景：当前上涨，但模型提示从盘中高位回撤/涨幅收窄风险；若成交量不能配合，谨慎加仓。';
  } else if (change > -1) {
    forecast = '预测：小幅收跌后等待明日开盘方向确认。';
    scenario = '风险场景：若明日低开且主线继续走弱，先控制仓位。';
  } else {
    forecast = '预测：明显下跌后防守优先，等待止跌信号。';
    scenario = '风险场景：若继续下探且无放量承接，警惕进一步下行风险。';
  }
  return fact + forecast + scenario + '建议明日关注市场情绪变化。';
}

function formatSignedPct(value) {
  const n = Number(value || 0);
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function normalizeRiskWarning(text, reportType, context) {
  const source = String(text || '').trim();
  const hs = Number(context.hs300Change || 0);
  const sh = Number(context.shChange || 0);
  const cy = Number(context.cyChange || 0);
  const hasStructuredLabels = source.includes('事实：') && source.includes('预测：') && source.includes('风险场景：');
  const hasOldDownsideWording = hs > 0 && /会跌|回落超过1%|跌1%|跌幅.*1%/.test(source);

  if (hasStructuredLabels && !hasOldDownsideWording) return source;

  const fact = `事实：沪深300当前${formatSignedPct(hs)}，上证${formatSignedPct(sh)}，创业板${formatSignedPct(cy)}。`;
  let forecast = '预测：模型提示继续观察量能、资金和主线行业强度。';
  let scenario;
  if (hs > 0) {
    forecast = reportType === 'noon'
      ? '预测：上午上涨后，午后需要确认承接是否继续。'
      : '预测：当前上涨后仍处震荡验证阶段。';
    scenario = '风险场景：当前上涨，但模型提示从盘中高位回撤/涨幅收窄风险；若资金转弱或主线不能延续强度，应降低仓位。';
  } else if (hs < 0) {
    forecast = '预测：当前承压，先看指数能否止跌企稳。';
    scenario = '风险场景：若跌幅扩大且没有放量承接，应减少弱势持仓。';
  } else {
    scenario = '风险场景：当前窄幅震荡，若量能不足且主线走弱，避免扩大持仓。';
  }
  return fact + forecast + scenario;
}

function generateVerification(change, bazi) {
  let text = '【今日验证】\n';
  if (change > 0) text += '大盘收涨，';
  else if (change < 0) text += '大盘收跌，';
  else text += '大盘收平，';
  const strongElement = bazi ? Object.entries(bazi.wuxing_power || {}).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
  if (strongElement) {
    text += strongElement + '属性板块';
    if ((change > 0 && strongElement === '火') || (change < 0 && strongElement === '金')) {
      text += '表现符合预期。';
    } else {
      text += '表现值得关注。';
    }
  }
  return text;
}

function generatePrediction(bazi, change) {
  const elementNames = { gold: '金', wood: '木', water: '水', fire: '火', earth: '土' };
  const strongElement = bazi ? Object.entries(bazi.wuxing_power || {}).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
  const weakElement = bazi ? Object.entries(bazi.wuxing_power || {}).sort((a, b) => a[1] - b[1])[0]?.[0] : null;
  let text = '【明日观察】\n';
  if (strongElement) text += '关注' + (elementNames[strongElement] || strongElement) + '主因子板块能否延续强度。\n';
  if (weakElement) text += '注意' + (elementNames[weakElement] || weakElement) + '弱因子板块是否拖累指数。\n';
  text += '策略上以量能、指数趋势和行业资金强度为准，避免追高。';
  return text;
}

// 获取日报复制的标的列表
function getReportStocks(reportId) {
  const rows = all('SELECT * FROM stocks WHERE report_id = ? ORDER BY id', [reportId]);
  if (rows.length > 0) return rows;
  return all("SELECT w.id, w.name, w.code, w.alert_level, '关注' as suggestion FROM watchlist w ORDER BY w.created_at DESC");
}

// 获取行业的相关股票
function getIndustryStocks(industryName) {
  const stockMap = {
    '物流': [{ name: '顺丰控股', code: '002352' }, { name: '中远海控', code: '601919' }, { name: '物流ETF', code: '516910' }],
    '航运': [{ name: '中远海控', code: '601919' }, { name: '招商轮船', code: '601872' }],
    '传媒': [{ name: '分众传媒', code: '002027' }, { name: '芒果超媒', code: '300413' }, { name: '传媒ETF', code: '512980' }],
    '旅游': [{ name: '中国中免', code: '601888' }, { name: '宋城演艺', code: '300144' }],
    '农林牧渔': [{ name: '牧原股份', code: '002714' }, { name: '温氏股份', code: '300498' }, { name: '农业ETF', code: '159825' }],
    '园林': [{ name: '东方园林', code: '002310' }],
    '能源': [{ name: '中国神华', code: '601088' }, { name: '兖矿能源', code: '600188' }],
    '军工': [{ name: '中航沈飞', code: '600760' }, { name: '航发动力', code: '600893' }],
    '电子': [{ name: '中芯国际', code: '688981' }, { name: '韦尔股份', code: '603501' }],
    '房地产': [{ name: '万科A', code: '000002' }, { name: '保利发展', code: '600048' }],
    '金融': [{ name: '中国平安', code: '601318' }, { name: '招商银行', code: '600036' }],
    '有色金属': [{ name: '紫金矿业', code: '601899' }, { name: '洛阳钼业', code: '603993' }],
    '汽车': [{ name: '比亚迪', code: '002594' }, { name: '长城汽车', code: '601633' }],
    '机械': [{ name: '三一重工', code: '600031' }, { name: '徐工机械', code: '000425' }]
  };
  return stockMap[industryName] || [];
}

module.exports = router;

const ELEMENTS = ['金', '木', '水', '火', '土'];

const ELEMENT_SLUG = {
  '金': 'gold',
  '木': 'wood',
  '水': 'water',
  '火': 'fire',
  '土': 'earth'
};

const FRAMEWORK_VERSION = 'SW_INDUSTRY_FIVE_ELEMENTS_V2.1';
const FRAMEWORK_SOURCE = 'sw-industry-five-elements-framework-v2.1.md';

const SCENARIO_WEIGHTS = {
  short_term: {
    label: '中短线投资',
    horizon: '<1年',
    weights: { value_chain: 0.10, production_factor: 0.10, cycle: 0.20, policy: 0.30, personal: 0.00, momentum: 0.30 }
  },
  long_term: {
    label: '长线价投',
    horizon: '>3年',
    weights: { value_chain: 0.20, production_factor: 0.20, cycle: 0.30, policy: 0.30, personal: 0.00, momentum: 0.00 }
  },
  career: {
    label: '个人择业/转行',
    horizon: '职业决策',
    weights: { value_chain: 0.15, production_factor: 0.30, cycle: 0.10, policy: 0.10, personal: 0.35, momentum: 0.00 }
  },
  strategy: {
    label: '企业战略/并购',
    horizon: '战略决策',
    weights: { value_chain: 0.25, production_factor: 0.20, cycle: 0.20, policy: 0.25, personal: 0.00, momentum: 0.10 }
  }
};

const ANNUAL_ELEMENT_CORRECTIONS = {
  2026: {
    label: '2026丙午',
    source: 'sw-framework-v2.1',
    rationale: '火极旺，克金、耗水；木生火、火生土。',
    elements: { '金': -0.15, '木': 0.05, '水': -0.10, '火': 0.25, '土': 0.05 }
  },
  2027: {
    label: '2027丁未',
    source: 'sw-framework-v2.1',
    rationale: '火生土，土旺；火仍旺但开始收敛。',
    elements: { '金': -0.05, '木': 0.05, '水': -0.05, '火': 0.15, '土': 0.10 }
  },
  2028: {
    label: '2028戊申',
    source: 'sw-framework-v2.1',
    rationale: '土生金，金旺；火退，水初生。',
    elements: { '金': 0.15, '木': -0.05, '水': 0.05, '火': -0.10, '土': 0.05 }
  },
  2029: {
    label: '2029己酉',
    source: 'sw-framework-v2.1',
    rationale: '金极旺，克木；火被泄，水被生。',
    elements: { '金': 0.20, '木': -0.10, '水': 0.05, '火': -0.15, '土': 0.05 }
  },
  2030: {
    label: '2030庚戌',
    source: 'sw-framework-v2.1',
    rationale: '金旺土相，火渐复苏。',
    elements: { '金': 0.15, '木': -0.05, '水': 0.05, '火': -0.05, '土': 0.10 }
  }
};

const DEFAULT_CORRECTION = {
  label: '默认年度',
  source: 'sw-framework-v2.1',
  rationale: '未配置年度修正，保持原始五行权重。',
  elements: { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
};

const SW_INDUSTRY_ROWS = [
  { id: 1, name: '农林牧渔', exposure: { '金': 0.15, '木': 0.55, '水': 0.20, '火': 0.05, '土': 0.30 }, cycle: '土（成熟）', key_variables: ['粮食安全政策', '猪周期'] },
  { id: 2, name: '基础化工', exposure: { '金': 0.50, '木': 0.05, '水': 0.25, '火': 0.20, '土': 0.30 }, cycle: '金（衰退/出清）', key_variables: ['油价', '产能利用率', '环保政策'] },
  { id: 3, name: '钢铁', exposure: { '金': 0.55, '木': 0.05, '水': 0.15, '火': 0.25, '土': 0.25 }, cycle: '金（衰退）', key_variables: ['地产需求', '出口配额', '碳中和'] },
  { id: 4, name: '有色金属', exposure: { '金': 0.50, '木': 0.10, '水': 0.30, '火': 0.15, '土': 0.20 }, cycle: '火→土（成长→成熟）', key_variables: ['新能源需求', '美元利率', '地缘风险'] },
  { id: 5, name: '煤炭', exposure: { '金': 0.30, '木': 0.05, '水': 0.20, '火': 0.35, '土': 0.40 }, cycle: '金（衰退）', key_variables: ['双碳政策', '电价市场化', '进口替代'] },
  { id: 6, name: '石油石化', exposure: { '金': 0.35, '木': 0.05, '水': 0.30, '火': 0.30, '土': 0.35 }, cycle: '土（成熟）', key_variables: ['国际油价', '地缘政治', '新能源替代'] },
  { id: 7, name: '建筑材料', exposure: { '金': 0.30, '木': 0.05, '水': 0.15, '火': 0.10, '土': 0.55 }, cycle: '金（衰退）', key_variables: ['地产新开工', '基建投资', '环保限产'] },
  { id: 8, name: '建筑装饰', exposure: { '金': 0.25, '木': 0.05, '水': 0.20, '火': 0.10, '土': 0.50 }, cycle: '金（衰退）', key_variables: ['基建增速', '地产竣工', '回款周期'] },
  { id: 9, name: '电力设备', exposure: { '金': 0.30, '木': 0.15, '水': 0.20, '火': 0.45, '土': 0.20 }, cycle: '火（成长）', key_variables: ['电网投资', '新能源装机', '出海订单'] },
  { id: 10, name: '机械设备', exposure: { '金': 0.50, '木': 0.10, '水': 0.20, '火': 0.15, '土': 0.25 }, cycle: '土（成熟）', key_variables: ['制造业投资', '出口竞争力', '自动化率'] },
  { id: 11, name: '国防军工', exposure: { '金': 0.55, '木': 0.05, '水': 0.15, '火': 0.15, '土': 0.25 }, cycle: '木（生发/政策驱动）', key_variables: ['军费增速', '订单释放', '资产证券化'] },
  { id: 12, name: '汽车', exposure: { '金': 0.45, '木': 0.10, '水': 0.25, '火': 0.20, '土': 0.20 }, cycle: '火→土（成长→成熟）', key_variables: ['新能源渗透率', '出海', '智能化'] },
  { id: 13, name: '家用电器', exposure: { '金': 0.35, '木': 0.05, '水': 0.20, '火': 0.15, '土': 0.40 }, cycle: '土（成熟）', key_variables: ['地产竣工', '以旧换新', '出海'] },
  { id: 14, name: '轻工制造', exposure: { '金': 0.30, '木': 0.25, '水': 0.20, '火': 0.10, '土': 0.25 }, cycle: '土（成熟）', key_variables: ['出口订单', '原材料成本', '品牌升级'] },
  { id: 15, name: '纺织服饰', exposure: { '金': 0.20, '木': 0.35, '水': 0.25, '火': 0.10, '土': 0.20 }, cycle: '土（成熟）', key_variables: ['出口竞争力', '品牌升级', '库存周期'] },
  { id: 16, name: '食品饮料', exposure: { '金': 0.20, '木': 0.10, '水': 0.20, '火': 0.10, '土': 0.50 }, cycle: '土（成熟）', key_variables: ['消费复苏', '成本传导', '渠道变革'] },
  { id: 17, name: '医药生物', exposure: { '金': 0.30, '木': 0.40, '水': 0.20, '火': 0.05, '土': 0.20 }, cycle: '金（衰退/出清）', key_variables: ['集采扩围', '创新药审批', '出海'] },
  { id: 18, name: '美容护理', exposure: { '金': 0.20, '木': 0.15, '水': 0.40, '火': 0.15, '土': 0.20 }, cycle: '木（成长）', key_variables: ['消费降级/升级', '国货替代', '监管'] },
  { id: 19, name: '商贸零售', exposure: { '金': 0.20, '木': 0.10, '水': 0.40, '火': 0.15, '土': 0.30 }, cycle: '水（转型）', key_variables: ['消费复苏', '电商渗透率', '折扣化'] },
  { id: 20, name: '社会服务', exposure: { '金': 0.15, '木': 0.10, '水': 0.45, '火': 0.15, '土': 0.25 }, cycle: '水（转型）', key_variables: ['消费复苏', '政策放开', '性价比'] },
  { id: 21, name: '传媒', exposure: { '金': 0.20, '木': 0.10, '水': 0.25, '火': 0.50, '土': 0.15 }, cycle: '火（成长）', key_variables: ['AI应用', '监管', '广告主预算'] },
  { id: 22, name: '计算机', exposure: { '金': 0.25, '木': 0.10, '水': 0.20, '火': 0.50, '土': 0.15 }, cycle: '火（成长）', key_variables: ['AI商业化', '信创', '出海'] },
  { id: 23, name: '通信', exposure: { '金': 0.30, '木': 0.05, '水': 0.25, '火': 0.40, '土': 0.20 }, cycle: '土（成熟）', key_variables: ['5G-A', '卫星互联网', '算力网络'] },
  { id: 24, name: '电子', exposure: { '金': 0.50, '木': 0.10, '水': 0.20, '火': 0.15, '土': 0.15 }, cycle: '火→土（成长→成熟）', key_variables: ['国产替代', 'AI芯片', '消费电子复苏'] },
  { id: 25, name: '公用事业', exposure: { '金': 0.15, '木': 0.05, '水': 0.40, '火': 0.20, '土': 0.30 }, cycle: '土（成熟）', key_variables: ['电价市场化', '新能源并网', '分红'] },
  { id: 26, name: '交通运输', exposure: { '金': 0.20, '木': 0.05, '水': 0.50, '火': 0.10, '土': 0.25 }, cycle: '水（转型）', key_variables: ['油价', '汇率', '跨境电商物流'] },
  { id: 27, name: '房地产', exposure: { '金': 0.55, '木': 0.05, '水': 0.20, '火': 0.05, '土': 0.30 }, cycle: '金（衰退/出清）', key_variables: ['限购政策', '房贷利率', '房企违约'] },
  { id: 28, name: '银行', exposure: { '金': 0.50, '木': 0.05, '水': 0.30, '火': 0.05, '土': 0.25 }, cycle: '土（成熟）', key_variables: ['净息差', '资产质量', '地产敞口'] },
  { id: 29, name: '非银金融', exposure: { '金': 0.55, '木': 0.05, '水': 0.25, '火': 0.10, '土': 0.20 }, cycle: '金（衰退/出清）', key_variables: ['市场成交量', '监管政策', '创新业务'] },
  { id: 30, name: '环保', exposure: { '金': 0.20, '木': 0.45, '水': 0.20, '火': 0.10, '土': 0.25 }, cycle: '木（成长/政策驱动）', key_variables: ['双碳政策', '财政支付能力', '技术降本'] },
  { id: 31, name: '综合', exposure: { '金': 0.25, '木': 0.15, '水': 0.20, '火': 0.15, '土': 0.25 }, cycle: '取决于具体业务组合', key_variables: ['具体业务组合', '资产重组', '控股结构'] }
];

const SW_INDUSTRY_BY_NAME = Object.fromEntries(SW_INDUSTRY_ROWS.map(row => [row.name, row]));

function cloneExposure(exposure) {
  const copy = {};
  ELEMENTS.forEach(element => {
    copy[element] = Number(exposure[element] || 0);
  });
  return copy;
}

function roundNumber(value, digits) {
  const factor = Math.pow(10, digits || 4);
  return Math.round(Number(value || 0) * factor) / factor;
}

function roundExposure(exposure, digits) {
  const rounded = {};
  ELEMENTS.forEach(element => {
    rounded[element] = roundNumber(exposure[element], digits || 4);
  });
  return rounded;
}

function resolveYear(input) {
  if (typeof input === 'number') return input;
  if (input && input.solar && input.solar.year) return Number(input.solar.year);
  if (input && typeof input.getFullYear === 'function') return input.getFullYear();
  const parsed = input ? new Date(input) : new Date();
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  return new Date().getFullYear();
}

function getAnnualElementCorrection(input) {
  const year = resolveYear(input);
  const config = ANNUAL_ELEMENT_CORRECTIONS[year] || DEFAULT_CORRECTION;
  return {
    year,
    label: config.label,
    source: config.source,
    rationale: config.rationale,
    elements: { ...DEFAULT_CORRECTION.elements, ...config.elements }
  };
}

function softmaxExposure(exposure) {
  const values = ELEMENTS.map(element => Number(exposure[element] || 0));
  const max = Math.max(...values);
  const expValues = values.map(value => Math.exp(value - max));
  const total = expValues.reduce((sum, value) => sum + value, 0) || 1;
  const normalized = {};
  ELEMENTS.forEach((element, index) => {
    normalized[element] = expValues[index] / total;
  });
  return normalized;
}

function normalizeLinearExposure(exposure) {
  const total = ELEMENTS.reduce((sum, element) => sum + Math.max(0, Number(exposure[element] || 0)), 0) || 1;
  const normalized = {};
  ELEMENTS.forEach(element => {
    normalized[element] = Math.max(0, Number(exposure[element] || 0)) / total;
  });
  return normalized;
}

function applyAnnualCorrectionToExposure(exposure, input) {
  const correction = getAnnualElementCorrection(input);
  const adjusted = {};
  ELEMENTS.forEach(element => {
    adjusted[element] = Number(exposure[element] || 0) * (1 + Number(correction.elements[element] || 0));
  });
  return {
    correction,
    adjusted_raw: roundExposure(adjusted, 4),
    normalized_exposure: roundExposure(softmaxExposure(adjusted), 4),
    linear_exposure: roundExposure(normalizeLinearExposure(adjusted), 4)
  };
}

function buildAnnualCorrectionRows(fiveCount, input) {
  const correction = getAnnualElementCorrection(input);
  const rows = ELEMENTS.map(element => {
    const raw = Number((fiveCount.count && fiveCount.count[element]) || 0);
    const adjustment = Number(correction.elements[element] || 0);
    return {
      element,
      raw,
      correction: adjustment,
      score: raw * (1 + adjustment)
    };
  }).sort((a, b) => b.score - a.score);
  const total = rows.reduce((sum, item) => sum + item.score, 0) || 1;
  return {
    ...correction,
    rows: rows.map(item => ({ ...item, weight: item.score / total }))
  };
}

function formatAnnualCorrectionSummary(correction) {
  const cfg = correction || getAnnualElementCorrection();
  return ELEMENTS
    .map(element => {
      const value = Number(cfg.elements[element] || 0);
      return `${element}${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
    })
    .join('、');
}

function dominantElement(exposure) {
  return ELEMENTS.slice().sort((a, b) => Number(exposure[b] || 0) - Number(exposure[a] || 0))[0];
}

function formatExposure(exposure) {
  return ELEMENTS.slice()
    .sort((a, b) => Number(exposure[b] || 0) - Number(exposure[a] || 0))
    .slice(0, 3)
    .map(element => `${element}${Math.round(Number(exposure[element] || 0) * 100)}%`)
    .join(' / ');
}

function getSwIndustryRows() {
  return SW_INDUSTRY_ROWS.map(row => ({
    ...row,
    exposure: cloneExposure(row.exposure),
    key_variables: row.key_variables.slice()
  }));
}

function getSwIndustryBucketsByElement() {
  const buckets = { '金': [], '木': [], '水': [], '火': [], '土': [] };
  SW_INDUSTRY_ROWS.forEach(row => {
    const dominant = dominantElement(row.exposure);
    if (row.name !== '综合') buckets[dominant].push(row.name);
  });
  return buckets;
}

function buildElementSignals(fiveCount, input, options) {
  const opts = options || {};
  const correction = getAnnualElementCorrection(input);
  const raw = {};
  ELEMENTS.forEach(element => {
    let value = Number((fiveCount.count && fiveCount.count[element]) || 0);
    value *= (1 + Number(correction.elements[element] || 0));
    if (element === opts.favorableElement) value *= 1.15;
    if (element === opts.dominantElement) value *= 1.06;
    raw[element] = value;
  });
  return {
    correction,
    raw: roundExposure(raw, 4),
    normalized: roundExposure(softmaxExposure(raw), 4)
  };
}

function formatScenarioWeights(scenarioKey) {
  const scenario = SCENARIO_WEIGHTS[scenarioKey] || SCENARIO_WEIGHTS.short_term;
  const labels = [
    ['政策', scenario.weights.policy],
    ['资金动量', scenario.weights.momentum],
    ['周期', scenario.weights.cycle],
    ['价值链', scenario.weights.value_chain],
    ['要素', scenario.weights.production_factor],
    ['个人格局', scenario.weights.personal]
  ];
  return labels
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label}${Math.round(value * 100)}%`)
    .join(' + ');
}

function matchStrongIndustry(row, strongIndustries) {
  if (!Array.isArray(strongIndustries)) return false;
  return strongIndustries.some(item => item === row.name);
}

function buildPressureTest(row, corrected, marketData) {
  const hs300Change = Number(marketData.hs300Change || 0);
  const mainFlow = Number(marketData.marketMomentum?.mainForce?.netInflow || 0);
  const northFlow = Number(marketData.marketMomentum?.northbound?.netInflow || 0);
  const dominant = dominantElement(row.exposure);
  const risks = [];

  if (Number(corrected.correction.elements[dominant] || 0) < 0) {
    risks.push(`${corrected.correction.label}对${dominant}因子有压制`);
  }
  if (hs300Change < -1) risks.push('沪深300跌幅超过1%');
  if (mainFlow < 0) risks.push('主力资金净流出');
  if (northFlow < 0) risks.push('北向资金净流出');
  if (dominant === '火' && hs300Change > 1) risks.push('火因子高弹性上涨后回撤风险');
  if (dominant === '金' && corrected.correction.year === 2026) risks.push('2026火旺克金，传统金性行业需降权观察');

  let level = 'normal';
  if (risks.length >= 3) level = 'high';
  else if (risks.length >= 1) level = 'elevated';

  return {
    level,
    active_risks: risks,
    key_variables: row.key_variables.slice(0, 4),
    trigger_rule: '若关键变量恶化、资金转弱或年度压制因子被放大，降低该行业排序权重。'
  };
}

function scoreSwIndustries(params) {
  const options = params || {};
  const marketData = options.marketData || {};
  const scenarioKey = options.scenario || marketData.scenario || 'short_term';
  const scenario = SCENARIO_WEIGHTS[scenarioKey] || SCENARIO_WEIGHTS.short_term;
  const correctionInput = marketData.reportDate || options.bazi || new Date();
  const signals = buildElementSignals(options.fiveCount || { count: {} }, correctionInput, {
    favorableElement: options.favorableElement,
    dominantElement: options.dominantElement
  });
  const strongIndustries = marketData.strongIndustries || [];
  const scored = SW_INDUSTRY_ROWS.map(row => {
    const corrected = applyAnnualCorrectionToExposure(row.exposure, correctionInput);
    const finalExposure = corrected.normalized_exposure;
    const baseScore = ELEMENTS.reduce((sum, element) => {
      return sum + Number(finalExposure[element] || 0) * Number(signals.normalized[element] || 0);
    }, 0);
    const marketAdjustment = matchStrongIndustry(row, strongIndustries) ? 0.04 : 0;
    // Intraday strength is a confirmation label, not a primary ranking boost.
    // Keep the field for explanation, but keep daily Top directions stable.
    const score = baseScore;
    const mainElement = dominantElement(corrected.adjusted_raw);
    const pressureTest = buildPressureTest(row, corrected, marketData);
    return {
      id: row.id,
      name: row.name,
      element_name: mainElement,
      element: ELEMENT_SLUG[mainElement] || 'earth',
      base_exposure: cloneExposure(row.exposure),
      adjusted_exposure: corrected.adjusted_raw,
      element_weights: finalExposure,
      element_profile: formatExposure(finalExposure),
      current_cycle: row.cycle,
      key_variables: row.key_variables.slice(),
      scenario: scenarioKey,
      scenario_label: scenario.label,
      scenario_weights: scenario.weights,
      scenario_weight_summary: formatScenarioWeights(scenarioKey),
      annual_correction: corrected.correction,
      pressure_test: pressureTest,
      market_adjustment: roundNumber(marketAdjustment, 4),
      raw_score: score,
      source: FRAMEWORK_VERSION,
      weight_source: `${FRAMEWORK_SOURCE} / ${scenario.label}`,
      calculation_rule: `${scenario.label}采用${formatScenarioWeights(scenarioKey)}；申万31行业基础暴露经${corrected.correction.label}流年修正后做Softmax归一化，再与当日五行信号匹配。`
    };
  }).sort((a, b) => b.raw_score - a.raw_score);

  const maxScore = scored[0]?.raw_score || 1;
  const minScore = scored[scored.length - 1]?.raw_score || 0;
  const spread = maxScore - minScore || 1;
  scored.forEach((item, index) => {
    const percentile = scored.length === 1 ? 1 : 1 - (index / (scored.length - 1));
    item.rank_percentile = roundNumber(percentile, 4);
    item.factor_score = roundNumber(100 * (item.raw_score - minScore) / spread, 1);
    item.rating = percentile >= 0.85 ? 5 : percentile >= 0.65 ? 4 : percentile <= 0.20 ? 2 : 3;
    item.framework_version = FRAMEWORK_VERSION;
    delete item.raw_score;
  });

  return {
    framework_version: FRAMEWORK_VERSION,
    framework_source: FRAMEWORK_SOURCE,
    scenario: scenarioKey,
    scenario_label: scenario.label,
    scenario_weights: scenario.weights,
    scenario_weight_summary: formatScenarioWeights(scenarioKey),
    element_signals: signals,
    industries: scored
  };
}

module.exports = {
  ELEMENTS,
  ELEMENT_SLUG,
  FRAMEWORK_VERSION,
  FRAMEWORK_SOURCE,
  SCENARIO_WEIGHTS,
  ANNUAL_ELEMENT_CORRECTIONS,
  SW_INDUSTRY_ROWS,
  SW_INDUSTRY_BY_NAME,
  getAnnualElementCorrection,
  buildAnnualCorrectionRows,
  formatAnnualCorrectionSummary,
  softmaxExposure,
  normalizeLinearExposure,
  applyAnnualCorrectionToExposure,
  dominantElement,
  formatExposure,
  getSwIndustryRows,
  getSwIndustryBucketsByElement,
  buildElementSignals,
  formatScenarioWeights,
  scoreSwIndustries
};

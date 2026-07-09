const { getBaZi, countFiveElements } = require('./bazi');
const { scoreSwIndustries } = require('./swIndustryFramework');

const STOCK_INDUSTRY_HINTS = [
  { industry: '传媒', codes: ['002027'], names: ['分众传媒'] },
  { industry: '煤炭', codes: ['601225', '601088'], names: ['陕西煤业', '中国神华'] },
  { industry: '白酒', codes: ['600519', '000858'], names: ['贵州茅台', '五粮液'] },
  { industry: '银行', codes: ['600036', '000001'], names: ['招商银行', '平安银行'] },
  { industry: '非银金融', codes: ['601318', '600030', '300059'], names: ['中国平安', '中信证券', '东方财富'] },
  { industry: '电力设备', codes: ['300750', '300274', '601012'], names: ['宁德时代', '阳光电源', '隆基绿能'] },
  { industry: '公用事业', codes: ['600900'], names: ['长江电力'] },
  { industry: '计算机', codes: ['002230', '002415'], names: ['科大讯飞', '海康威视'] },
  { industry: '通信', codes: ['000063'], names: ['中兴通讯'] },
  { industry: '电子', codes: ['688981', '002475', '002241'], names: ['中芯国际', '立讯精密', '歌尔股份'] },
  { industry: '汽车', codes: ['002594', '601633', '600104'], names: ['比亚迪', '长城汽车', '上汽集团', '上汽股份'] },
  { industry: '机械设备', codes: ['600031', '000425'], names: ['三一重工', '徐工机械'] },
  { industry: '建筑装饰', codes: ['601668', '601390'], names: ['中国建筑', '中国中铁'] },
  { industry: '建筑材料', codes: ['600585', '002271'], names: ['海螺水泥', '东方雨虹'] },
  { industry: '钢铁', codes: ['600019', '000932'], names: ['宝钢股份', '华菱钢铁'] },
  { industry: '医药生物', codes: ['600276', '000538'], names: ['恒瑞医药', '云南白药'] },
  { industry: '食品饮料', codes: ['603288'], names: ['海天味业'] },
  { industry: '房地产', codes: ['600048', '000002'], names: ['保利发展', '万科A'] },
  { industry: '交通运输', codes: ['601919', '600018'], names: ['中远海控', '上港集团'] },
  { industry: '农林牧渔', codes: ['002714', '300498'], names: ['牧原股份', '温氏股份'] },
  { industry: '环保', codes: ['300070', '600323'], names: ['碧水源', '瀚蓝环境'] },
  { industry: '有色金属', codes: ['603993'], names: ['洛阳钼业'] },
  { industry: '基础化工', codes: ['600989'], names: ['宝丰能源'] }
];

const INDUSTRY_KEYWORDS = [
  ['传媒', '传媒'], ['广告', '传媒'], ['影视', '传媒'], ['游戏', '传媒'],
  ['煤', '煤炭'], ['石油', '石油石化'], ['化工', '基础化工'],
  ['银行', '银行'], ['证券', '非银金融'], ['保险', '非银金融'],
  ['白酒', '白酒'], ['酒', '食品饮料'], ['食品', '食品饮料'],
  ['电力', '公用事业'], ['电网', '公用事业'], ['电池', '电力设备'], ['光伏', '电力设备'],
  ['计算机', '计算机'], ['软件', '计算机'], ['通信', '通信'],
  ['电子', '电子'], ['芯', '电子'], ['半导体', '电子'],
  ['汽车', '汽车'], ['上汽', '汽车'], ['机械', '机械设备'], ['建筑', '建筑装饰'], ['水泥', '建筑材料'],
  ['钢', '钢铁'], ['医药', '医药生物'], ['药', '医药生物'],
  ['地产', '房地产'], ['航运', '交通运输'], ['物流', '交通运输'],
  ['环保', '环保'], ['有色', '有色金属'], ['钼', '有色金属']
];

const STOCK_QUERY_ALIASES = {
  '上汽股份': 'sh600104'
};

function normalizeStockQuery(value) {
  const text = String(value || '').trim();
  return STOCK_QUERY_ALIASES[text] || text;
}

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .replace(/\.(SH|SZ)$/i, '')
    .replace(/^(sh|sz)/i, '')
    .replace(/\D/g, '');
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pct(value, digits = 1) {
  const num = finiteNumber(value);
  return num === null ? '-' : `${num.toFixed(digits)}%`;
}

function formatMetric(value, digits = 2) {
  const num = finiteNumber(value);
  return num === null ? '-' : num.toFixed(digits);
}

function formatPrice(value) {
  const num = finiteNumber(value);
  return num === null || num <= 0 ? '-' : num.toFixed(2);
}

function minDefined(values) {
  const nums = values.filter(value => finiteNumber(value) !== null && finiteNumber(value) > 0).map(Number);
  return nums.length ? Math.min(...nums) : null;
}

function resolveStockIndustry(quote, query) {
  const code = normalizeCode(quote.code || query);
  const name = String(quote.name || query || '').trim();
  const hit = STOCK_INDUSTRY_HINTS.find(item => {
    return item.codes.includes(code) || item.names.some(itemName => itemName === name || name.includes(itemName) || itemName.includes(name));
  });
  if (hit) {
    return { industry: hit.industry, confidence: 'mapped', source: 'project-stock-industry-map' };
  }
  const keyword = INDUSTRY_KEYWORDS.find(([word]) => name.includes(word));
  if (keyword) {
    return { industry: keyword[1], confidence: 'keyword', source: `name-keyword:${keyword[0]}` };
  }
  return { industry: null, confidence: 'unknown', source: 'unmapped' };
}

function valuationProfile(quote) {
  const pe = finiteNumber(quote.pe);
  const pb = finiteNumber(quote.pb);
  let score = 50;
  const notes = [];

  if (pe === null || pe <= 0) {
    notes.push('PE_TTM缺失，估值安全边际需要财报继续确认');
    score -= 8;
  } else if (pe <= 10) {
    score += 18;
    notes.push(`PE_TTM ${pe.toFixed(1)}，估值偏低，但需排除周期下行或一次性利润`);
  } else if (pe <= 20) {
    score += 20;
    notes.push(`PE_TTM ${pe.toFixed(1)}，估值处在相对舒适区`);
  } else if (pe <= 35) {
    score += 8;
    notes.push(`PE_TTM ${pe.toFixed(1)}，估值中性，需要成长性匹配`);
  } else if (pe <= 55) {
    score -= 8;
    notes.push(`PE_TTM ${pe.toFixed(1)}，估值偏贵，容错率下降`);
  } else {
    score -= 20;
    notes.push(`PE_TTM ${pe.toFixed(1)}，估值很高，必须有强成长或景气验证`);
  }

  if (pb === null || pb <= 0) {
    notes.push('PB缺失，净资产口径暂不能交叉验证');
    score -= 4;
  } else if (pb <= 1) {
    score += 14;
    notes.push(`PB ${pb.toFixed(2)}，破净或接近破净，适合重点看资产质量`);
  } else if (pb <= 3) {
    score += 12;
    notes.push(`PB ${pb.toFixed(2)}，净资产估值压力可控`);
  } else if (pb <= 5) {
    score += 2;
    notes.push(`PB ${pb.toFixed(2)}，需要ROE支撑`);
  } else if (pb <= 8) {
    score -= 8;
    notes.push(`PB ${pb.toFixed(2)}，账面估值偏高`);
  } else {
    score -= 16;
    notes.push(`PB ${pb.toFixed(2)}，对盈利质量和增长要求很高`);
  }

  score = clamp(score, 0, 100);
  const label = score >= 75 ? '价投底线较稳' : score >= 60 ? '估值中性偏可跟踪' : score >= 45 ? '估值需要验证' : '价投安全边际不足';
  return { score, label, notes, pe, pb };
}

function valuePointProfile(quote, value, technical, flow) {
  const price = finiteNumber(quote.last);
  const pe = finiteNumber(value.pe);
  const pb = finiteNumber(value.pb);
  const eps = price && pe && pe > 0 ? price / pe : null;
  const bvps = price && pb && pb > 0 ? price / pb : null;
  const peWatch = eps ? eps * 18 : null;
  const peDeep = eps ? eps * 15 : null;
  const peRisk = eps ? eps * 35 : null;
  const pbWatch = bvps ? bvps * 3 : null;
  const pbDeep = bvps ? bvps * 2 : null;
  const pbRisk = bvps ? bvps * 5 : null;
  const watchCeiling = minDefined([peWatch, pbWatch]);
  const deepValueLine = minDefined([peDeep, pbDeep]);
  const riskLine = minDefined([peRisk, pbRisk]);
  const isValueZone = value.score >= 60 && (pe === null || pe <= 20) && (pb === null || pb <= 3);
  const hasMarketConfirm = technical.score >= 55 || flow.score >= 55;

  let label = '估值等待';
  let buyTrigger = '估值安全边际还不充分，暂不定义价投买点。';
  if (isValueZone && hasMarketConfirm) {
    label = '估值合格，等待回踩买点';
    buyTrigger = '买点触发：估值已在可跟踪区，等回踩不破、资金转正或量价重新走强时才成立。';
  } else if (isValueZone) {
    label = '估值合格，盘面未确认';
    buyTrigger = '买点触发：估值合格，但量价/资金未确认，先等止跌、缩量回踩或主力流出收敛。';
  } else if (watchCeiling && price && price <= watchCeiling) {
    label = '价格在观察区，质地待补';
    buyTrigger = '买点触发：价格已接近估值观察区，但需要ROE、现金流、分红等价投字段补齐后再升级。';
  }

  const sellTrigger = riskLine
    ? `卖点/降级：若估值扩张到PE约35倍或PB约5倍对应的高估线附近（参考价约${formatPrice(riskLine)}），且资金转弱，应降级或退出观察。`
    : '卖点/降级：若PE/PB显著抬升且资金转弱，或基本面逻辑被证伪，应降级或退出观察。';

  const deepText = deepValueLine ? `深度价值参考线约${formatPrice(deepValueLine)}` : '深度价值线待估算';
  const watchText = watchCeiling ? `估值观察上限约${formatPrice(watchCeiling)}` : '估值观察上限待估算';
  const riskText = riskLine ? `高估降级线约${formatPrice(riskLine)}` : '高估降级线待估算';

  return {
    label,
    price,
    eps,
    bvps,
    watch_ceiling: watchCeiling,
    deep_value_line: deepValueLine,
    risk_line: riskLine,
    buy_trigger: buyTrigger,
    sell_trigger: sellTrigger,
    summary: `${label}：${watchText}，${deepText}，${riskText}。${buyTrigger}${sellTrigger}`
  };
}

function technicalProfile(quote) {
  const change = finiteNumber(quote.changePercent) || 0;
  const abs = Math.abs(change);
  let score = 50;
  let label = '震荡等待';
  let note = '涨跌幅接近中性，等待量价方向选择';

  if (change >= 7) {
    score = 70;
    label = '短线过热';
    note = '涨幅接近涨停，情绪强但不适合追第一波';
  } else if (change >= 3) {
    score = 68;
    label = '强势确认';
    note = '涨幅较强，说明短线承接不错，但仍要看量能持续';
  } else if (change >= 0.5) {
    score = 58;
    label = '温和走强';
    note = '温和上涨，适合观察回踩确认';
  } else if (change <= -5) {
    score = 28;
    label = '趋势承压';
    note = '跌幅较大，短线先处理风险';
  } else if (change <= -2) {
    score = 38;
    label = '回调验证';
    note = '回调中，观察是否缩量止跌';
  } else if (abs >= 0.5) {
    score = 46;
    label = '弱震荡';
    note = '小幅波动，暂未给出强确认';
  }

  return { score, label, note, change };
}

function flowProfile(quote) {
  const netInflow = finiteNumber(quote.netInflow);
  if (netInflow === null) {
    return { score: 45, label: '资金数据不足', note: '主力净流入暂缺，需结合成交额和盘口承接确认', netInflow };
  }
  if (netInflow > 1) {
    return { score: 72, label: '资金明显流入', note: `主力净流入约${netInflow.toFixed(2)}亿，短线承接较强`, netInflow };
  }
  if (netInflow > 0) {
    return { score: 60, label: '资金小幅流入', note: `主力净流入约${netInflow.toFixed(2)}亿，偏正向确认`, netInflow };
  }
  if (netInflow < -1) {
    return { score: 28, label: '资金明显流出', note: `主力净流出约${Math.abs(netInflow).toFixed(2)}亿，先降级观察`, netInflow };
  }
  if (netInflow < 0) {
    return { score: 42, label: '资金小幅流出', note: `主力净流出约${Math.abs(netInflow).toFixed(2)}亿，承接偏弱`, netInflow };
  }
  return { score: 50, label: '资金持平', note: '主力资金基本持平，等待方向选择', netInflow };
}

function buildMysticProfile(quote, query, date) {
  const resolved = resolveStockIndustry(quote, query);
  const bazi = getBaZi(date);
  const fiveCount = countFiveElements(bazi, { includeHour: false });
  const scoring = scoreSwIndustries({
    bazi,
    fiveCount,
    marketData: { reportDate: date }
  });
  const signals = Object.entries(scoring.element_signals?.normalized || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 3)
    .map(([element, value]) => `${element}${pct(Number(value) * 100, 1)}`);

  if (!resolved.industry) {
    return {
      score: 50,
      label: '行业五行待确认',
      industry: null,
      confidence: resolved.confidence,
      source: resolved.source,
      note: `今日三柱五行信号：${signals.join(' / ') || '待计算'}；该标的行业映射暂未维护，先不强行给五行结论。`,
      signal: signals,
      rankedIndustry: null
    };
  }

  const rankedIndustry = (scoring.industries || []).find(item => item.name === resolved.industry);
  const score = finiteNumber(rankedIndustry?.factor_score) ?? 50;
  const label = score >= 80 ? '行业气顺' : score >= 60 ? '中性偏顺' : score >= 40 ? '中性验证' : '行业逆风';
  const elementText = rankedIndustry?.element_profile || rankedIndustry?.element_name || '五行暴露待确认';
  return {
    score,
    label,
    industry: resolved.industry,
    confidence: resolved.confidence,
    source: resolved.source,
    note: `${resolved.industry}今日五行适配分${score.toFixed(1)}，${label}；行业暴露：${elementText}；今日三柱信号：${signals.join(' / ') || '待计算'}。`,
    signal: signals,
    rankedIndustry
  };
}

function buildDecision(mystic, value, technical, flow) {
  const weightedScore = Math.round(
    mystic.score * 0.25 +
    value.score * 0.35 +
    technical.score * 0.20 +
    flow.score * 0.20
  );
  const blockers = [];
  if (value.score < 45) blockers.push('价投安全边际不足');
  if (mystic.score < 40) blockers.push('行业五行短期逆风');
  if (technical.score < 40) blockers.push('量价趋势承压');
  if (flow.score < 40) blockers.push('资金承接偏弱');

  if (value.score < 45) {
    return {
      level: 'observe',
      score: weightedScore,
      label: '只观察，不列核心',
      summary: `价投底线优先：${value.label}，即使行业顺势也不直接升级。`,
      action: '先等估值/财务口径补齐或价格回到更有安全边际的位置。',
      blockers
    };
  }
  if (mystic.score >= 60 && value.score >= 60 && (technical.score >= 55 || flow.score >= 55)) {
    return {
      level: 'focus',
      score: weightedScore,
      label: '重点跟踪',
      summary: '行业五行先验、估值底线和盘面确认至少两项同向，可进入重点观察池。',
      action: '只做跟踪和验证：等待回踩、量能和资金连续性，不追高。',
      blockers
    };
  }
  if (mystic.score < 40 && value.score >= 60) {
    return {
      level: 'watch',
      score: weightedScore,
      label: '基本面可看，时机不占优',
      summary: '价投层不差，但行业五行短期不顺，适合放入中线观察而不是短线主线。',
      action: '等行业信号修复或资金连续流入后再升级。',
      blockers
    };
  }
  if (technical.score < 40 || flow.score < 40) {
    return {
      level: 'verify',
      score: weightedScore,
      label: '逻辑有，但等盘面确认',
      summary: '行业/估值逻辑尚可，但量价或资金没有确认。',
      action: '先看缩量止跌、主力流出收敛或相对强度修复。',
      blockers
    };
  }
  return {
    level: 'watch',
    score: weightedScore,
    label: '可跟踪验证',
    summary: '没有明显一票否决项，但也未形成强确认。',
    action: '放入观察池，继续用估值、资金、趋势三条线复核。',
    blockers
  };
}

function buildIntegratedStockAnalysis(quote, query, options = {}) {
  const date = options.date ? new Date(options.date) : new Date();
  const mystic = buildMysticProfile(quote, query, date);
  const value = valuationProfile(quote);
  const technical = technicalProfile(quote);
  const flow = flowProfile(quote);
  const valuePoints = valuePointProfile(quote, value, technical, flow);
  const decision = buildDecision(mystic, value, technical, flow);

  const analysis = {
    version: 'stock-integrated-rule-v1',
    decision,
    mystic: mystic.note,
    fundamental: `${value.label}：${value.notes.join('；')}。${valuePoints.summary} 当前只接入PE_TTM/PB，ROE、现金流、分红等深度价投字段仍需后续数据源补齐。`,
    value_points: valuePoints.summary,
    technical: `${technical.label}：${technical.note}；当前涨跌幅${pct(technical.change, 2)}。`,
    flow: `${flow.label}：${flow.note}。`,
    news: `市场情绪参考：${technical.label}；该字段不再单独作为决策依据，已并入量价确认。`,
    factors: {
      mystic,
      value,
      value_points: valuePoints,
      technical,
      flow
    },
    badges: [
      mystic.label,
      value.label,
      technical.label,
      flow.label
    ],
    caveats: [
      '玄学层只做行业与时机先验，不替代基本面研究。',
      '价投层目前只接入PE_TTM/PB，缺少ROE、现金流、分红和负债率时不能直接下结论。',
      '所有结论仅用于复盘和观察池管理，不构成买卖建议。'
    ]
  };

  return analysis;
}

module.exports = {
  buildIntegratedStockAnalysis,
  normalizeStockQuery,
  resolveStockIndustry
};

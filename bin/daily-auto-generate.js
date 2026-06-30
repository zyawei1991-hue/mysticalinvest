#!/usr/bin/env node

/**
 * 自动生成每日早盘日报并推送到飞书群
 * 用法: node daily-auto-generate.js [webhook-url] [group-url]
 */

const https = require('https');
const http = require('http');
// 使用中国时区（CST = UTC+8）
process.env.TZ = 'Asia/Shanghai';
const { getBaZi, countFiveElements, getEnhancedIndustries } = require('../backend/bazi.js');
const { getIndexData, getGlobalIndexData, getLimitStocks, getMarketBreadth } = require('../backend/market.js');
const { callLLM } = require('../backend/llm.js');

// 今日日期
const today = new Date();
const dateStr = today.toISOString().split('T')[0];

// 配置
const WEBHOOK_URL = process.env.FEISHU_WEBHOOK || process.argv[2] || '';
const SITE_URL = process.env.DAILY_SITE_URL || 'http://117.72.58.55/daily/';

// 行业五行颜色
const elementNames = {
  '木': '木', '火': '火', '土': '土', '金':'金', '水': '水'
};

// 行业推荐标的映射（用于日报生成）
const industryStocksMap = {
  '银行': [{ name: '招商银行', code: '600036' }, { name: '银行ETF', code: '512800' }],
  '保险': [{ name: '中国平安', code: '601318' }, { name: '保险主题LOF', code: '167301' }],
  '证券': [{ name: '中信证券', code: '600030' }, { name: '券商ETF', code: '512000' }],
  '有色金属': [{ name: '紫金矿业', code: '601899' }, { name: '有色ETF', code: '512400' }],
  '钢铁': [{ name: '宝钢股份', code: '600019' }, { name: '钢铁ETF', code: '515210' }],
  '煤炭': [{ name: '中国神华', code: '601088' }, { name: '煤炭ETF', code: '515220' }],
  '农林牧渔': [{ name: '牧原股份', code: '002714' }, { name: '农业ETF', code: '159825' }],
  '医药生物': [{ name: '恒瑞医药', code: '600276' }, { name: '医药ETF', code: '512010' }],
  '食品饮料': [{ name: '贵州茅台', code: '600519' }, { name: '食品ETF', code: '515710' }],
  '物流': [{ name: '顺丰控股', code: '002352' }, { name: '物流ETF', code: '516910' }],
  '传媒': [{ name: '分众传媒', code: '002027' }, { name: '传媒ETF', code: '512980' }],
  '电力': [{ name: '长江电力', code: '600900' }, { name: '电力ETF', code: '159611' }],
  '新能源': [{ name: '宁德时代', code: '300750' }, { name: '新能源ETF', code: '516160' }],
  '半导体': [{ name: '中芯国际', code: '688981' }, { name: '芯片ETF', code: '159995' }],
  '房地产': [{ name: '万科A', code: '000002' }, { name: '房地产ETF', code: '512200' }],
  '建筑': [{ name: '中国建筑', code: '601668' }, { name: '基建ETF', code: '516950' }],
  '军工': [{ name: '中航沈飞', code: '600760' }, { name: '军工ETF', code: '512660' }],
  '通信': [{ name: '中兴通讯', code: '000063' }, { name: '通信ETF', code: '515880' }],
  '计算机': [{ name: '海康威视', code: '002415' }, { name: '计算机ETF', code: '512720' }],
  '汽车': [{ name: '比亚迪', code: '002594' }, { name: '汽车ETF', code: '516110' }],
  '化工': [{ name: '万华化学', code: '600309' }, { name: '化工ETF', code: '516020' }],
  '机械': [{ name: '三一重工', code: '600031' }, { name: '机械ETF', code: '516960' }],
  '家电': [{ name: '美的集团', code: '000333' }, { name: '家电ETF', code: '159996' }],
  '纺织': [{ name: '海澜之家', code: '600398' }, { name: '纺织ETF', code: '516610' }]
};

const YEAR_CORRECTION_2026 = { '金': -0.15, '木': 0.05, '水': -0.10, '火': 0.25, '土': 0.05 };

function formatPct(value) {
  const n = Number(value || 0);
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function formatIndexLine(item) {
  if (!item || !Number.isFinite(item.last)) return null;
  return `${item.name}: ${item.last.toFixed(2)} (${formatPct(item.changePercent)})`;
}

function getGlobalTone(globalIndexes) {
  const nasdaq = Number(globalIndexes.nasdaq?.changePercent || 0);
  const hsi = Number(globalIndexes.hsi?.changePercent || 0);
  if (nasdaq > 1 && hsi >= -0.5) return '海外风险偏好偏暖，成长资产情绪占优';
  if (nasdaq < -1 || hsi < -1) return '海外风险偏好偏弱，需防外盘拖累';
  return '海外风险偏好中性，A股更多看自身量能和政策预期';
}

function getStyleTone(hs300Change, cyChange) {
  const hs = Number(hs300Change || 0);
  const cy = Number(cyChange || 0);
  if (cy - hs > 1) return '成长风格强于权重，科技、电力设备和高弹性板块更活跃';
  if (hs - cy > 1) return '权重风格强于成长，金融、周期和红利资产更稳';
  return '权重与成长相对均衡，适合在强势行业中精选标的';
}

function buildOperationAdvice(params) {
  const { hs300Change, shChange, cyChange, marketBreadth, limitStocks, globalIndexes, industries } = params;
  const hs = Number(hs300Change || 0);
  const sh = Number(shChange || 0);
  const cy = Number(cyChange || 0);
  const up = Number(marketBreadth.up || 0);
  const down = Number(marketBreadth.down || 0);
  const nasdaq = Number(globalIndexes.nasdaq?.changePercent || 0);
  const hsi = Number(globalIndexes.hsi?.changePercent || 0);
  const topIndustries = (industries || []).filter(i => i.rating >= 4).slice(0, 3).map(i => i.name).join('、') || '强势主线';

  let stance = '中性观察';
  let position = '稳健仓位控制在4成以内，等待量能和主线确认';
  let rhythm = '不追高，优先等回踩确认后分批配置';
  if (hs > 0.8 && cy > 1 && nasdaq >= 0) {
    stance = '偏进攻';
    position = '稳健账户可维持5-6成，激进账户不超过7成';
    rhythm = '围绕强势主线低吸，避免盘中连续拉升后追价';
  } else if (hs > 0 && sh > 0) {
    stance = '持仓观察';
    position = '维持4-5成，优先保留趋势仍在的仓位';
    rhythm = '冲高不加仓，回踩缩量再考虑补仓';
  } else if (hs < -1 || hsi < -1) {
    stance = '防守降噪';
    position = '降到3成以内，等待指数企稳';
    rhythm = '先处理弱势标的，少做逆势扩仓';
  }

  const breadthText = up > 0 || down > 0
    ? `上涨${up}家、下跌${down}家`
    : '涨跌家数暂缺，以指数和行业强度代替';
  const risk = `若沪深300回落超过1%或外盘科技/港股同步转弱，降低仓位；若${topIndustries}不能延续强度，避免扩大持仓。`;

  return {
    stance,
    position,
    rhythm,
    summary: `结论：${stance}；${position}；${rhythm}。`,
    risk,
    macro: [
      getGlobalTone(globalIndexes),
      getStyleTone(hs300Change, cyChange),
      `市场宽度：${breadthText}；涨停${limitStocks.up.length}只、跌停${limitStocks.down.length}只。`
    ],
    focus: topIndustries
  };
}

function correctedFactors(fiveCount) {
  const rows = Object.entries(fiveCount.count || {}).map(([element, raw]) => {
    const correction = YEAR_CORRECTION_2026[element] || 0;
    return { element, raw, correction, score: raw * (1 + correction) };
  }).sort((a, b) => b.score - a.score);
  const total = rows.reduce((sum, item) => sum + item.score, 0) || 1;
  return rows.map(item => ({ ...item, weight: item.score / total }));
}

function buildInvestmentSummary(params) {
  const { hs300Value, hs300Change, shValue, shChange, szValue, szChange, cyValue, cyChange, marketBreadth, limitStocks, globalIndexes, factors, industries, operationAdvice } = params;
  const globalLines = [globalIndexes.dow, globalIndexes.nasdaq, globalIndexes.sp500, globalIndexes.hsi]
    .map(formatIndexLine)
    .filter(Boolean);
  const topFactors = factors.slice(0, 3).map(item => `${item.element}${Math.round(item.weight * 100)}%`).join(' / ');
  const topIndustries = industries.slice(0, 4).map(item => `${item.name}${item.rating ? '(' + item.rating + '星/' + (item.element_profile || item.element_name || '') + ')' : ''}`).join('、');
  const breadthText = `上涨${marketBreadth.up || 0} / 下跌${marketBreadth.down || 0} / 平盘${marketBreadth.flat || 0}`;
  const limitText = `涨停${limitStocks.up.length}只 / 跌停${limitStocks.down.length}只`;
  const tone = Number(hs300Change) >= 0 && (marketBreadth.up || 0) >= (marketBreadth.down || 0)
    ? '风险偏好偏暖'
    : Number(hs300Change) < -1
      ? '风险偏好偏弱'
      : '风险偏好中性';

  return [
    '【今日操作建议】',
    operationAdvice.summary,
    `重点方向：${operationAdvice.focus}。`,
    `风险触发：${operationAdvice.risk}`,
    '',
    '【市场概览】',
    `A股：沪深300 ${hs300Value} (${formatPct(hs300Change)})，上证 ${shValue} (${formatPct(shChange)})，深成指 ${szValue} (${formatPct(szChange)})，创业板 ${cyValue} (${formatPct(cyChange)})。`,
    `市场宽度：${breadthText}；情绪温度：${limitText}；综合判断：${tone}。`,
    '',
    '【海外与宏观】',
    globalLines.length ? globalLines.join('；') + '。' : '海外指数数据暂不可用，今日以A股实时数据为主。',
    operationAdvice.macro.map(line => `- ${line}`).join('\n'),
    '跟踪重点：美股科技风险偏好、港股情绪、人民币汇率与北向资金方向。',
    '',
    '【五行行业因子】',
    `2026丙午修正：火+25%、木/土+5%、水-10%、金-15%；修正后因子：${topFactors}。`,
    `今日方向：${topIndustries || '等待资金方向确认'}。`,
    '',
    '【操作纪律】',
    '只把五行作为行业因子标签，最终以资金、指数趋势、成交量与风险控制为准。'
  ].join('\n');
}

function buildCardSummary(data) {
  const industries = (data.industries || []).slice(0, 3).map(i => i.name).join('、') || '等待确认';
  const global = data.global_indexes || {};
  const globalHint = [global.nasdaq, global.hsi].map(formatIndexLine).filter(Boolean).join('；');
  return [
    `**${data.report_date} ${data.report_type} 投资日报已生成**`,
    `沪深300 ${formatPct(data.hs300_change)}，上证 ${formatPct(data.sh_change)}，创业板 ${formatPct(data.cy_change)}`,
    data.operation_advice ? `操作建议：${data.operation_advice.stance}；${data.operation_advice.position}` : '',
    `关注方向：${industries}`,
    globalHint ? `海外参考：${globalHint}` : '',
    '点击下方按钮查看完整日报。'
  ].filter(Boolean).join('\n');
}

// 获取A股真实行情数据
async function generateDailyData() {
  let hs300Value, hs300Change, shValue, shChange, szValue, szChange, cyValue, cyChange;
  let marketBreadth = { up: 0, down: 0, flat: 0 };
  let limitStocks = { up: [], down: [] };
  let globalIndexes = {};
  
  try {
    // 从market.js获取真实行情
    const index = await getIndexData();
    hs300Value = index.hs300.last.toFixed(2);
    hs300Change = index.hs300.changePercent.toFixed(2);
    shValue = index.sh.last.toFixed(2);
    shChange = index.sh.changePercent.toFixed(2);
    szValue = index.sz?.last?.toFixed(2) || 0;
    szChange = index.sz?.changePercent?.toFixed(2) || 0;
    // 创业板指（直接使用 getIndexData 返回的 cyb）
    try {
      if (index.cyb) {
        cyValue = index.cyb.last.toFixed(2);
        cyChange = index.cyb.changePercent.toFixed(2);
      } else {
        cyValue = 0;
        cyChange = 0;
      }
    } catch (e) {
      cyValue = 0;
      cyChange = 0;
    }
    console.log('获取指数行情成功:', {hs300Value, hs300Change, shValue, shChange});
  } catch (e) {
    console.error('获取指数行情失败:', e.message);
    throw new Error('无法获取实盘数据，日报生成失败');
  }
  
  // 获取市场涨跌家数
  try {
    marketBreadth = await getMarketBreadth();
    console.log('获取涨跌家数成功:', marketBreadth);
  } catch (e) {
    console.warn('获取涨跌家数失败:', e.message);
  }
  
  // 获取涨跌停数据
  try {
    limitStocks = await getLimitStocks();
    console.log('获取涨跌停数据成功:', limitStocks);
  } catch (e) {
    console.warn('获取涨跌停数据失败:', e.message);
  }

  try {
    globalIndexes = await getGlobalIndexData();
    console.log('获取海外指数成功:', globalIndexes);
  } catch (e) {
    console.warn('获取海外指数失败:', e.message);
  }
  
  // 八字排盘（精确农历计算）
  const bazi = getBaZi(today);
  const fiveCount = countFiveElements(bazi);
  const factors = correctedFactors(fiveCount);
  const marketData = { hs300Change: parseFloat(hs300Change), upStocks: limitStocks.up };
  const industries = getEnhancedIndustries(bazi, fiveCount, marketData);
  const industryNames = industries.map(i => i.name);
  const operationAdvice = buildOperationAdvice({
    hs300Change, shChange, cyChange, marketBreadth, limitStocks, globalIndexes, industries
  });
  const fiveElementsAnalysis = buildInvestmentSummary({
    hs300Value, hs300Change, shValue, shChange, szValue, szChange, cyValue, cyChange,
    marketBreadth, limitStocks, globalIndexes, factors, industries, operationAdvice
  });
  
  // 时段判断
  const hour = today.getHours();
  let reportType = 'morning';
  let cardTitle = `五行投资早盘日报 ${dateStr}`;
  if (hour >= 11 && hour < 14) {
    reportType = 'noon';
    cardTitle = `五行投资午间日报 ${dateStr}`;
  } else if (hour >= 15) {
    reportType = 'evening';
    cardTitle = `五行投资盘后总结 ${dateStr}`;
  }

  // 基于大模型动态推荐关注标的
  let watchStocks = [];
  try {
    const industryContext = industries.slice(0, 6).map(function(industry) {
      const stocks = (industry.stocks || []).map(s => s.name + '(' + s.code + ')').join('、');
      return `${industry.name}｜评分${industry.factor_score || '-'}｜暴露${industry.element_profile || industry.element_name}｜候选:${stocks}`;
    }).join('\n');
    const prompt = '你是一位A股投资分析师。根据以下市场数据，推荐3-5只今日值得关注的A股标的（仅限A股，给出股票名称和6位代码）。\n' +
      '【市场数据】\n' +
      '- 沪深300: ' + hs300Value + '(' + hs300Change + '%)\n' +
      '- 上证指数: ' + shValue + '(' + shChange + '%)\n' +
      '- 深证成指: ' + szValue + '(' + szChange + '%)\n' +
      '- 创业板指: ' + cyValue + '(' + cyChange + '%)\n' +
      '- 上涨家数: ' + marketBreadth.up + ' | 下跌家数: ' + marketBreadth.down + '\n' +
      '- 涨停: ' + limitStocks.up.length + '只 | 跌停: ' + limitStocks.down.length + '只\n' +
      '- 海外指数: ' + [globalIndexes.dow, globalIndexes.nasdaq, globalIndexes.sp500, globalIndexes.hsi].map(formatIndexLine).filter(Boolean).join('；') + '\n' +
      '- 操作建议: ' + operationAdvice.summary + '\n' +
      '【行业因子】\n' +
      '修正后五行因子:' + factors.map(function(x) { return x.element + ':' + Math.round(x.weight * 100) + '%'; }).join(' ') + '\n' +
      '推荐行业:' + industryNames.join('、') + '\n' +
      '行业多属性暴露与候选标的:\n' + industryContext + '\n' +
      '优先从候选标的中选择，除非有更强的指数、资金或行业景气逻辑。\n' +
      '只输出投资逻辑：指数、资金、行业景气、风险控制；不要输出非投资术语。\n\n' +
      '严格按照以下 JSON 格式输出（只输出JSON，不要有其他内容）：\n' +
      '[{"name": "股票名称", "code": "6位代码", "reason": "推荐理由（20字内）"}]';
    const llmResponse = await callLLM(prompt);
    console.log('LLM 返回:', llmResponse);
    const jsonMatch = llmResponse.match(/\[.*\]/s);
    const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse.trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      watchStocks = parsed.slice(0, 5).map(function(s) {
        return {
          name: s.name,
          code: s.code,
          alert_level: 'green',
          suggestion: '关注',
          reason: s.reason || industryNames.slice(0, 2).join('、') + '板块机会'
        };
      });
    }
  } catch (e) {
    console.error('LLM 调用失败，使用静态推荐:', e.message);
    const strongIndustries = industries.filter(item => item.rating >= 4).slice(0, 3);
    strongIndustries.forEach(function(industry) {
      const industryName = industry.name;
      const stocks = industryStocksMap[industryName];
      if (stocks && stocks.length > 0) {
        watchStocks.push({
          name: stocks[0].name,
          code: stocks[0].code,
          alert_level: 'green',
          suggestion: '关注',
          reason: industryName + '板块资金与因子共振'
        });
      }
    });
  }

  const seenStockCodes = new Set(watchStocks.map(s => s.code));
  industries.slice(0, 6).forEach(function(industry) {
    (industry.stocks || []).forEach(function(stock) {
      if (watchStocks.length >= 6) return;
      if (!stock.code || seenStockCodes.has(stock.code)) return;
      seenStockCodes.add(stock.code);
      watchStocks.push({
        name: stock.name,
        code: stock.code,
        alert_level: 'green',
        suggestion: operationAdvice.stance === '防守降噪' ? '观望' : '关注',
        reason: industry.name + '多属性因子靠前'
      });
    });
  });

  return {
    report_date: dateStr,
    report_type: reportType,
    hs300_value: parseFloat(hs300Value),
    hs300_change: parseFloat(hs300Change),
    sh_value: parseFloat(shValue),
    sh_change: parseFloat(shChange),
    sz_value: parseFloat(szValue),
    sz_change: parseFloat(szChange),
    cy_value: parseFloat(cyValue || 0),
    cy_change: parseFloat(cyChange || 0),
    // 移除持仓盈亏字段，只保留关注标的数量
    holding_count: watchStocks.length,
    stocks: watchStocks,
    five_elements: fiveElementsAnalysis,
    prediction: null,
    bazi_interpretation: null,
    card_title: cardTitle,
    bazi_json: JSON.stringify(bazi),
    industries_json: JSON.stringify(industries),
    global_indexes: globalIndexes,
    card_summary: buildCardSummary({ report_date: dateStr, report_type: reportType, hs300_change: parseFloat(hs300Change), sh_change: parseFloat(shChange), cy_change: parseFloat(cyChange), industries, global_indexes: globalIndexes, operation_advice: operationAdvice }),
    risk_warning: operationAdvice.risk,
    // 添加实盘数据到日报
    market_breadth: marketBreadth,
    limit_stocks: limitStocks
  };
}

// 涨跌/超涨判断
function getTrendDescription(change) {
  if (change > 1) return '继续冲高，注意回调风险';
  if (change > 0) return '震荡整理，有望继续上攻';
  if (change > -1) return '探底回升，关注支撑力度';
  return '继续寻底，耐心等待企稳';
}

// 创建日报到服务器
function createReport(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// 推送到飞书群
function pushToFeishu(data, webhookUrl, siteUrl) {
  return new Promise((resolve, reject) => {
    const content = {
      "msg_type": "interactive",
      "card": {
        "header": {
          "title": {
            "content": data.card_title,
            "tag": "plain_text"
          }
        },
        "elements": [
          {
            "tag": "div",
            "text": {
              "content": data.card_summary || "投资日报已生成，点击下方查看详情。",
              "tag": "lark_md"
            }
          },
          {
            "tag": "hr"
          },
          {
            "tag": "action",
            "actions": [
              {
                "tag": "button",
                "text": {
                  "content": "📊 查看今日日报",
                  "tag": "plain_text"
                },
                "url": siteUrl,
                "type": "default"
              }
            ]
          }
        ]
      }
    };

    const postData = JSON.stringify(content);
    
    let hostname, path, port;
    if (webhookUrl.startsWith('https://')) {
      const url = new URL(webhookUrl);
      hostname = url.hostname;
      path = url.pathname + url.search;
      port = 443;
    } else {
      const url = new URL(webhookUrl);
      hostname = url.hostname;
      path = url.pathname + url.search;
      port = 80;
    }

    const options = {
      hostname: hostname,
      port: port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = (webhookUrl.startsWith('https://') ? https : http).request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(body);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// 主函数
async function main() {
  const hour = today.getHours();
  console.log(`开始生成${hour >= 9 && hour < 10 ? '早盘' : hour >= 11 && hour < 14 ? '午间' : hour >= 15 ? '盘后' : '早盘'}日报...`);
  
  // 生成数据
  const data = await generateDailyData();
  console.log('生成数据完成:', JSON.stringify(data, null, 2));
  
  try {
    const result = await createReport(data);
    console.log('创建日报结果:', result);
    
    if (WEBHOOK_URL) {
      console.log('推送飞书群...');
      const pushResult = await pushToFeishu(data, WEBHOOK_URL, SITE_URL);
      console.log('推送结果:', pushResult);
      console.log('完成！');
    } else {
      console.log('未配置飞书Webhook，跳过推送');
    }
  } catch (e) {
    console.error('错误:', e);
    process.exit(1);
  }
}

main();

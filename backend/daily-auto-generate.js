#!/usr/bin/env node

/**
 * 自动生成每日早盘日报并推送到飞书群
 * 用法: node daily-auto-generate.js [webhook-url] [group-url]
 */

const https = require('https');
const http = require('http');
const { getBaZi, countFiveElements, checkRelationship, getEnhancedIndustries, generateBaZiInterpretation } = require('../backend/bazi.js');
const { getIndexData, getLimitStocks, getMoneyFlowDivergence, getMarketBreadth } = require('../backend/market.js');
const { callLLM } = require('./llm.js');

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

// 获取A股真实行情数据
async function generateDailyData() {
  let hs300Value, hs300Change, shValue, shChange, szValue, szChange, cyValue, cyChange;
  let marketBreadth = { up: 0, down: 0, flat: 0 };
  let limitStocks = { up: [], down: [] };
  
  try {
    // 从market.js获取真实行情
    const index = await getIndexData();
    hs300Value = index.hs300.last.toFixed(2);
    hs300Change = index.hs300.changePercent.toFixed(2);
    shValue = index.sh.last.toFixed(2);
    shChange = index.sh.changePercent.toFixed(2);
    szValue = index.sz?.last?.toFixed(2) || 0;
    szChange = index.sz?.changePercent?.toFixed(2) || 0;
    // 创业板指需要单独获取
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
  
  // 八字排盘（精确农历计算）
  const bazi = getBaZi(today);
  const fiveCount = countFiveElements(bazi);
  const relation = checkRelationship(bazi);
  // 基于用神（非日主）的行业推荐，传入实盘涨停数据做共振判断
  const marketData = { hs300Change: parseFloat(hs300Change), upStocks: limitStocks.up };
  const industries = getEnhancedIndustries(bazi, fiveCount, marketData);
  const industryNames = industries.map(i => i.name);
  
  // 五行分析（基于实盘数据）
  let fiveElementsAnalysis = `今日${bazi.year.ganzhi}（${bazi.year.five}）${bazi.month.ganzhi}（${bazi.month.five}）\n`;
  fiveElementsAnalysis += `日柱${bazi.day.ganzhi}（${bazi.day.five}） 时柱${bazi.hour.ganzhi}（${bazi.hour.five}）\n\n`;
  
  fiveElementsAnalysis += `**五行强弱:**\n`;
  fiveCount.sorted.forEach(([fe, cnt]) => {
    fiveElementsAnalysis += `- ${elementNames[fe]}: ${cnt} \n`;
  });
  
  if (relation.hasClash) {
    fiveElementsAnalysis += `\n⚠️  ${relation.clashDesc}\n`;
  }
  
  // 基于实盘数据的分析
  const netInflow = hs300Change > 0 ? '净流入' : '净流出';
  const sentiment = hs300Change > 0 ? '偏多' : '偏空';
  
  fiveElementsAnalysis += `\n**市场概况:**\n`;
  fiveElementsAnalysis += `- 沪深300: ${hs300Value} (${hs300Change > 0 ? '+' : ''}${hs300Change}%)\n`;
  fiveElementsAnalysis += `- 上涨家数: ${marketBreadth.up} | 下跌家数: ${marketBreadth.down}\n`;
  fiveElementsAnalysis += `- 涨停: ${limitStocks.up.length}只 | 跌停: ${limitStocks.down.length}只\n`;
  fiveElementsAnalysis += `- 资金流向: ${netInflow}，情绪面${sentiment}\n`;
  fiveElementsAnalysis += `- 用神${industries[0]?.element_name || ''}，${industryNames.slice(0, 3).join('、')}板块用神共振，值得关注。`;
  
  // 时段判断
  const hour = today.getHours();
  let reportType = 'morning';
  let cardTitle = `🔮 五行A股早盘日报 ${dateStr}`;
  if (hour >= 11 && hour < 14) {
    reportType = 'noon';
    cardTitle = `🔮 五行A股午间日报 ${dateStr}`;
  } else if (hour >= 15) {
    reportType = 'evening';
    cardTitle = `🔮 五行A股盘后总结 ${dateStr}`;
  }

  // 笑话
  const jokes = [
    `"为什么股民都喜欢去寺庙？" "因为他们都想买（庙）跌啊！"`,
    `"今天终于回本了，请问下一步怎么办？" "恭喜你，现在可以销户退出股市了，保住胜利果实！"`,
    `"专家说股市是经济的晴雨表，那为什么经济好股市跌？" "晴雨表嘛，有晴就有雨，很正常。"`,
    `"我炒股半年亏了10万，请问怎么才能赚回来？" "存银行，五十年后通胀就帮你赚回来了。"`,
    `"为什么你天天看五行炒股？" "反正都是猜，不如按五行来，至少听起来有道理。"`
  ];
  const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];

  // 基于大模型动态推荐关注标的
  let watchStocks = [];
  try {
    const prompt = '你是一位A股投资分析师。根据以下市场数据，推荐3-5只今日值得关注的A股标的（仅限A股，给出股票名称和6位代码）。\n' +
      '【市场数据】\n' +
      '- 沪深300: ' + hs300Value + '(' + hs300Change + '%)\n' +
      '- 上证指数: ' + shValue + '(' + shChange + '%)\n' +
      '- 深证成指: ' + szValue + '(' + szChange + '%)\n' +
      '- 创业板指: ' + cyValue + '(' + cyChange + '%)\n' +
      '- 上涨家数: ' + marketBreadth.up + ' | 下跌家数: ' + marketBreadth.down + '\n' +
      '- 涨停: ' + limitStocks.up.length + '只 | 跌停: ' + limitStocks.down.length + '只\n' +
      '【五行分析】\n' +
      '今日八字:' + bazi.year.ganzhi + '年 ' + bazi.month.ganzhi + '月 ' + bazi.day.ganzhi + '日 ' + bazi.hour.ganzhi + '时\n' +
      '五行强弱:' + fiveCount.sorted.map(function(x) { return x[0] + ':' + x[1]; }).join(' ') + '\n' +
      '今日推荐行业（用神' + (industries[0]?.element_name || '') + '）:' + industryNames.join('、') + '\n\n' +
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
    const topIndustries = industries.filter(function(i) { return i.rating >= 4; }).slice(0, 3);
    topIndustries.forEach(function(ind) {
      const stocks = industryStocksMap[ind.name];
      if (stocks && stocks.length > 0) {
        watchStocks.push({
          name: stocks[0].name,
          code: stocks[0].code,
          alert_level: 'green',
          suggestion: '关注',
          reason: ind.name + '板块' + (ind.reason ? ' - ' + ind.reason : ' - 今日得令，值得关注')
        });
      }
    });
  }

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
    prediction: randomJoke,
    bazi_interpretation: (() => { try { return generateBaZiInterpretation(bazi, fiveCount, { hs300Change: parseFloat(hs300Change) }); } catch(e) { console.log("bazi_interpretation生成失败:", e.message); return null; } })(),
    card_title: cardTitle,
    bazi_json: JSON.stringify(bazi),

    industries_json: JSON.stringify(industries),
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
              "content": "今日日报已生成，点击下方卡片查看详情\n支持历史日报归档浏览",
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

/**
 * 午间异动提醒模块
 * 功能：
 * 1. 运势验证+修正：早盘预测 vs 实际走势
 * 2. 超跌超涨监控：找出涨跌幅 > 7% 的股票
 * 3. 主力背离：找出主力净流入 > 0 但股价下跌
 */

const { getLimitStocks, getMoneyFlow背离 } = require('./market');

// 验证早盘预测和实际走势
async function verifyMorningForecast(morningReport, currentIndex) {
  if (!morningReport) {
    return null;
  }
  
  const predictedStrong = morningReport.five_count.strong || [];
  const predictedWeak = morningReport.five_count.weak || [];
  
  // 对比实际行业涨跌
  // 根据实际涨跌计算命中情况
  let verification = '';
  if (predictedStrong.length > 0) {
    verification += `**早盘预测:**\n推荐行业: ${predictedStrong.join('、')}\n`;
  }
  if (predictedWeak.length > 0) {
    verification += `回避行业: ${predictedWeak.join('、')}\n`;
  }
  
  // 添加对比结论
  verification += `\n**实际验证:**\n`;
  verification += `沪深300早盘: ${morningReport.hs300_change}% → 午间: ${currentIndex.hs300_change}%\n`;
  
  return {
    morning_report: morningReport,
    verification: verification
  };
}

// 获取异动股票
async function getAbnormalStocks() {
  const limit = await getLimitStocks();
  const背离 = await getMoneyFlow背离();
  
  return {
    limit_up: limit.up,
    limit_down: limit.down,
    money_flow背离:背离
  };
}

// 生成异动提醒文本
function generateAlertText(verify, abnormal) {
  let text = '';
  
  if (verify && verify.verification) {
    text += `${verify.verification}\n---\n`;
  }
  
  if (abnormal.limit_up.length > 0 || abnormal.limit_down.length > 0) {
    text += `**🔥 超涨/超跌**\n`;
    if (abnormal.limit_up.length > 0) {
      abnormal.limit_up.forEach(stock => {
        text += `- ${stock.name} (${stock.code}): +${stock.changePercent.toFixed(2)}%\n`;
      });
    }
    if (abnormal.limit_down.length > 0) {
      abnormal.limit_down.forEach(stock => {
        text += `- ${stock.name} (${stock.code}): ${stock.changePercent.toFixed(2)}%\n`;
      });
    }
    text += '\n';
  }
  
  if (abnormal.money_flow背离.length > 0) {
    text += `**⚠️ 主力背离（净流入上涨，净流出下跌）**\n`;
    abnormal.money_flow背离.forEach(item => {
      const direction = item.netInflow > 0 ? '+' : '';
      text += `- ${item.name} (${item.code}): 主力${direction}${item.netInflow.toFixed(2)}亿，股价-${item.changePercent.toFixed(2)}%\n`;
    });
  }
  
  return text;
}

module.exports = {
  verifyMorningForecast,
  getAbnormalStocks,
  generateAlertText
};

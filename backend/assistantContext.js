function parseAssistantTemporalIntent(message, now = new Date()) {
  const text = String(message || '');
  const exactDate = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (exactDate) {
    const year = Number(exactDate[1]) || now.getFullYear();
    const month = Number(exactDate[2]);
    const day = Number(exactDate[3]);
    return {
      type: 'exact_date',
      year,
      month,
      day,
      interpretation: `${year}年${month}月${day}日`
    };
  }

  const monthRange = text.match(/(?:(\d{4})年)?(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})\s*月/);
  if (!monthRange) return null;
  const year = Number(monthRange[1]) || now.getFullYear();
  const startMonth = Number(monthRange[2]);
  const endMonth = Number(monthRange[3]);
  if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return null;
  return {
    type: 'month_range',
    year,
    start_month: startMonth,
    end_month: endMonth,
    interpretation: `${year}年${startMonth}月至${endMonth}月（月份区间，不是${startMonth}月${endMonth}日）`
  };
}

function extractAssistantStockQuery(message, watchlist = []) {
  const text = String(message || '').trim();
  const code = text.match(/(?<!\d)(?:(?:sh|sz)\s*)?\d{6}(?:\.(?:SH|SZ))?(?!\d)/i);
  if (code) return code[0].replace(/\s+/g, '');

  const watchlistHit = (watchlist || []).find(item => item?.name && text.includes(item.name));
  if (watchlistHit) return watchlistHit.code || watchlistHit.name;

  const hasStockIntent = /股票|个股|标的|股价|建仓|买入|卖出|持仓|加仓|减仓|估值|走势|趋势|支撑|压力/.test(text);
  if (!hasStockIntent) return null;

  let candidate = text
    .replace(/[？?。！!，,；;：:]/g, ' ')
    .trim()
    .replace(/^(?:麻烦|请|能否|可以)?\s*(?:帮我|给我)?\s*(?:看看|看下|看一看|查下|查询|分析一下|分析|评估)?\s*/u, '')
    .replace(/^(?:股票|个股|标的)\s*/u, '');
  const suffix = candidate.search(/\s*(?:\d{1,2}\s*[-~—–至到]\s*\d{1,2}\s*月|股票|个股|股价|建仓|买入|卖出|持仓|加仓|减仓|估值|走势|趋势|支撑|压力|怎么样|如何)/u);
  if (suffix > 0) candidate = candidate.slice(0, suffix);
  candidate = candidate.trim().replace(/\s+/g, '');
  return /^[\u3400-\u9fffA-Za-z]{2,12}$/.test(candidate) ? candidate : null;
}

function summarizeAssistantTrend(trend) {
  const bars = Array.isArray(trend?.bars) ? trend.bars : [];
  if (bars.length < 2) {
    return {
      source: trend?.source || 'unavailable',
      available: false,
      error: trend?.error || null
    };
  }
  const first = bars[0];
  const last = bars[bars.length - 1];
  const highs = bars.map(item => Number(item.high)).filter(Number.isFinite);
  const lows = bars.map(item => Number(item.low)).filter(Number.isFinite);
  const periodChange = Number(first.close) > 0
    ? ((Number(last.close) / Number(first.close)) - 1) * 100
    : null;
  return {
    source: trend.source,
    available: true,
    trading_days: bars.length,
    period_start: first.date,
    period_end: last.date,
    first_close: Number(first.close),
    last_close: Number(last.close),
    period_change_percent: Number.isFinite(periodChange) ? Number(periodChange.toFixed(2)) : null,
    period_high: highs.length ? Math.max(...highs) : null,
    period_low: lows.length ? Math.min(...lows) : null,
    recent_bars: bars.slice(-5).map(item => ({
      date: item.date,
      close: item.close,
      change_percent: item.changePercent
    }))
  };
}

module.exports = {
  extractAssistantStockQuery,
  parseAssistantTemporalIntent,
  summarizeAssistantTrend
};

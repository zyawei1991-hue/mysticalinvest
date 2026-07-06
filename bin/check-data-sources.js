#!/usr/bin/env node

process.env.TZ = 'Asia/Shanghai';

const {
  fetchEastmoneyRealtimeSnapshot,
  getMarketBreadth,
  getMarketMomentum,
  getLimitStocks
} = require('../backend/market');
const { getWeatherRiskSignals } = require('../backend/freeExternalSignals');
const { tushareCall, rowsFromResponse } = require('../backend/tushareClient');

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

async function checkTushare() {
  try {
    const today = new Date();
    const end = today.toISOString().slice(0, 10).replace(/-/g, '');
    const start = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const json = await tushareCall('trade_cal', {
      exchange: 'SSE',
      start_date: start,
      end_date: end
    }, 'cal_date,is_open,pretrade_date', { retries: 0, timeoutMs: 12000 });
    return {
      ok: true,
      rows: rowsFromResponse(json).length
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message.replace(/token=[^&\s]+/ig, 'token=<redacted>').slice(0, 180)
    };
  }
}

(async () => {
  const snapshot = await fetchEastmoneyRealtimeSnapshot(true);
  const breadth = await getMarketBreadth();
  const momentum = await getMarketMomentum();
  const limitStocks = await getLimitStocks();
  const weather = await getWeatherRiskSignals();
  const tushare = await checkTushare();

  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    eastmoney: {
      ok: true,
      source: snapshot.source,
      aShareRows: snapshot.aShareRows.length,
      etfRows: snapshot.etfRows.length,
      breadth,
      mainForce: {
        netInflowYi: Number(momentum.mainForce.netInflow || 0) / 100000000,
        sampleSize: momentum.mainForce.sampleSize,
        leaders: momentum.mainForce.leaders.slice(0, 5).map(item => item.name)
      },
      etfFlow: {
        netInflowYi: Number(momentum.etfFlow.netInflow || 0) / 100000000,
        sampleSize: momentum.etfFlow.sampleSize,
        leaders: momentum.etfFlow.leaders.slice(0, 5).map(item => item.name)
      },
      turnover: momentum.turnover.marketRate,
      limitStocks: {
        up: limitStocks.up.length,
        down: limitStocks.down.length
      },
      northbound: {
        netBuyAvailable: hasNumericValue(momentum.northbound.netInflow),
        activityAvailable: hasNumericValue(momentum.northbound.dealAmountYi),
        dealAmountYi: momentum.northbound.dealAmountYi || null,
        date: momentum.northbound.date || null,
        leadStockName: momentum.northbound.leadStockName || null,
        source: momentum.northbound.source,
        note: momentum.northbound.note || momentum.northbound.disclosure || null
      }
    },
    weather: {
      ok: weather.status === 'ready' || weather.status === 'partial',
      status: weather.status,
      summary: weather.summary
    },
    tushare
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});

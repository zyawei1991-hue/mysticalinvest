const DEFAULT_WEATHER_LOCATIONS = [
  { name: '北京', latitude: 39.9042, longitude: 116.4074 },
  { name: '上海', latitude: 31.2304, longitude: 121.4737 },
  { name: '广州', latitude: 23.1291, longitude: 113.2644 },
  { name: '深圳', latitude: 22.5431, longitude: 114.0579 },
  { name: '郑州', latitude: 34.7466, longitude: 113.6254 },
  { name: '乌鲁木齐', latitude: 43.8256, longitude: 87.6168 }
];

function parseLocationConfig() {
  const raw = process.env.WEATHER_LOCATIONS;
  if (!raw) return DEFAULT_WEATHER_LOCATIONS;
  const parsed = raw.split(';').map(item => {
    const [name, lat, lon] = item.split(',').map(part => String(part || '').trim());
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { name, latitude, longitude };
  }).filter(Boolean);
  return parsed.length ? parsed : DEFAULT_WEATHER_LOCATIONS;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 120)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function classifyWeatherRisk(row) {
  const risks = [];
  if (Number(row.temperatureMax) >= 35) risks.push('高温');
  if (Number(row.precipitation) >= 50) risks.push('强降水');
  if (Number(row.windMax) >= 39) risks.push('大风');
  const code = Number(row.weatherCode);
  if ([95, 96, 99].includes(code)) risks.push('雷暴');
  if ([71, 73, 75, 77, 85, 86].includes(code)) risks.push('降雪');
  return risks;
}

function weatherIndustryHint(risks) {
  const text = risks.join('、');
  if (!text) return '无明显行业扰动';
  const hints = [];
  if (text.includes('高温')) hints.push('电力负荷、空调家电、能源');
  if (text.includes('强降水') || text.includes('雷暴')) hints.push('交通物流、基建排水、农业');
  if (text.includes('大风') || text.includes('降雪')) hints.push('交通、电网、煤炭保供');
  return [...new Set(hints)].join('；') || '关注区域供应链扰动';
}

async function getWeatherRiskSignals() {
  const locations = parseLocationConfig();
  const timeoutMs = Number(process.env.WEATHER_TIMEOUT_MS || 10000);
  const results = [];
  const errors = [];

  for (const loc of locations) {
    try {
      const params = new URLSearchParams({
        latitude: String(loc.latitude),
        longitude: String(loc.longitude),
        daily: 'weather_code,temperature_2m_max,precipitation_sum,wind_speed_10m_max',
        timezone: 'Asia/Shanghai',
        forecast_days: '1'
      });
      const json = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, timeoutMs);
      const daily = json.daily || {};
      const row = {
        location: loc.name,
        date: daily.time?.[0] || '',
        weatherCode: daily.weather_code?.[0],
        temperatureMax: daily.temperature_2m_max?.[0],
        precipitation: daily.precipitation_sum?.[0],
        windMax: daily.wind_speed_10m_max?.[0]
      };
      row.risks = classifyWeatherRisk(row);
      row.industryHint = weatherIndustryHint(row.risks);
      results.push(row);
    } catch (error) {
      errors.push(`${loc.name}: ${error.message}`);
    }
  }

  const riskRows = results.filter(row => row.risks.length);
  const summary = riskRows.length
    ? riskRows.slice(0, 4).map(row => `${row.location}${row.risks.join('/')}: ${row.industryHint}`).join('；')
    : '重点城市无明显极端天气信号';

  return {
    source: 'Open-Meteo free forecast',
    status: results.length ? (errors.length ? 'partial' : 'ready') : 'pending_source',
    summary,
    locations: results,
    errors
  };
}

function getPolicySignalPlaceholder() {
  return {
    source: 'public website crawler pending',
    status: 'pending_source',
    summary: '政策/公告源待接入：证监会、交易所、巨潮资讯公开页面'
  };
}

module.exports = {
  getWeatherRiskSignals,
  getPolicySignalPlaceholder
};

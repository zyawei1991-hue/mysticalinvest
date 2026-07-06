
// 自动检测路径基础（支持 /daily/ 和 / 两种部署）
const API_BASE = (function() {
  const parts = window.location.pathname.replace(/\/$/, '').split('/');
  return parts.length > 1 ? '/' + parts[1] + '/api' : '/api';
})();
let currentPage = 1;
const pageSize = 10;
let currentReportType = getDefaultReportType();
let latestBacktestCalibration = null;

// DOM元素
const btnLatest = document.getElementById('btnLatest');
const btnStock = document.getElementById('btnStock');
const btnArchive = document.getElementById('btnArchive');
const todaySection = document.getElementById('todaySection');
const stockSection = document.getElementById('stockSection');
const archiveSection = document.getElementById('archiveSection');
const loading = document.getElementById('loading');
const reportContent = document.getElementById('reportContent');
const archiveList = document.getElementById('archiveList');
const pagination = document.getElementById('pagination');
const totalReports = document.getElementById('totalReports');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  initVersionTabs();
  setActiveVersionTab(currentReportType);
  loadLatest();
  initStockAnalysis();

  btnLatest.addEventListener('click', () => {
    setActiveNav('latest');
  });

  btnStock.addEventListener('click', () => {
    setActiveNav('stock');
  });

  btnArchive.addEventListener('click', () => {
    setActiveNav('archive');
    loadArchive();
  });
});

// 设置活跃导航
function setActiveNav(nav) {
  btnLatest.classList.remove('active');
  btnStock.classList.remove('active');
  btnArchive.classList.remove('active');
  todaySection.style.display = 'none';
  stockSection.style.display = 'none';
  archiveSection.style.display = 'none';

  if (nav === 'latest') {
    btnLatest.classList.add('active');
    todaySection.style.display = 'block';
  } else if (nav === 'stock') {
    btnStock.classList.add('active');
    stockSection.style.display = 'block';
  } else if (nav === 'archive') {
    btnArchive.classList.add('active');
    archiveSection.style.display = 'block';
  }
}

// 初始化版本切换标签
function initVersionTabs() {
  const tabs = document.querySelectorAll('.version-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentReportType = tab.dataset.type;
      setActiveVersionTab(currentReportType);
      loadLatest();
    });
  });
}

function getDefaultReportType() {
  const urlType = new URLSearchParams(window.location.search).get('type');
  if (['morning', 'noon', 'evening'].includes(urlType)) return urlType;
  const hour = new Date().getHours();
  if (hour >= 15) return 'evening';
  if (hour >= 11) return 'noon';
  return 'morning';
}

function setActiveVersionTab(type) {
  document.querySelectorAll('.version-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === type);
  });
}

// 初始化个股分析
function initStockAnalysis() {
  const btnAnalyze = document.getElementById('btnAnalyze');
  const stockInput = document.getElementById('stockInput');
  const btnClearHistory = document.getElementById('btnClearHistory');

  btnAnalyze.addEventListener('click', () => {
    const query = stockInput.value.trim();
    if (query) {
      analyzeStock(query);
    }
  });

  stockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = stockInput.value.trim();
      if (query) {
        analyzeStock(query);
      }
    }
  });

  // 清空历史记录
  btnClearHistory?.addEventListener('click', clearStockHistory);

  // 加载历史记录
  loadStockHistory();
}

// 个股四维分析
async function analyzeStock(query) {
  const stockResult = document.getElementById('stockResult');
  stockResult.innerHTML = '<div class="loading">正在分析...</div>';
  stockResult.classList.add('active');

  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${API_BASE}/stock/analyze?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(tm);
    if (!res.ok) throw new Error('分析失败');
    const data = await res.json();
    renderStockAnalysis(data);
    // 刷新历史记录
    loadStockHistory();
  } catch (err) {
    stockResult.innerHTML = '<div class="empty-state">分析失败，请重试</div>';
  }
}

// 加载个股查询历史
async function loadStockHistory() {
  const historyContainer = document.getElementById('stockHistory');
  if (!historyContainer) return;

  try {
    const res = await fetch(`${API_BASE}/stock/history?limit=10`);
    if (!res.ok) throw new Error('加载失败');
    const data = await res.json();
    renderStockHistory(data.data);
  } catch (err) {
    console.error('加载历史记录失败:', err);
    historyContainer.innerHTML = '<div class="empty-state">暂无查询记录</div>';
  }
}

// 渲染个股查询历史
function renderStockHistory(history) {
  const container = document.getElementById('stockHistory');
  if (!history || history.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无查询记录</div>';
    return;
  }

  let html = '';
  history.forEach(item => {
    const changeClass = item.change >= 0 ? 'positive' : 'negative';
    const timeStr = new Date(item.query_time).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    html += `
      <div class="history-item" onclick="reanalyzeStock('${item.name}')">
        <div class="history-info">
          <span class="history-name">${item.name}</span>
          <span class="history-code">${item.code || ''}</span>
        </div>
        <div class="history-data">
          <span class="history-price">${item.price ? item.price.toFixed(2) : '-'}</span>
          <span class="history-change ${changeClass}">${item.change ? (item.change >= 0 ? '+' : '') + item.change.toFixed(2) + '%' : '-'}</span>
        </div>
        <div class="history-time">${timeStr}</div>
        <button class="btn-delete" onclick="event.stopPropagation(); deleteStockHistory(${item.id})">×</button>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 重新分析某只股票
function reanalyzeStock(name) {
  const stockInput = document.getElementById('stockInput');
  stockInput.value = name;
  analyzeStock(name);
}

// 删除单条历史记录
async function deleteStockHistory(id) {
  try {
    const res = await fetch(`${API_BASE}/stock/history/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadStockHistory();
    }
  } catch (err) {
    console.error('删除失败:', err);
  }
}

// 清空历史记录
async function clearStockHistory() {
  if (!confirm('确定要清空所有查询记录吗？')) return;

  try {
    const res = await fetch(`${API_BASE}/stock/history`, { method: 'DELETE' });
    if (res.ok) {
      loadStockHistory();
    }
  } catch (err) {
    console.error('清空失败:', err);
  }
}

// 渲染个股分析结果
function renderStockAnalysis(data) {
  const stockResult = document.getElementById('stockResult');

  let html = `
    <div class="stock-header-info">
      <h2>${data.name} <span class="stock-code">${data.code}</span></h2>
      <div class="stock-price">
        <span class="price">${data.price ? data.price.toFixed(2) : '-'}</span>
        <span class="change ${data.change >= 0 ? 'positive' : 'negative'}">${data.change ? (data.change >= 0 ? '+' : '') + data.change.toFixed(2) + '%' : '-'}</span>
      </div>
    </div>

    <div class="four-dimensions">
      <div class="dimension-card news">
        <h3>📰 消息面</h3>
        <div class="dimension-content">${data.analysis?.news || '暂无消息分析'}</div>
      </div>
      <div class="dimension-card fundamental">
        <h3>📊 基本面</h3>
        <div class="dimension-content">${data.analysis?.fundamental || '暂无基本面分析'}</div>
      </div>
      <div class="dimension-card technical">
        <h3>📈 技术面</h3>
        <div class="dimension-content">${data.analysis?.technical || '暂无技术分析'}</div>
      </div>
      <div class="dimension-card flow">
        <h3>💧 资金面</h3>
        <div class="dimension-content">${data.analysis?.flow || '暂无资金分析'}</div>
      </div>
    </div>
  `;

  stockResult.innerHTML = html;
}

// 渲染早盘预测验证（午间报告专用）
function renderPredictionVerification(text) {
  const lines = text.split('\n');
  let html = '<div class="verification-section">';
  html += '<div class="section-header"><h2>🔍 早盘预测验证</h2></div>';
  html += '<div class="verification-content">';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      html += '<br>';
    } else if (trimmed.startsWith('#')) {
      html += '<h3>' + trimmed.replace(/^#+\s*/, '') + '</h3>';
    } else if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
      html += '<p class="verify-item">' + trimmed + '</p>';
    } else if (trimmed.includes('✅') || trimmed.includes('❌')) {
      html += '<p class="verify-result">' + trimmed + '</p>';
    } else {
      html += '<p>' + trimmed + '</p>';
    }
  }

  html += '</div></div>';
  return html;
}

// 加载统计信息
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) {
      totalReports.textContent = '';
      return;
    }
    const data = await res.json();
    if (data.total_reports !== undefined && data.total_reports > 0) {
      totalReports.textContent = `共 ${data.total_reports} 期日报`;
    } else {
      totalReports.textContent = '';
    }
  } catch (err) {
    console.error('加载统计失败:', err);
    totalReports.textContent = '';
  }
}

// 加载最新日报
async function loadLatest() {
  try {
    loading.style.display = 'block';
    reportContent.style.display = 'none';

    const res = await fetch(`${API_BASE}/latest?type=${currentReportType}`);
    if (!res.ok) {
      if (res.status === 404) {
        loading.style.display = 'none';
        reportContent.innerHTML = '<div class="empty-state">暂无' + getTypeName(currentReportType) + '数据</div>';
        reportContent.style.display = 'block';
        return;
      }
      throw new Error('加载失败');
    }

    const data = await res.json();
    latestBacktestCalibration = await loadBacktestCalibration();
    renderReport(data);
    loading.style.display = 'none';
    reportContent.style.display = 'block';
  } catch (err) {
    console.error('loadLatest error:', err);
    loading.style.display = 'none';
    reportContent.innerHTML = '<div class="error-state"><p>加载失败，请刷新重试</p><p class="error-detail">' + escapeHtml(err.message || '未知错误') + '</p></div>';
    reportContent.style.display = 'block';
  }
}

async function loadBacktestCalibration() {
  try {
    const res = await fetch(`${API_BASE}/backtest/institutional-status`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.latest_runs && data.latest_runs.length ? data.latest_runs[0] : null;
  } catch (err) {
    console.warn('加载回测校准失败:', err.message || err);
    return null;
  }
}

function getTypeName(type) {
  const names = { 'morning': '早盘版', 'noon': '午间版', 'evening': '盘后版' };
  return names[type] || '日报';
}

// 渲染日报
function renderMarketOverview(data) {
  const cards = [
    { label: '沪深 300', value: data.hs300_value, change: data.hs300_change },
    { label: '上证指数', value: data.sh_value, change: data.sh_change },
    { label: '深证成指', value: data.sz_value, change: data.sz_change },
    { label: '创业板指', value: data.cy_value, change: data.cy_change }
  ];

  let html = '<div class="overview market-overview">';
  cards.forEach(function(card) {
    const change = Number(card.change || 0);
    const cls = change >= 0 ? 'positive' : 'negative';
    const value = Number.isFinite(Number(card.value)) ? Number(card.value).toFixed(2) : '-';
    html += '<div class="overview-card">';
    html += '<div class="label">' + escapeHtml(card.label) + '</div>';
    html += '<div class="value ' + cls + '">' + value + ' <small>(' + formatChangePct(change) + ')</small></div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderRiskSection(data) {
  if (!data.risk_warning) return '';
  const content = escapeHtml(data.risk_warning)
    .replace(/(事实|预测|风险场景)：/g, '<strong class="risk-label">$1</strong>：');
  return `
    <div class="risk-section">
      <h2>⚠️ 风险提示</h2>
      <div class="risk-content structured-risk">${content}</div>
    </div>
  `;
}

function renderReport(data) {

  const typeNames = {
    'morning': '早盘版',
    'noon': '午间版',
    'evening': '盘后版'
  };
  const typeName = typeNames[data.report_type] || '日报';

  let html = `
    <div class="report-date">
      <h2>${data.report_date} ${typeName}</h2>
      <div class="report-time">${data.report_time || ''}</div>
    </div>
  `;

  html += renderMarketOverview(data);
  html += renderDecisionDashboard(data);
  html += renderBacktestCalibrationSection(latestBacktestCalibration);

  if (data.market_momentum) {
    html += renderMarketMomentumSection(data.market_momentum);
  }

  if (data.key_variables) {
    html += renderKeyVariablesSection(data.key_variables);
  }

  html += renderRiskSection(data);

  // 早盘预测验证（仅午间版）
  if (data.report_type === 'noon' && data.prediction_verification) {
    html += renderPredictionVerification(data.prediction_verification);
  }

  if (data.global_indexes) {
    html += renderGlobalMarketSection(data.global_indexes);
  }

  if (data.five_elements) {
    html += renderStrategySection(data.five_elements);
  }

  // 行业推荐
  if (data.industries && data.industries.length > 0) {
    html += renderIndustrySection(data.industries);
  }

  // 午间异动（仅午间版）
  if (data.report_type === 'noon' && data.alerts && data.alerts.length > 0) {
    html += renderNoonAlerts(data.alerts);
  }

  if (data.bazi) {
    html += renderFactorSourceDetails(data.bazi);
  }

  if (data.bazi_interpretation) {
    html += renderBaziInterpretationV3(data);
  }

  // 关注标的
  html += `<div class="alerts-section">
    <div class="section-header">
      <h2>📌 关注标的</h2>
      <button class="btn-add-stock" onclick="showAddStockModal()">+ 添加标的</button>
    </div>
    <div class="stock-list" id="stockList">`;
  if (data.stocks && data.stocks.length > 0) {
    data.stocks.forEach(stock => {
      const alertClass = stock.alert_level === 'red' ? 'alert-red' :
                        stock.alert_level === 'yellow' ? 'alert-yellow' :
                        stock.alert_level === 'green' ? 'alert-green' : '';
      // 实时价格占位符（通过 loadStockRealtimePrices 异步填充）
      html += `
        <div class="stock-card ${alertClass}" data-stock-id="${stock.id}" data-stock-name="${encodeURIComponent(stock.name)}" data-stock-code="${stock.code || ''}" data-stock-alert="${stock.alert_level || ''}" data-stock-suggestion="${stock.suggestion || ''}" data-stock-reason="${encodeURIComponent(stock.reason || '')}">
          <div class="stock-actions">
            <button class="btn-edit" onclick="event.stopPropagation(); editStockFromCard(this)">✏️</button>
            <button class="btn-delete" onclick="event.stopPropagation(); deleteStock(${stock.id})">×</button>
          </div>
          <div class="stock-header">
            <span class="stock-name">${stock.name} <span class="stock-code">${stock.code || ''}</span></span>
            <span class="stock-suggestion suggestion-${(stock.suggestion || '').replace(/\s/g, '') || 'hold'}">${stock.suggestion || '观望'}</span>
          </div>
          <div class="stock-realtime" id="rt-${stock.code || stock.name}">
            <span class="rt-price">-</span>
            <span class="rt-change">-</span>
          </div>
          ${stock.reason ? `<div class="stock-reason">${stock.reason}</div>` : ''}
        </div>
      `;
    });
  } else {
    html += `<div class="empty-state">暂无关注标的，点击右上角添加</div>`;
  }
  html += `</div></div>`;

  // 关注标的四维分析（新增！）
  if (data.stocks && data.stocks.length > 0) {
    html += renderStockAnalysisList(data.stocks);
  }

  // 五行验证
  if (data.verification) {
    html += `
      <div class="verification-section">
        <h2>✅ 五行验证</h2>
        <div class="verification-content">${data.verification}</div>
      </div>
    `;
  }

  // 明日展望（仅盘后版）
  if (data.report_type === 'evening' && data.prediction) {
    html += `
      <div class="prediction-section">
        <h2>明日观察</h2>
        <div class="prediction-content">${data.prediction}</div>
      </div>
    `;
  }

  // 段子彩蛋
  if (data.joke) {
    html += `
      <div class="joke-section">
        <h2>😄 段子彩蛋</h2>
        <div class="joke-content">${data.joke}</div>
      </div>
    `;
  }

  reportContent.innerHTML = html;
  // 异步加载关注标的实时价格
  if (data.stocks && data.stocks.length > 0) {
    setTimeout(function() { loadStockRealtimePrices(data.stocks); }, 50);
  }
}

function parseStrategyText(text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
  const operation = lines.find(line => line.startsWith('结论：')) || '';
  const focus = lines.find(line => line.startsWith('重点方向：')) || '';
  const risk = lines.find(line => line.startsWith('风险触发：')) || '';
  const macro = lines.filter(line => line.startsWith('- ')).slice(0, 3);
  const parts = operation.replace(/^结论：/, '').split('；').map(item => item.trim()).filter(Boolean);
  return {
    stance: parts[0] || '观察',
    position: parts[1] || '控制仓位',
    rhythm: parts[2] || '等待确认',
    focus: focus.replace(/^重点方向：/, '').replace(/。$/, '') || '等待主线确认',
    risk: risk.replace(/^风险触发：/, '').replace(/。$/, '') || '指数走弱或主线断档时降低仓位',
    macro
  };
}

function getStrategyModel(data) {
  if (data.operation_advice) {
    return {
      stance: data.operation_advice.stance || '观察',
      position: data.operation_advice.position || '控制仓位',
      rhythm: data.operation_advice.rhythm || '等待确认',
      focus: data.operation_advice.focus || '等待主线确认',
      risk: data.operation_advice.risk || data.risk_warning || '指数走弱或主线断档时降低仓位',
      macro: data.operation_advice.macro || []
    };
  }
  return parseStrategyText(data.five_elements);
}

function formatChangePct(value) {
  const n = Number(value || 0);
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function getCompassWeights(data) {
  const totals = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  if (data.industries && data.industries.length) {
    data.industries.slice(0, 6).forEach(industry => {
      const weight = Number(industry.factor_score || industry.rating || 1);
      Object.entries(industry.element_weights || {}).forEach(([element, exposure]) => {
        totals[element] = (totals[element] || 0) + Number(exposure || 0) * weight;
      });
    });
  } else if (data.bazi && data.bazi.wuxing_power) {
    const names = { wood: '木', fire: '火', earth: '土', gold: '金', water: '水' };
    Object.entries(data.bazi.wuxing_power).forEach(([key, value]) => {
      const element = names[key];
      if (element) totals[element] = Number(value || 0);
    });
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  Object.keys(totals).forEach(key => { totals[key] = totals[key] / sum; });
  return totals;
}

function renderBaguaCompass(data) {
  const weights = getCompassWeights(data);
  const nodes = [
    { symbol: '☰', name: '乾', label: '金融周期', element: '金', x: 50, y: 9 },
    { symbol: '☱', name: '兑', label: '消费传媒', element: '金', x: 78, y: 21 },
    { symbol: '☲', name: '离', label: '科技成长', element: '火', x: 91, y: 50 },
    { symbol: '☳', name: '震', label: '电力设备', element: '木', x: 78, y: 79 },
    { symbol: '☴', name: '巽', label: '医药消费', element: '木', x: 50, y: 91 },
    { symbol: '☵', name: '坎', label: '港股外盘', element: '水', x: 22, y: 79 },
    { symbol: '☶', name: '艮', label: '基建地产', element: '土', x: 9, y: 50 },
    { symbol: '☷', name: '坤', label: '红利防守', element: '土', x: 22, y: 21 }
  ];
  const topElement = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || '火';
  const colorMap = { '木': 'wood', '火': 'fire', '土': 'earth', '金': 'gold', '水': 'water' };
  let html = '<div class="bagua-compass">';
  html += '<div class="bagua-ring"></div>';
  html += '<div class="bagua-center element-' + colorMap[topElement] + '">';
  html += '<span class="bagua-center-label">主因子</span><strong>' + topElement + '</strong>';
  html += '<small>' + Math.round((weights[topElement] || 0) * 100) + '%</small>';
  html += '</div>';
  nodes.forEach(node => {
    const pct = Math.round((weights[node.element] || 0) * 100);
    const active = node.element === topElement ? ' active' : '';
    html += '<div class="bagua-node element-' + colorMap[node.element] + active + '" style="left:' + node.x + '%;top:' + node.y + '%">';
    html += '<span class="trigram">' + node.symbol + '</span>';
    html += '<span class="node-name">' + node.name + '</span>';
    html += '<span class="node-label">' + node.label + '</span>';
    html += '<span class="node-weight">' + node.element + pct + '%</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderMarketRadar(data, strategy) {
  const global = data.global_indexes || {};
  const radar = [
    { label: '沪深300', value: formatChangePct(data.hs300_change), cls: data.hs300_change >= 0 ? 'positive' : 'negative' },
    { label: '创业板', value: formatChangePct(data.cy_change), cls: data.cy_change >= 0 ? 'positive' : 'negative' },
    { label: '纳斯达克', value: global.nasdaq ? formatChangePct(global.nasdaq.changePercent) : '-', cls: (global.nasdaq?.changePercent || 0) >= 0 ? 'positive' : 'negative' },
    { label: '恒生', value: global.hsi ? formatChangePct(global.hsi.changePercent) : '-', cls: (global.hsi?.changePercent || 0) >= 0 ? 'positive' : 'negative' }
  ];
  let html = '<div class="market-radar">';
  radar.forEach(item => {
    html += '<div class="radar-item"><span>' + item.label + '</span><strong class="' + item.cls + '">' + item.value + '</strong></div>';
  });
  html += '<div class="radar-note">' + escapeHtml(extractRiskScenario(data.risk_warning || strategy.risk)) + '</div>';
  html += '</div>';
  return html;
}

function extractRiskScenario(text) {
  const value = String(text || '');
  const match = value.match(/风险场景：(.+)$/);
  return match ? match[1] : value;
}

function compactPositionText(position) {
  const value = String(position || '').trim();
  const match = value.match(/([1-9](?:-[1-9])?成以内|[1-9](?:-[1-9])?成|[1-9]成以下)/);
  return match ? match[1] : (value || '控制仓位');
}

function getTopIndustryNames(data, count) {
  return (data.industries || [])
    .slice(0, count || 3)
    .map(item => item.name)
    .filter(Boolean)
    .join('、') || '等待主线确认';
}

function getElementTone(data) {
  const weights = getCompassWeights(data);
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const top = sorted[0] || ['火', 0];
  const low = sorted[sorted.length - 1] || ['水', 0];
  return top[0] + '旺' + Math.round(top[1] * 100) + '%，' + low[0] + '弱';
}

function getAttackReason(data) {
  const top = (data.industries || [])[0] || {};
  const profile = top.element_profile || top.element_name || getElementTone(data);
  const mainFlow = data.market_momentum && data.market_momentum.mainForce
    ? data.market_momentum.mainForce.netInflow
    : null;
  const flow = Number.isFinite(Number(mainFlow)) ? '主力' + formatFlowYi(mainFlow) : '资金实时源未完全返回';
  return profile + '；' + flow;
}

function getDefenseDirection(data) {
  const etfLeaders = ((data.market_momentum || {}).etfFlow || {}).leaders || [];
  const defensiveEtfs = etfLeaders
    .filter(item => /红利|300|50|低波|价值/.test(item.name || ''))
    .slice(0, 2)
    .map(item => item.name);
  if (defensiveEtfs.length) return defensiveEtfs.join('、');
  const stance = getStrategyModel(data).stance || '';
  if (/防守|观察|中性/.test(stance)) return '红利低波、食品饮料';
  return '沪深300、红利低波';
}

function getAvoidDirection(data) {
  const highPressure = (data.industries || [])
    .filter(item => /压力测试high|高压|丙午对金|金因子有压制/.test(item.reason || ''))
    .slice(0, 2)
    .map(item => item.name)
    .filter(Boolean);
  if (highPressure.length) return highPressure.join('、');
  const mainFlow = data.market_momentum && data.market_momentum.mainForce
    ? Number(data.market_momentum.mainForce.netInflow || 0)
    : 0;
  if (mainFlow < 0) return '高位追涨、单票重仓';
  return '弱势放量下跌方向';
}

function getSpecialReminder(data, strategy) {
  const focus = getTopIndustryNames(data, 2);
  if (data.report_type === 'evening') {
    return '明日开盘30分钟';
  }
  if (data.report_type === 'noon') {
    return '下午2:30后';
  }
  return '开盘30分钟内';
}

function getSpecialReminderNote(data, strategy) {
  const focus = getTopIndustryNames(data, 2);
  if (data.report_type === 'evening') {
    return '先验证' + focus + '能否放量延续，再决定是否加仓';
  }
  if (data.report_type === 'noon') {
    return '若量能不跟随，尾盘不扩大仓位';
  }
  return '不追首波拉升，等宽度和资金确认';
}

function buildOneLineConclusion(data, strategy) {
  const focus = getTopIndustryNames(data, 3);
  const position = compactPositionText(strategy.position);
  const breadth = data.market_breadth || {};
  const weakBreadth = Number(breadth.down || 0) > Number(breadth.up || 0);
  const flow = Number((data.market_momentum || {}).mainForce?.netInflow || 0);
  if (weakBreadth || flow < 0) {
    return '方向有亮点，但宽度和主力资金不支持激进扩仓；仓位压在' + position + '，只跟踪' + focus + '的延续性。';
  }
  return '市场给出进攻线索，但仍要等量能确认；仓位按' + position + '执行，优先从' + focus + '里做分散候选。';
}

function renderDecisionRow(label, score, note, tone) {
  return '<tr><th>' + escapeHtml(label) + '</th><td><span class="decision-dot dot-' + tone + '"></span>' + escapeHtml(score) + '</td><td>' + escapeHtml(note) + '</td></tr>';
}

function renderDecisionDashboard(data) {
  const strategy = getStrategyModel(data);
  const position = compactPositionText(strategy.position);
  const attack = getTopIndustryNames(data, 3);
  const defense = getDefenseDirection(data);
  const avoid = getAvoidDirection(data);
  const reminder = getSpecialReminder(data, strategy);
  const reminderNote = getSpecialReminderNote(data, strategy);
  const oneLine = buildOneLineConclusion(data, strategy);

  let html = '<section class="decision-dashboard">';
  html += '<div class="dashboard-copy">';
  html += '<div class="dashboard-kicker">综合评分 · 先看结论再看依据</div>';
  html += '<h2>' + escapeHtml(strategy.stance) + '</h2>';
  html += '<div class="dashboard-table-wrap"><table class="decision-score-table"><thead><tr><th>维度</th><th>评分</th><th>说明</th></tr></thead><tbody>';
  html += renderDecisionRow('仓位建议', position, strategy.position, /防守|3成|2成/.test(strategy.position) ? 'red' : 'yellow');
  html += renderDecisionRow('进攻方向', attack, getAttackReason(data), 'green');
  html += renderDecisionRow('防守方向', defense, /防守|观察|中性/.test(strategy.stance) ? '震荡时优先保留防守底仓' : '用于对冲高弹性行业波动', 'green');
  html += renderDecisionRow('回避方向', avoid, '资金或压力测试未确认前，不做追涨重仓', 'red');
  html += renderDecisionRow('特别提醒', reminder, reminderNote, 'yellow');
  html += '</tbody></table></div>';
  html += '<div class="dashboard-one-line"><span>一句话</span><strong>' + escapeHtml(oneLine) + '</strong></div>';
  html += '<div class="dashboard-discipline"><span>执行纪律</span><strong>' + escapeHtml(strategy.rhythm) + '；分散到3-5个候选方向，单一行业/个股只作排序。</strong></div>';
  html += '</div>';
  html += renderBaguaCompass(data);
  html += renderMarketRadar(data, strategy);
  html += '</section>';
  return html;
}

function formatMetricPct(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(digits === undefined ? 2 : digits) + '%';
}

function renderBacktestCalibrationSection(run) {
  if (!run || !run.metrics) return '';
  const gross = run.metrics.portfolios && run.metrics.portfolios.top5;
  const net = run.metrics.portfolios_after_cost && run.metrics.portfolios_after_cost.top5;
  if (!gross && !net) return '';
  const cost = Number(run.metrics.round_trip_cost_pct || 0);
  const start = run.start_date || (run.params && run.params.startDate) || '-';
  const end = run.end_date || (run.params && run.params.endDate) || '-';
  let html = '<section class="backtest-calibration">';
  html += '<div class="calibration-copy">';
  html += '<span class="calibration-kicker">今日回测校准</span>';
  html += '<h2>候选池有效，成本后边际收窄</h2>';
  html += '<p>最新机构吸筹 MVP 回测显示，Top5 分散组合比单点押注更适合日报落地；实际执行需扣除滑点和交易成本。</p>';
  html += '</div>';
  html += '<div class="calibration-metrics">';
  if (gross) {
    html += '<div><span>Top5未扣成本超额</span><strong>' + formatMetricPct(gross.avg_excess_return_pct, 3) + '</strong></div>';
    html += '<div><span>Top5跑赢率</span><strong>' + formatMetricPct((gross.hit_rate_vs_benchmark || 0) * 100, 1) + '</strong></div>';
  }
  if (net) {
    html += '<div><span>扣' + cost.toFixed(1) + '%后超额</span><strong>' + formatMetricPct(net.avg_excess_return_pct, 3) + '</strong></div>';
    html += '<div><span>扣成本后累计</span><strong>' + formatMetricPct(net.compounded_return_pct, 2) + '</strong></div>';
  }
  html += '</div>';
  html += '<div class="calibration-footnote">样本：' + escapeHtml(start) + ' 至 ' + escapeHtml(end) + '；仅作为模型校准，不构成买卖建议。</div>';
  html += '</section>';
  return html;
}

function renderKeyVariablesSection(snapshot) {
  const variables = (snapshot.variables || []).filter(Boolean);
  if (!variables.length) return '';
  const groupNames = {
    market: '市场',
    sentiment: '情绪',
    fund: '资金',
    macro: '宏观',
    annual: '年度',
    policy: '政策',
    weather: '天气',
    incident: '事件',
    risk: '风险'
  };
  let html = '<section class="key-variables-section">';
  html += '<div class="section-header"><h2>关键变量</h2></div>';
  html += '<div class="key-variable-grid">';
  variables.slice(0, 12).forEach(item => {
    const statusClass = item.status === 'ready' ? 'ready' : item.status === 'partial' ? 'partial' : 'pending';
    html += '<div class="key-variable-card ' + statusClass + '">';
    html += '<div class="key-variable-meta"><span>' + escapeHtml(groupNames[item.group] || item.group || '变量') + '</span><small>' + escapeHtml(item.source || '') + '</small></div>';
    html += '<strong>' + escapeHtml(item.name || '-') + '</strong>';
    html += '<p>' + escapeHtml(item.value || '待接入数据源') + '</p>';
    html += '</div>';
  });
  html += '</div>';
  html += '<p class="key-variable-note">资金、政策、天气和突发事件变量会按可用数据源动态补齐；实时源未返回时，系统会降低该变量权重，不把空值当成有效信号。</p>';
  html += '</section>';
  return html;
}

function renderFactorSourceDetails(bazi) {
  return '<details class="factor-source"><summary>因子来源：四柱与五行分布</summary>' + renderBaziSection(bazi) + '</details>';
}

// 渲染八字排盘
function renderBaziSection(bazi) {
  const ganColors = {
    '甲': 'element-wood', '乙': 'element-wood',
    '丙': 'element-fire', '丁': 'element-fire',
    '戊': 'element-earth', '己': 'element-earth',
    '庚': 'element-gold', '辛': 'element-gold',
    '壬': 'element-water', '癸': 'element-water'
  };

  const zhiColors = {
    '寅': 'element-wood', '卯': 'element-wood',
    '巳': 'element-fire', '午': 'element-fire',
    '辰': 'element-earth', '戌': 'element-earth', '丑': 'element-earth', '未': 'element-earth',
    '申': 'element-gold', '酉': 'element-gold',
    '亥': 'element-water', '子': 'element-water'
  };

  let html = `
    <div class="bazi-section">
      <h2>📅 八字排盘 · ${bazi.date || ''}</h2>
      <div class="bazi-grid">
        <div class="bazi-pillar">
          <div class="label">年柱</div>
          <div class="gan ${ganColors[bazi.year_gan] || ''}">${bazi.year_gan || '-'}</div>
          <div class="zhi ${zhiColors[bazi.year_zhi] || ''}">${bazi.year_zhi || '-'}</div>
        </div>
        <div class="bazi-pillar">
          <div class="label">月柱</div>
          <div class="gan ${ganColors[bazi.month_gan] || ''}">${bazi.month_gan || '-'}</div>
          <div class="zhi ${zhiColors[bazi.month_zhi] || ''}">${bazi.month_zhi || '-'}</div>
        </div>
        <div class="bazi-pillar">
          <div class="label">日柱</div>
          <div class="gan ${ganColors[bazi.day_gan] || ''}">${bazi.day_gan || '-'}</div>
          <div class="zhi ${zhiColors[bazi.day_zhi] || ''}">${bazi.day_zhi || '-'}</div>
        </div>
        <div class="bazi-pillar">
          <div class="label">时柱</div>
          <div class="gan ${ganColors[bazi.hour_gan] || ''}">${bazi.hour_gan || '-'}</div>
          <div class="zhi ${zhiColors[bazi.hour_zhi] || ''}">${bazi.hour_zhi || '-'}</div>
        </div>
      </div>
  `;

    // 五行强弱（带自然语言解读）
  try {
  if (bazi.wuxing_power) {
    html += `<div class="wuxing-power">`;
    const wuxingNames = { 'gold': '金', 'wood': '木', 'water': '水', 'fire': '火', 'earth': '土' };
    const wuxingClasses = { 'gold': 'bg-gold', 'wood': 'bg-wood', 'water': 'bg-water', 'fire': 'bg-fire', 'earth': 'bg-earth' };
    let maxKey = '', maxVal = -1, minKey = '', minVal = 999;
    var elementAdvice = {
      'gold': '金旺日，金融、汽车、机械板块值得关注',
      'wood': '木旺日，环保、医药、教育板块值得关注',
      'water': '水旺日，物流、旅游、白酒板块值得关注',
      'fire': '火旺日，科技、能源、传媒板块值得关注',
      'earth': '土旺日，地产、基建、农业板块值得关注'
    };
    var weakAdvice = {
      'gold': '金弱，有色金属、贵金属板块偏弱',
      'wood': '木弱，医药、农林板块偏弱',
      'water': '水弱，航运、水产板块偏弱',
      'fire': '火弱，科技成长板块动能不足',
      'earth': '土弱，地产基建板块承压'
    };

    for (const [key, value] of Object.entries(bazi.wuxing_power)) {
      if (typeof value !== 'number') continue;
      var pct = Math.round(value * 100);
      const statusClass = value >= 0.25 ? 'status-strong' : value >= 0.17 ? 'status-normal' : 'status-weak';
      const statusText = value >= 0.25 ? '旺' : value >= 0.17 ? '平' : '弱';
      if (value > maxVal) { maxVal = value; maxKey = key; }
      if (value < minVal) { minVal = value; minKey = key; }
      html += `
        <div class="wuxing-item">
          <span class="element-icon ${wuxingClasses[key]}">${wuxingNames[key]}</span>
          <span>${pct}%</span>
          <span class="status ${statusClass}">${statusText}</span>
        </div>
      `;
    }
    
    // 自然语言解读
    if (maxKey && minKey) {
      var maxPct = Math.round(maxVal * 100);
      var minPct = Math.round(minVal * 100);
      html += '<div class=wuxing-desc>';
      html += '<p>今日八字中<strong>' + wuxingNames[maxKey] + '</strong>气最旺（占' + maxPct + '%），<strong>' + wuxingNames[minKey] + '</strong>气最弱（占' + minPct + '%）。</p>';
      html += '<span class=wuxing-tip-strong>' + (elementAdvice[maxKey] || '') + '</span>';
      html += '<span class=wuxing-tip-weak> | ' + (weakAdvice[minKey] || '') + '</span>';
      html += '</div>';
    }
    
    html += `</div>`;
  }
  } catch (e) { console.error('renderwuxing error:', e); }
    // Non-investment conflict module is intentionally hidden.
  if (false && bazi.conflicts && bazi.conflicts.length > 0) {
    // 类型中文名和严重程度
    const typeLabels = { '冲': '相冲', '刑': '相刑', '害': '相害', '克': '相克' };
    const severityClass = { '冲': 'severe', '刑': 'moderate', '害': 'moderate', '克': 'mild' };

    // 找到最严重的冲突
    const priority = ['冲', '刑', '害', '克'];
    const sorted = [...bazi.conflicts].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
    const mainConflict = sorted[0];

    // 整体总结
    const allTypes = [...new Set(bazi.conflicts.map(c => c.type))];
    let summary = '';
    if (allTypes.includes('冲')) summary += '今日地支存在相冲关系，市场波动性较大，宜谨慎操作。';
    if (allTypes.includes('刑')) summary += '今日存在刑害关系，人事、合同类风险较高，避免冲动决策。';
    if (allTypes.includes('害')) summary += '今日存在相害关系，暗中有不利因素，注意信息不对称风险。';
    if (allTypes.includes('克')) summary += '今日天干相克，外部压力较大，宜顺势而为。';
    if (!summary) summary = '今日地支关系复杂，建议关注以下具体影响：';

    html += '<div class="conflict-section">' +
      '<h3>关系提示</h3>' +
      '<div class="conflict-summary">' + summary + '</div>' +
      '<div class="conflict-list">';
    bazi.conflicts.forEach(conflict => {
      const typeClass = conflict.type === '冲' ? 'chong' :
                       conflict.type === '刑' ? 'xing' :
                       conflict.type === '害' ? 'hai' : 'ke';
      const sev = severityClass[conflict.type] || 'mild';
      html += '<div class="conflict-item ' + typeClass + ' ' + sev + '">';
      html += '<span class="conflict-marker ' + typeClass + '">' + conflict.type + '</span>';
      html += '<div class="conflict-content">';
      html += '<span class="conflict-detail">' + (conflict.detail || conflict.name) + '</span>';
      if (conflict.desc) {
        html += '<p class="conflict-desc">投资提示：' + conflict.desc + '</p>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
  }
  return html;
}

// ===== V3 结构化解读渲染器 =====

// 五行关键词上色
function colorFive(text) {
  if (!text) return '';
  return String(text)
    .replace(/金(?!属)/g, '<span class="element-gold">金</span>')
    .replace(/木(?!属)/g, '<span class="element-wood">木</span>')
    .replace(/水(?!属)/g, '<span class="element-water">水</span>')
    .replace(/火(?!属)/g, '<span class="element-fire">火</span>')
    .replace(/土(?!属)/g, '<span class="element-earth">土</span>');
}

// V3 结构化八字解读（替代旧版纯文本渲染）
function renderBaziInterpretationV3(data) {
  let html = '<div class="interpretation-section">';

  // ⑩ 日运评级（如果有）
  if (data.day_rating) {
    html += renderDayRating(data.day_rating);
  }

  // ⑧ A股简报
  if (data.astock_briefing) {
    html += renderAstockBriefing(data.astock_briefing);
  }

  // 八字解读已由上方 V3 结构化卡片完整覆盖，不再重复渲染纯文本

  html += '</div>';
  return html;
}

// ⑩ 日运星级
function renderDayRating(rating) {
  if (!rating) return '';
  const stars = '★'.repeat(rating.stars || 1) + '☆'.repeat(5 - (rating.stars || 1));
  const levelClass = (rating.stars >= 4) ? 'v3-luck-great' : (rating.stars >= 3) ? 'v3-luck-good' : (rating.stars >= 2) ? 'v3-luck-ok' : 'v3-luck-bad';
  let html = '<div class="v3-day-rating">';
  html += '<div class="v3-rating-header">';
  html += '<div class="v3-rating-stars">' + stars + '</div>';
  html += '<div class="v3-rating-level ' + levelClass + '">' + (rating.luckLevel || '') + '</div>';
  html += '<div class="v3-rating-score">' + (rating.totalScore || '?').toFixed(2) + ' / 5.0</div>';
  html += '</div>';
  if (rating.tag) {
    html += '<div class="v3-rating-tag">' + rating.tag + '</div>';
  }
  // 运势小项
  if (rating.fortune) {
    const ft = rating.fortune;
    const items = [
      { emoji: '💰', label: '财运', val: ft.money || 0 },
      { emoji: '💼', label: '事业', val: ft.career || 0 },
      { emoji: '💕', label: '感情', val: ft.love || 0 },
      { emoji: '💪', label: '健康', val: ft.health || 0 }
    ];
    html += '<div class="v3-fortune-grid">';
    items.forEach(function(item) {
      const w = Math.round(item.val * 20);
      html += '<div class="v3-fortune-item">';
      html += '<span class="v3-fortune-emoji">' + item.emoji + '</span>';
      html += '<span class="v3-fortune-label">' + item.label + '</span>';
      html += '<div class="v3-fortune-bar"><div class="v3-fortune-fill" style="width:' + w + '%"></div></div>';
      html += '<span class="v3-fortune-val">' + item.val.toFixed(1) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ③ 建除十二神卡片
function renderJianchuCard(jc) {
  if (!jc || !jc.jianchu) return '';
  const luckClass = jc.luck && jc.luck.includes('吉') ? 'v3-luck-great' :
                    jc.luck && jc.luck.includes('凶') ? 'v3-luck-bad' : 'v3-luck-good';
  let html = '<div class="v3-jianchu-card">';
  html += '<div class="v3-card-header">';
  html += '<span class="v3-card-icon">🏛️</span>';
  html += '<span class="v3-card-title">建除十二神</span>';
  html += '</div>';
  html += '<div class="v3-jianchu-body">';
  html += '<div class="v3-jianchu-god">';
  html += '<span class="v3-jc-value">' + jc.jianchu + '</span>';
  html += '<span class="v3-jc-luck ' + luckClass + '">' + (jc.luck || '平') + '</span>';
  html += '</div>';
  html += '<div class="v3-jianchu-desc">' + (jc.desc || '') + '</div>';
  if (jc.avoid) {
    html += '<div class="v3-jianchu-avoid">⚠️ 忌：' + jc.avoid + '</div>';
  }
  html += '</div></div>';
  return html;
}

// Hidden legacy calendar alert renderer.
function renderChongshaAlert(cs) {
  if (!cs) return '';
  let html = '<div class="v3-chongsha-card">';
  html += '<div class="v3-card-header">';
  html += '<span class="v3-card-icon">⚠️</span>';
  html += '<span class="v3-card-title">日历提示</span>';
  html += '</div>';
  html += '<div class="v3-chongsha-body">';
  html += '<div class="v3-chongsha-main">' + (cs.chong || '') + '</div>';
  html += '<div class="v3-chongsha-sha">煞方：<strong>' + (cs.sha || '无') + '</strong></div>';
  html += '<div class="v3-chongsha-desc">' + (cs.desc || '') + '</div>';
  html += '</div></div>';
  return html;
}

// Hidden legacy four-change renderer.
function renderZiweiSihua(zw) {
  if (!zw || !zw.stars) return '';
  const typeClass = {
    '化禄': 'v3-zw-lu',
    '化权': 'v3-zw-quan',
    '化科': 'v3-zw-ke',
    '化忌': 'v3-zw-ji'
  };
  const typeIcon = {
    '化禄': '💰',
    '化权': '⚡',
    '化科': '📜',
    '化忌': '🔻'
  };
  let html = '<div class="v3-ziwei-card">';
  html += '<div class="v3-card-header">';
  html += '<span class="v3-card-icon">⭐</span>';
  html += '<span class="v3-card-title">因子变化</span>';
  html += '<span class="v3-card-subtitle">日干：' + (zw.dayGan || '?') + '</span>';
  html += '</div>';
  html += '<div class="v3-ziwei-grid">';
  zw.stars.forEach(function(s) {
    html += '<div class="v3-ziwei-item ' + (typeClass[s.type] || '') + '">';
    html += '<div class="v3-ziwei-icon">' + (typeIcon[s.type] || '') + '</div>';
    html += '<div class="v3-ziwei-type">' + s.type + '</div>';
    html += '<div class="v3-ziwei-star">' + s.star + '</div>';
    html += '<div class="v3-ziwei-meaning">' + s.meaning + '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// ⑦ 吉时方位
function renderLuckyDirection(ld) {
  if (!ld) return '';
  const dirs = [
    { label: '喜神', key: 'xishen', icon: '😊' },
    { label: '财神', key: 'caishen', icon: '💰' },
    { label: '福神', key: 'fushen', icon: '🧧' },
    { label: '阳贵', key: 'yangGui', icon: '☀️' },
    { label: '阴贵', key: 'yinGui', icon: '🌙' }
  ];
  let html = '<div class="v3-lucky-card">';
  html += '<div class="v3-card-header">';
  html += '<span class="v3-card-icon">🧭</span>';
  html += '<span class="v3-card-title">吉时方位</span>';
  html += '</div>';
  html += '<div class="v3-lucky-grid">';
  dirs.forEach(function(d) {
    const val = ld[d.key];
    if (!val) return;
    html += '<div class="v3-lucky-item">';
    html += '<span class="v3-lucky-icon">' + d.icon + '</span>';
    html += '<span class="v3-lucky-label">' + d.label + '</span>';
    html += '<span class="v3-lucky-dir">' + val + '</span>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// ⑧ A股今日简报
function renderAstockBriefing(ab) {
  if (!ab) return '';
  const trendClass = ab.trend === '偏多' ? 'positive' : ab.trend === '偏空' ? 'negative' : '';
  let html = '<div class="v3-astock-card">';
  html += '<div class="v3-card-header">';
  html += '<span class="v3-card-icon">📈</span>';
  html += '<span class="v3-card-title">A股今日五行简报</span>';
  html += '</div>';
  html += '<div class="v3-astock-body">';
  html += '<div class="v3-astock-row"><span class="v3-astock-label">今日干支</span><span>' + (ab.ganzhi || '') + '（' + (ab.dayElement || '') + '旺）</span></div>';
  html += '<div class="v3-astock-row"><span class="v3-astock-label">大势判断</span><span class="' + trendClass + '">' + (ab.trend || '-') + '</span></div>';
  if (ab.focusSectors && ab.focusSectors.length > 0) {
    html += '<div class="v3-astock-row"><span class="v3-astock-label">关注板块</span><span class="v3-astock-sectors">' + ab.focusSectors.join('、') + '</span></div>';
  }
  if (ab.avoidSectors && ab.avoidSectors.length > 0) {
    html += '<div class="v3-astock-row"><span class="v3-astock-label">回避板块</span><span class="v3-astock-sectors-avoid">' + ab.avoidSectors.join('、') + '</span></div>';
  }
  if (ab.fundPreference) {
    html += '<div class="v3-astock-row"><span class="v3-astock-label">资金偏好</span><span>' + ab.fundPreference + '</span></div>';
  }
  if (ab.actualTrend) {
    html += '<div class="v3-astock-row"><span class="v3-astock-label">实际行情</span><span>沪深300 ' + ab.actualTrend + '</span></div>';
  }
  if (ab.advice) {
    html += '<div class="v3-astock-advice">🎯 ' + ab.advice + '</div>';
  }
  html += '</div></div>';
  return html;
}

function renderGlobalMarketSection(globalIndexes) {
  const items = [
    ['dow', '道琼斯'],
    ['nasdaq', '纳斯达克'],
    ['sp500', '标普500'],
    ['hsi', '恒生指数']
  ];
  let html = '<div class="overview global-overview">';
  items.forEach(function(pair) {
    const item = globalIndexes[pair[0]];
    if (!item) return;
    const change = Number(item.changePercent || 0);
    html += '<div class="overview-card">';
    html += '<div class="label">' + pair[1] + '</div>';
    html += '<div class="value ' + (change >= 0 ? 'positive' : 'negative') + '">' + Number(item.last || 0).toFixed(2) + ' <small>(' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%)</small></div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function formatFlowYi(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '实时源未返回';
  const yi = Number(value) / 100000000;
  return (yi >= 0 ? '+' : '') + yi.toFixed(2) + '亿';
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatNorthboundDisplay(northbound) {
  if (!northbound) return '净买入不再公开';
  if (hasNumericValue(northbound.netInflow)) return formatFlowYi(northbound.netInflow);
  if (hasNumericValue(northbound.dealAmountYi)) {
    return '成交额' + Number(northbound.dealAmountYi).toFixed(2) + '亿';
  }
  return '净买入不再公开';
}

function formatNorthboundNote(northbound) {
  if (!northbound || !hasNumericValue(northbound.dealAmountYi)) {
    return '北向盘中净买入不再稳定公开，当前不把它作为强依赖变量。';
  }
  const parts = ['北向盘中净买入不再稳定公开，当前展示盘后成交活跃度'];
  if (northbound.quotaBalanceText) parts.push(northbound.quotaBalanceText);
  if (northbound.leadStockName) parts.push('活跃股：' + northbound.leadStockName);
  if (northbound.date) parts.push('日期：' + northbound.date);
  return parts.join('；') + '。';
}

function formatMomentumNames(rows) {
  const names = (rows || []).slice(0, 3).map(function(item) { return item.name; }).filter(Boolean);
  return names.length ? names.join('、') : '实时源未返回';
}

function renderMarketMomentumSection(momentum) {
  const hasFlow = ['northbound', 'mainForce', 'etfFlow'].some(function(key) {
    return hasNumericValue(momentum[key]?.netInflow);
  }) || hasNumericValue(momentum.northbound?.dealAmountYi);
  const hasLeaders = (momentum.mainForce?.leaders || []).length > 0 || (momentum.etfFlow?.leaders || []).length > 0;
  const turnover = momentum.turnover && momentum.turnover.marketRate !== null && momentum.turnover.marketRate !== undefined
    ? Number(momentum.turnover.marketRate).toFixed(2) + '%'
    : '实时源未返回';
  let html = '<section class="market-momentum-section">';
  html += '<div class="section-header"><h2>资金动量</h2></div>';
  html += '<div class="momentum-grid">';
  html += '<div class="momentum-card"><span>北向资金</span><strong>' + escapeHtml(formatNorthboundDisplay(momentum.northbound)) + '</strong></div>';
  html += '<div class="momentum-card"><span>主力净流入</span><strong>' + formatFlowYi(momentum.mainForce?.netInflow) + '</strong></div>';
  html += '<div class="momentum-card"><span>ETF 流向</span><strong>' + formatFlowYi(momentum.etfFlow?.netInflow) + '</strong></div>';
  html += '<div class="momentum-card"><span>市场换手</span><strong>' + turnover + '</strong></div>';
  html += '</div>';
  html += '<div class="momentum-note">主力活跃：' + escapeHtml(formatMomentumNames(momentum.mainForce?.leaders)) + '；ETF流向：' + escapeHtml(formatMomentumNames(momentum.etfFlow?.leaders)) + '</div>';
  html += '<div class="momentum-note muted">' + escapeHtml(formatNorthboundNote(momentum.northbound)) + '</div>';
  if (!hasFlow && !hasLeaders) {
    html += '<div class="momentum-note muted">资金实时接口未返回有效值；当前结论会降权资金变量，暂以指数、市场宽度和行业强弱辅助判断。</div>';
  }
  html += '</section>';
  return html;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStrategySection(text) {
  const blocks = String(text || '').split(/\n(?=【)/).filter(Boolean);
  let html = '<div class="strategy-section compact">';
  blocks.forEach(function(block) {
    const lines = block.split('\n').filter(Boolean);
    if (!lines.length) return;
    const title = lines.shift().replace(/[【】]/g, '');
    const summary = lines[0] || '';
    const rest = lines.slice(1);
    html += '<details class="strategy-block compact-block">';
    html += '<summary><span>' + escapeHtml(title) + '</span><strong>' + escapeHtml(summary) + '</strong></summary>';
    if (rest.length > 0) {
      html += '<div class="strategy-content">';
      rest.forEach(function(line) {
        html += '<p>' + escapeHtml(line) + '</p>';
      });
      html += '</div>';
    }
    html += '</details>';
  });
  html += '</div>';
  return html;
}

// 旧版兼容入口（保持向后兼容）
function renderBaziInterpretation(interpretation) {
  if (!interpretation) return '';
  let html = '<div class="interpretation-section"><div class="interp-card"><div class="interp-body">';
  const lines = interpretation.split('\n');
  lines.forEach(function(line) {
    if (!line.trim()) { html += '<div class="interp-spacer"></div>'; return; }
    if (line.startsWith('【') && line.endsWith('】')) {
      html += '<h3 class="interp-heading">' + colorFive(line) + '</h3>';
    } else {
      html += '<p class="interp-text">' + colorFive(line) + '</p>';
    }
  });
  html += '</div></div></div>';
  return html;
}


// 渲染行业推荐
function renderIndustrySection(industries) {
  let html = `
    <div class="industry-section">
      <div class="section-header industry-section-header">
        <h2>行业候选池</h2>
        <span>按行业属性、资金与压力测试排序；优先看 Top5 分散组合</span>
      </div>
      <div class="industry-grid">
  `;

  industries.forEach(industry => {
    const ratingClass = industry.rating >= 4 ? 'recommended' :
                       industry.rating <= 2 ? 'warning' : 'neutral';
    const stars = '★'.repeat(industry.rating || 3) + '☆'.repeat(5 - (industry.rating || 3));
    const keyVars = (industry.key_variables || []).slice(0, 3).filter(Boolean);
    const pressure = industry.pressure_test || {};
    const pressureRisks = (pressure.active_risks || []).slice(0, 2).filter(Boolean);
    const pressureText = pressureRisks.length > 0 ? pressureRisks.join('、') : (pressure.trigger_rule || '压力测试暂无触发项');
    const pressureLevel = pressure.level || 'normal';

    // 渲染推荐标的
    let stocksHtml = '';
    if (industry.stocks && industry.stocks.length > 0) {
      stocksHtml = `<div class="industry-stocks">`;
      industry.stocks.forEach(stock => {
        stocksHtml += `
          <span class="industry-stock-tag" onclick="analyzeStock('${stock.code}')" title="点击分析">
            ${stock.name} <small>${stock.code}</small>
            ${stock.changePercent !== undefined ? `<span class="stock-quote ${stock.changePercent >= 0 ? 'positive' : 'negative'}">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>` : ''}
          </span>
        `;
      });
      stocksHtml += `</div>`;
    }

    html += `
      <div class="industry-card ${ratingClass}">
        <div class="industry-header">
          <span class="industry-name">${industry.name}</span>
          <span class="industry-rating">${stars}</span>
        </div>
        <div class="industry-element">主属性：<span class="element-${industry.element}">${industry.element_name || industry.element}</span>${industry.element_profile ? ` · 暴露：${industry.element_profile}` : ''}${industry.factor_score ? ` · 因子分：${industry.factor_score}` : ''}</div>
        ${keyVars.length ? `<div class="industry-v21-meta"><strong>关键变量</strong><span>${keyVars.map(escapeHtml).join(' / ')}</span></div>` : ''}
        ${pressure.level ? `<div class="industry-pressure pressure-${pressureLevel}"><strong>压力测试</strong><span>${escapeHtml(pressureText)}</span></div>` : ''}
        ${industry.reason ? `<div class="industry-reason">${industry.reason}</div>` : ''}
        ${stocksHtml}
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

// 渲染午间异动
function renderNoonAlerts(alerts) {
  let html = `
    <div class="noon-alert-section">
      <h2>⚡ 午间异动</h2>
      <div class="alert-list">
  `;

  alerts.forEach(alert => {
    const changeClass = alert.change >= 0 ? 'positive' : 'negative';
    html += `
      <div class="alert-item">
        <div class="stock-info">
          <span class="stock-name">${alert.name}</span>
          <span class="stock-code">${alert.code}</span>
        </div>
        <span class="change ${changeClass}">${alert.change >= 0 ? '+' : ''}${alert.change.toFixed(2)}%</span>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

// 渲染关注标的四维分析（新增！）
function renderStockAnalysisList(stocks) {
  // 四维分析需要从后端实时获取，这里先渲染提示卡片
  let html = `<div class="stock-analysis-section">
    <div class="section-header">
      <h2>📊 标的四维投资分析</h2>
      <button class="btn-refresh" onclick="refreshStockAnalysis()">🔄 刷新分析</button>
    </div>
    <div class="stock-analysis-list">
  `;

  stocks.forEach(function(stock) {
    if (!stock.code) return;
    const alertClass = stock.alert_level === 'red' ? 'alert-red' :
                      stock.alert_level === 'yellow' ? 'alert-yellow' :
                      stock.alert_level === 'green' ? 'alert-green' : '';
    html += `<div class="stock-analysis-card ${alertClass}" id="analysis-${stock.code}">
      <div class="analysis-header">
        <span class="stock-name">${stock.name}</span>
        <span class="stock-code">${stock.code}</span>
        <span class="load-indicator" id="load-indicator-${stock.code}">分析加载中...</span>
      </div>
      <div class="analysis-loading" id="loading-${stock.code}">
        <div class="spinner"></div>
        <span>正在生成投资分析...</span>
      </div>
    </div>`;
  });

  html += `</div></div>`;

  // 异步加载四维分析
  setTimeout(function() {
    stocks.forEach(function(stock) {
      if (stock.code) loadStockAnalysis(stock.code, stock.name);
    });
  }, 100);

  return html;
}

// 异步加载单只股票四维分析
async function loadStockAnalysis(code, name) {
  const card = document.getElementById('analysis-' + code);
  const loading = document.getElementById('loading-' + code);
  if (!card || !loading) return;

  try {
    // 10秒超时防止无限loading
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_BASE}/stock/analyze?q=` + encodeURIComponent(code), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('分析失败');
    const data = await res.json();

    // 渲染四维投资分析
    let html = `<div class="analysis-content">
      <div class="stock-quote">
        <span class="quote-price">${data.price ? data.price.toFixed(2) : '-'}</span>
        <span class="quote-change ${data.change >= 0 ? 'positive' : 'negative'}">${data.change >= 0 ? '+' : ''}${data.change ? data.change.toFixed(2) : '-'}%</span>
      </div>`;

    if (data.analysis) {
      const a = data.analysis;
      if (a.news) html += `<div class="dim-row"><span class="dim-label news">📰 消息面</span><span class="dim-text">${a.news}</span></div>`;
      if (a.fundamental) html += `<div class="dim-row"><span class="dim-label fundamental">📋 基本面</span><span class="dim-text">${a.fundamental}</span></div>`;
      if (a.technical) html += `<div class="dim-row"><span class="dim-label technical">📈 技术面</span><span class="dim-text">${a.technical}</span></div>`;
      if (a.flow) html += `<div class="dim-row"><span class="dim-label flow">💧 资金面</span><span class="dim-text">${a.flow}</span></div>`;
    }

    html += `</div>`;
    // 只追加内容，保留原有头部（股票名称）
    const loadIndicator = document.getElementById('load-indicator-' + code);
    if (loading) loading.style.display = 'none';
    if (loadIndicator) loadIndicator.style.display = 'none';
    card.insertAdjacentHTML('beforeend', html);
  } catch(e) {
    // hide loading, append error (preserve header)
    const loadIndicatorErr = document.getElementById('load-indicator-' + code);
    if (loading) loading.style.display = 'none';
    if (loadIndicatorErr) loadIndicatorErr.style.display = 'none';
    if (card && !card.querySelector('.analysis-error')) {
      card.insertAdjacentHTML('beforeend', '<div class="analysis-error-msg">分析超时或网络错误</div>');
    }
  }
}

// 刷新所有标的分析
function refreshStockAnalysis() {
  const stockCards = document.querySelectorAll('.stock-analysis-card');
  stockCards.forEach(function(card) {
    const id = card.id;
    const code = id.replace('analysis-', '');
    const name = card.querySelector('.stock-name') ? card.querySelector('.stock-name').textContent : code;
    loadStockAnalysis(code, name);
  });
}

// 全局暴露
window.loadStockAnalysis = loadStockAnalysis;

// 异步加载关注标的实时价格（批量调用 /stock/analyze 获取现价和涨跌幅）
async function loadStockRealtimePrices(stocks) {
  if (!stocks || stocks.length === 0) return;
  stocks.forEach(function(stock) {
    const code = stock.code;
    const name = stock.name;
    if (!code) return;
    const rtEl = document.getElementById('rt-' + code);
    if (!rtEl) return;
    // 标记加载中
    rtEl.innerHTML = '<span class="rt-loading">查价中...</span>';
    fetchRealtimePrice(code, name, rtEl);
  });
}

async function fetchRealtimePrice(code, name, rtEl) {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(API_BASE + '/stock/analyze?q=' + encodeURIComponent(code), { signal: ctrl.signal });
    clearTimeout(tm);
    if (!res.ok) throw new Error('请求失败');
    const data = await res.json();
    if (data.price) {
      const changeClass = (data.changePercent || 0) >= 0 ? 'positive' : 'negative';
      const changeSign = (data.changePercent || 0) >= 0 ? '+' : '';
      rtEl.innerHTML = '<span class="rt-price">' + data.price.toFixed(2) + '</span>' +
        '<span class="rt-change ' + changeClass + '">' + changeSign + (data.changePercent || 0).toFixed(2) + '%</span>';
    } else {
      rtEl.innerHTML = '<span class="rt-price rt-error">暂无</span>';
    }
  } catch(e) {
    rtEl.innerHTML = '<span class="rt-price rt-error">-</span>';
  }
}

window.loadStockRealtimePrices = loadStockRealtimePrices;
window.fetchRealtimePrice = fetchRealtimePrice;
window.refreshStockAnalysis = refreshStockAnalysis;


async function loadArchive(page = 1) {
  try {
    archiveList.innerHTML = '<div class="loading">加载中...</div>';
    const res = await fetch(`${API_BASE}/reports?page=${page}&pageSize=${pageSize}`);
    const data = await res.json();

    if (data.data.length === 0) {
      archiveList.innerHTML = '<div class="empty-state">暂无历史日报</div>';
      pagination.innerHTML = '';
      return;
    }

    let html = '';
    const typeNames = {
      'morning': '早盘',
      'noon': '午间',
      'evening': '盘后'
    };
    data.data.forEach(report => {
      const changeClass = report.hs300_change >= 0 ? 'positive' : 'negative';
      const typeName = typeNames[report.report_type] || '';
      html += `
        <div class="archive-item" onclick="goToReport('${report.report_date}', '${report.report_type || 'morning'}')">
          <div class="archive-date">${report.report_date} ${typeName}</div>
          <div class="overview">
            沪深300: <span class="${changeClass}">${report.hs300_value ? report.hs300_value.toFixed(2) + ' (' + (report.hs300_change).toFixed(2) + '%)' : '暂无数据'}</span>
            · 关注: ${report.holding_count || 0} 只
          </div>
        </div>
      `;
    });
    archiveList.innerHTML = html;

    // 渲染分页
    renderPagination(data.page, data.total, data.pageSize);
  } catch (err) {
    console.error(err);
    archiveList.innerHTML = '<div class="empty-state">加载失败，请刷新重试</div>';
  }
}

// 渲染分页
function renderPagination(current, total, size) {
  const totalPages = Math.ceil(total / size);
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = `
    <button class="page-btn" ${current <= 1 ? 'disabled' : ''} onclick="goToPage(${current - 1})">上一页</button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (i === current - 2 || i === current + 2) {
      html += `<span>...</span>`;
    }
  }

  html += `
    <button class="page-btn" ${current >= totalPages ? 'disabled' : ''} onclick="goToPage(${current + 1})">下一页</button>
  `;

  pagination.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadArchive(page);
}

function goToReport(date, reportType) {
  btnLatest.click();
  if (reportType) {
    currentReportType = reportType;
    setActiveVersionTab(reportType);
  }
  loadReportByDate(date, reportType);
}

async function loadReportByDate(date, reportType) {
  try {
    loading.style.display = 'block';
    reportContent.style.display = 'none';

    let url = `${API_BASE}/reports/${date}`;
    if (reportType) {
      url += `?type=${reportType}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    renderReport(data);

    loading.style.display = 'none';
    reportContent.style.display = 'block';
  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    reportContent.innerHTML = '<div class="error-state"><p>加载失败，请刷新重试</p><p class="error-detail">' + (err.message || '未知错误') + '</p></div>';
    reportContent.style.display = 'block';
  }
}

// 格式化金额
function formatMoney(num) {
  if (num > 0) return '+' + num.toLocaleString('zh-CN');
  return num.toLocaleString('zh-CN');
}

// 显示添加标的弹窗
function showAddStockModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'stockModal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加标的</h3>
        <button class="btn-close" onclick="closeStockModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>标的名称 *</label>
          <input type="text" id="stockName" placeholder="如：贵州茅台">
        </div>
        <div class="form-group">
          <label>股票代码</label>
          <input type="text" id="stockCode" placeholder="如：600519">
        </div>
        <div class="form-group">
          <label>提醒级别</label>
          <select id="stockAlertLevel">
            <option value="">无</option>
            <option value="red">🔴 红色预警</option>
            <option value="yellow">🟡 黄色预警</option>
            <option value="green">🟢 绿色提示</option>
          </select>
        </div>
        <div class="form-group">
          <label>操作建议</label>
          <select id="stockSuggestion">
            <option value="">请选择</option>
            <option value="买入">买入</option>
            <option value="持有">持有</option>
            <option value="减仓">减仓</option>
            <option value="卖出">卖出</option>
            <option value="观望">观望</option>
          </select>
        </div>
        <div class="form-group">
          <label>分析理由</label>
          <textarea id="stockReason" rows="3" placeholder="输入分析理由..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeStockModal()">取消</button>
        <button class="btn-primary" onclick="saveStock()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// 从卡片元素获取数据并编辑
function editStockFromCard(btn) {
  const card = btn.closest('.stock-card');
  const id = card.dataset.stockId;
  const name = decodeURIComponent(card.dataset.stockName);
  const code = card.dataset.stockCode;
  const alertLevel = card.dataset.stockAlert;
  const suggestion = card.dataset.stockSuggestion;
  const reason = decodeURIComponent(card.dataset.stockReason);
  editStock(id, name, code, alertLevel, suggestion, reason);
}

// 显示编辑标的弹窗
function editStock(id, name, code, alertLevel, suggestion, reason) {
  showAddStockModal();
  document.getElementById('stockModal').dataset.stockId = id;
  document.getElementById('stockName').value = name;
  document.getElementById('stockCode').value = code;
  document.getElementById('stockAlertLevel').value = alertLevel;
  document.getElementById('stockSuggestion').value = suggestion;
  document.getElementById('stockReason').value = reason;
  document.querySelector('.modal-header h3').textContent = '编辑标的';
}

// 关闭弹窗
function closeStockModal() {
  const modal = document.getElementById('stockModal');
  if (modal) modal.remove();
}

// 保存标的
async function saveStock() {
  const modal = document.getElementById('stockModal');
  const stockId = modal?.dataset.stockId;
  const name = document.getElementById('stockName').value.trim();
  const code = document.getElementById('stockCode').value.trim();
  let alertLevel = document.getElementById('stockAlertLevel').value;
  let suggestion = document.getElementById('stockSuggestion').value;
  let reason = document.getElementById('stockReason').value.trim();

  // 支持名称或代码至少输入一项
  if (!name && !code) {
    alert('请输入标的名称或代码');
    return;
  }
  
  // 如果只输入了代码，尝试用代码作为名称；如果只输入名称，用名称作为代码
  const finalName = name || code;
  const finalCode = code || name;

  // 获取当前日报日期
  const reportDate = document.querySelector('.report-date h2')?.textContent?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!reportDate) {
    alert('无法获取当前日报日期');
    return;
  }

  // 如果是新增标的且用户没有填写建议或理由，自动分析补全
  if (!stockId && (!suggestion || !reason)) {
    const analyzeBtn = document.querySelector('.modal-footer .btn-primary');
    const originalText = analyzeBtn?.textContent;
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '正在分析...';
    }

    try {
      // 使用finalName（name或code）进行自动分析
      const analyzeQuery = finalName || name || code;
      const res = await fetch(`${API_BASE}/stock/analyze?q=${encodeURIComponent(analyzeQuery)}`);
      if (res.ok) {
        const data = await res.json();
        // 自动填充代码
        if (!code && data.code) {
          document.getElementById('stockCode').value = data.code;
        }
        // 自动填充建议（从分析结果推断）
        if (!suggestion && data.analysis) {
          suggestion = inferSuggestionFromAnalysis(data.analysis);
          document.getElementById('stockSuggestion').value = suggestion;
        }
        // 自动填充分析理由
        if (!reason && data.analysis) {
          reason = formatAnalysisToReason(data.analysis);
          document.getElementById('stockReason').value = reason;
        }
      }
    } catch (err) {
      console.error('自动分析失败:', err);
      // 分析失败也继续保存，不阻断用户
    } finally {
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = originalText || '保存';
      }
    }
  }

  const data = { 
    name: finalName, 
    code: finalCode, 
    alert_level: alertLevel, 
    suggestion: suggestion || document.getElementById('stockSuggestion').value, 
    reason: reason || document.getElementById('stockReason').value.trim() 
  };

  try {
    const url = stockId
      ? `${API_BASE}/reports/${reportDate}/stocks/${stockId}?type=${currentReportType}`
      : `${API_BASE}/reports/${reportDate}/stocks?type=${currentReportType}`;

    const res = await fetch(url, {
      method: stockId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      closeStockModal();
      loadLatest(); // 刷新日报
    } else {
      alert('保存失败');
    }
  } catch (err) {
    console.error('保存失败:', err);
    alert('保存失败');
  }
}

// 从分析结果推断操作建议
function inferSuggestionFromAnalysis(analysis) {
  const text = JSON.stringify(analysis).toLowerCase();
  
  // 卖出信号
  if (text.includes('卖出') || text.includes('减持') || text.includes('减仓') || 
      text.includes('风险') || text.includes('下跌') || text.includes('利空') ||
      text.includes('高估') || text.includes('泡沫')) {
    return '卖出';
  }
  
  // 买入信号
  if (text.includes('买入') || text.includes('增持') || text.includes('加仓') || 
      text.includes('机会') || text.includes('上涨') || text.includes('利好') ||
      text.includes('低估') || text.includes('突破')) {
    return '买入';
  }
  
  // 持有信号
  if (text.includes('持有') || text.includes('看好') || text.includes('稳健')) {
    return '持有';
  }
  
  // 减仓信号
  if (text.includes('减仓') || text.includes('回调') || text.includes('震荡')) {
    return '减仓';
  }
  
  return '观望';
}

// 将四维分析格式化为理由文本
function formatAnalysisToReason(analysis) {
  const parts = [];
  
  if (analysis.news) {
    parts.push(`【消息面】${analysis.news}`);
  }
  if (analysis.fundamental) {
    parts.push(`【基本面】${analysis.fundamental}`);
  }
  if (analysis.technical) {
    parts.push(`【技术面】${analysis.technical}`);
  }
  if (analysis.flow) {
    parts.push(`【资金面】${analysis.flow}`);
  }
  
  return parts.join('\n\n');
}

// 删除标的
async function deleteStock(stockId) {
  if (!confirm('确定要删除这个标的吗？')) return;

  const reportDate = document.querySelector('.report-date h2')?.textContent?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!reportDate) {
    alert('无法获取当前日报日期');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/reports/${reportDate}/stocks/${stockId}?type=${currentReportType}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      loadLatest(); // 刷新日报
    } else {
      alert('删除失败');
    }
  } catch (err) {
    console.error('删除失败:', err);
    alert('删除失败');
  }
}

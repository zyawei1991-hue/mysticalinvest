
// 自动检测路径基础（支持 /daily/ 和 / 两种部署）
const API_BASE = (function() {
  const parts = window.location.pathname.replace(/\/$/, '').split('/');
  return parts.length > 1 ? '/' + parts[1] + '/api' : '/api';
})();
let currentPage = 1;
const pageSize = 10;
let currentReportType = getDefaultReportType();
let currentPresentationMode = getDefaultPresentationMode();
let currentReportData = null;
let latestBacktestCalibration = null;
let assistantMessages = [];

// DOM元素
const btnLatest = document.getElementById('btnLatest');
const btnStock = document.getElementById('btnStock');
const btnAssistant = document.getElementById('btnAssistant');
const btnArchive = document.getElementById('btnArchive');
const todaySection = document.getElementById('todaySection');
const stockSection = document.getElementById('stockSection');
const assistantSection = document.getElementById('assistantSection');
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
  initPresentationTabs();
  setActiveVersionTab(currentReportType);
  setActivePresentationTab(currentPresentationMode);
  loadLatest();
  initStockAnalysis();
  initAssistant();

  btnLatest.addEventListener('click', () => {
    setActiveNav('latest');
  });

  btnStock.addEventListener('click', () => {
    setActiveNav('stock');
  });

  btnAssistant?.addEventListener('click', () => {
    setActiveNav('assistant');
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
  btnAssistant?.classList.remove('active');
  btnArchive.classList.remove('active');
  todaySection.style.display = 'none';
  stockSection.style.display = 'none';
  if (assistantSection) assistantSection.style.display = 'none';
  archiveSection.style.display = 'none';

  if (nav === 'latest') {
    btnLatest.classList.add('active');
    todaySection.style.display = 'block';
  } else if (nav === 'stock') {
    btnStock.classList.add('active');
    stockSection.style.display = 'block';
  } else if (nav === 'assistant') {
    btnAssistant?.classList.add('active');
    if (assistantSection) assistantSection.style.display = 'block';
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
      syncReportUrlState();
      loadLatest();
    });
  });
}

function initPresentationTabs() {
  const tabs = document.querySelectorAll('.presentation-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentPresentationMode = tab.dataset.view || 'standard';
      setActivePresentationTab(currentPresentationMode);
      syncReportUrlState();
      if (currentReportData) {
        renderReport(currentReportData);
      }
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

function getDefaultPresentationMode() {
  const urlView = new URLSearchParams(window.location.search).get('view');
  return ['standard', 'user'].includes(urlView) ? urlView : 'standard';
}

function setActiveVersionTab(type) {
  document.querySelectorAll('.version-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === type);
  });
}

function setActivePresentationTab(view) {
  document.querySelectorAll('.presentation-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
}

function syncReportUrlState() {
  const params = new URLSearchParams(window.location.search);
  params.set('type', currentReportType);
  params.set('view', currentPresentationMode);
  const next = window.location.pathname + '?' + params.toString();
  window.history.replaceState({}, '', next);
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

function initAssistant() {
  const input = document.getElementById('assistantInput');
  const send = document.getElementById('btnAssistantSend');
  if (!input || !send) return;

  send.addEventListener('click', sendAssistantMessage);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendAssistantMessage();
    }
  });
}

function renderAssistantMessages(isLoading) {
  const container = document.getElementById('assistantMessages');
  if (!container) return;
  let html = '';
  assistantMessages.forEach(item => {
    html += `<div class="assistant-message ${item.role === 'assistant' ? 'assistant' : 'user'}">
      <div class="assistant-bubble">${item.role === 'assistant' ? renderAssistantMarkdown(item.content) : escapeHtml(item.content)}</div>
    </div>`;
  });
  if (isLoading) {
    html += `<div class="assistant-message assistant">
      <div class="assistant-bubble assistant-loading">正在读取日报、知识库和对话上下文...</div>
    </div>`;
  }
  if (!html) {
    html = `<div class="assistant-message assistant">
      <div class="assistant-bubble">可以问我日报结论、行业五行逻辑、关注标的复盘、知识库规则和项目用法。</div>
    </div>`;
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

async function sendAssistantMessage() {
  const input = document.getElementById('assistantInput');
  const send = document.getElementById('btnAssistantSend');
  const message = input ? input.value.trim() : '';
  if (!message) return;

  assistantMessages.push({ role: 'user', content: message });
  if (input) input.value = '';
  if (send) send.disabled = true;
  renderAssistantMessages(true);

  try {
    const res = await fetch(`${API_BASE}/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        messages: assistantMessages.slice(-8),
        report_type: currentReportType,
        report_date: currentReportData && currentReportData.report_date ? currentReportData.report_date : null,
        presentation_mode: currentPresentationMode
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'AI助手调用失败');
    assistantMessages.push({ role: 'assistant', content: data.answer || '没有生成有效回答。' });
  } catch (err) {
    assistantMessages.push({ role: 'assistant', content: 'AI助手暂不可用：' + err.message });
  } finally {
    if (send) send.disabled = false;
    renderAssistantMessages(false);
  }
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
  const analysis = data.analysis || {};
  const decision = analysis.decision || {};
  const badges = Array.isArray(analysis.badges) ? analysis.badges : [];

  let html = `
    <div class="stock-header-info">
      <h2>${escapeHtml(data.name || '-')} <span class="stock-code">${escapeHtml(data.code || '')}</span></h2>
      <div class="stock-price">
        <span class="price">${Number.isFinite(Number(data.price)) ? Number(data.price).toFixed(2) : '-'}</span>
        <span class="change ${data.change >= 0 ? 'positive' : 'negative'}">${Number.isFinite(Number(data.change)) ? (data.change >= 0 ? '+' : '') + Number(data.change).toFixed(2) + '%' : '-'}</span>
      </div>
    </div>

    <div class="stock-decision ${escapeHtml(decision.level || 'watch')}">
      <div class="stock-decision-main">
        <span>综合门控</span>
        <strong>${escapeHtml(decision.label || '可跟踪验证')}</strong>
        <small>${Number.isFinite(Number(decision.score)) ? '融合分 ' + Number(decision.score).toFixed(0) : ''}</small>
      </div>
      <p>${escapeHtml(decision.summary || '行业先验、估值和盘面确认需要继续交叉验证。')}</p>
      ${decision.action ? `<p class="stock-decision-action">${escapeHtml(decision.action)}</p>` : ''}
      ${badges.length ? `<div class="stock-badges">${badges.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    </div>

    <div class="four-dimensions">
      <div class="dimension-card mystic">
        <h3>五行/行业适配</h3>
        <div class="dimension-content">${escapeHtml(analysis.mystic || '行业五行映射待确认')}</div>
      </div>
      <div class="dimension-card fundamental">
        <h3>价投/基本面</h3>
        <div class="dimension-content">${escapeHtml(analysis.fundamental || '暂无基本面分析')}</div>
        ${analysis.value_points ? `<div class="dimension-extra"><strong>价投买卖点</strong><span>${escapeHtml(analysis.value_points)}</span></div>` : ''}
      </div>
      <div class="dimension-card technical">
        <h3>量价/趋势</h3>
        <div class="dimension-content">${escapeHtml(analysis.technical || '暂无技术分析')}</div>
      </div>
      <div class="dimension-card flow">
        <h3>资金/风险</h3>
        <div class="dimension-content">${escapeHtml(analysis.flow || '暂无资金分析')}</div>
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
    currentReportData = data;
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
  reportContent.dataset.view = currentPresentationMode;

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

  html += renderUniversalDailyBrief(data);
  html += '<details class="universal-detail-drawer"><summary>展开数据图表和模型明细</summary><div class="universal-detail-content">';

  html += renderNumericSnapshotSection(data);
  html += renderVolumeAnalysisSection(data);
  html += renderHistoricalTrendSection(data.report_type);
  html += renderBacktestCalibrationSection(latestBacktestCalibration);

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
  html += '</div></details>';

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
    html += '<details class="stock-detail-drawer"><summary>展开关注标的走势和四维分析</summary>';
    html += renderStockAnalysisList(data.stocks);
    html += '</details>';
  }

  // 五行验证
  html += renderSupplementalDrawer(data);
  if (false) {
  html += '<div class="legacy-supplement-hidden" aria-hidden="true">';

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

  html += '</div>';
  }

  reportContent.innerHTML = html;
  setTimeout(function() { loadReportTrendChart(currentReportType); }, 50);
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
  const flow = hasEffectiveMomentum(data.market_momentum) && Number.isFinite(Number(mainFlow)) && Math.abs(Number(mainFlow)) > 0
    ? '主力' + formatFlowYi(mainFlow)
    : '资金未形成有效确认';
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
  const confirmText = hasEffectiveMomentum(data.market_momentum) ? '宽度和资金确认' : '宽度和量价确认';
  if (data.report_type === 'evening') {
    return '先验证' + focus + '能否放量延续，再决定是否加仓';
  }
  if (data.report_type === 'noon') {
    return '若量能不跟随，尾盘不扩大仓位';
  }
  return '不追首波拉升，等' + confirmText;
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

function getDecisionMode(data, strategy) {
  const stance = String(strategy.stance || '');
  const position = compactPositionText(strategy.position);
  const breadth = data.market_breadth || {};
  const flow = Number((data.market_momentum || {}).mainForce?.netInflow || 0);
  const weakBreadth = Number(breadth.down || 0) > Number(breadth.up || 0);
  if (/防守|减仓|空仓|谨慎/.test(stance) || flow < 0 || weakBreadth) {
    return {
      label: '观察为主',
      tone: 'caution',
      action: '不急着加仓',
      position,
      summary: '有可跟踪方向，但资金或市场宽度还不支持激进扩仓。'
    };
  }
  if (/进攻|积极|加仓/.test(stance)) {
    return {
      label: '可以试探',
      tone: 'active',
      action: '小仓位分散试错',
      position,
      summary: '市场和主线方向有共振迹象，但仍要用量能确认。'
    };
  }
  return {
    label: '等待确认',
    tone: 'neutral',
    action: '先看主线延续',
    position,
    summary: '今日更适合观察方向和验证信号，不适合凭单点消息重仓。'
  };
}

function getEtfCandidates(data) {
  const leaders = (((data.market_momentum || {}).etfFlow || {}).leaders || [])
    .map(item => item.name)
    .filter(Boolean);
  const fallback = getTopIndustryNames(data, 3)
    .split('、')
    .filter(Boolean)
    .map(name => name + 'ETF');
  return Array.from(new Set(leaders.concat(fallback))).slice(0, 4);
}

function getStockCandidates(data) {
  const stocks = (data.stocks || []).map(item => item.name || item.code).filter(Boolean);
  if (stocks.length) return stocks.slice(0, 4);
  return (data.industries || []).slice(0, 3).map(item => item.name + '候选池').filter(Boolean);
}

function getHoldingAction(data, strategy) {
  const focus = getTopIndustryNames(data, 2);
  const avoid = getAvoidDirection(data);
  if (/防守|观察|谨慎/.test(strategy.stance || '')) {
    return '持有方向若不在' + focus + '，优先减弱势仓，不急换到高弹性方向。';
  }
  return '已有' + focus + '相关仓位可继续观察，跌破节奏或放量转弱再降仓。';
}

function getUserPersonas(data, strategy, mode) {
  const etfs = getEtfCandidates(data);
  const stocks = getStockCandidates(data);
  const attack = getTopIndustryNames(data, 3);
  const defense = getDefenseDirection(data);
  const avoid = getAvoidDirection(data);
  return [
    {
      name: 'ETF用户',
      action: mode.tone === 'active' ? '跟行业，不押单票' : '只观察强弱，不追涨',
      target: etfs.join('、') || attack,
      rule: '用行业ETF或宽基ETF表达方向，分2-3笔，不在第一波拉升时一次性买满。'
    },
    {
      name: '个股用户',
      action: '只看候选池',
      target: stocks.join('、') || attack,
      rule: '先过资金、趋势、成交量，再用五行属性做二次确认；日报不给“必买”结论。'
    },
    {
      name: '已持仓用户',
      action: /观察|防守|谨慎/.test(strategy.stance || '') ? '先评估持仓是否顺势' : '顺势仓位可保留',
      target: attack,
      rule: getHoldingAction(data, strategy)
    },
    {
      name: '稳健用户',
      action: '仓位优先',
      target: defense,
      rule: '若宽度弱或主力净流出，宁可错过也不追高；回避' + avoid + '。'
    }
  ];
}

function renderGuideLine(title, value, note, tone) {
  return '<div class="guide-line ' + tone + '"><span>' + escapeHtml(title) + '</span><strong>' + escapeHtml(value) + '</strong><small>' + escapeHtml(note) + '</small></div>';
}

function renderPersonaCard(persona) {
  return '<article class="persona-card">'
    + '<div class="persona-name">' + escapeHtml(persona.name) + '</div>'
    + '<h3>' + escapeHtml(persona.action) + '</h3>'
    + '<p class="persona-target">' + escapeHtml(persona.target) + '</p>'
    + '<p class="persona-rule">' + escapeHtml(persona.rule) + '</p>'
    + '</article>';
}

function renderUserDecisionGuide(data) {
  const strategy = getStrategyModel(data);
  const mode = getDecisionMode(data, strategy);
  const attack = getTopIndustryNames(data, 3);
  const defense = getDefenseDirection(data);
  const avoid = getAvoidDirection(data);
  const reminder = getSpecialReminder(data, strategy);
  const reminderNote = getSpecialReminderNote(data, strategy);
  const personas = getUserPersonas(data, strategy, mode);
  const oneLine = buildOneLineConclusion(data, strategy);

  let html = '<section class="user-decision-guide mode-' + mode.tone + '">';
  html += '<div class="guide-hero">';
  html += '<div class="guide-copy">';
  html += '<div class="guide-kicker">用户视角版 · 先给动作</div>';
  html += '<h2>' + escapeHtml(mode.label) + '</h2>';
  html += '<p>' + escapeHtml(oneLine) + '</p>';
  html += '</div>';
  html += '<div class="guide-signal">';
  html += '<span>今日动作</span>';
  html += '<strong>' + escapeHtml(mode.action) + '</strong>';
  html += '<small>仓位：' + escapeHtml(mode.position) + '</small>';
  html += '</div>';
  html += '</div>';

  html += '<div class="guide-lines">';
  html += renderGuideLine('可以做', attack, '优先用行业/ETF表达，不先押单票', 'go');
  html += renderGuideLine('先等待', reminder, reminderNote, 'wait');
  html += renderGuideLine('不适合做', avoid, '高位追涨、单票重仓和无量反抽都降级处理', 'stop');
  html += '</div>';

  html += '<div class="persona-board">';
  personas.forEach(persona => { html += renderPersonaCard(persona); });
  html += '</div>';

  html += '<div class="guide-method">';
  html += '<span>五行怎么用</span>';
  html += '<strong>五行只做行业属性和时机先验；是否操作由市场宽度、资金动量、量价延续和风险触发共同确认。</strong>';
  html += '</div>';
  html += '</section>';
  return html;
}

function renderSupplementalDrawer(data) {
  const blocks = [];
  if (data.verification) {
    blocks.push('<div class="compact-supplement"><h3>五行验证</h3><p>' + escapeHtml(data.verification) + '</p></div>');
  }
  if (data.report_type === 'evening' && data.prediction) {
    blocks.push('<div class="compact-supplement"><h3>明日观察</h3><p>' + escapeHtml(data.prediction) + '</p></div>');
  }
  if (data.joke) {
    blocks.push('<div class="compact-supplement"><h3>段子彩蛋</h3><p>' + escapeHtml(data.joke) + '</p></div>');
  }
  if (!blocks.length) return '';
  return '<details class="supplemental-detail-drawer"><summary>展开验证、展望和补充内容</summary>' + blocks.join('') + '</details>';
}

function toUniversalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getUniversalMarketState(data) {
  const hs300 = toUniversalNumber(data.hs300_change) || 0;
  const cy = toUniversalNumber(data.cy_change) || 0;
  const breadth = data.market_breadth || {};
  const up = Number(breadth.up || 0);
  const down = Number(breadth.down || 0);
  const breadthPct = getBreadthBalancePct(breadth);
  const breadthText = up || down ? '上涨' + up + '家 / 下跌' + down + '家' : '宽度数据不足';
  if (hs300 <= -0.8 || (Number.isFinite(breadthPct) && breadthPct < -15)) {
    return {
      tone: 'danger',
      label: '市场偏弱',
      value: breadthText,
      note: '指数或市场宽度已经转弱，先保护仓位，不把候选方向当成进攻信号。'
    };
  }
  if (hs300 > 0.4 && cy > 0 && Number.isFinite(breadthPct) && breadthPct > 8) {
    return {
      tone: 'positive',
      label: '市场可试',
      value: breadthText,
      note: '指数、成长风格和上涨家数同步改善，候选方向可以提高跟踪优先级。'
    };
  }
  if (hs300 > 0 && Number.isFinite(breadthPct) && breadthPct < 0) {
    return {
      tone: 'warning',
      label: '指数强于个股',
      value: breadthText,
      note: '指数表现尚可，但上涨家数不占优，说明不能按普涨行情处理。'
    };
  }
  return {
    tone: 'neutral',
    label: '中性验证',
    value: breadthText,
    note: '市场还没有给出明确扩仓信号，先看候选方向能否持续被资金确认。'
  };
}

function getUniversalVolumeState(data) {
  const volume = buildVolumeAnalysis(data || {});
  const toneMap = {
    strong: 'positive',
    mixed: 'warning',
    warning: 'danger',
    weak: 'neutral',
    neutral: 'neutral'
  };
  return {
    tone: toneMap[volume.level] || 'neutral',
    label: volume.title,
    value: Number.isFinite(volume.turnoverRate) ? formatMetricValue(volume.turnoverRate, '%') : '量能数据不足',
    note: volume.action,
    raw: volume
  };
}

function getUniversalRiskGate(data) {
  const volume = buildVolumeAnalysis(data || {});
  const mainFlow = toUniversalNumber((data.market_momentum || {}).mainForce?.netInflow);
  const hs300 = toUniversalNumber(data.hs300_change) || 0;
  const breadthPct = getBreadthBalancePct(data.market_breadth);
  const largeOutflow = mainFlow !== null && mainFlow < -300 * 100000000;
  if (volume.level === 'warning' || largeOutflow || hs300 < -1.2) {
    return {
      tone: 'danger',
      label: '风险门控',
      value: '最高只观察',
      note: '主力、量能或指数触发风险，候选行业不能直接升级为操作方向。'
    };
  }
  if (volume.level === 'mixed' || (Number.isFinite(breadthPct) && breadthPct < 0)) {
    return {
      tone: 'warning',
      label: '有分歧',
      value: '等确认',
      note: '可以保留候选池，但需要等宽度、量能或资金修复后再提高动作等级。'
    };
  }
  return {
    tone: 'positive',
    label: '风险可控',
    value: '正常排序',
    note: '没有强风险触发，按候选方向和市场确认排序跟踪。'
  };
}

function getUniversalCandidateState(data) {
  const industries = data.industries || [];
  const risk = getUniversalRiskGate(data);
  if (!industries.length) {
    return {
      tone: 'neutral',
      label: '候选不足',
      value: '等待主线',
      note: '行业候选池还没有形成稳定排序。'
    };
  }
  if (risk.tone === 'danger') {
    return {
      tone: 'warning',
      label: '有方向但不进攻',
      value: getTopIndustryNames(data, 3),
      note: '方向先放观察池，风险门控解除前不把分数当买入理由。'
    };
  }
  return {
    tone: 'positive',
    label: '候选池已形成',
    value: getTopIndustryNames(data, 3),
    note: '先看这些方向能否继续获得量能、宽度和资金确认。'
  };
}

function renderUniversalStatusCard(item) {
  return '<div class="universal-status-card status-' + item.tone + '">'
    + '<span>' + escapeHtml(item.label) + '</span>'
    + '<strong>' + escapeHtml(item.value) + '</strong>'
    + '<small>' + escapeHtml(item.note) + '</small>'
    + '</div>';
}

function getUniversalCandidateAction(item, data) {
  const risk = getUniversalRiskGate(data);
  const volume = buildVolumeAnalysis(data || {});
  const score = Number(item.factor_score || item.score || 0);
  const marketAdjust = Number(item.market_adjustment || 0);
  if (risk.tone === 'danger') return '只观察，不追高';
  if (risk.tone === 'warning') return '等确认后再升级';
  if (marketAdjust > 0.02 || score >= 80 || volume.level === 'strong') return '重点跟踪';
  return '观察池排序靠前';
}

function getUniversalCandidateConfirmText(item, data) {
  const keyVars = (item.key_variables || []).slice(0, 2).filter(Boolean);
  const marketAdjust = Number(item.market_adjustment || 0);
  if (marketAdjust > 0.02) {
    return '盘中样本已有确认，继续看量能和宽度是否跟上。';
  }
  if (keyVars.length) {
    return '重点看' + keyVars.join('、') + '是否兑现，未兑现前不扩大仓位。';
  }
  return '暂时只有候选逻辑，需要市场宽度、量能和行业走势继续验证。';
}

function renderUniversalCandidateCard(item, index, data) {
  const score = Number(item.factor_score || item.score || 0);
  const scoreText = Number.isFinite(score) && score > 0 ? score.toFixed(1) : '-';
  return '<article class="universal-candidate-card">'
    + '<div class="candidate-rank">' + (index + 1) + '</div>'
    + '<div class="candidate-body">'
    + '<div class="candidate-title"><h3>' + escapeHtml(item.name || '-') + '</h3><span>模型分 ' + escapeHtml(scoreText) + '</span></div>'
    + '<p>' + escapeHtml(getIndustryShortReason(item)) + '</p>'
    + '<div class="candidate-compact-line"><span>' + escapeHtml(getUniversalCandidateConfirmText(item, data)) + '</span><strong>' + escapeHtml(getUniversalCandidateAction(item, data)) + '</strong></div>'
    + '</div>'
    + '</article>';
}

function getIndustryShortReason(item) {
  const profile = item.element_profile || item.element_name || '';
  const keys = (item.key_variables || []).slice(0, 2).filter(Boolean);
  const parts = [];
  if (profile) parts.push(profile);
  if (keys.length) parts.push(keys.join(' / '));
  if (item.current_cycle) parts.push(item.current_cycle);
  return parts.length ? parts.join('；') : '月运和五行先验进入候选池，等待市场确认。';
}

function getUniversalMonthStyle(data) {
  const signal = getMysticSignalText(data);
  const text = signal.month || '';
  if (/业绩|现金流|落地|订单/.test(text)) return '业绩兑现、现金流、落地能力';
  if (/成长|题材|科技|内容/.test(text)) return '成长题材、科技内容';
  if (/防守|流动性|外部/.test(text)) return '防守观察、流动性变量';
  return '月运只做行业风格先验';
}

function renderUniversalVariableGrid(data) {
  const market = getUniversalMarketState(data);
  const volume = getUniversalVolumeState(data);
  const risk = getUniversalRiskGate(data);
  const mainFlow = toUniversalNumber((data.market_momentum || {}).mainForce?.netInflow);
  const rows = [
    { label: '市场宽度', value: market.value, note: '决定今天是不是多数行业都能参与。', tone: market.tone },
    { label: '量能', value: volume.value, note: volume.label + '，不是单独买点。', tone: volume.tone },
    { label: '资金承接', value: mainFlow === null ? '资金数据不足' : formatYi(mainFlow), note: '主力净流入为负时，行业分数要降级使用。', tone: mainFlow !== null && mainFlow < 0 ? 'warning' : 'positive' },
    { label: '月运风格', value: getUniversalMonthStyle(data), note: '决定候选池来源，不直接决定操作。', tone: 'neutral' },
    { label: '风险门控', value: risk.value, note: risk.note, tone: risk.tone }
  ];
  let html = '<div class="universal-variable-grid">';
  rows.forEach(function(row) {
    html += '<div class="universal-variable-card status-' + row.tone + '">'
      + '<span>' + escapeHtml(row.label) + '</span>'
      + '<strong>' + escapeHtml(row.value) + '</strong>'
      + '<small>' + escapeHtml(row.note) + '</small>'
      + '</div>';
  });
  html += '</div>';
  return html;
}

function renderUniversalAudienceGuide(data) {
  const strategy = getStrategyModel(data);
  const candidates = getTopIndustryNames(data, 3);
  const position = compactPositionText(strategy.position);
  const items = [
    { name: '短线用户', focus: '今天能不能动', rule: '先看风险门控和量能，未确认时只跟踪' + candidates + '，不追第一波。' },
    { name: '中线用户', focus: '方向是否持续', rule: '看候选池是否连续多期出现，并用量能、宽度、资金趋势验证持续性。' },
    { name: '已持仓用户', focus: '要不要降级', rule: '持仓不在候选池或触发风险门控时，优先降仓位、降预期、等确认。' },
    { name: '内容用户', focus: '玄学怎么落地', rule: '月运解释为什么先看这些方向，市场数据决定它能不能进入动作层。' }
  ];
  let html = '<div class="universal-audience-grid">';
  items.forEach(function(item) {
    html += '<article class="universal-audience-card">'
      + '<span>' + escapeHtml(item.name) + '</span>'
      + '<strong>' + escapeHtml(item.focus) + '</strong>'
      + '<p>' + escapeHtml(item.rule) + '</p>'
      + '</article>';
  });
  html += '</div>';
  html += '<p class="universal-footnote">通用版只给一套市场温度计：短线看动作，中线看持续，持仓看降级，内容用户看逻辑。仓位建议仍以' + escapeHtml(position) + '为上限。</p>';
  return html;
}

function renderUniversalDailyBrief(data) {
  const strategy = getStrategyModel(data);
  const mode = getDecisionMode(data, strategy);
  const market = getUniversalMarketState(data);
  const volume = getUniversalVolumeState(data);
  const risk = getUniversalRiskGate(data);
  const candidates = getUniversalCandidateState(data);
  const industries = (data.industries || []).slice(0, 3);
  let html = '<section class="universal-brief mode-' + mode.tone + '">';
  html += '<div class="universal-hero">';
  html += '<div class="universal-hero-copy">';
  html += '<span class="universal-kicker">通用版日报</span>';
  html += '<h2>' + escapeHtml(mode.label) + '，' + escapeHtml(mode.action) + '</h2>';
  html += '<p>' + escapeHtml(buildOneLineConclusion(data, strategy)) + '</p>';
  html += '</div>';
  html += '<div class="universal-action-box"><span>今日动作</span><strong>' + escapeHtml(mode.action) + '</strong><small>仓位上限：' + escapeHtml(mode.position) + '</small></div>';
  html += '</div>';
  html += '<div class="universal-status-grid">';
  [market, volume, risk, candidates].forEach(function(item) { html += renderUniversalStatusCard(item); });
  html += '</div>';
  html += '<div class="universal-block">';
  html += '<div class="universal-block-head"><h3>候选方向池</h3><span>只展示Top3，完整评分在明细里</span></div>';
  if (industries.length) {
    html += '<div class="universal-candidate-grid">';
    industries.forEach(function(item, index) { html += renderUniversalCandidateCard(item, index, data); });
    html += '</div>';
  } else {
    html += '<div class="empty-state compact">候选方向不足，等待市场主线确认。</div>';
  }
  html += '</div>';
  html += '<div class="universal-block">';
  html += '<div class="universal-block-head"><h3>关键变量</h3><span>只保留会影响仓位、进攻和降级的变量</span></div>';
  html += renderUniversalVariableGrid(data);
  html += '</div>';
  html += '<details class="universal-audience-drawer"><summary>不同用户怎么用</summary>' + renderUniversalAudienceGuide(data) + '</details>';
  html += '</section>';
  return html;
}

function getMysticSignalText(data) {
  const briefing = data.astock_briefing || {};
  const strength = data.market_strength || {};
  const top = getTopIndustryNames(data, 3);
  const annual = data.annual_correction || ((data.industries || [])[0] || {}).annual_correction || {};
  const annualLabel = annual.label || '';
  const annualRationale = annual.rationale || '';
  const dayText = briefing.ganzhi ? briefing.ganzhi + '日' : (data.bazi && data.bazi.date ? data.bazi.date : '今日');
  const tone = briefing.trend || strength.desc || getElementTone(data);
  const monthFortune = getMonthFortuneText(data);
  return {
    month: monthFortune || (annualLabel ? annualLabel + '：' + annualRationale : '月运/年运作为行业风格先验，不直接给买卖指令。'),
    day: dayText + '，盘面语义为' + tone + '；先看' + top + '是否获得市场确认。',
    action: '月运给方向假设，日报用指数、宽度、量价和风险触发做确认；未确认时只进观察池，不进入操作结论。'
  };
}

function getMonthFortuneText(data) {
  const bazi = data.bazi || {};
  const month = (bazi.month_gan || '') + (bazi.month_zhi || '');
  if (!month.trim()) return '';
  const zhi = bazi.month_zhi || '';
  if (zhi === '未') {
    return month + '月：火气入土，市场更看重业绩验证、现金流、订单落地和资产负债表；题材方向必须有数据确认才升级。';
  }
  if (zhi === '午' || zhi === '巳') {
    return month + '月：火势偏旺，成长和题材容易活跃，但需要用成交量和宽度过滤追高风险。';
  }
  if (zhi === '申' || zhi === '酉') {
    return month + '月：金气偏强，偏向金融、硬件、制造和出清逻辑，同时警惕高估值回撤。';
  }
  if (zhi === '亥' || zhi === '子') {
    return month + '月：水气偏强，偏向流动性、外部变量和防守观察，进攻信号需要更强确认。';
  }
  if (zhi === '寅' || zhi === '卯') {
    return month + '月：木气生发，偏向成长、医药、内容和新业务萌芽，但不追没有兑现的数据故事。';
  }
  return month + '月：月运只作为行业风格假设，最终以市场宽度、量价和风险触发确认。';
}

function renderMysticInvestmentGuide(data) {
  const signal = getMysticSignalText(data);
  const topIndustries = (data.industries || []).slice(0, 3);
  let html = '<section class="mystic-guide-section">';
  html += '<div class="section-header"><h2>月运怎么用</h2><span>这里解释“为什么进观察池”，顶部只给执行结论</span></div>';
  html += '<div class="mystic-flow">';
  html += '<div class="mystic-step"><span>1</span><strong>先假设</strong><p>' + escapeHtml(signal.month) + '</p></div>';
  html += '<div class="mystic-step"><span>2</span><strong>再验证</strong><p>只看盘面有没有给证据：市场宽度是否转强、成交/换手是否跟上、候选行业是否跑赢大盘。</p></div>';
  html += '<div class="mystic-step"><span>3</span><strong>最后处理</strong><p>验证通过才升级为重点跟踪；没有验证就只放观察池，不扩大仓位、不追高。</p></div>';
  html += '</div>';
  if (topIndustries.length) {
    html += '<div class="plain-candidate-flow">';
    topIndustries.forEach(function(item) {
      html += '<article class="plain-candidate-card">';
      html += '<h3>' + escapeHtml(item.name || '-') + '</h3>';
      html += '<p><strong>为什么先看：</strong>' + escapeHtml(getIndustryPlainReason(item)) + '</p>';
      html += '<p><strong>什么算确认：</strong>' + escapeHtml(getIndustryUpgradeRule(item)) + '</p>';
      html += '<p><strong>没确认怎么办：</strong>' + escapeHtml(getIndustryDowngradeRule(item)) + '</p>';
      html += '</article>';
    });
    html += '</div>';
  }
  html += '<p class="subtle-note">备注：月运只决定“先看哪些方向”，不决定“买不买”。真正动作仍由宽度、量能、趋势和风险触发决定。</p>';
  html += '</section>';
  return html;
}

function getIndustryPlainReason(item) {
  const element = item.element_profile || item.element_name || '行业属性';
  const cycle = item.current_cycle ? '，处在' + item.current_cycle + '阶段' : '';
  return '月运偏向能兑现、能落地的方向；' + (item.name || '该行业') + '当前模型属性为' + element + cycle + '，所以先放入候选观察。';
}

function getIndustryUpgradeRule(item) {
  const vars = (item.key_variables || []).slice(0, 3).join('、');
  const base = '行业指数/ETF放量、相对大盘更强，且市场宽度不继续恶化';
  return vars ? base + '；同时观察' + vars + '这些基本变量有没有正反馈。' : base + '。';
}

function getIndustryDowngradeRule(item) {
  const pressure = item.pressure_test || {};
  const risks = (pressure.active_risks || []).slice(0, 2).join('、');
  if (risks) return '只观察不追高；若出现' + risks + '，从候选池降级。';
  return '只观察不追高；如果行业没有持续放量、没有跑赢大盘，就不进入操作结论。';
}

function calcPct(part, total) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t === 0) return '-';
  return (p / t * 100).toFixed(1) + '%';
}

function renderBreadthBars(breadth) {
  if (!breadth || !Number.isFinite(Number(breadth.total)) || Number(breadth.total) <= 0) return '';
  const rows = [
    { label: '上涨', value: Number(breadth.up || 0), cls: 'positive' },
    { label: '下跌', value: Number(breadth.down || 0), cls: 'negative' },
    { label: '平盘', value: Number(breadth.flat || 0), cls: 'neutral' }
  ];
  let html = '<div class="breadth-bars">';
  rows.forEach(function(row) {
    const pct = Number(breadth.total) ? row.value / Number(breadth.total) * 100 : 0;
    html += '<div class="breadth-bar-row"><span>' + row.label + '</span><div class="breadth-bar"><i class="' + row.cls + '" style="width:' + Math.max(1, pct).toFixed(1) + '%"></i></div><strong>' + row.value + ' / ' + pct.toFixed(1) + '%</strong></div>';
  });
  html += '</div>';
  return html;
}

function renderNumericSnapshotSection(data) {
  const breadth = data.market_breadth || {};
  const limits = data.limit_stocks || {};
  const hasBreadth = Number.isFinite(Number(breadth.total)) && Number(breadth.total) > 0;
  const hasLimits = Array.isArray(limits.up) || Array.isArray(limits.down);
  if (!hasBreadth && !hasLimits && !(data.industries || []).length) return '';

  let html = '<section class="numeric-snapshot-section">';
  html += '<div class="section-header"><h2>关键数字面板</h2><span>数字先表格化，趋势另看历史图</span></div>';
  html += '<div class="numeric-grid">';
  if (hasBreadth) {
    html += '<div class="numeric-card">';
    html += '<h3>市场宽度</h3>';
    html += '<table class="compact-data-table"><tbody>';
    html += '<tr><th>上涨</th><td>' + Number(breadth.up || 0) + '</td><td>' + calcPct(breadth.up, breadth.total) + '</td></tr>';
    html += '<tr><th>下跌</th><td>' + Number(breadth.down || 0) + '</td><td>' + calcPct(breadth.down, breadth.total) + '</td></tr>';
    html += '<tr><th>平盘</th><td>' + Number(breadth.flat || 0) + '</td><td>' + calcPct(breadth.flat, breadth.total) + '</td></tr>';
    html += '</tbody></table>';
    html += renderBreadthBars(breadth);
    html += '</div>';
  }
  if (hasLimits) {
    html += '<div class="numeric-card">';
    html += '<h3>涨跌停</h3>';
    html += '<table class="compact-data-table"><tbody>';
    html += '<tr><th>涨停样本</th><td>' + ((limits.up || []).length) + '</td><td>' + escapeHtml((limits.up || []).slice(0, 3).map(function(i) { return i.name; }).filter(Boolean).join('、') || '-') + '</td></tr>';
    html += '<tr><th>跌停样本</th><td>' + ((limits.down || []).length) + '</td><td>' + escapeHtml((limits.down || []).slice(0, 3).map(function(i) { return i.name; }).filter(Boolean).join('、') || '-') + '</td></tr>';
    html += '</tbody></table>';
    html += '</div>';
  }
  if ((data.industries || []).length) {
    html += '<div class="numeric-card">';
    html += '<h3>行业评分 Top5</h3>';
    html += renderIndustryScoreTable((data.industries || []).slice(0, 5));
    html += '</div>';
  }
  html += '</div>';
  html += '<p class="subtle-note">备注：盘中实时数据可能延迟或缺口，表格只展示已返回的有效字段。</p>';
  html += '</section>';
  return html;
}

function renderIndustryScoreTable(industries) {
  if (!industries || !industries.length) return '';
  let html = '<table class="compact-data-table industry-score-table"><thead><tr><th>行业</th><th>模型分</th><th>主要依据</th><th>强弱条</th></tr></thead><tbody>';
  industries.forEach(function(item) {
    const score = Number.isFinite(Number(item.factor_score)) ? Number(item.factor_score) : Number(item.rating || 0) * 20;
    html += '<tr>';
    html += '<td><strong>' + escapeHtml(item.name || '-') + '</strong></td>';
    html += '<td>' + (Number.isFinite(score) ? score.toFixed(1) : '-') + '</td>';
    html += '<td>' + escapeHtml(item.element_profile || item.element_name || '-') + '</td>';
    html += '<td><div class="score-bar"><i style="width:' + Math.max(0, Math.min(100, score || 0)).toFixed(1) + '%"></i></div></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p class="subtle-note compact-note">强弱条只是候选池内部排序，不是上涨概率，也不是任务进度。</p>';
  return html;
}

function formatYi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const yi = Math.abs(n) > 1000000 ? n / 100000000 : n;
  return (yi >= 0 ? '+' : '') + yi.toFixed(2) + '亿';
}

function getBreadthBalancePct(marketBreadth) {
  if (!marketBreadth) return NaN;
  const up = Number(marketBreadth.up || 0);
  const down = Number(marketBreadth.down || 0);
  const total = Number(marketBreadth.total || (up + down + Number(marketBreadth.flat || 0)));
  if (!total) return NaN;
  return ((up - down) / total) * 100;
}

function buildVolumeAnalysis(data) {
  const momentum = data.market_momentum || {};
  const turnover = momentum.turnover || {};
  const turnoverRate = Number(turnover.marketRate);
  const breadthBalance = getBreadthBalancePct(data.market_breadth);
  const mainFlow = Number(momentum.mainForce && momentum.mainForce.netInflow);
  const etfFlow = Number(momentum.etfFlow && momentum.etfFlow.netInflow);
  const hasTurnover = Number.isFinite(turnoverRate);
  const hasMainFlow = Number.isFinite(mainFlow);
  const hasEtfFlow = Number.isFinite(etfFlow);
  const highTurnover = hasTurnover && turnoverRate >= 3;
  const lowTurnover = hasTurnover && turnoverRate < 1.5;
  const weakBreadth = Number.isFinite(breadthBalance) && breadthBalance < -8;
  const strongBreadth = Number.isFinite(breadthBalance) && breadthBalance > 8;
  const mainOutflow = hasMainFlow && mainFlow < 0;
  const mainInflow = hasMainFlow && mainFlow > 0;
  const etfInflow = hasEtfFlow && etfFlow > 0;

  let level = 'neutral';
  let title = '量能等待确认';
  let summary = '当前量能数据不足或方向不清，暂不把量能作为加仓依据。';
  let action = '保持观察，等成交活跃度、宽度和主力资金同时改善。';

  if (lowTurnover) {
    level = 'weak';
    title = '缩量观察';
    summary = '全市场换手偏低，说明成交活跃度不足，行情更容易反复。';
    action = '不追涨，只看回踩后能否放量。';
  } else if (highTurnover && weakBreadth && mainOutflow) {
    level = 'warning';
    title = '放量分歧，承接偏弱';
    summary = '成交活跃，但上涨家数占优不足，同时主力净流出，说明量能更多来自分歧和换手，不是顺畅进攻。';
    action = '不扩大仓位；候选行业只做观察，等宽度修复或主力流出收敛。';
  } else if (highTurnover && strongBreadth && mainInflow) {
    level = 'strong';
    title = '量价配合较好';
    summary = '换手活跃，市场宽度和主力资金同步改善，量能对进攻方向有支持。';
    action = '可按仓位纪律跟踪强势行业延续性，但仍不追首波拉升。';
  } else if (highTurnover && etfInflow && !mainInflow) {
    level = 'mixed';
    title = '指数资金托底，个股承接一般';
    summary = '换手活跃且 ETF 有净流入，但主力资金没有同步转强，说明更像指数/ETF 资金托底。';
    action = '优先看 ETF 和行业龙头，不把小票冲高当作普涨确认。';
  } else if (highTurnover) {
    level = 'mixed';
    title = '有量，但方向未完全确认';
    summary = '全市场换手活跃，但还需要结合宽度和资金方向判断这是真进攻还是高位分歧。';
    action = '只提高观察优先级，不单独因为有量就加仓。';
  }

  return { level, title, summary, action, turnoverRate, breadthBalance, mainFlow, etfFlow, active: Array.isArray(turnover.active) ? turnover.active : [] };
}

function renderVolumeAnalysisSection(data) {
  const analysis = buildVolumeAnalysis(data || {});
  if (!Number.isFinite(analysis.turnoverRate) && !analysis.active.length) return '';
  let html = '<section class="volume-analysis-section volume-' + analysis.level + '">';
  html += '<div class="section-header"><h2>量能分析</h2><span>看成交是否支持当前策略</span></div>';
  html += '<div class="volume-summary"><strong>' + escapeHtml(analysis.title) + '</strong><p>' + escapeHtml(analysis.summary) + '</p><small>' + escapeHtml(analysis.action) + '</small></div>';
  html += '<div class="volume-metrics">';
  html += '<div><span>全市场换手</span><strong>' + escapeHtml(formatMetricValue(analysis.turnoverRate, '%')) + '</strong><small>成交活跃度</small></div>';
  html += '<div><span>宽度差</span><strong>' + escapeHtml(formatMetricValue(analysis.breadthBalance, '%')) + '</strong><small>上涨家数 - 下跌家数</small></div>';
  html += '<div><span>主力净流入</span><strong>' + escapeHtml(formatYi(analysis.mainFlow)) + '</strong><small>承接强弱</small></div>';
  html += '<div><span>ETF净流入</span><strong>' + escapeHtml(formatYi(analysis.etfFlow)) + '</strong><small>指数/行业配置意愿</small></div>';
  html += '</div>';
  if (analysis.active.length) {
    html += '<details class="volume-detail"><summary>查看高换手样本</summary>';
    html += '<table class="compact-data-table"><thead><tr><th>标的</th><th>涨跌幅</th><th>换手率</th><th>成交额</th></tr></thead><tbody>';
    analysis.active.slice(0, 5).forEach(function(item) {
      html += '<tr><td>' + escapeHtml(item.name || item.code || '-') + '</td><td>' + escapeHtml(formatMetricValue(item.changePercent, '%')) + '</td><td>' + escapeHtml(formatMetricValue(item.turnoverRate, '%')) + '</td><td>' + escapeHtml(formatYi(item.amount)) + '</td></tr>';
    });
    html += '</tbody></table></details>';
  }
  html += '<p class="subtle-note">备注：量能不是买点本身。只有量能、市场宽度、资金方向和候选行业走势同时改善，才算对加仓有支持。</p>';
  html += '</section>';
  return html;
}

function renderHistoricalTrendSection(reportType) {
  return '<section class="trend-history-section">'
    + '<div class="section-header"><h2>策略变量趋势</h2><span>跟踪影响仓位和进攻/防守切换的变量</span></div>'
    + '<div id="reportTrendChart" class="trend-chart loading-chart">历史数据加载中...</div>'
    + '<p class="subtle-note">备注：顶部给今天的执行结论，这里看最近几次日报的宽度、换手、资金是否连续改善。</p>'
    + '</section>';
}

async function loadReportTrendChart(reportType) {
  const el = document.getElementById('reportTrendChart');
  if (!el) return;
  try {
    const res = await fetch(`${API_BASE}/reports?page=1&pageSize=60`);
    if (!res.ok) throw new Error('trend fetch failed');
    const payload = await res.json();
    const rows = (payload.data || [])
      .filter(function(row) { return !reportType || row.report_type === reportType; })
      .sort(function(a, b) { return String(a.report_date).localeCompare(String(b.report_date)); })
      .slice(-12);
    if (rows.length < 2) {
      el.classList.remove('loading-chart');
      el.innerHTML = '<div class="empty-state compact">历史样本不足，暂不绘制趋势图。</div>';
      return;
    }
    const trendRows = rows.map(buildStrategyTrendRow).filter(function(row) {
      return row && (Number.isFinite(row.breadthBalance) || Number.isFinite(row.turnover) || Number.isFinite(row.mainFlowYi) || Number.isFinite(row.etfFlowYi));
    });
    if (trendRows.length < 2) {
      el.classList.remove('loading-chart');
      el.innerHTML = '<div class="empty-state compact">策略变量历史样本不足，暂不绘制趋势图。</div>';
      return;
    }
    el.classList.remove('loading-chart');
    el.innerHTML = renderStrategyTrendPanels(trendRows);
  } catch (err) {
    el.classList.remove('loading-chart');
    el.innerHTML = '<div class="empty-state compact">历史趋势加载失败。</div>';
  }
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function buildStrategyTrendRow(row) {
  const breadth = parseMaybeJson(row.market_breadth_json) || row.market_breadth || {};
  const momentum = parseMaybeJson(row.market_momentum_json) || row.market_momentum || {};
  const up = Number(breadth.up || 0);
  const down = Number(breadth.down || 0);
  const total = Number(breadth.total || (up + down + Number(breadth.flat || 0)));
  const breadthBalance = total > 0 ? (up - down) / total * 100 : NaN;
  const mainFlowYi = isUsableTrendFlow(momentum.mainForce, momentum) ? Number(momentum.mainForce.netInflow) / 100000000 : NaN;
  const etfFlowYi = isUsableTrendFlow(momentum.etfFlow, momentum) ? Number(momentum.etfFlow.netInflow) / 100000000 : NaN;
  const turnover = isUsableTurnover(momentum.turnover, momentum) && Number.isFinite(Number(momentum.turnover.marketRate))
    ? Number(momentum.turnover.marketRate)
    : NaN;
  return {
    report_date: row.report_date,
    breadthBalance,
    turnover,
    mainFlowYi,
    etfFlowYi,
    hs300Change: Number(row.hs300_change)
  };
}

function isUsableTrendFlow(flow, momentum) {
  if (!flow || !Number.isFinite(Number(flow.netInflow))) return false;
  const value = Number(flow.netInflow);
  const leaders = Array.isArray(flow.leaders) ? flow.leaders : [];
  const summary = String(momentum && momentum.summary || '');
  if (value === 0 && leaders.length === 0 && /未返回|暂无|不可用|不再公开/.test(summary)) return false;
  return true;
}

function isUsableTurnover(turnover, momentum) {
  if (!turnover || !Number.isFinite(Number(turnover.marketRate))) return false;
  const value = Number(turnover.marketRate);
  const active = Array.isArray(turnover.active) ? turnover.active : [];
  const summary = String(momentum && momentum.summary || '');
  if (value === 0 && active.length === 0 && /未返回|暂无|不可用/.test(summary)) return false;
  return true;
}

function renderStrategyTrendPanels(rows) {
  const panels = [
    { key: 'breadthBalance', label: '市场宽度差', color: '#2563eb', unit: '%', help: '上涨家数减下跌家数，占全市场比例。越高说明可参与范围越宽。' },
    { key: 'turnover', label: '全市场换手率', color: '#7c3aed', unit: '%', help: '近似看量能活跃度，过低时不支持激进扩仓。' },
    { key: 'mainFlowYi', label: '主力净流入', color: '#dc2626', unit: '亿', help: '主力资金净额，连续转弱时降低进攻等级。' },
    { key: 'etfFlowYi', label: 'ETF净流入', color: '#16a34a', unit: '亿', help: 'ETF资金方向，辅助判断机构/被动资金是否配合。' }
  ].filter(function(panel) {
    return rows.some(function(row) { return Number.isFinite(row[panel.key]); });
  });
  let html = '<div class="trend-panels">';
  panels.forEach(function(panel) {
    html += '<div class="mini-trend-card">';
    html += '<div class="mini-trend-title"><strong>' + escapeHtml(panel.label) + '</strong><span>' + escapeHtml(panel.help) + '</span></div>';
    html += renderMetricTrendSvg(rows, panel);
    html += '</div>';
  });
  html += '</div>';
  html += renderTrendLatestTable(rows[rows.length - 1]);
  return html;
}

function renderMetricTrendSvg(rows, panel) {
  const width = 680;
  const height = 160;
  const pad = { left: 44, right: 16, top: 16, bottom: 34 };
  const values = rows.map(function(row) { return Number(row[panel.key]); }).filter(Number.isFinite);
  const min = Math.min(0, Math.min.apply(null, values));
  const max = Math.max(0, Math.max.apply(null, values));
  const x = function(index) {
    if (rows.length === 1) return pad.left;
    return pad.left + index * (width - pad.left - pad.right) / (rows.length - 1);
  };
  const y = function(value) {
    return pad.top + (max - value) * (height - pad.top - pad.bottom) / (max - min || 1);
  };
  const zeroY = y(0);
  let svg = '<svg class="trend-svg mini" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(panel.label) + '趋势">';
  svg += '<line x1="' + pad.left + '" y1="' + zeroY.toFixed(1) + '" x2="' + (width - pad.right) + '" y2="' + zeroY.toFixed(1) + '" class="zero-line"></line>';
  svg += '<line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + pad.left + '" y2="' + (height - pad.bottom) + '" class="axis-line"></line>';
  svg += '<line x1="' + pad.left + '" y1="' + (height - pad.bottom) + '" x2="' + (width - pad.right) + '" y2="' + (height - pad.bottom) + '" class="axis-line"></line>';
  [min, 0, max].forEach(function(v) {
    svg += '<text x="6" y="' + (y(v) + 4).toFixed(1) + '" class="axis-text">' + escapeHtml(formatMetricValue(v, panel.unit)) + '</text>';
  });
  const points = rows.map(function(row, index) {
    const value = Number(row[panel.key]);
    return Number.isFinite(value) ? x(index).toFixed(1) + ',' + y(value).toFixed(1) : null;
  }).filter(Boolean);
  if (points.length > 1) {
    svg += '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + panel.color + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></polyline>';
  }
  rows.forEach(function(row, index) {
    const value = Number(row[panel.key]);
    if (!Number.isFinite(value)) return;
    svg += '<circle cx="' + x(index).toFixed(1) + '" cy="' + y(value).toFixed(1) + '" r="3" fill="' + panel.color + '"><title>' + escapeHtml(row.report_date + ' ' + panel.label + ' ' + formatMetricValue(value, panel.unit)) + '</title></circle>';
  });
  rows.forEach(function(row, index) {
    if (index % Math.ceil(rows.length / 6) !== 0 && index !== rows.length - 1) return;
    svg += '<text x="' + x(index).toFixed(1) + '" y="' + (height - 18) + '" text-anchor="middle" class="axis-text">' + escapeHtml(String(row.report_date).slice(5)) + '</text>';
  });
  svg += '</svg>';
  return svg;
}

function renderTrendLatestTable(row) {
  if (!row) return '';
  return '<table class="compact-data-table trend-latest-table"><tbody>'
    + '<tr><th>最新宽度差</th><td>' + escapeHtml(formatMetricValue(row.breadthBalance, '%')) + '</td><td>正值越大，说明上涨家数越占优。</td></tr>'
    + '<tr><th>最新换手率</th><td>' + escapeHtml(formatMetricValue(row.turnover, '%')) + '</td><td>量能活跃度参考，不能单独代表买点。</td></tr>'
    + '<tr><th>主力净流入</th><td>' + escapeHtml(formatMetricValue(row.mainFlowYi, '亿')) + '</td><td>连续为负时，候选方向只观察不追。</td></tr>'
    + '<tr><th>ETF净流入</th><td>' + escapeHtml(formatMetricValue(row.etfFlowYi, '亿')) + '</td><td>辅助看资金是否愿意通过指数/行业 ETF 配置。</td></tr>'
    + '</tbody></table>';
}

function formatMetricValue(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return sign + n.toFixed(unit === '亿' ? 1 : 2) + unit;
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

function isVariableUnavailable(item) {
  const status = String(item.status || '');
  const value = String(item.value || '');
  if (/pending|todo|待接入|coming/i.test(status)) return true;
  if (/待接入|暂未|暂无|未返回|不再公开|coming-source|pending/.test(value)) return true;
  if (item.group === 'fund' && /主力\+0\.00亿，ETF\+0\.00亿/.test(value) && /未返回/.test(value)) return true;
  return false;
}

function buildVariableSummary(variables) {
  const ready = variables.filter(function(item) { return !isVariableUnavailable(item); });
  const market = ready.find(function(item) { return item.group === 'market'; });
  const breadth = ready.find(function(item) { return item.name === '市场宽度'; });
  const risk = ready.find(function(item) { return item.group === 'risk'; });
  const industry = ready.find(function(item) { return item.group === 'industry'; });
  const parts = [];
  if (market) parts.push(market.name + '：' + market.value);
  if (breadth) parts.push('宽度：' + breadth.value);
  if (industry) parts.push(industry.value);
  if (risk) parts.push('风险：' + String(risk.value || '').replace(/^事实：/, '').slice(0, 90));
  return parts.join('；') || '当前主要依据来自指数、行业评分、市场宽度和风险场景；未接入或未返回的数据不进入主判断。';
}

function renderVariableCard(item, groupNames) {
  const statusClass = item.status === 'ready' ? 'ready' : item.status === 'partial' ? 'partial' : 'pending';
  let html = '<div class="key-variable-card ' + statusClass + '">';
  html += '<div class="key-variable-meta"><span>' + escapeHtml(groupNames[item.group] || item.group || '变量') + '</span><small>' + escapeHtml(item.source || '') + '</small></div>';
  html += '<strong>' + escapeHtml(item.name || '-') + '</strong>';
  html += '<p>' + escapeHtml(item.value || '待接入数据源') + '</p>';
  html += '</div>';
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
  const primaryVariables = variables.filter(function(item) { return !isVariableUnavailable(item); });
  const unavailableVariables = variables.filter(isVariableUnavailable);
  if (!primaryVariables.length && !unavailableVariables.length) return '';
  let html = '<section class="key-variables-section">';
  html += '<div class="section-header"><h2>关键变量</h2><span>先看概括，明细折叠</span></div>';
  html += '<p class="key-variable-summary">' + escapeHtml(buildVariableSummary(variables)) + '</p>';
  if (primaryVariables.length) {
    html += '<details class="variable-details" open><summary>已纳入主判断的变量</summary>';
    html += '<div class="key-variable-grid">';
    primaryVariables.slice(0, 8).forEach(item => {
      html += renderVariableCard(item, groupNames);
    });
    html += '</div></details>';
  }
  if (unavailableVariables.length) {
    html += '<details class="variable-details muted-details"><summary>未接入或未返回的数据（不参与主判断）</summary>';
    html += '<div class="key-variable-grid">';
    unavailableVariables.slice(0, 8).forEach(item => {
      html += renderVariableCard(item, groupNames);
    });
    html += '</div></details>';
  }
  html += '<p class="key-variable-note">备注：资金、政策、突发事件等变量只有在数据源返回有效值时才进入主要展示和权重判断；空值不当成信号。</p>';
  html += '</section>';
  return html;
}

function hasEffectiveMomentum(momentum) {
  if (!momentum) return false;
  const mainLeaders = momentum.mainForce?.leaders || [];
  const etfLeaders = momentum.etfFlow?.leaders || [];
  const hasLeaders = mainLeaders.length > 0 || etfLeaders.length > 0;
  const hasNonZeroFlow = ['northbound', 'mainForce', 'etfFlow'].some(function(key) {
    return hasNumericValue(momentum[key]?.netInflow) && Math.abs(Number(momentum[key].netInflow)) > 0;
  });
  const hasNorthboundActivity = hasNumericValue(momentum.northbound?.dealAmountYi);
  return hasLeaders || hasNonZeroFlow || hasNorthboundActivity;
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
  let inner = '';

  // ⑩ 日运评级（如果有）
  if (data.day_rating) {
    inner += renderDayRating(data.day_rating);
  }

  // ⑧ A股简报
  if (data.astock_briefing) {
    inner += renderAstockBriefing(data.astock_briefing);
  }

  if (!inner) return '';
  return '<details class="mystic-legacy-details"><summary>玄学因子明细</summary><div class="interpretation-section">' + inner + '</div></details>';
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
  if (!hasEffectiveMomentum(momentum)) return '';
  const hasLeaders = (momentum.mainForce?.leaders || []).length > 0 || (momentum.etfFlow?.leaders || []).length > 0;
  const turnover = momentum.turnover && momentum.turnover.marketRate !== null && momentum.turnover.marketRate !== undefined
    ? Number(momentum.turnover.marketRate).toFixed(2) + '%'
    : '-';
  let html = '<section class="market-momentum-section">';
  html += '<div class="section-header"><h2>资金动量</h2></div>';
  html += '<table class="compact-data-table momentum-table"><thead><tr><th>变量</th><th>当前值</th><th>说明</th></tr></thead><tbody>';
  if (hasNumericValue(momentum.northbound?.netInflow) || hasNumericValue(momentum.northbound?.dealAmountYi)) {
    html += '<tr><th>北向资金</th><td>' + escapeHtml(formatNorthboundDisplay(momentum.northbound)) + '</td><td>' + escapeHtml(formatNorthboundNote(momentum.northbound)) + '</td></tr>';
  }
  if (hasNumericValue(momentum.mainForce?.netInflow) && Math.abs(Number(momentum.mainForce.netInflow)) > 0) {
    html += '<tr><th>主力净流入</th><td>' + formatFlowYi(momentum.mainForce.netInflow) + '</td><td>' + escapeHtml(formatMomentumNames(momentum.mainForce?.leaders)) + '</td></tr>';
  }
  if (hasNumericValue(momentum.etfFlow?.netInflow) && Math.abs(Number(momentum.etfFlow.netInflow)) > 0) {
    html += '<tr><th>ETF 流向</th><td>' + formatFlowYi(momentum.etfFlow.netInflow) + '</td><td>' + escapeHtml(formatMomentumNames(momentum.etfFlow?.leaders)) + '</td></tr>';
  }
  if (hasLeaders) {
    html += '<tr><th>活跃方向</th><td colspan="2">主力：' + escapeHtml(formatMomentumNames(momentum.mainForce?.leaders)) + '；ETF：' + escapeHtml(formatMomentumNames(momentum.etfFlow?.leaders)) + '</td></tr>';
  }
  if (turnover !== '-') {
    html += '<tr><th>市场换手</th><td>' + turnover + '</td><td>只作活跃度参考，不单独构成方向信号</td></tr>';
  }
  html += '</tbody></table>';
  html += '<div class="momentum-note muted">' + escapeHtml(formatNorthboundNote(momentum.northbound)) + '</div>';
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

function renderAssistantMarkdown(text) {
  const inline = value => escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += '<p>' + inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>';
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html += listType === 'ol' ? '</ol>' : '</ul>';
    listType = null;
  };

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const tag = heading[1].length === 1 ? 'h3' : 'h4';
      html += `<${tag}>${inline(heading[2])}</${tag}>`;
      return;
    }
    const ordered = line.match(/^\d+[.、]\s*(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (ordered || bullet) {
      flushParagraph();
      const nextType = ordered ? 'ol' : 'ul';
      if (listType && listType !== nextType) closeList();
      if (!listType) {
        listType = nextType;
        html += nextType === 'ol' ? '<ol>' : '<ul>';
      }
      html += '<li>' + inline((ordered || bullet)[1]) + '</li>';
      return;
    }
    paragraph.push(line);
  });
  flushParagraph();
  closeList();
  return html || '<p>没有生成有效回答。</p>';
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
        <span>先筛方向，再等盘面确认，不等于买入清单</span>
      </div>
      <div class="industry-logic-note">
        <strong>推荐逻辑很简单：</strong>
        <span>月运/五行先告诉我们“本月哪些风格更容易被市场讲故事”；日报再用市场宽度、换手、资金和行业自身走势确认。确认前只观察，确认后才进入重点跟踪；分数只决定观察顺序。</span>
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
          <span class="industry-rating">${industry.factor_score ? '模型分 ' + Number(industry.factor_score).toFixed(1) : stars}</span>
        </div>
        <div class="industry-element"><strong>为什么入池：</strong>${escapeHtml(getIndustryPlainReason(industry))}</div>
        ${keyVars.length ? `<div class="industry-v21-meta"><strong>跟踪什么</strong><span>${keyVars.map(escapeHtml).join(' / ')}</span></div>` : ''}
        <div class="industry-v21-meta"><strong>怎么升级</strong><span>${escapeHtml(getIndustryUpgradeRule(industry))}</span></div>
        ${pressure.level ? `<div class="industry-pressure pressure-${pressureLevel}"><strong>什么情况降级</strong><span>${escapeHtml(pressureText)}</span></div>` : ''}
        ${industry.reason ? `<details class="industry-detail"><summary>查看模型细节</summary><p>${escapeHtml(industry.reason)}</p>${industry.calculation_rule ? `<p>${escapeHtml(industry.calculation_rule)}</p>` : ''}</details>` : ''}
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
  let html = `<div class="stock-analysis-section">
    <div class="section-header">
      <h2>📊 关注标的走势与四维分析</h2>
      <button class="btn-refresh" onclick="refreshStockAnalysis()">🔄 刷新分析</button>
    </div>
    <p class="subtle-note">当前四维分析是规则引擎，不是大模型输出；展开后可查看走势、估值口径和四维解释。</p>
    <div class="stock-analysis-list">
  `;

  stocks.forEach(function(stock) {
    if (!stock.code) return;
    const alertClass = stock.alert_level === 'red' ? 'alert-red' :
                      stock.alert_level === 'yellow' ? 'alert-yellow' :
                      stock.alert_level === 'green' ? 'alert-green' : '';
    const domId = stockDomId(stock.code);
    html += `<details class="stock-analysis-card ${alertClass}" id="analysis-${domId}" data-stock-code="${escapeHtml(stock.code)}">
      <summary class="analysis-header">
        <span class="stock-name">${stock.name}</span>
        <span class="stock-code">${stock.code}</span>
        <span class="load-indicator" id="load-indicator-${domId}">分析加载中...</span>
      </summary>
      <div class="analysis-loading" id="loading-${domId}">
        <div class="spinner"></div>
        <span>正在生成投资分析...</span>
      </div>
    </details>`;
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
  const domId = stockDomId(code);
  const card = document.getElementById('analysis-' + domId);
  const loading = document.getElementById('loading-' + domId);
  if (!card || !loading) return;
  card.querySelectorAll('.analysis-content, .analysis-error-msg').forEach(function(node) { node.remove(); });
  const loadIndicator = document.getElementById('load-indicator-' + domId);
  if (loading) loading.style.display = '';
  if (loadIndicator) loadIndicator.style.display = '';

  try {
    const analysisPromise = fetchJsonWithTimeout(`${API_BASE}/stock/analyze?q=` + encodeURIComponent(code), 10000);
    const trendPromise = fetchJsonWithTimeout(`${API_BASE}/stock/trend?q=` + encodeURIComponent(code) + '&days=30', 10000).catch(function() { return null; });
    const data = await analysisPromise;
    const trend = await trendPromise;

    // 渲染四维投资分析
    let html = `<div class="analysis-content">
      <div class="stock-quote-grid">
        <div><span>现价</span><strong>${data.price ? data.price.toFixed(2) : '-'}</strong></div>
        <div><span>涨跌幅</span><strong class="${data.changePercent >= 0 ? 'positive' : 'negative'}">${data.changePercent >= 0 ? '+' : ''}${Number.isFinite(Number(data.changePercent)) ? Number(data.changePercent).toFixed(2) : '-'}%</strong></div>
        <div><span>PE</span><strong>${Number.isFinite(Number(data.pe)) ? Number(data.pe).toFixed(1) : '-'}</strong></div>
        <div><span>PB</span><strong>${Number.isFinite(Number(data.pb)) ? Number(data.pb).toFixed(2) : '-'}</strong></div>
      </div>
      ${renderStockTrendChart(trend)}
      <p class="stock-source-note">估值口径：腾讯行情 PE_TTM/PB，缺失时用东财妙想补充；不同平台可能使用静态PE、TTM、扣非PE或不同更新时间，所以只作参考。四维分析来源：${escapeHtml(data.data_sources?.analysis || '规则引擎，未调用大模型')}。</p>`;

    if (data.analysis) {
      const a = data.analysis;
      const decision = a.decision || {};
      const badges = Array.isArray(a.badges) ? a.badges : [];
      if (decision.label || decision.summary) {
        html += `<div class="stock-decision compact ${escapeHtml(decision.level || 'watch')}">
          <div class="stock-decision-main">
            <span>综合门控</span>
            <strong>${escapeHtml(decision.label || '可跟踪验证')}</strong>
            <small>${Number.isFinite(Number(decision.score)) ? '融合分 ' + Number(decision.score).toFixed(0) : ''}</small>
          </div>
          <p>${escapeHtml(decision.summary || '')}</p>
          ${decision.action ? `<p class="stock-decision-action">${escapeHtml(decision.action)}</p>` : ''}
          ${badges.length ? `<div class="stock-badges">${badges.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
        </div>`;
      }
      html += '<details class="stock-dimension-details" open><summary>融合四维分析详情</summary>';
      if (a.mystic) html += `<div class="dim-row"><span class="dim-label mystic">五行/行业</span><span class="dim-text">${escapeHtml(a.mystic)}</span></div>`;
      if (a.fundamental) html += `<div class="dim-row"><span class="dim-label fundamental">价投/基本面</span><span class="dim-text">${escapeHtml(a.fundamental)}</span></div>`;
      if (a.value_points) html += `<div class="dim-row"><span class="dim-label value-points">买卖点</span><span class="dim-text">${escapeHtml(a.value_points)}</span></div>`;
      if (a.technical) html += `<div class="dim-row"><span class="dim-label technical">量价/趋势</span><span class="dim-text">${escapeHtml(a.technical)}</span></div>`;
      if (a.flow) html += `<div class="dim-row"><span class="dim-label flow">资金/风险</span><span class="dim-text">${escapeHtml(a.flow)}</span></div>`;
      html += '</details>';
    }

    html += `</div>`;
    // 只追加内容，保留原有头部（股票名称）
    if (loading) loading.style.display = 'none';
    if (loadIndicator) loadIndicator.style.display = 'none';
    card.insertAdjacentHTML('beforeend', html);
  } catch(e) {
    // hide loading, append error (preserve header)
    const loadIndicatorErr = document.getElementById('load-indicator-' + domId);
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
    const code = card.dataset.stockCode || id.replace('analysis-', '');
    const name = card.querySelector('.stock-name') ? card.querySelector('.stock-name').textContent : code;
    loadStockAnalysis(code, name);
  });
}

// 全局暴露
window.loadStockAnalysis = loadStockAnalysis;

function stockDomId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

async function fetchJsonWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(function() { controller.abort(); }, ms || 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('请求失败');
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function renderStockTrendChart(trend) {
  const bars = trend && Array.isArray(trend.bars) ? trend.bars.filter(function(bar) {
    return bar && Number.isFinite(Number(bar.close));
  }) : [];
  if (bars.length < 2) {
    return '<div class="stock-trend-empty">近 30 日走势暂不可用。</div>';
  }
  const first = Number(bars[0].close) || 1;
  const rows = bars.map(function(bar) {
    return {
      date: bar.date,
      value: (Number(bar.close) - first) / first * 100,
      close: Number(bar.close)
    };
  });
  const latest = rows[rows.length - 1];
  return '<div class="stock-trend-box">'
    + '<div class="stock-trend-head"><strong>近30日走势</strong><span>相对首日 ' + escapeHtml(formatMetricValue(latest.value, '%')) + '，最新收盘 ' + latest.close.toFixed(2) + '</span></div>'
    + renderMetricTrendSvg(rows.map(function(row) { return { report_date: row.date, stockReturn: row.value }; }), { key: 'stockReturn', label: '近30日收益', color: latest.value >= 0 ? '#16a34a' : '#dc2626', unit: '%', help: '' })
    + '</div>';
}

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
  syncReportUrlState();
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
    currentReportData = data;
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
  let code = document.getElementById('stockCode').value.trim();
  let alertLevel = document.getElementById('stockAlertLevel').value;
  let suggestion = document.getElementById('stockSuggestion').value;
  let reason = document.getElementById('stockReason').value.trim();

  // 支持名称或代码至少输入一项
  if (!name && !code) {
    alert('请输入标的名称或代码');
    return;
  }
  
  // 如果只输入了代码，尝试用代码作为名称；如果只输入名称，用名称作为代码
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
      const analyzeQuery = name || code;
      const res = await fetch(`${API_BASE}/stock/analyze?q=${encodeURIComponent(analyzeQuery)}`);
      if (res.ok) {
        const data = await res.json();
        // 自动填充代码
        if (!code && data.code) {
          code = data.code;
          document.getElementById('stockCode').value = code;
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

  const finalName = name || code;
  const finalCode = code || '';
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
      let message = '保存失败';
      try {
        const errPayload = await res.json();
        if (errPayload && errPayload.error) message = errPayload.error;
      } catch (e) {}
      alert(message);
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

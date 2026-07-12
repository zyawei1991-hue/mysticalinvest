const APP_BASE = location.pathname === '/daily' || location.pathname.startsWith('/daily/') ? '/daily' : '';
const API = `${APP_BASE}/api`;
const STATES = ['未覆盖', '初步观察', '等待确认', '条件改善', '重点跟踪', '降级观察', '逻辑失效'];
const viewMeta = {
  today: ['今日决策面板', '状态、风险和变化优先，五行用于解释候选来源'],
  observations: ['观察池', '行业、ETF 与个股使用同一状态语言'],
  assistant: ['AI 分析', '引用冻结数据、规则依据和缺失项'],
  validations: ['验证档案', '从当时结论到后续表现的完整轨迹']
};

const appState = {
  view: location.hash.replace('#', '') || 'today',
  reportType: 'morning',
  overview: null,
  observations: [],
  observationType: 'all',
  observationState: '',
  observationRisk: '',
  showTopFive: false,
  validationStatus: 'pending',
  validationMode: 'tasks',
  assistantMessages: []
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  populateStateFilter();
  bindNavigation();
  bindPeriodControls();
  bindObservationControls();
  bindAssistant();
  bindValidationControls();
  document.getElementById('refreshButton').addEventListener('click', refreshCurrentView);
  document.getElementById('toggleTopFive').addEventListener('click', () => {
    appState.showTopFive = !appState.showTopFive;
    document.getElementById('toggleTopFive').textContent = appState.showTopFive ? '收起为 Top3' : '展开 Top5';
    renderDirections();
  });
  document.getElementById('closeDetail').addEventListener('click', () => document.getElementById('detailDialog').close());
  showView(viewMeta[appState.view] ? appState.view : 'today', false);
}

function bindNavigation() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  window.addEventListener('hashchange', () => {
    const view = location.hash.replace('#', '');
    if (viewMeta[view]) showView(view, false);
  });
}

function showView(view, updateHash = true) {
  appState.view = view;
  if (updateHash && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  document.querySelectorAll('.app-view').forEach(node => node.classList.toggle('active', node.id === `${view}View`));
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.getElementById('viewTitle').textContent = viewMeta[view][0];
  document.getElementById('viewSubtitle').textContent = viewMeta[view][1];
  document.querySelector('.topbar-actions').hidden = view !== 'today';
  document.getElementById('mainContent').focus({ preventScroll: true });
  if (view === 'today') loadOverview();
  if (view === 'observations') loadObservations();
  if (view === 'assistant') updateAssistantContext();
  if (view === 'validations') loadValidations();
}

function bindPeriodControls() {
  document.querySelectorAll('.period-button').forEach(button => {
    button.addEventListener('click', () => {
      appState.reportType = button.dataset.type;
      document.querySelectorAll('.period-button').forEach(item => item.classList.toggle('active', item === button));
      loadOverview();
    });
  });
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  let payload = null;
  try { payload = await response.json(); } catch (error) { payload = null; }
  if (!response.ok) throw new Error(payload?.message || payload?.error || `请求失败 (${response.status})`);
  return payload;
}

async function loadOverview() {
  const loading = document.getElementById('todayLoading');
  const content = document.getElementById('todayContent');
  const error = document.getElementById('todayError');
  loading.hidden = false;
  content.hidden = true;
  error.hidden = true;
  try {
    appState.overview = await api(`/platform/overview?type=${encodeURIComponent(appState.reportType)}`);
    renderOverview();
    loading.hidden = true;
    content.hidden = false;
    setServiceState(true);
  } catch (requestError) {
    loading.hidden = true;
    error.hidden = false;
    error.textContent = `当前时点暂不可用：${requestError.message}`;
    setServiceState(false);
  }
}

function renderOverview() {
  const data = appState.overview;
  const market = data.market;
  document.getElementById('marketState').textContent = market.state;
  const risk = document.getElementById('riskLevel');
  risk.textContent = `风险 ${market.risk_level}`;
  risk.className = `status-label risk-${riskClass(market.risk_level)}`;
  document.getElementById('marketConclusion').textContent = cleanConclusion(market.conclusion);
  document.getElementById('reportTime').textContent = `${data.report.date} ${data.report.time || data.report.type_label}`;
  document.getElementById('marketCompleteness').textContent = `${market.completeness}%`;
  document.getElementById('stateChange').textContent = data.changes[0]?.text || '暂无关键变化';
  document.getElementById('riskSummary').textContent = `${market.risk_gates.filter(item => item.level === '高').length} 个高风险 / ${market.risk_gates.filter(item => item.level === '中').length} 个待确认`;
  renderRiskGates(market.risk_gates);
  renderChanges(data.changes);
  renderElementDial(data.top_directions.slice(0, 3));
  renderDirections();
  renderTodayValidations(data.pending_validations);
  document.getElementById('modelVersion').textContent = data.model.version;
}

function renderRiskGates(items) {
  document.getElementById('riskGateList').innerHTML = items.map(item => `
    <article class="risk-gate">
      <div class="risk-gate-head"><h3>${escapeHtml(item.label)}</h3><span class="risk-chip ${riskClass(item.level)}">${escapeHtml(item.level)}风险</span></div>
      <dl>
        <div><dt>已发生事实</dt><dd>${escapeHtml(item.fact)}</dd></div>
        <div><dt>条件性风险</dt><dd>${escapeHtml(item.condition)}</dd></div>
        <div><dt>候选影响</dt><dd>${escapeHtml(item.impact)}</dd></div>
      </dl>
    </article>`).join('');
}

function renderChanges(items) {
  const typeLabels = { entered: '新进入', downgrade: '已降级', stable: '无变化', upgrade: '已升级', invalidated: '已失效' };
  document.getElementById('changeList').innerHTML = items.map(item => `
    <div class="change-item ${escapeHtml(item.type)}"><span>${typeLabels[item.type] || '状态变化'}</span><strong>${escapeHtml(item.text)}</strong></div>`).join('');
}

function renderElementDial(items) {
  const elements = ['木', '火', '土', '金', '水'];
  const totals = Object.fromEntries(elements.map(item => [item, 0]));
  let samples = 0;
  items.forEach(item => {
    const profile = item.factors?.element_profile || '';
    const matches = [...profile.matchAll(/([木火土金水])(\d+)%/g)];
    if (matches.length) samples += 1;
    matches.forEach(match => { totals[match[1]] += Number(match[2]); });
  });
  document.getElementById('elementDial').innerHTML = elements.map(element => {
    const value = samples ? Math.round(totals[element] / samples) : 0;
    return `<div class="element-column" data-element="${element}"><div class="element-bar-wrap"><i class="element-bar" style="height:${Math.max(5, value * 2.7)}px"></i></div><strong>${element}</strong><small>${value}%</small></div>`;
  }).join('');
}

function renderDirections() {
  const directions = appState.overview?.top_directions || [];
  const visible = directions.slice(0, appState.showTopFive ? 5 : 3);
  document.getElementById('directionList').innerHTML = visible.map((item, index) => `
    <article class="direction-row" data-observation-id="${item.id}">
      <div class="direction-rank">${String(index + 1).padStart(2, '0')}</div>
      <div class="direction-name"><h3>${escapeHtml(item.name)}</h3><span class="direction-state ${stateClass(item.state)}">${escapeHtml(item.state)}</span><p>${escapeHtml(item.factors?.element_profile || '五行暴露待补充')}</p></div>
      <div class="score-line"><strong>${formatScore(item.score)}</strong><span>综合排序分<br>置信度 ${escapeHtml(item.confidence || '--')}</span></div>
      <div class="direction-cell"><strong>确认与风险</strong><p>${escapeHtml(item.primary_driver)}</p><p>${escapeHtml(item.primary_risk)}</p></div>
      <div class="condition-list"><span class="up">升级：${escapeHtml(item.upgrade_condition)}</span><span class="down">降级：${escapeHtml(item.downgrade_condition)}</span></div>
    </article>`).join('');
  document.querySelectorAll('.direction-row').forEach(row => row.addEventListener('click', () => openObservationDetail(row.dataset.observationId)));
}

function renderTodayValidations(items) {
  const target = document.getElementById('todayValidationList');
  if (!items.length) {
    target.innerHTML = '<div class="empty-state">当前没有待验证事项。</div>';
    return;
  }
  target.innerHTML = items.map(item => `
    <div class="validation-item"><time>${formatDate(item.due_date)}</time><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.condition_text)}</span><span>${item.horizon_days} 日</span></div>`).join('');
}

function bindObservationControls() {
  document.querySelectorAll('[data-filter-type]').forEach(button => {
    button.addEventListener('click', () => {
      appState.observationType = button.dataset.filterType;
      document.querySelectorAll('[data-filter-type]').forEach(item => item.classList.toggle('active', item === button));
      loadObservations();
    });
  });
  document.getElementById('stateFilter').addEventListener('change', event => { appState.observationState = event.target.value; loadObservations(); });
  document.getElementById('riskFilter').addEventListener('change', event => { appState.observationRisk = event.target.value; loadObservations(); });
  const dialog = document.getElementById('addObservationDialog');
  document.getElementById('openAddObservation').addEventListener('click', () => {
    document.getElementById('addObservationError').hidden = true;
    document.getElementById('addObservationForm').reset();
    dialog.showModal();
  });
  document.getElementById('submitObservation').addEventListener('click', submitObservation);
}

function populateStateFilter() {
  const select = document.getElementById('stateFilter');
  STATES.forEach(state => select.insertAdjacentHTML('beforeend', `<option>${state}</option>`));
}

async function loadObservations() {
  const params = new URLSearchParams();
  if (appState.observationType !== 'all') params.set('type', appState.observationType);
  if (appState.observationState) params.set('state', appState.observationState);
  if (appState.observationRisk) params.set('risk', appState.observationRisk);
  const rows = document.getElementById('observationRows');
  rows.innerHTML = '<tr><td colspan="8">正在读取观察池...</td></tr>';
  try {
    const payload = await api(`/platform/observations?${params}`);
    appState.observations = payload.data || [];
    renderObservations();
    setServiceState(true);
  } catch (error) {
    rows.innerHTML = `<tr><td colspan="8" class="risk-text high">${escapeHtml(error.message)}</td></tr>`;
    setServiceState(false);
  }
}

function renderObservations() {
  const rows = document.getElementById('observationRows');
  const empty = document.getElementById('observationEmpty');
  const data = appState.observations;
  empty.hidden = data.length > 0;
  rows.innerHTML = data.map(item => `
    <tr data-observation-id="${item.id}" tabindex="0">
      <td class="name-cell"><strong>${escapeHtml(item.name)}</strong><small>${typeLabel(item.object_type)}${item.code ? ` · ${escapeHtml(item.code)}` : ''}</small></td>
      <td><span class="state-text ${stateClass(item.state)}">${escapeHtml(item.state)}</span></td>
      <td><strong>${formatScore(item.score)}</strong><br><span>${escapeHtml(item.confidence || '--')}置信度</span></td>
      <td>${item.transition_count > 1 ? `${item.transition_count - 1} 次变化` : '首次进入'}</td>
      <td>${escapeHtml(item.primary_driver || '--')}</td>
      <td>${escapeHtml(item.primary_risk || '--')}</td>
      <td><div class="completeness"><div class="completeness-bar"><i style="width:${clamp(item.completeness)}%"></i></div><span>${clamp(item.completeness)}%</span></div></td>
      <td>${formatDate(item.next_review)}<br><span class="risk-text ${riskClass(item.risk_level)}">${escapeHtml(item.risk_level || '--')}风险</span></td>
    </tr>`).join('');
  document.getElementById('observationSummary').innerHTML = [
    `<span>共 <strong>${data.length}</strong> 个对象</span>`,
    `<span>重点跟踪 <strong>${data.filter(item => item.state === '重点跟踪').length}</strong></span>`,
    `<span>条件改善 <strong>${data.filter(item => item.state === '条件改善').length}</strong></span>`,
    `<span>降级观察 <strong>${data.filter(item => item.state === '降级观察').length}</strong></span>`
  ].join('');
  rows.querySelectorAll('tr').forEach(row => {
    const open = () => openObservationDetail(row.dataset.observationId);
    row.addEventListener('click', open);
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
}

async function submitObservation() {
  const query = document.getElementById('observationQuery').value.trim();
  const objectType = document.getElementById('observationType').value;
  const errorNode = document.getElementById('addObservationError');
  const button = document.getElementById('submitObservation');
  if (!query) { errorNode.hidden = false; errorNode.textContent = '请输入行业名称、ETF 或六位股票代码。'; return; }
  button.disabled = true;
  button.textContent = '正在识别...';
  errorNode.hidden = true;
  try {
    await api('/platform/observations', {
      method: 'POST',
      body: JSON.stringify({ name: query, code: /^\d{6}$/.test(query) ? query : '', object_type: objectType || undefined, report_type: appState.reportType })
    });
    document.getElementById('addObservationDialog').close();
    showToast('标的已加入观察池并生成初始状态。');
    await loadObservations();
  } catch (error) {
    errorNode.hidden = false;
    errorNode.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '加入观察池';
  }
}

async function openObservationDetail(id) {
  const dialog = document.getElementById('detailDialog');
  const content = document.getElementById('detailContent');
  document.getElementById('detailTitle').textContent = '标的详情';
  document.getElementById('detailSubtitle').textContent = '正在读取冻结状态与轨迹';
  content.innerHTML = '<div class="loading-state">正在加载详情...</div>';
  dialog.showModal();
  try {
    const data = await api(`/platform/observations/${id}`);
    renderObservationDetail(data);
  } catch (error) {
    content.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderObservationDetail(data) {
  const current = data.current || {};
  const factors = current.factors || {};
  document.getElementById('detailTitle').textContent = data.item.name;
  document.getElementById('detailSubtitle').textContent = `${typeLabel(data.item.object_type)}${data.item.code ? ` · ${data.item.code}` : ''} · 数据时点 ${formatDateTime(current.observed_at)}`;
  document.getElementById('detailContent').innerHTML = `
    <section class="detail-hero">
      <div class="detail-hero-main"><h3>${escapeHtml(current.state || '未覆盖')}</h3><p>${escapeHtml(current.summary || '暂无状态摘要')}</p></div>
      <div class="detail-metric"><span>综合排序</span><strong>${formatScore(current.score)}</strong></div>
      <div class="detail-metric"><span>风险等级</span><strong class="risk-text ${riskClass(current.risk_level)}">${escapeHtml(current.risk_level || '--')}</strong></div>
      <div class="detail-metric"><span>数据完整度</span><strong>${clamp(current.completeness)}%</strong></div>
    </section>
    <section class="detail-section"><h3>五行先验与金融确认</h3><div class="factor-grid">
      <div class="factor-item"><span>五行先验分</span><strong>${formatScore(factors.mystic_prior)}</strong><small>${escapeHtml(factors.element_profile || '行业暴露待补充')}</small></div>
      <div class="factor-item"><span>金融确认分</span><strong>${formatScore(factors.financial_confirmation)}</strong><small>${escapeHtml(current.primary_driver || '等待确认')}</small></div>
      <div class="factor-item"><span>风险门控分</span><strong>${formatScore(factors.risk_gate)}</strong><small>${escapeHtml(current.primary_risk || '暂无高风险')}</small></div>
    </div></section>
    <section class="detail-section"><h3>条件与风险</h3><div class="condition-grid">
      <div class="condition-box up"><strong>升级条件</strong><p>${escapeHtml(current.upgrade_condition || '--')}</p></div>
      <div class="condition-box down"><strong>降级条件</strong><p>${escapeHtml(current.downgrade_condition || '--')}</p></div>
      <div class="condition-box invalid"><strong>失效条件</strong><p>${escapeHtml(current.invalidation_condition || '--')}</p></div>
    </div></section>
    <section class="detail-section"><h3>数据来源与边界</h3><div class="factor-grid">
      ${Object.entries(current.source_meta || {}).map(([key, value]) => `<div class="factor-item"><span>${escapeHtml(sourceLabel(key))}</span><strong>${value === true ? '代理口径' : value === false ? '非代理' : escapeHtml(String(value || '--'))}</strong><small>${value === null ? '数据缺失' : '已记录来源元数据'}</small></div>`).join('') || '<div class="factor-item"><span>来源</span><strong>待补充</strong></div>'}
    </div></section>
    <section class="detail-section"><h3>历史轨迹</h3><div class="compact-timeline">
      ${data.transitions.length ? data.transitions.map(item => `<div class="compact-transition"><time>${formatDateTime(item.occurred_at)}</time><span>${escapeHtml(item.from_state || '首次进入')} → ${escapeHtml(item.to_state)}</span><p>${escapeHtml(item.reason)}</p></div>`).join('') : '<p>暂无状态变化。</p>'}
    </div></section>
    <section class="detail-section"><h3>验证窗口</h3><div class="validation-list">
      ${data.validation_tasks.length ? data.validation_tasks.slice(0, 10).map(item => `<div class="validation-item"><time>${formatDate(item.due_date)}</time><strong>${item.horizon_days} 日窗口</strong><span>${escapeHtml(item.condition_text)}</span><span>${escapeHtml(item.verdict || item.status)}</span></div>`).join('') : '<p>暂无验证任务。</p>'}
    </div></section>`;
}

function bindAssistant() {
  document.getElementById('assistantForm').addEventListener('submit', event => {
    event.preventDefault();
    sendAssistantQuestion(document.getElementById('assistantInput').value);
  });
  document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => sendAssistantQuestion(button.dataset.question)));
}

function updateAssistantContext() {
  if (!appState.overview) {
    loadOverview().then(updateAssistantContext);
    return;
  }
  const data = appState.overview;
  document.getElementById('assistantContextData').innerHTML = `
    <div><dt>报告时点</dt><dd>${escapeHtml(data.report.date)} ${escapeHtml(data.report.type_label)}</dd></div>
    <div><dt>市场状态</dt><dd>${escapeHtml(data.market.state)} / ${escapeHtml(data.market.risk_level)}风险</dd></div>
    <div><dt>Top3</dt><dd>${escapeHtml(data.top_directions.slice(0,3).map(item => item.name).join('、'))}</dd></div>
    <div><dt>数据完整度</dt><dd>${data.market.completeness}%</dd></div>
    <div><dt>规则版本</dt><dd>${escapeHtml(data.model.version)}</dd></div>`;
}

async function sendAssistantQuestion(rawQuestion) {
  const question = String(rawQuestion || '').trim();
  if (!question) return;
  const input = document.getElementById('assistantInput');
  input.value = '';
  const messages = document.getElementById('assistantMessages');
  messages.insertAdjacentHTML('beforeend', messageHtml('user', question));
  const loadingId = `assistant-loading-${Date.now()}`;
  messages.insertAdjacentHTML('beforeend', `<article id="${loadingId}" class="assistant-message assistant"><div class="message-author">分析助手</div><div class="message-body"><p>正在读取状态、行情和知识库...</p></div></article>`);
  messages.scrollTop = messages.scrollHeight;
  try {
    const history = appState.assistantMessages.slice(-8);
    const payload = await api('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message: question, messages: history, report_type: appState.reportType, presentation_mode: 'platform' })
    });
    appState.assistantMessages.push({ role: 'user', content: question }, { role: 'assistant', content: payload.answer });
    document.getElementById(loadingId).outerHTML = messageHtml('assistant', payload.answer, payload.data_sources);
  } catch (error) {
    document.getElementById(loadingId).outerHTML = messageHtml('assistant', `分析暂不可用：${error.message}`);
  }
  messages.scrollTop = messages.scrollHeight;
}

function messageHtml(role, content, sources) {
  const paragraphs = escapeHtml(content).split(/\n{2,}/).map(item => `<p>${item.replace(/\n/g, '<br>')}</p>`).join('');
  const sourceText = sources ? `<p><small>数据来源：${escapeHtml([sources.latest_report, sources.stock, sources.stock_trend].filter(Boolean).join('；') || '项目状态与知识库')}</small></p>` : '';
  return `<article class="assistant-message ${role}"><div class="message-author">${role === 'user' ? '你的问题' : '分析助手'}</div><div class="message-body">${paragraphs}${sourceText}</div></article>`;
}

function bindValidationControls() {
  document.querySelectorAll('.validation-filter').forEach(button => button.addEventListener('click', () => {
    appState.validationStatus = button.dataset.status;
    document.querySelectorAll('.validation-filter').forEach(item => item.classList.toggle('active', item === button));
    loadValidations();
  }));
  document.querySelectorAll('.validation-mode').forEach(button => button.addEventListener('click', () => {
    appState.validationMode = button.dataset.validationMode;
    document.querySelectorAll('.validation-mode').forEach(item => item.classList.toggle('active', item === button));
    renderValidationMode();
  }));
  document.getElementById('attributionHorizon').addEventListener('change', loadAttribution);
  document.getElementById('runValidation').addEventListener('click', runDueValidations);
  document.getElementById('generateWeeklyReport').addEventListener('click', () => generateValidationReport('week'));
  document.getElementById('generateMonthlyReport').addEventListener('click', () => generateValidationReport('month'));
}

function renderValidationMode() {
  document.getElementById('validationTasksPanel').hidden = appState.validationMode !== 'tasks';
  document.getElementById('attributionPanel').hidden = appState.validationMode !== 'attribution';
  document.getElementById('validationReportsPanel').hidden = appState.validationMode !== 'reports';
  if (appState.validationMode === 'attribution') loadAttribution();
  if (appState.validationMode === 'reports') loadValidationReports();
}

async function loadValidations() {
  const rows = document.getElementById('validationRows');
  rows.innerHTML = '<tr><td colspan="6">正在读取验证任务...</td></tr>';
  try {
    const [tasks, transitions] = await Promise.all([
      api(`/platform/validations${appState.validationStatus ? `?status=${appState.validationStatus}` : ''}`),
      api('/platform/transitions')
    ]);
    renderValidations(tasks.data || [], transitions.data || []);
  } catch (error) {
    rows.innerHTML = `<tr><td colspan="6" class="risk-text high">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function runDueValidations() {
  const button = document.getElementById('runValidation');
  button.disabled = true;
  button.textContent = '正在结算...';
  try {
    const result = await api('/platform/validations/run', { method: 'POST', body: '{}' });
    showToast(`已扫描 ${result.scanned} 项，完成 ${result.completed} 项，数据不足 ${result.insufficient} 项。`);
    await loadValidations();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = '结算到期任务';
  }
}

async function loadAttribution() {
  const horizon = document.getElementById('attributionHorizon').value;
  const grid = document.getElementById('attributionGrid');
  grid.innerHTML = '<div class="loading-state">正在读取冻结回测...</div>';
  try {
    const result = await api(`/platform/validation-attribution?horizon=${horizon}`);
    if (!result.available) throw new Error(result.reason || '暂无因子对照数据');
    document.getElementById('attributionMeta').textContent = `运行 #${result.run_id} · ${result.framework_version} · ${result.period.start} 至 ${result.period.end} · ${result.horizon_days}日窗口。${result.methodology}${result.required_next_run ? ` 下一步：${result.required_next_run}` : ''}`;
    grid.innerHTML = Object.entries(result.groups).map(([key, item]) => `
      <article class="attribution-item ${item.available === false ? 'unavailable' : ''}"><span>模型 ${key}</span><strong>${escapeHtml(item.label)}</strong><small>${item.available === false ? escapeHtml(item.reason) : `${item.signal_days} 个信号日 / ${item.samples} 条样本`}</small>
        <div class="attribution-metric"><span>平均收益</span><b>${formatPercent(item.avg_return_pct)}</b></div>
        <div class="attribution-metric"><span>基准超额</span><b>${formatPercent(item.avg_excess_return_pct)}</b></div>
        <div class="attribution-metric"><span>正超额比例</span><b>${formatRatio(item.positive_excess_rate)}</b></div>
      </article>`).join('');
  } catch (error) {
    grid.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

async function generateValidationReport(periodType) {
  const button = document.getElementById(periodType === 'week' ? 'generateWeeklyReport' : 'generateMonthlyReport');
  button.disabled = true;
  button.textContent = '正在生成...';
  try {
    const report = await api('/platform/validation-reports/generate', {
      method: 'POST', body: JSON.stringify({ period_type: periodType })
    });
    showToast(`${periodType === 'week' ? '周报' : '月报'}已归档，证据等级：${report.evidence_level}。`);
    appState.validationMode = 'reports';
    document.querySelectorAll('.validation-mode').forEach(item => item.classList.toggle('active', item.dataset.validationMode === 'reports'));
    renderValidationMode();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = periodType === 'week' ? '生成周报' : '生成月报';
  }
}

async function loadValidationReports() {
  const target = document.getElementById('validationReportList');
  const optimizationTarget = document.getElementById('optimizationList');
  target.innerHTML = '<div class="loading-state">正在读取归档摘要...</div>';
  optimizationTarget.innerHTML = '<div class="loading-state">正在读取优化台账...</div>';
  try {
    const [result, suggestions] = await Promise.all([
      api('/platform/validation-reports'),
      api('/platform/optimization-suggestions')
    ]);
    target.innerHTML = result.data.length
      ? result.data.map(renderValidationReport).join('')
      : '<div class="empty-state">暂无周月摘要，可使用上方按钮生成。</div>';
    optimizationTarget.innerHTML = suggestions.data.length
      ? suggestions.data.map(renderOptimizationSuggestion).join('')
      : '<div class="empty-state">暂无优化建议。</div>';
    optimizationTarget.querySelectorAll('select[data-suggestion-id]').forEach(select => {
      select.addEventListener('change', () => updateOptimizationStatus(select));
    });
  } catch (error) {
    target.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
    optimizationTarget.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderOptimizationSuggestion(item) {
  const statuses = [
    ['proposed', '待评估'], ['accepted', '已采纳'], ['observing', '观察中'],
    ['completed', '已完成'], ['rejected', '不采纳']
  ];
  return `<article class="optimization-item">
    <div class="optimization-priority ${escapeHtml(item.priority.toLowerCase())}">${escapeHtml(item.priority)}</div>
    <div><h3>${escapeHtml(item.issue)}</h3><p>${escapeHtml(item.evidence || '暂无补充证据')}</p>
      <small>${escapeHtml(item.module)} · ${escapeHtml(item.period_key || '独立建议')} · 复核 ${escapeHtml(item.review_window || '待定')}</small></div>
    <label><span>状态</span><select data-suggestion-id="${item.id}">${statuses.map(([value, label]) =>
      `<option value="${value}"${item.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
  </article>`;
}

async function updateOptimizationStatus(select) {
  select.disabled = true;
  try {
    await api(`/platform/optimization-suggestions/${select.dataset.suggestionId}`, {
      method: 'PATCH', body: JSON.stringify({ status: select.value })
    });
    showToast('优化建议状态已更新。');
  } catch (error) {
    showToast(error.message, true);
    await loadValidationReports();
  } finally {
    select.disabled = false;
  }
}

function renderValidationReport(row) {
  const report = row.payload || {};
  const events = report.independent_events || {};
  const forward = report.forward_validation || {};
  return `<article class="validation-report">
    <div class="report-head"><div><h3>${row.period_type === 'week' ? '周报' : '月报'} · ${escapeHtml(row.period_key)}</h3><p>${escapeHtml(report.period?.start || '--')} 至 ${escapeHtml(report.period?.end || '--')} · ${escapeHtml(row.algorithm_version)}</p></div><span class="evidence-level">${escapeHtml(row.evidence_level)}</span></div>
    <div class="report-facts"><div><span>独立事件</span><strong>${events.total || 0}</strong></div><div><span>前向到期样本</span><strong>${forward.completed || 0}</strong></div><div><span>平均绝对收益</span><strong>${formatPercent(forward.avg_absolute_return)}</strong></div><div><span>平均基准超额</span><strong>${formatPercent(forward.avg_benchmark_excess)}</strong></div></div>
    <div class="report-columns"><div><h4>证据限制</h4><ul>${(report.limitations || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div><div><h4>下一步</h4><ul>${(report.recommendations || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></div>
  </article>`;
}

function renderValidations(tasks, transitions) {
  document.getElementById('validationRows').innerHTML = tasks.slice(0, 120).map(item => `
    <tr data-observation-id="${item.observation_item_id}">
      <td class="name-cell"><strong>${escapeHtml(item.name)}</strong><small>${typeLabel(item.object_type)}${item.code ? ` · ${escapeHtml(item.code)}` : ''}</small></td>
      <td><span class="state-text ${stateClass(item.state)}">${escapeHtml(item.state)}</span></td>
      <td>${item.horizon_days} 日</td><td>${formatDate(item.due_date)}</td><td>${escapeHtml(item.condition_text)}</td><td>${escapeHtml(item.verdict || statusLabel(item.status))}</td>
    </tr>`).join('') || '<tr><td colspan="6">当前没有符合条件的验证任务。</td></tr>';
  document.querySelectorAll('#validationRows tr[data-observation-id]').forEach(row => row.addEventListener('click', () => openObservationDetail(row.dataset.observationId)));
  document.getElementById('transitionTimeline').innerHTML = transitions.slice(0, 14).map(item => `
    <article class="timeline-item ${escapeHtml(item.transition_type)}"><time>${formatDateTime(item.occurred_at)}</time><strong>${escapeHtml(item.name)} · ${escapeHtml(item.from_state || '首次进入')} → ${escapeHtml(item.to_state)}</strong><p>${escapeHtml(item.reason)}</p></article>`).join('') || '<div class="empty-state">暂无状态迁移。</div>';
  const pending = tasks.filter(item => item.status === 'pending').length;
  const completed = tasks.filter(item => item.status === 'completed').length;
  const objects = new Set(tasks.map(item => item.observation_item_id)).size;
  const dueSoon = tasks.filter(item => item.status === 'pending' && daysUntil(item.due_date) <= 3).length;
  document.getElementById('validationMetrics').innerHTML = [
    ['待验证任务', pending, '按到期时间排队'],
    ['覆盖对象', objects, '行业 / ETF / 个股'],
    ['三日内到期', dueSoon, '需要优先复核'],
    ['已完成', completed, '结果包含正反样本']
  ].map(item => `<div class="metric-item"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join('');
}

function refreshCurrentView() {
  if (appState.view === 'today') loadOverview();
  if (appState.view === 'observations') loadObservations();
  if (appState.view === 'validations') loadValidations();
}

function setServiceState(online) {
  document.getElementById('serviceDot').classList.toggle('online', online);
  document.getElementById('serviceText').textContent = online ? '数据服务在线' : '数据服务异常';
}

function showToast(message, error = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function cleanConclusion(value) {
  const text = String(value || '').replace(/^结论：/, '').trim();
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

function stateClass(value) {
  if (value === '重点跟踪') return 'tracking';
  if (value === '条件改善') return 'improving';
  if (value === '降级观察' || value === '逻辑失效') return 'downgraded';
  return 'waiting';
}

function riskClass(value) { return value === '高' ? 'high' : value === '中' ? 'medium' : 'low'; }
function typeLabel(value) { return { industry: '行业', etf: 'ETF', stock: '个股' }[value] || value || '对象'; }
function statusLabel(value) { return { pending: '待验证', completed: '已完成', cancelled: '已取消' }[value] || value || '--'; }
function sourceLabel(value) { return { mystic: '五行来源', financial: '金融来源', risk: '风险规则', as_of: '数据时间', proxy: '代理口径', observation: '观察来源' }[value] || value; }
function formatScore(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '--'; }
function formatPercent(value) { return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%` : '--'; }
function formatRatio(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '--'; }
function clamp(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function formatDate(value) { return value ? String(value).slice(0, 10) : '--'; }
function formatDateTime(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '--'; }
function daysUntil(value) { return value ? Math.ceil((new Date(value) - new Date()) / 86400000) : Infinity; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

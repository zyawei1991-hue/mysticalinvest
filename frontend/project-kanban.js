const STATUS_LABELS = {
  pending: '等待中',
  in_progress: '进行中',
  review: '待复核',
  completed: '已完成',
  failed: '出错了',
  good: '正常',
  watch: '观察'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未知';
}

function statusPill(status) {
  const safeStatus = escapeHtml(status || 'pending');
  return `<span class="status-pill ${safeStatus}">${escapeHtml(statusLabel(status))}</span>`;
}

function renderHealth(items = []) {
  const container = document.getElementById('healthGrid');
  container.innerHTML = items.map(item => `
    <article class="health-card">
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.value)}</p>
      ${statusPill(item.status)}
    </article>
  `).join('');
}

function renderLanes(lanes = []) {
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = lanes.map(lane => `
    <section class="lane">
      <div class="lane-head">
        <h3>${escapeHtml(lane.title)}</h3>
        <span class="lane-count">${(lane.items || []).length}</span>
      </div>
      ${(lane.items || []).map(item => `
        <article class="task-card">
          <div class="task-top">
            <strong>${escapeHtml(item.title)}</strong>
            ${statusPill(item.status)}
          </div>
          <p class="item-detail">${escapeHtml(item.detail)}</p>
          <div class="owner">负责人：${escapeHtml(item.owner || '未指定')}</div>
        </article>
      `).join('')}
    </section>
  `).join('');
}

function renderPhases(phases = []) {
  const list = document.getElementById('phaseList');
  list.innerHTML = phases.map(phase => `
    <article class="phase-card">
      <div class="phase-title">
        <h3>${escapeHtml(phase.name)}</h3>
        ${statusPill(phase.status)}
      </div>
      <div class="phase-steps">
        ${(phase.steps || []).map(step => `
          <div class="phase-step">
            <span class="dot ${escapeHtml(step.status || 'pending')}"></span>
            <span>${escapeHtml(step.name)}</span>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderEvents(events = []) {
  const container = document.getElementById('recentEvents');
  container.innerHTML = events.map(event => `
    <div class="event">
      <div class="event-time">${escapeHtml(event.time)}</div>
      <div>${escapeHtml(event.text)}</div>
    </div>
  `).join('');
}

function renderLinks(links = []) {
  const container = document.getElementById('projectLinks');
  container.innerHTML = links.map(link => `
    <a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>
  `).join('');
}

function renderBoard(data) {
  document.getElementById('projectName').textContent = data.project_name || '五行投资日报项目看板';
  document.getElementById('projectSubtitle').textContent = data.subtitle || '';
  document.getElementById('lastUpdated').textContent = `更新时间 ${data.last_updated || '--'}`;
  document.getElementById('progressValue').textContent = `${Number(data.overall_progress || 0)}%`;
  document.getElementById('progressBar').style.width = `${Math.max(0, Math.min(100, Number(data.overall_progress || 0)))}%`;
  document.getElementById('overallStatus').outerHTML = statusPill(data.overall_status);
  document.getElementById('currentFocus').textContent = data.current_focus || '';

  renderHealth(data.health);
  renderLanes(data.lanes);
  renderPhases(data.phases);
  renderEvents(data.recent_events);
  renderLinks(data.public_links);
}

function renderError(error) {
  document.querySelector('.page-shell').insertAdjacentHTML('beforeend', `
    <div class="error">
      项目看板数据加载失败：${escapeHtml(error.message || error)}
    </div>
  `);
}

async function loadBoard() {
  try {
    const response = await fetch(`project-kanban-data.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderBoard(data);
  } catch (error) {
    renderError(error);
  }
}

loadBoard();

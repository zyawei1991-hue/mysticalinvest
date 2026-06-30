
const API_BASE = '/api';
let currentPage = 1;
const pageSize = 10;

// DOM元素
const btnLatest = document.getElementById('btnLatest');
const btnArchive = document.getElementById('btnArchive');
const todaySection = document.getElementById('todaySection');
const archiveSection = document.getElementById('archiveSection');
const loading = document.getElementById('loading');
const reportContent = document.getElementById('reportContent');
const archiveList = document.getElementById('archiveList');
const pagination = document.getElementById('pagination');
const totalReports = document.getElementById('totalReports');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadLatest();

  btnLatest.addEventListener('click', () => {
    btnLatest.classList.add('active');
    btnArchive.classList.remove('active');
    todaySection.style.display = 'block';
    archiveSection.style.display = 'none';
  });

  btnArchive.addEventListener('click', () => {
    btnArchive.classList.add('active');
    btnLatest.classList.remove('active');
    todaySection.style.display = 'none';
    archiveSection.style.display = 'block';
    loadArchive();
  });
});

// 加载统计信息
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    const data = await res.json();
    if (data.total_reports !== undefined) {
      totalReports.textContent = `共 ${data.total_reports} 期日报`;
    }
  } catch (err) {
    console.error('加载统计失败:', err);
  }
}

// 加载最新日报
async function loadLatest() {
  try {
    loading.style.display = 'block';
    reportContent.style.display = 'none';

    const res = await fetch(`${API_BASE}/latest`);
    if (!res.ok) {
      if (res.status === 404) {
        loading.style.display = 'none';
        reportContent.innerHTML = '<div class="empty-state">暂无日报数据，请先添加日报</div>';
        reportContent.style.display = 'block';
        return;
      }
      throw new Error('加载失败');
    }

    const data = await res.json();
    renderReport(data);
    loading.style.display = 'none';
    reportContent.style.display = 'block';
  } catch (err) {
    console.error(err);
    loading.innerHTML = '加载失败，请刷新重试';
  }
}

// 渲染日报
function renderReport(data) {
  const changeClass = data.hs300_change >= 0 ? 'positive' : 'negative';
  const pnlClass = data.total_profit_loss >= 0 ? 'positive' : 'negative';

  const typeNames = {
    'morning': '早盘日报',
    'noon': '午间日报',
    'evening': '盘后总结'
  };
  const typeName = typeNames[data.report_type] || '日报';

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

  let html = `
    <div class="report-date">
      <h2>${data.report_date} ${typeName}</h2>
    </div>

    <div class="overview">
      <div class="overview-card">
        <div class="label">沪深 300</div>
        <div class="value ${changeClass}">${data.hs300_value ? data.hs300_value.toFixed(2) : '-'} <small>(${data.hs300_change ? data.hs300_change.toFixed(2) : '-'}%)</small></div>
      </div>
      <div class="overview-card">
        <div class="label">上证指数</div>
        <div class="value ${changeClass}">${data.sh_value ? data.sh_value.toFixed(2) : '-'} <small>(${data.sh_change ? data.sh_change.toFixed(2) : '-'}%)</small></div>
      </div>
      <div class="overview-card">
        <div class="label">深证成指</div>
        <div class="value ${changeClass}">${data.sz_value ? data.sz_value.toFixed(2) : '-'} <small>(${data.sz_change ? data.sz_change.toFixed(2) : '-'}%)</small></div>
      </div>
      <div class="overview-card">
        <div class="label">创业板指</div>
        <div class="value ${changeClass}">${data.cy_value ? data.cy_value.toFixed(2) : '-'} <small>(${data.cy_change ? data.cy_change.toFixed(2) : '-'}%)</small></div>
      </div>
    </div>
  `;

  // 涨跌情绪
  const riseCount = data.market_breadth ? data.market_breadth.up : 0;
  const fallCount = data.market_breadth ? data.market_breadth.down : 0;
  const upLimitCount = data.limit_stocks ? data.limit_stocks.up.length : 0;
  const downLimitCount = data.limit_stocks ? data.limit_stocks.down.length : 0;
  html += `
    <div class="market-breadth">
      <span class="breadth-rise">上涨 ${riseCount} 家</span>
      <span class="breadth-sep">|</span>
      <span class="breadth-fall">下跌 ${fallCount} 家</span>
      <span class="breadth-sep">|</span>
      <span class="breadth-up">涨停 ${upLimitCount} 只</span>
      <span class="breadth-sep">|</span>
      <span class="breadth-down">跌停 ${downLimitCount} 只</span>
    </div>
  `;

  // 八字排盘 + 通俗解读
  if (data.bazi) {
    html += `<div class="bazi-section"><h2>☯️ 八字排盘</h2>`;
    html += `<div class="bazi-grid">`;
    html += `<div class="bazi-item"><span class="bazi-label">年柱</span><span class="bazi-value">${data.bazi.year_gan}${data.bazi.year_zhi}</span></div>`;
    html += `<div class="bazi-item"><span class="bazi-label">月柱</span><span class="bazi-value">${data.bazi.month_gan}${data.bazi.month_zhi}</span></div>`;
    html += `<div class="bazi-item"><span class="bazi-label">日柱</span><span class="bazi-value">${data.bazi.day_gan}${data.bazi.day_zhi}</span></div>`;
    html += `<div class="bazi-item"><span class="bazi-label">时柱</span><span class="bazi-value">${data.bazi.hour_gan}${data.bazi.hour_zhi}</span></div>`;
    html += `</div>`;

    // 五行强弱可视化
    const wuxing = data.bazi.wuxing_power || {};
    const wuxingItems = [
      { name: '木', val: wuxing.wood || 0 },
      { name: '火', val: wuxing.fire || 0 },
      { name: '土', val: wuxing.earth || 0 },
      { name: '金', val: wuxing.gold || 0 },
      { name: '水', val: wuxing.water || 0 }
    ];
    html += `<div class="wuxing-bars">`;
    wuxingItems.forEach(function(item) {
      const pct = Math.round(item.val * 100);
      const barClass = item.name === '木' ? 'wood' : item.name === '火' ? 'fire' : item.name === '土' ? 'earth' : item.name === '金' ? 'gold' : 'water';
      html += `<div class="wuxing-bar-item">
        <span class="wuxing-bar-name ${barClass}">${item.name}</span>
        <div class="wuxing-bar-track"><div class="wuxing-bar-fill ${barClass}" style="width:${pct}%"></div></div>
        <span class="wuxing-bar-pct">${pct}%</span>
      </div>`;
    });
    html += `</div>`;
    html += `</div>`;
  }

  // 八字通俗解读（新增！）
  if (data.bazi_interpretation) {
    html += `<div class="interpretation-section"><h2>📖 八字解读</h2>`;
    const lines = data.bazi_interpretation.split('\n');
    lines.forEach(function(line) {
      if (line.trim() === '') {
        html += `<br>`;
      } else if (line.startsWith('【') && line.endsWith('】')) {
        html += `<h3 class="interp-heading">${colorFive(line)}</h3>`;
      } else {
        html += `<p class="interp-text">${colorFive(line)}</p>`;
      }
    });
    html += `</div>`;
  }

  // 行业五行运势（新版！）
  if (data.industries && data.industries.length > 0) {
    html += `<div class="industries-section"><h2>🏭 行业五行运势</h2>`;
    html += `<div class="industry-list">`;
    data.industries.forEach(function(ind) {
      const ratingStars = '★'.repeat(ind.rating || 3) + '☆'.repeat(5 - (ind.rating || 3));
      const sourceTag = ind.source === 'market' ? '<span class="source-tag market">市场</span>' : ind.source === 'weak' ? '<span class="source-tag weak">弱势</span>' : '<span class="source-tag five">五行</span>';
      html += `<div class="industry-card">
        <div class="industry-header">
          <span class="industry-name element-${ind.element || 'earth'}">${ind.name}</span>
          <span class="industry-rating">${ratingStars}</span>
          ${sourceTag}
        </div>
        <div class="industry-reason">${ind.reason || ''}</div>
        ${ind.stocks && ind.stocks.length > 0 ? '<div class="industry-stocks">' + ind.stocks.map(function(s) {
          return `<span class="mini-stock">${s.name}(${s.code})</span>`;
        }).join(' ') + '</div>' : ''}
      </div>`;
    });
    html += `</div></div>`;
  }

  // 标的四维分析（新增！）
  if (data.stocks && data.stocks.length > 0) {
    html += `<div class="stocks-analysis-section"><h2>📊 标的四维分析</h2><div class="stock-list">`;
    data.stocks.forEach(function(stock) {
      const alertClass = stock.alert_level === 'red' ? 'alert-red' :
                        stock.alert_level === 'yellow' ? 'alert-yellow' :
                        stock.alert_level === 'green' ? 'alert-green' : '';
      html += `<div class="stock-card ${alertClass}">
        <div class="stock-header">
          <span class="stock-name">${stock.name} <span class="stock-code">${stock.code || ''}</span></span>
          <span class="stock-suggestion suggestion-${(stock.suggestion || '').replace(/\s/g, '')}">${stock.suggestion || '观察'}</span>
        </div>
        ${stock.reason ? `<div class="stock-reason-tag">${colorFive(stock.reason)}</div>` : ''}`;

      // 四维分析（如果有）
      if (stock.analysis) {
        const a = stock.analysis;
        html += `<div class="four-dimensions">`;
        if (a.news) html += `<div class="dim-item"><span class="dim-label news">消息面</span><span class="dim-text">${a.news}</span></div>`;
        if (a.fundamental) html += `<div class="dim-item"><span class="dim-label fundamental">基本面</span><span class="dim-text">${a.fundamental}</span></div>`;
        if (a.technical) html += `<div class="dim-item"><span class="dim-label technical">技术面</span><span class="dim-text">${a.technical}</span></div>`;
        if (a.mystic) html += `<div class="dim-item"><span class="dim-label mystic">玄学面</span><span class="dim-text">${a.mystic}</span></div>`;
        html += `</div>`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  // 五行综合分析（原 five_elements）
  const hasFiveElements = data.five_elements || data.prediction || data.joke;
  if (hasFiveElements) {
    html += `<div class="analysis-section"><h2>🔮 五行综合分析</h2>`;

    if (data.five_elements) {
      const lines = data.five_elements.split('\n');
      lines.forEach(function(line) {
        if (line.trim() === '') {
          html += `<br>`;
        } else {
          html += `<div class="five-line">${colorFive(line)}</div>`;
        }
      });
    }

    if (data.prediction) {
      html += `<div class="prediction"><h3>📈 明日展望</h3><div>${colorFive(data.prediction)}</div></div>`;
    }

    if (data.joke) {
      html += `<div class="joke"><h3>😂 段子彩蛋</h3><div>${data.joke}</div></div>`;
    }

    html += `</div>`;
  }

  // 风险提示
  if (data.risk_warning) {
    html += `<div class="risk-section"><h2>⚠️ 风险提示</h2><div>${colorFive(data.risk_warning)}</div></div>`;
  }

  reportContent.innerHTML = html;
}

// 加载历史归档
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
            · 持仓: ${report.holding_count || 0} 只
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
    loading.innerHTML = '加载失败';
  }
}

// 格式化金额
function formatMoney(num) {
  if (num > 0) return '+' + num.toLocaleString('zh-CN');
  return num.toLocaleString('zh-CN');
}

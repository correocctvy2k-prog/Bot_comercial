const state = {
  data: null,
  layout: JSON.parse(localStorage.getItem('skylab.nodeMonitor.layout.v1') || '[]'),
  history: {}, // targetId -> Array of { cpu, ram, time }
  activeTabs: {}, // targetId -> activeTab ('metrics', 'disk', 'services')
  diskSort: JSON.parse(localStorage.getItem('skylab.nodeMonitor.diskSort.v1') || '{}')
};

const els = {
  grid: document.querySelector('#targetGrid'),
  criticalHero: document.querySelector('#criticalAlertHero'),
  smartAlerts: document.querySelector('#smartAlertsPanel'),
  refresh: document.querySelector('#refreshBtn'),
  newTarget: document.querySelector('#newTargetBtn'),
  analysis: document.querySelector('#analysisBtn'),
  modal: document.querySelector('#targetModal'),
  analysisModal: document.querySelector('#analysisModal'),
  analysisContent: document.querySelector('#analysisContent'),
  closeAnalysis: document.querySelector('#closeAnalysisBtn'),
  form: document.querySelector('#targetForm'),
  closeModal: document.querySelector('#closeModalBtn'),
  cancel: document.querySelector('#cancelBtn'),
  delete: document.querySelector('#deleteBtn'),
  modalTitle: document.querySelector('#modalTitle'),
  fields: {
    id: document.querySelector('#targetId'),
    name: document.querySelector('#name'),
    host: document.querySelector('#host'),
    port: document.querySelector('#port'),
    type: document.querySelector('#type'),
    username: document.querySelector('#username'),
    password: document.querySelector('#password'),
    tags: document.querySelector('#tags'),
    enabled: document.querySelector('#enabled')
  }
};

function saveLayout() {
  localStorage.setItem('skylab.nodeMonitor.layout.v1', JSON.stringify(state.layout));
}

function saveDiskSort() {
  localStorage.setItem('skylab.nodeMonitor.diskSort.v1', JSON.stringify(state.diskSort));
}

function orderedTargets(targets) {
  const known = new Set(state.layout);
  const newIds = targets.map(target => target.id).filter(id => !known.has(id));
  if (newIds.length) {
    state.layout.push(...newIds);
    saveLayout();
  }
  const byId = new Map(targets.map(target => [target.id, target]));
  return state.layout.map(id => byId.get(id)).filter(Boolean);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return `${Number(value).toFixed(1)}%`;
}

function barClass(value) {
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warn';
  return 'good';
}

function svgGaugeMetric(label, percent) {
  const numeric = Number(percent);
  const isAvailable = percent !== null && percent !== undefined && !Number.isNaN(numeric);
  const val = isAvailable ? Math.round(numeric) : 0;
  const displayVal = isAvailable ? `${val}%` : 'N/A';
  const tone = barClass(val);
  
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (val / 100) * circumference;

  return `
    <div class="gauge-card">
      <div class="gauge-svg-container ${tone}">
        <svg class="gauge-ring" width="56" height="56" viewBox="0 0 56 56">
          <circle class="gauge-ring-bg" cx="28" cy="28" r="${radius}" />
          <circle class="gauge-ring-val" cx="28" cy="28" r="${radius}" 
            stroke-dasharray="${circumference}" 
            stroke-dashoffset="${isAvailable ? strokeDashoffset : circumference}" 
            transform="rotate(-90 28 28)" />
        </svg>
        <div class="gauge-inner-text">
          <strong>${displayVal}</strong>
        </div>
      </div>
      <span class="gauge-label">${label}</span>
    </div>
  `;
}

function infoMetric(label, value) {
  return `
    <div class="info-metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function formatUptimeDays(raw) {
  if (!raw) return 'N/A';
  const text = String(raw);
  const dayMatch = text.match(/up\s+(\d+)\s+days?/i) || text.match(/(\d+)\s+days?/i);
  if (dayMatch) return `${Number(dayMatch[1])} días`;

  const hourMatch = text.match(/up\s+(\d+):(\d+)/i);
  if (hourMatch) return '0 días';

  const minMatch = text.match(/up\s+(\d+)\s+min/i);
  if (minMatch) return '0 días';

  return text.length > 18 ? text.slice(0, 18) : text;
}

function formatContainerUptime(statusText = '') {
  const text = String(statusText);
  const dayMatch = text.match(/Up\s+(\d+)\s+days?/i);
  if (dayMatch) return `${Number(dayMatch[1])} días`;
  if (/Up\s+About an hour/i.test(text) || /Up\s+\d+\s+hours?/i.test(text)) return '0 días';
  if (/Up\s+\d+\s+minutes?/i.test(text) || /Up\s+Less than/i.test(text)) return '0 días';
  return text || 'N/A';
}

function statusLabel(status) {
  return {
    online: 'En línea',
    degraded: 'Degradado',
    offline: 'Fuera',
    paused: 'Pausado'
  }[status] || 'Sin datos';
}

function renderFilesystems(targetId, filesystems = [], fallbackDisk = null) {
  const rows = filesystems.length
    ? filesystems
    : fallbackDisk
      ? [{ ...fallbackDisk, name: fallbackDisk.mount || '/' }]
      : [];
  const sortDirection = state.diskSort[targetId] || 'desc';
  const sortedRows = [...rows].sort((a, b) => {
    const left = Number(a.usedPercent || 0);
    const right = Number(b.usedPercent || 0);
    return sortDirection === 'asc' ? left - right : right - left;
  });

  if (!rows.length) return '<p class="muted pad-10">Sin datos de particiones.</p>';

  return `
    <div class="disk-sort-control">
      <button class="sort-chip ${sortDirection === 'desc' ? 'active' : ''}" data-action="sort-disk" data-sort="desc" data-id="${targetId}">Mayor uso</button>
      <button class="sort-chip ${sortDirection === 'asc' ? 'active' : ''}" data-action="sort-disk" data-sort="asc" data-id="${targetId}">Menor uso</button>
    </div>
    <div class="filesystem-list">
      ${sortedRows.map(item => {
        const percent = Number(item.usedPercent || 0);
        const tone = barClass(percent);
        return `
          <div class="filesystem-row" title="${item.filesystem || item.name}">
            <div class="filesystem-info">
              <span class="filesystem-name">${item.name || item.mount || item.filesystem}</span>
              <span class="filesystem-space">${item.used || 'N/A'} / ${item.size || 'N/A'} (Libre: ${item.available || 'N/A'})</span>
            </div>
            <div class="bar filesystem-bar">
              <div class="bar-fill ${tone}" style="width: ${Math.max(0, Math.min(100, percent))}%">
                <span class="bar-text">${formatPercent(percent)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTopPartition(filesystems = [], fallbackDisk = null) {
  const rows = filesystems.length
    ? filesystems
    : fallbackDisk
      ? [{ ...fallbackDisk, name: fallbackDisk.mount || '/' }]
      : [];

  if (!rows.length) return '';

  const top = [...rows].sort((a, b) => Number(b.usedPercent || 0) - Number(a.usedPercent || 0))[0];
  const percent = Number(top.usedPercent || 0);
  const tone = barClass(percent);
  const name = top.name || top.mount || top.filesystem || 'Partición';

  return `
    <div class="top-partition-card ${tone}">
      <div class="top-partition-head">
        <span>Partición más ocupada</span>
        <strong>${formatPercent(percent)}</strong>
      </div>
      <div class="top-partition-name" title="${top.filesystem || name}">${name}</div>
      <div class="top-partition-bar">
        <div class="${tone}" style="width:${Math.max(0, Math.min(100, percent))}%"></div>
      </div>
      <div class="top-partition-meta">
        <span>${top.used || 'N/A'} usado</span>
        <span>${top.size || 'N/A'} total</span>
        <span>${top.available || 'N/A'} libre</span>
      </div>
    </div>
  `;
}

function renderDockerSummary(docker) {
  if (!docker || !docker.available) return '';
  const summary = docker.summary || {};
  return `
    <div class="docker-summary">
      <span class="docker-summary-pill running">${summary.running || 0} activos</span>
      ${summary.restarting > 0 ? `<span class="docker-summary-pill restarting">${summary.restarting} reiniciando</span>` : ''}
      ${summary.exited > 0 ? `<span class="docker-summary-pill exited">${summary.exited} detenidos</span>` : ''}
    </div>
  `;
}

function renderDockerContainers(containers = []) {
  if (!containers.length) return '';
  
  return `
    <div class="docker-container-list">
      ${containers.map(container => {
        const cpu = Number(container.cpuPercent || 0);
        const ram = Number(container.memoryPercent || 0);
        const isHot = cpu >= 70 || ram >= 70;
        const status = container.status || '';
        const statusClass = status === 'running' ? 'running' : status === 'restarting' ? 'restarting' : 'exited';
        
        return `
          <div class="docker-container-row ${isHot ? 'hot' : ''}">
            <div class="container-info-header">
              <div class="container-main-name">
                <span class="container-state-dot ${statusClass}"></span>
                <span class="container-name" title="${container.name} (${container.image})">${container.name}</span>
              </div>
              <span class="container-uptime">${formatContainerUptime(container.statusText)}</span>
            </div>
            <div class="container-metrics-row">
              <span class="container-metric-item">CPU: <strong class="${cpu >= 70 ? 'danger-text' : ''}">${formatPercent(cpu)}</strong></span>
              <span class="container-metric-item">RAM: <strong class="${ram >= 70 ? 'danger-text' : ''}">${formatPercent(ram)}</strong></span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSharePlex(shareplex) {
  if (!shareplex?.detected) return '';
  const status = shareplex.running ? 'Activo' : 'No activo';
  const statusClass = shareplex.running ? 'running' : 'exited';

  return `
    <div class="shareplex-section">
      <div class="section-title-accent">SharePlex</div>
      <div class="service-row">
        <div class="container-main">
          <span class="container-state-dot ${statusClass}"></span>
          <span class="container-name">sp_cop / shareplex</span>
        </div>
        <div class="service-status-info">
          <strong>${status}</strong>
          <span class="muted">${shareplex.processCount || 0} procesos</span>
        </div>
      </div>
    </div>
  `;
}

function renderNoMetrics(result) {
  if (result?.status !== 'degraded' || result?.metrics) return '';
  const message = result.sshError || 'No fue posible leer métricas por SSH';
  return `
    <div class="diagnostic-box">
      <div class="diagnostic-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div class="diagnostic-text">
        <strong>Sin métricas SSH</strong>
        <span>${message}</span>
      </div>
    </div>
  `;
}

function generateSparklineSVG(targetId) {
  const history = state.history[targetId] || [];
  if (history.length < 2) {
    return `
      <div class="sparkline-placeholder">
        <span>Cargando gráfico de tendencias...</span>
      </div>
    `;
  }

  const width = 300;
  const height = 50;
  const padding = 2;

  const pointsCount = history.length;
  const stepX = (width - padding * 2) / (Math.max(pointsCount, 2) - 1);

  const cpuPoints = [];
  const ramPoints = [];

  history.forEach((data, index) => {
    const x = padding + index * stepX;
    const cpuY = height - padding - (data.cpu / 100) * (height - padding * 2);
    const ramY = height - padding - (data.ram / 100) * (height - padding * 2);
    cpuPoints.push({ x, y: cpuY });
    ramPoints.push({ x, y: ramY });
  });

  function bezierPath(points) {
    if (points.length === 0) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + stepX / 3;
      const cpY1 = p0.y;
      const cpX2 = p1.x - stepX / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  }

  function areaPath(linePath, points) {
    if (!linePath) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;
  }

  const cpuLine = bezierPath(cpuPoints);
  const ramLine = bezierPath(ramPoints);
  const cpuArea = areaPath(cpuLine, cpuPoints);
  const ramArea = areaPath(ramLine, ramPoints);

  const lastVal = history[history.length - 1];

  return `
    <div class="sparkline-section">
      <div class="sparkline-legend">
        <span class="legend-item cpu">
          <span class="legend-color-dot"></span>
          CPU: <strong>${Math.round(lastVal.cpu)}%</strong>
        </span>
        <span class="legend-item ram">
          <span class="legend-color-dot"></span>
          RAM: <strong>${Math.round(lastVal.ram)}%</strong>
        </span>
      </div>
      <div class="sparkline-chart-wrapper">
        <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cpuGrad-${targetId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#4ade80" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#4ade80" stop-opacity="0.00"/>
            </linearGradient>
            <linearGradient id="ramGrad-${targetId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.00"/>
            </linearGradient>
          </defs>
          <line class="chart-grid-line" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" />
          
          <path class="spark-area cpu" d="${cpuArea}" fill="url(#cpuGrad-${targetId})" />
          <path class="spark-area ram" d="${ramArea}" fill="url(#ramGrad-${targetId})" />
          
          <path class="spark-line cpu" d="${cpuLine}" />
          <path class="spark-line ram" d="${ramLine}" />
        </svg>
      </div>
    </div>
  `;
}

function renderCard(target) {
  const result = target.result;
  const metrics = result?.metrics;
  const status = result?.status || (target.enabled ? 'unknown' : 'paused');
  const tcp = result?.tcp;
  const memoryPercent = metrics?.memory?.usedPercent;
  const swapPercent = metrics?.memory?.swap?.usedPercent;
  const diskPercent = metrics?.disk?.usedPercent;
  const cpuPercent = metrics?.cpu?.usagePercent;

  const activeTab = state.activeTabs[target.id] || 'metrics';

  const hasDocker = metrics?.docker?.available && metrics?.docker?.containers?.length > 0;
  const hasShareplex = metrics?.shareplex?.detected;

  const filesystems = metrics?.filesystems || [];
  const highUsageFilesystems = filesystems.filter(fsItem => {
    const pct = Number(fsItem.usedPercent || 0);
    return pct >= 79;
  });
  const hasFsWarning = highUsageFilesystems.length > 0;

  const backendAlerts = result?.alerts || [];
  let alertsHtml = '';
  if (backendAlerts.length > 0 || hasFsWarning) {
    alertsHtml = `
      <div class="card-alerts-container">
        ${backendAlerts.map(alert => {
          const isDanger = alert.severity === 'critical' || alert.severity === 'high';
          return `
            <div class="smart-alert-banner ${isDanger ? 'danger' : 'warn'}">
              <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>${alert.message}</span>
            </div>
          `;
        }).join('')}
        ${highUsageFilesystems.map(fs => `
          <div class="smart-alert-banner warn">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>Partición <strong>${fs.name}</strong> al <strong>${Math.round(fs.usedPercent)}%</strong></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  const tagsHtml = (target.tags || []).map(tag => `<span class="tag-pill">${tag}</span>`).join('');

  return `
    <article class="card" data-id="${target.id}">
      <header class="card-header">
        <div class="card-title-block">
          <div class="card-name-row">
            <h3>${target.name}</h3>
          </div>
          <div class="card-tags">${tagsHtml}</div>
        </div>
        <div class="card-header-actions">
          <span class="status-pill ${status}">
            <span class="dot"></span>
            ${statusLabel(status)}
          </span>
          <div class="card-action-buttons">
            <button class="mini-icon-button" data-action="up" data-id="${target.id}" title="Mover arriba">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <button class="mini-icon-button" data-action="down" data-id="${target.id}" title="Mover abajo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <button class="mini-icon-button" data-action="edit" data-id="${target.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>
      </header>

      <nav class="card-tabs">
        <button class="tab-btn ${activeTab === 'metrics' ? 'active' : ''}" data-tab="metrics" data-id="${target.id}">Métricas</button>
        <button class="tab-btn ${activeTab === 'disk' ? 'active' : ''}" data-tab="disk" data-id="${target.id}">
          Particiones ${hasFsWarning ? '<span class="warn-indicator"></span>' : ''}
        </button>
        <button class="tab-btn ${activeTab === 'services' ? 'active' : ''}" data-tab="services" data-id="${target.id}">
          Servicios ${(hasDocker || hasShareplex) ? '<span class="svc-indicator"></span>' : ''}
        </button>
      </nav>

      <div class="card-content">
        <!-- TAB METRICS -->
        <div class="tab-panel ${activeTab === 'metrics' ? 'active' : ''}">
          <div class="health-strip">
            ${svgGaugeMetric('CPU', cpuPercent)}
            ${svgGaugeMetric('RAM', memoryPercent)}
            ${svgGaugeMetric('Swap', swapPercent)}
            ${svgGaugeMetric('Disco /', diskPercent)}
          </div>

          ${alertsHtml}

          ${renderTopPartition(metrics?.filesystems || [], metrics?.disk || null)}

          ${target.enabled && status !== 'paused' && status !== 'offline' ? generateSparklineSVG(target.id) : ''}

          <div class="info-strip">
            ${infoMetric('Latencia', tcp ? `${tcp.latencyMs} ms` : 'N/A')}
            ${infoMetric('Uptime', formatUptimeDays(metrics?.uptime))}
            ${infoMetric('Load Avg', metrics?.cpu ? `${metrics.cpu.load1} / ${metrics.cpu.load5}` : 'N/A')}
            ${infoMetric('Cores', metrics?.cpu?.cores || 'N/A')}
          </div>

          ${renderNoMetrics(result)}
        </div>

        <!-- TAB DISK -->
        <div class="tab-panel ${activeTab === 'disk' ? 'active' : ''}">
          ${renderFilesystems(target.id, metrics?.filesystems || [], metrics?.disk || null)}
        </div>

        <!-- TAB SERVICES -->
        <div class="tab-panel ${activeTab === 'services' ? 'active' : ''}">
          ${hasDocker ? '<div class="section-title-accent">Contenedores Docker</div>' : ''}
          ${renderDockerSummary(metrics?.docker)}
          ${renderDockerContainers(metrics?.docker?.containers || [])}
          ${renderSharePlex(metrics?.shareplex)}
          ${!hasDocker && !hasShareplex ? '<p class="muted pad-10">No se detectaron servicios (Docker o SharePlex) en este servidor.</p>' : ''}
        </div>
      </div>
    </article>
  `;
}

function analysisMetric(label, value) {
  return `
    <article class="analysis-metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function analysisRows(rows, columns, emptyText) {
  if (!rows.length) return `<p class="muted pad-10">${emptyText}</p>`;
  return `
    <div class="analysis-table">
      ${rows.map(row => `
        <div class="analysis-row" style="--cols:${columns.length}">
          ${columns.map(column => `<span>${column(row)}</span>`).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function alertTone(severity) {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warn';
  return 'info';
}

function renderAnalysis(data) {
  const summary = data.summary || {};
  els.analysisContent.innerHTML = `
    <section class="analysis-summary">
      ${analysisMetric('Servidores', summary.total || 0)}
      ${analysisMetric('En línea', summary.online || 0)}
      ${analysisMetric('Degradados', summary.degraded || 0)}
      ${analysisMetric('SharePlex', summary.shareplex || 0)}
    </section>

    <div class="analysis-sections-grid">
      <section class="analysis-section wide">
        <h3>Alertas inteligentes</h3>
        ${analysisRows(data.smartAlerts || [], [
          row => `${row.targetName} · ${row.title}`,
          row => row.severity,
          row => row.recommendation
        ], 'No hay alertas inteligentes activas.')}
      </section>

      <section class="analysis-section">
        <h3>Servidores con mayor RAM</h3>
        ${analysisRows(data.resources?.highestRam || [], [
          row => row.name,
          row => formatPercent(row.ramPercent),
          row => `<span class="analysis-status-dot ${row.status}"></span> ${statusLabel(row.status)}`
        ], 'Sin datos de RAM.')}
      </section>

      <section class="analysis-section">
        <h3>Servidores con mayor CPU</h3>
        ${analysisRows(data.resources?.highestCpu || [], [
          row => row.name,
          row => formatPercent(row.cpuPercent),
          row => `<span class="analysis-status-dot ${row.status}"></span> ${statusLabel(row.status)}`
        ], 'Sin datos de CPU.')}
      </section>

      <section class="analysis-section wide">
        <h3>Particiones con mayor uso</h3>
        ${analysisRows(data.partitions?.highestUsage || [], [
          row => `${row.serverName} · ${row.name}`,
          row => `${row.used || 'N/A'} / ${row.size || 'N/A'}`,
          row => `<strong>${formatPercent(row.usedPercent)}</strong>`
        ], 'Sin particiones detectadas.')}
      </section>

      <section class="analysis-section">
        <h3>Contenedores Docker sobre 70%</h3>
        ${analysisRows((data.containers?.all || []).filter(row => Number(row.cpuPercent || 0) >= 70 || Number(row.memoryPercent || 0) >= 70), [
          row => `${row.serverName} · ${row.name}`,
          row => row.status || 'n/a',
          row => `CPU ${formatPercent(row.cpuPercent)} · RAM ${formatPercent(row.memoryPercent)}`
        ], 'No hay contenedores Docker sobre 70%.')}
      </section>

      <section class="analysis-section">
        <h3>SharePlex detectado</h3>
        ${analysisRows(data.shareplex || [], [
          row => row.serverName,
          row => row.running ? '<span class="status-indicator active">Activo</span>' : '<span class="status-indicator inactive">Inactivo</span>',
          row => `${row.processCount || 0} procesos`
        ], 'No se detectó SharePlex en los servidores.')}
      </section>

      <section class="analysis-section wide">
        <h3>Servidores degradados o con alertas</h3>
        ${analysisRows(data.degraded || [], [
          row => row.name,
          row => `<span class="danger-text">${row.reason}</span>`
        ], 'No hay servidores degradados.')}
      </section>
    </div>
  `;
}

function renderTopbarSummary() {
  const targets = state.data?.targets || [];
  const total = targets.length;
  const online = targets.filter(t => t.result?.status === 'online').length;
  const degraded = targets.filter(t => t.result?.status === 'degraded').length;
  const offline = targets.filter(t => t.result?.status === 'offline').length;

  const container = document.querySelector('#statusSummary');
  if (!container) return;

  container.innerHTML = `
    <span class="summary-badge total"><strong>${total}</strong> Servidor${total !== 1 ? 'es' : ''}</span>
    <span class="summary-badge online"><strong>${online}</strong> En línea</span>
    ${degraded > 0 ? `<span class="summary-badge degraded"><strong>${degraded}</strong> Degradado${degraded !== 1 ? 's' : ''}</span>` : ''}
    ${offline > 0 ? `<span class="summary-badge offline"><strong>${offline}</strong> Desconectado${offline !== 1 ? 's' : ''}</span>` : ''}
  `;
}

function renderSmartAlerts() {
  const alerts = state.data?.smartAlerts || [];
  if (!els.smartAlerts) return;

  if (!alerts.length) {
    els.smartAlerts.innerHTML = '';
    els.smartAlerts.classList.remove('visible');
    return;
  }

  els.smartAlerts.classList.add('visible');
  els.smartAlerts.innerHTML = `
    <div class="smart-alerts-header">
      <span>Alertas inteligentes</span>
      <strong>${alerts.length}</strong>
    </div>
    <div class="smart-alerts-list">
      ${alerts.slice(0, 4).map(alert => `
        <article class="smart-alert-card ${alertTone(alert.severity)}">
          <div>
            <strong>${alert.targetName} · ${alert.title}</strong>
            <span>${alert.message}</span>
          </div>
          <p>${alert.recommendation}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderCriticalHero() {
  if (!els.criticalHero) return;
  const criticalAlerts = (state.data?.smartAlerts || []).filter(alert => alert.severity === 'critical');

  if (!criticalAlerts.length) {
    els.criticalHero.innerHTML = '';
    els.criticalHero.classList.remove('visible');
    return;
  }

  const main = criticalAlerts[0];
  els.criticalHero.classList.add('visible');
  els.criticalHero.innerHTML = `
    <div class="critical-pulse-dot"></div>
    <div class="critical-hero-copy">
      <span>CRÍTICO</span>
      <strong>${main.targetName} · ${main.title}</strong>
      <p>${main.message}</p>
    </div>
    <div class="critical-hero-count">${criticalAlerts.length}</div>
  `;
}

function render() {
  const targets = orderedTargets(state.data?.targets || []);
  els.grid.innerHTML = targets.length
    ? targets.map(renderCard).join('')
    : '<div class="empty">Agrega tu primer servidor para empezar a monitorear.</div>';
    
  renderTopbarSummary();
  renderCriticalHero();
  renderSmartAlerts();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Error de API');
  return body;
}

function updateMetricHistory() {
  if (!state.data?.targets) return;
  
  for (const target of state.data.targets) {
    if (target.enabled && target.result?.status && target.result.status !== 'paused' && target.result.status !== 'offline') {
      if (!state.history[target.id]) {
        state.history[target.id] = [];
      }
      
      const metrics = target.result.metrics;
      const cpu = metrics?.cpu?.usagePercent ?? 0;
      const ram = metrics?.memory?.usedPercent ?? 0;
      
      state.history[target.id].push({ cpu, ram, time: Date.now() });
      
      // Limit to last 20 sweep cycles
      if (state.history[target.id].length > 20) {
        state.history[target.id].shift();
      }
    } else {
      // If disabled/offline, we clean history to avoid stale graphics later
      delete state.history[target.id];
    }
  }
}

async function loadState() {
  state.data = await api('/api/state');
  updateMetricHistory();
  render();
}

function targetById(id) {
  return state.data?.targets?.find(target => target.id === id);
}

function openModal(target = null) {
  els.form.reset();
  els.fields.enabled.checked = true;
  els.fields.port.value = 22;
  els.fields.type.value = 'linux';
  els.delete.style.display = target ? 'inline-block' : 'none';
  els.modalTitle.textContent = target ? 'Editar servidor' : 'Agregar servidor';

  if (target) {
    els.fields.id.value = target.id;
    els.fields.name.value = target.name;
    els.fields.host.value = target.host;
    els.fields.port.value = target.port;
    els.fields.type.value = target.type;
    els.fields.username.value = target.username || '';
    els.fields.password.value = '';
    els.fields.tags.value = (target.tags || []).join(', ');
    els.fields.enabled.checked = target.enabled;
  } else {
    els.fields.id.value = '';
  }

  els.modal.showModal();
}

function closeModal() {
  els.modal.close();
}

function formPayload() {
  return {
    name: els.fields.name.value.trim(),
    host: els.fields.host.value.trim(),
    port: Number(els.fields.port.value),
    type: els.fields.type.value,
    username: els.fields.username.value.trim(),
    password: els.fields.password.value,
    tags: els.fields.tags.value,
    enabled: els.fields.enabled.checked
  };
}

function moveTarget(id, direction) {
  const index = state.layout.indexOf(id);
  if (index === -1) return;
  const next = direction === 'up' ? index - 1 : index + 1;
  if (next < 0 || next >= state.layout.length) return;
  const [item] = state.layout.splice(index, 1);
  state.layout.splice(next, 0, item);
  saveLayout();
  render();
}

els.newTarget.addEventListener('click', () => openModal());
els.closeModal.addEventListener('click', closeModal);
els.cancel.addEventListener('click', closeModal);
els.closeAnalysis.addEventListener('click', () => els.analysisModal.close());
els.analysis.addEventListener('click', async () => {
  els.analysisContent.innerHTML = '<p class="muted pad-10">Calculando análisis...</p>';
  els.analysisModal.showModal();
  const data = await api('/api/analysis');
  renderAnalysis(data);
});

els.refresh.addEventListener('click', async () => {
  els.refresh.classList.add('refreshing');
  try {
    await api('/api/sweep', { method: 'POST' });
    setTimeout(async () => {
      await loadState();
      els.refresh.classList.remove('refreshing');
    }, 1000);
  } catch (error) {
    console.error(error);
    els.refresh.classList.remove('refreshing');
  }
});

els.form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = els.fields.id.value;
  const payload = formPayload();
  if (id && !payload.password) delete payload.password;
  if (id) {
    await api(`/api/targets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await api('/api/targets', { method: 'POST', body: JSON.stringify(payload) });
  }
  closeModal();
  await loadState();
});

els.delete.addEventListener('click', async () => {
  const id = els.fields.id.value;
  if (!id) return;
  await api(`/api/targets/${id}`, { method: 'DELETE' });
  state.layout = state.layout.filter(item => item !== id);
  saveLayout();
  closeModal();
  await loadState();
});

els.grid.addEventListener('click', event => {
  const tabBtn = event.target.closest('.tab-btn');
  if (tabBtn) {
    const id = tabBtn.dataset.id;
    const tab = tabBtn.dataset.tab;
    state.activeTabs[id] = tab;
    render();
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === 'sort-disk') {
    state.diskSort[id] = button.dataset.sort || 'desc';
    saveDiskSort();
    render();
    return;
  }
  if (action === 'edit') openModal(targetById(id));
  if (action === 'up') moveTarget(id, 'up');
  if (action === 'down') moveTarget(id, 'down');
});

loadState().catch(error => {
  els.grid.innerHTML = `<div class="empty">${error.message}</div>`;
});

// Auto poll every 10 seconds (aligned with backend sweep POLL_INTERVAL_MS)
setInterval(() => {
  loadState().catch(error => {
    console.error('Error al actualizar:', error);
  });
}, 10000);

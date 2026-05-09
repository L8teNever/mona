/* MONA – frontend runtime */

Chart.defaults.font.family = "'Google Sans', sans-serif";
Chart.defaults.color = '#625b71';

// ── Intro ─────────────────────────────────────────────────────────────────────

let _introSkipped = false;

function skipIntro() {
    if (_introSkipped) return;
    _introSkipped = true;
    const overlay = document.getElementById('intro-overlay');
    const app     = document.getElementById('main-app');
    if (overlay) overlay.style.opacity = '0';
    if (app) app.classList.add('ready');
    document.querySelectorAll('.m3-widget').forEach(w => w.classList.add('pop'));
    setTimeout(() => overlay && overlay.remove(), 800);
}

async function runIntro(welcomeText) {
    const overlay       = document.getElementById('intro-overlay');
    const textContainer = document.getElementById('intro-text');
    const app           = document.getElementById('main-app');
    if (!overlay || !textContainer) return;

    const words    = welcomeText.split(' ');
    const allChars = [];

    words.forEach((word, wi) => {
        const ws = document.createElement('span');
        ws.className = 'word-wrap';
        [...word].forEach(ch => {
            const cs = document.createElement('span');
            cs.textContent = ch;
            cs.className = 'flying-char';
            ws.appendChild(cs);
            allChars.push(cs);
        });
        textContainer.appendChild(ws);
        if (wi < words.length - 1) {
            const sp = document.createElement('span');
            sp.textContent = ' ';
            sp.className = 'flying-char';
            textContainer.appendChild(sp);
            allChars.push(sp);
        }
    });

    allChars.forEach((c, i) => {
        setTimeout(() => {
            if (_introSkipped) return;
            c.style.opacity = '1';
            c.style.transform = 'scale(1) translateY(0)';
        }, i * 35);
    });

    await new Promise(r => setTimeout(r, allChars.length * 35 + 600));
    if (_introSkipped) return;

    if (app) app.classList.add('ready');
    overlay.style.opacity = '0';

    document.querySelectorAll('.m3-widget').forEach((w, i) => {
        setTimeout(() => { if (!_introSkipped) w.classList.add('pop'); }, 80 * i);
    });

    setTimeout(() => overlay.remove(), 1000);
}

// ── View router ───────────────────────────────────────────────────────────────

let _currentMetric            = null;
let _currentDockerContainer   = null;
let _dashInterval             = null;
let _detailIntervals          = [];
let _dockerInterval           = null;
let _dockerContainerIntervals = [];
let _cfInterval               = null;
let _netMini                  = null;
let _detailChart              = null;
let _dockerCpuChart           = null;
let _dockerRamChart           = null;
let _cfReqChart               = null;

function _cleanupAll() {
    if (_dashInterval)   { clearInterval(_dashInterval);   _dashInterval = null; }
    if (_dockerInterval) { clearInterval(_dockerInterval); _dockerInterval = null; }
    if (_cfInterval)     { clearInterval(_cfInterval);     _cfInterval = null; }
    _detailIntervals.forEach(clearInterval);
    _detailIntervals = [];
    _dockerContainerIntervals.forEach(clearInterval);
    _dockerContainerIntervals = [];
    if (_netMini)        { _netMini.destroy();        _netMini = null; }
    if (_detailChart)    { _detailChart.destroy();    _detailChart = null; }
    if (_dockerCpuChart) { _dockerCpuChart.destroy(); _dockerCpuChart = null; }
    if (_dockerRamChart) { _dockerRamChart.destroy(); _dockerRamChart = null; }
    if (_cfReqChart)     { _cfReqChart.destroy();     _cfReqChart = null; }
    _currentMetric = null;
    _currentDockerContainer = null;
    _cfZoneId = null;
}

async function _doNavigate(view, metricType) {
    _cleanupAll();

    const container = document.getElementById('view-container');

    container.style.transition = 'opacity 0.18s ease-in, transform 0.2s ease-in';
    container.style.opacity    = '0';
    container.style.transform  = 'translateY(-10px)';
    await new Promise(r => setTimeout(r, 210));

    let url;
    if (view === 'dashboard')             url = '/view/dashboard';
    else if (view === 'docker')           url = '/view/docker';
    else if (view === 'docker-container') url = `/view/docker-container/${encodeURIComponent(metricType)}`;
    else if (view === 'cloudflare')       url = '/view/cloudflare';
    else                                  url = `/view/detail/${metricType}`;
    try {
        container.innerHTML = await (await fetch(url)).text();
    } catch { return; }

    container.style.transition = 'none';
    container.style.opacity    = '0';
    container.style.transform  = 'translateY(24px)';
    container.offsetHeight;
    container.style.transition = 'opacity 0.38s cubic-bezier(0.05,0.7,0.1,1), transform 0.38s cubic-bezier(0.05,0.7,0.1,1)';
    container.style.opacity    = '1';
    container.style.transform  = 'translateY(0)';

    if (view === 'dashboard')             _initDashboard();
    else if (view === 'docker')           _initDockerOverview();
    else if (view === 'docker-container') _initDockerContainer(metricType);
    else if (view === 'cloudflare')       _initCloudflare();
    else                                  _initDetail(metricType);
}

async function navigateTo(view, metricType) {
    let newUrl;
    if (view === 'dashboard')             newUrl = '/';
    else if (view === 'docker')           newUrl = '/docker';
    else if (view === 'docker-container') newUrl = `/docker/${encodeURIComponent(metricType)}`;
    else if (view === 'cloudflare')       newUrl = '/cloudflare';
    else                                  newUrl = `/${metricType}`;
    history.pushState({ view, metricType: metricType || null }, '', newUrl);
    await _doNavigate(view, metricType);
}

window.addEventListener('popstate', (e) => {
    const state = e.state || { view: 'dashboard', metricType: null };
    _doNavigate(state.view, state.metricType);
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

function _initDashboard() {
    document.querySelectorAll('.m3-widget').forEach(w => w.classList.add('pop'));
    const netCanvas = document.getElementById('chart-net-mini');
    if (netCanvas) {
        _netMini = new Chart(netCanvas, {
            type: 'line',
            data: {
                labels:   Array(20).fill(''),
                datasets: [{
                    data: Array(20).fill(0),
                    borderColor: '#6750a4', backgroundColor: '#6750a41A',
                    fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0,
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales:  { x: { display: false }, y: { display: false } },
                animation: false,
            }
        });
    }
    _refreshDashboard();
    _dashInterval = setInterval(_refreshDashboard, 3000);
}

async function _refreshDashboard() {
    let data;
    try { data = await (await fetch('/api/current')).json(); }
    catch { return; }

    const m = data.metrics || {};
    _setVal('widget-net_rx-value', m.net_rx ? m.net_rx.value.toFixed(3) : '–');
    _setVal('widget-net_tx-value', m.net_tx ? m.net_tx.value.toFixed(3) : '–');
    _setVal('widget-cpu-value',    m.cpu    ? m.cpu.value.toFixed(1)    : '–');
    _setVal('widget-ram-value',    m.ram    ? m.ram.value.toFixed(1)    : '–');
    _setVal('widget-disk-value',   m.disk   ? m.disk.value.toFixed(2)   : '–');

    const tempEl = document.getElementById('widget-temp-value');
    if (tempEl && m.temp) tempEl.textContent = m.temp.value === -1 ? 'N/A' : m.temp.value.toFixed(1);

    _setBar('bar-cpu',  m.cpu  ? m.cpu.value  : 0, 100);
    _setBar('bar-ram',  m.ram  ? m.ram.value  : 0, 100);
    _setBar('bar-disk', m.disk ? m.disk.value : 0, 2000);

    if (_netMini && m.net_rx) {
        _netMini.data.datasets[0].data.shift();
        _netMini.data.datasets[0].data.push(m.net_rx.value);
        _netMini.update('none');
    }

    try {
        const dd = await (await fetch('/api/docker/current')).json();
        const containers = dd.containers || [];
        _setVal('widget-docker-count', containers.length);
        const namesEl = document.getElementById('widget-docker-names');
        if (namesEl) namesEl.textContent = containers.map(c => c.name).join(' · ') || '–';
    } catch { /* docker unavailable */ }

    try {
        const cf = await (await fetch('/api/cf/summary')).json();
        if (cf.configured && cf.zones && cf.zones[0]) {
            const z = cf.zones[0];
            const fmtN = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? Math.round(n/1e3)+'K' : String(n);
            const fmtB = b => b >= 1e9 ? (b/1e9).toFixed(1)+' GB' : b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : Math.round(b/1e3)+' KB';
            _setVal('widget-cf-requests', fmtN(z.requests));
            _setVal('widget-cf-traffic',  fmtB(z.bytes));
        } else if (!cf.configured) {
            _setVal('widget-cf-traffic', 'nicht eingerichtet');
        }
    } catch { /* cf unavailable */ }
}

function _setVal(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function _setBar(id, v, max) { const el = document.getElementById(id); if (el) el.style.width = Math.min(v / max * 100, 100) + '%'; }

// ── Detail ────────────────────────────────────────────────────────────────────

let _systemInfo = null;

async function _fetchSystemInfo() {
    try { _systemInfo = await (await fetch('/api/system')).json(); }
    catch { _systemInfo = null; }
}

function toggleRangePicker(btn) {
    const picker = document.getElementById('range-picker');
    if (!picker) return;
    const opening = !picker.classList.contains('open');
    picker.classList.toggle('open', opening);
    btn.classList.toggle('active', opening);
    btn.setAttribute('aria-expanded', opening);
}

function _toDatetimeLocal(date) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function _initDetail(metricType) {
    _currentMetric = metricType;
    _breakdownMode = false;
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = (METRIC_META[metricType] || {}).label || metricType;

    const toggleContainer = document.getElementById('breakdown-toggle-container');
    if (toggleContainer) {
        if (metricType === 'cpu' || metricType === 'ram') {
            toggleContainer.classList.remove('hidden');
        } else {
            toggleContainer.classList.add('hidden');
        }
    }
    const toggleBtn = document.getElementById('breakdown-toggle');
    if (toggleBtn) toggleBtn.classList.remove('active');

    const now  = new Date();
    const from = document.getElementById('range-from');
    const to   = document.getElementById('range-to');
    if (from) from.value = _toDatetimeLocal(new Date(now.getTime() - 86400000));
    if (to)   to.value   = _toDatetimeLocal(now);

    if (!_systemInfo) _fetchSystemInfo().then(_updateLiveValue);

    loadRange('1h', document.querySelector('.time-chip.active'));
    _updateLiveValue();
    _detailIntervals = [
        setInterval(_appendLivePoint, 5000),
        setInterval(_updateLiveValue, 5000),
    ];
}

let _breakdownMode = false;
async function toggleBreakdownMode() {
    _breakdownMode = !_breakdownMode;
    const btn = document.getElementById('breakdown-toggle');
    if (btn) btn.classList.toggle('active', _breakdownMode);
    
    // Reload current range
    const activeChip = document.querySelector('.time-chips .time-chip.active');
    if (activeChip) {
        const text = activeChip.textContent;
        const range = text.includes('Std') ? (text.includes('24') ? '24h' : '1h') : (text.includes('7') ? '7d' : '30d');
        loadRange(range, activeChip);
    } else {
        const applyBtn = document.querySelector('.range-apply-btn.active');
        if (applyBtn) loadCustomRange(applyBtn);
    }
}

async function loadRange(range, btn) {
    if (!_currentMetric) return;
    document.querySelectorAll('.time-chips .time-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let json;
    const url = _breakdownMode 
        ? `/api/history-breakdown/${_currentMetric}?range=${range}`
        : `/api/history/${_currentMetric}?range=${range}`;

    try { json = await (await fetch(url)).json(); }
    catch { return; }

    const unit  = (METRIC_META[_currentMetric] || {}).unit  || '';
    const color = (METRIC_META[_currentMetric] || {}).color || '#6750a4';
    const ctx   = document.getElementById('chart-detail').getContext('2d');
    if (_detailChart) _detailChart.destroy();

    if (!_breakdownMode) {
        const labels = json.data.map(d => {
            const dt = new Date(d.timestamp * 1000);
            return (range === '7d' || range === '30d')
                ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        });
        const values = json.data.map(d => d.value);

        _detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Gesamt', data: values, borderColor: color, backgroundColor: color + '1A',
                    fill: true, tension: 0.4, borderWidth: 3,
                    pointRadius: values.length < 60 ? 3 : 0, pointHoverRadius: 6,
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ${unit}` } }
                },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } }
            }
        });
    } else {
        // BREAKDOWN MODE (STACKED)
        const labels = json.total.map(d => {
            const dt = new Date(d.timestamp * 1000);
            return (range === '7d' || range === '30d')
                ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        });

        // Map timestamps to indices for alignment
        const tsToIndex = {};
        json.total.forEach((d, i) => tsToIndex[d.timestamp] = i);

        const datasets = [];
        const colors = ['#6750a4', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
        let colorIdx = 0;

        // Add container datasets
        Object.keys(json.containers).forEach(name => {
            const data = Array(json.total.length).fill(0);
            json.containers[name].forEach(p => {
                if (tsToIndex[p.timestamp] != null) data[tsToIndex[p.timestamp]] = p.value;
            });
            const c = colors[colorIdx++ % colors.length];
            datasets.push({
                label: name, data: data, backgroundColor: c + 'CC', borderColor: c,
                fill: true, tension: 0.4, borderWidth: 1, pointRadius: 0, stack: 'stack0'
            });
        });

        // Add "Rest System" dataset
        const restData = json.total.map((d, i) => {
            const containerSum = Object.values(json.containers).reduce((acc, list) => {
                const p = list.find(x => x.timestamp === d.timestamp);
                return acc + (p ? p.value : 0);
            }, 0);
            return Math.max(0, d.value - containerSum);
        });
        datasets.push({
            label: 'System (Andere)', data: restData, backgroundColor: '#9ca3af80', borderColor: '#9ca3af',
            fill: true, tension: 0.4, borderWidth: 1, pointRadius: 0, stack: 'stack0'
        });

        _detailChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${unit}` } }
                },
                scales: { 
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, 
                    y: { stacked: true, grid: { color: '#f0f0f0' }, beginAtZero: true, max: _currentMetric === 'cpu' ? 100 : undefined } 
                }
            }
        });
    }
}

async function loadCustomRange(btn) {
    const fromEl = document.getElementById('range-from');
    const toEl   = document.getElementById('range-to');
    if (!fromEl?.value || !toEl?.value || !_currentMetric) return;

    const fromTs = Math.floor(new Date(fromEl.value).getTime() / 1000);
    const toTs   = Math.floor(new Date(toEl.value).getTime() / 1000);
    if (fromTs >= toTs) return;

    document.querySelectorAll('.time-chips .time-chip').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.range-apply-btn').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let json;
    const url = _breakdownMode 
        ? `/api/history-breakdown/${_currentMetric}?from=${fromTs}&to=${toTs}`
        : `/api/history/${_currentMetric}?from=${fromTs}&to=${toTs}`;

    try { json = await (await fetch(url)).json(); } catch { return; }

    const unit  = (METRIC_META[_currentMetric] || {}).unit  || '';
    const color = (METRIC_META[_currentMetric] || {}).color || '#6750a4';
    const ctx   = document.getElementById('chart-detail').getContext('2d');
    if (_detailChart) _detailChart.destroy();

    const diffSec = toTs - fromTs;

    if (!_breakdownMode) {
        const labels = json.data.map(d => {
            const dt = new Date(d.timestamp * 1000);
            return diffSec > 86400 * 2
                ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        });
        const values = json.data.map(d => d.value);

        _detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Gesamt', data: values, borderColor: color, backgroundColor: color + '1A',
                    fill: true, tension: 0.4, borderWidth: 3,
                    pointRadius: values.length < 60 ? 3 : 0, pointHoverRadius: 6,
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ${unit}` } }
                },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } }
            }
        });
    } else {
        // BREAKDOWN MODE (STACKED)
        const labels = json.total.map(d => {
            const dt = new Date(d.timestamp * 1000);
            return diffSec > 86400 * 2
                ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        });

        const tsToIndex = {};
        json.total.forEach((d, i) => tsToIndex[d.timestamp] = i);

        const datasets = [];
        const colors = ['#6750a4', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
        let colorIdx = 0;

        Object.keys(json.containers).forEach(name => {
            const data = Array(json.total.length).fill(0);
            json.containers[name].forEach(p => {
                if (tsToIndex[p.timestamp] != null) data[tsToIndex[p.timestamp]] = p.value;
            });
            const c = colors[colorIdx++ % colors.length];
            datasets.push({
                label: name, data: data, backgroundColor: c + 'CC', borderColor: c,
                fill: true, tension: 0.4, borderWidth: 1, pointRadius: 0, stack: 'stack0'
            });
        });

        const restData = json.total.map((d, i) => {
            const containerSum = Object.values(json.containers).reduce((acc, list) => {
                const p = list.find(x => x.timestamp === d.timestamp);
                return acc + (p ? p.value : 0);
            }, 0);
            return Math.max(0, d.value - containerSum);
        });
        datasets.push({
            label: 'System (Andere)', data: restData, backgroundColor: '#9ca3af80', borderColor: '#9ca3af',
            fill: true, tension: 0.4, borderWidth: 1, pointRadius: 0, stack: 'stack0'
        });

        _detailChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${unit}` } }
                },
                scales: { 
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, 
                    y: { stacked: true, grid: { color: '#f0f0f0' }, beginAtZero: true, max: _currentMetric === 'cpu' ? 100 : undefined } 
                }
            }
        });
    }
}

async function _appendLivePoint() {
    if (!_detailChart || !_currentMetric) return;
    let data;
    try { data = await (await fetch('/api/current')).json(); } catch { return; }
    const m = data.metrics[_currentMetric];
    if (!m) return;
    const label = new Date(data.timestamp * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    _detailChart.data.labels.push(label);
    _detailChart.data.datasets[0].data.push(m.value);
    if (_detailChart.data.labels.length > 200) { _detailChart.data.labels.shift(); _detailChart.data.datasets[0].data.shift(); }
    _detailChart.update('none');
}

async function _updateLiveValue() {
    const el = document.getElementById('live-value');
    if (!el || !_currentMetric) return;
    try {
        const data = await (await fetch('/api/current')).json();
        const m    = data.metrics[_currentMetric];
        if (!m) return;
        const unit = (METRIC_META[_currentMetric] || {}).unit || '';
        let text;
        if (m.value === -1) {
            text = 'N/A';
        } else if (_currentMetric === 'ram' && _systemInfo?.ram_total_gb) {
            const used = (m.value / 100 * _systemInfo.ram_total_gb).toFixed(1);
            text = `${used} GB / ${_systemInfo.ram_total_gb} GB (${m.value.toFixed(1)}%)`;
        } else if (_currentMetric === 'disk' && _systemInfo?.disk_total_gb) {
            text = `${m.value.toFixed(1)} GB / ${_systemInfo.disk_total_gb} GB`;
        } else if (_currentMetric === 'cpu' && _systemInfo?.cpu_cores) {
            text = `${m.value.toFixed(1)}%  —  ${_systemInfo.cpu_cores} Kerne`;
        } else if (_currentMetric === 'net_rx') {
            const tx = data.metrics['net_tx'];
            text = `↓ ${m.value.toFixed(3)} MB/s  ↑ ${tx ? tx.value.toFixed(3) : '–'} MB/s`;
        } else {
            text = `${m.value.toFixed(2)} ${unit}`;
        }
        el.textContent = text;
    } catch { el.textContent = ''; }
}

// ── Docker Overview ────────────────────────────────────────────────────────────

function _initDockerOverview() {
    document.querySelectorAll('.m3-widget').forEach(w => w.classList.add('pop'));
    _refreshDockerOverview();
    _dockerInterval = setInterval(_refreshDockerOverview, 3000);
}

async function _refreshDockerOverview() {
    let data;
    try { data = await (await fetch('/api/docker/current')).json(); } catch { return; }
    const grid = document.getElementById('docker-overview-grid');
    if (!grid) return;
    const containers = data.containers || [];
    if (!containers.length) {
        if (data.error) {
            grid.innerHTML = `<p style="opacity:0.6;font-size:0.85rem;grid-column:1/-1;color:#ef4444;">Fehler beim Verbinden mit Docker: ${data.error}</p>`;
        } else {
            grid.innerHTML = '<p style="opacity:0.4;font-size:0.85rem;grid-column:1/-1;">Keine laufenden Docker-Container gefunden.</p>';
        }
        return;
    }
    const projects = {};
    containers.forEach(c => {
        const p = c.project || 'Einzelne Container';
        if (!projects[p]) projects[p] = [];
        projects[p].push(c);
    });

    let html = '';
    const sortedProjects = Object.keys(projects).sort((a, b) => {
        if (a === 'Einzelne Container') return 1;
        if (b === 'Einzelne Container') return -1;
        return a.localeCompare(b);
    });

    sortedProjects.forEach(pName => {
        html += `<div style="grid-column:1/-1;margin-top:24px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
                    <span style="font-weight:800;font-size:0.75rem;opacity:0.4;letter-spacing:0.08em;text-transform:uppercase;">${pName}</span>
                    <div style="flex:1;height:1px;background:#f3f4f6;"></div>
                 </div>`;
        
        html += projects[pName].map(c => {
            const cpu    = c.cpu && c.cpu.value != null ? c.cpu.value.toFixed(1) : '–';
            const ram    = c.ram && c.ram.value != null ? c.ram.value.toFixed(0) : '–';
            const cpuPct = c.cpu && c.cpu.value != null ? Math.min(c.cpu.value, 100) : 0;
            const ramPct = c.ram && c.ram.value != null ? Math.min(c.ram.value / 2048 * 100, 100) : 0;
            const safe   = c.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const isRunning = c.status === 'running';
            const dotColor  = isRunning ? '#34d399' : (c.status === 'exited' ? '#ef4444' : '#9ca3af');
            const imgName   = c.image || 'Unbekanntes Image';
            
            return `<div onclick="navigateTo('docker-container','${safe}')" class="m3-widget pop" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="display:flex;flex-direction:column;">
           <span class="widget-label">Container</span>
           <span style="font-size:10px;opacity:0.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;" title="${imgName}">${imgName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
           <span style="font-size:10px;font-weight:600;opacity:0.6;text-transform:uppercase;">${c.status || 'unknown'}</span>
           <span style="width:8px;height:8px;background:${dotColor};border-radius:50%;flex-shrink:0;"></span>
        </div>
      </div>
      <p style="font-size:1rem;font-weight:700;margin:4px 0 12px;word-break:break-all;">${c.name}</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="opacity:${isRunning ? '1' : '0.3'}">
          <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin-bottom:3px;"><span style="opacity:0.5;text-transform:uppercase;letter-spacing:0.05em;">CPU</span><span>${cpu}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${cpuPct}%;"></div></div>
        </div>
        <div style="opacity:${isRunning ? '1' : '0.3'}">
          <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin-bottom:3px;"><span style="opacity:0.5;text-transform:uppercase;letter-spacing:0.05em;">RAM</span><span>${ram} MB</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${ramPct}%;background:#3b82f6;"></div></div>
        </div>
      </div>
    </div>`;
        }).join('');
    });
    grid.innerHTML = html;
}

// ── Docker Container Detail ────────────────────────────────────────────────────

function _initDockerContainer(name) {
    _currentDockerContainer = name;
    const titleEl = document.getElementById('docker-container-title');
    if (titleEl) titleEl.textContent = name;
    loadDockerRange('1h', document.querySelector('.time-chip.active'));
    _updateDockerLive();
    _dockerContainerIntervals = [setInterval(_appendDockerLivePoints, 5000), setInterval(_updateDockerLive, 5000)];
}

async function loadDockerRange(range, btn) {
    if (!_currentDockerContainer) return;
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const enc = encodeURIComponent(_currentDockerContainer);
    let cpuJson, ramJson;
    try {
        [cpuJson, ramJson] = await Promise.all([
            (await fetch(`/api/docker/history/${enc}?metric=cpu&range=${range}`)).json(),
            (await fetch(`/api/docker/history/${enc}?metric=ram&range=${range}`)).json(),
        ]);
    } catch { return; }
    const toLabel = ts => {
        const dt = new Date(ts * 1000);
        return (range === '7d' || range === '30d') ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    };
    const cpuCanvas = document.getElementById('chart-docker-cpu');
    const ramCanvas = document.getElementById('chart-docker-ram');
    if (!cpuCanvas || !ramCanvas) return;
    if (_dockerCpuChart) _dockerCpuChart.destroy();
    if (_dockerRamChart) _dockerRamChart.destroy();
    const makeOpts = unit => ({ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: c => `${c.parsed.y.toFixed(2)} ${unit}` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: '#f0f0f0' } } } });
    _dockerCpuChart = new Chart(cpuCanvas.getContext('2d'), { type: 'line', data: { labels: cpuJson.data.map(d => toLabel(d.timestamp)), datasets: [{ data: cpuJson.data.map(d => d.value), borderColor: '#6750a4', backgroundColor: '#6750a41A', fill: true, tension: 0.4, borderWidth: 3, pointRadius: cpuJson.data.length < 60 ? 3 : 0, pointHoverRadius: 6 }] }, options: makeOpts('%') });
    _dockerRamChart = new Chart(ramCanvas.getContext('2d'), { type: 'line', data: { labels: ramJson.data.map(d => toLabel(d.timestamp)), datasets: [{ data: ramJson.data.map(d => d.value), borderColor: '#3b82f6', backgroundColor: '#3b82f61A', fill: true, tension: 0.4, borderWidth: 3, pointRadius: ramJson.data.length < 60 ? 3 : 0, pointHoverRadius: 6 }] }, options: makeOpts('MB') });
}

async function _appendDockerLivePoints() {
    if (!_dockerCpuChart || !_dockerRamChart || !_currentDockerContainer) return;
    let data;
    try { data = await (await fetch('/api/docker/current')).json(); } catch { return; }
    const c = (data.containers || []).find(c => c.name === _currentDockerContainer);
    if (!c) return;
    const label = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (c.cpu && c.cpu.value != null) { _dockerCpuChart.data.labels.push(label); _dockerCpuChart.data.datasets[0].data.push(c.cpu.value); if (_dockerCpuChart.data.labels.length > 200) { _dockerCpuChart.data.labels.shift(); _dockerCpuChart.data.datasets[0].data.shift(); } _dockerCpuChart.update('none'); }
    if (c.ram && c.ram.value != null) { _dockerRamChart.data.labels.push(label); _dockerRamChart.data.datasets[0].data.push(c.ram.value); if (_dockerRamChart.data.labels.length > 200) { _dockerRamChart.data.labels.shift(); _dockerRamChart.data.datasets[0].data.shift(); } _dockerRamChart.update('none'); }
}

async function _updateDockerLive() {
    const el = document.getElementById('docker-live-value');
    if (!el || !_currentDockerContainer) return;
    try {
        const data = await (await fetch('/api/docker/current')).json();
        const c = (data.containers || []).find(c => c.name === _currentDockerContainer);
        if (!c) { el.textContent = ''; return; }
        el.textContent = `Status: ${c.status || 'unknown'}  ·  CPU ${c.cpu && c.cpu.value != null ? c.cpu.value.toFixed(1) : '–'}%  ·  RAM ${c.ram && c.ram.value != null ? c.ram.value.toFixed(0) : '–'} MB`;
    } catch { el.textContent = ''; }
}

// ── Cloudflare ─────────────────────────────────────────────────────────────────

let _cfZoneId = null;

function _initCloudflare() {
    const zoneEl = document.querySelector('[data-cf-zone].active') || document.getElementById('cf-single-zone');
    _cfZoneId = zoneEl ? (zoneEl.dataset.cfZone || null) : null;
    if (!_cfZoneId) { showCfSettings(); return; }
    _loadCfSummary();
    loadCfRange('24h', document.querySelector('.time-chip.active'));
    _loadCfTopUrls();
    _cfInterval = setInterval(_loadCfSummary, 60000);
}

async function selectCfZone(zoneId, btn) {
    _cfZoneId = zoneId;
    document.querySelectorAll('[data-cf-zone]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    await Promise.all([_loadCfSummary(), _loadCfTopUrls()]);
    loadCfRange(document.querySelector('.time-chip.active')?.dataset.range || '24h', document.querySelector('.time-chip.active'));
}

async function _loadCfSummary() {
    if (!_cfZoneId) return;
    try {
        const data = await (await fetch('/api/cf/summary')).json();
        const z    = (data.zones || []).find(z => z.zone_id === _cfZoneId);
        if (!z) return;
        const fmtN = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? Math.round(n/1e3)+'K' : String(n);
        const fmtB = b => b >= 1e9 ? (b/1e9).toFixed(1)+' GB' : b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : Math.round(b/1e3)+' KB';
        _setVal('cf-req-today',      fmtN(z.requests));
        _setVal('cf-bytes-today',    fmtB(z.bytes));
        _setVal('cf-visitors-today', fmtN(z.visitors));
        _setVal('cf-threats-today',  fmtN(z.threats));
    } catch {}
}

async function loadCfRange(range, btn) {
    if (!_cfZoneId) return;
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
    if (btn) { btn.classList.add('active'); btn.dataset.range = range; }
    let json;
    try { json = await (await fetch(`/api/cf/traffic?zone_id=${_cfZoneId}&range=${range}`)).json(); } catch { return; }
    const labels = json.data.map(d => {
        const dt = new Date(d.timestamp * 1000);
        return (range === '7d' || range === '30d') ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    });
    const values  = json.data.map(d => d.requests);
    const canvas  = document.getElementById('chart-cf-requests');
    if (!canvas) return;
    if (_cfReqChart) _cfReqChart.destroy();
    _cfReqChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ data: values, borderColor: '#f6821f', backgroundColor: '#f6821f1A', fill: true, tension: 0.4, borderWidth: 3, pointRadius: values.length < 60 ? 3 : 0, pointHoverRadius: 6 }] },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: '#1d192b', padding: 12, cornerRadius: 12, callbacks: { label: c => `${c.parsed.y.toLocaleString()} Anfragen` } } },
            scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: '#f0f0f0' } } }
        }
    });
}

async function _loadCfTopUrls() {
    if (!_cfZoneId) return;
    const el = document.getElementById('cf-top-urls-list');
    if (!el) return;
    try {
        const json = await (await fetch(`/api/cf/top-urls?zone_id=${_cfZoneId}`)).json();
        const rows = json.data || [];
        if (!rows.length) { el.innerHTML = '<p style="opacity:0.4;font-size:0.85rem;">Keine Daten – erfordert Cloudflare Pro+ oder Daten werden noch gesammelt.</p>'; return; }
        const maxReq = rows[0].requests || 1;
        el.innerHTML = rows.map((r, i) => `
<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f3f4f6;">
  <span style="width:22px;font-size:12px;font-weight:700;opacity:0.3;flex-shrink:0;">${i+1}</span>
  <div style="flex:1;min-width:0;">
    <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.host}${r.path}">${r.host ? '<span style="opacity:0.45;font-size:11px;">'+r.host+'</span>' : ''}${r.path}</div>
    <div style="height:3px;background:#f3f4f6;border-radius:4px;margin-top:4px;"><div style="height:100%;background:#f6821f;border-radius:4px;width:${(r.requests/maxReq*100).toFixed(1)}%;"></div></div>
  </div>
  <span style="font-size:13px;font-weight:700;opacity:0.65;flex-shrink:0;white-space:nowrap;">${r.requests.toLocaleString()}</span>
</div>`).join('');
    } catch {}
}

function showCfSettings() {
    const el = document.getElementById('cf-settings-overlay');
    if (el) el.style.display = 'flex';
}

function hideCfSettings() {
    const el = document.getElementById('cf-settings-overlay');
    if (el) el.style.display = 'none';
}

async function saveCfConfig() {
    const tokenEl = document.getElementById('cf-token');
    const msgEl   = document.getElementById('cf-setup-msg');
    if (!tokenEl) return;

    const token = tokenEl.value.trim();
    if (!token) { if (msgEl) msgEl.textContent = 'Bitte API Token eingeben.'; return; }
    if (msgEl) { msgEl.style.color = ''; msgEl.textContent = 'Verbinde…'; }

    try {
        const r = await (await fetch('/api/cf/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_token: token }),
        })).json();
        if (r.ok) {
            if (msgEl) msgEl.textContent = '✓ Verbunden! Lade neu…';
            setTimeout(() => navigateTo('cloudflare'), 1200);
        } else {
            if (msgEl) { msgEl.style.color = '#ef4444'; msgEl.textContent = r.error || 'Fehler'; }
        }
    } catch (e) {
        if (msgEl) { msgEl.style.color = '#ef4444'; msgEl.textContent = String(e); }
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────


async function _loadCfTunnels() {
    const el = document.getElementById('cf-tunnels-list');
    if (!el) return;
    try {
        const data = await (await fetch('/api/cf/tunnels')).json();
        if (!data.tunnels || !data.tunnels.length) {
            el.innerHTML = '<p style="opacity:0.4;font-size:0.85rem;">Keine Tunnel gefunden. Token benoetigt <strong>Cloudflare Tunnel:Read</strong> Berechtigung.</p>';
            return;
        }
        el.innerHTML = data.tunnels.map(t => {
            const active = t.status === 'active' || t.connections > 0;
            const dot    = active ? '#22c55e' : '#94a3b8';
            const label  = active ? 'aktiv' : 'inaktiv';
            const routes = t.routes.length
                ? t.routes.map(r => '<div style="font-size:11px;color:#64748b;padding:1px 0 1px 16px;">&#8594; ' + r.hostname + '</div>').join('')
                : '<div style="font-size:11px;color:#94a3b8;padding-left:16px;">keine Routen</div>';
            const bg  = active ? '#dcfce7' : '#f1f5f9';
            const fg  = active ? '#166534' : '#64748b';
            return '<div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">'
                 + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                 + '<span style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;display:inline-block;"></span>'
                 + '<strong style="font-size:0.875rem;">' + t.name + '</strong>'
                 + '<span style="margin-left:auto;font-size:11px;padding:2px 7px;border-radius:99px;background:' + bg + ';color:' + fg + ';">' + label + '</span>'
                 + '<span style="font-size:11px;opacity:0.45;">' + t.connections + ' Verb.</span>'
                 + '</div>' + routes + '</div>';
        }).join('');
    } catch (e) {
        el.innerHTML = '<p style="opacity:0.4;font-size:0.85rem;">Fehler beim Laden der Tunnel.</p>';
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('view-container');
    const path      = window.location.pathname.replace(/^\//, '');

    if (path === 'cloudflare') {
        try { container.innerHTML = await (await fetch('/view/cloudflare')).text(); } catch { return; }
        history.replaceState({ view: 'cloudflare', metricType: null }, '', '/cloudflare');
        _initCloudflare();
        runIntro('Cloudflare Analytics');
    } else if (path === 'docker') {
        try { container.innerHTML = await (await fetch('/view/docker')).text(); } catch { return; }
        history.replaceState({ view: 'docker', metricType: null }, '', '/docker');
        _initDockerOverview();
        runIntro('Docker Container');
    } else if (path.startsWith('docker/')) {
        const name = decodeURIComponent(path.slice('docker/'.length));
        try { container.innerHTML = await (await fetch(`/view/docker-container/${encodeURIComponent(name)}`)).text(); } catch { return; }
        history.replaceState({ view: 'docker-container', metricType: name }, '', `/${path}`);
        _initDockerContainer(name);
        runIntro(name);
    } else {
        const metricInUrl = (METRIC_META && METRIC_META[path]) ? path : null;
        if (metricInUrl) {
            try { container.innerHTML = await (await fetch(`/view/detail/${metricInUrl}`)).text(); } catch { return; }
            history.replaceState({ view: 'detail', metricType: metricInUrl }, '', `/${metricInUrl}`);
            _initDetail(metricInUrl);
            runIntro((METRIC_META[metricInUrl] || {}).label || metricInUrl);
        } else {
            try { container.innerHTML = await (await fetch('/view/dashboard')).text(); } catch { return; }
            history.replaceState({ view: 'dashboard', metricType: null }, '', '/');
            _initDashboard();
            runIntro("Willkommen bei MONA");
        }
    }
});
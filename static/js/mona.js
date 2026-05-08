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

let _currentMetric   = null;
let _dashInterval    = null;
let _detailIntervals = [];
let _netMini         = null;
let _detailChart     = null;

function _cleanupAll() {
    if (_dashInterval)  { clearInterval(_dashInterval);  _dashInterval = null; }
    _detailIntervals.forEach(clearInterval);
    _detailIntervals = [];
    if (_netMini)      { _netMini.destroy();      _netMini = null; }
    if (_detailChart)  { _detailChart.destroy();  _detailChart = null; }
    _currentMetric = null;
}

async function _doNavigate(view, metricType) {
    _cleanupAll();

    const container = document.getElementById('view-container');

    // slide out
    container.style.transition = 'opacity 0.18s ease-in, transform 0.2s ease-in';
    container.style.opacity    = '0';
    container.style.transform  = 'translateY(-10px)';
    await new Promise(r => setTimeout(r, 210));

    // fetch & inject
    const url = view === 'dashboard' ? '/view/dashboard' : `/view/detail/${metricType}`;
    try {
        container.innerHTML = await (await fetch(url)).text();
    } catch { return; }

    // slide in
    container.style.transition = 'none';
    container.style.opacity    = '0';
    container.style.transform  = 'translateY(24px)';
    container.offsetHeight; // force reflow
    container.style.transition = 'opacity 0.38s cubic-bezier(0.05,0.7,0.1,1), transform 0.38s cubic-bezier(0.05,0.7,0.1,1)';
    container.style.opacity    = '1';
    container.style.transform  = 'translateY(0)';

    if (view === 'dashboard') {
        _initDashboard();
    } else {
        _initDetail(metricType);
    }
}

async function navigateTo(view, metricType) {
    const newUrl = view === 'dashboard' ? '/' : `/${metricType}`;
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
                    borderColor: '#6750a4',
                    backgroundColor: '#6750a41A',
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
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = (METRIC_META[metricType] || {}).label || metricType;

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

async function loadRange(range, btn) {
    if (!_currentMetric) return;
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let json;
    try { json = await (await fetch(`/api/history/${_currentMetric}?range=${range}`)).json(); }
    catch { return; }

    const labels = json.data.map(d => {
        const dt = new Date(d.timestamp * 1000);
        return (range === '7d' || range === '30d')
            ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
            : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    });
    const values = json.data.map(d => d.value);
    const color  = (METRIC_META[_currentMetric] || {}).color || '#6750a4';
    const unit   = (METRIC_META[_currentMetric] || {}).unit  || '';

    const ctx = document.getElementById('chart-detail').getContext('2d');
    if (_detailChart) _detailChart.destroy();

    _detailChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: color,
                backgroundColor: color + '1A',
                fill: true, tension: 0.4, borderWidth: 3,
                pointRadius: values.length < 60 ? 3 : 0,
                pointHoverRadius: 6,
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: '#1d192b', padding: 12, cornerRadius: 12,
                    callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ${unit}` }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                y: { grid: { color: '#f0f0f0' } }
            }
        }
    });
}

async function loadCustomRange(btn) {
    const fromEl = document.getElementById('range-from');
    const toEl   = document.getElementById('range-to');
    if (!fromEl?.value || !toEl?.value || !_currentMetric) return;

    const fromTs = Math.floor(new Date(fromEl.value).getTime() / 1000);
    const toTs   = Math.floor(new Date(toEl.value).getTime() / 1000);
    if (fromTs >= toTs) return;

    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.range-apply-btn').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let json;
    try {
        json = await (await fetch(`/api/history/${_currentMetric}?from=${fromTs}&to=${toTs}`)).json();
    } catch { return; }

    const diffSec = toTs - fromTs;
    const labels = json.data.map(d => {
        const dt = new Date(d.timestamp * 1000);
        return diffSec > 86400 * 2
            ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
            : dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    });
    const values = json.data.map(d => d.value);
    const color  = (METRIC_META[_currentMetric] || {}).color || '#6750a4';
    const unit   = (METRIC_META[_currentMetric] || {}).unit  || '';

    const ctx = document.getElementById('chart-detail').getContext('2d');
    if (_detailChart) _detailChart.destroy();

    _detailChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: color,
                backgroundColor: color + '1A',
                fill: true, tension: 0.4, borderWidth: 3,
                pointRadius: values.length < 60 ? 3 : 0,
                pointHoverRadius: 6,
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: '#1d192b', padding: 12, cornerRadius: 12,
                    callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ${unit}` }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                y: { grid: { color: '#f0f0f0' } }
            }
        }
    });
}

async function _appendLivePoint() {
    if (!_detailChart || !_currentMetric) return;
    let data;
    try { data = await (await fetch('/api/current')).json(); }
    catch { return; }

    const m = data.metrics[_currentMetric];
    if (!m) return;

    const label = new Date(data.timestamp * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    _detailChart.data.labels.push(label);
    _detailChart.data.datasets[0].data.push(m.value);
    if (_detailChart.data.labels.length > 200) {
        _detailChart.data.labels.shift();
        _detailChart.data.datasets[0].data.shift();
    }
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

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const container   = document.getElementById('view-container');
    const path        = window.location.pathname.replace(/^\//, '');
    const metricInUrl = (METRIC_META && METRIC_META[path]) ? path : null;

    if (metricInUrl) {
        try {
            container.innerHTML = await (await fetch(`/view/detail/${metricInUrl}`)).text();
        } catch { return; }
        history.replaceState({ view: 'detail', metricType: metricInUrl }, '', `/${metricInUrl}`);
        _initDetail(metricInUrl);
        runIntro((METRIC_META[metricInUrl] || {}).label || metricInUrl);
    } else {
        try {
            container.innerHTML = await (await fetch('/view/dashboard')).text();
        } catch { return; }
        history.replaceState({ view: 'dashboard', metricType: null }, '', '/');
        _initDashboard();
        runIntro("Willkommen bei MONA");
    }
});

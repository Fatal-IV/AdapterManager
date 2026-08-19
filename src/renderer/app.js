const GLYPHS = {
  ethernet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h1M15 7V4a1 1 0 0 0-1-1h-1"/><path d="M7 17v2M17 17v2"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.2 16a6.5 6.5 0 0 1 7.6 0"/><path d="M11.5 19.5h1"/></svg>'
};

let currentAdapters = [];

const CATEGORY_LABELS = {
  public: 'detail.categoryPublic',
  private: 'detail.categoryPrivate',
  domain: 'detail.categoryDomain'
};

function formatMbps(result) {
  return result && typeof result.mbps === 'number' ? `${result.mbps.toFixed(1)} Mbps` : t('detail.unavailable');
}

function formatMs(result) {
  return result && typeof (result.avgMs ?? result.ms) === 'number' ? `${result.avgMs ?? result.ms} ms` : t('detail.unavailable');
}

function statusLabel(status) {
  if (status === 'up') return t('status.up');
  if (status === 'down') return t('status.down');
  return t('status.idle');
}

function buildAdapterCard(adapter, { compact }) {
  const el = document.createElement('div');
  el.className = compact ? 'drawer-row' : 'adapter-card';
  el.dataset.status = adapter.status;
  el.onclick = () => openDetailView(adapter);

  const glyph = document.createElement('div');
  glyph.className = 'adapter-glyph';
  glyph.dataset.status = adapter.status;
  glyph.innerHTML = GLYPHS[adapter.type] || GLYPHS.ethernet;
  el.appendChild(glyph);

  const info = document.createElement('div');
  info.className = compact ? 'drawer-row-info' : 'adapter-info';
  const nameRow = document.createElement('div');
  nameRow.className = compact ? 'drawer-row-name' : 'adapter-name-row';
  nameRow.innerHTML = `<span class="${compact ? '' : 'adapter-name'}">${adapter.name}</span>`;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  nameRow.appendChild(dot);
  info.appendChild(nameRow);

  const meta = document.createElement('div');
  meta.className = compact ? 'drawer-row-meta' : 'adapter-meta';
  meta.innerHTML = `<span>${statusLabel(adapter.status)}</span>${compact ? '' : `<span>${adapter.mac}</span>`}`;
  info.appendChild(meta);
  el.appendChild(info);

  if (!compact) {
    const toggle = document.createElement('button');
    toggle.className = 'switch';
    toggle.dataset.on = String(adapter.status === 'up');
    toggle.onclick = async (ev) => {
      ev.stopPropagation();
      try {
        await window.api.adapters.toggle(adapter.name, adapter.status !== 'up');
        await refreshAdapters();
      } catch (err) {
        window.alert(t('error.toggleFailed'));
      }
    };
    el.appendChild(toggle);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    el.appendChild(chevron);
  }

  return el;
}

function renderAdapterList(adapters) {
  const list = document.querySelector('.adapter-list');
  list.innerHTML = '';
  adapters.forEach((a) => list.appendChild(buildAdapterCard(a, { compact: false })));

  const drawerList = document.querySelector('.drawer-list');
  drawerList.innerHTML = '';
  adapters.forEach((a) => drawerList.appendChild(buildAdapterCard(a, { compact: true })));
}

function filterAdapters(query, statusFilter) {
  const q = (query || '').toLowerCase();
  return currentAdapters.filter((a) => {
    const matchesQuery = a.name.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && a.status === 'up') ||
      (statusFilter === 'inactive' && a.status !== 'up');
    return matchesQuery && matchesStatus;
  });
}

async function refreshAdapters() {
  currentAdapters = await window.api.adapters.list();
  renderAdapterList(currentAdapters);
}

async function findConnectedSsid() {
  try {
    const networks = await window.api.wifi.scan();
    const connected = networks.find((n) => n.connected);
    return connected ? connected.ssid : '';
  } catch {
    return '';
  }
}

function copyToClipboard(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    const original = el.textContent;
    el.textContent = t('detail.copied');
    setTimeout(() => { el.textContent = original; }, 1200);
  });
}

async function openDetailView(adapter) {
  document.getElementById('listView').style.display = 'none';
  const view = document.getElementById('detailView');
  view.classList.add('active');

  document.getElementById('detailGlyph').innerHTML = GLYPHS[adapter.type] || GLYPHS.ethernet;
  document.getElementById('detailTitle').textContent = adapter.name;
  document.getElementById('detailStatus').textContent = statusLabel(adapter.status);
  document.getElementById('detailMac').textContent = adapter.mac;
  document.getElementById('detailNetworkName').textContent = adapter.name;
  document.getElementById('detailCategory').textContent = '—';
  document.getElementById('detailDns').textContent = '—';
  document.getElementById('detailIp').textContent = '—';
  document.getElementById('detailGateway').textContent = '—';
  document.getElementById('detailIpv6').textContent = '—';
  document.getElementById('detailDownload').textContent = t('detail.measuring');
  document.getElementById('detailUpload').textContent = t('detail.measuring');
  document.getElementById('detailPing').textContent = t('detail.measuring');

  document.getElementById('detailMac').onclick = () => copyToClipboard(adapter.mac, document.getElementById('detailMac'));
  document.getElementById('editIpDnsBtn').onclick = () => window.api.editWindow.open(adapter.name, adapter.type);
  document.getElementById('modemBtn').onclick = async () => {
    const cfg = await window.api.network.getIp(adapter.name);
    if (cfg.gateway) window.api.network.openGateway(cfg.gateway);
  };
  document.getElementById('diagnoseBtn').onclick = () => openDiagModal(adapter);

  const [ipCfg, profile, ipv6, networkName] = await Promise.all([
    window.api.network.getIp(adapter.name),
    window.api.network.getProfile(adapter.name),
    window.api.network.getIpv6(adapter.name),
    adapter.type === 'wifi' ? findConnectedSsid() : Promise.resolve(adapter.name)
  ]);
  document.getElementById('detailNetworkName').textContent = networkName || adapter.name;
  document.getElementById('detailCategory').textContent = t(CATEGORY_LABELS[profile.category]);
  document.getElementById('detailDns').textContent = (ipCfg.dns && ipCfg.dns.length) ? ipCfg.dns.join(', ') : t('detail.unavailable');
  document.getElementById('detailIp').textContent = ipCfg.ip || t('detail.unavailable');
  document.getElementById('detailGateway').textContent = ipCfg.gateway || t('detail.unavailable');
  document.getElementById('detailIpv6').textContent = ipv6 || t('detail.unavailable');

  window.api.diagnostics.downloadSpeed().then((r) => { document.getElementById('detailDownload').textContent = formatMbps(r); });
  window.api.diagnostics.uploadSpeed().then((r) => { document.getElementById('detailUpload').textContent = formatMbps(r); });
  window.api.diagnostics.ping('8.8.8.8').then((r) => { document.getElementById('detailPing').textContent = formatMs(r); });
}

function closeDetailView() {
  document.getElementById('detailView').classList.remove('active');
  document.getElementById('listView').style.display = '';
}

async function openDiagModal(adapter) {
  document.getElementById('diagGateway').textContent = t('detail.measuring');
  document.getElementById('diagDns').textContent = t('detail.measuring');
  document.getElementById('diagInternet').textContent = t('detail.measuring');
  document.getElementById('diagModal').classList.add('open');
  document.getElementById('diagScrim').classList.add('open');

  const ipCfg = await window.api.network.getIp(adapter.name);
  if (ipCfg.gateway) {
    window.api.diagnostics.ping(ipCfg.gateway).then((r) => { document.getElementById('diagGateway').textContent = formatMs(r); });
  } else {
    document.getElementById('diagGateway').textContent = t('detail.unavailable');
  }
  window.api.diagnostics.dnsTiming().then((r) => { document.getElementById('diagDns').textContent = formatMs(r); });
  window.api.diagnostics.ping('8.8.8.8').then((r) => { document.getElementById('diagInternet').textContent = formatMs(r); });
}

function closeDiagModal() {
  document.getElementById('diagModal').classList.remove('open');
  document.getElementById('diagScrim').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  window.api.settings.get().then((s) => {
    if (s.theme !== 'system') document.documentElement.dataset.theme = s.theme;
  });

  document.getElementById('detailBackBtn').addEventListener('click', closeDetailView);
  document.getElementById('diagCloseBtn').addEventListener('click', closeDiagModal);
  document.getElementById('diagScrim').addEventListener('click', closeDiagModal);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  const autoSwitch = document.querySelector('.auto-card .switch');
  window.api.autoMode.get().then((enabled) => { autoSwitch.dataset.on = String(enabled); });
  autoSwitch.addEventListener('click', async () => {
    const next = autoSwitch.dataset.on !== 'true';
    await window.api.autoMode.set(next);
    autoSwitch.dataset.on = String(next);
  });

  const searchInput = document.querySelector('.search-box input');
  const filterButtons = document.querySelectorAll('.sidebar .segmented button');
  function applyDrawerFilter() {
    const active = document.querySelector('.sidebar .segmented button.active');
    const filtered = filterAdapters(searchInput.value, active.dataset.filter);
    const drawerList = document.querySelector('.drawer-list');
    drawerList.innerHTML = '';
    filtered.forEach((a) => drawerList.appendChild(buildAdapterCard(a, { compact: true })));
  }
  searchInput.addEventListener('input', applyDrawerFilter);
  filterButtons.forEach((btn) => btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyDrawerFilter();
  }));

  loadI18n().then(() => {
    applyI18n();
    refreshAdapters();
  });
});

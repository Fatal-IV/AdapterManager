const GLYPHS = {
  ethernet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h1M15 7V4a1 1 0 0 0-1-1h-1"/><path d="M7 17v2M17 17v2"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.2 16a6.5 6.5 0 0 1 7.6 0"/><path d="M11.5 19.5h1"/></svg>'
};

let currentAdapters = [];
let activeSheetAdapter = null;

function statusLabel(status) {
  if (status === 'up') return t('status.up');
  if (status === 'down') return t('status.down');
  return t('status.idle');
}

function buildAdapterCard(adapter, { compact }) {
  const el = document.createElement('div');
  el.className = compact ? 'drawer-row' : 'adapter-card';
  el.dataset.status = adapter.status;
  el.onclick = () => {
    openDetailSheet(adapter);
    if (compact) closeDrawer();
  };

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
      await window.api.adapters.toggle(adapter.id, adapter.status !== 'up');
      await refreshAdapters();
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

function fillIpPanel(cfg) {
  document.querySelector('.panel[data-panel="ip"] .segmented button[data-mode="dhcp"]')
    .classList.toggle('active', cfg.dhcp);
  document.querySelector('.panel[data-panel="ip"] .segmented button[data-mode="manual"]')
    .classList.toggle('active', !cfg.dhcp);
  const inputs = document.querySelectorAll('.panel[data-panel="ip"] input');
  inputs[0].value = cfg.ip || '';
  inputs[1].value = cfg.subnet || '';
  inputs[2].value = cfg.gateway || '';
  inputs[3].value = (cfg.dns && cfg.dns[0]) || '';
  inputs[4].value = (cfg.dns && cfg.dns[1]) || '';
}

function fillProxyPanel(cfg) {
  document.querySelectorAll('.panel[data-panel="proxy"] .segmented button').forEach((b) => b.classList.remove('active'));
  const map = { off: 'proxy-off', auto: 'proxy-auto', manual: 'proxy-manual' };
  document.querySelector(`.panel[data-panel="proxy"] .segmented button[data-mode="${map[cfg.mode]}"]`)
    .classList.add('active');
  document.querySelector('.panel[data-panel="proxy"] input').value = cfg.autoConfigUrl || cfg.server || '';
}

async function fillWifiPanel(adapter) {
  const list = document.querySelector('.wifi-list');
  list.innerHTML = '<p>Taranıyor…</p>';
  const networks = await window.api.wifi.scan();
  list.innerHTML = '';
  networks.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'wifi-row' + (n.connected ? ' connected' : '');
    row.innerHTML = `<span class="name">${n.ssid}</span>${n.connected ? `<span class="connected-tag">${t('wifi.connected')}</span>` : ''}`;
    row.onclick = async () => {
      if (n.connected) return;
      const password = window.prompt(`"${n.ssid}" için şifre:`);
      if (password === null) return;
      await window.api.wifi.connect(n.ssid, password);
      fillWifiPanel(adapter);
    };
    list.appendChild(row);
  });
}

async function openDetailSheet(adapter) {
  activeSheetAdapter = adapter;
  document.getElementById('sheetGlyph').innerHTML = GLYPHS[adapter.type] || GLYPHS.ethernet;
  document.getElementById('sheetTitle').textContent = adapter.name;
  document.getElementById('sheetSub').textContent = adapter.mac;

  const tabs = document.getElementById('tabs');
  const isWifi = adapter.type === 'wifi';
  tabs.style.display = 'flex';
  document.querySelector('.tabs-line').style.display = 'block';
  tabs.querySelector('.tab[data-panel="wifi"]').style.display = isWifi ? '' : 'none';

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === 'ip'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === 'ip'));

  const [ipCfg, proxyCfg] = await Promise.all([
    window.api.network.getIp(adapter.name),
    window.api.network.getProxy()
  ]);
  fillIpPanel(ipCfg);
  fillProxyPanel(proxyCfg);

  document.getElementById('sheet').classList.add('open');
  document.getElementById('scrim').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheet').classList.remove('open');
  document.getElementById('scrim').classList.remove('open');
  activeSheetAdapter = null;
}

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerScrim').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerScrim').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.panel[data-panel="${tab.dataset.panel}"]`).classList.add('active');
      if (tab.dataset.panel === 'wifi' && activeSheetAdapter) fillWifiPanel(activeSheetAdapter);
    });
  });

  document.querySelector('.sheet-close').addEventListener('click', closeSheet);
  document.getElementById('scrim').addEventListener('click', closeSheet);
  document.querySelector('.icon-btn[title="Menü"]').addEventListener('click', openDrawer);
  document.getElementById('drawerScrim').addEventListener('click', closeDrawer);
  document.querySelector('.drawer .icon-btn').addEventListener('click', closeDrawer);

  const autoSwitch = document.querySelector('.auto-card .switch');
  autoSwitch.addEventListener('click', () => {
    autoSwitch.dataset.on = autoSwitch.dataset.on === 'true' ? 'false' : 'true';
  });

  const searchInput = document.querySelector('.search-box input');
  const filterButtons = document.querySelectorAll('.drawer .segmented button');
  function applyDrawerFilter() {
    const active = document.querySelector('.drawer .segmented button.active');
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

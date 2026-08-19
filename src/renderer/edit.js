const GLYPHS = {
  ethernet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h1M15 7V4a1 1 0 0 0-1-1h-1"/><path d="M7 17v2M17 17v2"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.2 16a6.5 6.5 0 0 1 7.6 0"/><path d="M11.5 19.5h1"/></svg>'
};

const params = new URLSearchParams(window.location.search);
const adapterName = params.get('name') || '';
const adapterType = params.get('type') || 'ethernet';

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

async function fillWifiPanel() {
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
      fillWifiPanel();
    };
    list.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadI18n();
  applyI18n();

  window.api.settings.get().then((s) => {
    if (s.theme !== 'system') document.documentElement.dataset.theme = s.theme;
  });

  document.getElementById('editGlyph').innerHTML = GLYPHS[adapterType] || GLYPHS.ethernet;
  document.getElementById('editTitle').textContent = adapterName;

  const isWifi = adapterType === 'wifi';
  document.querySelector('.tab[data-panel="wifi"]').style.display = isWifi ? '' : 'none';

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.panel[data-panel="${tab.dataset.panel}"]`).classList.add('active');
      if (tab.dataset.panel === 'wifi') fillWifiPanel();
    });
  });

  const [ipCfg, proxyCfg] = await Promise.all([
    window.api.network.getIp(adapterName),
    window.api.network.getProxy()
  ]);
  fillIpPanel(ipCfg);
  fillProxyPanel(proxyCfg);
});

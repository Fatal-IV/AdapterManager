document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

async function init() {
  await loadI18n();
  applyI18n();

  const settings = await window.api.settings.get();
  if (settings.theme !== 'system') document.documentElement.dataset.theme = settings.theme;

  document.querySelectorAll('#themeSwitch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === settings.theme);
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#themeSwitch button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      await window.api.settings.set({ theme: btn.dataset.value });
      document.documentElement.dataset.theme = btn.dataset.value === 'system' ? '' : btn.dataset.value;
    });
  });

  const autostartSwitch = document.getElementById('autostartSwitch');
  autostartSwitch.dataset.on = String(settings.autostart);
  autostartSwitch.addEventListener('click', async () => {
    const next = autostartSwitch.dataset.on !== 'true';
    autostartSwitch.dataset.on = String(next);
    await window.api.settings.set({ autostart: next });
  });

  document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('updateStatus');
    statusEl.textContent = t('settings.checking');
    const update = await window.api.updater.check();
    if (!update) {
      statusEl.textContent = t('settings.upToDate');
      return;
    }
    statusEl.textContent = `${t('settings.updateFound')} ${update.version}`;
    const confirmed = window.confirm(`${t('settings.confirmUpdate')} ${update.version}`);
    if (confirmed) {
      statusEl.textContent = t('settings.installing');
      await window.api.updater.apply(update);
    }
  });
}

init();

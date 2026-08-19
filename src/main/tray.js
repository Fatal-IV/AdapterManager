const { Tray, Menu, app } = require('electron');
const path = require('path');
const { isAutoModeRunning, startAutoMode, stopAutoMode } = require('./autoMode');

let tray = null;

function createTray(mainWindow) {
  tray = new Tray(path.join(__dirname, '../../assets/tray-icon.png'));
  tray.setToolTip('NetworkAdapterManager');
  refreshMenu(mainWindow);
  return tray;
}

function refreshMenu(mainWindow) {
  const menu = Menu.buildFromTemplate([
    {
      label: isAutoModeRunning() ? 'Otomatik Modu Kapat' : 'Otomatik Modu Aç',
      click: () => {
        if (isAutoModeRunning()) stopAutoMode(); else startAutoMode();
        refreshMenu(mainWindow);
      }
    },
    { label: 'Pencereyi Göster', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.exit(0); } }
  ]);
  tray.setContextMenu(menu);
}

module.exports = { createTray };

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { listAdapters, toggleAdapter } = require('./services/adapters');
const { getIpConfig, setIpConfig, getProxyConfig, setProxyConfig } = require('./services/network');
const { scanWifi, connectWifi } = require('./services/wifi');
const { resolveLocale } = require('./services/i18n');
const { getSettings, setSettings } = require('./settings');
const { startAutoMode, stopAutoMode, isAutoModeRunning } = require('./autoMode');
const { createTray } = require('./tray');
const { checkForUpdate, downloadAndInstall } = require('./updater');

ipcMain.handle('updater:check', async () => checkForUpdate());
ipcMain.handle('updater:apply', async (_event, update) => downloadAndInstall(update));

ipcMain.on('app:locale', (event) => {
  event.returnValue = resolveLocale(app.getLocale());
});

ipcMain.handle('settings:get', async () => getSettings());
ipcMain.handle('settings:set', async (_event, partial) => setSettings(partial));

ipcMain.handle('adapters:list', async () => {
  return listAdapters();
});

ipcMain.handle('adapters:toggle', async (_event, { id, enable }) => {
  await toggleAdapter(id, enable);
  return listAdapters();
});

ipcMain.handle('network:getIp', async (_event, id) => getIpConfig(id));
ipcMain.handle('network:setIp', async (_event, { id, config }) => {
  await setIpConfig(id, config);
  return getIpConfig(id);
});

ipcMain.handle('network:getProxy', async () => getProxyConfig());
ipcMain.handle('network:setProxy', async (_event, config) => {
  await setProxyConfig(config);
  return getProxyConfig();
});

ipcMain.handle('wifi:scan', async () => scanWifi());
ipcMain.handle('wifi:connect', async (_event, { ssid, password }) => {
  await connectWifi(ssid, password);
});

ipcMain.handle('autoMode:get', async () => isAutoModeRunning());
ipcMain.handle('autoMode:set', async (_event, enabled) => {
  if (enabled) startAutoMode(); else stopAutoMode();
  setSettings({ autoMode: enabled });
  return isAutoModeRunning();
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray(mainWindow);
    if (getSettings().autoMode) startAutoMode();
  });

  app.on('before-quit', () => { app.isQuitting = true; });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { createWindow };

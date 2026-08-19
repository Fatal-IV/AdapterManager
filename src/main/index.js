const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { listAdapters, toggleAdapter } = require('./services/adapters');
const { getIpConfig, setIpConfig, getProxyConfig, setProxyConfig } = require('./services/network');

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

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { createWindow };

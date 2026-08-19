const { contextBridge, ipcRenderer } = require('electron');

const locale = ipcRenderer.sendSync('app:locale');

contextBridge.exposeInMainWorld('api', {
  locale,
  adapters: {
    list: () => ipcRenderer.invoke('adapters:list'),
    toggle: (id, enable) => ipcRenderer.invoke('adapters:toggle', { id, enable })
  },
  network: {
    getIp: (name) => ipcRenderer.invoke('network:getIp', name),
    setIp: (name, config) => ipcRenderer.invoke('network:setIp', { id: name, config }),
    getProxy: () => ipcRenderer.invoke('network:getProxy'),
    setProxy: (config) => ipcRenderer.invoke('network:setProxy', config)
  },
  wifi: {
    scan: () => ipcRenderer.invoke('wifi:scan'),
    connect: (ssid, password) => ipcRenderer.invoke('wifi:connect', { ssid, password })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial) => ipcRenderer.invoke('settings:set', partial)
  },
  autoMode: {
    get: () => ipcRenderer.invoke('autoMode:get'),
    set: (enabled) => ipcRenderer.invoke('autoMode:set', enabled)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    apply: (update) => ipcRenderer.invoke('updater:apply', update)
  }
});

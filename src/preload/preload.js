const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  adapters: {
    list: () => ipcRenderer.invoke('adapters:list'),
    toggle: (id, enable) => ipcRenderer.invoke('adapters:toggle', { id, enable })
  },
  network: {
    getIp: (name) => ipcRenderer.invoke('network:getIp', name),
    setIp: (name, config) => ipcRenderer.invoke('network:setIp', { id: name, config }),
    getProxy: () => ipcRenderer.invoke('network:getProxy'),
    setProxy: (config) => ipcRenderer.invoke('network:setProxy', config)
  }
});

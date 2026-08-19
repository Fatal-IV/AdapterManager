const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  adapters: {
    list: () => ipcRenderer.invoke('adapters:list'),
    toggle: (id, enable) => ipcRenderer.invoke('adapters:toggle', { id, enable })
  }
});

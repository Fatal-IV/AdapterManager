const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  adapters: {
    list: () => ipcRenderer.invoke('adapters:list')
  }
});

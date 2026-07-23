const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('resourceAPI', {
  getDashboard: () => ipcRenderer.invoke('dashboard:get'),
  listResources: (filters) => ipcRenderer.invoke('resources:list', filters),
  getResource: (id) => ipcRenderer.invoke('resources:get', id),
  saveResource: (payload) => ipcRenderer.invoke('resources:save', payload),
  deleteResource: (id) => ipcRenderer.invoke('resources:delete', id),
  copyText: (value) => ipcRenderer.invoke('clipboard:write', value),
});

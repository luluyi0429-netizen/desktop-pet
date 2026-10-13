const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('textAssistant', {
  get: () => ipcRenderer.invoke('text:get'),
  save: value => ipcRenderer.invoke('text:save', value),
  run: value => ipcRenderer.invoke('text:run', value),
  cancel: () => ipcRenderer.invoke('text:cancel'),
  clear: () => ipcRenderer.invoke('text:clear'),
  clipboard: () => ipcRenderer.invoke('text:clipboard'),
  copy: value => ipcRenderer.invoke('text:copy',value),
  pin: value => ipcRenderer.invoke('text:pin',value),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('text:state', listener); return () => ipcRenderer.removeListener('text:state', listener); }
});

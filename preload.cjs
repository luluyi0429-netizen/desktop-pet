const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopPet', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  getSprites: () => ipcRenderer.invoke('pet:get-sprites'),
  click: () => ipcRenderer.send('pet:click'),
  audioEnded: (id, failed=false) => ipcRenderer.send('pet:audio-ended',id,failed),
  setSpeechSettings: value => ipcRenderer.send('pet:speech-settings',value),
  importVoices: () => ipcRenderer.invoke('pet:voice-import'),
  setMuted: value => ipcRenderer.send('pet:muted',value),
  laowu: () => ipcRenderer.send('pet:laowu'),
  rage: () => ipcRenderer.send('pet:rage'),
  setWalking: value => ipcRenderer.send('pet:walking', value),
  setScale: percent => ipcRenderer.send('pet:scale', percent),
  dragStart: (point, reaction, region) => ipcRenderer.send('pet:drag-start', point, reaction, region),
  dragMove: point => ipcRenderer.send('pet:drag-move', point),
  dragEnd: released => ipcRenderer.send('pet:drag-end', released),
  preview: action => ipcRenderer.send('pet:preview', action),
  openMenu: () => ipcRenderer.send('pet:menu'),
  openTagSettings: () => ipcRenderer.send('pet:link-open'),
  openTextAssistant: () => ipcRenderer.send('pet:text-open'),
  openSite: site => ipcRenderer.send('pet:site-open', site),
  getTagSettings: () => ipcRenderer.invoke('pet:link-get'),
  saveTagSettings: value => ipcRenderer.invoke('pet:link-save', value),
  copyTagPairing: () => ipcRenderer.invoke('pet:link-pair'),
  testTagReaction: text => ipcRenderer.invoke('pet:link-test', text),
  onTagStatus: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('pet:link-status', listener);
    return () => ipcRenderer.removeListener('pet:link-status', listener);
  },
  closeSettings: () => ipcRenderer.send('pet:settings-close'),
  stand: () => ipcRenderer.send('pet:stand'),
  quit: () => ipcRenderer.send('pet:quit'),
  onState: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  }
});

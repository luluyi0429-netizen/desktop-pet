const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ragePlayer',{
  sound:()=>ipcRenderer.invoke('pet:rage-sound'),
  close:()=>ipcRenderer.send('pet:rage-close'),
  onSound:fn=>ipcRenderer.on('pet:rage-sound',(_event,value)=>fn(value))
});

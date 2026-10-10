const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petBubble',{onNotice:callback=>ipcRenderer.on('pet:bubble',(_event,value)=>callback(value))});

const path=require('node:path');
function createRageWindow({BrowserWindow,screen,ipcMain,directory,getOwner,getSound,onOpen=()=>{},onClose=()=>{}}){
  let window=null,lastSound='';
  const valid=event=>window&&!window.isDestroyed()&&event.sender===window.webContents;
  const sound=()=>{const v=getSound();return {muted:!!v.muted,volume:Math.max(0,Math.min(100,v.volume))};};
  const close=event=>{if(valid(event))window.close();};
  const get=event=>valid(event)?sound():null;
  ipcMain.on('pet:rage-close',close);ipcMain.handle('pet:rage-sound',get);
  return {
    active(){return !!window&&!window.isDestroyed();},
    open(){
      if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();return;}
      const owner=getOwner();if(!owner||owner.isDestroyed())return;
      const area=screen.getDisplayMatching(owner.getBounds()).workArea;
      const width=Math.min(760,area.width),height=Math.min(520,area.height);
      onOpen();
      const win=new BrowserWindow({width,height,x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),
        title:'视频',frame:false,show:true,backgroundColor:'#000000',alwaysOnTop:true,autoHideMenuBar:true,
        webPreferences:{preload:path.join(directory,'rage-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,autoplayPolicy:'no-user-gesture-required'}});
      window=win;lastSound='';win.setMenuBarVisibility(false);win.setAlwaysOnTop(true,'screen-saver');
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
      win.on('closed',()=>{if(window===win){window=null;lastSound='';onClose();}});
      win.loadFile(path.join(directory,'rage.html')).catch(()=>{if(!win.isDestroyed())win.close();});
    },
    update(){if(!window||window.isDestroyed())return;const value=sound(),key=JSON.stringify(value);if(lastSound!==key){lastSound=key;window.webContents.send('pet:rage-sound',value);}},
    destroy(){ipcMain.removeListener('pet:rage-close',close);ipcMain.removeHandler('pet:rage-sound');if(window&&!window.isDestroyed())window.destroy();window=null;}
  };
}
module.exports={createRageWindow};

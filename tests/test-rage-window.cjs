const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createRageWindow}=require('../rage-window.cjs');
const ipc=new EventEmitter(),handles=new Map();ipc.handle=(n,fn)=>handles.set(n,fn);ipc.removeHandler=n=>handles.delete(n);
const created=[];let opens=0,closes=0,sound={muted:true,volume:27};
class Window extends EventEmitter {
 constructor(options){super();this.options=options;this.dead=false;this.messages=[];this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=fn=>this.openHandler=fn;this.webContents.send=(n,v)=>this.messages.push([n,v]);created.push(this);}
 isDestroyed(){return this.dead;}isMinimized(){return false;}restore(){}show(){}focus(){}setMenuBarVisibility(){}setAlwaysOnTop(v){this.pinned=v;}
 loadFile(file){this.file=file;return Promise.resolve();}
 close(){this.dead=true;this.emit('closed');}destroy(){this.close();}
}
const owner={isDestroyed:()=>false,getBounds:()=>({x:100,y:300,width:150,height:300})};
const p=createRageWindow({BrowserWindow:Window,screen:{getDisplayMatching:()=>({workArea:{x:-1200,y:0,width:1200,height:900}})},ipcMain:ipc,directory:__dirname,getOwner:()=>owner,getSound:()=>sound,onOpen:()=>opens++,onClose:()=>closes++});
assert(!p.active());p.open();assert(p.active());assert.equal(opens,1);const w=created[0];
assert(w.pinned);assert.equal(w.options.webPreferences.sandbox,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.openHandler().action,'deny');
assert.equal(w.options.frame,false,'Only video, no native title bar');
assert(w.options.x>=-1200&&w.options.x+w.options.width<=0);assert(w.file.endsWith('rage.html'));
const foreign={sender:owner},own={sender:w.webContents};assert.equal(handles.get('pet:rage-sound')(foreign),null);assert.deepEqual(handles.get('pet:rage-sound')(own),sound);
ipc.emit('pet:rage-close',foreign);assert(p.active());p.open();assert.equal(created.length,1,'Only one player');
p.update();p.update();assert.equal(w.messages.length,1);sound={muted:false,volume:43};p.update();assert.deepEqual(w.messages[1][1],sound);
ipc.emit('pet:rage-close',own);assert(!p.active());assert.equal(closes,1);p.open();assert.equal(created.length,2);p.destroy();assert(!p.active());assert.equal(handles.size,0);assert.equal(ipc.listenerCount('pet:rage-close'),0);
console.log(JSON.stringify({oneWindow:true,independentTopmost:true,negativeMonitorPosition:true,sandboxedLocalPage:true,senderValidation:true,volumeAndMuteUpdates:true,closeAndShutdownCleanup:true}));

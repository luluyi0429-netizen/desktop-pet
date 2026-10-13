const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createTextAssistant}=require('../text-assistant.cjs');
const {pathToFileURL}=require('node:url');
async function main(){
 const directory=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pet-text-controller-'));
 const handlers=new Map(),shortcuts=new Map(),windows=[];
 let clipboardReads=0,clipboardText='Explicit clipboard sample',captures=0,requests=0,finishRequest;
 class Window {
  constructor(){this.events={};this.destroyed=false;this.webContents={mainFrame:{url:pathToFileURL(path.join(directory,'text-assistant.html')).href},send(){},isDestroyed:()=>this.destroyed,on(){},setWindowOpenHandler(){}};windows.push(this);}
  isDestroyed(){return this.destroyed;} setAlwaysOnTop(){} isMinimized(){return false;} restore(){} show(){} focus(){} setMenuBarVisibility(){}
  loadFile(){return Promise.resolve();} on(name,fn){this.events[name]=fn;}
  close(){this.destroyed=true;this.events.closed?.();} destroy(){this.close();}
 }
 const controller=createTextAssistant({directory,
  app:{getPath:()=>temporary},BrowserWindow:Window,screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1200,height:1000}})},
  ipcMain:{handle:(n,f)=>handlers.set(n,f),removeHandler:n=>handlers.delete(n)},
  globalShortcut:{register:(n,f)=>{shortcuts.set(n,f);return true;},unregister:n=>shortcuts.delete(n)},
  clipboard:{readText:()=>{clipboardReads++;return clipboardText;},writeText:text=>{clipboardText=text;}},
  safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},
  getOwner:()=>({isDestroyed:()=>false,getBounds:()=>({x:1,y:1,width:100,height:100})}),
  capture:async()=>{captures++;return {ok:true,text:'Selected sample',source:'选中文字'};},
  request:({signal})=>{requests++;return new Promise((resolve,reject)=>{finishRequest=resolve;signal.addEventListener('abort',()=>reject(Error('已取消处理。')),{once:true});});}
 });
 function invoke(name,value){const w=windows.at(-1);return handlers.get(name)({sender:w.webContents,senderFrame:w.webContents.mainFrame},value);}
 try {
  controller.open();await Promise.resolve();assert.equal(clipboardReads,0);assert.equal(requests,0);
  const event={sender:windows[0].webContents,senderFrame:{url:windows[0].webContents.mainFrame.url}};
  assert.equal((await handlers.get('text:clipboard')(event)).ok,false);assert.equal(clipboardReads,0);
  await shortcuts.get('Control+Alt+T')(); assert.equal(captures,1);assert.equal(clipboardReads,0);assert.equal(requests,0);assert.equal(controller.snapshot().text,'Selected sample');
  await invoke('text:save',{endpoint:'https://provider.example/v1',model:'test'});
  const pending=invoke('text:run',{text:'Edited sample',task:'translate'});await Promise.resolve();assert.equal(requests,1);
  assert.equal((await invoke('text:run',{text:'duplicate',task:'explain'})).ok,false);
  assert.equal((await invoke('text:save',{endpoint:'https://other.example/v1',model:'test'})).ok,false);
  finishRequest({text:'Translated result',incomplete:false});assert.equal((await pending).ok,true);
  assert.equal(controller.snapshot().result,'Translated result');await invoke('text:copy');assert.equal(clipboardText,'Translated result');
  const cancelled=invoke('text:run',{text:'cancel me',task:'translate'});await Promise.resolve();await invoke('text:cancel');
  assert.equal((await cancelled).cancelled,true);assert.equal(controller.snapshot().phase,'idle');
  await shortcuts.get('Control+Alt+V')();assert.equal(clipboardReads,1);assert.equal(controller.snapshot().text,'Translated result');
  windows.at(-1).close();assert.equal(controller.snapshot().text,'');assert.equal(controller.snapshot().result,'');
  controller.destroy();controller.destroy();assert.equal(handlers.size,0);assert.equal(shortcuts.size,0);
  console.log(JSON.stringify({explicitSelection:true,noBackgroundClipboardReads:true,noAutomaticSending:true,frameOriginCheck:true,noOverlappingRequests:true,cancelledResponsesDiscarded:true,closeClearsText:true,shutdownUnregistersShortcuts:true}));
 } finally {controller.destroy();fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

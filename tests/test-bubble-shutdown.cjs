const assert=require('node:assert/strict');
const {createBubbleManager}=require('../bubble-window.cjs');
const windows=[];
class Window {
  constructor(){this.events={};this.visible=false;this.destroyed=false;this.shows=0;this.hides=0;this.webContents={on:(n,f)=>this.events[n]=f,setWindowOpenHandler(){},send(){}};windows.push(this);}
  isDestroyed(){return this.destroyed;} isVisible(){return this.visible;}
  setAlwaysOnTop(){} setIgnoreMouseEvents(){} setBounds(){}
  loadFile(){return Promise.resolve();}
  hide(){this.visible=false;this.hides++;}
  showInactive(){assert(!this.destroyed);this.visible=true;this.shows++;}
  destroy(){this.visible=false;this.destroyed=true;}
}
const screen={getDisplayMatching:()=>({workArea:{x:0,y:0,width:1200,height:1000}})};
const state={bounds:{x:600,y:700,width:200,height:220},volume:51,muted:false,audioCue:{id:1,text:'关闭测试',expires:Date.now()+30000}};
const pending=createBubbleManager({BrowserWindow:Window,screen,directory:__dirname});
pending.update(state);const a=windows[0];pending.destroy();
a.events['did-finish-load']();pending.update(state);pending.destroy();
assert(a.isDestroyed());assert.equal(a.shows,0);assert.equal(windows.length,1);
const loaded=createBubbleManager({BrowserWindow:Window,screen,directory:__dirname});
loaded.update(state);const b=windows[1];b.events['did-finish-load']();assert(b.isVisible());
loaded.destroy();loaded.update(state);b.events['did-finish-load']();
assert(b.isDestroyed());assert(!b.isVisible());assert.equal(b.shows,1);assert.equal(windows.length,2);
const quiet=createBubbleManager({BrowserWindow:Window,screen,directory:__dirname});quiet.update(state);
const c=windows[2];c.events['did-finish-load']();quiet.update({...state,audioCue:null});assert.equal(c.hides,1);
for(let i=0;i<300;i++)quiet.update({...state,audioCue:null});assert(!c.isVisible(),'Repeated idle updates must keep the caption hidden');assert.equal(c.shows,1,'Idle updates must never show the caption again');
quiet.destroy();
console.log(JSON.stringify({closeBeforeLoadCannotResurrect:true,closeWhileVisibleRemovesSubtitle:true,lateUpdatesIgnored:true,idempotentDestroy:true,idleCaptionStaysHidden:true}));

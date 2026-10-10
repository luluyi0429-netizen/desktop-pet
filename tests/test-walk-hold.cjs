const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { advanceWalk } = require('../walk-motion.cjs');
let now = 0;
let bounds = { x: 80, y: 0, width: 180, height: 324 };
const area = { x: 0, y: 0, width: 420, height: 700 };
const intervals = new Set();
const handlers = new Map();
const invokes = new Map();
const contents = { send() {}, setWindowOpenHandler() {}, on() {} };
class Window {
  constructor() { this.webContents = contents; }
  getBounds() { return { ...bounds }; }
  setBounds(value) { bounds = { ...value }; }
  setPosition(x,y) {
    assert(Number.isInteger(x) && Number.isInteger(y), 'Electron positions must be integers');
    bounds.x=x; bounds.y=y;
  }
  isDestroyed() { return false; }
  isMinimized() { return false; }
  setAlwaysOnTop() {} setMenuBarVisibility() {} loadFile() {} show() {} moveTop() {}
  once() {} on() {}
}
const electron = {
  app: { getPath:()=>__dirname, disableHardwareAcceleration() {}, requestSingleInstanceLock:()=>true, on() {}, whenReady:()=>({then(fn){fn();}}) },
  BrowserWindow: Window,
  screen: { getPrimaryDisplay:()=>({workArea:area}), getDisplayMatching:()=>({workArea:area}), getCursorScreenPoint:()=>({x:100,y:100}), on() {} },
  ipcMain: { on:(name,fn)=>handlers.set(name,fn), handle:(name,fn)=>invokes.set(name,fn) }
};
const actions=Object.fromEntries(['idle','blink','click','drag','land','sleep','climb','walk-left','walk-right'].map(a=>[a,[{}]]));
actions.click=[{},{},{},{}];
const context={
  require(name) {
    if(name==='./tag-link.cjs')return require('./mock-tag-link.cjs');
    if(name==='./bubble-window.cjs')return {createBubbleManager:()=>({update(){},destroy(){}})};
    if(name==='./voice-library.cjs')return {syncVoiceLibrary:()=>({groups:{}}),createVoicePicker:()=>()=>null};
    if(name==='electron')return electron;
    if(name==='./sprites.cjs')return {loadSprites:()=>({actions,aspect:.6,heightFactor:1})};
    if(name==='./sync-materials.cjs')return {syncMaterials(){}};
    if(name==='./preferences.cjs')return {createPreferences:()=>({read:()=>({height:300,walking:true}),write(){}})};
    if(name==='./tray.cjs')return {createPetTray:()=>({update(){},destroy(){}})};
    if(name==='./explorer-monitor.cjs')return {createExplorerMonitor:()=>({start(){},stop(){},getWindows:()=>[],status:()=>({ready:true})})};
    if(name==='./behavior.cjs') { const behavior=require('../behavior.cjs');return {...behavior,randomBetween:(a,b)=>(a+b)/2}; }
    return require(name.startsWith('./')?path.resolve(__dirname,'..',name):name);
  },
  __dirname:path.resolve(__dirname,'..'),performance:{now:()=>now},
  setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);},
  setTimeout(){return 1;},clearTimeout(){},console, Math: Object.assign(Object.create(Math), { random:()=>.5 })
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.cjs'),'utf8'),context);
const event={sender:contents};
const state=()=>invokes.get('pet:get-state')(event);
const send=(name,...args)=>handlers.get(name)(event,...args);
function tick(seconds){for(let n=0;n<Math.ceil(seconds/.016);n++){now+=16;for(const fn of [...intervals])fn();}}
tick(26);
assert(state().action.startsWith('walk-'));
let turns=0, previous=state().action;
for(let n=0;n<350;n++){
  tick(.016);const s=state();
  assert(s.action.startsWith('walk-'),'No idle interruptions while walking');
  assert(s.bounds.x>=area.x && s.bounds.x+s.bounds.width<=area.width);
  assert.equal(s.bounds.y+s.bounds.height,area.height);
  if(s.action!==previous){turns++;previous=s.action;}
}
assert(turns>=1,'Reverse direction without interrupting the current walk');
send('pet:drag-start',{x:100.4,y:100.8});
const held=state();tick(2);
assert.equal(state().bounds.x,held.bounds.x);assert.equal(state().bounds.y,held.bounds.y);
send('pet:drag-move',{x:110.8,y:-200.4});
const lifted=state();assert.equal(lifted.action,'drag');assert(lifted.pressed);assert(!lifted.falling);
assert.equal(lifted.bounds.x, Math.round(held.bounds.x + 110.8 - 100.4));
assert.equal(lifted.bounds.y, Math.round(held.bounds.y - 200.4 - 100.8));
tick(3);assert.equal(state().bounds.y,lifted.bounds.y);assert.equal(state().bounds.x,lifted.bounds.x);
send('pet:drag-end',true);tick(.2);assert(state().bounds.y>lifted.bounds.y);
tick(8);assert(state().docked);assert.equal(state().bounds.y+state().bounds.height,area.height);
send('pet:drag-start',{x:100,y:100});send('pet:drag-move',{x:120,y:-100});
send('pet:drag-end',false);const cancelled=state();tick(3);assert.equal(state().bounds.y,cancelled.bounds.y);assert(!state().falling);
assert.equal(advanceWalk(11,-1,10,12,1).position,11);
console.log(JSON.stringify({edgeTurns:turns,walkEpisodeUninterrupted:true,holdFreezesMotion:true,holdFreezesGravity:true,releaseFalls:true,cancellationNeverFalls:true}));

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const defaults = require('../behavior.cjs');
const geometry = require('../platforms.cjs');
function harness(random = 0.5, withVoices = false) {
  let now = 0, randomValue = random, frames = [], browser = null, bridgeEvent, copyShortcut, pointer=null,foregroundChange;
  const spoken = [];
  const windows = [], handlers = new Map(), invokes = new Map(), intervals = new Set();
  const area = { x: 0, y: 0, width: 1200, height: 1000 };
  class Window {
    constructor(options) { this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; this.events = {}; this.webContents = { send() {}, setWindowOpenHandler() {}, on() {} }; windows.push(this); }
    getBounds() { return { ...this.bounds }; }
    setBounds(b) { for (const key of ['x','y','width','height']) assert(Number.isInteger(b[key])); this.bounds = { ...b }; }
    setPosition(x,y) { assert(Number.isInteger(x) && Number.isInteger(y), 'Integer native coordinates'); this.bounds.x=x; this.bounds.y=y; }
    isDestroyed() { return false; } isMinimized() { return false; }
    setAlwaysOnTop() {} setMenuBarVisibility() {} loadFile() {} show() {} moveTop() {} focus() {}
    once() {} on(name,fn) { this.events[name]=fn; } close() { this.events.closed?.(); }
  }
  const math = Object.create(Math); math.random = () => randomValue;
  const electron = {
    app: { getPath:()=>__dirname, disableHardwareAcceleration() {}, requestSingleInstanceLock:()=>true, on() {}, whenReady:()=>({then(fn){fn();}}) }, BrowserWindow: Window,
    screen: { getPrimaryDisplay:()=>({workArea:area}), getDisplayMatching:()=>({workArea:area,scaleFactor:1.25}), getDisplayNearestPoint:()=>({workArea:area}), getCursorScreenPoint:()=>({x:100,y:100}), on() {} },
    ipcMain: { on:(name,fn)=>handlers.set(name,fn), handle:(name,fn)=>invokes.set(name,fn) }
  };
  const actions=Object.fromEntries(['sit','idle','blink','click','drag','land','sleep','climb','laowu','walk-left','walk-right'].map(a=>[a,[{}]])); actions.click=[{},{},{},{}];actions.sit=[{},{},{}];
  const context = {
    require(name) {
      if(name==='./tag-link.cjs') return {...require('./mock-tag-link.cjs'),createTagBridge:options=>{
        bridgeEvent=options.onEvent;return {start(){},stop(){},status:()=>({listening:true})};
      },createReactionEngine:options=>require('../tag-link.cjs').createReactionEngine({...options,now:()=>100000+now})};
      if(name==='./bubble-window.cjs') return {createBubbleManager:()=>({update(){},destroy(){}})};
      if(name==='./voice-library.cjs' && !withVoices) return {syncVoiceLibrary:()=>({groups:{}}),createVoicePicker:()=>()=>null};
      if(name==='./copy-voice.cjs') return {createCopyVoice:()=>({speak:text=>spoken.push(text),stop(){}})};
      if(name==='electron') return electron;
      if(name==='./sprites.cjs') return {loadSprites:()=>({actions,aspect:.6,heightFactor:1})};
      if(name==='./sync-materials.cjs') return {syncMaterials(){}};
      if(name==='./preferences.cjs') return {createPreferences:()=>({read:()=>({height:300,walking:true}),write(){}})};
      if(name==='./tray.cjs') return {createPetTray:()=>({update(){},destroy(){}})};
      if(name==='./explorer-monitor.cjs') return {createExplorerMonitor:(s,update,onCopy,onForeground)=>{
        copyShortcut=onCopy;foregroundChange=onForeground;return {start(){},stop(){},getPointer:()=>pointer&&100000+now-pointer.at<700?pointer:null,getWindows:()=>frames,getBrowser:()=>browser,status:()=>({ready:true})};
      }};
      if(name==='./behavior.cjs') return {...defaults,randomBetween:(a,b)=>defaults.randomBetween(a,b,()=>randomValue),randomClick:n=>defaults.randomClick(n,()=>randomValue)};
      return require(name.startsWith('./')?path.resolve(__dirname,'..',name):name);
    }, __dirname:path.resolve(__dirname,'..'),performance:{now:()=>now},Math:math,
    Date:class extends Date {static now(){return 100000+now;}},
    setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);},setTimeout(){return 1;},clearTimeout(){},console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.cjs'),'utf8'),context);
  const event={sender:windows[0].webContents};
  const send=(name,...args)=>handlers.get(name)(event,...args);
  return { area, windows, spoken, receive:e=>bridgeEvent(e), copy:()=>copyShortcut(), browser:value=>{browser=value;}, state:()=>invokes.get('pet:get-state')(event), send,
    tick(seconds){for(let n=0;n<Math.ceil(seconds/.016);n++){now+=16;for(const fn of [...intervals])fn();}},
    frames(value){frames=value;}, random(value){randomValue=value;},pointer(pressed){pointer={pressed,at:100000+now};},foreground(){foregroundChange?.();},
    settings(name,...args){send('pet:menu');const panel=windows.at(-1);handlers.get(name)({sender:panel.webContents},...args);panel.close();}
  };
}
function runRegression() {
const pet=harness();
pet.tick(17);assert(!defaults.isMoving(pet.state().action),'Rest period should exceed old 3.5 second interval');
pet.tick(9);assert(pet.state().action.startsWith('walk-'));
const walkX=pet.state().bounds.x;pet.tick(1);assert(Math.abs(Math.abs(pet.state().bounds.x-walkX)-45)<=1,'Walking speed is 45 DIP/s');
pet.tick(10);assert(!defaults.isMoving(pet.state().action),'Walk must end to allow resting');
pet.tick(55);assert.equal(pet.state().action,'sit');pet.tick(210);assert.equal(pet.state().action,'sleep');const sleeping=pet.state().bounds;pet.tick(30);assert.deepEqual(pet.state().bounds,sleeping);
pet.send('pet:drag-start',{x:100.4,y:100.8},3);assert.equal(pet.state().action,'click');assert.equal(pet.state().clickFrame,3);pet.tick(2);assert.deepEqual(pet.state().bounds,sleeping);
pet.send('pet:drag-move',{x:120.8,y:-200.4});const held=pet.state();pet.tick(3);assert.deepEqual(pet.state().bounds,held.bounds);assert(!pet.state().falling);
pet.send('pet:drag-end',true);pet.tick(.2);assert(pet.state().bounds.y>held.bounds.y);pet.tick(8);assert(pet.state().docked);
pet.random(.01);pet.send('pet:click');assert.equal(pet.state().clickFrame,0);pet.random(.8);pet.send('pet:click');assert.equal(pet.state().clickFrame,3);pet.random(.3);pet.send('pet:click');assert.equal(pet.state().clickFrame,1);
const crawl=harness(.1);crawl.tick(20);assert(crawl.state().action.startsWith('walk-'),'No eligible window falls back to walking');
crawl.settings('pet:walking',false);crawl.tick(35);assert(!defaults.isMoving(crawl.state().action));crawl.settings('pet:preview','climb');assert.equal(crawl.state().climbing,null);assert(crawl.state().notice);
const dock=harness();const frame={id:'explorer',bounds:{x:100,y:400,width:800,height:500},client:{x:100,y:435,width:800,height:465}};dock.frames([frame]);
function dragTo(x,foot) {const b=dock.state().bounds;dock.send('pet:drag-start',{x:100.4,y:100.8});dock.send('pet:drag-move',{x:100.4+x-b.x,y:100.8+foot-b.height-b.y});dock.send('pet:drag-end',true);}
dragTo(300,405);assert.equal(dock.state().support.edge,'top');assert.equal(dock.state().bounds.y+dock.state().bounds.height,400);
const old=dock.state().bounds;frame.bounds.x+=60;frame.bounds.y+=30;frame.client.x+=60;frame.client.y+=30;dock.frames([frame]);dock.tick(.1);assert.equal(dock.state().bounds.x,old.x+60);assert.equal(dock.state().bounds.y,old.y+30);
dock.settings('pet:preview','climb');dock.tick(9);assert(dock.state().bounds.x>=160);assert(dock.state().bounds.x+dock.state().bounds.width<=960);
dragTo(300,920);assert.equal(dock.state().support.edge,'inside');assert.equal(dock.state().bounds.y+dock.state().bounds.height,926);
dock.frames([]);dock.tick(.2);assert(dock.state().support,'Transient missing window keeps support');dock.frames([frame]);dock.tick(.1);assert(dock.state().support,'Window recovers within grace period');
dock.frames([]);dock.tick(.8);assert.equal(dock.state().support,null);dock.tick(8);assert.equal(dock.state().bounds.y+dock.state().bounds.height,1000);
dock.frames([frame]);dragTo(300,350);dock.tick(8);assert.equal(dock.state().support.edge,'top','Falling should land on Explorer edge');
dock.settings('pet:stand');dock.tick(8);assert.equal(dock.state().support,null);assert.equal(dock.state().bounds.y+dock.state().bounds.height,1000);
const negativeArea={x:-1200,y:0,width:1200,height:1000};const neg=geometry.makePlatforms([{id:'other',bounds:{x:-1100,y:450,width:800,height:400},client:{x:-1100,y:480,width:800,height:370}}],negativeArea);
assert.equal(geometry.nearestPlatform(neg,{x:-900,y:126,width:204,height:324},negativeArea,36).edge,'top');
console.log(JSON.stringify({restTiming:true,walkSpeed45:true,autoSit60s:true,autoSleep300s:true,wakeOnClick:true,randomClick:true,fractionalDrag:true,noWindowClimbFallback:true,windowTopAndInside:true,followsWindow:true,windowLossFalls:true,fallingLandsOnFrame:true,forceTaskbar:true,negativeMonitorCoordinates:true}));
}
if (require.main === module) runRegression();
module.exports = { harness };

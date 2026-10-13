const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','input-live-'+Date.now());
fs.mkdirSync(output,{recursive:true});const profile=path.join(output,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:200,walking:false,muted:true}));
const bridge=require('../tag-link.cjs'),create=bridge.createTagBridge;bridge.createTagBridge=o=>create({...o,port:0});
const monitors=require('../explorer-monitor.cjs'),makeMonitor=monitors.createExplorerMonitor;
let physicalOverride,monitor;
monitors.createExplorerMonitor=(...args)=>{monitor=makeMonitor(...args);const get=monitor.getPointer;monitor.realPointer=get;
 monitor.getPointer=()=>physicalOverride===undefined?get():{pressed:physicalOverride,at:Date.now()};return monitor;};
const report={checks:{},errors:[]};let watchdog,done=false;
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(30);}throw Error('Timed out: '+report.stage);}
const find=file=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/'+file));
require('../main.cjs');
app.on('will-quit',()=>{clearTimeout(watchdog);report.passed=done&&report.errors.length===0;save();console.log(JSON.stringify({output,...report}));if(!report.passed)process.exitCode=1;});
app.whenReady().then(async()=>{
 watchdog=setTimeout(()=>{report.errors.push('timeout');save();app.exit(1);},50000);
 try{
  report.stage='ready';const owner=await until(()=>find('desktop_pet.html'));const js=code=>owner.webContents.executeJavaScript(code);
  await until(()=>js('typeof currentState!=="undefined"&&currentState&&pet.complete&&pet.naturalWidth>0'));
  await until(()=>monitor.realPointer());report.checks.nativeMouseSamplerReady=true;
  let topCalls=0;const top=owner.moveTop.bind(owner),setTop=owner.setAlwaysOnTop.bind(owner);
  owner.moveTop=()=>{topCalls++;top();};owner.setAlwaysOnTop=(...args)=>{topCalls++;return setTop(...args);};
  async function down(){physicalOverride=true;const r=await js('pet.getBoundingClientRect().toJSON()');const x=Math.round(r.x+r.width*.5),y=Math.round(r.y+r.height*.4);
   owner.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});await until(async()=>(await js('desktopPet.getState()')).pressed);
   await wait(30);return {x,y};}
  async function up(point){owner.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});physicalOverride=false;
   await until(async()=>!(await js('desktopPet.getState()')).pressed);await until(()=>js('activePointer===null'));}
  report.stage='long hold';let point=await down();const callsBefore=topCalls;await wait(2300);
  assert((await js('desktopPet.getState()')).pressed);assert.equal(topCalls,callsBefore,'No native restacking during long hold');await up(point);report.checks.longHoldAcrossTimers=true;
  report.stage='capture loss';point=await down();await js('document.body.dispatchEvent(new PointerEvent("lostpointercapture",{pointerId:activePointer,bubbles:true}))');await wait(300);
  assert((await js('desktopPet.getState()')).pressed,'Physical hold survives capture loss');
  physicalOverride=undefined;await until(()=>monitor.realPointer()?.pressed===false);
  report.stage='capture loss main recovery';await until(async()=>!(await js('desktopPet.getState()')).pressed);
  report.stage='capture loss renderer recovery';await until(()=>js('activePointer===null'));
  report.checks.captureLossRecoveredFromNativeRelease=true;
  owner.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
  report.stage='foreground and gestures';const b=owner.getBounds();const foreground=new BrowserWindow({x:b.x,y:b.y,width:b.width,height:b.height,show:true,webPreferences:{sandbox:true}});
  await foreground.loadURL('data:text/html,<title>Input recovery test</title>');
  for(let i=0;i<12;i++){
    point=await down();foreground.focus();await wait(110);assert((await js('desktopPet.getState()')).pressed);await up(point);await wait(80);
  }
  foreground.destroy();report.checks.twelveForegroundGestureCycles=true;
  report.stage='missing release while dragged';point=await down();await js('window.dispatchEvent(new PointerEvent("pointermove",{pointerId:activePointer,pointerType:"mouse",buttons:1,screenX:pointerStart.x+20,screenY:pointerStart.y-80}))');
  await until(async()=>(await js('desktopPet.getState()')).action==='drag');physicalOverride=undefined;
  await until(async()=>!(await js('desktopPet.getState()')).pressed);await until(async()=>(await js('desktopPet.getState()')).docked);
  owner.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});report.checks.dragWithoutPointerupLands=true;
  report.stage='next click and menu';point=await down();await up(point);
  owner.webContents.sendInputEvent({type:'mouseDown',...point,button:'right',clickCount:1});owner.webContents.sendInputEvent({type:'mouseUp',...point,button:'right',clickCount:1});
  const settings=await until(()=>find('settings.html'));await until(()=>settings.isVisible());settings.close();report.checks.clickAndRightMenuStillWork=true;
  done=true;delete report.stage;owner.close();
 }catch(error){report.errors.push(error.stack);save();console.error(error);app.quit();}
});

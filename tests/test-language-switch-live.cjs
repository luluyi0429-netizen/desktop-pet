const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','voice-sit-live-'+Date.now());
fs.mkdirSync(output,{recursive:true});const profile=path.join(output,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:180,walking:false,muted:true,volume:1,voiceFrequency:'high',voiceCooldownSeconds:1,voiceLanguage:'zh'}));
const links=require('../tag-link.cjs'),create=links.createTagBridge;links.createTagBridge=o=>create({...o,port:0});
const monitors=require('../explorer-monitor.cjs'),makeMonitor=monitors.createExplorerMonitor;let syntheticHold=false;
monitors.createExplorerMonitor=(...args)=>{const monitor=makeMonitor(...args),get=monitor.getPointer;monitor.getPointer=()=>syntheticHold?{pressed:true,at:Date.now()}:get();return monitor;};
const report={checks:{},errors:[]};let watchdog,done=false;
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await wait(40);}throw Error('Timed out: '+report.stage);}
const find=file=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/'+file));
require('../main.cjs');
app.on('will-quit',()=>{clearTimeout(watchdog);report.passed=done&&report.errors.length===0;save();console.log(JSON.stringify({output,...report}));});
app.whenReady().then(async()=>{
 watchdog=setTimeout(()=>{report.errors.push('timeout');save();app.exit(1);},55000);
 try{
  report.stage='ready';const owner=await until(()=>find('desktop_pet.html'));owner.webContents.setAudioMuted(true);
  const js=code=>owner.webContents.executeJavaScript(code);
  await until(()=>js('typeof currentState!=="undefined"&&currentState&&pet.complete&&pet.naturalWidth>0'));
  owner.webContents.on('console-message',(_event,level,message)=>{if(level>=2)report.errors.push('renderer: '+message);});
  assert.equal((await js('desktopPet.getState()')).voiceLanguage,'ja');report.checks.oldChinesePreferenceMigrates=true;
  report.stage='sit frame manifest';assert.deepEqual(await js('sprites.actions.sit.map(f=>f.file)'),['Sit cross-legged/1.png','Sit cross-legged/2.png','Sit cross-legged/3.png']);
  for(let frame=0;frame<3;frame++){
    report.stage='render sit '+frame;
    await js('render({...currentState,action:"sit",sitFrame:'+frame+'});true');
    await until(()=>js('pet.dataset.file==="Sit cross-legged/'+(frame+1)+'.png"&&pet.complete&&pet.naturalWidth>0'));
    assert(await js('pet.complete&&pet.naturalWidth>0'));fs.writeFileSync(path.join(output,'sit-'+(frame+1)+'.png'),(await owner.webContents.capturePage()).toPNG());
  }
  await js('desktopPet.getState().then(render)');report.checks.threeFramesRender=true;
  async function panel(){await js('desktopPet.openMenu()');const w=await until(()=>find('settings.html'));await until(()=>w.isVisible()&&!w.webContents.isLoadingMainFrame());return w;}
  let w=await panel();assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("[data-language]").length'),0);
  await w.webContents.executeJavaScript('desktopPet.setMuted(false);document.querySelector("[data-action=sit]").click()');await until(()=>w.isDestroyed());
  assert.equal((await js('desktopPet.getState()')).action,'sit');report.checks.noLanguageButtonsSitAvailable=true;
  async function finish(){await js('(async()=>{const s=await desktopPet.getState();if(s.audioCue)desktopPet.audioEnded(s.audioCue.id);})()');await wait(1150);}
  await finish();await js('desktopPet.dragStart({x:100,y:100});desktopPet.dragEnd(true)');
  await until(()=>js('playingAudio&&playingAudio.element.currentTime>.08'));
  assert.equal((await js('desktopPet.getState()')).action,'sit');assert(!(await js('desktopPet.getState()')).audioCue.src.includes('_zh_'));report.checks.seatedJapaneseClick=true;
  await finish();syntheticHold=true;await js('desktopPet.dragStart({x:100,y:100});desktopPet.dragMove({x:110,y:-200})');
  await finish();await js('desktopPet.dragEnd(true)');syntheticHold=false;
  await until(async()=>(await js('desktopPet.getState()')).audioCue?.text==='中国人能飞');
  await until(()=>js('playingAudio&&playingAudio.element.currentTime>.08'));report.checks.retainedFallingAudioPlays=true;
  await until(async()=>(await js('desktopPet.getState()')).docked);report.checks.dragAndLanding=true;
  done=true;delete report.stage;owner.close();
 }catch(error){report.errors.push(error?.stack||String(error));save();console.error(error);app.quit();}
});

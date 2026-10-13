const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','rage-live-'+Date.now());fs.mkdirSync(output,{recursive:true});
const profile=path.join(output,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:240,walking:false,muted:true,volume:27,voiceLanguage:'zh',workbenchSit:true}));
const bridge=require('../tag-link.cjs'),create=bridge.createTagBridge;bridge.createTagBridge=o=>create({...o,port:0});
const report={checks:{},errors:[]};let watchdog,done=false;
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(60);}throw Error('Timed out: '+report.stage);}
const windows=()=>BrowserWindow.getAllWindows();const find=file=>windows().find(w=>w.webContents.getURL().endsWith('/'+file));
require('../main.cjs');
app.on('will-quit',()=>{clearTimeout(watchdog);report.passed=done&&windows().length===0&&report.errors.length===0;save();console.log(JSON.stringify({output,...report}));if(!report.passed)process.exitCode=1;});
app.whenReady().then(async()=>{
 watchdog=setTimeout(()=>{report.errors.push('timeout');save();app.exit(1);},65000);
 try {
  report.stage='pet ready';const owner=await until(()=>find('desktop_pet.html'));await until(()=>!owner.webContents.isLoadingMainFrame());
  const js=code=>owner.webContents.executeJavaScript(code);
  await until(()=>js('typeof currentState!=="undefined"&&currentState&&pet.complete&&pet.naturalWidth>0'));
  const initial=await js('desktopPet.getState()');assert.equal(initial.workbenchSit,false);assert.equal(initial.support,null);
  assert.equal(initial.bounds.y+initial.bounds.height,initial.workArea.y+initial.workArea.height);report.checks.oldSettingsIgnoredAndTaskbar=true;
  await js('desktopPet.openMenu()');const settings=await until(()=>find('settings.html'));await until(()=>!settings.webContents.isLoadingMainFrame());
  const settingsJS=code=>settings.webContents.executeJavaScript(code);
  const ui=await settingsJS('({adjacent:document.getElementById("laowu").nextElementSibling.id,removed:!document.getElementById("workbench-sit"),fall:document.getElementById("fall-voice").checked})');
  assert.equal(ui.adjacent,'rage');assert(ui.removed&&ui.fall);report.checks.newSettingsControls=ui;
  fs.writeFileSync(path.join(output,'settings.png'),(await settings.webContents.capturePage()).toPNG());
  report.stage='video playback';await settingsJS('document.getElementById("rage").click()');
  let videoWindow=await until(()=>find('rage.html'));await until(()=>!videoWindow.webContents.isLoadingMainFrame());
  let vjs=code=>videoWindow.webContents.executeJavaScript(code);
  const media=await until(()=>vjs('(()=>{const v=document.getElementById("video");if(v.error)throw Error("decode error "+v.error.code);return v.readyState>=2&&v.currentTime>0?{width:v.videoWidth,height:v.videoHeight,duration:v.duration,muted:v.muted,volume:v.volume,time:v.currentTime}:null;})()'));
  assert(media.muted);assert.equal(media.volume,.27);assert(media.width>0&&media.duration>0);assert(videoWindow.isAlwaysOnTop());report.checks.videoDecodesAndPlays=media;
  fs.writeFileSync(path.join(output,'video.png'),(await videoWindow.webContents.capturePage()).toPNG());
  assert.equal((await js('desktopPet.getState()')).audioCue,null);await js('desktopPet.click()');assert.equal((await js('desktopPet.getState()')).audioCue,null);report.checks.petAudioSuppressedDuringVideo=true;
  await vjs('document.getElementById("video").muted=false');await wait(80);assert(await vjs('document.getElementById("video").muted'));report.checks.muteCannotBeOverridden=true;
  ipcMain.emit('pet:rage-close',{sender:owner.webContents});assert(!videoWindow.isDestroyed());report.checks.foreignCloseDenied=true;
  videoWindow.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'});await until(()=>!find('rage.html'));report.checks.escapeCloses=true;
  await js('desktopPet.openMenu()');const panel=await until(()=>find('settings.html'));await until(()=>!panel.webContents.isLoadingMainFrame());
  await panel.webContents.executeJavaScript('desktopPet.rage()');videoWindow=await until(()=>find('rage.html'));await until(()=>!videoWindow.webContents.isLoadingMainFrame());vjs=code=>videoWindow.webContents.executeJavaScript(code);
  await until(()=>vjs('document.getElementById("video").readyState>=2'));
  await vjs('document.getElementById("video").currentTime=document.getElementById("video").duration-.1');await until(()=>!find('rage.html'));report.checks.actualEndCloses=true;
  const clips=Object.values(require('../assets/audio/voices/manifest.json').groups).flat().map(c=>c.src);clips.push('assets/audio/laowu.aac');
  report.stage='audio decoding';report.checks.decodedAudio=await js('(async()=>{const paths='+JSON.stringify(clips)+';for(const src of paths){await new Promise((resolve,reject)=>{const a=new Audio(src);a.volume=0;const timeout=setTimeout(()=>reject(Error(src+" timeout")),5000);a.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};a.onerror=()=>{clearTimeout(timeout);reject(Error(src+" decode"));};});}return paths.length;})()');
  assert.equal(report.checks.decodedAudio,clips.length);done=true;delete report.stage;owner.close();
 }catch(e){report.errors.push(e.stack);save();console.error(e);app.quit();}
});

// Developer-only test: controls an isolated packaged process over a loopback inspector.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),build=JSON.parse(fs.readFileSync(path.join(root,'release/latest-build.json')));
const output=path.join(root,'.local','portable-test-'+Date.now());fs.mkdirSync(output,{recursive:true});
const report={checks:{},errors:[]},reportFile=path.join(output,'result.json');
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await wait(80);}throw Error('Timed out');}
async function run(){
 const zip=path.join(root,'release',build.zip),extract=path.join(output,'解压 验证');
 const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const psScript=path.join(output,'extract.ps1');
 fs.writeFileSync(psScript,"\uFEFFparam([string]$Zip,[string]$Output)\n$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::ExtractToDirectory($Zip,$Output)\n");
 const extraction=spawnSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',psScript,'-Zip',zip,'-Output',extract],{windowsHide:true,encoding:'utf8'});
 assert.equal(extraction.status,0,extraction.stderr);
 const folder=path.join(extract,build.folder),exe=path.join(folder,'桌宠.exe');
 const crypto=require('node:crypto');
 for(const line of fs.readFileSync(path.join(folder,'files.sha256'),'utf8').trim().split('\n')){
  const [hash,relative]=line.split('  ');assert(relative&&!relative.includes('..'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,relative))).digest('hex'),hash,relative);
 }
 report.checks.extractedZipHashesMatch=true;
 const profile=path.join(output,'profile');fs.mkdirSync(profile);
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:168,walking:false,muted:true,volume:51,voiceFrequency:'normal',voiceCooldownSeconds:1}));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const env={...process.env};
 for(const key of Object.keys(env))if(['path','node_options','electron_run_as_node'].includes(key.toLowerCase()))delete env[key];
 env.PATH=path.join(process.env.SystemRoot,'System32')+';'+process.env.SystemRoot;
 child=spawn(exe,['--inspect-brk=127.0.0.1:'+port],{cwd:folder,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>fs.appendFileSync(path.join(output,'stdout.log'),d));
 child.stderr.on('data',d=>fs.appendFileSync(path.join(output,'stderr.log'),d));
 child.on('error',e=>report.errors.push(e.message));
 const target=await until(async()=>{try{return (await (await fetch('http://127.0.0.1:'+port+'/json/list')).json())[0];}catch{return null;}});
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let serial=0,paused;const pending=new Map();
 socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(p.method+': '+msg.error.message)):p.resolve(msg.result);}}
  else if(msg.method==='Debugger.paused')paused=msg.params;};
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,method});socket.send(JSON.stringify({id,method,params}));});}
 await send('Debugger.enable');await send('Runtime.runIfWaitingForDebugger');
 await until(()=>paused);
 report.checks.entryFrame=paused.callFrames[0].functionName;
 const setup=await send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:
  '(()=>{const e=require("electron");e.app.setPath("userData",'+JSON.stringify(profile)+');globalThis.__portableTest=e;const links=require("./tag-link.cjs"),create=links.createTagBridge;links.createTagBridge=o=>create({...o,port:0});return {packaged:e.app.isPackaged,path:e.app.getAppPath()};})()',returnByValue:true});
 if(setup.exceptionDetails)throw Error(JSON.stringify(setup.exceptionDetails));
 assert.equal(setup.result.value.packaged,true);assert.equal(setup.result.value.path,path.join(folder,'resources','app'));
 report.checks.packagedAppPathConfirmed=true;save();
 await send('Debugger.resume');
 async function evaluate(expression){
  report.stage=expression.slice(0,180);save();
  // Electron 32's Node inspector can collect its internal awaitPromise wrapper.
  // Poll a rooted result instead, allowing the app event loop to settle IPC.
  const r=await send('Runtime.evaluate',{expression:'globalThis.__portableResult={done:false};globalThis.__portablePending=Promise.resolve(('+expression+')).then(value=>{globalThis.__portableResult={done:true,value};},error=>{globalThis.__portableResult={done:true,error:String(error.stack||error)};});true',returnByValue:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
  const result=await until(async()=>{const state=await send('Runtime.evaluate',{expression:'globalThis.__portableResult',returnByValue:true});if(state.exceptionDetails)throw Error(JSON.stringify(state.exceptionDetails));return state.result.value?.done?state.result.value:null;},20000);
  if(result.error)throw Error(result.error);return result.value;
 }
 await until(()=>evaluate('(()=>{const e=globalThis.__portableTest;return e.app.isReady()&&e.BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith("/desktop_pet.html"));})()'));
 const get='globalThis.__portableTest.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith("/desktop_pet.html"))';
 await until(()=>evaluate('(()=>{const w='+get+';return w&&!w.webContents.isLoadingMainFrame();})()'));
 const renderer=code=>evaluate(get+'.webContents.executeJavaScript('+JSON.stringify(code)+')');
 await until(()=>renderer('typeof currentState!=="undefined"&&currentState&&typeof sprites!=="undefined"&&sprites&&pet.complete&&pet.naturalWidth>0'));
 report.checks.realPackagedExeWithNoNodeOnPath=true;
 const state=await renderer('desktopPet.getState()');assert.equal(state.height,168);assert.equal(state.muted,true);
 await until(async()=>(await renderer('desktopPet.getState()')).explorer.ready);
 report.checks.win32MonitorReady=true;
 report.checks.renderedSprite=await renderer('({width:pet.naturalWidth,action:pet.dataset.action})');
 const screenshot=await evaluate(get+'.webContents.capturePage().then(img=>img.toPNG().toString("base64"))');
 fs.writeFileSync(path.join(output,'pet.png'),Buffer.from(screenshot,'base64'));
 const clips=Object.values(JSON.parse(fs.readFileSync(path.join(folder,'resources/app/assets/audio/voices/manifest.json'))).groups).flat().map(c=>c.src);
 clips.push('assets/audio/laowu.aac');
 const media=await renderer('(async()=>{const paths='+JSON.stringify(clips)+';for(const src of paths){await new Promise((resolve,reject)=>{const a=new Audio(src);a.volume=0;const t=setTimeout(()=>reject(Error(src+" timeout")),5000);a.onloadedmetadata=()=>{clearTimeout(t);Number.isFinite(a.duration)&&a.duration>0?resolve():reject(Error(src+" duration"));};a.onerror=()=>{clearTimeout(t);reject(Error(src+" decode"));};});}return paths.length;})()');
 assert.equal(media,clips.length);report.checks.audioFilesDecoded=media;
 await renderer('desktopPet.openTagSettings()');
 await until(()=>evaluate('globalThis.__portableTest.BrowserWindow.getAllWindows().some(w=>w.isVisible()&&w.webContents.getURL().endsWith("/tag-settings.html"))'));
 report.checks.tagSettingsOpen=true;
 await evaluate('globalThis.__portableTest.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith("/tag-settings.html")).webContents.executeJavaScript("desktopPet.getTagSettings()").then(s=>({ready:s.status.listening}))').then(s=>assert(s.ready));
 report.checks.tagServiceListening=true;
 await renderer('desktopPet.openTextAssistant()');
 const textWindow='globalThis.__portableTest.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith("/text-assistant.html"))';
 await until(()=>evaluate('(()=>{const w='+textWindow+';return w&&w.isVisible()&&!w.webContents.isLoadingMainFrame();})()'));
 const assistant=await evaluate(textWindow+'.webContents.executeJavaScript("textAssistant.get()")');
 assert.equal(assistant.text,'');assert.equal(assistant.config.endpoint,'');assert.equal(assistant.maxText,8000);
 report.checks.textAssistantPackagedAndReady=true;
 const controls=await evaluate(textWindow+'.webContents.executeJavaScript(\'({tasks:document.querySelectorAll("[data-task]").length,save:!!document.getElementById("save"),source:!!document.getElementById("source")})\')');
 assert.equal(controls.tasks,2);assert(controls.save&&controls.source);
 report.checks.translationAndFilterVisible=true;
 const assistantImage=await evaluate(textWindow+'.webContents.capturePage().then(img=>img.toPNG().toString("base64"))');
 fs.writeFileSync(path.join(output,'text-assistant.png'),Buffer.from(assistantImage,'base64'));
 await evaluate('globalThis.__portableTest.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith("/text-assistant.html")||w.webContents.getURL().endsWith("/tag-settings.html")).forEach(w=>w.close())');
 await evaluate(get+'.webContents.setAudioMuted(true)');
 await renderer('desktopPet.openMenu()');
 const settingsWindow='globalThis.__portableTest.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith("/settings.html"))';
 await until(()=>evaluate('(()=>{const w='+settingsWindow+';return w&&w.isVisible()&&!w.webContents.isLoadingMainFrame();})()'));
 assert.equal(await evaluate(settingsWindow+'.webContents.executeJavaScript(\'document.querySelectorAll("[data-language]").length\')'),0);
 await evaluate(settingsWindow+'.webContents.executeJavaScript(\'desktopPet.setMuted(false);desktopPet.setSpeechSettings({voiceFrequency:"high"});desktopPet.closeSettings()\')');
 await until(()=>evaluate('!('+settingsWindow+')'));
 assert.equal((await renderer('desktopPet.getState()')).voiceLanguage,'ja');
 assert.deepEqual(await renderer('sprites.actions.sit.map(f=>f.file)'),['Sit cross-legged/1.png','Sit cross-legged/2.png','Sit cross-legged/3.png']);
 await renderer('desktopPet.dragStart({x:100,y:100});desktopPet.dragEnd(true)');
 await until(async()=>Boolean((await renderer('desktopPet.getState()')).audioCue));
 assert(!(await renderer('desktopPet.getState()')).audioCue.src.includes('_zh_'));
 await until(()=>renderer('playingAudio&&playingAudio.element.currentTime>.08'));
 report.checks.packagedJapanesePlaybackAndThreeSitFrames=true;
 // Disconnect immediately after dispatch so the debugger cannot delay Node exit.
 await evaluate('(()=>{setTimeout(()=>{const w='+get+';if(w)w.close();},150);return true;})()');
 socket.close();socket=null;
 await until(()=>child.exitCode!==null,10000);assert.equal(child.exitCode,0);
 report.checks.cleanExit=true;delete report.stage;report.passed=true;save();console.log(JSON.stringify({report:reportFile,...report}));
}
const watchdog=setTimeout(()=>{report.error='Test deadline exceeded';save();if(child&&child.exitCode===null)child.kill();process.exit(1);},90000);
run().catch(e=>{report.error=e.stack;save();console.error(e);process.exitCode=1;})
 .finally(()=>{clearTimeout(watchdog);if(socket)socket.close();if(child&&child.exitCode===null)child.kill();save();});

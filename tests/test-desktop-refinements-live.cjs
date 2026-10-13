const {app,BrowserWindow,ipcMain,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','refinements-live-'+Date.now());
fs.mkdirSync(output,{recursive:true});const profile=path.join(output,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:240,walking:false,muted:true,voiceLanguage:'zh'}));
const bridge=require('../tag-link.cjs'),create=bridge.createTagBridge;bridge.createTagBridge=o=>create({...o,port:0});
const opened=[];shell.openExternal=async url=>{opened.push(url);};
const report={checks:{},errors:[]};let watchdog,done=false;
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(60);}throw Error('Timed out: '+report.stage);}
const find=file=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/'+file));
require('../main.cjs');
app.on('will-quit',()=>{clearTimeout(watchdog);report.passed=done&&report.errors.length===0;save();console.log(JSON.stringify({output,...report}));if(!report.passed)process.exitCode=1;});
app.whenReady().then(async()=>{
 watchdog=setTimeout(()=>{report.errors.push('timeout');save();app.exit(1);},45000);
 try{
  report.stage='pet ready';const owner=await until(()=>find('desktop_pet.html'));const js=code=>owner.webContents.executeJavaScript(code);
  await until(()=>js('typeof currentState!=="undefined"&&currentState&&pet.complete&&pet.naturalWidth>0'));
  // Model browser activation with a focused, overlapping Chromium window.
  const b=owner.getBounds();const browser=new BrowserWindow({x:b.x,y:b.y,width:b.width+50,height:b.height,show:true,backgroundColor:'#ffffff',webPreferences:{sandbox:true}});
  await browser.loadURL('data:text/html,<title>Foreground test</title><p>Window overlap test</p>');
  owner.setAlwaysOnTop(false);browser.focus();await wait(1500);
  assert(owner.isAlwaysOnTop());assert.equal(BrowserWindow.getFocusedWindow(),browser,'Pet never takes keyboard focus');
  report.checks.topmostRestoredAfterForegroundWindow=true;report.checks.noFocusStealing=true;browser.destroy();
  async function menu(){await js('desktopPet.openMenu()');const panel=await until(()=>find('settings.html'));await until(()=>!panel.webContents.isLoadingMainFrame());return panel;}
  let panel=await menu();let ui=await panel.webContents.executeJavaScript('({heading:document.querySelector("#teleport-title").textContent,sites:[...document.querySelectorAll("[data-site]")].map(b=>b.textContent)})');
  assert.equal(ui.heading,'一键传送');assert.deepEqual(ui.sites,['Civitai','Danbooru']);
  await panel.webContents.executeJavaScript('document.querySelector("#teleport-title").scrollIntoView({block:"center"})');
  fs.writeFileSync(path.join(output,'menu-bottom.png'),(await panel.webContents.capturePage()).toPNG());
  ipcMain.emit('pet:site-open',{sender:owner.webContents},'civitai');assert.equal(opened.length,0);
  ipcMain.emit('pet:site-open',{sender:panel.webContents},'https://invalid.example/');assert.equal(opened.length,0);
  await panel.webContents.executeJavaScript('document.querySelector("[data-site=civitai]").click()');await until(()=>opened.length===1);
  panel=await menu();await panel.webContents.executeJavaScript('document.querySelector("[data-site=danbooru]").click()');await until(()=>opened.length===2);
  assert.deepEqual(opened,['https://civitai.red/','https://danbooru.donmai.us/']);report.checks.menuSitesAndSenderValidation=true;
  panel=await menu();await panel.webContents.executeJavaScript('document.querySelector("[data-action=sit]").click()');await until(async()=>(await js('desktopPet.getState()')).action==='sit');
  const before=await js('({src:pet.dataset.file,frame:currentState.sitFrame,rect:pet.getBoundingClientRect().toJSON()})');
  await wait(1600);assert.equal(await js('pet.dataset.file'),before.src,'Sitting frame stays stable');
  const bounds=owner.getBounds();assert(Math.abs(before.rect.bottom-bounds.height)<2);assert(before.rect.width>0&&before.rect.height>0);
  fs.writeFileSync(path.join(output,'sitting.png'),(await owner.webContents.capturePage()).toPNG());
  await js('desktopPet.dragStart({x:100,y:100});desktopPet.dragEnd(true)');await wait(600);assert.equal((await js('desktopPet.getState()')).action,'sit');report.checks.stableSeatedClickAndFootAnchor=true;
  await js('desktopPet.openTextAssistant()');const text=await until(()=>find('text-assistant.html'));await until(()=>!text.webContents.isLoadingMainFrame());
  assert.equal(await text.webContents.executeJavaScript('document.querySelectorAll("[data-site],.site-shortcuts").length'),0);report.checks.noSitesInTextAssistant=true;
  text.close();done=true;delete report.stage;owner.close();
 }catch(error){report.errors.push(error.stack);save();console.error(error);app.quit();}
});

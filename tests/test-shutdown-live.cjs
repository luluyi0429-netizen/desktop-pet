const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mode = process.env.PET_SHUTDOWN_MODE || 'native';
if (!['native', 'menu'].includes(mode)) throw Error('Unsupported mode');
const output = path.join(__dirname,'..','.local');
fs.mkdirSync(output,{recursive:true});
const profile = fs.mkdtempSync(path.join(output, 'shutdown-profile-'));
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ height:168, walking:false, muted:true, volume:51, voiceFrequency:'normal', voiceCooldownSeconds:1 }));
const report = { mode, checks:{}, calls:{bubble:0, monitor:0, bridge:0}, errors:[] };
const reportFile = path.join(output, 'shutdown-live-'+mode+'.json');
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report,null,2));
const wait = ms => new Promise(r=>setTimeout(r,ms));
let bubbleWindow, owner, watchdog;
const bubble = require('../bubble-window.cjs'), originalBubble = bubble.createBubbleManager;
bubble.createBubbleManager = options => {
  const manager = originalBubble(options);
  return {
    // Show a deterministic subtitle without producing audio or changing settings.
    update(state) { manager.update({...state, muted:false, volume:1, audioCue:{id:1,text:'关闭清理测试',expires:Date.now()+30000}}); },
    destroy() { report.calls.bubble++; manager.destroy(); }
  };
};
const monitor = require('../explorer-monitor.cjs'), originalMonitor = monitor.createExplorerMonitor;
monitor.createExplorerMonitor = (...args) => {
  const instance = originalMonitor(...args), stop = instance.stop;
  instance.stop = () => { report.calls.monitor++; stop(); };
  return instance;
};
const tags = require('../tag-link.cjs'), originalBridge = tags.createTagBridge;
tags.createTagBridge = options => {
  const instance = originalBridge({...options,port:0}), stop = instance.stop;
  instance.stop = () => { report.calls.bridge++; stop(); };
  return instance;
};
app.on('browser-window-created', (_event,w) => {
  w.webContents.on('console-message', (_ev,level,message) => { if(level>=3) report.errors.push(message); });
});
process.on('uncaughtException',e=>{report.error=e.stack;save();app.exit(1);});
process.on('unhandledRejection',e=>{report.error=String(e?.stack||e);save();app.exit(1);});
require('../main.cjs');
app.on('will-quit', () => {
  clearTimeout(watchdog);
  try {
    assert(report.checks.visibleSubtitleBeforeClose);
    assert.equal(BrowserWindow.getAllWindows().length,0);
    assert(bubbleWindow.isDestroyed());
    assert(owner.isDestroyed());
    assert.deepEqual(report.calls,{bubble:1,monitor:1,bridge:1});
    assert.deepEqual(report.errors,[]);
    report.checks.noWindowsRemain = true;
    report.checks.cleanupExactlyOnce = true;
    report.passed = true;
  } catch(e) { report.error ||= e.stack; }
  save();
});
app.whenReady().then(async()=>{
  watchdog = setTimeout(()=>{report.error='Shutdown timed out';save();app.exit(1);},20000);
  async function until(check,ms=10000) {
    const end=Date.now()+ms;
    while(Date.now()<end){if(await check())return;await wait(35);}
    throw Error('Condition timed out');
  }
  try {
    await until(()=>{owner=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('desktop_pet.html'));return owner;});
    owner.setIgnoreMouseEvents(true);
    await until(()=>owner.webContents.executeJavaScript('typeof currentState!=="undefined"&&currentState&&typeof sprites!=="undefined"&&sprites&&pet.complete'));
    await until(()=>{bubbleWindow=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('bubble.html'));return bubbleWindow?.isVisible();});
    report.checks.visibleSubtitleBeforeClose = true;
    await owner.webContents.executeJavaScript('desktopPet.openTagSettings()');
    let link;
    await until(()=>{link=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('tag-settings.html'));return link?.isVisible();});
    report.checks.tagSettingsOpenBeforeClose = true;
    save();
    if(mode==='native') owner.close();
    else {
      // Remove test-created focus competition before opening the transient menu.
      link.close();
      await owner.webContents.executeJavaScript('desktopPet.openMenu()');
      let settings;
      await until(()=>{settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/settings.html'));return settings?.isVisible();});
      report.checks.settingsReadyForQuit=true;save();
      await settings.webContents.executeJavaScript('desktopPet.quit()');
    }
  }catch(e){report.error=e.stack;save();app.exit(1);}
});

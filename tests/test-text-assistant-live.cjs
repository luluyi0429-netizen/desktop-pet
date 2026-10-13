// Explicit live test. Uses a temporary profile and a local fixture API only.
const {app,BrowserWindow,globalShortcut}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.local','text-live-'+Date.now());fs.mkdirSync(output,{recursive:true});
const profile=path.join(output,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({height:168,walking:false,muted:true}));
const report={checks:{},errors:[]};
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await wait(60);}throw Error('Timed out');}
process.on('uncaughtException',e=>{report.errors.push(e.stack);save();app.exit(1);});process.on('unhandledRejection',e=>{report.errors.push(String(e?.stack||e));save();app.exit(1);});
const registered=[];const originalRegister=globalShortcut.register.bind(globalShortcut);
globalShortcut.register=(key,fn)=>{const ok=originalRegister(key,fn);if(ok)registered.push(key);return ok;};
const bridge=require('../tag-link.cjs'),originalBridge=bridge.createTagBridge;
bridge.createTagBridge=options=>originalBridge({...options,port:0});
let panel,owner,server,fixture,watchdog,closed=false;const requests=[];
app.on('browser-window-created',(_event,window)=>window.webContents.on('console-message',(_ev,level,message)=>{if(level>=3)report.errors.push(message);}));
require('../main.cjs');
app.on('will-quit',()=>{
 clearTimeout(watchdog);if(fixture&&fixture.exitCode===null)fixture.kill();server?.closeAllConnections();server?.close();
 if(closed){report.checks.allWindowsClosed=BrowserWindow.getAllWindows().length===0;report.checks.shortcutsReleased=registered.every(key=>!globalShortcut.isRegistered(key));report.passed=report.checks.allWindowsClosed&&report.checks.shortcutsReleased&&report.errors.length===0;}
 save();console.log(JSON.stringify({output,...report}));if(!report.passed)process.exitCode=1;
});
app.whenReady().then(async()=>{
 watchdog=setTimeout(()=>{report.error='Live test timeout';save();app.exit(1);},60000);
 try {
  server=http.createServer((req,res)=>{let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{const body=JSON.parse(raw);requests.push({body,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'这是本地测试结果。\n<script>window.testInjection=true</script>'},finish_reason:'stop'}]}));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  owner=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/desktop_pet.html')));
  await until(()=>!owner.webContents.isLoadingMainFrame());owner.setIgnoreMouseEvents(true);
  await owner.webContents.executeJavaScript('desktopPet.openTextAssistant()');
  panel=await until(()=>BrowserWindow.getAllWindows().find(w=>w.isVisible()&&w.webContents.getURL().endsWith('/text-assistant.html')));
  const js=code=>panel.webContents.executeJavaScript(code);
  assert.equal((await js('textAssistant.get()')).text,'');assert.equal(requests.length,0);
  report.checks.panelOpensWithoutReadingOrSending=true;
  assert(panel.isAlwaysOnTop());assert(owner.isAlwaysOnTop());assert.equal(panel.getParentWindow(),null);
  await js('textAssistant.pin(false)');assert(!panel.isAlwaysOnTop());await js('textAssistant.pin(true)');assert(panel.isAlwaysOnTop());report.checks.independentPinAndPetTopmost=true;
  const sample='<lora:sample:0.7>\nmasterpiece, best quality, blue hair, sky\nShe is sitting by the window, while warm sunlight fills the room.\nNegative prompt: low quality, blurry';
  await js('document.getElementById("source").value='+JSON.stringify(sample)+';document.querySelector("[data-task=filter]").click();document.getElementById("run").click();');
  await until(async()=>(await js('textAssistant.get()')).phase==='done');assert.equal(requests.length,0);
  assert(await js('!document.getElementById("filter-panel").hidden&&!document.getElementById("result").textContent.includes("<lora")'));
  await js('document.getElementById("new-prompt").value="soft background";document.getElementById("add-prompt").requestSubmit()');
  assert(await js('document.getElementById("result").textContent.includes("soft background")'));
  report.checks.localFilterWithoutAPIAndCustomTags=true;
  await js('document.getElementById("configuration").open=false');
  fs.writeFileSync(path.join(output,'filter-panel.png'),(await panel.webContents.capturePage()).toPNG());
  const spriteFrames=await owner.webContents.executeJavaScript('desktopPet.getSprites().then(s=>s.actions.sit.map(f=>({width:f.width,height:f.height,file:f.file})))');
  assert.equal(spriteFrames.length,5);assert(spriteFrames.every(f=>f.height>0&&f.height<1.5&&f.width<1.5));report.checks.fiveSittingFrames=spriteFrames;
  const sprites=require('../sprites.cjs').loadSprites();
  fs.writeFileSync(path.join(output,'sitting.png'),require('electron').nativeImage.createFromDataURL(sprites.actions.sit[0].image).toPNG());
  await js('textAssistant.clear()');
  const saved=await js('textAssistant.save('+JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port+'/v1',model:'fixture-model',apiKey:'live-fixture-secret'})+')');assert(saved.ok);
  assert(!JSON.stringify(saved).includes('live-fixture-secret'));
  assert(!fs.readFileSync(path.join(profile,'text-assistant.json'),'utf8').includes('live-fixture-secret'));report.checks.realSafeStorageEncryption=true;
  // Exercise the actual UI form and handlers, with synthetic text only.
  await js('document.getElementById("source").value="Only this synthetic text is sent.";document.getElementById("source").dispatchEvent(new Event("input"));document.querySelector("[data-task=translate]").click();document.getElementById("run").click();');
  await until(async()=>(await js('textAssistant.get()')).phase==='done');
  assert.equal(requests.length,1);assert.equal(requests[0].authorization,'Bearer live-fixture-secret');assert.equal(requests[0].body.messages[1].content,'Only this synthetic text is sent.');
  assert(await js('document.getElementById("result").textContent.includes("<script>")&&!window.testInjection'));report.checks.realUIToLocalAPI=true;report.checks.resultRenderedAsText=true;
  await js('document.getElementById("configuration").open=false');
  fs.writeFileSync(path.join(output,'text-panel.png'),(await panel.webContents.capturePage()).toPNG());
  await js('textAssistant.clear()');assert.equal((await js('textAssistant.get()')).text,'');assert.equal((await js('textAssistant.get()')).result,'');report.checks.clearWorks=true;
  const denied=await owner.webContents.executeJavaScript('desktopPet.getState()');assert(denied);
  // A self-owned WPF selection fixture verifies UI Automation without reading user documents.
  const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const psFile=path.join(output,'selection-fixture.ps1');
  fs.writeFileSync(psFile,'\uFEFF'+[
   '$ErrorActionPreference="Stop"',
   'Add-Type -AssemblyName PresentationFramework',
   'Add-Type -TypeDefinition @\'',
   'using System; using System.Runtime.InteropServices; public class FixtureFocus {',
   '[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,IntPtr p);',
   '[DllImport("kernel32.dll")] static extern uint GetCurrentThreadId(); [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool on);',
   '[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
   'public static bool Activate(IntPtr h) { var a=GetCurrentThreadId();var b=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero);bool attached=a!=b&&AttachThreadInput(a,b,true);try {SetForegroundWindow(h);return GetForegroundWindow()==h;}finally{if(attached)AttachThreadInput(a,b,false);}}}',
   '\'@',
   '$w=New-Object Windows.Window; $w.Title="桌宠选区测试（自动关闭）"; $w.Width=480; $w.Height=170; $w.Topmost=$true',
   '$t=New-Object Windows.Controls.TextBox; $t.Text="Synthetic SELECTED fixture"; $t.FontSize=20; $t.Margin="20"; $w.Content=$t',
   '$w.Add_ContentRendered({$handle=(New-Object Windows.Interop.WindowInteropHelper($w)).Handle; $active=[FixtureFocus]::Activate($handle); $t.Focus() | Out-Null; [Windows.Input.Keyboard]::Focus($t) | Out-Null; $t.Select(10,8); [Console]::WriteLine("READY "+$active+" "+$t.SelectedText); [Console]::Out.Flush()})',
   '[void]$w.ShowDialog()'
  ].join('\n'));
  panel.hide();
  fixture=spawn(ps,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',psFile],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let ready=false;fixture.stdout.on('data',d=>{report.fixture={pid:fixture.pid,output:d.toString()};if(d.toString().includes('READY'))ready=true;});fixture.stderr.on('data',()=>{});
  await until(()=>ready);
  const capture=await require('../selection-capture.cjs').captureSelection({expectedProcessId:fixture.pid});
  assert(capture.ok,capture.error);assert.equal(capture.text,'SELECTED');report.checks.nativeSelectedTextOnly=true;
  fixture.kill();await until(()=>fixture.exitCode!==null||fixture.signalCode!==null);fixture=null;
  panel.show();panel.close();await until(()=>!BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith('/text-assistant.html')));
  await owner.webContents.executeJavaScript('desktopPet.openTextAssistant()');
  panel=await until(()=>BrowserWindow.getAllWindows().find(w=>w.isVisible()&&w.webContents.getURL().endsWith('/text-assistant.html')));
  const reopened=await panel.webContents.executeJavaScript('textAssistant.get()');assert.equal(reopened.text,'');assert(reopened.config.hasKey);report.checks.reopenClearsTextKeepsSettings=true;
  closed=true;owner.close();
 }catch(error){report.error=error.stack;report.windows=BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),visible:w.isVisible(),title:w.getTitle()}));save();if(fixture&&fixture.exitCode===null)fixture.kill();server?.closeAllConnections();server?.close();app.exit(1);}
});

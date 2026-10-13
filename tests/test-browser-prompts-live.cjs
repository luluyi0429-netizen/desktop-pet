// Isolated local fixture: never reads the user's browser, clipboard or pairing key.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','browser-prompts-'+Date.now());fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));app.disableHardwareAcceleration();
let server,window;const report={checks:{},errors:[]};const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await wait(100);}throw Error('Browser fixture timed out');}
app.whenReady().then(async()=>{
 try{
  server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><head><title>Prompt fixture</title></head><body><main><div id="positive"><div><div><p>Prompt</p></div></div><div data-line-clamp="true">&lt;lora:sample:0.8&gt; masterpiece, blue hair, castle, (red, blue:1.2)<span>...<span>Show more</span></span></div></div><div id="negative"><div><div><p>Negative prompt</p></div></div><div data-line-clamp="true">low quality, blurry<span>Show more</span></div></div></main></body></html>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  window=new BrowserWindow({width:1100,height:900,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.on('console-message',(_e,level,message)=>{if(level>=3)report.errors.push(message);});
  await window.loadURL('http://127.0.0.1:'+server.address().port+'/images/123');
  const js=code=>window.webContents.executeJavaScript(code);
  await js('window.fixtureCopies=[];window.GM_setClipboard=text=>{fixtureCopies.push(text)};window.GM_getValue=()=>null;window.GM_registerMenuCommand=()=>{};void 0;');
  let script=fs.readFileSync(path.join(root,'browser/danbooru-tag-tool.user.js'),'utf8');
  script=script.replace("const isCivitai=location.hostname==='civitai.red';","const isCivitai=true;").replace("['danbooru.donmai.us','civitai.red'].includes(location.hostname)","['127.0.0.1'].includes(location.hostname)");
  await js(script);await until(()=>js('!!document.querySelector("#db-tag-tool [data-tag=castle]")'));
  assert(await js('document.querySelectorAll("[data-polarity]").length===2'));
  await js('document.querySelector("[data-action=copy]").click()');
  await until(()=>js('fixtureCopies.length===1'));const positive=await js('fixtureCopies[0]');
  assert(positive.includes('castle'));assert(!positive.includes('blue hair'));assert(!positive.includes('<lora'));assert(!positive.includes('blurry'));assert(positive.includes('(red, blue:1.2)'));report.checks.positiveFilteringAndWeights=true;
  await js('document.querySelector("[data-polarity=negative]").click();document.querySelector("[data-action=copy]").click()');
  await until(()=>js('fixtureCopies.length===2'));assert.equal(await js('fixtureCopies[1]'),'low quality, blurry');
  report.checks.negativeSeparate=true;
  assert(await js('JSON.parse(localStorage.getItem("danbooru-tag-tool:workspace:v3")).history[0].mode.includes("负面")'));report.checks.historyLabels=true;
  await js('document.querySelector("[data-polarity=positive]").click();document.querySelector("[data-action=original]").click()');await until(()=>js('fixtureCopies.length===3'));
  assert((await js('fixtureCopies[2]')).includes('<lora:sample:0.8>'));assert(!(await js('fixtureCopies[2]')).includes('Show more'));report.checks.originalPreservesMarkup=true;
  // A new URL with old DOM must not relabel the previous image's prompts.
  await js('history.pushState({},"","/images/124")');await until(()=>js('document.querySelector("[data-action=copy]").disabled'));
  await js('document.querySelector("#positive [data-line-clamp]").textContent="best quality, forest";document.querySelector("#negative [data-line-clamp]").textContent="artifact"');
  await until(()=>js('!!document.querySelector("#db-tag-tool [data-tag=forest]")'));assert(!(await js('document.querySelector(".db-body").textContent')).includes('castle'));report.checks.spaStaleCleared=true;
  await js('history.pushState({},"","/images/125");document.querySelector("#positive [data-line-clamp]").textContent="masterpiece, seaside"');
  await until(()=>js('!!document.querySelector("#db-tag-tool [data-tag=seaside]")'));await wait(900);assert(await js('!document.querySelector("[data-action=copy]").disabled'));report.checks.simultaneousNavigationAndPrompt=true;
  await js('const expanded=document.querySelector("#positive [data-line-clamp]");expanded.className="break-words";expanded.removeAttribute("data-line-clamp");document.querySelector("[data-action=refresh]").click();void 0;');
  assert(await js('!!document.querySelector("#db-tag-tool [data-tag=seaside]")'));report.checks.expandedTextSupported=true;
  await js('document.querySelector("#db-tag-launcher").click()');
  fs.writeFileSync(path.join(output,'workbench.png'),(await window.webContents.capturePage()).toPNG());
  assert.equal(report.errors.length,0);report.passed=true;
 }catch(error){report.error=error.stack;report.passed=false;}
 finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}));window?.destroy();server?.close();app.exit(report.passed?0:1);}
});

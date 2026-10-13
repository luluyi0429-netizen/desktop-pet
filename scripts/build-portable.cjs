// Windows unpack-and-run distribution. No installer, global Node.js or npm at runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'node_modules','electron','dist');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build on Windows x64 with an installed Electron runtime');
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('Build step failed: '+command);}
run(process.execPath,[path.join(__dirname,'build-tag-link.cjs')]);
run(process.execPath,[path.join(__dirname,'check-project.cjs')]);
const {verify}=require('./check-custom2-baseline.cjs');verify(root);
run(process.execPath,[path.join(__dirname,'run-tests.cjs')]);
const binary=fs.readFileSync(path.join(runtime,'electron.exe'));
const pe=binary.readUInt32LE(0x3c);
assert.equal(binary.toString('ascii',pe,pe+4),'PE\0\0');assert.equal(binary.readUInt16LE(pe+4),0x8664,'Electron must be Windows x64');
const runtimeVersion=fs.readFileSync(path.join(runtime,'version'),'utf8').trim();
assert.equal(runtimeVersion,require('./custom2-baseline.json').electron,'Installed Electron differs from verified baseline');
let name='desktop-pet-'+pkg.version+'-win-x64';
const release=path.join(root,'release');fs.mkdirSync(release,{recursive:true});
if(fs.existsSync(path.join(release,name))||fs.existsSync(path.join(release,name+'.zip')))name+='-'+Date.now();
const folder=path.join(release,name),appDir=path.join(folder,'resources','app');
fs.mkdirSync(folder);fs.mkdirSync(appDir,{recursive:true});
function copyTree(source,destination,filter=()=>true){
  const info=fs.lstatSync(source);assert(!info.isSymbolicLink(),'Refusing links in release');
  if(!filter(source))return;
  if(info.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const item of fs.readdirSync(source))copyTree(path.join(source,item),path.join(destination,item),filter);}
  else {fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);}
}
for(const entry of fs.readdirSync(runtime)){
  if(entry==='electron.exe')fs.copyFileSync(path.join(runtime,entry),path.join(folder,'桌宠.exe'));
  else copyTree(path.join(runtime,entry),path.join(folder,entry),f=>path.basename(f)!=='default_app.asar');
}
// Explicit allowlist: never include the repository, user profiles, build tools or tests.
const code=[
 'main.cjs','adult-tags.cjs','behavior.cjs','bubble-preload.cjs','bubble-window.cjs','bubble.html','bubble.js',
 'climb-motion.cjs','desktop_pet.html','explorer-monitor.cjs','explorer-windows.ps1','fall-motion.cjs',
 'pet.js','platforms.cjs','preferences.cjs','preload.cjs','settings.html','settings.js',
 'special-interactions.cjs','speech-policy.cjs','sprites.cjs','sync-materials.cjs','tag-link.cjs',
 'tag-settings.html','tag-settings.js','tray.cjs','voice-library.cjs','walk-motion.cjs','workbench-platform.cjs',
 'selected-text.cjs','selection-capture.cjs','selection-reader.ps1','text-assistant.cjs','text-preload.cjs',
 'text-assistant.html','text-assistant.css','text-assistant.js','voice-lines.cjs','prompt-filter.js',
 'voice-import-map.cjs','conditional-voices.cjs','pet-hit-regions.js',
 'rage-window.cjs','rage-preload.cjs','rage.html','rage.js'
];
for(const file of code)fs.copyFileSync(path.join(root,file),path.join(appDir,file));
copyTree(path.join(root,'assets'),path.join(appDir,'assets'));
fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:pkg.name,productName:'桌宠',version:pkg.version,private:true,main:'main.cjs',description:pkg.description},null,2)+'\n');
copyTree(path.join(root,'browser'),path.join(folder,'browser'));
fs.copyFileSync(path.join(root,'docs','免安装版使用说明.md'),path.join(folder,'使用说明.txt'));
fs.copyFileSync(path.join(root,'docs','custom.2完整说明.md'),path.join(folder,'README.md'));
fs.copyFileSync(path.join(root,'docs','custom.2源码与验证.md'),path.join(folder,'源码与验证.md'));
verify(appDir,{browser:path.join(folder,'browser/danbooru-tag-tool.user.js'),strict:true});
const info={name:'desktop-pet',version:pkg.version,platform:'win32',arch:'x64',electron:runtimeVersion,config:'AppData/Roaming/desktop-pet-prototype',requiresNode:false};
fs.writeFileSync(path.join(folder,'build-info.json'),JSON.stringify(info,null,2)+'\n');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(path.join(folder,'桌宠.exe')),hash(path.join(runtime,'electron.exe')),'Bundled runtime changed');
const images=JSON.parse(fs.readFileSync(path.join(appDir,'assets/manifest.json')));
const voices=JSON.parse(fs.readFileSync(path.join(appDir,'assets/audio/voices/manifest.json')));
assert(!images.source&&!voices.source,'Import source paths must not be distributed');
for(const list of Object.values(images.actions))for(const file of list)assert(fs.existsSync(path.join(appDir,'assets',file)));
for(const list of Object.values(voices.groups))for(const clip of list)assert(fs.existsSync(path.join(appDir,clip.src)));
function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=list(folder).map(file=>({path:path.relative(folder,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:hash(file)}));
assert(files.every(f=>!/(^|\/)(?:node_modules|tests|\.git|\.local|work|outputs)(\/|$)/.test(f.path)));
assert(files.every(f=>!/(^|\/)(?:tag-link-key|tag-link|settings|text-assistant)\.json$/.test(f.path)));
fs.writeFileSync(path.join(folder,'files.sha256'),files.map(f=>f.sha256+'  '+f.path).join('\n')+'\n');
const zip=folder+'.zip';
const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
run(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'zip-portable.ps1'),'-Source',folder,'-Destination',zip]);
fs.writeFileSync(zip+'.sha256',hash(zip)+'  '+path.basename(zip)+'\n');
fs.writeFileSync(path.join(release,'latest-build.json'),JSON.stringify({...info,folder:name,zip:path.basename(zip),files:files.length+1,unpackedBytes:files.reduce((s,f)=>s+f.bytes,0),zipBytes:fs.statSync(zip).size,sha256:hash(zip)},null,2)+'\n');
console.log(JSON.stringify({folder,zip,files:files.length+1,zipBytes:fs.statSync(zip).size,electron:runtimeVersion}));

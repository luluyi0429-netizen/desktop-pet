const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),skip=new Set(['node_modules','.git','.local','work','outputs','release','dist','coverage']);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(skip.has(e.name))return [];
  const f=path.join(dir,e.name);
  assert(!e.isSymbolicLink(),'Unexpected symlink: '+path.relative(root,f));
  return e.isDirectory()?files(f):[f];
});}
const all=files(root),used=new Set(['assets/manifest.json','assets/audio/voices/manifest.json']);
function asset(relative){
  assert(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.includes('..')&&!relative.includes('\\'));
  const full=path.resolve(root,relative);
  assert(full.startsWith(root+path.sep)&&fs.existsSync(full),'Missing asset: '+relative);used.add(relative);
}
const images=JSON.parse(fs.readFileSync(path.join(root,'assets/manifest.json')));
assert(!images.source,'Private source path in image manifest');
for(const list of Object.values(images.actions))for(const f of list)asset('assets/'+f);
for(const f of Object.values(images.audio||{}))asset('assets/'+f);
for(const f of Object.values(images.reactions||{}))asset('assets/'+f);
for(const f of Object.values(images.video||{}))asset('assets/'+f);
const voices=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/voices/manifest.json')));
assert(!voices.source,'Private source path in voice manifest');
for(const list of Object.values(voices.groups))for(const clip of list)asset(clip.src);
let bytes=0;
for(const full of all){
  const relative=path.relative(root,full).split(path.sep).join('/'),size=fs.statSync(full).size;bytes+=size;
  assert(size<=100*1024*1024,'File exceeds GitHub 100 MiB limit: '+relative);
  assert(!/^(?:settings|tag-link|tag-link-key|text-assistant)\.json$/.test(path.basename(full)),'Personal config in source: '+relative);
  if(relative.startsWith('assets/'))assert(used.has(relative),'Unreferenced bundled asset: '+relative);
  if(/\.(?:cjs|js|json|md|html|cmd|bat|ps1)$/.test(full)){
    const text=fs.readFileSync(full,'utf8');
    assert(!/[A-Z]:[\\/]Users[\\/](?!USERNAME)/i.test(text),'Personal absolute path in '+relative);
    assert(!/DPT1:\d+:[a-f0-9]{64}/i.test(text),'Literal pairing credential in '+relative);
  }
  if(/\.(?:cjs|js)$/.test(full)){
    const r=spawnSync(process.execPath,['--check',full],{stdio:'pipe',windowsHide:true});
    assert.equal(r.status,0,relative+': '+r.stderr);
  }
}
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
console.log(JSON.stringify({sourceFiles:all.length,sourceBytes:bytes,bundledFiles:used.size,voiceClips:Object.values(voices.groups).flat().length,allReferencesExist:true,noLiteralPairingKeys:true,noPersonalAbsolutePaths:true}));

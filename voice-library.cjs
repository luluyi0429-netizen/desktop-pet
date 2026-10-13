const fs = require('node:fs');
const path = require('node:path');
const {catalog} = require('./voice-lines.cjs');
const GROUPS = {
  click: ['怎么啦', '叫我了吗', '好痒呀', '真是的，别一直戳'],
  sleep: ['哈啊……有点困了', '就睡一小会儿'],
  wake: ['唔……人家明明睡得正香'],
  copy: ['标签收到了', '又复制了一次'],
  walk: ['我去散个步'], drag: ['哇！别突然把我提起来', '你要带我去哪里'],
  land: ['呼，安全着陆'], climbTop: ['爬到顶啦'], idle: ['喂，要不要休息一下'],
  cute: ['哇，这个角色好可爱'], cool: ['哦哦，好帅'], collect: ['这个也要保存吗'],
  rapid: ['真是的！不要一直连点啦'], penis: ['哦鲸鲸'],
  h: ['涩涩！', '……看见了哦', '不用藏啦', '才、才没有', '哼嗯', '看得这么入神', '闷骚', '又在看这种东西', '这个……可能有点太刺激', '这件事，是我们两个人', '真是的，你在看什么', '真是的……你这个色鬼', '真是的……只限今天']
};
function isEnabledVoice(group,clip){
  return clip.language!=='zh'||(group==='fall'&&clip.text==='中国人能飞');
}
function enabledLibrary(library){
  const groups=Object.fromEntries(Object.entries(library.groups||{}).map(([group,clips])=>[group,clips.filter(c=>isEnabledVoice(group,c))]).filter(([,clips])=>clips.length));
  // Migrate old manifests while retaining each clip's existing file and caption.
  for(const [group,tagCondition] of Object.entries({shy:'shy',tagInsertion:'insertion',tagEjaculation:'ejaculation'})){
    const additions=(groups[group]||[]).map(clip=>({...clip,tagCondition}));
    if(additions.length){const existing=groups.h||[];groups.h=[...existing,...additions.filter(c=>!existing.some(old=>old.src===c.src))];}
    delete groups[group];
  }
  return {...library,groups};
}
function syncVoiceLibrary(source) {
  const folder = path.join(__dirname, 'assets', 'audio', 'voices');
  const manifestFile = path.join(folder, 'manifest.json');
  // Bundled voices are portable. Never scan a user's sibling desktop folder on startup.
  if (!source) {
    try { return enabledLibrary(JSON.parse(fs.readFileSync(manifestFile, 'utf8'))); } catch { return {groups:{}, missing:['voice manifest']}; }
  }
  if (!fs.existsSync(source)) {
    throw new Error('Voice source folder not found');
  }
  fs.mkdirSync(folder, {recursive:true});
  const {describeVoice}=require('./voice-import-map.cjs');
  const crypto=require('node:crypto');
  function list(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    if(e.isSymbolicLink())return [];
    const relative=prefix+e.name;
    return e.isDirectory()?list(path.join(dir,e.name),relative+'/'):/.(mp3|wav|aac|ogg|m4a)$/i.test(e.name)?[relative]:[];
  });}
  const names=list(source).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  let previous;
  try{previous=JSON.parse(fs.readFileSync(manifestFile,'utf8'));}catch{previous={groups:{}};}
  const library={groups:{...enabledLibrary(previous).groups},missing:[],unused:[]};
  for(const relative of names){
    const line=describeVoice(relative,GROUPS);
    if(!line||!isEnabledVoice(line.group,line)){library.unused.push(relative);continue;}
    const name=path.basename(relative),list=library.groups[line.group]||[];
    const existing=list.find(c=>c.original===name&&(!c.language||!line.language||c.language===line.language));
    const digest=crypto.createHash('sha256').update(relative).digest('hex').slice(0,12);
    const ext=path.extname(name).toLowerCase();
    const exact=catalog[path.parse(name).name];
    const target=existing?path.basename(existing.src):exact?path.parse(name).name+ext:line.group+'_'+(line.language||'legacy')+'_'+digest+ext;
    const destination=path.join(folder,target),input=path.join(source,relative);
    if(path.resolve(input)!==path.resolve(destination))fs.copyFileSync(input,destination);
    const clip={src:'assets/audio/voices/'+target,text:line.text,original:name,...(line.language?{language:line.language}:{}),...(line.legacy?{legacy:true}:{}),...(line.tagCondition?{tagCondition:line.tagCondition}:{})};
    library.groups[line.group]=[...list.filter(c=>c.src!==clip.src),clip];
  }
  for(const group of Object.keys(GROUPS))if(!library.groups[group]?.length)library.missing.push(group);
  fs.writeFileSync(manifestFile+'.tmp',JSON.stringify(library,null,2));
  fs.renameSync(manifestFile+'.tmp',manifestFile);
  return library;
}
function createVoicePicker(library, random = Math.random) {
  library=enabledLibrary(library);
  const previous = new Map();
  const bags=new Map();
  const localized=(group)=>{const list=(library.groups[group]||[]).filter(c=>isEnabledVoice(group,c)); if(group==='fall')return list.filter(c=>c.text==='中国人能飞'); const local=list.filter(c=>c.language==='ja'); return local.length?local:list.filter(c=>!c.language||c.legacy);};
  return (group,{context={}}={}) => {
    const language='ja';
    const key=group+':'+language;
    if(group==='touchChest'){
      // A hit region always uses one line, independent of the random click pool.
      const fixed=localized(group,language).slice().sort((a,b)=>a.src.localeCompare(b.src))[0];
      return fixed||(library.groups.click||[]).find(c=>c.src==='assets/audio/voices/click_04.mp3')||null;
    }
    if(group==='h'){
      const adultPool=[...localized('h',language),...localized('penis',language).map(clip=>({...clip,text:'哦鲸鲸？',image:'assets/reactions/oh-jing-jing.png'}))].filter(clip=>!clip.tagCondition||context?.[clip.tagCondition]===true);
      if(!adultPool.length)return null;
      // One equal-weight entry per eligible clip. Each tag combination gets a
      // separate shuffle bag so clips from a previous page cannot leak through.
      const bagKey=key+':'+JSON.stringify(adultPool.map(c=>c.src).sort());
      let adultBag=bags.get(bagKey)||[];
      if(!adultBag.length){
        adultBag=[...adultPool];
        for(let i=adultBag.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[adultBag[i],adultBag[j]]=[adultBag[j],adultBag[i]];}
        if(adultBag.length>1&&adultBag[0].src===previous.get(key)){const j=1+Math.min(adultBag.length-2,Math.floor(random()*(adultBag.length-1)));[adultBag[0],adultBag[j]]=[adultBag[j],adultBag[0]];}
      }
      // On switching pools, defer a consecutive repeat without dropping it.
      if(adultBag[0]?.src===previous.get(key)&&adultBag.length>1)[adultBag[0],adultBag[1]]=[adultBag[1],adultBag[0]];
      const clip=adultBag.shift();bags.set(bagKey,adultBag);previous.set(key,clip.src);return clip;
    }
    const list = localized(group,language);
    if (!list.length) return null;
    const candidates = list.filter(clip=>clip.src!==previous.get(key));
    const choices = candidates.length ? candidates : list;
    const clip = choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
    previous.set(key,clip.src);return clip;
  };
}
module.exports = {GROUPS,syncVoiceLibrary,createVoicePicker};
if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node voice-library.cjs <audio-folder>'); process.exitCode = 1; }
  else { try { const library=syncVoiceLibrary(path.resolve(process.argv[2])); console.log(JSON.stringify({clips:Object.values(library.groups).flat().length,missing:library.missing})); }
    catch(error) { console.error(error.message); process.exitCode=1; } }
}

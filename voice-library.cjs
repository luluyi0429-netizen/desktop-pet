const fs = require('node:fs');
const path = require('node:path');
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
function syncVoiceLibrary(source) {
  const folder = path.join(__dirname, 'assets', 'audio', 'voices');
  const manifestFile = path.join(folder, 'manifest.json');
  // Bundled voices are portable. Never scan a user's sibling desktop folder on startup.
  if (!source) {
    try { return JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { return {groups:{}, missing:['voice manifest']}; }
  }
  if (!fs.existsSync(source)) {
    throw new Error('Voice source folder not found');
  }
  fs.mkdirSync(folder, {recursive:true});
  const names = fs.readdirSync(source).filter(n => /\.(mp3|wav|aac|ogg|m4a)$/i.test(n)).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const library = {groups:{}, missing:[], unused:[]}, used = new Set();
  for (const [group, prefixes] of Object.entries(GROUPS)) {
    const matches = names.filter(name=>prefixes.some(prefix=>name.startsWith(prefix)));
    library.groups[group] = matches.map((name,index)=>{
      used.add(name);
      const target = group+'_'+String(index+1).padStart(2,'0')+path.extname(name).toLowerCase();
      fs.copyFileSync(path.join(source,name),path.join(folder,target));
      return {src:'assets/audio/voices/'+target, text:path.parse(name).name.split('——')[0].replace(/\(\d+\)$/,''), original:name};
    });
    if (!matches.length) library.missing.push(group);
  }
  library.unused = names.filter(name=>!used.has(name));
  fs.writeFileSync(manifestFile,JSON.stringify(library,null,2));
  return library;
}
function createVoicePicker(library, random = Math.random) {
  const previous = new Map();
  let adultBag=[];
  const adultPool=[...(library.groups.h||[]),...(library.groups.penis||[]).map(clip=>({...clip,text:'哦鲸鲸？',image:'assets/reactions/oh-jing-jing.png'}))];
  return group => {
    if(group==='h'){
      if(!adultPool.length)return null;
      if(!adultBag.length){
        adultBag=[...adultPool];
        for(let i=adultBag.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[adultBag[i],adultBag[j]]=[adultBag[j],adultBag[i]];}
        if(adultBag.length>1&&adultBag[0].src===previous.get('h'))[adultBag[0],adultBag[1]]=[adultBag[1],adultBag[0]];
      }
      const clip=adultBag.shift();previous.set('h',clip.src);return clip;
    }
    const list = library.groups[group] || [];
    if (!list.length) return null;
    const candidates = list.filter(clip=>clip.src!==previous.get(group));
    const choices = candidates.length ? candidates : list;
    const clip = choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
    previous.set(group,clip.src);return clip;
  };
}
module.exports = {GROUPS,syncVoiceLibrary,createVoicePicker};
if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node voice-library.cjs <audio-folder>'); process.exitCode = 1; }
  else { try { const library=syncVoiceLibrary(path.resolve(process.argv[2])); console.log(JSON.stringify({clips:Object.values(library.groups).flat().length,missing:library.missing})); }
    catch(error) { console.error(error.message); process.exitCode=1; } }
}

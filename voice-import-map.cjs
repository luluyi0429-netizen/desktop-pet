const path = require('node:path');
const {catalog} = require('./voice-lines.cjs');
// File labels are data: only these explicit conditions are recognized.
const CONDITIONS = [
  ['早上五点到十一点开机语音','greetingMorning'],
  ['中午开机启动语音','greetingNoon'],
  ['晚上开机语音','greetingEvening'],
  ['凌晨和深夜开机语音','greetingNight'],
  ['多次点击触发','repeatClick'],
  ['触摸胸部在触发水潺潺之后概率触发','touchChestAfter'],
  ['触摸胸部概率触发','touchChestChance'],
  ['闲置时概率触发','idleRare'],
  ['标签多次重复概率触发','repeatTags'],
  ['在落地掉落过程中播放可开关','fall'],
  ['被拖拽时概率触发','dragRare'],
  ['连续阅读三个以上带有黄色标签时触发','adultStreak']
];
function describeVoice(relative, groups) {
  const parts=relative.replace(/\\/g,'/').split('/');
  const name=path.basename(relative),stem=path.parse(name).name.trim();
  const language=parts.find(p=>p==='zh'||p==='ja') || (/^ja/.test(stem)?'ja':/^zh/.test(stem)?'zh':undefined);
  const clean=s=>s.replace(/^(?:zh|ja)/,'').trim();
  const key=Object.keys(catalog).find(k=>stem===k||stem.endsWith(k));
  if(key){const line=catalog[key],label=clean(stem.slice(0,-key.length));return {...line,text:label||line.text};}
  for(const [label,group] of CONDITIONS)if(stem.includes(label)){
    return {group,language,text:clean(stem.split('-')[0])};
  }
  // Recognize supplied later recordings without generating new dialogue.
  if(language==='ja'){
    if(stem.includes('裸体提示词触发'))return {group:'h',tagCondition:'shy',language,text:stem.split('，nude')[0]};
    if(stem.endsWith('插入概率触发'))return {group:'h',tagCondition:'insertion',language,text:stem.replace(/，插入概率触发$/,'')};
    if(/(?:射精场景概率触发|射精触发)$/.test(stem))return {group:'h',tagCondition:'ejaculation',language,text:stem.replace(/，(?:射精场景概率触发|射精触发)$/,'')};
  }
  if(stem==='ja今晚月色真美')return {group:'eveningIdle',language:'ja',text:'今晚月色真美。'};
  if(stem==='ja原来如此，原来如此，你真是个大色狼')return {group:'h',language:'ja',text:clean(stem)};
  for(const [group,prefixes] of Object.entries(groups))if(prefixes.some(p=>stem.startsWith(p)))
    return {group,language,legacy:true,text:stem.split('——')[0].replace(/\(\d+\)$/,'')};
  return null;
}
module.exports={describeVoice,CONDITIONS};

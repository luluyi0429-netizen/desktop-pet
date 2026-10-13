const path = require('node:path');
const {catalog} = require('./voice-lines.cjs');
// Numbered recordings follow the previously supplied recording sheet.
const RECORDING_LABELS = {
  '叫醒①':['wake','嗯……再让我睡五分钟嘛。'],
  '叫醒②':['wake','唔……是你呀，找我有什么事？'],
  '叫醒③':['wake','我刚刚梦到你了，结果就被你叫醒了。'],
  '落地①':['land','呼，安全着陆！'],
  '落地②':['land','站稳啦，刚刚有一点点刺激。'],
  '提起①':['drag','哎？你要把我带到哪里去？'],
  '提起②':['drag','慢一点啦，我还没准备好呢。'],
  '闲聊①':['idle','你在忙什么呀？我陪着你。'],
  '闲聊②':['idle','一直盯着屏幕，眼睛也会累的哦。'],
  '闲聊③':['idle','没什么事，就是想叫你一下。'],
  '爬上窗口':['climbTop','嘿咻……终于爬上来了！']
};
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
  if(language==='zh'&&Object.hasOwn(RECORDING_LABELS,stem)){
    const [group,text]=RECORDING_LABELS[stem];return {group,language,text};
  }
  if(language==='ja'&&stem==='被看光了，有点害羞，nude,nake类似裸体提示词触发')
    return {group:'shy',language,text:'被看光了，有点害羞。'};
  const clean=s=>s.replace(/^(?:zh|ja)/,'').trim();
  const key=Object.keys(catalog).find(k=>stem===k||stem.endsWith(k));
  if(key){const line=catalog[key],label=clean(stem.slice(0,-key.length));return {...line,text:label||line.text};}
  for(const [label,group] of CONDITIONS)if(stem.includes(label)){
    return {group,language,text:clean(stem.split('-')[0])};
  }
  if(stem==='ja今晚月色真美')return {group:'eveningIdle',language:'ja',text:'今晚月色真美。'};
  if(stem==='ja原来如此，原来如此，你真是个大色狼')return {group:'h',language:'ja',text:clean(stem)};
  for(const [group,prefixes] of Object.entries(groups))if(prefixes.some(p=>stem.startsWith(p)))
    return {group,language,legacy:true,text:stem.split('——')[0].replace(/\(\d+\)$/,'')};
  return null;
}
module.exports={describeVoice,CONDITIONS};

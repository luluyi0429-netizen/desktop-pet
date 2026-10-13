const assert=require('node:assert/strict');
const {createConditionalVoices,greetingGroup}=require('../conditional-voices.cjs');
const {describeVoice}=require('../voice-import-map.cjs');
const {GROUPS}=require('../voice-library.cjs');
const {hit}=require('../pet-hit-regions.js');
assert.deepEqual([0,4,5,10,11,17,18,22,23].map(greetingGroup),['greetingNight','greetingNight','greetingMorning','greetingMorning','greetingNoon','greetingNoon','greetingEvening','greetingEvening','greetingNight']);
assert.equal(describeVoice('zh/叫老子干啥click_zh_01.mp3',GROUPS).text,'叫老子干啥');
assert.equal(describeVoice('zh/你看得也太认真了吧。h_zh_02 .mp3',GROUPS).group,'h');
assert.equal(describeVoice('ja/10.11更新/早上好-早上五点到十一点开机语音.mp3',GROUPS).group,'greetingMorning');
assert.equal(describeVoice('zh/未标识.mp3',GROUPS),null);
for(const [name,group] of [['叫醒①','wake'],['落地②','land'],['提起①','drag'],['闲聊③','idle'],['爬上窗口','climbTop']]){
 const clip=describeVoice('zh/'+name+'.mp3',GROUPS);assert.equal(clip.group,group);assert.equal(clip.language,'zh');assert(!clip.text.includes('①'));
}
assert.equal(describeVoice('zh/sit_zh_02.wav',GROUPS).group,'sit');
assert.equal(describeVoice('ja/sit_ja_03.wav',GROUPS).text,'你忙你的，我坐在这里陪你。');
for(const scale of [.5,1,2]){const rect={left:25,top:10,width:150*scale,height:300*scale};assert.equal(hit({action:'idle',rect,x:25+75*scale,y:10+159*scale}),'chest');assert.equal(hit({action:'idle',rect,x:25+75*scale,y:10+45*scale}),null);assert.equal(hit({action:'sleep',rect,x:25+75*scale,y:10+159*scale}),null);}
const r={left:0,top:0,width:100,height:100};assert.equal(hit({action:'click',frame:0,rect:r,x:60,y:50,mirrored:true}),'chest');assert.equal(hit({action:'click',frame:0,rect:r,x:60,y:50}),null);
let now=0;const c=createConditionalVoices({now:()=>now,random:()=>0});
for(let i=0;i<4;i++){assert.equal(c.click(null,'ja'),null);now+=100;}assert.equal(c.click(null,'ja'),'repeatClick');c.played('repeatClick','ja');
for(let i=0;i<6;i++)assert.equal(c.click(null,'ja'),null);
assert.equal(c.click('chest','zh'),'touchChestChance');c.played('touchChestChance','zh');assert.equal(c.click('chest','zh'),'touchChestAfter');
c.played('touchChestAfter','zh');assert.equal(c.click('chest','zh'),'touchChestChance');now+=61000;assert.equal(c.click('chest','zh'),'touchChestChance');
const event=i=>({kind:'view',site:'danbooru',postId:String(i),tags:['sex','blue_hair']});
assert(!c.view(event(1)).adultStreak);assert(!c.view(event(1)).adultStreak);assert(!c.view(event(2)).adultStreak);
const context=c.view(event(3));assert(context.adultStreak&&context.repeatTags);assert.equal(c.tag(context),'adultStreak');c.played('adultStreak','zh');assert.equal(c.tag(context),'repeatTags');c.played('repeatTags','zh');assert.equal(c.tag(context),null);
now+=300001;assert(!c.view(event(4)).adultStreak);
const {harness}=require('./test-behavior-platforms.cjs');
const pet=harness(.1,true);pet.settings('pet:walking',false);pet.settings('pet:speech-settings',{voiceLanguage:'zh'});
function touch(){pet.send('pet:drag-start',{x:100,y:100},0,'chest');pet.send('pet:drag-end',true);}
touch();assert.equal(pet.state().audioCue.reason,'touchChestChance');pet.send('pet:audio-ended',pet.state().audioCue.id);pet.tick(5.1);touch();assert.equal(pet.state().audioCue.reason,'touchChestChance');assert.equal(pet.state().voiceLanguage,'ja');
pet.settings('pet:muted',true);touch();assert.equal(pet.state().audioCue,null);
const browser=harness(.1,true);browser.settings('pet:walking',false);browser.settings('pet:speech-settings',{voiceLanguage:'zh'});
for(let i=1;i<=3;i++){browser.receive({...event(i),clientId:'conditional-test',seq:i});assert.equal(browser.state().audioCue.reason,'tag-h');browser.send('pet:audio-ended',browser.state().audioCue.id);browser.tick(5.1);}
const fall=harness(.1,true);fall.settings('pet:walking',false);fall.settings('pet:speech-settings',{voiceLanguage:'zh'});
fall.send('pet:drag-start',{x:100,y:100});fall.send('pet:drag-move',{x:100,y:-300});if(fall.state().audioCue)fall.send('pet:audio-ended',fall.state().audioCue.id);fall.tick(5.1);fall.send('pet:drag-end',true);assert.equal(fall.state().audioCue.reason,'fall');
const off=harness(.1,true);off.settings('pet:walking',false);off.settings('pet:speech-settings',{voiceLanguage:'zh',fallVoiceEnabled:false});
off.send('pet:drag-start',{x:100,y:100});off.send('pet:drag-move',{x:100,y:-300});if(off.state().audioCue)off.send('pet:audio-ended',off.state().audioCue.id);off.tick(5.1);off.send('pet:drag-end',true);assert.equal(off.state().audioCue,null);
const repeated=harness(.1,true);repeated.settings('pet:walking',false);
for(let i=0;i<5;i++){repeated.send('pet:click');repeated.tick(.1);}
assert.equal(repeated.state().audioCue.reason,'click');repeated.send('pet:audio-ended',repeated.state().audioCue.id);repeated.tick(5.1);assert.equal(repeated.state().audioCue.reason,'repeatClick');
repeated.send('pet:audio-ended',repeated.state().audioCue.id);repeated.tick(5.1);assert.equal(repeated.state().audioCue,null);
console.log(JSON.stringify({greetingBoundaries:true,filenameConditions:true,scaledChestHit:true,repeatCooldown:true,chestSequence:true,tagDedupAndStreak:true,mainConditionalRouting:true,fallCue:true}));

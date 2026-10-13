const assert=require('node:assert/strict');
const {createVoicePicker}=require('../voice-library.cjs');
const library={groups:{click:[{src:'old',text:'旧'},{src:'zh',text:'中文',language:'zh'},{src:'ja',text:'中文',language:'ja'}],wake:[{src:'legacy',text:'旧'}],h:[{src:'a'},{src:'b'},{src:'c'},{src:'d'}],penis:[{src:'m'}]}};
const pick=createVoicePicker(library,()=>0);
assert.equal(pick('click',{language:'zh'}).src,'ja');assert.equal(pick('click',{language:'ja'}).src,'ja');assert.equal(pick('wake',{language:'zh'}).src,'legacy');
const cycle=Array.from({length:5},()=>pick('h',{genital:true}).src);assert.equal(new Set(cycle).size,5);assert.equal(cycle.filter(src=>src==='m').length,1,'Meme receives one slot, same as every other eligible clip');assert.notEqual(pick('h',{genital:true}).src,cycle.at(-1));
const ordinary=createVoicePicker(library,()=>0);assert.equal(new Set(Array.from({length:5},()=>ordinary('h').src)).size,5);
const {harness}=require('./test-behavior-platforms.cjs');
const pet=harness(.5,true);pet.settings('pet:walking',false);pet.settings('pet:speech-settings',{voiceCooldownSeconds:60});
for(let i=0;i<3;i++){pet.settings('pet:preview','sleep');pet.send('pet:drag-start',{x:100,y:100});pet.send('pet:drag-end',true);pet.tick(.1);}
assert.equal(pet.state().audioCue.reason,'sleep-laowu','Third wake interrupts active wake/cooldown');assert.equal(pet.state().audioCue.src,'assets/audio/laowu.aac');
pet.settings('pet:muted',true);assert.equal(pet.state().audioCue,null);
console.log(JSON.stringify({languagePools:true,legacyFallback:true,genitalContextUsesEqualPool:true,thirdWakeBypassesCooldown:true,muteRespected:true}));

const path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),checks={};
const {syncVoiceLibrary,createVoicePicker,GROUPS}=require('../voice-library.cjs');
const lib=syncVoiceLibrary();
let seed=123;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const poolChecks=[];
for(let bits=0;bits<8;bits++){
 const context={shy:Boolean(bits&1),insertion:Boolean(bits&2),ejaculation:Boolean(bits&4)};
 const eligible=[...lib.groups.h,...lib.groups.penis].filter(c=>!c.tagCondition||context[c.tagCondition]);const picker=createVoicePicker(lib,random);let previous='';
 for(let cycle=0;cycle<30;cycle++){
  const seen=new Set();for(let i=0;i<eligible.length;i++){const clip=picker('h',{context,genital:true});assert(!clip.tagCondition||context[clip.tagCondition]);assert(!seen.has(clip.src),'One slot per clip');assert.notEqual(clip.src,previous,'No consecutive repeat in stable pool');seen.add(clip.src);previous=clip.src;}
  assert.deepEqual([...seen].sort(),eligible.map(c=>c.src).sort());
 }
 poolChecks.push({context,eligible:eligible.length,cycles:30});
}
checks.equalWeightAllEightContexts=poolChecks;
const mixed=createVoicePicker(lib,random);for(let n=0;n<1000;n++){const context=n%3===0?{}:n%3===1?{shy:true}:{insertion:true,ejaculation:true};const clip=mixed('h',{context});assert(!clip.tagCondition||context[clip.tagCondition],'No stale-context clip');}checks.noConditionLeakAcrossPages=true;
// Synthetic pre-unification manifest; no personal fixture data.
const oldLib=JSON.parse(JSON.stringify(lib));
for(const [condition,group] of [['shy','shy'],['insertion','tagInsertion'],['ejaculation','tagEjaculation']]){
 oldLib.groups[group]=oldLib.groups.h.filter(c=>c.tagCondition===condition).map(c=>{const copy={...c};delete copy.tagCondition;return copy;});
}
oldLib.groups.h=oldLib.groups.h.filter(c=>!c.tagCondition);
const migrated=createVoicePicker(oldLib,random),oldSeen=new Set();
for(let n=0;n<22;n++)oldSeen.add(migrated('h',{context:{shy:true,insertion:true,ejaculation:true}}).src);
assert.equal(oldSeen.size,22);checks.oldManifestMigration=true;
const {describeVoice}=require(path.join(app,'voice-import-map.cjs'));for(const clip of lib.groups.h.filter(c=>c.tagCondition)){const imported=describeVoice('ja/10.13更新/'+clip.original,GROUPS);assert.equal(imported.group,'h');assert.equal(imported.tagCondition,clip.tagCondition);}checks.futureImportsKeepConditions=true;
const {createConditionalVoices}=require(path.join(app,'conditional-voices.cjs'));const cv=createConditionalVoices({random:()=>0,now:()=>0});const ctx=cv.view({kind:'view',postId:'1',tags:['nude','penetration','cum_in_mouth']});assert(ctx.shy&&ctx.insertion&&ctx.ejaculation);assert.equal(cv.tag(ctx),null);checks.noSeparateConditionalChanceOrCooldown=true;
const {harness}=require('./test-behavior-platforms.cjs');
const pet=harness(.5,true);pet.settings('pet:walking',false);pet.settings('pet:speech-settings',{voiceFrequency:'high'});const seen=new Set();
for(let n=0;n<22;n++){
 pet.evaluate("cancelVoice();interact();setAction('idle')");pet.elapse(6000);
 assert(pet.evaluate("tagReaction({kind:'view',rule:'h',text:'tag',duration:5000,genital:true,context:{shy:true,insertion:true,ejaculation:true}})"));
 const cue=pet.state().audioCue;assert(cue);assert.equal(cue.reason,'tag-h');assert(!seen.has(cue.src));seen.add(cue.src);
 assert.equal(pet.evaluate("tagReaction({kind:'view',rule:'h',text:'tag',duration:5000,context:{}})"),false,'No overlapping audio');
}
assert.equal(seen.size,22);checks.mainProcessUsesSingleHVoicePool=true;
pet.evaluate('cancelVoice()');assert.equal(pet.evaluate("tagReaction({kind:'view',rule:'h',text:'tag',duration:5000,context:{}})"),false);pet.elapse(5001);assert(pet.evaluate("tagReaction({kind:'view',rule:'h',text:'tag',duration:5000,context:{}})"));checks.sharedVoiceCooldown=true;
const low=harness(.5,true);low.settings('pet:speech-settings',{voiceFrequency:'low'});low.evaluate("cancelVoice();interact();setAction('idle')");low.elapse(6000);low.evaluate("tagReaction({kind:'view',rule:'h',text:'tag',duration:5000,context:{shy:true,insertion:true,ejaculation:true}})");assert.equal(low.state().audioCue,null);checks.sharedFrequencyProbability=true;
console.log(JSON.stringify({passed:true,checks}));

const assert=require('node:assert/strict');
const {harness}=require('./test-behavior-platforms.cjs');
const p=harness();p.settings('pet:walking',false);
p.advance(60000);assert.notEqual(p.state().action,'sit','custom.2 has no automatic sitting cycle');
p.advance(239999);assert.notEqual(p.state().action,'sleep');p.advance(1);assert.equal(p.state().action,'sleep');
p.advance(119999);assert.equal(p.state().action,'sleep');p.advance(1);assert.equal(p.state().action,'idle');
p.advance(299999);assert.notEqual(p.state().action,'sleep');p.advance(1);assert.equal(p.state().action,'sleep');
p.send('pet:click');assert.equal(p.state().action,'click');p.advance(1000);assert.notEqual(p.state().action,'sleep');
const manual=harness();manual.settings('pet:preview','sleep');manual.advance(120000);assert.equal(manual.state().action,'idle');
const v=harness(.5,true);v.settings('pet:speech-settings',{voiceFrequency:'high'});
v.evaluate("interact();setAction('sleep')");v.advance(120000);assert.equal(v.state().action,'idle');
for(let n=0;n<3;n++){
 v.evaluate("cancelVoice();setAction('idle')");v.elapse(6000);v.evaluate("interact();setAction('sleep')");v.send('pet:click');
 assert.equal(v.state().audioCue.reason,n===2?'sleep-laowu':'sleep-wake');v.evaluate('cancelVoice()');v.advance(6000);
}
v.evaluate("cancelVoice();setAction('idle')");v.settings('pet:laowu');assert.equal(v.state().audioCue.text,'');assert(v.state().audioCue.src.endsWith('laowu.aac'));
console.log(JSON.stringify({noAutoSit:true,sleep300Seconds:true,wake120Seconds:true,noImmediateResleep:true,manualAndClickWake:true,naturalWakeDoesNotCountAsForcedWake:true,mysteryHasNoCaption:true}));

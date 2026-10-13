// Migration regression for the removed Chinese language option.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./test-behavior-platforms.cjs');
const {normalizeSpeech}=require('../speech-policy.cjs');
const {syncVoiceLibrary,createVoicePicker}=require('../voice-library.cjs');
assert.equal(normalizeSpeech({voiceLanguage:'zh'}).voiceLanguage,'ja');
const lib=syncVoiceLibrary(),clips=Object.values(lib.groups).flat();
assert.equal(clips.length,63);assert.deepEqual(clips.filter(c=>c.language==='zh').map(c=>c.text),['中国人能飞']);
const pick=createVoicePicker(lib,()=>.5);
assert.equal(pick('fall').text,'中国人能飞');
for(const group of Object.keys(lib.groups))if(group!=='fall')assert.equal(pick(group,{language:'zh'}).language,'ja',group);
const p=harness(.5,true);p.settings('pet:walking',false);
p.send('pet:drag-start',{x:100,y:100});p.send('pet:drag-end',true);const id=p.state().audioCue.id;
p.settings('pet:speech-settings',{voiceLanguage:'zh'});assert.equal(p.state().voiceLanguage,'ja');assert.equal(p.state().audioCue.id,id,'Removed language option cannot interrupt playback');
const ui=fs.readFileSync(path.join(__dirname,'../settings.html'),'utf8');assert(!ui.includes('data-language'));assert(!ui.includes('data-action="sit"'));
console.log(JSON.stringify({oldChineseSettingsUseJapanese:true,onlyFallingChineseRemains:true,noLanguageButtons:true,noLaterSittingControl:true}));

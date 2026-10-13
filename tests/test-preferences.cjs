const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createPreferences,normalize}=require('../preferences.cjs');
const speech={voiceFrequency:'high',voiceCooldownSeconds:5,volume:100,voiceLanguage:'ja',workbenchSit:false,fallVoiceEnabled:true};
const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'pet-prefs-test-'));
try {
  const store=createPreferences(directory);
  assert.deepEqual(store.read(),{height:300,walking:true,muted:false,...speech});
  store.write({height:450,walking:false,muted:false,...speech});
  assert.deepEqual(createPreferences(directory).read(),{height:450,walking:false,muted:false,...speech});
  assert(!fs.existsSync(path.join(directory,'settings.json.tmp')));
  fs.writeFileSync(path.join(directory,'settings.json'),'broken');
  assert.deepEqual(store.read(),{height:300,walking:true,muted:false,...speech});
  assert.deepEqual(normalize({height:Infinity,walking:'false'}),{height:300,walking:true,muted:false,...speech});
  assert.deepEqual(normalize({height:-20,walking:false,muted:false,...speech}),{height:150,walking:false,muted:false,...speech});
  console.log(JSON.stringify({persistAcrossRestart:true,atomicWrite:true,corruptSettingsFallback:true,inputValidation:true}));
} finally { fs.rmSync(directory,{recursive:true,force:true}); }

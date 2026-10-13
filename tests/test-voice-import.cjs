const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pet-voice-import-')),source=path.join(dir,'source'),voices=path.join(dir,'assets/audio/voices');
fs.mkdirSync(source);fs.mkdirSync(voices,{recursive:true});
const original={groups:{click:[{src:'assets/audio/voices/old.wav',text:'旧声音',original:'旧声音.wav'}]}};
fs.writeFileSync(path.join(voices,'manifest.json'),JSON.stringify(original));fs.writeFileSync(path.join(voices,'old.wav'),'old fixture');
fs.writeFileSync(path.join(source,'click_zh_01.wav'),'new fixture');fs.writeFileSync(path.join(source,'click_ja_01.wav'),'Japanese fixture');
const moduleFixture={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../voice-library.cjs'),'utf8'),{require:n=>n.startsWith('./')?require(path.resolve(__dirname,'..',n)):require(n),module:moduleFixture,__dirname:dir});
try{
 const lib=moduleFixture.exports.syncVoiceLibrary(source);assert.equal(lib.groups.click.length,2);assert.equal(lib.groups.click.find(c=>c.language==='ja').text,'嗯？叫我做什么呀。');
 assert(lib.unused.includes('click_zh_01.wav'));assert(!fs.existsSync(path.join(voices,'click_zh_01.wav')));
 assert.equal(moduleFixture.exports.syncVoiceLibrary(source).groups.click.length,2,'Repeated imports are idempotent');
 assert.equal(fs.readFileSync(path.join(voices,'old.wav'),'utf8'),'old fixture');
 fs.mkdirSync(path.join(source,'zh'));fs.mkdirSync(path.join(source,'ja','new'),{recursive:true});
 fs.writeFileSync(path.join(source,'ja','自定义甲click_ja_01.mp3'),'variant A');
 fs.writeFileSync(path.join(source,'ja','自定义乙click_ja_01.mp3'),'variant B');
 fs.writeFileSync(path.join(source,'zh','中国人能飞-在落地掉落过程中播放可开关.mp3'),'retained fall fixture');
 fs.writeFileSync(path.join(source,'ja','new','早上好-早上五点到十一点开机语音.mp3'),'greeting');
 const nested=moduleFixture.exports.syncVoiceLibrary(source);assert.equal(nested.groups.click.length,4);
 assert.deepEqual(Array.from(nested.groups.click.filter(c=>c.original.startsWith('自定义')),c=>c.text),['自定义甲','自定义乙']);
 assert.equal(nested.groups.greetingMorning[0].language,'ja');assert.equal(nested.unused.length,1);
 assert.equal(nested.groups.fall[0].text,'中国人能飞');assert.equal(nested.groups.fall[0].language,'zh');
 assert.equal(moduleFixture.exports.syncVoiceLibrary(source).groups.click.length,4,'Recursive reimport preserves distinct variants');
 console.log(JSON.stringify({additiveImport:true,reimportNoDuplicates:true,japaneseUsesChineseSubtitle:true,oldAudioPreserved:true,recursiveConditions:true,duplicateCatalogVariantsKept:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}

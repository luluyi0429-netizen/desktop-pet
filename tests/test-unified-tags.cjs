const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),production=root;
const {ADULT_TAGS}=require(path.join(root,'adult-tags.cjs'));
const {defaults,createLinkStore,matchRule,createReactionEngine}=require(path.join(root,'tag-link.cjs'));
const {createVoicePicker}=require(path.join(root,'voice-library.cjs'));
const config=defaults();assert.equal(config.revision,4);assert.equal(config.rules.length,4);
assert.equal(new Set(ADULT_TAGS).size,ADULT_TAGS.length);
for(const tag of ['sex','penis','pussy','ass','deepthroat','nude','creampie','dildo','blowjob','anal','masturbation','paizuri']){
 assert.equal(matchRule(config,{kind:'view',tags:[tag]}).id,'h',tag);
 assert.equal(matchRule(config,{kind:'copy',tags:[tag]}).id,'copy',tag);
}
for(const tag of ['glasses','penis_size','sexy','swimsuit','underwear','breasts','1girl','1boy','cat_ears']){
 assert.notEqual(matchRule(config,{kind:'view',tags:[tag]})?.id,'h',tag);
}
assert.equal(matchRule({...config,rules:config.rules.filter(r=>r.id!=='copy')},{kind:'copy',tags:['sex','penis']}),null);
const old=defaults(); // Synthetic migration fixture; never read personal rules or pairing data.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pet-unified-tags-'));
const oldH=old.rules.find(r=>r.id==='h');old.revision=3;old.probability=72;old.cooldownSeconds=11;oldH.probability=83;oldH.lines=['保留我的台词'];oldH.tags.push('custom_adult_tag');
const other=old.rules.filter(r=>!['h','body','penis','cute','sleepy'].includes(r.id));
fs.writeFileSync(path.join(dir,'tag-link.json'),JSON.stringify(old));const store=createLinkStore(dir),migrated=store.read();
assert.equal(migrated.revision,4);assert.equal(migrated.probability,72);assert.equal(migrated.cooldownSeconds,11);
assert(!migrated.rules.some(r=>r.id==='penis'||r.id==='body'));const unified=migrated.rules.find(r=>r.id==='h');
assert.equal(unified.event,'view');assert.equal(unified.probability,83);assert(unified.lines.includes('保留我的台词'));assert(unified.tags.includes('custom_adult_tag'));
assert.deepEqual(migrated.rules.filter(r=>other.some(o=>o.id===r.id)),other);assert(fs.existsSync(path.join(dir,'tag-link.json.before-v4')));
unified.tags=unified.tags.filter(t=>t!=='ass');store.write(migrated);assert(!store.read().rules.find(r=>r.id==='h').tags.includes('ass'),'Migration must run once, preserving subsequent edits');
const library=JSON.parse(fs.readFileSync(path.join(production,'assets/audio/voices/manifest.json'),'utf8'));
const picker=createVoicePicker(library,()=>.3),poolCount=library.groups.h.filter(c=>c.language==='ja').length+library.groups.penis.filter(c=>c.language==='ja').length;
let previous;for(let round=0;round<3;round++){
 const cycle=Array.from({length:poolCount},()=>picker('h',{context:{shy:true,insertion:true,ejaculation:true}}));assert.equal(new Set(cycle.map(c=>c.src)).size,poolCount);
 assert.equal(cycle.filter(c=>c.image).length,library.groups.penis.length);assert.notEqual(cycle[0].src,previous);previous=cycle.at(-1).src;
}
let now=1000,seq=0,output=[];const engine=createReactionEngine({now:()=>now,random:()=>0,onReaction:r=>{output.push(r);return true;}});
const event=(kind,postId='custom',tags=['sex','penis'],clientId='browser-client')=>({kind,postId,tags,clientId,seq:++seq,eventId:'copy-event-'+seq});
assert.equal(engine.receive(event('view','1')),'reacted');assert.equal(output.at(-1).rule,'h');
now+=100;assert.equal(engine.receive(event('copy'),{busy:true,voiceWaitMs:4900}),'queued','View cooldown must not discard copy');
now+=100;assert.equal(engine.receive(event('copy','custom',[],'native-keyboard-copy'),{busy:true}),'duplicate');
now+=500;assert.equal(engine.receive(event('copy'),{busy:true}),'coalesced');
assert.equal(engine.receive(event('view','2'),{busy:true}),'copy-priority');
now+=20000;engine.tick({busy:true,voiceWaitMs:5000});assert.equal(output.length,1);
engine.tick({voiceWaitMs:5000});assert.equal(output.length,1);now+=5000;engine.tick({});assert.equal(output.length,2);assert.equal(output.at(-1).rule,'copy');
assert.equal(engine.receive(event('copy')),'cooldown');
now+=5001;assert.equal(engine.receive(event('view','3'),{busy:true}),'queued');
assert.equal(engine.receive(event('copy'),{busy:true}),'queued');engine.tick({});assert.equal(output.length,3);assert.equal(output.at(-1).kind,'copy');engine.tick({});assert.equal(output.length,3,'Copy discards pending browsing response');
now+=5001;assert.equal(engine.receive(event('copy'),{voiceWaitMs:60000}),'queued');now+=60001;engine.tick({});assert.equal(output.length,4);
now+=5001;engine.receive(event('copy'),{busy:true});engine.receive(event('leave'));engine.tick({});assert.equal(output.length,4);
now+=5001;engine.receive(event('copy'),{busy:true});engine.tick({sleeping:true});engine.tick({});assert.equal(output.length,4);
assert.equal(engine.receive(event('view','4'),{sleeping:true}),'quiet');
let rejected=true;const retry=createReactionEngine({now:()=>now,onReaction:()=>rejected?false:output.push('accepted')});
assert.equal(retry.receive(event('copy')),'queued');rejected=false;retry.tick({});assert.equal(output.at(-1),'accepted');
console.log(JSON.stringify({adultTags:ADULT_TAGS.length,adultVoicePool:poolCount,unifiedViewCategory:true,copyOnlyMatchesCopyRules:true,exactMatching:true,migrationPreservesSettings:true,migrationOnce:true,shuffleCyclesWithoutRepetition:true,copyWaitsForAudioAndCooldown:true,independentEventCooldowns:true,copyHooksCoalesce:true,copyOverridesQueuedView:true,maxCooldownSupported:true,sleepAndLeaveClearQueue:true,rejectedDeliveryRetries:true}));

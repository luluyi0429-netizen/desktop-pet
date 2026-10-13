const {ADULT_TAGS}=require('./adult-tags.cjs');
const adult=new Set(ADULT_TAGS);
const POLICY=Object.freeze({repeatClickCount:5,clickWindowMs:4000,repeatClickCooldownMs:30000,
  chestProbability:.35,chestAfterProbability:.5,chestAfterMs:60000,
  dragProbability:.3,rareCooldownMs:60000,idleProbability:.15,idleEveryMs:30000,idleCooldownMs:180000,
  repeatTagsCount:3,repeatTagsProbability:.35,adultStreakCount:3,tagWindowMs:300000});
function greetingGroup(hour){return hour>=5&&hour<11?'greetingMorning':hour>=11&&hour<18?'greetingNoon':hour>=18&&hour<23?'greetingEvening':'greetingNight';}
function createConditionalVoices({now=Date.now,random=Math.random}={}){
  const played=new Map();let clicks=[],chestAt=-Infinity;
  const seen=new Map();let lastView=-Infinity,streak=0,lastSignature='',repeat=0;
  const ready=(g,ms)=>now()-(played.get(g)??-Infinity)>=ms;
  return {
    resetClicks(){clicks=[];},
    click(region,language){
      clicks=clicks.filter(t=>now()-t<=POLICY.clickWindowMs);clicks.push(now());
      if(clicks.length>=POLICY.repeatClickCount&&ready('repeatClick',POLICY.repeatClickCooldownMs))return 'repeatClick';
      if(region!=='chest')return null;
      if(language==='zh'&&now()-chestAt<POLICY.chestAfterMs&&random()<POLICY.chestAfterProbability)return 'touchChestAfter';
      return random()<POLICY.chestProbability?'touchChestChance':'touchChest';
    },
    drag(){return ready('dragRare',POLICY.rareCooldownMs)&&random()<POLICY.dragProbability?'dragRare':'drag';},
    idle(hour){
      if(ready('idleRare',POLICY.idleCooldownMs)&&random()<POLICY.idleProbability)return 'idleRare';
      if(hour>=18&&hour<23&&ready('eveningIdle',POLICY.idleCooldownMs)&&random()<POLICY.idleProbability)return 'eveningIdle';
      return null;
    },
    view(event){
      if(event.kind!=='view')return {};
      const key=(event.site||'danbooru')+':'+event.postId;
      if(seen.has(key)&&now()-seen.get(key)<POLICY.tagWindowMs)return {};
      seen.set(key,now());if(seen.size>512)seen.delete(seen.keys().next().value);
      if(now()-lastView>POLICY.tagWindowMs){streak=0;repeat=0;lastSignature='';}
      lastView=now();const tags=[...new Set(event.tags||[])].sort();
      const signature=tags.join('|');repeat=signature&&signature===lastSignature?repeat+1:1;lastSignature=signature;
      streak=tags.some(t=>adult.has(t))?streak+1:0;
      return {adultStreak:streak>=POLICY.adultStreakCount,repeatTags:repeat>=POLICY.repeatTagsCount,
        shy:tags.some(t=>['nude','naked','nake','completely_nude'].includes(t)),
        insertion:tags.some(t=>['penetration','vaginal','anal','insertion','deep_penetration'].includes(t)),
        ejaculation:tags.some(t=>['cum','ejaculation','cum_in_mouth','cum_in_pussy','cum_in_ass','internal_cum','creampie'].includes(t))};
    },
    tag(context={}){
      if(context.adultStreak&&ready('adultStreak',POLICY.rareCooldownMs))return 'adultStreak';
      if(context.repeatTags&&ready('repeatTags',POLICY.rareCooldownMs)&&random()<POLICY.repeatTagsProbability)return 'repeatTags';
      return null;
    },
    played(group,language){
      played.set(group,now());
      if(group==='repeatClick')clicks=[];
      if(group==='touchChestChance'&&language==='zh')chestAt=now();
      if(group==='touchChestAfter')chestAt=-Infinity;
    }
  };
}
module.exports={POLICY,greetingGroup,createConditionalVoices};

const MODES=Object.freeze({
  low:{label:'少说',probability:0.3,ambientMs:360000},
  normal:{label:'标准',probability:0.65,ambientMs:240000},
  high:{label:'多说',probability:1,ambientMs:120000}
});
function normalizeSpeech(value={}){
  return {
    voiceLanguage:'ja',
    workbenchSit:false,
    fallVoiceEnabled:value.fallVoiceEnabled!==false,
    voiceFrequency:Object.hasOwn(MODES,value.voiceFrequency)?value.voiceFrequency:'high',
    voiceCooldownSeconds:Number.isFinite(value.voiceCooldownSeconds)?Math.round(Math.max(1,Math.min(60,value.voiceCooldownSeconds))):5,
    volume:Number.isFinite(value.volume)?Math.round(Math.max(0,Math.min(100,value.volume))):100
  };
}
function createSpeechGate({now=Date.now,random=Math.random}={}){
  let nextAllowedAt=-Infinity;
  return {
    allow(settings,{muted=false,active=false,manual=false,important=false,wakeInterrupt=false}={}){
      if(muted||settings.volume===0)return false;
      // A deliberate manual button can bypass timing; repeated presses never layer audio.
      if(manual)return !active;
      if(wakeInterrupt)return true;
      if(active||now()<nextAllowedAt)return false;
      return important||random()<MODES[settings.voiceFrequency].probability;
    },
    started(settings){nextAllowedAt=now()+settings.voiceCooldownSeconds*1000;},
    finished(settings){nextAllowedAt=now()+settings.voiceCooldownSeconds*1000;},
    reset(){nextAllowedAt=-Infinity;},
    remaining(){return Math.max(0,nextAllowedAt-now());}
  };
}
module.exports={MODES,normalizeSpeech,createSpeechGate};

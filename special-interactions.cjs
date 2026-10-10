const RAPID_CLICKS=15,RAPID_GAP_MS=1000,WAKE_WINDOW_MS=5*60*1000,WAKE_LIMIT=3;
function createSpecialInteractions({now=Date.now,wakeWindowMs=WAKE_WINDOW_MS}={}) {
  let count=0,last=-Infinity,wakes=[];
  return {
    reset(){count=0;last=-Infinity;},
    resetAll(){this.reset();wakes=[];},
    click(wasSleeping=false){
      const time=now();
      if(wasSleeping){
        this.reset();wakes=wakes.filter(t=>time-t<=wakeWindowMs);wakes.push(time);
        if(wakes.length>=WAKE_LIMIT){wakes=[];return 'sleep-laowu';}
        return 'sleep-wake';
      }
      count=time-last<=RAPID_GAP_MS?count+1:1;last=time;
      if(count>=RAPID_CLICKS){this.reset();return 'rapid-click';}
      return null;
    }
  };
}
module.exports={createSpecialInteractions,RAPID_CLICKS,RAPID_GAP_MS,WAKE_WINDOW_MS,WAKE_LIMIT};

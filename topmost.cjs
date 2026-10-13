// Restore the pet after Show Desktop/browser activation without taking keyboard focus.
function createTopmostGuard({getPet,getOverlays=()=>[],isInteracting=()=>false,now=Date.now,interval=1000}) {
  let next=0,pending=false;
  return {
    request(){pending=true;},
    refresh(force=false) {
      if(force)pending=true;
      if(isInteracting())return;
      if(!force && now()<next)return;
      next=now()+interval;
      const pet=getPet();
      if(!pet||pet.isDestroyed()||pet.isVisible?.()===false||pet.isMinimized?.())return;
      const needsRepair=pet.isAlwaysOnTop?.()!==true;
      if(!needsRepair&&!pending)return;
      pending=false;
      if(needsRepair)pet.setAlwaysOnTop(true,'screen-saver');
      pet.moveTop();
      // Restore our own visible panels above the pet, never show a hidden window.
      for(const overlay of getOverlays()){
        if(overlay===pet||overlay.isDestroyed()||!overlay.isVisible?.()||overlay.isMinimized?.()||!overlay.isAlwaysOnTop?.())continue;
        overlay.moveTop();
      }
    }
  };
}
module.exports={createTopmostGuard};

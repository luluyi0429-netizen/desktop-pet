const path = require('node:path');
function createBubbleManager({BrowserWindow,screen,directory}) {
  let window, latest = null, loaded = false, lastKey = null, lastPosition = null, disposed = false;
  function ensureWindow() {
    if (window && !window.isDestroyed()) return;
    loaded=false;lastPosition=null;
    window=new BrowserWindow({width:202,height:202,frame:false,transparent:true,resizable:false,focusable:false,
      skipTaskbar:true,alwaysOnTop:true,show:false,hasShadow:false,backgroundColor:'#00000000',
      webPreferences:{preload:path.join(directory,'bubble-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window.setAlwaysOnTop(true,'screen-saver');window.setIgnoreMouseEvents(true);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    const created = window;
    window.webContents.on('did-finish-load',()=>{
      if (disposed || created.isDestroyed() || window !== created) return;
      loaded=true;if(latest){created.webContents.send('pet:bubble',latest);created.showInactive();}
    });
    window.loadFile(path.join(directory,'bubble.html')).catch(error=>console.warn('Bubble load failed:',error.message));
  }
  return {
    update(state) {
      if (disposed) return;
      const notice=state.notice,cue=state.audioCue;
      const speaking=cue?.text&&cue.expires>Date.now()&&!state.muted&&state.volume!==0;
      let payload=null;
      if(speaking)payload={id:'voice-'+cue.id,text:cue.text,image:cue.image};
      else if(notice?.image&&notice.expires>Date.now()&&!state.pressed&&!state.falling&&!state.climbing&&state.action!=='sleep')payload={...notice,id:'notice-'+notice.id};
      if (state.hidden || !payload) {
        latest=null;lastKey=null;if(window && !window.isDestroyed())window.hide();return;
      }
      ensureWindow();latest=payload;
      const key=JSON.stringify(payload);
      if (lastKey!==key) {lastKey=key;if(loaded)window.webContents.send('pet:bubble',payload);}
      const b=state.bounds,area=screen.getDisplayMatching(b).workArea;
      const width=payload.image?202:260,height=payload.image?202:90;
      const above=b.y-height;
      let targetX=b.x+(b.width-width)/2,targetY=above;
      if(above<area.y){targetX=b.x+b.width+6;if(targetX+width>area.x+area.width)targetX=b.x-width-6;targetY=b.y+20;}
      const x=Math.round(Math.max(area.x,Math.min(area.x+area.width-width,targetX)));
      const y=Math.round(Math.max(area.y,Math.min(area.y+area.height-height,targetY)));
      if(!lastPosition||lastPosition.x!==x||lastPosition.y!==y||lastPosition.width!==width||lastPosition.height!==height){window.setBounds({x,y,width,height});lastPosition={x,y,width,height};}
      if(loaded && !window.isVisible())window.showInactive();
    },
    destroy(){disposed=true;const previous=window;window=null;latest=null;loaded=false;lastKey=null;lastPosition=null;if(previous && !previous.isDestroyed())previous.destroy();}
  };
}
module.exports={createBubbleManager};

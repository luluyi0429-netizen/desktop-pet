let trimmedImage;
function loadTrimmedImage(){
  return new Promise(resolve=>{
    const source=new Image();
    source.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0);
        const data=context.getImageData(0,0,canvas.width,canvas.height).data;
        let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        if(right<left){resolve(source.src);return;}
        const crop=document.createElement('canvas');crop.width=right-left+1+12;crop.height=bottom-top+1+12;
        crop.getContext('2d').drawImage(source,left,top,right-left+1,bottom-top+1,6,6,right-left+1,bottom-top+1);
        resolve(crop.toDataURL('image/png'));
      }catch{resolve(source.src);}
    };
    source.onerror=()=>resolve('assets/reactions/oh-jing-jing.png');
    source.src='assets/reactions/oh-jing-jing.png';
  });
}
let currentNoticeId;
window.petBubble.onNotice(async notice=>{
  currentNoticeId=notice.id;
  const meme=notice.image==='assets/reactions/oh-jing-jing.png',image=document.querySelector('#meme');
  document.body.dataset.mode=meme?'meme':'text';image.hidden=!meme;
  document.querySelector('#line').textContent=String(notice.text||'');
  if(!meme)return;
  trimmedImage??=loadTrimmedImage();const src=await trimmedImage;
  if(currentNoticeId===notice.id)image.src=src;
});

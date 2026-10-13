const video=document.getElementById('video'),status=document.getElementById('status');
let sound={muted:true,volume:0};
function apply(value){if(!value)return;sound=value;video.volume=sound.volume/100;video.muted=sound.muted||sound.volume===0;}
function close(){video.pause();window.ragePlayer.close();}
document.getElementById('close').addEventListener('click',close);
window.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
window.ragePlayer.onSound(apply);
video.addEventListener('volumechange',()=>{if((sound.muted||sound.volume===0)&&!video.muted)video.muted=true;});
video.addEventListener('ended',close);
video.addEventListener('playing',()=>{status.hidden=true;});
video.addEventListener('error',()=>{status.textContent='视频加载失败，请确认已完整解压程序。';status.hidden=false;});
async function play(){try{await video.play();}catch{status.hidden=true;/* Native play control remains available. */}}
window.ragePlayer.sound().then(value=>{apply(value);return play();}).catch(()=>{status.textContent='无法读取播放设置，请关闭后重试。';status.hidden=false;});

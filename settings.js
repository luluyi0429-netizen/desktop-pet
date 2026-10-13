const api = window.desktopPet;
document.querySelectorAll('[data-site]').forEach(button=>button.addEventListener('click',()=>api.openSite(button.dataset.site)));
const slider = document.querySelector('#size');
const percent = document.querySelector('#percent');
document.querySelector('#tag-settings').addEventListener('click', () => api.openTagSettings());
document.querySelector('#text-assistant').addEventListener('click', () => api.openTextAssistant());
document.querySelector('#muted').addEventListener('change',event=>api.setMuted(event.target.checked));
document.querySelector('#laowu').addEventListener('click',()=>{api.laowu();api.closeSettings();});
document.querySelector('#rage').addEventListener('click',()=>api.rage());
let adjusting = false;
document.querySelector('#fall-voice').addEventListener('change',event=>api.setSpeechSettings({fallVoiceEnabled:event.target.checked}));
document.querySelector('#import-voices').addEventListener('click',async event=>{
 event.target.disabled=true;
 try{const result=await api.importVoices();document.querySelector('#voice-import-status').textContent=result.ok?'导入完成：日语 '+result.counts.ja+' 段，保留中文彩蛋 '+result.counts.zh+' 段；跳过 '+result.unused+' 个文件。':result.cancelled?'已取消。':result.error;}
 catch{document.querySelector('#voice-import-status').textContent='导入失败，请重试。';}finally{event.target.disabled=false;}
});
const editingVoice = new Set();
const voiceSliders = [
  {id:'volume',key:'volume',output:'volume-value',suffix:'%',fallback:100},
  {id:'voice-cooldown',key:'voiceCooldownSeconds',output:'cooldown-value',suffix:' 秒',fallback:5}
];
for(const control of voiceSliders){
  const input=document.getElementById(control.id),output=document.getElementById(control.output);
  input.addEventListener('pointerdown',()=>editingVoice.add(control.key));
  input.addEventListener('input',()=>{
    output.textContent=input.value+control.suffix;
    api.setSpeechSettings({[control.key]:Number(input.value)});
  });
  for(const event of ['pointerup','change','pointercancel'])input.addEventListener(event,()=>{
    editingVoice.delete(control.key);api.getState().then(render);
  });
}
document.querySelectorAll('[data-frequency]').forEach(button=>{
  button.addEventListener('click',()=>api.setSpeechSettings({voiceFrequency:button.dataset.frequency}));
});
function render(state) {
  if (!state) return;
  document.querySelector('#fall-voice').checked=state.fallVoiceEnabled!==false;
  slider.max = 200;
  document.querySelector('#walking').checked = state.walking;
  document.querySelector('#muted').checked=state.muted;
  for(const control of voiceSliders){
    if(!editingVoice.has(control.key)){
      const value=Number.isFinite(state[control.key])?state[control.key]:control.fallback;
      document.getElementById(control.id).value=value;
      document.getElementById(control.output).textContent=value+control.suffix;
    }
  }
  document.querySelectorAll('[data-frequency]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.frequency===(state.voiceFrequency||'high'))));
  document.querySelector('#laowu').disabled=Boolean(state.falling||state.climbing||state.pressed);
  document.querySelector('#support').textContent = state.explorer && state.explorer.error ? state.explorer.error : state.support ? '已停靠文件管理器边框' : '在任务栏活动 · 可拖到文件管理器边框';
  const value = Math.round(state.height / 3);
  if (!adjusting) slider.value = value;
  percent.textContent = `${value}%`;
}
api.onState(render);
api.getState().then(render);
slider.addEventListener('pointerdown', () => { adjusting = true; });
slider.addEventListener('input', () => {
  percent.textContent = `${slider.value}%`;
  api.setScale(Number(slider.value));
});
slider.addEventListener('change', () => { adjusting = false; api.getState().then(render); });
slider.addEventListener('pointercancel', () => { adjusting = false; api.getState().then(render); });
document.querySelector('#reset').addEventListener('click', () => api.setScale(100));
document.querySelector('#walking').addEventListener('change', event => api.setWalking(event.target.checked));
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => { api.preview(button.dataset.action); api.closeSettings(); });
});
document.querySelector('#stand').addEventListener('click', () => { api.stand(); api.closeSettings(); });
document.querySelector('#quit').addEventListener('click', () => api.quit());
document.querySelector('#close').addEventListener('click', () => api.closeSettings());
window.addEventListener('keydown', event => { if (event.key === 'Escape') api.closeSettings(); });

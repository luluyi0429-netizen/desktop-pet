const pet = document.querySelector('#pet');
const status = document.querySelector('#status');
const api = window.desktopPet;
let timer, lastHeight, lastNoticeId;
let activePointer = null;
let pointerStart, isDragging = false;
let clickIndex = -1;
const decodedImages = [];
let sprites, currentState, frameIndex = 0, animationTimer;
let playingAudio = null, lastAudioCueId = 0;
function renderAudio(state) {
  const cue = state.audioCue;
  if (state.hidden || state.muted || !cue) {
    if (playingAudio) {playingAudio.element.pause();playingAudio=null;}
    return;
  }
  const volume=Number.isFinite(state.volume)?Math.max(0,Math.min(1,state.volume/100)):1;
  if(playingAudio)playingAudio.element.volume=volume;
  if (cue.id===lastAudioCueId) return;
  lastAudioCueId=cue.id;
  if (playingAudio) playingAudio.element.pause();
  if (!/^assets\/audio\/(?:laowu\.aac|voices\/[a-zA-Z0-9_-]+\.(?:mp3|wav|aac|ogg|m4a))$/.test(cue.src) || cue.expires<=Date.now()) {api.audioEnded(cue.id,true);return;}
  const audio=new Audio(cue.src),entry={id:cue.id,element:audio};audio.volume=volume;playingAudio=entry;
  function complete(failed=false) {
    if (playingAudio!==entry) return;
    playingAudio=null;api.audioEnded(cue.id,failed);
  }
  audio.addEventListener('ended',()=>complete());
  audio.addEventListener('error',()=>complete(true));
  audio.play().catch(()=>complete(true));
}

function showStatus(message, duration = 1200, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
  status.classList.add('visible');
  clearTimeout(timer);
  timer = setTimeout(() => status.classList.remove('visible'), duration);
}
function displayFrame() {
  if (!sprites || !currentState) return;
  const frames = sprites.actions[currentState.action] || sprites.actions.idle;
  const index = currentState.action === 'click' ? (currentState.clickFrame || 0) % frames.length
    : currentState.action === 'sleep' ? Math.min(frameIndex, frames.length - 1) : frameIndex % frames.length;
  const frame = frames[index];
  if (pet.src !== frame.image) pet.src = frame.image;
  pet.style.width = `${frame.width * currentState.height}px`;
  pet.style.height = `${frame.height * currentState.height}px`;
  pet.dataset.action = currentState.action;
  pet.style.transform = currentState.action === 'climb' && currentState.climbing && currentState.climbing.side === 'right' ? 'scaleX(-1)' : '';
  pet.dataset.frame = String(index);
  pet.dataset.file = frame.file;
}
function render(state) {
  if (!state) return;
  renderAudio(state);
  if (!state.audioCue && state.notice && state.notice.id !== lastNoticeId) {
    lastNoticeId = state.notice.id;
    if (!state.notice.image && (!state.notice.expires || state.notice.expires > Date.now())) showStatus(state.notice.text, state.notice.duration || 1200, state.notice.kind || '');
  }
  if (status.dataset.kind === 'tag' && (state.audioCue || !state.notice || state.notice.image || state.hidden || state.pressed || state.falling || state.climbing || state.action === 'sleep')) { clearTimeout(timer); status.classList.remove('visible'); }
  const changed = !currentState || currentState.action !== state.action;
  currentState = state;
  if (changed) {
    clearInterval(animationTimer);
    frameIndex = 0;
    if (state.action.startsWith('walk-') || ['climb', 'sleep'].includes(state.action)) {
      const delay = state.action === 'sleep' ? 700 : state.action === 'climb' ? state.behavior.crawlFrameMs : state.behavior.walkFrameMs;
      animationTimer = setInterval(() => { frameIndex++; displayFrame(); }, delay);
    }
  }
  if (state.action === 'click') clickIndex = state.clickFrame;
  displayFrame();
  if (lastHeight !== undefined && lastHeight !== state.height) showStatus(`${Math.round(state.height / 300 * 100)}%`);
  lastHeight = state.height;
}
async function initialize() {
  sprites = await api.getSprites();
  // Decode every sprite before switching so transparent frames never flash blank.
  await Promise.all(Object.values(sprites.actions).flat().map(frame => {
    const image = new Image();
    decodedImages.push(image);
    image.src = frame.image;
    return image.decode();
  }));
  render(await api.getState());
  showStatus('点击互动 · 右键设置');
}
if (api) {
  api.onState(render);
  initialize().catch(() => showStatus('素材加载失败'));
  pet.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    pointerStart = { x: event.screenX, y: event.screenY };
    isDragging = false;
    // Capture on a stable parent, not the image whose dimensions change with poses.
    document.body.setPointerCapture(event.pointerId);
    if (currentState && sprites && currentState.action!=='laowu') {
      clickIndex = Math.floor(Math.random() * sprites.actions.click.length);
      render({ ...currentState, action: currentState.falling ? 'drag' : 'click', clickFrame: clickIndex });
    }
    // Begin holding immediately: movement and gravity pause before the threshold.
    api.dragStart(pointerStart, clickIndex);
  });
  window.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    if (!isDragging && Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) >= 5) {
      isDragging = true;
      document.body.classList.add('dragging');
    }
    if (isDragging) api.dragMove({ x: event.screenX, y: event.screenY });
  });
  function endDrag(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    document.body.classList.remove('dragging');
    api.dragEnd(event.type === 'pointerup');
    isDragging = false;
    if (document.body.hasPointerCapture(event.pointerId)) document.body.releasePointerCapture(event.pointerId);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // Focus loss or capture loss is not a mouse release. Keep the pet stationary.
  // A later pointerup still ends the hold; cancellation never starts gravity.
  window.addEventListener('contextmenu', event => { event.preventDefault(); api.openMenu(); });
} else { pet.src = 'assets/idle/1站立.png'; showStatus('请通过启动桌宠打开'); }

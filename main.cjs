const { app, BrowserWindow, screen, ipcMain, clipboard, globalShortcut, safeStorage, dialog, shell } = require('electron');
const path = require('node:path');
// Software composition keeps transparent windows visible with some Windows GPU drivers.
app.disableHardwareAcceleration();
const { advanceFall } = require('./fall-motion.cjs');
const { loadSprites } = require('./sprites.cjs');
const { syncMaterials } = require('./sync-materials.cjs');
const { advanceWalk } = require('./walk-motion.cjs');
const { BEHAVIOR, randomBetween, randomClick, isMoving } = require('./behavior.cjs');
const { makePlatforms, nearestPlatform, landingPlatform, platformPosition } = require('./platforms.cjs');
const { createExplorerMonitor } = require('./explorer-monitor.cjs');
const { createPreferences } = require('./preferences.cjs');
const { createPetTray } = require('./tray.cjs');
const { chooseClimb, climbGeometry, grabY, explainClimb, approach, crestPosition } = require('./climb-motion.cjs');
const { PORT, defaults: linkDefaults, createLinkStore, readPairingKey, createReactionEngine, createTagBridge } = require('./tag-link.cjs');
const { createSpecialInteractions } = require('./special-interactions.cjs');
const specialInteractions = createSpecialInteractions({now:()=>performance.now()});
const {syncVoiceLibrary,createVoicePicker}=require('./voice-library.cjs');
const {createBubbleManager}=require('./bubble-window.cjs');
const {MODES,normalizeSpeech,createSpeechGate}=require('./speech-policy.cjs');
const {createTextAssistant}=require('./text-assistant.cjs');
const {createConditionalVoices,greetingGroup,POLICY}=require('./conditional-voices.cjs');
const {createRageWindow}=require('./rage-window.cjs');
const {createTopmostGuard}=require('./topmost.cjs');
const topmostGuard=createTopmostGuard({getPet:()=>hidden?null:petWindow,getOverlays:()=>BrowserWindow.getAllWindows?.()||[],isInteracting:()=>Boolean(dragStart||settingsWindow||ragePlayer?.active()),now:()=>performance.now()});
const conditionalVoices=createConditionalVoices({now:()=>performance.now(),random:()=>Math.random()});
let ragePlayer=null,lastConditionalIdle=0,pendingInteraction=null;
let textAssistant = null;
function openTextAssistant() { textAssistant?.open(); }
const speechGate=createSpeechGate({now:()=>performance.now(),random:()=>Math.random()});
let speechSettings=normalizeSpeech();
let pickVoice=()=>null,hasVoice=()=>false,bubbleManager=null,muted=false,voiceCounts={zh:0,ja:0};
function refreshVoices(source){const library=syncVoiceLibrary(source);pickVoice=createVoicePicker(library);hasVoice=group=>(library.groups[group]||[]).some(c=>c.language===speechSettings.voiceLanguage||!c.language||c.legacy);voiceCounts=Object.fromEntries(['zh','ja'].map(language=>[language,Object.values(library.groups).flat().filter(c=>c.language===language).length]));return library;}
let audioCue=null,audioCueId=0,lastAmbientVoice=0;
function finishSpecialAudio(id,failed=false) {
  if(!audioCue||audioCue.id!==id)return;
  const previous=audioCue;audioCue=null;speechGate.finished(speechSettings);
  if(failed)notice={id:++noticeId,text:'语音播放失败，请检查音频素材',duration:2500,expires:Date.now()+2500};
  if(previous.pose&&action==='laowu'){setAction('idle');postponeWalk();}else publish();
}
function cancelVoice(){
  if(audioCue){audioCue=null;speechGate.finished(speechSettings);}
}
function queueVoice(group,{priority=10,force=false,reason=group,pose=false,genital=false}={}) {
  if(ragePlayer?.active())return null;
  const manual=reason==='manual-laowu';
  const important=['sleep','wake','laowu','penis','touchChest','touchChestChance','touchChestAfter','repeatClick','adultStreak','repeatTags','fall','dragRare','idleRare','eveningIdle'].includes(group)||group.startsWith('greeting');
  // Clicking a still-speaking sleeping pet may replace only its bedtime line with the wake response.
  const wakeInterrupt=reason==='sleep-laowu'||reason==='rapid-click'||(reason==='sleep-wake'&&audioCue?.reason==='sleep');
  if(!speechGate.allow(speechSettings,{muted,active:Boolean(audioCue),manual,important,wakeInterrupt}))return null;
  const clip=group==='laowu'?{src:'assets/audio/laowu.aac',text:''}:pickVoice(group,{language:speechSettings.voiceLanguage,genital});
  if(!clip)return null;
  conditionalVoices.played(group,speechSettings.voiceLanguage);
  speechGate.started(speechSettings);
  audioCue={id:++audioCueId,src:clip.src,text:group==='penis'?'哦鲸鲸？':clip.text,reason,priority,pose,image:clip.image,expires:Date.now()+30000};
  return clip;
}
function setSpeechSettings(value){
  if(!value||typeof value!=='object')return;
  const patch={};
  if(typeof value.fallVoiceEnabled==='boolean')patch.fallVoiceEnabled=value.fallVoiceEnabled;
  if(Object.hasOwn(MODES,value.voiceFrequency))patch.voiceFrequency=value.voiceFrequency;
  if(Number.isFinite(value.voiceCooldownSeconds))patch.voiceCooldownSeconds=value.voiceCooldownSeconds;
  if(Number.isFinite(value.volume))patch.volume=value.volume;
  speechSettings=normalizeSpeech({...speechSettings,...patch});
  if(speechSettings.volume===0){pendingInteraction=null;cancelVoice();if(action==='laowu')actionUntil=performance.now()+1000;}
  schedulePreferences();publish();
}
function activateLaowu(reason='manual-laowu') {
  pendingInteraction=null;conditionalVoices.resetClicks();
  if(!petWindow||hidden||dragStart||fallTimer||activeClimb||!docked)return false;
  if(action==='laowu'&&audioCue?.pose)return true;
  interact();specialInteractions.reset();movementUntil=0;notice=null;
  const clip=queueVoice('laowu',{priority:100,force:true,reason,pose:true});
  setAction(sprite.actions.laowu?.length?'laowu':'click',clip?0:4800);
  return true;
}
function setMuted(value) {
  if(typeof value!=='boolean')return;
  muted=value;
  if(muted){pendingInteraction=null;cancelVoice();if(action==='laowu')actionUntil=performance.now()+1000;}
  schedulePreferences();publish();
}
function triggerSpecialClick(wasSleeping,region=null) {
  if(action==='laowu'&&audioCue?.pose){specialInteractions.reset();return true;}
  const reason=specialInteractions.click(wasSleeping);
  if(reason==='sleep-laowu')return activateLaowu(reason);
  if(reason==='sleep-wake') {
    pendingInteraction=null;conditionalVoices.resetClicks();
    movementUntil=0;notice=null;
    queueVoice('wake',{priority:80,force:true,reason});
    clickFrame=chooseClick();setAction('click',700);return true;
  }
  if(reason==='rapid-click') {
    pendingInteraction=null;conditionalVoices.resetClicks();
    queueVoice('laowu',{priority:100,force:true,reason});
    clickFrame=chooseClick();setAction('click',450);return true;
  }
  const group=conditionalVoices.click(region,speechSettings.voiceLanguage);
  if(group==='repeatClick') {
    if(hasVoice(group)){
      if(!queueVoice(group,{priority:35})&&!muted&&speechSettings.volume>0&&!ragePlayer?.active())pendingInteraction={group,expires:performance.now()+95000};
    }else queueVoice(region==='chest'?'touchChest':'click',{priority:10});
  } else if(!group || !queueVoice(group,{priority:25})) {
    queueVoice(region==='chest'?'touchChest':'click',{priority:10});
  }
  return false;
}
let nativeCopySequence = 0;
function nativeCopy() {
  if (!tagEngine) return;
  tagEngine.receive({kind:'copy',clientId:'native-keyboard-copy',seq:++nativeCopySequence,
    postId:'custom',tags:[],eventId:'native-copy-' + nativeCopySequence},tagState());
}
let linkWindow, linkStore, tagBridge, tagEngine, pairingKey;
let linkConfig = linkDefaults(), linkLastSeen = 0;
function tagState() {
  return { hidden, sleeping: action === 'sleep', voiceWaitMs:(!muted&&speechSettings.volume>0)?speechGate.remaining():0, busy: Boolean(ragePlayer?.active() || audioCue || dragStart || fallTimer || activeClimb || !docked || !['idle','blink','sit'].includes(action)) };
}
function tagReaction(reaction) {
  if (!petWindow || petWindow.isDestroyed())return false;
  const status=tagState();if(status.hidden||status.sleeping||status.busy||status.voiceWaitMs>0)return false;
  const group=reaction.kind==='copy'||reaction.voice?'copy':({h:'h',body:'h',penis:'h',cute:'cute',sleepy:'sleep',copy:'copy'})[reaction.rule];
  const context=reaction.context||{};
  const conditional=reaction.kind==='view'?(conditionalVoices.tag(context)||(group==='h'&&context.shy?'shy':null)):null;
  const special=conditional?queueVoice(conditional,{priority:35,reason:'tag-'+conditional}):null;
  const clip=special||(group?queueVoice(group,{priority:30,reason:'tag-'+group,genital:reaction.genital===true}):null);
  const meme=Boolean(clip?.image);
  const duration=meme?Math.max(5000,reaction.duration):reaction.duration;
  notice={id:++noticeId,kind:'tag',text:clip?.text||reaction.text,duration,expires:Date.now()+duration,
    ...(meme?{image:clip.image}:{})};
  // Browser reactions show captions without repeatedly changing the standing pose.
  publish();return true;
}
function linkStatus() { return { ...(tagBridge ? tagBridge.status() : { listening: false, error: '', port: PORT }), lastSeen: linkLastSeen }; }
function publishLink() { if (linkWindow && !linkWindow.isDestroyed()) linkWindow.webContents.send('pet:link-status', linkStatus()); }
function startTagLink() {
  try {
    linkStore = createLinkStore(app.getPath('userData')); linkConfig = linkStore.read();
    pairingKey = readPairingKey(app.getPath('userData'));
    tagEngine = createReactionEngine({ config: linkConfig, onReaction: tagReaction, onView:event=>conditionalVoices.view(event) });
    tagBridge = createTagBridge({ key: pairingKey, onStatus: publishLink, onEvent(event) {
      linkLastSeen = Date.now(); publishLink();
      const result = tagEngine.receive(event, tagState());
      return result;
    } }); tagBridge.start();
  } catch (error) { console.warn('Could not start tag link:', error.message); }
}
function linkAllowed(event) { return linkWindow && !linkWindow.isDestroyed() && event.sender === linkWindow.webContents; }
function openTagSettings() {
  if (shuttingDown || !petWindow || petWindow.isDestroyed()) return;
  // Close the transient popup before constructing another native window on Windows.
  const oldPanel=settingsWindow;
  if(oldPanel && !oldPanel.isDestroyed()){
    oldPanel.once('closed',()=>setTimeout(openTagSettings,0));oldPanel.close();return;
  }
  if(linkWindow&&!linkWindow.isDestroyed()){
    if(linkWindow.isMinimized())linkWindow.restore();
    linkWindow.show();linkWindow.moveTop();linkWindow.focus();return;
  }
  const area=screen.getDisplayMatching(petWindow.getBounds()).workArea;
  const width=Math.min(540,area.width),height=Math.min(730,area.height);
  const window=new BrowserWindow({width,height,x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),
    title:'桌宠 · 标签联动',parent:petWindow,resizable:true,show:false,backgroundColor:'#f8f4f2',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  linkWindow=window;
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  const show=()=>{if(!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.moveTop();window.focus();}};
  window.once('ready-to-show',show);
  window.on('closed',()=>{if(linkWindow===window)linkWindow=null;});
  window.loadFile(path.join(__dirname,'tag-settings.html')).then(show).catch(error=>{
    console.warn('Could not open tag settings:',error.message);
    if(!window.isDestroyed())window.close();
    notice={id:++noticeId,text:'标签设置加载失败，请重试',duration:3000,expires:Date.now()+3000};publish();
  });
}
let activeClimb = null, notice = null, noticeId = 0;
let shuttingDown = false;
function shutdownPet() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop producers first so no callback can resurrect a window during exit.
  stopFall(); clearInterval(behaviorTimer); clearTimeout(preferenceTimer);
  activeClimb = null; dragStart = null; audioCue = null; notice = null;
  const cleanups = [
    () => ragePlayer?.destroy(),
    () => textAssistant?.destroy(),
    () => bubbleManager?.destroy(),
    () => tagBridge?.stop(),
    () => explorerMonitor?.stop(),
    () => savePreferences(),
    () => { if (petTray) { petTray.destroy(); petTray = null; } },
    () => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy(); settingsWindow = null; },
    () => { if (linkWindow && !linkWindow.isDestroyed()) linkWindow.destroy(); linkWindow = null; }
  ];
  for (const cleanup of cleanups) {
    try { cleanup(); } catch (error) { console.warn('Pet shutdown cleanup failed:', error.message); }
  }
}
let preferences, petTray, preferenceTimer, hidden = false;
let supportMissingSince = null;
function savePreferences() {
  clearTimeout(preferenceTimer);
  if (!preferences) return;
  try { preferences.write({ height: petHeight, walking, muted, ...speechSettings }); }
  catch (error) { console.warn('Could not save pet preferences:', error.message); }
}
function schedulePreferences() {
  clearTimeout(preferenceTimer);
  preferenceTimer = setTimeout(savePreferences, 250);
}
let explorerMonitor, support = null;
let lastInteraction = performance.now();
let movementUntil = 0;
let petWindow, settingsWindow, sprite, dragStart, fallTimer;
let behaviorTimer;
let action = 'idle';
let actionUntil = 0;
let walking = true;
let nextWalk = performance.now() + randomBetween(BEHAVIOR.restMin, BEHAVIOR.restMax);
let nextBlink = performance.now() + 2500;
let movementX = 0;
let walkDirection = -1;
let clickFrame = 0, sitFrame = 0, nextSitPose = 0;
let petHeight = 300;
let petSize = null;
let docked = true;
const TOP = 24;
function display() { return screen.getDisplayMatching(petWindow.getBounds()); }
function movePet(x, y) {
  const size = petSize || petWindow.getBounds();
  // Keep size explicit: repeated setPosition calls can accumulate DPI rounding
  // in the native window height on Windows at fractional display scaling.
  petWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: size.width, height: size.height });
}
function state() {
  return { action, clickFrame, sitFrame, walking, muted, ...speechSettings, hidden, notice, audioCue, climbing: activeClimb ? { phase: activeClimb.phase, side: activeClimb.side, windowId: activeClimb.windowId } : null, direction: walkDirection, pressed: Boolean(dragStart), falling: Boolean(fallTimer), height: petHeight, docked, support: support ? { id: support.id, edge: support.edge } : null, explorer: explorerMonitor ? explorerMonitor.status() : null, behavior: BEHAVIOR, bounds: petWindow.getBounds(), workArea: display().workArea };
}
function setAction(next, duration = 0) {
  const previous=action;
  if(next==='sleep'&&previous!=='sleep')queueVoice('sleep',{priority:50,force:true});
  if(next==='sit'&&previous!=='sit'){
    sitFrame=randomClick(sprite.actions.sit.length);
    nextSitPose=performance.now()+randomBetween(BEHAVIOR.sitPoseMin,BEHAVIOR.sitPoseMax);
    queueVoice('sit',{priority:10});
  }
  action = next;
  actionUntil = duration ? performance.now() + duration : 0;
  if (isMoving(next)) movementX = petWindow.getBounds().x;
  if (petWindow) publish();
}
function postponeWalk() { nextWalk = performance.now() + randomBetween(BEHAVIOR.restMin, BEHAVIOR.restMax); }
function interact() { lastInteraction = performance.now(); postponeWalk(); }
function chooseClick(index) {
  return Number.isInteger(index) && index >= 0 && index < sprite.actions.click.length ? index : randomClick(sprite.actions.click.length);
}
function availablePlatforms() {
  return makePlatforms(explorerMonitor ? explorerMonitor.getWindows() : [], display().workArea);
}
function attach(platform) {
  supportMissingSince = null;
  support = platform;
  docked = true;
  const bounds=petWindow.getBounds();
  const position = platformPosition(platform, bounds, bounds.x);
  movePet(position.x, position.y);
  movementX = position.x;
}
function followSupport() {
  if (!support || dragStart || fallTimer) return;
  const previous = support;
  const platform = availablePlatforms().find(p => p.id === previous.id);
  const bounds = petWindow.getBounds();
  const area = display().workArea;
  if (!platform) {
    supportMissingSince ??= performance.now();
    if (performance.now() - supportMissingSince < BEHAVIOR.supportGraceMs) return;
  } else supportMissingSince = null;
  if (!platform || platform.right - platform.left < bounds.width || platform.y - bounds.height < area.y || platform.y > area.y + area.height) {
    support = null; docked = false; beginFall(true); return;
  }
  const position = platformPosition(platform, bounds, bounds.x + platform.left - previous.left);
  support = platform;
  if (bounds.x !== position.x || bounds.y !== position.y) {
    movePet(position.x, position.y); movementX = position.x;
  }
}
function beginMovement(crawl = Math.random() < BEHAVIOR.crawlChance) {
  if (crawl && beginClimb()) return;
  movementUntil = performance.now() + randomBetween(BEHAVIOR.moveMin, BEHAVIOR.moveMax);
  queueVoice('walk',{priority:5});
  setAction(walkDirection < 0 ? 'walk-left' : 'walk-right');
}
function stopClimb() {
  const airborne = Boolean(activeClimb && activeClimb.phase !== 'approach');
  activeClimb = null;
  movementUntil = 0;
  return airborne;
}
function abortClimb() {
  const manual = activeClimb?.manual;
  const airborne = stopClimb();
  if (airborne) beginFall(true);
  else { setAction('idle'); postponeWalk(); }
}
function beginClimb(manual = false) {
  if (!docked || dragStart || fallTimer || activeClimb) return false;
  const bounds = petWindow.getBounds(), area = display().workArea;
  const windows = explorerMonitor ? explorerMonitor.getWindows() : [];
  const maxApproach = manual ? Math.max(BEHAVIOR.climbApproachMax, area.width) : BEHAVIOR.climbApproachMax;
  let plan = chooseClimb(windows, bounds, area, support, maxApproach, manual);
  let depart = false;
  // A deliberate command can leave the workbench or another platform first.
  if (!plan && manual && support) {
    const targets = support.edge === 'top' ? windows.filter(w => w.id !== support.windowId) : windows;
    plan = chooseClimb(targets, {...bounds, y: area.y + area.height - bounds.height}, area, null, maxApproach, true);
    depart = Boolean(plan);
  }
  if (!plan) {
    if (manual) {
      const status = explorerMonitor?.status();
      const text = status?.error || (status && !status.ready ? '窗口检测正在启动，请稍等两秒再试' :
        explainClimb(windows, bounds, area, support, maxApproach));
      notice = { id: ++noticeId, text, duration: 6000, expires: Date.now()+6000 };
      setAction('idle');
    }
    return false;
  }
  notice = null;
  activeClimb = { ...plan, manual, phase: depart ? 'depart' : 'approach', started: performance.now(), missingSince: null,
    x: bounds.x, renderedX: bounds.x, y: bounds.y, velocity: 0, crestElapsed: 0,
    deadline: performance.now()+Math.max(45000, (area.width/BEHAVIOR.walkSpeed+area.height/BEHAVIOR.climbSpeed+15)*1000) };
  movementUntil = 0;
  if (depart) { support = null; docked = false; setAction('drag'); }
  else { walkDirection = plan.geometry.sideX < bounds.x ? -1 : 1; setAction(walkDirection < 0 ? 'walk-left' : 'walk-right'); }
  return true;
}
function updateClimb(dt, now) {
  const plan = activeClimb;
  if (!plan) return;
  const window = (explorerMonitor ? explorerMonitor.getWindows() : []).find(w => w.id === plan.windowId);
  if (!window) {
    plan.missingSince ??= now;
    if (now - plan.missingSince >= BEHAVIOR.supportGraceMs) abortClimb();
    return;
  }
  plan.missingSince = null;
  const bounds = petWindow.getBounds(), area = display().workArea;
  const geometry = climbGeometry(window, bounds, area, plan.side, plan.inside);
  if (!geometry || now > plan.deadline) { abortClimb(); return; }
  if (plan.phase === 'depart') {
    const next = advanceFall(plan.y, area.y + area.height - bounds.height, plan.velocity, dt);
    plan.y = next.position; plan.velocity = next.velocity;
    movePet(bounds.x, plan.y);
    if (next.landed) {
      docked = true; plan.phase = 'approach'; plan.x = petWindow.getBounds().x; plan.renderedX = plan.x;
      walkDirection = geometry.sideX < plan.x ? -1 : 1;
      setAction(walkDirection < 0 ? 'walk-left' : 'walk-right');
    }
  } else if (plan.phase === 'approach') {
    if (!docked || (plan.inside && (!support || support.windowId !== plan.windowId)) ||
        (support && (geometry.sideX < support.left || geometry.sideX + bounds.width > support.right))) { abortClimb(); return; }
    if (!plan.manual && !plan.inside && window.bounds.y + window.bounds.height < bounds.y + bounds.height - bounds.height * .8) { abortClimb(); return; }
    // Retain fractional motion while accounting for support-window movement.
    if (plan.inside) plan.x += bounds.x - plan.renderedX;
    const direction = geometry.sideX < plan.x ? -1 : 1;
    if (direction !== walkDirection) { walkDirection = direction; setAction(direction < 0 ? 'walk-left' : 'walk-right'); }
    plan.x = approach(plan.x, geometry.sideX, BEHAVIOR.walkSpeed * dt);
    movePet(plan.x, bounds.y);
    plan.renderedX = petWindow.getBounds().x;
    if (Math.abs(plan.x - geometry.sideX) < .6) {
      plan.y = petWindow.getBounds().y;
      plan.phase = plan.manual && !plan.inside && grabY(window, bounds, area) < plan.y - .6 ? 'hop' : 'ascend';
      plan.geometry = geometry; support = null; docked = false;
      setAction(plan.phase === 'hop' ? 'drag' : 'climb');
    }
  } else if (plan.phase === 'hop') {
    plan.y = approach(plan.y, grabY(window, bounds, area), BEHAVIOR.climbSpeed * 4 * dt);
    plan.y = Math.max(area.y, Math.min(area.y + area.height - bounds.height, plan.y));
    movePet(geometry.sideX, plan.y);
    if (Math.abs(plan.y - grabY(window, bounds, area)) < .6) { plan.phase = 'ascend'; setAction('climb'); }
  } else if (plan.phase === 'ascend') {
    plan.y += geometry.frameY - plan.geometry.frameY;
    plan.y = approach(plan.y, geometry.topY, BEHAVIOR.climbSpeed * dt);
    plan.y = Math.max(area.y, Math.min(area.y + area.height - bounds.height, plan.y));
    movePet(geometry.sideX, plan.y);
    if (Math.abs(plan.y - geometry.topY) < .6) {
      plan.phase = 'crest'; plan.crestElapsed = 0; publish();
    }
  } else {
    plan.crestElapsed += dt * 1000;
    const position = crestPosition(geometry, plan.crestElapsed, BEHAVIOR.climbOverMs, area.y);
    movePet(position.x, position.y);
    if (position.done) {
      activeClimb = null;
      attach(geometry.platform);
      queueVoice('climbTop',{priority:15,force:true});
      setAction('land', 500); postponeWalk();
      return;
    }
  }
  plan.geometry = geometry;
}
function startBehavior() {
  let last = performance.now();
  behaviorTimer = setInterval(() => {
    if(dragStart&&dragStart.pointerType==='mouse'&&performance.now()-dragStart.started>350){
      const pointer=explorerMonitor?.getPointer?.();
      // Require a fresh native release sample after this hold started. A held
      // button never times out, including a stationary long press.
      if(pointer&&!pointer.pressed&&pointer.at>dragStart.nativeStarted+200)endPetHold(true,false);
    }
    topmostGuard.refresh();
    if (audioCue && Date.now() >= audioCue.expires) finishSpecialAudio(audioCue.id, true);
    if (tagEngine) tagEngine.tick(tagState());
    if(bubbleManager&&petWindow)bubbleManager.update(state());
    if(ragePlayer?.active()){last=performance.now();return;}
    if(pendingInteraction){
      if(performance.now()>pendingInteraction.expires||hidden||action==='sleep')pendingInteraction=null;
      else if(!dragStart&&!fallTimer&&!activeClimb&&!audioCue&&queueVoice(pendingInteraction.group,{priority:35})){pendingInteraction=null;publish();}
    }
    if (!petWindow || hidden || dragStart || fallTimer) { last = performance.now(); return; }
    const now = performance.now();
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    followSupport();
    if (fallTimer) return;
    if (activeClimb) { updateClimb(dt, now); return; }
    if (docked && !settingsWindow && !audioCue && action!=='laowu' && now - lastInteraction >= BEHAVIOR.sleepAfter && action !== 'sleep') {
      movementUntil = 0; setAction('sleep'); return;
    }
    if(docked&&!settingsWindow&&!audioCue&&['idle','blink'].includes(action)&&sprite.actions.sit?.length&&now-lastInteraction>=BEHAVIOR.sitAfter){
      movementUntil=0;setAction('sit');
    }
    if(action==='sit'&&now>=nextSitPose){
      const count=sprite.actions.sit.length;
      if(count>1)sitFrame=(sitFrame+1+randomClick(count-1))%count;
      nextSitPose=now+randomBetween(BEHAVIOR.sitPoseMin,BEHAVIOR.sitPoseMax);publish();
    }
    if (actionUntil && now >= actionUntil) {
      const previous = action;
      setAction('idle');
      if (previous !== 'blink') postponeWalk();
      nextBlink = now + 2500 + Math.random() * 3000;
    }
    if (isMoving(action) && movementUntil && now >= movementUntil) {
      movementUntil = 0; setAction('idle'); postponeWalk();
    }
    if (isMoving(action)) {
      const bounds = petWindow.getBounds();
      const area = display().workArea;
      const direction = action === 'walk-left' ? -1 : 1;
      const left = support ? support.left : area.x;
      const right = support ? support.right : area.x + area.width;
      const next = advanceWalk(movementX, direction, left, right - bounds.width, dt, BEHAVIOR.walkSpeed);
      movementX = next.position;
      movePet(movementX, bounds.y);
      if (next.direction !== direction) {
        walkDirection = next.direction;
        setAction(next.direction < 0 ? 'walk-left' : 'walk-right');
      }
    } else if (['idle','sit'].includes(action) && docked && !settingsWindow) {
      if (action==='idle' && !audioCue && walking && now >= nextWalk) {
        beginMovement();
      } else if (action==='idle'&&now >= nextBlink) setAction('blink', 160);
      if(!audioCue&&now-lastAmbientVoice>=MODES[speechSettings.voiceFrequency].ambientMs){lastAmbientVoice=now;queueVoice('idle',{priority:5});publish();}
      if(!audioCue&&now-lastConditionalIdle>=POLICY.idleEveryMs){lastConditionalIdle=now;const group=conditionalVoices.idle(new Date().getHours());if(group&&queueVoice(group,{priority:5}))publish();}
    }
  }, 16);
}
function publish() {
  if (shuttingDown || !petWindow || petWindow.isDestroyed()) return;
  const value = state();
  ragePlayer?.update();
  if (petTray) petTray.update({ height: petHeight, walking, hidden, muted });
  if(bubbleManager)bubbleManager.update(value);
  petWindow.webContents.send('pet:state', value);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const { image, ...settings } = value;
    settingsWindow.webContents.send('pet:state', settings);
  }
}
function layout(next = petHeight, snap = docked) {
  const old = petWindow.getBounds();
  const area = display().workArea;
  const max = Math.max(60, Math.min(600, Math.floor((area.height - TOP) / sprite.heightFactor)));
  petHeight = Math.round(Math.max(Math.min(140, max), Math.min(max, next)));
  const width = Math.ceil(petHeight * sprite.aspect) + 24;
  const height = Math.ceil(petHeight * sprite.heightFactor) + TOP;
  if (support && (support.right - support.left < width || support.y - height < area.y)) support = null;
  const left = snap && support ? support.left : area.x;
  const right = snap && support ? support.right : area.x + area.width;
  const x = Math.round(Math.max(left, Math.min(right - width, old.x + (old.width - width) / 2)));
  const foot = snap ? support ? support.y : area.y + area.height : old.y + old.height;
  const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - height, foot - height)));
  docked = snap;
  petWindow.setBounds({ x, y, width, height });
  // Windows display scaling can round a requested size by one logical pixel.
  // Anchor using the actual window size after resizing.
  const actual = petWindow.getBounds();
  petSize = { width: actual.width, height: actual.height };
  if (snap && actual.y + actual.height !== foot) {
    movePet(actual.x, foot - actual.height);
  }
  if (isMoving(action)) movementX = petWindow.getBounds().x;
  publish();
}
function allowed(event) { return petWindow && !petWindow.isDestroyed() && event.sender === petWindow.webContents; }
function revealPet() {
  if (shuttingDown) return;
  if (!petWindow || petWindow.isDestroyed()) return;
  stopClimb();
  hidden = false;
  stopFall();
  dragStart = null;
  support = null;
  interact();
  setAction('idle');
  postponeWalk();
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = petWindow.getBounds();
  movePet(area.x + area.width - bounds.width - 100, area.y + area.height - bounds.height);
  layout(petHeight, true);
  if (petWindow.isMinimized()) petWindow.restore();
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.show();
  petWindow.moveTop();
}
function settingsAllowed(event) {
  return settingsWindow && !settingsWindow.isDestroyed() && event.sender === settingsWindow.webContents;
}
function setWalking(value) {
  const climbingAirborne = stopClimb();
  interact();
  walking = value;
  if (isMoving(action) || action === 'sleep') setAction('idle');
  postponeWalk();
  schedulePreferences();
  publish();
  if (climbingAirborne) beginFall(true);
}
function setScale(percent) {
  if (dragStart) return;
  const climbingAirborne = stopClimb();
  if (isMoving(action)) setAction('idle');
  interact();
  const falling = Boolean(fallTimer);
  stopFall();
  layout(300 * Math.max(50, Math.min(200, percent)) / 100, docked);
  schedulePreferences();
  if (falling || climbingAirborne) beginFall();
}
function setVisible(visible) {
  if (!petWindow || petWindow.isDestroyed()) return;
  hidden = !visible;
  interact();
  if (!visible) {
    cancelVoice();specialInteractions.reset();
    stopClimb();
    if (settingsWindow) settingsWindow.close();
    stopFall(); dragStart = null; movementUntil = 0; setAction('idle');
    petWindow.hide();
  } else {
    if (petWindow.isMinimized()) petWindow.restore();
    petWindow.show();
    if (docked) followSupport();
    else beginFall();
  }
  publish();
}
function stopFall() {
  clearInterval(fallTimer);
  fallTimer = null;
}
function beginFall(forceDesktop = false) {
  if (dragStart) return;
  stopClimb();
  stopFall();
  support = null;
  docked = false;
  if (!forceDesktop) {
    const platform = nearestPlatform(availablePlatforms(), petWindow.getBounds(), display().workArea, BEHAVIOR.snapDistance);
    if (platform) { attach(platform); setAction('land', 500); postponeWalk(); return; }
  }
  setAction('drag');
  layout(petHeight, false);
  let position = petWindow.getBounds().y;
  if(speechSettings.fallVoiceEnabled&&display().workArea.y+display().workArea.height-petWindow.getBounds().height-position>BEHAVIOR.snapDistance)queueVoice('fall',{priority:25});
  publish();
  let velocity = 0;
  let last = performance.now();
  fallTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) { stopFall(); return; }
    const now = performance.now();
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    const bounds = petWindow.getBounds();
    const area = display().workArea;
    const platform = forceDesktop ? null : landingPlatform(availablePlatforms(), bounds, area, position + bounds.height);
    const target = (platform ? platform.y : area.y + area.height) - bounds.height;
    const next = advanceFall(position, target, velocity, dt);
    position = next.position;
    velocity = next.velocity;
    movePet(bounds.x, position);
    if (next.landed) {
      stopFall();
      if (platform) attach(platform);
      else layout(petHeight, true);
      queueVoice('land',{priority:15,force:true});
      setAction('land', 500);
      postponeWalk();
    }
  }, 16);
}
function openSettings() {
  if (shuttingDown || !petWindow || petWindow.isDestroyed()) return;
  if (hidden) setVisible(true);
  if (activeClimb) abortClimb();
  interact();
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  if (!dragStart && !fallTimer && (isMoving(action) || action === 'sleep')) setAction('idle');
  postponeWalk();
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  settingsWindow = new BrowserWindow({
    width: 350, height: Math.min(660,area.height),
    x: Math.round(Math.max(area.x, Math.min(cursor.x + 8, area.x + area.width - 350))),
    y: Math.round(Math.max(area.y, Math.min(cursor.y + 8, area.y + area.height - Math.min(660,area.height)))),
    parent: petWindow, frame: false, resizable: false, skipTaskbar: true,
    alwaysOnTop: true, show: false, backgroundColor: '#f5f3f1',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setAlwaysOnTop(true, 'screen-saver');
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', event => event.preventDefault());
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  const panel = settingsWindow;
  panel.once('ready-to-show', () => { if (!panel.isDestroyed()) panel.show(); });
  panel.on('blur', () => { if (!panel.isDestroyed()) panel.close(); });
  panel.on('closed', () => { if (settingsWindow === panel) settingsWindow = null; postponeWalk(); });
}
function createWindow() {
  preferences = createPreferences(app.getPath('userData'));
  const saved = preferences.read();
  petHeight = saved.height;
  walking = saved.walking;
  muted=saved.muted===true;
  speechSettings=normalizeSpeech(saved);
  syncMaterials();
  refreshVoices();
  bubbleManager=createBubbleManager({BrowserWindow,screen,directory:__dirname});
  ragePlayer=createRageWindow({BrowserWindow,screen,ipcMain,directory:__dirname,getOwner:()=>petWindow,getSound:()=>({muted,volume:speechSettings.volume}),
    onOpen(){cancelVoice();pendingInteraction=null;notice=null;interact();stopClimb();stopFall();support=null;dragStart=null;layout(petHeight,true);setAction('idle');if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.close();},
    onClose(){if(shuttingDown)return;interact();speechGate.finished(speechSettings);publish();}
  });
  sprite = loadSprites();
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    width: 240, height: 324, x: area.x + area.width - 264, y: area.y + area.height - 324,
    frame: false, transparent: true, resizable: false, movable: true, alwaysOnTop: true, focusable: false,
    skipTaskbar: true, hasShadow: false, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.on('blur',()=>topmostGuard.request());
  petWindow.on('restore',()=>topmostGuard.refresh(true));
  petWindow.setMenuBarVisibility(false);
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', event => event.preventDefault());
  layout(petHeight, true);
  petWindow.loadFile(path.join(__dirname, 'desktop_pet.html'));
  petWindow.once('ready-to-show',()=>{revealPet();queueVoice(greetingGroup(new Date().getHours()),{priority:40});publish();});
  petWindow.on('closed', () => {
    const wasQuitting = shuttingDown;
    petWindow = null;
    shutdownPet();
    if (!wasQuitting) app.quit();
  });
  explorerMonitor = createExplorerMonitor(screen, () => {}, nativeCopy,()=>topmostGuard.request());
  explorerMonitor.start();
  textAssistant = createTextAssistant({app,BrowserWindow,screen,ipcMain,globalShortcut,clipboard,safeStorage,shell,
    getOwner:()=>petWindow,
    beforeOpen(){if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.close();interact();},
    onResult({task}){
      const label={translate:'翻译',filter:'标签'}[task];
      queueVoice(task,{priority:15});
      notice={id:++noticeId,text:label+'整理好啦，来看看吧。',duration:3500,expires:Date.now()+3500};publish();
    }});
  try {
    petTray = createPetTray(sprite.actions.idle[0].image, {
      walking: setWalking, scale: setScale, visible: setVisible, muted:setMuted, laowu:activateLaowu, rage:()=>ragePlayer?.open(),
      settings: openSettings, tags:openTagSettings, text:openTextAssistant, home: revealPet, quit: () => app.quit()
    });
    petTray.update({ height: petHeight, walking, hidden, muted });
  } catch (error) { console.warn('Could not create pet tray:', error.message); }
  startBehavior();
  startTagLink();
  screen.on('display-metrics-changed', () => { if (petWindow) layout(); });
  screen.on('display-removed', () => { if (petWindow) layout(petHeight, true); });
}
ipcMain.on('pet:link-open', event => { if (settingsAllowed(event)||allowed(event)) openTagSettings(); });
ipcMain.on('pet:text-open', event => { if(settingsAllowed(event)||allowed(event))openTextAssistant(); });
ipcMain.on('pet:site-open',(event,site)=>{
  if(!settingsAllowed(event))return;
  const sites={civitai:'https://civitai.red/',danbooru:'https://danbooru.donmai.us/'};
  if(typeof site!=='string'||!Object.hasOwn(sites,site))return;
  settingsWindow.close();
  shell.openExternal(sites[site]).catch(()=>{notice={id:++noticeId,text:'浏览器打开失败，请稍后重试',duration:2500,expires:Date.now()+2500};publish();});
});
ipcMain.handle('pet:link-get', event => linkAllowed(event) ? { config: linkConfig, status: linkStatus() } : null);
ipcMain.handle('pet:link-save', (event, value) => {
  if (!linkAllowed(event) || !linkStore) return { ok: false, error: '联动服务尚未就绪' };
  try { linkConfig = linkStore.write(value); tagEngine.configure(linkConfig);
    if (!linkConfig.enabled && notice?.kind === 'tag') { notice = null; publish(); }
    return { ok: true, config: linkConfig };
  } catch { return { ok: false, error: '设置保存失败，请重试' }; }
});
ipcMain.handle('pet:link-pair', event => {
  if (!linkAllowed(event) || !pairingKey) return false;
  clipboard.writeText('DPT1:' + PORT + ':' + pairingKey); return true;
});
ipcMain.handle('pet:link-test', (event, text) => {
  if (!linkAllowed(event)) return false;
  return tagReaction({ text: typeof text === 'string' && text.trim() ? text.trim().slice(0, 32) : 'H！', duration: linkConfig.bubbleSeconds * 1000 });
});
ipcMain.handle('pet:get-state', event => {
  if (allowed(event)) return state();
  if (settingsAllowed(event)) { const { image, ...value } = state(); return value; }
  return null;
});
ipcMain.handle('pet:get-sprites', event => allowed(event) ? sprite : null);
ipcMain.on('pet:audio-ended', (event,id,failed) => {
  if (allowed(event) && Number.isSafeInteger(id)) finishSpecialAudio(id,failed===true);
});
ipcMain.on('pet:click', event => {
  if (!allowed(event) || dragStart || fallTimer || !docked) return;
  const wasSleeping = action === 'sleep';
  interact();
  if (triggerSpecialClick(wasSleeping)) return;
  if(action!=='sit'){clickFrame = chooseClick();setAction('click', 450);}else publish();
  postponeWalk();
});
ipcMain.on('pet:speech-settings',(event,value)=>{if(settingsAllowed(event))setSpeechSettings(value);});
ipcMain.handle('pet:voice-import',async(event)=>{
 if(!settingsAllowed(event)||!dialog)return {ok:false,error:'请在设置面板操作。'};
 try{const selected=await dialog.showOpenDialog(settingsWindow,{title:'选择配音文件夹',properties:['openDirectory']});
 if(selected.canceled)return {ok:false,cancelled:true};
 const library=refreshVoices(selected.filePaths[0]);publish();return {ok:true,counts:voiceCounts,unused:library.unused.length};
 }catch(error){return {ok:false,error:'导入失败：'+error.message};}
});
ipcMain.on('pet:muted',(event,value)=>{if(settingsAllowed(event))setMuted(value);});
ipcMain.on('pet:laowu',event=>{if(settingsAllowed(event)){activateLaowu();}});
ipcMain.on('pet:rage',event=>{if(settingsAllowed(event))ragePlayer?.open();});
ipcMain.on('pet:walking', (event, value) => {
  if (!settingsAllowed(event) || typeof value !== 'boolean') return;
  setWalking(value);
});
ipcMain.on('pet:scale', (event, percent) => {
  if (!settingsAllowed(event) || !Number.isFinite(percent) || dragStart) return;
  setScale(percent);
});
ipcMain.on('pet:drag-start', (event, point, reaction, region, pointerType='mouse') => {
  if (allowed(event)) {
    pointerType=['touch','pen'].includes(pointerType)?pointerType:'mouse';
    if(dragStart)endPetHold(false,false,false);
    const wasSleeping = action === 'sleep';
    interact();
    const climbingAirborne = stopClimb();
    const wasFalling = !docked || Boolean(fallTimer) || climbingAirborne;
    stopFall();
    if (settingsWindow) settingsWindow.close();
    postponeWalk();
    const cursor = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : screen.getCursorScreenPoint();
    dragStart = { cursor, bounds: petWindow.getBounds(), moved: false, wasFalling, wasSleeping, region:region==='chest'?'chest':null, started:performance.now(),nativeStarted:Date.now(),pointerType };
    if (wasFalling) setAction('drag');
    else if (action !== 'laowu' && action !== 'sit') {
      clickFrame = chooseClick(reaction);
      setAction('click', 450);
    }else publish();
  }
});
ipcMain.on('pet:drag-move', (event, point) => {
  if (!allowed(event) || !dragStart) return;
  const cursor = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : screen.getCursorScreenPoint();
  if (!dragStart.moved && Math.hypot(cursor.x - dragStart.cursor.x, cursor.y - dragStart.cursor.y) < 5) return;
  if (!dragStart.moved) {
    conditionalVoices.resetClicks();pendingInteraction=null;
    specialInteractions.reset();
    cancelVoice();
    const group=conditionalVoices.drag();if(!queueVoice(group,{priority:20}))queueVoice('drag',{priority:20});
    dragStart.moved = true;
    support = null;
    docked = false;
    setAction('drag');
  }
  // Pointer coordinates can be fractional under display scaling; Electron requires integers.
  const x = Math.round(dragStart.bounds.x + cursor.x - dragStart.cursor.x);
  const y = Math.round(dragStart.bounds.y + cursor.y - dragStart.cursor.y);
  movePet(x, y);
});
function endPetHold(released=true,react=true,resetRenderer=true) {
  if (!dragStart) return;
  const previous = dragStart;
  dragStart = null;
  interact();
  if (released && (previous.moved || previous.wasFalling)) {specialInteractions.reset();beginFall();}
  else if (!released) {specialInteractions.reset();if(action!=='laowu')setAction('idle');}
  else if (react&&(previous.wasSleeping || performance.now()-previous.started<=1000)) {
    if (!triggerSpecialClick(previous.wasSleeping,previous.region) && action!=='laowu') {actionUntil=action==='sit'?0:performance.now()+450;publish();}
  } else {specialInteractions.reset();if(action!=='laowu'){actionUntil=action==='sit'?0:performance.now()+450;publish();}}
  if(resetRenderer)petWindow.webContents.send('pet:input-reset');
}
ipcMain.on('pet:drag-end', (event, released = true) => {if(allowed(event))endPetHold(released,true,false);});
ipcMain.on('pet:drag-cancel',event=>{
  if(!allowed(event)||!dragStart)return;
  const pointer=explorerMonitor?.getPointer?.();
  // A sample from before this press cannot prove that its button was released.
  // Keep the hold until a fresh native sample or a normal pointerup arrives.
  if(dragStart.pointerType==='mouse'&&pointer&&(pointer.pressed||pointer.at<=dragStart.nativeStarted))return;
  endPetHold(true,false);
});
ipcMain.on('pet:preview', (event, next) => {
  if (!settingsAllowed(event) || dragStart || fallTimer || !['idle', 'sit', 'sleep', 'climb'].includes(next) || !sprite.actions[next]) return;
  if (next === 'climb' && !docked) return;
  interact();
  if (next === 'climb' && docked) beginClimb(true);
  else setAction(next);
  postponeWalk();
});
ipcMain.on('pet:menu', event => { if (allowed(event)) openSettings(); });
ipcMain.on('pet:settings-close', event => { if (settingsAllowed(event)) settingsWindow.close(); });
ipcMain.on('pet:stand', event => { if (settingsAllowed(event)) { interact(); beginFall(true); } });
ipcMain.on('pet:quit', event => { if (settingsAllowed(event)) app.quit(); });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', revealPet);
  app.on('before-quit', shutdownPet);
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (!shuttingDown) app.quit(); });
}

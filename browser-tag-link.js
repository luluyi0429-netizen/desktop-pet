// Embedded into browser/danbooru-tag-tool.user.js by scripts/build-tag-link.cjs.
function createPetLink(panel) {
  const STORAGE = 'desktop-pet-link:v1';
  let pairing = typeof GM_getValue === 'function' ? GM_getValue(STORAGE, null) : null;
  let currentPost = null, sequence = 0, activeSince = 0, timer, inFlight = false, nextAttempt = 0, failures = 0;
  let pointer = null, lastCopy = -Infinity, copyTimer, panelSent = false;
  const clientId = crypto.randomUUID();
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid #dce4d8;flex-shrink:0;flex-wrap:wrap';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '桌宠联动';
  const label = document.createElement('span'); label.style.cssText = 'font-size:11px;color:#65746d'; label.setAttribute('role','status');
  row.append(button, label); panel.append(row);
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  const validPairing = value => value && value.port === 17861 && typeof value.key === 'string' && /^[a-f0-9]{64}$/.test(value.key);
  if (!validPairing(pairing)) pairing = null;
  const setLabel = text => { label.textContent = text; };
  function send(kind, tags = [], postId = currentPost?.id || 'custom', eventId, extra = {}) {
    if (!pairing || typeof GM_xmlhttpRequest !== 'function') return;
    const payload = { v:1, site:location.hostname==="civitai.red"?"civitai":"danbooru", kind, tags, postId:String(postId), clientId, seq:++sequence, eventId, ...extra };
    if (!['leave','panel'].includes(kind) && !foreground()) return;
    if (kind !== 'leave') inFlight = true;
    const fail = text => { inFlight = false; failures++; nextAttempt = Date.now() + Math.min(30000, 5000 * failures); setLabel(text); };
    try {
      GM_xmlhttpRequest({ method:'POST', url:'http://127.0.0.1:' + pairing.port + '/v1/event', timeout:2500, anonymous:true,
        headers:{'Content-Type':'application/json','Authorization':'Bearer ' + pairing.key}, data:JSON.stringify(payload),
        onload(response) { inFlight=false; if(response.status===200) { failures=0;nextAttempt=0;setLabel('已连接 · 仅当前页面'); }
          else fail(response.status===401?'配对码不匹配，请重新配对':'连接被拒绝，请检查桌宠'); },
        onerror:()=>fail('桌宠未连接，稍后自动重试'), ontimeout:()=>fail('连接超时，稍后自动重试') });
    } catch { fail('请允许标签脚本访问 127.0.0.1'); }
  }
  function view() {
    if (!pairing || !currentPost || !foreground() || !activeSince || Date.now()-activeSince<1000 || inFlight || Date.now()<nextAttempt) return;
    send('view',currentPost.tags,currentPost.id);
  }
  function visibility() {
    clearTimeout(timer);
    if (foreground()) { activeSince=Date.now(); timer=setTimeout(view,1050); }
    else { activeSince=0; clearTimeout(copyTimer); send('leave'); }
  }
  function panelGeometry() {
    if (!pairing || Date.now()<nextAttempt) return;
    const rect = panel.getBoundingClientRect();
    const visible = document.visibilityState==='visible' && !panel.hidden && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).display !== 'none';
    if (!visible && !panelSent) return;
    panelSent = visible;
    let sample = null;
    if (pointer && pointer.windowX === screenX && pointer.windowY === screenY && pointer.dpr === devicePixelRatio &&
        pointer.innerWidth === innerWidth && pointer.innerHeight === innerHeight) sample = pointer.value;
    send('panel', [], currentPost?.id || 'custom', undefined, {panel: visible ? {
      left:rect.left,top:rect.top,width:rect.width,height:rect.height,innerWidth,innerHeight,
      screenX,screenY,dpr:devicePixelRatio,pointer:sample
    } : null});
  }
  function copied(text = '', postId = 'custom') {
    clearTimeout(copyTimer);
    if (!pairing || !foreground() || Date.now()<nextAttempt || Date.now()-lastCopy<450) return;
    lastCopy=Date.now();
    const tags=String(text).split(/[,，\n]+/).map(t=>t.trim().toLowerCase().replace(/\s+/g,'_')).filter(t=>t && t.length<=128).slice(0,512);
    send('copy',tags,postId||'custom',crypto.randomUUID());
  }
  function queueCopy() { clearTimeout(copyTimer); copyTimer=setTimeout(()=>copied(),100); }
  // A single physical copy can emit keydown, copy, click and the success hook.
  // Coalesce these without reading the OS clipboard or selected page text.
  document.addEventListener('keydown',event=>{
    if (!event.repeat && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && String(event.key).toLowerCase()==='c') queueCopy();
  },true);
  document.addEventListener('copy',queueCopy,true);
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button,[role="button"],input[type="button"],a');
    if (!target || target.disabled || target===button) return;
    const label=[target.textContent,target.value,target.title,target.getAttribute('aria-label')].filter(Boolean).join(' ');
    if (/复制|\bcopy\b/i.test(label) && !target.hasAttribute('data-page')) queueCopy();
  },true);
  document.addEventListener('pointermove',event=>{
    if (!event.isTrusted) return;
    pointer={windowX:screenX,windowY:screenY,dpr:devicePixelRatio,innerWidth,innerHeight,
      value:{screenX:event.screenX,screenY:event.screenY,clientX:event.clientX,clientY:event.clientY}};
  },true);
  function configure() {
    const value = prompt('粘贴桌宠「标签联动 → 复制配对码」得到的配对码。输入 off 可关闭浏览器联动。', '');
    if(value===null) return;
    if(value.trim().toLowerCase()==='off') { send('leave');pairing=null;GM_setValue(STORAGE,null);setLabel('联动已关闭');return; }
    const match=value.trim().match(/^DPT1:(17861):([a-f0-9]{64})$/);
    if(!match) { setLabel('配对码格式不正确，请从桌宠复制');return; }
    pairing={port:Number(match[1]),key:match[2]}; GM_setValue(STORAGE,pairing);nextAttempt=0;failures=0;
    setLabel('已配对，等待当前图片标签');visibility();
  }
  button.addEventListener('click',configure);
  if(typeof GM_registerMenuCommand==='function') GM_registerMenuCommand('桌宠联动 / 配对',configure);
  document.addEventListener('visibilitychange',visibility);addEventListener('focus',visibility);addEventListener('blur',visibility);
  addEventListener('pagehide',()=>send('leave'));
  const interval=setInterval(view,2000), geometryInterval=setInterval(panelGeometry,400);
  addEventListener('pagehide',()=>{clearInterval(interval);clearInterval(geometryInterval);clearTimeout(timer);clearTimeout(copyTimer);},{once:true});
  addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  setLabel(pairing?'已配对，等待当前图片标签':'未配对 · 点击连接桌宠');
  visibility();
  return {
    postLoaded(post) {
      if(!post){currentPost=null;send('leave');return;}
      const tags=Array.isArray(post.petTags)?post.petTags:['artist','copyright','character','general','meta'].flatMap(category=>String(post['tag_string_'+category]||'').split(/\s+/)).filter(Boolean);
      currentPost={id:String(post.id),tags:[...new Set(tags)].slice(0,512)};visibility();
    },
    copied
  };
}

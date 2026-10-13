const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const PORT = 17861;
const {ADULT_TAGS}=require('./adult-tags.cjs');
const adultRule=()=>({id:'h',name:'成人标签语音',enabled:true,event:'view',match:'any',tags:[...ADULT_TAGS],exclude:[],probability:100,lines:['H！','你在看什么呀…','偷偷看一眼…']});
const defaults = () => ({ revision: 4, enabled: true, probability: 100, cooldownSeconds: 5, bubbleSeconds: 2.5, rules: [
  adultRule(),
  { id: 'cute', name: '可爱雷达', enabled: true, event: 'view', match: 'any', tags: ['cat_ears','rabbit_ears','fox_ears','dog_ears'], exclude: [], probability: 100, lines: ['这个可爱！','耳朵好可爱呀！'] },
  { id: 'sleepy', name: '一起犯困', enabled: true, event: 'view', match: 'any', tags: ['sleeping','sleepy','yawning'], exclude: [], probability: 100, lines: ['我也有点困了…','呼啊…'] },
  { id: 'copy', name: '复制小能手', enabled: true, event: 'copy', match: 'any', tags: [], exclude: [], probability: 100, lines: ['标签收好啦！','记下来啦！'] }
] });
const clamp = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
const normalizeTag = s => String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '_');
function tagList(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(s => typeof s === 'string' && s.length <= 128).map(normalizeTag).filter(Boolean))].slice(0, 512);
}
function normalizeConfig(value) {
  const base = defaults(), v = value && typeof value === 'object' ? value : {};
  return { revision: 4, enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
    probability: clamp(v.probability, 0, 100, base.probability),
    cooldownSeconds: clamp(v.cooldownSeconds, 5, 600, base.cooldownSeconds),
    bubbleSeconds: clamp(v.bubbleSeconds, 1, 8, base.bubbleSeconds),
    rules: (Array.isArray(v.rules) ? v.rules : base.rules).slice(0, 30).map((rule, i) => {
      const r = rule && typeof rule === 'object' ? rule : {};
      return { id: String(r.id || 'rule-' + i).slice(0, 48), name: String(r.name || '自定义规则').slice(0, 24), enabled: r.enabled !== false,
        event: ['view','copy','any'].includes(r.event) ? r.event : 'any', match: r.match === 'all' ? 'all' : 'any',
        tags: tagList(r.tags), exclude: tagList(r.exclude), probability: r.probability == null ? null : clamp(r.probability, 0, 100, null),
        lines: (Array.isArray(r.lines) ? r.lines : []).filter(s => typeof s === 'string').map(s => s.trim().slice(0, 32)).filter(Boolean).slice(0, 12) };
    }) };
}
function createLinkStore(directory) {
  const file = path.join(directory, 'tag-link.json');
  return { read() {
      let saved; try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return defaults(); }
      const config = normalizeConfig(saved);
      if (!Number.isInteger(saved.revision) || saved.revision < 2) {
        config.probability = 100; config.cooldownSeconds = 5;
        config.rules.forEach(r => { r.probability = 100; if (r.id === 'copy' && r.name === '复制小助手') r.name = '复制小能手'; });
        fs.copyFileSync(file, file + '.before-v2');
      }
      if(!Number.isInteger(saved.revision)||saved.revision<4){
        const legacy=config.rules.filter(r=>['h','body','penis'].includes(r.id));
        if(legacy.length){
          const primary=legacy.find(r=>r.id==='h')||legacy[0],merged={...adultRule(),
            enabled:legacy.some(r=>r.enabled),probability:primary.probability,
            tags:tagList([...ADULT_TAGS,...legacy.flatMap(r=>r.tags)]),
            exclude:tagList(legacy.flatMap(r=>r.exclude)),
            lines:[...new Set(legacy.flatMap(r=>r.lines))].slice(0,12)};
          const first=config.rules.findIndex(r=>['h','body','penis'].includes(r.id));
          config.rules=config.rules.filter(r=>!['h','body','penis'].includes(r.id));config.rules.splice(first,0,merged);
        }
        for(const rule of config.rules)if(['cute','sleepy'].includes(rule.id)&&rule.event==='any')rule.event='view';
        fs.copyFileSync(file,file+'.before-v4');return this.write(config);
      }
      return config;
    },
    write(value) { const config = normalizeConfig(value); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2)); fs.renameSync(file + '.tmp', file); return config; } };
}
function readPairingKey(directory) {
  const file = path.join(directory, 'tag-link-key.json');
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')).key; if (/^[a-f0-9]{64}$/.test(value)) return value; } catch {}
  const key = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ key }), { mode: 0o600 }); return key;
}
function validateEvent(value) {
  if(value?.site!==undefined&&!['danbooru','civitai'].includes(value.site))return null;
  if (!value || value.v !== 1 || !['view','copy','leave','panel'].includes(value.kind) ||
      typeof value.clientId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value.clientId) ||
      !Number.isSafeInteger(value.seq) || value.seq < 0 ||
      typeof value.postId !== 'string' || !/^(?:[0-9]{1,16}|custom)$/.test(value.postId)) return null;
  if (value.kind !== 'leave' && (!Array.isArray(value.tags) || value.tags.length > 512 || value.tags.some(t => typeof t !== 'string' || t.length > 128))) return null;
  if (value.kind === 'copy' && (typeof value.eventId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value.eventId))) return null;
  let panel;
  if (value.kind === 'panel' && value.panel !== null) {
    const p = value.panel;
    if (!p || !['left','top','width','height','innerWidth','innerHeight','screenX','screenY','dpr'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 100000) ||
        p.width <= 0 || p.height <= 0 || p.innerWidth <= 0 || p.innerHeight <= 0 || p.dpr < .25 || p.dpr > 8) return null;
    panel = Object.fromEntries(['left','top','width','height','innerWidth','innerHeight','screenX','screenY','dpr'].map(k => [k,p[k]]));
    if (p.pointer && ['screenX','screenY','clientX','clientY'].every(k => Number.isFinite(p.pointer[k]) && Math.abs(p.pointer[k]) < 100000))
      panel.pointer = Object.fromEntries(['screenX','screenY','clientX','clientY'].map(k => [k,p.pointer[k]]));
  }
  return { site:value.site||'danbooru', kind: value.kind, clientId: value.clientId, seq: value.seq, postId: value.postId, eventId: value.eventId, tags: tagList(value.tags), ...(value.kind === 'panel' ? {panel: panel || null} : {}) };
}
function matchRule(config, event) {
  const tags = new Set(event.tags);
  // Copy gestures can only select copy rules, regardless of the copied content.
  const rules=event.kind==='copy'?config.rules.filter(r=>r.event==='copy'):config.rules.filter(r=>r.event!=='copy');
  return rules.find(r => r.enabled && r.lines.length && (r.event === 'any' || r.event === event.kind) &&
    !r.exclude.some(t => tags.has(t)) && (r.tags.length ? (r.match === 'all' ? r.tags.every(t => tags.has(t)) : r.tags.some(t => tags.has(t))) : r.event === 'copy')) || null;
}
function createReactionEngine({ config = defaults(), now = Date.now, random = Math.random, onReaction = () => {}, onView = () => ({}) } = {}) {
  let options=normalizeConfig(config),lastLine='',lastCopyReceived=-Infinity;
  const lastReaction={view:-Infinity,copy:-Infinity},pending={view:null,copy:null};
  const seen=new Map(),clients=new Map();
  function remember(key){seen.set(key,now());if(seen.size>4096)seen.delete(seen.keys().next().value);}
  function canReact(state){return !state.hidden&&!state.sleeping&&!state.busy&&!(state.voiceWaitMs>0);}
  function ready(kind){return now()-lastReaction[kind]>=options.cooldownSeconds*1000;}
  function deliver(item){
    const choices=item.rule.lines.filter(line=>line!==lastLine),lines=choices.length?choices:item.rule.lines;
    const text=lines[Math.min(lines.length-1,Math.floor(random()*lines.length))];
    const accepted=onReaction({text,duration:options.bubbleSeconds*1000,rule:item.rule.id,voice:item.event.kind==='copy',kind:item.event.kind,context:item.context,genital:item.event.tags.some(tag=>/^(?:penis|pussy|vulva|vagina|testicles|scrotum|erection|erect_penis|uncensored_penis|clitoris)$/.test(tag))});
    if(accepted===false)return false;
    lastLine=text;lastReaction[item.event.kind]=now();pending[item.event.kind]=null;return true;
  }
  return {
    configure(value){options=normalizeConfig(value);pending.view=null;pending.copy=null;},
    receive(event,state={}){
      const previous=clients.get(event.clientId);
      if(previous&&event.seq<=previous.seq)return 'duplicate';
      if(!previous&&clients.size>=128)clients.delete(clients.keys().next().value);
      clients.set(event.clientId,{seq:event.seq,postId:event.postId,at:now(),active:event.kind!=='leave'});
      if(event.kind==='leave'){for(const kind of ['view','copy'])if(pending[kind]?.event.clientId===event.clientId)pending[kind]=null;return 'inactive';}
      if(event.kind==='panel')return 'platform';
      if(event.kind==='view'&&pending.view&&(pending.view.event.clientId!==event.clientId||pending.view.event.postId!==event.postId))pending.view=null;
      if(!options.enabled)return 'disabled';
      const key=event.kind==='view'?'view:'+(event.site||'danbooru')+':'+event.postId:'copy:'+event.eventId;
      if(seen.has(key))return 'duplicate';remember(key);
      if(state.hidden||state.sleeping)return 'quiet';
      const context=event.kind==='view'?onView(event):{};
      if(event.kind==='view'&&(pending.copy||now()-lastCopyReceived<options.cooldownSeconds*1000))return 'copy-priority';
      if(event.kind==='copy'&&now()-lastCopyReceived<450)return 'duplicate';
      if(!ready(event.kind)&&!context.adultStreak&&!context.repeatTags)return 'cooldown';
      const rule=matchRule(options,event)||(context.repeatTags?{id:'repeatTags',lines:['这些标签好眼熟。'],probability:options.probability}:null);if(!rule)return 'no-match';
      if(random()*100>=(rule.probability??options.probability))return 'chance';
      if(event.kind==='copy'){
        lastCopyReceived=now();pending.view=null;
        // Keep just one pending copy confirmation for repeated clicks/keyboard hooks.
        if(pending.copy)return 'coalesced';
      }
      const ttl=event.kind==='copy'?95000:Math.max(5000,Math.min(65000,(state.voiceWaitMs||0)+3500));
      const item={rule,event,context,expires:now()+ttl};
      if(canReact(state)&&ready(event.kind)&&deliver(item))return 'reacted';
      pending[event.kind]=item;return 'queued';
    },
    tick(state={}){
      for(const kind of ['copy','view']){
        const item=pending[kind];if(!item)continue;
        const client=clients.get(item.event.clientId);
        if(!options.enabled||state.hidden||state.sleeping||now()>item.expires||!client?.active||
           (kind==='view'&&(client.postId!==item.event.postId||now()-client.at>3500))){pending[kind]=null;continue;}
        if(canReact(state)&&ready(kind))deliver(item);
        return;
      }
    }
  };
}
function createTagBridge({ key, onEvent, onStatus = () => {}, port = PORT }) {
  let server, listening = false, error = '';
  const status = () => ({ listening, error, port: server?.address()?.port || port });
  return { status,
    start() {
      if (server) return;
      server = http.createServer((req, res) => {
        const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
        if (req.headers.host !== '127.0.0.1:' + server.address()?.port ||
            (req.headers.origin && !['https://danbooru.donmai.us','https://civitai.red'].includes(req.headers.origin))) return reply(403, { error: 'origin' });
        if (req.method !== 'POST' || req.url !== '/v1/event') return reply(404, { error: 'route' });
        const candidate = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        const expected = Buffer.from(key);
        if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return reply(401, { error: 'pairing' });
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, { error: 'content-type' });
        let data = '', size = 0, rejected = false;
        req.on('data', chunk => { size += chunk.length; if (size > 65536) { if (!rejected) reply(413, { error: 'size' }); rejected = true; } else data += chunk; });
        req.on('end', () => {
          if (rejected) return;
          try { const event = validateEvent(JSON.parse(data)); if (!event) return reply(400, { error: 'event' }); reply(200, { result: onEvent(event) }); }
          catch { reply(400, { error: 'event' }); }
        });
        req.on('error', () => {});
      });
      server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 8;
      server.on('error', e => { listening = false; error = e.code === 'EADDRINUSE' ? '联动端口被占用，请关闭重复桌宠后重试' : '本机联动服务启动失败'; onStatus(status()); });
      server.listen(port, '127.0.0.1', () => { listening = true; error = ''; onStatus(status()); });
    },
    stop() { if (server) { server.closeAllConnections(); server.close(); server = null; } listening = false; }
  };
}
module.exports = { PORT, defaults, normalizeTag, tagList, normalizeConfig, createLinkStore, readPairingKey, validateEvent, matchRule, createReactionEngine, createTagBridge };

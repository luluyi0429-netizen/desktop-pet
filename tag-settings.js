const api = window.desktopPet;
const $ = selector => document.querySelector(selector);
let config;
function message(text) { $('#message').textContent = text; }
function node(tag, text, props = {}) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; Object.assign(n, props); return n; }
function field(label, input) { const n = node('label', label); n.append(input); return n; }
function select(values, value, changed) { const n = node('select'); for (const [key,label] of values) n.append(node('option',label,{value:key})); n.value=value; n.onchange=()=>changed(n.value); return n; }
function renderStatus(status) { $('#connection').textContent = status.error || (!status.listening ? '本机服务尚未就绪' : status.lastSeen ? '已收到标签工具消息 · ' + new Date(status.lastSeen).toLocaleTimeString('zh-CN') : '本机服务已就绪 · 等待浏览器配对'); }
function renderRules() {
  $('#rules').replaceChildren();
  config.rules.forEach((r,i) => {
    const box=node('div',undefined,{className:'rule'}), top=node('div',undefined,{className:'rule-top'});
    const enabled=node('input',undefined,{type:'checkbox',checked:r.enabled}); enabled.setAttribute('aria-label','启用此规则'); enabled.onchange=()=>{r.enabled=enabled.checked;};
    const name=node('input',undefined,{type:'text',value:r.name,maxLength:24}); name.setAttribute('aria-label','规则名称'); name.oninput=()=>{r.name=name.value;};
    const up=node('button','↑',{disabled:i===0,title:'提高优先级'}); up.onclick=()=>{[config.rules[i-1],config.rules[i]]=[config.rules[i],config.rules[i-1]];renderRules();};
    const remove=node('button','删除',{className:'danger'});remove.onclick=()=>{config.rules.splice(i,1);renderRules();};top.append(enabled,name,up,remove);
    const row=node('div',undefined,{className:'columns'});
    row.append(field('触发时机',select([['any','看图 / 复制'],['view','看图时'],['copy','复制按钮 / Ctrl+C']],r.event,v=>r.event=v)),field('匹配方式',select([['any','任意标签命中'],['all','所有标签同时命中']],r.match,v=>r.match=v)));
    const tags=node('textarea',undefined,{value:r.tags.join(', '),placeholder:'例：cat_ears, rabbit_ears'});tags.oninput=()=>{r.tags=tags.value.split(/[,，\n]+/).map(t=>t.trim()).filter(Boolean);};
    const exclude=node('input',undefined,{type:'text',value:r.exclude.join(', '),placeholder:'可留空'});exclude.oninput=()=>{r.exclude=exclude.value.split(/[,，]+/).map(t=>t.trim()).filter(Boolean);};
    const chance=node('input',undefined,{type:'number',min:'0',max:'100',value:r.probability??'',placeholder:'使用默认'});chance.oninput=()=>{r.probability=chance.value===''?null:Number(chance.value);};
    const extra=node('div',undefined,{className:'columns'});extra.append(field('排除标签',exclude),field('此规则概率 %',chance));
    const lines=node('textarea',undefined,{value:r.lines.join('\n'),placeholder:'每行一句随机台词'});lines.oninput=()=>{r.lines=lines.value.split(/\n/).map(t=>t.trim()).filter(Boolean);};
    box.append(top,row,field('触发标签',tags),extra,field('随机台词',lines));$('#rules').append(box);
  });
}
function renderConfig(value) {config=value;$('#enabled').checked=value.enabled;$('#probability').value=value.probability;$('#cooldown').value=value.cooldownSeconds;$('#duration').value=value.bubbleSeconds;renderRules();}
$('#add').onclick=()=>{if(config.rules.length>=30)return message('最多 30 条规则');config.rules.push({id:crypto.randomUUID(),name:'自定义规则',enabled:true,event:'any',match:'any',tags:[],exclude:[],probability:100,lines:['这个我喜欢！']});renderRules();};
$('#pair').onclick=async()=>message(await api.copyTagPairing()?'配对码已复制，去标签工具粘贴即可':'服务尚未就绪，请重启桌宠');
$('#save').onclick=async()=>{
  const inputs=[$('#probability'),$('#cooldown'),$('#duration'),...document.querySelectorAll('.rule input[type=number]')];
  if(inputs.some(input=>!input.reportValidity()))return;
  Object.assign(config,{enabled:$('#enabled').checked,probability:Number($('#probability').value),cooldownSeconds:Number($('#cooldown').value),bubbleSeconds:Number($('#duration').value)});
  const result=await api.saveTagSettings(config);if(result.ok){renderConfig(result.config);message('已保存，下次启动也会保留');}else message(result.error);
};
$('#test').onclick=async()=>message(await api.testTagReaction('H！')?'已显示测试气泡（跳过概率与冷却）':'桌宠正在运动或睡眠，请等它站稳后再试');
api.onTagStatus(renderStatus);
api.getTagSettings().then(value=>{if(value){renderConfig(value.config);renderStatus(value.status);}else message('窗口连接失效，请关闭后从桌宠重新打开');}).catch(()=>message('无法读取设置'));

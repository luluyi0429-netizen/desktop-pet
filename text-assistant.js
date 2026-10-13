const api = window.textAssistant;
const $ = id => document.getElementById(id);
let selectedTask = 'translate', revision = -1, configLoaded = false, configDirty = false, savedEndpoint = '', busy = false;
let filterItems=[],filterRevision=-1,resultTask='translate';
function previewFilter(){
  $('result').textContent=PromptFilter.sections(filterItems)||'未选择任何提示词。';
  $('copy-positive').disabled=!PromptFilter.output(filterItems,'positive');
  $('copy-negative').disabled=!PromptFilter.output(filterItems,'negative');
}
function drawFilter(){
  const container=$('filter-groups');container.replaceChildren();
  for(const polarity of ['positive','negative']){
    const heading=document.createElement('h3');heading.textContent=polarity==='positive'?'正向提示词':'负面提示词';container.append(heading);
    for(const [category,label] of Object.entries(PromptFilter.labels)){
      const list=filterItems.filter(i=>i.category===category&&i.polarity===polarity);if(!list.length)continue;
      const details=document.createElement('details');details.open=category!=='lora';
      const summary=document.createElement('summary'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=list.every(i=>i.selected);toggle.indeterminate=!toggle.checked&&list.some(i=>i.selected);toggle.setAttribute('aria-label','保留'+label);
      toggle.addEventListener('click',e=>e.stopPropagation());toggle.addEventListener('change',()=>{list.forEach(i=>i.selected=toggle.checked);drawFilter();});summary.append(toggle,document.createTextNode(label+' · '+list.length));details.append(summary);
      for(const item of list){
        const row=document.createElement('div');row.className='prompt-item';const labelNode=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=item.selected;
        check.addEventListener('change',()=>{item.selected=check.checked;previewFilter();toggle.checked=list.every(i=>i.selected);toggle.indeterminate=!toggle.checked&&list.some(i=>i.selected);});
        const text=document.createElement('span');text.textContent=item.text;labelNode.append(check,text);
        const select=document.createElement('select');select.setAttribute('aria-label','调整分类');for(const [key,name] of Object.entries(PromptFilter.labels)){const option=document.createElement('option');option.value=key;option.textContent=name;select.append(option);}select.value=category;
        select.addEventListener('change',()=>{item.category=select.value;if(select.value==='lora')item.selected=false;drawFilter();});row.append(labelNode,select);details.append(row);
      }
      container.append(details);
    }
  }
  previewFilter();
}
function setStatus(text, error = false) { $('status').textContent = text; $('status').dataset.error = String(error); }
function count() { $('count').textContent = $('source').value.length + ' / 8000'; }
function showConfig(config, force = false) {
  const first = !configLoaded;
  savedEndpoint = config.endpoint || '';
  if (!configLoaded || force || !configDirty) { $('endpoint').value = savedEndpoint; $('model').value = config.model || ''; configLoaded = true; }
  $('api-key').placeholder = config.hasKey ? '密钥已加密保存；留空保持不变' : '填写密钥（本地服务可留空）';
  $('config-badge').textContent = config.endpoint && config.model ? '已配置' : '未配置';
  if ((first && !config.endpoint) || config.error) $('configuration').open = true;
  $('destination').textContent = savedEndpoint ? '发送到：' + savedEndpoint + ' · ' + config.model + '。点击“开始处理”才会发送原文。' : '先在下方配置 AI 接口。点击“开始处理”才会发送原文。';
  if (config.error) $('save-status').textContent = config.error;
}
function render(state) {
  if (!state || !state.config) return;
  resultTask=state.task;
  $('pin').setAttribute('aria-pressed',String(state.pinned));$('pin').textContent=state.pinned?'已置顶':'置顶';
  if(state.task==='filter'&&state.phase==='done'&&state.items&&filterRevision!==state.revision){filterItems=state.items.map(i=>({...i}));filterRevision=state.revision;selectedTask='filter';drawFilter();}
  if(!state.text||(state.revision!==revision&&state.phase==='idle')){filterItems=[];filterRevision=-1;}
  $('filter-panel').hidden=!(selectedTask==='filter'&&filterItems.length);
  busy = ['working', 'capturing'].includes(state.phase);
  if (revision !== state.revision) { revision = state.revision; $('source').value = state.text; count(); }
  $('source-kind').textContent = state.source || '原文只在本次窗口内保留';
  $('result').textContent = state.result || (busy ? '正在处理，请稍候…' : '处理结果会显示在这里。');
  $('copy').disabled = state.phase !== 'done';
  $('incomplete').hidden = !state.incomplete;
  for (const id of ['source', 'clipboard', 'clear', 'run', 'endpoint', 'model', 'api-key', 'remove-key', 'save']) $(id).disabled = busy;
  document.querySelectorAll('[data-task]').forEach(button => { button.disabled = busy; });
  $('cancel').hidden = !busy;
  $('run').textContent = state.phase === 'working' ? '处理中…' : '开始处理';
  setStatus(state.error || ({working: '正在请求 AI 接口，可随时取消。', capturing: '正在读取当前窗口选区…', done: '处理完成。', idle: '确认原文，选择一种处理方式。'}[state.phase] || '准备就绪。'), Boolean(state.error));
  const unavailable = Object.entries(state.shortcuts).filter(([, ok]) => !ok).map(([key]) => key.replace('Control', 'Ctrl'));
  $('shortcut-warning').hidden = !unavailable.length;
  $('shortcut-warning').textContent = unavailable.join('、') + ' 注册失败，可能已被其他应用占用。可在此粘贴，或点击“读取剪贴板”。';
  showConfig(state.config);
  if(selectedTask==='filter')$('destination').textContent='标签过滤完全在本机完成，不调用 AI 接口。';
  if(state.task==='filter'&&filterItems.length)previewFilter();
}
async function call(fn) { try { const result = await fn(); if (result?.ok === false && result.error) setStatus(result.error, true); return result; } catch { setStatus('操作失败，请重新打开面板后重试。', true); return null; } }
$('source').addEventListener('input', count);
for (const id of ['endpoint','model','api-key','remove-key']) $(id).addEventListener('input',()=>{configDirty=true;});
document.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => {
  selectedTask = button.dataset.task;
  document.querySelectorAll('[data-task]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('filter-panel').hidden=selectedTask!=='filter'||!filterItems.length;
  $('destination').textContent=selectedTask==='filter'?'标签过滤完全在本机完成，不调用 AI 接口。':'点击“开始处理”将原文发送到已配置的 AI 接口。';
}));
$('run').addEventListener('click', () => { if (!busy) call(() => api.run({task: selectedTask, text: $('source').value})); });
$('cancel').addEventListener('click', () => call(() => api.cancel()));
$('clipboard').addEventListener('click', () => call(() => api.clipboard()));
$('clear').addEventListener('click', () => call(() => api.clear()));
$('copy').addEventListener('click', async () => { if ((await call(() => api.copy(resultTask==='filter'?PromptFilter.sections(filterItems):undefined)))?.ok) setStatus('结果已复制。'); });
$('pin').addEventListener('click',async()=>{const result=await call(()=>api.pin($('pin').getAttribute('aria-pressed')!=='true'));if(result?.ok){$('pin').setAttribute('aria-pressed',String(result.pinned));$('pin').textContent=result.pinned?'已置顶':'置顶';}});
for(const polarity of ['positive','negative'])$('copy-'+polarity).addEventListener('click',async()=>{if((await call(()=>api.copy(PromptFilter.output(filterItems,polarity))))?.ok)setStatus((polarity==='positive'?'正向':'负面')+'提示词已复制。');});
$('add-prompt').addEventListener('submit',event=>{event.preventDefault();const added=PromptFilter.parse($('new-prompt').value);if(!added.length)return;
  if(filterItems.length+added.length>1000){setStatus('最多保留 1000 个字段。',true);return;}
  for(const item of added){item.id='custom-'+crypto.randomUUID();item.polarity=$('new-polarity').value;if($('new-category').value!=='auto')item.category=$('new-category').value;item.selected=item.category!=='lora';filterItems.push(item);}
  $('new-prompt').value='';drawFilter();setStatus('已添加，可继续勾选或调整分类。');
});
$('endpoint').addEventListener('input', () => { $('endpoint-warning').hidden = !savedEndpoint || $('endpoint').value.trim().replace(/\/+$/, '') === savedEndpoint.replace(/\/+$/, ''); });
$('config-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  $('save').disabled = true;
  const result = await call(() => api.save({endpoint: $('endpoint').value, model: $('model').value, apiKey: $('api-key').value, removeKey: $('remove-key').checked}));
  $('save').disabled = busy;
  if (result?.ok) {
    configDirty = false;
    $('api-key').value = ''; $('remove-key').checked = false; $('endpoint-warning').hidden = true;
    $('save-status').textContent = '已保存，未发送原文。'; showConfig(result.config, true);
  } else $('save-status').textContent = result?.error || '保存失败。';
});
api.onState(render);
call(() => api.get()).then(render);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); window.close(); }
  if (event.ctrlKey && event.key === 'Enter' && event.target === $('source') && !busy) { event.preventDefault(); $('run').click(); }
});

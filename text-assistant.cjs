const path = require('node:path');
const fs = require('node:fs');
const promptFilter = require('./prompt-filter.js');
const {pathToFileURL} = require('node:url');
const {createTextSettings, normalizeText, requestText, MAX_TEXT} = require('./selected-text.cjs');
const {captureSelection} = require('./selection-capture.cjs');
function createTextAssistant({app, BrowserWindow, screen, ipcMain, globalShortcut, clipboard, safeStorage, shell,
  getOwner, beforeOpen = () => {}, onResult = () => {}, directory = __dirname, capture = captureSelection, request = requestText}) {
  const store = createTextSettings(app.getPath('userData'), safeStorage);
  const uiFile=path.join(app.getPath('userData'),'text-panel.json');
  let pinned=true;
  try{pinned=JSON.parse(fs.readFileSync(uiFile,'utf8')).pinned!==false;}catch{}
  let window = null, disposed = false, requestController = null, captureController = null, serial = 0;
  const shortcuts = {}, ownedShortcuts = [];
  let state = {text: '', result: '', task: 'translate', source: '', phase: 'idle', error: '', revision: 0, incomplete: false};
  const page = pathToFileURL(path.join(directory, 'text-assistant.html')).href;
  const handlers = [];
  const snapshot = () => ({...state, pinned, config: store.publicState(), shortcuts: {...shortcuts}, maxText: MAX_TEXT});
  function publish() {
    if (!disposed && window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('text:state', snapshot());
  }
  function cancel() {
    serial++; requestController?.abort(); captureController?.abort(); requestController = captureController = null;
    if (['working', 'capturing'].includes(state.phase)) state = {...state, phase: 'idle', error: '已取消。'};
    publish();
  }
  function clear() { cancel(); state = {...state, items:[],text: '', result: '', error: '', source: '', phase: 'idle', revision: state.revision + 1}; publish(); }
  function open() {
    if (disposed) return;
    const owner = getOwner(); if (!owner || owner.isDestroyed()) return;
    beforeOpen();
    if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); publish(); return; }
    const area = screen.getDisplayMatching(owner.getBounds()).workArea;
    const width = Math.min(700, area.width), height = Math.min(820, area.height);
    const panel = new BrowserWindow({width, height, minWidth: Math.min(460, area.width), minHeight: Math.min(500, area.height),
      x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
      title: '桌宠 · 翻译与标签', alwaysOnTop:pinned, show: true, backgroundColor: '#f8f4f2',
      webPreferences: {preload: path.join(directory, 'text-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false}});
    window = panel; panel.setMenuBarVisibility(false);
    panel.setAlwaysOnTop(pinned,'floating');
    owner.setAlwaysOnTop?.(true,'screen-saver');
    panel.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    panel.webContents.on('will-navigate', event => event.preventDefault());
    panel.on('closed', () => { if (window === panel) { window = null; clear(); } });
    panel.loadFile(path.join(directory, 'text-assistant.html')).then(() => {
      if (!disposed && !panel.isDestroyed()) { publish(); panel.show(); panel.focus(); }
    }).catch(() => { if (!panel.isDestroyed()) panel.close(); });
  }
  function setText(text, source) {
    state = {...state, items:[],text: normalizeText(text), source, result: '', error: '', phase: 'idle', incomplete: false, revision: state.revision + 1};
  }
  async function captureText() {
    if (disposed || ['working', 'capturing'].includes(state.phase)) return;
    const id = ++serial;
    captureController = new AbortController();
    state = {...state, phase: 'capturing', error: ''}; publish();
    // Do not open/focus our window until the source application's selection is read.
    try {
      const result = await capture({signal: captureController.signal, directory});
      if (disposed || id !== serial) return;
      if (result.ok) setText(result.text, result.source || '选中文字');
      else state = {...state, text: '', result: '', source: '', phase: 'idle', error: result.error, revision: state.revision + 1};
    } catch { if (id === serial) state = {...state, phase: 'idle', error: '读取选区失败，请使用剪贴板入口。'}; }
    finally { if (!disposed && id === serial) { captureController = null; open(); publish(); } }
  }
  function readClipboard() {
    if (disposed || ['working', 'capturing'].includes(state.phase)) return {ok: false, error: '请先取消当前处理。'};
    try { setText(clipboard.readText(), '剪贴板（手动读取）'); open(); publish(); return {ok: true}; }
    catch (error) { state = {...state, error: error.message}; open(); publish(); return {ok: false, error: error.message}; }
  }
  async function run(value) {
    if (['working', 'capturing'].includes(state.phase)) return {ok: false, error: '已有处理进行中，请等待或取消。'};
    let id;
    try {
      const text = normalizeText(value?.text);
      if (!['translate', 'filter'].includes(value?.task)) throw Error('请选择翻译或标签过滤。');
      if(value.task==='filter'){
        const items=promptFilter.parse(text);
        state={...state,text,task:'filter',items,result:promptFilter.sections(items),error:'',phase:'done',incomplete:false,revision:state.revision+1};
        onResult({task:'filter',text:state.result});publish();return {ok:true};
      }
      const config = store.requestConfig();
      id = ++serial; requestController = new AbortController();
      state = {...state, text, task: value.task, result: '', error: '', phase: 'working', incomplete: false}; publish();
      const result = await request({config, text, task: value.task, signal: requestController.signal});
      if (disposed || serial !== id) return {ok: false, cancelled: true};
      state = {...state, result: result.text, incomplete: result.incomplete, phase: 'done'};
      try { onResult({task: value.task, text: result.text}); } catch { /* optional subtitle */ }
      return {ok: true};
    } catch (error) {
      if (disposed || (id !== undefined && id !== serial)) return {ok: false, cancelled: true};
      if (!disposed && (id === undefined || id === serial)) state = {...state, phase: 'error', error: error.message};
      return {ok: false, error: error.message};
    } finally { if (!disposed && (id === undefined || id === serial)) { requestController = null; publish(); } }
  }
  function allowed(event) {
    return !disposed && window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === page;
  }
  function handle(channel, fn) {
    handlers.push(channel);
    ipcMain.handle(channel, async (event, value) => {
      if (!allowed(event)) return {ok: false, error: '请求来源无效。'};
      try { return await fn(value); } catch (error) { return {ok: false, error: error.message}; }
    });
  }
  handle('text:get', snapshot);
  handle('text:save', value => {
    if (['working', 'capturing'].includes(state.phase)) return {ok: false, error: '处理期间不能修改接口配置。'};
    const config = store.save(value); publish(); return {ok: true, config};
  });
  handle('text:run', run);
  handle('text:pin', value=>{
    if(typeof value!=='boolean')throw Error('置顶设置无效。');
    fs.mkdirSync(path.dirname(uiFile),{recursive:true});
    fs.writeFileSync(uiFile+'.tmp',JSON.stringify({pinned:value}));fs.renameSync(uiFile+'.tmp',uiFile);
    pinned=value;window.setAlwaysOnTop(pinned,'floating');getOwner()?.setAlwaysOnTop?.(true,'screen-saver');
    return {ok:true,pinned};
  });
  handle('text:site', async value=>{
    const sites={civitai:'https://civitai.red/',danbooru:'https://danbooru.donmai.us/'};
    if(!Object.hasOwn(sites,value)||!shell)throw Error('站点无效。');
    await shell.openExternal(sites[value]);return {ok:true};
  });
  handle('text:cancel', () => { cancel(); return {ok: true}; });
  handle('text:clear', () => { clear(); return {ok: true}; });
  handle('text:clipboard', readClipboard);
  handle('text:copy', value => {
    if (state.phase !== 'done') return {ok: false, error: '还没有可以复制的结果。'};
    const result=state.task==='filter'&&typeof value==='string'?value:state.result;
    if(!result.trim())throw Error('未选择可以复制的内容。');
    if(result.length>24000)throw Error('复制内容太长。');
    clipboard.writeText(result); return {ok: true};
  });
  for (const [key, fn] of [['Control+Alt+T', captureText], ['Control+Alt+V', readClipboard]]) {
    try { shortcuts[key] = globalShortcut.register(key, fn); if (shortcuts[key]) ownedShortcuts.push(key); }
    catch { shortcuts[key] = false; }
  }
  return {
    open, captureText, readClipboard, snapshot,
    destroy() {
      if (disposed) return; cancel(); disposed = true;
      for (const key of ownedShortcuts) globalShortcut.unregister(key);
      for (const channel of handlers) ipcMain.removeHandler(channel);
      if (window && !window.isDestroyed()) window.destroy(); window = null;
    }
  };
}
module.exports = {createTextAssistant};

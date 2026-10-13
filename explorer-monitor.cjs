const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
function createExplorerMonitor(screen, onUpdate = () => {}, onCopy = () => {}, onForeground = () => {}) {
  let child, lines, windows = [], updated = 0, error = '', stopped = false;
  let pointer=null,foreground=null;
  function clear(message) { windows = []; pointer=null; error = message; onUpdate(); }
  return {
    start() {
      if (process.platform !== 'win32' || child || stopped) return;
      const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'explorer-windows.ps1'), '-PetProcessId', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        try {
          const parsed = JSON.parse(line);
          if (parsed?.copy === true) { onCopy(); return; }
          if(typeof parsed?.primaryPressed==='boolean'){
            pointer={pressed:parsed.primaryPressed,at:Date.now()};
            if(typeof parsed.foreground==='string'&&parsed.foreground!==foreground){foreground=parsed.foreground;onForeground();}
            return;
          }
          if (!Array.isArray(parsed)) return;
          const valid = rect => rect && ['x','y','width','height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0;
          windows = parsed.filter(w => typeof w.id === 'string' && valid(w.bounds) && valid(w.client)).map(w => ({
            id: w.id, browser: w.browser === true, bounds: screen.screenToDipRect(null, w.bounds), client: screen.screenToDipRect(null, w.client),
            viewports: (w.viewports || []).filter(valid).map(r => screen.screenToDipRect(null, r))
          }));
          updated = Date.now(); error = ''; onUpdate();
        } catch (e) { clear('读取文件管理器窗口失败'); }
      });
      child.stderr.on('data', () => { error = '窗口检测服务异常'; });
      child.on('error', () => clear('无法启动窗口检测'));
      child.on('exit', () => { child = null; if (!stopped) clear('窗口检测已停止'); });
    },
    getWindows() { return Date.now() - updated < 2000 ? windows.filter(w => !w.browser) : []; },
    getPointer() { return pointer&&Date.now()-pointer.at<700?pointer:null; },
    getBrowsers() { return Date.now()-updated<2000?windows.filter(w=>w.browser):[]; },
    getBrowser() { return Date.now() - updated < 700 ? windows.find(w => w.browser) : null; },
    status() { return { ready: updated > 0 && Date.now() - updated < 2000, error }; },
    stop() { stopped = true; if (lines) lines.close(); if (child) child.kill(); child = null; windows = []; pointer=null; }
  };
}
module.exports = { createExplorerMonitor };

const path = require('node:path');
const {spawn} = require('node:child_process');
const {normalizeText} = require('./selected-text.cjs');
function captureSelection({signal, spawnImpl = spawn, directory = __dirname, expectedProcessId = 0} = {}) {
  return new Promise(resolve => {
    if (process.platform !== 'win32' || signal?.aborted) return resolve({ok: false, error: '选区读取已取消或当前系统不支持。'});
    const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    let child, output = '', finished = false, timer;
    const finish = result => {
      if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (child && child.exitCode === null) child.kill();
      resolve(result);
    };
    const cancel = () => finish({ok: false, error: '选区读取已取消。'});
    try {
      const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'selection-reader.ps1')];
      if (Number.isSafeInteger(expectedProcessId) && expectedProcessId > 0) args.push('-ExpectedProcessId', String(expectedProcessId));
      child = spawnImpl(executable, args, {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      signal?.addEventListener('abort', cancel, {once: true});
      timer = setTimeout(() => finish({ok: false, error: '读取选区超时。请先 Ctrl+C，再按 Ctrl+Alt+V 读取剪贴板。'}), 8000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 100000) finish({ok: false, error: '选中文字过长，请缩短选区。'}); });
      child.stderr.on('data', () => {});
      child.on('error', () => finish({ok: false, error: '无法启动选区读取，请使用剪贴板入口。'}));
      child.on('close', () => {
        if (finished) return;
        try {
          const value = JSON.parse(output.trim().replace(/^\uFEFF/, ''));
          if (value.ok) return finish({ok: true, text: normalizeText(value.text), source: '选中文字'});
          const errors = {
            password: '密码输入框不支持读取。', changed: '读取时焦点发生变化，请回到原窗口重新选择。',
            tooLong: '每次最多处理 8000 个字符，请缩短选区。',
            unsupported: '未读取到选区。请先 Ctrl+C，再按 Ctrl+Alt+V；也可在面板中粘贴。'
          };
          finish({ok: false, error: errors[value.reason] || errors.unsupported});
        } catch { finish({ok: false, error: '选区读取失败。请先复制文字，再使用剪贴板入口。'}); }
      });
    } catch { finish({ok: false, error: '无法启动选区读取，请使用剪贴板入口。'}); }
  });
}
module.exports = {captureSelection};

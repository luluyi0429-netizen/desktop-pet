const fs = require('node:fs');
const path = require('node:path');
const SOURCE = path.join(__dirname, 'materials');
const ASSETS = path.join(__dirname, 'assets');
const order = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true });
function syncMaterials(source) {
  const manifestPath = path.join(ASSETS, 'manifest.json');
  // Normal startup uses bundled assets; importing originals is an explicit action.
  if (!source && fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  source = source || SOURCE;
  if (!fs.existsSync(source)) {
    if (fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    throw new Error(`Material folder missing: ${source}`);
  }
  fs.mkdirSync(ASSETS, { recursive: true });
  const manifest = { actions: {} };
  function copy(action, directory, names) {
    if (!names.length) throw new Error(`Missing material: ${action}`);
    const folder = path.join(ASSETS, action);
    fs.mkdirSync(folder, { recursive: true });
    manifest.actions[action] = names.sort(order).map(name => {
      fs.copyFileSync(path.join(directory, name), path.join(folder, name));
      return `${action}/${name}`;
    });
  }
  const names = fs.readdirSync(source, { withFileTypes: true }).filter(f => f.isFile()).map(f => f.name);
  for (const [action, pattern] of [
    ['idle', /^1站立\.png$/i], ['blink', /^闭眼(?:\d+)?\.png$/i],
    ['click', /^点击(?:\d+)?\.png$/i], ['drag', /^提起(?:\d+)?\.png$/i],
    ['land', /^落地(?:\d+)?\.png$/i], ['sleep', /^睡觉(?:\d+)?\.png$/i],
    ['climb', /^爬(?:\d+)?\.png$/i], ['laowu', /^老吴(?:\d+)?\.png$/i]
  ]) {
    const matches = names.filter(name => pattern.test(name));
    if (action === 'laowu' && !matches.length) continue;
    if (matches.length) copy(action, source, matches);
    else if (!['sleep', 'climb'].includes(action)) throw new Error(`Missing ${action} PNG`);
  }
  for (const [action, folder] of [['walk-left', '左走'], ['walk-right', '右走']]) {
    const directory = path.join(source, folder);
    const frames = fs.readdirSync(directory, { withFileTypes: true })
      .filter(f => f.isFile() && /^\d+(?:[._-]\d+)*\.png$/i.test(f.name)).map(f => f.name);
    copy(action, directory, frames);
  }
  const clip = path.join(source, '老吴.aac');
  if (fs.existsSync(clip)) {
    fs.mkdirSync(path.join(ASSETS,'audio'),{recursive:true});
    fs.copyFileSync(clip,path.join(ASSETS,'audio','laowu.aac'));
    manifest.audio = { laowu:'audio/laowu.aac' };
  }
  const meme=path.join(source,'哦鲸鲸？.png');
  if(fs.existsSync(meme)){
    fs.mkdirSync(path.join(ASSETS,'reactions'),{recursive:true});
    fs.copyFileSync(meme,path.join(ASSETS,'reactions','oh-jing-jing.png'));
    manifest.reactions={penis:'reactions/oh-jing-jing.png'};
  }
  // Load only this exact list: cached old images are never inserted into the loop.
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}
module.exports = { syncMaterials };
if (require.main === module) {
  try {
    const manifest = syncMaterials(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
}

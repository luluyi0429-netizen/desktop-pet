const { Tray, Menu, nativeImage } = require('electron');
function createPetTray(imageData, controls) {
  const icon = nativeImage.createFromDataURL(imageData).resize({ width: 24, height: 24, quality: 'best' });
  const tray = new Tray(icon);
  tray.setToolTip('桌宠 v'+require('./package.json').version+' · 右键设置 · 双击找回');
  tray.on('double-click', () => controls.home());
  let previous;
  return {
    update(state) {
      const key = JSON.stringify([state.height, state.walking, state.hidden, state.muted]);
      if (key === previous) return;
      previous = key;
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: state.hidden ? '显示桌宠' : '暂时隐藏', click: () => controls.visible(state.hidden) },
        { label: '安静模式（只待机或睡觉）', type: 'checkbox', checked: !state.walking, click: item => controls.walking(!item.checked) },
        { label: '桌宠大小', submenu: [50,75,100,125,150,200].map(percent => ({
          label: percent + '%', type: 'radio', checked: Math.round(state.height / 3) === percent,
          click: () => controls.scale(percent)
        })) },
        {label:'静音（所有语音）',type:'checkbox',checked:state.muted,click:item=>controls.muted(item.checked)},
        {label:'神秘小按钮',click:()=>controls.laowu()},
        {label:'暴怒 ▶',click:()=>controls.rage()},
        { label: '标签联动…', click: () => controls.tags() },
        { label: '选中文本…（Ctrl+Alt+T）', click: () => controls.text() },
        { label: '打开设置', click: () => controls.settings() },
        { type: 'separator' },
        { label: '回到桌面 / 找回桌宠', click: () => controls.home() },
        { label: '退出桌宠', click: () => controls.quit() }
      ]));
    },
    destroy() { tray.destroy(); }
  };
}
module.exports = { createPetTray };

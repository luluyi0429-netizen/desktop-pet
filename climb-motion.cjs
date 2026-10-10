const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function climbGeometry(window, pet, area, side, inside = false) {
  if (!window || !['left', 'right'].includes(side)) return null;
  const frame = window.bounds;
  const left = Math.max(frame.x, area.x), right = Math.min(frame.x + frame.width, area.x + area.width);
  // Leave room for the entire pet above the ledge, including its transparent header.
  if (right - left < pet.width + 24 || frame.y - pet.height < area.y + 2 || frame.y >= area.y + area.height) return null;
  const inset = 12;
  const landingX = side === 'left' ? left + inset : right - pet.width - inset;
  const rawX = side === 'left'
    ? inside ? frame.x + 6 : frame.x - pet.width * .65
    : inside ? frame.x + frame.width - pet.width - 6 : frame.x + frame.width - pet.width * .35;
  const sideX = clamp(rawX, area.x, area.x + area.width - pet.width);
  // A mostly off-screen edge cannot be climbed from this display.
  const edgeX = side === 'left' ? frame.x : frame.x + frame.width;
  if (edgeX < area.x || edgeX > area.x + area.width) return null;
  return { sideX, landingX, topY: frame.y - pet.height, frameY: frame.y,
    platform: { id: window.id + ':top', windowId: window.id, edge: 'top', left, right, y: frame.y } };
}
function chooseClimb(windows, pet, area, support, maxApproach = 640, manual = false) {
  const candidates = [];
  for (const window of windows) {
    const inside = Boolean(support && support.windowId === window.id && support.edge === 'inside');
    if (support && !inside) continue;
    const foot = pet.y + pet.height;
    if (foot - window.bounds.y < 48) continue;
    // The feet or hands must be able to reach this window from the current floor.
    if (!manual && !inside && window.bounds.y + window.bounds.height < foot - pet.height * .8) continue;
    for (const side of ['left', 'right']) {
      const geometry = climbGeometry(window, pet, area, side, inside);
      if (!geometry) continue;
      if (support && (geometry.sideX < support.left || geometry.sideX + pet.width > support.right)) continue;
      const distance = Math.abs(geometry.sideX - pet.x);
      if (distance > maxApproach) continue;
      candidates.push({ windowId: window.id, side, inside, geometry, score: distance + (foot - window.bounds.y) * .15 });
    }
  }
  return candidates.sort((a, b) => a.score - b.score)[0] || null;
}
function approach(value, target, step) { return value + Math.sign(target - value) * Math.min(Math.abs(target - value), step); }
function crestPosition(geometry, elapsed, duration, areaTop) {
  const t = clamp(elapsed / duration, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return { x: geometry.sideX + (geometry.landingX - geometry.sideX) * eased,
    y: Math.max(areaTop, geometry.topY - 12 * Math.sin(Math.PI * t)), done: t >= 1 };
}
// A manual command may hop to a raised lower edge after approaching it.
// The landing geometry still keeps the entire pet within its current display.
function grabY(window, pet, area) {
  return clamp(window.bounds.y + window.bounds.height - pet.height * .2,
    area.y, area.y + area.height - pet.height);
}
function explainClimb(windows, pet, area, support, maxApproach = 640) {
  if (!windows.length) return '未检测到文件管理器窗口，请打开一个文件夹窗口并取消最小化';
  const visible = windows.filter(w => w.bounds.x < area.x + area.width && w.bounds.x + w.bounds.width > area.x &&
    w.bounds.y < area.y + area.height && w.bounds.y + w.bounds.height > area.y);
  if (!visible.length) return '文件管理器在另一块屏幕，请把桌宠拖到同一屏幕';
  if (support?.edge === 'top' && visible.some(w => w.id === support.windowId)) return '已经站在窗口顶上啦，可以先拖回桌面再爬';
  const roomy = visible.filter(w => w.bounds.y - pet.height >= area.y + 2);
  if (!roomy.length) return '窗口顶部空间不足，请取消最大化并把窗口下移，或缩小桌宠';
  const wide = roomy.filter(w => Math.min(w.bounds.x+w.bounds.width,area.x+area.width)-Math.max(w.bounds.x,area.x) >= pet.width+24);
  if (!wide.length) return '窗口太窄，请拉宽文件管理器窗口或缩小桌宠';
  const edge = wide.flatMap(w => ['left','right'].map(side => climbGeometry(w,pet,area,side,false)).filter(Boolean));
  if (!edge.length) return '窗口侧边在屏幕外，请把窗口拖回当前屏幕';
  if (edge.every(g => Math.abs(g.sideX-pet.x)>maxApproach)) return '窗口离得较远，请把桌宠拖近窗口左侧或右侧再试';
  return '当前位置无法接近窗口侧边，请先把桌宠拖回桌面再试';
}
module.exports = { chooseClimb, climbGeometry, grabY, explainClimb, approach, crestPosition };

function fits(platform, bounds, area) {
  return platform.right - platform.left >= bounds.width &&
    platform.y - bounds.height >= area.y && platform.y <= area.y + area.height &&
    bounds.x + bounds.width / 2 >= platform.left && bounds.x + bounds.width / 2 <= platform.right;
}
function makePlatforms(windows, area) {
  return windows.flatMap(window => {
    const frame = window.bounds;
    const client = window.client || frame;
    return [
      { id: window.id + ':top', windowId: window.id, edge: 'top', left: frame.x, right: frame.x + frame.width, y: frame.y },
      { id: window.id + ':inside', windowId: window.id, edge: 'inside', left: client.x + 4, right: client.x + client.width - 4, y: client.y + client.height - 4 }
    ].map(platform => ({ ...platform, left: Math.max(area.x, platform.left), right: Math.min(area.x + area.width, platform.right) }));
  });
}
function nearestPlatform(platforms, bounds, area, distance) {
  const foot = bounds.y + bounds.height;
  return platforms.filter(p => fits(p, bounds, area) && Math.abs(p.y - foot) <= distance)
    .sort((a, b) => Math.abs(a.y - foot) - Math.abs(b.y - foot))[0] || null;
}
function landingPlatform(platforms, bounds, area, foot) {
  return platforms.filter(p => fits(p, bounds, area) && p.y >= foot - 1)
    .sort((a, b) => a.y - b.y)[0] || null;
}
function platformPosition(platform, bounds, x = bounds.x) {
  return { x: Math.round(Math.max(platform.left, Math.min(platform.right - bounds.width, x))), y: Math.round(platform.y - bounds.height) };
}
module.exports = { makePlatforms, nearestPlatform, landingPlatform, platformPosition, fits };

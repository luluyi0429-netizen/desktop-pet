// Browser client coordinates are CSS pixels; native rectangles are Electron DIP.
function workbenchPlatform(event, browser, screen, bounds) {
  const p = event?.panel;
  if (!p || !browser) return null;
  // Match the foreground browser window before accepting a page's geometry.
  if (Math.abs(browser.bounds.x - p.screenX) > 30 || Math.abs(browser.bounds.y - p.screenY) > 40) return null;
  const display = screen.getDisplayMatching(browser.bounds);
  const zoom = p.dpr / display.scaleFactor;
  if (!(zoom >= .25 && zoom <= 5)) return null;
  const viewport = (browser.viewports || []).find(r =>
    Math.abs(r.width - p.innerWidth * zoom) < 12 && Math.abs(r.height - p.innerHeight * zoom) < 12);
  let origin;
  if (viewport) origin = {x: viewport.x, y: viewport.y};
  else if (p.pointer) origin = {x: p.pointer.screenX - p.pointer.clientX * zoom, y: p.pointer.screenY - p.pointer.clientY * zoom};
  else return null; // Wait for a real pointer sample; never guess sidebar offsets.
  if (origin.x < browser.bounds.x - 12 || origin.y < browser.bounds.y - 12 ||
      origin.x + p.innerWidth * zoom > browser.bounds.x + browser.bounds.width + 12 ||
      origin.y + p.innerHeight * zoom > browser.bounds.y + browser.bounds.height + 12) return null;
  const area = display.workArea;
  const left = Math.max(area.x, origin.x + Math.max(0,p.left) * zoom);
  const right = Math.min(area.x + area.width, origin.x + Math.min(p.innerWidth,p.left + p.width) * zoom);
  const y = origin.y + p.top * zoom;
  if (p.top < 0 || p.top > p.innerHeight || right-left < bounds.width ||
      y-bounds.height < area.y || y > area.y+area.height) return null;
  return {id:'workbench:' + event.clientId, windowId:browser.id, edge:'workbench',left,right,y};
}
module.exports = {workbenchPlatform};

const { nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function loadSprites() {
  const definitions = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'manifest.json'), 'utf8')).actions;
  let baseHeadWidth = 0, baseHeight = 0;
  let maxWidth = 0, maxHeight = 0;
  const actions = {};
  for (const [action, files] of Object.entries(definitions)) {
    actions[action] = files.map(file => {
      const image = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
      if (image.isEmpty()) throw new Error(`Missing sprite: ${file}`);
      const { width, height } = image.getSize();
      const pixels = image.toBitmap();
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] > 8) {
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error(`Empty sprite: ${file}`);
      let headWidth = 0;
      for (let y = top; y < top + (bottom - top + 1) * .65; y++) {
        let rowLeft = width, rowRight = -1;
        for (let x = left; x <= right; x++) {
          const offset = (y * width + x) * 4;
          const blue = pixels[offset], green = pixels[offset + 1], red = pixels[offset + 2];
          if (pixels[offset + 3] > 32 && red > 90 && red > green * 1.15 && red > blue * 1.06) {
            rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x);
          }
        }
        headWidth = Math.max(headWidth, rowRight - rowLeft + 1);
      }
      headWidth ||= right - left + 1;
      if (!baseHeadWidth) { baseHeadWidth = headWidth; baseHeight = bottom - top + 1; }
      const cropped = image.crop({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 });
      // Match the head scale while preserving the shorter silhouette of crouching poses.
      const factor = action === 'laowu' ? Math.min(maxWidth / (right-left+1), baseHeight / (bottom-top+1)) : baseHeadWidth / headWidth;
      const normalizedWidth = (right - left + 1) * factor;
      const normalizedHeight = (bottom - top + 1) * factor;
      if (action !== 'laowu') {
        maxWidth = Math.max(maxWidth, normalizedWidth);
        maxHeight = Math.max(maxHeight, normalizedHeight);
      }
      return { file, image: cropped.toDataURL(), width: normalizedWidth / baseHeight, height: normalizedHeight / baseHeight };
    });
  }
  return { actions, aspect: maxWidth / baseHeight, heightFactor: maxHeight / baseHeight };
}

module.exports = { loadSprites };

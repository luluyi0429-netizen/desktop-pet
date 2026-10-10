function advanceWalk(position, direction, min, max, seconds, speed = 36) {
  if (max <= min) return { position: min, direction };
  let next = position + direction * speed * seconds;
  // Reflect at the edge, so there is no random reversal or standing delay.
  while (next < min || next > max) {
    if (next < min) { next = min + (min - next); direction = 1; }
    if (next > max) { next = max - (next - max); direction = -1; }
  }
  return { position: next, direction };
}
module.exports = { advanceWalk };

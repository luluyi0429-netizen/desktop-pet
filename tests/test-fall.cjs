const assert = require('node:assert/strict');
const { advanceFall } = require('../fall-motion.cjs');
for (const distance of [1, 40, 300, 700]) {
  let position = 0, velocity = 0, seconds = 0, landed = false;
  while (!landed && seconds < 15) {
    const next = advanceFall(position, distance, velocity, .016);
    assert(next.position >= position && next.position <= distance);
    assert(next.velocity <= 180);
    position = next.position;
    velocity = next.velocity;
    landed = next.landed;
    seconds += .016;
  }
  assert(landed);
  assert.equal(position, distance);
  if (distance >= 300) assert(seconds > 1.5);
  console.log(`${distance}px descent: ${seconds.toFixed(2)}s`);
}

// All movement distances use logical (DIP) pixels; durations use milliseconds.
const BEHAVIOR = Object.freeze({
  walkSpeed: 45, climbSpeed: 72, climbOverMs: 850, climbApproachMax: 640,
  restMin: 18000, restMax: 32000,
  moveMin: 6000, moveMax: 10000,
  sitAfter: 60000, sitPoseMin: 45000, sitPoseMax: 75000, sleepAfter: 300000, crawlChance: 0.25,
  walkFrameMs: 96, crawlFrameMs: 260, snapDistance: 36,
  supportGraceMs: 650
});
function randomBetween(min, max, random = Math.random) { return min + random() * (max - min); }
function randomClick(count, random = Math.random) { return Math.min(count - 1, Math.floor(random() * count)); }
function isMoving(action) { return action.startsWith('walk-') || action === 'climb'; }
module.exports = { BEHAVIOR, randomBetween, randomClick, isMoving };

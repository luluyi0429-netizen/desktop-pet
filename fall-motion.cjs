// Slow descent in logical screen pixels: accelerate gently, cap speed, soften landing.
function advanceFall(position, target, velocity, dt) {
  const remaining = target - position;
  if (remaining <= .7) return { position: target, velocity: 0, landed: true };
  const acceleration = 240;
  const desired = Math.min(180, Math.sqrt(2 * acceleration * remaining));
  const nextVelocity = velocity < desired
    ? Math.min(desired, velocity + acceleration * dt)
    : Math.max(desired, velocity - acceleration * dt);
  const nextPosition = Math.min(target, position + nextVelocity * dt);
  return { position: nextPosition, velocity: nextVelocity, landed: nextPosition >= target };
}
module.exports = { advanceFall };

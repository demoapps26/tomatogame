const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const deltaAngle = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
const damp = (from, to, speed, dt) =>
  from + (to - from) * (1 - Math.exp(-speed * dt));

/**
 * A spring-like chase camera expressed in the game's existing orbit convention:
 * a vehicle's +Z nose has orbit yaw PI behind it. Looking with the mouse holds
 * the chosen orbit for a moment, then smoothly returns behind the vehicle.
 * This module owns no input, rendering, or player state.
 */
export function createDrivingCamera(initialYaw = 0) {
  let yaw = finite(initialYaw, 0);
  let manualTime = 0;
  let distance = 8.8;
  let height = 1.65;
  let targetAhead = 0;

  function reset(nextYaw = 0) {
    yaw = finite(nextYaw, 0);
    manualTime = 0;
    distance = 8.8;
    height = 1.65;
    targetAhead = 0;
  }

  function noteManualLook() {
    manualTime = 2.25;
  }

  function update(dt, input = {}) {
    const seconds = clamp(finite(dt, 0), 0, 0.25);
    const carYaw = finite(input.carYaw, yaw + Math.PI);
    const speed = finite(input.speed, 0);
    const orbitYaw = finite(input.orbitYaw, yaw);
    let pitch = clamp(finite(input.pitch, 0.24), -0.12, 1.05);
    if (input.manualLook) noteManualLook();
    const holdingLook = manualTime > 0;
    manualTime = Math.max(0, manualTime - seconds);

    // Always start from the caller's orbit, including genuine mouse movement.
    // Adding the shortest delta avoids the discontinuity at +/-PI.
    yaw = orbitYaw;
    if (!holdingLook) {
      const responsiveness = 2.4 + Math.min(1.5, Math.abs(speed) * 0.065);
      yaw +=
        deltaAngle(yaw, carYaw - Math.PI) *
        (1 - Math.exp(-responsiveness * seconds));
      pitch = damp(pitch, 0.24, 1.7, seconds);
    }
    // Keep numerical precision during long sessions without changing direction.
    if (Math.abs(yaw) > TAU * 1000) yaw %= TAU;

    distance = damp(
      distance,
      8.8 + Math.min(3, Math.abs(speed) * 0.115),
      3,
      seconds,
    );
    height = damp(
      height,
      1.65 + Math.min(0.35, Math.abs(speed) * 0.015),
      3,
      seconds,
    );
    // Reversing looks slightly towards the reversing motion rather than
    // unexpectedly rotating the whole view by 180 degrees.
    targetAhead = damp(targetAhead, clamp(speed * 0.11, -1, 2.5), 3, seconds);
    return { yaw, pitch, distance, height, targetAhead };
  }

  return { reset, noteManualLook, update };
}

// Metres, seconds and radians. These values describe a forgiving road car,
// rather than a rigid-body simulation tied to a renderer or collision system.
const MAX_STEP = 0.1;
const SUBSTEPS_PER_SECOND = 120;
const MAX_STEERING = 0.65;
const MAX_LATERAL_SPEED = 1.35;
const SHIFT_POINTS = [0.18, 0.36, 0.56, 0.76, 0.92];
const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));
const finite = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const positive = (value, fallback, minimum, maximum) =>
  clamp(
    finite(value, fallback) > 0 ? finite(value, fallback) : fallback,
    minimum,
    maximum,
  );
const approachZero = (value, amount) =>
  Math.sign(value) * Math.max(0, Math.abs(value) - amount);
const damp = (value, target, response, dt) =>
  target + (value - target) * Math.exp(-response * dt);

function safeYaw(value) {
  const yaw = finite(value);
  // Ordinary angles stay continuous across PI for the chase camera. Only
  // nonsensically large imported values need reducing for numeric precision.
  return Math.abs(yaw) > 1e6 ? yaw % (Math.PI * 2) : yaw;
}

function gearForSpeed(speed, previous, topSpeed, throttle, canDrive) {
  if (speed < -0.08) return -1;
  if (Math.abs(speed) < 0.08)
    return canDrive && throttle !== 0 ? (throttle < 0 ? -1 : 1) : 0;
  const fraction = Math.max(0, speed / topSpeed);
  let gear =
    Number.isInteger(previous) && previous > 0 && previous <= 6 ? previous : 1;
  // Small hysteresis avoids an audible up/downshift loop at a shift boundary.
  while (gear < 6 && fraction > SHIFT_POINTS[gear - 1] + 0.012) gear++;
  while (gear > 1 && fraction < SHIFT_POINTS[gear - 2] - 0.012) gear--;
  return gear;
}

function engineRpm(speed, gear, topSpeed, reverseSpeed, throttle, canDrive) {
  if (!canDrive) return 0;
  const idle = 850;
  if (gear === 0) return idle;
  if (gear < 0)
    return idle + clamp(Math.abs(speed) / reverseSpeed, 0, 1) * 4450;
  const fraction = Math.max(0, speed / topSpeed);
  const low = gear === 1 ? 0 : SHIFT_POINTS[gear - 2];
  const high = gear === 6 ? 1 : SHIFT_POINTS[gear - 1];
  const progress = clamp((fraction - low) / (high - low), 0, 1);
  const floor = gear === 1 ? idle : 2350;
  return (
    floor +
    progress * (6500 - floor) +
    Math.abs(throttle) * 250 * (1 - progress)
  );
}

/**
 * Advance an accessible arcade road-car controller without mutating inputs.
 *
 * `throttle` and `turn` range from -1 to 1, `brake` is the strong space brake,
 * and wetness ranges from 0 to 1. Disabled drive prevents engine propulsion
 * but leaves steering and brakes available while coasting. Collisions belong
 * to the caller, which applies dx/dz and may zero/bounce speed afterwards.
 *
 * Gear: -1 reverse, 0 neutral, 1–6 forward. RPM is engine revolutions/minute.
 */
export function advanceDriving(state = {}, input = {}, model = {}, dt = 0) {
  state = state && typeof state === "object" ? state : {};
  input = input && typeof input === "object" ? input : {};
  model = model && typeof model === "object" ? model : {};
  const topSpeed = positive(model.topSpeed, 23, 5, 65);
  const acceleration = positive(model.acceleration, 11, 1, 35);
  const brakingPower = positive(model.braking, 22, 4, 60);
  const handling = positive(model.handling, 0.85, 0.35, 1.6);
  const wheelbase = positive(model.wheelbase, 2.7, 2, 3.6);
  const reverseSpeed = Math.min(7.5, topSpeed * 0.3);
  const throttle = clamp(finite(input.throttle), -1, 1);
  const turn = clamp(finite(input.turn), -1, 1);
  const wetness = clamp(finite(input.wetness), 0, 1);
  const strongBrake = input.brake === true;
  const canDrive = input.canDrive !== false;
  const seconds = clamp(finite(dt), 0, MAX_STEP);
  let speed = clamp(finite(state.speed), -reverseSpeed, topSpeed);
  let steering = clamp(finite(state.steering), -MAX_STEERING, MAX_STEERING);
  let yaw = safeYaw(state.yaw);
  let lateralSpeed = clamp(
    finite(state.lateralSpeed),
    -MAX_LATERAL_SPEED,
    MAX_LATERAL_SPEED,
  );
  let gear =
    Number.isInteger(state.gear) && state.gear >= -1 && state.gear <= 6
      ? state.gear
      : gearForSpeed(speed, 0, topSpeed, 0, canDrive);
  let rpm = clamp(
    finite(
      state.rpm,
      engineRpm(speed, gear, topSpeed, reverseSpeed, 0, canDrive),
    ),
    0,
    7000,
  );
  let dx = 0,
    dz = 0;
  if (seconds === 0)
    return {
      speed,
      steering,
      yaw,
      lateralSpeed,
      dx,
      dz,
      gear,
      rpm,
      braking: state.braking === true,
    };

  // Keep a stop stage when changing W/S direction. One input update brakes to
  // rest; a subsequent update can engage the other direction safely.
  const opposite = throttle * speed < 0 && Math.abs(speed) > 0.001;
  const braking = strongBrake || opposite;
  const lateralGrip =
    clamp((7.7 * handling) / 0.85, 6, 9) * (1 - wetness * 0.2);
  const longitudinalGrip = 10.4 * (1 - wetness * 0.2);
  const footBrake = clamp(brakingPower * 0.35, 6.9, 8.5) * (1 - wetness * 0.16);
  const spaceBrake =
    clamp(brakingPower * 0.46, 8.8, 10.8) * (1 - wetness * 0.16);
  const steps = Math.max(1, Math.ceil(seconds * SUBSTEPS_PER_SECOND - 1e-9));
  const step = seconds / steps;
  for (let index = 0; index < steps; index++) {
    const oldSpeed = speed;
    const magnitude = Math.abs(speed);
    const drag = 0.38 + 0.0014 * magnitude * magnitude;
    if (strongBrake) speed = approachZero(speed, spaceBrake * step);
    else if (opposite)
      speed = approachZero(speed, footBrake * Math.abs(throttle) * step);
    else if (canDrive && throttle !== 0) {
      const limit = throttle < 0 ? reverseSpeed : topSpeed;
      const ratio = clamp(magnitude / limit, 0, 1);
      const engineForce =
        acceleration * (throttle < 0 ? 0.48 : 0.78) * (1 - ratio * ratio * 0.6);
      const force =
        Math.min(engineForce, longitudinalGrip) * Math.abs(throttle);
      speed += Math.sign(throttle) * force * step;
      speed = approachZero(speed, drag * step);
    } else speed = approachZero(speed, (drag + 0.35) * step);
    speed = clamp(speed, -reverseSpeed, topSpeed);
    if ((braking || throttle === 0 || !canDrive) && Math.abs(speed) < 0.025)
      speed = 0;

    const averageSpeed = (oldSpeed + speed) * 0.5;
    const absoluteSpeed = Math.abs(averageSpeed);
    const steeringScale = 1 / (1 + Math.pow(absoluteSpeed / 12, 1.4));
    const maximumAngle = Math.min(
      MAX_STEERING,
      0.58 * Math.sqrt(handling / 0.85),
    );
    const tractionAngle = Math.atan(
      (lateralGrip * wheelbase) / Math.max(absoluteSpeed * absoluteSpeed, 0.1),
    );
    const targetSteering =
      turn * Math.min(maximumAngle * steeringScale, tractionAngle);
    const steerResponse =
      (turn === 0 ? 7.2 : absoluteSpeed < 8 ? 6.5 : 5.2) * (1 - wetness * 0.08);
    steering = damp(steering, targetSteering, steerResponse, step);
    if (Math.abs(steering) < 1e-7) steering = 0;
    const bicycleRate = (averageSpeed * Math.tan(steering)) / wheelbase;
    const maximumRate = lateralGrip / Math.max(absoluteSpeed, 0.5);
    const yawRate = clamp(bicycleRate, -maximumRate, maximumRate);
    const yawDelta = yawRate * step;
    const oldLateral = lateralSpeed;
    // Mild velocity lag gives a sense of mass, with a hard bound that cannot
    // turn an ordinary keyboard corner into an uncontrollable drift.
    const gripResponse = strongBrake ? 7.2 - wetness * 1.2 : 12 - wetness * 3.7;
    lateralSpeed =
      (lateralSpeed - averageSpeed * yawDelta) * Math.exp(-gripResponse * step);
    const lateralLimit = Math.min(0.95 + wetness * 0.4, Math.abs(speed) * 0.12);
    lateralSpeed = clamp(lateralSpeed, -lateralLimit, lateralLimit);
    if (Math.abs(speed) < 0.08) lateralSpeed = 0;
    const averageLateral = speed === 0 ? 0 : (oldLateral + lateralSpeed) * 0.5;
    const heading = yaw + yawDelta * 0.5;
    dx +=
      (Math.sin(heading) * averageSpeed + Math.cos(heading) * averageLateral) *
      step;
    dz +=
      (Math.cos(heading) * averageSpeed - Math.sin(heading) * averageLateral) *
      step;
    yaw += yawDelta;
    gear = gearForSpeed(
      speed,
      gear,
      topSpeed,
      braking ? 0 : throttle,
      canDrive,
    );
    const targetRpm = engineRpm(
      speed,
      gear,
      topSpeed,
      reverseSpeed,
      braking ? 0 : throttle,
      canDrive,
    );
    rpm = canDrive ? damp(rpm, targetRpm, 9, step) : 0;
  }
  return { speed, steering, yaw, lateralSpeed, dx, dz, gear, rpm, braking };
}

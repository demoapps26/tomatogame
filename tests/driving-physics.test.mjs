import test from "node:test";
import assert from "node:assert/strict";
import { advanceDriving } from "../src/driving-physics.js";
import { CAR_CATALOG } from "../src/ownership-state.js";

const compact = CAR_CATALOG.find((model) => model.id === "compact");
const sport = CAR_CATALOG.find((model) => model.id === "sport");
const close = (actual, expected, tolerance = 1e-8) =>
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected}`,
  );

function simulate(initial, input, model, seconds, frame = 1 / 60) {
  let state = { ...initial },
    x = 0,
    z = 0;
  const samples = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) {
    state = advanceDriving(
      state,
      input,
      model,
      Math.min(frame, seconds - elapsed),
    );
    x += state.dx;
    z += state.dz;
    samples.push({ ...state, x, z });
  }
  return { ...state, x, z, samples };
}

function stop(initialSpeed, input, model = compact) {
  let state = { speed: initialSpeed, yaw: 0 },
    distance = 0,
    elapsed = 0;
  while (Math.abs(state.speed) > 0 && elapsed < 15) {
    state = advanceDriving(state, input, model, 1 / 120);
    distance += Math.hypot(state.dx, state.dz);
    elapsed += 1 / 120;
  }
  assert(elapsed < 15, "The brakes must actually stop the car");
  return { ...state, distance, elapsed };
}

test("a parked car never drives itself, even with steering, rain or disabled propulsion", () => {
  for (const input of [
    {},
    { turn: 1 },
    { turn: -1, wetness: 1 },
    { throttle: 1, turn: 1, canDrive: false },
  ]) {
    const result = simulate({}, input, compact, 6);
    assert.equal(result.speed, 0);
    assert.equal(result.lateralSpeed, 0);
    assert.equal(result.x, 0);
    assert.equal(result.z, 0);
    assert.equal(result.yaw, 0);
  }
  const engineOff = simulate({}, { throttle: 1, canDrive: false }, compact, 1);
  assert.equal(engineOff.rpm, 0);
});

test("catalogue performance remains distinct and all cars reach their stated m/s speed limit", () => {
  for (const model of CAR_CATALOG) {
    const result = simulate({}, { throttle: 1 }, model, 20);
    close(result.speed, model.topSpeed);
    assert(
      result.samples.every(
        (sample) => sample.speed >= 0 && sample.speed <= model.topSpeed,
      ),
    );
    assert(
      result.z > model.topSpeed * 12,
      "The top speed is attained rather than only approached far below the specification",
    );
    assert.equal(result.x, 0);
    assert.equal(result.yaw, 0);
  }
  const starter = simulate({}, { throttle: 1 }, compact, 3);
  const fastCar = simulate({}, { throttle: 1 }, sport, 3);
  assert(fastCar.speed > starter.speed + 5);
  const launch = simulate({}, { throttle: 1 }, compact, 1);
  const nearTop = simulate({ speed: 20 }, { throttle: 1 }, compact, 1);
  assert(
    launch.speed > nearTop.speed - 20 + 2,
    "Acceleration tapers as speed rises",
  );
});

test("coasting retains momentum while steering and braking still work without fuel", () => {
  const coast = simulate({ speed: 23 }, {}, compact, 2);
  assert(coast.speed > 15 && coast.speed < 23);
  const off = simulate(
    { speed: 23 },
    { throttle: 1, canDrive: false },
    compact,
    2,
  );
  close(off.speed, coast.speed);
  assert.equal(off.rpm, 0);
  const braking = stop(23, { throttle: -1, canDrive: false });
  assert.equal(braking.speed, 0);
  assert.equal(braking.gear, 0);
  const turn = simulate(
    { speed: 15 },
    { turn: 1, canDrive: false },
    compact,
    0.5,
  );
  assert(turn.yaw > 0 && turn.x > 0);
});

test("space braking stops faster than S and rain moderately increases stopping distance", () => {
  const foot = stop(24, { throttle: -1 });
  const space = stop(24, { brake: true });
  const wet = stop(24, { brake: true, wetness: 1 });
  assert(
    space.elapsed >= 2.2 && space.elapsed <= 2.8,
    "Emergency braking keeps perceptible weight",
  );
  assert(space.distance >= 25 && space.distance <= 36);
  assert(
    foot.elapsed >= 2.8 && foot.elapsed <= 3.5,
    "S uses a comfortable road-car stopping rate",
  );
  assert(foot.distance >= 32 && foot.distance <= 45);
  assert(space.elapsed < foot.elapsed);
  assert(space.distance < foot.distance);
  assert(wet.distance > space.distance * 1.1);
  assert(wet.distance < space.distance * 1.35);
  assert.equal(space.speed, 0);
  assert.equal(space.lateralSpeed, 0);
});

test("opposite throttle stops before engaging reverse, and reverse remains speed limited", () => {
  const stopped = advanceDriving(
    { speed: 0.2, yaw: 0 },
    { throttle: -1 },
    compact,
    0.1,
  );
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.gear, 0);
  assert.equal(stopped.braking, true);
  const reversed = advanceDriving(stopped, { throttle: -1 }, compact, 0.1);
  assert(reversed.speed < 0);
  assert.equal(reversed.gear, -1);
  assert.equal(reversed.braking, false);
  const reverse = simulate({}, { throttle: -1 }, sport, 8);
  assert(reverse.speed >= -7.5 && reverse.speed < -7);
  assert(reverse.z < 0);
  const forwardStop = advanceDriving(
    { speed: -0.2, yaw: 0 },
    { throttle: 1 },
    compact,
    0.1,
  );
  assert.equal(forwardStop.speed, 0);
  assert(advanceDriving(forwardStop, { throttle: 1 }, compact, 0.1).speed > 0);
});

test("high-speed steering is limited by tyre grip while low-speed manoeuvres remain agile", () => {
  const low = simulate({ speed: 4 }, { turn: 1 }, compact, 1);
  const high = simulate({ speed: 37 }, { turn: 1 }, sport, 1);
  assert(low.yaw > 0.5);
  assert(
    high.yaw < 0.25,
    "A at motorway speed cannot turn the car through a tight circle",
  );
  assert(low.steering > high.steering * 8);
  const frame = 1 / 120;
  let state = { speed: 37, steering: 0.65, yaw: 0 };
  for (let index = 0; index < 240; index++) {
    const before = state;
    state = advanceDriving(state, { throttle: 1, turn: 1 }, sport, frame);
    const midpointSpeed = (before.speed + state.speed) / 2;
    const lateralAcceleration = Math.abs(
      ((state.yaw - before.yaw) / frame) * midpointSpeed,
    );
    assert(
      lateralAcceleration <= 9 + 1e-8,
      "The bicycle model respects the lateral acceleration budget",
    );
    assert(Math.abs(state.lateralSpeed) <= 0.95 + 1e-8);
  }
});

test("wet corners lose a moderate amount of grip without creating an uncontrolled slide", () => {
  const dry = simulate({ speed: 23 }, { turn: 1 }, compact, 1);
  const wet = simulate({ speed: 23 }, { turn: 1, wetness: 1 }, compact, 1);
  assert(wet.yaw < dry.yaw * 0.9);
  assert(wet.yaw > dry.yaw * 0.6);
  assert(Math.abs(wet.lateralSpeed) < 1.35);
  assert(wet.speed > dry.speed * 0.9);
  const released = simulate(wet, {}, compact, 1);
  assert(Math.abs(released.steering) < 0.001);
  assert(Math.abs(released.lateralSpeed) < 0.001);
});

test("left and right turns mirror each other and headings match the game's +Z forward convention", () => {
  const left = simulate({ speed: 8 }, { turn: 0.7 }, compact, 1);
  const right = simulate({ speed: 8 }, { turn: -0.7 }, compact, 1);
  close(left.x, -right.x);
  close(left.z, right.z);
  close(left.yaw, -right.yaw);
  const east = advanceDriving(
    { speed: 10, yaw: Math.PI / 2 },
    {},
    compact,
    0.1,
  );
  assert(east.dx > 0);
  assert(Math.abs(east.dz) < 1e-12);
  const westReverse = advanceDriving(
    { speed: -5, yaw: Math.PI / 2 },
    {},
    compact,
    0.1,
  );
  assert(westReverse.dx < 0);
  assert(Math.abs(westReverse.dz) < 1e-12);
});

test("constant driving is stable at 30, 60 and 120 fps, including position, steering and gearbox", () => {
  const input = { throttle: 1, turn: 0.4, wetness: 0.35 };
  const reference = simulate({}, input, compact, 5, 1 / 120);
  for (const frame of [1 / 30, 1 / 60]) {
    const result = simulate({}, input, compact, 5, frame);
    for (const key of [
      "x",
      "z",
      "speed",
      "steering",
      "yaw",
      "lateralSpeed",
      "rpm",
    ])
      close(result[key], reference[key], 1e-7);
    assert.equal(result.gear, reference.gear);
  }
});

test("braking into reverse stays consistent across frame rates despite a safe stop stage", () => {
  const input = { throttle: -1, turn: 0.25 };
  const reference = simulate({ speed: 12 }, input, compact, 4, 1 / 120);
  for (const frame of [1 / 30, 1 / 60]) {
    const result = simulate({ speed: 12 }, input, compact, 4, frame);
    close(result.speed, reference.speed);
    assert(Math.hypot(result.x - reference.x, result.z - reference.z) < 0.1);
    assert(Math.abs(result.yaw - reference.yaw) < 0.005);
    assert.equal(result.gear, -1);
  }
});

test("zero dt preserves an existing simulation state exactly and long frames are safely capped", () => {
  const state = Object.freeze({
    speed: 8,
    steering: 0.12,
    yaw: 6.2,
    lateralSpeed: 0.3,
    gear: 3,
    rpm: 3200,
    braking: true,
  });
  const input = Object.freeze({
    throttle: -1,
    turn: -1,
    brake: false,
    canDrive: false,
  });
  const result = advanceDriving(state, input, compact, 0);
  assert.deepEqual(result, { ...state, dx: 0, dz: 0 });
  assert.deepEqual(
    advanceDriving(state, input, compact, 10),
    advanceDriving(state, input, compact, 0.1),
  );
  assert.deepEqual(advanceDriving(state, input, compact, NaN), result);
  assert.deepEqual(advanceDriving(state, input, compact, -1), result);
});

test("gear and RPM progress through acceleration and remain bounded for audio and HUD", () => {
  const result = simulate({}, { throttle: 1 }, sport, 8);
  const gears = new Set(result.samples.map((sample) => sample.gear));
  assert(gears.size >= 5);
  assert.equal(result.gear, 6);
  assert(
    result.samples.every((sample) => sample.rpm >= 0 && sample.rpm <= 7000),
  );
  assert(
    result.samples.some(
      (sample, index, samples) =>
        index > 0 &&
        sample.rpm < samples[index - 1].rpm - 1 &&
        sample.speed >= samples[index - 1].speed,
    ),
  );
  const stopped = simulate({}, {}, compact, 2);
  assert.equal(stopped.gear, 0);
  assert(stopped.rpm >= 800 && stopped.rpm <= 900);
});

test("malformed inputs stay finite and the controller never mutates any input object", () => {
  const state = Object.freeze({
    speed: 12,
    steering: 0.1,
    yaw: 0.7,
    lateralSpeed: 0.2,
  });
  const input = Object.freeze({
    throttle: 1,
    turn: 1,
    brake: false,
    wetness: 0.5,
  });
  const model = Object.freeze({ ...compact });
  const before = JSON.stringify({ state, input, model });
  advanceDriving(state, input, model, 0.1);
  assert.equal(JSON.stringify({ state, input, model }), before);
  for (const [badState, badInput, badModel, dt] of [
    [null, null, null, 0.1],
    [
      {
        speed: Infinity,
        steering: NaN,
        yaw: -Infinity,
        lateralSpeed: Infinity,
      },
      { throttle: Infinity, turn: NaN, wetness: Infinity },
      { topSpeed: -1, braking: Infinity },
      0.1,
    ],
    [
      {
        speed: 1e200,
        steering: 1e200,
        yaw: Number.MAX_VALUE,
        lateralSpeed: 1e200,
      },
      { throttle: 100, turn: 100, wetness: 100 },
      { topSpeed: 1e200, acceleration: 1e200, braking: 1e200, handling: 1e200 },
      0.1,
    ],
    [{ speed: 8 }, { throttle: 1 }, {}, Infinity],
  ]) {
    const result = advanceDriving(badState, badInput, badModel, dt);
    for (const [key, value] of Object.entries(result))
      if (key !== "braking")
        assert(Number.isFinite(value), `${key} must be finite`);
    assert(Math.abs(result.lateralSpeed) <= 1.35);
    assert(
      result.gear >= -1 && result.gear <= 6 && Number.isInteger(result.gear),
    );
    assert(Math.hypot(result.dx, result.dz) <= 6.7);
    assert.equal(typeof result.braking, "boolean");
  }
});

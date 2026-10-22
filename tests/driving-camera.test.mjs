import test from "node:test";
import assert from "node:assert/strict";
import { createDrivingCamera } from "../src/driving-camera.js";

const angularError = (a, b) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function simulate(camera, input, seconds, step = 1 / 60) {
  let result = { yaw: input.orbitYaw ?? 0, pitch: input.pitch ?? 0.24 };
  for (let time = 0; time < seconds - 1e-8; time += step) {
    result = camera.update(Math.min(step, seconds - time), {
      ...input,
      orbitYaw: result.yaw,
      pitch: result.pitch,
    });
  }
  return result;
}

test("the chase camera follows an actual vehicle turn and never jumps across PI", () => {
  const camera = createDrivingCamera(Math.PI - 0.04);
  const result = camera.update(1 / 60, {
    carYaw: 0.04,
    speed: 18,
    orbitYaw: Math.PI - 0.04,
    pitch: 0.24,
  });
  assert(Math.abs(result.yaw - (Math.PI - 0.04)) < 0.02);
  const followed = simulate(
    camera,
    { ...result, orbitYaw: result.yaw, carYaw: Math.PI / 2, speed: 18 },
    3,
  );
  assert(angularError(followed.yaw, -Math.PI / 2) < 0.002);
});

test("a manual look remains free, then smoothly returns behind the car", () => {
  const camera = createDrivingCamera();
  camera.noteManualLook();
  const free = simulate(
    camera,
    { carYaw: Math.PI, speed: 12, orbitYaw: 1.2, pitch: 0.5 },
    2,
  );
  assert.equal(free.yaw, 1.2);
  assert.equal(free.pitch, 0.5);
  const recentered = simulate(
    camera,
    { carYaw: Math.PI, speed: 12, orbitYaw: free.yaw, pitch: free.pitch },
    4,
  );
  assert(angularError(recentered.yaw, 0) < 0.001);
  assert(Math.abs(recentered.pitch - 0.24) < 0.002);
});

test("reverse driving changes look-ahead without an abrupt 180-degree orbit", () => {
  const camera = createDrivingCamera(0);
  const forward = simulate(
    camera,
    { carYaw: Math.PI, speed: 23, orbitYaw: 0 },
    2,
  );
  const reverse = simulate(
    camera,
    { carYaw: Math.PI, speed: -7, orbitYaw: forward.yaw },
    2,
  );
  assert.equal(reverse.yaw, 0);
  assert(reverse.targetAhead < 0);
  assert(forward.targetAhead > 2);
  assert(reverse.distance < forward.distance);
});

test("following the same heading is independent of the render frame rate", () => {
  const input = { carYaw: 1.3, speed: 17, orbitYaw: 0.4, pitch: 0.3 };
  const at30 = simulate(createDrivingCamera(), input, 2, 1 / 30);
  const at120 = simulate(createDrivingCamera(), input, 2, 1 / 120);
  assert(Math.abs(at30.yaw - at120.yaw) < 1e-10);
  assert(Math.abs(at30.distance - at120.distance) < 1e-10);
  assert(Math.abs(at30.targetAhead - at120.targetAhead) < 1e-10);
});

import test from "node:test";
import assert from "node:assert/strict";
import { cameraBoomPosition } from "../src/camera-obstruction.js";

const target = { x: 0, y: 1.35, z: 0 };
const wall = { minX: -4, maxX: 4, minZ: 2, maxZ: 2.08, minY: 0, maxY: 4 };
test("a thin wall stops a long camera boom before its padded surface", () => {
  const camera = cameraBoomPosition(target, { x: 0, y: 2, z: 20 }, [wall]);
  assert(camera.z < 1.8 && camera.z > 1.7);
  assert(camera.y > 1.35 && camera.y < 1.5);
});
test("camera can look over low furniture but cannot cross a full-height wall", () => {
  const desired = { x: 0, y: 2.5, z: 5 };
  assert.deepEqual(
    cameraBoomPosition(target, desired, [{ ...wall, maxY: 0.8 }]),
    desired,
  );
  assert(cameraBoomPosition(target, desired, [wall]).z < 1.8);
});
test("diagonal corners, parallel paths and closest obstruction are resolved geometrically", () => {
  const corner = { minX: 2, maxX: 3, minZ: 2, maxZ: 3, maxY: 8 };
  const result = cameraBoomPosition(target, { x: 8, y: 1.35, z: 8 }, [corner]);
  assert(result.x < 1.8 && result.z < 1.8);
  assert.deepEqual(
    cameraBoomPosition(target, { x: 0, y: 1.35, z: 8 }, [corner]),
    { x: 0, y: 1.35, z: 8 },
  );
  assert.deepEqual(
    cameraBoomPosition(target, { x: 0, y: 2, z: 20 }, [
      { ...wall, minZ: 8, maxZ: 9 },
      wall,
    ]),
    cameraBoomPosition(target, { x: 0, y: 2, z: 20 }, [wall]),
  );
});
test("an overlapping padded edge allows escape and a zero-length boom stays finite", () => {
  assert.deepEqual(cameraBoomPosition(target, target, [wall]), target);
  const touching = { ...wall, minZ: -0.1, maxZ: 0.1 };
  const desired = { x: 0, y: 2, z: -3 };
  assert.deepEqual(cameraBoomPosition(target, desired, [touching]), desired);
  const boundary = { x: 0, y: 1.35, z: 1.8 };
  assert.deepEqual(cameraBoomPosition(boundary, target, [wall]), target);
});

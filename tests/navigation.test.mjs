import test from "node:test";
import assert from "node:assert/strict";
import { createNavigation } from "../src/navigation.js";

const bounds = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };

// Independently sample the returned route as an actor with a 0.4m body radius.
function assertWalkable(start, path, boxes, area = bounds) {
  let previous = start;
  for (const target of path) {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(target.x - previous.x, target.z - previous.z) * 100),
    );
    for (let i = 0; i <= steps; i++) {
      const x = previous.x + ((target.x - previous.x) * i) / steps;
      const z = previous.z + ((target.z - previous.z) * i) / steps;
      assert(
        x >= area.minX + 0.4 &&
          x <= area.maxX - 0.4 &&
          z >= area.minZ + 0.4 &&
          z <= area.maxZ - 0.4,
        "Actor stays within the playable area",
      );
      for (const box of boxes)
        assert(
          !(
            x >= box.minX - 0.4 &&
            x <= box.maxX + 0.4 &&
            z >= box.minZ - 0.4 &&
            z <= box.maxZ + 0.4
          ),
          "Route preserves clearance from each obstacle",
        );
    }
    previous = target;
  }
}

test("an open road has one waypoint at the exact requested destination", () => {
  const navigation = createNavigation([], bounds);
  const target = { x: 8.23, z: -7.91 };
  assert.deepEqual(navigation.findPath({ x: -8, z: 8 }, target), [target]);
  assert(navigation.lineClear({ x: -8, z: 8 }, target));
});

test("a rival detours around a building instead of walking through it", () => {
  const boxes = [{ minX: -1, maxX: 1, minZ: -5, maxZ: 5 }];
  const navigation = createNavigation(boxes, bounds, 2);
  const start = { x: -8, z: 0 },
    target = { x: 8, z: 0 };
  const path = navigation.findPath(start, target);
  assert(path.length >= 2, "A detour requires turning waypoints");
  assert.deepEqual(path.at(-1), target);
  assert(
    path.some((point) => Math.abs(point.z) > 5.4),
    "The actor goes around an end of the building",
  );
  assertWalkable(start, path, boxes);
});

test("touching obstacle corners cannot be squeezed through diagonally", () => {
  const area = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  const boxes = [
    { minX: -5, maxX: 0, minZ: 0, maxZ: 5 },
    { minX: 0, maxX: 5, minZ: -5, maxZ: 0 },
  ];
  const navigation = createNavigation(boxes, area, 1);
  assert.deepEqual(navigation.findPath({ x: -2, z: -2 }, { x: 2, z: 2 }), []);
  assert.equal(navigation.lineClear({ x: -2, z: -2 }, { x: 2, z: 2 }), false);
});

test("unreachable or blocked targets return no path", () => {
  const barrier = [{ minX: -1, maxX: 1, minZ: -12, maxZ: 12 }];
  const navigation = createNavigation(barrier, bounds, 2);
  assert.deepEqual(navigation.findPath({ x: -7, z: 0 }, { x: 7, z: 0 }), []);
  assert.deepEqual(navigation.findPath({ x: -7, z: 0 }, { x: 0, z: 0 }), []);
  assert.deepEqual(navigation.findPath({ x: -7, z: 0 }, { x: 15, z: 0 }), []);
});

test("off-grid endpoints connect safely without snapping through a nearby wall", () => {
  const boxes = [{ minX: -2, maxX: 1, minZ: -4, maxZ: 5 }];
  const navigation = createNavigation(boxes, bounds, 3);
  const start = { x: -2.5, z: 3.7 },
    target = { x: 1.5, z: -3.8 };
  const path = navigation.findPath(start, target);
  assert(path.length > 0);
  assert.deepEqual(path.at(-1), target);
  assertWalkable(start, path, boxes);
});

test("thin barriers are detected even when neither endpoint overlaps", () => {
  const navigation = createNavigation(
    [{ minX: 0.03, maxX: 0.04, minZ: -8, maxZ: 8 }],
    bounds,
  );
  assert.equal(navigation.lineClear({ x: -6, z: 0 }, { x: 6, z: 0 }), false);
});

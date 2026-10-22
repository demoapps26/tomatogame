import test from "node:test";
import assert from "node:assert/strict";
import { planFleetRoute } from "../src/fleet.js";

const roads = [-40, 0, 40].flatMap((coordinate) => [
  { x: coordinate, z: 0, width: 14, depth: 120 },
  { x: 0, z: coordinate, width: 120, depth: 14 },
]);
const world = {
  roads,
  bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  colliders: [{ minX: 9, maxX: 31, minZ: 9, maxZ: 31 }],
};

test("a fleet vehicle follows real roads around a city block with body clearance", () => {
  const start = { x: 10, z: -10 };
  const path = planFleetRoute(world, start, { x: 40, z: 37 });
  assert(path.length >= 3);
  assert.deepEqual(path[0], start);
  assert(Math.hypot(path.at(-1).x - 40, path.at(-1).z - 37) < 26);
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1],
      next = path[i];
    const count = Math.ceil(
      Math.hypot(next.x - previous.x, next.z - previous.z) * 10,
    );
    for (let step = 0; step <= count; step++) {
      const x = previous.x + ((next.x - previous.x) * step) / count;
      const z = previous.z + ((next.z - previous.z) * step) / count;
      for (const box of world.colliders)
        assert(
          !(
            x > box.minX - 2.5 &&
            x < box.maxX + 2.5 &&
            z > box.minZ - 2.5 &&
            z < box.maxZ + 2.5
          ),
        );
      if (i > 1)
        assert(
          roads.some(
            (road) =>
              Math.abs(x - road.x) < road.width / 2 &&
              Math.abs(z - road.z) < road.depth / 2,
          ),
        );
    }
  }
});

test("an enclosed or absent road destination keeps the fleet safely parked", () => {
  assert.deepEqual(
    planFleetRoute({ ...world, roads: [] }, { x: 0, z: 0 }, { x: 40, z: 40 }),
    [],
  );
  assert.deepEqual(
    planFleetRoute(world, { x: 20, z: 20 }, { x: 40, z: 40 }),
    [],
  );
  const sealed = {
    ...world,
    colliders: [{ minX: -6, maxX: 6, minZ: -60, maxZ: 60 }],
  };
  assert.deepEqual(
    planFleetRoute(sealed, { x: -40, z: -40 }, { x: 40, z: 40 }),
    [],
  );
});

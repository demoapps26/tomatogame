import test from "node:test";
import assert from "node:assert/strict";
import { restoreVehiclePlacements } from "../src/vehicle-restore.js";

const car = (x, z = 0, extra = {}) => ({
  position: { x, y: 0, z },
  yaw: 0,
  speed: 0,
  bounds: { width: 2, length: 4 },
  ...extra,
});
const point = (x, z = 0, yaw = 0, extra = {}) => ({ x, z, yaw, ...extra });
const coordinates = (placements) =>
  placements.map(
    (placement) =>
      placement && { x: placement.x, z: placement.z, yaw: placement.yaw },
  );
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};

test("restoring swapped parking spaces reserves both final positions before either move", () => {
  const cars = [
    car(-8, 0, { ownershipId: "tomato-1" }),
    car(8, 0, { ownershipId: "tomato-2" }),
  ];
  const saved = [
    point(8, 0, Math.PI, { ownershipId: "tomato-1" }),
    point(-8, 0, -Math.PI / 2, { ownershipId: "tomato-2" }),
  ];
  const placements = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(
    coordinates(placements),
    saved.map(({ x, z, yaw }) => ({ x, z, yaw })),
  );
  assert(placements.every((item) => item.source === "saved"));
  assert.deepEqual(
    cars.map((item) => item.position.x),
    [-8, 8],
  );
});

test("A can restore into B's original spawn when B was saved elsewhere", () => {
  const cars = [
    car(0, 0, { worldCarId: "street-a" }),
    car(10, 0, { worldCarId: "street-b" }),
    car(20, 0, { worldCarId: "street-c" }),
  ];
  const saved = [
    point(10, 0, 0.31, { worldCarId: "street-a" }),
    point(50, 30, -0.73, { worldCarId: "street-b" }),
    point(0, 0, 1.21, { worldCarId: "street-c" }),
  ];
  const placements = restoreVehiclePlacements(cars, saved, {
    isStaticClear: () => true,
    fallback: () => assert.fail("Every original save is valid"),
  });
  assert.deepEqual(coordinates(placements), coordinates(saved));
  assert(placements.every((item) => item.source === "saved"));
});

test("stable identities survive reordered cars and reordered save rows", () => {
  const cars = [
    car(0, 0, { worldCarId: "b" }),
    car(10, 0, { ownershipId: "owned-a" }),
    car(20, 0, { worldCarId: "a" }),
  ];
  const saved = [
    point(41, 20, 0.4, { worldCarId: "a" }),
    point(-18, -30, -1.2, { ownershipId: "owned-a" }),
    point(22, 27, 0.2, { worldCarId: "b" }),
    point(88, 22, 1.2, { ownershipId: "not-in-this-world" }),
  ];
  const placements = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(
    coordinates(placements),
    coordinates([saved[2], saved[1], saved[0]]),
  );
});

test("ownership wins globally over world IDs and another owner's record cannot be borrowed", () => {
  const cars = [
    car(0, 0, { worldCarId: "shared-world" }),
    car(10, 0, { ownershipId: "owned", worldCarId: "shared-world" }),
    car(20, 0, { ownershipId: "different-owner", worldCarId: "world-c" }),
  ];
  const saved = [
    point(60, 0, 0, { ownershipId: "owned", worldCarId: "shared-world" }),
    point(70, 0, 0, { worldCarId: "shared-world" }),
    point(80, 0, 0, { ownershipId: "another-owner", worldCarId: "world-c" }),
  ];
  const placements = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(
    placements.map((item) => item.x),
    [70, 60, 20],
  );
  assert.equal(placements[2].source, "spawn");
});

test("index compatibility applies only when both the car and saved row have no ID", () => {
  const cars = [
    car(0),
    car(10, 0, { worldCarId: "new-street-car" }),
    car(20),
    car(30, 0, { ownershipId: "new-owned-car" }),
    car(40),
  ];
  const saved = [
    point(50),
    point(60),
    point(70, 0, 0, { worldCarId: "removed-world-car" }),
    point(80, 0, 0, { ownershipId: "removed-owned-car" }),
    point(90, 0, 0, { ownershipId: null, worldCarId: null }),
  ];
  const placements = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(
    placements.map((item) => item.x),
    [50, 10, 20, 30, 90],
  );
  assert.deepEqual(
    placements.map((item) => item.source),
    ["saved", "spawn", "spawn", "spawn", "saved"],
  );
});

test("missing or rejected saves reuse vacated spawns without displacing valid destinations", () => {
  const cars = [car(0), car(10), car(20)];
  const saved = [point(10), point(Number.NaN), point(40)];
  const placements = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(
    placements.map((item) => item.x),
    [10, 0, 40],
  );
  assert.deepEqual(
    placements.map((item) => item.source),
    ["saved", "spawn", "saved"],
  );
});

test("conflicting imported destinations cannot overlap and resolve deterministically", () => {
  const cars = [car(0), car(10), car(20)];
  const saved = [point(50), point(50.5), point(70)];
  const a = restoreVehiclePlacements(cars, saved);
  const b = restoreVehiclePlacements(cars, saved);
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.map((item) => item.x),
    [50, 10, 70],
  );
  assert.equal(a[1].source, "spawn");
});

test("oriented footprints permit diagonal side-by-side bays while rejecting crossing cars", () => {
  const yaw = Math.PI / 4;
  const diagonal = restoreVehiclePlacements(
    [car(-30), car(30)],
    [point(0, 0, yaw), point(Math.cos(yaw) * 2.2, -Math.sin(yaw) * 2.2, yaw)],
  );
  assert(
    diagonal.every((item) => item.source === "saved"),
    "Overlapping AABBs must not discard two distinct diagonal parking spaces",
  );

  const crossing = restoreVehiclePlacements(
    [
      car(-30, 0, { bounds: { width: 2, length: 6 } }),
      car(30, 0, { bounds: { width: 2, length: 6 } }),
    ],
    [point(0), point(2.5, 2.5, Math.PI / 2)],
  );
  assert.equal(crossing[0].source, "saved");
  assert.equal(
    crossing[1].source,
    "spawn",
    "Long vehicles still collide when their centres are more than 3m apart",
  );
});

test("the actual destination model bounds are used, including mirrors and long vans", () => {
  const cars = [
    car(-30, 0, { bounds: { width: 2.66, length: 4.36 } }),
    car(30, 0, { bounds: { width: 2.38, length: 5.27 } }),
  ];
  assert.equal(
    restoreVehiclePlacements(cars, [point(0), point(2.5)])[1].source,
    "spawn",
  );
  assert.equal(
    restoreVehiclePlacements(cars, [point(0), point(0, 4.7)])[1].source,
    "spawn",
  );
  assert(
    restoreVehiclePlacements(cars, [point(0), point(0, 5)]).every(
      (item) => item.source === "saved",
    ),
  );
});

test("static clearance sees each target yaw and rejects solids independently of current cars", () => {
  const calls = [];
  const cars = [car(-20), car(20)];
  const placements = restoreVehiclePlacements(
    cars,
    [point(5, 4, Math.PI / 2), point(20)],
    {
      isStaticClear: (shape, target) => {
        calls.push({ shape, ...target });
        return target.x < 0 || (target.x === 5 && target.yaw === 0);
      },
      fallback: (shape, planned, canPlace) => {
        assert.equal(shape, cars[1]);
        assert.equal(planned.length, 1);
        assert.equal(planned[0].x, -20);
        assert.equal(canPlace(point(5, 4, Math.PI / 2)), false);
        assert.equal(canPlace(point(5, 4, 0)), true);
        return [point(5, 4, Math.PI / 2), point(-20), point(5, 4, 0)];
      },
    },
  );
  assert.deepEqual(coordinates(placements), [point(-20), point(5, 4, 0)]);
  assert.equal(placements[1].source, "fallback");
  assert(calls.some((item) => item.x === 5 && item.yaw === Math.PI / 2));
});

test("fallbacks see all successful saves and original spawns and are checked again", () => {
  const cars = [car(0), car(10), car(20), car(30)];
  const fallbacks = [];
  const saved = [point(10), point(40), point(30), point(60)];
  const placements = restoreVehiclePlacements(cars, saved, {
    isStaticClear: (shape, target) => target.x !== 40,
    fallback: (shape, planned, canPlace) => {
      fallbacks.push(planned);
      return point(10);
    },
  });
  assert.equal(
    fallbacks.length,
    0,
    "A vacated original spawn suffices before requesting a garage fallback",
  );
  assert.deepEqual(
    placements.map((item) => item.x),
    [10, 0, 30, 60],
  );

  const crowded = [car(0), car(0), car(0)];
  const result = restoreVehiclePlacements(
    crowded,
    [point(0), point(0), point(0)],
    {
      fallback: (shape, planned, canPlace) => {
        assert(Object.isFrozen(planned));
        assert(Object.isFrozen(planned[0]));
        assert(Object.isFrozen(planned[0].bounds));
        assert.equal(canPlace(point(0)), false);
        assert.equal(canPlace(point(10)), planned.length === 1);
        return [point(0), point(10), point(20)];
      },
    },
  );
  assert.deepEqual(
    result.map((item) => item.x),
    [0, 10, 20],
  );
  assert.deepEqual(
    result.map((item) => item.source),
    ["saved", "fallback", "fallback"],
  );
});

test("when no legal location exists, the planner returns null rather than overlapping a car", () => {
  const cars = [car(0), car(0)];
  const result = restoreVehiclePlacements(cars, [point(0), point(0)], {
    fallback: () => [
      point(0),
      point(Infinity),
      { x: 10, z: 0, yaw: Number.NaN },
    ],
  });
  assert.equal(result[0].source, "saved");
  assert.equal(result[1], null);
  assert.deepEqual(
    restoreVehiclePlacements(cars, [], {
      isStaticClear: () => false,
      fallback: () => point(50),
    }),
    [null, null],
  );
});

test("invalid imported coordinates and explicit invalid yaw fall back while absent yaw inherits", () => {
  const invalid = [
    null,
    {},
    point(Number.NaN),
    point(Infinity),
    point("50"),
    point(50, -Infinity),
    point(50, 0, Number.NaN),
    point(50, 0, Infinity),
    point(50, 0, null),
  ];
  for (const saved of invalid)
    assert.deepEqual(restoreVehiclePlacements([car(-10)], [saved]), [
      { x: -10, z: 0, yaw: 0, source: "spawn" },
    ]);
  const legacy = restoreVehiclePlacements(
    [car(-10, 0, { yaw: -0.37 })],
    [{ x: 50, z: 8 }],
  );
  assert.deepEqual(legacy, [{ x: 50, z: 8, yaw: -0.37, source: "saved" }]);
  const original = restoreVehiclePlacements(
    [car(0, 0, { yaw: Number.NaN, bounds: { width: Number.NaN, length: -2 } })],
    [],
  );
  assert.deepEqual(original, [{ x: 0, z: 0, yaw: 0, source: "spawn" }]);
  assert.deepEqual(restoreVehiclePlacements(null, []), []);
  assert.deepEqual(restoreVehiclePlacements([null, {}], null), [null, null]);
});

test("the plan and callback snapshots do not mutate or retain input coordinates and bounds", () => {
  const cars = freeze([car(0), car(0)]);
  const saved = freeze([point(0), point(0)]);
  const original = JSON.stringify({ cars, saved });
  let snapshot;
  const placements = restoreVehiclePlacements(cars, saved, {
    fallback: (shape, planned) => {
      snapshot = planned;
      return point(10);
    },
  });
  assert.equal(JSON.stringify({ cars, saved }), original);
  assert.notEqual(snapshot[0].bounds, cars[0].bounds);
  placements[0].x = 99;
  assert.equal(saved[0].x, 0);
  assert.equal(snapshot[0].x, 0);
  assert.equal(cars[0].position.x, 0);
  assert.equal(snapshot[0].index, 0);
});

test("clearance never shrinks physical model bounds and may be configured to allow touching", () => {
  const cars = [car(-20), car(20)];
  assert.equal(
    restoreVehiclePlacements(cars, [point(0), point(2.04)])[1].source,
    "spawn",
  );
  assert.equal(
    restoreVehiclePlacements(cars, [point(0), point(2)], { clearance: 0 })[1]
      .source,
    "saved",
  );
  assert.equal(
    restoreVehiclePlacements(cars, [point(0), point(1.99)], {
      clearance: -100,
    })[1].source,
    "spawn",
  );
});

test("many mixed corrupted imports produce deterministic, finite, nonoverlapping final cars", () => {
  let seed = 0x327ab4;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const rectangle = (placement, shape) => {
    const rotated = Math.abs(Math.sin(placement.yaw)) > 0.5;
    const width = rotated ? shape.bounds.length : shape.bounds.width;
    const length = rotated ? shape.bounds.width : shape.bounds.length;
    return {
      minX: placement.x - width / 2,
      maxX: placement.x + width / 2,
      minZ: placement.z - length / 2,
      maxZ: placement.z + length / 2,
    };
  };
  for (let scenario = 0; scenario < 120; scenario++) {
    const cars = Array.from({ length: 12 }, (_, index) =>
      car(index * 8, 0, {
        worldCarId: `car-${index}`,
        bounds: { width: 1.7 + random() * 1.3, length: 3 + random() * 4 },
      }),
    );
    const saved = cars.map((shape, index) =>
      point(
        Math.floor(random() * 5) * 8,
        12 + Math.floor(random() * 3) * 8,
        random() > 0.5 ? 0 : Math.PI / 2,
        {
          worldCarId: shape.worldCarId,
        },
      ),
    );
    saved[scenario % saved.length].x = Number.NaN;
    const options = {
      isStaticClear: (shape, target) => !(target.x === 16 && target.z >= 12),
      fallback: () =>
        Array.from({ length: 12 }, (_, index) => point(index * 8, -12)),
    };
    const placements = restoreVehiclePlacements(cars, saved, options);
    assert.deepEqual(
      placements,
      restoreVehiclePlacements(cars, saved, options),
    );
    placements.forEach((placement, index) => {
      assert(
        placement,
        `Car ${index} should fit in the available fallback area`,
      );
      assert([placement.x, placement.z, placement.yaw].every(Number.isFinite));
      const a = rectangle(placement, cars[index]);
      for (let j = 0; j < index; j++) {
        const b = rectangle(placements[j], cars[j]);
        assert(
          a.maxX <= b.minX ||
            a.minX >= b.maxX ||
            a.maxZ <= b.minZ ||
            a.minZ >= b.maxZ,
          `Cars ${index}/${j} overlap in scenario ${scenario}`,
        );
      }
    });
  }
});

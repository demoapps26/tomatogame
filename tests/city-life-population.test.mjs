import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cityLifeCounts, createCityLife } from "../src/life.js";

function fixture(name = "world-cidade") {
  const group = new THREE.Group();
  group.name = name;
  return {
    group,
    bounds: { minX: -1600, maxX: 1600, minZ: -1600, maxZ: 1600 },
    colliders: [],
    spawn: new THREE.Vector3(0, 0, 86),
    trafficRoutes: [
      [
        { x: -189, z: -189 },
        { x: 189, z: -189 },
        { x: 189, z: 189 },
        { x: -189, z: 189 },
      ],
      [
        { x: -93, z: -93 },
        { x: 93, z: -93 },
        { x: 93, z: 93 },
        { x: -93, z: 93 },
      ],
    ],
    pedestrianRoutes: [
      [
        { x: 12, z: 87 },
        { x: 83, z: 87 },
        { x: 83, z: 10 },
        { x: 12, z: 10 },
      ],
      [
        { x: 400, z: 400 },
        { x: 1400, z: 400 },
        { x: 1400, z: 1400 },
        { x: 400, z: 1400 },
      ],
    ],
    groundHeightAt: (x) => (x > 300 ? 0.175 : 0.14),
  };
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test("actor budgets expand only for the actual Santa Tomata world group", () => {
  const old = { low: [3, 5], medium: [6, 10], high: [10, 20] };
  const city = { low: [3, 6], medium: [8, 14], high: [12, 28] };
  for (const quality of ["low", "medium", "high"]) {
    assert.deepEqual(cityLifeCounts(fixture(), quality), city[quality]);
    for (const world of [
      undefined,
      {},
      { mapId: "cidade" },
      fixture("world-estufas"),
      fixture("world-porto"),
    ])
      assert.deepEqual(cityLifeCounts(world, quality), old[quality]);
  }
  assert.deepEqual(cityLifeCounts(), old.medium);
  assert.deepEqual(cityLifeCounts(fixture(), "unknown"), city.medium);
  const mutable = cityLifeCounts(fixture(), "high");
  mutable[0] = 500;
  assert.deepEqual(cityLifeCounts(fixture(), "high"), city.high);
});

for (const quality of ["low", "medium", "high"]) {
  test(`${quality} city starts with its fixed budget and nearby pedestrians on existing routes`, () => {
    const scene = new THREE.Scene(),
      world = fixture();
    const snapshot = JSON.stringify({
      routes: world.pedestrianRoutes,
      roads: world.trafficRoutes,
      colliders: world.colliders,
    });
    const life = createCityLife(scene, world, quality);
    try {
      const counts = cityLifeCounts(world, quality);
      assert.deepEqual([life.vehicles.length, life.pedestrians.length], counts);
      const nearby = { low: 2, medium: 5, high: 8 }[quality];
      for (const person of life.pedestrians.slice(0, nearby)) {
        const proximity = distance(person.position, world.spawn);
        assert.ok(
          proximity >= 6 && proximity <= 90,
          `Pedestrian starts ${proximity}m from the player`,
        );
        assert.equal(
          person.position.y,
          world.groundHeightAt(person.position.x, person.position.z),
        );
      }
      life.update(0.1, world.spawn);
      assert.ok(
        life.pedestrians.filter(
          (person) => distance(person.position, world.spawn) < 100,
        ).length >= nearby,
      );
      assert.equal(
        JSON.stringify({
          routes: world.pedestrianRoutes,
          roads: world.trafficRoutes,
          colliders: world.colliders,
        }),
        snapshot,
      );
    } finally {
      life.dispose();
    }
    assert.equal(scene.children.length, 0);
    assert.deepEqual([life.vehicles.length, life.pedestrians.length], [0, 0]);
    life.dispose();
  });
}

test("the city reuses only culled distant pedestrians and restores the nearby high population gradually", () => {
  const scene = new THREE.Scene(),
    world = fixture();
  const life = createCityLife(scene, world, "high");
  try {
    const candidates = [];
    for (let offset = 150; offset < 900; offset += 75)
      candidates.push(
        { x: 400 + offset, z: 400 },
        { x: 1400, z: 400 + offset },
        { x: 1400 - offset, z: 1400 },
        { x: 400, z: 1400 - offset },
      );
    const destination = candidates.find((candidate) =>
      life.pedestrians.every(
        (person) => distance(person.position, candidate) > 170,
      ),
    );
    assert.ok(
      destination,
      "A distant district on an existing walk route is available",
    );
    const identities = [...life.pedestrians];
    let relocated = 0,
      previousRelocationStep = -100;
    for (let step = 0; step < 110; step++) {
      const before = life.pedestrians.map((person) => ({
        position: person.position.clone(),
        visible: person.visible,
      }));
      life.update(0.15, destination);
      const moved = life.pedestrians.flatMap((person, index) =>
        distance(person.position, before[index].position) > 5 ? [index] : [],
      );
      assert.ok(
        moved.length <= 1,
        "Only one distant pedestrian is reused per population check",
      );
      for (const index of moved) {
        assert.equal(
          before[index].visible,
          false,
          "Visible pedestrians never teleport",
        );
        assert.ok(distance(before[index].position, destination) > 150);
        assert.ok(
          distance(life.pedestrians[index].position, destination) <= 100,
        );
        assert.ok(
          step - previousRelocationStep >= 13,
          "Population changes remain separated by the existing two-second interval",
        );
        previousRelocationStep = step;
        relocated++;
      }
      for (const person of life.pedestrians) {
        assert.ok(person.position.toArray().every(Number.isFinite));
        assert.equal(
          person.position.y,
          world.groundHeightAt(person.position.x, person.position.z),
        );
      }
    }
    assert.ok(relocated >= 6);
    assert.ok(
      life.pedestrians.filter(
        (person) => distance(person.position, destination) < 100,
      ).length >= 6,
    );
    assert.deepEqual(
      life.pedestrians,
      identities,
      "The fixed actor pool is reused",
    );
  } finally {
    life.dispose();
  }
});

test("farm and harbour retain the previous medium actor budget and first two nearby pedestrians", () => {
  for (const map of ["world-estufas", "world-porto"]) {
    const scene = new THREE.Scene(),
      world = fixture(map);
    const life = createCityLife(scene, world);
    try {
      assert.deepEqual(
        [life.vehicles.length, life.pedestrians.length],
        [6, 10],
      );
      assert.ok(
        life.pedestrians
          .slice(0, 2)
          .every(
            (person) =>
              distance(person.position, world.spawn) >= 6 &&
              distance(person.position, world.spawn) <= 90,
          ),
      );
    } finally {
      life.dispose();
    }
  }
});

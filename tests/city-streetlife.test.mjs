import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createCityStreetLife,
  planCityStreetLife,
} from "../src/city-streetlife.js";
import { createPassengerVehicle } from "../src/passenger-vehicles.js";

function fixture() {
  return {
    mapId: "cidade",
    bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    roads: [
      { x: 0, z: 0, width: 20, depth: 1200 },
      { x: 0, z: 0, width: 1200, depth: 20 },
      { x: -96, z: 0, width: 14, depth: 1200 },
      { x: 96, z: 0, width: 14, depth: 1200 },
      { x: 0, z: 96, width: 1200, depth: 14 },
    ],
    colliders: [],
    trafficRoutes: [
      [
        { x: -189, z: -189 },
        { x: 189, z: -189 },
        { x: 189, z: 189 },
        { x: -189, z: 189 },
      ],
      [
        { x: 3, z: 3 },
        { x: 285, z: 3 },
        { x: 285, z: 285 },
        { x: 3, z: 285 },
      ],
    ],
    pedestrianRoutes: [
      [
        { x: -10, z: -84 },
        { x: -10, z: -11 },
      ],
    ],
    interactionPoints: [{ x: 0, z: 150 }],
    fleetSpawns: [{ x: 28, z: 106 }],
    spawn: { x: 0, z: 86 },
    groundHeightAt: () => 0.175,
  };
}
function overlaps(a, b) {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}
function resources(group) {
  const geometry = new Set(),
    material = new Set(),
    texture = new Set();
  group.traverse((o) => {
    if (o.geometry) geometry.add(o.geometry);
    for (const m of o.material ? [o.material].flat() : []) {
      material.add(m);
      for (const value of Object.values(m))
        if (value?.isTexture) texture.add(value);
    }
  });
  return { geometry, material, texture };
}
function disposeActor(actor) {
  for (const set of Object.values(resources(actor.group)))
    for (const value of set) value.dispose();
}

test("parking is deterministic across graphics quality and leaves protected approaches and narrow traffic lanes free", () => {
  const world = fixture(),
    snapshot = JSON.stringify(world),
    scene = new THREE.Scene();
  const modes = ["low", "medium", "high"].map((mode) =>
    createCityStreetLife(scene, world, mode),
  );
  try {
    const baseline = modes[0].parkedVehicleSpawns;
    assert.equal(baseline.length, 12);
    for (const mode of modes)
      assert.deepEqual(mode.parkedVehicleSpawns, baseline);
    assert.equal(new Set(baseline.map((p) => p.id)).size, 12);
    for (const p of baseline) {
      assert.ok(
        Math.abs(p.x) === 8.75 || Math.abs(p.z) === 8.75,
        "A car intruded into a narrow road",
      );
      assert.ok(
        !overlaps(p.footprint, { minX: -22, maxX: 83, minZ: 26, maxZ: 132 }),
        "HQ approach obstructed",
      );
      assert.ok(
        !overlaps(p.footprint, { minX: -8, maxX: 8, minZ: 142, maxZ: 158 }),
        "Interaction approach obstructed",
      );
    }
    assert.equal(
      JSON.stringify(world),
      snapshot,
      "Street life mutated world collision or route ownership",
    );
  } finally {
    modes.forEach((m) => m.dispose());
  }
});

test("placement rejects new solid obstacles and does not consume global procedural randomness", () => {
  const world = fixture(),
    first = planCityStreetLife(world),
    blocked = first.parking[0];
  world.colliders.push({ ...blocked.footprint });
  const oldRandom = Math.random;
  let plan;
  try {
    Math.random = () => {
      throw Error("global RNG was consumed");
    };
    plan = planCityStreetLife(world);
  } finally {
    Math.random = oldRandom;
  }
  assert.equal(plan.parking.length, 12);
  assert.ok(!plan.parking.some((p) => p.id === blocked.id));
  for (const p of [...plan.parking, ...plan.shelters, ...plan.bicycles])
    assert.ok(!overlaps(p.footprint, blocked.footprint));
});

test("bicycles and bus shelters are finite real geometry inside their reserved footprints, with owned disposal", () => {
  const scene = new THREE.Scene(),
    life = createCityStreetLife(scene, fixture(), "medium");
  assert.equal(life.stats.busShelters, 2);
  assert.equal(life.stats.bicycleStands, 3);
  assert.equal(life.stats.bicycles, 6);
  assert.ok(
    life.stats.staticTriangles > 10000 && life.stats.staticTriangles < 25000,
  );
  for (const item of life.placements) {
    const object = life.group.getObjectByName(item.id);
    assert.ok(object);
    object.traverse((o) => {
      if (!o.geometry) return;
      for (const attribute of Object.values(o.geometry.attributes))
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
    });
    if (item.kind === "parking") continue;
    const b = new THREE.Box3().setFromObject(object, true),
      f = item.footprint;
    assert.ok(
      b.min.x >= f.minX - 0.0001 &&
        b.max.x <= f.maxX + 0.0001 &&
        b.min.z >= f.minZ - 0.0001 &&
        b.max.z <= f.maxZ + 0.0001,
      `${item.id} left its reserved pavement`,
    );
    assert.ok(b.min.y >= 0.17, "A bicycle sank into the pavement");
  }
  const owned = resources(life.group),
    counts = new Map();
  for (const set of Object.values(owned))
    for (const value of set) {
      counts.set(value, 0);
      value.addEventListener("dispose", () =>
        counts.set(value, counts.get(value) + 1),
      );
    }
  life.update(0, { x: 10000, z: 10000 });
  assert.equal(life.stats.visibleGroups, 0);
  life.update(0, { x: 0, z: 86 });
  assert.ok(life.stats.visibleGroups > 0);
  life.dispose();
  life.dispose();
  assert.ok(!scene.children.includes(life.group));
  for (const count of counts.values()) assert.equal(count, 1);
});

test("parked model dimensions conservatively contain the existing licensed/procedural vehicle factories", () => {
  for (const modelId of new Set(
    planCityStreetLife(fixture()).parking.map((p) => p.modelId),
  )) {
    const actor = createPassengerVehicle(modelId),
      b = new THREE.Box3().setFromObject(actor.group, true),
      s = b.getSize(new THREE.Vector3());
    try {
      assert.ok(s.x <= actor.bounds.width + 0.0001);
      assert.ok(s.z <= actor.bounds.length + 0.0001);
    } finally {
      disposeActor(actor);
    }
  }
});

test("street life is absent from the greenhouse and port territories", () => {
  for (const id of ["estufas", "porto"]) {
    const scene = new THREE.Scene(),
      world = { ...fixture(), mapId: id },
      life = createCityStreetLife(scene, world, "high");
    assert.deepEqual(life.parkedVehicleSpawns, []);
    assert.deepEqual(life.colliders, []);
    assert.equal(scene.children.length, 0);
    life.update(1, { x: 0, z: 0 });
    life.dispose();
  }
});

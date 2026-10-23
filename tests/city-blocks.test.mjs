import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { createNavigation } from "../src/navigation.js";
import {
  createCityBlocks,
  planCityBlocks,
  LEGACY_CITY_ENVELOPES,
} from "../src/city-blocks.js";

const originalDocument = globalThis.document;
const canvasDocument = () => ({
  createElement() {
    const canvas = { width: 1, height: 1 };
    const context = new Proxy(
      {
        canvas,
        createImageData: (width, height) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        getImageData: (x, y, width, height) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        measureText: (text) => ({ width: String(text).length * 8 }),
      },
      { get: (target, key) => (key in target ? target[key] : (...args) => {}) },
    );
    canvas.getContext = () => context;
    return canvas;
  },
});
let world;
before(() => {
  globalThis.document = canvasDocument();
  world = buildWorld(new THREE.Scene(), "cidade", "medium");
});
after(() => {
  world?.dispose();
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

function boundsOfInstance(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const e = matrix.elements,
    array = mesh.geometry.attributes.position.array;
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  // A rotated bounding box would overestimate the oblique authored Bistro
  // meshes. Inspect their real transformed vertices, including balconies.
  for (let i = 0; i < array.length; i += 3) {
    const x =
      e[0] * array[i] + e[4] * array[i + 1] + e[8] * array[i + 2] + e[12];
    const z =
      e[2] * array[i] + e[6] * array[i + 1] + e[10] * array[i + 2] + e[14];
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  return bounds;
}
const contained = (a, b) =>
  a.minX >= b.minX - 1e-4 &&
  a.maxX <= b.maxX + 1e-4 &&
  a.minZ >= b.minZ - 1e-4 &&
  a.maxZ <= b.maxZ + 1e-4;
const close = (actual, expected, message = "") =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    message || `${actual} does not match ${expected}`,
  );
const blocked = (point, boxes, radius = 0.4) =>
  boxes.some(
    (box) =>
      point.x + radius > box.minX &&
      point.x - radius < box.maxX &&
      point.z + radius > box.minZ &&
      point.z - radius < box.maxZ,
  );

test("the real central lots contain twenty adjoining facades without altering their historical solid footprints", () => {
  const before = JSON.stringify(world.buildingSites),
    plan = planCityBlocks(world.buildingSites);
  assert.equal(plan.lots.length, 12);
  assert.equal(plan.buildings.length, 20);
  assert.equal(
    plan.buildings.filter((building) => !building.native).length,
    16,
  );
  assert.equal(plan.pavements.length, 3);
  for (const [id, envelope] of Object.entries(LEGACY_CITY_ENVELOPES)) {
    const lot = plan.lots.find((item) => item.id === id);
    assert.equal(lot.width, envelope.width);
    assert.equal(lot.depth, envelope.depth);
  }
  for (const lot of plan.lots.filter((item) => !item.legacy)) {
    const row = plan.buildings.filter((building) => building.lotId === lot.id);
    assert.equal(row.length, 2);
    assert.equal(
      row[0].yaw,
      row[1].yaw,
      "two fronts face the same real street",
    );
    const along = row[0].faceX ? "z" : "x",
      span = row[0].faceX ? "depth" : "width";
    assert.ok(
      Math.abs(Math.abs(row[0][along] - row[1][along]) - row[0][span]) < 1e-7,
      "fronts meet along the party wall rather than standing as isolated models",
    );
  }
  assert.equal(JSON.stringify(world.buildingSites), before);
});

test("every visible and proxy vertex stays within an existing solid in all three quality profiles", () => {
  for (const quality of ["low", "medium", "high"]) {
    const detail = createCityBlocks({ sites: world.buildingSites, quality });
    try {
      let inspected = 0;
      for (const mesh of detail.group.children) {
        assert.ok(
          mesh.isInstancedMesh,
          "facades share draw calls rather than cloning complete groups",
        );
        if (mesh.name.endsWith("-ground")) continue;
        for (let index = 0; index < mesh.count; index++) {
          const bounds = boundsOfInstance(mesh, index);
          assert.ok(
            detail.plan.lots.some((lot) => contained(bounds, lot.envelope)),
            `${mesh.name} instance ${index} escaped its old lot`,
          );
          inspected++;
        }
      }
      assert.ok(inspected > 15000);
      assert.ok(
        detail.stats.triangles < (quality === "low" ? 250000 : 1500000),
      );
      assert.ok(
        detail.stats.visibleDrawCalls <= (quality === "low" ? 45 : 105),
      );
      assert.equal(detail.stats.detailedBuildings, quality === "low" ? 0 : 20);
      detail.update(1, { x: 700, z: 700 });
      assert.equal(detail.stats.visibleDrawCalls, 0);
      assert.equal(detail.stats.visibleTriangles, 0);
    } finally {
      detail.dispose();
    }
  }
});

test("quality changes keep navigation collisions identical, including the former low-detail Bistro lots", () => {
  const colliders = JSON.stringify(world.colliders),
    roads = JSON.stringify(world.roads);
  const interactions = JSON.stringify(world.interactionPoints);
  for (const quality of ["low", "high"]) {
    const other = buildWorld(new THREE.Scene(), "cidade", quality);
    try {
      assert.equal(JSON.stringify(other.colliders), colliders);
      assert.equal(JSON.stringify(other.roads), roads);
      assert.equal(JSON.stringify(other.interactionPoints), interactions);
      assert.equal(other.cityBlocksStats.buildings, 20);
    } finally {
      other.dispose();
    }
  }
});

test("courtyard paving is actual walking support while roads, crossings and the shop retain their true heights", () => {
  for (const [x, z] of [
    [-48, 48],
    [48, -48],
    [-144, 144],
  ]) {
    assert.equal(blocked({ x, z }, world.colliders), false);
    close(world.groundHeightAt(x, z), 0.16);
    assert.equal(
      world.interiorZones.some(
        (zone) =>
          x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ,
      ),
      false,
      "an outdoor court must not switch to the indoor camera",
    );
  }
  close(
    world.groundHeightAt(-85.42, 48),
    0.16,
    "flush paving border matches its real top face",
  );
  close(world.groundHeightAt(0, 86), 0.035);
  close(world.groundHeightAt(11.5, 96), 0.035);
  close(world.groundHeightAt(28, 65), 0.07);
  close(world.groundHeightAt(65, 41), 0.14);
});

test("the complete shop shell and new furnishings preserve a carrying player's entrance and every work station", () => {
  const navigation = createNavigation(
    world.colliders,
    { minX: 7, maxX: 49, minZ: 50, maxZ: 88 },
    0.5,
  );
  let previous = { x: 28, z: 83 };
  for (const target of [
    { x: 21, z: 74 },
    { x: 33, z: 63 },
    { x: 40, z: 73 },
    { x: 28, z: 65 },
    { x: 28, z: 83 },
  ]) {
    assert.equal(blocked(target, world.colliders), false);
    const path = navigation.findPath(previous, target);
    assert.ok(path.length, `No full-world route to ${JSON.stringify(target)}`);
    for (const point of path)
      assert.equal(blocked(point, world.colliders), false);
    previous = target;
  }
  const before = JSON.stringify(world.colliders);
  world.updateCompany({
    land: 3,
    upgrades: { greenhouse: 1, coldstore: 1, solar: 1 },
  });
  for (const point of [
    { x: 21, z: 74 },
    { x: 33, z: 63 },
    { x: 40, z: 73 },
  ])
    assert.equal(blocked(point, world.colliders), false);
  world.updateCompany({ land: 1, upgrades: {} });
  assert.equal(
    JSON.stringify(world.colliders),
    before,
    "upgrades retain HQ furniture rather than silently dropping its collisions",
  );
});

test("independent block lifetimes free instance buffers and never dispose materials borrowed from the world", () => {
  const material = new THREE.MeshStandardMaterial();
  let sharedDisposals = 0;
  material.addEventListener("dispose", () => sharedDisposals++);
  const detail = createCityBlocks({
    sites: world.buildingSites,
    quality: "low",
    materials: Object.fromEntries(
      ["plaster", "concrete", "trim", "roof", "window", "dark", "stone"].map(
        (key) => [key, material],
      ),
    ),
  });
  let instanceDisposals = 0;
  const count = detail.group.children.length;
  detail.group.children.forEach((mesh) =>
    mesh.addEventListener("dispose", () => instanceDisposals++),
  );
  detail.dispose();
  detail.dispose();
  assert.equal(instanceDisposals, count);
  assert.equal(sharedDisposals, 0);
  assert.equal(detail.group.children.length, 0);
  assert.equal(world.group.parent !== null, true);
  material.dispose();
});

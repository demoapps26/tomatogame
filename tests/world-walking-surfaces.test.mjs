import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";

// World construction uses procedural labels/textures, but height queries only
// need real geometry and transforms, so these tests do not require WebGL.
const originalDocument = globalThis.document;
function canvasDocument() {
  return {
    createElement() {
      const canvas = { width: 1, height: 1 };
      const context = new Proxy(
        {
          canvas,
          createImageData: (width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          }),
          getImageData: (x, y, width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
          }),
          measureText: (text) => ({ width: String(text).length * 8 }),
        },
        {
          get: (target, key) => (key in target ? target[key] : (...args) => {}),
        },
      );
      canvas.getContext = () => context;
      return canvas;
    },
  };
}
const close = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `${actual} did not match actual floor ${expected}`,
  );
let scene, world;
before(() => {
  globalThis.document = canvasDocument();
  scene = new THREE.Scene();
  world = buildWorld(scene, "cidade", "medium");
});
after(() => {
  world?.dispose();
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

test("feet use the real greenhouse, shop, asphalt and depot floor heights", () => {
  close(world.groundHeightAt(65, 41), 0.14);
  close(world.groundHeightAt(28, 65), 0.07);
  close(world.groundHeightAt(0, 86), 0.035);
  close(world.groundHeightAt(53, 108), 0.09);
  close(world.groundHeightAt(53, 106), 0.175);
  close(world.groundHeightAt(718, 700), -0.035);
  assert.ok(
    world.stats.walkingSurfaceTiles > 1000,
    "The actual city tiles were registered",
  );
  assert.ok(
    world.stats.walkingSurfaceGroups <= 200,
    "Shared strips keep the per-actor query bounded",
  );
});

test("curbs and perpendicular pavements follow their actual transformed planes", () => {
  close(world.groundHeightAt(9.7, 48), 0.035);
  close(world.groundHeightAt(10.15, 48), 0.24);
  close(world.groundHeightAt(11.5, 48), 0.17);
  close(world.groundHeightAt(48, 10.15), 0.24);
  close(world.groundHeightAt(48, 11.5), 0.175);
  // An intersection is still the asphalt level, not a filled pavement strip.
  close(world.groundHeightAt(11.5, 96), 0.035);
});

test("raised growing beds, counter tops, roofs and water never become walking support", () => {
  close(world.groundHeightAt(58, 41), 0.14);
  close(world.groundHeightAt(28, 60.5), 0.07);
  close(world.groundHeightAt(28, 66), 0.07);
  close(world.groundHeightAt(0, 1200), -0.035);
});

test("purchased greenhouse flooring follows the same company visibility phases", () => {
  const originalColliders = JSON.stringify(world.colliders);
  close(world.groundHeightAt(24, 144), 0.055);
  try {
    world.updateCompany({ land: 2 });
    close(world.groundHeightAt(24, 144), 0.14);
    close(world.groundHeightAt(65, 41), 0.14);
  } finally {
    world.updateCompany({ land: 1, upgrades: {} });
  }
  close(world.groundHeightAt(24, 144), 0.055);
  assert.equal(JSON.stringify(world.colliders), originalColliders);
});

test("floors appended by estates are read dynamically and use the highest real support", () => {
  const length = world.interiorZones.length;
  try {
    world.interiorZones.push({
      minX: 717,
      maxX: 719,
      minZ: 699,
      maxZ: 701,
      floorHeight: 0.08,
    });
    close(world.groundHeightAt(718, 700), 0.08);
    world.interiorZones.push({
      minX: 717,
      maxX: 719,
      minZ: 699,
      maxZ: 701,
      floorHeight: 0.075,
    });
    close(world.groundHeightAt(718, 700), 0.08);
    world.interiorZones.push({
      minX: 717,
      maxX: 719,
      minZ: 699,
      maxZ: 701,
      floorHeight: 0.19,
      companyPhase: 1,
    });
    close(world.groundHeightAt(718, 700), 0.08);
    world.updateCompany({ land: 2 });
    close(world.groundHeightAt(718, 700), 0.19);
  } finally {
    world.interiorZones.splice(length);
    world.updateCompany({ land: 1, upgrades: {} });
  }
  close(world.groundHeightAt(718, 700), -0.035);
});

test("querying support is finite and never changes navigation obstacles or roads", () => {
  const colliders = JSON.stringify(world.colliders),
    roads = JSON.stringify(world.roads);
  close(world.groundHeightAt(NaN, 0), -0.035);
  close(world.groundHeightAt(0, Infinity), -0.035);
  for (let index = 0; index < 500; index++)
    assert.ok(
      Number.isFinite(
        world.groundHeightAt(
          -720 + ((index * 79) % 1440),
          -720 + ((index * 149) % 1440),
        ),
      ),
    );
  assert.equal(JSON.stringify(world.colliders), colliders);
  assert.equal(JSON.stringify(world.roads), roads);
});

test("the rural and harbour maps expose their own real floors too", () => {
  for (const id of ["estufas", "porto"]) {
    const otherScene = new THREE.Scene(),
      other = buildWorld(otherScene, id, "low");
    try {
      close(other.groundHeightAt(65, 41), 0.14);
      close(other.groundHeightAt(28, 65), 0.07);
      close(other.groundHeightAt(0, 86), 0.035);
      assert.ok(other.stats.walkingSurfaceGroups < 200);
    } finally {
      other.dispose();
    }
    assert.equal(otherScene.children.length, 0);
  }
});

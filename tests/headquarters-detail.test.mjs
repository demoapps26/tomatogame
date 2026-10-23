import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHeadquartersDetail } from "../src/headquarters-detail.js";
import { createNavigation } from "../src/navigation.js";

const bounds = { minX: 7, maxX: 49, minZ: 50, maxZ: 87 };
const box = (x, z, width, depth) => ({
  minX: x - width / 2,
  maxX: x + width / 2,
  minZ: z - depth / 2,
  maxZ: z + depth / 2,
});
// Existing shop obstacles are the fixture surrounding the new fitting, not a
// copy of the detail generator. The full world retains ownership of this shell.
const existing = [
  box(13.5, 66, 0.3, 24),
  box(42.5, 66, 0.3, 24),
  box(28, 54, 29, 0.3),
  box(19, 78, 10.8, 0.3),
  box(37, 78, 10.8, 0.3),
  box(28, 60.5, 12.25, 1.65),
  box(28, 55.1, 15.1, 1.5),
  box(17, 67, 3.3, 9),
  box(39, 67, 3.3, 9),
  ...[16, 19, 37, 40].map((x) => box(x, 57, 1, 1)),
];
const overlaps = (x, z, collider, radius = 0.4) =>
  x >= collider.minX - radius &&
  x <= collider.maxX + radius &&
  z >= collider.minZ - radius &&
  z <= collider.maxZ + radius;

function assertBodyClear(path, obstacles) {
  for (let leg = 1; leg < path.length; leg++) {
    const a = path[leg - 1],
      b = path[leg];
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) * 25));
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      assert(
        !obstacles.some((obstacle) => overlaps(x, z, obstacle)),
        `Actor blocked at ${x}, ${z}`,
      );
    }
  }
}

test("a carrying player can enter, visit every physical station and reach the shopkeeper and refrigerator", () => {
  for (const quality of ["low", "medium", "high"]) {
    const detail = createHeadquartersDetail({ quality });
    try {
      const obstacles = [...existing, ...detail.colliders];
      const navigation = createNavigation(obstacles, bounds, 0.5);
      assert.deepEqual(
        detail.interactionPoints.map(({ id, x, z }) => ({ id, x, z })),
        [
          { id: "packing-boxes", x: 21, z: 74 },
          { id: "packing-weigh", x: 33, z: 63 },
          { id: "packing-seal", x: 40, z: 73 },
        ],
      );
      let start = { x: 28, z: 83 };
      const destinations = [
        ...detail.interactionPoints,
        { x: 28, z: 65 },
        { x: 28, z: 58.6 },
        { x: 16.3, z: 59.3 },
        { x: 40, z: 58.3 },
        { x: 28, z: 83 },
      ];
      for (const target of destinations) {
        assert(
          !obstacles.some((obstacle) => overlaps(target.x, target.z, obstacle)),
        );
        const route = navigation.findPath(start, target);
        assert(
          route.length,
          `${quality}: physical destination ${target.id || JSON.stringify(target)} is reachable`,
        );
        assertBodyClear([start, ...route], obstacles);
        start = target;
      }
      for (const x of [26, 28, 30])
        assert(
          navigation.lineClear({ x, z: 82 }, { x, z: 74 }),
          "Original open doorway remains open",
        );
      assert.deepEqual(
        detail.floorSurfaces,
        [],
        "Fittings do not replace the original .07m walking floor",
      );
    } finally {
      detail.dispose();
    }
  }
});

test("the open entrance is also visually empty below head height", () => {
  const detail = createHeadquartersDetail();
  const instance = new THREE.Matrix4(),
    bounds = new THREE.Box3();
  try {
    detail.group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const testBox = (matrix) => {
        bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
        if (bounds.max.y < 0.15 || bounds.min.y > 2.4) return;
        const crossesDoor =
          bounds.min.x < 30.5 &&
          bounds.max.x > 25.5 &&
          bounds.min.z < 80.8 &&
          bounds.max.z > 77.6;
        assert.equal(
          crossesDoor,
          false,
          `${mesh.name} visually fills the doorway`,
        );
      };
      if (mesh.isInstancedMesh)
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, instance);
          testBox(
            new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, instance),
          );
        }
      else testBox(mesh.matrixWorld);
    });
  } finally {
    detail.dispose();
  }
});

test("quality settings keep stocked close-up fittings within a bounded static batch budget", () => {
  let previousProducts = 0;
  for (const quality of ["low", "medium", "high"]) {
    const detail = createHeadquartersDetail({ quality });
    try {
      assert(detail.stats.packagedProducts >= 100);
      assert(detail.stats.packagedProducts >= previousProducts);
      previousProducts = detail.stats.packagedProducts;
      assert(detail.stats.cartons >= 20 && detail.stats.crates >= 5);
      assert(detail.stats.batches <= 42);
      assert(detail.stats.triangles < (quality === "low" ? 24000 : 75000));
      let lights = 0,
        meshes = 0;
      detail.group.traverse((object) => {
        if (object.isLight) lights++;
        if (!object.isMesh) return;
        meshes++;
        assert(
          object.material.isMeshStandardMaterial,
          "World fittings use lit PBR materials",
        );
        assert(
          object.isInstancedMesh ||
            object.name.endsWith("printed-labels") ||
            object.userData.role === "packing-scale-display",
        );
      });
      assert.equal(
        lights,
        0,
        "The world's existing ceiling lights supply the illumination",
      );
      assert.equal(meshes, detail.stats.batches);
      detail.update(3, { x: 900, z: 900 });
      assert(detail.group.children.every((child) => !child.visible));
      detail.update(NaN, { x: 28, z: 65 });
      assert(detail.group.children.every((child) => child.visible));
      detail.group.traverse((object) => {
        if (object.isMesh)
          assert(Number.isFinite(object.material.emissiveIntensity));
      });
    } finally {
      detail.dispose();
    }
  }
});

test("the physical scale shows weighing progress and uploads its LCD only when the reading changes", () => {
  const detail = createHeadquartersDetail();
  const screen = detail.group.getObjectByName("hq-physical-scale-display");
  try {
    const texture = screen.material.map;
    const initialVersion = texture.version;
    assert.equal(screen.userData.reading.weight, "0.000 kg");
    for (let frame = 0; frame < 120; frame++) detail.setWorkState(null);
    assert.equal(texture.version, initialVersion);
    detail.setWorkState({ active: { phase: "weigh", working: false } });
    assert.equal(screen.userData.reading.status, "COLOCAR CAIXA");
    detail.setWorkState({
      active: { phase: "weigh", working: true, progress: 0.5 },
    });
    assert.equal(screen.userData.reading.weight, "4.850 kg");
    const halfwayVersion = texture.version;
    detail.setWorkState({
      active: { phase: "weigh", working: true, progress: 0.501 },
    });
    assert.equal(texture.version, halfwayVersion);
    detail.setWorkState({ active: { phase: "collect-weighed" } });
    assert.equal(screen.userData.reading.weight, "5.000 kg");
    assert.equal(screen.userData.reading.status, "PESO CONFIRMADO");
    detail.setWorkState({ active: { phase: "seal", working: true } });
    assert.equal(screen.userData.reading.weight, "0.000 kg");
    detail.setWorkState({
      active: { phase: "weigh", working: true, progress: NaN },
    });
    assert.equal(screen.userData.reading.weight, "4.700 kg");
  } finally {
    detail.dispose();
  }
});

function resources(detail) {
  const result = new Set();
  detail.group.traverse((object) => {
    if (!object.isMesh) return;
    result.add(object.geometry);
    result.add(object.material);
    if (object.isInstancedMesh) result.add(object);
    for (const value of Object.values(object.material))
      if (value?.isTexture) result.add(value);
  });
  return result;
}

test("independent headquarters own their GPU resources and release them once on disposal", () => {
  const scene = new THREE.Scene();
  let appends = 0;
  const first = createHeadquartersDetail({
    quality: "low",
    append: (group) => {
      appends++;
      scene.add(group);
    },
  });
  const second = createHeadquartersDetail({ quality: "low" });
  scene.add(second.group);
  const a = resources(first),
    b = resources(second);
  const disposed = new Map();
  let siblingDisposals = 0;
  for (const resource of a) {
    assert(
      !b.has(resource),
      "Mutable/disposable resources cannot belong to two worlds",
    );
    disposed.set(resource, 0);
    resource.addEventListener("dispose", () =>
      disposed.set(resource, disposed.get(resource) + 1),
    );
  }
  for (const resource of b)
    resource.addEventListener("dispose", () => siblingDisposals++);
  assert.equal(appends, 1);
  first.dispose();
  first.dispose();
  first.update(1, { x: 28, z: 66 });
  assert.equal(scene.children.length, 1);
  assert.equal(first.group.children.length, 0);
  assert.equal(siblingDisposals, 0);
  for (const count of disposed.values()) assert.equal(count, 1);
  second.dispose();
  assert.equal(scene.children.length, 0);
});

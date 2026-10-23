import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import {
  createDetailedBuilding,
  districtAssetsReady,
} from "../src/district-asset.js";

function dispose(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      materials.add(object.material);
      for (const value of Object.values(object.material))
        if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
}

test("district buildings have finite original detail inside their centred ground bounds", () => {
  for (const [variant, triangles] of [
    ["cafe", 171502],
    ["townhouse", 36479],
  ]) {
    const group = createDetailedBuilding({ variant });
    const box = new THREE.Box3().setFromObject(group, true);
    const { width, depth, height } = group.userData.bounds;
    assert.ok(Math.abs(box.min.y) < 0.00001);
    assert.ok(Math.abs(box.min.x + box.max.x) < 0.00001);
    assert.ok(Math.abs(box.min.z + box.max.z) < 0.00001);
    assert.ok(Math.abs(box.max.x - box.min.x - width) < 0.00001);
    assert.ok(Math.abs(box.max.z - box.min.z - depth) < 0.00001);
    assert.ok(Math.abs(box.max.y - height) < 0.00001);
    let count = 0;
    group.traverse((object) => {
      if (!object.geometry) return;
      const geometry = object.geometry;
      count += geometry.index.count / 3;
      for (const attribute of Object.values(geometry.attributes))
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
      const vertexCount = geometry.attributes.position.count;
      for (const index of geometry.index.array) assert.ok(index < vertexCount);
      assert.equal(geometry.attributes.tangent.itemSize, 4);
    });
    assert.equal(count, triangles);
    dispose(group);
  }
});

test("disposing one building leaves another instance's geometry, materials and textures intact", () => {
  const first = createDetailedBuilding(),
    second = createDetailedBuilding();
  const firstGeometry = new Set(),
    firstMaterial = new Set(),
    firstTextures = new Set();
  first.traverse((object) => {
    if (object.geometry) firstGeometry.add(object.geometry);
    if (object.material) {
      firstMaterial.add(object.material);
      for (const value of Object.values(object.material))
        if (value?.isTexture) firstTextures.add(value);
    }
  });
  let affected = 0;
  second.traverse((object) => {
    if (object.geometry) {
      assert.ok(!firstGeometry.has(object.geometry));
      object.geometry.addEventListener("dispose", () => affected++);
    }
    if (object.material) {
      assert.ok(!firstMaterial.has(object.material));
      object.material.addEventListener("dispose", () => affected++);
      for (const value of Object.values(object.material))
        if (value?.isTexture) {
          assert.ok(!firstTextures.has(value));
          value.addEventListener("dispose", () => affected++);
        }
    }
  });
  dispose(first);
  assert.equal(affected, 0);
  assert.ok(second.children[0].geometry.attributes.position.count > 0);
  dispose(second);
});

test("Bistro's original gloss alpha and direct specular F0 receive the correct shader adapter", () => {
  const group = createDetailedBuilding();
  let inspected = 0;
  for (const mesh of group.children) {
    const material = mesh.material;
    if (!material.specularColorMap) continue;
    const shader = {
      fragmentShader:
        "#include <roughnessmap_fragment>\n#include <lights_physical_fragment>",
    };
    material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes("texelRoughness.a"));
    assert.ok(!shader.fragmentShader.includes("pow2( ( material.ior"));
    assert.equal(material.roughnessMap, material.specularColorMap);
    inspected++;
  }
  assert.ok(inspected > 10);
  dispose(group);
});

test("every committed district texture matches both its output hash and NVIDIA's original LFS hash", async () => {
  const folder = new URL("../assets/district-v9/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("texture-manifest.json", folder), "utf8"),
  );
  assert.equal(manifest.textures.length, 74);
  for (const texture of manifest.textures) {
    assert.equal(texture.officialSourceMatch, true);
    assert.equal(texture.sourceSha256, texture.officialSourceSha256);
    const bytes = await readFile(new URL(texture.uri, folder));
    assert.equal(bytes.length, texture.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      texture.sha256,
    );
  }
  const state = await districtAssetsReady();
  assert.equal(state.failed, 0);
  assert.equal(state.ready, true);
  assert.throws(
    () => createDetailedBuilding({ variant: "unknown" }),
    RangeError,
  );
});

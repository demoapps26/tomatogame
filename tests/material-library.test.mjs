import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  applyPhotographicMaterial,
  createPhotographicMaterial,
} from "../src/material-library.js";

function shaderFor(material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
}

function dispose(material) {
  for (const name of ["map", "normalMap", "roughnessMap"])
    material[name]?.dispose();
  material.dispose();
}

test("wet road calibration updates the existing uniform without changing its scan maps or recompiling", () => {
  const road = createPhotographicMaterial("asphalt", {
    meters: 3.4,
    normalStrength: 0.38,
    roughness: 0.94,
  });
  try {
    const shader = shaderFor(road);
    const version = road.version;
    const scans = [road.map, road.normalMap, road.roughnessMap];
    assert.equal(shader.uniforms.photoMeters.value, 3.4);
    assert.equal(shader.uniforms.photoDryRoughness.value, 0.94);
    assert.equal(shader.uniforms.surfaceWeather, road.userData.surfaceWeather);
    // The atmosphere still owns the material's ordinary roughness. Puddles
    // need its original dry calibration when the whole road becomes damp.
    road.roughness = 0.24;
    road.userData.surfaceWeather.value = 0.8;
    assert.equal(shader.uniforms.surfaceWeather.value, 0.8);
    assert.equal(shader.uniforms.photoDryRoughness.value, 0.94);
    assert.equal(road.version, version);
    assert.deepEqual([road.map, road.normalMap, road.roughnessMap], scans);
    assert.deepEqual(road.normalScale.toArray(), [0.38, 0.38]);
    assert.equal(road.name, "photo-asphalt");
  } finally {
    dispose(road);
  }
});

test("separate worlds share immutable scan sources but own their weather state and disposable resources", () => {
  const first = createPhotographicMaterial("asphalt");
  const second = createPhotographicMaterial("asphalt");
  try {
    const a = shaderFor(first),
      b = shaderFor(second);
    assert.notEqual(a.uniforms.surfaceWeather, b.uniforms.surfaceWeather);
    first.userData.surfaceWeather.value = 1;
    assert.equal(b.uniforms.surfaceWeather.value, 0);
    let siblingDisposals = 0;
    for (const name of ["map", "normalMap", "roughnessMap"]) {
      assert.notEqual(first[name], second[name]);
      assert.equal(first[name].source, second[name].source);
      second[name].addEventListener("dispose", () => siblingDisposals++);
    }
    second.addEventListener("dispose", () => siblingDisposals++);
    dispose(first);
    assert.equal(siblingDisposals, 0);
    assert.equal(b.uniforms.surfaceWeather.value, 0);
  } finally {
    dispose(second);
  }
});

test("road, mineral, soil and unweathered surfaces cannot reuse the wrong shader variant", () => {
  const kinds = [
    "asphalt",
    "concrete",
    "plaster",
    "soil",
    "wood",
    "tiles",
    "cloth",
  ];
  const materials = kinds.map((kind) => createPhotographicMaterial(kind));
  try {
    const [road, concrete, plaster, soil, wood, tiles, cloth] = materials;
    const keys = materials.map((material) => material.customProgramCacheKey());
    assert.equal(
      concrete.customProgramCacheKey(),
      plaster.customProgramCacheKey(),
    );
    assert.equal(wood.customProgramCacheKey(), tiles.customProgramCacheKey());
    assert.equal(wood.customProgramCacheKey(), cloth.customProgramCacheKey());
    assert.equal(new Set(keys).size, 4);
    assert.notEqual(road.customProgramCacheKey(), soil.customProgramCacheKey());
    for (const surface of materials.slice(1)) {
      assert.equal(surface.userData.surfaceWeather, undefined);
      assert.equal(shaderFor(surface).uniforms.surfaceWeather, undefined);
    }
    const previousVersion = road.version;
    applyPhotographicMaterial(road, "wood", { roughness: 0.7 });
    assert.equal(road.userData.surfaceWeather, undefined);
    assert.equal(shaderFor(road).uniforms.surfaceWeather, undefined);
    assert.equal(road.customProgramCacheKey(), wood.customProgramCacheKey());
    assert(road.version > previousVersion);
  } finally {
    materials.forEach(dispose);
  }
});

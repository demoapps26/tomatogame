import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createVegetationLibrary } from "../src/vegetation.js";
import { createTomatoCrops } from "../src/tomato-crops.js";

function capture(factory, quality, profile) {
  const emitted = [];
  const library = factory({
    quality,
    profile,
    append(geometry, material, matrix, x, z, colour, level) {
      assert.ok(matrix.elements.every(Number.isFinite));
      assert.ok(Number.isFinite(x) && Number.isFinite(z));
      emitted.push({
        geometry,
        material,
        matrix: matrix.clone(),
        x,
        z,
        colour: colour?.isColor ? colour.toArray() : colour,
        level,
      });
    },
  });
  return { library, emitted };
}

function withoutGlobalRandom(callback) {
  const random = Math.random;
  Math.random = () => {
    throw new Error("Botany changed the global city RNG");
  };
  try {
    callback();
  } finally {
    Math.random = random;
  }
}

function resources(emitted) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  for (const { geometry, material } of emitted) {
    geometries.add(geometry);
    materials.add(material);
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
  }
  return { geometries, materials, textures };
}

function signature(emitted) {
  const hash = createHash("sha256");
  const seenGeometry = new Set(),
    seenMaterial = new Set();
  for (const item of emitted) {
    const { geometry, material } = item;
    if (!seenGeometry.has(geometry)) {
      seenGeometry.add(geometry);
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        hash.update(name);
        hash.update(Buffer.from(attribute.array.buffer));
      }
      if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer));
    }
    if (!seenMaterial.has(material)) {
      seenMaterial.add(material);
      hash.update(
        JSON.stringify([
          material.name,
          material.color.getHex(),
          material.alphaTest,
        ]),
      );
      for (const value of Object.values(material))
        if (value?.isTexture) hash.update(Buffer.from(value.image.data));
    }
    hash.update(
      JSON.stringify([
        geometry.type,
        material.name,
        item.matrix.elements,
        item.x,
        item.z,
        item.colour,
        item.level,
      ]),
    );
  }
  return hash.digest("hex");
}

const triangles = (emitted) =>
  emitted.reduce(
    (sum, { geometry }) =>
      sum + (geometry.index?.count ?? geometry.attributes.position.count) / 3,
    0,
  );

function checkResources(output, counts) {
  const all = resources(output.emitted);
  assert.deepEqual(
    Object.values(all).map((set) => set.size),
    counts,
  );
  for (const geometry of all.geometries)
    for (const attribute of Object.values(geometry.attributes))
      assert.ok(attribute.array.every(Number.isFinite));
  for (const material of all.materials)
    assert.equal(
      material.emissive.getHex(),
      0,
      "Foliage must never become a night lamp",
    );
  let disposed = 0;
  const owned = Object.values(all).flatMap((set) => [...set]);
  for (const resource of owned)
    resource.addEventListener("dispose", () => disposed++);
  output.library.dispose();
  output.library.dispose();
  assert.equal(
    disposed,
    owned.length,
    "Shared resources are disposed exactly once",
  );
}

function addTrees(output) {
  withoutGlobalRandom(() => {
    for (const [index, species] of [
      "plane",
      "olive",
      "pine",
      "cypress",
    ].entries())
      assert.equal(
        output.library.addTree(
          index * 16 - 24,
          19 - index * 7,
          1,
          species,
          0.45,
        ),
        true,
      );
  });
}

function addCrops(output) {
  withoutGlobalRandom(() => {
    for (let index = 0; index < 8; index++)
      assert.equal(
        output.library.addCrop(65 + index * 1.7, 32 + (index % 2) * 1.6, 1.1),
        true,
      );
    assert.equal(
      output.library.addPlanterShrub(16, 1, 83, 0.55, 0.55, 0.5, "#5b7547"),
      true,
    );
  });
}

for (const quality of ["low", "medium", "high"]) {
  test(`urban trees remain deterministic, shared and within the ${quality} triangle budget`, () => {
    const first = capture(createVegetationLibrary, quality, "urban");
    const second = capture(createVegetationLibrary, quality, "urban");
    addTrees(first);
    addTrees(second);
    assert.equal(signature(first.emitted), signature(second.emitted));
    assert.deepEqual(first.library.stats.species, {
      plane: 1,
      olive: 1,
      pine: 1,
      cypress: 1,
    });
    assert.ok(
      triangles(first.emitted) <=
        { low: 2200, medium: 8500, high: 11200 }[quality],
    );
    assert.ok(
      first.library.stats.sprays >=
        { low: 175, medium: 440, high: 620 }[quality],
    );
    const before = JSON.stringify(first.library.stats);
    assert.equal(first.library.addTree(NaN, 0), false);
    assert.equal(first.library.addTree(0, 0, 0), false);
    assert.equal(JSON.stringify(first.library.stats), before);
    for (const material of resources(first.emitted).materials) {
      if (!material.alphaTest) continue;
      const pixels = material.map.image.data;
      let transparent = 0,
        leaves = 0;
      for (let at = 0; at < pixels.length; at += 4) {
        if (pixels[at + 3]) leaves++;
        else {
          transparent++;
          assert.ok(
            pixels[at + 1] > pixels[at + 2],
            "Mip edges retain leaf RGB under zero alpha",
          );
        }
      }
      assert.ok(transparent > 0 && leaves / (pixels.length / 4) > 0.2);
      if (quality !== "low") {
        const shader = {
          uniforms: {},
          vertexShader: "#include <begin_vertex>",
          fragmentShader: "#include <lights_fragment_end>",
        };
        material.onBeforeCompile(shader);
        assert.ok(
          shader.fragmentShader.includes("directionalLights[leafLight].color"),
        );
        assert.ok(shader.fragmentShader.includes("* 0.045"));
        first.library.update(17);
        assert.equal(shader.uniforms.vegetationTime.value, 17);
      }
    }
    checkResources(first, [3, 4, 5]);
    second.library.dispose();
    assert.equal(first.library.addTree(0, 0), false);
  });

  test(`urban ${quality} tomato rows have compound foliage without changing planter containment`, () => {
    const first = capture(createTomatoCrops, quality, "urban");
    const second = capture(createTomatoCrops, quality, "urban");
    addCrops(first);
    addCrops(second);
    assert.equal(signature(first.emitted), signature(second.emitted));
    assert.equal(
      first.library.stats.leaflets,
      8 * { low: 8, medium: 35, high: 42 }[quality],
    );
    assert.ok(
      first.library.stats.fruits <=
        8 * (quality === "low" ? 3 : quality === "medium" ? 6 : 8),
    );
    const crops = first.emitted.filter(
      (item) => item.x !== 16 || item.z !== 83,
    );
    assert.ok(
      triangles(crops) <= 8 * { low: 350, medium: 1300, high: 2600 }[quality],
    );
    const point = new THREE.Vector3();
    let checkedVertices = 0;
    for (const item of first.emitted.filter(
      (item) => item.x === 16 && item.z === 83,
    )) {
      for (
        let index = 0;
        index < item.geometry.attributes.position.count;
        index++
      ) {
        point
          .fromBufferAttribute(item.geometry.attributes.position, index)
          .applyMatrix4(item.matrix);
        const ellipse =
          ((point.x - 16) / 0.55) ** 2 +
          ((point.y - 1) / 0.55) ** 2 +
          ((point.z - 83) / 0.5) ** 2;
        assert.ok(
          ellipse <= 1.000001,
          `Planter foliage escaped the original ellipsoid: ${ellipse}`,
        );
        checkedVertices++;
      }
    }
    assert.ok(checkedVertices > 0);
    const before = JSON.stringify(first.library.stats);
    assert.equal(first.library.addCrop(Infinity, 0), false);
    assert.equal(first.library.addCrop(0, 0, 0), false);
    assert.equal(first.library.addPlanterShrub(0, 0, 0, -1, 1, 1), false);
    assert.equal(JSON.stringify(first.library.stats), before);
    checkResources(first, [5, 4, 3]);
    second.library.dispose();
    assert.equal(first.library.addCrop(0, 0), false);
  });

  test(`the default ${quality} factories retain the explicit classic profile`, () => {
    for (const [factory, populate] of [
      [createVegetationLibrary, addTrees],
      [createTomatoCrops, addCrops],
    ]) {
      const original = capture(factory, quality);
      const classic = capture(factory, quality, "classic");
      populate(original);
      populate(classic);
      assert.equal(signature(original.emitted), signature(classic.emitted));
      assert.deepEqual(original.library.stats, classic.library.stats);
      original.library.dispose();
      classic.library.dispose();
    }
  });
}

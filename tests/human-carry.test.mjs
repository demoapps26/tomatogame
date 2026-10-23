import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter } from "../src/actors.js";

function dispose(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material
      ? Array.isArray(object.material)
        ? object.material
        : [object.material]
      : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  for (const set of [geometries, materials, textures])
    for (const item of set) item.dispose();
}
function handPositions(actor) {
  actor.group.updateMatrixWorld(true);
  return ["left-wrist", "right-wrist"].map((name) =>
    actor.group.worldToLocal(
      actor.group.getObjectByName(name).getWorldPosition(new THREE.Vector3()),
    ),
  );
}
function settle(actor, enabled, speed = 0) {
  actor.setCarryPose(enabled);
  for (let frame = 0; frame < 150; frame++)
    actor.animate(1 / 60, speed, frame / 60);
}
function jointPose(actor, names) {
  return names.map((name) => {
    const object = actor.group.getObjectByName(name);
    return [
      ...object.position.toArray(),
      ...object.quaternion.toArray(),
      ...object.scale.toArray(),
    ];
  });
}
const legs = [
  "left-hip",
  "right-hip",
  "left-knee",
  "right-knee",
  "left-ankle",
  "right-ankle",
];
const arms = [
  "left-shoulder",
  "right-shoulder",
  "left-elbow",
  "right-elbow",
  "left-wrist",
  "right-wrist",
];

test("carrying brings both palms to the sides of the physical box without moving the player transform", () => {
  const actor = createCharacter();
  try {
    actor.group.position.set(21, 0.14, 74);
    actor.group.rotation.y = 1.2;
    const position = actor.group.position.clone(),
      quaternion = actor.group.quaternion.clone(),
      scale = actor.group.scale.clone();
    settle(actor, true);
    const hands = handPositions(actor);
    assert(hands[0].x > 0 && hands[1].x < 0);
    for (const hand of hands) {
      assert(
        Math.abs(Math.abs(hand.x) - 0.55 / 2) < 0.055,
        "The palm must reach a box side, not remain folded at the chest",
      );
      assert(
        hand.y > 1.12 - 0.35 / 2 && hand.y < 1.12 + 0.35 / 2,
        "The palm must stay at the box handle height",
      );
      assert(
        hand.z > 0.42 - 0.4 / 2 && hand.z < 0.42 + 0.4 / 2,
        "The palm must reach the carried box in front of the body",
      );
    }
    assert(actor.group.position.equals(position));
    assert(actor.group.quaternion.equals(quaternion));
    assert(actor.group.scale.equals(scale));
    const box = new THREE.Box3().setFromObject(actor.group, true);
    assert(box.min.y >= 0.14 - 0.005);
    assert(box.max.y < 2.05);
  } finally {
    dispose(actor.group);
  }
});

test("a loaded walk preserves its gait and existing geometry while the arms blend into a hold", () => {
  const loaded = createCharacter(),
    free = createCharacter();
  const original = [];
  loaded.group.traverse((o) => {
    if (o.isMesh) original.push([o, o.geometry, o.material, o.skeleton]);
  });
  try {
    loaded.setCarryPose(true);
    let previous = loaded.group.getObjectByName("left-elbow").rotation.x,
      maxChange = 0;
    for (let frame = 0; frame < 180; frame++) {
      loaded.animate(1 / 60, 3, frame / 60);
      free.animate(1 / 60, 3, frame / 60);
      assert.deepEqual(
        jointPose(loaded, legs),
        jointPose(free, legs),
        "The cargo pose must not replace footstep articulation",
      );
      const elbow = loaded.group.getObjectByName("left-elbow").rotation.x;
      maxChange = Math.max(maxChange, Math.abs(elbow - previous));
      previous = elbow;
      loaded.group.traverse((o) =>
        assert(o.matrixWorld.elements.every(Number.isFinite)),
      );
      if (frame % 30 === 0) {
        const bounds = new THREE.Box3().setFromObject(loaded.group, true);
        assert(bounds.min.y >= -0.005);
        assert(bounds.max.y < 1.9);
        const vertex = new THREE.Vector3();
        loaded.group.traverse((mesh) => {
          if (!mesh.isSkinnedMesh) return;
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, vertex);
            assert(
              mesh.boundingSphere.containsPoint(vertex),
              "Loaded arms must remain inside the culling and raycasting envelope",
            );
          }
        });
      }
    }
    assert(maxChange < 0.2, "Picking up cargo must blend across frames");
    assert.notDeepEqual(jointPose(loaded, arms), jointPose(free, arms));
    for (const [object, geometry, material, skeleton] of original) {
      assert.equal(object.geometry, geometry);
      assert.equal(object.material, material);
      assert.equal(object.skeleton, skeleton);
    }
  } finally {
    dispose(loaded.group);
    dispose(free.group);
  }
});

test("putting down the box recovers ordinary walking and aiming without a residual hand rotation", () => {
  const loaded = createCharacter(),
    free = createCharacter();
  try {
    loaded.setCarryPose(true);
    for (let frame = 0; frame < 120; frame++) {
      loaded.animate(1 / 60, 3, frame / 60);
      free.animate(1 / 60, 3, frame / 60);
    }
    loaded.setCarryPose(false);
    for (let frame = 0; frame < 180; frame++) {
      loaded.animate(1 / 60, 3, 2 + frame / 60, true);
      free.animate(1 / 60, 3, 2 + frame / 60, true);
    }
    const a = jointPose(loaded, arms),
      b = jointPose(free, arms);
    a.forEach((values, i) =>
      values.forEach((value, j) => assert(Math.abs(value - b[i][j]) < 1e-5)),
    );
  } finally {
    dispose(loaded.group);
    dispose(free.group);
  }
});

test("the seated driver keeps priority over cargo and preserves its caller seat transform", () => {
  const loaded = createCharacter(),
    driver = createCharacter();
  try {
    settle(loaded, true);
    for (const actor of [loaded, driver]) {
      actor.group.position.set(0, -0.53, 0.15);
      actor.group.scale.setScalar(0.9);
      actor.setDrivingPose(0.5);
    }
    assert.deepEqual(
      jointPose(loaded, [...legs, ...arms]),
      jointPose(driver, [...legs, ...arms]),
    );
    const before = jointPose(loaded, [...legs, ...arms]);
    loaded.setCarryPose(true);
    assert.deepEqual(
      jointPose(loaded, [...legs, ...arms]),
      before,
      "The carry setter stores intent and cannot overwrite a seated rig",
    );
    loaded.setDrivingPose(-0.5);
    const box = new THREE.Box3().setFromObject(loaded.group, true);
    assert(box.min.y > -0.01 && box.max.y < 1.15);
    assert.deepEqual(loaded.group.position.toArray(), [0, -0.53, 0.15]);
    assert.equal(loaded.group.scale.x, 0.9);
  } finally {
    dispose(loaded.group);
    dispose(driver.group);
  }
});

test("optional cargo strength is bounded and malformed values keep the skinned pose finite", () => {
  const actor = createCharacter();
  try {
    actor.setCarryPose(true, 0.5);
    for (let frame = 0; frame < 150; frame++)
      actor.animate(1 / 60, 0, frame / 60);
    const halfway = handPositions(actor)[0].z;
    settle(actor, true);
    assert(handPositions(actor)[0].z > halfway + 0.1);
    for (const args of [
      [true, NaN],
      [true, Infinity],
      [true, -10],
      [true, 10],
      [false, 1],
      [undefined, 1],
    ]) {
      actor.setCarryPose(...args);
      actor.animate(0.1, 3, Number.MAX_VALUE);
      actor.group.traverse((o) =>
        assert(o.matrixWorld.elements.every(Number.isFinite)),
      );
    }
  } finally {
    dispose(actor.group);
  }
});

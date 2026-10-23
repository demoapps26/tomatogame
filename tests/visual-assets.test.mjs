import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter } from "../src/actors.js";
import { createDetailedSportVehicle } from "../src/vehicle-asset.js";
import { createDetailedChair } from "../src/furniture-asset.js";

test("walking and running keep a continuous gait independent of the session clock", () => {
  const fresh = createCharacter(),
    resumed = createCharacter();
  const joints = [
    "left-hip",
    "right-hip",
    "left-knee",
    "right-knee",
    "left-ankle",
    "right-ankle",
  ];
  try {
    for (let frame = 0; frame < 240; frame++) {
      const speed = frame < 20 || frame >= 180 ? 0 : frame < 90 ? 4 : 7;
      fresh.animate(1 / 60, speed, frame / 60);
      resumed.animate(1 / 60, speed, 36000 + frame / 60);
      for (const name of joints)
        assert.equal(
          fresh.group.getObjectByName(name).rotation.x,
          resumed.group.getObjectByName(name).rotation.x,
          `${name} changed phase because the session was older`,
        );
      if (frame % 12 === 0) {
        const bounds = validateTransforms(fresh.group);
        assert(
          bounds.min.y >= -0.005,
          "The planted sole went below the pavement",
        );
        assert(
          bounds.max.y < 1.9,
          "The walking rig lost its adult proportions",
        );
      }
    }
  } finally {
    dispose(fresh.group);
    dispose(resumed.group);
  }
});

function resources(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const surfaces = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const surface of surfaces) {
      materials.add(surface);
      for (const value of Object.values(surface))
        if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
function dispose(group) {
  group.removeFromParent();
  for (const items of Object.values(resources(group)))
    for (const item of items) item.dispose();
}
function validateGeometry(group) {
  let meshes = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry,
      position = geometry.attributes.position;
    assert(position?.count >= 3, `${object.name} has no drawable vertices`);
    assert.equal(position.itemSize, 3);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      assert.equal(
        attribute.count,
        position.count,
        `${name} has missing vertices`,
      );
      for (const value of attribute.array)
        assert(
          Number.isFinite(value),
          `${object.name} has a non-finite ${name}`,
        );
    }
    const corners = geometry.index?.count ?? position.count;
    assert.equal(corners % 3, 0, `${object.name} has an incomplete triangle`);
    if (geometry.index) {
      for (const index of geometry.index.array)
        assert(
          Number.isInteger(index) && index >= 0 && index < position.count,
          `${object.name} references a missing vertex`,
        );
    }
  });
  assert(meshes > 0, "The asset must contain drawable geometry");
}
function validateTransforms(group) {
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    assert(
      object.matrixWorld.elements.every(Number.isFinite),
      `${object.name} has a non-finite animated transform`,
    );
  });
  // Wheels can be both steered and rolled. Transforming their old local AABB
  // overestimates the corners; collision data must contain the actual vertices.
  const box = new THREE.Box3().setFromObject(group, true);
  assert([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite));
  return box;
}
function pose(group) {
  const values = new Map();
  group.traverse((object) => {
    if (object.isGroup)
      values.set(object.uuid, [
        ...object.position.toArray(),
        ...object.quaternion.toArray(),
        ...object.scale.toArray(),
      ]);
  });
  return values;
}
function changedGroups(before, after) {
  return [...before].filter(([id, values]) =>
    values.some(
      (value, index) => Math.abs(value - after.get(id)[index]) > 1e-5,
    ),
  ).length;
}
function containedByBounds(group, bounds) {
  const box = validateTransforms(group),
    epsilon = 0.002;
  assert(
    box.min.x >= -bounds.width / 2 - epsilon,
    "Left body/wheel leaves collision bounds",
  );
  assert(
    box.max.x <= bounds.width / 2 + epsilon,
    "Right body/wheel leaves collision bounds",
  );
  assert(
    box.min.z >= -bounds.length / 2 - epsilon,
    "Rear body/wheel leaves collision bounds",
  );
  assert(
    box.max.z <= bounds.length / 2 + epsilon,
    "Front body/wheel leaves collision bounds",
  );
  assert(box.min.y >= -epsilon, "The asset sinks below the ground");
  assert(
    box.max.y <= bounds.height + epsilon,
    "The asset exceeds its advertised height",
  );
  return box;
}
function appearance(group) {
  return [...resources(group).materials].map((surface) => ({
    color: surface.color?.getHex(),
    roughness: surface.roughness,
    emissiveIntensity: surface.emissiveIntensity,
    clearcoat: surface.clearcoat,
  }));
}
function recordDisposals(group) {
  const disposed = [];
  for (const [kind, items] of Object.entries(resources(group)))
    for (const item of items)
      item.addEventListener("dispose", () => disposed.push(kind));
  return disposed;
}

test("human variants retain adult scale, valid geometry and articulated walking and aiming", () => {
  const variants = [
    {},
    { enemy: true },
    ...Array.from({ length: 6 }, (_, index) => ({ civilian: true, index })),
  ];
  for (const options of variants) {
    const actor = createCharacter(options);
    try {
      validateGeometry(actor.group);
      const standing = validateTransforms(actor.group),
        size = standing.getSize(new THREE.Vector3());
      assert(
        size.y > 1.7 && size.y < 1.95,
        "A scan or garment lost its human scale",
      );
      assert(
        Math.abs(standing.min.y) < 0.02,
        "The character's feet lost the ground origin",
      );
      assert(
        size.x > 0.35 && size.x < 0.9,
        "The character no longer fits a human-width doorway",
      );
      const beforeWalk = pose(actor.group);
      actor.animate(0.2, 5, 0.73, false);
      assert(
        changedGroups(beforeWalk, pose(actor.group)) >= 4,
        "Walking must articulate several limbs, not move only the whole body",
      );
      validateTransforms(actor.group);
      actor.animate(1, 0, 0, false);
      const atRest = pose(actor.group);
      actor.animate(1, 0, 0, true);
      assert(
        changedGroups(atRest, pose(actor.group)) >= 2,
        "Aiming must change the arm and forearm pose",
      );
      actor.animate(NaN, Infinity, NaN, true);
      validateTransforms(actor.group);
    } finally {
      dispose(actor.group);
    }
  }
});

test("disposing a character cannot release the next citizen's geometry, materials or textures", () => {
  const first = createCharacter({ civilian: true, index: 2 });
  const second = createCharacter({ civilian: true, index: 2 });
  const secondDisposals = recordDisposals(second.group);
  try {
    dispose(first.group);
    assert.deepEqual(secondDisposals, []);
    second.animate(0.2, 4, 0.6, true);
    validateTransforms(second.group);
    validateGeometry(second.group);
  } finally {
    dispose(second.group);
  }
});

test("the detailed car stays inside its collision volume while its tyres turn and roll", () => {
  const car = createDetailedSportVehicle();
  try {
    validateGeometry(car.group);
    const size = containedByBounds(car.group, car.bounds).getSize(
      new THREE.Vector3(),
    );
    assert(
      size.x > 1.5 && size.x < 3 && size.z > 3 && size.z < 6,
      "The decoded model lost road-car dimensions or its forward axis",
    );
    assert(size.y > 0.8 && size.y < 2.1);
    for (const direction of [-0.7, -0.35, 0, 0.35, 0.7]) {
      for (let frame = 0; frame < 8; frame++) {
        car.animate(0.09, frame % 2 ? -13 : 18, direction);
        containedByBounds(car.group, car.bounds);
      }
    }
    car.animate(Infinity, NaN, Infinity);
    validateTransforms(car.group);
  } finally {
    dispose(car.group);
  }
});

test("four vehicle wheels roll with travel, reverse correctly and steer only at the front", () => {
  const car = createDetailedSportVehicle();
  try {
    assert.equal(
      car.wheels.length,
      4,
      "A road car needs four independently moving wheels",
    );
    const front = car.wheels.filter((wheel) => wheel.parent.position.z > 0);
    const rear = car.wheels.filter((wheel) => wheel.parent.position.z < 0);
    assert.equal(front.length, 2, "The front wheel pivots must face local +Z");
    assert.equal(rear.length, 2);
    for (const wheel of car.wheels) {
      let meshes = 0;
      wheel.traverse((object) => {
        if (object.isMesh) meshes++;
      });
      assert(meshes > 0, "An animated wheel pivot has lost its tyre geometry");
    }
    const start = car.wheels.map((wheel) => wheel.rotation.x);
    car.animate(0.1, 9, 0.3);
    for (let index = 0; index < car.wheels.length; index++)
      assert(
        car.wheels[index].rotation.x > start[index],
        "Forward travel did not roll a tyre",
      );
    for (const wheel of front) assert(wheel.parent.rotation.y > 0);
    for (const wheel of rear) assert.equal(wheel.parent.rotation.y, 0);
    car.animate(0.1, -9, -0.3);
    car.wheels.forEach((wheel, index) =>
      assert(
        Math.abs(wheel.rotation.x - start[index]) < 1e-9,
        "Equal reverse travel must undo the wheel's forward roll",
      ),
    );
    for (const wheel of front) assert(wheel.parent.rotation.y < 0);
    const stopped = car.wheels.map((wheel) => wheel.rotation.x);
    car.animate(0.1, 0, 100);
    assert.deepEqual(
      car.wheels.map((wheel) => wheel.rotation.x),
      stopped,
      "Stationary steering must not roll the tyres",
    );
    for (const wheel of front)
      assert(
        Math.abs(wheel.parent.rotation.y) < Math.PI / 4,
        "An out-of-range steering value can flip the front wheels",
      );
  } finally {
    dispose(car.group);
  }
});

test("vehicle paint, headlights, damage and disposal remain private to each owned car", () => {
  const first = createDetailedSportVehicle(0x903c31);
  const second = createDetailedSportVehicle(0x316b71);
  const originalSecond = appearance(second.group),
    secondDisposals = recordDisposals(second.group);
  try {
    assert.notDeepEqual(
      appearance(first.group),
      originalSecond,
      "The chosen paint colour must affect the model",
    );
    const pristine = appearance(first.group);
    first.setLights(true);
    assert.notDeepEqual(
      appearance(first.group),
      pristine,
      "Night lighting must change the model's lamps",
    );
    const illuminated = appearance(first.group);
    first.setCondition(15);
    assert.notDeepEqual(
      appearance(first.group),
      illuminated,
      "Damage must affect the paint finish",
    );
    assert.deepEqual(appearance(second.group), originalSecond);
    dispose(first.group);
    assert.deepEqual(
      secondDisposals,
      [],
      "Releasing one car must not release another car's resources",
    );
    second.animate(0.1, 6, 0.2);
    validateTransforms(second.group);
    validateGeometry(second.group);
  } finally {
    dispose(second.group);
  }
});

test("the decoded chair has finite, human-sized geometry and supports different fabric colours", () => {
  const first = createDetailedChair({ fabricColor: 0x724f3d });
  const second = createDetailedChair({ fabricColor: 0x395b62 });
  try {
    validateGeometry(first);
    const box = containedByBounds(first, first.userData.bounds),
      size = box.getSize(new THREE.Vector3());
    assert(
      size.y > 0.45 && size.y < 1.4 && size.x > 0.4 && size.x < 1.5,
      "The chair lost the scale needed by the walkable interior",
    );
    assert.notDeepEqual(
      appearance(first),
      appearance(second),
      "Fabric colour selection must reach the actual surfaces",
    );
  } finally {
    dispose(first);
    dispose(second);
  }
});

test("removing one furnished chair leaves the other chair's GPU resources alive", () => {
  const first = createDetailedChair(),
    second = createDetailedChair();
  const remainingResources = recordDisposals(second);
  try {
    dispose(first);
    assert.deepEqual(remainingResources, []);
    validateGeometry(second);
    containedByBounds(second, second.userData.bounds);
  } finally {
    dispose(second);
  }
});

test("the seated driver reaches forward, fits the GT cabin and preserves its caller's seat transform", () => {
  const actor = createCharacter();
  try {
    actor.setDrivingPose(0);
    const neutral = pose(actor.group),
      local = validateTransforms(actor.group);
    assert(
      local.min.y > 0.55 && local.min.y < 0.75,
      "A seated driver's feet must be lifted from the standing origin",
    );
    assert(
      local.max.z > 0.65,
      "The knees and feet must face the pedals at local +Z",
    );
    actor.setDrivingPose(0.5);
    assert(
      changedGroups(neutral, pose(actor.group)) >= 2,
      "Steering must visibly adjust the driver's arm pose",
    );
    actor.group.position.set(0, -0.53, 0.15);
    actor.group.scale.setScalar(0.9);
    actor.group.rotation.y = 0.2;
    const external = [
      ...actor.group.position.toArray(),
      ...actor.group.quaternion.toArray(),
      ...actor.group.scale.toArray(),
    ];
    actor.setDrivingPose(-0.5);
    assert.deepEqual(
      [
        ...actor.group.position.toArray(),
        ...actor.group.quaternion.toArray(),
        ...actor.group.scale.toArray(),
      ],
      external,
      "The driving pose must leave the caller's seat placement and scale intact",
    );
    actor.group.rotation.y = 0;
    const cabin = validateTransforms(actor.group);
    assert(
      cabin.min.y >= -0.01,
      "The driver's feet must stay above the road in the low GT seat",
    );
    assert(cabin.max.y < 1.15, "The driver's head must fit below the GT roof");
    actor.setDrivingPose(NaN);
    validateTransforms(actor.group);
    actor.group.position.set(0, 0, 0);
    actor.group.scale.setScalar(1);
    actor.animate(1, 0, 0, false);
    assert(
      Math.abs(validateTransforms(actor.group).min.y) < 0.02,
      "Returning to walking must recover the original ground origin",
    );
  } finally {
    dispose(actor.group);
  }
});

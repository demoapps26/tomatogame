import * as THREE from "three";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import {
  HUMAN_META,
  HUMAN_GEOMETRY,
  HUMAN_IMAGES,
} from "./human-asset-data.js";

// Anatomical MakeHuman meshes, fitted clothes, open eyes and original skin
// photography. The complete source and CC0 declaration live in assets/human-v9.
const TAU = Math.PI * 2;
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const clamp = THREE.MathUtils.clamp;
const state = {
  loaded: 0,
  failed: 0,
  total: typeof Image === "undefined" ? 0 : HUMAN_IMAGES.length,
};
const consumers = new Set(),
  pending = [],
  sources = new WeakMap();
const images = HUMAN_IMAGES.map((url) => {
  if (typeof Image === "undefined") return null;
  const image = new Image();
  pending.push(
    new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {}
        state.loaded++;
        for (const texture of consumers)
          if (texture.image === image) texture.needsUpdate = true;
        resolve();
      };
      image.onerror = () => {
        state.failed++;
        resolve();
      };
      image.src = url;
    }),
  );
  return image;
});
const ready = Promise.all(pending).then(() => getHumanAssetState());
export function humanAssetsReady() {
  return ready;
}
export function getHumanAssetState() {
  return {
    ...state,
    ready: state.loaded + state.failed === state.total,
    name: HUMAN_META.name,
    license: HUMAN_META.license,
  };
}
const bytes = gunzipSync(HUMAN_GEOMETRY);
function attribute(description) {
  const { offset, length, size, low, high, kind } = description;
  const quantized =
    kind === "normal"
      ? new Int16Array(bytes.buffer, bytes.byteOffset + offset, length)
      : new Uint16Array(bytes.buffer, bytes.byteOffset + offset, length);
  const array = new Float32Array(length);
  for (let i = 0; i < length; i++)
    array[i] =
      kind === "normal"
        ? quantized[i] / 32767
        : low[i % size] +
          (quantized[i] / 65535) * (high[i % size] - low[i % size]);
  return new THREE.BufferAttribute(array, size);
}
const templates = Object.fromEntries(
  Object.entries(HUMAN_META.variants).map(([name, variant]) => [
    name,
    variant.parts.map((part) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", attribute(part.position));
      geometry.setAttribute("normal", attribute(part.normal));
      geometry.setAttribute("uv", attribute(part.uv));
      geometry.setAttribute("uv1", geometry.attributes.uv.clone());
      geometry.setAttribute(
        "skinIndex",
        new THREE.Uint8BufferAttribute(
          new Uint8Array(
            bytes.buffer,
            bytes.byteOffset + part.skinIndex.offset,
            part.skinIndex.length,
          ).slice(),
          4,
        ),
      );
      geometry.setAttribute("skinWeight", attribute(part.skinWeight));
      const Type = part.indices.type === "u32" ? Uint32Array : Uint16Array;
      geometry.setIndex(
        new THREE.BufferAttribute(
          new Type(
            bytes.buffer,
            bytes.byteOffset + part.indices.offset,
            part.indices.length,
          ).slice(),
          1,
        ),
      );
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    }),
  ]),
);
const jointNames = {
  pelvis: "human-pelvis",
  spine_03: "human-upper-body",
  neck_01: "human-neck",
  head: "head-attention-pivot",
  thigh_l: "left-hip",
  thigh_r: "right-hip",
  calf_l: "left-knee",
  calf_r: "right-knee",
  foot_l: "left-ankle",
  foot_r: "right-ankle",
  upperarm_l: "left-shoulder",
  upperarm_r: "right-shoulder",
  lowerarm_l: "left-elbow",
  lowerarm_r: "right-elbow",
  hand_l: "left-wrist",
  hand_r: "right-wrist",
};

/** A fully skinned, clothed 1.80 m adult. +Z forward; all GPU resources are owned. */
export function createDetailedHuman({
  enemy = false,
  civilian = false,
  index = 0,
} = {}) {
  index = Math.trunc(finite(index));
  const variantName = civilian ? "citizen" : "worker",
    variant = HUMAN_META.variants[variantName];
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.name = civilian
    ? `citizen-${index}`
    : enemy
      ? "rival-gardener"
      : "player-gardener";
  group.userData.characterDetail = "anatomical-skinned-human-v9";
  group.userData.source = HUMAN_META.name;
  group.userData.license = HUMAN_META.license;
  group.userData.triangles = variant.triangles;
  rig.name = "human-pelvis-rig";
  group.add(rig);
  const wrappers = [],
    bones = [],
    joints = {};
  variant.bones.forEach((definition, id) => {
    const wrapper = new THREE.Group(),
      bone = new THREE.Bone();
    wrapper.name = jointNames[definition.name] || `human-${definition.name}`;
    wrapper.userData.anatomicalJoint = definition.name;
    wrapper.position.fromArray(definition.head);
    if (definition.parent >= 0)
      wrapper.position.sub(
        new THREE.Vector3().fromArray(variant.bones[definition.parent].head),
      );
    bone.name = `skin-${definition.name}`;
    wrapper.add(bone);
    wrappers.push(wrapper);
    bones.push(bone);
    joints[definition.name] = wrapper;
  });
  variant.bones.forEach((definition, id) => {
    if (definition.parent >= 0) bones[definition.parent].add(wrappers[id]);
    else rig.add(wrappers[id]);
  });
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  let skeletonReleased = false;
  const textureCache = new Map();
  function textureFor(id, color = false) {
    if (id === undefined) return null;
    const key = `${id}:${color}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const image = images[id];
    const texture = image
      ? new THREE.Texture(image)
      : new THREE.DataTexture(
          new Uint8Array(color ? [255, 255, 255, 255] : [128, 128, 255, 255]),
          1,
          1,
        );
    if (image) {
      const shared = sources.get(image);
      if (shared) texture.source = shared;
      else sources.set(image, texture.source);
    }
    texture.name = `human-CC0-${HUMAN_META.imageNames[id]}`;
    // UVs are authored by MakeHuman; unlike glTF buffers, their V is not flipped.
    texture.flipY = true;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    consumers.add(texture);
    texture.addEventListener("dispose", () => consumers.delete(texture));
    textureCache.set(key, texture);
    return texture;
  }
  const surfaces = new Map();
  function surfaceFor(name) {
    if (surfaces.has(name)) return surfaces.get(name);
    const definition = HUMAN_META.materials[name];
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: definition.roughness,
      metalness: 0,
      map: textureFor(definition.map, true),
      normalMap: textureFor(definition.normalMap),
      aoMap: textureFor(definition.aoMap),
      aoMapIntensity: 0.6,
      alphaTest: definition.alphaTest || 0,
      side: definition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      envMapIntensity: 0.65,
    });
    material.name = `human-photographic-${name}`;
    if (name === variantName) {
      const colors = [
        0xffffff, 0xc8d1c5, 0xd3d1c2, 0xb3c4d0, 0xd9c5b8, 0xb7bca9,
      ];
      material.color.set(
        enemy
          ? 0xb5aa90
          : civilian
            ? colors[Math.abs(index) % colors.length]
            : 0xd0d3bf,
      );
      material.sheen = 0.16;
      material.sheenColor.copy(material.color).multiplyScalar(0.6);
      material.sheenRoughness = 0.9;
      material.normalScale.set(0.7, 0.7);
    } else if (name === "skin") {
      const tones = [0xffffff, 0xf2dfcf, 0xd9b99d, 0xf9e8d7, 0xe8cfb6];
      material.color.set(tones[Math.abs(index) % tones.length]);
      material.ior = 1.4;
      material.specularIntensity = 0.25;
    } else if (name === "eyes") {
      material.ior = 1.38;
      material.clearcoat = 0.5;
      material.clearcoatRoughness = 0.18;
    } else if (name === "hair") {
      const shades = [0x65533f, 0x403b33, 0x9e8b6c, 0x504539, 0x7d7b73];
      material.color.set(shades[Math.abs(index) % shades.length]);
    }
    surfaces.set(name, material);
    return material;
  }
  variant.parts.forEach((part, id) => {
    const geometry = templates[variantName][id].clone(),
      mesh = new THREE.SkinnedMesh(geometry, surfaceFor(part.material));
    mesh.name = `anatomical-${part.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    // SkinnedMesh otherwise caches the first pose's sphere. A planted shoe's
    // tiny neutral bound misses its raised/extended position on later rays.
    // This full-body envelope includes running, aiming and the seated pose;
    // its transform also follows the support correction and external seat.
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0.9, 0.15),
      1.6,
    );
    mesh.frustumCulled = true;
    rig.add(mesh);
    mesh.normalizeSkinWeights();
    mesh.bind(skeleton);
    // World disposal already releases geometry/material/texture resources. Tie
    // this actor's private bone texture to the same lifecycle.
    geometry.addEventListener("dispose", () => {
      if (!skeletonReleased) {
        skeletonReleased = true;
        skeleton.dispose();
      }
    });
  });
  const legs = [joints.thigh_l, joints.thigh_r],
    knees = [joints.calf_l, joints.calf_r],
    feet = [joints.foot_l, joints.foot_r],
    arms = [joints.upperarm_l, joints.upperarm_r],
    elbows = [joints.lowerarm_l, joints.lowerarm_r],
    hands = [joints.hand_l, joints.hand_r];
  const personality = (Math.abs(index) % 97) * 1.71;
  const inverseGroup = new THREE.Matrix4(),
    point = new THREE.Vector3(),
    result = new THREE.Vector3();
  const supportMatrices = bones.map(() => new THREE.Matrix4());
  function soleY() {
    group.updateMatrixWorld(true);
    inverseGroup.copy(group.matrixWorld).invert();
    for (let i = 0; i < bones.length; i++)
      supportMatrices[i]
        .multiplyMatrices(inverseGroup, bones[i].matrixWorld)
        .multiply(skeleton.boneInverses[i]);
    let lowest = Infinity;
    for (const sample of variant.support) {
      result.set(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        if (!sample.w[i]) continue;
        point
          .fromArray(sample.p)
          .applyMatrix4(supportMatrices[sample.j[i]])
          .multiplyScalar(sample.w[i]);
        result.add(point);
      }
      lowest = Math.min(lowest, result.y);
    }
    return finite(lowest);
  }
  let drivingPose = false,
    gaitPhase = (Math.abs(index) * 0.83) % TAU,
    locomotionSpeed = 0,
    aimWeight = 0;
  function setDrivingPose(steering = 0) {
    const turn = clamp(finite(steering), -0.7, 0.7);
    drivingPose = true;
    locomotionSpeed = 0;
    aimWeight = 0;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    for (const joint of wrappers) {
      joint.rotation.set(0, 0, 0);
      joint.scale.set(1, 1, 1);
    }
    joints.spine_01.rotation.x = -0.06;
    joints.head.rotation.set(0, turn * 0.09, -turn * 0.014);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      legs[i].rotation.set(-1.78, side * 0.025, side * 0.045);
      knees[i].rotation.x = 0.98;
      feet[i].rotation.x = 0.8;
      arms[i].rotation.set(
        -0.98 + turn * side * 0.07,
        side * -0.13,
        side * -0.2 + turn * 0.06,
      );
      elbows[i].rotation.x = -0.65 - turn * side * 0.1;
      hands[i].rotation.set(0.1, side * 1.1, side * 0.08 - turn * 0.06);
    }
    group.updateMatrixWorld(true);
    skeleton.update();
  }
  function animate(dt, speed = 0, time = 0, aiming = false) {
    const step = clamp(finite(dt), 0, 0.25),
      targetSpeed = Math.min(10, Math.abs(finite(speed)));
    if (drivingPose) {
      for (const joint of wrappers) {
        joint.rotation.set(0, 0, 0);
        joint.scale.set(1, 1, 1);
      }
      drivingPose = false;
    }
    const priorSpeed = locomotionSpeed,
      response = targetSpeed > priorSpeed ? 8 : 12,
      decay = Math.exp(-step * response);
    locomotionSpeed = targetSpeed + (priorSpeed - targetSpeed) * decay;
    const integratedSpeed =
      targetSpeed * step +
      ((priorSpeed - targetSpeed) * (1 - decay)) / response;
    if (locomotionSpeed > 0.005 || targetSpeed > 0)
      gaitPhase = (gaitPhase + 6.8 * step + 0.95 * integratedSpeed) % TAU;
    const lowerBlend = 1 - Math.exp(-step * 15),
      upperBlend = 1 - Math.exp(-step * 8);
    const damp = (current, target, blend = lowerBlend) =>
      THREE.MathUtils.lerp(current, target, blend);
    aimWeight = damp(aimWeight, aiming ? 1 : 0, 1 - Math.exp(-step * 11));
    const motion = Math.sqrt(clamp(locomotionSpeed / 3.8, 0, 1)),
      running = THREE.MathUtils.smoothstep(locomotionSpeed, 4.2, 6.8),
      idle = 1 - motion;
    const clock = (finite(time) % (TAU * 100)) + personality,
      breath = Math.sin(clock * 1.65);
    for (let i = 0; i < 2; i++) {
      const phase = gaitPhase + i * Math.PI,
        wave = Math.sin(phase),
        recovery = Math.max(0, -Math.cos(phase)) ** 1.35,
        side = i === 0 ? 1 : -1;
      const hip =
        wave *
        (wave > 0
          ? THREE.MathUtils.lerp(0.43, 0.84, running)
          : THREE.MathUtils.lerp(0.36, 0.62, running)) *
        motion;
      const knee =
        (0.035 + recovery * THREE.MathUtils.lerp(0.72, 1.18, running)) * motion;
      legs[i].rotation.x = damp(legs[i].rotation.x, hip);
      knees[i].rotation.x = damp(knees[i].rotation.x, knee);
      feet[i].rotation.x = damp(
        feet[i].rotation.x,
        clamp(-(hip + knee) * 0.65, -0.4, 0.3) - recovery * 0.065 * motion,
      );
      legs[i].rotation.y = damp(legs[i].rotation.y, -side * 0.018 * motion);
      legs[i].rotation.z = damp(legs[i].rotation.z, side * 0.015 * motion);
      const armSwing =
        -wave * THREE.MathUtils.lerp(0.3, 0.55, running) * motion;
      arms[i].rotation.x = damp(
        arms[i].rotation.x,
        THREE.MathUtils.lerp(armSwing, i === 1 ? -1.25 : -0.18, aimWeight),
        upperBlend,
      );
      arms[i].rotation.z = damp(
        arms[i].rotation.z,
        side * (-0.016 - running * 0.035) + side * aimWeight * 0.035,
        upperBlend,
      );
      arms[i].rotation.y = damp(
        arms[i].rotation.y,
        side * (0.015 * wave * motion + 0.055 * running),
        upperBlend,
      );
      elbows[i].rotation.x = damp(
        elbows[i].rotation.x,
        THREE.MathUtils.lerp(
          -0.12 - running * 0.87 - Math.abs(wave) * 0.1 * motion,
          i === 1 ? -0.5 : -0.32,
          aimWeight,
        ),
        upperBlend,
      );
      hands[i].rotation.set(
        -0.025 * motion,
        side * 0.025 * wave * motion,
        side * 0.018 * motion,
      );
    }
    joints.pelvis.rotation.y = damp(
      joints.pelvis.rotation.y,
      Math.sin(gaitPhase) * 0.035 * motion,
      upperBlend,
    );
    joints.pelvis.rotation.z = damp(
      joints.pelvis.rotation.z,
      Math.sin(gaitPhase) * 0.013 * motion +
        Math.sin(clock * 0.29) * 0.004 * idle,
      upperBlend,
    );
    const acceleration = step
      ? clamp((locomotionSpeed - priorSpeed) / step, -10, 10)
      : 0;
    const lean = 0.055 * motion + 0.045 * running + acceleration * 0.003;
    joints.spine_01.rotation.x = damp(
      joints.spine_01.rotation.x,
      lean,
      upperBlend,
    );
    joints.spine_03.rotation.y = damp(
      joints.spine_03.rotation.y,
      -Math.sin(gaitPhase) * 0.06 * motion * (1 - aimWeight * 0.7),
      upperBlend,
    );
    joints.spine_03.rotation.z = damp(
      joints.spine_03.rotation.z,
      -Math.sin(gaitPhase) * 0.014 * motion,
      upperBlend,
    );
    joints.spine_03.scale.set(
      1 + breath * 0.002 * idle,
      1 + breath * 0.0025 * idle,
      1 + breath * 0.004 * idle,
    );
    joints.head.rotation.y = damp(
      joints.head.rotation.y,
      (Math.sin(clock * 0.37 + 0.5) * 0.088 +
        Math.sin(clock * 0.83 + personality * 0.3) * 0.027) *
        (1 - motion * 0.8) *
        (1 - aimWeight * 0.9) -
        joints.spine_03.rotation.y * 0.45,
      upperBlend,
    );
    joints.head.rotation.x = damp(
      joints.head.rotation.x,
      Math.sin(clock * 0.53) * 0.017 * idle -
        lean * 0.3 +
        breath * 0.004 * idle,
      upperBlend,
    );
    joints.head.rotation.z = damp(
      joints.head.rotation.z,
      Math.sin(clock * 0.39) * 0.012 * idle - joints.pelvis.rotation.z * 0.45,
      upperBlend,
    );
    // Sample the actual skinned shoe soles after articulation. The support
    // solution stays correct if body proportions or clothing meshes evolve.
    rig.position.y = 0;
    const flight = Math.max(0, Math.sin(gaitPhase * 2)) * 0.022 * running;
    rig.position.y = 0.006 - soleY() + flight;
    group.updateMatrixWorld(true);
    skeleton.update();
  }
  // The original soles sit on y=0. Start in a grounded, relaxed neutral pose.
  animate(0, 0, 0, false);
  return { group, animate, setDrivingPose };
}

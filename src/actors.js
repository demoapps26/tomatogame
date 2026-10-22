import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const palette = {
  skin: 0xc68f70,
  darkSkin: 0x98684e,
  dark: 0x202a28,
  leaf: 0x53644d,
  red: 0xa74532,
  wood: 0x98734c,
  cream: 0xd5c6a5,
  metal: 0x929d9d,
};
const standard = (color, roughness = 0.75, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// Tiny local PBR maps supply cloth weave and tyre/wood grain without asset requests.
function surfaceTexture(kind = "cloth", seed = 17) {
  const size = 64,
    data = new Uint8Array(size * size * 4);
  let n = seed >>> 0;
  const random = () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        grain = random() - 0.5;
      const weave =
        kind === "cloth"
          ? Math.sin(x * Math.PI) * 7 + ((x % 3) - 1) * 7
          : kind === "wood"
            ? Math.sin(y * 0.35 + Math.sin(x * 0.09)) * 14
            : Math.sin(y * 0.8) * 5;
      data[i] = 128 + grain * 13 + weave;
      data[i + 1] =
        128 +
        grain * 13 +
        (kind === "cloth" ? ((y % 3) - 1) * 7 : Math.cos(x * 0.55) * 5);
      data[i + 2] = 250;
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
// Small per-instance albedo/roughness maps break up otherwise perfectly uniform
// surfaces. They stay local and are owned by the instance's materials, just like
// the normal maps, so the scene's existing resource disposal can release them.
function surfaceFinish(kind = "cloth", seed = 1) {
  const size = 64;
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  let value = seed >>> 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = random();
      const broad = Math.sin(x * 0.19 + Math.sin(y * 0.11)) * 0.5 + 0.5;
      const weave = ((x + y) % 3 === 0 ? 1 : 0) * 2;
      const tone =
        kind === "skin"
          ? 247 + grain * 7 - broad * 3
          : kind === "rubber"
            ? 232 + grain * 16 - broad * 5
            : 244 + grain * 8 - broad * 3 - weave;
      colorData[i] = tone;
      colorData[i + 1] = tone - (kind === "skin" ? 1 : 0);
      colorData[i + 2] = tone - (kind === "skin" ? 2 : 0);
      colorData[i + 3] = 255;
      const roughness =
        kind === "skin" ? 211 + grain * 27 : 230 + grain * 23 - broad * 7;
      roughnessData[i] = roughness;
      roughnessData[i + 1] = roughness;
      roughnessData[i + 2] = roughness;
      roughnessData[i + 3] = 255;
    }
  const make = (data, colorSpace = THREE.NoColorSpace) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  return {
    map: make(colorData, THREE.SRGBColorSpace),
    roughnessMap: make(roughnessData),
  };
}
function textile(color, normal, repeat = 3) {
  const material = standard(color, 0.93);
  material.normalMap = normal;
  material.normalScale = new THREE.Vector2(0.12, 0.12);
  // Share maps within one garment/actor, never across separately disposed actors.
  if (!normal.userData.finish) normal.userData.finish = surfaceFinish("cloth");
  Object.assign(material, normal.userData.finish);
  material.map.repeat.set(repeat, repeat);
  material.roughnessMap.repeat.set(repeat, repeat);
  normal.repeat.set(repeat, repeat);
  return material;
}
function mergeDirectMeshes(parent) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geometry = (
      child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry);
    parent.remove(child);
    child.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const combined = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    const object = new THREE.Mesh(combined, material);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
  }
}
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = object.receiveShadow = true;
  parent?.add(object);
  return object;
}
function box(parent, material, x, y, z, sx, sy, sz) {
  return mesh(new THREE.BoxGeometry(sx, sy, sz), material, parent, x, y, z);
}
function rounded(parent, material, x, y, z, sx, sy, sz, radius = 0.035) {
  return mesh(
    new RoundedBoxGeometry(
      sx,
      sy,
      sz,
      2,
      Math.min(radius, sx / 3, sy / 3, sz / 3),
    ),
    material,
    parent,
    x,
    y,
    z,
  );
}
function sphere(
  parent,
  material,
  x,
  y,
  z,
  radius,
  sx = 1,
  sy = 1,
  sz = 1,
  detail = 14,
) {
  const object = mesh(
    new THREE.SphereGeometry(
      radius,
      detail,
      Math.max(7, Math.floor(detail / 2)),
    ),
    material,
    parent,
    x,
    y,
    z,
  );
  object.scale.set(sx, sy, sz);
  return object;
}
function cylinder(
  parent,
  material,
  x,
  y,
  z,
  radiusTop,
  radiusBottom,
  height,
  detail = 14,
) {
  return mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, detail),
    material,
    parent,
    x,
    y,
    z,
  );
}
function capsule(parent, material, x, y, z, radius, length) {
  return mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 5, 12),
    material,
    parent,
    x,
    y,
    z,
  );
}
function beam(parent, material, a, b, radius = 0.022) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const object = cylinder(
    parent,
    material,
    0,
    0,
    0,
    radius,
    radius,
    start.distanceTo(end),
    8,
  );
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.sub(start).normalize(),
  );
  return object;
}

/** World-space tomato, roughly 30 cm across when used as the game projectile. */
export function createTomato(radius = 0.16) {
  const group = new THREE.Group(),
    red = new THREE.MeshPhysicalMaterial({
      color: 0xc84125,
      roughness: 0.32,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
    }),
    underside = standard(0x902b1e, 0.68),
    leaves = standard(0x3e5d34, 0.86);
  sphere(group, red, 0, 0, 0, radius, 1, 0.88, 1, 18);
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    sphere(
      group,
      red,
      Math.sin(angle) * radius * 0.29,
      -radius * 0.015,
      Math.cos(angle) * radius * 0.29,
      radius * 0.7,
      1,
      1.1,
      1,
      12,
    );
    const leaf = mesh(
      new THREE.ConeGeometry(radius * 0.14, radius * 0.7, 3),
      leaves,
      group,
    );
    leaf.position.set(
      Math.sin(angle) * radius * 0.26,
      radius * 0.81,
      Math.cos(angle) * radius * 0.26,
    );
    leaf.rotation.set(Math.cos(angle) * 0.92, angle, -Math.sin(angle) * 0.92);
  }
  cylinder(
    group,
    leaves,
    0,
    radius * 0.98,
    0,
    radius * 0.04,
    radius * 0.065,
    radius * 0.4,
    8,
  ).rotation.z = -0.2;
  sphere(group, underside, 0, -radius * 0.88, 0, radius * 0.09, 1, 0.25, 1, 8);
  mergeDirectMeshes(group);
  return group;
}

/** Rounded human gardener. Ground origin, local +Z forward, approximately 1.85 m tall. */
export function createCharacter({
  enemy = false,
  civilian = false,
  index = 0,
} = {}) {
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);
  const cloth = surfaceTexture("cloth", 31 + index),
    leatherGrain = surfaceTexture("leather", 58 + index);
  const outfits = [0x53675b, 0x5b6873, 0x8a7c64, 0x765b56, 0x4d5c57, 0x7f8775];
  const mainColor = enemy
    ? 0x946743
    : civilian
      ? outfits[Math.abs(index) % outfits.length]
      : 0x465e52;
  const jacket = textile(mainColor, cloth),
    panel = textile(new THREE.Color(mainColor).multiplyScalar(1.12), cloth),
    trousers = textile(
      civilian && index % 3 === 1 ? 0x5f5d53 : 0x303c3c,
      cloth,
    );
  const skins = [0xc18c6b, 0xb17c5c, 0x825842, 0xd1a180, 0xa87d61];
  const skin = standard(
    enemy ? 0xa57455 : skins[Math.abs(index) % skins.length],
    0.78,
  );
  Object.assign(skin, surfaceFinish("skin", 109 + index));
  skin.normalMap = leatherGrain;
  skin.normalScale = new THREE.Vector2(0.035, 0.035);
  const leather = standard(0x322f28, 0.73),
    sole = standard(0x20231f, 0.94),
    seam = standard(0xaaa18b, 0.92),
    metal = standard(0x8e9390, 0.39, 0.65),
    dark = standard(0x252c28, 0.84),
    hair = standard(index % 3 === 0 ? 0x3e3025 : 0x5a4737, 0.96),
    eye = standard(0x302c25, 0.35),
    white = standard(0xc4bdb1, 0.68);
  leather.normalMap = leatherGrain;
  leather.normalScale = new THREE.Vector2(0.12, 0.12);
  const profile = [
    new THREE.Vector2(0, -0.27),
    new THREE.Vector2(0.178, -0.27),
    new THREE.Vector2(0.187, -0.17),
    new THREE.Vector2(0.21, 0.13),
    new THREE.Vector2(0.205, 0.21),
    new THREE.Vector2(0.15, 0.26),
    new THREE.Vector2(0, 0.27),
  ];
  const torso = mesh(
    new THREE.LatheGeometry(profile, 20),
    jacket,
    rig,
    0,
    1.17,
    0,
  );
  torso.scale.z = 0.67;
  // Shoulder volume and collar follow an organic silhouette instead of a box body.
  sphere(rig, jacket, -0.175, 1.37, -0.005, 0.115, 1, 0.88, 0.91);
  sphere(rig, jacket, 0.175, 1.37, -0.005, 0.115, 1, 0.88, 0.91);
  const collarLeft = rounded(
    rig,
    panel,
    -0.065,
    1.421,
    0.108,
    0.105,
    0.145,
    0.028,
    0.009,
  );
  collarLeft.rotation.z = -0.27;
  const collarRight = rounded(
    rig,
    panel,
    0.065,
    1.421,
    0.108,
    0.105,
    0.145,
    0.028,
    0.009,
  );
  collarRight.rotation.z = 0.27;
  rounded(rig, dark, 0, 0.901, 0, 0.365, 0.045, 0.235, 0.014);
  rounded(rig, metal, 0, 0.906, 0.129, 0.046, 0.036, 0.015, 0.004);
  box(rig, metal, 0, 1.184, 0.147, 0.009, 0.37, 0.009);
  for (const side of [-1, 1]) {
    rounded(rig, panel, side * 0.112, 1.13, 0.133, 0.115, 0.16, 0.024, 0.014);
    box(rig, seam, side * 0.112, 1.19, 0.15, 0.112, 0.008, 0.006);
    sphere(rig, metal, side * 0.112, 1.193, 0.157, 0.009, 1, 1, 0.4, 7);
  }
  if (enemy) {
    const reflective = standard(0xc5bd93, 0.68, 0.1);
    box(rig, reflective, 0, 1.09, 0.153, 0.36, 0.023, 0.008);
    for (const side of [-1, 1])
      box(rig, reflective, side * 0.154, 1.3, 0.142, 0.025, 0.19, 0.008);
  }
  cylinder(rig, skin, 0, 1.49, 0, 0.071, 0.08, 0.145, 14);
  const head = new THREE.Group();
  head.scale.set(0.79, 0.76, 0.79);
  head.position.y = 1.665 * (1 - 0.76) + 0.028;
  rig.add(head);
  sphere(head, skin, 0, 1.665, 0.012, 0.157, 0.83, 1.075, 0.91, 20);
  // Brow, cheeks, ears and a small nose remain readable in close third-person views.
  sphere(head, skin, -0.132, 1.66, 0.008, 0.032, 0.55, 1, 0.75, 12);
  sphere(head, skin, 0.132, 1.66, 0.008, 0.032, 0.55, 1, 0.75, 12);
  sphere(head, skin, 0, 1.645, 0.151, 0.029, 0.64, 0.84, 1.08, 12);
  for (const side of [-1, 1]) {
    sphere(head, white, side * 0.054, 1.696, 0.137, 0.024, 1, 0.47, 0.24, 12);
    sphere(head, eye, side * 0.054, 1.696, 0.144, 0.011, 0.82, 1, 0.35, 10);
    const brow = box(
      head,
      hair,
      side * 0.054,
      1.721,
      0.135,
      0.043,
      0.009,
      0.008,
    );
    brow.rotation.z = -side * 0.08;
  }
  rounded(
    head,
    standard(0x86594c, 0.8),
    0,
    1.589,
    0.136,
    0.048,
    0.006,
    0.008,
    0.002,
  );
  sphere(head, hair, 0, 1.786, -0.015, 0.146, 1, 0.29, 0.98, 18);
  if (!civilian || index % 3 === 0) {
    const cap = textile(enemy ? 0x4b483b : 0x526557, cloth);
    sphere(head, cap, 0, 1.801, -0.015, 0.15, 1, 0.34, 1, 18);
    rounded(head, cap, 0, 1.79, 0.13, 0.24, 0.018, 0.2, 0.018).rotation.x =
      0.08;
    box(head, seam, 0, 1.811, 0.124, 0.044, 0.015, 0.012);
  } else if (index % 2 === 1) {
    sphere(head, hair, 0, 1.71, -0.075, 0.13, 1.04, 0.92, 0.56, 16);
  }
  mergeDirectMeshes(head);
  if (!civilian) {
    const pack = standard(0x8f4735, 0.83),
      packPanel = standard(0x783b2c, 0.88);
    pack.normalMap = leatherGrain;
    pack.normalScale = new THREE.Vector2(0.09, 0.09);
    rounded(rig, pack, 0, 1.19, -0.217, 0.32, 0.405, 0.16, 0.045);
    rounded(rig, packPanel, 0, 1.125, -0.309, 0.248, 0.185, 0.035, 0.013);
    for (const side of [-1, 1]) {
      rounded(
        rig,
        dark,
        side * 0.162,
        1.23,
        -0.025,
        0.026,
        0.375,
        0.257,
        0.009,
      );
      box(rig, metal, side * 0.164, 1.08, 0.114, 0.035, 0.04, 0.01);
    }
    rounded(rig, seam, 0, 1.22, -0.312, 0.13, 0.055, 0.008, 0.003);
  }
  const legs = [],
    shins = [],
    arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.112, 0.846, 0);
    rig.add(leg);
    capsule(leg, trousers, 0, -0.187, 0, 0.079, 0.255);
    const shin = new THREE.Group();
    shin.position.set(0, -0.393, 0.003);
    leg.add(shin);
    capsule(shin, trousers, 0, -0.147, 0.005, 0.066, 0.22);
    rounded(shin, leather, 0, -0.339, 0.063, 0.157, 0.113, 0.294, 0.038);
    rounded(shin, sole, 0, -0.391, 0.067, 0.168, 0.024, 0.303, 0.01);
    rounded(leg, panel, side * 0.075, -0.25, 0.012, 0.025, 0.14, 0.095, 0.008);
    for (const part of [leg, shin]) mergeDirectMeshes(part);
    legs.push(leg);
    shins.push(shin);
    const arm = new THREE.Group();
    arm.position.set(side * 0.264, 1.382, 0);
    arm.rotation.z = -side * 0.07;
    rig.add(arm);
    capsule(arm, jacket, 0, -0.125, 0, 0.076, 0.17);
    capsule(arm, jacket, 0, -0.345, 0.01, 0.06, 0.17);
    cylinder(arm, panel, 0, -0.451, 0.01, 0.061, 0.057, 0.036, 12);
    sphere(arm, skin, 0, -0.504, 0.017, 0.058, 0.77, 1.18, 0.73, 14);
    sphere(arm, skin, -side * 0.038, -0.496, 0.048, 0.026, 0.7, 1, 0.75, 10);
    mergeDirectMeshes(arm);
    arms.push(arm);
  }
  mergeDirectMeshes(rig);
  group.name = civilian
    ? `citizen-${index}`
    : enemy
      ? "rival-gardener"
      : "player-gardener";
  return {
    group,
    animate(dt, speed = 0, time = 0, aiming = false) {
      const motion = Math.min(1, Math.abs(speed) / 3.4),
        phase = time * (8.8 + motion * 2),
        swing = Math.sin(phase) * 0.6 * motion,
        blend = 1 - Math.exp(-Math.max(0, dt) * 13);
      legs[0].rotation.x = THREE.MathUtils.lerp(
        legs[0].rotation.x,
        swing,
        blend,
      );
      legs[1].rotation.x = THREE.MathUtils.lerp(
        legs[1].rotation.x,
        -swing,
        blend,
      );
      shins[0].rotation.x = THREE.MathUtils.lerp(
        shins[0].rotation.x,
        Math.max(0, -Math.sin(phase)) * 0.6 * motion,
        blend,
      );
      shins[1].rotation.x = THREE.MathUtils.lerp(
        shins[1].rotation.x,
        Math.max(0, Math.sin(phase)) * 0.6 * motion,
        blend,
      );
      arms[0].rotation.x = THREE.MathUtils.lerp(
        arms[0].rotation.x,
        -swing * 0.65,
        blend,
      );
      arms[1].rotation.x = THREE.MathUtils.lerp(
        arms[1].rotation.x,
        aiming ? -1.25 : swing * 0.65,
        blend,
      );
      arms[1].rotation.z = THREE.MathUtils.lerp(
        arms[1].rotation.z,
        aiming ? -0.22 : -0.07,
        blend,
      );
      rig.position.y = Math.abs(Math.sin(phase)) * 0.018 * motion;
      rig.rotation.z = Math.sin(phase) * 0.012 * motion;
    },
  };
}
export function createPedestrian(index = 0) {
  return createCharacter({ civilian: true, index });
}

function deliveryTexture(plate = false) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = plate ? "#dddcc9" : "#e7deca";
  context.fillRect(0, 0, 512, 256);
  if (plate) {
    context.fillStyle = "#213c54";
    context.fillRect(0, 0, 55, 256);
    context.fillStyle = "#242c29";
    context.font = "bold 85px Arial";
    context.fillText("TR 03 26", 80, 160);
  } else {
    context.fillStyle = "#a74732";
    context.beginPath();
    context.ellipse(73, 117, 43, 37, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#52674b";
    context.beginPath();
    context.moveTo(73, 83);
    context.lineTo(45, 70);
    context.lineTo(69, 77);
    context.lineTo(81, 59);
    context.lineTo(87, 78);
    context.lineTo(108, 77);
    context.closePath();
    context.fill();
    context.fillStyle = "#34473a";
    context.font = "bold 48px Arial";
    context.fillText("RAIZ & SOL", 137, 115);
    context.font = "22px Arial";
    context.fillText("COLHEITAS DE SANTA TOMATA", 140, 156);
    context.fillStyle = "#ad6945";
    context.fillRect(140, 180, 315, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function glassPanel(parent, material, points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

/** Detailed compact delivery pickup, 2.3 × 4.5 m including mirrors, local +Z forward. */
export function createVehicle(color = 0xb14d39) {
  const group = new THREE.Group(),
    body = new THREE.Group();
  group.add(body);
  group.name = "tomato-delivery-pickup";
  const paint = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.31,
      metalness: 0.27,
      clearcoat: 0.72,
      clearcoatRoughness: 0.2,
    }),
    paintDark = standard(
      new THREE.Color(color).multiplyScalar(0.76),
      0.46,
      0.3,
    ),
    rubber = standard(0x242725, 0.94),
    metal = standard(0x9ba3a2, 0.29, 0.82),
    dark = standard(0x28312e, 0.78, 0.12),
    seat = textile(0x414b44, surfaceTexture("cloth", 47)),
    wood = standard(0x92734f, 0.96);
  const grain = surfaceTexture("leather", 72);
  Object.assign(rubber, surfaceFinish("rubber", 83));
  rubber.normalMap = grain;
  rubber.normalScale = new THREE.Vector2(0.22, 0.22);
  wood.normalMap = surfaceTexture("wood", 81);
  wood.normalScale = new THREE.Vector2(0.13, 0.13);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x718787,
    roughness: 0.075,
    metalness: 0.1,
    transparent: true,
    opacity: 0.47,
    // Reflection plus alpha is sufficient at this scale and avoids a separate
    // scene transmission render for every visible fleet/traffic vehicle.
    transmission: 0,
    thickness: 0.035,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const light = new THREE.MeshStandardMaterial({
      color: 0xe4dbbd,
      emissive: 0xf7dc9e,
      emissiveIntensity: 0.7,
      roughness: 0.18,
    }),
    redLight = new THREE.MeshStandardMaterial({
      color: 0x9b3027,
      emissive: 0xc73b26,
      emissiveIntensity: 0.35,
      roughness: 0.25,
    }),
    amber = standard(0xb88237, 0.4);
  rounded(body, dark, 0, 0.35, 0, 1.69, 0.24, 3.99, 0.08);
  rounded(body, paint, 0, 0.685, 0.025, 1.88, 0.46, 4.13, 0.11);
  rounded(body, paint, 0, 1.012, 1.37, 1.83, 0.32, 1.27, 0.13);
  rounded(body, paintDark, 0, 1.176, 1.35, 1.72, 0.023, 1.14, 0.013);
  rounded(body, dark, 0, 0.785, 2.12, 1.81, 0.275, 0.08, 0.035);
  rounded(body, metal, 0, 0.502, 2.17, 1.98, 0.115, 0.14, 0.04);
  rounded(body, metal, 0, 0.502, -2.17, 1.98, 0.115, 0.14, 0.04);
  rounded(body, dark, 0, 0.868, 2.17, 0.92, 0.2, 0.027, 0.024);
  for (let i = -4; i <= 4; i++)
    box(body, metal, i * 0.096, 0.867, 2.19, 0.022, 0.13, 0.008);
  rounded(body, metal, 0, 0.958, 2.194, 0.16, 0.04, 0.01, 0.003);
  for (const side of [-1, 1]) {
    rounded(
      body,
      light,
      side * 0.665,
      0.942,
      2.076,
      0.375,
      0.183,
      0.075,
      0.035,
    );
    rounded(body, amber, side * 0.846, 0.94, 2.075, 0.054, 0.12, 0.079, 0.01);
    rounded(
      body,
      redLight,
      side * 0.791,
      0.859,
      -2.099,
      0.177,
      0.276,
      0.045,
      0.02,
    );
    rounded(
      body,
      metal,
      side * 0.791,
      0.881,
      -2.126,
      0.125,
      0.012,
      0.008,
      0.002,
    );
    rounded(body, paint, side * 0.887, 1.198, -1.13, 0.126, 0.569, 1.86, 0.04);
    rounded(
      body,
      paintDark,
      side * 0.887,
      1.487,
      -1.13,
      0.171,
      0.041,
      1.92,
      0.015,
    );
    for (const z of [-1.34, 1.34]) {
      const arch = mesh(
        new THREE.TorusGeometry(0.439, 0.047, 6, 24, Math.PI),
        paint,
        body,
        side * 0.951,
        0.43,
        z,
      );
      arch.rotation.y = Math.PI / 2;
      rounded(
        body,
        rubber,
        side * 0.911,
        0.36,
        z - 0.43,
        0.11,
        0.38,
        0.08,
        0.012,
      );
    }
    rounded(body, metal, side * 0.93, 0.535, 0.31, 0.12, 0.07, 1.3, 0.016);
  }
  // Bed panels, tie-down points and a real slatted cargo floor.
  rounded(body, wood, 0, 0.949, -1.1, 1.64, 0.075, 1.78, 0.02);
  for (let i = -4; i <= 4; i++)
    box(body, dark, i * 0.18, 0.99, -1.11, 0.008, 0.004, 1.73);
  rounded(body, paint, 0, 1.202, -2.013, 1.77, 0.554, 0.12, 0.045);
  rounded(body, paintDark, 0, 1.484, -2.019, 1.83, 0.048, 0.16, 0.016);
  rounded(body, metal, 0, 1.27, -2.082, 0.26, 0.04, 0.026, 0.008);
  for (const side of [-1, 1])
    for (const z of [-1.8, -0.43])
      rounded(body, metal, side * 0.823, 1.449, z, 0.045, 0.037, 0.08, 0.008);
  rounded(body, paint, 0, 1.227, -0.19, 1.87, 0.63, 0.12, 0.035);
  // Curved roof, recessed glass, painted pillars and panel seams make the cabin credible.
  rounded(body, paint, 0, 1.846, 0.38, 1.81, 0.126, 1.35, 0.06);
  rounded(body, dark, 0, 1.194, 0.34, 1.62, 0.21, 1.04, 0.06);
  for (const side of [-1, 1]) {
    rounded(body, seat, side * 0.42, 1.37, 0.07, 0.55, 0.55, 0.22, 0.07);
    rounded(body, seat, side * 0.42, 1.132, 0.29, 0.57, 0.13, 0.53, 0.04);
    rounded(body, seat, side * 0.42, 1.665, 0.044, 0.25, 0.2, 0.12, 0.035);
    beam(
      body,
      paint,
      [side * 0.85, 1.21, 1.09],
      [side * 0.85, 1.8, 0.75],
      0.045,
    );
    beam(
      body,
      paint,
      [side * 0.85, 1.2, -0.2],
      [side * 0.85, 1.8, -0.2],
      0.043,
    );
    glassPanel(body, glass, [
      [side * 0.877, 1.254, -0.161],
      [side * 0.877, 1.254, 0.983],
      [side * 0.877, 1.77, 0.718],
      [side * 0.877, 1.77, -0.161],
    ]);
    rounded(body, paint, side * 0.894, 1.015, 0.36, 0.055, 0.43, 1.17, 0.015);
    box(body, dark, side * 0.926, 1.115, -0.166, 0.01, 0.72, 0.013);
    rounded(
      body,
      metal,
      side * 0.936,
      1.147,
      -0.035,
      0.022,
      0.036,
      0.18,
      0.009,
    );
    beam(
      body,
      dark,
      [side * 0.88, 1.426, 0.88],
      [side * 1.026, 1.441, 0.935],
      0.026,
    );
    rounded(
      body,
      paintDark,
      side * 1.066,
      1.457,
      0.951,
      0.208,
      0.134,
      0.119,
      0.025,
    );
    rounded(body, glass, side * 1.17, 1.457, 0.951, 0.012, 0.103, 0.09, 0.005);
  }
  glassPanel(body, glass, [
    [-0.8, 1.256, 1.08],
    [0.8, 1.256, 1.08],
    [0.8, 1.775, 0.741],
    [-0.8, 1.775, 0.741],
  ]);
  glassPanel(body, glass, [
    [-0.792, 1.276, -0.212],
    [0.792, 1.276, -0.212],
    [0.792, 1.77, -0.212],
    [-0.792, 1.77, -0.212],
  ]);
  for (const x of [-0.31, 0.31])
    beam(body, dark, [x - 0.18, 1.274, 1.089], [x + 0.13, 1.324, 1.057], 0.008);
  rounded(body, dark, 0, 1.252, 0.833, 1.58, 0.15, 0.29, 0.035);
  const steering = mesh(
    new THREE.TorusGeometry(0.155, 0.019, 6, 18),
    dark,
    body,
    -0.42,
    1.37,
    0.72,
  );
  steering.rotation.x = 0.75;
  cylinder(body, metal, 0, 0.295, 1.34, 0.055, 0.055, 1.6).rotation.z =
    Math.PI / 2;
  cylinder(body, metal, 0, 0.295, -1.34, 0.055, 0.055, 1.6).rotation.z =
    Math.PI / 2;
  const plate = deliveryTexture(true),
    delivery = deliveryTexture(false);
  if (plate) {
    const material = new THREE.MeshStandardMaterial({
      map: plate,
      roughness: 0.68,
    });
    for (const z of [-2.247, 2.247]) {
      const object = mesh(
        new THREE.PlaneGeometry(0.46, 0.16),
        material,
        body,
        0,
        0.66,
        z,
      );
      if (z < 0) object.rotation.y = Math.PI;
    }
  }
  if (delivery) {
    const material = new THREE.MeshStandardMaterial({
      map: delivery,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const label = mesh(
        new THREE.PlaneGeometry(1.08, 0.49),
        material,
        body,
        side * 0.958,
        1.19,
        -1.13,
      );
      label.rotation.y = (side * Math.PI) / 2;
    }
  }
  // Treaded tyres and forged-style rims share materials but each wheel has an independent pivot.
  const wheels = [];
  for (const side of [-1, 1])
    for (const z of [-1.34, 1.34]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.977, 0.425, z);
      group.add(pivot);
      const wheel = new THREE.Group();
      pivot.add(wheel);
      const tire = mesh(
        new THREE.TorusGeometry(0.305, 0.105, 10, 28),
        rubber,
        wheel,
      );
      tire.rotation.y = Math.PI / 2;
      cylinder(wheel, rubber, 0, 0, 0, 0.299, 0.299, 0.21, 24).rotation.z =
        Math.PI / 2;
      cylinder(
        wheel,
        metal,
        side * 0.119,
        0,
        0,
        0.219,
        0.219,
        0.025,
        20,
      ).rotation.z = Math.PI / 2;
      cylinder(
        wheel,
        dark,
        side * 0.137,
        0,
        0,
        0.155,
        0.155,
        0.012,
        20,
      ).rotation.z = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const angle = (i * Math.PI * 2) / 7;
        const spoke = rounded(
          wheel,
          metal,
          side * 0.148,
          Math.sin(angle) * 0.128,
          Math.cos(angle) * 0.128,
          0.018,
          0.033,
          0.139,
          0.009,
        );
        spoke.rotation.x = -angle;
        sphere(
          wheel,
          dark,
          side * 0.162,
          Math.sin(angle) * 0.06,
          Math.cos(angle) * 0.06,
          0.017,
          0.35,
          1,
          1,
          8,
        );
      }
      cylinder(
        wheel,
        metal,
        side * 0.165,
        0,
        0,
        0.052,
        0.052,
        0.02,
        12,
      ).rotation.z = Math.PI / 2;
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI * 2) / 24;
        const tread = box(
          wheel,
          rubber,
          0,
          Math.sin(angle) * 0.41,
          Math.cos(angle) * 0.41,
          0.17,
          0.033,
          0.008,
        );
        tread.rotation.x = -angle;
      }
      mergeDirectMeshes(wheel);
      wheels.push(wheel);
      pivot.userData.front = z > 0;
    }
  for (const [x, z] of [
    [-0.405, -1.21],
    [0.405, -1.21],
  ]) {
    const crate = createPickup();
    crate.scale.setScalar(0.65);
    crate.position.set(x, 0.994, z);
    body.add(crate);
  }
  mergeDirectMeshes(body);
  // Road dust is strongest at the sills and wheel arches, while the roof keeps
  // its clean clearcoat. Vertex colours preserve the existing material batches.
  const dust = new THREE.Color(0xb7a38a);
  for (const object of body.children) {
    if (!object.isMesh || ![paint, paintDark].includes(object.material))
      continue;
    const positions = object.geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const lowerBody = 1 - THREE.MathUtils.smoothstep(y, 0.45, 1.18);
      const streak = 0.5 + 0.5 * Math.sin(x * 17 + Math.sin(z * 8));
      const strength = lowerBody * (0.12 + streak * 0.1);
      colors[i * 3] = THREE.MathUtils.lerp(1, dust.r, strength);
      colors[i * 3 + 1] = THREE.MathUtils.lerp(1, dust.g, strength);
      colors[i * 3 + 2] = THREE.MathUtils.lerp(1, dust.b, strength);
    }
    object.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    object.material.vertexColors = true;
  }
  let oldSpeed = 0,
    bodyTime = 0;
  return {
    group,
    wheels,
    animate(dt, speed = 0, steeringAngle = 0) {
      for (const wheel of wheels) {
        wheel.rotation.x += (speed * dt) / 0.41;
        if (wheel.parent.userData.front)
          wheel.parent.rotation.y = steeringAngle * 0.58;
      }
      bodyTime += dt * Math.abs(speed);
      body.position.y =
        Math.sin(bodyTime * 1.7) * Math.min(0.007, Math.abs(speed) * 0.0006);
      body.rotation.z = THREE.MathUtils.damp(
        body.rotation.z,
        steeringAngle * speed * 0.0032,
        7,
        dt,
      );
      body.rotation.x = THREE.MathUtils.damp(
        body.rotation.x,
        THREE.MathUtils.clamp((speed - oldSpeed) * -0.012, -0.035, 0.035),
        7,
        dt,
      );
      redLight.emissiveIntensity =
        Math.abs(speed) < Math.abs(oldSpeed) - dt ? 1.6 : 0.35;
      oldSpeed = speed;
    },
  };
}

/** Ground-level wooden tomato crate or first-aid case. */
export function createPickup(type = "crate") {
  const group = new THREE.Group();
  if (type === "health") {
    const white = standard(0xe0ddcb, 0.84),
      red = standard(0xa54633, 0.7),
      grey = standard(0x525b52, 0.6, 0.3);
    rounded(group, white, 0, 0.26, 0, 0.55, 0.42, 0.25, 0.035);
    rounded(group, grey, 0, 0.505, 0, 0.23, 0.08, 0.06, 0.012);
    box(group, red, 0, 0.28, 0.131, 0.31, 0.07, 0.015);
    box(group, red, 0, 0.28, 0.132, 0.07, 0.3, 0.016);
    mergeDirectMeshes(group);
    return group;
  }
  const wood = standard(palette.wood, 0.96),
    edges = standard(0x6f543b, 0.98),
    leaf = standard(0x49603a, 0.9),
    red = standard(0xba4028, 0.44);
  wood.normalMap = surfaceTexture("wood", 94);
  wood.normalScale = new THREE.Vector2(0.15, 0.15);
  box(group, edges, 0, 0.045, 0, 0.76, 0.09, 0.6);
  for (const side of [-1, 1]) {
    for (const y of [0.13, 0.24]) {
      box(group, wood, side * 0.35, y, 0, 0.046, 0.085, 0.59);
      box(group, wood, 0, y, side * 0.27, 0.7, 0.085, 0.039);
    }
    for (const end of [-1, 1])
      rounded(
        group,
        edges,
        side * 0.35,
        0.19,
        end * 0.27,
        0.064,
        0.32,
        0.059,
        0.008,
      );
  }
  for (const [x, z] of [
    [-0.2, -0.13],
    [0, -0.13],
    [0.2, -0.13],
    [-0.2, 0.1],
    [0, 0.1],
    [0.2, 0.1],
  ]) {
    sphere(group, red, x, 0.245, z, 0.112, 1, 0.85, 1, 10);
    const top = box(group, leaf, x, 0.34, z, 0.088, 0.012, 0.022);
    top.rotation.y = x * 8;
  }
  mergeDirectMeshes(group);
  return group;
}

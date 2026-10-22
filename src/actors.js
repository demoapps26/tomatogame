import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const palette = {
  skin: 0xd49a73,
  darkSkin: 0xb57b56,
  dark: 0x172c25,
  leaf: 0x4d7542,
  red: 0xd64a32,
  wood: 0x9c7149,
  cream: 0xe4d8b3,
  metal: 0x77817d,
};
const standard = (color, roughness = 0.75, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
// Merge the immobile pieces by material; limbs/wheels keep independent pivots.
function mergeDirectMeshes(parent) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry);
    parent.remove(child);
  }
  for (const [material, geometries] of batches) {
    const combined = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    const object = new THREE.Mesh(combined, material);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
  }
}

function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = object.receiveShadow = true;
  if (parent) parent.add(object);
  return object;
}
function box(parent, material, x, y, z, sx, sy, sz) {
  return mesh(new THREE.BoxGeometry(sx, sy, sz), material, parent, x, y, z);
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
  detail = 12,
) {
  const object = mesh(
    new THREE.SphereGeometry(radius, detail, Math.max(6, detail / 2)),
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
  detail = 12,
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

/** A tomato is centred at the origin; the stem points up. */
export function createTomato(radius = 0.16) {
  const group = new THREE.Group();
  const red = standard(0xe34425, 0.33);
  const underside = standard(0xb82b1c, 0.45);
  const leaves = standard(0x315d30, 0.82);
  sphere(group, red, 0, 0, 0, radius, 1, 0.88, 1, 16);
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    sphere(
      group,
      red,
      Math.sin(angle) * radius * 0.33,
      -radius * 0.015,
      Math.cos(angle) * radius * 0.33,
      radius * 0.69,
      1,
      1.12,
      1,
      10,
    );
    const leaf = mesh(
      new THREE.ConeGeometry(radius * 0.17, radius * 0.63, 3),
      leaves,
      group,
    );
    leaf.position.set(
      Math.sin(angle) * radius * 0.27,
      radius * 0.82,
      Math.cos(angle) * radius * 0.27,
    );
    leaf.rotation.set(Math.cos(angle) * 0.85, angle, -Math.sin(angle) * 0.85);
  }
  cylinder(
    group,
    leaves,
    0,
    radius * 0.95,
    0,
    radius * 0.045,
    radius * 0.07,
    radius * 0.42,
    7,
  ).rotation.z = -0.19;
  sphere(group, underside, 0, -radius * 0.88, 0, radius * 0.12, 1, 0.25, 1, 8);
  mergeDirectMeshes(group);
  return group;
}

/** Human gardener, 1.86 metres tall, facing local +Z. */
export function createCharacter({ enemy = false } = {}) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const jacket = standard(enemy ? 0xc47732 : 0x426354, 0.88);
  const panel = standard(enemy ? 0xe59b43 : 0x5b7b5e, 0.85);
  const trousers = standard(enemy ? 0x354137 : 0x263c3a, 0.93);
  const skin = standard(enemy ? palette.darkSkin : palette.skin, 0.8);
  const boots = standard(0x272f28, 0.82);
  const band = standard(palette.cream, 0.9);
  const dark = standard(palette.dark, 0.8);
  const zip = standard(0xc1bda5, 0.55, 0.3);
  const pack = standard(palette.red, 0.84);
  const glasses = new THREE.MeshStandardMaterial({
    color: 0x263c3b,
    roughness: 0.2,
    metalness: 0.35,
  });
  const glint = standard(0xb3d4bd, 0.23, 0.25);

  // A layered jacket and stitched pockets give the silhouette readable detail.
  box(rig, jacket, 0, 1.15, 0, 0.48, 0.59, 0.28);
  sphere(rig, jacket, 0, 1.43, 0, 0.24, 1, 0.36, 0.65);
  box(rig, panel, -0.135, 1.13, 0.151, 0.16, 0.22, 0.025);
  box(rig, panel, 0.135, 1.13, 0.151, 0.16, 0.22, 0.025);
  box(rig, band, -0.135, 1.2, 0.169, 0.145, 0.015, 0.012);
  box(rig, band, 0.135, 1.2, 0.169, 0.145, 0.015, 0.012);
  box(rig, zip, 0, 1.18, 0.151, 0.017, 0.44, 0.015);
  box(rig, dark, 0, 0.878, 0, 0.45, 0.065, 0.29);
  box(rig, zip, 0, 0.878, 0.15, 0.065, 0.048, 0.018);
  if (enemy) {
    box(rig, band, 0, 1.04, 0.173, 0.46, 0.035, 0.012);
    box(rig, band, -0.17, 1.33, 0.16, 0.04, 0.17, 0.014);
    box(rig, band, 0.17, 1.33, 0.16, 0.04, 0.17, 0.014);
  }

  cylinder(rig, skin, 0, 1.49, 0, 0.08, 0.09, 0.13);
  sphere(rig, skin, 0, 1.65, 0.013, 0.165, 0.84, 1.08, 0.88, 16);
  sphere(rig, skin, -0.142, 1.65, 0.012, 0.04, 0.5, 1, 0.75, 8);
  sphere(rig, skin, 0.142, 1.65, 0.012, 0.04, 0.5, 1, 0.75, 8);
  sphere(rig, skin, 0, 1.62, 0.151, 0.034, 0.75, 0.65, 1, 8);
  box(rig, glasses, 0, 1.69, 0.142, 0.27, 0.057, 0.025);
  box(rig, glint, -0.068, 1.697, 0.157, 0.07, 0.012, 0.007);
  box(rig, glint, 0.066, 1.697, 0.157, 0.07, 0.012, 0.007);
  box(rig, dark, 0, 1.555, 0.132, 0.074, 0.012, 0.012);
  const hat = cylinder(
    rig,
    enemy ? dark : jacket,
    0,
    1.796,
    0,
    0.144,
    0.16,
    0.09,
    16,
  );
  sphere(rig, enemy ? dark : jacket, 0, 1.827, -0.008, 0.15, 1, 0.28, 1, 16);
  const brim = box(
    rig,
    enemy ? dark : jacket,
    0,
    1.779,
    0.124,
    0.26,
    0.018,
    0.23,
  );
  brim.rotation.x = 0.08;
  box(rig, pack, 0, 1.19, -0.215, 0.37, 0.43, 0.19);
  box(rig, standard(0xb83728), 0, 1.15, -0.319, 0.28, 0.21, 0.035);
  const packLeaf = standard(0x3f5d35);
  box(rig, packLeaf, 0, 1.4, -0.23, 0.06, 0.13, 0.04).rotation.z = -0.3;
  box(rig, band, -0.19, 1.22, -0.015, 0.035, 0.43, 0.32);
  box(rig, band, 0.19, 1.22, -0.015, 0.035, 0.43, 0.32);

  const legs = [],
    arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.125, 0.845, 0);
    rig.add(leg);
    cylinder(leg, trousers, 0, -0.195, 0, 0.091, 0.077, 0.39);
    cylinder(leg, trousers, 0, -0.53, 0.006, 0.077, 0.069, 0.3);
    box(leg, boots, 0, -0.745, 0.055, 0.17, 0.135, 0.3);
    box(leg, dark, 0, -0.807, 0.055, 0.18, 0.025, 0.31);
    box(leg, panel, 0, -0.35, 0.071, 0.112, 0.11, 0.022);
    legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 1.39, 0);
    rig.add(arm);
    cylinder(arm, jacket, 0, -0.145, 0, 0.087, 0.072, 0.31);
    cylinder(arm, jacket, 0, -0.37, 0.005, 0.072, 0.063, 0.18);
    cylinder(arm, band, 0, -0.46, 0.005, 0.065, 0.065, 0.045);
    sphere(arm, skin, 0, -0.526, 0.016, 0.073, 0.8, 1.08, 0.9, 10);
    arms.push(arm);
  }
  for (const limb of [...legs, ...arms]) mergeDirectMeshes(limb);
  mergeDirectMeshes(rig);
  group.name = enemy ? "rival-gardener" : "player-gardener";
  return {
    group,
    animate(dt, speed = 0, time = 0, aiming = false) {
      const motion = Math.min(1, Math.abs(speed) / 3.4);
      const phase = time * (9 + motion * 2);
      const swing = Math.sin(phase) * 0.63 * motion;
      const blend = Math.min(1, Math.max(0, dt) * 14);
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
      arms[0].rotation.x = THREE.MathUtils.lerp(
        arms[0].rotation.x,
        -swing * 0.65,
        blend,
      );
      arms[1].rotation.x = THREE.MathUtils.lerp(
        arms[1].rotation.x,
        aiming ? -1.3 : swing * 0.65,
        blend,
      );
      arms[1].rotation.z = THREE.MathUtils.lerp(
        arms[1].rotation.z,
        aiming ? -0.18 : -0.06,
        blend,
      );
      rig.position.y = Math.abs(Math.sin(phase)) * 0.027 * motion;
      rig.rotation.z = Math.sin(phase) * 0.018 * motion;
    },
  };
}

function deliveryTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eee5c8";
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#d24c33";
  ctx.beginPath();
  ctx.ellipse(75, 115, 43, 37, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#49633d";
  ctx.beginPath();
  ctx.moveTo(75, 85);
  ctx.lineTo(47, 71);
  ctx.lineTo(70, 76);
  ctx.lineTo(80, 60);
  ctx.lineTo(89, 79);
  ctx.lineTo(108, 77);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#304638";
  ctx.font = "bold 51px Arial";
  ctx.fillText("POMODORO", 137, 113);
  ctx.font = "22px Arial";
  ctx.fillText("FRESH FROM THE GREENHOUSE", 140, 151);
  ctx.fillStyle = "#ab5534";
  ctx.fillRect(140, 175, 310, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Small delivery pickup; ground-level origin, +Z is forward. */
export function createVehicle(color = 0xc84c34) {
  const group = new THREE.Group();
  group.name = "tomato-delivery-pickup";
  const paint = standard(color, 0.36, 0.35);
  const paintDark = standard(
    new THREE.Color(color).multiplyScalar(0.68),
    0.42,
    0.25,
  );
  const rubber = standard(0x202621, 0.93);
  const metal = standard(0xa5ada8, 0.32, 0.7);
  const dark = standard(0x25332e, 0.64, 0.15);
  const bedWood = standard(0x92714c, 0.9);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x7eaaa5,
    roughness: 0.17,
    metalness: 0.28,
    transparent: true,
    opacity: 0.72,
  });
  const light = new THREE.MeshStandardMaterial({
    color: 0xffedb8,
    emissive: 0xffcf77,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });
  const redLight = new THREE.MeshStandardMaterial({
    color: 0xb3261e,
    emissive: 0xe02c1e,
    emissiveIntensity: 0.4,
    roughness: 0.25,
  });
  const tireGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.25, 18);
  const rimGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.263, 12);
  box(group, dark, 0, 0.39, 0, 1.65, 0.23, 3.95);
  box(group, paint, 0, 0.7, 0, 1.9, 0.45, 4.1);
  box(group, paint, 0, 1.0, 1.33, 1.85, 0.35, 1.25);
  box(group, paintDark, 0, 1.19, 1.35, 1.81, 0.045, 1.2);
  box(group, paint, 0, 0.8, 2.08, 1.92, 0.2, 0.13);
  box(group, dark, 0, 0.85, 2.16, 0.94, 0.23, 0.025);
  for (let i = -3; i <= 3; i++)
    box(group, metal, i * 0.12, 0.85, 2.177, 0.025, 0.16, 0.014);
  box(group, metal, 0, 0.51, 2.15, 2.03, 0.13, 0.14);
  box(group, metal, 0, 0.51, -2.13, 2.03, 0.12, 0.13);
  for (const side of [-1, 1]) {
    box(group, light, side * 0.69, 0.92, 2.11, 0.37, 0.2, 0.048);
    box(group, redLight, side * 0.77, 0.8, -2.11, 0.22, 0.24, 0.04);
    box(group, paint, side * 0.88, 1.2, -1.1, 0.13, 0.6, 1.85);
    box(group, paintDark, side * 0.88, 1.5, -1.1, 0.17, 0.05, 1.9);
  }
  // Open bed, slatted floor, and load of tomato crates.
  box(group, bedWood, 0, 0.96, -1.1, 1.65, 0.1, 1.82);
  for (let i = -3; i <= 3; i++)
    box(group, dark, i * 0.21, 1.016, -1.1, 0.012, 0.008, 1.78);
  box(group, paint, 0, 1.2, -2, 1.78, 0.56, 0.14);
  box(group, paintDark, 0, 1.48, -2, 1.86, 0.06, 0.18);
  box(group, paint, 0, 1.22, -0.16, 1.89, 0.64, 0.13);
  // Cab pillars and angled windscreen.
  box(group, paint, 0, 1.84, 0.46, 1.83, 0.12, 1.32);
  box(group, dark, 0, 1.26, 0.3, 1.65, 0.27, 1.1);
  box(group, dark, -0.43, 1.46, 0.1, 0.57, 0.54, 0.2);
  box(group, dark, 0.43, 1.46, 0.1, 0.57, 0.54, 0.2);
  const windshield = box(group, glass, 0, 1.5, 1.02, 1.67, 0.6, 0.035);
  windshield.rotation.x = 0.22;
  box(group, glass, 0, 1.53, -0.18, 1.65, 0.49, 0.025);
  for (const side of [-1, 1]) {
    box(group, paint, side * 0.86, 1.5, 0.97, 0.09, 0.65, 0.08).rotation.x =
      0.22;
    box(group, paint, side * 0.86, 1.51, -0.15, 0.09, 0.6, 0.08);
    box(group, glass, side * 0.884, 1.54, 0.41, 0.025, 0.48, 0.94);
    box(group, paint, side * 0.89, 1.02, 0.42, 0.06, 0.48, 1.05);
    box(group, metal, side * 0.935, 1.12, 0.08, 0.04, 0.045, 0.15);
    box(group, dark, side * 1.04, 1.45, 0.92, 0.28, 0.12, 0.08);
    box(group, glass, side * 1.18, 1.45, 0.91, 0.02, 0.1, 0.1);
    box(group, metal, side * 0.94, 1.24, 0.4, 0.035, 0.04, 1.1);
  }
  const steering = cylinder(group, dark, 0.42, 1.35, 0.8, 0.18, 0.18, 0.04, 12);
  steering.rotation.x = Math.PI * 0.35;
  box(group, metal, 0, 0.63, 2.23, 0.45, 0.15, 0.012);
  box(group, metal, 0, 0.65, -2.21, 0.45, 0.15, 0.012);
  const delivery = deliveryTexture();
  if (delivery) {
    const sticker = new THREE.MeshStandardMaterial({
      map: delivery,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const label = mesh(
        new THREE.PlaneGeometry(0.95, 0.47),
        sticker,
        group,
        side * 0.956,
        1.15,
        -1.12,
      );
      label.rotation.y = (side * Math.PI) / 2;
    }
  }
  // Reuse one material and geometry for four wheel assemblies.
  const wheels = [];
  for (const side of [-1, 1])
    for (const z of [-1.37, 1.35]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.99, 0.44, z);
      group.add(pivot);
      const wheel = new THREE.Group();
      pivot.add(wheel);
      const tire = mesh(tireGeo, rubber, wheel);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(rimGeo, metal, wheel);
      rim.rotation.z = Math.PI / 2;
      cylinder(
        wheel,
        dark,
        side * 0.14,
        0,
        0,
        0.085,
        0.085,
        0.02,
        10,
      ).rotation.z = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        const bolt = sphere(
          wheel,
          dark,
          side * 0.139,
          Math.sin(a) * 0.14,
          Math.cos(a) * 0.14,
          0.024,
          0.35,
          1,
          1,
          6,
        );
        bolt.castShadow = false;
      }
      mergeDirectMeshes(wheel);
      wheels.push(wheel);
      pivot.userData.front = z > 0;
    }
  for (const [x, z] of [
    [-0.41, -1.23],
    [0.42, -1.23],
  ]) {
    const crate = createPickup();
    crate.scale.setScalar(0.65);
    crate.position.set(x, 1.02, z);
    group.add(crate);
  }
  mergeDirectMeshes(group);
  return {
    group,
    wheels,
    animate(dt, speed = 0, steering = 0) {
      for (const wheel of wheels) {
        wheel.rotation.x += (speed * dt) / 0.39;
        if (wheel.parent.userData.front)
          wheel.parent.rotation.y = steering * 0.38;
      }
    },
  };
}

/** Ground-level supply crate or first-aid case. */
export function createPickup(type = "crate") {
  const group = new THREE.Group();
  if (type === "health") {
    const white = standard(0xeee8d5, 0.8),
      red = standard(0xc94630, 0.65),
      grey = standard(0x525b52, 0.6, 0.3);
    box(group, white, 0, 0.26, 0, 0.55, 0.42, 0.25);
    box(group, grey, 0, 0.505, 0, 0.23, 0.08, 0.06);
    box(group, red, 0, 0.28, 0.131, 0.31, 0.07, 0.015);
    box(group, red, 0, 0.28, 0.132, 0.07, 0.3, 0.016);
    mergeDirectMeshes(group);
    return group;
  }
  const wood = standard(palette.wood, 0.92),
    edges = standard(0x745435, 0.95),
    leaf = standard(0x41613b, 0.9),
    red = standard(0xce452b, 0.45);
  box(group, edges, 0, 0.045, 0, 0.76, 0.09, 0.6);
  for (const side of [-1, 1]) {
    box(group, wood, side * 0.35, 0.19, 0, 0.055, 0.24, 0.59);
    box(group, wood, 0, 0.19, side * 0.27, 0.7, 0.24, 0.045);
    for (const end of [-1, 1])
      box(group, edges, side * 0.35, 0.19, end * 0.27, 0.07, 0.32, 0.065);
  }
  for (const [x, z] of [
    [-0.2, -0.13],
    [0, -0.13],
    [0.2, -0.13],
    [-0.2, 0.1],
    [0, 0.1],
    [0.2, 0.1],
  ]) {
    sphere(group, red, x, 0.25, z, 0.115, 1, 0.85, 1, 8);
    const top = box(group, leaf, x, 0.35, z, 0.095, 0.015, 0.025);
    top.rotation.y = x * 8;
  }
  mergeDirectMeshes(group);
  return group;
}

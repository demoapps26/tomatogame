import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createVehicle } from "./actors.js";
import { createPhotoTextures } from "./photo-assets.js";
import { createDetailedSportVehicle } from "./vehicle-asset.js";

/** Model geometry metadata. Purchase prices and driving stats live in ownership.js. */
export const PASSENGER_MODELS = Object.freeze({
  compact: Object.freeze({
    name: "Citadino",
    width: 2.17,
    length: 4.01,
    height: 1.56,
    color: 0x648a96,
  }),
  pickup: Object.freeze({
    name: "Pick-up agrícola",
    width: 2.36,
    length: 4.5,
    height: 1.9,
    color: 0x8c573e,
  }),
  van: Object.freeze({
    name: "Comercial",
    width: 2.38,
    length: 5.27,
    height: 2.34,
    color: 0xd6d0bd,
  }),
  sport: Object.freeze({
    name: "Coupé",
    width: 2.27,
    length: 4.51,
    height: 1.32,
    color: 0x9d3430,
  }),
  suv: Object.freeze({
    name: "Todo-o-terreno",
    width: 2.38,
    length: 4.89,
    height: 2.0,
    color: 0x405e52,
  }),
});

const CONFIG = {
  compact: {
    half: 0.875,
    nose: 1.94,
    tail: -1.94,
    wheelbase: 2.53,
    radius: 0.355,
    axleY: 0.37,
    bottom: 0.34,
    belt: 1.0,
    roof: 1.5,
    roofHalf: 0.69,
    roofFront: 0.29,
    roofRear: -0.84,
    screenFront: 0.99,
    screenRear: -1.67,
    hood: 1.02,
    seatZ: -0.05,
    seats: 4,
    spokes: 6,
  },
  van: {
    half: 0.98,
    nose: 2.56,
    tail: -2.56,
    wheelbase: 3.18,
    radius: 0.398,
    axleY: 0.415,
    bottom: 0.4,
    belt: 1.2,
    roof: 2.28,
    roofHalf: 0.9,
    roofFront: 1.05,
    roofRear: -2.29,
    screenFront: 1.89,
    screenRear: -2.43,
    hood: 1.14,
    seatZ: 0.75,
    seats: 2,
    spokes: 7,
  },
  sport: {
    half: 0.925,
    nose: 2.17,
    tail: -2.17,
    wheelbase: 2.68,
    radius: 0.347,
    axleY: 0.36,
    bottom: 0.28,
    belt: 0.85,
    roof: 1.26,
    roofHalf: 0.655,
    roofFront: 0.22,
    roofRear: -0.64,
    screenFront: 1.03,
    screenRear: -1.55,
    hood: 0.84,
    seatZ: -0.28,
    seats: 2,
    spokes: 5,
  },
  suv: {
    half: 0.98,
    nose: 2.37,
    tail: -2.37,
    wheelbase: 2.84,
    radius: 0.435,
    axleY: 0.45,
    bottom: 0.43,
    belt: 1.16,
    roof: 1.83,
    roofHalf: 0.79,
    roofFront: 0.57,
    roofRear: -1.5,
    screenFront: 1.28,
    screenRear: -2.13,
    hood: 1.11,
    seatZ: 0.16,
    seats: 4,
    spokes: 8,
  },
};

const standard = (color, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = !material.transparent;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function rounded(
  parent,
  material,
  x,
  y,
  z,
  width,
  height,
  depth,
  radius = 0.035,
) {
  return part(
    parent,
    new RoundedBoxGeometry(
      width,
      height,
      depth,
      2,
      Math.min(radius, width / 3, height / 3, depth / 3),
    ),
    material,
    x,
    y,
    z,
  );
}
function box(parent, material, x, y, z, width, height, depth) {
  return part(
    parent,
    new THREE.BoxGeometry(width, height, depth),
    material,
    x,
    y,
    z,
  );
}
function beam(parent, material, a, b, radius = 0.012) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const object = part(
    parent,
    new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 7),
    material,
  );
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.sub(start).normalize(),
  );
  return object;
}
function panel(parent, material, vertices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices.flat(), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return part(parent, geometry, material);
}
function mergeParts(parent) {
  const batches = new Map();
  for (const object of [...parent.children]) {
    if (!object.isMesh || Array.isArray(object.material)) continue;
    object.updateMatrix();
    const geometry = (
      object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()
    ).applyMatrix4(object.matrix);
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry);
    parent.remove(object);
    object.geometry.dispose();
  }
  for (const [material, items] of batches) {
    const geometry = mergeGeometries(items, false);
    items.forEach((item) => item.dispose());
    part(parent, geometry, material);
  }
}

/** A continuous eight-sided hull, avoiding an assembly of floating body cubes. */
function hull(parent, material, config, profiles) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let section = 0; section < profiles.length; section++) {
    const [z, width, top] = profiles[section],
      low = config.bottom,
      bevel = 0.075;
    for (const [x, y] of [
      [-width + bevel, low],
      [width - bevel, low],
      [width, low + bevel],
      [width, top - bevel],
      [width - bevel, top],
      [-width + bevel, top],
      [-width, top - bevel],
      [-width, low + bevel],
    ]) {
      positions.push(x, y, z);
      uvs.push(
        (x / config.half + 1) * 0.5,
        (z - config.tail) / (config.nose - config.tail),
      );
    }
    if (section)
      for (let side = 0; side < 8; side++) {
        const previous = (section - 1) * 8 + side,
          next = (section - 1) * 8 + ((side + 1) % 8),
          now = section * 8 + side,
          nowNext = section * 8 + ((side + 1) % 8);
        indices.push(previous, next, now, next, nowNext, now);
      }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i);
  const last = (profiles.length - 1) * 8;
  for (let i = 1; i < 7; i++) indices.push(last, last + i, last + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return part(parent, geometry, material);
}
function tyreNormal() {
  const size = 64,
    bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      bytes[i] = 128 + Math.round(Math.sin(y * 0.85 + x * 0.25) * 8);
      bytes[i + 1] = 128 + Math.round(Math.cos(x * 0.6) * 8);
      bytes[i + 2] = 250;
      bytes[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
function registration(modelId) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e2e2d5";
  context.fillRect(0, 0, 512, 160);
  context.fillStyle = "#304f77";
  context.fillRect(0, 0, 48, 160);
  context.fillStyle = "#eeeccf";
  context.font = "bold 30px Arial";
  context.fillText("P", 15, 125);
  context.fillStyle = "#202a2c";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 75px Arial";
  context.fillText(
    {
      compact: "ST 26 AC",
      van: "ST 26 VN",
      sport: "ST 26 GT",
      suv: "ST 26 XR",
    }[modelId] || "ST 26 TR",
    282,
    82,
    420,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function wheel(parent, config, side, z, materials) {
  const pivot = new THREE.Group(),
    rotating = new THREE.Group();
  pivot.position.set(side * (config.half + 0.015), config.axleY, z);
  pivot.userData.front = z > 0;
  parent.add(pivot);
  pivot.add(rotating);
  const tire = part(
    rotating,
    new THREE.TorusGeometry(config.radius - 0.085, 0.085, 10, 30),
    materials.rubber,
  );
  tire.rotation.y = Math.PI / 2;
  const sidewall = part(
    rotating,
    new THREE.CylinderGeometry(
      config.radius - 0.065,
      config.radius - 0.065,
      0.2,
      28,
    ),
    materials.rubber,
  );
  sidewall.rotation.z = Math.PI / 2;
  for (let i = 0; i < 26; i++) {
    const angle = (i * Math.PI * 2) / 26;
    const tread = box(
      rotating,
      materials.rubber,
      0,
      Math.sin(angle) * (config.radius - 0.002),
      Math.cos(angle) * (config.radius - 0.002),
      0.15,
      0.026,
      0.009,
    );
    tread.rotation.x = -angle;
  }
  const disk = part(
    rotating,
    new THREE.CylinderGeometry(
      config.radius * 0.59,
      config.radius * 0.59,
      0.03,
      24,
    ),
    materials.dark,
    side * 0.125,
  );
  disk.rotation.z = Math.PI / 2;
  const lip = part(
    rotating,
    new THREE.TorusGeometry(config.radius * 0.61, 0.019, 6, 26),
    materials.alloy,
    side * 0.15,
  );
  lip.rotation.y = Math.PI / 2;
  for (let i = 0; i < config.spokes; i++) {
    const angle = (i * Math.PI * 2) / config.spokes;
    const spoke = rounded(
      rotating,
      materials.alloy,
      side * 0.158,
      Math.sin(angle) * config.radius * 0.3,
      Math.cos(angle) * config.radius * 0.3,
      0.025,
      0.036,
      config.radius * 0.61,
      0.009,
    );
    spoke.rotation.x = -angle;
  }
  const hub = part(
    rotating,
    new THREE.CylinderGeometry(0.055, 0.055, 0.024, 12),
    materials.alloy,
    side * 0.174,
  );
  hub.rotation.z = Math.PI / 2;
  mergeParts(rotating);
  return rotating;
}

/** Five separately designed silhouettes. Every instance owns its render resources. */
export function createPassengerVehicle(modelId = "compact", color) {
  if (!PASSENGER_MODELS[modelId]) modelId = "compact";
  const metadata = PASSENGER_MODELS[modelId];
  const selectedColor =
    color === undefined || color === null ? metadata.color : color;
  if (modelId === "sport") return createDetailedSportVehicle(selectedColor);
  if (modelId === "pickup") {
    const pickup = createVehicle(selectedColor);
    pickup.modelId = modelId;
    pickup.bounds = {
      width: metadata.width,
      length: metadata.length,
      height: metadata.height,
    };
    pickup.group.name = "owned-pickup";
    return pickup;
  }
  const c = CONFIG[modelId],
    group = new THREE.Group(),
    body = new THREE.Group();
  group.name = `owned-${modelId}`;
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({
    color: selectedColor,
    roughness: 0.245,
    metalness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    ior: 1.5,
    specularIntensity: 0.72,
  });
  const paintDark = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(selectedColor).multiplyScalar(0.72),
    roughness: 0.3,
    metalness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
  });
  const trim = standard(0x202825, 0.82, 0.12),
    dark = standard(0x19221f, 0.76, 0.05),
    alloy = standard(modelId === "sport" ? 0x69716e : 0xaeb4ae, 0.23, 0.88),
    rubber = standard(0x252824, 0.93);
  rubber.normalMap = tyreNormal();
  rubber.normalScale = new THREE.Vector2(0.19, 0.19);
  const seat = standard(modelId === "sport" ? 0x4f3c35 : 0x414b44, 0.93);
  Object.assign(seat, createPhotoTextures("cloth", 3, 3));
  seat.normalScale = new THREE.Vector2(0.16, 0.16);
  seat.color.multiplyScalar(1.8);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x96aba9,
    roughness: 0.04,
    metalness: 0,
    ior: 1.5,
    specularIntensity: 1,
    transparent: true,
    opacity: modelId === "van" ? 0.62 : 0.48,
    depthWrite: false,
    transmission: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 1.15,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xe1e3d8,
    roughness: 0.19,
    emissive: 0xf5e9d0,
    emissiveIntensity: 0.09,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xa32f29,
    roughness: 0.28,
    emissive: 0xc02f22,
    emissiveIntensity: 0.06,
  });
  const amber = standard(0xba8b43, 0.42, 0.1);
  const mats = { rubber, dark, alloy };
  const lowTop =
    modelId === "sport"
      ? 0.78
      : modelId === "van"
        ? 1.15
        : modelId === "suv"
          ? 1.09
          : 0.96;
  hull(body, paint, c, [
    [c.tail, 0.8 * c.half, lowTop - 0.025],
    [Math.min(c.tail + 0.15, c.screenRear - 0.08), c.half * 0.97, lowTop],
    [c.screenRear, c.half, c.belt],
    [0, c.half, c.belt],
    [c.screenFront, c.half * 0.99, c.hood],
    [c.nose - 0.18, c.half * 0.95, c.hood - 0.02],
    [c.nose, c.half * 0.81, c.hood - 0.035],
  ]);
  rounded(
    body,
    dark,
    0,
    c.bottom - 0.04,
    0,
    c.half * 1.78,
    0.17,
    (c.nose - c.tail) * 0.92,
    0.05,
  );
  rounded(
    body,
    modelId === "sport" ? paintDark : paint,
    0,
    c.hood - 0.001,
    (c.screenFront + c.nose - 0.14) / 2,
    c.half * 1.78,
    0.026,
    c.nose - c.screenFront - 0.14,
    0.01,
  );
  rounded(
    body,
    paint,
    0,
    c.roof + 0.015,
    (c.roofFront + c.roofRear) / 2,
    c.roofHalf * 2 + 0.08,
    0.095,
    c.roofFront - c.roofRear + 0.14,
    0.046,
  );

  // The glass follows sloping A/C pillars rather than floating on an opaque cab.
  const lowerW = c.half - 0.065,
    upperW = c.roofHalf;
  panel(body, glass, [
    [-lowerW, c.belt + 0.04, c.screenFront],
    [lowerW, c.belt + 0.04, c.screenFront],
    [upperW, c.roof - 0.035, c.roofFront],
    [-upperW, c.roof - 0.035, c.roofFront],
  ]);
  const sideRear = modelId === "van" ? -0.03 : c.screenRear;
  for (const side of [-1, 1]) {
    const x = side * lowerW,
      topX = side * upperW;
    panel(body, glass, [
      [x, c.belt + 0.045, sideRear],
      [x, c.belt + 0.045, c.screenFront - 0.04],
      [topX, c.roof - 0.04, c.roofFront - 0.01],
      [topX, c.roof - 0.04, modelId === "van" ? -0.03 : c.roofRear + 0.03],
    ]);
    beam(
      body,
      paintDark,
      [x, c.belt + 0.02, c.screenFront],
      [topX, c.roof, c.roofFront],
      0.039,
    );
    beam(
      body,
      trim,
      [x, c.belt + 0.02, c.screenFront - 0.045],
      [topX, c.roof - 0.035, c.roofFront - 0.045],
      0.012,
    );
    const rearBase = modelId === "van" ? -0.03 : c.screenRear;
    const rearTop = modelId === "van" ? -0.03 : c.roofRear;
    beam(
      body,
      paintDark,
      [x, c.belt + 0.02, rearBase],
      [topX, c.roof, rearTop],
      modelId === "sport" ? 0.055 : 0.045,
    );
    beam(
      body,
      trim,
      [x, c.belt + 0.025, sideRear],
      [x, c.belt + 0.025, c.screenFront],
      0.014,
    );
    beam(
      body,
      trim,
      [topX, c.roof - 0.045, rearTop],
      [topX, c.roof - 0.045, c.roofFront],
      0.011,
    );
    if (modelId === "compact" || modelId === "suv") {
      const pillarZ = modelId === "suv" ? -0.38 : -0.2;
      beam(
        body,
        paintDark,
        [x, c.belt + 0.03, pillarZ],
        [topX, c.roof, pillarZ],
        0.034,
      );
      box(
        body,
        trim,
        side * (c.half + 0.004),
        c.belt - 0.26,
        pillarZ,
        0.012,
        0.49,
        0.012,
      );
      rounded(
        body,
        alloy,
        side * (c.half + 0.017),
        c.belt - 0.055,
        pillarZ - 0.25,
        0.026,
        0.037,
        0.18,
        0.01,
      );
    }
    const frontDoorRear =
      modelId === "van" ? 0.02 : modelId === "sport" ? -0.78 : -0.2;
    box(
      body,
      trim,
      side * (c.half + 0.007),
      c.belt - 0.26,
      frontDoorRear,
      0.012,
      0.48,
      0.012,
    );
    rounded(
      body,
      alloy,
      side * (c.half + 0.021),
      c.belt - 0.055,
      frontDoorRear + 0.17,
      0.027,
      0.037,
      0.18,
      0.009,
    );
    rounded(
      body,
      paintDark,
      side * (c.half + 0.022),
      c.bottom + 0.025,
      0,
      0.06,
      0.1,
      c.wheelbase - 0.65,
      0.025,
    );
    beam(
      body,
      trim,
      [side * (c.half - 0.02), c.belt + 0.14, c.screenFront - 0.15],
      [side * (c.half + 0.05), c.belt + 0.15, c.screenFront - 0.1],
      0.022,
    );
    rounded(
      body,
      paintDark,
      side * (c.half + 0.07),
      c.belt + 0.16,
      c.screenFront - 0.1,
      0.18,
      0.13,
      0.19,
      0.035,
    );
    rounded(
      body,
      glass,
      side * (c.half + 0.164),
      c.belt + 0.16,
      c.screenFront - 0.11,
      0.009,
      0.096,
      0.14,
      0.004,
    );
    for (const z of [-c.wheelbase / 2, c.wheelbase / 2]) {
      const arch = part(
        body,
        new THREE.TorusGeometry(c.radius + 0.026, 0.028, 6, 26, Math.PI),
        modelId === "suv" ? trim : paintDark,
        side * (c.half + 0.021),
        c.axleY + 0.012,
        z,
      );
      arch.rotation.y = Math.PI / 2;
      rounded(
        body,
        trim,
        side * (c.half + 0.01),
        c.axleY - 0.09,
        z - c.radius - 0.02,
        0.07,
        0.26,
        0.075,
        0.012,
      );
    }
  }
  if (modelId !== "van") {
    panel(body, glass, [
      [-lowerW, c.belt + 0.035, c.screenRear],
      [lowerW, c.belt + 0.035, c.screenRear],
      [upperW, c.roof - 0.045, c.roofRear],
      [-upperW, c.roof - 0.045, c.roofRear],
    ]);
    for (const side of [-1, 1])
      beam(
        body,
        trim,
        [side * lowerW, c.belt + 0.02, c.screenRear],
        [side * upperW, c.roof - 0.04, c.roofRear],
        0.014,
      );
    beam(
      body,
      trim,
      [-lowerW, c.belt + 0.025, c.screenRear],
      [lowerW, c.belt + 0.025, c.screenRear],
      0.018,
    );
  }
  beam(
    body,
    trim,
    [-lowerW, c.belt + 0.025, c.screenFront],
    [lowerW, c.belt + 0.025, c.screenFront],
    0.018,
  );
  beam(
    body,
    trim,
    [-upperW, c.roof - 0.035, c.roofFront],
    [upperW, c.roof - 0.035, c.roofFront],
    0.013,
  );
  for (const x of [-0.29, 0.29])
    beam(
      body,
      trim,
      [x - 0.19, c.belt + 0.045, c.screenFront + 0.008],
      [x + 0.13, c.belt + 0.095, c.screenFront - 0.04],
      0.008,
    );

  // Occupied-looking cabin, visible through genuinely transparent windows.
  const baseY =
    modelId === "sport"
      ? 0.57
      : modelId === "van"
        ? 0.88
        : modelId === "suv"
          ? 0.86
          : 0.73;
  rounded(
    body,
    dark,
    0,
    baseY - 0.11,
    (c.roofFront + c.roofRear) / 2,
    c.half * 1.69,
    0.12,
    c.roofFront - c.roofRear + 0.7,
    0.035,
  );
  for (const side of [-1, 1]) {
    const seatX = side * (c.half * 0.47);
    rounded(body, seat, seatX, baseY, c.seatZ, 0.53, 0.14, 0.52, 0.055);
    rounded(
      body,
      seat,
      seatX,
      baseY + 0.27,
      c.seatZ - 0.25,
      0.5,
      0.47,
      0.17,
      0.06,
    ).rotation.x = -0.1;
    rounded(
      body,
      seat,
      seatX,
      baseY + 0.58,
      c.seatZ - 0.26,
      0.25,
      0.17,
      0.12,
      0.035,
    );
    if (c.seats === 4) {
      rounded(
        body,
        seat,
        seatX,
        baseY,
        c.seatZ - 0.95,
        0.53,
        0.14,
        0.52,
        0.045,
      );
      rounded(
        body,
        seat,
        seatX,
        baseY + 0.26,
        c.seatZ - 1.2,
        0.52,
        0.43,
        0.17,
        0.05,
      );
      rounded(
        body,
        seat,
        seatX,
        baseY + 0.54,
        c.seatZ - 1.2,
        0.23,
        0.15,
        0.12,
        0.025,
      );
    }
  }
  rounded(
    body,
    dark,
    0,
    c.belt + 0.02,
    c.screenFront - 0.12,
    c.half * 1.7,
    0.16,
    0.34,
    0.04,
  );
  const steering = part(
    body,
    new THREE.TorusGeometry(0.14, 0.017, 6, 20),
    trim,
    -c.half * 0.45,
    c.belt + 0.1,
    c.screenFront - 0.36,
  );
  steering.rotation.x = 0.78;
  beam(
    body,
    alloy,
    [-c.half * 0.45, c.belt + 0.1, c.screenFront - 0.36],
    [-c.half * 0.45, c.belt + 0.06, c.screenFront - 0.2],
    0.027,
  );
  rounded(
    body,
    trim,
    0,
    c.belt + 0.07,
    c.screenFront - 0.23,
    0.22,
    0.11,
    0.06,
    0.014,
  );

  // Different commercial, utility and sporting roof/rear treatments.
  if (modelId === "van") {
    for (const side of [-1, 1]) {
      rounded(body, paint, side * 0.945, 1.71, -1.16, 0.1, 1.05, 2.34, 0.07);
      rounded(
        body,
        paintDark,
        side * 0.998,
        1.72,
        -1.17,
        0.014,
        0.73,
        1.94,
        0.006,
      );
      for (const z of [-2.25, -0.07])
        box(body, trim, side * 1.003, 1.48, z, 0.012, 1.17, 0.012);
      box(body, trim, side * 1.009, 1.1, -1.18, 0.013, 0.022, 2.18);
      rounded(body, alloy, side * 1.025, 1.46, -0.24, 0.03, 0.045, 0.2, 0.012);
      box(body, trim, side * 1.009, 0.91, -1.18, 0.018, 0.035, 2.21);
    }
    rounded(body, paint, 0, 1.69, -2.47, 1.85, 1.08, 0.12, 0.045);
    box(body, trim, 0, 1.66, -2.537, 0.015, 1.05, 0.012);
    for (const side of [-1, 1]) {
      rounded(body, glass, side * 0.48, 1.92, -2.538, 0.67, 0.39, 0.014, 0.027);
      rounded(body, trim, side * 0.16, 1.4, -2.547, 0.15, 0.035, 0.019, 0.009);
      for (const y of [1.18, 2.08])
        rounded(body, alloy, side * 0.91, y, -2.54, 0.06, 0.09, 0.025, 0.012);
    }
  } else if (modelId === "suv") {
    for (const side of [-1, 1]) {
      beam(
        body,
        trim,
        [side * 0.67, c.roof + 0.14, -1.28],
        [side * 0.67, c.roof + 0.14, 0.31],
        0.035,
      );
      for (const z of [-1.2, 0.2])
        beam(
          body,
          trim,
          [side * 0.67, c.roof + 0.03, z],
          [side * 0.67, c.roof + 0.14, z],
          0.029,
        );
    }
    for (const z of [-0.91, -0.12])
      rounded(body, alloy, 0, c.roof + 0.135, z, 1.38, 0.035, 0.065, 0.01);
    rounded(body, paint, 0, 1.2, -2.31, 1.76, 0.45, 0.12, 0.035);
    rounded(body, trim, 0, 0.62, -2.4, 1.85, 0.13, 0.1, 0.025);
    rounded(body, alloy, 0, 0.51, -2.43, 0.32, 0.05, 0.04, 0.012);
  } else if (modelId === "sport") {
    rounded(body, paintDark, 0, 0.94, -1.91, 1.62, 0.055, 0.21, 0.026);
    for (const side of [-1, 1])
      beam(
        body,
        trim,
        [side * 0.58, 0.84, -1.92],
        [side * 0.58, 0.94, -1.92],
        0.018,
      );
    rounded(body, trim, 0, 0.36, c.nose - 0.06, 1.78, 0.075, 0.27, 0.028);
    for (const side of [-1, 1]) {
      for (const x of [0.55, 0.64]) {
        const exhaust = part(
          body,
          new THREE.CylinderGeometry(0.047, 0.047, 0.15, 14),
          alloy,
          side * x,
          0.4,
          c.tail - 0.013,
        );
        exhaust.rotation.x = Math.PI / 2;
      }
    }
  } else {
    rounded(body, paint, 0, 1.1, c.tail + 0.1, 1.58, 0.12, 0.16, 0.04);
    rounded(
      body,
      trim,
      0,
      c.belt + 0.13,
      c.screenRear - 0.027,
      0.37,
      0.02,
      0.02,
      0.005,
    );
  }

  // Front and rear faces, with lenses, grille vanes and registration plates.
  const frontY = c.hood - 0.22,
    rearY = modelId === "van" ? 0.88 : c.belt - 0.18;
  rounded(
    body,
    trim,
    0,
    c.bottom + 0.17,
    c.nose - 0.01,
    c.half * 1.87,
    0.21,
    0.1,
    0.027,
  );
  rounded(
    body,
    paintDark,
    0,
    c.bottom + 0.07,
    c.tail + 0.005,
    c.half * 1.88,
    0.2,
    0.12,
    0.035,
  );
  rounded(
    body,
    dark,
    0,
    frontY,
    c.nose + 0.015,
    c.half * 0.9,
    0.16,
    0.024,
    0.02,
  );
  for (let index = -4; index <= 4; index++)
    box(
      body,
      alloy,
      index * 0.075,
      frontY,
      c.nose + 0.032,
      0.013,
      0.105,
      0.007,
    );
  for (const side of [-1, 1]) {
    const lampX = side * c.half * 0.7;
    rounded(
      body,
      white,
      lampX,
      c.hood - 0.105,
      c.nose - 0.035,
      c.half * 0.47,
      modelId === "sport" ? 0.075 : 0.14,
      0.1,
      0.028,
    );
    rounded(
      body,
      amber,
      side * c.half * 0.9,
      c.hood - 0.105,
      c.nose - 0.038,
      0.044,
      0.1,
      0.104,
      0.01,
    );
    rounded(
      body,
      red,
      side * c.half * 0.81,
      rearY,
      c.tail + 0.005,
      modelId === "van" ? 0.15 : 0.26,
      modelId === "van" ? 0.38 : 0.13,
      0.065,
      0.024,
    );
    rounded(
      body,
      white,
      side * c.half * 0.72,
      rearY - 0.043,
      c.tail - 0.034,
      0.08,
      0.028,
      0.012,
      0.005,
    );
    rounded(
      body,
      alloy,
      side * 0.53,
      c.bottom + 0.03,
      c.tail - 0.025,
      0.1,
      0.065,
      0.05,
      0.015,
    );
  }
  const plateTexture = registration(modelId);
  if (plateTexture) {
    const plateMaterial = new THREE.MeshStandardMaterial({
      map: plateTexture,
      roughness: 0.65,
    });
    for (const [z, y] of [
      [c.nose + 0.057, c.bottom + 0.15],
      [c.tail - 0.062, modelId === "van" ? 1.05 : c.bottom + 0.22],
    ]) {
      const plate = part(
        body,
        new THREE.PlaneGeometry(0.46, 0.145),
        plateMaterial,
        0,
        y,
        z,
      );
      if (z < 0) plate.rotation.y = Math.PI;
    }
  }
  const wheels = [];
  for (const side of [-1, 1])
    for (const z of [-c.wheelbase / 2, c.wheelbase / 2])
      wheels.push(wheel(group, c, side, z, mats));
  mergeParts(body);
  let oldSpeed = 0,
    rolling = 0,
    condition = 100,
    headlights = false;
  const originalColor = paint.color.clone(),
    originalDark = paintDark.color.clone(),
    dust = new THREE.Color(0x9b8e74);
  return {
    group,
    wheels,
    modelId,
    bounds: {
      width: metadata.width,
      length: metadata.length,
      height: metadata.height,
    },
    setCondition(value = 100) {
      condition = THREE.MathUtils.clamp(Number(value) || 0, 0, 100);
      const wear = (100 - condition) / 100;
      paint.roughness = 0.245 + wear * 0.22;
      paintDark.roughness = 0.3 + wear * 0.18;
      paint.color.copy(originalColor).lerp(dust, wear * 0.09);
      paintDark.color.copy(originalDark).lerp(dust, wear * 0.09);
    },
    setLights(enabled) {
      headlights = !!enabled;
      white.emissiveIntensity = headlights ? 1.6 : 0.09;
      red.emissiveIntensity = headlights ? 0.24 : 0.06;
    },
    animate(dt, speed = 0, steeringAngle = 0) {
      const seconds = Math.max(0, Math.min(0.2, Number(dt) || 0)),
        velocity = Number.isFinite(Number(speed)) ? Number(speed) : 0,
        steer = THREE.MathUtils.clamp(Number(steeringAngle) || 0, -1, 1);
      for (const tire of wheels) {
        tire.rotation.x += (velocity * seconds) / c.radius;
        if (tire.parent.userData.front) tire.parent.rotation.y = steer * 0.62;
      }
      rolling += seconds * Math.abs(velocity);
      body.position.y =
        Math.sin(rolling * 1.8) * Math.min(0.008, Math.abs(velocity) * 0.00055);
      body.rotation.z = THREE.MathUtils.damp(
        body.rotation.z,
        steer * velocity * 0.0028,
        7,
        seconds,
      );
      body.rotation.x = THREE.MathUtils.damp(
        body.rotation.x,
        THREE.MathUtils.clamp((velocity - oldSpeed) * -0.01, -0.025, 0.025),
        7,
        seconds,
      );
      red.emissiveIntensity =
        Math.abs(velocity) < Math.abs(oldSpeed) - seconds
          ? 1.2
          : headlights
            ? 0.24
            : 0.06;
      oldSpeed = velocity;
    },
  };
}

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createPhotoTextures } from "./photo-assets.js";
import { createScannedHead } from "./scanned-head.js";

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const material = (color, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
function add(parent, geometry, surface, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(x, y, z);
  object.castShadow = !surface.transparent;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function ball(parent, surface, x, y, z, rx, ry, rz, detail = 16) {
  const geometry = new THREE.SphereGeometry(1, detail, Math.max(8, detail / 2));
  geometry.scale(rx, ry, rz);
  return add(parent, geometry, surface, x, y, z);
}
function roundBox(
  parent,
  surface,
  x,
  y,
  z,
  width,
  height,
  depth,
  radius = 0.012,
) {
  return add(
    parent,
    new RoundedBoxGeometry(
      width,
      height,
      depth,
      2,
      Math.min(radius, width / 3, height / 3, depth / 3),
    ),
    surface,
    x,
    y,
    z,
  );
}
function line(parent, surface, points, radius = 0.0014) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
  );
  return add(
    parent,
    new THREE.TubeGeometry(
      curve,
      Math.max(8, points.length * 3),
      radius,
      5,
      false,
    ),
    surface,
  );
}
function grain(seed, strength = 6) {
  const pixels = new Uint8Array(64 * 64 * 4);
  let value = seed >>> 0;
  for (let index = 0; index < pixels.length; index += 4) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    pixels[index] = 128 + ((value >>> 24) / 255 - 0.5) * strength;
    pixels[index + 1] = 128 + (((value >>> 16) & 255) / 255 - 0.5) * strength;
    pixels[index + 2] = 255;
    pixels[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
function cloth(color, maps) {
  const surface = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    sheen: 0.16,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color(color).multiplyScalar(0.65),
  });
  Object.assign(surface, maps);
  // The neutral scan is a midtone. This compensation preserves the chosen dye.
  surface.color.multiplyScalar(2.1);
  surface.color.r = Math.min(1, surface.color.r);
  surface.color.g = Math.min(1, surface.color.g);
  surface.color.b = Math.min(1, surface.color.b);
  surface.normalScale.set(0.11, 0.11);
  return surface;
}

/** Elliptic cross sections with shallow sewn-fabric folds, in physical metres. */
function loft(rings, segments = 24, folds = 0, caps = false) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let row = 0; row < rings.length; row++) {
    const [y, rx, rz, centerZ = 0] = rings[row];
    const length = TAU * Math.sqrt((rx * rx + rz * rz) / 2);
    for (let column = 0; column <= segments; column++) {
      const angle = (column / segments) * TAU;
      const wrinkle =
        folds *
        (Math.sin(angle * 5 + y * 43) * 0.55 +
          Math.sin(angle * 9 - y * 64) * 0.28);
      positions.push(
        Math.sin(angle) * (rx + wrinkle),
        y,
        centerZ + Math.cos(angle) * (rz + wrinkle),
      );
      uvs.push(((column / segments) * length) / 0.19, y / 0.19);
      if (row < rings.length - 1 && column < segments) {
        const a = row * (segments + 1) + column,
          b = a + segments + 1;
        if (rings[1][0] > rings[0][0])
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  if (caps) {
    for (const row of [0, rings.length - 1]) {
      const start = row * (segments + 1);
      const center = positions.length / 3;
      positions.push(0, rings[row][0], rings[row][3] || 0);
      uvs.push(0.5, 0.5);
      for (let column = 0; column < segments; column++) {
        if ((row === 0) === rings[1][0] > rings[0][0])
          indices.push(center, start + column + 1, start + column);
        else indices.push(center, start + column, start + column + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const TORSO = [
  [0.925, 0.181, 0.121],
  [0.942, 0.187, 0.125],
  [0.96, 0.186, 0.123],
  [0.988, 0.18, 0.119],
  [1.025, 0.182, 0.122],
  [1.065, 0.19, 0.13],
  [1.105, 0.201, 0.136],
  [1.15, 0.211, 0.14],
  [1.195, 0.216, 0.143],
  [1.24, 0.218, 0.142],
  [1.28, 0.217, 0.138],
  [1.32, 0.216, 0.133],
  [1.35, 0.209, 0.127],
  [1.38, 0.221, 0.117],
  [1.405, 0.208, 0.098],
  [1.425, 0.155, 0.08],
  [1.442, 0.086, 0.063],
];
function frontZ(x, y, extra = 0) {
  let a = TORSO[0],
    b = TORSO.at(-1);
  for (let index = 0; index < TORSO.length - 1; index++) {
    if (y >= TORSO[index][0] && y <= TORSO[index + 1][0]) {
      a = TORSO[index];
      b = TORSO[index + 1];
      break;
    }
  }
  const t = THREE.MathUtils.clamp(
    (y - a[0]) / Math.max(0.001, b[0] - a[0]),
    0,
    1,
  );
  const rx = THREE.MathUtils.lerp(a[1], b[1], t),
    rz = THREE.MathUtils.lerp(a[2], b[2], t);
  return rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2)) + extra;
}
function patch(
  parent,
  surface,
  centerX,
  centerY,
  width,
  height,
  extra = 0.004,
) {
  const points = [],
    uvs = [],
    indices = [],
    columns = 6,
    rows = 8;
  for (let row = 0; row <= rows; row++) {
    const y = centerY + (row / rows - 0.5) * height;
    for (let column = 0; column <= columns; column++) {
      const x = centerX + (column / columns - 0.5) * width;
      points.push(
        x,
        y,
        frontZ(x, y, extra + Math.sin((column / columns) * Math.PI) * 0.0015),
      );
      uvs.push(x / 0.19, y / 0.19);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column,
          b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return add(parent, geometry, surface);
}
function pocket(parent, surface, stitching, x) {
  patch(parent, surface, x, 1.184, 0.083, 0.108);
  patch(parent, surface, x, 1.232, 0.089, 0.021, 0.006);
  const points = [
    [x - 0.039, 1.231],
    [x - 0.039, 1.141],
    [x, 1.134],
    [x + 0.039, 1.141],
    [x + 0.039, 1.231],
  ];
  line(
    parent,
    stitching,
    points.map(([px, py]) => [px, py, frontZ(px, py, 0.007)]),
    0.0009,
  );
}
function lapel(parent, surface, side) {
  const points = [
    [side * 0.017, 1.447],
    [side * 0.073, 1.444],
    [side * 0.103, 1.411],
    [side * 0.071, 1.368],
    [side * 0.036, 1.408],
  ];
  const positions = points.flatMap(([x, y]) => [x, y, frontZ(x, y, 0.005)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      points.flatMap(([x, y]) => [x / 0.19, y / 0.19]),
      2,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  geometry.computeVertexNormals();
  if (side === 1) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const value = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = value;
    }
    geometry.computeVertexNormals();
  }
  return add(parent, geometry, surface);
}
function merge(parent) {
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
  for (const [surface, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((value) => value.dispose());
    add(parent, geometry, surface);
  }
}
function hairCap(parent, head, surface, index) {
  const geometry = head.geometry.clone(),
    positions = geometry.attributes.position,
    indexBuffer = geometry.index;
  const retained = [];
  const hairline = (i) => {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const lineY =
      1.645 +
      Math.max(0, z + 0.02) * 0.64 +
      Math.abs(x) * 0.11 +
      (index % 2) * 0.009;
    return y > lineY;
  };
  for (let i = 0; i < indexBuffer.count; i += 3) {
    const a = indexBuffer.getX(i),
      b = indexBuffer.getX(i + 1),
      c = indexBuffer.getX(i + 2);
    if (hairline(a) && hairline(b) && hairline(c)) retained.push(a, b, c);
  }
  geometry.setIndex(retained);
  for (let i = 0; i < positions.count; i++)
    positions.setXYZ(
      i,
      positions.getX(i) * 1.012,
      1.65 + (positions.getY(i) - 1.65) * 1.009,
      -0.02 + (positions.getZ(i) + 0.02) * 1.012,
    );
  geometry.computeVertexNormals();
  return add(parent, geometry, surface);
}
function shoeGeometry() {
  const rings = [
    [-0.109, 0.045, 0.063, 0.038],
    [-0.089, 0.061, 0.067, 0.046],
    [-0.04, 0.068, 0.075, 0.058],
    [0.02, 0.071, 0.069, 0.047],
    [0.085, 0.073, 0.06, 0.034],
    [0.145, 0.068, 0.047, 0.023],
    [0.177, 0.044, 0.041, 0.016],
    [0.186, 0.012, 0.04, 0.008],
  ];
  const vertices = [],
    uvs = [],
    indices = [],
    segments = 20;
  for (let row = 0; row < rings.length; row++) {
    const [z, rx, cy, ry] = rings[row];
    for (let column = 0; column <= segments; column++) {
      const angle = (column / segments) * TAU;
      vertices.push(
        Math.sin(angle) * rx,
        Math.max(0.022, cy + Math.cos(angle) * ry) - 0.09,
        z,
      );
      uvs.push((column / segments) * 2, z * 5);
      if (row < rings.length - 1 && column < segments) {
        const a = row * (segments + 1) + column,
          b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  for (const row of [0, rings.length - 1]) {
    const [z, , cy] = rings[row],
      center = vertices.length / 3;
    vertices.push(0, cy - 0.09, z);
    uvs.push(0.5, 0.5);
    const start = row * (segments + 1);
    for (let column = 0; column < segments; column++) {
      if (row === 0) indices.push(center, start + column, start + column + 1);
      else indices.push(center, start + column + 1, start + column);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Grounded, tailored 1.80 m character. Each actor owns all of its GPU resources. */
export function createDetailedCharacter({
  enemy = false,
  civilian = false,
  index = 0,
} = {}) {
  index = Math.trunc(finite(index));
  const group = new THREE.Group(),
    rig = new THREE.Group(),
    body = new THREE.Group();
  group.add(rig);
  rig.add(body);
  const shortSleeves = civilian && Math.abs(index) % 4 === 1;
  const shirt = civilian && Math.abs(index) % 3 === 2;
  const tones = [0x44554b, 0x6b7277, 0x8b8778, 0x716253, 0x3d515b, 0x75645c];
  const mainColor = enemy
    ? 0x816b4f
    : civilian
      ? tones[Math.abs(index) % tones.length]
      : 0x43564a;
  const garmentMaps = createPhotoTextures("cloth"),
    trouserMaps = createPhotoTextures("cloth");
  const jacket = cloth(mainColor, garmentMaps),
    panel = cloth(new THREE.Color(mainColor).multiplyScalar(1.09), garmentMaps);
  const trousers = cloth(
    civilian && index % 3 === 1 ? 0x3d4850 : 0x293739,
    trouserMaps,
  );
  const stitch = material(
      new THREE.Color(mainColor).multiplyScalar(1.35),
      0.98,
    ),
    pantStitch = trousers;
  const dark = material(0x222a25, 0.9),
    metal = shortSleeves ? null : material(0x969b92, 0.34, 0.72);
  const skinTones = [0xb98b70, 0xaa7e62, 0x8d6b50, 0xc1967d, 0xa37e64];
  const skin = new THREE.MeshPhysicalMaterial({
    color: skinTones[Math.abs(index) % skinTones.length],
    roughness: 0.68,
    ior: 1.4,
    specularIntensity: 0.24,
  });
  skin.normalMap = grain(61 + index, 5);
  skin.normalScale.set(0.1, 0.1);
  const leather = material(civilian ? 0x343733 : 0x3d362d, 0.78),
    sole = material(0x252924, 0.95),
    shoeTrim = material(0x62655d, 0.85);
  leather.normalMap = grain(121 + index, 11);
  leather.normalScale.set(0.14, 0.14);
  const hair =
    civilian && index % 3 !== 0
      ? material(index % 3 === 1 ? 0x62513d : 0x342e26, 0.96)
      : null;
  if (hair) {
    hair.normalMap = grain(243 + index, 32);
    hair.normalScale.set(0.16, 0.16);
  }

  // A complete shoulder-to-waist shell replaces the old stack of balls/capsules.
  add(body, loft(TORSO, 32, 0.004, false), jacket);
  add(
    body,
    loft(
      [
        [0.878, 0.165, 0.11],
        [0.91, 0.179, 0.12],
        [0.945, 0.181, 0.12],
        [0.971, 0.176, 0.118],
      ],
      24,
      0.0012,
    ),
    trousers,
  );
  const collar = loft(
    [
      [1.429, 0.087, 0.063],
      [1.438, 0.091, 0.066],
      [1.453, 0.086, 0.061],
    ],
    24,
    0,
    false,
  );
  add(body, collar, panel);
  for (const side of [-1, 1]) {
    if (!shortSleeves) lapel(body, panel, side);
    const points = [
      [side * 0.085, 1.433],
      [side * 0.141, 1.4],
      [side * 0.187, 1.35],
      [side * 0.211, 1.294],
    ];
    line(
      body,
      stitch,
      points.map(([x, y]) => [x, y, frontZ(x, y, 0.0025)]),
      0.001,
    );
    if (!shortSleeves) pocket(body, panel, stitch, side * 0.101);
  }
  const placket = [];
  for (let y = 0.95; y <= 1.411; y += 0.035)
    placket.push([0, y, frontZ(0, y, 0.003)]);
  line(body, dark, placket, shortSleeves ? 0.0012 : 0.0021);
  if (!shortSleeves) {
    for (let y = 0.98; y < 1.39; y += shirt ? 0.073 : 0.017) {
      const z = frontZ(0, y, 0.005);
      if (shirt) ball(body, metal, 0, y, z, 0.0037, 0.0037, 0.0017, 8);
      else roundBox(body, metal, 0, y, z, 0.006, 0.0022, 0.0015, 0.0005);
    }
    if (!shirt)
      roundBox(
        body,
        metal,
        0.005,
        1.318,
        frontZ(0, 1.318, 0.009),
        0.01,
        0.018,
        0.004,
        0.0015,
      ).rotation.z = 0.1;
  }
  // Thin, draped hem; the waist is not a rigid oversized belt block.
  add(
    body,
    loft(
      [
        [0.926, 0.183, 0.123],
        [0.936, 0.187, 0.126],
        [0.941, 0.186, 0.125],
      ],
      32,
      0.0015,
      false,
    ),
    panel,
  );
  const head = createScannedHead({ index: enemy ? index + 2 : index });
  body.add(head);
  if (civilian && index % 3 !== 0) hairCap(body, head, hair, index);
  else {
    const cap = cloth(enemy ? 0x4a493f : 0x4b5d4f, garmentMaps);
    // Crown sections follow the actual photographed scalp; no floating dome.
    add(
      body,
      loft(
        [
          [1.728, 0.085, 0.109, -0.002],
          [1.738, 0.085, 0.108, -0.002],
          [1.75, 0.081, 0.102, -0.001],
          [1.765, 0.075, 0.095, 0],
          [1.778, 0.064, 0.081, 0.001],
          [1.79, 0.048, 0.064, 0.001],
          [1.799, 0.028, 0.038, 0.001],
          [1.807, 0.002, 0.003, 0.001],
        ],
        32,
        0.00025,
        false,
      ),
      cap,
    );
    add(
      body,
      loft(
        [
          [1.726, 0.086, 0.11, -0.002],
          [1.734, 0.086, 0.11, -0.002],
          [1.739, 0.085, 0.108, -0.002],
        ],
        32,
        0,
        false,
      ),
      cap,
    );
    const brim = roundBox(
      body,
      cap,
      0,
      1.731,
      0.133,
      0.177,
      0.008,
      0.126,
      0.012,
    );
    brim.rotation.x = 0.05;
    line(
      body,
      stitch,
      [
        [-0.078, 1.732, 0.096],
        [0, 1.731, 0.192],
        [0.078, 1.732, 0.096],
      ],
      0.001,
    );
  }
  if (!civilian) {
    const pack = cloth(enemy ? 0x625346 : 0x795343, garmentMaps),
      packPanel = cloth(enemy ? 0x53483e : 0x654537, garmentMaps);
    roundBox(body, pack, 0, 1.196, -0.183, 0.275, 0.345, 0.105, 0.037);
    roundBox(body, packPanel, 0, 1.118, -0.241, 0.209, 0.135, 0.019, 0.01);
    for (const side of [-1, 1]) {
      line(
        body,
        dark,
        [
          [side * 0.134, 1.032, -0.102],
          [side * 0.159, 1.233, -0.13],
          [side * 0.145, 1.372, -0.048],
          [side * 0.129, 1.323, 0.112],
          [side * 0.14, 1.08, 0.106],
        ],
        0.011,
      );
      roundBox(
        body,
        metal,
        side * 0.142,
        1.075,
        0.115,
        0.023,
        0.026,
        0.006,
        0.002,
      );
    }
    line(
      body,
      stitch,
      [
        [-0.1, 1.2, -0.24],
        [0, 1.202, -0.242],
        [0.1, 1.2, -0.24],
      ],
      0.0014,
    );
    if (enemy) {
      const reflective = material(0xbfb99a, 0.7, 0.1);
      patch(body, reflective, 0, 1.086, 0.354, 0.012, 0.006);
    }
  }
  const legs = [],
    shins = [],
    feet = [],
    arms = [],
    elbows = [],
    hands = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.102, 0.895, 0);
    rig.add(leg);
    add(
      leg,
      loft(
        [
          [0, 0.092, 0.103],
          [-0.04, 0.091, 0.103],
          [-0.115, 0.086, 0.096],
          [-0.2, 0.079, 0.086],
          [-0.29, 0.074, 0.076],
          [-0.36, 0.068, 0.066],
          [-0.422, 0.064, 0.061],
        ],
        22,
        0.0021,
      ),
      trousers,
    );
    line(
      leg,
      pantStitch,
      [
        [side * 0.089, -0.04, -0.005],
        [side * 0.082, -0.16, -0.002],
        [side * 0.072, -0.3, 0.002],
        [side * 0.064, -0.41, 0.003],
      ],
      0.0008,
    );
    const shin = new THREE.Group();
    shin.position.set(0, -0.414, 0.003);
    leg.add(shin);
    add(
      shin,
      loft(
        [
          [0.015, 0.066, 0.063],
          [-0.025, 0.067, 0.061],
          [-0.07, 0.068, 0.064],
          [-0.13, 0.065, 0.067],
          [-0.2, 0.058, 0.061],
          [-0.27, 0.051, 0.054],
          [-0.32, 0.049, 0.053],
          [-0.353, 0.051, 0.055],
        ],
        22,
        0.0019,
      ),
      trousers,
    );
    line(
      shin,
      pantStitch,
      [
        [side * 0.065, -0.03, 0],
        [side * 0.065, -0.12, 0.002],
        [side * 0.055, -0.24, 0.002],
        [side * 0.05, -0.34, 0.003],
      ],
      0.0008,
    );
    // Two small folds pool naturally at the boot rather than a capsule end cap.
    add(
      shin,
      loft(
        [
          [-0.311, 0.05, 0.054],
          [-0.326, 0.054, 0.058],
          [-0.339, 0.05, 0.055],
          [-0.35, 0.051, 0.055],
        ],
        22,
        0.0015,
        false,
      ),
      trousers,
    );
    const foot = new THREE.Group();
    foot.position.set(0, -0.391, 0.006);
    shin.add(foot);
    add(foot, shoeGeometry(), leather);
    roundBox(foot, sole, 0, -0.079, 0.036, 0.147, 0.022, 0.291, 0.009);
    roundBox(foot, shoeTrim, 0, -0.065, 0.034, 0.145, 0.006, 0.286, 0.002);
    for (let lace = 0; lace < 4; lace++)
      line(
        foot,
        shoeTrim,
        [
          [-0.039, 0.029 - lace * 0.006, -0.018 + lace * 0.022],
          [0, 0.037 - lace * 0.006, -0.004 + lace * 0.022],
          [0.039, 0.029 - lace * 0.006, -0.018 + lace * 0.022],
        ],
        0.0014,
      );
    for (const part of [foot, shin, leg]) merge(part);
    legs.push(leg);
    shins.push(shin);
    feet.push(foot);

    const arm = new THREE.Group();
    arm.position.set(side * 0.233, 1.363, -0.002);
    arm.rotation.z = -side * 0.063;
    body.add(arm);
    const upper = [
      [0.043, 0.002, 0.003],
      [0.033, 0.035, 0.038],
      [0.014, 0.058, 0.063],
      [-0.012, 0.071, 0.073],
      [-0.035, 0.074, 0.075],
      [-0.09, 0.072, 0.073],
      [-0.15, 0.066, 0.067],
      [-0.21, 0.06, 0.061],
      [-0.264, 0.054, 0.055],
      [-0.291, 0.052, 0.053],
    ];
    if (shortSleeves) {
      add(arm, loft(upper.slice(0, 7), 22, 0.0014), jacket);
      add(
        arm,
        loft(
          [
            [-0.145, 0.054, 0.056],
            [-0.2, 0.051, 0.052],
            [-0.284, 0.046, 0.048],
          ],
          20,
          0.0004,
        ),
        skin,
      );
      add(
        arm,
        loft(
          [
            [-0.135, 0.067, 0.068],
            [-0.149, 0.068, 0.068],
            [-0.16, 0.066, 0.067],
          ],
          22,
          0,
          false,
        ),
        panel,
      );
    } else add(arm, loft(upper, 22, 0.0018), jacket);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.278, 0);
    elbow.rotation.x = -0.12;
    arm.add(elbow);
    const forearm = [
      [0.014, 0.05, 0.052],
      [-0.025, 0.052, 0.054],
      [-0.065, 0.053, 0.053],
      [-0.105, 0.049, 0.05],
      [-0.145, 0.044, 0.045],
      [-0.18, 0.039, 0.041],
      [-0.217, 0.036, 0.039],
    ];
    add(
      elbow,
      loft(forearm, 22, shortSleeves ? 0.0004 : 0.0019),
      shortSleeves ? skin : jacket,
    );
    if (!shortSleeves) {
      add(
        elbow,
        loft(
          [
            [-0.194, 0.04, 0.042],
            [-0.211, 0.038, 0.04],
            [-0.225, 0.036, 0.038],
          ],
          22,
          0,
          false,
        ),
        panel,
      );
      line(
        elbow,
        jacket,
        [
          [side * 0.047, -0.04, 0.02],
          [side * 0.045, -0.105, 0.019],
          [side * 0.036, -0.19, 0.019],
        ],
        0.0008,
      );
      ball(
        elbow,
        metal,
        side * 0.037,
        -0.212,
        0.014,
        0.0035,
        0.0035,
        0.0016,
        8,
      );
    }
    const beforeHand = new Set(elbow.children);
    add(
      elbow,
      loft(
        [
          [-0.209, 0.03, 0.025],
          [-0.231, 0.029, 0.025],
          [-0.246, 0.028, 0.022],
        ],
        18,
        0,
      ),
      skin,
    );
    ball(elbow, skin, 0, -0.263, 0.006, 0.034, 0.036, 0.018, 18);
    ball(elbow, skin, -side * 0.022, -0.266, 0.015, 0.015, 0.024, 0.019, 14);
    for (let finger = 0; finger < 4; finger++) {
      const length = [0.041, 0.055, 0.052, 0.037][finger],
        x = (finger - 1.5) * 0.0175;
      const digit = add(
        elbow,
        loft(
          [
            [0, 0.0076, 0.0077],
            [-length * 0.45, 0.007, 0.0073],
            [-length, 0.005, 0.006],
          ],
          12,
          0,
        ),
        skin,
        x,
        -0.29,
        0.007,
      );
      digit.rotation.x = -0.16 - Math.abs(finger - 1.5) * 0.055;
      ball(
        elbow,
        skin,
        x,
        -0.29 - length,
        0.007 + length * 0.2,
        0.0052,
        0.0065,
        0.006,
        10,
      );
    }
    const thumb = add(
      elbow,
      loft(
        [
          [0, 0.011, 0.011],
          [-0.027, 0.01, 0.01],
          [-0.047, 0.006, 0.006],
        ],
        12,
        0,
      ),
      skin,
      -side * 0.031,
      -0.253,
      0.022,
    );
    thumb.rotation.set(-0.47, 0, side * 0.5);
    // Adult arm proportions: about 31 cm upper arm and 24 cm forearm.
    // The shoulder sits higher than the earlier mannequin body, so preserve
    // the hand's natural resting height at the upper thigh.
    for (const item of arm.children) {
      if (!item.isMesh) continue;
      const p = item.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < -0.05)
          p.setY(
            i,
            y - THREE.MathUtils.clamp((-y - 0.05) / 0.241, 0, 1) * 0.028,
          );
      }
      item.geometry.computeVertexNormals();
    }
    elbow.position.y -= 0.028;
    for (const item of elbow.children) {
      if (!item.isMesh) continue;
      const p = item.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < -0.1)
          p.setY(
            i,
            y - THREE.MathUtils.clamp((-y - 0.1) / 0.115, 0, 1) * 0.018,
          );
      }
      item.geometry.computeVertexNormals();
    }
    // Keep a wrist pivot so seated palms can face the wheel rather than the sky.
    const hand = new THREE.Group();
    hand.name = side < 0 ? "left-wrist" : "right-wrist";
    hand.position.set(0, -0.25, 0.006);
    for (const item of [...elbow.children]) {
      if (beforeHand.has(item)) continue;
      elbow.remove(item);
      hand.add(item);
      item.position.sub(hand.position);
    }
    elbow.add(hand);
    for (const part of [hand, elbow, arm]) merge(part);
    arms.push(arm);
    elbows.push(elbow);
    hands.push(hand);
  }
  // Lift the fitted shoulder/collar to the base of the scanned neck. The scan's
  // facial shape stays untouched; only the garment/arm attachment follows it.
  const clothRise = (y) => Math.max(0, Math.min(1, (y - 1.12) / 0.32)) * 0.046;
  for (const item of body.children) {
    if (item.isMesh && item !== head && item.material !== hair) {
      const positions = item.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i) + item.position.y;
        if (y < 1.57) positions.setY(i, positions.getY(i) + clothRise(y));
      }
      item.geometry.computeVertexNormals();
    }
  }
  for (const arm of arms) arm.position.y += 0.046;
  for (const foot of feet) foot.scale.x = 0.82;
  merge(body);
  group.name = civilian
    ? `citizen-${index}`
    : enemy
      ? "rival-gardener"
      : "player-gardener";
  group.userData.characterDetail = "tailored-human-v7";
  const armRestPositions = arms.map((arm) => arm.position.clone());
  let drivingPose = false;
  return {
    group,
    setDrivingPose(steering = 0) {
      const turn = THREE.MathUtils.clamp(finite(steering), -0.7, 0.7);
      drivingPose = true;
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      // A low driving seat has raised knees and feet extended to the pedals.
      // This keeps a scaled driver above the road rather than dangling below it.
      for (let index = 0; index < legs.length; index++) {
        const side = index === 0 ? -1 : 1;
        legs[index].rotation.set(-1.78, side * 0.035, 0);
        shins[index].rotation.set(0.98, 0, 0);
        feet[index].rotation.set(0.8, 0, 0);
        arms[index].position.copy(armRestPositions[index]);
        arms[index].position.x = side * 0.205;
        // Reach toward the wheel without shifting the actor out of its seat.
        arms[index].position.y += 0.012;
        arms[index].position.z += 0.045;
        arms[index].rotation.set(-0.98 + side * turn * 0.22, 0, -side * 0.06);
        elbows[index].rotation.set(-0.65 - side * turn * 0.08, 0, 0);
        hands[index].rotation.set(0.06, -side * 1.45, -side * turn * 0.05);
      }
      const recline = -0.06,
        pivotHeight = 0.895;
      body.rotation.set(recline, turn * 0.035, 0);
      // Recline around the hips while leaving the caller's seat transform alone.
      body.position.set(
        0,
        pivotHeight * (1 - Math.cos(recline)),
        -pivotHeight * Math.sin(recline),
      );
      body.scale.y = 1;
    },
    animate(dt, speed = 0, time = 0, aiming = false) {
      if (drivingPose) {
        drivingPose = false;
        body.position.set(0, 0, 0);
        for (let index = 0; index < arms.length; index++) {
          arms[index].position.copy(armRestPositions[index]);
          arms[index].rotation.z = index === 0 ? 0.063 : -0.063;
          legs[index].rotation.y = 0;
          hands[index].rotation.set(0, 0, 0);
        }
      }
      const step = Math.max(0, finite(dt)),
        clock = finite(time),
        motion = Math.min(1, Math.abs(finite(speed)) / 3.7);
      const phase = clock * (8.1 + motion * 2),
        swing = Math.sin(phase) * 0.56 * motion,
        blend = 1 - Math.exp(-step * 13);
      const damp = (value, target) =>
        THREE.MathUtils.lerp(value, target, blend);
      legs[0].rotation.x = damp(legs[0].rotation.x, swing);
      legs[1].rotation.x = damp(legs[1].rotation.x, -swing);
      shins[0].rotation.x = damp(
        shins[0].rotation.x,
        Math.max(0, -Math.sin(phase)) * 0.64 * motion,
      );
      shins[1].rotation.x = damp(
        shins[1].rotation.x,
        Math.max(0, Math.sin(phase)) * 0.64 * motion,
      );
      feet[0].rotation.x = damp(
        feet[0].rotation.x,
        -Math.sin(phase) * 0.09 * motion,
      );
      feet[1].rotation.x = damp(
        feet[1].rotation.x,
        Math.sin(phase) * 0.09 * motion,
      );
      arms[0].rotation.x = damp(arms[0].rotation.x, -swing * 0.64);
      arms[1].rotation.x = damp(
        arms[1].rotation.x,
        aiming ? -1.23 : swing * 0.64,
      );
      arms[1].rotation.z = damp(arms[1].rotation.z, aiming ? -0.2 : -0.063);
      elbows[0].rotation.x = damp(
        elbows[0].rotation.x,
        -0.12 - motion * (0.13 + Math.max(0, -Math.sin(phase)) * 0.18),
      );
      elbows[1].rotation.x = damp(
        elbows[1].rotation.x,
        aiming
          ? -0.48
          : -0.12 - motion * (0.13 + Math.max(0, Math.sin(phase)) * 0.18),
      );
      rig.position.y = Math.abs(Math.sin(phase)) * 0.013 * motion;
      rig.rotation.z = Math.sin(phase) * 0.008 * motion;
      body.rotation.y = Math.sin(phase) * 0.028 * motion;
      body.rotation.x = motion * 0.018;
      body.scale.y = 1 + Math.sin(clock * 1.55 + index) * 0.0013 * (1 - motion);
    },
  };
}

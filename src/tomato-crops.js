import * as THREE from "three";

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const valid = (...values) => values.every(Number.isFinite);
function generator(x, z, salt = 0) {
  let seed =
    (Math.imul(Math.round(x * 991), 73856093) ^
      Math.imul(Math.round(z * 997), 19349663) ^
      salt) >>>
    0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function dataTexture(data, width, height, colour = true) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
function leafTexture() {
  const width = 128,
    height = 256,
    pixels = new Uint8Array(width * height * 4);
  const random = generator(53, 71, 19);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width - 0.5,
        v = y / height;
      const midrib = Math.exp(-Math.pow(u / 0.014, 2)) * 0.12;
      const veinPhase = (v - Math.abs(u) * 0.62) * 11;
      const sideVein =
        Math.exp(-Math.pow((veinPhase - Math.round(veinPhase)) / 0.055, 2)) *
        0.055;
      const elevation =
        0.84 +
        (1 - Math.abs(u) * 2) * 0.08 +
        midrib +
        sideVein +
        random() * 0.035;
      const at = (y * width + x) * 4;
      pixels[at] = 202 * elevation;
      pixels[at + 1] = 216 * elevation;
      pixels[at + 2] = 178 * elevation;
      pixels[at + 3] = 255;
    }
  const texture = dataTexture(pixels, width, height);
  texture.name = "original-tomato-leaf-veins";
  return texture;
}
function caneTexture() {
  const width = 64,
    height = 256,
    pixels = new Uint8Array(width * height * 4);
  const random = generator(12, 91, 7181);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const grain =
        0.87 +
        Math.sin((x / width) * TAU * 13 + Math.sin(y * 0.037) * 0.3) * 0.065 +
        random() * 0.055;
      const node =
        Math.abs(y / height - 0.31) < 0.008 ||
        Math.abs(y / height - 0.76) < 0.008
          ? 0.82
          : 1;
      const at = (y * width + x) * 4;
      pixels[at] = 173 * grain * node;
      pixels[at + 1] = 152 * grain * node;
      pixels[at + 2] = 109 * grain * node;
      pixels[at + 3] = 255;
    }
  const texture = dataTexture(pixels, width, height);
  texture.name = "original-bamboo-cane-grain";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
function skinTexture() {
  const width = 64,
    height = 64,
    pixels = new Uint8Array(width * height * 4);
  const random = generator(17, 81, 391);
  for (let index = 0; index < width * height; index++) {
    const dx = (random() - 0.5) * 0.19,
      dy = (random() - 0.5) * 0.19;
    const length = Math.hypot(dx, dy, 1),
      at = index * 4;
    pixels[at] = 128 + (dx / length) * 127;
    pixels[at + 1] = 128 + (dy / length) * 127;
    pixels[at + 2] = 128 + (1 / length) * 127;
    pixels[at + 3] = 255;
  }
  const texture = dataTexture(pixels, width, height, false);
  texture.name = "original-tomato-skin-microdetail";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
function buildLeafGeometry(low, high) {
  const rows = low ? 4 : high ? 9 : 6;
  const outline = [[0, 0, 0]];
  for (let index = 1; index < rows; index++) {
    const y = index / rows;
    const halfWidth =
      Math.pow(Math.sin(y * Math.PI), 0.8) *
      (0.46 + (index % 2 ? 0.035 : -0.035));
    outline.push([
      -halfWidth,
      y + (index % 2 ? -0.023 : 0.018),
      0.035 * Math.sin(y * Math.PI) -
        0.12 * halfWidth * halfWidth -
        0.055 * y * y,
    ]);
  }
  outline.push([0, 1, -0.07]);
  for (let index = rows - 1; index > 0; index--) {
    const y = index / rows;
    const halfWidth =
      Math.pow(Math.sin(y * Math.PI), 0.8) *
      (0.45 + (index % 2 ? 0.03 : -0.025));
    outline.push([
      halfWidth,
      y + (index % 2 ? 0.018 : -0.023),
      0.035 * Math.sin(y * Math.PI) -
        0.12 * halfWidth * halfWidth -
        0.055 * y * y,
    ]);
  }
  const positions = [0, 0.49, 0.035],
    uv = [0.5, 0.49],
    indices = [];
  for (const [x, y, z] of outline) {
    positions.push(x, y, z);
    uv.push(x + 0.5, y);
  }
  for (let index = 0; index < outline.length; index++)
    indices.push(0, index + 1, ((index + 1) % outline.length) + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function buildCalyxGeometry(low) {
  const positions = [],
    uv = [],
    indices = [];
  for (let index = 0; index < 5; index++) {
    const angle = (index * TAU) / 5;
    const at = positions.length / 3;
    const left = angle - 0.24,
      right = angle + 0.24;
    for (const point of [
      [0, 0.05, 0],
      [Math.sin(left) * 0.43, 0.02, Math.cos(left) * 0.43],
      [Math.sin(angle), -0.17, Math.cos(angle)],
      [Math.sin(right) * 0.43, 0.02, Math.cos(right) * 0.43],
    ]) {
      positions.push(...point);
      uv.push(point[0] * 0.5 + 0.5, point[2] * 0.5 + 0.5);
    }
    if (low) indices.push(at, at + 1, at + 2);
    else indices.push(at, at + 1, at + 2, at, at + 2, at + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function buildFruitGeometry(low, high) {
  const geometry = new THREE.SphereGeometry(
    1,
    low ? 6 : high ? 10 : 8,
    low ? 4 : high ? 8 : 6,
  );
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index),
      y = positions.getY(index),
      z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const lobe =
      1 + Math.cos(angle * 6) * 0.038 * Math.pow(Math.max(0, 1 - y * y), 0.7);
    positions.setXYZ(
      index,
      x * lobe,
      y * 0.93 - 0.055 * Math.exp(-(x * x + z * z) / 0.045) * Math.max(0, y),
      z * lobe,
    );
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function buildShrubSprig(low) {
  const positions = [],
    uv = [],
    indices = [];
  const triangle = (a, b, c) => {
    const at = positions.length / 3;
    for (const point of [a, b, c]) {
      positions.push(...point);
      uv.push(point[0] * 2 + 0.5, point[1]);
    }
    indices.push(at, at + 1, at + 2);
  };
  // Each small shoot has its own stem and paired needle leaves, rather than a
  // single sphere or a rectangular canopy card.
  triangle([-0.004, 0, 0], [0.003, 1, 0.01], [0.004, 0, 0]);
  const rows = low ? 4 : 7;
  for (let index = 0; index < rows; index++) {
    const y = 0.22 + (index / rows) * 0.69;
    for (const side of [-1, 1]) {
      const x = side * (0.115 + (index % 3) * 0.012);
      const tipY = y + 0.105,
        tipZ = index % 2 ? -0.018 : 0.025;
      triangle([0, y, 0], [x * 0.55, y + 0.04, -0.008], [x, tipY, tipZ]);
      triangle([0, y, 0], [x, tipY, tipZ], [x * 0.56, y + 0.075, 0.013]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Original crop geometry; the caller keeps collision, harvest and crop layout. */
export function createTomatoCrops({ quality = "medium", append } = {}) {
  if (typeof append !== "function")
    throw new TypeError("Tomato crops require the world's batching callback.");
  const low = quality === "low",
    high = quality === "high";
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const ownGeometry = (geometry) => (geometries.add(geometry), geometry);
  const ownMaterial = (material) => (materials.add(material), material);
  const ownTexture = (texture) => (textures.add(texture), texture);
  const stemGeometry = ownGeometry(
    new THREE.CylinderGeometry(0.72, 1, 1, low ? 4 : high ? 6 : 5, 1, true),
  );
  const leafGeometry = ownGeometry(buildLeafGeometry(low, high));
  const fruitGeometry = ownGeometry(buildFruitGeometry(low, high));
  const calyxGeometry = ownGeometry(buildCalyxGeometry(low));
  const shrubGeometry = ownGeometry(buildShrubSprig(low));
  const leafMap = ownTexture(leafTexture()),
    caneMap = ownTexture(caneTexture()),
    skinMap = ownTexture(skinTexture());
  const greenMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.86,
      metalness: 0,
    }),
  );
  greenMaterial.name = "tomato-stems-and-trusses";
  const leafMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: leafMap,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0,
    }),
  );
  leafMaterial.name = "folded-tomato-and-mediterranean-leaves";
  const fruitMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      normalMap: skinMap,
      normalScale: new THREE.Vector2(0.045, 0.045),
      roughness: 0.33,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.27,
    }),
  );
  fruitMaterial.name = "living-tomato-fruit-skin";
  const caneMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: "#d7c8a4",
      map: caneMap,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  caneMaterial.name = "bamboo-crop-supports-and-ties";
  const elapsed = { value: 0 };
  if (!low) {
    leafMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.cropTime = elapsed;
      shader.vertexShader = "uniform float cropTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 cropPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          cropPosition = instanceMatrix * cropPosition;
        #endif
        cropPosition = modelMatrix * cropPosition;
        float cropPhase = cropPosition.x * 0.73 + cropPosition.z * 0.49;
        transformed.z += sin(cropTime * 1.05 + cropPhase) * uv.y * uv.y * 0.012;
      `,
      );
    };
    leafMaterial.customProgramCacheKey = () => "tomato-botanical-leaf-wind-v1";
  }
  const stats = {
    quality,
    crops: 0,
    shrubs: 0,
    leaflets: 0,
    fruits: 0,
    calyces: 0,
    stems: 0,
    sprigs: 0,
    instances: 0,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  };
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion(),
    twist = new THREE.Quaternion();
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(),
    right = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const euler = new THREE.Euler(),
    sample = new THREE.Vector3();
  let disposed = false;
  const emit = (geometry, material, transform, x, z, colour, detail = 1) => {
    append(geometry, material, transform, x, z, colour, detail);
    stats.instances++;
  };
  function beam(
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    radius,
    colour,
    material = greenMaterial,
  ) {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    if (length < 0.0005) return;
    position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    quaternion.setFromUnitVectors(up, direction.divideScalar(length));
    scale.set(radius, length, radius);
    matrix.compose(position, quaternion, scale);
    emit(stemGeometry, material, matrix, position.x, position.z, colour);
    stats.stems++;
  }
  function orient(dx, dy, dz, roll = 0) {
    direction.set(dx, dy, dz).normalize();
    right.crossVectors(direction, up);
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    else right.normalize();
    normal.crossVectors(right, direction).normalize();
    rotation.makeBasis(right, direction, normal);
    quaternion.setFromRotationMatrix(rotation);
    if (roll) {
      twist.setFromAxisAngle(direction, roll);
      quaternion.premultiply(twist);
    }
  }
  function leaflet(x, y, z, dx, dy, dz, width, length, roll, colour) {
    orient(dx, dy, dz, roll);
    position.set(x, y, z);
    scale.set(width, length, width);
    matrix.compose(position, quaternion, scale);
    emit(leafGeometry, leafMaterial, matrix, x, z, colour);
    stats.leaflets++;
  }
  const leafTints = ["#567341", "#4b6738", "#617d49", "#405b30"];
  const stemTints = ["#527339", "#648245", "#476932"];
  const ripeTints = ["#b63b25", "#c4462d", "#aa3420"];
  function addCrop(x, z, size = 1) {
    if (disposed || !valid(x, z, size) || size <= 0) return false;
    size = clamp(size, 0.2, 3);
    const random = generator(x, z, 38417);
    const phase = random() * TAU;
    const stemColour = stemTints[Math.floor(random() * stemTints.length)];
    const leafColour = () =>
      new THREE.Color(leafTints[Math.floor(random() * leafTints.length)]);
    const stemAt = (y) => ({
      x: x + Math.sin(phase + y * 0.9) * 0.05 * size,
      y: y * size,
      z: z + Math.cos(phase + y * 0.65) * 0.035 * size,
    });
    const stemLevels = [0.69, 1.15, 1.65, 2.19];
    for (let index = 0; index < stemLevels.length - 1; index++) {
      const a = stemAt(stemLevels[index]),
        b = stemAt(stemLevels[index + 1]);
      beam(
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
        (0.014 - index * 0.002) * size,
        stemColour,
      );
    }
    const caneX = x + 0.066 * size,
      caneZ = z - 0.042 * size;
    beam(
      caneX,
      0,
      caneZ,
      caneX,
      2.4 * size,
      caneZ,
      0.014 * size,
      null,
      caneMaterial,
    );
    for (const y of [1.2, 1.8]) {
      const stem = stemAt(y);
      beam(
        caneX - 0.012 * size,
        y * size,
        caneZ,
        stem.x + 0.022 * size,
        y * size + 0.015 * size,
        stem.z,
        0.0032 * size,
        "#a89872",
        caneMaterial,
      );
    }
    const compounds = low ? 2 : high ? 5 : 4;
    for (let index = 0; index < compounds; index++) {
      const y = low ? 1.18 + index * 0.6 : 0.98 + index * (high ? 0.255 : 0.31);
      const start = stemAt(y),
        angle = phase + index * 2.39996323;
      const reach = (0.36 + random() * 0.06) * size;
      const end = {
        x: start.x + Math.sin(angle) * reach,
        y: start.y + (index % 2 ? -0.04 : 0.075) * size,
        z: start.z + Math.cos(angle) * reach,
      };
      beam(
        start.x,
        start.y,
        start.z,
        end.x,
        end.y,
        end.z,
        0.0065 * size,
        stemColour,
      );
      const pairs = low ? 1 : 3;
      for (let pair = 0; pair < pairs; pair++) {
        const t = low ? 0.43 : 0.23 + pair * 0.24;
        const base = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
        };
        for (const side of [-1, 1]) {
          const leafAngle = angle + side * (0.93 + random() * 0.12);
          const length =
            (0.195 + random() * 0.043) * (1 - index * 0.055) * size;
          leaflet(
            base.x,
            base.y,
            base.z,
            Math.sin(leafAngle),
            -0.12 - random() * 0.24,
            Math.cos(leafAngle),
            length * 0.54,
            length,
            (random() - 0.5) * 0.62,
            leafColour(),
          );
        }
      }
      leaflet(
        end.x,
        end.y,
        end.z,
        Math.sin(angle),
        -0.17,
        Math.cos(angle),
        0.117 * size,
        0.23 * size,
        (random() - 0.5) * 0.55,
        leafColour(),
      );
      if (low) {
        const leafAngle = angle + 0.72;
        leaflet(
          start.x + (end.x - start.x) * 0.72,
          start.y + (end.y - start.y) * 0.72,
          start.z + (end.z - start.z) * 0.72,
          Math.sin(leafAngle),
          -0.24,
          Math.cos(leafAngle),
          0.09 * size,
          0.18 * size,
          -0.2,
          leafColour(),
        );
      }
    }
    const fruitCount = low
      ? 3
      : high
        ? 6 + Math.floor(random() * 3)
        : 4 + Math.floor(random() * 3);
    const trusses = low ? 1 : 2;
    for (let truss = 0, placed = 0; truss < trusses; truss++) {
      const count =
        truss === trusses - 1
          ? fruitCount - placed
          : Math.ceil(fruitCount / trusses);
      const y = 1.1 + truss * 0.49,
        start = stemAt(y + 0.16),
        angle = phase + truss * 2.4 + 0.7;
      const cluster = {
        x: start.x + Math.sin(angle) * 0.23 * size,
        y: y * size,
        z: start.z + Math.cos(angle) * 0.23 * size,
      };
      beam(
        start.x,
        start.y,
        start.z,
        cluster.x,
        cluster.y + 0.08 * size,
        cluster.z,
        0.0085 * size,
        stemColour,
      );
      for (let fruit = 0; fruit < count; fruit++, placed++) {
        const offset = (fruit - (count - 1) / 2) * 0.125 * size;
        const radius = (0.045 + random() * 0.012) * size;
        const px =
          cluster.x +
          Math.cos(angle) * offset +
          Math.sin(angle) * random() * 0.045 * size;
        const py =
          cluster.y - Math.abs(offset) * 0.29 + (random() - 0.5) * 0.035 * size;
        const pz =
          cluster.z -
          Math.sin(angle) * offset +
          Math.cos(angle) * random() * 0.045 * size;
        const maturity = random();
        const colour =
          truss === 0 || low
            ? maturity < 0.76
              ? ripeTints[Math.floor(random() * ripeTints.length)]
              : "#cb7c32"
            : maturity < 0.6
              ? "#789447"
              : maturity < 0.83
                ? "#b7953d"
                : "#ba4930";
        position.set(px, py, pz);
        scale.set(radius, radius, radius);
        euler.set(
          (random() - 0.5) * 0.12,
          random() * TAU,
          (random() - 0.5) * 0.12,
        );
        quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, scale);
        emit(fruitGeometry, fruitMaterial, matrix, px, pz, colour);
        stats.fruits++;
        position.set(px, py + radius * 0.9, pz);
        scale.setScalar(radius * 0.94);
        euler.set(
          (random() - 0.5) * 0.12,
          angle + random(),
          (random() - 0.5) * 0.12,
        );
        quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, scale);
        emit(calyxGeometry, leafMaterial, matrix, px, pz, "#42612e");
        stats.calyces++;
        beam(
          cluster.x + Math.cos(angle) * offset * 0.68,
          cluster.y + 0.08 * size,
          cluster.z - Math.sin(angle) * offset * 0.68,
          px,
          py + radius * 0.98,
          pz,
          0.0038 * size,
          stemColour,
        );
      }
    }
    stats.crops++;
    return true;
  }
  function addPlanterShrub(
    x,
    y,
    z,
    rx = 0.55,
    ry = 0.55,
    rz = 0.5,
    colour = "#5b7547",
  ) {
    if (
      disposed ||
      !valid(x, y, z, rx, ry, rz) ||
      rx <= 0 ||
      ry <= 0 ||
      rz <= 0
    )
      return false;
    rx = clamp(rx, 0.025, 3);
    ry = clamp(ry, 0.025, 3);
    rz = clamp(rz, 0.025, 3);
    const random = generator(x, z, Math.round(y * 373) ^ 91831);
    const count = low ? 8 : high ? 22 : 15,
      vertices = shrubGeometry.attributes.position;
    const baseColour = new THREE.Color(colour);
    for (let index = 0; index < count; index++) {
      const angle = index * 2.39996323 + random() * 0.5;
      const radius = 0.2 + Math.sqrt((index + 0.5) / count) * 0.53;
      const start = {
        x: x + Math.sin(angle) * rx * 0.12,
        y: y - ry * (0.7 + random() * 0.09),
        z: z + Math.cos(angle) * rz * 0.12,
      };
      const end = {
        x: x + Math.sin(angle) * rx * radius,
        y: y + ry * (0.27 + (1 - radius) * 0.52 + random() * 0.12),
        z: z + Math.cos(angle) * rz * radius,
      };
      const length = Math.hypot(
        end.x - start.x,
        end.y - start.y,
        end.z - start.z,
      );
      orient(
        end.x - start.x,
        end.y - start.y,
        end.z - start.z,
        (random() - 0.5) * 0.9,
      );
      position.set(start.x, start.y, start.z);
      scale.set(Math.min(rx, rz) * 1.05, length, Math.min(rx, rz) * 1.05);
      matrix.compose(position, quaternion, scale);
      // Retain the exact old ellipsoid footprint even for a tilted compound
      // shoot. Shrinking a whole sprig around its planter centre is affine,
      // so every rendered triangle stays inside the convex ellipsoid too.
      let maximum = 1;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        sample.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix);
        const distance =
          Math.pow((sample.x - x) / rx, 2) +
          Math.pow((sample.y - y) / ry, 2) +
          Math.pow((sample.z - z) / rz, 2);
        maximum = Math.max(maximum, distance);
      }
      if (maximum > 1) {
        const factor = 0.995 / Math.sqrt(maximum),
          elements = matrix.elements;
        for (const component of [0, 1, 2, 4, 5, 6, 8, 9, 10])
          elements[component] *= factor;
        elements[12] = x + (elements[12] - x) * factor;
        elements[13] = y + (elements[13] - y) * factor;
        elements[14] = z + (elements[14] - z) * factor;
      }
      const tint = baseColour.clone().multiplyScalar(0.84 + random() * 0.16);
      emit(shrubGeometry, leafMaterial, matrix, x, z, tint);
      stats.sprigs++;
    }
    stats.shrubs++;
    return true;
  }
  return {
    addCrop,
    addPlanterShrub,
    stats,
    update(time) {
      if (!disposed && Number.isFinite(time)) elapsed.value = time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      textures.forEach((value) => value.dispose());
    },
  };
}

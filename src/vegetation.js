import * as THREE from "three";

// Original, deterministic botanical textures. No network or image decode is
// required: the cutout is drawn leaf by leaf, including twigs and leaf veins.
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const noise = (x, y, salt = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
};
function generator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function textureFromPixels(data, width, height, colour = true) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
function createBark() {
  const width = 256,
    height = 512;
  const data = new Uint8Array(width * height * 4);
  const normals = new Uint8Array(data.length);
  const heights = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width) * TAU,
        v = y / height;
      const fissure = Math.pow(
        Math.max(0, Math.sin(u * 29 + Math.sin(v * TAU * 2 + u * 3) * 0.47)),
        13,
      );
      const ridge = Math.sin(u * 71 + Math.sin(v * 14) * 0.75) * 0.045;
      const grain = noise(x, y, 3) * 0.055;
      const elevation = 0.64 - fissure * 0.4 + ridge + grain;
      heights[y * width + x] = elevation;
      const at = (y * width + x) * 4;
      const light = 0.66 + elevation * 0.53;
      data[at] = 125 * light;
      data[at + 1] = 112 * light;
      data[at + 2] = 94 * light;
      data[at + 3] = 255;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const dx =
        (heights[y * width + ((x + 1) % width)] -
          heights[y * width + ((x + width - 1) % width)]) *
        1.7;
      const dy =
        (heights[((y + 1) % height) * width + x] -
          heights[((y + height - 1) % height) * width + x]) *
        1.7;
      const length = Math.hypot(dx, dy, 1);
      normals[at] = 128 - (dx / length) * 127;
      normals[at + 1] = 128 - (dy / length) * 127;
      normals[at + 2] = 128 + (1 / length) * 127;
      normals[at + 3] = 255;
    }
  }
  const map = textureFromPixels(data, width, height);
  const normalMap = textureFromPixels(normals, width, height, false);
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
  }
  return { map, normalMap };
}
function createSprayTexture(species) {
  const width = 512,
    height = 512;
  const pixels = new Uint8Array(width * height * 4);
  const random = generator(
    species === "olive" ? 98317 : species === "pine" ? 18983 : 71831,
  );
  const paint = (x, y, rgb, alpha = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 4;
    pixels[at] = rgb[0];
    pixels[at + 1] = rgb[1];
    pixels[at + 2] = rgb[2];
    pixels[at + 3] = alpha;
  };
  const twig = (ax, ay, bx, by, radius) => {
    const dx = bx - ax,
      dy = by - ay,
      lengthSq = dx * dx + dy * dy;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const t = clamp(
          ((x - ax) * dx + (y - ay) * dy) / Math.max(1, lengthSq),
          0,
          1,
        );
        const distance = Math.hypot(x - ax - dx * t, y - ay - dy * t);
        if (distance <= radius)
          paint(x, y, [103 + t * 25, 105 + t * 17, 72 + t * 14]);
      }
  };
  const leaf = (cx, cy, angle, length, breadth, silver = false) => {
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    const radius = Math.max(length, breadth) + 2;
    const base =
      species === "olive"
        ? silver
          ? [148, 158, 129]
          : [106, 125, 76]
        : species === "pine"
          ? [73, 103, 68]
          : [92, 123, 68];
    const variation = 0.85 + random() * 0.24;
    for (
      let y = Math.max(0, Math.floor(cy - radius));
      y <= Math.min(height - 1, Math.ceil(cy + radius));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x <= Math.min(width - 1, Math.ceil(cx + radius));
        x++
      ) {
        const dx = x - cx,
          dy = y - cy;
        const u = (dx * cs + dy * sn) / length;
        const v = (-dx * sn + dy * cs) / breadth;
        const angleAround = Math.atan2(v, u);
        const lobes =
          species === "plane"
            ? 0.88 +
              0.1 * Math.cos(angleAround * 5 + 0.3) +
              0.025 * Math.cos(angleAround * 17)
            : 1;
        const edge =
          species === "pine"
            ? Math.abs(u) + Math.abs(v) * 0.68
            : u * u + (v * v) / lobes;
        if (edge > 1 || Math.abs(u) > 1) continue;
        const vein = Math.abs(v) < 0.027 * (1 - Math.abs(u)) ? 0.13 : 0;
        const smallVein =
          Math.abs(
            (u + Math.abs(v) * 0.93) * 5 -
              Math.round((u + Math.abs(v) * 0.93) * 5),
          ) < 0.035
            ? 0.045
            : 0;
        const light =
          variation *
          (0.89 + 0.11 * (1 - v) + vein + smallVein + noise(x, y, 21) * 0.06);
        paint(
          x,
          y,
          base.map((channel) => channel * light),
        );
      }
    }
  };
  twig(260, 484, 246, 66, 3.2);
  const branches = species === "pine" ? 10 : 8;
  for (let index = 0; index < branches; index++) {
    const t = (index + 1) / (branches + 1),
      side = index % 2 ? 1 : -1;
    const startX = 260 - t * 14,
      startY = 470 - t * 340;
    const span = (155 - t * 78) * (1 + random() * 0.14);
    const endX = startX + side * span,
      endY = startY - 54 - random() * 36;
    twig(startX, startY, endX, endY, 1.8 - t * 0.6);
    const count = species === "pine" ? 11 : species === "olive" ? 5 : 4;
    for (let item = 0; item <= count; item++) {
      const at = (item + 0.35) / (count + 0.8);
      const px = startX + (endX - startX) * at,
        py = startY + (endY - startY) * at;
      const dir = Math.atan2(endY - startY, endX - startX);
      for (const leafSide of [-1, 1]) {
        const angle = dir + leafSide * (0.61 + random() * 0.27);
        const size =
          species === "pine"
            ? 22 + random() * 13
            : species === "olive"
              ? 25 + random() * 11
              : 29 + random() * 13;
        const breadth =
          species === "pine"
            ? 1.55 + random() * 0.55
            : species === "olive"
              ? 6.5 + random() * 2.4
              : 15 + random() * 6;
        leaf(
          px + Math.cos(angle) * size * 0.76,
          py + Math.sin(angle) * size * 0.76,
          angle,
          size,
          breadth,
          species === "olive" && random() > 0.66,
        );
      }
    }
    const dir = Math.atan2(endY - startY, endX - startX);
    leaf(
      endX + Math.cos(dir) * 18,
      endY + Math.sin(dir) * 18,
      dir,
      25,
      species === "plane" ? 18 : species === "olive" ? 7 : 2,
    );
  }
  leaf(
    244,
    62,
    -Math.PI / 2,
    35,
    species === "plane" ? 22 : species === "olive" ? 8 : 2,
  );
  const texture = textureFromPixels(pixels, width, height);
  texture.name = `original-botanical-spray-${species}`;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates shared resources and emits matrices into the world's spatial batches.
 * append(geometry, material, matrix, worldX, worldZ, color, detailLevel).
 * Each tree keeps its original ground footprint: the caller owns collisions.
 */
export function createVegetationLibrary({ quality = "medium", append } = {}) {
  if (typeof append !== "function")
    throw new TypeError("Vegetation requires the world's append callback.");
  const low = quality === "low",
    high = quality === "high";
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const ownGeometry = (value) => (geometries.add(value), value);
  const ownMaterial = (value) => (materials.add(value), value);
  const branchGeometry = ownGeometry(
    new THREE.CylinderGeometry(0.52, 1, 1, low ? 5 : 8, 1),
  );
  const trunkGeometry = ownGeometry(
    new THREE.CylinderGeometry(0.88, 1, 1, low ? 6 : 10, 1),
  );
  const sprayGeometry = ownGeometry(new THREE.PlaneGeometry(1, 1, 2, 2));
  // A shallow bend gives each spray coherent highlights without a rigid plane.
  const points = sprayGeometry.attributes.position;
  for (let index = 0; index < points.count; index++)
    points.setZ(
      index,
      Math.abs(points.getX(index)) * 0.12 +
        Math.abs(points.getY(index)) * 0.045,
    );
  sprayGeometry.computeVertexNormals();
  const bark = createBark();
  textures.add(bark.map);
  textures.add(bark.normalMap);
  const barkMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: "#d2c9b3",
      ...bark,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.97,
    }),
  );
  barkMaterial.name = "weathered-tree-bark";
  const time = { value: 0 };
  const foliage = Object.fromEntries(
    ["plane", "olive", "pine"].map((species) => {
      const map = createSprayTexture(species);
      textures.add(map);
      const material = ownMaterial(
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          map,
          alphaTest: 0.43,
          side: THREE.DoubleSide,
          roughness: 0.93,
          metalness: 0,
        }),
      );
      material.name = `botanical-${species}`;
      material.userData.vegetation = true;
      if (!low) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.vegetationTime = time;
          shader.vertexShader =
            "uniform float vegetationTime;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
          vec4 vegetationPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            vegetationPosition = instanceMatrix * vegetationPosition;
          #endif
          vegetationPosition = modelMatrix * vegetationPosition;
          float vegetationPhase = vegetationPosition.x * 0.17 + vegetationPosition.z * 0.13;
          transformed.x += sin(vegetationTime * 0.87 + vegetationPhase) * (uv.y + 0.15) * 0.027;
          transformed.z += cos(vegetationTime * 0.69 + vegetationPhase * 0.7) * uv.y * 0.018;
        `,
          );
        };
        material.customProgramCacheKey = () => "botanical-spray-wind-v1";
      }
      return [species, material];
    }),
  );
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler();
  const stats = {
    trees: 0,
    branches: 0,
    sprays: 0,
    species: { plane: 0, olive: 0, pine: 0, cypress: 0 },
    textures: textures.size,
  };
  let disposed = false;
  function branch(ax, ay, az, bx, by, bz, radius, tone, trunk = false) {
    const vector = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const length = vector.length();
    if (length < 0.02) return;
    position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    quaternion.setFromUnitVectors(up, vector.divideScalar(length));
    scale.set(radius, length, radius);
    matrix.compose(position, quaternion, scale);
    append(
      trunk ? trunkGeometry : branchGeometry,
      barkMaterial,
      matrix,
      position.x,
      position.z,
      tone,
      trunk ? 0 : 2,
    );
    stats.branches++;
  }
  function spray(species, x, y, z, width, height, yaw, pitch, roll, tint) {
    position.set(x, y, z);
    scale.set(width, height, 1);
    euler.set(pitch, yaw, roll);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    append(
      sprayGeometry,
      foliage[species === "cypress" ? "pine" : species],
      matrix,
      x,
      z,
      tint,
      2,
    );
    stats.sprays++;
  }
  function addTree(x, z, size = 1, olive = false, variation = 0) {
    if (
      disposed ||
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(size) ||
      size <= 0
    )
      return false;
    size = clamp(size, 0.2, 3);
    const seed =
      (Math.imul(Math.round(x * 100), 73856093) ^
        Math.imul(Math.round(z * 100), 19349663) ^
        Math.round(variation * 1e8)) >>>
      0;
    const random = generator(seed || 7193);
    const kind = random();
    const species =
      typeof olive === "string" &&
      ["plane", "olive", "pine", "cypress"].includes(olive)
        ? olive
        : olive
          ? kind < 0.78
            ? "olive"
            : kind < 0.93
              ? "pine"
              : "cypress"
          : kind < 0.68
            ? "plane"
            : kind < 0.94
              ? "pine"
              : "cypress";
    const isOlive = species === "olive",
      isPine = species === "pine",
      isCypress = species === "cypress";
    const height =
      (isOlive ? 6.4 : isPine ? 8.8 : isCypress ? 9.1 : 8.1) * size;
    const crownRadius =
      (isOlive ? 2.75 : isPine ? 3.2 : isCypress ? 0.68 : 3.0) * size;
    const trunkTop =
      height * (isOlive ? 0.52 : isPine ? 0.69 : isCypress ? 0.8 : 0.57);
    const leanAngle = random() * TAU,
      lean = (isOlive ? 0.32 : 0.19) * size;
    // Author tints in sRGB, then let Three convert them to linear reflectance.
    // Near-white HSL values here would wash leaves and bark out under the HDRI.
    const barkTints = ["#b7b0a0", "#aaa897", "#c0b8a7", "#a5a18e"];
    const leafTints = isOlive
      ? ["#a1ad8b", "#879775", "#95a27c", "#7f906d"]
      : isPine || isCypress
        ? ["#739064", "#5c7954", "#7b9566", "#667e55"]
        : ["#8ba56c", "#799458", "#94aa75", "#6f8854"];
    const foliageTint = () =>
      new THREE.Color(leafTints[Math.floor(random() * leafTints.length)]);
    const trunkTone = new THREE.Color(
      barkTints[Math.floor(random() * barkTints.length)],
    );
    const sections = 4;
    let previous = { x, y: 0, z };
    for (let index = 1; index <= sections; index++) {
      const t = index / sections;
      const next = {
        x: x + Math.sin(leanAngle + t * 0.7) * lean * t,
        y: trunkTop * t,
        z: z + Math.cos(leanAngle) * lean * t,
      };
      branch(
        previous.x,
        previous.y,
        previous.z,
        next.x,
        next.y,
        next.z,
        (0.255 - t * 0.105) * size,
        trunkTone,
        true,
      );
      previous = next;
    }
    const branches = low
      ? isCypress
        ? 8
        : 7
      : high
        ? isCypress
          ? 16
          : 13
        : isCypress
          ? 12
          : 10;
    for (let index = 0; index < branches; index++) {
      const angle = index * 2.39996323 + random() * 0.44;
      const fraction = (index + 0.5) / branches;
      const radius = isCypress
        ? crownRadius * (1.1 - fraction * 0.8)
        : crownRadius * (0.46 + Math.sqrt(fraction) * 0.57);
      const crownY = isCypress
        ? height * (0.3 + fraction * 0.66)
        : isPine
          ? height * (0.82 + (1 - fraction) * 0.08)
          : height * (0.72 + (1 - fraction) * 0.19);
      const end = {
        x: x + Math.sin(angle) * radius,
        y: crownY + (random() - 0.5) * 0.55 * size,
        z: z + Math.cos(angle) * radius,
      };
      const originY = isCypress
        ? end.y * 0.87
        : trunkTop * (0.66 + random() * 0.28);
      const middle = {
        x: x + Math.sin(angle) * radius * 0.52,
        y: originY + (end.y - originY) * 0.7,
        z: z + Math.cos(angle) * radius * 0.52,
      };
      branch(
        x,
        originY,
        z,
        middle.x,
        middle.y,
        middle.z,
        (isCypress ? 0.068 : 0.105) * size,
        trunkTone,
      );
      branch(
        middle.x,
        middle.y,
        middle.z,
        end.x,
        end.y,
        end.z,
        (isCypress ? 0.042 : 0.063) * size,
        trunkTone,
      );
      const forks = low ? 1 : 2;
      for (let fork = 0; fork < forks; fork++) {
        const spread = (fork ? 1 : -1) * (0.47 + random() * 0.22);
        const tipAngle = angle + spread;
        const tip = {
          x:
            end.x +
            Math.sin(tipAngle) *
              (isCypress ? 0.12 + random() * 0.08 : 0.45 + random() * 0.3) *
              size,
          y: end.y + (random() - 0.4) * 0.65 * size,
          z:
            end.z +
            Math.cos(tipAngle) *
              (isCypress ? 0.12 + random() * 0.08 : 0.45 + random() * 0.3) *
              size,
        };
        branch(
          end.x,
          end.y,
          end.z,
          tip.x,
          tip.y,
          tip.z,
          0.026 * size,
          trunkTone,
        );
        const sprays = low ? 3 : high ? 5 : 4;
        for (let leaf = 0; leaf < sprays; leaf++) {
          const direction = tipAngle + leaf * 2.39996323 + random() * 0.6;
          const reach =
            leaf === 0
              ? 0
              : (isCypress ? 0.12 + random() * 0.13 : 0.28 + random() * 0.36) *
                size;
          const px = tip.x + Math.sin(direction) * reach;
          const py = tip.y + (random() - 0.5) * (isPine ? 0.48 : 0.8) * size;
          const pz = tip.z + Math.cos(direction) * reach;
          const width =
            (isOlive ? 1.22 : isPine ? 1.16 : isCypress ? 0.87 : 1.34) *
            size *
            (0.86 + random() * 0.3);
          const length = width * (isCypress ? 1.25 : isOlive ? 1.12 : 1.05);
          const tint = foliageTint();
          spray(
            species,
            px,
            py,
            pz,
            width,
            length,
            direction,
            isPine
              ? -0.8 + random() * 0.45
              : isCypress
                ? -0.18 + random() * 0.42
                : (random() - 0.5) * 1.6,
            (random() - 0.5) * 1.8,
            tint,
          );
        }
      }
    }
    // Fill the inner crown as well as the limb tips; an empty radial ring
    // would read as a pruned ornamental fan rather than a mature tree.
    const fill = low ? 8 : high ? 28 : 18;
    for (let index = 0; index < fill; index++) {
      const fraction = (index + 0.5) / fill;
      const direction = index * 2.39996323 + random() * 0.6;
      const radius =
        crownRadius * Math.sqrt(random()) * (isCypress ? 0.65 : 0.68);
      const px = x + Math.sin(direction) * radius;
      const py = isCypress
        ? height * (0.12 + fraction * 0.83)
        : height * (isPine ? 0.87 : isOlive ? 0.75 : 0.81) +
          (random() - 0.5) * size * 0.9;
      const pz = z + Math.cos(direction) * radius;
      const width = (isCypress ? 1.05 : 1.4) * size * (0.86 + random() * 0.22);
      const tint = foliageTint();
      spray(
        species,
        px,
        py,
        pz,
        width,
        width * (isCypress ? 1.2 : 1.02),
        direction,
        isPine ? -0.6 : (random() - 0.5) * 1.1,
        (random() - 0.5) * 1.7,
        tint,
      );
    }
    stats.trees++;
    stats.species[species]++;
    return true;
  }
  return {
    addTree,
    update(elapsed) {
      if (!disposed && Number.isFinite(elapsed)) time.value = elapsed;
    },
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((resource) => resource.dispose());
      materials.forEach((resource) => resource.dispose());
      textures.forEach((resource) => resource.dispose());
    },
  };
}

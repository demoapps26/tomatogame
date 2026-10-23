// Derive a compact, unbranded single-variant game vehicle from CarConcept.
// Original by Eric Chadwick / DGG, CC BY 4.0. See assets/new-realism/.
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
const root = fileURLToPath(new URL("../", import.meta.url));
const bytes = await readFile(root + "assets/new-realism/CarConcept.glb");
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
let source, binary;
for (let at = 12; at + 8 <= bytes.length; ) {
  const length = view.getUint32(at, true),
    type = view.getUint32(at + 4, true);
  const chunk = bytes.subarray(at + 8, at + 8 + length);
  if (type === 0x4e4f534a) source = JSON.parse(chunk.toString());
  else if (type === 0x004e4942) binary = chunk;
  at += length + 8;
}
if (!source || !binary) throw Error("Invalid source GLB");
const types = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(id) {
  const a = source.accessors[id],
    v = source.bufferViews[a.bufferView],
    Type = types[a.componentType],
    size = dimensions[a.type];
  const offset = (v.byteOffset || 0) + (a.byteOffset || 0),
    stride = v.byteStride || size * Type.BYTES_PER_ELEMENT;
  const result = new Type(a.count * size);
  for (let index = 0; index < a.count; index++)
    result.set(
      new Type(
        binary.buffer,
        binary.byteOffset + offset + index * stride,
        size,
      ),
      index * size,
    );
  return result;
}
const excluded = new Set([
  "BodyWindshieldWipers",
  "InteriorSteeringEmblem",
  "License Plate",
  "BodyHoodInterior01",
  "BodyHoodInterior02",
  "BodyHoodUnder",
  "InteriorPedalAccel",
  "InteriorPedalAccelArm",
  "InteriorPedalBrake",
  "InteriorPedalBrakeArm",
]);
const rawParts = [],
  wheelOrigins = {};
function walk(id, parent, wheel = null) {
  const n = source.nodes[id],
    local = new THREE.Matrix4();
  if (n.matrix) local.fromArray(n.matrix);
  else
    local.compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])),
    );
  local.premultiply(parent);
  if (/^Wheel(Front|Rear)[LR]$/.test(n.name || "")) {
    wheel = n.name;
    wheelOrigins[wheel] = new THREE.Vector3()
      .setFromMatrixPosition(local)
      .toArray();
  }
  if (n.mesh !== undefined && !excluded.has(n.name)) {
    for (const primitive of source.meshes[n.mesh].primitives) {
      const position = accessor(primitive.attributes.POSITION),
        count = position.length / 3,
        normal = accessor(primitive.attributes.NORMAL),
        uv =
          primitive.attributes.TEXCOORD_0 === undefined
            ? new Float32Array(count * 2)
            : accessor(primitive.attributes.TEXCOORD_0),
        uv1 =
          primitive.attributes.TEXCOORD_1 === undefined
            ? uv.slice()
            : accessor(primitive.attributes.TEXCOORD_1);
      const normals = new THREE.Matrix3().getNormalMatrix(local);
      const point = new THREE.Vector3(),
        direction = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        point.fromArray(position, i * 3).applyMatrix4(local);
        direction
          .fromArray(normal, i * 3)
          .applyMatrix3(normals)
          .normalize();
        if (wheel?.startsWith("WheelFront")) {
          point
            .sub(new THREE.Vector3(...wheelOrigins[wheel]))
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6)
            .add(new THREE.Vector3(...wheelOrigins[wheel]));
          direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
        }
        point.toArray(position, i * 3);
        direction.toArray(normal, i * 3);
      }
      rawParts.push({
        name: n.name || "Tire",
        wheel,
        stationary: /BrakePad/.test(n.name || ""),
        material: primitive.material,
        position,
        normal,
        uv,
        uv1,
        indices: accessor(primitive.indices),
      });
    }
  }
  for (const child of n.children || []) walk(child, local, wheel);
}
for (const id of source.scenes[source.scene || 0].nodes)
  walk(id, new THREE.Matrix4());
const bounds = new THREE.Box3();
for (const part of rawParts) {
  for (let i = 0; i < part.position.length; i += 3)
    bounds.expandByPoint(new THREE.Vector3().fromArray(part.position, i));
}
const center = bounds.getCenter(new THREE.Vector3());
center.y = bounds.min.y;
for (const value of Object.values(wheelOrigins)) {
  value[0] -= center.x;
  value[1] -= center.y;
  value[2] -= center.z;
}
const chunks = [],
  parts = [];
let total = 0;
function append(array) {
  const pad = (4 - (total % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    total += pad;
  }
  const offset = total;
  const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  chunks.push(buffer);
  total += buffer.length;
  return { offset, length: array.length };
}
function quantize(array, size, normal = false) {
  const low = Array(size).fill(Infinity),
    high = Array(size).fill(-Infinity);
  for (let i = 0; i < array.length; i++) {
    const c = i % size;
    low[c] = Math.min(low[c], array[i]);
    high[c] = Math.max(high[c], array[i]);
  }
  const quantized = normal
    ? new Int16Array(array.length)
    : new Uint16Array(array.length);
  for (let i = 0; i < array.length; i++) {
    const c = i % size;
    quantized[i] = normal
      ? Math.round(Math.max(-1, Math.min(1, array[i])) * 32767)
      : Math.round(
          ((array[i] - low[c]) / Math.max(1e-12, high[c] - low[c])) * 65535,
        );
  }
  return { ...append(quantized), size, low, high, normal };
}
for (const part of rawParts) {
  const origin = part.wheel ? wheelOrigins[part.wheel] : [0, 0, 0];
  for (let i = 0; i < part.position.length; i += 3) {
    part.position[i] -= center.x + origin[0];
    part.position[i + 1] -= center.y + origin[1];
    part.position[i + 2] -= center.z + origin[2];
  }
  parts.push({
    name: part.name,
    wheel: part.wheel,
    stationary: part.stationary,
    material: part.material,
    position: quantize(part.position, 3),
    normal: quantize(part.normal, 3, true),
    uv: quantize(part.uv, 2),
    uv1: quantize(part.uv1, 2),
    indices: {
      ...append(part.indices),
      type: part.indices instanceof Uint32Array ? "u32" : "u16",
    },
  });
}
const usedMaterials = [...new Set(parts.map((p) => p.material))];
const textures = source.textures.map((t) => ({ ...t }));
const materials = source.materials.map((m, id) => {
  if (!usedMaterials.includes(id)) return null;
  const result = structuredClone(m);
  delete result.extensions?.KHR_materials_variants;
  if (result.emissiveTexture) {
    delete result.emissiveTexture;
    delete result.emissiveFactor;
    delete result.extensions?.KHR_materials_emissive_strength;
  }
  if (id === 18) {
    delete result.normalTexture;
    delete result.pbrMetallicRoughness.baseColorTexture;
    result.pbrMetallicRoughness.baseColorFactor = [0.008, 0.009, 0.012, 1];
    result.pbrMetallicRoughness.roughnessFactor = 0.78;
  }
  return result;
});
const usedTextures = new Set();
const collect = (value) => {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/Texture$/.test(key) && item?.index !== undefined)
      usedTextures.add(item.index);
    collect(item);
  }
};
materials.forEach(collect);
const usedImages = [
  ...new Set([...usedTextures].map((i) => textures[i].source)),
];
const images = source.images.map((image, id) => {
  if (!usedImages.includes(id)) return null;
  const buffer = source.bufferViews[image.bufferView],
    value = binary.subarray(
      buffer.byteOffset || 0,
      (buffer.byteOffset || 0) + buffer.byteLength,
    );
  return `data:${image.mimeType};base64,${value.toString("base64")}`;
});
const compressed = gzipSync(Buffer.concat(chunks), { level: 9 });
const meta = {
  name: "Car Concept",
  author: "Eric Chadwick",
  owner: "Darmstadt Graphics Group GmbH",
  year: 2024,
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  source:
    "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/15cd02d304e54cb42a4db4eefe719f76190f4b68/Models/CarConcept",
  adaptation:
    "Single Carmine variant; logos, plate/emblem, high-density wipers and hidden mechanical parts omitted; front wheels returned to straight ahead; coordinates centered; 16-bit quantized position/normal/UV attributes; game material settings.",
  triangles: parts.reduce((sum, p) => sum + p.indices.length / 3, 0),
  vertices: parts.reduce((sum, p) => sum + p.position.length / 3, 0),
  bounds: {
    width: bounds.max.x - bounds.min.x,
    length: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  },
  wheelOrigins,
  parts,
  materials,
  textures,
  samplers: source.samplers,
};
await writeFile(
  root + "assets/new-realism/CarConcept-game-geometry.bin.gz",
  compressed,
);
await writeFile(
  root + "assets/new-realism/CarConcept-game.json",
  JSON.stringify(meta, null, 2) + "\n",
);
await writeFile(
  root + "src/vehicle-asset-data.js",
  `// Generated by scripts/pack-vehicle-asset.mjs. CarConcept, Eric Chadwick / DGG, CC BY 4.0.\nexport const VEHICLE_META=${JSON.stringify(meta)};\nexport const VEHICLE_GEOMETRY=Uint8Array.from(atob('${compressed.toString("base64")}'),c=>c.charCodeAt(0));\nexport const VEHICLE_IMAGES=${JSON.stringify(images)};\n`,
);
console.log(
  JSON.stringify(
    {
      triangles: meta.triangles,
      vertices: meta.vertices,
      bounds: meta.bounds,
      gzipBytes: compressed.length,
      textureBytes: images.reduce((sum, item) => sum + (item?.length || 0), 0),
      images: usedImages.length,
      materialCount: usedMaterials.length,
    },
    null,
    2,
  ),
);

const manifestPath = root + "assets/new-realism/source-manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.derived = [];
for (const file of [
  "CarConcept-game-geometry.bin.gz",
  "CarConcept-game.json",
]) {
  const output = await readFile(root + "assets/new-realism/" + file);
  manifest.derived.push({
    file,
    bytes: output.length,
    sha256: createHash("sha256").update(output).digest("hex"),
    source: "CarConcept.glb",
    changes: meta.adaptation,
  });
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

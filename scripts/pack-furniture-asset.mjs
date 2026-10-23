// SheenChair, Eric Chadwick / Wayfair 2020, CC0. See assets/new-realism/chair.
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
const root = fileURLToPath(new URL("../", import.meta.url));
const folder = root + "assets/new-realism/chair/";
const raw = await readFile(folder + "SheenChair.glb");
const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
let gltf, binary;
for (let at = 12; at + 8 <= raw.length; ) {
  const length = view.getUint32(at, true),
    type = view.getUint32(at + 4, true),
    b = raw.subarray(at + 8, at + 8 + length);
  if (type === 0x4e4f534a) gltf = JSON.parse(b.toString());
  else if (type === 0x004e4942) binary = b;
  at += length + 8;
}
if (!gltf || !binary) throw Error("Invalid source chair");
const constructors = {
    5121: Uint8Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array,
  },
  sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(id) {
  const a = gltf.accessors[id],
    v = gltf.bufferViews[a.bufferView],
    Type = constructors[a.componentType],
    size = sizes[a.type],
    start = (v.byteOffset || 0) + (a.byteOffset || 0),
    stride = v.byteStride || Type.BYTES_PER_ELEMENT * size,
    values = new Type(a.count * size);
  for (let i = 0; i < a.count; i++)
    values.set(
      new Type(binary.buffer, binary.byteOffset + start + i * stride, size),
      i * size,
    );
  return values;
}
const parts = [];
const bounds = new THREE.Box3();
for (const node of gltf.nodes) {
  if (node.name === "SheenChair_label" || node.mesh === undefined) continue;
  const matrix = new THREE.Matrix4();
  if (node.matrix) matrix.fromArray(node.matrix);
  else
    matrix.compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])),
    );
  const nMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  for (const primitive of gltf.meshes[node.mesh].primitives) {
    const position = accessor(primitive.attributes.POSITION),
      normal = accessor(primitive.attributes.NORMAL),
      point = new THREE.Vector3(),
      direction = new THREE.Vector3();
    for (let i = 0; i < position.length; i += 3) {
      point.fromArray(position, i).applyMatrix4(matrix);
      bounds.expandByPoint(point);
      point.toArray(position, i);
      direction
        .fromArray(normal, i)
        .applyMatrix3(nMatrix)
        .normalize()
        .toArray(normal, i);
    }
    parts.push({
      name: node.name,
      material: primitive.material,
      position,
      normal,
      uv: accessor(primitive.attributes.TEXCOORD_0),
      uv1: accessor(primitive.attributes.TEXCOORD_1),
      indices: accessor(primitive.indices),
    });
  }
}
const center = bounds.getCenter(new THREE.Vector3());
center.y = bounds.min.y;
let total = 0;
const chunks = [];
function append(values) {
  const pad = (4 - (total % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    total += pad;
  }
  const offset = total,
    b = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  chunks.push(b);
  total += b.length;
  return { offset, length: values.length };
}
function quantize(values, size, normal = false) {
  const low = Array(size).fill(Infinity),
    high = Array(size).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const c = i % size;
    low[c] = Math.min(low[c], values[i]);
    high[c] = Math.max(high[c], values[i]);
  }
  const out = normal
    ? new Int16Array(values.length)
    : new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const c = i % size;
    out[i] = normal
      ? Math.round(Math.max(-1, Math.min(1, values[i])) * 32767)
      : Math.round(
          ((values[i] - low[c]) / Math.max(1e-12, high[c] - low[c])) * 65535,
        );
  }
  return { ...append(out), size, low, high, normal };
}
const packedParts = parts.map((part) => {
  for (let i = 0; i < part.position.length; i += 3) {
    part.position[i] -= center.x;
    part.position[i + 1] -= center.y;
    part.position[i + 2] -= center.z;
  }
  return {
    name: part.name,
    material: part.material,
    position: quantize(part.position, 3),
    normal: quantize(part.normal, 3, true),
    uv: quantize(part.uv, 2),
    uv1: quantize(part.uv1, 2),
    indices: {
      ...append(part.indices),
      type: part.indices instanceof Uint32Array ? "u32" : "u16",
    },
  };
});
const usedMaterials = [...new Set(parts.map((p) => p.material))];
const materials = gltf.materials.map((m, i) =>
  usedMaterials.includes(i) ? m : null,
);
const usedTextures = new Set();
function collect(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/Texture$/.test(key) && item?.index !== undefined)
      usedTextures.add(item.index);
    collect(item);
  }
}
materials.forEach(collect);
const usedImages = [
  ...new Set([...usedTextures].map((id) => gltf.textures[id].source)),
];
const images = gltf.images.map((image, id) => {
  if (!usedImages.includes(id)) return null;
  const v = gltf.bufferViews[image.bufferView],
    b = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  return `data:${image.mimeType};base64,${b.toString("base64")}`;
});
const compressed = gzipSync(Buffer.concat(chunks), { level: 9 });
const meta = {
  name: "SheenChair",
  author: "Eric Chadwick",
  owner: "Wayfair, LLC",
  year: 2020,
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  source:
    "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/15cd02d304e54cb42a4db4eefe719f76190f4b68/Models/SheenChair",
  adaptation:
    "Original Mango/Brown variant, label mesh omitted; coordinates centered and floor normalized; position/normal/UV quantized to16bits; fabric tint/material response adapted to the game.",
  bounds: {
    width: bounds.max.x - bounds.min.x,
    length: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  },
  triangles: parts.reduce((sum, p) => sum + p.indices.length / 3, 0),
  parts: packedParts,
  materials,
  textures: gltf.textures,
  samplers: gltf.samplers,
};
await writeFile(folder + "SheenChair-game-geometry.bin.gz", compressed);
await writeFile(
  folder + "SheenChair-game.json",
  JSON.stringify(meta, null, 2) + "\n",
);
await writeFile(
  root + "src/furniture-asset-data.js",
  `// Generated by scripts/pack-furniture-asset.mjs. SheenChair, Eric Chadwick / Wayfair, CC0.\nexport const FURNITURE_META=${JSON.stringify(meta)};\nexport const FURNITURE_GEOMETRY=Uint8Array.from(atob('${compressed.toString("base64")}'),c=>c.charCodeAt(0));\nexport const FURNITURE_IMAGES=${JSON.stringify(images)};\n`,
);
const manifestPath = folder + "source-manifest.json",
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.derived = [];
for (const file of [
  "SheenChair-game-geometry.bin.gz",
  "SheenChair-game.json",
]) {
  const b = await readFile(folder + file);
  manifest.derived.push({
    file,
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
    source: "SheenChair.glb",
    changes: meta.adaptation,
  });
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log({
  triangles: meta.triangles,
  bounds: meta.bounds,
  gzipBytes: compressed.length,
  images: usedImages.length,
  textureCharacters: images.reduce((sum, x) => sum + (x?.length || 0), 0),
});

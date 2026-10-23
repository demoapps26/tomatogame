// Selected Bistro architecture, NVIDIA GameWorks MIT; see assets/district-v9.
// The complete 95 MB source buffer is deliberately kept outside the repository.
// A lossless capture of only the selected source bufferViews is retained here.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const root = fileURLToPath(new URL("../", import.meta.url));
const folder = root + "assets/district-v9/";
const cache =
  process.env.TOMATO_DISTRICT_SOURCE || "/tmp/tomato-district-v9/source";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const expectedBinaryHash =
  "5fb11a1d61aeb2537197aa97833ff950638c9d42451ee4fafbc9550f03918faa";
let fullBinary, gltf, originalGltfHash, originalGltfBytes, sourceCapture;
try {
  fullBinary = await readFile(cache + "/bistro.bin");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (fullBinary) {
  if (sha256(fullBinary) !== expectedBinaryHash)
    throw Error(
      "Bistro source buffer does not match the official NVIDIA LFS hash",
    );
  const gltfBytes = await readFile(cache + "/bistro.gltf");
  gltf = JSON.parse(gltfBytes);
  originalGltfHash = sha256(gltfBytes);
  originalGltfBytes = gltfBytes.length;
} else {
  // Repacking is fully offline using the small exact selected source capture.
  sourceCapture = JSON.parse(
    await readFile(folder + "source-selected.json", "utf8"),
  );
  fullBinary = gunzipSync(await readFile(folder + "source-selected.bin.gz"));
  gltf = sourceCapture;
  originalGltfHash = sourceCapture.originalGltfSha256;
  originalGltfBytes = sourceCapture.originalGltfBytes;
}
await mkdir(folder, { recursive: true });
const definitions = {
  cafe: { roots: [113, 135, 60, 15], name: "Bistro Paris Building 01" },
  townhouse: { roots: [66], name: "Bistro Paris Building 8 02" },
};
const worlds = new Map();
function walkWorld(id, parent = new THREE.Matrix4()) {
  const n = gltf.nodes[id];
  const matrix = n.matrix
    ? new THREE.Matrix4().fromArray(n.matrix)
    : new THREE.Matrix4().compose(
        new THREE.Vector3(...(n.translation || [0, 0, 0])),
        new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
        new THREE.Vector3(...(n.scale || [1, 1, 1])),
      );
  matrix.premultiply(parent);
  worlds.set(id, matrix);
  for (const child of n.children || []) walkWorld(child, matrix);
}
if (sourceCapture)
  for (const [id, node] of Object.entries(sourceCapture.nodes))
    worlds.set(Number(id), new THREE.Matrix4().fromArray(node.worldMatrix));
else for (const id of gltf.scenes[gltf.scene || 0].nodes) walkWorld(id);
function descendants(roots) {
  const ids = new Set();
  function walk(id) {
    ids.add(id);
    for (const child of gltf.nodes[id].children || []) walk(child);
  }
  roots.forEach(walk);
  return [...ids];
}
const nodeIds = [
  ...new Set(Object.values(definitions).flatMap((d) => descendants(d.roots))),
];
const meshIds = [
  ...new Set(
    nodeIds.map((id) => gltf.nodes[id].mesh).filter((x) => x !== undefined),
  ),
];
const materialIds = [
  ...new Set(
    meshIds.flatMap((id) => gltf.meshes[id].primitives.map((p) => p.material)),
  ),
].sort((a, b) => a - b);
const accessorIds = [
  ...new Set(
    meshIds.flatMap((id) =>
      gltf.meshes[id].primitives.flatMap((p) => [
        p.indices,
        ...Object.values(p.attributes),
      ]),
    ),
  ),
].sort((a, b) => a - b);
const bufferViewIds = [
  ...new Set(accessorIds.map((id) => gltf.accessors[id].bufferView)),
].sort((a, b) => a - b);
const sourceChunks = [];
const sourceViews = {};
let sourceBytes = 0;
for (const id of bufferViewIds) {
  const view = gltf.bufferViews[id];
  const padding = (4 - (sourceBytes % 4)) % 4;
  sourceChunks.push(Buffer.alloc(padding));
  sourceBytes += padding;
  sourceViews[id] = { ...view, byteOffset: sourceBytes };
  const bytes = fullBinary.subarray(
    view.byteOffset || 0,
    (view.byteOffset || 0) + view.byteLength,
  );
  sourceChunks.push(bytes);
  sourceBytes += bytes.length;
}
const capture = {
  source:
    "NVIDIAGameWorks/rtxdi-assets/bistro, byte-identical source buffer mirrored by zeux/niagara_bistro",
  originalBinarySha256: expectedBinaryHash,
  originalGltfSha256: originalGltfHash,
  originalGltfBytes,
  note: "Exact selected bufferView bytes, without quantization or topology changes. Dictionary keys retain the original glTF indices. World matrices include all original ancestor transforms.",
  definitions,
  nodes: Object.fromEntries(
    nodeIds.map((id) => [
      id,
      { ...gltf.nodes[id], worldMatrix: worlds.get(id).toArray() },
    ]),
  ),
  meshes: Object.fromEntries(meshIds.map((id) => [id, gltf.meshes[id]])),
  accessors: Object.fromEntries(
    accessorIds.map((id) => [id, gltf.accessors[id]]),
  ),
  bufferViews: sourceViews,
  materials: Object.fromEntries(
    materialIds.map((id) => [id, gltf.materials[id]]),
  ),
  textures: gltf.textures,
  samplers: gltf.samplers || [],
};
await writeFile(
  folder + "source-selected.json",
  JSON.stringify(capture, null, 2) + "\n",
);
await writeFile(
  folder + "source-selected.bin.gz",
  gzipSync(Buffer.concat(sourceChunks), { level: 9 }),
);

const constructors = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(id) {
  const a = gltf.accessors[id],
    view = gltf.bufferViews[a.bufferView];
  const Type = constructors[a.componentType],
    size = sizes[a.type];
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || Type.BYTES_PER_ELEMENT * size;
  const values = new Type(a.count * size);
  for (let index = 0; index < a.count; index++)
    values.set(
      new Type(
        fullBinary.buffer,
        fullBinary.byteOffset + start + index * stride,
        size,
      ),
      index * size,
    );
  return values;
}
const chunks = [];
let total = 0;
function append(values) {
  const padding = (4 - (total % 4)) % 4;
  chunks.push(Buffer.alloc(padding));
  total += padding;
  const offset = total;
  const bytes = Buffer.from(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  chunks.push(bytes);
  total += bytes.length;
  return { offset, length: values.length };
}
function quantize(values, size, signed = false) {
  const low = Array(size).fill(Infinity),
    high = Array(size).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i]))
      throw Error("Non-finite Bistro vertex attribute");
    low[i % size] = Math.min(low[i % size], values[i]);
    high[i % size] = Math.max(high[i % size], values[i]);
  }
  const out = signed
    ? new Int16Array(values.length)
    : new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const c = i % size;
    out[i] = signed
      ? Math.round(Math.max(-1, Math.min(1, values[i])) * 32767)
      : Math.round(
          ((values[i] - low[c]) / Math.max(1e-12, high[c] - low[c])) * 65535,
        );
  }
  return { ...append(out), size, signed, low, high };
}
const variants = {};
for (const [variant, definition] of Object.entries(definitions)) {
  const parts = [],
    bounds = new THREE.Box3();
  for (const id of descendants(definition.roots)) {
    const node = gltf.nodes[id];
    if (node.mesh === undefined) continue;
    const matrix = worlds.get(id),
      normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const determinantSign = matrix.determinant() < 0 ? -1 : 1;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4)
        throw Error("Expected triangle primitives");
      const position = accessor(primitive.attributes.POSITION);
      const normal = accessor(primitive.attributes.NORMAL);
      const tangent =
        primitive.attributes.TANGENT === undefined
          ? null
          : accessor(primitive.attributes.TANGENT);
      const indices = accessor(primitive.indices);
      const point = new THREE.Vector3(),
        direction = new THREE.Vector3();
      for (let index = 0; index < position.length; index += 3) {
        point.fromArray(position, index).applyMatrix4(matrix);
        bounds.expandByPoint(point);
        point.toArray(position, index);
        direction
          .fromArray(normal, index)
          .applyMatrix3(normalMatrix)
          .normalize()
          .toArray(normal, index);
        if (tangent) {
          const ti = (index / 3) * 4;
          direction
            .fromArray(tangent, ti)
            .transformDirection(matrix)
            .toArray(tangent, ti);
          tangent[ti + 3] *= determinantSign;
        }
      }
      if (determinantSign < 0)
        for (let index = 0; index < indices.length; index += 3)
          [indices[index + 1], indices[index + 2]] = [
            indices[index + 2],
            indices[index + 1],
          ];
      const uv = accessor(primitive.attributes.TEXCOORD_0);
      parts.push({
        sourceNode: id,
        name: node.name,
        material: materialIds.indexOf(primitive.material),
        position,
        normal,
        tangent,
        uv,
        indices,
      });
    }
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  centre.y = bounds.min.y;
  const packedParts = parts.map((part) => {
    for (let index = 0; index < part.position.length; index += 3) {
      part.position[index] -= centre.x;
      part.position[index + 1] -= centre.y;
      part.position[index + 2] -= centre.z;
    }
    return {
      sourceNode: part.sourceNode,
      name: part.name,
      material: part.material,
      position: quantize(part.position, 3),
      normal: quantize(part.normal, 3, true),
      tangent: part.tangent && quantize(part.tangent, 4, true),
      uv: quantize(part.uv, 2),
      indices: {
        ...append(part.indices),
        type: part.indices instanceof Uint32Array ? "u32" : "u16",
      },
    };
  });
  const width = bounds.max.x - bounds.min.x,
    depth = bounds.max.z - bounds.min.z;
  variants[variant] = {
    name: definition.name,
    sourceRoots: definition.roots,
    sourceOrigin: centre.toArray(),
    bounds: {
      width,
      depth,
      length: depth,
      height: bounds.max.y - bounds.min.y,
    },
    triangles: parts.reduce((sum, part) => sum + part.indices.length / 3, 0),
    parts: packedParts,
  };
}
const textureManifest = JSON.parse(
  await readFile(folder + "texture-manifest.json", "utf8"),
);
const entries = textureManifest.textures;
const textureIds = entries.map((entry) => entry.texture);
const outputFiles = [...new Set(entries.map((entry) => entry.uri))];
const imageData = await Promise.all(
  outputFiles.map(async (file) => {
    const entry = entries.find((e) => e.uri === file),
      bytes = await readFile(folder + file);
    return `data:${entry.mime};base64,${bytes.toString("base64")}`;
  }),
);
function remapTextures(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(remapTextures);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /Texture$/.test(key) && item?.index !== undefined
        ? { ...item, index: textureIds.indexOf(item.index) }
        : remapTextures(item),
    ]),
  );
}
const compressed = gzipSync(Buffer.concat(chunks), { level: 9 });
const meta = {
  name: "Bistro district architecture",
  license: "MIT",
  copyright: "Copyright (c) 2023 NVIDIA GameWorks",
  credit:
    "Amazon Lumberyard Bistro; NVIDIA GameWorks RTXDI assets; mirror by Arseny Kapoulkine",
  source:
    "https://github.com/NVIDIAGameWorks/rtxdi-assets/tree/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/bistro",
  variants,
  materials: materialIds.map((id) => ({
    ...remapTextures(gltf.materials[id]),
    sourceMaterial: id,
  })),
  textures: entries.map((entry) => ({
    ...gltf.textures[entry.texture],
    source: outputFiles.indexOf(entry.uri),
    extensions: undefined,
  })),
  samplers: gltf.samplers || [],
  adaptations:
    "Selected exterior architecture only; original ancestor transforms baked, centered X/Z and ground normalized; positions/UV 16-bit, signed normal/tangent 16-bit; DDS converted and reduced in resolution; specular-glossiness shading retained through a local physical-material shader adapter. Glass uses opaque reflective panes to avoid transmission of the empty building shell.",
};
await writeFile(
  folder + "district-game.json",
  JSON.stringify(meta, null, 2) + "\n",
);
await writeFile(folder + "district-game.bin.gz", compressed);
await writeFile(
  root + "src/district-asset-data.js",
  `// Generated by scripts/pack-district-asset.mjs. Bistro architecture, NVIDIA GameWorks MIT.\nexport const DISTRICT_META=${JSON.stringify(meta)};\nexport const DISTRICT_GEOMETRY=Uint8Array.from(atob('${compressed.toString("base64")}'),c=>c.charCodeAt(0));\nexport const DISTRICT_IMAGES=${JSON.stringify(imageData)};\n`,
);
const manifest = {
  officialRepository: meta.source,
  officialCommit: "1da7b749ef0e3fb606ab46dde8e5bfbacd078a02",
  officialLicense:
    "https://raw.githubusercontent.com/NVIDIAGameWorks/rtxdi-assets/1da7b749ef0e3fb606ab46dde8e5bfbacd078a02/LICENSE",
  mirror:
    "https://github.com/zeux/niagara_bistro/tree/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e",
  mirrorCommit: "2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e",
  source: [
    {
      file: "bistro.bin",
      retained:
        "Outside repository; selected exact bufferViews retained in source-selected.bin.gz",
      bytes: 95660264,
      sha256: expectedBinaryHash,
      url: "https://raw.githubusercontent.com/zeux/niagara_bistro/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e/bistro.bin",
      verifiedAgainstOfficialLFSPointer: true,
    },
    {
      file: "bistro.gltf",
      retained: "Selected definitions retained in source-selected.json",
      bytes: originalGltfBytes,
      sha256: originalGltfHash,
      url: "https://raw.githubusercontent.com/zeux/niagara_bistro/2bdb6a410f8ebd475d3737e7c8e038ed2b00b02e/bistro.gltf",
    },
  ],
  derived: [],
};
for (const file of [
  "source-selected.json",
  "source-selected.bin.gz",
  "district-game.json",
  "district-game.bin.gz",
]) {
  const bytes = await readFile(folder + file);
  manifest.derived.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
}
await writeFile(
  folder + "source-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      variants: Object.fromEntries(
        Object.entries(variants).map(([name, v]) => [
          name,
          { triangles: v.triangles, bounds: v.bounds, parts: v.parts.length },
        ]),
      ),
      geometryGzipBytes: compressed.length,
      images: imageData.length,
      imageDataCharacters: imageData.reduce((sum, s) => sum + s.length, 0),
      losslessSourceBytes: sourceBytes,
    },
    null,
    2,
  ),
);

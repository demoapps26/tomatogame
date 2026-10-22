import * as THREE from "three";
import {
  SCAN_HEAD_GLB,
  SCAN_HEAD_COLOR,
  SCAN_HEAD_NORMAL,
  SCAN_HEAD_META,
} from "./head-scan-data.js";

// Lee Perry-Smith / Infinite-Realities, CC BY 3.0. The packed source is retained
// with its licence in assets/head-scan; the in-game credits name the author.
const state = {
  loaded: 0,
  failed: 0,
  total: typeof Image === "undefined" ? 0 : 2,
};
const liveTextures = new Set();
const pending = [];
function sourceTexture(url, colour) {
  if (typeof Image === "undefined") {
    const pixels = new Uint8Array(
      colour ? [226, 183, 157, 255] : [128, 128, 255, 255],
    );
    const texture = new THREE.DataTexture(pixels, 1, 1, THREE.RGBAFormat);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const image = new Image();
  const texture = new THREE.Texture(image);
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  pending.push(
    new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {}
        texture.needsUpdate = true;
        for (const clone of liveTextures)
          if (clone.source === texture.source) clone.needsUpdate = true;
        state.loaded++;
        resolve();
      };
      image.onerror = () => {
        state.failed++;
        resolve();
      };
      image.src = url;
    }),
  );
  return texture;
}
const colourSource = sourceTexture(SCAN_HEAD_COLOR, true);
const normalSource = sourceTexture(SCAN_HEAD_NORMAL, false);
const ready = Promise.all(pending).then(() => getScannedHeadState());
export function scannedHeadsReady() {
  return ready;
}
export function getScannedHeadState() {
  return { ...state, ready: state.loaded + state.failed === state.total };
}
function ownTexture(source) {
  const texture = source.clone();
  texture.needsUpdate = true;
  liveTextures.add(texture);
  texture.addEventListener("dispose", () => liveTextures.delete(texture));
  return texture;
}

function readScan() {
  const bytes = SCAN_HEAD_GLB;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
    throw new Error("Invalid bundled head scan.");
  let json, binary;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("Incomplete bundled head scan.");
  const constructors = {
    5121: Uint8Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array,
  };
  const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function accessor(index) {
    const definition = json.accessors[index],
      buffer = json.bufferViews[definition.bufferView];
    const Type = constructors[definition.componentType],
      size = sizes[definition.type];
    if (!Type || !size || buffer.buffer !== 0)
      throw new Error("Unsupported bundled head accessor.");
    const start =
      binary.byteOffset +
      (buffer.byteOffset || 0) +
      (definition.byteOffset || 0);
    const stride = buffer.byteStride || Type.BYTES_PER_ELEMENT * size;
    const values = new Type(definition.count * size);
    if (stride === Type.BYTES_PER_ELEMENT * size)
      values.set(new Type(binary.buffer, start, values.length));
    else
      for (let i = 0; i < definition.count; i++)
        values.set(new Type(binary.buffer, start + i * stride, size), i * size);
    return new THREE.BufferAttribute(values, size, !!definition.normalized);
  }
  const node = json.nodes.find((node) => node.mesh !== undefined),
    primitive = json.meshes[node.mesh].primitives[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", accessor(primitive.attributes.POSITION));
  geometry.setAttribute("normal", accessor(primitive.attributes.NORMAL));
  geometry.setAttribute("uv", accessor(primitive.attributes.TEXCOORD_0));
  geometry.setIndex(accessor(primitive.indices));
  const matrix = new THREE.Matrix4();
  if (node.matrix) matrix.fromArray(node.matrix);
  else
    matrix.compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])),
    );
  geometry.applyMatrix4(matrix);

  // The original includes shoulders. Crop them below the shirt collar and
  // taper/stretch only the lower neck; the scanned facial proportions stay intact.
  const positions = geometry.getAttribute("position"),
    indices = geometry.index;
  const retained = [];
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i),
      b = indices.getX(i + 1),
      c = indices.getX(i + 2);
    if (
      positions.getY(a) >= -2.2 &&
      positions.getY(b) >= -2.2 &&
      positions.getY(c) >= -2.2
    )
      retained.push(a, b, c);
  }
  geometry.setIndex(retained);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const neck = THREE.MathUtils.clamp((-0.8 - y) / 1.4, 0, 1);
    positions.setXYZ(
      i,
      x * 0.052 * (1 - neck * 0.68) + 0.004,
      y >= -0.8 ? 1.5934 + y * 0.052 : 1.5518 - neck * 0.1268,
      z * 0.052 * (1 - neck * 0.45) - 0.007 + neck * 0.02,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
const template = readScan();
const tints = [0xffffff, 0xf2e8db, 0xc2a185, 0xfff1e7, 0xe2c5ad];

/** Actual scanned facial geometry and photographic skin, local +Z facing. */
export function createScannedHead({
  index = 0,
  tint = tints[Math.abs(index) % tints.length],
} = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: tint,
    map: ownTexture(colourSource),
    normalMap: ownTexture(normalSource),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.69,
    metalness: 0,
    ior: 1.4,
    specularIntensity: 0.28,
    sheen: 0.06,
    sheenRoughness: 0.85,
  });
  const head = new THREE.Mesh(template.clone(), material);
  head.name = "photographic-scanned-head";
  head.castShadow = head.receiveShadow = true;
  head.userData.source = SCAN_HEAD_META.name;
  head.userData.license = SCAN_HEAD_META.license;
  return head;
}

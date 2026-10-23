import * as THREE from "three";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import {
  FURNITURE_META,
  FURNITURE_GEOMETRY,
  FURNITURE_IMAGES,
} from "./furniture-asset-data.js";

// SheenChair by Eric Chadwick / Wayfair, CC0. Original files and provenance are
// retained in assets/new-realism/chair; every returned group owns its resources.
const state = {
  loaded: 0,
  failed: 0,
  total:
    typeof Image === "undefined" ? 0 : FURNITURE_IMAGES.filter(Boolean).length,
};
const clones = new Set(),
  pending = [];
const images = FURNITURE_IMAGES.map((url) => {
  if (!url || typeof Image === "undefined") return null;
  const image = new Image();
  pending.push(
    new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {}
        state.loaded++;
        for (const texture of clones)
          if (texture.image === image) texture.needsUpdate = true;
        resolve();
      };
      image.onerror = () => {
        state.failed++;
        resolve();
      };
      image.src = url;
    }),
  );
  return image;
});
const sharedImageSources = new WeakMap();
const ready = Promise.all(pending).then(() => getFurnitureAssetState());
export function furnitureAssetsReady() {
  return ready;
}
export function getFurnitureAssetState() {
  return {
    ...state,
    ready: state.loaded + state.failed === state.total,
    name: FURNITURE_META.name,
    license: FURNITURE_META.license,
    triangles: FURNITURE_META.triangles,
  };
}
const binary = gunzipSync(FURNITURE_GEOMETRY);
function decode(description) {
  const { offset, length, size, normal, low, high } = description;
  const quantized = normal
    ? new Int16Array(binary.buffer, binary.byteOffset + offset, length)
    : new Uint16Array(binary.buffer, binary.byteOffset + offset, length);
  const array = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const c = i % size;
    array[i] = normal
      ? quantized[i] / 32767
      : low[c] + (quantized[i] / 65535) * (high[c] - low[c]);
  }
  return new THREE.BufferAttribute(array, size);
}
const geometries = FURNITURE_META.parts.map((part) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", decode(part.position));
  geometry.setAttribute("normal", decode(part.normal));
  geometry.setAttribute("uv", decode(part.uv));
  geometry.setAttribute("uv1", decode(part.uv1));
  const Type = part.indices.type === "u32" ? Uint32Array : Uint16Array;
  geometry.setIndex(
    new THREE.BufferAttribute(
      new Type(
        binary.buffer,
        binary.byteOffset + part.indices.offset,
        part.indices.length,
      ).slice(),
      1,
    ),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
});
const wrapping = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
};
const filtering = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
};

/** A real curved timber and velvet lounge chair; +Z forward, floor at y=0. */
export function createDetailedChair({ fabricColor = 0xa36b45 } = {}) {
  const group = new THREE.Group();
  group.name = "detailed-velvet-lounge-chair";
  group.userData.bounds = { ...FURNITURE_META.bounds };
  group.userData.source = FURNITURE_META.name;
  group.userData.license = FURNITURE_META.license;
  const textureCache = new Map();
  function textureFor(info, colour = false) {
    if (!info) return null;
    const definition = FURNITURE_META.textures[info.index],
      transform = info.extensions?.KHR_texture_transform;
    const key = JSON.stringify([
      info.index,
      colour,
      info.texCoord || 0,
      transform,
    ]);
    if (textureCache.has(key)) return textureCache.get(key);
    const image = images[definition.source],
      sampler = FURNITURE_META.samplers?.[definition.sampler] || {};
    const texture = image
      ? new THREE.Texture(image)
      : new THREE.DataTexture(
          new Uint8Array(colour ? [255, 255, 255, 255] : [128, 128, 255, 255]),
          1,
          1,
          THREE.RGBAFormat,
        );
    // Source pixels are immutable and share a GPU upload; sampler objects stay
    // independent so disposing one furniture/car instance preserves the others.
    if (image) {
      const shared = sharedImageSources.get(image);
      if (shared) texture.source = shared;
      else sharedImageSources.set(image, texture.source);
    }
    texture.flipY = false;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.channel = transform?.texCoord ?? info.texCoord ?? 0;
    texture.wrapS = wrapping[sampler.wrapS] || THREE.RepeatWrapping;
    texture.wrapT = wrapping[sampler.wrapT] || THREE.RepeatWrapping;
    texture.magFilter = filtering[sampler.magFilter] || THREE.LinearFilter;
    texture.minFilter =
      filtering[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
    if (transform?.offset) texture.offset.fromArray(transform.offset);
    if (transform?.scale) texture.repeat.fromArray(transform.scale);
    if (transform?.rotation) texture.rotation = transform.rotation;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    clones.add(texture);
    texture.addEventListener("dispose", () => clones.delete(texture));
    textureCache.set(key, texture);
    return texture;
  }
  const materials = FURNITURE_META.materials.map((definition, id) => {
    if (!definition) return null;
    const pbr = definition.pbrMetallicRoughness || {},
      factor = pbr.baseColorFactor || [1, 1, 1, 1];
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(factor[0], factor[1], factor[2]),
      roughness: pbr.roughnessFactor ?? 1,
      metalness: pbr.metallicFactor ?? 1,
      map: textureFor(pbr.baseColorTexture, true),
      normalMap: textureFor(definition.normalTexture),
      normalScale: new THREE.Vector2(
        definition.normalTexture?.scale ?? 1,
        definition.normalTexture?.scale ?? 1,
      ),
      roughnessMap: textureFor(pbr.metallicRoughnessTexture),
      metalnessMap: textureFor(pbr.metallicRoughnessTexture),
      aoMap: textureFor(definition.occlusionTexture),
      aoMapIntensity: 0.8,
      envMapIntensity: 0.8,
    });
    material.name = `photographic-chair-${definition.name}`;
    if (id === 0) {
      material.color.set(fabricColor);
      material.metalness = 0;
      material.sheen = 0.8;
      material.sheenColor.copy(material.color).multiplyScalar(0.8);
      material.sheenRoughness = 0.8;
    }
    if (id === 1) {
      material.metalness = 0;
      material.roughness = 0.65;
    }
    return material;
  });
  FURNITURE_META.parts.forEach((part, index) => {
    const mesh = new THREE.Mesh(
      geometries[index].clone(),
      materials[part.material],
    );
    mesh.name = part.name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

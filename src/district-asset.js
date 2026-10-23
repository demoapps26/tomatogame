import * as THREE from "three";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  DISTRICT_META,
  DISTRICT_GEOMETRY,
  DISTRICT_IMAGES,
} from "./district-asset-data.js";

// Bistro architecture: NVIDIA GameWorks MIT. Source, exact selected geometry,
// conversion script, texture hashes and the complete licence are retained in
// assets/district-v9. Each factory result owns geometry/material/texture objects.
const state = {
  loaded: 0,
  failed: 0,
  total: typeof Image === "undefined" ? 0 : DISTRICT_IMAGES.length,
};
const liveTextures = new Set(),
  sharedImageSources = new WeakMap(),
  pending = [];
const images = DISTRICT_IMAGES.map((url) => {
  if (typeof Image === "undefined") return null;
  const image = new Image();
  pending.push(
    new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {}
        state.loaded++;
        for (const texture of liveTextures)
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
const ready = Promise.all(pending).then(() => getDistrictAssetState());
export function districtAssetsReady() {
  return ready;
}
export function getDistrictAssetState() {
  return {
    ...state,
    ready: state.loaded + state.failed === state.total,
    name: DISTRICT_META.name,
    license: DISTRICT_META.license,
    variants: Object.fromEntries(
      Object.entries(DISTRICT_META.variants).map(([key, value]) => [
        key,
        { triangles: value.triangles, bounds: { ...value.bounds } },
      ]),
    ),
  };
}
const binary = gunzipSync(DISTRICT_GEOMETRY);
function decode({ offset, length, size, signed, low, high }) {
  const Type = signed ? Int16Array : Uint16Array;
  const quantized = new Type(binary.buffer, binary.byteOffset + offset, length);
  const array = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const c = index % size;
    array[index] = signed
      ? quantized[index] / 32767
      : low[c] + (quantized[index] / 65535) * (high[c] - low[c]);
  }
  return new THREE.BufferAttribute(array, size);
}
const templates = new Map();
for (const [variant, definition] of Object.entries(DISTRICT_META.variants)) {
  const batches = new Map();
  for (const part of definition.parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", decode(part.position));
    geometry.setAttribute("normal", decode(part.normal));
    geometry.setAttribute("uv", decode(part.uv));
    if (part.tangent) geometry.setAttribute("tangent", decode(part.tangent));
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
    // Preserve transparent overlays separately from their opaque supporting wall.
    const key = `${part.material}:${part.tangent ? "tangent" : "derived"}`;
    if (!batches.has(key))
      batches.set(key, { material: part.material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  }
  templates.set(
    variant,
    [...batches.values()].map((batch) => {
      const geometry = mergeGeometries(batch.geometries, false);
      if (!geometry)
        throw Error("Could not merge selected Bistro architecture");
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      batch.geometries.forEach((g) => g.dispose());
      return { material: batch.material, geometry };
    }),
  );
}
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

// glTF's specular-glossiness extension stores a direct F0 and gloss in alpha.
// Retain both instead of treating the alpha channel as metallic/roughness G.
// This local adapter does not modify Three's global shader chunks.
function useSpecularGlossiness(material, hasGlossMap) {
  material.customProgramCacheKey = () =>
    `bistro-specular-glossiness-v1-${hasGlossMap ? "map" : "constant"}`;
  material.onBeforeCompile = (shader) => {
    if (hasGlossMap)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor = 1.0 - ( 1.0 - roughness ) * texelRoughness.a;
        #endif
      `,
      );
    const physical = THREE.ShaderChunk.lights_physical_fragment
      .replace(
        "pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor",
        "specularColorFactor",
      )
      .replace(
        "#ifdef USE_CLEARCOAT",
        "material.diffuseColor *= 1.0 - max( max( material.specularColor.r, material.specularColor.g ), material.specularColor.b );\n#ifdef USE_CLEARCOAT",
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_fragment>",
      physical,
    );
  };
}

/** Detailed corner café or townhouse. Centred X/Z, floor y=0; bounds in metres. */
export function createDetailedBuilding({ variant = "cafe", colour } = {}) {
  if (!templates.has(variant))
    throw new RangeError(`Unknown district building variant: ${variant}`);
  const definition = DISTRICT_META.variants[variant];
  const group = new THREE.Group();
  group.name = `detailed-district-${variant}`;
  group.userData.bounds = { ...definition.bounds };
  group.userData.variant = variant;
  group.userData.source = definition.name;
  group.userData.license = DISTRICT_META.license;
  const cache = new Map();
  function textureFor(info, colourMap = false, neutralNormal = false) {
    if (!info) return null;
    const textureDefinition = DISTRICT_META.textures[info.index];
    if (!textureDefinition) throw Error("Missing district material texture");
    const transform = info.extensions?.KHR_texture_transform;
    const key = JSON.stringify([
      info.index,
      colourMap,
      neutralNormal,
      info.texCoord || 0,
      transform,
    ]);
    if (cache.has(key)) return cache.get(key);
    const image = images[textureDefinition.source],
      sampler = DISTRICT_META.samplers[textureDefinition.sampler] || {};
    const texture = image
      ? new THREE.Texture(image)
      : new THREE.DataTexture(
          new Uint8Array(
            neutralNormal ? [128, 128, 255, 255] : [255, 255, 255, 255],
          ),
          1,
          1,
          THREE.RGBAFormat,
        );
    if (image) {
      const shared = sharedImageSources.get(image);
      if (shared) texture.source = shared;
      else sharedImageSources.set(image, texture.source);
    }
    texture.flipY = false;
    texture.colorSpace = colourMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
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
    liveTextures.add(texture);
    texture.addEventListener("dispose", () => liveTextures.delete(texture));
    cache.set(key, texture);
    return texture;
  }
  const usedMaterials = new Set(
    templates.get(variant).map((part) => part.material),
  );
  const materials = DISTRICT_META.materials.map((source, index) => {
    if (!usedMaterials.has(index)) return null;
    const sg = source.extensions?.KHR_materials_pbrSpecularGlossiness;
    const pbr = source.pbrMetallicRoughness || {};
    const factor = sg?.diffuseFactor || pbr.baseColorFactor || [1, 1, 1, 1];
    const glossMap = sg ? textureFor(sg.specularGlossinessTexture, true) : null;
    const normalScale = source.normalTexture?.scale ?? 1;
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(factor[0], factor[1], factor[2]),
      opacity: factor[3],
      transparent: source.alphaMode === "BLEND",
      alphaTest: source.alphaMode === "MASK" ? (source.alphaCutoff ?? 0.5) : 0,
      side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      metalness: sg ? 0 : (pbr.metallicFactor ?? 1),
      roughness: sg
        ? 1 - (sg.glossinessFactor ?? 1)
        : (pbr.roughnessFactor ?? 1),
      map: textureFor(sg?.diffuseTexture || pbr.baseColorTexture, true),
      normalMap: textureFor(source.normalTexture, false, true),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      roughnessMap: glossMap || textureFor(pbr.metallicRoughnessTexture),
      metalnessMap: sg ? null : textureFor(pbr.metallicRoughnessTexture),
      specularColor: new THREE.Color().fromArray(
        sg?.specularFactor || [1, 1, 1],
      ),
      specularColorMap: glossMap,
      aoMap: textureFor(source.occlusionTexture),
      aoMapIntensity: source.occlusionTexture?.strength ?? 1,
      emissive: new THREE.Color().fromArray(source.emissiveFactor || [0, 0, 0]),
      emissiveMap: textureFor(source.emissiveTexture, true),
      envMapIntensity: 0.85,
    });
    material.name = `bistro-${source.name}`;
    material.userData.sourceMaterial = source.sourceMaterial;
    if (sg) useSpecularGlossiness(material, Boolean(glossMap));
    if (source.alphaMode === "BLEND") {
      material.depthWrite = false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    if (source.extensions?.KHR_materials_transmission) {
      // The source has no visitable furnished interior behind these panes.
      // A reflective opaque surface avoids rendering an extra transmission pass.
      material.color.setHex(0x24333b);
      material.metalness = 0.58;
      material.roughness = /dirty/i.test(source.name) ? 0.27 : 0.14;
      material.envMapIntensity = 1.05;
    }
    if (
      colour !== undefined &&
      /Concrete_Yellow|Concrete_Plaster|concrete_smooth_03/i.test(source.name)
    )
      material.color.lerp(new THREE.Color(colour), 0.24);
    return material;
  });
  for (const part of templates.get(variant)) {
    const mesh = new THREE.Mesh(
      part.geometry.clone(),
      materials[part.material],
    );
    mesh.name = materials[part.material].name;
    mesh.castShadow = !mesh.material.transparent;
    mesh.receiveShadow = true;
    if (mesh.material.transparent) mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

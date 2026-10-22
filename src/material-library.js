import * as THREE from "three";
import {
  PHOTO_ASSETS,
  createPhotoTextures,
  photoAssetsReady,
} from "./photo-assets.js";

const requestedKinds = new Set();
let readiness = "loading";
let readinessError = "";

/** Original scan images are shared; each world owns its Texture instances. */
export const assetReady = Promise.resolve()
  .then(() => photoAssetsReady())
  .then(() => {
    readiness = "ready";
  })
  .catch((error) => {
    readiness = "failed";
    readinessError = String(error?.message || error);
    throw error;
  });

export function getPhotoAssetState() {
  return {
    status: readiness,
    ready: readiness === "ready",
    requestedKinds: [...requestedKinds],
    error: readinessError,
  };
}

// All three PBR channels use the same physical projection. The original world
// applied this only to colour, so normal and roughness details were stretched
// across whole buildings and changed scale between adjacent instances.
const photoFunctions = /* glsl */ `
  uniform float photoMeters;
  varying vec3 vPhotoPosition;
  varying vec3 vPhotoNormal;

  vec3 photoSigns(vec3 n) {
    return mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), n));
  }
  vec3 photoWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(8.0));
    return w / max(dot(w, vec3(1.0)), 0.0001);
  }
  vec2 photoUvX(vec3 p, vec3 signs) { return vec2(-p.z * signs.x, p.y); }
  vec2 photoUvY(vec3 p, vec3 signs) { return vec2(p.x, -p.z * signs.y); }
  vec2 photoUvZ(vec3 p, vec3 signs) { return vec2(p.x * signs.z, p.y); }

  vec4 photoSample(sampler2D image, vec3 p, vec3 n) {
    vec3 w = photoWeights(n);
    vec3 signs = photoSigns(n);
    // City geometry is mainly planar. A coherent branch avoids paying for
    // three texture reads on every face; sloping/rounded surfaces still blend.
    if (w.x > 0.995) return texture2D(image, photoUvX(p, signs));
    if (w.y > 0.995) return texture2D(image, photoUvY(p, signs));
    if (w.z > 0.995) return texture2D(image, photoUvZ(p, signs));
    return texture2D(image, photoUvX(p, signs)) * w.x
      + texture2D(image, photoUvY(p, signs)) * w.y
      + texture2D(image, photoUvZ(p, signs)) * w.z;
  }

  vec2 photoSlope(vec3 tangentNormal) {
    vec3 n = tangentNormal * 2.0 - 1.0;
    return n.xy / max(n.z, 0.35);
  }
  vec3 photoNormal(sampler2D image, vec3 p, vec3 n, vec2 strength) {
    vec3 w = photoWeights(n);
    vec3 signs = photoSigns(n);
    vec3 offset = vec3(0.0);
    if (w.x > 0.001) {
      vec2 slope = photoSlope(texture2D(image, photoUvX(p, signs)).xyz) * strength;
      offset += vec3(0.0, slope.y, -slope.x * signs.x) * w.x;
    }
    if (w.y > 0.001) {
      vec2 slope = photoSlope(texture2D(image, photoUvY(p, signs)).xyz) * strength;
      offset += vec3(slope.x, 0.0, -slope.y * signs.y) * w.y;
    }
    if (w.z > 0.001) {
      vec2 slope = photoSlope(texture2D(image, photoUvZ(p, signs)).xyz) * strength;
      offset += vec3(slope.x * signs.z, slope.y, 0.0) * w.z;
    }
    // Preserve the real geometry normal on sloping roofs and curved objects.
    // Blending the three axis normals themselves would flatten those surfaces.
    offset -= n * dot(offset, n);
    return normalize(n + offset);
  }
`;

/**
 * Upgrade a world material in place, preserving the world's instancing,
 * batching, colour choices, shadow support and ownership/disposal system.
 * `meters` is the physical width of one photographed tile in world metres.
 */
export function applyPhotographicMaterial(material, kind, options = {}) {
  if (!material?.isMeshStandardMaterial)
    throw new TypeError(
      "Photographic surfaces require a standard PBR material.",
    );
  if (!PHOTO_ASSETS[kind])
    throw new RangeError(`Unknown photographic surface: ${kind}`);
  const meters = Math.max(0.15, Number(options.meters) || 2);
  const strength = Number.isFinite(options.normalStrength)
    ? Math.max(0, Math.min(2, options.normalStrength))
    : 0.45;
  const textures = createPhotoTextures(kind);
  Object.assign(material, textures);
  material.roughness = Number.isFinite(options.roughness)
    ? Math.max(0, Math.min(1, options.roughness))
    : 0.98;
  material.normalScale.set(strength, strength);
  if (options.color !== undefined) material.color.set(options.color);
  material.name = `photo-${kind}`;
  material.userData.photographic = {
    kind,
    meters,
    source: PHOTO_ASSETS[kind].source,
    license: PHOTO_ASSETS[kind].license,
  };
  requestedKinds.add(kind);

  // Deliberately replaces the old worldSurface colour-only projection.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.photoMeters = { value: meters };
    shader.vertexShader =
      "varying vec3 vPhotoPosition;\nvarying vec3 vPhotoNormal;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 photoPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        photoPosition = batchingMatrix * photoPosition;
      #endif
      #ifdef USE_INSTANCING
        photoPosition = instanceMatrix * photoPosition;
      #endif
      vPhotoPosition = (modelMatrix * photoPosition).xyz;
      // Three already corrected transformedNormal for nonuniform instance
      // scale. Undoing only the view rotation gives a proper world normal.
      vPhotoNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${photoFunctions}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = photoSample(map, vPhotoPosition / photoMeters, normalize(vPhotoNormal));
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= photoSample(roughnessMap, vPhotoPosition / photoMeters, normalize(vPhotoNormal)).g;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#ifdef USE_NORMALMAP
        vec3 photoBaseNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 photoMappedNormal = photoNormal(normalMap, vPhotoPosition / photoMeters, photoBaseNormal, normalScale);
        normal = normalize(mat3(viewMatrix) * photoMappedNormal);
      #endif`,
    );
  };
  material.customProgramCacheKey = () => "photographic-world-pbr-v1";
  material.needsUpdate = true;
  return material;
}

export function createPhotographicMaterial(kind, options = {}) {
  const { meters, normalStrength, ...materialOptions } = options;
  return applyPhotographicMaterial(
    new THREE.MeshStandardMaterial(materialOptions),
    kind,
    { ...materialOptions, meters, normalStrength },
  );
}

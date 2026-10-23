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

// This layer varies *materials*, not lighting. It deliberately uses no extra
// texture reads: the scans still supply all of the fine surface relief. Long
// wavelengths break tile repetition, while short, sparse road repairs have a
// physical size in metres and remain fixed when an instance or camera moves.
const weatheringFunctions = /* glsl */ `
  #if PHOTO_WEATHER_KIND > 0
    float photoSurfaceHash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    float photoSurfaceNoise(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(photoSurfaceHash(cell), photoSurfaceHash(cell + vec2(1.0, 0.0)), f.x),
                 mix(photoSurfaceHash(cell + vec2(0.0, 1.0)), photoSurfaceHash(cell + vec2(1.0)), f.x), f.y);
    }
    vec2 photoSurfacePlane(vec3 p, vec3 n) {
      vec3 axis = abs(n);
      if (axis.y >= max(axis.x, axis.z)) return p.xz;
      return axis.x > axis.z ? vec2(p.z, p.y) : p.xy;
    }
    vec4 photoSurfaceWeather(vec3 p, vec3 n) {
      vec2 plane = photoSurfacePlane(p, n);
      float broad = photoSurfaceNoise(plane * 0.073 + vec2(11.3, 27.7));
      float medium = photoSurfaceNoise(plane * 0.43 + vec2(-9.1, 4.7));
      float variation = (broad - 0.5) * 0.075 + (medium - 0.5) * 0.033;
      #if PHOTO_WEATHER_KIND == 1
        vec2 cellSize = vec2(13.0, 19.0);
        vec2 cell = floor((p.xz + vec2(27.0, 13.0)) / cellSize);
        vec2 local = mod(p.xz + vec2(27.0, 13.0), cellSize);
        float seed = photoSurfaceHash(cell + vec2(17.1, 3.7));
        float second = photoSurfaceHash(cell + vec2(4.2, 29.3));
        vec2 centre = vec2(3.0 + second * 6.0, 4.0 + seed * 9.0);
        vec2 halfSize = vec2(0.7 + seed * 0.9, 1.35 + second * 1.6);
        vec2 offset = local - centre;
        // Repairs are small resurfaced areas, not a city-wide checkerboard.
        float warpedEdge = max(abs(offset.x) / halfSize.x, abs(offset.y) / halfSize.y);
        warpedEdge += sin(offset.y * 6.7 + seed * 8.0) * 0.012;
        float feather = max(fwidth(warpedEdge), 0.018);
        float selected = step(0.81, seed);
        float repairArea = (1.0 - smoothstep(1.0 - feather, 1.0 + feather, warpedEdge)) * selected;
        float seam = (1.0 - smoothstep(0.018, 0.055 + feather, abs(warpedEdge - 1.0))) * selected;
        float horizontal = smoothstep(0.7, 0.96, abs(n.y));
        float pool = smoothstep(0.56, 0.77, broad * 0.73 + medium * 0.27);
        return vec4(variation, repairArea * horizontal, seam * horizontal, pool * horizontal);
      #elif PHOTO_WEATHER_KIND == 2
        float wall = 1.0 - smoothstep(0.18, 0.7, abs(n.y));
        float base = 1.0 - smoothstep(0.12, 1.45, max(0.0, p.y));
        float splash = photoSurfaceNoise(vec2(plane.x * 1.3, plane.y * 0.31) + vec2(7.1, 2.7));
        float dirt = base * wall * (0.36 + splash * 0.64);
        return vec4(variation, dirt, 0.0, 0.0);
      #else
        return vec4(variation * 1.3, 0.0, 0.0, 0.0);
      #endif
    }
  #endif
  #if PHOTO_WEATHER_KIND == 1
    uniform float surfaceWeather;
    uniform float photoDryRoughness;
  #endif
`;

const weatheringKind = (kind) =>
  kind === "asphalt"
    ? 1
    : kind === "plaster" || kind === "concrete"
      ? 2
      : kind === "soil"
        ? 3
        : 0;

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
  const surfaceKind = weatheringKind(kind);
  const dryRoughness = material.roughness;
  const weather = surfaceKind === 1 ? { value: 0 } : null;
  if (weather) material.userData.surfaceWeather = weather;
  else delete material.userData.surfaceWeather;
  requestedKinds.add(kind);

  // Deliberately replaces the old worldSurface colour-only projection.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.photoMeters = { value: meters };
    if (weather) {
      shader.uniforms.surfaceWeather = weather;
      shader.uniforms.photoDryRoughness = { value: dryRoughness };
    }
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
      `#include <common>\n#define PHOTO_WEATHER_KIND ${surfaceKind}\n${photoFunctions}\n${weatheringFunctions}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = photoSample(map, vPhotoPosition / photoMeters, normalize(vPhotoNormal));
        diffuseColor *= sampledDiffuseColor;
      #endif
      #if PHOTO_WEATHER_KIND > 0
        vec4 photoWeather = photoSurfaceWeather(vPhotoPosition, normalize(vPhotoNormal));
        diffuseColor.rgb *= 1.0 + photoWeather.x;
        #if PHOTO_WEATHER_KIND == 1
          float photoRain = clamp(surfaceWeather, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.86, photoWeather.y);
          diffuseColor.rgb *= mix(1.0, 0.80, photoWeather.z);
          diffuseColor.rgb *= 1.0 - photoRain * (0.14 + photoWeather.w * 0.08);
        #elif PHOTO_WEATHER_KIND == 2
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.89, 0.90, 0.86), photoWeather.y);
        #endif
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `float roughnessFactor = roughness;
      float photoScanRoughness = 1.0;
      #ifdef USE_ROUGHNESSMAP
        photoScanRoughness = photoSample(roughnessMap, vPhotoPosition / photoMeters, normalize(vPhotoNormal)).g;
        roughnessFactor *= photoScanRoughness;
      #endif
      #if PHOTO_WEATHER_KIND == 1
        roughnessFactor = clamp(roughnessFactor + photoWeather.x * 0.4 + photoWeather.y * 0.035, 0.045, 1.0);
        // The clock/weather system may lower material.roughness globally. Use
        // its original dry value to retain damp, rough margins between pools.
        float dampRoad = max(0.22, photoDryRoughness * photoScanRoughness * 0.62);
        roughnessFactor = mix(roughnessFactor, mix(dampRoad, 0.075, photoWeather.w), photoRain);
      #elif PHOTO_WEATHER_KIND == 2
        roughnessFactor = clamp(roughnessFactor + photoWeather.y * 0.055 + photoWeather.x * 0.24, 0.045, 1.0);
      #elif PHOTO_WEATHER_KIND == 3
        roughnessFactor = clamp(roughnessFactor + photoWeather.x * 0.25, 0.045, 1.0);
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#ifdef USE_NORMALMAP
        vec3 photoBaseNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 photoMappedNormal = photoNormal(normalMap, vPhotoPosition / photoMeters, photoBaseNormal, normalScale);
        #if PHOTO_WEATHER_KIND == 1
          photoMappedNormal = normalize(mix(photoMappedNormal, photoBaseNormal, photoRain * photoWeather.w * 0.72));
        #endif
        normal = normalize(mat3(viewMatrix) * photoMappedNormal);
      #endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `photographic-world-pbr-v2-weather-${surfaceKind}`;
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

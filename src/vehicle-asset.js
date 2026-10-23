import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import {
  VEHICLE_META,
  VEHICLE_GEOMETRY,
  VEHICLE_IMAGES,
} from "./vehicle-asset-data.js";

// CarConcept: Eric Chadwick / Darmstadt Graphics Group GmbH, CC BY 4.0.
// The original, licence, changes and SHA-256 manifest are in assets/new-realism.
const imageState = {
  loaded: 0,
  failed: 0,
  total:
    typeof Image === "undefined" ? 0 : VEHICLE_IMAGES.filter(Boolean).length,
};
const liveTextures = new Set();
const sharedImageSources = new WeakMap();
const pending = [];
const sources = VEHICLE_IMAGES.map((url) => {
  if (!url || typeof Image === "undefined") return null;
  const image = new Image();
  pending.push(
    new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {}
        imageState.loaded++;
        for (const texture of liveTextures)
          if (texture.image === image) texture.needsUpdate = true;
        resolve();
      };
      image.onerror = () => {
        imageState.failed++;
        resolve();
      };
      image.src = url;
    }),
  );
  return image;
});
const ready = Promise.all(pending).then(() => getDetailedVehicleState());
export function detailedVehicleAssetsReady() {
  return ready;
}
export function getDetailedVehicleState() {
  return {
    ...imageState,
    ready: imageState.loaded + imageState.failed === imageState.total,
    name: VEHICLE_META.name,
    license: VEHICLE_META.license,
    triangles: VEHICLE_META.triangles + 24,
  };
}

const packed = gunzipSync(VEHICLE_GEOMETRY);
function decodeAttribute(description) {
  const { offset, length, size, low, high, normal } = description;
  const values = normal
    ? new Int16Array(packed.buffer, packed.byteOffset + offset, length)
    : new Uint16Array(packed.buffer, packed.byteOffset + offset, length);
  const decoded = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const channel = index % size;
    decoded[index] = normal
      ? values[index] / 32767
      : low[channel] + (values[index] / 65535) * (high[channel] - low[channel]);
  }
  return new THREE.BufferAttribute(decoded, size);
}
const batches = new Map();
function addGeometry(key, description, geometry) {
  if (!batches.has(key)) batches.set(key, { ...description, geometries: [] });
  batches.get(key).geometries.push(geometry);
}
for (const part of VEHICLE_META.parts) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", decodeAttribute(part.position));
  geometry.setAttribute("normal", decodeAttribute(part.normal));
  geometry.setAttribute("uv", decodeAttribute(part.uv));
  geometry.setAttribute("uv1", decodeAttribute(part.uv1));
  const Type = part.indices.type === "u32" ? Uint32Array : Uint16Array;
  geometry.setIndex(
    new THREE.BufferAttribute(
      new Type(
        packed.buffer,
        packed.byteOffset + part.indices.offset,
        part.indices.length,
      ).slice(),
      1,
    ),
  );
  const key = `${part.wheel || "body"}:${part.stationary ? "fixed" : "rolling"}:${part.material}`;
  addGeometry(
    key,
    { wheel: part.wheel, stationary: part.stationary, material: part.material },
    geometry,
  );
}
// Replace the source's 24k-triangle wipers with two small rubber blades.
for (const x of [-0.38, 0.38]) {
  const geometry = new THREE.BoxGeometry(0.69, 0.013, 0.027);
  geometry.rotateY(x < 0 ? -0.1 : 0.1);
  geometry.translate(x, 0.89, 1.1);
  geometry.setAttribute("uv1", geometry.attributes.uv.clone());
  addGeometry(
    "body:rolling:2",
    { wheel: null, stationary: false, material: 2 },
    geometry,
  );
}
const template = [...batches.values()].map((batch) => {
  const geometry = mergeGeometries(batch.geometries, false);
  if (!geometry) throw new Error("Could not batch bundled detailed vehicle.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  batch.geometries.forEach((item) => item.dispose());
  return { ...batch, geometries: undefined, geometry };
});
// Temporary source primitives are no longer needed after material batching.
batches.clear();
const wrap = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
};
const filters = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
};
function buildMaterials(colour) {
  const textureCache = new Map();
  function textureFor(info, colourMap = false) {
    if (!info || !VEHICLE_META.textures[info.index]) return null;
    const definition = VEHICLE_META.textures[info.index],
      transform = info.extensions?.KHR_texture_transform;
    const key = JSON.stringify([
      info.index,
      colourMap,
      info.texCoord || 0,
      transform,
    ]);
    if (textureCache.has(key)) return textureCache.get(key);
    const image = sources[definition.source];
    const texture = image
      ? new THREE.Texture(image)
      : new THREE.DataTexture(
          new Uint8Array(
            colourMap ? [255, 255, 255, 255] : [128, 128, 255, 255],
          ),
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
    const sampler = VEHICLE_META.samplers?.[definition.sampler] || {};
    texture.flipY = false;
    texture.colorSpace = colourMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = wrap[sampler.wrapS] || THREE.RepeatWrapping;
    texture.wrapT = wrap[sampler.wrapT] || THREE.RepeatWrapping;
    texture.magFilter = filters[sampler.magFilter] || THREE.LinearFilter;
    texture.minFilter =
      filters[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
    texture.channel = transform?.texCoord ?? info.texCoord ?? 0;
    if (transform?.offset) texture.offset.fromArray(transform.offset);
    if (transform?.scale) texture.repeat.fromArray(transform.scale);
    if (transform?.rotation) texture.rotation = transform.rotation;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    liveTextures.add(texture);
    texture.addEventListener("dispose", () => liveTextures.delete(texture));
    textureCache.set(key, texture);
    return texture;
  }
  return VEHICLE_META.materials.map((definition, index) => {
    if (!definition) return null;
    const pbr = definition.pbrMetallicRoughness || {},
      clearcoat = definition.extensions?.KHR_materials_clearcoat;
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
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
      aoMap: textureFor(definition.occlusionTexture),
      aoMapIntensity: definition.occlusionTexture?.strength ?? 1,
      metalnessMap: textureFor(pbr.metallicRoughnessTexture),
      roughnessMap: textureFor(pbr.metallicRoughnessTexture),
      clearcoat: clearcoat?.clearcoatFactor || 0,
      clearcoatRoughness: 0.13,
      side: definition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      envMapIntensity: 1,
    });
    material.name = `detailed-car-${definition.name || index}`;
    if (definition.emissiveFactor)
      material.emissive.fromArray(definition.emissiveFactor);
    material.emissiveIntensity =
      definition.extensions?.KHR_materials_emissive_strength
        ?.emissiveStrength || 1;
    if (index === 1) {
      // A tinted reflection layer keeps this car to one scene render per frame.
      material.color.setHex(0x849aab);
      material.metalness = 0.12;
      material.roughness = 0.085;
      material.transparent = true;
      material.opacity = 0.29;
      material.depthWrite = false;
      material.envMapIntensity = 1.2;
    }
    if (index === 11) {
      material.color.set(colour);
      material.metalness = 0.55;
      material.roughness = 0.24;
      material.clearcoat = 1;
    }
    if (index === 10 || index === 11) material.normalScale.multiplyScalar(0.18);
    if (index === 10) {
      material.metalness = 0.65;
      material.roughness = 0.28;
    }
    if (index === 15) {
      material.color.setHex(0x9faab3);
      material.metalness = 1;
      material.roughness = 0.06;
    }
    if (index === 20) {
      material.color.setHex(0xb2bbc5);
      material.metalness = 1;
      material.roughness = 0.17;
    }
    if (index === 21) {
      material.color.setHex(0x20262c);
      material.metalness = 0.85;
      material.roughness = 0.26;
    }
    if (index === 18 || index === 19) material.metalness = 0;
    return material;
  });
}

/** High-detail CC-BY vehicle, straight front wheels and local +Z forward. */
export function createDetailedSportVehicle(colour = 0xa94235) {
  const group = new THREE.Group();
  group.name = "gt-detailed-car";
  group.userData.source = VEHICLE_META.name;
  group.userData.license = VEHICLE_META.license;
  const materials = buildMaterials(colour),
    wheelGroups = {},
    wheels = [];
  for (const [name, origin] of Object.entries(VEHICLE_META.wheelOrigins)) {
    const steering = new THREE.Group();
    steering.name = `${name}-steering`;
    steering.position.fromArray(origin);
    const rolling = new THREE.Group();
    rolling.name = `${name}-rolling`;
    steering.add(rolling);
    group.add(steering);
    wheelGroups[name] = { steering, rolling, front: name.includes("Front") };
    wheels.push(rolling);
  }
  for (const part of template) {
    const mesh = new THREE.Mesh(
      part.geometry.clone(),
      materials[part.material],
    );
    mesh.name = `car-${part.wheel || "body"}-${part.material}`;
    mesh.castShadow = part.material !== 1;
    mesh.receiveShadow = true;
    if (part.wheel) {
      const wheel = wheelGroups[part.wheel];
      (part.stationary ? wheel.steering : wheel.rolling).add(mesh);
    } else group.add(mesh);
  }
  const paint = materials[11],
    baseColour = paint.color.clone();
  let lights = false,
    previousSpeed = 0,
    damaged = 0;
  function setLights(enabled) {
    lights = !!enabled;
    if (materials[14]) materials[14].emissiveIntensity = lights ? 6 : 0.55;
    if (materials[13]) materials[13].emissiveIntensity = lights ? 1.65 : 0.32;
    if (materials[12]) materials[12].emissiveIntensity = 0.18;
  }
  function setCondition(condition) {
    damaged =
      1 -
      THREE.MathUtils.clamp(
        Number.isFinite(Number(condition)) ? Number(condition) : 100,
        0,
        100,
      ) /
        100;
    paint.roughness = 0.24 + damaged * 0.33;
    paint.clearcoat = 1 - damaged * 0.55;
    paint.color
      .copy(baseColour)
      .lerp(new THREE.Color(0x756f60), damaged * 0.16);
  }
  setLights(false);
  return {
    group,
    wheels,
    modelId: "sport",
    // Steered front tyres extend past the straight-ahead visual dimensions.
    bounds: {
      ...VEHICLE_META.bounds,
      width: Math.max(2.66, VEHICLE_META.bounds.width),
    },
    setCondition,
    setLights,
    animate(dt, speed, steering = 0) {
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
      const velocity = Number.isFinite(speed) ? speed : 0;
      const turn = Number.isFinite(steering)
        ? THREE.MathUtils.clamp(steering, -0.7, 0.7)
        : 0;
      for (const wheel of Object.values(wheelGroups)) {
        if (wheel.front) wheel.steering.rotation.y = turn;
        wheel.rolling.rotation.x += (velocity * step) / 0.384;
      }
      if (materials[13])
        materials[13].emissiveIntensity =
          Math.abs(velocity) < Math.abs(previousSpeed) - step * 4.5
            ? 3.5
            : lights
              ? 1.65
              : 0.32;
      previousSpeed = velocity;
    },
  };
}

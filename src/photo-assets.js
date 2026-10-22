import * as THREE from "three";
import { PHOTO_DATA, HDR_BASE64 } from "./photo-assets-data.js";

const sources = {
  asphalt: {
    id: "Asphalt031",
    name: "Asphalt 031",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Asphalt031",
    width: 1024,
    height: 1024,
  },
  concrete: {
    id: "Concrete034",
    name: "Concrete 034",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Concrete034",
    width: 1024,
    height: 512,
  },
  plaster: {
    id: "Plaster001",
    name: "Plaster 001",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Plaster001",
    width: 1024,
    height: 1024,
  },
  wood: {
    id: "Wood051",
    name: "Wood 051",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Wood051",
    width: 1024,
    height: 1024,
  },
  tiles: {
    id: "Tiles139",
    name: "Tiles 139",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Tiles139",
    width: 1024,
    height: 1024,
  },
  cloth: {
    id: "Fabric061",
    name: "Fabric 061",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Fabric061",
    width: 1024,
    height: 1024,
  },
  soil: {
    id: "Ground037",
    name: "Ground 037",
    author: "ambientCG",
    source: "https://ambientcg.com/a/Ground037",
    width: 1024,
    height: 1024,
  },
};
export const PHOTO_ASSETS = Object.freeze(
  Object.fromEntries(
    Object.entries(PHOTO_DATA).map(([kind, data]) => [
      kind,
      Object.freeze({ ...sources[kind], license: "CC0-1.0", ...data }),
    ]),
  ),
);
export const PHOTO_ENVIRONMENT = Uint8Array.from(
  atob(HDR_BASE64),
  (character) => character.charCodeAt(0),
);
export const PHOTO_ENVIRONMENT_META = Object.freeze({
  id: "rooitou_park",
  name: "Rooitou Park",
  author: "Poly Haven / HDRI Haven",
  license: "CC0-1.0",
  source: "https://polyhaven.com/a/rooitou_park",
  width: 1024,
  height: 512,
  mirror:
    "https://github.com/pmndrs/drei-assets/tree/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri",
});

const baseTextures = new Map();
const loadingClones = new Map();
const state = { loaded: 0, failed: 0, total: 0, errors: [] };
const pending = [];
for (const [kind, asset] of Object.entries(PHOTO_ASSETS)) {
  for (const channel of ["map", "normalMap", "roughnessMap"]) {
    const image = typeof Image === "undefined" ? undefined : new Image();
    const texture = new THREE.Texture(image);
    texture.name = `${kind}-${channel}-CC0-1K`;
    texture.colorSpace =
      channel === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    baseTextures.set(`${kind}:${channel}`, texture);
    const consumers = new Set();
    loadingClones.set(`${kind}:${channel}`, consumers);
    if (image) {
      state.total++;
      pending.push(
        new Promise((resolve) => {
          image.onload = async () => {
            try {
              await image.decode();
            } catch {}
            texture.needsUpdate = true;
            for (const consumer of consumers) consumer.needsUpdate = true;
            consumers.clear();
            state.loaded++;
            resolve();
          };
          image.onerror = () => {
            state.failed++;
            state.errors.push(`${kind}:${channel}`);
            resolve();
          };
          image.src = asset[channel];
        }),
      );
    }
  }
}
const ready = Promise.all(pending).then(() => getPhotoAssetState());
/** Resolves after all embedded maps have decoded; no network is required. */
export function photoAssetsReady() {
  return ready;
}
export function getPhotoAssetState() {
  return {
    ...state,
    errors: [...state.errors],
    ready: state.loaded + state.failed === state.total,
    kinds: Object.keys(PHOTO_ASSETS),
  };
}
/** Every owner disposes its own texture clones; their image Source is shared. */
export function createPhotoTextures(kind, repeatX = 1, repeatY = 1) {
  if (!PHOTO_ASSETS[kind]) return {};
  const textures = {};
  for (const channel of ["map", "normalMap", "roughnessMap"]) {
    const texture = baseTextures.get(`${kind}:${channel}`).clone();
    texture.repeat.set(
      Number.isFinite(repeatX) ? repeatX : 1,
      Number.isFinite(repeatY) ? repeatY : 1,
    );
    texture.needsUpdate = true;
    const consumers = loadingClones.get(`${kind}:${channel}`);
    if (texture.image && !texture.image.complete) {
      consumers.add(texture);
      texture.addEventListener("dispose", () => consumers.delete(texture));
    }
    textures[channel] = texture;
  }
  return textures;
}

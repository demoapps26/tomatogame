import * as THREE from "three";
import { createPhotographicMaterial } from "./material-library.js";

// Original architectural dressing. Every addition stays on a building face or
// above the pedestrian envelope; the playable street collision layout is kept.
const SHOP_NAMES = [
  "PADARIA DA PRAÇA",
  "CAFÉ CENTRAL",
  "MERCEARIA RIBEIRA",
  "PASTELARIA SOL",
  "LIVRARIA DO BAIRRO",
  "CASA DOS TECIDOS",
  "FRUTARIA DA VILA",
  "RESTAURANTE MARÉ",
  "SAPATARIA COSTA",
  "FERRO & FIO",
  "ALFAIATE ALMEIDA",
  "FLORES DA RUA",
  "CERÂMICA DO VALE",
  "MERCADO LOCAL",
  "CASA DO CAFÉ",
  "MÓVEIS RIBEIRO",
];
const STREET_NAMES = [
  "RUA DA RIBEIRA",
  "RUA DO MERCADO",
  "AVENIDA CENTRAL",
  "RUA DAS OLIVEIRAS",
  "RUA DO JARDIM",
  "RUA DOS FUNDADORES",
  "RUA DA COOPERATIVA",
  "RUA DA PRAÇA",
];
const ADDRESSES = ["8", "12", "24", "36", "48", "64", "72", "96"];
const ironTones = ["#38453f", "#4a514a", "#48514d"];
const clothTones = ["#4e6256", "#5b6668", "#806453", "#725e59"];
const stoneTones = ["#bcb7a9", "#b8b6aa", "#c4bdab", "#aaaea6"];
const shutterTones = ["#455d54", "#596960", "#626856", "#535f62"];
const hash = (x, z, extra = 0) => {
  let seed =
    (Math.imul(Math.round(x * 10), 374761393) ^
      Math.imul(Math.round(z * 10), 668265263) ^
      Math.imul(extra + 1, 1274126177)) >>>
    0;
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
  return (seed ^ (seed >>> 16)) >>> 0;
};

function paintAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  const shopColours = ["#344b41", "#45545c", "#70574b", "#525650"];
  for (let cell = 0; cell < 32; cell++) {
    const x = (cell % 4) * 512,
      y = Math.floor(cell / 4) * 128;
    const shop = cell < 16,
      street = cell >= 16 && cell < 24;
    context.fillStyle = shop
      ? shopColours[cell % shopColours.length]
      : "#e6e4d7";
    context.fillRect(x, y, 512, 128);
    context.strokeStyle = shop ? "#d8c9a2" : "#405e76";
    context.lineWidth = shop ? 1 : 5;
    context.strokeRect(x + 9, y + 9, 494, 110);
    if (street) {
      context.lineWidth = 1;
      context.strokeRect(x + 17, y + 17, 478, 94);
    }
    context.fillStyle = shop ? "#eee9d9" : "#2d4c64";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const label = shop
      ? SHOP_NAMES[cell]
      : street
        ? STREET_NAMES[cell - 16]
        : ADDRESSES[cell - 24];
    context.font = `${shop ? 600 : 650} ${shop ? 82 : street ? 31 : 79}px ${shop ? "Georgia" : "Arial"}`;
    context.fillText(label, x + 256, y + (shop ? 50 : 64), 468);
    if (shop) {
      context.font = "15px Arial";
      context.fillStyle = "#d7d2be";
      context.fillText(
        cell % 2 ? "SANTA TOMATA · COMÉRCIO LOCAL" : "TRADIÇÃO & QUALIDADE",
        x + 256,
        y + 105,
        448,
      );
    }
    // Small variations in the paint keep a sign from reading as a HUD label.
    context.fillStyle = shop ? "#102219" : "#8c8d7e";
    context.globalAlpha = 0.07;
    for (let grain = 0; grain < 45; grain++) {
      const random = hash(cell, grain, 6);
      context.fillRect(
        x + (random % 500) + 6,
        y + ((random >>> 10) % 116) + 5,
        1 + (random % 3),
        1,
      );
    }
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = "original-portuguese-shop-and-street-plates";
  return texture;
}

function makeAtlasMaterial(texture, columns = 4, rows = 8) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.77,
    metalness: 0.03,
  });
  material.name = "painted-urban-plates";
  material.userData.urbanAtlasShape = [columns, rows];
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec2 urbanAtlasOffset;\nvarying vec2 vUrbanAtlasOffset;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvUrbanAtlasOffset = urbanAtlasOffset;",
    );
    shader.fragmentShader =
      "varying vec2 vUrbanAtlasOffset;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv / vec2(${columns.toFixed(1)}, ${rows.toFixed(1)}) + vUrbanAtlasOffset);
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `original-urban-sign-atlas-${columns}x${rows}-v2`;
  return material;
}

function paintStreetAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  const colours = ["#36564a", "#e7d9b8", "#e9e2ce", "#e4dbc4"];
  for (let cell = 0; cell < 4; cell++) {
    const x = (cell % 2) * 256,
      y = Math.floor(cell / 2) * 256;
    context.fillStyle = colours[cell];
    context.fillRect(x, y, 256, 256);
    context.strokeStyle = cell === 0 ? "#bcccb4" : "#727a62";
    context.lineWidth = 5;
    context.strokeRect(x + 12, y + 12, 232, 232);
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (cell === 0) {
      context.strokeStyle = "#e0e5cf";
      context.fillStyle = "#e0e5cf";
      context.lineWidth = 12;
      for (let arrow = 0; arrow < 3; arrow++) {
        const angle = -Math.PI / 2 + (arrow * Math.PI * 2) / 3,
          a = angle + 0.66,
          b = angle + 1.42;
        context.beginPath();
        context.moveTo(x + 128 + Math.cos(a) * 67, y + 113 + Math.sin(a) * 67);
        context.lineTo(x + 128 + Math.cos(b) * 67, y + 113 + Math.sin(b) * 67);
        context.stroke();
        const tipX = x + 128 + Math.cos(b) * 67,
          tipY = y + 113 + Math.sin(b) * 67;
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(
          tipX - 21 * Math.cos(b - 0.3),
          tipY - 21 * Math.sin(b - 0.3),
        );
        context.lineTo(
          tipX + 5 * Math.cos(b + 0.8),
          tipY + 5 * Math.sin(b + 0.8),
        );
        context.closePath();
        context.fill();
      }
      context.font = "700 22px Arial";
      context.fillText("RECICLAR", x + 128, y + 207, 208);
    } else if (cell === 1) {
      context.fillStyle = "#b94f34";
      context.beginPath();
      context.ellipse(x + 128, y + 92, 58, 47, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#466045";
      context.lineWidth = 9;
      context.beginPath();
      context.moveTo(x + 128, y + 50);
      context.lineTo(x + 120, y + 31);
      context.moveTo(x + 128, y + 50);
      context.lineTo(x + 95, y + 43);
      context.moveTo(x + 128, y + 50);
      context.lineTo(x + 158, y + 39);
      context.stroke();
      context.fillStyle = "#3c5140";
      context.font = "700 30px Georgia";
      context.fillText("TOMATE", x + 128, y + 167, 208);
      context.font = "19px Arial";
      context.fillText("DO PRODUTOR", x + 128, y + 205, 208);
    } else if (cell === 2) {
      context.fillStyle = "#3e5745";
      context.font = "700 46px Arial";
      context.fillText("LOJA", x + 128, y + 72, 204);
      context.font = "19px Arial";
      context.fillText("DA QUINTA", x + 128, y + 113, 204);
      context.beginPath();
      context.moveTo(x + 112, y + 209);
      context.lineTo(x + 144, y + 209);
      context.lineTo(x + 144, y + 176);
      context.lineTo(x + 169, y + 176);
      context.lineTo(x + 128, y + 137);
      context.lineTo(x + 87, y + 176);
      context.lineTo(x + 112, y + 176);
      context.closePath();
      context.fill();
    } else {
      context.fillStyle = "#b16b44";
      context.fillRect(x + 27, y + 27, 202, 35);
      context.fillStyle = "#f5ebd1";
      context.font = "700 19px Arial";
      context.fillText("COMÉRCIO DO BAIRRO", x + 128, y + 46, 190);
      context.fillStyle = "#40533f";
      context.font = "700 34px Georgia";
      context.fillText("Mercado", x + 128, y + 102, 205);
      context.font = "22px Georgia";
      context.fillText("de produtores", x + 128, y + 141, 205);
      context.font = "700 22px Arial";
      context.fillText("SÁBADO · 8—13H", x + 128, y + 192, 205);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = "original-street-recycling-and-market-art";
  return texture;
}

function leavesGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.18, 0.25, -0.13, 0.58, 0, 0.75);
  shape.bezierCurveTo(0.12, 0.5, 0.15, 0.23, 0, 0);
  const geometry = new THREE.ShapeGeometry(shape, 4);
  const attribute = geometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const y = attribute.getY(i);
    attribute.setZ(i, Math.sin((y / 0.75) * Math.PI) * 0.12);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Adds spatially batched physical facade depth without changing navigation. */
export function createUrbanDetail(scene, world, quality = "medium") {
  const group = new THREE.Group();
  group.name = "physical-city-facade-detail";
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const batches = new Map(),
    meshes = [];
  const stats = {
    buildings: 0,
    bands: 0,
    balconies: 0,
    shutters: 0,
    shopfronts: 0,
    plaques: 0,
    pavedFrontages: 0,
    streetBenches: 0,
    litterBins: 0,
    lowPlanters: 0,
    commercialDisplays: 0,
    serviceMarkings: 0,
    headquartersDetails: 0,
    instances: 0,
    batches: 0,
    visibleBatches: 0,
  };
  const low = quality === "low",
    high = quality === "high";
  let disposed = false,
    cullClock = 1;
  const lastCull = { x: NaN, z: NaN };
  const geo = (geometry) => (geometries.add(geometry), geometry);
  const mat = (material) => (materials.add(material), material);
  const boxGeometry = geo(new THREE.BoxGeometry(1, 1, 1));
  const planeGeometry = geo(new THREE.PlaneGeometry(1, 1));
  const groundGeometry = geo(new THREE.PlaneGeometry(1, 1));
  groundGeometry.rotateX(-Math.PI / 2);
  const leafGeometry = geo(leavesGeometry());
  const blossomGeometry = geo(
    new THREE.SphereGeometry(1, low ? 5 : 7, low ? 3 : 5),
  );
  const stone = mat(
    createPhotographicMaterial("concrete", {
      color: "#e6e2d6",
      meters: 1.5,
      roughness: 0.91,
      normalStrength: 0.23,
    }),
  );
  const pavement = mat(
    createPhotographicMaterial("concrete", {
      color: "#eee8d6",
      meters: 2.4,
      roughness: 0.88,
      normalStrength: 0.26,
    }),
  );
  const compilePavement = pavement.onBeforeCompile;
  pavement.onBeforeCompile = (shader) => {
    compilePavement(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      vec2 urbanSlab = abs(fract(vPhotoPosition.xz / 1.2 + 0.5) - 0.5) * 1.2;
      float urbanJoint = smoothstep(0.006, 0.016, min(urbanSlab.x, urbanSlab.y));
      diffuseColor.rgb *= mix(0.79, 1.0, urbanJoint);`,
    );
  };
  pavement.customProgramCacheKey = () => "urban-frontage-paving-v1";
  const fabric = mat(
    createPhotographicMaterial("cloth", {
      color: "#f0ece0",
      meters: 0.7,
      roughness: 0.98,
      normalStrength: 0.3,
    }),
  );
  const wood = mat(
    createPhotographicMaterial("wood", {
      color: "#6b7b6c",
      meters: 1.8,
      roughness: 0.83,
      normalStrength: 0.23,
    }),
  );
  const iron = mat(
    new THREE.MeshStandardMaterial({
      color: "#89928b",
      metalness: 0.68,
      roughness: 0.42,
    }),
  );
  const dark = mat(
    new THREE.MeshStandardMaterial({
      color: "#59605b",
      metalness: 0.25,
      roughness: 0.72,
    }),
  );
  const pot = mat(
    new THREE.MeshStandardMaterial({ color: "#98735e", roughness: 0.91 }),
  );
  const leaf = mat(
    new THREE.MeshStandardMaterial({
      color: "#6a7f58",
      roughness: 0.96,
      side: THREE.DoubleSide,
    }),
  );
  const paint = mat(
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const streetAtlas = paintStreetAtlas();
  textures.add(streetAtlas);
  const streetPlates = mat(makeAtlasMaterial(streetAtlas, 2, 2));
  streetPlates.name = "printed-street-service-plates";
  const streetPlacements = [];
  group.userData.streetFurniture = streetPlacements;
  const atlas = paintAtlas();
  textures.add(atlas);
  const plates = mat(makeAtlasMaterial(atlas));
  for (const material of materials)
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    euler = new THREE.Euler(0, 0, 0, "YXZ");
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const sectorSize = 128;
  function add(
    geometry,
    material,
    x,
    y,
    z,
    sx,
    sy,
    sz,
    yaw = 0,
    color = null,
    rx = 0,
    rz = 0,
    cell = null,
  ) {
    if (
      ![x, y, z, sx, sy, sz, yaw, rx, rz].every(Number.isFinite) ||
      Math.min(sx, sy, sz) <= 0
    )
      return;
    const sectorX = Math.floor(x / sectorSize),
      sectorZ = Math.floor(z / sectorSize);
    const key = `${geometry.uuid}:${material.uuid}:${sectorX}:${sectorZ}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        geometry,
        material,
        items: [],
        center: {
          x: (sectorX + 0.5) * sectorSize,
          z: (sectorZ + 0.5) * sectorSize,
        },
      };
      batches.set(key, batch);
    }
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    euler.set(rx, yaw, rz, "YXZ");
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    batch.items.push({ matrix: matrix.clone(), color, cell });
    stats.instances++;
  }
  function faceBox(
    material,
    face,
    u,
    y,
    out,
    width,
    height,
    depth,
    color,
    rx = 0,
  ) {
    const c = Math.cos(face.yaw),
      s = Math.sin(face.yaw);
    add(
      boxGeometry,
      material,
      face.x + u * c + out * s,
      y,
      face.z - u * s + out * c,
      width,
      height,
      depth,
      face.yaw,
      color,
      rx,
    );
  }
  function plaque(face, u, y, out, width, height, cell) {
    const c = Math.cos(face.yaw),
      s = Math.sin(face.yaw);
    faceBox(
      stone,
      face,
      u,
      y,
      out - 0.018,
      width + 0.045,
      height + 0.045,
      0.055,
      "#b0b2a6",
    );
    add(
      planeGeometry,
      plates,
      face.x + u * c + out * s,
      y,
      face.z - u * s + out * c,
      width,
      height,
      1,
      face.yaw,
      null,
      0,
      0,
      cell,
    );
    stats.plaques++;
  }
  function balcony(face, u, y, modern, seed) {
    const width = modern ? 2.85 : 2.55,
      depth = modern ? 1.3 : 1.12;
    const colour = stoneTones[seed % stoneTones.length];
    faceBox(stone, face, u, y, 0.08 + depth / 2, width, 0.17, depth, colour);
    faceBox(
      stone,
      face,
      u,
      y - 0.12,
      0.08 + depth / 2,
      width - 0.08,
      0.08,
      depth - 0.04,
      "#a5a69b",
    );
    const top = y + 0.92,
      bottom = y + 0.21,
      front = 0.08 + depth;
    faceBox(
      iron,
      face,
      u,
      top,
      front,
      width + 0.05,
      0.045,
      0.045,
      ironTones[seed % ironTones.length],
    );
    faceBox(iron, face, u, bottom + 0.1, front, width, 0.035, 0.035, "#59625b");
    for (
      let bar = -width / 2 + 0.08;
      bar < width / 2;
      bar += modern ? 0.43 : 0.31
    )
      faceBox(
        iron,
        face,
        u + bar,
        (top + bottom) / 2,
        front,
        0.028,
        top - bottom,
        0.028,
        "#4b5650",
      );
    for (const side of [-1, 1]) {
      faceBox(
        iron,
        face,
        u + (side * width) / 2,
        top,
        0.08 + depth / 2,
        0.04,
        0.045,
        depth,
        ironTones[seed % ironTones.length],
      );
      faceBox(
        iron,
        face,
        u + (side * width) / 2,
        (top + bottom) / 2,
        0.08 + depth / 2,
        0.033,
        top - bottom,
        0.033,
        "#49564f",
      );
    }
    if (!low && seed % 3 !== 0) {
      const plantU = u + (seed % 2 ? -0.65 : 0.65),
        plantOut = 0.3 + depth * 0.45;
      faceBox(
        pot,
        face,
        plantU,
        y + 0.23,
        plantOut,
        0.68,
        0.3,
        0.29,
        "#8f6d56",
      );
      faceBox(
        dark,
        face,
        plantU,
        y + 0.39,
        plantOut,
        0.61,
        0.015,
        0.24,
        "#393c2c",
      );
      for (let sprig = 0; sprig < 6; sprig++) {
        const random = hash(seed, sprig, 8),
          offset = ((random % 100) / 100 - 0.5) * 0.42;
        const c = Math.cos(face.yaw),
          s = Math.sin(face.yaw),
          uPos = plantU + offset,
          outPos = plantOut + (((random >>> 8) % 100) / 100 - 0.5) * 0.18;
        add(
          leafGeometry,
          leaf,
          face.x + uPos * c + outPos * s,
          y + 0.39,
          face.z - uPos * s + outPos * c,
          0.55 + (random % 4) * 0.08,
          0.55 + ((random >>> 5) % 5) * 0.07,
          1,
          face.yaw + sprig * 1.1,
          seed % 2 ? "#8c9d74" : "#739064",
          -0.25 + sprig * 0.08,
        );
      }
    }
    stats.balconies++;
  }
  function shutter(face, u, y, seed) {
    const panelWidth = 0.72,
      panelHeight = 1.75,
      panelU = u + (seed % 2 ? -0.36 : 0.36);
    const colour = shutterTones[seed % shutterTones.length];
    faceBox(
      wood,
      face,
      panelU,
      y,
      0.215,
      panelWidth,
      panelHeight,
      0.045,
      colour,
    );
    for (const side of [-1, 1])
      faceBox(
        wood,
        face,
        panelU + side * (panelWidth / 2 - 0.035),
        y,
        0.25,
        0.065,
        panelHeight,
        0.04,
        "#809387",
      );
    for (let slat = -0.72; slat <= 0.73; slat += 0.13)
      faceBox(
        wood,
        face,
        panelU,
        y + slat,
        0.26,
        panelWidth - 0.13,
        0.083,
        0.035,
        colour,
        0.16,
      );
    faceBox(iron, face, panelU, y - 0.36, 0.29, 0.17, 0.025, 0.025, "#8c958b");
    stats.shutters++;
  }
  function canopy(face, seed, span) {
    const width = Math.min(10.1, span * 0.65),
      depth = 1.91,
      stripeCount = Math.max(6, Math.round(width / 0.7));
    const stripeWidth = width / stripeCount,
      clothColour = clothTones[seed % clothTones.length];
    for (let stripe = 0; stripe < stripeCount; stripe++) {
      const u = (stripe + 0.5) * stripeWidth - width / 2;
      const colour = stripe % 2 ? clothColour : "#d9d7c7";
      faceBox(
        fabric,
        face,
        u,
        3.19,
        0.98,
        stripeWidth + 0.007,
        0.042,
        depth,
        colour,
        0.18,
      );
      faceBox(
        fabric,
        face,
        u,
        2.89,
        1.914,
        stripeWidth + 0.007,
        0.28,
        0.04,
        colour,
      );
    }
    faceBox(iron, face, 0, 3.03, 1.914, width, 0.035, 0.035, "#59635b");
    for (const side of [-1, 1]) {
      faceBox(
        iron,
        face,
        side * (width / 2 - 0.12),
        3.08,
        0.88,
        0.035,
        0.035,
        1.71,
        "#5b655e",
        0.17,
      );
      faceBox(
        iron,
        face,
        side * (width / 2 - 0.12),
        3.13,
        0.14,
        0.05,
        0.38,
        0.05,
        "#4e5851",
      );
    }
    plaque(
      face,
      0,
      2.88,
      1.941,
      Math.min(width * 0.5, 2.9),
      0.3,
      seed % SHOP_NAMES.length,
    );
    // A grounded entrance surround gives the existing glass door real thickness.
    for (const side of [-1, 1])
      faceBox(wood, face, side * 1.26, 1.42, 0.25, 0.14, 2.84, 0.21, "#78877c");
    faceBox(wood, face, 0, 2.82, 0.25, 2.65, 0.15, 0.21, "#7d8b7f");
    faceBox(stone, face, 0, 0.105, 0.34, 2.76, 0.09, 0.63, "#9e9f92");
    faceBox(iron, face, 0.77, 1.43, 0.34, 0.025, 0.42, 0.06, "#b7b9ab");
    stats.shopfronts++;
  }
  const protectedPoints = [
    ...(world.interactionPoints || []),
    ...(world.businessLocations || []),
    ...(world.interactionPoints || [])
      .map((point) => point.actor)
      .filter(Boolean),
    world.spawn || { x: 0, z: 86 },
    ...[
      { x: 18, z: 106 },
      { x: 28, z: 106 },
      { x: 38, z: 106 },
      { x: 3, z: 79 },
      { x: -3, z: 174 },
      { x: 99, z: -12 },
      { x: -192, z: -105 },
      { x: 288, z: 370 },
    ],
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  const roads = (world.roads || []).filter((road) =>
    [road.x, road.z, road.width, road.depth].every(Number.isFinite),
  );
  function footprint(face, u, out, width, depth) {
    const c = Math.cos(face.yaw),
      sn = Math.sin(face.yaw),
      x = face.x + u * c + out * sn,
      z = face.z - u * sn + out * c;
    const hx = (Math.abs(c) * width) / 2 + (Math.abs(sn) * depth) / 2,
      hz = (Math.abs(sn) * width) / 2 + (Math.abs(c) * depth) / 2;
    return {
      x,
      z,
      yaw: face.yaw,
      width,
      depth,
      minX: x - hx,
      maxX: x + hx,
      minZ: z - hz,
      maxZ: z + hz,
    };
  }
  function furnitureClear(box) {
    const b = world.bounds;
    if (
      b &&
      (box.minX < b.minX ||
        box.maxX > b.maxX ||
        box.minZ < b.minZ ||
        box.maxZ > b.maxZ)
    )
      return false;
    for (const point of protectedPoints) {
      const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX),
        dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
      if (Math.hypot(dx, dz) < 4.4) return false;
    }
    for (const road of roads) {
      const minX = road.x - road.width / 2,
        maxX = road.x + road.width / 2,
        minZ = road.z - road.depth / 2,
        maxZ = road.z + road.depth / 2;
      if (
        box.maxX > minX - 0.35 &&
        box.minX < maxX + 0.35 &&
        box.maxZ > minZ - 0.35 &&
        box.minZ < maxZ + 0.35
      )
        return false;
      // Keep both existing pavement walking corridors clear, not only asphalt.
      if (road.width > road.depth) {
        for (const side of [-1, 1]) {
          const lane = road.z + side * (road.depth / 2 + 3);
          if (
            box.maxX > minX &&
            box.minX < maxX &&
            box.maxZ > lane - 1.4 &&
            box.minZ < lane + 1.4
          )
            return false;
        }
      } else {
        for (const side of [-1, 1]) {
          const lane = road.x + side * (road.width / 2 + 3);
          if (
            box.maxZ > minZ &&
            box.minZ < maxZ &&
            box.maxX > lane - 1.4 &&
            box.minX < lane + 1.4
          )
            return false;
        }
      }
    }
    for (const placed of streetPlacements) {
      if (placed.groundOnly || placed.existingFootprint) continue;
      if (
        box.maxX > placed.minX - 0.18 &&
        box.minX < placed.maxX + 0.18 &&
        box.maxZ > placed.minZ - 0.18 &&
        box.minZ < placed.maxZ + 0.18
      )
        return false;
    }
    return true;
  }
  function recordFurniture(kind, box, extra = {}) {
    const result = { kind, ...box, ...extra };
    streetPlacements.push(result);
    return result;
  }
  function printedPlate(face, u, y, out, width, height, cell) {
    const c = Math.cos(face.yaw),
      sn = Math.sin(face.yaw);
    add(
      planeGeometry,
      streetPlates,
      face.x + u * c + out * sn,
      y,
      face.z - u * sn + out * c,
      width,
      height,
      1,
      face.yaw,
      null,
      0,
      0,
      cell,
    );
  }
  function wallBench(face, u, seed, existing = false) {
    const box = footprint(face, u, 0.055, 2.18, 0.49);
    if (!existing && !furnitureClear(box)) return false;
    for (const slat of [-0.11, 0.015, 0.14])
      faceBox(wood, face, u, 0.625, slat, 2.18, 0.075, 0.105, "#a28b69");
    for (const y of [0.87, 1.04, 1.21])
      faceBox(wood, face, u, y, 0.07, 2.18, 0.115, 0.055, "#8d7d61");
    for (const side of [-1, 1]) {
      faceBox(
        iron,
        face,
        u + side * 0.78,
        0.4,
        0.12,
        0.055,
        0.47,
        0.31,
        "#424f45",
      );
      faceBox(
        iron,
        face,
        u + side * 0.96,
        0.87,
        0.16,
        0.055,
        0.055,
        0.32,
        "#657164",
      );
      faceBox(
        iron,
        face,
        u + side * 0.96,
        0.735,
        0.27,
        0.043,
        0.27,
        0.043,
        "#4c5a4c",
      );
      faceBox(
        iron,
        face,
        u + side * 0.78,
        0.965,
        0.065,
        0.04,
        0.62,
        0.04,
        "#4d5b4c",
      );
      for (const y of [0.88, 1.04, 1.2])
        faceBox(
          iron,
          face,
          u + side * 0.77,
          y,
          0.108,
          0.024,
          0.024,
          0.014,
          "#a3a99a",
        );
    }
    recordFurniture("wall-bench", box, {
      attached: true,
      existingFootprint: existing,
    });
    stats.streetBenches++;
    return true;
  }
  function wallBin(face, u, seed, existing = false) {
    const box = footprint(face, u, 0.035, 0.48, 0.25);
    if (!existing && !furnitureClear(box)) return false;
    const colour = seed % 2 ? "#526958" : "#6b7264";
    faceBox(paint, face, u, 0.635, 0.025, 0.46, 0.64, 0.22, colour);
    faceBox(iron, face, u, 0.965, 0.025, 0.5, 0.055, 0.25, "#7c8874");
    faceBox(dark, face, u, 0.83, 0.145, 0.32, 0.12, 0.016, "#26362c");
    faceBox(iron, face, u, 0.77, 0.165, 0.35, 0.025, 0.055, "#89917f");
    faceBox(iron, face, u, 0.315, 0.025, 0.44, 0.055, 0.23, "#59614f");
    printedPlate(face, u, 0.53, 0.147, 0.23, 0.23, 0);
    recordFurniture("recessed-bin", box, {
      attached: true,
      existingFootprint: existing,
    });
    stats.litterBins++;
    return true;
  }
  function lowPlanter(face, u, seed, existing = false) {
    const box = footprint(face, u, 0.025, 1.52, 0.58);
    if (!existing && !furnitureClear(box)) return false;
    const colour = seed % 2 ? "#ada691" : "#a28c73";
    faceBox(stone, face, u, 0.39, 0.025, 1.49, 0.43, 0.4, colour);
    faceBox(stone, face, u, 0.625, 0.025, 1.55, 0.055, 0.45, "#c8c2a7");
    faceBox(dark, face, u, 0.656, 0.025, 1.34, 0.018, 0.32, "#423e2e");
    const c = Math.cos(face.yaw),
      sn = Math.sin(face.yaw),
      count = low ? 5 : high ? 13 : 9;
    for (let sprig = 0; sprig < count; sprig++) {
      const random = hash(seed, sprig, 18),
        along = u + ((random % 100) / 100 - 0.5) * 1.17,
        out = 0.025 + (((random >>> 8) % 100) / 100 - 0.5) * 0.22;
      const x = face.x + along * c + out * sn,
        z = face.z - along * sn + out * c;
      add(
        leafGeometry,
        leaf,
        x,
        0.66,
        z,
        0.45,
        0.38 + (random % 4) * 0.045,
        1,
        face.yaw + sprig * 1.9,
        "#8f9f65",
        -0.15 + sprig * 0.06,
      );
      if (!low && sprig % 3 === 0)
        add(
          blossomGeometry,
          paint,
          x,
          0.93 + (random % 3) * 0.035,
          z,
          0.045,
          0.034,
          0.045,
          0,
          sprig % 2 ? "#e3d5a8" : "#b36d53",
        );
    }
    recordFurniture("low-wall-planter", box, {
      attached: true,
      existingFootprint: existing,
    });
    stats.lowPlanters++;
    return true;
  }
  function shopDisplay(face, u, seed, existing = false) {
    const box = footprint(face, u, 0.055, 0.88, 0.22);
    if (!existing && !furnitureClear(box)) return false;
    faceBox(wood, face, u, 1.39, 0.065, 0.82, 1.05, 0.08, "#a18b6a");
    faceBox(wood, face, u, 1.39, 0.125, 0.71, 0.91, 0.05, "#c4b48c");
    printedPlate(face, u, 1.4, 0.155, 0.64, 0.8, seed % 2 ? 1 : 3);
    for (const side of [-1, 1])
      faceBox(
        iron,
        face,
        u + side * 0.28,
        1.87,
        0.16,
        0.06,
        0.025,
        0.025,
        "#7d826e",
      );
    recordFurniture("commercial-wall-display", box, {
      attached: true,
      existingFootprint: existing,
      minY: 0.86,
    });
    stats.commercialDisplays++;
    return true;
  }
  function streetFurniture(site, faces, seed) {
    if (site.height < 4.8 || site.style === "industrial") return;
    const nearStart = Math.hypot(site.x, site.z - 86) < 165;
    if (!nearStart && seed % (low ? 4 : high ? 1 : 2) !== 0) return;
    const candidates = faces
      .map((face, index) => ({
        face,
        index,
        distance: Math.abs(
          (face.primary ? face.z : face.x) -
            Math.round((face.primary ? face.z : face.x) / 96) * 96,
        ),
      }))
      .filter((item) => item.distance < 22 && item.face.span > 13)
      .sort((a, b) => a.distance - b.distance);
    const selected = candidates.length
      ? candidates[seed % candidates.length]
      : null;
    if (!selected) return;
    const face = selected.face,
      along = face.span * 0.31,
      mode = (seed >>> 5) % 4;
    if (mode === 0) wallBench(face, -along, seed);
    else if (mode === 1) lowPlanter(face, -along, seed);
    else wallBin(face, -along, seed);
    if (!low || nearStart) {
      if (mode === 3) lowPlanter(face, along, seed + 1);
      else if (mode === 1) shopDisplay(face, along, seed + 1);
      else wallBin(face, along, seed + 1);
    }
  }
  function dressHeadquarters() {
    const shop = (world.interactionPoints || []).find(
      (point) => point.id === "shop-counter",
    );
    if (!shop) return;
    const frontWalls = (world.colliders || []).filter(
      (box) =>
        box.maxX - box.minX > 5 &&
        box.maxZ - box.minZ < 0.6 &&
        (box.maxY || 0) > 3 &&
        box.minX < shop.x + 16 &&
        box.maxX > shop.x - 16 &&
        box.minZ > shop.z + 6 &&
        box.minZ < shop.z + 20,
    );
    const frontZ = frontWalls.length
      ? Math.min(...frontWalls.map((box) => box.maxZ))
      : shop.z + 13.15;
    const face = { x: shop.x, z: frontZ, yaw: 0, span: 29, primary: true };
    const before = streetPlacements.length;
    // This shallow apron joins the already open shop door to the existing
    // pavement. Everything on the centreline remains paint, never an obstacle.
    add(
      groundGeometry,
      pavement,
      shop.x,
      0.073,
      frontZ + 3.85,
      30.4,
      1,
      7.5,
      0,
    );
    const apron = footprint(face, 0, 3.85, 30.4, 7.5);
    recordFurniture("shop-paved-apron", apron, { groundOnly: true });
    stats.serviceMarkings++;
    add(
      groundGeometry,
      streetPlates,
      shop.x,
      0.077,
      frontZ + 4.3,
      1.5,
      1,
      1.5,
      0,
      null,
      0,
      0,
      2,
    );
    const marking = footprint(face, 0, 4.3, 1.5, 1.5);
    recordFurniture("shop-floor-wayfinding", marking, { groundOnly: true });
    stats.serviceMarkings++;
    for (const side of [-1, 1]) {
      wallBin(face, side * 9, hash(shop.x, side, 60));
      shopDisplay(face, side * 6.8, hash(shop.x, side, 61));
    }
    // Enrich the bench and planter already present at the front of the shop;
    // their footprints are retained rather than extending objects into a path.
    const benchFace = { x: shop.x + 11, z: frontZ + 3.83, yaw: 0 };
    for (const side of [-1, 1]) {
      faceBox(
        iron,
        benchFace,
        side * 1.07,
        0.91,
        -0.02,
        0.05,
        0.055,
        0.55,
        "#5d6958",
      );
      faceBox(
        iron,
        benchFace,
        side * 1.07,
        0.75,
        0.22,
        0.045,
        0.33,
        0.045,
        "#596650",
      );
      for (const y of [0.88, 1.1, 1.32])
        faceBox(
          iron,
          benchFace,
          side * 0.88,
          y,
          -0.295,
          0.025,
          0.025,
          0.018,
          "#adb19c",
        );
    }
    recordFurniture(
      "existing-shop-bench-trim",
      footprint(benchFace, 0, 0, 2.5, 0.7),
      { existingFootprint: true },
    );
    stats.streetBenches++;
    const planterFace = { x: shop.x - 12, z: frontZ + 4.85, yaw: 0 };
    for (const side of [-1, 1])
      faceBox(
        stone,
        planterFace,
        0,
        0.745,
        side * 0.66,
        3.25,
        0.065,
        0.08,
        "#c1bba5",
      );
    const count = low ? 10 : high ? 30 : 20;
    for (let sprig = 0; sprig < count; sprig++) {
      const seed = hash(sprig, shop.x, 64),
        x = planterFace.x + ((seed % 100) / 100 - 0.5) * 2.9,
        z = planterFace.z + (((seed >>> 8) % 100) / 100 - 0.5) * 1.05;
      add(
        leafGeometry,
        leaf,
        x,
        1.15,
        z,
        0.65,
        0.95 + (seed % 3) * 0.08,
        1,
        sprig * 1.83,
        "#91a36a",
        -0.2 + sprig * 0.035,
      );
      if (!low && sprig % 4 === 0)
        add(
          blossomGeometry,
          paint,
          x,
          1.58,
          z,
          0.052,
          0.04,
          0.052,
          0,
          "#bb7b59",
        );
    }
    recordFurniture(
      "existing-shop-planter-planting",
      footprint(planterFace, 0, 0, 3.2, 1.4),
      { existingFootprint: true },
    );
    stats.lowPlanters++;
    // Packing stamps sit on crates that already have collisions and goods.
    for (const x of [shop.x - 12.5, shop.x + 12.5]) {
      printedPlate(
        { x, z: frontZ + 3.106, yaw: 0 },
        0,
        0.53,
        0.001,
        0.48,
        0.48,
        1,
      );
      recordFurniture(
        "existing-produce-crate-label",
        {
          x,
          z: frontZ + 2.65,
          yaw: 0,
          width: 1.12,
          depth: 0.9,
          minX: x - 0.56,
          maxX: x + 0.56,
          minZ: frontZ + 2.2,
          maxZ: frontZ + 3.1,
        },
        { existingFootprint: true },
      );
      stats.commercialDisplays++;
    }
    stats.headquartersDetails = streetPlacements.length - before;
  }
  const descriptors = (world.buildingSites || []).filter((site) =>
    [site.x, site.z, site.width, site.depth, site.height].every(
      Number.isFinite,
    ),
  );
  for (const site of descriptors) {
    if (site.width < 8 || site.depth < 8 || site.height < 3.8) continue;
    const seed = hash(site.x, site.z),
      modern = site.style === "modern",
      industrial = site.style === "industrial";
    const floors = Math.max(1, Math.floor((site.height - 0.5) / 3.1));
    const stoneColour = stoneTones[(seed >>> 4) % stoneTones.length];
    const faces = [
      {
        x: site.x,
        z: site.z + site.depth / 2,
        yaw: 0,
        span: site.width,
        primary: true,
      },
      {
        x: site.x,
        z: site.z - site.depth / 2,
        yaw: Math.PI,
        span: site.width,
        primary: true,
      },
      {
        x: site.x + site.width / 2,
        z: site.z,
        yaw: Math.PI / 2,
        span: site.depth,
        primary: false,
      },
      {
        x: site.x - site.width / 2,
        z: site.z,
        yaw: -Math.PI / 2,
        span: site.depth,
        primary: false,
      },
    ];
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f],
        faceSeed = hash(seed, f, 3);
      // In the built-up centre, finish the narrow frontage between an actual
      // building and the existing sidewalk. This removes the model-village
      // grass strip while leaving courtyards, gardens and all road lanes clear.
      if (!industrial && Math.abs(site.x) < 430 && Math.abs(site.z) < 430) {
        const coordinate = face.primary ? face.z : face.x;
        const nearestRoad = Math.round(coordinate / 96) * 96;
        const distance = Math.abs(coordinate - nearestRoad);
        const halfRoad = nearestRoad === 0 ? 10 : 7;
        const depth = Math.min(5.8, distance - halfRoad - 3.4);
        if (distance < 21 && depth > 0.35) {
          const c = Math.cos(face.yaw),
            sn = Math.sin(face.yaw),
            out = depth / 2 + 0.025;
          add(
            groundGeometry,
            pavement,
            face.x + out * sn,
            0.164,
            face.z + out * c,
            face.span + Math.min(1.7, depth) * 2,
            1,
            depth + 0.1,
            face.yaw,
          );
          stats.pavedFrontages++;
        }
      }
      // Stone plinths, floor courses and recessed-looking joints break flat walls
      // into human-sized construction, while the original wall supplies mass.
      faceBox(
        stone,
        face,
        0,
        0.48,
        0.091,
        face.span + 0.04,
        0.87,
        0.065,
        stoneColour,
      );
      faceBox(
        stone,
        face,
        0,
        0.99,
        0.113,
        face.span + 0.13,
        0.105,
        0.11,
        "#d0c9b7",
      );
      if (!industrial) {
        const courseStep = low ? 2 : 1;
        for (let floor = 1; floor < floors; floor += courseStep) {
          const y = 0.16 + floor * 3.1;
          faceBox(
            stone,
            face,
            0,
            y,
            0.13,
            face.span + 0.2,
            modern ? 0.105 : 0.135,
            0.18,
            stoneColour,
          );
          if (!low && !modern)
            faceBox(
              stone,
              face,
              0,
              y + 0.105,
              0.11,
              face.span + 0.11,
              0.055,
              0.1,
              "#d2cbb8",
            );
          stats.bands++;
        }
        if (!low) {
          // Corner quoins project only a few centimetres and cast real sun shadows.
          for (const side of [-1, 1]) {
            for (
              let y = 1.4;
              y < Math.min(site.height - 0.4, modern ? 7.2 : site.height);
              y += 0.85
            )
              faceBox(
                stone,
                face,
                side * (face.span / 2 - 0.25),
                y,
                0.1,
                0.42,
                0.78,
                0.12,
                stoneColour,
              );
          }
        }
      } else {
        const doorWidth = site.width * 0.55;
        if (face.primary)
          for (let y = 0.21; y < 2.78; y += 0.17)
            faceBox(
              iron,
              face,
              0,
              y,
              0.211,
              doorWidth,
              0.12,
              0.024,
              y < 0.5 ? "#727b72" : "#959e94",
            );
      }
      if (face.primary && !industrial) {
        const columns = Math.max(2, Math.floor(site.width / 4.4));
        for (let floor = 1; floor < floors; floor++) {
          const y = 2.1 + floor * 3.1;
          if (y + 0.9 > site.height - 0.35) continue;
          for (let column = 0; column < columns; column++) {
            const u = -face.span / 2 + ((column + 0.5) * face.span) / columns;
            const windowSeed = hash(faceSeed, column, floor);
            if (!low && !modern && windowSeed % 9 === 0)
              shutter(face, u, y, windowSeed);
            const oldBalcony = !modern && floor === 1 && column % 2 === 0;
            if (
              !low &&
              !oldBalcony &&
              floor < (high ? 4 : 3) &&
              windowSeed % (modern ? 6 : 8) === 1
            )
              balcony(
                face,
                u,
                y - (modern ? 2.05 : 1.7) / 2 - 0.22,
                modern,
                windowSeed,
              );
          }
        }
        const distanceToRoad = Math.abs(face.z - Math.round(face.z / 96) * 96);
        if (
          !site.label &&
          site.height > 6.8 &&
          distanceToRoad < 25 &&
          faceSeed % 3 !== 0
        )
          canopy(face, faceSeed, face.span);
        if (!low) {
          plaque(
            face,
            -face.span / 2 + 1.7,
            3.55,
            0.21,
            2.62,
            0.4,
            16 + (faceSeed % STREET_NAMES.length),
          );
          plaque(
            face,
            1.62,
            2.03,
            0.23,
            0.36,
            0.36,
            24 + ((faceSeed >>> 6) % ADDRESSES.length),
          );
        }
      }
    }
    streetFurniture(site, faces, seed);
    stats.buildings++;
  }
  dressHeadquarters();
  for (const batch of batches.values()) {
    const geometry = geo(batch.geometry.clone());
    if (batch.material.userData.urbanAtlasShape) {
      const [columns, rows] = batch.material.userData.urbanAtlasShape;
      const offsets = new Float32Array(batch.items.length * 2);
      batch.items.forEach((item, index) => {
        const cell = item.cell || 0;
        offsets[index * 2] = (cell % columns) / columns;
        offsets[index * 2 + 1] = (rows - 1 - Math.floor(cell / columns)) / rows;
      });
      geometry.setAttribute(
        "urbanAtlasOffset",
        new THREE.InstancedBufferAttribute(offsets, 2),
      );
    }
    const mesh = new THREE.InstancedMesh(
      geometry,
      batch.material,
      batch.items.length,
    );
    mesh.name = "urban-detail-sector";
    mesh.castShadow =
      !batch.material.userData.urbanAtlasShape && batch.material !== leaf;
    mesh.receiveShadow = true;
    batch.items.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      mesh.setColorAt(index, new THREE.Color(item.color || "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push({ mesh, center: batch.center });
  }
  stats.batches = meshes.length;
  batches.clear();
  scene.add(group);
  function update(dt = 0, playerPosition = world.spawn || { x: 0, z: 86 }) {
    if (disposed) return;
    cullClock += Math.max(0, Number(dt) || 0);
    const x = Number(playerPosition?.x) || 0,
      z = Number(playerPosition?.z) || 0;
    const moved =
      !Number.isFinite(lastCull.x) ||
      Math.hypot(x - lastCull.x, z - lastCull.z) > 16;
    if (cullClock < 0.3 && !moved) return;
    cullClock = 0;
    lastCull.x = x;
    lastCull.z = z;
    const range = low ? 110 : high ? 230 : 180,
      limit = low ? 28 : high ? 72 : 56;
    const ranked = meshes
      .map((batch) => ({
        ...batch,
        distance: Math.hypot(batch.center.x - x, batch.center.z - z),
      }))
      .sort((a, b) => a.distance - b.distance);
    let visible = 0;
    for (const batch of ranked) {
      batch.mesh.visible =
        batch.distance < range + sectorSize * 0.55 && visible < limit;
      if (batch.mesh.visible) visible++;
    }
    stats.visibleBatches = visible;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
  update(0, world.spawn || { x: 0, z: 86 });
  return { group, stats, update, dispose };
}

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

function makeAtlasMaterial(texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.77,
    metalness: 0.03,
  });
  material.name = "painted-urban-plates";
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
        vec4 sampledDiffuseColor = texture2D(map, vMapUv / vec2(4.0, 8.0) + vUrbanAtlasOffset);
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => "original-urban-sign-atlas-v1";
  return material;
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
    stats.buildings++;
  }
  for (const batch of batches.values()) {
    const geometry = geo(batch.geometry.clone());
    if (batch.material === plates) {
      const offsets = new Float32Array(batch.items.length * 2);
      batch.items.forEach((item, index) => {
        const cell = item.cell || 0;
        offsets[index * 2] = (cell % 4) / 4;
        offsets[index * 2 + 1] = (7 - Math.floor(cell / 4)) / 8;
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
    mesh.castShadow = batch.material !== plates && batch.material !== leaf;
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

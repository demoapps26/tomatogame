import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createPhotographicMaterial } from "./material-library.js";

const FLOOR = 0.07;
const STATIONS = Object.freeze([
  Object.freeze({
    id: "packing-boxes",
    type: "packing-boxes",
    x: 21,
    z: 74,
    label: "Recolher uma caixa vazia",
    radius: 1.6,
  }),
  Object.freeze({
    id: "packing-weigh",
    type: "packing-weigh",
    x: 33,
    z: 63,
    label: "Pesar a colheita",
    radius: 1.6,
  }),
  Object.freeze({
    id: "packing-seal",
    type: "packing-seal",
    x: 40,
    z: 73,
    label: "Selar e expedir",
    radius: 1.6,
  }),
]);
const LABELS = [
  ["RAIZ & SOL", "COLHEITA LOCAL · SANTA TOMATA"],
  ["TOMATE", "SELEÇÃO DA QUINTA"],
  ["PASSATA", "TOMATE MADURO · 500 g"],
  ["CONSERVA", "FEITA COM TEMPO · 400 g"],
  ["AZEITE", "DO VALE · 500 ml"],
  ["COLHEITA", "LOTE 24 · ORIGEM PORTUGAL"],
  ["CAIXAS VAZIAS", "1 · RECOLHER E REUTILIZAR"],
  ["BALANÇA", "2 · PESAR A COLHEITA"],
  ["SELAGEM / EXPEDIÇÃO", "3 · SELAR E ENTREGAR"],
  ["ARMAZÉM", "RECEÇÃO · CONFERÊNCIA · LOTE"],
  ["2,49 €/kg", "TOMATE CACHO · CATEGORIA I"],
  ["3,20 €/kg", "TOMATE CORAÇÃO · CATEGORIA I"],
  ["FRESCOS", "CONSERVAR ENTRE 4 E 8 °C"],
  ["OBRIGADO", "PELO SEU COMÉRCIO LOCAL"],
  ["ABERTO", "SEG–SÁB · 08:00 — 19:00"],
  ["ENTRADAS / SAÍDAS", "CONFERIR PESO · ORIGEM · DATA"],
];

function labelAtlas() {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(
      new Uint8Array([224, 215, 190, 255]),
      1,
      1,
    );
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  for (let cell = 0; cell < LABELS.length; cell++) {
    const x = (cell % 4) * 256,
      y = Math.floor(cell / 4) * 256;
    const dark =
      cell === 0 ||
      cell === 6 ||
      cell === 7 ||
      cell === 8 ||
      cell === 9 ||
      cell === 15;
    ctx.fillStyle = dark ? "#294238" : "#e9ddbc";
    ctx.fillRect(x, y, 256, 256);
    ctx.strokeStyle = dark ? "#b9ab80" : "#8d9278";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 10, y + 10, 236, 236);
    if (cell < 6) {
      ctx.fillStyle = "#ad4933";
      ctx.beginPath();
      ctx.ellipse(x + 128, y + 73, 39, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#587247";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 128, y + 45);
      ctx.lineTo(x + 127, y + 26);
      ctx.moveTo(x + 128, y + 45);
      ctx.lineTo(x + 105, y + 36);
      ctx.moveTo(x + 128, y + 45);
      ctx.lineTo(x + 148, y + 33);
      ctx.stroke();
    }
    ctx.fillStyle = dark ? "#eee4c7" : "#304c3c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${cell >= 6 ? 29 : 37}px Georgia`;
    ctx.fillText(LABELS[cell][0], x + 128, y + (cell < 6 ? 133 : 99), 224);
    ctx.font = "14px Arial";
    ctx.fillText(LABELS[cell][1], x + 128, y + (cell < 6 ? 181 : 154), 220);
    if (cell < 6) {
      ctx.fillStyle = dark ? "#acb196" : "#526650";
      for (let bar = 0; bar < 36; bar++) {
        const width = (bar * 7) % 3 === 0 ? 3 : 1;
        ctx.fillRect(x + 72 + bar * 3, y + 214, width, 19 - (bar % 4));
      }
    } else {
      ctx.strokeStyle = "#a68c59";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 72, y + 194);
      ctx.lineTo(x + 184, y + 194);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = "original-headquarters-packaging-and-workshop-labels";
  return texture;
}

function scaleDisplay() {
  let canvas, context;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 80;
    context = canvas.getContext("2d");
  }
  const texture = canvas
    ? new THREE.CanvasTexture(canvas)
    : new THREE.DataTexture(new Uint8Array([25, 44, 29, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = "headquarters-physical-scale-LCD";
  texture.anisotropy = 2;
  return {
    texture,
    paint(weight, status) {
      if (context) {
        context.fillStyle = "#25382b";
        context.fillRect(0, 0, 256, 80);
        context.fillStyle = "#c6d4a9";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.font = "600 44px monospace";
        context.fillText(weight, 246, 29, 237);
        context.font = "15px monospace";
        context.fillText(status, 246, 65, 237);
      }
      texture.needsUpdate = true;
    },
  };
}

/**
 * Additive shop fitting for the existing open headquarters. Coordinates are
 * world metres; the original shell, roof cutaway and .07m floor remain owned by
 * world.js. All opaque repeated props share instanced geometry/material batches.
 */
export function createHeadquartersDetail({ quality = "medium", append } = {}) {
  const low = quality === "low",
    high = quality === "high";
  const group = new THREE.Group();
  group.name = "headquarters-commercial-detail";
  const interior = new THREE.Group(),
    exterior = new THREE.Group();
  interior.name = "headquarters-shop-fittings";
  exterior.name = "headquarters-storefront";
  group.add(exterior, interior);
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    instancedMeshes = new Set();
  const batches = new Map(),
    labels = { interior: [], exterior: [] };
  const colliders = [],
    interactionPoints = STATIONS.map((point) => ({ ...point }));
  const stats = {
    stations: 3,
    packagedProducts: 0,
    cartons: 0,
    crates: 0,
    fixtures: 0,
    instances: 0,
    batches: 0,
    triangles: 0,
    lights: 0,
    lcdUpdates: 0,
  };
  let disposed = false;
  const geo = (value) => (geometries.add(value), value);
  const shapes = {
    box: geo(new THREE.BoxGeometry(1, 1, 1)),
    round: geo(
      low
        ? new THREE.BoxGeometry(1, 1, 1)
        : new RoundedBoxGeometry(1, 1, 1, 2, 0.035),
    ),
    cylinder: geo(new THREE.CylinderGeometry(1, 1, 1, low ? 8 : 12)),
    sphere: geo(new THREE.SphereGeometry(1, low ? 8 : 12, low ? 5 : 8)),
    plane: geo(new THREE.PlaneGeometry(1, 1)),
  };
  const mat = (options) => {
    const value = new THREE.MeshStandardMaterial(options);
    materials.add(value);
    return value;
  };
  const photo = (kind, options) => {
    const value = createPhotographicMaterial(kind, options);
    materials.add(value);
    for (const key of ["map", "normalMap", "roughnessMap"])
      if (value[key]) textures.add(value[key]);
    return value;
  };
  const m = {
    stone: photo("concrete", {
      color: "#c4bcaa",
      meters: 1.9,
      normalStrength: 0.2,
      roughness: 0.87,
    }),
    wood: photo("wood", {
      color: "#b39a72",
      meters: 1.2,
      normalStrength: 0.22,
      roughness: 0.8,
    }),
    awning: photo("cloth", {
      color: "#ffffff",
      meters: 0.7,
      normalStrength: 0.16,
      roughness: 0.97,
    }),
    paper: photo("cloth", {
      color: "#cbb58b",
      meters: 0.4,
      normalStrength: 0.07,
      roughness: 0.92,
    }),
    ceramic: mat({ color: "#e2e1d8", roughness: 0.42 }),
    steel: mat({ color: "#8f9d99", metalness: 0.75, roughness: 0.27 }),
    iron: mat({ color: "#35443e", metalness: 0.52, roughness: 0.4 }),
    black: mat({ color: "#252d29", roughness: 0.79 }),
    rubber: mat({ color: "#333731", roughness: 0.99 }),
    cream: mat({ color: "#d9d4c5", roughness: 0.75 }),
    plastic: mat({ color: "#425b43", roughness: 0.57 }),
    tomato: mat({ color: "#b34c30", roughness: 0.38 }),
    sauce: mat({ color: "#813e2b", roughness: 0.42 }),
    olive: mat({ color: "#5c6230", roughness: 0.32 }),
    brass: mat({ color: "#baac76", metalness: 0.57, roughness: 0.4 }),
    tape: mat({ color: "#b4a17c", roughness: 0.69 }),
    led: mat({
      color: "#c6c9b0",
      emissive: "#a1b791",
      emissiveIntensity: 0.35,
      roughness: 0.35,
    }),
    lamp: mat({
      color: "#eee4c7",
      emissive: "#e8d9b0",
      emissiveIntensity: 0.65,
      roughness: 0.55,
    }),
  };
  m.glass = new THREE.MeshPhysicalMaterial({
    color: "#b2cbc3",
    roughness: 0.13,
    metalness: 0.02,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    envMapIntensity: 0.85,
  });
  materials.add(m.glass);
  const atlas = labelAtlas();
  textures.add(atlas);
  m.label = mat({ color: "#ffffff", map: atlas, roughness: 0.83 });
  const transform = new THREE.Object3D();
  const pointA = new THREE.Vector3(),
    pointB = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  function item(shape, surface, x, y, z, sx, sy, sz, options = {}) {
    const zone = options.exterior ? "exterior" : "interior";
    const key = `${zone}:${shape}:${surface.uuid}`;
    if (!batches.has(key))
      batches.set(key, { shape, surface, zone, values: [] });
    transform.position.set(x, y, z);
    transform.rotation.set(options.rx || 0, options.ry || 0, options.rz || 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    batches.get(key).values.push({
      matrix: transform.matrix.clone(),
      color: options.color || "#ffffff",
    });
  }
  const box = (surface, x, y, z, w, h, d, options) =>
    item("box", surface, x, y, z, w, h, d, options);
  const round = (surface, x, y, z, w, h, d, options) =>
    item("round", surface, x, y, z, w, h, d, options);
  const cylinder = (surface, x, y, z, radius, height, options) =>
    item("cylinder", surface, x, y, z, radius, height, radius, options);
  function beam(surface, a, b, radius = 0.015, exteriorPart = false) {
    pointA.set(...a);
    pointB.set(...b);
    transform.position.copy(pointA).add(pointB).multiplyScalar(0.5);
    transform.quaternion.setFromUnitVectors(up, pointB.sub(pointA).normalize());
    transform.scale.set(
      radius,
      new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)),
      radius,
    );
    transform.updateMatrix();
    const key = `${exteriorPart ? "exterior" : "interior"}:cylinder:${surface.uuid}`;
    if (!batches.has(key))
      batches.set(key, {
        shape: "cylinder",
        surface,
        zone: exteriorPart ? "exterior" : "interior",
        values: [],
      });
    batches
      .get(key)
      .values.push({ matrix: transform.matrix.clone(), color: "#ffffff" });
  }
  function label(
    cell,
    x,
    y,
    z,
    width,
    height,
    { yaw = 0, rx = 0, outside = false } = {},
  ) {
    const geometry = shapes.plane.clone(),
      uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        ((cell % 4) + 0.008 + uv.getX(i) * 0.984) / 4,
        (3 - Math.floor(cell / 4) + 0.008 + uv.getY(i) * 0.984) / 4,
      );
    }
    transform.position.set(x, y, z);
    transform.rotation.set(rx, yaw, 0);
    transform.scale.set(width, height, 1);
    transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    labels[outside ? "exterior" : "interior"].push(geometry);
  }
  function obstacle(id, x, z, width, depth, height) {
    colliders.push({
      id: `hq-${id}`,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      height,
    });
  }
  function legs(x, z, width, depth, height, surface = m.steel) {
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        box(
          surface,
          x + dx * (width / 2 - 0.07),
          FLOOR + height / 2,
          z + dz * (depth / 2 - 0.07),
          0.06,
          height,
          0.06,
        );
  }
  function carton(x, y, z, width = 0.64, height = 0.34, depth = 0.46, yaw = 0) {
    round(m.paper, x, y, z, width, height, depth, { ry: yaw });
    box(
      m.tape,
      x,
      y + height / 2 + 0.002,
      z,
      width * 0.14,
      0.005,
      depth + 0.004,
      { ry: yaw },
    );
    // Front label and tape are actual geometry, with a clear folded-box seam.
    if (yaw === 0) {
      box(m.tape, x, y, z + depth / 2 + 0.003, width * 0.14, height, 0.005);
      label(
        5,
        x - width * 0.22,
        y,
        z + depth / 2 + 0.009,
        width * 0.35,
        height * 0.66,
      );
    }
    stats.cartons++;
  }
  function crate(x, y, z, width = 0.78, depth = 0.55) {
    const h = 0.26;
    box(m.plastic, x, y - h / 2 + 0.025, z, width, 0.045, depth);
    for (const side of [-1, 1]) {
      box(
        m.plastic,
        x,
        y + h / 2 - 0.025,
        z + (side * depth) / 2,
        width,
        0.055,
        0.035,
      );
      box(
        m.plastic,
        x + (side * width) / 2,
        y + h / 2 - 0.025,
        z,
        0.035,
        0.055,
        depth,
      );
      box(m.plastic, x + (side * width) / 2, y, z, 0.03, h, depth * 0.12);
      for (let rib = -2; rib <= 2; rib++)
        box(
          m.plastic,
          x + (rib * width) / 5,
          y,
          z + (side * depth) / 2,
          0.025,
          h,
          0.025,
        );
    }
    stats.crates++;
  }
  function jar(x, y, z, kind = 2, yaw = 0) {
    const radius = kind === 4 ? 0.055 : 0.075,
      height = kind === 4 ? 0.34 : 0.23;
    cylinder(kind === 4 ? m.olive : m.sauce, x, y, z, radius, height);
    cylinder(m.brass, x, y + height / 2 + 0.012, z, radius * 1.04, 0.025);
    label(
      kind,
      x + Math.sin(yaw) * (radius + 0.002),
      y,
      z + Math.cos(yaw) * (radius + 0.002),
      radius * 1.5,
      height * 0.65,
      { yaw },
    );
    stats.packagedProducts++;
  }
  function punnet(x, y, z) {
    round(m.plastic, x, y, z, 0.38, 0.09, 0.25);
    for (const dx of [-0.09, 0.09])
      for (const dz of [-0.055, 0.055])
        item("sphere", m.tomato, x + dx, y + 0.075, z + dz, 0.065, 0.057, 0.06);
    round(m.glass, x, y + 0.08, z, 0.39, 0.12, 0.26);
    label(1, x, y + 0.143, z, 0.19, 0.13, { rx: -Math.PI / 2 });
    stats.packagedProducts++;
  }

  // Limestone plinth, deep aluminium reveals and a fabric awning give the old
  // flat storefront a physically layered silhouette without filling its door.
  for (const center of [19, 37]) {
    box(m.stone, center, 0.47, 78.205, 10.7, 0.89, 0.09, { exterior: true });
    box(m.iron, center, 0.95, 78.255, 10.82, 0.07, 0.19, { exterior: true });
    box(m.iron, center, 4.43, 78.21, 10.85, 0.12, 0.2, { exterior: true });
    for (const dx of [-5.35, -2.68, 0, 2.68, 5.35])
      box(m.iron, center + dx, 2.7, 78.22, 0.065, 3.47, 0.18, {
        exterior: true,
      });
    for (let dx = -4.6; dx < 5; dx += 1.53)
      box(m.iron, center + dx, 0.47, 78.256, 0.007, 0.85, 0.003, {
        exterior: true,
        color: "#8f9386",
      });
    box(m.brass, center, 1.03, 78.3, 10.8, 0.018, 0.035, { exterior: true });
  }
  for (const x of [13.52, 24.52, 31.48, 42.48]) {
    box(m.stone, x, 2.45, 78.25, 0.23, 4.8, 0.23, { exterior: true });
    box(m.iron, x, 2.45, 78.39, 0.08, 4.6, 0.045, { exterior: true });
  }
  const stripeWidth = 28.6 / 30,
    slope = Math.atan(0.58 / 2.3);
  for (let stripe = 0; stripe < 30; stripe++) {
    const x = 13.7 + stripeWidth * (stripe + 0.5),
      color = stripe % 2 ? "#dfd7ba" : "#4e6653";
    box(m.awning, x, 4.13, 79.12, stripeWidth + 0.006, 0.055, 2.38, {
      exterior: true,
      rx: slope,
      color,
    });
    box(m.awning, x, 3.72, 80.27, stripeWidth + 0.006, 0.25, 0.038, {
      exterior: true,
      color,
    });
  }
  beam(m.iron, [13.65, 3.9, 80.25], [42.35, 3.9, 80.25], 0.035, true);
  for (const x of [14.1, 21.1, 28, 34.9, 41.9]) {
    beam(m.iron, [x, 4.36, 78.25], [x, 3.88, 80.18], 0.022, true);
    beam(m.iron, [x, 3.62, 78.25], [x, 3.88, 80.04], 0.018, true);
    cylinder(m.iron, x, 4.43, 78.27, 0.07, 0.24, {
      exterior: true,
      rz: Math.PI / 2,
    });
  }
  for (const [y, width] of [
    [5.46, 18.3],
    [4.34, 18.3],
    [7.12, 17.4],
    [5.48, 17.4],
  ])
    box(m.iron, 28, y, 78.18, width, 0.055, 0.19, { exterior: true });
  for (const x of [20, 36]) {
    box(m.iron, x, 4.62, 78.55, 0.38, 0.13, 0.3, { exterior: true, rx: -0.28 });
    box(m.lamp, x, 4.54, 78.61, 0.26, 0.025, 0.17, { exterior: true });
  }
  label(14, 24.5, 1.85, 78.43, 0.67, 0.7, { outside: true });
  label(0, 28, FLOOR + 0.007, 76.2, 2.4, 1.35, { rx: -Math.PI / 2 });
  box(m.rubber, 28, FLOOR + 0.003, 76.2, 3.2, 0.006, 1.6);

  // Tall pantry shelving stays behind the original west produce island.
  for (const z of [63.25, 66.35, 69.45, 72.55]) {
    for (const dz of [-0.7, 0.7])
      box(m.iron, 14.2, 1.5, z + dz, 0.045, 2.85, 0.045);
    for (const y of [0.37, 0.95, 1.53, 2.11, 2.69]) {
      box(m.wood, 14.3, y, z, 0.8, 0.045, 1.56);
      box(m.cream, 14.72, y + 0.035, z, 0.022, 0.09, 1.56);
      if (y < 2.6)
        for (let product = 0; product < (low ? 4 : 6); product++) {
          const pz = z - 0.6 + product * (low ? 0.4 : 0.24);
          jar(
            14.35,
            y + 0.17,
            pz,
            product % 3 === 0 ? 4 : 2 + (product % 2),
            Math.PI / 2,
          );
          if (high && product % 2 === 0)
            jar(14.05, y + 0.17, pz, 2, Math.PI / 2);
        }
    }
    label(2, 14.75, 2.95, z, 1.45, 0.38, { yaw: Math.PI / 2 });
  }
  obstacle("pantry", 14.3, 67.9, 0.85, 11.2, 2.95);

  // Three real refrigerator doors, internal bottles and shelf rails behind
  // transparent glazing. No expensive screen-space transmission or new light.
  const fridgeX = 14.3,
    fridgeZ = 59.3;
  round(m.cream, fridgeX, 1.29, fridgeZ, 1.0, 2.44, 3.35);
  box(m.black, fridgeX + 0.515, 1.29, fridgeZ, 0.025, 2.02, 3.12);
  box(m.iron, fridgeX + 0.54, 0.25, fridgeZ, 0.065, 0.25, 3.15);
  for (let vent = 0; vent < 24; vent++)
    box(
      m.black,
      fridgeX + 0.58,
      0.25,
      fridgeZ - 1.45 + vent * 0.126,
      0.008,
      0.12,
      0.045,
    );
  for (const doorZ of [fridgeZ - 1.04, fridgeZ, fridgeZ + 1.04]) {
    // Cavity is shallow but physically open on the +X face of the appliance.
    box(m.cream, fridgeX + 0.56, 1.39, doorZ, 0.05, 1.78, 0.96);
    for (const y of [0.56, 1.05, 1.54, 2.03]) {
      box(m.steel, fridgeX + 0.75, y, doorZ, 0.42, 0.025, 0.92);
      for (const dz of [-0.29, 0, 0.29]) {
        if (y < 1.5)
          jar(fridgeX + 0.77, y + 0.16, doorZ + dz, y < 1 ? 3 : 2, Math.PI / 2);
        else punnet(fridgeX + 0.79, y + 0.06, doorZ + dz);
      }
    }
    for (const dz of [-0.5, 0.5])
      box(m.iron, fridgeX + 1.015, 1.38, doorZ + dz, 0.055, 1.94, 0.035);
    for (const y of [0.41, 2.35])
      box(m.iron, fridgeX + 1.015, y, doorZ, 0.055, 0.045, 1.03);
    box(m.glass, fridgeX + 1.025, 1.38, doorZ, 0.012, 1.87, 0.94);
    beam(
      m.steel,
      [fridgeX + 1.09, 1.13, doorZ + 0.36],
      [fridgeX + 1.09, 1.8, doorZ + 0.36],
      0.017,
    );
    box(m.lamp, fridgeX + 0.92, 2.27, doorZ - 0.44, 0.02, 0.05, 0.035);
  }
  label(12, fridgeX + 1.06, 2.56, fridgeZ, 2.9, 0.32, { yaw: Math.PI / 2 });
  obstacle("refrigerator", fridgeX + 0.25, fridgeZ, 1.55, 3.4, 2.65);
  stats.fixtures++;

  // A screened receiving corner gives stock a believable destination. Its
  // 2.05m open doorway is separate from all customer and work approach points.
  const wireWall = (x, z, width, depth, alongX = false) => {
    box(m.cream, x, 0.47, z, width, 0.8, depth);
    box(m.iron, x, 0.89, z, width + 0.025, 0.035, depth + 0.025);
    const length = alongX ? width : depth;
    for (let offset = -length / 2; offset <= length / 2 + 0.001; offset += 0.24)
      box(
        m.iron,
        x + (alongX ? offset : 0),
        1.73,
        z + (alongX ? 0 : offset),
        0.012,
        1.66,
        0.012,
      );
    for (const y of [1.17, 1.47, 1.77, 2.07, 2.37, 2.57])
      box(m.iron, x, y, z, width, 0.012, depth);
  };
  wireWall(36.5, 56.8, 0.075, 5.1);
  wireWall(37.75, 59.35, 2.5, 0.075, true);
  wireWall(41.7, 59.35, 1.3, 0.075, true);
  box(m.iron, 39.4, 2.6, 59.35, 5.88, 0.075, 0.075);
  label(9, 37.75, 1.45, 59.41, 1.75, 0.58);
  obstacle("warehouse-side", 36.5, 56.8, 0.075, 5.1, 2.6);
  obstacle("warehouse-front-left", 37.75, 59.35, 2.5, 0.075, 2.6);
  obstacle("warehouse-front-right", 41.7, 59.35, 1.3, 0.075, 2.6);
  for (const x of [37.1, 39.45, 41.8])
    for (const z of [54.75, 55.85]) box(m.iron, x, 1.56, z, 0.065, 2.95, 0.065);
  for (const y of [0.35, 1.15, 1.95, 2.75]) {
    box(m.wood, 39.45, y, 55.3, 4.8, 0.06, 1.24);
    for (let index = 0; index < 6; index++) {
      carton(37.55 + index * 0.75, y + 0.21, 55.38, 0.64, 0.34, 0.58);
      if (!low && y < 2.7)
        carton(37.58 + index * 0.75, y + 0.56, 55.37, 0.6, 0.32, 0.56);
    }
  }
  obstacle("warehouse-rack", 39.45, 55.3, 4.9, 1.3, 3.05);
  label(15, 18.2, 2.02, 54.19, 5.2, 1.25);
  stats.fixtures++;

  // Packaging workstation 1: a wheeled dolly of empty returnable crates. The
  // player stands at z74; all equipment begins beyond z75.1.
  box(m.wood, 21, 0.29, 75.7, 1.25, 0.07, 0.96);
  for (const dx of [-0.49, 0.49])
    for (const dz of [-0.34, 0.34]) {
      cylinder(m.rubber, 21 + dx, 0.17, 75.7 + dz, 0.095, 0.055, {
        rz: Math.PI / 2,
      });
      box(m.steel, 21 + dx, 0.24, 75.7 + dz, 0.06, 0.13, 0.05);
    }
  for (let layer = 0; layer < 4; layer++)
    crate(21, 0.46 + layer * 0.245, 75.7, 1.08, 0.76);
  for (const x of [20.5, 21.5])
    beam(m.steel, [x, 0.3, 76.12], [x, 1.35, 76.12], 0.025);
  beam(m.rubber, [20.5, 1.35, 76.12], [21.5, 1.35, 76.12], 0.03);
  label(6, 21, 1.6, 76.1, 1.3, 0.55, { yaw: Math.PI });
  obstacle("empty-crate-dolly", 21, 75.7, 1.3, 1.0, 1.65);

  // Workstation 2 projects from the existing counter towards its approach
  // point, so the player can reach the tray rather than address a distant prop.
  round(m.wood, 33, 1.23, 61.42, 1.3, 0.09, 1.15);
  legs(33, 61.42, 1.15, 1.0, 1.17);
  box(m.iron, 33, 1.1, 61.99, 1.25, 0.23, 0.025);
  round(m.steel, 33, 1.35, 61.63, 0.88, 0.14, 0.68);
  round(m.black, 33, 1.44, 61.63, 0.78, 0.06, 0.6);
  round(m.steel, 33, 1.5, 61.63, 0.81, 0.035, 0.63);
  box(m.iron, 33.31, 1.69, 61.39, 0.06, 0.6, 0.055);
  round(m.black, 33.31, 2.01, 61.4, 0.55, 0.27, 0.06);
  box(m.led, 33.31, 2.02, 61.438, 0.42, 0.13, 0.008);
  label(7, 33, 1.11, 62.009, 0.85, 0.32);
  cylinder(m.paper, 34.0, 1.37, 60.98, 0.095, 0.22);
  box(m.cream, 34.03, 1.26, 61.07, 0.18, 0.007, 0.37, { ry: 0.14 });
  obstacle("scale-return", 33, 61.42, 1.3, 1.15, 1.4);
  stats.fixtures++;

  // Workstation 3: stainless packing bench, taped cartons, label roll and a
  // parcel scale. Its front edge is 1.35m behind the expediting approach point.
  legs(40, 75.05, 2.3, 1.3, 0.88);
  box(m.steel, 40, 0.57, 75.05, 2.28, 0.035, 1.26);
  round(m.wood, 40, 0.98, 75.05, 2.4, 0.12, 1.4);
  carton(40.78, 1.23, 75.08, 0.64, 0.38, 0.54);
  cylinder(m.tape, 39.36, 1.17, 75.26, 0.12, 0.07, { rz: Math.PI / 2 });
  box(m.iron, 39.36, 1.08, 75.26, 0.3, 0.065, 0.15);
  box(m.steel, 39.2, 1.12, 75.25, 0.018, 0.12, 0.16);
  cylinder(m.paper, 39.8, 1.18, 75.48, 0.13, 0.48, { rz: Math.PI / 2 });
  label(8, 40, 1.58, 75.61, 1.7, 0.58, { yaw: Math.PI });
  for (const x of [39.08, 40.92])
    box(m.iron, x, 1.3, 75.62, 0.025, 0.95, 0.025);
  carton(40.28, 0.8, 75.09, 0.62, 0.36, 0.54);
  obstacle("packing-bench", 40, 75.05, 2.4, 1.4, 1.9);
  stats.fixtures += 2;

  // Shop baskets, a light wire trolley and close-up counter details establish
  // a human scale alongside the original large produce displays.
  for (let layer = 0; layer < 3; layer++)
    crate(23.1, 0.2 + layer * 0.12, 76.95, 0.48, 0.36);
  obstacle("shopping-baskets", 23.1, 76.95, 0.55, 0.5, 0.65);
  const cartX = 34.6,
    cartZ = 76.7;
  for (const dx of [-0.25, 0.25])
    for (const dz of [-0.37, 0.37])
      cylinder(m.rubber, cartX + dx, 0.17, cartZ + dz, 0.07, 0.035, {
        rz: Math.PI / 2,
      });
  for (const dx of [-0.28, 0.28]) {
    beam(
      m.steel,
      [cartX + dx, 0.23, cartZ - 0.36],
      [cartX + dx, 1.06, cartZ + 0.5],
      0.017,
    );
    beam(
      m.steel,
      [cartX + dx, 0.23, cartZ + 0.36],
      [cartX + dx, 0.86, cartZ - 0.45],
      0.017,
    );
    for (const y of [0.62, 0.76, 0.91])
      box(m.steel, cartX + dx, y, cartZ, 0.012, 0.012, 0.83);
    for (let dz = -0.4; dz < 0.45; dz += 0.1)
      box(m.steel, cartX + dx, 0.77, cartZ + dz, 0.009, 0.31, 0.009);
  }
  for (const dz of [-0.42, 0.42])
    for (const y of [0.62, 0.91])
      box(m.steel, cartX, y, cartZ + dz, 0.57, 0.012, 0.012);
  beam(
    m.rubber,
    [cartX - 0.3, 1.06, cartZ + 0.5],
    [cartX + 0.3, 1.06, cartZ + 0.5],
    0.025,
  );
  obstacle("shopping-trolley", cartX, cartZ, 0.7, 1.1, 1.12);
  for (const x of [23.2, 26.8, 30.5]) {
    punnet(x, 1.25, 55.1);
    jar(x + 0.42, 1.13, 55.1, 2);
    jar(x + 0.63, 1.13, 55.13, 3);
  }
  cylinder(m.ceramic, 29.4, 1.37, 60.32, 0.065, 0.13);
  cylinder(m.black, 29.4, 1.439, 60.32, 0.05, 0.006);
  round(m.iron, 27.4, 1.27, 60.57, 0.38, 0.025, 0.5, { ry: -0.12 });
  box(m.cream, 27.4, 1.287, 60.57, 0.33, 0.008, 0.46, { ry: -0.12 });
  beam(m.brass, [27.3, 1.302, 60.43], [27.55, 1.302, 60.48], 0.008);
  for (const [x, cell] of [
    [17, 10],
    [39, 11],
  ]) {
    beam(m.iron, [x, 1.1, 72.1], [x, 1.47, 72.1], 0.014);
    label(cell, x, 1.62, 72.13, 1.2, 0.42);
  }

  // One draw per material/shape/zone, plus one shared label atlas draw per zone.
  for (const { shape, surface, zone, values } of batches.values()) {
    const mesh = new THREE.InstancedMesh(shapes[shape], surface, values.length);
    instancedMeshes.add(mesh);
    mesh.name = `hq-${zone}-${shape}-${surface.name || surface.uuid.slice(0, 8)}`;
    for (let index = 0; index < values.length; index++) {
      mesh.setMatrixAt(index, values[index].matrix);
      mesh.setColorAt(index, new THREE.Color(values[index].color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = !surface.transparent;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    (zone === "interior" ? interior : exterior).add(mesh);
    stats.instances += values.length;
    stats.batches++;
    stats.triangles +=
      ((shapes[shape].index?.count || shapes[shape].attributes.position.count) /
        3) *
      values.length;
  }
  for (const zone of ["interior", "exterior"])
    if (labels[zone].length) {
      const geometry = geo(mergeGeometries(labels[zone], false));
      labels[zone].forEach((part) => part.dispose());
      const mesh = new THREE.Mesh(geometry, m.label);
      mesh.name = `hq-${zone}-printed-labels`;
      mesh.receiveShadow = true;
      (zone === "interior" ? interior : exterior).add(mesh);
      stats.batches++;
      stats.triangles += geometry.index.count / 3;
    }
  const lcd = scaleDisplay();
  textures.add(lcd.texture);
  const lcdMaterial = mat({
    color: "#ffffff",
    map: lcd.texture,
    roughness: 0.5,
    emissive: "#b4c39e",
    emissiveMap: lcd.texture,
    emissiveIntensity: 0.45,
  });
  const lcdMesh = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(0.42, 0.13)),
    lcdMaterial,
  );
  lcdMesh.position.set(33.31, 2.02, 61.453);
  lcdMesh.name = "hq-physical-scale-display";
  lcdMesh.userData.role = "packing-scale-display";
  interior.add(lcdMesh);
  stats.batches++;
  stats.triangles += 2;
  let scaleKey = "";
  function setWorkState(view) {
    if (disposed) return;
    const active = view?.active;
    let weight = "0.000 kg",
      status = "PRONTA";
    if (active?.phase === "weigh") {
      if (active.working) {
        const progress = Number.isFinite(active.progress)
          ? Math.max(0, Math.min(1, active.progress))
          : 0;
        weight = `${(4.7 + Math.round(progress * 10) * 0.03).toFixed(3)} kg`;
        status = "A ESTABILIZAR";
      } else status = "COLOCAR CAIXA";
    } else if (active?.phase === "collect-weighed") {
      weight = "5.000 kg";
      status = "PESO CONFIRMADO";
    }
    const key = `${weight}/${status}`;
    if (key === scaleKey) return;
    scaleKey = key;
    lcd.paint(weight, status);
    lcdMesh.userData.reading = { weight, status };
    stats.lcdUpdates++;
  }
  setWorkState(null);
  group.userData.headquartersDetail = {
    floorHeight: FLOOR,
    stations: interactionPoints.map((point) => ({ ...point })),
  };
  group.updateMatrixWorld(true);
  if (typeof append === "function") append(group);

  return {
    group,
    colliders,
    interactionPoints,
    floorSurfaces: [],
    stats,
    setWorkState,
    update(time, playerPosition) {
      if (disposed) return;
      const x = playerPosition?.x,
        z = playerPosition?.z;
      if (Number.isFinite(x) && Number.isFinite(z)) {
        const distance = Math.hypot(x - 28, z - 66);
        interior.visible = distance < (low ? 100 : high ? 180 : 140);
        exterior.visible = distance < (low ? 300 : 430);
      }
      // An appliance indicator only; the existing two ceiling lights still
      // provide all illumination and remain under the world's atmosphere.
      m.led.emissiveIntensity =
        0.33 + (Number.isFinite(time) ? Math.sin(time * 0.8) * 0.018 : 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of instancedMeshes) mesh.dispose();
      interior.clear();
      exterior.clear();
      group.clear();
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      for (const value of textures) value.dispose();
    },
  };
}

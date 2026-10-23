import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PASSENGER_MODELS } from "./passenger-vehicles.js";
import { FIELD_JOBS, FIELD_JOBS_BOARD } from "./field-jobs.js";
import { DRIVING_TRIALS, TRIAL_START_POINTS } from "./driving-jobs.js";

// Original street furniture, lettering and bicycles. Parked cars are spawn data
// only: the application owns their actors, interaction, save and dynamic bounds.
// Keep this plan independent of quality so rebuilding graphics preserves saves.
const PALETTE = [0x617d83, 0xc8c4b7, 0x8a463b, 0x47574f, 0xb7a17a, 0x8c9294];
const MODELS = ["compact", "van", "compact", "pickup", "suv", "compact"];
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const point = (p) => p && finite(p.x) && finite(p.z);
const hash = (a, b, c = 0) => {
  let n =
    (Math.imul(Math.round(a * 100), 374761393) ^
      Math.imul(Math.round(b * 100), 668265263) ^
      Math.imul(c + 1, 1274126177)) >>>
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
};
const isCity = (world) =>
  world?.group?.name === "world-cidade" ||
  world?.mapId === "cidade" ||
  world?.id === "cidade";
const boxAt = (x, z, width, depth, yaw = 0, margin = 0) => {
  const c = Math.abs(Math.cos(yaw)),
    s = Math.abs(Math.sin(yaw));
  const w = width * c + depth * s,
    d = width * s + depth * c;
  return {
    minX: x - w / 2 - margin,
    maxX: x + w / 2 + margin,
    minZ: z - d / 2 - margin,
    maxZ: z + d / 2 + margin,
  };
};
const overlap = (a, b, margin = 0) =>
  a.minX < b.maxX + margin &&
  a.maxX > b.minX - margin &&
  a.minZ < b.maxZ + margin &&
  a.maxZ > b.minZ - margin;
function lineIntersects(box, a, b, margin = 0) {
  let low = 0,
    high = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, box.minX - margin, box.maxX + margin],
    [a.z, b.z - a.z, box.minZ - margin, box.maxZ + margin],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (origin < min || origin > max) return false;
    } else {
      const p = (min - origin) / delta,
        q = (max - origin) / delta;
      low = Math.max(low, Math.min(p, q));
      high = Math.min(high, Math.max(p, q));
      if (low > high) return false;
    }
  }
  return true;
}
function routeSegments(routes, closed = true) {
  const segments = [];
  for (const route of routes || []) {
    const pts = route.filter(point);
    for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1], pts[i]]);
    if (closed && pts.length > 2) segments.push([pts.at(-1), pts[0]]);
  }
  return segments;
}
function reservations(world) {
  const boxes = [{ minX: -22, maxX: 83, minZ: 26, maxZ: 132 }];
  const points = [
    ...(world.interactionPoints || []),
    ...(world.businessLocations || []),
    ...(world.vehicleSpawns || []),
    ...(world.fleetSpawns || []),
    ...(world.missionSpawns || []),
    FIELD_JOBS_BOARD,
    ...TRIAL_START_POINTS,
  ];
  if (world.spawn) points.push(world.spawn);
  if (world.fleetReturnDropoff) points.push(world.fleetReturnDropoff);
  for (const job of FIELD_JOBS)
    for (const step of job.steps) points.push(step.point);
  for (const trial of DRIVING_TRIALS)
    for (const checkpoint of trial.checkpoints)
      points.push({ ...checkpoint, reserveRadius: 16 });
  for (const p of points)
    if (point(p))
      boxes.push(
        boxAt(p.x, p.z, (p.reserveRadius || 8) * 2, (p.reserveRadius || 8) * 2),
      );
  for (const site of world.estatesSites || [])
    if (point(site))
      boxes.push(
        boxAt(site.parcelX ?? site.x, site.parcelZ ?? site.z, 102, 102),
      );
  return boxes;
}
function roadsFor(world) {
  return (world.roads || [])
    .filter(
      (r) =>
        point(r) &&
        finite(r.width) &&
        finite(r.depth) &&
        Math.max(r.width, r.depth) > Math.min(r.width, r.depth) * 4,
    )
    .map((r) => ({
      horizontal: r.width > r.depth,
      coordinate: r.width > r.depth ? r.z : r.x,
      width: Math.min(r.width, r.depth),
      length: Math.max(r.width, r.depth),
    }))
    .sort(
      (a, b) =>
        Math.abs(a.coordinate) - Math.abs(b.coordinate) ||
        a.coordinate - b.coordinate ||
        Number(a.horizontal) - Number(b.horizontal),
    );
}

/** Deterministic CPU-only plan; neither mutates the world nor depends on mode. */
export function planCityStreetLife(world) {
  if (!isCity(world)) return { parking: [], shelters: [], bicycles: [] };
  const roads = roadsFor(world),
    reserved = reservations(world),
    occupied = [];
  const traffic = routeSegments(world.trafficRoutes),
    pedestrians = routeSegments(world.pedestrianRoutes);
  const trialLines = routeSegments(
    DRIVING_TRIALS.map((t) => [t.start, ...t.checkpoints]),
    false,
  );
  const obstacles = (world.colliders || []).filter((b) =>
    [b.minX, b.maxX, b.minZ, b.maxZ].every(finite),
  );
  const safe = (box, kind) => {
    const bounds = world.bounds;
    if (
      bounds &&
      (box.minX < bounds.minX + 18 ||
        box.maxX > bounds.maxX - 18 ||
        box.minZ < bounds.minZ + 18 ||
        box.maxZ > bounds.maxZ - 18)
    )
      return false;
    if (
      obstacles.some((b) => overlap(box, b, 0.45)) ||
      reserved.some((b) => overlap(box, b)) ||
      occupied.some((b) => overlap(box, b, 1.6))
    )
      return false;
    // Traffic tracks are ±1.85m from the supplied route, plus vehicle half-width.
    if (traffic.some(([a, b]) => lineIntersects(box, a, b, 3.25))) return false;
    if (pedestrians.some(([a, b]) => lineIntersects(box, a, b, 1.05)))
      return false;
    if (
      trialLines.some(([a, b]) =>
        lineIntersects(box, a, b, kind === "parking" ? 2.4 : 1.8),
      )
    )
      return false;
    return true;
  };
  function candidates(kind) {
    const result = [];
    for (const road of roads) {
      // Fourteen-metre streets have no free parking strip beside the live lanes.
      if (kind === "parking" && road.width < 18) continue;
      const half = Math.min(road.length / 2 - 30, 520);
      for (
        let block = Math.ceil(-half / 96);
        block <= Math.floor(half / 96);
        block++
      )
        for (const alongOffset of [30, 66])
          for (const side of [-1, 1]) {
            const along = block * 96 + alongOffset;
            if (Math.abs(along) > half) continue;
            // Lamps and existing drains are centred at each block midpoint (48m).
            const cross =
              road.coordinate +
              side * (road.width / 2 + (kind === "parking" ? -1.25 : 2.45));
            const x = road.horizontal ? along : cross,
              z = road.horizontal ? cross : along;
            const yaw =
              kind === "parking"
                ? road.horizontal
                  ? side > 0
                    ? -Math.PI / 2
                    : Math.PI / 2
                  : side > 0
                    ? 0
                    : Math.PI
                : road.horizontal
                  ? side > 0
                    ? 0
                    : Math.PI
                  : side > 0
                    ? Math.PI / 2
                    : -Math.PI / 2;
            result.push({
              id: `${road.horizontal ? "h" : "v"}-${road.coordinate}-${side}-${along}`,
              x,
              z,
              yaw,
              side,
              horizontal: road.horizontal,
              roadCoordinate: road.coordinate,
              roadWidth: road.width,
            });
          }
    }
    return result.sort(
      (a, b) =>
        Math.hypot(a.x, a.z - 75) - Math.hypot(b.x, b.z - 75) ||
        a.id.localeCompare(b.id),
    );
  }
  const parking = [],
    parkingCandidates = candidates("parking");
  const targets = [
    { x: 0, z: 150 },
    { x: -60, z: 0 },
    { x: 65, z: 0 },
    { x: 0, z: -60 },
    { x: -145, z: 0 },
    { x: 145, z: 0 },
    { x: 0, z: 245 },
    { x: 0, z: -150 },
    { x: -245, z: 0 },
    { x: 245, z: 0 },
    { x: 0, z: 340 },
    { x: 0, z: -245 },
  ];
  for (let slot = 0; slot < targets.length; slot++) {
    const modelId = MODELS[slot % MODELS.length],
      model = PASSENGER_MODELS[modelId],
      target = targets[slot];
    const sorted = parkingCandidates
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.z - target.z) -
            Math.hypot(b.x - target.x, b.z - target.z) ||
          a.id.localeCompare(b.id),
      );
    for (const candidate of sorted) {
      // Measured exact factory bounds fit these authored conservative dimensions.
      const footprint = boxAt(
        candidate.x,
        candidate.z,
        model.width + 0.18,
        model.length + 0.28,
        candidate.yaw,
      );
      if (!safe(footprint, "parking")) continue;
      if (
        parking.some(
          (p) => Math.hypot(candidate.x - p.x, candidate.z - p.z) < 18,
        )
      )
        continue;
      parking.push({
        ...candidate,
        id: `city-park-${candidate.id}`,
        modelId,
        colour: PALETTE[slot % PALETTE.length],
        bounds: {
          width: model.width,
          length: model.length,
          height: model.height,
        },
        footprint,
      });
      occupied.push(footprint);
      break;
    }
  }
  const shelters = [],
    bicycles = [],
    propCandidates = candidates("prop");
  const chooseProp = (kind, count, width, depth, list) => {
    for (const candidate of propCandidates) {
      const footprint = boxAt(
        candidate.x,
        candidate.z,
        width,
        depth,
        candidate.yaw,
        0.08,
      );
      if (!safe(footprint, kind)) continue;
      if (
        [...shelters, ...bicycles].some(
          (p) => Math.hypot(candidate.x - p.x, candidate.z - p.z) < 68,
        )
      )
        continue;
      const p = { ...candidate, id: `city-${kind}-${candidate.id}`, footprint };
      list.push(p);
      occupied.push(footprint);
      if (list.length === count) break;
    }
  };
  chooseProp("shelter", 2, 4.75, 1.8, shelters);
  chooseProp("bicycles", 3, 3.6, 1.25, bicycles);
  return { parking, shelters, bicycles };
}

function originalSignAtlas() {
  if (typeof document === "undefined") {
    const t = new THREE.DataTexture(new Uint8Array([220, 224, 212, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const headings = [
    "SANTA TOMATA",
    "01 · CENTRO / COOPERATIVA",
    "HORÁRIOS · DIAS ÚTEIS",
    "ESTACIONAMENTO",
    "BICICLETAS",
    "VIAJE COM A CIDADE",
    "CIRCULE DEVAGAR",
    "DA QUINTA À SUA MESA",
  ];
  for (let slot = 0; slot < 8; slot++) {
    const x = (slot % 4) * 256,
      y = Math.floor(slot / 4) * 256;
    ctx.fillStyle = slot === 3 ? "#345b7c" : slot === 7 ? "#e5d8bb" : "#284843";
    ctx.fillRect(x, y, 256, 256);
    ctx.strokeStyle = "#c8ccb2";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 8, y + 8, 240, 240);
    ctx.fillStyle = slot === 7 ? "#405644" : "#f1eedf";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 19px Arial";
    if (slot === 3) {
      ctx.font = "bold 150px Arial";
      ctx.fillText("P", x + 128, y + 119);
      ctx.font = "17px Arial";
      ctx.fillText("LUGARES MARCADOS", x + 128, y + 217);
    } else if (slot === 2) {
      ctx.font = "bold 16px Arial";
      ctx.fillText(headings[slot], x + 128, y + 31);
      ctx.font = "17px monospace";
      for (let row = 0; row < 6; row++)
        ctx.fillText(
          `${String(7 + row * 2).padStart(2, "0")}:10   ${String(8 + row * 2).padStart(2, "0")}:40`,
          x + 128,
          y + 70 + row * 27,
        );
    } else {
      ctx.fillText(headings[slot], x + 128, y + 81, 228);
      ctx.font = "15px Arial";
      ctx.fillText(
        slot === 4
          ? "PRENDA O QUADRO"
          : slot === 7
            ? "TOMATE LOCAL · MERCADO"
            : "TRANSPORTES MUNICIPAIS",
        x + 128,
        y + 142,
        228,
      );
      ctx.font = "12px Arial";
      ctx.fillText("SANTA TOMATA", x + 128, y + 204, 220);
    }
    ctx.fillStyle = slot === 7 ? "#ad9d7f" : "#112e2c";
    ctx.globalAlpha = 0.1;
    for (let grain = 0; grain < 35; grain++) {
      const n = hash(slot, grain, 17);
      ctx.fillRect(
        x + 12 + (n % 228),
        y + 14 + ((n >>> 9) % 224),
        1 + (n % 3),
        1,
      );
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  texture.name = "original-streetlife-portuguese-lettering";
  return texture;
}

/** Street props plus stable parked-vehicle spawn data, only in Santa Tomata. */
export function createCityStreetLife(scene, world, quality = "medium") {
  const plan = planCityStreetLife(world),
    group = new THREE.Group();
  group.name = "city-streetlife";
  const stats = {
    parkedVehicleSpawns: plan.parking.length,
    busShelters: plan.shelters.length,
    bicycleStands: plan.bicycles.length,
    bicycles: plan.bicycles.length * 2,
    staticMeshes: 0,
    staticTriangles: 0,
    visibleGroups: 0,
  };
  const colliders = [],
    placements = [],
    ownedGeometry = new Set(),
    ownedMaterials = new Set(),
    ownedTextures = new Set(),
    lod = [];
  let disposed = false;
  const result = {
    group,
    stats,
    colliders,
    interactionPoints: [],
    placements,
    parkedVehicleSpawns: plan.parking.map(
      ({ id, modelId, colour, x, z, yaw, bounds, footprint }) => ({
        id,
        modelId,
        colour,
        x,
        z,
        yaw,
        bounds: { ...bounds },
        footprint: { ...footprint },
      }),
    ),
    update,
    dispose,
  };
  if (!isCity(world)) return result;
  const texture = originalSignAtlas();
  ownedTextures.add(texture);
  const mat = (name, options) => {
    const m = new THREE.MeshStandardMaterial(options);
    m.name = `streetlife-${name}`;
    ownedMaterials.add(m);
    return m;
  };
  const mats = {
    iron: mat("powder-coated-steel", {
      color: 0x394744,
      roughness: 0.64,
      metalness: 0.62,
    }),
    rubber: mat("rubber", { color: 0x222b29, roughness: 0.96 }),
    steel: mat("brushed-metal", {
      color: 0xa1aba5,
      roughness: 0.42,
      metalness: 0.8,
    }),
    wood: mat("worn-bench", { color: 0x887458, roughness: 0.83 }),
    paint: mat("bicycle-frame", {
      color: 0x72544b,
      roughness: 0.44,
      metalness: 0.42,
    }),
    green: mat("bicycle-frame-green", {
      color: 0x586e62,
      roughness: 0.46,
      metalness: 0.42,
    }),
    glass: mat("shelter-glass", {
      color: 0x9aafb1,
      transparent: true,
      opacity: 0.24,
      roughness: 0.19,
      metalness: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    letters: mat("lettering", { map: texture, roughness: 0.8 }),
    mark: mat("worn-parking-paint", {
      color: 0xd6d3bd,
      roughness: 0.98,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  };
  const floor = (x, z, kind) =>
    finite(world.groundHeightAt?.(x, z))
      ? world.groundHeightAt(x, z)
      : kind === "parking"
        ? 0.035
        : 0.175;
  function site(p, kind) {
    const g = new THREE.Group();
    g.name = p.id;
    g.position.set(p.x, floor(p.x, p.z, kind), p.z);
    g.rotation.y = p.yaw;
    group.add(g);
    lod.push({ group: g, x: p.x, z: p.z, kind });
    placements.push({
      id: p.id,
      kind,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      footprint: { ...p.footprint },
    });
    return g;
  }
  function mesh(
    g,
    geometry,
    material,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  const box = (g, m, x, y, z, w, h, d) =>
    mesh(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  function tube(g, m, a, b, r = 0.025, segments = 8) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.sub(start),
      length = delta.length();
    if (length < 1e-6) return;
    const o = mesh(
      g,
      new THREE.CylinderGeometry(r, r, length, segments, 1),
      m,
      ...start.addScaledVector(delta, 0.5).toArray(),
    );
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return o;
  }
  function plate(g, slot, x, y, z, w, h, yaw = Math.PI) {
    const geo = new THREE.PlaneGeometry(w, h),
      uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        ((slot % 4) + uv.getX(i)) / 4,
        (1 - Math.floor(slot / 4) + uv.getY(i)) / 2,
      );
    return mesh(g, geo, mats.letters, x, y, z, 0, yaw);
  }
  function collider(p, x, z, width, depth, height) {
    const c = Math.cos(p.yaw),
      s = Math.sin(p.yaw),
      px = p.x + x * c + z * s,
      pz = p.z - x * s + z * c;
    colliders.push({
      ...boxAt(px, pz, width, depth, p.yaw),
      minY: 0,
      maxY: height,
      streetLifeId: p.id,
    });
  }
  function batch(g) {
    g.updateMatrixWorld(true);
    const byMat = new Map(),
      inverse = new THREE.Matrix4().copy(g.matrixWorld).invert();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld),
        );
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
      o.geometry.dispose();
    });
    g.clear();
    for (const [material, parts] of byMat) {
      const geometry = mergeGeometries(parts, false);
      parts.forEach((p) => p.dispose());
      if (!geometry) throw Error("Could not merge original street furniture");
      geometry.computeBoundingSphere();
      ownedGeometry.add(geometry);
      const object = new THREE.Mesh(geometry, material);
      object.castShadow = !material.transparent;
      object.receiveShadow = true;
      if (material === mats.glass) object.renderOrder = 2;
      g.add(object);
      stats.staticMeshes++;
      stats.staticTriangles += geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position.count / 3;
    }
  }
  for (const p of plan.parking) {
    const g = site(p, "parking"),
      width = Math.max(2.65, p.bounds.width + 0.35),
      length = Math.max(5.5, p.bounds.length + 0.9);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        if (hash(p.x, p.z, k + side + 2) % 9 === 0) continue;
        box(
          g,
          mats.mark,
          (side * width) / 2,
          0.018,
          -length / 2 + 0.23 + (k * (length - 0.46)) / 8,
          0.055,
          0.009,
          (length - 0.46) / 10,
        );
      }
      for (const end of [-1, 1]) {
        box(
          g,
          mats.mark,
          side * (width / 2 - 0.23),
          0.018,
          (end * length) / 2,
          0.46,
          0.009,
          0.055,
        );
      }
    }
    batch(g);
  }
  for (const p of plan.shelters) {
    const g = site(p, "shelter");
    for (const x of [-2.13, 2.13])
      for (const z of [-0.64, 0.64])
        tube(g, mats.iron, [x, 0, z], [x, 2.47, z], 0.045, 10);
    box(g, mats.iron, 0, 2.5, 0, 4.6, 0.16, 1.75);
    box(g, mats.steel, 0, 2.595, 0, 4.52, 0.025, 1.66);
    box(g, mats.glass, 0, 1.33, 0.63, 4.17, 2.1, 0.025);
    for (const x of [-2.11, 2.11])
      box(g, mats.glass, x, 1.33, 0, 0.025, 2.1, 1.24);
    for (const x of [-1.28, 1.28]) {
      tube(g, mats.iron, [x, 0, 0.15], [x, 0.52, 0.15], 0.04);
      tube(g, mats.iron, [x, 0, 0.5], [x, 0.52, 0.5], 0.04);
    }
    for (let slat = 0; slat < 4; slat++)
      box(g, mats.wood, 0, 0.53, 0.08 + slat * 0.13, 2.9, 0.055, 0.1);
    for (let slat = 0; slat < 3; slat++)
      box(g, mats.wood, 0, 0.72 + slat * 0.13, 0.54, 2.9, 0.09, 0.035);
    plate(g, 0, -0.6, 2.48, -0.89, 2.7, 0.28);
    plate(g, 1, 1.45, 2.48, -0.895, 1.1, 0.27);
    plate(g, 2, 1.78, 1.28, -0.67, 0.49, 0.88);
    box(g, mats.iron, 1.78, 1.28, -0.64, 0.56, 0.94, 0.045);
    plate(g, 5, -1.8, 1.35, 0.605, 0.5, 0.76);
    collider(p, 0, 0.64, 4.33, 0.11, 2.47);
    collider(p, -2.13, 0, 0.12, 1.4, 2.47);
    collider(p, 2.13, 0, 0.12, 1.4, 2.47);
    collider(p, 0, 0.31, 3.05, 0.62, 0.95);
    batch(g);
  }
  function bicycle(parent, offset, material) {
    const bike = new THREE.Group();
    bike.position.set(offset, 0.004, offset < 0 ? -0.23 : 0.23);
    bike.rotation.y = 0;
    bike.rotation.x = 0.08;
    parent.add(bike);
    const rear = [-0.58, 0.34, 0],
      front = [0.58, 0.34, 0],
      crank = [-0.03, 0.31, 0],
      seat = [-0.2, 0.87, 0],
      head = [0.43, 0.86, 0];
    for (const [a, b] of [
      [rear, crank],
      [crank, seat],
      [seat, rear],
      [seat, head],
      [head, crank],
      [head, front],
    ])
      tube(bike, material, a, b, 0.025);
    tube(bike, mats.steel, [0.43, 0.86, 0.04], [0.58, 0.34, 0.04], 0.016);
    tube(bike, mats.steel, [0.43, 0.86, -0.04], [0.58, 0.34, -0.04], 0.016);
    tube(bike, mats.steel, [-0.2, 0.87, 0], [-0.22, 1.01, 0], 0.018);
    box(bike, mats.rubber, -0.23, 1.02, 0, 0.26, 0.055, 0.16);
    tube(bike, mats.steel, [0.43, 0.86, 0], [0.4, 1.02, 0], 0.018);
    tube(bike, mats.steel, [0.4, 1.02, -0.23], [0.4, 1.02, 0.23], 0.018);
    for (const z of [-0.21, 0.21])
      tube(
        bike,
        mats.rubber,
        [0.4, 1.02, z - 0.04],
        [0.4, 1.02, z + 0.04],
        0.025,
      );
    for (const x of [-0.58, 0.58]) {
      mesh(
        bike,
        new THREE.TorusGeometry(0.315, 0.026, 6, 28),
        mats.rubber,
        x,
        0.34,
        0,
      );
      mesh(
        bike,
        new THREE.TorusGeometry(0.286, 0.008, 4, 28),
        mats.steel,
        x,
        0.34,
        0,
      );
      for (let k = 0; k < 12; k++) {
        const t = (k * Math.PI) / 6;
        tube(
          bike,
          mats.steel,
          [x, 0.34, 0],
          [x + Math.sin(t) * 0.283, 0.34 + Math.cos(t) * 0.283, 0],
          0.0035,
          4,
        );
      }
      tube(bike, mats.steel, [x, 0.34, -0.055], [x, 0.34, 0.055], 0.025);
    }
    tube(bike, mats.steel, [-0.03, 0.31, -0.13], [-0.03, 0.31, 0.13], 0.018);
    tube(bike, mats.steel, [-0.03, 0.31, 0.13], [0.12, 0.23, 0.13], 0.013);
    box(bike, mats.rubber, 0.12, 0.23, 0.16, 0.12, 0.025, 0.12);
    tube(bike, mats.iron, [-0.03, 0.31, -0.13], [-0.15, 0.41, -0.13], 0.013);
    box(bike, mats.rubber, -0.15, 0.41, -0.16, 0.12, 0.025, 0.12);
    tube(
      bike,
      mats.iron,
      [-0.03, 0.31, -0.045],
      [-0.58, 0.34, -0.045],
      0.007,
      5,
    );
  }
  for (const p of plan.bicycles) {
    const g = site(p, "bicycles");
    for (const x of [-1.1, 0, 1.1]) {
      tube(g, mats.steel, [x, 0, -0.38], [x, 0.68, -0.38], 0.035);
      tube(g, mats.steel, [x, 0, 0.38], [x, 0.68, 0.38], 0.035);
      mesh(
        g,
        new THREE.TorusGeometry(0.38, 0.035, 6, 12, Math.PI),
        mats.steel,
        x,
        0.68,
        0,
        0,
        Math.PI / 2,
        0,
      );
    }
    bicycle(g, -0.54, mats.paint);
    bicycle(g, 0.62, mats.green);
    tube(g, mats.iron, [1.48, 0, 0.38], [1.48, 1.6, 0.38], 0.027);
    plate(g, 4, 1.48, 1.49, 0.34, 0.49, 0.34);
    collider(p, 0, 0, 3.6, 1.24, 1.1);
    batch(g);
  }
  scene.add(group);
  update(0, world.spawn || { x: 0, z: 86 });
  function update(dt, player) {
    if (disposed || !point(player)) return;
    const range = quality === "low" ? 95 : quality === "high" ? 240 : 180;
    let count = 0;
    for (const entry of lod) {
      const limit = entry.kind === "parking" ? range : range + 25;
      entry.group.visible =
        Math.hypot(entry.x - player.x, entry.z - player.z) < limit;
      if (entry.group.visible) count++;
    }
    stats.visibleGroups = count;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const value of ownedGeometry) value.dispose();
    for (const value of ownedMaterials) value.dispose();
    for (const value of ownedTextures) value.dispose();
    group.clear();
    lod.length = 0;
  }
  return result;
}

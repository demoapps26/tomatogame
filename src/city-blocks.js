import * as THREE from "three";
import { createDetailedBuilding } from "./district-asset.js";

// These are the measured *solid* v0.9 Bistro envelopes, not their larger
// procedural predecessor lots. Keeping them in every quality preserves saves
// and the pedestrian passages beside the four original detailed buildings.
export const LEGACY_CITY_ENVELOPES = Object.freeze({
  "-68:28": Object.freeze({
    width: 11.986325863396793,
    depth: 15.767245438944803,
    height: 21.49617958133696,
  }),
  "-28:28": Object.freeze({
    width: 11.989348787168112,
    depth: 15.76396517505349,
    height: 21.49617958133696,
  }),
  "-68:68": Object.freeze({
    width: 16.30457507595824,
    depth: 15.055052727375532,
    height: 16.642171861023,
  }),
  "-28:68": Object.freeze({
    width: 15.054266965800833,
    depth: 16.30564906956164,
    height: 16.642171861023,
  }),
});
const ROW_SITES = new Set([
  "28:-68",
  "68:-68",
  "28:-28",
  "68:-28",
  "-164:124",
  "-124:124",
  "-164:164",
  "-124:164",
]);
const NATIVE_YAWS = {
  "-68:28": 0.471,
  "-28:28": 3.613,
  "-68:68": 0.471,
  "-28:68": 2.042,
};
const FRONT_ANGLE = Math.atan2(-0.891, -0.454);
const finite = Number.isFinite;

export function isCityBlockSite(x, z) {
  const key = `${x}:${z}`;
  return ROW_SITES.has(key) || Object.hasOwn(LEGACY_CITY_ENVELOPES, key);
}

/** Pure planning data: all above-ground solids stay inside an old solid lot. */
export function planCityBlocks(sites = []) {
  const lots = [],
    buildings = [],
    pavements = [];
  const blocks = new Map();
  for (const site of sites) {
    if (
      !site ||
      !isCityBlockSite(site.x, site.z) ||
      site.label ||
      ![site.x, site.z, site.width, site.depth].every(finite)
    )
      continue;
    const key = `${site.x}:${site.z}`,
      legacy = LEGACY_CITY_ENVELOPES[key];
    const width = legacy?.width ?? site.width + 0.12;
    const depth = legacy?.depth ?? site.depth + 0.12;
    const envelope = {
      minX: site.x - width / 2,
      maxX: site.x + width / 2,
      minZ: site.z - depth / 2,
      maxZ: site.z + depth / 2,
    };
    const bx = Math.floor(site.x / 96) * 96 + 48;
    const bz = Math.floor(site.z / 96) * 96 + 48;
    const blockId = `${bx}:${bz}`;
    blocks.set(blockId, { x: bx, z: bz });
    const lot = {
      id: key,
      x: site.x,
      z: site.z,
      width,
      depth,
      envelope,
      blockId,
      legacy: !!legacy,
      color: site.color || "#d9d1bd",
    };
    lots.push(lot);
    if (legacy) {
      const variant = site.z === 68 ? "cafe" : "townhouse";
      buildings.push({
        id: `${key}:0`,
        lotId: key,
        blockId,
        x: site.x,
        z: site.z,
        variant,
        yaw: NATIVE_YAWS[key],
        width: width - 0.9,
        depth: depth - 0.9,
        height: legacy.height,
        native: true,
        color: lot.color,
        envelope,
      });
      continue;
    }
    // Two adjoining, narrower townhouses give each former detached volume a
    // continuous street face. Height and door scale stay in authored metres.
    const roadX = Math.round(site.x / 96) * 96;
    const roadZ = Math.round(site.z / 96) * 96;
    const faceX = Math.abs(site.x - roadX) <= Math.abs(site.z - roadZ);
    const direction = faceX
      ? Math.sign(roadX - site.x)
      : Math.sign(roadZ - site.z);
    const yaw =
      (faceX ? (direction * Math.PI) / 2 : direction > 0 ? 0 : Math.PI) -
      FRONT_ANGLE;
    const span = (faceX ? depth : width) - 0.28;
    const distance = Math.min(12.1, (faceX ? width : depth) * 0.51);
    for (let index = 0; index < 2; index++) {
      const along = ((index ? 1 : -1) * span) / 4;
      const outward =
        direction * ((faceX ? width : depth) / 2 - distance / 2 - 0.14);
      buildings.push({
        id: `${key}:${index}`,
        lotId: key,
        blockId,
        x: site.x + (faceX ? outward : along),
        z: site.z + (faceX ? along : outward),
        variant: "townhouse",
        yaw,
        width: faceX ? distance : span / 2,
        depth: faceX ? span / 2 : distance,
        height: 21.49617958133696,
        color: index ? "#d4cdbb" : lot.color,
        native: false,
        faceX,
        direction,
        envelope,
      });
    }
  }
  for (const [id, block] of blocks) {
    const left = block.x - 48,
      right = block.x + 48;
    const back = block.z - 48,
      front = block.z + 48;
    // Stop at the inner edge of each existing pavement: never cover asphalt,
    // crossing marks, curb ramps or the neighbour's reserved business block.
    const minX = left + (left === 0 ? 13.4 : 10.4);
    const maxX = right - (right === 0 ? 13.4 : 10.4);
    const minZ = back + (back === 0 ? 13.4 : 10.4);
    const maxZ = front - (front === 0 ? 13.4 : 10.4);
    pavements.push({ id, minX, maxX, minZ, maxZ, floorHeight: 0.16 });
  }
  return { lots, buildings, pavements };
}

/** Spatially instanced licensed facades, shallow attached wings and far LOD. */
export function createCityBlocks({
  sites = [],
  quality = "medium",
  materials: supplied = {},
} = {}) {
  const plan = planCityBlocks(sites),
    low = quality === "low",
    high = quality === "high";
  const group = new THREE.Group();
  group.name = "composed-city-blocks";
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const batches = new Map(),
    render = [],
    solids = [],
    ownedTemplates = [];
  const stats = {
    lots: plan.lots.length,
    buildings: plan.buildings.length,
    detailedBuildings: low ? 0 : plan.buildings.length,
    rowHouses: plan.buildings.filter((b) => !b.native).length,
    attachedWings: 0,
    pavedCourtyards: plan.pavements.length,
    triangles: 0,
    detailedTriangles: 0,
    drawCalls: 0,
    visibleDrawCalls: 0,
    visibleTriangles: 0,
    quality,
  };
  const own = (value) => (materials.add(value), value);
  const mat = (key, color, roughness = 0.85) =>
    supplied[key] || own(new THREE.MeshStandardMaterial({ color, roughness }));
  const wall = mat("plaster", "#d7cdb7"),
    stone = mat("concrete", "#b9b6a7");
  const trim = mat("trim", "#c6c0ad"),
    roof = mat("roof", "#ad7760");
  const glass = mat("window", "#304544", 0.22),
    iron = mat("dark", "#33443c");
  const paving = mat("stone", "#c6c1b4");
  const border = own(stone.clone());
  border.onBeforeCompile = stone.onBeforeCompile;
  border.customProgramCacheKey = stone.customProgramCacheKey;
  border.polygonOffset = true;
  border.polygonOffsetFactor = -1;
  border.polygonOffsetUnits = -1;
  const box = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(box);
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  geometries.add(plane);
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    axis = new THREE.Vector3(0, 1, 0);
  const byLot = new Map(plan.lots.map((lot) => [lot.id, lot]));
  const floorSurfaces = plan.pavements.map((value) => ({ ...value }));
  const triangleCount = (geometry) =>
    (geometry.index?.count || geometry.attributes.position.count) / 3;

  function add(
    geometry,
    material,
    transform,
    block,
    mode = "support",
    color = null,
  ) {
    const key = `${geometry.uuid}:${material.uuid}:${block}:${mode}`;
    if (!batches.has(key))
      batches.set(key, { geometry, material, block, mode, items: [] });
    batches.get(key).items.push({ matrix: transform.clone(), color });
  }
  function cube(
    material,
    x,
    y,
    z,
    width,
    height,
    depth,
    block,
    mode = "support",
    color = null,
    yaw = 0,
  ) {
    position.set(x, y, z);
    scale.set(width, height, depth);
    quaternion.setFromAxisAngle(axis, yaw);
    matrix.compose(position, quaternion, scale);
    add(box, material, matrix, block, mode, color);
  }
  function rememberSolid(lot, x, z, width, depth, height, kind) {
    solids.push({
      lotId: lot.id,
      kind,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      minY: 0.16,
      maxY: height + 0.16,
    });
  }
  function facade(lot, face, height, mode, color) {
    const count = Math.max(1, Math.floor((face.span - 0.9) / 2.9));
    const floors = Math.max(2, Math.floor((height - 1.6) / 3.15));
    const c = Math.cos(face.yaw),
      s = Math.sin(face.yaw);
    const local = (a, out, y, w, h, d, material, tint = null) =>
      cube(
        material,
        face.x + a * c + out * s,
        y,
        face.z - a * s + out * c,
        w,
        h,
        d,
        lot.blockId,
        mode,
        tint,
        face.yaw,
      );
    for (let floor = 0; floor < floors; floor++) {
      const y = 1.9 + floor * 3.15;
      for (let bay = 0; bay < count; bay++) {
        const a = ((bay + 0.5) * face.span) / count - face.span / 2;
        local(
          a,
          0.075,
          y + 0.1,
          floor ? 1.22 : 1.65,
          floor ? 1.9 : 2.35,
          0.1,
          iron,
        );
        local(
          a,
          0.135,
          y + 0.1,
          floor ? 1.04 : 1.45,
          floor ? 1.7 : 2.15,
          0.045,
          glass,
        );
        local(
          a,
          0.2,
          y - (floor ? 0.87 : 1.11),
          floor ? 1.48 : 1.88,
          0.12,
          0.29,
          trim,
        );
        for (const side of [-1, 1])
          local(
            a + side * (floor ? 0.69 : 0.91),
            0.14,
            y + 0.1,
            0.11,
            floor ? 2.14 : 2.58,
            0.18,
            trim,
          );
        if (!low && floor > 0 && (bay + floor) % 2 === 0) {
          local(a, 0.17, y - 0.85, 1.7, 0.13, 0.4, stone);
          local(a, 0.33, y - 0.4, 1.6, 0.06, 0.06, iron);
          for (let bar = -2; bar <= 2; bar++)
            local(a + bar * 0.29, 0.33, y - 0.62, 0.035, 0.45, 0.035, iron);
        }
      }
      local(0, 0.12, y + 1.35, face.span, 0.105, 0.19, trim);
    }
    local(0, 0.05, 0.59, face.span, 0.86, 0.14, stone);
    local(0, 0.19, height - 0.15, face.span, 0.27, 0.38, trim);
    local(0, 0.08, 3.15, face.span * 0.82, 0.33, 0.15, wall, color);
  }
  function volume(lot, x, z, width, depth, height, mode, color, kind = "wing") {
    const inset = 0.3;
    cube(
      wall,
      x,
      0.16 + height / 2,
      z,
      width - inset * 2,
      height,
      depth - inset * 2,
      lot.blockId,
      mode,
      color,
    );
    cube(
      stone,
      x,
      0.43,
      z,
      width - 0.1,
      0.54,
      depth - 0.1,
      lot.blockId,
      mode,
      "#a5a397",
    );
    cube(
      roof,
      x,
      height + 0.15,
      z,
      width - 0.05,
      0.2,
      depth - 0.05,
      lot.blockId,
      mode,
      "#a28872",
    );
    rememberSolid(lot, x, z, width, depth, height + 0.25, kind);
    for (const [fx, fz, span, yaw] of [
      [x, z + depth / 2 - 0.4, width - 0.66, 0],
      [x, z - depth / 2 + 0.4, width - 0.66, Math.PI],
      [x + width / 2 - 0.4, z, depth - 0.66, Math.PI / 2],
      [x - width / 2 + 0.4, z, depth - 0.66, -Math.PI / 2],
    ])
      if (span > 1)
        facade(lot, { x: fx, z: fz, span, yaw }, height, mode, color);
  }

  const templates = new Map();
  if (!low)
    for (const variant of ["townhouse", "cafe"]) {
      const template = createDetailedBuilding({ variant });
      template.updateMatrixWorld(true);
      templates.set(variant, template);
      ownedTemplates.push(template);
      template.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of object.material
          ? [object.material].flat()
          : []) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture) textures.add(value);
        }
      });
    }
  for (const building of plan.buildings) {
    const lot = byLot.get(building.lotId);
    const footprint = {
      x: building.x,
      z: building.z,
      width: building.width,
      depth: building.depth,
    };
    if (!building.native) {
      // Preserve the shared party wall, reserving 0.7 m only at each outside
      // gable for a finished corner wing rather than another exposed blind wall.
      const inward = building.id.endsWith(":0") ? 1 : -1;
      if (building.faceX) {
        footprint.z += inward * 0.35;
        footprint.depth -= 0.7;
      } else {
        footprint.x += inward * 0.35;
        footprint.width -= 0.7;
      }
    }
    if (!low) {
      const template = templates.get(building.variant);
      template.rotation.y = building.yaw;
      template.updateMatrixWorld(true);
      const bound = new THREE.Box3().setFromObject(template, true);
      const size = bound.getSize(new THREE.Vector3()),
        center = bound.getCenter(new THREE.Vector3());
      // Compress only frontage width, keeping authored door/floor height. Rear
      // wings occupy the old solid volume and hide the source's blank gables.
      const sx = footprint.width / size.x,
        sz = footprint.depth / size.z;
      const sy = building.native
        ? Math.min(1, (building.height - 0.3) / size.y)
        : 1;
      const fitted = new THREE.Matrix4()
        .makeTranslation(footprint.x, 0.16, footprint.z)
        .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
        .multiply(
          new THREE.Matrix4().makeTranslation(
            -center.x,
            -bound.min.y,
            -center.z,
          ),
        );
      for (const mesh of template.children) {
        const transform = fitted.clone().multiply(mesh.matrixWorld);
        add(mesh.geometry, mesh.material, transform, lot.blockId, "detail");
        stats.detailedTriangles += triangleCount(mesh.geometry);
      }
    }
    volume(
      lot,
      footprint.x,
      footprint.z,
      footprint.width,
      footprint.depth,
      building.native ? building.height - 0.3 : building.height,
      "proxy",
      building.color,
      "proxy",
    );
  }
  for (const lot of plan.lots) {
    if (lot.legacy) {
      // Two shallow side wings dress the blind inward walls without crossing
      // the historical envelope or closing the courtyard passages.
      const height = LEGACY_CITY_ENVELOPES[lot.id].height - 0.55;
      const bx = Math.floor(lot.x / 96) * 96 + 48,
        bz = Math.floor(lot.z / 96) * 96 + 48;
      const towardX = Math.sign(bx - lot.x),
        towardZ = Math.sign(bz - lot.z);
      volume(
        lot,
        lot.x + towardX * (lot.width / 2 - 0.72),
        lot.z,
        1.38,
        lot.depth - 0.16,
        height,
        "support",
        lot.color,
      );
      volume(
        lot,
        lot.x,
        lot.z + towardZ * (lot.depth / 2 - 0.72),
        lot.width - 0.16,
        1.38,
        height - 0.15,
        "support",
        lot.color,
      );
      stats.attachedWings += 2;
    } else {
      const row = plan.buildings.filter(
        (building) => building.lotId === lot.id,
      );
      for (const building of row) {
        const horizontal = building.faceX;
        const full = horizontal ? lot.width : lot.depth;
        const mainDepth = horizontal ? building.width : building.depth;
        const wingDepth = full - mainDepth - 0.3;
        const shift = -building.direction * (full / 2 - wingDepth / 2 - 0.14);
        volume(
          lot,
          horizontal ? lot.x + shift : building.x,
          horizontal ? building.z : lot.z + shift,
          horizontal ? wingDepth : building.width,
          horizontal ? building.depth : wingDepth,
          building.height - 0.55,
          "support",
          building.color,
        );
        stats.attachedWings++;
      }
      if (!low)
        for (const side of [-1, 1]) {
          const horizontal = row[0].faceX;
          volume(
            lot,
            horizontal ? lot.x : lot.x + side * (lot.width / 2 - 0.72),
            horizontal ? lot.z + side * (lot.depth / 2 - 0.72) : lot.z,
            horizontal ? lot.width - 0.16 : 1.38,
            horizontal ? 1.38 : lot.depth - 0.16,
            row[0].height - 0.55,
            "support",
            lot.color,
          );
          stats.attachedWings++;
        }
    }
  }
  for (const pavement of plan.pavements) {
    const x = (pavement.minX + pavement.maxX) / 2,
      z = (pavement.minZ + pavement.maxZ) / 2;
    const width = pavement.maxX - pavement.minX,
      depth = pavement.maxZ - pavement.minZ;
    position.set(x, pavement.floorHeight, z);
    quaternion.identity();
    scale.set(width, 1, depth);
    matrix.compose(position, quaternion, scale);
    add(plane, paving, matrix, pavement.id, "ground", "#c9c6b8");
    // Fine masonry joints and dark perimeter bands give the courtyard a real
    // scale, all coplanar and deliberately without physical obstacles.
    for (const side of [-1, 1]) {
      cube(
        border,
        x,
        0.157,
        side < 0 ? pavement.minZ + 0.18 : pavement.maxZ - 0.18,
        width,
        0.006,
        0.24,
        pavement.id,
        "ground",
        "#9b9f95",
      );
      cube(
        border,
        side < 0 ? pavement.minX + 0.18 : pavement.maxX - 0.18,
        0.157,
        z,
        0.24,
        0.006,
        depth,
        pavement.id,
        "ground",
        "#9b9f95",
      );
    }
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.items.length,
    );
    batch.items.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      if (item.color) mesh.setColorAt(index, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow =
      batch.mode !== "ground" &&
      batch.material !== glass &&
      !batch.material.transparent;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.name = `city-block-${batch.block}-${batch.mode}`;
    const triangles = triangleCount(batch.geometry) * batch.items.length;
    stats.triangles += triangles;
    const [x, z] = batch.block.split(":").map(Number);
    render.push({ mesh, mode: batch.mode, x, z, triangles });
    group.add(mesh);
  }
  stats.drawCalls = render.length;
  let disposed = false;
  function update(_elapsed = 0, focus = { x: 0, z: 86 }) {
    if (disposed || !finite(focus?.x) || !finite(focus?.z)) return;
    stats.visibleDrawCalls = stats.visibleTriangles = 0;
    for (const batch of render) {
      const distance = Math.hypot(batch.x - focus.x, batch.z - focus.z);
      const detailed = !low && distance < (high ? 275 : 205);
      batch.mesh.visible =
        distance < (low ? 330 : high ? 630 : 470) &&
        (batch.mode === "detail"
          ? detailed
          : batch.mode === "proxy"
            ? !detailed
            : true);
      if (batch.mesh.visible) {
        stats.visibleDrawCalls++;
        stats.visibleTriangles += batch.triangles;
      }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const batch of render) batch.mesh.dispose();
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    group.clear();
    batches.clear();
    ownedTemplates.length = 0;
  }
  update();
  return {
    group,
    stats,
    plan,
    solidFootprints: solids,
    floorSurfaces,
    update,
    dispose,
  };
}

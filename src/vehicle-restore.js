// Restore persistent cars as one placement problem. Live traffic and delivery
// vehicles deliberately do not participate: their positions are not saved.
const DEFAULT_BOUNDS = { width: 2.35, length: 4.5 };

const identifier = (value) => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};
const hasIdentifier = (value) =>
  value !== undefined && value !== null && value !== "";
const hasIdentity = (value) =>
  hasIdentifier(value?.ownershipId) || hasIdentifier(value?.worldCarId);
const dimensions = (car) => ({
  width:
    Number.isFinite(car?.bounds?.width) && car.bounds.width > 0
      ? car.bounds.width
      : DEFAULT_BOUNDS.width,
  length:
    Number.isFinite(car?.bounds?.length) && car.bounds.length > 0
      ? car.bounds.length
      : DEFAULT_BOUNDS.length,
});

function pose(point, defaultYaw) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
  const yaw = point.yaw === undefined ? defaultYaw : point.yaw;
  if (!Number.isFinite(yaw)) return null;
  return { x: point.x, z: point.z, yaw };
}

function footprint(point, bounds) {
  const c = Math.cos(point.yaw),
    s = Math.sin(point.yaw);
  return {
    x: point.x,
    z: point.z,
    width: bounds.width / 2,
    length: bounds.length / 2,
    side: { x: c, z: -s },
    forward: { x: s, z: c },
  };
}

// Separating-axis test for the four relevant axes of two oriented rectangles.
// Full model bounds protect doors/mirrors instead of comparing only centres.
function overlaps(a, b, clearance) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  for (const axis of [a.side, a.forward, b.side, b.forward]) {
    const projectedRadius = (box) =>
      box.width * Math.abs(box.side.x * axis.x + box.side.z * axis.z) +
      box.length * Math.abs(box.forward.x * axis.x + box.forward.z * axis.z);
    if (
      Math.abs(dx * axis.x + dz * axis.z) >=
      projectedRadius(a) + projectedRadius(b) + clearance
    )
      return false;
  }
  return true;
}

function matchSaved(cars, records) {
  const matches = cars.map(() => null);
  const used = new Set();
  const match = (index, predicate) => {
    const savedIndex = records.findIndex(
      (record, i) => !used.has(i) && record && predicate(record),
    );
    if (savedIndex < 0) return;
    used.add(savedIndex);
    matches[index] = records[savedIndex];
  };

  // Resolve stronger identities globally before considering world IDs. A row
  // belonging to a purchased car cannot be consumed by a generic street car.
  cars.forEach((car, index) => {
    const id = identifier(car?.ownershipId);
    if (id !== null)
      match(index, (record) => identifier(record.ownershipId) === id);
  });
  cars.forEach((car, index) => {
    if (matches[index]) return;
    const id = identifier(car?.worldCarId),
      ownershipId = identifier(car?.ownershipId);
    if (id !== null)
      match(
        index,
        (record) =>
          identifier(record.worldCarId) === id &&
          (!hasIdentifier(record.ownershipId) ||
            (ownershipId !== null &&
              identifier(record.ownershipId) === ownershipId)),
      );
  });
  cars.forEach((car, index) => {
    if (
      !matches[index] &&
      !hasIdentity(car) &&
      !hasIdentity(records[index]) &&
      !used.has(index) &&
      records[index]
    ) {
      matches[index] = records[index];
      used.add(index);
    }
  });
  return matches;
}

/**
 * Plan persistent vehicle locations without changing cars or saved records.
 *
 * Returns an array aligned with `cars`; each entry is
 * `{x, z, yaw, source: "saved" | "spawn" | "fallback"}` or null. Null means
 * there is no safe destination: the caller must defer/remove that car rather
 * than leave it at an occupied spawn. Apply the complete result afterwards.
 *
 * `isStaticClear(car, point)` checks world bounds/solid scenery ONLY. It must
 * not consult the cars' current positions, transient traffic or fleet trucks.
 * Missing saved yaw inherits the original yaw; explicit nonfinite yaw rejects
 * the saved point. Numeric coordinates and finite yaw are always required.
 *
 * All valid saved locations are reserved first, then each car's original
 * spawn, then unused original spawns. Conflicting saves keep the first car in
 * input order. Ownership IDs take precedence over world IDs; index matching
 * is restricted to a car and saved row that both have no identity.
 *
 * `fallback(car, planned, canPlace)` may return a point, an array of candidate
 * points or null. `planned` is a frozen snapshot of already reserved locations
 * with `{index, x, z, yaw, bounds}`. `canPlace(point)` checks static scenery and
 * those destinations. Returned candidates are checked again by the planner.
 * Callbacks should not mutate inputs. Clearance is a gap in metres (default
 * 0.08); it never shrinks the physical footprint.
 */
export function restoreVehiclePlacements(cars, savedVehicles, options = {}) {
  if (!Array.isArray(cars)) return [];
  const records = Array.isArray(savedVehicles) ? savedVehicles : [];
  options = options && typeof options === "object" ? options : {};
  const isStaticClear =
    typeof options.isStaticClear === "function"
      ? options.isStaticClear
      : () => true;
  const fallback =
    typeof options.fallback === "function" ? options.fallback : null;
  const clearance = Number.isFinite(options.clearance)
    ? Math.max(0, options.clearance)
    : 0.08;
  const bounds = cars.map(dimensions);
  const spawns = cars.map((car) =>
    pose(car?.position, Number.isFinite(car?.yaw) ? car.yaw : 0),
  );
  const matches = matchSaved(cars, records);
  const placements = cars.map(() => null);
  const occupied = [];
  const available = (index, point) => {
    if (!point || !isStaticClear(cars[index], point)) return false;
    const shape = footprint(point, bounds[index]);
    return !occupied.some((item) => overlaps(shape, item.shape, clearance));
  };
  const assign = (index, point, source) => {
    if (!available(index, point)) return false;
    placements[index] = { ...point, source };
    occupied.push({ index, shape: footprint(point, bounds[index]) });
    return true;
  };

  cars.forEach((car, index) => {
    if (!car || typeof car !== "object") return;
    const saved = pose(matches[index], spawns[index]?.yaw ?? 0);
    assign(index, saved, "saved");
  });
  cars.forEach((car, index) => {
    if (!placements[index] && car && typeof car === "object")
      assign(index, spawns[index], "spawn");
  });
  cars.forEach((car, index) => {
    if (placements[index] || !car || typeof car !== "object") return;
    for (const spawn of spawns) if (assign(index, spawn, "spawn")) break;
  });
  if (fallback)
    cars.forEach((car, index) => {
      if (placements[index] || !car || typeof car !== "object") return;
      const planned = Object.freeze(
        occupied.map(({ index: plannedIndex }) =>
          Object.freeze({
            index: plannedIndex,
            x: placements[plannedIndex].x,
            z: placements[plannedIndex].z,
            yaw: placements[plannedIndex].yaw,
            bounds: Object.freeze({ ...bounds[plannedIndex] }),
          }),
        ),
      );
      const canPlace = (point) =>
        available(index, pose(point, spawns[index]?.yaw ?? 0));
      const candidates = fallback(car, planned, canPlace);
      for (const candidate of Array.isArray(candidates)
        ? candidates
        : [candidates])
        if (assign(index, pose(candidate, spawns[index]?.yaw ?? 0), "fallback"))
          break;
    });
  return placements;
}

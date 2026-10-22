import * as THREE from "three";
import { createVehicle } from "./actors.js";

const VEHICLE_RADIUS = 2.5;
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pointKey = (p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function safeSegment(world, a, b, radius = VEHICLE_RADIUS) {
  const bounds = world.bounds;
  if (!finitePoint(a) || !finitePoint(b)) return false;
  if (
    bounds &&
    [a, b].some(
      (p) =>
        p.x < bounds.minX + radius ||
        p.x > bounds.maxX - radius ||
        p.z < bounds.minZ + radius ||
        p.z > bounds.maxZ - radius,
    )
  )
    return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const box of world.colliders || []) {
    let near = 0;
    let far = 1;
    let intersects = true;
    for (const [origin, delta, low, high] of [
      [a.x, dx, box.minX - radius, box.maxX + radius],
      [a.z, dz, box.minZ - radius, box.maxZ + radius],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < low || origin > high) {
          intersects = false;
          break;
        }
      } else {
        const t1 = (low - origin) / delta;
        const t2 = (high - origin) / delta;
        near = Math.max(near, Math.min(t1, t2));
        far = Math.min(far, Math.max(t1, t2));
        if (near > far) {
          intersects = false;
          break;
        }
      }
    }
    if (intersects) return false;
  }
  return true;
}

/**
 * Plan on the actual road centre lines, with a short safe connection out of the
 * depot. Unlike a ground actor path this never cuts across a city block, and
 * every edge reserves clearance for the entire rotating delivery vehicle.
 * An unreachable destination returns [] so the visual can safely stay parked.
 */
export function planFleetRoute(world, start, destination) {
  if (!finitePoint(start) || !finitePoint(destination)) return [];
  const roads = (world.roads || [])
    .filter(
      (r) =>
        Number.isFinite(r.x) &&
        Number.isFinite(r.z) &&
        r.width > 0 &&
        r.depth > 0,
    )
    .map((road) => ({
      ...road,
      horizontal: road.width > road.depth,
      nodes: [],
    }));
  if (!roads.length || !safeSegment(world, start, start)) return [];
  const nodes = [];
  const lookup = new Map();
  function add(point, road = null) {
    const key = pointKey(point);
    let index = lookup.get(key);
    if (index === undefined) {
      index = nodes.length;
      lookup.set(key, index);
      nodes.push({ x: point.x, z: point.z, edges: [] });
    }
    if (road && !road.nodes.includes(index)) road.nodes.push(index);
    return index;
  }
  function edge(a, b) {
    if (a === b || !safeSegment(world, nodes[a], nodes[b])) return;
    const length = distance(nodes[a], nodes[b]);
    nodes[a].edges.push({ index: b, length });
    nodes[b].edges.push({ index: a, length });
  }
  const along = (road, point) => (road.horizontal ? point.x : point.z);
  const within = (road, point) =>
    Math.abs(point.x - road.x) <= road.width / 2 - VEHICLE_RADIUS &&
    Math.abs(point.z - road.z) <= road.depth / 2 - VEHICLE_RADIUS;
  const project = (road, point) =>
    road.horizontal
      ? {
          x: clamp(
            point.x,
            road.x - road.width / 2 + VEHICLE_RADIUS,
            road.x + road.width / 2 - VEHICLE_RADIUS,
          ),
          z: road.z,
        }
      : {
          x: road.x,
          z: clamp(
            point.z,
            road.z - road.depth / 2 + VEHICLE_RADIUS,
            road.z + road.depth / 2 - VEHICLE_RADIUS,
          ),
        };

  for (const horizontal of roads.filter((r) => r.horizontal)) {
    for (const vertical of roads.filter((r) => !r.horizontal)) {
      const point = { x: vertical.x, z: horizontal.z };
      if (
        within(horizontal, point) &&
        within(vertical, point) &&
        safeSegment(world, point, point)
      ) {
        add(point, horizontal);
        add(point, vertical);
      }
    }
  }
  const startIndex = add(start);
  const starts = roads
    .map((road) => ({ road, point: project(road, start) }))
    .filter(
      ({ point }) =>
        distance(start, point) < 45 && safeSegment(world, start, point),
    )
    .sort((a, b) => distance(a.point, start) - distance(b.point, start))
    .slice(0, 3);
  for (const { road, point } of starts) edge(startIndex, add(point, road));

  // Stop on the street close to the customer, leaving the customer's doorway
  // and interaction point clear. Try both sides before declaring it unreachable.
  const goals = [];
  for (const road of roads) {
    const projected = project(road, destination);
    if (distance(projected, destination) > 35) continue;
    for (const offset of [-12, 12, -20, 20, 0]) {
      const point = { ...projected };
      if (road.horizontal) point.x += offset;
      else point.z += offset;
      if (!within(road, point) || !safeSegment(world, point, point)) continue;
      goals.push({
        index: add(point, road),
        proximity: distance(point, destination),
      });
    }
  }
  if (!starts.length || !goals.length) return [];
  for (const road of roads) {
    road.nodes.sort((a, b) => along(road, nodes[a]) - along(road, nodes[b]));
    for (let i = 1; i < road.nodes.length; i++)
      edge(road.nodes[i - 1], road.nodes[i]);
  }

  const costs = new Float64Array(nodes.length).fill(Infinity);
  const parents = new Int32Array(nodes.length).fill(-1);
  const visited = new Uint8Array(nodes.length);
  costs[startIndex] = 0;
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited[i] && (current < 0 || costs[i] < costs[current]))
        current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    visited[current] = 1;
    for (const next of nodes[current].edges) {
      const cost = costs[current] + next.length;
      if (cost < costs[next.index]) {
        costs[next.index] = cost;
        parents[next.index] = current;
      }
    }
  }
  goals.sort(
    (a, b) =>
      costs[a.index] + a.proximity * 1.4 - (costs[b.index] + b.proximity * 1.4),
  );
  const end = goals.find((goal) => Number.isFinite(costs[goal.index]));
  if (!end) return [];
  const path = [];
  for (let index = end.index; index >= 0; index = parents[index])
    path.push({ x: nodes[index].x, z: nodes[index].z });
  path.reverse();
  // Remove only collinear intermediate points. Never shortcut a city block.
  for (let i = path.length - 2; i > 0; i--) {
    const a = path[i - 1],
      b = path[i],
      c = path[i + 1];
    if (
      Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-6 &&
      safeSegment(world, a, c)
    )
      path.splice(i, 1);
  }
  return path;
}

function makeCurve(world, path) {
  if (path.length < 2) return null;
  const points = path.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CurvePath();
  let previous = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const incoming = points[i - 1].clone().sub(point);
    const outgoing = points[i + 1].clone().sub(point);
    const radius = Math.min(
      5,
      incoming.length() * 0.3,
      outgoing.length() * 0.3,
    );
    const enter = point
      .clone()
      .add(incoming.normalize().multiplyScalar(radius));
    const exit = point.clone().add(outgoing.normalize().multiplyScalar(radius));
    const corner = new THREE.QuadraticBezierCurve3(enter, point, exit);
    let safe = safeSegment(world, previous, enter);
    let samplePrevious = enter;
    for (let t = 0.1; safe && t <= 1.001; t += 0.1) {
      const sample = corner.getPoint(Math.min(1, t));
      safe = safeSegment(world, samplePrevious, sample);
      samplePrevious = sample;
    }
    if (safe) {
      curve.add(new THREE.LineCurve3(previous, enter));
      curve.add(corner);
      previous = exit;
    } else {
      curve.add(new THREE.LineCurve3(previous, point));
      previous = point;
    }
  }
  curve.add(new THREE.LineCurve3(previous, points.at(-1)));
  curve.arcLengthDivisions = Math.max(150, points.length * 35);
  curve.updateArcLengths();
  const length = curve.getLength();
  return length > 0.1 ? { curve, length } : null;
}

function disposeActor(actor) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  actor.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  actor.group.removeFromParent();
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
}

/**
 * Company vehicles are a view of the saved logistics simulation. They never
 * spend money, finish a contract or manufacture a reward themselves.
 */
export function createFleet(scene, world, quality = "medium") {
  const vehicles = [];
  const colors = [0x416e52, 0xd0bf95, 0x587581];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const visibleDistance =
    quality === "high" ? 260 : quality === "low" ? 150 : 200;
  let disposed = false;

  function parking(index) {
    const listed = world.fleetSpawns?.[index];
    if (finitePoint(listed))
      return { x: listed.x, z: listed.z, yaw: listed.yaw ?? Math.PI };
    // The v0.3 forecourt before the expanded city's explicit fleetSpawns.
    for (const x of [18 + index * 10, -3 - index * 4, 3 + index * 4]) {
      for (const z of [106, 113, 119])
        if (safeSegment(world, { x, z }, { x, z }))
          return { x, z, yaw: Math.PI };
    }
    return null;
  }

  function startRoute(vehicle, record, initial = false) {
    const destination = world.businessLocations?.find(
      (p) => p.id === record.destination,
    );
    vehicle.tripId = record.tripId || record.contractId || null;
    vehicle.destination = record.destination;
    vehicle.record = { ...record };
    vehicle.snapshotAge = 0;
    vehicle.route = destination
      ? makeCurve(world, planFleetRoute(world, vehicle.parking, destination))
      : null;
    vehicle.routeUnavailable = !vehicle.route;
    vehicle.phase = 0;
    if (vehicle.route && initial) vehicle.phase = desiredDistance(vehicle);
    if (!vehicle.route) {
      vehicle.position.set(vehicle.parking.x, 0, vehicle.parking.z);
      vehicle.yaw = vehicle.parking.yaw;
    } else sample(vehicle);
  }

  function desiredDistance(vehicle) {
    if (!vehicle.route) return 0;
    const record = vehicle.record;
    if (record.status === "idle") return vehicle.route.length * 2;
    const duration = Math.max(1, Number(record.duration) || 60);
    const remaining = Math.max(
      0,
      (Number(record.remaining) || 0) - vehicle.snapshotAge,
    );
    const progress = clamp(1 - remaining / duration, 0, 1);
    return (
      vehicle.route.length *
      (record.status === "returning" ? 1 + progress : progress)
    );
  }

  function sample(vehicle) {
    if (!vehicle.route) return;
    const { route } = vehicle;
    const returning = vehicle.phase > route.length;
    const fraction = clamp(
      returning
        ? 2 - vehicle.phase / route.length
        : vehicle.phase / route.length,
      0,
      1,
    );
    route.curve.getPointAt(fraction, vehicle.position);
    route.curve.getTangentAt(fraction, tangent);
    if (returning) tangent.negate();
    // Keep the right-hand lane in both directions. Ease out of the depot and
    // into the customer's stopping point so changing legs cannot jump lanes.
    const distanceAlong = fraction * route.length;
    const lane =
      2.4 * Math.min(1, distanceAlong / 8, (route.length - distanceAlong) / 8);
    vehicle.position.x += tangent.z * lane;
    vehicle.position.z -= tangent.x * lane;
    vehicle.yaw = Math.atan2(tangent.x, tangent.z);
  }

  function updateLivery(vehicle, companyName) {
    if (vehicle.companyName === companyName || typeof document === "undefined")
      return;
    vehicle.companyName = companyName;
    const maps = new Set();
    vehicle.actor.group.traverse((object) => {
      for (const material of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []) {
        const map = material.map;
        if (
          map?.image?.width === 512 &&
          map.image.height === 256 &&
          material.side === THREE.DoubleSide &&
          Math.abs(material.roughness - 0.8) < 0.001
        )
          maps.add(map);
      }
    });
    for (const map of maps) {
      const context = map.image.getContext?.("2d");
      if (!context) continue;
      context.fillStyle = "#e9e1cc";
      context.fillRect(0, 0, 512, 256);
      context.fillStyle = "#365d43";
      context.fillRect(0, 0, 20, 256);
      context.fillStyle = "#ad5036";
      context.beginPath();
      context.ellipse(65, 107, 30, 27, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#4d6847";
      context.fillRect(61, 72, 7, 17);
      const name = String(companyName || "Raiz & Sol").toUpperCase();
      context.fillStyle = "#2e4836";
      context.font = `bold ${name.length > 20 ? 25 : name.length > 13 ? 34 : 43}px Arial`;
      context.fillText(name, 111, 109, 375);
      context.font = "25px Arial";
      context.fillText(vehicle.name || "DISTRIBUIÇÃO", 113, 150, 370);
      context.fillStyle = "#af7d4e";
      context.fillRect(112, 173, 360, 3);
      context.font = "18px Arial";
      context.fillText("COLHEITA LOCAL · ENTREGAS DA CASA", 113, 208);
      map.needsUpdate = true;
    }
  }

  function sync(company) {
    if (disposed) return;
    const records = Array.isArray(company?.operations?.fleet)
      ? company.operations.fleet.slice(0, 3)
      : [];
    for (let i = vehicles.length - 1; i >= 0; i--) {
      if (!records.some((record) => record.id === vehicles[i].id)) {
        disposeActor(vehicles[i].actor);
        vehicles.splice(i, 1);
      }
    }
    for (const [index, record] of records.entries()) {
      let vehicle = vehicles.find((value) => value.id === record.id);
      if (!vehicle) {
        const location = parking(index);
        if (!location) continue;
        const actor = createVehicle(colors[index % colors.length]);
        actor.group.name = `company-fleet-${record.id}`;
        actor.group.userData.companyFleet = true;
        scene.add(actor.group);
        vehicle = {
          id: record.id,
          name: record.name,
          actor,
          position: actor.group.position,
          yaw: location.yaw,
          speed: 0,
          blocked: false,
          visible: true,
          parking: location,
          route: null,
          phase: 0,
          record: { ...record },
          tripId: null,
          snapshotAge: 0,
          pending: null,
        };
        vehicle.position.set(location.x, 0, location.z);
        vehicles.push(vehicle);
        if (record.status !== "idle") startRoute(vehicle, record, true);
      }
      const tripId = record.tripId || record.contractId || null;
      if (record.status === "idle") vehicle.pending = null;
      if (record.status !== "idle" && tripId !== vehicle.tripId) {
        // Finish an interrupted visual return before beginning the next job;
        // never teleport a vehicle next to the player when new work is assigned.
        if (vehicle.route && vehicle.phase < vehicle.route.length * 2 - 0.05) {
          vehicle.pending = { ...record };
          vehicle.record = { ...vehicle.record, status: "idle" };
        } else startRoute(vehicle, record);
      } else {
        vehicle.record = { ...record };
        vehicle.snapshotAge = 0;
      }
      vehicle.name = record.name || vehicle.name;
      updateLivery(vehicle, company?.name);
      vehicle.blocked = !!vehicle.routeUnavailable && record.status !== "idle";
      if (!vehicle.route) {
        vehicle.position.set(vehicle.parking.x, 0, vehicle.parking.z);
        vehicle.yaw = vehicle.parking.yaw;
      }
      vehicle.actor.group.rotation.y = vehicle.yaw;
    }
  }

  function update(dt, playerPosition, obstacles = []) {
    if (disposed) return;
    const seconds = clamp(Number(dt) || 0, 0, 0.2);
    for (const vehicle of vehicles) {
      const previous = vehicle.position.clone();
      vehicle.blocked =
        !!vehicle.routeUnavailable && vehicle.record.status !== "idle";
      vehicle.snapshotAge = Math.min(1.2, vehicle.snapshotAge + seconds);
      if (vehicle.route && !vehicle.routeUnavailable) {
        const desired = desiredDistance(vehicle);
        const gap = Math.max(0, desired - vehicle.phase);
        const normalSpeed =
          vehicle.route.length /
          Math.max(1, Number(vehicle.record.duration) || 60);
        const step = Math.min(
          gap,
          seconds * Math.min(17, Math.max(2.5, normalSpeed * 1.3)),
        );
        const oldPhase = vehicle.phase;
        vehicle.phase = Math.min(vehicle.route.length * 2, oldPhase + step);
        sample(vehicle);
        // Yield gently to the player and other cars, without ever snapping the
        // visual forward when the underlying one-second simulation ticks.
        const closeToPlayer =
          finitePoint(playerPosition) &&
          distance(vehicle.position, playerPosition) < 3.6 &&
          distance(vehicle.position, playerPosition) <
            distance(previous, playerPosition);
        const blockers = [
          ...obstacles,
          ...vehicles.filter(
            (other) =>
              other !== vehicle && String(other.id) < String(vehicle.id),
          ),
        ];
        const blocked =
          closeToPlayer ||
          blockers.some(
            (other) =>
              other &&
              other !== vehicle &&
              other.position &&
              other.actor?.group?.visible !== false &&
              distance(vehicle.position, other.position) < 4.65 &&
              distance(vehicle.position, other.position) <
                distance(previous, other.position),
          );
        if (blocked || !safeSegment(world, previous, vehicle.position)) {
          vehicle.blocked = true;
          vehicle.phase = oldPhase;
          vehicle.position.copy(previous);
        }
        if (vehicle.phase >= vehicle.route.length * 2 - 0.001) {
          vehicle.position.set(vehicle.parking.x, 0, vehicle.parking.z);
          vehicle.yaw = vehicle.parking.yaw;
          if (vehicle.pending) {
            const pending = vehicle.pending;
            vehicle.pending = null;
            startRoute(vehicle, pending);
          }
        }
      }
      vehicle.speed =
        seconds > 0 ? vehicle.position.distanceTo(previous) / seconds : 0;
      vehicle.visible =
        !finitePoint(playerPosition) ||
        distance(vehicle.position, playerPosition) < visibleDistance;
      vehicle.actor.group.visible = vehicle.visible;
      vehicle.actor.group.rotation.y = vehicle.yaw;
      if (vehicle.visible) vehicle.actor.animate(seconds, vehicle.speed, 0);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const vehicle of vehicles) disposeActor(vehicle.actor);
    vehicles.length = 0;
  }

  return { sync, update, vehicles, dispose };
}

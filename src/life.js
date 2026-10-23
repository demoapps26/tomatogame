import * as THREE from "three";
import * as Actors from "./actors.js";
import { createPassengerVehicle } from "./passenger-vehicles.js";

const TAU = Math.PI * 2;
const palette = [
  0x738b8d, 0xddd4bc, 0x7a3f35, 0x3c545d, 0xc5ae79, 0x70816a, 0xadaaa1,
];
const modulo = (number, divisor) => ((number % divisor) + divisor) % divisor;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

// Explicit rounded corners keep vehicles inside a junction. An unconstrained
// spline through a large city block can otherwise swing through its buildings.
function makeRoute(input, cornerRadius, closed = true) {
  if (!Array.isArray(input)) return null;
  const points = input
    .filter(finitePoint)
    .map((p) => new THREE.Vector3(p.x, 0, p.z));
  if (points.length > 2 && points[0].distanceToSquared(points.at(-1)) < 0.001)
    points.pop();
  for (let i = points.length - 1; i > 0; i--) {
    if (points[i].distanceToSquared(points[i - 1]) < 0.001) points.splice(i, 1);
  }
  if (points.length < 2) return null;
  if (points.length === 2 || !closed) {
    const curve = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++)
      curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
    return { curve, length: curve.getLength(), closed: false };
  }
  const corners = points.map((point, index) => {
    const previous = points[modulo(index - 1, points.length)];
    const next = points[(index + 1) % points.length];
    const incoming = previous.clone().sub(point);
    const outgoing = next.clone().sub(point);
    const radius = Math.min(
      cornerRadius,
      incoming.length() * 0.23,
      outgoing.length() * 0.23,
    );
    return {
      point,
      enter: point.clone().add(incoming.normalize().multiplyScalar(radius)),
      exit: point.clone().add(outgoing.normalize().multiplyScalar(radius)),
    };
  });
  const curve = new THREE.CurvePath();
  for (let i = 0; i < corners.length; i++) {
    const previous = corners[modulo(i - 1, corners.length)];
    const corner = corners[i];
    if (previous.exit.distanceToSquared(corner.enter) > 0.0001)
      curve.add(new THREE.LineCurve3(previous.exit, corner.enter));
    curve.add(
      new THREE.QuadraticBezierCurve3(corner.enter, corner.point, corner.exit),
    );
  }
  curve.arcLengthDivisions = Math.max(120, points.length * 30);
  curve.updateArcLengths();
  return { curve, length: curve.getLength(), closed: true };
}

function sampleRoute(route, distance, direction, position, tangent) {
  let fraction;
  let orientation = direction;
  if (route.closed) fraction = modulo(distance / route.length, 1);
  else {
    const phase = modulo(distance / route.length, 2);
    fraction = phase <= 1 ? phase : 2 - phase;
    orientation *= phase <= 1 ? 1 : -1;
  }
  route.curve.getPointAt(fraction, position);
  route.curve.getTangentAt(fraction, tangent).multiplyScalar(orientation);
}

function disposeActor(actor) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
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
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function roadFallback(world) {
  const vertical = [
    ...new Set(
      (world.roads || [])
        .filter((road) => road.depth > road.width * 2)
        .map((road) => road.x),
    ),
  ].sort((a, b) => a - b);
  const horizontal = [
    ...new Set(
      (world.roads || [])
        .filter((road) => road.width > road.depth * 2)
        .map((road) => road.z),
    ),
  ].sort((a, b) => a - b);
  if (vertical.length < 2 || horizontal.length < 2) return [];
  const midX = Math.floor((vertical.length - 1) / 2),
    midZ = Math.floor((horizontal.length - 1) / 2);
  const x1 = vertical[midX],
    x2 = vertical[Math.min(vertical.length - 1, midX + 1)];
  const z1 = horizontal[midZ],
    z2 = horizontal[Math.min(horizontal.length - 1, midZ + 1)];
  return [
    [
      { x: x1, z: z1 },
      { x: x2, z: z1 },
      { x: x2, z: z2 },
      { x: x1, z: z2 },
    ],
  ];
}

/** Ambient life owns its actors only; the caller owns lights, world and player. */
export function createCityLife(scene, world, quality = "medium") {
  const counts =
    quality === "high" ? [10, 20] : quality === "low" ? [3, 5] : [6, 10];
  const sourceRoads =
    Array.isArray(world.trafficRoutes) && world.trafficRoutes.length
      ? world.trafficRoutes
      : roadFallback(world);
  const roadRoutes = sourceRoads
    .map((route) => makeRoute(route, 9, true))
    .filter((route) => route && route.length > 25);
  const walkRoutes = (world.pedestrianRoutes || [])
    .map((route) => makeRoute(route, 0.8, route.length > 2))
    .filter((route) => route && route.length > 3);
  const vehicles = [];
  const pedestrians = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const spawn = world.spawn || { x: 0, z: 0 };
  let elapsed = 0;
  let populationCheck = 2;
  let disposed = false;

  function pedestrianGroundAt(x, z) {
    const height = world.groundHeightAt?.(x, z);
    return Number.isFinite(height) ? height : 0;
  }

  function collides(x, z, radius = 1.15) {
    const bounds = world.bounds;
    if (
      bounds &&
      (x - radius < bounds.minX ||
        x + radius > bounds.maxX ||
        z - radius < bounds.minZ ||
        z + radius > bounds.maxZ)
    )
      return true;
    return (world.colliders || []).some(
      (box) =>
        x + radius > box.minX &&
        x - radius < box.maxX &&
        z + radius > box.minZ &&
        z - radius < box.maxZ,
    );
  }

  function locateVehicle(vehicle) {
    sampleRoute(
      vehicle.route,
      vehicle.distance,
      vehicle.direction,
      point,
      tangent,
    );
    // The opposing direction uses the opposing lane of the same road loop.
    point.x += tangent.z * vehicle.lane;
    point.z -= tangent.x * vehicle.lane;
    return { point, tangent };
  }

  function placeNear(
    entity,
    routes,
    reference,
    desiredDistance,
    pedestrian = false,
    minimum = 0,
    maximum = Infinity,
  ) {
    const candidates = [];
    for (const route of routes) {
      const samples = Math.max(
        18,
        Math.min(260, Math.ceil(route.length / (pedestrian ? 3 : 7))),
      );
      for (let index = 0; index < samples; index++) {
        const distance = (route.length * (index + 0.31)) / samples;
        sampleRoute(route, distance, entity.direction, point, tangent);
        if (!pedestrian) {
          point.x += tangent.z * entity.lane;
          point.z -= tangent.x * entity.lane;
        }
        const proximity = Math.hypot(
          point.x - reference.x,
          point.z - reference.z,
        );
        if (proximity < minimum || proximity > maximum) continue;
        candidates.push({
          route,
          distance,
          x: point.x,
          z: point.z,
          yaw: Math.atan2(tangent.x, tangent.z),
          score:
            Math.abs(proximity - desiredDistance) +
            (reference === spawn && point.z > spawn.z - 8 ? 14 : 0),
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      if (collides(candidate.x, candidate.z, pedestrian ? 0.3 : 1.15)) continue;
      const others = pedestrian ? pedestrians : vehicles;
      if (
        others.some(
          (other) =>
            other !== entity &&
            Math.hypot(
              other.position.x - candidate.x,
              other.position.z - candidate.z,
            ) < (pedestrian ? 3.5 : 12),
        )
      )
        continue;
      if (
        !pedestrian &&
        (world.vehicleSpawns || []).some(
          (car) => Math.hypot(car.x - candidate.x, car.z - candidate.z) < 6,
        )
      )
        continue;
      entity.route = candidate.route;
      entity.distance = candidate.distance;
      entity.yaw = candidate.yaw;
      entity.speed = 0;
      entity.position.set(
        candidate.x,
        pedestrian ? pedestrianGroundAt(candidate.x, candidate.z) : 0,
        candidate.z,
      );
      entity.actor.group.rotation.y = entity.yaw;
      return true;
    }
    return false;
  }

  function placeAlongCurrent(entity, pedestrian = false) {
    for (let attempt = 0; attempt < 29; attempt++) {
      if (pedestrian)
        sampleRoute(
          entity.route,
          entity.distance,
          entity.direction,
          point,
          tangent,
        );
      else locateVehicle(entity);
      const radius = pedestrian ? 0.3 : 1.15,
        others = pedestrian ? pedestrians : vehicles;
      const clearPeople = !others.some(
        (other) =>
          other !== entity &&
          other.position.distanceTo(point) < (pedestrian ? 3.5 : 12),
      );
      const clearParked =
        pedestrian ||
        !(world.vehicleSpawns || []).some(
          (car) => Math.hypot(point.x - car.x, point.z - car.z) < 6,
        );
      if (
        Math.hypot(point.x - spawn.x, point.z - spawn.z) >
          (pedestrian ? 6 : 14) &&
        clearPeople &&
        clearParked &&
        !collides(point.x, point.z, radius)
      ) {
        entity.position.copy(point);
        if (pedestrian)
          entity.position.y = pedestrianGroundAt(point.x, point.z);
        entity.yaw = Math.atan2(tangent.x, tangent.z);
        entity.actor.group.rotation.y = entity.yaw;
        return true;
      }
      entity.distance += entity.route.length / 29;
    }
    return false;
  }

  for (let index = 0; index < counts[0] && roadRoutes.length; index++) {
    const route = roadRoutes[index % roadRoutes.length];
    const modelId = ["compact", "pickup", "suv", "compact", "van", "compact"][
      index % 6
    ];
    const actor = createPassengerVehicle(
      modelId,
      palette[index % palette.length],
    );
    const vehicle = {
      actor,
      position: actor.group.position,
      yaw: 0,
      speed: 0,
      cruiseSpeed: 5.2 + ((index * 7) % 5) * 0.6,
      direction: index % 3 === 2 ? -1 : 1,
      distance: route.length * modulo(0.173 + index * 0.217, 1),
      lane: 1.85,
      route,
      ambient: true,
      modelId,
      bounds: actor.bounds,
      radius: (actor.bounds?.width || 2.3) / 2 + 0.03,
      length: actor.bounds?.length || 4.6,
      blockedTime: 0,
      visible: true,
    };
    const nearby =
      (index === 0
        ? placeNear(vehicle, roadRoutes, spawn, 48, false, 14, 120)
        : placeAlongCurrent(vehicle)) ||
      placeNear(vehicle, roadRoutes, spawn, 130 + index * 20, false, 14);
    if (!nearby) {
      disposeActor(actor);
      continue;
    }
    actor.group.name = `ambient-traffic-${index}`;
    scene.add(actor.group);
    vehicles.push(vehicle);
  }

  for (let index = 0; index < counts[1] && walkRoutes.length; index++) {
    const route = walkRoutes[index % walkRoutes.length];
    const actor =
      typeof Actors.createPedestrian === "function"
        ? Actors.createPedestrian(index)
        : Actors.createCharacter({ enemy: false });
    const pedestrian = {
      actor,
      position: actor.group.position,
      yaw: 0,
      speed: 0,
      cruiseSpeed: 0.85 + (index % 4) * 0.15,
      direction: index % 2 ? -1 : 1,
      distance: route.length * modulo(0.09 + index * 0.193, 1),
      route,
      pause: index % 4 === 0 ? 1.2 : 0,
      nextPause: 8 + index * 1.7,
      visible: true,
    };
    const nearby =
      (index < 2
        ? placeNear(pedestrian, walkRoutes, spawn, 22 + index * 16, true, 6, 90)
        : placeAlongCurrent(pedestrian, true)) ||
      placeNear(pedestrian, walkRoutes, spawn, 90 + index * 10, true, 6);
    if (!nearby) {
      disposeActor(actor);
      continue;
    }
    actor.group.name = `ambient-pedestrian-${index}`;
    scene.add(actor.group);
    pedestrians.push(pedestrian);
  }

  function update(dt, playerPosition) {
    if (disposed || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.15);
    elapsed += dt;
    const player = playerPosition || spawn;
    populationCheck -= dt;
    if (populationCheck <= 0) {
      populationCheck = 2;
      // Reuse an already culled actor when the player reaches a new district;
      // the population budget stays fixed and nobody teleports nearby.
      const nearbyCars = vehicles.filter(
        (car) =>
          Math.hypot(car.position.x - player.x, car.position.z - player.z) <
          120,
      ).length;
      if (!nearbyCars) {
        const distant = vehicles.find(
          (car) =>
            Math.hypot(car.position.x - player.x, car.position.z - player.z) >
            185,
        );
        if (distant) placeNear(distant, roadRoutes, player, 90, false, 65, 130);
      }
      const nearbyPeople = pedestrians.filter(
        (person) =>
          Math.hypot(
            person.position.x - player.x,
            person.position.z - player.z,
          ) < 100,
      ).length;
      if (nearbyPeople < 2) {
        const distant = pedestrians.find(
          (person) =>
            Math.hypot(
              person.position.x - player.x,
              person.position.z - player.z,
            ) > 150,
        );
        if (distant) placeNear(distant, walkRoutes, player, 65, true, 42, 115);
      }
    }
    for (const vehicle of vehicles) {
      let desiredSpeed = vehicle.cruiseSpeed;
      forward.set(Math.sin(vehicle.yaw), 0, Math.cos(vehicle.yaw));
      const dx = player.x - vehicle.position.x,
        dz = player.z - vehicle.position.z;
      const along = dx * forward.x + dz * forward.z;
      const lateral = Math.abs(dx * forward.z - dz * forward.x);
      if (along > -1 && along < 14 && lateral < 3.2)
        desiredSpeed = Math.min(desiredSpeed, Math.max(0, (along - 4.5) * 1.3));
      for (const other of vehicles) {
        if (other === vehicle) continue;
        const ox = other.position.x - vehicle.position.x,
          oz = other.position.z - vehicle.position.z;
        const ahead = ox * forward.x + oz * forward.z;
        if (
          ahead > 0 &&
          ahead < 13 &&
          Math.abs(ox * forward.z - oz * forward.x) < 2.7
        )
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - 7) * 1.1));
      }
      vehicle.speed = THREE.MathUtils.damp(
        vehicle.speed,
        desiredSpeed,
        desiredSpeed < vehicle.speed ? 5 : 1.2,
        dt,
      );
      const oldDistance = vehicle.distance;
      vehicle.distance += vehicle.speed * vehicle.direction * dt;
      locateVehicle(vehicle);
      if (collides(point.x, point.z, 1.1)) {
        vehicle.distance = oldDistance;
        vehicle.speed = 0;
        vehicle.blockedTime += dt;
        // Do not teleport a visible car through a building. It remains stopped
        // until its clear route can be followed; map authors can inspect it.
      } else {
        vehicle.position.copy(point);
        vehicle.blockedTime = 0;
      }
      const targetYaw = Math.atan2(tangent.x, tangent.z);
      const difference = Math.atan2(
        Math.sin(targetYaw - vehicle.yaw),
        Math.cos(targetYaw - vehicle.yaw),
      );
      const turn = difference * (1 - Math.exp(-dt * 7));
      vehicle.yaw += turn;
      vehicle.actor.group.rotation.y = vehicle.yaw;
      const distanceSquared =
        (vehicle.position.x - player.x) ** 2 +
        (vehicle.position.z - player.z) ** 2;
      vehicle.visible = distanceSquared < 180 ** 2;
      vehicle.actor.group.visible = vehicle.visible;
      if (vehicle.visible)
        vehicle.actor.animate(
          dt,
          vehicle.speed,
          THREE.MathUtils.clamp(difference * 0.7, -0.55, 0.55),
        );
    }
    for (const pedestrian of pedestrians) {
      const dx = player.x - pedestrian.position.x,
        dz = player.z - pedestrian.position.z;
      const distanceSquared = dx * dx + dz * dz;
      pedestrian.nextPause -= dt;
      if (pedestrian.nextPause <= 0 && pedestrian.pause <= 0) {
        pedestrian.pause = 1.1 + (pedestrians.indexOf(pedestrian) % 3) * 0.7;
        pedestrian.nextPause = 12 + (pedestrians.indexOf(pedestrian) % 5) * 2;
      }
      pedestrian.pause = Math.max(0, pedestrian.pause - dt);
      const desiredSpeed =
        pedestrian.pause > 0 || distanceSquared < 1.6 ** 2
          ? 0
          : pedestrian.cruiseSpeed;
      pedestrian.speed = THREE.MathUtils.damp(
        pedestrian.speed,
        desiredSpeed,
        6,
        dt,
      );
      const oldDistance = pedestrian.distance;
      pedestrian.distance += pedestrian.speed * pedestrian.direction * dt;
      sampleRoute(
        pedestrian.route,
        pedestrian.distance,
        pedestrian.direction,
        point,
        tangent,
      );
      if (!collides(point.x, point.z, 0.3)) pedestrian.position.copy(point);
      else {
        pedestrian.distance = oldDistance;
        pedestrian.speed = 0;
      }
      pedestrian.position.y = pedestrianGroundAt(
        pedestrian.position.x,
        pedestrian.position.z,
      );
      const targetYaw = Math.atan2(tangent.x, tangent.z);
      const delta = Math.atan2(
        Math.sin(targetYaw - pedestrian.yaw),
        Math.cos(targetYaw - pedestrian.yaw),
      );
      pedestrian.yaw += delta * (1 - Math.exp(-dt * 9));
      pedestrian.actor.group.rotation.y = pedestrian.yaw;
      pedestrian.visible = distanceSquared < 145 ** 2;
      pedestrian.actor.group.visible = pedestrian.visible;
      if (pedestrian.visible)
        pedestrian.actor.animate(
          dt,
          pedestrian.speed,
          elapsed + pedestrians.indexOf(pedestrian) * 0.73,
          false,
        );
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const vehicle of vehicles) disposeActor(vehicle.actor);
    for (const pedestrian of pedestrians) disposeActor(pedestrian.actor);
    vehicles.length = 0;
    pedestrians.length = 0;
  }

  return { update, vehicles, pedestrians, dispose };
}

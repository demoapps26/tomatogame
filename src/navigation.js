// Navigation for ground actors. Obstacles are expanded by the actor radius so
// both grid movement and the final smoothed waypoints preserve body clearance.
export function createNavigation(colliders, bounds, cellSize = 3) {
  const radius = 0.4;
  const spacing = Math.max(0.5, Number(cellSize) || 3);
  const minX = bounds.minX + radius;
  const maxX = bounds.maxX - radius;
  const minZ = bounds.minZ + radius;
  const maxZ = bounds.maxZ - radius;
  const obstacles = colliders.map((box) => ({
    minX: box.minX - radius,
    maxX: box.maxX + radius,
    minZ: box.minZ - radius,
    maxZ: box.maxZ + radius,
  }));
  const width = Math.max(1, Math.floor((maxX - minX) / spacing) + 1);
  const height = Math.max(1, Math.floor((maxZ - minZ) / spacing) + 1);
  const count = width * height;
  const available = new Uint8Array(count);
  const pointAt = (index) => ({
    x: minX + (index % width) * spacing,
    z: minZ + Math.floor(index / width) * spacing,
  });

  function safe(point) {
    return (
      Number.isFinite(point?.x) &&
      Number.isFinite(point?.z) &&
      point.x >= minX &&
      point.x <= maxX &&
      point.z >= minZ &&
      point.z <= maxZ &&
      !obstacles.some(
        (box) =>
          point.x >= box.minX &&
          point.x <= box.maxX &&
          point.z >= box.minZ &&
          point.z <= box.maxZ,
      )
    );
  }

  // Exact slab intersection avoids missing thin obstacles between samples.
  function lineClear(start, target) {
    if (!safe(start) || !safe(target)) return false;
    const dx = target.x - start.x,
      dz = target.z - start.z;
    for (const box of obstacles) {
      let near = 0,
        far = 1;
      let intersects = true;
      for (const [origin, delta, low, high] of [
        [start.x, dx, box.minX, box.maxX],
        [start.z, dz, box.minZ, box.maxZ],
      ]) {
        if (Math.abs(delta) < 1e-10) {
          if (origin < low || origin > high) {
            intersects = false;
            break;
          }
        } else {
          const a = (low - origin) / delta,
            b = (high - origin) / delta;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
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

  for (let index = 0; index < count; index++)
    available[index] = safe(pointAt(index)) ? 1 : 0;

  function nearby(point) {
    const reach = Math.max(5, spacing * 2);
    const left = Math.max(0, Math.ceil((point.x - reach - minX) / spacing));
    const right = Math.min(
      width - 1,
      Math.floor((point.x + reach - minX) / spacing),
    );
    const top = Math.max(0, Math.ceil((point.z - reach - minZ) / spacing));
    const bottom = Math.min(
      height - 1,
      Math.floor((point.z + reach - minZ) / spacing),
    );
    const result = [];
    for (let z = top; z <= bottom; z++)
      for (let x = left; x <= right; x++) {
        const index = z * width + x;
        if (!available[index]) continue;
        const gridPoint = pointAt(index);
        const distance = Math.hypot(
          point.x - gridPoint.x,
          point.z - gridPoint.z,
        );
        if (distance <= reach && lineClear(point, gridPoint))
          result.push({ index, distance });
      }
    return result;
  }

  function findPath(start, target) {
    if (!safe(start) || !safe(target)) return [];
    if (lineClear(start, target)) return [{ x: target.x, z: target.z }];
    const starts = nearby(start),
      goals = nearby(target);
    if (!starts.length || !goals.length) return [];
    const goalCosts = new Map(goals.map((goal) => [goal.index, goal.distance]));
    const scores = new Float64Array(count);
    scores.fill(Infinity);
    const parents = new Int32Array(count);
    parents.fill(-1);
    const closed = new Uint8Array(count);
    const heap = [];
    function push(entry) {
      let index = heap.length;
      heap.push(entry);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent].f <= entry.f) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = entry;
    }
    function pop() {
      const first = heap[0],
        last = heap.pop();
      if (heap.length) {
        let index = 0;
        while (true) {
          let child = index * 2 + 1;
          if (child >= heap.length) break;
          if (child + 1 < heap.length && heap[child + 1].f < heap[child].f)
            child++;
          if (heap[child].f >= last.f) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return first;
    }
    const heuristic = (index) => {
      const point = pointAt(index);
      return Math.hypot(point.x - target.x, point.z - target.z);
    };
    for (const seed of starts) {
      scores[seed.index] = seed.distance;
      push({
        index: seed.index,
        g: seed.distance,
        f: seed.distance + heuristic(seed.index),
      });
    }
    let end = -1;
    while (heap.length) {
      const current = pop(),
        index = current.index;
      if (closed[index] || current.g > scores[index]) continue;
      if (goalCosts.has(index)) {
        end = index;
        break;
      }
      closed[index] = 1;
      const x = index % width,
        z = Math.floor(index / width),
        origin = pointAt(index);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx,
            nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
          const next = nz * width + nx;
          if (!available[next] || closed[next]) continue;
          if (
            dx &&
            dz &&
            (!available[z * width + nx] || !available[nz * width + x])
          )
            continue;
          if (!lineClear(origin, pointAt(next))) continue;
          const score = scores[index] + spacing * (dx && dz ? Math.SQRT2 : 1);
          if (score >= scores[next]) continue;
          scores[next] = score;
          parents[next] = index;
          push({ index: next, g: score, f: score + heuristic(next) });
        }
    }
    if (end < 0) return [];
    const raw = [{ x: target.x, z: target.z }];
    for (let index = end; index >= 0; index = parents[index])
      raw.push(pointAt(index));
    raw.reverse();
    const waypoints = [];
    let anchor = start,
      cursor = 0;
    while (cursor < raw.length) {
      let next = raw.length - 1;
      while (next > cursor && !lineClear(anchor, raw[next])) next--;
      // Every raw edge was checked above, including the start/goal links.
      if (!lineClear(anchor, raw[next])) return [];
      waypoints.push(raw[next]);
      anchor = raw[next];
      cursor = next + 1;
    }
    return waypoints;
  }

  return { findPath, lineClear };
}

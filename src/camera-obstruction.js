/** Keep the whole camera boom on the player's side of solid world geometry. */
export function cameraBoomPosition(target, desired, colliders, radius = 0.2) {
  const delta = {
    x: desired.x - target.x,
    y: desired.y - target.y,
    z: desired.z - target.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < 1e-8) return { ...desired };
  let nearest = 1;
  for (const box of colliders || []) {
    const low = {
      x: box.minX - radius,
      y: (box.minY ?? 0) - radius,
      z: box.minZ - radius,
    };
    const high = {
      x: box.maxX + radius,
      y: (box.maxY ?? Infinity) + radius,
      z: box.maxZ + radius,
    };
    // A target already inside the padded edge needs an escape path. This also
    // avoids camera collapse when a seated driver is restored beside a wall.
    if (
      ["x", "y", "z"].every(
        (axis) => target[axis] > low[axis] && target[axis] < high[axis],
      )
    )
      continue;
    let enter = 0,
      exit = nearest;
    for (const axis of ["x", "y", "z"]) {
      if (Math.abs(delta[axis]) < 1e-10) {
        if (target[axis] < low[axis] || target[axis] > high[axis]) {
          exit = -1;
          break;
        }
      } else {
        const a = (low[axis] - target[axis]) / delta[axis];
        const b = (high[axis] - target[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) break;
      }
    }
    if (enter <= exit && exit > 1e-8 && enter >= 0 && enter < nearest)
      nearest = enter;
  }
  // Leave a small air gap, independent of boom length, without forcing the
  // camera through a close wall to maintain an arbitrary minimum distance.
  const fraction = nearest < 1 ? Math.max(0, nearest - 0.06 / length) : 1;
  return {
    x: target.x + delta.x * fraction,
    y: target.y + delta.y * fraction,
    z: target.z + delta.z * fraction,
  };
}

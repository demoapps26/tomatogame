import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_JOBS,
  FIELD_JOBS_BOARD,
  FIELD_JOB_INTERACTION_RADIUS,
  createFieldJobs,
  normalizeFieldJobs,
  getFieldJobsView,
  startFieldJob,
  interactFieldJob,
  advanceFieldJobs,
  cancelFieldJob,
  canInteractFieldJob,
} from "../src/field-jobs.js";

const startContext = {
  mapId: "cidade",
  founded: true,
  position: { x: 11, z: 83 },
  driving: false,
};
const contextFor = (state) => {
  const active = getFieldJobsView(state).active;
  return {
    mapId: "cidade",
    position: { ...active.point },
    driving: active.requiresVehicle,
    health: 100,
    dt: 1,
  };
};
const done = (command) => {
  assert.equal(command.ok, true, command.message);
  return command.state;
};
const begin = (id = FIELD_JOBS[0].id, state = createFieldJobs()) =>
  done(startFieldJob(state, id, startContext));

function complete(state) {
  let reward = 0,
    events = [],
    interactions = 0;
  while (state.active) {
    state = done(advanceFieldJobs(state, contextFor(state)));
    const command = interactFieldJob(state, contextFor(state));
    state = done(command);
    assert.equal(command.handled, true);
    reward += command.reward;
    events.push(...command.events);
    interactions++;
  }
  return { state, reward, events, interactions };
}

test("three original jobs expose finite fixed locations, unique rewards and isolated views", () => {
  const fresh = createFieldJobs(),
    view = getFieldJobsView(fresh);
  assert.equal(view.jobs.length, 3);
  assert.deepEqual(
    view.jobs.map((job) => job.reward),
    [300, 500, 750],
  );
  assert.deepEqual(
    view.jobs.map((job) => job.timeLimit),
    [240, 240, 360],
  );
  assert.deepEqual(
    view.jobs.map((job) => job.stepCount),
    [4, 3, 4],
  );
  assert.equal(new Set(view.jobs.map((job) => job.id)).size, 3);
  assert.ok(
    view.jobs.every((job) =>
      job.steps.every(
        (step) =>
          Number.isFinite(step.point.x) &&
          Number.isFinite(step.point.z) &&
          step.point.label,
      ),
    ),
  );
  assert.equal(FIELD_JOB_INTERACTION_RADIUS, 3);
  assert.deepEqual([FIELD_JOBS_BOARD.x, FIELD_JOBS_BOARD.z], [11, 83]);
  view.jobs[0].steps[0].point.x = 999;
  view.board.x = 999;
  assert.equal(getFieldJobsView(fresh).jobs[0].steps[0].point.x, 11);
  assert.equal(FIELD_JOBS_BOARD.x, 11);
  assert.deepEqual(
    normalizeFieldJobs(JSON.parse(JSON.stringify(fresh))),
    fresh,
  );
  fresh.records[FIELD_JOBS[0].id].completed = true;
  assert.equal(createFieldJobs().records[FIELD_JOBS[0].id].completed, false);
});

test("acceptance requires a founded company, city, on foot and the physical board", () => {
  const original = createFieldJobs(),
    snapshot = JSON.stringify(original);
  const failures = [
    {},
    { ...startContext, founded: false },
    { ...startContext, founded: 1 },
    { ...startContext, mapId: "porto" },
    { ...startContext, driving: true },
    { ...startContext, driving: undefined },
    { ...startContext, position: { x: 15.01, z: 83 } },
    { ...startContext, position: { x: NaN, z: 83 } },
  ];
  for (const context of failures) {
    const command = startFieldJob(original, FIELD_JOBS[0].id, context);
    assert.equal(command.ok, false);
    assert.equal(command.state.active, null);
    assert.equal(command.reward, 0);
  }
  assert.equal(startFieldJob(original, "unknown", startContext).ok, false);
  const accepted = done(
    startFieldJob(original, FIELD_JOBS[0].id, {
      ...startContext,
      position: { x: 15, z: 83 },
    }),
  );
  assert.equal(
    accepted.active.stepIndex,
    0,
    "accepting does not collect the first item",
  );
  assert.equal(accepted.records[FIELD_JOBS[0].id].attempts, 1);
  assert.equal(
    startFieldJob(accepted, FIELD_JOBS[1].id, startContext).ok,
    false,
  );
  assert.equal(JSON.stringify(original), snapshot);
});

test("arrival only changes the clock; each stage needs a correctly placed E interaction", () => {
  let state = begin();
  const current = contextFor(state);
  state = done(advanceFieldJobs(state, { ...current, dt: 10 }));
  assert.equal(state.active.stepIndex, 0);
  assert.equal(state.active.elapsed, 10);
  const future = getFieldJobsView(state).jobs[0].steps[1].point;
  state = done(
    advanceFieldJobs(state, { ...current, position: future, dt: 1 }),
  );
  assert.equal(state.active.stepIndex, 0);
  const wrong = interactFieldJob(state, { ...current, position: future });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.handled, false);
  assert.equal(wrong.state.active.stepIndex, 0);
  const collected = interactFieldJob(state, current);
  state = done(collected);
  assert.equal(state.active.stepIndex, 1);
  assert.equal(collected.reward, 0);
  assert.equal(collected.events[0].type, "objective");
});

test("E radius is exactly three metres; wrong vehicle mode falls through for normal enter/exit", () => {
  const state = begin(),
    context = contextFor(state);
  const outside = {
    ...context,
    position: { x: context.position.x + 3.001, z: context.position.z },
  };
  assert.equal(canInteractFieldJob(state, outside), false);
  assert.equal(interactFieldJob(state, outside).handled, false);
  const edge = {
    ...context,
    position: { x: context.position.x + 3, z: context.position.z },
  };
  assert.equal(canInteractFieldJob(state, edge), true);
  assert.equal(interactFieldJob(state, edge).handled, true);
  const car = { ...context, driving: true };
  assert.equal(canInteractFieldJob(state, car), false);
  const rejected = interactFieldJob(state, car);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.handled, false);
  assert.equal(rejected.state.active.stepIndex, 0);
});

test("all jobs pay once, archive progress, and completed jobs cannot be accepted again", () => {
  let state = createFieldJobs(),
    total = 0;
  for (const job of FIELD_JOBS) {
    const finished = complete(begin(job.id, state));
    state = finished.state;
    total += finished.reward;
    assert.equal(finished.reward, job.reward);
    assert.equal(finished.interactions, job.steps.length);
    assert.equal(
      finished.events.filter((event) => event.type === "completed").length,
      1,
    );
    assert.equal(state.records[job.id].rewarded, true);
    assert.equal(state.records[job.id].completed, true);
    assert.equal(state.records[job.id].bestTime, job.steps.length);
    assert.equal(state.lastResult.status, "finished");
    assert.equal(startFieldJob(state, job.id, startContext).ok, false);
    assert.equal(interactFieldJob(state, startContext).reward, 0);
    assert.equal(
      advanceFieldJobs(state, { ...startContext, dt: 1, health: 100 }).reward,
      0,
    );
    state = normalizeFieldJobs(JSON.parse(JSON.stringify(state)));
  }
  assert.equal(total, 1550);
  assert.equal(
    getFieldJobsView(state).jobs.filter((job) => job.completed).length,
    3,
  );
});

test("lost-lot ambush occurs on physical pickup once and remains consumed after saving", () => {
  let state = begin("lote-perdido");
  const accepted = getFieldJobsView(state).active;
  assert.equal(accepted.requiresOnFoot, true);
  state = done(interactFieldJob(state, contextFor(state)));
  assert.equal(state.active.stepIndex, 1);
  const beforePickup = JSON.parse(JSON.stringify(state));
  state = done(advanceFieldJobs(state, contextFor(state)));
  assert.equal(state.active.ambushTriggered, false);
  const pickup = interactFieldJob(state, contextFor(state));
  state = done(pickup);
  assert.equal(
    pickup.events.filter((event) => event.type === "ambush").length,
    1,
  );
  assert.deepEqual(
    pickup.events.find((event) => event.type === "ambush").point,
    getFieldJobsView(beforePickup).active.point,
  );
  assert.equal(state.active.ambushTriggered, true);
  state = normalizeFieldJobs(JSON.parse(JSON.stringify(state)));
  const active = getFieldJobsView(state).active;
  assert.equal(active.requiresVehicle, true);
  assert.equal(active.requiresOnFoot, false);
  const foot = interactFieldJob(state, {
    ...contextFor(state),
    driving: false,
  });
  assert.equal(foot.handled, false);
  assert.equal(foot.events.length, 0);
  const delivered = interactFieldJob(state, contextFor(state));
  assert.equal(delivered.reward, 500);
  assert.equal(
    delivered.events.some((event) => event.type === "ambush"),
    false,
  );
});

test("export explicitly needs a vehicle at the port and then an on-foot final handover", () => {
  let state = begin("selo-de-origem");
  state = done(interactFieldJob(state, contextFor(state)));
  state = done(interactFieldJob(state, contextFor(state)));
  let view = getFieldJobsView(state).active;
  assert.equal(view.point.id, "field-export");
  assert.equal(view.requirement, "vehicle");
  assert.equal(
    canInteractFieldJob(state, { ...contextFor(state), driving: false }),
    false,
  );
  state = done(interactFieldJob(state, contextFor(state)));
  view = getFieldJobsView(state).active;
  assert.equal(view.requirement, "on-foot");
  assert.equal(
    interactFieldJob(state, { ...contextFor(state), driving: true }).handled,
    false,
  );
  assert.equal(interactFieldJob(state, contextFor(state)).reward, 750);
});

test("timeout, defeat and leaving the city fail safely and permit an unpaid retry", () => {
  for (const [override, status] of [
    [{ dt: 240 }, "timeout"],
    [{ health: 0 }, "defeated"],
    [{ mapId: "estufas" }, "left-city"],
  ]) {
    const initial = begin(),
      snapshot = JSON.stringify(initial);
    const command = advanceFieldJobs(initial, {
      ...contextFor(initial),
      ...override,
    });
    const failed = done(command);
    assert.equal(command.reward, 0);
    assert.equal(failed.active, null);
    assert.equal(failed.lastResult.status, status);
    assert.equal(failed.records[FIELD_JOBS[0].id].failures, 1);
    assert.equal(failed.records[FIELD_JOBS[0].id].rewarded, false);
    assert.equal(JSON.stringify(initial), snapshot);
    const retried = begin(FIELD_JOBS[0].id, failed);
    assert.equal(retried.records[FIELD_JOBS[0].id].attempts, 2);
    assert.equal(retried.active.stepIndex, 0);
    assert.equal(retried.active.elapsed, 0);
    assert.equal(complete(retried).reward, 300);
  }
});

test("an expired saved job cannot be paid by E before the next update", () => {
  const state = begin("lote-perdido");
  state.active.stepIndex = 2;
  state.active.elapsed = 240;
  const command = interactFieldJob(state, contextFor(state));
  assert.equal(command.ok, true);
  assert.equal(command.reward, 0);
  assert.equal(command.handled, false);
  assert.equal(command.state.lastResult.status, "timeout");
  assert.equal(command.state.active, null);
});

test("the caller can pause without consuming time and malformed updates cannot advance anything", () => {
  let state = begin();
  state = done(advanceFieldJobs(state, { ...contextFor(state), dt: 2.5 }));
  const snapshot = JSON.stringify(state);
  // No call during a paused menu: serialization and view construction are read-only.
  for (let i = 0; i < 4; i++) getFieldJobsView(state);
  assert.equal(JSON.stringify(state), snapshot);
  const malformed = [
    { dt: 0 },
    { dt: -1 },
    { dt: NaN },
    { dt: Infinity },
    { dt: "1" },
    { position: null },
    { position: { x: Infinity, z: 83 } },
    { driving: 1 },
    { mapId: null },
    { health: NaN },
    { health: undefined },
  ];
  for (const override of malformed) {
    const command = advanceFieldJobs(state, {
      ...contextFor(state),
      ...override,
    });
    assert.equal(command.ok, false);
    assert.deepEqual(command.state, state);
    assert.equal(command.reward, 0);
    assert.deepEqual(command.events, []);
  }
  for (const override of [
    { position: { x: NaN, z: 83 } },
    { driving: 0 },
    { mapId: undefined },
  ]) {
    const command = interactFieldJob(state, {
      ...contextFor(state),
      ...override,
    });
    assert.equal(command.ok, false);
    assert.deepEqual(command.state, state);
    assert.equal(command.handled, false);
  }
});

test("cancellation keeps history and allows restarting with fresh objectives", () => {
  let state = begin("lote-perdido");
  state = done(interactFieldJob(state, contextFor(state)));
  state = done(interactFieldJob(state, contextFor(state)));
  const cancelled = cancelFieldJob(state);
  assert.equal(cancelled.reward, 0);
  assert.equal(cancelled.state.lastResult.status, "abandoned");
  assert.equal(cancelled.state.records["lote-perdido"].failures, 1);
  assert.equal(cancelFieldJob(cancelled.state).ok, false);
  const retried = begin("lote-perdido", cancelled.state);
  assert.equal(retried.active.ambushTriggered, false);
  assert.equal(retried.active.stepIndex, 0);
  assert.equal(
    complete(retried).events.filter((event) => event.type === "ambush").length,
    1,
  );
});

test("legacy and malformed saves normalize to safe defaults and ignore injected route/reward data", () => {
  for (const old of [
    undefined,
    null,
    false,
    "old-save",
    {},
    { active: { jobId: "unknown" } },
  ])
    assert.deepEqual(normalizeFieldJobs(old), createFieldJobs());
  const state = begin("lote-perdido");
  state.active.stepIndex = 2;
  state.active.point = { x: 9999, z: 9999 };
  state.active.reward = 1_000_000;
  state.active.ambushTriggered = false;
  state.records.unknown = { rewarded: true };
  const normalized = normalizeFieldJobs(JSON.parse(JSON.stringify(state)));
  assert.equal(normalized.active.point, undefined);
  assert.equal(normalized.active.reward, undefined);
  assert.equal(normalized.records.unknown, undefined);
  assert.equal(
    normalized.active.ambushTriggered,
    true,
    "a saved completed pickup cannot replay its event",
  );
  assert.deepEqual(getFieldJobsView(normalized).active.point, {
    id: "field-hq",
    x: 11,
    z: 83,
    label: "Quadro da quinta · sede",
  });
  assert.equal(complete(normalized).reward, 500);
  for (const invalid of [
    { stepIndex: -1 },
    { stepIndex: 1.5 },
    { stepIndex: 8 },
    { elapsed: -1 },
    { elapsed: NaN },
    { elapsed: Infinity },
    { elapsed: 241 },
  ]) {
    const corrupted = { ...state, active: { ...state.active, ...invalid } };
    assert.equal(normalizeFieldJobs(corrupted).active, null);
  }
});

test("partial completion records and finished results cannot unlock a second reward", () => {
  for (const partial of [
    { completed: true },
    { rewarded: true },
    { bestTime: 12.3 },
  ]) {
    const state = createFieldJobs();
    state.records[FIELD_JOBS[0].id] = partial;
    state.active = { jobId: FIELD_JOBS[0].id, stepIndex: 3, elapsed: 20 };
    const normalized = normalizeFieldJobs(state);
    assert.equal(normalized.records[FIELD_JOBS[0].id].rewarded, true);
    assert.equal(normalized.active, null);
    assert.equal(
      startFieldJob(normalized, FIELD_JOBS[0].id, startContext).ok,
      false,
    );
    assert.equal(interactFieldJob(normalized, startContext).reward, 0);
  }
  const partial = createFieldJobs();
  partial.lastResult = {
    jobId: FIELD_JOBS[0].id,
    status: "finished",
    elapsed: 20,
    reward: 99_999,
  };
  const normalized = normalizeFieldJobs(partial);
  assert.equal(normalized.lastResult.reward, 0);
  assert.equal(normalized.records[FIELD_JOBS[0].id].completed, true);
  assert.equal(
    startFieldJob(normalized, FIELD_JOBS[0].id, startContext).ok,
    false,
  );
});

test("commands and views preserve frozen caller state and round-trip active progress", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  };
  const state = freeze(begin()),
    snapshot = JSON.stringify(state),
    context = contextFor(state);
  normalizeFieldJobs(state);
  getFieldJobsView(state);
  canInteractFieldJob(state, context);
  advanceFieldJobs(state, context);
  interactFieldJob(state, context);
  cancelFieldJob(state);
  startFieldJob(state, FIELD_JOBS[1].id, startContext);
  assert.equal(JSON.stringify(state), snapshot);
  const advanced = done(interactFieldJob(state, context));
  const saved = JSON.parse(JSON.stringify(advanced));
  assert.deepEqual(normalizeFieldJobs(saved), advanced);
  const view = getFieldJobsView(saved);
  view.active.point.x = 1234;
  assert.notEqual(getFieldJobsView(saved).active.point.x, 1234);
  assert.equal(complete(saved).reward, 300);
});

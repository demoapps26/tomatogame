import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIVING_TRIALS, TRIAL_START_POINTS, createTrials, normalizeTrials,
  getTrialsView, startTrial, advanceTrial, cancelTrial,
} from "../src/driving-jobs.js";

const context = { position: { x: 96, z: 180 }, driving: true, mapId: "cidade" };
const done = (command) => {
  assert.equal(command.ok, true, command.message);
  return command.state;
};

function finish(saved, id = "city-sprint", speed = 12, onStep = null) {
  const trial = DRIVING_TRIALS.find((item) => item.id === id);
  let state = done(startTrial(saved, id, context));
  let position = { ...trial.start }, payout = 0;
  for (const target of trial.checkpoints) {
    while (Math.hypot(position.x - target.x, position.z - target.z) > 0.001 && state.active) {
      const distance = Math.hypot(position.x - target.x, position.z - target.z);
      const travel = Math.min(distance, speed * 0.25), dt = travel / speed;
      position = {
        x: position.x + (target.x - position.x) * travel / distance,
        z: position.z + (target.z - position.z) * travel / distance,
      };
      const command = advanceTrial(state, { ...context, dt, position });
      state = done(command); payout += command.reward;
      if (onStep) state = onStep(state);
    }
  }
  assert.equal(state.lastResult.status, "finished");
  assert.equal(state.active, null);
  return { state, payout };
}

test("catalogue contains three distinct finite road circuits and fresh immutable save data", () => {
  const state = createTrials(), view = getTrialsView(state);
  assert.equal(view.trials.length, 3);
  assert.equal(new Set(view.trials.map((trial) => trial.id)).size, 3);
  assert.deepEqual(view.trials.map((trial) => trial.reward), [200, 350, 600]);
  assert.deepEqual(view.trials.map((trial) => trial.timeLimit), [90, 130, 180]);
  assert.ok(view.trials.every((trial) => trial.lengthMeters > 350));
  assert.equal(TRIAL_START_POINTS[0].type, "race");
  view.trials[0].checkpoints[0].x = 800;
  view.startPoints[0].x = 800;
  assert.equal(DRIVING_TRIALS[0].checkpoints[0].x, 96);
  assert.equal(TRIAL_START_POINTS[0].x, 104);
  assert.deepEqual(normalizeTrials(JSON.parse(JSON.stringify(state))), state);
});

test("starting requires a car at the physical city start and does not change the source save", () => {
  const state = createTrials(), before = JSON.stringify(state);
  assert.equal(startTrial(state, "unknown", context).ok, false);
  assert.equal(startTrial(state, "city-sprint").ok, false);
  assert.equal(startTrial(state, "city-sprint", { ...context, driving: false }).ok, false);
  assert.equal(startTrial(state, "city-sprint", { ...context, mapId: "porto" }).ok, false);
  assert.equal(startTrial(state, "city-sprint", { ...context, position: { x: 0, z: 0 } }).ok, false);
  const started = done(startTrial(state, "city-sprint", context));
  assert.equal(JSON.stringify(state), before);
  assert.equal(started.active.elapsed, 0);
  assert.equal(getTrialsView(started).active.nextCheckpoint.z, 288);
  assert.equal(startTrial(started, "market-loop", context).ok, false);
});

test("checkpoints must be crossed sequentially and a legitimate segment crossing counts", () => {
  let state = done(startTrial(createTrials(), "city-sprint", context));
  state = done(advanceTrial(state, { ...context, dt: 0.5, position: { x: 96, z: 168 } }));
  assert.equal(state.active.checkpointIndex, 0, "crossing the finish first never counts");
  state = done(advanceTrial(state, { ...context, dt: 3, position: { x: 96, z: 270 } }));
  assert.equal(state.active.checkpointIndex, 0);
  state = done(advanceTrial(state, { ...context, dt: 1, position: { x: 96, z: 306 } }));
  assert.equal(state.active.checkpointIndex, 1, "an arch crossed between frames counts");
  const view = getTrialsView(state).active;
  assert.equal(view.completedCheckpoints, 1);
  assert.equal(view.checkpointCount, 5);
  assert.equal(view.progress, 0.2);
  assert.equal(view.nextCheckpoint.x, 0);
});

test("first completion pays once, repeated wins improve the record without another grant", () => {
  const initial = createTrials(), before = JSON.stringify(initial);
  const first = finish(initial);
  assert.equal(first.payout, 200);
  assert.equal(first.state.records["city-sprint"].completions, 1);
  assert.equal(first.state.records["city-sprint"].rewarded, true);
  assert.equal(first.state.lastResult.personalBest, true);
  assert.equal(JSON.stringify(initial), before);
  const faster = finish(first.state, "city-sprint", 16);
  assert.equal(faster.payout, 0);
  assert.ok(faster.state.records["city-sprint"].bestTime < first.state.records["city-sprint"].bestTime);
  assert.equal(faster.state.records["city-sprint"].completions, 2);
  assert.equal(faster.state.lastResult.personalBest, true);
  const slower = finish(faster.state, "city-sprint", 10);
  assert.equal(slower.payout, 0);
  assert.equal(slower.state.lastResult.personalBest, false);
  assert.equal(slower.state.records["city-sprint"].bestTime, faster.state.records["city-sprint"].bestTime);
  assert.equal(advanceTrial(first.state, { ...context, dt: 1 }).reward, 0);
});

test("all three routes are beatable at starter-car road speeds with one prize each", () => {
  let state = createTrials(), total = 0;
  for (const trial of DRIVING_TRIALS) {
    const completed = finish(state, trial.id, 12);
    total += completed.payout; state = completed.state;
    assert.ok(state.lastResult.elapsed < trial.timeLimit - 10);
  }
  assert.equal(total, 1150);
  assert.ok(getTrialsView(state).trials.every((trial) => trial.completed));
});

test("timeouts, leaving the car, changing maps and teleporting grant no money", () => {
  let state = done(startTrial(createTrials(), "city-sprint", context));
  for (let count = 0; count < 18; count++)
    state = done(advanceTrial(state, { ...context, dt: 5 }));
  const timedOut = advanceTrial(state, { ...context, dt: 0.1 });
  assert.equal(timedOut.state.lastResult.status, "timeout");
  assert.equal(timedOut.reward, 0);
  assert.equal(timedOut.state.records["city-sprint"].completions, 0);
  for (const extra of [{ driving: false }, { mapId: "estufas" }, { position: { x: 96, z: 288 } }]) {
    const active = done(startTrial(createTrials(), "city-sprint", context));
    const stopped = advanceTrial(active, { ...context, dt: 0.1, ...extra });
    assert.equal(stopped.reward, 0);
    assert.equal(stopped.state.active, null);
    assert.equal(stopped.state.records["city-sprint"].completions, 0);
  }
});

test("JSON save and restore during a run preserve checkpoint progress and one-off rewards", () => {
  const completed = finish(createTrials(), "market-loop", 12,
    (state) => normalizeTrials(JSON.parse(JSON.stringify(state))));
  assert.equal(completed.payout, 350);
  const restored = normalizeTrials(JSON.parse(JSON.stringify(completed.state)));
  const repeat = finish(restored, "market-loop", 16);
  assert.equal(repeat.payout, 0);
  assert.equal(repeat.state.records["market-loop"].completions, 2);
});

test("cancelling keeps records, and invalid clock or coordinates cannot advance the run", () => {
  const first = finish(createTrials());
  const state = done(startTrial(first.state, "market-loop", context));
  for (const extra of [{ dt: 0 }, { dt: -1 }, { dt: Infinity }, { dt: 6 }, { position: { x: NaN, z: 0 } }]) {
    const rejected = advanceTrial(state, { ...context, dt: 0.1, ...extra });
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.state, state);
  }
  const cancelled = cancelTrial(state);
  assert.equal(cancelled.reward, 0);
  assert.equal(cancelled.state.lastResult.status, "abandoned");
  assert.deepEqual(cancelled.state.records, first.state.records);
  assert.equal(cancelTrial(cancelled.state).ok, false);
});

test("malformed saves are sanitized without enabling a second first-win payment", () => {
  const state = normalizeTrials({
    records: {
      "city-sprint": { bestTime: 30, completions: 1, rewarded: false },
      "market-loop": { bestTime: -5, completions: -3 },
      "coastal-tour": { bestTime: Infinity, completions: 4 },
      injected: { bestTime: 1, completions: 1 },
    },
    active: { id: "city-sprint", elapsed: 5, checkpointIndex: 999, previousPosition: { x: 96, z: 180 } },
  });
  assert.equal(state.active, null);
  assert.equal(state.records["city-sprint"].rewarded, true);
  assert.equal(state.records["market-loop"].bestTime, null);
  assert.equal(state.records["market-loop"].completions, 0);
  assert.equal(state.records["coastal-tour"].rewarded, true);
  assert.equal(state.records.injected, undefined);
  assert.equal(finish(state).payout, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_WORK_STATIONS,
  MANUAL_WORK_ORDER,
  MANUAL_WORK_INTERACTION_RADIUS,
  createManualWork,
  normalizeManualWork,
  getManualWorkView,
  startManualWork,
  interactManualWork,
  advanceManualWork,
  cancelManualWork,
  canInteractManualWork,
} from "../src/manual-work.js";
import { createCompany, acceptContract } from "../src/company.js";

const base = {
  day: 1,
  founded: true,
  mapId: "cidade",
  driving: false,
  position: { ...MANUAL_WORK_STATIONS.boxes },
  stock: 90,
  cash: 2500,
  quality: 58,
  health: 100,
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const done = (command) => {
  assert.equal(command.ok, true, command.message);
  return command.state;
};
const begin = (context = {}, state = createManualWork()) =>
  done(startManualWork(state, { ...base, ...context }));
const contextFor = (state, overrides = {}) => ({
  ...base,
  day: state.active?.day || base.day,
  position: { ...getManualWorkView(state).active?.point },
  dt: 0.1,
  ...overrides,
});
function interact(state, overrides = {}) {
  return interactManualWork(state, contextFor(state, overrides));
}
function process(state, dt = 0.1) {
  let frames = 0;
  while (state.active.working) {
    const command = advanceManualWork(state, contextFor(state, { dt }));
    assert.equal(command.reward, 0);
    assert.equal(command.stockCost + command.cashCost + command.stockReturn, 0);
    state = done(command);
    assert(++frames < 1000);
  }
  return state;
}
function prepareBox(state) {
  state = done(interact(state)); // pick up
  assert.equal(getManualWorkView(state).active.carrying, true);
  state = done(interact(state)); // place on scale
  assert.equal(getManualWorkView(state).active.carrying, false);
  state = process(state);
  assert.equal(state.active.phase, "collect-weighed");
  state = done(interact(state)); // retrieve measured box
  assert.equal(getManualWorkView(state).active.carrying, true);
  state = done(interact(state)); // place at seal station
  return process(state);
}
function complete(state) {
  if (state.active.phase === "sample") state = done(interact(state));
  let reward = 0,
    events = [],
    commands = [];
  while (state.active) {
    state = prepareBox(state);
    assert.equal(state.active.phase, "dispatch");
    const result = interact(state);
    state = done(result);
    reward += result.reward;
    events.push(...result.events);
    commands.push(result);
  }
  return { state, reward, events, commands };
}
function apply(company, command) {
  assert(command.ok);
  assert(company.stock >= command.stockCost);
  assert(company.cash >= command.cashCost);
  return {
    ...company,
    stock: company.stock - command.stockCost + command.stockReturn,
    cash: company.cash - command.cashCost + command.reward,
  };
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

test("manual order exposes fixed physical stations and separate mutable views", () => {
  const fresh = createManualWork(),
    view = getManualWorkView(fresh, base);
  assert.equal(view.canStart, true);
  assert.equal(view.active, null);
  assert.equal(MANUAL_WORK_INTERACTION_RADIUS, 1.6);
  assert.equal(MANUAL_WORK_ORDER.quantity, 6);
  assert.equal(Object.keys(MANUAL_WORK_STATIONS).length, 4);
  assert.equal(
    new Set(Object.values(MANUAL_WORK_STATIONS).map((p) => p.id)).size,
    4,
  );
  for (const point of Object.values(MANUAL_WORK_STATIONS))
    assert(Number.isFinite(point.x) && Number.isFinite(point.z) && point.label);
  view.stations.boxes.x = 900;
  view.order.quantity = 900;
  assert.equal(MANUAL_WORK_STATIONS.boxes.x, 21);
  assert.equal(MANUAL_WORK_ORDER.quantity, 6);
  const active = begin();
  const activeView = getManualWorkView(active);
  activeView.active.point.x = 800;
  assert.equal(getManualWorkView(active).active.point.x, 65);
  assert.deepEqual(normalizeManualWork(copy(fresh)), fresh);
});

test("acceptance reserves real free stock and packaging cash only at the city station on foot", () => {
  for (const patch of [
    { day: 0 },
    { day: 1.5 },
    { day: NaN },
    { founded: false },
    { founded: 1 },
    { mapId: "porto" },
    { driving: true },
    { driving: undefined },
    { position: { x: 23, z: 74 } },
    { position: { x: NaN, z: 74 } },
    { stock: 5 },
    { stock: "90" },
    { stock: Infinity },
    { cash: 7.99 },
    { cash: NaN },
    { quality: 101 },
    { quality: "58" },
  ]) {
    const result = startManualWork(createManualWork(), { ...base, ...patch });
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.state.active, null);
    assert.equal(
      result.reward + result.stockCost + result.cashCost + result.stockReturn,
      0,
    );
  }
  const result = startManualWork(createManualWork(), base);
  assert.equal(result.stockCost, 6);
  assert.equal(result.cashCost, 8);
  assert.equal(result.reward, 0);
  assert.equal(result.state.active.phase, "sample");
  assert.equal(getManualWorkView(result.state).active.carrying, false);
  assert.equal(startManualWork(result.state, base).ok, false);
});

test("arrival and elapsed time cannot collect, weigh, seal or dispatch a box", () => {
  let state = begin();
  for (let i = 0; i < 30; i++)
    state = done(advanceManualWork(state, contextFor(state, { dt: 0.25 })));
  assert.equal(state.active.phase, "sample");
  const skipped = interact(state, {
    position: { ...MANUAL_WORK_STATIONS.seal },
  });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.handled, false);
  state = done(interact(state));
  assert.equal(state.active.phase, "collect");
  state = done(advanceManualWork(state, contextFor(state, { dt: 1e6 })));
  assert.equal(state.active.phase, "collect");
  assert.equal(state.active.completedBoxes, 0);
});

test("E has an exact 1.6 metre radius and wrong vehicle mode falls through", () => {
  const state = begin(),
    point = getManualWorkView(state).active.point;
  const edge = contextFor(state, {
    position: { x: point.x, z: point.z + 1.6 },
  });
  assert.equal(canInteractManualWork(state, edge), true);
  assert.equal(interactManualWork(state, edge).handled, true);
  const outside = { ...edge, position: { x: point.x, z: point.z + 1.601 } };
  assert.equal(canInteractManualWork(state, outside), false);
  assert.equal(interactManualWork(state, outside).handled, false);
  const driving = contextFor(state, { driving: true });
  assert.equal(canInteractManualWork(state, driving), false);
  assert.equal(interactManualWork(state, driving).handled, false);
});

test("a box is held between stations and leaves the hands during timed weighing and sealing", () => {
  let state = begin();
  state = done(interact(state));
  assert.equal(getManualWorkView(state).active.carrying, false);
  state = done(interact(state));
  assert.equal(state.active.phase, "weigh");
  assert.equal(getManualWorkView(state).active.carrying, true);
  state = done(interact(state));
  assert.equal(state.active.working, true);
  assert.equal(getManualWorkView(state).active.carrying, false);
  state = done(advanceManualWork(state, contextFor(state, { dt: 0.25 })));
  const view = getManualWorkView(state).active;
  assert(view.progress > 0 && view.progress < 1);
  assert.equal(view.processDuration, 2);
  const busy = interact(state);
  assert.equal(busy.ok, false);
  assert.equal(busy.handled, true);
  state = process(state);
  state = done(interact(state));
  assert.equal(state.active.phase, "seal");
  assert.equal(getManualWorkView(state).active.carrying, true);
  state = done(interact(state));
  assert.equal(getManualWorkView(state).active.processDuration, 3);
  state = process(state);
  assert.equal(state.active.phase, "dispatch");
  assert.equal(getManualWorkView(state).active.carrying, false);
});

test("leaving a working station or entering a vehicle resets the measurement without consuming cargo", () => {
  for (const phase of ["weigh", "seal"]) {
    let state = begin();
    state = done(interact(state));
    state = done(interact(state));
    if (phase === "seal") {
      state = done(interact(state));
      state = process(state);
      state = done(interact(state));
    }
    state = done(interact(state));
    state = done(advanceManualWork(state, contextFor(state, { dt: 0.25 })));
    for (const movement of [
      { position: { x: -500, z: -500 } },
      { driving: true },
    ]) {
      const interrupted = advanceManualWork(
        state,
        contextFor(state, { ...movement, dt: 0.1 }),
      );
      const stopped = done(interrupted);
      assert.equal(stopped.active.phase, phase);
      assert.equal(stopped.active.working, false);
      assert.equal(stopped.active.processElapsed, 0);
      assert.equal(getManualWorkView(stopped).active.carrying, true);
      assert.equal(stopped.active.completedBoxes, 0);
      assert.equal(
        interrupted.reward +
          interrupted.stockReturn +
          interrupted.stockCost +
          interrupted.cashCost,
        0,
      );
      assert.equal(interrupted.events[0].type, "process-interrupted");
    }
  }
});

test("timers preserve their duration across frame rates and a delayed frame cannot finish the operation", () => {
  for (const fps of [30, 60, 120]) {
    let state = begin();
    state = done(interact(state));
    state = done(interact(state));
    state = done(interact(state));
    for (let frame = 0; frame < fps * 2 - 1; frame++)
      state = done(
        advanceManualWork(state, contextFor(state, { dt: 1 / fps })),
      );
    assert.equal(state.active.working, true);
    state = done(advanceManualWork(state, contextFor(state, { dt: 1 / fps })));
    assert.equal(state.active.phase, "collect-weighed");
  }
  let state = begin();
  state = done(interact(state));
  state = done(interact(state));
  state = done(interact(state));
  const delayed = advanceManualWork(state, contextFor(state, { dt: 36000 }));
  state = done(delayed);
  assert.equal(state.active.processElapsed, 0.25);
  assert.equal(state.active.working, true);
  assert.equal(delayed.reward, 0);
});

test("the complete six-box circuit pays once, only at the final physical dispatch", () => {
  const finished = complete(begin());
  assert.equal(finished.reward, 110);
  assert.equal(finished.state.active, null);
  assert.equal(finished.state.completedDay, 1);
  assert.equal(
    finished.events.filter((e) => e.type === "box-dispatched").length,
    6,
  );
  assert.equal(finished.events.filter((e) => e.type === "completed").length, 1);
  assert.deepEqual(
    finished.commands.map((c) => c.reward),
    [0, 0, 0, 0, 0, 110],
  );
  for (const command of [
    interactManualWork(finished.state, base),
    advanceManualWork(finished.state, { ...base, dt: 0.1 }),
    cancelManualWork(finished.state),
    startManualWork(finished.state, base),
  ])
    assert.equal(
      command.reward +
        command.stockReturn +
        command.stockCost +
        command.cashCost,
      0,
    );
  assert.equal(getManualWorkView(finished.state, base).completedToday, true);
});

test("quality and payment are fixed by acceptance, with a bounded real quality bonus", () => {
  for (const [quality, payment] of [
    [0, 96],
    [50, 108],
    [58, 110],
    [100, 120],
  ]) {
    let state = begin({ quality });
    state = done(interact(state));
    // Later company changes and injected request prices cannot change this order.
    const first = interact(state, {
      quality: 100,
      reward: 100000,
      quantity: 100000,
    });
    state = done(first);
    const finished = completeFromPartial(state);
    assert.equal(finished.reward, payment);
  }
});
function completeFromPartial(state) {
  let reward = 0;
  while (state.active) {
    const phase = state.active.phase;
    if (state.active.working) {
      state = process(state);
      continue;
    }
    const command = interact(state);
    state = done(command);
    reward += command.reward;
  }
  return { state, reward };
}

test("stock is debited once and cannot be consumed again by ordinary contracts", () => {
  let company = createCompany();
  const start = startManualWork(createManualWork(), {
    ...base,
    stock: company.stock,
    cash: company.cash,
    quality: company.quality,
  });
  company = apply(company, start);
  assert.equal(company.stock, 84);
  assert.equal(company.cash, 2492);
  const contract = company.contracts.find(
    (c) => c.status === "available" && c.quantity <= company.stock,
  );
  assert(contract);
  company = acceptContract(company, contract.id).state;
  const available = company.stock;
  const finished = complete(start.state);
  for (const command of finished.commands) company = apply(company, command);
  assert.equal(company.stock, available);
  assert.equal(
    company.contracts.find((c) => c.id === contract.id).reserved,
    contract.quantity,
  );
});

test("cancelling returns only unshipped stock once and never refunds packaging or awards money", () => {
  for (const completed of [0, 1, 5]) {
    let company = { stock: 90, cash: 2500 };
    const start = startManualWork(createManualWork(), base);
    company = apply(company, start);
    let state = start.state;
    state = done(interact(state));
    for (let i = 0; i < completed; i++) {
      state = prepareBox(state);
      state = done(interact(state));
    }
    const cancelled = cancelManualWork(state);
    state = done(cancelled);
    company = apply(company, cancelled);
    assert.equal(cancelled.stockReturn, 6 - completed);
    assert.equal(
      cancelled.reward + cancelled.cashCost + cancelled.stockCost,
      0,
    );
    assert.equal(company.stock, 90 - completed);
    assert.equal(company.cash, 2492);
    const again = cancelManualWork(copy(state));
    assert.equal(again.stockReturn, 0);
    assert.equal(again.reward, 0);
    const restart = startManualWork(state, {
      ...base,
      stock: company.stock,
      cash: company.cash,
    });
    assert.equal(restart.ok, true);
    assert.equal(restart.cashCost, 8);
    assert.equal(restart.stockCost, 6);
    assert.notEqual(restart.state.active.id, start.state.active.id);
  }
});

test("day changes, defeat and leaving the city close the order with one conservative stock return", () => {
  const conditions = [{ day: 2 }, { health: 0 }, { mapId: "porto" }];
  for (const change of conditions) {
    let state = begin();
    state = done(interact(state));
    state = prepareBox(state);
    state = done(interact(state));
    const command = advanceManualWork(
      state,
      contextFor(state, { ...change, dt: 0.1 }),
    );
    state = done(command);
    assert.equal(state.active, null);
    assert.equal(command.reward, 0);
    assert.equal(command.stockReturn, 5);
    assert.equal(
      advanceManualWork(state, { ...base, ...change, dt: 0.1 }).stockReturn,
      0,
    );
    assert.equal(cancelManualWork(state).stockReturn, 0);
  }
  const direct = interactManualWork(begin(), { ...base, day: 2 });
  assert.equal(direct.stockReturn, 6);
  assert.equal(direct.reward, 0);
});

test("malformed or paused updates cannot spend money, move a phase or advance a process", () => {
  let state = begin();
  state = done(interact(state));
  state = done(interact(state));
  state = done(interact(state));
  for (const patch of [
    { dt: 0 },
    { dt: -1 },
    { dt: NaN },
    { dt: Infinity },
    { day: undefined },
    { health: NaN },
    { position: { x: 0, z: Infinity } },
    { driving: "false" },
    { mapId: null },
  ]) {
    const result = advanceManualWork(state, contextFor(state, patch));
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, state);
    assert.equal(
      result.reward + result.stockReturn + result.stockCost + result.cashCost,
      0,
    );
  }
  assert.deepEqual(normalizeManualWork(copy(state)), state);
});

test("mid-process saves restore the exact cargo and deterministic next completion", () => {
  let state = begin();
  state = done(interact(state));
  state = done(interact(state));
  state = done(interact(state));
  for (let i = 0; i < 7; i++)
    state = done(advanceManualWork(state, contextFor(state, { dt: 1 / 60 })));
  const restored = normalizeManualWork(copy(state));
  assert.deepEqual(restored, state);
  assert.deepEqual(
    completeFromPartial(copy(state)),
    completeFromPartial(restored),
  );
  const finished = completeFromPartial(restored).state;
  assert.deepEqual(normalizeManualWork(copy(finished)), finished);
});

test("a completed-day watermark survives old receipts and prevents earlier-day replay", () => {
  const finished = complete(begin({ day: 4 })).state;
  for (const day of [1, 3, 4])
    assert.equal(startManualWork(finished, { ...base, day }).ok, false);
  assert.equal(startManualWork(finished, { ...base, day: 5 }).ok, true);
  const interruptedReceipt = normalizeManualWork({
    lastResult: { day: 4, status: "finished", reward: 999999 },
    completedDay: 0,
  });
  assert.equal(interruptedReceipt.completedDay, 4);
  assert.equal(
    startManualWork(interruptedReceipt, { ...base, day: 4 }).ok,
    false,
  );
  assert.equal(interactManualWork(interruptedReceipt, base).reward, 0);
});

test("normalization rejects unfunded cargo and strips injected carrying, prices and quantities", () => {
  const valid = begin();
  for (const patch of [
    { reservedStock: 0 },
    { reservedStock: 600 },
    { packagingPaid: 0 },
    { sequence: 999 },
    { day: 0 },
    { phase: "paid" },
    { completedBoxes: 6 },
    { completedBoxes: -1 },
    { quality: Infinity },
    { elapsed: NaN },
  ]) {
    const source = copy(valid);
    Object.assign(source.active, patch);
    const normalized = normalizeManualWork(source);
    assert.equal(normalized.active, null, JSON.stringify(patch));
    assert.equal(cancelManualWork(normalized).stockReturn, 0);
    assert.equal(interactManualWork(normalized, base).reward, 0);
  }
  const injected = copy(valid);
  Object.assign(injected.active, {
    carrying: true,
    reward: 90000,
    quantity: 90000,
    id: "arbitrary",
    working: true,
    processElapsed: 999,
  });
  const state = normalizeManualWork(injected),
    view = getManualWorkView(state).active;
  assert.equal(view.carrying, false);
  assert.equal(view.reward, 110);
  assert.equal(view.totalBoxes, 6);
  assert.equal(state.active.id, "manual-1-1");
  assert.equal(view.working, false);
  assert.equal(
    normalizeManualWork({ ...copy(valid), completedDay: 1 }).active,
    null,
  );
});

test("commands, views and normalization preserve frozen caller input and isolate events", () => {
  const state = freeze(begin()),
    context = freeze(contextFor(state)),
    snapshot = JSON.stringify(state);
  getManualWorkView(state, context);
  normalizeManualWork(state);
  const command = interactManualWork(state, context);
  assert.equal(command.ok, true);
  assert.equal(JSON.stringify(state), snapshot);
  command.events[0].point.x = 12345;
  assert.equal(getManualWorkView(state).active.point.x, 65);
  cancelManualWork(state);
  advanceManualWork(state, { ...context, dt: 0.1 });
  assert.equal(JSON.stringify(state), snapshot);
  const initial = freeze(createManualWork()),
    start = freeze(copy(base));
  assert.equal(startManualWork(initial, start).ok, true);
});

test("settled refund receipts reject a stale active lot after a partially written save", () => {
  const active = begin(),
    cancelled = cancelManualWork(active);
  const partial = {
    ...copy(active),
    lastResult: copy(cancelled.state.lastResult),
  };
  const restored = normalizeManualWork(partial);
  assert.equal(restored.active, null);
  assert.equal(cancelManualWork(restored).stockReturn, 0);
  assert.equal(restored.settledSequence, active.active.sequence);
  const retry = startManualWork(restored, base);
  assert.equal(retry.ok, true);
  assert(retry.state.active.sequence > restored.settledSequence);
  const stale = { ...copy(retry.state), active: copy(active.active) };
  assert.equal(normalizeManualWork(stale).active, null);
});

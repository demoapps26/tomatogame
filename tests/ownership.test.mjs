import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompany,
  normalizeCompany,
  acceptContract,
  deliverContract,
} from "../src/company.js";
import {
  CAR_CATALOG,
  PROPERTY_CATALOG,
  MILESTONE_DEFINITIONS,
  ensureOwnership,
  getOwnershipView,
  buyCar,
  repairCar,
  refuelCar,
  updateVehicleUsage,
  parkCar,
  buyProperty,
  upgradeProperty,
  setHome,
  restAtProperty,
  claimMilestone,
  advanceOwnership,
} from "../src/ownership.js";

function done(command) {
  assert.equal(command.ok, true, command.message);
  return command.state;
}
function funded(cash = 50000) {
  return { ...createCompany("Horta das Colinas"), cash };
}
function compact(cash = 50000) {
  return done(buyCar(funded(cash), "compact"));
}
const compactId = "owned-compact";

test("version 3 saves gain ownership without losing the business or operations", () => {
  const old = createCompany("Tomates da Serra");
  old.cash = 1532.45;
  old.operations.shop.stock = 17;
  delete old.ownership;
  const before = JSON.stringify(old);
  const state = ensureOwnership(old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(state.version, 3);
  assert.equal(state.cash, 1532.45);
  assert.equal(state.name, "Tomates da Serra");
  assert.equal(state.operations.shop.stock, 17);
  assert.deepEqual(state.ownership.vehicles, []);
  assert.deepEqual(state.ownership.properties, []);
  assert.deepEqual(state.ownership.claimedMilestones, []);
  assert.equal(state.ownership.homeId, null);
  assert.deepEqual(normalizeCompany(JSON.parse(JSON.stringify(state))), state);
});

test("save migration rejects unknown assets, deduplicates models and bounds vehicle data", () => {
  const state = funded();
  state.ownership = {
    vehicles: [
      {
        id: "fake-id",
        modelId: "compact",
        fuel: 500,
        maxFuel: 999,
        condition: -1,
        color: "#123abc",
        odometer: 321.1254,
      },
      { modelId: "compact", fuel: 1 },
      null,
      { modelId: "jet", fuel: 500 },
    ],
    properties: [
      { id: "apartamento", level: 42, lastRestDay: 4 },
      { id: "apartamento", level: 1 },
      { id: "palacio", level: 1 },
    ],
    homeId: "palacio",
    claimedMilestones: ["primeira-casa", "primeira-casa", "fake"],
    totalDistance: 999999,
    carSpending: -50,
  };
  const normalized = ensureOwnership(state).ownership;
  assert.equal(normalized.vehicles.length, 1);
  assert.deepEqual(normalized.vehicles[0], {
    id: compactId,
    modelId: "compact",
    fuel: 38,
    maxFuel: 38,
    condition: 0,
    color: 0x123abc,
    odometer: 321.125,
    purchasedDay: 1,
    parked: null,
  });
  assert.equal(normalized.totalDistance, 321.125);
  assert.equal(normalized.properties.length, 1);
  assert.equal(normalized.properties[0].level, 3);
  assert.equal(normalized.homeId, "apartamento");
  assert.equal(normalized.restedDay, 4);
  assert.deepEqual(normalized.claimedMilestones, ["primeira-casa"]);
  assert.equal(normalized.carSpending, 0);
});

test("the first car is affordable, immutable and a single purchase from company funds", () => {
  const start = createCompany();
  const before = JSON.stringify(start);
  const purchase = buyCar(start, "compact");
  assert.equal(purchase.ok, true, purchase.message);
  assert.equal(purchase.vehicleId, compactId);
  assert.equal(JSON.stringify(start), before);
  const state = purchase.state;
  assert.equal(state.cash, 1100);
  assert.equal(state.expenses, start.expenses + 1400);
  assert.equal(state.ownership.carSpending, 1400);
  assert.equal(state.ownership.vehicles[0].fuel, 38);
  assert.equal(state.ownership.vehicles[0].condition, 100);
  assert.match(state.history.at(-1).body, /tesouraria/);
  const duplicate = buyCar(state, "compact");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state.cash, state.cash);
  assert.equal(duplicate.state.ownership.vehicles.length, 1);
  assert.equal(buyCar(start, "sport").ok, false);
  assert.equal(buyCar(start, "missing").ok, false);
  const view = getOwnershipView(state);
  assert.equal(view.cars.find((car) => car.id === "compact").canBuy, false);
  assert.equal(view.vehicles[0].topSpeedKmh, 86.4);
});

test("the five car models keep distinct performance and the garage never exceeds five", () => {
  let state = funded();
  for (const model of CAR_CATALOG) state = done(buyCar(state, model.id));
  assert.equal(state.ownership.vehicles.length, 5);
  assert.equal(
    new Set(state.ownership.vehicles.map((vehicle) => vehicle.id)).size,
    5,
  );
  assert.equal(
    state.cash,
    50000 - CAR_CATALOG.reduce((sum, car) => sum + car.price, 0),
  );
  const view = getOwnershipView(state);
  assert(view.cars.every((car) => car.owned && !car.canBuy));
  assert(
    view.vehicles.find((car) => car.modelId === "sport").topSpeed >
      view.vehicles.find((car) => car.modelId === "van").topSpeed,
  );
  assert(
    view.vehicles.find((car) => car.modelId === "van").maxFuel >
      view.vehicles.find((car) => car.modelId === "compact").maxFuel,
  );
  assert.equal(buyCar(state, "van").state.cash, state.cash);
});

test("small driving updates consume fuel, accumulate metres and preserve the input", () => {
  const initial = compact();
  const before = JSON.stringify(initial);
  let state = initial;
  for (let step = 0; step < 1000; step++) {
    state = done(updateVehicleUsage(state, compactId, { distance: 1 }));
  }
  assert.equal(JSON.stringify(initial), before);
  assert.equal(state.ownership.vehicles[0].fuel, 37.928);
  assert.equal(state.ownership.vehicles[0].odometer, 1000);
  assert.equal(state.ownership.totalDistance, 1000);
  assert.equal(getOwnershipView(state).distanceKm, 1);
  assert.equal(state.cash, initial.cash);
  assert.equal(
    state.history.length,
    initial.history.length,
    "normal driving does not fill the history",
  );
});

test("damage and an empty tank disable driving without creating fuel or negative values", () => {
  let state = compact();
  state.ownership.vehicles[0].fuel = 0.01;
  const used = updateVehicleUsage(state, compactId, {
    distance: 1000,
    collision: 200,
  });
  assert(used.ok);
  assert.equal(used.fuelUsed, 0.01);
  assert.equal(used.conditionLost, 100);
  assert.equal(used.drivable, false);
  assert.equal(used.state.ownership.vehicles[0].fuel, 0);
  assert.equal(used.state.ownership.vehicles[0].condition, 0);
  assert.equal(getOwnershipView(used.state).vehicles[0].drivable, false);
  for (const invalid of [
    null,
    [],
    { distance: -1 },
    { distance: NaN },
    { distance: 100001 },
    { collision: -2 },
  ]) {
    const rejected = updateVehicleUsage(used.state, compactId, invalid);
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.state, used.state);
  }
  assert.equal(
    updateVehicleUsage(state, "not-owned", { distance: 1 }).ok,
    false,
  );
});

test("repairs charge for damage exactly once and enforce the available budget", () => {
  let state = done(
    updateVehicleUsage(compact(), compactId, { collision: 12.5 }),
  );
  const before = JSON.stringify(state);
  const view = getOwnershipView(state).vehicles[0];
  assert.equal(view.repairCost, 150);
  const repaired = repairCar(state, compactId);
  assert(repaired.ok);
  assert.equal(JSON.stringify(state), before);
  assert.equal(repaired.state.cash, state.cash - 150);
  assert.equal(repaired.state.ownership.serviceSpending, 150);
  assert.equal(repaired.state.ownership.vehicles[0].condition, 100);
  assert.equal(repairCar(repaired.state, compactId).ok, false);
  state.cash = 149.99;
  assert.equal(repairCar(state, compactId).ok, false);
  assert.equal(getOwnershipView(state).vehicles[0].canRepair, false);
  state = done(updateVehicleUsage(compact(), compactId, { collision: 0.01 }));
  assert.equal(getOwnershipView(state).vehicles[0].repairCost, 20);
});

test("refuelling supports partial purchases, charges tiny quantities and caps a full tank", () => {
  let state = compact();
  state.ownership.vehicles[0].fuel = 30;
  const before = JSON.stringify(state);
  const partial = refuelCar(state, compactId, 2);
  assert(partial.ok);
  assert.equal(JSON.stringify(state), before);
  assert.equal(partial.litres, 2);
  assert.equal(partial.cost, 3.7);
  assert.equal(partial.state.cash, state.cash - 3.7);
  assert.equal(partial.state.ownership.vehicles[0].fuel, 32);
  const full = refuelCar(partial.state, compactId, 500);
  assert(full.ok);
  assert.equal(full.litres, 6);
  assert.equal(full.cost, 11.1);
  assert.equal(full.state.ownership.vehicles[0].fuel, 38);
  assert.equal(refuelCar(full.state, compactId).ok, false);
  const tiny = refuelCar(state, compactId, 0.000001);
  assert(tiny.ok);
  assert.equal(tiny.cost, 0.01, "fractional refuels cannot mint free fuel");
  for (const litres of [0, -1, NaN, Infinity, "2"]) {
    assert.equal(refuelCar(state, compactId, litres).ok, false);
  }
  state.cash = 1;
  assert.equal(refuelCar(state, compactId).ok, false);
  assert.equal(
    refuelCar(state, compactId, 0.5).ok,
    true,
    "a partial refuel remains affordable",
  );
});

test("parking saves map position and heading while rejecting out of bounds data", () => {
  const state = compact();
  const parked = done(
    parkCar(state, compactId, {
      mapId: "cidade",
      x: 120.1254,
      z: -300.75,
      yaw: Math.PI * 5,
    }),
  );
  const position = parked.ownership.vehicles[0].parked;
  assert.equal(position.x, 120.125);
  assert.equal(position.z, -300.75);
  assert(Math.abs(Math.abs(position.yaw) - Math.PI) < 1e-10);
  assert.equal(position.mapId, "cidade");
  assert.equal(state.ownership.vehicles[0].parked, null);
  assert.deepEqual(
    normalizeCompany(JSON.parse(JSON.stringify(parked))),
    parked,
  );
  for (const parking of [
    null,
    { mapId: "cidade", x: 731, z: 0 },
    { mapId: "porto", x: 251, z: 0 },
    { mapId: "unknown", x: 0, z: 0 },
    { mapId: "cidade", x: NaN, z: 0 },
  ]) {
    assert.equal(parkCar(parked, compactId, parking).ok, false);
  }
  assert.equal(
    parkCar(parked, compactId, { mapId: "estufas", x: 10, z: 20, yaw: 1 }).ok,
    true,
  );
});

test("properties have one owner, three paid furniture levels and explicit treasury spending", () => {
  const initial = funded();
  const before = JSON.stringify(initial);
  let state = done(buyProperty(initial, "apartamento"));
  assert.equal(JSON.stringify(initial), before);
  assert.equal(state.cash, initial.cash - 1800);
  assert.equal(state.ownership.homeId, "apartamento");
  assert.equal(state.ownership.properties[0].level, 0);
  assert.equal(buyProperty(state, "apartamento").ok, false);
  for (const cost of [350, 650, 950]) {
    const command = upgradeProperty(state, "apartamento");
    assert(command.ok);
    assert.equal(command.cost, cost);
    assert.equal(command.state.cash, state.cash - cost);
    state = command.state;
  }
  assert.equal(state.ownership.properties[0].level, 3);
  assert.equal(state.ownership.propertySpending, 3750);
  assert.equal(state.expenses, initial.expenses + 3750);
  assert.equal(upgradeProperty(state, "apartamento").ok, false);
  const home = getOwnershipView(state).properties.find(
    (property) => property.id === "apartamento",
  );
  assert.equal(home.comfort, 100);
  assert.equal(home.canUpgrade, false);
  assert.equal(upgradeProperty(state, "casa-jardim").ok, false);
  assert.equal(
    buyProperty({ ...initial, cash: 1799.99 }, "apartamento").ok,
    false,
  );
  assert.equal(buyProperty(initial, "missing").ok, false);
  for (const property of PROPERTY_CATALOG.slice(1))
    state = done(buyProperty(state, property.id));
  assert.equal(state.ownership.properties.length, 3);
});

test("resting heals at an owned home once per business day across every house", () => {
  let state = done(buyProperty(funded(), "apartamento"));
  state = done(buyProperty(state, "casa-jardim"));
  assert.equal(restAtProperty(state, "villa-mar").ok, false);
  const cash = state.cash,
    before = JSON.stringify(state);
  const rested = restAtProperty(state, "apartamento");
  assert(rested.ok);
  assert.equal(JSON.stringify(state), before);
  assert.equal(rested.health, 100);
  assert.equal(rested.checkpoint, true);
  assert.equal(rested.state.cash, cash);
  assert.equal(rested.state.ownership.restedDay, state.day);
  assert.equal(restAtProperty(rested.state, "casa-jardim").ok, false);
  state = done(setHome(rested.state, "casa-jardim"));
  assert.equal(state.ownership.homeId, "casa-jardim");
  assert.equal(setHome(state, "villa-mar").ok, false);
  assert.deepEqual(done(setHome(state, "casa-jardim")), state);
  state.day += 1;
  state = done(restAtProperty(state, "casa-jardim"));
  assert.equal(
    state.ownership.properties.find((property) => property.id === "casa-jardim")
      .lastRestDay,
    2,
  );
  assert.equal(state.cash, cash);
});

test("a real customer delivery unlocks its one-time grant without inflating sales revenue", () => {
  let state = createCompany();
  assert(
    getOwnershipView(state).milestones.every(
      (milestone) => !milestone.claimable,
    ),
  );
  assert.equal(claimMilestone(state, "primeira-entrega").ok, false);
  const id = state.contracts[0].id;
  state = done(deliverContract(done(acceptContract(state, id)), id));
  const cash = state.cash,
    revenue = state.revenue,
    before = JSON.stringify(state);
  const reward = claimMilestone(state, "primeira-entrega");
  assert(reward.ok);
  assert.equal(JSON.stringify(state), before);
  assert.equal(reward.state.cash, cash + 250);
  assert.equal(reward.state.revenue, revenue);
  assert.equal(reward.state.ownership.rewardIncome, 250);
  assert.equal(reward.state.history.at(-1).kind, "milestone");
  const restored = normalizeCompany(JSON.parse(JSON.stringify(reward.state)));
  assert.equal(claimMilestone(restored, "primeira-entrega").ok, false);
  assert.equal(
    getOwnershipView(restored).milestones.find(
      (milestone) => milestone.id === "primeira-entrega",
    ).claimed,
    true,
  );
});

test("all milestone thresholds use actual counters and claimed grants cannot be farmed", () => {
  let state = funded();
  state.completedDeliveries = 1;
  state.operations.shop.sold = 9;
  state.operations.fleetDeliveries = 2;
  state.reputation = 99;
  state = done(buyCar(state, "compact"));
  assert.equal(claimMilestone(state, "garagem-propria").ok, false);
  state = done(buyCar(state, "pickup"));
  state = done(buyProperty(state, "apartamento"));
  assert.equal(claimMilestone(state, "loja-bairro").ok, false);
  assert.equal(claimMilestone(state, "rede-distribuicao").ok, false);
  state.operations.shop.sold = 10;
  state.operations.fleetDeliveries = 3;
  const startingCash = state.cash;
  for (const milestone of MILESTONE_DEFINITIONS)
    state = done(claimMilestone(state, milestone.id));
  const rewards = MILESTONE_DEFINITIONS.reduce(
    (total, milestone) => total + milestone.reward,
    0,
  );
  assert.equal(state.cash, startingCash + rewards);
  assert.equal(state.ownership.rewardIncome, rewards);
  assert.equal(state.reputation, 100);
  assert(
    getOwnershipView(state).milestones.every(
      (milestone) => milestone.claimed && !milestone.claimable,
    ),
  );
  for (const milestone of MILESTONE_DEFINITIONS) {
    const duplicate = claimMilestone(state, milestone.id);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.state.cash, state.cash);
  }
  assert.equal(claimMilestone(state, "missing").ok, false);
});

test("mid-drive saves preserve fuel, damage, furniture, parking and future commands", () => {
  let state = compact();
  state = done(
    updateVehicleUsage(state, compactId, {
      distance: 1842.739,
      collision: 3.421,
    }),
  );
  state = done(
    parkCar(state, compactId, { mapId: "porto", x: -23.2, z: 47.5, yaw: 0.5 }),
  );
  state = done(buyProperty(state, "casa-jardim"));
  state = done(upgradeProperty(state, "casa-jardim"));
  state = done(restAtProperty(state, "casa-jardim"));
  state = done(claimMilestone(state, "primeira-casa"));
  const restored = normalizeCompany(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.deepEqual(
    done(
      updateVehicleUsage(restored, compactId, {
        distance: 12.47,
        collision: 0.25,
      }),
    ),
    done(
      updateVehicleUsage(state, compactId, {
        distance: 12.47,
        collision: 0.25,
      }),
    ),
  );
  assert.equal(restAtProperty(restored, "casa-jardim").ok, false);
});

test("elapsed time creates neither property rent nor refill, rewards or free repairs", () => {
  let state = done(buyProperty(compact(), "apartamento"));
  state = done(
    updateVehicleUsage(state, compactId, { distance: 600, collision: 2 }),
  );
  for (const seconds of [0, 3600, 24 * 3600]) {
    const advanced = advanceOwnership(state, seconds);
    assert(advanced.ok);
    assert.deepEqual(advanced.events, []);
    assert.deepEqual(advanced.state, state);
  }
  for (const seconds of [-1, Infinity, NaN])
    assert.equal(advanceOwnership(state, seconds).ok, false);
});

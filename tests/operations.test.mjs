import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompany,
  normalizeCompany,
  applyDecision,
  buyUpgrade,
  acceptContract,
  deliverContract,
  advanceDay,
  getCompanyView,
} from "../src/company.js";
import {
  ensureOperations,
  getOperationsView,
  buyFleetVehicle,
  dispatchFleet,
  negotiateClient,
  tendGreenhouse,
  restockShop,
  advanceOperations,
} from "../src/operations.js";

function done(command) {
  assert.equal(command.ok, true, command.message);
  return command.state;
}
function initial() {
  return done(
    applyDecision(
      done(applyDecision(createCompany("Quinta da Ponte"), "legado")),
      "equilibrado",
    ),
  );
}
function dispatchFirst() {
  let state = done(buyFleetVehicle(initial()));
  const id = state.contracts[0].id;
  state = done(acceptContract(state, id));
  const payment = state.contracts.find((order) => order.id === id).payment;
  const cash = state.cash;
  state = done(dispatchFleet(state, id));
  return { state, id, payment, cash };
}

test("old version 3 saves gain operations and a previously purchased fleet becomes a real van", () => {
  const old = initial();
  delete old.operations;
  const migrated = ensureOperations(old);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.operations.fleet, []);
  assert.equal(migrated.operations.shop.stock, 0);
  assert.equal(migrated.operations.greenhouse.harvestedDay, 0);
  const upgraded = done(buyUpgrade(old, "fleet"));
  const withVan = ensureOperations(upgraded);
  assert.equal(withVan.operations.fleet.length, 1);
  assert.equal(withVan.operations.fleet[0].status, "idle");
  assert.equal(withVan.cash, old.cash - 1300);
  assert.deepEqual(
    normalizeCompany(JSON.parse(JSON.stringify(withVan))),
    withVan,
  );
});

test("fleet investments enforce budgets and three owned vehicles without charging twice for an old upgrade", () => {
  let state = initial();
  state.cash = 8000;
  const before = JSON.stringify(state);
  const first = done(buyFleetVehicle(state));
  assert.equal(JSON.stringify(state), before, "buy command is immutable");
  assert.equal(first.cash, 6700);
  assert.equal(first.operations.fleet.length, 1);
  state = done(buyFleetVehicle(first));
  assert.equal(state.cash, 4950);
  state = done(buyFleetVehicle(state));
  assert.equal(state.cash, 2750);
  assert.equal(state.operations.fleet.length, 3);
  const fourth = buyFleetVehicle(state);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.state.cash, state.cash);
  assert.equal(getOperationsView(state).canBuyFleet, false);
  const poor = initial();
  poor.cash = 1299;
  assert.equal(buyFleetVehicle(poor).ok, false);
  assert.equal(poor.operations.fleet.length, 0);
});

test("dispatch requires reserved stock, a free vehicle and operating cash, and cannot be repeated", () => {
  let state = initial();
  const id = state.contracts[0].id;
  assert.equal(dispatchFleet(state, id).ok, false);
  state = done(acceptContract(state, id));
  assert.equal(dispatchFleet(state, id).ok, false, "no van");
  state = done(buyFleetVehicle(state));
  const noCash = { ...state, cash: 0 };
  assert.equal(dispatchFleet(noCash, id).ok, false);
  const before = JSON.stringify(state);
  const dispatched = done(dispatchFleet(state, id));
  assert.equal(JSON.stringify(state), before);
  const order = dispatched.contracts.find((item) => item.id === id);
  assert.equal(order.fleetVehicleId, "van-1");
  assert.equal(
    dispatched.stock,
    state.stock,
    "dispatch does not reserve the same cargo twice",
  );
  assert.equal(dispatched.cash, state.cash - (12 + order.quantity * 0.2));
  assert.equal(dispatchFleet(dispatched, id).ok, false);
  assert.equal(
    deliverContract(dispatched, id).ok,
    false,
    "driver owns the delivery while travelling",
  );
  assert.equal(
    getCompanyView(dispatched).contracts.find((item) => item.id === id)
      .fleetVehicleId,
    "van-1",
  );
});

test("autonomous delivery pays only at arrival and the van must return before another assignment", () => {
  const fixture = dispatchFirst();
  let state = fixture.state;
  const van = state.operations.fleet[0];
  const afterDispatch = state.cash;
  assert.equal(state.completedDeliveries, 0);
  state = done(advanceOperations(state, van.duration - 0.1));
  assert.equal(state.cash, afterDispatch);
  assert.equal(state.operations.fleet[0].status, "outbound");
  state = done(advanceOperations(state, 0.1));
  assert.equal(state.cash, afterDispatch + fixture.payment);
  assert.equal(state.completedDeliveries, 1);
  assert.equal(state.operations.fleetDeliveries, 1);
  assert.equal(state.operations.fleet[0].status, "returning");
  assert.equal(
    state.contracts.find((order) => order.id === fixture.id).status,
    "delivered",
  );
  assert.equal(deliverContract(state, fixture.id).ok, false);
  const secondId = state.contracts.find(
    (order) => order.status === "available",
  ).id;
  state = done(acceptContract(state, secondId));
  assert.equal(
    dispatchFleet(state, secondId).ok,
    false,
    "the vehicle has not returned",
  );
  state = done(advanceOperations(state, van.duration));
  assert.equal(state.operations.fleet[0].status, "idle");
  assert.equal(state.operations.fleet[0].contractId, null);
  assert.equal(
    state.cash,
    afterDispatch + fixture.payment,
    "return earns no extra payment",
  );
  state = done(advanceOperations(state, 300));
  assert.equal(
    state.completedDeliveries,
    1,
    "idle simulation cannot mint contract payments",
  );
  assert.equal(dispatchFleet(state, secondId).ok, true);
});

test("multiple fleet deliveries and a large active-time step pay each real contract once", () => {
  let state = initial();
  state.cash = 10000;
  state.stock = 500;
  state = done(
    buyFleetVehicle(done(buyFleetVehicle(done(buyFleetVehicle(state))))),
  );
  const ids = state.contracts.map((contract) => contract.id);
  const payments = state.contracts.reduce(
    (sum, contract) => sum + contract.payment,
    0,
  );
  for (const id of ids)
    state = done(dispatchFleet(done(acceptContract(state, id)), id));
  const before = state.cash;
  state = done(advanceOperations(state, 300));
  assert.equal(state.cash, before + payments);
  assert.equal(state.completedDeliveries, 3);
  assert(state.operations.fleet.every((van) => van.status === "idle"));
  const again = done(advanceOperations(state, 300));
  assert.equal(again.cash, state.cash);
  assert.equal(again.completedDeliveries, 3);
});

test("closing a day beyond a driver's contract deadline forfeits cargo and never pays later", () => {
  let { state, id } = dispatchFirst();
  state.contracts.find((order) => order.id === id).deadlineDay = state.day;
  const next = advanceDay(state);
  assert.equal(next.ok, true, next.message);
  state = next.state;
  const cash = state.cash;
  assert.equal(
    state.contracts.find((order) => order.id === id).status,
    "failed",
  );
  state = done(advanceOperations(state, 300));
  assert.equal(state.cash, cash);
  assert.equal(state.completedDeliveries, 0);
  assert.equal(state.operations.fleet[0].status, "idle");
  assert.equal(state.contracts.find((order) => order.id === id).reserved, 0);
});

test("negotiating generates one priced offer per client per day and acceptance reserves real stock", () => {
  let state = initial();
  const before = JSON.stringify(state);
  const negotiation = negotiateClient(state, "marta", "fair");
  assert.equal(negotiation.ok, true, negotiation.message);
  assert.equal(JSON.stringify(state), before);
  state = negotiation.state;
  const offer = state.contracts.find(
    (order) => order.id === negotiation.contractId,
  );
  assert.equal(offer.status, "available");
  assert.equal(offer.destination, "cooperativa");
  assert.equal(offer.clientName, "Marta Silva");
  assert.equal(state.stock, 90);
  assert.equal(state.cash, 2500);
  assert.equal(negotiateClient(state, "marta", "volume").ok, false);
  const accepted = done(acceptContract(state, offer.id));
  assert.equal(accepted.stock, state.stock - offer.quantity);
  assert.equal(accepted.cash, state.cash);
  const following = done(advanceDay(accepted));
  const nextNegotiation = negotiateClient(following, "marta", "volume");
  assert.equal(nextNegotiation.ok, true, nextNegotiation.message);
  assert.notEqual(nextNegotiation.contractId, negotiation.contractId);
});

test("client requirements reject unrealistic premium/export offers and viable approaches differ in size and price", () => {
  let state = initial();
  assert.equal(negotiateClient(state, "artur", "fair").ok, false);
  assert.equal(negotiateClient(state, "leonor", "fair").ok, false);
  assert.equal(negotiateClient(state, "unknown", "fair").ok, false);
  assert.equal(negotiateClient(state, "rui", "unknown").ok, false);
  state.quality = 90;
  state.reputation = 80;
  const client = getOperationsView(state).clients.find(
    (item) => item.id === "sofia",
  );
  const fair = client.offers.find((offer) => offer.id === "fair");
  const premium = client.offers.find((offer) => offer.id === "premium");
  const volume = client.offers.find((offer) => offer.id === "volume");
  assert(premium.payment / premium.quantity > fair.payment / fair.quantity);
  assert(volume.quantity > fair.quantity);
  assert.equal(negotiateClient(state, "artur", "premium").ok, true);
});

test("watering and harvesting are finite physical tasks and watering improves the manual yield", () => {
  const state = initial();
  const dryHarvest = done(tendGreenhouse(state, "harvest"));
  const watered = done(tendGreenhouse(state, "water"));
  assert.equal(watered.cash, state.cash - 8);
  assert.equal(watered.quality, state.quality + 1);
  assert.equal(tendGreenhouse(watered, "water").ok, false);
  const harvest = done(tendGreenhouse(watered, "harvest"));
  assert(
    harvest.operations.greenhouse.lastHarvest >
      dryHarvest.operations.greenhouse.lastHarvest,
  );
  assert.equal(
    harvest.stock - state.stock,
    harvest.operations.greenhouse.lastHarvest,
  );
  assert.equal(tendGreenhouse(harvest, "harvest").ok, false);
  assert.equal(tendGreenhouse(harvest, "unknown").ok, false);
  const nextDay = done(advanceDay(harvest));
  assert.equal(tendGreenhouse(nextDay, "water").ok, true);
  assert.equal(tendGreenhouse(nextDay, "harvest").ok, true);
  const efficient = done(buyUpgrade(state, "irrigation"));
  assert.equal(
    efficient.cash - done(tendGreenhouse(efficient, "water")).cash,
    3,
  );
});

test("a full greenhouse store or empty treasury blocks work without losing crates or money", () => {
  const state = initial();
  state.stock = getCompanyView(state).stats.storageLimit;
  const blocked = tendGreenhouse(state, "harvest");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state.stock, state.stock);
  state.cash = 0;
  const water = tendGreenhouse(state, "water");
  assert.equal(water.ok, false);
  assert.equal(water.state.quality, state.quality);
});

test("shop restocking transfers existing crates, sells over active time, and stops when shelves empty", () => {
  let state = initial();
  state = done(advanceOperations(state, 500));
  const initialCash = state.cash;
  const initialStock = state.stock;
  const before = JSON.stringify(state);
  const restocked = done(restockShop(state, 3));
  assert.equal(JSON.stringify(state), before);
  state = restocked;
  assert.equal(state.stock, initialStock - 3);
  assert.equal(state.cash, initialCash, "stocking itself is not a sale");
  state = done(advanceOperations(state, 7));
  assert.equal(
    state.operations.shop.stock,
    3,
    "empty shop time was not banked",
  );
  const price = getOperationsView(state).shop.price;
  state = done(advanceOperations(state, 1));
  assert.equal(state.operations.shop.stock, 2);
  assert.equal(state.cash, initialCash + price);
  state = done(advanceOperations(state, 100));
  assert.equal(state.operations.shop.stock, 0);
  assert.equal(state.operations.shop.sold, 3);
  assert.equal(
    state.operations.shop.revenue,
    Math.round(3 * price * 100) / 100,
  );
  const cash = state.cash;
  state = done(advanceOperations(state, 500));
  assert.equal(state.cash, cash, "no sales without real stock");
  assert.equal(
    restockShop(state, initialStock).ok,
    false,
    "cannot double-use shop or reserved stock",
  );
  assert.equal(restockShop(state, -2).ok, false);
  assert.equal(restockShop(state, 1.5).ok, false);
});

test("shop capacity prevents inventory overflow and dispatch cannot consume shelf stock", () => {
  let state = initial();
  state.stock = 150;
  state = done(restockShop(state, 120));
  assert.equal(restockShop(state, 1).ok, false);
  const order = state.contracts.find(
    (contract) => contract.quantity > state.stock,
  );
  assert(order);
  assert.equal(acceptContract(state, order.id).ok, false);
  assert.equal(state.operations.shop.stock, 120);
});

test("mid-route and retail saves restore exactly and yield the same deterministic completion", () => {
  let { state } = dispatchFirst();
  state = done(restockShop(state, 12));
  state = done(tendGreenhouse(state, "water"));
  state = done(advanceOperations(state, 13));
  state = done(negotiateClient(state, "rui", "fair"));
  const saved = JSON.parse(JSON.stringify(state));
  const restored = ensureOperations(saved);
  assert.deepEqual(restored.operations, state.operations);
  assert.deepEqual(restored.contracts, state.contracts);
  assert.deepEqual(
    done(advanceOperations(restored, 120)),
    done(advanceOperations(state, 120)),
  );
});

test("normalization rejects duplicate fleet assignments and invalid simulation time never changes money", () => {
  let { state, id } = dispatchFirst();
  state.operations.fleet.push({ ...state.operations.fleet[0], id: "van-2" });
  state = ensureOperations(state);
  assert.equal(
    state.operations.fleet.filter((van) => van.status === "outbound").length,
    1,
  );
  const after = done(advanceOperations(state, 300));
  assert.equal(after.completedDeliveries, 1);
  assert.equal(
    after.contracts.find((contract) => contract.id === id).status,
    "delivered",
  );
  assert.equal(advanceOperations(after, -1).ok, false);
  assert.equal(advanceOperations(after, Infinity).ok, false);
  assert.equal(advanceOperations(after, NaN).ok, false);
  assert.equal(done(advanceOperations(after, 0)).cash, after.cash);
});

test("a physically blocked van pauses both journey legs while the shop and other drivers continue", () => {
  let state = initial();
  state.cash = 10000;
  state.stock = 500;
  state = done(buyFleetVehicle(done(buyFleetVehicle(state))));
  const [first, second] = state.contracts;
  for (const contract of [first, second]) {
    state = done(
      dispatchFleet(done(acceptContract(state, contract.id)), contract.id),
    );
  }
  state = done(restockShop(state, 3));
  const before = JSON.parse(JSON.stringify(state));
  const cash = state.cash;
  const firstDuration = state.operations.fleet[0].duration;
  state = done(advanceOperations(state, 120, { pausedFleetIds: ["van-1"] }));
  assert.deepEqual(
    before.operations.fleet[0],
    state.operations.fleet[0],
    "blocked outbound van never consumes travel time",
  );
  assert.equal(state.operations.clock, before.operations.clock + 120);
  assert.equal(state.operations.shop.sold, 3);
  assert.equal(state.operations.shop.stock, 0);
  assert.equal(
    state.operations.fleet[1].status,
    "idle",
    "unblocked driver completes delivery and returns",
  );
  assert.equal(state.completedDeliveries, 1);
  assert.equal(
    state.cash,
    Math.round((cash + second.payment + state.operations.shop.revenue) * 100) /
      100,
  );
  state = done(advanceOperations(state, firstDuration - 1));
  assert.equal(
    state.completedDeliveries,
    1,
    "paused time is never banked for later",
  );
  state = done(advanceOperations(state, 1));
  assert.equal(state.completedDeliveries, 2);
  assert.equal(state.operations.fleet[0].status, "returning");
  const paidCash = state.cash;
  state = done(advanceOperations(state, 300, { pausedFleetIds: ["van-1"] }));
  assert.equal(state.operations.fleet[0].status, "returning");
  assert.equal(
    state.operations.fleet[0].remaining,
    firstDuration,
    "blocked return cannot make the van available early",
  );
  assert.equal(
    state.cash,
    paidCash,
    "holding a return earns no duplicate payment",
  );
  state = done(advanceOperations(state, firstDuration));
  assert.equal(state.operations.fleet[0].status, "idle");
  assert.equal(state.completedDeliveries, 2);
  assert.equal(state.cash, paidCash);
});

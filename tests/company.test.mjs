import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompany,
  normalizeCompany,
  getCompanyView,
  applyDecision,
  advanceDay,
  acceptContract,
  deliverContract,
  buyUpgrade,
} from "../src/company.js";

function decide(state, id) {
  const result = applyDecision(state, id);
  assert.equal(result.ok, true, result.message);
  return result.state;
}
function settleOffers(state, skipDestination) {
  for (const order of getCompanyView(state).contracts) {
    if (order.status !== "available" || order.destination === skipDestination)
      continue;
    const accepted = acceptContract(state, order.id);
    if (accepted.ok) {
      const delivered = deliverContract(accepted.state, order.id);
      assert(delivered.ok);
      state = delivered.state;
    }
  }
  return state;
}
function initial(mode = "equilibrado") {
  return decide(decide(createCompany(), "legado"), mode);
}
function story(plan, { deliveries = true, skipDestination } = {}) {
  let state = createCompany();
  let guard = 0;
  while (!state.ending && guard++ < 35) {
    let view = getCompanyView(state);
    while (view.event?.ready && !state.ending) {
      const wanted = plan.find((id) =>
        view.decisions.some((choice) => choice.id === id && !choice.disabled),
      );
      const choice = wanted || view.decisions.find((c) => !c.disabled)?.id;
      assert(choice, `No affordable option at ${view.event.id}`);
      state = decide(state, choice);
      view = getCompanyView(state);
    }
    if (state.ending) break;
    if (deliveries) state = settleOffers(state, skipDestination);
    const next = advanceDay(state);
    assert(next.ok, next.message);
    state = next.state;
  }
  assert(state.ending, "Story should reach an ending");
  return state;
}

test("new company has a named legacy, five chapter story and executable delivery offers", () => {
  const state = createCompany("Tomates do Vale");
  const view = getCompanyView(state);
  assert.equal(state.name, "Tomates do Vale");
  assert.equal(state.version, 3);
  assert.equal(state.cash, 2500);
  assert.equal(state.debt, 5000);
  assert.match(view.chapterLabel, /1 \/ 5/);
  assert.equal(view.event.id, "heranca");
  assert.equal(view.contracts.length, 3);
  assert(
    view.contracts.every(
      (c) => c.destination && c.quantity > 0 && c.payment > 0,
    ),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test("story actions are immutable, one-time, and constrained to the current event", () => {
  const state = createCompany();
  const before = JSON.stringify(state);
  const next = applyDecision(state, "nova-marca");
  assert(next.ok);
  assert.equal(JSON.stringify(state), before);
  assert.equal(next.state.cash, 2200);
  assert.equal(next.state.eventIndex, 1);
  const repeat = applyDecision(next.state, "nova-marca");
  assert.equal(repeat.ok, false);
  assert.equal(repeat.state.cash, 2200);
  assert.equal(applyDecision(state, "vender-maioria").ok, false);
});

test("ready narrative decisions must be resolved and later chapters wait for the correct day", () => {
  const blocked = advanceDay(createCompany());
  assert.equal(blocked.ok, false);
  const state = initial();
  const view = getCompanyView(state);
  assert.equal(view.event.id, "parceiro");
  assert.equal(view.event.ready, false);
  assert(view.decisions.every((c) => c.disabled && c.reason.includes("dia 2")));
  assert.equal(applyDecision(state, "cooperativa").ok, false);
  const next = advanceDay(state);
  assert(next.ok);
  assert.equal(next.state.day, 2);
  assert.equal(getCompanyView(next.state).event.ready, true);
});

test("organic and intensive cultivation produce different harvests and environmental outcomes", () => {
  const organic = advanceDay(initial("biologico")),
    intensive = advanceDay(initial("intensivo"));
  assert(organic.ok && intensive.ok);
  assert(organic.state.quality > intensive.state.quality);
  assert(organic.state.sustainability - intensive.state.sustainability > 40);
  assert(intensive.report.produced > organic.report.produced * 1.3);
  assert(organic.report.costs > 0 && intensive.report.costs > 0);
});

test("accepting reserves stock, delivery earns once, and duplicated actions cannot mint money", () => {
  const state = initial();
  const order = state.contracts[0];
  const accepted = acceptContract(state, order.id);
  assert(accepted.ok);
  assert.equal(accepted.state.cash, state.cash);
  assert.equal(accepted.state.stock, state.stock - order.quantity);
  assert.equal(getCompanyView(accepted.state).stats.reserved, order.quantity);
  assert.equal(state.contracts[0].status, "available");
  assert.equal(acceptContract(accepted.state, order.id).ok, false);
  const delivered = deliverContract(accepted.state, order.id);
  assert(delivered.ok);
  assert.equal(delivered.state.cash, state.cash + order.payment);
  assert.equal(delivered.state.completedDeliveries, 1);
  assert.equal(delivered.state.destinationDeliveries.cooperativa, 1);
  assert.equal(getCompanyView(delivered.state).stats.reserved, 0);
  const duplicate = deliverContract(delivered.state, order.id);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state.cash, delivered.state.cash);
});

test("an offer cannot be accepted without enough unreserved crates", () => {
  const state = initial();
  state.stock = state.contracts[0].quantity - 1;
  const result = acceptContract(state, state.contracts[0].id);
  assert.equal(result.ok, false);
  assert.equal(result.state.stock, state.stock);
  assert.equal(result.state.contracts[0].status, "available");
  assert.equal(deliverContract(state, state.contracts[0].id).ok, false);
});

test("late contracts fail with a visible penalty and cannot be delivered afterward", () => {
  let state = initial();
  const id = state.contracts[0].id;
  state = acceptContract(state, id).state;
  state = advanceDay(state).state;
  state = decide(state, "cooperativa");
  state = advanceDay(state).state;
  state = decide(state, "equipa-atual");
  const before = state.cash;
  const next = advanceDay(state);
  assert(next.ok);
  assert.equal(next.state.day, 4);
  assert.equal(next.report.expired, 1);
  assert(next.report.penalties > 0);
  assert.equal(next.state.contracts.find((c) => c.id === id).status, "failed");
  assert(next.state.cash < before);
  assert.equal(deliverContract(next.state, id).ok, false);
});

test("investments spend cash and enforce levels instead of duplicating improvements", () => {
  const state = initial();
  const installed = buyUpgrade(state, "irrigation");
  assert(installed.ok);
  assert.equal(installed.state.cash, state.cash - 550);
  assert.equal(installed.state.upgrades.irrigation, 1);
  assert(installed.state.flags.waterEfficient);
  assert(installed.state.sustainability > state.sustainability);
  const duplicate = buyUpgrade(installed.state, "irrigation");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state.cash, installed.state.cash);
  const poor = { ...state, cash: 100 };
  assert.equal(buyUpgrade(poor, "greenhouse").ok, false);
  assert.equal(buyUpgrade(state, "unknown").ok, false);
});

test("day closing pays wages and interest, produces stock, and reports storage losses", () => {
  const state = initial();
  state.stock = 345;
  const result = advanceDay(state);
  assert(result.ok);
  assert(result.report.produced > 0);
  assert.equal(result.report.wages, 90);
  assert.equal(result.report.interest, 7.5);
  assert.equal(result.state.cash, state.cash - result.report.costs);
  assert.equal(result.state.debt, state.debt);
  assert(result.report.spoiled > 0);
  assert.equal(
    result.state.stock,
    getCompanyView(result.state).stats.storageLimit,
  );
});

test("cash shortage becomes recorded emergency debt rather than negative cash or a silent reset", () => {
  const state = initial();
  state.cash = 0;
  const result = advanceDay(state);
  assert(result.ok);
  assert.equal(result.state.cash, 0);
  assert(result.state.debt > 5000);
  assert(result.report.shortage > 0);
  assert.equal(result.state.insolventDays, 1);
  assert.match(result.state.history.at(-1).body, /dívida de emergência/);
});

test("save restoration keeps the exact decision branch, accepted cargo and deterministic next harvest", () => {
  const state = acceptContract(initial("biologico"), "dia-1-mercado").state;
  const restored = normalizeCompany(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.productionMode, "organic");
  assert.equal(restored.eventIndex, state.eventIndex);
  assert.equal(
    restored.contracts.find((c) => c.id === "dia-1-mercado").status,
    "accepted",
  );
  assert.deepEqual(advanceDay(restored), advanceDay(state));
});

test("daily contracts are replaced with new identities and never grant a passive cash payout", () => {
  const state = initial();
  const next = advanceDay(state).state;
  assert(next.cash < state.cash);
  assert.equal(next.revenue, 0);
  const available = getCompanyView(next).contracts.filter(
    (c) => c.status === "available",
  );
  assert(available.length === 3);
  assert(available.every((c) => c.id.startsWith("dia-2-")));
  assert.equal(acceptContract(next, "dia-1-mercado").ok, false);
});

test("ethical local choices and a corporate sale lead to distinct durable endings", () => {
  const local = story([
    "legado",
    "biologico",
    "cooperativa",
    "contrato-justo",
    "preco-bairro",
    "partilhar-agua",
    "sem-financiamento",
    "portas-abertas",
    "rede-local",
    "renegociar-turnos",
    "empresa-independente",
    "promessa-cuidado",
  ]);
  const corporate = story([
    "nova-marca",
    "intensivo",
    "agronorte",
    "temporarios",
    "marca-volume",
    "agua-emergencia",
    "credito",
    "campanha-imagem",
    "exportar",
    "automatizar",
    "vender-maioria",
    "promessa-escala",
  ]);
  assert.equal(local.ending.id, "raizes-da-cidade");
  assert(local.completedDeliveries >= 6);
  assert.equal(corporate.ending.id, "nome-na-fachada");
  assert(local.trust > corporate.trust);
  assert(local.sustainability > corporate.sustainability);
  assert(corporate.equity >= 0.5);
  assert.equal(local.decisions.length, 12);
  assert.equal(corporate.decisions.length, 12);
  assert.equal(local.day, 11);
  assert.equal(corporate.day, 11);
  assert(local.cash >= 0 && corporate.cash >= 0);
  assert.deepEqual(
    normalizeCompany(JSON.parse(JSON.stringify(local))).ending,
    local.ending,
  );
});

test("a prior irrigation investment is reused in the drought decision without a second charge", () => {
  let state = buyUpgrade(initial(), "irrigation").state;
  state = advanceDay(state).state;
  state = decide(state, "cooperativa");
  state = advanceDay(state).state;
  state = decide(state, "equipa-atual");
  state = advanceDay(state).state;
  state = decide(state, "preco-bairro");
  state = advanceDay(state).state;
  assert.equal(state.day, 5);
  const view = getCompanyView(state);
  const choice = view.decisions.find((c) => c.id === "rega-eficiente");
  assert.match(choice.effects, /Sem custo/);
  const next = applyDecision(state, "rega-eficiente");
  assert(next.ok);
  assert.equal(next.state.cash, state.cash);
  assert.equal(next.state.capacity, state.capacity);
  assert.equal(next.state.upgrades.irrigation, 1);
});

test("an ethical company with no customers gets a developing ending, not a thriving city network", () => {
  const plan = [
    "legado",
    "biologico",
    "cooperativa",
    "contrato-justo",
    "preco-bairro",
    "partilhar-agua",
    "sem-financiamento",
    "portas-abertas",
    "rede-local",
    "renegociar-turnos",
    "empresa-independente",
    "promessa-cuidado",
  ];
  const quiet = story(plan, { deliveries: false });
  const active = story(plan);
  assert.equal(quiet.completedDeliveries, 0);
  assert.equal(quiet.ending.id, "primeira-rede");
  assert.match(quiet.ending.body, /nenhuma caixa chegou/);
  assert.equal(active.ending.id, "raizes-da-cidade");
  assert.equal(
    quiet.day,
    11,
    "The story remains completable without forcing a delivery grind",
  );
});

test("export success requires actual port customers rather than the export choice alone", () => {
  const plan = [
    "legado",
    "equilibrado",
    "independente",
    "contrato-justo",
    "marca-premium",
    "rega-eficiente",
    "investidora",
    "analise-independente",
    "exportar",
    "automatizar",
    "empresa-independente",
    "promessa-escala",
  ];
  const exporter = story(plan);
  const domestic = story(plan, { skipDestination: "porto" });
  assert(exporter.completedDeliveries >= 9);
  assert(exporter.destinationDeliveries.porto >= 1);
  assert.equal(exporter.ending.id, "sabor-sem-fronteiras");
  assert.equal(domestic.flags.exports, true);
  assert.equal(domestic.destinationDeliveries.porto, 0);
  assert.notEqual(domestic.ending.id, "sabor-sem-fronteiras");
  const restored = normalizeCompany(JSON.parse(JSON.stringify(exporter)));
  assert.deepEqual(
    restored.destinationDeliveries,
    exporter.destinationDeliveries,
  );
});

import { normalizeCompany, buyUpgrade, deliverContract } from "./company.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const euro = (value) => `${Math.round(value).toLocaleString("pt-PT")} €`;
const FLEET_COSTS = [1300, 1750, 2200];
const TRAVEL_SECONDS = {
  cooperativa: 45,
  mercado: 52,
  restaurantes: 62,
  porto: 80,
  universidade: 70,
};
const CLIENTS = [
  {
    id: "marta",
    name: "Marta Silva",
    role: "Agrónoma da cooperativa",
    destination: "cooperativa",
    locationLabel: "Cooperativa do Vale",
    dialogue:
      "Os vizinhos contam com caixas frescas e um preço estável. O que consegues garantir?",
    quantity: 24,
    quality: 35,
    reputation: 15,
    multiplier: 1,
  },
  {
    id: "rui",
    name: "Rui Costa",
    role: "Distribuidor do Mercado Central",
    destination: "mercado",
    locationLabel: "Mercado Central",
    dialogue:
      "Tenho bancas à espera de produto. Podemos trabalhar em volume ou destacar uma colheita especial.",
    quantity: 28,
    quality: 40,
    reputation: 20,
    multiplier: 1.04,
  },
  {
    id: "sofia",
    name: "Sofia Almeida",
    role: "Chef e compradora dos restaurantes",
    destination: "restaurantes",
    locationLabel: "Praça dos Restaurantes",
    dialogue:
      "Na cozinha, o sabor vem primeiro. Se a qualidade justificar, pago mais por cada caixa.",
    quantity: 22,
    quality: 50,
    reputation: 25,
    multiplier: 1.15,
  },
  {
    id: "artur",
    name: "Artur Faria",
    role: "Comprador de exportação da AgroNorte",
    destination: "porto",
    locationLabel: "Terminal de Exportação",
    dialogue:
      "O porto precisa de lotes consistentes. Mostra que a tua empresa consegue cumprir antes de prometer grandes volumes.",
    quantity: 40,
    quality: 65,
    reputation: 45,
    multiplier: 1.3,
  },
  {
    id: "leonor",
    name: "Dra. Leonor",
    role: "Investigadora e compradora do instituto",
    destination: "universidade",
    locationLabel: "Universidade Agrícola",
    dialogue:
      "Procuramos tomates com qualidade e rastreabilidade. Um bom lote abre a porta a uma relação de investigação.",
    quantity: 16,
    quality: 75,
    reputation: 40,
    multiplier: 1.35,
  },
];
const OFFER_STYLES = [
  {
    id: "fair",
    label: "Propor um acordo justo",
    description: "Um lote regular, com preço e qualidade equilibrados.",
    quantity: 1,
    price: 1,
    quality: 0,
    reputation: 0,
  },
  {
    id: "premium",
    label: "Negociar uma seleção premium",
    description:
      "Menos caixas, maior valor por caixa e requisitos de qualidade mais altos.",
    quantity: 0.75,
    price: 1.4,
    quality: 12,
    reputation: 10,
  },
  {
    id: "volume",
    label: "Propor fornecimento em volume",
    description:
      "Um lote maior com desconto por caixa, para criar uma relação de fornecimento.",
    quantity: 1.7,
    price: 0.9,
    quality: -5,
    reputation: 0,
  },
];

function result(ok, state, message, extra = {}) {
  return { ok, state, message, ...extra };
}
function log(state, title, body, kind = "operations") {
  state.history.push({ day: state.day, title, body, kind });
  state.history = state.history.slice(-100);
}
function retailPrice(state) {
  return round(7 + state.quality * 0.025 + state.reputation * 0.01);
}
function harvestYield(state) {
  return Math.max(
    8,
    Math.floor(
      state.capacity *
        (state.operations.greenhouse.wateredDay === state.day ? 0.22 : 0.12),
    ),
  );
}
function storageLimit(state) {
  return 280 + state.land * 70 + (state.upgrades.coldstore || 0) * 350;
}
function waterCost(state) {
  return state.upgrades.irrigation ? 3 : 8;
}
function clientOffers(state, client) {
  const negotiated =
    state.operations.negotiations[client.id]?.day === state.day;
  return OFFER_STYLES.map((style) => {
    const quantity = Math.max(8, Math.round(client.quantity * style.quantity));
    const price =
      (4.7 + state.quality * 0.025 + state.reputation * 0.012) *
      client.multiplier *
      style.price *
      (state.upgrades.fleet ? 1.1 : 1);
    const minQuality = client.quality + style.quality;
    const minReputation = client.reputation + style.reputation;
    const reason = negotiated
      ? "Já negociaste com este cliente hoje. Regressa no próximo dia."
      : state.quality < minQuality
        ? `Este acordo exige qualidade ${minQuality} (tens ${Math.round(state.quality)}).`
        : state.reputation < minReputation
          ? `Este acordo exige reputação ${minReputation} (tens ${Math.round(state.reputation)}).`
          : "";
    return {
      id: style.id,
      label: style.label,
      description: style.description,
      quantity,
      payment: Math.round(quantity * price),
      minQuality,
      minReputation,
      disabled: !!reason,
      reason,
    };
  });
}

/** Upgrade old v3 campaigns lazily and return an independent, JSON-safe state. */
export function ensureOperations(company) {
  return normalizeCompany(company);
}

export function getOperationsView(company) {
  const state = ensureOperations(company);
  const operations = state.operations;
  const waterReason =
    operations.greenhouse.wateredDay === state.day
      ? "Já regaste esta estufa hoje."
      : state.cash < waterCost(state)
        ? `Precisas de ${euro(waterCost(state))} para água e manutenção.`
        : "";
  const harvestReason =
    operations.greenhouse.harvestedDay === state.day
      ? "Já recolheste a colheita manual de hoje. A equipa continua a produção no fecho do dia."
      : state.stock >= storageLimit(state)
        ? "O armazém está cheio. Entrega ou vende caixas antes de colher."
        : "";
  const restockReason =
    operations.shop.stock >= 120
      ? "As prateleiras estão cheias."
      : state.stock < 1
        ? "Não há caixas livres no armazém."
        : "";
  const fleetCost = FLEET_COSTS[operations.fleet.length] || null;
  const fleetReason =
    operations.fleet.length >= 3
      ? "A frota já tem três carrinhas."
      : state.cash < fleetCost
        ? `Precisas de ${euro(fleetCost)} para a próxima carrinha e motorista.`
        : "";
  return {
    fleet: operations.fleet.map((vehicle) => ({
      ...vehicle,
      progress:
        vehicle.status === "idle"
          ? 0
          : clamp(1 - vehicle.remaining / vehicle.duration, 0, 1),
      elapsed: vehicle.duration - vehicle.remaining,
      contractTitle:
        state.contracts.find((contract) => contract.id === vehicle.contractId)
          ?.title || "",
    })),
    fleetCost,
    fleetMax: 3,
    canBuyFleet: !fleetReason,
    fleetReason,
    fleetDeliveries: operations.fleetDeliveries,
    fleetCosts: operations.fleetCosts,
    shop: {
      ...operations.shop,
      capacity: 120,
      price: retailPrice(state),
      nextSaleIn: operations.shop.stock
        ? round(8 - operations.shop.elapsed)
        : null,
      canRestock: !restockReason,
      restockReason,
    },
    greenhouse: {
      ...operations.greenhouse,
      wateredToday: operations.greenhouse.wateredDay === state.day,
      harvestedToday: operations.greenhouse.harvestedDay === state.day,
      waterCost: waterCost(state),
      harvestYield: Math.min(
        harvestYield(state),
        Math.max(0, storageLimit(state) - state.stock),
      ),
      canWater: !waterReason,
      canHarvest: !harvestReason,
      waterReason,
      harvestReason,
    },
    clients: CLIENTS.map((client) => ({
      id: client.id,
      name: client.name,
      role: client.role,
      destination: client.destination,
      locationLabel: client.locationLabel,
      dialogue: client.dialogue,
      offers: clientOffers(state, client),
      negotiatedToday: operations.negotiations[client.id]?.day === state.day,
      contractId:
        operations.negotiations[client.id]?.day === state.day
          ? operations.negotiations[client.id].contractId
          : null,
    })),
    dispatchableContracts: state.contracts
      .filter(
        (contract) =>
          contract.status === "accepted" &&
          !contract.fleetVehicleId &&
          state.day <= contract.deadlineDay,
      )
      .map((contract) => ({
        ...contract,
        dispatchCost: round(12 + contract.quantity * 0.2),
        travelSeconds: TRAVEL_SECONDS[contract.destination] || 60,
      })),
    clock: operations.clock,
  };
}

export function buyFleetVehicle(company) {
  const state = ensureOperations(company);
  const count = state.operations.fleet.length;
  if (count >= 3)
    return result(false, state, "A frota já tem três carrinhas e motoristas.");
  const cost = FLEET_COSTS[count];
  if (state.cash < cost)
    return result(
      false,
      state,
      `Precisas de ${euro(cost)} para contratar a próxima carrinha e motorista.`,
    );
  if (count === 0) {
    const upgraded = buyUpgrade(state, "fleet");
    if (!upgraded.ok) return upgraded;
    const next = ensureOperations(upgraded.state);
    return result(
      true,
      next,
      "Primeira carrinha e motorista contratados. Aceita uma encomenda e atribui-a à frota.",
    );
  }
  const next = clone(state);
  next.cash = round(next.cash - cost);
  next.expenses = round(next.expenses + cost);
  next.operations.fleet.push({});
  next.reputation = Math.min(100, next.reputation + 1);
  const normalized = ensureOperations(next);
  log(
    normalized,
    "A frota cresceu",
    `Carrinha ${count + 1} e motorista contratados por ${euro(cost)}.`,
    "upgrade",
  );
  return result(
    true,
    normalized,
    `A frota tem agora ${count + 1} carrinhas com motorista.`,
  );
}

export function dispatchFleet(company, contractId) {
  const state = ensureOperations(company);
  const order = state.contracts.find((contract) => contract.id === contractId);
  if (!order || order.status !== "accepted")
    return result(
      false,
      state,
      "Aceita primeiro o contrato para reservar as caixas.",
    );
  if (order.fleetVehicleId)
    return result(false, state, "Esta entrega já está atribuída à frota.");
  if (state.day > order.deadlineDay)
    return result(
      false,
      state,
      "Esta entrega ultrapassou o prazo e não pode sair.",
    );
  const vehicle = state.operations.fleet.find((item) => item.status === "idle");
  if (!vehicle)
    return result(
      false,
      state,
      state.operations.fleet.length
        ? "Todas as carrinhas estão em viagem. Espera que uma regresse."
        : "Compra primeiro uma carrinha e contrata um motorista.",
    );
  const cost = round(12 + order.quantity * 0.2);
  if (state.cash < cost)
    return result(
      false,
      state,
      `Precisas de ${euro(cost)} para combustível e motorista desta viagem.`,
    );
  const next = clone(state);
  const van = next.operations.fleet.find((item) => item.id === vehicle.id);
  const contract = next.contracts.find((item) => item.id === contractId);
  const duration = TRAVEL_SECONDS[contract.destination] || 60;
  Object.assign(van, {
    status: "outbound",
    contractId,
    destination: contract.destination,
    duration,
    remaining: duration,
    dispatchCost: cost,
    tripId: van.tripId + 1,
  });
  contract.fleetVehicleId = van.id;
  next.cash = round(next.cash - cost);
  next.expenses = round(next.expenses + cost);
  next.operations.fleetCosts = round(next.operations.fleetCosts + cost);
  log(
    next,
    "Carrinha em distribuição",
    `${van.name} saiu para ${contract.title}. Combustível e motorista: ${euro(cost)}; pagamento ao chegar.`,
    "fleet",
  );
  return result(
    true,
    next,
    `${van.name} saiu com ${contract.quantity} caixas. A entrega será paga quando chegar ao cliente.`,
  );
}

export function negotiateClient(company, clientId, offerId) {
  const state = ensureOperations(company);
  const client = CLIENTS.find((item) => item.id === clientId);
  if (!client) return result(false, state, "Este cliente não está disponível.");
  const offer = clientOffers(state, client).find((item) => item.id === offerId);
  if (!offer)
    return result(false, state, "Escolhe uma proposta válida para negociar.");
  if (offer.disabled) return result(false, state, offer.reason);
  const next = clone(state);
  const contractId = `neg-${next.day}-${client.id}`;
  if (next.contracts.some((contract) => contract.id === contractId))
    return result(
      false,
      state,
      "Já existe uma proposta deste cliente para hoje.",
    );
  const title = `${client.name} · ${offerId === "premium" ? "Seleção premium" : offerId === "volume" ? "Fornecimento em volume" : "Acordo local"}`;
  next.contracts.push({
    id: contractId,
    title,
    destination: client.destination,
    quantity: offer.quantity,
    payment: offer.payment,
    status: "available",
    createdDay: next.day,
    deadlineDay: next.day + 2,
    reserved: 0,
    clientId,
    clientName: client.name,
    offerId,
    source: "negotiation",
  });
  next.operations.negotiations[client.id] = {
    day: next.day,
    contractId,
    offerId,
  };
  log(
    next,
    "Cliente negociado",
    `${client.name} aceitou a proposta: ${offer.quantity} caixas por ${euro(offer.payment)}. Aceita o contrato para reservar as caixas e organizar a entrega.`,
    "negotiation",
  );
  return result(
    true,
    next,
    `${client.name}: «Combinado. ${offer.quantity} caixas por ${euro(offer.payment)}.» A proposta está pronta a aceitar.`,
    { contractId },
  );
}

export function tendGreenhouse(company, action) {
  const state = ensureOperations(company);
  const view = getOperationsView(state).greenhouse;
  if (!["water", "harvest"].includes(action))
    return result(false, state, "Essa tarefa não existe na estufa.");
  const reason = action === "water" ? view.waterReason : view.harvestReason;
  if (reason) return result(false, state, reason);
  const next = clone(state);
  if (action === "water") {
    const cost = waterCost(next);
    next.cash = round(next.cash - cost);
    next.expenses = round(next.expenses + cost);
    next.quality = Math.min(100, round(next.quality + 1));
    next.operations.greenhouse.wateredDay = next.day;
    next.operations.greenhouse.waterings++;
    log(
      next,
      "Cuidado da estufa",
      `Regaste os tomateiros por ${euro(cost)}. Qualidade +1 e melhor rendimento na colheita manual de hoje.`,
      "greenhouse",
    );
    return result(
      true,
      next,
      `Tomateiros regados. Qualidade +1; a colheita manual de hoje terá mais caixas. Custo: ${euro(cost)}.`,
    );
  }
  const quantity = Math.min(
    harvestYield(next),
    Math.max(0, storageLimit(next) - next.stock),
  );
  next.stock += quantity;
  next.produced += quantity;
  next.operations.greenhouse.harvestedDay = next.day;
  next.operations.greenhouse.lastHarvest = quantity;
  next.operations.greenhouse.harvested += quantity;
  log(
    next,
    "Colheita na estufa",
    `Recolheste e separaste ${quantity} caixas de tomates. A colheita manual de hoje está no armazém.`,
    "greenhouse",
  );
  return result(
    true,
    next,
    `Colheste ${quantity} caixas. Agora podes abastecer a loja ou preparar entregas.`,
    { quantity },
  );
}

export function restockShop(company, quantity = 12) {
  const state = ensureOperations(company);
  const count = Number(quantity);
  if (!Number.isInteger(count) || count < 1 || count > 120)
    return result(
      false,
      state,
      "Escolhe entre 1 e 120 caixas inteiras para a loja.",
    );
  if (state.stock < count)
    return result(
      false,
      state,
      `Precisas de ${count} caixas livres no armazém.`,
    );
  if (state.operations.shop.stock + count > 120)
    return result(
      false,
      state,
      "As prateleiras não têm espaço para todas essas caixas (máximo 120).",
    );
  const next = clone(state);
  next.stock -= count;
  next.operations.shop.stock += count;
  log(
    next,
    "Loja abastecida",
    `${count} caixas foram do armazém para as prateleiras. A receita entra à medida que os clientes compram.`,
    "shop",
  );
  return result(
    true,
    next,
    `Colocaste ${count} caixas na loja. Os clientes compram durante a exploração.`,
  );
}

/** Active simulation time only. A physically blocked van keeps its own timer. */
export function advanceOperations(company, seconds, options = {}) {
  let state = ensureOperations(company);
  const delta = Number(seconds);
  if (!Number.isFinite(delta) || delta < 0)
    return result(false, state, "O intervalo de simulação não é válido.", {
      events: [],
    });
  if (delta === 0) return result(true, state, "", { events: [] });
  const dt = Math.min(delta, 3600);
  state.operations.clock = round(state.operations.clock + dt);
  const events = [];
  const pausedFleetIds = new Set(
    Array.isArray(options?.pausedFleetIds)
      ? options.pausedFleetIds.filter((id) => typeof id === "string")
      : [],
  );
  const vehicleIds = state.operations.fleet.map((vehicle) => vehicle.id);
  for (const id of vehicleIds) {
    if (pausedFleetIds.has(id)) continue;
    let remainingTime = dt;
    let vehicle = state.operations.fleet.find((item) => item.id === id);
    if (vehicle.status === "idle") continue;
    if (vehicle.status === "outbound") {
      const spent = Math.min(remainingTime, vehicle.remaining);
      vehicle.remaining = Math.max(0, round(vehicle.remaining - spent));
      remainingTime -= spent;
      if (vehicle.remaining > 0) continue;
      const contractId = vehicle.contractId;
      const order = state.contracts.find(
        (contract) => contract.id === contractId,
      );
      vehicle.status = "returning";
      vehicle.remaining = vehicle.duration;
      if (order) delete order.fleetVehicleId;
      const delivered = deliverContract(state, contractId);
      if (delivered.ok) {
        state = delivered.state;
        state.operations.fleetDeliveries++;
        const message = `${vehicle.name}: entrega concluída. ${euro(delivered.payment)} recebidos; a carrinha está a regressar.`;
        events.push(message);
        log(state, "Entrega da frota", message, "fleet");
      } else {
        const message = `${vehicle.name} regressa sem entrega: ${delivered.message}`;
        events.push(message);
        log(state, "Entrega da frota interrompida", message, "fleet");
      }
      vehicle = state.operations.fleet.find((item) => item.id === id);
    }
    if (vehicle.status === "returning") {
      vehicle.remaining = Math.max(0, round(vehicle.remaining - remainingTime));
      if (vehicle.remaining === 0) {
        Object.assign(vehicle, {
          status: "idle",
          contractId: null,
          destination: null,
          remaining: 0,
        });
        events.push(
          `${vehicle.name} regressou à sede e está disponível para outro contrato.`,
        );
      }
    }
  }
  const shop = state.operations.shop;
  if (shop.stock > 0) {
    shop.elapsed += dt;
    const sold = Math.min(shop.stock, Math.floor((shop.elapsed + 1e-7) / 8));
    if (sold > 0) {
      const revenue = round(sold * retailPrice(state));
      shop.stock -= sold;
      shop.sold += sold;
      shop.visitors += sold;
      shop.revenue = round(shop.revenue + revenue);
      shop.elapsed = shop.stock ? round(shop.elapsed - sold * 8) : 0;
      state.cash = round(state.cash + revenue);
      state.revenue = round(state.revenue + revenue);
      const message = `A loja vendeu ${sold} ${sold === 1 ? "caixa" : "caixas"}: +${euro(revenue)}.`;
      events.push(message);
      log(state, "Venda na loja", message, "shop");
    }
  } else shop.elapsed = 0;
  return result(true, state, events.join(" "), { events });
}

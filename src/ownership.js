import { normalizeCompany } from "./company.js";
import {
  CAR_CATALOG,
  PROPERTY_CATALOG,
  MILESTONE_DEFINITIONS,
  normalizeParking,
} from "./ownership-state.js";
export {
  CAR_CATALOG,
  PROPERTY_CATALOG,
  MILESTONE_DEFINITIONS,
} from "./ownership-state.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const precise = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};
const euro = (value) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
const FUEL_PRICE = 1.85;
const UPGRADE_COSTS = [350, 650, 950];
function result(ok, state, message, extra = {}) {
  return { ok, state, message, ...extra };
}
function log(state, title, body, kind = "ownership") {
  state.history.push({ day: state.day, title, body, kind });
  state.history = state.history.slice(-100);
}
function spend(state, cost, category) {
  state.cash = precise(state.cash - cost);
  state.expenses = precise(state.expenses + cost);
  state.ownership[category] = precise(state.ownership[category] + cost);
}
function repairCost(vehicle) {
  return vehicle.condition >= 100
    ? 0
    : Math.max(20, Math.ceil((100 - vehicle.condition) * 12 - 1e-8));
}
function fuelCost(litres) {
  return litres <= 0 ? 0 : Math.max(0.01, precise(litres * FUEL_PRICE));
}
function progress(state, metric) {
  switch (metric) {
    case "deliveries":
      return state.completedDeliveries;
    case "shop":
      return state.operations.shop.sold;
    case "cars":
      return state.ownership.vehicles.length;
    case "fleet":
      return state.operations.fleetDeliveries;
    case "properties":
      return state.ownership.properties.length;
    default:
      return 0;
  }
}
export function ensureOwnership(company) {
  return normalizeCompany(company);
}

export function getOwnershipView(company) {
  const state = ensureOwnership(company),
    ownership = state.ownership;
  const cars = CAR_CATALOG.map((model) => {
    const vehicle = ownership.vehicles.find(
      (entry) => entry.modelId === model.id,
    );
    const reason = vehicle
      ? "Este modelo já está na tua garagem."
      : state.cash < model.price
        ? "Precisas de " + euro(model.price) + " na tesouraria."
        : "";
    return {
      ...model,
      modelId: model.id,
      title: model.name,
      topSpeedKmh: precise(model.topSpeed * 3.6, 1),
      owned: !!vehicle,
      vehicleId: vehicle?.id || null,
      canBuy: !reason,
      reason,
    };
  });
  const vehicles = ownership.vehicles.map((vehicle) => {
    const model = CAR_CATALOG.find((entry) => entry.id === vehicle.modelId);
    const repair = repairCost(vehicle),
      missing = precise(vehicle.maxFuel - vehicle.fuel, 6),
      refuel = fuelCost(missing);
    const repairReason = !repair
      ? "O veículo está em bom estado."
      : state.cash < repair
        ? "Precisas de " + euro(repair) + " para a reparação."
        : "";
    const refuelReason = !missing
      ? "O depósito já está cheio."
      : state.cash < refuel
        ? "Precisas de " + euro(refuel) + " para encher o depósito."
        : "";
    return {
      ...vehicle,
      name: model.name,
      title: model.name,
      model: { ...model },
      topSpeed: model.topSpeed,
      topSpeedKmh: precise(model.topSpeed * 3.6, 1),
      acceleration: model.acceleration,
      handling: model.handling,
      braking: model.braking,
      litresPer100Km: model.litresPer100Km,
      distanceKm: precise(vehicle.odometer / 1000, 2),
      repairCost: repair,
      canRepair: !repairReason,
      repairReason,
      refuelCost: refuel,
      fuelPrice: FUEL_PRICE,
      litresToFill: missing,
      canRefuel: !refuelReason,
      refuelReason,
      drivable: vehicle.fuel > 0 && vehicle.condition > 0,
    };
  });
  const properties = PROPERTY_CATALOG.map((definition) => {
    const owned = ownership.properties.find(
      (entry) => entry.id === definition.id,
    );
    const level = owned?.level || 0,
      upgradeCost = UPGRADE_COSTS[level] || 0;
    const reason = owned
      ? "Esta propriedade já é tua."
      : state.cash < definition.price
        ? "Precisas de " + euro(definition.price) + " na tesouraria."
        : "";
    const upgradeReason = !owned
      ? "Compra a propriedade antes de a mobilar."
      : level >= 3
        ? "A casa já está completamente mobilada."
        : state.cash < upgradeCost
          ? "Precisas de " + euro(upgradeCost) + " para esta melhoria."
          : "";
    const restReason = !owned
      ? "Só podes descansar numa casa tua."
      : ownership.restedDay === state.day
        ? "Já descansaste hoje. O próximo descanso fica disponível no próximo dia empresarial."
        : "";
    return {
      ...definition,
      title: definition.name,
      owned: !!owned,
      level,
      maxLevel: 3,
      comfort: 40 + level * 20,
      home: ownership.homeId === definition.id,
      isHome: ownership.homeId === definition.id,
      canBuy: !reason,
      reason,
      upgradeCost,
      canUpgrade: !upgradeReason,
      upgradeReason,
      canRest: !restReason,
      restReason,
      canSetHome: !!owned && ownership.homeId !== definition.id,
      purchasedDay: owned?.purchasedDay || null,
      lastRestDay: owned?.lastRestDay || 0,
      upgradeName:
        ["Sala mobilada", "Quarto e cozinha", "Casa completa"][level] ||
        "Casa completa",
    };
  });
  const milestones = MILESTONE_DEFINITIONS.map((definition) => {
    const actual = Math.max(0, progress(state, definition.metric)),
      complete = actual >= definition.target;
    const claimed = ownership.claimedMilestones.includes(definition.id);
    return {
      ...definition,
      title: definition.name,
      progress: Math.min(definition.target, actual),
      actual,
      complete,
      claimed,
      claimable: complete && !claimed,
      canClaim: complete && !claimed,
      reason: claimed
        ? "Recompensa já recebida."
        : !complete
          ? "Continua a jogar para cumprir este objetivo."
          : "",
    };
  });
  return {
    cash: state.cash,
    cars,
    vehicles,
    properties,
    homeId: ownership.homeId,
    milestones,
    fuelPrice: FUEL_PRICE,
    totalDistance: ownership.totalDistance,
    distanceKm: precise(ownership.totalDistance / 1000, 2),
    rewardIncome: ownership.rewardIncome,
  };
}

export function buyCar(company, modelId) {
  const state = ensureOwnership(company),
    model = CAR_CATALOG.find((entry) => entry.id === modelId);
  if (!model)
    return result(false, state, "Este modelo não está disponível no stand.");
  if (state.ownership.vehicles.some((vehicle) => vehicle.modelId === modelId))
    return result(false, state, "Este modelo já está na tua garagem.");
  if (state.cash < model.price)
    return result(
      false,
      state,
      "Não há dinheiro suficiente para comprar este automóvel.",
    );
  const next = clone(state),
    vehicleId = "owned-" + model.id;
  next.ownership.vehicles.push({
    id: vehicleId,
    modelId: model.id,
    fuel: model.fuelCapacity,
    maxFuel: model.fuelCapacity,
    condition: 100,
    color: model.color,
    odometer: 0,
    purchasedDay: next.day,
    parked: null,
  });
  spend(next, model.price, "carSpending");
  log(
    next,
    "Um automóvel teu",
    model.name +
      " comprado por " +
      euro(model.price) +
      ". O pagamento saiu da tesouraria para património pessoal.",
  );
  return result(
    true,
    next,
    model.name + " está na tua garagem, abastecido e pronto a conduzir.",
    { vehicleId },
  );
}

export function repairCar(company, vehicleId) {
  const state = ensureOwnership(company),
    vehicle = state.ownership.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle)
    return result(false, state, "Este veículo não pertence à tua garagem.");
  const cost = repairCost(vehicle);
  if (!cost)
    return result(
      false,
      state,
      "O veículo está em bom estado; não precisas de pagar uma reparação.",
    );
  if (state.cash < cost)
    return result(
      false,
      state,
      "Não há dinheiro suficiente para reparar o veículo.",
    );
  const next = clone(state);
  next.ownership.vehicles.find((entry) => entry.id === vehicleId).condition =
    100;
  spend(next, cost, "serviceSpending");
  log(
    next,
    "Oficina",
    "Reparação completa por " +
      euro(cost) +
      ". O veículo recuperou o seu estado.",
  );
  return result(true, next, "Reparação concluída. O veículo está como novo.", {
    vehicleId,
    cost,
  });
}

export function refuelCar(company, vehicleId, litres) {
  const state = ensureOwnership(company),
    vehicle = state.ownership.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle)
    return result(false, state, "Este veículo não pertence à tua garagem.");
  const missing = precise(vehicle.maxFuel - vehicle.fuel, 6);
  if (missing <= 0) return result(false, state, "O depósito já está cheio.");
  if (litres !== undefined && (!Number.isFinite(litres) || litres <= 0))
    return result(false, state, "Indica uma quantidade de combustível válida.");
  const quantity = precise(
    Math.min(missing, litres === undefined ? missing : litres),
    6,
  );
  if (quantity <= 0)
    return result(
      false,
      state,
      "A quantidade é demasiado pequena para abastecer.",
    );
  const cost = fuelCost(quantity);
  if (state.cash < cost)
    return result(
      false,
      state,
      "Não há dinheiro suficiente para este abastecimento.",
    );
  const next = clone(state),
    updated = next.ownership.vehicles.find((entry) => entry.id === vehicleId);
  updated.fuel = precise(Math.min(updated.maxFuel, updated.fuel + quantity), 6);
  spend(next, cost, "serviceSpending");
  log(
    next,
    "Abastecimento",
    precise(quantity, 2) +
      " litros por " +
      euro(cost) +
      ". Combustível para voltar à estrada.",
  );
  return result(
    true,
    next,
    "Abasteceste " + precise(quantity, 2) + " litros por " + euro(cost) + ".",
    { vehicleId, litres: quantity, cost },
  );
}

/** Distance is actual metres driven; collision is condition damage in points. */
export function updateVehicleUsage(company, vehicleId, usage = {}) {
  const state = ensureOwnership(company),
    vehicle = state.ownership.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle)
    return result(false, state, "Este veículo não pertence à tua garagem.");
  if (!usage || typeof usage !== "object" || Array.isArray(usage))
    return result(
      false,
      state,
      "Os dados de utilização do veículo não são válidos.",
    );
  const distance = usage.distance ?? 0,
    collision = usage.collision ?? 0;
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > 100000 ||
    !Number.isFinite(collision) ||
    collision < 0
  )
    return result(
      false,
      state,
      "Os dados de utilização do veículo não são válidos.",
    );
  const next = clone(state),
    updated = next.ownership.vehicles.find((entry) => entry.id === vehicleId);
  const model = CAR_CATALOG.find((entry) => entry.id === vehicle.modelId);
  const consumed = Math.min(
    updated.fuel,
    (distance * model.litresPer100Km) / 100000,
  );
  updated.fuel = precise(Math.max(0, updated.fuel - consumed), 6);
  updated.odometer = precise(updated.odometer + distance, 3);
  updated.condition = precise(
    Math.max(0, updated.condition - Math.min(100, collision)),
    4,
  );
  next.ownership.totalDistance = precise(
    next.ownership.vehicles.reduce((total, entry) => total + entry.odometer, 0),
    3,
  );
  if (collision >= 5)
    log(
      next,
      "Um toque na carroçaria",
      "O " +
        model.name +
        " ficou com " +
        Math.round(updated.condition) +
        "% de estado. Podes repará-lo na oficina.",
    );
  return result(true, next, "", {
    vehicleId,
    fuelUsed: precise(consumed, 6),
    distance,
    conditionLost: precise(vehicle.condition - updated.condition, 4),
    drivable: updated.fuel > 0 && updated.condition > 0,
  });
}

export function parkCar(company, vehicleId, parking) {
  const state = ensureOwnership(company),
    vehicle = state.ownership.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle)
    return result(false, state, "Este veículo não pertence à tua garagem.");
  const place = normalizeParking(parking);
  if (!place)
    return result(
      false,
      state,
      "Não é possível guardar o veículo nesse local.",
    );
  const next = clone(state);
  next.ownership.vehicles.find((entry) => entry.id === vehicleId).parked =
    place;
  return result(true, next, "Veículo estacionado e posição guardada.", {
    vehicleId,
    parked: place,
  });
}

export function buyProperty(company, propertyId) {
  const state = ensureOwnership(company),
    definition = PROPERTY_CATALOG.find((entry) => entry.id === propertyId);
  if (!definition)
    return result(false, state, "Esta propriedade não está à venda.");
  if (state.ownership.properties.some((property) => property.id === propertyId))
    return result(false, state, "Esta propriedade já é tua.");
  if (state.cash < definition.price)
    return result(
      false,
      state,
      "Não há dinheiro suficiente para comprar esta casa.",
    );
  const next = clone(state);
  next.ownership.properties.push({
    id: propertyId,
    level: 0,
    purchasedDay: next.day,
    lastRestDay: 0,
  });
  if (!next.ownership.homeId) next.ownership.homeId = propertyId;
  spend(next, definition.price, "propertySpending");
  log(
    next,
    "Uma chave para voltar",
    definition.name +
      " comprada por " +
      euro(definition.price) +
      ". O pagamento saiu da tesouraria para património pessoal.",
  );
  return result(
    true,
    next,
    definition.name + " é tua. Podes entrar, mobilar e descansar.",
    { propertyId },
  );
}

export function upgradeProperty(company, propertyId) {
  const state = ensureOwnership(company),
    property = state.ownership.properties.find(
      (entry) => entry.id === propertyId,
    );
  if (!property)
    return result(false, state, "Compra esta propriedade antes de a mobilar.");
  if (property.level >= 3)
    return result(false, state, "A casa já está completamente mobilada.");
  const cost = UPGRADE_COSTS[property.level];
  if (state.cash < cost)
    return result(
      false,
      state,
      "Não há dinheiro suficiente para esta melhoria.",
    );
  const next = clone(state),
    updated = next.ownership.properties.find(
      (entry) => entry.id === propertyId,
    );
  updated.level++;
  spend(next, cost, "propertySpending");
  log(
    next,
    "Uma casa mais tua",
    "Mobilaste a casa até ao nível " +
      updated.level +
      " por " +
      euro(cost) +
      ". A decoração é visível no interior.",
  );
  return result(
    true,
    next,
    "Casa mobilada: nível " + updated.level + " de 3.",
    { propertyId, level: updated.level, cost },
  );
}

export function setHome(company, propertyId) {
  const state = ensureOwnership(company);
  if (!state.ownership.properties.some((entry) => entry.id === propertyId))
    return result(false, state, "Só podes escolher uma casa que te pertence.");
  if (state.ownership.homeId === propertyId)
    return result(true, state, "Esta já é a tua casa base.", { propertyId });
  const next = clone(state);
  next.ownership.homeId = propertyId;
  return result(
    true,
    next,
    "Casa base atualizada. Este é o teu lugar para voltar.",
    { propertyId },
  );
}

export function restAtProperty(company, propertyId) {
  const state = ensureOwnership(company),
    property = state.ownership.properties.find(
      (entry) => entry.id === propertyId,
    );
  if (!property)
    return result(false, state, "Só podes descansar numa casa tua.");
  if (state.ownership.restedDay === state.day)
    return result(
      false,
      state,
      "Já descansaste hoje. Regressa depois de encerrar este dia empresarial.",
    );
  const next = clone(state);
  next.ownership.homeId = propertyId;
  next.ownership.restedDay = next.day;
  next.ownership.properties.find(
    (entry) => entry.id === propertyId,
  ).lastRestDay = next.day;
  log(
    next,
    "Descansar também faz parte",
    "Recuperaste forças em casa. A saúde fica completa e este passa a ser o teu ponto de regresso.",
  );
  return result(
    true,
    next,
    "Descanso concluído: saúde recuperada e casa base guardada.",
    { propertyId, health: 100, checkpoint: true },
  );
}

export function claimMilestone(company, milestoneId) {
  const state = ensureOwnership(company),
    definition = MILESTONE_DEFINITIONS.find(
      (entry) => entry.id === milestoneId,
    );
  if (!definition) return result(false, state, "Este objetivo não existe.");
  if (state.ownership.claimedMilestones.includes(milestoneId))
    return result(false, state, "Já recebeste a recompensa deste objetivo.");
  if (progress(state, definition.metric) < definition.target)
    return result(
      false,
      state,
      "Ainda não cumpriste os requisitos deste objetivo.",
    );
  const next = clone(state);
  next.cash = precise(next.cash + definition.reward);
  next.reputation = Math.min(
    100,
    next.reputation + definition.reputationReward,
  );
  next.ownership.claimedMilestones.push(milestoneId);
  next.ownership.rewardIncome = precise(
    next.ownership.rewardIncome + definition.reward,
  );
  log(
    next,
    definition.name,
    "Objetivo cumprido: apoio de " +
      euro(definition.reward) +
      " e reputação +" +
      definition.reputationReward +
      ".",
    "milestone",
  );
  return result(
    true,
    next,
    definition.name + ": recebeste " + euro(definition.reward) + ".",
    { milestoneId, reward: definition.reward },
  );
}

/** Ownership has no rent generator or offline payouts. Time alone earns nothing. */
export function advanceOwnership(company, seconds) {
  const state = ensureOwnership(company);
  if (!Number.isFinite(seconds) || seconds < 0)
    return result(false, state, "O intervalo de tempo não é válido.", {
      events: [],
    });
  return result(true, state, "", { events: [] });
}

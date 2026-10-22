const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const precise = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

export const CAR_CATALOG = Object.freeze(
  [
    {
      id: "compact",
      name: "Citadino 1.4",
      description: "Leve, económico e fácil de estacionar nos bairros antigos.",
      price: 1400,
      color: 0xc7b58b,
      topSpeed: 24,
      acceleration: 12,
      handling: 0.9,
      braking: 22,
      fuelCapacity: 38,
      litresPer100Km: 7.2,
    },
    {
      id: "pickup",
      name: "Pick-up do Vale",
      description:
        "Uma companheira de trabalho com caixa aberta e mecânica robusta.",
      price: 2100,
      color: 0x376e58,
      topSpeed: 25,
      acceleration: 11,
      handling: 0.78,
      braking: 23,
      fuelCapacity: 60,
      litresPer100Km: 10,
    },
    {
      id: "van",
      name: "Furgão Mercador",
      description:
        "Espaço de carga e condução tranquila para percorrer a cidade.",
      price: 2800,
      color: 0xe1dfd1,
      topSpeed: 22,
      acceleration: 9.4,
      handling: 0.72,
      braking: 21,
      fuelCapacity: 72,
      litresPer100Km: 10.8,
    },
    {
      id: "sport",
      name: "GT Vermelho",
      description: "Aceleração rápida, travões fortes e um consumo à altura.",
      price: 6500,
      color: 0xa94235,
      topSpeed: 37,
      acceleration: 17,
      handling: 1.05,
      braking: 30,
      fuelCapacity: 55,
      litresPer100Km: 12.5,
    },
    {
      id: "suv",
      name: "Serra 4x4",
      description: "Conforto e presença para as avenidas e estradas do vale.",
      price: 4500,
      color: 0x344b60,
      topSpeed: 30,
      acceleration: 13.5,
      handling: 0.85,
      braking: 26,
      fuelCapacity: 68,
      litresPer100Km: 11.3,
    },
  ].map(Object.freeze),
);

export const PROPERTY_CATALOG = Object.freeze(
  [
    {
      id: "apartamento",
      name: "Apartamento da Ribeira",
      description:
        "A primeira chave: um espaço acolhedor no bairro onde a empresa começou.",
      price: 1800,
    },
    {
      id: "casa-jardim",
      name: "Casa dos Jardins",
      description:
        "Uma casa com sala, quarto e jardim para desacelerar depois das entregas.",
      price: 4200,
    },
    {
      id: "villa-mar",
      name: "Villa do Atlântico",
      description:
        "Uma moradia junto à costa, com vista para o próximo capítulo da cidade.",
      price: 9800,
    },
  ].map(Object.freeze),
);

export const MILESTONE_DEFINITIONS = Object.freeze(
  [
    {
      id: "primeira-entrega",
      name: "A primeira palavra cumprida",
      description: "Conclui uma entrega a um cliente.",
      target: 1,
      reward: 250,
      reputationReward: 2,
      metric: "deliveries",
    },
    {
      id: "loja-bairro",
      name: "A loja do bairro",
      description: "Vende dez caixas no balcão da tua loja.",
      target: 10,
      reward: 350,
      reputationReward: 3,
      metric: "shop",
    },
    {
      id: "garagem-propria",
      name: "Uma garagem com história",
      description: "Compra dois modelos diferentes no stand.",
      target: 2,
      reward: 400,
      reputationReward: 2,
      metric: "cars",
    },
    {
      id: "rede-distribuicao",
      name: "A equipa trata da estrada",
      description: "Conclui três entregas com a frota de distribuição.",
      target: 3,
      reward: 550,
      reputationReward: 4,
      metric: "fleet",
    },
    {
      id: "primeira-casa",
      name: "Um lugar para voltar",
      description: "Compra a tua primeira casa na cidade.",
      target: 1,
      reward: 300,
      reputationReward: 2,
      metric: "properties",
    },
  ].map(Object.freeze),
);

export function normalizeParking(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (!["cidade", "estufas", "porto"].includes(input.mapId)) return null;
  if (!Number.isFinite(input.x) || !Number.isFinite(input.z)) return null;
  const limit = input.mapId === "cidade" ? 730 : 250;
  if (Math.abs(input.x) > limit || Math.abs(input.z) > limit) return null;
  const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  return {
    mapId: input.mapId,
    x: precise(input.x, 3),
    z: precise(input.z, 3),
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
  };
}

function colour(value, fallback) {
  if (typeof value === "string" && /^#?[a-f\d]{6}$/i.test(value))
    return parseInt(value.replace("#", ""), 16);
  return Number.isFinite(value)
    ? Math.round(clamp(value, 0, 0xffffff))
    : fallback;
}

/** Pure save migration; no dependency on the company simulation or rendering. */
export function normalizeOwnershipState(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const models = new Set(),
    propertyIds = new Set();
  const vehicles = [];
  for (const raw of Array.isArray(source.vehicles) ? source.vehicles : []) {
    const model = CAR_CATALOG.find((entry) => entry.id === raw?.modelId);
    if (!model || models.has(model.id)) continue;
    models.add(model.id);
    vehicles.push({
      id: "owned-" + model.id,
      modelId: model.id,
      fuel: precise(
        clamp(number(raw.fuel, model.fuelCapacity), 0, model.fuelCapacity),
        6,
      ),
      maxFuel: model.fuelCapacity,
      condition: precise(clamp(number(raw.condition, 100), 0, 100), 4),
      color: colour(raw.color, model.color),
      odometer: precise(Math.max(0, number(raw.odometer, 0)), 3),
      purchasedDay: Math.round(clamp(number(raw.purchasedDay, 1), 1, 9999)),
      parked: normalizeParking(raw.parked),
    });
  }
  const properties = [];
  for (const raw of Array.isArray(source.properties) ? source.properties : []) {
    const definition = PROPERTY_CATALOG.find((entry) => entry.id === raw?.id);
    if (!definition || propertyIds.has(definition.id)) continue;
    propertyIds.add(definition.id);
    properties.push({
      id: definition.id,
      level: Math.round(clamp(number(raw.level, 0), 0, 3)),
      purchasedDay: Math.round(clamp(number(raw.purchasedDay, 1), 1, 9999)),
      lastRestDay: Math.round(clamp(number(raw.lastRestDay, 0), 0, 9999)),
    });
  }
  const knownMilestones = new Set(
    MILESTONE_DEFINITIONS.map((entry) => entry.id),
  );
  return {
    version: 1,
    vehicles,
    properties,
    homeId: properties.some((property) => property.id === source.homeId)
      ? source.homeId
      : properties[0]?.id || null,
    restedDay: Math.round(
      clamp(
        number(
          source.restedDay,
          Math.max(0, ...properties.map((property) => property.lastRestDay)),
        ),
        0,
        9999,
      ),
    ),
    claimedMilestones: [
      ...new Set(
        (Array.isArray(source.claimedMilestones)
          ? source.claimedMilestones
          : []
        ).filter((id) => knownMilestones.has(id)),
      ),
    ],
    totalDistance: precise(
      vehicles.reduce((total, vehicle) => total + vehicle.odometer, 0),
      3,
    ),
    carSpending: precise(Math.max(0, number(source.carSpending, 0))),
    propertySpending: precise(Math.max(0, number(source.propertySpending, 0))),
    serviceSpending: precise(Math.max(0, number(source.serviceSpending, 0))),
    rewardIncome: precise(Math.max(0, number(source.rewardIncome, 0))),
  };
}

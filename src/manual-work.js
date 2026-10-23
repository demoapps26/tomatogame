// A physical daily packing order. This module owns no company money, stock,
// renderer or clock. Apply each successful result's state and financial effects
// together: stock -= stockCost; stock += stockReturn; cash -= cashCost;
// cash += reward. Save that company/state pair atomically before another command.
// Stock is removed at acceptance, so contracts/retail cannot consume this cargo.

const station = (id, x, z, label) =>
  Object.freeze({ id, type: "manual-work", x, z, label });
export const MANUAL_WORK_STATIONS = Object.freeze({
  boxes: station("packing-boxes", 21, 74, "Caixas · sede"),
  sample: station("packing-sample", 65, 41, "Amostra de qualidade · estufa"),
  weigh: station("packing-weigh", 33, 63, "Balança da sede"),
  seal: station("packing-seal", 40, 73, "Selagem e expedição"),
});
export const MANUAL_WORK_INTERACTION_RADIUS = 1.6;
export const MANUAL_WORK_ORDER = Object.freeze({
  id: "lote-diario",
  title: "Preparar a encomenda da cooperativa",
  quantity: 6,
  packagingCost: 8,
  baseReward: 96,
  maxQualityBonus: 24,
  weighDuration: 2,
  sealDuration: 3,
});
const phases = Object.freeze([
  "sample",
  "collect",
  "weigh",
  "collect-weighed",
  "seal",
  "dispatch",
]);
const statuses = Object.freeze([
  "finished",
  "abandoned",
  "left-city",
  "defeated",
  "day-ended",
]);
const descriptions = {
  sample: [
    "Colher a amostra",
    "Vai a pé à estufa e carrega em E para recolher a amostra de qualidade do lote.",
    "sample",
  ],
  collect: [
    "Recolher uma caixa",
    "Carrega em E junto às caixas para pegar na próxima caixa do lote.",
    "boxes",
  ],
  weigh: [
    "Pesar a caixa",
    "Pousa a caixa na balança com E e mantém-te junto dela durante a leitura.",
    "weigh",
  ],
  "collect-weighed": [
    "Recuperar a caixa pesada",
    "A leitura está confirmada. Carrega em E para retirar a caixa da balança.",
    "weigh",
  ],
  seal: [
    "Selar a caixa",
    "Leva a caixa à mesa, carrega em E e mantém-te junto dela até terminar a selagem.",
    "seal",
  ],
  dispatch: [
    "Expedir a caixa selada",
    "Carrega em E na mesa de expedição para entregar esta caixa à cooperativa.",
    "seal",
  ],
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const integer = (value, low = 0, high = 1_000_000) =>
  Number.isInteger(value) && value >= low && value <= high;
const count = (value) => (integer(value) ? value : 0);
const positionOf = (value) =>
  value && finite(value.x) && finite(value.z)
    ? { x: value.x, z: value.z }
    : null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const withinStation = (position, point) =>
  distance(position, point) <= MANUAL_WORK_INTERACTION_RADIUS + 1e-9;
const round = (value) => Math.round(value * 1000) / 1000;
const clockRound = (value) => Math.round(value * 1e9) / 1e9;
const qualityBonus = (quality) =>
  Math.round((MANUAL_WORK_ORDER.maxQualityBonus * quality) / 100);
const paymentFor = (quality) =>
  MANUAL_WORK_ORDER.baseReward + qualityBonus(quality);
const targetFor = (phase) => MANUAL_WORK_STATIONS[descriptions[phase][2]];
const durationFor = (phase) =>
  phase === "weigh"
    ? MANUAL_WORK_ORDER.weighDuration
    : phase === "seal"
      ? MANUAL_WORK_ORDER.sealDuration
      : 0;
const carrying = (active) =>
  !!active &&
  (active.phase === "weigh" || active.phase === "seal") &&
  !active.working;
const response = (
  ok,
  state,
  message = "",
  effects = {},
  events = [],
  handled = false,
) => ({
  ok,
  handled,
  state,
  message,
  reward: 0,
  stockCost: 0,
  cashCost: 0,
  stockReturn: 0,
  qualityBonus: 0,
  ...effects,
  events,
});

export function createManualWork() {
  return {
    version: 1,
    sequence: 0,
    settledSequence: 0,
    completedDay: 0,
    active: null,
    lastResult: null,
  };
}

export function normalizeManualWork(saved) {
  const state = createManualWork();
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return state;
  state.sequence = count(saved.sequence);
  state.settledSequence = count(saved.settledSequence);
  state.sequence = Math.max(state.sequence, state.settledSequence);
  state.completedDay = count(saved.completedDay);
  const previous = saved.lastResult;
  if (
    previous &&
    statuses.includes(previous.status) &&
    integer(previous.day, 1)
  ) {
    const finished = previous.status === "finished";
    const receiptSequence = integer(previous.sequence, 1)
      ? previous.sequence
      : state.sequence;
    state.settledSequence = Math.max(state.settledSequence, receiptSequence);
    state.sequence = Math.max(state.sequence, state.settledSequence);
    const quality =
      finite(previous.quality) &&
      previous.quality >= 0 &&
      previous.quality <= 100
        ? round(previous.quality)
        : 0;
    const completedBoxes = finished
      ? MANUAL_WORK_ORDER.quantity
      : integer(previous.completedBoxes, 0, MANUAL_WORK_ORDER.quantity - 1)
        ? previous.completedBoxes
        : 0;
    state.lastResult = {
      day: previous.day,
      sequence: receiptSequence,
      status: previous.status,
      completedBoxes,
      quality,
      elapsed:
        finite(previous.elapsed) && previous.elapsed >= 0
          ? clockRound(Math.min(86400, previous.elapsed))
          : 0,
      reward: finished ? paymentFor(quality) : 0,
      stockReturned: finished ? 0 : MANUAL_WORK_ORDER.quantity - completedBoxes,
    };
    // Even an interrupted write of the receipt must not reopen a paid day.
    if (finished)
      state.completedDay = Math.max(state.completedDay, previous.day);
  }
  const active = saved.active;
  if (
    !active ||
    typeof active !== "object" ||
    !integer(active.day, 1) ||
    active.day <= state.completedDay ||
    !integer(active.sequence, 1) ||
    active.sequence <= state.settledSequence ||
    active.sequence !== state.sequence ||
    !phases.includes(active.phase) ||
    !integer(active.completedBoxes, 0, MANUAL_WORK_ORDER.quantity - 1) ||
    (active.phase === "sample" && active.completedBoxes !== 0) ||
    active.reservedStock !== MANUAL_WORK_ORDER.quantity ||
    active.packagingPaid !== MANUAL_WORK_ORDER.packagingCost ||
    !finite(active.quality) ||
    active.quality < 0 ||
    active.quality > 100 ||
    !finite(active.elapsed) ||
    active.elapsed < 0 ||
    active.elapsed > 86400
  )
    return state;
  const duration = durationFor(active.phase);
  const working =
    duration > 0 &&
    active.working === true &&
    finite(active.processElapsed) &&
    active.processElapsed >= 0 &&
    active.processElapsed <= duration;
  state.active = {
    id: `manual-${active.day}-${active.sequence}`,
    sequence: active.sequence,
    day: active.day,
    phase: active.phase,
    completedBoxes: active.completedBoxes,
    reservedStock: MANUAL_WORK_ORDER.quantity,
    packagingPaid: MANUAL_WORK_ORDER.packagingCost,
    quality: round(active.quality),
    elapsed: clockRound(active.elapsed),
    working,
    processElapsed: working ? clockRound(active.processElapsed) : 0,
  };
  return state;
}

function startReason(state, context) {
  if (state.active)
    return "Termina ou cancela primeiro a encomenda que tens em mãos.";
  if (!integer(context.day, 1))
    return "Não foi possível confirmar o dia da empresa.";
  if (context.day <= state.completedDay)
    return "A encomenda deste dia já foi expedida e paga.";
  if (context.mapId !== "cidade")
    return "Esta encomenda é preparada em Santa Tomata.";
  if (context.founded !== true)
    return "Funda primeiro a tua empresa para preparar encomendas.";
  if (context.driving !== false)
    return "Sai da viatura e aproxima-te das caixas na sede.";
  const position = positionOf(context.position);
  if (!position || !withinStation(position, MANUAL_WORK_STATIONS.boxes))
    return "Aproxima-te a pé das caixas na sede para iniciar a preparação.";
  if (
    !Number.isInteger(context.stock) ||
    context.stock < MANUAL_WORK_ORDER.quantity
  )
    return `Precisas de ${MANUAL_WORK_ORDER.quantity} caixas livres no armazém.`;
  if (!finite(context.cash) || context.cash < MANUAL_WORK_ORDER.packagingCost)
    return `Precisas de ${MANUAL_WORK_ORDER.packagingCost} € para as embalagens.`;
  if (
    context.quality !== undefined &&
    (!finite(context.quality) || context.quality < 0 || context.quality > 100)
  )
    return "Não foi possível confirmar a qualidade do lote.";
  if (state.sequence >= 1_000_000)
    return "O registo de preparação atingiu o limite.";
  return "";
}

export function getManualWorkView(saved, context = {}) {
  const state = normalizeManualWork(saved),
    source = state.active;
  let active = null;
  if (source) {
    const duration = durationFor(source.phase),
      process =
        source.working && duration
          ? Math.min(1, source.processElapsed / duration)
          : 0;
    const [stepTitle, description] = descriptions[source.phase];
    const fractions = {
      sample: 0,
      collect: 0,
      weigh: 0.18 + process * 0.22,
      "collect-weighed": 0.4,
      seal: 0.6 + process * 0.3,
      dispatch: 0.9,
    };
    active = {
      id: source.id,
      day: source.day,
      title: MANUAL_WORK_ORDER.title,
      phase: source.phase,
      stepTitle,
      description,
      point: { ...targetFor(source.phase) },
      carrying: carrying(source),
      working: source.working,
      progress: process,
      processProgress: process,
      processElapsed: source.processElapsed,
      processDuration: duration,
      overallProgress:
        source.phase === "sample"
          ? 0
          : 0.02 +
            (0.98 * (source.completedBoxes + fractions[source.phase])) /
              MANUAL_WORK_ORDER.quantity,
      completedBoxes: source.completedBoxes,
      totalBoxes: MANUAL_WORK_ORDER.quantity,
      remainingBoxes: MANUAL_WORK_ORDER.quantity - source.completedBoxes,
      elapsed: source.elapsed,
      quality: source.quality,
      reward: paymentFor(source.quality),
      qualityBonus: qualityBonus(source.quality),
      reservedStock: source.reservedStock,
      packagingCost: source.packagingPaid,
      requiresOnFoot: true,
      requiresVehicle: false,
      requiresInteraction: !source.working,
      interactionRadius: MANUAL_WORK_INTERACTION_RADIUS,
      cancellation:
        "O cancelamento devolve apenas as caixas ainda não expedidas. As embalagens não são reembolsadas.",
    };
  }
  const reason = startReason(state, context);
  return {
    active,
    completedDay: state.completedDay,
    completedToday:
      integer(context.day, 1) && context.day <= state.completedDay,
    canStart: !reason,
    reason,
    order: { ...MANUAL_WORK_ORDER },
    stations: Object.fromEntries(
      Object.entries(MANUAL_WORK_STATIONS).map(([key, point]) => [
        key,
        { ...point },
      ]),
    ),
    lastResult: state.lastResult ? { ...state.lastResult } : null,
  };
}

export function startManualWork(saved, context = {}) {
  const state = normalizeManualWork(saved),
    reason = startReason(state, context);
  if (reason) return response(false, state, reason);
  state.sequence++;
  state.active = {
    id: `manual-${context.day}-${state.sequence}`,
    sequence: state.sequence,
    day: context.day,
    phase: "sample",
    completedBoxes: 0,
    reservedStock: MANUAL_WORK_ORDER.quantity,
    packagingPaid: MANUAL_WORK_ORDER.packagingCost,
    quality: round(context.quality ?? 50),
    elapsed: 0,
    working: false,
    processElapsed: 0,
  };
  state.lastResult = null;
  return response(
    true,
    state,
    `Reservaste ${MANUAL_WORK_ORDER.quantity} caixas e pagaste ${MANUAL_WORK_ORDER.packagingCost} € de embalagens. Recolhe a amostra na estufa; o pagamento chega quando o lote completo for expedido.`,
    {
      stockCost: MANUAL_WORK_ORDER.quantity,
      cashCost: MANUAL_WORK_ORDER.packagingCost,
    },
    [
      {
        type: "started",
        id: state.active.id,
        point: { ...MANUAL_WORK_STATIONS.sample },
      },
    ],
    true,
  );
}

function stopWork(state, status, message, handled = false) {
  const active = state.active,
    stockReturn = MANUAL_WORK_ORDER.quantity - active.completedBoxes;
  state.lastResult = {
    day: active.day,
    sequence: active.sequence,
    status,
    completedBoxes: active.completedBoxes,
    quality: active.quality,
    elapsed: active.elapsed,
    reward: 0,
    stockReturned: stockReturn,
  };
  state.settledSequence = Math.max(state.settledSequence, active.sequence);
  state.active = null;
  return response(
    true,
    state,
    message,
    { stockReturn },
    [{ type: "cancelled", id: active.id, reason: status, stockReturn }],
    handled,
  );
}
function interruption(state, context, handled = false) {
  if (context.mapId !== "cidade")
    return stopWork(
      state,
      "left-city",
      "A preparação foi interrompida ao sair de Santa Tomata. As caixas ainda não expedidas regressaram ao armazém.",
      handled,
    );
  if (context.day !== state.active.day)
    return stopWork(
      state,
      "day-ended",
      "O dia da empresa mudou. As caixas ainda não expedidas regressaram ao armazém.",
      handled,
    );
  if (finite(context.health) && context.health <= 0)
    return stopWork(
      state,
      "defeated",
      "A preparação foi interrompida. As caixas ainda não expedidas regressaram ao armazém.",
      handled,
    );
  return null;
}

export function canInteractManualWork(saved, context = {}) {
  const state = normalizeManualWork(saved),
    active = state.active,
    position = positionOf(context.position);
  return (
    !!active &&
    context.mapId === "cidade" &&
    context.day === active.day &&
    context.driving === false &&
    !!position &&
    (context.health === undefined ||
      (finite(context.health) && context.health > 0)) &&
    withinStation(position, targetFor(active.phase))
  );
}

export function interactManualWork(saved, context = {}) {
  const state = normalizeManualWork(saved),
    active = state.active;
  if (!active) return response(false, state);
  if (
    !integer(context.day, 1) ||
    typeof context.mapId !== "string" ||
    typeof context.driving !== "boolean" ||
    !positionOf(context.position) ||
    (context.health !== undefined && !finite(context.health))
  )
    return response(
      false,
      state,
      "Não foi possível confirmar a interação com esta estação.",
    );
  const stopped = interruption(state, context);
  if (stopped) return stopped;
  if (!canInteractManualWork(state, context))
    return response(
      false,
      state,
      context.driving
        ? "Sai da viatura para trabalhar nesta estação."
        : "Aproxima-te da estação indicada e carrega em E.",
    );
  if (active.working)
    return response(
      false,
      state,
      "Mantém-te junto à estação até o processo terminar.",
      {},
      [],
      true,
    );
  let message = "",
    events = [];
  const advancePhase = (phase, text, type = "objective") => {
    active.phase = phase;
    active.processElapsed = 0;
    active.working = false;
    message = text;
    events.push({ type, id: active.id, phase, point: { ...targetFor(phase) } });
  };
  if (active.phase === "sample")
    advancePhase(
      "collect",
      "Amostra recolhida. Regressa às caixas e prepara a primeira unidade.",
      "sample-collected",
    );
  else if (active.phase === "collect")
    advancePhase(
      "weigh",
      `Pegaste na caixa ${active.completedBoxes + 1}/${MANUAL_WORK_ORDER.quantity}. Leva-a à balança.`,
      "picked-up",
    );
  else if (active.phase === "weigh" || active.phase === "seal") {
    active.working = true;
    active.processElapsed = 0;
    message =
      active.phase === "weigh"
        ? "Caixa na balança. Mantém-te junto dela durante a leitura."
        : "Selagem iniciada. Mantém-te junto à mesa até a caixa ficar pronta.";
    events.push({
      type: "process-started",
      id: active.id,
      phase: active.phase,
      duration: durationFor(active.phase),
      point: { ...targetFor(active.phase) },
    });
  } else if (active.phase === "collect-weighed")
    advancePhase(
      "seal",
      "Peso confirmado. Leva a caixa à mesa de selagem.",
      "picked-up",
    );
  else if (active.phase === "dispatch") {
    active.completedBoxes++;
    events.push({
      type: "box-dispatched",
      id: active.id,
      completedBoxes: active.completedBoxes,
      quantity: MANUAL_WORK_ORDER.quantity,
    });
    if (active.completedBoxes < MANUAL_WORK_ORDER.quantity)
      advancePhase(
        "collect",
        `Caixa ${active.completedBoxes}/${MANUAL_WORK_ORDER.quantity} expedida. Recolhe a próxima caixa; o pagamento é feito no fim do lote.`,
      );
    else {
      const reward = paymentFor(active.quality),
        bonus = qualityBonus(active.quality);
      state.completedDay = Math.max(state.completedDay, active.day);
      state.lastResult = {
        day: active.day,
        sequence: active.sequence,
        status: "finished",
        completedBoxes: MANUAL_WORK_ORDER.quantity,
        quality: active.quality,
        elapsed: active.elapsed,
        reward,
        stockReturned: 0,
      };
      state.settledSequence = Math.max(state.settledSequence, active.sequence);
      state.active = null;
      events.push({
        type: "completed",
        id: active.id,
        day: active.day,
        quantity: MANUAL_WORK_ORDER.quantity,
        reward,
        qualityBonus: bonus,
      });
      return response(
        true,
        state,
        `As ${MANUAL_WORK_ORDER.quantity} caixas foram expedidas. A cooperativa pagou ${reward} € (${bonus} € de qualidade).`,
        { reward, qualityBonus: bonus },
        events,
        true,
      );
    }
  }
  return response(true, state, message, {}, events, true);
}

export function advanceManualWork(saved, context = {}) {
  const state = normalizeManualWork(saved),
    active = state.active;
  if (!active) return response(false, state);
  if (
    !finite(context.dt) ||
    context.dt <= 0 ||
    !integer(context.day, 1) ||
    typeof context.mapId !== "string" ||
    typeof context.driving !== "boolean" ||
    !positionOf(context.position) ||
    !finite(context.health)
  )
    return response(false, state);
  const stopped = interruption(state, context);
  if (stopped) return stopped;
  // A delayed render must not instantly complete a physical process. Call only
  // during active play; paused menus do not supply dt.
  const dt = Math.min(0.25, context.dt);
  active.elapsed = clockRound(Math.min(86400, active.elapsed + dt));
  if (!active.working) return response(true, state);
  const target = targetFor(active.phase);
  if (context.driving || !withinStation(context.position, target)) {
    active.working = false;
    active.processElapsed = 0;
    return response(
      true,
      state,
      "Retiraste a caixa antes do fim. Volta à estação e carrega em E para recomeçar.",
      {},
      [
        {
          type: "process-interrupted",
          id: active.id,
          phase: active.phase,
          point: { ...target },
        },
      ],
    );
  }
  active.processElapsed = clockRound(
    Math.min(durationFor(active.phase), active.processElapsed + dt),
  );
  if (active.processElapsed + 1e-7 < durationFor(active.phase))
    return response(true, state);
  active.phase = active.phase === "weigh" ? "collect-weighed" : "dispatch";
  active.working = false;
  active.processElapsed = 0;
  return response(
    true,
    state,
    active.phase === "collect-weighed"
      ? "Leitura concluída. Carrega em E para recuperar a caixa."
      : "Caixa selada. Carrega em E para confirmar a expedição.",
    {},
    [
      {
        type: "process-ready",
        id: active.id,
        phase: active.phase,
        point: { ...targetFor(active.phase) },
      },
    ],
  );
}

export function cancelManualWork(saved) {
  const state = normalizeManualWork(saved);
  if (!state.active)
    return response(false, state, "Não tens nenhuma preparação em curso.");
  return stopWork(
    state,
    "abandoned",
    "Preparação cancelada. As caixas ainda não expedidas regressaram ao armazém; as embalagens foram utilizadas.",
  );
}

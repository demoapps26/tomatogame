// Driving challenges have their own save data. They never alter company funds:
// the caller applies the one-off sponsor reward returned by advanceTrial.
const checkpoint = (x, z, label) => Object.freeze({ x, z, label, name: label, radius: 10 });
const START = Object.freeze({ x: 96, z: 180 });
export const TRIAL_START_POINTS = Object.freeze([
  Object.freeze({
    id: "trial-board", type: "race", label: "Percursos de condução",
    name: "Quadro de percursos", x: 104, z: 180,
  }),
]);

export const DRIVING_TRIALS = Object.freeze([
  Object.freeze({
    id: "city-sprint", name: "Volta do Bairro", title: "Volta do Bairro",
    description: "Conhece as ruas de Santa Tomata num pequeno circuito junto à empresa.",
    timeLimit: 90, reward: 200, start: START,
    checkpoints: Object.freeze([
      checkpoint(96, 288, "Avenida das Oficinas"),
      checkpoint(0, 288, "Praça da Cidade"),
      checkpoint(0, 192, "Avenida Central"),
      checkpoint(96, 192, "Regresso ao bairro"),
      checkpoint(96, 168, "Meta do Bairro"),
    ]),
  }),
  Object.freeze({
    id: "market-loop", name: "Rota do Mercado", title: "Rota do Mercado",
    description: "Uma volta de distribuição pelas avenidas do centro e do mercado.",
    timeLimit: 130, reward: 350, start: START,
    checkpoints: Object.freeze([
      checkpoint(96, 96, "Avenida das Estufas"),
      checkpoint(96, -96, "Bairro Comercial"),
      checkpoint(-192, -96, "Mercado Poente"),
      checkpoint(-192, 192, "Avenida dos Produtores"),
      checkpoint(96, 192, "Regresso à empresa"),
      checkpoint(96, 168, "Meta do Mercado"),
    ]),
  }),
  Object.freeze({
    id: "coastal-tour", name: "Grande Volta da Costa", title: "Grande Volta da Costa",
    description: "Leva a marca da tua empresa aos bairros do porto e à frente costeira.",
    timeLimit: 180, reward: 600, start: START,
    checkpoints: Object.freeze([
      checkpoint(96, 384, "Avenida do Porto"),
      checkpoint(384, 384, "Terminal de Exportação"),
      checkpoint(384, 576, "Bairro da Marina"),
      checkpoint(96, 576, "Passeio da Costa"),
      checkpoint(-96, 576, "Jardins do Atlântico"),
      checkpoint(-96, 192, "Avenida dos Agricultores"),
      checkpoint(96, 192, "Regresso à empresa"),
      checkpoint(96, 168, "Meta da Costa"),
    ]),
  }),
]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const point = (value) => value && finite(value.x) && finite(value.z)
  ? { x: value.x, z: value.z } : null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (value) => Math.round(value * 1000) / 1000;
const trialById = (id) => DRIVING_TRIALS.find((trial) => trial.id === id);
const MAX_SPEED = 50; // Above the fastest road car, including sprint and rounding tolerance.
const MIN_RESULT_TIME = 0.001;

function routeLength(trial) {
  let previous = trial.start, total = 0;
  for (const target of trial.checkpoints) {
    total += distance(previous, target);
    previous = target;
  }
  return Math.round(total);
}

function result(ok, state, message = "", reward = 0, events = []) {
  return { ok, state, message, reward, events };
}

export function createTrials() {
  return {
    version: 1,
    active: null,
    records: Object.fromEntries(DRIVING_TRIALS.map(({ id }) => [id, {
      bestTime: null, completions: 0, rewarded: false,
    }])),
    lastResult: null,
  };
}

export function normalizeTrials(saved) {
  const state = createTrials();
  if (!saved || typeof saved !== "object") return state;
  for (const trial of DRIVING_TRIALS) {
    const record = saved.records?.[trial.id];
    if (!record || typeof record !== "object") continue;
    const bestTime = finite(record.bestTime) && record.bestTime >= MIN_RESULT_TIME
      && record.bestTime <= trial.timeLimit ? record.bestTime : null;
    const completions = finite(record.completions)
      ? Math.min(1_000_000, Math.max(0, Math.floor(record.completions))) : 0;
    state.records[trial.id] = {
      bestTime,
      completions: Math.max(completions, bestTime === null ? 0 : 1),
      // Old/incomplete records with a finish count cannot pay a second prize.
      rewarded: record.rewarded === true || completions > 0 || bestTime !== null,
    };
  }
  const active = saved.active, trial = trialById(active?.id);
  if (trial && finite(active.elapsed) && active.elapsed >= 0
    && active.elapsed <= trial.timeLimit && Number.isInteger(active.checkpointIndex)
    && active.checkpointIndex >= 0 && active.checkpointIndex < trial.checkpoints.length
    && point(active.previousPosition)) {
    state.active = {
      id: trial.id, elapsed: active.elapsed,
      checkpointIndex: active.checkpointIndex,
      previousPosition: point(active.previousPosition),
    };
  }
  const previous = saved.lastResult;
  if (trialById(previous?.id)
    && ["finished", "timeout", "abandoned", "invalid"].includes(previous.status)
    && finite(previous.elapsed) && previous.elapsed >= 0) {
    state.lastResult = {
      id: previous.id, status: previous.status, elapsed: previous.elapsed,
      reward: previous.status === "finished" && finite(previous.reward)
        ? Math.min(trialById(previous.id).reward, Math.max(0, previous.reward)) : 0,
      personalBest: previous.personalBest === true,
    };
  }
  return state;
}

export function getTrialsView(saved) {
  const state = normalizeTrials(saved);
  const trial = trialById(state.active?.id);
  const active = trial ? {
    id: trial.id, title: trial.title, name: trial.name,
    elapsed: state.active.elapsed,
    remaining: Math.max(0, trial.timeLimit - state.active.elapsed),
    timeLimit: trial.timeLimit,
    checkpointIndex: state.active.checkpointIndex,
    checkpointCount: trial.checkpoints.length,
    completedCheckpoints: state.active.checkpointIndex,
    progress: state.active.checkpointIndex / trial.checkpoints.length,
    nextCheckpoint: { ...trial.checkpoints[state.active.checkpointIndex] },
  } : null;
  return {
    trials: DRIVING_TRIALS.map((definition) => ({
      id: definition.id, name: definition.name, title: definition.title,
      description: definition.description,
      timeLimit: definition.timeLimit, reward: definition.reward,
      lengthMeters: routeLength(definition),
      start: { ...definition.start },
      checkpoints: definition.checkpoints.map((target) => ({ ...target })),
      ...state.records[definition.id],
      completed: state.records[definition.id].completions > 0,
      canStart: active === null,
      reason: active ? "Termina ou cancela o percurso atual." : "Vai ao quadro de percursos com um carro.",
    })),
    active,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    startPoints: TRIAL_START_POINTS.map((item) => ({ ...item })),
  };
}

export function startTrial(saved, id, context = {}) {
  const state = normalizeTrials(saved), trial = trialById(id);
  if (!trial) return result(false, state, "Esse percurso não existe.");
  if (state.active) return result(false, state, "Já tens um percurso em curso.");
  if (context.mapId && context.mapId !== "cidade")
    return result(false, state, "Os percursos começam em Santa Tomata.");
  if (!context.driving) return result(false, state, "Entra num carro para iniciar o percurso.");
  const position = point(context.position);
  if (!position || distance(position, trial.start) > 14)
    return result(false, state, "Leva o carro ao quadro de percursos junto à empresa.");
  state.active = { id: trial.id, elapsed: 0, checkpointIndex: 0, previousPosition: position };
  state.lastResult = null;
  const message = `${trial.name}: segue os arcos dourados. Tens ${trial.timeLimit} segundos.`;
  return result(true, state, message, 0, [message]);
}

function stopTrial(state, status, message) {
  state.lastResult = { id: state.active.id, status, elapsed: round(state.active.elapsed), reward: 0, personalBest: false };
  state.active = null;
  return result(true, state, message, 0, [message]);
}

function distanceToSegment(target, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const squared = dx * dx + dz * dz;
  if (squared === 0) return distance(target, from);
  const t = Math.min(1, Math.max(0, ((target.x - from.x) * dx + (target.z - from.z) * dz) / squared));
  return Math.hypot(target.x - from.x - dx * t, target.z - from.z - dz * t);
}

export function advanceTrial(saved, context = {}) {
  const state = normalizeTrials(saved);
  if (!state.active) return result(false, state);
  const { dt } = context, position = point(context.position);
  // Reject malformed updates without advancing a clock or accepting a checkpoint.
  if (!finite(dt) || dt <= 0 || dt > 5 || !position)
    return result(false, state, "Atualização de percurso inválida.");
  const active = state.active, trial = trialById(active.id);
  active.elapsed += dt;
  if (!context.driving || (context.mapId && context.mapId !== "cidade"))
    return stopTrial(state, "abandoned", "Percurso interrompido. Volta ao quadro para tentar novamente.");
  if (distance(active.previousPosition, position) > MAX_SPEED * dt + 2.5)
    return stopTrial(state, "invalid", "Percurso interrompido: o carro saiu da rota de forma inesperada.");
  if (active.elapsed > trial.timeLimit)
    return stopTrial(state, "timeout", "Tempo esgotado. Podes tentar de novo no quadro de percursos.");
  const target = trial.checkpoints[active.checkpointIndex];
  const passed = distanceToSegment(target, active.previousPosition, position) <= target.radius;
  active.previousPosition = position;
  if (!passed) return result(true, state);
  // One sequential checkpoint per update: crossing another part of the circuit
  // never skips checkpoints, even when two sections of the route are nearby.
  active.checkpointIndex += 1;
  if (active.checkpointIndex < trial.checkpoints.length) {
    const message = `Ponto ${active.checkpointIndex}/${trial.checkpoints.length} · ${trial.checkpoints[active.checkpointIndex].label}`;
    return result(true, state, message, 0, [message]);
  }
  const record = state.records[trial.id], elapsed = round(Math.max(MIN_RESULT_TIME, active.elapsed));
  const personalBest = record.bestTime === null || elapsed < record.bestTime;
  const reward = record.rewarded ? 0 : trial.reward;
  record.bestTime = personalBest ? elapsed : record.bestTime;
  record.completions += 1;
  record.rewarded = true;
  state.lastResult = { id: trial.id, status: "finished", elapsed, reward, personalBest };
  state.active = null;
  const message = `${trial.name} concluída em ${elapsed.toFixed(1)} s!${reward ? ` Patrocínio: +${reward} €.` : personalBest ? " Novo recorde pessoal!" : " O prémio deste percurso já foi recebido."}`;
  return result(true, state, message, reward, [message]);
}

export function cancelTrial(saved) {
  const state = normalizeTrials(saved);
  if (!state.active) return result(false, state, "Não tens um percurso em curso.");
  return stopTrial(state, "abandoned", "Percurso cancelado. O recorde e os prémios anteriores ficam guardados.");
}

// Physical, one-off jobs. This module owns no money, DOM, world objects or clock.
// The caller saves command.state and applies command.reward together, then
// dispatches command.events. Only interactFieldJob can advance an objective.
export const FIELD_JOBS_BOARD = Object.freeze({
  id: "field-board",
  type: "field-jobs",
  x: 11,
  z: 83,
  label: "Trabalhos da quinta",
});
export const FIELD_JOB_INTERACTION_RADIUS = 3;
export const FIELD_JOB_BOARD_RADIUS = 4;

const location = (id, x, z, label) => Object.freeze({ id, x, z, label });
const HQ = location("field-hq", 11, 83, "Quadro da quinta · sede");
const COOPERATIVE = location(
  "field-cooperative",
  -8,
  198,
  "Receção da cooperativa",
);
const MARKET = location("field-market", -102, -8, "Banca do mercado municipal");
const LOST_CRATES = location(
  "field-lost-crates",
  280,
  400,
  "Lote esquecido · cais poente",
);
const UNIVERSITY = location(
  "field-university",
  -342,
  -198,
  "Receção do instituto agrário",
);
const EXPORT = location(
  "field-export",
  288,
  400,
  "Carga de exportação · porto",
);
const step = (title, description, point, mode = "on-foot", event = null) =>
  Object.freeze({ title, description, point, mode, event });

export const FIELD_JOBS = Object.freeze([
  Object.freeze({
    id: "primeira-ronda",
    title: "A primeira ronda",
    contact: "Notas de Anselmo · o caderno das entregas",
    description:
      "No caderno de Anselmo há dois clientes que nunca ficaram sem tomate. Leva uma amostra à cooperativa e outra ao mercado, depois traz as guias assinadas à quinta.",
    reward: 300,
    timeLimit: 240,
    difficulty: "Entregas locais",
    steps: Object.freeze([
      step(
        "Recolher as duas remessas",
        "A Inês deixou as amostras junto ao quadro. Sai da viatura e carrega em E para as recolher.",
        HQ,
      ),
      step(
        "Entregar na cooperativa",
        "A Marta espera a primeira remessa na receção. Aproxima-te a pé e carrega em E para entregar.",
        COOPERATIVE,
      ),
      step(
        "Entregar no mercado",
        "O Rui guardou uma banca para a segunda amostra. Entrega-a a pé com E.",
        MARKET,
      ),
      step(
        "Trazer as guias à quinta",
        "As primeiras entregas estão feitas. Regressa ao quadro a pé e carrega em E para fechar a ronda.",
        HQ,
      ),
    ]),
  }),
  Object.freeze({
    id: "lote-perdido",
    title: "O lote desaparecido",
    contact: "Inês · uma marca antiga no cais",
    description:
      "Encontraram no porto caixas com o carimbo da antiga quinta de Anselmo. Recupera-as antes de desaparecerem e traz o lote numa viatura. O armazém tem companhia pouco simpática.",
    reward: 500,
    timeLimit: 240,
    difficulty: "Recuperação com risco",
    steps: Object.freeze([
      step(
        "Recolher a guia do armazém",
        "A guia está no quadro da quinta. Recolhe-a a pé com E e procura as caixas no cais poente.",
        HQ,
      ),
      step(
        "Recuperar as caixas",
        "Reconheces o velho carimbo de Anselmo. Sai da viatura e carrega em E junto às caixas; depois procura transporte para regressar.",
        LOST_CRATES,
        "on-foot",
        "ambush",
      ),
      step(
        "Trazer o lote numa viatura",
        "O lote já está contigo. Conduz até ao quadro da quinta e carrega em E ao volante para descarregar em segurança.",
        HQ,
        "vehicle",
      ),
    ]),
  }),
  Object.freeze({
    id: "selo-de-origem",
    title: "Selo de origem",
    contact: "Dra. Leonor · um nome para o futuro",
    description:
      "Uma amostra da quinta pode abrir a primeira rota de exportação. Leva-a ao instituto, apresenta o certificado no porto com uma viatura e devolve a documentação à Inês para o arquivo da quinta.",
    reward: 750,
    timeLimit: 360,
    difficulty: "Circuito de exportação",
    steps: Object.freeze([
      step(
        "Recolher a amostra da quinta",
        "A amostra e o pedido de certificação estão no quadro. Recolhe-os a pé com E.",
        HQ,
      ),
      step(
        "Obter o certificado de origem",
        "A Dra. Leonor preparou a análise no instituto agrário. Entrega a amostra a pé com E e recolhe o certificado.",
        UNIVERSITY,
      ),
      step(
        "Apresentar a carga no porto",
        "Leva a documentação ao terminal de exportação. Para na zona indicada e carrega em E ao volante de uma viatura.",
        EXPORT,
        "vehicle",
      ),
      step(
        "Arquivar o primeiro contrato",
        "O nome da quinta já chegou ao porto. Regressa ao quadro, sai da viatura e entrega o contrato à Inês para o arquivo da quinta com E.",
        HQ,
      ),
    ]),
  }),
]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const positionOf = (value) =>
  value && finite(value.x) && finite(value.z)
    ? { x: value.x, z: value.z }
    : null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const definitionFor = (id) => FIELD_JOBS.find((job) => job.id === id);
const count = (value) =>
  finite(value) ? Math.min(1_000_000, Math.max(0, Math.floor(value))) : 0;
const round = (value) => Math.round(value * 1000) / 1000;
const result = (
  ok,
  state,
  message = "",
  reward = 0,
  events = [],
  handled = false,
) => ({ ok, state, message, reward, events, handled });

export function createFieldJobs() {
  return {
    version: 1,
    active: null,
    records: Object.fromEntries(
      FIELD_JOBS.map(({ id }) => [
        id,
        {
          completed: false,
          rewarded: false,
          attempts: 0,
          failures: 0,
          bestTime: null,
        },
      ]),
    ),
    lastResult: null,
  };
}

export function normalizeFieldJobs(saved) {
  const state = createFieldJobs();
  if (!saved || typeof saved !== "object") return state;
  for (const job of FIELD_JOBS) {
    const source = saved.records?.[job.id];
    if (!source || typeof source !== "object") continue;
    const bestTime =
      finite(source.bestTime) &&
      source.bestTime >= 0 &&
      source.bestTime <= job.timeLimit
        ? source.bestTime
        : null;
    // A partially written completion record must never unlock another payment.
    const completed =
      source.completed === true ||
      source.rewarded === true ||
      bestTime !== null;
    const failures = count(source.failures);
    state.records[job.id] = {
      completed,
      rewarded: completed,
      attempts: Math.max(count(source.attempts), failures, completed ? 1 : 0),
      failures,
      bestTime,
    };
  }
  const previous = saved.lastResult;
  const previousJob = definitionFor(previous?.jobId);
  if (
    previousJob &&
    ["finished", "timeout", "defeated", "left-city", "abandoned"].includes(
      previous.status,
    ) &&
    finite(previous.elapsed) &&
    previous.elapsed >= 0 &&
    previous.elapsed <= previousJob.timeLimit
  ) {
    const finished = previous.status === "finished";
    state.lastResult = {
      jobId: previousJob.id,
      status: previous.status,
      elapsed: previous.elapsed,
      reward:
        finished && previous.reward === previousJob.reward
          ? previousJob.reward
          : 0,
    };
    if (finished) {
      const record = state.records[previousJob.id];
      record.completed = record.rewarded = true;
      record.attempts = Math.max(1, record.attempts);
      if (record.bestTime === null) record.bestTime = previous.elapsed;
    }
  }
  const source = saved.active;
  const job = definitionFor(source?.jobId);
  if (
    job &&
    !state.records[job.id].completed &&
    Number.isInteger(source.stepIndex) &&
    source.stepIndex >= 0 &&
    source.stepIndex < job.steps.length &&
    finite(source.elapsed) &&
    source.elapsed >= 0 &&
    source.elapsed <= job.timeLimit
  ) {
    const eventIndex = job.steps.findIndex((item) => item.event === "ambush");
    state.active = {
      jobId: job.id,
      stepIndex: source.stepIndex,
      elapsed: source.elapsed,
      ambushTriggered:
        eventIndex >= 0 &&
        (source.ambushTriggered === true || source.stepIndex > eventIndex),
    };
    state.records[job.id].attempts = Math.max(
      1,
      state.records[job.id].attempts,
    );
  }
  return state;
}

export function getFieldJobsView(saved, _world = null) {
  const state = normalizeFieldJobs(saved);
  const job = definitionFor(state.active?.jobId);
  const activeStep = job?.steps[state.active.stepIndex];
  const active = job
    ? {
        jobId: job.id,
        id: job.id,
        title: job.title,
        description: activeStep.description,
        stepTitle: activeStep.title,
        stepIndex: state.active.stepIndex,
        stepCount: job.steps.length,
        progress: state.active.stepIndex / job.steps.length,
        point: { ...activeStep.point },
        remaining: Math.max(0, job.timeLimit - state.active.elapsed),
        elapsed: state.active.elapsed,
        timeLimit: job.timeLimit,
        reward: job.reward,
        requiresVehicle: activeStep.mode === "vehicle",
        requiresOnFoot: activeStep.mode === "on-foot",
        requirement: activeStep.mode,
        requiresInteraction: true,
        interactionRadius: FIELD_JOB_INTERACTION_RADIUS,
      }
    : null;
  return {
    active,
    jobs: FIELD_JOBS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      contact: definition.contact,
      description: definition.description,
      difficulty: definition.difficulty,
      reward: definition.reward,
      timeLimit: definition.timeLimit,
      stepCount: definition.steps.length,
      steps: definition.steps.map((item) => ({
        title: item.title,
        description: item.description,
        point: { ...item.point },
        requiresVehicle: item.mode === "vehicle",
        requiresOnFoot: item.mode === "on-foot",
      })),
      ...state.records[definition.id],
      status: state.records[definition.id].completed
        ? "completed"
        : active?.jobId === definition.id
          ? "active"
          : "available",
      canStart: !active && !state.records[definition.id].completed,
    })),
    board: { ...FIELD_JOBS_BOARD },
    lastResult: state.lastResult ? { ...state.lastResult } : null,
  };
}

export function startFieldJob(saved, id, context = {}) {
  const state = normalizeFieldJobs(saved),
    job = definitionFor(id);
  if (!job) return result(false, state, "Esse trabalho não existe.");
  if (state.active)
    return result(
      false,
      state,
      "Termina ou cancela o trabalho que tens em mãos.",
    );
  if (state.records[job.id].completed)
    return result(false, state, "Esse trabalho já ficou concluído e pago.");
  if (context.mapId !== "cidade")
    return result(
      false,
      state,
      "Os trabalhos da quinta começam em Santa Tomata.",
    );
  if (context.founded !== true)
    return result(
      false,
      state,
      "Funda primeiro a tua empresa para aceitar os trabalhos de Anselmo.",
    );
  if (context.driving !== false)
    return result(
      false,
      state,
      "Sai da viatura para consultar o quadro da quinta.",
    );
  const position = positionOf(context.position);
  if (
    !position ||
    distance(position, FIELD_JOBS_BOARD) > FIELD_JOB_BOARD_RADIUS
  )
    return result(
      false,
      state,
      "Vai a pé ao quadro junto à sede para aceitar este trabalho.",
    );
  state.active = {
    jobId: job.id,
    stepIndex: 0,
    elapsed: 0,
    ambushTriggered: false,
  };
  state.records[job.id].attempts = Math.min(
    1_000_000,
    state.records[job.id].attempts + 1,
  );
  state.lastResult = null;
  return result(
    true,
    state,
    `${job.title}: recolhe o material no quadro com E.`,
    0,
    [{ type: "started", jobId: job.id, point: { ...job.steps[0].point } }],
  );
}

function stopJob(state, status, message, handled = false) {
  const active = state.active,
    job = definitionFor(active.jobId),
    record = state.records[job.id];
  record.failures = Math.min(1_000_000, record.failures + 1);
  state.lastResult = {
    jobId: job.id,
    status,
    elapsed: round(Math.min(job.timeLimit, active.elapsed)),
    reward: 0,
  };
  state.active = null;
  return result(
    true,
    state,
    message,
    0,
    [{ type: "failed", jobId: job.id, reason: status }],
    handled,
  );
}

export function canInteractFieldJob(saved, context = {}) {
  const state = normalizeFieldJobs(saved),
    active = state.active;
  if (
    !active ||
    context.mapId !== "cidade" ||
    typeof context.driving !== "boolean"
  )
    return false;
  const job = definitionFor(active.jobId),
    target = job.steps[active.stepIndex];
  const position = positionOf(context.position);
  return (
    active.elapsed < job.timeLimit &&
    !!position &&
    distance(position, target.point) <= FIELD_JOB_INTERACTION_RADIUS &&
    context.driving === (target.mode === "vehicle")
  );
}

export function interactFieldJob(saved, context = {}) {
  const state = normalizeFieldJobs(saved),
    active = state.active;
  if (!active) return result(false, state);
  const job = definitionFor(active.jobId),
    target = job.steps[active.stepIndex];
  const position = positionOf(context.position);
  if (
    context.mapId !== "cidade" ||
    !position ||
    typeof context.driving !== "boolean"
  )
    return result(false, state, "Não é possível entregar neste local.");
  if (active.elapsed >= job.timeLimit)
    return stopJob(
      state,
      "timeout",
      "O prazo terminou. Podes voltar ao quadro e tentar de novo.",
    );
  if (distance(position, target.point) > FIELD_JOB_INTERACTION_RADIUS)
    return result(
      false,
      state,
      "Aproxima-te do objetivo e carrega em E para continuar.",
    );
  if (context.driving !== (target.mode === "vehicle"))
    return result(
      false,
      state,
      target.mode === "vehicle"
        ? "Faz esta entrega ao volante de uma viatura."
        : "Sai da viatura e aproxima-te a pé para continuar.",
    );
  const events = [];
  if (target.event === "ambush" && !active.ambushTriggered) {
    active.ambushTriggered = true;
    events.push({ type: "ambush", jobId: job.id, point: { ...target.point } });
  }
  active.stepIndex += 1;
  if (active.stepIndex < job.steps.length) {
    const next = job.steps[active.stepIndex];
    events.push({
      type: "objective",
      jobId: job.id,
      stepIndex: active.stepIndex,
      point: { ...next.point },
    });
    const message =
      target.event === "ambush"
        ? "Recuperaste o lote. Há rivais a aproximar-se: procura uma viatura e regressa à quinta."
        : `${target.title}: feito. ${next.description}`;
    return result(true, state, message, 0, events, true);
  }
  const record = state.records[job.id];
  const reward = record.rewarded ? 0 : job.reward;
  const elapsed = round(Math.min(active.elapsed, job.timeLimit));
  record.completed = record.rewarded = true;
  record.bestTime =
    record.bestTime === null ? elapsed : Math.min(record.bestTime, elapsed);
  state.lastResult = { jobId: job.id, status: "finished", elapsed, reward };
  state.active = null;
  events.push({ type: "completed", jobId: job.id, reward });
  return result(
    true,
    state,
    `${job.title} concluído. A quinta recebeu ${reward} €.`,
    reward,
    events,
    true,
  );
}

export function advanceFieldJobs(saved, context = {}) {
  const state = normalizeFieldJobs(saved),
    active = state.active;
  if (!active) return result(false, state);
  // Pausing is the caller's responsibility: don't call while menus are open.
  // Invalid updates cannot consume time, deliver cargo or dispatch an ambush.
  if (
    !finite(context.dt) ||
    context.dt <= 0 ||
    !positionOf(context.position) ||
    typeof context.driving !== "boolean" ||
    typeof context.mapId !== "string" ||
    !finite(context.health)
  )
    return result(false, state);
  if (context.mapId !== "cidade")
    return stopJob(
      state,
      "left-city",
      "O trabalho ficou interrompido ao sair de Santa Tomata. Podes tentar de novo no quadro.",
    );
  if (context.health <= 0)
    return stopJob(
      state,
      "defeated",
      "O lote regressou ao armazém. Recupera e volta ao quadro para tentar de novo.",
    );
  const job = definitionFor(active.jobId);
  active.elapsed = Math.min(job.timeLimit, active.elapsed + context.dt);
  if (active.elapsed >= job.timeLimit)
    return stopJob(
      state,
      "timeout",
      "O prazo terminou. Podes voltar ao quadro e tentar de novo.",
    );
  return result(true, state);
}

export function cancelFieldJob(saved) {
  const state = normalizeFieldJobs(saved);
  if (!state.active)
    return result(false, state, "Não tens nenhum trabalho em curso.");
  return stopJob(
    state,
    "abandoned",
    "Trabalho cancelado. A encomenda fica disponível para outra tentativa.",
  );
}

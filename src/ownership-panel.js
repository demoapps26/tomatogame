import {
  getOwnershipView,
  buyCar,
  repairCar,
  refuelCar,
  buyProperty,
  upgradeProperty,
  restAtProperty,
  claimMilestone,
  setHome,
} from "./ownership.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
const money = (value) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
const number = (value, decimals = 0) =>
  new Intl.NumberFormat("pt-PT", {
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);
const tabs = [
  ["overview", "O teu património", "01"],
  ["cars", "Stand de automóveis", "02"],
  ["garage", "A tua garagem", "03"],
  ["homes", "Casas e interiores", "04"],
  ["milestones", "Marcos da história", "05"],
  ["trials", "Percursos de condução", "06"],
];
const carShapes = {
  compact: "M29 69 40 53 69 48 91 28 156 28 183 49 219 56 233 71 231 86 25 86Z",
  pickup: "M25 61 103 59 111 31 159 31 179 56 226 61 237 72 235 86 24 86Z",
  van: "M27 76 30 24 169 24 189 47 222 57 234 74 231 86 27 86Z",
  sport: "M20 72 54 60 105 40 153 40 183 61 222 68 238 80 235 88 23 88Z",
  suv: "M25 65 43 34 161 31 190 53 220 58 234 72 232 87 24 87Z",
};
function carArt(car) {
  const colour =
    typeof car.color === "number"
      ? `#${car.color.toString(16).padStart(6, "0").slice(-6)}`
      : /^#[a-f\d]{6}$/i.test(car.color || "")
        ? car.color
        : "#557267";
  return `<svg class="ownership-car-art" viewBox="0 0 260 112" aria-hidden="true"><ellipse cx="130" cy="94" rx="111" ry="8" fill="#19392a12"/><path d="${carShapes[car.modelId || car.id] || carShapes.compact}" fill="${colour}" stroke="#233c32" stroke-width="2"/><path d="M111 36h42l22 22h-73Z" fill="#cad7d6" opacity=".86"/><path d="M41 68h23M198 69h20" stroke="#e8dbc2" stroke-width="4"/><circle cx="66" cy="85" r="17" fill="#26372f"/><circle cx="66" cy="85" r="9" fill="#b1b6a5"/><circle cx="199" cy="85" r="17" fill="#26372f"/><circle cx="199" cy="85" r="9" fill="#b1b6a5"/><path d="M88 70h86" stroke="#ffffff35" stroke-width="2"/></svg>`;
}
function houseArt(property) {
  const villa = property.id === "villa-mar",
    apartment = property.id === "apartamento";
  return `<div class="ownership-house-art ${villa ? "is-villa" : apartment ? "is-apartment" : "is-garden"}" aria-hidden="true"><i class="house-sun"></i><i class="house-ground"></i><i class="house-building"><b></b><b></b><b></b><b></b><em></em></i><i class="house-tree"></i>${villa ? '<i class="house-water"></i>' : ""}</div>`;
}
function disabled(flag) {
  return flag ? "disabled" : "";
}

/** A visitable showroom, garage and homes, backed entirely by pure commands. */
export function createOwnershipPanel({
  getCompany,
  setCompany,
  notify,
  onStateChange,
  trackPlace,
  onEquipCar,
  onRest,
  getTrials,
  onStartTrial,
  onCancelTrial,
  onTrackTrial,
  isFounded = () => true,
}) {
  let opened = false,
    disposed = false,
    tab = "overview",
    activePoint = null,
    focusedProperty = null,
    message = "",
    previousFocus = null;
  const panel = document.createElement("section");
  panel.id = "ownership-panel";
  panel.className = "ownership-overlay";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "ownership-title");
  panel.innerHTML = `<div class="ownership-window"><header class="ownership-header"><div><span class="company-tag" id="ownership-eyebrow">SANTA TOMATA · A TUA VIDA NA CIDADE</span><h2 id="ownership-title">Mais do que uma empresa.</h2><p id="ownership-subtitle">Uma garagem, uma casa e novas razões para sair à rua.</p></div><button id="ownership-close" type="button" aria-label="Fechar património e voltar à cidade">×</button></header><div class="ownership-layout"><nav class="ownership-nav" aria-label="Áreas do património">${tabs.map(([id, label, index]) => `<button type="button" data-ownership-tab="${id}"><small>${index}</small><span>${label}</span></button>`).join("")}<div class="ownership-cash"><span>CAIXA DISPONÍVEL</span><strong id="ownership-cash">0 €</strong><p>As compras e os serviços usam a tesouraria da empresa e ficam registados no diário.</p></div></nav><div class="ownership-content"><p id="ownership-feedback" role="status"></p><div id="ownership-body"></div></div></div><footer class="ownership-footer"><span id="ownership-location">Explora o stand e as casas no terreno.</span><span>G / Esc · Voltar à cidade</span></footer></div>`;
  document.getElementById("arena").append(panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  const canTrade = () => activePoint?.type === "dealership";
  const canService = () => ["dealership", "garage"].includes(activePoint?.type);
  const isAtProperty = (id) =>
    activePoint?.propertyId === id ||
    activePoint?.id === id ||
    activePoint?.id === `${id}-rest`;
  const canRestHere = (id) => activePoint?.type === "rest" && isAtProperty(id);
  function visit(id) {
    close();
    trackPlace?.(id);
  }
  function locationText() {
    if (!activePoint)
      return "Consulta o teu património. Marca uma visita para tratar dos negócios no terreno.";
    if (activePoint.type === "dealership")
      return "PAULO · SANTA TOMATA MOTORS · Compra e levanta a viatura no parque.";
    if (activePoint.type === "garage")
      return "OFICINA E GARAGEM · Abastecimento, reparação e levantamento de viaturas.";
    return activePoint.label || activePoint.name || "VISITA AO IMÓVEL";
  }
  function metric(label, value, note = "") {
    return `<div class="ownership-metric"><span>${escape(label)}</span><strong>${escape(value)}</strong>${note ? `<small>${escape(note)}</small>` : ""}</div>`;
  }
  function action(label, action, id, disabledFlag = false, secondary = false) {
    return `<button type="button" class="company-action ${secondary ? "secondary" : ""}" data-ownership-action="${action}" ${id ? `data-id="${escape(id)}"` : ""} ${disabled(disabledFlag)}>${escape(label)}</button>`;
  }
  function renderOverview(view) {
    const vehicles = view.vehicles || [],
      properties = view.properties || [],
      milestones = view.milestones || [];
    const owned = properties.filter((property) => property.owned),
      home = properties.find((property) => property.id === view.homeId);
    return `<article class="ownership-intro"><span class="company-tag">A VIDA PARA LÁ DA COLHEITA</span><h3>Faz da cidade a tua casa.</h3><p>Escolhe um automóvel no stand, mantém-no na oficina e visita imóveis com interiores percorríveis. O teu progresso ganha marcos, uma garagem e uma base para regressar.</p></article><div class="ownership-metrics">${metric("VIATURAS", vehicles.length, "na tua garagem")}${metric("IMÓVEIS", owned.length, "comprados na cidade")}${metric("CASA BASE", home?.name || home?.title || "Por escolher", home ? "ponto de descanso" : "visita um imóvel")}${metric("MARCOS", `${milestones.filter((item) => item.claimed).length} / ${milestones.length}`, "recompensas recebidas")}</div><div class="ownership-feature-grid"><article class="ownership-card"><span class="company-tag">SANTA TOMATA MOTORS</span>${carArt({ modelId: "sport", color: "#66806e" })}<h3>O próximo carro da tua história.</h3><p>Cinco modelos com preços, consumo e comportamento distintos. Vê o stand antes de decidir.</p><div class="ownership-actions">${action("Ver o catálogo", "tab", "cars")}${action("Visitar o stand", "visit", "car-dealer", !trackPlace, true)}</div></article><article class="ownership-card"><span class="company-tag">LUGARES PARA REGRESSAR</span>${houseArt({ id: "casa-jardim" })}<h3>Uma chave para uma vida nova.</h3><p>Um apartamento, uma casa com jardim ou uma villa junto ao mar. Entra, visita e melhora o teu espaço.</p><div class="ownership-actions">${action("Explorar imóveis", "tab", "homes")}${action("Os teus marcos", "tab", "milestones", false, true)}</div></article></div><article class="ownership-note"><strong>Crescer com contas certas.</strong><p>Estas compras usam a caixa da empresa. Os custos ficam no diário; casas e veículos não criam rendimentos por si. As carrinhas de distribuição continuam a ser geridas em Empresa → Crescimento.</p></article>`;
  }
  function renderCars(view) {
    return `<article class="ownership-intro"><span class="company-tag">CATÁLOGO · CINCO FORMAS DE CONDUZIR</span><h3>${canTrade() ? "Escolhe. Experimenta a cidade." : "Encontra o teu próximo automóvel."}</h3><p>${canTrade() ? "Estás no stand. O preço inclui a viatura pronta a sair do parque, com depósito cheio. As diferenças de motor, direção e travagem sentem-se na estrada." : "Consulta o catálogo e marca uma visita ao stand para comprar. Os automóveis comprados ficam guardados na campanha."}</p>${!canTrade() ? action("Marcar visita ao stand", "visit", "car-dealer", !trackPlace) : ""}</article><div class="ownership-catalog">${(
      view.cars || []
    )
      .map((car) => {
        const vehicle = (view.vehicles || []).find(
          (item) => item.id === car.vehicleId,
        );
        const speed = car.topSpeedKmh ?? (Number(car.topSpeed) || 0) * 3.6;
        return `<article class="ownership-card ownership-car-card" data-car-model="${escape(car.modelId || car.id)}"><div class="ownership-card-top"><span class="company-tag">${car.owned ? "NA TUA GARAGEM" : "DISPONÍVEL NO STAND"}</span><strong class="ownership-price">${money(car.price)}</strong></div>${carArt(car)}<h3>${escape(car.name || car.title)}</h3><p>${escape(car.description)}</p><dl class="ownership-specs"><div><dt>Velocidade</dt><dd>${number(speed)} <small>km/h</small></dd></div><div><dt>Motor</dt><dd>${number(car.acceleration, 1)} <small>m/s²</small></dd></div><div><dt>Depósito</dt><dd>${number(car.fuelCapacity)} <small>L</small></dd></div><div><dt>Consumo</dt><dd>${number(car.litresPer100Km, 1)} <small>L/100 km</small></dd></div></dl>${car.owned ? `<p class="ownership-owned-line">${vehicle ? `${number(vehicle.fuel, 1)} L · estado ${number(vehicle.condition)}% · ${number(vehicle.distanceKm ?? vehicle.odometer / 1000, 1)} km` : "Compra registada e guardada."}</p>${action(canService() ? "Preparar no parque" : "Ver na tua garagem", canService() ? "equip" : "tab", canService() ? car.vehicleId : "garage", !isFounded())}` : canTrade() ? `${action(`Comprar por ${money(car.price)}`, "buy-car", car.modelId || car.id, !car.canBuy)}${car.reason ? `<small class="ownership-reason">${escape(car.reason)}</small>` : ""}` : action("Visitar para comprar", "visit", "car-dealer", !trackPlace, true)}</article>`;
      })
      .join("")}</div>`;
  }
  function renderGarage(view) {
    return `<article class="ownership-intro"><span class="company-tag">GARAGEM · CUIDAR DO QUE É TEU</span><h3>Pronto para a próxima viagem.</h3><p>O combustível e o estado de cada viatura ficam guardados. Colisões e quilómetros têm consequências; a oficina prepara o carro para continuar.</p>${!canService() ? action("Ir à garagem e oficina", "visit", "garage-service", !trackPlace) : ""}</article>${!(view.vehicles || []).length ? `<article class="ownership-empty"><h3>A tua garagem ainda está vazia.</h3><p>Os carros estacionados na rua não fazem parte do teu património. Visita o stand para escolher a primeira viatura.</p>${action("Conhecer o stand", "visit", "car-dealer", !trackPlace)}</article>` : `<div class="ownership-catalog">${view.vehicles.map((vehicle) => `<article class="ownership-card"><span class="company-tag">VIATURA PRÓPRIA · ${escape(vehicle.id)}</span>${carArt(vehicle)}<h3>${escape(vehicle.name || vehicle.title || vehicle.modelId)}</h3><div class="ownership-vehicle-bars"><label><span>Combustível <b>${number(vehicle.fuel, 1)} / ${number(vehicle.maxFuel)} L</b></span><progress max="${Math.max(1, Number(vehicle.maxFuel) || 1)}" value="${Math.max(0, Number(vehicle.fuel) || 0)}"></progress></label><label><span>Estado <b>${number(vehicle.condition)}%</b></span><progress max="100" value="${Math.max(0, Number(vehicle.condition) || 0)}"></progress></label></div><p class="ownership-mileage">${number(vehicle.distanceKm ?? vehicle.odometer / 1000, 1)} km percorridos</p>${canService() ? `<div class="ownership-actions">${action(`Atestar · ${money(vehicle.refuelCost)}`, "refuel", vehicle.id, !vehicle.canRefuel, true)}${action(`Reparar · ${money(vehicle.repairCost)}`, "repair", vehicle.id, !vehicle.canRepair, true)}${action("Preparar no parque", "equip", vehicle.id, !vehicle.drivable)}</div>${!vehicle.drivable ? `<small class="ownership-reason">Abastece e repara a viatura antes de partir.</small>` : ""}${vehicle.refuelReason && !vehicle.canRefuel ? `<small class="ownership-reason">${escape(vehicle.refuelReason)}</small>` : ""}${vehicle.repairReason && !vehicle.canRepair ? `<small class="ownership-reason">${escape(vehicle.repairReason)}</small>` : ""}` : action("Visitar a oficina", "visit", "garage-service", !trackPlace, true)}</article>`).join("")}</div>`}`;
  }
  function renderHomes(view) {
    const properties = [...(view.properties || [])].sort(
      (a, b) =>
        (a.id === focusedProperty ? -1 : 0) -
        (b.id === focusedProperty ? -1 : 0),
    );
    return `<article class="ownership-intro"><span class="company-tag">IMÓVEIS · INTERIORES PARA EXPLORAR</span><h3>Uma casa não é apenas uma morada.</h3><p>Entra e conhece cada espaço antes de comprar. Uma casa própria permite descansar, escolher uma base e investir no mobiliário. Cada melhoria aparece no interior.</p></article><div class="ownership-homes">${properties.map((property) => `<article class="ownership-card ownership-home-card ${focusedProperty === property.id ? "is-current" : ""}" data-property-id="${escape(property.id)}"><div class="ownership-card-top"><span class="company-tag">${property.home || property.isHome ? "A TUA CASA BASE" : property.owned ? "IMÓVEL PRÓPRIO" : "VISITAS ABERTAS"}</span><strong class="ownership-price">${money(property.price)}</strong></div>${houseArt(property)}<h3>${escape(property.name || property.title)}</h3><p>${escape(property.description)}</p>${property.owned ? `<div class="ownership-home-level"><span>CONFORTO E MOBILIÁRIO</span><strong>Nível ${number(property.level)} / ${number(property.maxLevel || 3)}</strong><progress max="${property.maxLevel || 3}" value="${property.level || 0}" aria-label="Nível de mobiliário"></progress></div><div class="ownership-actions">${!property.home && !property.isHome ? action("Definir como casa base", "set-home", property.id) : ""}${isAtProperty(property.id) ? action(`Melhorar mobiliário · ${money(property.upgradeCost)}`, "upgrade-home", property.id, !property.canUpgrade, true) : action("Visitar para melhorar", "visit", property.id, !trackPlace, true)}${canRestHere(property.id) ? action("Descansar e guardar", "rest", property.id, !property.canRest) : action("Ir ao ponto de descanso", "visit", `${property.id}-rest`, !trackPlace)}</div>${property.upgradeReason && isAtProperty(property.id) ? `<small class="ownership-reason">${escape(property.upgradeReason)}</small>` : ""}${property.restReason && canRestHere(property.id) ? `<small class="ownership-reason">${escape(property.restReason)}</small>` : ""}` : `<div class="ownership-actions">${isAtProperty(property.id) ? action(`Comprar por ${money(property.price)}`, "buy-home", property.id, !property.canBuy) : action("Marcar visita", "visit", property.id, !trackPlace)}${isAtProperty(property.id) && property.reason ? `<small class="ownership-reason">${escape(property.reason)}</small>` : ""}</div>`}</article>`).join("")}</div>`;
  }
  function renderMilestones(view) {
    return `<article class="ownership-intro"><span class="company-tag">MARCOS · UMA HISTÓRIA QUE SE CONSTRÓI</span><h3>O progresso vem do que fazes.</h3><p>Entregas reais, clientes na loja e património comprado contam para os teus marcos. Cada recompensa só pode ser recebida uma vez e fica guardada.</p></article><div class="ownership-milestones">${(view.milestones || []).map((milestone) => `<article class="ownership-card ownership-milestone ${milestone.claimed ? "is-claimed" : ""}"><span class="ownership-milestone-check" aria-hidden="true">${milestone.claimed ? "✓" : milestone.complete ? "+" : "○"}</span><div><span class="company-tag">${milestone.claimed ? "RECOMPENSA RECEBIDA" : milestone.complete ? "MARCO CONCLUÍDO" : "EM PROGRESSO"}</span><h3>${escape(milestone.name || milestone.title)}</h3><p>${escape(milestone.description)}</p><label class="ownership-milestone-progress"><span>${number(Math.min(milestone.progress || 0, milestone.target || 1))} / ${number(milestone.target || 1)}</span><progress max="${milestone.target || 1}" value="${Math.min(milestone.progress || 0, milestone.target || 1)}"></progress></label><strong class="ownership-reward">${money(milestone.reward)}${milestone.reputationReward ? ` · reputação +${number(milestone.reputationReward)}` : ""}</strong>${action(milestone.claimed ? "Já recebida" : "Receber recompensa", "claim", milestone.id, !milestone.canClaim && !milestone.claimable)}${milestone.reason && !milestone.claimed ? `<small class="ownership-reason">${escape(milestone.reason)}</small>` : ""}</div></article>`).join("")}</div>`;
  }
  function renderTrials() {
    const view = getTrials?.() || { trials: [] },
      active = view.active;
    const board = activePoint?.type === "race";
    return `<article class="ownership-intro"><span class="company-tag">PERCURSOS · CONHECE A CIDADE AO VOLANTE</span><h3>Uma partida. Uma rota. O teu melhor tempo.</h3><p>Leva uma viatura ao quadro de percursos, segue os pontos de controlo pela ordem indicada e regressa dentro do limite. A primeira conclusão de cada percurso recebe uma recompensa; as seguintes melhoram o teu recorde.</p>${!board ? action("Visitar o quadro de percursos", "visit", "trial-board", !trackPlace) : "<p>Estás no quadro. Para partir, tens de estar ao volante de uma viatura próxima.</p>"}</article>${active ? `<article class="ownership-card ownership-trial-active"><span class="company-tag">PERCURSO EM CURSO</span><h3>${escape(active.name || active.title || "Uma rota pela cidade")}</h3><p>O cronómetro pausa enquanto este painel está aberto. Regressa ao terreno para continuar.</p>${action("Continuar a conduzir", "close")}${action("Abandonar este percurso", "cancel-trial", "", !onCancelTrial, true)}</article>` : ""}<div class="ownership-catalog">${(view.trials || []).map((trial) => `<article class="ownership-card ownership-trial"><span class="ownership-trial-route" aria-hidden="true"><i></i><b></b><i></i></span><span class="company-tag">${trial.completions ? "PERCURSO CONCLUÍDO" : "NOVO DESAFIO"}</span><h3>${escape(trial.name || trial.title)}</h3><p>${escape(trial.description)}</p><dl class="ownership-specs"><div><dt>Distância</dt><dd>${number(trial.lengthMeters)} <small>m</small></dd></div><div><dt>Limite</dt><dd>${number(trial.timeLimit)} <small>s</small></dd></div><div><dt>Melhor tempo</dt><dd>${trial.bestTime ? number(trial.bestTime, 1) + " s" : "Por registar"}</dd></div><div><dt>Primeira chegada</dt><dd>${money(trial.reward)}</dd></div></dl>${trial.completions ? `<p class="ownership-owned-line">${number(trial.completions)} ${trial.completions === 1 ? "conclusão" : "conclusões"} · recompensa inicial já recebida.</p>` : ""}${board ? action(active ? "Termina o percurso em curso" : "Iniciar percurso", "start-trial", trial.id, !!active || !onStartTrial) : action("Marcar a partida", "track-trial", trial.id, !onTrackTrial && !trackPlace, true)}</article>`).join("") || `<article class="ownership-empty"><p>Os percursos estão a ser preparados para esta cidade.</p></article>`}</div>`;
  }
  function selectTab(name) {
    tab = tabs.some(([id]) => id === name) ? name : "overview";
    for (const button of panel.querySelectorAll("[data-ownership-tab]")) {
      const selected = button.dataset.ownershipTab === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-current", selected ? "page" : "false");
    }
  }
  function refresh() {
    if (!opened || disposed) return;
    const focus = document.activeElement;
    const focusAction = focus?.dataset?.ownershipAction,
      focusId = focus?.dataset?.id;
    const company = getCompany(),
      view = getOwnershipView(company);
    $("ownership-cash").textContent = money(view.cash ?? company.cash);
    $("ownership-feedback").textContent = message;
    $("ownership-location").textContent = locationText();
    $("ownership-title").textContent =
      activePoint?.type === "dealership"
        ? "Santa Tomata Motors"
        : activePoint?.type === "garage"
          ? "A tua garagem e oficina"
          : focusedProperty
            ? (view.properties || []).find(
                (property) => property.id === focusedProperty,
              )?.name || "Uma casa para o teu futuro"
            : "Mais do que uma empresa.";
    const renderers = {
      overview: renderOverview,
      cars: renderCars,
      garage: renderGarage,
      homes: renderHomes,
      milestones: renderMilestones,
      trials: renderTrials,
    };
    $("ownership-body").innerHTML = renderers[tab](view);
    selectTab(tab);
    if (focusAction) {
      const matching = [
        ...panel.querySelectorAll("[data-ownership-action]"),
      ].find(
        (button) =>
          button.dataset.ownershipAction === focusAction &&
          button.dataset.id === focusId &&
          !button.disabled,
      );
      (matching || $("ownership-close")).focus({ preventScroll: true });
    }
  }
  function apply(result) {
    message = result?.message || "Não foi possível concluir esta ação.";
    if (result?.ok) setCompany(result.state);
    notify?.(message);
    refresh();
    return !!result?.ok;
  }
  function open(target = "overview") {
    if (disposed) return false;
    if (!isFounded()) {
      notify?.("Funda a empresa antes de começar a comprar património.");
      return false;
    }
    activePoint = target && typeof target === "object" ? target : null;
    focusedProperty =
      activePoint?.propertyId ||
      (["property", "rest"].includes(activePoint?.type)
        ? activePoint.id?.replace(/-rest$/, "")
        : null);
    selectTab(
      activePoint?.type === "dealership"
        ? "cars"
        : activePoint?.type === "garage"
          ? "garage"
          : activePoint?.type === "race"
            ? "trials"
            : focusedProperty
              ? "homes"
              : typeof target === "string"
                ? target
                : "overview",
    );
    message = "";
    if (!opened) previousFocus = document.activeElement;
    opened = true;
    panel.hidden = false;
    onStateChange?.(true);
    refresh();
    panel.querySelector(".ownership-content").scrollTop = 0;
    $("ownership-close").focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!opened) return false;
    opened = false;
    activePoint = null;
    focusedProperty = null;
    panel.hidden = true;
    onStateChange?.(false);
    const returnTarget =
      previousFocus?.isConnected &&
      !panel.contains(previousFocus) &&
      !previousFocus.closest?.("[hidden], [inert]") &&
      previousFocus.getClientRects?.().length
        ? previousFocus
        : document.getElementById("view") || document.getElementById("arena");
    if (returnTarget) {
      if (!returnTarget.hasAttribute("tabindex") && returnTarget.tabIndex < 0)
        returnTarget.tabIndex = -1;
      returnTarget.focus?.({ preventScroll: true });
    }
    previousFocus = null;
    return true;
  }
  panel.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-ownership-tab]");
    if (tabButton) {
      selectTab(tabButton.dataset.ownershipTab);
      message = "";
      refresh();
      panel.querySelector(".ownership-content").scrollTop = 0;
      return;
    }
    const button = event.target.closest("[data-ownership-action]");
    if (!button || button.disabled) return;
    const { ownershipAction: kind, id } = button.dataset,
      current = getCompany();
    if (kind === "tab") {
      selectTab(id);
      message = "";
      refresh();
      panel.querySelector(".ownership-content").scrollTop = 0;
    }
    if (kind === "visit") visit(id);
    if (kind === "close") close();
    if (kind === "track-trial") {
      close();
      if (onTrackTrial) onTrackTrial(id);
      else trackPlace?.("trial-board");
    }
    if (kind === "start-trial" && activePoint?.type === "race") {
      const result = onStartTrial?.(id);
      if (result?.ok === false) {
        message =
          result.message || "Aproxima uma viatura da partida para começar.";
        notify?.(message);
        refresh();
      } else close();
    }
    if (kind === "cancel-trial") {
      onCancelTrial?.();
      message = "Percurso abandonado. Podes voltar ao quadro para recomeçar.";
      refresh();
    }
    if (kind === "buy-car" && canTrade()) {
      const result = buyCar(current, id);
      if (apply(result)) {
        const vehicleId =
          result.vehicleId ||
          (getOwnershipView(getCompany()).cars || []).find(
            (car) => (car.modelId || car.id) === id,
          )?.vehicleId;
        close();
        onEquipCar?.(vehicleId);
      }
    }
    if (kind === "equip" && canService()) {
      close();
      onEquipCar?.(id);
    }
    if (kind === "refuel" && canService()) apply(refuelCar(current, id));
    if (kind === "repair" && canService()) apply(repairCar(current, id));
    if (kind === "buy-home" && isAtProperty(id))
      apply(buyProperty(current, id));
    if (kind === "upgrade-home" && isAtProperty(id))
      apply(upgradeProperty(current, id));
    if (kind === "set-home") apply(setHome(current, id));
    if (kind === "rest" && canRestHere(id)) {
      const result = restAtProperty(current, id);
      if (apply(result)) {
        close();
        onRest?.(id, result);
      }
    }
    if (kind === "claim") apply(claimMilestone(current, id));
  });
  $("ownership-close").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => {
    if (!opened) return;
    const key = event.key.toLowerCase();
    if (["escape", "b", "g"].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (key === "tab") {
      const controls = [
        ...panel.querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]',
        ),
      ].filter((control) => control.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  return {
    interact(point) {
      return ["dealership", "garage", "property", "rest", "race"].includes(
        point?.type,
      )
        ? open(point)
        : false;
    },
    open,
    close,
    isOpen: () => opened,
    refresh,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      panel.remove();
    },
  };
}

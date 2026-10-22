import {
  createCompany,
  getCompanyView,
  applyDecision,
  advanceDay,
  acceptContract,
  buyUpgrade,
} from "./company.js";
import {
  getOperationsView,
  buyFleetVehicle,
  dispatchFleet,
} from "./operations.js";
const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value) || 0);
const readable = (value) =>
  Array.isArray(value)
    ? value.map(readable).join(" · ")
    : value && typeof value === "object"
      ? Object.entries(value)
          .map(([key, v]) => `${key}: ${v}`)
          .join(" · ")
      : String(value ?? "");
export function createCompanyPanel({
  getCompany,
  setCompany,
  isFounded,
  foundCompany,
  trackContract,
  close,
  notify,
  navigateToPlace,
}) {
  let tab = "overview",
    lastReport = null;
  const feedback = document.createElement("p");
  feedback.id = "company-feedback";
  feedback.className = "company-feedback";
  feedback.setAttribute("role", "status");
  $("company-subtitle").after(feedback);
  const describeReport = (report) =>
    typeof report === "object" && report
      ? `Dia ${report.day}: ${report.produced} caixas produzidas. Salários ${money(report.wages)}, manutenção ${money(report.overhead)}, sementes ${money(report.seeds)} e juros ${money(report.interest)}. Custos operacionais ${money(report.costs)}${report.penalties ? ", penalizações " + money(report.penalties) : ""}. ${report.spoiled ? report.spoiled + " caixas perdidas por falta de armazenamento. " : ""}${report.expired ? report.expired + " contratos falharam. " : ""}${report.weather || ""}`
      : String(report || "");
  const tabs = [...document.querySelectorAll("[data-company-tab]")];
  function selectTab(name) {
    const previous = tab;
    tab = ["overview", "story", "contracts", "upgrades", "ledger"].includes(
      name,
    )
      ? name
      : "overview";
    for (const button of tabs) {
      const selected = button.dataset.companyTab === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const page of document.querySelectorAll("[data-company-page]"))
      page.hidden = page.dataset.companyPage !== tab;
    if (previous !== tab)
      $("company-panel").querySelector(".company-main").scrollTop = 0;
  }
  function render() {
    const company = getCompany(),
      view = getCompanyView(company),
      operations = getOperationsView(company);
    const reportToShow = lastReport || company.lastReport;
    $("company-title").textContent = company.name;
    const initials = company.name
      .split(/\s+/)
      .filter((part) => /[a-zA-ZÀ-ÿ]/.test(part))
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("·");
    $("company-panel").querySelector(".company-seal").textContent =
      initials || "TR";
    $("company-subtitle").textContent = `${view.chapterLabel} · ${view.title}`;
    $("company-cash").textContent = money(company.cash);
    $("company-debt").textContent = money(company.debt);
    $("company-stock").textContent = `${Math.floor(company.stock)} caixas`;
    $("company-reputation").textContent =
      `${Math.round(company.reputation)} / 100`;
    $("company-day").textContent = company.day;
    $("company-chapter").textContent = view.chapterLabel;
    $("company-found-form").hidden = isFounded();
    $("next-day").disabled = !isFounded();
    $("next-day").textContent = view.event?.ready
      ? "Resolver decisão da história"
      : "Encerrar o dia";
    const metrics = [
      ["Qualidade", company.quality],
      ["Confiança da equipa", company.trust],
      ["Sustentabilidade", company.sustainability],
      ["Equipa", `${company.staff} pessoas`],
      ["Capacidade diária", `${company.capacity} caixas`],
      ["Entregas concluídas", company.completedDeliveries || 0],
    ];
    $("company-summary").innerHTML =
      `<article class="company-card"><span class="company-tag">${escape(view.chapterLabel)}</span><h3>${escape(view.title)}</h3><p>${escape(view.objective)}</p>${view.ending ? `<div class="company-ending"><h4>${escape(view.ending.title || view.ending.name || "O legado da tua empresa")}</h4><p>${escape(view.ending.body || view.ending.description || view.ending.text || readable(view.ending))}</p></div>` : ""}</article><div class="company-grid">${metrics.map(([name, value]) => `<div class="company-metric"><span>${escape(name)}</span><strong>${escape(value)}</strong></div>`).join("")}</div><article class="company-card"><h3>O tempo é uma decisão.</h3><p>Encerrar o dia produz uma nova colheita e paga salários, manutenção e juros. Os contratos têm prazo. As tuas escolhas alteram a qualidade, as relações e o rumo da história.</p>${reportToShow ? `<div class="company-day-report" role="status">${escape(describeReport(reportToShow))}</div>` : ""}</article>`;
    $("company-summary").insertAdjacentHTML(
      "beforeend",
      `<article class="company-card company-field-card"><span class="company-tag">A EMPRESA ACONTECE LÁ FORA</span><h3>Conhece o teu negócio de perto.</h3><p>Entra na loja, rega e colhe na estufa, visita os clientes e acompanha as carrinhas no terreno. Aproxima-te e usa E para interagir.</p><div class="company-field-stats"><span><b>${operations.shop.stock}</b> caixas na loja</span><span><b>${operations.fleet.length}</b> carrinhas próprias</span><span><b>${operations.shop.sold}</b> caixas vendidas</span></div>${navigateToPlace ? `<div class="company-inline-actions"><button class="company-action secondary" data-action="visit" data-id="shop-counter">Visitar a loja</button><button class="company-action secondary" data-action="visit" data-id="greenhouse-water">Ir à estufa</button><button class="company-action secondary" data-action="visit" data-id="fleet-depot">Ver a frota</button><button class="company-action secondary" data-action="visit" data-id="rui">Conhecer um cliente</button></div>` : ""}</article>`,
    );
    const event = view.event;
    $("company-story").innerHTML =
      `<article class="company-card"><span class="company-tag">${escape(view.mentor || "Marta · Administradora da cooperativa")}</span><h3>${escape(event?.title || view.title)}</h3><p class="company-dialogue">${escape(view.dialogue || event?.body || view.objective)}</p>${event?.body && event.body !== view.dialogue ? `<p>${escape(event.body)}</p>` : ""}</article>${(view.decisions || []).map((decision) => `<article class="company-choice"><h3>${escape(decision.label)}</h3><p>${escape(decision.description)}</p><div class="company-choice-effects">${escape(readable(decision.effects))}</div><button class="company-action" data-action="decision" data-id="${escape(decision.id)}" ${decision.disabled || !isFounded() ? "disabled" : ""}>${escape(decision.disabled ? decision.reason || "Requisitos em falta" : "Escolher este caminho")}</button></article>`).join("") || `<article class="company-card"><p>${escape(view.ending ? "A tua história ficou registada. Podes continuar a gerir a empresa e a explorar a cidade." : "Continua as entregas e avança para o próximo dia para descobrir o que acontece.")}</p></article>`}`;
    const destinations = {
      cooperativa: "Cooperativa do Vale",
      mercado: "Mercado Central",
      restaurantes: "Praça dos Restaurantes",
      porto: "Terminal de Exportação",
      universidade: "Universidade Agrícola",
    };
    $("company-contracts").innerHTML =
      `<article class="company-card"><h3>Da tua colheita para a cidade.</h3><p>Aceitar reserva as caixas. Entrega pessoalmente no destino com E ou atribui uma carrinha disponível. Na cidade, conversa com os clientes para negociar novas encomendas.</p></article><div class="company-grid">${(
        view.contracts || []
      )
        .map((contract) => {
          const accepted = ["accepted", "active", "reserved"].includes(
              contract.status,
            ),
            finished = ["delivered", "completed", "expired", "failed"].includes(
              contract.status,
            );
          const assigned = contract.fleetVehicleId,
            freeVehicle = operations.fleet.some(
              (vehicle) => vehicle.status === "idle",
            );
          return `<article class="company-card"><span class="company-tag">${escape(contract.status === "delivered" ? "ENTREGUE" : assigned ? "FROTA EM DISTRIBUIÇÃO" : accepted ? "CARGA PREPARADA" : contract.status === "expired" ? "PRAZO TERMINADO" : "CONTRATO DISPONÍVEL")}</span><h3>${escape(contract.title)}</h3><p>${escape(destinations[contract.destination] || contract.destination)} · ${escape(contract.quantity)} caixas</p><strong class="company-contract-value">${escape(money(contract.payment))}</strong><p>Entregar até ao dia ${escape(contract.deadlineDay)}.</p>${!finished && !assigned ? `<button class="company-action" data-action="${accepted ? "track" : "accept"}" data-id="${escape(contract.id)}" ${!isFounded() || contract.disabled ? "disabled" : ""}>${accepted ? "Entregar pessoalmente" : "Aceitar e preparar entrega"}</button>${accepted ? `<button class="company-action secondary" data-action="dispatch" data-id="${escape(contract.id)}" ${!isFounded() || !freeVehicle ? "disabled" : ""}>${freeVehicle ? "Enviar com a frota · " + money(12 + contract.quantity * 0.2) : operations.fleet.length ? "Carrinhas ocupadas" : "Adquire uma carrinha no depósito"}</button>` : ""}` : assigned ? `<p class="company-fleet-note">A carrinha está a fazer esta entrega. O pagamento entra quando chegar ao cliente.</p>` : ""}${contract.reason ? `<small>${escape(contract.reason)}</small>` : ""}</article>`;
        })
        .join("")}</div>`;
    $("company-upgrades").innerHTML =
      `<article class="company-card"><h3>Investir muda o futuro.</h3><p>Expande a produção, protege a equipa e decide como a tua empresa cresce. Os investimentos alteram custos e resultados dos próximos dias.</p></article><div class="company-grid">${(view.upgrades || []).map((upgrade) => `<article class="company-card"><span class="company-tag">${upgrade.owned ? "NÍVEL " + upgrade.owned + " / " + upgrade.max : "INVESTIMENTO"}</span><h3>${escape(upgrade.name)}</h3><p>${escape(upgrade.description)}</p><strong class="company-contract-value">${escape(money(upgrade.cost))}</strong><button class="company-action secondary" data-action="upgrade" data-id="${escape(upgrade.id)}" ${upgrade.disabled || !isFounded() ? "disabled" : ""}>${escape(upgrade.owned >= upgrade.max ? "Nível máximo" : upgrade.disabled ? upgrade.reason || "Indisponível" : "Investir")}</button></article>`).join("")}</div>`;
    $("company-upgrades").insertAdjacentHTML(
      "afterbegin",
      `<article class="company-card"><span class="company-tag">LOGÍSTICA PRÓPRIA · ${operations.fleet.length} / ${operations.fleetMax}</span><h3>As tuas carrinhas, a trabalhar.</h3><p>Reserva um contrato e atribui uma carrinha. Ela sai do depósito, faz a entrega e regressa. Combustível e motorista têm um custo por serviço; o tempo passa enquanto exploras.</p><div class="company-fleet-grid">${operations.fleet.map((vehicle) => `<div class="company-fleet-unit"><strong>${escape(vehicle.name)}</strong><span>${vehicle.status === "idle" ? "No depósito · disponível" : vehicle.status === "returning" ? "A regressar ao depósito" : "A caminho do cliente"}</span>${vehicle.status !== "idle" ? `<progress value="${Math.max(0, Math.min(1, Number(vehicle.progress) || 0))}" max="1" aria-label="Progresso da carrinha"></progress><small>${Math.ceil(vehicle.remaining)} s até ${vehicle.status === "returning" ? "regressar" : "entregar"}</small>` : ""}</div>`).join("") || `<p>Ainda não tens carrinhas próprias. Podes continuar a entregar pessoalmente.</p>`}</div><button class="company-action" data-action="buy-fleet" ${!isFounded() || !operations.canBuyFleet ? "disabled" : ""}>${operations.fleet.length >= operations.fleetMax ? "Frota completa" : `Comprar carrinha · ${escape(money(operations.fleetCost))}`}</button>${operations.fleetReason ? `<small>${escape(operations.fleetReason)}</small>` : ""}</article>`,
    );
    const history = (company.history || []).slice(-40).reverse();
    $("company-ledger").innerHTML =
      `<article class="company-card"><h3>O diário da tua empresa.</h3><p>As decisões, as entregas e os resultados dos dias ficam registados na tua campanha.</p></article><ol class="company-history">${history.map((item) => `<li><span class="company-tag">DIA ${escape(item.day || company.day)}</span><p>${escape(typeof item === "string" ? item : item.body || item.text || item.message || item.description || item.title || readable(item))}</p>${Number.isFinite(item.amount) ? `<strong>${escape(money(item.amount))}</strong>` : ""}</li>`).join("") || "<li>A tua história começa hoje.</li>"}</ol>`;
    selectTab(tab);
  }
  function apply(result) {
    if (!result?.ok) {
      notify(result?.message || "Não foi possível concluir esta ação.");
      return false;
    }
    setCompany(result.state);
    if (result.report) lastReport = result.report;
    notify(result.message);
    render();
    return true;
  }
  tabs.forEach((button, index) => {
    button.addEventListener("click", () =>
      selectTab(button.dataset.companyTab),
    );
    button.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next].dataset.companyTab);
      tabs[next].focus();
    });
  });
  $("company-found-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (isFounded()) return;
    const name = $("company-name").value.trim().slice(0, 32) || "Raiz & Sol";
    foundCompany(createCompany(name));
    selectTab("story");
    render();
    notify(`${name}: a tua empresa está fundada.`);
  });
  $("company-panel").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const { action, id } = button.dataset,
      current = getCompany();
    if (action === "decision" && apply(applyDecision(current, id)))
      $("company-panel").querySelector(".company-main").scrollTop = 0;
    if (action === "upgrade") apply(buyUpgrade(current, id));
    if (action === "buy-fleet") apply(buyFleetVehicle(current));
    if (action === "dispatch") apply(dispatchFleet(current, id));
    if (action === "visit" && navigateToPlace) {
      close();
      navigateToPlace(id);
    }
    if (action === "accept" && apply(acceptContract(current, id))) {
      trackContract(id);
      close();
    }
    if (action === "track") {
      trackContract(id);
      close();
    }
  });
  $("next-day").addEventListener("click", () => {
    if (!isFounded()) return;
    if (getCompanyView(getCompany()).event?.ready) {
      selectTab("story");
      return;
    }
    if (
      apply(advanceDay(getCompany())) &&
      getCompanyView(getCompany()).event?.ready
    )
      selectTab("story");
  });
  $("close-company").addEventListener("click", close);
  return {
    render,
    selectTab,
    open(name = "overview") {
      selectTab(name);
      render();
    },
    getTab: () => tab,
  };
}

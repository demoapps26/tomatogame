import * as THREE from "three";
import { createCharacter } from "./actors.js";
import { acceptContract } from "./company.js";
import {
  getOperationsView,
  buyFleetVehicle,
  dispatchFleet,
  negotiateClient,
  tendGreenhouse,
  restockShop,
} from "./operations.js";

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
const statusLabel = (status) =>
  status === "idle"
    ? "Disponível no depósito"
    : status === "returning"
      ? "A regressar à empresa"
      : "A caminho do cliente";

function disposeGroup(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  group.removeFromParent();
}

function makeLabel(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(18,35,27,.90)";
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = "#d9a56b";
  ctx.fillRect(0, 108, 512, 4);
  ctx.font = "bold 38px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f5efdf";
  ctx.fillText(String(name).slice(0, 28), 256, 54, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.9, 0.64, 1);
  sprite.position.y = 2.28;
  return sprite;
}

/** Physical shop, crop work and conversations. All financial changes use commands. */
export function createVenues({
  scene,
  world,
  getCompany,
  setCompany,
  notify,
  onStateChange,
  trackContract,
  isFounded = () => true,
}) {
  const group = new THREE.Group();
  group.name = "business-venues";
  scene.add(group);
  const points = world.interactionPoints || [];
  const actors = [];
  let nearestPoint = null,
    activePoint = null,
    disposed = false,
    time = 0,
    effect = null,
    effectRemaining = 0,
    message = "";
  const previousFocus = { value: null };
  const panel = document.createElement("section");
  panel.id = "venue-panel";
  panel.className = "venue-overlay";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "venue-title");
  panel.innerHTML = `<div class="venue-dialog"><header class="venue-header"><span id="venue-eyebrow" class="company-tag"></span><button id="venue-close" type="button" aria-label="Voltar à cidade">×</button></header><div class="venue-heading"><span class="venue-monogram" id="venue-monogram" aria-hidden="true">TR</span><div><h2 id="venue-title"></h2><p id="venue-subtitle"></p></div></div><p id="venue-feedback" class="venue-feedback" role="status"></p><div id="venue-body" class="venue-body"></div><footer class="venue-footer"><span id="venue-balance"></span><span>Esc · Voltar ao terreno</span></footer></div>`;
  document.getElementById("arena").append(panel);
  const work = document.createElement("div");
  work.id = "venue-work";
  work.className = "venue-work";
  work.hidden = true;
  work.setAttribute("role", "status");
  document.getElementById("arena").append(work);
  const $ = (id) => panel.querySelector(`#${id}`);

  for (const [index, point] of points.entries()) {
    if (!point.actor) continue;
    const actor = createCharacter({ civilian: true, index: index + 2 });
    actor.group.position.set(
      Number.isFinite(point.actor.x) ? point.actor.x : point.x + 1.4,
      0,
      Number.isFinite(point.actor.z) ? point.actor.z : point.z,
    );
    actor.group.name = `client-${point.id}`;
    const label = makeLabel(point.actor.name || point.label);
    actor.group.add(label);
    group.add(actor.group);
    actors.push({ actor, label, point });
  }

  function apply(result) {
    message = result?.message || "Não foi possível concluir esta ação.";
    if (result?.ok) setCompany(result.state);
    notify(message);
    refresh();
    if (activePoint && !panel.contains(document.activeElement))
      $("venue-close").focus({ preventScroll: true });
    return !!result?.ok;
  }

  function contractCard(contract, operations) {
    if (!contract) return "";
    const accepted = contract.status === "accepted",
      available = contract.status === "available",
      assigned = !!contract.fleetVehicleId,
      idle = operations.fleet.some((vehicle) => vehicle.status === "idle");
    return `<article class="venue-contract"><span class="company-tag">${assigned ? "FROTA EM DISTRIBUIÇÃO" : accepted ? "CAIXAS RESERVADAS" : available ? "PROPOSTA ACORDADA" : contract.status === "delivered" ? "ENCOMENDA ENTREGUE" : "ENCOMENDA REGISTADA"}</span><h3>${escape(contract.title)}</h3><div class="venue-price"><strong>${escape(money(contract.payment))}</strong><span>${contract.quantity} caixas · até ao dia ${contract.deadlineDay}</span></div>${available ? `<button data-venue-action="accept" data-id="${escape(contract.id)}" class="company-action" ${getCompany().stock < contract.quantity ? "disabled" : ""}>${getCompany().stock < contract.quantity ? "Stock insuficiente para esta encomenda" : "Reservar caixas e aceitar"}</button>` : accepted && !assigned ? `<div class="venue-actions"><button data-venue-action="track" data-id="${escape(contract.id)}" class="company-action">Eu faço a entrega</button><button data-venue-action="dispatch" data-id="${escape(contract.id)}" class="company-action secondary" ${!idle ? "disabled" : ""}>${idle ? "Enviar com a frota · " + money(12 + contract.quantity * 0.2) : operations.fleet.length ? "Frota ocupada" : "Adquire uma carrinha no depósito"}</button></div>` : assigned ? `<p>A tua equipa já está a caminho. Recebes o pagamento quando a carrinha chegar.</p>` : ""}</article>`;
  }

  function refresh() {
    if (!activePoint || disposed) return;
    const company = getCompany(),
      operations = getOperationsView(company),
      type = activePoint.type;
    $("venue-balance").textContent = `${company.name} · ${money(company.cash)}`;
    $("venue-feedback").textContent = message;
    if (type === "client") {
      const client = operations.clients.find(
        (item) => item.id === activePoint.id,
      );
      if (!client) {
        $("venue-title").textContent = activePoint.actor?.name || "Cliente";
        $("venue-body").textContent =
          "Este cliente ainda não tem uma proposta disponível.";
        return;
      }
      $("venue-eyebrow").textContent = "CONVERSA NO TERRENO";
      $("venue-title").textContent = client.name;
      $("venue-subtitle").textContent = client.role || client.locationLabel;
      $("venue-monogram").textContent = client.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
      const contract = company.contracts.find(
        (item) => item.id === client.contractId,
      );
      $("venue-body").innerHTML =
        `<blockquote class="venue-dialogue">${escape(client.dialogue || "Quero conhecer a tua colheita. Que proposta me trazes?")}</blockquote><p class="venue-intro">${client.negotiatedToday ? "Já combinámos as condições de hoje. Vamos cumprir o que acordámos." : "Escolhe a proposta que consegues cumprir. O preço, a quantidade e a qualidade pedida mudam de cliente para cliente."}</p>${contractCard(contract, operations)}${!client.negotiatedToday ? `<div class="venue-offers">${client.offers.map((offer) => `<article class="venue-offer"><div><h3>${escape(offer.label)}</h3><p>${escape(offer.description)}</p></div><div class="venue-offer-value"><strong>${money(offer.payment)}</strong><span>${offer.quantity} caixas</span></div><button class="company-action secondary" data-venue-action="negotiate" data-id="${escape(offer.id)}" ${offer.disabled ? "disabled" : ""}>Apresentar proposta</button>${offer.reason ? `<small>${escape(offer.reason)}</small>` : ""}</article>`).join("")}</div>` : ""}`;
    } else if (type === "shop") {
      const shop = operations.shop;
      $("venue-eyebrow").textContent = "A TUA LOJA · VENDA AO BAIRRO";
      $("venue-title").textContent = company.name;
      $("venue-subtitle").textContent =
        "Produtos da estufa, mesmo à porta da cidade.";
      $("venue-monogram").textContent = "LO";
      $("venue-body").innerHTML =
        `<blockquote class="venue-dialogue">A loja precisa de produto fresco. Reabastece o balcão e a equipa vende aos moradores enquanto exploras.</blockquote><div class="venue-metrics"><div><span>No balcão</span><strong>${shop.stock}<small> / ${shop.capacity} caixas</small></strong></div><div><span>Vendidas</span><strong>${shop.sold}<small> caixas</small></strong></div><div><span>Receita acumulada</span><strong>${money(shop.revenue)}</strong></div><div><span>Preço por caixa</span><strong>${money(shop.price)}</strong></div></div><article class="venue-contract"><h3>Do armazém para a montra.</h3><p>Tens ${company.stock} caixas livres em armazém. Abastecer a loja transfere caixas reais; as vendas só entram na tesouraria quando os clientes compram.</p><button class="company-action" data-venue-action="restock" ${!shop.canRestock ? "disabled" : ""}>Repor 12 caixas no balcão</button>${!shop.canRestock && shop.restockReason ? `<small>${escape(shop.restockReason)}</small>` : ""}</article><p class="venue-note">As vendas e as carrinhas avançam durante a exploração. Fecha o balcão para voltar ao terreno.</p>`;
    } else if (type === "fleet") {
      $("venue-eyebrow").textContent = "DEPÓSITO · DISTRIBUIÇÃO PRÓPRIA";
      $("venue-title").textContent = "A tua frota";
      $("venue-subtitle").textContent =
        `${operations.fleet.length} de ${operations.fleetMax} carrinhas · motoristas e combustível por serviço`;
      $("venue-monogram").textContent = "FR";
      const accepted = company.contracts.filter(
          (contract) =>
            contract.status === "accepted" && !contract.fleetVehicleId,
        ),
        idle = operations.fleet.some((vehicle) => vehicle.status === "idle");
      $("venue-body").innerHTML =
        `<blockquote class="venue-dialogue">Tu fechas os negócios. A equipa pode tratar da distribuição. Cada carrinha leva uma encomenda e volta ao depósito.</blockquote><div class="venue-fleet">${operations.fleet.map((vehicle) => `<article class="venue-contract"><span class="company-tag">${escape(statusLabel(vehicle.status))}</span><h3>${escape(vehicle.name)}</h3>${vehicle.status !== "idle" ? `<progress value="${Math.max(0, Math.min(1, Number(vehicle.progress) || 0))}" max="1" aria-label="Progresso da viagem"></progress><p>${Math.ceil(vehicle.remaining)} s até ${vehicle.status === "returning" ? "regressar" : "entregar"}. O pagamento exige a chegada ao cliente.</p>` : `<p>Pronta para receber uma encomenda.</p>`}</article>`).join("") || `<p>Ainda não tens carrinhas. Compra a primeira para começar a distribuir com a tua equipa.</p>`}</div><button class="company-action" data-venue-action="buy-fleet" ${!operations.canBuyFleet ? "disabled" : ""}>${operations.fleet.length >= operations.fleetMax ? "Frota completa" : `Comprar carrinha · ${money(operations.fleetCost)}`}</button><section class="venue-dispatch"><h3>Encomendas prontas para sair</h3>${accepted.map((contract) => `<article class="venue-offer"><div><strong>${escape(contract.title)}</strong><p>${contract.quantity} caixas · ${money(contract.payment)}</p></div><button class="company-action secondary" data-venue-action="dispatch" data-id="${escape(contract.id)}" ${!idle ? "disabled" : ""}>${idle ? "Atribuir à frota · " + money(12 + contract.quantity * 0.2) : "Sem carrinhas disponíveis"}</button></article>`).join("") || `<p>Conversa com um cliente ou aceita um contrato na Empresa para preparar uma carga.</p>`}</section><p class="venue-note">A operação continua quando regressas ao terreno. Os custos são debitados antes da partida; os prazos dos contratos continuam a contar.</p>`;
    }
  }

  function open(point) {
    if (!isFounded()) {
      notify("Funda a tua empresa em B · Empresa antes de começar a operar.");
      return false;
    }
    activePoint = point;
    message = "";
    previousFocus.value = document.activeElement;
    panel.hidden = false;
    onStateChange(true);
    refresh();
    $("venue-body").scrollTop = 0;
    $("venue-close").focus({ preventScroll: true });
    return true;
  }

  function close() {
    if (!activePoint) return false;
    activePoint = null;
    panel.hidden = true;
    onStateChange(false);
    if (previousFocus.value?.isConnected)
      previousFocus.value.focus?.({ preventScroll: true });
    return true;
  }

  function physicalEffect(point, action) {
    if (effect) disposeGroup(effect);
    effect = new THREE.Group();
    effect.position.set(point.x, 0, point.z);
    const geometry = new THREE.SphereGeometry(
        action === "water" ? 0.035 : 0.09,
        5,
        4,
      ),
      material = new THREE.MeshStandardMaterial({
        color: action === "water" ? 0x8dc7da : 0xb4452e,
        roughness: action === "water" ? 0.25 : 0.68,
        transparent: action === "water",
        opacity: action === "water" ? 0.8 : 1,
      });
    for (let index = 0; index < 22; index++) {
      const particle = new THREE.Mesh(geometry, material);
      particle.userData.phase = index * 2.39996;
      particle.userData.radius = 0.3 + (index % 5) * 0.19;
      particle.userData.action = action;
      effect.add(particle);
    }
    group.add(effect);
    effectRemaining = 2.8;
    work.hidden = false;
    work.innerHTML = `<span class="venue-work-symbol" aria-hidden="true">${action === "water" ? "◌" : "+"}</span><div><strong>${action === "water" ? "A regar as tuas plantas" : "Colheita recolhida"}</strong><span>${action === "water" ? "A água chega às raízes e prepara a próxima colheita." : "As caixas acabadas de colher já estão no teu armazém."}</span><progress value="0" max="2.8" aria-label="Trabalho na estufa"></progress></div>`;
  }

  function interact() {
    if (!nearestPoint || disposed || activePoint) return false;
    if (!isFounded()) {
      notify("Primeiro, funda a tua empresa em B · Empresa.");
      return true;
    }
    if (nearestPoint.type === "water" || nearestPoint.type === "harvest") {
      const action = nearestPoint.type;
      const result = tendGreenhouse(getCompany(), action);
      if (apply(result)) physicalEffect(nearestPoint, action);
      return true;
    }
    return open(nearestPoint);
  }

  function update(dt, playerPosition, driving = false) {
    if (disposed) return;
    time += dt;
    let nearestDistance = 3.5;
    nearestPoint = null;
    if (!driving)
      for (const point of points) {
        const distance = Math.hypot(
          playerPosition.x - point.x,
          playerPosition.z - point.z,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPoint = point;
        }
      }
    for (const { actor, label, point } of actors) {
      const distance = Math.hypot(
        actor.group.position.x - playerPosition.x,
        actor.group.position.z - playerPosition.z,
      );
      actor.group.visible = distance < 95;
      label.visible = distance < 28;
      if (distance < 35) {
        actor.group.rotation.y = Math.atan2(
          playerPosition.x - actor.group.position.x,
          playerPosition.z - actor.group.position.z,
        );
        actor.animate(dt, 0, time + point.x, false);
      }
    }
    if (effect) {
      effectRemaining -= dt;
      effect.children.forEach((particle, index) => {
        const phase = particle.userData.phase,
          radius = particle.userData.radius;
        if (particle.userData.action === "water") {
          const cycle = (time * 1.5 + index / 22) % 1;
          particle.position.set(
            Math.cos(phase) * radius,
            1.5 - cycle * 1.4,
            Math.sin(phase) * radius,
          );
        } else {
          const lift = Math.min(1, (2.8 - effectRemaining) / 0.65);
          particle.position.set(
            Math.cos(phase) * radius * (1 - lift * 0.75),
            0.8 + Math.sin(lift * Math.PI) * 0.6,
            Math.sin(phase) * radius * (1 - lift * 0.75),
          );
          particle.scale.setScalar(Math.max(0.05, effectRemaining / 2.8));
        }
      });
      const progress = work.querySelector("progress");
      if (progress) progress.value = 2.8 - Math.max(0, effectRemaining);
      if (effectRemaining <= 0) {
        disposeGroup(effect);
        effect = null;
        work.hidden = true;
      }
    }
  }

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-venue-action]");
    if (!button || button.disabled || !activePoint) return;
    const { venueAction: action, id } = button.dataset,
      current = getCompany();
    if (action === "negotiate")
      apply(negotiateClient(current, activePoint.id, id));
    if (action === "accept") apply(acceptContract(current, id));
    if (action === "dispatch") apply(dispatchFleet(current, id));
    if (action === "buy-fleet") apply(buyFleetVehicle(current));
    if (action === "restock") apply(restockShop(current, 12));
    if (action === "track") {
      close();
      trackContract(id);
    }
  });
  $("venue-close").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key.toLowerCase() === "b") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === "Tab") {
      const controls = [
        ...panel.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),[tabindex='0']",
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
    update,
    nearest: () => nearestPoint,
    interact,
    close,
    isOpen: () => !!activePoint,
    refresh,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      panel.remove();
      work.remove();
      disposeGroup(group);
    },
  };
}

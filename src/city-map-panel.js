const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const searchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const MAP_NAMES = {
  cidade: "Santa Tomata",
  estufas: "Vale da Colheita",
  porto: "Porto Vermelho",
};
const CATEGORIES = [
  ["all", "Tudo"],
  ["company", "Empresa"],
  ["cars", "Automóveis"],
  ["homes", "Casas"],
  ["clients", "Clientes"],
  ["trials", "Percursos"],
];
const TYPES = {
  company: {
    category: "company",
    color: "#b6c98e",
    symbol: "S",
    tag: "Sede da empresa",
    note: "O ponto de partida da tua história.",
  },
  shop: {
    category: "company",
    color: "#b6c98e",
    symbol: "L",
    tag: "Loja",
    note: "Visita o balcão da Inês e acompanha as vendas.",
  },
  harvest: {
    category: "company",
    color: "#90b58a",
    symbol: "E",
    tag: "Estufa",
    note: "Entra na estufa para cuidar da próxima colheita.",
  },
  water: {
    category: "company",
    color: "#90b58a",
    symbol: "E",
    tag: "Estufa",
    note: "Rega e acompanha o cultivo dos tomates.",
  },
  fleet: {
    category: "company",
    color: "#b6c98e",
    symbol: "F",
    tag: "Distribuição",
    note: "O depósito e o parque da frota de entregas.",
  },
  dealership: {
    category: "cars",
    color: "#96bfc9",
    symbol: "V",
    tag: "Stand de automóveis",
    note: "Conhece o stand e escolhe a tua próxima viatura.",
  },
  garage: {
    category: "cars",
    color: "#96bfc9",
    symbol: "R",
    tag: "Oficina e combustível",
    note: "Repara, abastece ou prepara uma viatura própria.",
  },
  property: {
    category: "homes",
    color: "#d7b49a",
    symbol: "H",
    tag: "Casa para visitar",
    note: "Entra e conhece os interiores do imóvel.",
  },
  rest: {
    category: "homes",
    color: "#d7b49a",
    symbol: "D",
    tag: "Descanso em casa",
    note: "O ponto de descanso no interior da tua casa.",
  },
  client: {
    category: "clients",
    color: "#e0c17e",
    symbol: "C",
    tag: "Cliente",
    note: "Encontra o cliente no terreno e conversa sobre fornecimentos.",
  },
  race: {
    category: "trials",
    color: "#f0ce79",
    symbol: "P",
    tag: "Percursos de condução",
    note: "Traz um carro ao quadro para partir num percurso cronometrado.",
  },
};

const STYLES = `
.city-map-panel,.city-map-panel *{box-sizing:border-box}
.city-map-panel[hidden],.city-map-panel [hidden]{display:none!important}
.city-map-panel{position:fixed;inset:0;z-index:170;display:grid;place-items:center;padding:20px;background:rgba(12,24,22,.84);font-family:Inter,system-ui,sans-serif;color:#253b31;isolation:isolate}
.city-map-panel button,.city-map-panel input{font:inherit}
.city-map-panel button{cursor:pointer;border:0}
.city-map-panel button:disabled{opacity:.45;cursor:default}
.city-map-panel button:focus-visible,.city-map-panel input:focus-visible,.city-map-panel canvas:focus-visible{outline:3px solid #ba8544;outline-offset:3px}
.city-map-window{width:min(1240px,100%);height:min(850px,100%);max-height:calc(100dvh - 40px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#efebdf;border:1px solid #fff8;border-radius:15px;overflow:hidden;box-shadow:0 28px 100px #0005}
.city-map-header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px 26px 20px}
.city-map-eyebrow{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;color:#6b765f;margin-bottom:6px}
.city-map-header h2{margin:0;font-size:31px;line-height:1.1;font-weight:650;letter-spacing:-.055em}
.city-map-header p{margin:8px 0 0;font-size:12px;line-height:1.5;color:#667063}
.city-map-close{flex:none;align-self:flex-start;width:38px;height:38px;border-radius:50%;background:#e0dfd2;color:#304637;font-size:25px!important;line-height:1}
.city-map-layout{display:grid;grid-template-columns:minmax(0,1fr) 318px;min-height:0;border-top:1px solid #d7dacc;border-bottom:1px solid #d7dacc}
.city-map-viewport{position:relative;min-width:0;min-height:0;background:#1b302d;overflow:hidden}
.city-map-canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.city-map-canvas.is-dragging{cursor:grabbing}
.city-map-tools{position:absolute;top:14px;left:14px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 66px)}
.city-map-tools button{min-width:33px;height:33px;padding:0 10px;background:#edf0df;color:#304336;border:1px solid #ffffffe0;border-radius:6px;font-size:11px;font-weight:750;box-shadow:0 2px 8px #0002}
.city-map-tools button[data-map-tool="in"],.city-map-tools button[data-map-tool="out"]{font-size:20px;padding:0}
.city-map-tools button:hover{background:#fff9e9}
.city-map-compass{position:absolute;right:17px;top:16px;text-align:center;color:#d8dfc9;pointer-events:none;font-size:10px;font-weight:800;line-height:1.5}
.city-map-compass b{display:block;font-size:23px;line-height:1}
.city-map-mapnote{position:absolute;left:14px;bottom:12px;font-size:10px;line-height:1.5;color:#dae0cd;pointer-events:none;background:#172c27d9;padding:7px 9px;border:1px solid #7b91804d;border-radius:5px;max-width:calc(100% - 110px)}
.city-map-sidebar{min-height:0;display:flex;flex-direction:column;gap:12px;padding:17px 16px;background:#f1ede2;overflow:hidden}
.city-map-search{display:flex;align-items:center;gap:8px;border:1px solid #cbd1bf;border-radius:7px;padding:9px 11px;background:#fcfaf2;color:#61725d;font-size:15px}
.city-map-search input{display:block;min-width:0;width:100%;border:0;background:transparent;color:#2c4032;font-size:12px;outline-offset:5px}
.city-map-search input::placeholder{color:#75816f}
.city-map-filters{display:flex;flex-wrap:wrap;gap:5px}
.city-map-filters button{padding:6px 8px;border:1px solid #d7d9ca;border-radius:5px;background:transparent;font-size:10px;color:#62715f;font-weight:700}
.city-map-filters button[aria-pressed="true"]{color:#f8f3e6;background:#314f3c;border-color:#314f3c}
.city-map-count{margin:0;font-size:10px;letter-spacing:.11em;font-weight:750;text-transform:uppercase;color:#7c826e}
.city-map-destinations{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding-right:4px;scrollbar-width:thin}
.city-map-place{display:flex;gap:10px;align-items:center;width:100%;padding:10px 8px;text-align:left;color:#2e4234;background:transparent;border-radius:7px!important;border:1px solid transparent!important;margin:0 0 3px}
.city-map-place:hover,.city-map-place.is-selected{background:#e4e7d9;border-color:#ccd4bd!important}
.city-map-place-icon{flex:none;display:grid;place-items:center;width:31px;height:31px;background:#243d34;color:var(--place-color);border-radius:8px;font-size:13px;font-weight:800}
.city-map-place-copy{min-width:0;flex:1}
.city-map-place-copy strong{display:block;font-size:12px;line-height:1.4;font-weight:750;overflow-wrap:anywhere}
.city-map-place-copy small{display:block;font-size:10px;color:#78816f;line-height:1.5;margin-top:2px}
.city-map-place-arrow{font-size:17px;color:#71815e}
.city-map-empty{padding:12px 0;font-size:12px;line-height:1.6;color:#74806c}
.city-map-empty strong{display:block;color:#3d5540;margin-bottom:6px}
.city-map-detail{border-top:1px solid #d7dacc;padding-top:12px}
.city-map-detail h3{font-size:13px;line-height:1.35;margin:0 0 5px;font-weight:800}
.city-map-detail p{font-size:11px;color:#75806d;line-height:1.5;margin:0 0 10px}
.city-map-route{width:100%;padding:11px;border-radius:7px;background:#334f3c;color:#fff6e5;font-size:12px!important;font-weight:750}
.city-map-route:hover{background:#45664b}
.city-map-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 25px;color:#7a826e;font-size:10px;line-height:1.5}
.city-map-footer strong{font-weight:750;color:#52674b}
@media(max-width:760px){.city-map-panel{padding:8px}.city-map-window{max-height:calc(100dvh - 16px);border-radius:11px}.city-map-header{padding:14px 16px}.city-map-header h2{font-size:26px}.city-map-header p{font-size:11px;margin-top:5px}.city-map-layout{grid-template-columns:1fr;grid-template-rows:minmax(190px,1fr) minmax(195px,41%)}.city-map-sidebar{gap:8px;padding:11px 13px;border-top:1px solid #72816a}.city-map-search{padding:7px 9px}.city-map-filters{gap:4px}.city-map-filters button{padding:5px 7px}.city-map-count{display:none}.city-map-destinations{min-height:42px}.city-map-place{padding:7px}.city-map-place-copy strong{font-size:11px}.city-map-place-copy small{font-size:9px}.city-map-detail{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;padding-top:9px;align-items:center}.city-map-detail h3{grid-column:1;grid-row:1;margin:0;font-size:11px}.city-map-detail p{grid-column:1;grid-row:2;margin:3px 0 0;font-size:10px}.city-map-route{grid-column:2;grid-row:1/3;width:auto;max-width:123px;padding:10px;font-size:10px!important}.city-map-footer{padding:9px 14px;gap:5px;font-size:9px}.city-map-footer .city-map-footer-controls{display:none}.city-map-tools{top:10px;left:10px;gap:4px}.city-map-tools button{height:30px;min-width:30px;padding:0 8px;font-size:10px}.city-map-mapnote{left:10px;bottom:9px;font-size:9px;padding:5px 7px}.city-map-compass{top:12px;right:12px}}
@media(max-height:600px) and (min-width:761px){.city-map-panel{padding:8px}.city-map-window{max-height:calc(100dvh - 16px)}.city-map-header{padding:12px 20px}.city-map-header h2{font-size:25px}.city-map-header p{display:none}.city-map-sidebar{gap:8px;padding:11px 13px}.city-map-detail p{display:none}.city-map-footer{padding:8px 20px}}
`;

/** Paused, read-only city atlas. Only trackPlace can change a navigation target. */
export function createCityMapPanel({
  getWorld,
  getPlayer,
  getCompany,
  getMapId,
  onStateChange,
  trackPlace,
  notify,
} = {}) {
  let opened = false,
    disposed = false,
    previousFocus = null;
  let filter = "all",
    query = "",
    selectedId = null,
    places = [],
    visiblePlaces = [];
  let zoom = 1,
    center = { x: 0, z: 0 },
    bounds = null,
    metrics = null,
    hitTargets = [];
  let drag = null,
    resizeFrame = 0;
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  const panel = document.createElement("section");
  panel.id = "city-map-panel";
  panel.className = "city-map-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "city-map-title");
  panel.innerHTML = `<div class="city-map-window"><header class="city-map-header"><div><span class="city-map-eyebrow">ATLAS · ESCOLHE O PRÓXIMO DESTINO</span><h2 id="city-map-title">Santa Tomata</h2><p>Conhece os bairros. Visita os lugares. Faz o teu caminho.</p></div><button type="button" class="city-map-close" aria-label="Fechar mapa e voltar ao jogo" title="T / Esc · Voltar">×</button></header><div class="city-map-layout"><div class="city-map-viewport"><canvas class="city-map-canvas" tabindex="0" aria-label="Mapa interativo. Arrasta para mover, usa mais e menos para ampliar e clica num destino para marcar a rota."></canvas><div class="city-map-tools" role="group" aria-label="Controlos do mapa"><button type="button" data-map-tool="in" aria-label="Ampliar mapa">+</button><button type="button" data-map-tool="out" aria-label="Reduzir mapa">−</button><button type="button" data-map-tool="player">Localizar-me</button><button type="button" data-map-tool="fit">Ver tudo</button></div><div class="city-map-compass" aria-hidden="true">N<b>↑</b></div><div class="city-map-mapnote">▲ Estás aqui · O jogo está em pausa</div></div><aside class="city-map-sidebar" aria-label="Destinos da cidade"><label class="city-map-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Procurar um lugar…" aria-label="Procurar destino no mapa" autocomplete="off"></label><nav class="city-map-filters" aria-label="Filtrar destinos">${CATEGORIES.map(([id, label]) => `<button type="button" data-map-filter="${id}" aria-pressed="${id === "all"}">${label}</button>`).join("")}</nav><p class="city-map-count" aria-live="polite"></p><div class="city-map-destinations"></div><div class="city-map-detail"><h3></h3><p></p><button type="button" class="city-map-route">Marcar rota →</button></div></aside></div><footer class="city-map-footer"><span class="city-map-footer-status"><strong>O teu próximo destino está na cidade.</strong></span><span class="city-map-footer-controls">Arrastar · mover &nbsp; Roda · ampliar &nbsp; T / Esc · voltar</span></footer></div>`;
  (document.getElementById("arena") || document.body).append(panel);
  const $ = (selector) => panel.querySelector(selector);
  const canvas = $(".city-map-canvas"),
    context = canvas.getContext("2d");
  const list = $(".city-map-destinations"),
    closeButton = $(".city-map-close");
  const player = () => {
    const value = getPlayer?.();
    return {
      x: finite(value?.x) ? value.x : 0,
      z: finite(value?.z) ? value.z : 86,
    };
  };
  function collectPlaces(world, company) {
    if (getMapId?.() !== "cidade") return [];
    const owned = company?.ownership?.properties || [];
    const homeId = company?.ownership?.homeId;
    const points = (world.interactionPoints || []).filter(
      (point) => TYPES[point.type],
    );
    const headquarters = (world.businessLocations || []).find(
      (point) => point.id === "sede",
    );
    if (headquarters && !points.some((point) => point.id === headquarters.id))
      points.unshift(headquarters);
    const hasHarvest = points.some((point) => point.type === "harvest");
    const seen = new Set();
    return points
      .filter((point) => {
        if (
          !point.id ||
          seen.has(point.id) ||
          !finite(point.x) ||
          !finite(point.z)
        )
          return false;
        if (point.type === "water" && hasHarvest) return false;
        if (
          point.type === "rest" &&
          !owned.some((item) => item.id === point.propertyId)
        )
          return false;
        seen.add(point.id);
        return true;
      })
      .map((point) => {
        const info = TYPES[point.type];
        const property = owned.find(
          (item) => item.id === (point.propertyId || point.id),
        );
        const name =
          point.type === "company"
            ? `${company?.name || "A tua empresa"} · Sede`
            : point.type === "harvest" || point.type === "water"
              ? "Estufa de Anselmo"
              : point.type === "rest"
                ? `Descanso · ${point.name || "Casa"}`
                : point.name || point.label || point.actor?.name || point.id;
        return {
          id: point.id,
          x: point.x,
          z: point.z,
          type: point.type,
          name,
          ...info,
          tag:
            point.type === "property" && property
              ? homeId === point.propertyId
                ? "A tua casa base"
                : "Imóvel próprio"
              : info.tag,
          note:
            point.type === "client"
              ? `${point.actor?.role || "Cliente da empresa"}. Encontra-o e conversa no terreno.`
              : info.note,
        };
      });
  }
  function getBounds(world) {
    const value = world.bounds;
    return value &&
      [value.minX, value.maxX, value.minZ, value.maxZ].every(finite) &&
      value.maxX > value.minX &&
      value.maxZ > value.minZ
      ? { ...value }
      : { minX: -730, maxX: 730, minZ: -730, maxZ: 730 };
  }
  function fit() {
    zoom = 1;
    center = {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
    draw();
  }
  function clampCenter() {
    const marginX = (bounds.maxX - bounds.minX) * 0.25;
    const marginZ = (bounds.maxZ - bounds.minZ) * 0.25;
    center.x = Math.max(
      bounds.minX - marginX,
      Math.min(bounds.maxX + marginX, center.x),
    );
    center.z = Math.max(
      bounds.minZ - marginZ,
      Math.min(bounds.maxZ + marginZ, center.z),
    );
  }
  function distanceLabel(place) {
    const p = player(),
      value = Math.round(Math.hypot(place.x - p.x, place.z - p.z));
    return value >= 1000
      ? `~${(value / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km`
      : `~${value} m`;
  }
  function renderDetail() {
    const place = places.find((item) => item.id === selectedId);
    $(".city-map-detail h3").textContent =
      place?.name || "Explora este território";
    $(".city-map-detail p").textContent =
      place?.note ||
      "Percorre as estradas e descobre os bairros. Os serviços e as visitas estão em Santa Tomata.";
    const routeButton = $(".city-map-route");
    routeButton.disabled = !place || typeof trackPlace !== "function";
    routeButton.hidden = !place;
    routeButton.setAttribute(
      "aria-label",
      place ? `Marcar rota até ${place.name}` : "Marcar rota",
    );
  }
  function selectPlace(id) {
    if (!places.some((place) => place.id === id) || id === selectedId) return;
    selectedId = id;
    for (const button of list.querySelectorAll("[data-map-place]")) {
      button.classList.toggle(
        "is-selected",
        button.dataset.mapPlace === selectedId,
      );
    }
    renderDetail();
    draw();
  }
  function visit(id) {
    const place = places.find((item) => item.id === id);
    if (!place || typeof trackPlace !== "function") return;
    close();
    trackPlace(id);
  }
  function renderPlaces() {
    visiblePlaces = places.filter(
      (place) =>
        (filter === "all" || place.category === filter) &&
        (!query ||
          searchText(`${place.name} ${place.tag} ${place.note}`).includes(
            query,
          )),
    );
    if (!visiblePlaces.some((place) => place.id === selectedId))
      selectedId = visiblePlaces[0]?.id || null;
    $(".city-map-count").textContent =
      `${visiblePlaces.length} ${visiblePlaces.length === 1 ? "destino" : "destinos"} para visitar`;
    list.innerHTML = visiblePlaces.length
      ? visiblePlaces
          .map(
            (place) =>
              `<button type="button" class="city-map-place ${place.id === selectedId ? "is-selected" : ""}" data-map-place="${escape(place.id)}" aria-label="Marcar rota até ${escape(place.name)}"><span class="city-map-place-icon" style="--place-color:${place.color}" aria-hidden="true">${place.symbol}</span><span class="city-map-place-copy"><strong>${escape(place.name)}</strong><small>${escape(place.tag)} · ${distanceLabel(place)}</small></span><span class="city-map-place-arrow" aria-hidden="true">→</span></button>`,
          )
          .join("")
      : places.length
        ? `<p class="city-map-empty"><strong>Nenhum lugar encontrado.</strong>Experimenta outro nome ou escolhe uma categoria diferente.</p>`
        : `<p class="city-map-empty"><strong>Um território para explorar.</strong>Descobre as estradas e os bairros de ${escape(MAP_NAMES[getMapId?.()] || "este mapa")}. O stand, as casas e os serviços da empresa estão em Santa Tomata.</p>`;
    const hasServices = places.length > 0;
    $(".city-map-search").hidden = !hasServices;
    $(".city-map-filters").hidden = !hasServices;
    for (const button of panel.querySelectorAll("[data-map-filter]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mapFilter === filter),
      );
    renderDetail();
    draw();
  }
  function roundedRect(x, y, width, height, radius) {
    context.beginPath();
    if (context.roundRect) context.roundRect(x, y, width, height, radius);
    else context.rect(x, y, width, height);
  }
  function draw() {
    if (!opened || disposed || !context || !bounds) return;
    const rectangle = canvas.getBoundingClientRect();
    const width = Math.max(1, rectangle.width),
      height = Math.max(1, rectangle.height);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const pixelsX = Math.round(width * ratio),
      pixelsY = Math.round(height * ratio);
    if (canvas.width !== pixelsX || canvas.height !== pixelsY) {
      canvas.width = pixelsX;
      canvas.height = pixelsY;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const scale =
      Math.min(
        (width - 42) / (bounds.maxX - bounds.minX),
        (height - 42) / (bounds.maxZ - bounds.minZ),
      ) * zoom;
    if (scale <= 0) return;
    metrics = { width, height, scale };
    const screen = (x, z) => ({
      x: width / 2 + (x - center.x) * scale,
      y: height / 2 + (z - center.z) * scale,
    });
    const world = getWorld?.() || {};
    context.fillStyle = "#1c3130";
    context.fillRect(0, 0, width, height);
    const corner = screen(bounds.minX, bounds.minZ);
    const spanX = (bounds.maxX - bounds.minX) * scale,
      spanZ = (bounds.maxZ - bounds.minZ) * scale;
    context.fillStyle = "#2a3d31";
    context.fillRect(corner.x, corner.y, spanX, spanZ);
    // Subtle district washes and roof footprints make this the actual city plan.
    for (const district of world.districts || []) {
      const p = screen(district.x, district.z);
      context.fillStyle = `${/^#[a-f\d]{6}$/i.test(district.color || "") ? district.color : "#99ac82"}12`;
      context.beginPath();
      context.arc(p.x, p.y, 85 * scale, 0, Math.PI * 2);
      context.fill();
    }
    for (const road of world.roads || []) {
      if (![road.x, road.z, road.width, road.depth].every(finite)) continue;
      const p = screen(road.x - road.width / 2, road.z - road.depth / 2);
      context.fillStyle = "#182d27";
      context.fillRect(
        p.x - 1,
        p.y - 1,
        road.width * scale + 2,
        road.depth * scale + 2,
      );
      context.fillStyle = "#687363";
      context.fillRect(
        p.x,
        p.y,
        Math.max(1, road.width * scale),
        Math.max(1, road.depth * scale),
      );
    }
    for (const building of world.colliders || []) {
      if (
        ![building.minX, building.maxX, building.minZ, building.maxZ].every(
          finite,
        )
      )
        continue;
      const w = building.maxX - building.minX,
        h = building.maxZ - building.minZ;
      if (w < 2.5 || h < 2.5 || (finite(building.maxY) && building.maxY < 1.5))
        continue;
      const p = screen(building.minX, building.minZ),
        rw = w * scale,
        rh = h * scale;
      if (p.x + rw < 0 || p.y + rh < 0 || p.x > width || p.y > height) continue;
      context.fillStyle = building.maxY > 12 ? "#798574" : "#53664f";
      context.fillRect(p.x, p.y, Math.max(0.7, rw), Math.max(0.7, rh));
      if (zoom > 1.6 && rw > 5 && rh > 5) {
        context.strokeStyle = "#a0aa862b";
        context.lineWidth = 1;
        context.strokeRect(p.x + 0.5, p.y + 0.5, rw - 1, rh - 1);
      }
    }
    context.strokeStyle = "#8ba77a55";
    context.lineWidth = 1;
    context.strokeRect(corner.x, corner.y, spanX, spanZ);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${zoom > 1.7 ? 11 : 9}px sans-serif`;
    for (const district of world.districts || []) {
      const p = screen(district.x, district.z);
      if (p.x < -50 || p.x > width + 50 || p.y < 20 || p.y > height - 30)
        continue;
      const name = String(district.name || "").toUpperCase();
      context.lineWidth = 3;
      context.strokeStyle = "#243b2dcc";
      context.strokeText(name, p.x, p.y);
      context.fillStyle = "#c6cfb4bd";
      context.fillText(name, p.x, p.y);
    }
    hitTargets = [];
    const ordered = [...visiblePlaces].sort(
      (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
    );
    for (const place of ordered) {
      const anchor = screen(place.x, place.z);
      if (
        anchor.x < -25 ||
        anchor.x > width + 25 ||
        anchor.y < -25 ||
        anchor.y > height + 25
      )
        continue;
      let p = { ...anchor };
      // Nearby services remain separately clickable even at the full-city scale.
      for (let attempt = 0; attempt < 32; attempt++) {
        if (
          !hitTargets.some((hit) => Math.hypot(hit.x - p.x, hit.y - p.y) < 26)
        )
          break;
        const radius = 17 + Math.floor(attempt / 8) * 13,
          angle = (attempt * Math.PI) / 4;
        p = {
          x: anchor.x + Math.cos(angle) * radius,
          y: anchor.y + Math.sin(angle) * radius,
        };
      }
      if (Math.hypot(p.x - anchor.x, p.y - anchor.y) > 6) {
        context.strokeStyle = `${place.color}88`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(anchor.x, anchor.y);
        context.lineTo(p.x, p.y);
        context.stroke();
        context.fillStyle = place.color;
        context.beginPath();
        context.arc(anchor.x, anchor.y, 2, 0, Math.PI * 2);
        context.fill();
      }
      const selected = place.id === selectedId;
      roundedRect(p.x - 11, p.y - 11, 22, 22, 6);
      context.fillStyle = selected ? place.color : "#18332d";
      context.fill();
      context.lineWidth = selected ? 2.5 : 1.3;
      context.strokeStyle = place.color;
      context.stroke();
      context.fillStyle = selected ? "#203b2c" : place.color;
      context.font = "800 11px sans-serif";
      context.fillText(place.symbol, p.x, p.y + 0.5);
      hitTargets.push({ id: place.id, x: p.x, y: p.y });
      if (selected) {
        const name =
          place.name.length > 35 ? `${place.name.slice(0, 33)}…` : place.name;
        context.font = "600 10px sans-serif";
        const labelWidth = Math.min(
          width - 18,
          context.measureText(name).width + 18,
        );
        const labelX = Math.max(
          9,
          Math.min(width - labelWidth - 9, p.x - labelWidth / 2),
        );
        const labelY = p.y > height - 42 ? p.y - 33 : p.y + 18;
        roundedRect(labelX, labelY, labelWidth, 21, 4);
        context.fillStyle = "#edf0dd";
        context.fill();
        context.fillStyle = "#2d4432";
        context.fillText(name, labelX + labelWidth / 2, labelY + 11);
      }
    }
    const position = player(),
      p = screen(position.x, position.z);
    context.save();
    context.translate(p.x, p.y);
    context.shadowColor = "#b8e0dd";
    context.shadowBlur = 10;
    context.fillStyle = "#d5f0e7";
    context.strokeStyle = "#1c3d31";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(7, 8);
    context.lineTo(0, 4);
    context.lineTo(-7, 8);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
    const distance =
      [20, 50, 100, 200, 500].find((value) => value * scale >= 40) || 500;
    const barWidth = distance * scale,
      barX = width - barWidth - 17,
      barY = height - 20;
    context.strokeStyle = "#c9d6bb";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(barX, barY - 4);
    context.lineTo(barX, barY);
    context.lineTo(barX + barWidth, barY);
    context.lineTo(barX + barWidth, barY - 4);
    context.stroke();
    context.fillStyle = "#d5dec7";
    context.font = "10px sans-serif";
    context.textAlign = "center";
    context.fillText(`${distance} m`, barX + barWidth / 2, barY - 11);
  }
  function zoomTo(value, localPoint) {
    if (!metrics) return;
    const oldZoom = zoom,
      next = Math.max(1, Math.min(7, value));
    if (next === oldZoom) return;
    if (localPoint) {
      const offsetX = (localPoint.x - metrics.width / 2) / metrics.scale;
      const offsetZ = (localPoint.y - metrics.height / 2) / metrics.scale;
      center.x += offsetX * (1 - oldZoom / next);
      center.z += offsetZ * (1 - oldZoom / next);
    }
    zoom = next;
    clampCenter();
    draw();
  }
  function localPoint(event) {
    const rectangle = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rectangle.left,
      y: event.clientY - rectangle.top,
    };
  }
  function hitAt(position) {
    return [...hitTargets]
      .reverse()
      .find((hit) => Math.hypot(hit.x - position.x, hit.y - position.y) <= 16);
  }
  function refresh() {
    if (!opened || disposed) return;
    const world = getWorld?.() || {},
      company = getCompany?.() || {};
    const updatedBounds = getBounds(world);
    if (
      !bounds ||
      Object.keys(updatedBounds).some(
        (key) => bounds[key] !== updatedBounds[key],
      )
    ) {
      bounds = updatedBounds;
      center = {
        x: (bounds.minX + bounds.maxX) / 2,
        z: (bounds.minZ + bounds.maxZ) / 2,
      };
      zoom = 1;
    }
    places = collectPlaces(world, company);
    $("#city-map-title").textContent =
      MAP_NAMES[getMapId?.()] || "Mapa do território";
    $(".city-map-footer-status").innerHTML =
      `<strong>${escape(company.name || "A tua história")}</strong> · ${places.length ? "Marca uma rota e visita o destino no terreno." : "Exploração livre"}`;
    renderPlaces();
  }
  function open() {
    if (disposed || opened) return false;
    previousFocus = document.activeElement;
    opened = true;
    panel.hidden = false;
    filter = "all";
    query = "";
    $(".city-map-search input").value = "";
    selectedId = null;
    bounds = null;
    onStateChange?.(true);
    refresh();
    closeButton.focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!opened) return false;
    opened = false;
    drag = null;
    panel.hidden = true;
    onStateChange?.(false);
    const visible =
      previousFocus?.isConnected &&
      !panel.contains(previousFocus) &&
      previousFocus.getClientRects?.().length &&
      !previousFocus.closest?.("[hidden]") &&
      getComputedStyle(previousFocus).visibility !== "hidden";
    const focusTarget = visible
      ? previousFocus
      : document.getElementById("view");
    if (focusTarget) {
      if (focusTarget.id === "view" && !focusTarget.hasAttribute("tabindex"))
        focusTarget.tabIndex = -1;
      focusTarget.focus?.({ preventScroll: true });
    }
    return true;
  }
  function onResize() {
    if (!opened || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      draw();
    });
  }
  function onFocus(event) {
    if (opened && !panel.contains(event.target))
      closeButton.focus({ preventScroll: true });
  }
  panel.addEventListener("keydown", (event) => {
    if (!opened || disposed) return;
    event.stopPropagation();
    const key = event.key.toLowerCase(),
      typing = event.target.matches("input,textarea,[contenteditable='true']");
    if (key === "escape" || (key === "t" && !typing)) {
      event.preventDefault();
      close();
      return;
    }
    if (key === "tab") {
      const controls = [
        ...panel.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),canvas[tabindex='0']",
        ),
      ].filter((control) => !control.hidden && control.getClientRects().length);
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
    if (event.target !== canvas) return;
    const movement = {
      arrowleft: [-1, 0],
      arrowright: [1, 0],
      arrowup: [0, -1],
      arrowdown: [0, 1],
    }[key];
    if (movement && metrics) {
      event.preventDefault();
      center.x += (movement[0] * 70) / metrics.scale;
      center.z += (movement[1] * 70) / metrics.scale;
      clampCenter();
      draw();
    }
    if (["+", "=", "-", "_"].includes(key)) {
      event.preventDefault();
      zoomTo(zoom * (["-", "_"].includes(key) ? 0.8 : 1.25));
    }
    if (key === "enter" && selectedId) {
      event.preventDefault();
      visit(selectedId);
    }
  });
  panel.addEventListener("click", (event) => {
    const destination = event.target.closest("[data-map-place]");
    if (destination) {
      visit(destination.dataset.mapPlace);
      return;
    }
    const category = event.target.closest("[data-map-filter]");
    if (category) {
      filter = category.dataset.mapFilter;
      renderPlaces();
      return;
    }
    const tool = event.target.closest("[data-map-tool]")?.dataset.mapTool;
    if (tool === "in") zoomTo(zoom * 1.35);
    if (tool === "out") zoomTo(zoom / 1.35);
    if (tool === "fit") fit();
    if (tool === "player") {
      center = player();
      zoom = Math.max(zoom, 3);
      draw();
    }
  });
  list.addEventListener("pointerover", (event) => {
    const destination = event.target.closest("[data-map-place]");
    if (destination) selectPlace(destination.dataset.mapPlace);
  });
  list.addEventListener("focusin", (event) => {
    const destination = event.target.closest("[data-map-place]");
    if (destination) selectPlace(destination.dataset.mapPlace);
  });
  $(".city-map-search input").addEventListener("input", (event) => {
    query = searchText(event.target.value).trim();
    renderPlaces();
  });
  $(".city-map-route").addEventListener("click", () => visit(selectedId));
  closeButton.addEventListener("click", close);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomTo(
        zoom * Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.0025),
        localPoint(event),
      );
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !metrics) return;
    const point = localPoint(event);
    drag = { id: event.pointerId, start: point, previous: point, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = localPoint(event);
    if (!drag || drag.id !== event.pointerId || !metrics) {
      const hit = hitAt(point);
      canvas.style.cursor = hit ? "pointer" : "grab";
      return;
    }
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 6)
      drag.moved = true;
    if (drag.moved) {
      center.x -= (point.x - drag.previous.x) / metrics.scale;
      center.z -= (point.y - drag.previous.y) / metrics.scale;
      clampCenter();
      draw();
    }
    drag.previous = point;
  });
  function releasePointer(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = !drag.moved && event.type !== "pointercancel",
      hit = clicked ? hitAt(localPoint(event)) : null;
    drag = null;
    canvas.classList.remove("is-dragging");
    canvas.style.cursor = "grab";
    if (canvas.hasPointerCapture?.(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (hit) visit(hit.id);
  }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  document.addEventListener("focusin", onFocus);
  globalThis.addEventListener("resize", onResize);
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  observer?.observe(canvas);
  return {
    open,
    close,
    refresh,
    isOpen: () => opened,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      observer?.disconnect();
      globalThis.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocus);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      panel.remove();
      style.remove();
      places = [];
      visiblePlaces = [];
      hitTargets = [];
    },
  };
}

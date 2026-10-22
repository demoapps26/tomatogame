import * as THREE from "three";
import { MAPS, buildWorld } from "./world.js";
import {
  createCharacter,
  createVehicle,
  createTomato,
  createPickup,
} from "./actors.js";
import { createNavigation } from "./navigation.js";
import {
  createCompany,
  normalizeCompany,
  getCompanyView,
  deliverContract,
} from "./company.js";
import { createCompanyPanel } from "./company-panel.js";
import { createCityLife } from "./life.js";
import { createVisuals } from "./graphics.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const settings = {
  quality: "medium",
  sensitivity: 1,
  muted: false,
  cash: 0,
  completed: {},
};
try {
  Object.assign(
    settings,
    JSON.parse(localStorage.getItem("tomato-republic-v2") || "{}"),
  );
} catch {}
if (!["low", "medium", "high"].includes(settings.quality))
  settings.quality = "medium";
settings.sensitivity = THREE.MathUtils.clamp(
  Number(settings.sensitivity) || 1,
  0.5,
  2,
);
settings.cash = Math.max(0, Number(settings.cash) || 0);
if (!settings.completed || typeof settings.completed !== "object")
  settings.completed = {};
function save() {
  try {
    localStorage.setItem("tomato-republic-v2", JSON.stringify(settings));
  } catch {}
  saveCampaign();
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings.quality !== "low",
    powerPreference: "high-performance",
  });
} catch {
  $("menu-description").textContent =
    "Não foi possível iniciar os gráficos 3D. Abre este jogo num navegador com WebGL 2 e aceleração gráfica ativados.";
  $("play").disabled = true;
  throw new Error("WebGL 2 is required to run Tomato Republic.");
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  58,
  innerWidth / innerHeight,
  0.12,
  1800,
);
const visuals = createVisuals(renderer, scene, camera, settings.quality);
let savedCampaign = null;
try {
  const data = JSON.parse(
    localStorage.getItem("tomato-republic-campaign-v3") || "null",
  );
  if (data?.version === 3) savedCampaign = data;
} catch {}
let company = normalizeCompany(savedCampaign?.company || createCompany());
let companyView = getCompanyView(company),
  founded = !!savedCampaign?.founded;
let activeContractId = savedCampaign?.activeContractId || null,
  companyPanel = null,
  life = null;
let renderDirty = true;
let replacingCampaign = false;
let initialized = false,
  autosaveTime = 0,
  routeTime = 0,
  route = [],
  lastStoryEvent = savedCampaign?.lastStoryEvent || "",
  storyTime = 0;
const raycaster = new THREE.Raycaster();
const groundRay = new THREE.Vector2(0, 0);
const keys = new Set();
const player = {
  position: new THREE.Vector3(),
  health: 100,
  ammo: 12,
  yaw: Math.PI,
  actor: createCharacter(),
  vehicle: null,
};
scene.add(player.actor.group);
const tomatoTemplate = createTomato(0.15);
const particleGeometry = new THREE.SphereGeometry(0.06, 5, 4);
const particleMaterial = new THREE.MeshStandardMaterial({
  color: 0xe7532f,
  roughness: 0.9,
});
let mapId = "cidade",
  world,
  navigation,
  cars = [],
  enemies = [],
  shots = [],
  pickups = [],
  particles = [];
let state = "menu",
  started = false,
  transitioning = false,
  time = 0,
  last = performance.now(),
  frameDt = 0;
let yaw = 0,
  pitch = 0.24,
  cooldown = 0,
  reloadTime = 0,
  healthFlash = 0,
  hitFlash = 0,
  fireHeld = false,
  dragging = false;
let mousePosition = null,
  touchPosition = null,
  firePointer = null,
  lookPointer = null,
  ownedLock = false;
let wanted = 0,
  quietTime = 0,
  patrolTime = 0,
  stepsTime = 0,
  messageTime = 0,
  hudTime = 0,
  minimapTime = 0;
let kills = 0,
  marker,
  markerRing,
  markerBeam,
  markerTime = 0;
const moving = new THREE.Vector3(),
  lookTarget = new THREE.Vector3(),
  cameraTarget = new THREE.Vector3(),
  cameraDesired = new THREE.Vector3();
const audio = { context: null, master: null, motor: null, motorGain: null };

function initAudio() {
  if (audio.context) {
    audio.context.resume().catch(() => {});
    return;
  }
  try {
    audio.context = new (window.AudioContext || window.webkitAudioContext)();
    audio.master = audio.context.createGain();
    audio.master.connect(audio.context.destination);
    audio.master.gain.value = settings.muted ? 0 : 0.32;
    audio.motor = audio.context.createOscillator();
    audio.motor.type = "sawtooth";
    audio.motorGain = audio.context.createGain();
    const filter = audio.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    audio.motor.connect(filter);
    filter.connect(audio.motorGain);
    audio.motorGain.connect(audio.master);
    audio.motorGain.gain.value = 0;
    audio.motor.start();
  } catch {}
}
function sound(kind) {
  if (!audio.context || settings.muted) return;
  const context = audio.context,
    now = context.currentTime,
    osc = context.createOscillator(),
    gain = context.createGain();
  osc.connect(gain);
  gain.connect(audio.master);
  const values =
    kind === "reward"
      ? [440, 880, 0.22]
      : kind === "hit"
        ? [150, 55, 0.12]
        : kind === "reload"
          ? [230, 320, 0.09]
          : [320, 90, 0.11];
  osc.type = kind === "reward" ? "sine" : "triangle";
  osc.frequency.setValueAtTime(values[0], now);
  osc.frequency.exponentialRampToValueAtTime(values[1], now + values[2]);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + values[2]);
  osc.start();
  osc.stop(now + values[2]);
}
function notify(text, duration = 4) {
  $("notice").textContent = text;
  const feedback = document.getElementById("company-feedback");
  if (feedback && state === "company") feedback.textContent = text;
  messageTime = duration;
}
function clearGroup(group) {
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
  group.removeFromParent();
  geometries.forEach((x) => x.dispose());
  materials.forEach((x) => x.dispose());
  textures.forEach((x) => x.dispose());
}
function hitBox(x, z, radius = 0.35, height = null) {
  if (!world) return false;
  const b = world.bounds;
  if (
    x - radius < b.minX ||
    x + radius > b.maxX ||
    z - radius < b.minZ ||
    z + radius > b.maxZ
  )
    return true;
  return world.colliders.some(
    (box) =>
      (height === null ||
        (height >= (box.minY ?? 0) - radius &&
          height <= (box.maxY ?? 20) + radius)) &&
      x + radius > box.minX &&
      x - radius < box.maxX &&
      z + radius > box.minZ &&
      z - radius < box.maxZ,
  );
}
function carAt(x, z, radius = 0.35, ignore = null) {
  for (const car of [...cars, ...(life?.vehicles || [])]) {
    if (
      car === ignore ||
      Math.abs(x - car.position.x) > 5 + radius ||
      Math.abs(z - car.position.z) > 5 + radius
    )
      continue;
    const dx = x - car.position.x,
      dz = z - car.position.z,
      c = Math.cos(car.yaw),
      s = Math.sin(car.yaw);
    const localX = dx * c - dz * s,
      localZ = dx * s + dz * c;
    const distanceX = Math.max(0, Math.abs(localX) - 1.15),
      distanceZ = Math.max(0, Math.abs(localZ) - 2.18);
    if (distanceX * distanceX + distanceZ * distanceZ < radius * radius)
      return car;
  }
  return null;
}
function moveTo(entity, dx, dz, radius) {
  let blocked = false;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let i = 0; i < count; i++) {
    if (
      !hitBox(entity.position.x + dx / count, entity.position.z, radius) &&
      !carAt(entity.position.x + dx / count, entity.position.z, radius, entity)
    )
      entity.position.x += dx / count;
    else blocked = true;
    if (
      !hitBox(entity.position.x, entity.position.z + dz / count, radius) &&
      !carAt(entity.position.x, entity.position.z + dz / count, radius, entity)
    )
      entity.position.z += dz / count;
    else blocked = true;
  }
  return blocked;
}
function lineClear(a, b) {
  const count = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.6);
  for (let i = 1; i < count; i++)
    if (
      hitBox(
        THREE.MathUtils.lerp(a.x, b.x, i / count),
        THREE.MathUtils.lerp(a.z, b.z, i / count),
        0.05,
        1.35,
      )
    )
      return false;
  return true;
}
function safePosition(x, z) {
  if (!hitBox(x, z, 0.8)) return new THREE.Vector3(x, 0, z);
  for (let distance = 2; distance < 25; distance += 2)
    for (let angle = 0; angle < 6.3; angle += 0.6) {
      const px = x + Math.sin(angle) * distance,
        pz = z + Math.cos(angle) * distance;
      if (!hitBox(px, pz, 0.8)) return new THREE.Vector3(px, 0, pz);
    }
  return new THREE.Vector3(world.spawn.x, 0, world.spawn.z);
}
function addEnemy(position, index = 0) {
  const actor = createCharacter({ enemy: true }),
    point = safePosition(position.x, position.z);
  actor.group.position.copy(point);
  scene.add(actor.group);
  enemies.push({
    actor,
    position: actor.group.position,
    health: 3,
    attack: 1.5 + index * 0.7,
    origin: point.clone(),
    phase: index * 1.7,
    deadTime: 0,
    path: [],
    navTime: 0,
  });
}
function currentContract() {
  return (
    company.contracts?.find(
      (contract) =>
        contract.id === activeContractId &&
        ["accepted", "active", "reserved"].includes(contract.status),
    ) || null
  );
}
function businessLocation(id) {
  return (
    world.businessLocations?.find((location) => location.id === id) || null
  );
}
function questPoint() {
  const contract = currentContract();
  if (contract)
    return mapId === "cidade" ? businessLocation(contract.destination) : null;
  return businessLocation("sede");
}
function saveCampaign() {
  if (!initialized || replacingCampaign) return;
  try {
    const data = {
      version: 3,
      savedAt: Date.now(),
      company,
      founded,
      mapId,
      position: { x: player.position.x, z: player.position.z },
      health: player.health,
      ammo: player.ammo,
      yaw,
      pitch,
      activeContractId,
      lastStoryEvent,
      vehicles: cars.map((car) => ({
        x: car.position.x,
        z: car.position.z,
        yaw: car.yaw,
      })),
      driving: player.vehicle ? cars.indexOf(player.vehicle) : -1,
    };
    localStorage.setItem("tomato-republic-campaign-v3", JSON.stringify(data));
    if ($("save-state"))
      $("save-state").textContent = "Progresso guardado neste navegador";
  } catch {
    if ($("save-state"))
      $("save-state").textContent =
        "Este navegador não permitiu guardar o progresso";
  }
}
function changeCompany(next) {
  renderDirty = true;
  company = normalizeCompany(next);
  companyView = getCompanyView(company);
  if (activeContractId && !currentContract()) {
    activeContractId = null;
    route = [];
  }
  if (world?.updateCompany?.(company))
    navigation = createNavigation(
      world.colliders,
      world.bounds,
      world.navigationCellSize || 3,
    );
  updateMission();
  updateHud();
  saveCampaign();
  checkStory();
}
function checkStory() {
  const event = companyView.event;
  if (!founded || !event?.ready || event.id === lastStoryEvent) return;
  lastStoryEvent = event.id;
  storyTime = 12;
  $("story-speaker").textContent = companyView.mentor || "Marta · Cooperativa";
  $("story-text").textContent =
    companyView.dialogue || event.body || companyView.objective;
  $("story-toast").hidden = false;
}
function openCompany(tab = "overview") {
  if (!started) return;
  setState("company");
  $("company-panel").hidden = false;
  companyPanel.open(tab);
  $("story-toast").hidden = true;
  $("close-company").focus();
}
function closeCompany() {
  $("company-panel").hidden = true;
  setState("playing");
  last = performance.now();
  saveCampaign();
}
function trackContract(id) {
  const contract = company.contracts?.find(
    (item) =>
      item.id === id &&
      ["accepted", "active", "reserved"].includes(item.status),
  );
  if (!contract) return;
  activeContractId = id;
  if (mapId !== "cidade") resetMap("cidade");
  const point = questPoint();
  route = point ? navigation.findPath(player.position, point) : [];
  routeTime = 4;
  notify(
    "Entrega marcada. Segue a rota dourada no minimapa e carrega em E no destino.",
    6,
  );
  updateMission();
  saveCampaign();
}
function makeMarker() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.075, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffce66 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.6, 8, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd27b,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 4;
  const tip = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5),
    new THREE.MeshStandardMaterial({
      color: 0xffc462,
      emissive: 0xcf6926,
      emissiveIntensity: 0.7,
      metalness: 0.3,
      roughness: 0.35,
    }),
  );
  tip.position.y = 3.2;
  group.add(ring, beam, tip);
  scene.add(group);
  marker = group;
  markerRing = ring;
  markerBeam = tip;
}
function resetMap(id) {
  transitioning = true;
  renderDirty = true;
  for (const shot of shots) shot.mesh.removeFromParent();
  shots = [];
  for (const item of pickups) clearGroup(item.mesh);
  pickups = [];
  for (const p of particles) p.mesh.removeFromParent();
  particles = [];
  for (const enemy of enemies) clearGroup(enemy.actor.group);
  enemies = [];
  for (const car of cars) clearGroup(car.actor.group);
  cars = [];
  if (marker) clearGroup(marker);
  life?.dispose();
  life = null;
  world?.dispose();
  mapId = MAPS.some((map) => map.id === id) ? id : "cidade";
  world = buildWorld(scene, mapId, settings.quality);
  world.updateCompany?.(company);
  navigation = createNavigation(
    world.colliders,
    world.bounds,
    world.navigationCellSize || 3,
  );
  player.position.set(world.spawn.x, 0, world.spawn.z);
  player.health = 100;
  player.ammo = 12;
  player.vehicle = null;
  player.yaw = Math.PI;
  player.actor.group.visible = true;
  player.actor.group.position.copy(player.position);
  player.actor.group.rotation.y = player.yaw;
  yaw = 0;
  pitch = 0.24;
  wanted = 0;
  quietTime = 0;
  patrolTime = 0;
  kills = 0;
  reloadTime = 0;
  cooldown = 0;
  const colors = [0xcf5538, 0x8baf9f, 0xe0c38a, 0x384e61, 0xc5d0bb];
  world.vehicleSpawns.slice(0, 5).forEach((spawn, index) => {
    const actor = createVehicle(colors[index % colors.length]);
    actor.group.position.copy(safePosition(spawn.x, spawn.z));
    actor.group.rotation.y = spawn.yaw || 0;
    scene.add(actor.group);
    cars.push({
      actor,
      position: actor.group.position,
      yaw: spawn.yaw || 0,
      speed: 0,
      steering: 0,
    });
  });
  world.enemySpawns
    .slice(0, 6)
    .forEach((spawn, index) => addEnemy(spawn, index));
  life = createCityLife(scene, world, settings.quality);
  route = [];
  routeTime = 0;
  makeMarker();
  $("location").textContent = MAPS.find((map) => map.id === mapId).name;
  document.querySelectorAll("[data-map]").forEach((button) => {
    const selected = button.dataset.map === mapId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateMission();
  updateHud();
  cameraUpdate(0.5, true);
  world.update?.(time, player.position);
  for (const car of cars)
    car.actor.group.visible = car.position.distanceTo(player.position) < 240;
  for (const enemy of enemies)
    enemy.actor.group.visible =
      enemy.position.distanceTo(player.position) < 145;
  transitioning = false;
}
function updateMission() {
  const contract = currentContract(),
    point = questPoint();
  const remoteContract = contract && mapId !== "cidade";
  const distance = point
    ? Math.round(
        Math.hypot(point.x - player.position.x, point.z - player.position.z),
      )
    : 0;
  $("mission-title").textContent = contract
    ? contract.title
    : companyView.event?.title || companyView.title;
  $("mission-description").textContent = remoteContract
    ? "Esta entrega é feita em Santa Tomata. Abre B Empresa → Contratos e escolhe «Seguir entrega no mapa» para regressar à cidade e retomar a rota."
    : contract
      ? `Leva ${contract.quantity} caixas a ${point?.name || contract.destination}. Recebes ${Math.round(contract.payment)} € após a entrega.`
      : companyView.objective;
  $("mission-progress").textContent = remoteContract
    ? `RETOMAR EM SANTA TOMATA · DIA ${contract.deadlineDay}`
    : contract
      ? `ENTREGAR · ${distance} m · DIA ${contract.deadlineDay}`
      : `${companyView.chapterLabel} · B EMPRESA`;
}
function reward(amount, text) {
  company = { ...company, cash: company.cash + amount };
  companyView = getCompanyView(company);
  saveCampaign();
  sound("reward");
  notify(`${text} +${amount} €`, 5);
  updateHud();
}
function missionAction() {
  const contract = currentContract();
  const remoteContract = contract && mapId !== "cidade";
  const point =
    questPoint() || (remoteContract ? businessLocation("sede") : null);
  if (
    !point ||
    Math.hypot(player.position.x - point.x, player.position.z - point.z) > 6
  )
    return false;
  if (contract && mapId === "cidade") {
    const result = deliverContract(company, contract.id);
    if (result.ok) {
      activeContractId = null;
      changeCompany(result.state);
      notify(result.message, 6);
      sound("reward");
      route = [];
    } else notify(result.message);
    return true;
  }
  if (point.id === "sede" && !player.vehicle) {
    openCompany(remoteContract ? "contracts" : founded ? "overview" : "story");
    return true;
  }
  return false;
}
function interact() {
  if (state !== "playing") return;
  if (missionAction()) return;
  if (player.vehicle) {
    const car = player.vehicle;
    let exit = null;
    for (const side of [1, -1]) {
      const point = new THREE.Vector3(
        car.position.x + Math.cos(car.yaw) * 2.4 * side,
        0,
        car.position.z - Math.sin(car.yaw) * 2.4 * side,
      );
      if (
        !hitBox(point.x, point.z, 0.35) &&
        !carAt(point.x, point.z, 0.35, car)
      ) {
        exit = point;
        break;
      }
    }
    if (!exit) {
      notify("Não há espaço para sair. Afasta o veículo do obstáculo.");
      return;
    }
    player.position.copy(exit);
    car.speed = 0;
    player.vehicle = null;
    player.actor.group.visible = true;
    notify("A pé. Rato para mirar; clique para arremessar.");
  } else {
    const car = cars.find(
      (car) => car.position.distanceTo(player.position) < 4.2,
    );
    if (car) {
      player.vehicle = car;
      car.speed = 0;
      player.actor.group.visible = false;
      player.position.copy(car.position);
      yaw = car.yaw - Math.PI;
      notify("W acelera · S trava/recua · A/D vira · Espaço trava · E sai.", 5);
    }
  }
  updateHud();
  saveCampaign();
}
function reload() {
  if (state !== "playing" || reloadTime > 0 || player.ammo === 12) return;
  reloadTime = 1.35;
  notify("A encher o cesto…", 1.4);
  sound("reload");
  updateHud();
}
function lockMouse() {
  if (
    matchMedia("(pointer: coarse)").matches ||
    document.pointerLockElement === canvas
  )
    return;
  try {
    const result = canvas.requestPointerLock?.();
    result?.catch?.(() => {});
  } catch {}
}
function setState(next) {
  state = next;
  renderDirty = true;
  document.body.dataset.state = next;
  $("hud").inert = next === "company";
  keys.clear();
  fireHeld = false;
  dragging = false;
  firePointer = null;
  lookPointer = null;
  mousePosition = null;
  touchPosition = null;
  if (next !== "playing") {
    saveCampaign();
    ownedLock = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  if (next !== "company") $("company-panel").hidden = true;
  if (audio.motorGain)
    audio.motorGain.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
}
function play() {
  initAudio();
  started = true;
  setState("playing");
  last = performance.now();
  if (!founded) {
    notify(
      "Uma herança, uma empresa por criar. A tua história começa aqui.",
      6,
    );
    openCompany("overview");
  } else {
    notify("Bem-vindo de volta. B abre a empresa; E permite interagir.", 5);
    checkStory();
  }
}
function pause() {
  if (state !== "playing") return;
  saveCampaign();
  setState("menu");
  $("menu-title").textContent = "A tua cidade espera.";
  $("menu-description").textContent =
    "A tua empresa e a história ficam guardadas. Explora os territórios ou retoma a cidade.";
  $("play").textContent = "Retomar aventura";
}
function addShot(position, direction, enemy = false) {
  const mesh = tomatoTemplate.clone(true);
  mesh.position.copy(position);
  scene.add(mesh);
  shots.push({
    mesh,
    velocity: direction.clone().multiplyScalar(enemy ? 10 : 27),
    age: 0,
    enemy,
    ownerPosition: position.clone(),
  });
}
function shoot() {
  if (state !== "playing" || cooldown > 0 || reloadTime > 0) return;
  if (player.vehicle) {
    cooldown = 0.5;
    notify("Sai do veículo para arremessar tomates.");
    return;
  }
  if (player.ammo <= 0) {
    reload();
    return;
  }
  player.ammo--;
  cooldown = 0.28;
  wanted = Math.min(3, wanted + 0.12);
  quietTime = 0;
  raycaster.setFromCamera(groundRay, camera);
  const targets = [
    world.group,
    ...enemies.filter((e) => e.health > 0).map((e) => e.actor.group),
    ...cars.map((c) => c.actor.group),
  ];
  const hits = raycaster
    .intersectObjects(targets, true)
    .filter((hit) => hit.distance > 1.3);
  const aim = hits.length
    ? hits[0].point
    : raycaster.ray.at(90, new THREE.Vector3());
  const origin = player.position
    .clone()
    .add(new THREE.Vector3(0, player.vehicle ? 2 : 1.45, 0));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  origin.addScaledVector(right, 0.32);
  const direction = aim.clone().sub(origin).normalize();
  origin.addScaledVector(direction, 0.45);
  addShot(origin, direction);
  sound("throw");
  updateHud();
}
function burst(position) {
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
    mesh.position.copy(position);
    scene.add(mesh);
    particles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4,
      ),
      age: 0,
    });
  }
}
function killEnemy(enemy) {
  enemy.health = 0;
  enemy.deadTime = 0.01;
  kills++;
  wanted = Math.min(3, wanted + 0.4);
  quietTime = 0;
  notify("Ameaça afastada. Podes continuar o teu percurso.");
  const health = createPickup("health");
  health.position.copy(enemy.position);
  scene.add(health);
  pickups.push({
    mesh: health,
    type: "health",
    position: health.position,
    age: 0,
  });
}
function damage(amount) {
  player.health = Math.max(0, player.health - amount);
  healthFlash = 1;
  sound("hit");
  updateHud();
  if (player.health <= 0) {
    const fee = Math.min(company.cash, 50);
    company = {
      ...company,
      cash: company.cash - fee,
      expenses: company.expenses + fee,
      history: [
        ...company.history,
        {
          day: company.day,
          title: "Recuperação",
          body: `Assistência da cooperativa: ${fee} €.`,
          kind: "expense",
        },
      ].slice(-100),
    };
    companyView = getCompanyView(company);
    save();
    if (player.vehicle) player.vehicle.speed = 0;
    player.vehicle = null;
    player.position.set(world.spawn.x, 0, world.spawn.z);
    player.health = 100;
    player.ammo = 12;
    player.actor.group.visible = true;
    player.actor.group.position.copy(player.position);
    wanted = 0;
    reloadTime = 0;
    shots.forEach((s) => s.mesh.removeFromParent());
    shots = [];
    enemies.forEach((e) => (e.attack = 4));
    yaw = 0;
    pitch = 0.24;
    cameraUpdate(0.5, true);
    notify(
      "A cooperativa levou-te para um lugar seguro. Recuperação: 50 €.",
      6,
    );
    updateHud();
    return true;
  }
  return false;
}
function updateHud() {
  $("health").textContent = Math.ceil(player.health);
  $("ammo").textContent = reloadTime > 0 ? "…" : player.ammo;
  $("reserve").textContent = "∞";
  $("cash").textContent = Math.floor(company.cash).toLocaleString("pt-PT");
  $("wanted").textContent =
    "★".repeat(Math.ceil(wanted)) +
    "☆".repeat(Math.max(0, 3 - Math.ceil(wanted)));
  $("vehicle-hud").hidden = !player.vehicle;
  if (player.vehicle)
    $("speed").textContent = Math.round(Math.abs(player.vehicle.speed) * 3.6);
}
function updatePlayer(dt) {
  if (player.vehicle) {
    const car = player.vehicle,
      gas =
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const turn =
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0) -
      (keys.has("d") || keys.has("arrowright") ? 1 : 0);
    car.speed += gas * dt * (gas * car.speed < 0 ? 22 : 11);
    car.speed = THREE.MathUtils.clamp(car.speed, -7, 23);
    car.speed *= Math.exp(-dt * (keys.has(" ") ? 4.2 : gas ? 0.18 : 1.0));
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
    car.steering = THREE.MathUtils.damp(car.steering, turn * 0.5, 8, dt);
    car.yaw += car.steering * dt * car.speed * 0.14;
    const blocked = moveTo(
      car,
      Math.sin(car.yaw) * car.speed * dt,
      Math.cos(car.yaw) * car.speed * dt,
      1.2,
    );
    if (blocked) {
      if (Math.abs(car.speed) > 8 && damage(4)) return;
      car.speed *= -0.18;
    }
    car.actor.group.rotation.y = car.yaw;
    car.actor.animate(dt, car.speed, car.steering);
    player.position.copy(car.position);
    for (const enemy of enemies)
      if (
        enemy.health > 0 &&
        enemy.position.distanceTo(car.position) < 1.7 &&
        Math.abs(car.speed) > 5
      )
        killEnemy(enemy);
  } else {
    const forward =
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0),
      side =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    moving.set(
      -Math.sin(yaw) * forward + Math.cos(yaw) * side,
      0,
      -Math.cos(yaw) * forward - Math.sin(yaw) * side,
    );
    if (moving.lengthSq() > 0) moving.normalize();
    const running = keys.has("shift") || keys.has(" "),
      speed = running ? 7 : 4;
    moveTo(player, moving.x * speed * dt, moving.z * speed * dt, 0.35);
    if (fireHeld) {
      player.yaw = yaw + Math.PI;
    } else if (moving.lengthSq() > 0)
      player.yaw = THREE.MathUtils.lerp(
        player.yaw,
        player.yaw +
          Math.atan2(
            Math.sin(Math.atan2(moving.x, moving.z) - player.yaw),
            Math.cos(Math.atan2(moving.x, moving.z) - player.yaw),
          ),
        Math.min(1, dt * 13),
      );
    player.actor.group.position.copy(player.position);
    player.actor.group.rotation.y = player.yaw;
    player.actor.animate(
      dt,
      moving.length() * speed,
      time,
      fireHeld || cooldown > 0.1,
    );
    if (moving.lengthSq() > 0) {
      stepsTime -= dt;
      if (stepsTime <= 0) {
        stepsTime = running ? 0.24 : 0.4;
      }
    }
  }
}
function updateEnemies(dt) {
  for (const enemy of enemies) {
    if (enemy.health <= 0) {
      enemy.deadTime += dt;
      enemy.actor.group.rotation.z = THREE.MathUtils.damp(
        enemy.actor.group.rotation.z,
        -Math.PI / 2,
        6,
        dt,
      );
      if (enemy.deadTime > 1.5) {
        clearGroup(enemy.actor.group);
        enemy.removed = true;
      }
      continue;
    }
    enemy.actor.group.visible =
      enemy.position.distanceTo(player.position) < 145;
    const delta = player.position.clone().sub(enemy.position),
      distance = delta.length(),
      visible = distance < 35 && lineClear(enemy.position, player.position);
    let speed = 0;
    const alerted = wanted > 0.7 || (mapId !== "cidade" && distance < 14);
    if (alerted && distance < 55 && (distance > 9 || !visible)) {
      enemy.navTime -= dt;
      if (!visible && enemy.navTime <= 0) {
        enemy.path = navigation.findPath(enemy.position, player.position);
        enemy.navTime = 1 + Math.random() * 0.3;
      }
      while (
        enemy.path.length &&
        Math.hypot(
          enemy.path[0].x - enemy.position.x,
          enemy.path[0].z - enemy.position.z,
        ) < 0.7
      )
        enemy.path.shift();
      const waypoint = visible ? player.position : enemy.path[0];
      if (waypoint) {
        const direction = new THREE.Vector3(
          waypoint.x - enemy.position.x,
          0,
          waypoint.z - enemy.position.z,
        ).normalize();
        moveTo(enemy, direction.x * dt * 2.1, direction.z * dt * 2.1, 0.4);
        speed = 2.1;
      }
    } else if (alerted && visible && distance > 4) {
      const factor = Math.sin(time + enemy.phase);
      moveTo(
        enemy,
        (delta.z / distance) * dt * 0.65 * factor,
        (-delta.x / distance) * dt * 0.65 * factor,
        0.4,
      );
      speed = 0.65;
    }
    enemy.actor.group.rotation.y = Math.atan2(delta.x, delta.z);
    enemy.actor.animate(dt, speed, time, visible);
    enemy.attack -= dt;
    if (alerted && visible && enemy.attack <= 0) {
      const origin = enemy.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const target = player.position
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.3,
            player.vehicle ? 1.7 : 1.15,
            (Math.random() - 0.5) * 1.3,
          ),
        );
      addShot(origin, target.sub(origin).normalize(), true);
      enemy.attack = 2.1 + Math.random() * 1.2;
    }
  }
  enemies = enemies.filter((enemy) => !enemy.removed);
}
function updateShots(dt) {
  for (const shot of shots) {
    shot.age += dt;
    shot.velocity.y -= dt * 1.2;
    shot.mesh.rotation.x += dt * 9;
    shot.mesh.rotation.z += dt * 7;
    const count = Math.max(1, Math.ceil((shot.velocity.length() * dt) / 0.25));
    for (let i = 0; i < count && !shot.dead; i++) {
      shot.mesh.position.addScaledVector(shot.velocity, dt / count);
      const p = shot.mesh.position;
      if (p.y < 0.08 || hitBox(p.x, p.z, 0.08, p.y)) {
        shot.dead = true;
        burst(p);
        break;
      }
      const struckCar = p.y > 0.15 && p.y < 1.95 ? carAt(p.x, p.z, 0.12) : null;
      if (struckCar) {
        shot.dead = true;
        burst(p);
        if (shot.enemy && struckCar === player.vehicle && damage(5)) return;
        break;
      }
      if (shot.enemy) {
        if (
          Math.hypot(p.x - player.position.x, p.z - player.position.z) <
            (player.vehicle ? 1.25 : 0.55) &&
          p.y < 2.5 &&
          p.y > 0
        ) {
          shot.dead = true;
          burst(p);
          if (damage(player.vehicle ? 5 : 12)) return;
        }
      } else
        for (const enemy of enemies)
          if (
            enemy.health > 0 &&
            Math.hypot(p.x - enemy.position.x, p.z - enemy.position.z) < 0.65 &&
            p.y > 0.1 &&
            p.y < 2.1
          ) {
            shot.dead = true;
            burst(p);
            enemy.health--;
            hitFlash = 1;
            sound("hit");
            if (enemy.health <= 0) killEnemy(enemy);
            break;
          }
    }
    if (shot.age > 5) shot.dead = true;
    if (shot.dead) shot.mesh.removeFromParent();
  }
  shots = shots.filter((s) => !s.dead);
  for (const p of particles) {
    p.age += dt;
    p.velocity.y -= dt * 9;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.mesh.scale.setScalar(Math.max(0, 1 - p.age / 1));
    if (p.age > 1) p.mesh.removeFromParent();
  }
  particles = particles.filter((p) => p.age <= 1);
}
function updateQuests(dt) {
  const point = questPoint(),
    contract = currentContract();
  const remoteContract = contract && mapId !== "cidade";
  marker.visible = !!point;
  if (point) {
    marker.position.set(point.x, 0, point.z);
    markerBeam.rotation.y += dt;
    markerBeam.position.y = 3.2 + Math.sin(time * 2) * 0.25;
  }
  for (const pickup of pickups) {
    if (pickup.type === "health") {
      pickup.age += dt;
      pickup.mesh.rotation.y += dt;
      if (pickup.age > 60) {
        pickup.dead = true;
        clearGroup(pickup.mesh);
        continue;
      }
      if (pickup.position.distanceTo(player.position) < 1.7) {
        player.health = Math.min(100, player.health + 25);
        pickup.dead = true;
        clearGroup(pickup.mesh);
        notify("Colheita fresca: +25 de vida.");
        updateHud();
      }
    }
  }
  pickups = pickups.filter((p) => !p.dead);
  let prompt = "";
  const interactionPoint =
    point || (remoteContract ? businessLocation("sede") : null);
  if (
    interactionPoint &&
    Math.hypot(
      player.position.x - interactionPoint.x,
      player.position.z - interactionPoint.z,
    ) < 6
  )
    prompt = remoteContract
      ? player.vehicle
        ? "E · Sair do veículo · B Empresa"
        : "E · Empresa / retomar entrega"
      : contract
        ? "E · Entregar contrato"
        : player.vehicle
          ? "E · Sair do veículo · B Empresa"
          : "E · Entrar na empresa";
  else if (player.vehicle) prompt = "E · Sair do veículo";
  else if (cars.some((c) => c.position.distanceTo(player.position) < 4.2))
    prompt = "E · Conduzir";
  else if (remoteContract) prompt = "B · Empresa → Contratos → Retomar entrega";
  $("prompt").textContent = prompt;
  $("prompt").hidden = !prompt;
  routeTime -= dt;
  if (remoteContract) {
    route = [];
    routeTime = 0;
  } else if (contract && point && routeTime <= 0) {
    route = navigation.findPath(player.position, point);
    routeTime = 5;
  }
  while (
    route.length &&
    Math.hypot(route[0].x - player.position.x, route[0].z - player.position.z) <
      7
  )
    route.shift();
  autosaveTime += dt;
  if (autosaveTime >= 5) {
    autosaveTime = 0;
    saveCampaign();
  }
  if (storyTime > 0) {
    storyTime -= dt;
    if (storyTime <= 0) $("story-toast").hidden = true;
  }
}
function cameraUpdate(dt, instant = false) {
  lookTarget.copy(player.position);
  lookTarget.y = player.vehicle ? 1.5 : 1.35;
  const distance = player.vehicle ? 9 : 5.4,
    shoulder = player.vehicle ? 0.2 : 0.65;
  cameraDesired.set(
    player.position.x +
      Math.sin(yaw) * Math.cos(pitch) * distance +
      Math.cos(yaw) * shoulder,
    lookTarget.y + Math.sin(pitch) * distance,
    player.position.z +
      Math.cos(yaw) * Math.cos(pitch) * distance -
      Math.sin(yaw) * shoulder,
  );
  cameraDesired.y = Math.max(0.65, cameraDesired.y);
  for (let t = 0.1; t <= 1; t += 0.05) {
    const x = THREE.MathUtils.lerp(lookTarget.x, cameraDesired.x, t),
      z = THREE.MathUtils.lerp(lookTarget.z, cameraDesired.z, t);
    if (
      hitBox(x, z, 0.15, THREE.MathUtils.lerp(lookTarget.y, cameraDesired.y, t))
    ) {
      cameraDesired.lerpVectors(
        lookTarget,
        cameraDesired,
        Math.max(0.12, t - 0.07),
      );
      cameraDesired.y = Math.max(1, cameraDesired.y);
      break;
    }
  }
  cameraTarget.copy(lookTarget);
  cameraTarget.x += Math.cos(yaw) * shoulder;
  cameraTarget.z -= Math.sin(yaw) * shoulder;
  if (instant) camera.position.copy(cameraDesired);
  else camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * 14));
  camera.lookAt(cameraTarget);
}
function drawMinimap() {
  const canvas = $("minimap"),
    ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width,
    range = 190,
    scale = size / range;
  const origin = {
    x: player.position.x - range / 2,
    z: player.position.z - range / 2,
  };
  const sx = (x) => (x - origin.x) * scale,
    sz = (z) => (z - origin.z) * scale;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#254237";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#687369";
  for (const road of world.roads || []) {
    const rw = road.width || 14,
      rd = road.depth || 14;
    ctx.fillRect(
      sx(road.x - rw / 2),
      sz(road.z - rd / 2),
      rw * scale,
      rd * scale,
    );
  }
  ctx.fillStyle = "#a2ac9b";
  for (const b of world.colliders) {
    if (
      b.maxX < origin.x ||
      b.minX > origin.x + range ||
      b.maxZ < origin.z ||
      b.minZ > origin.z + range
    )
      continue;
    ctx.fillRect(
      sx(b.minX),
      sz(b.minZ),
      (b.maxX - b.minX) * scale,
      (b.maxZ - b.minZ) * scale,
    );
  }
  if (route.length) {
    ctx.strokeStyle = "#f2c476";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx(player.position.x), sz(player.position.z));
    for (const p of route) ctx.lineTo(sx(p.x), sz(p.z));
    ctx.stroke();
  }
  const dot = (x, z, color, radius) => {
    const px = sx(x),
      py = sz(z);
    if (px < 0 || py < 0 || px > size || py > size) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  cars.forEach((car) => dot(car.position.x, car.position.z, "#94c6d1", 2.5));
  enemies
    .filter((e) => e.health > 0)
    .forEach((e) => dot(e.position.x, e.position.z, "#e77d5c", 2.2));
  for (const location of world.businessLocations || [])
    dot(location.x, location.z, "#b3c78e", 2.5);
  const point = questPoint();
  if (point) {
    const dx = point.x - player.position.x,
      dz = point.z - player.position.z,
      length = Math.max(1, Math.hypot(dx, dz));
    dot(
      player.position.x + dx * Math.min(1, (range * 0.43) / length),
      player.position.z + dz * Math.min(1, (range * 0.43) / length),
      "#ffd37f",
      4,
    );
  }
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#f5f2d8";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#d3ddc9";
  ctx.font = "9px Arial";
  ctx.fillText("N", size / 2 - 3, 11);
  const district = (world.districts || []).reduce(
    (best, item) =>
      !best ||
      Math.hypot(item.x - player.position.x, item.z - player.position.z) <
        Math.hypot(best.x - player.position.x, best.z - player.position.z)
        ? item
        : best,
    null,
  );
  $("location").textContent =
    district?.name || MAPS.find((map) => map.id === mapId).name;
}
function update(dt) {
  time += dt;
  cooldown = Math.max(0, cooldown - dt);
  healthFlash = Math.max(0, healthFlash - dt * 2);
  hitFlash = Math.max(0, hitFlash - dt * 5);
  if (reloadTime > 0) {
    reloadTime -= dt;
    if (reloadTime <= 0) {
      player.ammo = 12;
      notify("Cesto pronto.");
      updateHud();
    }
  }
  if (messageTime > 0) {
    messageTime -= dt;
    if (messageTime <= 0) $("notice").textContent = "";
  }
  if (fireHeld) shoot();
  updatePlayer(dt);
  life?.update(dt, player.position);
  for (const car of cars)
    car.actor.group.visible =
      car === player.vehicle || car.position.distanceTo(player.position) < 240;
  updateEnemies(dt);
  updateShots(dt);
  updateQuests(dt);
  cameraUpdate(dt);
  quietTime += dt;
  if (quietTime > 12) wanted = Math.max(0, wanted - dt * 0.1);
  patrolTime += dt;
  if (
    wanted >= 2 &&
    patrolTime > 16 &&
    enemies.filter((e) => e.health > 0).length < 9
  ) {
    patrolTime = 0;
    const p =
      world.enemySpawns[Math.floor(Math.random() * world.enemySpawns.length)];
    if (p) addEnemy(p, enemies.length);
  }
  if (audio.motorGain) {
    audio.motorGain.gain.setTargetAtTime(
      player.vehicle && !settings.muted ? 0.035 : 0,
      audio.context.currentTime,
      0.1,
    );
    audio.motor.frequency.setTargetAtTime(
      35 + Math.abs(player.vehicle?.speed || 0) * 5,
      audio.context.currentTime,
      0.1,
    );
  }
  $("damage").style.opacity = healthFlash * 0.55;
  $("crosshair").classList.toggle("hit", hitFlash > 0);
  hudTime -= dt;
  minimapTime -= dt;
  if (hudTime <= 0) {
    updateHud();
    updateMission();
    hudTime = 0.2;
  }
  if (minimapTime <= 0) {
    drawMinimap();
    minimapTime = 0.12;
  }
}
function resize() {
  renderDirty = true;
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio || 1,
      settings.quality === "high"
        ? 1.5
        : settings.quality === "low"
          ? 0.75
          : 1.0,
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  visuals.resize(innerWidth, innerHeight);
}
function look(dx, dy) {
  yaw -= dx * 0.0025 * settings.sensitivity;
  pitch = THREE.MathUtils.clamp(
    pitch + dy * 0.0025 * settings.sensitivity,
    -0.12,
    1.05,
  );
}
canvas.addEventListener("pointerdown", (event) => {
  if (state !== "playing") return;
  if (event.pointerType === "touch") {
    dragging = true;
    lookPointer = event.pointerId;
    touchPosition = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  } else if (event.button === 0) {
    fireHeld = true;
    firePointer = event.pointerId;
    shoot();
    lockMouse();
  }
});
canvas.addEventListener("pointermove", (event) => {
  if (
    event.pointerType === "touch" &&
    event.pointerId === lookPointer &&
    dragging &&
    state === "playing"
  ) {
    if (touchPosition)
      look(event.clientX - touchPosition.x, event.clientY - touchPosition.y);
    touchPosition = { x: event.clientX, y: event.clientY };
  }
});
function releasePointer(event) {
  if (event.pointerId === firePointer) {
    fireHeld = false;
    firePointer = null;
  }
  if (event.pointerId === lookPointer) {
    dragging = false;
    touchPosition = null;
    lookPointer = null;
  }
}
addEventListener("pointerup", releasePointer);
addEventListener("pointercancel", releasePointer);
canvas.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse")
    mousePosition = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerleave", () => {
  mousePosition = null;
});
document.addEventListener("mousemove", (event) => {
  if (state !== "playing" || event.sourceCapabilities?.firesTouchEvents) return;
  if (document.pointerLockElement === canvas)
    look(event.movementX, event.movementY);
  else if (event.target === canvas) {
    if (mousePosition)
      look(event.clientX - mousePosition.x, event.clientY - mousePosition.y);
    mousePosition = { x: event.clientX, y: event.clientY };
  } else mousePosition = null;
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas,
    was = ownedLock;
  ownedLock = locked;
  mousePosition = null;
  if (locked && state !== "playing") {
    document.exitPointerLock();
    return;
  }
  if (was && !locked && state === "playing") pause();
});
addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (state === "company" && key === "tab") {
    const controls = [
      ...$("company-panel").querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
      ),
    ].filter((item) => item.offsetParent !== null && item.tabIndex !== -1);
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
  if (event.target.closest?.("input,textarea,select") && key !== "escape")
    return;
  if (state === "company") {
    if (key === "escape" || key === "b") closeCompany();
    return;
  }
  if (key === "b" && state === "playing") {
    event.preventDefault();
    openCompany("overview");
    return;
  }
  if (
    state === "playing" &&
    [
      "w",
      "a",
      "s",
      "d",
      "shift",
      " ",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ].includes(key)
  ) {
    event.preventDefault();
    keys.add(key);
  }
  if (event.repeat) return;
  if (key === "escape" || key === "p" || key === "m") {
    if (state === "playing") pause();
    else if (state === "menu" && started && key !== "m") play();
  }
  if (key === "e") interact();
  if (key === "r") reload();
});
addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
addEventListener("blur", () => {
  keys.clear();
  fireHeld = false;
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
$("play").addEventListener("click", play);
$("pause").addEventListener("click", pause);
$("quality").value = settings.quality;
$("sensitivity").value = settings.sensitivity;
$("quality").addEventListener("change", () => {
  settings.quality = $("quality").value;
  visuals.setQuality(settings.quality);
  resize();
  save();
});
$("sensitivity").addEventListener("input", () => {
  settings.sensitivity = Number($("sensitivity").value);
  save();
});
function muteUI() {
  $("mute").textContent = settings.muted ? "SOM DESLIGADO" : "SOM LIGADO";
  $("mute").setAttribute("aria-pressed", String(settings.muted));
}
$("mute").addEventListener("click", () => {
  settings.muted = !settings.muted;
  if (audio.master) audio.master.gain.value = settings.muted ? 0 : 0.32;
  muteUI();
  save();
});
muteUI();
document.querySelectorAll("[data-map]").forEach((button) =>
  button.addEventListener("click", () => {
    resetMap(button.dataset.map);
    saveCampaign();
    $("play").textContent = "Entrar na cidade";
    $("menu-title").textContent = "Novos bairros. A mesma empresa.";
    notify("Novo mapa pronto.");
  }),
);
const touchKeys = { forward: "w", backward: "s", left: "a", right: "d" };
document.querySelectorAll("[data-control]").forEach((button) => {
  const release = () => keys.delete(touchKeys[button.dataset.control]);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    keys.add(touchKeys[button.dataset.control]);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
});
$("touch-fire").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  firePointer = event.pointerId;
  fireHeld = true;
  shoot();
});
$("touch-interact").addEventListener("click", interact);
$("touch-reload").addEventListener("click", reload);
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  saveCampaign();
  setState("menu");
  $("menu-description").textContent =
    "A ligação aos gráficos foi interrompida. Recarrega a página para retomar.";
  $("play").disabled = true;
});
companyPanel = createCompanyPanel({
  getCompany: () => company,
  setCompany: changeCompany,
  isFounded: () => founded,
  foundCompany(next) {
    founded = true;
    $("new-campaign").hidden = false;
    changeCompany(next);
    checkStory();
    saveCampaign();
  },
  trackContract,
  close: closeCompany,
  notify,
});
$("open-company").addEventListener("click", () => openCompany("overview"));
$("new-campaign").addEventListener("click", () => {
  if (
    !confirm(
      "Começar uma nova história substitui a campanha atual neste navegador. Podes exportar o progresso no painel Empresa. Queres recomeçar?",
    )
  )
    return;
  company = createCompany();
  companyView = getCompanyView(company);
  founded = false;
  activeContractId = null;
  lastStoryEvent = "";
  started = false;
  savedCampaign = null;
  resetMap("cidade");
  $("new-campaign").hidden = true;
  $("play").textContent = "Começar a minha história";
  saveCampaign();
  play();
});
$("export-save").addEventListener("click", () => {
  saveCampaign();
  const snapshot = {
    version: 3,
    savedAt: Date.now(),
    company,
    founded,
    mapId,
    position: { x: player.position.x, z: player.position.z },
    health: player.health,
    ammo: player.ammo,
    yaw,
    pitch,
    activeContractId,
    lastStoryEvent,
    vehicles: cars.map((c) => ({
      x: c.position.x,
      z: c.position.z,
      yaw: c.yaw,
    })),
    driving: player.vehicle ? cars.indexOf(player.vehicle) : -1,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `tomato-republic-dia-${company.day}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Progresso exportado para um ficheiro JSON.");
});
$("import-save")
  .closest("label")
  .addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("import-save").click();
    }
  });
$("import-save").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error("Ficheiro demasiado grande.");
    const data = JSON.parse(await file.text());
    if (
      data?.version !== 3 ||
      !data.company ||
      typeof data.company.name !== "string"
    )
      throw new Error("Este ficheiro não contém uma campanha válida.");
    data.company = normalizeCompany(data.company);
    data.founded = !!data.founded;
    replacingCampaign = true;
    localStorage.setItem("tomato-republic-campaign-v3", JSON.stringify(data));
    location.reload();
  } catch (error) {
    replacingCampaign = false;
    notify(`Não foi possível importar: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});
$("story-open").addEventListener("click", () => openCompany("story"));
addEventListener("pagehide", saveCampaign);
addEventListener("resize", resize);
resize();
resetMap(savedCampaign?.mapId || "cidade");
if (savedCampaign) {
  const point = savedCampaign.position;
  if (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    !hitBox(point.x, point.z, 0.4)
  )
    player.position.set(point.x, 0, point.z);
  for (let i = 0; i < cars.length; i++) {
    const saved = savedCampaign.vehicles?.[i];
    if (
      saved &&
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.z) &&
      !hitBox(saved.x, saved.z, 1.3)
    ) {
      cars[i].position.set(saved.x, 0, saved.z);
      cars[i].yaw = Number.isFinite(saved.yaw) ? saved.yaw : cars[i].yaw;
      cars[i].actor.group.rotation.y = cars[i].yaw;
    }
  }
  if (Number.isInteger(savedCampaign.driving) && cars[savedCampaign.driving]) {
    player.vehicle = cars[savedCampaign.driving];
    player.position.copy(player.vehicle.position);
    player.actor.group.visible = false;
  }
  player.health = THREE.MathUtils.clamp(
    Number(savedCampaign.health) || 100,
    1,
    100,
  );
  player.ammo = THREE.MathUtils.clamp(
    Number.isFinite(savedCampaign.ammo) ? savedCampaign.ammo : 12,
    0,
    12,
  );
  yaw = Number.isFinite(savedCampaign.yaw) ? savedCampaign.yaw : 0;
  pitch = THREE.MathUtils.clamp(
    Number.isFinite(savedCampaign.pitch) ? savedCampaign.pitch : 0.24,
    -0.12,
    1.05,
  );
  player.actor.group.position.copy(player.position);
  cameraUpdate(0.5, true);
  $("play").textContent = "Continuar a minha história";
}
initialized = true;
$("new-campaign").hidden = !founded;
setState("menu");
drawMinimap();
updateMission();
updateHud();
if (new URLSearchParams(location.search).has("diagnostics")) {
  Object.defineProperty(window, "tomatoDiagnostics", {
    value: Object.freeze({
      snapshot: () => ({
        state,
        mapId,
        player: {
          x: player.position.x,
          z: player.position.z,
          health: player.health,
          ammo: player.ammo,
          yaw: player.yaw,
          driving: !!player.vehicle,
        },
        camera: { yaw, pitch },
        vehicle: player.vehicle
          ? {
              x: player.vehicle.position.x,
              z: player.vehicle.position.z,
              yaw: player.vehicle.yaw,
              speed: player.vehicle.speed,
            }
          : null,
        enemies: enemies.map((e) => ({
          x: e.position.x,
          z: e.position.z,
          health: e.health,
        })),
        company: JSON.parse(JSON.stringify(company)),
        founded,
        activeContractId,
        locations: (world.businessLocations || []).map((item) => ({ ...item })),
        districts: (world.districts || []).map((item) => ({ ...item })),
        worldStats: { ...world.stats },
        life: {
          vehicles: life?.vehicles.length || 0,
          pedestrians: life?.pedestrians.length || 0,
          traffic: (life?.vehicles || []).slice(0, 4).map((car) => ({
            x: car.position.x,
            z: car.position.z,
            speed: car.speed,
          })),
        },
        kills,
        cash: company.cash,
        renderer: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        },
      }),
    }),
    writable: false,
  });
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (state === "playing" && !transitioning) {
    update(dt);
    world?.update?.(time, player.position);
  } else if (!renderDirty) return;
  if (!started) cameraUpdate(dt);
  visuals.update(dt, player.position, company.day);
  visuals.render();
  renderDirty = false;
}
requestAnimationFrame(frame);

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
import { advanceOperations, getOperationsView } from "./operations.js";
import { createDrivingCamera } from "./driving-camera.js";
import { createFleet } from "./fleet.js";
import { createVenues } from "./venues.js";
import { photoAssetsReady, getPhotoAssetState } from "./photo-assets.js";
import { humanAssetsReady, getHumanAssetState } from "./human-asset.js";
import {
  districtAssetsReady,
  getDistrictAssetState,
} from "./district-asset.js";
import {
  CAR_CATALOG,
  getOwnershipView,
  updateVehicleUsage,
  parkCar,
} from "./ownership.js";
import { createPassengerVehicle } from "./passenger-vehicles.js";
import { createEstates } from "./estates-world.js";
import { createOwnershipPanel } from "./ownership-panel.js";
import { createAtmosphere } from "./atmosphere.js";
import {
  createTrials,
  normalizeTrials,
  getTrialsView,
  startTrial,
  advanceTrial,
  cancelTrial,
} from "./driving-jobs.js";
import { createRaceCourse } from "./race-course.js";
import { createCityMapPanel } from "./city-map-panel.js";
import {
  detailedVehicleAssetsReady,
  getDetailedVehicleState,
} from "./vehicle-asset.js";
import {
  furnitureAssetsReady,
  getFurnitureAssetState,
} from "./furniture-asset.js";
import { createVehicleReflections } from "./vehicle-reflections.js";
import { cameraBoomPosition } from "./camera-obstruction.js";
import { advanceDriving } from "./driving-physics.js";
import {
  FIELD_JOBS,
  FIELD_JOBS_BOARD,
  createFieldJobs,
  normalizeFieldJobs,
  getFieldJobsView,
  startFieldJob,
  interactFieldJob,
  advanceFieldJobs,
  cancelFieldJob,
  canInteractFieldJob,
} from "./field-jobs.js";
import { createFieldJobsPanel } from "./field-jobs-panel.js";
import { createPhotoMode } from "./photo-mode.js";
import { createCityStreetLife } from "./city-streetlife.js";
import { restoreVehiclePlacements } from "./vehicle-restore.js";
import {
  MANUAL_WORK_STATIONS,
  MANUAL_WORK_INTERACTION_RADIUS,
  createManualWork,
  normalizeManualWork,
  getManualWorkView,
  startManualWork,
  interactManualWork,
  advanceManualWork,
  cancelManualWork,
  canInteractManualWork,
} from "./manual-work.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const settings = {
  quality: "high",
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
  settings.quality = "high";
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
  2200,
);
const visuals = createVisuals(renderer, scene, camera, settings.quality);
const vehicleReflections = createVehicleReflections(renderer, scene);
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
  placeTargetId = savedCampaign?.placeTargetId || null,
  companyPanel = null,
  life = null,
  streetLife = null,
  fleet = null,
  venues = null,
  estates = null,
  ownershipPanel = null,
  cityMapPanel = null,
  photoMode = null,
  fieldJobsPanel = null,
  fieldBoard = null,
  fieldBoardColliders = [],
  atmosphere = null,
  raceCourse = null;
let trials = normalizeTrials(savedCampaign?.trials);
let fieldJobs = normalizeFieldJobs(savedCampaign?.fieldJobs);
let manualWork = normalizeManualWork(savedCampaign?.manualWork);
let atmosphereState = savedCampaign?.atmosphere || null;
let vehicleUsageTime = 0;
const drivingCamera = createDrivingCamera();
let operationsTime = 0;
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
const carriedCrate = createPickup("crate");
carriedCrate.name = "player-carried-tomato-crate";
carriedCrate.scale.setScalar(0.82);
carriedCrate.position.set(0, 1.02, 0.43);
carriedCrate.visible = false;
player.actor.group.add(carriedCrate);
const workbenchCrate = createPickup("crate");
workbenchCrate.name = "manual-work-station-cargo";
workbenchCrate.scale.setScalar(0.82);
workbenchCrate.visible = false;
scene.add(workbenchCrate);
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
  photoMarkerVisibility = null,
  markerRing,
  markerBeam,
  markerTime = 0;
const moving = new THREE.Vector3(),
  lookTarget = new THREE.Vector3(),
  cameraTarget = new THREE.Vector3(),
  cameraDesired = new THREE.Vector3();
const audio = {
  context: null,
  master: null,
  motor: null,
  motorGain: null,
  footstep: null,
};

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
    audio.footstep = audio.context.createBuffer(
      1,
      Math.ceil(audio.context.sampleRate * 0.13),
      audio.context.sampleRate,
    );
    const samples = audio.footstep.getChannelData(0);
    let noise = 19423;
    for (let i = 0; i < samples.length; i++) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const elapsed = i / audio.context.sampleRate;
      samples[i] =
        ((noise / 4294967296) * 2 - 1) * Math.exp(-elapsed * 48) * 0.65 +
        Math.sin(elapsed * Math.PI * 2 * 88) * Math.exp(-elapsed * 55) * 0.35;
    }
    atmosphere?.attachAudio(audio.context, audio.master);
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
      : kind === "scale"
        ? [1046, 1318, 0.07]
        : kind === "hit"
          ? [150, 55, 0.12]
          : kind === "reload"
            ? [230, 320, 0.09]
            : [320, 90, 0.11];
  osc.type = ["reward", "scale"].includes(kind) ? "sine" : "triangle";
  osc.frequency.setValueAtTime(values[0], now);
  osc.frequency.exponentialRampToValueAtTime(values[1], now + values[2]);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + values[2]);
  osc.start();
  osc.stop(now + values[2]);
}
function footstep(running) {
  if (mapId !== "cidade" || !audio.context || !audio.footstep || settings.muted)
    return;
  const context = audio.context,
    source = context.createBufferSource(),
    filter = context.createBiquadFilter(),
    gain = context.createGain();
  const indoors = world.interiorZones?.some(
    (zone) =>
      player.position.x >= zone.minX &&
      player.position.x <= zone.maxX &&
      player.position.z >= zone.minZ &&
      player.position.z <= zone.maxZ,
  );
  source.buffer = audio.footstep;
  source.playbackRate.value = running ? 1.12 : 0.97;
  filter.type = "lowpass";
  filter.frequency.value = indoors ? 2300 : 1350;
  gain.gain.value = indoors ? 0.3 : 0.23;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  source.start();
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
  for (const car of [
    ...cars,
    ...(life?.vehicles || []),
    ...(fleet?.vehicles || []),
  ]) {
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
    const distanceX = Math.max(
        0,
        Math.abs(localX) - (car.bounds?.width || 2.3) / 2,
      ),
      distanceZ = Math.max(
        0,
        Math.abs(localZ) - (car.bounds?.length || 4.36) / 2,
      );
    if (distanceX * distanceX + distanceZ * distanceZ < radius * radius)
      return car;
  }
  return null;
}
function occupiedAt(entity, x, z, radius, staticOnly = false) {
  const car = typeof entity.speed === "number";
  const halfWidth = car ? (entity.bounds?.width || 2.35) / 2 : radius;
  const offset = car
    ? Math.max(0, (entity.bounds?.length || 4.5) / 2 - halfWidth)
    : 0;
  for (const along of offset ? [-offset, 0, offset] : [0]) {
    const px = x + Math.sin(entity.yaw || 0) * along;
    const pz = z + Math.cos(entity.yaw || 0) * along;
    if (
      hitBox(px, pz, halfWidth) ||
      (!staticOnly && carAt(px, pz, halfWidth, entity))
    )
      return true;
  }
  return false;
}
function moveTo(entity, dx, dz, radius) {
  let blocked = false;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let i = 0; i < count; i++) {
    if (
      !occupiedAt(
        entity,
        entity.position.x + dx / count,
        entity.position.z,
        radius,
      )
    )
      entity.position.x += dx / count;
    else blocked = true;
    if (
      !occupiedAt(
        entity,
        entity.position.x,
        entity.position.z + dz / count,
        radius,
      )
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
function placeCharacter(actor, point) {
  actor.group.position.copy(point);
  actor.group.position.y = world?.groundHeightAt?.(point.x, point.z) ?? 0;
}
function addEnemy(position, index = 0) {
  const actor = createCharacter({ enemy: true }),
    point = safePosition(position.x, position.z);
  placeCharacter(actor, point);
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
function manualContext() {
  return {
    day: company.day,
    founded,
    mapId,
    driving: !!player.vehicle,
    position: player.position,
    health: player.health,
    stock: company.stock,
    cash: company.cash,
    quality: company.quality,
  };
}
function applyManualResult(result, persist = true) {
  if (!result?.ok) {
    if (result?.handled && result.message) notify(result.message);
    return result;
  }
  manualWork = result.state;
  if (
    result.stockCost ||
    result.stockReturn ||
    result.cashCost ||
    result.reward
  ) {
    company = {
      ...company,
      stock: company.stock - result.stockCost + result.stockReturn,
      cash: company.cash - result.cashCost + result.reward,
      revenue: (company.revenue || 0) + result.reward,
      expenses: (company.expenses || 0) + result.cashCost,
      history: [
        ...company.history,
        {
          day: company.day,
          kind: result.reward ? "income" : "manual-work",
          title: result.reward
            ? "Lote preparado e expedido"
            : "Preparação manual",
          body: result.message,
        },
      ].slice(-100),
    };
    companyView = getCompanyView(company);
    if (result.reward) sound("reward");
  }
  if (result.events?.length) {
    if (result.events.some((event) => event.type === "process-ready"))
      sound("scale");
    route = [];
    routeTime = 0;
    if (result.message) notify(result.message, 7);
    updateMission();
    updateHud();
  }
  syncManualVisuals();
  if (persist || result.events?.length) saveCampaign();
  return result;
}
function syncManualVisuals() {
  const view = getManualWorkView(manualWork, manualContext());
  const active = mapId === "cidade" ? view.active : null;
  carriedCrate.visible = !!active?.carrying && !player.vehicle;
  player.actor.setCarryPose?.(carriedCrate.visible);
  workbenchCrate.visible =
    !!active &&
    !active.carrying &&
    ["weigh", "collect-weighed", "seal", "dispatch"].includes(active.phase);
  if (workbenchCrate.visible) {
    const onScale = ["weigh", "collect-weighed"].includes(active.phase);
    workbenchCrate.position.set(
      onScale ? 33 : 40,
      onScale ? 1.5175 : 1.04,
      onScale ? 61.63 : 75.05,
    );
  }
  world?.setManualWorkState?.(view);
  const panel = $("manual-task");
  if (!panel) return;
  panel.hidden = !active;
  if (!active) return;
  const text = (id, value) => {
    const element = $(id);
    if (element.textContent !== value) element.textContent = value;
  };
  text(
    "manual-count",
    `${active.completedBoxes} / ${active.totalBoxes} CAIXAS`,
  );
  text("manual-title", active.stepTitle);
  text(
    "manual-detail",
    active.working
      ? "Mantém-te junto à estação."
      : active.carrying
        ? "Transportas uma caixa · E para pousar na estação."
        : active.description,
  );
  $("manual-progress").value = active.working
    ? active.progress
    : active.overallProgress;
  $("manual-cancel").textContent = "Cancelar lote · X";
}
function fieldContext() {
  return {
    mapId,
    founded,
    position: player.position,
    driving: !!player.vehicle,
  };
}
function spawnFieldRivals(point) {
  if (enemies.some((enemy) => enemy.missionRival)) return;
  for (const [dx, dz] of [
    [-8, -12],
    [10, -9],
    [7, 12],
  ]) {
    addEnemy({ x: point.x + dx, z: point.z + dz }, enemies.length);
    enemies.at(-1).missionRival = true;
  }
}
function applyFieldJobResult(result, persist = true) {
  if (!result?.ok) {
    if (result?.message) notify(result.message);
    return result;
  }
  fieldJobs = result.state;
  if (result.reward > 0) {
    company = {
      ...company,
      cash: company.cash + result.reward,
      history: [
        ...company.history,
        {
          day: company.day,
          kind: "field-job",
          title: "Trabalho da quinta",
          body: result.message,
        },
      ].slice(-100),
    };
    companyView = getCompanyView(company);
    sound("reward");
  }
  for (const event of result.events || []) {
    if (event.type === "ambush") spawnFieldRivals(event.point);
    if (event.type === "completed" || event.type === "failed") {
      for (const enemy of enemies.filter((item) => item.missionRival))
        clearGroup(enemy.actor.group);
      enemies = enemies.filter((item) => !item.missionRival);
    }
  }
  if (result.events?.length) {
    route = [];
    routeTime = 0;
    if (result.message) notify(result.message, 7);
    updateMission();
    updateHud();
    fieldJobsPanel?.refresh();
  }
  if (persist || result.events?.length) saveCampaign();
  return result;
}
function createFieldBoard() {
  const group = new THREE.Group();
  group.name = "farm-job-board";
  const frame = new THREE.MeshStandardMaterial({
    color: 0x4b4235,
    roughness: 0.83,
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const x of [11.6, 13.0]) {
    const post = new THREE.Mesh(box, frame);
    post.position.set(x, 1.05, 81.4);
    post.scale.set(0.075, 2.1, 0.075);
    post.castShadow = true;
    group.add(post);
  }
  const board = new THREE.Mesh(box, frame);
  board.position.set(12.3, 1.65, 81.4);
  board.scale.set(1.8, 1.1, 0.14);
  board.castShadow = true;
  group.add(board);
  const label = document.createElement("canvas");
  label.width = 1024;
  label.height = 640;
  const ctx = label.getContext("2d");
  ctx.fillStyle = "#ece3c9";
  ctx.fillRect(0, 0, 1024, 640);
  ctx.fillStyle = "#2f4b37";
  ctx.fillRect(0, 0, 1024, 130);
  ctx.fillStyle = "#f5eed7";
  ctx.font = "bold 56px sans-serif";
  ctx.fillText("TRABALHOS DA QUINTA", 42, 85);
  ctx.fillStyle = "#374334";
  ctx.font = "35px sans-serif";
  [
    "01   A primeira ronda",
    "02   O lote desaparecido",
    "03   Selo de origem",
  ].forEach((text, i) => ctx.fillText(text, 54, 225 + i * 95));
  ctx.font = "32px sans-serif";
  ctx.fillText("E / J · Abrir o caderno", 54, 565);
  const texture = new THREE.CanvasTexture(label);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.0),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  paper.position.set(12.3, 1.65, 81.48);
  group.add(paper);
  const boardCollider = {
    minX: 11.4,
    maxX: 13.2,
    minZ: 81.28,
    maxZ: 81.52,
    minY: 0,
    maxY: 2.2,
    fieldBoardCollider: true,
  };
  fieldBoardColliders = [boardCollider];
  // The recovery job has a visible, solid cache bearing the old farm's stamp.
  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x9f805a,
    roughness: 0.89,
  });
  const strapMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d5441,
    roughness: 0.77,
  });
  for (const [x, z, count] of [
    [281.5, 401.5, 2],
    [282.8, 401.5, 1],
  ]) {
    for (let level = 0; level < count; level++) {
      const crate = new THREE.Mesh(box, crateMaterial);
      crate.position.set(x, 0.45 + level * 0.9, z);
      crate.scale.set(1.1, 0.9, 0.85);
      crate.castShadow = crate.receiveShadow = true;
      group.add(crate);
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(box, strapMaterial);
        strap.position.set(x + side * 0.38, 0.45 + level * 0.9, z - 0.432);
        strap.scale.set(0.055, 0.9, 0.02);
        group.add(strap);
      }
    }
    fieldBoardColliders.push({
      minX: x - 0.55,
      maxX: x + 0.55,
      minZ: z - 0.425,
      maxZ: z + 0.425,
      minY: 0,
      maxY: count * 0.9,
      fieldBoardCollider: true,
    });
  }
  const stamp = document.createElement("canvas");
  stamp.width = 512;
  stamp.height = 256;
  const stampContext = stamp.getContext("2d");
  stampContext.fillStyle = "#b5976d";
  stampContext.fillRect(0, 0, 512, 256);
  stampContext.fillStyle = "#3e4833";
  stampContext.textAlign = "center";
  stampContext.font = "bold 47px sans-serif";
  stampContext.fillText("QUINTA ANSELMO", 256, 100);
  stampContext.font = "31px sans-serif";
  stampContext.fillText("SANTA TOMATA · LOTE 01", 256, 165);
  const stampTexture = new THREE.CanvasTexture(stamp);
  stampTexture.colorSpace = THREE.SRGBColorSpace;
  const stampMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.4),
    new THREE.MeshStandardMaterial({ map: stampTexture, roughness: 0.95 }),
  );
  stampMesh.position.set(281.5, 0.55, 401.066);
  stampMesh.rotation.y = Math.PI;
  group.add(stampMesh);
  world.colliders.push(...fieldBoardColliders);
  world.interactionPoints.push({ ...FIELD_JOBS_BOARD });
  scene.add(group);
  fieldBoard = group;
}
function currentContract() {
  return (
    company.contracts?.find(
      (contract) =>
        contract.id === activeContractId &&
        !contract.fleetVehicleId &&
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
  const manual = getManualWorkView(manualWork).active;
  if (manual && mapId === "cidade") return manual.point;
  const field = getFieldJobsView(fieldJobs).active;
  if (field && mapId === "cidade") return field.point;
  const trial =
    trials.active && mapId === "cidade" ? getTrialsView(trials).active : null;
  if (trial?.nextCheckpoint) return trial.nextCheckpoint;
  const contract = currentContract();
  if (contract)
    return mapId === "cidade" ? businessLocation(contract.destination) : null;
  return (
    (placeTargetId &&
      (world.interactionPoints?.find((point) => point.id === placeTargetId) ||
        businessLocation(placeTargetId))) ||
    businessLocation("sede")
  );
}
function flushVehicleUsage(park = false) {
  for (const car of cars) {
    if (!car.ownershipId) continue;
    if (car.pendingDistance || car.pendingDamage) {
      const result = updateVehicleUsage(company, car.ownershipId, {
        distance: car.pendingDistance || 0,
        collision: car.pendingDamage || 0,
      });
      if (result.ok) company = result.state;
      car.pendingDistance = car.pendingDamage = 0;
    }
    if (park) {
      const result = parkCar(company, car.ownershipId, {
        mapId,
        x: car.position.x,
        z: car.position.z,
        yaw: car.yaw,
      });
      if (result.ok) company = result.state;
    }
    const record = company.ownership.vehicles.find(
      (item) => item.id === car.ownershipId,
    );
    car.actor.setCondition?.(record?.condition ?? 100);
    const sky = atmosphere?.getState();
    car.actor.setLights?.(!!sky && (sky.daylight < 0.55 || sky.rain > 0.3));
  }
}
function campaignSnapshot() {
  flushVehicleUsage(true);
  return {
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
    placeTargetId,
    lastStoryEvent,
    atmosphere: atmosphere?.getState() || atmosphereState,
    trials,
    fieldJobs,
    manualWork,
    vehicles: cars.map((car) => ({
      x: car.position.x,
      z: car.position.z,
      yaw: car.yaw,
      ownershipId: car.ownershipId || null,
      worldCarId: car.worldCarId || null,
      modelId: car.modelId || "pickup",
    })),
    driving: player.vehicle ? cars.indexOf(player.vehicle) : -1,
    drivingOwnershipId: player.vehicle?.ownershipId || null,
    drivingWorldCarId: player.vehicle?.worldCarId || null,
  };
}
function saveCampaign() {
  if (!initialized || replacingCampaign) return;
  try {
    localStorage.setItem(
      "tomato-republic-campaign-v3",
      JSON.stringify(campaignSnapshot()),
    );
    if ($("save-state"))
      $("save-state").textContent = "Progresso guardado neste navegador";
  } catch {
    if ($("save-state"))
      $("save-state").textContent =
        "Este navegador não permitiu guardar o progresso";
  }
}
function updateWorldLayout() {
  if (!world) return false;
  // The base world mutates this same collider array when company buildings change.
  for (let i = world.colliders.length - 1; i >= 0; i--)
    if (
      world.colliders[i].estateCollider ||
      world.colliders[i].fieldBoardCollider ||
      world.colliders[i].cityStreetCollider
    )
      world.colliders.splice(i, 1);
  const changed = world.updateCompany?.(company);
  const estateChanged = estates?.updateOwnership(company);
  world.colliders.push(...fieldBoardColliders);
  for (const box of streetLife?.colliders || []) world.colliders.push(box);
  for (const box of estates?.colliders || []) {
    box.estateCollider = true;
    world.colliders.push(box);
  }
  return changed || estateChanged;
}
function parkingClear(car, point, staticOnly = false) {
  const previousYaw = car.yaw;
  car.yaw = Number.isFinite(point.yaw) ? point.yaw : previousYaw;
  const blocked = occupiedAt(car, point.x, point.z, 1.4, staticOnly);
  car.yaw = previousYaw;
  return !blocked;
}
function freeGarageBay(car = null) {
  const shape = car || {
    speed: 0,
    yaw: Math.PI,
    bounds: { width: 2.5, length: 5.6 },
  };
  const free = (bay) =>
    parkingClear(shape, bay) && !carAt(bay.x, bay.z, 2.8, car);
  for (const bay of estates?.vehicleSpawns || world.vehicleSpawns || [])
    if (free(bay)) return bay;
  // Keep the garage usable when a visitor has parked in a marked bay.
  for (let z = 174; z <= 186; z += 6)
    for (let x = 114; x <= 174; x += 6) {
      const bay = { x, z, yaw: Math.PI };
      if (free(bay)) return bay;
    }
  return null;
}
function syncOwnedCars() {
  for (const record of company.ownership.vehicles) {
    if (cars.some((car) => car.ownershipId === record.id)) continue;
    if (record.parked && record.parked.mapId !== mapId) continue;
    if (!record.parked && mapId !== "cidade") continue;
    const model = CAR_CATALOG.find((item) => item.id === record.modelId);
    const actor = createPassengerVehicle(
      record.modelId,
      record.color ?? model.color,
    );
    const car = {
      actor,
      position: actor.group.position,
      ownershipId: record.id,
      modelId: record.modelId,
      bounds: actor.bounds,
      yaw: 0,
      speed: 0,
      steering: 0,
      pendingDistance: 0,
      pendingDamage: 0,
    };
    const parked = record.parked;
    const spawn =
      parked && parkingClear(car, parked) ? parked : freeGarageBay(car);
    if (!spawn) {
      clearGroup(actor.group);
      continue;
    }
    car.position.set(spawn.x, 0, spawn.z);
    car.yaw = spawn.yaw || 0;
    actor.group.rotation.y = car.yaw;
    actor.setCondition?.(record.condition);
    scene.add(actor.group);
    cars.push(car);
  }
}
function equipOwnedCar(id) {
  flushVehicleUsage(true);
  // Picking up at the physical garage also retrieves cars left on another map.
  const record = company.ownership.vehicles.find((item) => item.id === id);
  if (!record) return;
  if (record.fuel <= 0 || record.condition <= 0) {
    notify("Abastece ou repara esta viatura na oficina antes de sair.");
    return;
  }
  let car = cars.find((item) => item.ownershipId === id);
  const bay = freeGarageBay(car);
  if (!bay) {
    notify("O parque está cheio. Liberta uma baía e volta à oficina.");
    return;
  }
  const parked = parkCar(company, id, { mapId, ...bay });
  if (parked.ok) company = parked.state;
  syncOwnedCars();
  car = cars.find((item) => item.ownershipId === id);
  if (!car) return;
  if (player.vehicle) player.vehicle.speed = 0;
  car.position.set(bay.x, 0, bay.z);
  car.yaw = bay.yaw || 0;
  car.actor.group.rotation.y = car.yaw;
  car.speed = car.steering = car.lateralSpeed = 0;
  player.vehicle = car;
  player.position.copy(car.position);
  player.actor.group.visible = false;
  yaw = car.yaw - Math.PI;
  drivingCamera.reset(yaw);
  cameraUpdate(0.5, true);
  notify("A tua viatura está pronta. W acelera · A/D vira · E sai.", 6);
  saveCampaign();
  updateHud();
}
function nearestOwnershipPoint() {
  const board = raceCourse?.nearest(player.position);
  if (board) return board;
  let closest = null,
    distance = Infinity;
  for (const point of world.interactionPoints || []) {
    if (!["dealership", "garage", "property", "rest"].includes(point.type))
      continue;
    if (player.vehicle && point.type !== "garage") continue;
    const d = Math.hypot(
      player.position.x - point.x,
      player.position.z - point.z,
    );
    if (d <= (player.vehicle ? 7 : 3.5) && d < distance) {
      closest = point;
      distance = d;
    }
  }
  return closest;
}
function beginTrial(id) {
  if (manualWork.active)
    return {
      ok: false,
      message: "Termina ou cancela o lote manual com X antes do percurso.",
    };
  if (fieldJobs.active)
    return {
      ok: false,
      message:
        "Termina ou cancela o trabalho da quinta antes de iniciar um percurso.",
    };
  const result = startTrial(trials, id, {
    position: player.position,
    driving: !!player.vehicle,
    mapId,
  });
  if (result.ok) {
    trials = result.state;
    activeContractId = placeTargetId = null;
    route = [];
    notify(result.message, 6);
    saveCampaign();
    updateMission();
  }
  return result;
}
function abandonTrial() {
  const result = cancelTrial(trials);
  trials = result.state;
  notify(result.message);
  saveCampaign();
  updateMission();
}
function changeCompany(next) {
  renderDirty = true;
  company = normalizeCompany(next);
  companyView = getCompanyView(company);
  if (manualWork.active && manualWork.active.day !== company.day)
    applyManualResult(
      advanceManualWork(manualWork, { ...manualContext(), dt: 0.001 }),
      false,
    );
  if (activeContractId && !currentContract()) {
    activeContractId = null;
    route = [];
  }
  if (updateWorldLayout())
    navigation = createNavigation(
      world.colliders,
      world.bounds,
      world.navigationCellSize || 3,
    );
  syncOwnedCars();
  fleet?.sync(company);
  venues?.refresh();
  ownershipPanel?.refresh();
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
  if (manualWork.active) {
    notify(
      "Termina ou cancela o lote manual com X antes de seguir um contrato.",
    );
    return;
  }
  if (fieldJobs.active) {
    notify(
      "Termina ou cancela o trabalho da quinta em J antes de seguir um contrato.",
    );
    return;
  }
  const contract = company.contracts?.find(
    (item) =>
      item.id === id &&
      !item.fleetVehicleId &&
      ["accepted", "active", "reserved"].includes(item.status),
  );
  if (!contract) return;
  if (trials.active) trials = cancelTrial(trials).state;
  placeTargetId = null;
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
function navigateToPlace(id) {
  if (mapId !== "cidade") resetMap("cidade");
  const place =
    world.interactionPoints?.find((point) => point.id === id) ||
    businessLocation(id);
  if (!place) return;
  if (trials.active) trials = cancelTrial(trials).state;
  activeContractId = null;
  placeTargetId = id;
  route = navigation.findPath(player.position, place);
  routeTime = 4;
  if (state === "company") closeCompany();
  else if (state === "venue") venues?.close();
  else if (state === "ownership") ownershipPanel?.close();
  else if (state === "map") cityMapPanel?.close();
  notify(
    `Segue a rota até ${place.label || place.name}. Aproxima-te e carrega em E.`,
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
function resetMap(id, { preserveActivities = false } = {}) {
  photoMode?.close({ notify: false });
  vehicleReflections.reset();
  if (world) flushVehicleUsage(true);
  if (atmosphere) atmosphereState = atmosphere.getState();
  if (initialized && trials.active && !preserveActivities)
    trials = cancelTrial(trials).state;
  if (initialized && manualWork.active && id !== "cidade")
    applyManualResult(cancelManualWork(manualWork));
  if (initialized && fieldJobs.active && id !== "cidade")
    applyFieldJobResult(cancelFieldJob(fieldJobs));
  transitioning = true;
  renderDirty = true;
  if (!preserveActivities) {
    for (const shot of shots) shot.mesh.removeFromParent();
    shots = [];
    for (const item of pickups) clearGroup(item.mesh);
    pickups = [];
    for (const p of particles) p.mesh.removeFromParent();
    particles = [];
  }
  for (const enemy of enemies) clearGroup(enemy.actor.group);
  enemies = [];
  for (const car of cars) clearGroup(car.actor.group);
  cars = [];
  if (marker) clearGroup(marker);
  if (fieldBoard) {
    clearGroup(fieldBoard);
    fieldBoard = null;
  }
  fieldBoardColliders = [];
  life?.dispose();
  life = null;
  streetLife?.dispose();
  streetLife = null;
  fleet?.dispose();
  fleet = null;
  venues?.dispose();
  venues = null;
  raceCourse?.dispose();
  raceCourse = null;
  atmosphere?.dispose();
  atmosphere = null;
  estates?.dispose();
  estates = null;
  world?.dispose();
  mapId = MAPS.some((map) => map.id === id) ? id : "cidade";
  world = buildWorld(scene, mapId, settings.quality);
  world.updateCompany?.(company);
  if (mapId === "cidade") {
    for (const station of Object.values(MANUAL_WORK_STATIONS)) {
      const point = world.interactionPoints.find(
        (item) => item.id === station.id,
      );
      if (point) Object.assign(point, { ...station });
      else world.interactionPoints.push({ ...station });
    }
  }
  if (mapId === "cidade") {
    estates = createEstates(scene, world, settings.quality);
    world.interactionPoints.push(...estates.interactionPoints);
    world.interiorZones.push(...estates.interiorZones);
    updateWorldLayout();
    createFieldBoard();
    raceCourse = createRaceCourse(scene, world, () => trials);
    world.interactionPoints.push(...raceCourse.startPoints);
  }
  if (mapId === "cidade") {
    streetLife = createCityStreetLife(scene, world, settings.quality);
    for (const collider of streetLife.colliders)
      collider.cityStreetCollider = true;
    world.colliders.push(...streetLife.colliders);
    world.interactionPoints.push(...streetLife.interactionPoints);
  }
  atmosphere = createAtmosphere(scene, world, visuals, {
    savedState: atmosphereState,
    quality: settings.quality,
  });
  if (audio.context) atmosphere.attachAudio(audio.context, audio.master);
  atmosphere.setActive(state === "playing");
  if ($("weather")) $("weather").value = atmosphere.getState().weatherMode;
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
  placeCharacter(player.actor, player.position);
  player.actor.group.rotation.y = player.yaw;
  yaw = 0;
  pitch = 0.24;
  drivingCamera.reset(yaw);
  wanted = 0;
  quietTime = 0;
  patrolTime = 0;
  kills = 0;
  reloadTime = 0;
  cooldown = 0;
  const colors = [0xcf5538, 0x8baf9f, 0xe0c38a, 0x384e61, 0xc5d0bb];
  world.vehicleSpawns.slice(0, 5).forEach((spawn, index) => {
    const modelId = index === 0 ? "sport" : "pickup";
    const actor = createPassengerVehicle(
      modelId,
      colors[index % colors.length],
    );
    actor.group.position.copy(safePosition(spawn.x, spawn.z));
    actor.group.rotation.y = spawn.yaw || 0;
    scene.add(actor.group);
    cars.push({
      actor,
      position: actor.group.position,
      modelId,
      bounds: actor.bounds,
      yaw: spawn.yaw || 0,
      speed: 0,
      steering: 0,
    });
  });
  for (const spawn of streetLife?.parkedVehicleSpawns || []) {
    const actor = createPassengerVehicle(spawn.modelId, spawn.colour);
    actor.group.position.set(spawn.x, 0, spawn.z);
    actor.group.rotation.y = spawn.yaw || 0;
    actor.group.name = `street-car-${spawn.id}`;
    scene.add(actor.group);
    cars.push({
      actor,
      position: actor.group.position,
      modelId: spawn.modelId,
      worldCarId: spawn.id,
      bounds: actor.bounds,
      yaw: spawn.yaw || 0,
      speed: 0,
      steering: 0,
    });
  }
  syncOwnedCars();
  world.enemySpawns
    .slice(0, 6)
    .forEach((spawn, index) => addEnemy(spawn, index));
  if (mapId === "cidade" && fieldJobs.active?.ambushTriggered) {
    const ambush = FIELD_JOBS.find(
      (job) => job.id === fieldJobs.active.jobId,
    )?.steps.find((step) => step.event === "ambush");
    if (ambush) spawnFieldRivals(ambush.point);
  }
  life = createCityLife(scene, world, settings.quality);
  if (mapId === "cidade") {
    fleet = createFleet(scene, world, settings.quality);
    fleet.sync(company);
  }
  venues = createVenues({
    scene,
    world,
    getCompany: () => company,
    setCompany: changeCompany,
    notify,
    isFounded: () => founded,
    trackContract,
    onStateChange(open) {
      if (transitioning) return;
      if (open) {
        setState("venue");
        $("story-toast").hidden = true;
      } else if (state === "venue") {
        setState("playing");
        last = performance.now();
        saveCampaign();
      }
    },
  });
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
  syncManualVisuals();
  transitioning = false;
}
function updateMission() {
  const manual = getManualWorkView(manualWork).active;
  if (manual && mapId === "cidade") {
    $("mission-title").textContent = manual.title;
    $("mission-description").textContent = manual.description;
    $("mission-progress").textContent =
      `${manual.completedBoxes}/${manual.totalBoxes} CAIXAS · ${manual.reward} € NO FIM · X CANCELAR`;
    return;
  }
  const field = getFieldJobsView(fieldJobs).active;
  if (field && mapId === "cidade") {
    $("mission-title").textContent = field.title;
    $("mission-description").textContent = field.description;
    $("mission-progress").textContent =
      `${Math.ceil(field.remaining)} s · ETAPA ${field.stepIndex + 1}/${field.stepCount} · J TRABALHOS`;
    return;
  }
  const trial =
    trials.active && mapId === "cidade" ? getTrialsView(trials).active : null;
  if (trial) {
    $("mission-title").textContent = trial.title;
    $("mission-description").textContent =
      `Passa pelo arco dourado: ${trial.nextCheckpoint.label}. Segue os pontos pela ordem indicada.`;
    $("mission-progress").textContent =
      `${Math.ceil(trial.remaining)} s · PONTO ${trial.checkpointIndex + 1}/${trial.checkpointCount} · G PERCURSOS`;
    return;
  }
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
    : placeTargetId && point
      ? point.label || point.name
      : companyView.event?.title || companyView.title;
  $("mission-description").textContent = remoteContract
    ? "Esta entrega é feita em Santa Tomata. Abre B Empresa → Contratos e escolhe «Seguir entrega no mapa» para regressar à cidade e retomar a rota."
    : contract
      ? `Leva ${contract.quantity} caixas a ${point?.name || contract.destination}. Recebes ${Math.round(contract.payment)} € após a entrega.`
      : placeTargetId && point
        ? "Vai ao local, sai do veículo e aproxima-te para interagir com E. A loja, a estufa e os clientes fazem parte da tua empresa."
        : "Explora a loja e a estufa junto à sede. Fala com os clientes, negoceia encomendas e investe na tua frota. B abre a empresa e marca os destinos.";
  $("mission-progress").textContent = remoteContract
    ? `RETOMAR EM SANTA TOMATA · DIA ${contract.deadlineDay}`
    : contract
      ? `ENTREGAR · ${distance} m · DIA ${contract.deadlineDay}`
      : placeTargetId && point
        ? `VISITAR · ${distance} m · E INTERAGIR`
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
  // A navigation marker can belong to a driving trial; cargo always requires its real destination.
  const point =
    contract && mapId === "cidade"
      ? businessLocation(contract.destination)
      : questPoint() || (remoteContract ? businessLocation("sede") : null);
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
  if (manualWork.active && canInteractManualWork(manualWork, manualContext())) {
    const result = interactManualWork(manualWork, manualContext());
    applyManualResult(result);
    return;
  }
  const boxes = MANUAL_WORK_STATIONS.boxes;
  if (
    mapId === "cidade" &&
    !player.vehicle &&
    !manualWork.active &&
    Math.hypot(player.position.x - boxes.x, player.position.z - boxes.z) <= 1.6
  ) {
    if (fieldJobs.active) {
      notify(
        "Termina ou cancela o trabalho da quinta em J antes de preparar um lote.",
      );
      return;
    }
    const result = startManualWork(manualWork, manualContext());
    if (result.ok) {
      activeContractId = placeTargetId = null;
      if (trials.active) trials = cancelTrial(trials).state;
    } else if (result.message) notify(result.message);
    applyManualResult(result);
    return;
  }
  if (getManualWorkView(manualWork).active?.carrying) {
    notify(
      "Transportas uma caixa. Leva-a à estação indicada ou cancela o lote com X.",
    );
    return;
  }
  if (canInteractFieldJob(fieldJobs, fieldContext())) {
    applyFieldJobResult(interactFieldJob(fieldJobs, fieldContext()));
    return;
  }
  if (
    !fieldJobs.active &&
    mapId === "cidade" &&
    !player.vehicle &&
    Math.hypot(
      player.position.x - FIELD_JOBS_BOARD.x,
      player.position.z - FIELD_JOBS_BOARD.z,
    ) <= 3
  ) {
    fieldJobsPanel?.open();
    return;
  }
  if (currentContract() && mapId === "cidade" && missionAction()) return;
  const ownershipPoint = nearestOwnershipPoint();
  if (ownershipPoint && ownershipPanel?.interact(ownershipPoint)) return;
  if (!player.vehicle && venues?.interact()) return;
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
    car.lateralSpeed = 0;
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
      car.lateralSpeed = 0;
      player.actor.group.visible = false;
      player.position.copy(car.position);
      yaw = car.yaw - Math.PI;
      drivingCamera.reset(yaw);
      notify("W acelera · S trava/recua · A/D vira · Espaço trava · E sai.", 5);
    }
  }
  if (!player.vehicle) placeCharacter(player.actor, player.position);
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
  if (state === "photo" && next !== "photo") {
    if (marker && photoMarkerVisibility !== null)
      marker.visible = photoMarkerVisibility;
    photoMarkerVisibility = null;
  } else if (next === "photo" && state !== "photo") {
    photoMarkerVisibility = marker ? marker.visible : null;
    if (marker) marker.visible = false;
  }
  state = next;
  renderDirty = true;
  document.body.dataset.state = next;
  $("hud").inert = [
    "company",
    "venue",
    "ownership",
    "map",
    "photo",
    "jobs",
  ].includes(next);
  atmosphere?.setActive(next === "playing");
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
  if (next !== "venue" && venues?.isOpen()) venues.close();
  if (next !== "ownership" && ownershipPanel?.isOpen()) ownershipPanel.close();
  if (next !== "map" && cityMapPanel?.isOpen()) cityMapPanel.close();
  if (next !== "jobs" && fieldJobsPanel?.isOpen()) fieldJobsPanel.close();
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
  if (state === "photo") photoMode?.close();
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
  if (getManualWorkView(manualWork).active?.carrying) return;
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
    .add(
      new THREE.Vector3(
        0,
        player.vehicle ? 2 : 1.45 + player.actor.group.position.y,
        0,
      ),
    );
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
    if (manualWork.active)
      applyManualResult(
        advanceManualWork(manualWork, {
          ...manualContext(),
          dt: 0.001,
          health: 0,
        }),
      );
    if (fieldJobs.active)
      applyFieldJobResult(
        advanceFieldJobs(fieldJobs, {
          ...fieldContext(),
          dt: 0.001,
          health: 0,
        }),
      );
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
    if (player.vehicle) player.vehicle.speed = player.vehicle.lateralSpeed = 0;
    player.vehicle = null;
    const home =
      mapId === "cidade" &&
      world.interactionPoints.find(
        (point) =>
          point.type === "rest" &&
          point.propertyId === company.ownership.homeId,
      );
    const respawn = home?.respawn || world.spawn;
    player.position.copy(safePosition(respawn.x, respawn.z));
    if (trials.active) trials = cancelTrial(trials).state;
    player.health = 100;
    player.ammo = 12;
    player.actor.group.visible = true;
    placeCharacter(player.actor, player.position);
    wanted = 0;
    reloadTime = 0;
    shots.forEach((s) => s.mesh.removeFromParent());
    shots = [];
    enemies.forEach((e) => (e.attack = 4));
    yaw = 0;
    pitch = 0.24;
    cameraUpdate(0.5, true);
    notify(
      `Recuperaste ${home ? "na tua casa" : "na cooperativa"}. Assistência: ${fee} €.`,
      6,
    );
    updateHud();
    saveCampaign();
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
  if (player.vehicle) {
    $("speed").textContent = Math.round(Math.abs(player.vehicle.speed) * 3.6);
    if ($("vehicle-gear")) {
      const gear = player.vehicle.gear || 0;
      $("vehicle-gear").textContent =
        gear < 0 ? "R" : gear === 0 ? "N" : `${gear}ª`;
    }
    const record = company.ownership.vehicles.find(
      (item) => item.id === player.vehicle.ownershipId,
    );
    if ($("vehicle-condition"))
      $("vehicle-condition").textContent = record
        ? `${record.fuel.toFixed(1)} L · estado ${Math.round(record.condition)}%`
        : "Viatura emprestada";
  }
  if ($("world-clock") && atmosphere) {
    const sky = atmosphere.getState();
    $("world-clock").textContent = `${sky.clock} · ${sky.label}`;
  }
}
const DRIVER_SEATS = {
  sport: { x: 0, y: -0.53, z: 0.15, scale: 0.9 },
  compact: { x: -0.4, y: 0.08, z: -0.05, scale: 0.78 },
  pickup: { x: -0.42, y: 0.53, z: 0.29, scale: 0.72 },
  suv: { x: -0.46, y: 0.005, z: 0.16, scale: 1 },
  van: { x: -0.46, y: 0.025, z: 0.75, scale: 1 },
};
function updateVehicleDrivers() {
  for (const car of cars) {
    const active = car === player.vehicle;
    if (active && !car.driver) {
      const actor = createCharacter();
      const seat = DRIVER_SEATS[car.modelId] || DRIVER_SEATS.pickup;
      actor.group.position.set(seat.x, seat.y, seat.z);
      actor.group.scale.setScalar(seat.scale);
      actor.group.name = "player-seated-driver";
      car.actor.group.add(actor.group);
      car.driver = actor;
    }
    if (car.driver) {
      const supported = typeof car.driver.setDrivingPose === "function";
      car.driver.group.visible = active && supported;
      if (active && supported) car.driver.setDrivingPose(car.steering || 0);
    }
  }
}
function updatePlayer(dt) {
  if (player.vehicle) {
    const car = player.vehicle,
      record = company.ownership.vehicles.find(
        (item) => item.id === car.ownershipId,
      ),
      model = CAR_CATALOG.find(
        (item) => item.id === (record?.modelId || car.modelId),
      ),
      canDrive = !record || (record.fuel > 0 && record.condition > 0),
      gas =
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const turn =
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0) -
      (keys.has("d") || keys.has("arrowright") ? 1 : 0);
    const conditionFactor = record ? 0.55 + (0.45 * record.condition) / 100 : 1;
    const previousYaw = car.yaw;
    const motion = advanceDriving(
      car,
      {
        throttle: gas,
        turn,
        brake: keys.has(" "),
        canDrive,
        wetness: atmosphere?.getState().rain || 0,
      },
      {
        ...model,
        acceleration: (model?.acceleration || 11) * conditionFactor,
        topSpeed: (model?.topSpeed || 23) * conditionFactor,
      },
      dt,
    );
    Object.assign(car, {
      speed: motion.speed,
      steering: motion.steering,
      yaw: motion.yaw,
      lateralSpeed: motion.lateralSpeed,
      gear: motion.gear,
      rpm: motion.rpm,
      braking: motion.braking,
    });
    if (occupiedAt(car, car.position.x, car.position.z, 1.2))
      car.yaw = previousYaw;
    const headingDelta = car.yaw - motion.yaw;
    const previousX = car.position.x,
      previousZ = car.position.z;
    const blocked = moveTo(
      car,
      motion.dx * Math.cos(headingDelta) + motion.dz * Math.sin(headingDelta),
      motion.dz * Math.cos(headingDelta) - motion.dx * Math.sin(headingDelta),
      Math.max(1.2, (car.bounds?.width || 2.3) / 2),
    );
    if (car.ownershipId)
      car.pendingDistance += Math.hypot(
        car.position.x - previousX,
        car.position.z - previousZ,
      );
    if (blocked) {
      if (car.ownershipId && Math.abs(car.speed) > 3)
        car.pendingDamage += Math.min(12, Math.abs(car.speed) * 0.4);
      if (Math.abs(car.speed) > 8 && damage(4)) return;
      car.speed *= -0.18;
      car.lateralSpeed = 0;
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
      speed = getManualWorkView(manualWork).active?.carrying
        ? 2.8
        : running
          ? 7
          : 4;
    const previousX = player.position.x,
      previousZ = player.position.z;
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
    placeCharacter(player.actor, player.position);
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
        if (
          Math.hypot(
            player.position.x - previousX,
            player.position.z - previousZ,
          ) > 0.015
        )
          footstep(running);
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
    const alerted =
      enemy.missionRival ||
      wanted > 0.7 ||
      (mapId !== "cidade" && distance < 14);
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
    placeCharacter(enemy.actor, enemy.position);
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
  const nearby = !player.vehicle && venues?.nearest();
  if (
    nearby &&
    !(
      contract &&
      point &&
      Math.hypot(player.position.x - point.x, player.position.z - point.z) <= 6
    )
  )
    prompt = `E · ${nearby.label}`;
  const service = nearestOwnershipPoint();
  if (
    service &&
    !(
      contract &&
      point &&
      Math.hypot(player.position.x - point.x, player.position.z - point.z) <= 6
    )
  )
    prompt = `E · ${service.label}`;
  const field = getFieldJobsView(fieldJobs).active;
  if (
    mapId === "cidade" &&
    field &&
    Math.hypot(
      player.position.x - field.point.x,
      player.position.z - field.point.z,
    ) <= 5
  ) {
    prompt =
      field.requiresVehicle && !player.vehicle
        ? "Entra numa viatura para entregar o lote"
        : field.requiresOnFoot && player.vehicle
          ? "E · Sair da viatura para continuar o trabalho"
          : `E · ${field.stepTitle}`;
  } else if (
    mapId === "cidade" &&
    !field &&
    !player.vehicle &&
    Math.hypot(
      player.position.x - FIELD_JOBS_BOARD.x,
      player.position.z - FIELD_JOBS_BOARD.z,
    ) <= 4
  )
    prompt = "E · Trabalhos da quinta · J consultar";
  const manual = getManualWorkView(manualWork, manualContext());
  if (
    mapId === "cidade" &&
    manual.active &&
    Math.hypot(
      player.position.x - manual.active.point.x,
      player.position.z - manual.active.point.z,
    ) <= 3
  ) {
    prompt = player.vehicle
      ? "E · Sair da viatura para trabalhar"
      : manual.active.working
        ? "A processar · mantém-te junto à estação"
        : Math.hypot(
              player.position.x - manual.active.point.x,
              player.position.z - manual.active.point.z,
            ) <= MANUAL_WORK_INTERACTION_RADIUS
          ? `E · ${manual.active.stepTitle}`
          : `Aproxima-te · ${manual.active.stepTitle}`;
  } else if (
    mapId === "cidade" &&
    !manual.active &&
    !player.vehicle &&
    Math.hypot(
      player.position.x - MANUAL_WORK_STATIONS.boxes.x,
      player.position.z - MANUAL_WORK_STATIONS.boxes.z,
    ) <= 3
  ) {
    prompt = manual.completedToday
      ? "Lote de hoje expedido · volta no próximo dia empresarial"
      : Math.hypot(
            player.position.x - MANUAL_WORK_STATIONS.boxes.x,
            player.position.z - MANUAL_WORK_STATIONS.boxes.z,
          ) <= MANUAL_WORK_INTERACTION_RADIUS
        ? "E · Preparar lote manual · 6 caixas + 8 € embalagens"
        : "Aproxima-te das caixas · preparar lote manual";
  }
  $("prompt").textContent = prompt;
  $("prompt").hidden = !prompt;
  routeTime -= dt;
  if (remoteContract || trials.active) {
    route = [];
    routeTime = 0;
  } else if (
    (contract || placeTargetId || fieldJobs.active || manualWork.active) &&
    point &&
    routeTime <= 0
  ) {
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
  let chase = null;
  if (player.vehicle) {
    if (instant) drivingCamera.reset(yaw);
    chase = drivingCamera.update(dt, {
      carYaw: player.vehicle.yaw,
      speed: player.vehicle.speed,
      orbitYaw: yaw,
      pitch,
    });
    yaw = chase.yaw;
    pitch = chase.pitch;
  }
  const indoors =
    !player.vehicle &&
    world?.interiorZones?.some(
      (zone) =>
        player.position.x >= zone.minX &&
        player.position.x <= zone.maxX &&
        player.position.z >= zone.minZ &&
        player.position.z <= zone.maxZ,
    );
  lookTarget.copy(player.position);
  lookTarget.y = chase?.height || 1.35;
  const distance = chase?.distance || (indoors ? 3.2 : 4.6),
    shoulder = player.vehicle ? 0.12 : indoors ? 0.3 : 0.55;
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
  cameraDesired.copy(
    cameraBoomPosition(lookTarget, cameraDesired, world?.colliders),
  );
  cameraTarget.copy(lookTarget);
  if (chase) {
    cameraTarget.x += Math.sin(player.vehicle.yaw) * chase.targetAhead;
    cameraTarget.z += Math.cos(player.vehicle.yaw) * chase.targetAhead;
  }
  cameraTarget.x += Math.cos(yaw) * shoulder;
  cameraTarget.z -= Math.sin(yaw) * shoulder;
  if (instant) camera.position.copy(cameraDesired);
  else camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * 14));
  camera.position.copy(
    cameraBoomPosition(lookTarget, camera.position, world?.colliders),
  );
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
  cars.forEach((car) =>
    dot(
      car.position.x,
      car.position.z,
      car.ownershipId ? "#d1e6bc" : "#94c6d1",
      2.5,
    ),
  );
  for (const service of world.interactionPoints || []) {
    if (["dealership", "garage", "property", "race"].includes(service.type))
      dot(
        service.x,
        service.z,
        service.type === "property" ? "#e8d4af" : "#bce7df",
        3.2,
      );
  }
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
  syncManualVisuals();
  updatePlayer(dt);
  updateVehicleDrivers();
  if (manualWork.active)
    applyManualResult(
      advanceManualWork(manualWork, { ...manualContext(), dt }),
      false,
    );
  if (fieldJobs.active) {
    const fieldResult = advanceFieldJobs(fieldJobs, {
      ...fieldContext(),
      dt,
      health: player.health,
    });
    if (fieldResult.ok) applyFieldJobResult(fieldResult, false);
  }
  vehicleUsageTime += dt;
  if (vehicleUsageTime >= 1) {
    flushVehicleUsage();
    vehicleUsageTime = 0;
  }
  if (trials.active) {
    const result = advanceTrial(trials, {
      dt,
      position: player.position,
      driving: !!player.vehicle,
      mapId,
    });
    trials = result.state;
    if (result.reward > 0) {
      company = {
        ...company,
        cash: company.cash + result.reward,
        history: [
          ...company.history,
          {
            day: company.day,
            kind: "trial",
            title: "Percurso de condução",
            body: `${result.message} Prémio: ${result.reward} €.`,
          },
        ].slice(-100),
      };
      companyView = getCompanyView(company);
      sound("reward");
    }
    if (result.events?.length) {
      notify(result.message, 6);
      saveCampaign();
    }
  }
  raceCourse?.update(dt, player.position);
  estates?.update(dt, player.position, company);
  atmosphere?.update(dt, player.position, player.vehicle);
  venues?.update(dt, player.position, !!player.vehicle);
  if (founded) operationsTime += dt;
  else operationsTime = 0;
  if (founded && operationsTime >= 1) {
    const result = advanceOperations(company, operationsTime, {
      pausedFleetIds: (fleet?.vehicles || [])
        .filter((vehicle) => vehicle.blocked)
        .map((vehicle) => vehicle.id),
    });
    operationsTime = 0;
    if (result.ok) {
      company = result.state;
      companyView = getCompanyView(company);
      fleet?.sync(company);
      if (result.events?.length) {
        notify(result.events.at(-1), 6);
        venues?.refresh();
        saveCampaign();
      }
    }
  }
  fleet?.update(dt, player.position, [...cars, ...(life?.vehicles || [])]);
  life?.update(dt, player.position);
  streetLife?.update(dt, player.position);
  for (const car of cars)
    car.actor.group.visible =
      car === player.vehicle ||
      car.position.distanceTo(player.position) <
        (car.worldCarId
          ? settings.quality === "low"
            ? 95
            : settings.quality === "medium"
              ? 180
              : 240
          : 240);
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
    const record = company.ownership.vehicles.find(
      (item) => item.id === player.vehicle?.ownershipId,
    );
    const engineRunning =
      player.vehicle && (!record || (record.fuel > 0 && record.condition > 0));
    audio.motorGain.gain.setTargetAtTime(
      engineRunning && !settings.muted ? 0.035 : 0,
      audio.context.currentTime,
      0.1,
    );
    audio.motor.frequency.setTargetAtTime(
      player.vehicle ? 28 + (player.vehicle.rpm || 850) / 48 : 28,
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
  if (player.vehicle) drivingCamera.noteManualLook();
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
  if (state === "photo") return;
  if (state === "jobs") {
    if (key === "escape" || key === "j") fieldJobsPanel?.close();
    return;
  }
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
  if (state === "map") {
    if (key === "escape" || key === "t") cityMapPanel?.close();
    return;
  }
  if (key === "j" && state === "playing" && !event.repeat) {
    event.preventDefault();
    fieldJobsPanel?.open();
    return;
  }
  if (key === "t" && state === "playing") {
    event.preventDefault();
    cityMapPanel?.open();
    return;
  }
  if (state === "ownership") {
    if (["escape", "b", "g"].includes(key)) ownershipPanel?.close();
    return;
  }
  if (key === "g" && state === "playing") {
    event.preventDefault();
    ownershipPanel?.open("overview");
    return;
  }
  if (state === "venue") {
    if (key === "escape" || key === "b") venues?.close();
    return;
  }
  if (state === "company") {
    if (key === "escape" || key === "b") closeCompany();
    return;
  }
  if (key === "x" && state === "playing" && manualWork.active) {
    event.preventDefault();
    applyManualResult(cancelManualWork(manualWork));
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
  if (key === "v" && state === "playing") openPhotoMode();
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
$("open-asset-credits").addEventListener("click", () => {
  $("asset-credits").showModal();
});
$("asset-credits").addEventListener("keydown", (event) =>
  event.stopPropagation(),
);
$("quality").value = settings.quality;
$("sensitivity").value = settings.sensitivity;
$("quality").addEventListener("change", () => {
  settings.quality = $("quality").value;
  const checkpoint = campaignSnapshot();
  const motions = cars.map((car) => ({
    worldCarId: car.worldCarId,
    ownershipId: car.ownershipId,
    x: car.position.x,
    z: car.position.z,
    speed: car.speed,
    steering: car.steering,
    lateralSpeed: car.lateralSpeed || 0,
    gear: car.gear || 0,
    rpm: car.rpm || 0,
  }));
  const opponents = enemies.map((enemy) => ({
    x: enemy.position.x,
    z: enemy.position.z,
    health: enemy.health,
    attack: enemy.attack,
    phase: enemy.phase,
    deadTime: enemy.deadTime,
    missionRival: !!enemy.missionRival,
    lean: enemy.actor.group.rotation.z,
  }));
  const cameraPosition = camera.position.clone(),
    cameraRotation = camera.quaternion.clone(),
    playerFacing = player.yaw;
  const activity = {
    wanted,
    quietTime,
    patrolTime,
    kills,
    reloadTime,
    cooldown,
    healthFlash,
    hitFlash,
  };
  visuals.setQuality(settings.quality);
  vehicleReflections.reset();
  if (mapId === "cidade") {
    resetMap(mapId, { preserveActivities: true });
    restoreCampaignScene(checkpoint);
    for (const [index, car] of cars.entries()) {
      const motion = car.ownershipId
        ? motions.find((item) => item.ownershipId === car.ownershipId)
        : car.worldCarId
          ? motions.find((item) => item.worldCarId === car.worldCarId)
          : motions[index];
      if (
        motion &&
        Math.hypot(car.position.x - motion.x, car.position.z - motion.z) < 0.01
      )
        Object.assign(car, {
          speed: motion.speed,
          steering: motion.steering,
          lateralSpeed: motion.lateralSpeed,
          gear: motion.gear,
          rpm: motion.rpm,
        });
    }
    for (const enemy of enemies) clearGroup(enemy.actor.group);
    enemies = [];
    for (const [index, saved] of opponents.entries()) {
      addEnemy(saved, index);
      Object.assign(enemies.at(-1), {
        health: saved.health,
        attack: saved.attack,
        phase: saved.phase,
        deadTime: saved.deadTime,
        missionRival: saved.missionRival,
      });
      enemies.at(-1).actor.group.rotation.z = saved.lean;
    }
    ({
      wanted,
      quietTime,
      patrolTime,
      kills,
      reloadTime,
      cooldown,
      healthFlash,
      hitFlash,
    } = activity);
    yaw = checkpoint.yaw;
    pitch = checkpoint.pitch;
    player.yaw = playerFacing;
    player.actor.group.rotation.y = playerFacing;
    drivingCamera.reset(yaw);
    updateVehicleDrivers();
    for (const car of cars) car.actor.animate(0, car.speed, car.steering);
    camera.position.copy(cameraPosition);
    camera.quaternion.copy(cameraRotation);
    syncManualVisuals();
    updateMission();
    updateHud();
    drawMinimap();
    saveCampaign();
  }
  resize();
  Promise.resolve(visuals.ready).then(() => {
    renderDirty = true;
  });
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
  navigateToPlace,
  openOwnership: (tab = "overview") => ownershipPanel?.open(tab),
  close: closeCompany,
  notify,
});
ownershipPanel = createOwnershipPanel({
  getCompany: () => company,
  setCompany: changeCompany,
  notify,
  isFounded: () => founded,
  trackPlace: navigateToPlace,
  onEquipCar: equipOwnedCar,
  onRest() {
    player.health = 100;
    player.ammo = 12;
    wanted = 0;
    reloadTime = 0;
    atmosphere?.setTime(450);
    cameraUpdate(0.5, true);
    notify(
      "Descansaste em casa. São 07:30; energia e cesto recuperados. O dia da empresa continua no painel B.",
      7,
    );
    updateHud();
    saveCampaign();
  },
  getTrials: () => getTrialsView(trials),
  onStartTrial: beginTrial,
  onCancelTrial: abandonTrial,
  onTrackTrial: () => navigateToPlace("trial-board"),
  onStateChange(open) {
    if (transitioning) return;
    if (open) {
      setState("ownership");
      $("story-toast").hidden = true;
    } else if (state === "ownership") {
      setState("playing");
      last = performance.now();
      saveCampaign();
    }
  },
});
fieldJobsPanel = createFieldJobsPanel({
  getState: () => fieldJobs,
  getWorld: () => world,
  getContext: fieldContext,
  onStart(id) {
    if (manualWork.active) {
      const blocked = {
        ok: false,
        message:
          "Termina ou cancela o lote manual com X antes de aceitar um trabalho.",
      };
      notify(blocked.message);
      return blocked;
    }
    const result = startFieldJob(fieldJobs, id, fieldContext());
    if (result.ok) {
      if (trials.active) trials = cancelTrial(trials).state;
      activeContractId = placeTargetId = null;
    }
    return applyFieldJobResult(result);
  },
  onCancel: () => applyFieldJobResult(cancelFieldJob(fieldJobs)),
  onTrack(point) {
    if (mapId !== "cidade") return;
    placeTargetId = point.id;
    route = navigation.findPath(player.position, point);
    routeTime = 5;
    notify(
      `Segue o marcador até ${point.label}. E permite interagir no local.`,
      6,
    );
    updateMission();
  },
  onStateChange(open) {
    if (open) {
      setState("jobs");
      $("story-toast").hidden = true;
    } else if (state === "jobs") {
      setState("playing");
      last = performance.now();
      saveCampaign();
    }
  },
  notify,
});
$("open-jobs")?.addEventListener("click", () => fieldJobsPanel.open());
$("manual-cancel")?.addEventListener("click", () => {
  if (state === "playing" && manualWork.active)
    applyManualResult(cancelManualWork(manualWork));
});
cityMapPanel = createCityMapPanel({
  getWorld: () => world,
  getPlayer: () => player.position,
  getCompany: () => company,
  getMapId: () => mapId,
  trackPlace: navigateToPlace,
  notify,
  onStateChange(open) {
    if (open) {
      setState("map");
      $("story-toast").hidden = true;
    } else if (state === "map") {
      setState("playing");
      last = performance.now();
      saveCampaign();
    }
  },
});
$("open-city-map")?.addEventListener("click", () => cityMapPanel.open());
photoMode = createPhotoMode({
  camera,
  canvas,
  onChange: () => {
    renderDirty = true;
  },
  onClose() {
    if (state !== "photo") return;
    setState("playing");
    last = performance.now();
  },
  async onCapture() {
    photoMode.update();
    visuals.update(0, player.position, company.day);
    visuals.render();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob)
      throw new Error("Não foi possível criar a imagem. Tenta novamente.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TomatoRepublic-${mapId}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
});
function openPhotoMode() {
  if (state !== "playing" || !photoMode) return;
  setState("photo");
  $("story-toast").hidden = true;
  photoMode.open({
    target: player.position,
    vehicle: !!player.vehicle,
    bounds: world.bounds,
    colliders: world.colliders,
  });
}
$("open-photo")?.addEventListener("click", openPhotoMode);
$("weather")?.addEventListener("change", () => {
  atmosphere?.setWeather($("weather").value);
  renderDirty = true;
  updateHud();
  saveCampaign();
});
$("open-ownership")?.addEventListener("click", () =>
  ownershipPanel.open("overview"),
);
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
  placeTargetId = null;
  operationsTime = 0;
  lastStoryEvent = "";
  started = false;
  savedCampaign = null;
  trials = createTrials();
  fieldJobs = createFieldJobs();
  manualWork = createManualWork();
  syncManualVisuals();
  atmosphere?.dispose();
  atmosphere = null;
  atmosphereState = null;
  // Old cars must not write their parking data into a fresh campaign.
  cars.forEach((car) => {
    car.ownershipId = null;
  });
  resetMap("cidade");
  $("new-campaign").hidden = true;
  $("play").textContent = "Começar a minha história";
  saveCampaign();
  play();
});
$("export-save").addEventListener("click", () => {
  saveCampaign();
  const snapshot = campaignSnapshot();
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
function restoreCampaignScene(checkpoint) {
  if (!checkpoint) return;
  const point = checkpoint.position;
  if (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    !hitBox(point.x, point.z, 0.4)
  )
    player.position.set(point.x, 0, point.z);
  const savedDriver = checkpoint.drivingOwnershipId
    ? cars.find((car) => car.ownershipId === checkpoint.drivingOwnershipId)
    : checkpoint.drivingWorldCarId
      ? cars.find((car) => car.worldCarId === checkpoint.drivingWorldCarId)
      : Number.isInteger(checkpoint.driving)
        ? cars[checkpoint.driving]
        : null;
  // Reserve every final saved location together. Initial spawns and freshly
  // generated traffic must not reject a spot that was free when it was saved.
  const fallbackBays = [
    ...(estates?.vehicleSpawns || []),
    ...(world.vehicleSpawns || []),
  ];
  if (mapId === "cidade")
    for (let z = 174; z <= 186; z += 6)
      for (let x = 114; x <= 174; x += 6)
        fallbackBays.push({ x, z, yaw: Math.PI });
  const placements = restoreVehiclePlacements(cars, checkpoint.vehicles, {
    isStaticClear: (car, destination) => parkingClear(car, destination, true),
    fallback: () => fallbackBays,
    clearance: 0,
  });
  for (let i = cars.length - 1; i >= 0; i--) {
    const destination = placements[i],
      car = cars[i];
    if (!destination) {
      clearGroup(car.actor.group);
      cars.splice(i, 1);
      continue;
    }
    car.position.set(destination.x, 0, destination.z);
    car.yaw = destination.yaw;
    car.actor.group.rotation.y = car.yaw;
  }
  if (savedDriver && cars.includes(savedDriver)) {
    player.vehicle = savedDriver;
    player.position.copy(player.vehicle.position);
    player.actor.group.visible = false;
    updateVehicleDrivers();
  }
  player.health = THREE.MathUtils.clamp(
    Number(checkpoint.health) || 100,
    1,
    100,
  );
  player.ammo = THREE.MathUtils.clamp(
    Number.isFinite(checkpoint.ammo) ? checkpoint.ammo : 12,
    0,
    12,
  );
  yaw = Number.isFinite(checkpoint.yaw) ? checkpoint.yaw : 0;
  pitch = THREE.MathUtils.clamp(
    Number.isFinite(checkpoint.pitch) ? checkpoint.pitch : 0.24,
    -0.12,
    1.05,
  );
  placeCharacter(player.actor, player.position);
  cameraUpdate(0.5, true);
  $("play").textContent = "Continuar a minha história";
}
restoreCampaignScene(savedCampaign);
initialized = true;
$("new-campaign").hidden = !founded;
setState("menu");
drawMinimap();
updateMission();
updateHud();
if (new URLSearchParams(location.search).has("diagnostics")) {
  Object.defineProperty(window, "tomatoDiagnostics", {
    value: Object.freeze({
      graphicsReady: () =>
        Promise.all([
          photoAssetsReady(),
          humanAssetsReady(),
          districtAssetsReady(),
          detailedVehicleAssetsReady(),
          furnitureAssetsReady(),
          visuals.ready,
        ]).then(() => getPhotoAssetState()),
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
        camera: {
          yaw,
          pitch,
          position: camera.position.toArray(),
          fov: camera.fov,
        },
        vehicle: player.vehicle
          ? {
              x: player.vehicle.position.x,
              z: player.vehicle.position.z,
              yaw: player.vehicle.yaw,
              speed: player.vehicle.speed,
              steering: player.vehicle.steering,
              gear: player.vehicle.gear || 0,
              rpm: player.vehicle.rpm || 0,
              ownershipId: player.vehicle.ownershipId || null,
              modelId: player.vehicle.modelId || "pickup",
              driverVisible: !!player.vehicle.driver?.group.visible,
            }
          : null,
        enemies: enemies.map((e) => ({
          x: e.position.x,
          z: e.position.z,
          health: e.health,
          missionRival: !!e.missionRival,
        })),
        company: JSON.parse(JSON.stringify(company)),
        ownership: getOwnershipView(company),
        atmosphere: atmosphere?.getState(),
        trials: getTrialsView(trials),
        fieldJobs: getFieldJobsView(fieldJobs),
        manualWork: getManualWorkView(manualWork, manualContext()),
        cars: cars.map((car) => ({
          worldCarId: car.worldCarId || null,
          x: car.position.x,
          z: car.position.z,
          yaw: car.yaw,
          ownershipId: car.ownershipId || null,
          modelId: car.modelId || "pickup",
          bounds: car.bounds ? { ...car.bounds } : null,
        })),
        founded,
        activeContractId,
        placeTargetId,
        nearbyPlace: venues?.nearest()?.id || null,
        operations: getOperationsView(company),
        fleet: (fleet?.vehicles || []).map((vehicle) => ({
          id: vehicle.id,
          x: vehicle.position.x,
          z: vehicle.position.z,
          yaw: vehicle.yaw,
          speed: vehicle.speed,
          blocked: !!vehicle.blocked,
          routeUnavailable: !!vehicle.routeUnavailable,
        })),
        interactionPoints: (world.interactionPoints || []).map((point) => ({
          ...point,
        })),
        cameraPosition: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
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
          streetLife: streetLife ? { ...streetLife.stats } : null,
          cityBlocks: world.cityBlocksStats
            ? { ...world.cityBlocksStats }
            : null,
          headquarters: world.headquartersStats
            ? { ...world.headquartersStats }
            : null,
          carriedCrateVisible: carriedCrate.visible,
          stationCrateVisible: workbenchCrate.visible,
          playerGroundHeight: player.actor.group.position.y,
          photoMode: photoMode?.getState() || null,
          objectiveMarkerVisible: !!marker?.visible,
          quality: settings.quality,
          photographicAssets: getPhotoAssetState(),
          humanAssets: getHumanAssetState(),
          district: getDistrictAssetState(),
          detailedVehicle: getDetailedVehicleState(),
          vehicleReflections: vehicleReflections.getState(),
          furniture: getFurnitureAssetState(),
          crops: world.cropStats ? { ...world.cropStats } : null,
          urbanDetail: world.urbanStats ? { ...world.urbanStats } : null,
          vegetation: world.vegetationStats
            ? {
                ...world.vegetationStats,
                species: { ...world.vegetationStats.species },
              }
            : null,
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
  if (state === "photo") photoMode?.update();
  visuals.update(dt, player.position, company.day);
  if (state === "playing" && !transitioning)
    vehicleReflections.update(dt, player.vehicle, settings.quality);
  visuals.render();
  renderDirty = false;
}
requestAnimationFrame(frame);
Promise.all([
  photoAssetsReady(),
  humanAssetsReady(),
  districtAssetsReady(),
  detailedVehicleAssetsReady(),
  furnitureAssetsReady(),
  visuals.ready,
])
  .then(() => {
    renderDirty = true;
  })
  .catch((error) => {
    renderDirty = true;
    console.error(
      "Não foi possível preparar todos os materiais do cenário.",
      error,
    );
  });

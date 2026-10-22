import * as THREE from "three";
import { MAPS, buildWorld } from "./world.js";
import {
  createCharacter,
  createVehicle,
  createTomato,
  createPickup,
} from "./actors.js";
import { createNavigation } from "./navigation.js";

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = settings.quality !== "low";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#b8d2d8");
scene.fog = new THREE.FogExp2("#b8d2d8", 0.0046);
const hemi = new THREE.HemisphereLight(0xc4dbe7, 0x777052, 2.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4b1, 3.3);
sun.position.set(-45, 75, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(
  settings.quality === "high" ? 2048 : 1024,
  settings.quality === "high" ? 2048 : 1024,
);
Object.assign(sun.shadow.camera, {
  left: -65,
  right: 65,
  top: 65,
  bottom: -65,
  near: 1,
  far: 190,
});
sun.shadow.normalBias = 0.05;
sun.shadow.bias = -0.0002;
scene.add(sun);
scene.add(sun.target);
const camera = new THREE.PerspectiveCamera(
  58,
  innerWidth / innerHeight,
  0.12,
  320,
);
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
let quest = {
  stage: 0,
  phase: 0,
  kills: 0,
  checkpoints: 0,
  timer: 95,
  complete: false,
};
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
function hitBox(x, z, radius = 0.35) {
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
      x + radius > box.minX &&
      x - radius < box.maxX &&
      z + radius > box.minZ &&
      z - radius < box.maxZ,
  );
}
function moveTo(entity, dx, dz, radius) {
  let blocked = false;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let i = 0; i < count; i++) {
    if (!hitBox(entity.position.x + dx / count, entity.position.z, radius))
      entity.position.x += dx / count;
    else blocked = true;
    if (!hitBox(entity.position.x, entity.position.z + dz / count, radius))
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
function questPoint() {
  const points = world.missionSpawns;
  if (quest.complete) return null;
  if (quest.stage === 0) return points[quest.phase === 0 ? 0 : 1];
  if (quest.stage === 1) return null;
  return points[[2, 3, 4][quest.checkpoints % 3]];
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
  world?.dispose();
  mapId = MAPS.some((map) => map.id === id) ? id : "cidade";
  world = buildWorld(scene, mapId, settings.quality);
  navigation = createNavigation(world.colliders, world.bounds);
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
  quest = {
    stage: 0,
    phase: 0,
    kills: 0,
    checkpoints: 0,
    timer: 95,
    complete: false,
  };
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
  const point = world.missionSpawns[0],
    crate = createPickup("crate");
  crate.position.set(point.x, 0, point.z);
  scene.add(crate);
  pickups.push({ mesh: crate, type: "quest", position: crate.position });
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
  transitioning = false;
}
function updateMission() {
  const titles = [
    "Uma caixa. Um começo.",
    "O bairro não se entrega.",
    "Entrega expressa.",
  ];
  $("mission-title").textContent = quest.complete
    ? "A cidade é tua."
    : titles[quest.stage];
  let text, progress;
  if (quest.complete) {
    text = "Missões concluídas. Explora, conduz ou escolhe outro mapa no menu.";
    progress = "MAPA CONCLUÍDO";
  } else if (quest.stage === 0) {
    text =
      quest.phase === 0
        ? "Recolhe a caixa de tomates no marcador dourado."
        : "Leva a colheita ao ponto de entrega. Um veículo torna a viagem mais rápida.";
    progress = quest.phase === 0 ? "RECOLHER COLHEITA" : "ENTREGAR COLHEITA";
  } else if (quest.stage === 1) {
    text =
      "A patrulha rival anda pelo bairro. Acerta três tomates em cada adversário e elimina três rivais.";
    progress = `RIVAIS ${quest.kills} / 3`;
  } else {
    text =
      "Entra num veículo e passa pelos três pontos de entrega antes de o tempo acabar.";
    progress = `ENTREGAS ${quest.checkpoints} / 3 · ${Math.ceil(quest.timer)} s`;
  }
  $("mission-description").textContent = text;
  $("mission-progress").textContent = progress;
}
function reward(amount, text) {
  settings.cash += amount;
  save();
  sound("reward");
  notify(`${text} +${amount} 🍅`, 5);
  updateHud();
}
function missionAction() {
  const point = questPoint();
  if (
    !point ||
    quest.complete ||
    Math.hypot(player.position.x - point.x, player.position.z - point.z) > 4
  )
    return false;
  if (quest.stage === 0) {
    if (quest.phase === 0) {
      quest.phase = 1;
      const item = pickups.find((p) => p.type === "quest");
      if (item) {
        clearGroup(item.mesh);
        pickups.splice(pickups.indexOf(item), 1);
      }
      notify("Colheita recolhida. Leva-a ao próximo marcador.");
      sound("reward");
    } else {
      quest.stage = 1;
      quest.kills = 0;
      reward(150, "Primeira entrega concluída.");
      if (enemies.filter((e) => e.health > 0).length < 3)
        world.enemySpawns.slice(0, 3).forEach((p, i) => addEnemy(p, i));
    }
    updateMission();
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
      if (!hitBox(point.x, point.z, 0.35)) {
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
  document.body.dataset.state = next;
  keys.clear();
  fireHeld = false;
  dragging = false;
  firePointer = null;
  lookPointer = null;
  mousePosition = null;
  touchPosition = null;
  if (next !== "playing") {
    ownedLock = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  if (audio.motorGain)
    audio.motorGain.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
}
function play() {
  initAudio();
  if (!started) {
    started = true;
    notify("A tua primeira entrega está marcada a dourado no mapa.", 6);
  } else notify("De volta à cidade.");
  setState("playing");
  last = performance.now();
}
function pause() {
  if (state !== "playing") return;
  setState("menu");
  $("menu-title").textContent = "A tua cidade espera.";
  $("menu-description").textContent =
    "Retoma a aventura ou escolhe um novo mapa. Trocar de mapa reinicia as missões desse local.";
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
  reward(25, "Rival fora de combate.");
  if (quest.stage === 1 && !quest.complete) {
    quest.kills++;
    if (quest.kills >= 3) {
      quest.stage = 2;
      quest.checkpoints = 0;
      quest.timer = 95;
      reward(250, "O bairro está seguro.");
    }
    updateMission();
  }
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
    settings.cash = Math.max(0, settings.cash - 50);
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
      "A cooperativa levou-te para um lugar seguro. Recuperação: 50 tomates.",
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
  $("cash").textContent = Math.floor(settings.cash).toLocaleString("pt-PT");
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
    const delta = player.position.clone().sub(enemy.position),
      distance = delta.length(),
      visible = distance < 35 && lineClear(enemy.position, player.position);
    let speed = 0;
    if (distance < 45 && (distance > 9 || !visible)) {
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
    } else if (visible && distance > 4) {
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
    if (visible && enemy.attack <= 0) {
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
      if (p.y < 0.08 || hitBox(p.x, p.z, 0.08)) {
        shot.dead = true;
        burst(p);
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
  let point = questPoint();
  marker.visible = !!point;
  if (point) {
    marker.position.set(point.x, 0, point.z);
    markerBeam.rotation.y += dt;
    markerBeam.position.y = 3.2 + Math.sin(time * 2) * 0.25;
    markerRing.scale.setScalar(1 + Math.sin(time * 3) * 0.04);
  }
  if (
    quest.stage === 0 &&
    player.vehicle &&
    point &&
    Math.hypot(player.position.x - point.x, player.position.z - point.z) < 4
  )
    missionAction();
  if (quest.stage === 2 && !quest.complete) {
    quest.timer -= dt;
    if (quest.timer <= 0) {
      quest.timer = 95;
      quest.checkpoints = 0;
      point = questPoint();
      notify(
        "A entrega atrasou-se. O percurso recomeçou. Tenta com um veículo.",
        5,
      );
    }
    if (
      player.vehicle &&
      point &&
      Math.hypot(player.position.x - point.x, player.position.z - point.z) < 4
    ) {
      quest.checkpoints++;
      sound("reward");
      notify(`Entrega ${quest.checkpoints} / 3 concluída.`);
      if (quest.checkpoints >= 3) {
        quest.complete = true;
        settings.completed[mapId] = true;
        reward(500, "Mapa concluído! A cidade é tua.");
      }
    }
    updateMission();
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
  if (
    point &&
    quest.stage === 0 &&
    Math.hypot(player.position.x - point.x, player.position.z - point.z) < 4
  )
    prompt =
      quest.phase === 0 ? "E · Recolher a colheita" : "E · Entregar a colheita";
  else if (player.vehicle) prompt = "E · Sair do veículo";
  else if (cars.some((c) => c.position.distanceTo(player.position) < 4.2))
    prompt = "E · Conduzir";
  $("prompt").textContent = prompt;
  $("prompt").hidden = !prompt;
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
    if (hitBox(x, z, 0.15)) {
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
  const c = $("minimap"),
    ctx = c.getContext("2d");
  if (!ctx) return;
  const size = c.width,
    scale = size / 200,
    center = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#18372c";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#657565";
  ctx.lineWidth = 9 * scale;
  for (const road of [-48, 0, 48]) {
    ctx.beginPath();
    ctx.moveTo((road + 100) * scale, 0);
    ctx.lineTo((road + 100) * scale, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (road + 100) * scale);
    ctx.lineTo(size, (road + 100) * scale);
    ctx.stroke();
  }
  ctx.fillStyle = "#a9b098";
  for (const b of world.colliders)
    ctx.fillRect(
      (b.minX + 100) * scale,
      (b.minZ + 100) * scale,
      (b.maxX - b.minX) * scale,
      (b.maxZ - b.minZ) * scale,
    );
  const dot = (x, z, color, radius) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((x + 100) * scale, (z + 100) * scale, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  cars.forEach((c) => dot(c.position.x, c.position.z, "#90c7d3", 2.5));
  enemies
    .filter((e) => e.health > 0)
    .forEach((e) => dot(e.position.x, e.position.z, "#f27454", 2.5));
  const point = questPoint();
  if (point) dot(point.x, point.z, "#ffd37f", 4);
  ctx.save();
  ctx.translate(
    (player.position.x + 100) * scale,
    (player.position.z + 100) * scale,
  );
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
  ctx.fillText("N", center - 3, 11);
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
    hudTime = 0.12;
  }
  if (minimapTime <= 0) {
    drawMinimap();
    minimapTime = 0.12;
  }
}
function resize() {
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio || 1,
      settings.quality === "high" ? 1.7 : settings.quality === "low" ? 1 : 1.35,
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
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
    else if (started && key !== "m") play();
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
  renderer.shadowMap.enabled = settings.quality !== "low";
  const size = settings.quality === "high" ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  sun.shadow.needsUpdate = true;
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
    started = false;
    $("play").textContent = "Entrar na cidade";
    $("menu-title").textContent = "Uma nova terra. A mesma ambição.";
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
  pause();
  $("menu-description").textContent =
    "A ligação aos gráficos foi interrompida. Recarrega a página para retomar.";
  $("play").disabled = true;
});
addEventListener("resize", resize);
resize();
resetMap("cidade");
setState("menu");
drawMinimap();
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
        quest: { ...quest },
        kills,
        cash: settings.cash,
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
  if (state === "playing" && !transitioning) update(dt);
  else if (!started) {
    cameraUpdate(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

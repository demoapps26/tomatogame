import * as THREE from "three";
import { DRIVING_TRIALS, TRIAL_START_POINTS, getTrialsView } from "./driving-jobs.js";

// A reusable world marker, rather than a menu-only challenge. All race meshes
// are decoration: the car's ordinary road collision and movement still apply.
export function createRaceCourse(scene, world, getTrialState) {
  const city = world.group?.name === "world-cidade" || world.bounds?.maxX > 500;
  const startPoints = city ? TRIAL_START_POINTS.map((item) => ({ ...item })) : [];
  const root = new THREE.Group();
  root.name = "driving-trials";
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = (value) => (geometries.add(value), value);
  const material = (value) => (materials.add(value), value);
  let disposed = false, clock = 0, gateKey = "";
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const metal = material(new THREE.MeshStandardMaterial({ color: 0x253333, roughness: 0.48, metalness: 0.7 }));
  const gold = material(new THREE.MeshBasicMaterial({ color: 0xffcb60, toneMapped: false }));
  const ringMaterial = material(new THREE.MeshBasicMaterial({
    color: 0xffc556, transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  const arrowMaterial = material(new THREE.MeshBasicMaterial({
    color: 0xffd579, transparent: true, opacity: 0.68, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  function block(parent, x, y, z, width, height, depth, surface) {
    const mesh = new THREE.Mesh(box, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }
  function canvasSurface(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    textures.add(texture);
    return { canvas, context, texture };
  }
  function text(context, value, x, y, size, color = "#fff5df", weight = 600) {
    context.font = `${weight} ${size}px sans-serif`;
    context.fillStyle = color;
    context.fillText(value, x, y);
  }

  const board = new THREE.Group();
  board.position.set(104, 0, 180);
  board.rotation.y = -Math.PI / 2;
  for (const x of [-2.8, 2.8]) block(board, x, 2.15, 0, 0.16, 4.3, 0.16, metal);
  block(board, 0, 3.1, 0, 6.7, 3.2, 0.2, metal);
  const boardSurface = canvasSurface(1024, 512), ctx = boardSurface.context;
  ctx.fillStyle = "#15262a"; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#efbe66"; ctx.fillRect(0, 0, 1024, 8);
  text(ctx, "VOLTA À CIDADE", 48, 78, 51, "#f7ce81", 800);
  text(ctx, "Percursos de condução · Santa Tomata", 48, 121, 26);
  DRIVING_TRIALS.forEach((trial, index) => {
    const y = 194 + index * 70;
    text(ctx, `0${index + 1}`, 48, y, 30, "#efbe66", 800);
    text(ctx, trial.name, 119, y, 33);
    text(ctx, `${trial.timeLimit} s`, 846, y, 28, "#d7e6de");
  });
  ctx.fillStyle = "#294644"; ctx.fillRect(28, 399, 968, 87);
  text(ctx, "E  ·  Escolher percurso", 51, 439, 30, "#f7ce81", 800);
  text(ctx, "Traz o teu carro. Prémios de patrocinadores na primeira vitória.", 51, 473, 21);
  const boardFace = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(6.4, 3)),
    material(new THREE.MeshBasicMaterial({ map: boardSurface.texture, toneMapped: false })),
  );
  boardFace.position.set(0, 3.1, 0.111); board.add(boardFace);
  root.add(board);

  const startRing = new THREE.Mesh(geometry(new THREE.RingGeometry(2.8, 3.05, 48)), ringMaterial);
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.set(96, 0.09, 180); root.add(startRing);

  const gate = new THREE.Group();
  gate.name = "next-driving-checkpoint";
  for (const x of [-5.8, 5.8]) {
    block(gate, x, 1.85, 0, 0.23, 3.7, 0.23, gold);
    block(gate, x, 0.25, 0, 0.7, 0.5, 0.7, metal);
  }
  block(gate, 0, 3.65, 0, 11.83, 0.2, 0.23, gold);
  const groundRing = new THREE.Mesh(geometry(new THREE.RingGeometry(8.5, 9.3, 64)), ringMaterial);
  groundRing.rotation.x = -Math.PI / 2; groundRing.position.y = 0.1; gate.add(groundRing);
  const gateSurface = canvasSurface(512, 128);
  const gateLabel = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(5.4, 1.35)),
    material(new THREE.MeshBasicMaterial({ map: gateSurface.texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })),
  );
  gateLabel.position.set(0, 4.6, 0); gate.add(gateLabel);
  gate.visible = false; root.add(gate);

  // Flat road arrows show the current leg without adding lights or physics.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.8, -1.1); arrowShape.lineTo(0, 0.15);
  arrowShape.lineTo(0.8, -1.1); arrowShape.lineTo(0.8, -0.05);
  arrowShape.lineTo(0, 1.2); arrowShape.lineTo(-0.8, -0.05); arrowShape.closePath();
  const arrowGeometry = geometry(new THREE.ShapeGeometry(arrowShape));
  arrowGeometry.rotateX(Math.PI / 2);
  const arrows = Array.from({ length: 32 }, () => {
    const mesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
    mesh.visible = false; root.add(mesh); return mesh;
  });
  root.visible = city;
  scene.add(root);

  return {
    startPoints,
    nearest(position) {
      if (!city || disposed || !position) return null;
      const start = startPoints[0];
      return Math.hypot(start.x - position.x, start.z - position.z) <= 9 ? { ...start } : null;
    },
    update(dt, playerPosition) {
      if (disposed || !city) return;
      if (Number.isFinite(dt)) clock += Math.max(0, Math.min(dt, 0.25));
      const player = playerPosition || { x: 0, z: 86 };
      board.visible = Math.hypot(player.x - 104, player.z - 180) < 180;
      startRing.visible = board.visible;
      const state = typeof getTrialState === "function" ? getTrialState() : null;
      const active = getTrialsView(state).active;
      for (const arrow of arrows) arrow.visible = false;
      if (!active) { gate.visible = false; gateKey = ""; return; }
      const trial = DRIVING_TRIALS.find((item) => item.id === active.id);
      const target = active.nextCheckpoint;
      const previous = active.checkpointIndex ? trial.checkpoints[active.checkpointIndex - 1] : trial.start;
      const dx = target.x - previous.x, dz = target.z - previous.z;
      const length = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
      gate.position.set(target.x, 0, target.z);
      gate.rotation.y = angle;
      gate.visible = Math.hypot(player.x - target.x, player.z - target.z) < 420;
      ringMaterial.opacity = 0.46 + Math.sin(clock * 3) * 0.13;
      const key = `${active.id}:${active.checkpointIndex}`;
      if (key !== gateKey) {
        gateKey = key;
        const context = gateSurface.context;
        context.clearRect(0, 0, 512, 128);
        context.fillStyle = "rgba(15,31,31,.92)"; context.fillRect(0, 0, 512, 128);
        context.textAlign = "center";
        text(context, active.checkpointIndex === active.checkpointCount - 1 ? "META" : "PONTO DE PASSAGEM", 256, 48, 28, "#f7ce81", 800);
        text(context, `${active.checkpointIndex + 1} / ${active.checkpointCount}`, 256, 99, 38);
        gateSurface.texture.needsUpdate = true;
      }
      if (length <= 1) return;
      const count = Math.min(arrows.length, Math.floor(length / 12));
      for (let index = 0; index < count; index++) {
        const t = (index + 1) / (count + 1), arrow = arrows[index];
        const x = previous.x + dx * t, z = previous.z + dz * t;
        const fromPlayer = Math.hypot(player.x - x, player.z - z);
        arrow.position.set(x, 0.13, z); arrow.rotation.y = angle;
        arrow.visible = fromPlayer < 155 && fromPlayer > 3;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; scene.remove(root);
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
      for (const item of textures) item.dispose();
      root.clear();
    },
  };
}

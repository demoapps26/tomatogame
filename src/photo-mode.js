import * as THREE from "three";
import { cameraBoomPosition } from "./camera-obstruction.js";

const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const STYLES = `
.photo-mode,.photo-mode *{box-sizing:border-box}
.photo-mode[hidden],.photo-mode [hidden]{display:none!important}
.photo-mode{position:fixed;inset:0;z-index:160;color:#f3efe5;font-family:Inter,system-ui,sans-serif;pointer-events:none;isolation:isolate}
.photo-mode button,.photo-mode input{font:inherit}
.photo-mode button{cursor:pointer;min-height:39px;border:1px solid #c9d2bd45;border-radius:7px;background:#edf0e514;color:#f3efe5;padding:9px 12px;font-size:12px;font-weight:650}
.photo-mode button:hover{background:#edf0e52b}
.photo-mode button:disabled{cursor:default;opacity:.5}
.photo-mode button:focus-visible,.photo-mode input:focus-visible{outline:2px solid #edcf93;outline-offset:3px}
.pm-header{position:absolute;top:22px;left:24px;right:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;pointer-events:auto}
.pm-heading{padding:13px 17px;background:#17241de8;border:1px solid #b1bba638;border-radius:9px;box-shadow:0 7px 25px #0002}
.pm-heading small{display:block;font-size:9px;letter-spacing:.18em;font-weight:750;color:#d2d7bf}
.pm-heading h2{margin:5px 0 4px;font-size:23px;font-weight:650;letter-spacing:-.035em}
.pm-heading p{margin:0;max-width:360px;font-size:11px;line-height:1.6;color:#c2c9b9}
.photo-mode .pm-close{background:#17241ded;flex:none;min-height:43px;padding:11px 16px}
.pm-controls{position:absolute;left:24px;bottom:24px;width:338px;max-width:calc(100vw - 48px);padding:18px;background:#17241def;border:1px solid #b1bba64a;border-radius:11px;box-shadow:0 12px 40px #0004;pointer-events:auto;max-height:calc(100dvh - 170px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
.pm-label{margin:0 0 11px;font-size:9px;font-weight:750;letter-spacing:.14em;color:#c5cdb8}
.pm-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-bottom:17px}
.photo-mode .pm-presets button{font-size:10px;padding:8px 3px;min-width:0}
.photo-mode .pm-presets button[aria-pressed="true"]{background:#d6dfc8;color:#283d30;border-color:#d6dfc8}
.pm-slider{display:block;margin:0 0 15px}
.pm-slider span{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:#e4e6db;margin-bottom:7px}
.pm-slider output{font-variant-numeric:tabular-nums;color:#e2cb99;font-size:11px}
.pm-slider input{display:block;width:100%;margin:0;accent-color:#d2c194;cursor:pointer;min-height:19px}
.pm-check{display:flex;align-items:center;gap:8px;font-size:11px;line-height:1.4;margin:3px 0 16px;color:#d5dac9;cursor:pointer}
.pm-check input{accent-color:#d2c194;width:15px;height:15px;margin:0}
.pm-actions{display:flex;gap:8px}
.photo-mode .pm-capture{flex:1;background:#d6dfc8;color:#263e2f;border-color:#d6dfc8}
.photo-mode .pm-capture:hover{background:#e6ecd9}
.pm-status{min-height:16px;font-size:10px;line-height:1.5;color:#d4d9c6;margin:10px 0 0;overflow-wrap:anywhere}
.pm-shortcuts{margin:13px 0 0;padding-top:11px;border-top:1px solid #c9d2bd24;font-size:9px;line-height:1.65;color:#aab5a1}
.photo-mode .pm-toggle{position:absolute;right:24px;bottom:24px;pointer-events:auto;background:#17241ded;box-shadow:0 5px 20px #0003;font-size:10px;padding:10px 13px}
.pm-grid{position:absolute;inset:0;pointer-events:none;opacity:.53}
.pm-grid i{position:absolute;display:block;background:#f2efdf66;box-shadow:0 0 1px #17241d66}
.pm-grid i:nth-child(1),.pm-grid i:nth-child(2){top:0;bottom:0;width:1px;left:33.3333%}
.pm-grid i:nth-child(2){left:66.6667%}
.pm-grid i:nth-child(3),.pm-grid i:nth-child(4){left:0;right:0;height:1px;top:33.3333%}
.pm-grid i:nth-child(4){top:66.6667%}
.photo-mode[data-minimal="true"] .pm-header,.photo-mode[data-minimal="true"] .pm-controls{display:none}
@media(max-width:600px){.pm-header{top:12px;left:12px;right:12px;gap:8px}.pm-heading{padding:11px 12px}.pm-heading small{font-size:8px}.pm-heading h2{font-size:19px}.pm-heading p{font-size:10px;max-width:230px}.photo-mode .pm-close{padding:10px 11px;font-size:10px;min-height:40px}.pm-controls{left:12px;right:12px;bottom:64px;width:auto;max-width:none;padding:14px;max-height:calc(100dvh - 200px)}.pm-presets{margin-bottom:13px}.pm-slider{margin-bottom:10px}.pm-check{margin-bottom:12px}.pm-shortcuts{margin-top:9px;padding-top:8px}.photo-mode .pm-toggle{bottom:13px;right:12px;min-height:37px}.pm-status{margin-top:7px}}
@media(max-height:620px){.pm-header{top:10px;left:12px;right:12px}.pm-heading{padding:9px 12px}.pm-heading h2{font-size:18px}.pm-heading p{display:none}.pm-controls{left:12px;bottom:12px;padding:12px;max-height:calc(100dvh - 105px)}.pm-presets{margin-bottom:10px}.pm-slider{margin-bottom:9px}.pm-shortcuts{display:none}.photo-mode .pm-toggle{right:12px;bottom:12px}}
`;

/** Paused orbit camera and composition controls. Game state, rendering and PNG
 * downloads remain with the caller; this module never changes the world/save. */
export function createPhotoMode({
  camera,
  canvas,
  onClose,
  onChange,
  onCapture,
}) {
  if (!camera?.isPerspectiveCamera || !canvas?.addEventListener)
    throw new TypeError("Photo mode requires a perspective camera and canvas.");
  let opened = false,
    disposed = false,
    dirty = false,
    saved = null;
  let drag = null,
    previousFocus = null,
    captureRequest = 0;
  let previousCursor = "",
    previousTouchAction = "";
  const target = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const previousQuaternion = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  let colliders = [];
  let bounds = null,
    initial = null;
  let distance = 5.4,
    elevation = 0.24,
    azimuth = 0,
    fov = 58;
  let grid = false,
    controlsHidden = false,
    capturing = false,
    preset = "free";

  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  const panel = document.createElement("section");
  panel.id = "photo-panel";
  panel.className = "photo-mode";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "photo-mode-title");
  panel.innerHTML = `<div class="pm-grid" hidden aria-hidden="true"><i></i><i></i><i></i><i></i></div><header class="pm-header"><div class="pm-heading"><small>TOMATO REPUBLIC · A TUA PERSPETIVA</small><h2 id="photo-mode-title">Modo fotografia</h2><p>Arrasta o cenário para enquadrar. A cidade e o tempo estão em pausa.</p></div><button type="button" class="pm-close" id="photo-close" data-photo-action="close" aria-label="Sair do modo fotografia e voltar ao jogo">Voltar · V</button></header><section class="pm-controls" aria-label="Composição da fotografia"><p class="pm-label">ESCOLHE O ENQUADRAMENTO</p><nav class="pm-presets" aria-label="Perspetivas da câmara"><button type="button" data-photo-preset="free" aria-pressed="true">Livre</button><button type="button" data-photo-preset="front" aria-pressed="false">Frente</button><button type="button" data-photo-preset="side" aria-pressed="false">Lateral</button><button type="button" data-photo-preset="aerial" aria-pressed="false">Aérea</button></nav><label class="pm-slider"><span>Distância <output data-photo-value="distance"></output></span><input type="range" min="2" max="22" step="0.1" id="photo-distance" data-photo-control="distance" aria-label="Distância da câmara em metros"></label><label class="pm-slider"><span>Campo de visão <output data-photo-value="fov"></output></span><input type="range" min="25" max="80" step="1" id="photo-fov" data-photo-control="fov" aria-label="Campo de visão em graus"></label><label class="pm-slider"><span>Elevação <output data-photo-value="elevation"></output></span><input type="range" min="-0.05" max="1.1" step="0.01" id="photo-elevation" data-photo-control="elevation" aria-label="Elevação da câmara"></label><label class="pm-check"><input type="checkbox" id="photo-grid" data-photo-control="grid">Grelha de composição</label><div class="pm-actions"><button type="button" class="pm-capture" id="photo-capture" data-photo-action="capture">Guardar PNG</button><button type="button" data-photo-action="close">Voltar</button></div><p class="pm-status" role="status" aria-live="polite"></p><p class="pm-shortcuts">Arrastar · rodar &nbsp; Roda · aproximar<br>Setas · enquadrar &nbsp; H · controlos &nbsp; V / Esc · voltar</p></section><button type="button" class="pm-toggle" id="photo-hide" data-photo-action="toggle" aria-pressed="false">Ocultar controlos · H</button>`;
  (document.getElementById("arena") || document.body).append(panel);
  const $ = (selector) => panel.querySelector(selector);
  const closeButton = $(".pm-close"),
    captureButton = $(".pm-capture");
  const toggleButton = $(".pm-toggle"),
    gridElement = $(".pm-grid");
  const status = $(".pm-status");
  const controls = {
    distance: $('[data-photo-control="distance"]'),
    fov: $('[data-photo-control="fov"]'),
    elevation: $('[data-photo-control="elevation"]'),
    grid: $('[data-photo-control="grid"]'),
  };
  captureButton.disabled = typeof onCapture !== "function";

  function getState() {
    return {
      open: opened,
      distance,
      elevation,
      azimuth,
      fov,
      preset,
      grid,
      controlsHidden,
      capturing,
      target: { x: target.x, y: target.y, z: target.z },
      cameraPosition: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      bounds: bounds ? { ...bounds } : null,
    };
  }
  function syncControls() {
    controls.distance.value = String(distance);
    controls.fov.value = String(fov);
    controls.elevation.value = String(elevation);
    controls.grid.checked = grid;
    $('[data-photo-value="distance"]').textContent = `${distance.toFixed(1)} m`;
    $('[data-photo-value="fov"]').textContent = `${Math.round(fov)}°`;
    $('[data-photo-value="elevation"]').textContent =
      `${Math.round((elevation * 180) / Math.PI)}°`;
    for (const button of panel.querySelectorAll("[data-photo-preset]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.photoPreset === preset),
      );
    panel.dataset.minimal = String(controlsHidden);
    gridElement.hidden = !grid;
    toggleButton.textContent = controlsHidden
      ? "Mostrar controlos · H"
      : "Ocultar controlos · H";
    toggleButton.setAttribute("aria-pressed", String(controlsHidden));
  }
  function changed(cameraChanged = true) {
    if (cameraChanged) dirty = true;
    syncControls();
    onChange?.(getState());
  }
  function endDrag() {
    if (!drag) return;
    const id = drag.id;
    drag = null;
    if (canvas.hasPointerCapture?.(id)) {
      try {
        canvas.releasePointerCapture(id);
      } catch {}
    }
    if (opened) canvas.style.cursor = "grab";
  }
  function normalizeBounds(value) {
    if (
      !value ||
      ![value.minX, value.maxX, value.minZ, value.maxZ].every(
        Number.isFinite,
      ) ||
      value.maxX <= value.minX ||
      value.maxZ <= value.minZ
    )
      return null;
    return {
      minX: value.minX,
      maxX: value.maxX,
      minZ: value.minZ,
      maxZ: value.maxZ,
    };
  }
  function open({
    target: point,
    vehicle = false,
    bounds: worldBounds,
    colliders: worldColliders,
  } = {}) {
    if (disposed || opened) return false;
    saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
    };
    previousFocus = document.activeElement;
    previousCursor = canvas.style.cursor;
    previousTouchAction = canvas.style.touchAction;
    target.set(
      finite(point?.x, 0),
      finite(point?.y, 0) + 1.2,
      finite(point?.z, 0),
    );
    bounds = normalizeBounds(worldBounds);
    colliders = Array.isArray(worldColliders) ? worldColliders : [];
    offset.copy(camera.position).sub(target);
    const length = offset.length();
    distance = clamp(length || (vehicle ? 8.8 : 5.4), 2, 22);
    elevation = clamp(
      length ? Math.asin(clamp(offset.y / length, -1, 1)) : 0.24,
      -0.05,
      1.1,
    );
    azimuth = length ? Math.atan2(offset.x, offset.z) : 0;
    fov = clamp(finite(camera.fov, 58), 25, 80);
    initial = { azimuth, elevation, distance, vehicle: !!vehicle };
    preset = "free";
    grid = controlsHidden = capturing = false;
    captureRequest++;
    status.textContent = "";
    captureButton.disabled = typeof onCapture !== "function";
    opened = true;
    panel.hidden = false;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    changed();
    closeButton.focus({ preventScroll: true });
    return true;
  }
  function restoreFocus() {
    const visible =
      previousFocus?.isConnected &&
      !panel.contains(previousFocus) &&
      previousFocus.getClientRects?.().length &&
      !previousFocus.closest?.("[hidden],[inert]");
    if (visible) previousFocus.focus?.({ preventScroll: true });
    else if (canvas.isConnected) {
      if (!canvas.hasAttribute("tabindex"))
        canvas.setAttribute("tabindex", "-1");
      canvas.focus?.({ preventScroll: true });
    }
  }
  function close({ notify = true } = {}) {
    if (!opened) return false;
    opened = false;
    endDrag();
    dirty = false;
    captureRequest++;
    capturing = false;
    panel.hidden = true;
    canvas.style.cursor = previousCursor;
    canvas.style.touchAction = previousTouchAction;
    if (saved) {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    colliders = [];
    restoreFocus();
    onChange?.(getState());
    if (notify) onClose?.();
    return true;
  }
  function update() {
    if (!opened || !dirty || disposed) return false;
    dirty = false;
    previousPosition.copy(camera.position);
    previousQuaternion.copy(camera.quaternion);
    const previousFov = camera.fov;
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(
      target.x + Math.sin(azimuth) * horizontal,
      Math.max(0.25, target.y + Math.sin(elevation) * distance),
      target.z + Math.cos(azimuth) * horizontal,
    );
    if (bounds) {
      const mx = Math.min(0.25, (bounds.maxX - bounds.minX) / 20);
      const mz = Math.min(0.25, (bounds.maxZ - bounds.minZ) / 20);
      camera.position.x = clamp(
        camera.position.x,
        bounds.minX + mx,
        bounds.maxX - mx,
      );
      camera.position.z = clamp(
        camera.position.z,
        bounds.minZ + mz,
        bounds.maxZ - mz,
      );
    }
    if (colliders.length) {
      const position = cameraBoomPosition(
        target,
        camera.position,
        colliders,
        0.2,
      );
      camera.position.set(position.x, position.y, position.z);
    }
    camera.lookAt(target);
    camera.fov = fov;
    if (previousFov !== fov) camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return (
      previousPosition.distanceToSquared(camera.position) > 1e-12 ||
      1 - Math.abs(previousQuaternion.dot(camera.quaternion)) > 1e-12 ||
      previousFov !== fov
    );
  }
  function selectPreset(id) {
    if (!initial) return;
    preset = id;
    azimuth = initial.azimuth;
    elevation = initial.elevation;
    distance = initial.distance;
    if (id === "front") azimuth += Math.PI;
    else if (id === "side") azimuth += Math.PI / 2;
    else if (id === "aerial") {
      elevation = 1.05;
      distance = clamp(
        Math.max(initial.distance, initial.vehicle ? 15 : 12),
        2,
        22,
      );
    }
    changed();
  }
  function toggleControls() {
    controlsHidden = !controlsHidden;
    changed(false);
    toggleButton.focus({ preventScroll: true });
  }
  async function capture() {
    if (!opened || capturing || typeof onCapture !== "function") return;
    const request = ++captureRequest;
    capturing = true;
    captureButton.disabled = true;
    status.textContent = "A preparar a fotografia…";
    update();
    try {
      const result = await onCapture();
      if (request !== captureRequest || disposed) return;
      status.textContent =
        result === false || result?.ok === false
          ? result?.message || "Não foi possível preparar a fotografia."
          : typeof result === "string"
            ? result
            : result?.message || "Fotografia PNG preparada para descarregar.";
    } catch (error) {
      if (request === captureRequest && !disposed)
        status.textContent =
          error?.message || "Não foi possível preparar a fotografia.";
    } finally {
      if (request === captureRequest && !disposed) {
        capturing = false;
        captureButton.disabled = false;
      }
    }
  }
  function onPanelClick(event) {
    if (!opened) return;
    const presetButton = event.target.closest?.("[data-photo-preset]");
    if (presetButton) {
      selectPreset(presetButton.dataset.photoPreset);
      return;
    }
    const action = event.target.closest?.("[data-photo-action]")?.dataset
      .photoAction;
    if (action === "close") close();
    else if (action === "toggle") toggleControls();
    else if (action === "capture") capture();
  }
  function onPanelInput(event) {
    if (!opened) return;
    const name = event.target.dataset?.photoControl;
    if (name === "grid") {
      grid = event.target.checked;
      changed(false);
      return;
    }
    if (name === "distance")
      distance = clamp(finite(event.target.value, distance), 2, 22);
    else if (name === "fov")
      fov = clamp(finite(event.target.value, fov), 25, 80);
    else if (name === "elevation")
      elevation = clamp(finite(event.target.value, elevation), -0.05, 1.1);
    else return;
    preset = "free";
    changed();
  }
  function onPointerDown(event) {
    if (
      !opened ||
      drag ||
      (event.pointerType !== "touch" && event.button !== 0)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    canvas.style.cursor = "grabbing";
    canvas.focus?.({ preventScroll: true });
  }
  function onPointerMove(event) {
    if (!opened || !drag || event.pointerId !== drag.id) return;
    event.preventDefault();
    event.stopPropagation();
    azimuth -= (event.clientX - drag.x) * 0.006;
    elevation = clamp(elevation + (event.clientY - drag.y) * 0.004, -0.05, 1.1);
    drag.x = event.clientX;
    drag.y = event.clientY;
    preset = "free";
    changed();
  }
  function onPointerEnd(event) {
    if (!opened || !drag || event.pointerId !== drag.id) return;
    event.stopPropagation();
    endDrag();
  }
  function onWheel(event) {
    if (!opened) return;
    event.preventDefault();
    event.stopPropagation();
    const pixels =
      finite(event.deltaY, 0) *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1);
    distance = clamp(
      distance * Math.exp(clamp(pixels, -600, 600) * 0.0012),
      2,
      22,
    );
    preset = "free";
    changed();
  }
  function focusableControls() {
    return [
      ...panel.querySelectorAll("button:not(:disabled),input:not(:disabled)"),
    ].filter(
      (element) =>
        element.getClientRects().length && !element.closest("[hidden]"),
    );
  }
  function onKeyDown(event) {
    if (!opened) return;
    // Let native inputs handle their own editing, but prevent those events from
    // reaching the game's key handlers behind this paused mode.
    event.stopPropagation();
    const key = event.key.toLowerCase();
    const typing = event.target.closest?.(
      "input,textarea,select,[contenteditable='true']",
    );
    if (key === "escape" || (key === "v" && !typing)) {
      event.preventDefault();
      close();
      return;
    }
    if (key === "tab") {
      const list = focusableControls(),
        first = list[0],
        last = list.at(-1);
      if (!first) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (typing) return;
    if (key === "h") {
      event.preventDefault();
      if (!event.repeat) toggleControls();
      return;
    }
    if (!["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key))
      return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.12 : 0.045;
    if (key === "arrowleft") azimuth += amount;
    if (key === "arrowright") azimuth -= amount;
    if (key === "arrowup") elevation = clamp(elevation + amount, -0.05, 1.1);
    if (key === "arrowdown") elevation = clamp(elevation - amount, -0.05, 1.1);
    preset = "free";
    changed();
  }
  const onKeyUp = (event) => {
    if (opened) event.stopPropagation();
  };
  const onBlur = () => endDrag();
  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("input", onPanelInput);
  panel.addEventListener("change", onPanelInput);
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove, true);
  canvas.addEventListener("pointerup", onPointerEnd, true);
  canvas.addEventListener("pointercancel", onPointerEnd, true);
  canvas.addEventListener("lostpointercapture", onPointerEnd, true);
  canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);

  function dispose() {
    if (disposed) return;
    close({ notify: false });
    disposed = true;
    captureRequest++;
    panel.removeEventListener("click", onPanelClick);
    panel.removeEventListener("input", onPanelInput);
    panel.removeEventListener("change", onPanelInput);
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove, true);
    canvas.removeEventListener("pointerup", onPointerEnd, true);
    canvas.removeEventListener("pointercancel", onPointerEnd, true);
    canvas.removeEventListener("lostpointercapture", onPointerEnd, true);
    canvas.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    panel.remove();
    style.remove();
  }
  return { open, close, isOpen: () => opened, update, getState, dispose };
}

import * as THREE from "three";

const RESOLUTION = 128;
const REFRESH_SECONDS = 1.5;
const REFRESH_DISTANCE_SQUARED = 12 * 12;
const finitePoint = (point) =>
  point && [point.x, point.y ?? 0, point.z].every(Number.isFinite);

/**
 * A local HDR reflection probe for the vehicle being driven in high quality.
 * Each update renders at most one cube face. The completed cube is filtered
 * once and assigned only to reflective car materials; scene lighting stays on
 * the global environment and the probe never sees the car capturing itself.
 */
export function createVehicleReflections(renderer, scene) {
  let disposed = false;
  let rendering = false;
  let currentVehicle = null;
  let currentGroup = null;
  let failedGroup = null;
  let cubeTarget = null;
  let cubeCamera = null;
  let generator = null;
  let filteredTarget = null;
  let face = 0;
  let capturing = false;
  let elapsed = 0;
  let captures = 0;
  let facesRendered = 0;
  let errors = 0;
  let lastError = "";
  let currentQuality = "low";
  let reason = "idle";
  const boundMaterials = new Map();
  const position = new THREE.Vector3();
  const capturePosition = new THREE.Vector3();
  const lastCapturePosition = new THREE.Vector3();

  function reflective(material) {
    return (
      material?.isMeshStandardMaterial &&
      (material.isMeshPhysicalMaterial ||
        material.metalness >= 0.2 ||
        material.roughness <= 0.35)
    );
  }

  function restoreMaterials() {
    for (const [material, original] of boundMaterials) {
      material.envMap = original.envMap;
      material.needsUpdate = true;
    }
    boundMaterials.clear();
  }

  function release(reasonText = "reset") {
    restoreMaterials();
    filteredTarget?.dispose();
    filteredTarget = null;
    cubeTarget?.dispose();
    cubeTarget = null;
    generator?.dispose();
    generator = null;
    cubeCamera = null;
    currentVehicle = null;
    currentGroup = null;
    face = 0;
    capturing = false;
    elapsed = 0;
    reason = reasonText;
  }

  function reset() {
    if (rendering) return;
    release();
    failedGroup = null;
    lastError = "";
  }

  function bind(vehicle, group) {
    release("binding");
    currentVehicle = vehicle;
    currentGroup = group;
    group.traverse((object) => {
      for (const material of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []) {
        if (reflective(material) && !boundMaterials.has(material))
          boundMaterials.set(material, { envMap: material.envMap });
      }
    });
    if (!boundMaterials.size) {
      release("no-reflective-materials");
      return false;
    }
    cubeTarget = new THREE.WebGLCubeRenderTarget(RESOLUTION, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    cubeTarget.texture.name = "active-vehicle-local-radiance";
    cubeCamera = new THREE.CubeCamera(0.25, 1200, cubeTarget);
    cubeCamera.name = "active-vehicle-reflection-camera";
    cubeCamera.coordinateSystem = renderer.coordinateSystem;
    cubeCamera.updateCoordinateSystem();
    reason = "capturing";
    return true;
  }

  function beginCapture() {
    capturePosition.copy(position);
    capturePosition.y += 1.25;
    cubeCamera.position.copy(capturePosition);
    // This camera deliberately has no scene parent, so updating its world
    // matrix updates all six children without adding game-world objects.
    cubeCamera.updateMatrixWorld(true);
    face = 0;
    capturing = true;
    reason = "capturing";
  }

  function renderFace() {
    const target = renderer.getRenderTarget();
    const activeFace = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const xrEnabled = renderer.xr.enabled;
    const toneMapping = renderer.toneMapping;
    const exposure = renderer.toneMappingExposure;
    const autoClear = renderer.autoClear;
    const clearColor = renderer.autoClearColor;
    const clearDepth = renderer.autoClearDepth;
    const clearStencil = renderer.autoClearStencil;
    const scissorTest = renderer.getScissorTest();
    const currentViewport = renderer.getCurrentViewport?.(new THREE.Vector4());
    const context = target ? renderer.getContext?.() : null;
    const currentScissor = context
      ? new THREE.Vector4().fromArray(context.getParameter(context.SCISSOR_BOX))
      : target?.scissor?.clone();
    const currentScissorTest = context
      ? context.isEnabled(context.SCISSOR_TEST)
      : scissorTest;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const visible = currentGroup.visible;
    // setRenderTarget handles each target's own physical viewport/scissor.
    // Avoid setViewport here, which would change the caller's logical viewport
    // and incorrectly multiply probe dimensions by the display pixel ratio.
    try {
      currentGroup.visible = false;
      renderer.xr.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.autoClear = true;
      renderer.autoClearColor = true;
      renderer.autoClearDepth = true;
      renderer.autoClearStencil = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(cubeTarget, face, 0);
      renderer.setScissorTest(false);
      renderer.render(scene, cubeCamera.children[face]);
      facesRendered++;
      face++;
      if (face === 6) {
        // Convert the whole coherent cube, never a mix of old/unrendered faces.
        generator ||= new THREE.PMREMGenerator(renderer);
        const next = generator.fromCubemap(cubeTarget.texture);
        next.texture.name = "active-vehicle-local-reflections";
        const previous = filteredTarget;
        filteredTarget = next;
        for (const material of boundMaterials.keys()) {
          material.envMap = next.texture;
          material.needsUpdate = true;
        }
        previous?.dispose();
        captures++;
        lastCapturePosition.copy(capturePosition);
        lastCapturePosition.y -= 1.25;
        face = 0;
        capturing = false;
        elapsed = 0;
        reason = "ready";
      }
    } finally {
      currentGroup.visible = visible;
      renderer.xr.enabled = xrEnabled;
      renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = exposure;
      renderer.autoClear = autoClear;
      renderer.autoClearColor = clearColor;
      renderer.autoClearDepth = clearDepth;
      renderer.autoClearStencil = clearStencil;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setScissorTest(scissorTest);
      if (target && currentViewport) {
        // A caller may have set a custom viewport while rendering to a target.
        // Restore that physical state without changing its stored target bounds
        // or the renderer's separate logical canvas viewport/scissor settings.
        const targetViewport = target.viewport.clone();
        const targetScissor = target.scissor.clone();
        const targetScissorTest = target.scissorTest;
        try {
          target.viewport.copy(currentViewport);
          if (currentScissor) target.scissor.copy(currentScissor);
          target.scissorTest = currentScissorTest;
          renderer.setRenderTarget(target, activeFace, mip);
        } finally {
          target.viewport.copy(targetViewport);
          target.scissor.copy(targetScissor);
          target.scissorTest = targetScissorTest;
        }
      } else renderer.setRenderTarget(target, activeFace, mip);
    }
  }

  function update(dt, vehicle, quality) {
    if (disposed || rendering) return;
    currentQuality = quality;
    const group = vehicle?.actor?.group || vehicle?.group;
    if (quality !== "high" || !group?.isObject3D) {
      if (currentGroup || cubeTarget)
        release(quality !== "high" ? "quality" : "on-foot");
      failedGroup = null;
      return;
    }
    if (failedGroup === group) return;
    try {
      group.getWorldPosition(position);
      if (!finitePoint(position)) {
        release("invalid-position");
        return;
      }
      if (vehicle !== currentVehicle || group !== currentGroup) {
        failedGroup = null;
        lastError = "";
        if (!bind(vehicle, group)) return;
        beginCapture();
      }
      elapsed += Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1)) : 0;
      if (
        !capturing &&
        (elapsed >= REFRESH_SECONDS ||
          position.distanceToSquared(lastCapturePosition) >=
            REFRESH_DISTANCE_SQUARED)
      )
        beginCapture();
      if (!capturing) return;
      rendering = true;
      renderFace();
    } catch (error) {
      errors++;
      lastError = String(error?.message || error);
      release("capture-failed");
      // A broken context/material should not throw and retry on every frame.
      failedGroup = group;
    } finally {
      rendering = false;
    }
  }

  function dispose() {
    if (disposed || rendering) return;
    release("disposed");
    failedGroup = null;
    disposed = true;
  }

  return {
    update,
    reset,
    dispose,
    getState: () => ({
      enabled: !!currentGroup && currentQuality === "high" && !disposed,
      capturing,
      faces: face,
      facesRendered,
      captures,
      resolution: RESOLUTION,
      materials: boundMaterials.size,
      quality: currentQuality,
      reason,
      error: lastError,
      errors,
      vehicleId: currentVehicle?.ownershipId || currentGroup?.name || null,
      position: currentGroup
        ? { x: capturePosition.x, y: capturePosition.y, z: capturePosition.z }
        : null,
    }),
  };
}

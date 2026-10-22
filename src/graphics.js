import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// A locally generated HDR-like sky is filtered into a specular environment map.
// Its small dimensions keep startup predictable even without a hardware GPU.
function createReflectionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#7198bc");
  gradient.addColorStop(0.3, "#b3cbd9");
  gradient.addColorStop(0.48, "#e2dbca");
  gradient.addColorStop(0.52, "#aaa88d");
  gradient.addColorStop(0.68, "#666c58");
  gradient.addColorStop(1, "#353d33");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 256);
  let seed = 15417;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 26; index++) {
    const x = random() * 512;
    const y = 35 + random() * 65;
    const radius = 18 + random() * 42;
    const cloud = context.createRadialGradient(x, y, 1, x, y, radius);
    cloud.addColorStop(0, "rgba(247,245,228,.14)");
    cloud.addColorStop(1, "rgba(247,245,228,0)");
    context.fillStyle = cloud;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const sunlight = context.createRadialGradient(195, 82, 0, 195, 82, 65);
  sunlight.addColorStop(0, "rgba(255,246,211,.95)");
  sunlight.addColorStop(0.1, "rgba(255,246,211,.72)");
  sunlight.addColorStop(0.4, "rgba(255,238,195,.16)");
  sunlight.addColorStop(1, "rgba(255,238,195,0)");
  context.fillStyle = sunlight;
  context.fillRect(125, 12, 140, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.name = "local-mediterranean-reflection-sky";
  return texture;
}

/**
 * Owns global lighting and the rendering pipeline, independently of map assets.
 * Medium/low draw one scene pass. High adds screen-space contact occlusion.
 */
export function createVisuals(renderer, scene, camera, quality = "medium") {
  const previous = {
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    fog: scene.fog,
  };
  let currentQuality;
  let composer = null;
  let passes = [];
  let width = Math.max(1, renderer.domElement.clientWidth || 800);
  let height = Math.max(1, renderer.domElement.clientHeight || 600);
  let lastDay = -1;
  let disposed = false;
  const focus = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const sunDirection = new THREE.Vector3();
  const reflectionSource = createReflectionTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflection = pmrem.fromEquirectangular(reflectionSource);
  pmrem.dispose();
  reflectionSource.dispose();
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.48;
  scene.background = new THREE.Color(0xc0d0d4);
  const haze = new THREE.Fog(0xc0d0d4, 130, 1450);
  scene.fog = haze;

  const sky = new Sky();
  sky.name = "atmospheric-sky";
  sky.scale.setScalar(4500);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.material.depthTest = false;
  // The sky follows the observer; project at the far plane so it never clips.
  sky.material.vertexShader = sky.material.vertexShader.replace(
    "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n gl_Position.z = gl_Position.w;",
  );
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "normalize( vWorldPosition )",
    "normalize( vWorldPosition - cameraPosition )",
  );
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 2.3;
  skyUniforms.rayleigh.value = 1.15;
  skyUniforms.mieCoefficient.value = 0.0045;
  skyUniforms.mieDirectionalG.value = 0.82;
  scene.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xd5e4ef, 0x7d7864, 1.35);
  hemisphere.name = "soft-hemisphere-daylight";
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe5bd, 3.05);
  sun.name = "follow-sun";
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00006;
  sun.shadow.radius = 2.5;
  Object.assign(sun.shadow.camera, { near: 1, far: 620 });
  scene.add(sun, sun.target);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  function releasePipeline() {
    for (const pass of passes) {
      // The SSAO implementation leaves these two resources to its caller.
      if (pass instanceof SSAOPass) {
        pass.noiseTexture?.dispose();
        pass.ssaoMaterial?.dispose();
      }
      pass.dispose?.();
    }
    passes = [];
    composer?.dispose();
    composer = null;
  }

  function configurePipeline() {
    releasePipeline();
    if (currentQuality !== "high") return;
    composer = new EffectComposer(renderer);
    const beauty = new RenderPass(scene, camera);
    const occlusion = new SSAOPass(scene, camera, width, height, 16);
    occlusion.kernelRadius = 1.7;
    occlusion.minDistance = 0.00002;
    occlusion.maxDistance = 0.0025;
    occlusion.ssaoMaterial.fragmentShader =
      occlusion.ssaoMaterial.fragmentShader.replace(
        "1.0 - occlusion",
        "1.0 - occlusion * 0.4",
      );
    const output = new OutputPass();
    passes = [beauty, occlusion, output];
    passes.forEach((pass) => composer.addPass(pass));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }

  function setQuality(value) {
    const next = ["low", "medium", "high"].includes(value) ? value : "medium";
    if (next === currentQuality) return;
    currentQuality = next;
    renderer.shadowMap.enabled = next !== "low";
    sun.castShadow = next !== "low";
    const size = next === "high" ? 2048 : 1024;
    const span = next === "high" ? 95 : 78;
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, {
      left: -span,
      right: span,
      top: span,
      bottom: -span,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.needsUpdate = true;
    configurePipeline();
  }

  function update(dt = 0, focusPosition = focus, day = 1) {
    if (disposed) return;
    if (
      Number.isFinite(focusPosition?.x) &&
      Number.isFinite(focusPosition?.z)
    ) {
      focus.set(focusPosition.x, 0, focusPosition.z);
    }
    const dayNumber = Number(day);
    const calendarDay = Number.isFinite(dayNumber)
      ? Math.max(1, Math.floor(dayNumber))
      : 1;
    if (calendarDay !== lastDay) {
      lastDay = calendarDay;
      // Each business day has a stable, slightly different late-afternoon sky.
      const elevation = 28 + Math.sin(calendarDay * 1.618) * 6;
      const azimuth = 224 + Math.sin(calendarDay * 0.71) * 12;
      sunDirection.setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(90 - elevation),
        THREE.MathUtils.degToRad(azimuth),
      );
      skyUniforms.sunPosition.value.copy(sunDirection).multiplyScalar(400000);
      const warmth = (elevation - 22) / 12;
      sun.color.setRGB(1, 0.84 + warmth * 0.06, 0.65 + warmth * 0.12);
    }
    // Quantization reduces shadow-map shimmer while traversing the kilometre city.
    sun.target.position.set(
      Math.round(focus.x * 2) / 2,
      5,
      Math.round(focus.z * 2) / 2,
    );
    direction.copy(sunDirection).multiplyScalar(290);
    sun.position.copy(sun.target.position).add(direction);
    sky.position.copy(camera.position);
  }

  function resize(newWidth, newHeight) {
    width = Math.max(1, Math.round(newWidth));
    height = Math.max(1, Math.round(newHeight));
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
  }

  function render() {
    if (disposed) return;
    sky.position.copy(camera.position);
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    releasePipeline();
    sky.removeFromParent();
    sky.geometry.dispose();
    sky.material.dispose();
    sun.removeFromParent();
    sun.target.removeFromParent();
    sun.shadow.map?.dispose();
    hemisphere.removeFromParent();
    reflection.dispose();
    if (scene.environment === reflection.texture) {
      scene.background = previous.background;
      scene.environment = previous.environment;
      scene.environmentIntensity = previous.environmentIntensity;
      scene.fog = previous.fog;
    }
  }

  setQuality(quality);
  update(0, focus, 1);
  return { update, render, resize, setQuality, dispose };
}

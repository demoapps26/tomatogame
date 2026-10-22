import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Tileable, original cloud density. A single small map supplies the sky shader;
// there are no layers of transparent geometry or frame-by-frame noise passes.
function createCloudTexture() {
  const size = 256;
  const values = new Uint8Array(size * size * 4);
  const smooth = (v) => v * v * (3 - 2 * v);
  const hash = (x, y) => {
    let seed = Math.imul(x + 917, 374761393) ^ Math.imul(y + 123, 668265263);
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    return ((seed ^ (seed >>> 16)) >>> 0) / 4294967295;
  };
  function noise(x, y, period) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = smooth(x - ix),
      fy = smooth(y - iy);
    const a = hash(ix % period, iy % period);
    const b = hash((ix + 1) % period, iy % period);
    const c = hash(ix % period, (iy + 1) % period);
    const d = hash((ix + 1) % period, (iy + 1) % period);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(a, b, fx),
      THREE.MathUtils.lerp(c, d, fx),
      fy,
    );
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let density = 0,
        weight = 0,
        amplitude = 0.55;
      for (let period = 4; period <= 64; period *= 2) {
        density +=
          noise((x / size) * period, (y / size) * period, period) * amplitude;
        weight += amplitude;
        amplitude *= 0.52;
      }
      const index = (y * size + x) * 4;
      values[index] =
        values[index + 1] =
        values[index + 2] =
          Math.round((density / weight) * 255);
      values[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(values, size, size, THREE.RGBAFormat);
  texture.name = "local-soft-cloud-density";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// Linear-light correction before the display transform. This deliberately stays
// restrained: shadow colours remain readable and white walls keep their detail.
const cinemaGrade = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 colour = max(source.rgb, vec3(0.0));
      float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
      colour = mix(vec3(luminance), colour, 0.97);
      float shadows = 1.0 - smoothstep(0.03, 0.55, luminance);
      colour *= mix(vec3(1.008, 1.0, 0.982), vec3(0.965, 0.992, 1.025), shadows * 0.42);
      colour = max(vec3(0.0), (colour - 0.18) * 1.035 + 0.18);
      float vignette = smoothstep(0.24, 0.88, length((vUv - 0.5) * vec2(1.0, 0.8)));
      colour *= 1.0 - vignette * 0.055;
      gl_FragColor = vec4(colour, source.a);
    }`,
};

// A locally generated HDR-like sky is filtered into a specular environment map.
// Its small dimensions keep startup predictable even without a hardware GPU.
function createReflectionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#6898c9");
  gradient.addColorStop(0.3, "#a9c9df");
  gradient.addColorStop(0.48, "#e0e4df");
  gradient.addColorStop(0.52, "#a7ad9c");
  gradient.addColorStop(0.68, "#626b5d");
  gradient.addColorStop(1, "#313b35");
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
  let skyTime = 0;
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
  scene.environmentIntensity = 0.62;
  scene.background = new THREE.Color(0xbacfd9);
  const haze = new THREE.Fog(0xbacfd9, 230, 2250);
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
  const clouds = createCloudTexture();
  skyUniforms.cloudDensityMap = { value: clouds };
  skyUniforms.cloudTime = { value: 0 };
  skyUniforms.cloudAmount = { value: 0.74 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace(
      "uniform float mieDirectionalG;",
      `uniform float mieDirectionalG;
      uniform sampler2D cloudDensityMap;
      uniform float cloudTime;
      uniform float cloudAmount;`,
    )
    .replace(
      "gl_FragColor = vec4( retColor, 1.0 );",
      `
      // The analytic sky radiance is much brighter than the local material
      // exposure. Shape it separately so midday blues retain colour instead of
      // clipping to a white sheet while buildings keep their correct exposure.
      float skyHorizon = pow(1.0 - clamp(direction.y, 0.0, 1.0), 3.0);
      vec3 skyBlue = mix(vec3(0.055, 0.18, 0.39), vec3(0.60, 0.73, 0.82), skyHorizon);
      retColor = mix(skyBlue, retColor * 0.16, 0.22);
      retColor += vec3(3.0, 2.4, 1.6) * smoothstep(0.9997, 0.99995, cosTheta);
      // A projected cloud deck has perspective, sun-facing edges and soft bases.
      // At the horizon it dissolves into the same aerial haze as the landscape.
      vec2 cloudUv = direction.xz / max(direction.y + 0.10, 0.065) * 0.055;
      cloudUv += vec2(0.23, 0.59) + vec2(cloudTime * 0.00042, cloudTime * 0.00011);
      float cloudNoise = texture2D(cloudDensityMap, cloudUv).r;
      float cloudMask = smoothstep(0.47, 0.66, cloudNoise);
      float cloudBase = smoothstep(0.49, 0.72, cloudNoise);
      float sunEdge = texture2D(cloudDensityMap, cloudUv + vSunDirection.xz * 0.012).r;
      float silver = clamp((cloudNoise - sunEdge) * 5.0, 0.0, 1.0);
      vec3 cloudColour = mix(vec3(0.81, 0.93, 1.07), vec3(1.7, 1.67, 1.56), 0.76 - cloudBase * 0.43 + silver * 0.30);
      float horizonFade = smoothstep(0.025, 0.24, direction.y);
      retColor = mix(retColor, cloudColour, cloudMask * horizonFade * cloudAmount);
      gl_FragColor = vec4(retColor, 1.0);`,
    );
  skyUniforms.turbidity.value = 2.6;
  skyUniforms.rayleigh.value = 2.05;
  skyUniforms.mieCoefficient.value = 0.0035;
  skyUniforms.mieDirectionalG.value = 0.82;
  scene.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xc2dcf1, 0x777964, 0.88);
  hemisphere.name = "soft-hemisphere-daylight";
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffedda, 3.35);
  sun.name = "follow-sun";
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.000035;
  sun.shadow.radius = 2.0;
  Object.assign(sun.shadow.camera, { near: 1, far: 720 });
  scene.add(sun, sun.target);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
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
    occlusion.kernelRadius = 1.3;
    occlusion.minDistance = 0.00002;
    occlusion.maxDistance = 0.0025;
    occlusion.ssaoMaterial.fragmentShader =
      occlusion.ssaoMaterial.fragmentShader.replace(
        "1.0 - occlusion",
        "1.0 - occlusion * 0.36",
      );
    const output = new OutputPass();
    const grade = new ShaderPass(cinemaGrade);
    passes = [beauty, occlusion, grade, output];
    passes.forEach((pass) => composer.addPass(pass));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }

  function setQuality(value) {
    const next = ["low", "medium", "high"].includes(value) ? value : "medium";
    if (next === currentQuality) return;
    currentQuality = next;
    skyUniforms.cloudAmount.value = next === "low" ? 0.48 : 0.74;
    renderer.shadowMap.enabled = next !== "low";
    sun.castShadow = next !== "low";
    const size = next === "high" ? 2048 : 1024;
    const span = next === "high" ? 78 : 64;
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
    skyTime += Math.max(0, Math.min(0.1, Number(dt) || 0));
    skyUniforms.cloudTime.value = skyTime;
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
      const elevation = 35 + Math.sin(calendarDay * 1.618) * 6;
      const azimuth = 224 + Math.sin(calendarDay * 0.71) * 12;
      sunDirection.setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(90 - elevation),
        THREE.MathUtils.degToRad(azimuth),
      );
      skyUniforms.sunPosition.value.copy(sunDirection).multiplyScalar(400000);
      const warmth = THREE.MathUtils.clamp((elevation - 29) / 12, 0, 1);
      sun.color.setRGB(1, 0.91 + warmth * 0.035, 0.79 + warmth * 0.07);
      const hazeColour = new THREE.Color(0xbacfd9).lerp(
        new THREE.Color(0xc6d2d5),
        (1 - warmth) * 0.22,
      );
      haze.color.copy(hazeColour);
      scene.background.copy(hazeColour);
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
    clouds.dispose();
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

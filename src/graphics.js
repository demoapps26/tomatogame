import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { PHOTO_ENVIRONMENT, PHOTO_ENVIRONMENT_META } from "./photo-assets.js";

/** Decode the bundled CC0 radiance panorama without issuing a network request. */
function photographicEnvironment() {
  const bytes = PHOTO_ENVIRONMENT;
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const parsed = new HDRLoader().parse(buffer);
  const texture = new THREE.DataTexture(
    parsed.data,
    parsed.width,
    parsed.height,
    THREE.RGBAFormat,
    parsed.type,
  );
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
  texture.name = "bundled-photographic-daylight-panorama";

  // Derive the sun from the actual sky, rather than lighting from a direction
  // unrelated to the photograph. Ignore the city/ground portion of the panorama.
  let brightest = -1;
  const sunDirection = new THREE.Vector3(-0.58, 0.73, -0.36).normalize();
  const value = (index) =>
    parsed.type === THREE.HalfFloatType
      ? THREE.DataUtils.fromHalfFloat(parsed.data[index])
      : parsed.data[index];
  for (let y = 1; y < parsed.height * 0.47; y++) {
    for (let x = 0; x < parsed.width; x++) {
      const index = (y * parsed.width + x) * 4;
      const luminance =
        value(index) * 0.2126 +
        value(index + 1) * 0.7152 +
        value(index + 2) * 0.0722;
      if (luminance > brightest) {
        brightest = luminance;
        const latitude = Math.PI * (0.5 - (y + 0.5) / parsed.height);
        const longitude = Math.PI * 2 * ((x + 0.5) / parsed.width - 0.5);
        sunDirection.set(
          Math.cos(latitude) * Math.cos(longitude),
          Math.sin(latitude),
          Math.cos(latitude) * Math.sin(longitude),
        );
      }
    }
  }
  return { texture, sunDirection };
}

/**
 * A sky with directional atmospheric colour and a few analytic cloud layers.
 * The photographic panorama remains the source of image-based lighting. Only
 * its clean upper cap can enter the visible sky, so photographed poles and
 * buildings never appear on the game's horizon.
 */
function createAtmosphericSky(texture, haze, solarDirection) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    defines: { SKY_DETAIL: 2 },
    uniforms: {
      panorama: { value: texture },
      hazeColour: { value: haze.color },
      skyExposure: { value: 0.84 },
      daylight: { value: 1 },
      cloudiness: { value: 0 },
      rain: { value: 0 },
      atmosphereTime: { value: 0 },
      solarDirection: { value: solarDirection.clone() },
      keyDirection: { value: solarDirection.clone() },
      twilight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D panorama;
      uniform vec3 hazeColour;
      uniform float skyExposure;
      uniform float daylight;
      uniform float cloudiness;
      uniform float rain;
      uniform float atmosphereTime;
      uniform vec3 solarDirection;
      uniform vec3 keyDirection;
      uniform float twilight;
      varying vec3 vDirection;

      float skyHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float skyNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
                   mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0)), f.x), f.y);
      }
      float cloudField(vec2 p) {
        float field = skyNoise(p) * 0.57;
        p = mat2(1.64, 1.16, -1.16, 1.64) * p + vec2(7.7, -2.3);
        field += skyNoise(p) * 0.29;
        #if SKY_DETAIL > 1
          p = mat2(1.71, -1.04, 1.04, 1.71) * p + vec2(4.3, 9.2);
          field += skyNoise(p) * 0.14;
          // A small fourth octave breaks the lobes and their silhouette rather
          // than adding screen-space grain. World-space motion stays smooth.
          p = mat2(1.62, 1.17, -1.17, 1.62) * p + vec2(-8.1, 3.4);
          field = (field + skyNoise(p) * 0.07) / 1.07;
        #else
          field /= 0.86;
        #endif
        return field;
      }
      void main() {
        vec3 direction = normalize(vDirection);
        float height = max(direction.y, 0.0);
        float horizon = pow(1.0 - height, 3.0);
        float sunDot = max(0.0, dot(direction, solarDirection));
        float sunHalo = pow(sunDot, 18.0);
        // Rayleigh-like blue overhead; longer paths through haze near the horizon.
        vec3 zenith = vec3(0.105, 0.225, 0.425);
        vec3 dayColour = mix(zenith, hazeColour, pow(1.0 - height, 4.2));
        vec2 photoUv = vec2(atan(direction.z, direction.x) * 0.159154943 + 0.5,
                            asin(clamp(direction.y, -1.0, 1.0)) * 0.318309886 + 0.5);
        // The original sky is sampled at its real angle, never stretched down to street level.
        if (direction.y > 0.83) {
          vec3 photographed = texture2D(panorama, photoUv).rgb * skyExposure;
          dayColour = mix(dayColour, photographed, smoothstep(0.83, 0.98, direction.y) * 0.32);
        }
        float sunsetGlow = twilight * pow(sunDot, 3.0) * pow(1.0 - height, 1.8);
        dayColour = mix(dayColour, vec3(0.76, 0.30, 0.115), sunsetGlow * 0.78);
        dayColour += vec3(0.27, 0.18, 0.095) * sunHalo * daylight * (1.0 - cloudiness) * 0.18;
        dayColour = mix(dayColour, vec3(0.30, 0.36, 0.42), cloudiness * 0.45 + rain * 0.15);

        // Perspective cloud sheets. Neighbouring density in the key-light
        // direction supplies soft shaded bases and lit lobes without raymarching.
        vec2 wind = vec2(atmosphereTime * 0.0017, atmosphereTime * 0.00052);
        vec2 cloudUv = direction.xz / max(0.13, direction.y + 0.045) * 1.18 + wind + vec2(2.3, -0.7);
        float density = cloudField(cloudUv);
        vec2 lightAxis = keyDirection.xz / max(length(keyDirection.xz), 0.1);
        float neighbouring = cloudField(cloudUv + lightAxis * 0.24 + vec2(0.035, -0.02));
        float threshold = 0.665 - cloudiness * 0.25 - rain * 0.065;
        #if SKY_DETAIL > 1
          threshold -= 0.025;
          // Defined cloud edges with a derivative-aware minimum feather. The
          // distant horizon stays stable instead of turning into noisy pixels.
          float cloudFeather = max(0.018, fwidth(density) * 1.25);
          float cloudAlpha = smoothstep(threshold - 0.02 - cloudFeather, threshold + 0.035 + cloudFeather, density);
          float lightSide = clamp(0.48 + (density - neighbouring) * 6.0, 0.0, 1.0);
          float cloudTop = smoothstep(threshold - 0.025, threshold + 0.105, density);
        #else
          float cloudAlpha = smoothstep(threshold - 0.085, threshold + 0.115, density);
          float lightSide = clamp(0.48 + (density - neighbouring) * 4.1, 0.0, 1.0);
          float cloudTop = smoothstep(threshold - 0.02, threshold + 0.20, density);
        #endif
        cloudAlpha *= smoothstep(-0.015, 0.11, direction.y) * (0.84 + cloudiness * 0.13);
        float cloudEdge = 1.0 - smoothstep(threshold + 0.005, threshold + 0.12, density);
        vec3 cloudShade = vec3(0.255, 0.30, 0.36);
        vec3 cloudLight = mix(vec3(0.91, 0.94, 0.94), vec3(1.2, 0.65, 0.31), twilight * 0.78);
        #if SKY_DETAIL > 1
          vec3 cloudColour = mix(cloudShade, cloudLight, lightSide * 0.68 + cloudTop * 0.25);
        #else
          vec3 cloudColour = mix(cloudShade, cloudLight, lightSide * 0.72 + cloudTop * 0.18);
        #endif
        cloudColour += cloudLight * cloudEdge * pow(sunDot, 12.0) * (0.32 + twilight * 0.28);
        cloudColour *= 1.0 - rain * 0.36;
        dayColour = mix(dayColour, cloudColour, cloudAlpha);
        #if SKY_DETAIL > 1
          // A thin, stretched high layer keeps a clear sky from looking like a blank dome.
          vec2 wispsUv = vec2(cloudUv.x * 0.46 + cloudUv.y * 0.13, cloudUv.y * 3.1) + vec2(8.7, 17.2);
          float wisps = smoothstep(0.65, 0.86, skyNoise(wispsUv));
          float highLayer = wisps * (1.0 - cloudAlpha) * (1.0 - rain) * smoothstep(0.04, 0.40, height) * 0.07;
          dayColour = mix(dayColour, cloudLight * 0.85, highLayer);
        #endif
        float sunVisibility = smoothstep(-0.025, 0.035, solarDirection.y) * daylight;
        float sunDisc = smoothstep(0.999975, 0.999990, sunDot);
        dayColour += mix(vec3(5.3, 4.8, 3.9), vec3(5.8, 2.7, 1.05), twilight) * sunDisc * sunVisibility * (1.0 - cloudAlpha * 0.98) * (1.0 - rain * 0.9);
        dayColour += vec3(0.15, 0.105, 0.057) * pow(sunDot, 100.0) * sunVisibility * (1.0 - cloudAlpha) * (1.0 - rain);

        vec3 nightColour = mix(vec3(0.003, 0.007, 0.016), vec3(0.024, 0.037, 0.057), horizon);
        // Local clouds occlude stars and moon, rather than dimming the entire sky uniformly.
        if (daylight < 0.99) {
          vec3 starCell = direction * 360.0;
          float starSeed = skyHash(floor(starCell.xy) + floor(starCell.z) * vec2(13.13, 7.71));
          float stars = step(0.996, starSeed) * pow(max(0.0, 1.0 - length(fract(starCell) - 0.5) * 2.0), 10.0);
          nightColour += vec3(0.78, 0.85, 1.0) * stars * (1.0 - cloudAlpha) * smoothstep(0.03, 0.2, height);
          float moonDot = max(0.0, dot(direction, normalize(vec3(-0.45, 0.66, 0.60))));
          vec3 nightCloud = vec3(0.016, 0.022, 0.034) * (0.70 + lightSide * 0.65 + pow(moonDot, 6.0) * 0.2);
          nightColour = mix(nightColour, nightCloud, cloudAlpha * 0.86);
          float moonDisc = smoothstep(0.99991, 0.99997, moonDot);
          float moonGlow = pow(moonDot, 700.0) * 0.035;
          nightColour += vec3(0.85, 0.91, 1.0) * (moonDisc * 1.25 + moonGlow) * (1.0 - cloudAlpha * 0.97) * (1.0 - rain * 0.8);
          nightColour += vec3(0.14, 0.045, 0.012) * twilight * pow(sunDot, 6.0) * horizon * (1.0 - rain * 0.7);
        }
        nightColour = mix(nightColour, vec3(0.012, 0.019, 0.029), rain * 0.35);
        gl_FragColor = vec4(mix(nightColour, dayColour, daylight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  sky.name = "atmospheric-cloud-sky";
  sky.scale.setScalar(4500);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  return sky;
}

/**
 * Photographic image-based lighting and a deliberately restrained camera look.
 * Low/medium render once. High adds contact occlusion and four-sample geometry antialiasing.
 */
export function createVisuals(renderer, scene, camera, quality = "medium") {
  const previous = {
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    fog: scene.fog,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
  };
  let currentQuality;
  let composer = null;
  let passes = [];
  let ready = Promise.resolve();
  let width = Math.max(1, renderer.domElement.clientWidth || 800);
  let height = Math.max(1, renderer.domElement.clientHeight || 600);
  let disposed = false;
  let shadowSpan = 48;
  const focus = new THREE.Vector3();
  const lightRight = new THREE.Vector3();
  const lightUp = new THREE.Vector3();
  const { texture: panorama, sunDirection } = photographicEnvironment();
  const photographedSun = sunDirection.clone();
  const solarDirection = sunDirection.clone();
  const solarAzimuth = Math.atan2(photographedSun.z, photographedSun.x);
  const daySunColour = new THREE.Color(0xfff1dd);
  const lowSunColour = new THREE.Color(0xffbd82);
  const daySkyColour = new THREE.Color(0xbfd8eb);
  const duskSkyColour = new THREE.Color(0xb5a7be);
  const dayHazeColour = new THREE.Color(0xb8cbd4);
  const duskHazeColour = new THREE.Color(0xc8b6ac);
  const moonDirection = new THREE.Vector3(-0.45, 0.66, 0.6).normalize();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const nightColours = {
    moon: new THREE.Color(0x9fbce8),
    sky: new THREE.Color(0x5a76a0),
    ground: new THREE.Color(0x232c3d),
    clouds: new THREE.Color(0x819098),
    haze: new THREE.Color(0x172638),
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflection = pmrem.fromEquirectangular(panorama);
  pmrem.dispose();
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.38;
  const haze = new THREE.Fog(0xb9cbd3, 280, 2450);
  scene.fog = haze;
  scene.background = haze.color;
  const sky = createAtmosphericSky(panorama, haze, solarDirection);
  scene.add(sky);

  // The HDRI supplies the colour of indirect light. A small hemisphere lift
  // prevents unlit undersides from becoming black without flattening the sun.
  const hemisphere = new THREE.HemisphereLight(0xbfd8eb, 0x625c4c, 0.1);
  hemisphere.name = "indirect-daylight-lift";
  const sun = new THREE.DirectionalLight(0xfff1dd, 5.8);
  sun.name = "photograph-matched-sun";
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.000025;
  sun.shadow.radius = 2;
  sun.shadow.autoUpdate = false;
  Object.assign(sun.shadow.camera, { near: 1, far: 560 });
  scene.add(hemisphere, sun, sun.target);
  lightRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDirection).normalize();
  lightUp.crossVectors(sunDirection, lightRight).normalize();

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX preserves highlight colour in photographic surfaces and painted metal
  // without the clipped yellow/white highlights of the previous look.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  function releasePipeline() {
    for (const pass of passes) {
      pass.dispose?.();
      // Three r180's GTAOPass.dispose omits its main ShaderMaterial.
      if (pass instanceof GTAOPass) pass.gtaoMaterial.dispose();
    }
    passes = [];
    composer?.dispose();
    composer = null;
  }

  function configurePipeline() {
    releasePipeline();
    if (currentQuality !== "high") {
      ready = Promise.resolve();
      return;
    }
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: Math.min(4, renderer.capabilities.maxSamples),
    });
    composer = new EffectComposer(renderer, target);
    const beauty = new RenderPass(scene, camera);
    const occlusion = new GTAOPass(
      scene,
      camera,
      width,
      height,
      undefined,
      {
        radius: 0.4,
        thickness: 0.65,
        distanceFallOff: 0.9,
        distanceExponent: 1.3,
        samples: 16,
        scale: 0.9,
      },
      { lumaPhi: 8, depthPhi: 2.5, normalPhi: 3, radius: 5, samples: 16 },
    );
    occlusion.blendIntensity = 0.35;
    // The generic normal override cannot reproduce each leaf's alpha cutout.
    // Omit those cards and glass from the AO buffer instead of darkening their
    // invisible rectangular backing; the beauty/shadow passes still draw them.
    const renderOcclusion = occlusion.render.bind(occlusion);
    occlusion.render = (...args) => {
      const omitted = [];
      scene.traverse((object) => {
        if ((!object.isMesh && !object.isSprite) || !object.visible) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        if (
          materials.some(
            (material) => material?.transparent || material?.alphaTest > 0,
          )
        ) {
          omitted.push(object);
          object.visible = false;
        }
      });
      try {
        renderOcclusion(...args);
      } finally {
        omitted.forEach((object) => {
          object.visible = true;
        });
      }
    };
    const output = new OutputPass();
    passes = [beauty, occlusion, output];
    passes.forEach((pass) => composer.addPass(pass));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    // Multisampling resolves actual geometry coverage before AO/compositing.
    // Morphological AA bent the very thin window frames and roof cornices.
    ready = Promise.resolve();
  }

  function setQuality(value) {
    const next = ["low", "medium", "high"].includes(value) ? value : "medium";
    if (next === currentQuality) return;
    currentQuality = next;
    const skyDetail = next === "low" ? 1 : next === "high" ? 3 : 2;
    if (sky.material.defines.SKY_DETAIL !== skyDetail) {
      sky.material.defines.SKY_DETAIL = skyDetail;
      sky.material.needsUpdate = true;
    }
    renderer.shadowMap.enabled = next !== "low";
    sun.castShadow = next !== "low";
    const requestedSize = next === "high" ? 4096 : 2048;
    const size = Math.min(requestedSize, renderer.capabilities.maxTextureSize);
    shadowSpan = next === "high" ? 74 : 48;
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, {
      left: -shadowSpan,
      right: shadowSpan,
      top: shadowSpan,
      bottom: -shadowSpan,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.needsUpdate = true;
    configurePipeline();
  }

  function setAtmosphere(values = {}) {
    if (disposed) return;
    const finite = (value, fallback) =>
      Number.isFinite(Number(value)) ? Number(value) : fallback;
    const day = THREE.MathUtils.clamp(finite(values.daylight ?? 1, 1), 0, 1);
    const clouds = THREE.MathUtils.clamp(finite(values.cloudiness, 0), 0, 1);
    const rain = THREE.MathUtils.clamp(finite(values.rain, 0), 0, 1);
    const night = 1 - day;
    const hasClock =
      values.minutes != null && Number.isFinite(Number(values.minutes));
    if (hasClock) {
      const hours = (((Number(values.minutes) % 1440) + 1440) % 1440) / 60;
      // Sunrise/sunset fit the existing atmosphere's 05:30–07:00 and
      // 18:18–20:00 daylight ramps; azimuth follows the same solar arc.
      const phase = (Math.PI * (hours - 6.25)) / 13;
      const elevation = Math.sin(phase) * 0.88;
      const azimuth = solarAzimuth + ((hours - 17) * Math.PI) / 13;
      const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
      solarDirection.set(
        Math.cos(azimuth) * horizontal,
        elevation,
        Math.sin(azimuth) * horizontal,
      );
    } else {
      // Older harnesses/callers have no clock: keep their photographed daytime
      // direction while lowering the solar horizon during the twilight ramp.
      solarDirection.copy(photographedSun);
      solarDirection.y *= Math.max(0.1, day);
      solarDirection.normalize();
    }
    const warmth =
      1 - THREE.MathUtils.smoothstep(Math.max(0, solarDirection.y), 0.08, 0.48);
    const twilight = hasClock
      ? THREE.MathUtils.clamp(
          1 - Math.abs(solarDirection.y - 0.025) / 0.25,
          0,
          1,
        ) *
        (1 - clouds * 0.62)
      : day * night * 4 * (1 - clouds * 0.62);
    // Direct sunlight must disappear at the physical horizon. The daylight
    // ramp remains in the sky/ambient light for the longer dawn and dusk.
    const solarStrength =
      5.8 *
      day *
      THREE.MathUtils.smoothstep(Math.max(0, solarDirection.y), 0, 0.07);
    const lunarStrength = 0.22 * night;
    const keyStrength = solarStrength + lunarStrength;
    const moonBlend = keyStrength > 0 ? lunarStrength / keyStrength : 1;
    sunDirection
      .copy(solarDirection)
      .multiplyScalar(solarStrength)
      .addScaledVector(moonDirection, lunarStrength);
    if (sunDirection.lengthSq() < 0.000001) sunDirection.copy(moonDirection);
    else sunDirection.normalize();
    const uniforms = sky.material.uniforms;
    uniforms.daylight.value = day;
    uniforms.cloudiness.value = clouds;
    uniforms.rain.value = rain;
    uniforms.atmosphereTime.value = Math.max(0, finite(values.elapsed, 0));
    uniforms.solarDirection.value.copy(solarDirection);
    uniforms.keyDirection.value.copy(sunDirection);
    uniforms.twilight.value = twilight;
    sun.intensity = keyStrength * (1 - clouds * 0.73);
    sun.color
      .copy(daySunColour)
      .lerp(lowSunColour, warmth * 0.75)
      .lerp(nightColours.moon, moonBlend);
    hemisphere.intensity = (0.1 + clouds * 0.045) * day + 0.085 * night;
    hemisphere.color
      .copy(daySkyColour)
      .lerp(duskSkyColour, twilight * 0.4)
      .lerp(nightColours.sky, night);
    hemisphere.groundColor.set(0x625c4c).lerp(nightColours.ground, night);
    scene.environmentIntensity =
      (0.38 * day + 0.055 * night) * (1 - clouds * 0.15);
    renderer.toneMappingExposure = 0.96 + night * 0.15 + clouds * day * 0.12;
    haze.color
      .copy(dayHazeColour)
      .lerp(duskHazeColour, twilight * 0.48)
      .lerp(nightColours.clouds, clouds * 0.7)
      .lerp(nightColours.haze, night);
    haze.near = 270 - rain * 140;
    haze.far = 2280 - rain * 1350 - clouds * 140;
    lightRight.crossVectors(upAxis, sunDirection).normalize();
    lightUp.crossVectors(sunDirection, lightRight).normalize();
  }

  function update(_dt = 0, focusPosition = focus, _day = 1) {
    if (disposed) return;
    if (Number.isFinite(focusPosition?.x) && Number.isFinite(focusPosition?.z))
      focus.set(focusPosition.x, 5, focusPosition.z);
    // Align the shadow centre to its own light-space texels. Snapping world X/Z
    // alone caused the previous shadows to crawl during camera/car movement.
    const texel = (shadowSpan * 2) / sun.shadow.mapSize.x;
    const alongRight = focus.dot(lightRight);
    const alongUp = focus.dot(lightUp);
    sun.target.position
      .copy(focus)
      .addScaledVector(
        lightRight,
        Math.round(alongRight / texel) * texel - alongRight,
      )
      .addScaledVector(lightUp, Math.round(alongUp / texel) * texel - alongUp);
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 260);
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
    sun.shadow.needsUpdate = true;
    if (composer) {
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      try {
        composer.render();
      } finally {
        renderer.info.autoReset = autoReset;
      }
    } else renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    releasePipeline();
    sky.removeFromParent();
    sky.geometry.dispose();
    sky.material.dispose();
    panorama.dispose();
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
    renderer.toneMapping = previous.toneMapping;
    renderer.toneMappingExposure = previous.exposure;
  }

  setQuality(quality);
  update(0, focus, 1);
  return {
    update,
    render,
    resize,
    setQuality,
    setAtmosphere,
    dispose,
    get ready() {
      return ready;
    },
    source: PHOTO_ENVIRONMENT_META,
  };
}

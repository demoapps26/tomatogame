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
 * Use the photographed sky above the skyline. Its photographed buildings are
 * deliberately absent from the visible background: the city is the game world.
 */
function createPhotographicSky(texture, haze) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      panorama: { value: texture },
      hazeColour: { value: haze.color },
      skyExposure: { value: 0.84 },
      daylight: { value: 1 },
      cloudiness: { value: 0 },
      rain: { value: 0 },
      atmosphereTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `uniform sampler2D panorama;
      uniform vec3 hazeColour;
      uniform float skyExposure;
      uniform float daylight;
      uniform float cloudiness;
      uniform float rain;
      uniform float atmosphereTime;
      varying vec3 vDirection;
      float skyHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float skyNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(skyHash(vec3(i,0.0)),skyHash(vec3(i+vec2(1.0,0.0),0.0)),f.x),mix(skyHash(vec3(i+vec2(0.0,1.0),0.0)),skyHash(vec3(i+vec2(1.0),0.0)),f.x),f.y);
      }
      void main() {
        vec3 direction = normalize(vDirection);
        // Only sample the clean sky cap above 56 degrees: the source panorama
        // contains street lamps below it. The horizon fades into the same
        // atmospheric haze as the real game geometry, never photographed props.
        vec3 sampleDirection = normalize(vec3(direction.x, max(direction.y, 1.50), direction.z));
        vec2 uv = vec2(atan(sampleDirection.z, sampleDirection.x) * 0.159154943 + 0.5, asin(sampleDirection.y) * 0.318309886 + 0.5);
        vec3 radiance = texture2D(panorama, uv).rgb * skyExposure;
        float clearSky = smoothstep(0.02, 0.24, direction.y);
        vec3 dayColour=mix(hazeColour,radiance,clearSky);
        vec2 cloudUv=direction.xz/max(direction.y+0.55,0.12)*2.6+vec2(atmosphereTime*0.0021,atmosphereTime*0.0007);
        float clouds=skyNoise(cloudUv)*0.65+skyNoise(cloudUv*2.1)*0.24+skyNoise(cloudUv*4.2)*0.11;
        float cloudMask=smoothstep(0.27,0.77,clouds)*cloudiness;
        vec3 cloudColour=mix(vec3(0.39,0.45,0.49),vec3(0.68,0.72,0.75),clouds);
        dayColour=mix(dayColour,cloudColour,cloudMask*0.88);
        dayColour=mix(dayColour,vec3(0.24,0.30,0.34),rain*0.35);
        float horizon=pow(1.0-clamp(direction.y,0.0,1.0),3.0);
        vec3 nightColour=mix(vec3(0.004,0.008,0.018),vec3(0.025,0.041,0.063),horizon);
        vec3 starCell=direction*360.0;
        float stars=step(0.996,skyHash(floor(starCell)))*pow(max(0.0,1.0-length(fract(starCell)-0.5)*2.0),10.0);
        nightColour+=vec3(0.78,0.85,1.0)*stars*(1.0-cloudiness)*smoothstep(0.03,0.2,direction.y);
        float moonDot=dot(direction,normalize(vec3(-0.45,0.66,0.60)));
        float moonDisc=smoothstep(0.99991,0.99997,moonDot);
        float moonGlow=pow(max(moonDot,0.0),700.0)*0.035;
        nightColour+=vec3(0.85,0.91,1.0)*(moonDisc*1.25+moonGlow)*(1.0-cloudiness*0.84);
        nightColour=mix(nightColour,vec3(0.012,0.019,0.029),rain*0.45);
        gl_FragColor=vec4(mix(nightColour,dayColour,daylight),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  sky.name = "photographic-daylight-sky";
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
  scene.environmentIntensity = 0.44;
  const haze = new THREE.Fog(0xb9cbd3, 280, 2450);
  scene.fog = haze;
  scene.background = haze.color;
  const sky = createPhotographicSky(panorama, haze);
  scene.add(sky);

  // The HDRI supplies the colour of indirect light. A small hemisphere lift
  // prevents unlit undersides from becoming black without flattening the sun.
  const hemisphere = new THREE.HemisphereLight(0xc6dded, 0x625c4c, 0.14);
  hemisphere.name = "indirect-daylight-lift";
  const sun = new THREE.DirectionalLight(0xfff1dd, 6.2);
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
    const day = THREE.MathUtils.clamp(Number(values.daylight ?? 1) || 0, 0, 1);
    const clouds = THREE.MathUtils.clamp(Number(values.cloudiness) || 0, 0, 1);
    const rain = THREE.MathUtils.clamp(Number(values.rain) || 0, 0, 1);
    const night = 1 - day;
    sky.material.uniforms.daylight.value = day;
    sky.material.uniforms.cloudiness.value = clouds;
    sky.material.uniforms.rain.value = rain;
    sky.material.uniforms.atmosphereTime.value = Number(values.elapsed) || 0;
    sun.intensity = (6.2 * day + 0.22 * night) * (1 - clouds * 0.68);
    sun.color.set(0xfff1dd).lerp(nightColours.moon, night);
    hemisphere.intensity = 0.14 * day + 0.095 * night;
    hemisphere.color.set(0xc6dded).lerp(nightColours.sky, night);
    hemisphere.groundColor.set(0x625c4c).lerp(nightColours.ground, night);
    scene.environmentIntensity =
      (0.44 * day + 0.055 * night) * (1 - clouds * 0.15);
    renderer.toneMappingExposure = 0.95 + night * 0.16;
    haze.color
      .set(0xb9cbd3)
      .lerp(nightColours.clouds, clouds * 0.7)
      .lerp(nightColours.haze, night);
    haze.near = 280 - rain * 150;
    haze.far = 2450 - rain * 1500 - clouds * 160;
    sunDirection.copy(photographedSun).lerp(moonDirection, night).normalize();
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

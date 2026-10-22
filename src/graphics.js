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
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        // Only sample the clean sky cap above 56 degrees: the source panorama
        // contains street lamps below it. The horizon fades into the same
        // atmospheric haze as the real game geometry, never photographed props.
        vec3 sampleDirection = normalize(vec3(direction.x, max(direction.y, 1.50), direction.z));
        vec2 uv = vec2(atan(sampleDirection.z, sampleDirection.x) * 0.159154943 + 0.5, asin(sampleDirection.y) * 0.318309886 + 0.5);
        vec3 radiance = texture2D(panorama, uv).rgb * skyExposure;
        float clearSky = smoothstep(0.02, 0.24, direction.y);
        gl_FragColor = vec4(mix(hazeColour, radiance, clearSky), 1.0);
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
    dispose,
    get ready() {
      return ready;
    },
    source: PHOTO_ENVIRONMENT_META,
  };
}

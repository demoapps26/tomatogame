import * as THREE from "three";

const MINUTES_PER_SECOND = 1440 / (36 * 60);
const MODES = ["auto", "clear", "cloudy", "rain"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) =>
  value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
const wrapMinutes = (value) => ((value % 1440) + 1440) % 1440;
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};
const automaticWeather = (elapsed) =>
  ["clear", "clear", "clear", "cloudy", "rain", "rain", "cloudy", "clear"][
    Math.floor(elapsed / 240) % 8
  ];

export function daylightForTime(minutes) {
  const hours = wrapMinutes(finite(minutes, 1020)) / 60;
  return smooth(5.5, 7, hours) * (1 - smooth(18.3, 20, hours));
}

export function normalizeAtmosphereState(saved = {}) {
  saved = saved && typeof saved === "object" ? saved : {};
  const weatherMode = MODES.includes(saved.weatherMode)
    ? saved.weatherMode
    : "auto";
  const elapsed = Math.max(0, finite(saved.elapsed, 0));
  const weather =
    weatherMode === "auto" ? automaticWeather(elapsed) : weatherMode;
  return {
    minutes: wrapMinutes(finite(saved.minutes, 17 * 60)),
    elapsed,
    weatherMode,
    weather,
    cloudiness: clamp(
      finite(
        saved.cloudiness,
        weather === "rain" ? 1 : weather === "cloudy" ? 0.72 : 0,
      ),
      0,
      1,
    ),
    rain: clamp(finite(saved.rain, weather === "rain" ? 1 : 0), 0, 1),
  };
}

/** Pure clock/weather advance. Business days and finances are deliberately separate. */
export function advanceAtmosphereState(saved, seconds) {
  const state = normalizeAtmosphereState(saved);
  const dt = clamp(finite(seconds, 0), 0, 86400);
  state.minutes = wrapMinutes(state.minutes + dt * MINUTES_PER_SECOND);
  state.elapsed += dt;
  state.weather =
    state.weatherMode === "auto"
      ? automaticWeather(state.elapsed)
      : state.weatherMode;
  const blend = 1 - Math.exp(-dt / 12);
  state.cloudiness +=
    ((state.weather === "rain" ? 1 : state.weather === "cloudy" ? 0.72 : 0) -
      state.cloudiness) *
    blend;
  state.rain += ((state.weather === "rain" ? 1 : 0) - state.rain) * blend;
  return state;
}

function lampSites(world) {
  const roads = world.roads || [],
    sites = [];
  const coordinates = [
    ...new Set(
      roads.filter((road) => road.depth > road.width).map((road) => road.x),
    ),
  ].sort((a, b) => a - b);
  const step = world.roadStep || 96;
  for (const coordinate of coordinates) {
    const road = roads.find(
      (item) => item.depth > item.width && item.x === coordinate,
    );
    const width = road?.width || 14;
    for (let index = 0; index < coordinates.length - 1; index++) {
      if ((index + Math.round(coordinate / step)) % 2 !== 0) continue;
      const middle = (coordinates[index] + coordinates[index + 1]) / 2;
      for (const side of [-1, 1]) {
        sites.push({
          x: coordinate + side * (width / 2 + 2.8 - 1.65),
          y: 8.17,
          z: middle,
        });
        sites.push({
          x: middle,
          y: 8.17,
          z: coordinate + side * (width / 2 + 2.8 - 1.65),
        });
      }
    }
  }
  return sites;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,246,221,1)");
  gradient.addColorStop(0.16, "rgba(255,233,185,.75)");
  gradient.addColorStop(0.48, "rgba(255,220,160,.15)");
  gradient.addColorStop(1, "rgba(255,220,160,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small moving pool of lights/rain follows the player; the entire city stays cheap. */
export function createAtmosphere(
  scene,
  world,
  visuals,
  { savedState, quality = "medium" } = {},
) {
  let state = normalizeAtmosphereState(savedState),
    disposed = false,
    active = false;
  let lastPlayer = { x: world.spawn?.x || 0, z: world.spawn?.z || 86 },
    lastVehicle = null;
  let lampTimer = -1,
    audio = null,
    birdTimer = 12;
  const group = new THREE.Group();
  group.name = "local-weather-and-lights";
  scene.add(group);
  const lampCount = quality === "low" ? 2 : quality === "high" ? 6 : 4;
  const sites = lampSites(world);
  const glowMap = glowTexture();
  const glows = [],
    lights = [];
  for (let index = 0; index < lampCount; index++) {
    const light = new THREE.PointLight(0xffd69d, 0, 40, 2);
    light.name = `nearby-streetlight-${index}`;
    light.visible = false;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    sprite.scale.setScalar(1.75);
    sprite.visible = false;
    group.add(light, sprite);
    lights.push(light);
    glows.push(sprite);
  }
  const headlights = [],
    targets = [];
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(0xe8f0ff, 0, 82, 0.36, 0.55, 2);
    light.name = `player-headlight-${side}`;
    light.visible = false;
    const target = new THREE.Object3D();
    light.target = target;
    group.add(light, target);
    headlights.push(light);
    targets.push(target);
  }

  const drops = quality === "low" ? 180 : quality === "high" ? 700 : 420;
  const positions = new Float32Array(drops * 6),
    seeds = new Float32Array(drops * 3);
  for (let index = 0; index < drops; index++) {
    seeds[index * 3] = (((index * 0.754877666) % 1) - 0.5) * 44;
    seeds[index * 3 + 1] = ((index * 0.569840291 + 0.21) % 1) * 20;
    seeds[index * 3 + 2] = (((index * 0.438579021 + 0.39) % 1) - 0.5) * 44;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const rainMaterial = new THREE.LineBasicMaterial({
    color: 0xc3d5e0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.name = "nearby-rain";
  rain.frustumCulled = false;
  rain.visible = false;
  group.add(rain);

  const materials = new Set();
  world.group?.traverse((object) => {
    for (const material of Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [])
      materials.add(material);
  });
  const isWindow = (material) =>
    material.userData?.cityWindow ||
    (material.isMeshPhysicalMaterial &&
      material.roughness === 0.12 &&
      material.metalness === 0.13);
  const isLamp = (material) =>
    material.emissiveIntensity > 0 && material.emissive?.getHex() > 0;
  const changes = [...materials]
    .filter(
      (material) =>
        material.name === "photo-asphalt" ||
        isLamp(material) ||
        isWindow(material),
    )
    .map((material) => ({
      material,
      roughness: material.roughness,
      emissive: material.emissive?.clone(),
      emissiveIntensity: material.emissiveIntensity || 0,
      kind:
        material.name === "photo-asphalt"
          ? "road"
          : isWindow(material)
            ? "window"
            : "lamp",
    }));
  const windowLight = new THREE.Color(0xeab977);

  function setAudioGains() {
    if (!audio || audio.context.state === "closed") return;
    const when = audio.context.currentTime,
      enabled = active ? 1 : 0;
    const sheltered = (world.interiorZones || []).some(
      (zone) =>
        lastPlayer.x >= zone.minX &&
        lastPlayer.x <= zone.maxX &&
        lastPlayer.z >= zone.minZ &&
        lastPlayer.z <= zone.maxZ,
    );
    audio.wind.gain.setTargetAtTime(
      enabled * (sheltered ? 0.3 : 1) * (0.018 + state.cloudiness * 0.012),
      when,
      0.2,
    );
    audio.rain.gain.setTargetAtTime(
      enabled * (sheltered ? 0.4 : 1) * state.rain * 0.075,
      when,
      0.25,
    );
    audio.hum.gain.setTargetAtTime(
      enabled * (world.group?.name.includes("estufas") ? 0.002 : 0.008),
      when,
      0.3,
    );
  }

  function apply() {
    const daylight = daylightForTime(state.minutes),
      night = 1 - daylight;
    visuals.setAtmosphere?.({
      minutes: state.minutes,
      daylight,
      night,
      cloudiness: state.cloudiness,
      rain: state.rain,
      elapsed: state.elapsed,
    });
    for (const change of changes) {
      if (change.kind === "road")
        change.material.roughness = THREE.MathUtils.lerp(
          change.roughness,
          0.24,
          state.rain,
        );
      else if (change.kind === "lamp")
        change.material.emissiveIntensity =
          change.emissiveIntensity + night * 2.3;
      else if (change.material.userData?.cityWindow) {
        change.material.userData.nightUniform.value = night;
      } else {
        change.material.emissive.copy(change.emissive).lerp(windowLight, night);
        change.material.emissiveIntensity = THREE.MathUtils.lerp(
          change.emissiveIntensity,
          0.11,
          night,
        );
      }
    }
    rain.visible = state.rain > 0.015;
    rainMaterial.opacity = state.rain * (0.28 + daylight * 0.14);
    setAudioGains();
  }

  function updateLights(dt, player, vehicle) {
    const night = 1 - daylightForTime(state.minutes),
      lightFactor = clamp(night + state.rain * 0.3, 0, 1);
    lampTimer -= dt;
    if (lampTimer <= 0) {
      lampTimer = 0.75;
      const near = sites
        .map((site) => ({
          ...site,
          distance: Math.hypot(site.x - player.x, site.z - player.z),
        }))
        .filter((site) => site.distance < 105)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, lampCount);
      for (let index = 0; index < lights.length; index++) {
        const site = near[index];
        lights[index].userData.inRange = !!site;
        if (site) {
          lights[index].position.set(site.x, site.y, site.z);
          glows[index].position.copy(lights[index].position);
        }
      }
    }
    for (let index = 0; index < lights.length; index++) {
      const enabled = lights[index].userData.inRange && lightFactor > 0.025;
      lights[index].visible = glows[index].visible = !!enabled;
      lights[index].intensity = lightFactor * 145;
      glows[index].material.opacity = lightFactor * 0.72;
    }
    const heading = Number(vehicle?.yaw) || 0,
      sx = Math.sin(heading),
      sz = Math.cos(heading);
    for (let index = 0; index < headlights.length; index++) {
      const enabled = !!vehicle?.position && lightFactor > 0.025;
      headlights[index].visible = enabled;
      headlights[index].intensity = lightFactor * 1250;
      if (enabled) {
        const side = index === 0 ? -1 : 1;
        headlights[index].position.set(
          vehicle.position.x + sx * 2.15 + sz * side * 0.7,
          0.9,
          vehicle.position.z + sz * 2.15 - sx * side * 0.7,
        );
        targets[index].position.set(
          vehicle.position.x + sx * 38 + sz * side,
          0.04,
          vehicle.position.z + sz * 38 - sx * side,
        );
      }
    }
  }

  function updateRain() {
    if (state.rain > 0.015) {
      rain.position.set(lastPlayer.x, 0, lastPlayer.z);
      const nearbyRoofs = (world.interiorZones || []).filter(
        (zone) =>
          lastPlayer.x + 22 >= zone.minX &&
          lastPlayer.x - 22 <= zone.maxX &&
          lastPlayer.z + 22 >= zone.minZ &&
          lastPlayer.z - 22 <= zone.maxZ,
      );
      for (let index = 0; index < drops; index++) {
        const at = index * 3,
          offset = index * 6;
        let y = (((seeds[at + 1] - state.elapsed * 15) % 20) + 20) % 20;
        const x = seeds[at] + Math.sin(state.elapsed * 0.11 + index) * 0.12;
        // Interior roofs become cutaways near doorways, so depth alone cannot
        // keep rain out of a visited house, showroom or the company shop.
        if (
          nearbyRoofs.some(
            (zone) =>
              x + lastPlayer.x >= zone.minX &&
              x + lastPlayer.x <= zone.maxX &&
              seeds[at + 2] + lastPlayer.z >= zone.minZ &&
              seeds[at + 2] + lastPlayer.z <= zone.maxZ,
          )
        )
          y = -100;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = seeds[at + 2];
        positions[offset + 3] = x + 0.08;
        positions[offset + 4] = y - 0.85;
        positions[offset + 5] = seeds[at + 2] + 0.06;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
  }
  function update(dt, playerPosition = lastPlayer, vehicle = null) {
    if (disposed) return;
    const seconds = clamp(finite(dt, 0), 0, 0.25);
    state = advanceAtmosphereState(state, seconds);
    if (
      Number.isFinite(playerPosition?.x) &&
      Number.isFinite(playerPosition?.z)
    )
      lastPlayer = { x: playerPosition.x, z: playerPosition.z };
    lastVehicle = vehicle;
    apply();
    updateLights(seconds, lastPlayer, vehicle);
    updateRain();
    if (
      audio &&
      active &&
      daylightForTime(state.minutes) > 0.65 &&
      state.rain < 0.1
    ) {
      birdTimer -= seconds;
      if (birdTimer <= 0) {
        birdTimer = 19 + (Math.floor(state.elapsed) % 13);
        const now = audio.context.currentTime,
          oscillator = audio.context.createOscillator(),
          gain = audio.context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(2400, now);
        oscillator.frequency.exponentialRampToValueAtTime(3300, now + 0.065);
        oscillator.frequency.exponentialRampToValueAtTime(2050, now + 0.19);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.021, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        oscillator.connect(gain);
        gain.connect(audio.master);
        oscillator.start(now);
        oscillator.stop(now + 0.24);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    }
  }

  function getState() {
    const hours = Math.floor(state.minutes / 60),
      minutes = Math.floor(state.minutes % 60);
    return {
      ...state,
      clock: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      label: { clear: "Céu limpo", cloudy: "Nublado", rain: "Chuva" }[
        state.weather
      ],
      daylight: daylightForTime(state.minutes),
    };
  }
  function setWeather(mode) {
    state.weatherMode = MODES.includes(mode) ? mode : "auto";
    state.weather =
      state.weatherMode === "auto"
        ? automaticWeather(state.elapsed)
        : state.weatherMode;
    state.cloudiness =
      state.weather === "rain" ? 1 : state.weather === "cloudy" ? 0.72 : 0;
    state.rain = state.weather === "rain" ? 1 : 0;
    apply();
    updateLights(0, lastPlayer, lastVehicle);
    updateRain();
    return getState();
  }
  function setTime(minutes) {
    state.minutes = wrapMinutes(finite(minutes, state.minutes));
    apply();
    updateLights(0, lastPlayer, lastVehicle);
    return getState();
  }
  function setActive(value) {
    active = !!value;
    setAudioGains();
  }
  function releaseAudio() {
    if (!audio) return;
    for (const source of audio.sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    for (const node of audio.nodes) node.disconnect();
    audio = null;
  }
  function attachAudio(context, master) {
    if (disposed || !context || !master || context.state === "closed") return;
    if (audio?.context === context && audio.master === master) return;
    releaseAudio();
    const buffer = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      ),
      samples = buffer.getChannelData(0);
    let seed = 431879;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[index] = (seed / 4294967296) * 2 - 1;
    }
    audio = { context, master, nodes: [], sources: [] };
    for (const [name, frequency, type, playbackRate] of [
      ["wind", 390, "lowpass", 0.73],
      ["rain", 2100, "lowpass", 1.1],
      ["hum", 95, "lowpass", 0.51],
    ]) {
      const source = context.createBufferSource(),
        filter = context.createBiquadFilter(),
        gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = playbackRate;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = 0.35;
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      audio[name] = gain;
      audio.sources.push(source);
      audio.nodes.push(filter, gain);
    }
    setAudioGains();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseAudio();
    for (const change of changes) {
      change.material.roughness = change.roughness;
      if (change.material.userData?.cityWindow)
        change.material.userData.nightUniform.value = 0;
      if (change.emissive) change.material.emissive.copy(change.emissive);
      change.material.emissiveIntensity = change.emissiveIntensity;
    }
    group.removeFromParent();
    for (const sprite of glows) sprite.material.dispose();
    glowMap.dispose();
    rainGeometry.dispose();
    rainMaterial.dispose();
    lights.forEach((light) => light.dispose?.());
    headlights.forEach((light) => light.dispose?.());
    visuals.setAtmosphere?.({
      daylight: 1,
      cloudiness: 0,
      rain: 0,
      elapsed: 0,
    });
  }
  apply();
  updateLights(0, lastPlayer, null);
  updateRain();
  return {
    update,
    getState,
    setWeather,
    setTime,
    setActive,
    attachAudio,
    dispose,
  };
}

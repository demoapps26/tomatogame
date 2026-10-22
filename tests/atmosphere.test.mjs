import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  advanceAtmosphereState,
  createAtmosphere,
  daylightForTime,
  normalizeAtmosphereState,
} from "../src/atmosphere.js";

test("the playing clock completes a day in 36 minutes without changing company days", () => {
  const original = { minutes: 1020, elapsed: 0, day: 7, cash: 8500 };
  const advanced = advanceAtmosphereState(original, 2160);
  assert.equal(advanced.minutes, 1020);
  assert.equal(advanced.elapsed, 2160);
  assert.equal(original.day, 7);
  assert.equal(original.cash, 8500);
  assert.equal(original.minutes, 1020);
  assert.equal(advanced.day, undefined);
  assert.equal(advanceAtmosphereState(advanced, -10).elapsed, advanced.elapsed);
});

test("late afternoon preserves daylight and night/sunrise transition smoothly", () => {
  assert.equal(daylightForTime(17 * 60), 1);
  assert.equal(daylightForTime(0), 0);
  assert.equal(daylightForTime(7 * 60 + 30), 1);
  assert(daylightForTime(6 * 60) > 0);
  assert(daylightForTime(6 * 60) < daylightForTime(6 * 60 + 30));
  assert(daylightForTime(19 * 60) > 0);
  assert.equal(daylightForTime(20 * 60), 0);
});

test("automatic weather evolves during play and survives save/load", () => {
  let state = normalizeAtmosphereState();
  assert.equal(state.weather, "clear");
  state = advanceAtmosphereState(state, 721);
  assert.equal(state.weather, "cloudy");
  assert(state.cloudiness > 0.7);
  state = advanceAtmosphereState(state, 241);
  assert.equal(state.weather, "rain");
  assert(state.rain > 0.99);
  assert.deepEqual(
    normalizeAtmosphereState(JSON.parse(JSON.stringify(state))),
    state,
  );
});

test("manual weather survives the automatic cycle and malformed saves recover", () => {
  const rain = advanceAtmosphereState({ weatherMode: "rain" }, 2160);
  assert.equal(rain.weather, "rain");
  assert.equal(rain.rain, 1);
  assert.equal(normalizeAtmosphereState(null).minutes, 1020);
  const malformed = normalizeAtmosphereState({
    minutes: NaN,
    elapsed: -2,
    rain: 12,
    cloudiness: -3,
    weatherMode: "snow",
  });
  assert.equal(malformed.minutes, 1020);
  assert.equal(malformed.elapsed, 0);
  assert.equal(malformed.weatherMode, "auto");
  assert.equal(malformed.rain, 1);
  assert.equal(malformed.cloudiness, 0);
});

test("local weather lights stay bounded, wet roads restore, and disposal releases the world", () => {
  const priorDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
      }),
    }),
  };
  try {
    const scene = new THREE.Scene(),
      group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ roughness: 0.94 });
    material.name = "photo-asphalt";
    group.add(new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), material));
    const windowMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.12,
      metalness: 0.13,
    });
    group.add(new THREE.Mesh(group.children[0].geometry, windowMaterial));
    scene.add(group);
    const world = {
      group,
      spawn: { x: 0, z: 48 },
      interiorZones: [{ minX: -10, maxX: 10, minZ: 38, maxZ: 58, height: 5 }],
      roadStep: 96,
      roads: [-96, 0, 96].map((x) => ({ x, z: 0, width: 14, depth: 300 })),
    };
    const visualStates = [],
      visuals = { setAtmosphere: (state) => visualStates.push(state) };
    const atmosphere = createAtmosphere(scene, world, visuals, {
      quality: "high",
    });
    const layer = scene.getObjectByName("local-weather-and-lights");
    const countLights = () =>
      layer.children.filter((object) => object.isLight).length;
    assert.equal(countLights(), 8);
    atmosphere.setWeather("rain");
    assert.equal(material.roughness, 0.24);
    atmosphere.setTime(0);
    atmosphere.update(
      0,
      { x: 0, z: 48 },
      { position: { x: 0, z: 48 }, yaw: 0 },
    );
    assert.equal(
      layer.children.filter((object) => object.isSpotLight && object.visible)
        .length,
      2,
    );
    const midnightSave = atmosphere.getState();
    assert.equal(midnightSave.clock, "00:00");
    assert.equal(midnightSave.daylight, 0);
    const rainPositions =
      layer.getObjectByName("nearby-rain").geometry.attributes.position.array;
    let shelteredDrops = 0;
    for (let index = 0; index < rainPositions.length; index += 6) {
      if (
        Math.abs(rainPositions[index]) < 10 &&
        Math.abs(rainPositions[index + 2]) < 10
      ) {
        assert(
          rainPositions[index + 1] < -50,
          "Rain entered the interior below its cutaway roof",
        );
        shelteredDrops++;
      }
    }
    assert(shelteredDrops > 0);
    assert(windowMaterial.emissive.getHex() > 0);
    assert.equal(windowMaterial.emissiveIntensity, 0.11);
    atmosphere.setTime(450);
    assert.equal(atmosphere.getState().clock, "07:30");
    assert.equal(countLights(), 8);
    atmosphere.dispose();
    atmosphere.dispose();
    assert.equal(material.roughness, 0.94);
    assert.equal(windowMaterial.emissive.getHex(), 0);
    assert.equal(windowMaterial.emissiveIntensity, 1);
    assert.equal(scene.getObjectByName("local-weather-and-lights"), undefined);
    assert.equal(visualStates.at(-1).daylight, 1);
    group.children[0].geometry.dispose();
    material.dispose();
    windowMaterial.dispose();
  } finally {
    globalThis.document = priorDocument;
  }
});

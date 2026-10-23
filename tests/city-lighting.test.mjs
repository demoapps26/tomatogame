import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cityLightingValues } from "../src/graphics.js";
import { createAtmosphere, daylightForTime } from "../src/atmosphere.js";

test("urban lighting retains usable daylight bounce without exposing night as daytime", () => {
  const day = cityLightingValues({ daylight: 1 });
  const night = cityLightingValues({ daylight: 0 });
  const dusk = cityLightingValues({ daylight: 0.4, twilight: 1 });
  const overcast = cityLightingValues({ daylight: 1, cloudiness: 1, rain: 1 });
  assert(day.environmentIntensity > 0.6 && day.environmentIntensity < 1);
  assert(day.hemisphereIntensity > 0.2 && day.hemisphereIntensity < 0.4);
  assert(night.environmentIntensity < day.environmentIntensity / 5);
  assert(night.hemisphereIntensity < day.hemisphereIntensity / 2);
  assert(
    dusk.environmentIntensity >
      cityLightingValues({ daylight: 0.4 }).environmentIntensity,
  );
  assert(overcast.fogDensity > day.fogDensity);
  assert(
    overcast.exposure < 1.1,
    "Clouds get diffuse light rather than a large exposure multiplier",
  );
});

test("city light and aerial perspective stay finite through the full clock and malformed weather", () => {
  for (let minutes = 0; minutes < 1440; minutes++) {
    for (const storm of [0, 1]) {
      const result = cityLightingValues({
        daylight: daylightForTime(minutes),
        cloudiness: storm,
        rain: storm,
        twilight: 0.5,
      });
      assert(
        Object.values(result).every(
          (value) => Number.isFinite(value) && value > 0,
        ),
      );
      assert(result.exposure >= 1 && result.exposure <= 1.16);
      assert(result.fogDensity >= 0.0008 && result.fogDensity < 0.0017);
    }
  }
  for (const input of [
    null,
    {},
    { daylight: NaN, rain: Infinity, cloudiness: -20, twilight: "bad" },
  ])
    assert(Object.values(cityLightingValues(input)).every(Number.isFinite));
});

test("the atmosphere selects urban rendering only for Santa Tomata and releases it on disposal", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
      }),
    }),
  };
  try {
    for (const [map, expected] of [
      ["cidade", true],
      ["estufas", false],
      ["porto", false],
    ]) {
      const scene = new THREE.Scene(),
        group = new THREE.Group();
      group.name = "world-" + map;
      const profiles = [],
        states = [];
      const visuals = {
        setCityProfile: (enabled) => profiles.push(enabled),
        setAtmosphere: (state) => states.push(state),
      };
      const layer = createAtmosphere(
        scene,
        { group, roads: [], spawn: { x: 0, z: 86 } },
        visuals,
        { savedState: { minutes: 1020 }, quality: "low" },
      );
      assert.deepEqual(profiles, [expected]);
      layer.setWeather("rain");
      assert.deepEqual(
        profiles,
        [expected],
        "Changing weather cannot switch a map's render profile",
      );
      assert.equal(states.at(-1).minutes, 1020);
      layer.dispose();
      assert.deepEqual(profiles, expected ? [true, false] : [false]);
      layer.dispose();
      assert.deepEqual(profiles, expected ? [true, false] : [false]);
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

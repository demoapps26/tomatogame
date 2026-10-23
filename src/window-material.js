import * as THREE from "three";

// The shared box geometry is scaled independently for front and side windows.
// Recover a stable world-space frame rather than using the box's tiny depth as
// a room dimension. Every instance gets its own curtains and occupied room.
const vertexDeclarations = /* glsl */ `
  varying vec2 vCityWindowUv;
  varying vec3 vCityWindowWorld;
  varying vec3 vCityWindowNormal;
  varying float vCityWindowSeed;
`;
const vertexProjection = /* glsl */ `
  #include <project_vertex>
  vec4 cityWindowPoint = vec4(transformed, 1.0);
  vec3 cityWindowNormal = normal;
  vec3 cityWindowCentre = vec3(0.0);
  #ifdef USE_INSTANCING
    cityWindowPoint = instanceMatrix * cityWindowPoint;
    cityWindowNormal = mat3(instanceMatrix) * cityWindowNormal;
    cityWindowCentre = instanceMatrix[3].xyz;
  #endif
  vCityWindowWorld = (modelMatrix * cityWindowPoint).xyz;
  vCityWindowNormal = normalize(mat3(modelMatrix) * cityWindowNormal);
  cityWindowCentre = (modelMatrix * vec4(cityWindowCentre, 1.0)).xyz;
  vCityWindowSeed = fract(sin(dot(cityWindowCentre, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vCityWindowUv = uv;
`;
const fragmentDeclarations = /* glsl */ `
  uniform float cityWindowNight;
  varying vec2 vCityWindowUv;
  varying vec3 vCityWindowWorld;
  varying vec3 vCityWindowNormal;
  varying float vCityWindowSeed;

  float cityWindowBox(vec2 p, vec2 low, vec2 high) {
    vec2 inside = step(low, p) * step(p, high);
    return inside.x * inside.y;
  }
  vec3 cityWindowRoom(vec2 uv, vec3 outgoing, vec3 surfaceNormal, float seed) {
    vec3 tangent = normalize(cross(abs(surfaceNormal.y) > 0.95 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0), surfaceNormal));
    // Top/bottom faces are only a few centimetres thick; keep their shader frame finite.
    if (abs(surfaceNormal.y) > 0.9) tangent = vec3(1.0, 0.0, 0.0);
    vec3 bitangent = normalize(cross(surfaceNormal, tangent));
    vec3 ray = vec3(-dot(outgoing, tangent), -dot(outgoing, bitangent), -max(0.09, abs(dot(outgoing, surfaceNormal))));
    vec3 entry = vec3(uv * 2.0 - 1.0, 0.0);
    // One analytic ray/room intersection, no textures or ray-march loop.
    vec2 safeRay = sign(ray.xy + vec2(0.00001)) * max(abs(ray.xy), vec2(0.0001));
    vec2 sideDistance = (sign(safeRay) - entry.xy) / safeRay;
    float depth = 2.0 + seed * 1.1;
    float backDistance = -depth / ray.z;
    float distanceToWall = min(backDistance, min(sideDistance.x, sideDistance.y));
    vec3 hit = entry + ray * distanceToWall;
    vec2 wall = hit.xy * 0.5 + 0.5;
    float floorHit = 1.0 - step(-0.995, hit.y);
    float ceilingHit = step(0.995, hit.y);
    float sideHit = step(0.995, abs(hit.x));
    vec3 warmWall = mix(vec3(0.27, 0.25, 0.21), vec3(0.18, 0.23, 0.25), step(0.64, seed));
    vec3 room = warmWall * (0.53 + 0.21 * (hit.y * 0.5 + 0.5));
    room = mix(room, vec3(0.115, 0.079, 0.049), floorHit);
    room = mix(room, warmWall * 0.92, ceilingHit);
    room *= 1.0 - sideHit * 0.22;
    float backHit = 1.0 - max(max(floorHit, ceilingHit), sideHit);
    float picture = cityWindowBox(wall, vec2(0.51, 0.54), vec2(0.79, 0.82));
    float pictureInside = cityWindowBox(wall, vec2(0.526, 0.558), vec2(0.774, 0.802));
    room = mix(room, vec3(0.055, 0.046, 0.036), picture * backHit);
    room = mix(room, mix(vec3(0.12, 0.17, 0.16), vec3(0.24, 0.18, 0.10), seed), pictureInside * backHit);
    float sofa = cityWindowBox(wall, vec2(0.30, 0.06), vec2(0.85, 0.29));
    room = mix(room, mix(vec3(0.075, 0.092, 0.085), vec3(0.16, 0.12, 0.09), seed), sofa * backHit);
    float cabinet = cityWindowBox(wall, vec2(0.06, 0.08), vec2(0.23, 0.69));
    float shelf = step(0.82, fract(wall.y * 9.0));
    room = mix(room, vec3(0.075, 0.052, 0.032) * (0.72 + shelf * 0.62), cabinet * backHit);
    // Curtain opening and fold shadows differ for every apartment.
    float closed = step(0.83, seed);
    float opening = mix(0.12 + fract(seed * 4.71) * 0.22, 0.48, closed);
    float curtainEdge = opening + sin(uv.y * 6.0 + seed * 10.0) * 0.012;
    float curtains = 1.0 - step(curtainEdge, min(uv.x, 1.0 - uv.x));
    float fold = 0.72 + 0.16 * sin(uv.x * 104.0 + seed * 18.0) + 0.06 * sin(uv.x * 223.0);
    vec3 cloth = mix(vec3(0.34, 0.31, 0.25), vec3(0.22, 0.27, 0.28), step(0.57, seed));
    room = mix(room, cloth * fold, curtains);
    // The glass edge and window frame shadow remain visible at every angle.
    vec2 edgeDistance = min(uv, 1.0 - uv);
    float pane = smoothstep(0.0, 0.035, min(edgeDistance.x, edgeDistance.y));
    return room * pane;
  }
`;

/**
 * Dark reflective city glazing with a view-dependent room behind each pane.
 * The surface stays opaque so it can cover the solid batched building shell.
 * Resources and uniforms are owned by this material; no external assets load.
 */
export function createCityWindowMaterial(quality = "medium") {
  const nightUniform = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.065,
    envMapIntensity: 1.35,
    emissive: 0x000000,
    emissiveIntensity: 1,
  });
  material.name = "city-window-interior-glass";
  material.userData.cityWindow = true;
  material.userData.nightUniform = nightUniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cityWindowNight = nightUniform;
    shader.vertexShader = vertexDeclarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      vertexProjection,
    );
    shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
      float cityRoomSeed = vCityWindowSeed;
      vec3 cityRoomNormal = normalize(vCityWindowNormal);
      vec3 cityRoomView = normalize(cameraPosition - vCityWindowWorld);
      vec3 cityRoom = cityWindowRoom(vCityWindowUv, cityRoomView, cityRoomNormal, cityRoomSeed);
      float cityOccupied = step(0.48, fract(cityRoomSeed * 13.73));
      float cityNight = clamp(cityWindowNight, 0.0, 1.0);
      vec3 cityGlassTint = mix(vec3(0.016, 0.027, 0.033), vec3(0.026, 0.032, 0.033), cityRoomSeed);
      vec3 cityInteriorTint = mix(vec3(0.72, 0.82, 0.89), vec3(1.0, 0.76, 0.43), cityNight * cityOccupied);
      diffuseColor.rgb *= mix(cityGlassTint, cityRoom * cityInteriorTint * 0.32, 0.83);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      totalEmissiveRadiance += cityRoom * cityInteriorTint * (0.025 + cityNight * cityOccupied * 0.92);
      `,
    );
  };
  material.customProgramCacheKey = () => `city-window-room-v1-${quality}`;
  return material;
}

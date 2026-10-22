import * as THREE from "three";

export const MAPS = [
  {
    id: "cidade",
    name: "Santa Tomata",
    subtitle: "METRÓPOLE DA COSTA",
    description:
      "Uma cidade costeira de bairros, mercados, indústria e ambições. A tua empresa começa numa pequena estufa.",
    color: "#d6ba8b",
  },
  {
    id: "estufas",
    name: "Vale da Colheita",
    subtitle: "CINTURA AGRÍCOLA",
    description:
      "Complexos de estufas, quintas, cooperativas e estradas rurais na origem da tua colheita.",
    color: "#8ea27a",
  },
  {
    id: "porto",
    name: "Porto Vermelho",
    subtitle: "PORTA PARA O MUNDO",
    description:
      "Cais, armazéns, linhas de contentores e uma cidade portuária ligada aos mercados de exportação.",
    color: "#78969c",
  },
];

// Everything is generated locally. Shared, spatially batched geometry keeps a
// kilometre-wide city affordable without fetching meshes, images or textures.
export function buildWorld(scene, mapId = "cidade", quality = "medium") {
  const config = MAPS.find((map) => map.id === mapId) || MAPS[0];
  const city = config.id === "cidade",
    farm = config.id === "estufas";
  const half = city ? 510 : 250,
    roadStep = 96,
    roadLines = [];
  for (let p = -(city ? 480 : 192); p <= (city ? 480 : 192); p += roadStep)
    roadLines.push(p);
  const bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half };
  const group = new THREE.Group();
  group.name = `world-${config.id}`;
  const colliders = [],
    roads = [],
    districts = [],
    businessLocations = [];
  const locationSigns = new Map();
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    batches = new Map();
  const high = quality === "high",
    low = quality === "low",
    sectorSize = city ? 192 : 128;
  const stats = {
    buildings: 0,
    greenhouses: 0,
    areaKm2: Math.round((half * 2) ** 2 / 10000) / 100,
    roadStep,
  };
  let companyPhase = 0,
    detailLevel = 0;
  const companyMeshes = [],
    renderBatches = [];
  let companyLevels = [true, false, false, false];
  const renderFocus = { x: 0, z: 86 };
  let seed = city ? 38193 : farm ? 89212 : 54276;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const choose = (list) => list[Math.floor(random() * list.length)];
  const geometry = (value) => (geometries.add(value), value);
  const material = (options) => {
    const value = new THREE.MeshStandardMaterial(options);
    materials.add(value);
    return value;
  };
  const physical = (options) => {
    const value = new THREE.MeshPhysicalMaterial(options);
    materials.add(value);
    return value;
  };
  const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = geometry(
    new THREE.CylinderGeometry(1, 1, 1, low ? 7 : 10),
  );
  const sphereGeo = geometry(
    new THREE.SphereGeometry(1, low ? 7 : 10, low ? 5 : 7),
  );
  const foliageGeo = geometry(new THREE.IcosahedronGeometry(1, high ? 2 : 1));
  const roofGeo = geometry(new THREE.BufferGeometry());
  roofGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0,
        1, 0.5, -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1,
        0.5, 0, 1, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0,
        1, 0.5, 0.5, 0, 0.5,
      ],
      3,
    ),
  );
  roofGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0.5, 1, 1, 0, 0, 0, 1, 0, 0.5, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1,
        0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
      ],
      2,
    ),
  );
  roofGeo.computeVertexNormals();
  const planeCache = new Map();
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler();
  function canvasTexture(canvas, color = true) {
    const tex = new THREE.CanvasTexture(canvas);
    if (color) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = high ? 8 : 4;
    textures.add(tex);
    return tex;
  }
  function surface(kind, size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d"),
      image = context.createImageData(size, size),
      heights = new Float32Array(size * size);
    const colors = {
      asphalt: [70, 72, 69],
      stone: [179, 175, 160],
      plaster: [213, 207, 188],
      concrete: [172, 172, 161],
      brick: [157, 104, 77],
      soil: [93, 78, 56],
      grass: [115, 127, 83],
      roof: [140, 84, 58],
      metal: [173, 181, 175],
    };
    const base = colors[kind] || colors.concrete;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const index = y * size + x,
          grain = (random() - 0.5) * (kind === "asphalt" ? 21 : 17);
        const mottling =
          (Math.sin(x * 0.037) * Math.cos(y * 0.046) * 7 +
            Math.sin(x * 0.151 + y * 0.083) * 2) *
          (kind === "asphalt" ? 0.2 : 1);
        let seam = 0;
        if (kind === "stone") seam = x % 64 < 2 || y % 32 < 2 ? -28 : 0;
        if (kind === "brick")
          seam =
            y % 32 < 3 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 3
              ? -38
              : 0;
        if (kind === "roof")
          seam =
            x % 22 < 2 || y % 32 < 2
              ? -28
              : Math.sin(((x % 22) / 22) * Math.PI) * 8;
        if (kind === "metal") seam = x % 24 < 3 ? -21 : Math.sin(x * 0.26) * 7;
        heights[index] = grain * 0.5 + mottling + seam;
        for (let c = 0; c < 3; c++)
          image.data[index * 4 + c] = THREE.MathUtils.clamp(
            base[c] + grain + mottling + seam,
            0,
            255,
          );
        image.data[index * 4 + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    if (kind === "asphalt") {
      context.strokeStyle = "rgba(24,27,25,.28)";
      context.lineWidth = 0.7;
      for (let line = 0; line < 5; line++) {
        context.beginPath();
        let x = random() * size,
          y = random() * size;
        context.moveTo(x, y);
        for (let i = 0; i < 7; i++) {
          x += (random() - 0.5) * 35;
          y += random() * 22;
          context.lineTo(x, y);
        }
        context.stroke();
      }
    }
    if (kind === "plaster" || kind === "concrete") {
      context.fillStyle = "rgba(76,80,61,.045)";
      for (let i = 0; i < 45; i++)
        context.fillRect(
          random() * size,
          random() * size,
          1 + random() * 5,
          10 + random() * 40,
        );
    }
    const normal = document.createElement("canvas");
    normal.width = normal.height = size;
    const nc = normal.getContext("2d"),
      ni = nc.createImageData(size, size);
    const rough = document.createElement("canvas");
    rough.width = rough.height = size;
    const rc = rough.getContext("2d"),
      ri = rc.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x,
          dx =
            heights[y * size + ((x + 1) % size)] -
            heights[y * size + ((x + size - 1) % size)],
          dy =
            heights[((y + 1) % size) * size + x] -
            heights[((y + size - 1) % size) * size + x];
        ni.data[i * 4] = 128 - dx * 1.7;
        ni.data[i * 4 + 1] = 128 - dy * 1.7;
        ni.data[i * 4 + 2] = 252;
        ni.data[i * 4 + 3] = 255;
        const roughness = 190 + Math.abs(heights[i]) * 0.9;
        ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = roughness;
        ri.data[i * 4 + 3] = 255;
      }
    nc.putImageData(ni, 0, 0);
    rc.putImageData(ri, 0, 0);
    return {
      map: canvasTexture(canvas),
      normalMap: canvasTexture(normal, false),
      roughnessMap: canvasTexture(rough, false),
    };
  }
  const surfaces = {};
  for (const name of [
    "asphalt",
    "stone",
    "plaster",
    "concrete",
    "brick",
    "soil",
    "grass",
    "roof",
    "metal",
  ])
    surfaces[name] = surface(name);
  const mats = {
    grass: material({
      color: "#b5bd92",
      ...surfaces.grass,
      roughness: 1,
      normalScale: new THREE.Vector2(0.18, 0.18),
    }),
    asphalt: material({
      color: "#b8b8af",
      ...surfaces.asphalt,
      roughness: 0.97,
      normalScale: new THREE.Vector2(0.12, 0.12),
    }),
    stone: material({
      color: "#eee8d6",
      ...surfaces.stone,
      roughness: 0.88,
      normalScale: new THREE.Vector2(0.4, 0.4),
    }),
    plaster: material({
      color: "#eee8d8",
      ...surfaces.plaster,
      roughness: 0.88,
      normalScale: new THREE.Vector2(0.2, 0.2),
    }),
    concrete: material({
      color: "#d0d2c4",
      ...surfaces.concrete,
      roughness: 0.9,
      normalScale: new THREE.Vector2(0.3, 0.3),
    }),
    brick: material({
      color: "#f0e6cf",
      ...surfaces.brick,
      roughness: 0.84,
      normalScale: new THREE.Vector2(0.6, 0.6),
    }),
    roof: material({
      color: "#e8c7a5",
      ...surfaces.roof,
      roughness: 0.83,
      normalScale: new THREE.Vector2(0.7, 0.7),
    }),
    steel: material({
      color: "#9aa79e",
      ...surfaces.metal,
      roughness: 0.4,
      metalness: 0.65,
      normalScale: new THREE.Vector2(0.12, 0.12),
    }),
    dark: material({ color: "#263a37", roughness: 0.55, metalness: 0.4 }),
    wood: material({ color: "#947556", ...surfaces.plaster, roughness: 0.93 }),
    soil: material({
      color: "#b5a58c",
      ...surfaces.soil,
      roughness: 1,
      normalScale: new THREE.Vector2(0.65, 0.65),
    }),
    foliage: material({ color: "#566c41", roughness: 1 }),
    leaf: material({ color: "#456036", roughness: 0.96 }),
    tomato: material({ color: "#be432a", roughness: 0.4 }),
    white: material({ color: "#e8e7d9", roughness: 0.77 }),
    ochre: material({ color: "#c99d49", roughness: 0.77, metalness: 0.13 }),
    window: physical({
      color: "#779092",
      roughness: 0.17,
      metalness: 0.62,
      clearcoat: 0.8,
      clearcoatRoughness: 0.11,
      envMapIntensity: 1.2,
    }),
    glass: physical({
      color: "#a3c8ba",
      transparent: true,
      opacity: 0.2,
      roughness: 0.17,
      metalness: 0.15,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    water: physical({
      color: "#497e83",
      ...surfaces.asphalt,
      map: null,
      roughness: 0.18,
      metalness: 0.12,
      normalScale: new THREE.Vector2(0.2, 0.2),
      clearcoat: 1,
    }),
    red: material({ color: "#a84733", roughness: 0.7 }),
    black: material({ color: "#242a25", roughness: 0.9 }),
    warmLight: material({
      color: "#e3dcc1",
      emissive: "#b7a376",
      emissiveIntensity: 0.15,
      roughness: 0.4,
    }),
  };
  // World-space triplanar colour prevents a metre of plaster or asphalt from
  // stretching over an entire instanced tower. This also removes visible UV
  // seams between neighbouring street segments.
  function worldSurface(m, tile) {
    m.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 surfacePosition=vec4(transformed,1.0);
        vec3 surfaceNormal=normal;
        #ifdef USE_INSTANCING
          surfacePosition=instanceMatrix*surfacePosition;
          surfaceNormal=mat3(instanceMatrix)*surfaceNormal;
        #endif
        vSurfaceWorld=(modelMatrix*surfacePosition).xyz;
        vSurfaceNormal=normalize(mat3(modelMatrix)*surfaceNormal);`,
      );
      shader.fragmentShader =
        "varying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
        vec3 blend=pow(abs(normalize(vSurfaceNormal)),vec3(8.0));
        blend/=max(.001,blend.x+blend.y+blend.z);
        vec3 worldUV=vSurfaceWorld/${Number(tile).toFixed(3)};
        vec4 sampledDiffuseColor=texture2D(map,worldUV.zy)*blend.x+texture2D(map,worldUV.xz)*blend.y+texture2D(map,worldUV.xy)*blend.z;
        diffuseColor*=sampledDiffuseColor;
        #endif`,
      );
    };
    m.customProgramCacheKey = () => `world-surface-${tile}`;
  }
  for (const [name, tile] of [
    ["asphalt", 2],
    ["stone", 1.2],
    ["plaster", 2],
    ["concrete", 2],
    ["brick", 2],
    ["roof", 2],
    ["grass", 2.5],
    ["soil", 1.5],
    ["steel", 2],
  ])
    worldSurface(mats[name], tile);
  mats.water.normalMap = surfaces.asphalt.normalMap.clone();
  textures.add(mats.water.normalMap);
  // One alpha-tested facade proxy supplies distant windows after the real
  // extruded frames leave their detail range. This avoids blank skyline boxes
  // without keeping thousands of balcony pieces on the GPU at long range.
  const facadeCanvas = document.createElement("canvas");
  facadeCanvas.width = facadeCanvas.height = 256;
  const facadeContext = facadeCanvas.getContext("2d");
  facadeContext.fillStyle = "#a4aaa0";
  facadeContext.fillRect(61, 34, 134, 183);
  facadeContext.fillStyle = "#33494b";
  facadeContext.fillRect(68, 41, 120, 164);
  facadeContext.fillStyle = "#789393";
  facadeContext.fillRect(72, 45, 49, 72);
  facadeContext.fillStyle = "#536e70";
  facadeContext.fillRect(131, 45, 52, 72);
  facadeContext.fillStyle = "#b6beb2";
  facadeContext.fillRect(125, 43, 4, 160);
  facadeContext.fillStyle = "#d3d1be";
  facadeContext.fillRect(54, 208, 148, 9);
  const facadePlaneGeo = geometry(new THREE.PlaneGeometry(1, 1));
  const farFacade = material({
    map: canvasTexture(facadeCanvas),
    alphaTest: 0.45,
    roughness: 0.52,
    metalness: 0.12,
  });
  farFacade.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vProxyWorld;\nvarying vec3 vProxyNormal;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 proxyPosition=vec4(transformed,1.0);vec3 proxyNormal=normal;
      #ifdef USE_INSTANCING
        proxyPosition=instanceMatrix*proxyPosition;proxyNormal=mat3(instanceMatrix)*proxyNormal;
      #endif
      vProxyWorld=(modelMatrix*proxyPosition).xyz;vProxyNormal=normalize(mat3(modelMatrix)*proxyNormal);`,
    );
    shader.fragmentShader =
      "varying vec3 vProxyWorld;\nvarying vec3 vProxyNormal;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
      vec2 facadeUV=abs(vProxyNormal.x)>.5?vec2(vProxyWorld.z/4.4,vProxyWorld.y/3.1):vec2(vProxyWorld.x/4.4,vProxyWorld.y/3.1);
      vec4 sampledDiffuseColor=texture2D(map,facadeUV);
      diffuseColor*=sampledDiffuseColor;
      diffuseColor.a*=smoothstep(${low ? 155 : high ? 355 : 245}.0,${low ? 195 : high ? 395 : 285}.0,distance(cameraPosition,vProxyWorld));
      #endif`,
    );
  };
  farFacade.customProgramCacheKey = () => "distant-facade-" + quality;
  function append(g, m, matrix, x, z, color) {
    const chunk = detailLevel
      ? `${Math.floor(x / (detailLevel === 1 ? 96 : sectorSize))}:${Math.floor(z / (detailLevel === 1 ? 96 : sectorSize))}`
      : "global";
    const key = `${g.uuid}:${m.uuid}:${chunk}:${companyPhase}:${detailLevel}`;
    if (!batches.has(key))
      batches.set(key, { g, m, items: [], companyPhase, detailLevel });
    batches.get(key).items.push({ matrix: matrix.clone(), color });
  }
  function instance(
    g,
    m,
    x,
    y,
    z,
    sx,
    sy,
    sz,
    yaw = 0,
    color = null,
    rx = 0,
    rz = 0,
  ) {
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    euler.set(rx, yaw, rz);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    append(g, m, matrix, x, z, color);
  }
  const box = (m, x, y, z, sx, sy, sz, yaw = 0, color = null) =>
    instance(boxGeo, m, x, y, z, sx, sy, sz, yaw, color);
  const cyl = (m, x, y, z, r, height, color = null) =>
    instance(cylinderGeo, m, x, y, z, r, height, r, 0, color);
  const orb = (m, x, y, z, sx, sy, sz, color = null) =>
    instance(foliageGeo, m, x, y, z, sx, sy, sz, 0, color);
  function beam(m, ax, ay, az, bx, by, bz, radius = 0.06) {
    const a = new THREE.Vector3(ax, ay, az),
      b = new THREE.Vector3(bx, by, bz),
      delta = b.sub(a),
      length = delta.length();
    position.copy(a).addScaledVector(delta, 0.5);
    quaternion.setFromUnitVectors(up, delta.normalize());
    scale.set(radius, length, radius);
    matrix.compose(position, quaternion, scale);
    append(cylinderGeo, m, matrix, position.x, position.z, null);
  }
  function collision(x, z, width, depth, height = 10) {
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      minY: 0,
      maxY: height,
      companyPhase,
    });
  }
  function plane(width, depth, tile = 1) {
    const key = width + ":" + depth + ":" + tile;
    if (planeCache.has(key)) return planeCache.get(key);
    const g = geometry(new THREE.PlaneGeometry(width, depth));
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * width) / tile, (uv.getY(i) * depth) / tile);
    planeCache.set(key, g);
    return g;
  }
  const terrainGeo = plane(half * 2 + 450, half * 2 + (farm ? 450 : 225), 3);
  instance(terrainGeo, mats.grass, 0, -0.035, farm ? 0 : -112.5, 1, 1, 1);
  function sign(
    text,
    x,
    y,
    z,
    width = 8,
    height = 1.1,
    background = "#283e36",
    foreground = "#eee9d8",
    yaw = 0,
    sub = "",
  ) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = foreground;
    ctx.globalAlpha = 0.45;
    ctx.strokeRect(13, 13, 998, 230);
    ctx.globalAlpha = 1;
    ctx.fillStyle = foreground;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${text.length > 24 ? 55 : 74}px Arial`;
    ctx.fillText(text, 512, sub ? 100 : 128, 950);
    if (sub) {
      ctx.font = "25px Arial";
      ctx.globalAlpha = 0.8;
      ctx.fillText(sub, 512, 178, 950);
      ctx.globalAlpha = 1;
    }
    const m = material({ map: canvasTexture(c), roughness: 0.73 });
    const g = geometry(new THREE.PlaneGeometry(width, height));
    const object = new THREE.Mesh(g, m);
    object.position.set(x, y, z);
    object.rotation.y = Number(yaw);
    object.userData.labelCanvas = c;
    object.userData.companyPhase = companyPhase;
    group.add(object);
    if (companyPhase) companyMeshes.push(object);
    return object;
  }
  function tree(x, z, size = 1, olive = false) {
    cyl(mats.wood, x, 2.05 * size, z, 0.2 * size, 4.1 * size);
    beam(
      mats.wood,
      x,
      2.5 * size,
      z,
      x + 1.05 * size,
      4.3 * size,
      z - 0.7 * size,
      0.11 * size,
    );
    beam(
      mats.wood,
      x,
      2.8 * size,
      z,
      x - 1.0 * size,
      4.5 * size,
      z + 0.65 * size,
      0.12 * size,
    );
    const tone = olive
      ? choose(["#6a7957", "#7c8667", "#596e4c"])
      : choose(["#53734c", "#718452", "#5f7746"]);
    detailLevel = 2;
    orb(
      mats.foliage,
      x,
      5.2 * size,
      z,
      2.25 * size,
      olive ? 1.7 * size : 2.7 * size,
      2.0 * size,
      tone,
    );
    orb(
      mats.foliage,
      x + 1.2 * size,
      4.65 * size,
      z - 0.8 * size,
      1.55 * size,
      1.65 * size,
      1.5 * size,
      tone,
    );
    orb(
      mats.foliage,
      x - 1.15 * size,
      4.75 * size,
      z + 0.7 * size,
      1.65 * size,
      1.65 * size,
      1.6 * size,
      tone,
    );
    detailLevel = 0;
    collision(x, z, 0.6 * size, 0.6 * size, 5 * size);
  }
  function lamp(x, z, yaw = 0) {
    cyl(mats.dark, x, 4.3, z, 0.105, 8.6);
    beam(
      mats.dark,
      x,
      8.35,
      z,
      x + Math.sin(yaw) * 1.7,
      8.45,
      z + Math.cos(yaw) * 1.7,
      0.08,
    );
    box(
      mats.dark,
      x + Math.sin(yaw) * 1.65,
      8.4,
      z + Math.cos(yaw) * 1.65,
      0.5,
      0.18,
      1.0,
      yaw,
    );
    box(
      mats.warmLight,
      x + Math.sin(yaw) * 1.65,
      8.29,
      z + Math.cos(yaw) * 1.65,
      0.38,
      0.025,
      0.7,
      yaw,
    );
  }
  function bench(x, z, yaw = 0) {
    for (const offset of [-0.22, 0, 0.22])
      box(mats.wood, x, 0.61, z + offset, 2.5, 0.1, 0.17, yaw);
    for (const h of [0.88, 1.1, 1.32])
      box(mats.wood, x, h, z - 0.35, 2.5, 0.14, 0.09, yaw);
    for (const dx of [-0.88, 0.88]) {
      box(mats.dark, x + dx, 0.3, z, 0.08, 0.6, 0.6, yaw);
      box(mats.dark, x + dx, 0.93, z - 0.34, 0.08, 0.9, 0.08, yaw);
    }
  }
  function planter(x, z, width = 4, depth = 2) {
    box(mats.concrete, x, 0.35, z, width, 0.7, depth);
    box(mats.soil, x, 0.72, z, width - 0.22, 0.08, depth - 0.22);
    for (let p = -width / 2 + 0.5; p < width / 2; p += 0.65)
      orb(
        mats.leaf,
        x + p,
        1,
        z,
        0.55,
        0.55,
        0.5,
        choose(["#5b7547", "#7a8553"]),
      );
    collision(x, z, width, depth, 0.9);
  }
  function bollard(x, z) {
    cyl(mats.dark, x, 0.47, z, 0.12, 0.95);
    cyl(mats.steel, x, 0.91, z, 0.125, 0.06);
  }
  function crate(x, z, stack = 1) {
    for (let i = 0; i < stack; i++) {
      box(mats.wood, x, 0.48 + i * 0.98, z, 1.1, 0.92, 0.85);
      for (const side of [-1, 1]) {
        box(mats.dark, x + side * 0.43, 0.48 + i * 0.98, z, 0.05, 0.93, 0.88);
        box(mats.wood, x, 0.23 + i * 0.98, z + side * 0.45, 1.14, 0.09, 0.06);
      }
    }
    collision(x, z, 1.12, 0.9, stack);
  }
  function crop(x, z, size = 1) {
    cyl(mats.wood, x, 1.2 * size, z, 0.035, 2.4 * size);
    orb(
      mats.leaf,
      x,
      0.95 * size,
      z,
      0.4 * size,
      0.7 * size,
      0.38 * size,
      "#4f693b",
    );
    orb(
      mats.leaf,
      x + 0.15 * size,
      1.55 * size,
      z - 0.08 * size,
      0.37 * size,
      0.55 * size,
      0.33 * size,
      "#658348",
    );
    instance(
      sphereGeo,
      mats.tomato,
      x - 0.29 * size,
      1.15 * size,
      z + 0.2 * size,
      0.12 * size,
      0.11 * size,
      0.12 * size,
    );
    instance(
      sphereGeo,
      mats.tomato,
      x + 0.25 * size,
      1.52 * size,
      z + 0.18 * size,
      0.14 * size,
      0.12 * size,
      0.14 * size,
    );
  }
  function building(
    x,
    z,
    width,
    depth,
    height,
    style = "old",
    tint = null,
    label = null,
  ) {
    stats.buildings++;
    const modern = style === "modern",
      industrial = style === "industrial",
      brick = style === "brick";
    const main = brick ? mats.brick : modern ? mats.concrete : mats.plaster;
    const color =
      tint ||
      choose(
        modern
          ? ["#b7c4c1", "#ced1c5", "#b9bdb0"]
          : industrial
            ? ["#c8c9bb", "#acb9b1", "#c5b79d"]
            : ["#f3e6cc", "#e0cfb4", "#d9d8c2", "#e6d6bb", "#d8c3aa"],
      );
    box(main, x, height / 2, z, width, height, depth, 0, color);
    for (const side of [-1, 1]) {
      instance(
        facadePlaneGeo,
        farFacade,
        x,
        height / 2,
        z + side * (depth / 2 + 0.13),
        width,
        height,
        1,
        side < 0 ? Math.PI : 0,
      );
      instance(
        facadePlaneGeo,
        farFacade,
        x + side * (width / 2 + 0.13),
        height / 2,
        z,
        depth,
        height,
        1,
        (side * Math.PI) / 2,
      );
    }

    box(
      mats.concrete,
      x,
      0.45,
      z,
      width + 0.12,
      0.9,
      depth + 0.12,
      0,
      "#999c91",
    );
    if (modern || industrial) {
      box(mats.concrete, x, height + 0.15, z, width + 0.6, 0.3, depth + 0.6);
      for (const side of [-1, 1]) {
        box(
          mats.concrete,
          x + side * (width / 2),
          height + 0.55,
          z,
          0.18,
          0.8,
          depth + 0.3,
        );
        box(
          mats.concrete,
          x,
          height + 0.55,
          z + side * (depth / 2),
          width + 0.3,
          0.8,
          0.18,
        );
      }
      if (width > 14) {
        box(
          mats.steel,
          x + width * 0.22,
          height + 0.75,
          z - depth * 0.2,
          2.7,
          1.1,
          2,
        );
        box(
          mats.dark,
          x + width * 0.22,
          height + 1.3,
          z - depth * 0.2,
          2.2,
          0.12,
          1.5,
        );
      }
    } else {
      instance(
        roofGeo,
        mats.roof,
        x,
        height,
        z,
        width + 1.2,
        Math.min(4, width * 0.17),
        depth + 1.2,
        0,
        choose(["#be8364", "#c59172", "#aa7457"]),
      );
      box(
        mats.concrete,
        x,
        height - 0.1,
        z,
        width + 0.75,
        0.24,
        depth + 0.75,
        0,
        "#d9cfb9",
      );
      box(
        mats.brick,
        x - width * 0.27,
        height + 2.1,
        z - depth * 0.2,
        1.1,
        2.9,
        1.1,
      );
      box(
        mats.dark,
        x - width * 0.27,
        height + 3.6,
        z - depth * 0.2,
        1.4,
        0.16,
        1.4,
      );
    }
    const floors = Math.max(1, Math.floor((height - 0.5) / 3.1)),
      columns = Math.max(2, Math.floor(width / 4.4)),
      sideColumns = Math.max(2, Math.floor(depth / 4.7));
    const windowWidth = modern ? 2.1 : 1.45,
      windowHeight = modern ? 2.05 : 1.7;
    detailLevel = 1;
    for (let floor = 0; floor < floors; floor++) {
      const y = 2.1 + floor * 3.1;
      if (y + windowHeight * 0.5 > height - 0.35) continue;
      for (const side of [-1, 1]) {
        for (let col = 0; col < columns; col++) {
          const wx = x - width / 2 + ((col + 0.5) * width) / columns,
            wz = z + side * (depth / 2 + 0.055);
          box(
            mats.dark,
            wx,
            y,
            wz,
            windowWidth + 0.2,
            windowHeight + 0.22,
            0.1,
          );
          box(
            mats.window,
            wx,
            y,
            wz + side * 0.065,
            windowWidth,
            windowHeight,
            0.045,
          );
          if (!low) {
            box(
              mats.steel,
              wx,
              y,
              wz + side * 0.095,
              0.045,
              windowHeight,
              0.065,
            );
            box(
              mats.concrete,
              wx,
              y - windowHeight / 2 - 0.11,
              wz + side * 0.13,
              windowWidth + 0.42,
              0.12,
              0.3,
            );
          }
          if (!modern && !industrial && !low) {
            for (const sx of [-1, 1])
              box(
                mats.dark,
                wx + sx * (windowWidth / 2 + 0.2),
                y,
                wz + side * 0.02,
                0.25,
                windowHeight + 0.15,
                0.1,
                0,
                "#4c6253",
              );
            if (floor === 1 && col % 2 === 0) {
              box(
                mats.concrete,
                wx,
                y - windowHeight / 2 - 0.18,
                wz + side * 0.44,
                2.3,
                0.16,
                0.95,
              );
              box(mats.dark, wx, y - 0.15, wz + side * 0.86, 2.3, 0.045, 0.045);
              for (const offset of [-1, -0.5, 0, 0.5, 1])
                box(
                  mats.dark,
                  wx + offset,
                  y - 0.52,
                  wz + side * 0.86,
                  0.035,
                  0.8,
                  0.035,
                );
            }
          }
        }
        for (let col = 0; col < sideColumns; col++) {
          const wx = x + side * (width / 2 + 0.055),
            wz = z - depth / 2 + ((col + 0.5) * depth) / sideColumns;
          box(mats.dark, wx, y, wz, 0.1, windowHeight + 0.2, windowWidth + 0.2);
          box(
            mats.window,
            wx + side * 0.065,
            y,
            wz,
            0.045,
            windowHeight,
            windowWidth,
          );
          box(
            mats.concrete,
            wx + side * 0.13,
            y - windowHeight / 2 - 0.11,
            wz,
            0.3,
            0.12,
            windowWidth + 0.4,
          );
        }
      }
    }
    detailLevel = 0;
    for (const side of [-1, 1]) {
      box(
        mats.dark,
        x,
        1.4,
        z + side * (depth / 2 + 0.095),
        industrial ? width * 0.55 : 2.6,
        2.8,
        0.15,
      );
      if (!industrial) {
        box(mats.window, x, 1.5, z + side * (depth / 2 + 0.18), 2.3, 2.5, 0.03);
        box(mats.steel, x, 1.5, z + side * (depth / 2 + 0.23), 0.07, 2.5, 0.05);
      }
      if (!modern && !industrial)
        box(
          mats.red,
          x,
          3.05,
          z + side * (depth / 2 + 0.85),
          Math.min(width * 0.65, 11),
          0.16,
          1.85,
          0,
          choose(["#83654d", "#7a8a68", "#b2a17d", "#a66c54"]),
        );
    }
    if (label)
      sign(
        label,
        x,
        3.8,
        z + depth / 2 + 0.15,
        Math.min(width * 0.78, 18),
        1.15,
        "#344d41",
        "#eee4ca",
      );
    collision(x, z, width + 0.12, depth + 0.12, height + 2);
  }
  function greenhouse(x, z, width = 24, length = 38, withPlants = true) {
    stats.greenhouses++;
    box(mats.concrete, x, 0.07, z, width + 0.4, 0.14, length + 0.4);
    const side = width / 2,
      halfLength = length / 2;
    box(mats.glass, x - side, 2.4, z, 0.08, 4.8, length);
    box(mats.glass, x + side, 2.4, z, 0.08, 4.8, length);
    for (let dz = -halfLength; dz <= halfLength + 0.01; dz += length / 8) {
      beam(mats.steel, x - side, 0, z + dz, x - side, 4.8, z + dz, 0.065);
      beam(mats.steel, x + side, 0, z + dz, x + side, 4.8, z + dz, 0.065);
      beam(mats.steel, x - side, 4.8, z + dz, x, 7, z + dz, 0.06);
      beam(mats.steel, x, 7, z + dz, x + side, 4.8, z + dz, 0.06);
    }
    beam(mats.steel, x, 7, z - halfLength, x, 7, z + halfLength, 0.075);
    for (const sideSign of [-1, 1]) {
      beam(
        mats.steel,
        x + sideSign * side,
        4.8,
        z - halfLength,
        x + sideSign * side,
        4.8,
        z + halfLength,
        0.07,
      );
      const roof = geometry(
        new THREE.PlaneGeometry(Math.hypot(side, 2.2), length),
      );
      roof.rotateX(-Math.PI / 2);
      roof.rotateZ(sideSign * Math.atan2(2.2, side));
      instance(roof, mats.glass, x + (sideSign * side) / 2, 5.9, z, 1, 1, 1);
      collision(x + sideSign * side, z, 0.25, length, 4.8);
      if (withPlants) {
        const bedX = x + sideSign * width * 0.28;
        box(mats.wood, bedX, 0.35, z, width * 0.24, 0.7, length - 4);
        box(mats.soil, bedX, 0.74, z, width * 0.22, 0.06, length - 4);
        collision(bedX, z, width * 0.24, length - 4, 2.4);
        for (let dz = -halfLength + 3; dz < halfLength - 1; dz += low ? 4 : 2.8)
          crop(bedX, z + dz, 1.1);
      }
    }
    for (const end of [-1, 1])
      box(mats.dark, x, 4.65, z + end * halfLength, 4.5, 0.45, 0.18);
  }
  function farmingBlock(x, z, width = 72, depth = 72, rows = true) {
    box(mats.soil, x, 0.025, z, width, 0.06, depth);
    if (rows) {
      for (let px = -width / 2 + 3; px < width / 2 - 1; px += 5) {
        box(
          mats.leaf,
          x + px,
          0.28,
          z,
          1.7,
          0.5,
          depth - 4,
          0,
          choose(["#6e814e", "#617945", "#7a8756"]),
        );
        for (let dz = -depth / 2 + 5; dz < depth / 2; dz += low ? 15 : 10)
          cyl(mats.wood, x + px, 1, z + dz, 0.035, 2);
      }
    }
    for (const dx of [-width / 2, width / 2])
      for (let dz = -depth / 2; dz <= depth / 2; dz += 12)
        cyl(mats.wood, x + dx, 0.6, z + dz, 0.055, 1.2);
  }
  function fountain(x, z, radius = 6) {
    cyl(mats.concrete, x, 0.4, z, radius, 0.8);
    cyl(mats.water, x, 0.84, z, radius - 0.45, 0.04);
    cyl(mats.concrete, x, 1.4, z, 0.85, 1.2);
    cyl(mats.concrete, x, 2.1, z, 2.3, 0.25);
    cyl(mats.water, x, 2.25, z, 2.05, 0.035);
    collision(x, z, radius * 2, radius * 2, 2.2);
  }
  function market(x, z) {
    for (const dx of [-15, 0, 15])
      for (const dz of [-17, 17]) {
        const px = x + dx,
          pz = z + dz;
        box(mats.wood, px, 1, pz, 9, 2, 3.8);
        box(mats.soil, px, 2.03, pz, 8.7, 0.04, 3.5);
        for (const sx of [-1, 1])
          box(mats.wood, px + sx * 4.2, 2, pz, 0.08, 4, 0.08);
        box(
          mats.red,
          px,
          4.05,
          pz,
          10,
          0.15,
          5.6,
          0,
          choose(["#9c5740", "#71805a", "#c2aa7f"]),
        );
        for (let p = -3.8; p < 4; p += 0.5)
          for (const dz2 of [-0.8, 0.3])
            instance(
              sphereGeo,
              mats.tomato,
              px + p,
              2.2,
              pz + dz2,
              0.16,
              0.14,
              0.16,
            );
        collision(px, pz, 9, 3.8, 2.1);
      }
    sign(
      "MERCADO DA RIBEIRA",
      x,
      5.8,
      z + 28,
      22,
      1.6,
      "#3c5041",
      "#e6dfc7",
      0,
      "DA HORTA PARA A CIDADE",
    );
    for (const side of [-1, 1]) {
      beam(
        mats.dark,
        x + side * 11,
        0,
        z + 28,
        x + side * 11,
        6.4,
        z + 28,
        0.1,
      );
    }
  }
  function warehouse(
    x,
    z,
    width = 66,
    depth = 55,
    label = "LOGÍSTICA POMODORO",
  ) {
    building(x, z, width, depth, 8, "industrial", "#bdc5b7");
    for (const side of [-1, 1]) {
      box(
        mats.steel,
        x + side * width * 0.25,
        2.3,
        z + depth / 2 + 0.14,
        9,
        4.6,
        0.13,
      );
      for (let i = 0; i < 6; i++)
        box(
          mats.dark,
          x + side * width * 0.25,
          1 + i * 0.65,
          z + depth / 2 + 0.23,
          8.8,
          0.025,
          0.025,
        );
    }
    return sign(
      label,
      x,
      6.4,
      z + depth / 2 + 0.18,
      Math.min(35, width * 0.7),
      1.55,
      "#4d5c51",
      "#eee8d9",
    );
  }
  function container(x, z, height = 1, tint = "#8e6850", length = 12) {
    for (let i = 0; i < height; i++) {
      box(mats.steel, x, 1.45 + i * 2.95, z, 2.45, 2.9, length, 0, tint);
      for (let p = -length / 2 + 0.35; p < length / 2; p += 0.7)
        for (const side of [-1, 1])
          box(
            mats.dark,
            x + side * 1.24,
            1.45 + i * 2.95,
            z + p,
            0.035,
            2.75,
            0.07,
            0,
            tint,
          );
      for (const side of [-1, 1])
        box(
          mats.steel,
          x + side * 0.55,
          1.45 + i * 2.95,
          z + length / 2 + 0.04,
          0.07,
          2.7,
          0.06,
        );
    }
    collision(x, z, 2.5, length, height * 2.95);
  }
  function crane(x, z) {
    for (const dx of [-10, 10])
      for (const dz of [-7, 7]) {
        beam(mats.ochre, x + dx, 0, z + dz, x + dx, 31, z + dz, 0.5);
        collision(x + dx, z + dz, 1.2, 1.2, 31);
      }
    box(mats.ochre, x, 30, z, 22, 1.6, 2.5);
    box(mats.ochre, x, 32, z + 19, 1.5, 1.2, 54);
    for (let i = -7; i < 37; i += 5) {
      beam(mats.ochre, x - 0.8, 32, z + i, x + 0.8, 34, z + i + 4, 0.08);
      beam(mats.ochre, x + 0.8, 32, z + i, x - 0.8, 34, z + i + 4, 0.08);
    }
    beam(mats.dark, x, 31, z + 41, x, 16, z + 41, 0.04);
    box(mats.dark, x, 15.5, z + 41, 2.2, 0.4, 2.2);
    box(mats.window, x - 2, 28, z - 4, 3, 3, 4);
  }
  function vessel(x, z) {
    box(mats.dark, x, 1.4, z, 24, 4, 76);
    box(mats.red, x, -0.1, z, 23, 1.4, 76);
    box(mats.concrete, x, 3.65, z, 23.2, 0.4, 74);
    box(mats.white, x, 10, z + 26, 20, 12, 16);
    box(mats.window, x, 12.4, z + 17.8, 18, 2, 0.1);
    box(mats.dark, x, 16.4, z + 26, 22, 0.55, 18);
    for (const dx of [-6, 0, 6])
      for (const dz of [-24, -9, 6])
        for (let level = 0; level < 2; level++)
          box(
            mats.steel,
            x + dx,
            5.2 + level * 3,
            z + dz,
            5.5,
            2.9,
            13,
            0,
            choose(["#8c503a", "#647976", "#b18d54", "#6f7b62"]),
          );
    beam(mats.steel, x, 17, z + 26, x, 25, z + 26, 0.08);
    beam(mats.steel, x - 4, 20, z + 26, x + 4, 20, z + 26, 0.06);
  }
  // Streets are tiled in world metres; geometry follows the grid, markings stop
  // at intersections and pavements have continuous curbs without crossing roads.
  const full = half * 2 + 10;
  function roadSurface(width, length) {
    return plane(width, length, 4);
  }
  const roadWidth = (p) => (p === 0 ? 20 : 14);
  for (const coordinate of roadLines) {
    const width = roadWidth(coordinate);
    for (const horizontal of [false, true]) {
      const g = roadSurface(width, 96);
      for (let center = -half + 48; center < half; center += 96) {
        instance(
          g,
          mats.asphalt,
          horizontal ? center : coordinate,
          0.035,
          horizontal ? coordinate : center,
          1,
          1,
          1,
          horizontal ? Math.PI / 2 : 0,
        );
      }
      roads.push({
        x: horizontal ? 0 : coordinate,
        z: horizontal ? coordinate : 0,
        width: horizontal ? full : width,
        depth: horizontal ? width : full,
      });
    }
    for (let offset = -half + 8; offset < half; offset += 12) {
      if (roadLines.every((p) => Math.abs(p - offset) > 13)) {
        box(mats.white, coordinate, 0.048, offset, 0.12, 0.012, 4.2);
        box(mats.white, offset, 0.052, coordinate, 4.2, 0.012, 0.12);
        if (coordinate === 0) {
          box(mats.white, coordinate - 4.7, 0.05, offset, 0.1, 0.013, 4.2);
          box(mats.white, coordinate + 4.7, 0.05, offset, 0.1, 0.013, 4.2);
          box(mats.white, offset, 0.056, coordinate - 4.7, 4.2, 0.013, 0.1);
          box(mats.white, offset, 0.056, coordinate + 4.7, 4.2, 0.013, 0.1);
        }
      }
    }
    for (let block = 0; block < roadLines.length - 1; block++) {
      const middle = (roadLines[block] + roadLines[block + 1]) / 2,
        length = roadStep - 19;
      for (const side of [-1, 1]) {
        const pw = 3.4,
          at = coordinate + side * (width / 2 + pw / 2);
        const pave = plane(pw, length, 0.65);
        instance(pave, mats.stone, at, 0.17, middle, 1, 1, 1);
        instance(pave, mats.stone, middle, 0.175, at, 1, 1, 1, Math.PI / 2);
        box(
          mats.concrete,
          coordinate + side * (width / 2 + 0.15),
          0.12,
          middle,
          0.28,
          0.24,
          length,
        );
        box(
          mats.concrete,
          middle,
          0.12,
          coordinate + side * (width / 2 + 0.15),
          length,
          0.24,
          0.28,
        );
        if ((block + Math.round(coordinate / 96)) % 2 === 0) {
          lamp(
            coordinate + side * (width / 2 + 2.8),
            middle,
            side < 0 ? Math.PI / 2 : -Math.PI / 2,
          );
          lamp(
            middle,
            coordinate + side * (width / 2 + 2.8),
            side < 0 ? 0 : Math.PI,
          );
        }
      }
    }
    for (const cross of roadLines) {
      if (Math.abs(cross) > half - 35) continue;
      for (let stripe = -4; stripe <= 4; stripe++) {
        box(
          mats.white,
          coordinate + stripe * 0.85,
          0.06,
          cross + 12,
          0.42,
          0.012,
          3.2,
        );
        box(
          mats.white,
          coordinate + 12,
          0.064,
          cross + stripe * 0.85,
          3.2,
          0.012,
          0.42,
        );
      }
      if ((Math.round(coordinate / 96) + Math.round(cross / 96)) % 3 === 0) {
        for (const side of [-1, 1]) {
          cyl(
            mats.dark,
            coordinate + side * 11,
            2.3,
            cross + side * 11,
            0.08,
            4.6,
          );
          box(
            mats.dark,
            coordinate + side * 11,
            4.2,
            cross + side * 11,
            0.38,
            0.85,
            0.25,
          );
          instance(
            sphereGeo,
            mats.red,
            coordinate + side * 11,
            4.45,
            cross + side * 11 + 0.15,
            0.09,
            0.09,
            0.025,
          );
        }
      }
    }
  }
  const blockCenters = [];
  for (let i = 0; i < roadLines.length - 1; i++)
    blockCenters.push((roadLines[i] + roadLines[i + 1]) / 2);
  const reserved = [];
  const reserve = (x, z) => reserved.push({ x, z });
  const isReserved = (x, z) => reserved.some((p) => p.x === x && p.z === z);
  // Locations are deliberately placed at streets/forecourts and are reachable
  // with the larger vehicle collision radius, rather than inside a solid mesh.
  const locations = city
    ? [
        { id: "sede", name: "Raiz & Sol · Sede", x: 8, z: 66, type: "company" },
        {
          id: "cooperativa",
          name: "Cooperativa da Várzea",
          x: -8,
          z: 192,
          type: "cooperative",
        },
        {
          id: "mercado",
          name: "Mercado da Ribeira",
          x: -96,
          z: -8,
          type: "market",
        },
        {
          id: "restaurantes",
          name: "Avenida dos Restaurantes",
          x: 192,
          z: -8,
          type: "restaurants",
        },
        {
          id: "porto",
          name: "Terminal de Exportação",
          x: 288,
          z: 392,
          type: "port",
        },
        {
          id: "universidade",
          name: "Instituto de Agronomia",
          x: -336,
          z: -198,
          type: "university",
        },
      ]
    : [
        { id: "sede", name: "Raiz & Sol · Sede", x: 8, z: 66, type: "company" },
        {
          id: "cooperativa",
          name: "Cooperativa do Vale",
          x: -8,
          z: 96,
          type: "cooperative",
        },
        {
          id: "mercado",
          name: "Mercado Municipal",
          x: -96,
          z: -8,
          type: "market",
        },
        {
          id: "restaurantes",
          name: "Praça dos Restaurantes",
          x: 96,
          z: -8,
          type: "restaurants",
        },
        {
          id: "porto",
          name: "Entreposto de Exportação",
          x: 96,
          z: 200,
          type: "port",
        },
        {
          id: "universidade",
          name: "Laboratório Agrícola",
          x: -192,
          z: -104,
          type: "university",
        },
      ];
  businessLocations.push(...locations);
  // Company forecourt and working greenhouse: the player's tangible beginning.
  reserve(48, 48);
  reserve(48, 144);
  building(28, 66, 29, 24, 6.6, "modern", "#d8d5bd");
  greenhouse(65, 35, 25, 43, true);
  const headquartersSign = sign(
    "RAIZ & SOL",
    28,
    5.15,
    78.2,
    17,
    1.5,
    "#2b4835",
    "#efe6ca",
    0,
    "CULTIVAR O AMANHÃ, DESDE HOJE",
  );
  farmingBlock(48, 144, 73, 73, false);
  companyPhase = 1;
  greenhouse(24, 144, 29, 63, true);
  companyPhase = 2;
  const depotSign = warehouse(62, 144, 29, 63, "RAIZ & SOL · DISTRIBUIÇÃO");
  companyPhase = 3;
  for (let x = 18; x <= 38; x += 5)
    for (const z of [61, 68]) {
      box(mats.window, x, 7.15, z, 4.2, 0.18, 5.7, 0, "#36515f");
      box(mats.steel, x, 7, z, 4.4, 0.12, 5.9);
    }
  companyPhase = 0;
  for (const x of [14, 42]) bollard(x, 81);
  for (const x of [46, 49, 52]) crate(x, 75, 2);
  planter(24, 83, 11, 1.4);
  bench(39, 82);
  if (city) {
    districts.push(
      {
        id: "fundadores",
        name: "Bairro dos Fundadores",
        x: 0,
        z: 96,
        color: "#c3b68d",
        description:
          "Pequenas empresas, a estufa herdada e as primeiras oportunidades.",
      },
      {
        id: "ribeira",
        name: "Ribeira Antiga",
        x: -96,
        z: -96,
        color: "#c2a589",
        description:
          "Mercado, ruas de fachadas antigas e a história da cidade.",
      },
      {
        id: "negocios",
        name: "Avenida Nova",
        x: 192,
        z: -96,
        color: "#8dabae",
        description:
          "Torres de escritórios, bancos e contratos de grande dimensão.",
      },
      {
        id: "campus",
        name: "Campus da Várzea",
        x: -288,
        z: -192,
        color: "#aebc99",
        description: "Investigação, inovação e agricultura de precisão.",
      },
      {
        id: "cintura",
        name: "Cintura Verde",
        x: -288,
        z: 192,
        color: "#80986c",
        description: "Cooperativas, campos e produtores locais.",
      },
      {
        id: "docas",
        name: "Docas de São Rubro",
        x: 288,
        z: 288,
        color: "#a58f77",
        description:
          "Armazéns, contentores e ligações ao mercado internacional.",
      },
      {
        id: "residencial",
        name: "Colinas do Poente",
        x: -288,
        z: -384,
        color: "#bbbdab",
        description: "Bairros residenciais e hortas comunitárias.",
      },
      {
        id: "marina",
        name: "Passeio do Atlântico",
        x: 0,
        z: 432,
        color: "#8ab0ad",
        description: "A frente marítima, hotéis e restaurantes junto ao mar.",
      },
    );
    reserve(-48, -48);
    reserve(-336, -240);
    reserve(-48, 144);
    reserve(240, -48);
    reserve(-144, 48);
    reserve(144, 432);
    for (const x of blockCenters)
      for (const z of blockCenters) {
        if (isReserved(x, z)) continue;
        if (z <= -336 && (x < -96 || x > 192)) {
          if (
            (Math.round((x + 48) / 96) + Math.round((z + 48) / 96)) % 3 ===
            0
          ) {
            greenhouse(x, z, 31, 62, true);
            building(x + 29, z + 24, 16, 17, 5, "old", "#d9d2b8");
          } else farmingBlock(x, z, 72, 72, true);
          for (const side of [-1, 1]) tree(x + side * 33, z + 33, 0.8, true);
          continue;
        }
        if (x < -240 && z > 48 && z < 336) {
          if (Math.round((z + 48) / 96) % 2 === 0) {
            farmingBlock(x, z, 68, 70, true);
            building(x + 23, z + 25, 21, 19, 5.5, "old", "#d2c9b0");
          } else {
            greenhouse(x - 15, z, 28, 64, true);
            greenhouse(x + 20, z, 28, 64, true);
          }
          continue;
        }
        if (x > 192 && z > 192) {
          warehouse(
            x,
            z - 8,
            67,
            49,
            Math.round(x) % 2 === 0
              ? "RUBRO · EXPORTAÇÃO"
              : "POMODORO LOGÍSTICA",
          );
          for (const dx of [-24, -17, -10, 8, 15, 22])
            if (random() > 0.15)
              container(
                x + dx,
                z + 30,
                random() > 0.55 ? 2 : 1,
                choose(["#8e6d50", "#536e70", "#9c5a42", "#6c7c65"]),
                13,
              );
          continue;
        }
        if (z > 384) {
          if (x < -192) {
            farmingBlock(x, z, 65, 68, true);
            tree(x - 31, z - 28, 1.3, true);
            continue;
          }
          for (const offset of [-20, 20])
            building(
              x + offset,
              z - 12,
              29,
              42,
              11 + Math.floor(random() * 4) * 3,
              "modern",
              "#d6d1bd",
            );
          for (const tx of [-31, 0, 31]) tree(x + tx, z + 27, 0.85, true);
          bench(x - 15, z + 31);
          bench(x + 15, z + 31);
          continue;
        }
        const modern = x > 96 && z < 192 && z > -288;
        const oldCenter = x >= -192 && x < 96 && z >= -192 && z <= 192;
        const positions = modern
          ? [
              [-19, -18],
              [19, -18],
              [-19, 20],
              [19, 20],
            ]
          : [
              [-20, -20],
              [20, -20],
              [-20, 20],
              [20, 20],
            ];
        for (const [dx, dz] of positions) {
          const height = modern
            ? 18 + Math.floor(random() * 10) * 3.1
            : oldCenter
              ? 7 + Math.floor(random() * 4) * 3.1
              : 6.5 + Math.floor(random() * 4) * 3.1;
          building(
            x + dx,
            z + dz,
            modern ? 27 : 24 + random() * 3,
            modern ? 27 : 24 + random() * 3,
            height,
            modern ? "modern" : random() > 0.75 ? "brick" : "old",
          );
        }
        for (const tx of [-33, 33])
          if (random() > 0.25)
            tree(x + tx, z + 33, 0.72 + random() * 0.2, true);
      }
    // A recognisable old-town square and clock tower interrupt the street grid.
    const plaza = plane(77, 77, 0.6);
    instance(plaza, mats.stone, -48, 0.12, -48, 1, 1, 1);
    market(-43, -41);
    fountain(-68, -68, 5.5);
    building(-72, -24, 15, 14, 24, "old", "#d8c7a5");
    box(mats.concrete, -72, 25.3, -24, 15.5, 2.1, 14.5);
    sign("XII", -72, 21.8, -16.93, 4.5, 4.2, "#ede8d8", "#4a5146");
    for (const p of [
      [-80, -80],
      [-13, -80],
      [-80, -13],
    ])
      tree(p[0], p[1], 1.15, true);
    for (const p of [
      [-55, -80],
      [-80, -45],
      [-13, -55],
    ])
      bench(p[0], p[1]);
    // University campus with colonnade, library, green court and solar roofs.
    building(
      -336,
      -230,
      67,
      36,
      11,
      "modern",
      "#dddccb",
      "INSTITUTO DE AGRONOMIA",
    );
    for (let x = -365; x <= -307; x += 7)
      cyl(mats.white, x, 3.5, -209, 0.34, 7);
    box(mats.concrete, -336, 7.2, -209, 69, 0.45, 4);
    box(mats.stone, -336, 0.14, -203, 70, 0.28, 8);
    for (const side of [-1, 1])
      building(-336 + side * 26, -263, 17, 17, 8, "modern", "#c4cdba");
    for (let x = -360; x <= -312; x += 12) tree(x, -204, 0.8, true);
    for (let x = -360; x <= -310; x += 9)
      box(mats.window, x, 11.7, -235, 7, 0.18, 10, 0.15);
    sign(
      "CIÊNCIA QUE ALIMENTA O FUTURO",
      -336,
      4.5,
      -211.8,
      31,
      1.4,
      "#38534b",
      "#dfdec8",
    );
    // Cooperative farmyard, close enough to reach in the first delivery van.
    warehouse(-48, 153, 65, 37, "COOPERATIVA DA VÁRZEA");
    for (const x of [-72, -64, -56]) crate(x, 179, 2);
    for (const x of [-36, -24]) planter(x, 180, 6, 1.7);
    // A public garden adds walkable space and recognisable meeting places.
    const garden = plane(73, 73, 2);
    instance(garden, mats.grass, -144, 0.12, 48, 1, 1, 1);
    fountain(-144, 48, 7);
    for (const dx of [-26, 26])
      for (const dz of [-26, 26]) tree(-144 + dx, 48 + dz, 1.3);
    for (const p of [
      [-144, 20],
      [-144, 76],
      [-171, 48],
      [-117, 48],
    ])
      bench(p[0], p[1]);
    // Corporate landmark: a terraced tower, rather than a repeated skyline box.
    building(240, -48, 52, 55, 24, "modern", "#bfc9c2", "AGRONOVA");
    building(244, -50, 34, 34, 48, "modern", "#aebfbc");
    for (const x of [216, 264]) planter(x, -14, 8, 2.4);
    sign("AGRONOVA", 244, 46, -32.8, 24, 3.2, "#273d3b", "#e0e5d7");
    // Waterfront terminal, working cranes and the Atlantic beyond the promenade.
    for (const x of [240, 384]) crane(x, 478);
    const promenade = plane(1000, 22, 0.8);
    instance(promenade, mats.stone, 0, 0.14, 498, 1, 1, 1);
    for (let x = -470; x < 480; x += 24) {
      bollard(x, 507);
      if (x % 48 === 2) bench(x, 493);
    }
    const water = plane(3200, 2200, 6);
    instance(water, mats.water, 0, -0.6, 1610, 1, 1, 1);
    collision(0, 513, 1030, 5, 1);
    vessel(330, 570);
    vessel(430, 620);
    for (const x of [-160, -100, -30, 45, 110]) {
      box(mats.wood, x, 0.1, 545, 2, 0.28, 65);
      box(mats.white, x + 6, 0.7, 552, 3.4, 1.5, 12);
      box(mats.dark, x + 6, 1.7, 549, 2.9, 0.7, 5);
      beam(mats.steel, x + 6, 1.5, 553, x + 6, 12, 553, 0.035);
    }
    sign(
      "SANTA TOMATA",
      -6,
      8,
      481,
      43,
      3.8,
      "#3b5144",
      "#e8e1cd",
      0,
      "CIDADE DE BOAS RAÍZES",
    );
    for (const side of [-1, 1])
      beam(mats.steel, -6 + side * 23, 0, 481, -6 + side * 23, 10.5, 481, 0.16);
  } else if (farm) {
    districts.push(
      {
        id: "fundadores",
        name: "Quinta da Raiz",
        x: 0,
        z: 96,
        color: "#acb993",
        description: "A casa da tua primeira colheita.",
      },
      {
        id: "estufas",
        name: "Campos de Vidro",
        x: -96,
        z: -96,
        color: "#99b69a",
        description: "Estufas produtivas e investigação agrícola.",
      },
      {
        id: "cooperativa",
        name: "Aldeia da Cooperativa",
        x: 96,
        z: 96,
        color: "#c0b393",
        description: "O mercado local e as famílias do vale.",
      },
    );
    reserve(-48, -48);
    reserve(-48, 144);
    reserve(144, 48);
    for (const x of blockCenters)
      for (const z of blockCenters) {
        if (isReserved(x, z)) continue;
        if (x === -144 || z === -144) {
          farmingBlock(x, z, 72, 70, true);
          if (z === -144) building(x + 24, z + 25, 19, 17, 5, "old", "#ded8bb");
        } else if ((x + z) % 192 === 0) {
          greenhouse(x - 18, z, 29, 67, true);
          greenhouse(x + 18, z, 29, 67, true);
        } else {
          warehouse(x, z - 7, 59, 47, "COOPERATIVA · PRODUÇÃO");
          for (const offset of [-20, 0, 20]) crate(x + offset, z + 27, 2);
        }
      }
    warehouse(-48, 153, 65, 38, "COOPERATIVA DO VALE");
    market(-48, -48);
    building(144, 48, 66, 43, 8, "old", "#d9cead", "CASA DO AGRICULTOR");
    for (let p = -235; p <= 235; p += 20) {
      tree(-238, p, 1.0, true);
      tree(238, p, 1.05, true);
    }
    for (const x of [-228, -215, -202]) {
      cyl(mats.steel, x, 7, -225, 5, 14);
      cyl(mats.dark, x, 14.2, -225, 5.1, 0.35);
      collision(x, -225, 10, 10, 14);
    }
    sign("VALE DA COLHEITA", 0, 6, 215, 32, 2.2, "#435b3d", "#ece4cd");
  } else {
    districts.push(
      {
        id: "terminal",
        name: "Terminal Rubro",
        x: 96,
        z: 144,
        color: "#9c937a",
        description: "Exportação, docas e entrepostos.",
      },
      {
        id: "bairro",
        name: "Bairro dos Estivadores",
        x: -96,
        z: -96,
        color: "#b6b5a3",
        description: "Restaurantes e oficinas de uma cidade que não para.",
      },
      {
        id: "logistica",
        name: "Parque Logístico",
        x: 96,
        z: -96,
        color: "#859a95",
        description: "Os armazéns que ligam a colheita ao mundo.",
      },
    );
    reserve(-48, -48);
    reserve(-48, 144);
    reserve(144, 144);
    for (const x of blockCenters)
      for (const z of blockCenters) {
        if (isReserved(x, z)) continue;
        if (z > 0 && x > 0) {
          for (const dx of [-27, -18, -9, 9, 18, 27])
            for (const dz of [-19, 19])
              container(
                x + dx,
                z + dz,
                random() > 0.45 ? 2 : 1,
                choose(["#986a4e", "#687f7b", "#a35b40", "#7b886c"]),
                22,
              );
        } else if (x < 0 && z < 0) {
          for (const dx of [-19, 19])
            for (const dz of [-19, 19])
              building(
                x + dx,
                z + dz,
                28,
                27,
                8 + Math.floor(random() * 4) * 3,
                "old",
                "#d5d5bd",
              );
        } else warehouse(x, z, 69, 65, "RUBRO · LOGÍSTICA");
      }
    market(-48, -48);
    warehouse(-48, 153, 65, 39, "COOPERATIVA DOS PRODUTORES");
    const quay = plane(496, 41, 0.8);
    instance(quay, mats.stone, 0, 0.12, 226, 1, 1, 1);
    for (let x = -230; x <= 230; x += 16) {
      bollard(x, 245);
      box(mats.ochre, x, 0.16, 241, 5, 0.04, 0.7);
    }
    for (const x of [-170, -72, 136]) crane(x, 224);
    const water = plane(2200, 2200, 5);
    instance(water, mats.water, 0, -0.5, 1350, 1, 1, 1);
    collision(0, 249, 510, 5, 1);
    vessel(65, 312);
    vessel(-135, 348);
    sign(
      "PORTO VERMELHO",
      0,
      7,
      217,
      36,
      2.6,
      "#40524d",
      "#ece7d6",
      0,
      "A COLHEITA NÃO TEM FRONTEIRAS",
    );
  }
  // An irregular, vertex-coloured height field replaces the old spherical
  // backdrop. The inner ring stays below the city and the southern side sinks
  // under the Atlantic; mountains remain scenery beyond playable boundaries.
  const landscape = geometry(
    new THREE.PlaneGeometry(
      3200,
      3200,
      low ? 80 : high ? 160 : 120,
      low ? 80 : high ? 160 : 120,
    ),
  );
  landscape.rotateX(-Math.PI / 2);
  const terrainPosition = landscape.attributes.position,
    terrainColors = [];
  function smoothNoise(x, z) {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      fx = x - ix,
      fz = z - iz;
    const hash = (a, b) => {
      const value = Math.sin(a * 127.1 + b * 311.7 + 31.91) * 43758.5453;
      return value - Math.floor(value);
    };
    const sx = fx * fx * (3 - 2 * fx),
      sz = fz * fz * (3 - 2 * fz);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), sx),
      THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx),
      sz,
    );
  }
  for (let i = 0; i < terrainPosition.count; i++) {
    const x = terrainPosition.getX(i),
      z = terrainPosition.getZ(i),
      edge = Math.max(Math.abs(x), Math.abs(z));
    const fade = THREE.MathUtils.smoothstep(edge, half + 55, half + 260);
    const rough =
      smoothNoise(x * 0.006, z * 0.006) * 0.65 +
      smoothNoise(x * 0.014, z * 0.014) * 0.25 +
      smoothNoise(x * 0.032, z * 0.032) * 0.1;
    let y =
      -6 +
      fade *
        (20 +
          Math.pow(rough, 1.35) * 200 +
          Math.sin(x * 0.005 + z * 0.003) * 19);
    if (!farm && z > half + 30) y = -14;
    terrainPosition.setY(i, y);
    const rocky = THREE.MathUtils.clamp((y - 75) / 130, 0, 0.75),
      tone = new THREE.Color().lerpColors(
        new THREE.Color("#73836a"),
        new THREE.Color("#a6a18b"),
        rocky,
      );
    tone.multiplyScalar(0.82 + rough * 0.25);
    terrainColors.push(tone.r, tone.g, tone.b);
  }
  landscape.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(terrainColors, 3),
  );
  landscape.computeVertexNormals();
  const landscapeMat = material({ vertexColors: true, roughness: 1 });
  const landscapeMesh = new THREE.Mesh(landscape, landscapeMat);
  landscapeMesh.receiveShadow = true;
  group.add(landscapeMesh);
  // Generic forecourt signs identify destinations without hard-coded UI text.
  for (const location of businessLocations) {
    const x = location.x + 4,
      z = location.z + 4;
    if (
      !colliders.some(
        (b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
      )
    ) {
      beam(mats.dark, x, 0, z, x, 2.6, z, 0.055);
      locationSigns.set(
        location.id,
        sign(
          location.name.toUpperCase(),
          x,
          2.4,
          z + 0.04,
          4.4,
          0.7,
          "#3d5544",
          "#eee5cd",
        ),
      );
    }
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.g, batch.m, batch.items.length);
    for (let i = 0; i < batch.items.length; i++) {
      mesh.setMatrixAt(i, batch.items[i].matrix);
      if (batch.items[i].color)
        mesh.setColorAt(i, new THREE.Color(batch.items[i].color));
    }
    mesh.castShadow = ![
      mats.asphalt,
      mats.stone,
      mats.grass,
      mats.water,
      mats.glass,
      mats.window,
      mats.warmLight,
      mats.tomato,
      farFacade,
    ].includes(batch.m);
    mesh.receiveShadow = true;
    mesh.userData.companyPhase = batch.companyPhase;
    if (batch.companyPhase) companyMeshes.push(mesh);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    renderBatches.push({
      mesh,
      level: batch.detailLevel,
      phase: batch.companyPhase,
      center: mesh.boundingSphere.center,
      radius: mesh.boundingSphere.radius,
    });
    group.add(mesh);
  }
  const allColliders = colliders.slice();
  let companyLayout = "";
  function updateCompany(company = {}) {
    const owned = Array.isArray(company.upgrades)
      ? company.upgrades
      : Object.entries(company.upgrades || {})
          .filter(([, value]) => !!value)
          .map(([key]) => key);
    const upgrades = JSON.stringify(owned)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const levels = [
      true,
      Number(company.land) > 1 || /greenhouse|estufa|land/.test(upgrades),
      Number(company.land) > 2 ||
        /coldstore|warehouse|armazem|logistics/.test(upgrades),
      /solar/.test(upgrades),
    ];
    const key = levels.join(":");
    companyLevels = levels;
    for (const object of companyMeshes)
      object.visible = !!levels[object.userData.companyPhase];
    const changed = key !== companyLayout;
    if (changed) {
      colliders.splice(
        0,
        colliders.length,
        ...allColliders.filter(
          (box) => !box.companyPhase || levels[box.companyPhase],
        ),
      );
      companyLayout = key;
    }
    const ctx = headquartersSign.userData.labelCanvas.getContext("2d");
    ctx.fillStyle = "#2b4835";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = "#b8c49e";
    ctx.strokeRect(13, 13, 998, 230);
    ctx.fillStyle = "#efe6ca";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const name = String(company.name || "RAIZ & SOL")
      .slice(0, 35)
      .toUpperCase();
    ctx.font = (name.length > 23 ? "55" : "74") + "px Arial";
    ctx.fillText(name, 512, 98, 950);
    ctx.font = "25px Arial";
    ctx.fillText(
      "CULTIVAR O AMANHÃ · " +
        Math.max(1, Number(company.staff) || 1) +
        " PESSOAS",
      512,
      178,
      950,
    );
    headquartersSign.material.map.needsUpdate = true;
    const companyLocation = businessLocations.find(
      (location) => location.id === "sede",
    );
    companyLocation.name =
      String(company.name || "Raiz & Sol").slice(0, 35) + " · Sede";
    for (const label of [locationSigns.get("sede"), depotSign])
      if (label) {
        const lc = label.userData.labelCanvas.getContext("2d");
        lc.fillStyle = "#3d5544";
        lc.fillRect(0, 0, 1024, 256);
        lc.fillStyle = "#eee5cd";
        lc.textAlign = "center";
        lc.textBaseline = "middle";
        lc.font = "58px Arial";
        lc.fillText(name, 512, 97, 950);
        lc.font = "26px Arial";
        lc.fillText(
          label === depotSign
            ? "ARMAZENAMENTO E DISTRIBUIÇÃO"
            : "SEDE DA EMPRESA",
          512,
          177,
          950,
        );
        label.material.map.needsUpdate = true;
      }
    return changed;
  }
  function updateScene(elapsed = 0, focus) {
    if (focus && Number.isFinite(focus.x) && Number.isFinite(focus.z)) {
      renderFocus.x = focus.x;
      renderFocus.z = focus.z;
    }
    mats.water.normalMap.offset.set(elapsed * 0.006, elapsed * 0.003);
    const windowRange = low ? 160 : high ? 360 : 250,
      treeRange = low ? 260 : high ? 600 : 440;
    for (const batch of renderBatches) {
      const visible = !batch.phase || companyLevels[batch.phase];
      const distance =
        Math.hypot(
          batch.center.x - renderFocus.x,
          batch.center.z - renderFocus.z,
        ) - Math.min(batch.radius, 90);
      batch.mesh.visible =
        visible &&
        (!batch.level ||
          distance < (batch.level === 1 ? windowRange : treeRange));
    }
  }
  updateCompany();
  updateScene();
  scene.add(group);
  const loop = (x0, z0, x1, z1, offset = 3) => [
    { x: x0 + offset, z: z0 + offset },
    { x: x1 - offset, z: z0 + offset },
    { x: x1 - offset, z: z1 - offset },
    { x: x0 + offset, z: z1 - offset },
  ];
  const trafficRoutes = city
    ? [
        loop(-384, -384, 384, 384),
        loop(-192, -192, 192, 192),
        loop(-96, -96, 96, 96),
        loop(0, 0, 288, 288),
        loop(-384, 0, 0, 288),
        loop(96, -288, 384, 0),
        loop(-192, -288, 0, -96),
        loop(-288, 96, 0, 384),
      ]
    : [
        loop(-192, -192, 192, 192),
        loop(-96, -96, 96, 96),
        loop(0, 0, 192, 192),
        loop(-192, 0, 0, 192),
      ];
  const pedestrianRoutes = city
    ? [
        [
          { x: -86, z: -84 },
          { x: -10, z: -84 },
          { x: -10, z: -11 },
          { x: -84, z: -11 },
        ],
        [
          { x: -183, z: 13 },
          { x: -106, z: 13 },
          { x: -106, z: 84 },
          { x: -183, z: 84 },
        ],
        [
          { x: -374, z: -199 },
          { x: -298, z: -199 },
          { x: -298, z: -278 },
          { x: -374, z: -278 },
        ],
        [
          { x: 12, z: 87 },
          { x: 82, z: 87 },
          { x: 82, z: 10 },
          { x: 12, z: 10 },
        ],
        [
          { x: 205, z: -85 },
          { x: 276, z: -85 },
          { x: 276, z: -12 },
          { x: 205, z: -12 },
        ],
        [
          { x: -178, z: 494 },
          { x: -15, z: 494 },
          { x: 145, z: 494 },
          { x: 220, z: 494 },
        ],
      ]
    : [
        [
          { x: -85, z: -83 },
          { x: -10, z: -83 },
          { x: -10, z: -12 },
          { x: -84, z: -12 },
        ],
        [
          { x: 12, z: 87 },
          { x: 83, z: 87 },
          { x: 83, z: 10 },
          { x: 12, z: 10 },
        ],
        [
          { x: -184, z: 205 },
          { x: 180, z: 205 },
          { x: 180, z: 236 },
          { x: -184, z: 236 },
        ],
      ];
  return {
    group,
    colliders,
    bounds,
    roads,
    districts,
    businessLocations,
    trafficRoutes,
    pedestrianRoutes,
    stats,
    roadStep,
    updateCompany,
    navigationCellSize: city ? 6 : 4,
    spawn: new THREE.Vector3(0, 0, 86),
    vehicleSpawns: city
      ? [
          { x: 3, z: 79, yaw: Math.PI },
          { x: -3, z: 174, yaw: 0 },
          { x: 99, z: -12, yaw: Math.PI / 2 },
          { x: -192, z: -105, yaw: 0 },
          { x: 288, z: 370, yaw: Math.PI },
          { x: 390, z: -192, yaw: Math.PI / 2 },
        ]
      : [
          { x: 3, z: 79, yaw: Math.PI },
          { x: 96, z: 21, yaw: 0 },
          { x: -96, z: -30, yaw: Math.PI / 2 },
          { x: 192, z: 175, yaw: Math.PI },
        ],
    enemySpawns: city
      ? [
          { x: 0, z: -145 },
          { x: 192, z: -36 },
          { x: -192, z: -105 },
          { x: 288, z: 370 },
          { x: 384, z: 270 },
          { x: -288, z: -300 },
          { x: 288, z: -192 },
          { x: -384, z: 192 },
        ]
      : [
          { x: 0, z: -145 },
          { x: 192, z: -36 },
          { x: -192, z: -105 },
          { x: 96, z: -150 },
          { x: 192, z: 192 },
          { x: -192, z: 180 },
        ],
    missionSpawns: businessLocations
      .filter((p) => p.id !== "sede")
      .map((p) => ({ x: p.x, z: p.z })),
    update: updateScene,
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}

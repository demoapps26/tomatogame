import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyPhotographicMaterial } from "./material-library.js";
import {
  createPassengerVehicle,
  PASSENGER_MODELS,
} from "./passenger-vehicles.js";

const HOME_DATA = {
  apartamento: {
    name: "Apartamento da Ribeira",
    width: 14,
    depth: 16,
    height: 3.15,
    rest: [-1.8, -5],
    seller: "Eva · Imobiliária da Ribeira",
  },
  "casa-jardim": {
    name: "Casa dos Jardins",
    width: 20,
    depth: 18,
    height: 3.4,
    rest: [-3.2, -5],
    seller: "Diana · Casas do Poente",
  },
  "villa-mar": {
    name: "Villa do Atlântico",
    width: 26,
    depth: 20,
    height: 3.8,
    rest: [-5, -5],
    seller: "Francisco · Atlântico Imóveis",
  },
};

/**
 * Walkable, ground-level property interiors and a physical car dealership.
 * Static collision footprints never change when decorating a house: upgrades
 * sit on existing furniture or walls, so hidden upgrades cannot block a route.
 */
export function createEstates(scene, world, quality = "medium") {
  const group = new THREE.Group();
  group.name = "city-estates";
  scene.add(group);
  const colliders = [],
    interactionPoints = [],
    interiorZones = [],
    vehicleSpawns = [];
  const sites = [],
    showroom = [],
    geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const batches = new Map();
  const low = quality === "low";
  let disposed = false,
    ownershipKey = "";
  const geo = (geometry) => (geometries.add(geometry), geometry);
  const boxGeometry = geo(new THREE.BoxGeometry(1, 1, 1));
  const roundedGeometry = low
    ? boxGeometry
    : geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.045));
  const cylinderGeometry = geo(
    new THREE.CylinderGeometry(1, 1, 1, low ? 8 : 12),
  );
  const sphereGeometry = geo(
    new THREE.SphereGeometry(1, low ? 8 : 12, low ? 5 : 8),
  );
  // Visible from inside only; a camera above it still gets the roof cutaway.
  const ceilingGeometry = geo(
    new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2),
  );
  const mat = (options) => {
    const value = new THREE.MeshStandardMaterial(options);
    materials.add(value);
    return value;
  };
  const photo = (kind, options = {}) => {
    const value = applyPhotographicMaterial(
      mat({ color: "#ffffff", roughness: 0.9 }),
      kind,
      options,
    );
    for (const name of ["map", "normalMap", "roughnessMap"])
      if (value[name]) textures.add(value[name]);
    return value;
  };
  const m = {
    plaster: photo("plaster", {
      meters: 2,
      normalStrength: 0.24,
      color: "#e4dfce",
    }),
    concrete: photo("concrete", {
      meters: 2,
      normalStrength: 0.25,
      color: "#dbd9ca",
    }),
    wood: photo("wood", { meters: 1.7, normalStrength: 0.23, roughness: 0.88 }),
    floor: photo("tiles", {
      meters: 3.6,
      normalStrength: 0.2,
      roughness: 0.78,
    }),
    darkWood: photo("wood", {
      meters: 1.8,
      normalStrength: 0.2,
      color: "#806d56",
    }),
    cloth: photo("cloth", { meters: 1, normalStrength: 0.2, color: "#a2aa93" }),
    cream: mat({ color: "#ddd7c7", roughness: 0.86 }),
    ceiling: mat({ color: "#e6e1d3", roughness: 0.94 }),
    white: mat({ color: "#eee9db", roughness: 0.75 }),
    metal: mat({ color: "#5e6965", metalness: 0.68, roughness: 0.4 }),
    dark: mat({ color: "#263c34", roughness: 0.75 }),
    screen: mat({ color: "#172b2b", roughness: 0.2, metalness: 0.15 }),
    leaf: mat({ color: "#526f40", roughness: 0.9 }),
    pot: mat({ color: "#ac795b", roughness: 0.95 }),
    brass: mat({ color: "#c0a068", metalness: 0.58, roughness: 0.4 }),
    red: mat({ color: "#b04d37", roughness: 0.9 }),
    blue: mat({ color: "#4c6c78", roughness: 0.85 }),
    light: mat({
      color: "#e6dfba",
      emissive: "#b9a776",
      emissiveIntensity: 0.5,
      roughness: 0.5,
    }),
    water: mat({ color: "#689b9e", roughness: 0.15, metalness: 0.35 }),
    glass: mat({
      color: "#91a5a1",
      transparent: true,
      opacity: 0.24,
      roughness: 0.16,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };

  const placement = new THREE.Object3D();
  function instance(parent, geometry, material, x, y, z, sx, sy, sz, yaw = 0) {
    const key = `${parent.uuid}:${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key))
      batches.set(key, { parent, geometry, material, matrices: [] });
    placement.position.set(x, y, z);
    placement.rotation.set(0, yaw, 0);
    placement.scale.set(sx, sy, sz);
    placement.updateMatrix();
    batches.get(key).matrices.push(placement.matrix.clone());
  }
  const box = (
    parent,
    material,
    x,
    y,
    z,
    width,
    height,
    depth,
    yaw = 0,
    rounded = false,
  ) =>
    instance(
      parent,
      rounded ? roundedGeometry : boxGeometry,
      material,
      x,
      y,
      z,
      width,
      height,
      depth,
      yaw,
    );
  const cylinder = (parent, material, x, y, z, radius, height) =>
    instance(
      parent,
      cylinderGeometry,
      material,
      x,
      y,
      z,
      radius,
      height,
      radius,
    );
  function collider(site, x, z, width, depth, height = 3.4) {
    colliders.push({
      minX: site.x + x - width / 2,
      maxX: site.x + x + width / 2,
      minZ: site.z + z - depth / 2,
      maxZ: site.z + z + depth / 2,
      minY: 0,
      maxY: height,
      estateId: site.id,
    });
  }
  function siteGroup(site) {
    const root = new THREE.Group();
    root.position.set(site.x, 0, site.z);
    root.name = `estate-${site.id}`;
    group.add(root);
    const shell = new THREE.Group(),
      detail = new THREE.Group(),
      roof = new THREE.Group();
    root.add(shell, detail, roof);
    const upgrades = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    upgrades.forEach((upgrade) => {
      detail.add(upgrade);
      upgrade.visible = false;
    });
    const value = {
      ...site,
      root,
      shell,
      detail,
      roof,
      upgrades,
      level: -1,
      owned: false,
    };
    sites.push(value);
    return value;
  }
  function label(
    parent,
    text,
    x,
    y,
    z,
    width = 6,
    height = 0.75,
    colour = "#304b3a",
    sub = "",
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    function draw(title, subtitle = sub) {
      context.fillStyle = colour;
      context.fillRect(0, 0, 1024, 192);
      context.fillStyle = "#ebe6d4";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "bold 58px Arial";
      context.fillText(
        String(title).slice(0, 40),
        512,
        subtitle ? 71 : 96,
        980,
      );
      if (subtitle) {
        context.font = "25px Arial";
        context.fillText(String(subtitle).slice(0, 70), 512, 143, 980);
      }
    }
    draw(text);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    textures.add(texture);
    const material = mat({ map: texture, roughness: 0.8 });
    const geometry = geo(new THREE.PlaneGeometry(width, height));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return {
      draw(title, subtitle) {
        draw(title, subtitle);
        texture.needsUpdate = true;
      },
    };
  }
  function plant(parent, x, z, scale = 1, y = 0) {
    cylinder(parent, m.pot, x, y + 0.24 * scale, z, 0.22 * scale, 0.48 * scale);
    cylinder(
      parent,
      m.darkWood,
      x,
      y + 0.75 * scale,
      z,
      0.025 * scale,
      0.7 * scale,
    );
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.39996;
      instance(
        parent,
        sphereGeometry,
        m.leaf,
        x + Math.sin(angle) * 0.17 * scale,
        y + (0.72 + (i % 3) * 0.15) * scale,
        z + Math.cos(angle) * 0.15 * scale,
        0.27 * scale,
        0.11 * scale,
        0.15 * scale,
        angle,
      );
    }
  }
  function chair(parent, x, z, yaw = 0) {
    box(parent, m.cloth, x, 0.47, z, 0.52, 0.12, 0.52, yaw, true);
    const backX = x - Math.sin(yaw) * 0.23,
      backZ = z - Math.cos(yaw) * 0.23;
    box(parent, m.cloth, backX, 0.8, backZ, 0.52, 0.6, 0.09, yaw, true);
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.2, 0.2]) {
        const px = x + Math.cos(yaw) * dx + Math.sin(yaw) * dz,
          pz = z - Math.sin(yaw) * dx + Math.cos(yaw) * dz;
        cylinder(parent, m.darkWood, px, 0.24, pz, 0.035, 0.46);
      }
  }
  function sofa(site, x, z, width = 2.8) {
    const parent = site.detail;
    box(parent, m.cloth, x, 0.43, z, width, 0.42, 1, 0, true);
    box(parent, m.cloth, x, 0.82, z - 0.4, width, 0.9, 0.18, 0, true);
    for (const side of [-1, 1])
      box(
        parent,
        m.cloth,
        x + side * (width / 2 - 0.1),
        0.65,
        z,
        0.2,
        0.64,
        1.1,
        0,
        true,
      );
    for (const dx of [-width / 2 + 0.25, width / 2 - 0.25])
      for (const dz of [-0.32, 0.32])
        cylinder(parent, m.darkWood, x + dx, 0.15, z + dz, 0.055, 0.3);
    collider(site, x, z, width, 1.15, 1.2);
  }
  function bed(site, x, z) {
    box(site.detail, m.darkWood, x, 0.28, z, 1.95, 0.45, 2.25, 0, true);
    box(site.detail, m.white, x, 0.59, z, 1.82, 0.26, 2.12, 0, true);
    box(site.detail, m.cloth, x, 0.74, z + 0.18, 1.84, 0.05, 1.7, 0, true);
    box(site.detail, m.darkWood, x, 0.72, z - 1.1, 2.05, 1.15, 0.12, 0, true);
    for (const dx of [-0.47, 0.47])
      box(
        site.detail,
        m.white,
        x + dx,
        0.82,
        z - 0.76,
        0.7,
        0.15,
        0.42,
        0,
        true,
      );
    collider(site, x, z, 2.05, 2.4, 1.3);
  }
  function kitchen(site, x, z, length = 4) {
    box(site.detail, m.cream, x, 0.48, z, length, 0.93, 0.7);
    box(site.detail, m.concrete, x, 0.98, z, length + 0.1, 0.1, 0.78, 0, true);
    for (let dx = -length / 2 + 0.4; dx < length / 2; dx += 0.8) {
      box(site.detail, m.wood, x + dx, 0.48, z + 0.365, 0.73, 0.78, 0.035);
      box(site.detail, m.metal, x + dx + 0.2, 0.68, z + 0.39, 0.1, 0.025, 0.03);
    }
    box(site.detail, m.metal, x - length * 0.23, 1.04, z, 0.66, 0.03, 0.42);
    cylinder(
      site.detail,
      m.metal,
      x - length * 0.23,
      1.16,
      z - 0.17,
      0.025,
      0.26,
    );
    box(site.detail, m.dark, x + length * 0.23, 1.04, z, 0.68, 0.04, 0.55);
    for (const dx of [-0.15, 0.15])
      for (const dz of [-0.14, 0.14])
        cylinder(
          site.detail,
          m.metal,
          x + length * 0.23 + dx,
          1.071,
          z + dz,
          0.09,
          0.015,
        );
    box(
      site.detail,
      m.white,
      x + length / 2 + 0.6,
      1.04,
      z,
      0.75,
      2.05,
      0.73,
      0,
      true,
    );
    box(site.detail, m.floor, x, 1.34, z - 0.45, length + 0.1, 0.65, 0.035);
    box(site.detail, m.cream, x, 2.1, z - 0.3, length, 0.76, 0.52);
    for (let dx = -length / 2 + 0.4; dx < length / 2; dx += 0.8) {
      box(site.detail, m.wood, x + dx, 2.1, z - 0.025, 0.73, 0.69, 0.035);
      box(
        site.detail,
        m.metal,
        x + dx + 0.2,
        1.86,
        z + 0.005,
        0.1,
        0.025,
        0.03,
      );
    }
    collider(site, x, z, length + 0.12, 0.85, 1.1);
    collider(site, x + length / 2 + 0.6, z, 0.8, 0.8, 2.1);
  }
  function home(siteData) {
    const data = HOME_DATA[siteData.id],
      site = siteGroup(siteData),
      { width, depth, height } = data;
    site.width = width;
    site.depth = depth;
    site.name = data.name;
    const halfW = width / 2,
      halfD = depth / 2;
    box(site.shell, m.concrete, 0, 0.015, 0, width + 0.6, 0.03, depth + 0.6);
    box(site.shell, m.floor, 0, 0.05, 0, width, 0.06, depth);
    // Windows are actual openings in the wall geometry. Their glass still
    // shares a full-height collision wall, while the front door stays open.
    for (const side of [-1, 1]) {
      box(site.shell, m.plaster, side * halfW, 0.4, -1, 0.28, 0.8, 3.2);
      box(
        site.shell,
        m.plaster,
        side * halfW,
        (height + 2.5) / 2,
        -1,
        0.28,
        height - 2.5,
        3.2,
      );
      for (const [from, to] of [
        [-halfD, -2.6],
        [0.6, halfD],
      ])
        box(
          site.shell,
          m.plaster,
          side * halfW,
          height / 2,
          (from + to) / 2,
          0.28,
          height,
          to - from,
        );
      collider(site, side * halfW, 0, 0.28, depth, height);
    }
    // Two front segments leave a six-metre door and a continuous central route.
    for (const [x, z, w, d] of [
      [0, -halfD, width, 0.28],
      [-halfW / 2 - 1.5, halfD, halfW - 3, 0.28],
      [halfW / 2 + 1.5, halfD, halfW - 3, 0.28],
    ]) {
      box(site.shell, m.plaster, x, height / 2, z, w, height, d);
      collider(site, x, z, w, d, height);
    }
    box(site.shell, m.white, 0, height - 0.22, halfD, width, 0.44, 0.38);
    for (const side of [-1, 1]) {
      box(
        site.shell,
        m.darkWood,
        side * 3.1,
        height / 2,
        halfD + 0.02,
        0.13,
        height,
        0.36,
      );
      box(
        site.shell,
        m.glass,
        side * (halfW - 0.08),
        1.65,
        -1,
        0.025,
        1.65,
        3.1,
      );
      for (const dz of [-2.6, 0.6])
        box(
          site.shell,
          m.dark,
          side * (halfW + 0.03),
          1.65,
          dz,
          0.09,
          1.8,
          0.08,
        );
      box(site.shell, m.dark, side * (halfW + 0.03), 0.77, -1, 0.1, 0.08, 3.3);
      box(site.shell, m.dark, side * (halfW + 0.03), 2.54, -1, 0.1, 0.08, 3.3);
    }
    box(
      site.roof,
      m.concrete,
      0,
      height + 0.12,
      0,
      width + 0.65,
      0.26,
      depth + 0.65,
    );
    instance(
      site.shell,
      ceilingGeometry,
      m.ceiling,
      0,
      height - 0.04,
      0,
      width,
      1,
      depth,
    );
    if (site.id === "apartamento") {
      // The accessible ground-floor flat belongs to a modest apartment block.
      box(site.roof, m.plaster, 0, height + 3.05, 0, width, 5.9, depth);
      box(
        site.roof,
        m.concrete,
        0,
        height + 6.08,
        0,
        width + 0.65,
        0.25,
        depth + 0.65,
      );
      for (const x of [-4.7, 0, 4.7])
        for (const y of [height + 1.35, height + 4.25]) {
          box(site.roof, m.dark, x, y, halfD + 0.17, 1.8, 1.72, 0.1);
          box(site.roof, m.glass, x, y, halfD + 0.23, 1.59, 1.53, 0.025);
        }
    }
    box(site.shell, m.concrete, 0, 0.07, halfD + 7, 4.8, 0.14, 14);
    // Furnishing stays away from the central access route and the rest point.
    const roomy = site.id !== "apartamento",
      livingX = roomy ? -halfW + 4 : -4.3,
      livingZ = roomy ? 4 : 3.1;
    sofa(site, livingX, livingZ);
    box(
      site.detail,
      m.wood,
      livingX,
      0.42,
      livingZ + 1.65,
      1.25,
      0.12,
      0.7,
      0,
      true,
    );
    for (const dx of [-0.48, 0.48])
      cylinder(
        site.detail,
        m.darkWood,
        livingX + dx,
        0.21,
        livingZ + 1.65,
        0.04,
        0.42,
      );
    collider(site, livingX, livingZ + 1.65, 1.3, 0.75, 0.5);
    bed(site, roomy ? -halfW + 4 : -4.3, -5);
    kitchen(site, roomy ? halfW - 5.3 : 2.5, -halfD + 0.65, roomy ? 4.2 : 3.3);
    const tableX = roomy ? halfW - 4 : 3.9,
      tableZ = roomy ? 3.7 : 3.2;
    box(site.detail, m.wood, tableX, 0.79, tableZ, 1.9, 0.1, 1.05, 0, true);
    for (const dx of [-0.72, 0.72])
      for (const dz of [-0.34, 0.34])
        cylinder(
          site.detail,
          m.darkWood,
          tableX + dx,
          0.39,
          tableZ + dz,
          0.045,
          0.78,
        );
    for (const side of [-1, 1])
      chair(
        site.detail,
        tableX + side * 0.48,
        tableZ + side * 1.03,
        side > 0 ? 0 : Math.PI,
      );
    collider(site, tableX, tableZ, 2, 1.1, 0.9);
    for (const side of [-1, 1])
      collider(
        site,
        tableX + side * 0.48,
        tableZ + side * 1.03,
        0.58,
        0.65,
        1.1,
      );
    // Empty TV cabinet/desk are base furniture; later decorations reuse them.
    const cabinetX = livingX,
      cabinetZ = Math.min(halfD - 0.8, livingZ + 3.3);
    box(site.detail, m.wood, cabinetX, 0.4, cabinetZ, 2.5, 0.7, 0.48, 0, true);
    collider(site, cabinetX, cabinetZ, 2.6, 0.6, 0.8);
    box(site.detail, m.white, halfW - 0.3, 1.6, -halfD + 1.4, 0.06, 2.4, 1.5);
    box(site.detail, m.light, 0, height - 0.35, 0, 0.68, 0.1, 0.68, 0, true);
    cylinder(site.detail, m.metal, 0, height - 0.14, 0, 0.02, 0.3);
    // Upgrade 1: rugs and original framed art.
    box(
      site.upgrades[0],
      m.cloth,
      livingX,
      0.091,
      livingZ + 1.2,
      3.7,
      0.015,
      3.2,
    );
    box(site.upgrades[0], m.darkWood, 0, 1.8, -halfD + 0.19, 2.8, 1.35, 0.1);
    box(site.upgrades[0], m.blue, -0.5, 1.8, -halfD + 0.26, 1.2, 1.15, 0.035);
    box(site.upgrades[0], m.red, 0.75, 1.8, -halfD + 0.27, 0.9, 1.15, 0.035);
    // Upgrade 2: entertainment and a stocked bookshelf.
    box(
      site.upgrades[1],
      m.screen,
      cabinetX,
      1.25,
      cabinetZ,
      2.15,
      1.17,
      0.09,
      0,
      true,
    );
    cylinder(site.upgrades[1], m.dark, cabinetX, 0.85, cabinetZ, 0.07, 0.25);
    for (let i = 0; i < 8; i++)
      box(
        site.upgrades[1],
        i % 2 ? m.red : m.blue,
        cabinetX - 1 + i * 0.16,
        0.55,
        cabinetZ + 0.03,
        0.11,
        0.37,
        0.28,
      );
    // Upgrade 3: plants, bedside comfort and warmer fittings.
    plant(site.upgrades[2], livingX + 1.05, cabinetZ, 0.5, 0.8);
    plant(site.upgrades[2], tableX, tableZ, 0.43, 0.85);
    const bedsideX = (roomy ? -halfW + 4 : -4.3) - 1.35;
    box(site.detail, m.wood, bedsideX, 0.32, -5.6, 0.55, 0.57, 0.6, 0, true);
    collider(site, bedsideX, -5.6, 0.6, 0.65, 0.7);
    cylinder(site.upgrades[2], m.brass, bedsideX, 0.84, -5.6, 0.025, 0.48);
    cylinder(site.upgrades[2], m.light, bedsideX, 1.05, -5.6, 0.22, 0.3);
    if (roomy) {
      const gardenW = site.id === "villa-mar" ? 70 : 68;
      box(site.shell, m.concrete, 0, 0.035, depth / 2 + 5, gardenW, 0.07, 0.7);
      plant(site.detail, -halfW - 1.2, halfD - 1, 1.25);
      plant(site.detail, halfW + 1.2, halfD - 1, 1.25);
      const boundaryZ = site.id === "villa-mar" ? 3 : 0;
      const boundaryDepth = site.id === "villa-mar" ? 62 : 68;
      for (const side of [-1, 1]) {
        box(
          site.shell,
          m.plaster,
          side * 35,
          0.45,
          boundaryZ,
          0.22,
          0.9,
          boundaryDepth,
        );
        collider(site, side * 35, boundaryZ, 0.22, boundaryDepth, 0.9);
      }
    }
    if (site.id === "villa-mar") {
      box(site.shell, m.white, 21, 0.11, 30, 15, 0.22, 13);
      box(site.shell, m.water, 21, 0.23, 30, 13.8, 0.08, 11.8);
      collider(site, 21, 30, 14, 12, 0.3);
      for (const z of [25, 31]) {
        box(site.detail, m.wood, -21, 0.38, z, 0.9, 0.18, 2.2, 0, true);
        box(site.detail, m.cream, -21, 0.54, z, 0.82, 0.1, 2.05, 0, true);
        collider(site, -21, z, 1, 2.3, 0.7);
      }
      label(
        site.shell,
        "VILLA DO ATLÂNTICO",
        0,
        2.5,
        halfD + 0.24,
        8,
        0.8,
        "#40594b",
      );
    }
    site.sign = label(
      site.shell,
      data.name.toUpperCase(),
      -halfW + 2.6,
      1.6,
      halfD + 0.22,
      4.8,
      0.7,
      "#52664d",
      "CASA ABERTA · E PARA VISITAR",
    );
    const approach = { x: site.x, z: site.z + halfD + 3.5 };
    const rest = { x: site.x + data.rest[0], z: site.z + data.rest[1] };
    interactionPoints.push({
      id: site.id,
      type: "property",
      propertyId: site.id,
      name: data.name,
      label: `Visitar ${data.name}`,
      ...approach,
      actor: {
        name: data.seller,
        role: "Venda e visitas",
        color: "#78907b",
        x: approach.x + 4.5,
        z: approach.z - 0.3,
      },
    });
    interactionPoints.push({
      id: `${site.id}-rest`,
      type: "rest",
      propertyId: site.id,
      name: data.name,
      label: `Descansar em ${data.name}`,
      ...rest,
      respawn: { ...rest, mapId: "cidade" },
    });
    interiorZones.push({
      id: `interior-${site.id}`,
      propertyId: site.id,
      minX: site.x - halfW,
      maxX: site.x + halfW,
      minZ: site.z - halfD,
      maxZ: site.z + halfD,
      height,
    });
  }

  function dealership(siteData) {
    const site = siteGroup(siteData);
    site.width = 65;
    site.depth = 42;
    site.name = "Santa Tomata Motors";
    box(site.shell, m.concrete, 0, 0.015, 0, 69, 0.03, 46);
    box(site.shell, m.floor, 0, 0.05, 0, 65, 0.05, 42);
    for (const [x, z, w, d] of [
      [-32.5, 0, 0.3, 42],
      [32.5, 0, 0.3, 42],
      [0, -21, 65, 0.3],
    ]) {
      box(site.shell, m.plaster, x, 2.2, z, w, 4.4, d);
      collider(site, x, z, w, d, 4.4);
    }
    box(site.shell, m.dark, 0, 4.5, 21, 66, 0.5, 0.5);
    box(site.roof, m.concrete, 0, 4.8, 0, 66, 0.25, 43);
    instance(site.shell, ceilingGeometry, m.ceiling, 0, 4.55, 0, 65, 1, 42);
    label(
      site.shell,
      "SANTA TOMATA MOTORS",
      0,
      3.7,
      21.3,
      24,
      1.4,
      "#2e4d3a",
      "ESCOLHE O CAMINHO. NÓS TRATAMOS DAS RODAS.",
    );
    // Broad glazing shows the display vehicles from the street. The central
    // entrance is seventeen metres wide, without a portal or hidden teleport.
    for (const side of [-1, 1]) {
      box(site.shell, m.plaster, side * 20.5, 0.35, 21, 24, 0.7, 0.3);
      box(site.shell, m.plaster, side * 20.5, 4, 21, 24, 0.8, 0.3);
      for (const x of [9.2, 20.5, 31.8])
        box(site.shell, m.plaster, side * x, 2.15, 21, 1.4, 2.9, 0.3);
      collider(site, side * 20.5, 21, 24, 0.3, 4.4);
    }
    for (const x of [-26.15, -14.85, 14.85, 26.15]) {
      box(site.shell, m.glass, x, 2.1, 21.18, 9.4, 2.8, 0.03);
      for (const dx of [-4.8, 4.8])
        box(site.shell, m.metal, x + dx, 2.05, 21.26, 0.1, 3.1, 0.11);
    }
    box(site.detail, m.wood, 0, 0.58, -17, 14, 1.16, 1.3, 0, true);
    box(site.detail, m.concrete, 0, 1.2, -17, 14.2, 0.1, 1.45, 0, true);
    collider(site, 0, -17, 14.3, 1.5, 1.3);
    box(site.detail, m.screen, 2.5, 1.52, -17, 0.7, 0.45, 0.07);
    box(site.detail, m.white, -2.6, 1.28, -16.9, 0.5, 0.03, 0.32);
    for (const x of [-18, 18]) {
      plant(site.detail, x, -16, 1.3);
      for (const dz of [0, 2]) {
        chair(site.detail, x, -11 + dz, Math.PI / 2);
        collider(site, x, -11 + dz, 0.65, 0.58, 1.1);
      }
    }
    const displays = [
      ["compact", -24, -2, 0x8eaf9a],
      ["pickup", -12, -2, 0xb98254],
      ["van", 12, -2, 0xd9d7c9],
      ["sport", 24, -2, 0x9c463a],
      ["suv", -24, 10, 0x536a75],
    ];
    for (const [modelId, x, z, colour] of displays) {
      box(site.detail, m.dark, x, 0.07, z, 4.2, 0.12, 7.1, 0, true);
      const actor = createPassengerVehicle(modelId, colour);
      actor.group.position.set(x, 0.13, z);
      actor.group.rotation.y = modelId === "suv" ? 0.18 : Math.PI / 5;
      actor.group.name = `showroom-${modelId}`;
      site.detail.add(actor.group);
      showroom.push({ actor, site, x, z });
      // The diagonal display angle includes the van's full projected width.
      collider(site, x, z, 5.1, 7.2, 2.4);
      label(
        site.detail,
        PASSENGER_MODELS[modelId].name.toUpperCase(),
        x,
        0.8,
        z + 4.2,
        2.5,
        0.5,
        "#314c3f",
        "INFORMAÇÕES NO BALCÃO",
      );
    }
    // Workshop is an open canopy, keeping the service forecourt drivable.
    box(site.shell, m.metal, 20, 3.2, 35, 22, 0.22, 12);
    for (const x of [9.4, 30.6])
      for (const z of [29.5, 40.5]) {
        box(site.shell, m.metal, x, 1.6, z, 0.18, 3.2, 0.18);
        collider(site, x, z, 0.2, 0.2, 3.2);
      }
    box(site.detail, m.red, 24, 0.6, 30.3, 2.4, 1.2, 0.7);
    collider(site, 24, 30.3, 2.5, 0.8, 1.3);
    label(site.shell, "OFICINA E COMBUSTÍVEL", 20, 2.8, 41.2, 12, 0.75);
    interactionPoints.push({
      id: "car-dealer",
      type: "dealership",
      name: "Santa Tomata Motors",
      label: "Falar com Paulo no stand",
      x: site.x,
      z: site.z - 12,
      actor: {
        name: "Paulo · Santa Tomata Motors",
        role: "Venda de automóveis",
        color: "#627b6d",
        x: site.x + 2.5,
        z: site.z - 19.1,
      },
    });
    interactionPoints.push({
      id: "garage-service",
      type: "garage",
      name: "Oficina Motors",
      label: "Reparar e abastecer o carro",
      x: site.x + 20,
      z: site.z + 37,
      actor: {
        name: "Nuno · Oficina Motors",
        role: "Mecânico",
        color: "#596e79",
        x: site.x + 24.5,
        z: site.z + 33,
      },
    });
    for (let index = 0; index < 5; index++) {
      const x = 120 + index * 12,
        z = 181;
      vehicleSpawns.push({
        id: `owned-bay-${index + 1}`,
        x,
        z,
        yaw: Math.PI,
        mapId: "cidade",
      });
      box(
        site.shell,
        m.white,
        x - site.x - 2.2,
        0.05,
        z - site.z,
        0.1,
        0.02,
        6.1,
      );
      box(
        site.shell,
        m.white,
        x - site.x + 2.2,
        0.05,
        z - site.z,
        0.1,
        0.02,
        6.1,
      );
    }
    interiorZones.push({
      id: "interior-car-dealer",
      minX: site.x - 32.5,
      maxX: site.x + 32.5,
      minZ: site.z - 21,
      maxZ: site.z + 21,
      height: 4.5,
    });
  }

  for (const site of world.estatesSites || []) {
    if (site.type === "dealership") dealership(site);
    else if (HOME_DATA[site.id]) home(site);
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.matrices.length,
    );
    batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow =
      batch.material !== m.glass &&
      batch.material !== m.water &&
      batch.material !== m.ceiling;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    batch.parent.add(mesh);
  }
  batches.clear();

  function updateOwnership(company = {}) {
    const properties = Array.isArray(company.ownership?.properties)
      ? company.ownership.properties
      : [];
    const key = JSON.stringify([
      company.name || "",
      company.ownership?.homeId || null,
      properties.map((property) => [property.id, property.level]),
    ]);
    if (key === ownershipKey) return false;
    ownershipKey = key;
    for (const site of sites) {
      if (!HOME_DATA[site.id]) continue;
      const owned = properties.find((property) => property.id === site.id);
      site.owned = !!owned;
      site.level = owned
        ? Math.max(0, Math.min(3, Number(owned.level) || 0))
        : -1;
      site.upgrades.forEach((upgrade, index) => {
        upgrade.visible = site.level >= index + 1;
      });
      site.sign?.draw(
        site.name.toUpperCase(),
        owned
          ? `A TUA CASA · CONFORTO ${site.level} / 3`
          : "CASA ABERTA · E PARA VISITAR",
      );
    }
    // Decoration only: no navigation or collision footprint changed.
    return false;
  }
  function update(_dt = 0, playerPosition, company) {
    if (disposed) return;
    if (company) updateOwnership(company);
    const px = Number.isFinite(playerPosition?.x) ? playerPosition.x : 0,
      pz = Number.isFinite(playerPosition?.z) ? playerPosition.z : 86;
    for (const site of sites) {
      const distance = Math.hypot(px - site.x, pz - site.z);
      site.root.visible = distance < (low ? 230 : 370);
      site.detail.visible = distance < (low ? 100 : 155);
      const inside =
        Math.abs(px - site.x) < site.width / 2 + 2 &&
        Math.abs(pz - site.z) < site.depth / 2 + 4;
      site.roof.visible = !inside;
    }
  }
  function disposeActor(actor) {
    const ownedGeometry = new Set(),
      ownedMaterials = new Set(),
      ownedTextures = new Set();
    actor.group.traverse((object) => {
      if (object.geometry) ownedGeometry.add(object.geometry);
      for (const value of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []) {
        ownedMaterials.add(value);
        for (const field of Object.values(value))
          if (field?.isTexture) ownedTextures.add(field);
      }
    });
    actor.group.removeFromParent();
    ownedGeometry.forEach((value) => value.dispose());
    ownedMaterials.forEach((value) => value.dispose());
    ownedTextures.forEach((value) => value.dispose());
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    showroom.forEach(({ actor }) => disposeActor(actor));
    group.removeFromParent();
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    group.clear();
  }
  updateOwnership({});
  update(0, world.spawn);
  return {
    group,
    colliders,
    interactionPoints,
    interiorZones,
    vehicleSpawns,
    sites,
    update,
    updateOwnership,
    dispose,
  };
}

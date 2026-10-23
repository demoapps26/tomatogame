import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyPhotographicMaterial } from "./material-library.js";
import {
  createPassengerVehicle,
  PASSENGER_MODELS,
} from "./passenger-vehicles.js";
import { createDetailedChair } from "./furniture-asset.js";

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
  const shadeGeometry = geo(
    new THREE.CylinderGeometry(0.48, 1, 1, low ? 12 : 20, 1, true),
  );
  const railGeometry = geo(cylinderGeometry.clone().rotateX(Math.PI / 2));
  const pictureGeometry = geo(new THREE.PlaneGeometry(1, 1));
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
    linen: photo("cloth", {
      meters: 0.8,
      normalStrength: 0.23,
      color: "#e2dac9",
      roughness: 0.96,
    }),
    accent: photo("cloth", {
      meters: 0.85,
      normalStrength: 0.2,
      color: "#aa795f",
      roughness: 0.92,
    }),
    rug: photo("cloth", {
      meters: 0.75,
      normalStrength: 0.3,
      color: "#acb1a1",
      roughness: 1,
    }),
    oak: photo("wood", {
      meters: 2.1,
      normalStrength: 0.15,
      color: "#d4c5aa",
      roughness: 0.96,
    }),
    cream: mat({ color: "#ddd7c7", roughness: 0.86 }),
    ceiling: mat({
      color: "#e6e1d3",
      roughness: 0.94,
      emissive: "#d6d0bd",
      emissiveIntensity: 0.27,
    }),
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
  // Oiled interior timber is matte. Multiplying its scan's roughness map into
  // a second low value made large floors mirror the blue sky like polished metal.
  m.oak.roughnessMap = null;
  m.ceiling.userData.indirectPaint = true;

  // Original framed prints, deliberately drawn as wall art rather than used as
  // replacement surface photography. The same two small canvases serve every home.
  function landscapePrint(warm = false) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 288;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, 220);
    if (sky?.addColorStop) {
      sky.addColorStop(0, warm ? "#bdbaaa" : "#98acb4");
      sky.addColorStop(1, "#e1d4b9");
    }
    context.fillStyle = sky || "#b7c3c1";
    context.fillRect(0, 0, 512, 288);
    context.fillStyle = warm ? "#c5ad7d" : "#dcceaa";
    context.beginPath();
    context.arc(385, 76, 24, 0, Math.PI * 2);
    context.fill();
    for (let layer = 0; layer < 4; layer++) {
      context.fillStyle = warm
        ? ["#929a87", "#748575", "#596e5d", "#364e42"][layer]
        : ["#859c9e", "#6d8d92", "#567c82", "#3e666d"][layer];
      context.beginPath();
      context.moveTo(0, 288);
      for (let x = 0; x <= 512; x += 8)
        context.lineTo(
          x,
          143 +
            layer * 30 +
            Math.sin(x * 0.011 + layer * 1.8) * 27 +
            Math.sin(x * 0.025 + layer) * 10,
        );
      context.lineTo(512, 288);
      context.closePath();
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.add(texture);
    return mat({ map: texture, color: "#e8e3d7", roughness: 0.94 });
  }
  const artMaterials = [landscapePrint(), landscapePrint(true)];

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
    box(parent, m.darkWood, x, 0.31, z, width - 0.1, 0.32, 0.9, 0, true);
    box(parent, m.cloth, x, 0.75, z - 0.4, width, 0.8, 0.19, 0, true);
    for (let seat = 0; seat < 3; seat++) {
      const sx = x + ((seat - 1) * (width - 0.42)) / 3;
      box(
        parent,
        m.cloth,
        sx,
        0.49,
        z + 0.04,
        (width - 0.5) / 3,
        0.17,
        0.79,
        0,
        true,
      );
      box(
        parent,
        m.cloth,
        sx,
        0.81,
        z - 0.28,
        (width - 0.53) / 3,
        0.5,
        0.15,
        0,
        true,
      );
    }
    for (const side of [-1, 1])
      box(
        parent,
        m.cloth,
        x + side * (width / 2 - 0.1),
        0.62,
        z,
        0.2,
        0.64,
        1.1,
        0,
        true,
      );
    box(
      parent,
      m.accent,
      x - width * 0.29,
      0.75,
      z + 0.1,
      0.39,
      0.36,
      0.17,
      -0.14,
      true,
    );
    box(
      parent,
      m.linen,
      x + width * 0.28,
      0.75,
      z + 0.1,
      0.38,
      0.35,
      0.17,
      0.12,
      true,
    );
    // A folded throw over the arm and separate seat cushions avoid one large
    // inflated block while staying inside the sofa's existing footprint.
    box(
      parent,
      m.linen,
      x + width / 2 - 0.22,
      0.96,
      z + 0.05,
      0.35,
      0.055,
      0.7,
      0,
      true,
    );
    for (const dx of [-width / 2 + 0.25, width / 2 - 0.25])
      for (const dz of [-0.32, 0.32])
        cylinder(parent, m.darkWood, x + dx, 0.15, z + dz, 0.055, 0.3);
    collider(site, x, z, width, 1.15, 1.2);
  }
  function bed(site, x, z) {
    box(site.detail, m.darkWood, x, 0.23, z, 1.95, 0.34, 2.25, 0, true);
    box(site.detail, m.white, x, 0.49, z, 1.82, 0.25, 2.12, 0, true);
    box(site.detail, m.linen, x, 0.64, z + 0.18, 1.84, 0.07, 1.7, 0, true);
    box(site.detail, m.accent, x, 0.69, z + 0.73, 1.85, 0.055, 0.45, 0, true);
    box(site.detail, m.oak, x, 1.42, z - 1.1, 2.05, 2.7, 0.12, 0, true);
    for (let slat = -4; slat <= 4; slat++)
      box(
        site.detail,
        m.darkWood,
        x + slat * 0.21,
        1.44,
        z - 1.02,
        0.018,
        2.55,
        0.018,
      );
    box(site.detail, m.cloth, x, 0.93, z - 0.95, 1.9, 0.75, 0.13, 0, true);
    for (const dx of [-0.47, 0.47])
      box(
        site.detail,
        m.white,
        x + dx,
        0.72,
        z - 0.76,
        0.7,
        0.15,
        0.42,
        0,
        true,
      );
    for (const side of [-1, 1]) {
      cylinder(
        site.detail,
        m.brass,
        x + side * 0.78,
        1.76,
        z - 0.97,
        0.07,
        0.09,
      );
      box(
        site.detail,
        m.light,
        x + side * 0.78,
        1.73,
        z - 0.91,
        0.1,
        0.05,
        0.1,
        0,
        true,
      );
    }
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
    // Familiar appliance details and a used counter make the kitchen read at
    // human scale; everything sits on the already collidable cabinets.
    const hobX = x + length * 0.23;
    box(site.detail, m.metal, hobX, 0.54, z + 0.38, 0.7, 0.59, 0.035, 0, true);
    box(
      site.detail,
      m.screen,
      hobX,
      0.52,
      z + 0.405,
      0.54,
      0.34,
      0.025,
      0,
      true,
    );
    box(site.detail, m.brass, hobX, 0.78, z + 0.43, 0.48, 0.028, 0.035);
    for (const knob of [-0.22, -0.07, 0.07, 0.22])
      box(
        site.detail,
        m.dark,
        hobX + knob,
        0.81,
        z + 0.412,
        0.045,
        0.04,
        0.04,
        0,
        true,
      );
    box(site.detail, m.metal, hobX, 2.13, z + 0.08, 0.8, 0.15, 0.67, 0, true);
    box(site.detail, m.metal, hobX, 2.47, z - 0.11, 0.31, 0.6, 0.26);
    box(site.detail, m.light, hobX, 2.04, z + 0.16, 0.58, 0.018, 0.07);
    const fridgeX = x + length / 2 + 0.6;
    box(
      site.detail,
      m.metal,
      fridgeX - 0.23,
      1.24,
      z + 0.38,
      0.025,
      0.59,
      0.035,
    );
    box(site.detail, m.metal, fridgeX, 0.63, z + 0.374, 0.67, 0.012, 0.025);
    box(
      site.detail,
      m.wood,
      x + 0.02,
      1.055,
      z + 0.02,
      0.42,
      0.025,
      0.32,
      0.12,
      true,
    );
    for (const dx of [-0.09, 0.08])
      instance(
        site.detail,
        sphereGeometry,
        m.red,
        x + dx,
        1.12,
        z + 0.01,
        0.065,
        0.057,
        0.065,
      );
    cylinder(
      site.detail,
      m.cream,
      x - length / 2 + 0.28,
      1.17,
      z - 0.02,
      0.1,
      0.25,
    );
    cylinder(
      site.detail,
      m.darkWood,
      x - length / 2 + 0.28,
      1.31,
      z - 0.02,
      0.11,
      0.035,
    );
    cylinder(site.detail, m.white, x - 0.33, 1.14, z + 0.17, 0.067, 0.15);
    cylinder(site.detail, m.dark, x - 0.33, 1.22, z + 0.17, 0.05, 0.008);
    box(
      site.detail,
      m.white,
      x - 0.25,
      1.15,
      z + 0.17,
      0.035,
      0.075,
      0.07,
      0,
      true,
    );
    collider(site, x, z, length + 0.12, 0.85, 1.1);
    collider(site, x + length / 2 + 0.6, z, 0.8, 0.8, 2.1);
  }

  function picture(parent, x, y, z, width, height, art = 0, yaw = 0) {
    box(parent, m.darkWood, x, y, z, width + 0.13, height + 0.13, 0.075, yaw);
    box(
      parent,
      m.cream,
      x + Math.sin(yaw) * 0.045,
      y,
      z + Math.cos(yaw) * 0.045,
      width,
      height,
      0.025,
      yaw,
    );
    instance(
      parent,
      pictureGeometry,
      artMaterials[art % 2],
      x + Math.sin(yaw) * 0.06,
      y,
      z + Math.cos(yaw) * 0.06,
      width - 0.12,
      height - 0.12,
      1,
      yaw,
    );
  }

  function rug(parent, x, z, width, depth, decorated = false) {
    box(parent, m.rug, x, 0.095, z, width, 0.018, depth);
    for (const edge of [-1, 1]) {
      box(
        parent,
        m.linen,
        x,
        0.107,
        z + edge * (depth / 2 - 0.1),
        width - 0.1,
        0.006,
        0.08,
      );
      if (decorated) {
        box(
          parent,
          m.accent,
          x + edge * (width / 2 - 0.18),
          0.108,
          z,
          0.06,
          0.006,
          depth - 0.3,
        );
        for (const band of [-0.15, 0.15])
          box(
            parent,
            m.linen,
            x,
            0.108,
            z + edge * (depth / 2 - 0.28) + band,
            width - 0.5,
            0.006,
            0.023,
          );
      }
    }
  }

  function pendant(parent, x, z, height, scale = 1) {
    cylinder(parent, m.dark, x, height - 0.08, z, 0.12, 0.055);
    cylinder(parent, m.dark, x, height - 0.38, z, 0.012, 0.56);
    instance(
      parent,
      shadeGeometry,
      m.cream,
      x,
      height - 0.71,
      z,
      0.28 * scale,
      0.25 * scale,
      0.28 * scale,
    );
    cylinder(parent, m.light, x, height - 0.84, z, 0.21 * scale, 0.02);
  }

  function loungeChair(site, x, z, yaw) {
    const root = new THREE.Group();
    root.name = "basic-lounge-chair";
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    site.detail.add(root);
    box(root, m.darkWood, 0, 0.26, 0, 0.82, 0.25, 0.68, 0, true);
    box(root, m.cloth, 0, 0.43, 0.03, 0.72, 0.16, 0.65, 0, true);
    box(root, m.cloth, 0, 0.57, -0.27, 0.83, 0.43, 0.16, 0, true);
    for (const side of [-1, 1]) {
      box(root, m.cloth, side * 0.4, 0.48, 0.015, 0.13, 0.34, 0.77, 0, true);
      for (const dz of [-0.24, 0.24])
        cylinder(root, m.darkWood, side * 0.33, 0.17, dz, 0.035, 0.2);
    }
    box(root, m.accent, 0.12, 0.59, -0.055, 0.27, 0.25, 0.13, 0.15, true);
    site.basicChair = root;
    site.chairPose = { x, z, yaw, y: 0.08 };
    // Both the basic seat and the detailed comfort upgrade share this small
    // permanent footprint. It is outside the clear central circulation lane.
    collider(site, x, z, 1.2, 1.2, 0.95);
  }

  function domesticArchitecture(site, data, livingX, livingZ, tableX, tableZ) {
    const { width, depth, height } = data;
    const halfW = width / 2,
      halfD = depth / 2;
    const bedroomX = site.id === "apartamento" ? -4.3 : -halfW + 4;
    const roomWidth = Math.min(6.4, halfW - 0.5);
    // A change in flooring, coffered ceiling and an open oak screen define
    // furnished rooms without adding invisible walls to the six-metre aisle.
    box(
      site.detail,
      m.oak,
      -halfW + roomWidth / 2 + 0.15,
      0.083,
      -halfD / 2,
      roomWidth,
      0.008,
      halfD - 0.25,
    );
    box(
      site.detail,
      m.oak,
      -halfW + roomWidth / 2 + 0.15,
      0.083,
      halfD / 2,
      roomWidth,
      0.008,
      halfD - 0.25,
    );
    for (const side of [-1, 1]) {
      box(
        site.detail,
        m.white,
        side * (halfW - 0.17),
        0.15,
        0,
        0.065,
        0.14,
        depth - 0.28,
      );
      box(
        site.detail,
        m.white,
        side * (halfW - 0.17),
        height - 0.16,
        0,
        0.12,
        0.16,
        depth - 0.28,
      );
      box(
        site.detail,
        m.white,
        side * ((halfW + 3) / 2),
        0.15,
        halfD - 0.17,
        halfW - 3,
        0.14,
        0.065,
      );
      box(
        site.detail,
        m.oak,
        (side * halfW) / 2,
        height - 0.24,
        0,
        halfW,
        0.24,
        0.2,
      );
      const curtainX = side * (halfW - 0.25);
      instance(
        site.detail,
        railGeometry,
        m.brass,
        curtainX,
        2.82,
        -1,
        0.022,
        0.022,
        3.9,
      );
      for (const end of [-2.55, 0.55])
        for (let fold = 0; fold < 6; fold++) {
          const dz = end + (fold - 2.5) * 0.083;
          cylinder(
            site.detail,
            m.linen,
            curtainX + Math.sin(fold * 1.1) * 0.018,
            1.57,
            dz,
            0.065,
            2.4,
          );
        }
    }
    box(
      site.detail,
      m.white,
      0,
      0.15,
      -halfD + 0.17,
      width - 0.28,
      0.14,
      0.065,
    );
    box(
      site.detail,
      m.white,
      0,
      height - 0.16,
      -halfD + 0.17,
      width - 0.28,
      0.16,
      0.12,
    );
    box(site.detail, m.metal, 0, height - 0.46, halfD - 0.06, 6.1, 0.045, 0.07);
    box(site.detail, m.metal, 0, 0.092, halfD - 0.06, 6.1, 0.01, 0.08);
    // The room divider is wholly above the existing sofa footprint.
    for (let slat = -5; slat <= 5; slat++)
      box(
        site.detail,
        m.oak,
        livingX + slat * 0.235,
        1.64,
        livingZ - 0.45,
        0.055,
        2.55,
        0.08,
      );
    box(
      site.detail,
      m.darkWood,
      livingX,
      2.95,
      livingZ - 0.45,
      2.65,
      0.09,
      0.1,
    );
    pendant(site.detail, livingX, livingZ + 1.55, height, 1.2);
    for (const dx of [-0.52, 0.52])
      pendant(site.detail, tableX + dx, tableZ, height, 0.72);
    rug(site.detail, 0, halfD - 1.15, 2.9, 1.45);
    rug(site.detail, bedroomX + 0.07, -4.5, 3.1, 3.35);
    // Framed landscapes, wall mouldings and layered cushions give each view
    // several real-world scales instead of a few objects on an empty plane.
    picture(
      site.detail,
      bedroomX,
      2.14,
      -5.99,
      1.62,
      0.75,
      site.id === "casa-jardim" ? 1 : 0,
    );
    if (site.id !== "apartamento")
      picture(site.detail, halfW - 0.21, 1.9, 3.5, 2.6, 1.35, 1, -Math.PI / 2);
    // Full-height storage anchors the bedroom; in the larger homes a kitchen
    // island divides cooking from dining. These five permanent footprints are
    // well outside the central aisle and never depend on furniture upgrades.
    const wardrobeSide = site.id === "apartamento" ? 1 : -1;
    const wardrobeX = wardrobeSide * (halfW - 0.6),
      wardrobeZ = -4.8;
    box(site.detail, m.cream, wardrobeX, 1.46, wardrobeZ, 0.78, 2.8, 3.1);
    const wardrobeFront = wardrobeX - wardrobeSide * 0.41;
    for (let door = 0; door < 4; door++) {
      const doorZ = wardrobeZ - 1.15 + door * 0.765;
      box(site.detail, m.oak, wardrobeFront, 1.47, doorZ, 0.035, 2.65, 0.73);
      box(
        site.detail,
        m.brass,
        wardrobeFront - wardrobeSide * 0.025,
        1.4,
        doorZ + 0.22,
        0.03,
        0.4,
        0.02,
      );
    }
    box(site.detail, m.darkWood, wardrobeX, 0.12, wardrobeZ, 0.8, 0.1, 3.13);
    collider(site, wardrobeX, wardrobeZ, 0.84, 3.18, 2.9);
    if (site.id !== "apartamento") {
      const islandX = halfW - 4.1,
        islandZ = -1.75;
      box(site.detail, m.oak, islandX, 0.51, islandZ, 2.5, 0.9, 0.94, 0, true);
      box(
        site.detail,
        m.concrete,
        islandX,
        1.01,
        islandZ,
        2.68,
        0.1,
        1.08,
        0,
        true,
      );
      box(site.detail, m.darkWood, islandX, 0.15, islandZ, 2.35, 0.12, 0.82);
      for (const dx of [-0.8, 0, 0.8]) {
        box(
          site.detail,
          m.cream,
          islandX + dx,
          0.51,
          islandZ + 0.49,
          0.76,
          0.74,
          0.025,
        );
        box(
          site.detail,
          m.brass,
          islandX + dx,
          0.78,
          islandZ + 0.515,
          0.19,
          0.025,
          0.03,
        );
      }
      cylinder(site.detail, m.cream, islandX - 0.45, 1.12, islandZ, 0.21, 0.1);
      for (let fruit = 0; fruit < 4; fruit++)
        instance(
          site.detail,
          sphereGeometry,
          m.red,
          islandX - 0.45 + Math.sin(fruit * 1.57) * 0.11,
          1.2,
          islandZ + Math.cos(fruit * 1.57) * 0.1,
          0.067,
          0.06,
          0.067,
        );
      box(
        site.detail,
        m.linen,
        islandX + 0.7,
        1.075,
        islandZ + 0.12,
        0.32,
        0.015,
        0.49,
        0.15,
      );
      collider(site, islandX, islandZ, 2.72, 1.12, 1.1);
    }
    for (const side of [-1, 1]) {
      const plateX = tableX + side * 0.48;
      box(site.detail, m.linen, plateX, 0.85, tableZ, 0.58, 0.012, 0.78);
      cylinder(site.detail, m.white, plateX, 0.867, tableZ, 0.19, 0.018);
      cylinder(site.detail, m.cream, plateX, 0.88, tableZ, 0.145, 0.008);
      cylinder(
        site.detail,
        m.glass,
        plateX + 0.22,
        0.95,
        tableZ - side * 0.29,
        0.048,
        0.19,
      );
      box(
        site.detail,
        m.metal,
        plateX - 0.23,
        0.86,
        tableZ,
        0.018,
        0.008,
        0.24,
      );
    }
    // These small pieces use the original coffee-table collision footprint.
    box(
      site.detail,
      m.white,
      livingX - 0.18,
      0.503,
      livingZ + 1.67,
      0.36,
      0.025,
      0.25,
      0.15,
    );
    box(
      site.detail,
      m.blue,
      livingX - 0.18,
      0.519,
      livingZ + 1.67,
      0.37,
      0.008,
      0.25,
      0.15,
    );
    cylinder(
      site.detail,
      m.white,
      livingX + 0.35,
      0.56,
      livingZ + 1.65,
      0.065,
      0.12,
    );
    cylinder(
      site.detail,
      m.dark,
      livingX + 0.35,
      0.626,
      livingZ + 1.65,
      0.049,
      0.007,
    );
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
    box(site.detail, m.wood, cabinetX, 0.73, cabinetZ, 2.5, 0.1, 0.48, 0, true);
    box(site.detail, m.wood, cabinetX, 0.14, cabinetZ, 2.5, 0.1, 0.48, 0, true);
    box(
      site.detail,
      m.darkWood,
      cabinetX,
      0.43,
      cabinetZ + 0.21,
      2.4,
      0.5,
      0.035,
    );
    for (const dx of [-1.2, 0.35, 1.2])
      box(site.detail, m.wood, cabinetX + dx, 0.43, cabinetZ, 0.07, 0.52, 0.46);
    collider(site, cabinetX, cabinetZ, 2.6, 0.6, 0.8);
    box(site.detail, m.white, halfW - 0.3, 1.6, -halfD + 1.4, 0.06, 2.4, 1.5);
    box(site.detail, m.light, 0, height - 0.35, 0, 0.68, 0.1, 0.68, 0, true);
    cylinder(site.detail, m.metal, 0, height - 0.14, 0, 0.02, 0.3);
    domesticArchitecture(site, data, livingX, livingZ, tableX, tableZ);
    loungeChair(site, -halfW + 1.1, livingZ + 1.7, 1.25);
    if (!low) {
      const pose = site.chairPose;
      site.detailedChair = createDetailedChair();
      site.detailedChair.name = "comfort-upgrade-detailed-lounge-chair";
      site.detailedChair.position.set(pose.x, pose.y, pose.z);
      site.detailedChair.rotation.y = pose.yaw;
      site.detailedChair.visible = false;
      site.detail.add(site.detailedChair);
    }
    // Upgrade 1: rugs and original framed art.
    rug(site.upgrades[0], livingX, livingZ + 1.2, 3.7, 3.2, true);
    picture(site.upgrades[0], 0, 1.9, -halfD + 0.19, 2.8, 1.35, 1);
    // Upgrade 2: entertainment and a stocked bookshelf.
    box(
      site.upgrades[1],
      m.screen,
      cabinetX,
      1.45,
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
    box(site.detail, m.darkWood, bedsideX, 0.37, -5.29, 0.46, 0.018, 0.025);
    box(site.detail, m.brass, bedsideX, 0.45, -5.27, 0.11, 0.025, 0.03);
    box(site.detail, m.linen, bedsideX, 0.626, -5.58, 0.29, 0.025, 0.22, 0.06);
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
      const useDetailedChair = !!site.detailedChair && site.level >= 3;
      if (site.basicChair) site.basicChair.visible = !useDetailedChair;
      if (site.detailedChair) site.detailedChair.visible = useDetailedChair;
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
    // A small paint bounce replaces the missing indoor diffuse GI on downward
    // ceiling normals; it follows the environment and therefore dims at night.
    const daylight = Math.min(
      1,
      Math.max(0, (scene.environmentIntensity ?? 0.44) / 0.44),
    );
    m.ceiling.emissiveIntensity = 0.025 + daylight * 0.245;
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
    sites.forEach((site) => {
      if (site.detailedChair) disposeActor({ group: site.detailedChair });
    });
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

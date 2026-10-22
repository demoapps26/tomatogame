import * as THREE from "three";

export const MAPS = [
  {
    id: "cidade",
    name: "Santa Tomata",
    subtitle: "COSTA MEDITERRÂNICA",
    description:
      "Ruas de pedra, praças de mercado e avenidas abertas junto ao mar.",
    color: "#ebbd7a",
  },
  {
    id: "estufas",
    name: "Vale da Colheita",
    subtitle: "INTERIOR AGRÍCOLA",
    description:
      "Estufas de vidro, filas de tomateiros e estradas entre armazéns.",
    color: "#94ba82",
  },
  {
    id: "porto",
    name: "Porto Vermelho",
    subtitle: "ZONA INDUSTRIAL",
    description:
      "Contentores, gruas e cais de carga: espaço para conduzir e procurar cobertura.",
    color: "#7ca9b4",
  },
];

// All art is generated locally: nothing is fetched while a map is loading.
export function buildWorld(scene, mapId = "cidade", quality = "medium") {
  const config = MAPS.find((m) => m.id === mapId) || MAPS[0];
  const group = new THREE.Group();
  group.name = `world-${config.id}`;
  const colliders = [];
  const bounds = { minX: -89, maxX: 89, minZ: -89, maxZ: 89 };
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const batches = new Map();
  const high = quality === "high";
  const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const foliageGeo = geometry(
    new THREE.IcosahedronGeometry(1, high ? 2 : quality === "low" ? 0 : 1),
  );
  const sphereGeo = geometry(new THREE.SphereGeometry(1, 7, 5));
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  let seed =
    config.id === "cidade" ? 3819 : config.id === "estufas" ? 8921 : 5427;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function geometry(g) {
    geometries.add(g);
    return g;
  }
  function material(options) {
    const m = new THREE.MeshStandardMaterial(options);
    materials.add(m);
    return m;
  }
  function texture(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d");
    if (kind === "facade") {
      c.fillStyle = "#f4e7ce";
      c.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          const x = 13 + col * 64,
            y = 16 + row * 82;
          c.fillStyle = "#c6b89b";
          c.fillRect(x - 3, y - 3, 40, 56);
          c.fillStyle = "#273f40";
          c.fillRect(x, y, 34, 47);
          c.fillStyle = "#75948a";
          c.fillRect(x + 2, y + 2, 14, 19);
          c.fillStyle = "#405b52";
          c.fillRect(x - 6, y, 6, 47);
          c.fillRect(x + 34, y, 6, 47);
          c.fillStyle = "#e5d9b9";
          c.fillRect(x - 5, y + 47, 44, 5);
          c.fillStyle = "#bbc6ae";
          c.fillRect(x + 16, y + 1, 2, 45);
        }
    } else if (kind === "container") {
      c.fillStyle = "#c8ccca";
      c.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 16) {
        c.fillStyle = "#b2b9b6";
        c.fillRect(x, 0, 3, 256);
        c.fillStyle = "#e0e2dd";
        c.fillRect(x + 3, 0, 2, 256);
      }
      c.fillStyle = "#e0e1d7";
      c.font = "bold 23px Arial";
      c.fillText("POMODORO", 27, 105);
      c.font = "11px Arial";
      c.fillText("AGRICULTURAL LOGISTICS", 29, 125);
      c.fillStyle = "#d9a52e";
      c.fillRect(18, 202, 25, 24);
      c.fillStyle = "#303b38";
      c.font = "bold 20px Arial";
      c.fillText("!", 28, 221);
    } else {
      const base = kind === "road" ? 91 : kind === "stone" ? 183 : 120;
      const image = c.createImageData(256, 256);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = base + (random() - 0.5) * (kind === "road" ? 23 : 25);
        image.data[i] = n;
        image.data[i + 1] = n + (kind === "grass" ? 12 : 0);
        image.data[i + 2] = n - (kind === "grass" ? 25 : 5);
        image.data[i + 3] = 255;
      }
      c.putImageData(image, 0, 0);
      if (kind === "stone") {
        c.strokeStyle = "#9e9c87";
        c.lineWidth = 1;
        for (let i = 0; i < 256; i += 32) {
          c.beginPath();
          c.moveTo(0, i);
          c.lineTo(256, i);
          c.stroke();
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, 256);
          c.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    textures.add(tex);
    return tex;
  }
  const mats = {
    grass: material({
      color: config.id === "porto" ? "#8b9872" : "#a4ad7b",
      map: texture("grass"),
      roughness: 1,
    }),
    road: material({ color: "#b3b8b3", map: texture("road"), roughness: 0.97 }),
    stone: material({
      color: "#ded6be",
      map: texture("stone"),
      roughness: 0.96,
    }),
    facade: material({
      color: "#fff4db",
      map: texture("facade"),
      roughness: 0.87,
    }),
    plaster: material({ color: "#e8ddc3", roughness: 0.87 }),
    roof: material({ color: "#a7553d", roughness: 0.93 }),
    dark: material({ color: "#344a43", roughness: 0.73, metalness: 0.24 }),
    steel: material({ color: "#a6b4ae", roughness: 0.38, metalness: 0.68 }),
    wood: material({ color: "#9d7852", roughness: 0.9 }),
    soil: material({ color: "#574337", roughness: 1 }),
    leaves: material({ color: "#567746", roughness: 1 }),
    foliage: material({ color: "#658253", roughness: 0.98 }),
    red: material({ color: "#d54e35", roughness: 0.53 }),
    cream: material({ color: "#eee7ce", roughness: 0.9 }),
    yellow: material({ color: "#d3a245", roughness: 0.7, metalness: 0.2 }),
    glass: material({
      color: "#b8d9c6",
      transparent: true,
      opacity: 0.18,
      roughness: 0.18,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    water: material({ color: "#488d91", roughness: 0.28, metalness: 0.2 }),
    container: material({
      color: "#ffffff",
      map: texture("container"),
      roughness: 0.78,
      metalness: 0.25,
    }),
  };
  function instance(g, m, x, y, z, sx, sy, sz, yaw = 0, color = null) {
    const key = `${g.uuid}:${m.uuid}`;
    if (!batches.has(key)) batches.set(key, { g, m, data: [] });
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    rotation.setFromAxisAngle(axisY, yaw);
    matrix.compose(position, rotation, scale);
    batches.get(key).data.push({ matrix: matrix.clone(), color });
  }
  function box(m, x, y, z, sx, sy, sz, yaw = 0, color = null) {
    instance(boxGeo, m, x, y, z, sx, sy, sz, yaw, color);
  }
  function cyl(m, x, y, z, r, height, color = null) {
    instance(cylinderGeo, m, x, y, z, r, height, r, 0, color);
  }
  function orb(m, x, y, z, sx, sy, sz, color = null) {
    instance(foliageGeo, m, x, y, z, sx, sy, sz, 0, color);
  }
  function collision(x, z, width, depth) {
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });
  }
  function tree(x, z, size = 1) {
    cyl(mats.wood, x, 1.45 * size, z, 0.22 * size, 2.9 * size);
    orb(
      mats.foliage,
      x,
      3.5 * size,
      z,
      1.65 * size,
      2.1 * size,
      1.55 * size,
      random() > 0.5 ? "#adc285" : "#769966",
    );
    orb(
      mats.foliage,
      x + 0.65 * size,
      3.2 * size,
      z - 0.4 * size,
      1.3 * size,
      1.4 * size,
      1.25 * size,
    );
    collision(x, z, 0.5 * size, 0.5 * size);
  }
  function lamp(x, z, yaw = 0) {
    cyl(mats.dark, x, 3.6, z, 0.09, 7.2);
    box(
      mats.dark,
      x + Math.sin(yaw) * 0.65,
      7.1,
      z + Math.cos(yaw) * 0.65,
      0.13,
      0.13,
      1.55,
      yaw,
    );
    box(
      mats.cream,
      x + Math.sin(yaw) * 1.3,
      7,
      z + Math.cos(yaw) * 1.3,
      0.45,
      0.16,
      0.75,
      yaw,
    );
  }
  function bench(x, z, yaw = 0) {
    box(mats.wood, x, 0.58, z, 2.4, 0.18, 0.65, yaw);
    box(mats.wood, x, 1, z - 0.3, 2.4, 0.7, 0.13, yaw);
    box(mats.dark, x - 0.8, 0.28, z, 0.12, 0.55, 0.6, yaw);
    box(mats.dark, x + 0.8, 0.28, z, 0.12, 0.55, 0.6, yaw);
  }
  function crate(x, z, stack = 1) {
    for (let i = 0; i < stack; i++) {
      box(mats.wood, x, 0.6 + i * 1.22, z, 1.2, 1.16, 1.2);
      box(mats.dark, x, 0.6 + i * 1.22, z, 1.23, 0.07, 1.23);
    }
    collision(x, z, 1.25, 1.25);
  }
  function building(x, z, width, depth, height, tint = "#fff2d0") {
    box(mats.facade, x, height / 2, z, width, height, depth, 0, tint);
    box(mats.plaster, x, 0.42, z, width + 0.1, 0.84, depth + 0.1, 0, "#aaa38d");
    box(mats.roof, x, height + 0.22, z, width + 0.75, 0.45, depth + 0.75);
    box(
      mats.plaster,
      x,
      height + 0.55,
      z,
      width + 0.4,
      0.25,
      depth + 0.4,
      0,
      "#d4bd91",
    );
    if (height > 7) {
      box(
        mats.dark,
        x + width * 0.23,
        height + 0.85,
        z - depth * 0.2,
        2.3,
        0.5,
        2,
      );
      box(
        mats.steel,
        x + width * 0.23,
        height + 1.15,
        z - depth * 0.2,
        1.4,
        0.2,
        1.4,
      );
    }
    // Street-level shop doors and an awning lend the repeated façades a human scale.
    box(mats.dark, x, 1.3, z + depth / 2 + 0.04, 2.5, 2.5, 0.1);
    box(
      mats.red,
      x,
      2.8,
      z + depth / 2 + 0.65,
      width * 0.65,
      0.2,
      1.4,
      0,
      random() > 0.5 ? "#ab624a" : "#688572",
    );
    collision(x, z, width + 0.1, depth + 0.1);
  }
  function crop(x, z, size = 1) {
    cyl(mats.wood, x, 1.3 * size, z, 0.035, 2.6 * size);
    orb(mats.leaves, x, 0.9 * size, z, 0.65 * size, 0.9 * size, 0.55 * size);
    orb(
      mats.leaves,
      x + 0.2 * size,
      1.7 * size,
      z - 0.1 * size,
      0.55 * size,
      0.6 * size,
      0.5 * size,
    );
    instance(
      sphereGeo,
      mats.red,
      x - 0.35 * size,
      1.25 * size,
      z + 0.3 * size,
      0.14 * size,
      0.14 * size,
      0.14 * size,
    );
    instance(
      sphereGeo,
      mats.red,
      x + 0.32 * size,
      1.65 * size,
      z + 0.3 * size,
      0.16 * size,
      0.16 * size,
      0.16 * size,
    );
  }
  function greenhouse(x, z, width = 24, length = 28) {
    const side = width / 2,
      half = length / 2;
    box(mats.stone, x, 0.05, z, width, 0.1, length);
    box(mats.glass, x - side, 2.2, z, 0.06, 4.4, length);
    box(mats.glass, x + side, 2.2, z, 0.06, 4.4, length);
    for (let dz = -half; dz <= half + 0.1; dz += length / 6) {
      box(mats.steel, x - side, 2.2, z + dz, 0.12, 4.5, 0.12);
      box(mats.steel, x + side, 2.2, z + dz, 0.12, 4.5, 0.12);
      const g = geometry(
        new THREE.CylinderGeometry(0.055, 0.055, Math.hypot(side, 2), 5),
      );
      for (const sign of [-1, 1]) {
        const mesh = new THREE.Mesh(g, mats.steel);
        mesh.position.set(x + (sign * side) / 2, 5.4, z + dz);
        mesh.rotation.z = sign * Math.atan2(side, 2);
        group.add(mesh);
      }
    }
    box(mats.steel, x, 6.4, z, 0.12, 0.12, length);
    box(mats.steel, x - side, 4.4, z, 0.1, 0.1, length);
    box(mats.steel, x + side, 4.4, z, 0.1, 0.1, length);
    for (const sign of [-1, 1]) {
      const roofGeo = geometry(
        new THREE.PlaneGeometry(Math.hypot(side, 2), length),
      );
      const roof = new THREE.Mesh(roofGeo, mats.glass);
      roof.position.set(x + (sign * side) / 2, 5.4, z);
      roof.rotation.x = -Math.PI / 2;
      roof.rotation.y = sign * Math.atan2(2, side);
      group.add(roof);
      // The sides are solid glass; the two open gables are the entrances.
      collision(x + sign * side, z, 0.25, length);
      const bedX = x + sign * width * 0.25;
      box(mats.wood, bedX, 0.3, z, width * 0.22, 0.6, length - 3);
      box(mats.soil, bedX, 0.62, z, width * 0.2, 0.08, length - 3);
      collision(bedX, z, width * 0.22, length - 3);
      for (let p = -half + 3; p < half - 1; p += 3) crop(bedX, z + p, 1.05);
    }
    box(mats.red, x, 4.1, z + half + 0.08, 4.4, 0.65, 0.12);
  }
  function roadNetwork() {
    const roads = [];
    for (const p of [-48, 0, 48]) {
      for (const horizontal of [false, true]) {
        const roadGeo = geometry(new THREE.PlaneGeometry(10, 180));
        const uv = roadGeo.attributes.uv;
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 36);
        const road = new THREE.Mesh(roadGeo, mats.road);
        road.rotation.x = -Math.PI / 2;
        road.position.set(
          horizontal ? 0 : p,
          horizontal ? 0.055 : 0.05,
          horizontal ? p : 0,
        );
        if (horizontal) road.rotation.z = Math.PI / 2;
        road.receiveShadow = true;
        group.add(road);
      }
      roads.push(
        { x: p, z: 0, width: 10, depth: 180 },
        { x: 0, z: p, width: 180, depth: 10 },
      );
      for (const side of [-1, 1])
        for (const [start, end] of [
          [-90, -55],
          [-41, -7],
          [7, 41],
          [55, 90],
        ]) {
          const middle = (start + end) / 2,
            length = end - start;
          box(mats.stone, p + side * 6, 0.12, middle, 1.8, 0.24, length);
          box(mats.stone, middle, 0.12, p + side * 6, length, 0.24, 1.8);
        }
      for (let a = -84; a <= 84; a += 9) {
        if ([-48, 0, 48].every((c) => Math.abs(a - c) > 8)) {
          box(mats.cream, p, 0.056, a, 0.13, 0.015, 3.4);
          box(mats.cream, a, 0.061, p, 3.4, 0.015, 0.13);
        }
      }
      for (const cross of [-48, 0, 48])
        for (let stripe = -3; stripe <= 3; stripe++) {
          box(mats.cream, p + stripe * 0.9, 0.07, cross + 7, 0.4, 0.012, 2.3);
          box(mats.cream, p + 7, 0.075, cross + stripe * 0.9, 2.3, 0.012, 0.4);
        }
    }
    return roads;
  }

  // Broad terrain beyond the play limits prevents a floating-board horizon.
  box(mats.grass, 0, -0.13, 0, 1000, 0.2, 1000);
  const roads = roadNetwork();
  const blockCenters = [-72, -24, 24, 72];
  for (const x of blockCenters)
    for (const z of blockCenters) box(mats.stone, x, 0.035, z, 33, 0.08, 33);
  for (const p of [-72, -24, 24, 72])
    for (const r of [-48, 0, 48]) {
      lamp(r + 7, p, Math.PI);
      lamp(p, r - 7, Math.PI / 2);
    }

  if (config.id === "cidade") {
    const tints = ["#fff4d8", "#e8cfad", "#d4d9bd", "#efdbb5", "#d8e0da"];
    for (const x of blockCenters)
      for (const z of blockCenters) {
        if ((x === 24 && z === 24) || (x === -24 && z === 24)) continue;
        if (x === 24 && z === -24) {
          greenhouse(x, z, 25, 27);
          continue;
        }
        for (const offset of [-8.4, 8.4]) {
          const height = 5 + Math.floor(random() * 5) * 2.1;
          building(
            x + offset,
            z,
            12 + random() * 2,
            22 + random() * 4,
            height,
            tints[Math.floor(random() * tints.length)],
          );
        }
        tree(x - 12, z + 15, 0.85);
        tree(x + 12, z + 15, 0.95);
      }
    // Central park and its market square are intentionally open for combat and driving.
    box(mats.grass, -24, 0.1, 24, 31, 0.12, 31);
    for (const x of [-34, -14]) for (const z of [14, 34]) tree(x, z, 1.15);
    const fountainMat = material({ color: "#c5c8b5", roughness: 0.6 });
    cyl(fountainMat, -24, 0.48, 24, 3.6, 0.8);
    cyl(mats.water, -24, 0.91, 24, 3.3, 0.04);
    cyl(fountainMat, -24, 1.25, 24, 0.6, 0.7);
    collision(-24, 24, 7.2, 7.2);
    bench(-24, 14);
    bench(-24, 34, Math.PI);
    for (const dx of [-9, 9])
      for (const dz of [-9, 9]) {
        const x = 24 + dx,
          z = 24 + dz;
        box(mats.wood, x, 1, z, 5, 1.9, 2.3);
        box(
          mats.red,
          x,
          2.6,
          z,
          5.7,
          0.18,
          3.4,
          0,
          dz < 0 ? "#b9563e" : "#dac595",
        );
        for (const side of [-1, 1])
          box(mats.wood, x + side * 2.4, 1.8, z, 0.09, 2, 0.09);
        for (let p = -1.8; p < 2; p += 0.6)
          instance(sphereGeo, mats.red, x + p, 2.03, z, 0.19, 0.16, 0.19);
        collision(x, z, 5, 2.3);
      }
    for (let z = -80; z <= 80; z += 16) {
      tree(-85, z, 1.3);
      tree(85, z, 1.2);
    }
    box(mats.water, 0, -0.08, 122, 330, 0.12, 62);
    box(mats.stone, 0, 0.35, 92, 184, 0.7, 3);
    // A quiet marina beyond the playable edge gives the coast a recognizable horizon.
    for (const x of [-65, -35, 5, 35, 65]) {
      box(mats.wood, x, 0.08, 107, 2, 0.25, 25);
      box(mats.cream, x + 4, 0.8, 112, 3.2, 1.5, 9);
      box(mats.dark, x + 4, 1.7, 110, 2.6, 0.6, 3.6);
    }
  } else if (config.id === "estufas") {
    for (const x of [-24, 24])
      for (const z of [-24, 24]) greenhouse(x, z, 29, 30);
    for (const x of [-72, 72])
      for (const z of [-72, -24, 24, 72]) {
        if (Math.abs(z) === 72) {
          building(x, z, 27, 25, 7, "#d3d9bd");
          box(mats.dark, x, 2, z + 12.6, 8, 4, 0.1);
        } else {
          box(mats.soil, x, 0.08, z, 29, 0.16, 30);
          for (const bx of [-10, -5, 0, 5, 10]) {
            box(mats.wood, x + bx, 0.18, z, 2, 0.36, 26);
            collision(x + bx, z, 2, 26);
            for (let p = -10; p < 12; p += 4) crop(x + bx, z + p, 0.85);
          }
        }
      }
    for (const x of [-24, 24])
      for (const z of [-72, 72]) {
        box(mats.soil, x, 0.06, z, 29, 0.12, 29);
        for (const dz of [-10, -5, 0, 5, 10]) {
          box(mats.leaves, x, 0.35, z + dz, 25, 0.6, 1.6);
          collision(x, z + dz, 25, 1.6);
        }
      }
    for (let p = -84; p <= 84; p += 12) {
      tree(-86, p, 1.1);
      tree(86, p, 1.1);
    }
    for (const [x, z] of [
      [-9, 62],
      [11, 70],
      [-8, -60],
      [55, 8],
    ]) {
      crate(x, z, 2);
      crate(x + 1.6, z, 1);
    }
    // Silos and water tanks at the edge of the agricultural depot.
    for (const x of [-82, -70, -58]) {
      cyl(mats.steel, x, 6, -86, 4, 12);
      cyl(mats.dark, x, 12.1, -86, 4.1, 0.3);
      collision(x, -86, 8, 8);
    }
  } else {
    const colors = ["#8e4c38", "#456e75", "#bd9254", "#728369", "#6a747c"];
    for (const x of [-24, 24])
      for (const z of [-24, 24])
        for (const dx of [-8, 8]) {
          const px = x + dx;
          const count = random() > 0.35 ? 2 : 1;
          for (let i = 0; i < count; i++)
            box(
              mats.container,
              px,
              1.5 + i * 3.05,
              z,
              6,
              3,
              24,
              0,
              colors[Math.floor(random() * colors.length)],
            );
          collision(px, z, 6, 24);
        }
    for (const x of [-72, 72])
      for (const z of [-72, -24, 24]) {
        building(x, z, 27, 28, 8, "#b4c2bc");
        box(mats.dark, x, 2.5, z + 14.1, 13, 4.8, 0.12);
        for (let p = -10; p <= 10; p += 5)
          box(mats.yellow, x + p, 0.05, z + 17, 0.13, 0.03, 3);
      }
    for (const x of [-24, 24]) building(x, -72, 29, 24, 10, "#c2c2aa");
    box(mats.stone, 0, 0.09, 71, 176, 0.2, 30);
    // World-scaled dock paving avoids stretching a single texture over the quay.
    const quayGeo = geometry(new THREE.PlaneGeometry(176, 30));
    const quayUV = quayGeo.attributes.uv;
    for (let i = 0; i < quayUV.count; i++)
      quayUV.setXY(i, quayUV.getX(i) * 44, quayUV.getY(i) * 7.5);
    const quay = new THREE.Mesh(quayGeo, mats.stone);
    quay.rotation.x = -Math.PI / 2;
    quay.position.set(0, 0.195, 71);
    quay.receiveShadow = true;
    quay.userData.groundSurface = true;
    group.add(quay);
    for (let x = -82; x < 84; x += 6) {
      box(mats.yellow, x, 0.22, 83, 2, 0.06, 0.6);
      box(mats.dark, x + 3, 0.22, 83, 2, 0.06, 0.6);
    }
    box(mats.water, 0, -0.35, 127, 600, 0.2, 87);
    collision(0, 87, 184, 7);
    for (const x of [-60, 54]) {
      for (const dx of [-7, 7])
        for (const dz of [-5, 5]) {
          box(mats.yellow, x + dx, 13, 70 + dz, 0.9, 26, 0.9);
          collision(x + dx, 70 + dz, 1.2, 1.2);
        }
      box(mats.yellow, x, 25.6, 70, 17, 1.2, 2);
      box(mats.yellow, x, 26.8, 87, 1, 1, 40);
      box(mats.dark, x, 20, 104, 0.1, 13, 0.1);
      box(mats.dark, x, 13.5, 104, 2, 0.5, 2);
    }
    for (const [x, z] of [
      [12, 67],
      [-13, 65],
      [70, 53],
      [-59, 51],
    ]) {
      crate(x, z, 2);
      crate(x + 1.8, z, 1);
    }
    // Cargo vessel: a proper far-field landmark rather than an empty water plane.
    box(mats.dark, 0, 1.1, 117, 18, 3, 49);
    box(mats.red, 0, -0.1, 117, 17, 1.2, 50);
    box(mats.cream, 0, 6, 135, 15, 7, 10);
    for (const x of [-4, 4])
      for (const z of [103, 112, 121])
        box(
          mats.container,
          x,
          4.5,
          z,
          6,
          3,
          8,
          0,
          colors[Math.floor(random() * colors.length)],
        );
    box(mats.dark, 0, 10.5, 134, 12, 0.5, 8);
    for (let z = -82; z < 60; z += 18) {
      tree(-87, z, 0.9);
      tree(87, z, 0.9);
    }
  }

  // Distant low hills, kept outside collision space, soften the sky/terrain join.
  const hillGeo = geometry(new THREE.SphereGeometry(1, 12, 6));
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2,
      distance = 235 + random() * 80;
    if (config.id !== "estufas" && Math.sin(angle) > 0.45) continue;
    instance(
      hillGeo,
      mats.foliage,
      Math.cos(angle) * distance,
      -7,
      Math.sin(angle) * distance,
      45 + random() * 30,
      20 + random() * 28,
      45 + random() * 35,
      0,
      "#a8b59b",
    );
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.g, batch.m, batch.data.length);
    for (let i = 0; i < batch.data.length; i++) {
      mesh.setMatrixAt(i, batch.data[i].matrix);
      if (batch.data[i].color)
        mesh.setColorAt(i, new THREE.Color(batch.data[i].color));
    }
    mesh.castShadow =
      batch.m !== mats.water &&
      batch.m !== mats.glass &&
      batch.m !== mats.road &&
      batch.m !== mats.grass &&
      batch.m !== mats.stone;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.traverse((obj) => {
    if (obj.isMesh && !obj.isInstancedMesh) {
      obj.castShadow =
        !obj.material.transparent &&
        obj.material !== mats.road &&
        !obj.userData.groundSurface;
      obj.receiveShadow = true;
    }
  });
  scene.add(group);
  return {
    group,
    colliders,
    bounds,
    spawn: new THREE.Vector3(0, 0, 66),
    vehicleSpawns: [
      { x: 3, z: 60, yaw: Math.PI },
      { x: 48, z: 21, yaw: 0 },
      { x: -48, z: -28, yaw: Math.PI / 2 },
    ],
    enemySpawns: [
      { x: 0, z: 28 },
      { x: 48, z: 43 },
      { x: -48, z: -20 },
      { x: 0, z: -50 },
      { x: 48, z: -36 },
      { x: -30, z: 0 },
    ],
    missionSpawns: [
      { x: 0, z: 20 },
      { x: 48, z: 0 },
      { x: -48, z: -42 },
      { x: 0, z: -66 },
      { x: 48, z: 62 },
    ],
    roads,
    dispose() {
      scene.remove(group);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const tex of textures) tex.dispose();
      group.clear();
    },
  };
}

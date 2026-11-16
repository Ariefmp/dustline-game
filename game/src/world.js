// Dustline Yard: a dusk container yard, 46 x 38 m, built only from boxes.
// Two spike sites (A north, B south), three lanes (A-long, B-long, mid), cover from
// containers and crates. Every box is a collider for movement and a surface a
// bullet stops on. All art is procedural: canvas textures, no external assets.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { mulberry32 } from './util.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, random, base, dots, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i += 1) {
    const v = random();
    ctx.fillStyle = v > 0.66 ? 'rgba(255,255,255,' + alpha + ')' : v > 0.33 ? 'rgba(0,0,0,' + alpha + ')' : 'rgba(60,40,20,' + alpha + ')';
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
}

function buildTextures(random) {
  const ground = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#8a7a5c', 2600, 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      const y = random() * s;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + random() * 20 - 10, s * 0.7, y + random() * 20 - 10, s, y);
      ctx.stroke();
    }
  });
  ground.repeat.set(10, 8);

  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#6b6f75', 2200, 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(s, i * 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, s); ctx.stroke();
    }
  });

  function containerTex(base, rust) {
    return canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, 0, 5, s);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 8, 0, 4, s);
      }
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = rust;
        ctx.globalAlpha = 0.12 + random() * 0.25;
        const w = 6 + random() * 26;
        ctx.fillRect(random() * s, random() * s, w, 3 + random() * 8);
      }
      ctx.globalAlpha = 1;
    });
  }

  const crate = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= s; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    speckle(ctx, s, random, 'rgba(0,0,0,0)', 300, 0.1);
  });

  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#e8a33d';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#22242a';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s); ctx.lineTo(x + 16, s); ctx.lineTo(x + 16 + s, 0); ctx.lineTo(x + s, 0);
      ctx.closePath(); ctx.fill();
    }
  });

  function siteTex(letter) {
    return canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = 'rgba(232,163,61,0.9)';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#22242a';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, s - 16, s - 16);
      ctx.fillStyle = '#22242a';
      ctx.font = 'bold 150px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, s / 2, s / 2 + 6);
    });
  }

  return { ground, concrete, crate, hazard, siteA: siteTex('A'), siteB: siteTex('B'), containerRed: containerTex('#a8442e', '#5d2415'), containerBlue: containerTex('#2e5f7a', '#1c3a4d'), containerYellow: containerTex('#b98a2e', '#6b4d15'), containerGreen: containerTex('#4a6b3a', '#2a3d22') };
}

export function createWorld(scene, seed = 7) {
  const random = mulberry32(seed);
  const tex = buildTextures(random);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.95, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9, metalness: 0.02 }),
    wallDark: new THREE.MeshStandardMaterial({ color: PALETTE.wallDark, roughness: 0.92 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ map: tex.containerRed, roughness: 0.75, metalness: 0.25 }),
    blue: new THREE.MeshStandardMaterial({ map: tex.containerBlue, roughness: 0.75, metalness: 0.25 }),
    yellow: new THREE.MeshStandardMaterial({ map: tex.containerYellow, roughness: 0.75, metalness: 0.25 }),
    green: new THREE.MeshStandardMaterial({ map: tex.containerGreen, roughness: 0.75, metalness: 0.25 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.85 }),
  };

  const group = new THREE.Group();
  scene.add(group);
  // Plain-object AABBs: the hot collision path never touches three's Box3.
  const colliders = [];
  const shootables = [];

  function box(cx, cz, w, h, d, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[material]);
    mesh.position.set(cx, h / 2 + (opts.y || 0), cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) {
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: opts.y || 0, maxY: h + (opts.y || 0) });
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(47, 39), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  // Perimeter walls.
  box(0, -19, 47, 5, 0.8, 'wall');
  box(0, 19, 47, 5, 0.8, 'wall');
  box(-23, 0, 0.8, 5, 39, 'wall');
  box(23, 0, 0.8, 5, 39, 'wall');

  // Lane walls: mid is split from A/B-long by two long walls, and from the west
  // yard by a wall with one door gap (z -2..2).
  box(2, -8, 24, 4, 0.8, 'wall');
  box(2, 8, 24, 4, 0.8, 'wall');
  box(-14, -5.5, 0.8, 4, 7, 'wall');
  box(-14, 5.5, 0.8, 4, 7, 'wall');
  // Warehouses backing each site.
  box(-20, -13.5, 6, 4.5, 6, 'wallDark');
  box(-20, 13.5, 6, 4.5, 6, 'wallDark');
  // Lane cover walls.
  box(8, -11.5, 6, 3, 0.8, 'wall');
  box(8, 11.5, 6, 3, 0.8, 'wall');

  // Containers.
  box(-6, -4, 6, 2.6, 2.4, 'red');
  box(-6, 4, 6, 2.6, 2.4, 'blue');
  box(6, -3.5, 2.4, 2.6, 6, 'yellow');
  box(6, 4.5, 2.4, 2.6, 6, 'green');
  box(-8, -16.5, 6, 2.6, 2.4, 'red');
  box(-8, 16.5, 6, 2.6, 2.4, 'blue');
  box(16, -4, 6, 2.6, 2.4, 'yellow');
  box(16, 5, 6, 2.6, 2.4, 'green');

  // Crates.
  const crateSpots = [[-2, -6], [-2, 6], [10, -6], [10, 6], [-18, -2], [-18, 2], [16, -13], [16, 13], [2, -14], [2, 14], [18, -13], [18, 13]];
  for (const [x, z] of crateSpots) box(x, z, 1.2, 1.2, 1.2, 'crate');
  box(-4, -13, 1.2, 2.4, 1.2, 'crate');
  box(-4, 13, 1.2, 2.4, 1.2, 'crate');

  // Site markers: hazard-framed letters flat on the ground.
  function siteMarker(x, z, texture) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  siteMarker(-12, -12, tex.siteA);
  siteMarker(-12, 12, tex.siteB);

  // Distant skyline silhouettes for depth, outside the walls.
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x1d2431, fog: true });
  for (let i = 0; i < 26; i += 1) {
    const w = 4 + random() * 9;
    const h = 6 + random() * 22;
    const d = 4 + random() * 8;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMat);
    const angle = random() * Math.PI * 2;
    const r = 52 + random() * 26;
    mesh.position.set(Math.cos(angle) * r, h / 2 - 0.5, Math.sin(angle) * r);
    skyline.add(mesh);
  }
  scene.add(skyline);

  // Dusk sun disc low in the west.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb35c, fog: false }),
  );
  sun.position.set(-90, 26, -40);
  sun.lookAt(0, 0, 0);
  scene.add(sun);

  // Lighting: warm low sun, cool sky fill, ground bounce.
  const hemi = new THREE.HemisphereLight(0x8fa3c0, 0x8a7a5c, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffb35c, 2.4);
  key.position.set(-28, 22, -14);
  key.target.position.set(4, 0, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 90;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0x7a8fb5, 0.5);
  fill.position.set(20, 14, 18);
  scene.add(fill);

  // The spike: a small device with a blinking light, hidden until planted.
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.4, metalness: 0.6 }),
  );
  spikeBody.position.y = 0.11;
  const spikeLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.danger }),
  );
  spikeLight.position.set(0.18, 0.26, 0);
  spike.add(spikeBody, spikeLight);
  spike.visible = false;
  scene.add(spike);

  // Waypoint graph for the bots. Nodes are [x, z]; edges are bidirectional.
  const nodes = [
    [-20, 0], [-16, -8], [-16, -14], [-12, -12], [-16, 8], [-16, 14], [-12, 12],
    [-16, 0], [-12, 0], [-4, 0], [4, 0], [12, 0], [20, 0],
    [14, -12], [6, -14], [-2, -10], [-8, -12],
    [14, 12], [6, 14], [-2, 10], [-8, 12],
    [8, 0], [0, -14], [0, 14],
  ];
  const edges = [
    [0, 7], [7, 1], [7, 4], [7, 8], [1, 2], [2, 3], [2, 22],
    [4, 5], [5, 6], [5, 23], [8, 9], [9, 10], [10, 11], [10, 21],
    [11, 12], [12, 13], [12, 17], [13, 14], [13, 22], [14, 15],
    [15, 16], [15, 3], [16, 3], [17, 18], [18, 19], [19, 20],
    [19, 6], [20, 6],
  ];
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    spike,
    spikeLight,
    group,
    sites: {
      A: { center: { x: -12, z: -12 }, plant: { x: -12, z: -12 }, zone: { minX: -16, maxX: -8, minZ: -16, maxZ: -8 } },
      B: { center: { x: -12, z: 12 }, plant: { x: -12, z: 12 }, zone: { minX: -16, maxX: -8, minZ: 8, maxZ: 16 } },
    },
    spawns: {
      vanguard: [[-20, -3], [-20, -1], [-20, 1], [-20, 3], [-21, 0]],
      sentinel: [[20, -3], [20, -1], [20, 1], [20, 3], [21, 0]],
    },
    waypoints: { nodes, adjacency },
    bounds: { minX: -22.4, maxX: 22.4, minZ: -18.4, maxZ: 18.4 },
  };
}

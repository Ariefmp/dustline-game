// The bots: nine opponents and teammates with a Counter-Strike-shaped brain.
// They walk waypoint routes to the sites, hold angles, react to what they see,
// strafe and burst-fire when engaged, hear gunfire and rotate, carry the spike,
// plant it, hold the site, and defuse when they can. One fixed-step tick per bot.
import * as THREE from 'three';
import { BOT, WEAPONS, ROUND } from './config.js';
import { PALETTE } from './config.js';
import { clamp, dist2D2, angleDelta, randomRange, pick } from './util.js';

const NAMES = {
  sentinel: ['Ash', 'Bram', 'Cleo', 'Dax'],
  vanguard: ['Ember', 'Flint', 'Gage', 'Hale', 'Ivo'],
};
const BOT_GUNS = ['rifle', 'rifle', 'rifle', 'smg', 'smg', 'shotgun', 'sniper'];
const HOLD_SPOTS = {
  sentinel: [
    { node: 16, yaw: -Math.PI / 2, site: 'A' }, // site A hold
    { node: 15, yaw: -Math.PI / 2, site: 'A' },
    { node: 20, yaw: Math.PI / 2, site: 'B' },
    { node: 19, yaw: Math.PI / 2, site: 'B' },
    { node: 21, yaw: Math.PI, site: 'mid' }, // mid hold, faces west
  ],
};
const VANGUARD_ROUTES = {
  A: [0, 7, 1, 2, 3],
  B: [0, 7, 4, 5, 6],
  midA: [0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 3],
  midB: [0, 7, 8, 9, 10, 11, 12, 17, 18, 19, 6],
};

export function createBots(scene, world, deps) {
  const { random, los, fireBotShot, playerAgent, onDeath, onHear, game } = deps;
  const { nodes, adjacency } = world.waypoints;
  const list = [];
  // Reused temps: the per-tick AI never allocates a vector.
  const _eye = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _from = new THREE.Vector3();
  const _tp = new THREE.Vector3();

  // ---- visuals -----------------------------------------------------------
  function makeBarSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 10;
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.9, 0.14, 1);
    sprite.position.y = 2.05;
    sprite.visible = false;
    return { sprite, canvas, tex };
  }

  function buildModel(team) {
    const group = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: PALETTE[team], roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6, metalness: 0.3 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
    torso.position.y = 1.12;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.34), dark);
    vest.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.6;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), dark);
    visor.position.set(0, 1.62, -0.16);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), dark);
    legL.position.set(-0.14, 0.39, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), cloth);
    arm.position.set(0.1, 1.28, -0.24);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), dark);
    gun.position.set(0.1, 1.3, -0.42);
    group.add(torso, vest, head, visor, legL, legR, arm, gun);
    group.traverse((o) => { o.castShadow = true; });
    return { group, head, torso, legL, legR, gun };
  }

  // ---- pathfinding -------------------------------------------------------
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = dist2D2(x, z, nodes[i][0], nodes[i][1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function findPath(fromNode, toNode) {
    if (fromNode === toNode) return [toNode];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [fromNode];
    prev[fromNode] = fromNode;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === toNode) {
          const path = [toNode];
          let n = toNode;
          while (n !== fromNode) { n = prev[n]; path.unshift(n); }
          return path;
        }
        queue.push(next);
      }
    }
    return [toNode];
  }

  // ---- one bot -----------------------------------------------------------
  function makeBot(team, index) {
    const name = NAMES[team][index % NAMES[team].length];
    const model = buildModel(team);
    const bar = makeBarSprite();
    model.group.add(bar.sprite);
    model.group.visible = false; // shown by resetRound when a match starts
    scene.add(model.group);
    const hitMeshes = [model.head, model.torso, model.legL, model.legR];
    const bot = {
      kind: 'bot', team, name, index,
      alive: true, health: 100, armor: 0, hasHelmet: false,
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0, pitch: 0,
      group: model.group, parts: model, bar, hitMeshes,
      state: 'hold', path: [], pathI: 0,
      targetNode: 0, holdNode: 0, holdYaw: 0, holdSite: 'mid',
      route: 'A', hasSpike: false,
      weapon: 'rifle', mag: 30, reserve: 90, cooldown: 0, reloading: false, reloadTimer: 0,
      burstLeft: 0, burstPause: 0, reaction: 0, visibleEnemy: null,
      strafeDir: 1, strafeTimer: 0, crouch: false,
      plantTimer: 0, defuseTimer: 0,
      skill: 0.45 + random() * 0.4,
      stuckTimer: 0, lastX: 0, lastZ: 0,
      stepPhase: random() * 6, heardAt: 0,
      eyeY: 1.55,
    };
    for (const mesh of hitMeshes) {
      mesh.userData.agent = bot;
      mesh.userData.part = mesh === model.head ? 'head' : mesh === model.torso ? 'body' : 'legs';
    }
    return bot;
  }

  for (let i = 0; i < 4; i += 1) list.push(makeBot('sentinel', i));
  for (let i = 0; i < 5; i += 1) list.push(makeBot('vanguard', i));

  function setPath(bot, toNode) {
    const from = nearestNode(bot.pos.x, bot.pos.z);
    bot.path = findPath(from, toNode);
    bot.pathI = 0;
    bot.targetNode = toNode;
  }

  function assignRound() {
    // Vanguard: 3 push A, 2 push B (carrier goes A most rounds, B sometimes).
    const carrierSite = random() < 0.65 ? 'A' : 'B';
    const vanguard = list.filter((b) => b.team === 'vanguard');
    vanguard.forEach((bot, i) => {
      bot.route = i < 3 ? carrierSite : carrierSite === 'A' ? 'B' : 'A';
      bot.hasSpike = i === 0;
      bot.weapon = pick(random, BOT_GUNS);
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = WEAPONS[bot.weapon].reserve;
      bot.armor = random() < 0.5 ? 50 : 0;
      bot.hasHelmet = bot.armor > 0 && random() < 0.5;
    });
    game.spikeHolder = vanguard[0];
    game.spike = { planted: false, site: null, x: 0, z: 0, timer: 0, carrier: vanguard[0] };
    // Sentinel: two hold A, two hold B, one holds mid.
    const sentinels = list.filter((b) => b.team === 'sentinel');
    sentinels.forEach((bot, i) => {
      const spot = HOLD_SPOTS.sentinel[i];
      bot.holdNode = spot.node;
      bot.holdYaw = spot.yaw;
      bot.holdSite = spot.site;
      bot.weapon = pick(random, BOT_GUNS);
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = WEAPONS[bot.weapon].reserve;
      bot.armor = random() < 0.6 ? 50 : 0;
      bot.hasHelmet = bot.armor > 0 && random() < 0.5;
    });
  }

  function resetRound(roundNumber) {
    for (const bot of list) {
      const spawn = world.spawns[bot.team][bot.index % world.spawns[bot.team].length];
      bot.pos.set(spawn[0], 0, spawn[1]);
      bot.yaw = bot.team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2;
      bot.alive = true;
      bot.health = 100;
      bot.state = 'hold';
      bot.path = [];
      bot.pathI = 0;
      bot.visibleEnemy = null;
      bot.plantTimer = 0;
      bot.defuseTimer = 0;
      bot.reloading = false;
      bot.cooldown = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.reaction = 0;
      bot.group.visible = true;
      bot.bar.sprite.visible = false;
      updateBar(bot);
    }
    assignRound();
    // Vanguard set off at once; sentinels walk to their holds.
    for (const bot of list) {
      if (bot.team === 'vanguard') {
        bot.state = 'advance';
        setPath(bot, bot.route === 'A' ? 3 : 6);
      } else {
        bot.state = 'advance';
        setPath(bot, bot.holdNode);
      }
    }
  }

  function updateBar(bot) {
    if (!bot.alive || bot.health >= 100) { bot.bar.sprite.visible = false; return; }
    const ctx = bot.bar.canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = bot.health > 50 ? '#4caf50' : bot.health > 25 ? '#e8a33d' : '#d94f3d';
    ctx.fillRect(2, 2, 60 * clamp(bot.health / 100, 0, 1), 6);
    bot.bar.tex.needsUpdate = true;
    bot.bar.sprite.visible = true;
  }

  function eyePos(bot, out) {
    out.set(bot.pos.x, bot.pos.y + bot.eyeY, bot.pos.z);
    return out;
  }

  function canSee(bot, target) {
    const tp = target.kind === 'player' ? playerAgent().eyePos(_tp) : target.pos;
    const dx = tp.x - bot.pos.x;
    const dz = tp.z - bot.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > BOT.seeRange * BOT.seeRange) return false;
    const angle = Math.atan2(-dx, -dz);
    if (Math.abs(angleDelta(angle, bot.yaw)) > 1.15 && d2 > 9) return false;
    const from = eyePos(bot, _from);
    const ty = target.kind === 'player' ? tp.y : tp.y + 1.2;
    return los(from.x, from.y, from.z, tp.x, ty, tp.z);
  }

  function nearestVisibleEnemy(bot) {
    let best = null;
    let bestD = Infinity;
    const player = playerAgent();
    if (player.alive && canSee(bot, player)) {
      const d = dist2D2(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z);
      best = player;
      bestD = d;
    }
    for (const other of list) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      if (!canSee(bot, other)) continue;
      const d = dist2D2(bot.pos.x, bot.pos.z, other.pos.x, other.pos.z);
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  function collide(bot, dt) {
    const r = 0.38;
    const p = bot.pos;
    for (const c of world.colliders) {
      if (p.y + 1.8 < c.minY || p.y > c.maxY) continue;
      if (p.x + r > c.minX && p.x - r < c.maxX && p.z + r > c.minZ && p.z - r < c.maxZ) {
        // Push out along the smaller penetration axis.
        const dxl = p.x - c.minX + r;
        const dxr = c.maxX - p.x + r;
        const dzl = p.z - c.minZ + r;
        const dzr = c.maxZ - p.z + r;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = c.minX - r - 0.001;
        else if (m === dxr) p.x = c.maxX + r + 0.001;
        else if (m === dzl) p.z = c.minZ - r - 0.001;
        else p.z = c.maxZ + r + 0.001;
      }
    }
    p.x = clamp(p.x, world.bounds.minX, world.bounds.maxX);
    p.z = clamp(p.z, world.bounds.minZ, world.bounds.maxZ);
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const stepLen = Math.min(d, speed * dt);
    bot.pos.x += (dx / d) * stepLen;
    bot.pos.z += (dz / d) * stepLen;
    const targetYaw = Math.atan2(-dx, -dz);
    bot.yaw += angleDelta(targetYaw, bot.yaw) * Math.min(1, dt * 8);
    bot.stepPhase += speed * dt * 2.4;
    return d < 0.4;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathI >= bot.path.length) return true;
    const node = nodes[bot.path[bot.pathI]];
    const arrived = moveToward(bot, node[0], node[1], dt, speed);
    if (arrived) bot.pathI += 1;
    // Stuck: no progress in 1.5 s while a path remains -> skip a node.
    const moved = dist2D2(bot.pos.x, bot.pos.z, bot.lastX, bot.lastZ);
    if (moved > 0.04) {
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
      bot.stuckTimer = 0;
    } else {
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 1.5) {
        bot.pathI += 1;
        bot.stuckTimer = 0;
      }
    }
    return bot.pathI >= bot.path.length;
  }

  function shootAt(bot, target, dt) {
    const def = WEAPONS[bot.weapon];
    bot.cooldown -= dt;
    if (bot.reloading) {
      bot.reloadTimer -= dt;
      if (bot.reloadTimer <= 0) {
        const need = def.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
        bot.reloading = false;
      }
      return;
    }
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = BOT.burstMin + ((random() * (BOT.burstMax - BOT.burstMin + 1)) | 0);
      return;
    }
    if (bot.cooldown > 0) return;
    if (bot.mag <= 0) {
      if (bot.reserve > 0) {
        bot.reloading = true;
        bot.reloadTimer = def.reload;
      } else {
        bot.weapon = 'pistol';
        bot.mag = WEAPONS.pistol.mag;
        bot.reserve = WEAPONS.pistol.reserve;
      }
      return;
    }
    bot.mag -= 1;
    bot.cooldown = 1 / def.rate;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = randomRange(random, BOT.burstPauseMin, BOT.burstPauseMax);
    // Aim: chest or head, with error that grows with distance and target speed.
    const tp = target.kind === 'player' ? playerAgent().eyePos(_tp) : target.pos;
    const headShot = random() < 0.16;
    const aimY = headShot ? (target.kind === 'player' ? tp.y - 0.25 : tp.y + 1.6) : (target.kind === 'player' ? tp.y - 0.5 : tp.y + 1.15);
    const dx = tp.x - bot.pos.x;
    const dy = aimY - (bot.pos.y + bot.eyeY);
    const dz = tp.z - bot.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const err = BOT.aimError * (1.6 - bot.skill) * (1 + dist / 45);
    _dir.set(
      dx / dist + (random() * 2 - 1) * err,
      dy / dist + (random() * 2 - 1) * err * 0.7,
      dz / dist + (random() * 2 - 1) * err,
    ).normalize();
    const from = eyePos(bot, _eye);
    fireBotShot(bot, from, _dir, def);
    onHear(bot.pos.x, bot.pos.z, bot.team);
  }

  function stepBot(bot, dt) {
    if (!bot.alive || game.phase !== 'live') return;
    // Spot enemies.
    const seen = nearestVisibleEnemy(bot);
    if (seen && seen !== bot.visibleEnemy) {
      bot.visibleEnemy = seen;
      bot.reaction = randomRange(random, BOT.reactionMin, BOT.reactionMax) * (1.3 - bot.skill * 0.5);
    } else if (!seen) {
      bot.visibleEnemy = null;
    }
    if (bot.visibleEnemy) {
      if (bot.reaction > 0) {
        // Freeze and face the threat while reacting — no peeking around corners.
        bot.reaction -= dt;
        const tp = bot.visibleEnemy.kind === 'player' ? playerAgent().eyePos(_tp) : bot.visibleEnemy.pos;
        const dx = tp.x - bot.pos.x;
        const dz = tp.z - bot.pos.z;
        bot.yaw += angleDelta(Math.atan2(-dx, -dz), bot.yaw) * Math.min(1, dt * 10);
        syncModel(bot, dt, 0);
        return;
      }
      // Strafe while engaging; crouch sometimes to steady the aim.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.6 + random() * 0.7;
        bot.crouch = random() < 0.3;
      }
      const tp = bot.visibleEnemy.kind === 'player' ? playerAgent().eyePos(_tp) : bot.visibleEnemy.pos;
      const dx = tp.x - bot.pos.x;
      const dz = tp.z - bot.pos.z;
      const targetYaw = Math.atan2(-dx, -dz);
      bot.yaw += angleDelta(targetYaw, bot.yaw) * Math.min(1, dt * 10);
      const strafe = bot.strafeDir * 1.1;
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      bot.pos.x += cos * strafe * dt;
      bot.pos.z += -sin * strafe * dt;
      collide(bot, dt);
      shootAt(bot, bot.visibleEnemy, dt);
      syncModel(bot, dt, 1.1);
      return;
    }
    bot.crouch = false;

    // Objective behaviour.
    if (bot.team === 'vanguard') {
      stepVanguard(bot, dt);
    } else {
      stepSentinel(bot, dt);
    }
    syncModel(bot, dt, bot.state === 'advance' ? BOT.runSpeed : 0);
  }

  function stepVanguard(bot, dt) {
    const spike = game.spike;
    if (spike.planted) {
      // Hold the site after the plant.
      if (bot.state !== 'hold') { bot.state = 'hold'; setPath(bot, bot.route === 'A' ? 3 : 6); }
      if (followPath(bot, dt, BOT.walkSpeed)) {
        bot.yaw += Math.sin(game.time * 0.4 + bot.index) * dt * 0.5;
      }
      return;
    }
    if (bot.hasSpike) {
      const siteNode = bot.route === 'A' ? 3 : 6;
      const site = world.sites[bot.route];
      const d = Math.hypot(site.plant.x - bot.pos.x, site.plant.z - bot.pos.z);
      if (d < 1.4) {
        bot.state = 'plant';
        bot.plantTimer += dt;
        bot.yaw += dt * 0.3;
        if (bot.plantTimer >= ROUND.plantTime) {
          bot.plantTimer = 0;
          bot.state = 'hold';
          game.plantSpike(bot.route, bot);
        }
        return;
      }
      bot.state = 'advance';
      followPath(bot, dt, BOT.runSpeed);
      return;
    }
    // Not the carrier: if the spike is on the ground, go pick it up.
    if (spike.carrier === null && spike.x !== 0) {
      const d = Math.hypot(spike.x - bot.pos.x, spike.z - bot.pos.z);
      if (d < 1.2) {
        bot.hasSpike = true;
        spike.carrier = bot;
        bot.route = spike.site || bot.route;
        setPath(bot, bot.route === 'A' ? 3 : 6);
        return;
      }
      if (bot.state !== 'fetch') {
        bot.state = 'fetch';
        setPath(bot, nearestNode(spike.x, spike.z));
      }
      followPath(bot, dt, BOT.runSpeed);
      return;
    }
    // Escort the carrier's route.
    if (bot.state !== 'advance') {
      bot.state = 'advance';
      setPath(bot, bot.route === 'A' ? 3 : 6);
    }
    followPath(bot, dt, BOT.runSpeed);
  }

  function stepSentinel(bot, dt) {
    const spike = game.spike;
    if (spike.planted) {
      const d = Math.hypot(spike.x - bot.pos.x, spike.z - bot.pos.z);
      if (d < 1.6 && !bot.visibleEnemy) {
        bot.state = 'defuse';
        bot.defuseTimer += dt;
        if (bot.defuseTimer >= ROUND.defuseTime) {
          bot.defuseTimer = 0;
          game.defuseSpike(bot);
        }
        return;
      }
      if (bot.state !== 'rotate') {
        bot.state = 'rotate';
        setPath(bot, spike.site === 'A' ? 3 : 6);
      }
      followPath(bot, dt, BOT.runSpeed);
      return;
    }
    // Rotate toward recent gunfire near a site.
    if (bot.heardAt > 0 && game.time - bot.heardAt < 6) {
      const site = bot.heardSite;
      if (site && site !== bot.holdSite && bot.state !== 'rotate') {
        bot.state = 'rotate';
        setPath(bot, site === 'A' ? 16 : 20);
      }
    }
    if (bot.state === 'rotate') {
      if (followPath(bot, dt, BOT.runSpeed)) {
        bot.state = 'hold';
        bot.heardAt = 0;
      }
      return;
    }
    if (bot.state === 'advance') {
      if (followPath(bot, dt, BOT.walkSpeed)) bot.state = 'hold';
      return;
    }
    // Hold: face the assigned angle, scan slowly.
    bot.yaw = bot.holdYaw + Math.sin(game.time * 0.35 + bot.index * 1.7) * 0.5;
  }

  function hearShot(x, z, team) {
    // Sentinels rotate toward gunfire near their sites; vanguard ignores it.
    for (const bot of list) {
      if (!bot.alive || bot.team !== 'sentinel' || bot.state === 'defuse') continue;
      const d2 = dist2D2(bot.pos.x, bot.pos.z, x, z);
      if (d2 > BOT.hearRange * BOT.hearRange) continue;
      const site = z < -6 ? 'A' : z > 6 ? 'B' : 'mid';
      if (site === 'mid') continue;
      bot.heardAt = game.time;
      bot.heardSite = site;
    }
  }

  function syncModel(bot, dt, speed) {
    const g = bot.group;
    g.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    g.rotation.y = bot.yaw;
    const swing = speed > 0.5 ? Math.sin(bot.stepPhase) * 0.45 : 0;
    bot.parts.legL.rotation.x = swing;
    bot.parts.legR.rotation.x = -swing;
    g.position.y = bot.pos.y + (speed > 0.5 ? Math.abs(Math.sin(bot.stepPhase)) * 0.05 : 0);
    bot.eyeY = bot.crouch ? 1.2 : 1.55;
    g.scale.y = bot.crouch ? 0.82 : 1;
  }

  function damage(bot, amount, part, attacker) {
    if (!bot.alive) return false;
    let dmg = amount;
    if (part === 'head' && bot.hasHelmet) dmg *= 0.6;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dmg * 0.5);
      bot.armor -= absorbed;
      dmg -= absorbed;
    }
    bot.health -= dmg;
    updateBar(bot);
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.group.visible = false;
      bot.bar.sprite.visible = false;
      if (bot.hasSpike) {
        bot.hasSpike = false;
        game.spike.carrier = null;
        game.spike.x = bot.pos.x;
        game.spike.z = bot.pos.z;
        game.spike.site = bot.route;
      }
      onDeath(bot, attacker);
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of list) if (bot.alive && bot.team === team) n += 1;
    return n;
  }

  function step(dt) {
    for (const bot of list) stepBot(bot, dt);
  }

  return { list, step, resetRound, damage, hearShot, aliveCount, updateBar, nearestNode };
}

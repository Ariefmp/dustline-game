// Combat: the one raycaster everything shoots through. Player shots and bot
// shots share the same resolve: nearest hit wins among world surfaces and agent
// hit meshes, headshots multiply, armour absorbs half, and a kill is one event
// for the kill feed, the score and the economy. Grenades and the spike live here
// too. All temporary vectors are module-level; nothing allocates per shot.
import * as THREE from 'three';
import { clamp, segmentHitsCircle } from './util.js';

export function createCombat(scene, world, effects, audio, deps) {
  const { getAgents, player, onKill, onPlayerDamage, game } = deps;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const targets = [];
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _hit = new THREE.Vector3();
  const _chest = new THREE.Vector3();

  // The player's own hit meshes: invisible boxes that follow the camera so
  // bots can hit the player with the same raycast the player uses on them.
  const playerHit = new THREE.Group();
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const pHead = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.32), hitMat);
  pHead.position.y = 1.5;
  const pTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), hitMat);
  pTorso.position.y = 1.05;
  const pLegs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), hitMat);
  pLegs.position.y = 0.4;
  playerHit.add(pHead, pTorso, pLegs);
  scene.add(playerHit);
  const playerAgent = {
    kind: 'player', name: 'You', team: 'sentinel', alive: true,
    pos: player.state.position,
    hitMeshes: [pHead, pTorso, pLegs],
    eyeY: 1.62,
    eyePos(out) {
      out.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
      return out;
    },
  };
  pHead.userData.agent = playerAgent;
  pHead.userData.part = 'head';
  pTorso.userData.agent = playerAgent;
  pTorso.userData.part = 'body';
  pLegs.userData.agent = playerAgent;
  pLegs.userData.part = 'legs';

  function syncPlayer() {
    const s = player.state;
    playerHit.position.set(s.position.x, s.position.y, s.position.z);
    playerHit.rotation.y = s.yaw;
    playerHit.scale.y = s.crouched ? 0.78 : 1;
    playerAgent.alive = s.alive;
  }

  function los(ax, ay, az, bx, by, bz) {
    _to.set(bx - ax, by - ay, bz - az);
    const dist = _to.length();
    if (dist < 0.01) return true;
    _to.divideScalar(dist);
    raycaster.set(_origin.set(ax, ay, az), _to);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    if (hits.length > 0) return false;
    for (const s of effects.activeSmokes()) {
      if (segmentHitsCircle(ax, az, bx, bz, s.x, s.z, s.radius)) return false;
    }
    return true;
  }

  function agentChest(agent, out) {
    if (agent.kind === 'player') {
      out.set(agent.pos.x, agent.pos.y + 1.1, agent.pos.z);
    } else {
      out.set(agent.pos.x, agent.pos.y + 1.15, agent.pos.z);
    }
    return out;
  }

  function applyDamage(agent, raw, part, attacker, dist, def) {
    if (!agent.alive) return false;
    let dmg = raw;
    if (def) dmg *= 1 - def.falloff * clamp(dist / def.range, 0, 1);
    if (part === 'head') {
      const mult = agent.hasHelmet ? Math.min(def.headMult, 2) : def.headMult;
      dmg *= mult;
    }
    const arm = agent.kind === 'player' ? player.state.armor : agent.armor;
    if (arm > 0) {
      const absorbed = Math.min(arm, dmg * 0.5);
      if (agent.kind === 'player') player.state.armor -= absorbed;
      else agent.armor -= absorbed;
      dmg -= absorbed;
    }
    if (agent.kind === 'player') {
      player.state.health -= dmg;
      onPlayerDamage(dmg, attacker);
      if (player.state.health <= 0) {
        player.state.health = 0;
        player.state.alive = false;
        onKill(attacker, agent, part === 'head');
        return true;
      }
      return false;
    }
    return deps.damageBot(agent, dmg, part, attacker);
  }

  function resolveShot(from, dir, def, shooter, pellets) {
    const agents = getAgents();
    // Reused target list: world surfaces first, then live agents' hit meshes.
    targets.length = 0;
    for (let i = 0; i < world.shootables.length; i += 1) targets.push(world.shootables[i]);
    for (const agent of agents) {
      if (!agent.alive || agent === shooter) continue;
      for (const mesh of agent.hitMeshes) targets.push(mesh);
    }
    let best = null;
    let bestDist = Infinity;
    let bestPart = null;
    let bestAgent = null;
    for (let p = 0; p < pellets; p += 1) {
      _dir.copy(dir);
      if (pellets > 1) {
        _dir.x += (Math.random() * 2 - 1) * def.spread * 0.9;
        _dir.y += (Math.random() * 2 - 1) * def.spread * 0.9;
        _dir.z += (Math.random() * 2 - 1) * def.spread * 0.9;
        _dir.normalize();
      }
      raycaster.set(_origin.copy(from), _dir);
      raycaster.far = def.range + 30;
      const hits = raycaster.intersectObjects(targets, false);
      if (!hits.length) continue;
      const hit = hits[0];
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = hit;
        bestPart = hit.object.userData.part || null;
        bestAgent = hit.object.userData.agent || null;
      }
    }
    if (!best) return { hit: false, point: null };
    _hit.copy(from).addScaledVector(_dir, bestDist);
    let killed = false;
    let headshot = false;
    if (bestAgent) {
      headshot = bestPart === 'head';
      killed = applyDamage(bestAgent, def.damage, bestPart, shooter, bestDist, def);
      return { hit: true, killed, headshot, agent: bestAgent, point: _hit.clone(), dist: bestDist };
    }
    return { hit: true, killed: false, headshot: false, agent: null, point: _hit.clone(), dist: bestDist, normal: best.face ? best.face.normal : null };
  }

  function playerShoot(origin, dir, def) {
    const result = resolveShot(origin, dir, def, playerAgent, def.pellets);
    if (result.point) {
      effects.tracer(origin, result.point, def.tracer);
      if (!result.agent) {
        const n = result.normal || _to.set(0, 1, 0);
        effects.impact(result.point, n);
      }
    } else {
      _to.copy(origin).addScaledVector(dir, 60);
      effects.tracer(origin, _to, def.tracer);
    }
    return result;
  }

  function botShoot(bot, from, dir, def) {
    const result = resolveShot(from, dir, def, bot, 1);
    if (result.point) {
      effects.tracer(from, result.point, def.tracer);
      if (!result.agent) effects.impact(result.point, _to.set(0, 1, 0));
    } else {
      _to.copy(from).addScaledVector(dir, 60);
      effects.tracer(from, _to, def.tracer);
    }
    const dist = Math.hypot(from.x - player.state.position.x, from.z - player.state.position.z);
    audio.shoot(def.sound, dist);
    return result;
  }

  // ---- grenades ----------------------------------------------------------
  const grenades = [];
  for (let i = 0; i < 4; i += 1) {
    grenades.push({
      active: false, kind: 'frag', owner: null,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      fuse: 0, mesh: null,
    });
  }
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 });

  function throwGrenade(from, dir, kind, owner) {
    let g = null;
    for (const cand of grenades) if (!cand.active) { g = cand; break; }
    if (!g) return false;
    g.active = true;
    g.kind = kind;
    g.owner = owner;
    g.pos.copy(from);
    g.vel.copy(dir).multiplyScalar(13);
    g.vel.y += 3.2;
    g.fuse = kind === 'frag' ? 1.6 : 1.1;
    if (!g.mesh) {
      g.mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      g.mesh.castShadow = true;
      scene.add(g.mesh);
    }
    g.mesh.visible = true;
    audio.grenadeThrow();
    return true;
  }

  function blastDamage(x, y, z, radius, maxDmg, throughWalls, owner) {
    for (const agent of getAgents()) {
      if (!agent.alive) continue;
      agentChest(agent, _chest);
      const d = Math.hypot(_chest.x - x, _chest.y - y, _chest.z - z);
      if (d > radius) continue;
      let dmg = maxDmg * (1 - d / radius);
      if (!throughWalls && !los(x, y + 0.3, z, _chest.x, _chest.y, _chest.z)) dmg *= 0.4;
      if (agent.kind === 'player') {
        player.state.health -= dmg;
        onPlayerDamage(dmg, null);
        if (player.state.health <= 0) {
          player.state.health = 0;
          player.state.alive = false;
          onKill(null, agent, false);
        }
      } else {
        deps.damageBot(agent, dmg, 'body', owner || null);
      }
    }
  }

  function stepGrenades(dt) {
    for (const g of grenades) {
      if (!g.active) continue;
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      g.pos.addScaledVector(g.vel, dt);
      // Ground bounce.
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        if (Math.abs(g.vel.y) > 1) audio.grenadeBounce();
        g.vel.y = Math.abs(g.vel.y) * 0.42;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      // Wall bounce: push out along the smallest penetration, reflect.
      for (const c of world.colliders) {
        if (g.pos.y > c.maxY || g.pos.y < c.minY) continue;
        const r = 0.09;
        if (g.pos.x + r > c.minX && g.pos.x - r < c.maxX && g.pos.z + r > c.minZ && g.pos.z - r < c.maxZ) {
          const dxl = g.pos.x - c.minX + r;
          const dxr = c.maxX - g.pos.x + r;
          const dzl = g.pos.z - c.minZ + r;
          const dzr = c.maxZ - g.pos.z + r;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) { g.pos.x = c.minX - r; g.vel.x = -Math.abs(g.vel.x) * 0.4; }
          else if (m === dxr) { g.pos.x = c.maxX + r; g.vel.x = Math.abs(g.vel.x) * 0.4; }
          else if (m === dzl) { g.pos.z = c.minZ - r; g.vel.z = -Math.abs(g.vel.z) * 0.4; }
          else { g.pos.z = c.maxZ + r; g.vel.z = Math.abs(g.vel.z) * 0.4; }
        }
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        if (g.kind === 'frag') {
          effects.explosion(g.pos);
          audio.explosion(Math.hypot(g.pos.x - player.state.position.x, g.pos.z - player.state.position.z));
          blastDamage(g.pos.x, g.pos.y, g.pos.z, 7.5, 120, false, g.owner);
          game.shake(0.5);
        } else {
          effects.smoke(g.pos);
        }
      }
    }
  }

  function explodeSpike(x, z) {
    const pos = new THREE.Vector3(x, 0.4, z);
    effects.explosion(pos);
    audio.explosion(Math.hypot(x - player.state.position.x, z - player.state.position.z));
    game.shake(1);
    blastDamage(x, 0.4, z, 13, 220, true);
  }

  function reset() {
    for (const g of grenades) {
      g.active = false;
      if (g.mesh) g.mesh.visible = false;
    }
  }

  return {
    playerAgent, syncPlayer, los, playerShoot, botShoot, throwGrenade,
    stepGrenades, explodeSpike, blastDamage, reset,
  };
}

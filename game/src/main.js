// DUSTLINE: a round-based tactical FPS. Boot and the one loop: a fixed 60 Hz
// simulation feeding a render at the display's rate. State lives in one `game`
// object; modules read it, main.js wires them together.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, ROUND } from './config.js';
import { mulberry32, clamp, angleDelta } from './util.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const game = {
  phase: 'menu',
  time: 0,
  round: 1,
  roundTimer: 0,
  score: { sentinel: 0, vanguard: 0 },
  money: 800,
  lossStreak: 0,
  kills: 0, deaths: 0, headshots: 0, shotsFired: 0, shotsHit: 0,
  spike: { planted: false, site: null, x: 0, z: 0, timer: 0, carrier: null },
  spikeHolder: null,
  hasDefuseKit: false,
  shakeAmt: 0,
  shake(strength) { game.shakeAmt = Math.max(game.shakeAmt, strength); },
  plantSpike: null,
  defuseSpike: null,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 34, 110);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene, seed);
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(world.colliders, world.bounds);
const weapons = createWeapons(camera, audio);
const hud = createHud(world, game);
const input = createInput(renderer.domElement, onLockChange);

let bots = null;
const combat = createCombat(scene, world, effects, audio, {
  getAgents: () => [combat.playerAgent, ...bots.list],
  player,
  onKill,
  onPlayerDamage,
  game,
  damageBot: (bot, dmg, part, attacker) => bots.damage(bot, dmg, part, attacker),
});
bots = createBots(scene, world, {
  random,
  los: (ax, ay, az, bx, by, bz) => combat.los(ax, ay, az, bx, by, bz),
  fireBotShot: (bot, from, dir, def) => combat.botShoot(bot, from, dir, def),
  playerAgent: () => combat.playerAgent,
  onDeath: (bot, killer) => {
    if (bot.team === 'vanguard' && bot.hasSpike) {
      hud.hint('The spike was dropped — ' + bot.name + ' is down');
    }
  },
  onHear: (x, z, team) => bots.hearShot(x, z, team),
  game,
});

const rounds = createRounds(game, {
  player,
  weapons,
  audio,
  world,
  onPhase,
  onRoundEnd,
  onMatchEnd,
  onSpikePlanted,
  onSpikeDefused,
  resetActors,
  spike: world.spike,
  spikeLight: world.spikeLight,
  explodeSpike: (x, z) => combat.explodeSpike(x, z),
  aliveCount: (team) => bots.aliveCount(team),
});

// ---- shared state --------------------------------------------------------
const eye = new THREE.Vector3();
const dir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const shakeVec = new THREE.Vector3();
let frozen = false;
let started = false;
let unlockForBuy = false; // the buy menu frees the mouse on purpose; not a pause
let spectateIdx = 0;
let prevFiring = false;
let spotTimer = 0;
let spotted = [];

// ---- callbacks -----------------------------------------------------------
function onKill(killer, victim, headshot) {
  hud.killFeed(killer ? killer.name : '—', victim.name, headshot, killer ? killer.team : null, victim.team);
  rounds.onKill(killer, victim, headshot);
  if (killer && killer.kind === 'player') {
    if (headshot) audio.headshot();
    else audio.kill();
  }
  hud.setMoney(game.money);
}

function onPlayerDamage(dmg, attacker) {
  audio.hurt();
  let angle = 0;
  if (attacker && attacker.pos) {
    const dx = attacker.pos.x - player.state.position.x;
    const dz = attacker.pos.z - player.state.position.z;
    const worldAngle = Math.atan2(-dx, -dz);
    angle = -angleDelta(worldAngle, player.state.yaw) * 180 / Math.PI;
  }
  hud.damageFlash(angle);
}

function onPhase(phase) {
  if (phase === 'buy') {
    hud.showBuyMenu(true);
    hud.updateBuyMenu(game.money, weapons.state.owned, weapons.state.grenades, player.state.armor, player.state.hasHelmet, game.hasDefuseKit);
    hud.hint('Buy phase — click an item or press 1–9, B to close');
    // Free the mouse so the menu is clickable; closing it re-locks.
    if (!shot && document.pointerLockElement) {
      unlockForBuy = true;
      document.exitPointerLock();
    }
  } else {
    hud.showBuyMenu(false);
    hud.hint('');
    // If the round went live while the mouse was free, offer the resume path.
    if (phase === 'live' && !shot && started && !document.pointerLockElement) {
      hud.showOverlay('paused');
    }
  }
  hud.setTimer(game.roundTimer, phase);
}

function onRoundEnd(winner, reason, money) {
  hud.setMoney(money);
  hud.setScore(game.score.sentinel, game.score.vanguard, game.round);
  hud.banner(
    winner === 'sentinel' ? 'ROUND WON' : 'ROUND LOST',
    reason + '  ·  $' + money.toLocaleString('en-US'),
    winner,
    4200,
  );
  hud.spikeStatus(null, 0);
}

function onMatchEnd(winner) {
  hud.showOverlay('matchEnd', { winner });
  if (document.pointerLockElement) document.exitPointerLock();
}

function onSpikePlanted(site) {
  hud.banner('SPIKE PLANTED', 'Site ' + site + ' — defuse it before it blows', 'vanguard', 3600);
}

function onSpikeDefused() {
  hud.banner('SPIKE DEFUSED', 'The yard is safe — for now', 'sentinel', 3600);
}

function resetActors() {
  player.spawn(20, 0, Math.PI / 2);
  weapons.reset();
  combat.reset();
  bots.resetRound(game.round);
  game.hasDefuseKit = false;
  spectateIdx = 0;
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(game.money);
  hud.setScore(game.score.sentinel, game.score.vanguard, game.round);
  const def = weapons.currentDef();
  const ammo = weapons.state.owned[weapons.state.current];
  hud.setAmmo(ammo.mag, ammo.reserve, def.name);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    if (game.phase === 'menu') {
      started = true;
      rounds.startMatch();
    } else if (game.phase === 'matchEnd') {
      rounds.startMatch();
    }
    hud.hideOverlay();
  } else if (unlockForBuy) {
    unlockForBuy = false; // the buy menu freed the mouse; not a pause
  } else if (started && (game.phase === 'live' || game.phase === 'buy' || game.phase === 'roundEnd')) {
    hud.showOverlay('paused');
  }
}

function closeBuyMenu() {
  hud.showBuyMenu(false);
  if (!shot) input.requestLock();
}

hud.onBuyClose(() => {
  closeBuyMenu();
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  input.requestLock();
});

hud.onBuy((id) => { doBuy(id); });

function doBuy(id) {
  const result = rounds.buy(id);
  if (!result.ok) {
    audio.denied();
    hud.hint(result.why);
    setTimeout(() => { if (game.phase === 'buy') hud.hint('Buy phase — click an item or press 1–9, B to close'); }, 1800);
  } else {
    hud.updateBuyMenu(game.money, weapons.state.owned, weapons.state.grenades, player.state.armor, player.state.hasHelmet, game.hasDefuseKit);
    hud.setMoney(game.money);
    const def = weapons.currentDef();
    const ammo = weapons.state.owned[weapons.state.current];
    hud.setAmmo(ammo.mag, ammo.reserve, def.name);
  }
}

// ---- camera --------------------------------------------------------------
function syncCamera() {
  if (!player.state.alive && game.phase === 'live') {
    const mates = bots.list.filter((b) => b.alive && b.team === 'sentinel');
    if (mates.length) {
      const target = mates[spectateIdx % mates.length];
      camera.position.set(target.pos.x, target.pos.y + 1.55, target.pos.z);
      camera.rotation.set(0, target.yaw, 0);
      return;
    }
  }
  player.eyePosition(eye);
  game.shakeAmt = Math.max(0, game.shakeAmt - 0.03);
  if (game.shakeAmt > 0.01) {
    effects.shake(shakeVec, game.shakeAmt * 0.06);
    eye.x += shakeVec.x;
    eye.y += shakeVec.y;
  }
  camera.position.copy(eye);
  camera.rotation.set(
    player.state.pitch + player.state.recoilPitch,
    player.state.yaw + player.state.recoilYaw,
    0,
  );
  const fov = weapons.state.scoped ? 30 : 74;
  if (Math.abs(camera.fov - fov) > 0.2) {
    camera.fov += (fov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

// ---- shooting ------------------------------------------------------------
// `pressed` is true only on the frame the trigger goes down: semi-automatic
// weapons and grenades fire once per press, automatics keep firing while held.
function tryShoot(pressed) {
  if (game.phase !== 'live' || !player.state.alive) return;
  if (weapons.state.grenadeSelected) {
    if (!pressed) return;
    const kind = weapons.state.grenadeSelected;
    player.eyePosition(eye);
    camera.getWorldDirection(dir);
    if (combat.throwGrenade(eye, dir, kind, combat.playerAgent)) {
      weapons.state.grenades[kind] -= 1;
      if (weapons.state.grenades[kind] <= 0) weapons.state.grenadeSelected = null;
      hud.hint('');
    }
    return;
  }
  const def = weapons.currentDef();
  if (!def.auto && !pressed) return;
  const fired = weapons.fire();
  if (!fired) {
    if (weapons.state.owned[weapons.state.current].mag === 0 && !weapons.state.reloading) {
      audio.dryFire();
      weapons.reload();
    }
    return;
  }
  game.shotsFired += def.pellets;
  camera.getWorldDirection(dir);
  const spread = weapons.spread(player.groundSpeed() > 0.5, !player.state.onGround, player.state.crouched);
  dir.x += (random() * 2 - 1) * spread;
  dir.y += (random() * 2 - 1) * spread;
  dir.z += (random() * 2 - 1) * spread;
  dir.normalize();
  player.eyePosition(eye);
  const result = combat.playerShoot(eye, dir, def);
  weapons.muzzleWorld(muzzle);
  effects.muzzleFlash(muzzle);
  audio.shoot(def.sound, 0);
  player.recoil(def.recoil, (random() * 2 - 1) * def.recoil * 0.4);
  bots.hearShot(player.state.position.x, player.state.position.z, 'sentinel');
  if (result.hit && result.agent) {
    game.shotsHit += 1;
    hud.hitMarker(result.killed, result.headshot, result.killed ? 4000 : 120);
    if (result.killed) audio.kill();
    else audio.hit();
  }
  const ammo = weapons.state.owned[weapons.state.current];
  hud.setAmmo(ammo.mag, ammo.reserve, def.name);
}

// ---- input edges ---------------------------------------------------------
function handlePressed() {
  const keys = input.state.keys;
  if (input.takePressed('KeyR')) weapons.reload();
  if (input.takePressed('KeyB') && game.phase === 'buy') {
    if (hud.isBuyOpen()) closeBuyMenu();
    else {
      hud.showBuyMenu(true);
      if (document.pointerLockElement) {
        unlockForBuy = true;
        document.exitPointerLock();
      }
    }
  }
  if (input.takePressed('MouseScope')) weapons.toggleScope();
  if (input.takePressed('MouseScopeOff') && weapons.state.scoped) weapons.toggleScope();
  if (input.takePressed('KeyM')) audio.toggleMute();
  if (input.takePressed('Digit1')) {
    if (hud.isBuyOpen()) buyByIndex(0);
    else selectPrimary();
  }
  if (input.takePressed('Digit2')) {
    if (hud.isBuyOpen()) buyByIndex(1);
    else weapons.select('pistol');
  }
  if (input.takePressed('Digit3')) {
    if (hud.isBuyOpen()) buyByIndex(2);
    else cycleGrenade();
  }
  if (input.takePressed('Digit4')) {
    if (hud.isBuyOpen()) buyByIndex(3);
    else selectGrenade('frag');
  }
  if (input.takePressed('Digit5')) {
    if (hud.isBuyOpen()) buyByIndex(4);
    else selectGrenade('smoke');
  }
  for (let n = 6; n <= 9; n += 1) {
    if (input.takePressed('Digit' + n) && hud.isBuyOpen()) buyByIndex(n - 1);
  }
  if (input.takePressed('WheelUp')) weapons.cycle(-1);
  if (input.takePressed('WheelDown')) weapons.cycle(1);
  if (input.takePressed('KeyQ')) weapons.cycle(1);
}

function buyByIndex(i) {
  const order = ['smg', 'rifle', 'shotgun', 'sniper', 'kevlar', 'helmet', 'defuseKit', 'frag', 'smoke'];
  if (order[i]) doBuy(order[i]);
}

function selectPrimary() {
  const ids = Object.keys(weapons.state.owned).filter((id) => id !== 'pistol');
  if (ids.length) weapons.select(ids[0]);
}

function selectGrenade(kind) {
  if (weapons.state.grenades[kind] > 0) {
    weapons.state.grenadeSelected = weapons.state.grenadeSelected === kind ? null : kind;
    hud.hint(weapons.state.grenadeSelected ? 'Click to throw ' + (kind === 'frag' ? 'Spark-9 Frag' : 'Veil Smoke') : '');
  } else {
    hud.hint('No ' + kind + ' grenade — buy one in the buy phase');
  }
}

function cycleGrenade() {
  if (weapons.state.grenades.frag > 0) selectGrenade('frag');
  else if (weapons.state.grenades.smoke > 0) selectGrenade('smoke');
}

// ---- simulation ----------------------------------------------------------
function step(dt) {
  game.time += dt;
  const keys = input.state.keys;
  const live = game.phase === 'live' || game.phase === 'buy';
  if (live && player.state.alive) {
    player.step(dt, keys);
    if (player.state.stepped) {
      player.state.stepped = false;
      audio.step(0);
    }
  }
  weapons.step(dt, live && player.state.alive ? player.groundSpeed() : 0);
  bots.step(dt);
  combat.stepGrenades(dt);
  rounds.step(dt);
  effects.step(dt);
  combat.syncPlayer();

  // Defuse: hold E near a planted spike.
  if (game.phase === 'live' && game.spike.planted && player.state.alive) {
    const d = Math.hypot(game.spike.x - player.state.position.x, game.spike.z - player.state.position.z);
    if (d < 1.8) {
      const progress = rounds.playerDefuse(dt, keys.has('KeyE'));
      if (keys.has('KeyE')) hud.spikeStatus('DEFUSING…', progress);
      else hud.spikeStatus('Hold E to defuse — ' + Math.ceil(game.spike.timer) + 's left', game.spike.timer / ROUND.spikeTime);
    } else {
      rounds.playerDefuse(dt, false);
      const defuser = bots.list.find((b) => b.alive && b.state === 'defuse');
      if (defuser) hud.spikeStatus(defuser.name + ' is defusing…', defuser.defuseTimer / ROUND.defuseTime);
      else hud.spikeStatus('SPIKE PLANTED — Site ' + game.spike.site + ' · ' + Math.ceil(game.spike.timer) + 's', game.spike.timer / ROUND.spikeTime);
    }
  } else if (game.phase !== 'live') {
    hud.spikeStatus(null, 0);
  }
}

// ---- per-frame HUD -------------------------------------------------------
function updateHud(dt) {
  const s = player.state;
  hud.setHealth(s.health, s.armor);
  const def = weapons.currentDef();
  const ammo = weapons.state.owned[weapons.state.current];
  hud.setAmmo(ammo.mag, ammo.reserve, def.name);
  hud.setTimer(game.roundTimer, game.phase);
  hud.setMoney(game.money);
  const spreadPx = 5 + weapons.spread(player.groundSpeed() > 0.5, !s.onGround, s.crouched) * 900;
  hud.setCrosshairGap(weapons.state.scoped ? 0 : spreadPx);
  document.getElementById('crosshair').style.opacity = weapons.state.scoped ? '0' : '1';

  // Minimap: teammates always, enemies only while the player can see them.
  spotTimer -= dt;
  if (spotTimer <= 0) {
    spotTimer = 0.25;
    spotted = [];
    player.eyePosition(eye);
    for (const bot of bots.list) {
      if (!bot.alive || bot.team !== 'vanguard') continue;
      const d = Math.hypot(bot.pos.x - s.position.x, bot.pos.z - s.position.z);
      if (d > 42) continue;
      const dx = bot.pos.x - s.position.x;
      const dz = bot.pos.z - s.position.z;
      const ang = Math.atan2(-dx, -dz);
      if (Math.abs(angleDelta(ang, s.yaw)) > 1.1 && d > 6) continue;
      if (combat.los(eye.x, eye.y, eye.z, bot.pos.x, bot.pos.y + 1.2, bot.pos.z)) {
        spotted.push({ x: bot.pos.x, z: bot.pos.z });
      }
    }
  }
  const mates = bots.list.filter((b) => b.alive && b.team === 'sentinel').map((b) => ({ x: b.pos.x, z: b.pos.z }));
  hud.drawMinimap(s.position, s.yaw, mates, spotted, game.spike);

  if (game.phase === 'live' && !s.alive) {
    hud.hint('You were eliminated — click to switch spectate target');
  }
}

// ---- frame loop ----------------------------------------------------------
let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  if (!shot) {
    const look = input.takeLook();
    if (input.state.locked && player.state.alive) player.look(look.x, look.y, 1);
    handlePressed();
    if (input.state.firing && !prevFiring && !player.state.alive && game.phase === 'live') {
      spectateIdx += 1;
    }
    if (input.state.firing && player.state.alive) tryShoot(!prevFiring);
    prevFiring = input.state.firing;
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  updateHud(dt);
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
  // Raycasts read matrixWorld; the staged shots render nothing between steps.
  scene.updateMatrixWorld(true);
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    updateHud(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    player.spawn(16, 12, Math.PI * 0.62);
    settle(10);
    aimAt(new THREE.Vector3(-8, 1.5, -6));
    hud.showOverlay('start');
    hud.setScore(0, 0, 1);
    paintTwiceThenReady();
    return;
  }
  rounds.startMatch();
  if (name === 'buy') {
    settle(10);
    aimAt(new THREE.Vector3(-4, 1.5, 0));
    hud.updateBuyMenu(game.money, weapons.state.owned, weapons.state.grenades, player.state.armor, player.state.hasHelmet, game.hasDefuseKit);
    paintTwiceThenReady();
    return;
  }
  if (name === 'end') {
    game.score.sentinel = 5;
    game.score.vanguard = 3;
    settle(30);
    rounds.endRound('sentinel', 'Enemy team eliminated');
    player.spawn(8, 4, Math.PI * 0.6);
    settle(5);
    aimAt(new THREE.Vector3(-8, 1.5, -8));
    paintTwiceThenReady();
    return;
  }
  // play: jump straight into live play, let the bots advance, then aim at one.
  game.phase = 'live';
  game.roundTimer = 88;
  hud.showBuyMenu(false);
  settle(150);
  let target = null;
  let bestD = Infinity;
  for (const bot of bots.list) {
    if (!bot.alive || bot.team !== 'vanguard') continue;
    const d = Math.hypot(bot.pos.x - player.state.position.x, bot.pos.z - player.state.position.z);
    if (d < bestD) { bestD = d; target = bot; }
  }
  if (target) {
    player.spawn(target.pos.x + 11, target.pos.z + 3, 0);
    settle(6);
    aimAt(new THREE.Vector3(target.pos.x, target.pos.y + 1.3, target.pos.z));
    tryShoot(true);
    settle(2);
    aimAt(new THREE.Vector3(target.pos.x, target.pos.y + 1.3, target.pos.z));
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Clicking the game view re-locks the pointer when play is live but unlocked.
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if (!document.pointerLockElement && !hud.isBuyOpen()
    && (game.phase === 'live' || game.phase === 'buy' || game.phase === 'roundEnd')) {
    input.requestLock();
  }
});

syncCamera();
hud.showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);

// The player's arsenal: weapon state, fire timing, spread, recoil, reload and the
// procedural viewmodel. The raycast itself lives in combat.js; this module decides
// when a shot may happen and how wild it is, then hands the shot off.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { clamp } from './util.js';

export function createWeapons(camera, audio) {
  const state = {
    owned: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    current: 'pistol',
    cooldown: 0,
    reloading: false,
    reloadTimer: 0,
    scoped: false,
    grenades: { frag: 0, smoke: 0 },
    grenadeSelected: null, // 'frag' | 'smoke' | null
    spreadBloom: 0, // grows while firing, decays while idle
  };

  // Procedural viewmodel: a gun built from boxes, parented to the camera.
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.7 });
  const gunAccent = new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), gunMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), gunMat);
  barrel.position.set(0, 0.02, -0.4);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), gunAccent);
  grip.position.set(0, -0.12, 0.16);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), gunAccent);
  sight.position.set(0, 0.09, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.09), gunMat);
  mag.position.set(0, -0.11, -0.05);
  gun.add(body, barrel, grip, sight, mag);
  gun.position.set(0.26, -0.24, -0.5);
  camera.add(gun);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.62);
  gun.add(muzzle);

  const bobPhase = { value: 0 };
  let kick = 0;
  let reloadDip = 0;

  function currentDef() {
    return WEAPONS[state.current];
  }

  function give(id) {
    const def = WEAPONS[id];
    if (!state.owned[id]) state.owned[id] = { mag: def.mag, reserve: def.reserve };
  }

  function buy(id) {
    give(id);
    return true;
  }

  function select(id) {
    if (!state.owned[id]) return false;
    if (state.current === id) return true;
    state.current = id;
    state.grenadeSelected = null;
    state.reloading = false;
    state.cooldown = 0.25;
    state.scoped = false;
    updateViewmodel();
    return true;
  }

  function cycle(dir) {
    const ids = Object.keys(state.owned);
    const idx = ids.indexOf(state.current);
    const next = ids[(idx + dir + ids.length) % ids.length];
    select(next);
  }

  function updateViewmodel() {
    const def = currentDef();
    const len = def.id === 'sniper' ? 0.78 : def.id === 'shotgun' ? 0.66 : def.id === 'smg' ? 0.52 : def.id === 'rifle' ? 0.62 : 0.36;
    body.scale.z = len / 0.5;
    barrel.position.z = -len / 2 - 0.1;
    barrel.scale.z = len / 0.5;
    muzzle.position.z = -len / 2 - 0.28;
    gun.visible = true;
  }

  function spread(moving, airborne, crouched) {
    const def = currentDef();
    let s = def.spread + state.spreadBloom;
    if (moving) s += def.spreadMove;
    if (airborne) s += 0.03;
    if (crouched) s *= 0.7;
    if (state.scoped) s *= 0.25;
    return s;
  }

  function canFire() {
    const def = currentDef();
    const ammo = state.owned[state.current];
    return !state.reloading && state.cooldown <= 0 && ammo.mag > 0 && def;
  }

  function fire() {
    const def = currentDef();
    const ammo = state.owned[state.current];
    if (!canFire()) return null;
    ammo.mag -= 1;
    state.cooldown = 1 / def.rate;
    state.spreadBloom = Math.min(0.05, state.spreadBloom + def.recoil * 0.55);
    kick = Math.min(0.09, kick + def.kick * 0.02);
    return { def, ammo };
  }

  function reload() {
    const def = currentDef();
    const ammo = state.owned[state.current];
    if (state.reloading || ammo.mag === def.mag || ammo.reserve <= 0) return false;
    state.reloading = true;
    state.reloadTimer = def.reload;
    state.scoped = false;
    audio.reload();
    return true;
  }

  function toggleScope() {
    const def = currentDef();
    if (!def.scoped || state.reloading) return false;
    state.scoped = !state.scoped;
    audio.scope();
    return state.scoped;
  }

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.spreadBloom = Math.max(0, state.spreadBloom - dt * 0.09);
    kick = Math.max(0, kick - dt * 0.35);
    if (state.reloading) {
      state.reloadTimer -= dt;
      reloadDip = Math.min(1, reloadDip + dt * 5);
      if (state.reloadTimer <= 0) {
        const def = currentDef();
        const ammo = state.owned[state.current];
        const need = def.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
        state.reloading = false;
      }
    } else {
      reloadDip = Math.max(0, reloadDip - dt * 5);
    }
    // Viewmodel bob and kick, all from the same clock.
    if (moving > 0.5) bobPhase.value += dt * moving * 1.9;
    const bobY = Math.sin(bobPhase.value * 2) * 0.008 * Math.min(1, moving / 4);
    const bobX = Math.cos(bobPhase.value) * 0.006 * Math.min(1, moving / 4);
    gun.position.set(
      0.26 + bobX + (state.scoped ? -0.26 : 0),
      -0.24 + bobY - reloadDip * 0.14 + (state.scoped ? 0.155 : 0),
      -0.5 + kick + (state.scoped ? -0.12 : 0),
    );
    gun.rotation.x = kick * 2.2 + reloadDip * 0.5;
  }

  function muzzleWorld(out) {
    return muzzle.getWorldPosition(out);
  }

  function reset() {
    state.owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
    state.current = 'pistol';
    state.cooldown = 0;
    state.reloading = false;
    state.scoped = false;
    state.grenades = { frag: 0, smoke: 0 };
    state.grenadeSelected = null;
    state.spreadBloom = 0;
    updateViewmodel();
  }

  updateViewmodel();
  return {
    state, gun, muzzle,
    currentDef, give, buy, select, cycle, spread, canFire, fire, reload,
    toggleScope, step, muzzleWorld, reset,
  };
}

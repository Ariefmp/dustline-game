// The player: first-person controller with acceleration, friction, gravity and
// AABB collision against the world's boxes. Movement state is plain numbers;
// the camera is synced from here by main.js.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp } from './util.js';

export function createPlayer(colliders, bounds) {
  const state = {
    position: new THREE.Vector3(20, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: Math.PI / 2, // facing -x (towards mid) from the Sentinel spawn
    pitch: 0,
    eye: PLAYER.eyeHeight,
    crouched: false,
    onGround: true,
    health: PLAYER.health,
    armor: 0,
    hasHelmet: false,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
    stepPhase: 0,
    stepped: false, // set true on a footstep, consumed by main for the sound
  };

  const wish = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function collideAxis(axis) {
    const r = PLAYER.radius;
    const p = state.position;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (p.y + PLAYER.eyeHeight < c.minY || p.y > c.maxY) continue;
      if (p.x + r > c.minX && p.x - r < c.maxX && p.z + r > c.minZ && p.z - r < c.maxZ) {
        if (axis === 'x') {
          p.x = state.velocity.x > 0 ? c.minX - r - 0.001 : c.maxX + r + 0.001;
          state.velocity.x = 0;
        } else {
          p.z = state.velocity.z > 0 ? c.minZ - r - 0.001 : c.maxZ + r + 0.001;
          state.velocity.z = 0;
        }
      }
    }
    p.x = clamp(p.x, bounds.minX + r, bounds.maxX - r);
    p.z = clamp(p.z, bounds.minZ + r, bounds.maxZ - r);
  }

  function look(dx, dy, sensitivity) {
    state.yaw -= dx * 0.0022 * sensitivity;
    state.pitch = clamp(state.pitch - dy * 0.0022 * sensitivity, -1.45, 1.45);
  }

  function recoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
  }

  function step(dt, keys) {
    const p = state.position;
    const v = state.velocity;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    state.crouched = keys.has('ControlLeft') || keys.has('KeyC');
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = state.crouched ? PLAYER.crouchSpeed : slow ? PLAYER.slowSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    // Forward is -z rotated by yaw; strafe is +x rotated by yaw.
    wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    else wish.set(0, 0, 0);

    if (state.onGround) {
      const accel = wish.lengthSq() > 0 ? PLAYER.accel : PLAYER.friction;
      v.x += (wish.x - v.x) * Math.min(1, accel * dt / speed * 4.4);
      v.z += (wish.z - v.z) * Math.min(1, accel * dt / speed * 4.4);
    } else {
      v.x += wish.x * PLAYER.airSpeed * dt * 0.5;
      v.z += wish.z * PLAYER.airSpeed * dt * 0.5;
    }

    if ((keys.has('Space')) && state.onGround) {
      v.y = PLAYER.jumpSpeed;
      state.onGround = false;
    }
    v.y -= PLAYER.gravity * dt;
    p.y += v.y * dt;
    if (p.y <= 0) {
      p.y = 0;
      v.y = 0;
      state.onGround = true;
    }
    p.x += v.x * dt;
    collideAxis('x');
    p.z += v.z * dt;
    collideAxis('z');

    // Eye height eases between stand and crouch; recoil decays back to zero.
    const targetEye = state.crouched ? PLAYER.crouchEye : PLAYER.eyeHeight;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);
    state.recoilPitch *= Math.max(0, 1 - dt * 9);
    state.recoilYaw *= Math.max(0, 1 - dt * 9);

    // Footstep ticks, timed to horizontal speed.
    const hSpeed = Math.hypot(v.x, v.z);
    if (state.onGround && hSpeed > 1.2) {
      state.stepPhase += hSpeed * dt * 1.55;
      if (state.stepPhase > Math.PI) {
        state.stepPhase -= Math.PI;
        state.stepped = true;
      }
    }
    tmp.copy(v);
    return tmp;
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function spawn(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.health = PLAYER.health;
    state.armor = 0;
    state.hasHelmet = false;
    state.alive = true;
    state.eye = PLAYER.eyeHeight;
    state.crouched = false;
    state.onGround = true;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
  }

  function eyePosition(out) {
    out.set(state.position.x, state.position.y + state.eye, state.position.z);
    return out;
  }

  return { state, look, recoil, step, groundSpeed, spawn, eyePosition };
}

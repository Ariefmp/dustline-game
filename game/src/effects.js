// Transient combat effects, all pooled: tracers, muzzle flashes, impact sparks,
// explosions and smoke clouds. Nothing here allocates during a frame; pools are
// created once and reused until the match ends.
import * as THREE from 'three';

const TRACER_COUNT = 16;
const SPARK_COUNT = 24;
const SMOKE_COUNT = 6;

export function createEffects(scene) {
  // Tracers: thin lines from muzzle to hit point, fading in 70 ms.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // Muzzle flash: one reusable sprite + one point light.
  const flashTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,240,180,1)');
    g.addColorStop(0.4, 'rgba(255,180,60,0.85)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(0.55, 0.55, 1);
  scene.add(flashSprite);
  const flashLight = new THREE.PointLight(0xffb35c, 0, 9, 1.6);
  scene.add(flashLight);
  let flashLife = 0;

  // Impact sparks: one Points cloud, positions updated in place.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.07, transparent: true, opacity: 0.95 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;

  // Explosion: expanding shell + light.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff8c3a, transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7a2a, 0, 30, 1.4);
  scene.add(boomLight);
  let boomLife = 0;

  // Smoke clouds: clusters of soft sprites; each cloud also blocks bot sight.
  const smokeTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 26; i += 1) {
      const x = 34 + Math.random() * 60;
      const y = 34 + Math.random() * 60;
      const r = 18 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(210,210,205,0.55)');
      g.addColorStop(1, 'rgba(210,210,205,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(canvas);
  })();
  const smokes = [];
  for (let i = 0; i < SMOKE_COUNT; i += 1) {
    const group = new THREE.Group();
    for (let j = 0; j < 9; j += 1) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.85, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 3.4, 0.7 + Math.random() * 1.8, (Math.random() - 0.5) * 3.4);
      const sc = 2.2 + Math.random() * 1.6;
      s.scale.set(sc, sc, 1);
      group.add(s);
    }
    group.visible = false;
    scene.add(group);
    smokes.push({ group, life: 0, x: 0, z: 0, radius: 2.6 });
  }
  let smokeIdx = 0;

  const tmp = new THREE.Vector3();

  function tracer(from, to, color = 0xffe9a8) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_COUNT;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  function muzzleFlash(position) {
    flashSprite.position.copy(position);
    flashSprite.material.opacity = 1;
    flashSprite.material.rotation = Math.random() * Math.PI;
    flashLight.position.copy(position);
    flashLight.intensity = 26;
    flashLife = 0.05;
  }

  function impact(point, normal) {
    for (let k = 0; k < 5; k += 1) {
      const i = sparkIdx;
      sparkIdx = (sparkIdx + 1) % SPARK_COUNT;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      sparkVel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * 4;
      sparkVel[i * 3 + 1] = normal.y * 2 + Math.random() * 3.5;
      sparkVel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * 4;
      sparkLife[i] = 0.3 + Math.random() * 0.2;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.position.y = Math.max(0.4, point.y);
    boom.scale.set(0.4, 0.4, 0.4);
    boom.material.opacity = 0.9;
    boomLight.position.copy(point);
    boomLight.position.y = 1.2;
    boomLight.intensity = 90;
    boomLife = 0.55;
    // A burst of sparks radiates from the blast.
    for (let k = 0; k < 12; k += 1) {
      const i = sparkIdx;
      sparkIdx = (sparkIdx + 1) % SPARK_COUNT;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y + 0.3;
      sparkPos[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 7;
      sparkVel[i * 3] = Math.cos(a) * sp;
      sparkVel[i * 3 + 1] = 2 + Math.random() * 6;
      sparkVel[i * 3 + 2] = Math.sin(a) * sp;
      sparkLife[i] = 0.5 + Math.random() * 0.4;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function smoke(point) {
    const s = smokes[smokeIdx];
    smokeIdx = (smokeIdx + 1) % SMOKE_COUNT;
    s.group.position.set(point.x, 0, point.z);
    s.group.visible = true;
    s.life = 9;
    s.x = point.x;
    s.z = point.z;
    return s;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashSprite.material.opacity = Math.max(0, flashLife / 0.05);
      flashLight.intensity = Math.max(0, flashLife / 0.05) * 26;
    }
    let anySpark = false;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      if (sparkLife[i] > 0) {
        anySpark = true;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] *= -0.3; }
      }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    if (boomLife > 0) {
      boomLife -= dt;
      const t = Math.max(0, boomLife / 0.55);
      const scale = 0.4 + (1 - t) * 7;
      boom.scale.set(scale, scale * 0.8, scale);
      boom.material.opacity = t * 0.9;
      boomLight.intensity = t * 90;
    }
    for (const s of smokes) {
      if (s.life > 0) {
        s.life -= dt;
        const fade = s.life < 2 ? s.life / 2 : 1;
        for (const sprite of s.group.children) sprite.material.opacity = 0.85 * fade;
        if (s.life <= 0) s.group.visible = false;
      }
    }
  }

  function activeSmokes() {
    const out = [];
    for (const s of smokes) if (s.life > 0) out.push(s);
    return out;
  }

  function shake(out, strength) {
    out.set((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength, 0);
    return out;
  }

  return { tracer, muzzleFlash, impact, explosion, smoke, step, activeSmokes, shake, boomLife: () => boomLife };
}

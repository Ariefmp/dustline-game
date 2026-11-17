// One place for every number the design hangs on: weapons, economy, rounds,
// teams and the palette. The simulation reads from here; the HUD reads from here;
// nothing else hard-codes a price or a damage value.

// Palette: dusk container yard. Warm sun, teal shadow, sand ground, rust containers.
export const PALETTE = {
  sky: 0x2b3444,        // dusk blue-grey sky
  fog: 0x2b3444,
  ground: 0x8a7a5c,     // dry sand
  wall: 0x6b6f75,       // concrete
  wallDark: 0x4a4d52,
  containerRed: 0xa8442e,
  containerBlue: 0x2e5f7a,
  containerYellow: 0xb98a2e,
  containerGreen: 0x4a6b3a,
  crate: 0x7a5c38,
  accent: 0xe8a33d,     // hazard yellow / sun
  sentinel: 0x2ec4b6,   // defending team, teal
  vanguard: 0xe76f51,   // attacking team, rust orange
  ink: 0xe9e6df,
  muted: 0x98a0a8,
  danger: 0xd94f3d,
};

export const TEAMS = {
  sentinel: { key: 'sentinel', name: 'SENTINEL', color: PALETTE.sentinel, spawn: { x: 20, z: 0 } },
  vanguard: { key: 'vanguard', name: 'VANGUARD', color: PALETTE.vanguard, spawn: { x: -20, z: 0 } },
};

// Weapon table. damage = body damage at close range; head multiplies it.
// spread is radians of random cone; recoil is pitch kick per shot.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 1, price: 0,
    damage: 26, headMult: 3.5, rate: 6, auto: false, mag: 12, reserve: 36,
    reload: 1.4, spread: 0.012, spreadMove: 0.02, recoil: 0.011, kick: 0.35,
    falloff: 0.25, pellets: 1, range: 60, tracer: 0xffe9a8, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Kestrel-9 SMG', slot: 2, price: 1500,
    damage: 24, headMult: 3.5, rate: 11, auto: true, mag: 32, reserve: 96,
    reload: 2.1, spread: 0.02, spreadMove: 0.032, recoil: 0.008, kick: 0.22,
    falloff: 0.35, pellets: 1, range: 55, tracer: 0xffe9a8, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Carbine', slot: 2, price: 2700,
    damage: 33, headMult: 4, rate: 10, auto: true, mag: 30, reserve: 90,
    reload: 2.5, spread: 0.011, spreadMove: 0.026, recoil: 0.013, kick: 0.5,
    falloff: 0.2, pellets: 1, range: 70, tracer: 0xffe9a8, sound: 'rifle',
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', slot: 2, price: 1800,
    damage: 11, headMult: 3, rate: 1.15, auto: false, mag: 6, reserve: 24,
    reload: 2.8, spread: 0.045, spreadMove: 0.055, recoil: 0.05, kick: 1.6,
    falloff: 0.6, pellets: 8, range: 30, tracer: 0xffc46b, sound: 'shotgun',
  },
  sniper: {
    id: 'sniper', name: 'Longbow DMR', slot: 2, price: 4000,
    damage: 95, headMult: 4, rate: 0.9, auto: false, mag: 5, reserve: 15,
    reload: 3.2, spread: 0.002, spreadMove: 0.02, recoil: 0.045, kick: 1.8,
    falloff: 0.05, pellets: 1, range: 90, tracer: 0x9fd8ff, sound: 'sniper', scoped: true,
  },
};

export const GEAR = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650, armor: 50 },
  helmet: { id: 'helmet', name: 'Combat Helmet', price: 350 },
  defuseKit: { id: 'defuseKit', name: 'Defuse Kit', price: 400 },
  frag: { id: 'frag', name: 'Spark-9 Frag', price: 300 },
  smoke: { id: 'smoke', name: 'Veil Smoke', price: 250 },
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  winReward: 3250,
  lossReward: 1400,
  lossBonusStep: 500,
  lossBonusMax: 2900,
  // Killstreak cash: a hot round pays. 3 eliminations in one round earns
  // $500, a full team wipe (5) earns $1,000 — on top of the $300 per kill.
  streakBonus: { 3: 500, 5: 1000 },
};

export const ROUND = {
  buyTime: 15,        // seconds of buy phase at round start
  roundTime: 100,     // seconds of live play
  spikeTime: 35,      // seconds from plant to detonation
  plantTime: 3,       // seconds to plant the spike
  defuseTime: 5,      // seconds to defuse (2.5 with kit)
  intermission: 5,    // seconds between rounds
  winRounds: 8,       // first to this many round wins takes the match
  maxRounds: 15,
  teamSize: 5,
};

export const PLAYER = {
  eyeHeight: 1.62,
  crouchEye: 1.15,
  radius: 0.38,
  walkSpeed: 4.4,
  slowSpeed: 2.4,     // Shift: slow walk, steadier aim
  crouchSpeed: 1.9,
  airSpeed: 2.8,
  accel: 42,
  friction: 11,
  jumpSpeed: 5.2,
  gravity: 14.5,
  health: 100,
};

export const BOT = {
  walkSpeed: 3.4,
  runSpeed: 4.3,
  reactionMin: 0.35,  // seconds before first shot after spotting
  reactionMax: 0.75,
  aimError: 0.035,    // radians of aim error, base
  burstMin: 3,
  burstMax: 5,
  burstPauseMin: 0.5,
  burstPauseMax: 1.1,
  hearRange: 26,      // metres: gunfire heard this far rotates defenders
  seeRange: 42,
};

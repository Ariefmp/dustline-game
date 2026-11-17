# DUSTLINE — a tactical three.js FPS

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Ariefmp/dustline-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Ariefmp/dustline-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Entered in [make.fun's "Make the best game" bounty](https://make.fun/bounty/best-game-01) · AI agents build software for cash rewards.

A round-based, Counter-Strike-style tactical FPS that runs entirely from
static files in the browser. One player leads four Sentinel bots against five
Vanguard bots in a dusk container yard. Short rounds are won by eliminating
the enemy team, or by planting and defending the spike — or defusing it.
Money earned each round buys rifles, armour and grenades in the buy phase.

## Run it

Serve the game locally, then open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

Click to play (pointer lock). No build step, no network requests, no account.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look, click to fire |
| Shift | Slow walk — steadier aim |
| Ctrl / C | Crouch |
| R | Reload |
| B | Buy menu (buy phase only) |
| 1 / 2 | Primary / sidearm |
| 4 / 5 | Select frag / smoke grenade, click to throw |
| Tab | Scoreboard (hold) — both teams, kills / deaths |
| P / Esc | Pause — resume, or restart the match |
| E | Defuse the spike (hold, near the spike) |
| Right click | Scope (Longbow DMR) |
| Space | Jump |
| M | Mute |

## The game

- **Map** — "Dustline Yard": two spike sites (A north, B south), three lanes
  (A-long, B-long, mid), container and crate cover, a dusk sun and a distant
  skyline. All art is procedural: canvas textures, box geometry, synthesized
  sound. Nothing is copied from any existing game.
- **Rounds** — 15-second buy phase, 100-second rounds, first to 8 takes the
  match (max 15). The spike detonates 35 seconds after the plant. A match-end
  screen shows a star rating (1–3 stars for a sharp win), the score and your
  stats — eliminations, deaths, headshots, accuracy, damage dealt, best
  streak — with a Play again button. The pause menu offers Resume or a fresh
  match.
- **Economy** — start at $800; $300 per elimination, $3,250 for a round win,
  $1,400+ for a loss with a growing loss bonus. A hot round pays extra:
  $500 for a 3-elimination streak, $1,000 for a full team wipe (5). Five
  weapons (P9 Sidearm, Kestrel-9 SMG, VK-47 Carbine, Breacher-12 shotgun,
  Longbow DMR), Kevlar, helmet, defuse kit, frag and smoke grenades.
- **Gunplay** — hitscan with headshot multipliers, damage falloff, recoil and
  spread that punish firing on the move; stopping, crouching and slow-walking
  pay. Armour absorbs half of incoming damage; helmets blunt headshots.
- **Bots** — nine bots on a waypoint graph. Vanguard pushes a site with the
  spike carrier, plants, then holds; Sentinel holds angles, rotates toward
  gunfire it hears, and defuses when it can. Bots react with a delay, fire in
  bursts, strafe while engaging, and pick the spike up if the carrier falls.
- **HUD** — health and armour bars, ammo and money, round timer and score,
  kill feed, a live minimap (teammates always, enemies only while spotted),
  spike timer and defuse progress, dynamic crosshair, hitmarkers and damage
  direction, a streak badge while you are on a multi-elimination run, and a
  hold-Tab scoreboard for both teams.

## Structure

```
main.ts                  hands the entry in (copies game/ + screenshots/,
                         writes /output/dossier.json)
vendor/makefun-game.ts   vendored make.fun library, unmodified
game/
  index.html             import map + HUD DOM + CSS
  vendor/three/          three.js 0.187.0, byte-for-byte from the kit
  src/
    main.js              boot, fixed 60 Hz simulation, render loop, ?shot= modes
    config.js            weapons, economy, rounds, teams, palette
    world.js             the map, textures, lights, waypoint graph
    player.js            first-person controller (accel, friction, AABB)
    weapons.js           weapon state, spread/recoil/reload, viewmodel
    bots.js              bot AI: routes, holds, engages, plants, defuses
    combat.js            the one raycaster, damage, grenades, spike blast
    rounds.js            round state machine, economy, buy logic, win checks
    effects.js           pooled tracers, muzzle flash, sparks, smoke, blast
    audio.js             synthesized WebAudio sound, no audio files
    hud.js               HUD, minimap, kill feed, buy menu, overlays
    input.js             keyboard, mouse, pointer lock
    util.js              seeded RNG, angle and geometry helpers
```

Deterministic screenshots: `?shot=start|play|buy|end&seed=N` stages a fixed
scene and sets `window.__shotReady` when it is painted (see `shots.json`).

## Handing in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` needs Node 22.18+ (tested on Node 24). The entry is the `game/`
folder plus the screenshots in `screenshots/`; the dossier is generated from
them and must not be edited by hand.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qh9fnnyy&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

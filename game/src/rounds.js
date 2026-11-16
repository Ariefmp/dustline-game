// Rounds and the economy: buy phase, live play, spike timer, win conditions and
// the money that flows between rounds. The match is first to 8, max 15 rounds.
// All money the player sees lives in game.money; bots get loadouts, not wallets.
import { ECONOMY, GEAR, ROUND, WEAPONS } from './config.js';

export function createRounds(game, deps) {
  const { player, weapons, audio, onPhase, onRoundEnd, onMatchEnd, onSpikePlanted, onSpikeDefused, resetActors, spike, spikeLight } = deps;

  let defuseProgress = 0;
  let lastBeep = -1;
  let roundKills = 0; // player eliminations this round, for streak banners
  let streakShown = 0;

  function setPhase(phase) {
    game.phase = phase;
    onPhase(phase);
  }

  function startMatch() {
    game.score.sentinel = 0;
    game.score.vanguard = 0;
    game.money = ECONOMY.startMoney;
    game.lossStreak = 0;
    game.round = 1;
    game.kills = 0;
    game.deaths = 0;
    game.headshots = 0;
    game.shotsFired = 0;
    game.shotsHit = 0;
    startRound();
  }

  function startRound() {
    game.roundTimer = ROUND.buyTime;
    game.spike = { planted: false, site: null, x: 0, z: 0, timer: 0, carrier: null };
    game.spikeHolder = null;
    defuseProgress = 0;
    roundKills = 0;
    streakShown = 0;
    spike.visible = false;
    resetActors();
    setPhase('buy');
  }

  function endRound(winner, reason) {
    if (game.phase === 'roundEnd' || game.phase === 'matchEnd') return;
    const won = winner === 'sentinel';
    game.score[winner] += 1;
    if (won) {
      game.money += ECONOMY.winReward;
      game.lossStreak = 0;
      audio.roundWin();
    } else {
      game.money += ECONOMY.lossReward + Math.min(ECONOMY.lossBonusMax - ECONOMY.lossReward, ECONOMY.lossBonusStep * game.lossStreak);
      game.lossStreak += 1;
      audio.roundLose();
    }
    game.roundTimer = ROUND.intermission;
    setPhase('roundEnd');
    onRoundEnd(winner, reason, game.money);
  }

  function checkMatchEnd() {
    if (game.score.sentinel >= ROUND.winRounds || game.score.vanguard >= ROUND.winRounds || game.round >= ROUND.maxRounds) {
      const winner = game.score.sentinel > game.score.vanguard ? 'sentinel' : game.score.vanguard > game.score.sentinel ? 'vanguard' : 'sentinel';
      setPhase('matchEnd');
      onMatchEnd(winner);
      return true;
    }
    return false;
  }

  function plantSpike(siteKey, bot) {
    const site = deps.world.sites[siteKey];
    game.spike.planted = true;
    game.spike.site = siteKey;
    game.spike.x = site.plant.x;
    game.spike.z = site.plant.z;
    game.spike.timer = ROUND.spikeTime;
    game.spike.carrier = null;
    spike.position.set(site.plant.x, 0, site.plant.z);
    spike.visible = true;
    audio.plantDone();
    onSpikePlanted(siteKey);
  }

  function defuseSpike(bot) {
    game.spike.planted = false;
    spike.visible = false;
    onSpikeDefused();
    endRound('sentinel', 'Spike defused');
  }

  function onKill(killer, victim, headshot) {
    if (killer && killer.kind === 'player') {
      game.money += ECONOMY.killReward;
      game.kills += 1;
      if (headshot) game.headshots += 1;
      // Multi-kill streaks: one banner per threshold, once per round.
      roundKills += 1;
      if (roundKills >= 2 && roundKills > streakShown) {
        streakShown = roundKills;
        if (deps.onStreak) deps.onStreak(roundKills);
      }
    }
    if (victim.kind === 'player') game.deaths += 1;
  }

  function buy(id) {
    if (game.phase !== 'buy') return { ok: false, why: 'Buy time is over' };
    const item = WEAPONS[id] || GEAR[id];
    if (!item) return { ok: false, why: 'Unknown item' };
    if (game.money < item.price) return { ok: false, why: 'Not enough money' };
    if (WEAPONS[id]) {
      if (weapons.state.owned[id]) return { ok: false, why: 'Already owned' };
      weapons.buy(id);
      weapons.select(id);
    } else if (id === 'kevlar') {
      if (player.state.armor >= 50) return { ok: false, why: 'Armour already full' };
      player.state.armor = GEAR.kevlar.armor;
    } else if (id === 'helmet') {
      if (player.state.armor <= 0) return { ok: false, why: 'Buy Kevlar first' };
      if (player.state.hasHelmet) return { ok: false, why: 'Already owned' };
      player.state.hasHelmet = true;
    } else if (id === 'defuseKit') {
      if (game.hasDefuseKit) return { ok: false, why: 'Already owned' };
      game.hasDefuseKit = true;
    } else if (id === 'frag' || id === 'smoke') {
      if (weapons.state.grenades[id] >= 2) return { ok: false, why: 'Max 2 carried' };
      weapons.state.grenades[id] += 1;
    }
    game.money -= item.price;
    audio.buy();
    return { ok: true };
  }

  function playerDefuse(dt, nearSpike) {
    if (!game.spike.planted || !nearSpike || !player.state.alive) {
      defuseProgress = 0;
      return 0;
    }
    const need = game.hasDefuseKit ? ROUND.defuseTime / 2 : ROUND.defuseTime;
    defuseProgress += dt;
    const beepEvery = 0.5;
    if (game.time - lastBeep > beepEvery) {
      lastBeep = game.time;
      audio.defuseBeep();
    }
    if (defuseProgress >= need) {
      defuseProgress = 0;
      defuseSpike(null);
      return 1;
    }
    return defuseProgress / need;
  }

  function step(dt) {
    if (game.phase === 'buy') {
      game.roundTimer -= dt;
      if (game.roundTimer <= 0) {
        game.roundTimer = ROUND.roundTime;
        setPhase('live');
      }
      return;
    }
    if (game.phase === 'live') {
      game.roundTimer -= dt;
      if (game.spike.planted) {
        game.spike.timer -= dt;
        // The spike beeps faster as the timer runs out.
        const interval = game.spike.timer > 20 ? 1 : game.spike.timer > 10 ? 0.6 : 0.35;
        if (game.time - lastBeep > interval) {
          lastBeep = game.time;
          audio.plantBeep();
        }
        spikeLight.material.color.setHex(Math.sin(game.time * 12) > 0 ? 0xff2222 : 0x881111);
        if (game.spike.timer <= 0) {
          deps.explodeSpike(game.spike.x, game.spike.z);
          game.spike.planted = false;
          spike.visible = false;
          endRound('vanguard', 'Spike detonated');
          return;
        }
      }
      if (game.roundTimer <= 0) {
        endRound('sentinel', game.spike.planted ? 'Time expired' : 'Time expired — site held');
        return;
      }
      const vanguardAlive = deps.aliveCount('vanguard');
      const sentinelAlive = deps.aliveCount('sentinel') + (player.state.alive ? 1 : 0);
      if (vanguardAlive === 0) {
        endRound('sentinel', 'Enemy team eliminated');
        return;
      }
      if (sentinelAlive === 0) {
        endRound('vanguard', 'Your team was eliminated');
        return;
      }
      return;
    }
    if (game.phase === 'roundEnd') {
      game.roundTimer -= dt;
      if (game.roundTimer <= 0) {
        if (checkMatchEnd()) return;
        game.round += 1;
        startRound();
      }
    }
  }

  // Bots call these through the shared game object.
  game.plantSpike = plantSpike;
  game.defuseSpike = defuseSpike;

  return { startMatch, startRound, endRound, step, buy, onKill, playerDefuse, defuseProgress: () => defuseProgress };
}

// The HUD: health and ammo readouts, round timer and score, kill feed, a live
// minimap, the buy menu, round banners and the start/pause/match overlays.
// All DOM lives in index.html; this module only writes to it.
import { WEAPONS, GEAR } from './config.js';

export function createHud(world, game) {
  const $ = (id) => document.getElementById(id);
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthNum: $('health-num'),
    healthBar: $('health-bar'),
    armorNum: $('armor-num'),
    armorBar: $('armor-bar'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    scoreS: $('score-s'),
    scoreV: $('score-v'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    minimap: $('minimap'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    spikeStatus: $('spike-status'),
    spikeText: $('spike-text'),
    spikeBar: $('spike-bar'),
    vignette: $('damage-vignette'),
    damageDir: $('damage-dir'),
    buyMenu: $('buy-menu'),
    buyMoney: $('buy-money'),
    buyGrid: $('buy-grid'),
    buyClose: $('buy-close'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    matchStats: $('match-stats'),
    hint: $('hint'),
    crosshairDot: $('crosshair-dot'),
  };
  const mm = el.minimap.getContext('2d');
  const MM_W = 176;
  const MM_H = 148;
  el.minimap.width = MM_W;
  el.minimap.height = MM_H;

  let playCallback = null;
  let buyCallback = null;
  let buyCloseCallback = null;
  let hitTimer = null;
  let bannerTimer = null;
  let vignetteTimer = null;

  el.playBtn.addEventListener('click', () => {
    if (playCallback) playCallback();
  });
  el.buyClose.addEventListener('click', () => {
    if (buyCloseCallback) buyCloseCallback();
  });

  // ---- buy menu ----------------------------------------------------------
  const buyItems = [];
  function buildBuyMenu() {
    const items = [
      ...Object.values(WEAPONS).filter((w) => w.price > 0),
      GEAR.kevlar, GEAR.helmet, GEAR.defuseKit, GEAR.frag, GEAR.smoke,
    ];
    items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'buy-item';
      btn.type = 'button';
      btn.innerHTML = '<span class="buy-key">' + (i + 1) + '</span><span class="buy-name"></span><span class="buy-price"></span>';
      btn.querySelector('.buy-name').textContent = item.name;
      btn.querySelector('.buy-price').textContent = item.price === 0 ? 'FREE' : '$' + item.price.toLocaleString('en-US');
      btn.addEventListener('click', () => {
        if (buyCallback) buyCallback(item.id);
      });
      el.buyGrid.appendChild(btn);
      buyItems.push({ btn, item });
    });
  }
  buildBuyMenu();

  function updateBuyMenu(money, owned, grenades, armor, helmet, hasKit) {
    el.buyMoney.textContent = '$' + money.toLocaleString('en-US');
    for (const { btn, item } of buyItems) {
      let ownedState = false;
      if (WEAPONS[item.id]) ownedState = !!owned[item.id];
      else if (item.id === 'kevlar') ownedState = armor >= 50;
      else if (item.id === 'helmet') ownedState = helmet;
      else if (item.id === 'defuseKit') ownedState = hasKit;
      else if (item.id === 'frag' || item.id === 'smoke') ownedState = grenades[item.id] >= 2;
      btn.classList.toggle('owned', ownedState);
      btn.classList.toggle('cant', money < item.price && !ownedState);
    }
  }

  // ---- readouts ----------------------------------------------------------
  function setHealth(hp, armor) {
    el.healthNum.textContent = Math.max(0, Math.ceil(hp));
    el.healthBar.style.width = Math.max(0, hp) + '%';
    el.healthBar.classList.toggle('low', hp <= 30);
    el.armorNum.textContent = Math.ceil(armor);
    el.armorBar.style.width = Math.min(100, armor * 2) + '%';
  }

  function setAmmo(mag, reserve, name) {
    el.ammoMag.textContent = mag;
    el.ammoReserve.textContent = '/ ' + reserve;
    el.weaponName.textContent = name;
    el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
  }

  function setMoney(m) {
    el.money.textContent = '$' + m.toLocaleString('en-US');
  }

  function setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    el.timer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    el.timer.classList.toggle('buy', phase === 'buy');
    el.timer.classList.toggle('danger', phase === 'live' && seconds < 15);
  }

  function setScore(s, v, round) {
    el.scoreS.textContent = s;
    el.scoreV.textContent = v;
    el.roundNum.textContent = 'ROUND ' + round;
  }

  function setCrosshairGap(px) {
    const g = Math.round(px);
    el.crosshair.style.setProperty('--gap', g + 'px');
  }

  function hitMarker(kill, headshot, holdMs = 120) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', !!kill);
    el.hitmarker.classList.toggle('head', !!headshot);
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill', 'head'), holdMs);
  }

  function damageFlash(angleDeg) {
    el.vignette.classList.add('on');
    el.damageDir.style.transform = 'translate(-50%,-50%) rotate(' + angleDeg + 'deg)';
    el.damageDir.classList.add('on');
    if (vignetteTimer) clearTimeout(vignetteTimer);
    vignetteTimer = setTimeout(() => {
      el.vignette.classList.remove('on');
      el.damageDir.classList.remove('on');
    }, 320);
  }

  function killFeed(killerName, victimName, headshot, killerTeam, victimTeam) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const k = document.createElement('span');
    k.className = 'feed-name ' + (killerTeam || 'none');
    k.textContent = killerName || '—';
    const mid = document.createElement('span');
    mid.className = 'feed-mid';
    mid.textContent = headshot ? ' ⌖ ' : ' ✕ ';
    const v = document.createElement('span');
    v.className = 'feed-name ' + (victimTeam || 'none');
    v.textContent = victimName;
    row.append(k, mid, v);
    el.killfeed.prepend(row);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    setTimeout(() => row.classList.add('fade'), 4200);
    setTimeout(() => row.remove(), 5000);
  }

  function banner(title, sub, team, ms = 3600) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.className = 'show ' + (team || '');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.banner.className = ''; }, ms);
  }

  function spikeStatus(text, progress) {
    if (!text) {
      el.spikeStatus.classList.add('hidden');
      return;
    }
    el.spikeStatus.classList.remove('hidden');
    el.spikeText.textContent = text;
    el.spikeBar.style.width = Math.round(progress * 100) + '%';
  }

  function hint(text) {
    el.hint.textContent = text || '';
    el.hint.classList.toggle('hidden', !text);
  }

  // ---- overlays ----------------------------------------------------------
  function showOverlay(kind, data = {}) {
    el.overlay.classList.remove('hidden');
    el.matchStats.classList.add('hidden');
    if (kind === 'start') {
      el.overlayTitle.textContent = 'DUSTLINE';
      el.overlayCopy.textContent = 'A tactical 5v5 in a dusk container yard. Defend the sites, stop the spike — or watch your team fall. First to 8 rounds takes the match.';
      el.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      el.overlayTitle.textContent = 'Paused';
      el.overlayCopy.textContent = 'The round is waiting. Click to get back in.';
      el.playBtn.textContent = 'Resume';
    } else if (kind === 'matchEnd') {
      el.overlayTitle.textContent = data.winner === 'sentinel' ? 'SENTINEL WINS' : 'VANGUARD WINS';
      el.overlayCopy.textContent = data.winner === 'sentinel'
        ? 'The yard holds. Both sites stood, and the spike never went off.'
        : 'The spike did its work. The yard belongs to Vanguard now.';
      el.playBtn.textContent = 'Play again';
      el.matchStats.classList.remove('hidden');
      el.matchStats.innerHTML = '';
      const stats = [
        ['Rounds', game.score.sentinel + ' — ' + game.score.vanguard],
        ['Eliminations', String(game.kills)],
        ['Headshots', String(game.headshots)],
        ['Accuracy', game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) + '%' : '—'],
      ];
      for (const [label, value] of stats) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = '<span></span><b></b>';
        row.querySelector('span').textContent = label;
        row.querySelector('b').textContent = value;
        el.matchStats.appendChild(row);
      }
    }
  }

  function hideOverlay() {
    el.overlay.classList.add('hidden');
  }

  // ---- minimap -----------------------------------------------------------
  function drawMinimap(playerPos, playerYaw, teammates, enemies, spike) {
    const ctx = mm;
    ctx.clearRect(0, 0, MM_W, MM_H);
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(0, 0, MM_W, MM_H);
    const sx = MM_W / 48;
    const sz = MM_H / 40;
    const toX = (x) => (x + 24) * sx;
    const toZ = (z) => (z + 20) * sz;
    // Walls.
    ctx.fillStyle = 'rgba(233,230,223,0.5)';
    for (const c of world.colliders) {
      if (c.maxY < 2.5) continue; // skip low crates on the map
      ctx.fillRect(toX(c.minX), toZ(c.minZ), (c.maxX - c.minX) * sx, (c.maxZ - c.minZ) * sz);
    }
    // Sites.
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8a33d';
    ctx.fillText('A', toX(-12), toZ(-12));
    ctx.fillText('B', toX(-12), toZ(12));
    // Spike.
    if (spike && spike.planted) {
      const blink = Math.sin(game.time * 8) > 0;
      ctx.fillStyle = blink ? '#ff3b2d' : '#e8a33d';
      ctx.beginPath();
      ctx.arc(toX(spike.x), toZ(spike.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Teammates.
    ctx.fillStyle = '#2ec4b6';
    for (const t of teammates) {
      ctx.beginPath();
      ctx.arc(toX(t.x), toZ(t.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Spotted enemies.
    ctx.fillStyle = '#e76f51';
    for (const e of enemies) {
      ctx.beginPath();
      ctx.arc(toX(e.x), toZ(e.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = toX(playerPos.x);
    const pz = toZ(playerPos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-playerYaw + Math.PI);
    ctx.fillStyle = '#e9e6df';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    setHealth, setAmmo, setMoney, setTimer, setScore, setCrosshairGap,
    hitMarker, damageFlash, killFeed, banner, spikeStatus, hint,
    showOverlay, hideOverlay, updateBuyMenu,
    drawMinimap,
    onPlay(cb) { playCallback = cb; },
    onBuy(cb) { buyCallback = cb; },
    onBuyClose(cb) { buyCloseCallback = cb; },
    showBuyMenu(show) { el.buyMenu.classList.toggle('hidden', !show); },
    isBuyOpen() { return !el.buyMenu.classList.contains('hidden'); },
  };
}

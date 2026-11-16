// Every sound is synthesized with WebAudio: no audio files, no network.
// One AudioContext, one master gain, a shared noise buffer; each effect builds a
// short graph and lets it die. Volume falls with distance for world sounds.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let volume = 0.55;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(dur, filterFreq, type, gainVal, when = 0) {
    if (!ctx || !enabled) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0, Math.random() * 0.5, dur + 0.05);
    src.stop(t0 + dur + 0.05);
  }

  function tone(freq, dur, type, gainVal, when = 0, slideTo = 0) {
    if (!ctx || !enabled) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Distance attenuation for world sounds: 1 at the source, ~0.12 at 45 m.
  function attenuate(distance) {
    if (distance == null) return 1;
    return Math.max(0.08, 1 - distance / 52);
  }

  const api = {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    toggleMute() {
      enabled = !enabled;
      return enabled;
    },
    get enabled() { return enabled; },

    shoot(kind, distance = 0) {
      if (!ctx || !enabled) return;
      const a = attenuate(distance);
      if (kind === 'pistol') { noise(0.09, 2400, 'lowpass', 0.5 * a); tone(190, 0.08, 'square', 0.16 * a, 0, 70); }
      else if (kind === 'smg') { noise(0.07, 3000, 'lowpass', 0.38 * a); tone(240, 0.06, 'square', 0.12 * a, 0, 90); }
      else if (kind === 'rifle') { noise(0.11, 1800, 'lowpass', 0.55 * a); tone(150, 0.1, 'square', 0.2 * a, 0, 55); }
      else if (kind === 'shotgun') { noise(0.16, 1200, 'lowpass', 0.7 * a); tone(110, 0.14, 'square', 0.25 * a, 0, 40); }
      else if (kind === 'sniper') { noise(0.2, 900, 'lowpass', 0.8 * a); tone(95, 0.18, 'square', 0.28 * a, 0, 35); }
      else { noise(0.1, 2000, 'lowpass', 0.5 * a); }
    },
    dryFire() { tone(1200, 0.03, 'square', 0.08); },
    reload() { tone(900, 0.04, 'square', 0.1); tone(620, 0.04, 'square', 0.1, 0.18); tone(1100, 0.04, 'square', 0.12, 0.38); },
    hit() { tone(2200, 0.05, 'sine', 0.22); },
    kill() { tone(660, 0.08, 'sine', 0.22); tone(990, 0.12, 'sine', 0.22, 0.08); },
    headshot() { tone(880, 0.07, 'sine', 0.24); tone(1320, 0.1, 'sine', 0.24, 0.06); },
    hurt() { tone(140, 0.12, 'sawtooth', 0.18, 0, 70); noise(0.1, 500, 'lowpass', 0.2); },
    step(distance = 0) { noise(0.05, 700, 'lowpass', 0.12 * attenuate(distance)); },
    plantBeep() { tone(1000, 0.09, 'sine', 0.2); },
    defuseBeep() { tone(1400, 0.06, 'sine', 0.16); },
    plantDone() { tone(520, 0.1, 'sine', 0.2); tone(780, 0.16, 'sine', 0.2, 0.1); },
    explosion(distance = 0) {
      const a = attenuate(distance);
      noise(1.1, 320, 'lowpass', 0.9 * a);
      tone(120, 0.9, 'sine', 0.5 * a, 0, 28);
      noise(0.4, 2400, 'highpass', 0.25 * a, 0.02);
    },
    grenadeThrow() { noise(0.08, 900, 'bandpass', 0.15); },
    grenadeBounce() { tone(320, 0.05, 'sine', 0.12); },
    buy() { tone(980, 0.07, 'sine', 0.18); tone(1470, 0.1, 'sine', 0.18, 0.07); },
    denied() { tone(220, 0.12, 'square', 0.14); },
    roundWin() { tone(523, 0.12, 'sine', 0.2); tone(659, 0.12, 'sine', 0.2, 0.11); tone(784, 0.22, 'sine', 0.22, 0.22); },
    roundLose() { tone(392, 0.14, 'sine', 0.2); tone(330, 0.14, 'sine', 0.2, 0.13); tone(262, 0.26, 'sine', 0.22, 0.26); },
    click() { tone(1400, 0.03, 'square', 0.07); },
    scope() { tone(500, 0.05, 'sine', 0.08, 0, 900); },
  };
  return api;
}

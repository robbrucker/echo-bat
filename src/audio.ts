let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientStarted = false;

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

export function resumeAudio(): void {
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
  startAmbient();
}

function startAmbient(): void {
  const c = ensureCtx();
  if (!c || !master || ambientStarted) return;
  ambientStarted = true;

  const gain = c.createGain();
  gain.gain.value = 0;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  filter.Q.value = 2.5;

  const osc1 = c.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.value = 55;
  const osc2 = c.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.value = 57.5;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc1.start();
  osc2.start();

  // slow breathing via LFO on gain
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.022;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  lfo.start();

  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.055, c.currentTime + 2.5);
}

export function playChime(comboLevel = 1): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  // pitch rises with combo — each level up a minor third (~1.19x)
  const pitch = Math.pow(1.19, Math.max(0, comboLevel - 1));
  const freqs: [number, number][] = [
    [880 * pitch, 0],
    [1320 * pitch, 0.06],
  ];
  for (const [freq, delay] of freqs) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.14, t + delay + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.45);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t + delay);
    osc.stop(t + delay + 0.5);
  }
}

export function playNearMiss(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  const len = 0.16;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * len)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.4);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2200, t);
  filter.frequency.exponentialRampToValueAtTime(4600, t + 0.14);
  filter.Q.value = 5;
  const gain = c.createGain();
  gain.gain.value = 0.09;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

export function playDash(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;

  // whoosh (filtered noise sweep)
  const len = 0.14;
  const buf = c.createBuffer(
    1,
    Math.max(1, Math.floor(c.sampleRate * len)),
    c.sampleRate,
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.5);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(600, t + 0.11);
  filter.Q.value = 2.5;
  const ng = c.createGain();
  ng.gain.value = 0.13;
  src.connect(filter);
  filter.connect(ng);
  ng.connect(m);
  src.start(t);

  // thump for punch
  const osc = c.createOscillator();
  const og = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.09);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(og);
  og.connect(m);
  osc.start(t);
  osc.stop(t + 0.14);
}

export function playPowerup(kind: "slow" | "magnet"): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;
  const notes =
    kind === "slow"
      ? [784, 659, 523, 392] // descending for slow
      : [523, 659, 784, 1047]; // ascending for magnet
  notes.forEach((freq, i) => {
    const delay = i * 0.05;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.55);
    osc.connect(gain);
    gain.connect(m);
    osc.start(t + delay);
    osc.stop(t + delay + 0.6);
  });
}

export function playStingerKill(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  // gritty low pitch bend
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(85, t + 0.18);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + 0.25);

  // noise burst
  const len = 0.12;
  const buf = c.createBuffer(
    1,
    Math.max(1, Math.floor(c.sampleRate * len)),
    c.sampleRate,
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const ng = c.createGain();
  ng.gain.value = 0.1;
  src.connect(ng);
  ng.connect(master);
  src.start(t);
}

export function playGoldenChime(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  const notes: [number, number][] = [
    [1047, 0],    // C6
    [1319, 0.06], // E6
    [1568, 0.12], // G6
    [2093, 0.2],  // C7
  ];
  for (const [freq, delay] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.5);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t + delay);
    osc.stop(t + delay + 0.55);
  }
}

export function playMilestone(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  const notes: [number, number][] = [
    [523, 0],    // C5
    [659, 0.09], // E5
    [784, 0.18], // G5
  ];
  for (const [freq, delay] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.13, t + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t + delay);
    osc.stop(t + delay + 0.65);
  }
}

export function playPing(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.35);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + 0.45);
}

export function playCrash(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;

  // low thump
  const thump = c.createOscillator();
  const thumpGain = c.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.45, t + 0.008);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(t);
  thump.stop(t + 0.45);

  // shattered sparkle on top
  const len = 0.35;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const envelope = Math.pow(1 - i / data.length, 2.5);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.14;
  noise.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t);
}

export function playBossIntro(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.linearRampToValueAtTime(76, t + 1.0);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220, t);
  filter.frequency.linearRampToValueAtTime(480, t + 0.9);
  filter.Q.value = 6;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.22, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(m);
  osc.start(t);
  osc.stop(t + 1.1);
}

export function playBossPing(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;

  const osc = c.createOscillator();
  const og = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(60, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(og);
  og.connect(m);
  osc.start(t);
  osc.stop(t + 0.55);

  const len = 0.18;
  const buf = c.createBuffer(
    1,
    Math.max(1, Math.floor(c.sampleRate * len)),
    c.sampleRate,
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.4);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 200;
  filter.Q.value = 4;
  const ng = c.createGain();
  ng.gain.value = 0.18;
  src.connect(filter);
  filter.connect(ng);
  ng.connect(m);
  src.start(t);
}

export function playBossHit(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  osc.connect(gain);
  gain.connect(m);
  osc.start(t);
  osc.stop(t + 0.2);
}

export function playBossKill(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;
  const notes = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
  notes.forEach((freq, i) => {
    const delay = i * 0.08;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.2, t + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.42);
    osc.connect(gain);
    gain.connect(m);
    osc.start(t + delay);
    osc.stop(t + delay + 0.45);
  });
}

export function playCrystalShatter(): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime;

  const notes: number[] = [2093, 3136];
  for (const freq of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  const len = 0.07;
  const buf = c.createBuffer(
    1,
    Math.max(1, Math.floor(c.sampleRate * len)),
    c.sampleRate,
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.6);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 5000;
  filter.Q.value = 6;
  const ng = c.createGain();
  ng.gain.value = 0.09;
  src.connect(filter);
  filter.connect(ng);
  ng.connect(master);
  src.start(t);
}

export function playBiomeBoom(): void {
  const c = ensureCtx();
  const m = master;
  if (!c || !m) return;
  const t = c.currentTime;

  // sub thump
  const sub = c.createOscillator();
  const subGain = c.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(95, t);
  sub.frequency.exponentialRampToValueAtTime(38, t + 0.55);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  sub.connect(subGain);
  subGain.connect(m);
  sub.start(t);
  sub.stop(t + 0.75);

  // ascending shimmer chord
  const notes: [number, number][] = [
    [392, 0.04], // G4
    [523, 0.10], // C5
    [784, 0.18], // G5
    [1047, 0.26], // C6
  ];
  for (const [freq, delay] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.11, t + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.9);
    osc.connect(gain);
    gain.connect(m);
    osc.start(t + delay);
    osc.stop(t + delay + 0.95);
  }

  // filtered noise sweep for "whoosh"
  const len = 0.55;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.6);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.setValueAtTime(400, t);
  nf.frequency.exponentialRampToValueAtTime(3500, t + 0.5);
  nf.Q.value = 1.5;
  const ng = c.createGain();
  ng.gain.value = 0.18;
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(m);
  noise.start(t);
}

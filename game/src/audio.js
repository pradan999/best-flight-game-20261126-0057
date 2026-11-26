// audio.js — every sound is synthesised with WebAudio: no audio files,
// no network, just oscillators and filtered noise for the engine, the wind,
// the ring chime and the thud of a touchdown.

export function makeAudio() {
  const state = {
    context: null,
    enabled: true,
    engineOsc: null,
    engineGain: null,
    windSource: null,
    windGain: null,
    windFilter: null,
    started: false,
  };

  function ensureContext() {
    if (state.context) return state.context;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.context = new AudioContextClass();
    return state.context;
  }

  // Must be called from a user gesture at least once.
  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (state.started) return;
    state.started = true;
    // Engine: two detuned sawtooths through a low-pass filter.
    state.engineOsc = ctx.createOscillator();
    state.engineOsc.type = 'sawtooth';
    state.engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.5;
    state.engineGain = ctx.createGain();
    state.engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    const engineGain2 = ctx.createGain();
    engineGain2.gain.value = 0.4;
    state.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineGain2);
    engineGain2.connect(engineFilter);
    engineFilter.connect(state.engineGain);
    state.engineGain.connect(ctx.destination);
    state.engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass filter.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    state.windSource = ctx.createBufferSource();
    state.windSource.buffer = buffer;
    state.windSource.loop = true;
    state.windFilter = ctx.createBiquadFilter();
    state.windFilter.type = 'bandpass';
    state.windFilter.frequency.value = 500;
    state.windFilter.Q.value = 0.6;
    state.windGain = ctx.createGain();
    state.windGain.gain.value = 0;
    state.windSource.connect(state.windFilter);
    state.windFilter.connect(state.windGain);
    state.windGain.connect(ctx.destination);
    state.windSource.start();
  }

  function tone(frequency, duration, type, volume, when = 0) {
    const ctx = ensureContext();
    if (!ctx || !state.enabled) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  return {
    unlock,
    toggleMute() {
      state.enabled = !state.enabled;
      if (state.engineGain) state.engineGain.gain.value = 0;
      if (state.windGain) state.windGain.gain.value = 0;
      return state.enabled;
    },
    get muted() {
      return !state.enabled;
    },
    // Called every frame: engine pitch follows throttle, wind follows speed.
    updateEngine(plane, flying) {
      if (!state.context || !state.started || !state.enabled) return;
      const rpm = 42 + plane.throttle * 58 + plane.speed * 0.22;
      state.engineOsc.frequency.setTargetAtTime(rpm, state.context.currentTime, 0.08);
      const target = flying && plane.speed > 2 ? 0.028 + plane.throttle * 0.05 : 0;
      state.engineGain.gain.setTargetAtTime(target, state.context.currentTime, 0.15);
      const windTarget = flying ? Math.min(0.09, plane.speed * 0.0011) : 0;
      state.windGain.gain.setTargetAtTime(windTarget, state.context.currentTime, 0.2);
      state.windFilter.frequency.setTargetAtTime(320 + plane.speed * 9, state.context.currentTime, 0.2);
    },
    ringChime() {
      tone(880, 0.5, 'sine', 0.16);
      tone(1318, 0.6, 'sine', 0.12, 0.07);
      tone(1760, 0.7, 'sine', 0.08, 0.14);
    },
    touchdown() {
      const ctx = ensureContext();
      if (!ctx || !state.enabled) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    },
    crash() {
      tone(160, 0.5, 'sawtooth', 0.2);
      tone(70, 0.8, 'sawtooth', 0.22, 0.05);
    },
    click() {
      tone(660, 0.08, 'square', 0.05);
    },
    fanfare() {
      tone(523, 0.35, 'triangle', 0.14);
      tone(659, 0.35, 'triangle', 0.14, 0.12);
      tone(784, 0.5, 'triangle', 0.16, 0.24);
      tone(1046, 0.8, 'triangle', 0.14, 0.36);
    },
  };
}

// Song model (modelled on Bosca Ceoil's: instruments, patterns, an arrangement
// of bars x channels), undo history, playback scheduler and file I/O.
(() => {

const MAX_CHANNELS = 12;
const LOOKS = 8; // pink, cyan, yellow, black, and their stripey cousins

const SCALES = [
  ['chromatic', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  ['major', [0, 2, 4, 5, 7, 9, 11]],
  ['minor', [0, 2, 3, 5, 7, 8, 10]],
  ['blues', [0, 3, 5, 6, 7, 10]],
  ['harmonic minor', [0, 2, 3, 5, 7, 8, 11]],
  ['pentatonic', [0, 2, 4, 7, 9]],
  ['minor pentatonic', [0, 3, 5, 7, 10]],
  ['dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['phrygian', [0, 1, 3, 5, 7, 8, 10]],
  ['whole tone', [0, 2, 4, 6, 8, 10]],
];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);

function newSong() {
  const s = {
    format: 'wiggly-1', title: 'untitled', bpm: 120, patternSize: 16, channels: 8,
    instruments: [
      { name: 'piano 1', preset: 'piano1', vol: 0.7, look: 0 },
      { name: 'nes triangle', preset: 'chip_triangle', vol: 0.7, look: 1 },
      { name: 'standard kit', preset: 'kit_standard', vol: 0.8, look: 3 },
    ],
    patterns: [{ inst: 0, notes: [] }],
    arrangement: { bars: [], loop: null },
  };
  return normalizeSong(s);
}

function normalizeSong(s) {
  s.bpm = Math.max(20, Math.min(400, +s.bpm || 120));
  s.patternSize = Math.max(4, Math.min(32, s.patternSize | 0 || 16));
  s.channels = Math.max(1, Math.min(MAX_CHANNELS, s.channels | 0 || 8));
  s.title = s.title || 'untitled';
  s.instruments = (s.instruments || []).map((it, i) => Object.assign({ name: 'instrument', preset: 'piano1', vol: 0.7, pan: 0, detune: 0, delay: 0, reverb: 0, glide: 0, vibrato: 0, octave: 0, look: i % LOOKS, mute: false, solo: false }, it));
  if (!s.instruments.length) s.instruments.push({ name: 'piano 1', preset: 'piano1', vol: 0.7, pan: 0, detune: 0, delay: 0, reverb: 0, glide: 0, vibrato: 0, octave: 0, look: 0 });
  s.patterns = (s.patterns || []).map((p) => ({ inst: Math.min(s.instruments.length - 1, Math.max(0, p.inst | 0)), key: p.key | 0, scale: p.scale | 0, notes: (p.notes || []).map((n) => [n[0] | 0, n[1] | 0, Math.max(1, n[2] | 0), n[3] == null ? 0.8 : +n[3]]) }));
  if (!s.patterns.length) s.patterns.push({ inst: 0, key: 0, scale: 0, notes: [] });
  const a = (s.arrangement = s.arrangement || {});
  a.bars = (a.bars || []).map((row) => { const r = []; for (let c = 0; c < MAX_CHANNELS; c++) { const v = row[c]; r.push(v == null || v < 0 || v >= s.patterns.length ? -1 : v | 0); } return r; });
  while (a.bars.length < 64) a.bars.push(new Array(MAX_CHANNELS).fill(-1));
  // loop: null plays the whole song; [from, to) bars loops just that section.
  if (!Array.isArray(a.loop) || !(a.loop[1] > a.loop[0])) a.loop = null;
  else if (a.loop[0] <= 0 && a.loop[1] >= songLength(s)) a.loop = null;
  return s;
}

function songLength(s) {
  let last = 0;
  s.arrangement.bars.forEach((row, i) => { if (row.some((v) => v >= 0)) last = i + 1; });
  return last;
}

// ---------- undo ----------
const History = {
  stack: [], redo: [], max: 300,
  push(song) { this.stack.push(JSON.stringify(song)); if (this.stack.length > this.max) this.stack.shift(); this.redo.length = 0; },
  undo(song) { if (!this.stack.length) return null; this.redo.push(JSON.stringify(song)); return JSON.parse(this.stack.pop()); },
  redoOne(song) { if (!this.redo.length) return null; this.stack.push(JSON.stringify(song)); return JSON.parse(this.redo.pop()); },
  clear() { this.stack.length = 0; this.redo.length = 0; },
};

// ---------- event collection ----------
function anySolo(song) { return song.instruments.some((i) => i.solo); }
function audible(song, i) { const it = song.instruments[i]; if (!it) return false; return anySolo(song) ? it.solo : !it.mute; }

// Notes that start inside [fromStep, toStep), in absolute steps.
function collectSong(song, fromStep, toStep, out) {
  const ps = song.patternSize;
  const b0 = Math.floor(fromStep / ps), b1 = Math.ceil(toStep / ps);
  for (let b = b0; b < b1; b++) {
    const row = song.arrangement.bars[b];
    if (!row) continue;
    for (let c = 0; c < song.channels; c++) {
      const pi = row[c];
      if (pi < 0) continue;
      const pat = song.patterns[pi];
      if (!pat) continue;
      for (const n of pat.notes) {
        const at = b * ps + n[0];
        if (n[0] < ps && at >= fromStep && at < toStep) out.push({ at, inst: pat.inst, note: n[1], len: n[2], vel: n[3], pat: pi, chan: c, bar: b });
      }
    }
  }
  return out;
}
function collectPattern(song, pi, fromStep, toStep, out) {
  const pat = song.patterns[pi], ps = song.patternSize;
  if (!pat) return out;
  for (let k = Math.floor(fromStep / ps) * ps; k < toStep; k += ps) {
    for (const n of pat.notes) {
      const at = k + n[0];
      if (n[0] < ps && at >= fromStep && at < toStep) out.push({ at, inst: pat.inst, note: n[1], len: n[2], vel: n[3], pat: pi, chan: -1, bar: -1 });
    }
  }
  return out;
}

// ---------- realtime player ----------
const Player = {
  playing: false, mode: 'song', pattern: 0, startTime: 0, startStep: 0, scheduledTo: 0, timer: null,
  loopFrom: 0, loopTo: 16, states: [], recent: [],
  stepDur(song) { return 60 / song.bpm / 4; },
  start(song, mode, fromBar, pattern) {
    const E = Synth.Engine, ctx = E.ensure();
    this.stop();
    this.mode = mode; this.pattern = pattern; this.states = [];
    const ps = song.patternSize;
    if (mode === 'song') {
      const len = Math.max(1, songLength(song));
      let [a, b] = song.arrangement.loop || [0, len];
      if (b <= a || a >= len) { a = 0; b = len; }
      this.loopFrom = a * ps; this.loopTo = b * ps;
      this.startStep = fromBar != null && fromBar >= a && fromBar < b ? fromBar * ps : this.loopFrom;
    } else { this.loopFrom = 0; this.loopTo = ps; this.startStep = 0; }
    E.mixer.setTempo(song.bpm);
    song.instruments.forEach((it, i) => E.mixer.applyInstrument(i, it, !audible(song, i)));
    this.startTime = ctx.currentTime + 0.06;
    this.scheduledTo = this.startStep;
    this.playing = true;
    this.song = song;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  },
  // Position in steps (float) for the playhead, already wrapped into the loop.
  position() {
    if (!this.playing) return -1;
    const ctx = Synth.Engine.ctx;
    const s = this.startStep + (ctx.currentTime - this.startTime) / this.stepDur(this.song);
    return this.wrap(Math.max(this.startStep, s));
  },
  wrap(s) { const L = this.loopTo - this.loopFrom; return s < this.loopTo ? s : this.loopFrom + ((s - this.loopFrom) % L); },
  tick() {
    const song = this.song, E = Synth.Engine, ctx = E.ctx;
    const sd = this.stepDur(song);
    const horizon = this.startStep + (ctx.currentTime + 0.15 - this.startTime) / sd;
    song.instruments.forEach((it, i) => E.mixer.applyInstrument(i, it, !audible(song, i)));
    E.mixer.setTempo(song.bpm);
    while (this.scheduledTo < horizon) {
      const s = this.scheduledTo, loc = this.wrap(s);
      const evs = [];
      if (this.mode === 'song') collectSong(song, loc, loc + 1, evs); else collectPattern(song, this.pattern, loc, loc + 1, evs);
      const t = this.startTime + (s - this.startStep) * sd;
      const swing = song.swing ? ((Math.floor(loc) % 2) ? song.swing * sd * 0.33 : 0) : 0;
      for (const e of evs) {
        const inst = song.instruments[e.inst];
        if (!inst || !audible(song, e.inst)) continue;
        E.note(ctx, E.mixer, this.states, e.inst, inst, e.note, Math.max(ctx.currentTime, t + swing), e.len * sd * 0.98, e.vel);
        this.recent.push({ time: t + swing, e });
      }
      this.scheduledTo += 1;
    }
    const now = ctx.currentTime;
    this.recent = this.recent.filter((r) => r.time > now - 2);
  },
  // Notes sounding right now: used by the UI to make them dance.
  sounding() {
    if (!this.playing) return [];
    const now = Synth.Engine.ctx.currentTime, sd = this.stepDur(this.song);
    return this.recent.filter((r) => r.time <= now && now < r.time + Math.max(0.12, r.e.len * sd));
  },
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; this.recent = []; },
};

// ---------- offline render / WAV ----------
async function renderWav(song, onProgress) {
  const sr = 44100, ps = song.patternSize, sd = 60 / song.bpm / 4;
  const len = Math.max(1, songLength(song)) * ps;
  const seconds = len * sd + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const mixer = new Synth.Mixer(ctx, ctx.destination);
  mixer.setTempo(song.bpm);
  song.instruments.forEach((it, i) => mixer.applyInstrument(i, it, !audible(song, i)));
  const evs = collectSong(song, 0, len, []);
  evs.sort((a, b) => a.at - b.at);
  const states = [];
  for (const e of evs) {
    const inst = song.instruments[e.inst];
    if (!inst || !audible(song, e.inst)) continue;
    const swing = song.swing ? ((e.at % 2) ? song.swing * sd * 0.33 : 0) : 0;
    Synth.Engine.note(ctx, mixer, states, e.inst, inst, e.note, 0.05 + e.at * sd + swing, e.len * sd * 0.98, e.vel);
  }
  onProgress && onProgress(0.5);
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}
function encodeWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

// ---------- MIDI ----------
function exportMidi(song) {
  const ppq = 96, tps = ppq / 4, ps = song.patternSize;
  const vlq = (v) => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const tracks = [];
  const tempo = Math.round(60000000 / song.bpm);
  tracks.push([0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x2f, 0]);
  const evs = collectSong(song, 0, Math.max(1, songLength(song)) * ps, []);
  song.instruments.forEach((inst, i) => {
    const isKit = (Synth.P[inst.preset] || {}).kind === 'kit';
    const ch = isKit ? 9 : (i >= 9 ? i + 1 : i) % 16;
    const list = [];
    for (const e of evs) if (e.inst === i) { list.push([e.at * tps, 0x90 | ch, e.note, Math.max(1, Math.round(e.vel * 127))]); list.push([(e.at + e.len) * tps, 0x80 | ch, e.note, 0]); }
    list.sort((a, b) => a[0] - b[0] || (a[1] & 0xf0) - (b[1] & 0xf0));
    const name = Array.from(new TextEncoder().encode(inst.name));
    const bytes = [0, 0xff, 0x03, ...vlq(name.length), ...name];
    let t = 0;
    for (const [at, st, a, b] of list) { bytes.push(...vlq(at - t), st, a, b); t = at; }
    bytes.push(0, 0xff, 0x2f, 0);
    tracks.push(bytes);
  });
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0, ppq];
  for (const t of tracks) { const l = t.length; out.push(0x4d, 0x54, 0x72, 0x6b, (l >>> 24) & 255, (l >> 16) & 255, (l >> 8) & 255, l & 255, ...t); }
  return new Blob([new Uint8Array(out)], { type: 'audio/midi' });
}

const GM_GUESS = [
  [0, 7, 'piano1'], [8, 15, 'celesta'], [16, 23, 'organ'], [24, 31, 'nylon'], [32, 39, 'fingerbass'],
  [40, 47, 'strings'], [48, 55, 'strings'], [52, 54, 'choir'], [56, 63, 'trumpet'], [64, 71, 'oboe'],
  [72, 79, 'flute'], [80, 80, 'chip_square'], [81, 87, 'syn_saw'], [88, 95, 'synthstr'], [96, 103, 'vibes'],
  [104, 111, 'dulcimer'], [112, 119, 'tubular'], [120, 127, 'syn_noise'],
];
function importMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hl = d.getUint32(p); p += 4; const ntr = d.getUint16(p + 2); const div = d.getUint16(p + 4); p += hl;
  const ppq = div & 0x8000 ? 96 : div;
  let bpm = 120; const chans = {};
  for (let t = 0; t < ntr && p < d.byteLength; t++) {
    const id = str(4), len = d.getUint32(p); p += 4; const end = p + len;
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, run = 0; const on = {}; let tname = '';
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st & 0x80) p++; else st = run;
      if (st === 0xff) { const ty = d.getUint8(p++); const l = vlq(); if (ty === 0x51 && bpm === 120) bpm = 60000000 / ((d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)); if (ty === 0x03) { tname = ''; for (let i = 0; i < l; i++) tname += String.fromCharCode(d.getUint8(p + i)); } p += l; continue; }
      if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
      run = st; const type = st & 0xf0, ch = st & 15;
      const a = d.getUint8(p++), b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
      const key = t * 16 + ch;
      const C = (chans[key] = chans[key] || { ch, prog: 0, notes: [], name: tname });
      if (tname) C.name = tname;
      if (type === 0xc0) C.prog = a;
      if (type === 0x90 && b > 0) on[ch * 128 + a] = [tick, b];
      else if (type === 0x80 || (type === 0x90 && b === 0)) { const o = on[ch * 128 + a]; if (o) { C.notes.push([o[0], a, tick - o[0], o[1] / 127]); delete on[ch * 128 + a]; } }
    }
    p = end;
  }
  const tps = ppq / 4, song = { title: 'imported midi', bpm: Math.round(bpm), patternSize: 16, instruments: [], patterns: [], arrangement: { bars: [] } };
  const used = Object.values(chans).filter((c) => c.notes.length).slice(0, MAX_CHANNELS);
  song.channels = Math.max(8, used.length);
  const bars = [];
  used.forEach((c, slot) => {
    const preset = c.ch === 9 ? 'kit_standard' : (GM_GUESS.find(([a, b]) => c.prog >= a && c.prog <= b) || [0, 0, 'piano1'])[2];
    song.instruments.push({ name: (c.name || (c.ch === 9 ? 'drums' : Synth.P[preset].name)).toLowerCase().slice(0, 18), preset, vol: 0.6, look: slot % LOOKS });
    const byBar = {};
    for (const [tick, note, len, vel] of c.notes) {
      const step = Math.round(tick / tps), b = Math.floor(step / 16);
      (byBar[b] = byBar[b] || []).push([step % 16, note, Math.max(1, Math.round(len / tps)), +vel.toFixed(2)]);
    }
    const seen = {};
    for (const b of Object.keys(byBar)) {
      const sig = JSON.stringify(byBar[b].sort((x, y) => x[0] - y[0] || x[1] - y[1]));
      if (seen[sig] == null) { seen[sig] = song.patterns.length; song.patterns.push({ inst: slot, notes: byBar[b] }); }
      (bars[b] = bars[b] || new Array(MAX_CHANNELS).fill(-1))[slot] = seen[sig];
    }
  });
  for (let i = 0; i < bars.length; i++) bars[i] = bars[i] || new Array(MAX_CHANNELS).fill(-1);
  song.arrangement.bars = bars;
  song.arrangement.loop = [0, Math.max(1, bars.length)];
  return normalizeSong(song);
}

window.SongKit = { MAX_CHANNELS, LOOKS, SCALES, NOTE_NAMES, noteName, newSong, normalizeSong, songLength, History, Player, renderWav, exportMidi, importMidi, collectSong };
})();

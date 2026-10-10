// Scribblebox UI: an immediate-mode, pixel-scaled interface where every
// control is a little hand-drawn object (a boombox, a metronome, a snail...).
// Every frame is redrawn and the ink boils on a 3-frame cycle.

const { Player, History, SCALES, NOTE_NAMES, noteName, songLength, MAX_CHANNELS } = SongKit;
const { P: PRESETS, PRESET_LIST, PRESET_GROUPS, DRUM_NAMES, Engine } = Synth;

const LOOKS = [
  { fill: PINK, cap: PINK }, { fill: CYAN, cap: CYAN }, { fill: YELLOW, cap: YELLOW }, { fill: INK, cap: INK },
  { pat: 'pinkstripes', cap: PINK }, { pat: 'cyanstripes', cap: CYAN }, { pat: 'yellowcheck', cap: YELLOW }, { pat: 'dense', cap: INK },
];
const lookFill = (i) => { const l = LOOKS[((i % LOOKS.length) + LOOKS.length) % LOOKS.length]; return l.fill || G.pats[l.pat]; };
const lookCap = (i) => LOOKS[((i % LOOKS.length) + LOOKS.length) % LOOKS.length].cap;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inR = (p, r) => r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const APP_NAME = 'Scribblebox';

const App = {
  song: null,
  pat: 0, inst: 0, tool: 'stamp', noteSize: 1,
  mode: 'song', // 'song' | 'pattern'
  top: 60, rowH: 9, arrScroll: 0, instScroll: 0,
  sel: new Set(), clip: null,
  hover: null, pointer: { x: -1, y: -1 },
  regions: [], drag: null,
  popups: [], menu: null, toast: null,
  title: true, startBar: 0,
  anim: { ease: {}, press: {}, plane: -10, snail: -10 },
  level: 0,
  t: 0,
};
window.App = App;

// ---------- song helpers ----------
function pattern() { return App.song.patterns[App.pat]; }
function instOf(p) { return App.song.instruments[(p || pattern()).inst]; }
function presetOf(inst) { return PRESETS[inst.preset] || (inst.preset.startsWith('sf2:') ? { kind: 'tone', group: 'Your Soundfonts', name: inst.preset.split(':').slice(1).join(' ') } : PRESETS.piano1); }
function familyOf(inst) { return presetOf(inst).group || 'Keys'; }
function isDrums(inst) { const p = presetOf(inst); return p.kind === 'kit' && !p.role; }
function mutate(fn, keepSel) { History.push(App.song); fn(); if (!keepSel) App.sel.clear(); changed(); }
let saveTimer = 0;
function changed() {
  clearTimeout(saveTimer);
  // an empty song isn't worth keeping, and must not replace the last real one
  saveTimer = setTimeout(() => { if (!App.song.patterns.some((p) => p.notes.length)) return; try { localStorage.setItem('scribblebox.song.v2', JSON.stringify(App.song)); } catch (e) { /* storage off */ } }, 400);
}
function setSong(s, keepHistory) {
  App.song = SongKit.normalizeSong(s);
  if (!keepHistory) History.clear();
  App.pat = clamp(App.pat, 0, App.song.patterns.length - 1);
  App.inst = clamp(App.inst, 0, App.song.instruments.length - 1);
  App.sel.clear();
  if (Player.playing) Player.song = App.song;
  changed();
}
function selectPattern(i, recenter = true) {
  App.pat = clamp(i, 0, App.song.patterns.length - 1);
  App.inst = pattern().inst;
  App.sel.clear();
  if (recenter) centerRoll();
  if (Player.playing && App.mode === 'pattern') Player.pattern = App.pat;
}
function toast(msg) { App.toast = { msg, t: App.t }; }
function undo() { App.anim.snail = App.t; const s = History.undo(App.song); if (s) { setSong(s, true); toast('oops! undone'); } else toast('nothing to undo'); }
function redo() { const s = History.redoOne(App.song); if (s) { setSong(s, true); toast('redone'); } }

function rowsFor(p) {
  const inst = instOf(p);
  if (isDrums(inst)) { const r = []; for (let n = 81; n >= 35; n--) r.push(n); return r; }
  const sc = SCALES[p.scale || 0][1], key = p.key || 0;
  const present = new Set(p.notes.map((n) => n[1]));
  const r = [];
  for (let n = 108; n >= 21; n--) if (sc.includes((((n - key) % 12) + 12) % 12) || present.has(n)) r.push(n);
  return r;
}
function centerRoll() {
  const p = pattern(), rows = rowsFor(p);
  let target = isDrums(instOf(p)) ? 42 : 60;
  if (p.notes.length) target = Math.round(p.notes.reduce((a, n) => a + n[1], 0) / p.notes.length);
  const idx = rows.findIndex((n) => n <= target);
  App.top = Math.max(0, idx - 10);
}
function play(mode) {
  Engine.ensure();
  if (Player.playing) { Player.stop(); return; }
  const m = mode || (songLength(App.song) ? App.mode : 'pattern');
  Player.start(App.song, m, App.startBar, App.pat);
}

// ---------- region / hit system ----------
function region(r, h) { App.regions.push(Object.assign({ x: r.x, y: r.y, w: r.w, h: r.h }, h)); }
function hitAt(p) { for (let i = App.regions.length - 1; i >= 0; i--) if (inR(p, App.regions[i])) return App.regions[i]; return null; }
const tap = (fn) => () => { fn(); return null; };
function ease(key, target, k = 0.25) { const a = App.anim.ease; a[key] = a[key] == null ? target : a[key] + (target - a[key]) * k; return a[key]; }

// ---------- doodle widgets (no boxes) ----------
// A handwritten word you can click: hover gets a highlighter swipe.
function word(x, y, label, onClick, o = {}) {
  const size = o.size || 13, w = G.handW(label, size), h = size + 2;
  const r = { x: x - 2, y: y - 1, w: w + 4, h };
  const hot = inR(App.pointer, r) && !App.drag;
  if (o.active || hot) { G.x.fillStyle = o.hl || YELLOW; G.x.fillRect(x - 2, y + Math.round(size * 0.35), w + 4, Math.round(size * 0.6)); }
  G.hand(label, x, y, size, o.color || INK, hot ? 1 : 0.6);
  if (o.underline) G.wline(x, y + size, x + w, y + size + 1, 0.5, INK, 0.8);
  if (onClick) region(r, { cursor: 'pointer', down: tap(onClick) });
  return w;
}
// Hand-drawn chevron arrow, auto-repeating while held.
function chevron(x, y, dir, onClick, size = 9) {
  const r = { x: x - 3, y: y - 2, w: size + 6, h: size + 4 };
  const hot = inR(App.pointer, r);
  const pts = dir < 0 ? [[x + size * 0.7, y], [x + 1, y + size / 2], [x + size * 0.7, y + size]] : [[x + size * 0.3, y], [x + size - 1, y + size / 2], [x + size * 0.3, y + size]];
  G.wpoly(pts, hot ? 1 : 0.5, INK, 0.6, false);
  region(r, { cursor: 'pointer', down: () => { onClick(); const rep = setInterval(() => { if (!App.drag || App.drag.rep !== rep) { clearInterval(rep); return; } onClick(); }, 110); return { rep, move() {}, up() { clearInterval(rep); } }; } });
}
// "‹ value ›" picker.
function picker(x, y, value, onDelta, minW = 0, size = 13) {
  chevron(x, y + 2, -1, () => onDelta(-1));
  const vw = Math.max(minW, G.handW(value, size));
  G.handC(value, x + 13 + vw / 2, y, size, INK, 0.5);
  chevron(x + 15 + vw, y + 2, 1, () => onDelta(1));
  return vw + 26;
}
// A bead sliding on a hand-drawn string.
function slider(r, label, v, min, max, fmt, onChange, onStart) {
  G.hand(label, r.x, r.y - 2, 12, INK, 0.4);
  const sx = r.x + 54, sw = r.w - 54 - 38;
  const k = (v - min) / (max - min), hx = sx + Math.round(k * sw);
  G.x.fillStyle = YELLOW; G.x.fillRect(sx, r.y + 4, Math.round(k * sw), 3);
  G.wline(sx, r.y + 5, sx + sw, r.y + 5, 0.5, INK, 0.7);
  G.disc(hx, r.y + 5, 4, INK); G.disc(hx, r.y + 5, 2.5, PAPER);
  G.hand(fmt(v), r.x + r.w - 36, r.y - 2, 12, INK, 0.3);
  const set = (p) => onChange(min + clamp((p.x - sx) / sw, 0, 1) * (max - min));
  region({ x: sx - 5, y: r.y - 2, w: sw + 10, h: 14 }, { cursor: 'ew-resize', down: (p) => { onStart && onStart(); set(p); return { move: set, up() {} }; } });
}
function tick(x, y, label, on, onClick) {
  G.wellipse(x + 5, y + 6, 5, 5, 0.5, INK, 0.6, on ? PINK : null);
  if (on) { G.wline(x + 2, y + 6, x + 5, y + 9, 1, INK, 0.4); G.wline(x + 5, y + 9, x + 11, y, 1, INK, 0.4); }
  const w = G.hand(label, x + 14, y - 1, 12, INK, 0.4);
  region({ x, y: y - 1, w: 16 + w, h: 14 }, { cursor: 'pointer', down: tap(onClick) });
}
// Masking tape strip.
function tape(x, y, w, h, angle = 0) {
  G.x.save(); G.x.translate(x + w / 2, y + h / 2); G.x.rotate(angle);
  G.x.fillStyle = PAPER; G.x.fillRect(-w / 2, -h / 2, w, h);
  G.x.fillStyle = G.pats.light; G.x.fillRect(-w / 2, -h / 2, w, 2); G.x.fillRect(-w / 2, h / 2 - 2, w, 2);
  G.x.restore();
  for (let k = 0; k < h; k += 2) { G.rect(x - 1 + (G.hash(k, x, 1) > 0.5 ? 1 : 0), y + k, 1, 2, INK); G.rect(x + w - (G.hash(k, w, 2) > 0.5 ? 1 : 0), y + k, 1, 2, INK); }
}
// A sheet of paper with a hard shadow.
function paper(x, y, w, h) {
  G.rect(x + 2, y + 3, w, h, INK);
  G.rect(x, y, w, h, PAPER);
  G.wrect(x, y, w, h, 0.5, INK, 0.7);
}

// ---------- instrument doodles, one per family ----------
const ICONS = {
  Keys(x, y, s, c) { G.rect(x, y + s * 0.3, s, s * 0.6, PAPER); G.wrect(x, y + s * 0.3, s, s * 0.6, 0.5, INK, 0.5); for (let k = 1; k < 5; k++) G.rect(x + Math.round((s * k) / 5), y + s * 0.3, 1, s * 0.6, INK); for (const k of [1, 2, 4]) G.rect(x + Math.round((s * k) / 5) - 1, y + s * 0.3, 3, s * 0.35, c === PAPER ? INK : c); },
  Bells(x, y, s, c) { const cx = x + s / 2; for (let k = 0; k < s * 0.65; k++) { const t = k / (s * 0.65); const hw = s * (0.15 + t * 0.3); G.rect(cx - hw, y + s * 0.15 + k, hw * 2, 1, c); } G.wpoly([[cx - s * 0.15, y + s * 0.15], [cx + s * 0.15, y + s * 0.15], [cx + s * 0.3, y + s * 0.6], [cx + s * 0.45, y + s * 0.8], [cx - s * 0.45, y + s * 0.8], [cx - s * 0.3, y + s * 0.6]], 0.5, INK, 0.5); G.disc(cx, y + s * 0.88, 1.5, INK); G.disc(cx, y + s * 0.1, 1, INK); },
  'Guitar & Plucks'(x, y, s, c) { G.wellipse(x + s * 0.32, y + s * 0.7, s * 0.25, s * 0.22, 0.5, INK, 0.5, c); G.wellipse(x + s * 0.45, y + s * 0.5, s * 0.17, s * 0.15, 0.5, INK, 0.5, c); G.disc(x + s * 0.35, y + s * 0.65, 1.5, INK); G.wline(x + s * 0.4, y + s * 0.6, x + s * 0.9, y + s * 0.1, 1, INK, 0.4); },
  Bass(x, y, s, c) { G.wellipse(x + s * 0.3, y + s * 0.72, s * 0.22, s * 0.2, 0.5, INK, 0.5, c); G.wellipse(x + s * 0.42, y + s * 0.55, s * 0.15, s * 0.13, 0.5, INK, 0.5, c); G.wline(x + s * 0.38, y + s * 0.65, x + s * 0.95, y, 1, INK, 0.4); G.rect(x + s * 0.85, y, 3, 3, INK); },
  Strings(x, y, s, c) { const cx = x + s * 0.45; G.wellipse(cx, y + s * 0.38, s * 0.17, s * 0.15, 0.5, INK, 0.5, c); G.wellipse(cx, y + s * 0.7, s * 0.22, s * 0.2, 0.5, INK, 0.5, c); G.wline(cx, y, cx, y + s * 0.85, 0.5, INK, 0.3); G.wline(x + s * 0.05, y + s * 0.95, x + s, y + s * 0.15, 0.5, INK, 0.5); },
  Voice(x, y, s, c) { const cx = x + s / 2; G.wellipse(cx, y + s * 0.28, s * 0.2, s * 0.22, 0.5, INK, 0.5, c); for (let k = -2; k <= 2; k += 2) G.rect(cx + k * 1.5 - 1, y + s * 0.2, 1, s * 0.15, INK); G.wline(cx, y + s * 0.5, cx, y + s * 0.95, 1, INK, 0.3); G.wline(cx - s * 0.2, y + s * 0.95, cx + s * 0.2, y + s * 0.95, 0.5, INK, 0.3); },
  Brass(x, y, s, c) { const cy = y + s * 0.55; G.wline(x, cy, x + s * 0.65, cy, 1, INK, 0.3); for (let k = 0; k < s * 0.35; k++) G.rect(x + s * 0.62 + k, cy - k * 0.8, 1, k * 1.6 + 1, c); G.wpoly([[x + s * 0.62, cy - 1], [x + s, cy - s * 0.3], [x + s, cy + s * 0.3], [x + s * 0.62, cy + 1]], 0.5, INK, 0.4); for (const k of [0.25, 0.37, 0.49]) G.rect(x + s * k, cy - s * 0.25, 2, s * 0.25, INK); },
  Woodwind(x, y, s, c) { for (let k = 0; k < s; k++) { const yy = y + s * 0.85 - k * 0.7; G.rect(x + k, yy - 2, 1, 4, k % 5 === 2 ? INK : c); G.rect(x + k, yy - 3, 1, 1, INK); G.rect(x + k, yy + 2, 1, 1, INK); } },
  'Organ & Squeezebox'(x, y, s, c) { [0.55, 0.8, 1, 0.8, 0.55].forEach((h, k) => { const px = x + k * (s / 5), ph = s * h * 0.9; G.rect(px, y + s - ph, s / 5 - 1, ph, k % 2 ? c : PAPER); G.wrect(px, y + s - ph, s / 5 - 1, ph, 0.5, INK, 0.3); }); },
  Chiptune(x, y, s, c) { G.rect(x + s * 0.15, y, s * 0.7, s, PAPER); G.wrect(x + s * 0.15, y, s * 0.7, s, 0.5, INK, 0.4); G.rect(x + s * 0.25, y + s * 0.1, s * 0.5, s * 0.35, c); G.frame1(x + s * 0.25, y + s * 0.1, s * 0.5, s * 0.35); G.rect(x + s * 0.27, y + s * 0.68, 5, 1, INK); G.rect(x + s * 0.27 + 2, y + s * 0.68 - 2, 1, 5, INK); G.disc(x + s * 0.68, y + s * 0.65, 1, INK); G.disc(x + s * 0.6, y + s * 0.75, 1, INK); },
  Synth(x, y, s, c) { G.rect(x, y + s * 0.2, s, s * 0.6, c); G.wrect(x, y + s * 0.2, s, s * 0.6, 0.5, INK, 0.4); let px = x + 2, py = y + s / 2; for (let k = 0; k <= s - 4; k += 2) { const ny = y + s / 2 - Math.sin((k / (s - 4)) * Math.PI * 2 + App.t * 6) * s * 0.18; G.line(px, py, x + 2 + k, ny, 0.5, INK); px = x + 2 + k; py = ny; } },
  'Drums & Hits'(x, y, s, c) { const cx = x + s / 2; G.rect(cx - s * 0.4, y + s * 0.45, s * 0.8, s * 0.4, c); G.wellipse(cx, y + s * 0.45, s * 0.4, s * 0.13, 0.5, INK, 0.4, PAPER); G.wline(cx - s * 0.4, y + s * 0.45, cx - s * 0.4, y + s * 0.85, 0.5, INK, 0.3); G.wline(cx + s * 0.4, y + s * 0.45, cx + s * 0.4, y + s * 0.85, 0.5, INK, 0.3); G.wline(cx - s * 0.4, y + s * 0.85, cx + s * 0.4, y + s * 0.85, 0.5, INK, 0.3); G.wline(cx - s * 0.3, y, cx + s * 0.1, y + s * 0.4, 0.5, INK, 0.4); G.wline(cx + s * 0.35, y + s * 0.02, cx - s * 0.05, y + s * 0.4, 0.5, INK, 0.4); },
  Funny(x, y, s, c) { const cx = x + s / 2, cy = y + s * 0.58; G.wpoly([[cx - s * 0.38, cy - s * 0.1], [cx - s * 0.3, y + s * 0.05], [cx - s * 0.1, cy - s * 0.3]], 0.5, INK, 0.4, false); G.wpoly([[cx + s * 0.38, cy - s * 0.1], [cx + s * 0.3, y + s * 0.05], [cx + s * 0.1, cy - s * 0.3]], 0.5, INK, 0.4, false); G.wellipse(cx, cy, s * 0.4, s * 0.32, 0.5, INK, 0.5, c); G.disc(cx - s * 0.15, cy - 1, 1, INK); G.disc(cx + s * 0.15, cy - 1, 1, INK); G.rect(cx - 1, cy + 2, 3, 1, INK); },
  'Your Soundfonts'(x, y, s, c) { G.wellipse(x + s / 2, y + s / 2, s * 0.45, s * 0.45, 0.5, INK, 0.5, c); G.wellipse(x + s / 2, y + s / 2, 2, 2, 0.5, INK, 0.3, PAPER); },
};
function icon(fam, x, y, s, c) { (ICONS[fam] || ICONS.Keys)(Math.round(x), Math.round(y), s, c); }

// ---------- layout ----------
function layout() {
  const W = G.W, H = G.H, pad = 5;
  const L = { top: { x: 0, y: 0, w: W, h: 20 } };
  const bb = bottomItems(W - pad * 2);
  L.bottom = { x: pad, y: H - bb.h - 4, w: W - pad * 2, h: bb.h, items: bb.items };
  if (!G.portrait) {
    const rw = clamp(Math.round(W * 0.22), 110, 160);
    L.right = { x: W - rw - pad, y: L.top.h + 4, w: rw, h: L.bottom.y - L.top.h - 10 };
    const workW = L.right.x - pad * 2 - 4;
    const arrH = clamp(42 + App.song.channels * 11, 86, Math.round(H * 0.34));
    L.roll = { x: pad + 2, y: L.top.h + 6, w: workW, h: L.bottom.y - L.top.h - 16 - arrH - 6 };
    L.arr = { x: pad + 2, y: L.roll.y + L.roll.h + 8, w: workW, h: arrH };
  } else {
    const rh = 66;
    L.right = { x: pad, y: L.bottom.y - rh - 6, w: W - pad * 2, h: rh, horizontal: true };
    const arrH = clamp(40 + App.song.channels * 9, 80, 146);
    L.arr = { x: pad + 2, y: L.right.y - arrH - 8, w: W - pad * 2 - 4, h: arrH };
    L.roll = { x: pad + 2, y: L.top.h + 6, w: W - pad * 2 - 4, h: L.arr.y - L.top.h - 16 };
  }
  return L;
}
function bottomItems(avail) {
  const defs = [['play', 64], ['modes', 52], ['tweak', 44], ['oops', 52], ['size', 76], ['tempo', 62], ['export', 50], ['trash', 50]];
  const rowH = 46, gap = 6;
  const used = defs.reduce((a, d) => a + d[1] + gap, -gap);
  const spread = used < avail ? Math.floor((avail - used) / (defs.length - 1)) : 0;
  const items = []; let x = 0, y = 0;
  for (const [id, w] of defs) {
    if (x + w > avail && x > 0) { x = 0; y += rowH + 2; }
    items.push({ id, x, y, w, h: rowH }); x += w + gap + Math.min(spread, 30);
  }
  return { items, h: y + rowH };
}

// ---------- top: tape menu + title ----------
const MENUS = {
  file: [['new song', () => askConfirm('start over with an empty song?', 'yes, new song', () => { Player.stop(); setSong(SongKit.newSong()); App.pat = 0; App.inst = 0; centerRoll(); })],
    ['open... (.sbox .mid .flp)', () => openFile()], ['save', () => saveSong()], ['-'],
    ['export WAV', () => exportWav()], ['export MIDI', () => download(SongKit.exportMidi(App.song), App.song.title + '.mid')], ['-'],
    ['demo song: Paper Planes', () => loadExample()], ['load your own .sf2...', () => openSf2()]],
  edit: [['undo  (ctrl+z)', () => undo()], ['redo  (ctrl+y)', () => redo()], ['-'], ['select all  (ctrl+a)', () => selectAll()], ['copy notes  (ctrl+c)', () => copySel()], ['paste notes  (ctrl+v)', () => pasteSel()], ['delete notes  (del)', () => deleteSel()], ['-'], ['longer notes  (num +)', () => resizeNotes(1)], ['shorter notes  (num -)', () => resizeNotes(-1)]],
  song: [['rename song...', () => renameSong()],
    ['new page', () => newPattern(false)], ['copy this page  (ctrl+d)', () => newPattern(true)], ['tidy unused pages', () => pruneP()], ['-'],
    ['add a track', () => mutate(() => { App.song.channels = Math.min(MAX_CHANNELS, App.song.channels + 1); }, true)],
    ['remove last track', () => mutate(() => { App.song.channels = Math.max(1, App.song.channels - 1); }, true)],
    ['insert bar at the flag', () => mutate(() => { App.song.arrangement.bars.splice(App.startBar, 0, new Array(MAX_CHANNELS).fill(-1)); }, true)],
    ['delete bar at the flag', () => mutate(() => { App.song.arrangement.bars.splice(App.startBar, 1); App.song.arrangement.bars.push(new Array(MAX_CHANNELS).fill(-1)); }, true)],
    ['play whole song (no loop)', () => { App.song.arrangement.loop = null; changed(); toast('looping off'); }],
    ['swing on / off', () => mutate(() => { App.song.swing = App.song.swing ? 0 : 1; }, true)]],
  sounds: [['add an instrument...', () => addInstrument()], ['tweak this instrument...', () => openTweak(App.inst)], ['change its sound...', () => openBrowser(App.inst)]],
  help: [['how to use', () => openHelp()], ['about', () => openAbout()], ['title page', () => { App.title = true; }]],
};
function drawTop() {
  const names = Object.keys(MENUS);
  const tw = names.reduce((a, n) => a + G.handW(n, 13) + 14, 6);
  tape(4, 3, tw, 15, -0.01);
  let x = 10;
  for (const name of names) {
    const w = G.handW(name, 13);
    const r = { x: x - 4, y: 2, w: w + 8, h: 17 };
    const open = App.menu && App.menu.name === name;
    const hot = inR(App.pointer, r);
    if (open || hot) { G.x.fillStyle = open ? PINK : YELLOW; G.x.fillRect(x - 2, 9, w + 4, 7); }
    G.hand(name, x, 4, 13, INK, hot ? 1 : 0.5);
    region(r, { cursor: 'pointer', down: tap(() => { App.menu = open ? null : { name, x: r.x, y: r.y + r.h }; }), hover: () => { if (App.menu && App.menu.name !== name) App.menu = { name, x: r.x, y: r.y + r.h }; } });
    x += w + 14;
  }
  // song title on a little sticky note
  const title = G.handFit(App.song.title, Math.max(30, G.W - x - 40), 13);
  const w = G.handW(title, 13) + 14, sx = G.W - w - 8;
  if (sx > x + 4) {
    G.rect(sx + 2, 4, w, 15, INK); G.rect(sx, 2, w, 15, YELLOW); G.wrect(sx, 2, w, 15, 0.5, INK, 0.6);
    G.hand(title, sx + 7, 3, 13, INK, 0.5);
    region({ x: sx, y: 2, w, h: 15 }, { cursor: 'pointer', down: tap(renameSong) });
  }
}

// ---------- the notebook page (piano roll) ----------
const TOOLS = {
  stamp(x, y, on) { // rubber stamp with a note on it
    G.rect(x + 3, y + 7, 10, 4, on ? PINK : PAPER); G.wrect(x + 3, y + 7, 10, 4, 0.5, INK, 0.4);
    G.wline(x + 8, y + 7, x + 8, y + 3, 1, INK, 0.3); G.wellipse(x + 8, y + 2, 3, 2, 0.5, INK, 0.4, INK);
    G.disc(x + 6, y + 13, 1.5, INK); G.rect(x + 7, y + 10, 1, 3, INK);
  },
  scissors(x, y, on) {
    G.wellipse(x + 4, y + 11, 3, 3, 0.5, INK, 0.5, on ? CYAN : null); G.wellipse(x + 11, y + 11, 3, 3, 0.5, INK, 0.5, on ? CYAN : null);
    G.wline(x + 5, y + 9, x + 12, y + 1, 0.5, INK, 0.4); G.wline(x + 10, y + 9, x + 3, y + 1, 0.5, INK, 0.4);
  },
  lasso(x, y, on) {
    G.wellipse(x + 8, y + 5, 6, 4, 0.5, INK, 0.7, on ? YELLOW : null);
    G.wline(x + 5, y + 8, x + 3, y + 14, 0.5, INK, 0.6);
  },
};
const TOOL_TIPS = { stamp: 'stamp: click to add notes', scissors: 'scissors: click notes to snip', lasso: 'lasso: drag around notes' };
function drawRoll(L) {
  const R = L.roll, song = App.song, p = pattern(), inst = instOf(p), drums = isDrums(inst);
  paper(R.x, R.y, R.w, R.h);
  // spiral rings along the top edge
  for (let x = R.x + 12; x < R.x + R.w - 8; x += 16) { G.wellipse(x, R.y, 3, 4, 0.5, INK, 0.4); G.rect(x - 1, R.y + 3, 3, 2, INK); }
  const hy = R.y + 7;
  let hx = R.x + 6;
  hx += G.hand('page', hx, hy, 12, INK, 0.3) + 2;
  hx += picker(hx, hy, String(App.pat + 1), (d) => selectPattern((App.pat + d + song.patterns.length) % song.patterns.length), 12, 12) + 4;
  hx += word(hx, hy, '+new', () => newPattern(false), { size: 12 }) + 7;
  hx += word(hx, hy, 'copy', () => newPattern(true), { size: 12 }) + 9;
  // which instrument plays this page (highlighter swipe in its colour)
  const nm = G.handFit(inst.name, 80, 12);
  const nw = G.handW(nm, 12);
  if (hx + nw + 20 < R.x + R.w - 64) {
    G.rect(hx + 12, hy + 6, nw + 4, 6, hlColor(inst.look));
    icon(familyOf(inst), hx, hy - 1, 12, lookCap(inst.look) === INK ? PAPER : lookCap(inst.look));
    G.hand(nm, hx + 14, hy, 12, lookCap(inst.look) === INK ? INK : INK, 0.4);
    region({ x: hx - 1, y: hy - 1, w: nw + 16, h: 14 }, { cursor: 'pointer', down: tap(() => openBrowser(p.inst)) });
    hx += nw + 22;
  }
  if (!drums && hx + 120 < R.x + R.w - 64) {
    hx += G.hand('key', hx, hy, 12, INK, 0.3) + 1;
    hx += picker(hx, hy, NOTE_NAMES[p.key || 0], (d) => mutate(() => { p.key = ((p.key || 0) + d + 12) % 12; }, true), 12, 12) + 4;
    if (hx + 80 < R.x + R.w - 64) picker(hx, hy, SCALES[p.scale || 0][0], (d) => mutate(() => { p.scale = ((p.scale || 0) + d + SCALES.length) % SCALES.length; }, true), 0, 12);
  }
  // stamp / scissors / lasso
  ['stamp', 'scissors', 'lasso'].forEach((t, k) => {
    const x = R.x + R.w - 62 + k * 19, y = hy - 3;
    const on = App.tool === t;
    if (on) G.wellipse(x + 8, y + 8, 9, 8, 0.5, INK, 0.8);
    TOOLS[t](x, y + (on ? Math.round(Math.sin(App.t * 6)) : 0), on);
    region({ x, y, w: 17, h: 16 }, { cursor: 'pointer', down: tap(() => { App.tool = t; toast(TOOL_TIPS[t]); }) });
  });
  const hh = 22;
  G.wline(R.x + 3, R.y + hh, R.x + R.w - 4, R.y + hh, 0.5, INK, 0.5);

  const gutter = drums ? 52 : 24, sbW = 7;
  const gx = R.x + 3 + gutter, gy = R.y + hh + 2, gw = R.w - 6 - gutter - sbW, gh = R.h - hh - 5;
  const ps = song.patternSize;
  const cw = Math.max(2, Math.floor(gw / ps));
  const gridW = cw * ps;
  const rows = rowsFor(p);
  const rh = App.rowH;
  const vis = Math.floor(gh / rh);
  App.top = clamp(App.top, 0, Math.max(0, rows.length - vis));
  const rowOf = new Map(rows.map((n, i) => [n, i]));
  App.rollGeom = { gx, gy, gw: gridW, gh, cw, rh, rows, top: App.top, vis, ps };
  G.clip(R.x + 2, gy, R.w - 4, gh);
  for (let i = 0; i < vis + 1; i++) {
    const n = rows[App.top + i]; if (n == null) break;
    const y = gy + i * rh;
    const black = [1, 3, 6, 8, 10].includes(n % 12);
    // ruled notebook lines
    for (let x = gx; x < gx + gridW; x += 3) G.rect(x, y + rh - 1, 1, 1, CYAN);
    if (n % 12 === (p.key || 0) && !drums) G.rect(gx, y + rh - 1, gridW, 1, CYAN);
    // a little keyboard down the left edge
    if (!drums) {
      G.rect(R.x + 3, y, gutter - 4, rh, black ? INK : PAPER);
      if (!black) G.rect(R.x + 3, y + rh - 1, gutter - 4, 1, INK);
      if (n % 12 === 0 && rh >= 6) G.text(noteName(n), R.x + 5, y + Math.floor((rh - 10) / 2) + 1, 'body', INK);
    } else if (rh >= 6) G.text(G.fit(DRUM_NAMES[n] || String(n), gutter - 6), R.x + 5, y + Math.floor((rh - 10) / 2) + 1, 'body', INK);
  }
  // pink margin + beat lines
  G.rect(gx - 2, gy, 2, gh, PINK);
  for (let s = 1; s < ps; s++) { const x = gx + s * cw; if (s % 4 === 0) G.wline(x, gy, x, gy + gh, 0.5, INK, 0.4, 12); else for (let y = gy; y < gy + gh; y += 4) G.rect(x, y, 1, 1, INK); }
  // ghost notes from the other tracks playing alongside this page
  const bars = song.arrangement.bars;
  const pb = Player.playing && Player.mode === 'song' ? Math.floor(Player.position() / ps) : -1;
  let bar = pb >= 0 && bars[pb] && bars[pb].slice(0, song.channels).includes(App.pat) ? pb : bars.findIndex((row) => row.slice(0, song.channels).includes(App.pat));
  if (bar >= 0) {
    bars[bar].slice(0, song.channels).forEach((pi) => {
      if (pi < 0 || pi === App.pat) return;
      const q = song.patterns[pi]; if (!q || isDrums(instOf(q)) !== drums) return;
      for (const n of q.notes) {
        const ri = rowOf.get(n[1]); if (ri == null) continue;
        const y = gy + (ri - App.top) * rh; if (y < gy - rh || y > gy + gh) continue;
        const x = gx + n[0] * cw, w = Math.max(2, n[2] * cw - 1);
        for (let k = 0; k < w; k += 3) G.rect(x + k, y + Math.floor(rh / 2), 1, 1, INK);
      }
    });
  }
  // notes: highlighter beans with a note-head dot
  const sounding = new Set(Player.sounding().filter((r) => r.e.pat === App.pat).map((r) => r.e.note * 1000 + (r.e.at % ps)));
  const fill = lookFill(inst.look);
  const t = App.t;
  p.notes.forEach((n) => {
    const ri = rowOf.get(n[1]); if (ri == null) return;
    const y = gy + (ri - App.top) * rh; if (y < gy - rh || y > gy + gh) return;
    const x = gx + n[0] * cw, w = Math.max(4, n[2] * cw - 1);
    const live = sounding.has(n[1] * 1000 + n[0]);
    const lift = live ? -2 : 0;
    G.wcapsule(x, y + lift, w, rh - 1, fill, INK, live ? 1.4 : 0.7);
    G.disc(x + Math.min(3, Math.floor(rh / 3)) + 1, y + lift + Math.floor((rh - 1) / 2), Math.max(1, Math.floor(rh / 4)), lookCap(inst.look) === INK ? PAPER : INK);
    if (App.sel.has(n)) {
      const off = Math.floor(t * 12);
      for (let k = 0; k < w + 2; k++) if ((k + off) % 4 < 2) { G.rect(x - 1 + k, y - 2 + lift, 1, 1, INK); G.rect(x - 1 + k, y + rh - 1 + lift, 1, 1, INK); }
      for (let k = 0; k < rh + 1; k++) if ((k + off) % 4 < 2) { G.rect(x - 2, y - 1 + k + lift, 1, 1, INK); G.rect(x + w, y - 1 + k + lift, 1, 1, INK); }
    }
    if (live) { G.wline(x - 4, y - 4, x - 1, y - 1, 0.5, INK, 0.8); G.wline(x + 2, y - 6, x + 3, y - 2, 0.5, INK, 0.8); G.wline(x + w + 3, y - 4, x + w, y - 1, 0.5, INK, 0.8); }
  });
  if (Player.playing) {
    const pos = Player.position();
    const here = Player.mode === 'pattern' ? Player.pattern === App.pat : bars[Math.floor(pos / ps)] && bars[Math.floor(pos / ps)].slice(0, song.channels).includes(App.pat);
    if (here) { const x = gx + (pos % ps) * cw; G.wline(x, gy, x, gy + gh, 0.6, PINK, 1.2, 8); G.wline(x + 1, gy, x + 1, gy + gh, 0.5, INK, 1.2, 8); }
  }
  if (App.hover && App.hover.kind === 'cell' && !App.popups.length) {
    const { step, row } = App.hover;
    const n = rows[row];
    if (n != null) {
      const y = gy + (row - App.top) * rh, x = gx + step * cw;
      if (!App.hover.note && App.tool === 'stamp') { const w = App.noteSize * cw; for (let k = 0; k < w; k += 2) { G.rect(x + k, y, 1, 1, INK); G.rect(x + k, y + rh - 1, 1, 1, INK); } }
      const tip = (drums ? DRUM_NAMES[n] || n : noteName(n)) + '';
      const tw = G.handW(tip, 12), tx = clamp(x + 6, gx, gx + gridW - tw - 6), ty = y - 14 < gy ? y + rh + 1 : y - 14;
      G.rect(tx - 3, ty, tw + 6, 13, YELLOW); G.wrect(tx - 3, ty, tw + 6, 13, 0.5, INK, 0.5);
      G.hand(tip, tx, ty, 12, INK, 0.3);
    }
  }
  if (App.drag && App.drag.box) { const b = App.drag.box; G.wellipse((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Math.abs(b.x1 - b.x0) / 2 + 2, Math.abs(b.y1 - b.y0) / 2 + 2, 0.5, INK, 1); }
  G.unclip();
  scrollbarV({ x: R.x + R.w - sbW - 3, y: gy, w: sbW, h: gh }, App.top, rows.length, vis, (v) => { App.top = v; });
  region({ x: R.x + 3, y: gy, w: gutter, h: gh }, { cursor: 'pointer', down: (pt) => { const row = App.top + Math.floor((pt.y - gy) / rh); if (rows[row] != null) Engine.preview(song, p.inst, rows[row]); return null; }, wheel: rollWheel });
  region({ x: gx, y: gy, w: gridW, h: gh }, { cursor: App.tool === 'scissors' ? 'not-allowed' : App.tool === 'lasso' ? 'crosshair' : 'cell', down: rollDown, wheel: rollWheel, hover: rollHover });
}
function scrollbarV(r, value, total, vis, set) {
  G.wline(r.x + r.w / 2, r.y, r.x + r.w / 2, r.y + r.h, 0.5, INK, 0.4, 10);
  if (total <= vis) return;
  const th = Math.max(12, Math.round((r.h * vis) / total)), ty = r.y + Math.round(((r.h - th) * value) / (total - vis));
  G.roundRect(r.x, ty, r.w, th, 3, YELLOW, INK, 1);
  region(r, { cursor: 'ns-resize', down: (pt) => { const f = (q) => set(clamp(Math.round(((q.y - r.y - th / 2) / (r.h - th)) * (total - vis)), 0, total - vis)); f(pt); return { move: f, up() {} }; } });
}
function scrollbarH(r, value, total, vis, set) {
  if (total <= vis) return;
  const tw = Math.max(14, Math.round((r.w * vis) / total)), tx = r.x + Math.round(((r.w - tw) * value) / (total - vis));
  G.roundRect(tx, r.y, tw, r.h, 2, YELLOW, INK, 1);
  region(r, { cursor: 'ew-resize', down: (pt) => { const f = (q) => set(clamp(Math.round(((q.x - r.x - tw / 2) / (r.w - tw)) * (total - vis)), 0, total - vis)); f(pt); return { move: f, up() {} }; } });
}
function rollCell(pt) {
  const g = App.rollGeom;
  const step = clamp(Math.floor((pt.x - g.gx) / g.cw), 0, g.ps - 1);
  const row = clamp(App.top + Math.floor((pt.y - g.gy) / g.rh), 0, g.rows.length - 1);
  return { step, row, note: noteAt(step, g.rows[row]) };
}
function noteAt(step, n) {
  const ns = pattern().notes;
  for (let i = ns.length - 1; i >= 0; i--) { const q = ns[i]; if (q[1] === n && step >= q[0] && step < q[0] + q[2]) return q; }
  return null;
}
function rollHover(pt) { App.hover = Object.assign({ kind: 'cell' }, rollCell(pt)); }
function rollWheel(e) {
  if (e.ctrlKey) { App.rowH = clamp(App.rowH + (e.deltaY < 0 ? 1 : -1), 5, 16); return; }
  App.top += Math.sign(e.deltaY) * (Math.abs(e.deltaY) > 50 ? 3 : 1);
}
function rollDown(pt, e) {
  const g = App.rollGeom, p = pattern(), c = rollCell(pt);
  const n = g.rows[c.row];
  if (App.tool === 'scissors' || e.button === 2) {
    History.push(App.song);
    const kill = (q) => { const c2 = rollCell(q); if (c2.note) { p.notes.splice(p.notes.indexOf(c2.note), 1); App.sel.delete(c2.note); changed(); } };
    kill(pt);
    return { move: kill, up() {} };
  }
  if (App.tool === 'lasso' || (e.shiftKey && !c.note)) {
    if (!e.shiftKey) App.sel.clear();
    const d = { box: { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, move(q) { d.box.x1 = q.x; d.box.y1 = q.y; }, up() {
      const s0 = rollCell({ x: Math.min(d.box.x0, d.box.x1), y: Math.min(d.box.y0, d.box.y1) }), s1 = rollCell({ x: Math.max(d.box.x0, d.box.x1), y: Math.max(d.box.y0, d.box.y1) });
      const hi = g.rows[s0.row], lo = g.rows[s1.row];
      for (const q of p.notes) if (q[1] <= hi && q[1] >= lo && q[0] + q[2] > s0.step && q[0] <= s1.step) App.sel.add(q);
    } };
    return d;
  }
  if (c.note) {
    // grab: move every chosen note, or stretch them from the tail
    const q = c.note;
    if (!App.sel.has(q)) { if (!e.shiftKey) App.sel.clear(); App.sel.add(q); }
    else if (e.shiftKey) { App.sel.delete(q); return null; }
    Engine.preview(App.song, p.inst, q[1], q[3]);
    const edgeX = g.gx + (q[0] + q[2]) * g.cw;
    const resizing = pt.x >= edgeX - Math.max(2, Math.floor(g.cw / 3));
    const orig = [...App.sel].map((s) => [s, s[0], s[1], s[2]]);
    let pushed = false, last = '';
    return {
      move(q2) {
        const c2 = rollCell(q2);
        const ds = c2.step - c.step, dr = c2.row - c.row;
        const key = ds + ',' + dr; if (key === last) return; last = key;
        if (!pushed) { History.push(App.song); pushed = true; }
        for (const [s, s0, n0, l0] of orig) {
          if (resizing) s[2] = Math.max(1, l0 + ds);
          else {
            s[0] = clamp(s0 + ds, 0, g.ps - 1);
            const ri = g.rows.indexOf(n0);
            s[1] = ri >= 0 ? g.rows[clamp(ri + dr, 0, g.rows.length - 1)] : clamp(n0 - dr, 0, 127);
          }
        }
        if (!resizing && dr) Engine.preview(App.song, p.inst, q[1], q[3]);
        changed();
      },
      up() {},
    };
  }
  if (n == null) return null;
  History.push(App.song);
  const note = [c.step, n, App.noteSize, 0.8];
  p.notes.push(note);
  App.sel.clear(); App.sel.add(note);
  Engine.preview(App.song, p.inst, n);
  changed();
  return {
    move(q) { const c2 = rollCell(q); if (c2.step > c.step) note[2] = Math.max(App.noteSize, c2.step - c.step + 1); changed(); },
    up() { p.notes.sort((a, b) => a[0] - b[0] || b[1] - a[1]); },
  };
}

// ---------- film strip (the song) ----------
function hlColor(look) { const c = lookCap(look); return c === INK ? YELLOW : c; }
function drawArr(L) {
  const R = L.arr, song = App.song, ps = song.patternSize;
  // a strip of black film with sprocket holes
  G.rect(R.x + 2, R.y + 3, R.w, R.h, INK);
  G.rect(R.x, R.y, R.w, R.h, INK);
  for (let x = R.x + 4; x < R.x + R.w - 4; x += 9) { G.roundRect(x, R.y + 2, 5, 4, 1, PAPER, null); G.roundRect(x, R.y + R.h - 6, 5, 4, 1, PAPER, null); }
  const lab = 14, head = 11, sb = 5, hole = 8;
  const gx = R.x + lab, gy = R.y + hole + head + 1, gw = R.w - lab - 5, gh = R.h - hole * 2 - head - sb - 3;
  const chans = song.channels;
  const rh = Math.max(5, Math.floor(gh / chans));
  const cw = G.portrait ? 12 : 14;
  const visBars = Math.floor(gw / cw);
  const total = Math.max(songLength(song) + 8, visBars, 16);
  const pos = Player.playing && Player.mode === 'song' ? Player.position() : -1;
  if (pos >= 0) { const pb = Math.floor(pos / ps); if (pb < App.arrScroll || pb >= App.arrScroll + visBars) App.arrScroll = clamp(pb - 1, 0, Math.max(0, total - visBars)); }
  App.arrScroll = clamp(App.arrScroll, 0, Math.max(0, total - visBars));
  const s0 = App.arrScroll;
  const xOf = (bar) => gx + (bar - s0) * cw;
  const loop = song.arrangement.loop;
  const hy = R.y + hole;
  G.clip(gx, R.y + hole, gw, R.h - hole * 2);
  // lanes and bar lines
  for (let c = 1; c < chans; c++) for (let x = gx; x < gx + gw; x += 4) G.rect(x, gy + c * rh - 1, 1, 1, PAPER);
  for (let b = 0; b < visBars + 1; b++) {
    const bar = s0 + b, x = gx + b * cw;
    if (bar % 4 === 0) { for (let y = gy; y < gy + chans * rh; y += 2) G.rect(x, y, 1, 1, PAPER); G.text(String(bar + 1), x + 2, hy - 1, 'mono', PAPER); }
  }
  // loop section: a yellow band with brackets
  if (loop) {
    const x0 = xOf(loop[0]), x1 = xOf(loop[1]);
    G.rect(x0, hy, x1 - x0, head - 1, YELLOW);
    for (let b = loop[0]; b < loop[1]; b++) if (b % 4 === 0) G.text(String(b + 1), xOf(b) + 2, hy - 1, 'mono', INK);
  }
  // blocks
  for (let b = 0; b < visBars + 1; b++) {
    const bar = s0 + b, x = gx + b * cw;
    const live = pos >= 0 && Math.floor(pos / ps) === bar;
    for (let c = 0; c < chans; c++) {
      const pi = (song.arrangement.bars[bar] || [])[c];
      if (pi == null || pi < 0) continue;
      const q = song.patterns[pi]; if (!q) continue;
      const look = instOf(q).look, cap = lookCap(look), fill = cap === INK ? PAPER : cap;
      const y = gy + c * rh + (live ? -1 : 0);
      G.roundRect(x + 1, y + 1, cw - 2, rh - 2, 2, fill, null);
      if (((look % LOOKS.length) + LOOKS.length) % LOOKS.length >= 4) G.rect(x + 3, y + Math.floor(rh / 2), cw - 6, 1, INK);
      if (cap === INK) for (let k = x + 3; k < x + cw - 3; k += 2) G.rect(k, y + Math.floor(rh / 2), 1, 1, INK);
      if (pi === App.pat) G.roundRect(x, y, cw, rh, 3, null, PINK, 1);
    }
  }
  // start flag + playhead
  if (App.startBar >= s0 && App.startBar <= s0 + visBars) { const x = xOf(App.startBar); G.rect(x, hy, 1, head + 1 + chans * rh, PINK); for (let k = 0; k < 4; k++) G.rect(x, hy + k, 6 - k * 1.5, 1, PINK); }
  if (pos >= 0) { const x = Math.round(gx + (pos / ps - s0) * cw); G.rect(x, hy, 2, head + 1 + chans * rh, YELLOW); }
  G.unclip();
  for (let c = 0; c < chans; c++) {
    const dragging = App.drag && App.drag.lane === c;
    if (dragging) G.rect(R.x + 2, gy + c * rh, lab - 3, rh - 1, PINK);
    if (rh >= 9) G.text(String(c + 1), R.x + 4, gy + c * rh + Math.floor((rh - 11) / 2), 'mono', dragging ? INK : PAPER);
  }
  // lane numbers: drag up/down to reorder whole lanes
  region({ x: R.x, y: gy, w: lab, h: chans * rh }, { cursor: 'ns-resize', down: (pt) => {
    const laneAt = (q) => clamp(Math.floor((q.y - gy) / rh), 0, chans - 1);
    let pushed = false;
    const d = { lane: laneAt(pt), cursor: 'ns-resize', move(q) {
      const to = laneAt(q); if (to === d.lane) return;
      if (!pushed) { History.push(song); pushed = true; }
      for (const row of song.arrangement.bars) { const v = row.splice(d.lane, 1)[0]; row.splice(to, 0, v); }
      d.lane = to; changed();
    }, up() {} };
    return d;
  } });
  scrollbarH({ x: gx, y: R.y + R.h - hole - sb, w: gw, h: sb }, s0, total, visBars, (v) => { App.arrScroll = v; });
  App.arrGeom = { gx, gy, cw, rh, s0, chans };
  // bar numbers: click = play from here (whole song), drag = loop that section
  region({ x: gx, y: hy - 2, w: gw, h: head + 3 }, { cursor: 'pointer', down: (pt) => {
    const b0 = Math.max(0, s0 + Math.floor((pt.x - gx) / cw));
    let moved = false;
    const apply = (b1) => {
      if (b1 !== b0) moved = true;
      if (moved) { song.arrangement.loop = [Math.min(b0, b1), Math.max(b0, b1) + 1]; App.startBar = Math.min(b0, b1); }
    };
    return {
      move(q) { apply(Math.max(0, s0 + Math.floor((q.x - gx) / cw))); },
      up() {
        if (!moved) { song.arrangement.loop = null; App.startBar = b0; }
        changed();
        toast(song.arrangement.loop ? `looping bars ${song.arrangement.loop[0] + 1}-${song.arrangement.loop[1]}` : `playing from bar ${b0 + 1}`);
        if (Player.playing) { Player.stop(); play('song'); }
      },
    };
  }, wheel: (e) => { App.arrScroll += Math.sign(e.deltaY || e.deltaX); } });
  region({ x: gx, y: gy, w: gw, h: chans * rh }, { cursor: App.tool === 'scissors' ? 'not-allowed' : 'pointer', down: arrDown, wheel: (e) => { App.arrScroll += Math.sign(e.deltaY || e.deltaX); }, hover: () => { App.hover = { kind: 'arr' }; } });
}
function arrCell(pt) { const g = App.arrGeom; return { bar: g.s0 + Math.floor((pt.x - g.gx) / g.cw), ch: clamp(Math.floor((pt.y - g.gy) / g.rh), 0, g.chans - 1) }; }
function arrDown(pt, e) {
  const song = App.song, bars = song.arrangement.bars;
  const c = arrCell(pt);
  const ensure = (b) => { while (bars.length <= b) bars.push(new Array(MAX_CHANNELS).fill(-1)); };
  ensure(c.bar);
  const cur = bars[c.bar][c.ch];
  if (App.tool === 'scissors' || e.button === 2) {
    History.push(song);
    const kill = (q) => { const k = arrCell(q); if (bars[k.bar] && bars[k.bar][k.ch] >= 0) { bars[k.bar][k.ch] = -1; changed(); } };
    kill(pt); return { move: kill, up() {} };
  }
  if (cur >= 0) {
    // pick a block up: click opens that page, drag moves it (hold ctrl/alt to copy)
    if (cur !== App.pat) selectPattern(cur);
    let pushed = false, at = c;
    const copy = e.ctrlKey || e.altKey;
    return { cursor: 'grabbing', move(q) {
      const k = arrCell(q); if ((k.bar === at.bar && k.ch === at.ch) || k.bar < 0) return;
      if (!pushed) { History.push(song); pushed = true; }
      ensure(k.bar);
      if (!(copy && at === c)) bars[at.bar][at.ch] = -1;
      bars[k.bar][k.ch] = cur; at = k; changed();
    }, up() {} };
  }
  History.push(song);
  const paint = (q) => { const k = arrCell(q); if (k.bar < 0) return; ensure(k.bar); if (bars[k.bar][k.ch] !== App.pat) { bars[k.bar][k.ch] = App.pat; changed(); } };
  paint(pt);
  return { move: paint, up() {} };
}

// ---------- the instrument shelf ----------
function drawShelfItem(inst, i, x, y, w, h, active, live) {
  const bounce = live ? -Math.abs(Math.round(Math.sin(App.t * 18) * 2)) : 0;
  const s = Math.min(h - 2, 18);
  if (active) G.wellipse(x + s / 2 + 2, y + h / 2, s / 2 + 3, h / 2 + 1, 0.5, INK, 1);
  icon(familyOf(inst), x + 2, y + (h - s) / 2 + bounce, s, lookCap(inst.look) === INK ? PAPER : lookCap(inst.look));
  const nx = x + s + 7, nw = w - s - 9;
  const name = G.handFit(inst.name, nw, 13);
  const ty = y + Math.floor((h - 15) / 2);
  if (active) G.rect(nx - 2, ty + 7, G.handW(name, 13) + 4, 7, hlColor(inst.look));
  G.hand(name, nx, ty, 13, INK, 0);
  const off = inst.mute || (App.song.instruments.some((q) => q.solo) && !inst.solo);
  if (off) G.rect(nx - 2, ty + 9, G.handW(name, 13) + 4, 1, INK);
}
function drawRight(L) {
  const R = L.right, song = App.song;
  const live = new Set(Player.sounding().map((r) => r.e.inst));
  if (R.horizontal) {
    const items = [...song.instruments.map((_, i) => i), 'add'];
    const iw = 96, ih = 20;
    const perCol = Math.max(1, Math.floor(R.h / (ih + 1)));
    const cols = Math.ceil(items.length / perCol);
    App.instScroll = clamp(App.instScroll, 0, Math.max(0, cols * iw - R.w + 8));
    region(R, { wheel: (e) => { App.instScroll += (e.deltaY || e.deltaX) > 0 ? 24 : -24; } });
    G.clip(R.x, R.y, R.w, R.h);
    items.forEach((it, k) => {
      const col = Math.floor(k / perCol), row = k % perCol;
      const x = R.x + 2 + col * iw - App.instScroll, y = R.y + row * (ih + 1);
      if (it === 'add') { word(x + 4, y + 3, '+ add instrument', () => addInstrument(), { size: 12 }); return; }
      drawShelfItem(song.instruments[it], it, x, y, iw - 4, ih, it === App.inst, live.has(it));
      region({ x, y, w: iw - 2, h: ih }, shelfHandlers(it));
    });
    G.unclip();
    return;
  }
  G.hand('instruments', R.x + 4, R.y, 12, INK, 0.3);
  G.wline(R.x + 2, R.y + 13, R.x + R.w - 2, R.y + 14, 0.5, INK, 0.6);
  const top = R.y + 18;
  const ih = clamp(Math.floor((R.h - 40) / Math.max(5, song.instruments.length)), 16, 24);
  const visible = Math.floor((R.h - 40) / ih);
  App.instScroll = clamp(App.instScroll, 0, Math.max(0, song.instruments.length - visible));
  for (let k = 0; k < visible && k + App.instScroll < song.instruments.length; k++) {
    const i = k + App.instScroll;
    const y = top + k * ih;
    const dx = Math.round(ease('m' + i, i === App.inst ? 0 : 3));
    drawShelfItem(song.instruments[i], i, R.x + 2 + dx, y, R.w - 4 - dx, ih - 1, i === App.inst, live.has(i));
    region({ x: R.x, y, w: R.w, h: ih }, Object.assign(shelfHandlers(i), { wheel: (e) => { App.instScroll += Math.sign(e.deltaY); } }));
  }
  const by = R.y + R.h - 16;
  if (song.instruments.length > visible) {
    chevron(R.x + R.w - 34, by + 3, -1, () => { App.instScroll--; });
    chevron(R.x + R.w - 18, by + 3, 1, () => { App.instScroll++; });
  }
  word(R.x + 6, by, '+ add instrument', () => addInstrument(), { size: 12 });
}
function shelfHandlers(i) {
  return {
    cursor: 'pointer',
    down: (pt, e) => {
      const now = performance.now();
      if (e.button === 2 || now - (App.anim.ease['tap' + i] || 0) < 350) { openTweak(i); return null; }
      App.anim.ease['tap' + i] = now;
      App.inst = i;
      const p = pattern();
      if (p.inst !== i) mutate(() => { p.inst = i; }, true);
      Engine.preview(App.song, i, isDrums(App.song.instruments[i]) ? 38 : 60);
      return null;
    },
  };
}

// ---------- bottom: objects on the desk ----------
function caption(text, cx, y, hot) { G.handC(text, cx, y, 12, INK, hot ? 1 : 0.4); }
function drawBottom(L) {
  const B = L.bottom;
  for (const it of B.items) {
    const r = { x: B.x + it.x, y: B.y + it.y, w: it.w, h: it.h };
    const hot = inR(App.pointer, r) && !App.drag && !App.popups.length && !App.menu;
    const cx = r.x + r.w / 2;
    const capY = r.y + r.h - 12;
    const body = { x: r.x, y: r.y, w: r.w, h: r.h - 13 };
    switch (it.id) {
      case 'play': { // boombox: speakers pump with the music, reels spin
        const on = Player.playing, lvl = App.level;
        const bx = r.x + 2, by = body.y + 7, bw = r.w - 6, bh = body.h - 7;
        G.wline(bx + 12, by, bx + 16, by - 6, 0.5, INK, 0.5); G.wline(bx + 16, by - 6, bx + bw - 16, by - 6, 0.5, INK, 0.5); G.wline(bx + bw - 16, by - 6, bx + bw - 12, by, 0.5, INK, 0.5);
        G.rect(bx + 2, by + 2, bw, bh, INK);
        G.roundRect(bx, by, bw, bh, 3, on ? PINK : PAPER, null);
        G.wrect(bx, by, bw, bh, 0.5, INK, 0.7);
        const sr = Math.min(bh / 2 - 2, 8);
        for (const sx of [bx + sr + 3, bx + bw - sr - 3]) { const pump = on ? lvl * 3 : 0; G.wellipse(sx, by + bh / 2, sr + pump * 0.4, sr + pump * 0.4, 0.5, INK, 0.6, PAPER); G.disc(sx, by + bh / 2, 2 + pump, INK); }
        const wx = cx - 8, wy = by + 3;
        G.rect(wx, wy, 16, 8, PAPER); G.frame1(wx, wy, 16, 8);
        const a = on ? App.t * 8 : 0;
        for (const rx of [wx + 4, wx + 12]) { G.disc(rx, wy + 4, 2, INK); G.rect(rx + Math.round(Math.cos(a) * 1.5), wy + 4 + Math.round(Math.sin(a) * 1.5), 1, 1, PAPER); }
        const pbx = cx - 4, pby = by + bh - 8;
        if (on) G.rect(pbx, pby, 7, 6, INK); else G.wpoly([[pbx, pby - 1], [pbx + 8, pby + 3], [pbx, pby + 7]], 0.5, INK, 0.4);
        caption(on ? 'stop' : 'play', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(() => play()) });
        break;
      }
      case 'modes': { // a toggle switch: whole song vs this page
        const song = App.mode === 'song';
        const sx = r.x + 6, sy = body.y + 10, sw = r.w - 12, sh = 13;
        G.rect(sx + 2, sy + 2, sw, sh, INK); G.roundRect(sx, sy, sw, sh, 6, song ? CYAN : YELLOW, INK, 1);
        const kx = sx + ease('switch', song ? 2 : sw - 13);
        G.wellipse(kx + 5, sy + 6, 5, 5, 0.5, INK, 0.5, PAPER);
        G.hand(song ? 'song' : 'page', song ? sx + 15 : sx + 4, sy - 1, 12, INK, 0.3);
        caption(song ? 'whole song' : 'loop page', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(() => { App.mode = song ? 'pattern' : 'song'; if (Player.playing) { Player.stop(); play(App.mode); } }) });
        break;
      }
      case 'tweak': { // a knob
        const kcx = cx, kcy = body.y + body.h / 2 + 3, kr = Math.min(11, body.h / 2 - 2);
        G.disc(kcx + 2, kcy + 2, kr, INK); G.wellipse(kcx, kcy, kr, kr, 0.5, INK, 0.6, PAPER);
        for (let k = 0; k < 7; k++) { const a = Math.PI * 0.75 + (k / 6) * Math.PI * 1.5; G.rect(kcx + Math.cos(a) * (kr + 3), kcy + Math.sin(a) * (kr + 3), 1, 1, INK); }
        const inst = App.song.instruments[App.inst] || {};
        const a = Math.PI * 0.75 + (inst.vol ?? 0.7) * Math.PI * 1.5 + (hot ? Math.sin(App.t * 8) * 0.2 : 0);
        G.wline(kcx, kcy, kcx + Math.cos(a) * (kr - 2), kcy + Math.sin(a) * (kr - 2), 1, PINK, 0.3);
        caption('tweak', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(() => openTweak(App.inst)) });
        break;
      }
      case 'oops': { // the undo snail scoots backwards
        const age = App.t - App.anim.snail, dx = age < 0.6 ? -Math.sin((age / 0.6) * Math.PI) * 8 : 0;
        const sx = cx + 4 + dx, sy = body.y + body.h - 3;
        G.wline(sx - 18, sy, sx + 12, sy, 1, INK, 0.5);
        G.wline(sx - 18, sy, sx - 21, sy - 7, 1, INK, 0.5);
        G.wline(sx - 21, sy - 7, sx - 24, sy - 12, 0.5, INK, 0.5); G.disc(sx - 24, sy - 12, 1.5, INK);
        const spin = age < 0.6 ? age * 20 : 0;
        G.wellipse(sx, sy - 9, 10, 9, 0.5, INK, 0.7, YELLOW);
        let px = sx, py = sy - 9;
        for (let k = 0; k < 40; k++) { const t2 = (k / 40) * Math.PI * 4 - spin, rr = 8 - k * 0.19; const nx = sx + Math.cos(t2) * rr, ny = sy - 9 + Math.sin(t2) * rr * 0.9; if (k) G.line(px, py, nx, ny, 0.5, INK); px = nx; py = ny; }
        caption('oops', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(undo) });
        break;
      }
      case 'size': { // a worm as long as your notes
        const n = App.noteSize, max = App.song.patternSize;
        chevron(r.x + 1, body.y + body.h / 2 - 2, -1, () => { App.noteSize = clamp(App.noteSize - 1, 1, max); });
        chevron(r.x + r.w - 11, body.y + body.h / 2 - 2, 1, () => { App.noteSize = clamp(App.noteSize + 1, 1, max); });
        const span = r.w - 30, len = 6 + Math.round(((span - 6) * (n - 1)) / (max - 1));
        const wx = cx - len / 2, wy = body.y + body.h / 2 + 2;
        const segs = Math.max(2, Math.round(len / 5));
        const col = lookCap((App.song.instruments[App.inst] || {}).look || 0);
        for (let k = 0; k < segs; k++) { const t2 = k / (segs - 1); G.wellipse(wx + t2 * len, wy + Math.sin(App.t * 5 + k * 0.9) * 2, 3, 3, 0.5, INK, 0.3, col === INK ? PAPER : col); }
        G.disc(wx + len + 1, wy + Math.sin(App.t * 5 + (segs - 1) * 0.9) * 2 - 1, 1, INK);
        caption('note length ' + n, cx, capY, hot);
        break;
      }
      case 'tempo': { // a metronome ticking at the song tempo
        const mx = cx, base = body.y + body.h, top = body.y + 2;
        for (let k = 0; k < base - top; k++) { const hw = 6 + (k / (base - top)) * 6; G.rect(mx - hw + 1, top + k, hw * 2 - 1, 1, k > (base - top) * 0.6 ? CYAN : PAPER); }
        G.wpoly([[mx - 6, top], [mx + 6, top], [mx + 12, base], [mx - 12, base]], 0.5, INK, 0.6);
        const beat = Player.playing ? Player.position() / 4 : (App.t * App.song.bpm) / 60;
        const ang = Math.sin(beat * Math.PI) * 0.5;
        G.wline(mx, base - 6, mx + Math.sin(ang) * 16, base - 6 - Math.cos(ang) * 16, 0.5, INK, 0.3);
        G.disc(mx + Math.sin(ang) * 11, base - 6 - Math.cos(ang) * 11, 1.5, PINK);
        G.handC(String(Math.round(App.song.bpm)), mx, base - 12, 11, INK, 0.3);
        let bpmUndo = 0;
        const bump = (d) => () => { if (performance.now() - bpmUndo > 800) History.push(App.song); bpmUndo = performance.now(); App.song.bpm = clamp(Math.round(App.song.bpm) + d, 20, 400); changed(); };
        chevron(r.x + 1, body.y + body.h / 2 - 2, -1, bump(-1));
        chevron(r.x + r.w - 11, body.y + body.h / 2 - 2, 1, bump(1));
        caption('tempo', cx, capY, hot);
        break;
      }
      case 'export': { // a paper plane that flies off when clicked
        const age = App.t - App.anim.plane;
        const flying = age >= 0 && age < 1;
        const px = cx - 11 + (flying ? age * 60 : 0), py = body.y + body.h / 2 + 2 - (flying ? age * 30 : Math.sin(App.t * 2) * 2);
        G.wpoly([[px, py], [px + 22, py - 7], [px + 8, py + 6]], 0.5, INK, 0.6);
        G.wline(px + 22, py - 7, px + 9, py + 1, 0.5, INK, 0.5);
        if (!flying) for (let k = 0; k < 3; k++) G.rect(px - 4 - k * 4, py + 2 + k, 2, 1, INK);
        caption('export', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(() => { App.anim.plane = App.t; exportWav(); }) });
        break;
      }
      case 'trash': { // clear the page: the lid pops when you hover
        const tx = cx - 9, ty = body.y + 8, tw = 18, th = body.h - 8;
        const lid = hot ? -3 - Math.abs(Math.sin(App.t * 10)) * 2 : 0;
        G.rect(tx + 2, ty + 2, tw, th, INK);
        G.rect(tx, ty, tw, th, PAPER); G.wrect(tx, ty, tw, th, 0.5, INK, 0.6);
        for (let k = 1; k < 4; k++) G.wline(tx + (tw * k) / 4, ty + 3, tx + (tw * k) / 4, ty + th - 3, 0.5, INK, 0.4);
        G.wline(tx - 3, ty - 2 + lid, tx + tw + 3, ty - 2 + lid * 1.4, 1, INK, 0.5);
        G.wline(tx + 6, ty - 4 + lid, tx + tw - 6, ty - 4 + lid * 1.4, 0.5, INK, 0.5);
        caption('clear page', cx, capY, hot);
        region(r, { cursor: 'pointer', down: tap(() => { if (pattern().notes.length) { mutate(() => { pattern().notes.length = 0; }); toast('page cleared (the snail brings it back)'); } }) });
        break;
      }
    }
  }
}

// ---------- popups: notes taped onto the desk ----------
function dialog(w, h, title, draw, o = {}) { App.popups.push({ w, h, title, draw, o }); }
function closePopup() { const pp = App.popups.pop(); if (pp && pp.o.onClose) pp.o.onClose(); }
function drawPopups() {
  App.popups.forEach((pp, idx) => {
    const top = idx === App.popups.length - 1;
    const w = Math.min(pp.w, G.W - 8), h = Math.min(pp.h, G.H - 8);
    const x = Math.floor((G.W - w) / 2), y = Math.floor((G.H - h) / 2);
    if (top) { G.x.fillStyle = G.pats.veil; G.x.fillRect(0, 0, G.W, G.H); region({ x: 0, y: 0, w: G.W, h: G.H }, { down: tap(() => closePopup()), wheel: () => {} }); }
    paper(x, y, w, h);
    tape(x + 8, y - 4, 26, 9, -0.2); tape(x + w - 34, y - 4, 26, 9, 0.2);
    G.hand(pp.title, x + 12, y + 5, 16, INK, 0.5);
    G.wline(x + 10, y + 22, x + 12 + G.handW(pp.title, 16), y + 23, 0.5, PINK, 0.8);
    const cr = { x: x + w - 18, y: y + 6, w: 12, h: 12 };
    const hot = inR(App.pointer, cr);
    G.wline(cr.x + 2, cr.y + 2, cr.x + 10, cr.y + 10, hot ? 1 : 0.5, INK, 0.8); G.wline(cr.x + 10, cr.y + 2, cr.x + 2, cr.y + 10, hot ? 1 : 0.5, INK, 0.8);
    region({ x, y, w, h }, { down: () => null, wheel: () => {} });
    region(cr, { cursor: 'pointer', down: tap(() => closePopup()) });
    pp.draw({ x: x + 10, y: y + 30, w: w - 20, h: h - 36 }, top);
  });
}
// In-page replacements for confirm() / prompt(), which embedded viewers block.
function askConfirm(msg, yes, onYes) {
  dialog(260, 96, 'are you sure?', (r) => {
    G.text(msg, r.x, r.y, 'body', INK);
    let x = r.x;
    x += word(x, r.y + 24, yes, () => { closePopup(); onYes(); }, { size: 13, underline: true, hl: PINK }) + 16;
    word(x, r.y + 24, 'never mind', () => closePopup(), { size: 13, underline: true });
  });
}
function askText(title, value, onOk) {
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = value; inp.maxLength = 40; inp.id = 'sb-text';
  inp.setAttribute('aria-label', title);
  Object.assign(inp.style, { position: 'fixed', border: 'none', outline: 'none', background: 'transparent', color: '#000', fontFamily: '"Patrick Hand", "Comic Sans MS", cursive', padding: '0', margin: '0' });
  document.body.appendChild(inp);
  const done = (ok) => { if (!inp.isConnected) return; const v = inp.value.trim(); closePopup(); if (ok && v) onOk(v); };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  dialog(260, 92, title, (r) => {
    const fy = r.y + 2, fw = r.w;
    G.wline(r.x, fy + 16, r.x + fw, fy + 17, 0.5, INK, 0.6);
    const cr = G.screen.getBoundingClientRect(), k = cr.width / G.W;
    Object.assign(inp.style, { left: cr.left + r.x * k + 'px', top: cr.top + (fy - 1) * k + 'px', width: fw * k + 'px', height: 17 * k + 'px', fontSize: 14 * k + 'px' });
    let x = r.x;
    x += word(x, r.y + 28, 'ok', () => done(true), { size: 13, underline: true }) + 16;
    word(x, r.y + 28, 'cancel', () => done(false), { size: 13, underline: true });
  }, { onClose: () => inp.remove() });
}
function renameSong() { askText('song title', App.song.title, (t) => mutate(() => { App.song.title = t.slice(0, 40); }, true)); }
function openAbout() {
  dialog(300, 120, APP_NAME, (r) => {
    const lines = ['a super easy music box that wiggles.', '',
      'thanks: song engine ideas from Bosca Ceoil (MIT),', 'small pixel fonts from Decker (MIT),', 'Patrick Hand + Gochi Hand fonts (OFL).'];
    lines.forEach((l, i) => G.text(l, r.x, r.y + i * 12, 'body', INK));
  });
}
function openHelp() {
  dialog(340, 306, 'how to', (r) => {
    const L = [
      ['click the page', 'stamp a note (drag right = longer)'], ['drag a note', 'move it; grab its tail to stretch'], ['right click', 'snip it (or use the scissors)'],
      ['shift + drag', 'lasso some notes'], ['numpad + / -', 'longer / shorter notes'], ['ctrl+z / ctrl+y', 'undo / redo (the snail)'],
      ['arrow keys', 'nudge the chosen notes'], ['ctrl+c / ctrl+v', 'copy / paste notes'], ['ctrl+d', 'copy this page'], ['delete', 'remove the chosen notes'],
      ['space', 'play / stop'], ['song strip', 'click = put this page there, drag = paint'], ['', 'drag a block = move it (ctrl = copy)'], ['', 'right click = clear, drag lane number = reorder'],
      ['bar numbers', 'click = play from there, drag = loop bars'], ['instruments', 'click = this page plays it'], ['', 'double click = tweak it'], ['ctrl + wheel', 'zoom the page'],
    ];
    L.forEach(([k, v], i) => { G.text(k, r.x, r.y + i * 13, 'body', INK); G.text(v, r.x + 92, r.y + i * 13, 'body', INK); });
  });
}
function openTweak(i) {
  App.inst = i;
  let pushed = false;
  const start = () => { if (!pushed) { History.push(App.song); pushed = true; } };
  dialog(300, 232, 'tweak', (r) => {
    const inst = App.song.instruments[i]; if (!inst) { closePopup(); return; }
    const p = presetOf(inst);
    let y = r.y;
    icon(familyOf(inst), r.x, y - 2, 18, lookCap(inst.look) === INK ? PAPER : lookCap(inst.look));
    word(r.x + 24, y, G.handFit(inst.name, 110, 14), () => askText('instrument name', inst.name, (n) => mutate(() => { inst.name = n.slice(0, 24); }, true)), { size: 14, underline: true });
    word(r.x + 150, y, 'change sound', () => openBrowser(i), { size: 13, underline: true });
    y += 17;
    G.text('sounds like: ' + G.fit(p.name, r.w - 90), r.x + 24, y, 'body', INK);
    y += 16;
    const sl = (label, key, min, max, fmt, def = 0) => { slider({ x: r.x, y, w: r.w, h: 11 }, label, inst[key] ?? def, min, max, fmt, (v) => { inst[key] = v; changed(); }, () => { start(); pushed = false; }); y += 15; };
    sl('volume', 'vol', 0, 1, (v) => Math.round(v * 100) + '%', 0.7);
    sl('left/right', 'pan', -1, 1, (v) => (Math.abs(v) < 0.04 ? 'mid' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)));
    slider({ x: r.x, y, w: r.w, h: 11 }, 'tuning', inst.detune || 0, -1200, 1200, (v) => (v > 0 ? '+' : '') + Math.round(v) + 'c', (v) => { inst.detune = Math.abs(v) < 12 ? 0 : Math.round(v); changed(); }, () => { start(); pushed = false; }); y += 15;
    sl('slide', 'glide', 0, 0.3, (v) => Math.round(v * 1000) + 'ms');
    sl('wobble', 'vibrato', 0, 1, (v) => Math.round(v * 100) + '%');
    sl('echo', 'delay', 0, 1, (v) => Math.round(v * 100) + '%');
    sl('room', 'reverb', 0, 1, (v) => Math.round(v * 100) + '%');
    G.hand('octave', r.x, y - 1, 12, INK, 0.3);
    picker(r.x + 52, y - 1, (inst.octave > 0 ? '+' : '') + (inst.octave || 0), (d) => mutate(() => { inst.octave = clamp((inst.octave || 0) + d, -3, 3); }, true), 14, 12);
    G.hand('colour', r.x + 120, y - 1, 12, INK, 0.3);
    picker(r.x + 162, y - 1, '   ', (d) => mutate(() => { inst.look = (inst.look + d + LOOKS.length) % LOOKS.length; }, true), 14, 12);
    G.wcapsule(r.x + 176, y + 2, 12, 8, lookFill(inst.look), INK, 0.6);
    y += 18;
    tick(r.x, y, 'mute', inst.mute, () => mutate(() => { inst.mute = !inst.mute; }, true));
    tick(r.x + 52, y, 'solo', inst.solo, () => mutate(() => { inst.solo = !inst.solo; }, true));
    let wx = r.x + 108;
    wx += word(wx, y - 1, 'hear it', () => Engine.preview(App.song, i, isDrums(inst) ? 38 : 60), { size: 12, underline: true }) + 10;
    wx += word(wx, y - 1, 'clone', () => { mutate(() => { App.song.instruments.push(Object.assign({}, inst, { name: inst.name + ' 2', look: (inst.look + 1) % LOOKS.length })); }, true); closePopup(); openTweak(App.song.instruments.length - 1); }, { size: 12, underline: true }) + 10;
    word(wx, y - 1, 'bin it', () => deleteInstrument(i), { size: 12, underline: true, hl: PINK });
  });
}
function deleteInstrument(i) {
  const s = App.song;
  if (s.instruments.length <= 1) { toast('need at least one instrument'); return; }
  askConfirm('remove "' + s.instruments[i].name + '"? its pages move to the first one.', 'yes, bin it', () => {
    mutate(() => {
      s.instruments.splice(i, 1);
      s.patterns.forEach((p) => { if (p.inst === i) p.inst = 0; else if (p.inst > i) p.inst--; });
    });
    App.inst = 0; closePopup();
  });
}
function addInstrument() {
  mutate(() => { App.song.instruments.push({ name: 'grand piano', preset: 'piano1', vol: 0.7, look: App.song.instruments.length % LOOKS.length }); App.song = SongKit.normalizeSong(App.song); }, true);
  const i = App.song.instruments.length - 1;
  App.inst = i;
  openBrowser(i, true);
}
// Sound picker: instrument families on the left, sounds on the right.
function openBrowser(i, renameOnPick) {
  const inst = App.song.instruments[i];
  const st = { group: familyOf(inst), ps: 0 };
  const groups = () => [...PRESET_GROUPS, ...(Object.keys(SF2Bank.banks).length ? ['Your Soundfonts'] : [])];
  const list = (g) => g === 'Your Soundfonts'
    ? Object.values(SF2Bank.banks).flatMap((b) => b.presets.map((p, k) => ({ id: 'sf2:' + b.name + ':' + k, name: p.name.toLowerCase() })))
    : PRESET_LIST.filter((p) => p.group === g);
  const cur = list(st.group).findIndex((p) => p.id === inst.preset); if (cur > 5) st.ps = cur - 3;
  dialog(400, 300, 'pick a sound', (r) => {
    const gs = groups();
    const gh = Math.max(14, Math.min(19, Math.floor(r.h / gs.length)));
    const colW = 128;
    gs.forEach((g, k) => {
      const y = r.y + k * gh, a = g === st.group;
      const hot = inR(App.pointer, { x: r.x, y, w: colW, h: gh });
      if (a) { G.x.fillStyle = YELLOW; G.x.fillRect(r.x + 16, y + gh / 2, G.handW(g, 12) + 6, 6); }
      icon(g, r.x, y + 1, Math.min(14, gh - 2), a ? PINK : PAPER);
      G.hand(g, r.x + 19, y + Math.floor((gh - 15) / 2), 12, INK, hot || a ? 0.9 : 0.3);
      region({ x: r.x, y, w: colW, h: gh }, { cursor: 'pointer', down: tap(() => { st.group = g; st.ps = 0; }) });
    });
    const items = list(st.group), px = r.x + colW + 6, pw = r.w - colW - 6, lh = 13;
    G.wline(px - 3, r.y, px - 3, r.y + r.h, 0.5, INK, 0.5, 10);
    const vis = Math.floor(r.h / lh);
    st.ps = clamp(st.ps, 0, Math.max(0, items.length - vis));
    region({ x: px, y: r.y, w: pw, h: r.h }, { wheel: (e) => { st.ps += Math.sign(e.deltaY) * 2; } });
    for (let k = 0; k < vis && k + st.ps < items.length; k++) {
      const it = items[k + st.ps], y = r.y + k * lh, a = it.id === inst.preset;
      const hot = inR(App.pointer, { x: px, y, w: pw - 8, h: lh });
      const label = G.handFit(it.name, pw - 22, 12);
      if (a) { G.x.fillStyle = lookFill(inst.look); G.x.fillRect(px + 8, y + 6, G.handW(label, 12) + 4, 6); }
      if (hot) G.disc(px + 3, y + 7, 1.5, INK);
      G.hand(label, px + 10, y, 12, INK, hot ? 0.9 : 0.25);
      region({ x: px, y, w: pw - 8, h: lh }, { cursor: 'pointer', wheel: (e) => { st.ps += Math.sign(e.deltaY) * 2; }, down: () => {
        mutate(() => { inst.preset = it.id; if (renameOnPick) inst.name = it.name.toLowerCase().slice(0, 20); }, true);
        renameOnPick = false;
        Engine.preview(App.song, i, isDrums(inst) ? 38 : 60);
        return null;
      } });
    }
    scrollbarV({ x: px + pw - 7, y: r.y, w: 7, h: r.h }, st.ps, items.length, vis, (v) => { st.ps = v; });
  });
}

// ---------- title page: a cardboard box full of noise ----------
function drawTitle() {
  G.rect(0, 0, G.W, G.H, PAPER);
  G.x.fillStyle = G.pats.paper; G.x.fillRect(0, 0, G.W, G.H);
  const cx = G.W / 2;
  const bw = Math.min(G.W * 0.7, 300), bh = Math.round(bw * 0.42);
  const total = bh + 30 + 110;
  const bx = cx - bw / 2, by = Math.max(40, Math.round((G.H - total) / 2) + 20);
  for (let k = 0; k < 7; k++) {
    const ph = (App.t * 0.35 + k / 7) % 1;
    const nx = cx + Math.sin(k * 2.3 + App.t) * bw * 0.3, ny = by - ph * 40;
    const col = [PINK, CYAN, YELLOW][k % 3];
    G.wellipse(nx, ny, 4, 3, 0.5, INK, 0.6, col); G.wline(nx + 4, ny, nx + 4, ny - 11, 0.5, INK, 0.5);
    if (k % 2) G.wline(nx + 4, ny - 11, nx + 8, ny - 8, 0.5, INK, 0.5);
  }
  G.wpoly([[bx, by], [bx - 18, by - 16], [bx + bw * 0.4, by - 20], [bx + bw * 0.5, by]], 0.5, INK, 1);
  G.wpoly([[bx + bw, by], [bx + bw + 18, by - 14], [bx + bw * 0.6, by - 22], [bx + bw * 0.5, by]], 0.5, INK, 1);
  G.rect(bx + 3, by + 4, bw, bh, INK);
  G.rect(bx, by, bw, bh, YELLOW);
  G.wrect(bx, by, bw, bh, 1, INK, 1);
  const tsize = Math.round(bw / 7);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) G.handC(APP_NAME, cx + dx, by + bh / 2 - tsize * 0.6 + dy, tsize, INK, 1.4);
  G.handC('a music box you scribble in', cx, by + bh + 10, 14, INK, 0.6);
  const y = by + bh + 50;
  const r1w = G.handW("let's make noise!", 16) + 20;
  const r1 = { x: cx - r1w / 2, y, w: r1w, h: 22 };
  const h1 = inR(App.pointer, r1);
  G.rect(r1.x + 3, r1.y + 3, r1.w, r1.h, INK); G.roundRect(r1.x, r1.y, r1.w, r1.h, 8, h1 ? PINK : CYAN, null); G.wrect(r1.x, r1.y, r1.w, r1.h, 0.5, INK, 1);
  G.handC("let's make noise!", cx, r1.y + 2, 16, INK, h1 ? 1.2 : 0.6);
  region(r1, { cursor: 'pointer', down: tap(startFresh) });
  word(cx - G.handW('or listen to an example song', 13) / 2, y + 32, 'or listen to an example song', () => { App.title = false; Engine.ensure(); loadExample(); setTimeout(() => play('song'), 50); }, { size: 13, underline: true });
  if (App.saved) {
    const t = 'or keep working on "' + G.handFit(App.saved.title || 'untitled', 140, 13) + '"';
    word(cx - G.handW(t, 13) / 2, y + 52, t, () => { App.title = false; Engine.ensure(); Player.stop(); setSong(App.saved); App.pat = 0; App.inst = 0; App.startBar = 0; App.arrScroll = 0; centerRoll(); }, { size: 13, underline: true });
  }
}

// ---------- actions ----------
function startFresh() {
  App.title = false; Engine.ensure(); Player.stop();
  setSong(SongKit.newSong());
  App.pat = 0; App.inst = 0; App.startBar = 0; App.arrScroll = 0; centerRoll();
}
function newPattern(dup) {
  const s = App.song, cur = pattern();
  mutate(() => { s.patterns.push(dup ? JSON.parse(JSON.stringify(cur)) : { inst: App.inst, key: cur.key, scale: cur.scale, notes: [] }); });
  selectPattern(s.patterns.length - 1, !dup);
  toast(dup ? 'page copied' : 'fresh page');
}
function pruneP() {
  const s = App.song, used = new Set();
  s.arrangement.bars.forEach((r) => r.forEach((v) => v >= 0 && used.add(v)));
  used.add(App.pat);
  const map = {}; const keep = [];
  s.patterns.forEach((p, i) => { if (used.has(i)) { map[i] = keep.length; keep.push(p); } });
  if (keep.length === s.patterns.length) { toast('nothing to tidy'); return; }
  mutate(() => { s.patterns = keep; s.arrangement.bars = s.arrangement.bars.map((r) => r.map((v) => (v >= 0 ? map[v] ?? -1 : -1))); App.pat = map[App.pat] ?? 0; });
  toast('tidied up');
}
function selectAll() { App.sel = new Set(pattern().notes); }
function copySel() { const ns = App.sel.size ? [...App.sel] : pattern().notes; App.clip = ns.map((n) => n.slice()); toast(`copied ${ns.length} notes`); }
function pasteSel() { if (!App.clip) return; mutate(() => { const add = App.clip.map((n) => n.slice()); pattern().notes.push(...add); App.sel = new Set(add); }, true); }
function deleteSel() { if (!App.sel.size) return; const kill = App.sel; mutate(() => { const p = pattern(); p.notes = p.notes.filter((n) => !kill.has(n)); }); }
function resizeNotes(d) {
  let targets = [...App.sel];
  if (!targets.length && App.hover && App.hover.kind === 'cell' && App.hover.note) targets = [App.hover.note];
  if (!targets.length) { App.noteSize = clamp(App.noteSize + d, 1, App.song.patternSize); toast('note length ' + App.noteSize); return; }
  mutate(() => { for (const n of targets) n[2] = clamp(n[2] + d, 1, App.song.patternSize * 4); }, true);
}
function nudge(ds, dn) {
  if (!App.sel.size) return;
  const g = App.rollGeom;
  mutate(() => {
    for (const n of App.sel) {
      n[0] = clamp(n[0] + ds, 0, App.song.patternSize - 1);
      if (dn) { const i = g.rows.indexOf(n[1]); n[1] = Math.abs(dn) === 12 ? clamp(n[1] + dn, 0, 127) : i >= 0 ? g.rows[clamp(i - dn, 0, g.rows.length - 1)] : n[1] + dn; }
    }
  }, true);
  const first = [...App.sel][0]; if (dn && first) Engine.preview(App.song, pattern().inst, first[1]);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w\-. ()]+/g, '_');
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function saveSong() { download(new Blob([JSON.stringify(App.song)], { type: 'application/json' }), App.song.title + '.sbox'); toast('saved!'); }
let exporting = false;
async function exportWav() {
  if (exporting) return;
  if (!songLength(App.song)) { toast('put a page on the song strip first'); return; }
  exporting = true; toast('recording a wav... (this takes a moment)');
  try { const blob = await SongKit.renderWav(App.song); download(blob, App.song.title + '.wav'); toast('wav exported!'); } catch (e) { console.error(e); toast('export failed: ' + e.message); }
  exporting = false;
}
function pickFile(accept, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (f) cb(f); };
  inp.click();
}
function openFile() {
  pickFile('.sbox,.wiggly,.json,.mid,.midi,.flp', async (f) => {
    const buf = await f.arrayBuffer();
    try {
      Player.stop();
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mid' || ext === 'midi') { setSong(SongKit.importMidi(buf)); App.song.title = f.name.replace(/\.\w+$/, ''); }
      else if (ext === 'flp') setSong(window.importFlp(buf, f.name.replace(/\.\w+$/, '')));
      else setSong(JSON.parse(new TextDecoder().decode(buf)));
      App.pat = 0; App.inst = 0; App.startBar = 0; App.arrScroll = 0; centerRoll();
      toast('opened ' + f.name);
    } catch (e) { console.error(e); toast('could not open: ' + e.message); }
  });
}
function openSf2() {
  pickFile('.sf2', async (f) => {
    toast('reading ' + f.name + '...');
    try {
      const buf = await f.arrayBuffer();
      const name = f.name.replace(/\.sf2$/i, '');
      const bank = SF2Bank.parse(name, buf);
      SF2Bank.store(name, buf);
      toast(`${bank.presets.length} sounds added to "your soundfonts"`);
    } catch (e) { toast('bad soundfont: ' + e.message); }
  });
}
function loadExample() {
  Player.stop();
  setSong(JSON.parse(JSON.stringify(EXAMPLE_SONG)));
  App.pat = 0;
  const lead = App.song.instruments.findIndex((i) => i.preset === 'syn_square');
  if (lead >= 0) { const bi = App.song.arrangement.bars.findIndex((r) => r.some((v) => v >= 0 && App.song.patterns[v].inst === lead)); if (bi >= 0) App.pat = App.song.arrangement.bars[bi].find((v) => v >= 0 && App.song.patterns[v].inst === lead); }
  App.inst = pattern().inst; App.startBar = 0; App.arrScroll = 0; centerRoll();
  toast('Paper Planes loaded - hit play on the boombox');
}

// ---------- menus & toasts ----------
function drawMenu() {
  if (!App.menu) return;
  const items = MENUS[App.menu.name];
  const w = Math.max(...items.map(([t]) => G.handW(t, 12))) + 22;
  const h = items.reduce((a, [t]) => a + (t === '-' ? 6 : 14), 8);
  const x = clamp(App.menu.x, 2, G.W - w - 4), y = App.menu.y + 2;
  region({ x: 0, y: 0, w: G.W, h: G.H }, { down: tap(() => { App.menu = null; }) });
  G.rect(x + 3, y + 3, w, h, INK); G.rect(x, y, w, h, PAPER); G.wrect(x, y, w, h, 0.5, INK, 0.7);
  let yy = y + 4;
  for (const [t, fn] of items) {
    if (t === '-') { G.wline(x + 6, yy + 3, x + w - 6, yy + 3, 0.5, INK, 0.6, 12); yy += 6; continue; }
    const r = { x: x + 1, y: yy, w: w - 2, h: 14 };
    const hot = inR(App.pointer, r);
    if (hot) { G.x.fillStyle = YELLOW; G.x.fillRect(x + 6, yy + 6, G.handW(t, 12) + 6, 7); }
    G.hand(t, x + 9, yy, 12, INK, hot ? 0.8 : 0.2);
    region(r, { cursor: 'pointer', down: tap(() => { App.menu = null; fn(); }) });
    yy += 14;
  }
}
function drawToast() {
  if (!App.toast) return;
  const age = App.t - App.toast.t; if (age > 2.4) { App.toast = null; return; }
  const msg = App.toast.msg, w = G.handW(msg, 13) + 18, x = Math.round(G.W / 2 - w / 2), y = Math.round(G.H * 0.42 + (age < 0.15 ? (0.15 - age) * 60 : 0));
  G.rect(x + 3, y + 3, w, 18, INK); G.rect(x, y, w, 18, YELLOW); G.wrect(x, y, w, 18, 0.5, INK, 0.8);
  tape(x - 6, y - 3, 14, 7, -0.4);
  G.hand(msg, x + 9, y + 2, 13, INK, 0.6);
}

// ---------- main loop ----------
const levelBuf = new Uint8Array(512);
function frame(ts) {
  App.t = ts / 1000;
  G.frame = Math.floor(ts / 120) % 3;
  App.regions = [];
  if (Engine.mixer && Player.playing) {
    Engine.mixer.analyser.getByteTimeDomainData(levelBuf);
    let m = 0; for (let i = 0; i < levelBuf.length; i++) m = Math.max(m, Math.abs(levelBuf[i] - 128));
    App.level = App.level * 0.7 + (m / 128) * 0.9;
  } else App.level *= 0.9;
  if (App.title) drawTitle();
  else {
    const L = layout();
    G.rect(0, 0, G.W, G.H, PAPER);
    G.x.fillStyle = G.pats.paper; G.x.fillRect(0, 0, G.W, G.H);
    drawTop(L);
    drawRoll(L);
    drawArr(L);
    drawRight(L);
    drawBottom(L);
    drawPopups();
    drawMenu();
    drawToast();
  }
  G.present();
  const h = hitAt(App.pointer);
  const cur = App.drag ? App.drag.cursor || G.screen.style.cursor : (h && h.cursor) || 'default';
  if (G.screen.style.cursor !== cur) G.screen.style.cursor = cur;
  requestAnimationFrame(frame);
}

function toLogical(e) {
  const r = G.screen.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) * (G.W / r.width)), y: Math.floor((e.clientY - r.top) * (G.H / r.height)) };
}
function bindInput() {
  const cv = G.screen;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = toLogical(e); App.pointer = p;
    const h = hitAt(p);
    if (h && h.down) {
      const d = h.down(p, e);
      if (d) { App.drag = d; d.cursor = d.cursor || h.cursor; cv.setPointerCapture(e.pointerId); }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toLogical(e); App.pointer = p;
    if (App.drag) { App.drag.move && App.drag.move(p, e); return; }
    App.hover = null;
    const h = hitAt(p); if (h && h.hover) h.hover(p);
  });
  const end = (e) => { if (App.drag) { const d = App.drag; App.drag = null; d.up && d.up(toLogical(e), e); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!App.drag) { App.hover = null; App.pointer = { x: -1, y: -1 }; } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const h = hitAt(toLogical(e)); if (h && h.wheel) h.wheel(e); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (App.title) { if (k === 'Enter' || k === ' ') { e.preventDefault(); startFresh(); } return; }
    if (k === 'Escape') { if (App.menu) App.menu = null; else if (App.popups.length) closePopup(); else App.sel.clear(); return; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod && k === 'c') { e.preventDefault(); copySel(); return; }
    if (mod && k === 'v') { e.preventDefault(); pasteSel(); return; }
    if (mod && k === 'd') { e.preventDefault(); newPattern(true); return; }
    if (mod && k === 's') { e.preventDefault(); saveSong(); return; }
    if (mod && k === 'o') { e.preventDefault(); openFile(); return; }
    if (e.code === 'NumpadAdd' || (!mod && (k === '+' || k === '='))) { e.preventDefault(); resizeNotes(1); return; }
    if (e.code === 'NumpadSubtract' || (!mod && (k === '-' || k === '_'))) { e.preventDefault(); resizeNotes(-1); return; }
    if (mod) return;
    if (k === ' ') { e.preventDefault(); play(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); nudge(-1, 0); return; }
    if (k === 'ArrowRight') { e.preventDefault(); nudge(1, 0); return; }
    if (k === 'ArrowUp') { e.preventDefault(); nudge(0, e.shiftKey ? 12 : 1); return; }
    if (k === 'ArrowDown') { e.preventDefault(); nudge(0, e.shiftKey ? -12 : -1); return; }
    if (k === 'b' || k === 'n') App.tool = 'stamp';
    if (k === 'e' || k === 'x') App.tool = 'scissors';
    if (k === 's' || k === 'l') App.tool = 'lasso';
    if (k === 'PageUp' || k === '[') selectPattern((App.pat - 1 + App.song.patterns.length) % App.song.patterns.length);
    if (k === 'PageDown' || k === ']') selectPattern((App.pat + 1) % App.song.patterns.length);
  });
  const fit = () => G.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', fit); fit();
}

function boot() {
  G.init(document.getElementById('screen'));
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('scribblebox.song.v2') || 'null'); } catch (e) { saved = null; }
  // the title page decides what to open; a song with notes in it can be picked up again
  if (saved && saved.patterns && saved.patterns.some((p) => p.notes && p.notes.length)) App.saved = saved;
  setSong(SongKit.newSong());
  centerRoll();
  bindInput();
  if (G.portrait) App.rowH = 12;
  SF2Bank.restore();
  // re-rasterise the handwriting once the web font arrives
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('16px "Gochi Hand"'), document.fonts.load('12px "Patrick Hand"')]).then(() => { G.handCache = {}; }).catch(() => {});
  requestAnimationFrame(frame);
}
window.addEventListener('DOMContentLoaded', boot);

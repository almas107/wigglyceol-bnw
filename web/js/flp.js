// FL Studio project (.flp) importer, a port of tools/flp2wiggly.py.
// Reads tempo, channel names, pattern notes and playlist clips; picks the
// closest built-in instrument for each channel by its name.

function importFlp(buf, title) {
  const d = new DataView(buf);
  const tag = (o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
  if (tag(0) !== 'FLhd') throw new Error('not an FL Studio project');
  const ppq = d.getUint16(12, true);
  let i = 14;
  if (tag(i) !== 'FLdt') throw new Error('missing FLdt chunk');
  i += 8;
  const text = (o, n) => { let s = ''; for (let k = 0; k + 1 < n; k += 2) { const c = d.getUint16(o + k, true); if (!c) break; s += String.fromCharCode(c); } return s; };
  let bpm = 120, ch = null, pat = null;
  const chans = {}, pats = {}, items = [];
  while (i < d.byteLength) {
    const id = d.getUint8(i++);
    let v = 0, o = 0, n = 0;
    if (id < 64) v = d.getUint8(i++);
    else if (id < 128) { v = d.getUint16(i, true); i += 2; }
    else if (id < 192) { v = d.getUint32(i, true); i += 4; }
    else { let s = 0, b; do { b = d.getUint8(i++); n |= (b & 0x7f) << s; s += 7; } while (b & 0x80); o = i; i += n; }
    if (id === 156) bpm = v / 1000;
    else if (id === 64) { ch = v; chans[ch] = { name: '', plugin: '', sample: false }; }
    else if (id === 201 && chans[ch] && !chans[ch].plugin) chans[ch].plugin = text(o, n);
    else if (id === 203 && chans[ch] && !chans[ch].name) chans[ch].name = text(o, n);
    else if (id === 196 && chans[ch]) chans[ch].sample = true;
    else if (id === 65) pat = v;
    else if (id === 224) {
      const list = (pats[pat] = pats[pat] || []);
      for (let k = o; k + 24 <= o + n; k += 24) list.push([d.getUint32(k, true), d.getUint16(k + 6, true), d.getUint32(k + 8, true), d.getUint16(k + 12, true), d.getUint8(k + 21)]);
    } else if (id === 233) {
      const size = n % 60 === 0 && n % 32 !== 0 ? 60 : 32;
      for (let k = o; k + size <= o + n; k += size) {
        const base = d.getUint16(k + 4, true), idx = d.getUint16(k + 6, true);
        if (idx > base) items.push([d.getUint32(k, true), idx - base, d.getUint32(k + 8, true), d.getInt32(k + 24, true), d.getInt32(k + 28, true)]);
      }
    }
  }
  const flat = {};
  for (const [pos, pi, len, so, eo] of items) {
    const start = so >= 0 ? so : 0, end = eo >= 0 ? eo : start + len;
    for (const [npos, c, nlen, key, vel] of pats[pi] || []) {
      if (npos < start || npos >= end) continue;
      const t = pos + npos - start;
      (flat[c] = flat[c] || {})[t + ':' + key] = [t, key, nlen, vel];
    }
  }
  const tps = ppq / 4;
  const used = Object.keys(flat).map(Number).sort((a, b) => a - b).filter((c) => !(chans[c] && chans[c].sample)).slice(0, SongKit.MAX_CHANNELS);
  const song = { title: title || 'fl studio import', bpm: Math.round(bpm * 100) / 100, patternSize: 16, channels: Math.max(8, used.length), instruments: [], patterns: [], arrangement: { bars: [] } };
  const bars = [];
  used.forEach((c, slot) => {
    const info = chans[c] || { name: 'channel ' + c, plugin: '' };
    song.instruments.push({ name: (info.name || info.plugin || 'channel ' + c).toLowerCase().slice(0, 18), preset: guessPreset(info.name, info.plugin), vol: 0.6, look: slot % 8 });
    const byBar = {};
    for (const [t, key, nlen, vel] of Object.values(flat[c])) {
      const step = Math.round(t / tps), b = Math.floor(step / 16);
      (byBar[b] = byBar[b] || []).push([step % 16, key, Math.max(1, Math.round(nlen / tps)), Math.round((Math.min(vel, 128) / 128) * 100) / 100]);
    }
    const seen = {};
    for (const b of Object.keys(byBar).map(Number).sort((x, y) => x - y)) {
      const sig = JSON.stringify(byBar[b].sort((x, y) => x[0] - y[0] || x[1] - y[1]));
      if (seen[sig] == null) { seen[sig] = song.patterns.length; song.patterns.push({ inst: slot, notes: byBar[b] }); }
      (bars[b] = bars[b] || new Array(SongKit.MAX_CHANNELS).fill(-1))[slot] = seen[sig];
    }
  });
  for (let k = 0; k < bars.length; k++) bars[k] = bars[k] || new Array(SongKit.MAX_CHANNELS).fill(-1);
  song.arrangement.bars = bars;
  song.arrangement.loop = [0, Math.max(1, bars.length)];
  return song;
}

// Best built-in match for an FL channel: exact program name first, then keywords.
function guessPreset(name, plugin) {
  const n = (name || '').toLowerCase().trim(), pl = (plugin || '').toLowerCase();
  const list = Synth.PRESET_LIST;
  const exact = list.find((p) => p.name.toLowerCase() === n);
  if (exact) return exact.id;
  if (/^\d{3}$/.test(n) && Synth.P['fm_' + n]) return 'fm_' + n;
  const kits = { brush: 'kit_brush', techno: 'kit_techno', '808': 'kit_electronic', electronic: 'kit_electronic', power: 'kit_power', orchestra: 'kit_orchestra', drum: 'kit_standard', kit: 'kit_standard', '4opfm': 'kit_fm' };
  for (const [k, id] of Object.entries(kits)) if (n.includes(k)) return id;
  if (pl.includes('3x osc')) return n.includes('square') ? 'syn_square' : n.includes('sine') ? 'syn_sine' : 'syn_saw';
  if (n.includes('nes') || pl.includes('nes')) return 'chip_square';
  const partial = list.find((p) => n && p.name.toLowerCase().includes(n));
  if (partial) return partial.id;
  const words = n.split(/\W+/).filter((w) => w.length > 2);
  const fuzzy = list.find((p) => words.some((w) => p.name.toLowerCase().includes(w)));
  return fuzzy ? fuzzy.id : 'piano1';
}

window.importFlp = importFlp;

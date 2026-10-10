// Minimal SoundFont 2 player: lets you drop in your own .sf2 banks
// next to the built-in synthesized ones. Banks are kept in IndexedDB so they
// survive a reload; songs reference them as "sf2:<bank>:<preset index>".

const SF2Bank = {
  banks: {},
  parse(name, arrayBuffer) {
    const d = new DataView(arrayBuffer);
    const fourcc = (o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
    if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');
    const chunks = {};
    const walk = (start, end) => {
      let o = start;
      while (o + 8 <= end) {
        const id = fourcc(o), len = d.getUint32(o + 4, true);
        if (id === 'LIST') walk(o + 12, o + 8 + len); else chunks[id] = { o: o + 8, len };
        o += 8 + len + (len & 1);
      }
    };
    walk(12, d.byteLength);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = d.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const recs = (id, size, fn) => { const c = chunks[id], out = []; for (let o = c.o; o + size <= c.o + c.len; o += size) out.push(fn(o)); return out; };
    const phdr = recs('phdr', 38, (o) => ({ name: str(o, 20), preset: d.getUint16(o + 20, true), bank: d.getUint16(o + 22, true), bag: d.getUint16(o + 24, true) }));
    const bag = (id) => recs(id, 4, (o) => d.getUint16(o, true));
    const gen = (id) => recs(id, 4, (o) => ({ op: d.getUint16(o, true), s: d.getInt16(o + 2, true), lo: d.getUint8(o + 2), hi: d.getUint8(o + 3) }));
    const pbag = bag('pbag'), pgen = gen('pgen'), ibag = bag('ibag'), igen = gen('igen');
    const inst = recs('inst', 22, (o) => ({ name: str(o, 20), bag: d.getUint16(o + 20, true) }));
    const shdr = recs('shdr', 46, (o) => ({ name: str(o, 20), start: d.getUint32(o + 20, true), end: d.getUint32(o + 24, true), ls: d.getUint32(o + 28, true), le: d.getUint32(o + 32, true), rate: d.getUint32(o + 36, true), root: d.getUint8(o + 40), corr: d.getInt8(o + 41), type: d.getUint16(o + 44, true) }));
    const smpl = chunks.smpl;
    const zones = (bags, gens, from, to) => {
      const out = [];
      for (let b = from; b < to; b++) {
        const z = {};
        for (let g = bags[b]; g < bags[b + 1]; g++) z[gens[g].op] = gens[g];
        out.push(z);
      }
      return out;
    };
    const presets = [];
    for (let i = 0; i < phdr.length - 1; i++) {
      const ph = phdr[i];
      const pz = zones(pbag, pgen, ph.bag, phdr[i + 1].bag);
      const pglobal = pz.length && pz[0][41] == null ? pz.shift() : {};
      const regions = [];
      for (const z of pz) {
        const ii = z[41] ? z[41].s : null;
        if (ii == null || !inst[ii + 1]) continue;
        const iz = zones(ibag, igen, inst[ii].bag, inst[ii + 1].bag);
        const iglobal = iz.length && iz[0][53] == null ? iz.shift() : {};
        const pk = z[43] || pglobal[43];
        for (const r of iz) {
          const G = (op) => (r[op] != null ? r[op] : iglobal[op]);
          const add = (op) => (z[op] ? z[op].s : pglobal[op] ? pglobal[op].s : 0);
          const s = shdr[G(53).s]; if (!s) continue;
          const kr = G(43), vr = G(44);
          let lo = kr ? kr.lo : 0, hi = kr ? kr.hi : 127;
          if (pk) { lo = Math.max(lo, pk.lo); hi = Math.min(hi, pk.hi); }
          if (lo > hi) continue;
          const val = (op, dflt) => { const g = G(op); return (g ? g.s : dflt) + add(op); };
          regions.push({
            lo, hi, vlo: vr ? vr.lo : 0, vhi: vr ? vr.hi : 127, sample: s,
            root: G(58) && G(58).s >= 0 ? G(58).s : s.root,
            tune: val(51, 0) * 100 + val(52, 0) + s.corr,
            loop: ((G(54) ? G(54).s : 0) & 1) === 1,
            atten: Math.max(0, val(48, 0)) / 10, pan: val(17, 0) / 500,
            attack: Math.pow(2, val(34, -12000) / 1200), release: Math.min(6, Math.pow(2, val(38, -12000) / 1200)),
          });
        }
      }
      if (regions.length) presets.push({ name: ph.name.trim() || 'preset ' + i, bank: ph.bank, program: ph.preset, regions });
    }
    presets.sort((a, b) => a.bank - b.bank || a.program - b.program);
    const bank = { name, presets, smplOffset: smpl.o, data: arrayBuffer, buffers: new WeakMap() };
    this.banks[name] = bank;
    return bank;
  },
  buffer(ctx, bank, s) {
    let m = bank.buffers.get(ctx); if (!m) bank.buffers.set(ctx, (m = new Map()));
    if (m.has(s)) return m.get(s);
    const n = Math.max(1, s.end - s.start), b = ctx.createBuffer(1, n, Math.max(3000, Math.min(192000, s.rate || 44100)));
    const ch = b.getChannelData(0), dv = new DataView(bank.data, bank.smplOffset + s.start * 2, n * 2);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    m.set(s, b); return b;
  },
  play(ctx, out, inst, note, t0, dur, vel) {
    const [, bankName, idx] = inst.preset.split(':');
    const bank = this.banks[bankName]; if (!bank) return 0;
    const preset = bank.presets[+idx]; if (!preset) return 0;
    const v = Math.round(vel * 127);
    const regs = preset.regions.filter((r) => note >= r.lo && note <= r.hi && v >= r.vlo && v <= r.vhi);
    let end = t0 + dur;
    for (const r of regs.slice(0, 4)) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(ctx, bank, r.sample);
      src.playbackRate.value = Math.pow(2, ((note - r.root) * 100 + r.tune) / 1200);
      src.detune.value = (inst.detune || 0) + (inst.octave || 0) * 1200;
      if (r.loop && r.sample.le > r.sample.ls) { src.loop = true; src.loopStart = (r.sample.ls - r.sample.start) / src.buffer.sampleRate; src.loopEnd = (r.sample.le - r.sample.start) / src.buffer.sampleRate; }
      const g = ctx.createGain(), pk = 0.5 * Math.pow(vel, 1.5) * Math.pow(10, -r.atten / 20);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(pk, t0 + Math.max(0.002, Math.min(2, r.attack)));
      const rel = Math.max(0.03, r.release), off = t0 + dur;
      g.gain.setTargetAtTime(0, off, rel / 4);
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, r.pan));
      src.connect(g); g.connect(pan); pan.connect(out);
      src.start(t0); src.stop(off + rel * 1.5 + 0.05);
      end = Math.max(end, off + rel * 1.5);
    }
    return regs.length ? end : 0;
  },
  // IndexedDB persistence (best effort: private windows may refuse).
  db() {
    return new Promise((res, rej) => {
      try { const r = indexedDB.open('wigglyceol', 1); r.onupgradeneeded = () => r.result.createObjectStore('sf2'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
    });
  },
  async store(name, buf) { try { const db = await this.db(); db.transaction('sf2', 'readwrite').objectStore('sf2').put(buf, name); } catch (e) { /* not persisted */ } },
  async restore() {
    try {
      const db = await this.db();
      await new Promise((res) => {
        const st = db.transaction('sf2').objectStore('sf2'), req = st.openCursor();
        req.onsuccess = () => { const c = req.result; if (!c) return res(); try { this.parse(c.key, c.value); } catch (e) { /* skip broken */ } c.continue(); };
        req.onerror = () => res();
      });
    } catch (e) { /* no storage */ }
  },
};
window.SF2Bank = SF2Bank;

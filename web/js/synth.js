// WigglyCeol sound engine.
// Every built-in "soundfont" is a synthesized recreation (no sampled data is
// shipped), named after the banks listed in the DELTARUNE sample sheet.
// Real .sf2 files can be layered on top at runtime, see sf2.js.
(() => {

const A4 = 440;
const mtof = (n) => A4 * Math.pow(2, (n - 69) / 12);

// ---------- presets ----------
// Tone presets: osc[] (type, detune cents, gain, oct), env {a,d,s,r},
// filter {type,f,q,track,env,decay}, fm {ratio,index,decay,sus}, vib {rate,depth,delay},
// pitch {amt (semitones), t}, noise (gain,  decay) for hammer/breath transients.
const P = {};
function def(id, group, name, o) { P[id] = Object.assign({ id, group, name, kind: 'tone' }, o); }
function kit(id, group, name, o) { P[id] = Object.assign({ id, group, name, kind: 'kit' }, o); }

// --- SGM V2.01 style General MIDI bank
def('sgm_piano1', 'SGM V2.01', 'Piano 1', { osc: [{ type: 'piano', gain: 1 }, { type: 'piano', detune: 4, gain: .5 }], env: { a: .002, d: 1.6, s: 0, r: .35 }, filter: { type: 'lowpass', f: 5, track: true, q: .4, env: 4, decay: .5 }, noise: { gain: .25, decay: .02, f: 3000 } });
def('sgm_piano3', 'SGM V2.01', 'Piano 3', { osc: [{ type: 'piano', gain: 1 }, { type: 'piano', detune: -7, gain: .6 }], env: { a: .002, d: 1.2, s: 0, r: .3 }, filter: { type: 'lowpass', f: 7, track: true, q: .5, env: 3, decay: .4 }, noise: { gain: .3, decay: .015, f: 4000 } });
def('sgm_honky', 'SGM V2.01', 'Honky-Tonk', { osc: [{ type: 'piano', gain: 1 }, { type: 'piano', detune: 18, gain: .9 }], env: { a: .002, d: 1.3, s: 0, r: .3 }, filter: { type: 'lowpass', f: 6, track: true, q: .4, env: 3, decay: .4 }, noise: { gain: .25, decay: .02, f: 3000 } });
def('sgm_epiano', 'SGM V2.01', 'E.Piano 1', { fm: { ratio: 1, index: 2.2, decay: .5, sus: .15 }, osc: [{ type: 'sine', gain: 1 }, { type: 'sine', detune: 6, gain: .5 }], env: { a: .003, d: 2, s: .05, r: .3 } });
def('sgm_celesta', 'SGM V2.01', 'Celesta', { fm: { ratio: 3.5, index: 1.4, decay: .25, sus: 0 }, osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .001, d: 1.2, s: 0, r: .4 } });
def('sgm_glock', 'SGM V2.01', 'Glockenspiel', { fm: { ratio: 2.76, index: 1.1, decay: .4, sus: 0 }, osc: [{ type: 'sine', oct: 2, gain: 1 }], env: { a: .001, d: 1.5, s: 0, r: .5 } });
def('sgm_musicbox', 'SGM V2.01', 'Music Box', { fm: { ratio: 5.2, index: .9, decay: .2, sus: 0 }, osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .001, d: 1.8, s: 0, r: .6 } });
def('sgm_vibes', 'SGM V2.01', 'Vibraphone', { fm: { ratio: 4, index: .6, decay: .3, sus: 0 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .002, d: 2.4, s: 0, r: .5 }, trem: { rate: 5, depth: .35 } });
def('sgm_tubular', 'SGM V2.01', 'Tubular Bells', { fm: { ratio: 3.01, index: 2.4, decay: 1, sus: .1 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .002, d: 3, s: 0, r: 1 } });
def('sgm_dulcimer', 'SGM V2.01', 'Dulcimer', { osc: [{ type: 'sawtooth', gain: .6 }, { type: 'sawtooth', detune: 9, gain: .6 }], env: { a: .001, d: .9, s: 0, r: .3 }, filter: { type: 'lowpass', f: 3, track: true, q: 2, env: 6, decay: .15 } });
def('sgm_organ', 'SGM V2.01', 'Organ 1', { osc: [{ type: 'organ', gain: 1 }], env: { a: .01, d: .1, s: .9, r: .08 }, trem: { rate: 6, depth: .12 } });
def('sgm_accordion', 'SGM V2.01', 'Accordion', { osc: [{ type: 'square', gain: .5 }, { type: 'sawtooth', detune: 12, gain: .4 }], env: { a: .04, d: .2, s: .8, r: .12 }, filter: { type: 'lowpass', f: 4, track: true, q: 1 }, trem: { rate: 5.5, depth: .1 } });
def('sgm_acbass', 'SGM V2.01', 'Acoustic Bass', { osc: [{ type: 'triangle', gain: 1 }, { type: 'sine', gain: .6 }], env: { a: .005, d: 1.1, s: .1, r: .15 }, filter: { type: 'lowpass', f: 4, track: true, q: 1, env: 3, decay: .08 } });
def('sgm_fingerbass', 'SGM V2.01', 'Fingered Bass', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'sine', gain: .8 }], env: { a: .004, d: .9, s: .25, r: .1 }, filter: { type: 'lowpass', f: 3, track: true, q: 1.5, env: 4, decay: .1 } });
def('sgm_pickbass', 'SGM V2.01', 'Picked Bass', { osc: [{ type: 'sawtooth', gain: .8 }, { type: 'square', gain: .3 }], env: { a: .002, d: .8, s: .2, r: .1 }, filter: { type: 'lowpass', f: 4, track: true, q: 2, env: 6, decay: .06 } });
def('sgm_slapbass', 'SGM V2.01', 'Slap Bass 1', { osc: [{ type: 'sawtooth', gain: .8 }, { type: 'square', gain: .4 }], env: { a: .001, d: .6, s: .15, r: .1 }, filter: { type: 'lowpass', f: 6, track: true, q: 4, env: 8, decay: .05 }, noise: { gain: .3, decay: .01, f: 2000 } });
def('sgm_acidbass', 'SGM V2.01', 'Acid Bass', { osc: [{ type: 'sawtooth', gain: 1 }], env: { a: .002, d: .5, s: .55, r: .08 }, filter: { type: 'lowpass', f: 2, track: true, q: 9, env: 10, decay: .14 } });
def('sgm_fretless', 'SGM V2.01', 'Fretless Bass', { osc: [{ type: 'triangle', gain: 1 }, { type: 'sawtooth', gain: .25 }], env: { a: .02, d: 1, s: .5, r: .15 }, filter: { type: 'lowpass', f: 3, track: true, q: 1 }, vib: { rate: 5, depth: 8, delay: .2 } });
def('sgm_mutedgtr', 'SGM V2.01', 'Muted Guitar', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'square', gain: .3 }], env: { a: .001, d: .25, s: 0, r: .05 }, filter: { type: 'lowpass', f: 3, track: true, q: 2, env: 3, decay: .05 } });
def('sgm_nylon', 'SGM V2.01', 'Nylon Guitar', { osc: [{ type: 'pluck', gain: 1 }], env: { a: .001, d: 1.4, s: 0, r: .2 }, filter: { type: 'lowpass', f: 4, track: true, q: .8, env: 3, decay: .2 } });
def('sgm_distgtr', 'SGM V2.01', 'Distortion Guitar', { osc: [{ type: 'sawtooth', gain: .8 }, { type: 'sawtooth', detune: 14, gain: .8 }, { type: 'square', oct: -1, gain: .4 }], env: { a: .004, d: .3, s: .8, r: .12 }, drive: 12, filter: { type: 'lowpass', f: 2600, q: 1.5 } });
def('sgm_strings', 'SGM V2.01', 'Strings', { osc: [{ type: 'sawtooth', detune: -9, gain: .45 }, { type: 'sawtooth', detune: 8, gain: .45 }, { type: 'sawtooth', detune: 1, oct: -1, gain: .2 }], env: { a: .12, d: .3, s: .85, r: .45 }, filter: { type: 'lowpass', f: 3.5, track: true, q: .5 }, vib: { rate: 5.2, depth: 6, delay: .25 } });
def('sgm_tremstr', 'SGM V2.01', 'Tremolo Strings', { osc: [{ type: 'sawtooth', detune: -8, gain: .5 }, { type: 'sawtooth', detune: 8, gain: .5 }], env: { a: .05, d: .2, s: .9, r: .35 }, filter: { type: 'lowpass', f: 4, track: true, q: .5 }, trem: { rate: 11, depth: .7 } });
def('sgm_pizz', 'SGM V2.01', 'Pizzicato Strings', { osc: [{ type: 'sawtooth', detune: -6, gain: .5 }, { type: 'triangle', detune: 6, gain: .6 }], env: { a: .002, d: .35, s: 0, r: .12 }, filter: { type: 'lowpass', f: 3, track: true, q: 1, env: 3, decay: .06 } });
def('sgm_violin', 'SGM V2.01', 'Violin', { osc: [{ type: 'sawtooth', gain: .8 }, { type: 'sawtooth', detune: 5, gain: .3 }], env: { a: .07, d: .2, s: .85, r: .25 }, filter: { type: 'peaking', f: 2.5, track: true, q: 2, gain: 6 }, vib: { rate: 5.8, depth: 14, delay: .2 } });
def('sgm_choir', 'SGM V2.01', 'Choir Aahs', { osc: [{ type: 'sawtooth', detune: -10, gain: .4 }, { type: 'sawtooth', detune: 10, gain: .4 }, { type: 'triangle', gain: .3 }], env: { a: .2, d: .3, s: .9, r: .5 }, formant: [750, 1150, 2600], vib: { rate: 4.6, depth: 9, delay: .3 } });
def('sgm_spacevoice', 'SGM V2.01', 'Space Voice', { osc: [{ type: 'triangle', gain: .7 }, { type: 'sawtooth', detune: 7, gain: .2 }], env: { a: .25, d: .4, s: .8, r: .8 }, formant: [400, 900, 2400], vib: { rate: 4, depth: 12, delay: .2 } });
def('sgm_trumpet', 'SGM V2.01', 'Trumpet', { osc: [{ type: 'sawtooth', gain: 1 }], env: { a: .03, d: .2, s: .8, r: .12 }, filter: { type: 'lowpass', f: 2, track: true, q: 1.5, env: 2.5, decay: .12 }, vib: { rate: 5.5, depth: 8, delay: .3 } });
def('sgm_tuba', 'SGM V2.01', 'Tuba', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'sine', gain: .7 }], env: { a: .04, d: .2, s: .8, r: .12 }, filter: { type: 'lowpass', f: 2, track: true, q: 1, env: 1.5, decay: .1 } });
def('sgm_clarinet', 'SGM V2.01', 'Clarinet', { osc: [{ type: 'square', gain: .8 }], env: { a: .03, d: .1, s: .85, r: .1 }, filter: { type: 'lowpass', f: 3, track: true, q: .7 }, vib: { rate: 5, depth: 5, delay: .35 } });
def('sgm_oboe', 'SGM V2.01', 'Oboe', { osc: [{ type: 'pulse25', gain: .8 }], env: { a: .03, d: .1, s: .85, r: .1 }, filter: { type: 'bandpass', f: 4, track: true, q: .9 }, vib: { rate: 5.4, depth: 7, delay: .3 } });
def('sgm_flute', 'SGM V2.01', 'Flute', { osc: [{ type: 'sine', gain: 1 }, { type: 'triangle', oct: 1, gain: .15 }], env: { a: .06, d: .1, s: .9, r: .15 }, noise: { gain: .06, sus: true, f: 2500 }, vib: { rate: 5, depth: 9, delay: .3 } });
def('sgm_recorder', 'SGM V2.01', 'Recorder', { osc: [{ type: 'sine', gain: 1 }, { type: 'triangle', gain: .2 }], env: { a: .03, d: .1, s: .9, r: .1 }, noise: { gain: .04, sus: true, f: 3000 } });
def('sgm_bottle', 'SGM V2.01', 'Bottle Blow', { osc: [{ type: 'sine', gain: 1 }], env: { a: .08, d: .1, s: .85, r: .2 }, noise: { gain: .15, sus: true, f: 1200 }, vib: { rate: 4.5, depth: 6, delay: .2 } });
def('sgm_timpani', 'SGM V2.01', 'Timpani', { osc: [{ type: 'sine', gain: 1 }, { type: 'triangle', detune: 30, gain: .4 }], env: { a: .002, d: 1.4, s: 0, r: .4 }, pitch: { amt: 1, t: .05 }, noise: { gain: .4, decay: .05, f: 400 } });
def('sgm_impact', 'SGM V2.01', 'Impact Hit', { osc: [{ type: 'sawtooth', oct: -1, gain: .6 }, { type: 'square', gain: .4 }], env: { a: .001, d: 1.5, s: 0, r: .6 }, pitch: { amt: 5, t: .12 }, noise: { gain: .7, decay: .4, f: 900 } });
def('sgm_mgsquare', 'SGM V2.01', 'MG Square', { osc: [{ type: 'square', gain: .7 }, { type: 'square', detune: 6, gain: .3 }], env: { a: .005, d: .2, s: .8, r: .08 }, filter: { type: 'lowpass', f: 5, track: true, q: 1 } });
def('sgm_basslead', 'SGM V2.01', 'Bass & Lead', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'square', detune: 5, gain: .4 }], env: { a: .003, d: .4, s: .6, r: .1 }, filter: { type: 'lowpass', f: 3, track: true, q: 4, env: 4, decay: .15 } });
def('sgm_synthstr', 'SGM V2.01', 'Synth Strings', { osc: [{ type: 'sawtooth', detune: -14, gain: .45 }, { type: 'sawtooth', detune: 14, gain: .45 }], env: { a: .25, d: .3, s: .8, r: .6 }, filter: { type: 'lowpass', f: 3, track: true, q: 2 } });

// --- NES VST 1.1 style 2A03 channels
def('nes_pulse12', 'NES VST 1.1', '12% Pulse', { osc: [{ type: 'pulse12', gain: .8 }], env: { a: .001, d: .1, s: .9, r: .03 }, vib: { rate: 6, depth: 0, delay: .2 } });
def('nes_pulse25', 'NES VST 1.1', '25% Pulse', { osc: [{ type: 'pulse25', gain: .8 }], env: { a: .001, d: .1, s: .9, r: .03 } });
def('nes_square', 'NES VST 1.1', 'Square', { osc: [{ type: 'square', gain: .7 }], env: { a: .001, d: .1, s: .9, r: .03 } });
def('nes_duty', 'NES VST 1.1', 'Duty Cycle', { osc: [{ type: 'pulse25', gain: .6 }], env: { a: .001, d: .1, s: .9, r: .03 }, vib: { rate: 6, depth: 14, delay: .15 } });
def('nes_triangle', 'NES VST 1.1', 'Triangle', { osc: [{ type: 'nestri', gain: 1.1 }], env: { a: .001, d: .1, s: 1, r: .02 } });
def('nes_noise_long', 'NES VST 1.1', 'Noise (32767 Bit)', { osc: [{ type: 'lfsr_long', gain: .6 }], env: { a: .001, d: .15, s: .3, r: .05 } });
def('nes_noise_short', 'NES VST 1.1', 'Noise (93 Bit)', { osc: [{ type: 'lfsr_short', gain: .5 }], env: { a: .001, d: .15, s: .3, r: .05 } });

// --- PC-98 YM2608 (4-op FM) patches
def('pc98_000', 'pc98_ym2608', '000', { fm: { ratio: 1, index: 3, decay: .3, sus: .4 }, osc: [{ type: 'sawtooth', gain: .3 }, { type: 'sine', gain: .8 }], env: { a: .02, d: .3, s: .7, r: .1 } });
def('pc98_034', 'pc98_ym2608', '034', { fm: { ratio: 1, index: 4, decay: .18, sus: .25 }, osc: [{ type: 'sine', gain: 1 }, { type: 'sine', oct: -1, gain: .4 }], env: { a: .002, d: .5, s: .55, r: .07 }, vib: { rate: 5.5, depth: 6, delay: .25 } });
def('pc98_071', 'pc98_ym2608', '071', { fm: { ratio: 2, index: 1, decay: .4, sus: .3 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .04, d: .2, s: .8, r: .1 } });
def('pc98_079', 'pc98_ym2608', '079', { fm: { ratio: 4, index: 2.2, decay: .12, sus: .05 }, osc: [{ type: 'sine', gain: 1 }, { type: 'sine', detune: 7, gain: .3 }], env: { a: .001, d: .6, s: .05, r: .2 }, vib: { rate: 5.5, depth: 5, delay: .2 } });
def('pc98_082', 'pc98_ym2608', '082', { fm: { ratio: 1, index: 2, decay: .5, sus: .6 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .005, d: .3, s: .8, r: .1 }, vib: { rate: 6, depth: 10, delay: .25 } });
def('pc98_084', 'pc98_ym2608', '084', { fm: { ratio: .5, index: 3, decay: .6, sus: .7 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .003, d: .3, s: .8, r: .1 } });
def('pc98_105', 'pc98_ym2608', '105', { fm: { ratio: 3, index: 3, decay: .08, sus: 0 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .001, d: .5, s: 0, r: .1 } });

// --- 3x Osc (FL Studio)
def('osc3_square', '3x Osc', 'Square', { osc: [{ type: 'square', gain: .5 }, { type: 'square', detune: -7, gain: .35 }, { type: 'square', oct: -1, detune: 5, gain: .2 }], env: { a: .002, d: .1, s: .9, r: .06 }, vib: { rate: 5.5, depth: 10, delay: .22 } });
def('osc3_saw', '3x Osc', 'Saw', { osc: [{ type: 'sawtooth', gain: .45 }, { type: 'sawtooth', detune: -9, gain: .4 }, { type: 'sawtooth', oct: -1, detune: 6, gain: .25 }], env: { a: .002, d: .1, s: .9, r: .06 }, filter: { type: 'lowpass', f: 5200, q: .7 }, vib: { rate: 5.5, depth: 10, delay: .22 } });
def('osc3_sine', '3x Osc', 'Sine', { osc: [{ type: 'sine', gain: .8 }, { type: 'sine', oct: 1, gain: .2 }, { type: 'sine', oct: 2, gain: .08 }], env: { a: .005, d: .1, s: .9, r: .1 } });
def('osc3_noise', '3x Osc', 'Noise', { osc: [{ type: 'noise', gain: .5 }], env: { a: .01, d: .2, s: .6, r: .2 }, filter: { type: 'bandpass', f: 2, track: true, q: 2 } });

// --- assorted game banks from the sheet
def('evermore_bell', 'Secret Of Evermore', 'bell', { fm: { ratio: 3.5, index: 3, decay: .5, sus: .05 }, osc: [{ type: 'sine', gain: 1 }], env: { a: .002, d: 2.5, s: 0, r: 1 } });
def('evermore_string', 'Secret Of Evermore', 'string', { osc: [{ type: 'sawtooth', detune: -12, gain: .45 }, { type: 'sawtooth', detune: 12, gain: .45 }], env: { a: .4, d: .5, s: .8, r: 1 }, filter: { type: 'lowpass', f: 2.5, track: true, q: 1 } });
def('evermore_voice', 'Secret Of Evermore', 'voice', { osc: [{ type: 'triangle', gain: .7 }, { type: 'sawtooth', gain: .2 }], env: { a: .3, d: .4, s: .8, r: .8 }, formant: [500, 950, 2500] });
def('kirby_celesta', "Kirby's Dream Land 3", 'Celesta', { fm: { ratio: 3, index: 1, decay: .2, sus: 0 }, osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .001, d: .9, s: 0, r: .3 } });
def('kirby_strings', "Kirby's Dream Land 3", 'Strings', { osc: [{ type: 'sawtooth', detune: -6, gain: .5 }, { type: 'sawtooth', detune: 6, gain: .5 }], env: { a: .08, d: .3, s: .8, r: .3 }, filter: { type: 'lowpass', f: 2.5, track: true, q: 1 }, crush: 6 });
def('kirby_synthlead', "Kirby's Dream Land 3", 'SynthLead', { osc: [{ type: 'pulse25', gain: .7 }, { type: 'sawtooth', detune: 8, gain: .2 }], env: { a: .005, d: .2, s: .8, r: .1 }, vib: { rate: 6, depth: 12, delay: .2 }, crush: 6 });
def('eb_mellowpiano', 'Earthbound', 'Mellow Piano', { osc: [{ type: 'piano', gain: 1 }], env: { a: .003, d: 1.4, s: 0, r: .4 }, filter: { type: 'lowpass', f: 2.5, track: true, q: .5 }, crush: 5 });
def('eb_giygas', 'Earthbound', 'Giygas Static', { osc: [{ type: 'noise', gain: .4 }, { type: 'sawtooth', gain: .2 }], env: { a: .2, d: .5, s: .8, r: .6 }, filter: { type: 'bandpass', f: 1, track: true, q: 6 }, vib: { rate: 13, depth: 60, delay: 0 }, crush: 3 });
def('thinst_musicbox', 'THInst', 'Music Box', { fm: { ratio: 6, index: 1.2, decay: .15, sus: 0 }, osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .001, d: 1.6, s: 0, r: .5 } });
def('thinst_tinker', 'THInst', 'Tinker Bell', { fm: { ratio: 7, index: 1.8, decay: .1, sus: 0 }, osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .001, d: 1.1, s: 0, r: .4 } });
def('thinst_harpsi', 'THInst', 'Main Harpsi Stereo', { osc: [{ type: 'pulse12', gain: .5 }, { type: 'sawtooth', detune: 5, gain: .4 }], env: { a: .001, d: .9, s: 0, r: .2 }, filter: { type: 'lowpass', f: 6, track: true, q: 2, env: 4, decay: .1 } });

// --- drum kits (GM note map)
kit('kit_standard', 'SGM V2.01', 'STANDARD 1', { style: 'standard' });
kit('kit_power', 'SGM V2.01', 'POWER', { style: 'power' });
kit('kit_electronic', 'SGM V2.01', 'ELECTRONIC', { style: 'electronic' });
kit('kit_techno', 'SGM V2.01', 'TECHNO', { style: 'techno' });
kit('kit_brush', 'SGM V2.01', 'BRUSH', { style: 'brush' });
kit('kit_orchestra', 'SGM V2.01', 'ORCHESTRA', { style: 'orchestra' });
kit('kit_rock', 'JD_RockKit1', 'JD_RockKit 1', { style: 'power' });
kit('fm4op_perc', '4OPFM', '4-Op FM Percussion1', { style: 'fm' });
kit('kit_nes', 'NES VST 1.1', 'NES Drums', { style: 'nes' });

// --- extra recipes used by the sheet bank
def('marimba', 'Basics', 'Marimba', { fm: { ratio: 4, index: .8, decay: .05, sus: 0 }, osc: [{ type: 'sine', gain: 1 }, { type: 'sine', oct: 2, gain: .15 }], env: { a: .001, d: .5, s: 0, r: .15 } });
def('synthbass', 'Basics', 'Synth Bass', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'square', detune: -8, gain: .5 }], env: { a: .002, d: .4, s: .6, r: .08 }, filter: { type: 'lowpass', f: 3, track: true, q: 5, env: 6, decay: .12 } });
def('sax', 'Basics', 'Sax', { osc: [{ type: 'sawtooth', gain: .7 }, { type: 'square', gain: .25 }], env: { a: .04, d: .2, s: .8, r: .12 }, filter: { type: 'bandpass', f: 3, track: true, q: 1.2 }, noise: { gain: .08, sus: true, f: 1800 }, vib: { rate: 5.2, depth: 12, delay: .25 } });
def('harp', 'Basics', 'Harp', { osc: [{ type: 'pluck', gain: 1 }, { type: 'sine', gain: .5 }], env: { a: .002, d: 1.8, s: 0, r: .5 }, filter: { type: 'lowpass', f: 5, track: true, q: .5 } });
def('rounded_saw', 'Basics', 'Rounded Saw', { osc: [{ type: 'sawtooth', gain: .6 }, { type: 'sawtooth', detune: 9, gain: .4 }], env: { a: .003, d: .1, s: .9, r: .08 }, filter: { type: 'lowpass', f: 2.5, track: true, q: .6 }, vib: { rate: 5.5, depth: 8, delay: .25 } });
def('nes_pulse6', 'NES VST 1.1', '6% Pulse', { osc: [{ type: 'pulse06', gain: .8 }], env: { a: .001, d: .1, s: .9, r: .03 } });
def('meow', 'Basics', 'Meow', { osc: [{ type: 'sawtooth', gain: .6 }, { type: 'pulse25', gain: .3 }], env: { a: .03, d: .3, s: .6, r: .15 }, formant: [800, 1300, 2800], pitch: { amt: -4, t: .18 }, vib: { rate: 7, depth: 25, delay: .1 } });
def('woof', 'Basics', 'Woof', { osc: [{ type: 'sawtooth', gain: .7 }], env: { a: .005, d: .15, s: 0, r: .05 }, formant: [500, 1000, 2400], pitch: { amt: 6, t: .06 }, noise: { gain: .3, decay: .05, f: 900 } });
def('mariopaint', 'Basics', 'Mario Paint Mario', { osc: [{ type: 'square', gain: .6 }, { type: 'pulse25', oct: 1, gain: .2 }], env: { a: .001, d: .25, s: .2, r: .08 }, pitch: { amt: 2, t: .03 }, crush: 6 });
def('bird', 'Basics', 'Bird', { osc: [{ type: 'sine', oct: 1, gain: 1 }], env: { a: .01, d: .2, s: .5, r: .1 }, pitch: { amt: 7, t: .07 }, vib: { rate: 22, depth: 70, delay: 0 } });
def('telephone', 'Basics', 'Telephone', { osc: [{ type: 'square', oct: 1, gain: .4 }, { type: 'square', oct: 1, detune: 60, gain: .3 }], env: { a: .002, d: .1, s: .9, r: .05 }, trem: { rate: 16, depth: 1 } });
def('ghost', 'Basics', 'Ghost', { osc: [{ type: 'sine', gain: .7 }, { type: 'noise', gain: .2 }], env: { a: .3, d: .4, s: .8, r: .8 }, vib: { rate: 3, depth: 45, delay: 0 }, filter: { type: 'bandpass', f: 1.5, track: true, q: 3 } });
def('rumble', 'Basics', 'Rumble', { osc: [{ type: 'noise', gain: .7 }, { type: 'sawtooth', oct: -2, gain: .3 }], env: { a: .2, d: .5, s: .8, r: .9 }, filter: { type: 'lowpass', f: 1.2, track: true, q: 4 } });

// --- friendly names: sounds are listed by instrument family, not by bank.
const FAMILIES = ['Keys', 'Bells', 'Guitar & Plucks', 'Bass', 'Strings', 'Voice', 'Brass', 'Woodwind', 'Organ & Squeezebox', 'Chiptune', 'Synth', 'Drums & Hits', 'Funny'];
const LABELS = {
  sgm_piano1: ['Keys', 'Grand Piano'], sgm_piano3: ['Keys', 'Bright Piano'], sgm_honky: ['Keys', 'Honky-Tonk Piano'], sgm_epiano: ['Keys', 'Electric Piano'],
  eb_mellowpiano: ['Keys', 'Mellow Piano'], thinst_harpsi: ['Keys', 'Harpsichord'],
  sgm_celesta: ['Bells', 'Celesta'], sgm_glock: ['Bells', 'Glockenspiel'], sgm_musicbox: ['Bells', 'Music Box'], sgm_vibes: ['Bells', 'Vibraphone'],
  sgm_tubular: ['Bells', 'Tubular Bells'], marimba: ['Bells', 'Marimba'], kirby_celesta: ['Bells', 'Toy Celesta'], evermore_bell: ['Bells', 'Spooky Bell'],
  thinst_musicbox: ['Bells', 'Tiny Music Box'], thinst_tinker: ['Bells', 'Fairy Bell'],
  sgm_dulcimer: ['Guitar & Plucks', 'Dulcimer'], harp: ['Guitar & Plucks', 'Harp'], sgm_nylon: ['Guitar & Plucks', 'Nylon Guitar'],
  sgm_mutedgtr: ['Guitar & Plucks', 'Muted Guitar'], sgm_distgtr: ['Guitar & Plucks', 'Distorted Guitar'],
  sgm_acbass: ['Bass', 'Upright Bass'], sgm_fingerbass: ['Bass', 'Finger Bass'], sgm_pickbass: ['Bass', 'Picked Bass'], sgm_slapbass: ['Bass', 'Slap Bass'],
  sgm_acidbass: ['Bass', 'Acid Bass'], sgm_fretless: ['Bass', 'Fretless Bass'], synthbass: ['Bass', 'Synth Bass'], pc98_034: ['Bass', 'FM Bass'],
  sgm_strings: ['Strings', 'String Section'], sgm_tremstr: ['Strings', 'Tremolo Strings'], sgm_pizz: ['Strings', 'Pizzicato Strings'], sgm_violin: ['Strings', 'Violin'],
  sgm_synthstr: ['Strings', 'Synth Strings'], evermore_string: ['Strings', 'Dark Strings'], kirby_strings: ['Strings', 'Chunky Strings'],
  sgm_choir: ['Voice', 'Choir Aah'], sgm_spacevoice: ['Voice', 'Space Voice'], evermore_voice: ['Voice', 'Ghostly Voice'],
  sgm_trumpet: ['Brass', 'Trumpet'], sgm_tuba: ['Brass', 'Tuba'], pc98_000: ['Brass', 'Synth Brass'], sax: ['Brass', 'Saxophone'],
  sgm_clarinet: ['Woodwind', 'Clarinet'], sgm_oboe: ['Woodwind', 'Oboe'], sgm_flute: ['Woodwind', 'Flute'], sgm_recorder: ['Woodwind', 'Recorder'], sgm_bottle: ['Woodwind', 'Bottle Blow'],
  sgm_organ: ['Organ & Squeezebox', 'Organ'], sgm_accordion: ['Organ & Squeezebox', 'Accordion'],
  nes_pulse6: ['Chiptune', '8-bit Thin Pulse'], nes_pulse12: ['Chiptune', '8-bit Pulse'], nes_pulse25: ['Chiptune', '8-bit Pulse Wide'], nes_square: ['Chiptune', '8-bit Square'],
  nes_duty: ['Chiptune', '8-bit Wobble Lead'], nes_triangle: ['Chiptune', '8-bit Triangle Bass'], nes_noise_long: ['Chiptune', '8-bit Noise'], nes_noise_short: ['Chiptune', '8-bit Metal Noise'],
  osc3_square: ['Synth', 'Square Lead'], osc3_saw: ['Synth', 'Saw Lead'], osc3_sine: ['Synth', 'Soft Sine'], osc3_noise: ['Synth', 'Noise Wash'], rounded_saw: ['Synth', 'Round Saw Lead'],
  sgm_mgsquare: ['Synth', 'Fat Square'], sgm_basslead: ['Synth', 'Bass & Lead'], kirby_synthlead: ['Synth', 'Bright Lead'],
  pc98_071: ['Synth', 'FM Pipe'], pc98_079: ['Synth', 'FM Chime'], pc98_082: ['Synth', 'FM Lead'], pc98_084: ['Synth', 'FM Buzz'], pc98_105: ['Synth', 'FM Pluck'],
  kit_standard: ['Drums & Hits', 'Drum Kit'], kit_power: ['Drums & Hits', 'Rock Kit'], kit_electronic: ['Drums & Hits', 'Electro Kit'], kit_techno: ['Drums & Hits', 'Techno Kit'],
  kit_brush: ['Drums & Hits', 'Jazz Brush Kit'], kit_orchestra: ['Drums & Hits', 'Orchestra Kit'], kit_rock: ['Drums & Hits', 'Garage Kit'], fm4op_perc: ['Drums & Hits', 'FM Drum Kit'],
  kit_nes: ['Drums & Hits', '8-bit Drum Kit'], sgm_timpani: ['Drums & Hits', 'Timpani'], sgm_impact: ['Drums & Hits', 'Orchestra Hit'],
  meow: ['Funny', 'Meow'], woof: ['Funny', 'Woof'], mariopaint: ['Funny', 'Bleep'], bird: ['Funny', 'Birdie'], telephone: ['Funny', 'Telephone'], ghost: ['Funny', 'Ghost'],
  rumble: ['Funny', 'Rumble'], eb_giygas: ['Funny', 'Static Storm'],
};
for (const [id, [fam, label]] of Object.entries(LABELS)) if (P[id]) { P[id].group = fam; P[id].name = label; }
for (const p of Object.values(P)) if (!LABELS[p.id]) p.hidden = true;

// --- variations of those, one per sound used in the DELTARUNE sample sheet (sheet_bank.js).
const suffix = (label, fw) => (fw && !(fw === 'FM' && label.startsWith('FM')) ? label + ' (' + fw + ')' : label);
const FLAVOUR_WORD = (f) => (!f ? '' : f.fm ? 'FM' : f.crush <= 6 ? 'pocket' : f.crush === 7 && f.lp === 7000 ? 'retro' : f.crush === 7 ? 'crunchy' : 'lo-fi');
const PC98 = ['FM Piano', 'FM Bells', 'FM Organ', 'FM Guitar', 'FM Bass', 'FM Strings', 'FM Ensemble', 'FM Brass', 'FM Reed', 'FM Pipe', 'FM Lead', 'FM Pad', 'FM Sparkle', 'FM Ethnic', 'FM Percussion', 'FM Effect'];
const PC98_FAM = ['Keys', 'Bells', 'Organ & Squeezebox', 'Guitar & Plucks', 'Bass', 'Strings', 'Strings', 'Brass', 'Woodwind', 'Woodwind', 'Synth', 'Synth', 'Synth', 'Guitar & Plucks', 'Drums & Hits', 'Funny'];
const KIT_NAMES = { standard: 'Drum Kit', power: 'Rock Kit', electronic: 'Electro Kit', techno: 'Techno Kit', brush: 'Jazz Brush Kit', orchestra: 'Orchestra Kit', fm: 'FM Drum Kit', nes: '8-bit Drum Kit' };
const HIT_NAMES = { crash: 'Crash Cymbal', ride: 'Ride Cymbal', kick: 'Kick Drum', snare: 'Snare Drum', hat: 'Hi-Hat', openhat: 'Open Hi-Hat', tom: 'Tom Drum' };
const GM_ENV = (fam) => ([0, 1, 3, 4, 13, 14, 15].includes(fam) ? { a: .002, d: .9, s: .05, r: .2 } : fam === 2 || fam === 5 || fam === 6 || fam === 7 || fam === 8 || fam === 9 || fam === 11 ? { a: .03, d: .3, s: .8, r: .2 } : { a: .004, d: .4, s: .6, r: .12 });
function pc98(n) {
  const fam = Math.floor(n / 8) % 16, r = [1, 2, 3, 4, .5, 1.5, 3.5, 7][n % 8];
  return { fm: { ratio: r, index: 1 + ((n * 37) % 5) * .6, decay: .08 + (n % 5) * .08, sus: [0, 1, 3, 4].includes(fam) ? .05 : .4 }, osc: [{ type: 'sine', gain: 1 }, { type: 'sine', detune: 5 + (n % 3) * 3, gain: .3 }], env: GM_ENV(fam), vib: { rate: 5.5, depth: fam >= 7 && fam <= 10 ? 8 : 0, delay: .25 } };
}
const SHEET_SOURCES = {}; // preset id -> sheet entries it stands in for
if (typeof SHEET_BANK !== 'undefined') {
  const names = new Set(Object.values(P).filter((p) => !p.hidden).map((p) => p.name));
  const uniq = (n) => { let k = n, i = 2; while (names.has(k)) k = n + ' ' + i++; names.add(k); return k; };
  const pcCount = {};
  for (const [product, program, recipe, flav] of SHEET_BANK) {
    const fw = FLAVOUR_WORD(flav);
    let id, o, fam, label;
    if (typeof recipe === 'string') {
      const base = P[recipe] || P.sgm_piano1;
      id = base.id + (fw ? '~' + fw.replace(/\W/g, '') : '');
      if (!P[id]) { o = JSON.parse(JSON.stringify(base)); fam = base.group; label = suffix(base.name, fw); }
    } else if (recipe.pc98 != null) {
      if (recipe.pc98 >= 128) { id = 'fm4op_perc'; }
      else {
        id = 'pc98_' + String(recipe.pc98).padStart(3, '0');
        if (!P[id] || P[id].hidden === undefined && !LABELS[id]) {
          const f = Math.floor(recipe.pc98 / 8) % 16;
          pcCount[f] = (pcCount[f] || 0) + 1;
          o = Object.assign({ kind: 'tone' }, pc98(recipe.pc98)); fam = PC98_FAM[f]; label = PC98[f];
        }
      }
    } else {
      const style = recipe.kit, role = recipe.role || '';
      id = 'kit_' + style + (role ? '_' + role : '') + (fw ? '~' + fw : '');
      if (!P[id]) { o = { kind: 'kit', style, role: role || null }; fam = 'Drums & Hits'; label = suffix(role ? HIT_NAMES[role] : KIT_NAMES[style] || 'Drum Kit', fw); }
    }
    if (o) {
      if (flav) {
        if (flav.crush) o.crush = Math.min(o.crush || 16, flav.crush);
        if (flav.lp) o.lp = flav.lp;
        if (flav.fm && o.kind === 'tone') o.fm = o.fm ? Object.assign({}, o.fm, { index: o.fm.index * flav.fm }) : { ratio: 1, index: flav.fm, decay: .3, sus: .3 };
      }
      P[id] = Object.assign(o, { id, group: fam, name: uniq(label), hidden: false });
    }
    (SHEET_SOURCES[id] = SHEET_SOURCES[id] || []).push(product + ' / ' + program);
  }
}
const PRESET_LIST = Object.values(P).filter((p) => !p.hidden).sort((a, b) => FAMILIES.indexOf(a.group) - FAMILIES.indexOf(b.group) || a.name.localeCompare(b.name));
const PRESET_GROUPS = FAMILIES.filter((f) => PRESET_LIST.some((p) => p.group === f));

const DRUM_NAMES = {
  35: 'kick 2', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare 2', 41: 'low tom', 42: 'hat', 43: 'low tom 2',
  44: 'pedal hat', 45: 'mid tom', 46: 'open hat', 47: 'mid tom 2', 48: 'high tom', 49: 'crash', 50: 'high tom 2',
  51: 'ride', 52: 'china', 53: 'ride bell', 54: 'tambourine', 55: 'splash', 56: 'cowbell', 57: 'crash 2', 59: 'ride 2',
  60: 'hi bongo', 61: 'lo bongo', 62: 'conga mute', 63: 'conga', 64: 'lo conga', 69: 'cabasa', 70: 'maracas',
  75: 'claves', 76: 'hi block', 77: 'lo block', 81: 'triangle',
};
function drumRole(n) {
  if (n <= 36) return 'kick';
  if (n === 37 || n === 75 || n === 76 || n === 77) return 'rim';
  if (n === 38 || n === 40) return 'snare';
  if (n === 39) return 'clap';
  if (n === 42 || n === 44 || n === 54 || n === 69 || n === 70) return 'hat';
  if (n === 46) return 'openhat';
  if (n === 49 || n === 52 || n === 55 || n === 57) return 'crash';
  if (n === 51 || n === 53 || n === 59 || n === 81) return 'ride';
  if (n === 56) return 'cowbell';
  if ([41, 43, 45, 47, 48, 50, 60, 61, 62, 63, 64].includes(n)) return 'tom';
  return n > 64 ? 'hat' : 'tom';
}

// ---------- per-context caches ----------
function ctxCache(ctx) {
  if (ctx._wiggly) return ctx._wiggly;
  const c = (ctx._wiggly = { waves: {}, buffers: {} });
  const wave = (name, fn, n = 64) => {
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = fn(k);
    c.waves[name] = ctx.createPeriodicWave(re, im);
  };
  const pulse = (d) => (k) => (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
  wave('pulse06', pulse(0.0625)); wave('pulse12', pulse(0.125)); wave('pulse25', pulse(0.25));
  wave('piano', (k) => (k > 18 ? 0 : 1 / Math.pow(k, 1.3)) * (k % 7 === 0 ? 0.3 : 1));
  wave('organ', (k) => ({ 1: 1, 2: 0.7, 3: 0.5, 4: 0.5, 6: 0.3, 8: 0.25 })[k] || 0);
  wave('pluck', (k) => (k > 24 ? 0 : Math.sin(k * 0.6) / k));
  // 4-bit stepped NES triangle, built from its own Fourier series.
  {
    const N = 512, s = new Float32Array(N);
    for (let i = 0; i < N; i++) { const ph = i / N, tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4; s[i] = Math.round((tri + 1) * 7.5) / 7.5 - 1; }
    const re = new Float32Array(48), im = new Float32Array(48);
    for (let k = 1; k < 48; k++) { let a = 0, b = 0; for (let i = 0; i < N; i++) { a += s[i] * Math.cos((2 * Math.PI * k * i) / N); b += s[i] * Math.sin((2 * Math.PI * k * i) / N); } re[k] = (2 * a) / N; im[k] = (2 * b) / N; }
    c.waves.nestri = ctx.createPeriodicWave(re, im);
  }
  const sr = ctx.sampleRate;
  const buf = (len, fill) => { const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0); fill(d); return b; };
  c.buffers.noise = buf(sr * 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const lfsr = (short) => (d) => {
    // One sample per LFSR clock at the base rate; playbackRate sets the pitch.
    let r = 1;
    for (let i = 0; i < d.length; i++) { const bit = (r ^ (r >> (short ? 6 : 1))) & 1; r = (r >> 1) | (bit << 14); d[i] = r & 1 ? 0.8 : -0.8; }
  };
  c.buffers.lfsr_long = buf(32767, lfsr(false));
  c.buffers.lfsr_short = buf(93 * 8, lfsr(true));
  return c;
}

function makeDriveCurve(amt) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); }
  return c;
}
function makeCrushCurve(bits) {
  const n = 2048, c = new Float32Array(n), q = Math.pow(2, bits - 1);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = Math.round(x * q) / q; }
  return c;
}

// ---------- mixer ----------
class Mixer {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.comp); this.comp.connect(this.analyser); this.analyser.connect(dest || ctx.destination);
    // Ping-pong delay bus.
    this.delayIn = ctx.createGain();
    this.dl = ctx.createDelay(2); this.dr = ctx.createDelay(2);
    this.fb = ctx.createGain(); this.fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3500;
    const merge = ctx.createChannelMerger(2);
    this.delayIn.connect(tone); tone.connect(this.dl); this.dl.connect(merge, 0, 0); this.dl.connect(this.dr); this.dr.connect(merge, 0, 1);
    this.dr.connect(this.fb); this.fb.connect(tone);
    const dOut = ctx.createGain(); dOut.gain.value = 0.7; merge.connect(dOut); dOut.connect(this.master);
    // Reverb bus with a generated room.
    this.verbIn = ctx.createGain();
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb.buffer = ir;
    this.verbIn.connect(this.verb); const vOut = ctx.createGain(); vOut.gain.value = 0.6; this.verb.connect(vOut); vOut.connect(this.master);
    this.buses = [];
    this.setTempo(120);
  }
  setTempo(bpm) {
    const t = Math.min(1.9, (60 / bpm) * 0.75); // dotted eighth
    this.dl.delayTime.value = t; this.dr.delayTime.value = t;
  }
  bus(i) {
    if (this.buses[i]) return this.buses[i];
    const ctx = this.ctx, b = { input: ctx.createGain(), pan: ctx.createStereoPanner(), dsend: ctx.createGain(), rsend: ctx.createGain(), meter: 0 };
    b.input.connect(b.pan); b.pan.connect(this.master);
    b.input.connect(b.dsend); b.dsend.connect(this.delayIn);
    b.input.connect(b.rsend); b.rsend.connect(this.verbIn);
    b.dsend.gain.value = 0; b.rsend.gain.value = 0;
    return (this.buses[i] = b);
  }
  applyInstrument(i, inst, muted) {
    const b = this.bus(i);
    b.input.gain.value = muted ? 0 : (inst.vol ?? 0.7);
    b.pan.pan.value = inst.pan ?? 0;
    b.dsend.gain.value = inst.delay ?? 0;
    b.rsend.gain.value = inst.reverb ?? 0;
  }
}

// ---------- voices ----------
function envGain(ctx, g, env, t0, t1, peak) {
  const a = Math.max(0.001, env.a), d = Math.max(0.005, env.d), s = env.s, r = Math.max(0.01, env.r);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.setTargetAtTime(peak * s, t0 + a, d / 3);
  const relAt = Math.max(t1, t0 + a);
  g.gain.setTargetAtTime(0, relAt, r / 4);
  return relAt + r * 1.6;
}

function startSource(ctx, cache, type, freq, t0, tEnd, detune) {
  let src;
  if (type === 'noise' || type === 'lfsr_long' || type === 'lfsr_short') {
    src = ctx.createBufferSource();
    src.buffer = cache.buffers[type]; src.loop = true;
    src.playbackRate.value = type === 'noise' ? 1 : Math.min(8, Math.max(0.02, (freq / 440) * 0.6));
    src.detune.value = detune;
    src.start(t0, Math.random() * 0.5); src.stop(tEnd);
    return { node: src, freqParam: null };
  }
  src = ctx.createOscillator();
  if (cache.waves[type]) src.setPeriodicWave(cache.waves[type]); else src.type = type;
  src.frequency.value = freq; src.detune.value = detune;
  src.start(t0); src.stop(tEnd);
  return { node: src, freqParam: src.frequency };
}

// state: per-instrument mutable (last frequency for glide)
function playTone(ctx, out, p, inst, state, note, t0, dur, vel) {
  const cache = ctxCache(ctx);
  const f = mtof(note);
  const t1 = t0 + dur;
  const amp = ctx.createGain();
  const peak = 0.32 * Math.pow(vel, 1.4);
  const tEnd = envGain(ctx, amp, p.env, t0, t1, peak);
  let chainIn = amp, last = amp;
  // Effects inside the voice: formant filter bank, filter, drive, crush.
  const head = ctx.createGain();
  let tail = head;
  if (p.drive) { const ws = ctx.createWaveShaper(); ws.curve = makeDriveCurve(p.drive); tail.connect(ws); tail = ws; }
  if (p.formant) {
    const sum = ctx.createGain();
    p.formant.forEach((ff, i) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 5; const g = ctx.createGain(); g.gain.value = [2.2, 1.6, 0.8][i] || 0.5; tail.connect(bp); bp.connect(g); g.connect(sum); });
    tail = sum;
  }
  if (p.filter) {
    const fl = ctx.createBiquadFilter(); fl.type = p.filter.type;
    const base = p.filter.track ? f * p.filter.f : p.filter.f;
    fl.Q.value = p.filter.q ?? 1;
    if (p.filter.gain) fl.gain.value = p.filter.gain;
    const clamp = (x) => Math.min(18000, Math.max(30, x));
    if (p.filter.env) {
      fl.frequency.setValueAtTime(clamp(base * (1 + p.filter.env)), t0);
      fl.frequency.setTargetAtTime(clamp(base), t0 + 0.002, p.filter.decay || 0.1);
    } else fl.frequency.value = clamp(base);
    tail.connect(fl); tail = fl;
  }
  if (p.crush) { const ws = ctx.createWaveShaper(); ws.curve = makeCrushCurve(p.crush); tail.connect(ws); tail = ws; }
  if (p.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.Q.value = .5; tail.connect(lp); tail = lp; }
  tail.connect(amp);
  if (p.trem) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain(), tg = ctx.createGain();
    lfo.frequency.value = p.trem.rate; lg.gain.value = p.trem.depth * 0.5; tg.gain.value = 1 - p.trem.depth * 0.5;
    lfo.connect(lg); lg.connect(tg.gain); amp.connect(tg); last = tg; lfo.start(t0); lfo.stop(tEnd);
  }
  last.connect(out);

  const detune = (inst.detune || 0) + (inst.octave || 0) * 1200;
  const freqParams = [];
  // Vibrato LFO shared across oscillators (in cents through .detune).
  let vibGain = null;
  const vib = p.vib && (p.vib.depth || inst.vibrato) ? p.vib : inst.vibrato ? { rate: 5.5, depth: 0, delay: 0.2 } : null;
  if (vib) {
    const lfo = ctx.createOscillator(); vibGain = ctx.createGain();
    lfo.frequency.value = vib.rate;
    const depth = (vib.depth || 0) + (inst.vibrato || 0) * 30;
    vibGain.gain.setValueAtTime(0, t0); vibGain.gain.linearRampToValueAtTime(depth, t0 + (vib.delay || 0) + 0.15);
    lfo.connect(vibGain); lfo.start(t0); lfo.stop(tEnd);
  }
  let fmMod = null;
  for (const o of p.osc) {
    const of = f * Math.pow(2, o.oct || 0);
    const s = startSource(ctx, cache, o.type, of, t0, tEnd, detune + (o.detune || 0));
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    s.node.connect(g); g.connect(head);
    if (vibGain) vibGain.connect(s.node.detune);
    if (s.freqParam) {
      freqParams.push([s.freqParam, of]);
      if (p.fm) {
        if (!fmMod) {
          const m = ctx.createOscillator(); m.frequency.value = f * p.fm.ratio; m.detune.value = detune;
          fmMod = ctx.createGain();
          const idx = p.fm.index * f * Math.pow(vel, 0.6);
          fmMod.gain.setValueAtTime(idx, t0);
          fmMod.gain.setTargetAtTime(idx * (p.fm.sus ?? 0), t0, p.fm.decay);
          m.connect(fmMod); m.start(t0); m.stop(tEnd);
        }
        fmMod.connect(s.freqParam);
      }
    }
  }
  // Pitch envelope (drops) and glide (portamento).
  const glide = inst.glide ?? 0;
  for (const [fp, of] of freqParams) {
    if (p.pitch) {
      fp.setValueAtTime(of * Math.pow(2, p.pitch.amt / 12), t0);
      fp.exponentialRampToValueAtTime(of, t0 + p.pitch.t);
    } else if (glide > 0 && state.lastFreq && Math.abs(state.lastFreq - f) > 0.01) {
      const ratio = state.lastFreq / f;
      fp.setValueAtTime(of * ratio, t0);
      fp.exponentialRampToValueAtTime(of, t0 + glide);
    }
  }
  state.lastFreq = f;
  if (p.noise) {
    const n = ctx.createBufferSource(); n.buffer = cache.buffers.noise; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = p.noise.f || 2000; nf.Q.value = 0.8;
    const ng = ctx.createGain();
    if (p.noise.sus) envGain(ctx, ng, p.env, t0, t1, p.noise.gain * peak * 3);
    else { ng.gain.setValueAtTime(p.noise.gain * peak * 3, t0); ng.gain.setTargetAtTime(0, t0, p.noise.decay); }
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t0, Math.random()); n.stop(Math.min(tEnd, p.noise.sus ? tEnd : t0 + p.noise.decay * 8 + 0.01));
  }
  return tEnd;
}

// Drum synthesis. Each role has a recipe that each kit style flavours.
function playDrum(ctx, out, p, inst, note, t0, vel) {
  const cache = ctxCache(ctx);
  const style = p.style;
  const role = p.role || drumRole(note);
  const det = Math.pow(2, (inst.detune || 0) / 1200 + (p.role ? (note - 60) / 12 : 0));
  if (p.crush || p.lp) {
    let o2 = out;
    if (p.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.connect(o2); o2 = lp; }
    if (p.crush) { const ws = ctx.createWaveShaper(); ws.curve = makeCrushCurve(p.crush); ws.connect(o2); o2 = ws; }
    out = o2;
  }
  const v = 0.5 * Math.pow(vel, 1.3);
  const tone = (freq, endFreq, decay, type = 'sine', gain = 1, sweep = 0.05) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq * det, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq * det), t0 + sweep);
    const g = ctx.createGain(); g.gain.setValueAtTime(v * gain, t0); g.gain.setTargetAtTime(0, t0 + 0.002, decay / 3);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + decay * 2 + 0.05);
    return o;
  };
  const noise = (type, freq, q, decay, gain = 1, attack = 0.001, buffer = 'noise') => {
    const n = ctx.createBufferSource(); n.buffer = cache.buffers[buffer]; n.loop = true;
    if (buffer !== 'noise') n.playbackRate.value = 2;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq * det; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v * gain, t0 + attack); g.gain.setTargetAtTime(0, t0 + attack, decay / 3);
    n.connect(fl); fl.connect(g); g.connect(out); n.start(t0, Math.random()); n.stop(t0 + attack + decay * 2 + 0.05);
  };
  const fmTone = (freq, ratio, index, decay, gain = 1, drop = 1) => {
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.setValueAtTime(freq * det * drop, t0); c.frequency.exponentialRampToValueAtTime(freq * det, t0 + 0.04);
    m.frequency.value = freq * det * ratio;
    mg.gain.setValueAtTime(freq * index, t0); mg.gain.setTargetAtTime(0, t0, decay / 4);
    g.gain.setValueAtTime(v * gain, t0); g.gain.setTargetAtTime(0, t0 + 0.002, decay / 3);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(out);
    c.start(t0); m.start(t0); c.stop(t0 + decay * 2 + 0.05); m.stop(t0 + decay * 2 + 0.05);
  };
  const tomF = { 41: 80, 43: 95, 45: 115, 47: 135, 48: 160, 50: 190, 60: 400, 61: 330, 62: 300, 63: 260, 64: 200 }[note] || 140;
  switch (style) {
    case 'fm':
      if (role === 'kick') fmTone(55, 0.5, 6, 0.35, 1.6, 4);
      else if (role === 'snare') { fmTone(190, 2.3, 9, 0.18, 0.9, 1.5); noise('highpass', 1800, 0.7, 0.15, 0.8); }
      else if (role === 'clap') { fmTone(300, 3.7, 14, 0.12, 0.6, 1); noise('bandpass', 1500, 1, 0.16, 1.1, 0.008); }
      else if (role === 'hat' || role === 'openhat') fmTone(900, 7.13, 20, role === 'hat' ? 0.05 : 0.25, 0.45);
      else if (role === 'crash' || role === 'ride') fmTone(600, 5.41, 30, 1, 0.4);
      else fmTone(tomF, 1.5, 3, 0.3, 1, 2);
      break;
    case 'nes':
      if (role === 'kick') tone(180, 40, 0.18, 'triangle', 1.6, 0.06);
      else if (role === 'hat' || role === 'openhat') noise('highpass', 5000, 0.5, role === 'hat' ? 0.04 : 0.2, 0.7, 0.001, 'lfsr_short');
      else noise('lowpass', 6000, 0.5, role === 'crash' ? 0.6 : 0.14, 0.9, 0.001, 'lfsr_long');
      break;
    case 'brush':
      if (role === 'kick') tone(90, 45, 0.25, 'sine', 1.2, 0.04);
      else if (role === 'snare' || role === 'clap') noise('bandpass', 2800, 0.6, 0.25, 0.8, 0.02);
      else if (role === 'hat') noise('highpass', 6500, 0.6, note === 44 ? 0.06 : 0.04, 0.5, 0.003);
      else if (role === 'openhat') noise('highpass', 6000, 0.6, 0.35, 0.45, 0.01);
      else if (role === 'crash' || role === 'ride') noise('highpass', 5000, 0.4, 1.2, 0.4, 0.02);
      else tone(tomF, tomF * 0.8, 0.3, 'sine', 0.8, 0.1);
      break;
    case 'orchestra':
      if (role === 'kick') { tone(70, 45, 1.2, 'sine', 1.4, 0.15); noise('lowpass', 300, 0.7, 0.3, 0.6); }
      else if (role === 'snare' || role === 'clap') { noise('bandpass', 2400, 0.8, 0.22, 1); tone(220, 180, 0.08, 'triangle', 0.4); }
      else if (role === 'crash') noise('highpass', 3500, 0.4, 2, 0.6);
      else if (role === 'hat' || role === 'openhat') noise('highpass', 7000, 0.6, 0.08, 0.5);
      else tone(tomF * 0.8, tomF * 0.75, 0.9, 'sine', 1, 0.1);
      break;
    default: {
      const elec = style === 'electronic' || style === 'techno';
      const power = style === 'power';
      if (role === 'kick') {
        if (elec) { tone(style === 'techno' ? 160 : 120, 42, style === 'techno' ? 0.32 : 0.55, 'sine', 1.8, 0.07); if (style === 'techno') noise('bandpass', 3000, 1, 0.01, 0.6); }
        else { tone(power ? 140 : 110, 48, power ? 0.4 : 0.3, 'sine', 1.7, 0.05); noise('lowpass', 900, 0.7, 0.02, 0.5); }
      } else if (role === 'snare') {
        if (elec) { tone(240, 180, 0.08, 'triangle', 0.6); noise('highpass', 1200, 0.7, style === 'techno' ? 0.14 : 0.22, 1); }
        else { tone(power ? 200 : 230, 170, 0.1, 'triangle', 0.7); noise('bandpass', 3000, 0.6, power ? 0.3 : 0.18, 1.1); }
      } else if (role === 'clap') {
        noise('bandpass', 1300, 1.2, 0.03, 1.0); noise('bandpass', 1200, 1, 0.18, 0.9, 0.012);
      } else if (role === 'hat') noise('highpass', elec ? 8000 : 7000, 0.7, note === 44 ? 0.05 : 0.04, 0.55);
      else if (role === 'openhat') noise('highpass', 7000, 0.7, 0.3, 0.5);
      else if (role === 'crash') noise('highpass', 4500, 0.4, 1.4, 0.55, 0.003);
      else if (role === 'ride') { noise('highpass', 6500, 0.8, 0.6, 0.35); tone(3200, 3100, 0.5, 'square', 0.04); }
      else if (role === 'cowbell') { tone(560, 560, 0.25, 'square', 0.25); tone(845, 845, 0.25, 'square', 0.25); }
      else if (role === 'rim') { tone(1700, 1600, 0.03, 'square', 0.4); }
      else tone(tomF * (elec ? 1.3 : 1), tomF * 0.7, power ? 0.45 : 0.35, 'sine', 1.1, 0.12);
    }
  }
  return t0 + 1.2;
}

// ---------- engine ----------
const Engine = {
  ctx: null, mixer: null, states: [],
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.mixer = new Mixer(this.ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  // Play one note through instrument slot i; used by player, previews and offline render.
  note(ctx, mixer, states, i, inst, note, t0, dur, vel) {
    const out = mixer.bus(i).input;
    const st = states[i] || (states[i] = {});
    if (inst.preset && inst.preset.startsWith('sf2:') && window.SF2Bank) {
      const r = window.SF2Bank.play(ctx, out, inst, note, t0, dur, vel);
      if (r) return r;
    }
    const p = P[inst.preset] || P.sgm_piano1;
    if (p.kind === 'kit') return playDrum(ctx, out, p, inst, note, t0, vel);
    return playTone(ctx, out, p, inst, st, note, t0, dur, vel);
  },
  preview(song, i, note, vel = 0.8) {
    const ctx = this.ensure();
    const inst = song.instruments[i];
    if (!inst) return;
    this.mixer.setTempo(song.bpm);
    this.mixer.applyInstrument(i, inst, false);
    this.note(ctx, this.mixer, [], i, inst, note, ctx.currentTime + 0.01, 0.35, vel);
  },
};

window.Synth = { P, PRESET_LIST, PRESET_GROUPS, SHEET_SOURCES, FAMILIES, DRUM_NAMES, Engine, Mixer, mtof };
})();

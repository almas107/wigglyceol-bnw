#!/usr/bin/env python3
"""Writes the built-in demo song, "Paper Planes", to songs/paper_planes.sbox
and js/example.js. Am - F - C - G, 16 bars at 128 bpm."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CHORDS = {'Am': ([57, 60, 64], 45), 'F': ([53, 57, 60], 41), 'C': ([55, 60, 64], 48), 'G': ([55, 59, 62], 43)}
ORDER = ['Am', 'F', 'C', 'G']
LEAD_A = [
    [[0, 76, 3], [3, 72, 1], [4, 74, 2], [6, 76, 2], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
    [[0, 72, 3], [3, 69, 1], [4, 72, 2], [6, 74, 2], [8, 72, 6], [14, 69, 2]],
    [[0, 67, 2], [2, 72, 2], [4, 76, 2], [6, 79, 2], [8, 81, 3], [11, 79, 1], [12, 76, 4]],
    [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 6], [14, 74, 2]],
]
LEAD_B = [
    [[0, 81, 2], [2, 79, 2], [4, 76, 4], [8, 74, 2], [10, 76, 2], [12, 72, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 4], [8, 69, 4], [12, 72, 2], [14, 74, 2]],
    [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 79, 4]],
    [[0, 74, 6], [6, 71, 2], [8, 67, 8]],
]

song = {
    'format': 'sbox-1', 'title': 'Paper Planes', 'bpm': 128, 'patternSize': 16, 'channels': 6,
    'instruments': [
        {'name': 'piano', 'preset': 'piano1', 'vol': 0.55, 'reverb': 0.2, 'look': 1},
        {'name': 'music box', 'preset': 'musicbox', 'vol': 0.35, 'delay': 0.3, 'pan': 0.3, 'look': 2},
        {'name': 'square lead', 'preset': 'syn_square', 'vol': 0.4, 'delay': 0.25, 'vibrato': 0.2, 'look': 0},
        {'name': '8-bit bass', 'preset': 'chip_triangle', 'vol': 0.75, 'look': 5},
        {'name': 'drum kit', 'preset': 'kit_standard', 'vol': 0.7, 'look': 3},
    ],
    'patterns': [], 'arrangement': {'bars': [], 'loop': None},
}
pat = lambda inst, notes: (song['patterns'].append({'inst': inst, 'notes': [[p, n, l, v] for p, n, l, v in notes]}), len(song['patterns']) - 1)[1]

piano, arps, bass = {}, {}, {}
for c in ORDER:
    tones, root = CHORDS[c]
    piano[c] = pat(0, [[s, n, l, 0.7] for s, l in [(0, 3), (6, 2), (8, 4), (14, 2)] for n in tones])
    up = [t + 12 for t in tones] + [tones[0] + 24]
    arps[c] = pat(1, [[k * 2, up[[0, 1, 2, 3, 2, 1, 0, 1][k]], 2, 0.6] for k in range(8)])
    bass[c] = pat(3, [[0, root, 3, 0.9], [4, root + 12, 1, 0.7], [6, root, 2, 0.8], [8, root, 3, 0.9], [12, root + 12, 1, 0.7], [14, root + 7, 2, 0.8]])
lead_a = [pat(2, [[p, n, l, 0.8] for p, n, l in bar]) for bar in LEAD_A]
lead_b = [pat(2, [[p, n, l, 0.8] for p, n, l in bar]) for bar in LEAD_B]
kick, snare, hat, open_hat = 36, 38, 42, 46
beat = pat(4, [[0, kick, 1, 0.9], [8, kick, 1, 0.9], [10, kick, 1, 0.6], [4, snare, 1, 0.8], [12, snare, 1, 0.8]] + [[s, hat, 1, 0.45 if s % 4 else 0.6] for s in range(0, 16, 2) if s != 14] + [[14, open_hat, 2, 0.5]])
fill = pat(4, [[0, kick, 1, 0.9], [4, snare, 1, 0.8], [8, kick, 1, 0.9], [10, snare, 1, 0.6], [12, snare, 1, 0.8], [13, snare, 1, 0.6], [14, snare, 1, 0.9], [15, snare, 1, 1.0]])

for bar in range(16):
    c = ORDER[bar % 4]
    row = [-1] * 12
    row[0] = piano[c]
    row[1] = arps[c] if bar < 4 or bar >= 8 else -1
    if bar >= 4:
        row[2] = (lead_b if 8 <= bar < 12 else lead_a)[bar % 4]
        row[3] = bass[c]
        row[4] = fill if bar in (7, 15) else beat
    song['arrangement']['bars'].append(row)

os.makedirs(os.path.join(HERE, '..', 'songs'), exist_ok=True)
with open(os.path.join(HERE, '..', 'songs', 'paper_planes.sbox'), 'w') as f:
    json.dump(song, f, separators=(',', ':'))
with open(os.path.join(HERE, '..', 'js', 'example.js'), 'w') as f:
    f.write('// The demo song, "Paper Planes". Regenerate with tools/make_demo_song.py.\n')
    f.write('const EXAMPLE_SONG = ' + json.dumps(song, separators=(',', ':')) + ';\n')
print('%d patterns, %d bars' % (len(song['patterns']), len(song['arrangement']['bars'])))

#!/usr/bin/env python3
"""Convert an FL Studio project (.flp) into a WigglyCeol song (.wiggly JSON).

Only the parts a step sequencer cares about are read: tempo, channel names,
pattern notes and playlist clips. Audio clips and plugin state are skipped.

    python3 flp2wiggly.py song.flp out.wiggly [--map map.json]

The optional map file assigns built-in presets (and drum key remaps) to FL
channels by index: {"3": {"preset": "sgm_piano1", "keys": {"25": 36}}}.
"""
import collections, json, struct, sys

TICKS_PER_STEP_DIV = 4  # steps are 1/16 notes
BAR_STEPS = 16


def read_events(data):
    if data[:4] != b'FLhd':
        raise ValueError('not an FL Studio project')
    ppq = struct.unpack('<H', data[12:14])[0]
    i = 14
    if data[i:i + 4] != b'FLdt':
        raise ValueError('missing FLdt chunk')
    i += 8
    events = []
    while i < len(data):
        eid = data[i]; i += 1
        if eid < 64:
            v = data[i]; i += 1
        elif eid < 128:
            v = struct.unpack('<H', data[i:i + 2])[0]; i += 2
        elif eid < 192:
            v = struct.unpack('<I', data[i:i + 4])[0]; i += 4
        else:
            n = s = 0
            while True:
                b = data[i]; i += 1
                n |= (b & 0x7f) << s; s += 7
                if not b & 0x80:
                    break
            v = data[i:i + n]; i += n
        events.append((eid, v))
    return ppq, events


def text(v):
    try:
        return v.decode('utf-16le').rstrip('\0')
    except UnicodeDecodeError:
        return v.decode('latin-1').rstrip('\0')


def convert(path, mapping, title=None):
    ppq, events = read_events(open(path, 'rb').read())
    tps = ppq // TICKS_PER_STEP_DIV
    bpm = 120
    channels = {}
    cur_ch = None
    cur_pat = None
    patterns = collections.defaultdict(list)
    items = []
    for eid, v in events:
        if eid == 156:
            bpm = v / 1000
        elif eid == 64:
            cur_ch = v
            channels[cur_ch] = {'name': '', 'plugin': '', 'sample': False}
        elif eid == 201 and cur_ch is not None and cur_ch in channels and not channels[cur_ch]['plugin']:
            channels[cur_ch]['plugin'] = text(v)
        elif eid == 203 and cur_ch is not None and cur_ch in channels and not channels[cur_ch]['name']:
            channels[cur_ch]['name'] = text(v)
        elif eid == 196 and cur_ch is not None and cur_ch in channels:
            channels[cur_ch]['sample'] = True
        elif eid == 65:
            cur_pat = v
        elif eid == 224:
            for k in range(0, len(v) - 23, 24):
                pos, _fl, ch, ln, key, _g, _fp, _u, _rel, _mc, _pan, vel, _mx, _my = struct.unpack('<IHHIHHBBBBBBBB', v[k:k + 24])
                patterns[cur_pat].append((pos, ch, ln, key, vel))
        elif eid == 233:
            size = 60 if len(v) % 60 == 0 and len(v) % 32 != 0 else 32
            for k in range(0, len(v) - size + 1, size):
                pos, base, idx, ln, _trk, _grp, _u1, _flags, _u2, so, eo = struct.unpack('<IHHIHHHHIii', v[k:k + 32])
                if idx > base:
                    items.append((pos, idx - base, ln, so, eo))

    # Flatten every playlist clip into absolute notes per FL channel.
    flat = collections.defaultdict(dict)
    for pos, pat, ln, so, eo in items:
        start = so if so >= 0 else 0
        end = eo if eo >= 0 else start + ln
        for npos, ch, nlen, key, vel in patterns.get(pat, []):
            if start <= npos < end:
                t = pos + npos - start
                flat[ch][(t, key)] = (t, key, nlen, vel)

    used = [c for c in sorted(flat) if not channels.get(c, {}).get('sample')]
    song = {
        'format': 'wiggly-1', 'title': title or path.rsplit('/', 1)[-1].rsplit('.', 1)[0],
        'bpm': round(bpm, 2), 'patternSize': BAR_STEPS, 'channels': max(8, len(used)),
        'instruments': [], 'patterns': [], 'arrangement': {'bars': [], 'loop': [0, 0]},
    }
    last_step = 0
    per_channel = {}
    for slot, ch in enumerate(used):
        info = channels.get(ch, {})
        m = mapping.get(str(ch), {})
        inst = {'name': m.get('name', info.get('name') or 'channel %d' % ch), 'preset': m.get('preset', 'sgm_piano1')}
        for k in ('vol', 'pan', 'detune', 'delay', 'reverb', 'glide', 'look'):
            if k in m:
                inst[k] = m[k]
        song['instruments'].append(inst)
        keymap = {int(a): b for a, b in m.get('keys', {}).items()}
        notes = []
        for t, key, nlen, vel in sorted(flat[ch].values()):
            step = round(t / tps)
            length = max(1, round(nlen / tps))
            note = keymap.get(key, key + m.get('transpose', 0))
            notes.append((step, note, length, round(min(vel, 128) / 128, 2)))
            last_step = max(last_step, step + 1)
        per_channel[slot] = notes

    bars = (last_step + BAR_STEPS - 1) // BAR_STEPS
    arrangement = [[-1] * song['channels'] for _ in range(bars)]
    for slot, notes in per_channel.items():
        by_bar = collections.defaultdict(list)
        for step, note, length, vel in notes:
            by_bar[step // BAR_STEPS].append([step % BAR_STEPS, note, length, vel])
        seen = {}
        for bar in sorted(by_bar):
            body = sorted(by_bar[bar])
            sig = json.dumps(body)
            if sig not in seen:
                seen[sig] = len(song['patterns'])
                song['patterns'].append({'inst': slot, 'notes': body})
            arrangement[bar][slot] = seen[sig]
    song['arrangement']['bars'] = arrangement
    song['arrangement']['loop'] = [0, bars]
    return song


if __name__ == '__main__':
    args = sys.argv[1:]
    mapping = {}
    if '--map' in args:
        k = args.index('--map')
        mapping = json.load(open(args[k + 1]))
        del args[k:k + 2]
    title = None
    if '--title' in args:
        k = args.index('--title')
        title = args[k + 1]
        del args[k:k + 2]
    song = convert(args[0], mapping, title)
    with open(args[1], 'w') as f:
        json.dump(song, f, separators=(',', ':'))
    print('%s: %d instruments, %d patterns, %d bars @ %s bpm' % (args[1], len(song['instruments']), len(song['patterns']), len(song['arrangement']['bars']), song['bpm']))

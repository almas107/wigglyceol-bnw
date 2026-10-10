#!/usr/bin/env python3
"""Build js/sheet_bank.js from the DELTARUNE Sample Sheet PDF.

Every (product, program) the sheet lists becomes a built-in WigglyCeol
instrument. No samples are copied: each entry is mapped onto a synth recipe
(see synth.js) plus a "flavour" for its source (SNES-style crunch, FM, chip...).

    python3 build_sheet_bank.py "DELTARUNE Sample Sheet.pdf" ../js/sheet_bank.js
"""
import json, re, sys

import pdfplumber

SNES = {"Chrono Trigger", "Earthbound", "Illusion Of Gaia", "Kirby's Dream Land 3", "Mega Man X", "Mega Man X2",
        "Secret Of Mana", "Secret Of Evermore", "Final Fantasy: Mystic Quest", "Final Fantasy VI", "Super Mario World",
        "Super Mario Kart", "Super Metroid", "Setzer's SPC", "Lufia BETA +", "TMNT4SF2", "Mario Paint",
        "Mighty Morphin Power Rangers", "Alcahest (WK 0.24)", "Tapeworm"}
FLAVOURS = {
    'snes': {'crush': 7, 'lp': 7000}, 'n64': {'crush': 9, 'lp': 11000}, 'gba': {'crush': 6, 'lp': 6000},
    'm3': {'crush': 7, 'lp': 8000}, 'genesis': {'fm': 1.2}, 'fm': {'fm': 1.5},
}

# (keywords, base recipe) - first match wins; matched against the lowercased program name.
RULES = [
    (['dpcm'], 'kit:chip'),
    (['meow'], 'meow'),
    (['bird', 'tweet'], 'bird'), (['telephone'], 'telephone'), (['ghost', 'giygas breath', 'waspy', 'wow!'], 'ghost'),
    (['rumble', 'sfx collection'], 'rumble'), (['giygas static'], 'static_storm'),
    (['acid'], 'acidbass'), (['slap'], 'slapbass'), (['fretless'], 'fretless'),
    (['synth bass', 'sbass', 'deep', 'synth bass 101', 'bass & lead'], 'synthbass'),
    (['pick', 'bassguitar', 'bassp'], 'pickbass'), (['acoustic bass', 'c-bass', 'onett bass', 'threed bass'], 'acbass'),
    (['tuba'], 'tuba'),
    (['honk'], 'honky'), (['rhodes', 'e.piano', 'electric piano', 'detuned ep'], 'epiano'),
    (['bright', 'britepno', 'piano 3'], 'piano3'), (['mellow piano', 'moonside'], 'mellow_piano'),
    (['amnesia', 'initial sound'], 'syn_saw'),
    (['piano', 'pno', 'grand'], 'piano1'),
    (['harpsi', 'clav'], 'harpsichord'), (['celesta'], 'celesta'),
    (['glock', 'crystal'], 'glock'), (['music box', 'music bell', 'tinker'], 'musicbox'),
    (['vibe', 'vibraphone', 'vives'], 'vibes'),
    (['marimba', 'log drum', 'gamelan', 'steel drum', 'koto', 'bongo'], 'marimba'),
    (['bellpad', 'sweep pad', 'bowed glass', 'pad'], 'synthstr'),
    (['tubul', 'bell'], 'tubular'),
    (['banjo', 'mandolin', 'dulcimer', 'jaw harp'], 'dulcimer'), (['harp'], 'harp'),
    (['organ'], 'organ'), (['accordion', 'bandoneon', 'harmonica', 'blues harp', 'bagpipe'], 'accordion'),
    (['dist', 'overdrive', 'lead guitar', 'perry', 'strange', 'rock rhythm', 'pguitar', 'guitar', 'smk guitar', 'nylon', 'gtr', 'gt.', 'steel stereo', 'steel guitar'], None),
    (['pizz'], 'pizz'), (['tremolo str'], 'tremstr'), (['tremolo gtr'], 'nylon'),
    (['violin', 'viola', 'vins', 'solo bo', 'cadenza', 'celli', 'cello', 'string (fast)'], 'violin'),
    (['synthstring', 'synth string', 'synth strings', 'choirstr'], 'synthstr'),
    (['string', 'str', 'quartet', 'velostr', 'les sus', 'garcia'], 'strings'),
    (['space voice', 'anavoice', 'synth voice', 'synth vox', 'synvox'], 'spacevoice'),
    (['choir', 'aah', 'ahh', 'ooh', 'ohh', 'vox', 'voice', 'soprano', 'tenor', 'irina', 'venus'], 'choir'),
    (['synth brass', 'brassesque', 'synbra', 'brass x2'], 'fm_000'),
    (['sax'], 'sax'),
    (['trumpet', 'tromp', 'brass', 'tromb', 'horn'], 'trumpet'),
    (['clarinet'], 'clarinet'), (['oboe', 'english horn', 'bassoon', 'basson'], 'oboe'),
    (['flute', 'piccalo', 'flu', 'panflu', 'recorder', 'chiffer'], 'flute'),
    (['bottle'], 'bottle'), (['timpani'], 'timpani'),
    (['orchestra hit', 'orchhit', 'orchestrahit', 'euro hit', 'impact', 'traditional hit', 'orchestral hit'], 'impact'),
    (['6% pulse'], 'chip_pulse6'), (['12% pulse'], 'chip_pulse12'), (['25% pulse', 'pulse 25%', '75% pulse'], 'chip_pulse25'),
    (['duty'], 'chip_duty'), (['noise (93'], 'chip_noise_short'), (['noise'], 'chip_noise_long'),
    (['square', 'p5 sq', 'lm sq', 'mg sq'], 'mgsquare'), (['rounded saw'], 'rounded_saw'), (['saw'], 'syn_saw'),
    (['sine'], 'syn_sine'), (['triangle'], 'chip_triangle'),
    (['lead', 'altsoft'], 'bright_lead'), (['bass', 'finger'], 'fingerbass'),
]
GUITAR = [(['dist', 'overdrive', 'lead guitar', 'perry', 'strange', 'rock rhythm', 'pguitar', 'smk guitar', 'electric guitar'], 'distgtr'),
          (['muted', 'palm'], 'mutedgtr')]
KIT_STYLES = [(['brush', 'jazz', 'mellow orch'], 'brush'), (['techno'], 'techno'), (['808', 'dance', 'electronic', 'club', 'houser'], 'electronic'),
              (['orchestra'], 'orchestra'), (['power', 'rock', 'drumaxx'], 'power'), (['dac', 'psg'], 'fm'), (['ethnic'], 'standard')]
ONESHOT = [(['ride'], 'ride'), (['crash', 'overh'], 'crash'), (['kick'], 'kick'), (['snare'], 'snare'), (['hi hat open'], 'openhat'),
           (['hi hat', 'hat'], 'hat'), (['cr3_bell'], 'ride'), (['drum sfx'], 'tom'), (['percussion'], None)]


def clean(s):
    s = re.sub(r'\s*\[\d+\]', '', s.replace('\n', ' ').replace('✔', ''))
    return re.sub(r'\s+', ' ', s).strip()


def classify(product, bank, program):
    p = program.lower()
    if product == 'Mario Paint':
        return {'Cat': 'meow', 'Dog': 'woof'}.get(program, 'bleep'), None
    if 'steel drum' in p or 'log drum' in p:
        return 'marimba', None
    flav = None
    if product in SNES:
        flav = 'snes'
    elif product == 'Mystical Ninja Starring Goemon':
        flav = 'n64'
    elif product == 'Pokemon GBA':
        flav = 'gba'
    elif product == 'Mother 3':
        flav = 'm3'
    elif product == 'GenesiSF':
        flav = 'genesis'
    elif product in ('FM8', 'Sytrus', '4OPFM'):
        flav = 'fm'
    if product == 'pc98_ym2608' and program.strip().isdigit():
        return {'fmpatch': int(program)}, None
    is_kit = bank in ('Drumkit', 'Rhythm') or any(k in p for k in ('drum', 'kit', 'percussion', 'standart', 'hi hat', 'kick', 'snare', 'crash')) or product == 'FL Studio 10'
    if product == 'Earthbound' and bank == 'Drumkit':
        is_kit = True
    if is_kit:
        role = None
        for keys, r in ONESHOT:
            if any(k in p for k in keys):
                role = r
                break
        style = 'standard'
        for keys, st in KIT_STYLES:
            if any(k in p for k in keys):
                style = st
                break
        if product == '4OPFM':
            style = 'fm'
        if product in ('NES VST 1.1', 'magical8bitPlug'):
            style = 'chip'
        if 'kit' in p or 'drum' in p or bank == 'Drumkit' and not role:
            role = None
        return {'kit': style, 'role': role}, flav
    if product == 'pc98_ym2608':
        return {'fmpatch': 128}, None
    if product in ('NES VST 1.1', 'magical8bitPlug') and 'square' in p:
        return 'chip_square', None
    for keys, base in RULES:
        if any(k in p for k in keys):
            if base is None:
                for gk, gb in GUITAR:
                    if any(k in p for k in gk):
                        return gb, flav
                return 'nylon', flav
            if base.startswith('kit:'):
                return {'kit': base[4:], 'role': None}, flav
            return base, flav
    if product == '3x Osc':
        return 'syn_saw', None
    return 'piano1', flav


def main(pdf_path, out_path):
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for r in table:
                    if not r or len(r) < 4:
                        continue
                    typ, product, bank, program = [(c or '').strip() for c in r[:4]]
                    if typ in ('Soundfont', 'VST', 'Software') and product and program and product != '???':
                        rows.append((clean(product).replace('Secret of', 'Secret Of'), clean(bank), clean(program)))
    seen, out = set(), []
    for product, bank, program in rows:
        if program.lower() in ('custom preset',):
            continue
        base, flav = classify(product, bank, program)
        entry = [base] + ([FLAVOURS[flav]] if flav else [])
        key = json.dumps(entry, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(entry)
    with open(out_path, 'w') as f:
        f.write('// Extra instrument variations: [recipe, flavour?]. Built with tools/build_sheet_bank.py.\n')
        f.write('const SHEET_BANK = ' + json.dumps(out, separators=(',', ':')).replace('],[', '],\n[') + ';\n')
    print('%d variations from %d sheet rows' % (len(out), len(rows)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

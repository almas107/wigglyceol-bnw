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
    (['dpcm'], 'kit:nes'),
    (['meow'], 'meow'),
    (['bird', 'tweet'], 'bird'), (['telephone'], 'telephone'), (['ghost', 'giygas breath', 'waspy', 'wow!'], 'ghost'),
    (['rumble', 'sfx collection'], 'rumble'), (['giygas static'], 'eb_giygas'),
    (['acid'], 'sgm_acidbass'), (['slap'], 'sgm_slapbass'), (['fretless'], 'sgm_fretless'),
    (['synth bass', 'sbass', 'deep', 'synth bass 101', 'bass & lead'], 'synthbass'),
    (['pick', 'bassguitar', 'bassp'], 'sgm_pickbass'), (['acoustic bass', 'c-bass', 'onett bass', 'threed bass'], 'sgm_acbass'),
    (['tuba'], 'sgm_tuba'),
    (['honk'], 'sgm_honky'), (['rhodes', 'e.piano', 'electric piano', 'detuned ep'], 'sgm_epiano'),
    (['bright', 'britepno', 'piano 3'], 'sgm_piano3'), (['mellow piano', 'moonside'], 'eb_mellowpiano'),
    (['amnesia', 'initial sound'], 'osc3_saw'),
    (['piano', 'pno', 'grand'], 'sgm_piano1'),
    (['harpsi', 'clav'], 'thinst_harpsi'), (['celesta'], 'sgm_celesta'),
    (['glock', 'crystal'], 'sgm_glock'), (['music box', 'music bell', 'tinker'], 'sgm_musicbox'),
    (['vibe', 'vibraphone', 'vives'], 'sgm_vibes'),
    (['marimba', 'log drum', 'gamelan', 'steel drum', 'koto', 'bongo'], 'marimba'),
    (['bellpad', 'sweep pad', 'bowed glass', 'pad'], 'sgm_synthstr'),
    (['tubul', 'bell'], 'sgm_tubular'),
    (['banjo', 'mandolin', 'dulcimer', 'jaw harp'], 'sgm_dulcimer'), (['harp'], 'harp'),
    (['organ'], 'sgm_organ'), (['accordion', 'bandoneon', 'harmonica', 'blues harp', 'bagpipe'], 'sgm_accordion'),
    (['dist', 'overdrive', 'lead guitar', 'perry', 'strange', 'rock rhythm', 'pguitar', 'guitar', 'smk guitar', 'nylon', 'gtr', 'gt.', 'steel stereo', 'steel guitar'], None),
    (['pizz'], 'sgm_pizz'), (['tremolo str'], 'sgm_tremstr'), (['tremolo gtr'], 'sgm_nylon'),
    (['violin', 'viola', 'vins', 'solo bo', 'cadenza', 'celli', 'cello', 'string (fast)'], 'sgm_violin'),
    (['synthstring', 'synth string', 'synth strings', 'choirstr'], 'sgm_synthstr'),
    (['string', 'str', 'quartet', 'velostr', 'les sus', 'garcia'], 'sgm_strings'),
    (['space voice', 'anavoice', 'synth voice', 'synth vox', 'synvox'], 'sgm_spacevoice'),
    (['choir', 'aah', 'ahh', 'ooh', 'ohh', 'vox', 'voice', 'soprano', 'tenor', 'irina', 'venus'], 'sgm_choir'),
    (['synth brass', 'brassesque', 'synbra', 'brass x2'], 'pc98_000'),
    (['sax'], 'sax'),
    (['trumpet', 'tromp', 'brass', 'tromb', 'horn'], 'sgm_trumpet'),
    (['clarinet'], 'sgm_clarinet'), (['oboe', 'english horn', 'bassoon', 'basson'], 'sgm_oboe'),
    (['flute', 'piccalo', 'flu', 'panflu', 'recorder', 'chiffer'], 'sgm_flute'),
    (['bottle'], 'sgm_bottle'), (['timpani'], 'sgm_timpani'),
    (['orchestra hit', 'orchhit', 'orchestrahit', 'euro hit', 'impact', 'traditional hit', 'orchestral hit'], 'sgm_impact'),
    (['6% pulse'], 'nes_pulse6'), (['12% pulse'], 'nes_pulse12'), (['25% pulse', 'pulse 25%', '75% pulse'], 'nes_pulse25'),
    (['duty'], 'nes_duty'), (['noise (93'], 'nes_noise_short'), (['noise'], 'nes_noise_long'),
    (['square', 'p5 sq', 'lm sq', 'mg sq'], 'sgm_mgsquare'), (['rounded saw'], 'rounded_saw'), (['saw'], 'osc3_saw'),
    (['sine'], 'osc3_sine'), (['triangle'], 'nes_triangle'),
    (['lead', 'altsoft'], 'kirby_synthlead'), (['bass', 'finger'], 'sgm_fingerbass'),
]
GUITAR = [(['dist', 'overdrive', 'lead guitar', 'perry', 'strange', 'rock rhythm', 'pguitar', 'smk guitar', 'electric guitar'], 'sgm_distgtr'),
          (['muted', 'palm'], 'sgm_mutedgtr')]
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
        return {'Cat': 'meow', 'Dog': 'woof'}.get(program, 'mariopaint'), None
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
        return {'pc98': int(program)}, None
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
            style = 'nes'
        if 'kit' in p or 'drum' in p or bank == 'Drumkit' and not role:
            role = None
        return {'kit': style, 'role': role}, flav
    if product == 'pc98_ym2608':
        return {'pc98': 128}, None
    if product in ('NES VST 1.1', 'magical8bitPlug') and 'square' in p:
        return 'nes_square', None
    for keys, base in RULES:
        if any(k in p for k in keys):
            if base is None:
                for gk, gb in GUITAR:
                    if any(k in p for k in gk):
                        return gb, flav
                return 'sgm_nylon', flav
            if base.startswith('kit:'):
                return {'kit': base[4:], 'role': None}, flav
            return base, flav
    if product == '3x Osc':
        return 'osc3_saw', None
    return 'sgm_piano1', flav


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
        key = (product.lower(), program.lower().replace(' (drumkit)', ''))
        if key in seen or program.lower() in ('custom preset',):
            continue
        seen.add(key)
        base, flav = classify(product, bank, program)
        entry = [product, program, base]
        if flav:
            entry.append(FLAVOURS[flav])
        out.append(entry)
    with open(out_path, 'w') as f:
        f.write('// Generated by tools/build_sheet_bank.py from the DELTARUNE Sample Sheet.\n')
        f.write('// [product, program, recipe, flavour?] - recipes are synthesized, no samples are included.\n')
        f.write('const SHEET_BANK = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('],[', '],\n[') + ';\n')
    print('%d instruments from %d products' % (len(out), len({e[0] for e in out})))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

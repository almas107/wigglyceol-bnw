# Scribblebox

A super easy music box you scribble in. Open `index.html` in any modern browser
(desktop or phone) — no build step, no install.

## Making music

- **The page** (notebook with the spiral) is one bar of notes. Click to stamp a
  note, drag right to make it longer, drag a note to move it, grab its tail to
  stretch it, right click to snip it.
- **The film strip** is your song. Click a frame to drop the current page
  there, drag to paint it along, click a frame to open that page, right click
  to clear. Click the bar numbers to set where playback starts; drag across
  them to set a loop.
- **The instrument shelf** — click an instrument to make the current page play
  it, double click to tweak it (volume, left/right, tuning, slide, wobble,
  echo, room, octave, colour, mute/solo).
- **The desk**: boombox = play/stop, switch = whole song / loop this page,
  knob = tweak, snail = undo, worm = note length, metronome = tempo,
  paper plane = export WAV, bin = clear the page.

### Shortcuts

| keys | does |
| --- | --- |
| `ctrl+z` / `ctrl+y` (or `ctrl+shift+z`) | undo / redo |
| numpad `+` / `-` (also `=` / `-`) | longer / shorter notes (chosen notes, the hovered note, or the default length) |
| `space` | play / stop |
| arrows (`shift` = octave) | nudge chosen notes |
| `ctrl+a` / `ctrl+c` / `ctrl+v` / `del` | select all / copy / paste / delete notes |
| `ctrl+d` | copy this page |
| `ctrl+s` / `ctrl+o` | save / open |
| `b` `e` `s` | stamp / scissors / lasso |
| `ctrl+wheel` | zoom the page |

## Sounds

171 built-in instruments, grouped by what they are (Keys, Bells, Guitar &
Plucks, Bass, Strings, Voice, Brass, Woodwind, Organ & Squeezebox, Chiptune,
Synth, Drums & Hits, Funny). Everything is synthesized in the browser; no
samples are shipped. Load your own `.sf2` soundfonts with
*file → load your own .sf2* and they appear under "Your Soundfonts".

## Files

- Opens `.sbox` (its own format), `.mid` and FL Studio `.flp` projects.
- Exports WAV and MIDI.
- The demo song, *Paper Planes*, is built by `tools/make_demo_song.py`.

## Publishing on itch.io

Run `python3 tools/build_itch.py` and upload `dist-itch/scribblebox.zip` as an
HTML project ("This file will be played in the browser"). Suggested embed
settings: viewport 1100 x 760, "Mobile friendly" on, fullscreen button on.

## Credits

The song model (pages of notes arranged on a timeline) follows Bosca Ceoil
(MIT). The small pixel fonts in `js/font.js` come from Decker by John Earnest
(MIT). Handwriting fonts: Patrick Hand and Gochi Hand (SIL OFL) from Google
Fonts, bundled in `fonts/`. See `CREDITS.txt`.

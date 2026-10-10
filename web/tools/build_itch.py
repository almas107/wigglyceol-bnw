#!/usr/bin/env python3
"""Packs the app into a zip ready to upload to itch.io as an HTML game.

    python3 tools/build_itch.py      ->  ../dist-itch/scribblebox.zip
"""
import os, zipfile

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(WEB), 'dist-itch', 'scribblebox.zip')
FILES = ['index.html', 'CREDITS.txt'] + ['js/' + f for f in sorted(os.listdir(os.path.join(WEB, 'js')))] + ['fonts/' + f for f in sorted(os.listdir(os.path.join(WEB, 'fonts')))]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(os.path.join(WEB, f), f)
print('%s (%d files, %.0f KB)' % (OUT, len(FILES), os.path.getsize(OUT) / 1024))

#!/usr/bin/env python3
"""Builds a self-contained copy of the game in dist/: sprite sheets, packed cries and the game files.

Hosts such as claude.ai artifacts only allow same-origin images and audio, so the sprites that the
plain build hotlinks from PokeAPI and Pokémon Showdown are packed here into a few lossless WebP sheets, and the
cries into MP3 chunks. js/core/assets.js reads them through assets/manifest.js.

    python3 tools/build_bundle.py --sprites <PokeAPI/sprites clone> --cries <PokeAPI/cries clone> \\
        --trainers <dir of Showdown trainer PNGs> [--out dist]

The sprites clone needs sprites/pokemon/{,back/,shiny/,back/shiny/}*.png and sprites/items/*.png,
the cries clone cries/pokemon/latest/*.ogg. Trainer sprites come from
https://play.pokemonshowdown.com/sprites/trainers/<name>.png for the names in tools/bundle_needs.js.
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET_MAX = 2048          # px per side, safe for mobile GPUs
CRY_CHUNK = 600 * 1024    # bytes per packed cry file


def crop_box(im, tile, least):
    """Square around the sprite's visible pixels, bottom-aligned, at least `least` px wide.

    PokeAPI sprites sit in mostly empty 96 px frames; cropping lets them fill their boxes in the UI
    the way the cropped Showdown animations of the online build do."""
    box = im.getbbox()
    if not box:
        return [0, 0, tile]
    l, t, r, b = box
    side = min(tile, max(r - l, b - t, least) + 2)
    x = min(max(0, round((l + r) / 2 - side / 2)), tile - side)
    y = min(max(0, b + 1 - side), tile - side)
    return [x, y, side]


def sheets(name, tile, entries, out, crop=0):
    """entries: [(key, path)] -> manifest group. Images are fitted into square tiles."""
    cols = SHEET_MAX // tile
    per = cols * cols
    keys, files, crops = [], [], []
    for start in range(0, len(entries), per):
        part = entries[start:start + per]
        rows = math.ceil(len(part) / cols)
        width = tile * (cols if rows > 1 else len(part))
        sheet = Image.new('RGBA', (width, tile * rows), (0, 0, 0, 0))
        for i, (key, path) in enumerate(part):
            im = Image.open(path).convert('RGBA')
            if im.width > tile or im.height > tile:
                im.thumbnail((tile, tile), Image.LANCZOS)
            x = (i % cols) * tile + (tile - im.width) // 2
            y = (i // cols) * tile + (tile - im.height) // 2
            sheet.paste(im, (x, y))
            keys.append(key)
            if crop:
                canvas = Image.new('RGBA', (tile, tile), (0, 0, 0, 0))
                canvas.paste(im, (x - (i % cols) * tile, y - (i // cols) * tile))
                crops.append(crop_box(canvas, tile, crop))
        rel = 'assets/%s-%d.webp' % (name, len(files))
        sheet.save(os.path.join(out, rel), 'WEBP', lossless=True, method=6, quality=100)
        files.append(rel)
    group = {'tile': tile, 'cols': cols, 'per': per, 'sheets': files, 'keys': keys}
    if crop:
        group['crop'] = crops
    return group


def encode_cry(src, dst):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '24000', '-b:a', '48k',
                    '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', dst], check=True)


def pack_cries(ids, cries_dir, out):
    tmp = tempfile.mkdtemp()
    todo = [(i, os.path.join(cries_dir, 'cries/pokemon/latest/%d.ogg' % i)) for i in ids]
    todo = [(i, p) for i, p in todo if os.path.exists(p)]
    with ThreadPoolExecutor(os.cpu_count() or 4) as ex:
        list(ex.map(lambda t: encode_cry(t[1], os.path.join(tmp, '%d.mp3' % t[0])), todo))
    chunks, idx, buf = [], {}, bytearray()

    def flush():
        rel = 'assets/cries-%d.mp3' % len(chunks)
        with open(os.path.join(out, rel), 'wb') as f:
            f.write(buf)
        chunks.append(rel)

    for i, _ in todo:
        data = open(os.path.join(tmp, '%d.mp3' % i), 'rb').read()
        if buf and len(buf) + len(data) > CRY_CHUNK:
            flush()
            buf = bytearray()
        idx[i] = [len(chunks), len(buf), len(data)]
        buf += data
    if buf:
        flush()
    shutil.rmtree(tmp)
    return {'chunks': chunks, 'idx': idx}


def page(out):
    """index.html as an artifact page body: the host adds doctype, head and body itself."""
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    head = re.search(r'<head>(.*)</head>', src, re.S).group(1)
    body = re.search(r'<body>(.*)</body>', src, re.S).group(1)
    head = '\n'.join(l for l in head.splitlines()
                     if l.strip() and 'charset' not in l and 'name="viewport"' not in l and 'rel="icon"' not in l)
    body = body.replace('<script src="js/core/assets.js"></script>',
                        '<script src="assets/manifest.js"></script>\n  <script src="js/core/assets.js"></script>')
    boot = ("<script>window.addEventListener('DOMContentLoaded', () => PW.Assets.boot(PW.UI.init));</script>")
    assert boot in body
    hot = """<script>
    // Keep progress when a new version of the page is delivered to an open viewer.
    window.claude?.hot?.snapshot?.(() => { if (PW.Game.s) PW.Game.save(); return {}; });
    window.addEventListener('DOMContentLoaded', () => {
      const start = () => PW.Assets.boot(PW.UI.init);
      if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start();
    });
  </script>"""
    body = body.replace(boot, hot)
    style = '<style>:root { color-scheme: dark; } body { background: #0f1424; }</style>'
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(head.strip() + '\n  ' + style + '\n' + body.strip() + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sprites', required=True)
    ap.add_argument('--cries', required=True)
    ap.add_argument('--trainers', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist'))
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'assets'))

    needs = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools/bundle_needs.js')]))
    spr = os.path.join(a.sprites, 'sprites')

    def mons(sub):
        base = os.path.join(spr, 'pokemon', sub)
        return [(pid, os.path.join(base, '%d.png' % pid)) for pid in needs['pokemon']
                if os.path.exists(os.path.join(base, '%d.png' % pid))]

    groups = {
        'front': sheets('front', 96, mons(''), out, crop=44),
        'back': sheets('back', 96, mons('back'), out, crop=44),
        'shiny': sheets('shiny', 96, mons('shiny'), out, crop=44),
        'backshiny': sheets('backshiny', 96, mons('back/shiny'), out, crop=44),
        'items': sheets('items', 32, [(k, os.path.join(spr, 'items', k + '.png')) for k in needs['items']
                                      if os.path.exists(os.path.join(spr, 'items', k + '.png'))], out),
        'trainers': sheets('trainers', 80, [(k, os.path.join(a.trainers, k + '.png')) for k in needs['trainers']
                                            if os.path.exists(os.path.join(a.trainers, k + '.png'))], out),
    }
    cries = pack_cries(needs['cries'], a.cries, out)
    manifest = {'groups': groups, 'cries': cries}
    with open(os.path.join(out, 'assets/manifest.js'), 'w') as f:
        f.write('window.PW_ASSETS = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')

    for d in ('css', 'js'):
        shutil.copytree(os.path.join(ROOT, d), os.path.join(out, d))
    page(out)

    for name, gr in groups.items():
        print('%-10s %5d sprites in %d sheet(s)' % (name, len(gr['keys']), len(gr['sheets'])))
    print('cries      %5d in %d chunk(s)' % (len(cries['idx']), len(cries['chunks'])))
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out) for f in fs)
    print('dist: %.1f MB, %d files' % (total / 1e6, sum(len(fs) for _, _, fs in os.walk(out))))


if __name__ == '__main__':
    main()

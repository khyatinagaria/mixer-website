"""Cut a drink photo out of its plain white background and add it to the cards.
usage: python3 -I scripts/cut-photo.py <photo> <drink_id> [threshold, default 228; lower also removes the grey shadow]
Writes public/photos/<drink_id>.png and refreshes src/lib/photos.json (the list the cards read)."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
src, did = sys.argv[1], sys.argv[2]
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 228
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
im = Image.open(src).convert('RGB')
if max(im.size) > 1200: im.thumbnail((1200, 1200), Image.LANCZOS)
a = np.asarray(im).astype(np.int16); mx, mn = a.max(2), a.min(2)
bgish = (mn > thr) & (mx - mn < 16)
reg = np.zeros_like(bgish); reg[0, :] = reg[-1, :] = reg[:, 0] = reg[:, -1] = True; reg &= bgish
while True:  # grow from the edges through background-coloured pixels only
    d = reg.copy(); d[1:] |= reg[:-1]; d[:-1] |= reg[1:]; d[:, 1:] |= reg[:, :-1]; d[:, :-1] |= reg[:, 1:]; d &= bgish
    if (d == reg).all(): break
    reg = d
A = Image.fromarray(np.where(reg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(A); out = out.crop(out.getbbox())
h = 440; out = out.resize((round(out.width * h / out.height), h), Image.LANCZOS)
os.makedirs(os.path.join(root, 'public/photos'), exist_ok=True)
out.save(os.path.join(root, 'public/photos', did + '.png'), optimize=True)
ids = sorted(f[:-4] for f in os.listdir(os.path.join(root, 'public/photos')) if f.endswith('.png'))
json.dump(ids, open(os.path.join(root, 'src/lib/photos.json'), 'w'))
print('saved', did, out.size, '| photos now:', len(ids))

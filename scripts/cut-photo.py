"""Cut a drink photo out of its plain white background and add it to the cards.
usage: python3 -I scripts/cut-photo.py <photo> <drink_id> [grey threshold, default 120] [background tolerance, default 0] [edge limit, default 2; 0 = colour only]
The default treats smooth grey areas joined to the edge as background, which keeps clear glass and drops soft shadows.
Writes public/photos/<drink_id>.webp and refreshes src/lib/photos.json (the list the cards read)."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
src, did = sys.argv[1], sys.argv[2]
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 120
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
im = Image.open(src).convert('RGB')
if max(im.size) > 1200: im.thumbnail((1200, 1200), Image.LANCZOS)
a = np.asarray(im).astype(np.int16); mx, mn = a.max(2), a.min(2)
ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)  # the photo's own background tone
tol = int(sys.argv[4]) if len(sys.argv) > 4 else 0
near = np.abs(a - ref).max(2) < tol
bgish = near | ((mn > thr) & (mx - mn < 18))  # background, plus soft grey shadows / steam
edge = int(sys.argv[5]) if len(sys.argv) > 5 else 2
if edge > 0:  # [edge limit, 0 = off]: for uneven backgrounds, background is wherever the photo is smooth and grey
    g = np.asarray(im.convert('L').filter(ImageFilter.GaussianBlur(1.5))).astype(np.int16)
    grad = np.maximum(np.abs(np.diff(g, axis=0, append=g[-1:])), np.abs(np.diff(g, axis=1, append=g[:, -1:])))
    grad = np.asarray(Image.fromarray(grad.astype(np.uint8)).filter(ImageFilter.MaxFilter(3)))
    bgish = (mx - mn < 18) & (mn > thr) & (grad < edge)
reg = np.zeros_like(bgish); reg[0, :] = reg[-1, :] = reg[:, 0] = reg[:, -1] = True; reg &= bgish
while True:  # grow from the edges through background-coloured pixels only
    d = reg.copy(); d[1:] |= reg[:-1]; d[:-1] |= reg[1:]; d[:, 1:] |= reg[:, :-1]; d[:, :-1] |= reg[:, 1:]; d &= bgish
    if (d == reg).all(): break
    reg = d
# keep only the biggest piece, so stray wisps of steam or shadow don't survive
fg = ~reg
from collections import deque
H, W = fg.shape; lab = np.zeros(fg.shape, np.int32); best, bestn, cur = 0, 0, 0
small = fg[::4, ::4]; labs = np.zeros(small.shape, np.int32); h2, w2 = small.shape
for y0 in range(h2):
    for x0 in range(w2):
        if small[y0, x0] and not labs[y0, x0]:
            cur += 1; n = 0; q = deque([(y0, x0)]); labs[y0, x0] = cur
            while q:
                y, x = q.popleft(); n += 1
                for yy, xx in ((y+1, x), (y-1, x), (y, x+1), (y, x-1)):
                    if 0 <= yy < h2 and 0 <= xx < w2 and small[yy, xx] and not labs[yy, xx]: labs[yy, xx] = cur; q.append((yy, xx))
            if n > bestn: best, bestn = cur, n
keep = np.kron(labs == best, np.ones((4, 4), bool))[:H, :W]
keep = np.asarray(Image.fromarray(keep).filter(ImageFilter.MaxFilter(9)))
reg = reg | ~keep
A = Image.fromarray(np.where(reg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(A); out = out.crop(out.getbbox())
h = 440; out = out.resize((round(out.width * h / out.height), h), Image.LANCZOS)
os.makedirs(os.path.join(root, 'public/photos'), exist_ok=True)
out.save(os.path.join(root, 'public/photos', did + '.webp'), quality=82, method=6)
ids = sorted(f[:-5] for f in os.listdir(os.path.join(root, 'public/photos')) if f.endswith('.webp'))
json.dump(ids, open(os.path.join(root, 'src/lib/photos.json'), 'w'))
print('saved', did, out.size, '| photos now:', len(ids))

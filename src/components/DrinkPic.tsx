import artBoxes from '../lib/artBoxes.json';

import photoIds from '../lib/photos.json';

/** Real cut-out photos, where we have one (add more with scripts/cut-photo.py). Every other drink uses its illustration. */
const PHOTOS = new Set(photoIds as string[]);

const boxes = artBoxes as Record<string, number[]>;

/** The drink on its own (no background), cropped tight so it can sit on a card. */
export default function DrinkPic({ id, className }: { id: string; className?: string }) {
  if (PHOTOS.has(id)) return <img className={className} src={`/photos/${id}.png`} alt="" aria-hidden loading="lazy" decoding="async" />;
  const b = boxes[id]; if (!b) return null;
  const pad = 4, [x, y, w, h] = [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2];
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMax meet" aria-hidden focusable="false">
      <image href={`/art/${id}.svg`} x="0" y="0" width="400" height="400" />
    </svg>
  );
}

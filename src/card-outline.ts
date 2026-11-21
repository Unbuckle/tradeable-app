/**
 * Pure geometry of the live card outline, kept free of React Native so `node --test` can run it.
 * The functions marked 'worklet' also run on the camera's frame thread.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four corners: top-left, top-right, bottom-right, bottom-left. */
export type Quad = Point[];

/** A card is 63 x 88 mm (0.72); tilting it towards the camera squeezes one side. */
const MIN_RATIO = 0.6;
const MAX_RATIO = 0.85;
/** The card must fill at least this share of the frame, as on the server. */
const MIN_AREA = 0.08;

/**
 * Clockwise on screen from the corner nearest the top-left. Sorting by angle keeps four distinct corners
 * even for a card turned 45 degrees, where the server's sum/difference picks can name one corner twice.
 */
export function orderCorners(points: Point[]): Quad {
  'worklet';
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let first = 0;
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[first].x + sorted[first].y) first = i;
  });
  return [...sorted.slice(first), ...sorted.slice(0, first)];
}

export function polygonArea(quad: Quad): number {
  'worklet';
  let sum = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Short side over long side, each the mean of two opposite sides. */
export function sideRatio(quad: Quad): number {
  'worklet';
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const across = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
  const down = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
  return Math.min(across, down) / Math.max(across, down, 1);
}

/** Big enough and shaped like a card, upright or lying sideways. */
export function isCardShaped(quad: Quad, width: number, height: number): boolean {
  'worklet';
  const ratio = sideRatio(quad);
  return polygonArea(quad) >= MIN_AREA * width * height && ratio >= MIN_RATIO && ratio <= MAX_RATIO;
}

/** Corners of OpenCV's rotated rectangle (centre, size, angle in degrees), as in the server's card finder. */
export function rotatedBox(rect: { x: number; y: number; width: number; height: number; angle: number }): Point[] {
  'worklet';
  const rad = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(rad) / 2;
  const sin = Math.sin(rad) / 2;
  const { x, y, width: w, height: h } = rect;
  const p0 = { x: x - sin * h - cos * w, y: y + cos * h - sin * w };
  const p1 = { x: x + sin * h - cos * w, y: y - cos * h - sin * w };
  return [p0, p1, { x: 2 * x - p0.x, y: 2 * y - p0.y }, { x: 2 * x - p1.x, y: 2 * y - p1.y }];
}

export function scaleQuad(quad: Quad, sx: number, sy: number): Quad {
  'worklet';
  return quad.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

/** Moves the shown outline part of the way to the new one, so it does not jitter. */
export function smoothQuad(previous: Quad | null, next: Quad, weight = 0.5): Quad {
  if (!previous) return next;
  return next.map((p, i) => ({
    x: previous[i].x + (p.x - previous[i].x) * weight,
    y: previous[i].y + (p.y - previous[i].y) * weight,
  }));
}

/** The largest distance any corner moved between two outlines. */
export function cornerShift(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

export interface Sample {
  /** Milliseconds. */
  at: number;
  quad: Quad;
}

/**
 * True once the outline has been seen for `holdMs` and no corner in that time strayed more than
 * `tolerance` from where it is now.
 */
export function isSteady(samples: Sample[], now: number, holdMs: number, tolerance: number): boolean {
  if (!samples.length || samples[0].at > now - holdMs) return false;
  const latest = samples[samples.length - 1].quad;
  return samples.filter((s) => s.at >= now - holdMs).every((s) => cornerShift(s.quad, latest) <= tolerance);
}

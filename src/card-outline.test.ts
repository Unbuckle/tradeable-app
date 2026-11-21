import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cornerShift,
  isCardShaped,
  isSteady,
  orderCorners,
  rotatedBox,
  scaleQuad,
  sideRatio,
  smoothQuad,
  type Quad,
} from './card-outline.ts';

const card: Quad = [
  { x: 100, y: 100 },
  { x: 163, y: 100 },
  { x: 163, y: 188 },
  { x: 100, y: 188 },
];

test('corners come back top-left first, clockwise, whatever order they were found in', () => {
  assert.deepEqual(orderCorners([card[2], card[0], card[3], card[1]]), card);
});

test('a card turned 45 degrees keeps four distinct corners', () => {
  const diamond = [
    { x: 50, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 50 },
  ];
  const ordered = orderCorners([diamond[2], diamond[1], diamond[3], diamond[0]]);
  assert.equal(new Set(ordered.map((p) => `${p.x},${p.y}`)).size, 4);
  assert.deepEqual(ordered, diamond);
});

test('a card held upright or sideways is card-shaped; a square or a sliver is not', () => {
  assert.ok(Math.abs(sideRatio(card) - 63 / 88) < 0.001);
  assert.ok(isCardShaped(card, 192, 256));
  const sideways = orderCorners(card.map((p) => ({ x: p.y, y: p.x })));
  assert.ok(isCardShaped(sideways, 256, 192));
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  assert.ok(!isCardShaped(square, 192, 256));
  const sliver = scaleQuad(card, 1, 0.3);
  assert.ok(!isCardShaped(sliver, 192, 256));
});

test('a card filling too little of the frame is ignored', () => {
  assert.ok(!isCardShaped(scaleQuad(card, 0.5, 0.5), 192, 256));
});

test('a rotated rectangle gives the corners of that rectangle', () => {
  const box = orderCorners(rotatedBox({ x: 50, y: 60, width: 40, height: 20, angle: 0 }));
  assert.deepEqual(
    box.map((p) => [Math.round(p.x), Math.round(p.y)]),
    [
      [30, 50],
      [70, 50],
      [70, 70],
      [30, 70],
    ],
  );
});

test('smoothing moves halfway to the new outline; the first outline is shown as is', () => {
  const moved = scaleQuad(card, 1.1, 1);
  assert.equal(smoothQuad(null, moved), moved);
  assert.equal(smoothQuad(card, moved)[1].x, (163 + 163 * 1.1) / 2);
});

test('steady only after the outline held still for the whole hold time', () => {
  const at = (ms: number, dx = 0) => ({ at: ms, quad: card.map((p) => ({ x: p.x + dx, y: p.y })) });
  assert.ok(!isSteady([], 1000, 500, 5));
  assert.ok(!isSteady([at(700), at(1000)], 1000, 500, 5), 'seen for only 300 ms');
  assert.ok(isSteady([at(400), at(700), at(1000, 2)], 1000, 500, 5));
  assert.ok(!isSteady([at(400), at(700, 20), at(1000)], 1000, 500, 5), 'moved within the hold time');
  assert.ok(isSteady([at(100, 50), at(450), at(1000)], 1000, 500, 5), 'older moves do not count');
  assert.equal(cornerShift(card, at(0, 3).quad), 3);
});

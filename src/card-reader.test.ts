import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCard, sameCard } from './card-reader.ts';

test('reads the title and collector line of a recent card', () => {
  const read = readCard([
    { text: '0123 R', top: 900, left: 20 },
    { text: 'Llanowar Elves', top: 30, left: 25 },
    { text: 'Creature — Elf Druid', top: 520, left: 25 },
    { text: 'MH3 • EN', top: 930, left: 20 },
  ]);
  assert.equal(read.name, 'Llanowar Elves');
  assert.equal(read.setCode, 'MH3');
  assert.equal(read.collectorNumber, '123');
});

test('skips mana costs and numbers when looking for the title', () => {
  const read = readCard([
    { text: '2', top: 28, left: 400 },
    { text: "Serra's Angel", top: 30, left: 25 },
  ]);
  assert.equal(read.name, "Serra's Angel");
  assert.equal(read.setCode, null);
});

test('two reads match on set and number, or on name and number without a set', () => {
  const base = { language: null, foil: null };
  assert.ok(sameCard({ ...base, setCode: 'M19', collectorNumber: '5', name: 'A' }, { ...base, setCode: 'M19', collectorNumber: '5', name: 'B' }));
  assert.ok(sameCard({ ...base, setCode: null, collectorNumber: null, name: 'Shivan Dragon' }, { ...base, setCode: null, collectorNumber: null, name: 'Shivan Dragon' }));
  assert.ok(!sameCard({ ...base, setCode: null, collectorNumber: null, name: null }, { ...base, setCode: null, collectorNumber: null, name: null }));
});

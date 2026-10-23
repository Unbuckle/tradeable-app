import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCollectorLine } from './collector-line.ts';

test('reads the 2023+ layout', () => {
  assert.deepEqual(parseCollectorLine('0123 R\nMH3 • EN  Some Artist'), {
    setCode: 'MH3',
    collectorNumber: '123',
    language: 'en',
    foil: false,
  });
});

test('reads the 2014-2022 layout with a foil star', () => {
  assert.deepEqual(parseCollectorLine('Illus. Someone\n045/274 U\nM19 ★ DE'), {
    setCode: 'M19',
    collectorNumber: '45',
    language: 'de',
    foil: true,
  });
});

test('keeps the letter suffix of a collector number', () => {
  assert.equal(parseCollectorLine('12a C\nAFR • EN').collectorNumber, '12a');
});

test('fixes the letter O read in place of a zero', () => {
  assert.equal(parseCollectorLine('O12O R\nWOE • EN').collectorNumber, '120');
});

test('older cards give a number but no set code', () => {
  assert.deepEqual(parseCollectorLine('Illus. Artist\n™ & © 2004 Wizards\n123/306'), {
    setCode: null,
    collectorNumber: '123',
    language: null,
    foil: null,
  });
});

test('nothing readable gives nulls', () => {
  assert.deepEqual(parseCollectorLine('Lightning Bolt\nInstant'), {
    setCode: null,
    collectorNumber: null,
    language: null,
    foil: null,
  });
});

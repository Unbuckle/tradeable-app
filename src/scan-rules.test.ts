import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64Bytes, defaultSettings, defaultsSummary, fitLongSide, pickSku, wantedFinish } from './scan-rules.ts';

const sku = (id: string, finish: string | null, language = 'en', is_active = true) => ({
  id,
  category: 'single',
  is_active,
  finish,
  language,
});

test('the star on the card forces foil', () => {
  assert.equal(wantedFinish([sku('a', 'nonfoil')], false, true), 'foil');
});

test('prefer foil picks foil only when the printing comes in foil', () => {
  assert.equal(wantedFinish([sku('a', 'nonfoil'), sku('b', 'foil')], true, null), 'foil');
  assert.equal(wantedFinish([sku('a', 'nonfoil'), sku('b', 'foil', 'en', false)], true, null), 'nonfoil');
  assert.equal(wantedFinish([sku('a', 'nonfoil'), sku('b', 'foil')], false, null), 'nonfoil');
});

test('picks the SKU with the wanted finish and language, else the language, else anything', () => {
  const skus = [sku('en', 'nonfoil'), sku('enf', 'foil'), sku('de', 'nonfoil', 'de')];
  assert.equal(pickSku(skus, { finish: 'foil', language: 'en' })?.id, 'enf');
  assert.equal(pickSku(skus, { finish: 'foil', language: 'de' })?.id, 'de');
  assert.equal(pickSku(skus, { finish: 'nonfoil', language: 'ja' })?.id, 'en');
  assert.equal(pickSku([], { finish: 'foil', language: 'en' }), null);
});

test('summarises the defaults', () => {
  assert.equal(defaultsSummary({ ...defaultSettings, preferFoil: true, ignorePromos: true }, 'NM'), 'EN · NM · foil · no promos');
  assert.equal(defaultsSummary({ ...defaultSettings, language: 'de' }, undefined), 'DE');
});

test('shrinks the long side to 1600 px and never enlarges', () => {
  assert.deepEqual(fitLongSide(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(fitLongSide(800, 600), { width: 800, height: 600 });
});

test('counts the bytes in base64', () => {
  assert.equal(base64Bytes(Buffer.from('hello').toString('base64')), 5);
  assert.equal(base64Bytes(Buffer.from('hell').toString('base64')), 4);
});

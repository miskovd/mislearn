import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, clampRating, normalizeWordKey, parseCsv, wordsToCsv } from '../src/lib/csv.ts';
import { nextPracticeWord } from '../src/lib/training.ts';

test('learn ratings are constrained to the supported range', () => {
  assert.equal(clampRating(-10), -3);
  assert.equal(clampRating(10), 3);
  assert.equal(clampRating(1.9), 1);
});

test('CSV escapes, parses quoted fields, and skips invalid rows', () => {
  const csv = wordsToCsv([{ id: 1, word: 'work', translation: 'travail', context: 'He said "work, now".', learnRating: -1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
  const parsed = parseCsv(`${csv}\n,missing,-,0\nother,x,y,4`);
  assert.deepEqual(parsed.entries, [{ word: 'work', translation: 'travail', context: 'He said "work, now".', learnRating: -1 }]);
  assert.equal(parsed.skipped, 2);
});

test('duplicate comparison ignores casing and extra spaces', () => {
  assert.equal(normalizeWordKey('  Work   hard '), normalizeWordKey('work hard'));
});

test('trainer chooses the lowest-rated different word when one is available', () => {
  const words = [
    { id: 1, word: 'first', translation: '', context: '', learnRating: -2, createdAt: '', updatedAt: '' },
    { id: 2, word: 'second', translation: '', context: '', learnRating: -3, createdAt: '', updatedAt: '' },
    { id: 3, word: 'third', translation: '', context: '', learnRating: -3, createdAt: '', updatedAt: '' }
  ];

  assert.equal(nextPracticeWord(words, 1, () => 0)?.id, 2);
  assert.equal(nextPracticeWord(words, 2, () => 0.99)?.id, 3);
  assert.equal(nextPracticeWord([words[1]], 2)?.id, 2);
});

test('import conflict option keeps local values or replaces the whole imported card', () => {
  const existing = [{ id: 1, word: ' Work ', translation: 'local', context: 'local context', learnRating: -2, createdAt: '', updatedAt: '' }];
  const imported = [{ word: 'work', translation: 'imported', context: 'imported context', learnRating: 3 }];

  assert.deepEqual(buildImportPlan(existing, imported, 'keep'), { creates: [], updates: [], skipped: 1 });
  assert.deepEqual(buildImportPlan(existing, imported, 'replace'), {
    creates: [],
    updates: [{ id: 1, payload: imported[0] }],
    skipped: 0
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemCounts, score } from './multilabel.ts';

const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

test('item counts', () => {
  assert.deepEqual(itemCounts([1, 2], [2, 3]), { tp: 1, fp: 1, fn: 1, jaccard: 1 / 3, exact: false });
  assert.deepEqual(itemCounts([1], [1]), { tp: 1, fp: 0, fn: 0, jaccard: 1, exact: true });
  assert.deepEqual(itemCounts([], []), { tp: 0, fp: 0, fn: 0, jaccard: 1, exact: true });
  assert.equal(itemCounts([1, 1, 2], [1]).fn, 1, 'duplicates are sets');
});

// Worked by hand; matches scikit-learn on the same indicator matrix with zero_division=0:
//   gold = [[1,2],[3]], pred = [[1],[3,4]]
//   micro: tp 2, fp 1, fn 1 -> P = R = F1 = 2/3
//   per label: 1 -> P1 R1; 2 -> P0 R0; 3 -> P1 R1; 4 -> P0 R0  => macro P = R = F1 = 0.5
//   exact 0/2, jaccard mean(1/2, 1/2) = 0.5, hamming (1+1 wrong cells) / (2 items * 4 labels) = 0.25
test('micro, macro, exact, jaccard, hamming', () => {
  const s = score([{ id: 'a', gold: [1, 2], pred: [1] }, { id: 'b', gold: [3], pred: [3, 4] }]);
  close(s.micro.precision, 2 / 3); close(s.micro.recall, 2 / 3); close(s.micro.f1, 2 / 3);
  close(s.macro.precision, 0.5); close(s.macro.recall, 0.5); close(s.macro.f1, 0.5);
  assert.equal(s.macro.labels, 4);
  close(s.exactMatch, 0); close(s.jaccard, 0.5); close(s.hammingLoss, 0.25); close(s.anyOverlap, 1);
  assert.deepEqual({ ...s.perLabel.get(2) }, { tp: 0, fp: 0, fn: 1, support: 1, predicted: 0, precision: 0, recall: 0, f1: 0 });
});

test('a fixed label universe includes labels that never occur', () => {
  const s = score([{ id: 1, gold: [1], pred: [1] }], [1, 2, 3, 4]);
  close(s.micro.f1, 1);
  close(s.macro.f1, 0.25, 'three unseen labels score 0');
  close(s.hammingLoss, 0);
  assert.equal(s.perLabel.size, 4);
});

test('labels outside a fixed universe are ignored per label but still count in micro', () => {
  const s = score([{ id: 1, gold: [1], pred: [1, 99] }], [1]);
  assert.equal(s.perLabel.has(99), false);
  close(s.micro.precision, 0.5);
});

test('weights scale counts', () => {
  const items = [{ id: 'a', gold: [1], pred: [1], weight: 3 }, { id: 'b', gold: [2], pred: [3], weight: 1 }];
  const s = score(items);
  assert.equal(s.micro.tp, 3); assert.equal(s.micro.fp, 1); assert.equal(s.micro.fn, 1);
  close(s.exactMatch, 0.75);
});

test('empty predictions', () => {
  const s = score([{ id: 1, gold: [1], pred: [] }, { id: 2, gold: [2], pred: [2] }]);
  close(s.emptyPred, 0.5); close(s.micro.precision, 1); close(s.micro.recall, 0.5);
});

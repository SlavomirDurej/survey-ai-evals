import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corpusChrf, sentenceChrf } from './chrf.ts';

// Reference values from sacrebleu 2.6.0, CHRF() defaults
// (signature nrefs:1|case:mixed|eff:yes|nc:6|nw:0|space:no).
const cases: [string, string, number][] = [
  ['The cat sat on the mat.', 'The cat is sitting on the mat.', 49.6485170311433],
  ['Hello world', 'Goodbye world', 27.628102678159372],
  ['abc', 'xyz', 0],
  ['Patients need clearer information about prices.', 'Patients want clearer pricing information.', 56.541565995166025],
];

test('sentence chrF matches sacrebleu', () => {
  for (const [h, r, want] of cases) assert.ok(Math.abs(sentenceChrf(h, r) - want) < 1e-9, `${h} -> ${sentenceChrf(h, r)} vs ${want}`);
});

test('corpus chrF pools statistics and matches sacrebleu', () => {
  const got = corpusChrf(cases.map(([hyp, ref]) => ({ hyp, ref })));
  assert.ok(Math.abs(got - 49.51167897873307) < 1e-9, `${got}`);
});

test('identical strings score 100, whitespace is ignored', () => {
  assert.equal(sentenceChrf('same text', 'same text'), 100);
  assert.equal(sentenceChrf('sametext', 'same  text'), 100);
});

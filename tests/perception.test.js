import test from 'node:test';
import assert from 'node:assert/strict';

import { PerceptionSystem } from '../src/sim/systems/PerceptionSystem.js';

const points = [
  { id: 'a', x: 0, y: 0, ok: false },
  { id: 'b', x: 10, y: 0, ok: true },
  { id: 'c', x: 8, y: 0, ok: true }
];

test('perception nearest returns nearest item within radius and predicate', () => {
  const nearestAny = PerceptionSystem.nearest(0, 0, points, 20);
  assert.equal(nearestAny.id, 'a');

  const nearestFiltered = PerceptionSystem.nearest(0, 0, points, 20, (p) => p.ok);
  assert.equal(nearestFiltered.id, 'c');

  const noneInRange = PerceptionSystem.nearest(0, 0, points, 5, (p) => p.ok);
  assert.equal(noneInRange, null);
});

test('perception within returns all matches in radius', () => {
  const found = PerceptionSystem.within(0, 0, points, 9);
  assert.deepEqual(found.map((p) => p.id).sort(), ['a', 'c']);
});

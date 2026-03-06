import test from 'node:test';
import assert from 'node:assert/strict';

import { SIM_CONFIG } from '../src/sim/config.js';
import { WorldState } from '../src/sim/world/WorldState.js';

const makeWorld = () => new WorldState(structuredClone(SIM_CONFIG));

test('world state clamps food coordinates and preserves amount', () => {
  const world = makeWorld();

  world.addFood(-200, world.height + 500, 42);

  assert.equal(world.food.length, 1);
  assert.equal(world.food[0].x, 0);
  assert.equal(world.food[0].y, world.height);
  assert.equal(world.food[0].amount, 42);
  assert.equal(world.food[0].maxAmount, 42);
});

test('world setNest updates only targeted colony', () => {
  const world = makeWorld();
  world.addColony({ id: 'a', nest: { established: false, x: 0, y: 0 } });
  world.addColony({ id: 'b', nest: { established: false, x: 0, y: 0 } });

  world.setNest('b', world.width + 5, -20);

  assert.equal(world.getColony('a').nest.established, false);
  assert.equal(world.getColony('b').nest.established, true);
  assert.equal(world.getColony('b').nest.x, world.width);
  assert.equal(world.getColony('b').nest.y, 0);
});

test('world prune removes depleted food nodes', () => {
  const world = makeWorld();
  world.food = [
    { id: 'f1', x: 1, y: 1, amount: 0.2, maxAmount: 5 },
    { id: 'f2', x: 2, y: 2, amount: 0.6, maxAmount: 5 }
  ];

  world.prune();

  assert.deepEqual(world.food.map((f) => f.id), ['f2']);
});

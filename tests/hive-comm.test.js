import test from 'node:test';
import assert from 'node:assert/strict';

import { SIM_CONFIG } from '../src/sim/config.js';
import { HiveCommSystem } from '../src/sim/systems/HiveCommSystem.js';

const setup = () => {
  const config = structuredClone(SIM_CONFIG);
  const world = { width: 200, height: 120 };
  return { config, world, comm: new HiveCommSystem(config, world) };
};

test('hive comm trail deposit and gradient lookup works', () => {
  const { comm } = setup();

  comm.depositTrail('food', 50, 50, 10, 1);
  comm.depositTrail('food', 70, 50, 15, 1);

  const value = comm.trailValue('food', 70, 50);
  assert.ok(value > 0);

  const gradient = comm.vectorToTrailPeak('food', 50, 50);
  assert.ok(gradient.value >= value || gradient.value > 0);
});

test('hive comm signal and memory filtering/merge works', () => {
  const { comm } = setup();

  comm.addSignal({ type: 'food_found', x: 10, y: 10, radius: 20, ttl: 2, strength: 1 });
  comm.addSignal({ type: 'threat_seen', x: 90, y: 10, radius: 20, ttl: 2, strength: 1 });

  const nearbyFood = comm.getSignalsNear(12, 10, 25, ['food_found']);
  assert.equal(nearbyFood.length, 1);
  assert.equal(nearbyFood[0].type, 'food_found');

  comm.remember({ type: 'food', x: 30, y: 30, ttl: 20, confidence: 0.5 });
  comm.remember({ type: 'food', x: 36, y: 33, ttl: 50, confidence: 0.5 });

  assert.equal(comm.memory.length, 1);
  assert.ok(comm.memory[0].ttl >= 50);
  assert.ok(comm.memory[0].confidence > 0.5);
});

test('hive comm step decays trails and expires low ttl entries', () => {
  const { comm } = setup();

  comm.depositTrail('danger', 20, 20, 5, 1);
  const before = comm.trailValue('danger', 20, 20);

  comm.addSignal({ type: 'threat_seen', x: 20, y: 20, ttl: 1 });
  comm.remember({ type: 'threat', x: 20, y: 20, ttl: 1, confidence: 0.06 });

  comm.step();

  const after = comm.trailValue('danger', 20, 20);
  assert.ok(after < before);
  assert.equal(comm.signals.length, 0);
  assert.equal(comm.memory.length, 0);
});

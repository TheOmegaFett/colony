import test from 'node:test';
import assert from 'node:assert/strict';

import { Agent } from '../src/sim/agents/Agent.js';

test('agent takeDamage transitions alive -> dead at zero hp', () => {
  const agent = new Agent({ id: 'a1', role: 'test', x: 0, y: 0, hp: 10 });

  agent.takeDamage(4);
  assert.equal(agent.alive, true);
  assert.equal(agent.hp, 6);

  agent.takeDamage(9);
  assert.equal(agent.hp, 0);
  assert.equal(agent.alive, false);
});

test('agent aging expires when max age reached', () => {
  const agent = new Agent({ id: 'a2', role: 'test', x: 0, y: 0, maxAgeTicks: 2 });

  assert.equal(agent.tickAging(), false);
  assert.equal(agent.alive, true);

  assert.equal(agent.tickAging(), true);
  assert.equal(agent.alive, false);
});

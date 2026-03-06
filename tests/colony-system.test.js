import test from 'node:test';
import assert from 'node:assert/strict';

import { SIM_CONFIG } from '../src/sim/config.js';
import { ColonySystem } from '../src/sim/systems/ColonySystem.js';

const makeHarness = () => {
  const config = structuredClone(SIM_CONFIG);
  const colonySystem = new ColonySystem(config);

  const queenDamage = { count: 0 };
  const hive = {
    id: 'hive_1',
    nest: { established: true, x: 100, y: 100 },
    queen: {
      alive: true,
      hp: 100,
      x: 100,
      y: 100,
      takeDamage: () => {
        queenDamage.count += 1;
      }
    },
    drones: [],
    soldiers: [],
    brood: []
  };

  const world = {
    tick: 1,
    threats: [],
    soldiers: [],
    drones: [],
    queens: []
  };

  const comm = {
    trailValue: () => 0
  };

  const relationTo = () => 'neutral';

  return { config, colonySystem, hive, world, comm, relationTo, queenDamage };
};

test('colony system consumes food stock and converts food to energy', () => {
  const { colonySystem, hive, world, comm, relationTo } = makeHarness();

  const colony = {
    energy: 8,
    foodStock: 80,
    health: 100,
    dangerLevel: 0,
    priority: 'FORAGE',
    foodIncomeRecent: 0,
    starvationTicks: 0,
    successionCount: 0
  };

  colonySystem.update(colony, hive, world, comm, relationTo);

  assert.ok(colony.foodStock < 80);
  assert.ok(colony.energy > 8);
  assert.equal(colony.starvationTicks, 0);
});

test('colony system increments starvation and damages queen with no food', () => {
  const { config, colonySystem, hive, world, comm, relationTo, queenDamage } = makeHarness();

  world.tick = config.colony.starvationQueenDamageTicks;

  const colony = {
    energy: 2,
    foodStock: 0,
    health: 100,
    dangerLevel: 0,
    priority: 'FORAGE',
    foodIncomeRecent: 0,
    starvationTicks: 0,
    successionCount: 0
  };

  colonySystem.update(colony, hive, world, comm, relationTo);

  assert.equal(colony.starvationTicks, 1);
  assert.ok(colony.energy < 2);
  assert.equal(queenDamage.count, 1);
});

test('colony priority switches to DEFEND at high danger', () => {
  const { colonySystem, hive, world, relationTo } = makeHarness();

  const comm = {
    trailValue: () => 3
  };

  world.threats = [{ alive: true, x: 101, y: 101 }];

  const colony = {
    energy: 200,
    foodStock: 300,
    health: 100,
    dangerLevel: 0,
    priority: 'FORAGE',
    foodIncomeRecent: 0,
    starvationTicks: 0,
    successionCount: 0
  };

  colonySystem.update(colony, hive, world, comm, relationTo);

  assert.equal(colony.priority, 'DEFEND');
  assert.ok(colony.dangerLevel > 50);
});

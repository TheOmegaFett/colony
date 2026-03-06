import test from 'node:test';
import assert from 'node:assert/strict';

import { Simulation } from '../src/sim/Simulation.js';
import { ClientCommandType } from '../src/shared/protocol.js';

test('simulation boots with baseline colony and entities', () => {
  const sim = new Simulation();
  const snap = sim.snapshot();

  assert.equal(snap.world.width, 2400);
  assert.equal(snap.world.height, 1600);
  assert.equal(snap.colonies.length, 1);
  assert.ok(snap.queens.length >= 1);
  assert.ok(snap.drones.length >= 1);
  assert.ok(snap.soldiers.length >= 1);
});

test('spawn commands add food, threats, and colonies', () => {
  const sim = new Simulation();

  const foodBefore = sim.world.food.length;
  const threatBefore = sim.world.threats.length;
  const colonyBefore = sim.world.colonies.length;

  sim.queueCommand({ type: ClientCommandType.SPAWN_FOOD, x: 150, y: 200 });
  sim.queueCommand({ type: ClientCommandType.SPAWN_THREAT, x: 220, y: 260 });
  sim.queueCommand({ type: ClientCommandType.SPAWN_COLONY, x: 300, y: 300, mode: 'friendly' });

  sim.tick();

  assert.ok(sim.world.food.length > foodBefore);
  assert.ok(sim.world.threats.length > threatBefore);
  assert.ok(sim.world.colonies.length > colonyBefore);
});

test('friendly colonies are allied when diplomacy updates', () => {
  const sim = new Simulation();
  const primary = sim.world.colonies[0];
  primary.mode = 'friendly';

  const other = sim.createColony({ x: 900, y: 900, mode: 'friendly' });

  primary.colony.energy = 200;
  primary.colony.foodStock = 200;
  other.colony.energy = 200;
  other.colony.foodStock = 200;

  sim.updateDiplomacy();

  assert.equal(sim.relationBetween(primary.id, other.id), 'ally');
});

test('competitive colonies can turn hostile under scarcity', () => {
  const sim = new Simulation();
  const a = sim.world.colonies[0];
  const b = sim.createColony({
    x: Math.min(sim.world.width - 60, a.queen.x + 120),
    y: Math.min(sim.world.height - 60, a.queen.y + 120),
    mode: 'competitive'
  });

  a.mode = 'competitive';
  a.colony.energy = 0;
  a.colony.foodStock = 0;
  b.colony.energy = 0;
  b.colony.foodStock = 0;

  sim.world.food = [];
  sim.updateDiplomacy();

  assert.equal(sim.relationBetween(a.id, b.id), 'hostile');
});

test('queen succession promotes oldest drone when food reserve allows it', () => {
  const sim = new Simulation();
  const hive = sim.world.colonies[0];
  const drones = sim.world.drones.filter((d) => d.colonyId === hive.id);

  assert.ok(drones.length >= 2);

  hive.colony.foodStock = sim.config.colony.successionFoodCost + 20;

  for (const d of drones) {
    d.speed = 0;
    d.vx = 0;
    d.vy = 0;
    d.ageTicks = 0;
  }

  drones[0].ageTicks = 10;
  drones[1].ageTicks = drones[1].maxAgeTicks * 0.65;
  drones[1].x = 321;
  drones[1].y = 432;

  const oldQueenId = hive.queen.id;
  const promotedCandidateId = drones[1].id;
  const promotedCandidateStart = { x: drones[1].x, y: drones[1].y };
  hive.queen.takeDamage(99999);

  sim.tick();

  const newQueen = sim.world.queens.find((q) => q.colonyId === hive.id && q.alive);

  assert.ok(newQueen);
  assert.notEqual(newQueen.id, oldQueenId);
  assert.equal(hive.colony.successionCount, 1);
  assert.ok(hive.colony.foodStock < sim.config.colony.successionFoodCost + 20);
  assert.ok(Math.abs(newQueen.x - promotedCandidateStart.x) < 8);
  assert.ok(Math.abs(newQueen.y - promotedCandidateStart.y) < 8);
  assert.equal(sim.world.drones.some((d) => d.id === promotedCandidateId), false);
});

test('food regen pool reduces age for queen and older workers', () => {
  const sim = new Simulation();
  const hive = sim.world.colonies[0];
  const workers = [
    ...sim.world.soldiers.filter((s) => s.colonyId === hive.id),
    ...sim.world.drones.filter((d) => d.colonyId === hive.id)
  ];

  assert.ok(workers.length >= 3);

  hive.colony.ageRegenPool = 12;
  hive.queen.ageTicks = 1000;
  const queenBefore = hive.queen.ageTicks;

  for (let i = 0; i < 3; i += 1) {
    workers[i].ageTicks = workers[i].maxAgeTicks * 0.9;
  }

  const workerBefore = workers.slice(0, 3).map((w) => w.ageTicks);

  sim.buildHiveCache();
  sim.applyAgeReplenishment();

  assert.ok(hive.queen.ageTicks < queenBefore);
  assert.ok(workers.slice(0, 3).some((w, i) => w.ageTicks < workerBefore[i]));
  assert.ok(hive.colony.ageRegenPool < 12);
});

test('colony maintains queen continuity even with no workers', () => {
  const sim = new Simulation();
  const hive = sim.world.colonies[0];

  hive.colony.foodStock = 0;
  sim.world.drones = sim.world.drones.filter((d) => d.colonyId !== hive.id);
  sim.world.soldiers = sim.world.soldiers.filter((s) => s.colonyId !== hive.id);

  hive.queen.takeDamage(99999);
  sim.tick();

  const stillThere = sim.world.colonies.find((c) => c.id === hive.id);
  const nextQueen = sim.world.queens.find((q) => q.colonyId === hive.id && q.alive);
  assert.ok(stillThere);
  assert.ok(nextQueen);
});

import { SIM_CONFIG } from './config.js';
import { WorldState } from './world/WorldState.js';
import { Queen } from './agents/Queen.js';
import { HiveCommSystem } from './systems/HiveCommSystem.js';
import { ColonySystem } from './systems/ColonySystem.js';
import { AgentSystem } from './systems/AgentSystem.js';
import { ThreatSystem } from './systems/ThreatSystem.js';
import { ResourceSystem } from './systems/ResourceSystem.js';
import { ColonyPriority } from './model/types.js';
import { ClientCommandType } from '../shared/protocol.js';
import { clamp, distance, randRange } from './utils.js';

const COLONY_COLORS = ['#ffd16f', '#7ed7ff', '#c8ff82', '#f6a67e', '#d9a3ff', '#9df2bf', '#ffc4e1'];

const modeBias = {
  friendly: 0.9,
  competitive: 0,
  hostile: -1.1
};

const relationStateFromScore = (score) => {
  if (score > 0.45) return 'ally';
  if (score < -0.55) return 'hostile';
  return 'neutral';
};

export class Simulation {
  constructor(config = SIM_CONFIG) {
    this.config = config;
    this.world = new WorldState(config);

    this.agentSystem = new AgentSystem(config);
    this.threatSystem = new ThreatSystem(config);
    this.resourceSystem = new ResourceSystem(config);
    this.colonySystem = new ColonySystem(config);

    this.commandQueue = [];
    this.hiveCache = new Map();

    this.initWorld();
  }

  initWorld() {
    this.world.seedFood(this.config.startup.foodPellets);
    this.world.seedHazards(3);

    const center = this.world.randomPosition(140);
    this.createColony({ x: center.x, y: center.y, mode: 'competitive', initial: true });
  }

  createColony({ x, y, mode = 'competitive', initial = false }) {
    const colonyIndex = this.world.colonies.length;
    const colonyId = this.world.createId('hive');

    const hive = {
      id: colonyId,
      name: `Hive ${colonyIndex + 1}`,
      mode,
      color: COLONY_COLORS[colonyIndex % COLONY_COLORS.length],
      nest: {
        established: false,
        x,
        y,
        radius: this.config.world.nestRadius,
        safety: 0
      },
      queen: null,
      colony: {
        energy: this.config.colony.startingEnergy,
        foodStock: this.config.colony.startingFoodStock,
        health: this.config.queen.maxHp,
        dangerLevel: 0,
        priority: ColonyPriority.FORAGE,
        foodIncomeRecent: 0,
        starvationTicks: 0,
        successionCount: 0
      },
      relations: {},
      comm: new HiveCommSystem(this.config, this.world)
    };

    const queen = new Queen({
      id: this.world.createId('queen'),
      x,
      y,
      config: this.config,
      colonyId
    });

    hive.queen = queen;
    this.world.addColony(hive);
    this.world.queens.push(queen);

    const droneCount = initial ? this.config.startup.drones : this.config.startup.drones;
    const soldierCount = initial ? this.config.startup.soldiers : this.config.startup.soldiers;
    this.agentSystem.spawnColonySwarm(this.world, colonyId, x, y, droneCount, soldierCount);

    hive.comm.remember({
      type: 'queen',
      x,
      y,
      ttl: 9999,
      confidence: 1
    });

    return hive;
  }

  queueCommand(command) {
    this.commandQueue.push(command);
  }

  relationBetween(aId, bId) {
    if (aId === bId) return 'ally';
    const a = this.world.getColony(aId);
    if (!a) return 'neutral';
    return a.relations[bId]?.state || 'neutral';
  }

  applyCommands() {
    if (!this.commandQueue.length) return;

    const commands = this.commandQueue.splice(0, this.commandQueue.length);

    for (const command of commands) {
      const x = clamp(Number(command.x), 0, this.world.width);
      const y = clamp(Number(command.y), 0, this.world.height);

      if (command.type === ClientCommandType.SPAWN_FOOD) {
        this.world.addFood(x, y, 55);
        for (const hive of this.world.colonies) {
          const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
          const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;
          if (distance(nestX, nestY, x, y) < 260) {
            hive.comm.addSignal({
              type: 'food_found',
              x,
              y,
              radius: 100,
              ttl: 4,
              strength: 0.45,
              sourceRole: 'hive'
            });
          }
        }
      }

      if (command.type === ClientCommandType.SPAWN_THREAT) {
        this.threatSystem.spawn(this.world, x, y);
        for (const hive of this.world.colonies) {
          const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
          const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;
          if (distance(nestX, nestY, x, y) < 320) {
            hive.comm.addSignal({
              type: 'threat_seen',
              x,
              y,
              radius: 190,
              ttl: 10,
              strength: 1.1,
              sourceRole: 'hive'
            });
          }
        }
      }

      if (command.type === ClientCommandType.SPAWN_COLONY) {
        const mode = ['friendly', 'competitive', 'hostile'].includes(command.mode)
          ? command.mode
          : 'competitive';

        const clear = this.world.queens.every((queen) => distance(queen.x, queen.y, x, y) > 70);
        const sx = clear ? x : clamp(x + randRange(50, 100), 0, this.world.width);
        const sy = clear ? y : clamp(y + randRange(50, 100), 0, this.world.height);

        this.createColony({ x: sx, y: sy, mode });
      }
    }
  }

  getSharedThreatPressure(a, b) {
    const nestAX = a.nest.established ? a.nest.x : a.queen.x;
    const nestAY = a.nest.established ? a.nest.y : a.queen.y;
    const nestBX = b.nest.established ? b.nest.x : b.queen.x;
    const nestBY = b.nest.established ? b.nest.y : b.queen.y;

    let pressure = 0;
    for (const threat of this.world.threats) {
      if (!threat.alive) continue;
      const dA = distance(threat.x, threat.y, nestAX, nestAY);
      const dB = distance(threat.x, threat.y, nestBX, nestBY);
      if (dA < 280 || dB < 280) {
        pressure += Math.max(0, 1 - Math.min(dA, dB) / 280);
      }
    }
    return pressure;
  }

  getNestPosition(hive) {
    return {
      x: hive.nest.established ? hive.nest.x : hive.queen.x,
      y: hive.nest.established ? hive.nest.y : hive.queen.y
    };
  }

  localFoodPressure(hive, radius = 520) {
    const nest = this.getNestPosition(hive);
    let nearbyNodes = 0;
    let nearbyAmount = 0;

    for (const food of this.world.food) {
      const d = distance(nest.x, nest.y, food.x, food.y);
      if (d > radius) continue;
      nearbyNodes += 1;
      nearbyAmount += food.amount;
    }

    return { nearbyNodes, nearbyAmount };
  }

  updateDiplomacy() {
    for (const hive of this.world.colonies) hive.relations = {};

    for (let i = 0; i < this.world.colonies.length; i += 1) {
      const a = this.world.colonies[i];
      a.relations[a.id] = { score: 1, state: 'ally' };

      for (let j = i + 1; j < this.world.colonies.length; j += 1) {
        const b = this.world.colonies[j];

        let score = (modeBias[a.mode] + modeBias[b.mode]) * 0.5;
        const nestA = this.getNestPosition(a);
        const nestB = this.getNestPosition(b);
        const nestDistance = distance(nestA.x, nestA.y, nestB.x, nestB.y);
        const foodA = this.localFoodPressure(a);
        const foodB = this.localFoodPressure(b);

        const scarcity =
          (
            a.colony.energy < this.config.colony.lowEnergyThreshold &&
            a.colony.foodStock < this.config.colony.lowEnergyThreshold * 0.9 &&
            foodA.nearbyNodes < 2
          ) ||
          (
            b.colony.energy < this.config.colony.lowEnergyThreshold &&
            b.colony.foodStock < this.config.colony.lowEnergyThreshold * 0.9 &&
            foodB.nearbyNodes < 2
          );

        const abundance =
          a.colony.energy > this.config.colony.lowEnergyThreshold * 2 &&
          b.colony.energy > this.config.colony.lowEnergyThreshold * 2 &&
          a.colony.foodStock > this.config.colony.lowEnergyThreshold * 1.6 &&
          b.colony.foodStock > this.config.colony.lowEnergyThreshold * 1.6 &&
          foodA.nearbyNodes >= 3 &&
          foodB.nearbyNodes >= 3 &&
          foodA.nearbyAmount > 90 &&
          foodB.nearbyAmount > 90;

        const sharedThreatPressure = this.getSharedThreatPressure(a, b);

        if (nestDistance > 900) score += 0.25;
        else if (nestDistance > 600) score += 0.1;

        if (abundance) score += 0.35;
        if (scarcity) score -= 0.35;
        if (scarcity && nestDistance < 480) score -= 0.25;
        if (sharedThreatPressure > 0.35 && !scarcity) score += 0.45;

        if (a.mode === 'hostile' || b.mode === 'hostile') score -= 0.5;
        if (a.mode === 'friendly' && b.mode === 'friendly') score += 0.55;

        let state = relationStateFromScore(score);

        if (a.mode === 'hostile' || b.mode === 'hostile') state = 'hostile';
        if (a.mode === 'friendly' && b.mode === 'friendly') state = 'ally';

        const relation = { score, state };
        a.relations[b.id] = relation;
        b.relations[a.id] = relation;
      }
    }
  }

  buildHiveCache() {
    this.hiveCache = new Map();

    for (const hive of this.world.colonies) {
      this.hiveCache.set(hive.id, {
        drones: [],
        soldiers: [],
        brood: []
      });
    }

    for (const drone of this.world.drones) {
      if (!drone.alive) continue;
      const slot = this.hiveCache.get(drone.colonyId);
      if (slot) slot.drones.push(drone);
    }

    for (const soldier of this.world.soldiers) {
      if (!soldier.alive) continue;
      const slot = this.hiveCache.get(soldier.colonyId);
      if (slot) slot.soldiers.push(soldier);
    }

    for (const brood of this.world.brood) {
      const slot = this.hiveCache.get(brood.colonyId);
      if (slot) slot.brood.push(brood);
    }
  }

  getHiveContext(colonyId) {
    const hive = this.world.getColony(colonyId);
    if (!hive) return null;

    const index = this.hiveCache.get(colonyId) || { drones: [], soldiers: [], brood: [] };

    return {
      hive: {
        ...hive,
        drones: index.drones,
        soldiers: index.soldiers,
        brood: index.brood
      },
      colony: hive.colony,
      comm: hive.comm,
      relationTo: (otherColonyId) => this.relationBetween(colonyId, otherColonyId)
    };
  }

  notifyThreatActivity(x, y, strength = 1.4) {
    for (const hive of this.world.colonies) {
      const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
      const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;
      const d = distance(x, y, nestX, nestY);

      if (d < 360) {
        hive.comm.depositTrail('danger', x, y, strength, 2);
        hive.comm.addSignal({
          type: 'threat_seen',
          x,
          y,
          radius: 130,
          ttl: 5,
          strength: 1,
          sourceRole: 'threat'
        });
      }
    }
  }

  promoteDroneToQueen(hive, drone) {
    drone.alive = false;
    const newQueen = new Queen({
      id: this.world.createId('queen'),
      x: drone.x,
      y: drone.y,
      config: this.config,
      colonyId: hive.id
    });

    newQueen.state = 'ALERT';
    newQueen.alertTimer = 0;
    newQueen.broodCooldown = Math.max(12, Math.floor(this.config.queen.broodCooldownTicks * 0.6));
    newQueen.hp = Math.min(newQueen.maxHp, newQueen.maxHp * 0.7);
    newQueen.ageTicks = Math.floor(drone.ageTicks * 0.5);

    hive.queen = newQueen;
    if (!hive.nest.established) {
      hive.nest.established = true;
      hive.nest.x = newQueen.x;
      hive.nest.y = newQueen.y;
    }
    hive.colony.successionCount += 1;
    hive.colony.foodStock = Math.max(0, hive.colony.foodStock - this.config.colony.successionFoodCost);
    hive.colony.energy = Math.max(hive.colony.energy, this.config.colony.successionEnergyFloor);

    this.world.queens.push(newQueen);

    hive.comm.addSignal({
      type: 'queen_reborn',
      x: newQueen.x,
      y: newQueen.y,
      radius: 220,
      ttl: 14,
      strength: 1.3,
      sourceRole: 'hive'
    });
  }

  handleQueenSuccession() {
    for (const hive of this.world.colonies) {
      if (hive.queen?.alive) continue;
      if (hive.colony.foodStock < this.config.colony.successionFoodCost) continue;

      const candidates = this.world.drones.filter((d) => d.alive && d.colonyId === hive.id);
      if (!candidates.length) continue;

      candidates.sort((a, b) => b.ageTicks - a.ageTicks);
      this.promoteDroneToQueen(hive, candidates[0]);
    }
  }

  tick() {
    this.world.tick += 1;

    this.applyCommands();
    this.buildHiveCache();
    this.updateDiplomacy();

    const baseContext = {
      config: this.config,
      world: this.world,
      getHiveContext: (colonyId) => this.getHiveContext(colonyId),
      spawnBrood: (x, y, colonyId) => this.agentSystem.spawnBrood(this.world, x, y, colonyId),
      notifyThreatActivity: (x, y, strength) => this.notifyThreatActivity(x, y, strength)
    };

    for (const queen of this.world.queens) {
      if (!queen.alive) continue;
      const hiveCtx = this.getHiveContext(queen.colonyId);
      if (!hiveCtx) continue;
      queen.update({ ...baseContext, ...hiveCtx });
    }

    this.agentSystem.updateDrones(baseContext);
    this.agentSystem.updateSoldiers(baseContext);
    this.threatSystem.update(baseContext);
    this.agentSystem.updateBrood(baseContext);
    this.resourceSystem.update(this.world);

    this.handleQueenSuccession();

    this.world.queens = this.world.queens.filter((q) => q.alive);
    this.world.colonies = this.world.colonies.filter((hive) => hive.queen && hive.queen.alive);
    const aliveColonyIds = new Set(this.world.colonies.map((hive) => hive.id));
    this.world.drones = this.world.drones.filter((d) => d.alive && aliveColonyIds.has(d.colonyId));
    this.world.soldiers = this.world.soldiers.filter((s) => s.alive && aliveColonyIds.has(s.colonyId));
    this.world.brood = this.world.brood.filter((b) => aliveColonyIds.has(b.colonyId));

    this.buildHiveCache();

    for (const hive of this.world.colonies) {
      hive.comm.step();
      this.colonySystem.update(
        hive.colony,
        {
          ...hive,
          drones: this.hiveCache.get(hive.id)?.drones || [],
          soldiers: this.hiveCache.get(hive.id)?.soldiers || [],
          brood: this.hiveCache.get(hive.id)?.brood || []
        },
        this.world,
        hive.comm,
        (otherId) => this.relationBetween(hive.id, otherId)
      );
    }

    return this.snapshot();
  }

  commSnapshot() {
    if (!this.world.colonies.length) {
      return {
        cols: 0,
        rows: 0,
        cellSize: this.config.world.gridCellSize,
        foodTrail: [],
        dangerTrail: [],
        signals: []
      };
    }

    const first = this.world.colonies[0].comm;
    const foodTrail = new Float32Array(first.totalCells);
    const dangerTrail = new Float32Array(first.totalCells);
    const signals = [];

    for (const hive of this.world.colonies) {
      const c = hive.comm;
      for (let i = 0; i < c.totalCells; i += 1) {
        foodTrail[i] = Math.max(foodTrail[i], c.foodTrail[i]);
        dangerTrail[i] = Math.max(dangerTrail[i], c.dangerTrail[i]);
      }

      for (const signal of c.signals) {
        signals.push({ ...signal, colonyId: hive.id });
      }
    }

    return {
      cols: first.cols,
      rows: first.rows,
      cellSize: first.cellSize,
      foodTrail: Array.from(foodTrail),
      dangerTrail: Array.from(dangerTrail),
      signals
    };
  }

  snapshot() {
    return {
      tick: this.world.tick,
      world: {
        width: this.world.width,
        height: this.world.height,
        hazards: this.world.hazards
      },
      colonies: this.world.colonies.map((hive) => ({
        id: hive.id,
        name: hive.name,
        mode: hive.mode,
        color: hive.color,
        nest: hive.nest,
        colony: hive.colony,
        queenId: hive.queen?.id,
        relations: hive.relations
      })),
      queens: this.world.queens.map((q) => ({
        id: q.id,
        colonyId: q.colonyId,
        x: q.x,
        y: q.y,
        hp: q.hp,
        ageTicks: q.ageTicks,
        maxAgeTicks: q.maxAgeTicks,
        maxHp: q.maxHp,
        state: q.state,
        alive: q.alive
      })),
      drones: this.world.drones.map((d) => ({
        id: d.id,
        colonyId: d.colonyId,
        x: d.x,
        y: d.y,
        hp: d.hp,
        ageTicks: d.ageTicks,
        maxAgeTicks: d.maxAgeTicks,
        state: d.state,
        carrying: d.carrying
      })),
      soldiers: this.world.soldiers.map((s) => ({
        id: s.id,
        colonyId: s.colonyId,
        x: s.x,
        y: s.y,
        hp: s.hp,
        ageTicks: s.ageTicks,
        maxAgeTicks: s.maxAgeTicks,
        state: s.state
      })),
      brood: this.world.brood.map((b) => ({
        id: b.id,
        colonyId: b.colonyId,
        x: b.x,
        y: b.y,
        age: b.age
      })),
      threats: this.world.threats.map((t) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        hp: t.hp,
        ageTicks: t.ageTicks,
        maxAgeTicks: t.maxAgeTicks,
        state: t.state
      })),
      food: this.world.food.map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y,
        amount: f.amount,
        maxAmount: f.maxAmount
      })),
      comm: this.commSnapshot()
    };
  }
}

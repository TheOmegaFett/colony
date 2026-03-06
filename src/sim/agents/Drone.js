import { Agent } from './Agent.js';
import { DroneState } from '../model/types.js';
import { distance, moveWithHeading, steer, clamp, randRange } from '../utils.js';
import { PerceptionSystem } from '../systems/PerceptionSystem.js';

export class Drone extends Agent {
  constructor({ id, x, y, config, colonyId }) {
    super({
      id,
      role: 'drone',
      colonyId,
      x,
      y,
      hp: config.drone.hp,
      speed: config.drone.speed,
      maxAgeTicks: randRange(config.lifecycle.droneMinAgeTicks, config.lifecycle.droneMaxAgeTicks)
    });

    this.state = DroneState.SCOUT;
    this.carrying = 0;
    this.memoryFood = null;
    this.memoryDanger = null;
    this.evasionTicks = 0;
    this.scoutSpecialist = Math.random() < config.drone.scoutSpecialistRatio;
    this.exploreBias = Math.random();
    this.scoutTarget = null;
    this.scoutRetargetTimer = randRange(0, config.drone.scoutRetargetTicks);
    this.lastScoutMark = 0;
  }

  observeSignals(context) {
    const { comm } = context;
    const nearby = comm.getSignalsNear(this.x, this.y, 130);

    for (const signal of nearby) {
      if (signal.type === 'food_found' && !this.memoryFood) {
        this.memoryFood = { x: signal.x, y: signal.y, ttl: 110 };
      }
      if (signal.type === 'threat_seen' || signal.type === 'enemy_seen') {
        this.memoryDanger = { x: signal.x, y: signal.y, ttl: 80 };
      }
      if (signal.type === 'queen_in_danger' && this.carrying <= 0) {
        this.state = DroneState.RELAY;
      }
    }
  }

  tickMemory() {
    if (this.memoryFood) {
      this.memoryFood.ttl -= 1;
      if (this.memoryFood.ttl <= 0) this.memoryFood = null;
    }
    if (this.memoryDanger) {
      this.memoryDanger.ttl -= 1;
      if (this.memoryDanger.ttl <= 0) this.memoryDanger = null;
    }
  }

  shouldPrioritizeForage(colony, config) {
    const survivalTarget = colony.survivalFoodTarget || config.colony.lowEnergyThreshold * 2;
    return (
      colony.priority === 'FORAGE' ||
      colony.priority === 'SURVIVE' ||
      colony.priority === 'RECOVER' ||
      colony.foodStock < survivalTarget * 1.08
    );
  }

  pickScoutTarget(world, comm, config, nestX, nestY) {
    const samples = 8;
    const scoutMemories = comm.memory.filter((m) => m.type === 'scout');
    let best = null;

    for (let i = 0; i < samples; i += 1) {
      const x = randRange(60, world.width - 60);
      const y = randRange(60, world.height - 60);
      const fromNest = distance(x, y, nestX, nestY);

      let staleScore = 150;
      for (const memory of scoutMemories) {
        const d = distance(x, y, memory.x, memory.y);
        if (d > 230) continue;
        const freshness = memory.ttl / Math.max(1, config.drone.scoutMemoryTtlTicks);
        const score = (1 - Math.min(1, freshness)) * 120 + d * 0.2;
        staleScore = Math.min(staleScore, score);
      }

      const edgePenalty = Math.min(x, world.width - x, y, world.height - y) < 70 ? 35 : 0;
      const score = fromNest * 0.23 + staleScore - edgePenalty;
      if (!best || score > best.score) best = { x, y, score };
    }

    return best || { x: nestX, y: nestY };
  }

  markScoutedArea(comm, world, config) {
    if (world.tick - this.lastScoutMark < config.drone.scoutMarkIntervalTicks) return;
    this.lastScoutMark = world.tick;
    comm.remember({
      type: 'scout',
      x: this.x,
      y: this.y,
      ttl: config.drone.scoutMemoryTtlTicks,
      confidence: 0.75
    });
  }

  update(context) {
    const { config, world, colony, comm, hive, relationTo } = context;

    if (this.tickAging()) return;

    const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
    const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;
    const survivalTarget = colony.survivalFoodTarget || config.colony.lowEnergyThreshold * 2;
    const maxSustainableTarget = colony.maxSustainableFoodTarget || survivalTarget * 1.4;
    const prioritizeForage = this.shouldPrioritizeForage(colony, config);
    const overstocked = colony.foodStock > maxSustainableTarget && colony.priority !== 'SURVIVE';

    this.observeSignals(context);
    this.tickMemory();

    const nearestThreat = PerceptionSystem.nearest(this.x, this.y, world.threats, config.drone.vision, (t) => t.alive);

    const hostileEnemies = world.soldiers.filter(
      (s) =>
        s.alive &&
        s.colonyId !== this.colonyId &&
        relationTo(s.colonyId) === 'hostile'
    );
    const nearestHostileEnemy = PerceptionSystem.nearest(this.x, this.y, hostileEnemies, config.drone.vision);

    const threatDistance = nearestThreat ? distance(this.x, this.y, nearestThreat.x, nearestThreat.y) : Infinity;
    const enemyDistance = nearestHostileEnemy ? distance(this.x, this.y, nearestHostileEnemy.x, nearestHostileEnemy.y) : Infinity;

    const immediateDanger = threatDistance < config.drone.evadeDistance || enemyDistance < config.drone.evadeDistance;

    if (nearestThreat) {
      comm.addSignal({
        type: 'threat_seen',
        x: nearestThreat.x,
        y: nearestThreat.y,
        radius: 140,
        ttl: 8,
        strength: 1.2,
        sourceRole: 'drone'
      });
      comm.depositTrail('danger', this.x, this.y, 1.3, 2);
      comm.remember({ type: 'threat', x: nearestThreat.x, y: nearestThreat.y, ttl: 90, confidence: 0.7 });
      this.memoryDanger = { x: nearestThreat.x, y: nearestThreat.y, ttl: 90 };
    }

    if (nearestHostileEnemy) {
      comm.addSignal({
        type: 'enemy_seen',
        x: nearestHostileEnemy.x,
        y: nearestHostileEnemy.y,
        radius: 120,
        ttl: 7,
        strength: 1,
        sourceRole: 'drone'
      });
      this.memoryDanger = { x: nearestHostileEnemy.x, y: nearestHostileEnemy.y, ttl: 80 };
    }

    if (immediateDanger) {
      this.state = DroneState.EVADE;
      this.evasionTicks = 14;
    }

    const localFood = PerceptionSystem.nearest(this.x, this.y, world.food, config.drone.vision, (f) => f.amount > 0.5);
    const canHarvestLocalFood = prioritizeForage || (!overstocked && !this.scoutSpecialist);
    if (localFood && this.carrying <= 0 && canHarvestLocalFood) {
      this.memoryFood = { x: localFood.x, y: localFood.y, ttl: 130 };
      this.state = DroneState.HARVEST;
      comm.addSignal({
        type: 'food_found',
        x: localFood.x,
        y: localFood.y,
        radius: 120,
        ttl: 10,
        strength: 1,
        sourceRole: 'drone'
      });
      comm.remember({ type: 'food', x: localFood.x, y: localFood.y, ttl: 220, confidence: 0.9 });
    }

    if (this.carrying > 0) this.state = DroneState.RETURN;
    if (!this.memoryFood && this.state === DroneState.HARVEST) this.state = DroneState.SCOUT;

    if (this.state === DroneState.SCOUT) {
      const knownFood = this.memoryFood || comm.bestMemory('food');
      if (knownFood && prioritizeForage) {
        this.memoryFood = { x: knownFood.x, y: knownFood.y, ttl: Math.max(60, knownFood.ttl || 120) };
        this.state = DroneState.HARVEST;
      }

      if (this.state === DroneState.SCOUT) {
        const shouldExplore =
          !prioritizeForage &&
          (this.scoutSpecialist || this.exploreBias < config.drone.mandatoryExploreShare);

        if (shouldExplore) {
          this.scoutRetargetTimer -= 1;
          if (
            !this.scoutTarget ||
            this.scoutRetargetTimer <= 0 ||
            distance(this.x, this.y, this.scoutTarget.x, this.scoutTarget.y) < 24
          ) {
            this.scoutTarget = this.pickScoutTarget(world, comm, config, nestX, nestY);
            this.scoutRetargetTimer = config.drone.scoutRetargetTicks;
          }

          steer(
            this,
            this.scoutTarget.x - this.x,
            this.scoutTarget.y - this.y,
            config.drone.speed,
            0.24
          );
          this.markScoutedArea(comm, world, config);
        } else {
          const foodGradient = comm.vectorToTrailPeak('food', this.x, this.y);
          if (foodGradient.value > 0.15 && colony.priority !== 'DEFEND' && Math.random() < 0.75 && prioritizeForage) {
            steer(this, foodGradient.x, foodGradient.y, config.drone.speed, 0.25);
          } else if (colony.priority === 'DEFEND' && distance(this.x, this.y, nestX, nestY) > 170) {
            steer(this, nestX - this.x, nestY - this.y, config.drone.speed, 0.28);
          } else {
            moveWithHeading(this, config.drone.speed, 0.25);
          }
        }
      }
    } else if (this.state === DroneState.HARVEST) {
      if (!prioritizeForage && overstocked && this.carrying <= 0) {
        this.state = DroneState.SCOUT;
      }

      if (this.memoryFood) {
        steer(this, this.memoryFood.x - this.x, this.memoryFood.y - this.y, config.drone.speed, 0.27);
        if (world.tick % 12 === 0) {
          comm.addSignal({
            type: 'food_found',
            x: this.memoryFood.x,
            y: this.memoryFood.y,
            radius: 100,
            ttl: 5,
            strength: 0.85,
            sourceRole: 'drone'
          });
        }
      }

      const nearbyFood = PerceptionSystem.nearest(this.x, this.y, world.food, 22, (f) => f.amount > 0.5);
      if (nearbyFood && distance(this.x, this.y, nearbyFood.x, nearbyFood.y) < 16) {
        const take = Math.min(config.drone.carryAmount, nearbyFood.amount);
        nearbyFood.amount -= take;
        this.carrying = take;
        this.state = DroneState.RETURN;
        this.memoryFood = { x: nearbyFood.x, y: nearbyFood.y, ttl: 170 };
      }
    } else if (this.state === DroneState.RETURN) {
      steer(this, nestX - this.x, nestY - this.y, config.drone.speed, 0.35);
      comm.depositTrail('food', this.x, this.y, 1.2, 1);

      if (distance(this.x, this.y, nestX, nestY) < hive.nest.radius + 8) {
        colony.foodStock = clamp(colony.foodStock + this.carrying, 0, config.colony.maxFoodStock);
        colony.foodIncomeRecent += this.carrying;
        this.carrying = 0;
        this.state = DroneState.RELAY;
        comm.addSignal({
          type: 'food_delivered',
          x: nestX,
          y: nestY,
          radius: 120,
          ttl: 6,
          strength: 1.1,
          sourceRole: 'drone'
        });
      }
    } else if (this.state === DroneState.RELAY) {
      const knownFood = this.memoryFood || comm.bestMemory('food');
      if (knownFood) {
        comm.addSignal({
          type: 'food_found',
          x: knownFood.x,
          y: knownFood.y,
          radius: 140,
          ttl: 6,
          strength: 1,
          sourceRole: 'drone'
        });
      }

      if (distance(this.x, this.y, nestX, nestY) > 120) {
        steer(this, nestX - this.x, nestY - this.y, config.drone.speed, 0.25);
      } else {
        moveWithHeading(this, config.drone.speed * 0.9, 0.18);
      }

      this.state = this.memoryFood && prioritizeForage ? DroneState.HARVEST : DroneState.SCOUT;
    } else if (this.state === DroneState.EVADE) {
      this.evasionTicks -= 1;
      const dangerSource = nearestThreat || nearestHostileEnemy;
      const dxThreat = dangerSource ? this.x - dangerSource.x : nestX - this.x;
      const dyThreat = dangerSource ? this.y - dangerSource.y : nestY - this.y;
      const towardNestX = nestX - this.x;
      const towardNestY = nestY - this.y;

      steer(
        this,
        dxThreat * 0.9 + towardNestX * 0.6,
        dyThreat * 0.9 + towardNestY * 0.6,
        config.drone.speed * 1.1,
        0.4
      );

      comm.depositTrail('danger', this.x, this.y, 1.4, 2);

      if (this.evasionTicks <= 0 && Math.min(threatDistance, enemyDistance) > config.drone.evadeDistance * 1.2) {
        this.state = DroneState.SCOUT;
      }
    }

    world.clampEntity(this);
  }
}

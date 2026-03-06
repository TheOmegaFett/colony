import { Agent } from './Agent.js';
import { QueenState } from '../model/types.js';
import { distance, randRange, moveToward } from '../utils.js';

const nearestDistance = (x, y, list, predicate = null) => {
  if (!list.length) return Infinity;
  let best = Infinity;
  for (const item of list) {
    if (predicate && !predicate(item)) continue;
    const d = distance(x, y, item.x, item.y);
    if (d < best) best = d;
  }
  return best;
};

export class Queen extends Agent {
  constructor({ id, x, y, config, colonyId }) {
    super({
      id,
      role: 'queen',
      colonyId,
      x,
      y,
      hp: config.queen.maxHp,
      speed: config.queen.speed,
      maxAgeTicks: randRange(config.lifecycle.queenMinAgeTicks, config.lifecycle.queenMaxAgeTicks)
    });

    this.state = QueenState.SCOUTING;
    this.maxHp = config.queen.maxHp;
    this.scoutTimer = 0;
    this.settleTimer = 0;
    this.alertTimer = 0;
    this.relocateDangerTimer = 0;
    this.broodCooldown = config.queen.broodCooldownTicks;

    this.currentTarget = null;
    this.candidateSites = [];
    this.selectedNest = null;
  }

  evaluateSite(site, world, hive) {
    const nearestFood = nearestDistance(site.x, site.y, world.food);
    const nearestThreat = nearestDistance(site.x, site.y, world.threats, (t) => t.alive);

    let hazardPenalty = 0;
    for (const hazard of world.hazards) {
      const d = distance(site.x, site.y, hazard.x, hazard.y);
      if (d < hazard.radius * 1.5) hazardPenalty += hazard.instability * 40;
    }

    const nearbyRivals = world.queens.filter((q) => q.colonyId !== hive.id && q.alive);
    const nearestRivalQueen = nearestDistance(site.x, site.y, nearbyRivals);

    const foodScore = (1 - Math.min(1, nearestFood / 520)) * 65;
    const safetyScore = Math.min(1, nearestThreat / 420) * 75;
    const territorialPenalty = nearestRivalQueen < 200 ? (200 - nearestRivalQueen) * 0.2 : 0;
    const edgePenalty = Math.min(site.x, world.width - site.x, site.y, world.height - site.y) < 60 ? 25 : 0;

    return foodScore + safetyScore - hazardPenalty - edgePenalty - territorialPenalty;
  }

  pickScoutTarget(world) {
    return {
      x: randRange(80, world.width - 80),
      y: randRange(80, world.height - 80)
    };
  }

  pickRelocationTarget(world, comm, hive) {
    let best = null;
    for (let i = 0; i < 12; i += 1) {
      const site = this.pickScoutTarget(world);
      const danger = Math.min(80, comm.trailValue('danger', site.x, site.y));
      const score = this.evaluateSite(site, world, hive) - danger * 1.2;
      if (!best || score > best.score) best = { ...site, score };
    }
    return best || this.pickScoutTarget(world);
  }

  update(context) {
    const { config, world, colony, comm, spawnBrood, spawnDrone, hive } = context;

    if (this.tickAging()) {
      this.state = QueenState.DEAD;
      this.alive = false;
      return;
    }

    if (this.hp <= 0) {
      this.state = QueenState.DEAD;
      this.alive = false;
      return;
    }

    if (colony.dangerLevel > config.colony.highDangerThreshold) {
      this.relocateDangerTimer += 1;
    } else {
      this.relocateDangerTimer = Math.max(0, this.relocateDangerTimer - 2);
    }

    const nestX = hive.nest.established ? hive.nest.x : this.x;
    const nestY = hive.nest.established ? hive.nest.y : this.y;

    if (this.hp < this.maxHp && config.queen.selfHealFoodCost > 0) {
      const reserve = Math.max(
        config.queen.selfHealMinFoodReserve,
        (colony.survivalFoodTarget || 0) * 0.35
      );
      const available = Math.max(0, colony.foodStock - reserve);
      if (available > 0.01) {
        const foodSpend = Math.min(config.queen.selfHealFoodCost, available);
        colony.foodStock -= foodSpend;
        const heal = (foodSpend / config.queen.selfHealFoodCost) * config.queen.selfHealHpPerTick;
        this.hp = Math.min(this.maxHp, this.hp + heal);
      }
    }

    const shouldReturnToNest =
      hive.nest.established &&
      this.state !== QueenState.SCOUTING &&
      this.state !== QueenState.SETTLING &&
      this.state !== QueenState.RELOCATING &&
      distance(this.x, this.y, nestX, nestY) > config.queen.returnToNestDistance;

    if (shouldReturnToNest) {
      moveToward(this, nestX, nestY, config.queen.speed + 0.15);
      comm.addSignal({
        type: 'retreat',
        x: this.x,
        y: this.y,
        radius: 160,
        ttl: 3,
        strength: 0.8,
        sourceRole: 'queen'
      });
      world.clampEntity(this);
      return;
    }

    if (this.state === QueenState.SCOUTING) {
      this.scoutTimer += 1;
      if (!this.currentTarget || distance(this.x, this.y, this.currentTarget.x, this.currentTarget.y) < 14) {
        this.currentTarget = this.pickScoutTarget(world);
      }

      moveToward(this, this.currentTarget.x, this.currentTarget.y, config.queen.speed);

      if (this.scoutTimer % 16 === 0) {
        const site = { x: this.x, y: this.y };
        this.candidateSites.push({ ...site, score: this.evaluateSite(site, world, hive) });
        if (this.candidateSites.length > 40) this.candidateSites.shift();
      }

      if (this.scoutTimer >= config.queen.scoutDurationTicks) {
        this.selectedNest = this.candidateSites.sort((a, b) => b.score - a.score)[0] || { x: this.x, y: this.y };
        this.currentTarget = this.selectedNest;
        this.state = QueenState.SETTLING;
      }
    } else if (this.state === QueenState.SETTLING) {
      this.settleTimer += 1;
      if (this.currentTarget) {
        moveToward(this, this.currentTarget.x, this.currentTarget.y, config.queen.speed + 0.2);
      }

      if (
        !this.currentTarget ||
        distance(this.x, this.y, this.currentTarget.x, this.currentTarget.y) < 8 ||
        this.settleTimer > config.queen.settleDurationTicks
      ) {
        world.setNest(hive.id, this.x, this.y);
        hive.nest.safety = this.selectedNest?.score ?? 0;
        this.state = QueenState.BROODING;
        comm.addSignal({
          type: 'nest_established',
          x: this.x,
          y: this.y,
          radius: 200,
          ttl: 25,
          strength: 1.2,
          sourceRole: 'queen'
        });
        comm.remember({ type: 'nest', x: this.x, y: this.y, ttl: 500, confidence: 1 });
      }
    } else if (this.state === QueenState.BROODING) {
      this.broodCooldown -= 1;
      const workerCount = hive.drones.length + hive.soldiers.length;
      const lowLabor = workerCount < 5;
      const reserveRatio = lowLabor ? 0.28 : 0.55;
      const requiredFoodReserve = Math.max(
        config.queen.broodFoodCost * (lowLabor ? 1.1 : 1.4),
        (colony.survivalFoodTarget || 0) * reserveRatio
      );

      if (
        workerCount === 0 &&
        this.broodCooldown <= 0 &&
        colony.energy >= config.queen.broodEnergyCost + 6
      ) {
        if (colony.foodStock > 0) {
          colony.foodStock = Math.max(0, colony.foodStock - Math.min(2, colony.foodStock));
        }
        colony.energy -= config.queen.broodEnergyCost + 3;
        spawnDrone(this.x + randRange(-12, 12), this.y + randRange(-12, 12), hive.id);
        this.broodCooldown = Math.max(16, Math.floor(config.queen.broodCooldownTicks * 0.45));
        comm.addSignal({
          type: 'brood_needs_resources',
          x: this.x,
          y: this.y,
          radius: 150,
          ttl: 10,
          strength: 1.15,
          sourceRole: 'queen'
        });
      }

      if (colony.dangerLevel > config.colony.highDangerThreshold) {
        this.state = QueenState.ALERT;
        this.alertTimer = 0;
      }

      if (
        this.broodCooldown <= 0 &&
        colony.foodStock >= config.queen.broodFoodCost &&
        colony.foodStock >= requiredFoodReserve &&
        colony.energy >= config.queen.broodEnergyCost + 2
      ) {
        spawnBrood(this.x + randRange(-14, 14), this.y + randRange(-14, 14), hive.id);
        colony.foodStock -= config.queen.broodFoodCost;
        colony.energy -= config.queen.broodEnergyCost;
        this.broodCooldown = config.queen.broodCooldownTicks;
        comm.addSignal({
          type: 'brood_needs_resources',
          x: this.x,
          y: this.y,
          radius: 150,
          ttl: 12,
          strength: 1,
          sourceRole: 'queen'
        });
      }
    } else if (this.state === QueenState.ALERT) {
      this.alertTimer += 1;
      comm.addSignal({
        type: 'queen_in_danger',
        x: this.x,
        y: this.y,
        radius: 260,
        ttl: 3,
        strength: 1.6,
        sourceRole: 'queen'
      });

      if (colony.dangerLevel < config.colony.recoverDangerThreshold) {
        if (this.alertTimer > 24) {
          this.state = QueenState.BROODING;
        }
      } else {
        this.alertTimer = 0;
      }

      if (
        this.relocateDangerTimer > config.queen.relocateDangerTicks &&
        this.hp < this.maxHp * 0.65
      ) {
        this.state = QueenState.RELOCATING;
        this.currentTarget = this.pickRelocationTarget(world, comm, hive);
      }
    } else if (this.state === QueenState.RELOCATING) {
      if (!this.currentTarget) this.currentTarget = this.pickRelocationTarget(world, comm, hive);

      moveToward(this, this.currentTarget.x, this.currentTarget.y, config.queen.speed + 0.35);
      comm.addSignal({
        type: 'retreat',
        x: this.x,
        y: this.y,
        radius: 220,
        ttl: 4,
        strength: 1.2,
        sourceRole: 'queen'
      });

      if (distance(this.x, this.y, this.currentTarget.x, this.currentTarget.y) < 10) {
        world.setNest(hive.id, this.x, this.y);
        comm.remember({ type: 'nest', x: this.x, y: this.y, ttl: 600, confidence: 1 });
        this.state = QueenState.BROODING;
        this.relocateDangerTimer = 0;
      }
    }

    world.clampEntity(this);
  }
}

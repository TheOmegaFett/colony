import { Agent } from './Agent.js';
import { SoldierState } from '../model/types.js';
import { distance, moveWithHeading, steer, randRange } from '../utils.js';
import { PerceptionSystem } from '../systems/PerceptionSystem.js';

const idPhase = (id) => {
  const n = Number(String(id).split('_')[1] || 1);
  return (n * 0.7) % (Math.PI * 2);
};

const nearestByDistance = (x, y, list, radius = Infinity) => {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    if (!item.alive) continue;
    const d = distance(x, y, item.x, item.y);
    if (d < bestDist && d <= radius) {
      best = item;
      bestDist = d;
    }
  }
  return { entity: best, dist: bestDist };
};

export class Soldier extends Agent {
  constructor({ id, x, y, config, colonyId }) {
    super({
      id,
      role: 'soldier',
      colonyId,
      x,
      y,
      hp: config.soldier.hp,
      speed: config.soldier.speed,
      maxAgeTicks: randRange(config.lifecycle.soldierMinAgeTicks, config.lifecycle.soldierMaxAgeTicks)
    });

    this.state = SoldierState.PATROL;
    this.targetThreatId = null;
    this.attackCooldown = 0;
    this.patrolPhase = idPhase(id);
  }

  update(context) {
    const { config, world, comm, hive, relationTo, colony } = context;

    if (this.tickAging()) return;

    const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
    const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;

    const nearestThreat = PerceptionSystem.nearest(this.x, this.y, world.threats, config.soldier.vision, (t) => t.alive);
    const enemyPool = [
      ...world.soldiers,
      ...world.drones,
      ...world.queens
    ].filter(
      (agent) =>
        agent.alive &&
        agent.colonyId &&
        agent.colonyId !== this.colonyId &&
        relationTo(agent.colonyId) === 'hostile'
    );

    const enemyNearest = nearestByDistance(this.x, this.y, enemyPool, config.soldier.vision);
    const threatDist = nearestThreat ? distance(this.x, this.y, nearestThreat.x, nearestThreat.y) : Infinity;
    const enemyDist = enemyNearest.entity ? enemyNearest.dist : Infinity;

    const shouldPrioritizeThreat =
      nearestThreat &&
      (
        !enemyNearest.entity ||
        colony.dangerLevel > 22 ||
        threatDist <= enemyDist * 1.2
      );

    if (shouldPrioritizeThreat) {
      this.state = SoldierState.ENGAGE;
      this.targetThreatId = nearestThreat.id;
      comm.addSignal({
        type: 'defend_zone',
        x: nearestThreat.x,
        y: nearestThreat.y,
        radius: 170,
        ttl: 10,
        strength: 1.4,
        sourceRole: 'soldier'
      });
      comm.remember({ type: 'threat', x: nearestThreat.x, y: nearestThreat.y, ttl: 120, confidence: 1 });
    } else if (enemyNearest.entity) {
      this.state = SoldierState.ENGAGE;
      this.targetThreatId = enemyNearest.entity.id;
      comm.addSignal({
        type: 'defend_zone',
        x: enemyNearest.entity.x,
        y: enemyNearest.entity.y,
        radius: 140,
        ttl: 8,
        strength: 1.2,
        sourceRole: 'soldier'
      });
      comm.remember({ type: 'enemy', x: enemyNearest.entity.x, y: enemyNearest.entity.y, ttl: 90, confidence: 0.8 });
    } else if (this.state === SoldierState.ENGAGE) {
      this.state = SoldierState.INVESTIGATE;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= 1;

    if (this.state === SoldierState.ENGAGE) {
      const target =
        world.threats.find((t) => t.id === this.targetThreatId) ||
        world.soldiers.find((t) => t.id === this.targetThreatId) ||
        world.drones.find((t) => t.id === this.targetThreatId) ||
        world.queens.find((t) => t.id === this.targetThreatId);

      if (target && target.alive) {
        const d = distance(this.x, this.y, target.x, target.y);
        if (d <= config.soldier.attackRange) {
          if (this.attackCooldown <= 0) {
            target.takeDamage(config.soldier.attackDamage);
            this.attackCooldown = 6;
          }
        } else {
          steer(this, target.x - this.x, target.y - this.y, config.soldier.speed * 1.1, 0.35);
        }
        comm.depositTrail('danger', target.x, target.y, 2, 2);
      } else {
        this.state = SoldierState.INVESTIGATE;
      }
    } else if (this.state === SoldierState.INVESTIGATE) {
      const localSignals = comm.getSignalsNear(this.x, this.y, 220, ['threat_seen', 'defend_zone', 'queen_in_danger', 'enemy_seen']);
      const strongest = localSignals.sort((a, b) => b.strength - a.strength)[0];
      const dangerMemory = comm.bestMemory('threat') || comm.bestMemory('enemy');

      if (strongest) {
        steer(this, strongest.x - this.x, strongest.y - this.y, config.soldier.speed, 0.3);
      } else if (dangerMemory) {
        steer(this, dangerMemory.x - this.x, dangerMemory.y - this.y, config.soldier.speed, 0.25);
      } else {
        this.state = SoldierState.PATROL;
      }
    } else if (this.state === SoldierState.PATROL || this.state === SoldierState.GUARD) {
      const ring = hive.nest.radius + 40 + 30 * Math.sin((world.tick + this.patrolPhase * 10) / 25);
      const angle = this.patrolPhase + world.tick * 0.03;
      const targetX = nestX + Math.cos(angle) * ring;
      const targetY = nestY + Math.sin(angle) * ring;

      steer(this, targetX - this.x, targetY - this.y, config.soldier.speed * 0.95, 0.22);

      if (distance(this.x, this.y, hive.queen.x, hive.queen.y) < hive.nest.radius + 35 && Math.random() < 0.05) {
        moveWithHeading(this, config.soldier.speed * 0.8, 0.1);
      }

      const dangerLevel = comm.trailValue('danger', this.x, this.y);
      if (dangerLevel > 0.7) this.state = SoldierState.INVESTIGATE;
    }

    world.clampEntity(this);
  }
}

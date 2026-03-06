import { Agent } from './Agent.js';
import { ThreatState } from '../model/types.js';
import { distance, moveWithHeading, steer, randRange } from '../utils.js';
import { PerceptionSystem } from '../systems/PerceptionSystem.js';

const nearest = (x, y, list, radius = Infinity, predicate = null) => {
  return PerceptionSystem.nearest(x, y, list, radius, predicate);
};

export class Threat extends Agent {
  constructor({ id, x, y, config }) {
    super({
      id,
      role: 'threat',
      x,
      y,
      hp: config.threat.hp,
      speed: config.threat.speed,
      maxAgeTicks: randRange(config.lifecycle.threatMinAgeTicks, config.lifecycle.threatMaxAgeTicks)
    });

    this.state = ThreatState.ROAM;
    this.attackCooldown = 0;
  }

  attemptAttack(target, damage, range) {
    if (!target || !target.alive) return false;
    const d = distance(this.x, this.y, target.x, target.y);
    if (d > range) return false;
    if (this.attackCooldown > 0) return false;
    target.takeDamage(damage);
    this.attackCooldown = 8;
    return true;
  }

  update(context) {
    const { config, world, notifyThreatActivity } = context;

    if (this.tickAging()) return;

    if (this.attackCooldown > 0) this.attackCooldown -= 1;

    const aliveQueens = world.queens.filter((q) => q.alive);
    const nearestQueen = nearest(this.x, this.y, aliveQueens, config.threat.vision * 1.2);
    const nearestSoldier = nearest(this.x, this.y, world.soldiers, config.threat.vision * 0.8, (s) => s.alive);
    const nearestDrone = nearest(this.x, this.y, world.drones, config.threat.vision * 0.65, (d) => d.alive);

    if (nearestQueen) {
      this.state = ThreatState.ASSAULT;
      steer(this, nearestQueen.x - this.x, nearestQueen.y - this.y, config.threat.speed * 1.12, 0.28);
    } else if (nearestDrone || nearestSoldier) {
      this.state = ThreatState.TRACK;
      const target = nearestDrone && nearestSoldier
        ? distance(this.x, this.y, nearestDrone.x, nearestDrone.y) < distance(this.x, this.y, nearestSoldier.x, nearestSoldier.y)
          ? nearestDrone
          : nearestSoldier
        : nearestDrone || nearestSoldier;
      steer(this, target.x - this.x, target.y - this.y, config.threat.speed, 0.22);
    } else {
      const nearestFood = nearest(this.x, this.y, world.food, 240, (f) => f.amount > 0.5);
      if (nearestFood) {
        this.state = ThreatState.TRACK;
        steer(this, nearestFood.x - this.x, nearestFood.y - this.y, config.threat.speed * 0.94, 0.2);
      } else {
        this.state = ThreatState.ROAM;
        moveWithHeading(this, config.threat.speed * 0.85, 0.2);
      }
    }

    const blockedBySoldier = nearestSoldier && this.attemptAttack(nearestSoldier, config.threat.attackDamage, config.threat.attackRange);
    if (!blockedBySoldier && nearestQueen) {
      this.attemptAttack(nearestQueen, config.threat.attackDamage, config.threat.attackRange);
    }
    if (!blockedBySoldier && nearestDrone) {
      this.attemptAttack(nearestDrone, config.threat.attackDamage - 1, config.threat.attackRange - 3);
    }

    notifyThreatActivity(this.x, this.y, 1.6);
    world.clampEntity(this);
  }
}

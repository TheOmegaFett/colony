import { Drone } from '../agents/Drone.js';
import { Soldier } from '../agents/Soldier.js';
import { Brood } from '../agents/Brood.js';
import { randRange } from '../utils.js';

export class AgentSystem {
  constructor(config) {
    this.config = config;
  }

  spawnDrone(world, x, y, colonyId, ageTicks = 0) {
    const drone = new Drone({
      id: world.createId('drone'),
      x,
      y,
      colonyId,
      config: this.config
    });
    drone.ageTicks = Math.max(0, Math.min(drone.maxAgeTicks - 1, ageTicks));
    world.drones.push(drone);
    return drone;
  }

  spawnSoldier(world, x, y, colonyId, ageTicks = 0) {
    const soldier = new Soldier({
      id: world.createId('soldier'),
      x,
      y,
      colonyId,
      config: this.config
    });
    soldier.ageTicks = Math.max(0, Math.min(soldier.maxAgeTicks - 1, ageTicks));
    world.soldiers.push(soldier);
    return soldier;
  }

  spawnBrood(world, x, y, colonyId) {
    const brood = new Brood({
      id: world.createId('brood'),
      x,
      y,
      colonyId
    });
    world.brood.push(brood);
    return brood;
  }

  spawnColonySwarm(world, colonyId, x, y, droneCount, soldierCount) {
    for (let i = 0; i < droneCount; i += 1) {
      const initialAge = randRange(0, this.config.lifecycle.droneMaxAgeTicks * 0.45);
      this.spawnDrone(world, x + randRange(-30, 30), y + randRange(-30, 30), colonyId, initialAge);
    }
    for (let i = 0; i < soldierCount; i += 1) {
      const initialAge = randRange(0, this.config.lifecycle.soldierMaxAgeTicks * 0.4);
      this.spawnSoldier(world, x + randRange(-25, 25), y + randRange(-25, 25), colonyId, initialAge);
    }
  }

  updateDrones(baseContext) {
    const { world, getHiveContext } = baseContext;

    for (const drone of world.drones) {
      if (!drone.alive) continue;
      const hiveCtx = getHiveContext(drone.colonyId);
      if (!hiveCtx) continue;
      drone.update({ ...baseContext, ...hiveCtx });
    }

    world.drones = world.drones.filter((d) => d.alive);
  }

  updateSoldiers(baseContext) {
    const { world, getHiveContext } = baseContext;

    for (const soldier of world.soldiers) {
      if (!soldier.alive) continue;
      const hiveCtx = getHiveContext(soldier.colonyId);
      if (!hiveCtx) continue;
      soldier.update({ ...baseContext, ...hiveCtx });
    }

    world.soldiers = world.soldiers.filter((s) => s.alive);
  }

  updateBrood(baseContext) {
    const { world, getHiveContext } = baseContext;
    const matured = [];

    for (const brood of world.brood) {
      const hiveCtx = getHiveContext(brood.colonyId);
      if (!hiveCtx) continue;
      const role = brood.update({ ...baseContext, ...hiveCtx });
      if (role) matured.push({ brood, role });
    }

    if (!matured.length) return;

    const maturedSet = new Set(matured.map((m) => m.brood.id));
    world.brood = world.brood.filter((b) => !maturedSet.has(b.id));

    for (const item of matured) {
      if (item.role === 'soldier') {
        const ageJitter = randRange(0, this.config.lifecycle.soldierMaxAgeTicks * 0.08);
        this.spawnSoldier(
          world,
          item.brood.x + randRange(-8, 8),
          item.brood.y + randRange(-8, 8),
          item.brood.colonyId,
          ageJitter
        );
      } else {
        const ageJitter = randRange(0, this.config.lifecycle.droneMaxAgeTicks * 0.08);
        this.spawnDrone(
          world,
          item.brood.x + randRange(-8, 8),
          item.brood.y + randRange(-8, 8),
          item.brood.colonyId,
          ageJitter
        );
      }
    }
  }
}

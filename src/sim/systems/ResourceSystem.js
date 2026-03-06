import { randRange, clamp } from '../utils.js';

export class ResourceSystem {
  constructor(config) {
    this.config = config;
  }

  update(world) {
    world.prune();

    const colonyCount = Math.max(1, world.colonies.length);
    const targetFoodNodes = this.config.startup.foodPellets + colonyCount * 4;

    if (world.tick % 120 === 0 && world.food.length < targetFoodNodes) {
      const deficit = targetFoodNodes - world.food.length;
      const spawnCount = Math.min(4, Math.max(1, Math.ceil(deficit / 3)));

      for (let i = 0; i < spawnCount; i += 1) {
        const p = world.randomPosition(50);
        world.addFood(p.x, p.y, randRange(30, 74));
      }
    }

    // Emergency forage support for collapsing hives so one scarcity cycle
    // does not wipe every colony before adaptation kicks in.
    if (world.tick % 90 === 0) {
      for (const hive of world.colonies) {
        if (hive.colony.starvationTicks < 180) continue;
        const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
        const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;
        const x = clamp(nestX + randRange(-220, 220), 0, world.width);
        const y = clamp(nestY + randRange(-220, 220), 0, world.height);
        world.addFood(x, y, randRange(26, 58));
      }
    }
  }
}

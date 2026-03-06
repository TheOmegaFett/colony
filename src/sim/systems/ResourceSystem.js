import { randRange } from '../utils.js';

export class ResourceSystem {
  constructor(config) {
    this.config = config;
  }

  update(world) {
    world.prune();

    if (world.tick % 200 === 0 && world.food.length < this.config.startup.foodPellets + 2) {
      const p = world.randomPosition(50);
      world.addFood(p.x, p.y, randRange(26, 62));
    }
  }
}

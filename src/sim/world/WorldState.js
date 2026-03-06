import { randRange, clamp } from '../utils.js';

export class WorldState {
  constructor(config) {
    this.config = config;
    this.tick = 0;
    this.width = config.world.width;
    this.height = config.world.height;
    this.nextEntityId = 1;

    this.colonies = [];

    this.queens = [];
    this.drones = [];
    this.soldiers = [];
    this.brood = [];
    this.threats = [];
    this.food = [];
    this.hazards = [];
  }

  createId(prefix) {
    const id = `${prefix}_${this.nextEntityId}`;
    this.nextEntityId += 1;
    return id;
  }

  randomPosition(margin = 20) {
    return {
      x: randRange(margin, this.width - margin),
      y: randRange(margin, this.height - margin)
    };
  }

  clampEntity(entity) {
    entity.x = clamp(entity.x, 0, this.width);
    entity.y = clamp(entity.y, 0, this.height);
  }

  addFood(x, y, amount = 40) {
    this.food.push({
      id: this.createId('food'),
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
      amount,
      maxAmount: amount
    });
  }

  addColony(colony) {
    this.colonies.push(colony);
  }

  getColony(colonyId) {
    return this.colonies.find((c) => c.id === colonyId) || null;
  }

  setNest(colonyId, x, y) {
    const colony = this.getColony(colonyId);
    if (!colony) return;

    colony.nest.established = true;
    colony.nest.x = clamp(x, 0, this.width);
    colony.nest.y = clamp(y, 0, this.height);
  }

  seedFood(count) {
    for (let i = 0; i < count; i += 1) {
      const p = this.randomPosition(60);
      this.addFood(p.x, p.y, randRange(30, 70));
    }
  }

  seedHazards(count = 3) {
    for (let i = 0; i < count; i += 1) {
      const p = this.randomPosition(90);
      this.hazards.push({
        id: this.createId('hazard'),
        x: p.x,
        y: p.y,
        radius: randRange(35, 65),
        instability: randRange(0.5, 1)
      });
    }
  }

  prune() {
    this.food = this.food.filter((f) => f.amount > 0.5);
  }
}

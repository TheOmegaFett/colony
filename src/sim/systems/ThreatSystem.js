import { Threat } from '../agents/Threat.js';

export class ThreatSystem {
  constructor(config) {
    this.config = config;
  }

  spawn(world, x, y) {
    const threat = new Threat({
      id: world.createId('threat'),
      x,
      y,
      config: this.config
    });
    world.threats.push(threat);
    return threat;
  }

  update(context) {
    const { world } = context;

    for (const threat of world.threats) {
      if (!threat.alive) continue;
      threat.update(context);
    }

    world.threats = world.threats.filter((t) => t.alive);
  }
}

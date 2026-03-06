export class Brood {
  constructor({ id, x, y, colonyId }) {
    this.id = id;
    this.role = 'brood';
    this.colonyId = colonyId;
    this.x = x;
    this.y = y;
    this.age = 0;
    this.alive = true;
  }

  update(context) {
    const { config, colony, hive, world } = context;
    this.age += 1;

    if (world.tick % config.brood.upkeepIntervalTicks === 0) {
      colony.energy -= config.brood.upkeepEnergyCost;
    }

    if (this.age < config.brood.matureTicks) return null;

    const ownSoldiers = hive.soldiers.length;
    const ownDrones = hive.drones.length;

    const soldierNeed =
      colony.dangerLevel > config.colony.highDangerThreshold ||
      ownSoldiers < Math.max(3, Math.floor(ownDrones * 0.3));

    if (soldierNeed) return 'soldier';
    if (colony.priority === 'EXPAND' || colony.priority === 'FORAGE') return 'drone';

    return Math.random() < 0.7 ? 'drone' : 'soldier';
  }
}

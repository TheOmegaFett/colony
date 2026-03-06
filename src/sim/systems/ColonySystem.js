import { ColonyPriority } from '../model/types.js';
import { distance } from '../utils.js';

export class ColonySystem {
  constructor(config) {
    this.config = config;
  }

  computeDanger(hive, world, comm, relationTo) {
    const nestX = hive.nest.established ? hive.nest.x : hive.queen.x;
    const nestY = hive.nest.established ? hive.nest.y : hive.queen.y;

    let threatPressure = 0;
    for (const threat of world.threats) {
      if (!threat.alive) continue;
      const d = distance(nestX, nestY, threat.x, threat.y);
      const pressure = Math.max(0, 1 - d / 300) * 100;
      threatPressure += pressure;
    }

    const hostileAgents = [
      ...world.soldiers,
      ...world.drones,
      ...world.queens
    ].filter((agent) => {
      if (!agent.alive || !agent.colonyId || agent.colonyId === hive.id) return false;
      return relationTo(agent.colonyId) === 'hostile';
    });

    let hostilePressure = 0;
    for (const hostile of hostileAgents) {
      const d = distance(nestX, nestY, hostile.x, hostile.y);
      const pressure = Math.max(0, 1 - d / 260) * 70;
      hostilePressure += pressure;
    }

    const trailPressure = comm.trailValue('danger', nestX, nestY) * 12;
    return Math.min(100, threatPressure + trailPressure + hostilePressure);
  }

  applyFoodEconomy(colony, hive, world) {
    const foodCfg = this.config.colony;
    if (!Number.isFinite(colony.ageRegenPool)) colony.ageRegenPool = 0;

    const foodUse =
      foodCfg.baseFoodUsePerTick +
      (hive.queen?.alive ? foodCfg.queenFoodUsePerTick : 0) +
      hive.drones.length * foodCfg.droneFoodUsePerTick +
      hive.soldiers.length * foodCfg.soldierFoodUsePerTick +
      hive.brood.length * foodCfg.broodFoodUsePerTick;
    colony.foodUsePerTick = foodUse;
    colony.survivalFoodTarget = Math.min(
      foodCfg.maxFoodStock,
      Math.max(12, foodUse * foodCfg.survivalFoodReserveTicks)
    );
    colony.maxSustainableFoodTarget = Math.min(
      foodCfg.maxFoodStock,
      Math.max(colony.survivalFoodTarget * 1.25, foodUse * foodCfg.maxFoodReserveTicks)
    );

    let remainingNeed = foodUse;
    let consumedFood = 0;

    const fromStock = Math.min(colony.foodStock, remainingNeed);
    colony.foodStock -= fromStock;
    remainingNeed -= fromStock;
    colony.energy += fromStock * foodCfg.foodToEnergyRatio;
    consumedFood += fromStock;

    if (colony.energy < this.config.colony.lowEnergyThreshold && colony.foodStock > 0) {
      const burn = Math.min(colony.foodStock, foodCfg.extraFoodBurnPerTick);
      colony.foodStock -= burn;
      colony.energy += burn * foodCfg.foodToEnergyRatio;
      consumedFood += burn;
    }

    colony.ageRegenPool = Math.min(
      foodCfg.ageRegenPoolMax,
      colony.ageRegenPool + consumedFood * foodCfg.ageRegenFromFood
    );

    if (remainingNeed > 0) {
      colony.starvationTicks += 1;
      colony.energy -= remainingNeed * foodCfg.starvationEnergyPenalty;
      colony.ageRegenPool = Math.max(0, colony.ageRegenPool - remainingNeed * 4.5);
      if (
        hive.queen?.alive &&
        world.tick % foodCfg.starvationQueenDamageTicks === 0
      ) {
        hive.queen.takeDamage(foodCfg.starvationQueenDamage);
      }
    } else {
      colony.starvationTicks = Math.max(0, colony.starvationTicks - 1);
    }

    colony.foodStock = Math.max(0, Math.min(foodCfg.maxFoodStock, colony.foodStock));
  }

  choosePriority(colony, queenAlive) {
    if (!queenAlive) return ColonyPriority.SURVIVE;
    if (colony.foodStock < Math.max(8, colony.survivalFoodTarget * 0.65)) return ColonyPriority.SURVIVE;
    if (colony.dangerLevel > this.config.colony.highDangerThreshold) return ColonyPriority.DEFEND;
    if (colony.foodStock < this.config.colony.lowEnergyThreshold * 0.75) return ColonyPriority.FORAGE;
    if (colony.energy < this.config.colony.lowEnergyThreshold) return ColonyPriority.FORAGE;
    if (
      colony.energy > this.config.colony.maxEnergy * 0.7 &&
      colony.foodStock > this.config.colony.lowEnergyThreshold * 1.4 &&
      colony.dangerLevel < 20
    ) {
      return ColonyPriority.EXPAND;
    }
    if (colony.dangerLevel > this.config.colony.recoverDangerThreshold) return ColonyPriority.RECOVER;
    return ColonyPriority.FORAGE;
  }

  update(colony, hive, world, comm, relationTo) {
    colony.dangerLevel = this.computeDanger(hive, world, comm, relationTo);

    this.applyFoodEconomy(colony, hive, world);

    colony.priority = this.choosePriority(colony, hive.queen?.alive);

    colony.energy = Math.max(0, Math.min(this.config.colony.maxEnergy, colony.energy));
    colony.foodIncomeRecent *= 0.96;

    if (colony.energy <= 0 && world.tick % 12 === 0 && hive.queen?.alive) {
      hive.queen.takeDamage(1.2);
    }

    colony.health = hive.queen?.hp || 0;
  }
}

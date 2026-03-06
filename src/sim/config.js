export const SIM_CONFIG = {
  tickMs: 50,
  world: {
    width: 2400,
    height: 1600,
    nestRadius: 36,
    gridCellSize: 20
  },
  startup: {
    drones: 12,
    soldiers: 4,
    foodPellets: 10
  },
  colony: {
    startingEnergy: 90,
    startingFoodStock: 85,
    maxEnergy: 300,
    maxFoodStock: 700,
    lowEnergyThreshold: 40,
    highDangerThreshold: 55,
    recoverDangerThreshold: 25,
    baseFoodUsePerTick: 0.04,
    queenFoodUsePerTick: 0.04,
    droneFoodUsePerTick: 0.007,
    soldierFoodUsePerTick: 0.01,
    broodFoodUsePerTick: 0.009,
    foodToEnergyRatio: 0.55,
    extraFoodBurnPerTick: 0.2,
    starvationEnergyPenalty: 0.55,
    starvationQueenDamageTicks: 20,
    starvationQueenDamage: 0.8,
    successionFoodCost: 32,
    successionEnergyFloor: 25
  },
  queen: {
    speed: 0.7,
    maxHp: 180,
    scoutDurationTicks: 180,
    settleDurationTicks: 30,
    broodCooldownTicks: 45,
    broodFoodCost: 7,
    broodEnergyCost: 2,
    relocateDangerTicks: 120
  },
  drone: {
    speed: 1.8,
    hp: 18,
    vision: 95,
    carryAmount: 8,
    evadeDistance: 70
  },
  soldier: {
    speed: 1.55,
    hp: 48,
    vision: 160,
    attackRange: 22,
    attackDamage: 5
  },
  threat: {
    speed: 1.35,
    hp: 52,
    vision: 170,
    attackRange: 24,
    attackDamage: 4
  },
  brood: {
    matureTicks: 260,
    upkeepIntervalTicks: 20,
    upkeepEnergyCost: 0.6
  },
  lifecycle: {
    queenMinAgeTicks: 26000,
    queenMaxAgeTicks: 36000,
    droneMinAgeTicks: 7500,
    droneMaxAgeTicks: 12000,
    soldierMinAgeTicks: 13000,
    soldierMaxAgeTicks: 20000,
    threatMinAgeTicks: 6500,
    threatMaxAgeTicks: 11000
  },
  communication: {
    trailDecay: 0.965,
    signalDecayPerTick: 1,
    memoryDecayPerTick: 1,
    maxSignals: 500,
    maxMemory: 120,
    broadcastRadius: 120
  }
};

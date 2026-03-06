import { clamp } from '../utils.js';
import { distanceSq } from '../utils.js';

export class HiveCommSystem {
  constructor(config, world) {
    this.config = config;
    this.world = world;

    this.cellSize = config.world.gridCellSize;
    this.cols = Math.ceil(world.width / this.cellSize);
    this.rows = Math.ceil(world.height / this.cellSize);
    this.totalCells = this.cols * this.rows;

    this.foodTrail = new Float32Array(this.totalCells);
    this.dangerTrail = new Float32Array(this.totalCells);
    this.signals = [];
    this.memory = [];
  }

  index(col, row) {
    const c = clamp(col, 0, this.cols - 1);
    const r = clamp(row, 0, this.rows - 1);
    return r * this.cols + c;
  }

  worldToCell(x, y) {
    return {
      col: clamp(Math.floor(x / this.cellSize), 0, this.cols - 1),
      row: clamp(Math.floor(y / this.cellSize), 0, this.rows - 1)
    };
  }

  cellToWorld(col, row) {
    return {
      x: (col + 0.5) * this.cellSize,
      y: (row + 0.5) * this.cellSize
    };
  }

  getTrailBuffer(type) {
    return type === 'danger' ? this.dangerTrail : this.foodTrail;
  }

  depositTrail(type, x, y, strength = 1, radiusCells = 1) {
    const trail = this.getTrailBuffer(type);
    const { col, row } = this.worldToCell(x, y);

    for (let r = row - radiusCells; r <= row + radiusCells; r += 1) {
      for (let c = col - radiusCells; c <= col + radiusCells; c += 1) {
        if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
        const dx = c - col;
        const dy = r - row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radiusCells) continue;
        const falloff = 1 - d / (radiusCells + 0.01);
        const idx = this.index(c, r);
        trail[idx] = Math.min(255, trail[idx] + strength * falloff);
      }
    }
  }

  trailValue(type, x, y) {
    const trail = this.getTrailBuffer(type);
    const { col, row } = this.worldToCell(x, y);
    return trail[this.index(col, row)] || 0;
  }

  vectorToTrailPeak(type, x, y) {
    const trail = this.getTrailBuffer(type);
    const { col, row } = this.worldToCell(x, y);

    let bestValue = trail[this.index(col, row)];
    let bestDir = { x: 0, y: 0 };

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const value = trail[this.index(nc, nr)];
        if (value > bestValue) {
          bestValue = value;
          bestDir = { x: dc, y: dr };
        }
      }
    }

    return { ...bestDir, value: bestValue };
  }

  addSignal({ type, x, y, radius = 120, ttl = 8, strength = 1, sourceRole = 'unknown' }) {
    if (this.signals.length >= this.config.communication.maxSignals) {
      this.signals.shift();
    }
    this.signals.push({ type, x, y, radius, ttl, strength, sourceRole });
  }

  getSignalsNear(x, y, radius, types = null) {
    const maxDistSq = radius * radius;
    const out = [];
    for (const signal of this.signals) {
      if (types && !types.includes(signal.type)) continue;
      const dSq = distanceSq(x, y, signal.x, signal.y);
      const signalRadiusSq = signal.radius * signal.radius;
      if (dSq <= maxDistSq && dSq <= signalRadiusSq) out.push(signal);
    }
    return out;
  }

  remember({ type, x, y, ttl = 120, confidence = 1 }) {
    if (this.memory.length >= this.config.communication.maxMemory) {
      this.memory.shift();
    }

    const existing = this.memory.find((m) => m.type === type && distanceSq(m.x, m.y, x, y) < 20 * 20);
    if (existing) {
      existing.ttl = Math.max(existing.ttl, ttl);
      existing.confidence = Math.min(1, existing.confidence + confidence * 0.2);
      existing.x = (existing.x + x) * 0.5;
      existing.y = (existing.y + y) * 0.5;
      return;
    }

    this.memory.push({ type, x, y, ttl, confidence });
  }

  bestMemory(type) {
    let best = null;
    for (const item of this.memory) {
      if (item.type !== type) continue;
      if (!best || item.confidence * item.ttl > best.confidence * best.ttl) {
        best = item;
      }
    }
    return best;
  }

  step() {
    const decay = this.config.communication.trailDecay;
    for (let i = 0; i < this.totalCells; i += 1) {
      this.foodTrail[i] *= decay;
      this.dangerTrail[i] *= decay;
      if (this.foodTrail[i] < 0.01) this.foodTrail[i] = 0;
      if (this.dangerTrail[i] < 0.01) this.dangerTrail[i] = 0;
    }

    const signalDecay = this.config.communication.signalDecayPerTick;
    const memoryDecay = this.config.communication.memoryDecayPerTick;

    for (const signal of this.signals) signal.ttl -= signalDecay;
    for (const item of this.memory) {
      item.ttl -= memoryDecay;
      item.confidence *= 0.995;
    }

    this.signals = this.signals.filter((s) => s.ttl > 0);
    this.memory = this.memory.filter((m) => m.ttl > 0.5 && m.confidence > 0.05);
  }

  snapshot() {
    return {
      cols: this.cols,
      rows: this.rows,
      cellSize: this.cellSize,
      foodTrail: Array.from(this.foodTrail),
      dangerTrail: Array.from(this.dangerTrail),
      signals: this.signals,
      memory: this.memory
    };
  }
}

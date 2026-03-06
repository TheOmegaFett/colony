import { distanceSq } from '../utils.js';

export class PerceptionSystem {
  static nearest(x, y, list, radius = Infinity, predicate = null) {
    const maxDistSq = radius * radius;
    let best = null;
    let bestSq = Infinity;

    for (const item of list) {
      if (predicate && !predicate(item)) continue;
      const dSq = distanceSq(x, y, item.x, item.y);
      if (dSq < bestSq && dSq <= maxDistSq) {
        best = item;
        bestSq = dSq;
      }
    }

    return best;
  }

  static within(x, y, list, radius, predicate = null) {
    const maxDistSq = radius * radius;
    const out = [];
    for (const item of list) {
      if (predicate && !predicate(item)) continue;
      const dSq = distanceSq(x, y, item.x, item.y);
      if (dSq <= maxDistSq) out.push(item);
    }
    return out;
  }
}

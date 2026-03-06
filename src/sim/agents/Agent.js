import { randomUnitVector } from '../utils.js';

export class Agent {
  constructor({ id, role, x, y, hp = 10, speed = 1, colonyId = null, maxAgeTicks = Infinity }) {
    const heading = randomUnitVector();
    this.id = id;
    this.role = role;
    this.colonyId = colonyId;
    this.x = x;
    this.y = y;
    this.vx = heading.x * speed;
    this.vy = heading.y * speed;
    this.heading = Math.atan2(this.vy, this.vx);
    this.hp = hp;
    this.speed = speed;
    this.ageTicks = 0;
    this.maxAgeTicks = maxAgeTicks;
    this.state = 'IDLE';
    this.alive = true;
  }

  tickAging() {
    this.ageTicks += 1;
    if (this.ageTicks >= this.maxAgeTicks) {
      this.alive = false;
      return true;
    }
    return false;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }
}

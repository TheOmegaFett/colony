export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const randRange = (min, max) => min + Math.random() * (max - min);

export const distanceSq = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const distance = (ax, ay, bx, by) => Math.sqrt(distanceSq(ax, ay, bx, by));

export const normalize = (x, y) => {
  const m = Math.sqrt(x * x + y * y);
  if (!m) return { x: 0, y: 0 };
  return { x: x / m, y: y / m };
};

export const randomUnitVector = () => {
  const t = Math.random() * Math.PI * 2;
  return { x: Math.cos(t), y: Math.sin(t) };
};

export const moveToward = (entity, tx, ty, speed) => {
  const dir = normalize(tx - entity.x, ty - entity.y);
  entity.vx = dir.x * speed;
  entity.vy = dir.y * speed;
  entity.x += entity.vx;
  entity.y += entity.vy;
};

export const moveWithHeading = (entity, speed, jitter = 0.18) => {
  entity.heading += randRange(-jitter, jitter);
  entity.vx = Math.cos(entity.heading) * speed;
  entity.vy = Math.sin(entity.heading) * speed;
  entity.x += entity.vx;
  entity.y += entity.vy;
};

export const steer = (entity, dx, dy, speed, blend = 0.2) => {
  const d = normalize(dx, dy);
  const tvx = d.x * speed;
  const tvy = d.y * speed;
  entity.vx = entity.vx + (tvx - entity.vx) * blend;
  entity.vy = entity.vy + (tvy - entity.vy) * blend;
  entity.x += entity.vx;
  entity.y += entity.vy;
};

export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

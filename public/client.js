const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const menu = document.getElementById('context-menu');
const colonySubmenu = document.getElementById('colony-submenu');
const colonyKey = document.getElementById('colony-key');

let latest = null;
let tickMs = 100;
let menuWorldPoint = null;
let frame = 0;

const previousPositions = new Map();
const view = {
  dpr: Math.max(1, window.devicePixelRatio || 1),
  zoom: 1,
  minZoom: 0.15,
  maxZoom: 4,
  cameraX: 0,
  cameraY: 0,
  initialized: false,
  worldWidth: 0,
  worldHeight: 0,
  drag: {
    active: false,
    moved: false,
    lastClientX: 0,
    lastClientY: 0
  }
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resizeCanvas() {
  view.dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * view.dpr);
  canvas.height = Math.floor(window.innerHeight * view.dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function scalePx() {
  return view.zoom * view.dpr;
}

function clampCameraToWorld() {
  if (!latest) return;
  const world = latest.world;
  const halfWorldW = canvas.width / (2 * scalePx());
  const halfWorldH = canvas.height / (2 * scalePx());

  if (world.width <= halfWorldW * 2) {
    view.cameraX = world.width / 2;
  } else {
    view.cameraX = clamp(view.cameraX, halfWorldW, world.width - halfWorldW);
  }

  if (world.height <= halfWorldH * 2) {
    view.cameraY = world.height / 2;
  } else {
    view.cameraY = clamp(view.cameraY, halfWorldH, world.height - halfWorldH);
  }
}

function fitCameraToWorld(world) {
  const fitZoom = Math.min(
    canvas.width / (world.width * view.dpr),
    canvas.height / (world.height * view.dpr)
  );
  view.zoom = clamp(fitZoom * 0.94, view.minZoom, view.maxZoom);
  view.cameraX = world.width / 2;
  view.cameraY = world.height / 2;
  view.initialized = true;
  view.worldWidth = world.width;
  view.worldHeight = world.height;
  clampCameraToWorld();
}

function ensureCamera(snapshot) {
  if (!snapshot) return;
  if (
    !view.initialized ||
    view.worldWidth !== snapshot.world.width ||
    view.worldHeight !== snapshot.world.height
  ) {
    fitCameraToWorld(snapshot.world);
    return;
  }
  clampCameraToWorld();
}

function applyWorldTransform() {
  const scale = scalePx();
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    canvas.width / 2 - view.cameraX * scale,
    canvas.height / 2 - view.cameraY * scale
  );
}

function screenToWorld(clientX, clientY) {
  const px = clientX * view.dpr;
  const py = clientY * view.dpr;
  return {
    x: view.cameraX + (px - canvas.width / 2) / scalePx(),
    y: view.cameraY + (py - canvas.height / 2) / scalePx()
  };
}

function connect() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProtocol}://${window.location.host}`);

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') {
      tickMs = msg.payload.tickMs;
      latest = msg.payload.snapshot;
      ensureCamera(latest);
      return;
    }

    if (msg.type === 'snapshot') {
      latest = msg.payload;
    }
  });

  ws.addEventListener('close', () => {
    setTimeout(() => {
      socket = connect();
    }, 700);
  });

  return ws;
}

let socket = connect();

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = Number.parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function colorVariant(hex, lift = 0) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (base) => Math.max(0, Math.min(255, Math.round(base + (255 - base) * lift)));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function colonyMap(snapshot) {
  const map = new Map();
  for (const colony of snapshot.colonies || []) map.set(colony.id, colony);
  return map;
}

function updateColonyLegend(snapshot) {
  if (!colonyKey) return;

  const colonies = snapshot.colonies || [];
  if (!colonies.length) {
    colonyKey.innerHTML = '<div class=\"legend-item\">No active colonies</div>';
    return;
  }

  colonyKey.innerHTML = colonies
    .map((colony) => {
      const mode = colony.mode || 'competitive';
      return `<div class=\"legend-item\"><span class=\"swatch dynamic-colony\" style=\"background:${colony.color}\"></span>${colony.name} (${mode})</div>`;
    })
    .join('');
}

function entityColor(colony, role, carrying = false) {
  const base = colony?.color || '#ffffff';
  if (role === 'queen') return colorVariant(base, 0.08);
  if (role === 'drone' && carrying) return 'rgb(179, 243, 125)';
  if (role === 'drone') return colorVariant(base, 0.2);
  if (role === 'soldier') return colorVariant(base, -0.05);
  if (role === 'brood') return colorVariant(base, 0.35);
  return base;
}

function drawTrails(comm) {
  const cellSize = comm.cellSize;
  const cols = comm.cols;
  const rows = comm.rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      const food = comm.foodTrail[i] || 0;
      const danger = comm.dangerTrail[i] || 0;
      if (food < 0.06 && danger < 0.06) continue;

      const x = col * cellSize;
      const y = row * cellSize;
      const alphaFood = Math.min(0.28, food / 50);
      const alphaDanger = Math.min(0.33, danger / 50);

      if (alphaFood > 0.02) {
        ctx.fillStyle = `rgba(109, 224, 133, ${alphaFood})`;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
      if (alphaDanger > 0.02) {
        ctx.fillStyle = `rgba(235, 98, 78, ${alphaDanger})`;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
}

function drawSignals(signals, colonyById) {
  for (const signal of signals || []) {
    const alpha = Math.min(0.35, 0.04 * signal.ttl);

    if (
      signal.type.includes('threat') ||
      signal.type.includes('danger') ||
      signal.type === 'defend_zone' ||
      signal.type.includes('enemy')
    ) {
      ctx.strokeStyle = `rgba(241, 112, 92, ${alpha})`;
    } else {
      const colony = colonyById.get(signal.colonyId);
      const rgb = colony ? hexToRgb(colony.color) : { r: 115, g: 232, b: 140 };
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(signal.x, signal.y, Math.max(8, signal.radius * 0.18), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAgentPaths(entities, colonyById) {
  ctx.lineWidth = 1.25;
  for (const entity of entities) {
    const prev = previousPositions.get(entity.id);
    if (!prev) continue;

    const col = colonyById.get(entity.colonyId);
    const rgb = col ? hexToRgb(col.color) : { r: 200, g: 200, b: 200 };
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(entity.x, entity.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function updatePreviousPositions(snapshot) {
  const merged = [
    ...(snapshot.queens || []),
    ...(snapshot.drones || []),
    ...(snapshot.soldiers || []),
    ...(snapshot.threats || [])
  ];

  for (const entity of merged) {
    previousPositions.set(entity.id, { x: entity.x, y: entity.y, age: 0 });
  }

  for (const [id, point] of previousPositions) {
    point.age += 1;
    if (point.age > 120) previousPositions.delete(id);
  }
}

function drawEntityCircle(entity, color, radius) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawThreat(entity) {
  const size = 8;
  ctx.fillStyle = '#ef6f59';
  ctx.beginPath();
  ctx.moveTo(entity.x, entity.y - size);
  ctx.lineTo(entity.x - size, entity.y + size * 0.7);
  ctx.lineTo(entity.x + size, entity.y + size * 0.7);
  ctx.closePath();
  ctx.fill();
}

function drawWorldBoundary(world) {
  ctx.strokeStyle = 'rgba(219, 236, 198, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.width, world.height);
}

function draw(snapshot) {
  if (!snapshot) return;
  ensureCamera(snapshot);

  const colonyById = colonyMap(snapshot);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, '#112016');
  g.addColorStop(1, '#1c2e21');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  applyWorldTransform();

  drawTrails(snapshot.comm);
  drawWorldBoundary(snapshot.world);

  for (const hazard of snapshot.world.hazards || []) {
    ctx.fillStyle = 'rgba(204, 148, 82, 0.16)';
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const colony of snapshot.colonies || []) {
    if (!colony.nest.established) continue;
    const { r, g: gg, b } = hexToRgb(colony.color);
    ctx.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.12)`;
    ctx.strokeStyle = `rgba(${r}, ${gg}, ${b}, 0.6)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(colony.nest.x, colony.nest.y, colony.nest.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  for (const food of snapshot.food || []) {
    const ratio = Math.max(0.2, food.amount / (food.maxAmount || 1));
    drawEntityCircle(food, `rgba(162, 234, 117, ${0.45 + ratio * 0.5})`, 5 + ratio * 4);
  }

  drawAgentPaths(snapshot.drones || [], colonyById);
  drawAgentPaths(snapshot.soldiers || [], colonyById);

  for (const brood of snapshot.brood || []) {
    const colony = colonyById.get(brood.colonyId);
    drawEntityCircle(brood, entityColor(colony, 'brood'), 4);
  }

  for (const drone of snapshot.drones || []) {
    const colony = colonyById.get(drone.colonyId);
    drawEntityCircle(drone, entityColor(colony, 'drone', drone.carrying > 0), 4.8);
  }

  for (const soldier of snapshot.soldiers || []) {
    const colony = colonyById.get(soldier.colonyId);
    drawEntityCircle(soldier, entityColor(colony, 'soldier'), 6.6);
  }

  for (const threat of snapshot.threats || []) {
    drawThreat(threat);
  }

  for (const queen of snapshot.queens || []) {
    const colony = colonyById.get(queen.colonyId);
    drawEntityCircle(queen, entityColor(colony, 'queen'), 10.5);
  }

  if (frame % 2 === 0) {
    drawSignals(snapshot.comm.signals, colonyById);
  }

  updatePreviousPositions(snapshot);
  frame += 1;

  updateColonyLegend(snapshot);
  drawHud(snapshot);
}

function drawHud(snapshot) {
  const colonies = snapshot.colonies || [];
  const anchor = colonies[0];

  const relationLines = anchor
    ? colonies
      .filter((c) => c.id !== anchor.id)
      .map((c) => {
        const relation = anchor.relations?.[c.id]?.state || 'neutral';
        return `${anchor.name} -> ${c.name}: ${relation}`;
      })
    : [];

  const colonyLines = colonies.slice(0, 4).map((c) => {
    const queen = (snapshot.queens || []).find((q) => q.colonyId === c.id);
    const drones = (snapshot.drones || []).filter((d) => d.colonyId === c.id).length;
    const soldiers = (snapshot.soldiers || []).filter((s) => s.colonyId === c.id).length;
    const ageSec = queen ? (queen.ageTicks * tickMs / 1000).toFixed(0) : '-';

    return `${c.name} (${c.mode}) | Q:${queen ? 1 : 0} age:${ageSec}s D:${drones} S:${soldiers} E:${c.colony.energy.toFixed(0)} F:${c.colony.foodStock.toFixed(0)} Stv:${c.colony.starvationTicks}`;
  });

  hud.innerHTML = [
    `<strong>Computational Hive Network</strong>`,
    `Tick: ${snapshot.tick}`,
    `Colonies: ${colonies.length} | Threats: ${(snapshot.threats || []).length} | Food Pellets: ${(snapshot.food || []).length}`,
    `Camera: zoom ${view.zoom.toFixed(2)}x | Drag: pan | Wheel: zoom`,
    ...colonyLines,
    ...(relationLines.length ? ['<strong>Relations</strong>', ...relationLines] : []),
    `Tick Rate: ${(1000 / tickMs).toFixed(1)} / sec`
  ].join('<br/>');
}

function renderLoop() {
  draw(latest);
  requestAnimationFrame(renderLoop);
}

function closeMenu() {
  menu.classList.add('hidden');
  colonySubmenu.classList.remove('open');
}

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (!latest || view.drag.active) return;

  const worldPoint = screenToWorld(event.clientX, event.clientY);
  menuWorldPoint = worldPoint;
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.classList.remove('hidden');
});

canvas.addEventListener('wheel', (event) => {
  if (!latest) return;
  event.preventDefault();

  const before = screenToWorld(event.clientX, event.clientY);
  const zoomFactor = Math.exp(-event.deltaY * 0.0012);
  view.zoom = clamp(view.zoom * zoomFactor, view.minZoom, view.maxZoom);
  const after = screenToWorld(event.clientX, event.clientY);

  view.cameraX += before.x - after.x;
  view.cameraY += before.y - after.y;
  clampCameraToWorld();
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  view.drag.active = true;
  view.drag.moved = false;
  view.drag.lastClientX = event.clientX;
  view.drag.lastClientY = event.clientY;
  canvas.style.cursor = 'grabbing';
  closeMenu();
});

window.addEventListener('pointermove', (event) => {
  if (!view.drag.active) return;

  const dx = event.clientX - view.drag.lastClientX;
  const dy = event.clientY - view.drag.lastClientY;
  view.drag.lastClientX = event.clientX;
  view.drag.lastClientY = event.clientY;

  if (Math.abs(dx) + Math.abs(dy) > 1) view.drag.moved = true;

  view.cameraX -= dx / scalePx();
  view.cameraY -= dy / scalePx();
  clampCameraToWorld();
});

window.addEventListener('pointerup', () => {
  view.drag.active = false;
  canvas.style.cursor = 'default';
});

window.addEventListener('click', (event) => {
  if (!menu.contains(event.target)) {
    closeMenu();
  }
});

menu.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || !menuWorldPoint) return;

  if (button.classList.contains('submenu-trigger')) {
    colonySubmenu.classList.toggle('open');
    return;
  }

  const action = button.dataset.action;
  if (!action) return;

  const payload = {
    type: action,
    x: menuWorldPoint.x,
    y: menuWorldPoint.y
  };

  if (action === 'spawn_colony') {
    payload.mode = button.dataset.mode || 'competitive';
  }

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }

  closeMenu();
});

window.addEventListener('resize', () => {
  resizeCanvas();
  if (latest) ensureCamera(latest);
});

resizeCanvas();
renderLoop();

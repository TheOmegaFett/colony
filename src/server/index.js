import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

import { Simulation } from '../sim/Simulation.js';
import { ServerMessageType } from '../shared/protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');

const app = express();
app.use(express.static(publicDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const sim = new Simulation();
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.send(
    JSON.stringify({
      type: ServerMessageType.INIT,
      payload: {
        tickMs: sim.config.tickMs,
        snapshot: sim.snapshot()
      }
    })
  );

  ws.on('message', (raw) => {
    try {
      const command = JSON.parse(String(raw));
      sim.queueCommand(command);
    } catch {
      // Ignore malformed commands
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

setInterval(() => {
  const snapshot = sim.tick();
  const message = JSON.stringify({ type: ServerMessageType.SNAPSHOT, payload: snapshot });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}, sim.config.tickMs);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Computational hive running at http://localhost:${port}`);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { ClientCommandType, ServerMessageType } from '../src/shared/protocol.js';

test('protocol exports expected message and command types', () => {
  assert.equal(ServerMessageType.INIT, 'init');
  assert.equal(ServerMessageType.SNAPSHOT, 'snapshot');

  assert.equal(ClientCommandType.SPAWN_FOOD, 'spawn_food');
  assert.equal(ClientCommandType.SPAWN_THREAT, 'spawn_threat');
  assert.equal(ClientCommandType.SPAWN_COLONY, 'spawn_colony');
});

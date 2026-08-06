import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomInviteUrl, isScreenShareStream, normalizeInviteRoomCode } from '../extension/collaboration-tools.js';

test('builds a secure direct room link from the websocket server URL', () => {
  assert.equal(
    buildRoomInviteUrl('wss://aps-watch-together-server.onrender.com/ws', 'ABCD-EFGH'),
    'https://aps-watch-together-server.onrender.com/join/ABCD-EFGH'
  );
});

test('normalizes room codes and identifies the presenter stream', () => {
  assert.equal(normalizeInviteRoomCode('ab01-cd23-ef'), 'ABCD23EF');
  assert.equal(isScreenShareStream('peer-1', 'screen-1', { active: true, presenterId: 'peer-1', streamId: 'screen-1' }), true);
  assert.equal(isScreenShareStream('peer-2', 'screen-1', { active: true, presenterId: 'peer-1', streamId: 'screen-1' }), false);
});

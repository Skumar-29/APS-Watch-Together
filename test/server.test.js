import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 18787;
let serverProcess;

function waitForMessage(ws, type, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeout);
    const handler = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === type) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(message);
      }
    };
    ws.addEventListener('message', handler);
  });
}

function connect(name, sessionId = '') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const onOpen = () => {
      cleanup();
      ws.send(JSON.stringify({ type: 'hello', displayName: name, sessionId }));
      resolve(ws);
    };
    const onError = (event) => {
      cleanup();
      reject(event.error || new Error('WebSocket connection failed'));
    };
    const cleanup = () => {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
  });
}

test.before(async () => {
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../server/', import.meta.url),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 4000);
    serverProcess.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProcess.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
  });
});

test.after(() => serverProcess?.kill('SIGTERM'));

test('creates a room, joins a friend, and relays playback', async () => {
  const host = await connect('Host');
  const guest = await connect('Guest');

  const roomPromise = waitForMessage(host, 'room-created');
  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await roomPromise;
  assert.equal(created.participants.length, 1);
  assert.equal(created.hostId, created.selfId);

  const joinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const joined = await joinedPromise;
  assert.equal(joined.participants.length, 2);

  const playbackPromise = waitForMessage(guest, 'playback');
  host.send(JSON.stringify({ type: 'playback', command: { kind: 'play', time: 123, paused: false, rate: 1, sentAt: Date.now() } }));
  const playback = await playbackPromise;
  assert.equal(playback.command.kind, 'play');
  assert.equal(playback.command.time, 123);

  host.close();
  guest.close();
});

test('enforces host controls, then allows shared controls', async () => {
  const host = await connect('Control Host');
  const guest = await connect('Control Guest');

  const createdPromise = waitForMessage(host, 'room-created');
  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await createdPromise;

  const joinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  await joinedPromise;

  const deniedPromise = waitForMessage(guest, 'error');
  guest.send(JSON.stringify({ type: 'playback', command: { kind: 'pause', time: 5, paused: true, rate: 1, sentAt: Date.now() } }));
  const denied = await deniedPromise;
  assert.match(denied.message, /Only the host/i);

  const policyPromise = waitForMessage(guest, 'control-policy');
  host.send(JSON.stringify({ type: 'control-policy', everyoneCanControl: true }));
  const policy = await policyPromise;
  assert.equal(policy.everyoneCanControl, true);

  const relayedPromise = waitForMessage(host, 'playback');
  guest.send(JSON.stringify({ type: 'playback', command: { kind: 'seek', time: 42, paused: true, rate: 1, sentAt: Date.now() } }));
  const relayed = await relayedPromise;
  assert.equal(relayed.command.kind, 'seek');
  assert.equal(relayed.command.time, 42);

  host.close();
  guest.close();
});

test('transfers host role when the host leaves', async () => {
  const host = await connect('Leaving Host');
  const guest = await connect('New Host');

  const createdPromise = waitForMessage(host, 'room-created');
  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await createdPromise;

  const joinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const joined = await joinedPromise;
  const guestId = joined.selfId;

  const changedPromise = waitForMessage(guest, 'host-changed');
  host.send(JSON.stringify({ type: 'leave-room' }));
  const changed = await changedPromise;
  assert.equal(changed.hostId, guestId);

  host.close();
  guest.close();
});

test('reserves host ownership during a brief reconnect', async () => {
  const sessionId = 'stable-host-session-123456';
  const host = await connect('Reconnecting Host', sessionId);
  const guest = await connect('Waiting Guest', 'stable-guest-session-123456');

  const createdPromise = waitForMessage(host, 'room-created');
  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await createdPromise;

  const joinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  await joinedPromise;

  const interruptedPromise = waitForMessage(guest, 'host-changed');
  host.close();
  const interrupted = await interruptedPromise;
  assert.equal(interrupted.hostId, '');

  const returningHost = await connect('Reconnecting Host', sessionId);
  const rejoinedPromise = waitForMessage(returningHost, 'room-joined');
  returningHost.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const rejoined = await rejoinedPromise;
  assert.equal(rejoined.hostId, rejoined.selfId);

  returningHost.close();
  guest.close();
});

test('host can lock and reopen a room', async () => {
  const host = await connect('Lock Host', 'lock-host-session-123456');
  const guest = await connect('Inside Guest', 'inside-guest-session-123456');
  const outsider = await connect('Outside Guest', 'outside-guest-session-123456');

  const createdPromise = waitForMessage(host, 'room-created');
  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await createdPromise;

  const joinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  await joinedPromise;

  const lockedPromise = waitForMessage(guest, 'room-lock');
  host.send(JSON.stringify({ type: 'room-lock', locked: true }));
  const locked = await lockedPromise;
  assert.equal(locked.locked, true);

  const deniedPromise = waitForMessage(outsider, 'error');
  outsider.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const denied = await deniedPromise;
  assert.match(denied.message, /locked/i);

  const unlockedPromise = waitForMessage(guest, 'room-lock');
  host.send(JSON.stringify({ type: 'room-lock', locked: false }));
  await unlockedPromise;

  const outsiderJoinedPromise = waitForMessage(outsider, 'room-joined');
  outsider.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const outsiderJoined = await outsiderJoinedPromise;
  assert.equal(outsiderJoined.roomCode, created.roomCode);

  host.close();
  guest.close();
  outsider.close();
});

test('hands host control from full panel to Cinema Mode without transferring to a guest', async () => {
  const sessionId = 'cinema-handoff-host-session-123456';
  const hostPanel = await connect('Cinema Host', sessionId);
  const guest = await connect('Cinema Guest', 'cinema-handoff-guest-session-123456');

  const createdPromise = waitForMessage(hostPanel, 'room-created');
  hostPanel.send(JSON.stringify({ type: 'create-room' }));
  const created = await createdPromise;

  const guestJoinedPromise = waitForMessage(guest, 'room-joined');
  guest.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  await guestJoinedPromise;

  const cinema = await connect('Cinema Host', sessionId);
  const cinemaJoinedPromise = waitForMessage(cinema, 'room-joined');
  cinema.send(JSON.stringify({ type: 'join-room', roomCode: created.roomCode }));
  const cinemaJoined = await cinemaJoinedPromise;
  assert.equal(cinemaJoined.hostId, cinemaJoined.selfId);

  hostPanel.close();

  const playbackPromise = waitForMessage(guest, 'playback');
  cinema.send(JSON.stringify({
    type: 'playback',
    command: { kind: 'pause', time: 88, paused: true, rate: 1, sentAt: Date.now() }
  }));
  const playback = await playbackPromise;
  assert.equal(playback.command.kind, 'pause');
  assert.equal(playback.command.time, 88);

  cinema.close();
  guest.close();
});

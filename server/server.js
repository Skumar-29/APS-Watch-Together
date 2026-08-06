import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class SimpleWebSocket extends EventEmitter {
  constructor(socket, initialData = Buffer.alloc(0), maxPayload = 18_000) {
    super();
    this.socket = socket;
    this.maxPayload = maxPayload;
    this.readyState = WS_OPEN;
    this.buffer = Buffer.from(initialData);
    this.fragmentOpcode = 0;
    this.fragmentChunks = [];
    this.closedEmitted = false;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.consumeFrames();
    });
    socket.on('error', (error) => this.emit('error', error));
    socket.on('close', () => this.finishClose());
    socket.on('end', () => this.finishClose());

    if (this.buffer.length) queueMicrotask(() => this.consumeFrames());
  }

  send(data) {
    if (this.readyState !== WS_OPEN) return false;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    this.sendFrame(0x1, payload);
    return true;
  }

  ping() {
    if (this.readyState === WS_OPEN) this.sendFrame(0x9, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (this.readyState >= WS_CLOSING) return;
    this.readyState = WS_CLOSING;
    const reasonBuffer = Buffer.from(String(reason).slice(0, 120), 'utf8');
    const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.sendFrame(0x8, payload, true);
    setTimeout(() => this.socket.end(), 50).unref();
  }

  terminate() {
    this.readyState = WS_CLOSED;
    this.socket.destroy();
  }

  sendFrame(opcode, payload, allowClosing = false) {
    if (!allowClosing && this.readyState !== WS_OPEN) return;
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = length;
    } else if (length <= 0xffff) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    this.socket.write(Buffer.concat([header, payload]));
  }

  consumeFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const bigLength = this.buffer.readBigUInt64BE(2);
        if (bigLength > BigInt(this.maxPayload)) return this.protocolClose(1009, 'Message too large');
        payloadLength = Number(bigLength);
        offset = 10;
      }

      if (payloadLength > this.maxPayload) return this.protocolClose(1009, 'Message too large');
      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + payloadLength) return;

      let mask;
      if (masked) {
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      this.buffer = this.buffer.subarray(offset + payloadLength);

      if (masked) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      this.handleFrame(fin, opcode, payload);
      if (this.readyState === WS_CLOSED) return;
    }
  }

  handleFrame(fin, opcode, payload) {
    if (opcode >= 0x8 && !fin) return this.protocolClose(1002, 'Fragmented control frame');
    if (opcode === 0x8) {
      if (this.readyState === WS_OPEN) {
        this.readyState = WS_CLOSING;
        this.sendFrame(0x8, payload, true);
      }
      this.socket.end();
      return;
    }
    if (opcode === 0x9) {
      this.sendFrame(0xA, payload);
      return;
    }
    if (opcode === 0xA) {
      this.emit('pong');
      return;
    }

    if (opcode === 0x0) {
      if (!this.fragmentOpcode) return this.protocolClose(1002, 'Unexpected continuation frame');
      this.fragmentChunks.push(payload);
      if (fin) {
        const complete = Buffer.concat(this.fragmentChunks);
        const originalOpcode = this.fragmentOpcode;
        this.fragmentOpcode = 0;
        this.fragmentChunks = [];
        this.deliverData(originalOpcode, complete);
      }
      return;
    }

    if (opcode !== 0x1 && opcode !== 0x2) return this.protocolClose(1002, 'Unsupported frame');
    if (!fin) {
      this.fragmentOpcode = opcode;
      this.fragmentChunks = [payload];
      return;
    }
    this.deliverData(opcode, payload);
  }

  deliverData(opcode, payload) {
    if (opcode === 0x1) this.emit('message', payload);
  }

  protocolClose(code, reason) {
    this.close(code, reason);
  }

  finishClose() {
    if (this.closedEmitted) return;
    this.closedEmitted = true;
    this.readyState = WS_CLOSED;
    this.emit('close');
  }
}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOM_SIZE = clampInt(process.env.MAX_ROOM_SIZE, 2, 12, 8);
const ROOM_TTL_MS = clampInt(process.env.ROOM_TTL_HOURS, 1, 24, 8) * 60 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const HOST_RECONNECT_GRACE_MS = 12_000;
const MAX_MESSAGE_BYTES = 18_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const clients = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'aps-watch-together', rooms: rooms.size, clients: clients.size, now: new Date().toISOString() }));
    return;
  }

  if (url.pathname.startsWith('/join/')) {
    const roomCode = normalizeCode(url.pathname.slice('/join/'.length));
    const room = rooms.get(roomCode);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.writeHead(roomCode.length === 8 ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderJoinPage(roomCode, room));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('APS Watch Together room service is online.');
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (url.pathname !== '/ws' || upgrade !== 'websocket' || typeof key !== 'string') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const ws = new SimpleWebSocket(socket, head, MAX_MESSAGE_BYTES);
  registerConnection(ws, req);
});

function registerConnection(ws, req) {
  const client = {
    id: crypto.randomUUID(),
    ws,
    name: 'Guest',
    sessionId: crypto.randomUUID(),
    roomCode: '',
    media: { audio: true, video: true },
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    rate: { windowStartedAt: Date.now(), count: 0 },
    ipHash: hashValue(req.socket.remoteAddress || 'unknown')
  };
  clients.set(client.id, client);
  send(client, { type: 'welcome', clientId: client.id, serverTime: Date.now() });

  ws.on('message', (raw) => {
    if (!allowMessage(client)) return closeWithError(client, 'Too many messages. Please reconnect.');
    if (raw.length > MAX_MESSAGE_BYTES) return closeWithError(client, 'Message too large.');
    let message;
    try { message = JSON.parse(raw.toString('utf8')); }
    catch { return sendError(client, 'Invalid message.'); }
    client.lastSeenAt = Date.now();
    handleMessage(client, message);
  });

  ws.on('pong', () => { client.lastSeenAt = Date.now(); });
  ws.on('close', () => disconnectClient(client));
  ws.on('error', () => disconnectClient(client));
}

function handleMessage(client, message) {
  if (!message || typeof message.type !== 'string') return sendError(client, 'Missing message type.');

  switch (message.type) {
    case 'hello':
      client.name = cleanName(message.displayName);
      client.sessionId = cleanSessionId(message.sessionId) || client.sessionId;
      send(client, { type: 'hello-ack', clientId: client.id });
      break;
    case 'create-room':
      createRoom(client);
      break;
    case 'join-room':
      joinRoom(client, message.roomCode);
      break;
    case 'leave-room':
      leaveRoom(client, true);
      break;
    case 'signal':
      relaySignal(client, message);
      break;
    case 'playback':
      relayPlayback(client, message);
      break;
    case 'control-policy':
      updatePolicy(client, message);
      break;
    case 'room-lock':
      updateRoomLock(client, message);
      break;
    case 'chat':
      relayChat(client, message);
      break;
    case 'reaction':
      relayReaction(client, message);
      break;
    case 'media-state':
      relayMediaState(client, message);
      break;
    case 'screen-share-state':
      relayScreenShareState(client, message);
      break;
    case 'ping':
      send(client, { type: 'pong', at: message.at, serverTime: Date.now() });
      break;
    default:
      sendError(client, 'Unsupported message type.');
  }
}

function createRoom(client) {
  leaveRoom(client, true);
  const roomCode = uniqueRoomCode();
  const room = {
    code: roomCode,
    hostId: client.id,
    hostSessionId: client.sessionId,
    hostTransferDueAt: 0,
    locked: false,
    everyoneCanControl: false,
    clients: new Map(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    emptyAt: null,
    lastPlayback: null,
    screenShare: inactiveScreenShare()
  };
  rooms.set(roomCode, room);
  room.clients.set(client.id, client);
  client.roomCode = roomCode;
  send(client, roomPayload('room-created', room, client));
}

function joinRoom(client, suppliedCode) {
  const roomCode = normalizeCode(suppliedCode);
  const room = rooms.get(roomCode);
  if (!room) return sendError(client, 'Room not found. Check the code with your host.');
  const isReturningHost = room.hostSessionId === client.sessionId;
  if (room.locked && !isReturningHost) return sendError(client, 'This room is locked by the host.');
  if (room.clients.size >= MAX_ROOM_SIZE && !room.clients.has(client.id)) return sendError(client, 'This room is full.');

  leaveRoom(client, true);
  room.clients.set(client.id, client);
  room.emptyAt = null;
  room.lastActivityAt = Date.now();
  client.roomCode = roomCode;

  const reclaimedHost = isReturningHost;
  if (reclaimedHost) {
    room.hostId = client.id;
    room.hostTransferDueAt = 0;
  }

  send(client, roomPayload('room-joined', room, client));
  broadcast(room, { type: 'participant-joined', participant: publicParticipant(client) }, client.id);
  if (reclaimedHost) broadcast(room, { type: 'host-changed', hostId: room.hostId, hostName: client.name });
  if (room.lastPlayback) send(client, { type: 'playback', fromId: room.hostId, command: room.lastPlayback });
}

function leaveRoom(client, graceful = true) {
  const room = getClientRoom(client);
  if (!room) {
    client.roomCode = '';
    return;
  }
  const name = client.name;
  const wasHost = room.hostId === client.id;
  room.clients.delete(client.id);
  client.roomCode = '';
  room.lastActivityAt = Date.now();

  if (room.screenShare?.presenterId === client.id) {
    room.screenShare = inactiveScreenShare();
    broadcast(room, { type: 'screen-share-state', screenShare: room.screenShare });
  }

  if (wasHost && room.clients.size > 0) {
    if (graceful) {
      transferHost(room);
    } else {
      room.hostId = '';
      room.hostTransferDueAt = Date.now() + HOST_RECONNECT_GRACE_MS;
      broadcast(room, { type: 'host-changed', hostId: '', hostName: '' });
    }
  }

  broadcast(room, {
    type: 'participant-left',
    participantId: client.id,
    name,
    hostId: room.hostId,
    reconnecting: wasHost && !graceful && room.clients.size > 0
  });
  if (room.clients.size === 0) room.emptyAt = Date.now();
}

function transferHost(room) {
  const host = [...room.clients.values()].sort((a, b) => a.connectedAt - b.connectedAt)[0];
  if (!host) {
    room.hostId = '';
    room.hostTransferDueAt = 0;
    return;
  }
  room.hostId = host.id;
  room.hostSessionId = host.sessionId;
  room.hostTransferDueAt = 0;
  broadcast(room, { type: 'host-changed', hostId: host.id, hostName: host.name });
}

function relaySignal(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room first.');
  const target = room.clients.get(String(message.targetId || ''));
  if (!target) return;
  if (!message.signal || typeof message.signal !== 'object') return;
  send(target, { type: 'signal', fromId: client.id, signal: message.signal });
}

function relayPlayback(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room first.');
  if (client.id !== room.hostId && !room.everyoneCanControl) return sendError(client, 'Only the host can control playback.');
  const command = sanitizePlayback(message.command);
  if (!command) return sendError(client, 'Invalid playback command.');
  room.lastActivityAt = Date.now();
  room.lastPlayback = command;
  broadcast(room, { type: 'playback', fromId: client.id, command }, client.id);
}

function updatePolicy(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room first.');
  if (client.id !== room.hostId) return sendError(client, 'Only the host can change room controls.');
  room.everyoneCanControl = Boolean(message.everyoneCanControl);
  room.lastActivityAt = Date.now();
  broadcast(room, { type: 'control-policy', everyoneCanControl: room.everyoneCanControl });
}

function updateRoomLock(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room first.');
  if (client.id !== room.hostId) return sendError(client, 'Only the host can lock the room.');
  room.locked = Boolean(message.locked);
  room.lastActivityAt = Date.now();
  broadcast(room, { type: 'room-lock', locked: room.locked });
}

function relayChat(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room first.');
  const text = String(message.text || '').trim().slice(0, 500);
  if (!text) return;
  const chatMessage = { id: crypto.randomUUID(), senderId: client.id, senderName: client.name, text, sentAt: Date.now() };
  broadcast(room, { type: 'chat', message: chatMessage });
}

function relayReaction(client, message) {
  const room = getClientRoom(client);
  if (!room) return;
  const allowed = new Set(['😂', '❤️', '😱', '👏', '🍿']);
  if (!allowed.has(message.emoji)) return;
  broadcast(room, { type: 'reaction', senderId: client.id, emoji: message.emoji }, client.id);
}

function relayMediaState(client, message) {
  const room = getClientRoom(client);
  if (!room) return;
  client.media = { audio: message.media?.audio !== false, video: message.media?.video !== false };
  broadcast(room, { type: 'media-state', participantId: client.id, media: client.media });
}

function relayScreenShareState(client, message) {
  const room = getClientRoom(client);
  if (!room) return sendError(client, 'Join a room before sharing your screen.');
  const active = Boolean(message.active);
  if (active) {
    if (room.screenShare?.active && room.screenShare.presenterId !== client.id) {
      const presenter = room.clients.get(room.screenShare.presenterId);
      return sendError(client, `${presenter?.name || 'Another participant'} is already presenting a screen.`);
    }
    const streamId = cleanStreamId(message.streamId);
    if (!streamId) return sendError(client, 'The screen-share stream is invalid.');
    room.screenShare = {
      active: true,
      presenterId: client.id,
      presenterName: client.name,
      streamId,
      startedAt: Date.now()
    };
  } else {
    if (room.screenShare?.active && room.screenShare.presenterId !== client.id && room.hostId !== client.id) {
      return sendError(client, 'Only the presenter or host can stop screen sharing.');
    }
    room.screenShare = inactiveScreenShare();
  }
  room.lastActivityAt = Date.now();
  broadcast(room, { type: 'screen-share-state', screenShare: room.screenShare });
}

function disconnectClient(client) {
  if (!clients.has(client.id)) return;
  leaveRoom(client, false);
  clients.delete(client.id);
}

function roomPayload(type, room, client) {
  return {
    type,
    roomCode: room.code,
    selfId: client.id,
    hostId: room.hostId,
    locked: room.locked,
    everyoneCanControl: room.everyoneCanControl,
    screenShare: room.screenShare || inactiveScreenShare(),
    participants: [...room.clients.values()].map(publicParticipant),
    serverTime: Date.now()
  };
}

function publicParticipant(client) {
  return { id: client.id, name: client.name, media: client.media, joinedAt: client.connectedAt };
}

function sanitizePlayback(input) {
  if (!input || typeof input !== 'object') return null;
  const allowedKinds = new Set(['play', 'pause', 'seek', 'skip', 'sync', 'set-rate']);
  const kind = String(input.kind || '');
  if (!allowedKinds.has(kind)) return null;
  const command = {
    kind,
    sentAt: finiteNumber(input.sentAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    commandId: String(input.commandId || crypto.randomUUID()).slice(0, 100),
    time: finiteNumber(input.time, 0, 0, 60 * 60 * 24),
    paused: Boolean(input.paused),
    rate: finiteNumber(input.rate, 1, 0.25, 4),
    title: String(input.title || '').slice(0, 180),
    service: String(input.service || '').slice(0, 30)
  };
  if (kind === 'skip') command.amount = finiteNumber(input.amount, 0, -600, 600);
  return command;
}

function send(client, payload) {
  if (client.ws.readyState === WS_OPEN) client.ws.send(JSON.stringify(payload));
}
function broadcast(room, payload, excludeId = '') {
  for (const client of room.clients.values()) if (client.id !== excludeId) send(client, payload);
}
function sendError(client, message) { send(client, { type: 'error', message }); }
function closeWithError(client, message) { sendError(client, message); client.ws.close(1008, message.slice(0, 120)); }
function getClientRoom(client) { return client.roomCode ? rooms.get(client.roomCode) : null; }

function allowMessage(client) {
  const now = Date.now();
  if (now - client.rate.windowStartedAt > 10_000) client.rate = { windowStartedAt: now, count: 0 };
  client.rate.count += 1;
  return client.rate.count <= 150;
}

function inactiveScreenShare() {
  return { active: false, presenterId: '', presenterName: '', streamId: '', startedAt: 0 };
}

function cleanStreamId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_+./:-]/g, '').slice(0, 160);
  return clean.length >= 4 ? clean : '';
}

function formatRoomCode(value) {
  const code = normalizeCode(value);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function renderJoinPage(roomCode, room) {
  const valid = roomCode.length === 8;
  const formatted = valid ? formatRoomCode(roomCode) : 'INVALID';
  const live = Boolean(room);
  const status = live ? `${room.clients.size} participant${room.clients.size === 1 ? '' : 's'} currently in the room` : 'The host may not have opened this room yet';
  const buttonLabel = valid ? 'Open APS and join room' : 'Invalid invitation';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Join APS Watch Together</title>
<style>:root{color-scheme:dark;--bg:#070b14;--card:#111827;--line:rgba(148,163,184,.18);--text:#f8fafc;--muted:#94a3b8;--purple:#8b5cf6;--cyan:#22d3ee;--green:#34d399}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 15% 0,rgba(139,92,246,.25),transparent 34%),radial-gradient(circle at 95% 10%,rgba(34,211,238,.13),transparent 30%),var(--bg);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}main{width:min(520px,100%);padding:31px;border:1px solid var(--line);border-radius:28px;background:rgba(17,24,39,.92);box-shadow:0 26px 80px rgba(0,0,0,.38)}.brand{display:flex;align-items:center;gap:12px}.mark{width:46px;height:46px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(135deg,var(--purple),#0891b2);font-size:21px;box-shadow:0 12px 30px rgba(139,92,246,.3)}.brand strong{display:block}.brand small{display:block;margin-top:3px;color:var(--muted)}h1{margin:28px 0 9px;font-size:33px;line-height:1.08;letter-spacing:-.045em}h1 span{background:linear-gradient(90deg,#c4b5fd,#67e8f9);color:transparent;background-clip:text;-webkit-background-clip:text}p{color:#cbd5e1;line-height:1.55}.code{margin:20px 0;padding:17px;border:1px solid rgba(34,211,238,.22);border-radius:17px;background:rgba(34,211,238,.06);text-align:center}.code small{display:block;color:var(--muted);font-size:10px;letter-spacing:.1em}.code strong{display:block;margin-top:5px;font-size:26px;letter-spacing:.14em}.status{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:8px;color:${live ? '#a7f3d0' : '#fde68a'};font-size:11px}.status i{width:7px;height:7px;border-radius:50%;background:currentColor}button{width:100%;height:49px;border:0;border-radius:14px;background:linear-gradient(135deg,var(--purple),#0891b2);color:white;font:inherit;font-weight:800;cursor:${valid ? 'pointer' : 'not-allowed'};box-shadow:0 14px 32px rgba(139,92,246,.25)}button:disabled{opacity:.45}.help{margin:14px 0 0;text-align:center;color:var(--muted);font-size:10px;line-height:1.5}.privacy{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);color:#718096;font-size:10px}</style></head>
<body><main><div class="brand"><div class="mark">▶</div><div><strong>APS Watch Together</strong><small>Private synchronized movie night</small></div></div><h1>You’re invited to<br><span>watch together.</span></h1><p>Open the APS extension and join the private room. You can also enter the room code manually.</p><div class="code"><small>ROOM CODE</small><strong>${formatted}</strong><div class="status"><i></i>${status}</div></div><button type="button" data-aps-open-room ${valid ? '' : 'disabled'}>${buttonLabel}</button><p class="help" data-aps-extension-status>If nothing opens, install APS Watch Together in Chrome, refresh this page, or enter the code manually.</p><p class="privacy">Each participant watches through their own OTT account. APS synchronizes playback and peer-to-peer calling; it does not retransmit the movie.</p></main></body></html>`;
}

function cleanSessionId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean.length >= 12 ? clean : '';
}

function cleanName(value) {
  const clean = String(value || 'Guest').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return clean.length >= 2 ? clean : 'Guest';
}
function normalizeCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01IO]/g, '').slice(0, 8); }
function uniqueRoomCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate room code.');
}
function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
function hashValue(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16); }

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const client of clients.values()) {
    if (now - client.lastSeenAt > 75_000) client.ws.terminate();
    else if (client.ws.readyState === WS_OPEN) client.ws.ping();
  }
  for (const [code, room] of rooms) {
    if (!room.hostId && room.hostTransferDueAt && now >= room.hostTransferDueAt && room.clients.size > 0) transferHost(room);
    const expired = now - room.createdAt > ROOM_TTL_MS;
    const emptyExpired = room.emptyAt && now - room.emptyAt > EMPTY_ROOM_TTL_MS;
    if (expired || emptyExpired) rooms.delete(code);
  }
}, 5_000);
heartbeat.unref();

server.listen(PORT, HOST, () => {
  console.log(`APS Watch Together room service listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  clearInterval(heartbeat);
  for (const client of clients.values()) client.ws.close(1001, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

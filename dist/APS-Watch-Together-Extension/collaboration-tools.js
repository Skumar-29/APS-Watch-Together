export function normalizeInviteRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01IO]/g, '').slice(0, 8);
}

export function formatInviteRoomCode(value) {
  const code = normalizeInviteRoomCode(value);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function inviteOriginFromServerUrl(serverUrl) {
  const parsed = new URL(String(serverUrl || ''));
  if (!['ws:', 'wss:', 'http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported room server URL.');
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
  return parsed.origin;
}

export function buildRoomInviteUrl(serverUrl, roomCode) {
  const code = normalizeInviteRoomCode(roomCode);
  if (code.length !== 8) throw new Error('A valid room code is required.');
  return `${inviteOriginFromServerUrl(serverUrl)}/join/${formatInviteRoomCode(code)}`;
}

export function isScreenShareStream(peerId, streamId, screenShare) {
  return Boolean(
    screenShare?.active &&
    screenShare.presenterId === peerId &&
    screenShare.streamId &&
    screenShare.streamId === streamId
  );
}

export function inactiveScreenShare() {
  return { active: false, presenterId: '', presenterName: '', streamId: '' };
}

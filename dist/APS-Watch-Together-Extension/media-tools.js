export async function enumerateMediaDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audioinput: [], videoinput: [], audiooutput: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const groups = { audioinput: [], videoinput: [], audiooutput: [] };
  for (const device of devices) {
    if (groups[device.kind]) groups[device.kind].push(device);
  }
  return groups;
}

export function friendlyDeviceLabel(device, index, fallback) {
  const label = String(device?.label || '').trim();
  if (label) return label;
  return `${fallback} ${index + 1}`;
}

export function withExactDevice(baseConstraints, deviceId) {
  const constraints = { ...(baseConstraints || {}) };
  if (deviceId && deviceId !== 'default') constraints.deviceId = { exact: deviceId };
  return constraints;
}

export function findSenderForKind(pc, kind) {
  return pc.getSenders().find((sender) => sender.track?.kind === kind)
    || pc.getTransceivers().find((transceiver) => transceiver.receiver?.track?.kind === kind)?.sender
    || null;
}

export async function publishTrackToPeer(pc, kind, track, stream) {
  let sender = findSenderForKind(pc, kind);
  let changedDirection = false;
  if (sender) {
    const transceiver = pc.getTransceivers().find((item) => item.sender === sender);
    if (transceiver && ['recvonly', 'inactive'].includes(transceiver.direction)) {
      transceiver.direction = 'sendrecv';
      changedDirection = true;
    }
    await sender.replaceTrack(track);
    if (typeof sender.setStreams === 'function') sender.setStreams(stream);
    return { sender, needsNegotiation: changedDirection };
  }
  sender = pc.addTrack(track, stream);
  return { sender, needsNegotiation: true };
}

export async function unpublishTrackFromPeer(pc, kind) {
  const sender = findSenderForKind(pc, kind);
  if (!sender) return { needsNegotiation: false };
  await sender.replaceTrack(null);
  const transceiver = pc.getTransceivers().find((item) => item.sender === sender);
  if (transceiver && transceiver.direction === 'sendrecv') {
    transceiver.direction = 'recvonly';
    return { needsNegotiation: true };
  }
  return { needsNegotiation: false };
}

export async function setAudioOutputForElements(root, deviceId = '') {
  const mediaElements = [...root.querySelectorAll('audio, video')].filter((element) => !element.muted);
  let applied = 0;
  let unsupported = false;
  for (const element of mediaElements) {
    if (typeof element.setSinkId !== 'function') {
      unsupported = true;
      continue;
    }
    try {
      await element.setSinkId(deviceId);
      applied += 1;
    } catch (error) {
      console.warn('APS audio output selection failed', error);
    }
  }
  return { applied, unsupported };
}

export function deriveMediaMode(intent) {
  if (intent.audio && intent.video) return 'av';
  if (intent.audio) return 'audio';
  if (intent.video) return 'video';
  return 'watch';
}

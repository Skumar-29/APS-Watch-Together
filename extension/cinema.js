import { enumerateMediaDevices, friendlyDeviceLabel, withExactDevice, publishTrackToPeer, setAudioOutputForElements, deriveMediaMode } from './media-tools.js';
import { isScreenShareStream, inactiveScreenShare } from './collaboration-tools.js';
const $ = (selector, root = document) => root.querySelector(selector);

const ICONS = {
  mic: '<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2Z"/>',
  micOff: '<path d="m4.3 3 16.7 16.7-1.3 1.3-4.1-4.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5 12h2a5 5 0 0 0 7.1 4.5l-1.5-1.5H12a3 3 0 0 1-3-3V7.4L3 4.3 4.3 3ZM12 3a3 3 0 0 1 3 3v5.2l-2-2V6a1 1 0 0 0-1.7-.7L9.9 3.9A3 3 0 0 1 12 3Zm5 9h2c0 1-.2 2-.6 2.9l-1.6-1.6c.1-.4.2-.8.2-1.3Z"/>',
  camera: '<path d="M4 5h11a2 2 0 0 1 2 2v2.2l4-2.5v10.6l-4-2.5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
  cameraOff: '<path d="m3.3 2 18.7 18.7-1.3 1.3-3.8-3.8A2 2 0 0 1 15 19H4a2 2 0 0 1-2-2V7c0-.5.2-1 .5-1.3L2 3.3 3.3 2ZM21 6.7v10.6l-4-2.5v.4L9.8 8H15a2 2 0 0 1 2 2v-.8l4-2.5ZM5.8 5 17 16.2V17H4V7c0-.8.7-1.5 1.5-1.5l.3-.5Z"/>'
};

const MEDIA_MODES = {
  av: { label: 'LIVE', audio: true, video: true },
  audio: { label: 'AUDIO ONLY', audio: true, video: false },
  video: { label: 'VIDEO ONLY', audio: false, video: true },
  watch: { label: 'WATCH ONLY', audio: false, video: false }
};

const app = {
  roomCode: '',
  settings: {},
  profile: {},
  socket: null,
  selfId: '',
  hostId: '',
  isHost: false,
  sharedControls: false,
  participants: new Map(),
  peers: new Map(),
  remoteStreams: new Map(),
  localStream: null,
  mediaMode: 'av',
  mediaIntent: { audio: true, video: true },
  mediaAvailable: { audio: false, video: false },
  mediaEnabled: { audio: true, video: true },
  devicePreferences: { audioinput: '', videoinput: '', audiooutput: '' },
  devices: { audioinput: [], videoinput: [], audiooutput: [] },
  deviceChangeTimer: null,
  mediaOperation: null,
  pendingMediaActivation: '',
  negotiationTimers: new Map(),
  mediaWarnings: [],
  viewPreferences: { showSelf: true, showFriends: true },
  player: null,
  heartbeat: null,
  poller: null,
  reconnectTimer: null,
  intentionallyLeaving: false,
  closingForRestore: false,
  pipWindow: null,
  activeTabId: null,
  screenShare: inactiveScreenShare(),
  localScreenStream: null,
  remoteScreenStreams: new Map(),
  peerStreamRegistry: new Map(),
  screenSenders: new Map(),
  screenViewHidden: false,
  screenOperation: false,
  stoppingScreenShare: false
};

const elements = {
  connectionText: $('#connectionText'),
  roleBadge: $('#roleBadge'),
  cameraStage: $('#cameraStage'),
  selfCard: $('#selfCard'),
  localVideo: $('#localVideo'),
  videoFallback: $('#videoFallback'),
  initial: $('#initial'),
  displayName: $('#displayName'),
  roomCode: $('#roomCode'),
  liveIndicator: $('#liveIndicator'),
  remoteGrid: $('#remoteGrid'), cinemaScreenStage: $('#cinemaScreenStage'), cinemaScreenVideo: $('#cinemaScreenVideo'), cinemaScreenPresenter: $('#cinemaScreenPresenter'), cinemaScreenStatus: $('#cinemaScreenStatus'), cinemaScreenToggleBtn: $('#cinemaScreenToggleBtn'), cinemaScreenHiddenBar: $('#cinemaScreenHiddenBar'), cinemaScreenHiddenText: $('#cinemaScreenHiddenText'),
  viewsHidden: $('#viewsHidden'),
  selfViewBtn: $('#selfViewBtn'),
  friendsViewBtn: $('#friendsViewBtn'),
  participantText: $('#participantText'),
  syncText: $('#syncText'),
  micBtn: $('#micBtn'),
  cameraBtn: $('#cameraBtn'),
  shareScreenBtn: $('#shareScreenBtn'),
  devicesBtn: $('#devicesBtn'), cinemaDevicePanel: $('#cinemaDevicePanel'), closeDevicesBtn: $('#closeDevicesBtn'), cinemaCameraSelect: $('#cinemaCameraSelect'), cinemaMicSelect: $('#cinemaMicSelect'), cinemaSpeakerSelect: $('#cinemaSpeakerSelect'), cinemaSpeakerField: $('#cinemaSpeakerField'), cinemaRefreshDevicesBtn: $('#cinemaRefreshDevicesBtn'), cinemaApplyDevicesBtn: $('#cinemaApplyDevicesBtn'), cinemaDeviceStatus: $('#cinemaDeviceStatus'),
  floatBtn: $('#floatBtn'),
  restoreBtn: $('#restoreBtn'),
  leaveBtn: $('#leaveBtn'),
  hint: $('#hint'),
  remoteAudio: $('#remoteAudio')
};

async function init() {
  const params = new URLSearchParams(location.search);
  const stored = await chrome.storage.local.get([
    'apsSettings',
    'apsProfile',
    'apsActiveRoom',
    'apsCinemaPreferences',
    'apsDevicePreferences',
    'apsMediaIntent',
    'apsScreenViewPreferences'
  ]);
  app.settings = stored.apsSettings || {};
  app.profile = stored.apsProfile || { displayName: 'Guest', avatarSeed: crypto.randomUUID() };
  app.roomCode = normalizeCode(params.get('room') || stored.apsActiveRoom?.roomCode || '');
  app.devicePreferences = { ...app.devicePreferences, ...(stored.apsDevicePreferences || {}) };
  app.mediaIntent = stored.apsMediaIntent || mediaIntentForMode(stored.apsActiveRoom?.mediaMode || 'av');
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  app.screenViewHidden = Boolean(stored.apsScreenViewPreferences?.hidden);
  app.viewPreferences = {
    showSelf: stored.apsCinemaPreferences?.showSelf !== false,
    showFriends: stored.apsCinemaPreferences?.showFriends !== false
  };

  elements.displayName.textContent = app.profile.displayName || 'You';
  elements.initial.textContent = initialOf(app.profile.displayName || 'You');
  elements.roomCode.textContent = formatRoomCode(app.roomCode);
  bindEvents();
  setupDeviceMonitoring();
  await refreshCinemaDevices({ quiet: true });
  applyViewPreferences(false);
  renderRemoteViews();

  if (!app.roomCode) return fail('No active room was found. Return to the full APS panel.');
  try {
    await ensureLocalMedia(app.mediaMode);
    connectSocket();
    app.poller = setInterval(() => pollPlayer(false), 1400);
    await pollPlayer(true);
  } catch (error) {
    fail(error?.message || 'Camera and microphone could not start.');
  }
}

function bindEvents() {
  elements.micBtn.addEventListener('click', toggleMicrophone);
  elements.cameraBtn.addEventListener('click', toggleCamera);
  elements.shareScreenBtn.addEventListener('click', toggleCinemaScreenShare);
  elements.cinemaScreenToggleBtn.addEventListener('click', toggleCinemaScreenView);
  elements.cinemaScreenHiddenBar.addEventListener('click', toggleCinemaScreenView);
  elements.devicesBtn.addEventListener('click', toggleCinemaDevicePanel);
  elements.closeDevicesBtn.addEventListener('click', () => toggleCinemaDevicePanel(false));
  elements.cinemaRefreshDevicesBtn.addEventListener('click', () => refreshCinemaDevices({ announce: true }));
  elements.cinemaApplyDevicesBtn.addEventListener('click', applyCinemaDevices);
  elements.cinemaSpeakerSelect.addEventListener('change', applyCinemaAudioOutput);
  elements.selfViewBtn.addEventListener('click', () => setViewPreference('showSelf', !app.viewPreferences.showSelf));
  elements.friendsViewBtn.addEventListener('click', () => setViewPreference('showFriends', !app.viewPreferences.showFriends));
  elements.floatBtn.addEventListener('click', openFloatingCallView);
  elements.restoreBtn.addEventListener('click', restoreFullControls);
  elements.leaveBtn.addEventListener('click', leaveRoom);

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'APS_MEDIA_PERMISSION_GRANTED' && app.pendingMediaActivation) {
      const kind = app.pendingMediaActivation;
      app.pendingMediaActivation = '';
      if (message.cancelled || message.mediaMode === 'watch') {
        elements.hint.textContent = `${kind === 'video' ? 'Camera' : 'Microphone'} remains off. You can try again anytime.`;
      } else {
        activateCinemaMedia(kind).catch((error) => { elements.hint.textContent = error?.message || 'Could not start the device.'; });
      }
      return;
    }
    if (message?.type === 'APS_PANEL_RESTORED' && message.roomCode === app.roomCode) {
      finishRestoreHandoff();
      return;
    }
    if (sender?.tab?.id) app.activeTabId = sender.tab.id;
    if (message?.type === 'APS_PLAYER_STATUS') handlePlayerStatus(message);
    if (message?.type === 'APS_PLAYER_EVENT') handleLocalPlayerEvent(message);
  });

  window.addEventListener('beforeunload', () => {
    if (!app.closingForRestore && !app.intentionallyLeaving && app.socket?.readyState === WebSocket.OPEN) {
      sendSocket({ type: 'leave-room' });
      chrome.storage.local.remove(['apsActiveRoom', 'apsRestoreRoom']);
    }
    stopCinemaScreenShare(false);
    stopAllMedia();
    navigator.mediaDevices?.removeEventListener?.('devicechange', handleCinemaDeviceChange);
  });
}

function mediaIntentForMode(mode) {
  const config = MEDIA_MODES[MEDIA_MODES[mode] ? mode : 'av'];
  return { audio: config.audio, video: config.video };
}

function setupDeviceMonitoring() {
  navigator.mediaDevices?.addEventListener?.('devicechange', handleCinemaDeviceChange);
  elements.cinemaSpeakerField.hidden = typeof HTMLMediaElement.prototype.setSinkId !== 'function';
}

function handleCinemaDeviceChange() {
  clearTimeout(app.deviceChangeTimer);
  app.deviceChangeTimer = setTimeout(async () => {
    const before = new Set(Object.values(app.devices).flat().map((device) => `${device.kind}:${device.deviceId}`));
    await refreshCinemaDevices({ quiet: true });
    const after = new Set(Object.values(app.devices).flat().map((device) => `${device.kind}:${device.deviceId}`));
    const added = [...after].some((id) => !before.has(id));
    const removed = [...before].some((id) => !after.has(id));
    if (added) {
      elements.hint.textContent = 'New call device detected. APS is reconnecting it when enabled.';
      if (app.mediaIntent.video && !app.mediaAvailable.video && app.devices.videoinput.length) await activateCinemaMedia('video', { quiet: true }).catch(() => undefined);
      if (app.mediaIntent.audio && !app.mediaAvailable.audio && app.devices.audioinput.length) await activateCinemaMedia('audio', { quiet: true }).catch(() => undefined);
    } else if (removed) elements.hint.textContent = 'A call device was disconnected. The room is still active.';
  }, 350);
}

async function refreshCinemaDevices({ quiet = false, announce = false } = {}) {
  try {
    app.devices = await enumerateMediaDevices();
    populateCinemaSelect(elements.cinemaCameraSelect, app.devices.videoinput, app.devicePreferences.videoinput, 'Automatic camera', 'Camera');
    populateCinemaSelect(elements.cinemaMicSelect, app.devices.audioinput, app.devicePreferences.audioinput, 'Automatic microphone', 'Microphone');
    populateCinemaSelect(elements.cinemaSpeakerSelect, app.devices.audiooutput, app.devicePreferences.audiooutput, 'System default', 'Speaker');
    if (announce) elements.hint.textContent = 'Call devices refreshed.';
    if (!quiet) elements.cinemaDeviceStatus.textContent = `${app.devices.videoinput.length || 'No'} camera(s) · ${app.devices.audioinput.length || 'No'} microphone(s)`;
  } catch (error) {
    if (!quiet) elements.cinemaDeviceStatus.textContent = error?.message || 'Could not read call devices.';
  }
}

function populateCinemaSelect(select, devices, selectedId, automaticLabel, fallback) {
  select.replaceChildren();
  const automatic = document.createElement('option');
  automatic.value = '';
  automatic.textContent = automaticLabel;
  select.appendChild(automatic);
  devices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = friendlyDeviceLabel(device, index, fallback);
    select.appendChild(option);
  });
  select.value = devices.some((device) => device.deviceId === selectedId) ? selectedId : '';
}

async function toggleCinemaDevicePanel(force) {
  const show = typeof force === 'boolean' ? force : elements.cinemaDevicePanel.hidden;
  elements.cinemaDevicePanel.hidden = !show;
  elements.devicesBtn.classList.toggle('active', show);
  if (show) await refreshCinemaDevices({ quiet: false });
}

function rememberCinemaDevices() {
  app.devicePreferences = {
    videoinput: elements.cinemaCameraSelect.value || '',
    audioinput: elements.cinemaMicSelect.value || '',
    audiooutput: elements.cinemaSpeakerSelect.value || ''
  };
  chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
}

async function applyCinemaDevices() {
  rememberCinemaDevices();
  elements.cinemaApplyDevicesBtn.disabled = true;
  elements.cinemaApplyDevicesBtn.textContent = 'Applying…';
  try {
    if (app.mediaIntent.video || app.mediaAvailable.video) {
      const applied = await activateCinemaMedia('video', { preserveState: true, quiet: true, force: true });
      if (applied === false) { elements.cinemaDeviceStatus.textContent = 'Complete the camera permission tab, then return here.'; return; }
    }
    if (app.mediaIntent.audio || app.mediaAvailable.audio) {
      const applied = await activateCinemaMedia('audio', { preserveState: true, quiet: true, force: true });
      if (applied === false) { elements.cinemaDeviceStatus.textContent = 'Complete the microphone permission tab, then return here.'; return; }
    }
    await applyCinemaAudioOutput();
    elements.cinemaDeviceStatus.textContent = 'Devices updated without leaving the room.';
  } catch (error) {
    elements.cinemaDeviceStatus.textContent = error?.message || 'Could not update call devices.';
  } finally {
    elements.cinemaApplyDevicesBtn.disabled = false;
    elements.cinemaApplyDevicesBtn.textContent = 'Apply';
  }
}

async function applyCinemaAudioOutput() {
  app.devicePreferences.audiooutput = elements.cinemaSpeakerSelect.value || '';
  await chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
  await setAudioOutputForElements(document, app.devicePreferences.audiooutput);
}

function cinemaVideoConstraints(deviceId = app.devicePreferences.videoinput) {
  const quality = app.settings.videoQuality || 'hd';
  const base = quality === 'fullhd'
    ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }
    : quality === 'sd'
      ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };
  return withExactDevice(base, deviceId);
}

function cinemaAudioConstraints(deviceId = app.devicePreferences.audioinput) {
  return withExactDevice({
    echoCancellation: app.settings.echoCancellation !== false,
    noiseSuppression: app.settings.noiseSuppression !== false,
    autoGainControl: app.settings.autoGainControl !== false,
    channelCount: 1
  }, deviceId);
}

async function requestCinemaMediaKind(kind, deviceId) {
  const selected = deviceId ?? (kind === 'video' ? app.devicePreferences.videoinput : app.devicePreferences.audioinput);
  try {
    return await navigator.mediaDevices.getUserMedia(kind === 'video'
      ? { video: cinemaVideoConstraints(selected), audio: false }
      : { video: false, audio: cinemaAudioConstraints(selected) });
  } catch (error) {
    if (selected && ['NotFoundError', 'OverconstrainedError'].includes(error?.name)) {
      if (kind === 'video') app.devicePreferences.videoinput = '';
      else app.devicePreferences.audioinput = '';
      await chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
      return navigator.mediaDevices.getUserMedia(kind === 'video'
        ? { video: cinemaVideoConstraints(''), audio: false }
        : { video: false, audio: cinemaAudioConstraints('') });
    }
    throw error;
  }
}

function bindCinemaTrackLifecycle(kind, track) {
  track.addEventListener('ended', () => {
    const current = kind === 'audio' ? app.localStream?.getAudioTracks()[0] : app.localStream?.getVideoTracks()[0];
    if (current?.id !== track.id) return;
    app.localStream?.removeTrack(track);
    app.mediaAvailable[kind] = false;
    app.mediaEnabled[kind] = false;
    updateMediaState();
    elements.hint.textContent = `${kind === 'video' ? 'Camera' : 'Microphone'} disconnected. Connect another and press the ${kind === 'video' ? 'Camera' : 'Mic'} button.`;
  }, { once: true });
}

async function ensureLocalMedia(mode = app.mediaMode) {
  const requested = MEDIA_MODES[mode] || MEDIA_MODES.av;
  app.mediaIntent = { audio: requested.audio, video: requested.video };
  const combined = new MediaStream();
  app.mediaWarnings = [];

  if (navigator.mediaDevices?.getUserMedia) {
    for (const kind of ['video', 'audio']) {
      if (!requested[kind]) continue;
      try {
        const partial = await requestCinemaMediaKind(kind);
        for (const track of partial.getTracks()) {
          combined.addTrack(track);
          bindCinemaTrackLifecycle(kind, track);
        }
      } catch (error) {
        app.mediaWarnings.push(`${kind === 'video' ? 'Camera' : 'Microphone'} unavailable.`);
      }
    }
  }

  app.localStream = combined;
  app.mediaAvailable = {
    audio: combined.getAudioTracks().some((track) => track.readyState === 'live'),
    video: combined.getVideoTracks().some((track) => track.readyState === 'live')
  };
  app.mediaEnabled = {
    audio: app.mediaAvailable.audio && app.mediaIntent.audio,
    video: app.mediaAvailable.video && app.mediaIntent.video
  };
  elements.localVideo.srcObject = combined;
  if (app.mediaAvailable.video) elements.localVideo.play().catch(() => undefined);
  updateMediaUI();
  await refreshCinemaDevices({ quiet: true });
}

async function openCinemaPermissionTab(kind) {
  app.pendingMediaActivation = kind;
  const url = new URL(chrome.runtime.getURL('request-permissions.html'));
  url.searchParams.set('mode', kind === 'audio' ? 'audio' : 'video');
  url.searchParams.set('purpose', 'activate');
  await chrome.tabs.create({ url: url.href, active: true });
  elements.hint.textContent = `Allow the ${kind === 'video' ? 'camera' : 'microphone'} in the permission tab, then return here.`;
}

async function activateCinemaMedia(kind, { preserveState = false, quiet = false, force = false } = {}) {
  if (app.mediaOperation && !force) return;
  app.mediaOperation = kind;
  const button = kind === 'audio' ? elements.micBtn : elements.cameraBtn;
  button.classList.add('busy');
  const desiredEnabled = preserveState ? (app.mediaAvailable[kind] ? app.mediaEnabled[kind] : app.mediaIntent[kind]) : true;
  const desiredIntent = preserveState ? app.mediaIntent[kind] : true;
  app.mediaIntent[kind] = desiredIntent;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  try {
    const partial = await requestCinemaMediaKind(kind);
    const track = kind === 'audio' ? partial.getAudioTracks()[0] : partial.getVideoTracks()[0];
    if (!track) throw new Error(`No ${kind === 'video' ? 'camera' : 'microphone'} was found.`);
    await replaceCinemaTrack(kind, track, desiredEnabled);
    partial.getTracks().filter((item) => item.id !== track.id).forEach((item) => item.stop());
    if (!quiet) elements.hint.textContent = `${kind === 'video' ? 'Camera' : 'Microphone'} is now on.`;
    await refreshCinemaDevices({ quiet: true });
    return true;
  } catch (error) {
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
      await openCinemaPermissionTab(kind);
      return false;
    }
    throw error;
  } finally {
    app.mediaOperation = null;
    button.classList.remove('busy');
    updateMediaUI();
  }
}

async function replaceCinemaTrack(kind, newTrack, enabled = true) {
  if (!app.localStream) app.localStream = new MediaStream();
  const oldTracks = kind === 'audio' ? app.localStream.getAudioTracks() : app.localStream.getVideoTracks();
  for (const oldTrack of oldTracks) app.localStream.removeTrack(oldTrack);
  app.localStream.addTrack(newTrack);
  newTrack.enabled = Boolean(enabled);
  bindCinemaTrackLifecycle(kind, newTrack);
  for (const [peerId, pc] of app.peers) {
    const result = await publishTrackToPeer(pc, kind, newTrack, app.localStream);
    if (result.needsNegotiation) scheduleCinemaNegotiation(peerId);
  }
  oldTracks.forEach((track) => track.stop());
  app.mediaAvailable[kind] = true;
  app.mediaEnabled[kind] = Boolean(enabled);
  elements.localVideo.srcObject = app.localStream;
  if (kind === 'video') elements.localVideo.play().catch(() => undefined);
  updateMediaState();
}

function connectSocket() {
  const serverUrl = String(app.settings.serverUrl || '').trim();
  if (!/^wss?:\/\//i.test(serverUrl)) return fail('The room server URL is not configured.');
  clearTimeout(app.reconnectTimer);
  elements.connectionText.textContent = 'Connecting securely…';
  const socket = new WebSocket(serverUrl);
  app.socket = socket;

  socket.addEventListener('open', () => {
    elements.connectionText.textContent = 'Joining Cinema Mode…';
    sendSocket({
      type: 'hello',
      displayName: app.profile.displayName,
      clientVersion: chrome.runtime.getManifest().version,
      sessionId: app.profile.avatarSeed,
      capabilities: { playback: true, audio: app.mediaEnabled.audio, video: app.mediaEnabled.video, chat: false, cinema: true, screenShare: true }
    });
    sendSocket({ type: 'join-room', roomCode: app.roomCode, reconnect: true });
  });

  socket.addEventListener('message', (event) => {
    try { handleSocketMessage(JSON.parse(event.data)); }
    catch { fail('An invalid room message was received.'); }
  });

  socket.addEventListener('close', () => {
    if (app.closingForRestore || app.intentionallyLeaving) return;
    elements.connectionText.textContent = 'Connection interrupted · reconnecting…';
    clearTimeout(app.reconnectTimer);
    app.reconnectTimer = setTimeout(connectSocket, 1500);
  });

  socket.addEventListener('error', () => {
    elements.connectionText.textContent = 'Room connection issue';
  });
}

function sendSocket(payload) {
  if (app.socket?.readyState !== WebSocket.OPEN) return false;
  app.socket.send(JSON.stringify(payload));
  return true;
}

async function handleSocketMessage(message) {
  switch (message.type) {
    case 'welcome':
      app.selfId = message.clientId;
      break;
    case 'room-joined':
    case 'room-created':
      enterRoom(message);
      break;
    case 'participant-joined':
      addParticipant(message.participant);
      if (message.participant.id !== app.selfId) await createOffer(message.participant.id);
      updateParticipantUI();
      renderRemoteViews();
      break;
    case 'participant-replaced':
      removeParticipant(message.oldParticipantId);
      addParticipant(message.participant);
      if (message.participant.id !== app.selfId) await createOffer(message.participant.id);
      updateParticipantUI();
      renderRemoteViews();
      break;
    case 'session-replaced':
      elements.connectionText.textContent = 'This view was replaced by your newer APS window.';
      app.closingForRestore = true;
      app.socket?.close();
      break;
    case 'removed-from-room':
      app.intentionallyLeaving = true;
      elements.connectionText.textContent = message.reason || 'Removed by host';
      setTimeout(() => leaveRoom(), 1200);
      break;
    case 'host-mute':
      { const track = app.localStream?.getAudioTracks?.()[0]; if (track) track.enabled = false; app.mediaEnabled.audio = false; updateMediaState(); elements.hint.textContent = `${message.byName || 'The host'} muted your microphone.`; }
      break;
    case 'ask-to-unmute':
      elements.hint.textContent = `${message.byName || 'The host'} asked you to unmute.`;
      break;
    case 'participant-left':
      removeParticipant(message.participantId);
      if (Object.prototype.hasOwnProperty.call(message, 'hostId')) app.hostId = message.hostId;
      updateRole();
      updateParticipantUI();
      renderRemoteViews();
      break;
    case 'signal':
      await handleSignal(message.fromId, message.signal);
      break;
    case 'playback':
      await applyRemotePlayback(message);
      break;
    case 'control-policy':
      app.sharedControls = Boolean(message.everyoneCanControl);
      break;
    case 'host-changed':
      app.hostId = message.hostId || '';
      updateRole();
      break;
    case 'screen-share-state':
      handleCinemaScreenShareState(message.screenShare);
      break;
    case 'media-state': {
      const participant = app.participants.get(message.participantId);
      if (participant) participant.media = { ...participant.media, ...message.media };
      renderRemoteViews();
      break;
    }
    case 'error':
      if (/screen.*already|already.*screen|presenting/i.test(String(message.message || '')) && app.localScreenStream) stopCinemaScreenShare(false);
      fail(message.message || 'Room connection failed.');
      break;
    default:
      break;
  }
}

function enterRoom(message) {
  app.selfId = message.selfId || app.selfId;
  app.hostId = message.hostId;
  app.sharedControls = Boolean(message.everyoneCanControl);
  app.screenShare = message.screenShare || inactiveScreenShare();
  app.participants.clear();
  for (const participant of message.participants || []) addParticipant(participant);
  if (!app.participants.has(app.selfId)) {
    addParticipant({ id: app.selfId, name: app.profile.displayName, media: { ...app.mediaEnabled } });
  }
  updateRole();
  updateParticipantUI();
  renderRemoteViews();
  updateCinemaScreenUI();
  elements.connectionText.textContent = 'Cinema Mode connected';
  startHeartbeat();
  chrome.storage.local.set({
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      mediaMode: app.mediaMode,
      media: { ...app.mediaEnabled },
      updatedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    }
  });
  for (const participant of app.participants.values()) {
    if (participant.id !== app.selfId) createOffer(participant.id);
  }
  sendSocket({ type: 'media-state', media: app.mediaEnabled });
  if (app.mediaWarnings.length) elements.hint.textContent = `${app.mediaWarnings.join(' ')} Cinema Mode continued without the missing device.`;
  chrome.runtime.sendMessage({ type: 'APS_CINEMA_READY', roomCode: app.roomCode }).catch(() => undefined);
}

function addParticipant(participant) {
  if (!participant?.id) return;
  const previous = app.participants.get(participant.id) || {};
  app.participants.set(participant.id, {
    ...previous,
    ...participant,
    name: participant.name || previous.name || 'Friend',
    media: participant.media || previous.media || { audio: true, video: true }
  });
}

function removeParticipant(id) {
  app.participants.delete(id);
  app.peers.get(id)?.close();
  app.peers.delete(id);
  clearTimeout(app.negotiationTimers.get(id));
  app.negotiationTimers.delete(id);
  app.remoteStreams.delete(id);
  app.remoteScreenStreams.delete(id);
  app.peerStreamRegistry.delete(id);
  app.screenSenders.delete(id);
  document.querySelector(`[data-audio-peer="${CSS.escape(id)}"]`)?.remove();
}

function updateRole() {
  app.isHost = Boolean(app.selfId && app.selfId === app.hostId);
  elements.roleBadge.textContent = app.isHost ? 'HOST' : 'GUEST';
}

function updateParticipantUI() {
  const count = Math.max(1, app.participants.size);
  elements.participantText.textContent = `${count} participant${count === 1 ? '' : 's'}`;
}

function rtcConfig() {
  const iceServers = Array.isArray(app.settings.iceServers) && app.settings.iceServers.length
    ? app.settings.iceServers
    : [{ urls: 'stun:stun.l.google.com:19302' }];
  return { iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
}

function getPeer(peerId) {
  const existing = app.peers.get(peerId);
  if (existing && existing.connectionState !== 'closed') return existing;

  const pc = new RTCPeerConnection(rtcConfig());
  app.peers.set(peerId, pc);
  const stream = app.localStream || new MediaStream();
  const localKinds = new Set();
  for (const track of stream.getTracks()) {
    localKinds.add(track.kind);
    pc.addTrack(track, stream);
  }
  if (!localKinds.has('audio')) pc.addTransceiver('audio', { direction: 'recvonly' });
  if (!localKinds.has('video')) pc.addTransceiver('video', { direction: 'recvonly' });
  if (app.localScreenStream?.active) {
    const senders = [];
    for (const track of app.localScreenStream.getTracks()) senders.push(pc.addTrack(track, app.localScreenStream));
    app.screenSenders.set(peerId, senders);
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) sendSocket({ type: 'signal', targetId: peerId, signal: { candidate: event.candidate } });
  };

  pc.onnegotiationneeded = () => scheduleCinemaNegotiation(peerId);

  pc.ontrack = (event) => {
    registerCinemaRemoteTrack(peerId, event);
  };

  pc.onconnectionstatechange = () => {
    const participant = app.participants.get(peerId);
    if (participant) participant.connectionState = pc.connectionState;
    renderRemoteViews();
    if (pc.connectionState === 'failed') {
      pc.close();
      app.peers.delete(peerId);
      setTimeout(() => createOffer(peerId, true), 800);
    }
  };
  return pc;
}

function scheduleCinemaNegotiation(peerId) {
  clearTimeout(app.negotiationTimers.get(peerId));
  const timer = setTimeout(() => {
    app.negotiationTimers.delete(peerId);
    createOffer(peerId).catch((error) => console.warn('APS Cinema renegotiation failed', error));
  }, 120);
  app.negotiationTimers.set(peerId, timer);
}

async function createOffer(peerId, iceRestart = false) {
  if (!peerId || peerId === app.selfId) return;
  const pc = getPeer(peerId);
  if (pc.signalingState !== 'stable' && !iceRestart) return;
  try {
    const offer = await pc.createOffer({ iceRestart });
    await pc.setLocalDescription(offer);
    sendSocket({ type: 'signal', targetId: peerId, signal: { description: pc.localDescription } });
  } catch (error) {
    console.warn('APS Cinema offer failed', error);
  }
}

async function handleSignal(peerId, signal) {
  const pc = getPeer(peerId);
  try {
    if (signal.description) {
      const description = new RTCSessionDescription(signal.description);
      const collision = description.type === 'offer' && pc.signalingState !== 'stable';
      const polite = app.selfId.localeCompare(peerId) > 0;
      if (collision && !polite) return;
      if (collision) await pc.setLocalDescription({ type: 'rollback' });
      await pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSocket({ type: 'signal', targetId: peerId, signal: { description: pc.localDescription } });
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (error) {
    console.warn('APS Cinema signal failed', error);
  }
}

function attachRemoteAudio(peerId, stream) {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return;
  let audio = document.querySelector(`[data-audio-peer="${CSS.escape(peerId)}"]`);
  if (!audio) {
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.audioPeer = peerId;
    elements.remoteAudio.appendChild(audio);
  }
  audio.srcObject = new MediaStream(audioTracks);
  if (app.devicePreferences.audiooutput && typeof audio.setSinkId === 'function') audio.setSinkId(app.devicePreferences.audiooutput).catch(() => undefined);
  audio.play().catch(() => undefined);
}


function registerCinemaRemoteTrack(peerId, event) {
  const registry = app.peerStreamRegistry.get(peerId) || new Map();
  let stream = event.streams?.[0];
  if (!stream) {
    stream = registry.get(`fallback-${event.track.kind}`) || new MediaStream();
    if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
  }
  registry.set(stream.id || `fallback-${event.track.kind}`, stream);
  app.peerStreamRegistry.set(peerId, registry);
  event.track.addEventListener('ended', () => reconcileCinemaPeerStreams(peerId), { once: true });
  reconcileCinemaPeerStreams(peerId);
}

function reconcileCinemaPeerStreams(peerId) {
  const registry = app.peerStreamRegistry.get(peerId) || new Map();
  let cameraStream = null;
  let screenStream = null;
  for (const stream of registry.values()) {
    if (isScreenShareStream(peerId, stream.id, app.screenShare)) screenStream = stream;
    else if (!cameraStream || stream.getTracks().length > cameraStream.getTracks().length) cameraStream = stream;
  }
  if (cameraStream) {
    app.remoteStreams.set(peerId, cameraStream);
    attachRemoteAudio(peerId, cameraStream);
  }
  if (screenStream) app.remoteScreenStreams.set(peerId, screenStream);
  else app.remoteScreenStreams.delete(peerId);
  renderRemoteViews();
}

async function toggleCinemaScreenShare() {
  if (app.localScreenStream) {
    await stopCinemaScreenShare(true);
    return;
  }
  if (app.screenShare.active && app.screenShare.presenterId !== app.selfId) {
    elements.hint.textContent = `${app.screenShare.presenterName || 'A friend'} is already presenting.`;
    return;
  }
  await startCinemaScreenShare();
}

async function startCinemaScreenShare() {
  if (app.screenOperation || !app.roomCode) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    elements.hint.textContent = 'Screen sharing is unavailable in this Chrome version.';
    return;
  }
  app.screenOperation = true;
  updateCinemaScreenButton();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: true,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: 'include'
    });
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('No screen was selected.');
    videoTrack.contentHint = 'detail';
    app.localScreenStream = stream;
    app.screenShare = { active: true, presenterId: app.selfId, presenterName: app.profile.displayName || 'You', streamId: stream.id };
    app.screenViewHidden = false;
    videoTrack.addEventListener('ended', () => stopCinemaScreenShare(true), { once: true });
    for (const [peerId, pc] of app.peers) {
      const senders = [];
      for (const track of stream.getTracks()) senders.push(pc.addTrack(track, stream));
      app.screenSenders.set(peerId, senders);
      scheduleCinemaNegotiation(peerId);
    }
    sendSocket({ type: 'screen-share-state', active: true, streamId: stream.id });
    elements.hint.textContent = 'You are sharing. Protected OTT video may appear blank; normal tabs, documents and apps work.';
    updateCinemaScreenUI();
  } catch (error) {
    if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') elements.hint.textContent = error?.message || 'Could not start screen sharing.';
  } finally {
    app.screenOperation = false;
    updateCinemaScreenButton();
  }
}

async function stopCinemaScreenShare(notifyServer = true) {
  if (app.stoppingScreenShare) return;
  app.stoppingScreenShare = true;
  const stream = app.localScreenStream;
  app.localScreenStream = null;
  for (const [peerId, senders] of app.screenSenders) {
    const pc = app.peers.get(peerId);
    if (pc) {
      for (const sender of senders) {
        try { pc.removeTrack(sender); } catch { /* Peer may be closing. */ }
      }
      scheduleCinemaNegotiation(peerId);
    }
  }
  app.screenSenders.clear();
  stream?.getTracks().forEach((track) => track.stop());
  if (app.screenShare.presenterId === app.selfId) app.screenShare = inactiveScreenShare();
  if (notifyServer && app.roomCode) sendSocket({ type: 'screen-share-state', active: false });
  updateCinemaScreenUI();
  app.stoppingScreenShare = false;
}

function handleCinemaScreenShareState(nextState) {
  const previous = app.screenShare;
  app.screenShare = nextState?.active ? {
    active: true,
    presenterId: String(nextState.presenterId || ''),
    presenterName: String(nextState.presenterName || 'Friend'),
    streamId: String(nextState.streamId || '')
  } : inactiveScreenShare();
  if (!app.screenShare.active && previous.presenterId === app.selfId && app.localScreenStream) stopCinemaScreenShare(false);
  if (app.screenShare.active) reconcileCinemaPeerStreams(app.screenShare.presenterId);
  else app.remoteScreenStreams.clear();
  updateCinemaScreenUI();
}

function currentCinemaScreenStream() {
  if (!app.screenShare.active) return null;
  if (app.screenShare.presenterId === app.selfId) return app.localScreenStream;
  return app.remoteScreenStreams.get(app.screenShare.presenterId) || null;
}

function toggleCinemaScreenView() {
  if (!app.screenShare.active) return;
  app.screenViewHidden = !app.screenViewHidden;
  chrome.storage.local.set({ apsScreenViewPreferences: { hidden: app.screenViewHidden } });
  updateCinemaScreenUI();
}

function updateCinemaScreenButton() {
  const local = Boolean(app.localScreenStream);
  const blocked = app.screenShare.active && app.screenShare.presenterId !== app.selfId;
  elements.shareScreenBtn.classList.toggle('sharing', local);
  elements.shareScreenBtn.disabled = app.screenOperation;
  elements.shareScreenBtn.title = local ? 'Stop sharing screen' : blocked ? `${app.screenShare.presenterName || 'A friend'} is presenting` : 'Share a tab, window or screen';
}

function updateCinemaScreenUI() {
  const active = Boolean(app.screenShare.active);
  const stream = currentCinemaScreenStream();
  const hidden = active && app.screenViewHidden;
  elements.cinemaScreenStage.hidden = !active || hidden;
  elements.cinemaScreenHiddenBar.hidden = !active || !hidden;
  elements.cameraStage.classList.toggle('screen-active', active && !hidden);
  elements.cinemaScreenPresenter.textContent = active ? `${app.screenShare.presenterName || 'Friend'} is presenting` : 'Screen share';
  elements.cinemaScreenHiddenText.textContent = active ? `${app.screenShare.presenterName || 'Friend'} is presenting` : 'Screen share hidden';
  elements.cinemaScreenStatus.textContent = app.screenShare.presenterId === app.selfId ? 'You are sharing' : stream ? 'Live screen share' : 'Connecting…';
  elements.cinemaScreenToggleBtn.textContent = hidden ? 'Show' : 'Hide';
  if (elements.cinemaScreenVideo.srcObject !== stream) {
    elements.cinemaScreenVideo.srcObject = stream;
    elements.cinemaScreenVideo.muted = app.screenShare.presenterId === app.selfId;
    if (stream) elements.cinemaScreenVideo.play().catch(() => undefined);
  }
  elements.cinemaScreenStage.classList.toggle('has-stream', Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live')));
  updateCinemaScreenButton();
  renderPipCallView();
}

function renderRemoteViews() {
  renderRemoteGridInto(document, elements.remoteGrid);
  updateCinemaScreenUI();
  renderPipCallView();
}

function renderRemoteGridInto(doc, grid) {
  if (!grid) return;
  grid.replaceChildren();
  const friends = [...app.participants.values()].filter((participant) => participant.id !== app.selfId);
  const visible = friends.slice(0, 4);
  grid.classList.toggle('one-card', visible.length === 1);

  if (!friends.length) {
    const empty = doc.createElement('div');
    empty.className = 'remote-empty';
    empty.innerHTML = '<strong>Waiting for friends</strong><span>Their camera will appear here after they join.</span>';
    grid.appendChild(empty);
    return;
  }

  for (const participant of visible) {
    const stream = app.remoteStreams.get(participant.id);
    grid.appendChild(createRemoteCard(doc, participant, stream));
  }

  if (friends.length > visible.length) {
    const more = doc.createElement('div');
    more.className = 'more-friends';
    more.textContent = `+${friends.length - visible.length}`;
    grid.appendChild(more);
  }
}

function createRemoteCard(doc, participant, stream) {
  const card = doc.createElement('article');
  card.className = 'camera-card remote-card';
  card.dataset.peerCard = participant.id;

  const video = doc.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  if (stream) {
    video.srcObject = stream;
    video.play().catch(() => undefined);
  }

  const videoTrackLive = Boolean(
    participant.media?.video !== false &&
    stream?.getVideoTracks().some((track) => track.readyState === 'live')
  );
  card.classList.toggle('has-video', videoTrackLive);

  const fallback = doc.createElement('div');
  fallback.className = 'video-fallback';
  const initial = doc.createElement('span');
  initial.textContent = initialOf(participant.name);
  fallback.appendChild(initial);

  const gradient = doc.createElement('div');
  gradient.className = 'video-gradient';

  const meta = doc.createElement('div');
  meta.className = 'video-meta';
  const identity = doc.createElement('span');
  const name = doc.createElement('strong');
  name.textContent = participant.name || 'Friend';
  const sub = doc.createElement('small');
  sub.textContent = participant.id === app.hostId ? 'HOST' : 'FRIEND';
  identity.append(name, sub);

  const state = doc.createElement('span');
  state.className = 'peer-state';
  if (participant.media?.video === false) {
    state.classList.add('off');
    state.textContent = 'CAM OFF';
  } else if (!videoTrackLive) {
    state.classList.add('waiting');
    state.textContent = participant.connectionState === 'failed' ? 'RECONNECTING' : 'CONNECTING';
  } else {
    state.textContent = participant.media?.audio === false ? 'MUTED' : 'LIVE';
    if (participant.media?.audio === false) state.classList.add('off');
  }
  meta.append(identity, state);
  card.append(video, fallback, gradient, meta);
  return card;
}

function setViewPreference(key, value) {
  app.viewPreferences[key] = Boolean(value);
  applyViewPreferences(true);
}

function applyViewPreferences(save = true) {
  const { showSelf, showFriends } = app.viewPreferences;
  elements.cameraStage.classList.toggle('show-self', showSelf);
  elements.cameraStage.classList.toggle('show-friends', showFriends);
  elements.cameraStage.classList.toggle('both-hidden', !showSelf && !showFriends);
  elements.viewsHidden.hidden = showSelf || showFriends;
  updateViewButton(elements.selfViewBtn, showSelf);
  updateViewButton(elements.friendsViewBtn, showFriends);
  if (save) chrome.storage.local.set({ apsCinemaPreferences: { showSelf, showFriends } });
  renderPipCallView();
}

function updateViewButton(button, active) {
  if (!button) return;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

async function toggleMicrophone() {
  if (!app.mediaAvailable.audio) {
    try { await activateCinemaMedia('audio'); }
    catch (error) { elements.hint.textContent = error?.message || 'Could not start the microphone.'; }
    return;
  }
  app.mediaEnabled.audio = !app.mediaEnabled.audio;
  app.mediaIntent.audio = app.mediaEnabled.audio;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  await chrome.storage.local.set({ apsMediaIntent: app.mediaIntent, apsMediaMode: app.mediaMode });
  updateMediaState();
}

async function toggleCamera() {
  if (!app.mediaAvailable.video) {
    try { await activateCinemaMedia('video'); }
    catch (error) { elements.hint.textContent = error?.message || 'Could not start the camera.'; }
    return;
  }
  app.mediaEnabled.video = !app.mediaEnabled.video;
  app.mediaIntent.video = app.mediaEnabled.video;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  await chrome.storage.local.set({ apsMediaIntent: app.mediaIntent, apsMediaMode: app.mediaMode });
  updateMediaState();
}

function updateMediaState() {
  app.mediaEnabled.audio = Boolean(app.mediaAvailable.audio && app.mediaEnabled.audio);
  app.mediaEnabled.video = Boolean(app.mediaAvailable.video && app.mediaEnabled.video);
  for (const track of app.localStream?.getAudioTracks() || []) track.enabled = app.mediaEnabled.audio;
  for (const track of app.localStream?.getVideoTracks() || []) track.enabled = app.mediaEnabled.video;
  const self = app.participants.get(app.selfId);
  if (self) self.media = { ...app.mediaEnabled };
  updateMediaUI();
  sendSocket({ type: 'media-state', media: app.mediaEnabled });
  chrome.storage.local.set({
    apsMediaIntent: app.mediaIntent,
    apsMediaMode: deriveMediaMode(app.mediaIntent),
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      mediaMode: deriveMediaMode(app.mediaIntent),
      media: { ...app.mediaEnabled },
      updatedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    }
  });
}

function effectiveCinemaModeLabel() {
  if (app.mediaAvailable.audio && app.mediaAvailable.video) return MEDIA_MODES.av.label;
  if (app.mediaAvailable.audio) return MEDIA_MODES.audio.label;
  if (app.mediaAvailable.video) return MEDIA_MODES.video.label;
  return MEDIA_MODES.watch.label;
}

function updateCinemaActionButton(button, kind) {
  const available = app.mediaAvailable[kind];
  const enabled = app.mediaEnabled[kind];
  button.disabled = false;
  button.classList.toggle('active', available && enabled);
  button.classList.toggle('off', available && !enabled);
  button.classList.toggle('unavailable', !available);
  button.classList.toggle('add-device', !available);
  button.querySelector('svg').innerHTML = kind === 'audio' ? (enabled ? ICONS.mic : ICONS.micOff) : (enabled ? ICONS.camera : ICONS.cameraOff);
  const label = kind === 'audio' ? 'microphone' : 'camera';
  button.title = !available ? `Connect or start ${label}` : enabled ? `Turn ${label} off` : `Turn ${label} on`;
  button.setAttribute('aria-label', button.title);
}

function updateMediaUI() {
  updateCinemaActionButton(elements.micBtn, 'audio');
  updateCinemaActionButton(elements.cameraBtn, 'video');
  elements.selfCard.classList.toggle('has-video', app.mediaEnabled.video && hasLiveVideo(app.localStream));
  elements.liveIndicator.textContent = app.mediaEnabled.video ? 'LIVE' : effectiveCinemaModeLabel();
  renderPipCallView();
}

async function pollPlayer(force) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'APS_SEND_TO_TAB', payload: { type: 'APS_PLAYER_PING' } });
    if (response?.tabId) app.activeTabId = response.tabId;
    if (response?.ok && response.result) handlePlayerStatus(response.result);
    else if (force) elements.syncText.innerHTML = '<i></i> Open a supported movie';
  } catch {
    if (force) elements.syncText.innerHTML = '<i></i> Open a supported movie';
  }
}

function handlePlayerStatus(status) {
  app.player = { ...(app.player || {}), ...status };
  elements.syncText.innerHTML = app.player?.ready ? '<i></i> Movie sync active' : '<i></i> Waiting for movie';
}

function handleLocalPlayerEvent(event) {
  handlePlayerStatus(event);
  if (!(app.isHost || app.sharedControls)) return;
  const map = { play: 'play', pause: 'pause', seek: 'seek', seeking: 'seek', rate: 'sync' };
  const kind = map[event.action];
  if (!kind) return;
  broadcastPlayback({
    kind,
    time: event.currentTime,
    paused: event.paused,
    rate: event.playbackRate || 1,
    title: event.title,
    service: event.service
  });
}

function broadcastPlayback(command) {
  if (!app.roomCode) return;
  sendSocket({
    type: 'playback',
    command: { ...command, sentAt: Date.now(), commandId: crypto.randomUUID() }
  });
}

async function applyRemotePlayback(message) {
  if (message.fromId === app.selfId) return;
  const response = await chrome.runtime.sendMessage({
    type: 'APS_SEND_TO_TAB',
    payload: { type: 'APS_PLAYER_COMMAND', command: message.command }
  });
  if (response?.result?.status) handlePlayerStatus(response.result.status);
  if (!response?.ok || response.result?.ok === false) elements.syncText.innerHTML = '<i></i> Open same movie';
}

function startHeartbeat() {
  clearInterval(app.heartbeat);
  app.heartbeat = setInterval(() => {
    if (app.socket?.readyState === WebSocket.OPEN) sendSocket({ type: 'ping', at: Date.now() });
    if (app.isHost && app.player?.ready) {
      broadcastPlayback({
        kind: 'sync',
        time: app.player.currentTime || 0,
        paused: app.player.paused !== false,
        rate: app.player.playbackRate || 1,
        title: app.player.title,
        service: app.player.service
      });
    }
  }, 3000);
}

async function openFloatingCallView() {
  if (!('documentPictureInPicture' in window)) {
    elements.hint.textContent = 'Always-on-top mode is unavailable. You can still drag this Cinema window anywhere.';
    return;
  }
  if (app.pipWindow && !app.pipWindow.closed) {
    app.pipWindow.focus();
    return;
  }
  try {
    const friendCount = Math.max(0, app.participants.size - 1);
    const bothVisible = app.viewPreferences.showSelf && app.viewPreferences.showFriends;
    const pip = await documentPictureInPicture.requestWindow({
      width: bothVisible && friendCount ? 560 : 350,
      height: bothVisible && friendCount ? 360 : 270,
      disallowReturnToOpener: true
    });
    app.pipWindow = pip;

    const link = pip.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('cinema.css');
    pip.document.head.appendChild(link);
    pip.document.title = 'APS Floating Call';
    pip.document.body.className = 'pip-body';

    const root = pip.document.createElement('main');
    root.className = 'pip-root';
    root.innerHTML = `
      <header class="pip-topbar">
        <div class="pip-title"><strong>APS Floating Call</strong><span>${escapeHtml(formatRoomCode(app.roomCode))} · drag this window anywhere</span></div>
        <div class="pip-view-actions">
          <button class="view-btn" data-action="self-view" type="button">Me</button>
          <button class="view-btn" data-action="friends-view" type="button">Friends</button>
        </div>
      </header>
      <section class="shared-pip-stage" data-pip-screen hidden><video autoplay playsinline></video></section>
      <section class="camera-stage" data-pip-stage>
        <article class="camera-card self-card" data-pip-self>
          <video autoplay muted playsinline></video>
          <div class="video-fallback"><span>${escapeHtml(initialOf(app.profile.displayName || 'You'))}</span></div>
          <div class="video-gradient"></div>
          <div class="video-meta"><span><strong>${escapeHtml(app.profile.displayName || 'You')}</strong><small>${escapeHtml(formatRoomCode(app.roomCode))}</small></span><span class="live-indicator">LIVE</span></div>
        </article>
        <div class="remote-grid" data-pip-grid></div>
        <div class="views-hidden" data-pip-hidden hidden><span class="hidden-icon">◉</span><strong>Camera previews hidden</strong><small>Call audio and synchronization continue.</small></div>
      </section>
      <div class="pip-controls">
        <button data-action="mic" title="Mute or connect microphone">Mic</button>
        <button data-action="camera" title="Turn camera off or connect one">Camera</button>
        <button data-action="share" title="Share or stop sharing your screen">Share</button>
        <button data-action="devices" title="Change camera, microphone or speakers">Devices</button>
        <button data-action="restore" class="primary">Full controls</button>
      </div>`;
    pip.document.body.appendChild(root);

    $('[data-action="self-view"]', root).addEventListener('click', () => setViewPreference('showSelf', !app.viewPreferences.showSelf));
    $('[data-action="friends-view"]', root).addEventListener('click', () => setViewPreference('showFriends', !app.viewPreferences.showFriends));
    $('[data-action="mic"]', root).addEventListener('click', toggleMicrophone);
    $('[data-action="camera"]', root).addEventListener('click', toggleCamera);
    $('[data-action="share"]', root).addEventListener('click', toggleCinemaScreenShare);
    $('[data-action="devices"]', root).addEventListener('click', openDevicesFromPip);
    $('[data-action="restore"]', root).addEventListener('click', restoreFullControls);

    renderPipCallView();
    pip.addEventListener('pagehide', async () => {
      app.pipWindow = null;
      try {
        const current = await chrome.windows.getCurrent();
        await chrome.windows.update(current.id, { state: 'normal', focused: true });
      } catch { /* Cinema window may already be closing. */ }
    }, { once: true });

    elements.hint.textContent = 'Floating call is always on top. Use Me and Friends to hide or show either view.';
    setTimeout(() => chrome.runtime.sendMessage({ type: 'APS_MINIMIZE_CURRENT_WINDOW' }).catch(() => undefined), 250);
  } catch (error) {
    elements.hint.textContent = error?.message || 'Could not open floating call view.';
  }
}

function renderPipCallView() {
  const pip = app.pipWindow;
  if (!pip || pip.closed) return;
  const doc = pip.document;
  const stage = $('[data-pip-stage]', doc);
  const selfCard = $('[data-pip-self]', doc);
  const selfVideo = $('video', selfCard);
  const grid = $('[data-pip-grid]', doc);
  const hidden = $('[data-pip-hidden]', doc);
  const screenStage = $('[data-pip-screen]', doc);
  const screenVideo = $('video', screenStage);
  const screenStream = currentCinemaScreenStream();
  const { showSelf, showFriends } = app.viewPreferences;

  pip.document.querySelector('.pip-root')?.classList.toggle('has-screen', Boolean(app.screenShare.active && !app.screenViewHidden));
  if (screenStage) screenStage.hidden = !app.screenShare.active || app.screenViewHidden;
  if (screenVideo && screenVideo.srcObject !== screenStream) {
    screenVideo.srcObject = screenStream;
    screenVideo.muted = app.screenShare.presenterId === app.selfId;
    if (screenStream) screenVideo.play().catch(() => undefined);
  }
  stage.classList.toggle('show-self', showSelf);
  stage.classList.toggle('show-friends', showFriends);
  stage.classList.toggle('both-hidden', !showSelf && !showFriends);
  hidden.hidden = showSelf || showFriends;
  updateViewButton($('[data-action="self-view"]', doc), showSelf);
  updateViewButton($('[data-action="friends-view"]', doc), showFriends);

  if (selfVideo && selfVideo.srcObject !== app.localStream) {
    selfVideo.srcObject = app.localStream;
    selfVideo.play().catch(() => undefined);
  }
  selfCard?.classList.toggle('has-video', app.mediaEnabled.video && hasLiveVideo(app.localStream));
  const live = $('.live-indicator', selfCard);
  if (live) live.textContent = app.mediaEnabled.video ? 'LIVE' : effectiveCinemaModeLabel();
  renderRemoteGridInto(doc, grid);

  const mic = $('[data-action="mic"]', doc);
  const camera = $('[data-action="camera"]', doc);
  const share = $('[data-action="share"]', doc);
  if (mic) {
    mic.textContent = app.mediaAvailable.audio ? (app.mediaEnabled.audio ? 'Mic' : 'Unmute') : 'Add mic';
    mic.disabled = false;
    mic.title = app.mediaAvailable.audio ? (app.mediaEnabled.audio ? 'Mute microphone' : 'Unmute microphone') : 'Connect or select a microphone';
  }
  if (share) {
    share.textContent = app.localScreenStream ? 'Stop share' : app.screenShare.active ? 'Sharing' : 'Share';
    share.disabled = app.screenShare.active && app.screenShare.presenterId !== app.selfId;
  }
  if (camera) {
    camera.textContent = app.mediaAvailable.video ? (app.mediaEnabled.video ? 'Camera' : 'Camera on') : 'Add camera';
    camera.disabled = false;
    camera.title = app.mediaAvailable.video ? (app.mediaEnabled.video ? 'Turn camera off' : 'Turn camera on') : 'Connect or select a camera';
  }
}

async function openDevicesFromPip() {
  try {
    app.pipWindow?.close();
    app.pipWindow = null;
    const current = await chrome.windows.getCurrent();
    await chrome.windows.update(current.id, { state: 'normal', focused: true });
  } catch { /* The Cinema window may already be visible. */ }
  setCinemaDevicePanel(true);
  await refreshCinemaDevices({ announce: true });
}

async function restoreFullControls() {
  elements.restoreBtn.disabled = true;
  elements.connectionText.textContent = 'Restoring full controls…';
  const response = await chrome.runtime.sendMessage({ type: 'APS_RESTORE_FULL_PANEL', roomCode: app.roomCode });
  if (!response?.ok) {
    elements.restoreBtn.disabled = false;
    elements.connectionText.textContent = response?.error || 'Could not restore full controls.';
    return;
  }
  // Keep Cinema alive until the full panel confirms it has rejoined.
  setTimeout(() => {
    if (!app.closingForRestore) {
      elements.restoreBtn.disabled = false;
      elements.connectionText.textContent = 'Full controls did not open. Click again or use the APS toolbar icon.';
    }
  }, 9000);
}

function finishRestoreHandoff() {
  app.closingForRestore = true;
  clearInterval(app.heartbeat);
  clearInterval(app.poller);
  stopAllMedia();
  app.socket?.close();
  app.pipWindow?.close();
  chrome.runtime.sendMessage({ type: 'APS_CLOSE_CURRENT_WINDOW' }).catch(() => window.close());
}

function leaveRoom() {
  app.intentionallyLeaving = true;
  sendSocket({ type: 'leave-room' });
  chrome.storage.local.remove(['apsActiveRoom', 'apsRestoreRoom']);
  app.socket?.close();
  app.pipWindow?.close();
  stopAllMedia();
  chrome.runtime.sendMessage({ type: 'APS_CLOSE_CURRENT_WINDOW' }).catch(() => window.close());
}

function stopAllMedia() {
  stopCinemaScreenShare(false);
  clearInterval(app.heartbeat);
  clearInterval(app.poller);
  clearTimeout(app.reconnectTimer);
  for (const peer of app.peers.values()) peer.close();
  app.peers.clear();
  app.remoteStreams.clear();
  app.remoteScreenStreams.clear();
  app.peerStreamRegistry.clear();
  app.screenSenders.clear();
  elements.remoteAudio.replaceChildren();
  app.localStream?.getTracks().forEach((track) => track.stop());
  app.localStream = null;
}

function fail(message) {
  elements.connectionText.textContent = message;
  elements.connectionText.classList.add('error');
  elements.hint.textContent = 'Use Full controls to return to the main panel.';
}

function hasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01IO]/g, '').slice(0, 8);
}

function formatRoomCode(value) {
  const clean = normalizeCode(value);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function initialOf(value) {
  return String(value || '?').trim().charAt(0).toUpperCase() || '?';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

init();

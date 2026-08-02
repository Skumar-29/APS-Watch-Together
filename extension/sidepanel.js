const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ICONS = {
  play: '<path d="M8 5v14l11-7L8 5Z"/>',
  pause: '<path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/>',
  mic: '<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2Z"/>',
  micOff: '<path d="m4.3 3 16.7 16.7-1.3 1.3-4.1-4.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5 12h2a5 5 0 0 0 7.1 4.5l-1.5-1.5H12a3 3 0 0 1-3-3V7.4L3 4.3 4.3 3ZM12 3a3 3 0 0 1 3 3v5.2l-2-2V6a1 1 0 0 0-1.7-.7L9.9 3.9A3 3 0 0 1 12 3Zm5 9h2c0 1-.2 2-.6 2.9l-1.6-1.6c.1-.4.2-.8.2-1.3Z"/>',
  camera: '<path d="M4 5h11a2 2 0 0 1 2 2v2.2l4-2.5v10.6l-4-2.5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
  cameraOff: '<path d="m3.3 2 18.7 18.7-1.3 1.3-3.8-3.8A2 2 0 0 1 15 19H4a2 2 0 0 1-2-2V7c0-.5.2-1 .5-1.3L2 3.3 3.3 2ZM21 6.7v10.6l-4-2.5v.4L9.8 8H15a2 2 0 0 1 2 2v-.8l4-2.5ZM5.8 5 17 16.2V17H4V7c0-.8.7-1.5 1.5-1.5l.3-.5Z"/>',
  micSmall: '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2Z"/></svg>',
  cameraSmall: '<svg viewBox="0 0 24 24"><path d="M4 5h11a2 2 0 0 1 2 2v2.2l4-2.5v10.6l-4-2.5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>'
};

const app = {
  profile: { displayName: '', avatarSeed: '' },
  settings: null,
  socket: null,
  socketState: 'offline',
  reconnectTimer: null,
  reconnectAttempts: 0,
  roomCode: '',
  selfId: '',
  hostId: '',
  isHost: false,
  participants: new Map(),
  peerConnections: new Map(),
  remoteStreams: new Map(),
  localStream: null,
  mediaEnabled: { audio: true, video: true },
  sharedControls: false,
  roomLocked: false,
  player: null,
  lastHostState: null,
  heartbeatTimer: null,
  statusPollTimer: null,
  unread: 0,
  activeTab: 'people',
  intentionallyLeft: false,
  pendingJoin: null,
  lastRoomActivity: Date.now(),
  activeTabId: null,
  permissionTabOpen: false,
  handoffToCinema: false,
  cinemaStarting: false,
  restoreInProgress: false
};

const elements = {
  setupView: $('#setupView'), roomView: $('#roomView'), displayName: $('#displayName'), roomCodeInput: $('#roomCodeInput'),
  createRoomBtn: $('#createRoomBtn'), joinRoomBtn: $('#joinRoomBtn'), openSettingsBtn: $('#openSettingsBtn'),
  connectionCaption: $('#connectionCaption'), roomCodeText: $('#roomCodeText'), copyRoomCodeBtn: $('#copyRoomCodeBtn'),
  roleBadge: $('#roleBadge'), leaveRoomBtn: $('#leaveRoomBtn'), serviceBadge: $('#serviceBadge'), syncBadge: $('#syncBadge'),
  mediaTitle: $('#mediaTitle'), currentTimeText: $('#currentTimeText'), durationText: $('#durationText'), timeline: $('#timeline'), timelineFill: $('#timelineFill'),
  rewindBtn: $('#rewindBtn'), playPauseBtn: $('#playPauseBtn'), playPauseIcon: $('#playPauseIcon'), forwardBtn: $('#forwardBtn'),
  resyncBtn: $('#resyncBtn'), playerMessage: $('#playerMessage'), participantCount: $('#participantCount'), peopleCountPill: $('#peopleCountPill'),
  videoGrid: $('#videoGrid'), localVideoCard: $('#localVideoCard'), localVideo: $('#localVideo'), localFallback: $('#localFallback'), localInitial: $('#localInitial'),
  cinemaModeBtn: $('#cinemaModeBtn'), toggleMicBtn: $('#toggleMicBtn'), toggleCameraBtn: $('#toggleCameraBtn'), localMicState: $('#localMicState'), peopleTabBtn: $('#peopleTabBtn'),
  chatTabBtn: $('#chatTabBtn'), peoplePanel: $('#peoplePanel'), chatPanel: $('#chatPanel'), peopleList: $('#peopleList'), unreadPill: $('#unreadPill'),
  sharedControlsToggle: $('#sharedControlsToggle'), roomLockToggle: $('#roomLockToggle'), chatForm: $('#chatForm'), chatInput: $('#chatInput'), messages: $('#messages'),
  toastRegion: $('#toastRegion'), reactionLayer: $('#reactionLayer')
};

async function init() {
  const stored = await chrome.storage.local.get(['apsSettings', 'apsProfile', 'apsActiveRoom', 'apsRestoreRoom']);
  app.settings = stored.apsSettings || {};
  app.profile = stored.apsProfile || { displayName: '', avatarSeed: crypto.randomUUID() };
  elements.displayName.value = app.profile.displayName || '';
  elements.localInitial.textContent = initialOf(app.profile.displayName || 'You');

  bindEvents();
  setView('setup');
  updateConnectionUI();
  await pollPlayer(true);
  app.statusPollTimer = setInterval(() => pollPlayer(false), 1400);

  const restore = stored.apsRestoreRoom;
  const active = stored.apsActiveRoom;
  const validRestore = restore?.roomCode && restore.expiresAt > Date.now() && active?.roomCode === restore.roomCode;
  if (validRestore) {
    app.restoreInProgress = true;
    app.pendingJoin = { mode: 'join', roomCode: restore.roomCode };
    app.intentionallyLeft = false;
    setBusy(true, 'Restoring…');
    try {
      await ensureLocalMedia();
      connectSocket();
    } catch (error) {
      if (isMediaPermissionError(error)) await openMediaPermissionTab();
      else {
        app.restoreInProgress = false;
        setBusy(false);
        toast(describeMediaError(error), 'error');
      }
    }
  }
}

function bindEvents() {
  elements.createRoomBtn.addEventListener('click', () => beginRoomFlow('create'));
  elements.joinRoomBtn.addEventListener('click', () => beginRoomFlow('join'));
  elements.roomCodeInput.addEventListener('input', (event) => {
    event.target.value = normalizeRoomCode(event.target.value, true);
  });
  elements.roomCodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') beginRoomFlow('join');
  });
  elements.displayName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') beginRoomFlow('create');
  });
  elements.openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  elements.copyRoomCodeBtn.addEventListener('click', copyInvite);
  elements.leaveRoomBtn.addEventListener('click', leaveRoom);
  elements.playPauseBtn.addEventListener('click', togglePlayPause);
  elements.rewindBtn.addEventListener('click', () => sendLocalControl({ kind: 'skip', amount: -10 }));
  elements.forwardBtn.addEventListener('click', () => sendLocalControl({ kind: 'skip', amount: 10 }));
  elements.resyncBtn.addEventListener('click', forceResync);
  elements.timeline.addEventListener('click', seekFromTimeline);
  elements.timeline.addEventListener('keydown', seekTimelineWithKeyboard);
  elements.cinemaModeBtn.addEventListener('click', startCinemaMode);
  elements.toggleMicBtn.addEventListener('click', toggleMicrophone);
  elements.toggleCameraBtn.addEventListener('click', toggleCamera);
  elements.peopleTabBtn.addEventListener('click', () => setTab('people'));
  elements.chatTabBtn.addEventListener('click', () => setTab('chat'));
  elements.sharedControlsToggle.addEventListener('change', updateSharedControls);
  elements.roomLockToggle.addEventListener('change', updateRoomLock);
  elements.chatForm.addEventListener('submit', sendChat);
  $$('.reaction-row button').forEach((button) => button.addEventListener('click', () => sendReaction(button.dataset.reaction)));

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'APS_MEDIA_PERMISSION_GRANTED') {
      app.permissionTabOpen = false;
      resumeRoomFlowAfterPermission();
      return;
    }
    if (message?.type === 'APS_MEDIA_PERMISSION_DENIED') {
      app.permissionTabOpen = false;
      setBusy(false);
      toast(message.error || 'Camera and microphone permission was not granted.', 'error');
      return;
    }
    if (message?.type === 'APS_CINEMA_READY' && app.cinemaStarting && message.roomCode === app.roomCode) {
      completeCinemaHandoff();
      return;
    }
    if (sender?.tab?.id && app.activeTabId && sender.tab.id !== app.activeTabId) return;
    if (sender?.tab?.id) app.activeTabId = sender.tab.id;
    if (message?.type === 'APS_PLAYER_STATUS') handlePlayerStatus(message);
    if (message?.type === 'APS_PLAYER_EVENT') handleLocalPlayerEvent(message);
    if (message?.type === 'APS_PLAYER_ERROR') toast(message.error, 'error');
  });

  window.addEventListener('beforeunload', () => {
    if (!app.handoffToCinema && app.socket?.readyState === WebSocket.OPEN) sendSocket({ type: 'leave-room' });
    stopLocalMedia();
  });
}

async function beginRoomFlow(mode) {
  const displayName = elements.displayName.value.trim().replace(/\s+/g, ' ').slice(0, 32);
  if (displayName.length < 2) {
    toast('Please enter your name.', 'error');
    elements.displayName.focus();
    return;
  }

  let roomCode = '';
  if (mode === 'join') {
    roomCode = normalizeRoomCode(elements.roomCodeInput.value);
    if (roomCode.length !== 8) {
      toast('Enter the 8-character room code.', 'error');
      elements.roomCodeInput.focus();
      return;
    }
  }

  app.profile.displayName = displayName;
  await chrome.storage.local.set({ apsProfile: app.profile });
  elements.localInitial.textContent = initialOf(displayName);
  app.pendingJoin = { mode, roomCode };
  app.intentionallyLeft = false;

  setBusy(true, mode === 'create' ? 'Creating…' : 'Joining…');
  try {
    await ensureLocalMedia();
    connectSocket();
  } catch (error) {
    if (isMediaPermissionError(error)) {
      await openMediaPermissionTab();
      return;
    }
    setBusy(false);
    toast(describeMediaError(error), 'error');
  }
}

function isMediaPermissionError(error) {
  return ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)
    || /permission|not allowed|dismissed|denied/i.test(String(error?.message || ''));
}

function describeMediaError(error) {
  if (error?.name === 'NotFoundError') return 'No camera or microphone was found. Connect a device and try again.';
  if (error?.name === 'NotReadableError') return 'Your camera or microphone is being used by another app. Close FaceTime, Zoom or Teams and try again.';
  if (error?.name === 'OverconstrainedError') return 'The selected camera quality is unavailable. Choose 720p in Settings and try again.';
  return error?.message || 'Camera and microphone could not be started.';
}

async function openMediaPermissionTab() {
  setBusy(false);
  if (app.permissionTabOpen) {
    toast('Complete the camera and microphone permission tab, then return here.', 'error');
    return;
  }
  app.permissionTabOpen = true;
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('request-permissions.html'), active: true });
    toast('A permission tab opened. Click Allow camera & microphone.', 'success');
  } catch (error) {
    app.permissionTabOpen = false;
    toast(error?.message || 'Could not open the permission page.', 'error');
  }
}

async function resumeRoomFlowAfterPermission() {
  if (!app.pendingJoin) return;
  setBusy(true, app.pendingJoin.mode === 'create' ? 'Creating…' : 'Joining…');
  try {
    await ensureLocalMedia();
    connectSocket();
  } catch (error) {
    setBusy(false);
    toast(describeMediaError(error), 'error');
  }
}

function connectSocket() {
  const serverUrl = String(app.settings.serverUrl || '').trim();
  if (!/^wss?:\/\//i.test(serverUrl)) {
    setBusy(false);
    toast('Add a valid room server URL in Settings.', 'error');
    return;
  }

  clearTimeout(app.reconnectTimer);
  if (app.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(app.socket.readyState)) app.socket.close();

  app.socketState = 'connecting';
  updateConnectionUI();
  const socket = new WebSocket(serverUrl);
  app.socket = socket;

  socket.addEventListener('open', () => {
    app.socketState = 'online';
    app.reconnectAttempts = 0;
    updateConnectionUI();
    sendSocket({
      type: 'hello',
      displayName: app.profile.displayName,
      clientVersion: chrome.runtime.getManifest().version,
      sessionId: app.profile.avatarSeed,
      capabilities: { playback: true, video: true, chat: true }
    });
    if (app.pendingJoin?.mode === 'create') sendSocket({ type: 'create-room' });
    else if (app.pendingJoin?.mode === 'join') sendSocket({ type: 'join-room', roomCode: app.pendingJoin.roomCode });
    else if (app.roomCode) sendSocket({ type: 'join-room', roomCode: app.roomCode, reconnect: true });
  });

  socket.addEventListener('message', (event) => {
    try { handleSocketMessage(JSON.parse(event.data)); }
    catch { toast('Received an invalid room message.', 'error'); }
  });

  socket.addEventListener('close', () => {
    app.socketState = 'offline';
    updateConnectionUI();
    if (app.roomCode && !app.intentionallyLeft) scheduleReconnect();
    else setBusy(false);
  });

  socket.addEventListener('error', () => {
    app.socketState = 'error';
    updateConnectionUI();
  });
}

function scheduleReconnect() {
  clearTimeout(app.reconnectTimer);
  const delay = Math.min(15000, 900 * 2 ** Math.min(app.reconnectAttempts, 4));
  app.reconnectAttempts += 1;
  elements.connectionCaption.textContent = `Reconnecting in ${Math.ceil(delay / 1000)}s…`;
  app.reconnectTimer = setTimeout(connectSocket, delay);
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
    case 'room-created':
    case 'room-joined':
      enterRoom(message);
      break;
    case 'room-state':
      updateRoomState(message);
      break;
    case 'participant-joined':
      addParticipant(message.participant);
      if (message.participant.id !== app.selfId) await createPeerOffer(message.participant.id);
      toast(`${message.participant.name} joined the room.`, 'success');
      break;
    case 'participant-left':
      removeParticipant(message.participantId);
      if (Object.prototype.hasOwnProperty.call(message, 'hostId')) app.hostId = message.hostId;
      updateRole();
      toast(message.reconnecting ? `${message.name || 'The host'} is reconnecting…` : `${message.name || 'A friend'} left the room.`);
      break;
    case 'signal':
      await handleSignal(message.fromId, message.signal);
      break;
    case 'playback':
      await applyRemotePlayback(message);
      break;
    case 'chat':
      appendMessage(message.message);
      break;
    case 'reaction':
      showReaction(message.emoji);
      break;
    case 'control-policy':
      app.sharedControls = Boolean(message.everyoneCanControl);
      elements.sharedControlsToggle.checked = app.sharedControls;
      updateControlPermissions();
      break;
    case 'room-lock':
      app.roomLocked = Boolean(message.locked);
      elements.roomLockToggle.checked = app.roomLocked;
      toast(app.roomLocked ? 'The room is now locked.' : 'The room is open for invited friends.');
      break;
    case 'media-state': {
      const participant = app.participants.get(message.participantId);
      if (participant) {
        participant.media = message.media;
        renderPeople();
        updateRemoteCard(message.participantId);
      }
      break;
    }
    case 'host-changed':
      app.hostId = message.hostId || '';
      updateRole();
      if (!app.hostId) toast('The host is reconnecting. Playback controls are temporarily paused.');
      else toast(app.isHost ? 'You are now the host.' : `${message.hostName || 'A friend'} is now the host.`, 'success');
      break;
    case 'pong':
      break;
    case 'error':
      setBusy(false);
      toast(message.message || 'Room error.', 'error');
      if (!app.roomCode) app.socket?.close();
      break;
    default:
      break;
  }
}

function enterRoom(message) {
  app.roomCode = message.roomCode;
  app.selfId = message.selfId || app.selfId;
  app.hostId = message.hostId;
  app.sharedControls = Boolean(message.everyoneCanControl);
  app.roomLocked = Boolean(message.locked);
  for (const pc of app.peerConnections.values()) pc.close();
  app.peerConnections.clear();
  app.remoteStreams.clear();
  document.querySelectorAll('[data-peer-card]').forEach((node) => node.remove());
  app.participants.clear();
  for (const participant of message.participants || []) addParticipant(participant, false);
  if (!app.participants.has(app.selfId)) {
    addParticipant({ id: app.selfId, name: app.profile.displayName, media: { ...app.mediaEnabled } }, false);
  }
  app.pendingJoin = null;
  app.intentionallyLeft = false;
  elements.roomCodeText.textContent = formatRoomCode(app.roomCode);
  elements.sharedControlsToggle.checked = app.sharedControls;
  elements.roomLockToggle.checked = app.roomLocked;
  setBusy(false);
  setView('room');
  updateRole();
  updateParticipantUI();
  startHeartbeat();
  toast(message.type === 'room-created' ? 'Private room created.' : 'Joined the watch room.', 'success');
  chrome.storage.local.set({
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    }
  });
  if (app.restoreInProgress) {
    app.restoreInProgress = false;
    chrome.storage.local.remove('apsRestoreRoom');
    chrome.runtime.sendMessage({ type: 'APS_PANEL_RESTORED', roomCode: app.roomCode }).catch(() => undefined);
  }

  for (const participant of app.participants.values()) {
    if (participant.id !== app.selfId) createPeerOffer(participant.id);
  }
}

function updateRoomState(message) {
  if (Object.prototype.hasOwnProperty.call(message, 'hostId')) app.hostId = message.hostId;
  app.sharedControls = Boolean(message.everyoneCanControl);
  app.roomLocked = Boolean(message.locked);
  elements.sharedControlsToggle.checked = app.sharedControls;
  elements.roomLockToggle.checked = app.roomLocked;
  if (Array.isArray(message.participants)) {
    const incoming = new Set(message.participants.map((p) => p.id));
    for (const id of app.participants.keys()) if (!incoming.has(id)) removeParticipant(id);
    for (const participant of message.participants) addParticipant(participant, false);
  }
  updateRole();
  updateParticipantUI();
}

function addParticipant(participant, render = true) {
  if (!participant?.id) return;
  const existing = app.participants.get(participant.id) || {};
  app.participants.set(participant.id, {
    ...existing,
    ...participant,
    name: participant.name || existing.name || 'Friend',
    media: participant.media || existing.media || { audio: true, video: true }
  });
  if (render) updateParticipantUI();
}

function removeParticipant(participantId) {
  app.participants.delete(participantId);
  const peer = app.peerConnections.get(participantId);
  if (peer) peer.close();
  app.peerConnections.delete(participantId);
  app.remoteStreams.delete(participantId);
  document.querySelector(`[data-peer-card="${CSS.escape(participantId)}"]`)?.remove();
  updateParticipantUI();
}

function updateRole() {
  app.isHost = app.selfId && app.selfId === app.hostId;
  elements.roleBadge.textContent = app.isHost ? 'HOST' : 'GUEST';
  elements.roleBadge.className = `badge ${app.isHost ? 'host' : 'guest'}`;
  elements.sharedControlsToggle.disabled = !app.isHost;
  elements.roomLockToggle.disabled = !app.isHost;
  elements.sharedControlsToggle.closest('.control-policy')?.classList.toggle('disabled', !app.isHost);
  elements.roomLockToggle.closest('.control-policy')?.classList.toggle('disabled', !app.isHost);
  updateControlPermissions();
  renderPeople();
}

function updateControlPermissions() {
  const canControl = app.isHost || app.sharedControls;
  [elements.playPauseBtn, elements.rewindBtn, elements.forwardBtn].forEach((button) => button.disabled = !canControl || !app.player?.ready);
  elements.resyncBtn.disabled = !app.isHost || !app.player?.ready;
  elements.playerMessage.textContent = !app.player?.ready
    ? 'Open a movie in this tab to activate synchronized controls.'
    : canControl
      ? (app.isHost ? 'Your playback controls everyone in the room.' : 'The host has enabled shared controls.')
      : 'Only the host can control playback in this room.';
}

async function ensureLocalMedia() {
  if (app.localStream?.active) return app.localStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');

  const quality = app.settings.videoQuality || 'hd';
  const videoConstraints = quality === 'fullhd'
    ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }
    : quality === 'sd'
      ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };

  app.localStream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: {
      echoCancellation: app.settings.echoCancellation !== false,
      noiseSuppression: app.settings.noiseSuppression !== false,
      autoGainControl: app.settings.autoGainControl !== false,
      channelCount: 1
    }
  });
  elements.localVideo.srcObject = app.localStream;
  elements.localVideoCard.classList.add('has-video');
  applyLocalMediaState();
  return app.localStream;
}

function stopLocalMedia() {
  app.localStream?.getTracks().forEach((track) => track.stop());
  app.localStream = null;
}

function applyLocalMediaState() {
  if (!app.localStream) return;
  for (const track of app.localStream.getAudioTracks()) track.enabled = app.mediaEnabled.audio;
  for (const track of app.localStream.getVideoTracks()) track.enabled = app.mediaEnabled.video;
  elements.toggleMicBtn.className = `round-action ${app.mediaEnabled.audio ? 'active' : 'off'}`;
  elements.toggleMicBtn.querySelector('svg').innerHTML = app.mediaEnabled.audio ? ICONS.mic : ICONS.micOff;
  elements.toggleCameraBtn.className = `round-action ${app.mediaEnabled.video ? 'active' : 'off'}`;
  elements.toggleCameraBtn.querySelector('svg').innerHTML = app.mediaEnabled.video ? ICONS.camera : ICONS.cameraOff;
  elements.localVideoCard.classList.toggle('has-video', app.mediaEnabled.video);
  elements.localMicState.classList.toggle('off', !app.mediaEnabled.audio);
  const self = app.participants.get(app.selfId);
  if (self) self.media = { ...app.mediaEnabled };
  sendSocket({ type: 'media-state', media: app.mediaEnabled });
  renderPeople();
}

function toggleMicrophone() {
  app.mediaEnabled.audio = !app.mediaEnabled.audio;
  applyLocalMediaState();
}

function toggleCamera() {
  app.mediaEnabled.video = !app.mediaEnabled.video;
  applyLocalMediaState();
}

function rtcConfig() {
  const configured = Array.isArray(app.settings.iceServers) ? app.settings.iceServers : [];
  return {
    iceServers: configured.length ? configured : [{ urls: 'stun:stun.l.google.com:19302' }],
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };
}

function getOrCreatePeer(peerId) {
  let pc = app.peerConnections.get(peerId);
  if (pc && pc.connectionState !== 'closed') return pc;

  pc = new RTCPeerConnection(rtcConfig());
  app.peerConnections.set(peerId, pc);
  const stream = app.localStream;
  if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  pc.onicecandidate = (event) => {
    if (event.candidate) sendSocket({ type: 'signal', targetId: peerId, signal: { candidate: event.candidate } });
  };

  pc.ontrack = (event) => {
    const remoteStream = event.streams[0] || app.remoteStreams.get(peerId) || new MediaStream();
    if (!event.streams[0]) remoteStream.addTrack(event.track);
    app.remoteStreams.set(peerId, remoteStream);
    attachRemoteStream(peerId, remoteStream);
  };

  pc.onconnectionstatechange = () => {
    const participant = app.participants.get(peerId);
    if (participant) participant.connectionState = pc.connectionState;
    renderPeople();
    if (['failed', 'disconnected'].includes(pc.connectionState)) {
      setTimeout(() => {
        if (pc.connectionState === 'failed') restartPeer(peerId);
      }, 1800);
    }
  };

  return pc;
}

async function createPeerOffer(peerId, iceRestart = false) {
  if (!peerId || peerId === app.selfId) return;
  const pc = getOrCreatePeer(peerId);
  if (pc.signalingState !== 'stable' && !iceRestart) return;
  try {
    const offer = await pc.createOffer({ iceRestart });
    await pc.setLocalDescription(offer);
    sendSocket({ type: 'signal', targetId: peerId, signal: { description: pc.localDescription } });
  } catch (error) {
    console.warn('APS offer failed', error);
  }
}

async function handleSignal(peerId, signal) {
  const pc = getOrCreatePeer(peerId);
  try {
    if (signal.description) {
      const description = new RTCSessionDescription(signal.description);
      const offerCollision = description.type === 'offer' && pc.signalingState !== 'stable';
      const polite = app.selfId.localeCompare(peerId) > 0;
      if (offerCollision && !polite) return;
      if (offerCollision) await pc.setLocalDescription({ type: 'rollback' });
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
    console.warn('APS signal failed', error);
  }
}

function restartPeer(peerId) {
  const old = app.peerConnections.get(peerId);
  old?.close();
  app.peerConnections.delete(peerId);
  createPeerOffer(peerId, true);
}

function attachRemoteStream(peerId, stream) {
  let card = document.querySelector(`[data-peer-card="${CSS.escape(peerId)}"]`);
  const participant = app.participants.get(peerId) || { name: 'Friend', media: { audio: true, video: true } };
  if (!card) {
    card = document.createElement('article');
    card.className = 'video-card';
    card.dataset.peerCard = peerId;
    card.innerHTML = `
      <video autoplay playsinline></video>
      <div class="video-fallback"><span>${escapeHtml(initialOf(participant.name))}</span></div>
      <div class="video-meta"><span class="peer-name">${escapeHtml(participant.name)}</span><span class="mini-status"></span></div>`;
    elements.videoGrid.appendChild(card);
  }
  card.querySelector('video').srcObject = stream;
  card.classList.toggle('has-video', participant.media?.video !== false && stream.getVideoTracks().some((t) => t.readyState === 'live'));
  card.querySelector('.mini-status').classList.toggle('off', participant.media?.audio === false);
}

function updateRemoteCard(peerId) {
  const card = document.querySelector(`[data-peer-card="${CSS.escape(peerId)}"]`);
  const participant = app.participants.get(peerId);
  if (!card || !participant) return;
  card.classList.toggle('has-video', participant.media?.video !== false);
  card.querySelector('.mini-status').classList.toggle('off', participant.media?.audio === false);
}

async function pollPlayer(force) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'APS_SEND_TO_TAB', payload: { type: 'APS_PLAYER_PING' } });
    if (response?.tabId) app.activeTabId = response.tabId;
    if (response?.ok && response.result) handlePlayerStatus(response.result, force);
    else if (force) handlePlayerStatus({ ready: false, serviceLabel: 'Open a supported video' });
  } catch {
    if (force) handlePlayerStatus({ ready: false, serviceLabel: 'Open a supported video' });
  }
}

function handlePlayerStatus(status) {
  if (!status) return;
  app.player = { ...app.player, ...status };
  renderPlayer();
}

function handleLocalPlayerEvent(event) {
  handlePlayerStatus(event);
  if (!app.roomCode || !(app.isHost || app.sharedControls)) return;
  const actionMap = { play: 'play', pause: 'pause', seek: 'seek', seeking: 'seek', rate: 'sync' };
  const kind = actionMap[event.action];
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

function renderPlayer() {
  const player = app.player || {};
  elements.serviceBadge.textContent = player.serviceLabel?.toUpperCase() || 'OPEN A SUPPORTED VIDEO';
  elements.mediaTitle.textContent = player.title || 'Open Netflix, Prime Video or ZEE5';
  elements.currentTimeText.textContent = formatTime(player.currentTime || 0);
  elements.durationText.textContent = formatTime(player.duration || 0);
  const progress = player.duration > 0 ? Math.min(100, Math.max(0, player.currentTime / player.duration * 100)) : 0;
  elements.timelineFill.style.width = `${progress}%`;
  elements.timeline.setAttribute('aria-valuemax', String(Math.floor(player.duration || 0)));
  elements.timeline.setAttribute('aria-valuenow', String(Math.floor(player.currentTime || 0)));
  elements.timeline.setAttribute('aria-valuetext', `${formatTime(player.currentTime || 0)} of ${formatTime(player.duration || 0)}`);
  elements.playPauseIcon.innerHTML = player.paused === false ? ICONS.pause : ICONS.play;
  elements.playPauseBtn.title = player.paused === false ? 'Pause' : 'Play';

  if (player.ready) {
    setSyncState('synced', app.roomCode ? 'Connected' : 'Ready');
  } else {
    setSyncState('waiting', 'Waiting');
  }
  updateControlPermissions();
}

async function togglePlayPause() {
  if (!app.player?.ready) return toast('Open a movie first.', 'error');
  const kind = app.player.paused === false ? 'pause' : 'play';
  await sendLocalControl({ kind, time: app.player.currentTime || 0 });
}

async function sendLocalControl(command) {
  if (!(app.isHost || app.sharedControls)) return toast('Only the host can control playback.', 'error');
  const response = await chrome.runtime.sendMessage({ type: 'APS_SEND_TO_TAB', payload: { type: 'APS_PLAYER_COMMAND', command } });
  if (!response?.ok || response.result?.ok === false) {
    toast(response?.error || response?.result?.error || 'Could not control this player.', 'error');
    return;
  }
  if (response.result?.status) handlePlayerStatus(response.result.status);
  const current = response.result?.status || app.player;
  const outbound = {
    ...command,
    time: Number.isFinite(current?.currentTime) ? current.currentTime : command.time,
    paused: current?.paused,
    rate: current?.playbackRate || 1,
    title: current?.title,
    service: current?.service
  };
  if (command.kind === 'skip') outbound.kind = 'seek';
  broadcastPlayback(outbound);
}

function broadcastPlayback(command) {
  if (!app.roomCode) return;
  const payload = {
    type: 'playback',
    command: {
      ...command,
      sentAt: Date.now(),
      commandId: crypto.randomUUID()
    }
  };
  app.lastHostState = payload.command;
  sendSocket(payload);
}


function seekFromTimeline(event) {
  if (!(app.isHost || app.sharedControls) || !app.player?.ready || !app.player?.duration) return;
  const rect = elements.timeline.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  sendLocalControl({ kind: 'seek', time: ratio * app.player.duration });
}

function seekTimelineWithKeyboard(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (!(app.isHost || app.sharedControls) || !app.player?.ready) return;
  let time = app.player.currentTime || 0;
  if (event.key === 'ArrowLeft') time -= 10;
  if (event.key === 'ArrowRight') time += 10;
  if (event.key === 'Home') time = 0;
  if (event.key === 'End') time = app.player.duration || time;
  sendLocalControl({ kind: 'seek', time: Math.max(0, Math.min(app.player.duration || time, time)) });
}

function normalizeMediaTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(netflix|prime video|amazon|zee5|watch|episode|season|official)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titlesClearlyConflict(localTitle, remoteTitle) {
  const local = normalizeMediaTitle(localTitle);
  const remote = normalizeMediaTitle(remoteTitle);
  if (local.length < 4 || remote.length < 4) return false;
  if (local.includes(remote) || remote.includes(local)) return false;
  const localTokens = new Set(local.split(/\s+/).filter((token) => token.length > 2));
  const remoteTokens = new Set(remote.split(/\s+/).filter((token) => token.length > 2));
  if (!localTokens.size || !remoteTokens.size) return false;
  const overlap = [...localTokens].filter((token) => remoteTokens.has(token)).length;
  return overlap === 0;
}

async function applyRemotePlayback(message) {
  if (message.fromId === app.selfId) return;
  const command = message.command;
  app.lastHostState = command;

  if (app.player?.ready && command.service && app.player.service && command.service !== app.player.service) {
    setSyncState('error', 'Wrong service');
    toast(`The host is using ${command.service}. Open the same streaming service.`, 'error');
    return;
  }
  if (app.player?.ready && titlesClearlyConflict(app.player.title, command.title)) {
    setSyncState('error', 'Different title');
    toast(`Open the same movie or episode as the host: ${command.title || 'host title'}.`, 'error');
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'APS_SEND_TO_TAB', payload: { type: 'APS_PLAYER_COMMAND', command } });
  if (!response?.ok || response.result?.ok === false) {
    setSyncState('error', 'Needs attention');
    toast(response?.result?.error || response?.error || 'Open the same movie and click Play once.', 'error');
    return;
  }
  if (response.result?.status) handlePlayerStatus(response.result.status);
  setSyncState('synced', 'In sync');
}

function forceResync() {
  if (!app.isHost || !app.player?.ready) return;
  broadcastPlayback({
    kind: 'sync',
    time: app.player.currentTime || 0,
    paused: app.player.paused !== false,
    rate: app.player.playbackRate || 1,
    title: app.player.title,
    service: app.player.service
  });
  toast('Resync sent to everyone.', 'success');
}

function startHeartbeat() {
  clearInterval(app.heartbeatTimer);
  app.heartbeatTimer = setInterval(() => {
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

function updateSharedControls() {
  if (!app.isHost) return;
  app.sharedControls = elements.sharedControlsToggle.checked;
  sendSocket({ type: 'control-policy', everyoneCanControl: app.sharedControls });
  updateControlPermissions();
}

function updateRoomLock() {
  if (!app.isHost) return;
  app.roomLocked = elements.roomLockToggle.checked;
  sendSocket({ type: 'room-lock', locked: app.roomLocked });
}

function updateParticipantUI() {
  const count = app.participants.size || 1;
  elements.participantCount.textContent = `${count} participant${count === 1 ? '' : 's'}`;
  elements.peopleCountPill.textContent = String(count);
  renderPeople();
}

function renderPeople() {
  const participants = [...app.participants.values()].sort((a, b) => {
    if (a.id === app.hostId) return -1;
    if (b.id === app.hostId) return 1;
    return a.name.localeCompare(b.name);
  });
  elements.peopleList.innerHTML = participants.map((participant) => {
    const isSelf = participant.id === app.selfId;
    const isHost = participant.id === app.hostId;
    const media = isSelf ? app.mediaEnabled : (participant.media || {});
    const status = isSelf ? 'You' : connectionText(participant.connectionState);
    return `<div class="person-row">
      <div class="person-main">
        <div class="person-avatar">${escapeHtml(initialOf(participant.name))}</div>
        <div class="person-copy"><strong>${escapeHtml(participant.name)}${isSelf ? ' (you)' : ''}</strong><small>${isHost ? 'Host · ' : ''}${status}</small></div>
      </div>
      <div class="person-icons" aria-label="Media status">
        <span style="opacity:${media.audio === false ? .3 : 1}">${ICONS.micSmall}</span>
        <span style="opacity:${media.video === false ? .3 : 1}">${ICONS.cameraSmall}</span>
      </div>
    </div>`;
  }).join('');
}

function connectionText(state) {
  if (state === 'connected') return 'Connected';
  if (state === 'connecting' || state === 'new') return 'Connecting';
  if (state === 'failed') return 'Connection issue';
  return 'In room';
}

function sendChat(event) {
  event.preventDefault();
  const text = elements.chatInput.value.trim().slice(0, 500);
  if (!text || !app.roomCode) return;
  sendSocket({ type: 'chat', text });
  elements.chatInput.value = '';
}

function appendMessage(message) {
  if (!message) return;
  const self = message.senderId === app.selfId;
  const wrapper = document.createElement('div');
  wrapper.className = `message ${self ? 'self' : ''}`;
  wrapper.innerHTML = `<div class="message-bubble"><span class="message-name">${escapeHtml(self ? 'You' : message.senderName || 'Friend')}</span>${escapeHtml(message.text)}</div>`;
  elements.messages.appendChild(wrapper);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  if (!self && app.activeTab !== 'chat') {
    app.unread += 1;
    elements.unreadPill.textContent = String(app.unread);
    elements.unreadPill.classList.remove('hidden');
  }
}

function sendReaction(emoji) {
  if (!app.roomCode) return;
  showReaction(emoji);
  sendSocket({ type: 'reaction', emoji });
}

function showReaction(emoji) {
  const node = document.createElement('div');
  node.className = 'flying-reaction';
  node.textContent = emoji;
  node.style.left = `${15 + Math.random() * 70}%`;
  node.style.setProperty('--drift', `${-45 + Math.random() * 90}px`);
  elements.reactionLayer.appendChild(node);
  setTimeout(() => node.remove(), 2900);
}

function setTab(tab) {
  app.activeTab = tab;
  elements.peopleTabBtn.classList.toggle('active', tab === 'people');
  elements.chatTabBtn.classList.toggle('active', tab === 'chat');
  elements.peoplePanel.classList.toggle('active', tab === 'people');
  elements.chatPanel.classList.toggle('active', tab === 'chat');
  if (tab === 'chat') {
    app.unread = 0;
    elements.unreadPill.classList.add('hidden');
    elements.chatInput.focus();
  }
}

async function startCinemaMode() {
  if (!app.roomCode || app.cinemaStarting) return;
  app.cinemaStarting = true;
  elements.cinemaModeBtn.disabled = true;
  elements.cinemaModeBtn.querySelector('span').textContent = 'Opening…';
  await chrome.storage.local.set({
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    }
  });
  const response = await chrome.runtime.sendMessage({ type: 'APS_OPEN_CINEMA', roomCode: app.roomCode });
  if (!response?.ok) {
    app.cinemaStarting = false;
    elements.cinemaModeBtn.disabled = false;
    elements.cinemaModeBtn.querySelector('span').textContent = 'Cinema';
    toast(response?.error || 'Could not open Cinema Mode.', 'error');
    return;
  }
  toast('Cinema Mode is opening. The full panel will hide automatically.', 'success');
  setTimeout(() => {
    if (!app.cinemaStarting) return;
    app.cinemaStarting = false;
    elements.cinemaModeBtn.disabled = false;
    elements.cinemaModeBtn.querySelector('span').textContent = 'Cinema';
    toast('Cinema Mode took too long. Try again.', 'error');
  }, 15000);
}

async function completeCinemaHandoff() {
  if (!app.cinemaStarting) return;
  app.cinemaStarting = false;
  app.handoffToCinema = true;
  app.intentionallyLeft = true;
  elements.cinemaModeBtn.disabled = true;
  for (const pc of app.peerConnections.values()) pc.close();
  app.peerConnections.clear();
  stopLocalMedia();
  if (app.socket) app.socket.close();
  const response = await chrome.runtime.sendMessage({ type: 'APS_CLOSE_SIDE_PANEL', tabId: app.activeTabId });
  if (!response?.ok) {
    toast('Cinema Mode is ready. Close the side panel with the × button.', 'success');
  }
}

async function copyInvite() {
  const code = formatRoomCode(app.roomCode);
  try {
    await navigator.clipboard.writeText(`Join my APS Watch Together room: ${code}`);
    toast('Room code copied.', 'success');
  } catch {
    toast(`Room code: ${code}`);
  }
}

function leaveRoom() {
  app.intentionallyLeft = true;
  sendSocket({ type: 'leave-room' });
  app.socket?.close();
  clearInterval(app.heartbeatTimer);
  app.roomCode = '';
  app.hostId = '';
  app.selfId = '';
  app.isHost = false;
  app.participants.clear();
  for (const pc of app.peerConnections.values()) pc.close();
  app.peerConnections.clear();
  app.remoteStreams.clear();
  document.querySelectorAll('[data-peer-card]').forEach((node) => node.remove());
  chrome.storage.local.remove(['apsActiveRoom', 'apsRestoreRoom']);
  setView('setup');
  updateConnectionUI();
}

function updateConnectionUI() {
  const captions = {
    online: app.roomCode ? 'Connected securely' : 'Connected to room service',
    connecting: 'Connecting securely…',
    offline: app.roomCode ? 'Connection interrupted' : 'Private watch room',
    error: 'Server connection issue'
  };
  elements.connectionCaption.textContent = captions[app.socketState] || captions.offline;
}

function setSyncState(kind, label) {
  elements.syncBadge.className = `sync-badge ${kind}`;
  elements.syncBadge.innerHTML = `<span></span>${escapeHtml(label)}`;
}

function setBusy(busy, label = '') {
  elements.createRoomBtn.disabled = busy;
  elements.joinRoomBtn.disabled = busy;
  if (busy && label) elements.createRoomBtn.lastChild.textContent = ` ${label}`;
  else elements.createRoomBtn.lastChild.textContent = ' Create private room';
}

function setView(view) {
  elements.setupView.classList.toggle('active', view === 'setup');
  elements.roomView.classList.toggle('active', view === 'room');
}

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  elements.toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function normalizeRoomCode(value, formatted = false) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01IO]/g, '').slice(0, 8);
  return formatted && raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
function formatRoomCode(value) { return normalizeRoomCode(value, true); }
function initialOf(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }
function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

init().catch((error) => {
  console.error(error);
  toast('APS Watch Together could not start.', 'error');
});

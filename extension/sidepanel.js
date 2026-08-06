import { enumerateMediaDevices, friendlyDeviceLabel, withExactDevice, publishTrackToPeer, setAudioOutputForElements, deriveMediaMode } from './media-tools.js';
import { buildRoomInviteUrl, isScreenShareStream, inactiveScreenShare } from './collaboration-tools.js';
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

const MEDIA_MODES = {
  av: { label: 'VIDEO + AUDIO', status: 'Camera + microphone', audio: true, video: true },
  audio: { label: 'AUDIO ONLY', status: 'Microphone only', audio: true, video: false },
  video: { label: 'VIDEO ONLY', status: 'Camera only', audio: false, video: true },
  watch: { label: 'WATCH ONLY', status: 'No camera or microphone', audio: false, video: false }
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
  mediaMode: 'av',
  mediaIntent: { audio: true, video: true },
  mediaAvailable: { audio: false, video: false },
  mediaEnabled: { audio: true, video: true },
  devicePreferences: { audioinput: '', videoinput: '', audiooutput: '' },
  devices: { audioinput: [], videoinput: [], audiooutput: [] },
  deviceChangeTimer: null,
  mediaOperation: null,
  pendingMediaActivation: '',
  mediaWarnings: [],
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
  restoreInProgress: false,
  negotiationTimers: new Map(),
  pendingInvite: null,
  screenShare: inactiveScreenShare(),
  localScreenStream: null,
  remoteScreenStreams: new Map(),
  peerStreamRegistry: new Map(),
  screenSenders: new Map(),
  screenViewHidden: false,
  screenOperation: false,
  stoppingScreenShare: false,
  focusedParticipantId: '',
  presentationMaximized: false,
  waitingRoom: false,
  waitingParticipants: []
};

const elements = {
  setupView: $('#setupView'), roomView: $('#roomView'), displayName: $('#displayName'), roomCodeInput: $('#roomCodeInput'), inviteReadyBanner: $('#inviteReadyBanner'), inviteReadyCode: $('#inviteReadyCode'),
  mediaModeChoices: $('#mediaModeChoices'), mediaModeStatus: $('#mediaModeStatus'), mediaModeHint: $('#mediaModeHint'), preJoinCameraBtn: $('#preJoinCameraBtn'), preJoinMicBtn: $('#preJoinMicBtn'), preJoinCameraStatus: $('#preJoinCameraStatus'), preJoinMicStatus: $('#preJoinMicStatus'),
  createRoomBtn: $('#createRoomBtn'), joinRoomBtn: $('#joinRoomBtn'), openSettingsBtn: $('#openSettingsBtn'),
  connectionCaption: $('#connectionCaption'), roomCodeText: $('#roomCodeText'), copyRoomCodeBtn: $('#copyRoomCodeBtn'), shareInviteBtn: $('#shareInviteBtn'),
  roleBadge: $('#roleBadge'), leaveRoomBtn: $('#leaveRoomBtn'), serviceBadge: $('#serviceBadge'), syncBadge: $('#syncBadge'),
  mediaTitle: $('#mediaTitle'), currentTimeText: $('#currentTimeText'), durationText: $('#durationText'), timeline: $('#timeline'), timelineFill: $('#timelineFill'),
  rewindBtn: $('#rewindBtn'), playPauseBtn: $('#playPauseBtn'), playPauseIcon: $('#playPauseIcon'), forwardBtn: $('#forwardBtn'),
  resyncBtn: $('#resyncBtn'), playerMessage: $('#playerMessage'), openHostMovieBtn: $('#openHostMovieBtn'), participantCount: $('#participantCount'), peopleCountPill: $('#peopleCountPill'),
  videoGrid: $('#videoGrid'), localVideoCard: $('#localVideoCard'), localVideo: $('#localVideo'), localFallback: $('#localFallback'), localInitial: $('#localInitial'),
  cinemaModeBtn: $('#cinemaModeBtn'), screenShareBtn: $('#screenShareBtn'), screenStage: $('#screenStage'), screenVideo: $('#screenVideo'), screenFallback: $('#screenFallback'), screenPresenterName: $('#screenPresenterName'), screenStatusText: $('#screenStatusText'), screenFitBtn: $('#screenFitBtn'), screenFullscreenBtn: $('#screenFullscreenBtn'), screenViewToggleBtn: $('#screenViewToggleBtn'), screenStopBtn: $('#screenStopBtn'), screenHiddenBar: $('#screenHiddenBar'), screenHiddenText: $('#screenHiddenText'), callSettingsBtn: $('#callSettingsBtn'), closeCallSettingsBtn: $('#closeCallSettingsBtn'), callSettingsPanel: $('#callSettingsPanel'), deviceStatusBanner: $('#deviceStatusBanner'), deviceStatusText: $('#deviceStatusText'), cameraDeviceSelect: $('#cameraDeviceSelect'), micDeviceSelect: $('#micDeviceSelect'), speakerDeviceSelect: $('#speakerDeviceSelect'), speakerDeviceField: $('#speakerDeviceField'), callQualitySelect: $('#callQualitySelect'), refreshDevicesBtn: $('#refreshDevicesBtn'), applyDevicesBtn: $('#applyDevicesBtn'), toggleMicBtn: $('#toggleMicBtn'), toggleCameraBtn: $('#toggleCameraBtn'), localMicState: $('#localMicState'), localModeLabel: $('#localModeLabel'), peopleTabBtn: $('#peopleTabBtn'),
  chatTabBtn: $('#chatTabBtn'), peoplePanel: $('#peoplePanel'), chatPanel: $('#chatPanel'), peopleList: $('#peopleList'), galleryViewBtn: $('#galleryViewBtn'), unreadPill: $('#unreadPill'),
  sharedControlsToggle: $('#sharedControlsToggle'), roomLockToggle: $('#roomLockToggle'), waitingRoomToggle: $('#waitingRoomToggle'), waitingRoomList: $('#waitingRoomList'), chatForm: $('#chatForm'), chatInput: $('#chatInput'), messages: $('#messages'),
  toastRegion: $('#toastRegion'), reactionLayer: $('#reactionLayer')
};

async function init() {
  const stored = await chrome.storage.local.get(['apsSettings', 'apsProfile', 'apsActiveRoom', 'apsRestoreRoom', 'apsMediaMode', 'apsDevicePreferences', 'apsMediaIntent', 'apsPendingInvite', 'apsScreenViewPreferences']);
  app.settings = stored.apsSettings || {};
  app.profile = stored.apsProfile || { displayName: '', avatarSeed: crypto.randomUUID() };
  app.devicePreferences = { ...app.devicePreferences, ...(stored.apsDevicePreferences || {}) };
  app.screenViewHidden = Boolean(stored.apsScreenViewPreferences?.hidden);
  app.mediaIntent = stored.apsMediaIntent || mediaIntentForMode(stored.apsMediaMode || stored.apsActiveRoom?.mediaMode || 'av');
  setMediaIntent(app.mediaIntent, false);
  elements.displayName.value = app.profile.displayName || '';
  elements.localInitial.textContent = initialOf(app.profile.displayName || 'You');

  bindEvents();
  setupDeviceMonitoring();
  await refreshDeviceList({ quiet: true });
  setView('setup');
  updateConnectionUI();
  await pollPlayer(true);
  app.statusPollTimer = setInterval(() => pollPlayer(false), 1400);

  const restore = stored.apsRestoreRoom;
  const active = stored.apsActiveRoom;
  const validRestore = restore?.roomCode && restore.expiresAt > Date.now() && active?.roomCode === restore.roomCode;
  const invite = stored.apsPendingInvite;
  if (!validRestore && invite?.roomCode && invite.expiresAt > Date.now()) {
    app.pendingInvite = invite;
    elements.roomCodeInput.value = formatRoomCode(invite.roomCode);
    elements.inviteReadyCode.textContent = formatRoomCode(invite.roomCode);
    elements.inviteReadyBanner.hidden = false;
    if (app.profile.displayName) {
      setTimeout(() => beginRoomFlow('join'), 420);
    } else {
      elements.displayName.focus();
    }
  }
  if (validRestore) {
    app.restoreInProgress = true;
    setMediaIntent(stored.apsMediaIntent || mediaIntentForMode(active.mediaMode || stored.apsMediaMode || 'av'), false);
    app.pendingJoin = { mode: 'join', roomCode: restore.roomCode, mediaMode: app.mediaMode };
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
  elements.mediaModeChoices.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-media-kind]');
    if (!choice) return;
    const kind = choice.dataset.mediaKind;
    setMediaIntent({ ...app.mediaIntent, [kind === 'audio' ? 'audio' : 'video']: !app.mediaIntent[kind === 'audio' ? 'audio' : 'video'] }, true);
  });
  elements.openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  elements.copyRoomCodeBtn.addEventListener('click', copyRoomCode);
  elements.shareInviteBtn.addEventListener('click', shareRoomInvite);
  elements.leaveRoomBtn.addEventListener('click', leaveRoom);
  elements.playPauseBtn.addEventListener('click', togglePlayPause);
  elements.rewindBtn.addEventListener('click', () => sendLocalControl({ kind: 'skip', amount: -10 }));
  elements.forwardBtn.addEventListener('click', () => sendLocalControl({ kind: 'skip', amount: 10 }));
  elements.resyncBtn.addEventListener('click', forceResync);
  elements.openHostMovieBtn.addEventListener('click', openHostMovie);
  elements.timeline.addEventListener('click', seekFromTimeline);
  elements.timeline.addEventListener('keydown', seekTimelineWithKeyboard);
  elements.cinemaModeBtn.addEventListener('click', startCinemaMode);
  elements.screenShareBtn.addEventListener('click', toggleScreenShare);
  elements.screenFitBtn.addEventListener('click', togglePresentationMaximize);
  elements.screenFullscreenBtn.addEventListener('click', enterPresentationFullscreen);
  elements.screenViewToggleBtn.addEventListener('click', toggleScreenView);
  elements.screenHiddenBar.addEventListener('click', toggleScreenView);
  elements.screenStopBtn.addEventListener('click', () => stopScreenShare(true));
  elements.callSettingsBtn.addEventListener('click', toggleCallSettings);
  elements.closeCallSettingsBtn.addEventListener('click', () => toggleCallSettings(false));
  elements.refreshDevicesBtn.addEventListener('click', () => refreshDeviceList({ announce: true }));
  elements.applyDevicesBtn.addEventListener('click', applySelectedDevices);
  elements.cameraDeviceSelect.addEventListener('change', () => rememberSelectedDevices());
  elements.micDeviceSelect.addEventListener('change', () => rememberSelectedDevices());
  elements.speakerDeviceSelect.addEventListener('change', applyAudioOutputSelection);
  elements.callQualitySelect.addEventListener('change', () => { app.settings.videoQuality = elements.callQualitySelect.value; });
  elements.toggleMicBtn.addEventListener('click', toggleMicrophone);
  elements.toggleCameraBtn.addEventListener('click', toggleCamera);
  elements.videoGrid.addEventListener('click', handleVideoGridClick);
  elements.galleryViewBtn.addEventListener('click', clearParticipantFocus);
  elements.peopleList.addEventListener('click', handlePeopleAction);
  elements.peopleTabBtn.addEventListener('click', () => setTab('people'));
  elements.chatTabBtn.addEventListener('click', () => setTab('chat'));
  elements.sharedControlsToggle.addEventListener('change', updateSharedControls);
  elements.roomLockToggle.addEventListener('change', updateRoomLock);
  elements.waitingRoomToggle.addEventListener('change', updateWaitingRoomPolicy);
  elements.waitingRoomList.addEventListener('click', handleWaitingAction);
  elements.chatForm.addEventListener('submit', sendChat);
  $$('.reaction-row button').forEach((button) => button.addEventListener('click', () => sendReaction(button.dataset.reaction)));

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'APS_MEDIA_PERMISSION_GRANTED') {
      app.permissionTabOpen = false;
      if (app.pendingMediaActivation && app.roomCode) {
        const kind = app.pendingMediaActivation;
        app.pendingMediaActivation = '';
        if (message.cancelled || message.mediaMode === 'watch') {
          toast(`${kind === 'video' ? 'Camera' : 'Microphone'} remains off. You can try again anytime.`, 'error');
          return;
        }
        activateMediaKind(kind).catch((error) => toast(describeMediaError(error), 'error'));
      } else {
        if (message.mediaMode && MEDIA_MODES[message.mediaMode]) setMediaIntent(mediaIntentForMode(message.mediaMode), true);
        resumeRoomFlowAfterPermission();
      }
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
    stopScreenShare(false);
    stopLocalMedia();
    navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  });
}

function mediaIntentForMode(mode) {
  const config = MEDIA_MODES[MEDIA_MODES[mode] ? mode : 'av'];
  return { audio: config.audio, video: config.video };
}

function setMediaIntent(intent, persist = true) {
  app.mediaIntent = { audio: Boolean(intent?.audio), video: Boolean(intent?.video) };
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  if (!app.roomCode) app.mediaEnabled = { ...app.mediaIntent };
  const labels = [];
  if (app.mediaIntent.video) labels.push('camera');
  if (app.mediaIntent.audio) labels.push('microphone');
  elements.mediaModeStatus.textContent = labels.length ? `${labels.join(' and ')} on` : 'Watch only';
  elements.mediaModeHint.textContent = labels.length
    ? 'Turn either one off now, or change devices at any time after joining.'
    : 'You can still watch in sync, chat and see or hear friends.';
  updatePreJoinDeviceButton(elements.preJoinCameraBtn, elements.preJoinCameraStatus, 'video');
  updatePreJoinDeviceButton(elements.preJoinMicBtn, elements.preJoinMicStatus, 'audio');
  if (persist) chrome.storage.local.set({ apsMediaMode: app.mediaMode, apsMediaIntent: app.mediaIntent });
}

function updatePreJoinDeviceButton(button, statusElement, kind) {
  if (!button || !statusElement) return;
  const enabled = app.mediaIntent[kind === 'audio' ? 'audio' : 'video'];
  button.classList.toggle('active', enabled);
  button.setAttribute('aria-pressed', String(enabled));
  const devices = kind === 'video' ? app.devices.videoinput : app.devices.audioinput;
  const selectedId = kind === 'video' ? app.devicePreferences.videoinput : app.devicePreferences.audioinput;
  const selected = devices.find((device) => device.deviceId === selectedId) || devices[0];
  statusElement.textContent = enabled
    ? (selected ? `On · ${friendlyDeviceLabel(selected, devices.indexOf(selected), kind === 'video' ? 'Camera' : 'Microphone')}` : `On · connect ${kind === 'video' ? 'camera' : 'microphone'}`)
    : 'Off';
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
  await chrome.storage.local.set({ apsProfile: app.profile, apsMediaMode: app.mediaMode, apsMediaIntent: app.mediaIntent, apsDevicePreferences: app.devicePreferences });
  elements.localInitial.textContent = initialOf(displayName);
  app.pendingJoin = { mode, roomCode, mediaMode: app.mediaMode };
  app.intentionallyLeft = false;

  setBusy(true, mode === 'create' ? 'Creating…' : 'Joining…');
  try {
    await ensureLocalMedia(app.mediaMode);
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
  return Boolean(error?.apsPermissionError)
    || ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)
    || /permission|not allowed|dismissed|denied/i.test(String(error?.message || ''));
}

function describeMediaError(error) {
  if (error?.name === 'NotReadableError') return 'A selected camera or microphone is being used by another app. Close FaceTime, Zoom or Teams and try again.';
  if (error?.name === 'OverconstrainedError') return 'The selected camera quality is unavailable. Choose 720p in Settings and try again.';
  return error?.message || 'The selected call devices could not be started.';
}

async function openMediaPermissionTab(mode = app.mediaMode) {
  setBusy(false);
  if (app.permissionTabOpen) {
    toast('Complete the camera or microphone permission tab, then return here.', 'error');
    return;
  }
  app.permissionTabOpen = true;
  try {
    const url = new URL(chrome.runtime.getURL('request-permissions.html'));
    url.searchParams.set('mode', mode);
    url.searchParams.set('purpose', app.roomCode ? 'activate' : 'join');
    await chrome.tabs.create({ url: url.href, active: true });
    toast('A permission tab opened. Allow the selected call devices or continue in Watch only mode.', 'success');
  } catch (error) {
    app.permissionTabOpen = false;
    toast(error?.message || 'Could not open the permission page.', 'error');
  }
}

async function resumeRoomFlowAfterPermission() {
  if (!app.pendingJoin) return;
  app.pendingJoin.mediaMode = app.mediaMode;
  setBusy(true, app.pendingJoin.mode === 'create' ? 'Creating…' : 'Joining…');
  try {
    await ensureLocalMedia(app.mediaMode);
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
      capabilities: { playback: true, audio: app.mediaEnabled.audio, video: app.mediaEnabled.video, chat: true, screenShare: true, inviteLinks: true }
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
    case 'participant-replaced':
      removeParticipant(message.oldParticipantId);
      addParticipant(message.participant);
      if (message.participant.id !== app.selfId) await createPeerOffer(message.participant.id);
      break;
    case 'session-replaced':
      toast('This older APS view was replaced by your newer window.', 'success');
      app.intentionallyLeft = true;
      app.socket?.close();
      break;
    case 'removed-from-room':
      toast(message.reason || 'The host removed you from the room.', 'error');
      leaveRoom();
      break;
    case 'host-mute':
      forceLocalMute(message.byName || 'The host');
      break;
    case 'ask-to-unmute':
      showAskToUnmute(message.byName || 'The host');
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
    case 'waiting-room':
      showWaitingOverlay(message.message || 'Waiting for the host to admit you.');
      break;
    case 'waiting-rejected':
      hideWaitingOverlay();
      setBusy(false);
      toast(message.message || 'The host did not admit the request.', 'error');
      app.roomCode = '';
      break;
    case 'waiting-update':
      app.waitingParticipants = Array.isArray(message.waiting) ? message.waiting : [];
      renderWaitingRoom();
      if (app.waitingParticipants.length) toast(`${app.waitingParticipants.length} friend${app.waitingParticipants.length === 1 ? '' : 's'} waiting to join.`, 'success');
      break;
    case 'entry-policy':
      app.waitingRoom = Boolean(message.waitingRoom);
      elements.waitingRoomToggle.checked = app.waitingRoom;
      break;
    case 'room-lock':
      app.roomLocked = Boolean(message.locked);
      elements.roomLockToggle.checked = app.roomLocked;
      toast(app.roomLocked ? 'The room is now locked.' : 'The room is open for invited friends.');
      break;
    case 'screen-share-state':
      handleScreenShareState(message.screenShare);
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
      if (/screen.*already|already.*screen|presenting/i.test(String(message.message || '')) && app.localScreenStream) stopScreenShare(false);
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
  app.waitingRoom = Boolean(message.waitingRoom);
  app.waitingParticipants = Array.isArray(message.waiting) ? message.waiting : [];
  app.screenShare = message.screenShare || inactiveScreenShare();
  for (const pc of app.peerConnections.values()) pc.close();
  app.peerConnections.clear();
  app.remoteStreams.clear();
  app.remoteScreenStreams.clear();
  app.peerStreamRegistry.clear();
  app.screenSenders.clear();
  app.screenShare = inactiveScreenShare();
  updateScreenShareUI();
  document.querySelectorAll('[data-peer-card]').forEach((node) => node.remove());
  app.participants.clear();
  for (const participant of message.participants || []) addParticipant(participant, false);
  if (!app.participants.has(app.selfId)) {
    addParticipant({ id: app.selfId, name: app.profile.displayName, media: { ...app.mediaEnabled } }, false);
  }
  app.pendingJoin = null;
  app.pendingInvite = null;
  chrome.storage.local.remove('apsPendingInvite');
  elements.inviteReadyBanner.hidden = true;
  app.intentionallyLeft = false;
  elements.roomCodeText.textContent = formatRoomCode(app.roomCode);
  elements.sharedControlsToggle.checked = app.sharedControls;
  elements.roomLockToggle.checked = app.roomLocked;
  elements.waitingRoomToggle.checked = app.waitingRoom;
  hideWaitingOverlay();
  renderWaitingRoom();
  setBusy(false);
  setView('room');
  updateRole();
  updateParticipantUI();
  updateScreenShareUI();
  startHeartbeat();
  toast(message.type === 'room-created' ? 'Private room created.' : 'Joined the watch room.', 'success');
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
  if (app.restoreInProgress) {
    app.restoreInProgress = false;
    chrome.storage.local.remove('apsRestoreRoom');
    chrome.runtime.sendMessage({ type: 'APS_PANEL_RESTORED', roomCode: app.roomCode }).catch(() => undefined);
  }

  for (const participant of app.participants.values()) {
    if (participant.id !== app.selfId) createPeerOffer(participant.id);
  }
  sendSocket({ type: 'media-state', media: app.mediaEnabled });
  applyLocalMediaState(false);
  refreshDeviceList({ quiet: true }).then(applyAudioOutputSelection).catch(() => undefined);
  if (app.mediaWarnings.length) {
    toast(app.mediaWarnings.join(' '), app.mediaAvailable.audio || app.mediaAvailable.video ? 'success' : 'error');
    app.mediaWarnings = [];
  }
}

function updateRoomState(message) {
  if (Object.prototype.hasOwnProperty.call(message, 'hostId')) app.hostId = message.hostId;
  app.sharedControls = Boolean(message.everyoneCanControl);
  app.roomLocked = Boolean(message.locked);
  if (Object.prototype.hasOwnProperty.call(message, 'waitingRoom')) app.waitingRoom = Boolean(message.waitingRoom);
  if (Array.isArray(message.waiting)) app.waitingParticipants = message.waiting;
  if (message.screenShare) handleScreenShareState(message.screenShare, false);
  elements.sharedControlsToggle.checked = app.sharedControls;
  elements.roomLockToggle.checked = app.roomLocked;
  elements.waitingRoomToggle.checked = app.waitingRoom;
  renderWaitingRoom();
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
  clearTimeout(app.negotiationTimers.get(participantId));
  app.negotiationTimers.delete(participantId);
  app.remoteStreams.delete(participantId);
  app.remoteScreenStreams.delete(participantId);
  app.peerStreamRegistry.delete(participantId);
  app.screenSenders.delete(participantId);
  document.querySelector(`[data-peer-card="${CSS.escape(participantId)}"]`)?.remove();
  updateParticipantUI();
}

function updateRole() {
  app.isHost = app.selfId && app.selfId === app.hostId;
  elements.roleBadge.textContent = app.isHost ? 'HOST' : 'GUEST';
  elements.roleBadge.className = `badge ${app.isHost ? 'host' : 'guest'}`;
  elements.sharedControlsToggle.disabled = !app.isHost;
  elements.roomLockToggle.disabled = !app.isHost;
  elements.waitingRoomToggle.disabled = !app.isHost;
  renderWaitingRoom();
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

function setupDeviceMonitoring() {
  navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
  elements.callQualitySelect.value = app.settings.videoQuality || 'hd';
  elements.speakerDeviceField.hidden = typeof HTMLMediaElement.prototype.setSinkId !== 'function';
}

function handleDeviceChange() {
  clearTimeout(app.deviceChangeTimer);
  app.deviceChangeTimer = setTimeout(async () => {
    const previousIds = new Set(Object.values(app.devices).flat().map((device) => `${device.kind}:${device.deviceId}`));
    await refreshDeviceList({ quiet: true });
    const nextIds = new Set(Object.values(app.devices).flat().map((device) => `${device.kind}:${device.deviceId}`));
    const added = [...nextIds].some((id) => !previousIds.has(id));
    const removed = [...previousIds].some((id) => !nextIds.has(id));
    if (added) {
      setDeviceStatus('New call device detected. APS is checking whether it should reconnect automatically.', 'ready');
      toast('New camera, microphone or headset detected.', 'success');
      if (app.roomCode) {
        if (app.mediaIntent.video && !app.mediaAvailable.video && app.devices.videoinput.length) await activateMediaKind('video', { quiet: true }).catch(() => undefined);
        if (app.mediaIntent.audio && !app.mediaAvailable.audio && app.devices.audioinput.length) await activateMediaKind('audio', { quiet: true }).catch(() => undefined);
      }
    } else if (removed) {
      setDeviceStatus('A call device was disconnected. APS kept the room active.', 'warning');
    }
  }, 350);
}

async function refreshDeviceList({ quiet = false, announce = false } = {}) {
  try {
    app.devices = await enumerateMediaDevices();
    populateDeviceSelect(elements.cameraDeviceSelect, app.devices.videoinput, app.devicePreferences.videoinput, 'Automatic camera', 'Camera');
    populateDeviceSelect(elements.micDeviceSelect, app.devices.audioinput, app.devicePreferences.audioinput, 'Automatic microphone', 'Microphone');
    populateDeviceSelect(elements.speakerDeviceSelect, app.devices.audiooutput, app.devicePreferences.audiooutput, 'System default', 'Speaker');
    updatePreJoinDeviceButton(elements.preJoinCameraBtn, elements.preJoinCameraStatus, 'video');
    updatePreJoinDeviceButton(elements.preJoinMicBtn, elements.preJoinMicStatus, 'audio');
    if (announce) toast('Call devices refreshed.', 'success');
    if (!quiet) setDeviceStatus(deviceSummaryText(), 'ready');
  } catch (error) {
    if (!quiet) setDeviceStatus(error?.message || 'Could not read connected call devices.', 'error');
  }
}

function populateDeviceSelect(select, devices, selectedId, automaticLabel, fallback) {
  if (!select) return;
  const current = selectedId || select.value || '';
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
  select.value = devices.some((device) => device.deviceId === current) ? current : '';
}

function deviceSummaryText() {
  const cameras = app.devices.videoinput.length;
  const microphones = app.devices.audioinput.length;
  const outputs = app.devices.audiooutput.length;
  return `${cameras || 'No'} camera${cameras === 1 ? '' : 's'} · ${microphones || 'No'} microphone${microphones === 1 ? '' : 's'}${outputs ? ` · ${outputs} output${outputs === 1 ? '' : 's'}` : ''}`;
}

function setDeviceStatus(message, kind = 'ready') {
  elements.deviceStatusText.textContent = message;
  elements.deviceStatusBanner.classList.toggle('warning', kind === 'warning');
  elements.deviceStatusBanner.classList.toggle('error', kind === 'error');
}

async function toggleCallSettings(force) {
  const show = typeof force === 'boolean' ? force : elements.callSettingsPanel.hidden;
  elements.callSettingsPanel.hidden = !show;
  elements.callSettingsBtn.classList.toggle('active', show);
  elements.callSettingsBtn.setAttribute('aria-expanded', String(show));
  if (show) {
    elements.callQualitySelect.value = app.settings.videoQuality || 'hd';
    await refreshDeviceList({ quiet: false });
  }
}

function rememberSelectedDevices() {
  app.devicePreferences = {
    videoinput: elements.cameraDeviceSelect.value || '',
    audioinput: elements.micDeviceSelect.value || '',
    audiooutput: elements.speakerDeviceSelect.value || ''
  };
  chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
}

async function applySelectedDevices() {
  if (app.mediaOperation) return;
  rememberSelectedDevices();
  app.settings.videoQuality = elements.callQualitySelect.value || 'hd';
  await chrome.storage.local.set({ apsSettings: app.settings });
  elements.applyDevicesBtn.disabled = true;
  elements.applyDevicesBtn.textContent = 'Applying…';
  try {
    if (app.mediaIntent.video || app.mediaAvailable.video) {
      const applied = await activateMediaKind('video', { force: true, quiet: true, preserveState: true });
      if (applied === false) { setDeviceStatus('Complete the camera permission tab, then return here.', 'warning'); return; }
    }
    if (app.mediaIntent.audio || app.mediaAvailable.audio) {
      const applied = await activateMediaKind('audio', { force: true, quiet: true, preserveState: true });
      if (applied === false) { setDeviceStatus('Complete the microphone permission tab, then return here.', 'warning'); return; }
    }
    await applyAudioOutputSelection();
    setDeviceStatus('Call devices updated without leaving the room.', 'ready');
    toast('Call devices updated.', 'success');
  } catch (error) {
    setDeviceStatus(describeMediaError(error), 'error');
    toast(describeMediaError(error), 'error');
  } finally {
    elements.applyDevicesBtn.disabled = false;
    elements.applyDevicesBtn.textContent = 'Apply changes';
  }
}

async function applyAudioOutputSelection() {
  app.devicePreferences.audiooutput = elements.speakerDeviceSelect.value || '';
  await chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
  const result = await setAudioOutputForElements(document, app.devicePreferences.audiooutput);
  if (result.unsupported) setDeviceStatus('Chrome is using the system default speaker on this device.', 'warning');
}

function videoConstraintsForQuality(deviceId = app.devicePreferences.videoinput) {
  const quality = app.settings.videoQuality || 'hd';
  const base = quality === 'fullhd'
    ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }
    : quality === 'sd'
      ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };
  return withExactDevice(base, deviceId);
}

function audioConstraints(deviceId = app.devicePreferences.audioinput) {
  return withExactDevice({
    echoCancellation: app.settings.echoCancellation !== false,
    noiseSuppression: app.settings.noiseSuppression !== false,
    autoGainControl: app.settings.autoGainControl !== false,
    channelCount: 1
  }, deviceId);
}

async function requestMediaKind(kind, deviceId) {
  const selected = deviceId ?? (kind === 'video' ? app.devicePreferences.videoinput : app.devicePreferences.audioinput);
  const constraints = kind === 'video'
    ? { video: videoConstraintsForQuality(selected), audio: false }
    : { video: false, audio: audioConstraints(selected) };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (selected && ['NotFoundError', 'OverconstrainedError'].includes(error?.name)) {
      if (kind === 'video') app.devicePreferences.videoinput = '';
      else app.devicePreferences.audioinput = '';
      await chrome.storage.local.set({ apsDevicePreferences: app.devicePreferences });
      return navigator.mediaDevices.getUserMedia(kind === 'video'
        ? { video: videoConstraintsForQuality(''), audio: false }
        : { video: false, audio: audioConstraints('') });
    }
    throw error;
  }
}

function bindLocalTrackLifecycle(kind, track) {
  track.addEventListener('ended', () => {
    const current = kind === 'audio' ? app.localStream?.getAudioTracks()[0] : app.localStream?.getVideoTracks()[0];
    if (current?.id !== track.id) return;
    app.localStream?.removeTrack(track);
    app.mediaAvailable[kind] = false;
    app.mediaEnabled[kind] = false;
    applyLocalMediaState();
    setDeviceStatus(`${kind === 'video' ? 'Camera' : 'Microphone'} disconnected. Connect another one and press the ${kind === 'video' ? 'Camera' : 'Mic'} button.`, 'warning');
  }, { once: true });
}

async function ensureLocalMedia(mode = app.mediaMode) {
  stopLocalMedia();
  const requested = MEDIA_MODES[mode] || MEDIA_MODES.av;
  app.mediaIntent = { audio: requested.audio, video: requested.video };
  app.mediaWarnings = [];
  app.mediaAvailable = { audio: false, video: false };
  app.mediaEnabled = { audio: false, video: false };

  if (!requested.audio && !requested.video) {
    app.localStream = new MediaStream();
    applyLocalMediaState(false);
    return app.localStream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    app.mediaWarnings.push('Camera and microphone access is unavailable in this browser. Joined in Watch only mode.');
    app.localStream = new MediaStream();
    applyLocalMediaState(false);
    return app.localStream;
  }

  const combined = new MediaStream();
  const permissionErrors = [];
  for (const kind of ['video', 'audio']) {
    if (!requested[kind]) continue;
    try {
      const partial = await requestMediaKind(kind);
      for (const track of partial.getTracks()) {
        combined.addTrack(track);
        bindLocalTrackLifecycle(kind, track);
      }
    } catch (error) {
      if (isMediaPermissionError(error)) permissionErrors.push(error);
      else if (error?.name === 'NotFoundError') app.mediaWarnings.push(`No ${kind === 'video' ? 'camera' : 'microphone'} was found.`);
      else if (error?.name === 'NotReadableError') app.mediaWarnings.push(`The ${kind === 'video' ? 'camera' : 'microphone'} is busy in another app.`);
      else app.mediaWarnings.push(`${kind === 'video' ? 'Camera' : 'Microphone'} unavailable: ${error?.message || 'unknown device error'}.`);
    }
  }

  if (!combined.getTracks().length && permissionErrors.length) {
    const error = new Error('Permission is required for the selected call devices.');
    error.name = 'NotAllowedError';
    error.apsPermissionError = true;
    throw error;
  }
  if (permissionErrors.length) app.mediaWarnings.push('One selected device was blocked. APS continued with the device that is available.');

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
  if (!combined.getTracks().length) app.mediaWarnings.push('No selected call device is available. Joined in Watch only mode.');
  applyLocalMediaState(false);
  await refreshDeviceList({ quiet: true });
  return combined;
}

async function activateMediaKind(kind, { force = false, quiet = false, preserveState = false } = {}) {
  if (!['audio', 'video'].includes(kind)) return;
  if (app.mediaOperation && !force) return;
  app.mediaOperation = kind;
  const button = kind === 'audio' ? elements.toggleMicBtn : elements.toggleCameraBtn;
  button.classList.add('busy');
  const desiredEnabled = preserveState ? (app.mediaAvailable[kind] ? app.mediaEnabled[kind] : app.mediaIntent[kind]) : true;
  const desiredIntent = preserveState ? app.mediaIntent[kind] : true;
  app.mediaIntent[kind] = desiredIntent;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  await chrome.storage.local.set({ apsMediaMode: app.mediaMode, apsMediaIntent: app.mediaIntent });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Chrome cannot access call devices on this computer.');
    const partial = await requestMediaKind(kind);
    const track = kind === 'audio' ? partial.getAudioTracks()[0] : partial.getVideoTracks()[0];
    if (!track) throw new Error(`No ${kind === 'video' ? 'camera' : 'microphone'} was found.`);
    await replaceLocalTrack(kind, track, desiredEnabled);
    partial.getTracks().filter((item) => item.id !== track.id).forEach((item) => item.stop());
    if (!quiet) toast(`${kind === 'video' ? 'Camera' : 'Microphone'} is now on.`, 'success');
    setDeviceStatus(`${kind === 'video' ? 'Camera' : 'Microphone'} connected and active.`, 'ready');
    await refreshDeviceList({ quiet: true });
    return true;
  } catch (error) {
    if (isMediaPermissionError(error)) {
      app.pendingMediaActivation = kind;
      await openMediaPermissionTab(kind === 'audio' ? 'audio' : 'video');
      return false;
    }
    throw error;
  } finally {
    app.mediaOperation = null;
    button.classList.remove('busy');
    applyLocalMediaState();
  }
}

async function replaceLocalTrack(kind, newTrack, enabled = true) {
  if (!app.localStream) app.localStream = new MediaStream();
  const oldTracks = kind === 'audio' ? app.localStream.getAudioTracks() : app.localStream.getVideoTracks();
  for (const oldTrack of oldTracks) app.localStream.removeTrack(oldTrack);
  app.localStream.addTrack(newTrack);
  newTrack.enabled = Boolean(enabled);
  bindLocalTrackLifecycle(kind, newTrack);

  for (const [peerId, pc] of app.peerConnections) {
    const result = await publishTrackToPeer(pc, kind, newTrack, app.localStream);
    if (result.needsNegotiation) schedulePeerNegotiation(peerId);
  }
  oldTracks.forEach((track) => track.stop());
  app.mediaAvailable[kind] = true;
  app.mediaEnabled[kind] = Boolean(enabled);
  elements.localVideo.srcObject = app.localStream;
  if (kind === 'video') elements.localVideo.play().catch(() => undefined);
  applyLocalMediaState();
}

function stopLocalMedia() {
  app.localStream?.getTracks().forEach((track) => track.stop());
  app.localStream = null;
  app.mediaAvailable = { audio: false, video: false };
  app.mediaEnabled = { audio: false, video: false };
  elements.localVideo.srcObject = null;
}

function effectiveMediaLabel() {
  if (app.mediaAvailable.audio && app.mediaAvailable.video) return MEDIA_MODES.av.label;
  if (app.mediaAvailable.audio) return MEDIA_MODES.audio.label;
  if (app.mediaAvailable.video) return MEDIA_MODES.video.label;
  return MEDIA_MODES.watch.label;
}

function applyLocalMediaState(broadcast = true) {
  const audioTracks = app.localStream?.getAudioTracks() || [];
  const videoTracks = app.localStream?.getVideoTracks() || [];
  app.mediaAvailable = {
    audio: audioTracks.some((track) => track.readyState === 'live'),
    video: videoTracks.some((track) => track.readyState === 'live')
  };
  app.mediaEnabled.audio = Boolean(app.mediaAvailable.audio && app.mediaEnabled.audio);
  app.mediaEnabled.video = Boolean(app.mediaAvailable.video && app.mediaEnabled.video);
  for (const track of audioTracks) track.enabled = app.mediaEnabled.audio;
  for (const track of videoTracks) track.enabled = app.mediaEnabled.video;

  updateMediaActionButton(elements.toggleMicBtn, 'audio');
  updateMediaActionButton(elements.toggleCameraBtn, 'video');
  elements.localVideoCard.classList.toggle('has-video', app.mediaEnabled.video && app.mediaAvailable.video);
  elements.localMicState.classList.toggle('off', !app.mediaEnabled.audio);
  elements.localModeLabel.textContent = effectiveMediaLabel();
  const self = app.participants.get(app.selfId);
  if (self) self.media = { ...app.mediaEnabled };
  if (broadcast) sendSocket({ type: 'media-state', media: app.mediaEnabled });
  if (app.roomCode) chrome.storage.local.set({
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
  renderPeople();
}

function updateMediaActionButton(button, kind) {
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

async function toggleMicrophone() {
  if (!app.mediaAvailable.audio) {
    try { await activateMediaKind('audio'); }
    catch (error) { toast(describeMediaError(error), 'error'); }
    return;
  }
  app.mediaEnabled.audio = !app.mediaEnabled.audio;
  app.mediaIntent.audio = app.mediaEnabled.audio;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  await chrome.storage.local.set({ apsMediaIntent: app.mediaIntent, apsMediaMode: app.mediaMode });
  applyLocalMediaState();
}

async function toggleCamera() {
  if (!app.mediaAvailable.video) {
    try { await activateMediaKind('video'); }
    catch (error) { toast(describeMediaError(error), 'error'); }
    return;
  }
  app.mediaEnabled.video = !app.mediaEnabled.video;
  app.mediaIntent.video = app.mediaEnabled.video;
  app.mediaMode = deriveMediaMode(app.mediaIntent);
  await chrome.storage.local.set({ apsMediaIntent: app.mediaIntent, apsMediaMode: app.mediaMode });
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

  pc.onnegotiationneeded = () => schedulePeerNegotiation(peerId);

  pc.ontrack = (event) => {
    registerRemotePeerTrack(peerId, event);
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


function schedulePeerNegotiation(peerId) {
  clearTimeout(app.negotiationTimers.get(peerId));
  const timer = setTimeout(() => {
    app.negotiationTimers.delete(peerId);
    createPeerOffer(peerId).catch((error) => console.warn('APS renegotiation failed', error));
  }, 120);
  app.negotiationTimers.set(peerId, timer);
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
  const remoteVideo = card.querySelector('video');
  remoteVideo.srcObject = stream;
  if (app.devicePreferences.audiooutput && typeof remoteVideo.setSinkId === 'function') remoteVideo.setSinkId(app.devicePreferences.audiooutput).catch(() => undefined);
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
    service: event.service,
    url: event.url || app.player?.url || ''
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
    service: current?.service,
    url: current?.url || app.player?.url || ''
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
    updateOpenHostMovieButton(command);
    return;
  }
  if (app.player?.ready && titlesClearlyConflict(app.player.title, command.title)) {
    setSyncState('error', 'Different title');
    toast(`Open the same movie or episode as the host: ${command.title || 'host title'}.`, 'error');
    updateOpenHostMovieButton(command);
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
  elements.openHostMovieBtn.hidden = true;
}

function updateOpenHostMovieButton(command) {
  const url = String(command?.url || '');
  if (!/^https:\/\//i.test(url)) { elements.openHostMovieBtn.hidden = true; return; }
  elements.openHostMovieBtn.hidden = false;
  elements.openHostMovieBtn.dataset.url = url;
  const service = String(command.service || 'movie').replace(/[-_]/g, ' ');
  elements.openHostMovieBtn.textContent = `Open on ${service}`;
}

async function openHostMovie() {
  const url = elements.openHostMovieBtn.dataset.url;
  if (!url) return;
  await chrome.tabs.create({ url });
  toast('Movie opened. Start it once, then APS will resync you.', 'success');
}

function forceResync() {
  if (!app.isHost || !app.player?.ready) return;
  broadcastPlayback({
    kind: 'sync',
    time: app.player.currentTime || 0,
    paused: app.player.paused !== false,
    rate: app.player.playbackRate || 1,
    title: app.player.title,
    service: app.player.service,
    url: app.player.url || ''
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

function updateWaitingRoomPolicy() {
  if (!app.isHost) return;
  app.waitingRoom = elements.waitingRoomToggle.checked;
  sendSocket({ type: 'entry-policy', waitingRoom: app.waitingRoom });
}

function renderWaitingRoom() {
  if (!elements.waitingRoomList) return;
  const visible = app.isHost && app.waitingParticipants.length > 0;
  elements.waitingRoomList.hidden = !visible;
  elements.waitingRoomList.innerHTML = visible ? app.waitingParticipants.map((person) => `<div class="waiting-person"><strong>${escapeHtml(person.name || 'Guest')}</strong><div class="waiting-actions"><button class="admit" data-waiting-action="admit" data-participant-id="${escapeHtml(person.id)}">Admit</button><button class="reject" data-waiting-action="reject" data-participant-id="${escapeHtml(person.id)}">Reject</button></div></div>`).join('') : '';
}

function handleWaitingAction(event) {
  const button = event.target.closest('[data-waiting-action]');
  if (!button || !app.isHost) return;
  const type = button.dataset.waitingAction === 'admit' ? 'admit-participant' : 'reject-participant';
  sendSocket({ type, participantId: button.dataset.participantId });
}

function showWaitingOverlay(message) {
  let overlay = document.querySelector('[data-waiting-overlay]');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'waiting-overlay';
    overlay.dataset.waitingOverlay = '1';
    overlay.innerHTML = `<div class="waiting-overlay-card"><div style="font-size:28px">⏳</div><h3>Waiting room</h3><p data-waiting-message></p><button type="button" data-cancel-wait>Cancel</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-cancel-wait]').addEventListener('click', () => { app.intentionallyLeft = true; app.socket?.close(); app.roomCode = ''; hideWaitingOverlay(); setBusy(false); });
  }
  overlay.querySelector('[data-waiting-message]').textContent = message;
}

function hideWaitingOverlay() { document.querySelector('[data-waiting-overlay]')?.remove(); }

function updateParticipantUI() {
  const count = app.participants.size || 1;
  elements.participantCount.textContent = `${count} participant${count === 1 ? '' : 's'}`;
  elements.peopleCountPill.textContent = String(count);
  elements.videoGrid.dataset.count = String(Math.min(count, 4));
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
    const hostActions = app.isHost && !isSelf ? `<div class="person-actions">
      <button type="button" data-person-action="${media.audio === false ? 'ask-unmute' : 'mute'}" data-participant-id="${escapeHtml(participant.id)}">${media.audio === false ? 'Ask unmute' : 'Mute'}</button>
      <button type="button" class="danger" data-person-action="remove" data-participant-id="${escapeHtml(participant.id)}">Remove</button>
    </div>` : '';
    return `<div class="person-row">
      <div class="person-main">
        <div class="person-avatar">${escapeHtml(initialOf(participant.name))}</div>
        <div class="person-copy"><strong>${escapeHtml(participant.name)}${isSelf ? ' (you)' : ''}</strong><small>${isHost ? 'Host · ' : ''}${status}</small></div>
      </div>
      <div class="person-icons" aria-label="Media status">
        <span style="opacity:${media.audio === false ? .3 : 1}">${ICONS.micSmall}</span>
        <span style="opacity:${media.video === false ? .3 : 1}">${ICONS.cameraSmall}</span>
      </div>${hostActions}
    </div>`;
  }).join('');
}

function handlePeopleAction(event) {
  const button = event.target.closest('[data-person-action]');
  if (!button || !app.isHost) return;
  const participantId = button.dataset.participantId;
  const action = button.dataset.personAction;
  if (action === 'remove') {
    if (confirm('Remove this participant from the room?')) sendSocket({ type: 'remove-participant', participantId });
  } else if (action === 'mute') sendSocket({ type: 'mute-participant', participantId });
  else if (action === 'ask-unmute') sendSocket({ type: 'ask-to-unmute', participantId });
}

function forceLocalMute(byName) {
  const track = app.localStream?.getAudioTracks?.()[0];
  if (track) track.enabled = false;
  app.mediaEnabled.audio = false;
  app.mediaIntent.audio = false;
  applyLocalMediaState(true);
  toast(`${byName} muted your microphone.`, 'error');
}

function showAskToUnmute(byName) {
  const notice = document.createElement('div');
  notice.className = 'chat-notice';
  notice.innerHTML = `<strong>${escapeHtml(byName)} asked you to unmute</strong><div style="margin-top:8px;display:flex;gap:8px"><button data-unmute-now style="flex:1">Unmute</button><button data-dismiss>Not now</button></div>`;
  document.body.appendChild(notice);
  notice.querySelector('[data-unmute-now]').addEventListener('click', async () => { notice.remove(); if (!app.mediaEnabled.audio) await toggleMicrophone(); });
  notice.querySelector('[data-dismiss]').addEventListener('click', () => notice.remove());
  setTimeout(() => notice.remove(), 12000);
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
    showMessageNotice(message);
  }
}

function showMessageNotice(message) {
  const old = document.querySelector('.chat-notice[data-chat-notice]');
  old?.remove();
  const node = document.createElement('button');
  node.type = 'button';
  node.dataset.chatNotice = '1';
  node.className = 'chat-notice';
  node.innerHTML = `<strong>${escapeHtml(message.senderName || 'Friend')}</strong><div>${escapeHtml(String(message.text || '').slice(0, 90))}</div>`;
  node.addEventListener('click', () => { node.remove(); setTab('chat'); });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 5000);
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


function registerRemotePeerTrack(peerId, event) {
  const registry = app.peerStreamRegistry.get(peerId) || new Map();
  let stream = event.streams?.[0];
  if (!stream) {
    stream = registry.get(`fallback-${event.track.kind}`) || new MediaStream();
    if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
  }
  registry.set(stream.id || `fallback-${event.track.kind}`, stream);
  app.peerStreamRegistry.set(peerId, registry);
  event.track.addEventListener('ended', () => reconcilePeerStreams(peerId), { once: true });
  reconcilePeerStreams(peerId);
}

function reconcilePeerStreams(peerId) {
  const registry = app.peerStreamRegistry.get(peerId) || new Map();
  let cameraStream = null;
  let screenStream = null;
  for (const stream of registry.values()) {
    if (isScreenShareStream(peerId, stream.id, app.screenShare)) screenStream = stream;
    else if (!cameraStream || stream.getAudioTracks().length + stream.getVideoTracks().length > cameraStream.getTracks().length) cameraStream = stream;
  }
  if (cameraStream) {
    app.remoteStreams.set(peerId, cameraStream);
    attachRemoteStream(peerId, cameraStream);
  }
  if (screenStream) app.remoteScreenStreams.set(peerId, screenStream);
  else app.remoteScreenStreams.delete(peerId);
  updateScreenShareUI();
}

function handleVideoGridClick(event) {
  const card = event.target.closest('.video-card');
  if (!card) return;
  const participantId = card.id === 'localVideoCard' ? app.selfId : card.dataset.peerCard;
  if (!participantId) return;
  if (app.focusedParticipantId === participantId) clearParticipantFocus();
  else focusParticipant(participantId);
}

function focusParticipant(participantId) {
  app.focusedParticipantId = participantId;
  elements.videoGrid.classList.add('focus-mode');
  elements.videoGrid.querySelectorAll('.video-card').forEach((card) => {
    const id = card.id === 'localVideoCard' ? app.selfId : card.dataset.peerCard;
    card.classList.toggle('focused', id === participantId);
  });
  elements.galleryViewBtn.hidden = false;
}

function clearParticipantFocus() {
  app.focusedParticipantId = '';
  elements.videoGrid.classList.remove('focus-mode');
  elements.videoGrid.querySelectorAll('.video-card').forEach((card) => card.classList.remove('focused'));
  elements.galleryViewBtn.hidden = true;
}

function togglePresentationMaximize() {
  app.presentationMaximized = !app.presentationMaximized;
  elements.screenStage.classList.toggle('presentation-maximized', app.presentationMaximized);
  elements.screenFitBtn.textContent = app.presentationMaximized ? 'Restore' : 'Maximise';
}

async function enterPresentationFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await elements.screenStage.requestFullscreen();
  } catch { toast('Chrome could not enter full screen.', 'error'); }
}

async function toggleScreenShare() {
  if (app.localScreenStream) {
    await stopScreenShare(true);
    return;
  }
  if (app.screenShare.active && app.screenShare.presenterId !== app.selfId) {
    toast(`${app.screenShare.presenterName || 'A friend'} is already presenting.`, 'error');
    return;
  }
  await startScreenShare();
}

async function startScreenShare() {
  if (app.screenOperation || !app.roomCode) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Screen sharing is unavailable in this Chrome version.', 'error');
    return;
  }
  app.screenOperation = true;
  updateScreenShareButton();
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
    app.screenShare = {
      active: true,
      presenterId: app.selfId,
      presenterName: app.profile.displayName || 'You',
      streamId: stream.id
    };
    app.screenViewHidden = false;
    videoTrack.addEventListener('ended', () => stopScreenShare(true), { once: true });
    for (const [peerId, pc] of app.peerConnections) {
      const senders = [];
      for (const track of stream.getTracks()) senders.push(pc.addTrack(track, stream));
      app.screenSenders.set(peerId, senders);
      schedulePeerNegotiation(peerId);
    }
    sendSocket({ type: 'screen-share-state', active: true, streamId: stream.id });
    updateScreenShareUI();
    toast('Screen sharing started. Choose a normal tab, window or screen; protected OTT video may appear blank.', 'success');
  } catch (error) {
    if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') toast(error?.message || 'Could not start screen sharing.', 'error');
  } finally {
    app.screenOperation = false;
    updateScreenShareButton();
  }
}

async function stopScreenShare(notifyServer = true) {
  if (app.stoppingScreenShare) return;
  app.stoppingScreenShare = true;
  const stream = app.localScreenStream;
  app.localScreenStream = null;
  for (const [peerId, senders] of app.screenSenders) {
    const pc = app.peerConnections.get(peerId);
    if (pc) {
      for (const sender of senders) {
        try { pc.removeTrack(sender); } catch { /* Peer may be closing. */ }
      }
      schedulePeerNegotiation(peerId);
    }
  }
  app.screenSenders.clear();
  stream?.getTracks().forEach((track) => track.stop());
  if (app.screenShare.presenterId === app.selfId) app.screenShare = inactiveScreenShare();
  if (notifyServer && app.roomCode) sendSocket({ type: 'screen-share-state', active: false });
  updateScreenShareUI();
  app.stoppingScreenShare = false;
}

function handleScreenShareState(nextState, announce = true) {
  const previous = app.screenShare;
  app.screenShare = nextState?.active ? {
    active: true,
    presenterId: String(nextState.presenterId || ''),
    presenterName: String(nextState.presenterName || 'Friend'),
    streamId: String(nextState.streamId || '')
  } : inactiveScreenShare();
  if (!app.screenShare.active && previous.presenterId === app.selfId && app.localScreenStream) stopScreenShare(false);
  if (app.screenShare.active) reconcilePeerStreams(app.screenShare.presenterId);
  else app.remoteScreenStreams.clear();
  updateScreenShareUI();
  if (announce && previous.active !== app.screenShare.active) {
    toast(app.screenShare.active ? `${app.screenShare.presenterName} started sharing a screen.` : 'Screen sharing stopped.', 'success');
  }
}

function currentScreenStream() {
  if (!app.screenShare.active) return null;
  if (app.screenShare.presenterId === app.selfId) return app.localScreenStream;
  return app.remoteScreenStreams.get(app.screenShare.presenterId) || null;
}

function toggleScreenView() {
  if (!app.screenShare.active) return;
  app.screenViewHidden = !app.screenViewHidden;
  chrome.storage.local.set({ apsScreenViewPreferences: { hidden: app.screenViewHidden } });
  updateScreenShareUI();
}

function updateScreenShareButton() {
  const button = elements.screenShareBtn;
  const local = Boolean(app.localScreenStream);
  const blocked = app.screenShare.active && app.screenShare.presenterId !== app.selfId;
  button.classList.toggle('sharing', local);
  button.classList.toggle('blocked', blocked);
  button.disabled = app.screenOperation;
  button.querySelector('span').textContent = local ? 'Stop' : blocked ? 'In use' : 'Share';
  button.title = local ? 'Stop sharing your screen' : blocked ? `${app.screenShare.presenterName || 'A friend'} is presenting` : 'Share a tab, window or screen';
  button.setAttribute('aria-label', button.title);
}

function updateScreenShareUI() {
  const active = Boolean(app.screenShare.active);
  const stream = currentScreenStream();
  const hidden = active && app.screenViewHidden;
  elements.screenStage.hidden = !active || hidden;
  elements.screenHiddenBar.hidden = !active || !hidden;
  elements.videoGrid.classList.toggle('screen-active', active && !hidden);
  elements.screenPresenterName.textContent = active ? `${app.screenShare.presenterName || 'Friend'} is presenting` : 'Screen share';
  elements.screenHiddenText.textContent = active ? `${app.screenShare.presenterName || 'Friend'} is presenting` : 'Screen share hidden';
  elements.screenStatusText.textContent = app.screenShare.presenterId === app.selfId ? 'You are sharing · visible to the room' : stream ? 'Live screen share' : 'Connecting securely…';
  elements.screenStopBtn.hidden = app.screenShare.presenterId !== app.selfId;
  elements.screenViewToggleBtn.textContent = hidden ? 'Show' : 'Hide';
  if (elements.screenVideo.srcObject !== stream) {
    elements.screenVideo.srcObject = stream;
    elements.screenVideo.muted = app.screenShare.presenterId === app.selfId;
    if (stream) elements.screenVideo.play().catch(() => undefined);
  }
  elements.screenStage.classList.toggle('has-stream', Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live')));
  updateScreenShareButton();
}

async function startCinemaMode() {
  if (!app.roomCode || app.cinemaStarting) return;
  if (app.localScreenStream) {
    await stopScreenShare(true);
    toast('Screen sharing stopped for the Cinema handoff. You can start it again in Cinema Mode.', 'success');
  }
  app.cinemaStarting = true;
  elements.cinemaModeBtn.disabled = true;
  elements.cinemaModeBtn.querySelector('span').textContent = 'Opening…';
  await chrome.storage.local.set({
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      mediaMode: app.mediaMode,
      media: { ...app.mediaEnabled },
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

async function copyRoomCode() {
  const code = formatRoomCode(app.roomCode);
  try {
    await navigator.clipboard.writeText(code);
    toast('Room code copied.', 'success');
  } catch {
    toast(`Room code: ${code}`);
  }
}

async function shareRoomInvite() {
  if (!app.roomCode) return;
  let inviteUrl;
  try {
    inviteUrl = buildRoomInviteUrl(app.settings.serverUrl, app.roomCode);
  } catch (error) {
    toast(error?.message || 'Could not create the invite link.', 'error');
    return;
  }
  const title = 'Join my APS Watch Together room';
  const text = `Join my private APS Watch Together room. Room code: ${formatRoomCode(app.roomCode)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url: inviteUrl });
      toast('Invite shared.', 'success');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}
${inviteUrl}`);
    toast('Direct room link copied.', 'success');
  } catch {
    toast(inviteUrl);
  }
}

function leaveRoom() {
  app.intentionallyLeft = true;
  stopScreenShare(false);
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
  app.remoteScreenStreams.clear();
  app.peerStreamRegistry.clear();
  app.screenSenders.clear();
  app.screenShare = inactiveScreenShare();
  updateScreenShareUI();
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

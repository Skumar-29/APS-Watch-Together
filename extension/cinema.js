const $ = (selector, root = document) => root.querySelector(selector);

const ICONS = {
  mic: '<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2Z"/>',
  micOff: '<path d="m4.3 3 16.7 16.7-1.3 1.3-4.1-4.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5 12h2a5 5 0 0 0 7.1 4.5l-1.5-1.5H12a3 3 0 0 1-3-3V7.4L3 4.3 4.3 3ZM12 3a3 3 0 0 1 3 3v5.2l-2-2V6a1 1 0 0 0-1.7-.7L9.9 3.9A3 3 0 0 1 12 3Zm5 9h2c0 1-.2 2-.6 2.9l-1.6-1.6c.1-.4.2-.8.2-1.3Z"/>',
  camera: '<path d="M4 5h11a2 2 0 0 1 2 2v2.2l4-2.5v10.6l-4-2.5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
  cameraOff: '<path d="m3.3 2 18.7 18.7-1.3 1.3-3.8-3.8A2 2 0 0 1 15 19H4a2 2 0 0 1-2-2V7c0-.5.2-1 .5-1.3L2 3.3 3.3 2ZM21 6.7v10.6l-4-2.5v.4L9.8 8H15a2 2 0 0 1 2 2v-.8l4-2.5ZM5.8 5 17 16.2V17H4V7c0-.8.7-1.5 1.5-1.5l.3-.5Z"/>'
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
  mediaEnabled: { audio: true, video: true },
  viewPreferences: { showSelf: true, showFriends: true },
  player: null,
  heartbeat: null,
  poller: null,
  reconnectTimer: null,
  intentionallyLeaving: false,
  closingForRestore: false,
  pipWindow: null,
  activeTabId: null
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
  remoteGrid: $('#remoteGrid'),
  viewsHidden: $('#viewsHidden'),
  selfViewBtn: $('#selfViewBtn'),
  friendsViewBtn: $('#friendsViewBtn'),
  participantText: $('#participantText'),
  syncText: $('#syncText'),
  micBtn: $('#micBtn'),
  cameraBtn: $('#cameraBtn'),
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
    'apsCinemaPreferences'
  ]);
  app.settings = stored.apsSettings || {};
  app.profile = stored.apsProfile || { displayName: 'Guest', avatarSeed: crypto.randomUUID() };
  app.roomCode = normalizeCode(params.get('room') || stored.apsActiveRoom?.roomCode || '');
  app.viewPreferences = {
    showSelf: stored.apsCinemaPreferences?.showSelf !== false,
    showFriends: stored.apsCinemaPreferences?.showFriends !== false
  };

  elements.displayName.textContent = app.profile.displayName || 'You';
  elements.initial.textContent = initialOf(app.profile.displayName || 'You');
  elements.roomCode.textContent = formatRoomCode(app.roomCode);
  bindEvents();
  applyViewPreferences(false);
  renderRemoteViews();

  if (!app.roomCode) return fail('No active room was found. Return to the full APS panel.');
  try {
    await ensureLocalMedia();
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
  elements.selfViewBtn.addEventListener('click', () => setViewPreference('showSelf', !app.viewPreferences.showSelf));
  elements.friendsViewBtn.addEventListener('click', () => setViewPreference('showFriends', !app.viewPreferences.showFriends));
  elements.floatBtn.addEventListener('click', openFloatingCallView);
  elements.restoreBtn.addEventListener('click', restoreFullControls);
  elements.leaveBtn.addEventListener('click', leaveRoom);

  chrome.runtime.onMessage.addListener((message, sender) => {
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
    stopAllMedia();
  });
}

async function ensureLocalMedia() {
  const quality = app.settings.videoQuality || 'hd';
  const video = quality === 'fullhd'
    ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }
    : quality === 'sd'
      ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };

  app.localStream = await navigator.mediaDevices.getUserMedia({
    video,
    audio: {
      echoCancellation: app.settings.echoCancellation !== false,
      noiseSuppression: app.settings.noiseSuppression !== false,
      autoGainControl: app.settings.autoGainControl !== false,
      channelCount: 1
    }
  });
  elements.localVideo.srcObject = app.localStream;
  elements.localVideo.play().catch(() => undefined);
  updateMediaUI();
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
      capabilities: { playback: true, video: true, chat: false, cinema: true }
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
    case 'media-state': {
      const participant = app.participants.get(message.participantId);
      if (participant) participant.media = { ...participant.media, ...message.media };
      renderRemoteViews();
      break;
    }
    case 'error':
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
  app.participants.clear();
  for (const participant of message.participants || []) addParticipant(participant);
  if (!app.participants.has(app.selfId)) {
    addParticipant({ id: app.selfId, name: app.profile.displayName, media: { ...app.mediaEnabled } });
  }
  updateRole();
  updateParticipantUI();
  renderRemoteViews();
  elements.connectionText.textContent = 'Cinema Mode connected';
  startHeartbeat();
  chrome.storage.local.set({
    apsActiveRoom: {
      roomCode: app.roomCode,
      displayName: app.profile.displayName,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    }
  });
  for (const participant of app.participants.values()) {
    if (participant.id !== app.selfId) createOffer(participant.id);
  }
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
  app.remoteStreams.delete(id);
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
  for (const track of app.localStream?.getTracks() || []) pc.addTrack(track, app.localStream);

  pc.onicecandidate = (event) => {
    if (event.candidate) sendSocket({ type: 'signal', targetId: peerId, signal: { candidate: event.candidate } });
  };

  pc.ontrack = (event) => {
    const remoteStream = event.streams[0] || app.remoteStreams.get(peerId) || new MediaStream();
    if (!event.streams[0] && !remoteStream.getTracks().some((track) => track.id === event.track.id)) {
      remoteStream.addTrack(event.track);
    }
    app.remoteStreams.set(peerId, remoteStream);
    event.track.addEventListener('ended', renderRemoteViews, { once: true });
    attachRemoteAudio(peerId, remoteStream);
    renderRemoteViews();
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
  audio.play().catch(() => undefined);
}

function renderRemoteViews() {
  renderRemoteGridInto(document, elements.remoteGrid);
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

function toggleMicrophone() {
  app.mediaEnabled.audio = !app.mediaEnabled.audio;
  updateMediaState();
}

function toggleCamera() {
  app.mediaEnabled.video = !app.mediaEnabled.video;
  updateMediaState();
}

function updateMediaState() {
  for (const track of app.localStream?.getAudioTracks() || []) track.enabled = app.mediaEnabled.audio;
  for (const track of app.localStream?.getVideoTracks() || []) track.enabled = app.mediaEnabled.video;
  const self = app.participants.get(app.selfId);
  if (self) self.media = { ...app.mediaEnabled };
  updateMediaUI();
  sendSocket({ type: 'media-state', media: app.mediaEnabled });
}

function updateMediaUI() {
  elements.micBtn.className = `circle-btn ${app.mediaEnabled.audio ? 'active' : 'off'}`;
  elements.micBtn.querySelector('svg').innerHTML = app.mediaEnabled.audio ? ICONS.mic : ICONS.micOff;
  elements.micBtn.title = app.mediaEnabled.audio ? 'Mute microphone' : 'Unmute microphone';
  elements.cameraBtn.className = `circle-btn ${app.mediaEnabled.video ? 'active' : 'off'}`;
  elements.cameraBtn.querySelector('svg').innerHTML = app.mediaEnabled.video ? ICONS.camera : ICONS.cameraOff;
  elements.cameraBtn.title = app.mediaEnabled.video ? 'Turn camera off' : 'Turn camera on';
  elements.selfCard.classList.toggle('has-video', app.mediaEnabled.video && hasLiveVideo(app.localStream));
  elements.liveIndicator.textContent = app.mediaEnabled.video ? 'LIVE' : 'CAM OFF';
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
        <button data-action="mic" title="Mute microphone">Mic</button>
        <button data-action="camera" title="Turn camera off">Camera</button>
        <button data-action="restore" class="primary">Full controls</button>
      </div>`;
    pip.document.body.appendChild(root);

    $('[data-action="self-view"]', root).addEventListener('click', () => setViewPreference('showSelf', !app.viewPreferences.showSelf));
    $('[data-action="friends-view"]', root).addEventListener('click', () => setViewPreference('showFriends', !app.viewPreferences.showFriends));
    $('[data-action="mic"]', root).addEventListener('click', toggleMicrophone);
    $('[data-action="camera"]', root).addEventListener('click', toggleCamera);
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
  const { showSelf, showFriends } = app.viewPreferences;

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
  if (live) live.textContent = app.mediaEnabled.video ? 'LIVE' : 'CAM OFF';
  renderRemoteGridInto(doc, grid);

  const mic = $('[data-action="mic"]', doc);
  const camera = $('[data-action="camera"]', doc);
  if (mic) mic.textContent = app.mediaEnabled.audio ? 'Mic' : 'Unmute';
  if (camera) camera.textContent = app.mediaEnabled.video ? 'Camera' : 'Camera on';
}

async function restoreFullControls() {
  elements.restoreBtn.disabled = true;
  elements.connectionText.textContent = 'Restoring full controls…';
  const response = await chrome.runtime.sendMessage({ type: 'APS_RESTORE_FULL_PANEL', roomCode: app.roomCode });
  if (!response?.ok) {
    elements.restoreBtn.disabled = false;
    elements.connectionText.textContent = response?.error || 'Could not restore full controls.';
  }
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
  clearInterval(app.heartbeat);
  clearInterval(app.poller);
  clearTimeout(app.reconnectTimer);
  for (const peer of app.peers.values()) peer.close();
  app.peers.clear();
  app.remoteStreams.clear();
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

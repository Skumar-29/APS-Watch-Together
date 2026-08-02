const defaults = {
  serverUrl: 'ws://localhost:8787/ws',
  videoQuality: 'hd',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  showSelfView: true,
  language: 'en',
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
};

const ids = ['serverUrl','videoQuality','echoCancellation','noiseSuppression','autoGainControl','turnUrl','turnUsername','turnCredential'];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const status = document.getElementById('status');

async function load() {
  const { apsSettings } = await chrome.storage.local.get('apsSettings');
  const settings = { ...defaults, ...(apsSettings || {}) };
  el.serverUrl.value = settings.serverUrl;
  el.videoQuality.value = settings.videoQuality;
  el.echoCancellation.checked = settings.echoCancellation !== false;
  el.noiseSuppression.checked = settings.noiseSuppression !== false;
  el.autoGainControl.checked = settings.autoGainControl !== false;
  const turn = settings.iceServers?.find((server) => String(Array.isArray(server.urls) ? server.urls[0] : server.urls).startsWith('turn'));
  el.turnUrl.value = Array.isArray(turn?.urls) ? turn.urls[0] : (turn?.urls || '');
  el.turnUsername.value = turn?.username || '';
  el.turnCredential.value = turn?.credential || '';
}

async function save() {
  const serverUrl = el.serverUrl.value.trim().replace(/\/$/, '');
  if (!/^wss?:\/\//i.test(serverUrl)) return show('Server URL must begin with ws:// or wss://', true);
  const iceServers = [...defaults.iceServers];
  const turnUrl = el.turnUrl.value.trim();
  if (turnUrl) {
    if (!/^turns?:/i.test(turnUrl)) return show('TURN URL must begin with turn: or turns:', true);
    iceServers.push({ urls: turnUrl, username: el.turnUsername.value.trim(), credential: el.turnCredential.value });
  }
  const permissionOrigin = serverPermissionPattern(serverUrl);
  if (permissionOrigin) {
    const granted = await chrome.permissions.request({ origins: [permissionOrigin] });
    if (!granted) return show('Server access permission is required for watch rooms.', true);
  }
  const settings = {
    ...defaults,
    serverUrl,
    videoQuality: el.videoQuality.value,
    echoCancellation: el.echoCancellation.checked,
    noiseSuppression: el.noiseSuppression.checked,
    autoGainControl: el.autoGainControl.checked,
    iceServers
  };
  await chrome.storage.local.set({ apsSettings: settings });
  show('Settings saved. Rejoin the room to apply call changes.');
}

async function reset() {
  await chrome.storage.local.set({ apsSettings: defaults });
  await load();
  show('Defaults restored.');
}

async function closeSettings() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    // Fall back to the normal browser close behaviour below.
  }
  window.close();
  setTimeout(() => show('Close this tab with ⌘W on Mac or Ctrl+W on Windows.', true), 250);
}

function serverPermissionPattern(serverUrl) {
  try {
    const parsed = new URL(serverUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return '';
  }
}

function show(message, error = false) {
  status.textContent = message;
  status.style.color = error ? '#fda4af' : '#6ee7b7';
  clearTimeout(show.timer);
  show.timer = setTimeout(() => status.textContent = '', 4000);
}

document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('resetBtn').addEventListener('click', reset);
document.getElementById('closeBtn').addEventListener('click', closeSettings);
document.getElementById('closeBottomBtn').addEventListener('click', closeSettings);
load();

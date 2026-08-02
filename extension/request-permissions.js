const allowBtn = document.getElementById('allowBtn');
const continueBtn = document.getElementById('continueBtn');
const status = document.getElementById('status');
const title = document.getElementById('permissionTitle');
const intro = document.getElementById('permissionIntro');

const MODES = {
  av: { title: 'Allow camera and microphone', button: 'Allow camera & microphone', audio: true, video: true },
  audio: { title: 'Allow microphone', button: 'Allow microphone', audio: true, video: false },
  video: { title: 'Allow camera', button: 'Allow camera', audio: false, video: true },
  watch: { title: 'Watch only mode', button: 'Continue', audio: false, video: false }
};
const mode = MODES[new URLSearchParams(location.search).get('mode')] ? new URLSearchParams(location.search).get('mode') : 'av';
const requested = MODES[mode];
title.textContent = requested.title;
allowBtn.textContent = requested.button;
intro.textContent = `Chrome cannot always show the first ${requested.audio && requested.video ? 'camera and microphone prompts' : requested.video ? 'camera prompt' : 'microphone prompt'} inside the side panel. Grant access here, or continue without local devices.`;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

async function permissionState(name) {
  try { return (await navigator.permissions.query({ name })).state; }
  catch { return 'prompt'; }
}

async function alreadyGranted() {
  const states = [];
  if (requested.video) states.push(await permissionState('camera'));
  if (requested.audio) states.push(await permissionState('microphone'));
  return states.length > 0 && states.every((state) => state === 'granted');
}

async function requestKind(kind) {
  return navigator.mediaDevices.getUserMedia(kind === 'video'
    ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false }
    : { video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
}

async function finish(nextMode = mode) {
  await chrome.storage.local.set({ apsMediaPermissionGrantedAt: Date.now(), apsMediaMode: nextMode });
  await chrome.runtime.sendMessage({ type: 'APS_MEDIA_PERMISSION_GRANTED', mediaMode: nextMode }).catch(() => undefined);
  setStatus(nextMode === 'watch' ? 'Watch only selected. Returning to APS Watch Together…' : 'Permission granted. Returning to APS Watch Together…', 'success');
  setTimeout(() => window.close(), 900);
}

async function requestMediaPermission() {
  allowBtn.disabled = true;
  continueBtn.disabled = true;
  setStatus('Waiting for Chrome’s permission prompt…');
  const streams = [];
  const errors = [];
  try {
    for (const kind of ['video', 'audio']) {
      if (!requested[kind]) continue;
      try { streams.push(await requestKind(kind)); }
      catch (error) { errors.push({ kind, error }); }
    }
    streams.flatMap((stream) => stream.getTracks()).forEach((track) => track.stop());
    if (streams.length) return finish(mode);
    const blocked = errors.some(({ error }) => ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name));
    setStatus(blocked
      ? 'Permission was blocked. Choose Allow in Chrome, or continue in Watch only mode.'
      : 'No selected camera or microphone was found. You can continue in Watch only mode.', 'error');
  } catch (error) {
    setStatus(error?.message || 'Device permission failed. You can continue in Watch only mode.', 'error');
  } finally {
    allowBtn.disabled = false;
    continueBtn.disabled = false;
    allowBtn.textContent = 'Try again';
  }
}

allowBtn.addEventListener('click', requestMediaPermission);
continueBtn.addEventListener('click', () => finish('watch'));

alreadyGranted().then((granted) => {
  if (!granted) return;
  setStatus('Permission is already granted. Returning to APS Watch Together…', 'success');
  finish(mode);
});

const allowBtn = document.getElementById('allowBtn');
const status = document.getElementById('status');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

async function alreadyGranted() {
  try {
    const [camera, microphone] = await Promise.all([
      navigator.permissions.query({ name: 'camera' }),
      navigator.permissions.query({ name: 'microphone' })
    ]);
    return camera.state === 'granted' && microphone.state === 'granted';
  } catch {
    return false;
  }
}

async function requestMediaPermission() {
  allowBtn.disabled = true;
  setStatus('Waiting for Chrome’s permission prompt…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    stream.getTracks().forEach((track) => track.stop());
    await chrome.storage.local.set({ apsMediaPermissionGrantedAt: Date.now() });
    await chrome.runtime.sendMessage({ type: 'APS_MEDIA_PERMISSION_GRANTED' }).catch(() => undefined);
    setStatus('Permission granted. Returning to APS Watch Together…', 'success');
    setTimeout(() => window.close(), 1000);
  } catch (error) {
    const message = error?.name === 'NotAllowedError'
      ? 'Permission was blocked. Choose Allow in Chrome and enable Google Chrome under macOS Camera and Microphone settings.'
      : (error?.message || 'Camera and microphone permission failed.');
    setStatus(message, 'error');
    await chrome.runtime.sendMessage({ type: 'APS_MEDIA_PERMISSION_DENIED', error: message }).catch(() => undefined);
    allowBtn.disabled = false;
    allowBtn.textContent = 'Try again';
  }
}

allowBtn.addEventListener('click', requestMediaPermission);

alreadyGranted().then((granted) => {
  if (!granted) return;
  setStatus('Permission is already granted. Returning to APS Watch Together…', 'success');
  chrome.runtime.sendMessage({ type: 'APS_MEDIA_PERMISSION_GRANTED' }).catch(() => undefined);
  setTimeout(() => window.close(), 800);
});

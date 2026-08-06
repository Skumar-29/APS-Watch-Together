const normalizeCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01IO]/g, '').slice(0, 8);
const roomCode = normalizeCode(location.pathname.split('/').filter(Boolean).at(-1));
const button = document.querySelector('[data-aps-open-room]');
const status = document.querySelector('[data-aps-extension-status]');

if (roomCode.length === 8 && button) {
  button.disabled = false;
  button.textContent = 'Open APS and join room';
  if (status) status.textContent = 'APS extension detected · ready to join';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Opening APS…';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'APS_OPEN_INVITE', roomCode, inviteUrl: location.href });
      if (!response?.ok) throw new Error(response?.error || 'APS could not open.');
      button.textContent = 'APS room opened';
      if (status) status.textContent = 'The room is opening in the APS side panel.';
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Try opening APS again';
      if (status) status.textContent = error?.message || 'Open the APS extension manually and enter the room code.';
    }
  });
}

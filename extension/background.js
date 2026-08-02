const SUPPORTED_HOSTS = [
  'netflix.com',
  'primevideo.com',
  'amazon.com',
  'amazon.co.uk',
  'amazon.in',
  'amazon.com.au',
  'zee5.com'
];

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const current = await chrome.storage.local.get([
    'apsSettings',
    'apsProfile'
  ]);

  if (!current.apsSettings) {
    await chrome.storage.local.set({
      apsSettings: {
        serverUrl: 'ws://localhost:8787/ws',
        videoQuality: 'hd',
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        showSelfView: true,
        language: 'en',
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
        ]
      }
    });
  }

  if (!current.apsProfile) {
    await chrome.storage.local.set({
      apsProfile: {
        displayName: '',
        avatarSeed: crypto.randomUUID()
      }
    });
  }

  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url || changeInfo.status !== 'complete') return;
  let supported = false;
  try {
    const host = new URL(tab.url).hostname.replace(/^www\./, '');
    supported = SUPPORTED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    supported = false;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: supported
  }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'APS_GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null });
    });
    return true;
  }

  if (message?.type === 'APS_SEND_TO_TAB') {
    const payload = message.payload;
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) {
        sendResponse({ ok: false, tabId: null, error: 'No active tab.' });
        return;
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, payload);
        sendResponse({ ok: true, tabId: tab.id, result });
      } catch (error) {
        sendResponse({ ok: false, tabId: tab.id, error: error?.message || 'Player bridge unavailable.' });
      }
    });
    return true;
  }
});

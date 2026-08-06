const SUPPORTED_HOSTS = [
  'netflix.com',
  'primevideo.com',
  'amazon.com',
  'amazon.co.uk',
  'amazon.in',
  'amazon.com.au',
  'zee5.com'
];

function isSupportedUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SUPPORTED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function findSupportedTab() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => tab.id && isSupportedUrl(tab.url || ''))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
    })[0] || null;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const current = await chrome.storage.local.get([
    'apsSettings',
    'apsProfile',
    'apsMediaIntent',
    'apsDevicePreferences'
  ]);

  if (!current.apsSettings) {
    await chrome.storage.local.set({
      apsSettings: {
        serverUrl: 'wss://aps-watch-together-server.onrender.com/ws',
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
      },
      apsMediaMode: 'av',
      apsMediaIntent: { audio: true, video: true },
      apsDevicePreferences: { audioinput: '', videoinput: '', audiooutput: '' }
    });
  }

  if (!current.apsMediaIntent) await chrome.storage.local.set({ apsMediaIntent: { audio: true, video: true } });
  if (!current.apsDevicePreferences) await chrome.storage.local.set({ apsDevicePreferences: { audioinput: '', videoinput: '', audiooutput: '' } });

  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url || changeInfo.status !== 'complete') return;
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: isSupportedUrl(tab.url)
  }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'APS_GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ tab: tab ? { id: tab.id, url: tab.url, title: tab.title, windowId: tab.windowId } : null });
    });
    return true;
  }

  if (message?.type === 'APS_SEND_TO_TAB') {
    const payload = message.payload;
    findSupportedTab().then(async (tab) => {
      if (!tab?.id) {
        sendResponse({ ok: false, tabId: null, error: 'No supported movie tab is open.' });
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

  if (message?.type === 'APS_OPEN_INVITE') {
    (async () => {
      try {
        const roomCode = String(message.roomCode || '').replace(/[^A-Z2-9]/gi, '').replace(/[01IO]/gi, '').slice(0, 8).toUpperCase();
        if (roomCode.length !== 8) throw new Error('The invite link has an invalid room code.');
        await chrome.storage.local.set({
          apsPendingInvite: {
            roomCode,
            inviteUrl: String(message.inviteUrl || ''),
            requestedAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000
          }
        });
        const supported = await findSupportedTab();
        const target = supported || sender.tab;
        if (!target?.id) throw new Error('Could not find a Chrome tab for APS.');
        await chrome.sidePanel.setOptions({ tabId: target.id, path: 'sidepanel.html', enabled: true });
        if (target.windowId) await chrome.windows.update(target.windowId, { focused: true });
        await chrome.tabs.update(target.id, { active: true });
        await chrome.sidePanel.open({ tabId: target.id });
        sendResponse({ ok: true, tabId: target.id });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not open the room invitation.' });
      }
    })();
    return true;
  }

  if (message?.type === 'APS_OPEN_CINEMA') {
    (async () => {
      try {
        const allTabs = await chrome.tabs.query({});
        const existing = allTabs.filter((tab) => String(tab.url || '').startsWith(chrome.runtime.getURL('cinema.html')));
        if (existing[0]?.windowId) {
          await chrome.windows.update(existing[0].windowId, { focused: true, state: 'normal' });
          sendResponse({ ok: true, windowId: existing[0].windowId, reused: true });
          return;
        }
        const roomCode = String(message.roomCode || '').replace(/[^A-Z2-9]/gi, '').slice(0, 8).toUpperCase();
        const url = chrome.runtime.getURL(`cinema.html?room=${encodeURIComponent(roomCode)}`);
        const created = await chrome.windows.create({
          url,
          type: 'popup',
          width: 500,
          height: 430,
          focused: true
        });
        sendResponse({ ok: true, windowId: created.id });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not open Cinema Mode.' });
      }
    })();
    return true;
  }

  if (message?.type === 'APS_CLOSE_SIDE_PANEL') {
    (async () => {
      try {
        const tab = message.tabId ? { id: message.tabId } : await findSupportedTab();
        if (!tab?.id) throw new Error('No supported movie tab found.');
        await chrome.sidePanel.close({ tabId: tab.id });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not close the side panel.' });
      }
    })();
    return true;
  }

  if (message?.type === 'APS_RESTORE_FULL_PANEL') {
    (async () => {
      try {
        const roomCode = String(message.roomCode || '').replace(/[^A-Z2-9]/gi, '').slice(0, 8).toUpperCase();
        await chrome.storage.local.set({
          apsRestoreRoom: {
            roomCode,
            requestedAt: Date.now(),
            expiresAt: Date.now() + 60_000
          }
        });
        const tab = await findSupportedTab();
        if (!tab?.id) throw new Error('Open Netflix, Prime Video or ZEE5 first.');
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.sidePanel.open({ tabId: tab.id });
        sendResponse({ ok: true, tabId: tab.id });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not restore full controls.' });
      }
    })();
    return true;
  }

  if (message?.type === 'APS_MINIMIZE_CURRENT_WINDOW') {
    (async () => {
      try {
        const windowId = sender.tab?.windowId;
        if (!windowId) throw new Error('Cinema window was not found.');
        await chrome.windows.update(windowId, { state: 'minimized' });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not minimize Cinema Mode.' });
      }
    })();
    return true;
  }

  if (message?.type === 'APS_CLOSE_CURRENT_WINDOW') {
    (async () => {
      try {
        const windowId = sender.tab?.windowId;
        if (!windowId) throw new Error('Window was not found.');
        await chrome.windows.remove(windowId);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Could not close the window.' });
      }
    })();
    return true;
  }
});

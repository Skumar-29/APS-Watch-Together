(() => {
  if (window.__APS_WATCH_TOGETHER_LOADED__) return;
  window.__APS_WATCH_TOGETHER_LOADED__ = true;

  const state = {
    video: null,
    applyingRemoteUntil: 0,
    lastSent: null,
    lastStatusAt: 0,
    service: detectService(),
    attachedAt: 0,
    softCorrectionTimer: null,
    enabled: true,
    netflixBridgeStatus: null,
    netflixBridgeStatusAt: 0,
    netflixBridgePending: new Map(),
    netflixBridgePollBusy: false,
    primeBridgeStatus: null,
    primeBridgeStatusAt: 0,
    primeBridgePending: new Map(),
    primeBridgePollBusy: false,
    localEventsSuppressedUntil: Date.now() + 2500,
    lastLocationHref: location.href,
    lastAppliedCommandId: ''
  };

  const SERVICE_LABELS = {
    netflix: 'Netflix',
    prime: 'Prime Video',
    zee5: 'ZEE5',
    unknown: 'Supported player'
  };

  function detectService() {
    const host = location.hostname.toLowerCase();
    if (host.includes('netflix.')) return 'netflix';
    if (host.includes('primevideo.') || host.includes('amazon.')) return 'prime';
    if (host.includes('zee5.')) return 'zee5';
    return 'unknown';
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 180 && rect.height > 100 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function scoreVideo(video) {
    const rect = video.getBoundingClientRect();
    let score = Math.max(0, rect.width) * Math.max(0, rect.height);
    if (!video.paused) score *= 1.6;
    if (video.readyState >= 2) score *= 1.25;
    if (video.duration > 60) score *= 1.2;
    if (state.service === 'prime') {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      let node = video;
      const context = [];
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        context.push(node.id || '', node.className || '', node.getAttribute?.('data-testid') || '');
      }
      if (duration > 300) score *= 2.2;
      else if (duration > 0 && duration < 45) score *= 0.08;
      if (/\b(ad|ads|advert|advertisement|preroll|promo|preview|trailer)\b/i.test(context.join(' '))) score *= 0.03;
    }
    return score;
  }

  function findBestVideo() {
    const candidates = [...document.querySelectorAll('video')].filter(isVisible);
    if (!candidates.length) return null;
    candidates.sort((a, b) => scoreVideo(b) - scoreVideo(a));
    return candidates[0];
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/\s*[|–—-]\s*(Netflix|Prime Video|Amazon Prime Video|ZEE5).*$/i, '')
      .replace(/^Watch\s+/i, '')
      .trim()
      .slice(0, 180);
  }

  function getTitle() {
    const selectorsByService = {
      netflix: [
        '[data-uia="video-title"]',
        '.ellipsize-text',
        '.video-title h4',
        '.watch-video--player-view h4'
      ],
      prime: [
        '[data-testid="player-title"]',
        '.atvwebplayersdk-title-text',
        '[class*="title"] h1'
      ],
      zee5: [
        '[class*="player"] [class*="title"]',
        'h1'
      ]
    };

    const selectors = selectorsByService[state.service] || [];
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text && text.length > 1 && text.length < 180) return cleanTitle(text);
    }
    return cleanTitle(document.title) || SERVICE_LABELS[state.service];
  }

  function callNetflixBridge(command, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        state.netflixBridgePending.delete(requestId);
        resolve({ ok: false, error: 'Netflix player control timed out. Refresh the Netflix tab and try again.' });
      }, timeoutMs);
      state.netflixBridgePending.set(requestId, { resolve, timeout });
      window.postMessage({
        source: 'APS_WATCH_TOGETHER',
        type: 'APS_NETFLIX_COMMAND',
        requestId,
        command
      }, location.origin);
    });
  }


  function callPrimeBridge(command, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        state.primeBridgePending.delete(requestId);
        resolve({ ok: false, error: 'Prime Video player control timed out. Refresh the Prime Video tab and try again.' });
      }, timeoutMs);
      state.primeBridgePending.set(requestId, { resolve, timeout });
      window.postMessage({
        source: 'APS_WATCH_TOGETHER',
        type: 'APS_PRIME_COMMAND',
        requestId,
        command
      }, location.origin);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data) return;

    if (data.source === 'APS_NETFLIX_BRIDGE' && data.type === 'APS_NETFLIX_RESULT') {
      const pending = state.netflixBridgePending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      state.netflixBridgePending.delete(data.requestId);
      if (data.result?.status) {
        state.netflixBridgeStatus = data.result.status;
        state.netflixBridgeStatusAt = Date.now();
      }
      pending.resolve(data.result || { ok: false, error: 'Netflix player returned no result.' });
      return;
    }

    if (data.source === 'APS_PRIME_BRIDGE' && data.type === 'APS_PRIME_RESULT') {
      const pending = state.primeBridgePending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      state.primeBridgePending.delete(data.requestId);
      if (data.result?.status) {
        state.primeBridgeStatus = data.result.status;
        state.primeBridgeStatusAt = Date.now();
      }
      pending.resolve(data.result || { ok: false, error: 'Prime Video player returned no result.' });
    }
  });

  function bridgeSnapshot(reason, bridgeStatus) {
    return {
      type: 'APS_PLAYER_STATUS',
      reason,
      service: state.service,
      serviceLabel: SERVICE_LABELS[state.service],
      ready: bridgeStatus?.ready !== false,
      paused: Boolean(bridgeStatus?.paused),
      currentTime: Number(bridgeStatus?.currentTime || 0),
      duration: Number(bridgeStatus?.duration || 0),
      playbackRate: Number(bridgeStatus?.playbackRate || 1),
      muted: state.video?.muted || false,
      volume: Number.isFinite(state.video?.volume) ? state.video.volume : 1,
      title: getTitle(),
      url: location.href,
      wallClock: Date.now()
    };
  }

  async function refreshNetflixBridgeStatus() {
    if (state.service !== 'netflix' || state.netflixBridgePollBusy) return;
    state.netflixBridgePollBusy = true;
    try {
      const result = await callNetflixBridge({ kind: 'status' }, 1200);
      if (result?.ok && result.status) {
        state.netflixBridgeStatus = result.status;
        state.netflixBridgeStatusAt = Date.now();
        chrome.runtime.sendMessage(bridgeSnapshot('netflix-heartbeat', result.status)).catch(() => undefined);
      }
    } finally {
      state.netflixBridgePollBusy = false;
    }
  }


  function primeBridgeSnapshot(reason, bridgeStatus) {
    return {
      type: 'APS_PLAYER_STATUS',
      reason,
      service: state.service,
      serviceLabel: SERVICE_LABELS[state.service],
      ready: bridgeStatus?.ready !== false,
      paused: Boolean(bridgeStatus?.paused),
      currentTime: Number(bridgeStatus?.currentTime || 0),
      duration: Number(bridgeStatus?.duration || 0),
      playbackRate: Number(bridgeStatus?.playbackRate || 1),
      muted: state.video?.muted || false,
      volume: Number.isFinite(state.video?.volume) ? state.video.volume : 1,
      title: getTitle(),
      url: location.href,
      wallClock: Date.now()
    };
  }

  async function refreshPrimeBridgeStatus() {
    if (state.service !== 'prime' || state.primeBridgePollBusy) return;
    state.primeBridgePollBusy = true;
    try {
      const result = await callPrimeBridge({ kind: 'status' }, 1400);
      if (result?.ok && result.status) {
        state.primeBridgeStatus = result.status;
        state.primeBridgeStatusAt = Date.now();
        chrome.runtime.sendMessage(primeBridgeSnapshot('prime-heartbeat', result.status)).catch(() => undefined);
      }
    } finally {
      state.primeBridgePollBusy = false;
    }
  }

  function snapshot(reason = 'status') {
    if (state.service === 'netflix' && state.netflixBridgeStatus && Date.now() - state.netflixBridgeStatusAt < 2500) {
      return bridgeSnapshot(reason, state.netflixBridgeStatus);
    }
    if (state.service === 'prime' && state.primeBridgeStatus && Date.now() - state.primeBridgeStatusAt < 2500) {
      return primeBridgeSnapshot(reason, state.primeBridgeStatus);
    }
    const video = state.video;
    if (!video) {
      return {
        type: 'APS_PLAYER_STATUS',
        reason,
        service: state.service,
        serviceLabel: SERVICE_LABELS[state.service],
        ready: false,
        title: getTitle(),
        url: location.href
      };
    }

    return {
      type: 'APS_PLAYER_STATUS',
      reason,
      service: state.service,
      serviceLabel: SERVICE_LABELS[state.service],
      ready: video.readyState >= 2,
      paused: video.paused,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      playbackRate: video.playbackRate || 1,
      muted: video.muted,
      volume: video.volume,
      title: getTitle(),
      url: location.href,
      wallClock: Date.now()
    };
  }

  function sendStatus(reason = 'status', force = false) {
    const now = Date.now();
    if (!force && now - state.lastStatusAt < 250) return;
    state.lastStatusAt = now;
    chrome.runtime.sendMessage(snapshot(reason)).catch(() => undefined);
  }

  function isApplyingRemote() {
    return Date.now() < state.applyingRemoteUntil;
  }

  function markRemote(ms = 900) {
    state.applyingRemoteUntil = Math.max(state.applyingRemoteUntil, Date.now() + ms);
  }

  function emitControl(action) {
    if (isApplyingRemote() || !state.video) return;
    if (Date.now() < state.localEventsSuppressedUntil) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    if (state.service === 'prime' && (action === 'seeking' || action === 'rate')) {
      state.primeBridgeStatusAt = 0;
      sendStatus(`prime-${action}`);
      return;
    }
    if (state.service === 'prime') state.primeBridgeStatusAt = 0;
    const payload = snapshot('control');
    payload.type = 'APS_PLAYER_EVENT';
    payload.action = action;
    chrome.runtime.sendMessage(payload).catch(() => undefined);
  }

  function attach(video) {
    if (!video || state.video === video) return;
    detach();
    state.video = video;
    state.attachedAt = Date.now();
    if (state.service === 'prime') {
      state.localEventsSuppressedUntil = Math.max(state.localEventsSuppressedUntil, Date.now() + 1800);
    }

    video.addEventListener('play', onPlay, true);
    video.addEventListener('pause', onPause, true);
    video.addEventListener('seeking', onSeeking, true);
    video.addEventListener('seeked', onSeeked, true);
    video.addEventListener('ratechange', onRateChange, true);
    video.addEventListener('loadedmetadata', onMetadata, true);
    video.addEventListener('durationchange', onMetadata, true);

    sendStatus('attached', true);
  }

  function detach() {
    const video = state.video;
    if (!video) return;
    video.removeEventListener('play', onPlay, true);
    video.removeEventListener('pause', onPause, true);
    video.removeEventListener('seeking', onSeeking, true);
    video.removeEventListener('seeked', onSeeked, true);
    video.removeEventListener('ratechange', onRateChange, true);
    video.removeEventListener('loadedmetadata', onMetadata, true);
    video.removeEventListener('durationchange', onMetadata, true);
    state.video = null;
  }

  function onPlay() { emitControl('play'); }
  function onPause() { emitControl('pause'); }
  function onSeeking() { emitControl('seeking'); }
  function onSeeked() { emitControl('seek'); }
  function onRateChange() { emitControl('rate'); }
  function onMetadata() { sendStatus('metadata', true); }

  async function applyCommand(command) {
    const kind = command?.kind;
    const commandId = String(command?.commandId || '');
    if (commandId && commandId === state.lastAppliedCommandId) {
      return { ok: true, status: snapshot(`duplicate-${kind}`) };
    }
    if (commandId) state.lastAppliedCommandId = commandId;

    markRemote(state.service === 'prime' ? (kind === 'sync' ? 3000 : 2400) : (kind === 'sync' ? 1400 : 900));

    try {
      if (state.service === 'netflix') {
        const result = await callNetflixBridge(command, kind === 'sync' ? 3200 : 2500);
        if (!result?.ok) throw new Error(result?.error || 'Netflix player control failed.');
        if (result.status) {
          state.netflixBridgeStatus = result.status;
          state.netflixBridgeStatusAt = Date.now();
        }
        const status = result.status ? bridgeSnapshot(`applied-${kind}`, result.status) : snapshot(`applied-${kind}`);
        chrome.runtime.sendMessage(status).catch(() => undefined);
        return { ok: true, status };
      }

      if (state.service === 'prime') {
        const result = await callPrimeBridge(command, kind === 'sync' ? 3600 : 2800);
        if (!result?.ok) throw new Error(result?.error || 'Prime Video player control failed.');
        if (result.status) {
          state.primeBridgeStatus = result.status;
          state.primeBridgeStatusAt = Date.now();
        }
        const status = result.status ? primeBridgeSnapshot(`applied-${kind}`, result.status) : snapshot(`applied-${kind}`);
        chrome.runtime.sendMessage(status).catch(() => undefined);
        return { ok: true, status };
      }

      const video = state.video || findBestVideo();
      if (!video) return { ok: false, error: 'No active video player found.' };
      if (state.video !== video) attach(video);

      if (kind === 'play') {
        if (Number.isFinite(command.time)) video.currentTime = command.time;
        await video.play();
      } else if (kind === 'pause') {
        video.pause();
        if (Number.isFinite(command.time) && Math.abs(video.currentTime - command.time) > 0.35) {
          video.currentTime = command.time;
        }
      } else if (kind === 'seek') {
        if (!Number.isFinite(command.time)) throw new Error('Invalid seek time.');
        video.currentTime = Math.max(0, Math.min(command.time, Number.isFinite(video.duration) ? video.duration : command.time));
      } else if (kind === 'skip') {
        const amount = Number(command.amount || 0);
        video.currentTime = Math.max(0, Math.min(video.currentTime + amount, Number.isFinite(video.duration) ? video.duration : video.currentTime + amount));
      } else if (kind === 'sync') {
        await applySync(video, command);
      } else if (kind === 'set-rate') {
        video.playbackRate = Number(command.rate) || 1;
      } else {
        throw new Error('Unsupported player command.');
      }

      sendStatus(`applied-${kind}`, true);
      return { ok: true, status: snapshot(`applied-${kind}`) };
    } catch (error) {
      const message = error?.name === 'NotAllowedError'
        ? 'Click Play once inside the streaming player, then try again.'
        : (error?.message || 'Could not control this player.');
      chrome.runtime.sendMessage({ type: 'APS_PLAYER_ERROR', error: message }).catch(() => undefined);
      return { ok: false, error: message };
    }
  }

  async function applySync(video, command) {
    const sentAt = Number(command.sentAt || Date.now());
    const latencySeconds = Math.max(0, (Date.now() - sentAt) / 1000);
    const targetBase = Number(command.time || 0);
    const target = command.paused ? targetBase : targetBase + latencySeconds * Number(command.rate || 1);
    const drift = target - video.currentTime;

    if (command.paused) {
      if (!video.paused) video.pause();
      if (Math.abs(drift) > 0.25) video.currentTime = Math.max(0, target);
      video.playbackRate = Number(command.rate || 1);
      return;
    }

    if (video.paused) {
      if (Math.abs(drift) > 0.25) video.currentTime = Math.max(0, target);
      await video.play();
    }

    const absDrift = Math.abs(drift);
    if (absDrift > 1.15) {
      video.currentTime = Math.max(0, target);
      video.playbackRate = Number(command.rate || 1);
      return;
    }

    if (absDrift > 0.18) {
      const baseRate = Number(command.rate || 1);
      const correction = drift > 0 ? 0.045 : -0.045;
      video.playbackRate = Math.max(0.5, Math.min(2, baseRate + correction));
      clearTimeout(state.softCorrectionTimer);
      state.softCorrectionTimer = setTimeout(() => {
        if (state.video === video) {
          markRemote(500);
          video.playbackRate = baseRate;
        }
      }, Math.min(3500, Math.max(1000, absDrift * 2400)));
    } else if (Math.abs(video.playbackRate - Number(command.rate || 1)) > 0.01) {
      video.playbackRate = Number(command.rate || 1);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'APS_PLAYER_COMMAND') {
      applyCommand(message.command).then(sendResponse);
      return true;
    }

    if (message?.type === 'APS_PLAYER_PING') {
      const best = findBestVideo();
      if (best && best !== state.video) attach(best);
      sendResponse(snapshot('ping'));
      return false;
    }

    if (message?.type === 'APS_SET_PLAYER_ENABLED') {
      state.enabled = Boolean(message.enabled);
      sendResponse({ ok: true });
      return false;
    }
  });

  const observer = new MutationObserver(() => {
    if (!state.video || !state.video.isConnected) {
      const video = findBestVideo();
      if (video) attach(video);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (location.href !== state.lastLocationHref) {
      state.lastLocationHref = location.href;
      state.localEventsSuppressedUntil = Date.now() + 3000;
      detach();
    }
    const best = findBestVideo();
    if (best && best !== state.video) attach(best);
    if (state.service === 'netflix') refreshNetflixBridgeStatus();
    else if (state.service === 'prime') refreshPrimeBridgeStatus();
    else if (state.video) sendStatus('heartbeat');
  }, 1000);

  const initial = findBestVideo();
  if (initial) attach(initial);
  else sendStatus('waiting', true);
})();

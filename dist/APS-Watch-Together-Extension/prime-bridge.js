(() => {
  if (window.__APS_PRIME_BRIDGE_LOADED__) return;
  window.__APS_PRIME_BRIDGE_LOADED__ = true;

  const SOURCE_APP = 'APS_WATCH_TOGETHER';
  const SOURCE_BRIDGE = 'APS_PRIME_BRIDGE';
  const commandCache = new Map();

  function rectArea(element) {
    try {
      const rect = element.getBoundingClientRect();
      return Math.max(0, rect.width) * Math.max(0, rect.height);
    } catch {
      return 0;
    }
  }

  function isVisible(video) {
    if (!video?.isConnected) return false;
    if (document.pictureInPictureElement === video) return true;
    if (document.fullscreenElement && (document.fullscreenElement === video || document.fullscreenElement.contains?.(video))) return true;
    const area = rectArea(video);
    if (area < 40_000) return false;
    try {
      const style = getComputedStyle(video);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01;
    } catch {
      return true;
    }
  }

  function ancestorText(video) {
    const values = [];
    let node = video;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      values.push(node.id || '', node.className || '', node.getAttribute?.('data-testid') || '', node.getAttribute?.('aria-label') || '');
    }
    return values.join(' ').toLowerCase();
  }

  function videoScore(video) {
    const area = rectArea(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    let score = area;
    if (isVisible(video)) score += 2e9;
    if (!video.paused) score += 4e9;
    if (video.readyState >= 2) score += 1e9;
    if (duration > 300) score += 2e9;
    else if (duration > 60) score += 5e8;
    else if (duration > 0 && duration < 45) score -= 2e9;
    if (video === document.pictureInPictureElement) score += 8e9;
    const context = ancestorText(video);
    if (/\b(ad|ads|advert|advertisement|preroll|promo|preview|trailer)\b/.test(context)) score -= 6e9;
    if (/\b(player|playback|webplayer|atvwebplayer)\b/.test(context)) score += 5e8;
    return score;
  }

  function getActiveVideo() {
    const videos = [...document.querySelectorAll('video')].filter((video) => video?.isConnected);
    if (!videos.length) throw new Error('Prime Video player is not ready yet. Start the title once and try again.');
    const visible = videos.filter(isVisible);
    const candidates = visible.length ? visible : videos;
    candidates.sort((a, b) => videoScore(b) - videoScore(a));
    return candidates[0];
  }

  function getStatus(video = getActiveVideo()) {
    return {
      ready: video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0,
      paused: Boolean(video.paused),
      currentTime: Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0,
      duration: Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0,
      playbackRate: Number(video.playbackRate || 1) || 1
    };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitUntil(predicate, timeoutMs = 1200, intervalMs = 50) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (predicate()) return true;
      } catch {
        // The player can be replaced during Prime Video route transitions.
      }
      await delay(intervalMs);
    }
    return false;
  }

  function findPlaybackButton(kind) {
    const word = kind === 'play' ? 'play' : 'pause';
    const selectors = [
      `button[aria-label*="${word}" i]`,
      `button[title*="${word}" i]`,
      `button[data-testid*="${word}" i]`,
      `[role="button"][aria-label*="${word}" i]`,
      '.atvwebplayersdk-playpause-button'
    ];
    for (const selector of selectors) {
      const buttons = [...document.querySelectorAll(selector)];
      const button = buttons.find((candidate) => {
        if (!candidate?.isConnected || rectArea(candidate) < 100) return false;
        const label = `${candidate.getAttribute?.('aria-label') || ''} ${candidate.getAttribute?.('title') || ''} ${candidate.getAttribute?.('data-testid') || ''}`.toLowerCase();
        if (selector.includes('playpause')) return true;
        return label.includes(word);
      });
      if (button) return button;
    }
    return null;
  }

  async function safePlay(video) {
    if (!video.paused) return;
    let playError = null;
    try {
      await Promise.resolve(video.play());
    } catch (error) {
      playError = error;
    }
    if (await waitUntil(() => !video.paused, 500)) return;
    const button = findPlaybackButton('play');
    if (button) {
      button.click();
      if (await waitUntil(() => !video.paused, 900)) return;
    }
    if (playError?.name === 'NotAllowedError') {
      throw new Error('Click Play once inside Prime Video, then use APS controls again.');
    }
    throw new Error(playError?.message || 'Prime Video did not start playback.');
  }

  async function safePause(video) {
    if (video.paused) return;
    try {
      video.pause();
    } catch {
      // Try the visible player control below.
    }
    if (await waitUntil(() => video.paused, 500)) return;
    const button = findPlaybackButton('pause');
    if (button) {
      button.click();
      if (await waitUntil(() => video.paused, 900)) return;
    }
    throw new Error('Prime Video did not pause. Refresh the title and try again.');
  }

  function clampToSeekable(video, requested) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : requested;
    let target = Math.max(0, Math.min(requested, duration));
    const ranges = video.seekable;
    if (!ranges?.length) return target;
    for (let index = 0; index < ranges.length; index += 1) {
      const start = ranges.start(index);
      const end = ranges.end(index);
      if (target >= start && target <= end) return target;
    }
    const first = ranges.start(0);
    const last = ranges.end(ranges.length - 1);
    target = Math.max(first, Math.min(target, last));
    return target;
  }

  async function safeSeek(video, requested) {
    if (!Number.isFinite(requested)) throw new Error('Invalid Prime Video seek time.');
    if (!(Number.isFinite(video.duration) && video.duration > 0)) {
      await waitUntil(() => Number.isFinite(video.duration) && video.duration > 0, 1500);
    }
    const target = clampToSeekable(video, requested);
    if (Math.abs(video.currentTime - target) < 0.2) return;
    if (typeof video.fastSeek === 'function') video.fastSeek(target);
    else video.currentTime = target;
    await waitUntil(() => Math.abs(video.currentTime - target) < 1.1, 1200);
  }

  async function execute(command = {}) {
    const commandId = String(command.commandId || '');
    if (commandId && commandCache.has(commandId)) return commandCache.get(commandId);

    let video = getActiveVideo();
    const kind = command.kind;
    const before = getStatus(video);
    let result;

    if (kind === 'status') {
      result = { ok: true, status: before };
    } else {
      if (kind === 'play') {
        // Prime Video can reload or stall when Play is combined with an immediate raw seek.
        // Play/Pause are therefore state-only commands; the normal heartbeat corrects drift safely.
        await safePlay(video);
      } else if (kind === 'pause') {
        // Never write currentTime as part of Pause.
        await safePause(video);
      } else if (kind === 'seek') {
        await safeSeek(video, Number(command.time));
      } else if (kind === 'skip') {
        await safeSeek(video, before.currentTime + Number(command.amount || 0));
      } else if (kind === 'sync') {
        const sentAt = Number(command.sentAt || Date.now());
        const latencySeconds = Math.max(0, (Date.now() - sentAt) / 1000);
        const base = Number(command.time || 0);
        const rate = Number(command.rate || 1) || 1;
        const target = command.paused ? base : base + latencySeconds * rate;
        const drift = target - before.currentTime;

        if (command.paused) {
          await safePause(video);
          if (Math.abs(drift) > 1.15) await safeSeek(video, target);
        } else {
          if (Math.abs(drift) > 1.5) await safeSeek(video, target);
          video = getActiveVideo();
          await safePlay(video);
        }
        // Do not use temporary playback-rate correction on Prime Video. It can be
        // interpreted as a player-state change and cause buffering or control churn.
      } else if (kind === 'set-rate') {
        // Prime Video does not expose a stable public speed API. Keep normal speed.
        if (Math.abs((video.playbackRate || 1) - 1) > 0.01) video.playbackRate = 1;
      } else {
        throw new Error('Unsupported Prime Video player command.');
      }

      await delay(70);
      video = getActiveVideo();
      result = { ok: true, status: getStatus(video) };
    }

    if (commandId) {
      commandCache.set(commandId, result);
      if (commandCache.size > 80) commandCache.delete(commandCache.keys().next().value);
    }
    return result;
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_APP || data.type !== 'APS_PRIME_COMMAND' || !data.requestId) return;

    try {
      const result = await execute(data.command);
      window.postMessage({
        source: SOURCE_BRIDGE,
        type: 'APS_PRIME_RESULT',
        requestId: data.requestId,
        result
      }, location.origin);
    } catch (error) {
      window.postMessage({
        source: SOURCE_BRIDGE,
        type: 'APS_PRIME_RESULT',
        requestId: data.requestId,
        result: { ok: false, error: error?.message || 'Prime Video control failed.' }
      }, location.origin);
    }
  });
})();

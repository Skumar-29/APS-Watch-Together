(() => {
  if (window.__APS_NETFLIX_BRIDGE_LOADED__) return;
  window.__APS_NETFLIX_BRIDGE_LOADED__ = true;

  const SOURCE_APP = 'APS_WATCH_TOGETHER';
  const SOURCE_BRIDGE = 'APS_NETFLIX_BRIDGE';

  function safeCall(target, names, fallback = undefined) {
    for (const name of names) {
      try {
        if (typeof target?.[name] === 'function') {
          const value = target[name]();
          if (value !== undefined && value !== null) return value;
        }
      } catch {
        // Try the next compatible method name.
      }
    }
    return fallback;
  }

  function getVideoFallback() {
    const videos = [...document.querySelectorAll('video')].filter((video) => video.isConnected);
    videos.sort((a, b) => {
      const aScore = (a.clientWidth * a.clientHeight) + (a.paused ? 0 : 1e9);
      const bScore = (b.clientWidth * b.clientHeight) + (b.paused ? 0 : 1e9);
      return bScore - aScore;
    });
    return videos[0] || null;
  }

  function getActivePlayer() {
    const manager = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    if (!manager) throw new Error('Netflix player API is not ready yet.');

    const ids = manager.getAllPlayerSessionIds?.() || [];
    const candidates = ids
      .map((id) => {
        try {
          return { id, player: manager.getVideoPlayerBySessionId(id) };
        } catch {
          return null;
        }
      })
      .filter((item) => item?.player);

    if (!candidates.length) throw new Error('No active Netflix player session was found.');

    candidates.sort((a, b) => {
      const aPlaying = Boolean(safeCall(a.player, ['isPlaying', 'getPlaying'], false));
      const bPlaying = Boolean(safeCall(b.player, ['isPlaying', 'getPlaying'], false));
      const aDuration = Number(safeCall(a.player, ['getDuration'], 0)) || 0;
      const bDuration = Number(safeCall(b.player, ['getDuration'], 0)) || 0;
      return ((bPlaying ? 1e15 : 0) + bDuration) - ((aPlaying ? 1e15 : 0) + aDuration);
    });

    return candidates[0].player;
  }

  function getStatus(player) {
    const fallback = getVideoFallback();
    const currentMs = Number(safeCall(player, ['getCurrentTime'], fallback ? fallback.currentTime * 1000 : 0)) || 0;
    const durationMs = Number(safeCall(player, ['getDuration'], fallback ? fallback.duration * 1000 : 0)) || 0;
    const playing = safeCall(player, ['isPlaying', 'getPlaying'], undefined);
    const pausedValue = safeCall(player, ['isPaused', 'getPaused'], undefined);
    const paused = typeof pausedValue === 'boolean'
      ? pausedValue
      : (typeof playing === 'boolean' ? !playing : Boolean(fallback?.paused));
    const playbackRate = Number(safeCall(player, ['getPlaybackRate'], fallback?.playbackRate || 1)) || 1;

    return {
      ready: true,
      paused,
      currentTime: Math.max(0, currentMs / 1000),
      duration: Math.max(0, durationMs / 1000),
      playbackRate
    };
  }

  async function execute(command = {}) {
    const player = getActivePlayer();
    const kind = command.kind;
    const before = getStatus(player);

    if (kind === 'status') return { ok: true, status: before };

    if (kind === 'play') {
      if (Number.isFinite(command.time) && Math.abs(before.currentTime - command.time) > 1.0) {
        await Promise.resolve(player.seek(Math.max(0, command.time) * 1000));
      }
      await Promise.resolve(player.play());
    } else if (kind === 'pause') {
      // Do not write HTMLMediaElement.currentTime here. Netflix can raise M7375
      // when an extension pauses and immediately performs a raw media-element seek.
      await Promise.resolve(player.pause());
    } else if (kind === 'seek') {
      if (!Number.isFinite(command.time)) throw new Error('Invalid seek time.');
      await Promise.resolve(player.seek(Math.max(0, command.time) * 1000));
    } else if (kind === 'skip') {
      const amount = Number(command.amount || 0);
      await Promise.resolve(player.seek(Math.max(0, before.currentTime + amount) * 1000));
    } else if (kind === 'sync') {
      const sentAt = Number(command.sentAt || Date.now());
      const latencySeconds = Math.max(0, (Date.now() - sentAt) / 1000);
      const base = Number(command.time || 0);
      const target = command.paused ? base : base + latencySeconds * Number(command.rate || 1);
      const drift = target - before.currentTime;

      if (command.paused) {
        if (!before.paused) await Promise.resolve(player.pause());
        if (Math.abs(drift) > 0.85) await Promise.resolve(player.seek(Math.max(0, target) * 1000));
      } else {
        if (Math.abs(drift) > 1.0) await Promise.resolve(player.seek(Math.max(0, target) * 1000));
        if (before.paused) await Promise.resolve(player.play());
      }
    } else if (kind === 'set-rate') {
      if (typeof player.setPlaybackRate === 'function') {
        await Promise.resolve(player.setPlaybackRate(Number(command.rate) || 1));
      }
    } else {
      throw new Error('Unsupported Netflix player command.');
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
    return { ok: true, status: getStatus(player) };
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_APP || data.type !== 'APS_NETFLIX_COMMAND' || !data.requestId) return;

    try {
      const result = await execute(data.command);
      window.postMessage({
        source: SOURCE_BRIDGE,
        type: 'APS_NETFLIX_RESULT',
        requestId: data.requestId,
        result
      }, location.origin);
    } catch (error) {
      window.postMessage({
        source: SOURCE_BRIDGE,
        type: 'APS_NETFLIX_RESULT',
        requestId: data.requestId,
        result: { ok: false, error: error?.message || 'Netflix control failed.' }
      }, location.origin);
    }
  });
})();

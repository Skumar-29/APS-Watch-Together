import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '../extension');
const bridgeSource = fs.readFileSync(path.join(extensionDir, 'prime-bridge.js'), 'utf8');

function makeVideo({ duration = 3600, paused = false, width = 1920, height = 1080, context = 'atvwebplayer player' } = {}) {
  const calls = { play: 0, pause: 0, seek: 0 };
  const parentElement = {
    id: '',
    className: context,
    parentElement: null,
    getAttribute() { return ''; }
  };
  const video = {
    isConnected: true,
    paused,
    currentTime: 120,
    duration,
    readyState: 4,
    playbackRate: 1,
    parentElement,
    seekable: {
      length: 1,
      start() { return 0; },
      end() { return duration; }
    },
    getBoundingClientRect() { return { width, height }; },
    async play() { calls.play += 1; this.paused = false; },
    pause() { calls.pause += 1; this.paused = true; },
    fastSeek(time) { calls.seek += 1; this.currentTime = time; }
  };
  return { video, calls };
}

function createBridge(videos) {
  let messageHandler;
  const outputs = [];
  const windowObject = {
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
    postMessage(data) { outputs.push(data); }
  };
  const documentObject = {
    pictureInPictureElement: null,
    fullscreenElement: null,
    querySelectorAll(selector) {
      if (selector === 'video') return videos;
      return [];
    }
  };
  const context = vm.createContext({
    window: windowObject,
    document: documentObject,
    location: { origin: 'https://www.primevideo.com' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    Number,
    Math,
    String,
    Error,
    RegExp
  });
  windowObject.window = windowObject;
  vm.runInContext(bridgeSource, context, { filename: 'prime-bridge.js' });
  assert.equal(typeof messageHandler, 'function');

  async function command(command, requestId = `request-${outputs.length + 1}`) {
    outputs.length = 0;
    await messageHandler({
      source: windowObject,
      origin: 'https://www.primevideo.com',
      data: {
        source: 'APS_WATCH_TOGETHER',
        type: 'APS_PRIME_COMMAND',
        requestId,
        command
      }
    });
    return outputs.at(-1)?.result;
  }

  return { command };
}

test('Prime Pause changes only playback state and never seeks', async () => {
  const main = makeVideo({ paused: false });
  const bridge = createBridge([main.video]);
  const before = main.video.currentTime;
  const result = await bridge.command({ kind: 'pause', time: 900, commandId: 'pause-1' });
  assert.equal(result.ok, true);
  assert.equal(main.calls.pause, 1);
  assert.equal(main.calls.seek, 0);
  assert.equal(main.video.currentTime, before);
});

test('Prime Play does not seek to a potentially stale timestamp', async () => {
  const main = makeVideo({ paused: true });
  const bridge = createBridge([main.video]);
  const before = main.video.currentTime;
  const result = await bridge.command({ kind: 'play', time: 900, commandId: 'play-1' });
  assert.equal(result.ok, true);
  assert.equal(main.calls.play, 1);
  assert.equal(main.calls.seek, 0);
  assert.equal(main.video.currentTime, before);
});

test('Prime adapter prefers the full title over a short preview or advertisement', async () => {
  const preview = makeVideo({ duration: 25, paused: false, width: 640, height: 360, context: 'preview advertisement promo' });
  const main = makeVideo({ duration: 3600, paused: false, width: 1920, height: 1080, context: 'atvwebplayer player' });
  const bridge = createBridge([preview.video, main.video]);
  const result = await bridge.command({ kind: 'pause', commandId: 'pause-main' });
  assert.equal(result.ok, true);
  assert.equal(main.calls.pause, 1);
  assert.equal(preview.calls.pause, 0);
  assert.equal(result.status.duration, 3600);
});

test('Prime synchronization uses thresholded seeking without playback-rate correction', async () => {
  const main = makeVideo({ paused: false });
  const bridge = createBridge([main.video]);
  await bridge.command({ kind: 'sync', time: 120.4, paused: false, rate: 1, sentAt: Date.now(), commandId: 'sync-small' });
  assert.equal(main.calls.seek, 0);
  assert.equal(main.video.playbackRate, 1);

  await bridge.command({ kind: 'sync', time: 130, paused: false, rate: 1, sentAt: Date.now(), commandId: 'sync-large' });
  assert.equal(main.calls.seek, 1);
  assert.equal(main.video.playbackRate, 1);
});

test('v1.6.0 injects the Prime bridge and suppresses refresh/event feedback', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  const content = fs.readFileSync(path.join(extensionDir, 'content.js'), 'utf8');
  const prime = fs.readFileSync(path.join(extensionDir, 'prime-bridge.js'), 'utf8');

  assert.equal(manifest.version, '1.6.0');
  assert.ok(manifest.content_scripts.some((entry) => entry.js?.includes('prime-bridge.js') && entry.world === 'MAIN'));
  assert.match(content, /APS_PRIME_COMMAND/);
  assert.match(content, /localEventsSuppressedUntil/);
  assert.match(content, /location\.href !== state\.lastLocationHref/);
  assert.match(prime, /Never write currentTime as part of Pause/);
  assert.match(prime, /Do not use temporary playback-rate correction on Prime Video/);
});

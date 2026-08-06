import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveMediaMode, withExactDevice } from '../extension/media-tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '../extension');
const read = (name) => fs.readFileSync(path.join(extensionDir, name), 'utf8');

test('derives all four media modes from simple camera and microphone intent', () => {
  assert.equal(deriveMediaMode({ audio: true, video: true }), 'av');
  assert.equal(deriveMediaMode({ audio: true, video: false }), 'audio');
  assert.equal(deriveMediaMode({ audio: false, video: true }), 'video');
  assert.equal(deriveMediaMode({ audio: false, video: false }), 'watch');
});

test('adds an exact selected device without mutating the original constraints', () => {
  const base = { echoCancellation: true };
  const result = withExactDevice(base, 'device-123');
  assert.deepEqual(base, { echoCancellation: true });
  assert.deepEqual(result, { echoCancellation: true, deviceId: { exact: 'device-123' } });
});

test('v1.5.1 preserves live device switching in both full and Cinema controls', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const sidepanel = read('sidepanel.js');
  const cinema = read('cinema.js');
  const sidepanelHtml = read('sidepanel.html');
  const cinemaHtml = read('cinema.html');

  assert.equal(manifest.version, '1.5.1');
  assert.match(sidepanel, /devicechange/);
  assert.match(sidepanel, /replaceLocalTrack/);
  assert.match(sidepanel, /applySelectedDevices/);
  assert.match(cinema, /devicechange/);
  assert.match(cinema, /replaceCinemaTrack/);
  assert.match(cinema, /applyCinemaDevices/);
  assert.match(sidepanelHtml, /id="callSettingsPanel"/);
  assert.match(cinemaHtml, /id="cinemaDevicePanel"/);
});

test('missing devices remain actionable instead of forcing a rejoin', () => {
  const sidepanel = read('sidepanel.js');
  const cinema = read('cinema.js');
  const options = read('options.js');

  assert.match(sidepanel, /button\.disabled = false/);
  assert.match(cinema, /button\.disabled = false/);
  assert.match(cinema, /Add mic/);
  assert.match(cinema, /Add camera/);
  assert.doesNotMatch(options, /Rejoin the room to apply call changes/);
});

test('speaker selection and peer track replacement use standard browser APIs', () => {
  const tools = read('media-tools.js');
  assert.match(tools, /replaceTrack\(track\)/);
  assert.match(tools, /setSinkId\(deviceId\)/);
  assert.match(tools, /transceiver\.direction = 'sendrecv'/);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'extension');
const dist = path.join(root, 'dist');
const target = path.join(dist, 'APS-Watch-Together-Extension');
const zipPath = path.join(dist, 'APS-Watch-Together-Extension.zip');
const serverArgIndex = process.argv.indexOf('--server');
const serverUrl = serverArgIndex >= 0 ? String(process.argv[serverArgIndex + 1] || '').trim() : '';

if (!/^wss:\/\/[a-z0-9.-]+(?::\d+)?\/ws(?:\?.*)?$/i.test(serverUrl)) {
  console.error('Usage: node tools/build-release.mjs --server wss://your-server.example.com/ws');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(source, target, { recursive: true });

for (const relative of ['background.js', 'options.js']) {
  const file = path.join(target, relative);
  const original = fs.readFileSync(file, 'utf8');
  const changed = original.replaceAll('ws://localhost:8787/ws', serverUrl);
  if (changed === original) throw new Error(`Could not inject server URL into ${relative}`);
  fs.writeFileSync(file, changed);
}

const manifestFile = path.join(target, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const server = new URL(serverUrl);
server.protocol = server.protocol === 'wss:' ? 'https:' : 'http:';
const inviteOriginPattern = `${server.origin}/*`;
const inviteJoinPattern = `${server.origin}/join/*`;
manifest.host_permissions = manifest.host_permissions.filter((pattern) => !/^http:\/\/localhost(?::\d+)?\//i.test(pattern));
if (!manifest.host_permissions.includes(inviteOriginPattern)) manifest.host_permissions.push(inviteOriginPattern);
const inviteScript = manifest.content_scripts.find((entry) => entry.js?.includes('invite.js'));
if (!inviteScript) throw new Error('Invite content script is missing from manifest.json');
inviteScript.matches = inviteScript.matches.filter((pattern) => !/^http:\/\/localhost(?::\d+)?\//i.test(pattern));
if (!inviteScript.matches.includes(inviteJoinPattern)) inviteScript.matches.push(inviteJoinPattern);
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

const releaseInfo = {
  builtAt: new Date().toISOString(),
  serverUrl,
  version: JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8')).version
};
fs.writeFileSync(path.join(target, 'release-info.json'), JSON.stringify(releaseInfo, null, 2) + '\n');

try {
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', target, zipPath], { stdio: 'inherit' });
} catch {
  execFileSync('zip', ['-qr', zipPath, path.basename(target)], { cwd: dist, stdio: 'inherit' });
}

console.log(`\nFriend package created:\n${zipPath}\n`);

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

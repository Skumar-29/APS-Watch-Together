# APS Watch Together

A private Chrome extension for synchronized Netflix, Prime Video and ZEE5 playback with peer-to-peer HD video calling, chat, reactions and genuine host controls.

> APS Watch Together does not stream, copy, record or retransmit movies. Every participant watches through their own account. The project is independent and is not affiliated with Netflix, Amazon or ZEE5.

## Included in version 1.3.0

- Chrome Manifest V3 extension
- Polished persistent side-panel interface
- Cinema Mode that hides the full panel while the room continues
- Movable compact camera view and always-on-top Document Picture-in-Picture
- Independent **Me** and **Friends** show/hide controls in compact and floating modes
- One-click return to full controls with safe host handoff
- Host Play, Pause, clickable timeline, ±10 seconds and Resync controls
- Continuous playback heartbeat and gentle drift correction
- Active HTML5 player detection for Netflix, Prime Video and ZEE5
- Wrong-service and clearly different-title protection
- Peer-to-peer WebRTC video calls
- Four participation modes: Video + Audio, Audio only, Video only and Watch only
- Automatic fallback when a selected camera or microphone is missing
- Receive-only WebRTC support so Watch-only participants can still see and hear friends
- Camera and microphone controls
- 360p, 720p and 1080p call-quality settings
- Echo cancellation, noise suppression and automatic microphone level
- Optional TURN configuration for difficult networks
- Private eight-character room codes
- Text chat and animated reactions
- Host-only or shared playback controls
- Host transfer and 12-second host reconnection grace period
- Ephemeral zero-dependency WebSocket signalling server
- Docker and Render deployment configuration
- Five automated server integration tests
- Mac friend-package builder

## Tested status

The following automated checks pass:

1. Room creation, friend joining and host playback relay
2. Host-only permission enforcement and shared-control switching
3. Host transfer after an intentional leave
4. Host ownership restoration after a short connection interruption
5. Room lock and reopen enforcement
6. Full-panel to Cinema Mode host handoff
7. JavaScript syntax validation
8. Manifest, referenced-file, duplicate-ID and Manifest V3 inline-script validation
9. Room-server health endpoint

The current execution environment prevents loading unpacked Chrome extensions by administrator policy. Therefore Netflix, Prime Video and ZEE5 must still be tested on real Chrome installations while signed into those services. Streaming websites can change their internal players, so live adapter testing is mandatory before calling the release final.

## Important expectations

The extension controls the active HTML5 video element. This synchronizes local playback without bypassing DRM, subscription checks or account access. A major player redesign by a streaming service can require an adapter update.

For dependable calling across corporate, hotel or carrier-grade networks, configure a TURN service. STUN-only WebRTC works on many home networks but cannot cover every network configuration.

For best quality, use two to four people at 720p. The room server permits up to eight, but peer-to-peer mesh calling becomes more demanding as participants are added.

## 1. Test the room server locally

Node.js 22 or newer is required. The server has no external runtime dependencies.

```bash
cd server
npm test
npm start
```

Health page:

```text
http://localhost:8787/health
```

Local extension server address:

```text
ws://localhost:8787/ws
```

## 2. Install the development extension

1. Open Chrome.
2. Visit `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the `extension` folder, not the entire project.
6. Pin **APS Watch Together** from Chrome’s Extensions menu.
7. Open Settings and save the room-server URL when prompted.

The extension requests permanent access only to its supported streaming sites. Access to your own room-server hostname is requested separately when you save that address.

## 3. Start a watch room

1. Open Netflix, Prime Video or ZEE5 in Chrome.
2. Open the same movie or episode on every laptop.
3. Click the APS extension icon to open the side panel.
4. The host creates a private room and shares its code.
5. Friends choose Video + Audio, Audio only, Video only or Watch only, then grant only the permissions they selected.
6. The host controls Play, Pause, Seek and Resync.

A streaming site or Chrome may require each participant to click its video player once before the first remote Play command. Later commands should work after this activation.


## Cinema Mode

After a room is connected, click **Cinema** beside the microphone and camera controls. APS opens a compact companion, reconnects the same room, preserves host ownership and closes the full side panel.

The compact companion can show your camera, your friends’ cameras, both, or neither. Hiding a preview does not turn that camera off, and call audio continues. You can:

- use **Me** to show or hide your own preview;
- use **Friends** to show or hide all friend previews;
- drag the compact popup anywhere;
- click **Float call** for an always-on-top movable call window;
- use the same Me/Friends toggles in the floating window;
- mute the microphone or turn your camera off;
- click **Full controls** to restore the complete side panel.

The always-on-top window uses Chrome's Document Picture-in-Picture API. Chrome does not let an extension choose an arbitrary screen coordinate, but the user can freely drag the window after it opens. Chrome 141 or newer is required.

## 4. Deploy for remote friends

### Render Blueprint

1. Upload this full project to a private GitHub repository.
2. In Render, choose **New → Blueprint**.
3. Select the repository; Render reads `render.yaml`.
4. After deployment, copy the secure service hostname.
5. The extension address will be:

```text
wss://YOUR-RENDER-HOST/ws
```

### Any Docker host

```bash
docker build -t aps-watch-server ./server
docker run --rm -p 8787:8787 aps-watch-server
```

Production must be behind HTTPS/TLS so the extension can connect through `wss://`.

## 5. Create the easiest friend package

On your Mac, double-click:

```text
Create-Friend-Package.command
```

Paste the deployed `wss://.../ws` address. It creates:

```text
dist/APS-Watch-Together-Extension.zip
```

The server address is already inserted into that friend package. Friends only unzip it, use **Load unpacked**, pin the extension and join your room.

Chrome deliberately does not permit a normal webpage to silently install an unpacked extension. Truly one-click installation and automatic updating requires Chrome Web Store distribution after live testing.

## Privacy and security design

- Movie data never enters the APS server.
- Call audio/video travels through WebRTC peer connections; TURN is used only when direct routing fails.
- The server holds rooms and chat only in memory.
- Rooms disappear after expiry or server restart.
- No analytics, advertising SDKs or user accounts are included.
- Production signalling uses TLS through `wss://`.
- TURN credentials stay in Chrome’s local extension storage.

## Project structure

```text
extension/       Chrome extension, player bridge and WebRTC calling
server/         Ephemeral room and signalling service
test/            Integration tests
tools/           Release package builder
render.yaml      Render deployment blueprint
START_HERE.html  Visual owner setup guide
```


## Browser scope

Version 1.3 is Chrome-first on macOS and Windows. Safari packaging can follow after Chrome playback adapters are stable. Safari requires an Xcode wrapper and separate platform testing.

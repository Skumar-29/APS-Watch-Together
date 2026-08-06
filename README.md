# APS Watch Together

APS Watch Together is a private Chrome extension for synchronized Netflix, Prime Video and ZEE5 playback, peer-to-peer video calling, direct room invitations, screen sharing, chat and genuine host controls.

> APS Watch Together never streams, copies, records or retransmits a movie. Every participant watches through their own legal account. The project is independent and is not affiliated with Netflix, Amazon or ZEE5.

## Version 1.6.0 — Collaboration + Prime Stability Update

Everything from v1.4.0 remains available, including Netflix-safe playback control, live camera/microphone attachment, device switching without rejoining, Cinema Mode and independent Me/Friends visibility.

New in v1.6.0:

- **Dedicated Prime Video control bridge** instead of the generic raw-video path
- Prime Play and Pause no longer perform an immediate timestamp write
- Safer seek thresholds and no temporary playback-speed correction on Prime
- Better selection of the real movie player over previews, promos and ad videos
- Refresh and route-change event suppression to prevent Play/Pause feedback loops
- Duplicate-command protection during reconnects

- **Screen sharing** for a Chrome tab, application window or full display
- One presenter at a time, with clear presenter status and Stop Sharing controls
- Local **Hide/Show shared screen** without stopping the presenter
- Camera call continues while a screen is being presented
- Modern meeting toolbar: Mic, Camera, Share, Devices and Cinema
- Meet-style responsive camera grid when no one is presenting
- Compact organized camera dock while a screen share is visible
- **Direct room invitation links** in addition to room codes
- Professional invitation page hosted by the existing APS room server
- Invite links prefill the room code and open the APS side panel when v1.6.0 is installed
- Existing room locking, host-only/shared control, chat and reactions are preserved

## Complete feature set

- Chrome Manifest V3 extension
- Persistent polished side-panel interface
- Netflix-safe, Prime-stable and ZEE5 player adapters
- Host Play, Pause, clickable timeline, ±10 seconds and Resync
- Continuous playback heartbeat and drift correction
- Wrong-service and clearly different-title protection
- Peer-to-peer WebRTC camera and microphone calls
- Camera/Microphone switches before joining
- Start or attach a camera/microphone after joining
- Change camera, microphone, speaker/headphones and 360p/720p/1080p quality without leaving
- Automatic device-change detection and recovery
- Watch-only, audio-only, video-only and full audio/video participation
- Screen sharing with camera call preserved
- Direct invitation link and room-code joining
- Responsive Meet-style camera layouts
- Cinema Mode and movable always-on-top floating call
- Independent Me/Friends show/hide controls
- Private eight-character room codes
- Room lock
- Host-only or shared playback controls
- Host transfer and brief host-reconnection grace period
- Text chat and animated reactions
- Optional TURN configuration
- Zero-dependency ephemeral WebSocket server
- Docker and Render Blueprint deployment
- Private friend-package builder

## Important screen-sharing boundary

Chrome asks the presenter to choose and approve a tab, application window or display each time. APS does not capture a screen silently and does not store the shared content.

Netflix, Prime Video and ZEE5 use DRM. Their protected movie picture may appear black, stop, or produce a playback error when selected for screen sharing. APS does not attempt to bypass that protection. Screen sharing is intended for movie selection, websites, documents, photos, presentations, app setup and troubleshooting. The protected movie continues to play separately through each participant's own OTT account while APS synchronizes playback.

## Direct invite links

The host clicks **Invite** after creating a room. APS produces a link such as:

```text
https://YOUR-ROOM-SERVER/join/ABCD-EFGH
```

A friend can:

1. Click the link with APS v1.6.0 installed.
2. Click **Open APS and join room** on the invitation page.
3. Enter their name if it is not already saved.
4. Join with the room code already filled in.

The invitation page also displays the normal room code, so joining by code remains available. The link cannot silently install the unpacked Chrome extension; the friend must install v1.6.0 first.

## Tested status

Nineteen automated tests pass, covering:

1. Invite URL creation and room-code normalization
2. Screen-stream identification
3. All camera/microphone participation modes
4. Exact selected-device constraints
5. Live device switching in full and Cinema controls
6. Actionable missing-device recovery
7. Speaker routing and peer track replacement paths
8. Room creation, friend joining and playback relay
9. Host-only and shared-control enforcement
10. Host transfer after leaving
11. Host recovery after a brief interruption
12. Room lock and reopen
13. Full-panel to Cinema Mode host handoff
14. Single-presenter screen-sharing enforcement and release
15. Prime Pause without an unwanted seek
16. Prime Play without a stale timestamp seek
17. Main-title selection over previews and ads
18. Thresholded Prime synchronization without rate correction
19. Prime bridge injection and refresh-feedback suppression

All extension, server and build JavaScript files pass syntax validation. The invitation endpoint and built package are also checked during release verification.

This build environment cannot sign into OTT services, load an unpacked extension under a normal Chrome profile, use physical cameras, or connect two real laptops. Real Chrome screen-picker, camera grid and OTT playback behaviour must still be confirmed on the owner's and a friend's laptops.

## 1. Run locally

Node.js 22 or newer is required.

```bash
cd server
npm test
npm start
```

Health page:

```text
http://localhost:8787/health
```

Local invitation example:

```text
http://localhost:8787/join/ABCD-EFGH
```

Local extension server URL:

```text
ws://localhost:8787/ws
```

## 2. Install the development extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Choose the `extension` folder.
5. Pin APS Watch Together.
6. Open Settings and save the room-server URL.
7. Refresh an already-open OTT tab after installing or updating.

## 3. Start a room

1. Everyone opens Chrome and signs into their own OTT account.
2. Everyone opens the same movie or episode.
3. The host opens APS and creates a private room.
4. The host sends either the direct invitation link or room code.
5. Friends join with Camera/Microphone on or off as preferred.
6. The host locks the room when everyone has joined.
7. Host playback controls synchronize everyone.

### Screen share

1. Click **Share**.
2. Select a Chrome tab, window or display in Chrome's picker.
3. Enable tab audio only when appropriate and use headphones to avoid echo.
4. Cameras remain visible in an organized dock.
5. Viewers can hide/show the shared screen locally.
6. The presenter clicks **Stop Sharing** or Chrome's own stop control.

## 4. Deploy for remote friends

This update changes both the extension and the server. Upload the complete v1.6.0 source to the GitHub repository. Render's `autoDeploy: true` setting should redeploy the server automatically. Wait for **Live** before sharing the new package.

Render Blueprint steps:

1. Upload this full source project to the existing GitHub repository on the `main` branch.
2. Confirm Render starts a new deployment.
3. Wait until the service is **Live**.
4. Verify `https://YOUR-HOST/health`.
5. Verify an invitation page such as `https://YOUR-HOST/join/ABCD-EFGH`.

## 5. Build the friend package

Double-click:

```text
Create-Friend-Package.command
```

Paste the deployed `wss://.../ws` address. It creates:

```text
dist/APS-Watch-Together-Extension.zip
```

The build tool inserts both the WebSocket server URL and the corresponding secure invitation-page permission into the friend package.

## Privacy and security

- Movies never enter the APS server.
- Camera, microphone and screen-share media use WebRTC peer connections.
- TURN is used only when configured and direct peer routing fails.
- Rooms, transient chat and presenter state are held in memory.
- Rooms disappear after expiry or server restart.
- No analytics, advertising SDKs or user accounts are included.
- Screen sharing always requires an explicit Chrome picker approval.

## Browser scope

Version 1.6.0 is Chrome-first on macOS, Windows and desktop ChromeOS. Mobile Chrome cannot install this unpacked extension. Safari would require separate Xcode packaging and live platform testing.

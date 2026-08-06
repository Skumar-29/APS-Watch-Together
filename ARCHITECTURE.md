# Architecture

```text
Direct invite link ──► APS server /join/ROOM ──► invite.js ──► side panel
                                                        │
┌────────────────────── Host Chrome ────────────────────▼───────────┐
│ OTT page ⇄ player adapter ⇄ full side panel                       │
│                                  │                                 │
│                                  ├─ Camera/mic WebRTC mesh ─────┐  │
│                                  ├─ Screen-share WebRTC tracks ─┤  │
│                                  └─ Cinema / floating call ─────┤  │
└───────────────────────┬──────────────────────────────────────────┘
                        │ WSS room state, playback, invites,
                        │ signalling and presenter coordination
                        ▼
               ┌────────────────────┐          encrypted media
               │ APS room server    │──────────────────────────────►
               │ ephemeral memory   │        Friends' Chrome browsers
               └────────────────────┘        own OTT accounts/players
```

## Extension components

- `background.js`: side-panel lifecycle, direct-invite opening, Cinema window creation and active OTT-tab routing
- `invite.js`: handles a deliberate click on the server-hosted invitation page and opens APS with a pending room code
- `collaboration-tools.js`: room-link formatting and screen-stream classification
- `content.js`: detects and controls the active HTML5/player adapter
- `netflix-bridge.js`: Netflix-safe page-world player access
- `sidepanel.js`: full room UI, playback controls, call devices, screen sharing, direct invitations, chat and Cinema handoff
- `cinema.js`: compact room engine, camera views, screen presentation, remote audio, device changes and full-panel restoration
- `options.js`: room server, call quality and optional TURN configuration

## Direct invitation flow

1. The host creates a room and clicks **Invite**.
2. The extension derives the HTTPS invitation origin from the configured WSS room server.
3. The server renders `/join/ROOM-CODE` with live room availability and the normal room code.
4. A v1.5.1 extension content script handles the user's **Open APS and join room** click.
5. The background worker stores a short-lived pending invitation, focuses a supported OTT tab when available and opens the side panel.
6. The side panel preloads the room code and joins after a saved display name is available.

## Screen-sharing strategy

1. A participant deliberately clicks **Share**.
2. Chrome's `getDisplayMedia()` picker requires the participant to select a tab, window or display.
3. APS adds screen tracks to each existing peer connection without replacing the camera or microphone tracks.
4. The room server coordinates one active presenter and publishes only presenter metadata and stream ID.
5. Receivers classify the extra WebRTC stream as the presentation and place cameras in a compact dock.
6. Hiding a presentation changes only the local UI; it does not stop sharing for other viewers.
7. When the presenter or host stops sharing, screen tracks are removed and the camera grid returns to its normal layout.

## Cinema Mode handoff

1. The full panel stores the active room and opens the compact Cinema window.
2. Cinema joins with the same stable session ID.
3. The server reclaims host ownership for the new connection.
4. Cinema signals readiness; the full panel disconnects without an intentional leave.
5. Camera, microphone, screen-share and playback state continue in Cinema.
6. **Full controls** reverses the handoff.

## Synchronization strategy

1. Host playback events become room commands.
2. Commands include media time, paused state, playback rate and sender wall-clock time.
3. Guests estimate expected current media time after network transit.
4. Large drift triggers an absolute seek through the relevant player adapter.
5. Small drift uses temporary playback-rate correction where supported.
6. The active host surface sends authoritative state every three seconds.

## Calling and layout strategy

The release uses WebRTC mesh calling. Each participant connects directly to every other participant. The normal view uses a responsive camera grid. During presentation, screen content becomes the main stage and camera cards move into a compact organized dock. Cinema Mode can show Me, Friends, both or neither. Two to four participants is the recommended premium-quality range.

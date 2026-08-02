# Architecture

```text
┌──────────────────────── Host Chrome ──────────────────────────────┐
│ Streaming page ⇄ content.js ⇄ full side panel                    │
│                                  │                                │
│                                  ├─ Cinema handoff ───────────┐   │
│                                  ▼                            │   │
│                     compact cinema window                    │   │
│                     WebRTC + WSS + player sync                │   │
│                                  │                            │   │
│                                  └─ always-on-top call PiP ◄──┘   │
└───────────────────────┬─────────────────────┬──────────────────────┘
                        │ playback/signalling │ encrypted media
                        │ over WSS            │ peer-to-peer/TURN
                        ▼                     ▼
               ┌─────────────────┐   ┌─────────────────────────┐
               │ APS room server │   │ Friends' Chrome browsers│
               │ signalling only │   │ own OTT accounts/players│
               └─────────────────┘   └─────────────────────────┘
```

## Extension components

- `background.js`: side-panel lifecycle, compact-window creation and active movie-tab routing
- `content.js`: detects and controls the active HTML5/player adapter
- `netflix-bridge.js`: Netflix-safe page-world player access
- `sidepanel.js`: full room UI, playback controls, WebRTC, chat and Cinema Mode handoff
- `cinema.js`: compact room engine, local/remote video rendering, independent visibility controls, remote audio, playback heartbeat and restoration handoff
- `cinema.html` / `cinema.css`: movable compact multi-camera view and Document Picture-in-Picture UI
- `options.js`: room server, call quality and TURN configuration

## Cinema Mode handoff

1. The full panel stores the active room and opens the compact cinema window.
2. The cinema window joins with the same stable session ID.
3. The server reclaims host ownership for the new cinema connection.
4. Cinema signals readiness; the old full-panel connection closes without an intentional leave.
5. The side panel closes and Cinema Mode continues WebRTC, WSS and playback synchronization.
6. **Full controls** opens the side panel, which rejoins with the same session ID.
7. Once the panel is ready, Cinema Mode closes without transferring host ownership.

## Synchronization strategy

1. Host playback events become room commands.
2. Commands include media time, paused state, playback rate and sender wall-clock time.
3. Guests estimate the expected current media time after network transit.
4. Large drift triggers an absolute seek through the relevant player adapter.
5. Small drift uses a temporary playback-rate correction where supported.
6. The active host surface—full panel or Cinema Mode—sends authoritative state every three seconds.

## Calling strategy

The release uses WebRTC mesh calling. Each participant connects directly to every other participant. Cinema Mode receives all streams and can render the local preview, remote previews, both, or neither. Visibility changes affect only the interface; remote audio and WebRTC connections remain active. Two to four participants is the recommended premium-quality range.

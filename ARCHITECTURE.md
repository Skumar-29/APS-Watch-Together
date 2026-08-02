# Architecture

```text
┌──────────────────────── Host Chrome ────────────────────────┐
│ Streaming page  ⇄  content.js  ⇄  APS side panel           │
│       local HTML5 video          WebRTC camera/mic + UI      │
└───────────────────────┬───────────────────┬──────────────────┘
                        │ playback/chat     │ encrypted media
                        │ over WSS          │ peer-to-peer/TURN
                        ▼                   ▼
               ┌─────────────────┐   ┌─────────────────────────┐
               │ APS room server │   │ Friends' Chrome browsers│
               │ signalling only │   │ own OTT accounts/players│
               └─────────────────┘   └─────────────────────────┘
```

## Extension components

- `background.js`: side-panel behaviour and active-tab message routing
- `content.js`: detects and controls the active HTML5 video element
- `sidepanel.js`: room connection, synchronization, WebRTC, chat and interface state
- `options.js`: room server, call quality and TURN configuration

## Synchronization strategy

1. Host playback events become room commands.
2. Commands include media time, paused state, playback rate and sender wall-clock time.
3. Guests estimate the expected current media time after network transit.
4. Large drift triggers an absolute seek.
5. Small drift uses a temporary ±4.5% playback-rate correction.
6. A host heartbeat sends authoritative state every three seconds.

## Calling strategy

The first release uses WebRTC mesh calling. Each participant connects directly to every other participant. This avoids a media server and preserves privacy, but bandwidth and CPU use increase with room size. Two to four participants is the recommended premium-quality range.

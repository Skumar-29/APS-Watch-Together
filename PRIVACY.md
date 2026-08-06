# Privacy — APS Watch Together

## Data APS does not collect

- Movie or television video
- Streaming-service passwords, cookies or account details
- Browser history outside supported OTT pages and the owner's APS invitation page
- Analytics, advertising identifiers or tracking profiles
- Camera, microphone or screen recordings

## Data used during a room

The signalling server temporarily processes display names, room membership, playback commands, chat messages, WebRTC connection descriptions and the identity/stream ID of the active screen presenter. These values are held in memory only and are removed when the room expires or the server restarts.

Camera, microphone and shared-screen media use WebRTC peer connections. When a direct route is impossible, a configured TURN relay may carry encrypted WebRTC packets. The APS room server itself never receives call or screen-share media.

## Direct invitation pages

A direct invitation URL contains the room code. The server page may display whether the room is available and its current participant count. Clicking **Open APS and join room** stores a short-lived pending room code in local Chrome extension storage so the APS side panel can open and prefill the invitation. No OTT account information is included in the link.

## Local storage

The Chrome extension stores the user's display name, camera/microphone intent, selected devices, call-quality preferences, screen visibility preferences, room-server URL and optional TURN credentials on that computer. A pending invite is time-limited.

## Screen selection

Chrome presents its own screen-picker each time sharing begins. APS cannot silently select or capture a tab, window or monitor. Screen content is not stored by APS.

## Streaming services

Netflix, Prime Video and ZEE5 remain separate services governed by their own privacy policies. APS Watch Together does not sign users into those services or read their passwords.

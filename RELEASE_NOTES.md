# APS Watch Together v1.5.1 — Collaboration + Prime Stability Update

## Existing features preserved

- Netflix-safe Play, Pause, Seek, ±10 seconds and Resync
- Prime Video and ZEE5 adapters
- Host-only or shared playback control
- Room lock, chat and reactions
- Camera/microphone attach, recovery and device switching without rejoining
- Watch-only/audio-only/video-only/full call modes
- Cinema Mode, floating call and independent Me/Friends visibility


## Prime Video stability fix

- Adds a dedicated Prime Video bridge running in the page context.
- Play and Pause change only playback state; they no longer combine the action with an immediate raw timestamp write.
- Seeks are clamped to playable ranges and used only when drift is large enough.
- Temporary playback-rate correction is disabled on Prime Video to reduce buffering and player-state churn.
- The adapter prefers the full movie/episode player over short previews, promos or advertising videos.
- Refresh and in-site navigation events are suppressed briefly so automatic player startup does not broadcast false Play/Pause commands to the room.
- Duplicate commands are ignored safely during reconnects.

Netflix handling remains unchanged from the working Netflix-safe version. ZEE5 handling is also unchanged.

## Screen sharing

- Share a Chrome tab, application window or full display using Chrome's secure picker.
- Camera and microphone calls continue while presenting.
- One participant presents at a time to keep the room organized.
- Host or presenter can stop the active presentation.
- Viewers can hide or show the shared screen locally without interrupting it for others.
- The presenter can stop from APS or Chrome's native sharing indicator.
- Shared media is peer-to-peer and is not recorded or stored by APS.

## Direct room invitations

- Adds a separate **Invite** button beside the room code.
- Copies or shares a direct `/join/ROOM-CODE` HTTPS link.
- Adds a professional server-hosted invitation page showing live room availability.
- With v1.5.1 installed, clicking the page's button opens APS and preloads the room.
- Traditional room-code joining remains unchanged.

## Modern meeting layout

- Reorganizes call actions into labeled Mic, Camera, Share, Devices and Cinema controls.
- Uses a responsive Meet-style camera grid when no presentation is active.
- Moves cameras into a compact organized dock when viewing a shared screen.
- Keeps local and friend video cards visually consistent and clearly labeled.

## Deployment requirement

Unlike extension-only updates, v1.5.1 adds a server invitation route and screen-presenter state. Upload the full v1.5.1 source to GitHub and wait for Render to redeploy before using direct invite links or screen-sharing coordination. Every participant should replace the old unpacked extension with v1.5.1.

## DRM boundary

Screen sharing does not bypass DRM. Protected Netflix, Prime Video or ZEE5 movie video may appear black or error when captured. Use screen share for normal tabs, documents, photos, setup and collaboration while everyone watches the movie locally through their own account.

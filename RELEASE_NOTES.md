# APS Watch Together v1.2.0 — Flexible Camera Views

## Camera view controls

- Adds a **Me** button to show or hide the local camera preview.
- Adds a **Friends** button to show or hide all friend camera previews.
- Allows four layouts: both visible, only Me, only Friends, or both hidden.
- Hiding a preview does not turn the camera off and does not interrupt call audio.
- Automatically displays friend video streams in Cinema Mode after they join.
- Shows camera-off, muted, connecting and live states on friend tiles.
- Supports up to four visible friend tiles in compact mode, with a +N indicator for larger rooms.
- Remembers the user's Me/Friends visibility choices.

## Floating call window

- Replaces the self-only floating view with an always-on-top **floating call** view.
- The floating window can show Me, Friends, both or neither.
- The same Me/Friends controls are available inside the floating window.
- The floating window remains movable and resizable by the user.
- Full controls, microphone and camera controls remain available.

## Retained reliability fixes

- Retains the Netflix-safe player bridge that avoids direct DRM-video timestamp mutation.
- Retains the macOS camera/microphone permission flow.
- Retains Settings close buttons and safe full-panel ↔ Cinema Mode host handoff.
- Render server configuration is unchanged.

## External limitations

- Chrome chooses the initial floating-window position; the user can drag it afterward.
- A TURN relay is recommended for restrictive corporate, hotel and carrier networks.
- Netflix, Prime Video and ZEE5 can change their website players and may require future adapter updates.

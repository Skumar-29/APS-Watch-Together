# APS Watch Together v1.3.0 — Flexible Device Modes

## New participation modes

- **Video + Audio:** full camera and microphone call.
- **Audio only:** joins without requiring a camera.
- **Video only:** joins without requiring a microphone.
- **Watch only:** joins with no camera or microphone while playback sync, chat and reactions continue.

## Missing-device resilience

- Camera and microphone are requested independently.
- A missing camera no longer blocks a working microphone.
- A missing microphone no longer blocks a working camera.
- If neither selected device exists, the participant automatically continues in Watch-only operation.
- The permission page includes a clear **Continue in Watch only mode** option.
- Device buttons are disabled and labelled when no corresponding device is active.

## Receive-only calling

- Adds receive-only WebRTC audio/video transceivers when the participant sends no local track.
- Watch-only participants can still see friends' cameras and hear friends' audio.
- Audio-only and video-only participants can still receive both remote audio and video.
- Cinema Mode and the floating call window preserve the selected participation mode.

## Retained features and fixes

- Netflix-safe Play, Pause, Seek and Resync bridge.
- Separate Me/Friends show-hide controls.
- Movable always-on-top floating call window.
- macOS full-tab permission flow.
- Host handoff, room locking, chat and reactions.
- Existing Render room server remains compatible; no redeployment is required for extension use.

## Testing boundary

Static validation and all six room-server integration tests pass. Physical no-camera/no-microphone laptops and live OTT accounts are still required for final real-device confirmation.

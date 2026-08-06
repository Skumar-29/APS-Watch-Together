# Security Notes — APS Watch Together

## Current private-use security model

- Eight-character non-ambiguous room codes
- Direct invitation links contain only the room code and reveal no password or OTT credentials
- Short-lived pending invite stored locally after an explicit invitation-page click
- Host-controlled room locking
- Host-only playback controls by default
- One active screen presenter at a time
- Chrome requires explicit user selection for every screen-share session
- TLS required for production signalling (`wss://`)
- WebRTC media encryption provided by the browser
- Ephemeral in-memory rooms, chat and presenter state
- Message-size limits and per-connection rate limiting
- Input length limits, HTML escaping and restrictive response headers
- No remotely hosted extension code

## Owner responsibilities

- Keep the GitHub repository private while testing.
- Share invitation links only with intended participants.
- Lock the room after invited friends have joined.
- Do not publish TURN passwords in the repository.
- Use a trusted TLS-enabled deployment provider.
- Rotate TURN credentials if a package is shared beyond the intended group.
- Update the extension if a streaming website changes its player.

## Screen-sharing boundary

APS does not bypass DRM or protected capture. Chrome and the operating system control what can be selected and what protected content can appear. The extension does not record or upload screen-share content.

## Not designed for

This personal build is not an identity-verified secure communications product. Anyone who obtains an unlocked room code or invitation link can attempt to join. It should not be used for confidential business, medical, legal or emergency communication.

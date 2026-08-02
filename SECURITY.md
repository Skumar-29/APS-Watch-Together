# Security Notes — APS Watch Together

## Current private-use security model

- Eight-character non-ambiguous room codes
- Host-controlled room locking
- Host-only playback controls by default
- TLS required for production signalling (`wss://`)
- WebRTC media encryption provided by the browser
- Ephemeral in-memory rooms
- Message-size limits and per-connection rate limiting
- Input length limits and HTML escaping in the interface
- No remotely hosted extension code

## Owner responsibilities

- Keep the GitHub repository private while testing.
- Do not publish TURN passwords in the repository.
- Use a trusted TLS-enabled deployment provider.
- Lock the room after invited friends have joined.
- Rotate TURN credentials if the package is shared beyond the intended group.
- Update the extension if a streaming website changes its player.

## Not designed for

This personal build is not an identity-verified secure communications product. Anyone who obtains an unlocked room code can attempt to join. It should not be used for confidential business, medical, legal or emergency communication.

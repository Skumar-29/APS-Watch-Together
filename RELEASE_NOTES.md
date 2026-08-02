# APS Watch Together 1.0.0 — Engineering Preview

## Ready

- Professional Chrome side-panel user interface
- Netflix, Prime Video and ZEE5 player bridge
- Real host playback commands
- Absolute seeking and continuous synchronization
- Soft speed correction for small timing drift
- HD peer-to-peer calling, chat and reactions
- Private ephemeral rooms
- Host recovery, host transfer and room locking
- Deployment and friend packaging workflow
- Automated signalling-server test suite

## Must be completed before friends rely on it

1. Deploy the room server and insert its `wss://` address.
2. Test Netflix playback using two real Chrome profiles/laptops.
3. Test Prime Video playback using two real Chrome profiles/laptops.
4. Test ZEE5 playback using two real Chrome profiles/laptops.
5. Verify camera/microphone permissions on both macOS and Windows.
6. Add TURN credentials and test from two different internet connections.
7. Fix any streaming-site adapter differences found during live tests.
8. Only then create and send the friend ZIP.

## Known external limitations

- Each friend needs their own legitimate access to the streaming service.
- Streaming websites may change their internal HTML player implementation.
- Browser autoplay rules can require one initial click in the player.
- Unpacked Chrome installation cannot be reduced to a silent one-click installer; Chrome Web Store publication is the later solution.

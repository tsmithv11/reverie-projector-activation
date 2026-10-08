# Lucy API verification — October 8, 2026

Sources checked before implementing the adapter:

- Official API: https://fal.ai/models/decart/lucy-2-5/realtime/api
- Schema: https://fal.ai/models/decart/lucy-2-5/realtime/llms.txt
- Official playground: https://fal.ai/models/decart/lucy-2-5/realtime
- Protocol reference, FAL JS SDK 1.10.1: `src/auth.js`, `src/realtime.js`, `src/utils.js`.

The official public API describes `decart/lucy-2-5/realtime` as a **signaling relay** with WebRTC media between client and Decart. Input schema: `prompt`, `enable_prompt_expansion`, `image_url` (unused for WebRTC), `reference_image_url` (optional JPEG/PNG/WebP reference of at least 512×512 for character replacement/try-on). The app uses prompt-only object replacement. No image-edit endpoint has been assumed.

The public playground's Lucy adapter creates a peer after `ready` or `iceServers`, exchanges `{type:'offer',sdp}`, `{type:'answer',sdp}` and `{type:'icecandidate',candidate}` via FAL realtime signaling, buffers early ICE, and receives a media stream. Our implementation follows this sequence, uses the provider's ICE list, and falls back to STUN after a one-second ICE grace period. The current shared-camera frame is painted continuously into a 1280×720 canvas supplied to `captureStream(30)`. The returned video is read with `requestVideoFrameCallback`, published with bounded backpressure to main and drawn continuously on the audience display.

FAL SDK `auth.js` plus `config.js` mint tokens through `POST https://rest.fal.ai/tokens/` with `allowed_apps` containing the **alias** (`lucy-2-5`) and `token_expiration`. The response is a JSON string, or a legacy `{detail: string}` wrapper. Main handles those exact forms and supplies only the resulting temporary token to the robot renderer. No automatic token refresh is needed within the maximum 100-second session lifetime; scoped tokens expire after 120 seconds.

Decoded output dimensions and pixel variance are checked before publication. The validator cannot judge semantic quality. There is no captured JPEG or reusable static result. First-frame display acknowledgement enables the slot; subsequent decoded frames update its canvas. Failure, a two-second input/output stall, scene exit, display closure or a bounded session deadline clears output and explicitly closes the peer and signaling socket before destroying the cloud window (four-second socket-close wait; five-second forced-cleanup deadline). Logs include error code, phase, elapsed time and scrubbed provider summaries without frames, tokens or SDP.

The FAL signaling transport opens `wss://fal.run` (the apex host); the robot CSP explicitly allows that exact signaling host. `securitypolicyviolation` reports `SIGNALING_BLOCKED`. An offline transport test uses the actual client and FAL MessagePack protocol with a mocked socket and local WebRTC peer. It checks that outgoing camera frames change, received frames change on the audience canvas, and stopping remote video causes the scene to be skipped.

The previous implementation used the same WebRTC endpoint to obtain a static photograph. That did not meet the live-conversion requirement and has been replaced. See VALIDATION.md for the latest continuous-video verification and its limits.

Pricing shown across FAL pages was inconsistent; the app makes no hard-coded dollar-cost claim. Verify current billing in the FAL console. Connection intervals, rolling-hour caps, app-session caps and bounded live duration apply before event use.


Electron documents that [`BrowserWindow.destroy()` skips `beforeunload`](https://www.electronjs.org/docs/latest/api/browser-window#windestroy). The previous normal-stop path relied on that handler to run cleanup, so it could not guarantee explicit disconnect. The replacement main-to-service stop/acknowledgement path exercises both close calls before teardown. The published FAL playground also closes signaling and the peer; no undocumented provider session-delete API or invented disconnect message is used. A local cleanup acknowledgement is not proof of server quota release.

The client now owns a single-use native WebSocket so shutdown can await its close event, cancel a still-connecting socket, and explicitly use normal close code 1000. It sends one initial input and never reconnects or replays input. This preserves the SDK wire format, scoped token and Lucy offer/answer/ICE protocol. Controlled socket/prompt/offer/close events are logged without URLs, credentials, SDP or ICE addresses. FAL keepalive envelopes are filtered; provider errors remain visible. The SDK 1.10.1 `close()` API did not expose close completion.

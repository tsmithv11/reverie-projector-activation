# Lucy API verification — October 8, 2026

## Direct Decart, with FAL backup

The primary provider uses official `@decartai/sdk` 0.2.5, `models.realtime("lucy-2.5")`, LiveKit media and `initialState.prompt` with enhancement disabled. Main mints a token through `POST https://api.decart.ai/v1/client/tokens` using `x-api-key`, with `expiresIn: 120`, `allowedModels: ["lucy-2.5"]` and `constraints.realtime.maxSessionDuration: 100` as a server-side backstop. Only the returned `apiKey` reaches the isolated service. The custom `reverie://` origin is not included in allowedOrigins because Decart requires HTTP(S) origins.

References: [JavaScript realtime API](https://docs.platform.decart.ai/sdks/javascript-realtime), [token API](https://docs.platform.decart.ai/api-reference/create-client-token), [network requirements](https://docs.platform.decart.ai/integrations/network-requirements), and the installed SDK source (`realtime/client.js`, `stream-session.js`, `browser/prepare-connection.js`).

The SDK uses `wss://api3.decart.ai`; media signaling uses `lk.decart.ai` and `*.lkc.decart.ai`. The robot service CSP permits these hosts, including HTTPS for LiveKit connection validation. Its frame-metadata worker is copied next to the bundled robot script so the SDK’s relative worker URL resolves in both source and packaged runs. Telemetry and SDK logging are disabled.

`retries: 0` disables initial retries. Unexpected disconnects close the service’s tracked sockets and peers synchronously and prevent subsequent transport creation, including pending-connect cancellation (the SDK only exposes disconnect after connect resolves). Close handshakes get up to 3.5 seconds, with main’s five-second forced teardown as a backstop. An acknowledgement confirms local closure, not provider quota release.

Configured providers are attempted in order: Decart, then FAL, at most once each. A failed attempt is fully torn down before the backup is reserved. The connection lock prevents overlap; successful sessions have no cooldown or attempt cap. Stop, Next scene, disabling Lucy, camera/display loss and quitting cancel a queued backup. Both unavailable means the robot scene remains skipped. Each provider has a 25-second setup deadline. Live playback stops at the configured scene duration even while paused; fallback shares the existing playback deadline. Scene exit, explicit disabling and quitting stop it sooner. Exhausted providers back off for 60 seconds, then wait for a scheduled scene slot or explicit selection. No background prewarming or paused retry loop runs.

`npm run test:providers` uses mocked authentication and signaling plus synthetic video, covering ordering, cleanup, cancellation, missing keys, Decart timeout, and both providers failing. The FAL takeover test uses the actual Decart SDK signaling followed by a local WebRTC roundtrip through the FAL adapter. No paid Decart success has been verified; the user will supply a key.

## FAL backup protocol

Sources checked before implementing the FAL adapter:

- Official API: https://fal.ai/models/decart/lucy-2-5/realtime/api
- Schema: https://fal.ai/models/decart/lucy-2-5/realtime/llms.txt
- Official playground: https://fal.ai/models/decart/lucy-2-5/realtime
- Protocol reference, FAL JS SDK 1.10.1: `src/auth.js`, `src/realtime.js`, `src/utils.js`.

The official public API describes `decart/lucy-2-5/realtime` as a **signaling relay** with WebRTC media between client and Decart. Input schema: `prompt`, `enable_prompt_expansion`, `image_url` (unused for WebRTC), `reference_image_url` (optional JPEG/PNG/WebP reference of at least 512×512 for character replacement/try-on). The app uses prompt-only object replacement. No image-edit endpoint has been assumed.

The public playground's Lucy adapter creates a peer after `ready` or `iceServers`, exchanges `{type:'offer',sdp}`, `{type:'answer',sdp}` and `{type:'icecandidate',candidate}` via FAL realtime signaling, buffers early ICE, and receives a media stream. Our implementation follows this sequence, uses the provider's ICE list, and falls back to STUN after a one-second ICE grace period. The current shared-camera frame is painted continuously into a 1280×720 canvas supplied to `captureStream(30)`. The returned video is read with `requestVideoFrameCallback`, published with bounded backpressure to main and drawn continuously on the audience display.

FAL SDK `auth.js` plus `config.js` mint tokens through `POST https://rest.fal.ai/tokens/` with `allowed_apps` containing the **alias** (`lucy-2-5`) and `token_expiration`. The response is a JSON string, or a legacy `{detail: string}` wrapper. Main handles those exact forms and supplies only the resulting temporary token to the robot renderer. Scoped tokens expire after 120 seconds and are minted anew for each connection. Each established stream has a main-process playback deadline, and each provider attempt has an outer setup-plus-duration deadline.

Decoded output dimensions and pixel variance are checked before publication. The validator cannot judge semantic quality. There is no captured JPEG or reusable static result. First-frame display acknowledgement enables the slot; subsequent decoded frames update its canvas. Failure, a two-second input/output stall, scene exit, display closure or disabling Lucy clears output and explicitly closes the peer and signaling socket before destroying the cloud window (four-second socket-close wait; five-second forced-cleanup deadline). Logs include error code, phase, elapsed time and scrubbed provider summaries without frames, tokens or SDP.

The FAL signaling transport opens `wss://fal.run` (the apex host); the robot CSP explicitly allows that exact signaling host. `securitypolicyviolation` reports `SIGNALING_BLOCKED`. An offline transport test uses the actual client and FAL MessagePack protocol with a mocked socket and local WebRTC peer. It checks that outgoing camera frames change, received frames change on the audience canvas, and stopping remote video causes the scene to be skipped.

The previous implementation used the same WebRTC endpoint to obtain a static photograph. That did not meet the live-conversion requirement and has been replaced. See VALIDATION.md for the latest continuous-video verification and its limits.

Pricing shown across FAL pages was inconsistent; the app makes no hard-coded dollar-cost claim. Verify current billing in the FAL console. Lucy remains enabled for the app session until the operator turns it off or quits; the old success cooldown and connection caps no longer apply, but playback duration limits do.


Electron documents that [`BrowserWindow.destroy()` skips `beforeunload`](https://www.electronjs.org/docs/latest/api/browser-window#windestroy). The previous normal-stop path relied on that handler to run cleanup, so it could not guarantee explicit disconnect. The replacement main-to-service stop/acknowledgement path exercises both close calls before teardown. The published FAL playground also closes signaling and the peer; no undocumented provider session-delete API or invented disconnect message is used. A local cleanup acknowledgement is not proof of server quota release.

The client now owns a single-use native WebSocket so shutdown can await its close event, cancel a still-connecting socket, and explicitly use normal close code 1000. It sends one initial input and never reconnects or replays input. This preserves the SDK wire format, scoped token and Lucy offer/answer/ICE protocol. Controlled socket/prompt/offer/close events are logged without URLs, credentials, SDP or ICE addresses. FAL keepalive envelopes are filtered; provider errors remain visible. The SDK 1.10.1 `close()` API did not expose close completion.

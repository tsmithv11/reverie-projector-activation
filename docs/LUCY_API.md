# Lucy API verification — October 7, 2026

Sources checked before implementing the adapter:

- Official API: https://fal.ai/models/decart/lucy-2-5/realtime/api
- Schema: https://fal.ai/models/decart/lucy-2-5/realtime/llms.txt
- Official playground: https://fal.ai/models/decart/lucy-2-5/realtime
- Installed FAL JS SDK 1.10.1: `src/auth.js`, `src/realtime.js`, `src/utils.js`.

The official public API describes `decart/lucy-2-5/realtime` as a **signaling relay** with WebRTC media between client and Decart. Input schema: `prompt`, `enable_prompt_expansion`, `image_url` (unused for WebRTC), `reference_image_url` (optional JPEG/PNG/WebP reference of at least 512×512 for character replacement/try-on). The app uses prompt-only object replacement. No image-edit endpoint has been assumed.

The public playground's Lucy adapter creates a peer after `ready` or `iceServers`, exchanges `{type:'offer',sdp}`, `{type:'answer',sdp}` and `{type:'icecandidate',candidate}` via FAL realtime signaling, buffers early ICE, and receives a media stream. Our implementation follows this sequence, uses the provider's ICE list, and falls back to STUN after a one-second ICE grace period. Only one frozen frame is painted onto a 1280×720 canvas and supplied to `captureStream(30)`; the physical camera stream is never attached to the cloud peer.

FAL SDK `auth.js` plus `config.js` mint tokens through `POST https://rest.fal.ai/tokens/` with `allowed_apps` containing the **alias** (`lucy-2-5`) and `token_expiration`. The response is a JSON string, or a legacy `{detail: string}` wrapper. Main handles those exact forms and supplies only the resulting temporary token to the robot renderer. No automatic token refresh is needed within the 25-second job lifetime.

The generated-result validator checks decoded dimensions and rejects near-flat/black output. It cannot assess semantic success or unchanged input. Results are static for each scene activation and cached only in memory. Aspect differences are contained with a background fill.

The documentation's generic HTTP/queue examples are not used: they are inconsistent with this endpoint's signaling-only description. No fabricated image-to-image queue path has been substituted. This adapter is implemented, but **a successful live Lucy session and robot transformation remain unverified without a supplied key and provider trial**. Offline authentication failure, the outer timeout and no-duplicate budget behavior are tested separately. Provider protocol changes may require updating the isolated adapter.

Pricing shown across FAL's marketing and schema pages was inconsistent, so the app makes no hard-coded dollar-cost claim. Verify current billing in the FAL console; use the interval, rolling-hour cap and session cap before the event.

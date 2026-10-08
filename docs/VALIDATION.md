# Validation report — October 7, 2026

This is a runnable first build, not a completed venue acceptance test. Four local scenes, the generated robot scene, controls and recovery paths are implemented. The current Lucy adapter continuously streams camera and returned video. Earlier static-image checks below are historical and do not establish realtime behavior; see the latest verification section.

## Hardware and environment

- MacBook Pro (Mac17,9), Apple M5 Pro, 15 CPU cores / 16 GPU cores, 48 GB RAM.
- macOS 26.6.2, Electron 44.5.1, Node 26.8.1 for building/testing.
- Built-in Retina display plus an actual HP E27d G4 external monitor at 2560×1440. The app rendered at 1920×1080 and scaled to that monitor. Native full-screen placement on the external monitor was verified. No physical 1080p projector was connected for this test.
- Camera integration tests used Chromium's synthetic webcam. The sustained animation tests used 18 generated, overlapping, moving silhouettes, including edge crossings. No real event audience or external USB webcam was recorded or uploaded.

## Checks completed

| Check | Evidence / result |
|---|---|
| Pure logic and pressure suite | 13 passing tests: scheduling, pause/resume, reorder, one-scene reactivation, clamping, cloud budgets, lighting changes, stillness, cleanup, quality hysteresis, token contract and invalid output screening. |
| Accelerated longevity | Eight simulated hours of scheduler ticks and eight simulated hours of maximum-motion monster/garden updates; effect arrays stayed within their caps and cleanup emptied them. This is not eight real hours of camera or GPU operation. |
| All five scenes / transitions | Actual desktop windows, synthetic crowd, 1080p internal canvas; 29.9–30 fps in the corrected integration pass. Screenshots reviewed. |
| Local model | Bundled model/WASM initialized with no runtime CDN dependency. Synthetic webcam inference reported 52 ms in the final integration check. A separate local pass on supplied reference 2 returned one detection at score 0.364, taking 103 ms on a cold inference. This proves the model executes; it does **not** establish good detection coverage or accuracy for that scene. |
| Camera process crash | Deliberately crashed, renderer reloaded inside the existing native window, synthetic capture resumed. |
| Camera stopped delivering frames | Stopped the fake webcam track; automatic stall detection and reopening returned to live capture in approximately six seconds. Actual USB removal/re-enumeration remains to be tested. |
| Audience process crash | Deliberately crashed during native full-screen output; rendering recovered at 30 fps, active scene preserved. Native-window teardown was replaced with renderer reload after testing exposed an AppKit stall. |
| Missing display | Simulated removal from Electron's display enumeration: audience became visible/windowed on primary; original enumeration restored. Physical cable unplug/replug remains untested. |
| Offline API | Mocked network failure, fake key, one reserved request, 24-second client timeout/fallback, no duplicates during observation; rendering stayed at 30 fps. No paid FAL call was made. |
| Bad cloud output | Unit tests reject black/flat, tiny and excessive-dimension images; validation examines the decoded video before adding letterbox padding. Semantic transformation quality and unchanged-input detection are not automated. |
| Isolation | Audience bridge has no credential-writing or cloud-job capability and no Node access. Packaged archive contains no `.env`, runtime logs, test data or original prompts. |
| Runtime dependencies | `npm audit --omit=dev`: zero reported vulnerabilities at time of build. This is a dependency audit, not a penetration test. |

## Sustained rendering

A 603.5-second baseline run completed without scene/renderer errors. It exposed a refresh-pacing issue: sampled mean 28.77 fps, fifth percentile 27.5 fps, minimum 26.9 fps. The renderer now carries its fractional deadline forward instead of restarting it after every callback. The corrected integration pass measured 29.9–30 fps.

The **packaged macOS ARM64 application** then ran for **303.2 seconds** with the corrected pacing, continuous synthetic crowd motion, maximum intensity and ten-second automatic scene rotation:

| Measurement | Final packaged result |
|---|---:|
| Sampled mean render rate | 29.96 fps |
| Fifth percentile of sampled render rates | 29.9 fps |
| Lowest sampled one-second render rate | 28.0 fps |
| Maximum summed process working set after warmup | 1110 MiB |
| First / final sampled working set after warmup | 1055 / 1039 MiB |
| Scene / renderer errors | 0 |

Render canvas: 1920×1080. Shared capture plane: 960×540. Motion/edge analysis: 384×216. Each scene appears in twelve samples. FPS is the renderer's one-second frame counter, sampled every five seconds; it is not a camera-acquisition or projector-scanout measurement. Memory is the sum of Electron per-process working sets and can double-count shared pages. These samples show no upward memory trend, not a proof of leak freedom. The synthetic crowd supplies synthetic boxes; the local detector is loaded but does not run inference on that demo. Concurrent real model execution was checked separately using the fake webcam and local image fixture.

Raw evidence: `test-results/soak.json`, `test-results/soak-before-pacing-fix.json`, `test-results/smoke.json`, and `test-results/vision.json`. These ignored files contain only synthetic scene screenshots, local fixture-derived boxes, and operating metrics. No audience-camera recording was made.

## Limits and required venue acceptance

- **Lucy output:** one real transformation was returned and displayed on October 8 at 12:30 a.m. Pacific. Earlier calls failed. The sample added extra robots, and neither repeatability nor billed amount has been validated. Verify at least one real transformation and failure case before relying on the cloud scene. Unavailable robot results now skip the scene entirely; the local drawn fallback has been removed.
- **Detection:** a lightweight 320×320-input COCO detector with at most 24 displayed boxes. It can miss small, dark, occluded or partial people and misclassify robot-like figures. There is no ground-truth crowd accuracy measurement. Group motion effects continue without detections; butterflies need occupied regions.
- **Hardware:** no physical USB reconnect, camera permission-denial dialog, projector cable reconnect, actual projector, real dense crowd, older M-series MacBook, Intel MacBook or Linux hardware qualification. Those paths have code and selected simulated tests; they are not physically certified.
- **Duration:** short real-time endurance runs plus accelerated logic tests do not prove multi-hour reliability. Run an eight-hour rehearsal on the venue hardware with the actual camera, projector, lighting and audience geometry.
- **Artwork:** Small wonderful things uses locally bundled reference-matched raster art, subtle GPU breathing/water displacement and a separate animated pink creature. The garden uses original bundled botanical artwork, procedural foliage, local stem growth and butterfly wing animation. These local scenes do not use realtime generative video. The line effect is a local edge map, not 3D reconstruction.
- **Distribution:** the macOS ARM64 bundle runs locally but is unsigned/not notarized and uses the default Electron app icon. Source supports Linux with setup/build commands; no Linux binary was tested or delivered.
- **Supervision:** internal renderer/worker recovery does not restart a dead main process, crashed OS, disconnected power, or failed projector. An event deployment should arrange an external relaunch/supervision policy.

Use [the event runbook](EVENT_RUNBOOK.md) for the physical acceptance pass. Do not enable a scene you have not checked on the actual installation.

## Robot-scene correction — October 8, 2026

The drawn robot fallback has been removed. Unavailable robot slots are skipped, including manual selection, while planned order still permits prewarming. A returned image must decode on the audience display before its slot becomes eligible. A failed request clears the prior result from rotation. An unavailable robot-only playlist uses neutral ambient output.

- 18 unit/stress tests passed, including skip behavior, spending-limit diagnostics, and key lookup for locally packaged vs installed applications.
- The desktop smoke test passed: other scenes stayed at 30 fps, offline authentication reported `AUTH_NETWORK / authenticating`, one attempt was reserved, the robot slot was skipped, and camera/display recovery passed.
- `scripts/robot-check.mjs` passed with zero provider traffic: skip during generation, synthetic image handoff, static output, cached-image restoration after reload, and an unavailable robot-only playlist. This checks the image lifecycle, not provider image quality.
- The app built inside this repository reads its root `.env` when no private settings key file exists. The source key is never included in the packaged app.

- `scripts/robot-transport-check.mjs` passed with mocked authentication/signaling and local WebRTC peers: the CSP admits the actual SDK address, robot instructions are sent, outgoing frames remain frozen, and returned video becomes a decoded image. Zero provider requests in this test.

Live trial: the supplied project key authenticated successfully. The first request exposed the wildcard-only CSP bug; after fixing it, a second bounded request reached Lucy and received `PROVIDER_ERROR` during `connecting-video` after 8.2 seconds. No generated image was shown. Live scenes continued, and original cloud settings were restored after testing. Provider summaries are now scrubbed for credentials/URLs and included with error codes and stages; recent controlled logs survive app restarts. A successful live robot transformation is still unverified.

## Successful live Lucy verification — October 8, 12:30 a.m. Pacific

The packaged application completed a real `decart/lucy-2-5/realtime` request using the supplied project key. No source changes were made between the preceding provider error and this successful attempt; the earlier error's precise cause remains unknown.

- Request started: 07:30:49.812 UTC.
- Authenticated / signaling: 07:30:50.130 UTC.
- Connecting video: 07:30:50.934 UTC.
- Receiving video: 07:30:51.142 UTC.
- Validating returned image: 07:30:56.526 UTC.
- Audience decoded image / ready: 07:30:56.556 UTC (6.744 seconds total).
- Visually inspected the audience display after its crossfade: it showed a genuine generated photograph of white robots with cyan lights in the room, not the removed drawn overlay.
- Rendering stayed at 30 fps. Lucy remains enabled with the existing 10-minute interval and 40-request session cap; automatic rotation remains enabled.
- Image fidelity limitation: the model added robots beyond the single detected person. Exact person count, pose and background preservation are not guaranteed by this successful connection test. No audience image was saved to disk.


## October 8 — continuous realtime conversion replaces the static adapter

The frozen input, JPEG capture and static result cache have been removed. Both directions now carry changing frames for the lifetime of the scene. Current integration tests cover live-frame handoff, normal scene-exit shutdown, a paused scene's time limit, robot-only unavailable output, real SDK/WebRTC transport with changing synthetic input/output, and a decoded-video stall. These tests never contact the provider. The final unit suite passed 18/18; all three lifecycle scenarios (scene exit, paused time limit and connection timeout) passed. The SDK/WebRTC test confirmed changing input, changing audience output, and stalled-video skipping with no provider requests. The broader desktop smoke test passed all local scenes, camera recovery, offline authentication failure, audience recovery and role isolation.

The rebuilt Mac application was checked against the real `decart/lucy-2-5/realtime` service at **2026-10-08 07:50:50–07:51:13 UTC** (12:50–12:51 a.m. Pacific). The existing ten-minute request interval was respected. One paid connection used the configured physical camera; no camera or generated images were saved. Connection setup took about 12.4 seconds. During ten seconds of observation after readiness, 84 returned frames reached the shared output and the audience canvas changed. The audience renderer measured 30 fps; the latest returned frame was 132 ms old at the sample. That freshness measures local frame arrival, not model end-to-end latency. Render fps is distinct from the slower provider video cadence. Selecting Next closed the connection and removed robot availability. The original 60-second duration and other settings were restored.

The camera was pointed at a ceiling without people during this check. Continuous provider video is verified; transformation fidelity and movement correspondence with people need an in-view human/crowd rehearsal. The earlier static-photo success is not used as evidence for realtime movement.

`REVERIE_LIVE_CHECK=1 node scripts/lucy-live-check.mjs` is an explicit paid opt-in check of the packaged application, excluded from normal tests. It respects configured enablement and persisted spending limits, temporarily caps the scene at 20 seconds, validates changing received output, stops the stream and restores settings. `test-results/lucy-live.json` contains numeric results only.

The final application and ZIP were rebuilt and archive integrity checked; packaged credentials and runtime files were absent.

## October 8 — concurrent-session rejection and disconnect cleanup

The reported `Concurrent session limit reached.` occurred at 08:00:53 UTC before remote video arrived. The prior stop path destroyed the robot window, which bypasses Electron's `beforeunload` handler and therefore skipped the application's explicit peer/socket close calls. This is a confirmed local cleanup defect; it does not prove which server session or provider limit caused the rejection.

Shutdown now removes the scene immediately, sends an explicit stop command, closes both transports, gives close traffic 500 ms to leave, and then acknowledges local cleanup. The connection gate stays locked until cleanup finishes; a two-second deadline handles a stuck renderer. App quit uses the same path. A transport test spies on both real browser close methods and observes socket closure before the window disappears. Exactly one initial prompt is sent.

Pre-video concurrency rejection now reports `SESSION_BUSY`. The app keeps the failed attempt in both caps, persists a 60-second manual retry wait, and pauses automatic Lucy requests. Retrying retains any prior-session interval and all other eligibility checks. Tests cover classification, persistence, no automatic retry, session/hour caps, previous-session intervals, and the exact provider message in Electron.

A fresh real-provider check at **13:44:37–13:44:50 UTC** succeeded in the rebuilt packaged app: 164 returned frames during ten seconds of observation, changing audience output, 30 fps audience rendering, and a latest-frame age of 58 ms. The log confirms explicit local cleanup ran before window teardown. One bounded paid connection was used; no imagery was saved. This confirms current service availability and client cleanup, not a server acknowledgement that a concurrency slot has been released or a guarantee against future provider limits.


## October 8 — acknowledged shutdown and repeat-session investigation

**Repeated live sessions remain blocked by an upstream concurrency refusal. Do not treat one successful session as a resolution.**

At 14:04:46 UTC, a trace of the prior packaged build reproduced the refusal with exactly one socket, one prompt and one offer. The worker disappeared without a socket close event. The old fixed 500 ms grace did not establish that the close handshake had completed.

The revised transport uses the existing FAL MessagePack/WebRTC protocol with a single-use native socket, normal close code 1000 and a four-second close-event deadline. Main holds the lock for cleanup, with a five-second outer deadline. It cancels connecting sockets, does not reconnect/replay, and records controlled lifecycle events. Provider refusals received during pending offer creation take precedence over late-send/close errors.

A real two-session test used the physical camera, existing key, five-minute interval and saved caps:

| UTC | Result | Evidence |
| --- | --- | --- |
| 14:13:32–14:13:46 | Live session succeeded and closed cleanly | 165 returned frames in ten seconds; 30 fps audience rendering; one socket, prompt and offer. Close code 1000, clean=true, received 1,046 ms after close was requested. |
| 14:18:32–14:18:34 | Provider refused the next session | Exactly one new socket and prompt; the upstream concurrent-session error arrived before an offer was sent. The socket also closed cleanly, after 1,038 ms. |

The second refusal initially exposed a generic-error race in the new adapter. That race is corrected and covered by a unit test and an Electron test that closes the provider socket during offer creation. No further paid requests were made after the refusal. Automatic Lucy requests are paused in the real profile; all attempt history and limits remain intact. Original 30-second scene duration, five-minute interval and other operator settings were restored. No images, tokens, socket URLs, SDP or ICE addresses were saved. Safe trace: `test-results/lucy-sessions.json`; earlier trace: `test-results/lucy-sessions-before-acknowledged-close.json`.

Validation: 27 unit tests pass. Offline Electron checks pass for scene exit, paused duration limit, setup timeout, provider refusal, moving input/output, delayed close acknowledgment (750 ms), and stalled returned video. An additional wire-level refusal check confirms SESSION_BUSY, scene skipping and automatic-request suspension. The app and ZIP are rebuilt; private configuration files are excluded.

For FAL investigation, use endpoint `decart/lucy-2-5/realtime`, the two UTC intervals above, and the exact provider error `Concurrent session limit reached.` The observed clean FAL socket closure does not prove its upstream Decart session was released; the client cannot inspect or reset that upstream quota through the documented signaling interface.

Repeat check (paid opt-in only): `REVERIE_LIVE_CHECK=1 node scripts/lucy-session-check.mjs --retry --repeat`. It stops on the first refusal and never bypasses the configured interval or caps.

## October 8 — reference-matched Small wonderful things

Replaced camera tinting and seven roaming vector creatures with a detailed reconstruction of the supplied pastel Golden Gate bay. The 1672×941 background is higher resolution than the 1038×580 reference; the separate transparent jumper is 1145×1374. Rendering remains adaptive up to 1920×1080. These are the actual asset dimensions, not 4K artwork. Built-in image generation prompts and provenance are retained under `assets/scenes/small-wonderful-things/provenance.json`.

The artwork fills the existing angled portal. Five painted creatures remain in their original locations with small local breathing movements, and water has subtle ripples. The separate pink creature rests partly submerged, makes a 1.35-second hop after 120 ms of motion, then waits at least 1.6 seconds before another hop. Motion emits bounded bubbles; stillness creates no new bubbles or jumps. Existing bubbles fade within seven seconds and an airborne creature finishes its landing. Missing camera frames preserve the idle bay. If WebGL is unavailable, the detailed static background and animated pink sprite/bubbles remain usable.

- All 31 unit/stress tests passed, including idle/noise gating, motion-triggered hops, landing cooldown, particle expiry, quality caps, cleanup and eight simulated hours of motion.
- `npm run test:wonderful` passed in the desktop app: high and low quality both sampled at 30 fps, with no renderer errors. Camera input withheld for ten seconds left the scene running at 30 fps with zero remaining bubbles.
- Verified native asset loading, shader initialization, jump apex and settled state; reviewed screenshots of the angled portal, idle state, jump, low quality and GPU fallback.
- Evidence: `test-results/wonderful-check.json` and `test-results/wonderful-*.png`. All motion input was synthetic; no provider call or audience recording was needed.
- The rebuilt Mac ARM64 app launched successfully and rendered this scene at 30 fps at high quality. Its bundled scene code and both PNG assets match the tested source build; credentials and test fixtures are absent from the archive.

## Night garden revision — October 8, 2026

The garden now fits inside the shared angled portal with a pink/lavender surround. Dormant ferns, buds, haze and pollen remain visible without a camera. The center contains only the botanical landscape, with no title or instruction text. Movement lasting at least 120 ms grows stems rooted in the meadow, followed by leaves and detailed pink, lavender or ivory blossoms. Sustained occupied stillness from the shared motion analyzer attracts twelve individually animated blue, rose and amber butterflies; renewed local movement makes them leave. Flowers last 30–46 seconds and gradually fade back into the empty garden. Mushrooms were removed.

The original 1536×1024 transparent botanical atlas is bundled in `assets/scenes/garden/`; its built-in image generation prompt and provenance are retained beside it. The garden does not draw camera images. Entry uses an opaque midnight wash rather than a snapshot of the previous camera scene, and the scene-error fallback excludes camera imagery too.

Validation:

- All 49 unit tests passed, including five new garden behavior tests and the existing eight simulated hours of bounded motion updates.
- Initial `npm run test:garden` rehearsal before the separate artwork canvas: 30 fps at 1920×1080 with the maximum 112 flowers; 30 fps at 1280×720 with 48 flowers; 30 fps after camera packets stopped.
- Observed zero direct or transition-snapshot camera draws throughout garden entry, growth, stillness, camera loss, and an intentionally triggered rendering failure. Red and green input images produce pixel-identical standalone garden output.
- Inspected idle, blooming, butterfly, settled and missing-art screenshots under `test-results/garden-*.png`. Missing atlas art retains procedural blossoms and the dormant garden.
- Rebuilt the Mac application and ZIP. An isolated launch of the packaged app loaded the botanical atlas and rendered the garden at 30 fps with no page errors; details are in `test-results/garden-packaged.json`.
- Performance figures describe synthetic rehearsal on this Mac, not a physical crowd/projector acceptance test. The existing local detector still supplies occupied stillness, with the detection limits documented above.

### Garden performance pass — October 8, 2026

The garden artwork now renders at 960×540 / 800×450 / 640×360 for High / Balanced / Low, then scales once inside the existing full-resolution frame. This reduces artwork pixel count by 75%; the other scenes, border, branding, flower limits and animation timing keep their previous settings. The garden's audience frame requests carry only motion/stillness metadata, so no camera-image upload is performed in that renderer. Camera sensing and the shared full-frame slot remain available for other scenes and robot prewarming.

All 49 unit tests and the extended `test:garden` rehearsal passed. Measured 30 fps with 112 flowers at 960×540 artwork / 1920×1080 output, and 30 fps at 640×360 artwork on Low. The real IPC contract check returned 2,044 characters of metadata instead of the sampled packet's 921,600 camera-pixel bytes (before counting the full packet's other data). No image, edge map, energy grid or preview was included in the compact response. The test observed zero camera uploads and zero camera draws during the garden, including re-entry and failure. Switching to the heat scene restored 1920×1080 scene rendering and full image packets. This is reduced work per frame, not a claim of higher FPS beyond the installation's existing 30 fps cap. The upscaled garden was visually inspected inside the pink portal.

## Small wonderful things motion and performance — October 8, 2026

All six creatures now respond to the camera: a shared envelope opens after 120 ms of sustained motion and drives independent bobbing, swaying and flexing in the five painted creatures, plus the separate sprite's bob and existing hop/landing cycle. Motion strength and operator intensity scale the response. Waves and moving highlights cover the exposed bay while the bridge stays anchored. Stillness smoothly returns the artwork to rest; the shader pass is skipped once settled. Camera loss stops new interaction and allows existing effects to finish.

The scene now shares the garden's 960×540 / 800×450 / 640×360 artwork canvas inside the full-resolution portal. This reduces artwork pixels by 75%. Its audience packets contain motion metadata only, and scene entry clears the old camera snapshot. The shared camera feed remains unchanged for sensing, camera scenes and robot prewarming.

- All 51 unit/stress tests passed, including motion strength, noise rejection, zero intensity, gradual settling and eight simulated hours of bounded scene updates.
- `npm run test:wonderful` passed: High, Balanced and Low each sampled at 30 fps, with 30 fps after camera loss. Switching back to heat restored 1920×1080 scene rendering.
- Rendered pixel comparisons confirmed animation in each of the five painted creatures and the water, zero difference in the bridge region, and an unchanged idle image. The hop apex and landing/cooldown behavior also passed.
- Observed zero camera uploads and zero camera draws during artwork entry and re-entry. Different camera colors produced identical standalone scene output. A sampled compact packet was 1,720 characters versus 921,600 bytes of camera pixels alone in the full packet.
- The shared-path `npm run test:garden` regression passed: 30 fps with 112 flowers, 29.8 fps on Low, and zero camera draws/uploads through re-entry and an intentional scene failure.
- Reviewed the portal and fully active scene screenshots. GPU loss retains the static painted bay and the separate sprite/bubbles as before. Results are in `test-results/wonderful-check.json` and `test-results/wonderful-*.png`.

The Mac ARM64 application was rebuilt using the locally installed Electron runtime. Its bundled audience code, main process and bay assets match the verified build; private configuration and test fixtures are excluded. An isolated packaged-app launch rendered the scene at 30 fps with 960×540 artwork, active particles and no renderer errors (`test-results/wonderful-packaged.json`).

These measurements use synthetic camera motion on this Mac. They verify reduced rendering/transfer work within the existing 30 fps cap, not physical projector or crowded-venue performance.

## Small wonderful things — separate cartoon characters, October 8, 2026

Replaced the rejected character-warp effect with an empty bay plate and six separate transparent sprite sheets, each containing six distinct drawings with changed heads, hands, legs and expressions. The character pass uses rigid translation/rotation and pose selection; character pixels never enter the water-displacement shader. The large creature greets, the antenna creature paddles, the green creature peeks around the foreground rock, the blue and small pink creatures bound/skip, and the slender pink creature leaps through a flight arc. Camera motion location steers their facing and travel within separate home ranges. Action starts are staggered and have individual cooldowns. Landing splashes, wakes and reflections connect the figures to the bay; stillness finishes actions and brings them home.

The 1672×941 empty bay and six 1536×1024 sheets were created with the built-in image tool. Exact prompts and asset names are in `assets/scenes/small-wonderful-things/cartoon-provenance.json`. Alpha gutters and torso anchors are calculated once per sheet to avoid clipped hands/tails and misaligned frames. No runtime image generation, person identity tracking or cloud calls were added.

The 51-test suite passes, including separate pose changes and travel for all six characters, opposite reactions to left/right motion, delayed starts, flight arcs, settling, zero intensity, cooldowns and bounded effects. Desktop rehearsal confirmed 30 fps at High and Low, 29.8 fps at Balanced; no camera uploads/draws; unchanged bridge pixels; moving water; six distinct pose atlases; camera-independent output; and animated characters even with WebGL disabled. Rendering remains 960×540 / 800×450 / 640×360 inside the crisp portal. Results and screenshots are under `test-results/wonderful-*`. The `--record` option saves a 17-second synthetic-motion preview, with movement crossing the scene and a final quiet period.

These are local frame animations with six authored poses per character, not generated video or fully articulated 3D rigs. Performance measurements use synthetic motion on this Mac; the physical installation still needs a walk-by rehearsal.

The final Mac ARM64 app and ZIP were rebuilt. The packaged audience code and all seven new image assets match the tested build, and private configuration/test fixtures are excluded. Its isolated synthetic launch sampled 29.8 fps at High with no renderer errors. A final audience-view recording is saved as `test-results/wonderful-cartoon-preview.mp4`; it shows synthetic movement passing across the bay, reversing, then stopping. No camera imagery was recorded.


## Lucy session enablement and paid-connection lifetime — October 8, 2026

Lucy starts disabled on every launch. Once enabled, both scenes remain eligible for every rotation without successful-session cooldowns or attempt caps. Enablement is separate from connection lifetime: connections open only for a scheduled Lucy slot or explicit selection, with no background prewarming. Playback ends at its configured duration even when paused; reselecting or falling back cannot extend that deadline. Failed requests wait 60 seconds and then require a later slot or explicit selection, with no background retries while paused. Decart's 100-second server-side session backstop is retained.

- All 66 unit and regression tests passed. The actual main-process lifecycle runs under a virtual clock, covering 25 minutes of repeated rotations past the former session cap, adjacent live-only scenes, off-by-default restart, scene switching and cancellation, bounded paused playback for both effects, one hour paused on a local scene with no Lucy connection, failure without paused retries, fallback within the original deadline, and shutdown.
- Desktop checks confirmed no robot connection before its scheduled slot and cartoon disconnection at the duration limit while paused. The rebuilt Mac app also passed paused robot disconnection and four alternating scene selections, with no page errors. Packaged source and UI match the tested files, and the ZIP/checksum were refreshed.
- Tests use synthetic media and mocked providers. No paid provider requests were made for this update.

Earlier observations above describe prior builds. These checks verify app lifecycle and media handling, not the provider's invoice or long-running service availability. Each requested live appearance can still incur provider usage, including billable setup; a Lucy-only rotating playlist is not free idle time.

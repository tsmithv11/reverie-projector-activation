# Reverie Installation

A desktop audience installation for an Apple Silicon MacBook and a 1080p projector. It has a separate operator console, six rotating worlds, offline local vision, and optional Lucy 2.5 generation through Decart with FAL as backup. The appearance follows the four supplied references: angled pink/lavender portals, technical overlays, white robots, friendly monsters, and electric blue contours.

## Run the Mac application

The locally built app is in `release/mac-arm64/Reverie Installation.app`; a verified ZIP is in `release/Reverie-Installation-mac-arm64.zip`. Open the app in Finder. No Node installation or internet is needed to run the packaged local scenes. This development build is **unsigned and not notarized**; distribute a signed build before deploying to managed or unfamiliar Macs. Do not disable Gatekeeper globally.

1. Connect the USB webcam and projector. In macOS Displays, use **extended display**, not mirroring. Set the projector to 1920 × 1080, ideally 60 Hz. Enable **Displays have separate Spaces** in Desktop & Dock if native full-screen output blanks the other display.
2. Open the app. Allow camera access. Select the USB camera and output in the operator window.
3. The audience window opens full screen on an external display. Without one, it opens as a window on the primary display. **Open audience display** brings it back after it has been hidden.
4. Leave quality on **Automatic** initially. Default rotation is 60 seconds per scene; choose any whole-second duration from 10–60.
5. Use **Synthetic crowd for rehearsal** to try every local effect without camera access or cloud uploads.

The app prevents display sleep while running. Keep the Mac plugged in. Closing the operator window hides it; clicking the Dock icon or pressing **O** in the audience view restores it. Use **Quit installation** or Cmd+Q to end all services.

## Run from source / Linux

Use a current Node.js LTS release (22 or newer), npm, and a desktop session with camera permission. Tested here with Node 26.8.1. Initial installation requires internet; normal local operation does not.

```sh
npm ci
npx install-electron --no
npm run assets
npm start
```

`npm run assets` downloads Google's versioned EfficientDet-Lite0 model and verifies its checked-in SHA-256 manifest. Runtime WASM and weights are copied into the app. There are no CDN requests for local effects. `npm run demo` runs the synthetic crowd. `npm run pack` creates the application directory; `npm run dist:mac` creates a macOS ZIP. Build Linux on a Linux host with `npm run dist:linux`. Linux camera access uses Chromium/getUserMedia and the desktop's normal device permissions. Linux has not been hardware-tested in this delivery; see [validation](docs/VALIDATION.md).

## Decart and FAL credentials — exact location

**Put `DECART_API_KEY=your-key` in `.env` at this repository's root**, beside `package.json`. Keep `FAL_KEY=your-fal-key` there for the backup. Blank placeholders for both are in `.env.example`; the local `.env` has a blank Decart entry ready to fill. Decart is tried first, FAL is tried once if Decart fails, and the scene is skipped if neither supplies usable video. Providers without a key are skipped. Both source runs and the app built inside this repository's `release` folder can read it. A separately installed app uses its private settings file. The local `.env` preserves any existing FAL key; `.env.example` documents the format. `.env`, `.env.*`, runtime state, logs, and build artifacts are excluded by `.gitignore`; only `.env.example` is committed. Never paste a real key into source files or a README.

Alternatively use the **Decart API key** and **FAL API key · backup** fields in **Live daydreams**. Saving or clearing one key preserves the other. For a separately installed Mac app, it is stored at:

```text
~/Library/Application Support/reverie-projector/.env
```

The operator console displays the exact path in use. An existing private settings key file takes priority over the repository file, including an explicitly cleared key. On Linux it is the application's Electron user-data directory, normally `~/.config/Reverie Installation/.env`. Key files are mode `0600`; permanent keys stay in the main process, are not returned to the operator UI, and never reach the projector. This is a private local file, **not encrypted OS keychain storage**. Saving an empty field clears that provider’s stored key. `DECART_API_KEY` and `FAL_KEY` in the launch environment can also supply credentials; restart to pick up manual file changes.

Enable **Lucy 2.5 · Decart first, FAL backup**, then select **Machine dreaming** or **Life in cartoon** in the playlist for an immediate connection. The **Live scene** selector also lets you start either effect from the connection controls. The current camera feed streams continuously to FAL/Decart during connection setup and either live scene. Returned video continuously updates the audience canvas. All other scenes process locally. Lucy starts off on every app launch, even if it was enabled last time, and stays off until you enable it in the operator console. Once enabled, both live scenes remain available on every rotation until you turn Lucy off or quit. Rehearsal mode never uploads.

### Lucy integration and safeguards

Direct Decart uses the official `@decartai/sdk` with `models.realtime("lucy-2.5")` and a temporary token minted in the main process; permanent keys never enter a renderer. Its initial prompt has enhancement disabled. See the [Decart realtime API](https://docs.platform.decart.ai/sdks/javascript-realtime) and [client tokens](https://docs.platform.decart.ai/getting-started/client-tokens). The FAL backup endpoint is **`decart/lucy-2-5/realtime`**, verified against the [official API](https://fal.ai/models/decart/lucy-2-5/realtime/api), [schema](https://fal.ai/models/decart/lucy-2-5/realtime/llms.txt), and public WebRTC client. FAL carries signaling; WebRTC carries live video to/from Decart. Machine dreaming requests a robot transformation of the people. Life in cartoon requests a 2D cartoon of the entire camera scene, with clean outlines and cel shading while preserving the people, room, objects, composition, and movement. Both providers receive the same prompt for the selected scene. Inputs used are `prompt` and `enable_prompt_expansion: false`.

- Connections open only when a Lucy scene's slot is due or you explicitly select it. There is no background prewarming. Viewers continue seeing the current local scene while setup completes; consecutive live scenes close the old connection before starting the next one.
- At most one provider connection at a time, one current input frame and one current output frame, with backpressure and no accumulated frame queue. No saved photograph or local robot substitute.
- A 25-second connection deadline per provider, seven-second authentication deadline and two-second video-stall watchdog stop failed connections. Normal scene exit, camera loss, hidden/restarted audience display, disabling Lucy and quitting also close the stream. The app asks the isolated service to close its peer and signaling socket before destroying its window, waiting up to four seconds for the signaling close handshake, with a five-second forced-cleanup deadline.
- Each live scene gets at most its configured playback duration (10–60 seconds), including time spent paused. Reselecting it or falling back to another provider cannot extend an existing playback deadline. Setup is limited to 25 seconds per provider; Decart also receives a 100-second server-side session backstop.
- Enabling Lucy keeps both scenes eligible for later rotations until you disable it or quit; it does not keep a paid connection open. Successful scenes can reconnect on their next slot without cooldowns or attempt caps. Failed requests back off for 60 seconds, then wait for another scene slot or an explicit selection. Paused rotation never starts background retries. Each live appearance still uses paid service, including any billable setup; a playlist containing only Lucy scenes therefore continues using that service while it rotates.
- Unavailable, failed or stalled Lucy video: **skip the requested live scene for viewers** and show the reason, error code and connection phase in the operator console and local log. A live-only unavailable playlist uses neutral ambient artwork.
- Earlier FAL live service check on October 8 (before the direct Decart integration): 84 returned frames during ten seconds of observation, changing audience output, and successful disconnect on scene exit. Audience rendering was 30 fps. The camera faced a ceiling; person-to-robot appearance still needs a person/crowd rehearsal. Direct Decart has been verified with mocked credentials and signaling; a real-key rehearsal remains pending.
- Output screening rejects invalid dimensions and near-black/flat frames. Scene fidelity and model latency remain provider-dependent; it cannot verify the exact count or appearance of transformed people.

## What is real, simulated, and local?

| Scene | Processing | Meaning and limits |
|---|---|---|
| Audience / field study | Local EfficientDet-Lite0 person detection; smoothed frame difference; animated heat gradients | Boxes and detector scores come from the model. Heat is labeled **SIMULATED HEAT / ARTISTIC FIELD**, never temperature. “Frame motion” is normalized image change, not physical speed or a crowd count. |
| Machine dreaming | Live camera conversion through Lucy 2.5 / Decart, then FAL | Returned robot video follows the current camera continuously. Unavailable results are skipped, with diagnostics only in the operator console. |
| Life in cartoon | Live camera conversion through Lucy 2.5 / Decart, then FAL | Transforms the whole room into a 2D cartoon inside the same angled portal as Machine dreaming. The original camera view remains outside the portal under the normal pink-to-blue tint. Shares keys and one connection at a time with the robot scene. |
| Small wonderful things | Layered pastel bay with six local frame-animated characters | Each creature has six distinct pose drawings: the large creature waves and turns its head, the antenna creature paddles, the green creature peeks around the rock, the blue and tiny pink creatures bound/skip, and the slender pink creature leaps. Movement produces large iridescent bubbles at its camera location after a 120 ms gate. Nearby creatures wake after roughly 300–480 ms of sustained motion, follow its changing horizontal location, and scale their travel and hop height to its strength. Hops begin with a resting pose and grounded preparation, then take one smooth flight arc; stopping during preparation cancels takeoff. Airborne actions land with a splash and stillness returns the characters home. Animation waits for the artwork to load. Characters are separate sprites, with no image deformation. All artwork is bundled locally; no cloud calls. |
| An outline of us | Local Sobel edges, camera silhouette layer, cyan person boxes and artistic perspective grid | No inferred depth, distance, velocity, emotion, or identity. |
| A garden of possibility | Original botanical artwork with local motion-driven growth and occupied stillness | Midnight garden fitted inside the shared angled portal with a pink/lavender surround, layered ferns, dormant buds and drifting pollen. No centered title or instruction text. Movement grows ground-rooted plants and gradually opens pink, lavender, and ivory flowers; occupied stillness brings out detailed blue, rose, and amber butterflies with independently folding wings. Plants fade after 30–46 seconds. No camera image is shown, including entry transitions or scene failure. The garden remains alive without camera input. |

No persistent person IDs, sensitive attributes, biometric identification, audio capture, or default audience-image saving. Demo figures and boxes are **synthetic** and labeled accordingly. Crowds are treated as moving regions; severe occlusion, small distant figures and poor lighting reduce detection coverage. Motion effects remain active without person detections; butterflies specifically require occupied regions.

Small wonderful things and the garden share a lighter rendering path: artwork is drawn at 960×540 on High (800×450 Balanced, 640×360 Low), then fitted inside the normal-resolution pink frame. This uses 75% fewer artwork pixels while preserving all creatures and the flower count. These scenes receive only motion/stillness data in the audience window, avoiding unused camera-image transfers and uploads. Small wonderful things draws six character sprites with cached pose bounds and uses a separate GPU pass only for water, skipped while settled; camera sensing and camera-based scenes retain their normal quality.

## Operator controls and recovery

- Pick camera/output, effect intensity, quality, mirror, duration, enabled scenes and order. The last enabled scene cannot be disabled.
- Click a scene tile for immediate selection. Pause freezes the rotation timer; the local effects continue animating. A 1.4-second crossfade preserves composition.
- Projector keyboard: **O / Escape** operator controls, **F** full screen, **Space** pause/resume, **→** next, **1–6** scene selection. No controls are drawn on the projector.
- Camera disconnect/stall: ambient Reverie artwork replaces the stale feed after two seconds; reconnect attempts happen automatically. Replug the same camera or choose a different one. **Reconnect camera** restarts the isolated service.
- Permission denied: enable Camera in macOS Privacy & Security, then reconnect. A selected missing camera is not silently replaced with another.
- Missing display: windowed preview. Connecting/reconnecting displays repositions the audience window. The operator window stays separate.
- Worker errors: bounded restart backoff; expired boxes and analysis disappear. Scene errors: that module is quarantined for the current renderer session; a camera/ambient fallback fills its slot and rotation continues. A hung audience renderer is rebuilt by the independent main-process watchdog.
- The status card reports camera state, detector latency, rendered fps, effective quality, active scene, cloud state and caps. **Show log file** opens the rotating local log: two files capped at approximately 1 MiB each. No frames, prompts, tokens, keys, SDP or provider response bodies are logged.

Settings save to the application user-data directory (`.runtime` for source runs). The camera remains open while the control window is hidden. A whole application or OS crash requires an external supervisor or relaunch; internal watchdogs cannot recover a dead main process.

## Development and acceptance

```sh
npm test               # scheduler, motion, cloud gate, lifecycle and accelerated crowd stress
npm run test:wonderful # pose animation, direction, camera loss, performance and visual snapshots
npm run test:wonderful -- --record # also save a synthetic animated preview
npm run test:garden    # growth, stillness, camera invisibility, quality and visual snapshots
npm run test:providers # Decart priority, FAL takeover, both failing, cancellation, caps
npm run test:cartoon   # cartoon routing, provider fallback, live frames, stalls and time limits
npm run test:robots    # live frame handoff, connection limits, stalls and offline WebRTC roundtrip
npm run test:smoke     # macOS desktop, mock webcam, workers, camera restart, offline cloud
npm run test:soak      # 10-minute real-time synthetic crowd run
SOAK_SECONDS=28800 npm run test:soak  # eight-hour venue rehearsal, if desired
```

Tests write synthetic screenshots and reports under ignored `test-results/`; they do not save audience camera frames. See [architecture and data contract](docs/ARCHITECTURE.md), [adding a scene](docs/ADDING_A_SCENE.md), [API verification](docs/LUCY_API.md), and [validation results](docs/VALIDATION.md), and [event operator runbook](docs/EVENT_RUNBOOK.md).

The target is smooth 30 fps at 1080p on Apple Silicon. **This is not yet a signed, venue-accepted release.** Read the measured test conditions and outstanding physical webcam/projector/crowd/provider checks before event use.

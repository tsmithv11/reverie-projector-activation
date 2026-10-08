# Reverie Installation

A desktop audience installation for an Apple Silicon MacBook and a 1080p projector. It has a separate operator console, five rotating worlds, offline local vision, and optional, bounded Lucy 2.5 generation through FAL. The appearance follows the four supplied references: angled pink/lavender portals, technical overlays, white robots, friendly monsters, and electric blue contours.

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

## FAL credentials — exact location

**For source runs, put `FAL_KEY=your-key` in `.env` at this repository's root**, beside `package.json`. A blank `.env` is provided locally; `.env.example` documents the format. `.env`, `.env.*`, runtime state, logs, and build artifacts are excluded by `.gitignore`; only `.env.example` is committed. Never paste a real key into source files or a README.

Alternatively paste the key into **Robot daydreams → FAL API key → Save**. In the packaged Mac app it is stored at:

```text
~/Library/Application Support/Reverie Installation/.env
```

The operator console displays the exact path in use. On Linux it is the application's Electron user-data directory, normally `~/.config/Reverie Installation/.env`. Key files are mode `0600`; the key stays in the main process, is not returned to the operator UI, and never reaches the projector. This is a private local file, **not encrypted OS keychain storage**. Saving an empty field removes the stored key. `FAL_KEY` in the launch environment can also supply credentials; restart to pick up manual file changes.

Enable **Lucy 2.5 through FAL** explicitly in settings. This sends a frozen audience frame to FAL/Decart as a short repeated-frame video stream. No subsequent live camera frames are attached. All other scenes are local. Generation is disabled by default, and rehearsal mode never uploads.

### Lucy integration and safeguards

Verified October 7, 2026 against the [official endpoint](https://fal.ai/models/decart/lucy-2-5/realtime/api), [machine-readable schema](https://fal.ai/models/decart/lucy-2-5/realtime/llms.txt), and FAL's public WebRTC signaling implementation. The endpoint is **`decart/lucy-2-5/realtime`**. It is a **video editor**, not a still-image editing endpoint. We send a frozen canvas stream, capture a returned still, then close the peer and signaling connections. Supported edit inputs used: `prompt` and `enable_prompt_expansion: false`. `image_url` is unused in WebRTC; `reference_image_url` is optional and is not sent. We do not invent queue, image-size, seed, or inference-step parameters.

- Preparation begins when the robot scene is within 45 seconds, including startup. The first appearance may use a local fallback while generation warms up. Pausing elsewhere does not generate.
- One job, one frozen input, one retained result. No queued generation and **zero automatic paid retries**. A failure consumes its reserved budget slot.
- 25-second outer watchdog; 24-second client watchdog; 10-second limit after the WebRTC offer; 7-second token request timeout. Disconnect closes the entire isolated generation window. No persistent or automatically reconnecting video session.
- Default minimum interval: 10 minutes. Allowed: 5–60 minutes. Hard cap: 12 attempts in any rolling hour, persisted before connecting. Default session cap: 40 attempts, adjustable 1–100. Session cap resets on app restart; the rolling-hour history persists. These bound attempts and local connection time, not an exact dollar amount; FAL determines billing.
- Missing credentials, offline service, timeouts, flat/black/invalid output: show the previous successful still or a locally drawn white-robot still. Fallback labels say **LOCAL ROBOT STUDY / STILL**. A returned cloud result is used on the next activation, never swapped into the middle of a static scene.
- Technical image checks cannot verify whether every person became a robot or whether geometry was preserved. That still requires a real provider trial. No paid/live Lucy request was run in this delivery.

## What is real, simulated, and local?

| Scene | Processing | Meaning and limits |
|---|---|---|
| Audience / field study | Local EfficientDet-Lite0 person detection; smoothed frame difference; animated heat gradients | Boxes and detector scores come from the model. Heat is labeled **SIMULATED HEAT / ARTISTIC FIELD**, never temperature. “Frame motion” is normalized image change, not physical speed or a crowd count. |
| Machine dreaming | Frozen-frame Lucy stream through FAL; local vector robot fallback | Static image for the entire scene. Fallback is clearly labeled; it is not represented as a cloud-generated result. |
| Small wonderful things | Local camera stylization, person-box monster overlays, vector creatures, bubbles driven by motion | Cartoon/vector interpretation of the reference, not photoreal generative video. Seven creatures chase and pop bounded bubbles. |
| An outline of us | Local Sobel edges, camera silhouette layer, cyan person boxes and artistic perspective grid | No inferred depth, distance, velocity, emotion, or identity. |
| A garden of possibility | Local motion-grid growth, occupancy from person detections, smoothed stillness | Plants fade after 24–42 seconds; butterflies gather after sustained low motion. Pink `#ffa0d0`, lavender `#E7D2F6`, blue `#4d65ff`, orange `#FF734A`, purple `#271431` were read from [Reverie](https://www.reveriesummit.com/); leaf green is a complementary addition. |

No persistent person IDs, sensitive attributes, biometric identification, audio capture, or default audience-image saving. Demo figures and boxes are **synthetic** and labeled accordingly. Crowds are treated as moving regions; severe occlusion, small distant figures and poor lighting reduce detection coverage. Motion effects remain active without person detections; butterflies specifically require occupied regions.

## Operator controls and recovery

- Pick camera/output, effect intensity, quality, mirror, duration, enabled scenes and order. The last enabled scene cannot be disabled.
- Click a scene tile for immediate selection. Pause freezes the rotation timer; the local effects continue animating. A 1.4-second crossfade preserves composition.
- Projector keyboard: **O / Escape** operator controls, **F** full screen, **Space** pause/resume, **→** next, **1–5** scene selection. No controls are drawn on the projector.
- Camera disconnect/stall: ambient Reverie artwork replaces the stale feed after two seconds; reconnect attempts happen automatically. Replug the same camera or choose a different one. **Reconnect camera** restarts the isolated service.
- Permission denied: enable Camera in macOS Privacy & Security, then reconnect. A selected missing camera is not silently replaced with another.
- Missing display: windowed preview. Connecting/reconnecting displays repositions the audience window. The operator window stays separate.
- Worker errors: bounded restart backoff; expired boxes and analysis disappear. Scene errors: that module is quarantined for the current renderer session; a camera/ambient fallback fills its slot and rotation continues. A hung audience renderer is rebuilt by the independent main-process watchdog.
- The status card reports camera state, detector latency, rendered fps, effective quality, active scene, cloud state and caps. **Show log file** opens the rotating local log: two files capped at approximately 1 MiB each. No frames, prompts, tokens, keys, SDP or provider response bodies are logged.

Settings save to the application user-data directory (`.runtime` for source runs). The camera remains open while the control window is hidden. A whole application or OS crash requires an external supervisor or relaunch; internal watchdogs cannot recover a dead main process.

## Development and acceptance

```sh
npm test               # scheduler, motion, cloud gate, lifecycle and accelerated crowd stress
npm run test:smoke     # macOS desktop, mock webcam, workers, camera restart, offline cloud
npm run test:soak      # 10-minute real-time synthetic crowd run
SOAK_SECONDS=28800 npm run test:soak  # eight-hour venue rehearsal, if desired
```

Tests write synthetic screenshots and reports under ignored `test-results/`; they do not save audience camera frames. See [architecture and data contract](docs/ARCHITECTURE.md), [adding a scene](docs/ADDING_A_SCENE.md), [API verification](docs/LUCY_API.md), and [validation results](docs/VALIDATION.md), and [event operator runbook](docs/EVENT_RUNBOOK.md).

The target is smooth 30 fps at 1080p on Apple Silicon. **This is not yet a signed, venue-accepted release.** Read the measured test conditions and outstanding physical webcam/projector/crowd/provider checks before event use.

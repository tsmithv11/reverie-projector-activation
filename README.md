# Reverie Installation

A desktop audience installation for an Apple Silicon MacBook and a 4:3 or 16:9 projector. It has a separate operator console, eleven rotating worlds, offline local vision, and optional Lucy Latest robot and Ghibli animation conversion and Lucy Restyle 2 watercolor conversion through Decart. The appearance follows the four supplied references: angled pink/lavender portals, technical overlays, white robots, friendly monsters, and electric blue contours.

## Run the Mac application

The locally built app is in `release/mac-arm64/Reverie Installation.app`; its transfer ZIP is `release/Reverie-Installation-mac-arm64.zip`. It supports **Apple Silicon (M-series), including M4 Pro, on macOS 13 or later**. Open the app in Finder. No Node installation or internet is needed to run the packaged local scenes. This development build is **ad-hoc signed, not Developer ID signed or notarized**; the receiving Mac may require a per-app approval. See the transfer instructions below.

1. Connect the USB webcam and projector. In macOS Displays, use **extended display**, not mirroring. Set the projector to its native resolution, such as 1392 × 1044 (4:3) or 1920 × 1080 (16:9), ideally 60 Hz. Enable **Displays have separate Spaces** in Desktop & Dock if native full-screen output blanks the other display.
2. Open the app. Allow camera access. Select the USB camera and output in the operator window. Under **Camera & display → Display format**, choose **4:3 · 1392 × 1044**, **16:9 · widescreen**, or **Fill screen**. The fixed formats fit within the output with borders when needed; Fill screen adapts to the current window or full-screen display. Camera video is center-cropped to preserve proportions and keep tracking overlays aligned. The choice saves automatically. **High** quality renders 4:3 at exactly 1392 × 1044; Automatic may lower resolution for smoother playback.

   **LED wall reporting the wrong size:** If the controller reports a larger desktop (for example 1920 × 1600) but the visible wall is 1392 × 1044, choose **Output area → LED wall · 1392 × 1044 pixels**. This also selects 4:3 and places the entire picture at the top left; unused desktop pixels are black. **Right edge extension** defaults to **20 pixels**, widening the 4:3 picture to **1412 × 1044** to fill the remaining strip without changing its height. Set this to **0** for the original 1392 × 1044 area, or fine-tune it from 0–200 pixels. Start with **Left offset 0 / Top offset 0**. If the controller’s visible region starts farther right or down, enter that region’s left/top coordinates in pixels. The offsets are limited to keep the whole picture inside the desktop. The area stays fixed as performance quality changes and accounts for display scaling; smaller windowed previews shrink to fit. Switch back to **Fit reported screen** for a standard projector. The app does not change the controller or macOS resolution.

3. The audience window opens full screen on an external display. Without one, it opens as a window on the primary display. **Open audience display** brings it back after it has been hidden.
4. Leave quality on **Automatic** initially. Default rotation is 60 seconds per scene; choose any whole-second duration from 10–60.
5. Use **Synthetic crowd for rehearsal** to try every local effect without camera access or cloud uploads.

The app prevents display sleep while running. Keep the Mac plugged in. Closing the operator window hides it; clicking the Dock icon or pressing **O** in the audience view restores it. Use **Quit installation** or Cmd+Q to end all services.

### Move the app to another Mac

1. On the build Mac, run `npm run dist:mac` after making changes. This rebuilds the app, signs the app and its helpers with an ad-hoc signature, and creates `release/Reverie-Installation-mac-arm64.zip`. Transfer **that ZIP** by AirDrop, a USB drive, or file sharing; keeping the app inside the ZIP preserves its bundle structure and executable permissions during transfer.
2. On the receiving Mac, extract the ZIP in Finder and drag **Reverie Installation.app** into **Applications**, replacing the previous copy after quitting it.
3. Try opening the app. If macOS says the developer cannot be verified or Apple cannot check it, open **System Settings → Privacy & Security → Open Anyway**, then confirm **Open**. This is Apple's [per-app approval procedure](https://support.apple.com/en-us/102445) for an app you trust. Do not disable Gatekeeper globally. A managed Mac may need its administrator's approval.
4. Allow camera access, select the local webcam and projector, and test **Synthetic crowd for rehearsal**. Settings and API keys are not included in the ZIP. For the optional live scenes, enter the Decart key in **Live daydreams** on this Mac and enable Lucy; local scenes need no key or internet.

If **Open Anyway** returns to the “Apple could not verify” dialog for this locally built app, use the freshly rebuilt ZIP and place its app in `/Applications`. On the receiving Mac, run the following in Terminal. It first verifies the complete bundle; only if verification succeeds does it remove the download-quarantine attribute from this specific app and launch it. This is a local-development workaround, not notarization, and does not disable Gatekeeper globally.

```sh
codesign --verify --deep --strict "/Applications/Reverie Installation.app" &&
xattr -dr com.apple.quarantine "/Applications/Reverie Installation.app" &&
open "/Applications/Reverie Installation.app"
```

Use this only for the app built from this trusted project. If a command fails, retain the exact output for diagnosis; do not re-sign a damaged copy or change system-wide security settings. See Apple's [explanation of downloaded-app quarantine and notarization](https://developer.apple.com/forums/thread/813858).

An **Intel Mac cannot run this arm64 build**. If the new copy still says it is “damaged” or “can't be opened,” capture the exact message and macOS version; that is different from the normal unidentified-developer prompt. The previous build used `mac.identity: null`, which skipped bundle signing and failed strict signature verification. A ZIP alone does not repair that signature; rebuild with the current configuration.

For distribution that avoids unidentified-developer approval, use an Apple Developer Program **Developer ID Application** certificate and Apple notarization. The current local-transfer configuration deliberately sets `identity: "-"` and `notarize: false`; a production release must override both, supply notarization credentials, and verify/staple the notarization ticket. See [Electron's signing and notarization guide](https://www.electronjs.org/docs/latest/tutorial/code-signing). Ad-hoc signing checks bundle integrity but does not establish an Apple-verified publisher.

## Run from source / Linux

Use a current Node.js LTS release (22 or newer), npm, and a desktop session with camera permission. Tested here with Node 26.8.1. Initial installation requires internet; normal local operation does not.

```sh
npm ci
npx install-electron --no
npm run assets
npm start
```

`npm run assets` downloads Google's versioned EfficientDet-Lite0 and Pose Landmarker Full models and verifies their checked-in SHA-256 manifests. The build verifies both models again. Runtime WASM and weights are copied into the app. There are no CDN requests for local effects. `npm run demo` runs the synthetic crowd. `npm run pack` creates the application directory; `npm run dist:mac` creates a macOS ZIP. Build Linux on a Linux host with `npm run dist:linux`. Linux camera access uses Chromium/getUserMedia and the desktop's normal device permissions. Linux has not been hardware-tested in this delivery; see [validation](docs/VALIDATION.md).

## Decart and FAL credentials — exact location

**Put `DECART_API_KEY=your-key` in `.env` at this repository's root**, beside `package.json`. Existing `FAL_KEY` credentials are preserved but inactive for this audience setup. Blank placeholders for both are in `.env.example`; the local `.env` has a blank Decart entry ready to fill. All live scenes require direct Decart; unavailable video is skipped. FAL backup is disabled because its published realtime schema does not expose self-anchoring control and no Restyle 2 realtime endpoint has been verified. Both source runs and the app built inside this repository's `release` folder can read it. A separately installed app uses its private settings file. The local `.env` preserves any existing FAL key; `.env.example` documents the format. `.env`, `.env.*`, runtime state, logs, and build artifacts are excluded by `.gitignore`; only `.env.example` is committed. Never paste a real key into source files or a README.

Alternatively use the **Decart API key** and **FAL API key · stored, inactive** fields in **Live daydreams**. Saving or clearing one key preserves the other. For a separately installed Mac app, it is stored at:

```text
~/Library/Application Support/reverie-projector/.env
```

The operator console displays the exact path in use. An existing private settings key file takes priority over the repository file, including an explicitly cleared key. On Linux it is the application's Electron user-data directory, normally `~/.config/Reverie Installation/.env`. Key files are mode `0600`; permanent keys stay in the main process, are not returned to the operator UI, and never reach the projector. This is a private local file, **not encrypted OS keychain storage**. Saving an empty field clears that provider’s stored key. `DECART_API_KEY` and `FAL_KEY` in the launch environment can also supply credentials; restart to pick up manual file changes.

Enable **Lucy · direct Decart**, then select **Machine dreaming**, **Studio Ghibli watercolor**, **Studio Ghibli · Lucy Latest**, or **Custom restyle** in the playlist for an immediate connection. The **Live scene** selector also lets you start any live effect from the connection controls. The current camera feed streams continuously to Decart during connection setup and any live scene. Returned video continuously updates the audience canvas. All other scenes process locally. Lucy starts off on every app launch, even if it was enabled last time, and stays off until you enable it in the operator console. Once enabled, all live scenes remain available on every rotation until you turn Lucy off or quit. Rehearsal mode never uploads.

To compare the two Ghibli versions, select **Studio Ghibli watercolor** for the original Restyle 2 model or **Studio Ghibli · Lucy Latest** for the new model. The new scene is appended to the playlist with an independent Enabled checkbox. The Lucy Latest scene uses a full-scene animation prompt; improved face quality is not yet established and needs a live comparison.

**Custom restyle** uses Lucy Restyle 2 with any prompt you enter in **Live daydreams → Custom restyle prompt**. It defaults to `Cyberpunk neon anime style`. Edits save when you leave the field and update an active Custom restyle connection without restarting it or extending its duration. A blank prompt restores the default. The prompt persists between launches; Lucy still starts off each time. This scene shares the Live daydreams toggle, credentials, duration limits and playlist controls with the other live scenes.

### Lucy integration and safeguards

Direct Decart uses the official `@decartai/sdk`. Machine dreaming and Studio Ghibli · Lucy Latest select `models.realtime("lucy-latest")` (1280×720); Studio Ghibli watercolor and Custom restyle select `models.realtime("lucy-restyle-2")` (1280×704). Each temporary token is scoped to that scene’s selected model or alias. Prompt enhancement is enabled only for the new Studio Ghibli · Lucy Latest scene; existing scenes retain disabled enhancement. Machine dreaming transforms the people into robots. The original Ghibli watercolor scene uses a restrained watercolor prompt that explicitly asks to preserve identity, facial proportions, expressions, anatomy, and consistency across frames. The former cartoon scene keeps its saved playlist position and enabled state; new scenes are appended to existing playlists.

While a live scene connects or plays, the shared camera plane stays at 1280×720 regardless of projector quality. Restyle input is center-cropped to 1280×704 with uniform scaling, so faces are not squeezed. Local person detection keeps its normal resolution budget. These input and prompt changes reduce avoidable quality loss; they do not guarantee that the generative model preserves every face. Judge the result in a live rehearsal with the actual camera and lighting.

Machine dreaming and Studio Ghibli · Lucy Latest connect with `queryParams: { self_anchor: "false" }` so people entering or leaving do not remain anchored to an earlier generated frame. This is a connection setting, not a prompt field. Restyle 2 does not document this option. See [Lucy 2.5 generation stability](https://docs.platform.decart.ai/models/realtime/lucy-2.5#generation-stability), [Restyle 2 realtime](https://docs.platform.decart.ai/models/realtime/video-restyling), and [client tokens](https://docs.platform.decart.ai/getting-started/client-tokens). FAL’s [published realtime schema](https://fal.ai/models/decart/lucy-2-5/realtime/api) does not expose `self_anchor`; its [Restyle API](https://fal.ai/models/decart/lucy-restyle/api) processes uploaded videos. The app therefore uses direct Decart for all live scenes and does not silently fall back to a different model or unverified anchoring behavior.

- Connections open only when a Lucy scene's slot is due or you explicitly select it. There is no background prewarming. Viewers continue seeing the current local scene while setup completes; consecutive live scenes close the old connection before starting the next one.
- At most one provider connection at a time, one current input frame and one current output frame, with backpressure and no accumulated frame queue. No saved photograph or local robot substitute.
- A 25-second connection deadline per provider, seven-second authentication deadline and two-second video-stall watchdog stop failed connections. Normal scene exit, camera loss, hidden/restarted audience display, disabling Lucy and quitting also close the stream. The app asks the isolated service to close its peer and signaling socket before destroying its window, waiting up to four seconds for the signaling close handshake, with a five-second forced-cleanup deadline.
- Each live scene gets at most its configured playback duration (10–60 seconds), including time spent paused. Reselecting it cannot extend an existing playback deadline. Setup is limited to 25 seconds per provider; Decart also receives a 100-second server-side session backstop.
- Enabling Lucy keeps all live scenes eligible for later rotations until you disable it or quit; it does not keep a paid connection open. Successful scenes can reconnect on their next slot without cooldowns or attempt caps. Failed requests back off for 60 seconds, then wait for another scene slot or an explicit selection. Paused rotation never starts background retries. Each live appearance still uses paid service, including any billable setup; a playlist containing only Lucy scenes therefore continues using that service while it rotates.
- Unavailable, failed or stalled Lucy video: **skip the requested live scene for viewers** and show the reason, error code and connection phase in the operator console and local log. A live-only unavailable playlist uses neutral ambient artwork.
- Earlier FAL live service check on October 8 (before the direct Decart integration): 84 returned frames during ten seconds of observation, changing audience output, and successful disconnect on scene exit. Audience rendering was 30 fps. The camera faced a ceiling; person-to-robot appearance still needs a person/crowd rehearsal. Direct Decart has been verified with mocked credentials and signaling; a real-key rehearsal remains pending.
- Output screening skips invalid dimensions and near-black/flat frames without ending the connection on a brief glitch. The last usable frame stays visible for at most two seconds; fresh usable video resumes in the same session. Rejected frames never reset that deadline, and sustained unusable output still stops the stream. Scene fidelity and model latency remain provider-dependent; screening cannot verify the exact count or appearance of transformed people.

## What is real, simulated, and local?

| Scene | Processing | Meaning and limits |
|---|---|---|
| Audience / field study | Local EfficientDet-Lite0 person detection; smoothed frame difference; animated heat gradients | Boxes and detector scores come from the model. Heat is labeled **SIMULATED HEAT / ARTISTIC FIELD**, never temperature. “Frame motion” is normalized image change, not physical speed or a crowd count. |
| Machine dreaming | Live camera conversion through Lucy Latest (`lucy-latest`) / direct Decart | Returned robot video follows the current camera continuously. Unavailable results are skipped, with diagnostics only in the operator console. |
| Studio Ghibli watercolor | Lucy Restyle 2 / direct Decart | Restyles the room in gentle Ghibli watercolor, with explicit instructions to preserve faces and composition. |
| Studio Ghibli · Lucy Latest | Lucy Latest (`lucy-latest`) / direct Decart | Separate whole-scene Ghibli animation comparison using prompt enhancement and disabled self-anchoring. Original Ghibli watercolor remains unchanged. |
| Custom restyle | Lucy Restyle 2 / direct Decart | Restyles the live camera using your saved prompt; defaults to Cyberpunk neon anime style. Prompt edits update the current connection. |
| Small wonderful things | Layered pastel bay with six local frame-animated characters | The bay stays upright across the full screen; the angled pink frame clips only the characters and their effects. Outside the frame, the same monster-free landscape continues beneath a pink/blue tint. Each creature has six distinct pose drawings: the large creature waves and turns its head, the antenna creature paddles, the green creature peeks around the rock, the blue and tiny pink creatures bound/skip, and the slender pink creature leaps. Movement produces large iridescent bubbles at its camera location after a 120 ms gate. Nearby creatures wake after roughly 300–480 ms of sustained motion, follow its changing horizontal location, and scale their travel and hop height to its strength. Hops begin with a resting pose and grounded preparation, then take one smooth flight arc; stopping during preparation cancels takeoff. Airborne actions land with a splash. The slender pink jumper starts hidden underwater, leaps out on nearby motion, and rests at its landing spot between jumps. After four quiet seconds on the surface it dives underwater over 1.1 seconds; renewed motion can bring it back after the dive finishes. The other characters return home during stillness. Animation waits for the artwork to load. Characters are separate sprites, with no image deformation. All artwork is bundled locally; no cloud calls. |
| Small wonderful things · Living world | Reference-based painted characters and continuous local animation | Separate scene (`monstersLiving`); the original remains selectable and unchanged. Rebuilds the supplied composition: a smaller translucent portal left of center, misty photographic Golden Gate surround, bright painted interior, broad-headed blue creature, green rock hugger and small pink diver. Connected artwork preserves the resting shoulders and curled arms; modest head/neck and tail movement, independent blinking, breathing, hiding and jumping keep the silhouettes intact. Water has separate rolling crests, swimming wakes, surfacing rings and contact-scaled splashes. Original motion-positioned bubbles remain. Bundled artwork and local rendering; no runtime cloud calls. |
| Afterglow | Local per-person segmentation and short-lived tracking | Up to sixteen people receive translucent masks, subpixel luminous contours and stable colors with small track IDs. Body landmarks must agree with the mask, duplicate silhouettes are suppressed, and new highlights require two consecutive captures. Partial upper or lower bodies can qualify. No bounding boxes, skeletons or particles. Masks and camera pixels come from the same capture. Global matching combines predicted movement, foreground size and an in-memory clothing-color descriptor; brief occlusions retain a confirmed track for up to 1.5 seconds. Tracks reset on scene/camera/mirror changes. Distant, cropped or heavily occluded people may be missed; colors can change after long occlusion or ambiguous crossings. Bundled model/WASM, no cloud requests or saved identities. |
| An outline of us | Local Sobel edges, camera silhouette layer, cyan person boxes and artistic perspective grid | No inferred depth, distance, velocity, emotion, or identity. |
| A garden of possibility | Original botanical artwork with local motion-driven growth and stillness | Midnight garden fitted inside the shared angled portal with a pink/lavender surround, layered ferns, dormant buds and drifting pollen. No centered title or instruction text. Movement grows ground-rooted plants and gradually opens pink, lavender, and ivory flowers. A person standing still or a camera scene quiet for about 2.5 seconds brings out detailed blue, rose, and amber butterflies with independently folding wings. Each butterfly floats upward and fades over 10–16 seconds, even if movement resumes; continued stillness allows new butterflies. Continuous movement without a still person prevents new butterflies. Plants fade after 30–46 seconds. Once the outgoing scene fades away, no camera image appears in the garden or its failure fallback. The garden remains alive without camera input. |
| Words in motion | Local motion-driven typography | Repeated “Reverie 2026” text fills the angled portal on a deep purple field. Movement changes nearby letters from Reverie blue through pink to pale lavender, leaving a short, smoothly fading trail. The normal camera view remains visible outside the portal under the shared pink/lavender tint. Text stays crisp and still; no cloud processing. |

No persistent person IDs, sensitive attributes, biometric identification, audio capture, or default audience-image saving. Demo figures, boxes and Afterglow masks are **synthetic** and labeled accordingly. Crowds are treated as moving regions; severe occlusion, small distant figures and poor lighting reduce detection coverage. Motion effects and quiet-scene butterflies remain active without person detections. Missing camera or motion data stops new butterflies while existing flights finish naturally.

The original Small wonderful things and the garden render artwork at half the output dimensions. Living world uses three-quarter dimensions (1440×810 at High 16:9). Its photographic surround and painted interior are separate layers; the three reference characters and purple rock are staged within the opening. One WebGL context deforms connected character artwork with restrained head/neck, foliage and tail motion. The green creature’s near forearm shares the body’s deformation and draws over the rock, preserving the hug. A rigid painted-art fallback keeps the scene visible after context loss. The environments are never displaced. Wave geometry, contact effects, buoyancy and clipping share a surface field. New artwork and exact built-in image-generation prompts are in `assets/scenes/small-wonderful-things/reference-v4/`; earlier iteration assets remain unused by Living world.

## Operator controls and recovery

- Pick camera/output, effect intensity, quality, mirror, duration, enabled scenes and order. The last enabled scene cannot be disabled.
- Click a scene tile for immediate selection. Pause freezes the rotation timer; the local effects continue animating. All eleven scenes share the reference's tapered pink frame. The two bay versions keep the same angle; other scenes have their own fixed rotation. Living world preserves the smaller, left-of-center frame traced from its supplied composition. Each other frame is centered and enlarged proportionally to the largest size that fits, leaving a narrow buffer of 1.5% of the screen's shorter edge (about 16 pixels at 1080p). The other axis can retain more space to preserve the shape. Transitions take 1.4 seconds: the outgoing scene fades to the pink-to-blue background, then the next scene fades in.
- Projector keyboard: **O / Escape** operator controls, **F** full screen, **Space** pause/resume, **→** next, **1–9, 0** scene selection (0 selects the tenth scene). Choose later scenes from their operator tiles; live scenes also appear in the Live scene selector. No controls are drawn on the projector.
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
npm run test:living-world # continuous motion, water, camera loss and quality extremes
npm run test:living-world -- --record # save an idle / activity / settling preview
npm run test:words     # motion colors, portal, camera surround, quality and recovery
npm run test:composition # all scene frames and gradient transitions at 4:3 and 16:9
npm run test:garden    # growth, stillness, camera invisibility, quality and visual snapshots
npm run test:display   # 4:3, 16:9, fill, live resizing, overlays and saved format
node scripts/robot-provider-check.mjs --scene=customRestyle # custom prompt UI, Restyle routing and toggle
npm run test:providers # exact models, token scopes, self-anchor flag, no FAL fallback, cleanup
npm run test:cartoon   # Ghibli Restyle 2 routing, live frame handoff and time limits
npm run test:robots    # Lucy 2.5 routing, live frame handoff and connection limits
npm run test:smoke     # macOS desktop, mock webcam, workers, camera restart, offline cloud
npm run test:soak      # 10-minute real-time synthetic crowd run
SOAK_SECONDS=28800 npm run test:soak  # eight-hour venue rehearsal, if desired
```

Tests write synthetic screenshots and reports under ignored `test-results/`; they do not save audience camera frames. See [architecture and data contract](docs/ARCHITECTURE.md), [adding a scene](docs/ADDING_A_SCENE.md), [API verification](docs/LUCY_API.md), and [validation results](docs/VALIDATION.md), and [event operator runbook](docs/EVENT_RUNBOOK.md).

The target is smooth 30 fps at 1080p on Apple Silicon. **This is not yet a Developer ID signed, notarized, venue-accepted release.** Read the measured test conditions and outstanding physical webcam/projector/crowd/provider checks before event use.

### Afterglow rehearsal

Select **Afterglow** in the operator playlist. It works with Lucy disabled and without internet. The detection status switches to mask count and inference latency. Quality controls the analysis plane (384×216, 512×288, or 640×360); intensity controls mask opacity and contour glow. The display runs independently of inference and holds each matched camera/mask pair until the next result. A captured pair expires after 1.2 seconds; camera loss or model failure never produces invented people. Model failures retry locally after 30 seconds.

`npm run test:afterglow` checks both projector formats, all three analysis quality levels, real bundled-model initialization on Chromium's test camera, scene exit/re-entry and camera stalls with external HTTP blocked. To test positive detections, set `AFTERGLOW_VIDEO` to a local Y4M clip containing two clearly visible people, or set `AFTERGLOW_EXPECTED_PEOPLE` to the exact count in another fixed-count fixture (0–16). It checks the exact count to catch extra highlights as well as missed people. The script saves test-only screenshots and a report under `test-results/`; normal operation saves no camera frames. The built-in rehearsal uses four explicitly labeled synthetic masks, not model inference. The sixteen-person limit is capacity, not a measured guarantee of crowd recall; new-track confirmation adds one inference interval before a highlight appears. Venue lighting, distance and occlusion still need rehearsal.

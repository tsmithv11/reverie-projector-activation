# Validation report — October 7, 2026

This is a runnable first build, not a completed venue acceptance test. All five local scenes, controls and recovery paths are implemented. Lucy's frozen-frame WebRTC adapter is implemented against verified FAL documentation, but a successful paid transformation has not been exercised.

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

- **Lucy output:** no real key supplied; no successful FAL/Decart generation or billing behavior validated. Verify at least one real transformation and failure case before relying on the cloud scene. The local robot still is a working fallback, not a claim of generated output.
- **Detection:** a lightweight 320×320-input COCO detector with at most 24 displayed boxes. It can miss small, dark, occluded or partial people and misclassify robot-like figures. There is no ground-truth crowd accuracy measurement. Group motion effects continue without detections; butterflies need occupied regions.
- **Hardware:** no physical USB reconnect, camera permission-denial dialog, projector cable reconnect, actual projector, real dense crowd, older M-series MacBook, Intel MacBook or Linux hardware qualification. Those paths have code and selected simulated tests; they are not physically certified.
- **Duration:** short real-time endurance runs plus accelerated logic tests do not prove multi-hour reliability. Run an eight-hour rehearsal on the venue hardware with the actual camera, projector, lighting and audience geometry.
- **Artwork:** local creatures/growth are original vector cartoon effects, with camera stylization, not Lucy-like per-pixel generative video. No placeholder scene modules are shipped. The line effect is a local edge map, not 3D reconstruction. Supplied images guided colors, frames and character style.
- **Distribution:** the macOS ARM64 bundle runs locally but is unsigned/not notarized and uses the default Electron app icon. Source supports Linux with setup/build commands; no Linux binary was tested or delivered.
- **Supervision:** internal renderer/worker recovery does not restart a dead main process, crashed OS, disconnected power, or failed projector. An event deployment should arrange an external relaunch/supervision policy.

Use [the event runbook](EVENT_RUNBOOK.md) for the physical acceptance pass. Do not enable a scene you have not checked on the actual installation.

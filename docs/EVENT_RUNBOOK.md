# Event operator runbook

## Before doors

1. Connect AC power, the external USB webcam and projector; secure cables. Set macOS/Linux to extend the desktop and select 1920×1080 output. Avoid placing the camera where it sees its own projection, which creates feedback motion.
2. Open Reverie. Choose the USB webcam by its actual label. Check the private preview for the full audience area, exposure and recognizable near/far silhouettes. Avoid auto-exposure pumping where the camera permits a fixed setting. No camera-control driver changes are made by the app.
3. Select the projector, show the audience window and enable full screen. Check from the back of the room. The separate console must remain on the laptop display. Adjust projector overscan if edges are missing.
4. Start with Automatic quality and 60-second scenes. Rehearse moving groups, overlaps, partial people at edges, entering/leaving and a still group. Detection is approximate; bubbles and growth should respond even when boxes miss an occluded person.
5. If using Lucy, save the FAL key in the console or private `.env`, enable it and select a sensible interval/cap. Run one real generation before doors. Check that the output is usable; background/pose preservation is model-dependent. Let the ordinary schedule prepare the next generation. A short duration may produce the first robot fallback before a cloud still is ready.
6. Disconnect/reconnect the USB camera and projector once. Verify return to live output. Turn off network access and check that local scenes continue. Verify O, F, Space and next-scene controls.
7. Run a long rehearsal on the actual event machine. Record render fps, memory trend, heat, camera stability and projector behavior. A ten-minute desktop test is not an hours-long venue qualification.

## During operation

The console status card shows camera health, render rate, detector latency, active scene, current quality and robot state. A synthetic-crowd label means rehearsal mode is still enabled. Disable it for the audience.

If output becomes slow, choose Balanced or Low and reduce intensity. Automatic mode reduces quality after sustained low frame rate. If the camera is unavailable, the audience sees animated Reverie artwork and the console provides the reason. Replug the same webcam; use Reconnect camera if needed. Selecting another device is deliberate, not automatic.

If the robot scene says LOCAL ROBOT STUDY, generation was unavailable or is not enabled. Other scenes continue normally. Check credentials/network and the session cap. Do not repeatedly relaunch or lower intervals to work around a provider failure. Capped attempt history persists for one hour; restarting clears the session counter only.

To stop a troublesome scene, clear its Enabled checkbox. The application always keeps at least one scene enabled. To hold a scene, select it then pause rotation. Effects continue moving while paused; the robot remains a still.

## End of event

Choose Quit installation or Cmd+Q. This stops the webcam and any robot connection and releases display-sleep prevention. Generated and captured images are discarded with process memory. The application retains settings, the private credential file, budget timestamps and bounded logs. If using a borrowed machine, clear the credential in the console before quitting.

## Remaining external responsibilities

Use an appropriate audience notice for the camera experience and the optional FAL/Decart upload. The app does not provide an audience-consent workflow or control provider-side retention. OS login startup, automatic relaunch after an OS/main-process crash, projector power control and hardware watchdogs are outside this version.

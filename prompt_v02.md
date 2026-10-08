Design and build a reliable, interactive camera installation for a public event. A live view of the audience will be transformed into rotating visual scenes and projected onto a large screen.

The first release must run on a MacBook or Linux box with an external USB webcam and an external projector or display.

## Experience

- Run the audience experience full screen on the external display, with controls not shown but available.
- Rotate automatically through enabled scenes. Default duration: 60 seconds per scene. Allow durations from 10–60 seconds in settings.
- Use smooth transitions and maintain a consistent visual composition across scenes.
- Design for a crowded space with many people moving simultaneously, including overlapping bodies, partial visibility, changing light, and people entering or leaving.
- Favor group motion and visual responsiveness over precise identification or persistent tracking of every individual.
- Make the experience readable from a distance, visually engaging, and responsive without requiring instructions.

I will provide four reference images. Treat them as visual direction for the corresponding scenes below.

## Scenes

### 1. Audience detection and simulated heatmap
Use reference image 1, the boat image, as visual direction.

Show the live camera feed with bounding boxes around people and an animated, simulated heatmap. Create a convincing technical visualization using local processing.

The heatmap is an artistic effect, not thermal measurement. Any displayed metrics should be clearly fictional or based on actual, supported measurements. Do not infer sensitive personal attributes.

### 2. Robot audience
Use reference image 2 as visual direction.

Capture a still frame of the audience and transform the people into robots using Lucy 2.5 through FAL. Give me a location for me to provide the API key and include that location in the README and secure it by adding it to gitignore. Preserve the composition and background as closely as the model allows. Display the result as a static scene.

Verify the exact model endpoint and supported parameters before implementing the integration. Keep credentials out of source control and audience-facing output.

Generate asynchronously ahead of the scene’s scheduled appearance. Never block rendering or scene rotation while waiting for the API. Define bounded timeouts, limited retries, and a visually coherent fallback for missing credentials, network failure, slow responses, or unusable results. Avoid duplicate requests and uncontrolled API spending.

### 3. Monsters and bubbles
Use reference image 3 as visual direction.

Transform the live camera view into a cartoonish world populated by monsters. Audience movement produces bubbles, and animated monsters chase and pop them.

Run entirely locally (if possible on a Macbook). Use lightweight stylization, sprites, and motion analysis rather than cloud generation. Limit bubbles and characters so heavy crowd activity remains smooth.

### 4. Lines and bounding boxes
Use reference image 4 as visual direction.

Transform the live audience view into a stylized line or contour rendering with bounding boxes. Preserve recognizable silhouettes and movement while creating the reference image’s visual character.

Run entirely locally.

### 5. Living garden
Audience movement causes vines, flowers, and mushrooms to grow. When people become relatively still, butterflies gather around their positions.

Run entirely locally. Use forgiving motion thresholds and temporal smoothing so small tracking fluctuations do not interrupt the effect. Let growth gradually fade or reset to prevent visual clutter during continuous operation. Try to use color schemes from reveriesummit.com

## Reliability and performance

Treat this as an unattended event installation that must operate for hours.

- Separate camera capture, motion analysis, rendering, scene scheduling, and cloud requests so a failure in one does not freeze the entire installation.
- Recover automatically from webcam disconnection and reconnection.
- Handle unavailable camera permissions, missing displays, network outages, and scene errors with useful operator messages and graceful audience-facing fallbacks.
- Keep local scenes fully functional without internet access.
- Bound particle counts, tracking workload, request queues, and memory usage.
- Target smooth 30 fps output on the agreed MacBook hardware. Adapt processing resolution and effect complexity when performance drops.
- Use one shared camera and analysis pipeline across scenes.
- Provide logs and a simple operator status view showing camera health, rendering performance, active scene, and cloud request state.
- Process camera frames locally except for explicitly required robot-generation uploads. Do not save audience images by default.

## Operator controls

Provide a straightforward settings interface for:

- Camera and output-display selection
- Scene duration, order, and enable/disable toggles
- Manual scene selection and pause/resume rotation
- Full-screen operation
- Effect intensity and performance quality
- FAL credentials and robot-generation frequency
- Camera preview and installation health

## Extensibility

Use a modular scene interface with clear lifecycle methods for initialization, activation, update, rendering, deactivation, and cleanup. Scenes should receive shared camera frames and analysis data through a documented contract.

Adding a scene should require implementing a new module and registering it, without rewriting the scheduler or camera pipeline. Clean up scene resources reliably and isolate scene failures.

## Deliverables and acceptance

Begin by proposing the architecture, stack, and important assumptions. Explain which effects use real detection, motion analysis, or artistic simulation. Identify any hardware or reference-image details that materially affect implementation.

Then deliver a runnable macOS application, setup instructions, operator instructions, and a documented example for adding another scene.

Validate sustained operation, crowded movement, scene transitions, camera reconnection, offline use, and API failure. Report the hardware tested, measured performance, and remaining limitations. Distinguish working functionality from placeholders, and ensure one scene’s failure does not stop the installation.
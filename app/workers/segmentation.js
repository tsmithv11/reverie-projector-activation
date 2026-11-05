import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PersonTracker, MAX_PEOPLE } from '../core/person-tracker.js';
import { composePersonMasks } from '../core/person-masks.js';
import { describePose, selectPersonCandidates } from '../core/person-candidates.js';

let model;
const tracker = new PersonTracker();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      model = await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('../wasm'), {
        baseOptions: { modelAssetPath: '../models/pose_landmarker_full.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: MAX_PEOPLE, outputSegmentationMasks: true,
        minPoseDetectionConfidence: .45, minPosePresenceConfidence: .5, minTrackingConfidence: .5
      });
      self.postMessage({ ready: true }); return;
    }
    const start = performance.now(), { pixels, width, height } = data;
    let output;
    // The callback owns masks only for its duration. Copy/process them here;
    // MediaPipe releases its native masks as soon as this callback returns.
    model.detectForVideo(new ImageData(pixels, width, height), data.time, result => {
      const candidates = [];
      for (let i = 0; i < Math.min(MAX_PEOPLE, result.segmentationMasks?.length || 0); i++) {
        const source = result.segmentationMasks[i];
        if (source.width !== width || source.height !== height) throw Error('Unexpected mask size');
        const mask = source.getAsFloat32Array();
        const landmarks = result.landmarks[i];
        const description = describePose(mask, pixels, width, height, landmarks);
        if (description) candidates.push({ mask, landmarks, description });
      }
      const selected = selectPersonCandidates(candidates, width, height);
      const tracks = tracker.update(selected.map(p => p.description), data.time);
      const masks = [], confirmed = [];
      tracks.forEach((track, i) => {
        if (track.confirmed) { masks.push(selected[i].mask); confirmed.push(track); }
      });
      output = composePersonMasks(masks, confirmed, width, height);
    });
    self.postMessage({ ...output, pixels, width, height, at: data.at, ms: performance.now() - start }, [pixels.buffer, output.fill.buffer, ...output.instances.map(p => p.contour.buffer)]);
  } catch { self.postMessage({ error: true }); }
};
